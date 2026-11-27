import type { ApiErrorBody } from "@contentos/schemas";

/** Minimal browser client for /api/v1. Throws with the API's structured message. */
export async function apiFetch<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { ...(init?.json !== undefined ? { "content-type": "application/json" } : {}), ...init?.headers },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  if (res.status === 204) return undefined as T;
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (body as ApiErrorBody | null)?.error;
    throw new Error(err ? `${err.message} (ref ${err.request_id.slice(0, 8)})` : `Request failed (${res.status})`);
  }
  return body as T;
}
