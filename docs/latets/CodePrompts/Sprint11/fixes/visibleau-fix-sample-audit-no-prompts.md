# VisibleAU — FIX PROMPT: Sample audit fails with "No prompts available." (empty primaryRegions)

**Phase/Sprint:** Phase 1, Sprint 10 (sample-audit) × Sprint 5 (prompt expansion). **Severity: HIGH —
launch blocker.** The public "free sample audit" (the landing page's primary conversion path) fails
immediately at 0% for every visitor.

---

## ROOT CAUSE (confirmed by investigation — do not re-diagnose)

`runSampleAudit()` in `lib/sample-audit/run.ts` creates the sample brand with **no `primaryRegions`**
(defaults to `[]`). It then fires `runAuditInline(auditId)`, which calls `getAuditPrompts()`. For the
tradies/au pack, the top-ranked prompts are `{location}`-templated, and `expandPrompt()`
(`lib/verticals/expand-prompt.ts`) returns `[]` for any `{location}` prompt when `locations` is empty.
So every prompt expands to nothing → the prompt list is empty → the explicit guard in
`lib/audit/run-audit-inline.ts` (`prompts.length === 0`) sets `status:"failed"`,
`metadata.error:"No prompts available."`, and returns before any LLM call (0 citations written).

Evidence: both failed audits show `status:"failed"`, `organization_id` = sample org, `metadata.error:
"No prompts available."`, 0 citations. `organizations.slug` exists and the sample org exists — so this
is NOT the migration/slug hypothesis. It is purely the empty-regions → empty-prompt-expansion chain.

## THE FIX — give the sample brand a valid default `primaryRegions`

The sample brand needs location data so `{location}` prompts expand. The fix is to set a sensible AU
default on the brand insert in `lib/sample-audit/run.ts`.

### ⚠️ CRITICAL — the default MUST use the canonical `STATE:Suburb` format
The investigation suggested `["AU:Sydney", "AU:Melbourne", "AU:Brisbane"]` — **that is INVALID and must
NOT be used.** `primaryRegions` is `STATE:Suburb`, where STATE is one of the 8 AU states
(NSW/VIC/QLD/WA/SA/TAS/ACT/NT), validated by the Zod regex
`/^[A-Z]{2,4}:[A-Za-z][A-Za-z\s]{0,49}$/` (Sprint 1 §6, W4 fix; Foundations §3). `"AU"` is the **country**
`regionEnum`, not a state — `"AU:Sydney"` fails the regex. Use the state-prefixed form:

```ts
const SAMPLE_PRIMARY_REGIONS = ['NSW:Sydney', 'VIC:Melbourne', 'QLD:Brisbane'];
```

(These render correctly: `formatLocation('NSW:Sydney')` → `'Sydney, NSW'`, so the prompt reads "Who are
the best plumbers in Sydney, NSW?" — grammatical, per the CA3 fix in `expand-prompt.ts`.)

### STEP 0 — INVESTIGATE FIRST (confirm the insert site + shape before editing)
```bash
# 1. Find the brand insert in runSampleAudit — confirm it omits primaryRegions and see the exact object:
grep -nE "insert\(brands\)|\.values\(|primaryRegions|vertical|region|domain" lib/sample-audit/run.ts
#    Confirm: the brands insert has no primaryRegions key (defaults to []), and note what IS set
#    (name, domain, vertical, region, organizationId). Match that object's style when adding the field.

# 2. Confirm the column name + type so the default fits (text[] STATE:Suburb):
grep -nE "primaryRegions|primary_regions" db/schema/*.ts
#    Expect: primaryRegions: text('primary_regions').array().default([]).notNull()

# 3. Sanity — confirm the tradies/au top-ranked prompts really are {location}-templated (why [] breaks it):
#    (optional, just to see the failing data)
psql "$DATABASE_URL" -c "SELECT rank, left(prompt_template, 60) FROM vertical_pack_prompts vpp JOIN vertical_packs vp ON vp.id = vpp.pack_id WHERE vp.vertical='tradies' ORDER BY rank LIMIT 10;"
```

### THE EDIT — `lib/sample-audit/run.ts`
Add `primaryRegions` to the sample brand insert. Concretely:

1. Define the constant near the top of the file (or inline if the file's style prefers it):
   ```ts
   // Sample brand needs locations so {location}-templated vertical prompts expand (CA3/Sprint 5).
   // MUST be STATE:Suburb format (8 AU states), not 'AU:' (that's the country regionEnum). W4 regex.
   const SAMPLE_PRIMARY_REGIONS = ['NSW:Sydney', 'VIC:Melbourne', 'QLD:Brisbane'];
   ```
2. Add it to the `brands` insert `.values({ ... })` object, alongside the existing fields:
   ```ts
   primaryRegions: SAMPLE_PRIMARY_REGIONS,
   ```
   Do not change any other field on the insert (name/domain/vertical/region/organizationId stay as-is).

---

## CONSTRAINTS
- **Format is non-negotiable:** `STATE:Suburb`, STATE ∈ {NSW,VIC,QLD,WA,SA,TAS,ACT,NT}. Never `AU:`. The
  values must satisfy `/^[A-Z]{2,4}:[A-Za-z][A-Za-z\s]{0,49}$/`.
- **`region` (the country enum) stays `'au'`** and is unchanged — `region` and `primaryRegions` are
  different fields. Don't touch `region`.
- **Do not change `expandPrompt()`, `getAuditPrompts()`, or `run-audit-inline.ts`.** The `"No prompts
  available."` guard is correct and should stay — it's a legitimate safety net. The bug is upstream (empty
  brand regions), and that's the only thing to fix. (Changing the guard to "proceed with zero prompts"
  would be wrong — it would let a genuinely misconfigured audit run empty.)
- **Cap unchanged:** the sample audit stays 1 engine (ChatGPT) × 5 prompts × 1 run. Adding regions makes
  the existing prompts expand; it must NOT increase the engine count or prompt cap. (If `getAuditPrompts`
  for the sample path takes top-N prompts, confirm N is still bounded to the sample's 5-prompt cap after
  expansion — don't let multi-location expansion balloon the prompt count beyond the cap. If expansion
  multiplies prompts × locations, the sample path must still slice to its 5-prompt / single-engine budget.)
- **No schema change**, no migration, no new table. One field added to one insert.
- **`audits.status` is `'complete'`** (no -d); failure state `'failed'`. Don't conflate with
  `workflow_runs`/Stripe event names.

---

## VERIFICATION (must pass)
```bash
# 1. The default is present and in the CORRECT format (state-prefixed, not AU:):
grep -nE "SAMPLE_PRIMARY_REGIONS|primaryRegions" lib/sample-audit/run.ts
grep -E "NSW:|VIC:|QLD:|WA:|SA:|TAS:|ACT:|NT:" lib/sample-audit/run.ts   # → matches (state-prefixed)
grep -E "AU:" lib/sample-audit/run.ts                                     # → NO matches (AU: is invalid)

# 2. The values pass the canonical Zod regex (quick node check):
node -e "const re=/^[A-Z]{2,4}:[A-Za-z][A-Za-z\s]{0,49}$/; ['NSW:Sydney','VIC:Melbourne','QLD:Brisbane'].forEach(r=>console.log(r, re.test(r)));"
#    → all three print 'true'

# 3. expandPrompt/run-audit-inline were NOT modified:
git diff --stat lib/verticals/expand-prompt.ts lib/audit/run-audit-inline.ts   # → empty (untouched)
```

### Manual test (the real proof — re-run the exact failing scenario)
1. `START-DEV.bat` running. **Incognito** window → `localhost:3000`.
2. Click **"Try a free sample audit"** → enter a domain (e.g. a tradie site) + vertical → land on
   `/sample-audit/running?auditId=...`.
3. **It must now progress past 0%** and reach **100%**, then show the sample result (no login). The status
   poll returns `200` with advancing progress, never `metadata.error: "No prompts available."`.
4. **DB confirm:** after it completes, the audit row is `status='complete'` and there are **>0 citations**
   for that `auditId` (proves prompts expanded and the mock LLM ran):
   ```bash
   psql "$DATABASE_URL" -c "SELECT a.status, COUNT(c.*) AS citations FROM audits a LEFT JOIN citations c ON c.audit_id=a.id WHERE a.id='<new-auditId>' GROUP BY a.status;"
   ```
5. **Cap confirm (guard against expansion ballooning):** the completed sample audit used **ChatGPT only**
   and stayed within the 5-prompt budget — confirm no Claude/Gemini/Perplexity rows and the prompt count
   wasn't multiplied by the 3 default regions beyond the cap:
   ```bash
   psql "$DATABASE_URL" -c "SELECT engine, COUNT(*) FROM citations c JOIN audits a ON a.id=c.audit_id WHERE a.id='<new-auditId>' GROUP BY engine;"
   ```
   → expect a single engine (chatgpt). If you see the prompt/call count blown out by ×3 locations, the
   sample path needs to slice to its cap AFTER expansion (flag back to Sri — that's a cap-enforcement
   follow-up, not part of this one-line default).

---

## NOTE FOR THE REVIEWER (not for Claude Code)
This is the Sprint 10 × Sprint 5 seam: the sample flow (S10) created a brand without regions, and the
prompt engine (S5) correctly refuses to expand `{location}` prompts without locations. S1–S10 tests
missed it because (a) the E2E sample test was scoped to "CTA href only" (IJ2), and (b) other audit tests
seed brands WITH primaryRegions, so the empty-regions path was never exercised. Two possible follow-ups
to consider: (1) a unit test asserting `runSampleAudit` produces a brand whose prompts expand to ≥1 (and
≤ the 5-prompt cap); (2) decide whether a real user's brand with empty primaryRegions should also get a
fallback, or whether the brand wizard already forces at least one region (if it does, only the sample
path — which bypasses the wizard — needed this fix; worth confirming the wizard's required-field rule).
