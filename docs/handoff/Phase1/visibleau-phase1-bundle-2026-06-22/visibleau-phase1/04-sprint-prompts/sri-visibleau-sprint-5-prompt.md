# Sprint 5 — AU Vertical Packs

**Sprint:** 5 of 12
**Estimated effort:** 30-40 hours (~4-5 weekends at 8 hrs/week)
**Goal:** Replace Sprint 2's inline 10-prompt arrays with curated AU vertical packs stored in DB. Tradies (124 prompts), Allied Health (104), SaaS (108). Operator-facing pack browser. Per-vertical prompt templates with placeholders.
**Prerequisites:** Sprint 4 complete. Brand wizard works. Audit job uses inline prompt arrays.
**Out of scope:** Recommendation generation (Sprint 6), drift detection (Sprint 8). Sprint 5 just makes prompts data-driven and curated.

---

## 0. Read first

1. `CLAUDE.md`
2. `sri-geo-aeo-prd-v1.md` v1.15 §16 — vertical pack content sources + ATTRIBUTIONS.md sprint deliverable matrix
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
# CI2 fix: tsx is required to run seed scripts with 'pnpm tsx db/seed/seed.ts'.
# tsx is a TypeScript executor (like ts-node but faster). Must be in devDependencies.
pnpm add -D tsx
```

**CL3 fix — add `"seed"` script to `package.json`:**
```json
// package.json scripts section — add alongside existing scripts:
{
  "scripts": {
    "seed": "tsx db/seed/seed.ts",
    "seed:verify": "tsx -e \"const {db} = require('./db/client'); db.execute('SELECT COUNT(*) FROM vertical_pack_prompts GROUP BY pack_id').then(console.log)\""
  }
}
```
This allows `pnpm seed` (standard invocation) and `pnpm seed:verify` (quick count check after seeding).

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
│       └── prompt-rank.ts            # CG2 fix: content never specified. This is a simple helper
│                                     # for seed authors to compute rank values consistently:
│                                     # export function assignRanks<T extends { rank?: number }>(
│                                     #   prompts: T[]
│                                     # ): (T & { rank: number })[] {
│                                     #   return prompts.map((p, i) => ({ ...p, rank: p.rank ?? i + 1 }));
│                                     # }
│                                     # Seed files that explicitly set rank on every row don't need it.
│                                     # If Sri authors prompts in a spreadsheet without ranks, this fills gaps.
│       # CE2 fix: locations-au.ts removed — duplicate of Sprint 4 lib/locations/index.ts (BE1 fix).
│       # expandPrompt receives locations from brand.primaryRegions at runtime; seed files don't need suburb data.
└── seed.ts                           # Top-level seed runner

lib/
├── verticals/
│   ├── index.ts                      # getVerticalPack + re-exports (CM1 fix: real TypeScript below)
│   ├── expand-prompt.ts              # Placeholder expansion
│   # CF2 fix: types.ts REMOVED — CA5 already exports VerticalPack and VerticalPackPrompt as
│   # InferSelectModel types from db/schema/index.ts. A separate types.ts would create two
│   # competing declarations for the same type, causing import ambiguity.
│   # Always import: import type { VerticalPack, VerticalPackPrompt } from '@/db/schema'

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

**CM1 fix — `lib/verticals/index.ts` real TypeScript (CE3 was pseudo-comment; actual file below):**

```typescript
// lib/verticals/index.ts
import { db } from '@/db/client';
import { verticalPacks } from '@/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import type { VerticalPack } from '@/db/schema';

// CK4: re-export expand helpers so callers use one import path
export { expandPrompt, formatLocation, formatCompetitors } from './expand-prompt';

export async function getVerticalPack(
  vertical: string,
  region: string,
): Promise<VerticalPack | undefined> {
  return db.query.verticalPacks.findFirst({
    where: and(
      eq(verticalPacks.vertical, vertical as any),
      eq(verticalPacks.region, region as any),
      isNull(verticalPacks.retiredAt),
    ),
  });
}
```

---

### `vertical_packs.ts`

```typescript
import { pgTable, uuid, text, integer, timestamp, jsonb, uniqueIndex } from 'drizzle-orm/pg-core';
// CH1 fix: uniqueIndex was used in the table definition (CC5) but not imported — TypeScript compile error.
import { verticalEnum, regionEnum } from './enums';
// CK5 fix: verticalEnum in Foundations v1.12 ALREADY includes 'professional_services' and 'real_estate'
// as v1.1 values. Sprint 5 does NOT need a migration to extend the enum — the values exist.
// Sprint 5 only seeds 'tradies', 'allied_health', 'saas' packs; v1.1 values sit dormant in the enum
// until Sprint 5.1/v1.1 seeds Professional Services and Real Estate. No migration action needed.

export const verticalPacks = pgTable('vertical_packs', {
  id: uuid('id').primaryKey().defaultRandom(),
  vertical: verticalEnum('vertical').notNull(),
  region: regionEnum('region').notNull(),
  version: text('version').notNull(),  // 'v1.0', 'v1.1', etc.
  name: text('name').notNull(),  // "AU Tradies v1.0"
  promptsCount: integer('prompts_count').notNull(),
  metadata: jsonb('metadata').default('{}').notNull(),
  // CJ2 fix: metadata column purpose never documented. In Sprint 5, use metadata for:
  // { "author": "sri", "source": "manual-curation", "approvedAt": "2026-05-17" }
  // This is extensible: Sprint 7 may add "corpusValidationSpearman": 0.73 once validated.
  // Sprint 5 seed sets metadata on each pack row. No Sprint 5 UI reads it (informational only).
  publishedAt: timestamp('published_at', { withTimezone: true }).defaultNow().notNull(),
  retiredAt: timestamp('retired_at', { withTimezone: true }),
  // CJ5 fix: §1 deliverable says "per-pack metadata: prompt count, last updated, version" —
  // "last updated" requires an updatedAt column. VerticalPackDetail header shows "last updated 2 weeks ago".
  // Without updatedAt, the page must hardcode or omit the timestamp.
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  // CC5 fix: unique constraint enforces business rule — one active pack per vertical per region.
  // Without this, the seed can insert duplicates and the audit job's findFirst returns an arbitrary row.
  // The onConflictDoUpdate in seed.ts (CC1 fix) uses this index as the conflict target.
  uniqueVerticalRegion: uniqueIndex('vertical_packs_vertical_region_idx').on(table.vertical, table.region),
}));
```

### `vertical_pack_prompts.ts`

```typescript
import { pgTable, uuid, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { verticalPacks } from './vertical-packs';

export const verticalPackPrompts = pgTable('vertical_pack_prompts', {
  id: uuid('id').primaryKey().defaultRandom(),
  // CK3 fix: onDelete action never specified. Without CASCADE, hard-deleting a vertical_packs
  // row leaves orphaned prompt rows — broken FK references Postgres doesn't auto-clean.
  // In practice, packs are retired via retiredAt (soft), not hard-deleted. But the FK should
  // still enforce CASCADE for consistency and future-proofing.
  packId: uuid('pack_id').references(() => verticalPacks.id, { onDelete: 'cascade' }).notNull(),
  promptTemplate: text('prompt_template').notNull(),
  rank: integer('rank').notNull(),         // 1 = highest curated quality
  category: text('category'),               // CF4 fix: canonical values never standardised.
  // Use these exact strings in all seed files and UI filters for consistency:
  // 'service-discovery' | 'recommendation' | 'comparison' | 'pricing' |
  // 'problem-driven' | 'reviews' | 'compliance' | 'emergency' | 'service-specific'
  // CM2 fix: 'service-specific' added — VerticalPackDetail shows 24 Tradies prompts in this
  // category ("plumber for hot water installation {location}"). It was missing from CF4's 8-value list.
  topic: text('topic'),                      // semantic topic cluster (e.g., 'emergency-service', 'pricing-inquiry', 'comparison') — used by v1.2 topical sentiment segmentation per PRD §8 v1.2
  expectedMentionType: text('expected_mention_type'),
  // CG3 fix: expectedMentionType is stored in Sprint 5 but never consumed until Sprint 7.
  // Values: 'recommended' | 'listed' | 'comparison'
  // Meaning:
  //   'recommended' — prompt expects brand to be named as a direct recommendation ("you should call X")
  //   'listed'      — prompt expects brand to appear in a list of options ("X, Y, and Z are all good")
  //   'comparison'  — prompt is a head-to-head ("X vs Y") — brand mention as comparison target
  // Sprint 7 corpus validation uses expectedMentionType to weight scoring precision:
  //   if a 'recommended' prompt produces a 'listed' result, precision drops.
  // For Sprint 5: seed authors must populate this field; audit code ignores it at runtime.
  notes: text('notes'),                     // operator notes (not shown to users)
  // CD4 fix: createdAt missing from original schema. Every Foundations table has createdAt.
  // Sprint 7 "new prompts this month" dashboard metric and ATTRIBUTIONS.md timestamp tracking both need it.
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

**CH2 fix — `db.query.verticalPacks.findFirst()` requires a `relations()` definition.** Without it `db.query.verticalPacks` is `undefined` at runtime (silent error). Add to `db/schema/vertical-packs.ts`:

```typescript
import { relations } from 'drizzle-orm';

export const verticalPacksRelations = relations(verticalPacks, ({ many }) => ({
  prompts: many(verticalPackPrompts),
}));

export const verticalPackPromptsRelations = relations(verticalPackPrompts, ({ one }) => ({
  pack: one(verticalPacks, { fields: [verticalPackPrompts.packId], references: [verticalPacks.id] }),
}));
```

Also add these to the `db/schema/index.ts` barrel:
```typescript
export * from './vertical-packs';  // includes verticalPacksRelations + verticalPackPromptsRelations
```

And register in the Drizzle client (`db/client.ts`) schema object so `db.query` knows about them.
**CN3 fix — CH2 said "add to schema object" as a comment; actual `db/client.ts` diff needed:**

```typescript
// db/client.ts — Sprint 5 addition (diff against Sprint 4 version):
import {
  // ... existing Sprint 4 imports ...
  organizations, users, brands, audits, citations, llmResponseCache,
  // Sprint 5 additions:
  verticalPacks, verticalPackPrompts,
  verticalPacksRelations, verticalPackPromptsRelations,
} from './schema';

export const db = drizzle(client, {
  schema: {
    // ... existing Sprint 4 entries ...
    organizations, users, brands, audits, citations, llmResponseCache,
    // Sprint 5 additions — required for db.query.verticalPacks.findFirst() to work:
    verticalPacks, verticalPackPrompts,
    verticalPacksRelations, verticalPackPromptsRelations,
  },
});
```

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
- ~23% service-discovery ("Who are the best X in Y?")  ← CM4 fix: was 40%, but 28/124 = 22.6%
- ~19% service-specific ("X for Y task in {location}")  ← CM4: missing from original; 24/124 = 19.4%
- ~18% recommendation ("Who would you recommend for X?")  ← CM4: missing; 18/124 = 14.5%
- ~18% comparison ("X vs Y in Z?")  ← was 15%; 22/124 = 17.7%
- ~10% pricing ("How much does X cost in Y?")  ← was 15%; 10/124 = 8.1%
- ~10% emergency ("24/7 X near {location}")  ← CM4: missing; 12/124 = 9.7%
- ~5% reviews ("X with best reviews in Y?")  ← was 20%; 6/124 = 4.8%
- ~3% compliance ("Licensed X in Y?")  ← CM4: missing; 4/124 = 3.2%
**CM4 fix:** original breakdown (40/20/15/15/10) left emergency, compliance, recommendation, service-specific at 0% — yet the VerticalPackDetail prototype shows all 4 categories with real prompt counts summing to 58 of the 124 Tradies prompts. Corrected percentages based on the prototype category counts (28+18+22+24+12+10+6+4=124).

**CM3 fix — `app/(auth)/verticals/[packId]/page.tsx` never specified:**

`VerticalPackDetail` is a full page with breadcrumb "Workspace → Vertical packs → Tradies". It needs its own route. Add to project structure:

```
app/(auth)/
└── verticals/
    ├── page.tsx                      # Read-only browser (8 cards)
    └── [packId]/
        └── page.tsx                  # Pack detail — CM3 fix: never in project structure
```

**Pack detail page data:** No separate API endpoint needed — fetch directly in the server component:
```typescript
// app/(auth)/verticals/[packId]/page.tsx
export default async function PackDetailPage({ params }: { params: { packId: string } }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect('/sign-in');
  // No RLS needed — global data

  const pack = await db.query.verticalPacks.findFirst({ where: eq(verticalPacks.id, params.packId) });
  if (!pack || pack.retiredAt) notFound();

  // Category breakdown — CM3: requires GROUP BY query
  // CP3 fix: category is nullable. NULL rows from GROUP BY produce key={null} React warning
  // and an empty/literal-"null" label in the UI. Filter them out explicitly.
  const categoryBreakdown = await db
    .select({ category: verticalPackPrompts.category, count: sql<number>`count(*)::int` })
    .from(verticalPackPrompts)
    .where(and(
      eq(verticalPackPrompts.packId, pack.id),
      isNotNull(verticalPackPrompts.category),  // CP3: exclude null categories
    ))
    .groupBy(verticalPackPrompts.category)
    .orderBy(desc(sql`count(*)`));

  // brandsCount for this pack's vertical
  const [{ count: brandsCount }] = await db.select({ count: sql<number>`count(*)::int` })
    .from(brands)
    .where(and(eq(brands.vertical, pack.vertical), isNull(brands.deletedAt)));

  return <VerticalPackDetail pack={pack} categoryBreakdown={categoryBreakdown} brandsCount={brandsCount} />;
}
```

---

## 6. Backend / API additions

**Auth pattern for both routes (CA4 fix — never specified):** Vertical packs are global operator-authored data, not tenant-scoped. No `setRlsContext` needed. But authentication is still required — anonymous users must not browse pack content:
```typescript
const currentUser = await getCurrentUser();
if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
// No setRlsContext — vertical_packs is not RLS-protected (global data)
```

### `GET /api/vertical-packs`

Returns active packs with prompt counts. Used by brand wizard step 2 + read-only admin view.

**CD2 fix — response shape never specified:**
```typescript
// Response: VerticalPack[]
// Each element:
{
  id: string,                // UUID — used in wizard step to display pack info (NOT stored on brand in v1;
                             // CG1 fix: brands.vertical determines which pack runs; packId not persisted).
  name: string,              // "AU Tradies v1.0"
  vertical: string,          // 'tradies' | 'allied_health' | 'saas'
  region: string,            // 'au'
  version: string,           // 'v1.0'
  promptsCount: number,      // from vertical_packs.prompts_count (CA6 fix keeps this accurate)
  publishedAt: string,       // ISO timestamp
  updatedAt: string,         // ISO timestamp — CK2 fix: CJ5 added updatedAt to schema; VerticalPackDetail
                             // shows "last updated 2 weeks ago" which needs this field. Was missing from response.
  brandsCount: number,       // CL1+CL5 fix: VerticalPackBrowser shows "2 active brands / 1 active brand / 0".
                             // CO1 fix: CL1 specified a LEFT JOIN but brands is RLS-protected.
                             // Without setRlsContext, brands query returns 0 for all packs.
                             // Solution: call setRlsContext BEFORE the brands count subquery:
                             //
                             // const currentUser = await getCurrentUser();
                             // if (!currentUser) return NextResponse.json(...401...);
                             // await setRlsContext(db, currentUser.organizationId); // for brands count
                             //
                             // const packs = await db.execute(sql`
                             //   SELECT vp.*,
                             //     COUNT(b.id) FILTER (WHERE b.deleted_at IS NULL) AS brands_count
                             //   FROM vertical_packs vp
                             //   LEFT JOIN brands b ON b.vertical = vp.vertical
                             //     AND b.organization_id = ${currentUser.organizationId}
                             //   WHERE vp.retired_at IS NULL
                             //   GROUP BY vp.id ORDER BY vp.vertical ASC
                             // `);
                             // Note: filter by organizationId (not just deletedAt) so each org
                             // sees their own brand count, not all orgs' brands combined.
}
```
Filter: `WHERE retired_at IS NULL` — only active packs. Ordered by `vertical ASC` for consistent card order in wizard.

### `GET /api/vertical-packs/[id]/prompts?preview=true&brandName=X&primaryRegion=Y`

Returns top 3 ranked prompts expanded with the wizard's form state. Used by `prompt-preview.tsx` inside wizard step 2.

**CF3 fix — `brandId` timing conflict (supersedes CE1):** This endpoint is called *inside wizard step 2* to show a prompt preview before the brand exists in the DB. The original spec used `?brandId=X` — but the brand hasn't been created yet. Passing a non-existent `brandId` would 404. Fix: accept raw form values directly:

```
GET /api/vertical-packs/[id]/prompts?preview=true&brandName=Bondi+Plumbing&primaryRegion=NSW:Bondi
```

```typescript
// Auth only — no cross-org check needed (no DB brand row to validate):
const currentUser = await getCurrentUser();
if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

// CP4 fix: packId never validated — non-existent UUID returns { expandedPrompts: [] } silently.
// Wizard shows no sample prompts with no explanation. Validate the pack exists and is active:
const packId = params.id;
const pack = await db.query.verticalPacks.findFirst({
  where: and(eq(verticalPacks.id, packId), isNull(verticalPacks.retiredAt)),
});
if (!pack) return NextResponse.json({ error: 'Pack not found' }, { status: 404 });

const brandName = searchParams.get('brandName') ?? 'your brand';
const rawRegion = searchParams.get('primaryRegion') ?? '';
// Format: 'NSW:Bondi' → locations array for expandPrompt
const locations = rawRegion ? [rawRegion] : [];

const promptRows = await db.select().from(verticalPackPrompts)
  .where(eq(verticalPackPrompts.packId, packId))
  .orderBy(asc(verticalPackPrompts.rank)).limit(10);

const expanded = promptRows
  .flatMap(p => expandPrompt(p.promptTemplate, {
    brand: { name: brandName, domain: '' } as Brand,
    competitors: [],
    locations,
  }))
  .slice(0, 3);  // preview: top 3 only

return NextResponse.json({ expandedPrompts: expanded });
```

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

// CA3 fix: primaryRegions are stored as 'STATE:Suburb' (e.g., 'NSW:Bondi').
// Expanding '{location}' with 'NSW:Bondi' produces "Who are the best plumbers in NSW:Bondi?"
// — grammatically wrong. Transform to 'Suburb, STATE' for prompt use.
function formatLocation(raw: string): string {
  const [state, suburb] = raw.split(':');
  if (!suburb) return raw;  // fallback: no colon → use as-is
  return `${suburb}, ${state}`;  // 'NSW:Bondi' → 'Bondi, NSW'
}

// CB3 fix: competitors.join(', ') on an empty array returns '' (empty string).
// A prompt "Compare {brand} with {competitors}" → "Compare Bondi Plumbing with " — wrong.
// Options: (a) skip templates containing {competitors} when competitors is empty;
// (b) replace {competitors} with a fallback like "other local providers".
// Sprint 5 canonical: use option (b) — the fallback keeps the prompt meaningful.
function formatCompetitors(competitors: string[]): string {
  if (competitors.length === 0) return 'other local providers';
  return competitors.join(', ');
}

export function expandPrompt(template: string, ctx: ExpandContext): string[] {
  const formattedLocations = ctx.locations.map(formatLocation);
  const formattedCompetitors = formatCompetitors(ctx.competitors);

  // CP1 fix: if template has {location} but locations is empty, the previous code fell through
  // to the non-location branch which returned the template WITHOUT replacing {location}.
  // The LLM received the literal string "best plumber in {location}" — a raw placeholder.
  // Fix: skip templates that require {location} when no locations are available.
  // These templates simply won't be included in the audit's prompt set for this brand.
  if (template.includes('{location}')) {
    if (formattedLocations.length === 0) return [];  // skip — can't expand without locations
    return formattedLocations.map(loc =>
      template
        .replace(/\{brand\}/g, ctx.brand.name)
        .replace(/\{domain\}/g, ctx.brand.domain)
        .replace(/\{location\}/g, loc)
        .replace(/\{competitors\}/g, formattedCompetitors)
    );
  }
  return [
    template
      .replace(/\{brand\}/g, ctx.brand.name)
      .replace(/\{domain\}/g, ctx.brand.domain)
      .replace(/\{competitors\}/g, formattedCompetitors)
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
// CA2 fix: brand.region is a valid Foundations column (inherited from org at creation).
// However the load-audit step must explicitly SELECT brands.region in its query —
// if it only fetches partial brand columns, brand.region could be undefined at runtime.
// Ensure the brand join in load-audit includes: id, name, domain, vertical, region,
// primaryRegions, competitors — all fields needed by expandPrompt and pack lookup.
// CG1 fix: wizard step 2 "pack selection" is display-only in v1 — brands table has no packId column.
// The audit job always uses brand.vertical + brand.region to find the active pack.
// In v1 there is exactly one active pack per vertical+region, so this is unambiguous.
// TODO Sprint 6: if multiple packs per vertical ship, persist packId on brands and use it here.
const pack = await getVerticalPack(loaded.brand.vertical, loaded.brand.region);
  where: and(
    eq(verticalPacks.vertical, loaded.brand.vertical),
    eq(verticalPacks.region, loaded.brand.region),  // brand.region = org.region cached at creation
    isNull(verticalPacks.retiredAt),                 // only active packs
  ),
});

// CB1 fix: pack can be null if no pack exists for this vertical+region (e.g. a future vertical
// not yet seeded). Using pack.id on a null value throws TypeError and crashes the audit job
// with a cryptic error. Fail gracefully with a clear message persisted to audit.metadata.error.
if (!pack) {
  await db.update(audits).set({
    status: 'failed',
    metadata: sql`metadata || '{"error": "No vertical pack found for this brand vertical and region. Re-run after seeding the pack."}'::jsonb`,
  }).where(eq(audits.id, auditId));
  return { auditId, error: 'pack_not_found' };
}
const promptRows = await db
  .select()
  .from(verticalPackPrompts)
  .where(eq(verticalPackPrompts.packId, pack.id))
  .orderBy(asc(verticalPackPrompts.rank))
  .limit(10);

// CB2 fix: location expansion cost explosion.
// If all 10 templates contain {location} and brand has 3 primaryRegions →
// 30 expanded prompts × 4 engines × 5 runs = 600 LLM calls vs paid budget of 200.
// Solution: expand all templates, then SLICE to 10 total expanded prompts (not 10 templates).
// This preserves the rank ordering while capping final prompt count.
const allExpanded = promptRows.flatMap(p =>
  expandPrompt(p.promptTemplate, {
    brand: loaded.brand,
    competitors: loaded.brand.competitors,
    locations: loaded.brand.primaryRegions.slice(0, 3),
  })
);
```typescript
const allExpanded = promptRows.flatMap(p =>
  expandPrompt(p.promptTemplate, {
    brand: loaded.brand,
    competitors: loaded.brand.competitors,
    locations: loaded.brand.primaryRegions.slice(0, 3),
  })
);
const prompts = allExpanded.slice(0, 10);  // hard cap: 10 final prompts regardless of location expansion
// CD3 fix: audits.promptCount = prompts.length (the EXPANDED count after slice — what was actually sent
// to the LLM). This is the correct Foundations spec: "Set to prompts.length at finalize".
// Sprint 2 promptCount was always 10 (templates = expanded since no {location}).
// Sprint 5 promptCount may be <10 if a brand has 0 primaryRegions (no location expansion,
// fewer templates than 10). This is correct — it reflects actual LLM calls made.
//
// CO2 fix: empty prompts guard — if seed hasn't run yet (brand created before seeding),
// promptRows is [] and allExpanded is []. Continuing with 0 prompts produces 0 citations
// and scoreComposite = 0/0 = NaN. Fail gracefully instead:
if (prompts.length === 0) {
  await db.update(audits).set({
    status: 'failed',
    metadata: sql`metadata || '{"error": "Pack found but contains 0 prompts. Run pnpm seed to populate vertical_pack_prompts."}'::jsonb`,
  }).where(eq(audits.id, auditId));
  return { auditId, error: 'empty_pack_prompts' };
}
```

---

## 9. ATTRIBUTIONS.md

**CF1 fix — PRD §16 conflict:** Sprint 5 §1 said "Sprint 5 is the first deliverable matrix touchpoint." PRD §16 (canonical) specifies:

| Sprint | ATTRIBUTIONS.md action |
|---|---|
| **Sprint 7** | **First version created** — all OSS references used in audit module |
| Sprint 8 | Adds SARIF/JUnit/GHA + confidence labels + webhook taxonomy |
| Sprint 9 | Adds multi-brand routing + brand context system references |
| Sprint 11 | Adds AI context files + SCORING_RUBRIC.md pattern |
| Sprint 12 | Final pre-launch review + npm package headers |

Sprint 5 has **no OSS references** — the vertical pack prompts are original work curated by Sri. Sprint 5 creates only a **stub file** so later sprints have something to append to:

```markdown
# VisibleAU — Attributions

This file is updated at each sprint touchpoint: 7, 8, 9, 11, 12.
Sprint 7 writes the first substantive entries when OSS-reference features ship.

## Status

Sprint 5: Stub created. No OSS references in Sprint 5 (vertical packs are original content).
Sprint 7: First entries (audit module OSS references) — TODO.
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
   - Add to index.ts barrel (**CA5 fix — barrel exports never specified**):
     ```typescript
     // Add to db/schema/index.ts:
     export * from './vertical-packs';
     export * from './vertical-pack-prompts';

     import { verticalPacks } from './vertical-packs';
     import { verticalPackPrompts } from './vertical-pack-prompts';
     export type VerticalPack = InferSelectModel<typeof verticalPacks>;
     export type VerticalPackPrompt = InferSelectModel<typeof verticalPackPrompts>;
     ```
   - drizzle-kit generate + migrate
   - **CE4 fix — RLS must be DISABLED on both new tables.**
   - **CM5 fix — `drizzle.config.ts` coverage:** Verify which schema discovery pattern is in use:
     - If `schema: './db/schema/index.ts'` (barrel import): the CA5 barrel exports cover Sprint 5 tables automatically — no `drizzle.config.ts` change needed.
     - If `schema: './db/schema/**/*.ts'` (glob): new `vertical-packs.ts` and `vertical-pack-prompts.ts` are auto-discovered — no change needed.
     - **Either way, no manual `drizzle.config.ts` edit is required** as long as the barrel or glob includes the new schema files. Run `pnpm drizzle-kit generate` and verify the migration SQL includes `CREATE TABLE vertical_packs` and `CREATE TABLE vertical_pack_prompts`. Sprint 2 applies `ENABLE ROW LEVEL SECURITY` to tenant tables. `vertical_packs` and `vertical_pack_prompts` are global (no `organizationId`), so RLS policies cannot reference `app.current_organization_id`. If Supabase enables RLS on all new tables by default, or if Claude Code follows the Sprint 2 migration pattern and adds RLS, **every query to these tables returns 0 rows** — the wizard shows no packs and the audit job finds no prompts. Add to the Sprint 5 Supabase migration SQL:
     ```sql
     -- Sprint 5 migration: vertical_packs is global data — disable RLS explicitly
     ALTER TABLE vertical_packs DISABLE ROW LEVEL SECURITY;
     ALTER TABLE vertical_pack_prompts DISABLE ROW LEVEL SECURITY;
     ```

2. SEED DATA (the bulk of the work)
   - db/seed/verticals/au-tradies.ts — 124 prompts with rank, category, expectedMentionType
   - db/seed/verticals/au-allied-health.ts — 104 prompts
   - db/seed/verticals/au-saas.ts — 108 prompts
   - db/seed/seed.ts — top-level runner that inserts pack rows + prompt rows
   - **CC1 fix — seed.ts must be idempotent.** Running `pnpm tsx db/seed/seed.ts` twice must not create duplicate packs or prompts. Use an upsert pattern:
     ```typescript
     // In seed.ts — upsert vertical_packs row by unique (vertical, region):
     // CN2 fix: updatedAt must be set explicitly in INSERT values.
     // Drizzle's defaultNow() handles the DB default, but if the values object omits updatedAt
     // while explicitly listing other columns, Drizzle may not apply the column default.
     // Always set updatedAt: new Date() in both the initial INSERT and the conflict SET clause.
     const [pack] = await db.insert(verticalPacks)
       .values({
         vertical: 'tradies', region: 'au', name: 'AU Tradies v1.0',
         version: 'v1.0', promptsCount: 0,
         metadata: { author: 'sri', source: 'manual-curation', approvedAt: new Date().toISOString() },
         updatedAt: new Date(),  // CN2 fix: explicit — do not rely on defaultNow() when listing other fields
       })
       .onConflictDoUpdate({
         target: [verticalPacks.vertical, verticalPacks.region],
         // CL4 fix: 'retiredAt: null' unconditionally un-retires a pack on re-seed.
         // If an operator intentionally retired a pack (set retiredAt = NOW()), re-running
         // seed.ts would reset it to null — resurrecting the retired pack silently.
         // Fix: only update name/version/updatedAt; never touch retiredAt in seed upsert.
         // To re-activate a retired pack, do it explicitly via DB: UPDATE vertical_packs SET retired_at = NULL WHERE id = X.
         // CO5 fix: add promptsCount: 0 to conflict SET — if the COUNT update at the end fails,
         // promptsCount stays stale from the prior seed run. Reset to 0 first so stale is obvious.
         set: { name: sql`excluded.name`, version: sql`excluded.version`, updatedAt: new Date(), promptsCount: 0 },
       })
       .returning();

     // Delete existing prompts before re-inserting (simpler than upsert on 124 rows):
     await db.delete(verticalPackPrompts).where(eq(verticalPackPrompts.packId, pack.id));

     // Bulk insert all prompts:
     await db.insert(verticalPackPrompts).values(AU_TRADIES_PROMPTS.map((p, i) => ({ packId: pack.id, ...p, rank: p.rank ?? i + 1 })));

     // Update promptsCount:
     const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
       .from(verticalPackPrompts).where(eq(verticalPackPrompts.packId, pack.id));
     await db.update(verticalPacks).set({ promptsCount: count }).where(eq(verticalPacks.id, pack.id));
     ```
   - **CA6 fix — `promptsCount` column must be updated after seed inserts:**
     The `vertical_packs.promptsCount` column is an integer that must match the actual row count in `vertical_pack_prompts`. The seed runner must set it after bulk-inserting prompts:
     ```typescript
     // In seed.ts after inserting all prompt rows for a pack:
     const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
       .from(verticalPackPrompts).where(eq(verticalPackPrompts.packId, pack.id));
     await db.update(verticalPacks).set({ promptsCount: count }).where(eq(verticalPacks.id, pack.id));
     ```
     The `GET /api/vertical-packs` endpoint returns `promptsCount` for the wizard cards — if the seed doesn't update it, the wizard shows "0 prompts" for all packs.
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
   - components/domain/vertical/pack-browser.tsx — 3 cards data-driven from API. **CE5 fix — nothing specifies that the "Coming v1.1" cards are hardcoded client-side, not from the API.** The API only returns active seeded packs (3 in Sprint 5). Professional Services and Real Estate are NOT in the DB. Claude Code without this note would expect the API to return 5 packs and write a filter — and find only 3.

     **CH3 fix — pack-browser.tsx is used in two modes with different card sets:**
     - **`mode='wizard'`** (wizard step 2): 3 active API packs + 2 `COMING_V1_1_PACKS` = **5 cards**. No coming-soon cards (irrelevant in wizard context).
     - **`mode='browser'`** (`/verticals` page): 3 active API packs + 2 `COMING_V1_1_PACKS` + 3 `COMING_SOON_PACKS` = **8 cards**. Shows full roadmap.

     ```tsx
     // components/domain/vertical/pack-browser.tsx — 'use client'
     // CO3 fix: useRouter missing — CN1 added router.push() but import was never specified.
     import { useRouter } from 'next/navigation';
     import { useState, useEffect } from 'react';
     import type { VerticalPack } from '@/db/schema';
     const COMING_V1_1_PACKS = [
       { id: 'professional_services', name: 'Professional Services', desc: 'Accountants, lawyers, consultants.', status: 'coming-v1.1' as const },
       { id: 'real_estate', name: 'Real Estate', desc: 'Sales agents, property managers, buyer agents.', status: 'coming-v1.1' as const },
     ];
     const COMING_SOON_PACKS = [
       { id: 'hospitality', name: 'Hospitality', desc: 'Cafe, restaurant, accommodation.', status: 'coming-soon' as const },
       { id: 'retail_ecommerce', name: 'Retail / E-commerce', desc: 'Online stores, ChatGPT Shopping surfaces.', status: 'coming-soon' as const },
       { id: 'beauty', name: 'Beauty / Personal Care', desc: 'Salon, clinic, spa.', status: 'coming-soon' as const },
     ];

     interface PackBrowserProps {
       mode: 'wizard' | 'browser';
       // CK1 fix: onSelect was typed as (packId: string) => void but CJ1 changed the call site to
       // pass the full pack object (needed to set form.vertical). Interface and call site were
       // type-incompatible — TypeScript compile error. Corrected to receive full VerticalPack.
       onSelect?: (pack: VerticalPack) => void;
       selectedPackId?: string;
     }

     export function PackBrowser({ mode, onSelect, selectedPackId }: PackBrowserProps) {
       // CP2 fix: CO3 added the useRouter import but never declared the hook inside the component.
       // Without this line, router.push() throws "Cannot find name 'router'" at compile time.
       const router = useRouter();
       const [activePacks, setActivePacks] = useState<VerticalPack[]>([]);
       useEffect(() => {
         fetch('/api/vertical-packs').then(r => r.json()).then(setActivePacks);
       }, []);
       const allCards = [
         ...activePacks.map(p => ({ ...p, status: 'active' as const })),
         ...COMING_V1_1_PACKS,
         ...(mode === 'browser' ? COMING_SOON_PACKS : []),  // only in full browser view
       ];
       // CL2 fix: clicking a locked card must NOT call onSelect.
       // Without this guard, clicking "Professional Services" calls form.setValue('vertical', undefined)
       // — breaking brandFormSchema.vertical validation on form submit.
       // CN1 fix: in BROWSER mode, active card click navigates to /verticals/[pack.id].
       // COMING_V1_1_PACKS use string IDs ('professional_services') NOT UUIDs — no detail route.
       // coming-v1.1 and coming-soon cards are non-navigable in browser mode.
       const handleCardClick = (card: typeof allCards[0]) => {
         if (card.status !== 'active') return;  // locked: no-op (CL2) + non-navigable (CN1)
         if (mode === 'browser') {
           router.push(`/verticals/${card.id}`);  // card.id is a DB UUID for active packs
         } else {
           onSelect?.(card as VerticalPack);       // wizard mode: set form state (CJ1)
         }
       };
       return <div className="grid grid-cols-3 gap-4">{allCards.map(card => renderCard(card, handleCardClick))}</div>;
     }
     ```
   - components/domain/vertical/prompt-preview.tsx — shows top 3 expanded prompts. **CF5 fix — implementation never specified:**
     ```tsx
     // components/domain/vertical/prompt-preview.tsx — 'use client'
     interface PromptPreviewProps {
       packId: string;
       brandName: string;      // from wizard form state — brand not in DB yet
       primaryRegion: string;  // first primaryRegions entry, e.g. 'NSW:Bondi'
                               // CI4 fix: step 2 runs before step 3 (locations).
                               // When primaryRegion is not yet set, use 'NSW:Sydney CBD' as default
                               // so the preview shows a meaningful location rather than "in , "
     }

     export function PromptPreview({ packId, brandName, primaryRegion }: PromptPreviewProps) {
       const [prompts, setPrompts] = useState<string[]>([]);
       const [loading, setLoading] = useState(false);

       useEffect(() => {
         if (!packId || !brandName) return;
         // CN4 fix: AbortController cancels in-flight fetch on cleanup.
         // CP5 fix: .finally(() => setLoading(false)) runs even after abort, causing
         // "state update on unmounted component" warning. Use isMounted ref to guard.
         const controller = new AbortController();
         let isMounted = true;
         setLoading(true);
         // CI4 fix: use Sydney CBD as default when user hasn't set locations in step 3 yet
         const region = primaryRegion || 'NSW:Sydney CBD';
         const params = new URLSearchParams({ preview: 'true', brandName, primaryRegion: region });
         fetch(`/api/vertical-packs/${packId}/prompts?${params}`, { signal: controller.signal })
           .then(r => r.json())
           .then(d => { if (isMounted) setPrompts(d.expandedPrompts ?? []); })
           .catch(e => { if (e.name !== 'AbortError') console.error(e); })
           .finally(() => { if (isMounted) setLoading(false); });
         return () => { isMounted = false; controller.abort(); };
       }, [packId, brandName, primaryRegion]);

       if (loading) return <Skeleton className="h-24 w-full" />;
       if (!prompts.length) return null;
       return (
         <div className="space-y-2 mt-3">
           <p className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
             Sample prompts for this pack
           </p>
           {prompts.map((p, i) => (
             <p key={i} className="text-[13px] italic" style={{ color: 'var(--text-secondary)' }}>"{p}"</p>
           ))}
         </div>
       );
     }
     ```

   **CI5 fix — wizard state wiring never specified.** The wizard's outer component must connect pack selection → preview:
   ```tsx
   // Inside the brand wizard (step 2 section) — 'use client'
   const [selectedPackId, setSelectedPackId] = useState<string>('');
   const [brandName, setBrandName] = useState('');         // set from step 1 form
   const [primaryRegion, setPrimaryRegion] = useState(''); // set from step 3 form

   // CJ1 fix: selecting a pack must ALSO set brand.vertical on the react-hook-form.
   // brandFormSchema.vertical is required for POST /api/brands.
   // The pack's 'vertical' field ('tradies'|'allied_health'|'saas') maps 1:1 to brands.vertical.
   // Without this, POST /api/brands sends vertical: undefined → Zod validation error.
   const handlePackSelect = (pack: VerticalPack) => {
     setSelectedPackId(pack.id);
     form.setValue('vertical', pack.vertical as 'tradies' | 'allied_health' | 'saas', { shouldValidate: true });
   };

   // Step 2 renders:
   <PackBrowser
     mode="wizard"
     selectedPackId={selectedPackId}
     onSelect={(pack) => handlePackSelect(pack)}  // onSelect receives full pack object, not just id
   />
   {selectedPackId && (
     <PromptPreview
       packId={selectedPackId}
       brandName={brandName || 'your brand'}
       primaryRegion={primaryRegion}  // empty string is OK — CI4 fix handles fallback
     />
   )}
   ```
   - app/(auth)/verticals/page.tsx — read-only operator browser (links from sidebar). **CJ3 fix — content never specified:**
     ```tsx
     // app/(auth)/verticals/page.tsx — server component (no data fetching; PackBrowser fetches client-side)
     import { PackBrowser } from '@/components/domain/vertical/pack-browser';

     export default function VerticalsPage() {
       return (
         <PageShell breadcrumbs={['Workspace', 'Vertical packs']}>
           <div className="max-w-7xl mx-auto px-6 py-8">
             <div className="mb-8">
               <h1 className="text-2xl font-semibold mb-1">Vertical packs</h1>
               <p className="text-sm text-secondary">
                 AU-tuned prompt libraries. 3 active (v1: Tradies, SaaS, Allied Health) ·
                 2 coming v1.1 (Professional Services, Real Estate) · 3 coming soon.
               </p>
             </div>
             <PackBrowser mode="browser" />
             <div className="mt-8 p-4 rounded-md flex items-start gap-3 bg-subtle border border-subtle">
               <Lightbulb className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber" />
               <p className="text-[13px] text-secondary">
                 Vertical packs are updated based on AU search behaviour. New prompts added monthly.
                 Suggest a vertical via the support widget.
               </p>
             </div>
           </div>
         </PageShell>
       );
     }
     ```
   - **CB4 fix: update Sprint 4's `app/(auth)/layout.tsx` to add "Vertical packs" to the Insights sidebar group.** Sprint 4 spec defined Insights as "Action Center (Sprint 6), Local SEO (Sprint 8)" — `/verticals` was never added. Without this update, the acceptance criterion "Read-only /verticals page accessible from sidebar" cannot pass even if the page exists.
     ```typescript
     // In app/(auth)/layout.tsx Insights group:
     { href: '/verticals', icon: BookOpen, label: 'Vertical packs' },  // NEW Sprint 5
     { href: '/action-center', icon: Sparkles, label: 'Action Center', badge: 'Sprint 6' },
     { href: '/local-seo', icon: MapPin, label: 'Local SEO', badge: 'Sprint 8' },
     ```
   - Update brand wizard step 2 to use pack-browser.tsx with real data

6. ATTRIBUTIONS.md
   - Create root-level ATTRIBUTIONS.md per §9 — **CI1 fix: stub only** (CF1 corrected §9; Sprint 7 writes first OSS entries). Sprint 5 creates the file with a placeholder, not Sprint 5 content rows.

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

- Unit: `expand-prompt.test.ts` covering all placeholders. **CC4 fix — test bodies never specified; two new helpers (CA3/CB3) also need coverage:**
  ```typescript
  // tests/unit/verticals/expand-prompt.test.ts
  import { describe, it, expect } from 'vitest';
  import { expandPrompt } from '@/lib/verticals/expand-prompt';
  import type { Brand } from '@/db/schema';

  const mockBrand = { name: 'Bondi Plumbing', domain: 'bondiplumbing.com.au' } as Brand;
  const ctx = { brand: mockBrand, competitors: ['Eastern Plumbing Co'], locations: ['NSW:Bondi', 'NSW:Manly'] };

  describe('expandPrompt', () => {
    it('replaces {brand}', () => expect(expandPrompt('{brand} is great', ctx)).toEqual(['Bondi Plumbing is great']));
    it('replaces {domain}', () => expect(expandPrompt('visit {domain}', ctx)).toEqual(['visit bondiplumbing.com.au']));
    it('replaces {competitors} joined', () => expect(expandPrompt('{brand} vs {competitors}', ctx)).toEqual(['Bondi Plumbing vs Eastern Plumbing Co']));
    it('no placeholders returns [template] unchanged', () => expect(expandPrompt('generic question', ctx)).toEqual(['generic question']));

    // CA3: formatLocation
    it('{location} expands to N prompts, one per location, formatted as "Suburb, STATE"', () => {
      const result = expandPrompt('best plumber in {location}', ctx);
      expect(result).toHaveLength(2);
      expect(result[0]).toBe('best plumber in Bondi, NSW');  // NOT 'NSW:Bondi'
      expect(result[1]).toBe('best plumber in Manly, NSW');
    });
    it('location with no colon passes through unchanged', () => {
      const ctxNoColon = { ...ctx, locations: ['Sydney'] };
      expect(expandPrompt('plumber in {location}', ctxNoColon)).toEqual(['plumber in Sydney']);
    });

    // CB3: formatCompetitors
    it('empty competitors falls back to "other local providers"', () => {
      const ctxNoComp = { ...ctx, competitors: [] };
      expect(expandPrompt('{brand} vs {competitors}', ctxNoComp)).toEqual(['Bondi Plumbing vs other local providers']);
    });

    // CP1 fix: empty locations with {location} template now returns [] (skip, not passthrough)
    // Previous test asserted .toHaveLength(1) — wrong; the template has unresolved {location}
    it('empty locations with {location} template returns [] (template skipped)', () => {
      const ctxNoLoc = { ...ctx, locations: [] };
      expect(expandPrompt('plumber in {location}', ctxNoLoc)).toEqual([]);  // skip, not passthrough
    });
    it('empty locations with no-location template still returns [expanded]', () => {
      const ctxNoLoc = { ...ctx, locations: [] };
      expect(expandPrompt('{brand} is great', ctxNoLoc)).toEqual(['Bondi Plumbing is great']);
    });
  });
  ```
- Integration: `pack-driven-audit.test.ts` verifies audit job loads prompts from DB and expands correctly. **CE6 fix — test body now specified.**

  **CO4 fix — integration test DB setup never specified:** Both `seed.test.ts` and `pack-driven-audit.test.ts` comment "Uses test DB with seeded packs" but give no setup code. Vitest requires a globalSetup file:

  ```typescript
  // vitest.integration.config.ts:
  import { defineConfig } from 'vitest/config';
  export default defineConfig({
    test: {
      include: ['tests/integration/**/*.test.ts'],
      globalSetup: ['tests/integration/setup.ts'],
      testTimeout: 30_000,
      env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL },
    },
  });

  // tests/integration/setup.ts:
  import { execSync } from 'child_process';
  export async function setup() {
    execSync('pnpm drizzle-kit migrate', { env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL } });
    execSync('pnpm seed', { env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL } });
  }
  ```
  Add `"test:integration": "vitest run --config vitest.integration.config.ts"` to `package.json`.
  Requires `TEST_DATABASE_URL` in `.env.test` pointing to a separate test Postgres DB.
  ```typescript
  // tests/integration/audit/pack-driven-audit.test.ts
  import { describe, it, expect, beforeAll } from 'vitest';
  // Uses test DB with seeded packs (seed.ts run in test setup)

  describe('pack-driven audit (Sprint 5)', () => {
    it('loads active pack for tradies/au and returns 10 prompts', async () => {
      const pack = await getVerticalPack('tradies', 'au');
      expect(pack).toBeDefined();
      expect(pack!.promptsCount).toBeGreaterThan(0);
    });

    it('expandPrompt with 2 locations produces ≤10 expanded prompts after slice', async () => {
      const templates = await db.select().from(verticalPackPrompts)
        .where(eq(verticalPackPrompts.packId, pack!.id))
        .orderBy(asc(verticalPackPrompts.rank)).limit(10);
      const expanded = templates.flatMap(t =>
        expandPrompt(t.promptTemplate, { brand: mockBrand, competitors: [], locations: ['NSW:Bondi', 'NSW:Manly'] })
      ).slice(0, 10);
      expect(expanded.length).toBeLessThanOrEqual(10);
      expect(expanded[0]).not.toContain('{brand}');  // placeholders replaced
      expect(expanded[0]).not.toContain('{location}');
      expect(expanded[0]).toContain('Bondi, NSW');   // formatLocation applied
    });

    it('null pack triggers graceful failure, not TypeError', async () => {
      const pack = await getVerticalPack('nonexistent_vertical' as any, 'au');
      expect(pack).toBeUndefined();  // no crash
    });

    it('audit with DB prompts produces same scoring shape as Sprint 4', async () => {
      // Run a full mock audit and verify scoreComposite is 0-100 range
      // (regression: DB prompts must produce same citation + scoring pipeline)
      const result = await runMockAudit({ vertical: 'tradies', region: 'au', scenario: 'happy_path' });
      expect(result.scoreComposite).toBeGreaterThanOrEqual(0);
      expect(result.scoreComposite).toBeLessThanOrEqual(100);
      expect(result.promptCount).toBeGreaterThan(0);
      expect(result.promptCount).toBeLessThanOrEqual(10);
    });
  });
  ```
- Seed verification: count check (`SELECT COUNT(*) FROM vertical_pack_prompts GROUP BY pack_id`) returns 124/104/108. **CH4 fix — this is described as a manual SQL check, not an automated test. Add `seed.test.ts`:**
  ```typescript
  // tests/integration/audit/seed.test.ts
  import { describe, it, expect, beforeAll } from 'vitest';

  describe('Sprint 5 seed verification', () => {
    it('vertical_packs has exactly 3 rows (tradies, allied_health, saas)', async () => {
      const packs = await db.select().from(verticalPacks).where(isNull(verticalPacks.retiredAt));
      expect(packs).toHaveLength(3);
      const verticals = packs.map(p => p.vertical).sort();
      expect(verticals).toEqual(['allied_health', 'saas', 'tradies']);
    });

    it('AU Tradies pack has exactly 124 prompts', async () => {
      const pack = await getVerticalPack('tradies', 'au');
      const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
        .from(verticalPackPrompts).where(eq(verticalPackPrompts.packId, pack!.id));
      expect(count).toBe(124);
      expect(pack!.promptsCount).toBe(124);  // in-table cache matches real count
    });

    it('AU Allied Health pack has exactly 104 prompts', async () => {
      const pack = await getVerticalPack('allied_health', 'au');
      const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
        .from(verticalPackPrompts).where(eq(verticalPackPrompts.packId, pack!.id));
      expect(count).toBe(104);
    });

    it('AU SaaS pack has exactly 108 prompts', async () => {
      const pack = await getVerticalPack('saas', 'au');
      const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
        .from(verticalPackPrompts).where(eq(verticalPackPrompts.packId, pack!.id));
      expect(count).toBe(108);
    });

    it('total prompt count is 336', async () => {
      const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(verticalPackPrompts);
      expect(total).toBe(336);  // 124 + 104 + 108
    });
  });
  ```

---

## 12. Acceptance criteria

- [ ] `vertical_packs` table has 3 rows (AU Tradies, AU Allied Health, AU SaaS)
- [ ] `vertical_pack_prompts` table has 336 total rows (124+104+108)
- [ ] Brand wizard step 2 shows 3 cards with real counts from API (not hardcoded V1_VERTICAL_PACKS)
- [ ] Selecting a pack card in wizard step 2 sets `brand.vertical` on the form (CJ1 fix)
- [ ] POST /api/brands receives correct `vertical` value after wizard pack selection — verify by checking the created brand row in DB (CN5 fix: no test previously ensured the form value actually reached the server)
- [ ] Audit job uses DB prompts (verify by editing a prompt row and re-running audit)
- [ ] Prompt expansion: `{brand}` and `{location}` placeholders work correctly; `{location}` renders as "Suburb, STATE" not "STATE:Suburb"
- [ ] GET /api/vertical-packs/[id]/prompts returns top 3 expanded prompts with brandName/primaryRegion query params (CJ4 fix)
- [ ] Wizard step 2 shows PromptPreview component below selected pack card (CJ4 fix)
- [ ] ATTRIBUTIONS.md stub exists at repo root (CI1 fix: CF1 corrected §9 — Sprint 5 creates stub only; Sprint 7 writes first OSS entries per PRD §16)
- [ ] Read-only `/verticals` page accessible from sidebar (Insights group), shows 8 cards: 3 active + 2 coming-v1.1 + 3 coming-soon (CJ4 fix)
- [ ] No regression: full audit still produces same scoring shape as Sprint 4

---

## 13. Common pitfalls / Sprint 5 anti-patterns

- **Do not** allow users to author their own prompts in v1. Vertical packs are curated.
- **Do not** query `vertical_packs` without `isNull(verticalPacks.retiredAt)`. **(CG5)** If a pack's `retiredAt` is accidentally set incorrectly (e.g., a future date), or if a new pack version is added alongside an old one before retirement, `findFirst` without the filter returns an arbitrary row — possibly the retired one. Always use `getVerticalPack()` (which includes the `isNull` filter) rather than inlining the query.
- **Do not** delete the old inline arrays before integration tests pass. Keep `lib/audit/prompts.ts` as a fallback. **CI3 fix — "briefly" is undefined; exact deletion gate:** Delete `lib/audit/prompts.ts` only after ALL of the following are green: (a) `seed.test.ts` assertions pass (124/104/108/336 counts confirmed), (b) `pack-driven-audit.test.ts` passes (DB prompts expand correctly), (c) a manual end-to-end audit run with a real brand completes without errors. Do not delete before Sprint 5 acceptance is fully signed off — the fallback exists precisely for debugging if DB-driven prompts produce unexpected results.
- **Do not** expand `{location}` into one mega-prompt with all suburbs. Generate N prompts per template if multiple locations — but cap at 3 locations max to control cost.
- **Do not** include placeholder tokens in cost-tracked tokens. Compute cost on the *expanded* prompt, not the template.

---

## 15. Handoff to Sprint 6

Ready:
- ✓ Curated prompts in DB — Sprint 6 Action Center reads from these to generate recommendations
- ✓ `category` field on prompts — Sprint 6 groups recommendations by category

Not ready:
- Recommendation generation (Sprint 6)
- Anti-pattern filter (Sprint 6)
- Confirmed/Likely/Hypothesis confidence labels (Sprint 6)

**CH5 fix — Foundations cross-doc gap:** `vertical_packs` and `vertical_pack_prompts` are Sprint 5 additions not listed in Foundations v1.12. Any sprint after Sprint 5 that reads Foundations for schema reference won't find these tables. Sprint 5 build engineer must append a Sprint 5 schema appendix to `sri-visibleau-foundations.md`:

```
### Sprint 5 additions: vertical_packs + vertical_pack_prompts
(see sri-visibleau-sprint-5-prompt.md §5 for full column definitions)
Key columns: vertical, region, version, promptsCount, retiredAt, rank, category, topic, expectedMentionType
Unique constraint: (vertical, region) — one active pack per vertical per region
RLS: DISABLED on both tables (global data, no organizationId)
```

---

## Changelog

- v1.18 (17 May 2026): **Sixteenth-pass audit — literal {location}, router hook, null category, packId validation, isMounted guard (CP1-CP5).** **(CP1)** §7 expandPrompt + §11 CC4 test: templates with `{location}` when locations is empty now return `[]` (skip) not `[template with unresolved placeholder]`; LLM was receiving "best plumber in {location}" literally; CC4 test corrected from `.toHaveLength(1)` to `.toEqual([])`. **(CP2)** §10 step 5 pack-browser: `const router = useRouter()` added inside `PackBrowser()` — CO3 added the import but never declared the hook call; TypeScript "Cannot find name 'router'". **(CP3)** §10 CM3 VerticalPackDetail: `isNotNull(verticalPackPrompts.category)` filter added to GROUP BY query — NULL categories produce `key={null}` React warnings and empty labels in the breakdown UI. **(CP4)** §6 prompts preview endpoint: packId validated before querying prompts — non-existent UUID previously returned `{ expandedPrompts: [] }` with no error; now 404. **(CP5)** §10 step 5 prompt-preview.tsx: `isMounted` ref guard added — `.finally(() => setLoading(false))` ran after AbortController abort causing "state update on unmounted component" warning; both `setPrompts` and `setLoading` now guarded by `if (isMounted)`.
- v1.17 (17 May 2026): **Fifteenth-pass audit — brandsCount RLS fix, empty prompts guard, useRouter import, integration test setup, promptsCount in conflict SET (CO1-CO5).** **(CO1)** §6 API: brandsCount LEFT JOIN on RLS-protected brands table requires `setRlsContext` — without it RLS blocks brands access and every pack shows 0; fixed to add `setRlsContext` + `organization_id` filter so each org sees their own brand count. **(CO2)** §8 audit job: empty `promptRows` guard — if seed hasn't run, `prompts.length === 0` produces `scoreComposite = 0/0 = NaN`; now fails audit gracefully with clear error message. **(CO3)** §10 step 5 pack-browser.tsx: `import { useRouter } from 'next/navigation'` added — CN1 added `router.push()` but the import was never specified; TypeScript "Cannot find name 'router'" without it. **(CO4)** §11: Vitest integration test setup now specified — `vitest.integration.config.ts` + `tests/integration/setup.ts` globalSetup that runs migrate+seed against `TEST_DATABASE_URL`; `pnpm test:integration` script. **(CO5)** §10 step 2 seed: `promptsCount: 0` added to conflict SET clause — resets before COUNT update; without it a failed COUNT update leaves stale promptsCount from prior seed.
- v1.16 (17 May 2026): **Fourteenth-pass audit — card navigation packId, seed updatedAt, db/client.ts diff, AbortController, acceptance POST vertical (CN1-CN5).** **(CN1)** §10 step 5 pack-browser: `handleCardClick` now routes by mode — browser pushes `router.push('/verticals/${pack.id}')` using DB UUID; wizard calls `onSelect`; `COMING_V1_1_PACKS` string IDs are non-navigable (no detail route exists for them). **(CN2)** §10 step 2 seed: `updatedAt: new Date()` added to initial INSERT values — CJ5 added the column; CL4 set it in conflict clause; the first-run INSERT never set it; Drizzle `defaultNow()` may not apply when other columns are explicitly listed. **(CN3)** §5 CH2: `db/client.ts` actual TypeScript diff now specified — CH2 said "add to schema object" as a comment; shows full `drizzle(client, { schema: {...} })` extension with Sprint 5 tables and relations. **(CN4)** §10 step 5 prompt-preview.tsx: `AbortController` cleanup added — rapid pack card clicks launched concurrent fetches; last-to-resolve won, showing wrong prompts; abort on re-render or unmount fixes stale fetch. **(CN5)** §12 acceptance: "POST /api/brands receives correct `vertical` after pack selection" added — CJ1 fixed the form setValue but no acceptance criterion verified the value reached the server.
- v1.15 (17 May 2026): **Thirteenth-pass audit — index.ts real code, service-specific category, PackDetail route, seed distribution fix, drizzle.config clarification (CM1-CM5).** **(CM1)** §4: lib/verticals/index.ts CE3 pseudo-comment converted to real TypeScript code block — was `# comment` style inside directory tree; actual `.ts` file content now specified. **(CM2)** §5 schema: `'service-specific'` added to canonical category set — VerticalPackDetail shows 24 Tradies prompts in this category ("plumber for hot water installation {location}"); was missing from CF4's 8-value list. **(CM3)** §4 project structure + §8: `app/(auth)/verticals/[packId]/page.tsx` now specified — route was never in project structure; page fetches pack + category GROUP BY + brandsCount in server component; no separate API endpoint needed. **(CM4)** §8 seed distribution: corrected to match VerticalPackDetail prototype counts (28+18+22+24+12+10+6+4=124) — original 40/20/15/15/10 left emergency, compliance, recommendation, service-specific at 0%. **(CM5)** §10 step 1: drizzle.config.ts coverage note — barrel or glob both cover Sprint 5 tables automatically; verify by checking generated migration SQL includes both new tables.
- v1.14 (17 May 2026): **Twelfth-pass audit — brandsCount in API, locked click guard, seed script, retiredAt conditional reset (CL1-CL5).** **(CL1+CL5)** §6 API response: `brandsCount` added — VerticalPackBrowser shows "2 active brands" per pack; requires `LEFT JOIN brands ON b.vertical = vp.vertical AND b.deleted_at IS NULL` COUNT in the route; was absent from CD2 spec. **(CL2)** §10 step 5 pack-browser: `handleCardClick` guard added — clicking locked coming-v1.1/coming-soon card must not call `onSelect`; without it `form.setValue('vertical', undefined)` breaks brand form validation. **(CL3)** §2: `"seed": "tsx db/seed/seed.ts"` script added to package.json — `pnpm seed` is the standard invocation; raw `pnpm tsx ...` requires remembering the full path. **(CL4)** §10 step 2: seed upsert no longer resets `retiredAt: null` — an intentionally retired pack would be silently un-retired on re-seed; fix: only update name/version/updatedAt in the conflict clause.
- v1.13 (17 May 2026): **Eleventh-pass audit — onSelect type, updatedAt in response, FK cascade, expandPrompt re-export, verticalEnum note (CK1-CK5).** **(CK1)** §10 step 5 PackBrowserProps: `onSelect` retyped from `(packId: string)` to `(pack: VerticalPack)` — CJ1 changed the call site to pass full pack object but the interface still said `string`; TypeScript compile error. **(CK2)** §6 API response: `updatedAt` added to GET /api/vertical-packs response shape — CJ5 added the column to schema; VerticalPackDetail needs it for "last updated 2 weeks ago"; was absent from the CD2 response spec. **(CK3)** §5 schema: `packId` FK now has `{ onDelete: 'cascade' }` — without it, hard-deleting a pack leaves orphaned prompt rows with broken FK references. **(CK4)** §4 lib/verticals/index.ts: `expandPrompt`, `formatLocation`, `formatCompetitors` re-exported so callers can import both from `@/lib/verticals` without two separate paths. **(CK5)** §5 schema import: clarifying note that `verticalEnum` in Foundations v1.12 already includes `professional_services` and `real_estate` as v1.1 values; Sprint 5 requires no enum migration.
- v1.12 (17 May 2026): **Tenth-pass audit — vertical setter, metadata purpose, verticals page content, acceptance gaps, updatedAt (CJ1-CJ5).** **(CJ1)** §10 step 5: pack card selection must call `form.setValue('vertical', pack.vertical)` on react-hook-form — without this, POST /api/brands sends `vertical: undefined` → Zod validation error; `onSelect` callback now receives full pack object not just id. **(CJ2)** §5 schema: metadata column purpose documented — `{ "author": "sri", "source": "manual-curation", "approvedAt": "..." }`; Sprint 7 adds corpusValidationSpearman. **(CJ3)** §10 step 5: `verticals/page.tsx` content now specified — server component wrapping `<PackBrowser mode="browser" />` with title, description count summary, and info banner matching VerticalPackBrowser prototype. **(CJ4)** §12 acceptance: 3 missing items added — prompts preview endpoint working, PromptPreview visible in wizard, /verticals shows 8 cards. **(CJ5)** §5 schema: `updatedAt` timestamp added to `vertical_packs` — §1 promises "last updated" metadata; VerticalPackDetail shows "last updated 2 weeks ago"; no column existed to source this from.
- v1.11 (17 May 2026): **Ninth-pass audit — ATTRIBUTIONS step/acceptance fix, tsx devDep, prompts.ts gate, step-2-before-step-3 location, wizard state wiring (CI1-CI5).** **(CI1)** §10 step 6 + §12 acceptance: "Add Sprint 5 entries" corrected to stub-only (CF1 fixed §9 but step 6 and acceptance were not updated). **(CI2)** §2: `pnpm add -D tsx` added — `pnpm tsx db/seed/seed.ts` requires tsx installed as devDep; "tsx: command not found" on clean install. **(CI3)** §13 anti-patterns: `lib/audit/prompts.ts` deletion gate now specified — delete only after seed.test.ts + pack-driven-audit.test.ts + manual E2E all pass; "briefly" was ambiguous. **(CI4)** §10 step 5 prompt-preview.tsx: empty `primaryRegion` when step 2 renders before step 3 (location not set yet) now handled — default to `'NSW:Sydney CBD'` so preview shows "in Sydney CBD, NSW" not "in , ". **(CI5)** §10 step 5: wizard state wiring now specified — `selectedPackId` + `brandName` + `primaryRegion` state in wizard outer component; `onSelect` updates `selectedPackId`; `PromptPreview` renders below `PackBrowser` when a pack is selected.
- v1.10 (17 May 2026): **Eighth-pass audit — uniqueIndex import, Drizzle relations, pack-browser mode prop, seed count test, Foundations cross-doc (CH1-CH5).** **(CH1)** §5 schema: `uniqueIndex` added to `drizzle-orm/pg-core` import — CC5 used it in the table definition but the import was never updated; TypeScript compile error. **(CH2)** §5 schema: `relations()` definitions added for verticalPacks↔verticalPackPrompts — `db.query.verticalPacks.findFirst()` (used in getVerticalPack) requires relations to be registered; without them db.query.verticalPacks is undefined at runtime. **(CH3)** §10 step 5: pack-browser.tsx `mode` prop specified — wizard shows 5 cards (3 active + 2 coming-v1.1), browser shows 8 cards (+ 3 coming-soon); same component, different card sets via prop. **(CH4)** §11: automated seed count test `seed.test.ts` added — 5 assertions verifying exact counts (124/104/108/336) and promptsCount cache accuracy. **(CH5)** §14→§15: Foundations cross-doc note added — Sprint 5 tables not in Foundations v1.12; build engineer must append schema appendix.
- v1.9 (17 May 2026): **Seventh-pass audit — pack selection display-only, prompt-rank.ts body, expectedMentionType purpose, confirm screen Pack row, retiredAt anti-pattern (CG1-CG5).** **(CG1)** §6 API response + §8 audit job: wizard step 2 pack selection is display-only in v1 — brands.vertical determines the pack; brands table has no packId; clarified with TODO Sprint 6 comment; misleading "UUID used to record which pack was selected" corrected. **(CG2)** §4 prompt-rank.ts: content now specified — `assignRanks()` helper fills missing rank values for seed rows authored without explicit ranks. **(CG3)** §5 schema: `expectedMentionType` purpose documented — Sprint 7 corpus validation uses it to weight scoring precision; Sprint 5 stores it only; seed authors must populate it correctly. **(CG4)** Prototype `BrandSetupWizard` step 4: "Pack" row added to confirm screen — step 2 collected pack info but step 4 never showed it; user can't verify which pack will run before submitting. **(CG5)** §13 anti-patterns: `getVerticalPack()` always preferred over inlining query — the `isNull(retiredAt)` filter is critical; missing it returns arbitrary/retired pack rows.
- v1.8 (17 May 2026): **Sixth-pass audit — ATTRIBUTIONS sprint scope, types.ts removed, preview endpoint brandId fix, category enum, prompt-preview.tsx impl (CF1-CF5).** **(CF1)** §9: ATTRIBUTIONS.md corrected to stub-only in Sprint 5 — PRD §16 canonical says Sprint 7 writes first entries (OSS references); Sprint 5 has no OSS references (packs are original Sri content). **(CF2)** §4 types.ts removed — CA5 already exports VerticalPack/VerticalPackPrompt as InferSelectModel from db/schema/index.ts; separate types.ts creates competing declarations. **(CF3)** §6: prompts preview endpoint supersedes CE1 — `?brandId=X` replaced with `?brandName=X&primaryRegion=Y` because brand doesn't exist in DB when wizard step 2 runs; no cross-org check needed since no DB record. **(CF4)** §5 schema category comment: canonical values now specified — `'service-discovery'|'recommendation'|'comparison'|'pricing'|'problem-driven'|'reviews'|'compliance'|'emergency'`. **(CF5)** §10 step 5: `prompt-preview.tsx` implementation specified — `useEffect` fetch on packId/brandName/primaryRegion change; Skeleton while loading; renders top 3 italic prompt strings.
- v1.7 (17 May 2026): **Fifth-pass audit — locations-au removed, getVerticalPack body, RLS disable, v1.1 cards hardcoded, integration test body (CE2-CE6).** **(CE2)** §4: `locations-au.ts` removed from seed/shared/ — duplicate of Sprint 4 `lib/locations/index.ts`; expandPrompt receives locations from `brand.primaryRegions` at runtime. **(CE3)** §4 + §10: `lib/verticals/index.ts` content now specified — `getVerticalPack(vertical, region)` wraps the `findFirst` DB query with `isNull(retiredAt)` filter; audit job imports it instead of inlining. **(CE4)** §10 step 1: Sprint 5 migration must add `ALTER TABLE vertical_packs DISABLE ROW LEVEL SECURITY` and same for `vertical_pack_prompts` — global tables with no `organizationId` cannot have RLS policies; if Supabase enables RLS by default, all queries return 0 rows. **(CE5)** §10 step 5: pack-browser.tsx rendering pattern specified — 3 active packs from API + 2 `COMING_V1_1_PACKS` hardcoded constant (Prof Services, Real Estate not in DB); Claude Code without this would expect 5 packs from the API. **(CE6)** §11: `pack-driven-audit.test.ts` integration test body now specified — 4 tests covering pack lookup, expansion with 2 locations, null pack graceful failure, and scoring shape regression.
- v1.6 (17 May 2026): **Fourth-pass audit — phantom deps, API response shape, promptCount clarification, createdAt, template placeholders (CD1-CD5).** **(CD1)** §2: gray-matter and papaparse removed — neither is used in Sprint 5; seed is TypeScript arrays, prompts are DB text. **(CD2)** §6: GET /api/vertical-packs response shape specified — `{ id, name, vertical, region, version, promptsCount, publishedAt }[]` ordered by `vertical ASC`, filtered by `retired_at IS NULL`. **(CD3)** §8: `audits.promptCount = prompts.length` (expanded count after slice) — clarified matches Foundations spec; may be <10 if brand has 0 primaryRegions. **(CD4)** §5 vertical_pack_prompts: `createdAt` timestamp added — every Foundations table has it; Sprint 7 metrics need it. **(CD5)** Prototype VerticalPackDetail: category samples use `{brand}` placeholder instead of hardcoded "Bondi Plumbing".
- v1.5 (17 May 2026): **Third-pass audit — seed idempotency, prototype Customise button, Action templates, test bodies, unique constraint (CC1-CC5).** **(CC1)** §10 step 2: seed idempotency — `INSERT ... ON CONFLICT DO UPDATE` on vertical_packs, then DELETE+re-insert prompts before counting; running seed twice is safe. **(CC2)** Prototype `VerticalPackDetail`: "Customise prompts" button disabled — was active, navigating to `prompt-library-editor`; Sprint 5 F6 fix says read-only in v1. **(CC3)** Prototype `VerticalPackDetail`: "Action templates: 42" KPI card replaced with "Categories: 8" — action templates are Sprint 6 scope; `category` field exists in Sprint 5 schema. **(CC4)** §11: `expand-prompt.test.ts` test bodies now specified covering all 4 placeholders, `formatLocation` transform, `formatCompetitors` empty fallback, no-placeholder passthrough, empty locations edge case. **(CC5)** §5 schema: `uniqueIndex('vertical_packs_vertical_region_idx').on(table.vertical, table.region)` added — enforces one-pack-per-vertical-per-region business rule and serves as the ON CONFLICT target for seed idempotency.
- v1.4 (17 May 2026): **Second-pass audit — pack null guard, cost explosion cap, empty competitors, sidebar entry, prototype badge (CB1-CB5).** **(CB1)** §8: null guard added after `findFirst` — if no pack found for `brand.vertical + brand.region`, fails audit gracefully with `status='failed'` and `metadata.error` message instead of crashing with `TypeError`. **(CB2)** §8: location expansion cost cap — `limit(10)` caps template rows, not expanded prompts; 10 templates × 3 locations = 30 calls × 4 engines × 5 runs = 600 calls (3× budget). Fix: `allExpanded.slice(0, 10)` caps final prompt count regardless of expansion. **(CB3)** §7 `expandPrompt`: `formatCompetitors()` helper — `[].join(', ')` produces empty string; prompt "Compare with " confuses LLM. Fallback: `'other local providers'` when competitors array is empty; tests must cover this. **(CB4)** §10 step 5: Sprint 4 `layout.tsx` must be updated to add "Vertical packs" to Insights sidebar group — without this the acceptance criterion `[ ] /verticals accessible from sidebar` cannot pass. **(CB5)** Prototype `VerticalPackBrowser`: v1.1 packs show `status: 'beta'`; Sprint 4 wizard uses `"Coming v1.1"` — inconsistent. Fixed to `status: 'coming-v1.1'` with consistent badge.
- v1.3 (17 May 2026): **First-pass audit — PRD version, pack lookup join, location format, API auth, barrel exports, promptsCount update (CA1-CA6).** **(CA1)** §0: PRD v1.14 → v1.15. **(CA2)** §8 audit job: pack lookup updated — `brand.region` is a valid Foundations v1.12 column; load-audit step must explicitly SELECT it; added `isNull(verticalPacks.retiredAt)` for active-only pack selection. **(CA3)** §7 expandPrompt: `formatLocation()` helper added — `'NSW:Bondi'` must transform to `'Bondi, NSW'` before expanding `{location}` into prompts. **(CA4)** §6 API: auth pattern specified — `getCurrentUser()` + 401; no `setRlsContext` (global data). **(CA5)** §10 step 1: barrel exports for both tables + `VerticalPack`/`VerticalPackPrompt` inferred types. **(CA6)** §10 step 2: seed runner must update `promptsCount` after bulk-inserting rows.
- v1.2 (15 May 2026): **Fourth-pass audit F6.** §1 "vertical pack admin view (read-only)" clarified with explicit build instruction: the prototype `prompt-library-editor` screen shows a writable editor (New prompt button, edit menus) which is a **v1.1 future-state mockup** — Sprint 5 build must NOT implement it as writable. v1 shows a read-only view; New prompt button absent or disabled with v1.1 badge. CLAUDE.md §2 Out of scope confirms: "Custom prompt authoring by end users (vertical packs are curated)."
- v1.1 (12 May 2026): Conflict-resolution fix. Added optional `topic` field to `vertical_pack_prompts` schema for v1.2 topical sentiment segmentation (PRD §8 v1.2). Seed authors should populate `topic` while writing prompts; v1 audit code ignores it; v1.2 audit aggregates sentiment by topic cluster.
- v1.0 (12 May 2026): Initial. Net-new sprint prompt (not previously drafted).
