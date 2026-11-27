/**
 * Phase 5 pipelines.
 *  - design_carousel: approved (or chosen) carousel narrative → slides, via the visual director.
 *  - revise_slide: rewrite one slide with the owner's instruction; every other slide is copied.
 * Rendering and export happen in the web app (next/og), not here: they need no model.
 */
import * as svc from "@contentos/database/service";
import { buildDesignRequest, buildSlideRevisionRequest, SLIDE_REVISER, templateHash, VISUAL_DIRECTOR } from "@contentos/intelligence";
import { CAROUSEL_TEMPLATES, CarouselSlides, fromModelSlide, toDesignSlides, type DraftBody, type UserSettings } from "@contentos/schemas";
import { z } from "zod";
import { complete, loadAndStart, NonRetryableJobError, promptTemplateId, runStep, stableHash, type PipelineDeps, type RunOptions } from "./pipeline";

function budgets(settings: UserSettings, job: svc.JobRecord) {
  return {
    dailyUsd: settings.budget_daily_usd,
    monthlyUsd: settings.budget_monthly_usd,
    projectUsd: settings.budget_text_project_usd,
    jobUsd: job.budget_limit_usd,
  };
}

const DesignInput = z.object({
  asset_id: z.uuid(),
  version: z.number().int().positive().optional(),
  template: z.enum(CAROUSEL_TEMPLATES).optional(),
  nonce: z.string().optional(),
});

export async function runDesignCarousel(deps: PipelineDeps, jobId: string, opts: RunOptions): Promise<void> {
  const job = await loadAndStart(deps, jobId, "design_carousel");
  if (!job) return;
  const input = DesignInput.safeParse(job.input);
  if (!input.success) throw new NonRetryableJobError("VALIDATION_FAILED", "Job input is invalid.");
  const userId = job.user_id;
  const asset = await svc.loadAsset(deps.db, userId, input.data.asset_id);
  if (asset.format !== "carousel") throw new NonRetryableJobError("VALIDATION_FAILED", "Only carousel narratives can be designed.");
  const narrative = await svc.loadNarrativeVersion(deps.db, userId, asset.id, input.data.version);
  const body = narrative.body as DraftBody;
  if (!Array.isArray(body?.sections) || body.sections.length < 2) throw new NonRetryableJobError("VALIDATION_FAILED", "The carousel narrative is empty.");
  const project = await svc.loadProject(deps.db, userId, asset.project_id);
  const brand = await svc.loadBrand(deps.db, userId, project.brand_id);
  const settings = await svc.loadSettings(deps.db, userId);

  await svc.updateJob(deps.db, job, { progress: 20, current_step: "designing" });
  const inputHash = stableHash({ a: asset.id, v: narrative.version, t: input.data.template ?? null, p: templateHash(VISUAL_DIRECTOR), b: brand.updated_at });
  await runStep(deps, job, opts, { name: "design", position: 1, inputHash }, async (stepId) => {
    const templateId = await promptTemplateId(deps.db, userId, VISUAL_DIRECTOR, "Design a carousel");
    const result = await deps.controller.generate(
      buildDesignRequest(brand, { narrative: body, template: input.data.template ?? null }),
      { userId, projectId: project.id, jobId: job.id, stepId, promptTemplateId: templateId },
      budgets(settings, job),
      settings.model_routes.visual_direction,
    );
    const slides = CarouselSlides.safeParse(toDesignSlides(result.output));
    if (!slides.success) throw new NonRetryableJobError("INVALID_OUTPUT", "The design came back with too few slides. Try again.");
    const template = input.data.template ?? result.output.template;
    const changes = result.output.word_changes.filter((w) => w.trim());
    const saved = await svc.addDesign(deps.db, {
      assetId: asset.id,
      sourceVersion: narrative.version,
      template,
      slides: slides.data,
      createdBy: "ai",
      changeNote: changes.length ? `Designed from narrative v${narrative.version}. Word changes: ${changes.join("; ")}`.slice(0, 1000) : `Designed from narrative v${narrative.version}`,
      model: result.model,
      promptTemplateId: templateId,
      jobId: job.id,
    });
    return { output: { design_id: saved.id, version: saved.version }, cost: result.costUsd };
  });
  await complete(deps, job);
}

const ReviseInput = z.object({
  design_id: z.uuid(),
  slide: z.string().regex(/^d\d{1,2}$/),
  instruction: z.string().min(3).max(1000),
  nonce: z.string().optional(),
});

export async function runReviseSlide(deps: PipelineDeps, jobId: string, opts: RunOptions): Promise<void> {
  const job = await loadAndStart(deps, jobId, "revise_slide");
  if (!job) return;
  const input = ReviseInput.safeParse(job.input);
  if (!input.success) throw new NonRetryableJobError("VALIDATION_FAILED", "Job input is invalid.");
  const userId = job.user_id;
  const design = await svc.loadDesign(deps.db, userId, input.data.design_id);
  const slides = CarouselSlides.safeParse(design.slides);
  if (!slides.success) throw new NonRetryableJobError("VALIDATION_FAILED", "This design cannot be revised.");
  const index = slides.data.findIndex((s) => s.id === input.data.slide);
  if (index < 0) throw new NonRetryableJobError("VALIDATION_FAILED", `Slide ${input.data.slide} is not in this design.`);
  const asset = await svc.loadAsset(deps.db, userId, design.asset_id);
  const project = await svc.loadProject(deps.db, userId, asset.project_id);
  const brand = await svc.loadBrand(deps.db, userId, project.brand_id);
  const settings = await svc.loadSettings(deps.db, userId);

  await svc.updateJob(deps.db, job, { progress: 30, current_step: "revising_slide" });
  const inputHash = stableHash({ d: design.id, s: input.data.slide, i: input.data.instruction, t: templateHash(SLIDE_REVISER) });
  await runStep(deps, job, opts, { name: "revise_slide", position: 1, inputHash }, async (stepId) => {
    const templateId = await promptTemplateId(deps.db, userId, SLIDE_REVISER, "Revise one carousel slide");
    const result = await deps.controller.generate(
      buildSlideRevisionRequest(brand, { template: design.template, slides: slides.data, slideId: input.data.slide, instruction: input.data.instruction }),
      { userId, projectId: project.id, jobId: job.id, stepId, promptTemplateId: templateId },
      budgets(settings, job),
      settings.model_routes.slide_revision,
    );
    const { note, ...out } = result.output;
    const original = slides.data[index]!;
    let revised = fromModelSlide(out, original.id);
    // Cover and closing belong to the first and last positions only, and those positions keep them.
    const last = slides.data.length - 1;
    const misplaced =
      (index === 0 && revised.layout !== "cover") ||
      (index === last && revised.layout !== "closing") ||
      (index !== 0 && revised.layout === "cover") ||
      (index !== last && revised.layout === "closing");
    if (misplaced) revised = { ...revised, layout: original.layout };
    // Keep an uploaded screenshot unless the layout no longer uses one.
    if (revised.layout === "screenshot" && original.visual.type === "screenshot") revised = { ...revised, visual: original.visual };
    const next = slides.data.map((s, i) => (i === index ? revised : s));
    const saved = await svc.addDesign(deps.db, {
      assetId: design.asset_id,
      sourceVersion: design.source_version,
      template: design.template,
      slides: next,
      createdBy: "ai",
      changeNote: `${original.id}: ${note}`.slice(0, 500),
      model: result.model,
      promptTemplateId: templateId,
      jobId: job.id,
      parentVersion: design.version,
    });
    return { output: { design_id: saved.id, version: saved.version }, cost: result.costUsd };
  });
  await complete(deps, job);
}
