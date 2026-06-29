# VisibleAU — NEW CHAT HANDOFF (Phase 2, LLD v8.68)
# Date: June 2026 | Supersedes: visibleau-NEW-CHAT-HANDOFF-v8.64.md
# Written by: the Claude session that ran audit pass 46 (v8.64 → v8.65) — an INDEPENDENT
# cross-review session (different chat from the one that ran passes 43–45)
# Revision r2 (registration session, June 2026): attribution correction applied to the
# v8.65 LLD changelog entry + Section C below — the runtime alpha-suffix bug was ORIGINAL
# to v8.55, not a v8.60 regression (re-verified against the v8.55 bundle on disk). LLD
# size figures in Section A updated accordingly; prototype untouched.

This document tells a fresh Claude chat exactly where Phase 2 stands, which files are
canonical, what was changed and why, and — just as important — what was deliberately
NOT changed. Read it fully before touching anything.

## v8.68 UPDATE (June 2026) — consolidated hygiene pass (LLD + PROTOTYPE) — the forty-ninth canon pass
This pass closes the LLD/prototype-hygiene queue produced by the S7/S8/S9 prompt reviews + the
Gate 3 cross-prompt audit. **FIRST PROTOTYPE CHANGE SINCE FIX 15.** No table/GAP/serve() count
changed (37 tables, 16 GAPs, serve()=25/25 all intact). Six items folded:
1. **S7b-02 [LLD]** — run-comparison-prompts.ts given an SN-01-style step.run structure (per
   competitor×engine LLM call + persist each in its own deterministic step) for retry-safety.
2. **S8-01 [LLD]** — the `hallucination/acknowledged` fanout PRODUCER emit added at SOURCE (the
   PATCH hallucinations route spec); the companion `visibility/trend-updated` emit already lived in
   aggregate-visibility-trend.ts. Both fanout producers now exist (were only in the consumer map).
3. **S8b-01 [LLD]** — `assertBrandAccess(user, brandId)` FORMALISED as the canonical brand-isolation
   gate (org-scoped RLS does not enforce org_members.brand_access). Distinct from `canPerform`.
   Sprint 8 builds it + retrofits S1-S7; Sprint 9 relies on it.
4. **S8b-02 [LLD]** — RBAC matrix role-ceiling rows: change-role + remove-member (owner/admin),
   assign/revoke OWNER role (owner only); admin can't touch an owner (403).
5. **S8b-03 [LLD]** — audit_trail action enum gains `member_role_changed` + `member_removed`
   (resource_type `org_member`).
6. **S9-02 [PROTOTYPE → FIX 16]** — HealthCheck reconciled to the LLD's four CROSS-LAYER dimensions
   (AI Sentiment / AI Presence / Site Readiness / Local Authority, + the #1 action as the 5th
   section; grid 5→4 cols), replacing the raw audit multidim it previously showed.

**Also closed in the PROMPTS (not canon):** G3-01 — the platform-wide explainability contract was
missing from the S3/S5 scored routes; fixed in the S3 + S5 prompts (v1.4 each — S3 creates
ExplainabilityService as the first scored sprint, S5 reuses it). All 9 sprint prompts now:
S1 v1.4 · S2 v1.4 · S3 v1.4 · S4 v1.3 · S5 v1.4 · S6 v1.3 · S7 v1.2 · S8 v1.3 · S9 v1.2.

**Still deliberately NOT done:** OQ-1 `local_seo_results` — no DDL until a dedicated local-SEO
pass; S6's `local_ai_trust_score` stays NULL by design (S6b-02). This is the one piece of Phase 2
scope intentionally deferred. After v8.68: BUILD.

Canonical bundle = `visibleau-phase2-v8.68-complete-REVIEWED.zip` (LLD 9,365 lines; prototype 3,437
lines at FIX 16). Sprint prompts re-pinned: §0.3 accepts v8.68 (8.67/8.66 still valid).
Verify v8.68: `grep -m1 '# Version:' visibleau-7layer-lld.md` → 8.68; `grep -c 'FIX 16 (v8.68)'
visibleau-prototype-phase2.jsx` → 1; `grep -c 'ATTRIBUTION CORRECTION' visibleau-7layer-lld.md` → 3.

---

## v8.67 UPDATE (June 2026) — consolidated hygiene + security pass (LLD-only)
The forty-eighth canon pass folded five items from the Sprint 4/5/6 prompt reviews into one
coordinated LLD edit. **No schema restructuring, no new tables/GAPs/functions; the prototype is
UNCHANGED (still FIX 15).** Detail is in the LLD changelog's v8.67 entry; in brief:
- **S4-02:** generated_reports DDL stray-comma typo fixed (comma after created_at; none after
  the final updated_at) — now valid SQL.
- **S5-02:** the WH-01b webhook severity wording `'critical'|'high'` corrected to
  `'critical'|'warning'` (the severity enum is critical|warning|info — no 'high'); matches the
  email-alert path in detect-hallucinations.
- **S6-02:** citation_probability's freshness contribution reconciled to the 4-tier
  freshness_risk column enum (fresh +0.10, aging +0.05, at_risk +0.025, stale 0.00) — at_risk
  previously had no contribution.
- **SEC-A (Visit API hardening):** the POST /api/visit handler now validates
  `new URL(body.url).host` against the brand's domain (the public brandToken could otherwise be
  used to post visits for arbitrary URLs).
- **SEC-B (Visit API hardening):** an IP-based throttle now runs FIRST (before any DB work) plus
  a short-TTL negative cache for unknown tokens, then the brand lookup → SEC-A domain check →
  per-token limit. Closes the un-throttled DB-amplification path on the unauthenticated endpoint.
  Visit-route steps renumbered a–h.
- **Invariants unchanged:** 37 tables, 16 GAPs, serve()=25/25; the RM-01/FIX-15 reduced-motion
  reset and the `ATTRIBUTION CORRECTION` marker intact.
- **Sprint prompts** re-pinned: §0.3 accepts v8.67 (8.66/8.65 still valid). The S4/S5/S6 prompts
  already carry the corrected behaviour from their own reviews; this canon edit makes the LLD
  authoritative for it.

---

## v8.66 UPDATE (June 2026) — coordinated RM-01 motion-safety batch
Since this handoff was first written for v8.65 (pass 46), one coordinated batch advanced
canon to **v8.66**. The detail is in the LLD changelog's v8.66 entry; in brief:
- **Prototype → FIX 15 (RM-01):** added a global `@media (prefers-reduced-motion: reduce)`
  reset to Phase2Styles so all animations (pulse-ring, gradient-shift, float-up, score-fill,
  Tailwind animate-pulse) honor the OS reduce-motion setting — WCAG 2.2.2 (Level A) for the
  infinite auto-playing gradient banners. The universal `!important` reset overrides even
  inline `animation:` props. Additive; no behavioural change without the preference.
- **LLD:** version → 8.66 + the v8.66 changelog entry (records RM-01, the build rule, and
  RM-02 as a forward build rule). Invariants unchanged: 37 tables, 16 GAPs, serve()=25/25,
  the RT-01/color-mix state and `ATTRIBUTION CORRECTION` marker intact.
- **S1-01 marker reconciliation:** r2's `ATTRIBUTION CORRECTION` is the single canonical
  marker; the sprint prompts accept it via an either-marker regex.
- **RM-02 + responsive breakpoints:** recorded as forward build rules / a dedicated design
  task — NOT applied to the prototype.
- **Sprint prompts re-pinned:** S1 v1.3, S2 v1.3, S3 v1.2 — their §0.3 version check now
  accepts 8.66 (8.65 also valid; v8.66 touched nothing they cite).
The pass-46 narrative below (Sections B/C and the self-checks, now reading 8.66 / FIX 15)
remains the canonical record of how the runtime-CSS fix landed.

---

## SECTION A — MANDATORY SELF-VERIFICATION (run these BEFORE any work)

Extract the uploaded files, then run all three checks. If ANY fails, STOP and tell Sri
the uploaded files are stale — do not proceed on old versions.

CHECK 1 — LLD version (expect 8.67):
    grep -m1 "^# Version:" visibleau-7layer-lld.md
    → must read: # Version: 8.67 | Date: June 2026

CHECK 2 — Prototype fix-note tip (expect FIX 15):
    grep -c "FIX 15 (v8.66)" visibleau-prototype-phase2.jsx
    → must return exactly 1.

CHECK 3 — Structural invariants:
    • Phase 2 prototype braces 1757/1757, parens 1259/1259 (diff 0/0)
    • CSS-in-template braces balanced; backtick count EVEN (58)
    • Zero broken `var(--token)NN` inline-style patterns in the prototype:
        grep -cE "var\(--[a-z-]+\)[0-9a-fA-F]{2}" visibleau-prototype-phase2.jsx → 0
    • RUNTIME hex-alpha suffixes (NEW, RT-01 v8.65): the template-literal pattern grep
        grep -cE '\$\{[a-zA-Z.]+\}30' visibleau-prototype-phase2.jsx → 1
      (the ONE hit is the FIX 11 header comment; zero live hits. There are NO live
      `${x}NN` or `.color + 'NN'` alpha-suffix style values anywhere — all were replaced
      with color-mix in v8.65.)
    • color-mix live occurrences: 15 across 14 lines (the Autopilot step detail-box line
      carries two). Raw `color-mix(in srgb` grep = 16 (15 live + 1 FIX 9/CSS-01 comment).
      The plain word "color-mix" also appears twice in the FIX 14 note — exclude comments
      when grepping for live counts.
    • ARIA live counts (comment mentions raise raw greps — expected):
        aria-label total 19 (15 live + 4 comment) · role="tablist" 4 (2 live + 2 comment)
        role="tab" 3 (2 live + 1) · aria-selected 3 (2 live + 1)
        role="textbox" 3 (2 live + 1) · role="img" 2 (1 live + 1)
    • LLD GAPs: 16 unique (GAP 1..16, contiguous, no holes)
    • serve() = 25/25 (25 unique inngest/functions/*.ts files; 25 imports in the
      registration block)
    • 37 Phase 2 tables (numbered manifest 1–38 contiguous with #21 = Phase 1 ALTER on
      brand_entity_scores)

Exact current sizes (for sanity): LLD 9,192 lines / 634,919 bytes (r2 —
includes the attribution-correction annotation); prototype 3,390 lines / 177,657 bytes.
(wc -l convention; bytes are authoritative.)

Independent validation also performed this pass (worth re-running if you edit the JSX):
    @babel/parser parse with {sourceType:'module', plugins:['jsx']} → must succeed.
    Brace-counting alone cannot catch mis-nesting; the Babel parse can.

---

## SECTION B — WHICH FILES ARE CANONICAL NOW

SUPERSEDED by this handoff's companion files (use the v8.65 copies):
  • 02-phase2-lld/visibleau-7layer-lld.md        → v8.65 (was v8.64)
  • 03-prototypes/visibleau-prototype-phase2.jsx → FIX 14 (was FIX 13)

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

## SECTION C — WHAT HAPPENED THIS PASS (pass 46, v8.65)

v8.65 — RUNTIME-ASSEMBLED CSS-VALUE VALIDITY angle (pass 46; independent cross-review)
  Context: v8.62 CSS-01 fixed the six STATIC `var(--token)NN` borders and added a static
  invariant grep. No pass had traced style values ASSEMBLED AT RUNTIME from JS fixtures.
  The hex-alpha suffix patterns (`${color}30`, `step.color + '12'`) are only valid when
  the JS variable holds a HEX literal — but every feeding fixture holds a 'var(--token)'
  STRING: statusColor (HealthCheck), q.color (Citation quadrants), presenceStyle (Trust
  presence), step.color (Autopilot), plus one inline ternary (Trust incidents). Almost
  certainly a v8.60 regression: the light-theme pass tokenized previously-hex fixture
  values without noticing the alpha-concat pattern they feed. At runtime the browser
  received values like `1px solid var(--warning)` + `30` appended — invalid CSS — and
  silently dropped each declaration.
  [ATTRIBUTION CORRECTION (r2): re-verified against the ORIGINAL v8.55 bundle — the
  var()-string fixtures and the alpha-suffix patterns BOTH existed at v8.55 (statusColor
  already held 'var(--health-great)' etc., feeding the ${color}30 borders at v8.55 lines
  1088/1157). The bug was original to v8.55, not introduced by the v8.60 light-theme
  pass. RT-01's fix is unaffected; only the origin attribution changes.]

  • RT-01 [HIGH, visual] Nine color-mix insertions across eight sites, at equivalent
    opacities (hex 12→7%, 18→9%, 20→13%, 30→19%, 40→25%, 60→38%) — same recipe as CSS-01:
      1. HealthCheck dimension-card borders            (was ${color}30)
      2. Active citation-quadrant background           (was ${q.color}18)
      3. Active citation-quadrant border               (was ${q.color}40)
      4. Trust incident-card borders                   (was ternary-var + 30)
      5. Trust presence icon-circle backgrounds        (was ${color}18)
      6. Autopilot pending-step dashed ring            (was ${step.color}60)
      7. Autopilot step pill background                (was step.color + '20')
      8. Autopilot step detail-box background + border (was + '12' and ${step.color}30)
    The unsuffixed `2px solid ${step.color}` branch (whole var() token) was already valid
    and is unchanged.

  • Verified clean this pass (independent checks beyond the standard greps):
    Babel parse OK · React keys present on all 21 .map renders · GAPs 1–16 contiguous ·
    table manifest 1–38 contiguous, #21 = brand_entity_scores ALTER · 25/25 Inngest ·
    all v8.64 ARIA fixes present and well-formed · all six static CSS-01 color-mix
    borders intact.

For passes 43–45 history (CSS-01 static fixes, CT-01..CT-04 prop/data contracts,
AR-01..AR-05 ARIA) see the LLD changelog — entries are immutable and complete.

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
  • ARIA conventions follow Phase 1 BK4: aria-current on nav, aria-label on score bars.
    Icon-only buttons ALWAYS carry aria-label (entity-specific via template literal where a
    row identifies the target). Tab bars are role="tablist" with role="tab" +
    aria-selected children. contentEditable editors are role="textbox" with names.
  • GLOBAL BUILD RULES (FIX 13): decorative lucide icons inside text-labeled controls
    render aria-hidden in the build; clickable DIV mocks ship as button/link elements with
    accessible names; complete the APG tabs pattern wherever role="tablist" appears;
    bespoke score bars follow the BK4 aria-label pattern.
  • IntelCard: optional `unit` prop replaces the /100 suffix; delta === 0 renders the
    NEUTRAL "±0" pill; Entity display = ROUND(score_of_10 × 10); Hallucination Risk =
    LEAST(100, 15c+5w+1i) over open incidents; Consensus card = AVG(consistency_score)

CHANGED this pass (supersedes v8.64 wording):
  • Faint accent fills/borders in INLINE STYLE have exactly ONE valid mechanism now:
    color-mix(in srgb, <var-token-or-js-var> N%, transparent). The former "second valid
    mechanism" (${jsVar}NN hex-alpha template literals / + 'NN' concats) is RETIRED —
    it was only ever valid for hex-literal feeds, and every live feed is a var() token.
    RULE GOING FORWARD: never append a hex-alpha suffix to a JS style variable unless you
    have just verified the variable holds a literal '#rrggbb' string; prefer color-mix
    unconditionally.
  • The v8.64 "${x}30 grep returns 3 (2 live valid + 1 comment)" invariant is RETIRED →
    now returns 1 (FIX 11 comment only, zero live).

---

## SECTION E — AUDIT ANGLES ALREADY COVERED (pick something NOT on this list)

From 46 passes: route params; lucide import hygiene; text corruption; data retention; index
coverage; UPSERT idempotency; RLS WITH CHECK; webhook/Inngest event chains; serve() counts;
cron collisions; Drizzle relations; FK types; ON DELETE behaviour; status machines; type
contracts; tier gates; market codes; seed ordering; metric units (v8.56); named-artifact
referential integrity / nav reachability (v8.57); categorical value-sets vs column type
(v8.58); numeric fixture arithmetic (v8.59); dark+light WCAG contrast + invalid CSS property
NAMES (v8.60); keyboard focus + dark elevation (v8.61); inline-style CSS property-VALUE
validity, static form (v8.62); component call-site prop/data contracts + scale-vs-column
binding (v8.63); ARIA accessible names + control semantics per BK4 (v8.64); RUNTIME-assembled
CSS-value validity — JS fixture feeds traced to every template-literal/concat style value
(v8.65).

Remaining angles: reduced-motion support (infinite gradient-shift/pulse-ring animations have
no prefers-reduced-motion guard — small, real), microcopy consistency, RTL (low value for
AU-first). ONE remaining SUBSTANTIVE angle: RESPONSIVE BREAKPOINTS — the prototype's grids
are fixed (grid-cols-3/4/5, no sm:/md: variants) while mobile-responsive is a painpoints
checklist requirement and a non-negotiable; this is large-blast-radius work better treated
as a dedicated design task than an audit pass. Do not manufacture findings; a clean pass is
a valid result.

CROSS-REVIEW LESSON (pass 46, worth internalizing): invariant greps guard the FORM they
were written against, not the FAILURE CLASS. CSS-01's static grep was green while the same
bug shipped via runtime assembly. When auditing, trace VALUES to their SOURCES (fixtures,
props, maps), not just patterns in the text.

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
13. RETIRED in v8.65 — the former item declaring ${color}30 / ${step.color}30 /
    step.color + '12'/'20' VALID. They fed var() strings and were live bugs; all are now
    color-mix (RT-01). Kept here as a numbered placeholder so item numbering in older
    handoffs still cross-references. The `2px solid ${step.color}` UNSUFFIXED usage
    remains valid — whole var() token, no alpha suffix.
14. Fix-note/changelog DESCRIPTIONS quote past corruption literals (FIX-9 backdrop name,
    "Cputom", the LLD's var(--token)30 placeholder, FIX 11's ${jsVar}30, FIX 14's
    suffix examples). Comment-only; exclude comments when grepping for live regressions.
15. MetricRow + EmptyState are defined-but-uninstantiated shared-library FORWARD SPEC
    (implementation note 6; mock data is non-empty everywhere). Not dead code.
16. IntelCard `loading` never passed true = the specified loading state; LayerBadge
    size='md' and Phase2TopBar `actions` are optional variants by design.
17. ARIA raw grep counts exceed live counts because the FIX 13 note mentions the
    attributes (see Section A breakdown). Bespoke score bars (HealthCheck/Retrieval/
    Trust/SoV) are deliberately covered by the FIX 13 global BK4 rule, not per-instance
    attributes — do not add 20+ duplicate labels to the mock.
18. NEW: AR-02/AR-03/AR-04 fix IDs appear ONLY in the LLD changelog, not as verbatim
    strings in the prototype (the prototype's FIX 13 note says "AR-01..AR-05"). A zero
    grep count for those IDs in the JSX is NOT a regression; verify the underlying
    attributes instead (tablist/textbox/nav aria-label).

---

## SECTION G — METHODOLOGY (unchanged; follow it exactly)

1. AUDIT-BEFORE-FIX: read the relevant docs fully; pick a FRESH angle (Section E).
2. ASSESS THE AUTHORITATIVE DOCUMENT before every fix:
   LLD = data shapes / enums / business rules / tier entitlements / metric definitions /
   data derivations. Prototype = UI/UX layout, navigation, visual tokens, interaction
   styling, display transforms, ARIA. Phase 1 sprints = built behaviour.
3. VERIFY-BEFORE-CLAIM: grep canonical sources; never assert from memory.
4. VERIFY-AFTER-EDIT: re-balance braces/parens (JSX AND the CSS template block), re-check
   invariants, regression-grep that all prior fix IDs are still present (subject to
   Section F item 18), and — new this pass — run a Babel parse on the JSX.
5. VERSION DISCIPLINE: every pass bumps the LLD version + adds a changelog entry naming the
   angle, each fix ID, the assessment, and the CLEAN list. Prototype edits add a FIX N note.
6. Changelog entries are immutable history — never rewrite old entries.
7. Deliver outputs as files + zip; remind Sri that container outputs do NOT persist across chats.

---

## SECTION H — OPEN ITEMS / SENSIBLE NEXT MOVES

1. fix-audit-zero-engines.md (06-bug-fix-prompts/) — OPEN live Phase 1 bug.
2. Phase 2 sprint-prompt design — the LLD is hardened (46 passes, including one
   independent cross-review); prototypes are fully specified (Figma-style, both themes,
   focus + names + roles, valid CSS — static AND runtime — and documented data bindings).
   THE natural next major work item.
3. Responsive breakpoints for the Phase 2 prototype — the one remaining substantive design
   gap (fixed grids, no sm:/md: variants); treat as a dedicated task, not an audit pass.
4. Optional: refresh CLAUDE.md/Foundations to retire the Clerk text (close drift C-04).
5. Audit fatigue: 46 passes in, including a fresh-eyes cross-review that found one real
   regression. Default to BUILDING next unless Sri asks for another pass.

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
