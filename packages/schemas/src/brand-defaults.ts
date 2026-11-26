import type { BrandProfileCreate } from "./brand";

/**
 * Starting Brand DNA for Rose Njeru Automation, offered in Settings when a brand has not been
 * configured yet. Nothing is applied automatically: the owner reviews and saves it.
 */
export const ROSE_NJERU_DEFAULTS: Required<BrandProfileCreate> = {
  name: "Rose Njeru Automation",
  positioning:
    "I build and debug business systems that help service businesses capture, qualify, book, " +
    "follow up with, and manage customers more reliably.",
  audience: {
    primary: "Founders, owners and operators of service businesses",
    segments: [
      "Home services",
      "Dental and medical clinics",
      "Salons",
      "Agencies",
      "Professional services",
      "Real estate",
      "Fitness",
      "Education",
      "Automation and operations professionals",
    ],
    pains: [
      "Missed and slow-to-respond leads",
      "Manual follow-up that falls through the cracks",
      "Disconnected booking, CRM and messaging tools",
      "Unclear handoffs between people and systems",
      "Automations that break silently",
    ],
    desired_outcomes: [
      "Every lead captured, qualified and followed up",
      "Reliable systems they can trust and measure",
    ],
  },
  voice_profile: {
    summary:
      "A business systems builder explaining how real operations work. Process first, technology second. " +
      "Shows the error, the investigation, the root cause and the fix.",
    tone: ["Practical", "Specific", "Calm authority", "Plain language"],
    principles: [
      "Start with the business problem, never the tool.",
      "Use concrete operational examples from service businesses.",
      "Show debugging and failures, not only finished builds.",
      "Separate facts from opinions; never invent results or client stories.",
      "Do not make every post about AI or about home services.",
    ],
    preferred_phrases: [],
    banned_phrases: [
      "game-changer",
      "revolutionize",
      "unlock the power",
      "in today's fast-paced world",
      "delve",
      "10x your business",
    ],
    sentence_style: "Short, direct sentences. Concrete nouns. Occasional one-line paragraphs for emphasis.",
  },
  brand_guidelines: {
    colors: {
      deep_night: "#1A1A2E",
      forest_teal: "#1D9E75",
      warm_gold: "#C9A84C",
      linen_cream: "#F1EFE8",
      soft_violet: "#7F77DD",
      charcoal: "#2C2C2A",
    },
    fonts: { display: "Cormorant Garamond", body: "DM Sans" },
    content_pillars: [
      "Process teardowns",
      "Business observations",
      "Case studies",
      "Before and after workflows",
      "Systems thinking",
      "Automation architecture",
      "Debugging",
      "MCP and integrations",
      "AI implementation",
      "Lessons from real projects",
    ],
  },
};
