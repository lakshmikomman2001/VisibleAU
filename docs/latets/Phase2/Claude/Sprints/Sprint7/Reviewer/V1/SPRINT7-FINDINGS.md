# VisibleAU Phase 2 — SPRINT 7 PROMPT: GATE 2 FINDINGS
# Reviewer: independent reviewer chat | Date: June 2026
# Reviewing: visibleau-p2-sprint-7-prompt.md v1.0 (Conversational Discovery Intelligence, Layer 4)
# Canon used: visibleau-phase2-v8_65-complete-REVIEWED-r2 (authorized — v8.67 was a hygiene+security
#   pass touching five spots, NONE in Layer 4). The prompt's v8.67 anchors map to my r2 at ≈ −84
#   in Layer 4 (changelog growth) and the FIX-15 prototype anchors at ≈ −28 vs my FIX-14; verified
#   by content, not line number.

---

## 1. VERDICT — **PASS-WITH-FIXES** (near-clean; one LOW spec-precision item)

The strongest sprint prompt in the series. **All three cross-sprint contracts — the point of the
sprint — are correct**, including the #1 risk: the technical-audit-run **dual-emit** is specified
exactly (C4i), the crawler-reuse obligation is handled the way my Sprint-6 pass-2 (S6b-03)
recommended (C4ii), and the S3 Competitive Benchmark completion is wired (C4iii). Every structural
trap (C2), the journey_score formula (C3), the run-journey SN-01 step structure (C5), and the
tricky v8.19 tier-gating (C6) verify clean. The single finding is a LOW, intra-sprint
event-naming gap (S7-01); a clean pass would be defensible, but I'm flagging it for precision.

---

## 2. FINDINGS

### S7-01 — [LOW] run-journey's trigger event is described but not named
- **What the prompt says:** §8.1 — "**Trigger:** event-driven (journey run requested via the API
  / a scheduled re-run)." The §4 tree and §10 step 4 likewise say "event-driven" without naming
  the event; the API (§9) `POST …/journeys/[journeyId]/run` is described as "execute a journey".
- **What I checked:** the LLD's run-journey spec (around the SN-01 region) details the
  step structure + concurrency + engine-gate but **also doesn't name a trigger event** — unlike
  every other Inngest function in the sprint (the dual-emit forms, `audit/complete` for
  run-comparison-prompts), which are named precisely.
- **Why it matters (LOW):** an Inngest function needs a concrete trigger — a named event (that the
  run API `inngest.send()`s) or a cron. As written, Claude Code must invent the event name. The
  **risk is low** because both ends (the run API and run-journey) are built in *this* sprint, so
  Claude Code can name it consistently — there's no cross-sprint producer/consumer mismatch (the
  hazard the dual-emit guards against). But the omission stands out given the prompt's otherwise
  precise event-naming.
- **Required fix:** name the trigger event in §8.1 and §9, following the slash internal-chaining
  convention — e.g. `journey/run-requested` (the `POST …/run` route emits it; run-journey listens
  on it) — and note whether the "scheduled re-run" path is a second event or a cron. No LLD change
  (or a one-line LLD note if Sri wants the event named at the LLD level too).

**Trivial observation (not a finding):** §1 says "4 lib modules" and names the four functional
modules; the §4 tree + §6 also include `types.ts` (§6.0, the `JourneyTurn` interface) + `index.ts`.
`types.ts` is **fully specified** in §6.0 and the tree (and grep-checked in §12), so nothing is
under-specified — the S1-02/S2b-01/S3-01/**S6-03** under-enumeration pattern did **not** recur.
§1 could read "4 lib modules + types.ts" for completeness, but there is no under-build risk.

---

## 3. RULINGS / OPEN-QUESTION CHECK
No OPEN QUESTIONS block. The cross-sprint obligations are scoped correctly: the dual-emit is "a
small, surgical change to an existing Phase-1 function, not a rebuild" (matches LLD 1001-1002 /
7161-7162); the crawler is explicitly "REUSE S6's, do NOT recreate" with the canonical-owner note
(addresses S6b-03); run-comparison-prompts on `audit/complete` feeds S3's CPR-01 benchmark (LLD
8884-8893). The FIX-14-vs-FIX-15 prototype line offset (~28) is a versioning artifact, not a
prompt error — DiscoveryHub and CompetitiveBenchmark both exist.

---

## 4. CLEAN — independently derived against the LLD/prototype
- **C1 schema (3 tables) — verbatim ✓.** conversation_journeys (the vertical CHECK, typed
  prompt_sequence), journey_run_results (journey_id CASCADE, turn_results), comparison_prompt_results
  (audit_id CASCADE, nullable brand_won) + all indexes.
- **C2 structural traps (highest-value) — all five PERFECT ✓.** (a) prompt_sequence typed
  `JourneyTurn[]` + Zod `.min(2).max(8)` (PS-01/TS-01, LLD 7395-7405); (b) the 5-value vertical
  CHECK (tradies/allied_health/saas + professional_services/real_estate, LLD 7392); (c)
  journey_run_results.journey_id **ON DELETE CASCADE** on a NOT NULL parent (E-03b, LLD 7418-7419);
  (d) comparison_prompt_results.audit_id **ON DELETE CASCADE** for retention (E-03, LLD 7450-7451);
  (e) brand_won **nullable** (inconclusive, LLD 7456); competitor_mentioned NOT NULL.
- **C3 journey_score formula — ✓.** base `(appeared/total)×100` + early-mention bonus (turn1 +10 /
  turn2 +5 / turn3+ 0) + cap 100.0, with the 3-of-5-first@1 → 70.0 example (LLD 7431-7436).
- **C4(i) THE DUAL-EMIT (the #1 risk) — PERFECT ✓.** §8.3 edits the Phase-1 technical-audit-run to
  emit BOTH `technical-audit.complete` (dot, webhook/VALID_EVENTS) AND `technical-audit/complete`
  (slash, internal) — exactly LLD 1001-1002 — explicitly "do NOT rebuild the scoring; only add the
  emit," and names the three dormant listeners it wakes (refresh-entity-score S5,
  score-agent-readiness S6, audit-entity-home S6 — LLD 5707/5715/7161).
- **C4(ii) crawler reuse — ✓ (addresses S6b-03).** §0.2 Obligation 2 states S6 already built the
  full Playwright crawler (20-page/15s/5min + the optional userAgent param) and S7 **reuses it, does
  NOT recreate** — the build-or-extend resolution my Sprint-6 pass-2 recommended, with the
  "canonical owner is whichever lands first, never both" note.
- **C4(iii) S3 benchmark completion — ✓.** run-comparison-prompts fills comparison_prompt_results,
  resolving S3's CPR-01 "Coming soon" card to the live comparison view (LLD 8884-8893); §6U.4 reuses
  the S3 CompetitiveBenchmark shell.
- **C5 Inngest (2 new + the edit) — ✓.** run-journey: event-driven (S7-01), Agency+ data, concurrency
  3 (CC-03), **step.run() per engine per turn with stable `turn-${i}-${engine}` names + persist-in-step**
  (SN-01, LLD 7501-7515), isEngineEnabled on the **provider** map (`ENGINE_TO_PROVIDER`, LLD
  7496-7498). run-comparison-prompts on `audit/complete` (PC-05, LLD 7516), concurrency 3 (CC-02),
  reads brands.competitors. serve() reaches **25** (3+6+2+7+5+2) — matches the master plan.
- **C6 tier gating (the "easy to get wrong" one) — CORRECT ✓.** conversation_journeys customer-facing
  UX = **Agency+** (Growth sees the locked teaser with the v8.19 copy), comparison =
  **Growth+**; the data model + Inngest functions built in full regardless (v8.19 CHANGE 5 / TG-01,
  LLD 660/1832-1833). Journey API Agency+, comparison API Growth+.
- **C7 seed + RLS — ✓.** 3 pre-built journeys per vertical (15 rows, valid JourneyTurn[], ON CONFLICT
  DO NOTHING; LLD 9046 acceptance); RLS on all 3 tables; setRlsContext on every protected route
  (8 refs); cross-org → 404 (4 refs); the explainability contract on score-bearing responses.
- **C8 UI — ✓.** DiscoveryHub + CompetitiveBenchmark exist (FIX-15 anchors 2944/2001; FIX-14 ≈
  2916/1973); journeys Agency+ TierGate teaser, comparisons Growth+, the verdict card handles the
  null brand_won; STATES + RESPONSIVE per screen.
- **C9 template/depth — ✓.** Sections 0–14 + §6U; §12 greps sound; §10 self-contained; §1 enumeration
  accurate (see the trivial note) — the under-enumeration pattern did not recur.

---

## 5. NEXT STEP
One LOW prompt-internal item, no structural change:
- **S7-01** — name the run-journey trigger event (slash convention) so the run API and the function
  agree explicitly; clarify the "scheduled re-run" path. Optional/low-risk (the build works either
  way since both ends are in S7), but worth the precision.
With S7-01 addressed, Sprint 7 v1.x is ready for Claude Code. This is the cleanest prompt in the
series: the dual-emit, crawler reuse, and S3-benchmark contracts are all correct, the structural
traps and formula verify, and the tier-gating is right.

**Forward note for Sprint 8 (Governance Intelligence, Layer 7):** S8 creates tables 35–38
(audit_trail, org_members, data_residency_log, org_feature_flags) and **builds fanout-webhooks**,
the consumer that finally lights up every webhook emit S4/S5/S6 already produce — `hallucination/
detected` (S5), `agent/readiness-scored` (S6), `report/generated` (S4), plus `visibility/
trend-updated`. So S8's #1 cross-sprint check mirrors S7's dual-emit: verify fanout-webhooks
subscribes to **all** those internal slash events and maps each to the correct external
`*.detected/*.scored/*.generated` dot webhook (the VALID_EVENTS set). Also confirm S8's §1
enumeration matches its §4 tree (S6-03 recurred once — keep watching), and the RBAC/audit-trail
RLS posture.

— End of SPRINT7-FINDINGS.md
