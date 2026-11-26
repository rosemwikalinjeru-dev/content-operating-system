import { z } from "zod";

export const Uuid = z.uuid();

export const ShortText = z.string().trim().min(1).max(200);

/** Comma/newline separated text from forms or arrays from JSON, normalised to a string array. */
export const TagList = z
  .array(z.string().trim().toLowerCase().min(1).max(40))
  .max(20)
  .transform((tags) => [...new Set(tags)]);

export const PaginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).max(500).optional(),
});
export type PaginationQuery = z.infer<typeof PaginationQuery>;

export interface Page<T> {
  data: T[];
  next_cursor: string | null;
}

export const ApiErrorBody = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    request_id: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBody>;
