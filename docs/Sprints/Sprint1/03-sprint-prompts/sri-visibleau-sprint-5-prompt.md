# Sprint 5 — AU Vertical Packs

**Sprint:** 5 of 12
**Estimated effort:** 30-40 hours (~4-5 weekends at 8 hrs/week)
**Goal:** Replace Sprint 2's inline 10-prompt arrays with curated AU vertical packs stored in DB. Tradies (124 prompts), Allied Health (104), SaaS (108). Operator-facing pack browser. Per-vertical prompt templates with placeholders.
**Prerequisites:** Sprint 4 complete. Brand wizard works. Audit job uses inline prompt arrays.
**Out of scope:** Recommendation generation (Sprint 6), drift detection (Sprint 8). Sprint 5 just makes prompts data-driven and curated.

---

## 0. Read first

1. `CLAUDE.md`
2. `sri-geo-aeo-prd-v1.md` v1.14 §16 — vertical pack content sources + ATTRIBUTIONS.md sprint deliverable matrix
3. Existing `lib/audit/prompts.ts` from Sprint 2 — the 10-prompt inline arrays per vertical

---

## 1. What ships this sprint

- ✓ Schema: `vertical_packs` table + `vertical_pack_prompts` table
- ✓ Seed data: AU Tradies pack with 124 prompts
- ✓ Seed data: AU Allied Health pack with 104 prompts
- ✓ Seed data: AU SaaS pack with 108 prompts
- ✓ Prompt template engine: `{brand}`, `{domain}`, `{location}`, `{competitors}` placeholders
- ✓ Region-aware location expansion (e.g., `{location}` expands to suburb list per brand's primaryRegions)
- ✓ Audit job uses DB-driven prompts instead of inline arrays
- ✓ Vertical pack browser UI on brand wizard step 2 (data-driven from `vertical_packs`)
- ✓ Vertical pack admin view (read-only in v1 — operator authors packs in DB seed scripts, no UI editing)
  - **Important (fourth-pass-fix F6):** The prototype screen `prompt-library-editor` shows an editable prompt UI (New prompt button, checkboxes, edit menus). This is a **v1.1 future-state mockup** — do NOT build it as writable in Sprint 5. The v1 build should show a read-only view of the prompts in the pack. Sidebar categories are navigable; prompts are shown but not editable; the "New prompt" button is either absent or shown as disabled with a "v1.1" badge. Reason: CLAUDE.md §2 Out of scope explicitly says "Custom prompt authoring by end users (vertical packs are curated)."
- ✓ Per-pack metadata: prompt count, last updated, version
- ✓ Brand can specify which prompts subset to run (defaults to first 10 for Sprint 2 mode, all for Sprint 3 mode)
- ✓ ATTRIBUTIONS.md generated — Sprint 5 is first deliverable matrix touchpoint

**Definition of done:** A user creating a brand via wizard sees 3 vertical pack cards with real counts pulled from DB. Selecting "AU Tradies" runs the audit against that pack's prompts (10 for Sprint 2 mode, top 10 by curated rank for Sprint 3 mode pending Sprint 7 corpus validation).

---

## 2. Dependencies to install

```bash
# Markdown parsing for prompt template metadata
pnpm add gray-matter

# CSV parsing for batch seed imports
pnpm add papaparse
pnpm add -D @types/papaparse
```

---

## 3. Environment variables

No new env vars.

---

## 4. Project structure additions

```
db/schema/
├── vertical-packs.ts                 # NEW
└── vertical-pack-prompts.ts          # NEW (or inline in vertical-packs.ts)

db/seed/
├── verticals/
│   ├── au-tradies.ts                 # 124 prompts seed
│   ├── au-allied-health.ts           # 104 prompts seed
│   ├── au-saas.ts                    # 108 prompts seed
│   └── shared/
│       ├── prompt-rank.ts            # Rank curation logic
│       └── locations-au.ts           # Suburb data per region
└── seed.ts                           # Top-level seed runner

lib/
├── verticals/
│   ├── index.ts                      # getVerticalPack(vertical, region)
│   ├── expand-prompt.ts              # Placeholder expansion
│   └── types.ts                      # VerticalPack, VerticalPackPrompt types

app/(auth)/
└── verticals/
    └── page.tsx                      # Read-only operator browser

components/domain/
└── vertical/
    ├── pack-browser.tsx              # 3 cards used in wizard + read-only browser
    └── prompt-preview.tsx            # Show a sample expanded prompt

ATTRIBUTIONS.md                       # NEW — sprint deliverable matrix entries

tests/
├── unit/
│   └── verticals/
│       ├── expand-prompt.test.ts
│       └── index.test.ts
└── integration/
    └── audit/
        └── pack-driven-audit.test.ts
```

---

## 5. Database schema

### `vertical_packs.ts`

```typescript
import { pgTable, uuid, text, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { verticalEnum, regionEnum } from './enums';

export const verticalPacks = pgTable('vertical_packs', {
  id: uuid('id').primaryKey().defaultRandom(),
  vertical: verticalEnum('vertical').notNull(),
  region: regionEnum('region').notNull(),
  version: text('version').notNull(),  // 'v1.0', 'v1.1', etc.
  name: text('name').notNull(),  // "AU Tradies v1.0"
  promptsCount: integer('prompts_count').notNull(),
  metadata: jsonb('metadata').default('{}').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }).defaultNow().notNull(),
  retiredAt: timestamp('retired_at', { withTimezone: true }),
});
```

### `vertical_pack_prompts.ts`

```typescript
import { pgTable, uuid, text, integer } from 'drizzle-orm/pg-core';
import { verticalPacks } from './vertical-packs';

export const verticalPackPrompts = pgTable('vertical_pack_prompts', {
  id: uuid('id').primaryKey().defaultRandom(),
  packId: uuid('pack_id').references(() => verticalPacks.id).notNull(),
  promptTemplate: text('prompt_template').notNull(),
  rank: integer('rank').notNull(),         // 1 = highest curated quality
  category: text('category'),               // e.g., 'service-discovery', 'reviews', 'pricing'
  topic: text('topic'),                      // semantic topic cluster (e.g., 'emergency-service', 'pricing-inquiry', 'comparison') — used by v1.2 topical sentiment segmentation per PRD §8 v1.2
  expectedMentionType: text('expected_mention_type'),  // 'recommended' | 'listed' | 'comparison'
  notes: text('notes'),                     // operator notes (not shown to users)
});
```

### Seed data shape (TS array)

```typescript
// db/seed/verticals/au-tradies.ts
export const AU_TRADIES_PROMPTS = [
  {
    rank: 1,
    promptTemplate: 'Who are the best plumbers in {location}?',
    category: 'service-discovery',
    expectedMentionType: 'recommended',
  },
  {
    rank: 2,
    promptTemplate: 'I need an emergency electrician near {location}. Who should I call?',
    category: 'service-discovery',
    expectedMentionType: 'recommended',
  },
  // ... 122 more
];
```

Each pack's 100+ prompts are authored carefully:
- ~40% service-discovery ("Who are the best X in Y?")
- ~20% reviews ("Is X a good Y?")
- ~15% pricing ("How much does X cost in Y?")
- ~15% comparison ("X vs Y in Z?")
- ~10% problem-driven ("My X is broken — who fixes it in Y?")

---

## 6. Backend / API additions

### `GET /api/vertical-packs`

Returns active packs with prompt counts. Used by brand wizard step 2 + read-only admin view.

### `GET /api/vertical-packs/[id]/prompts?preview=true&brandId=X`

Returns top 10 ranked prompts with `{brand}` / `{location}` placeholders expanded for the specified brand. Used by `prompt-preview.tsx` component.

---

## 7. Prompt expansion logic

`lib/verticals/expand-prompt.ts`:

```typescript
import type { Brand } from '@/db/schema';

interface ExpandContext {
  brand: Brand;
  competitors: string[];
  locations: string[];
}

export function expandPrompt(template: string, ctx: ExpandContext): string[] {
  // {brand} → ctx.brand.name (1 expansion)
  // {domain} → ctx.brand.domain (1 expansion)
  // {location} → expands ONE prompt per location (multi-expansion)
  // {competitors} → joins with ", " (1 expansion)
  if (template.includes('{location}') && ctx.locations.length > 0) {
    return ctx.locations.map(loc =>
      template
        .replace(/\{brand\}/g, ctx.brand.name)
        .replace(/\{domain\}/g, ctx.brand.domain)
        .replace(/\{location\}/g, loc)
        .replace(/\{competitors\}/g, ctx.competitors.join(', '))
    );
  }
  return [
    template
      .replace(/\{brand\}/g, ctx.brand.name)
      .replace(/\{domain\}/g, ctx.brand.domain)
      .replace(/\{competitors\}/g, ctx.competitors.join(', '))
  ];
}
```

Audit job uses this to materialize the final prompt list before sending to LLM.

---

## 8. Audit job changes

Update `inngest/functions/run-audit.ts`:

```typescript
// Before: const prompts = TRADIES_PROMPTS.slice(0, 10);
// After:
const pack = await db.query.verticalPacks.findFirst({
  where: and(eq(verticalPacks.vertical, brand.vertical), eq(verticalPacks.region, brand.region)),
});
const promptRows = await db
  .select()
  .from(verticalPackPrompts)
  .where(eq(verticalPackPrompts.packId, pack.id))
  .orderBy(asc(verticalPackPrompts.rank))
  .limit(10);

const prompts = promptRows.flatMap(p =>
  expandPrompt(p.promptTemplate, {
    brand,
    competitors: brand.competitors,
    locations: brand.primaryRegions.slice(0, 3),  // top 3 locations
  })
);
```

---

## 9. ATTRIBUTIONS.md

Sprint 5 is the first deliverable that touches the ATTRIBUTIONS.md matrix. Create it:

```markdown
# VisibleAU — Attributions

Sprint touchpoints: 5, 7, 8, 9, 11, 12.

## Sprint 5 contributions

- AU Tradies vertical pack v1.0 — curated by Sri, 124 prompts
- AU Allied Health vertical pack v1.0 — curated by Sri, 104 prompts
- AU SaaS vertical pack v1.0 — curated by Sri, 108 prompts

## OSS reference (no production deps — research-only)

Per PRD §16 OSS-layer reference strategy and Round 25 reversal on Auriti-Labs:
- Auriti-Labs/geo-optimizer-skill — reference only, not a production dep
- 10 other OSS repos catalogued in audit-round-22 onwards

(Further attributions added in Sprints 7, 8, 9, 11, 12.)
```

---

## 10. Claude Code prompt (paste this when starting Sprint 5)

```
We're building VisibleAU Sprint 5: AU vertical packs. Sprint 4 UI is complete.
Sprint 5 makes the prompts data-driven (was inline arrays in Sprint 2-4) and adds
curated AU content (124+104+108 = 336 prompts total).

Sprint 5 deliverables, in order:

1. SCHEMA
   - Create db/schema/vertical-packs.ts + vertical-pack-prompts.ts per §5
   - Add to index.ts barrel
   - drizzle-kit generate + migrate

2. SEED DATA (the bulk of the work)
   - db/seed/verticals/au-tradies.ts — 124 prompts with rank, category, expectedMentionType
   - db/seed/verticals/au-allied-health.ts — 104 prompts
   - db/seed/verticals/au-saas.ts — 108 prompts
   - db/seed/seed.ts — top-level runner that inserts pack rows + prompt rows
   - Run pnpm tsx db/seed/seed.ts to populate

3. PROMPT EXPANSION
   - lib/verticals/expand-prompt.ts pure function per §7
   - Tests: expand-prompt.test.ts covering all 4 placeholders + multi-location expansion + empty competitors

4. AUDIT JOB UPDATE
   - Update inngest/functions/run-audit.ts to load prompts from DB
   - Replace inline arrays with verticalPackPrompts query + expandPrompt
   - lib/audit/prompts.ts can be DELETED (or kept as fallback for tests)

5. API + UI
   - GET /api/vertical-packs returns active packs
   - GET /api/vertical-packs/[id]/prompts?preview=true&brandId=X for wizard preview
   - components/domain/vertical/pack-browser.tsx — 3 cards data-driven from API
   - components/domain/vertical/prompt-preview.tsx — shows top 3 expanded prompts
   - app/(auth)/verticals/page.tsx — read-only operator browser (links from sidebar)
   - Update brand wizard step 2 to use pack-browser.tsx with real data

6. ATTRIBUTIONS.md
   - Create root-level ATTRIBUTIONS.md per §9
   - Add Sprint 5 entries

7. TESTS
   - Unit: expand-prompt edge cases
   - Integration: pack-driven audit produces same shape as Sprint 4 inline audit (regression check)

POTENTIAL BLOCKERS:
- 336 prompts to author — this is the time-consuming part. Author them in 3 sittings
  (one vertical per session). Use existing inline arrays as starting point.
- Prompt curation: don't include prompts where brand mention is irrelevant
  (e.g., "What time is it in Sydney?")

Start with step 1. After schema migrates, generate seed data in step 2 (this is
where Sri spends most of the sprint).
```

---

## 11. Tests required

- Unit: `expand-prompt.test.ts` covering all placeholders
- Integration: `pack-driven-audit.test.ts` verifies audit job loads prompts from DB and expands correctly
- Seed verification: count check (`SELECT COUNT(*) FROM vertical_pack_prompts GROUP BY pack_id`) returns 124/104/108

---

## 12. Acceptance criteria

- [ ] `vertical_packs` table has 3 rows (AU Tradies, AU Allied Health, AU SaaS)
- [ ] `vertical_pack_prompts` table has 336 total rows (124+104+108)
- [ ] Brand wizard step 2 shows 3 cards with real counts
- [ ] Audit job uses DB prompts (verify by editing a prompt row and re-running audit)
- [ ] Prompt expansion: `{brand}` and `{location}` placeholders work correctly
- [ ] ATTRIBUTIONS.md exists with Sprint 5 entries
- [ ] Read-only `/verticals` page accessible from sidebar (Insights group)
- [ ] No regression: full audit still produces same scoring shape as Sprint 4

---

## 13. Common pitfalls / Sprint 5 anti-patterns

- **Do not** allow users to author their own prompts in v1. Vertical packs are curated.
- **Do not** delete the old inline arrays before integration tests pass. Keep `lib/audit/prompts.ts` as fallback briefly.
- **Do not** expand `{location}` into one mega-prompt with all suburbs. Generate N prompts per template if multiple locations — but cap at 3 locations max to control cost.
- **Do not** include placeholder tokens in cost-tracked tokens. Compute cost on the *expanded* prompt, not the template.

---

## 14. Handoff to Sprint 6

Ready:
- ✓ Curated prompts in DB — Sprint 6 Action Center reads from these to generate recommendations
- ✓ `category` field on prompts — Sprint 6 groups recommendations by category

Not ready:
- Recommendation generation (Sprint 6)
- Anti-pattern filter (Sprint 6)
- Confirmed/Likely/Hypothesis confidence labels (Sprint 6)

---

## Changelog

- v1.2 (15 May 2026): **Fourth-pass audit F6.** §1 "vertical pack admin view (read-only)" clarified with explicit build instruction: the prototype `prompt-library-editor` screen shows a writable editor (New prompt button, edit menus) which is a **v1.1 future-state mockup** — Sprint 5 build must NOT implement it as writable. v1 shows a read-only view; New prompt button absent or disabled with v1.1 badge. CLAUDE.md §2 Out of scope confirms: "Custom prompt authoring by end users (vertical packs are curated)."
- v1.1 (12 May 2026): Conflict-resolution fix. Added optional `topic` field to `vertical_pack_prompts` schema for v1.2 topical sentiment segmentation (PRD §8 v1.2). Seed authors should populate `topic` while writing prompts; v1 audit code ignores it; v1.2 audit aggregates sentiment by topic cluster.
- v1.0 (12 May 2026): Initial. Net-new sprint prompt (not previously drafted).
