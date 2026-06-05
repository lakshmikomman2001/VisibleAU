Please read throuhg the Below documents before write any single line of code
Documents location: C:\startup\VisibleAU\src\docs\latets\CodePrompts
## PER-SPRINT READING ORDER
| 1 | `CLAUDE.md` v1.5 | Master design doc — stack, architecture, conventions, anti-patterns | All of it (~5 min) |
| 2 | `sri-visibleau-foundations.md` v1.12 | Engineering foundations — folder structure, schema, patterns | §2 (folder structure) + §3 (schema) |
| 3 | `sri-visibleau-architecture-overview.md` v1.6 | How the system fits together | All of it |
| 4 | `sri-geo-aeo-prd-v1.md` v1.15 | The full PRD — what we're building and why | §3–§7 (product, pricing, regions) |
| 5 | `sri-visibleau-sprint-prompts-index.md` v1.1 | Sprint roadmap, dependencies, critical paths | All of it |
| 6 | `visibleau-prototype.jsx` | 44-screen UI prototype — visual reference only, NOT production code | Skim for layout awareness |

### SPRINT 3 — Multi-Engine + Multidimensional Scoring
*Goal: 4 engines + 5-dim scoring + Wilson 95% CIs + tier-aware model selector*

| Order | File | Why |
|-------|------|-----|
| 1 | `CLAUDE.md` v1.5 | Always first |
| 2 | `sri-visibleau-foundations.md` v1.12 | §3 schema additions — multidimensional columns + confidence intervals |
| 3 | `sri-visibleau-architecture-overview.md` v1.6 | §11 tier-aware model selector commitment |
| 4 | `sri-geo-aeo-prd-v1.md` v1.15 | §10 multidimensional scoring spec + Wilson CI math |
| 5 | `sri-visibleau-sprint-3-backend-tests.md` | Defines the test surface for this sprint |
| 6 | `sri-visibleau-sprint-3-prompt.md` | The sprint spec |

Please start Sprint3 by following the prompt from below mark down file
C:\startup\VisibleAU\src\docs\latets\CodePrompts\sri-visibleau-sprint-3-prompt.md