import { AppError, decodeCursor, encodeCursor, fromDatabaseError } from "@contentos/shared";
import type { KnowledgeCreate, KnowledgeEntry, KnowledgeListQuery, KnowledgeUpdate, Page } from "@contentos/schemas";
import type { UserClient } from "./client";

const COLUMNS = "id, brand_id, kind, title, body, source, verified, tags, created_at, updated_at";

export async function listKnowledge(db: UserClient, query: KnowledgeListQuery): Promise<Page<KnowledgeEntry>> {
  let q = db
    .from("brand_knowledge")
    .select(COLUMNS)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(query.limit + 1);
  if (query.brand_id) q = q.eq("brand_id", query.brand_id);
  if (query.kind) q = q.eq("kind", query.kind);
  if (query.cursor) {
    const c = decodeCursor(query.cursor);
    q = q.or(`created_at.lt."${c.createdAt}",and(created_at.eq."${c.createdAt}",id.lt.${c.id})`);
  }
  const { data, error } = await q;
  if (error) throw fromDatabaseError(error);
  const rows = data as KnowledgeEntry[];
  const more = rows.length > query.limit;
  const page = more ? rows.slice(0, query.limit) : rows;
  const last = page.at(-1);
  return { data: page, next_cursor: more && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null };
}

export async function createKnowledge(
  db: UserClient,
  userId: string,
  brandId: string,
  input: Omit<KnowledgeCreate, "brand_id">,
): Promise<KnowledgeEntry> {
  const { data, error } = await db
    .from("brand_knowledge")
    .insert({ user_id: userId, brand_id: brandId, ...input })
    .select(COLUMNS)
    .single();
  if (error) throw fromDatabaseError(error);
  return data as KnowledgeEntry;
}

export async function updateKnowledge(db: UserClient, id: string, input: KnowledgeUpdate): Promise<KnowledgeEntry> {
  const { data, error } = await db
    .from("brand_knowledge")
    .update(input)
    .eq("id", id)
    .is("deleted_at", null)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "Knowledge entry not found.");
  return data as KnowledgeEntry;
}

export async function deleteKnowledge(db: UserClient, id: string): Promise<void> {
  const { data, error } = await db
    .from("brand_knowledge")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw fromDatabaseError(error);
  if (!data) throw new AppError("NOT_FOUND", "Knowledge entry not found.");
}

/** Titles already present for a brand (used to make voice-sample import idempotent). */
export async function knowledgeTitles(db: UserClient, brandId: string): Promise<Set<string>> {
  const { data, error } = await db.from("brand_knowledge").select("title").eq("brand_id", brandId).is("deleted_at", null);
  if (error) throw fromDatabaseError(error);
  return new Set((data as { title: string }[]).map((r) => r.title));
}
