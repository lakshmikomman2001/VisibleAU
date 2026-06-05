# VisibleAU — Design Document for Claude Code

**Version:** 1.5
**Date:** 15 May 2026
**Purpose:** Single grounding document Claude Code reads at the start of every sprint. Covers what VisibleAU is, the technology stack with rationale, the architecture, code conventions, and anti-patterns. Stable across sprints — sprint-specific work lives in the sprint prompts.

**File placement:** This should live at the repo root as `CLAUDE.md` so Claude Code auto-loads it. A copy may also live at `docs/DESIGN.md` for human reading.

---

## 0. How to use this document

**At the start of every sprint Claude Code does in this order:**

1. Read this document end-to-end (~5 minutes).
2. Read the sprint prompt for the current sprint (`docs/sprints/sprint-N-prompt.md` or equivalent).
3. Read `sri-visibleau-foundations.md` v1.9 if working on schema, folder structure, or core conventions.
4. Begin work on the sprint deliverables.

**This document answers:** what, why, how-it-fits.
**Sprint prompts answer:** what to build in THIS sprint, in what order.
**Foundations doc answers:** exact folder paths, schema columns, naming conventions.

If this doc and a sprint prompt conflict, the sprint prompt is more recent — flag the conflict and ask the operator (Sri).

If this doc and Foundations v1.9 conflict, Foundations wins on schema/folder/naming — flag the conflict and ask Sri.

---

## 1. What VisibleAU is

VisibleAU is a multi-tenant SaaS product that audits a brand's visibility across generative-AI search engines (ChatGPT, Claude, Gemini, Perplexity in v1). It is positioned for Australian small businesses in three verticals: Tradies, Allied Health, and SaaS.

**Core value loop:**

1. A brand owner signs up, creates a brand record (name + domain + vertical), and runs an audit.
2. The audit job sends 10 vertical-pack prompts to 4 LLM engines, 5 times each (200 calls total), then scores brand mentions across 5 dimensions (frequency, position, sentiment, context, accuracy).
3. The brand owner sees a composite visibility score 0-100 with 95% Wilson confidence intervals, per-engine breakdown, citation feed, and a recommended Action Center.
4. Recurring audits show drift over time and unlock paid-tier features (more brands, more verticals, more frequent audits).

**Primary buyer signal:** Australian agencies and small businesses are quietly anxious that ChatGPT/Perplexity/Gemini are replacing Google for many buyer journeys. They want to know: "do these engines mention my brand when relevant?" — and they want it answered without spending a month on it.

**Pricing tiers (PRD §7 canonical):**
- Free — 1 brand, 2 engines (ChatGPT + Perplexity), 20 prompts library, 1 audit/mo
- Starter A$99/mo — 1 brand, 4 engines, 50 prompts, weekly (4 audits/mo)
- Growth A$299/mo — 1 brand, 4 engines, up to 200 prompts (pack-size dependent in v1; see note), 3×/week (12 audits/mo)
- Agency A$499/mo — 5 brands, 4 engines, up to 100 prompts/brand, daily (30 audits/brand/mo = 150 total)
- Agency Pro A$1,499/mo — 25 brands, 4 engines, up to 200 prompts/brand (pack-size dependent in v1), 2×/day (60 audits/brand/mo = 1500 total)
- Enterprise — sales-led, custom (A$3,000+)
- One-off audit A$299 — single charge, conversion path to monthly
- Annual billing — 2 months free (16% discount)

**Library-size note (PRD §7, added v1.15):** The library size is a *cap*, not a guarantee. Actual prompts available = min(tier cap, vertical pack size). v1 ships 3 packs (Tradies 124 / Allied Health 104 / SaaS 108). A single-vertical Growth or Agency Pro customer sees up to the pack size (max 124); the 200-prompt cap fully unlocks in v1.1 when more packs or operator-curated cross-vertical prompts ship. Pricing-page copy must reflect this with "up to 200" framing.

**Direct competitor reference:** Hall Technologies (usehall.com.au) — Sydney-based, Blackbird-backed, 4-person team, 8 engines, sales-led pricing. VisibleAU's differentiation is AU-first vertical packs, transparent self-serve pricing, and dimension-level scoring with confidence intervals.

---

## 2. Scope — what's in v1, what's deferred

### In scope for v1 (Sprints 1-12)

- 4 LLM engines: ChatGPT, Claude, Gemini, Perplexity
- 3 vertical packs: Tradies (124 prompts), Allied Health (104), SaaS (108)
- Multi-tenant orgs via Clerk + Supabase RLS
- 5-dimension composite scoring with Wilson 95% confidence intervals
- 5 paid Stripe tiers + Free + Enterprise (sales-led) + one-off audit (A$299) + annual billing (2 months free)
- AU region as primary; UK/US/CA/NZ/EU available but feature-flagged
- Audit-completion email (Resend)
- PDF/CSV/JSON/SARIF/JUnit/GHA exports (Sprint 4 basic + Sprint 8 advanced)
- **Action Center with 11 universal research-backed recommendations** (Sprint 6) — citations from Tinuiti, SE Ranking, Princeton GEO, HubSpot AEO, TEAM LEWIS PR
- **Module 5b — Technical AI Infrastructure** (Sprint 7) — llms.txt generator, robots.txt config, schema audit, SSR check, answer capsule formatter + OSS-derived additions (27 AI bots, CDN crawler check, AI discovery endpoints, schema richness scoring, llms.txt depth scoring, AU Brand & Entity scoring, 47 citability methods, negative signals detection, prompt injection detection)
- **50-site validation corpus** (Sprint 7) — acceptance gate for Module 5b

**Audit-flow design decision (v1.3 added):** A single "Run Audit" click triggers BOTH the multidimensional audit (Sprint 3, 200 LLM calls, brand performance) AND the technical audit (Sprint 7, site crawler, infrastructure dimensions). They run in parallel; each completes independently. The audit-completion email summarizes both. Shared quota: one audit consumes one tier-quota slot. Per-audit cost budget rises from <US$3 (LLM only) to <US$3.50 (LLM + site crawler ~US$0.30). Audit-list shows multidim audits as the primary row with a "+ technical audit" badge when both completed. Drilldown UI: audit-results-rich page (Sprint 4) for multidim dimensions; technical-audit/page.tsx (Sprint 7) for infrastructure dimensions.
- **Module 4 — Local SEO + drift + webhooks** (Sprint 8) — GMB completeness, AU directories, NAP consistency, Wilson CI drift detection, Slack/Discord/Sheets/Airtable webhook integrations, confidence labels
- **Agency tier** (Sprint 9) — multi-brand workspace, agency dashboard, white-label PDF reports, client portal limited view, bulk export to CSV/GA4/Looker Studio, scheduled recurring audits
- **Onboarding + sample audit + Stripe billing** (Sprint 10) — self-serve flow, no-signup sample audit (1 engine ChatGPT, 5 prompts, ~90s, ~A$0.10), checkout, customer portal
- Vertical pack management UI (Sprint 5)

### Deferred to v1.1 (Q3 2026 post-launch)

- 2 more engines: Microsoft Copilot, Google AI Overviews (Growth+ tiers)
- TikTok citation tracking (placeholder UI in Sprint 8)
- Opus model on Agency Pro
- Topical authority gap analyzer (Growth+)
- LLM conversion attribution (Growth+)
- AI crawler logs analysis (Growth+)
- Citation Opportunities with auto-generated outreach briefs
- Persona Fan-Out (CMO/SEO Lead/Founder/Buyer prompt variants)
- Competitor Battlecards
- Pricing model A/B test (flat-rate vs token-based per PRD §7.6 — schedule 30 days post-launch)
- **REST API + OpenAPI spec for Growth+ tier external API access** — Foundations originally listed REST + OpenAPI as a v1 tech-stack lock, but no v1 sprint owns the spec generation. Deferred to v1.1 alongside the Growth+ API access feature. Use `zod-to-openapi` or `next-rest-framework` when added.

### Deferred to v1.2 (Q4 2026)

- 2 more engines: DeepSeek, Grok (Agency Pro tier)
- Topical sentiment segmentation
- Founder/personal brand visibility tracking
- WebMCP Readiness check
- Trust Stack Score (5-layer)

### Out of scope (do not build, do not propose)

- Multi-workspace per org (single workspace per org in v1)
- White-label / agency-rebrand features
- Custom prompt authoring by end users (vertical packs are curated)
- Real-time monitoring (audits are scheduled, not streaming)
- Mobile app (responsive web only)
- Browser extensions
- Self-hosted deployment (SaaS only)
- Public API (v2 consideration)

If a sprint prompt asks for something in "out of scope," flag the conflict to Sri before building.

---

## 3. Technology stack with rationale

Every choice has a reason. If Claude Code is tempted to swap a layer for something else (e.g., "Drizzle is great, but Prisma might be easier") — stop and ask Sri first. These choices were made deliberately.

### Frontend

- **Next.js 15 (App Router, React 19)** — Server components let DB queries colocate with rendering. App Router supports streaming SSR and route groups (we use `app/(auth)/` for protected routes). React 19 enables `use` hook for async data.
- **Tailwind CSS v4** — Utility-first. Fast iteration without leaving the JSX. v4's new build pipeline drops PostCSS dependency.
- **shadcn/ui** — Component primitives copy-pasted into the codebase (not installed as a dep). Owned, not consumed. Built on Radix UI + Tailwind.
- **lucide-react** — Icon library. Tree-shakeable.
- **TypeScript 5.5+** — Strict mode. No `any` unless flagged with a `// TODO(any):` comment and a reason.

### Backend

- **Next.js API routes (App Router)** — `app/api/<resource>/route.ts` pattern. Server-side only; secrets stay server-side.
- **Drizzle ORM** — TypeScript-first ORM, generates types from schema. We use the SQL builder API (not the query builder). Why Drizzle over Prisma: smaller runtime footprint, no separate generator step, transparent SQL.
- **PostgreSQL 16 via Supabase** — Relational with `jsonb`, `pgEnum`, `pgvector` available if needed later. Hosted on Supabase Sydney (ap-southeast-2). PRD §10 canonical: Supabase chosen for Row Level Security (RLS) which helps multi-tenancy. Supabase Storage handles PDF reports + branded assets.
- **Inngest** — Durable background jobs for audit execution. Why Inngest: managed durable execution, replay-on-failure, observability dashboard, free tier for our v1 volume.
- **Clerk** — Auth + multi-tenant org primitives. Why Clerk: organizations + members API works out-of-the-box; reduces 2-3 sprints of auth work.
- **Stripe** — Subscription billing. Test-mode keys in dev; webhooks handle subscription lifecycle.
- **Resend** — Transactional emails. Why Resend: clean API, React Email templates, generous free tier.

### LLM layer

- **Unified `lib/llm/LLMService` interface via Vercel AI SDK** — abstraction over all 4 providers using the `ai` package + `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google` providers. Per PRD §10 canonical: "Vercel AI SDK abstracting OpenAI, Anthropic, Google AI, Perplexity. Multi-provider abstraction is critical given the rapidly-evolving LLM landscape." Implementation files (`openai-impl.ts`, `anthropic-impl.ts`, etc.) wrap Vercel AI SDK calls behind a stable interface that keeps mock-mode swap clean.
- **`lib/llm/model-selector.ts`** — pure function `selectModel(tier, engine, task)` returns the correct model string per tier × engine × task. Tier-aware: Agency Pro uses GPT-4o/Sonnet/1.5-pro/sonar-pro; Free/Starter uses cheaper variants; sentiment/context tasks always use the cheapest model regardless of tier.
- **`lib/llm/mock-responses/<engine>/<scenario>.json`** — JSON fixtures for mock LLM mode (LLM_MODE=mock). 4 canonical scenarios per engine: `happy_path`, `no_mention`, `partial_failure`, `rate_limited`. Used for local dev + CI + E2E tests. Real API calls are gated behind `E2E_USE_REAL_LLM=true`.

### Testing

- **Vitest** — unit + integration tests. Why Vitest: fast, ESM-native, Jest-compatible API.
- **Playwright** — E2E tests against real browser + real backend + real Postgres (test database).
- **Mock LLM mode default** — `LLM_MODE=mock` in `.env.local`. Real LLM calls only when explicitly enabled.

### Tooling

- **pnpm** — package manager. Why pnpm: faster than npm, strict by default, content-addressable store.
- **Biome** — linter + formatter. Replaces ESLint + Prettier.
- **GitHub Actions** — CI. Tests + lint + type-check on every PR.
- **Vercel** — hosting + CDN. Database is Supabase Sydney (separate from Vercel).
- **PostHog** — product analytics + funnel tracking. PRD §10: "Self-hosted option for AU data residency." v1 starts on PostHog Cloud; self-host evaluated month 6+.

### Cost-control architecture (PRD §10 — 4 layers)

LLM cost discipline is the #1 engineering priority. Naive implementation = 30% gross margin; full 4-layer architecture = 85-92% gross margin per PRD targets.

- **Layer 1 — Response cache** — Cache LLM responses for 24-72h by `(prompt, model)` tuple. If 5 customers ask "best CRM Australia" within 48h, only 1 LLM call. Implemented Sprint 2. Reduces costs ~70% at scale.
- **Layer 2 — Smart re-query schedule (canary prompts)** — Don't re-query a prompt every audit if model behavior hasn't drifted. Daily canary prompts detect drift; only full re-audit when canary signals change. Implemented Sprint 3. Reduces calls another ~40%.
- **Layer 3 — Tier-based provider routing** — Free/Starter use cheapest competent model (gpt-4o-mini, claude-haiku); Growth uses mid-tier; Agency Pro uses top models. Implemented Sprint 3 via `model-selector.ts`.
- **Layer 4 — Citation detection efficiency** — Regex + entity matching for 80% of citations (cheap); LLM for ambiguous 20% (expensive but accurate). Implemented Sprint 2.

---

## 4. Architecture — how the pieces fit

### High-level request flow

```
Browser
  ↓
Next.js App Router (server components + API routes)
  ↓
Clerk middleware (auth + org context)
  ↓
Drizzle ORM
  ↓
Vercel Postgres (now: Supabase Postgres Sydney, with RLS policies)
```

### Audit job flow

```
POST /api/audits (Next.js API route)
  ↓
Insert audits row (status=pending)
  ↓
inngest.send("audit.run") with auditId
  ↓
[Async] Inngest worker picks up event
  ↓
Inngest function run-audit.ts:
  1. Load brand context (vertical pack → 10 prompts)
  2. For each (engine, prompt, run) combination = 4 × 10 × 5 = 200 calls:
     - Call LLMService.complete({ tier, engine, task: 'brand_mention', prompt })
     - LLMService → selectModel() → openai-impl/anthropic-impl/etc → real API OR mock fixture
     - Parse response: was brand mentioned? At what position? Sentiment? Context?
     - Insert citations row per detected mention
  3. Compute multidimensional scores (5 dimensions) + Wilson 95% CIs from the 5 runs
  4. Update audits row (status=complete, scores, CI, totalCostUsd, metadata)
  5. inngest.send("audit.complete") → triggers email function
  ↓
[Async] send-audit-complete-email.ts:
  - Resend API call with React Email template
```

Total audit time at production scale: 4-6 minutes per audit (mostly LLM API latency). Cost: ~US$2-3 per audit (well within the <$3 budget per PRD spec). Sprint 2's narrower scope (1 engine × 10 prompts × 1 run = 10 calls) has a <$0.10 budget.

### Tier-aware model dispatch

The single source of truth for model selection is `lib/llm/model-selector.ts`. The exported `selectModel(tier, engine, task)` function returns:

- `task='brand_mention'` (the primary task): tier-aware — Free/Starter get cheapest (e.g., `gpt-4o-mini`), Agency/Agency Pro get top-tier (e.g., `gpt-4o`).
- `task='sentiment'` or `task='context'`: always cheapest model regardless of tier. Quality on extracted snippets is fine at the cheap tier; this is the cost control.

Sprint 3 test coverage: 72 combinations (6 tiers × 4 engines × 3 tasks) all asserted in `tests/llm/model-selector.test.ts`. Do not skip writing these tests — they prevent silent regression of the Agency Pro value prop.

### Multi-tenancy model

- One `organizations` row per Clerk org.
- One or more `users` rows per org (Clerk-managed via webhook sync).
- All resource rows (`brands`, `audits`, `citations`) carry `organizationId UUID NOT NULL`.
- Every protected API route + page checks `currentUser.organizationId` server-side.
- **Cross-org access returns 404, not 401.** This pattern is intentional — it avoids leaking the existence of resources to unauthorized orgs.

### Region handling

- `lib/region/detect.ts` exports `detectRegion({ pathname, geoCountry })` as a pure function. Used by Next.js middleware to read the region.
- 6 supported regions: AU (default), NZ, UK, US, CA, EU.
- Some features (e.g., Free tier) are region-gated via env-driven `lib/feature-flags/`.
- Brand creation inherits the org's region; orgs are pinned to their signup region (changing region is a v2 concern).

---

## 5. Data model — schema highlights

Full schema lives in `sri-visibleau-foundations.md` v1.12 §3 (the schema source of truth). Highlights you'll use in nearly every sprint:

### `organizations`

- `id UUID PK`
- `clerkOrgId TEXT UNIQUE` — sync from Clerk webhook
- `name TEXT`
- `region TEXT` — 'au' | 'nz' | 'uk' | 'us' | 'ca' | 'eu'
- `tier TEXT` — 'free' | 'starter' | 'growth' | 'agency' | 'agency_pro' | 'enterprise'
- `stripeCustomerId TEXT NULL`
- `stripeSubscriptionId TEXT NULL`
- `createdAt`, `updatedAt`, `deletedAt`

### `brands`

- `id UUID PK`
- `organizationId UUID FK` → organizations.id
- `name TEXT`
- `domain TEXT`
- `vertical TEXT` — 'tradies' | 'allied_health' | 'saas'
- `region TEXT` — inherits org.region at create time
- `competitors TEXT[]`
- `primaryRegions TEXT[]` — for tradies/allied-health: suburb/area list
- `createdAt`, `updatedAt`, `deletedAt`

### `audits`

- `id UUID PK`
- `brandId UUID FK` → brands.id
- `organizationId UUID FK` — denormalized for query simplicity
- `auditNumber INTEGER` — per-org sequential (1, 2, 3...)
- `status TEXT` — 'pending' | 'running' | 'complete' | 'failed'
- `engines TEXT[]` — which engines ran in this audit
- `promptsCount INTEGER`, `runsPerPrompt INTEGER`, `totalCalls INTEGER`
- `scoreComposite NUMERIC(5,2)` — 0-100
- `scoreFrequency`, `scorePosition`, `scoreSentiment`, `scoreContext`, `scoreAccuracy` — each 0-100
- `scoreSentimentNumeric`, `scoreContextNumeric` — numeric variants for composite math
- `confidenceIntervals JSONB` — `{ frequency: { lower, upper }, ... }` from Wilson math
- `totalCostUsd NUMERIC(10,4)`
- `metadata JSONB` — free-form. Sprint 2 uses for `{ mockScenario }`. Future sprints may use for other context.
- `createdAt`, `completedAt`

### `citations`

- `id UUID PK`
- `auditId UUID FK`
- `engine TEXT`
- `prompt TEXT`
- `runNumber INTEGER` — 1-5
- `brandMentioned BOOLEAN` — primary detection result
- `position INTEGER NULL` — where in the response (1 = first mention)
- `sentimentLabel TEXT NULL` — 'positive' | 'neutral' | 'negative'
- `sentimentScore NUMERIC NULL` — numeric variant
- `contextLabel TEXT NULL` — 'recommended' | 'listed' | 'mentioned' | 'commodified'
- `responseSnippet TEXT` — the actual LLM response (truncated)
- `citedSources JSONB` — array of `{ domain, url }`
- `createdAt`

### Other tables

- `subscriptions` — Stripe sync
- `audit_schedules` — for scheduled recurring audits (Sprint 9)
- `action_items` — recommendations from Action Center (Sprint 6)
- `vertical_packs` — prompt content (Sprint 5)

Key invariant: `audits.scoreContext` for the value `commodified` maps to **25**, not 0. This was changed in Round 29. Hardcoding 0 is a regression.

---

## 6. Folder structure — canonical

Per Foundations v1.12 §2:

```
app/
├── (auth)/                       # Clerk-protected route group
│   ├── dashboard/
│   ├── brands/
│   ├── audits/
│   ├── portfolio/
│   └── settings/
├── (marketing)/                  # Public route group
├── api/                          # API routes
│   ├── audits/[id]/route.ts
│   ├── brands/[id]/route.ts
│   ├── webhooks/clerk/route.ts
│   ├── webhooks/stripe/route.ts
│   └── webhooks/inngest/route.ts
├── layout.tsx
└── page.tsx

components/
├── ui/                           # shadcn/ui primitives (copy-pasted)
└── domain/                       # VisibleAU-specific components

lib/
├── llm/                          # LLM abstraction
│   ├── interface.ts              # LLMService interface
│   ├── index.ts                  # Unified service (dispatch by env)
│   ├── model-selector.ts         # Pure function: tier × engine × task → model string
│   ├── openai-impl.ts
│   ├── anthropic-impl.ts
│   ├── google-impl.ts
│   ├── perplexity-impl.ts
│   ├── mock-impl.ts              # Thin loader class for JSON fixtures
│   └── mock-responses/
│       ├── chatgpt/{happy_path,no_mention,partial_failure,rate_limited}.json
│       ├── claude/{...}.json
│       ├── gemini/{...}.json
│       └── perplexity/{...}.json
├── verticals/                    # AU vertical packs
│   ├── tradies.ts
│   ├── allied-health.ts
│   ├── saas.ts
│   └── shared/
├── locations/                    # AU suburb/area data
├── research/                     # Confidence-labeled citations for Action Center
├── region/                       # Region detection
│   ├── detect.ts
│   └── index.ts
├── feature-flags/                # Env-driven feature flags
│   └── index.ts
├── brands/                       # Brand domain logic (CRUD authorisation, region inheritance)
│   └── index.ts
└── utils/                        # Pure utilities

db/
├── schema/                       # Drizzle schemas split by domain
│   ├── organizations.ts
│   ├── brands.ts
│   ├── audits.ts
│   ├── citations.ts
│   ├── enums.ts                  # Tier, Region, Vertical, etc.
│   └── index.ts                  # Barrel export
├── client.ts                     # Drizzle client instance
└── migrations/                   # drizzle-kit generated

inngest/
├── client.ts
└── functions/
    ├── run-audit.ts
    └── send-audit-complete-email.ts

tests/
├── unit/
├── integration/
├── e2e/
└── llm/
    └── model-selector.test.ts
```

Do not invent new top-level folders without operator approval.

---

## 7. Code conventions

### Authorization

- **Cross-org access returns 404, not 401.** Every protected route compares `resource.organizationId === currentUser.organizationId` server-side. Mismatch → `notFound()`.
- Clerk middleware enforces `app/(auth)/*` routes are authenticated. Inside, you still verify org ownership for every resource read.
- API routes mirror page routes: same auth check pattern.

### Data access

- **Server components query the DB directly.** No "always go through an API route" rule — server components are server-side.
- **Client components fetch via API routes or via passed props from a parent server component.**
- Use Drizzle's SQL builder API (`db.select().from(...)`). Avoid the higher-level Query API.

### Error handling

- API routes return `Response.json({ error: '...' }, { status: 400 })` for client errors.
- Server-side unexpected errors throw; Next.js error boundary renders `error.tsx`.
- Audit job errors persist to `audits.metadata.error` and set `status='failed'` — do not silently retry forever (Inngest has retry caps; let it stop).

### Naming

- TypeScript: `camelCase` for variables/functions, `PascalCase` for components/types, `SCREAMING_SNAKE_CASE` for constants.
- DB columns: `snake_case` (Drizzle maps to camelCase in TS via the column definition).
- Files: `kebab-case.ts` for utilities, `PascalCase.tsx` for components.

### Imports

- Use `@/` path alias for `src/` root (configured in tsconfig).
- Group imports: external → `@/` → relative.
- No barrel imports from deep modules (`import { x } from '@/lib/llm'` not `import { x } from '@/lib/llm/openai-impl'`).

### Soft deletes

- `brands`, `audits` have `deletedAt TIMESTAMPTZ NULL`.
- "Delete" sets `deletedAt = NOW()`. Hard delete is not exposed to users.
- All read queries filter `WHERE deletedAt IS NULL`.

### Pricing math

- All Stripe products priced in **AUD**. Display prices include GST.
- Per-audit cost target: <US$3 (≈A$4.50) for a full Sprint 3 paid-tier multidim audit (200 LLM calls); ~US$1.50 for Free tier (100 calls); **<US$3.50 combined** when N3 design fires multidim + technical audit on a single "Run Audit" click (adds ~US$0.30 Playwright site-crawler). Sprint 2 narrower scope: <$0.10.
- Compute audit cost from real API responses (tokens × per-model pricing) — do not estimate, store the actual.

---

## 8. Anti-patterns — never do these

### LLM layer

- **Never** call LLM provider SDKs directly outside `lib/llm/*-impl.ts`. Always go through `LLMService.complete()`.
- **Never** hardcode model strings outside `model-selector.ts`. The reason this matters: tier-aware model selection is the Agency Pro value prop. Hardcoding `'gpt-4o-mini'` somewhere bypasses the dispatcher.
- **Never** run real LLM API calls in tests by default. Use `LLM_MODE=mock`. Real-LLM tests are gated behind `E2E_USE_REAL_LLM=true` and run manually, not in CI.
- **Never** add a new mock scenario without adding it to the canonical 4 (`happy_path`, `no_mention`, `partial_failure`, `rate_limited`). The canonical scenario list is locked across Foundations v1.9 + Sprints v1.12 + test docs. Adding scenarios requires Sri's approval.

### Auth + multi-tenancy

- **Never** skip the `organizationId` check on a resource read. Even on a "read-only" endpoint.
- **Never** return 401 on cross-org access. Return 404.
- **Never** allow a brand to belong to two orgs. Orgs are tenancy boundaries.

### Schema

- **Never** add a column to a table without updating Foundations v1.9's schema section AND adding a Drizzle migration.
- **Never** use `text` where a `pgEnum` exists. Use the enum (e.g., `tier`, `region`, `vertical`).
- **Never** hardcode the `commodified` context score as 0. It's 25.

### Testing

- **Never** mark a test `.skip` without a `// TODO(skip):` comment explaining why and when it'll be unskipped.
- **Never** test against the production database. Tests use the `_test` database with truncate-between-tests.
- **Never** commit a real API key. `.env.local` is gitignored; CI uses GitHub secrets.

### General

- **Never** add a new top-level folder without Sri's approval.
- **Never** swap a library on the canonical stack (e.g., Drizzle → Prisma, Inngest → Trigger.dev) without raising the question first.
- **Never** delete a doc-set file in `docs/` thinking it's obsolete. The audit history matters.

---

## 9. Testing strategy

### Unit tests (Vitest)

- Pure-function tests: scoring math, model-selector, Wilson CI math, region detection.
- Drizzle-free where possible (test pure logic, not DB integration).
- Target: <10 second suite runtime.

### Integration tests (Vitest)

- Hit the real DB (test database).
- Test API route handlers with mocked Clerk session.
- Use `LLM_MODE=mock` for LLM-touching paths.
- Target: <60 second suite runtime.

### E2E tests (Playwright)

- Drive the real browser against a running Next.js dev server.
- Use real Postgres test database, real Inngest dev server, real Stripe test mode.
- Use `LLM_MODE=mock` by default. `E2E_USE_REAL_LLM=true` for nightly smoke (manual).
- Sprint 1 E2E: auth + brand CRUD + multi-tenant isolation.
- Sprint 2 E2E: single-engine audit creation + citation persistence.
- Sprint 3 E2E backend tests: multi-engine + multidimensional scoring + Wilson CIs.
- Sprint 3 E2E frontend tests: audit results UI assertions using `happy_path` scenario fixtures (with Gemini/Perplexity fixtures using weaker brand-mention language for per-engine variance).

### Test data

- Seeded test database has 2 orgs, 3 brands per org, 5 audits per brand.
- The 50-site validation corpus (Sprint 7 prerequisite) lives in `tests/fixtures/validation-corpus/` and exercises real domains across regions and verticals — but only against mock LLM.

---

## 10. Per-sprint workflow

### Sprint kickoff (Claude Code, at start of every sprint)

1. **Re-read this document.** Especially §6 conventions and §8 anti-patterns.
2. **Read the sprint prompt** — `sri-visibleau-sprint-N-prompt.md` (or `sri-visibleau-sprints-1-3.md` for Sprints 1-3 which are bundled).
3. **Read Foundations** if touching schema or core conventions.
4. **Ask Sri** any clarifying questions before starting.

### During the sprint

- Work through the sprint prompt's numbered steps.
- Run unit + integration tests after each meaningful change.
- Commit at logical checkpoints with clear messages.
- Surface blockers immediately (do not silently work around).

### Sprint acceptance

Each sprint has a multi-doc acceptance gate. For Sprint 1 specifically:

- All tests pass: `pnpm test` (unit + integration) + `pnpm test:e2e` (Playwright)
- `sri-visibleau-sprint-1-tests.md` v1.4 unit/integration checklist passes
- `sri-visibleau-sprint-1-e2e-tests.md` v1.2 E2E checklist passes
- `sri-visibleau-sprint-1-qa-validation.md` v1.3 manual QA checklist passes
- `sri-visibleau-sprint-1-claude-code-qa.md` v1.2 per-feature QA passes
- Lint + type-check pass: `pnpm lint` + `pnpm typecheck`

If any acceptance step fails, do not move to the next sprint. Fix forward.

### Sprint handoff

After Sprint N's acceptance gate passes:
- Tag a git release (`v0.N.0`).
- Update `CHANGELOG.md` with what shipped.
- Sri reviews + signs off before Sprint N+1 starts.

---

## 11. Reference documents

These live alongside this design doc (typically `docs/` directory or in the canonical bundle):

### Product + strategy

- `sri-geo-aeo-prd-v1.md` (PRD v1.14) — the "what" and "why" at full depth, including business model, market positioning, and competitive analysis
- `sri-visibleau-foundations.md` (v1.9) — engineering "how": exact folder paths, schema columns, naming conventions. The source of truth when this design doc is silent on detail.
- `sri-visibleau-architecture-overview.md` (v1.4) — high-level architecture decisions + OSS reference posture
- `sri-visibleau-multi-region-phase-2.md` (v1.0) — multi-region rollout plan

### Sprint prompts

- `sri-visibleau-sprint-prompts-index.md` (v1.0) — master index across all 12 sprints with dependencies, critical paths, and estimated timeline
- `sri-visibleau-sprint-1-prompt.md` through `sri-visibleau-sprint-12-prompt.md` — all 12 sprint prompts drafted (v1.0 set, 12 May 2026)
- Each sprint prompt is self-contained: prereqs, deps, schema, APIs, frontend, tests, acceptance, pitfalls, handoff
- Sprint prompts may be refined as build progresses (bump version + changelog when updating)

### Test specs

- `sri-visibleau-sprint-1-tests.md` (v1.4) — Sprint 1 unit + integration tests
- `sri-visibleau-sprint-1-e2e-tests.md` (v1.2) — Sprint 1 Playwright E2E
- `sri-visibleau-sprint-1-qa-validation.md` (v1.3) — Sprint 1 manual QA
- `sri-visibleau-sprint-1-claude-code-qa.md` (v1.2) — Sprint 1 per-feature QA
- `sri-visibleau-sprint-2-e2e-tests.md` (v1.3) — Sprint 2 E2E (audit creation flow)
- `sri-visibleau-sprint-3-backend-tests.md` (v1.3) — Sprint 3 backend Vitest tests (includes model-selector.test.ts)
- `sri-visibleau-sprint-3-frontend-e2e-tests.md` (v1.3) — Sprint 3 frontend E2E
- `sri-visibleau-sprint-3-qa-validation.md` (v1.0) — Sprint 3 manual QA
- `sri-visibleau-sprint-3-claude-code-qa.md` (v1.3) — Sprint 3 per-feature QA
- `sri-visibleau-sprint-3-staging-qa.md` (v1.2) — Sprint 3 staging QA

### Prototype

- `visibleau-prototype.jsx` — 44-screen React prototype, Babel-validated. Visual + UX reference. NOT production code — re-implement using real data from sprint deliverables.

### Audit history (do not skip during onboarding)

- `sri-visibleau-doc-index.md` — master index of every doc + version + last-updated
- Round 1-32 audit reports — show how the doc set evolved and why current conventions exist

---

## 12. Operator working preferences

Sri's locked preferences. Match these in every interaction:

- **Direct.** No padding. No "I hope this helps." No round-number padding. If the answer is two paragraphs, write two paragraphs.
- **Push back.** If a sprint prompt asks for something that conflicts with this design doc or with Foundations v1.9, raise the conflict before building.
- **Mobile-readable.** Short paragraphs. Clear headings.
- **Verification before claim.** When citing "per Foundations §X" or "per Sprint Y", grep the source first. Paste the verified text into your reasoning if there's any doubt.
- **Weekend pace.** Sri works ~8 hours/week. Sprints are sized for this — do not propose adding features that extend timelines without Sri's explicit ask.
- **No personal-life advice.** Engineering work only.

---

## 13. When this document changes

This document is stable across sprints by design. Update it only when:

- A new sprint introduces a new layer (e.g., adding pgvector in Sprint N → update §3 stack)
- A canonical doc version bump changes a referenced detail (e.g., Foundations v1.9 → v2.0 changes a folder path)
- An anti-pattern is added or removed via operator decision
- The scope (§2) shifts (e.g., a v1.1 feature gets pulled forward to v1)

When updating, bump this doc's version (currently v1.3), add a changelog entry below, and flag the change to Sri.

### Changelog

- v1.5 (15 May 2026): **Sixth-pass audit — schema references updated.** §5 + §6 Foundations version refs bumped v1.9 → v1.12 (current). Foundations v1.12 reconciled organizations/users schemas to CLAUDE.md Clerk model (T5+T6 fixes). No CLAUDE.md content changed — it was already canonical; Foundations was the outlier.
- v1.3 (13 May 2026): **Second-pass-fix audit** — 4 issues. **(N15)** §13 self-reference "currently v1.0" → "currently v1.2". **(N3)** §2 added explicit audit-flow design decision: Run Audit triggers both multidimensional (Sprint 3) and technical (Sprint 7) audits in parallel; shared quota; per-audit cost budget rises to <US$3.50 to cover site crawler. **(N4)** §1 pricing-tier list — Growth/Agency Pro "200 prompts" → "up to 200 prompts (pack-size dependent in v1)"; added library-size note explaining cap-vs-pack-size in v1 (max 124 in single vertical until v1.1). **(N17)** §2 deferred-to-v1.1 list adds "REST API + OpenAPI spec for Growth+ tier" since no v1 sprint currently owns the spec generation despite Foundations listing it as a lock.
- v1.2 (12 May 2026): **Conflict-resolution fixes per 29-conflict audit.** §1 prices corrected to PRD §7 canonical (Starter A$99, Growth A$299; was A$49/A$199). Free tier engines specified as ChatGPT + Perplexity (PRD canonical). §3 stack updated: Supabase Postgres + RLS (was Vercel Postgres); Vercel AI SDK (was direct provider SDKs); PostHog analytics added; Supabase Storage added. §3 cost-control architecture expanded to PRD's full 4 layers (response cache, canary prompts, tier-based routing, citation regex+entity). §2 scope rewritten to reflect sprint scope alignment: Sprint 7 = Module 5b core + OSS additions; Sprint 8 = Local SEO + drift + webhooks; Sprint 9 = Agency tier; Sprint 10 = Onboarding + sample audit + Stripe. One-off audit (A$299) + annual billing (16% discount) added. v1.1/v1.2 deferral lists expanded per PRD §8.
- v1.1 (12 May 2026): §11 updated — all 12 sprint prompts now drafted upfront (was: incremental). Master index at `sri-visibleau-sprint-prompts-index.md`. Each sprint prompt covers prereqs, deps, schema, APIs, frontend, tests, acceptance, pitfalls, handoff in a consistent template. Refinement still happens per-sprint via version bumps + changelogs in each sprint file.
- v1.0 (12 May 2026): Initial draft.
