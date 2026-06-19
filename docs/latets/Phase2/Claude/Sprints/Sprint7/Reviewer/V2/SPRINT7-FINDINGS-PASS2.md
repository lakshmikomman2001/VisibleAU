# VisibleAU Phase 2 — SPRINT 7 PROMPT: GATE 2 FINDINGS (PASS 2 — fix-validation + fresh angle)
# Reviewer: independent reviewer chat | Date: June 2026
# Reviewing: visibleau-p2-sprint-7-prompt.md **v1.1** (Conversational Discovery Intelligence, Layer 4)
# Canon used: visibleau-phase2-v8_65-complete-REVIEWED-r2 (authorized; v8.67's five hygiene/security
#   edits don't touch Layer 4). v8.67 anchors map to r2 at ≈ −84 in L4; verified by content.
# Pass-1 angle: fidelity + the three cross-sprint contracts + the structural traps (finding S7-01).
# Pass-2 angle (this doc): WRITE-SEMANTICS, RE-RUN/RETRY IDEMPOTENCY & READ-CONSISTENCY for the two
#   new functions. Both fire REPEATEDLY (run-comparison on EVERY audit/complete; run-journey on every
#   run-request/re-run) and both write result rows; Inngest delivers at-least-once and retries on
#   failure. Are the writes retry-safe, do repeated triggers accumulate coherently, and does the
#   reading side show the right data? A dimension none of the prior pass-angles examined.

---

## 1. VERDICT — **PASS-WITH-FIXES** (the S7-01 fix is correct; three new LOW/LOW-MOD items from the fresh angle)

The S7-01 fix is correctly applied with no new inconsistency. The fresh retry/idempotency angle
surfaced three real (LOW / LOW-MOD) items in the same theme — two prompt-level refinements and one
LLD-level escalation. None is a structural defect; all matter under Inngest's at-least-once /
retry-on-failure semantics and the standing Performance/Scalability/cost non-negotiables.

**(a) v1.1 fix — VERIFIED CORRECTLY APPLIED:**
- **S7-01 (run-journey trigger event) — fixed.** §8.1 now names the internal event
  **`journey/run-requested`** (slash convention), emitted by `POST …/journeys/[journeyId]/run`
  via `inngest.send(...)` and listened on by run-journey; §9 reflects the emit; §12 gained a
  producer↔consumer grep (`grep … 'journey/run-requested' … run/route.ts run-journey.ts → ≥2`,
  a sound positive grep — no false-fail); the scheduled-re-run path is clarified (a later cron may
  emit the same event; only the API path is wired now). The optional §1 `types.ts` polish was also
  applied. Surgical 22-line diff, no existing wiring touched.

---

## 2. FRESH ANGLE — WRITE-SEMANTICS, RE-RUN/RETRY IDEMPOTENCY & READ-CONSISTENCY

Both new functions fire repeatedly and write rows; I traced the write path (retry-safety), the
accumulation (repeated triggers), and the read path:

| Concern | run-journey | run-comparison-prompts |
|---|---|---|
| Trigger frequency | per run-request / re-run | **every** `audit/complete` (PC-05) |
| LLM-call volume | 5 turns × 4 engines = 20 (sequential) | competitors × engines (independent; "300" at Agency Pro) |
| Per-call retry-safety (steps) | **SN-01 step.run per turn ✓** | **none — S7b-02** |
| Result-row write retry-safety | **row INSERT not stepped — S7b-01** | not stepped (part of S7b-02) |
| Table write semantics | append-only history (one row/engine/run) ✓ | per-audit append (audit_id CASCADE) ✓ |
| Read shows the right slice? | history (intended) ✓ | **no latest-audit filter — S7b-03** |

The write *semantics* are correct (both append; matching agent_readiness / share_of_voice_snapshots
patterns). The gaps are in **retry idempotency** (S7b-01, S7b-02) and **read filtering** (S7b-03).

---

## 3. NEW FINDINGS (pass 2)

### S7b-01 — [LOW-MOD] run-journey's result-row INSERT isn't specified to be step-wrapped (retry can double-insert)
- **Where:** §8.1 — "Persist each turn result inside its step closure …" then, separately, "Writes
  journey_run_results (one row per engine per run)."
- **The gap:** the SN-01 steps protect the per-turn **LLM calls** (memoized on retry — LLD 7501-7512),
  but the **per-engine `journey_run_results` row INSERT** (written after a turn-loop completes) is
  *not* stated to be inside a step. Under Inngest's replay model, a retry memoizes the turn steps
  (skipped) and then **re-executes the code after them — including the INSERT** → a duplicate
  result row. journey_run_results has no UNIQUE (correct — it's append-only history), so nothing
  catches the duplicate.
- **Why it matters (LOW-MOD):** the journey results screen shows the score *history/trend*
  (`run_at DESC`); a duplicated run is a spurious extra data point in a scored series. Bounded
  (only on a retry after the turns succeeded), but it's a data-integrity blemish on a metric.
- **Required fix:** state that the per-engine result write is **also** a stable step, e.g.
  `await step.run(\`persist-${engine}\`, async () => { /* INSERT journey_run_results */ })`, so the
  whole function — not just the LLM calls — is retry-idempotent. No LLD change.

### S7b-02 — [LOW-MOD] run-comparison-prompts has no step structure (retry re-runs all LLM calls + re-inserts) — ESCALATE to Sri
- **Where:** §8.2 / LLD 7516-7541 — run-comparison loops `for (competitorDomain of brand.competitors) {
  run prompts; insert }` with `concurrency: { limit: 3 }` and the engine-gate, but **no `step.run`**.
- **The gap:** run-journey was given SN-01 *specifically* so a mid-run failure doesn't restart all
  20 LLM calls (LLD 1043-1048). run-comparison makes a **comparable, independent** volume of LLM
  calls (competitors × engines — "300 concurrent at Agency Pro without a limit", LLD 7521) but has
  **no equivalent step structure**, so an Inngest retry **re-runs every comparison LLM call from
  scratch** (the exact quota waste SN-01 fixed) and **re-inserts comparison_prompt_results rows**
  (duplicates — no UNIQUE/idempotency guard). The LLD applied SN-01 to run-journey but not
  run-comparison — an inconsistency, not a deliberate exemption I can find.
- **Why it matters (LOW-MOD):** retry-driven LLM re-runs are a direct cost hit (an explicit Sri
  concern), and the duplicate rows compound S7b-03 below.
- **Escalation (LLD-level — the prompt faithfully mirrors the LLD's omission):** recommend the LLD
  add a parallel step structure to run-comparison — `step.run(\`cmp-${competitor}-${engine}\`, …)`
  with persist-in-step — so its retry-safety matches run-journey's. With Sri's go-ahead the prompt
  can then require it (today it would be adding a requirement the LLD doesn't state).

### S7b-03 — [LOW] The S3 benchmark read of comparison_prompt_results has no latest-audit filter
- **Where:** the S3 Competitive Benchmark route (CPR-01, LLD 8884+) specifies only NULL-handling
  ("Coming soon") and tier competitor limits; the S7 prompt §6U.4/§9 says the data "goes live" but
  doesn't specify the read filter.
- **The gap:** comparison_prompt_results **accumulates per-audit** — every `audit/complete` writes a
  fresh row-set per competitor×engine (audit_id CASCADE). The indexes are `run_at DESC` (so a
  latest query is *supported*), but **neither the LLD route spec nor the prompt says the benchmark
  reads the latest** comparison per competitor. Once S7 fills the data and audits keep running, an
  unfiltered read shows **every historical comparison across all audit cycles** (and any S7b-01/
  S7b-02 duplicates), not the current head-to-head.
- **Why it matters (LOW):** S7's own deliverable (C4iii — "the S3 benchmark goes live") is only
  correct if the read returns the current comparison. This is the integration seam S7 lights up.
- **Required fix:** in §6U.4/§14 (and/or escalate to the S3-route owner), specify the benchmark
  read selects the **latest comparison per competitor×engine** — e.g. the most recent audit's rows,
  or `DISTINCT ON (competitor_domain, engine) … ORDER BY … run_at DESC` — not all historical rows.

---

## 4. CLEAN — verified this pass
- The S7-01 fix is correctly applied (event named + producer/consumer wired + grep + scheduled-run
  note); the §1 types.ts polish applied; surgical diff; previously-clean regions untouched.
- **Write semantics themselves are correct:** journey_run_results append-only history; comparison_
  prompt_results per-audit append (audit_id CASCADE) — both consistent with the established
  audit/complete-listener pattern (share_of_voice_snapshots). The gaps are retry-idempotency
  (S7b-01/02) and read-filtering (S7b-03), not the table design.
- **The pass-1 high-risk areas remain clean** (v1.1 didn't touch them): the dual-emit (C4i — the #1
  risk), crawler reuse (C4ii), the S3 benchmark completion (C4iii), all five structural traps (C2),
  the journey_score formula (C3), run-journey's SN-01 per-turn step structure + ENGINE_TO_PROVIDER
  gate (C5), and the v8.19 tier gating (C6). serve()=25.

---

## 5. NEXT STEP
Three retry/consistency items in one theme (two prompt-internal, one escalation):
- **S7b-01** — wrap the per-engine journey_run_results INSERT in a stable step (retry-idempotent). LOW-MOD.
- **S7b-02** — escalate to Sri: give run-comparison the same SN-01-style step structure as
  run-journey (retry-safety + LLM cost); the prompt mirrors the LLD, so this is an LLD hardening. LOW-MOD.
- **S7b-03** — specify the S3 benchmark reads the latest comparison per competitor (it accumulates
  per-audit). LOW.
With S7b-01 + S7b-03 in the prompt and S7b-02 decided at the LLD level, Sprint 7 is ready for Claude
Code. The core remains the cleanest in the series; this pass hardened the repeated-trigger/retry seams.

**Forward note for Sprint 8 (Governance Intelligence, Layer 7):** S8 builds **fanout-webhooks**, the
consumer that finally lights up every webhook emit S4/S5/S6 produce (`hallucination/detected`,
`agent/readiness-scored`, `report/generated`, `visibility/trend-updated`) — so S8's #1 check mirrors
S7's dual-emit: verify fanout-webhooks subscribes to **all** those internal slash events and maps
each to the correct external dot webhook (VALID_EVENTS). Given this pass: also check fanout-webhooks'
own **retry/idempotency** (a webhook delivery retried by Inngest must not double-POST the customer's
endpoint — dedup or idempotency key), and confirm S8's §1-vs-tree enumeration (S6-03 recurred once)
and the audit_trail/RBAC RLS posture.

— End of SPRINT7-FINDINGS-PASS2.md
