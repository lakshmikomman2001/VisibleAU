# VisibleAU — Diagnose Marrickville Dental Studio's 13.8 score — Claude Code
# Symptom: "Marrickville Dental Studio" scores 13.8 (visible on the Overview/agency dashboards).
#   QUESTION: is 13.8 WRONG (a stale/buggy score) or CORRECT (a tiny local practice genuinely has low
#   AI visibility)? Don't presume it's wrong — a small single-suburb dental studio plausibly DOES score
#   very low, because LLMs may simply not mention it. Three possible outcomes:
#     (A) STALE pre-fix brand — 13.8 from the old generic-prompt path; a re-audit corrects it upward.
#     (B) LIVE BUG — smart pack not engaging / mention detection failing; re-audit stays ~13.8 wrongly.
#     (C) CORRECT — 13.8 is a genuine low-visibility result for an obscure local business. Nothing to fix.
# Step 1 is FREE and may settle it (especially A vs the rest) with NO spend. A re-audit (Step 3, ~$0.84)
#   is only worth it if Step 1 is inconclusive or points to A/B.
# MODE: Step 1 (read-only query) works in whatever DB has the data — DEV is fine (Marrickville's 13.8
#   shows on the dev Overview, so its row + audits are in the dev database). Only Step 3 (re-audit)
#   needs LLM_MODE=real to hit live engines (dev's mock mode won't give a real score). Run Step 1 first
#   in your current (dev) DB; switch to real-LLM only IF you proceed to Step 3.
# Diagnose — don't "fix" anything.

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
STEP 1b — FREE: inspect Marrickville's EXISTING 13.8 audit (is 13.8 genuinely low?)
═══════════════════════════════════════════════════════════════════════════════
> Before spending on a re-audit, look at the audit that PRODUCED the 13.8 — it's already in the DB. This
> can confirm outcome (C) "genuinely low" for free.
> 1. Find Marrickville's latest completed audit and the prompts it actually used + the per-engine
>    responses/snippets stored for it.
> 2. Check: **what prompts were sent?** Dental-relevant ("best dentist Marrickville", "emergency dentist
>    Sydney") or generic/mismatched (the Canva-class failure)?
> 3. Check: **in the stored engine responses, is "Marrickville Dental Studio" actually absent?** Read 2-3
>    response snippets. Two cases:
>    - The prompts ARE dental-appropriate AND the brand is genuinely not mentioned in the responses →
>      **outcome (C): 13.8 is CORRECT** — a small local practice that LLMs don't mention. Nothing to fix.
>    - The brand IS present in the response text but the audit scored it low → **mention-detection bug**
>      (outcome B) — the score is wrong because detection missed real mentions.
>    - The prompts are generic/mismatched → stale (A) or pack-selection bug (B).
> **Report:** the prompts used, whether they're dental-appropriate, and whether the brand actually
> appears in the stored responses. This often answers A/B/C with NO re-audit needed.

═══════════════════════════════════════════════════════════════════════════════
STEP 2 — Decide the path based on Steps 1 + 1b (state it explicitly)
═══════════════════════════════════════════════════════════════════════════════

> - If Step 1b shows **dental-appropriate prompts AND the brand genuinely absent from responses** →
>   **outcome (C): 13.8 is CORRECT.** STOP — no re-audit, no fix. The product is honestly reporting a
>   small local practice's real low visibility. (This is a perfectly good outcome — note it and move on.)
> - If Step 1 shows **no classification / pre-fix brand** OR Step 1b shows **generic/mismatched prompts**
>   → hypothesis (A) stale. Proceed to Step 3 (re-audit) to confirm the score corrects upward.
> - If Step 1b shows **the brand IS present in responses but scored low** → mention-detection bug (B).
>   A re-audit won't necessarily fix it; the real issue is detection. Note it; Step 3 optional.
> - If Step 1 shows **classification complete + dental prompt_pack** but score is still 13.8 AND the
>   brand is genuinely absent (1b) → likely (C) again. If present-but-undetected → (B).
> - If **classification_status = failed** → report the reason; a re-audit may retrigger it; Step 3.
> State the chosen path and the reasoning. Only proceed to Step 3 if A or an inconclusive B — NOT if (C).

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
