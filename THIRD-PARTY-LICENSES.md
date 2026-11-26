# Third-Party Licenses and Commercial-Use Register

Rule: no provider, model, repository, font or asset is used in ContentOS until it has a row
here with a decision. A repository's licence does not cover the models, fonts or services it
calls — each is listed separately.

Last reviewed: 2026-11-26 (see docs/RECONNAISSANCE.md for evidence).

| Component | Licence | How ContentOS uses it | Decision |
|---|---|---|---|
| AI Video Factory (ersinkoc) | MIT | Reference; patterns re-implemented | Allowed with attribution if code is adapted |
| Social Media Research Skills (ScrapeCreators) | MIT | Methodology adapted into `skills/` | Allowed with attribution |
| ScrapeCreators API | Commercial API terms | Research provider | Allowed; usage-priced, metered |
| Agent-Reach | MIT | Optional isolated subprocess | Restricted: no logged-in channels (LinkedIn, X, Instagram, Facebook) |
| AI YouTube Shorts Generator | MIT | Local-mode logic adapted into media worker | Allowed; MuAPI mode not used |
| Short Video Factory | AGPL-3.0 | None | Do not copy or closely re-implement without legal review |
| Kokoro code + weights | Apache-2.0 | TTS sidecar process | Allowed |
| espeak-ng (via Kokoro/misaki G2P) | GPL-3.0 | Inside the Kokoro sidecar only | Allowed only as a separate process; never linked into app code |
| faster-whisper | MIT | Transcription sidecar | Allowed |
| Whisper model weights | MIT | Transcription | Allowed |
| FLUX.2 Klein 4B / 4B Base | Apache-2.0 | Candidate image model | Allowed |
| FLUX.2 Klein 9B / 9B KV / 9B Base / [dev] | FLUX Non-Commercial | None | Not allowed for production |
| MiniMax-H3-Image | MiniMax Community License | None yet | Review before use |
| Remotion | Remotion License (free ≤ 3 employees; company licence above) | Video rendering | Allowed while team ≤ 3; re-check on hiring |
| FFmpeg | LGPL-2.1+ (GPL if built with GPL parts) | Media worker binary, separate process | Allowed; use an LGPL build or keep as a separate executable |
| yt-dlp | Unlicense | Download own videos only | Allowed; platform ToS still applies |
| Playwright | Apache-2.0 | Carousel rendering | Allowed |
| Cormorant Garamond, DM Sans, Plus Jakarta Sans | SIL OFL 1.1 | Carousel fonts | Allowed, embedding in exports permitted |
| Next.js, React, Zod, Supabase JS, Trigger.dev SDK | MIT / Apache-2.0 | Core app | Allowed |
| Claude API, OpenAI API | Provider commercial terms | LLM providers | Allowed |
