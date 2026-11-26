import { AppError, decodeCursor, encodeCursor, fromDatabaseError } from "@contentos/shared";
import { deriveIdeaTitle, type Idea, type IdeaCreate, type IdeaListQuery, type IdeaUpdate, type Page } from "@contentos/schemas";
import type { UserClient } from "./client";

const COLUMNS = "id, brand_id, title, raw_input, source_type, status, tags, created_at, updated_at";

/** Escape a value for a PostgREST filter expression (quotes protect `,` `.` `:` `(`). */
function pgrstQuote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Escape LIKE wildcards so user search text is matched literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function listIdeas(db: UserClient, query: IdeaListQuery): Promise<Page<Idea>> {
  let q = db
    .from("content_ideas")
    .select(COLUMNS)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(query.limit + 1);

  if (query.brand_id) q = q.eq("brand_id", query.brand_id);
  if (query.status) q = q.eq("status", query.status);
  else q = q.neq("status", "archived");
  if (query.tag) q = q.contains("tags", [query.tag]);
  if (query.q) {
    const pattern = pgrstQuote(`%${escapeLike(query.q)}%`);
    q = q.or(`title.ilike.${pattern},raw_input.ilike.${pattern}`);
  }
  if (query.cursor) {
    const c = decodeCursor(query.cursor);
    const ts = pgrstQuote(c.createdAt);
    q = q.or(`created_at.lt.${ts},and(created_at.eq.${ts},id.lt.${c.id})`);
  }

  const { data, error } = await q;
  if (error) throw fromDatabaseError(error);
  const rows = data as Idea[];
  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  const last = page.at(-1);
  return {
    data: page,
    next_cursor: hasMore && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null,
  };
}

export async function getIdea(db: UserClient, id: string): Promise<Idea> {
  const { data, error } = await db.from("content_ideas").select(COLUMNS).eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "Idea not found.");
  return data as Idea;
}

export async function createIdea(
  db: UserClient,
  userId: string,
  brandId: string,
  input: IdeaCreate,
): Promise<Idea> {
  const { data, error } = await db
    .from("content_ideas")
    .insert({
      user_id: userId,
      brand_id: brandId,
      title: input.title ?? deriveIdeaTitle(input.raw_input),
      raw_input: input.raw_input,
      tags: input.tags,
      source_type: "manual",
    })
    .select(COLUMNS)
    .single();
  if (error) throw fromDatabaseError(error);
  return data as Idea;
}

export async function updateIdea(db: UserClient, id: string, input: IdeaUpdate): Promise<Idea> {
  const { data, error } = await db
    .from("content_ideas")
    .update(input)
    .eq("id", id)
    .is("deleted_at", null)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "Idea not found.");
  return data as Idea;
}

/** Soft delete: the row and anything derived from it stay traceable. */
export async function deleteIdea(db: UserClient, id: string): Promise<void> {
  const { data, error } = await db
    .from("content_ideas")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "Idea not found.");
}

export async function countIdeasByStatus(db: UserClient): Promise<Record<string, number>> {
  const statuses = ["inbox", "developing", "briefed"] as const;
  const results = await Promise.all(
    statuses.map((s) =>
      db.from("content_ideas").select("id", { count: "exact", head: true }).eq("status", s).is("deleted_at", null),
    ),
  );
  const out: Record<string, number> = {};
  results.forEach((r, i) => {
    if (r.error) throw fromDatabaseError(r.error);
    out[statuses[i]!] = r.count ?? 0;
  });
  return out;
}
