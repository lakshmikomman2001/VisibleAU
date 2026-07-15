# Claude Code — FIX (two SYSTEMIC trust-card bugs): badge reads confidence_label not score + invisible Refresh button

Manual testing found two bugs that span the trust SCORE CARDS (the hallucination card was fixed earlier; these siblings
weren't):

**Bug 1 — SCORE BADGE CONTAMINATION (systemic).** The High/Medium/Low badge on the score cards reads
`ExplainabilityService.annotate().confidence_label` — which is the confidence in the ANNOTATION, NOT a quality rating of
the score. Proof: the LinkedIn card shows **0/100 with a "High" badge** (0 = worst presence, badged High) — identical to
the original hallucination-card contamination. `confidence_label` ('High'|'Medium'|'Low', §69-70) describes the
rationale's confidence, not the score. So every card badging from it shows the wrong level regardless of the actual
score. The hallucination card was fixed (score-derived riskLevel); LinkedIn/consensus/entity/youtube still contaminated.

**Bug 2 — INVISIBLE REFRESH BUTTON (systemic, a11y/WCAG).** The "Refresh" button on the presence cards renders white
text on a white/near-white background — 1:1 contrast, unreadable. Likely a shared button component; affects every card
with a Refresh action. Contrast is a non-negotiable concern.

Env: Windows repo `C:\startup\VisibleAU\src\`. App runs on LOCAL PROD `visibleau_prod`; dev `visibleau`. Never real prod.

## Bug 1 — derive each score card's badge from its OWN score (not confidence_label)

### STEP 1 — Confirm the contamination + find every affected card
```bash
# The hallucination card's CORRECT pattern (the template to copy — score-derived level):
grep -n "riskLevel\|riskRationale\|0-33\|34-66\|67-100\|riskLevel =" app/api/brands/[brandId]/trust/route.ts components/domain/trust/*.tsx | head
# Where each score card gets its badge — is it reading confidence_label? (the bug)
grep -rn "confidence_label\|confidenceLabel\|badge\|High\|Medium\|Low\|level" components/domain/trust/linkedin-presence-scorecard.tsx components/domain/trust/*consensus* components/domain/trust/*entity* components/domain/trust/*youtube* | head -25
# The scores each card should derive FROM (all /100 or score_of_10 — confirmed integers, no Drizzle-string issue):
grep -rn "presence_score\|presenceScore\|consistency_score\|consistencyScore\|score_of_10\|scoreOf10" components/domain/trust/ app/api/brands/**/linkedin* app/api/brands/**/consensus* app/api/brands/**/entity* app/api/brands/**/youtube* | head
```
Report: which cards read confidence_label for their badge (the contaminated ones), and each card's actual score field.

### STEP 2 — Add a score-derived level per card (higher = better; opposite of risk)
These are QUALITY scores: higher is better. So the badge direction is INVERTED from the hallucination RISK card (where
lower = better). Bands (adapt if canon specifies per-card, else use even thirds):
- **0-33 → Low**, **34-66 → Medium**, **67-100 → High** — so 0 → Low, 45 → Medium, 85 → High.
- linkedin/youtube: derive from `presence_score` (/100).
- consensus: derive from `consistency_score` (/100).
- entity: derive from `score_of_10` — normalize to /100 (×10) or band on /10 (0-3.3 Low / 3.4-6.6 Med / 6.7-10 High).
Compute the level where the score is (route or component — match where riskLevel is computed for the hallucination card,
for consistency). Replace the badge's `confidence_label` source with this score-derived level:
```ts
// per card — the badge reflects the SCORE quality, not the annotation confidence:
function presenceLevel(score: number): 'Low'|'Medium'|'High' {
  if (score <= 33) return 'Low';
  if (score <= 66) return 'Medium';
  return 'High';
}
// badge = presenceLevel(presenceScore)   // NOT annotate().confidence_label
```
- Keep `confidence_label`/`confidence_note` in the API response (they're the platform contract, §0.4 — don't remove
  them); just STOP using confidence_label as the card's quality badge. The badge = score-derived level.
- Apply to all contaminated cards (linkedin, consensus, entity, youtube). If the hallucination card's riskLevel is a
  reusable helper, mirror it; otherwise a small per-card level function is fine.

### STEP 3 — Verify each card's badge matches its score (on screen)
- LinkedIn 0/100 → **Low** badge (was wrongly "High"). Re-seed presence 45 → **Medium**. A high score (85) → **High**.
- Consensus 67 → **Medium** (67 is mid). Entity score_of_10 (whatever's seeded) → the matching band.
- YouTube presence → matching band.
Report each card: badge now matches the score direction (0→Low, mid→Medium, high→High), no more "High" on a 0.

## Bug 2 — fix the invisible Refresh button (white-on-white)

### STEP 4 — Find the Refresh button + fix its contrast
```bash
grep -rn "Refresh\|refresh\|onRefresh\|handleRefresh" components/domain/trust/*.tsx | head
# The button's styling — what colours is it using? (text + background)
grep -rn "Refresh" components/domain/trust/linkedin-presence-scorecard.tsx components/domain/trust/*youtube* components/ui/button* | head
```
- Identify the button: is it a shared component or per-card? Report.
- Fix the contrast: the label must be readable on its background in BOTH themes. Likely the button uses a text colour
  (white) intended for a coloured/dark background but renders on a light surface, OR its own background isn't applying.
  Use the design-system button variant that guarantees contrast (match how other visible buttons on trust screens are
  styled — e.g. the working "View details" links / other action buttons). Do NOT hardcode a one-off colour; use the
  existing button variant that's readable.
- Check BOTH themes (the screenshots look like a light-ish/high-contrast theme — verify dark mode too; the bug may be
  theme-specific).

### STEP 5 — Verify the Refresh button is readable (on screen, both themes)
Reload a presence card → the "Refresh" label is clearly visible (readable contrast) in light AND dark theme. Report.

## STEP 6 — Report
- Bug 1: each score card's badge now derives from its own score (linkedin/consensus/entity/youtube); confidence_label
  still returned (contract) but no longer the badge source. 0/100 → Low confirmed on screen. List each card's before→after.
- Bug 2: Refresh button contrast fixed (which component, shared or per-card); readable in both themes.
- Confirm the hallucination card (already fixed) is unchanged, and its riskLevel pattern was the template.
- Full suite still green (these are UI/badge-source changes — run tests; add/adjust a card-badge test if one asserts the
  old confidence_label source).

## Constraints
- The badge reflects the SCORE (quality), not annotate().confidence_label (annotation confidence) — that's the bug. Keep
  confidence_label in the API response (platform contract §0.4); just don't use it as the quality badge.
- Quality scores: higher = better → 0 → Low (opposite of the risk card). Don't invert wrongly.
- Refresh contrast: use the design-system button variant that's readable in both themes; no one-off hardcoded colour.
- Verify BOTH on screen (badge matches score; Refresh readable), both themes. Local prod, never real prod.
- Match the hallucination card's riskLevel approach for consistency. LLD v8.70 / §0.4 win.

## NOTE
Two systemic trust-card bugs the manual pass caught (automated tests + the report-section check missed them — they live
only in the hub cards' badge derivation). Bug 1: the score cards badge from confidence_label (the annotation's
confidence, §69-70) instead of the actual score — proven by 0/100 showing "High", the same contamination the
hallucination card had. Fix: derive High/Med/Low from each card's own /100 score (higher=better: 0→Low, 45→Med, 85→High),
keeping confidence_label in the response as the platform contract but not as the badge. Generalize the hallucination
card's already-correct riskLevel pattern to linkedin/consensus/entity/youtube. Bug 2: the Refresh button is white-on-white
(WCAG fail) — use the readable design-system button variant, verify both themes. Confirm on screen: 0/100 → Low badge,
Refresh readable.
