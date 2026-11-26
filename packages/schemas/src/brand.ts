import { z } from "zod";
import { ShortText } from "./common";

const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Expected a #RRGGBB colour");
const LongText = z.string().trim().max(500);

/** How the brand writes. Retrieved into every generation prompt from Phase 1. */
export const VoiceProfile = z.object({
  summary: z.string().trim().max(2000).default(""),
  tone: z.array(ShortText).max(20).default([]),
  principles: z.array(LongText).max(30).default([]),
  preferred_phrases: z.array(ShortText).max(100).default([]),
  banned_phrases: z.array(ShortText).max(200).default([]),
  sentence_style: z.string().trim().max(1000).default(""),
});
export type VoiceProfile = z.infer<typeof VoiceProfile>;

export const Audience = z.object({
  primary: z.string().trim().max(500).default(""),
  segments: z.array(ShortText).max(30).default([]),
  pains: z.array(LongText).max(50).default([]),
  desired_outcomes: z.array(LongText).max(50).default([]),
});
export type Audience = z.infer<typeof Audience>;

export const BrandGuidelines = z.object({
  colors: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,39}$/), HexColor).default({}),
  fonts: z
    .object({ display: z.string().trim().max(80).optional(), body: z.string().trim().max(80).optional() })
    .default({}),
  content_pillars: z.array(ShortText).max(20).default([]),
});
export type BrandGuidelines = z.infer<typeof BrandGuidelines>;

export const BrandProfileCreate = z.object({
  name: z.string().trim().min(1).max(120),
  positioning: z.string().trim().max(2000).nullable().optional(),
  audience: Audience.optional(),
  voice_profile: VoiceProfile.optional(),
  brand_guidelines: BrandGuidelines.optional(),
});
export type BrandProfileCreate = z.infer<typeof BrandProfileCreate>;

export const BrandProfileUpdate = BrandProfileCreate.partial()
  .extend({ status: z.enum(["active", "archived"]).optional() })
  .refine((v) => Object.keys(v).length > 0, "At least one field must be provided");
export type BrandProfileUpdate = z.infer<typeof BrandProfileUpdate>;

export interface BrandProfile {
  id: string;
  name: string;
  positioning: string | null;
  audience: Audience;
  voice_profile: VoiceProfile;
  brand_guidelines: BrandGuidelines;
  is_default: boolean;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
}

/** Normalise stored JSONB (which may be `{}` or from an older shape) into full typed objects. */
export function normaliseBrand(row: {
  audience: unknown;
  voice_profile: unknown;
  brand_guidelines: unknown;
}): Pick<BrandProfile, "audience" | "voice_profile" | "brand_guidelines"> {
  return {
    audience: Audience.catch(Audience.parse({})).parse(row.audience ?? {}),
    voice_profile: VoiceProfile.catch(VoiceProfile.parse({})).parse(row.voice_profile ?? {}),
    brand_guidelines: BrandGuidelines.catch(BrandGuidelines.parse({})).parse(row.brand_guidelines ?? {}),
  };
}
