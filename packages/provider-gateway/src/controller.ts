import { AppError, logger as defaultLogger, type Logger } from "@contentos/shared";
import { ProviderError } from "./errors";
import { costOf, estimateTokens, priceFor } from "./pricing";
import { ALLOWED_MODELS, DEFAULT_ROUTES } from "./routing";
import type { GenerateRequest, GenerateResult, LLMProvider, ModelRoute, TaskType, TokenUsage } from "./types";

/** Who and what a call is for. Every usage row is traceable to these. */
export interface UsageContext {
  userId: string;
  projectId?: string | null;
  jobId?: string | null;
  stepId?: string | null;
  promptTemplateId?: string | null;
}

/** Spending limits in USD. `null`/undefined means no limit at that scope. */
export interface BudgetLimits {
  dailyUsd: number;
  monthlyUsd: number;
  projectUsd?: number | null;
  jobUsd?: number | null;
}

export interface SpendFilter {
  userId: string;
  since?: Date;
  projectId?: string;
  jobId?: string;
}

export interface UsageRecord {
  userId: string;
  projectId: string | null;
  jobId: string | null;
  stepId: string | null;
  promptTemplateId: string | null;
  provider: string;
  model: string;
  taskType: TaskType;
  usage: TokenUsage | null;
  estimatedCost: number;
  actualCost: number | null;
  durationMs: number | null;
  retryCount: number;
  status: "success" | "error" | "blocked_budget";
  errorCode: string | null;
}

/** Persistence for the ledger and spend queries (Supabase in production, memory in tests). */
export interface UsageStore {
  spend(filter: SpendFilter): Promise<number>;
  record(row: UsageRecord): Promise<void>;
}

export interface ControllerOptions {
  providers: LLMProvider[];
  store: UsageStore;
  routes?: Partial<Record<TaskType, ModelRoute>>;
  /** Extra attempts after schema-invalid output. Transport retries are the SDK's job. */
  invalidOutputRetries?: number;
  now?: () => Date;
  logger?: Logger;
}

export interface BudgetExceededDetails {
  scope: "daily" | "monthly" | "project" | "job";
  limitUsd: number;
  spentUsd: number;
  estimatedUsd: number;
}

type RecordFields = Pick<
  UsageRecord,
  "status" | "usage" | "model" | "estimatedCost" | "actualCost" | "durationMs" | "retryCount" | "errorCode"
>;

/**
 * The AI Usage Controller. All model calls go through `generate`, which:
 *   1. resolves the route for the task,
 *   2. estimates the cost and refuses the call if any budget would be exceeded,
 *   3. calls the provider, retrying once on schema-invalid output,
 *   4. writes a ledger row for every attempt (success, error, or blocked).
 * Callers cannot bypass budgets: there is no other path to a provider.
 */
export class UsageController {
  private readonly providers: Map<string, LLMProvider>;
  private readonly store: UsageStore;
  private readonly routes: Record<TaskType, ModelRoute>;
  private readonly invalidOutputRetries: number;
  private readonly now: () => Date;
  private readonly log: Logger;

  constructor(opts: ControllerOptions) {
    this.providers = new Map(opts.providers.map((p) => [p.id, p]));
    this.store = opts.store;
    this.routes = { ...DEFAULT_ROUTES, ...opts.routes };
    this.invalidOutputRetries = opts.invalidOutputRetries ?? 1;
    this.now = opts.now ?? (() => new Date());
    this.log = opts.logger ?? defaultLogger;
  }

  /** The route for a task, with an optional owner model override (ignored unless allowed). */
  route(task: TaskType, model?: string | null): ModelRoute {
    const base = this.routes[task];
    return model && (ALLOWED_MODELS as readonly string[]).includes(model) ? { ...base, model } : base;
  }

  /** Pre-call estimate: full input at list price plus the route's expected output. */
  estimate(request: GenerateRequest<unknown>, route: ModelRoute): number {
    const inputText = request.system + request.messages.map((m) => m.content).join("\n");
    return costOf(route.model, {
      inputTokens: estimateTokens(inputText),
      outputTokens: route.expectedOutputTokens,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
  }

  /**
   * @param model Optional owner override for this task (from Settings). Must be an allowed model;
   *              anything else is ignored and the default route is used.
   */
  async generate<T>(
    request: GenerateRequest<T>,
    ctx: UsageContext,
    limits: BudgetLimits,
    model?: string | null,
  ): Promise<GenerateResult<T>> {
    const route = this.route(request.task, model);
    const provider = this.providers.get(route.provider);
    if (!provider) throw new AppError("INTERNAL", `No provider registered for ${route.provider}.`);
    if (!priceFor(route.model).known) this.log.warn("pricing_unknown_model", { model: route.model });

    const estimated = this.estimate(request, route);
    const exceeded = await this.checkBudgets(ctx, limits, estimated);
    if (exceeded) {
      await this.record(ctx, request.task, route, {
        status: "blocked_budget",
        usage: null,
        model: route.model,
        estimatedCost: estimated,
        actualCost: null,
        durationMs: null,
        retryCount: 0,
        errorCode: "BUDGET_EXCEEDED",
      });
      throw new AppError(
        "BUDGET_EXCEEDED",
        `This call would exceed your ${exceeded.scope} AI budget ($${exceeded.spentUsd.toFixed(2)} of $${exceeded.limitUsd.toFixed(2)} used). Raise the limit in Settings to continue.`,
        exceeded,
      );
    }

    for (let attempt = 0; ; attempt++) {
      const started = Date.now();
      try {
        const result = await provider.generate(request, route);
        await this.record(ctx, request.task, route, {
          status: "success",
          usage: result.usage,
          model: result.model,
          estimatedCost: estimated,
          actualCost: result.costUsd,
          durationMs: result.durationMs,
          retryCount: attempt,
          errorCode: null,
        });
        return result;
      } catch (err) {
        const pe = err instanceof ProviderError ? err : null;
        await this.record(ctx, request.task, route, {
          status: "error",
          usage: pe?.usage ?? null,
          model: pe?.model ?? route.model,
          estimatedCost: estimated,
          actualCost: pe?.usage ? costOf(pe.model ?? route.model, pe.usage) : null,
          durationMs: Date.now() - started,
          retryCount: attempt,
          errorCode: pe ? pe.kind : "unknown",
        });
        const retry = pe?.kind === "invalid_output" && attempt < this.invalidOutputRetries;
        this.log.warn("provider_call_failed", { task: request.task, kind: pe?.kind ?? "unknown", attempt, retry });
        if (!retry) throw err;
      }
    }
  }

  private async checkBudgets(
    ctx: UsageContext,
    limits: BudgetLimits,
    estimated: number,
  ): Promise<BudgetExceededDetails | null> {
    const now = this.now();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const checks: Array<{
      scope: BudgetExceededDetails["scope"];
      limit: number | null | undefined;
      filter: SpendFilter | null;
    }> = [
      { scope: "job", limit: limits.jobUsd, filter: ctx.jobId ? { userId: ctx.userId, jobId: ctx.jobId } : null },
      {
        scope: "project",
        limit: limits.projectUsd,
        filter: ctx.projectId ? { userId: ctx.userId, projectId: ctx.projectId } : null,
      },
      { scope: "daily", limit: limits.dailyUsd, filter: { userId: ctx.userId, since: dayStart } },
      { scope: "monthly", limit: limits.monthlyUsd, filter: { userId: ctx.userId, since: monthStart } },
    ];

    for (const check of checks) {
      if (check.limit == null || !check.filter) continue;
      const spent = await this.store.spend(check.filter);
      if (spent + estimated > check.limit) {
        return { scope: check.scope, limitUsd: check.limit, spentUsd: spent, estimatedUsd: estimated };
      }
    }
    return null;
  }

  private async record(ctx: UsageContext, task: TaskType, route: ModelRoute, r: RecordFields): Promise<void> {
    try {
      await this.store.record({
        userId: ctx.userId,
        projectId: ctx.projectId ?? null,
        jobId: ctx.jobId ?? null,
        stepId: ctx.stepId ?? null,
        promptTemplateId: ctx.promptTemplateId ?? null,
        provider: route.provider,
        taskType: task,
        ...r,
      });
    } catch (err) {
      // A ledger write failure must be visible, but never hides the provider result or error.
      this.log.error("usage_record_failed", { task, error: err instanceof Error ? err.message : String(err) });
    }
  }
}
