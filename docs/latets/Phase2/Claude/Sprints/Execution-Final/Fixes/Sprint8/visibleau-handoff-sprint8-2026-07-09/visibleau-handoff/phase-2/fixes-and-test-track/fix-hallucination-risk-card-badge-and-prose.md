# Claude Code — FIX the Hallucination Risk card: "0/100" shows "High" badge + prose says "trust score 60/100" (2-3 bugs on one card)

The trust hub loads (migrations applied ✓), but the Hallucination Risk card is WRONG on screen:
- Big number: **0/100** — likely CORRECT (risk = LEAST(100, 15×open_critical + 5×open_warning + 1×open_info); no open
  incidents → 0; §0.5/LLD 6793, "lower is better, 0 = safe").
- Badge: **"High"** — WRONG. A risk of 0 is the SAFEST value; the badge must be Low/safe, never High. Inverted or
  miscomputed threshold.
- Prose: **"Metropolitan Plumbing's trust score of 60/100 shows moderate performance"** — WRONG SCORE on this card. This
  is the trust-scorer AGGREGATE (different metric), bleeding into the Hallucination RISK card. The risk card should
  describe the RISK (0 = safe), not the trust aggregate.

Env: Windows repo `C:\startup\VisibleAU\src\`. Dev DB `visibleau` + local prod `visibleau_prod` (app runs on prod).
Brand 418f321f-... (Metropolitan). Card component: `trust-score-card.tsx` (§6U.2).

## STEP 1 — Read the card + the two score sources
```bash
find . -name "trust-score-card.tsx" | head; sed -n '1,120p' components/domain/trust/trust-score-card.tsx
# The read-time risk formula (should be 0 for no open incidents):
sed -n '1,80p' lib/trust/hallucination-risk.ts
# The trust-scorer aggregate (the 60/100 in the prose — a DIFFERENT score):
sed -n '1,60p' lib/trust/trust-scorer.ts
# What the card is passed + how the badge is derived:
grep -n "badge\|High\|Medium\|Low\|risk\|score\|threshold\|trustScore\|60\|/100" components/domain/trust/trust-score-card.tsx
```
Report: (a) is the 0/100 the risk formula output (correct for 0 open incidents)? (b) how is the badge (High/Medium/Low)
computed — from which value, what thresholds? (c) where does the "trust score of 60/100" prose come from — the
trust-scorer, and why is it on the risk card?

## STEP 2 — FIX 1: the badge must match "0 = safe" (inverted/miswired threshold)
The badge reflects RISK: **lower risk = safer = Low badge**. Confirm the threshold direction against the score's meaning:
- risk 0 → **Low** (safe). Higher risk → Medium → High. (e.g. per the risk /100: 0–33 Low, 34–66 Medium, 67–100 High —
  ADAPT to the spec's actual bands if defined; the key invariant: **0 must NOT be High**.)
- If the badge is currently derived from the TRUST score (60 → "High"?) or uses inverted thresholds (treating high-as-
  safe), fix it to derive from the RISK value with the correct direction.
- Check for the Drizzle-string angle too: if the risk value arrives as a STRING and a threshold compares it wrong
  (string vs number comparison), coerce with Number() first. Confirm the risk is a real number, not a mis-parsed string.
Assert: risk 0 → Low badge; a high risk → High badge.

## STEP 3 — FIX 2: the prose must describe the RISK, not the trust aggregate
The Hallucination Risk card's narrative should talk about hallucination risk (0 = safe / no open incidents), NOT
"trust score of 60/100". Two possibilities — pick per the card's intent (§6U.2):
- If the card is PURELY the hallucination-risk card → the prose should say something like "No open hallucination
  incidents — risk is 0/100 (safe)" derived from the risk value, not the trust-scorer. Remove/replace the 60/100 trust
  copy.
- If the card is MEANT to show the overall trust score (60/100) AND the hallucination risk (0/100) as two distinct
  metrics → then label them distinctly: the big number + "lower is better" is the RISK (0), and the trust aggregate (60)
  must be clearly a SEPARATE labeled metric, not conflated into one sentence that reads as if 0 and 60 are the same
  score. Do NOT let one card imply the score is both 0 and 60.
Determine which the spec intends (§6U.2 "Hallucination Risk card") and make the copy consistent with the number shown.
Most likely: it's the RISK card, and the trust-scorer prose was wired in by mistake → the narrative should reflect the
risk (0 = safe), and the 60/100 trust score belongs elsewhere (or as an explicitly separate metric).

## STEP 4 — Verify on screen (real data, local prod)
Reload `/brands/418f321f.../trust`:
- Hallucination Risk **0/100** with a **Low** (safe) badge — NOT High. (0 open incidents = safe.)
- The narrative describes the risk correctly (safe / no open incidents), not a contradictory "60/100" that clashes with
  the 0 shown.
- (Sanity) if you can seed an open critical incident, the risk rises (e.g. 15) and the badge moves toward Medium/High —
  proving the badge tracks the risk direction. Optional but confirms the fix.
Report: the badge now reads Low for risk 0, and the prose is consistent with the number.

## STEP 5 — Report
- Was 0/100 correct (0 open incidents)? (Confirm the formula, not a coercion artifact.)
- FIX 1: the badge derivation (which value + thresholds); now 0 → Low.
- FIX 2: the prose source; now describes risk, not the conflated 60/100 trust score.
- Screen confirmation: 0/100 + Low badge + consistent copy.
- Whether the risk value needed Number() coercion (Drizzle-string check).

## Constraints
- 0/100 is likely CORRECT (no open incidents) — do NOT "fix" the number; fix the BADGE and the PROSE that contradict it.
- The badge reflects RISK direction: 0 = Low/safe, high = High. Never 0 = High.
- Keep the read-time derivation (no risk column — §0.5). Coerce Drizzle NUMERIC with Number() if the risk/trust values
  are strings.
- subscriptions.tier, not organizations.tier (unchanged invariant).
- LLD v8.70 / §6U.2 win. Verify on screen (local prod), not by grep.

## NOTE
The number 0/100 is right (risk formula, no open incidents = safe). The bugs are: (1) the "High" badge on a 0-risk score
— inverted/miswired threshold; a 0 (safest) must render Low, so fix the badge to derive from the RISK value in the
correct direction (and Number()-coerce if it's a Drizzle string being compared as text). (2) the prose "trust score of
60/100" is the trust-scorer aggregate bleeding into the hallucination-RISK card — the copy must describe the risk (0 =
safe), with the trust aggregate either removed or shown as an explicitly separate metric, never conflated so the card
implies the score is both 0 and 60. Verify on screen: 0/100 → Low badge, consistent copy.
