# Sprint 7 — Technical AI Infrastructure (Module 5b) + OSS Additions

**Sprint:** 7 of 12
**Estimated effort:** 130-180 hours (~16-22 weekends at 8 hrs/week — PRD §11 "~22 additional days vs baseline")
**Goal:** Build the v1.3 differentiator. Module 5b core (5 features) + OSS-derived audit dimensions (10 features) + 50-site validation corpus. Spearman correlation > 0.7 between audit scores and observed citation patterns is the acceptance gate.
**Prerequisites:** Sprint 6 complete. Action Center generating recommendations from multidimensional audits.
**Out of scope:** Local SEO module (moved to Sprint 8 per PRD §11), drift detection (Sprint 8), agency tier multi-brand (Sprint 9).

**Audit-flow design decision (v2.1 added, per second-pass-fix N3):** The technical audit runs **in parallel with the multidimensional audit** triggered by Sprint 4's "Run Audit" button. One click fires `audit/start` Inngest event → both `inngest/functions/run-audit.ts` (Sprint 3, 200 LLM calls) AND `inngest/functions/technical-audit-run.ts` (this sprint, site crawler) fire. Each completes independently; the audit-completion email summarizes both. **Shared quota:** one Run Audit click = one tier-quota slot (TIER_AUDIT_LIMITS per Sprint 9). **Cost budget:** per-audit budget rises from <US$3 (LLM only) to <US$3.50 to cover ~US$0.30 site-crawler cost (Playwright + bandwidth). **UI:** Sprint 4's audit-list shows the multidim audit as the primary row; a "+ technical audit" badge marks rows where both completed. The technical-audit page (`/brands/[id]/technical-audit`) shows the 8-dim drill-down + 5-cat rollup. CLAUDE.md §2 captures this design decision.

---

## 0. Read first

1. `CLAUDE.md`
2. `sri-geo-aeo-prd-v1.md` v1.14 §8 Module 5b (5 core features) + §8.8 OSS-derived additions + §11 Sprint 7 expanded scope + §16 OSS reference strategy
3. `visibleau-prototype.jsx` lines 2458-2870 (5 dedicated Module 5b screens + Brand & Entity audit + 47 citability methods page)
4. Reference (do NOT import as dependency): `Auriti-Labs/geo-optimizer-skill` README + SCORING_RUBRIC.md — methodology reference only

**This is the largest sprint by effort.** Sprint 7 v2.0 absorbs ~22 days of work that v1.0 underestimated as ~22 hours. Read PRD §11 carefully before committing to the timeline.

---

## 1. What ships this sprint

### Module 5b core (5 features per PRD §8)

- ✓ **llms.txt generator + validator** — Crawls customer site, identifies key pages by traffic + topical authority, generates compliant llms.txt in Markdown per Jeremy Howard's proposed standard. Validates (correct format, <10KB, served as text/plain or text/markdown). One-click download OR hosted via VisibleAU CDN. Auto-regenerates monthly. **Graduated /18 depth scoring** (per §8.8): 6 components — present, H1+blockquote, sections, links, depth, llms-full.txt companion.
- ✓ **robots.txt AI crawler configuration helper** — Suggests robots.txt entries for AI crawlers. **27 AI bots tracked across 3 tiers** (per §8.8 — use Auriti-Labs list with MIT attribution): Tier 1 must-allow (GPTBot, ChatGPT-User, ClaudeBot, anthropic-ai, PerplexityBot, Google-Extended, AppleBot-Extended); Tier 2 emerging (CCBot, BingBot, Mistral, DeepSeekBot, GrokBot, etc.); Tier 3 data crawlers (DataForSeoBot, AhrefsBot, etc.). Customer opts in/out per crawler.
- ✓ **Schema markup auditor (with reality-check)** — Scans existing schema markup, identifies gaps (Organization, LocalBusiness, FAQPage, Article). **Schema richness scoring /16** (per §8.8): count attributes per JSON-LD object. Reports honest impact: "Schema markup helps Google AI Overviews via traditional snippets (medium impact). Schema markup itself shows zero measurable impact on ChatGPT, Claude, Perplexity, Gemini per SE Ranking research."
- ✓ **Server-side rendering (SSR) check** — Detects whether key pages render content server-side (AI crawler visible) or client-side only (AI invisible). Critical for SPA-heavy sites. Per-page render-mode report. JS rendering check: content accessible without JavaScript? SPA framework detection.
- ✓ **Answer capsule formatter helper** — Identifies question-based H2/H3 headings on customer site, checks whether each is followed by a 20-25 word direct answer (the "answer capsule" pattern), suggests rewrites where missing.

### OSS-derived additions (per PRD §8.8 + §16)

- ✓ **CDN crawler access check** — Cloudflare/Akamai/Vercel blocking detection for GPTBot/ClaudeBot/PerplexityBot. Surface explicit "your CDN is blocking AI crawlers" warning with vendor-specific remediation steps.
- ✓ **AI discovery endpoints check** — `.well-known/ai.txt`, `/ai/summary.json`, `/ai/faq.json`, `/ai/service.json`. Emerging standards; check presence + validity.
- ✓ **AU-localised Brand & Entity scoring** — **ABN Lookup verification + Wikipedia AU presence + AU TLD signal + AU directory aggregate** (Hipages, Yellow Pages AU, ServiceSeeking, Word of Mouth). Sprint 7-original AU layer.
- ✓ **47 citability methods catalogue** — Top-10 publicly visible on `/methodology` page (Sprint 11 polishes; Sprint 7 stubs the route). Full 47 with effect-size deltas surfaced in Action Center evidence-links. Sources: Princeton KDD 2024 + AutoGEO ICLR 2026.
- ✓ **Negative signals detection (8 patterns)** — CTA overload, popup density, thin content (<300 words), keyword stuffing, missing author, high boilerplate ratio, broken outbound links, ad density. Each scored 0-10; aggregated into "negative signals score" (lower is better).
- ✓ **Prompt injection detection (8 patterns)** — Hidden text, invisible Unicode, LLM-instruction injections, HTML comment injection, monochrome text, micro-font, data-attr injection, aria-hidden abuse. Each flagged with severity (critical/warning/info). Reports detected pattern + offending element.
- ✓ **8 audit dimensions internally → 5 surfaced** (per §16 Gap D UX decision): score internally against 8 categories (Robots /18, llms.txt /18, Schema /16, Meta /14, Content /12, Brand & Entity /10, Signals /6, AI Discovery /6 = 100 pts) for diagnostic precision; surface as 5 Foglift-style categories rolled-up (Technical / Content / Authority / Schema / Performance-stub-for-v1.1). Disclosure UI expands 5 → 8.
- ✓ **Brand & Entity audit screen** — `/brands/[id]/brand-entity-audit` (per prototype line 2786). ABN Lookup card, Wikipedia AU card, AU TLD card, AU directory aggregate card.

### 50-site validation corpus (acceptance gate)

- ✓ **50 real-site corpus assembled** — 5 AU Tradies + 5 AU Allied Health + 5 AU SaaS + 5 each US/UK/CA/NZ + 5 known-good high-citation + 5 known-bad low-citation = 50 sites
- ✓ **Spearman correlation gate** — Sprint 7 audit scores must correlate > 0.7 with observed citation patterns from Sprint 3 multidimensional audits. If <0.7, the audit is mostly noise and Sprint 7 does NOT pass acceptance.
- ✓ **ATTRIBUTIONS.md** — Comprehensive credit to OSS reference layer (Auriti-Labs, Princeton GEO, AutoGEO, Tinuiti, SE Ranking, etc.) per PRD §16

**Definition of done:** A brand has 8 technical-infrastructure dimensions scored 0-100 each + roll-up to 5-category UI. Customer can generate compliant llms.txt + robots.txt. Schema audit reports gaps + reality-check. SSR check identifies invisible pages. Answer capsule formatter rewrites Q-headings. Brand & Entity audit shows AU-localised presence. 47 citability methods catalogue visible in Action Center evidence-links. Negative signals + prompt injection detection report site quality issues. 50-site validation corpus passes Spearman > 0.7 gate.

---

## 2. Dependencies to install

```bash
# Site crawling + parsing
pnpm add playwright cheerio
pnpm add @mozilla/readability jsdom

# Schema.org validation
pnpm add schema-dts

# Markdown for llms.txt generation
pnpm add unified remark-parse remark-stringify

# `simple-statistics` already installed Sprint 3 — used for Spearman correlation
```

---

## 3. Environment variables (additions)

```bash
# ABN Lookup (free AU government API)
ABN_LOOKUP_GUID=...   # request at abr.business.gov.au

# Site crawler tuning
CRAWLER_MAX_PAGES_PER_SITE=20
CRAWLER_TIMEOUT_MS=15000
CRAWLER_USER_AGENT=VisibleAU-Audit-Bot/1.0 (+https://visibleau.com/bot)
```

---

## 4. Project structure additions

```
db/schema/
├── technical-audits.ts                       # NEW
├── brand-entity-scores.ts                    # NEW
├── citability-methods.ts                     # NEW (seeded)
└── validation-corpus-results.ts              # NEW

db/seed/
├── citability-methods/seed.ts                # 47 methods (Princeton KDD + AutoGEO ICLR)
├── ai-bots/seed.ts                           # 27 bots × 3 tiers (MIT-attributed)
└── validation-corpus/fifty-sites.ts          # 50 real-site fixtures

lib/
├── crawler/                                  # Playwright-based site crawler
│   ├── index.ts                              # crawlSite(domain, opts) → CrawlResult
│   ├── playwright-render.ts                  # SSR vs CSR detection
│   ├── extract-content.ts                    # @mozilla/readability extraction
│   ├── robots-fetcher.ts                     # robots.txt + sitemap.xml fetcher
│   └── types.ts
├── llms-txt/
│   ├── generate.ts                           # generateLlmsTxt(crawl, brand) → string
│   ├── validate.ts                           # validateLlmsTxt(text) → { score, issues }
│   ├── depth-score.ts                        # 6-component /18 graduated scoring
│   └── templates/
│       ├── tradies.md.tmpl
│       ├── allied-health.md.tmpl
│       └── saas.md.tmpl
├── robots-txt/
│   ├── analyze.ts                            # parse + score AI bot access
│   ├── generate.ts                           # generate recommended robots.txt
│   ├── ai-bots.ts                            # 27-bot registry
│   └── cdn-detect.ts                         # Cloudflare/Akamai/Vercel detection
├── schema-audit/
│   ├── extract.ts                            # parse JSON-LD blocks
│   ├── validate.ts                           # schema-dts validation
│   ├── richness-score.ts                     # /16 graduated scoring
│   └── reality-check.ts                      # honest per-engine impact reporting
├── ssr-check/
│   ├── per-page.ts                           # render with + without JS, compare
│   └── spa-detect.ts                         # React/Vue/Angular detection
├── answer-capsules/
│   ├── find-questions.ts                     # H2/H3 ending in "?"
│   ├── check-capsule.ts                      # 20-25 word direct answer?
│   └── generate-capsule.ts                   # AI-suggested rewrite
├── ai-discovery/
│   └── endpoints.ts                          # .well-known/ai.txt etc.
├── brand-entity/
│   ├── abn-lookup.ts                         # https://abr.business.gov.au/Tools/JsonAbnLookup
│   ├── wikipedia-au.ts                       # Wikipedia API for AU presence
│   ├── au-tld-signal.ts                      # .com.au, .net.au, .org.au signal
│   ├── au-directory-aggregate.ts             # Hipages/YPAU/SS/WoM aggregate
│   └── score.ts                              # composite /10
├── citability/
│   ├── catalogue.ts                          # 47 methods loader
│   ├── apply.ts                              # which methods apply?
│   └── effect-sizes.ts                       # effect-size delta map
├── negative-signals/
│   ├── detect.ts
│   └── patterns/                             # 8 pattern files (one each)
├── prompt-injection/
│   ├── detect.ts
│   └── patterns/                             # 8 pattern files (one each)
└── technical-audit/
    ├── orchestrate.ts                        # run all 8 dimensions
    ├── score-aggregator.ts                   # 8 → 5 UX rollup per §16 Gap D
    └── types.ts

inngest/functions/
├── technical-audit-run.ts                    # NEW long-running orchestrator (~3-5 min/brand). Triggered by SAME `audit/start` Inngest event as Sprint 3's run-audit.ts. Runs in parallel; persists to `technical_audits` table; emits `technical-audit.complete` event the audit-completion email handler listens for.
└── corpus-validation.ts                      # NEW runs 50-site corpus, computes Spearman

app/(auth)/brands/[brandId]/
├── technical-audit/page.tsx                  # 8-dim drill-down + 5-cat rollup
├── llms-txt-generator/page.tsx
├── schema-audit/page.tsx
├── ssr-check/page.tsx
├── answer-capsules/page.tsx
├── robots-txt-config/page.tsx                # 27-bot matrix
└── brand-entity-audit/page.tsx

app/(auth)/methodology/page.tsx               # stub (Sprint 11 polishes)

app/api/
├── technical-audits/[id]/route.ts
├── crawl/route.ts
├── brand-entity/[brandId]/route.ts
└── citability-methods/route.ts

components/domain/technical/
├── dimension-tile.tsx
├── llms-txt-preview.tsx
├── schema-richness-card.tsx
├── ssr-status-table.tsx
├── ai-bots-matrix.tsx                        # 27 bots × 3 tiers, toggle per bot
└── cdn-detection-card.tsx

ATTRIBUTIONS.md                               # NEW — full credits per PRD §16

tests/
├── unit/
│   ├── llms-txt/                             # generate.test.ts, depth-score.test.ts
│   ├── robots-txt/                           # analyze.test.ts, cdn-detect.test.ts
│   ├── schema-audit/                         # extract.test.ts, richness-score.test.ts
│   ├── ssr-check/per-page.test.ts
│   ├── answer-capsules/check-capsule.test.ts
│   ├── brand-entity/                         # abn-lookup.test.ts, score.test.ts
│   ├── negative-signals/detect.test.ts       # 8 sub-tests
│   └── prompt-injection/detect.test.ts       # 8 sub-tests
├── integration/
│   ├── crawler/end-to-end-crawl.test.ts
│   └── technical-audit/orchestrate.test.ts
└── corpus/
    ├── run-corpus.ts                         # Sprint 7's main acceptance script
    ├── report.ts
    └── reports/                              # markdown reports per run
```

---

## 5. Database schema additions

### `technical_audits.ts`

```typescript
import { pgTable, uuid, numeric, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { brands } from './brands';
import { organizations } from './organizations';
import { audits } from './audits';

export const technicalAudits = pgTable('technical_audits', {
  id: uuid('id').primaryKey().defaultRandom(),
  brandId: uuid('brand_id').references(() => brands.id).notNull(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),

  // Links to the parallel multidim audit fired by the same `audit/start` event (v2.2 third-pass-fix B2).
  // Nullable to permit standalone technical audits (future feature, e.g., a "Run Technical Audit Only" button).
  // For the v1 "Run Audit triggers both" design, this column IS populated.
  auditId: uuid('audit_id').references(() => audits.id),

  // 8 internal dimensions (UX surfaces as 5 rolled-up per §16 Gap D)
  scoreRobots: numeric('score_robots', { precision: 5, scale: 2 }),       // /18
  scoreLlmsTxt: numeric('score_llms_txt', { precision: 5, scale: 2 }),    // /18
  scoreSchema: numeric('score_schema', { precision: 5, scale: 2 }),       // /16
  scoreMeta: numeric('score_meta', { precision: 5, scale: 2 }),           // /14
  scoreContent: numeric('score_content', { precision: 5, scale: 2 }),     // /12
  scoreBrandEntity: numeric('score_brand_entity', { precision: 5, scale: 2 }),  // /10
  scoreSignals: numeric('score_signals', { precision: 5, scale: 2 }),     // /6 (neg + prompt injection)
  scoreAiDiscovery: numeric('score_ai_discovery', { precision: 5, scale: 2 }),  // /6

  scoreComposite: numeric('score_composite', { precision: 5, scale: 2 }),  // /100

  findings: jsonb('findings').default('{}').notNull(),
  // Shape: { llmsTxt: { present: bool, depthScore: number, issues: [...] }, schema: { ... }, ... }

  crawledAt: timestamp('crawled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

Index `(auditId)` for the audit-list join in Sprint 4. Index `(brandId, createdAt DESC)` for the brand-level technical-audit history view.

### `brand_entity_scores.ts`

```typescript
export const brandEntityScores = pgTable('brand_entity_scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  brandId: uuid('brand_id').references(() => brands.id).notNull(),

  abnVerified: text('abn_verified').default('false').notNull(),
  abnNumber: text('abn_number'),
  abnEntityName: text('abn_entity_name'),
  abnStatus: text('abn_status'),

  wikipediaAuPresent: text('wikipedia_au_present').default('false').notNull(),
  wikipediaAuUrl: text('wikipedia_au_url'),
  wikipediaAuMentions: integer('wikipedia_au_mentions').default(0).notNull(),

  auTldDomains: jsonb('au_tld_domains').default('[]').notNull(),
  auDirectoryPresence: jsonb('au_directory_presence').default('[]').notNull(),

  scoreOf10: numeric('score_of_10', { precision: 5, scale: 2 }),

  checkedAt: timestamp('checked_at', { withTimezone: true }).defaultNow().notNull(),
});
```

### `citability_methods.ts` (seeded, not user-mutable)

```typescript
export const citabilityMethods = pgTable('citability_methods', {
  id: uuid('id').primaryKey().defaultRandom(),
  methodKey: text('method_key').unique().notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  source: text('source').notNull(),          // 'Princeton KDD 2024' | 'AutoGEO ICLR 2026'
  effectSizePct: numeric('effect_size_pct', { precision: 5, scale: 2 }),
  effectSizeNotes: text('effect_size_notes'),
  appliesTo: jsonb('applies_to').default('[]').notNull(),  // engines + content types
});
```

### `validation_corpus_results.ts`

```typescript
export const validationCorpusResults = pgTable('validation_corpus_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  fixtureName: text('fixture_name').notNull(),
  domain: text('domain').notNull(),
  vertical: text('vertical').notNull(),
  region: text('region').notNull(),
  category: text('category').notNull(),
  expectedScoreMin: numeric('expected_score_min', { precision: 5, scale: 2 }),
  expectedScoreMax: numeric('expected_score_max', { precision: 5, scale: 2 }),
  actualScore: numeric('actual_score', { precision: 5, scale: 2 }),
  withinBand: text('within_band').notNull(),
  spearmanContribution: numeric('spearman_contribution', { precision: 10, scale: 6 }),
  runAt: timestamp('run_at', { withTimezone: true }).defaultNow().notNull(),
});
```

Migrate:
```bash
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
pnpm tsx db/seed/citability-methods/seed.ts
pnpm tsx db/seed/ai-bots/seed.ts
```

---

## 6. The 50-site validation corpus (acceptance gate)

50 fixture files in `tests/fixtures/validation-corpus/`:

```
tests/fixtures/validation-corpus/
├── au-tradies/         # 5
├── au-allied-health/   # 5
├── au-saas/            # 5
├── us/                 # 5
├── uk/                 # 5
├── ca/                 # 5
├── nz/                 # 5
├── known-good/         # 5 (high mention + high Module 5b score)
├── known-bad/          # 5 (low mention + low Module 5b score)
└── edge-cases/         # 5 (single-word, ambiguous names, etc.)
```

Each fixture:
```json
{
  "name": "bondi-plumbing",
  "domain": "bondiplumbing.com.au",
  "vertical": "tradies",
  "region": "au",
  "category": "au-tradies",
  "expectedTechnicalScore": { "min": 35, "max": 65 },
  "expectedMentionRate": { "min": 30, "max": 60 },
  "notes": "Known-good AU plumber with GMB + Hipages + reviews."
}
```

The runner (`tests/corpus/run-corpus.ts`):
1. For each fixture, run Sprint 7 technical audit + Sprint 3 multi-engine audit (mock mode)
2. Persist to `validation_corpus_results`
3. Compute Spearman correlation between technical-score rank and mention-rate rank
4. **Acceptance gate:** Spearman > 0.7 → Sprint 7 passes. Otherwise fail with report.

---

## 7. Claude Code prompt (paste this when starting Sprint 7)

```
We're building VisibleAU Sprint 7: Technical AI Infrastructure (Module 5b) + OSS additions.
This is the LARGEST sprint by effort (~130-180h at weekend pace). It's the v1.3 differentiator
the PRD calls out — without it, VisibleAU is "another audit dashboard." With it, it's "the
only tool that audits your site's AI-readiness AND your AI visibility."

Read CLAUDE.md + PRD §8 Module 5b + PRD §8.8 OSS-derived additions + PRD §11 expanded Sprint 7
scope + PRD §16 OSS reference strategy. Read the prototype lines 2458-2870.

Sprint 7 deliverables, in order:

1. SCHEMA + SEED
   - 4 new tables per §5
   - Seed 47 citability methods + 27 AI bots
   - Migrate

2. CRAWLER FOUNDATION
   - lib/crawler/* — Playwright headless + cheerio parsing
   - Per-site budget: 20 pages max, 15s timeout, 5min total
   - Custom user-agent identifying VisibleAU bot

3. MODULE 5b CORE — implement in this order:
   a. SSR check (simplest)
   b. Schema audit (parse JSON-LD, richness /16, reality-check by engine)
   c. robots.txt config (27-bot registry, CDN detection, generate recommended)
   d. Answer capsule formatter (find H2/H3 ending in "?", check 20-25 word capsule)
   e. llms.txt generator (last; depends on understanding the rest of the site)

4. OSS-DERIVED ADDITIONS
   - AI discovery endpoints check
   - Brand & Entity audit (ABN Lookup → Wikipedia AU → AU TLD → AU directory aggregate)
   - 47 citability methods catalogue surfaced
   - Negative signals detection (8 patterns)
   - Prompt injection detection (8 patterns)

5. AUDIT ORCHESTRATION
   - inngest/functions/technical-audit-run.ts — long-running (3-5 min/brand)
   - 8-dimension internal scoring + 5-category UX rollup
   - Persist to technical_audits + brand_entity_scores

6. UI
   - /brands/[id]/technical-audit (8-dim drill-down + 5-cat toggle)
   - 5 dedicated screens per prototype (llms.txt, schema, SSR, answer capsules, robots.txt)
   - Brand & Entity audit screen
   - /methodology stub

7. 50-SITE VALIDATION CORPUS — DO NOT SKIP
   - Author 50 fixture files
   - run-corpus.ts runs all 50 against mock LLM + technical audit
   - Spearman correlation between technical-rank and mention-rank
   - ACCEPTANCE GATE: Spearman > 0.7. If <0.7, do NOT mark sprint complete.

8. ATTRIBUTIONS.md
   - Auriti-Labs (MIT, attributed; 8-cat structure + 27 bots + 47 methods reference)
   - Princeton KDD 2024 + AutoGEO ICLR 2026 (citability methods)
   - Tinuiti / SE Ranking / Profound (research citations)
   - Full list per PRD §16

9. TESTS
   - Unit per §4 (~30 files)
   - Integration: full crawl + 8-dim audit completes <5min per site
   - E2E: navigate every Module 5b screen, drill into dimensions, download llms.txt
   - Corpus regression: pnpm test:corpus passes Spearman > 0.7

POTENTIAL BLOCKERS:
- Playwright cold-start at scale — pre-warm browsers in Inngest worker
- ABN Lookup + Wikipedia API rate limits — cache aggressively
- First corpus run may be <0.7 — SIGNAL to tune scoring, not lower the threshold
- Large site crawls — respect 20-page budget, log truncations
- Cloudflare bot challenges — legit UA + robots.txt respect + 403 backoff

Start with step 1. Don't proceed past step 2 (crawler) until it handles 10 diverse domains
reliably. The corpus gate (step 7) is non-negotiable for sprint acceptance.
```

---

## 8. Tests required

- Unit: per §4 (~30 test files)
- Integration: crawler + each dimension orchestration
- E2E: navigate Module 5b screens + Brand & Entity audit + verify scoring renders
- **Corpus regression:** `pnpm test:corpus` runs 50-site corpus, asserts Spearman > 0.7

---

## 9. Acceptance criteria

- [ ] 4 new tables migrated + seeded (47 methods + 27 bots)
- [ ] Crawler reliably handles 10 diverse test domains within budget
- [ ] 5 Module 5b core features functional (llms.txt, robots.txt, schema, SSR, answer capsules)
- [ ] 10 OSS-derived additions functional
- [ ] 8-dimension internal scoring + 5-category UX rollup both render correctly
- [ ] `/methodology` page shows top-10 citability methods (full 47 in Action Center)
- [ ] **Spearman correlation > 0.7** on 50-site corpus
- [ ] ATTRIBUTIONS.md complete + accurate
- [ ] No regression on Sprint 1-6 tests
- [ ] CI green

---

## 10. Common pitfalls / Sprint 7 anti-patterns

- **Do not** skip the 50-site corpus. Spearman > 0.7 is the only honest acceptance gate.
- **Do not** import Auriti-Labs or any OSS GEO/AEO repo as production dependency. PRD §16 is explicit: reference-only, re-implement, attribute. 1,189 mocked tests ≠ production validation.
- **Do not** generate llms.txt that "games" the LLM (misleading summaries to get cited). PRD §8 anti-pattern. Generate honest, structured summaries.
- **Do not** lower the Spearman threshold to make Sprint 7 pass. If <0.7, fix scoring weights or corpus, not threshold.
- **Do not** crawl >20 pages per site without explicit operator approval. AU SMB sites ~30-100 pages; crawling all = legal/ethics + cost.
- **Do not** ship CDN detection without testing against real Cloudflare/Akamai/Vercel-protected AU SMB sites. False positives erode trust.
- **Do not** conflate this 8-dim scoring with Sprint 3's 5-dim audit-results scoring. They measure different things (site configuration vs brand performance on AI queries). UI must clearly separate.

---

## 11. Handoff to Sprint 8

Ready:
- ✓ Site crawler infrastructure — Sprint 8 Local SEO reuses for GMB/NAP checks
- ✓ Brand & Entity audit — Sprint 8 adds GMB completeness on top
- ✓ `technical_audits` rows persist — Sprint 8 drift detection compares consecutive

Not ready:
- Local SEO Module 4 (Sprint 8)
- Drift detection across audits (Sprint 8)
- SARIF/JUnit/GHA exports working (Sprint 8 ships them)
- Webhook integrations (Sprint 8)

---

## Changelog

- v2.2 (13 May 2026): **Third-pass-fix audit B2.** `technical_audits` schema gained `auditId: uuid('audit_id').references(() => audits.id)` (nullable). This is required so Sprint 4's audit-list can show a "+ technical audit" badge alongside the multidim audit row — without the FK, the join would be a fragile `(brand_id, created_at within 10min)` heuristic. The N3 design decision (Run Audit triggers both) is now schema-supported. Two indexes added: `(auditId)` for audit-list joins, `(brandId, createdAt DESC)` for brand-level history.
- v2.1 (13 May 2026): **Second-pass-fix audit N3.** Added explicit audit-flow design decision to header: technical audit runs in parallel with Sprint 3's multidim audit, triggered by the same `audit/start` Inngest event; shared quota; per-audit cost budget rises to <US$3.50 to cover site-crawler cost. Clarified `technical-audit-run.ts` is fired by the SAME event as `run-audit.ts`. CLAUDE.md §2 carries the matching design note.
- v2.0 (12 May 2026): **Complete rewrite per conflict-audit C4 + H1.** Sprint 7 v1.0 had Local SEO + 50-site corpus at ~22h. PRD §11 says Sprint 7 = Module 5b core + OSS additions at ~22 days (130-180h at weekend pace). v2.0 implements PRD canonical: 5 core features (llms.txt, robots.txt, schema, SSR, answer capsules) + 10 OSS-derived additions (CDN check, AI discovery, AU Brand & Entity, 47 methods, 8 negative signals, 8 prompt injection patterns, 27 AI bots, schema richness, llms.txt depth, 8-internal→5-surfaced rollup) + 50-site corpus with Spearman > 0.7 gate. Local SEO moved to Sprint 8.
- v1.0 (12 May 2026): Initial. **Conflict: missed Module 5b entirely.**
