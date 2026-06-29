# VisibleAU Phase 2 — SPRINT-PROMPT GENERATION PLAYBOOK
# Version: 1.0 | Date: June 2026 | Author: original chat (reviewer) for the builder chat
# Governs: production of the 9 Phase 2 sprint prompts against LLD v8.65 (REVIEWED)
# Reviewer: the original chat reviews every deliverable before it becomes canonical.

PURPOSE. Phase 1's prompts needed ~12 post-build fix cycles because sections were
under-specified (see the "Z1 fix — content was not specified" patches inside the Phase 1
prompts themselves). Phase 2 prompts must be right the first time. This playbook defines
the process, the master plan, the per-prompt template, the specification standards, the
machine-checkable invariants, and the review gates that guarantee it.

---

## §0 PRE-FLIGHT (every session, before any work)

1. Inputs required in the session:
   • visibleau-phase2-v8.65-complete-REVIEWED.zip  (LLD + prototype + handoff)
   • The original canonical bundle (for: 04-sprint-prompts/ Phase 1 precedent,
     01-foundational/ docs)
   • SPRINT-MASTER-PLAN.md (from Step 1 onward, once it exists)
2. Run the v8.65 handoff Section A checks. STOP if any fails:
   • grep -m1 "^# Version:" visibleau-7layer-lld.md   → 8.65
   • grep -c "FIX 14 (v8.65)" visibleau-prototype-phase2.jsx → 1
   • LLD contains "ATTRIBUTION CORRECTED IN CROSS-REVIEW" (proves the REVIEWED copy)
3. Re-read the handoff Sections D (locked facts) and F (do-not-fix). Prompts must never
   contradict either.

---

## §1 THE PROCESS (four steps, with review gates)

STEP 1 — MASTER PLAN (one session, reads everything once)
  Output: SPRINT-MASTER-PLAN.md per §2. This is the only session that reads the full LLD
  + full prototype. Everything later runs off the plan + targeted context packs.
  → REVIEW GATE 1: reviewer verifies coverage invariants (§6) before any prompt is written.

STEP 2 — PER-SPRINT GENERATION (6–8 sessions)
  One prompt per session for 4-week sprints (S1–S7); S8+S9 (3-week sprints) may share a
  session ONLY if the S8 prompt completes with full §4 depth first. Each session reads:
  the master plan + its sprint's context pack + the Phase 1 prompt of closest analogue
  (format calibration). NOT the whole LLD.
  → REVIEW GATE per batch: reviewer checks the batch (§7); builder applies findings
    before starting the next sprint. Errors die at sprint N, never reach N+1.

STEP 3 — FINAL CROSS-PROMPT AUDIT (one session, after all 9 exist)
  Referential-integrity pass across the set: every table/function/GAP/screen covered
  exactly once, no duplicate CREATEs, no orphan dependency, sequential buildability
  S1→S9, conventions identical across all prompts.
  → REVIEW GATE 3: reviewer independently re-runs §6 invariants on the full set.

STEP 4 — PACKAGE (same session as Step 3)
  PROMPTS-INDEX.md + zip per §8. Reviewer blesses → Sri records as canonical.

---

## §2 SPRINT-MASTER-PLAN.md — REQUIRED CONTENTS

The plan is the drift-killer. It must contain, in this order:

2.1 SPRINT ROSTER (verbatim from LLD §"PHASE 2 SPRINT PLAN", lines ~8816–8966):
    S1 Platform Foundation (4w) · S2 Workflow Intelligence (4w) · S3 Visibility
    Intelligence + Market Gaps (4w) · S4 Communication Intelligence (4w) · S5 Trust
    Intelligence (4w) · S6 Retrieval Intelligence + Agent Readiness (4w) ·
    S7 Conversational Discovery Intelligence (4w) · S8 Governance Intelligence (3w) ·
    S9 AI Visibility Autopilot UX (3w).
    The builder DERIVES all scope detail from the LLD sprint section + each layer's
    section — never from memory. Any ambiguity → flag for reviewer, do not invent.

2.2 TABLE OWNERSHIP MAP — all 37 Phase 2 tables (manifest #1–38, #21 = Phase 1 ALTER on
    brand_entity_scores) assigned to exactly one sprint, with the LLD line number of each
    CREATE TABLE. Format: | # | table | sprint | LLD line |.

2.3 INNGEST OWNERSHIP MAP — all 25 functions (serve() = 25/25) assigned to exactly one
    sprint, with event names and cron expressions copied verbatim from the LLD.

2.4 GAP COVERAGE MAP — GAPs 1–16 each mapped to the sprint(s) that implement them, with
    the LLD line anchor of the GAP spec.

2.5 SCREEN/COMPONENT OWNERSHIP MAP — every Phase 2 prototype screen and shared component
    (screenMap keys, BrandIntelTabs tabs, IntelCard/StatusBadge/PriorityBadge/etc.)
    assigned to the sprint that builds it, with prototype line anchors. The four
    Phase-1-owned sidebar ids (brand-list, action-center, vertical-packs, billing) are
    explicitly OUT of Phase 2 scope (handoff §F.3).

2.6 DEPENDENCY GRAPH — per sprint: requires (tables/libs/functions from earlier sprints),
    provides (what later sprints may use). Must be acyclic and sequentially buildable.

2.7 SHARED CONVENTIONS BLOCK — copied into every prompt's §0 verbatim (see §4.4).

2.8 CONTEXT PACKS — one per sprint, per §5.

2.9 COVERAGE INVARIANTS — the §6 grep battery results for the plan itself, printed at
    the bottom of the plan (proves 37/25/16/screens all assigned exactly once).

---

## §3 SPRINT-PROMPT TEMPLATE (every prompt follows this exactly)

Mirrors the Phase 1 format (precedent: 04-sprint-prompts/sri-visibleau-sprint-3-prompt.md)
with Phase 2 additions marked ★. File name: visibleau-p2-sprint-N-prompt.md.

  0.  Read first — bundle files to load, version checks (LLD 8.65+), the SHARED
      CONVENTIONS BLOCK (verbatim from master plan), link to master plan entry.
  1.  What ships this sprint — user-visible outcomes + the sprint's GAP coverage.
  2.  Dependencies to install — exact packages + versions.
  3.  Environment variables (additions) — names, formats, where obtained.
  4.  Project structure additions — full tree of every new file. RULE: if a file appears
      in the tree, it gets a §6-style spec below. No "etc.", no "similar to".
  5.  Database schema additions — full Drizzle definitions copied/adapted from the LLD
      (not paraphrased): columns, types, defaults, FKs + ON DELETE, indexes, RLS policy
      (USING + WITH CHECK), retention notes. Enum value-sets as inline comments exactly
      as the LLD documents them.
  6.+ Feature deep-dives — one ### per lib/module/component with: purpose, full function
      signatures, input/output types, algorithm or formula (verbatim from LLD where the
      LLD defines it — e.g. percentages ×100, LEAST(100, 15c+5w+1i)), error handling,
      and edge cases. Code-level, paste-adjacent.
  ★6U. UI SPECIFICATION — for every screen/component this sprint builds:
      prototype line-range anchor; exact tokens used (no raw hex where a token exists);
      BOTH themes (dark default + [data-theme="light"] overrides where relevant);
      states: loading / empty / error / locked(TierGate) / zero-delta where applicable;
      ARIA per the FIX 13/14 build rules (icon-only buttons get aria-label; tablist/tab/
      aria-selected; textbox roles; aria-hidden decorative icons; APG tabs completion);
      focus-visible + elevation token usage; tabular-nums on numeric displays;
      faint accent fills via color-mix(in srgb, var(--token) N%, transparent) — NEVER
      hex-alpha suffixes on var() strings (RT-01);
      responsive note: state the intended sm:/md: behaviour or explicitly defer with
      "RESPONSIVE: deferred to the dedicated responsive task" (never silently omit).
  7./8. Inngest job specs — id, trigger event/cron, steps, idempotency (UPSERT keys),
      retry policy, cost-tracking hooks; serve() registration line.
  9.  API additions — route paths ([id] for API, [brandId] for pages), method, zod
      schema, authz (Better Auth + org scoping), response shape, error codes.
  10. Claude Code prompt — the paste-ready block that opens the sprint in Claude Code.
  11. Tests required — unit + integration, named files, the invariant each proves.
  12. Acceptance criteria — user-level, checkable.
  ★12V. VERIFICATION GREPS — machine checks Claude Code runs after building: table count
      delta, serve() count, route-param greps, enum greps, RT-01/CSS-01 pattern greps,
      ARIA presence, focus-visible presence. Copy the relevant lines from §6.
  13. Common pitfalls / anti-patterns — sprint-specific, plus the global list (§9).
  14. Handoff to Sprint N+1 — what now exists; what N+1 expects.
  Changelog — v1.0 + review-fix entries.

DEPTH CALIBRATION: Phase 1 prompts run ~1,000–1,400 lines. Phase 2 prompts carry §6U in
addition, so 1,200–1,800 lines is the expected range. A prompt under ~900 lines for a
4-week sprint is presumptively under-specified — reviewer will bounce it.

---

## §4 SPECIFICATION STANDARDS (the "right first time" rules)

4.1 NO UNSPECIFIED FILES. Every file in the §4 tree has a full spec. The Phase 1 Z1
    patches exist because this rule was broken. "Implement similarly" is banned.
4.2 VERBATIM OVER PARAPHRASE. Schema, formulas, enum sets, thresholds, tier gates,
    event names: copy from the LLD with the LLD line number cited. If the prompt and the
    LLD ever disagree, the LLD wins and the prompt is the bug.
4.3 PROTOTYPE FIDELITY. §6U references prototype line ranges. Claude Code must be able
    to reproduce the screen without opening the prototype — the prompt carries the
    spec; the prototype anchors verify it.
4.4 SHARED CONVENTIONS BLOCK (master plan §2.7 → every prompt §0). Must include at
    minimum: Better Auth canonical (no Clerk); [brandId] pages / [id] APIs; TIER_ENGINES
    (Free 2 / paid 4, never hardcoded); tab tier gates (overview=Free,
    visibility/retrieval/workflow=Starter, trust/reports=Growth, discovery=Agency);
    remediation_tasks.status enum (open|in_progress|ready_for_review|complete|wont_fix)
    and INTEGER priority rank with derived impact pill; workflow_runs 'completed' vs
    audits 'complete'; report status UI-derived; rates/shares are PERCENTAGES 0–100,
    mention_source_ratio 0–1; Hallucination Risk = LEAST(100, 15c+5w+1i) over open
    non-false-positive incidents; Entity display = score_of_10 × 10; light-theme accent
    overrides exist — never re-derive them; color-mix for faint accent fills (RT-01);
    focus-ring/elevation tokens; tabular-nums on mono numerics; ARIA per FIX 13 rules.
4.5 NON-NEGOTIABLES in every prompt where applicable: RLS USING + WITH CHECK on every
    multi-tenant table; indexes for every documented query path; no N+1 (specify the
    join/batch); zod validation on every API input; loading/empty/error states on every
    screen; error boundaries; accessibility (4.4's ARIA block); cost controls on every
    LLM call path (tier model routing, canary, caching per Phase 1 patterns).
4.6 DO-NOT-FIX AWARENESS. Prompts must not "correct" anything in handoff §F (e.g. do not
    gate the sidebar, do not unify the Autopilot stepper with the task enum, do not stub
    Phase-1 screens).
4.7 AMBIGUITY PROTOCOL. If the LLD is silent or ambiguous on something a prompt needs:
    do NOT invent. Add it to the prompt's "OPEN QUESTIONS FOR REVIEWER" block at the top
    and proceed with the rest. The reviewer resolves it against the LLD (and, if the LLD
    truly lacks it, escalates to Sri for an LLD decision + version bump).

---

## §5 CONTEXT PACK FORMAT (one per sprint, inside the master plan)

  SPRINT N CONTEXT PACK
  • LLD reads:   [line ranges] — layer section(s), sprint section, relevant GAP specs
  • Prototype:   [line ranges] — screens/components this sprint builds
  • Phase 1 precedent: sri-visibleau-sprint-X-prompt.md (closest analogue, for format)
  • Provides to later sprints: [tables, libs, functions]
  • Requires from earlier sprints: [tables, libs, functions]
  • Locked facts hot-list: the 5–10 conventions this sprint is most likely to violate

Rule: a generation session may ONLY read what its pack lists (plus the master plan).
If it needs more, the pack was wrong — fix the pack first (reviewer notified).

---

## §6 COVERAGE INVARIANTS (machine-checkable; run at Gate 1 and Gate 3)

On the master plan:
  • Table rows in ownership map = 37 (+1 ALTER row for #21): every manifest table
    appears EXACTLY once. Cross-check: each LLD "CREATE TABLE <name>" in the manifest
    has one map row.
  • Inngest map rows = 25; names match the LLD serve() registry one-to-one.
  • GAP map covers 1–16 with no gaps (sic) and no duplicates.
  • Screen map covers every screenMap key + every BrandIntelTabs tab; the four Phase-1
    ids are listed as out-of-scope.
  • Dependency graph: no cycle; every "requires" is some earlier sprint's "provides".

On each prompt (Gate 2):
  • Every table it creates is in its master-plan row; no table outside its row.
  • grep -c "Clerk" → 0 (Better Auth only) · page routes grep "\[brandId\]" only ·
    API routes grep "\[id\]" only.
  • Enum sets byte-identical to the LLD comment blocks (diff, not eyeball).
  • §6U present for every screen in its screen-map row; both themes addressed;
    "RESPONSIVE:" line present (spec or explicit deferral).
  • §12V present and runnable.

On the full set (Gate 3):
  • Σ tables across prompts = 37; Σ Inngest = 25; Σ GAPs touched ⊇ 1–16.
  • No CREATE TABLE name appears in two prompts.
  • Every "Handoff to Sprint N+1" matches N+1's "requires".

---

## §7 REVIEWER CHECKLIST (what the original chat checks per batch)

1. Pre-flight proof: builder's session ran §0 and reports the three check results.
2. Template conformance: all sections 0–14 + ★ sections present; depth ≥ calibration.
3. Verbatim audit: sample 10 schema/formula/threshold citations per prompt against the
   LLD at the cited line numbers (not from memory).
4. Conventions: shared block present and unmodified; §4.4 facts not contradicted.
5. Invariants: run the §6 Gate-2 battery.
6. UI fidelity: sample 3 components per prompt against prototype line anchors — tokens,
   both themes, states, ARIA, RT-01 compliance.
7. Do-not-fix: nothing in handoff §F "corrected".
8. OPEN QUESTIONS block: resolve each against the LLD; escalate true LLD gaps to Sri.
9. Findings → builder as numbered items (P2SP-NN-XX ids); builder fixes + bumps the
   prompt's changelog before the next sprint session.

---

## §8 PACKAGING & RELAY DISCIPLINE

• File names: SPRINT-MASTER-PLAN.md · visibleau-p2-sprint-N-prompt.md (N = 1..9) ·
  visibleau-p2-sprint-prompts-index.md (mirrors the Phase 1 index format).
• Every deliverable zip carries a MANIFEST.txt: LLD version built against (8.65),
  prototype fix-tip (FIX 14), playbook version (1.0), files + byte sizes, and the §6
  battery output.
• Prompts do NOT bump the LLD version. If prompt work exposes a genuine LLD gap, that is
  a separate, reviewer-approved LLD change with its own changelog entry and version bump
  — then prompts cite the new version.
• Relay: builder zips → Sri uploads to reviewer → reviewer's findings file goes back →
  builder applies → next sprint. Container outputs do not persist; always download.

---

## §9 GLOBAL ANTI-PATTERNS (from Phase 1's patch history — every prompt's §13 inherits)

1. "Implement similarly to X" / unspecified files (the Z1 disease).
2. Hardcoded engine lists or tier checks (the N1 disease — TIER_ENGINES only).
3. Paraphrased schema/enums that drift from the LLD by a word.
4. Dark-theme-only UI specs; raw hex where tokens exist; hex-alpha on var() strings.
5. Icon-only buttons without aria-label; tabs without tablist semantics.
6. Missing loading/empty/error/locked states ("happy-path-only" screens).
7. APIs without zod + authz + org scoping spelled out.
8. Inngest functions without idempotency keys or serve() registration noted.
9. Inventing answers to LLD ambiguities instead of the §4.7 protocol.
10. Skipping §12V because "the acceptance criteria cover it" — greps are the contract.

— End of playbook. First deliverable: SPRINT-MASTER-PLAN.md per §2, then stop for
Review Gate 1.
