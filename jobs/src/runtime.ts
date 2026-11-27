import * as svc from "@contentos/database/service";
import type { ServiceClient } from "@contentos/database/service";
import { AnthropicProvider, UsageController, type UsageRecord, type UsageStore } from "@contentos/provider-gateway";
import { logger as baseLogger } from "@contentos/shared";
import { z } from "zod";
import type { PipelineDeps } from "./pipeline";

/** Worker secrets live in the Trigger.dev environment, never in the web app or the repo. */
const WorkerEnv = z.object({
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

let cached: PipelineDeps | undefined;

export function pipelineDeps(): PipelineDeps {
  if (cached) return cached;
  const parsed = WorkerEnv.safeParse(process.env);
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((i) => String(i.path[0])))].join(", ");
    throw new Error(`Worker environment is missing or invalid: ${names}. Set them in Trigger.dev → Environment Variables.`);
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
