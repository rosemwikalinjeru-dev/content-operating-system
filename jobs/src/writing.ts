/**
 * Phase 3 pipelines.
 *  - write_content: approved brief → one draft per format, writers in parallel, one step each.
 *    A format whose inputs are unchanged (same brief version, prompt, brand and knowledge) is
 *    not written again unless the owner forces it.
 *  - revise_section: rewrite one section of one version, copying every other section.
 */
import * as svc from "@contentos/database/service";
import {
  buildRevisionRequest,
  buildWriterRequest,
  FORMAT_WRITERS,
  SECTION_REVISER,
  templateHash,
} from "@contentos/intelligence";
import {
  ContentFormat,
  FORMAT_ASSET,
  formatFromAsset,
  MasterBrief,
  refreshBody,
  toDraftBody,
  type DraftBody,
  type UserSettings,
} from "@contentos/schemas";
import { z } from "zod";
import { complete, loadAndStart, NonRetryableJobError, promptTemplateId, runStep, stableHash, type PipelineDeps, type RunOptions } from "./pipeline";

const WriteInput = z.object({
  project_id: z.uuid(),
  brief_id: z.uuid(),
  formats: z.array(ContentFormat).min(1).max(4),
  force: z.boolean().default(false),
  nonce: z.string().optional(),
});

function budgets(settings: UserSettings, job: svc.JobRecord) {
  return {
    dailyUsd: settings.budget_daily_usd,
    monthlyUsd: settings.budget_monthly_usd,
    projectUsd: settings.budget_text_project_usd,
    jobUsd: job.budget_limit_usd,
  };
}

export async function runWriteContent(deps: PipelineDeps, jobId: string, opts: RunOptions): Promise<void> {
  const job = await loadAndStart(deps, jobId, "write_content");
  if (!job) return;
  const input = WriteInput.safeParse(job.input);
  if (!input.success) throw new NonRetryableJobError("VALIDATION_FAILED", "Job input is invalid.");
  const userId = job.user_id;

  const briefRow = await svc.loadBrief(deps.db, userId, input.data.brief_id);
  if (briefRow.project_id !== input.data.project_id) throw new NonRetryableJobError("VALIDATION_FAILED", "Brief does not belong to this project.");
  if (briefRow.approval_status !== "approved") throw new NonRetryableJobError("CONFLICT", "Approve the brief before writing.");
  const brief = MasterBrief.safeParse(briefRow.brief);
  if (!brief.success) throw new NonRetryableJobError("VALIDATION_FAILED", "The approved brief could not be read.");
  const project = await svc.loadProject(deps.db, userId, input.data.project_id);
  const brand = await svc.loadBrand(deps.db, userId, project.brand_id);
  const settings = await svc.loadSettings(deps.db, userId);

  await svc.updateJob(deps.db, job, { progress: 10, current_step: "retrieving_knowledge" });
  const examples = await svc.loadVoiceExamples(deps.db, userId, brand.id);
  const related = await svc.searchKnowledge(
    deps.db,
    userId,
    brand.id,
    `${brief.data.single_point ?? ""} ${brief.data.core_argument} ${brief.data.problem}`,
  );
  await svc.markProjectInProduction(deps.db, userId, project.id);

  await svc.updateJob(deps.db, job, { progress: 20, current_step: "writing_formats" });
  let done = 0;
  const formats = input.data.formats;
  const results = await Promise.allSettled(
    formats.map(async (format, i) => {
      const writer = FORMAT_WRITERS[format];
      const asset = FORMAT_ASSET[format];
      const inputHash = stableHash({
        brief: briefRow.id,
        briefVersion: briefRow.version,
        format,
        template: templateHash(writer),
        brand: brand.updated_at,
        examples: examples.map((e) => e.id),
        related: related.map((k) => k.id),
        force: input.data.force ? job.id : null,
      });
      return runStep(deps, job, opts, { name: `write_${format}`, position: i + 1, inputHash }, async (stepId) => {
        const assetId = await svc.ensureAsset(deps.db, userId, {
          projectId: project.id,
          briefId: briefRow.id,
          platform: asset.platform,
          format: asset.format,
          title: `${asset.label}: ${project.title}`.slice(0, 200),
        });
        // Do not regenerate unchanged assets.
        const existing = await svc.versionByInputHash(deps.db, userId, assetId, inputHash);
        if (existing) {
          return { output: { asset_id: assetId, version: existing.version, reused: true }, cost: 0 };
        }
        const templateId = await promptTemplateId(deps.db, userId, writer, `Write a ${asset.label}`);
        const request = buildWriterRequest({ brand, examples, related }, { format, brief: brief.data });
        const result = await deps.controller.generate(
          request,
          { userId, projectId: project.id, jobId: job.id, stepId, promptTemplateId: templateId },
          budgets(settings, job),
          settings.model_routes.format_writing,
        );
        const body = toDraftBody(format, result.output);
        const saved = await svc.addVersion(deps.db, {
          assetId,
          body,
          createdBy: "ai",
          changeNote: `Written from brief v${briefRow.version}`,
          model: result.model,
          provider: result.provider,
          promptTemplateId: templateId,
          jobId: job.id,
          inputHash,
        });
        await svc.updateJob(deps.db, job, { progress: 20 + Math.round((++done / formats.length) * 75) });
        return { output: { asset_id: assetId, version: saved.version, reused: false }, cost: result.costUsd };
      });
    }),
  );
  const failures = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failures.length) {
    // Prefer a non-retryable failure (budget, invalid input) so the runner does not retry it.
    const hard = failures.find((f) => f.reason instanceof NonRetryableJobError);
    throw (hard ?? failures[0]!).reason;
  }
  await complete(deps, job);
}

const ReviseInput = z.object({
  asset_id: z.uuid(),
  version: z.number().int().positive(),
  section: z.string().regex(/^s\d{1,2}$/),
  instruction: z.string().min(3).max(1000),
  nonce: z.string().optional(),
});

export async function runReviseSection(deps: PipelineDeps, jobId: string, opts: RunOptions): Promise<void> {
  const job = await loadAndStart(deps, jobId, "revise_section");
  if (!job) return;
  const input = ReviseInput.safeParse(job.input);
  if (!input.success) throw new NonRetryableJobError("VALIDATION_FAILED", "Job input is invalid.");
  const userId = job.user_id;
  const { asset_id, version, section, instruction } = input.data;

  const asset = await svc.loadAsset(deps.db, userId, asset_id);
  const format = formatFromAsset(asset.platform, asset.format);
  if (!format) throw new NonRetryableJobError("VALIDATION_FAILED", "This content type cannot be revised here.");
  const base = await svc.loadVersion(deps.db, userId, asset_id, version);
  const body = base.body as DraftBody;
  const target = body.sections?.find((s) => s.key === section);
  if (!target) throw new NonRetryableJobError("VALIDATION_FAILED", `Section ${section} is not in version ${version}.`);
  const project = await svc.loadProject(deps.db, userId, asset.project_id);
  const brand = await svc.loadBrand(deps.db, userId, project.brand_id);
  const settings = await svc.loadSettings(deps.db, userId);
  const examples = await svc.loadVoiceExamples(deps.db, userId, brand.id);

  await svc.updateJob(deps.db, job, { progress: 30, current_step: "revising" });
  const inputHash = stableHash({ base: base.id, section, instruction, template: templateHash(SECTION_REVISER) });
  await runStep(deps, job, opts, { name: "revise", position: 1, inputHash }, async (stepId) => {
    const templateId = await promptTemplateId(deps.db, userId, SECTION_REVISER, "Revise one section");
    const result = await deps.controller.generate(
      buildRevisionRequest({ brand, examples }, { body, sectionKey: section, instruction }),
      { userId, projectId: project.id, jobId: job.id, stepId, promptTemplateId: templateId },
      budgets(settings, job),
      settings.model_routes.section_revision,
    );
    const r = result.output;
    const sections = body.sections.map((s) =>
      s.key === section
        ? {
            ...s,
            text: r.text.trim(),
            headline: s.headline !== null || r.headline ? r.headline?.trim() || null : null,
            on_screen: s.on_screen !== null || r.on_screen ? r.on_screen?.trim() || null : null,
            broll: s.broll !== null || r.broll ? r.broll?.trim() || null : null,
          }
        : s,
    );
    const saved = await svc.addVersion(deps.db, {
      assetId: asset_id,
      body: refreshBody(body, sections),
      createdBy: "ai",
      changeNote: `${section}: ${r.note}`.slice(0, 500),
      model: result.model,
      provider: result.provider,
      promptTemplateId: templateId,
      jobId: job.id,
      inputHash,
      parentVersion: version,
      revisedSection: section,
    });
    return { output: { asset_id, version: saved.version }, cost: result.costUsd };
  });
  await complete(deps, job);
}
