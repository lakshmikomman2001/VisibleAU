# Citation Failure Diagnosis — Component & Engine Spec

**Feature:** The differentiated insight surface — *"Why isn't this brand being cited in AI search?"*
**Status:** Build foundation. Converts the approved prototype into a typed, production component package.
**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind · Drizzle/PostgreSQL · Inngest
**Files in this package:**
- `visibleau-citation-diagnosis-spec.md` — this document (authoritative)
- `diagnosis.types.ts` — the data contract between engine and UI
- `diagnosisEngine.ts` — server-side detector logic (the product IP)
- `CitationFailureDiagnosis.tsx` — the typed React component set

---

## 1. Why this is the foundation, not just a screen

In a market where Profound, AthenaHQ, Peec, and Otterly all converge on the same data (prompts, citations, mentions, share of voice), the defensible question is *why* — and nobody answers it well. This surface is the moat. The design exists to make a genuinely useful diagnosis feel like premium intelligence, so an agency screenshots it and puts it in front of their client.

Two principles are encoded in the contract below and must not be dropped in implementation:

1. **No diagnosis without evidence.** Every diagnosis carries the actual data that proves it (word counts, name variants, the specific sources citing a competitor). Generic advice is the failure mode we are explicitly avoiding.
2. **Honest projections.** Every impact figure is labelled a *projection* with its own confidence. We never present an estimated Share-of-Voice gain as a guarantee. This protects the agency's credibility with their client and ours with the agency.

---

## 2. Design tokens

Add to `tailwind.config.ts` under `theme.extend.colors` so the palette is available as utilities (`bg-brand`, `text-risk`, `bg-risk-wash`, etc.). These are the exact values from the approved prototype — warm, editorial, deliberately not a cold analytics palette.

```ts
// tailwind.config.ts → theme.extend
colors: {
  paper:      '#F4F0E6',   // app background (warm ivory)
  surface:    '#FCFAF4',   // card background (warm white)
  ink:        '#14171C',   // primary text (warm near-black)
  'ink-soft': '#63665F',   // secondary text
  'ink-faint':'#9A9C92',   // tertiary / labels
  hair:       '#E6E0D0',   // borders
  'hair-soft':'#EFE9DA',
  brand:      '#0C5D55',   // deep eucalyptus teal — also = strong/healthy
  'brand-bright':'#0F7A6F',
  'brand-wash':'#E2EFEC',
  watch:      '#B07A1E',   // ochre — medium severity
  'watch-wash':'#F4EAD5',
  risk:       '#B24A38',   // terracotta — high severity
  'risk-wash':'#F4E1DB',
  'evidence-bg':'#13171C', // dark evidence block
},
fontFamily: {
  serif: ['Fraunces','serif'],          // numbers, headlines
  sans:  ['Hanken Grotesk','sans-serif'],// UI/body
  mono:  ['JetBrains Mono','monospace'], // evidence snippets
},
boxShadow: {
  card: '0 1px 2px rgba(20,23,28,.04), 0 8px 24px rgba(20,23,28,.05)',
  lift: '0 2px 4px rgba(20,23,28,.06), 0 16px 40px rgba(20,23,28,.09)',
},
```

Severity → token map (used by both engine output and UI):

| Severity | Icon tile | Pill | Accent |
|---|---|---|---|
| `high` | `bg-risk-wash text-risk` | `bg-risk-wash text-risk` | terracotta |
| `medium` | `bg-watch-wash text-watch` | `bg-watch-wash text-watch` | ochre |
| `low` | `bg-brand-wash text-brand` | `bg-brand-wash text-brand` | teal |

---

## 3. Data contract (`diagnosis.types.ts`)

The contract is the load-bearing artifact — it is the boundary between the server-side engine and the client component, and it resolves the earlier gap where `SignalResult` was never formally defined. Full types are in `diagnosis.types.ts`; the shape an agency sees per diagnosis:

```ts
interface CitationDiagnosis {
  id: string;
  patternKey: DiagnosisPatternKey;     // 'thin_content' | 'nap_inconsistency' | ...
  title: string;                       // "Thin service content"
  explanation: string;                 // plain-English, client-safe
  severity: Severity;                  // 'high' | 'medium' | 'low'
  evidence: DiagnosisEvidence;         // the proof — never empty
  fix: DiagnosisFix;                   // specific action, not generic advice
  projectedSovLift: ProjectedImpact;   // { points: number; confidence: Confidence }
  detectorConfidence: Confidence;      // how sure we are this pattern applies
}
```

Critically, `evidence` is **required** — the type system forbids a diagnosis without proof. A detector that cannot assemble evidence must return `null` (no diagnosis) rather than a diagnosis with empty evidence.

---

## 4. The diagnosis engine (`diagnosisEngine.ts`)

The engine is a **registry of pure detector functions**. Each detector takes the same aggregated input and returns a `CitationDiagnosis` or `null`. This mirrors the SignalsEngine adapter pattern already in the codebase — adding a new diagnosis is adding one function, never touching the others.

```ts
type Detector = (input: DiagnosisInput) => CitationDiagnosis | null;
```

### 4.1 Detector input

`DiagnosisInput` aggregates everything a detector might need, assembled once per audit:

- `brand` — name, website, marketCode, vertical
- `signals` — `SignalResult[]` from the SignalsEngine (directory presence, the brand name as listed on each directory → drives NAP detection)
- `citations` — `CitationRecord[]` (which source cited whom, per provider)
- `content` — `PageContentMetric[]` (word count, FAQ/schema presence per key page; fetched server-side)
- `competitors` — `CompetitorSnapshot[]` (each competitor's citation sources, review counts, SoV)
- `providers` — `ProviderVisibility[]` (per-engine visibility %, whether the engine is citation-led)

### 4.2 The six launch detectors

Each is market-aware: it reads `brand.marketCode` and uses the market's directory/review set rather than hardcoding AU or US sources. This is what keeps the feature multi-region by default.

| Pattern key | Fires when | Evidence assembled | Fix | Impact model |
|---|---|---|---|---|
| `thin_content` | A key service page word count is below `THIN_WORD_THRESHOLD` (default 600) **and** ≥1 cited competitor has a rich page | Page-by-page word count + schema comparison vs cited competitors | Expand to target length + add FAQ schema | `min(12, contentGap × CONTENT_WEIGHT)` |
| `nap_inconsistency` | Brand name appears in ≥2 distinct normalized forms across `signals[].listedName` | The distinct name variants and where each appears | Standardise NAP across listings | `nameVariants ≥ 3 ? 6 : 4` |
| `competitor_authority` | A competitor is cited from ≥1 authority source where the brand is absent | The source list citing the competitor, brand marked absent | Claim those listings | `absentAuthoritySources × AUTHORITY_WEIGHT` |
| `provider_gap` | One provider's visibility is `< PROVIDER_GAP_FLOOR` (default 20%) **and** that provider is citation-led | The full provider split + the citation-led flag | Tied to the authority-source fix | derived, capped at 5 |
| `missing_schema` | No structured data detected on key pages **and** cited competitors use it | Which schema types competitors use that the brand lacks | Add Organization + FAQ + LocalBusiness schema | flat 3 |
| `review_deficit` | Brand review count on the market's primary review platform is `< 25%` of the cited competitor median | Review counts: brand vs cited competitors | Review-generation programme | `gap normalized × REVIEW_WEIGHT`, cap 5 |

### 4.3 Severity and confidence

- **Severity** is computed from the magnitude of the gap, not hardcoded: `high` when the projected lift ≥ 7 points, `medium` for 3–6, `low` below 3.
- **`detectorConfidence`** reflects data completeness: `high` only when the detector had complete inputs (e.g. it actually fetched the competitor pages); `low` when it inferred from partial data. The UI surfaces this so the agency knows which diagnoses are presentation-ready.
- The container computes an **overall projected SoV** by summing diagnosis lifts, capped so the total never claims the brand passes 100% or overtakes by an implausible margin. The cap is honest-by-design.

### 4.4 Ordering

Diagnoses are returned sorted by `projectedSovLift.points` descending — the agency sees the highest-impact fix first, which is the order they will action and the order they will present.

---

## 5. Component API (`CitationFailureDiagnosis.tsx`)

```tsx
<CitationFailureDiagnosis
  brandName="Harbourside Dental"
  diagnoses={diagnoses}            // CitationDiagnosis[] from the engine
  overallProjection={projection}   // { currentSov, projectedSov, leaderSov, leaderName }
  state="ready"                    // 'loading' | 'ready' | 'empty' | 'error'
  lowConfidence={false}            // surfaces the "run a deeper audit" banner
/>
```

Component tree:

- **`CitationFailureDiagnosis`** — container. Header (the *"Why isn't X being cited?"* title + the "Citation Failure Diagnosis" pill), the diagnosis list, the closing projection callout.
  - **`DiagnosisCard`** — one per diagnosis. Icon tile (severity-colored), title, explanation, severity pill, `EvidenceBlock`, fix row with projected-impact chip. Evidence is collapsible on mobile (expanded by default on desktop).
    - **`EvidenceBlock`** — the dark monospace proof panel. Renders `evidence.rows` with highlight roles (`positive` → teal, `comparison` → amber, `absent` → muted red).
  - **`ProjectionCallout`** — the closing line ("Fix all three and projected SoV moves from 22% → ~42%, past the leader").

### 5.1 States

| State | Render |
|---|---|
| `loading` | Three skeleton cards (shimmer using `animate-pulse`), header visible |
| `ready` | Full diagnosis list |
| `empty` | Positive empty state — *"No critical citation gaps found. {brand} is well-positioned across the sources AI engines trust."* This is a **good** outcome, styled in brand teal, never as an error |
| `error` | Quiet inline message + retry; never blocks the rest of the client page |

The **low-confidence banner** is orthogonal to state: when `lowConfidence` is true (overall sample small or detectors mostly inferred), a calm amber band reads *"This diagnosis is based on limited data — run a deeper audit before presenting to the client."* This is the honest-numbers principle, and it lets the agency decide what reaches their client.

### 5.2 Accessibility & responsive

- Each `DiagnosisCard` is an `<article>` with the title as an `<h3>`; the container heading is an `<h2>`. Screen-reader order = visual order = impact order.
- Severity is never communicated by color alone — the severity pill carries the text label ("High impact").
- Evidence collapse on mobile is a real `<button aria-expanded>`; keyboard operable.
- Impact chips include an `aria-label` spelling out "projected Share of Voice lift, N points".
- Below `768px`: single column, evidence collapsed by default, the three-column card body reflows to stacked.

---

## 6. Integration with VisibleAU

```
audit run (Inngest)
  └─ collect SignalResult[]  (SignalsEngine — existing)
  └─ collect CitationRecord[] (Citation Intelligence — Phase 4 S26)
  └─ fetch PageContentMetric[] (content fetch — new, server-side, cached)
  └─ load CompetitorSnapshot[] (competitor set — Phase 4 S29)
        ▼
  runDiagnosisEngine(input): CitationDiagnosis[]   ← diagnosisEngine.ts
        ▼
  persist to citation_diagnoses (Drizzle)          ← keyed by audit_id + market_code
        ▼
  GET /api/audits/[id]/diagnosis  →  CitationDiagnosis[]
        ▼
  <CitationFailureDiagnosis />  on the client detail page
```

**New Drizzle table** (follow the global-read RLS pattern, not org-scoped, only if the row references the org's own audit — diagnoses are org data so they ARE org-scoped via audit_id):

```sql
CREATE TABLE citation_diagnoses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id        UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  market_code     TEXT NOT NULL,
  pattern_key     TEXT NOT NULL,
  severity        TEXT NOT NULL,
  title           TEXT NOT NULL,
  explanation     TEXT NOT NULL,
  evidence        JSONB NOT NULL,
  fix             JSONB NOT NULL,
  projected_lift  NUMERIC(4,1) NOT NULL,
  lift_confidence TEXT NOT NULL,
  detector_confidence TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

**Threshold constants** live in one config object (`DIAGNOSIS_THRESHOLDS`) at the top of `diagnosisEngine.ts` so they can be tuned per market later without touching detector logic — and so they can eventually move into a registry table the same way Phase 3 moved market config out of code.

---

## 7. Build order for Claude Code

1. Land `diagnosis.types.ts` first — it is the contract everything else imports.
2. Build `diagnosisEngine.ts` with the six detectors; unit-test each detector against a fixture brand (one fixture that triggers all six, one clean fixture that triggers none → exercises the empty state).
3. Build `CitationFailureDiagnosis.tsx` against mock `CitationDiagnosis[]` (the prototype data is the fixture).
4. Wire the Inngest collection + `citation_diagnoses` persistence + API route.
5. Place on the client detail page beneath the Share-of-Voice panel, exactly as in the prototype.

The definition of done: a real audit of a real brand produces evidence-backed diagnoses with honest projections, the empty state reads as a positive result, and the low-confidence banner appears when data is thin.
