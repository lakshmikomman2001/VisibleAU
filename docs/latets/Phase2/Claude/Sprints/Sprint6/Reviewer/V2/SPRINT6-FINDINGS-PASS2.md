# VisibleAU Phase 2 — SPRINT 6 PROMPT: GATE 2 FINDINGS (PASS 2 — fix-validation + fresh angle)
# Reviewer: independent reviewer chat | Date: June 2026
# Reviewing: visibleau-p2-sprint-6-prompt.md **v1.1** (Retrieval Intelligence + Agent Readiness, Layer 1)
# Canon used: visibleau-phase2-v8_65-complete-REVIEWED-r2 (authorized; v8.66 deltas don't touch L1).
# Pass-1 angle: fidelity + correctness rules (S6-01, S6-02, S6-03) + a security pass on the public route.
# Pass-2 angle (this doc): FORWARD-DEPENDENCY & GUARD INTEGRITY — S6 is the first sprint that
#   CONSUMES artifacts built in LATER sprints (S7's crawler + event, S8's local_seo_results +
#   fanout-webhooks) and MODIFIES a Phase-1 function (the retention cron). Sprints run 1→9, so S6
#   executes BEFORE S7/S8 — every such dependency needs a scaffold/guard/defer or S6 breaks at
#   build time. This dimension is invisible to single-sprint fidelity and to the prior pass-angles.

---

## 1. VERDICT — **PASS-WITH-FIXES** (all v1.1 fixes correct; three new LOW/LOW-MOD items from the fresh angle)

The three v1.1 fixes are all correctly applied with no new inconsistency, and the security
escalations were handled correctly (documented, not forced into the prompt). The fresh
forward-dependency angle surfaced three new items — all about cross-sprint sequencing/guards
(the genuinely new dimension), none structural.

**(a) v1.1 fixes — ALL VERIFIED CORRECTLY APPLIED:**
- **S6-01 (crawler INSERT not UPSERT) — fixed in all three places.** §8.1 now "INSERT a new
  crawler_visit_logs row per visit (… APPEND-ONLY … never ON CONFLICT)"; §0.5 gained the
  append-only rule; §12 gained the no-ON-CONFLICT grep. ✓
- **S6-02 (freshness 4→contribution mapping) — fixed.** §6.2 now maps all four enum values
  (`fresh→+0.10, aging→+0.05, at_risk→+0.025, stale→0.00`) using the column names; the LLD-internal
  3-vs-4-tier mismatch is flagged to Sri. ✓
- **S6-03 (§1 lib-module count) — fixed.** §1 now "10 lib modules under lib/retrieval/ + 2 under
  lib/platform/ (local-ai-trust-scorer + explainability)". ✓
- **SEC-A / SEC-B — correctly handled.** The Visit route (§9.1) was **not** changed (the prompt
  stays faithful to the LLD); both are documented in the changelog as LLD-level escalations for
  Sri to decide. That's the right call — the builder didn't unilaterally diverge from the LLD.
- **Edit hygiene:** a clean 38-line diff touching only §0.5, §1, §6.2, §8.1, §12, and the
  changelog. The previously-clean regions (the C2 schema traps, the Visit route, the S4→S6 wiring,
  the formulas) are untouched, so they remain valid.

---

## 2. FRESH ANGLE — FORWARD-DEPENDENCY & GUARD INTEGRITY

I traced every artifact S6 consumes/modifies that lives in a later sprint or Phase 1, and how the
prompt guards each so S6 doesn't break when built before S7/S8:

| S6 consumes | Built in | Guard in the prompt | Verdict |
|---|---|---|---|
| `lib/crawler/index.ts` | **S7** | §13 "scaffold the shared crawler if S7 isn't built" | **ambiguous — S6b-03** |
| `technical-audit/complete` event | **S7** | §8.4/§8.5 forward note (listen now; dormant until S7 emits) | OK (dormant) |
| `local_seo_results` table | **S8** | §6.6 "treat gmb/nap as absent (CPR-01-style), or defer" | **ambiguous — S6b-02** |
| `fanout-webhooks` (agent/readiness-scored) | **S8** | emit now; consumer arrives in S8 | OK (harmless emit-before-consumer) |
| Phase-1 `audit-data-retention.ts` | Phase 1 | §8.6 "guard with the table's presence" | OK (LLD 728 confirms the guard) |

The event/webhook/retention guards are sound. The two table/code guards (crawler, local_seo_results)
are under-specified — see S6b-02 and S6b-03. Supporting grep-executability surfaced S6b-01.

---

## 3. NEW FINDINGS (pass 2)

### S6b-01 — [LOW] The no-ON-CONFLICT greps false-fail on the append-only comment (same class as S5b-01)
- **Where:** §12 — the new `grep -ic "on conflict\|onConflict" inngest/functions/crawler-log-ingest.ts # → 0`
  (added in v1.1) AND the pre-existing `grep -ic "on conflict\|onConflict" db/schema/agent-readiness-scores.ts # → 0`.
- **The problem:** both are "absence" greps, and the prompt now mandates emphasizing the
  append-only rule — so the generated code will carry a comment like "// APPEND-ONLY … never ON
  CONFLICT", which the grep matches.
- **Confirmed by test:** against realistic correct files (INSERT-only code / append-only schema,
  each with the expected "no ON CONFLICT" comment) **both greps matched 1 line** → `grep -qx 0`
  fails → the self-check reports failure on correct code. A clause-targeted grep
  (`grep -iE "\.onConflict\(|insert[^;]*on conflict"` → empty) passes correctly.
- **Why it matters (LOW):** the code is fine; this only undermines the §12 self-check (Claude Code
  sees a false "failure"). This is the second appearance of this exact pattern (S5b-01 was the
  no-risk-column grep) — worth a one-time sweep of all "absence" greps.
- **Required fix:** tighten both no-ON-CONFLICT greps to target an actual clause, not comments —
  e.g. `grep -iE "\.onConflict\(|insert[^;]*on conflict" <file>` must be empty. No LLD change.

### S6b-02 — [LOW-MODERATE] The `local_seo_results`-absent guard for local-ai-trust-scorer is ambiguous
- **Where:** §6.6 — "Reads local_seo_results (Sprint 8 — guard for absence) … If local_seo_results
  isn't built yet, compute the available components and **treat gmb/nap as absent (CPR-01-style),
  or defer the gmb/nap terms.**"
- **The problem:** `local_seo_results` is an **S8** table; S6 runs before it. It supplies **gmb
  (0.25) + nap (0.20) = 45%** of the /100 local_ai_trust_score (the other 55% — directory/abn/
  citation — comes from S5/Phase-1 tables). The prompt offers two options that produce **materially
  different scores** for the same brand across the whole S6→S8 window:
  - "treat gmb/nap as absent" → score capped at ~0.55 → **misleadingly low** (a brand with perfect
    directory/abn/citation shows 55/100);
  - "defer the gmb/nap terms" → re-weight the 0.55 to /100 (a fair partial) **or** NULL.
  The LLD doesn't resolve it (local_seo_results is described at LLD 3758/6819 but with no absence
  spec for the scorer).
- **Why it matters (LOW-MOD):** this is a scored metric shown to Growth+ users for a multi-sprint
  window, and the "treat as absent → falsely-low" path directly conflicts with the honest-data
  discipline (the CPR-01 "Coming soon" precedent exists precisely to avoid misleading numbers).
- **Required fix:** pick **one** explicitly — recommend either (a) re-weight the available terms
  (directory/abn/citation normalised to /100) + a provisional label ("full local trust scoring
  after local SEO data lands"), or (b) `local_ai_trust_score = NULL` until S8 (cleanest). Avoid the
  gmb/nap=0 cap. **Escalate the LLD gap** (no absence spec) to Sri.

### S6b-03 — [LOW] The crawler "scaffold" scope is undefined; §13 (S6 scaffolds) vs §14 (S7 builds canonical) aren't reconciled
- **Where:** §0.2/§13 — "REUSES the Sprint 7 Playwright crawler (`lib/crawler/index.ts`) … if S7
  isn't built yet, **scaffold** the shared crawler — do NOT fork a parallel one"; vs §14 — "Sprint
  7 **builds the canonical** `lib/crawler/index.ts` … that S5/S6 already depend on."
- **The problem:** content-structure-audit (§8.2) needs a **full working** crawler (20-page budget,
  15s/page, 5min total). But "scaffold" is undefined — a **stub** (→ content-structure-audit
  produces no real audits until S7) or the **full crawler** (→ S6 effectively owns the build, which
  contradicts §14's "S7 builds the canonical one"). The LLD calls it "Sprint 7 infrastructure" (LLD
  3279) — a planning-order artifact, since S6 needs it first.
- **Why it matters (LOW):** if a builder reads "scaffold" as "stub", S6 ships a non-functional
  content-structure-audit; if as "full", the S7 prompt must know not to rebuild it.
- **Required fix:** state that S6 builds the **full working** `lib/crawler/index.ts` per the §8.2
  spec (not a stub), and that **S7 reuses/extends it rather than recreating it**. (This also
  pre-empts the S7 coordination risk — see the forward note.) No LLD change required, though the
  LLD's "Sprint 7 built it" label could be updated to "first built by whichever of S6/S7 lands first."

---

## 4. CLEAN — verified this pass
- All three v1.1 fixes correctly applied (S6-01 in all three places, S6-02 four-value mapping,
  S6-03 count); SEC-A/SEC-B correctly left as LLD escalations; surgical diff; previously-clean
  regions untouched.
- **Forward-dependency guards:** the S7 event (dormant-until-emit), the S8 webhook consumer
  (emit-before-consumer), and the Phase-1 retention extension (table-presence guard, LLD 728) are
  all handled correctly. Only the crawler scope (S6b-03) and the local_seo_results math (S6b-02)
  are under-specified.
- The pass-1 high-risk areas remain clean (v1.1 didn't touch them): the five structural traps (C2),
  the PUBLIC Visit route spec (C4 — VA-01/BT-01/MW-01 verbatim), the S4→S6 last-two-slots wiring
  (C6 — all 12 sections now wired), the score formulas (C3), explainability + setRlsContext (C7).

---

## 5. NEXT STEP
Three LOW/LOW-MOD prompt-internal items (one with an LLD escalation), no structural change:
- **S6b-02** (pick one local_seo_results-absent behaviour; escalate the LLD gap) — LOW-MOD, the one
  worth getting right since it's a scored metric for the S6→S8 window and touches the honest-data principle.
- **S6b-03** (define "scaffold" = full crawler; S7 reuses, not rebuilds) — LOW.
- **S6b-01** (tighten both no-ON-CONFLICT greps to target a clause, not a comment) — LOW; the second
  appearance of this grep pattern, so sweep the other "absence" greps too.
With these, Sprint 6 v1.1 is ready for Claude Code. The core (traps, public route, formulas,
S4→S6 wiring) was already correct; this pass hardened the cross-sprint seams.

**Strengthened forward note for Sprint 7:** S7 must **build-or-extend** `lib/crawler/index.ts`
rather than recreate it (S6 will have scaffolded the full working crawler per S6b-03), and must
emit BOTH `technical-audit.complete` (dot) AND `technical-audit/complete` (slash) — the events
refresh-entity-score (S5), score-agent-readiness (S6) and audit-entity-home (S6) all listen on. S7
also fills the CPR-01 comparison data. Watch S7's §1-vs-tree enumeration (S6-03 recurred) and its
own forward/back dependency guards.

— End of SPRINT6-FINDINGS-PASS2.md
