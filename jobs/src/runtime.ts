import { ScrapeCreatorsClient } from "@contentos/research-engine";
import * as svc from "@contentos/database/service";
import type { ServiceClient } from "@contentos/database/service";
import { AnthropicProvider, UsageController, type UsageRecord, type UsageStore } from "@contentos/provider-gateway";
import { logger as baseLogger } from "@contentos/shared";
import { z } from "zod";
import type { PipelineDeps } from "./pipeline";

/** Worker secrets are server-side environment variables; never in the browser or the repo. */
const WorkerEnv = z.object({
  // On Vercel (inline runner) the public URL variable is reused.
  SUPABASE_URL: z.string().trim().pipe(z.url()),
  SUPABASE_SERVICE_ROLE_KEY: z.string().trim().min(1),
  ANTHROPIC_API_KEY: z.string().trim().min(1),
});

/** Ledger and spend queries backed by Supabase. */
export class SupabaseUsageStore implements UsageStore {
  constructor(private readonly db: ServiceClient) {}

  spend(filter: { userId: string; since?: Date; projectId?: string; jobId?: string }): Promise<number> {
    return svc.sumSpend(this.db, filter);
  }

  record(r: UsageRecord): Promise<void> {
    return svc.insertUsage(this.db, {
      user_id: r.userId,
      project_id: r.projectId,
      job_id: r.jobId,
      step_id: r.stepId,
      prompt_template_id: r.promptTemplateId,
      provider: r.provider,
      model: r.model,
      task_type: r.taskType,
      input_tokens: r.usage ? r.usage.inputTokens + r.usage.cacheReadTokens + r.usage.cacheWriteTokens : null,
      output_tokens: r.usage?.outputTokens ?? null,
      estimated_cost: r.estimatedCost,
      actual_cost: r.actualCost,
      duration_ms: r.durationMs,
      retry_count: r.retryCount,
      status: r.status,
      error_code: r.errorCode,
    });
  }
}

/**
 * Detect the most common setup mistake: the publishable/anon key pasted where the secret
 * (service_role) key belongs. It would otherwise surface as Postgres 42501 "permission denied".
 * Returns a sentence describing the problem, or null if the key looks right.
 */
export function serviceKeyProblem(key: string): string | null {
  if (key.startsWith("sb_publishable_")) {
    return "SUPABASE_SERVICE_ROLE_KEY is the publishable key; use the secret key (starts with sb_secret_)";
  }
  if (key.startsWith("sb_secret_")) return null;
  const parts = key.split(".");
  if (parts.length === 3) {
    try {
      const role = (JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as { role?: string }).role;
      if (role && role !== "service_role") {
        return `SUPABASE_SERVICE_ROLE_KEY is the ${role} key; use the service_role (secret) key`;
      }
    } catch {
      // Not a JWT we can read; let the database decide.
    }
  }
  return null;
}

let cached: PipelineDeps | undefined;

export function pipelineDeps(): PipelineDeps {
  if (cached) return cached;
  const parsed = WorkerEnv.safeParse({
    ...process.env,
    SUPABASE_URL: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((i) => String(i.path[0])))];
    throw new Error(
      `Worker environment is missing or invalid: ${names.join(", ")} ${names.length > 1 ? "are" : "is"} missing or invalid. Set it in the job runner's environment (Vercel or Trigger.dev).`,
    );
  }
  const keyProblem = serviceKeyProblem(parsed.data.SUPABASE_SERVICE_ROLE_KEY);
  if (keyProblem) {
    throw new Error(`Worker environment is missing or invalid: ${keyProblem}. Set it in the job runner's environment (Vercel or Trigger.dev).`);
  }
  const db = svc.createServiceClient(parsed.data.SUPABASE_URL, parsed.data.SUPABASE_SERVICE_ROLE_KEY);
  const logger = baseLogger.child({ component: "jobs" });
  cached = {
    db,
    logger,
    controller: new UsageController({ providers: [new AnthropicProvider()], store: new SupabaseUsageStore(db), logger }),
  };
  return cached;
}

/** ScrapeCreators client factory; the key is read server-side only, at run time. */
export function researchDeps(): { scrapeCreators: () => ScrapeCreatorsClient } {
  return {
    scrapeCreators: () => new ScrapeCreatorsClient({ apiKey: (process.env.SCRAPECREATORS_API_KEY ?? "").trim() }),
  };
}
