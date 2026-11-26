# Editorial evaluation fixtures

Seed set for the Phase 4 editorial evaluation suite (spec §10.E: 30–50 examples before any
prompt or model change). Each fixture records the input, the expected verdict and why.

| id | input | expected | reason |
|---|---|---|---|
| cliche-001 | "AI doesn't fix broken business processes. It makes them faster." | flag: generic | Widely repeated line; fails Brand Guidelines v1.0 §13.3 ("could any generic AI automation agency publish this unchanged?"). Owner judged it fluffy and cliché, 2026-11-26. |

Add the owner's strong published posts as `expected: pass` fixtures when they are provided.
