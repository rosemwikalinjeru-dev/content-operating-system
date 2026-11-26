import { z } from "zod";
import { PaginationQuery, TagList, Uuid } from "./common";

export const IDEA_STATUSES = ["inbox", "developing", "briefed", "archived"] as const;
export const IdeaStatus = z.enum(IDEA_STATUSES);
export type IdeaStatus = z.infer<typeof IdeaStatus>;

export const IDEA_SOURCE_TYPES = ["manual", "research", "repurpose", "import"] as const;

export const IdeaCreate = z.object({
  brand_id: Uuid.optional(),
  title: z.string().trim().min(1).max(200).optional(),
  raw_input: z.string().trim().min(1, "Write the idea first").max(20000),
  tags: TagList.default([]),
});
export type IdeaCreate = z.infer<typeof IdeaCreate>;

export const IdeaUpdate = z
  .object({
    title: z.string().trim().min(1).max(200),
    raw_input: z.string().trim().min(1).max(20000),
    tags: TagList,
    status: IdeaStatus,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "At least one field must be provided");
export type IdeaUpdate = z.infer<typeof IdeaUpdate>;

export const IdeaListQuery = PaginationQuery.extend({
  brand_id: Uuid.optional(),
  status: IdeaStatus.optional(),
  tag: z.string().trim().toLowerCase().min(1).max(40).optional(),
  q: z.string().trim().min(1).max(200).optional(),
});
export type IdeaListQuery = z.infer<typeof IdeaListQuery>;

export interface Idea {
  id: string;
  brand_id: string;
  title: string;
  raw_input: string;
  source_type: (typeof IDEA_SOURCE_TYPES)[number];
  status: IdeaStatus;
  tags: string[];
  created_at: string;
  updated_at: string;
}

/** Derive a title from the first line of raw input when the user only captured text. */
export function deriveIdeaTitle(raw: string): string {
  const firstLine = raw.trim().split(/\r?\n/)[0]?.trim() ?? "";
  if (firstLine.length <= 80) return firstLine || "Untitled idea";
  const cut = firstLine.slice(0, 80);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
