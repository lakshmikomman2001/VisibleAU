# VisibleAU — Diagnose Marrickville Dental Studio's 13.8 score (Smart Prompt Pack check) — Claude Code
# Symptom: "Marrickville Dental Studio" scores 13.8 on the dashboard — the same signature as the
#   Canva-34.4 bug the Smart Prompt Pack was built to fix (a brand getting generic/mismatched prompts
#   so it barely appears). Bondi Plumbing scores 88.3, so the PIPELINE is fine — this is specific to
#   Marrickville. Two hypotheses to distinguish:
#     (A) Marrickville is a PRE-FIX brand — 13.8 is stale, from the old generic-prompt path. Re-audit
#         should pull it up to a believable dental score. (NOT a bug — confirms the fix matters.)
#     (B) The Smart Prompt Pack isn't engaging for Marrickville — a LIVE bug; re-audit stays ~13.8.
# This prompt does a FREE check first (Step 1), then a paid re-audit only if needed (Step 3, ~$0.84).
# Run in PROD mode (visibleau_prod + LLM_MODE=real). Diagnose — don't "fix" anything in Step 1/2.

═══════════════════════════════════════════════════════════════════════════════
STEP 1 — FREE diagnosis: inspect Marrickville's classification state (no spend)
═══════════════════════════════════════════════════════════════════════════════

> Query the brand and report (no changes):
> ```sql
> SELECT name, domain, vertical, created_at,
>        classification_status, classification, prompt_pack, prompt_pack_version
> FROM brands WHERE name = 'Marrickville Dental Studio';
> ```
> Interpret:
> - **created_at** — was this brand created BEFORE the Smart Prompt Pack fix landed? (Compare to when
>   the 5 classification columns were added / the feature shipped.) An old created_at + the raw region
>   slug "au · nsw:sydney:marrickville" (vs Bondi's clean "NSW · Bondi") both suggest a pre-fix brand.
> - **classification_status:**
>   - `complete` with a dental-appropriate `classification` (category ≈ 'dental'/'dentist'/'healthcare',
>     buyerType 'consumer'/'patient', dental competitors) AND a dental `prompt_pack` → the fix IS
>     applied; if the score is still 13.8 the issue is elsewhere (prompt quality or mention detection).
>   - `pending` / `processing` / `failed` → classification never completed → this is hypothesis (B)-ish
>     (the brand has no smart pack) OR a pre-fix brand that predates the column. Report which.
>   - column/value NULL or empty `prompt_pack` → pre-fix brand (created before the feature) → hypothesis
>     (A): the last audit used the OLD generic-vertical path, so 13.8 is stale.
> - **prompt_pack contents** — if populated, paste the prompts. Are they dental market queries ("best
>   dentist in [suburb]", "teeth whitening near me", "emergency dental Sydney") or generic SaaS/vertical
>   prompts that a dental practice would never appear in? This is the smoking gun.
> **Report:** created_at (pre/post-fix?), classification_status, the classification JSONB (or null), and
> the prompt_pack prompts (or null). State which hypothesis this points to BEFORE spending anything.

═══════════════════════════════════════════════════════════════════════════════
STEP 2 — Decide the path based on Step 1 (state it explicitly)
═══════════════════════════════════════════════════════════════════════════════

> - If Step 1 shows **no classification / pre-fix brand** → hypothesis (A). The fix is in place for NEW
>   audits; the 13.8 is just stale. Proceed to Step 3 (re-audit) to confirm the score corrects.
> - If Step 1 shows **classification complete + dental prompt_pack** but score is still 13.8 → the smart
>   pack engaged yet the score is low. Proceed to Step 3 to re-audit and inspect WHY (Step 4 covers the
>   mention-detection angle) — this would be the more interesting/bug-leaning case.
> - If Step 1 shows **classification_status = failed** → report the failure reason if logged. A re-audit
>   may retrigger classification; proceed to Step 3 and watch whether it moves to `complete`.
> State the chosen path and the reasoning.

═══════════════════════════════════════════════════════════════════════════════
STEP 3 — Re-audit Marrickville specifically (~$0.84 — the before/after proof)
═══════════════════════════════════════════════════════════════════════════════

> In PROD mode, run a fresh audit for **Marrickville Dental Studio** (NOT Bondi — the prior "fresh
> audit" tested Bondi by mistake, which is why 13.8 didn't change).
> 1. If the brand is pre-fix / unclassified, confirm whether the audit flow triggers classification
>    now (does it backfill the smart pack on audit, or only on brand-creation?). Report what happens to
>    classification_status during/after the run. (If classification only fires on creation and there's
>    no backfill-on-audit, note that — it means pre-fix brands need a manual reclassify, which is itself
>    a finding worth surfacing.)
> 2. Confirm which prompt path the re-audit used: stored smart pack / built-from-classification /
>    generic vertical fallback. Report the actual prompts sent.
> 3. Let the multidim audit complete; record the NEW composite score.
> **Report:** the before score (13.8) vs the AFTER score; which prompt path was used; the prompts sent;
> and whether classification moved to `complete`.

═══════════════════════════════════════════════════════════════════════════════
STEP 4 — Interpret the result (the definitive answer)
═══════════════════════════════════════════════════════════════════════════════

> - **Score jumps to a believable dental range (≈55-90)** with dental-specific prompts → hypothesis (A)
>   CONFIRMED. The Smart Prompt Pack works; 13.8 was stale pre-fix data. The fix generalises to dental
>   (a category it wasn't designed around — good news). The only follow-up: decide whether pre-fix
>   brands should be auto-reclassified/re-audited in a backfill, or left until next natural audit.
> - **Score stays ~13.8 DESPITE dental-specific prompts being sent** → hypothesis (B): the prompts are
>   right but the brand genuinely isn't being mentioned, OR mention detection is failing. Dig one level:
>   spot-check 2-3 engine responseSnippets for the dental queries — is "Marrickville Dental Studio"
>   actually absent from the responses (a real low-visibility result for a small local practice — which
>   could be LEGITIMATE), or is it present in the text but not being detected (a mention-detection bug)?
>   Report which.
> - **Re-audit still used the generic vertical pack** (no dental prompts) → the smart pack isn't
>   engaging for this brand → real bug in the classification/pack-selection path. Capture
>   classification_status + why the fallback chain fell through to vertical.
> **Final report:** state plainly which hypothesis is true, the before/after score, and — if it's a bug
> (B or the fallback case) — exactly where it breaks (classification failed / pack not selected /
> mention detection missing). Do NOT apply a fix in this run; report the diagnosis so the fix can be
> scoped properly.

─────────────────────────────────────────────────────────────────────────────

## Notes for Sri (not part of the paste)
- **Step 1 is free** — if Marrickville has no classification / an old created_at, you have your answer
  (stale pre-fix brand) before spending a cent, and Step 3 just confirms it.
- **The likely outcome is hypothesis (A)** — the raw region slug + the fact it's an older brand both
  point to "created before the Smart Prompt Pack, so its last audit used generic prompts." If so, the
  13.8 → believable-dental-score jump is actually a NICE confirmation your fix works on a third
  category (dental), beyond the design/HR cases.
- **One genuinely useful sub-finding to watch (Step 3.1):** does classification backfill on *audit*,
  or only on brand *creation*? If only on creation, every pre-fix brand (Marrickville, Canva, any
  others) will keep showing stale low scores until manually reclassified — which might warrant a small
  one-time backfill job. That's a real product decision this diagnostic will surface.
- **Don't mistake a legitimate low score for a bug:** a tiny single-suburb dental practice may genuinely
  have low AI visibility. Step 4's responseSnippet check distinguishes "correctly low" from "wrongly
  low" — important for a trust product not to inflate a real result.
- Bundle nothing else — this is a focused diagnostic. Once we know A vs B, I'll write the right
  follow-up (a backfill job, a mention-detection fix, or nothing if it's just stale).
