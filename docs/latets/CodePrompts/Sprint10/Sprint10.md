Please read throuhg the Below documents before write any single line of code
Documents location: C:\startup\VisibleAU\src\docs\latets\CodePrompts
## PER-SPRINT READING ORDER
| 1 | `CLAUDE.md` v1.5 | Master design doc — stack, architecture, conventions, anti-patterns | All of it (~5 min) |
| 2 | `sri-visibleau-foundations.md` v1.12 | Engineering foundations — folder structure, schema, patterns | §2 (folder structure) + §3 (schema) |
| 3 | `sri-visibleau-architecture-overview.md` v1.6 | How the system fits together | All of it |
| 4 | `sri-geo-aeo-prd-v1.md` v1.15 | The full PRD — what we're building and why | §3–§7 (product, pricing, regions) |
| 5 | `sri-visibleau-sprint-prompts-index.md` v1.1 | Sprint roadmap, dependencies, critical paths | All of it |
| 6 | `visibleau-prototype.jsx` | 44-screen UI prototype — visual reference only, NOT production code | Skim for layout awareness |

### SPRINT 10 — Onboarding + Sample Audit + Stripe Billing
*Goal: Self-serve signup → sample audit → Stripe Checkout + Customer Portal*

| Order | File | Why |
|-------|------|-----|
| 1 | `CLAUDE.md` v1.5 | Always first |
| 2 | `sri-geo-aeo-prd-v1.md` v1.15 | §7 Pricing Strategy (canonical prices + sample audit spec) + §7.6 A/B + §11 Sprint 10 |
| 3 | Stripe Checkout docs (live): stripe.com/docs/payments/checkout | Current Stripe API reference |
| 4 | Stripe webhook idempotency: stripe.com/docs/webhooks/best-practices | Critical — prevents tier flapping |
| 5 | `sri-visibleau-sprint-10-prompt.md` | The sprint spec |

> ⚠️ **Stripe webhook idempotency is a critical path item** — Sprint 10 is one of three highest blast-radius sprints. Without it, duplicate webhooks cause tier flapping and customer support nightmares.

Please start sprint10 by following the prompt from below mark down file
C:\startup\VisibleAU\src\docs\latets\CodePrompts\sri-visibleau-sprint-10-prompt.md