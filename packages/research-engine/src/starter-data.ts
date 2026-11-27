/**
 * Starter research configuration, generated from docs/research/research-keywords.json and
 * docs/research/watchlist.json. A test keeps these identical to the JSON files.
 * Imported into the database from the Research page (owner action), never automatically.
 */
export const STARTER_KEYWORDS = {
  "version": 2,
  "updated": "2026-11-27",
  "scope": "social content first; SEO deferred",
  "priority_directions": [
    "founder dependency",
    "operational visibility",
    "capacity constraints",
    "system fragmentation",
    "AI implementation gaps"
  ],
  "clusters": [
    {
      "id": "A",
      "name": "Hidden inefficiencies",
      "priority": "high",
      "concepts": [
        "Revenue leakage in service businesses",
        "Hidden costs of manual processes",
        "Information handoff failures",
        "Work trapped in spreadsheets",
        "Business processes dependent on one employee"
      ],
      "audience_language": [
        "drowning in admin",
        "manual data entry",
        "copy and paste between",
        "only one person knows how",
        "fell through the cracks"
      ],
      "audience_language_status": "draft"
    },
    {
      "id": "B",
      "name": "Performance and decisions",
      "priority": "medium",
      "concepts": [
        "Measuring operational efficiency",
        "Operational KPIs for growing businesses",
        "Capacity utilisation in service businesses",
        "Cost of operational inefficiency",
        "Measuring ROI of process improvement"
      ],
      "audience_language": [
        "don't know my numbers",
        "which KPIs should I track",
        "busy but not profitable",
        "where is the money going",
        "how do I measure"
      ],
      "audience_language_status": "draft"
    },
    {
      "id": "C",
      "name": "AI implementation",
      "priority": "medium",
      "concepts": [
        "AI readiness assessment for businesses",
        "AI implementation failures",
        "AI workflow reliability",
        "Measuring AI implementation ROI",
        "When not to use AI in business"
      ],
      "audience_language": [
        "AI didn't work for my business",
        "is AI worth it",
        "chatbot annoyed customers",
        "AI tools waste of money",
        "AI made mistakes"
      ],
      "audience_language_status": "draft"
    },
    {
      "id": "D",
      "name": "Systems and infrastructure",
      "priority": "medium",
      "concepts": [
        "Disconnected business systems",
        "Business data silos",
        "Single source of truth for business data",
        "Manual reporting bottlenecks",
        "Operational visibility across departments"
      ],
      "audience_language": [
        "tools don't talk to each other",
        "too many apps",
        "double entry",
        "weekly report takes hours",
        "Zapier broke"
      ],
      "audience_language_status": "draft"
    },
    {
      "id": "E",
      "name": "Scaling",
      "priority": "high",
      "concepts": [
        "Founder dependency in business operations",
        "When a business outgrows its spreadsheets",
        "Scaling without increasing headcount",
        "When to hire versus automate",
        "Standardising processes across teams"
      ],
      "audience_language": [
        "business can't run without me",
        "can't take a holiday",
        "everything goes through me",
        "outgrew spreadsheets",
        "hire or automate"
      ],
      "audience_language_status": "draft"
    },
    {
      "id": "F",
      "name": "Revenue and customer journey",
      "priority": "medium",
      "concepts": [
        "Enquiry to payment process",
        "Unconverted enquiries analysis",
        "Customer onboarding bottlenecks",
        "Delayed invoicing and cash flow",
        "Customer journey breakdowns"
      ],
      "audience_language": [
        "quotes not converting",
        "clients ghost after quote",
        "chasing invoices",
        "onboarding takes forever",
        "customers slipping through"
      ],
      "audience_language_status": "draft"
    }
  ],
  "saturation_benchmark": [
    "missed calls",
    "appointment reminders",
    "booking automation",
    "CRM for small business",
    "lead follow-up",
    "speed to lead"
  ]
} as const;

export const STARTER_WATCHLIST = {
  "source": "Owner-supplied list, 2026-11-27",
  "note": "Profile URLs supplied by the owner on 2026-11-27 (tracking parameters removed). Still missing: Nick Saraev, Isabella Bedoya.",
  "competitors": [
    {
      "name": "Nate Herk",
      "relationship": "direct_competitor",
      "priority": 1,
      "study_focus": "Breaking down complex workflows; use cases; making technical work accessible",
      "platforms": [
        {
          "platform": "linkedin",
          "profile_url": "https://www.linkedin.com/in/nateherkelman/"
        }
      ]
    },
    {
      "name": "Nick Saraev",
      "relationship": "direct_competitor",
      "priority": null,
      "study_focus": "Linking automation to marketing and business models; commercial value",
      "platforms": [
        {
          "platform": "linkedin",
          "profile_url": null
        }
      ]
    },
    {
      "name": "Liam Ottley",
      "relationship": "direct_competitor",
      "priority": 8,
      "study_focus": "Business teardowns; before/after systems; implementation storytelling",
      "platforms": [
        {
          "platform": "linkedin",
          "profile_url": "https://www.linkedin.com/in/liamottley/"
        }
      ]
    },
    {
      "name": "Isabella Bedoya",
      "relationship": "direct_competitor",
      "priority": null,
      "study_focus": "Connecting owners everyday problems to systems solutions",
      "platforms": [
        {
          "platform": "linkedin",
          "profile_url": null
        }
      ]
    },
    {
      "name": "Allie K. Miller",
      "relationship": "positioning_benchmark",
      "priority": 2,
      "study_focus": "Executive-level hooks; business implications of AI; strong opinions",
      "platforms": [
        {
          "platform": "linkedin",
          "profile_url": "https://www.linkedin.com/in/alliekmiller/"
        }
      ]
    },
    {
      "name": "Ethan Mollick",
      "relationship": "positioning_benchmark",
      "priority": 7,
      "study_focus": "Evidence-led observations; experiments; stating limitations",
      "platforms": [
        {
          "platform": "linkedin",
          "profile_url": "https://www.linkedin.com/in/emollick/"
        }
      ]
    },
    {
      "name": "Chris Donnelly",
      "relationship": "positioning_benchmark",
      "priority": null,
      "study_focus": "Business opportunities for a broad professional audience",
      "platforms": [
        {
          "platform": "linkedin",
          "profile_url": "https://www.linkedin.com/in/donnellychris/"
        }
      ]
    },
    {
      "name": "Alex Hormozi",
      "relationship": "craft_benchmark",
      "priority": 6,
      "study_focus": "Short opening lines, numbers, simple commercial explanations (not the aggressive style)",
      "platforms": [
        {
          "platform": "linkedin",
          "profile_url": "https://www.linkedin.com/in/alexhormozi/"
        }
      ]
    },
    {
      "name": "Justin Welsh",
      "relationship": "craft_benchmark",
      "priority": 3,
      "study_focus": "Opening lines, spacing, one idea per post, story to lesson",
      "platforms": [
        {
          "platform": "linkedin",
          "profile_url": "https://www.linkedin.com/in/justinwelsh/"
        }
      ]
    },
    {
      "name": "Katelyn Bourgoin",
      "relationship": "craft_benchmark",
      "priority": 4,
      "study_focus": "Turning customer frustrations and buying behaviour into content",
      "platforms": [
        {
          "platform": "linkedin",
          "profile_url": "https://www.linkedin.com/in/katebour/"
        }
      ]
    },
    {
      "name": "Alex Lieberman",
      "relationship": "positioning_benchmark",
      "priority": null,
      "study_focus": "Packaging business observations into memorable narratives",
      "platforms": [
        {
          "platform": "linkedin",
          "profile_url": "https://www.linkedin.com/in/alex-lieberman/"
        }
      ]
    },
    {
      "name": "Sabrina Ramonov",
      "relationship": "craft_benchmark",
      "priority": 5,
      "study_focus": "Original to repurposed content system; visual explanations",
      "platforms": [
        {
          "platform": "linkedin",
          "profile_url": "https://www.linkedin.com/in/sabrinaramonov/"
        }
      ]
    },
    {
      "name": "Lara Acosta",
      "relationship": "craft_benchmark",
      "priority": null,
      "study_focus": "Content strategy: content pillars, posting cadence, how posts move readers from attention to trust",
      "platforms": [
        {
          "platform": "linkedin",
          "profile_url": "https://www.linkedin.com/in/laraacostar/"
        }
      ]
    },
    {
      "name": "Megan Lieu",
      "relationship": "craft_benchmark",
      "priority": null,
      "study_focus": "Content strategy: content pillars, posting cadence, how posts move readers from attention to trust",
      "platforms": [
        {
          "platform": "linkedin",
          "profile_url": "https://www.linkedin.com/in/meganlieu/"
        }
      ]
    }
  ]
} as const;
