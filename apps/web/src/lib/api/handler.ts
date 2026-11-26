import { AppError, isAppError, logger } from "@contentos/shared";
import type { ApiErrorBody } from "@contentos/schemas";
import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";

const MAX_JSON_BYTES = 256 * 1024;

export interface RouteContext<P> {
  params: Promise<P>;
}

export interface ApiContext<P> {
  req: NextRequest;
  params: P;
  requestId: string;
}

type Handler<P> = (ctx: ApiContext<P>) => Promise<Response>;

/**
 * Wrap a route handler with: request id, structured error responses, and one structured
 * log line per request (method, route, status, duration — never bodies or headers).
 */
export function api<P = Record<string, never>>(handler: Handler<P>) {
  return async (req: NextRequest, context: RouteContext<P>): Promise<Response> => {
    const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
    const started = performance.now();
    let response: Response;
    try {
      const params = (await context?.params) ?? ({} as P);
      response = await handler({ req, params, requestId });
    } catch (err) {
      response = errorResponse(err, requestId);
    }
    response.headers.set("x-request-id", requestId);
    response.headers.set("cache-control", "no-store");
    logger.info("api_request", {
      requestId,
      method: req.method,
      path: req.nextUrl.pathname,
      status: response.status,
      durationMs: Math.round(performance.now() - started),
    });
    return response;
  };
}

export function errorResponse(err: unknown, requestId: string): Response {
  const appError = isAppError(err) ? err : new AppError("INTERNAL", "Unexpected server error.");
  if (!isAppError(err) || appError.status >= 500) {
    logger.error("api_error", {
      requestId,
      code: appError.code,
      error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err),
      details: appError.details,
    });
  }
  const body: ApiErrorBody = {
    error: {
      code: appError.code,
      message: appError.message,
      request_id: requestId,
      // Validation details are safe and useful to the client; others stay in logs.
      ...(appError.code === "VALIDATION_FAILED" && appError.details ? { details: appError.details } : {}),
    },
  };
  return NextResponse.json(body, { status: appError.status });
}

function validationError(error: z.ZodError): AppError {
  return new AppError(
    "VALIDATION_FAILED",
    "Request validation failed.",
    error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  );
}

export async function parseJson<S extends z.ZodType>(req: NextRequest, schema: S): Promise<z.infer<S>> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) {
    throw new AppError("VALIDATION_FAILED", "Content-Type must be application/json.");
  }
  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > MAX_JSON_BYTES) {
    throw new AppError("PAYLOAD_TOO_LARGE", "Request body is too large.");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new AppError("VALIDATION_FAILED", "Request body is not valid JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

export function parseQuery<S extends z.ZodType>(req: NextRequest, schema: S): z.infer<S> {
  const parsed = schema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) throw validationError(parsed.error);
  return parsed.data;
}

export function parseParam<S extends z.ZodType>(value: unknown, schema: S, name: string): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new AppError("NOT_FOUND", `Unknown ${name}.`);
  return parsed.data;
}

export function json(data: unknown, status = 200): Response {
  return NextResponse.json(data, { status });
}
