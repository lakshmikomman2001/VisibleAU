
Documents Location: C:\startup\VisibleAU\src\docs\latets\Sprints\Prompts

# VisibleAU — Claude Code Document Reading Order

**Purpose:** Hand this to Claude Code at the start of every new session or sprint.
The rule is simple: **CLAUDE.md is always read first, every sprint, no exceptions.**
Then the sprint-specific docs listed below. Nothing else unless the sprint prompt says so.

**Conflict rule:** If anything in a sprint prompt conflicts with CLAUDE.md or Foundations,
**stop and flag it to Sri before writing any code.**

---

## BEFORE STARTING ANY SPRINT (one-time setup read)

Read these once, in order, before sprint 1 begins:

| # | File | What it is | Sections to focus on |
|---|------|------------|----------------------|
| 1 | `CLAUDE.md` v1.5 | Master design doc — stack, architecture, conventions, anti-patterns | All of it (~5 min) |
| 2 | `sri-visibleau-foundations.md` v1.12 | Engineering foundations — folder structure, schema, patterns | §2 (folder structure) + §3 (schema) |
| 3 | `sri-visibleau-architecture-overview.md` v1.6 | How the system fits together | All of it |
| 4 | `sri-geo-aeo-prd-v1.md` v1.15 | The full PRD — what we're building and why | §3–§7 (product, pricing, regions) |
| 5 | `sri-visibleau-sprint-prompts-index.md` v1.1 | Sprint roadmap, dependencies, critical paths | All of it |
| 6 | `visibleau-prototype.jsx` | 44-screen UI prototype — visual reference only, NOT production code | Skim for layout awareness |

**Do not skip steps 1–5. These are the source of truth for every decision.**