import type { BrandProfileCreate } from "./brand";

/**
 * Brand DNA for Rose Njeru Automation, offered in Settings via "Load brand defaults".
 * Nothing is applied automatically: the owner reviews and saves it.
 *
 * Primary source: "Rose Njeru Automation — Brand Identity & Guidelines, Version 1.0,
 * November 2026" (docs/BRAND-DNA.md). A few voice mechanics and banned words are carried over
 * from earlier brand files; they are marked "[earlier brand files]" in docs/BRAND-DNA.md.
 */
export const BRAND_DEFAULTS_VERSION = "1.0 (November 2026)";

export const ROSE_NJERU_DEFAULTS: Required<BrandProfileCreate> = {
  name: "Rose Njeru Automation",
  positioning:
    "Rose Njeru Automation helps businesses understand what needs to improve, develop the right strategy, " +
    "redesign how work gets done and implement intelligent systems that deliver measurable business " +
    "performance. A business performance organisation connecting business intelligence, strategy, people, " +
    "processes and technology. Automation and AI are capabilities within a broader approach to business " +
    "transformation, not the positioning.",
  audience: {
    // v1.0 §1.1–1.2 and §7.5.
    primary:
      "Businesses and organisations that need to make better decisions, build better systems and achieve " +
      "measurable results.",
    segments: [],
    pains: [
      "Disconnected processes create delays, duplicated work and poor visibility",
      "Unclear what needs to improve or why",
      "Technology adopted without a strategy or a measurable business outcome",
    ],
    desired_outcomes: [
      "Better decisions",
      "Better systems",
      "Measurable business results",
      "Better business performance through better systems",
    ],
  },
  voice_profile: {
    summary:
      "Strategic, analytical and commercially aware. Explains complex subjects in accessible language, connects " +
      "technology to business outcomes, challenges ineffective practices without becoming confrontational, and " +
      "never exaggerates what AI or automation can do. Direct and calm, never hyped.",
    tone: [
      "Strategic",
      "Analytical",
      "Commercially aware",
      "Confident",
      "Intellectually curious",
      "Forward-looking",
      "Practical",
      "Dependable",
    ],
    principles: [
      "Business value over activity: work must have a clear business purpose.",
      "Process before technology: understand the problem before choosing the solution.",
      "Strategy before tools: technology serves business objectives.",
      "Trust by design: security, reliability, governance and accountability are essential.",
      "Human judgement amplified: technology should strengthen human capability.",
      "Continuous improvement: implementation is the beginning of performance management, not the end.",
      "Be clear: explain complex subjects in accessible language.",
      "Be commercially relevant: connect technology and strategy to business outcomes.",
      "Be analytical: use evidence, measurement and sound reasoning.",
      "Challenge assumptions: question ineffective business practices without becoming confrontational.",
      "Be practical: explain what should change and why.",
      "Avoid hype: do not exaggerate what AI or automation can achieve.",
      "Do not publish invented client results or unsupported performance claims.",
      "Avoid turning every post into a promotional advertisement.",
      "If any generic AI automation agency could publish it unchanged, it needs stronger differentiation.",
    ],
    preferred_phrases: [
      "Business performance",
      "Business intelligence",
      "Strategic transformation",
      "Systems architecture",
      "Operational performance",
      "Measurable improvement",
      "Business outcomes",
      "Process redesign",
      "Intelligent systems",
      "Responsible AI adoption",
      "Continuous improvement",
      "Evidence-based decisions",
    ],
    banned_phrases: [
      "AI-powered",
      "revolutionary",
      "revolutionise",
      "game-changing",
      "game-changer",
      "unlock your potential",
      "unlock",
      "transform your business overnight",
      "seamless",
      "cutting-edge",
      "automation for automation's sake",
      "insane",
      "crazy",
      "10x",
      "secret",
      "hack",
      "nobody's talking about this",
      "here's the truth",
    ],
    sentence_style:
      "Lead with the business finding or consequence. Short declarative sentences. Name real tools, fields and " +
      "behaviour. Sentence case headings. No urgency devices.",
  },
  brand_guidelines: {
    colors: {
      deep_night: "#1A1A2E",
      forest_teal: "#1D9E75",
      cobalt: "#2563EB",
      ice_blue: "#E3EEFB",
      warm_gold: "#C9A84C",
      linen_cream: "#F1EFE8",
    },
    fonts: { display: "Cormorant Garamond", body: "DM Sans", mono: "IBM Plex Mono" },
    content_pillars: [
      "Business performance and intelligence",
      "Process and operational problems",
      "AI and technology adoption",
      "Systems architecture and integration",
      "Leadership and decision-making",
      "Measurement and business outcomes",
      "Transformation case studies",
    ],
    messaging: {
      brand_line: "Business Intelligence. Strategic Transformation. Measurable Performance.",
      promise: "Better business performance through better systems.",
      message_pillars: [
        "Business intelligence: understand what is happening and why",
        "Strategic transformation: determine what needs to change",
        "Systems architecture: build the right operational foundations",
        "Technology implementation: put practical solutions into operation",
        "Performance improvement: measure results and improve continuously",
      ],
      methodology: [
        "Diagnose: understand the organisation, investigate processes, identify root causes, establish baselines",
        "Strategise: determine priorities, define desired outcomes, select the course of action",
        "Design: improved processes, systems architecture, information flows, governance requirements",
        "Implement: build, integrate, deploy and enable the people who use the solution",
        "Optimise: measure performance, monitor reliability, address issues, improve; feeds back into Diagnose",
      ],
      messaging_structure: [
        "Identify a business challenge",
        "Explain why it matters",
        "Identify the underlying cause",
        "Present the strategic or operational response",
        "Explain how technology supports the solution",
        "Describe how success will be measured",
      ],
    },
  },
};
