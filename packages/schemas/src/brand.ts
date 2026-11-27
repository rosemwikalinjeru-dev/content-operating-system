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
    .object({
      display: z.string().trim().max(80).optional(),
      body: z.string().trim().max(80).optional(),
      /** Metrics, data labels, technical annotations. */
      mono: z.string().trim().max(80).optional(),
    })
    .default({}),
  content_pillars: z.array(ShortText).max(20).default([]),
  /** Target share of posts per content type, in percent. Should add up to 100. */
  content_mix: z
    .object({
      growth: z.number().int().min(0).max(100),
      authority: z.number().int().min(0).max(100),
      conversion: z.number().int().min(0).max(100),
      personal: z.number().int().min(0).max(100),
    })
    .refine((m) => m.growth + m.authority + m.conversion + m.personal === 100, "Content mix must add up to 100%")
    .default({ growth: 70, authority: 20, conversion: 5, personal: 5 }),
  messaging: z
    .object({
      /** Primary brand descriptor, e.g. "Business Intelligence. Strategic Transformation. Measurable Performance." */
      brand_line: z.string().trim().max(300).default(""),
      promise: z.string().trim().max(300).default(""),
      /** Core message pillars: "<pillar>: <message>". */
      message_pillars: z.array(LongText).max(12).default([]),
      /** Delivery methodology stages, in order: "<stage>: <description>". */
      methodology: z.array(LongText).max(12).default([]),
      /** Ordered steps every piece of communication follows. */
      messaging_structure: z.array(LongText).max(12).default([]),
    })
    .default({ brand_line: "", promise: "", message_pillars: [], methodology: [], messaging_structure: [] }),
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
