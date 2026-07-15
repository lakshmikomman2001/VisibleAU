# Claude Code — FIX (minor): Mention Source Breakdown duplicates the executive summary verbatim

## The bug (visible in the rendered PDF, 3rd sighting)
Both sections render the IDENTICAL line:
> "Brand archetype: niche authority. Mention rate: 10.0%, citation rate: 10.0%."
— once in the executive summary, once in the **Mention Source Breakdown** section. The
`mention_source_summary` builder is emitting the same archetype/rates string as the exec summary instead of the
section's actual analytical content. On a client-facing "Professional Report" this reads as a copy-paste error.

## What the Mention Source Breakdown SHOULD contain (verified against canon)
This is the **Mention-Source Divide** section (GAP 9; LLD 646/838), backed by `visibility_trends.brand_archetype` +
`mention_source_ratio`, and it is a **4-quadrant mention × citation analysis** (LLD 2785/3482) — NOT a repeat of the
rate line. Each archetype quadrant carries a DISTINCT strategic implication (LLD 6129-6134):
- `recognised_authority` (high mention + high citation) → dominant across AI answers
- `known_but_untrusted`  (high mention + low citation)  → **fix content structure** (mentioned but not cited/trusted)
- `niche_authority`      (low mention + high citation)  → **expand prompt coverage** (cited when found, but low reach)
- `invisible`            (low mention + low citation)   → **full GEO strategy**
Plus the `mention_source_ratio` = citationRate / mentionRate (U-12; NULL when mention=0 → display **'N/A'**), which
expresses "when mentioned, how often also cited."

So for Metropolitan (`niche_authority`, mention 10% / citation 10%, ratio = 10/10 = 1.0) the section should say something
like: "Metropolitan Plumbing sits in the **niche authority** quadrant — when AI engines mention it they also cite it
(mention-to-citation ratio 1.0), but overall mention volume is low. Priority: **expand prompt coverage** to widen the
range of queries where the brand surfaces." — i.e. the QUADRANT interpretation + its action, distinct from the exec
summary's headline rates.

Env: local PROD DB, real LLMs. Fix in the `mention_source_summary` builder (`lib/communication/narrative-generator.ts`)
and/or the PDF render for that section (`render-report-pdf.ts`).

## STEP 1 — Find where each section's text is built
```bash
grep -n "mention_source\|mentionSource\|executive_summary\|executiveSummary\|archetype\|Mention rate\|mention_source_ratio\|mentionSourceRatio\|Mention Source" lib/communication/narrative-generator.ts | head
sed -n '/mentionSourceSummary\|mention_source_summary/,+15p' lib/communication/narrative-generator.ts | head -40
```
Report: how is `mention_source_summary` (or the mentionSourceSummary object) currently built? Confirm it's emitting the
same archetype+rates string as the executive summary (the duplication) rather than a quadrant interpretation.

## STEP 2 — Build DISTINCT content for the Mention-Source Divide section
Replace the duplicated string with quadrant-based analysis derived from `brand_archetype` + `mention_source_ratio`:
```ts
// Map each archetype to its quadrant meaning + strategic action (canon LLD 6129-6134):
const QUADRANT: Record<string, { label: string; meaning: string; action: string }> = {
  recognised_authority: { label: 'recognised authority', meaning: 'AI engines both mention and cite the brand', action: 'maintain and defend the position' },
  known_but_untrusted:  { label: 'known but untrusted',  meaning: 'the brand is mentioned but rarely cited as a source', action: 'fix content structure so AI engines trust and cite it' },
  niche_authority:      { label: 'niche authority',      meaning: 'the brand is cited when it appears, but mention volume is low', action: 'expand prompt coverage to surface in more queries' },
  invisible:            { label: 'invisible',            meaning: 'the brand is neither mentioned nor cited', action: 'a full GEO strategy to establish presence' },
};
const q = QUADRANT[archetype] ?? QUADRANT.invisible;
const ratioText = mentionSourceRatio == null ? 'N/A (brand not mentioned)' : mentionSourceRatio.toFixed(2);
const mentionSourceSummary =
  `${brandName} sits in the ${q.label} quadrant — ${q.meaning}. ` +
  `Mention-to-citation ratio: ${ratioText}. Priority: ${q.action}.`;
```
- Use the SAME `Number()`-coerced values (mention_source_ratio may be a Drizzle string too — coerce, and honour NULL→
  'N/A' per U-12).
- The executive summary keeps its headline (visibility movement + archetype + rates); the Mention-Source section now
  adds the quadrant interpretation + ratio + action. They no longer match.
- If the section legitimately restates the archetype name, that's fine — but it must add the quadrant meaning + action,
  not be a byte-identical copy of the exec line.

## STEP 3 — VERIFY (regenerate, open the PDF)
```bash
psql "$DATABASE_URL" -c "SELECT executive_summary, mention_source_summary FROM generated_reports WHERE brand_id=(SELECT id FROM brands WHERE domain='metropolitanplumbing.com.au') ORDER BY created_at DESC LIMIT 1;"
```
- `executive_summary` and `mention_source_summary` are now DIFFERENT strings.
- OPEN the new PDF: the Mention Source Breakdown section describes the quadrant/action (e.g. "niche authority quadrant …
  expand prompt coverage"), NOT the same rate line as the top.
Report both strings + what the PDF section shows.

## Constraints
- Keep values `Number()`-coerced; honour mention_source_ratio NULL→'N/A' (U-12).
- Don't change the executive summary — only make the Mention-Source section distinct.
- Cosmetic/content fix — no schema change, no status column, don't touch other sections.
- Coerce archetype safely (default to 'invisible' quadrant if unexpected).

## NOTE
The Mention Source Breakdown is the Mention-Source Divide (GAP 9) — a 4-quadrant mention×citation analysis backed by
brand_archetype + mention_source_ratio, with a per-quadrant strategic action. It was emitting the exec summary's rate
line verbatim instead. Give it the quadrant interpretation (Metropolitan = niche_authority → "cited when found, low
reach → expand prompt coverage") + the ratio (N/A when mention=0). Verify the two summaries differ in the DB AND that
the PDF section reads as distinct analysis.
