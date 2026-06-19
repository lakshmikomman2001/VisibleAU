# VisibleAU — NEW CHAT HANDOFF (Phase 2, LLD v8.61)
# Date: June 2026 | Supersedes: visibleau-NEW-CHAT-HANDOFF.md (the v8.55 handoff)
# Written by: the Claude session that ran audit passes 37–42 (v8.55 → v8.61)

This document tells a fresh Claude chat exactly where Phase 2 stands, which files are
canonical, what was changed this session and why, and — just as important — what was
deliberately NOT changed. Read it fully before touching anything.

---

## SECTION A — MANDATORY SELF-VERIFICATION (run these BEFORE any work)

Extract the uploaded files, then run all three checks. If ANY fails, STOP and tell Sri
the uploaded files are stale — do not proceed on old versions.

CHECK 1 — LLD version (expect 8.61):
    grep -m1 "^# Version:" visibleau-7layer-lld.md
    → must read: # Version: 8.61 | Date: June 2026

CHECK 2 — Prototype fix-note tip (expect FIX 10):
    grep "FIX 10 (v8.61)" visibleau-prototype-phase2.jsx
    → must match exactly once.

CHECK 3 — Structural invariants:
    • Phase 2 prototype braces 1725/1725, parens 1168/1168 (diff 0/0)
    • CSS-in-template braces balanced; backtick count EVEN
    • LLD GAPs: 16 unique (GAP 1..16)
    • serve() = 25/25 (3 changelog references)
    • 37 Phase 2 tables (numbered manifest 1–38 with #21 = Phase 1 ALTER)

Exact current sizes (for sanity): LLD 8,938 lines / 615,127 bytes;
prototype 3,288 lines / 168,243 bytes.

---

## SECTION B — WHICH FILES ARE CANONICAL NOW

SUPERSEDED by this handoff's companion files (use the v8.61 copies):
  • 02-phase2-lld/visibleau-7layer-lld.md      → v8.61 (was v8.55 in the old bundle)
  • 03-prototypes/visibleau-prototype-phase2.jsx → FIX 10 (was FIX 4)

STILL CANONICAL from the ORIGINAL bundle (unchanged this session):
  • 01-foundational/visibleau-prd-v1.15.md
  • 01-foundational/visibleau-foundations-v1.12.md   (Clerk refs = known drift C-04; Better Auth is canonical)
  • 01-foundational/CLAUDE.md (v1.5)                  (same Clerk drift note applies)
  • 01-foundational/visibleau-architecture-overview-v1.6.md
  • 03-prototypes/visibleau-prototype.jsx             (Phase 1, 44 screens — owns brand-list /
    action-center / vertical-packs / billing screens; known benign −1 brace from a JSX string)
  • 04-phase1-sprints/ (12 sprint prompts + index)
  • 06-bug-fix-prompts/fix-run-audit-new-uuid-error.md (RESOLVED)
  • 06-bug-fix-prompts/fix-audit-zero-engines.md       (OPEN — likely next pickup)
  • All other folders (UI-fix prompts, supporting docs, future-phases, research)

RECOMMENDED: replace the two superseded files inside the canonical bundle zip so future
uploads carry one self-consistent bundle.

---

## SECTION C — WHAT HAPPENED THIS SESSION (v8.55 → v8.61, passes 37–42)

Six sequential conflict-audit passes plus theme/UX hardening. Every fix has an ID; full
detail lives in the LLD changelog (top of file). One-line summaries:

v8.56 — METRIC-UNIT CONSISTENCY angle
  • MS-01 [HIGH, LLD]  mention_rate/citation_rate formulas store PERCENTAGES (×100) but the
    archetype thresholds tested 0–1 ratios → every brand would classify 'recognised_authority',
    silently breaking GAP 9. Thresholds corrected to 20/10 (and SWOT 50/20). Prototype was right.
  • MS-02 [LOW, LLD]   brand_share/competitor_share documented as percentages (sum ≈ 100).
  • TG-02 [MOD, PROTO] Tier gates reconciled to the LLD gate table: Retrieval tab Growth→Starter
    (Starter owns agent_readiness_scores), Reports tab Starter→Growth (generated_reports = Growth+).

v8.57 — NAMED-ARTIFACT REFERENTIAL INTEGRITY angle
  • NM-01 [LOW, LLD]   JourneyTurn interface path corrected to lib/conversational/types.ts
    (discovery/ is the route+component namespace only).
  • NAV-01 [MOD, PROTO] Four implemented screens were UNREACHABLE (autopilot, competitive,
    content-draft, health-check). Wired each at its LLD-intended entry. Zero orphans now.

v8.58 — CATEGORICAL VALUE-SET INTEGRITY angle
  • EV-01 [MOD, PROTO] PriorityBadge band documented as DERIVED (effort + expectedImpactScore,
    ordered by INTEGER priority rank) — remediation_tasks.priority is an INTEGER, not a string.

v8.59 — NUMERIC FIXTURE ARITHMETIC angle
  • NUM-01 [MOD, PROTO] (a) WorkflowHub "Open tasks" card 3→2 / "1 high priority" to match its
    own array. (b) Dashboard relabelled to the LLD canonical "4 / 11 gaps closed this month"
    (org-wide metric; intentionally different scope from WorkflowHub's single-brand counter).

v8.60 — DARK + LIGHT THEME CORRECTNESS angle (WCAG-measured)
  • THM-01 [HIGH, PROTO] "backdropSlidersHorizontal" (corrupted backdropFilter) in TWO overlays —
    blur never rendered. Fixed + WebkitBackdropFilter.
  • THM-03 [HIGH, PROTO] Light-mode layer accents failed AA (workflow 2.54, trust 2.15,
    discovery 2.43). Added [data-theme="light"] override — all accents now ≥4.5 AA. DARK UNCHANGED.
  • THM-02 [cosmetic] "Cputom"→"Custom". 
  • UX-01 [ENH, PROTO] Research-confirmed Geist/Inter + Geist Mono is the 2026 standard → NO font
    swap. Added tabular-nums + slashed-zero on mono numerics, optical sizing, tighter heading tracking.

v8.61 — FOCUS-STATE VISIBILITY + ELEVATION angle
  • FOC-01 [HIGH a11y, PROTO] ZERO :focus-visible rules existed across 50 buttons / 18 handlers
    (WCAG 2.4.7 fail, both themes). Added a global :focus-visible ring via --focus-ring token;
    ring contrast verified (dark 5.41, light 4.95 vs WCAG 1.4.11 ≥3).
  • ELV-01 [MOD, PROTO] Black shadows are invisible on the dark #09090b surface → no card depth in
    dark mode. Added theme-aware --elevation-rest/-hover (dark = shadow + inset top-highlight;
    light = soft drop shadows). .card-lift consumes the tokens.

---

## SECTION D — LOCKED FACTS (verify by grep, never assert from memory)

Unchanged from the v8.55 handoff and re-verified this session:
  • 37 Phase 2 tables, 16 GAPs, serve() = 25/25 Inngest functions
  • Better Auth is canonical (all Clerk references in CLAUDE.md/Foundations = documented drift C-04)
  • PAGE routes use [brandId]; API routes use [id]
  • TIER_ENGINES gating: Free = 2 engines, paid = 4 — never hardcode engine lists
  • Journeys (conversation_journeys / Discovery layer) = Agency+
  • remediation_tasks.status = open|in_progress|ready_for_review|complete|wont_fix (NOT 'done')
  • remediation_tasks.priority = INTEGER rank (1 = top action); categorical low/med/high lives on
    effort + expectedImpactScore
  • workflow_runs.status uses 'completed' (-ed); audits.status uses 'complete' — separate enums
  • report status is UI-DERIVED (generating/ready/published), not a DB column
  • mention_rate / citation_rate / brand_share / competitor_share are PERCENTAGES (0–100);
    mention_source_ratio is a 0–1 ratio (×100 cancels)
  • Tab tier gates (BrandIntelTabs): overview=Free, visibility=Starter, trust=Growth,
    retrieval=Starter, workflow=Starter, discovery=Agency, reports=Growth

NEW this session (now also locked):
  • [data-theme="light"] accent overrides exist in Phase2Styles — light accents are the 700-shade
    variants (workflow #047857, visibility #1d4ed8, comm #4338ca, trust #b45309,
    retrieval #6d28d9, discovery #0e7490, governance #334155), all ≥4.5 AA on white
  • --focus-ring, --elevation-rest, --elevation-hover tokens exist in BOTH theme scopes
  • Mono numerics render with tabular-nums + slashed-zero

---

## SECTION E — AUDIT ANGLES ALREADY COVERED (pick something NOT on this list)

From 42 passes: route params; lucide import hygiene; text corruption; data retention; index
coverage; UPSERT idempotency; RLS WITH CHECK; webhook/Inngest event chains; serve() counts; cron
collisions; Drizzle relations; FK types; ON DELETE behaviour; status machines; type contracts;
tier gates; market codes; seed ordering; metric units (v8.56); named-artifact referential
integrity / nav reachability (v8.57); categorical value-sets vs column type (v8.58); numeric
fixture arithmetic & cross-screen counts (v8.59); dark+light WCAG colour contrast + invalid CSS
props (v8.60); keyboard focus states + dark elevation (v8.61).

Remaining genuinely-unexplored angles are NARROW (e.g. ARIA roles/labels on custom widgets,
reduced-motion support, microcopy consistency, RTL). Expect low yield; do not manufacture
findings. If a pass finds nothing real, SAY SO — a clean pass is a valid result.

---

## SECTION F — DELIBERATE NON-FIXES (do NOT "fix" these; they are correct as-is)

1. AutopilotLoop step.status 'done'|'current'|'pending' — PRESENTATIONAL stepper state, NOT
   remediation_tasks.status. Documented in-file. Do not unify with the DB enum.
2. Phase2Sidebar hubs are intentionally UNGATED (prototype-navigation convenience); the real
   entitlement gate is BrandIntelTabs. Do not add tierGate to the sidebar.
3. Sidebar ids brand-list / action-center / vertical-packs / billing fall through to 'dashboard'
   in the Phase 2 file — they are PHASE 1 screens (visibleau-prototype.jsx owns them). Do not add
   duplicate stubs.
4. run-journey.ts (Inngest function) vs journey-runner.ts (lib module) — correct function/lib
   split, not a naming clash.
5. conversation_journeys mock data carries status 'ready'/'not_run' but the row renders from
   lastRun — harmless dead field in a fixture.
6. task.source 'frequency'/'context' = valid Phase 1 score DIMENSIONS (5-dim model).
7. White (#fff) text and rgba(255,255,255,…) elements sit on accent/gradient FILLS (autopilot
   banner, buttons, pills) — correct in BOTH themes. The HealthCheck danger pill sits ON the
   gradient, not a theme surface.
8. text-disabled fails AA in both themes — inherited Phase 1 disabled text; WCAG-exempt.
9. contentEditable editors' inline outline:none does NOT suppress the focus ring (ring is
   box-shadow).
10. LLD code-fence parity is ODD (117 fences) — PRE-EXISTING in the original upload, harmless to
    builds; renderers may choke on the file's SIZE (595KB+), which is a viewer limitation, not
    corruption. Do not attempt a mass fence "repair".
11. Phase 1 prototype has a −1 brace diff — a brace inside a JSX string; Babel-validated; benign.
12. The historical changelog line referencing lib/discovery/types.ts (v8.50 entry) was left
    intact on purpose — changelog immutability. The live spec says lib/conversational/types.ts.

---

## SECTION G — METHODOLOGY (unchanged; follow it exactly)

1. AUDIT-BEFORE-FIX: read the relevant docs fully; pick a FRESH angle (Section E).
2. ASSESS THE AUTHORITATIVE DOCUMENT before every fix:
   LLD = data shapes / enums / business rules / tier entitlements / metric definitions.
   Prototype = UI/UX layout, navigation, visual tokens, interaction styling.
   Phase 1 sprints = built behaviour. Never fix the wrong side.
3. VERIFY-BEFORE-CLAIM: grep canonical sources; never assert from memory.
4. VERIFY-AFTER-EDIT: re-balance braces/parens (JSX AND the CSS template block), re-check
   invariants, regression-grep that all prior fix IDs are still present.
5. VERSION DISCIPLINE: every pass bumps the LLD version + adds a changelog entry naming the
   angle, each fix ID, the assessment, and the CLEAN list. Prototype edits add a FIX N note.
6. Changelog entries are immutable history — never rewrite old entries.
7. Deliver outputs as files + zip; remind Sri that container outputs do NOT persist across chats.

---

## SECTION H — OPEN ITEMS / SENSIBLE NEXT MOVES

1. fix-audit-zero-engines.md (06-bug-fix-prompts/) — OPEN live Phase 1 bug: an Agency-tier audit
   resolves to an empty engine list → 0 LLM calls. Investigate-first prompt already written.
2. Phase 2 sprint-prompt design — the LLD is hardened (42 passes); prototypes are fully specified
   (Figma-style, both themes, a11y). This is the natural next major work item.
3. Optional: refresh CLAUDE.md/Foundations to retire the Clerk text (close drift C-04 properly).
4. Audit fatigue is real: findings decayed to polish before the theme passes re-opened genuine
   gaps. Default to BUILDING next unless Sri asks for another pass.

## SECTION I — WORKING AGREEMENTS WITH SRI

• Every response: English first, then the full content in Telugu (code/technical terms stay
  English).
• "Do it first and get it right the first time" — no stalling, no deferral on Phase 2 sprint
  prompts / prototype work.
• Performance, Security, Scalability, UX are non-negotiable first-class concerns.
• Prototypes must be fully specified (Figma-style) so Claude Code cannot miss styling.
• Sri uploads the bundle fresh each chat; run Section A checks FIRST, report results, then ask
  what's next.

— End of handoff. Run Section A now.
