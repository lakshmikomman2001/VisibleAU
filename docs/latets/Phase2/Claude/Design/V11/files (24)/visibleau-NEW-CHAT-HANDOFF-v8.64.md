# VisibleAU — NEW CHAT HANDOFF (Phase 2, LLD v8.64)
# Date: June 2026 | Supersedes: visibleau-NEW-CHAT-HANDOFF-v8.63.md
# Written by: the Claude session that ran audit passes 43–45 (v8.61 → v8.64)

This document tells a fresh Claude chat exactly where Phase 2 stands, which files are
canonical, what was changed and why, and — just as important — what was deliberately
NOT changed. Read it fully before touching anything.

---

## SECTION A — MANDATORY SELF-VERIFICATION (run these BEFORE any work)

Extract the uploaded files, then run all three checks. If ANY fails, STOP and tell Sri
the uploaded files are stale — do not proceed on old versions.

CHECK 1 — LLD version (expect 8.64):
    grep -m1 "^# Version:" visibleau-7layer-lld.md
    → must read: # Version: 8.64 | Date: June 2026

CHECK 2 — Prototype fix-note tip (expect FIX 13):
    grep "FIX 13 (v8.64)" visibleau-prototype-phase2.jsx
    → must match exactly once.

CHECK 3 — Structural invariants:
    • Phase 2 prototype braces 1755/1755, parens 1235/1235 (diff 0/0)
    • CSS-in-template braces balanced; backtick count EVEN (54)
    • Zero broken `var(--token)NN` inline-style patterns in the prototype:
        grep -cE "var\(--[a-z-]+\)[0-9a-fA-F]{2}" visibleau-prototype-phase2.jsx → 0
      (6 live borders use color-mix(in srgb, var(--token) 19%, transparent))
    • ARIA live counts (comment mentions in FIX 13 raise raw greps — that is expected):
        aria-label total 19 (15 live + 4 comment) · role="tablist" 4 (2 live + 2 comment)
        role="tab" 3 (2 live + 1) · aria-selected 3 (2 live + 1)
        role="textbox" 3 (2 live + 1) · role="img" 2 (1 live + 1)
    • Template-literal ${x}30 grep returns 3: TWO live valid borders + ONE FIX 11 comment.
    • LLD GAPs: 16 unique (GAP 1..16)
    • serve() = 25/25 (the invariant is 25 functions / 25 registrations)
    • 37 Phase 2 tables (numbered manifest 1–38 with #21 = Phase 1 ALTER on
      brand_entity_scores)

Exact current sizes (for sanity): LLD 9,136 lines / 630,650 bytes;
prototype 3,368 lines / 175,431 bytes. (wc -l convention; bytes are authoritative.)

---

## SECTION B — WHICH FILES ARE CANONICAL NOW

SUPERSEDED by this handoff's companion files (use the v8.64 copies):
  • 02-phase2-lld/visibleau-7layer-lld.md        → v8.64 (was v8.63)
  • 03-prototypes/visibleau-prototype-phase2.jsx → FIX 13 (was FIX 12)

STILL CANONICAL from the ORIGINAL bundle (unchanged):
  • 01-foundational/visibleau-prd-v1.15.md
  • 01-foundational/visibleau-foundations-v1.12.md   (Clerk refs = known drift C-04; Better Auth is canonical)
  • 01-foundational/CLAUDE.md (v1.5)                  (same Clerk drift note applies)
  • 01-foundational/visibleau-architecture-overview-v1.6.md
  • 03-prototypes/visibleau-prototype.jsx             (Phase 1, 44 screens; known benign −1 brace)
  • 04-phase1-sprints/ (12 sprint prompts + index)
  • 06-bug-fix-prompts/fix-run-audit-new-uuid-error.md (RESOLVED)
  • 06-bug-fix-prompts/fix-audit-zero-engines.md       (OPEN — likely next pickup)
  • All other folders (UI-fix prompts, supporting docs, future-phases, research)

RECOMMENDED: replace the two superseded files (and this handoff) inside the canonical
bundle zip so future uploads carry one self-consistent bundle.

---

## SECTION C — WHAT HAPPENED RECENTLY (passes 43–45)

v8.64 — ARIA ACCESSIBLE NAMES + CONTROL SEMANTICS angle (pass 45; WCAG 4.1.2 + 1.3.1)
  Pre-fix inventory: ONE ARIA attribute in 3,338 lines (the sidebar aria-current). The
  v8.38 CLEAN verdict scoped ARIA out of the LLD and named the Phase 1 BK4 patterns
  (aria-current, aria-label score bars) as the precedent — only aria-current was carried.
  All fixes prototype-side:
  • AR-01 [HIGH] Nine icon-only buttons gained aria-label: TopBar Bell/Moon, sidebar
    account menu, WorkflowHub per-task Sparkles (Generate draft for {task}), ContentDraft
    back, ReportsList Download/Share (per-report title), Team Edit/Remove (per-member name).
  • AR-02 [MOD] Both tab bars gained role="tablist" + aria-label; tabs gained role="tab" +
    aria-selected; locked BrandIntelTabs tabs also aria-disabled. APG completion (tabpanel
    ids + arrow keys) recorded as a FIX 13 build rule.
  • AR-03 [MOD] Both contentEditable editors are named textboxes (role="textbox",
    aria-label "Draft title"/"Draft body", body aria-multiline).
  • AR-04 [LOW] Sidebar nav landmark aria-label="Primary".
  • AR-05 [LOW-MOD] IntelCard score bar carries role="img" + aria-label
    "{label}: {value} of {max}" per BK4 — one shared-component edit covers all instances;
    bespoke bars covered by the FIX 13 global rule.

v8.63 — COMPONENT CALL-SITE PROP/DATA CONTRACT angle (pass 44)
  • CT-01 IntelCard gained the `unit` prop its call site + LLD spec already assumed
    (Share of Voice now "34%", not "34/100"). CT-02 zero-delta renders a NEUTRAL "±0" pill.
  • CT-03 TrustHub card DATA-BINDING NOTE (Entity = score_of_10 × 10; Hallucination Risk
    fixture 23 → 20 to match its own screen's feed; LinkedIn = presence_score direct;
    Consensus = AVG(consistency_score) per-source rows).
  • CT-04 [LLD] Canonical Hallucination Risk derivation documented on
    hallucination_incidents: LEAST(100, 15×critical + 5×warning + 1×info) over OPEN
    incidents (is_false_positive = false); lib/trust/hallucination-risk.ts; no risk column.

v8.62 — INLINE-STYLE CSS-VALUE VALIDITY angle (pass 43)
  • CSS-01 Six invalid var()-plus-hex-alpha borders replaced with
    color-mix(in srgb, var(--token) 19%, transparent).

---

## SECTION D — LOCKED FACTS (verify by grep, never assert from memory)

Carried forward and re-verified:
  • 37 Phase 2 tables, 16 GAPs, serve() = 25/25 Inngest functions
  • Better Auth is canonical (Clerk refs in CLAUDE.md/Foundations = documented drift C-04)
  • PAGE routes use [brandId]; API routes use [id]
  • TIER_ENGINES gating: Free = 2 engines, paid = 4 — never hardcode engine lists
  • Journeys (Discovery layer) = Agency+
  • remediation_tasks.status = open|in_progress|ready_for_review|complete|wont_fix (NOT 'done')
  • remediation_tasks.priority = INTEGER rank; low/med/high pill is DERIVED from
    effort + expectedImpactScore
  • workflow_runs.status uses 'completed' (-ed); audits.status uses 'complete'
  • report status is UI-DERIVED (generating/ready/published), not a DB column
  • mention_rate / citation_rate / brand_share / competitor_share are PERCENTAGES (0–100);
    mention_source_ratio is 0–1
  • Tab tier gates: overview=Free, visibility/retrieval/workflow=Starter,
    trust/reports=Growth, discovery=Agency
  • [data-theme="light"] accent overrides (≥4.5 AA); --focus-ring + --elevation tokens in
    both theme scopes; mono numerics = tabular-nums + slashed-zero
  • Inline faint accent borders = color-mix(in srgb, var(--token) 19%, transparent);
    ${jsVar}30 template literals are the OTHER valid mechanism — never unify them
  • IntelCard: optional `unit` prop replaces the /100 suffix; delta === 0 renders the
    NEUTRAL "±0" pill; Entity display = ROUND(score_of_10 × 10); Hallucination Risk =
    LEAST(100, 15c+5w+1i) over open incidents; Consensus card = AVG(consistency_score)

NEW this session (now also locked):
  • ARIA conventions follow Phase 1 BK4: aria-current on nav, aria-label on score bars.
    Icon-only buttons ALWAYS carry aria-label (entity-specific via template literal where a
    row identifies the target). Tab bars are role="tablist" with role="tab" +
    aria-selected children. contentEditable editors are role="textbox" with names.
  • GLOBAL BUILD RULES (FIX 13): decorative lucide icons inside text-labeled controls
    render aria-hidden in the build; clickable DIV mocks ship as button/link elements with
    accessible names; complete the APG tabs pattern wherever role="tablist" appears;
    bespoke score bars follow the BK4 aria-label pattern.

---

## SECTION E — AUDIT ANGLES ALREADY COVERED (pick something NOT on this list)

From 45 passes: route params; lucide import hygiene; text corruption; data retention; index
coverage; UPSERT idempotency; RLS WITH CHECK; webhook/Inngest event chains; serve() counts;
cron collisions; Drizzle relations; FK types; ON DELETE behaviour; status machines; type
contracts; tier gates; market codes; seed ordering; metric units (v8.56); named-artifact
referential integrity / nav reachability (v8.57); categorical value-sets vs column type
(v8.58); numeric fixture arithmetic (v8.59); dark+light WCAG contrast + invalid CSS property
NAMES (v8.60); keyboard focus + dark elevation (v8.61); inline-style CSS property-VALUE
validity (v8.62); component call-site prop/data contracts + scale-vs-column binding (v8.63);
ARIA accessible names + control semantics per BK4 (v8.64).

Remaining angles: reduced-motion support (infinite gradient-shift/pulse-ring animations have
no prefers-reduced-motion guard — small, real), microcopy consistency, RTL (low value for
AU-first). ONE remaining SUBSTANTIVE angle: RESPONSIVE BREAKPOINTS — the prototype's grids
are fixed (grid-cols-3/4/5, no sm:/md: variants) while mobile-responsive is a painpoints
checklist requirement and a non-negotiable; this is large-blast-radius work better treated
as a dedicated design task than an audit fix. Do not manufacture findings; a clean pass is
a valid result.

---

## SECTION F — DELIBERATE NON-FIXES (do NOT "fix" these; they are correct as-is)

1. AutopilotLoop step.status 'done'|'current'|'pending' — PRESENTATIONAL stepper state, NOT
   remediation_tasks.status. Do not unify with the DB enum.
2. Phase2Sidebar hubs are intentionally UNGATED; the real entitlement gate is
   BrandIntelTabs. Do not add tierGate to the sidebar.
3. Sidebar ids brand-list / action-center / vertical-packs / billing fall through to
   'dashboard' — PHASE 1 screens (visibleau-prototype.jsx owns them). No duplicate stubs.
4. run-journey.ts (Inngest) vs journey-runner.ts (lib) — correct function/lib split.
5. conversation_journeys mock status 'ready'/'not_run' — harmless dead fixture field.
6. task.source 'frequency'/'context' = valid Phase 1 score DIMENSIONS.
7. White text on accent/gradient FILLS — correct in BOTH themes.
8. text-disabled fails AA — inherited Phase 1 disabled text; WCAG-exempt.
9. contentEditable inline outline:none does NOT suppress the focus ring (box-shadow).
10. LLD code-fence parity is ODD — pre-existing, harmless; viewer limitation on 600KB+.
11. Phase 1 prototype −1 brace — a brace inside a JSX string; Babel-validated.
12. Historical changelog lines are immutable; the live spec is what gets corrected.
13. ${color}30 / ${step.color}30 template-literal borders and step.color + '12'/'20'
    concats are VALID. The ${x}30 grep = 3 hits (2 live + 1 FIX 11 comment).
14. Fix-note/changelog DESCRIPTIONS quote past corruption literals (FIX-9 backdrop name,
    "Cputom", the LLD's var(--token)30 placeholder). Comment-only; exclude comments when
    grepping for live regressions.
15. MetricRow + EmptyState are defined-but-uninstantiated shared-library FORWARD SPEC
    (implementation note 6; mock data is non-empty everywhere). Not dead code.
16. IntelCard `loading` never passed true = the specified loading state; LayerBadge
    size='md' and Phase2TopBar `actions` are optional variants by design.
17. ARIA raw grep counts exceed live counts because the FIX 13 note mentions the
    attributes (see Section A breakdown). Bespoke score bars (HealthCheck/Retrieval/
    Trust/SoV) are deliberately covered by the FIX 13 global BK4 rule, not per-instance
    attributes — do not add 20+ duplicate labels to the mock.

---

## SECTION G — METHODOLOGY (unchanged; follow it exactly)

1. AUDIT-BEFORE-FIX: read the relevant docs fully; pick a FRESH angle (Section E).
2. ASSESS THE AUTHORITATIVE DOCUMENT before every fix:
   LLD = data shapes / enums / business rules / tier entitlements / metric definitions /
   data derivations. Prototype = UI/UX layout, navigation, visual tokens, interaction
   styling, display transforms, ARIA. Phase 1 sprints = built behaviour.
3. VERIFY-BEFORE-CLAIM: grep canonical sources; never assert from memory.
4. VERIFY-AFTER-EDIT: re-balance braces/parens (JSX AND the CSS template block), re-check
   invariants, regression-grep that all prior fix IDs are still present.
5. VERSION DISCIPLINE: every pass bumps the LLD version + adds a changelog entry naming the
   angle, each fix ID, the assessment, and the CLEAN list. Prototype edits add a FIX N note.
6. Changelog entries are immutable history — never rewrite old entries.
7. Deliver outputs as files + zip; remind Sri that container outputs do NOT persist across chats.

---

## SECTION H — OPEN ITEMS / SENSIBLE NEXT MOVES

1. fix-audit-zero-engines.md (06-bug-fix-prompts/) — OPEN live Phase 1 bug.
2. Phase 2 sprint-prompt design — the LLD is hardened (45 passes); prototypes are fully
   specified (Figma-style, both themes, focus + names + roles, valid CSS, documented data
   bindings). THE natural next major work item.
3. Responsive breakpoints for the Phase 2 prototype — the one remaining substantive design
   gap (fixed grids, no sm:/md: variants); treat as a dedicated task, not an audit pass.
4. Optional: refresh CLAUDE.md/Foundations to retire the Clerk text (close drift C-04).
5. Audit fatigue: 45 passes in. Default to BUILDING next unless Sri asks for another pass.

## SECTION I — WORKING AGREEMENTS WITH SRI

• Respond in English only by default. Telugu translation is OFF — add a Telugu version only
  when Sri explicitly requests it in that conversation (code/technical terms stay English
  within any Telugu portion).
• "Do it first and get it right the first time" — no stalling, no deferral on Phase 2 sprint
  prompts / prototype work.
• Performance, Security, Scalability, UX are non-negotiable first-class concerns.
• Prototypes must be fully specified (Figma-style) so Claude Code cannot miss styling.
• Sri uploads the bundle fresh each chat; run Section A checks FIRST, report results, then
  ask what's next.

— End of handoff. Run Section A now.
