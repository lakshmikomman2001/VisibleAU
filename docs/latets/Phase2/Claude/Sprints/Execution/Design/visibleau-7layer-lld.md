# VisibleAU — 7-Layer Platform LLD
# Low-Level Design for Phase 2+ (built on top of Phase 1 Sprints 1–12)
# Version: 8.68 | Date: June 2026
# Author: Sri + Claude
#
# CHANGELOG
# v8.68 — Forty-ninth-pass: CONSOLIDATED HYGIENE pass (LLD + PROTOTYPE) — folds six items
#          surfaced by the Phase 2 sprint-prompt review series (S7/S8/S9 + the Gate 3 cross-prompt
#          audit). FIRST PROTOTYPE CHANGE SINCE FIX 15. All edits verified against canon first;
#          no table/GAP/serve() count changed (37 tables, 16 GAPs, serve()=25/25 all intact).
#   1. S7b-02 [LLD] — run-comparison-prompts.ts given an SN-01-style step.run structure (per
#      competitor×engine LLM call + persist each in its own deterministically-named step) so an
#      Inngest retry replays only the failed step instead of re-running all comparison LLM calls.
#      Same class as run-journey's SN-01 / the S7b-01 persist step. (~run-comparison-prompts spec.)
#   2. S8-01 [LLD] — the hallucination/acknowledged fanout PRODUCER emit added at SOURCE (the PATCH
#      /api/brands/[id]/hallucinations/[id] route spec), so the WH-01 fanout event is deliverable
#      (it was documented only in the consumer map). Its companion visibility/trend-updated emit
#      already lived inline in aggregate-visibility-trend.ts's spec; the pair is now complete.
#   3. S8b-01 [LLD] — assertBrandAccess(user, brandId) FORMALISED as the canonical brand-isolation
#      mechanism in the 3-layer permission DESIGN NOTE: org-scoped RLS does NOT enforce
#      org_members.brand_access, so an explicit gate is required on every brand-scoped route +
#      action (incl the Sprint 9 Autopilot approve path). Distinct from canPerform (action
#      predicate). Sprint 8 builds it + retrofits S1-S7; Sprint 9 relies on it.
#   4. S8b-02 [LLD] — RBAC permission matrix gains the role-ceiling rows: "Change a member's role"
#      + "Remove a member" (owner/admin), and "Assign/revoke OWNER role" (OWNER ONLY); admin may
#      not grant/revoke owner nor remove/demote an owner (403). Enforced in the handlers.
#   5. S8b-03 [LLD] — audit_trail action enum gains 'member_role_changed' + 'member_removed'
#      (resource_type 'org_member' added) so membership changes are auditable (AT-01 region).
#   6. S9-02 [PROTOTYPE] — HealthCheck reconciled to the LLD's CROSS-LAYER dimensions: AI Sentiment
#      (scoreSentimentNumeric) / AI Presence (scoreFrequency) / Site Readiness
#      (technical_audits.scoreComposite) / Local Authority (agent_readiness local_ai_trust_score,
#      skip for SaaS) + the #1 action as the 5th section; grid 5→4 cols (the action is its own
#      card). Replaces the raw audit multidim (Frequency/Position/Sentiment/Context/Accuracy) the
#      prototype previously showed — the LLD synthesis is the trial→paid conversion surface.
#   (G3-01 — the explainability-contract fix — was applied in the S3/S5 PROMPTS, v1.4 each; an
#    optional LLD note that ExplainabilityService is created in S3 was deemed unnecessary here.)
#   (OQ-1 local_seo_results remains deferred — no DDL until a dedicated local-SEO pass; S6's
#    local_ai_trust_score stays NULL by design, S6b-02.)
#
# v8.67 — Forty-eighth-pass: CONSOLIDATED HYGIENE + SECURITY pass (folds five items surfaced
#          by the Sprint 4/5/6 prompt reviews into one coordinated canon edit). No schema
#          restructuring, no new tables/GAPs/functions — DDL correctness, a severity-enum
#          wording fix, an enum-tier reconciliation, and two public-endpoint security hardenings.
#          S4-02 [DDL correctness]: generated_reports had a stray-comma typo — missing comma
#                after created_at's now(), trailing comma after updated_at's now() (updated_at is
#                the final column). Fixed to valid SQL (comma after created_at; none after updated_at).
#          S5-02 [severity enum]: the WH-01b webhook spec said emit for severity='critical'|'high',
#                but hallucination_incidents.severity is the 3-value enum critical|warning|info —
#                there is no 'high'. Corrected both live lines (and the changelog ref at the WH-01
#                header) to 'critical'|'warning' (the two non-info severities), matching the
#                email-alert path in the same detect-hallucinations function.
#          S6-02 [enum-tier reconciliation]: citation_probability_score's freshness contribution
#                used a 3-tier current/ageing/stale that did not cover the freshness_risk column's
#                4-tier enum fresh/aging/at_risk/stale (at_risk had no contribution). Reconciled to
#                the 4-tier column names: fresh +0.10, aging +0.05, at_risk +0.025, stale 0.00.
#          SEC-A [public-endpoint hardening — Visit API]: the POST /api/visit handler validated the
#                posted url only as z.string().url(), not against the brand's domain. Since the
#                brandToken is necessarily public (ships in the browser snippet), a token holder
#                could post visits for arbitrary URLs and pollute crawler_visit_logs. Added a step:
#                validate new URL(body.url).host === brand.domain (or a known subdomain) → 422/drop
#                otherwise; only ingest the brand's own pages.
#          SEC-B [public-endpoint hardening — Visit API]: the handler did brand-token DB lookup
#                BEFORE rate-limiting, and the limit was per-token only — so a flood of INVALID
#                tokens never hit the limit yet each still cost a DB SELECT (un-throttled
#                DB-amplification on an unauthenticated endpoint). Reordered/added: (1) an IP-based
#                throttle FIRST, before any DB work (→429); (2) a short-TTL negative cache for
#                unknown tokens (return 401 without a SELECT on repeat); then the brand lookup, the
#                SEC-A domain check, and the per-token limit for valid traffic. Steps renumbered a–h.
#          INVARIANTS unchanged: 37 tables, 16 GAPs, serve()=25/25; the RM-01/FIX-15 reduced-motion
#                reset + 'ATTRIBUTION CORRECTION' marker intact; prototype unchanged this pass.
#          Sprint prompts: §0.3 version gate re-pinned to accept v8.67 (8.66/8.65 still valid —
#                v8.67 touched only these five spots, none of which a prompt's core spec contradicts;
#                the S4/S5/S6 prompts already carry the corrected behaviour from their own reviews).
#
# v8.66 — Forty-seventh-pass audit APPLIED (FRESH ANGLE: MOTION SAFETY — prefers-reduced-
#          motion honoring; WCAG 2.2.2 Pause/Stop/Hide [Level A] + 2.3.3 Animation from
#          Interactions). The one a11y criterion the prior 46 passes never touched. This is
#          the coordinated v8.66 batch: the RM-01 finding (previously staged) is now applied,
#          and all sprint prompts' §0.3 version gate is re-pinned to accept v8.66.
#          PROTOTYPE FIX (RM-01) [MODERATE, prototype-side → FIX 15]: the prototype had ZERO
#                prefers-reduced-motion guards across 4 @keyframes (pulse-ring, gradient-shift,
#                float-up, score-fill) + Tailwind animate-pulse. The infinite, auto-playing
#                gradient-shift banners (autopilot/health surfaces, set inline) + pulse-ring
#                are the Level-A concern. Added a global @media (prefers-reduced-motion: reduce)
#                reset to Phase2Styles (universal !important, so it overrides even inline
#                animation: props). DARK/LIGHT themes + all prior fixes unchanged.
#                Assessment: motion safety is a PROTOTYPE/UI + build concern (same class the
#                LLD scoped out for ARIA in v8.64) — fix is prototype-side; the LLD records
#                only this changelog entry + the build rule.
#          BUILD RULE (recorded, applies to all future sprint UI / §6U): every animated
#                surface honors prefers-reduced-motion; the global reset lives in the Phase 2
#                base stylesheet (already carried into the Sprint 2 prompt §6U.0).
#          RM-02 (forward build rule, NOT a prototype edit — the mock fires no async
#                transitions): wrap async status changes (audit running→complete, draft
#                generating→ready, toasts) in aria-live="polite"/role="status", set aria-busy
#                on loading-skeleton regions. Recorded for the build; no prototype change.
#          ALSO IN THIS BATCH (governance, outside the LLD/prototype): the S1-01 marker is
#                reconciled — r2's "ATTRIBUTION CORRECTION" is the single canonical marker
#                (the sprint prompts already accept it via the either-marker regex); responsive
#                breakpoints remain a dedicated design task (tracked, not an audit fix).
#          INVARIANTS unchanged: 37 tables, 16 GAPs, serve()=25/25; prototype braces/parens
#                balanced; the v8.65 RT-01/color-mix state intact.
#
# v8.65 — Forty-sixth-pass audit (FRESH ANGLE: RUNTIME-ASSEMBLED CSS-value validity —
#          independent cross-review by a different Claude session. v8.62 CSS-01 fixed the
#          six STATIC invalid var(--token)+hex-alpha borders, and its invariant grep
#          guards the static form. No pass had checked values ASSEMBLED AT RUNTIME from
#          JS fixtures: template-literal and string-concat hex-alpha suffixes are only
#          valid when the JS variable holds a HEX literal — but the feeding fixtures hold
#          'var(--token)' strings (statusColor, q.color, presenceStyle, step.color, plus
#          one inline ternary), almost certainly a regression from the v8.60 light-theme
#          tokenization of previously-hex fixture values. All fixes PROTOTYPE-side.)
#          [ATTRIBUTION CORRECTION — review by the originating session, June 2026,
#          re-verified in the registration session against the ORIGINAL v8.55 bundle
#          (prototype FIX 4): the alpha-suffix patterns AND the var()-string fixtures
#          BOTH already existed at v8.55 — e.g. v8.55 line 1088 statusColor =
#          'var(--health-great)' feeding v8.55 line 1157 "1px solid ${color}30". The bug
#          was ORIGINAL to v8.55, not introduced by v8.60; the v8.60 pass re-tinted token
#          VALUES but did not create the concat pattern or tokenize previously-hex
#          fixtures. RT-01's fix stands unchanged; only this origin attribution is
#          corrected.]
#          Read: Phase 2 prototype (every template-literal/concat style value traced to its
#          fixture), LLD v8.62 CSS-01 entry + v8.64 handoff Section F.13/Section A claims.
#
#          PROTOTYPE FIX (RT-01) [HIGH, visual] — eight sites produced invalid CSS at
#                runtime (e.g. border "1px solid " + a var() token + "30"); the browser
#                drops the whole declaration, so the styling silently never rendered:
#                HealthCheck dimension-card borders (statusColor); active citation-quadrant
#                background + border (q.color); Trust hallucination incident-card borders
#                (inline ternary on var(--warning)/var(--danger)); Trust presence
#                icon-circle backgrounds (presenceStyle); Autopilot pending-step dashed
#                ring, step pill background, and step detail-box background + border
#                (step.color). Nine color-mix insertions at equivalent opacities
#                (hex 12→7%, 18→9%, 20→13%, 30→19%, 40→25%, 60→38%) — same recipe as
#                CSS-01. The unsuffixed `2px solid ${step.color}` branch was already valid
#                (var() token used whole) and is unchanged.
#
#          SUPERSEDED CLAIMS (handoff bookkeeping, not changelog rewrites):
#            • v8.64 handoff Section F.13 declared the ${color}30 / ${step.color}30 borders
#              and step.color + '12'/'20' concats VALID — true only for hex-literal feeds;
#              these fed var() strings and were live bugs. Retired by RT-01.
#            • v8.64 handoff Section A invariant "${x}30 grep returns 3 (TWO live valid +
#              ONE comment)" — now returns 1 (the FIX 11 comment only); zero live.
#
#          CLEAN (verified, NOT changed):
#            • All six static CSS-01 color-mix borders intact ✓
#            • Babel parse (sourceType module, jsx plugin): prototype syntactically valid ✓
#            • React list keys present on every .map render (6 initially flagged were
#              false positives — keys sit beyond a 4-line scan window) ✓
#            • GAPs exactly 1–16, no holes ✓ · table manifest 1–38 contiguous with
#              #21 = brand_entity_scores Phase 1 ALTER ✓ · Inngest 25 unique function
#              files and 25 serve() imports ✓
#            • v8.64 ARIA fixes (AR-01..AR-05) all present and well-formed ✓
#
#          INVARIANTS (updated where RT-01 changes raw counts): 37 Phase 2 tables, 16 GAPs,
#            serve()=25/25 unchanged; prototype JSX + CSS braces/parens balanced —
#            braces 1757/1757, parens 1259/1259 (RT-01 + its header note add 2 brace pairs
#            and 24 paren pairs vs v8.64); template-literal backticks even (58).
#
# v8.64 — Forty-fifth-pass audit (FRESH ANGLE: ARIA accessible names + interactive-control
#          semantics — WCAG 2.2 SC 4.1.2 Name/Role/Value + 1.3.1. v8.61 FOC-01 gave keyboard
#          users a visible focus ring; no pass had checked whether the controls that ring
#          lands on expose a NAME or correct ROLE to assistive tech. All fixes are
#          PROTOTYPE-side: the v8.38 CLEAN verdict correctly scoped ARIA out of the LLD
#          ("sprint prompt concern, not LLD scope") and named the Phase 1 BK4 patterns
#          (aria-current, aria-label score bars) as the precedent — the Phase 2 prototype
#          had carried only aria-current. Pre-fix ARIA inventory across 3,338 lines: ONE
#          attribute.)
#          Read: Phase 2 prototype (full interactive-control sweep: 50+ buttons, 2 tab bars,
#          2 contenteditable editors, nav landmark), LLD v8.63 (BK4 precedent at the v8.38
#          entry), Phase 1 conventions.
#
#          PROTOTYPE FIX (AR-01) [HIGH, a11y Level A] — NINE icon-only buttons had no
#                accessible name (screen readers announce just "button"): TopBar Bell
#                (Notifications) + Moon (Toggle theme); sidebar footer SlidersHorizontal
#                (Account menu); WorkflowHub per-task Sparkles (Generate draft for {task});
#                ContentDraftEditor ChevronLeft (Back to Workflow); ReportsList Download +
#                Share2 (per-report, label includes the report title); TeamManagement Edit3 +
#                Trash2 (per-member, label includes the member name). All nine gained
#                aria-label — template-literal labels where the row entity disambiguates.
#
#          PROTOTYPE FIX (AR-02) [MODERATE] — both tab bars were bare button rows:
#                BrandIntelTabs and the WorkflowHub Tasks/Drafts/Runs bar gained
#                role="tablist" + aria-label ("Intelligence layers" / "Workflow views");
#                each tab button gained role="tab" + aria-selected, and locked
#                BrandIntelTabs tabs also set aria-disabled. The full APG tabs pattern
#                (tabpanel ids + arrow-key navigation) is a build behaviour — recorded as a
#                FIX 13 global build rule.
#
#          PROTOTYPE FIX (AR-03) [MODERATE] — the two contentEditable editors (draft title,
#                draft body) were unnamed editable regions: gained role="textbox" +
#                aria-label ("Draft title" / "Draft body"), body adds aria-multiline="true".
#                The v8.61 verification stands: their inline outline:none does not suppress
#                the focus ring (ring is box-shadow).
#
#          PROTOTYPE FIX (AR-04) [LOW] — the sidebar <nav> landmark gained
#                aria-label="Primary" (unlabeled landmarks read poorly in rotor/landmark
#                navigation even when there is only one nav).
#
#          PROTOTYPE FIX (AR-05) [LOW-MOD, BK4 parity] — IntelCard's score bar now carries
#                role="img" + aria-label "{label}: {value} of {max}" per the Phase 1 BK4
#                convention (aria-label score bars). One shared-component edit covers every
#                IntelCard instance. Bespoke bars (HealthCheck dimensions, RetrievalHub agent
#                dims, TrustHub minis, SoV rows) are covered by the FIX 13 global build rule
#                rather than 20+ per-instance mock edits — their values are also adjacent
#                visible text.
#
#          CLEAN (verified, NOT changed):
#            • Sidebar aria-current="page" was already correct (carried from Phase 1) ✓
#            • Every text-labeled control passes 4.1.2 as-is (TierGate upgrade, EmptyState
#              CTA, engine pills, period/competitor selectors, Generate report, Invite,
#              Resend/Cancel, Run journey, Investigate, dev-nav screen buttons) ✓
#            • Decorative lucide icons inside text-labeled controls: FIX 13 global build
#              rule (render aria-hidden in the build) — not 80 per-icon prototype edits ✓
#            • Clickable row/card DIVs without onClick are mock affordances; FIX 13 records
#              the build rule (ship as button/link elements with accessible names) ✓
#            • v8.38's "ARIA is sprint-prompt concern, not LLD scope" verdict stands — that
#              is exactly why every fix this pass is prototype-side; changelog immutability
#              respected ✓
#
#          INVARIANTS unchanged: 37 Phase 2 tables, 16 GAPs, serve()=25/25; prototype JSX +
#            CSS braces/parens balanced (1755/1755, 1235/1235); template-literal backticks
#            even (54).
#
# v8.63 — Forty-fourth-pass audit (FRESH ANGLE: component CALL-SITE PROP/DATA CONTRACT
#          integrity — does every prop passed at a call site exist on the component's
#          signature, does the component correctly render every value its call sites
#          actually pass, and can the LLD's data actually produce the value/scale each
#          call site supplies? v8.58 diffed rendered STRING literals against column
#          value-sets; v8.59 checked fixture ARITHMETIC; no pass had diffed call-site
#          props against component signatures or value scales against source columns.)
#          Read: Phase 2 prototype (full component-by-component call-site sweep), LLD v8.62
#          (table defs for every TrustHub card source), Phase 1 prototype conventions.
#
#          PROTOTYPE FIX (CT-01) [MODERATE, component contract] — IntelCard had no `unit`
#                prop, but its VisibilityHub call site passes unit="%" (Share of Voice) AND
#                the LLD's own SoV spec (live spec + v8.56 MS-02 changelog) cites
#                'IntelCard unit="%"' as the percentage convention. The prop was silently
#                dropped; with max defaulting to 100 the card rendered "34/100" — a
#                PERCENTAGE displayed as a score out of 100.
#                → ASSESSMENT: LLD owns the metric semantics (brand_share is a percentage,
#                  MS-01/MS-02) and its spec already assumes the prop; the component was the
#                  missing side. Prototype is the document to fix.
#                → FIX (prototype): IntelCard signature gains `unit`; when set it renders
#                  {value}{unit} (text-[14px] ml-0.5 text-tertiary) and SUPPRESSES the "/100"
#                  suffix; the score bar still fills value/max. Usage comment updated with a
#                  unit example. Share of Voice now reads "34%".
#
#          PROTOTYPE FIX (CT-02) [LOW-MODERATE, component contract] — IntelCard's trend badge
#                was binary (delta > 0 = success/up, ELSE danger/down) but TrustHub passes
#                delta={0} (Consensus Score): "no change" rendered as a RED TrendingDown "0".
#                → FIX (prototype): explicit zero-delta neutral state — accent-muted pill,
#                  text-secondary, label "±0", no trend icon. Positive/negative paths
#                  unchanged (Topical Coverage's -2 verified rendering danger/down correctly).
#
#          PROTOTYPE FIX (CT-03) [MODERATE, data binding + fixture] — TrustHub's 4 /100 score
#                cards had NO documented bindings, and two could not bind cleanly:
#                  • Entity Score 58/100 — but brand_entity_scores.score_of_10 (0–10 scale)
#                    IS the canonical entity score (D-01/BE-01; the Phase 1 prototype shows
#                    "7.2 / 10"). Without a documented transform a dev would either add the
#                    duplicate column D-01 removed or render the raw /10 against "/100".
#                  • Hallucination Risk 23/100 — no source column exists ANYWHERE (and the
#                    same screen's incident feed shows 1 critical + 1 warning open).
#                → FIX (prototype): DATA-BINDING NOTE added on the card block (EV-01 pattern):
#                  Entity = ROUND(score_of_10 × 10) pure display transform; Hallucination
#                  Risk = the CT-04 derivation below, and the fixture corrected 23 → 20 so the
#                  card matches its own screen's feed (15+5 — v8.59 intra-screen fidelity
#                  standard); LinkedIn = linkedin_presence_audits.presence_score (/100 direct,
#                  verified at its CREATE TABLE); Consensus = ROUND(AVG(consistency_score))
#                  across the brand's brand_consensus_checks rows (consistency_score is /100
#                  PER SOURCE, UNIQUE(brand_id, source_type)), desc count = COUNT of rows.
#
#          LLD FIX (CT-04) [MODERATE, documentation gap] — the Hallucination Risk metric had
#                no derivation anywhere in the LLD (grep "Hallucination Risk" / "risk_score" =
#                zero spec hits). A dev building TR-1 could not compute it and might add a
#                risk column.
#                → ASSESSMENT: data derivation is LLD-owned — same class as CM-01 (derived
#                  report status documented on generated_reports) and Q-03 (authored the
#                  missing presence_score formula). LLD is the document to fix.
#                → FIX (LLD): canonical read-time derivation documented on
#                  hallucination_incidents: risk = LEAST(100, 15×open_critical + 5×open_warning
#                  + 1×open_info), where open = is_false_positive = false (is_acknowledged does
#                  NOT close an incident — acknowledging ≠ corrected). Computed in
#                  lib/trust/hallucination-risk.ts. No risk column added — flags/timestamps are
#                  the source of truth (CM-01 pattern).
#
#          CLEAN this pass (full call-site sweep, verified, NOT changed):
#            • Every other prop passed at every call site is declared by its component
#              (LayerBadge, SectionHeader, StatusBadge, PriorityBadge, ConfidenceBadge,
#              TierGate, BrandIntelTabs, Phase2Sidebar, Phase2TopBar, all screen components) ✓
#            • IntelCard `loading` prop never passed true — that path IS the specified
#              loading-state spec (painpoints checklist), not dead code ✓
#            • MetricRow + EmptyState are defined with full usage specs but never instantiated:
#              deliberate shared-library forward spec (implementation note 6 names EmptyState;
#              the demo's mock data is non-empty everywhere so empty states never render) —
#              do NOT flag as dead or delete ✓
#            • LayerBadge size='md' variant and Phase2TopBar `actions` slot: optional-unused
#              by design ✓
#            • LinkedIn Presence 72 binds direct to presence_score INTEGER /100 ✓
#
#          INVARIANTS unchanged: 37 Phase 2 tables, 16 GAPs, serve()=25/25; prototype JSX +
#            CSS braces/parens balanced; template-literal backticks even.
#
# v8.62 — Forty-third-pass audit (FRESH ANGLE: inline-style CSS-VALUE VALIDITY — are the
#          string values passed to React style={{...}} props actually parseable CSS? Prior
#          passes checked corrupted PROPERTY NAMES (v8.60 THM-01 backdropFilter) and colour
#          CONTRAST values (v8.60 THM-03), but no pass had checked whether the property VALUES
#          themselves are well-formed CSS the browser will accept.)
#          Read: Phase 2 prototype (all 28 components / 14 screens end-to-end), LLD v8.61,
#          Phase 1 theme tokens. The single fix is PROTOTYPE-side.
#
#          PROTOTYPE FIX (CSS-01) [MODERATE, both themes] — invalid border value: 6 inline
#                styles wrote `border: '1px solid var(--token)30'` — a CSS custom-property
#                reference with two hex digits appended directly to it. CSS has NO syntax for
#                suffixing an alpha pair onto a var() reference, so the `1px solid var(--token)30`
#                shorthand is unparseable and the browser DROPS THE ENTIRE border declaration →
#                the element renders with no border in EITHER theme. Affected: VisibilityHub's
#                Citation-Failure CTA + Competitive-Benchmark CTA cards (var(--layer-visibility)),
#                RetrievalHub's llms.txt + MCP + Entity-Home status cards (var(--danger)×2,
#                var(--warning)), and ReportsList's cover thumbnail (var(--layer-comm)).
#                → ASSESSMENT: the LLD defines no inline styles — CSS string values are purely the
#                  prototype's UI/visual domain. The intent is unambiguous (a faint accent-coloured
#                  border, ~0x30≈18.8% alpha, sitting over the 12% -soft fill). Prototype is the
#                  document to fix; no LLD/schema change.
#                → FIX (prototype): each replaced with
#                  `color-mix(in srgb, var(--token) 19%, transparent)` — valid CSS that resolves a
#                  var() colour with ~the same alpha, and remains theme-aware automatically (the
#                  layer accent tokens already flip under [data-theme="light"], THM-03). 19% sits
#                  just above the 12% soft background so the border reads as a subtle outline rather
#                  than dissolving into the fill.
#                → CLEAN (verified, NOT changed): the two `${jsVar}30` template-literal borders
#                  (HealthCheck dimension cards `${color}30`; AutopilotLoop current-step
#                  `${step.color}30`) are CORRECT — the JS expression resolves to a real hex string
#                  first, yielding valid 8-digit hex+alpha — and were left untouched. Same for
#                  `step.color + '12'` / `step.color + '20'` (string concat of a resolved hex).
#
#          CLEAN this pass (other inline-value families spot-checked, all valid):
#            • rgba(...) literals (glass/glow/overlay tokens, white-on-gradient text) — well-formed ✓
#            • gridTemplateColumns track strings ('80px 1fr 120px ...') — valid ✓
#            • backdropFilter + WebkitBackdropFilter (TierGate, dev-nav) — correct since v8.60 ✓
#            • animation shorthand ('gradient-shift 4s ease infinite') — valid ✓
#            • all `${color}NN` / `color + 'NN'` forms use a RESOLVED JS colour, not a var() — valid ✓
#          INVARIANTS unchanged: 37 Phase 2 tables, 16 GAPs, serve()=25/25; prototype JSX braces
#            1725/1725, parens 1174/1174 (the 6 color-mix() calls add 6 balanced pairs vs v8.61's
#            1168), template-literal backticks even (34).
#
# v8.61 — Forty-second-pass audit (FRESH ANGLE: keyboard focus-state visibility + interactive
#          affordance/elevation across BOTH themes. v8.60 covered colour contrast + invalid props;
#          this is the first pass to check focus indicators and dark-surface depth.)
#          Read: Phase 1 theme tokens, LLD v8.60, Phase 2 prototype. All fixes prototype-side.
#
#          PROTOTYPE FIX (FOC-01) [HIGH, a11y] — NO keyboard focus indicator anywhere. The
#                prototype had zero :focus-visible rules and zero focus: utilities across 50 buttons
#                + 18 onClick handlers; the only focus-related style was `outline:none`. Keyboard /
#                assistive-tech users had no visible focus — a WCAG 2.4.7 failure in BOTH themes.
#                The Phase 1 --border-focus tokens existed but were never applied.
#                → ASSESSMENT: prototype owns interaction styling; this is a build-spec gap, fix in
#                  the prototype.
#                → FIX (prototype): added a global :focus-visible ring (a:button:[role=button]:
#                  inputs:textarea:[contenteditable]:[tabindex]) using a new --focus-ring token
#                  (2px base halo + accent-blue core). Verified WCAG 1.4.11 non-text contrast: dark
#                  ring 5.41, light ring 4.95 (both ≥3). :focus-visible (not :focus) so it shows for
#                  keyboard nav, not mouse clicks.
#
#          PROTOTYPE FIX (ELV-01) [MODERATE, both-theme depth] — elevation only worked in light
#                mode. .card-lift:hover and Phase-1 --shadow-* used rgba(0,0,0,…) black shadows,
#                which are INVISIBLE on the dark theme's #09090b surfaces, so cards had no depth in
#                dark mode.
#                → FIX (prototype): added theme-aware --elevation-rest / --elevation-hover tokens.
#                  Dark = deeper drop shadow + 1px inset top-highlight (the Linear/Vercel technique
#                  for raised dark surfaces); light = classic soft black drop shadows. .card-lift now
#                  consumes the tokens, so depth reads correctly in BOTH themes. This is also the
#                  "rich look / best CSS effects" upgrade requested — done via tokens, not hardcoding.
#
#          CLEAN (verified, NOT changed): the contentEditable draft editors' inline `outline:none`
#            does not suppress the new ring (ring is box-shadow, not outline). No font changes (the
#            v8.60 research already confirmed Geist/Inter is the 2026 standard). Dark-theme look from
#            v8.60 preserved; light accents still ≥4.5 AA.
#
#          INVARIANTS unchanged: 37 Phase 2 tables, 16 GAPs, serve()=25/25; JSX + CSS braces
#            balanced; template-literal backticks even.
#
# v8.60 — Forty-first-pass audit (FRESH ANGLE: dark + light THEME correctness, with WCAG
#          contrast verification; plus evidence-based typographic polish. First pass to
#          actually test the prototype under BOTH [data-theme] values, not just dark.)
#          Read: Phase 1 theme tokens (dark+light [data-theme] blocks), LLD v8.59, Phase 2
#          prototype. All fixes are PROTOTYPE-side (theme/styling is the prototype's domain).
#
#          PROTOTYPE FIX (THM-01) [HIGH] — invalid CSS property in TWO places: the modal/
#                TierGate overlay (line ~463) and the dev-nav overlay (line ~3110) used
#                "backdropSlidersHorizontal" (a lucide icon name mis-substituted by some earlier
#                automated edit) instead of "backdropFilter" — so the intended backdrop blur never
#                rendered in EITHER theme. → Fixed both to backdropFilter + WebkitBackdropFilter
#                (Safari/iOS). Text-corruption class, same family as earlier passes.
#
#          PROTOTYPE FIX (THM-03) [HIGH] — light-theme contrast failures. The Phase 2 layer
#                accents live in :root (shared by both themes) at dark-tuned saturations. Measured
#                on the light theme's white surfaces, three FAIL WCAG AA as text/icons:
#                layer-workflow 2.54, layer-trust 2.15, layer-discovery 2.43 (others borderline).
#                → ASSESSMENT: prototype owns theming; Phase 1 already desaturates accents per
#                  [data-theme], Phase 2 simply hadn't. Fix belongs in the prototype.
#                → FIX (prototype): added a [data-theme="light"] override supplying darker on-hue
#                  variants — workflow #047857, visibility #1d4ed8, comm #4338ca, trust #b45309,
#                  retrieval #6d28d9, discovery #0e7490, governance #334155 — ALL now ≥4.5 (AA
#                  body) on white. Also re-tinted -soft fills, health/score ramps, glows (→none on
#                  light), and glass tokens for light mode. DARK MODE UNCHANGED (locked look intact).
#
#          PROTOTYPE FIX (THM-02) [COSMETIC] — "Cputom" → "Custom" corrupted word in a comment.
#
#          PROTOTYPE FIX (UX-01) [ENHANCEMENT] — evidence-based 2026 typographic refinements.
#                Web research (Inter/Geist as the 2026 UI standard; tabular figures for number-heavy
#                dashboards; optical sizing) confirmed the existing Geist/Inter + Geist Mono system is
#                already best-practice — so NO font swap (a trend-chase swap would have broken the
#                locked spec for no gain). Added additively: tabular-nums + slashed-zero on all mono
#                numeric displays (aligns score/metric columns), font-optical-sizing:auto, contextual
#                alternates, antialiasing, and tighter heading tracking (-0.02em). Identity unchanged.
#
#          CLEAN (verified this pass, NOT changed): all `color:'#fff'` / rgba(255,255,255,…) text is
#            on layer-accent or gradient FILLS (e.g. autopilot gradient banner, blue buttons) — white
#            text is correct on those in BOTH themes. The HealthCheck danger pill (rgba red + #fca5a5)
#            sits ON the autopilot gradient, not a theme surface — legible in both themes; left as-is.
#            --glass-*/--glow-* base tokens were unused (0 refs) so could not break either theme.
#            text-disabled fails AA in both themes but is inherited Phase-1 disabled text (WCAG-exempt).
#
#          INVARIANTS unchanged: 37 Phase 2 tables, 16 GAPs, serve()=25/25; prototype JSX + CSS
#            braces/parens balanced; template-literal backticks even.
#
# v8.59 — Fortieth-pass conflict audit (FRESH ANGLE: numeric/arithmetic fixture fidelity —
#          do the prototype's hardcoded numbers add up within a screen, agree across screens,
#          and match LLD seed/threshold constants? No prior pass checked fixture arithmetic
#          or cross-screen count consistency.)
#          Read: Phase 1 CLAUDE.md (5-dim model, 200-call formula), Foundations v1.12,
#          LLD v8.58 (Action Progress Tracker spec), Phase 2 prototype (14 screens).
#
#          PROTOTYPE FIX (NUM-01) [MODERATE] — two numeric inconsistencies:
#            (a) WorkflowHub "Open tasks" stat card said value:3 / "2 high priority", but the task
#                array it summarises has 2 open rows, of which only 1 is high priority (the other
#                open task is medium; the 2nd high-priority task is in_progress). A stat card must
#                reflect the list it sits above.
#                → ASSESSMENT: within the prototype, the rendered task array is ground truth for
#                  its own stat cards; the card was the bug. Prototype is the doc to fix.
#                → FIX (prototype): value 3→2, sub "2 high priority"→"1 high priority". Now matches
#                  array exactly (open=2, in_progress=2, complete=1; open-high=1).
#            (b) Dashboard "Work Completed: 4 recommendations completed" appeared to contradict
#                WorkflowHub "Done this month: 1" (same brand, same period).
#                → ASSESSMENT: NOT a true contradiction — different SCOPE. The dashboard number is
#                  the LLD Action Progress Tracker metric "X of N gaps closed this month" (source:
#                  COUNT(remediation_tasks WHERE status='complete' AND updated_at >= period_start),
#                  org-wide; LLD lines 1898/8608), whereas WorkflowHub "Done this month" is the
#                  single-brand task counter. The prototype just failed to make the scope explicit,
#                  so it READ as a contradiction. The bare "4" also matches the LLD's canonical
#                  "4 of 11" example.
#                → FIX (prototype): dashboard now shows "4 / 11 gaps closed this month" (LLD
#                  canonical framing + denominator) with an inline comment stating the scope differs
#                  from WorkflowHub by design. No number invented — 4 and 11 are the LLD's own example.
#
#          CLEAN (verified arithmetically this pass, NOT changed):
#            • Agent-readiness dimensions 3+5+6+4+7 = 25 = hero gauge "25/100" = comment. ✓
#              (5 dims × /20 = /100 per GAP 2; sum = total_score.)
#            • Entity Home "1 of 3 required sameAs" matches LLD threshold "sameAs < 3 triggers
#              Action Center" (LLD line 5356). ✓
#            • Share-of-Voice donut 34+28+22+16 = 100. ✓
#            • Topical-gap rows: gap == compScore − yourScore for all 5 rows. ✓
#            • Wikipedia "2.3× more frequently" / "appear 2.0× more" are cited evidence strings, not
#              computed fixtures — left as-is.
#
#          INVARIANTS unchanged: 37 Phase 2 tables, 16 GAPs, serve()=25/25; prototype
#            braces/parens balanced.
#
# v8.58 — Thirty-ninth-pass conflict audit (FRESH ANGLE: categorical value-set integrity —
#          do the prototype's rendered status/priority/category string literals match the
#          value-set + TYPE of the LLD column they bind to, and can the prototype's badge
#          components actually style every value they receive? No prior pass diffed prototype
#          render-literals against column value-sets AND column TYPE.)
#          Read: Phase 1 sprint prompts + CLAUDE.md (5-dimension model), Foundations v1.12,
#          LLD v8.57, Phase 2 prototype (14 screens).
#
#          PROTOTYPE FIX (EV-01) [MODERATE] — priority band bound to the wrong field/type.
#                WorkflowHub's Tasks table renders task.priority as a 'high'|'medium'|'low' pill
#                (<PriorityBadge>), but remediation_tasks.priority is an INTEGER rank (1..N;
#                priority=1 = top action — LLD line ~7247). The categorical low/medium/high in the
#                schema lives on remediation_tasks.effort + expectedImpactScore, and the LLD's
#                display-pill rule (danger=high/warning=medium/info=low) is the IMPACT pill.
#                A dev binding task.priority directly would render the raw integer or mis-map.
#                → ASSESSMENT: LLD schema is authoritative for column type/semantics; the pill
#                  COLORS already match the LLD display rule, so the UI is correct — only the
#                  data-binding was undocumented/mis-implied. Prototype is the doc to fix (it is a
#                  build spec for Claude Code); no schema change.
#                → FIX (prototype): added a DATA-BINDING NOTE on PriorityBadge — the band is a
#                  DERIVED impact/priority display (compute from effort + expectedImpactScore,
#                  order by the integer priority rank), NOT a raw read of the INTEGER column.
#                  Visual output unchanged.
#
#          CLEAN (checked this pass, NOT changed):
#            • StatusBadge styles every status it actually receives: tasks open|in_progress|complete,
#              reports published, audit feed complete — all mapped. (done/draft/approved/published/
#              detected/resolved also mapped for other screens.) No unmapped-status fallthroughs.
#            • workflow_runs.status (scheduled|running|completed -ed) vs audits.status (complete) —
#              deliberately separate enums, already documented; prototype does not conflate them.
#            • content_drafts.status DEFAULT 'draft' matches prototype <StatusBadge status="draft">.
#            • conversation_journeys data carries status:'ready'/'not_run' but the journey row renders
#              run-state from lastRun (status field unused) — harmless mock dead-field, not a bug.
#            • prototype task.source 'frequency'/'context' are valid Phase 1 score DIMENSIONS
#              (CLAUDE.md 5-dimension model; LLD 'dimension' concept) — valid value-set; left as-is.
#            • AutopilotLoop 'done'/'current'/'pending' remains presentational stepper state
#              (documented v8.56), not remediation_tasks.status.
#
#          INVARIANTS unchanged: 37 Phase 2 tables, 16 GAPs, serve()=25/25; prototype
#            braces/parens balanced (1718/1718, 1086/1086).
#
# v8.57 — Thirty-eighth-pass conflict audit (FRESH ANGLE: named-artifact referential
#          integrity — are lib/ module paths spelled identically everywhere, and do all
#          prototype navigation targets resolve to a real screen / LLD route? No prior
#          pass cross-checked nav-target reachability or lib-path spelling drift.)
#          Read: Phase 1 sprint prompts, CLAUDE.md, Foundations v1.12, LLD v8.56,
#          Phase 2 prototype (now 14 screens), Phase 1 prototype (route registry).
#
#          LLD FIX (NM-01) [LOW] — Layer 4 lib path drift: the JourneyTurn interface was
#                referenced at lib/discovery/types.ts, but the established Layer 4 LIB tree is
#                lib/conversational/ (journey-runner.ts, journey-scorer.ts, etc.). discovery/ is
#                the ROUTE + COMPONENT namespace only (app/(auth)/brands/[brandId]/discovery/,
#                components/domain/discovery/). Leaving types.ts under discovery/ would create a
#                stray lib/discovery/ folder and force journey-scorer.ts to import across folders.
#                -> ASSESSMENT: LLD-internal naming inconsistency; the explicit lib tree
#                  (lib/conversational/) is authoritative. The prototype references no lib paths,
#                  so it is not involved.
#                -> FIX (LLD): live spec reference corrected to lib/conversational/types.ts. The
#                  historical v8.50 changelog line that first introduced the path was left intact
#                  (changelog immutability) — this entry supersedes it.
#                -> CLEAN (checked, NOT changed): run-journey.ts (Inngest function) vs
#                  journey-runner.ts (lib module) is a correct function/lib split, used
#                  consistently — NOT a conflict; left as-is. content-generator.ts /
#                  content-format-selector.ts / content-format-advisor.ts are three distinct
#                  modules (translation / format-decision / Layer-1 advisor) — NOT duplicates.
#
#          PROTOTYPE FIX (NAV-01) [MODERATE] — four implemented screens were unreachable
#                (registered in screenMap but no sidebar/tab/onNav path led to them): AutopilotLoop,
#                CompetitiveBenchmark, ContentDraftEditor, HealthCheck. A reviewer/Claude Code could
#                not reach 4 built Phase 2 screens.
#                -> ASSESSMENT: prototype is canonical for UI/UX navigation; this is a prototype
#                  wiring gap, and the LLD already specifies where each screen is entered. Fixes
#                  made IN THE PROTOTYPE, each at the LLD-intended entry point:
#                    * autopilot     -> "View full loop" link on the dashboard Sprint 9 Autopilot
#                                       tracker.
#                    * competitive   -> Competitive Benchmark CTA card in VisibilityHub, sibling to
#                                       the existing Citation Failure card (LLD Sprint 3 pairs them).
#                    * content-draft -> wired WorkflowHub's existing "Generate draft" button.
#                    * health-check  -> first-audit Health Check banner on the dashboard (LLD
#                                       Sprint 10 post-first-audit packaging).
#                  After the fix: zero unreachable screens.
#
#          PROTOTYPE CLARIFICATION (no behaviour change) — documented that the sidebar's
#                'brand-list' / 'action-center' / 'vertical-packs' / 'billing' items are PHASE 1
#                screens (BrandList, ActionCenter, VerticalPackBrowser, Pricing in
#                visibleau-prototype.jsx), intentionally not re-implemented in the Phase 2 file;
#                they fall through to 'dashboard' here but resolve to real Phase 1 routes in the
#                built app. Flagged so no one adds duplicate stub screens (Phase 1 is canonical).
#
#          INVARIANTS unchanged: 37 Phase 2 tables, 16 GAPs, serve()=25/25; prototype
#            braces/parens balanced (1718/1718, 1086/1086); all icons used are imported.
#
# v8.56 — Thirty-seventh-pass conflict audit (FRESH ANGLE: metric-unit consistency across
#          formula/threshold/UI + tier-entitlement reconciliation tab-vs-gate-table.
#          No prior pass checked whether stored proportion columns use the SAME unit at
#          their producer, their consumer thresholds, and the prototype display.)
#          Read: Phase 1 sprint prompts, CLAUDE.md, Foundations v1.12, LLD v8.55,
#          Phase 2 prototype (14 screens), Phase 1 prototype.
#
#          LLD FIX (MS-01) [HIGH] — visibility_trends.mention_rate / citation_rate UNIT clash:
#                The column FORMULAS compute each rate as a fraction "x 100" -> stored as a
#                PERCENTAGE (0-100). But the brand_archetype CLASSIFICATION THRESHOLDS tested
#                the same columns as 0-1 ratios (mention_rate >= 0.20, citation_rate >= 0.10).
#                With the x100 formula, mention_rate=60.0 means 60%, so ">= 0.20" is ALWAYS true
#                -> every brand misclassified 'recognised_authority' -> GAP 9 Mention-Source Divide
#                2x2 matrix silently broken. The SWOT spec (Sprint 9 notes) repeated the same
#                0-1 reading (citation_rate > 0.5, < 0.20).
#                -> ASSESSMENT: percentage (0-100) is authoritative — it is fixed by the column
#                  FORMULAS (producer aggregate-visibility-trend.ts, set in audit U-05) AND by the
#                  Phase 2 prototype, which displays "citation rate 67% -> 52%" and SoV pct
#                  34/28/22/16. The 0-1 THRESHOLD comments were the bug. (mention_source_ratio =
#                  citation_rate / mention_rate stays 0-1 — the x100 cancels — so its '<0.2'
#                  threshold is correct under either reading and was left unchanged.)
#                -> FIX (LLD): archetype thresholds 0.20/0.10 -> 20/10 (percentage-points) + a UNIT
#                  note on lib/visibility/mention-source-divide.ts; SWOT illustrative thresholds
#                  0.5/0.20 -> 50/20. Prototype already correct — not touched.
#
#          LLD FIX (MS-02) [LOW] — share_of_voice_snapshots.brand_share / competitor_share had no
#                documented unit; a dev could have written 0.34 instead of 34.
#                -> ASSESSMENT: percentage (0-100) — per-engine shares sum to ~100 and the prototype
#                  SoV donut uses pct 34/28/22/16 + IntelCard unit="%". Same convention as MS-01.
#                -> FIX (LLD): added explicit percentage UNIT note + the producer formula
#                  (count / total_in_category x 100). No type change. Prototype unchanged.
#
#          PROTOTYPE FIX (TG-02) [MODERATE] — BrandIntelTabs minTier vs LLD tier-gate table:
#                Two tabs disagreed with the gate table + Starter entitlement list (lines 2569-2572,
#                3876-3910). NOTE: this corrects a Reports gate that the v8.55-era pass (changelog
#                line ~141) had blessed as "reports=Starter valid" WITHOUT cross-checking
#                generated_reports=Growth+ — the fresh entitlement-matrix angle caught it.
#                -> Retrieval tab was minTier 'Growth' but Starter gets agent_readiness_scores FULL
#                  + crawler_visit_logs + llmstxt_versions on that tab -> tab was hiding paid Starter
#                  value. Reports tab was minTier 'Starter' but generated_reports is Growth+ (Starter
#                  absent) with no Starter report entitlement -> tab was over-granting.
#                -> ASSESSMENT: tier entitlement is LLD-owned (gate table is the build contract);
#                  the prototype tab-clickability must match it. Prototype was the bug for both.
#                -> FIX (prototype): Retrieval minTier Growth->Starter; Reports minTier Starter->Growth.
#                  Visibility=Starter (summary teaser ok) and Workflow=Starter (top-3 tasks ok) were
#                  verified CORRECT and left as-is — not over-fixed.
#
#          PROTOTYPE CLARIFICATIONS (no semantic change):
#                - AutopilotLoop step.status ('done'|'current'|'pending') documented as PRESENTATIONAL
#                  stepper state, explicitly NOT remediation_tasks.status (open|in_progress|
#                  ready_for_review|complete|wont_fix). Same-word/different-layer false positive —
#                  flagged so it is not wrongly unified with the DB enum later.
#                - Phase2Sidebar hubs documented as intentionally ungated nav convenience (real gate
#                  is BrandIntelTabs) — flagged so the sidebar is not "fixed" to match the tabs.
#
#          CLEAN this pass: timestamp columns all TIMESTAMPTZ (plain-TIMESTAMP hits were prose only) ok;
#            score_*_avg columns 0-100 consistent with their AVG(numeric) sources ok; citation_share
#            + journey_score + coverage_ratio NUMERIC(5,2) consistent with their bounded ranges ok;
#            prototype tier names match LLD (Free/Starter/Growth/Agency/Agency Pro/Enterprise) ok;
#            remediation/workflow status strings in the task-list UI use the correct DB enum ok.
#          INVARIANTS unchanged: 37 Phase 2 tables, 16 GAPs, serve()=25/25, prototype braces/parens
#            balanced (1681/1681, 1053/1053).
#
# v1.0 — Initial 7-layer design, 9 sprints, 31 tables
# v2.0 — Added 6 market gaps from June 2026 research:
#         GAP 1 Query Fan-Out Intelligence (L2)
#         GAP 2 AI Agent Readiness Score (L1)
#         GAP 3 MCP readiness check moved Phase 3 → Phase 2 L1
#         GAP 4 Citation Source Type Intelligence (L2 + L3)
#         GAP 5 Google AI Mode as separate engine (L2 stretch)
#         GAP 6 Topical Coverage Gap Score (L2)
#         Total: 34 tables
# v3.0 — Added 4 LinkedIn + deep research gaps:
#         GAP 7  LinkedIn Presence Intelligence (L3)
#         GAP 8  Content Format Intelligence (L5 + L1)
#         GAP 9  Mention-Source Divide (L2)
#         GAP 10 Cross-Platform Consensus Score (L3)
#         Total: 36 tables + 6 Phase 1 column additions
# v4.0 — Added 3 X/Twitter practitioner gaps (Jason Barnard, Mike King):
#         GAP 11 Knowledge Graph / Knowledge Panel check (L3)
#         GAP 12 Entity Home audit (L1)
#         GAP 13 Wikidata entry check (L3)
#         Total: 36 tables + 14 Phase 2 + 6 Phase 1 column additions
# v5.0 — Added 2 Reddit research gaps + multi-region fixes:
#         GAP 14 Brand Web Mention Intelligence (L2)
#         GAP 15 Citation Volatility Score (L2)
#         market_code added to brand_web_mentions, brand_entity_scores,
#         linkedin_presence_audits, brand_consensus_checks
#         entity_abn_in_schema → entity_local_reg_in_schema
#         Total: 37 tables + 15 Phase 2 + 6 Phase 1 column additions
# v6.0 — Added 1 YouTube research gap:
#         GAP 16 YouTube Presence Intelligence (L3)
#                → 1 new table: youtube_presence_audits
#                → YouTube #1 cited domain in Google AI Overviews (30% share)
#                → 0.737 correlation with AI visibility — strongest predictor
#                → 94% of citations go to long-form video (OtterlyAI 2026)
#                → How-to citations up 414% in AI Overviews (Neil Patel 2025)
#                → Perplexity 38.7% + AI Overviews 36.6% = 75% of YouTube citations
#                → Only Gemini can "watch" video; others need text transcript
#                → VideoObject schema on embedding page = highest-value surface
#                → AU: how-to + instructional content = #1 video citation type
#         Total: 38 tables + 15 Phase 2 + 6 Phase 1 column additions
# v6.1 — Phase 1 design document deep audit (CLAUDE.md v1.5, Foundations v1.12, all 12 final sprint prompts, prototype JSX):
#         CONFLICT C-01/C-02: brand_entity_scores is a Phase 1 Sprint 7 table (not a new Phase 2 table)
#                → Phase 1 columns: abn_verified, abn_number, abn_entity_name, abn_status,
#                  wikipedia_au_present, wikipedia_au_url, wikipedia_au_mentions,
#                  au_tld_domains JSONB, au_directory_presence JSONB, score_of_10, checked_at
#                → Phase 2 now uses ALTER TABLE with 21 nullable columns (not CREATE TABLE)
#                → brand_entity_scores added to Phase 1 protected tables list
#                → Table count: 38 Phase 2 new tables → 37 (brand_entity_scores is Phase 1)
#         CONFLICT C-03: audits column names stale in Foundations v1.12
#                → Sprint 2 v1.12 canonical: engines TEXT[], promptsCount, runsPerPrompt, totalCalls
#                → Foundations shows old promptCount + engineCount (Sprint 1 schema)
#                → LLD now correctly documents Sprint 2 canonical column names
#         CONFLICT C-04: CLAUDE.md v1.5 still references Clerk throughout
#                → Better Auth migration is canonical; CLAUDE.md/Foundations are stale docs
#                → Added note: treat all Clerk references in CLAUDE.md as Better Auth
#         CONFLICT C-05/C-06: org_members vs auth_members vs users.role layering unclear
#                → Added explicit 3-layer permission model documentation
#                → auth_members = Better Auth internal; users.role = org-level; org_members = brand-scoped
#         CONFLICT C-07: refresh-entity-score Inngest did not acknowledge Sprint 7 entity scoring
#                → Sprint 7 technical-audit-run.ts already writes brand_entity_scores AU signals
#                → Phase 2 function now documented to EXTEND (not duplicate) Sprint 7 scoring
#         CONFLICT C-08: Late Sprint 9/10 column additions missing from protected tables list
#                → brands.client_tag TEXT (Sprint 9 GB5 — portfolios = GROUP BY client_tag)
#                → organizations.ga4_measurement_id + ga4_api_secret TEXT (Sprint 9 GD1)
#                → organizations.onboarding_complete BOOLEAN (Sprint 9 GD5)
#                → organizations.slug TEXT UNIQUE (Sprint 10 HC1 — synthetic demo org)
#                → All added to protected tables documentation; Phase 2 must not conflict
#         CONFLICT C-09: hallucination_incidents scope overlap with Phase 1 citations
#                → citations.is_accurate + hallucination_flags already exist (Phase 1 Sprint 3)
#                → hallucination_incidents is higher-level: tracked/acknowledged named incidents
#                → Design note added clarifying the two-level detection/tracking model
#         Total: 37 new Phase 2 tables + 3 Phase 1 ALTER TABLE additions (audits, citations, brand_entity_scores)
# v8.55 — Thirty-sixth-pass conflict audit (BIDIRECTIONAL: lucide imports + route
#          param consistency; assessed authoritative document before each fix)
#          Read: Phase 2 prototype (14 screens), all 12 Sprint prompts, CLAUDE.md,
#          Foundations, LLD v8.54.
#
#          LLD FIX (RP-01): PAGE routes mixed [id] and [brandId] in app/(auth)/brands/.
#                → The LLD had Phase 2 PAGE dirs as both app/(auth)/brands/[brandId]/...
#                  (loading.tsx files) AND the same dirs written with an [id] segment (page dirs) for the
#                  SAME routes (visibility, retrieval, trust, discovery, workflow, reports,
#                  health-check, citation-failure). Next.js CANNOT have [id] and [brandId]
#                  in one route subtree — it is a build-time collision, and a page.tsx
#                  cannot sit in [id]/ while its loading.tsx sits in [brandId]/.
#                → ASSESSMENT: canonical is [brandId] — Phase 1 Sprint 3/4 page routes use
#                  it, and the LLD's own loading.tsx siblings already use it. The [id] PAGE
#                  refs were the bug. API routes (/api/brands/[id]/...) correctly use [id]
#                  and are a SEPARATE tree — left untouched.
#                → FIX (LLD): normalized 9 PAGE-route refs [id]→[brandId]; 70 API-route
#                  [id] refs preserved. Added RP-01 convention note to prevent recurrence.
#
#          PROTOTYPE FIX (IMP-01): lucide-react import hygiene.
#                → 5 icons imported but never used (ArrowUpRight, ExternalLink, Hash,
#                  Search, Settings) → no-unused-vars lint errors in a real build; and
#                  Shield was imported twice (duplicate-import lint error).
#                → ASSESSMENT: prototype-only code-quality issue; LLD has nothing to say
#                  about icon imports. Standing instruction requires production-grade code.
#                → FIX (prototype): removed the 5 unused imports + deduped Shield. All 52
#                  remaining imports are used. Prototype's [id] ref is /api/brands/[id]/wins
#                  (an API route) — correct, left as-is.
#
#          CLEAN: all PascalCase JSX components used in the prototype are locally defined
#            (no missing icon imports → no ReferenceError) ✓; every sidebar nav target
#            (intelligence hubs, team, data-residency, reports) maps to an LLD route ✓
#
# v8.54 — Thirty-fifth-pass conflict audit (BIDIRECTIONAL: audited LLD AND Phase 2
#          prototype; assessed authoritative document before each fix)
#          Read: Phase 2 prototype (14 screens), all 12 Sprint prompts, CLAUDE.md,
#          Foundations, LLD v8.53.
#
#          PROTOTYPE FIX (text corruption — fixed in visibleau-prototype-phase2.jsx):
#                'Award*' find-replace accident corrupted the tier name and two CTAs:
#                  'Awardter' (6×) → 'Starter' (tier name in BrandIntelTabs minTier +
#                    tierRank map);  'Awardt improving' (2×) → 'Start improving';
#                  'Awardt next campaign' (1×) → 'Start next campaign'.
#                → ASSESSMENT: 'Starter' is the canonical tier name (Phase 1 + LLD both use
#                  it; LLD has 60 correct uses, zero corruption). Prototype was the bug.
#                → FIX (prototype): restored 'Starter' / 'Start'. The 4 remaining 'Award'
#                  tokens are the legitimate lucide-react icon import — left as-is.
#
#          LLD FIX (CM-01): CM-1 Reports List renders a report status badge ('published')
#                but generated_reports has NO status column.
#                → The status is derivable from pdf_url + email_sent_at, but the LLD never
#                  documented the mapping — a dev building CM-1 wouldn't know how to compute
#                  it (and might wrongly add a status column).
#                → ASSESSMENT: LLD documentation gap, not a prototype bug. 'published' is a
#                  valid derived state.
#                → FIX (LLD): documented the UI status derivation on generated_reports:
#                  pdf_url NULL→'generating'; pdf_url set & email_sent_at NULL→'ready';
#                  email_sent_at set→'published'. No status column added (timestamps are the
#                  source of truth). Same pattern as conversation_journeys ready/not_run.
#
#          CLEAN (prototype ↔ LLD this pass):
#            Journey Intelligence tier gate: prototype 'Agency' = LLD 'Agency+' (v8.19) ✓
#            Competitor counts: prototype Growth=1/Agency=3/Pro=unlimited = LLD ✓
#            Intelligence tab minTiers (visibility/workflow/reports=Starter): valid
#              "show tab, gate content" UX — LLD defines feature/data tiers (Growth+),
#              not tab-visibility tiers, so no conflict ✓
#
# v8.53 — Thirty-fourth-pass conflict audit (BIDIRECTIONAL: audited LLD AND Phase 2
#          prototype; assessed which document was authoritative before fixing each conflict)
#          Read: Phase 2 prototype (14 screens), all 12 Sprint prompts, CLAUDE.md,
#          Foundations, LLD v8.52.
#
#          RESULT: Both conflicts found this pass were PROTOTYPE bugs. The LLD was correct
#          in both cases and required NO changes. Fixes applied to the prototype file
#          (visibleau-prototype-phase2.jsx). Documented here for traceability.
#
#          PROTOTYPE FIX 1 (status enum): WF-1 Workflow Hub task mock used status 'done'.
#                → LLD remediation_tasks.status enum is
#                  'open'|'in_progress'|'ready_for_review'|'complete'|'wont_fix'. 'done' is
#                  not a valid value. A dev building from the prototype would write
#                  status==='done' checks that never match the real 'complete' value.
#                → ASSESSMENT: LLD enum is the schema source of truth (well-formed lifecycle).
#                → FIX (prototype): 'done' → 'complete' in mock data + 2 render checks.
#                  (Autopilot-loop step states done/current/pending are UI-only — left as-is.)
#
#          PROTOTYPE FIX 2 (agent readiness dimensions): RT-1 Retrieval Hub showed
#                5 bars with maxes /18,/12,/16,/14,/10 (sum /70) labelled llms.txt/MCP/
#                content/entity-home/AI-bot.
#                → ROOT CAUSE: conflated Phase 1 technical_audits 8 sub-scores
#                  (/18 robots, /18 llms.txt, /16 schema...) with Phase 2
#                  agent_readiness_scores (5 dimensions × /20 = /100). Two different
#                  /100 scores. The items shown were sub-signals, not the scored dimensions.
#                → ASSESSMENT: LLD GAP 2 is research-backed (ARGEO/Cloudflare) and defines
#                  the real columns: tech_score, entity_clarity_score, verify_score,
#                  authority_score, task_score — each /20. LLD correct.
#                → FIX (prototype): 5 bars relabelled to the canonical dimensions, each
#                  /20; scores set to sum to 25 to match the existing hero gauge.
#
#          CLEAN (prototype ↔ LLD this pass):
#            workflow_runs.status enum 'scheduled'|'running'|'completed'|'failed' — LLD ✓
#            share_of_voice_snapshots.sample_quality (Confirmed/Likely/Hypothesis) — match ✓
#            AP-2 Health Check 5 dims (Frequency/Position/Sentiment/Context/Accuracy) —
#              match Phase 1 audit scoring dimensions ✓
#            TR-1 hallucination severity (critical/warning) — valid LLD values ✓
#            LLD internal: agent readiness 5×20=/100 consistent; /18 references are the
#              separate llmstxt depth_score + technical_audits sub-scores, not bugs ✓
#
# v8.52 — Thirty-third-pass conflict audit (FRESH ANGLE: Phase 2 prototype JSX
#          cross-checked against LLD schema — verifying screens display data the LLD
#          provides and UI maps to defined routes; plus RT-01 migration timing)
#          Read: Phase 2 prototype (14 screens), all 12 Sprint prompts, CLAUDE.md,
#          Foundations, LLD v8.51.
#
#          FIX 1 (DR-02 + DR-02b): GV-2 Data Residency screen shows Retention + Encryption
#                columns the data_residency_log table could not provide.
#                → The prototype's data-type table renders 4 columns: Data type | Storage
#                  location | Retention | Encryption. But data_residency_log had only
#                  data_type, storage_region, provider, recorded_at — no retention or
#                  encryption fields. The screen would render two empty columns.
#                → Fix: added retention_period TEXT and encryption_status TEXT columns.
#                  retention_period values mirror the actual RT-01 cleanup windows
#                  (audit_data/evidence/pdf='12 months', llm_cache='30 days',
#                  crawler_logs='90 days') — single source of truth with the retention cron.
#                  Updated the record-data-residency.ts static config map to set both.
#
#          FIX 2 (RT-01b): clarified WHEN the retention extension lands.
#                → RT-01 (v8.51) said "extend audit-data-retention.ts (Phase 1 Sprint 12)"
#                  but the Phase 1 function cannot reference Phase 2 tables that do not
#                  exist yet. Clarified: extension applied during Phase 2 Sprint 6
#                  (crawler_visit_logs) and Sprint 5 (brand_web_mentions), guarded by
#                  table presence so the Phase 1 function never references absent tables.
#
#          CLEAN angles (prototype ↔ LLD cross-check):
#            Mention-Source Divide (VI-1 'Cited + Mentioned'/'Mentioned only'):
#              backed by visibility_trends.brand_archetype + mention_source_ratio ✓
#            Entity Home (RT-1): backed by content_structure_audits entity_home columns ✓
#            Citation Failure Diagnosis (VI-2): lib/visibility/citation-failure-diagnosis ✓
#            Conversation Journeys (CD-1): conversation_journeys + buyer_stage +
#              prompt_sequence; journey_name is free text, status is UI-derived ✓
#            Autopilot Loop (AP-3): all 5 steps backed (topical_coverage_gaps →
#              remediation_tasks → content_drafts → approval → trigger-validation-reaudit) ✓
#            Team Management (GV-1): org_members 4 roles match prototype ✓
#            Content Draft Editor (WF-2): content_format column backs the format selector ✓
#
# v8.51 — Thirty-second-pass conflict audit (data retention on unbounded tables,
#          audit_id FK cascade coverage, ratio NUMERIC scale, severity CHECK, agent
#          readiness dimensions, lib/ module structure)
#          Read: All 12 Phase 1 Sprint prompts, CLAUDE.md, Foundations, LLD v8.50.
#
#          FIX 1 (RT-01): crawler_visit_logs + brand_web_mentions have no retention policy.
#                → crawler_visit_logs grows unbounded — one row per AI-bot visit on every
#                  customer site. At scale this reaches millions of rows, slowing queries
#                  despite indexes and inflating Supabase storage. brand_web_mentions
#                  accumulates weekly scrapes indefinitely. Neither has an audit_id FK, so
#                  the Phase 1 12-month audit-data-retention cascade does NOT cover them.
#                → Fix: extend audit-data-retention.ts (Sprint 12 Sunday cron '0 4 * * 0'):
#                    DELETE FROM crawler_visit_logs WHERE visited_at < now() - interval '90 days'
#                    DELETE FROM brand_web_mentions WHERE detected_at < now() - interval '180 days'
#                  90d for crawler logs (dashboards show 30/90-day windows), 180d for
#                  mentions (trend charts use ~6mo). Both safe — no downstream FK deps.
#
#          CLEAN angles:
#            audit_id FK ON DELETE: all Phase 2 tables correct — query_fan_out_results,
#              comparison_prompt_results, share_of_voice_snapshots = CASCADE (E-03 fix);
#              evidence_snapshots = SET NULL (survives audit deletion); hallucination_
#              incidents preserved independently ✓
#            journey_run_results.journey_id: ON DELETE CASCADE ✓
#            Ratio columns: knowledge_sharing_ratio, original_content_ratio, longform_ratio
#              all NUMERIC(4,3) — exact for 0.000-1.000 range; mention_source_ratio
#              NUMERIC(5,2) for its wider range ✓
#            agent_readiness_scores: 5 dimensions (tech, entity_clarity, verify, authority,
#              task) each /20 = /100 total; local_ai_trust_score /100 composite ✓
#            hallucination_incidents.severity: TEXT without CHECK — CONSISTENT with Phase 1
#              (zero CHECK on TEXT enums anywhere; validation is app-layer Zod; CHECK used
#              only for RLS policies) ✓
#            lib/ structure: 48 modules organized by layer/domain, no orphans ✓
#
# v8.50 — Thirty-first-pass conflict audit (index coverage on high-volume tables,
#          prompt_sequence TypeScript type, complete cron schedule + collision check)
#          Read: All 12 Phase 1 Sprint prompts, CLAUDE.md, Foundations, LLD v8.49.
#
#          FIX 1 (PS-01): conversation_journeys.prompt_sequence missing TypeScript interface.
#                → JSONB shape documented in comments (array of turn objects) but no
#                  TypeScript interface — EB5/RS-01/TS-01 pattern. run-journey.ts reads
#                  this to know what to ask each turn; without a type it uses `any`.
#                → Fix: JourneyTurn interface (lib/discovery/types.ts) with turn/prompt/
#                  intent fields. Zod schema z.array(JourneyTurnSchema).min(2).max(8).
#
#          FIX 2 (CR-01): 6 scheduled functions had no explicit cron expression.
#                → content-structure-audit, track-brand-web-mentions (weekly),
#                  llmstxt-refresh, audit-linkedin-presence, audit-youtube-presence,
#                  check-cross-platform-consensus (monthly) all said "Scheduled weekly/
#                  monthly per brand" but gave no cron. Claude Code would guess schedules,
#                  risking collisions with each other and Phase 1 crons.
#                → Fix: explicit collision-free UTC cron slots assigned:
#                    content-structure-audit:        '0 22 * * 3' (Wed 22:00)
#                    track-brand-web-mentions:       '0 22 * * 4' (Thu 22:00)
#                    llmstxt-refresh:                '0 3 1 * *'  (1st of month 03:00)
#                    audit-linkedin-presence:        '0 3 2 * *'  (2nd of month 03:00)
#                    audit-youtube-presence:         '0 3 3 * *'  (3rd of month 03:00)
#                    check-cross-platform-consensus: '0 3 4 * *'  (4th of month 03:00)
#                  Verified: all 8 Phase 2 crons unique; zero overlap with Phase 1 slots
#                  ('0 2 * * *', '0 23 * * 1', '0 4 * * 0').
#
#          CLEAN angles:
#            Index coverage: all 6 high-volume tables (crawler_visit_logs,
#              query_fan_out_results, comparison_prompt_results, journey_run_results,
#              brand_web_mentions, share_of_voice_snapshots) have explicit CREATE INDEX
#              statements on their hot query paths ✓
#            share_of_voice_snapshots: per-competitor/engine/prompt_category rows with
#              brand_share, competitor_share, sample_quality — well structured ✓
#
# v8.49 — Thirtieth-pass conflict audit (UPSERT idempotency completeness across all
#          UNIQUE-constrained Phase 2 tables, Visit API middleware exclusion, new-event
#          leak verification)
#          Read: All 12 Phase 1 Sprint prompts, CLAUDE.md, Foundations, LLD v8.48.
#
#          FIX 1 (MW-01): Visit API not in middleware public route matcher.
#                → app/api/visit/route.ts (added v8.48) is a PUBLIC endpoint called from
#                  visitors' browsers, but Phase 1 isPublic matcher lists only
#                  '/', '/pricing', '/sign-in', '/sign-up', '/api/webhooks(.*)', '/api/health'.
#                → Without adding '/api/visit', auth middleware blocks visitors (401) and
#                  the entire crawler tracking feature silently breaks.
#                → Fix: documented requirement to add '/api/visit' to isPublic matcher.
#
#          FIX 2 (TU-01): calculate-topical-gaps.ts missing ON CONFLICT UPSERT.
#                → topical_coverage_gaps has UNIQUE(brand_id, vertical, topic_cluster).
#                  Weekly cron — plain INSERT fails on the 2nd run for the same cluster.
#                  Same root cause as VT-01 (v8.47) — UPSERT noted in changelog but absent
#                  from the function spec.
#                → Fix: INSERT ... ON CONFLICT (...) DO UPDATE SET all computed columns.
#
#          FIX 3 (CU-01): check-cross-platform-consensus.ts missing ON CONFLICT UPSERT.
#                → brand_consensus_checks has UNIQUE(brand_id, source_type) (L-01 fix).
#                  Monthly cron — plain INSERT fails on the 2nd month for the same source_type.
#                → Fix: INSERT ... ON CONFLICT (...) DO UPDATE SET. Now all three
#                  UPSERT tables (visibility_trends, topical_coverage_gaps,
#                  brand_consensus_checks) have the pattern in their function specs.
#
#          CLEAN angles:
#            'visit/ingested' (new v8.48 event): absent from VALID_EVENTS — correct,
#              it is an internal slash event, not a webhook delivery event ✓
#            serve() registrations: still 25/25 (Visit API is a route, not a function) ✓
#            conversation_journeys.prompt_sequence: stores the multi-turn journey
#              definition that run-journey.ts executes ✓
#            agent_readiness_scores remains APPEND-ONLY (U-13) — correctly NOT in the
#              UPSERT list (each run is a historical snapshot) ✓
#
# v8.48 — Twenty-ninth-pass conflict audit (route definitions, RLS WITH CHECK,
#          Visit API handler, hallucination route path, crawler table existence)
#          Read: All 12 Phase 1 Sprint prompts, CLAUDE.md, Foundations, LLD v8.47.
#
#          FIX 1 (RLS-WC): Phase 2 RLS policy template missing WITH CHECK clause.
#                → CRITICAL multi-tenant security. Phase 1 uses FOR ALL with BOTH
#                  USING and WITH CHECK. The Phase 2 template had only USING.
#                → USING protects reads (SELECT/UPDATE/DELETE visibility) but leaves
#                  INSERT and UPDATE open: a user could INSERT a row with another org's
#                  organization_id, or UPDATE a row to move it cross-tenant.
#                → Fix: template updated to FOR ALL + USING + WITH CHECK, matching the
#                  Phase 1 brands-table pattern. Applies to all 4 Phase 2 RLS tables
#                  (audit_trail, org_members, data_residency_log, org_feature_flags).
#
#          FIX 2 (VA-01 + VA-01b): Visit API endpoint had no route handler definition.
#                → crawler-log-ingest.ts referenced "VisibleAU Visit API validates
#                  brandToken → fires Inngest event" but the HTTP handler was never spec'd.
#                → Fix: app/api/visit/route.ts (POST) documented as a PUBLIC unauthenticated
#                  endpoint secured by brandToken (not session). Zod validation, brand
#                  lookup → 401, per-token rate limit, emits 'visit/ingested', returns 202.
#                  crawler-log-ingest.ts now explicitly listens on 'visit/ingested' (both
#                  active snippet path and passive log-import path use the same event).
#
#          FIX 3 (WR-01): WH-01 map referenced a non-existent hallucination route path.
#                → The emit comment said 'PATCH .../hallucinations/[id]/acknowledge' but
#                  the actual route is 'PATCH /api/brands/[id]/hallucinations/[id]'.
#                → Fix: comment corrected to the real route path.
#
#          CLEAN angles:
#            hallucination_incidents.is_false_positive: column EXISTS (N-06 was fixed) ✓
#            crawler_visit_logs: table exists with 14 columns (is_active_agent,
#              referrer_ai_session, visit_purpose, etc.) ✓
#            report_templates default seeding: fallback to all-core-sections if no row ✓
#            49 API routes catalogued — all referenced routes have definitions ✓
#
# v8.47 — Twenty-eighth-pass conflict audit (webhook emit completeness, UPSERT
#          idempotency, invitation cancellation, downstream output verification)
#          Read: All 12 Phase 1 Sprint prompts, CLAUDE.md, Foundations, LLD v8.46.
#
#          FIX 1 (WH-01a..d): 4 Phase 2 functions missing webhook event emits in specs.
#                → WH-01 (v8.28) documented that fanout-webhooks.ts needs 5 Phase 2 events.
#                  The trigger array and deliveryEventName map were specified. But the
#                  actual emitting functions never had the emit added to their own specs.
#                  Claude Code reads the function spec, not the WH-01 changelog note.
#                → WH-01a: generate-narrative-report.ts → emits 'report/generated'
#                  WH-01b: detect-hallucinations.ts → emits 'hallucination/detected'
#                          (critical+warning severity only — avoids alert fatigue; corrected v8.67)
#                  WH-01c: aggregate-visibility-trend.ts → emits 'visibility/trend-updated'
#                  WH-01d: score-agent-readiness.ts → emits 'agent/readiness-scored'
#                  Note: 'hallucination/acknowledged' emitted by PATCH route (not a function).
#
#          FIX 2 (VT-01): aggregate-visibility-trend.ts missing ON CONFLICT UPSERT.
#                → visibility_trends has UNIQUE(brand_id, period_label, period_type).
#                  On Inngest step replay (retry), plain INSERT fails with unique violation.
#                  Changelog noted UPSERT was needed but function spec had plain INSERT.
#                → Fix: INSERT ... ON CONFLICT (...) DO UPDATE SET all computed columns.
#                  Makes the weekly cron safely idempotent — rerunning overwrites with
#                  the latest data from the same period.
#
#          FIX 3 (IC-01): org_members admin cancellation flow not documented.
#                → IT-01 (v8.41) specified acceptance (clear to NULL) and re-invite
#                  (regenerate token) but never specified what DELETE/update happens
#                  when admin cancels an unaccepted invitation.
#                → Fix: DELETE WHERE accepted_at IS NULL (pending invites only).
#                  Accepted rows use role-change or is_active=false instead.
#                  Prevents ghost rows (NULL token + NULL accepted_at + is_active=false).
#
#          CLEAN angles:
#            generate-content-draft.ts downstream: status 'pending'→'draft' documented ✓
#            VALID_EVENTS: all 5 Phase 2 events use dot convention; none leaked to
#              internal slash events ✓
#
# v8.46 — Twenty-seventh-pass conflict audit (complete chain audit: serve() recount,
#          VALID_EVENTS internal event leakage, topical-gaps mechanism, crawler security,
#          LinkedIn/YouTube downstream outputs, brandToken storage)
#          Read: All 12 Phase 1 Sprint prompts, CLAUDE.md, Foundations, LLD v8.45.
#
#          FIX 1 (BT-01): brandToken has no storage definition.
#                → crawler-log-ingest.ts references "validates brandToken" but no table
#                  column exists anywhere in the LLD. The Visit API validates against nothing.
#                → Fix: brands.brand_token TEXT UNIQUE — Phase 2 Sprint 6 ALTER.
#                  nanoid(32) generated on brand creation or first snippet use (lazy).
#                  Backfill UPDATE for existing brands. Validation pattern documented.
#
#          FIX 2 (TG-01): calculate-topical-gaps.ts Action Center mechanism unspecified.
#                → Spec said "Triggers Action Center recommendations" but never said HOW.
#                  Claude Code could emit an event (wrong) or do nothing (wrong).
#                → Fix: direct db.insert(actionItems) for top-3 priority gaps (Phase 1
#                  pattern). Dimension='frequency', confidenceLabel='likely'. No event
#                  emitted — direct INSERT avoids unnecessary function hop.
#
#          CLEAN angles:
#            serve() recount: 25 functions / 25 registrations — perfect match ✓
#            VALID_EVENTS: all new internal events ('trend/aggregated', 'citations/classified',
#              'draft/generate', 'task/completed', 'technical-audit/complete') absent from
#              VALID_EVENTS as required — only dot-convention external events in list ✓
#            audit-linkedin-presence + audit-youtube-presence: both document "Stores in
#              [table]" and "Triggers Action Center recommendations" — consistent with
#              Phase 1 pattern (direct INSERT) ✓
#            check-cross-platform-consensus: explicitly documents action_items creation ✓
#
# v8.45 — Twenty-sixth-pass conflict audit (complete Inngest event chain audit:
#          all 25 function triggers verified; emitter-listener consistency; downstream
#          chain completeness; Zod scope assessment)
#          Read: All 12 Phase 1 Sprint prompts, CLAUDE.md, Foundations, LLD v8.44.
#
#          FIX 1 (AV-01): aggregate-visibility-trend.ts missing 'trend/aggregated' emit.
#                → NR-01 (v8.44) told generate-narrative-report.ts to listen on this event
#                  but never added the emit to aggregate-visibility-trend.ts itself.
#                  The chain was broken at the emitter end — the event would never fire.
#                → Fix: emit documented in aggregate-visibility-trend.ts spec.
#                  Conditional on active report_delivery_schedules row (avoids emitting
#                  for brands with no report schedule).
#
#          FIX 2 (PC-01 through PC-06): 6 post-audit Phase 2 functions had event
#                descriptions ("Fires after each audit") but no event name.
#                → Claude Code cannot write { event: 'audit/complete' } without the name.
#                  All 6 confirmed to listen on 'audit/complete' (Phase 1 canonical event
#                  from Sprint 6 run-audit.ts):
#                  PC-01 classify-citation-sources    → 'audit/complete'
#                  PC-02 calculate-share-of-voice     → 'audit/complete'
#                  PC-03 detect-hallucinations        → 'audit/complete'
#                  PC-04 capture-evidence-snapshot    → 'audit/complete' (Agency+ gate)
#                  PC-05 run-comparison-prompts       → 'audit/complete'
#                  PC-06 simulate-query-fan-out       → 'audit/complete' (Growth+ gate)
#
#          FIX 3 (CI-01 + CI-02): classify-citation-sources → build-citation-source
#                chain was broken — no event between them.
#                → classify-citation-sources now emits 'citations/classified'.
#                → build-citation-source-intelligence now listens on 'citations/classified'
#                  (NOT 'audit/complete' directly — must wait for classification first).
#
#          CLEAN angles:
#            send-scheduled-reports.ts: daily cron documented ✓
#            Zod validation on Phase 2 mutation routes: sprint prompt scope, not LLD.
#              Phase 1 establishes z.object() pattern; CLAUDE.md mandates it; LLD has 2
#              concrete Zod examples for reference ✓
#
# v8.44 — Twenty-fifth-pass conflict audit (systematic Inngest trigger audit across
#          all 25 Phase 2 functions — checking each has a documented trigger event)
#          Read: All 12 Phase 1 Sprint prompts, CLAUDE.md, Foundations, LLD v8.43.
#
#          FIX 1 (NR-01): generate-narrative-report.ts missing trigger event.
#                → 4th function found without a trigger (after TR-01, GD-01, RE-01).
#                → Spec said "fired after aggregate-visibility-trend.ts" but no event.
#                → Fix: listens on 'trend/aggregated' (emitted by aggregate-visibility-trend
#                  after writing a visibility_trends row). Chain pattern: trend aggregation
#                  → report generation. Fires only when report_delivery_schedules has an
#                  active row for the brand (checked before generation).
#
#          FIX 2 (RE-01): refresh-entity-score.ts missing trigger event.
#                → Says "runs ALONGSIDE Sprint 7" but no event documented.
#                → Fix: listens on 'technical-audit/complete' (internal slash convention).
#                  Sprint 7 technical-audit-run.ts must emit BOTH:
#                    'technical-audit.complete' (dot, for webhook delivery/VALID_EVENTS)
#                    'technical-audit/complete' (slash, for internal function chaining)
#                  Both are required — webhook subscribers get dot, Inngest functions get slash.
#
#          FIX 3 (SR-01): score-agent-readiness.ts — trigger event name not specified.
#                → Said "Fires after each technical audit" — no event name.
#                → Fix: 'technical-audit/complete' (same pattern as RE-01).
#
#          FIX 4 (AE-01): audit-entity-home.ts — trigger event name not specified.
#                → Said "Fires after each technical audit (content-structure pass)" — no event.
#                → Fix: 'technical-audit/complete' (same pattern as RE-01).
#
#          CLEAN angles:
#            Phase 2 Sprint 1 migration ordering: 6 tables have no inter-dependencies —
#              any CREATE TABLE order works safely ✓
#            linkedin_presence_audits: 21 columns fully specified ✓
#            youtube_presence_audits: 22 columns fully specified ✓
#            25 Phase 2 functions checked systematically — no other missing triggers ✓
#
# v8.43 — Twenty-fourth-pass conflict audit (fresh angles: generate-content-draft
#          trigger, visibility_trends empty period, report_delivery_schedules is_active,
#          content_format_detected existence, citation_volatility_score type,
#          run-journey step naming, brand_web_mentions columns, audit_trail RLS)
#          Read: All 12 Phase 1 Sprint prompts, CLAUDE.md, Foundations, LLD v8.42.
#
#          FIX 1 (GD-01): generate-content-draft.ts missing trigger event.
#                → Same pattern as TR-01 (trigger-validation-reaudit.ts, v8.39).
#                  Function spec said "on-demand" but had no Inngest event specified.
#                  Claude Code cannot implement an Inngest function without a trigger.
#                → Fix: listens on 'draft/generate' event (internal slash convention).
#                  Server action emits on user "Generate draft" click.
#                  contentFormat passed in event payload. Full skeleton documented.
#
#          FIX 2 (EP-01): aggregate-visibility-trend.ts empty period not handled.
#                → If a brand has no completed audits in the cron period (new brand,
#                  all audits failed), the SQL JOIN produces no rows.
#                  Without explicit spec, Claude Code inserts zeros — corrupting trend
#                  charts and triggering false Action Center alerts.
#                → Fix: explicit SKIP rule — if COUNT(completed audits in period) = 0,
#                  do NOT insert a row. Same pattern as minimum sample handling for
#                  citation_volatility_score (already documented).
#
#          FIX 3 (SN-01): run-journey.ts has no Inngest step.run structure.
#                → Without step.run(), the entire 5-turn × 4-engine journey (20 LLM
#                  calls) is one atomic step. A failure at turn 4 restarts all 20 calls
#                  from scratch — wastes quota and prolongs user-facing delays.
#                → Fix: step.run per engine per turn documented.
#                  Step naming pattern: 'turn-{i}-{engine}' — deterministic across
#                  retries (turn number and engine from journey definition), so
#                  template literal step names are safe. Inngest replays correctly.
#
#          CLEAN angles:
#            report_delivery_schedules.is_active: BOOLEAN NOT NULL DEFAULT true ✓
#            content_structure_audits.content_format_detected: column exists in CREATE TABLE ✓
#            citation_volatility_score: NUMERIC(5,2) with minimum sample handling ✓
#            brand_web_mentions.engine_citation_seen: correct column (not a phantom) ✓
#            audit_trail RLS: standard org_isolation policy, consistent with Phase 1 ✓
#              Role-based read restrictions handled at API layer, not RLS layer ✓
#
# v8.42 — Twenty-third-pass conflict audit (fresh angles: email_on_hallucination
#          default, task_score formula, generate-narrative-report and
#          generate-content-draft model and concurrency, LLM function sweep)
#          Read: All 12 Phase 1 Sprint prompts, CLAUDE.md, Foundations, LLD v8.41.
#
#          FIX 1 (CC-04 + MS-01): generate-content-draft.ts missing model + concurrency.
#                → Function spec had format guidance (listicle/how_to_guide etc.) but
#                  no selectModel() reference and no concurrency limit.
#                → CLAUDE.md §8 anti-pattern: hardcoding model strings outside
#                  model-selector.ts. Without a selectModel() call, Claude Code hardcodes
#                  a model string, violating the established pattern.
#                → Fix: selectModel(tier, engine, 'content_draft') documented in spec.
#                  concurrency: { limit: 5 } added (on-demand drafts, many orgs possible).
#
#          FIX 2 (CC-05 + MS-02): generate-narrative-report.ts missing model + concurrency.
#                → Same pattern. Report generation fires after trend aggregation — Agency Pro
#                  25 brands fires 25 simultaneous instances at month end.
#                → Fix: selectModel(tier, engine, 'narrative_generation') documented.
#                  concurrency: { limit: 5 } added.
#
#          CLEAN angles:
#            email_on_hallucination DEFAULT: BOOLEAN DEFAULT true correctly specified ✓
#            task_score formula: booking(5) + pricing(5) + service_area(5) +
#              faq_direct_answers(max 5) = 20 — the 4th signal accounts for the /20 max ✓
#            calculate-topical-gaps.ts first-run: cron-only is deliberate design decision.
#              New brands wait up to 6 days — acceptable trade-off for weekly analytics ✓
#            LLM model coverage sweep: simulate-query-fan-out uses openai.embedding()
#              (fixed model, not selectModel — correct), run-journey and
#              run-comparison use LLMService.complete() which routes through selectModel ✓
#              build-citation-source-intelligence: SQL aggregation, no LLM call ✓
#            Monthly/event-driven functions (audit-linkedin, audit-youtube, consensus,
#              entity-home, aggregate-trend, classify-citations): concurrency not set —
#              low risk at monthly cadence with 25 brands max ✓
#
# v8.41 — Twenty-second-pass conflict audit (fresh angles: llmstxt_versions
#          uniqueness, org_members invitation token, evidence_snapshots,
#          data_residency_log, content_structure_audits origin, run-comparison-prompts
#          and run-journey.ts concurrency)
#          Read: All 12 Phase 1 Sprint prompts, CLAUDE.md, Foundations, LLD v8.40.
#
#          FIX 1 (IT-01): org_members missing invitation_token column.
#                → The invitation flow specifies step 4 as "User GETs ...?token=<nanoid>"
#                  and step 5 as "API validates token then sets accepted_at=now()".
#                  But org_members had NO column to store the token — the accept endpoint
#                  cannot validate a token that was never persisted.
#                → Fix: invitation_token TEXT UNIQUE added to org_members. Generated at
#                  invite time (nanoid(21)), stored here, cleared to NULL after acceptance
#                  (single-use). UNIQUE prevents duplicate tokens across invites.
#
#          FIX 2 (CC-02): run-comparison-prompts.ts missing Inngest concurrency limit.
#                → Same CC-01 pattern fixed for fan-out in v8.40.
#                → Agency Pro: 25 brands × 3 competitors × 4 engines = 300 concurrent
#                  LLM calls without a limit — hits OpenAI rate limits.
#                → Fix: concurrency: { limit: 3 } → 36 max concurrent LLM calls.
#
#          FIX 3 (CC-03): run-journey.ts missing Inngest concurrency limit.
#                → Agency+: 25 brands × 5 turns × 4 engines = 500 concurrent LLM calls.
#                → Journey runs are longer (multi-turn) so lower limit than fan-out.
#                → Fix: concurrency: { limit: 3 } → 60 max concurrent LLM calls.
#
#          CLEAN angles:
#            llmstxt_versions: llmstxt_one_current_per_brand partial unique index already
#              present in live spec (CREATE UNIQUE INDEX ... WHERE is_current = true) ✓
#            evidence_snapshots: well-defined — audit_id ON DELETE SET NULL ✓
#            data_residency_log: complete — data_type, storage_region, provider,
#              UNIQUE(org, data_type) for UPSERT pattern ✓
#            content_structure_audits: Phase 2 Sprint 6 table (GAP 8) confirmed in
#              Sprint 6 plan — not a Phase 1 table, not a conflict ✓
#
# v8.40 — Twenty-first-pass conflict audit (fresh angles: Drizzle relation pattern,
#          org_members permission matrix, report_templates sections TS type, fan-out
#          concurrency, hallucination citation FK, engine_citation_seen stored/computed)
#          Read: All 12 Phase 1 Sprint prompts, CLAUDE.md, Foundations, LLD v8.39.
#
#          FIX 1 (TS-01): report_templates.sections JSONB missing TypeScript interface.
#                → The sections column had a JSON shape documented in comments but no
#                  TypeScript interface — violating the Phase 1 EB5/RS-01 pattern.
#                  Without it Claude Code uses `any`, losing type safety on every report
#                  generation path (filter, render, white-label PDF export).
#                → Fix: ReportSection interface added to lib/communication/types.ts spec.
#                  Union of 12 section type values (all derived from seed data).
#                  include: boolean, order?: number. Cast pattern documented.
#
#          FIX 2 (CC-01): simulate-query-fan-out.ts missing Inngest concurrency limit.
#                → The function has sample-org exclusion, retired-prompt filter, engine
#                  gate, budget policy — but no concurrency config.
#                → Without it: Agency Pro bulk-run fires 25 simultaneous instances.
#                  25 × 12 sub-queries × 4 engines = 1,200 concurrent LLM calls.
#                  OpenAI tier limits would trigger 429 errors, failing fan-out silently.
#                → Fix: concurrency: { limit: 5 } added to createFunction options.
#                  5 × 48 = 240 max concurrent LLM calls — within provider limits.
#                  Inngest queues excess runs automatically; no data loss, no manual retry.
#
#          CLEAN angles:
#            Drizzle relations: entire codebase uses db.select() — .relations() not needed ✓
#            org_members: fully specified — permission matrix (4 roles × 8 actions),
#              brand_access JSONB (null = all brands, or [brandId,...] array),
#              invitation flow (5-step), UNIQUE org+user constraint ✓
#            hallucination_incidents.citation_id ON DELETE SET NULL: correct ✓
#            brand_web_mentions.engine_citation_seen: stored TEXT column (set during
#              track-brand-web-mentions.ts scrape after citations JOIN check) ✓
#            org_feature_flags: 8 canonical flag_key values, no unsafe DEFAULT ✓
#
# v8.39 — Twentieth-pass conflict audit (fresh angles: Drizzle relations pattern,
#          org_feature_flags defaults, audit_trail Phase 2 coverage, brand_won type,
#          result_summary TypeScript type, re-audit trigger mechanism)
#          Read: All 12 Phase 1 Sprint prompts, CLAUDE.md, Foundations, LLD v8.38.
#
#          FIX 1 (AT-01): audit_trail missing Phase 2 action values.
#                → The action column had 9 Phase 1 values but ZERO Phase 2 values.
#                  Phase 2 introduces user-facing actions not captured: draft_approved,
#                  draft_dismissed, journey_triggered, hallucination_acknowledged,
#                  feature_flag_changed, data_residency_accessed,
#                  competitive_benchmark_viewed.
#                → Without these, the Phase 8 audit trail is incomplete — compliance
#                  and agency audit reports would miss critical customer actions.
#                → Fix: all 7 Phase 2 action values documented with resource_type
#                  mappings (content_draft | journey | hallucination_incident | etc.).
#
#          FIX 2 (TR-01): trigger-validation-reaudit.ts trigger mechanism not specified.
#                → Spec said "14 days after task.completed_at" but never stated WHAT
#                  Inngest event or cron fires the function. Claude Code cannot implement
#                  an Inngest function without knowing its trigger.
#                → Fix: specifies event-driven pattern — listens on 'task/completed'
#                  (emitted by PATCH /api/tasks/[id] when status→'complete'), then uses
#                  step.sleep('14 days') before firing 'audit/start'. Full function
#                  skeleton documented. WHY NOT CRON: cron has timing race condition;
#                  event + step.sleep is exact and replay-safe.
#
#          FIX 3 (RS-01): workflow_runs.result_summary has no TypeScript interface.
#                → Phase 1 EB5 fix established the pattern: JSONB columns on Phase 2
#                  tables need TypeScript interfaces (not `any`). result_summary shape
#                  was documented in SQL comments but not as a TypeScript type.
#                → Fix: WorkflowRunResult interface added to lib/workflow/types.ts spec,
#                  matching all 7 workflow_type values. Cast pattern documented.
#
#          CLEAN angles:
#            Drizzle .relations(): not used — entire codebase uses db.select() (not
#              db.query.findMany). No .relations() definitions needed. ✓
#            org_feature_flags: 8 canonical flag_key values documented, is_enabled has
#              no DEFAULT (deliberate — caller must explicitly set ON/OFF), UNIQUE
#              constraint on org+flag_key, expires_at for time-limited overrides. ✓
#            comparison_prompt_results.brand_won: BOOLEAN ✓
#            Sprint 9 re-audit timing: "14 days post-fix" (not 48h — 48h was SLA
#              timing for a different spec). Consistent throughout. ✓
#
# v8.38 — Nineteenth-pass conflict audit (fresh angles: email deduplication,
#          ENV VAR completeness, ALTER column conflicts, null handling for cross-sprint
#          data, journey ordering, citation column existence, web scraping rate limits,
#          source column value format, ARIA + mobile scope assessment)
#          Read: All 12 Phase 1 Sprint prompts, CLAUDE.md, Foundations, LLD v8.37.
#
#          FIX 1 (EM-01): Weekly digest vs scheduled reports — duplicate Monday email.
#                → Phase 1 send-weekly-digest.ts and Phase 2 send-scheduled-reports.ts
#                  both default to Monday 23:00 UTC. An Agency user with a Phase 2 weekly
#                  report schedule would receive TWO Monday emails — poor UX, spam risk.
#                → Fix: send-weekly-digest.ts must check for an active weekly report
#                  delivery schedule for each brand and SKIP the Phase 1 digest when one
#                  exists. SQL filter pattern documented. Phase 2 report is the richer
#                  superset; upgrade is seamless (no manual unsubscribe needed).
#
#          FIX 2 (CPR-01): comparison_prompt_results null handling in Sprint 3 missing.
#                → The competitive benchmark route reads comparison_prompt_results but
#                  this table is built in Sprint 7, 4 sprints later. No spec for what
#                  the route returns in the Sprint 3-6 window when the table is empty.
#                → Without this spec, Claude Code either crashes ("cannot read of
#                  undefined") or returns an empty object with no explanation.
#                → Fix: route returns { comparisonData: null, dataAvailableFrom: 'Sprint 7' }
#                  when table is empty. generateText narrative call is SKIPPED when
#                  comparisonData is null. UI shows a "Coming soon" placeholder card.
#
#          FIX 3 (RL-01): Web scraping rate limiting not specified.
#                → track-brand-web-mentions.ts scrapes Reddit/YouTube/Quora for all brands
#                  weekly. No delay between brand scrapes documented. With 25 brands
#                  (Agency Pro), rapid back-to-back calls risk Reddit 429 errors and
#                  Quora Cloudflare bot detection.
#                → Fix: Reddit = 1s delay between brands (Inngest step.sleep('1s')).
#                  YouTube = no extra delay needed (25 brands/week = 400 quota units/day,
#                  well within 10,000/day limit). Quora = 2s delay (CF bot protection).
#
#          FIX 4 (SC-01): linkedin_gap_source and consensus_gap_source value format undefined.
#                → Both are TEXT columns with comment "which gap spawned this task" but no
#                  value format. A developer doesn't know: UUID? Slug? Free text?
#                → Fix: documented as type slugs with full valid value lists:
#                  linkedin_gap_source: 'missing_company_page' | 'low_follower_count' | ...
#                  consensus_gap_source: 'nap_mismatch' | 'category_mismatch' | ...
#
#          CLEAN angles:
#            content_structure_audits ALTER: no IF NOT EXISTS ALTERs found for Phase 2
#              entity_home columns — columns added via Sprint 6 migration correctly ✓
#            journey_run_results turn ordering: turn_results JSONB array + first_mention_turn
#              INTEGER provide ordering within and across turns ✓
#            citation_source_intelligence.brand_present_in_source: exists in CREATE TABLE ✓
#            ARIA/accessibility + mobile responsiveness: sprint prompt concern, not LLD scope.
#              Phase 1 BK4 ARIA patterns (aria-current, aria-label score bars) provide the
#              precedent for sprint prompts to follow in Phase 2 ✓
#            Phase 2 ENV VARS: YOUTUBE_API_KEY is the only new key needed ✓
#
# v8.37 — Eighteenth-pass conflict audit (fresh angles: seed ordering, ON DELETE
#          coverage, source column table existence, partial index, budget unique
#          constraint, workflow_runs enum, pagination, loading.tsx, agent scoring)
#          Read: All 12 Phase 1 Sprint prompts, CLAUDE.md, Foundations, LLD v8.36.
#
#          FIX 1 (PA-01): Pagination missing on two unbounded list endpoints.
#                → GET /api/brands/[id]/wins — wins accumulate weekly over months;
#                  no LIMIT documented. Added: default LIMIT 20 ORDER BY detected_at DESC,
#                  query param ?limit=N (max 50) for infinite scroll.
#                → GET /api/brands/[id]/brand-mentions (GAP 14) — scraped weekly, could
#                  reach 100+ rows/year. Added: cursor pagination (?before=<ISO>&limit=50).
#                → GET /api/brands/[id]/progress returns a SUMMARY OBJECT — no pagination
#                  needed; clarified in spec.
#
#          FIX 2 (PA-02): loading.tsx skeleton screens missing for all Phase 2 pages.
#                → Phase 1 BK3 fix added loading.tsx for core routes (Sprint 10).
#                → Phase 2 adds ~14 new route folders across 8 sprints — none had
#                  loading.tsx specified, violating the performance standard
#                  ("loading states are non-negotiable" per Sri's standing instruction).
#                → Added a Phase 2-wide loading.tsx requirement section listing every
#                  required loading.tsx by sprint, with the skeleton pattern to use
#                  (animate-pulse, match real page layout, not a generic spinner).
#
#          CLEAN angles (no conflicts):
#            Seed file ordering: metric_quality_gates + provider_market_capabilities both
#              Sprint 1, no FK dependency between them ✓
#            content_drafts.task_id ON DELETE SET NULL: correct (draft preserved) ✓
#            remediation_tasks linkedin_gap_source/consensus_gap_source: source tables
#              (linkedin_presence_audits, brand_consensus_checks) both exist ✓
#            config_bundle_cache partial unique index: CREATE UNIQUE INDEX
#              config_bundle_one_active correctly defined ✓
#            market_ai_budget_policies UNIQUE on market_code+segment+use_case: present ✓
#            workflow_runs.workflow_type enum: 6 values documented + status lifecycle ✓
#            Event naming convention: slashes internal, dots external — consistent ✓
#            Agent readiness scoring formula: 5 dims × /20 = total_score/100; 
#              local_ai_trust_score is a separate /100 composite, not summed ✓
#            error.tsx: Phase 1 also omits it — build-time decision, not an LLD conflict.
#              Recommend adding error.tsx alongside loading.tsx in each sprint prompt.
#
# v8.36 — Seventeenth-pass conflict audit (fresh angles: market codes, wins feed
#          shape completeness, sprint data deps, tier gate splits, event naming,
#          content_format mapping, cron conflict, serve() registration)
#          Read: All 12 Phase 1 Sprint prompts, CLAUDE.md, Foundations, LLD v8.35.
#
#          FIX 1 (WF-04): Wins Feed shape — type field had no documented enum.
#                → The shape showed `type` as a plain field with one example value
#                  (new_citation). The 2 new types added in v8.33 (TRUST_IMPROVED,
#                  NEW_ENGINE_COVERAGE) were defined in the win-detection logic but
#                  NOT in the shape definition. A developer implementing wins-feed.ts
#                  would not know all 7 valid values.
#                → Fix: shape updated to include all 7 type values as a documented
#                  union: new_citation | visibility_up | competitor_down | gap_closed |
#                  new_engine | trust_improved | new_engine_coverage. Example updated
#                  to include the 'likely linked to:' prefix on reason per v8.19 rule.
#
#          CLEAN angles (no conflicts found):
#            Market code vocabulary: 'au' → 'AU_EN' bridge documented; no Phase 2 function
#              uses lowercase 'au' as market_code directly ✓
#            Sprint 3 → Sprint 7 data dependency: comparison_prompt_results reference in
#              Sprint 3 benchmark is correctly documented as intentional progressive
#              enhancement (Sprint 3 partial, Sprint 7 complete) ✓
#            Journey vs Comparison tier gate split: Journey=Agency+ (correct), 
#              Comparison=Growth+ (correct); L~583 Growth+ reference is in changelog only ✓
#            generateText cost control: per-page-view call (haiku, 120 tokens ≈ $0.0001),
#              budget policies are per-audit — different cost model, no conflict ✓
#            content_format valid values: full listicle/how_to_guide/comparison_article/
#              faq_block/expert_article mapping documented in content-format-selector.ts ✓
#            Event naming convention: internal=slashes (audit/complete), external=dots
#              (report.generated) — consistent throughout ✓
#            Report delivery cron vs Phase 1 weekly digest: both default to Monday
#              23:00 UTC (intentional alignment, documented in mutual exclusivity note) ✓
#            serve() registration: 25 function specs, 25 imports — perfect match ✓
#
# v8.35 — Sixteenth-pass conflict audit (fresh angles: sprint build order, ALTER
#          compatibility, generateText model spec, tier gate consistency)
#          Read: All 12 Phase 1 Sprint prompts, CLAUDE.md, Foundations, LLD v8.34.
#
#          FIX 1 (BD-01): Sprint build order — remediation_tasks (Sprint 2) had REAL FK
#                constraints (REFERENCES) to query_fan_out_results and topical_coverage_gaps
#                — both Sprint 3 tables. Postgres rejects a CREATE TABLE with REFERENCES to
#                a non-existent table. The Sprint 2 migration would fail at runtime.
#                → Fix: fan_out_gap_id and topical_gap_id changed to plain UUID in Sprint 2
#                  CREATE TABLE. Sprint 3 migration adds the FK constraints via ALTER TABLE
#                  ADD CONSTRAINT. IF NOT EXISTS on columns is already present so existing
#                  rows are safe. Full ALTER TABLE statements documented in Sprint 3 section.
#
#          FIX 2 (GN-01): generateText model parameter missing — the Competitor Narrative
#                spec (v8.33) called generateText without specifying which model to use.
#                Claude Code would pick a default or hallucinate a model name.
#                → Fix: specified claude-haiku-4-5-20251001 (cheapest/fastest for 2-sentence
#                  generation), maxTokens: 120, system/prompt pattern documented inline.
#
#          FALSE POSITIVE RESOLVED: brand_entity_scores.organization_id ALTER — initially
#                flagged as a duplicate (column exists in Phase 1). Sprint 7 schema confirmed:
#                Phase 1 brand_entity_scores has NO organization_id column (only brandId,
#                abnVerified, scoreOf10, etc.). The Phase 2 ALTER is correct and necessary.
#
#          CLEAN angles: tier gate consistency (competitive-benchmark has Growth/Agency/Pro
#                gates ✓), conversation_journeys has both brand + org FK for RLS ✓,
#                all NOT NULL ALTERs have DEFAULT values ✓, no Sprint 3→5 forward FKs ✓.
#
# v8.34 — Fifteenth-pass conflict audit (fresh angles targeting v8.33 new content)
#          Read: All 12 Phase 1 Sprint prompts, CLAUDE.md, Foundations, LLD v8.33.
#          FOCUS: audited the 5 additions made in v8.33 (Opportunity Impact Score,
#          Executive Weekly AI Brief, Explainability Contract, Competitor Narrative,
#          Wins Feed expansion) against Phase 1 schema for column-name correctness.
#
#          FIX 1 (WF-01): TRUST_IMPROVED win type — two wrong column references.
#                → brand_entity_scores.entity_score_of_10 does NOT exist. Phase 1 Sprint 7
#                  EE4 fix confirms the column is score_of_10 (Drizzle: scoreOf10), joined
#                  via brandId + MAX(checkedAt) per EC4 fix (no FK to technical_audits).
#                → hallucination_incidents.status='resolved' does NOT exist. The table has no
#                  status column — resolution is tracked via is_acknowledged BOOLEAN +
#                  acknowledged_at TIMESTAMPTZ. Fixed both references.
#
#          FIX 2 (WF-02): Opportunity Impact Score — gap row derivation used non-existent columns.
#                → Spec said "derive from gap size: >50pt gap = high" — topical_coverage_gaps
#                  has NO numeric gap-size column. Also referenced competitor_advantage_pct
#                  which does not exist on any table.
#                → Fixed: gap rows derive impact from priority_rank + cross_prompt_impact
#                  (both real columns on topical_coverage_gaps). Competitive benchmark derives
#                  from citation_rate delta computed at query time from share_of_voice_snapshots
#                  (no competitor_advantage_pct column needed).
#
#          FIX 3 (WF-03): Explainability Contract — confidenceLabel unreachable on gap rows.
#                → The 5-question contract requires confidenceLabel on every output, but
#                  topical_coverage_gaps has no confidence column. Adding one would be a schema
#                  change (out of scope per ChatGPT Phase 2.5 instruction).
#                → Fixed: gap rows hardcode confidenceLabel='likely' in the UI layer with
#                  explicit rationale ("Confidence: Likely — based on competitor content
#                  analysis"). action_items use stored value ✓. comparison_prompt_results
#                  derive from brand_won field. All three cases now documented explicitly.
#
#          CLEAN angles: generateText vs streamText usage split ✓, template_type free TEXT
#          (no enum conflict, 'weekly_executive' is valid) ✓, NEW_ENGINE_COVERAGE citations.engine
#          column confirmed in Phase 1 Sprint 2 schema ✓.
#
# v8.33 — ChatGPT Phase 2.5 Product Enhancement Review (selective apply)
#          Source: Phase2LLDReviewComments_Improvements_Phase2.5.md
#          Instruction: "Update LLD only where changes provide clear customer value and do not
#          require major schema changes, sprint reshuffling, or architecture redesign."
#          7 recommendations reviewed. 5 applied (UX/display/spec enhancements, no schema changes).
#          2 deferred (Rec 3 = Phase 3, Rec 7 = GTM guidance only).
#
#          APPLIED:
#          Rec 1 [HIGH] Opportunity Impact Score display — expectedImpactScore (already on
#                action_items) must also display as coloured pill on topical gap rows, competitive
#                benchmark items, and wins feed entries. Evidence-based reason required. No schema
#                change — UX display rule added near Wins Feed spec.
#
#          Rec 2 [HIGH] Executive Weekly AI Brief format — structured format spec added for the
#                weekly digest (Phase 1 Sprint 9) and generated_reports (Phase 2 Sprint 4).
#                template_type='weekly_executive' to be seeded in Sprint 4. 3-bullet headline +
#                top opportunity + one action. Plain English, outcome-oriented. No schema change.
#
#          Rec 4 [HIGH] Explainability Contract — 5-question standard (Where/Why/What/Impact/
#                Confidence) elevated from a feature to a PLATFORM-WIDE ACCEPTANCE CRITERION.
#                Added as a mandatory gate on every customer-facing intelligence output in Phase 2.
#                Vitest enforcement extended. No schema change.
#
#          Rec 5 [MEDIUM] Competitor Narrative Layer — plain-English "why they're winning" text
#                generated at read-time using Vercel AI SDK (generateText). Added to
#                GET /api/brands/[id]/competitive-benchmark as a computed field
#                (competitorNarrative: string). 2 sentences max, evidence-based. No new table.
#
#          Rec 6 [MEDIUM] Wins Feed — 2 new win categories added: TRUST_IMPROVED (entity score
#                rose or hallucination resolved) and NEW_ENGINE_COVERAGE (first-ever citation on
#                a new engine). Implemented in wins-feed.ts in Phase 2 Sprint 5. No new table.
#
#          DEFERRED (not applied):
#          Rec 3 Agency Client Success Centre → Phase 3 scope (ChatGPT's own label). Portfolio
#                page (Phase 1 Sprint 9) partially covers it. Re-evaluate post-launch.
#          Rec 7 Phase 3 Strategic Moat → GTM/positioning guidance only. Already aligned with
#                the existing differentiation strategy (Local AI Trust, AU verticals, execution layer).
#          Marketing position copy → No LLD impact. Apply to landing page copy in Sprint 11.
#
#          CHATGPT FINAL VERDICT RECORDED: "The LLD should now enter execution mode. No major
#          architecture redesign recommended. Build → Validate → Learn."
#
# v8.32 — ChatGPT Product/Positioning/CX Review (Addendum v1.0) — 2 UX refinements; rest validated.
#          Reviewer: ChatGPT. Scope: positioning, CX, monetisation, GTM, feature priority, feasibility.
#          NOT a schema review (ChatGPT's own framing). Scores given: Architecture 9.5, Product 9.0,
#          CX 8.5, Agency-fit 9.5, Monetisation 9.0. Verdict: "no longer constrained by architecture;
#          highest-leverage work is positioning, onboarding, outcomes, retention, agency acquisition."
#          8 of 10 recommendations were ALREADY in the LLD / v8.26 changelog (validation). ChatGPT
#          itself marked nearly all as "No schema changes / positioning only". Only two were concrete
#          presentation-spec refinements worth folding in; one GTM nuance was genuinely new.
#
#          VALIDATED — already present, no change (ChatGPT confirming prior decisions):
#            Rec1 outcome positioning      → already recorded P1/GTM2 (v8.26); "why AI engines recommend
#                                            competitors instead of you" already in the doc.
#            Rec2 Health Check onboarding  → Health Check UX spec already present (v8.19 CHANGE 7).
#            Rec3 Local AI Trust pillar    → local_ai_trust_score present; P2 recorded (v8.26).
#            Rec4 rename Competitive Bench → customer-language-in-UI-only already recorded (v8.26).
#            Rec7 explainability contract  → ExplainabilityAnnotation present; treated as a rule.
#            Rec8 agency-first GTM         → GTM1 recorded (v8.26); architecture already agency-shaped.
#            Rec10 launch sequence         → F1 recorded (v8.26); identical 7-step sequence.
#            (Future-enhancements deferral — journeys/predictive/simulation — matches existing scope.)
#
#          APPLIED — UX REFINEMENT 1 [Rec 6] — Progress Tracker two-state display.
#                → Risk: customers who complete work but whose validation re-audit hasn't run yet
#                  (~14-day lag) perceive inactivity. Added an explicit TWO-STATE presentation rule to
#                  the existing Progress Tracker spec: WORK COMPLETED (task count, shown immediately)
#                  vs MEASURED IMPACT (lift, "validation audit scheduled — pending" until score_after
#                  is set, then the number). Preserves the honesty rule (no projected lift). No schema
#                  or query change — presentation-layer only.
#
#          APPLIED — UX REFINEMENT 2 [Rec 5] — Wins Feed chronological timeline ordering.
#                → Made explicit that the Wins Feed renders as a dated timeline, newest first
#                  (ORDER BY detected_at DESC). detected_at already exists in the shape, so no new
#                  field — just made the timeline framing (and its retention/agency-reporting value)
#                  explicit. No new table.
#
#          RECORDED AS GTM GUIDANCE (no LLD impact — captured for marketing/positioning):
#            Rec9 [NEW] Avoid "Enterprise AI Visibility Platform" messaging during early-stage growth.
#                 Position as "built for Australian businesses and agencies; enterprise-READY
#                 architecture." Enterprise tier exists in the model but is not the launch motion.
#            Rec7 process note: add the 5-question explainability contract (Where do I stand? / Why? /
#                 What do I do? / Expected impact? / Confidence?) as ACCEPTANCE CRITERIA on future
#                 customer-facing stories — a build-process rule, not a schema item.
#
#          OVERALL: this round was ~90% validation of decisions already in the LLD/changelog plus pure
#          positioning copy ChatGPT itself flagged as no-schema-impact. Consistent with the v8.31
#          conclusion, the document needs no further conflict auditing; remaining work is GTM,
#          onboarding, and the Sprint 1 build.
#
# v8.31 — Fourteenth-pass conflict audit (16 fresh angles, none overlapping v8.16-v8.30).
#          Read: All 12 Phase 1 Sprint prompts (full), CLAUDE.md, Foundations v1.12, LLD v8.30.
#          NOTE: 1 genuine conflict found this pass (route collision). The schema/architecture is
#          now very stable after 14 passes; remaining issues are sparse and increasingly cosmetic.
#
#          NEW ANGLES EXAMINED (none from prior audits):
#            v8.30 notification_preferences col naming — CONSISTENT (camel property/snake column) ✓
#            FK referenced column non-'id' — all 83 FKs target (id) ✓
#            NUMERIC(p,s) ratio/percentage overflow — 0-1 cols are NUMERIC(4,3), /100 are (5,2) ✓
#            Inngest fan-out step count vs limit ✓
#            Two functions writing same table/row without UPSERT — single writer per table ✓
#            date_trunc on DATE vs TIMESTAMPTZ — only on completed_at (TIMESTAMPTZ) ✓
#            Orphan enum switch branch — claim_type/severity logic correct (false positive) ✓
#            Self-referencing task dependency cycle — no self-ref FKs on tasks/drafts ✓
#            CHECK referencing nullable column ✓
#            UNIQUE blocking intentional duplicate insert ✓
#            Stripe webhook freshness vs tier reads ✓
#            JSONB filtered without GIN — the one @> filter is pre-bounded to ~400 rows ✓
#            Boolean is_X/has_X semantics inversion — consistent conventions ✓
#            Denormalized stale value — only 'vertical' (immutable per brand, documented) ✓
#            API route path collision — FOUND (see FIX 1)
#            Numeric DEFAULT outside valid domain ✓
#
#          FIX 1 [LOW-MODERATE] — RT-01: GET /api/brands/[id]/citation-sources declared in TWO layers.
#                → The route was listed in BOTH the Layer 2 (Visibility) route block ("source type
#                  breakdown by engine") AND the Layer 3 (Trust) route block ("[GAP 4] source
#                  intelligence"). Next.js App Router permits only ONE handler per path — two route
#                  files at the same path collide at build/runtime.
#                → The backing table (citation_source_intelligence) is [GAP 4] and lives in LAYER 3;
#                  the frontend page (citation-sources/page.tsx) is under the GAP-4 section; the
#                  writers (classify-citation-sources.ts → build-citation-source-intelligence.ts) are
#                  GAP 4. There is no separate Layer-2 source-breakdown table or function — the Layer 2
#                  entry was a pure duplicate.
#                → Removed the Layer 2 declaration; Layer 3 is canonical. Left a NOTE in the Layer 2
#                  block recording where the endpoint lives and why it is not declared there.
#
#          CONFIRMED CLEAN / FALSE POSITIVES (no change): v8.30 notification_preferences naming is
#            consistent with Phase 1 (emailOnX camel property → email_on_x column); the
#            claim_type/severity classification correctly sets severity FROM claim_type (both enum
#            sets valid); the cited_sources @> containment filter is pre-bounded by
#            "audit_id IN (last 10 audits for brand)" to a ~400-row set so it needs no GIN index;
#            'vertical' denormalization is on an immutable per-brand value and is documented.
#
# v8.30 — Thirteenth-pass conflict audit (16 fresh angles, none overlapping v8.16-v8.29).
#          Read: All 12 Phase 1 Sprint prompts (full), CLAUDE.md, Foundations v1.12, LLD v8.29.
#
#          NEW ANGLES EXAMINED (none from prior audits):
#            Enum-like TEXT cols lacking CHECK + value doc — flagged were canonical domain enums ✓
#            Phase 2 reads renamed/removed Phase 1 column ✓
#            Inngest concurrency/rate-limit on multi-LLM functions — cost bounded by BudgetPolicy ✓
#            Percentage 0-1 vs 0-100 write/read consistency ✓
#            FK to append-only/UPSERT Phase 2 table targeting stable id ✓
#            JSONB DEFAULT '[]' vs '{}' vs none ✓
#            Composite UNIQUE missing market_code/locale ✓
#            Sprint 11/12 no-schema claim ✓
#            Notification type emitted without a notification_preferences column — FOUND (see FIX 1)
#            Wilson CI / RUNS_PER_PROMPT reuse ✓
#            Supabase Storage path uniqueness ✓
#            Cron day-of-week 0=Sun vs 1=Mon consistency ✓
#            Tier gate referencing non-existent tier ✓
#            JSONB element shape: table-doc vs function-consumption ✓
#            created_at vs event-time ordering ✓
#            ON DELETE CASCADE multi-hop blast radius — single-hop ✓, but FOUND a wrong CASCADE (FIX 2)
#
#          FIX 1 [MODERATE] — NP-01: Phase 2 alert types had no per-type notification preference.
#                → Phase 2's alert-composer.ts sends FOUR alert types (hallucination, drift, consensus,
#                  volatility), but ALL were gated on the single Phase 1 emailOnDrift toggle, and there
#                  was no ALTER adding preference columns for the three new types. Two failures:
#                  (a) a user who DISABLES drift emails would silently lose CRITICAL hallucination
#                  alerts; (b) a user who wants only hallucination alerts cannot separate them. This
#                  breaks the Phase 1 pattern of one boolean per notification type (emailOnDrift,
#                  emailOnAuditComplete, emailOnScheduleFailure).
#                → Added ALTER TABLE notification_preferences (nullable, additive — the established
#                  Phase 2 method) with email_on_hallucination (DEFAULT true — critical, like
#                  emailOnScheduleFailure), email_on_consensus + email_on_volatility (DEFAULT false —
#                  informational, like emailOnAuditComplete). Corrected the alert-composer recipients
#                  to gate EACH alert on its OWN column, with COALESCE(...,default) for legacy NULL rows.
#
#          FIX 2 [MODERATE] — HI-01: hallucination_incidents.citation_id CASCADE destroyed trust history.
#                → hallucination_incidents.citation_id used ON DELETE CASCADE, so when
#                  audit-data-retention.ts purges citations at 12 months, the incident is DELETED.
#                  But hallucination incidents are TRUST records of the SAME class as evidence_snapshots
#                  (both Layer 3), and evidence_snapshots deliberately uses ON DELETE SET NULL + is
#                  EXCLUDED from the retention cron precisely so trust/compliance history survives.
#                  CASCADE here was inconsistent — it lost the AU compliance record (e.g. "ChatGPT
#                  misstated our registration N times in 2026", the AHPRA/Medibank use case) at 12mo.
#                → Changed to ON DELETE SET NULL (citation_id was already nullable). The incident's own
#                  columns (engine, incorrect_claim, correct_value, severity, claim_type) preserve it
#                  independently of the citation — mirroring evidence_snapshots' raw_response. Added a
#                  note that, like evidence_snapshots, it is brand-scoped (no audit_id) so the retention
#                  cron does not reach it directly.
#
#          CONFIRMED CLEAN: enum value docs (canonical domain enums), Phase 1 column refs, Inngest
#            cost-control (BudgetPolicy hardStop, not concurrency), percentage representation, JSONB
#            defaults, UNIQUE market_code coverage, Sprint 11/12 no-schema, Wilson CI reuse, storage
#            paths, cron day-of-week, tier-gate validity, JSONB shapes, ordering, CASCADE blast radius.
#
# v8.29 — Twelfth-pass conflict audit (16 fresh angles, none overlapping v8.16-v8.28).
#          Read: All 12 Phase 1 Sprint prompts (full), CLAUDE.md, Foundations v1.12, LLD v8.28.
#
#          NEW ANGLES EXAMINED (none from prior audits):
#            RLS WITH CHECK references organization_id — all 30 RLS tables HAVE it (v8.28 valid) ✓
#            setRlsContext on every query path ✓
#            Drizzle relations() reflection ✓
#            Composite/unique index redundancy ✓
#            JSONB query-operator shape assumptions ✓
#            Cron timezone AEST/AEDT offset math — FOUND swapped labels (see FIX 2)
#            TS enum exhaustiveness over status/type ✓
#            Stripe tier/price metadata reuse ✓
#            Prose counts vs actual (37 tables / 16 GAPs — older 36/38 are historical changelog) ✓
#            NULL handling in UNIQUE (NULLS distinct) ✓
#            Cross-layer FK direction (build-order) ✓
#            Inngest cron+event dual-trigger consistency ✓
#            Numeric DEFAULT vs CHECK range ✓
#            TEXT[] array operations vs population ✓
#            Migration idempotency for CREATE INDEX/POLICY — FOUND inconsistent (see FIX 1)
#            Reaudit/re-trigger loop guard — CLEAN: tasks are user-created, human gate breaks the
#              fix→reaudit→fix cycle; per-audit recommendation keying (Sprint 6 DC3) + quota gate
#              (U-14) bound it. No runaway loop. ✓
#
#          FIX 1 [LOW-MODERATE] — MI-01: migration file mixes idempotent + non-idempotent statements.
#                → The Phase 2 migration uses `ADD COLUMN IF NOT EXISTS` (32×), showing clear intent
#                  that the file may be re-run (CI retry, resumed partial deploy). But the SAME file's
#                  37 CREATE TABLE, 35 CREATE INDEX, and 2 CREATE POLICY statements are NOT idempotent
#                  by default — a re-run would crash at the first one.
#                → Added a migration-idempotency note + made the RLS template idempotent:
#                  CREATE TABLE → IF NOT EXISTS; CREATE INDEX → IF NOT EXISTS (PG ≥9.5);
#                  CREATE POLICY → preceded by `DROP POLICY IF EXISTS` (Postgres has no
#                  CREATE POLICY IF NOT EXISTS in any version — this is the standard Supabase-PG15
#                  idempotent idiom); ENABLE RLS is already idempotent. Protects the partial-failure /
#                  manual-replay path even when drizzle-kit tracks completed migrations.
#
#          FIX 2 [LOW] — TZ-01: AEST/AEDT labels + offsets swapped in 4 cron comments.
#                → AEST (standard, winter) = UTC+10; AEDT (daylight, summer) = UTC+11. Four comments
#                  had these backwards or computed with the wrong offset:
#                  - aggregate-visibility-trend changelog + cron (20:00 UTC): said "06:00 AEDT" —
#                    20:00+11=07:00 AEDT (summer) / 20:00+10=06:00 AEST (winter).
#                  - calculate-topical-gaps cron (21:00 UTC): said "07:00 AEDT" — should be 08:00 AEDT.
#                  - report_delivery_schedules time_of_day (23:00 UTC): said "09:00 AEDT (UTC+10) /
#                    10:00 AEST (UTC+11)" — both offset AND label wrong; should be 10:00 AEDT (UTC+11
#                    summer) / 09:00 AEST (UTC+10 winter).
#                → Comments-only (the cron EXPRESSIONS are UTC and were already correct), but in an AU
#                  product where DST matters these mislead reasoning about real run times for AU
#                  customers. Corrected all four to match the LLD's own canonical note (AEDT=UTC+11
#                  Oct-Apr, AEST=UTC+10 May-Sep).
#
#          CONFIRMED CLEAN: v8.28 RLS WITH CHECK is valid (all 30 tables have organization_id),
#            setRlsContext coverage, index redundancy, JSONB operators, enum exhaustiveness, Stripe
#            metadata, prose counts, UNIQUE NULL handling, cross-layer FK direction, dual-trigger
#            consistency, DEFAULT/CHECK range, array ops, reaudit-loop guard.
#
# v8.28 — Eleventh-pass conflict audit (16 fresh angles, none overlapping v8.16-v8.27).
#          Read: All 12 Phase 1 Sprint prompts (full), CLAUDE.md, Foundations v1.12, LLD v8.27.
#
#          NEW ANGLES EXAMINED (none from prior audits):
#            Drizzle pgTable vs raw-SQL DDL parity ✓
#            JSONB internal field-key naming consistency ✓
#            Index column-list vs served query (coverage) ✓
#            Phase 1 file/function reuse claims exist — verified (4 apparent misses were Phase 2-new) ✓
#            Cron frequency vs tier audit frequency ✓
#            FK ON DELETE on global/seed-table references — FOUND missing (see FIX 2)
#            Numeric range/CHECK gaps ✓
#            Multi-column UNIQUE omitting a varied column ✓
#            Webhook event taxonomy: Phase 2 new events vs Sprint 8 — FOUND unwired (see FIX 1)
#            Inngest step.run idempotency ✓
#            Enum value in WHERE vs documented set ✓
#            Currency/locale display vs stored NUMERIC ✓
#            Retention/TTL coverage on recent tables ✓
#            RLS policy WITH CHECK presence on write tables — FOUND missing (see FIX 3)
#            Pagination/ordering determinism ✓
#            Event-time *_at columns defaulting to now() ✓
#
#          FIX 1 [MODERATE] — WH-01: 5 new webhook events declared in VALID_EVENTS but not wired.
#                → v8.x added 5 Phase 2 webhook events (report.generated, hallucination.detected,
#                  hallucination.acknowledged, visibility.trend.updated, agent.readiness.scored) to
#                  the VALID_EVENTS Zod enum so customers can SUBSCRIBE to them. But Sprint 8's
#                  fanout-webhooks.ts only TRIGGERS on 3 internal events and maps only 3 external
#                  events. None of the new internal slash-events appeared anywhere in the LLD.
#                → Result: a customer could subscribe to these 5 events, but fanout-webhooks would
#                  never fire for them — configurable-but-undeliverable (silent non-delivery).
#                → Fixed: specified the fanout-webhooks extension — the internal slash-events to add
#                  to its trigger list, the internal→external deliveryEventName map entries, and
#                  which Phase 2 function emits each (generate-narrative-report, detect-hallucinations,
#                  the acknowledge API, aggregate-visibility-trend, score-agent-readiness). Each emit
#                  must carry { organizationId } per the Sprint 8 payload contract.
#
#          FIX 2 [LOW-MODERATE] — FK-ON-DELETE: 5 FKs to hard-deletable/config targets lacked ON DELETE.
#                → Prior audits (v8.21/8.23) gave ON DELETE to FKs targeting ephemeral tables and
#                  established that brand_id/organization_id/user_id FKs correctly OMIT it (Phase 1
#                  soft-delete). But 5 FKs pointed at targets that CAN be hard-deleted or are global
#                  config, with no ON DELETE — a deletion there would hit NO ACTION and block:
#                  - audit_cost_snapshots.budget_policy_id → market_ai_budget_policies
#                  - query_fan_out_results.original_prompt_id → vertical_pack_prompts
#                  - content_drafts.task_id → remediation_tasks
#                  - generated_reports.template_id → report_templates
#                  - report_delivery_schedules.template_id → report_templates
#                → All set to ON DELETE SET NULL (each child is a historical/independent record that
#                  should survive its referent's deletion with the link nulled). Aligns with Phase 1
#                  CK3 (every FK to vertical_pack_prompts must declare an ON DELETE for future-proofing).
#                  All five columns were already nullable, so SET NULL is valid.
#
#          FIX 3 [MODERATE] — RLS-WITHCHECK: Phase 2 RLS template was USING-only (no WITH CHECK).
#                → The spec claimed to match "the Phase 1 pattern from Sprint 2", but Phase 1's
#                  pattern for WRITTEN tables is `FOR ALL` with BOTH `USING` and `WITH CHECK` (Sprint 1
#                  "Users mutate only their org's brands"). The Phase 2 template had USING only.
#                → USING filters row VISIBILITY; WITH CHECK validates the org of INSERTed rows and the
#                  NEW org on UPDATE. Without WITH CHECK, a user-context write could insert a row with
#                  a foreign organization_id or move a row to another org — defeating tenant isolation
#                  on the WRITE path. All 30 Phase 2 tenant tables are written, so all need it.
#                → Fixed the template to `FOR ALL ... USING (...) WITH CHECK (...)` and documented why
#                  (Inngest jobs bypass RLS via service_role, but API writes rely on this backstop —
#                  the LLD's own defense-in-depth model). Global/seed tables stay RLS-disabled.
#
#          CONFIRMED CLEAN: Drizzle/DDL parity, JSONB key naming, index coverage, Phase 1 reuse-file
#            existence, cron-vs-tier frequency, CHECK/range, UNIQUE completeness, step idempotency,
#            enum-in-WHERE, currency display, retention coverage, pagination determinism.
#
# v8.27 — Tenth-pass conflict audit (16 fresh angles, none overlapping v8.16-v8.26;
#          extra scrutiny on the v8.26 Wins Feed + Progress Tracker additions).
#          Read: All 12 Phase 1 Sprint prompts (full), CLAUDE.md, Foundations v1.12, LLD v8.26.
#
#          NEW ANGLES EXAMINED (none from prior audits):
#            v8.26 new-surface query correctness (Wins Feed, Progress Tracker) — FOUND honesty-rule gap
#            Aggregate SQL on TEXT columns ✓
#            GROUP BY / DISTINCT correctness ✓
#            Function→table WRITER matrix (orphan tables) — FOUND data_residency_log has no writer
#            Table→READER matrix (data nobody consumes) ✓
#            Tier gate on new v8.26 endpoints (wins/progress = Starter+) ✓
#            weekly-digest-cron Phase 1 shape respected by Phase 2 appends ✓
#            Cross-period date math timezone — v8.26 query matches Phase 1 quota (UTC month) ✓
#            NUMERIC SUM overflow — Postgres SUM(NUMERIC) auto-expands precision, safe ✓
#            Nullable column in arithmetic without COALESCE — progress query uses COALESCE ✓
#            Phase 1 column-name drift (citations.cited_sources) ✓
#            Inngest event payload shape ✓
#            API method correctness (wins/progress correctly GET) ✓
#            Seed ordering ✓
#            Boolean FILTER (WHERE ...) clause correctness — FILTER fix (see FIX 1) ✓
#            Enum values in new v8.26 win 'type' spec ✓
#
#          FIX 1 [MODERATE] — PT-01: v8.26 Progress Tracker query contradicted its own honesty rule.
#                → The query I added in v8.26 summed lift_achieved with a date filter but did NOT
#                  filter `score_after IS NOT NULL`, while the prose two lines below it stated lift
#                  must only be shown where a re-audit actually ran. A developer copying the SQL
#                  would have included unverified/NULL-coupled lift, displaying "improvement" that
#                  was never measured — the exact dishonesty the v8.19 rule forbids.
#                → Fixed: added `score_after IS NOT NULL` to the SUM FILTER so the SQL ENFORCES the
#                  rule rather than relying on lift_achieved and score_after staying coupled. Also
#                  documented that date_trunc('month', now()) is UTC calendar month — identical to
#                  Phase 1 quota-check.ts (Sprint 9 GD3) — so "this month" matches the quota-reset
#                  month; explicitly told the builder NOT to switch this boundary to AEST.
#
#          FIX 2 [MODERATE] — DR-01: data_residency_log had a reader + RLS but NO writer.
#                → Every other Phase 2 table has a documented writer (a function spec, UPSERT, or
#                  seed). data_residency_log had GET /api/organizations/[id]/data-residency, RLS,
#                  and a tier-matrix row — but nothing ever INSERTed into it, so the endpoint would
#                  always return empty (a table + API that could never have data).
#                → Added a WRITER spec: lib/governance/record-data-residency.ts performs a
#                  DECLARATIVE upsert (residency is a platform-infrastructure property, identical
#                  per org → one row per data class) from a static config map, called on org
#                  provisioning and idempotently on the nightly governance cron. Documented the
#                  data_type / storage_region / provider value sets (Supabase Sydney ap-southeast-2
#                  for stored data; provider-default regions for transient LLM processing).
#                → Added UNIQUE(organization_id, data_type) so the documented UPSERT ON CONFLICT is
#                  valid and re-runs refresh rather than duplicate. This is the data-residency
#                  disclosure AU customers and DPAs ask for ("where does my data live?").
#
#          CONFIRMED CLEAN: orphan-writer scan cleared all other 36 tables (conversation_journeys
#            written by the create-journey API; org_members by the invite flow; workflow_runs by
#            schedule-workflow-runs.ts; global/seed tables by seed scripts). Wins Feed query
#            references real columns; both new endpoints correctly GET; SUM precision safe; month
#            boundary consistent with Phase 1 quota.
#
# v8.26 — ChatGPT Product/Positioning/GTM Review — 2 UX specs added; GTM decisions recorded.
#          Reviewer: ChatGPT. Scope: product strategy, CX, positioning, monetisation, feasibility.
#          NOTE: this was a PRODUCT/GTM review, not a conflict audit. Most recommendations were
#          ALREADY in the LLD (validation, not new work) — see "already present" list below.
#          Only the two genuinely-new UX surfaces were added; the rest are recorded as accepted
#          positioning guidance (no schema change needed for them).
#
#          ALREADY PRESENT (ChatGPT validated; confirmed in LLD, no change):
#            Autopilot closed-loop (Health Check→Explain→Prioritise→Execute→Re-Audit→Measure) ✓
#            AI Visibility Health Check UX packaging ✓
#            Competitive Benchmark Workspace (route + tier gates) ✓
#            Local AI Trust Score (agent_readiness_scores.local_ai_trust_score, /100) ✓
#            ExplainabilityAnnotation interface + Vitest enforcement ✓
#            Honest GA4-only ROI (visibility_trends.ai_referral_sessions + ai_lead_estimate) ✓
#            Agency-first capabilities (white-label, multi-brand, workflow, benchmarking) ✓
#
#          ADDED — UX SPEC 1 [CX1] — AI Visibility Wins Feed (positive-moments surface).
#                → Gap: the platform was rich in problem/gap detection but had NO dedicated
#                  positive-outcome surface; wins drive retention (remembered more than dashboards).
#                → NO NEW TABLE: a derived, read-only view over existing data. A "win" = new
#                  citation / visibility-rate rise / competitor citation drop / gap-closed with
#                  positive lift / newly-visible engine. Shape + GET /api/brands/[id]/wins (Starter+).
#                → Attribution honesty (inherited v8.19): "reason" shown as "likely linked to:",
#                  never asserted as proven cause. Surfaced on Dashboard + weekly email digest.
#
#          ADDED — UX SPEC 2 [CX2] — Action Progress Tracker cross-surface placement.
#                → Data already existed (remediation_tasks.score_before/after, lift_achieved, etc.)
#                  but there was no spec to surface "what improved this month?" beyond the workflow
#                  page. Added a placement requirement across 4 surfaces (dashboard card, generated
#                  reports, weekly email digest, white-label PDF) driven by ONE shared helper
#                  (lib/workflow/progress-summary.ts) + GET /api/brands/[id]/progress.
#                → Honesty rule: show lift only where score_after IS NOT NULL (a re-audit ran);
#                  never display projected lift as measured.
#
#          RECORDED AS ACCEPTED GTM/POSITIONING GUIDANCE (no LLD schema impact — captured here
#          so the build/marketing reflects it; these are decisions, not code):
#            P1 Outcome layer: pair each visibility score with a POTENTIAL traffic/lead impact
#               framed as a likely range from historical platform data. HARD GUARDRAIL: never
#               fabricate revenue/A$ projections (matches the v8.19 rejection of the revenue chain).
#            P2 Elevate Local AI Trust Score to a first-class product pillar (esp. tradies/health/
#               local services); prefer suburb-level plain-language scores over entity jargon.
#            GTM1 Primary go-to-market motion = Australian AGENCIES (one sale → many end customers);
#               SMBs secondary. The platform's white-label/multi-brand/workflow already fit this.
#            GTM2 Sell OUTCOMES not monitoring. Customer-language framing over feature names
#               ("why AI engines recommend competitors instead of you" > "track AI visibility";
#               "why competitors are winning / what they have that you don't" for the benchmark).
#            F1 Launch-sequence the customer-facing features (do NOT ship all layers at once):
#               1 Health Check → 2 Visibility Monitoring → 3 Citation Tracking →
#               4 Citation-Failure Diagnosis → 5 Local AI Trust → 6 Action Recommendations →
#               7 White-label Reporting. Everything else phases in later. (Aligns with the
#               existing 9-sprint plan; this is the customer-facing ROLLOUT order, not a re-scope.)
#            Naming: keep internal/table names; use customer language in UI/marketing copy only
#               (e.g. surface the "Competitive Benchmark Workspace" to users as "why competitors
#               are winning"). No schema/identifier renames.
#
# v8.25 — Ninth-pass conflict audit (16 fresh angles, none overlapping v8.16-v8.24).
#          Read: All 12 Phase 1 Sprint prompts (full), CLAUDE.md, Foundations v1.12, LLD v8.24.
#
#          NEW ANGLES EXAMINED (none from prior audits):
#            Tier-gate threshold consistency per feature — FOUND stale journey gate
#            GAP-number to Layer assignment ✓
#            Column-comment enum value coverage ✓
#            Cross-table score scale (/100,/20,/18,0-1) — intentional per concept ✓
#            Inngest trigger-type declaration (cron/event/webhook) ✓
#            ALTER TABLE nullable backfill safety ✓
#            FK targets to Phase 1 tables exist ✓
#            Numeric DEFAULT 0 vs NULL semantics ✓
#            Duplicate column definitions — none ✓
#            JSONB DEFAULT presence ✓
#            Client-portal vs org_members overlap ✓
#            Hardcoded 4-engine assumptions — tightened 1 comment to TIER_ENGINES ✓
#            period_label/period_type format — visibility_trends canonical, no clash ✓
#            Recommendation confidence systems ✓
#            Cost-figure self-consistency ✓
#            NOT NULL on append tables ✓
#
#          FIX 1 [MODERATE] — TG-01: stale 'Growth+' journey gates contradict the v8.19 Agency+ regating.
#                → v8.19 CHANGE 5 regated the conversation_journeys CUSTOMER-FACING UX from Growth+
#                  to Agency+ (Growth sees a locked teaser). The tier matrix (Layer 4 row) and the
#                  Sprint plan note were updated, but two spots were missed:
#                  - API route: 'POST /api/brands/[id]/journeys → create journey (Growth+)'
#                  - Cost table: 'run-journey.ts | ... | Growth+'
#                → Creating/running a journey is the customer-facing action that v8.19 locked to
#                  Agency+; leaving these at Growth+ would let a Growth org create journeys via API
#                  even though the dashboard is Agency-locked, and would fire run-journey.ts (LLM
#                  cost) for orgs that can't see the output.
#                → Fixed both to Agency+ with a v8.19 cross-reference. comparison_prompt_results
#                  correctly stays Growth+ (v8.19 explicit). run-journey.ts spec behaviour unchanged.
#
#          FIX 2 [MODERATE] — BE-01: stale entity_score in 5 brand_entity_scores summary references.
#                → The D-01 fix (v6.2) REMOVED entity_score INTEGER from the brand_entity_scores
#                  ALTER TABLE because Phase 1 score_of_10 NUMERIC(5,2) IS the canonical entity score;
#                  adding entity_score INTEGER would duplicate it. The actual ALTER correctly omits it
#                  (verified: 20 nullable columns added, no entity_score).
#                → But FIVE summary/reference lines still listed entity_score as an added column, and
#                  one stated the wrong count ('18 columns' / '21 columns' vs the real 20). A developer
#                  building from those summaries would re-introduce the exact duplicate D-01 removed.
#                → Fixed all five: removed entity_score from the column lists, corrected the count to
#                  20, and added a one-line note that score_of_10 is canonical (per D-01). The live
#                  ALTER TABLE was already correct and needed no change.
#                → Distinct from agent_readiness_scores.entity_clarity_score (/20), which was the
#                  H-03 rename of a same-named dimension in a different table — left intact.
#
#          CONFIRMED CLEAN: tier-gate matrix vs function specs (other than journey), GAP→Layer,
#            score scales, duplicate columns, JSONB defaults, period_label format, cost self-consistency.
#
# v8.24 — Eighth-pass conflict audit (16 fresh angles, none overlapping v8.16-v8.23).
#          Read: All 12 Phase 1 Sprint prompts (full), CLAUDE.md, Foundations v1.12, LLD v8.23.
#
#          NEW ANGLES EXAMINED (none from prior audits):
#            RLS policy correctness — all 30 RLS-enabled tables have real organization_id ✓
#            Global/seed table RLS — 7 global tables correctly have NO org-based RLS ✓
#            Engine-name vs provider-name vocabulary in isEngineEnabled() — FOUND breaking conflict
#            Composite index column order — leading columns match WHERE/ORDER BY ✓
#            Nullable FK vs NOT NULL business rule — consistent ✓
#            Timestamp DEFAULT now() vs app-set — consistent ✓
#            JSONB array vs object shape (writer vs reader) ✓
#            Sprint 8 SARIF/JUnit/GHA export coverage — enum complete ✓
#            Decimal scale truncation — NUMERIC scales adequate ✓
#            Free tier 2-engine limit — paid-tier features, limit respected ✓
#            Inngest concurrency/throttle config ✓
#            notification_preferences gating ✓
#            Sample-audit ChatGPT-only handling — FOUND incomplete exclusion
#            brand_entity_scores nullable-column null-safety ✓
#            market_code ('AU_EN') vs locale ('en-AU') — consistent pairing ✓
#
#          FIX 1 [BREAKING] — EG-01: ENGINE GATE used the wrong identifier vocabulary in 3 sites.
#                → Sprint 12 JD3 canonical: isEngineEnabled(engine: 'openai'|'anthropic'|'google'|
#                  'perplexity') — takes PROVIDER names, matching the LLM_ENGINE_*_ENABLED env vars
#                  (verified: isEngineEnabled('openai') returns true; env is LLM_ENGINE_OPENAI_ENABLED).
#                → Three Phase 2 ENGINE GATE code blocks were inconsistent and mostly WRONG:
#                  - run-journey.ts: ['chatgpt','claude','gemini','perplexity'].filter(isEngineEnabled(e as Engine))
#                  - run-comparison-prompts.ts: same ENGINE-name list + wrong cast
#                  - simulate-query-fan-out.ts: correct PROVIDER strings but a wrong 'as Engine' cast
#                → isEngineEnabled('chatgpt') checks LLM_ENGINE_CHATGPT_ENABLED, which DOES NOT EXIST.
#                  Result: the gate would wrongly skip ChatGPT/Claude/Gemini on EVERY run (or behave
#                  undefined), silently disabling 3 of 4 engines for journeys and comparisons.
#                → Fixed all three to one canonical pattern: keep Engine names for data writes
#                  (citations.engine, journey_run_results.engine) but gate on the mapped provider via
#                  ENGINE_TO_PROVIDER = { chatgpt:'openai', claude:'anthropic', gemini:'google',
#                  perplexity:'perplexity' }. fan-out now uses a typed Provider[] directly.
#                  Also re-added the Free/Starter 2-engine branch (ChatGPT+Perplexity) for comparison.
#
#          FIX 2 [MODERATE] — O-03b: sample-org exclusion applied inconsistently across per-audit funcs.
#                → O-03 (v7.1) + v8.20 added the slug='sample' exclusion to the aggregate functions
#                  and simulate-query-fan-out, but calculate-share-of-voice.ts and
#                  classify-citation-sources.ts ALSO fire after EVERY audit (including the Sprint 10
#                  synthetic sample audit) and had no exclusion.
#                → They would write share_of_voice_snapshots + citation_source_intelligence rows for
#                  the throwaway demo org (ChatGPT-only, auto-deleted 24h) — Growth+ analytics for a
#                  non-customer, and an inconsistent application of the established O-03 pattern.
#                → Added the same WHERE org.slug != 'sample' early-return guard to both function specs.
#
#          CONFIRMED CLEAN / FALSE POSITIVES (no schema change):
#            journey_run_results 'missing organization_id' — FALSE POSITIVE. The column IS present;
#              an automated check's find(');') was cut short by a '); ' inside a multi-line comment
#              I added this session (the exact corruption hazard the journal warns about). Verified
#              the table is intact (organization_id UUID NOT NULL REFERENCES organizations) and RLS
#              is correct. Reworded that comment to remove the '); ' so no future patcher mis-cuts it.
#            prompt_volume_estimates 'has organization_id' — FALSE POSITIVE (only in a comment);
#              it is correctly a global seed table with RLS disabled.
#
# v8.23 — Seventh-pass conflict audit (16 fresh angles, none overlapping v8.16-v8.22).
#          Read: All 12 Phase 1 Sprint prompts (full), CLAUDE.md, Foundations v1.12, LLD v8.22.
#
#          NEW ANGLES EXAMINED (none from prior audits):
#            Index NAME collisions (duplicate CREATE INDEX names) — 34 distinct, none dupe ✓
#            FK column type vs referenced PK type — all FKs UUID, all PKs UUID ✓
#            Inngest function ID/import uniqueness — 25 functions, no dupes ✓
#            NOT NULL booleans missing DEFAULT — matches Phase 1 (citations.brandMentioned) ✓
#            Reserved SQL keywords as identifiers — only 'role' (Phase 1 convention) ✓
#            Self-referencing / circular FK chains — none ✓
#            Sprint 3 RUNS_PER_PROMPT=5 — preserved + distinguished from sampling minimums ✓
#            Sprint 5 prompt count 336 (124+104+108) — referenced consistently ✓
#            Tier slug enum spelling — Phase 2 defers to Phase 1 TIER_* constants ✓
#            TEXT vs VARCHAR length caps — all TEXT, zero VARCHAR ✓
#            Missing FKs where relationship implied — FOUND report_delivery_schedules.brand_id
#            Sprint 7 crawler 20-page budget reuse — content-structure-audit reuses it exactly ✓
#            Cents rounding (Math.round) — consistent ✓
#            Unique business keys (brand_web_mentions append-only archive) — correct by design ✓
#            Phase 1 column-name references (promptsCount etc.) — correct; promptCount is a
#              BudgetService interface field, not a DB-column reference (internally consistent) ✓
#            FKs to EPHEMERAL Phase 2 tables without ON DELETE — FOUND breaking conflict
#
#          FIX 1-4 [BREAKING] — E-03b: FKs to ephemeral tables missing ON DELETE.
#                → v8.21 fixed audit_id ON DELETE on 5 tables, but FKs pointing at OTHER ephemeral
#                  Phase 2 tables (not audits directly) were never checked. Four were unprotected:
#                  - journey_run_results.journey_id → conversation_journeys (NOT NULL parent)
#                  - remediation_tasks.fan_out_gap_id → query_fan_out_results
#                  - remediation_tasks.topical_gap_id → topical_coverage_gaps
#                  - remediation_tasks.recommendation_id → recommendations (Phase 1)
#                → The critical chain: query_fan_out_results.audit_id has ON DELETE CASCADE (v8.21),
#                  so purging an old audit cascade-deletes its fan-out rows. But
#                  remediation_tasks.fan_out_gap_id referenced those rows with NO ON DELETE
#                  (NO ACTION) — the cascade would hit an FK violation and ABORT the audit deletion,
#                  crashing audit-data-retention.ts. Same latent failure class as v8.21, one hop
#                  removed (task → fan-out → audit).
#                → Fixed by lifecycle intent:
#                  - journey_run_results.journey_id → ON DELETE CASCADE. journey_id is NOT NULL
#                    (required parent), so SET NULL is impossible; run results are meaningless
#                    without their journey definition, so CASCADE is also semantically correct.
#                  - remediation_tasks.{recommendation_id, fan_out_gap_id, topical_gap_id}
#                    → ON DELETE SET NULL. A remediation task is the durable entity and OUTLIVES
#                    its ephemeral source; when the source is deleted/recomputed, keep the task
#                    and null the link (matches v8.21 remediation_tasks.reaudit_id treatment).
#
#          FIX 5 [MODERATE] — R-01: report_delivery_schedules.brand_id missing its FK entirely.
#                → It was declared as a bare `UUID` with no REFERENCES — the ONLY brand_id in the
#                  whole Phase 2 schema lacking a foreign key (the other 22 all reference brands(id)).
#                → Without the FK, a delivery schedule could point at a non-existent or deleted
#                  brand, producing orphaned schedules that try to email reports for a dead brand.
#                → Added `REFERENCES brands(id)` with NO ON DELETE clause, matching the other 22
#                  brand_id FKs (Phase 1 soft-delete convention via brands.deletedAt). Kept the
#                  column nullable: brand_id IS NULL = org-wide schedule; non-null = single brand.
#
#          CONFIRMED CLEAN / NOTED (no change):
#            promptCount (BudgetService TS interface field) maps correctly from audit.promptsCount;
#              internally consistent, but flagged as a near-identical-spelling footgun for devs.
#            org_members.role (4 roles + permission matrix) is a deliberate, documented extension
#              of Phase 1 users.role, with explicit org-level vs brand-scoped distinction.
#
# v8.22 — Sixth-pass conflict audit (15 fresh angles, none overlapping v8.16-v8.21).
#          Read: All 12 Phase 1 Sprint prompts (full), CLAUDE.md, Foundations v1.12, LLD v8.21.
#
#          NEW ANGLES EXAMINED (none from prior audits):
#            UNIQUE constraint completeness vs UPSERT functions — FOUND 2 contradictions
#            Inngest event-name delimiters (slash internal vs dot delivery) — false positive ✓
#            citation_source_intelligence partial unique indexes — correctly defined ✓
#            FK target typos (REFERENCES wrong table) — none found ✓
#            columns referenced but not defined in schema — all defined ✓
#            cron schedule collisions (Phase 1 vs Phase 2 times) — none, all distinct ✓
#            percent vs decimal representation (rates 0-100, ratios 0-1) — consistent ✓
#            pagination on list endpoints — Phase 1 convention covers it ✓
#            Supabase Storage paths (evidence_snapshots raw_response inline) — valid ✓
#            tier-gate vs audit-quota (system re-audit) — FOUND quota gap
#            migration ordering — ALTER TABLEs self-contained ✓
#            Sprint 11 landing/badge impact — no Phase 2 break ✓
#            generated_reports / report_delivery column completeness ✓
#            Wilson CI drift-overlap consistency ✓
#            audit completion event namespace (internal vs webhook) — correct ✓
#
#          FIX 1 [MODERATE] — U-13: agent_readiness_scores + generated_reports mislabeled UPSERT.
#                → Both carried updated_at comment 'set on UPSERT write' and the v8.17 changelog
#                  listed them as UPSERT targets — but NEITHER has a UNIQUE constraint or ON
#                  CONFLICT clause. PostgreSQL ON CONFLICT DO UPDATE requires a unique key;
#                  as written, an UPSERT would be impossible.
#                → Determined true design is APPEND-ONLY for both:
#                  - agent_readiness_scores: score-agent-readiness.ts 'alerts on significant
#                    score drop', which requires retaining history to compare newest vs previous.
#                    One dated row per run; query latest via (brand_id, scored_at DESC).
#                  - generated_reports: each report is a distinct artifact (own pdf_url +
#                    period_label) kept as an audit trail; regeneration inserts a NEW row.
#                    Its updated_at remains meaningful: pdf_url + email_sent_at are populated
#                    async after insert, each touch bumping updated_at.
#                → Corrected both column comments to APPEND-ONLY with accurate semantics.
#                  Annotated the two v8.17 changelog lines as reclassified (no UNIQUE added —
#                  adding one would be wrong; these tables must keep history).
#
#          FIX 2 [MODERATE] — U-14: trigger-validation-reaudit.ts missing quota handling.
#                → The D-05 fix established this function fires 'audit/start' (a FULL audit,
#                  14 days post-fix, to measure lift). The sibling audit-firing function
#                  schedule-workflow-runs.ts carries an explicit QUOTA NOTE requiring
#                  checkQuota() before 'audit/start' and states 'do NOT fire standalone audits
#                  outside the quota gate'. trigger-validation-reaudit.ts had NO quota note.
#                → Without it, a system re-audit could push a customer over TIER_AUDIT_LIMITS,
#                  or be blocked mid-run leaving score_after NULL and breaking lift tracking.
#                → Added QUOTA NOTE: check quota before firing; if over, handle GRACEFULLY —
#                  mark the re-audit deferred (markReauditDeferred(taskId,'quota_exceeded')),
#                  leave score_after NULL, surface 'validation pending — quota reached' on the
#                  task card, and retry in the next quota window. Never silently drop, since
#                  lift tracking is core product value. Keeps re-audits consistent with the
#                  Sprint 9 rule that nothing fires 'audit/start' outside the quota gate.
#
#          CONFIRMED CLEAN / FALSE POSITIVES (no change needed):
#            Inngest events: Sprint 8 line 1066 documents internal=slash ('audit/complete'),
#              delivery=dot ('audit.completed'). Phase 2 matches the BUILT convention; CLAUDE.md's
#              dot form for internal events is stale early design, not a Phase 2 conflict.
#            citation_source_intelligence: csi_unique_with_audit + csi_unique_aggregate partial
#              unique indexes ARE defined (multi-line CREATE UNIQUE INDEX) — correct K-01 fix.
#            crawler_visit_logs: append-only (not UPSERT) — no UNIQUE needed, correct.
#
# v8.21 — Fifth-pass conflict audit (15 fresh angles, none overlapping v8.16-v8.20).
#          Read: All 12 Phase 1 Sprint prompts (full), Foundations v1.12, Phase 2 LLD v8.20.
#
#          NEW ANGLES EXAMINED (none from prior audits):
#            CHECK constraints (actual vs promised) — Phase 1 uses pgEnum, consistent ✓
#            DEFAULT value consistency on NOT NULL columns ✓
#            NUMERIC(p,s) precision — scores=(5,2), ratios=(4,3), ratings=(3,2) consistent ✓
#            non-audit FK ON DELETE (brand_id/org_id) — matches Phase 1 no-clause pattern ✓
#            Sprint 7 technical_audits vs Phase 2 agent_readiness signal overlap
#            Sprint 4/9 PDF library — @react-pdf/renderer renderToBuffer() throughout ✓
#            action_items.status vs remediation_tasks.status — separate enums, intentional ✓
#            snake_case SQL vs camelCase Drizzle — zero camelCase leaks in Phase 2 SQL ✓
#            timestamp semantics (domain-event vs created_at) — consistent (v8.17) ✓
#            Sprint 2 totalCostUsd vs audit_cost_snapshots cents — conversion documented ✓
#            brands.competitors TEXT[] vs competitor_domain TEXT — sourcing documented (I-03) ✓
#            Sprint 8 webhook HMAC signing — Phase 1 mechanism, Phase 2 events only (v8.17) ✓
#            market_code DEFAULT 'AU_EN' — brand-scoped=default, seed=explicit, consistent ✓
#            Sprint 5 retiredAt filter — all real VPP query functions filter retiredAt IS NULL ✓
#            audit_id ON DELETE behaviour across ALL Phase 2 tables — FOUND BREAKING CONFLICT
#
#          FIX 1 [BREAKING] — audit_id FK missing ON DELETE on 5 Phase 2 tables.
#                → v8.17's E-03 check looked at tables that already had ON DELETE clauses;
#                  it did not catch the tables with NO clause at all (defaults to NO ACTION).
#                → Sprint 12 audit-data-retention.ts runs DELETE FROM audits WHERE created_at
#                  < 12-month cutoff every Sunday. PostgreSQL NO ACTION on a referencing FK
#                  RAISES a foreign-key violation and aborts the DELETE.
#                → Once Phase 2 data exists, ANY old audit referenced by these tables would
#                  make the retention cron crash on every run — a hard production failure.
#                → Two distinct lifecycle intents, fixed accordingly:
#                  PER-AUDIT ANALYTICS (delete with the audit) → ON DELETE CASCADE:
#                    - share_of_voice_snapshots.audit_id
#                    - citation_source_intelligence.audit_id
#                    - comparison_prompt_results.audit_id
#                  RECORDS THAT OUTLIVE THE AUDIT (keep row, null the link) → ON DELETE SET NULL:
#                    - remediation_tasks.reaudit_id (task tracks work, survives audit purge)
#                    - generated_reports.audit_id (client has the PDF; report record survives)
#                → Each fix carries an inline comment explaining CASCADE-vs-SET-NULL rationale.
#                → (audit_cost_snapshots, query_fan_out_results, google_ai_mode_results already
#                  had CASCADE; evidence_snapshots already had SET NULL — those were correct.)
#
#          FIX 2 [MODERATE] — workflow_runs.status had no documented enum.
#                → Every other status column in the LLD lists its values inline (audits,
#                  remediation_tasks, content_drafts, audit_schedules). workflow_runs.status
#                  showed only DEFAULT 'scheduled' and an incidental 'failed' in a comment.
#                → Documented: 'scheduled' | 'running' | 'completed' | 'failed' with the full
#                  lifecycle (scheduled→running→completed|failed) and the schedule-workflow-runs.ts
#                  transition points.
#                → NAMING NOTE added: workflow_runs uses 'completed' (-ed) while Phase 1
#                  audits.status uses 'complete'; flagged as deliberately separate enums on
#                  separate tables that must never be compared to each other.
#
#          FIX 3 [MODERATE] — Phase 1 complete/completed retention dependency surfaced.
#                → While tracing FIX 1, found a Phase 1-internal mismatch: Sprint 2 writes
#                  audits.status='complete' but the Sprint 12 retention cron filters
#                  eq(audits.status,'completed'). If unreconciled, the retention cron matches
#                  zero rows and never deletes any audit — meaning none of the FIX 1 CASCADE/
#                  SET NULL paths would ever execute.
#                → This is a Phase 1 bug, not a Phase 2 schema error, so it is recorded as a
#                  PHASE 1 DEPENDENCY NOTE on evidence_snapshots (the retention-behaviour anchor)
#                  rather than changed in the LLD schema. Phase 2 build must verify the Sprint 12
#                  cron uses 'complete' (matching Sprint 2) before trusting retention cleanup.
#
# v8.20 — Fourth-pass conflict audit (completely fresh angles from v8.16/v8.17/v8.18).
#          Read: All 12 Phase 1 Sprint prompts (full), Foundations v1.12, Phase 2 LLD v8.19.
#
#          NEW ANGLES EXAMINED (none overlap with prior audits):
#            Sprint 2 LLM mock scenario enum — Phase 2 references canonical 4 ✓
#            Sprint 3 composite score weights (0.25/0.25/0.20/0.15/0.15) — not referenced in P2 ✓
#            Sprint 5 vertical enum values — Phase 2 correctly references Phase 1 canonical ✓
#            Sprint 6 BLOCKED_KEYS — Phase 2 new keys confirmed not blocked ✓
#            Sprint 8 confidence label capitalisation — 3 intentionally different systems ✓
#            Sprint 9 weekly digest cron '0 23 * * 1' — consistent with LLD '23:00' UTC ✓
#            Sprint 10 sample org exclusion — across all Phase 2 aggregate functions
#            Sprint 12 ENGINE GATE isEngineEnabled() — across all LLM-calling functions
#            Phase 2 JSONB shape documentation audit — undocumented shapes identified
#            Phase 2 missing indexes on high-volume tables
#            hallucination_incidents is_false_positive — confirmed present (N-06 fix) ✓
#            org_feature_flags RLS — confirmed ENABLED ✓
#            citedSources on visibility_trends — FALSE POSITIVE, it's in a SQL comment ✓
#            data_residency_log structure — append-only, correct ✓
#
#          FIX 1 [MODERATE] — aggregate-visibility-trend.ts + simulate-query-fan-out.ts
#                missing sample org exclusion in their Inngest function spec bodies.
#                → O-03 fix (v7.1) logged in changelog that 4 functions needed the exclusion:
#                  aggregate-visibility-trend.ts, track-brand-web-mentions.ts,
#                  score-agent-readiness.ts, simulate-query-fan-out.ts.
#                → track-brand-web-mentions.ts and score-agent-readiness.ts had the note.
#                → aggregate-visibility-trend.ts and simulate-query-fan-out.ts specs did NOT.
#                → Claude Code reading these function specs would not know to exclude the
#                  synthetic sample org — trend aggregates and fan-out LLM calls would
#                  silently include Sprint 10 sample audits (auto-deleted within 24h,
#                  polluting trend data and consuming LLM quota with zero customer value).
#                → Fixed: added SAMPLE ORG EXCLUSION note to both function specs with
#                  the exact query pattern: WHERE organizations.slug != 'sample' OR IS NULL.
#
#          FIX 2 [MODERATE] — run-journey.ts + run-comparison-prompts.ts missing ENGINE GATE.
#                → Sprint 12 JD3 fix added isEngineEnabled() gate to simulate-query-fan-out.ts.
#                → run-journey.ts and run-comparison-prompts.ts also make multi-engine LLM calls
#                  but had no ENGINE GATE documented in their specs.
#                → Without this gate, if an LLM provider is disabled via env var
#                  (LLM_ENGINE_ANTHROPIC_ENABLED=false) during an incident, journey runs
#                  and comparison prompt runs would still attempt calls to the disabled
#                  provider and receive hard errors instead of graceful skips.
#                → Fixed: added ENGINE GATE note to both function specs with the exact
#                  filter pattern matching simulate-query-fan-out.ts canonical form.
#
#          FIX 3 [MODERATE] — journey_run_results + comparison_prompt_results missing indexes.
#                → Both are high-volume append-only tables (one row per journey turn per run;
#                  one row per competitor per prompt per engine per audit).
#                → Neither had any CREATE INDEX statements — full table scans on every query.
#                → journey_run_results: added (brand_id, run_at DESC) and (journey_id, run_at DESC)
#                  for the two primary access patterns: brand history view and specific journey runs.
#                → comparison_prompt_results: added (brand_id, run_at DESC), (audit_id), and
#                  (brand_id, competitor_domain, run_at DESC) for benchmark workspace queries.
#                → These indexes are especially important because comparison_prompt_results
#                  will accumulate fast: 4 engines × 3 competitors × 10 prompts × 12 audits/mo
#                  = 1,440 rows/brand/month on Growth tier. Without indexes, the Competitive
#                  Benchmark Workspace (v8.19) would degrade significantly within months.
#
# v8.19 — ChatGPT Independent Product Review — LLD changes accepted and applied.
#          Source documents: VisibleAU_Phase2_Strategic_Product_Gap_Analysis.md
#                           VisibleAU_Phase2_Strategic_Product_Addendum_v1.md
#
#          METHODOLOGY: Each of ChatGPT's 9 strategic enhancements was verified against
#          the actual LLD content before deciding whether to add, modify, or reject.
#          All claims about existing LLD content are grounded in direct inspection.
#
#          CHANGES NOT MADE (rejected or already present):
#            GAP 1 / SE1 — Competitor Citation Displacement: ALREADY IN LLD.
#              citation-failure-diagnosis.ts reads citation_source_intelligence +
#              comparison_prompt_results + topical_coverage_gaps and produces exactly
#              this output. Already in Sprint 3. No LLD change needed.
#            GAP 2 / SE2 — Opportunity Prioritization Engine: ALREADY IN LLD.
#              Priority Score = Impact × ConfidenceWeight ÷ EffortWeight implemented
#              exactly in lib/workflow/priority-scorer.ts + remediation_tasks.priority.
#              The formula ChatGPT specifies is identical to what the LLD has.
#            SE3 / GAP 3 — ROI: Revenue projection chain REJECTED.
#              "Estimated revenue opportunity: A$18,000/month" as a ChatGPT output is
#              dangerous for AU agency trust. Fabricated projections are the fastest
#              path to churn in a B2B SaaS. GA4-real-data-only version ACCEPTED (see below).
#            SE7 / GAP 4 — AI Visibility Journey for SMB: ADDRESSED via ACTION 5.
#              Data model built as planned (Sprint 7). UX regated to Agency+ only.
#            Recommendation Simulation: AGREED with ChatGPT — NOT building. Too early.
#            Advanced Trust Infrastructure: AGREED — Enterprise-stage, not v1.
#            Predictive Visibility Modeling: AGREED — needs historical data first.
#
#          CHANGE 1 [SCHEMA] — local_ai_trust_score column on agent_readiness_scores (SE5/GAP5).
#                → ChatGPT identified Local AI Trust Radius as HIGH priority differentiator.
#                → LLD had all 4 component data sources (local_seo_results, brand_entity_scores,
#                  citation_source_intelligence, agent_readiness_scores) but no composite score.
#                → Added: local_ai_trust_score INTEGER (/100) to agent_readiness_scores.
#                → Formula: GMB completeness(25%) + AU directory presence(25%) + ABN verified(15%)
#                  + NAP consistency(20%) + AU directory citation rate(15%).
#                → Computed by: lib/platform/local-ai-trust-scorer.ts (new module in Sprint 6).
#                → UI (Sprint 9 Growth+ SMB dashboard): "Local AI Trust: 67/100"
#                  Suburb-level breakdown for Tradies with multiple primaryRegions.
#                → SaaS brands: local_ai_trust_score = NULL (not applicable, skipped).
#
#          CHANGE 2 [SCHEMA] — ai_referral_sessions + ai_lead_estimate on visibility_trends (SE3/GAP3).
#                → ChatGPT asked for ROI Intelligence chain. Revenue projection rejected.
#                  GA4-connected honest version accepted.
#                → Added: ai_referral_sessions INTEGER (NULL if no GA4 connected; real GA4
#                  sessions from AI referrer sources: chatgpt.com, perplexity.ai, claude.ai, gemini.google.com)
#                → Added: ai_lead_estimate NUMERIC(8,2) (NULL if no GA4 conversion goal configured;
#                  = ai_referral_sessions × GA4 conversion rate when available)
#                → Populated by: aggregate-visibility-trend.ts when GA4 config exists.
#                → UI: "AI search sent 234 sessions. Your site converts at 3.2%. ~7 leads."
#                  When no GA4: "Connect GA4 to see actual numbers. Industry: 0.5–2% of traffic."
#                → WARNING documented: NEVER fabricate projections. Real GA4 data only.
#
#          CHANGE 3 [SPEC] — ExplainabilityAnnotation TypeScript interface (SE4/GAP9).
#                → ChatGPT identified Explainability as CRITICAL priority.
#                → LLD had ExplainabilityService.annotate() as mandatory but no TypeScript
#                  interface defined — Claude Code cannot implement what isn't specified.
#                → Added: ExplainabilityAnnotation interface with 5 typed fields:
#                  standingSummary (WHERE do I stand?), whyExplanation (WHY?),
#                  topAction (WHAT next?), expectedImpact (Impact?), confidenceNote (Confidence?)
#                → Added: Vitest enforcement note — empty rationale field fails CI.
#                → Added: Usage pattern: every Phase 2 API route returns { score, explainability }.
#
#          CHANGE 4 [SPEC] — Competitive Benchmark Workspace spec in Sprint 3 (SE8/GAP8).
#                → ChatGPT identified this as HIGH priority agency retention feature.
#                → LLD had data in 3 tables (SoV, topical gaps, comparison prompts) but no
#                  unified workspace UX specification anywhere.
#                → Added: Competitive Benchmark Workspace spec to Sprint 3 acceptance criteria.
#                → Route: GET /api/brands/[id]/competitive-benchmark?competitor=<domain>
#                → Shows: citations, topics, SoV, "why they're winning", fastest catch-up path.
#                → Tier gates: Growth=1 competitor, Agency=3, Agency Pro=unlimited.
#                → Locked teaser for Starter users.
#                ── COMPETITOR NARRATIVE LAYER (v8.33, ChatGPT Phase 2.5 Rec 5) ──
#                → In addition to raw metrics, the route generates a plain-English narrative
#                  explaining WHY the competitor is winning. Generated at read-time using the
#                  Vercel AI SDK (generateText) — NO new table, returned as a computed field.
#                → MODEL (GN-01 fix v8.35): use claude-haiku-4-5-20251001 (cheapest, fastest
#                  for 2-sentence generation). Never use a frontier model for this call.
#                  Implementation pattern:
#                    import { generateText } from 'ai';
#                    import { anthropic } from '@ai-sdk/anthropic';
#                    const { text } = await generateText({
#                      model: anthropic('claude-haiku-4-5-20251001'),
#                      maxTokens: 120,
#                      system: 'You are a plain-English analyst...',
#                      prompt: `Explain in 2 sentences why ${competitor} wins vs ${brand}...`,
#                    });
#                → Input: SoV delta + topical gaps + comparison_prompt_results for this competitor.
#                → Output shape: { ...existingFields, competitorNarrative: string }
#                → Example narrative:
#                  "Eastern Plumbing is consistently cited because they have stronger content
#                   coverage across emergency services and local suburb pages. They appear in
#                   3 of the 5 topic areas where you currently have no indexed content."
#                → Max 2 sentences. Evidence-based only — cite the specific gap or source.
#                → Cache: store narrative in Redis or recompute on each request (data is small).
#                → Agencies can paste this narrative directly into client reports — high value.
#
#          CHANGE 5 [TIER GATE] — conversation_journeys UX regated from Growth+ to Agency+ (SE7/GAP4).
#                → ChatGPT said Journey Intelligence is MEDIUM priority; complex for SMBs.
#                → Data model and Inngest functions built as planned in Sprint 7 (needed
#                  for Agency customers). UX (customer-facing journey dashboard) locked to Agency+.
#                → comparison_prompt_results stays at Growth+ (simpler, higher SMB value).
#                → Growth tier: conversation_journeys shows locked teaser card.
#                → Updated: tier gate table + Sprint 7 note + Growth tier phase 2 features.
#
#          CHANGE 6 [SPEC] — Sprint 9 renamed to "AI Visibility Autopilot UX" + closed-loop spec (SE9/GAP10).
#                → ChatGPT identified "OS positioning" as CRITICAL — Monitor→Explain→Prioritize→Execute→Measure.
#                → Sprint 9 renamed from "Adaptive Segment-Aware UX" to "AI Visibility Autopilot UX".
#                → Added: closed Autopilot loop spec — the one complete cycle Sprint 9 must demonstrate:
#                  Audit → Gap identified → Explanation → Draft approved → Re-audit → Lift measured.
#                → Added: ACTION PROGRESS TRACKER — "4 of 11 gaps closed. Citation rate ↑8%."
#                  Source: remediation_tasks WHERE status='complete'. No new tables. Sprint 9 delivery.
#                  This is the highest-value retention feature not previously in the LLD.
#
#          CHANGE 7 [SPEC] — AI Visibility Health Check UX packaging spec (SE6/GAP6).
#                → ChatGPT: "HubSpot Website Grader for AI Visibility" as onboarding hook. CRITICAL.
#                → Phase 1 Sprint 10 first-audit experience must be packaged as "Health Check."
#                → Added: Full Health Check page spec at end of Sprint 9 section (UX work here).
#                → Shows 5 sections with traffic-light status: AI Sentiment, AI Presence,
#                  Site Readiness, Local Authority, #1 Action.
#                → All data derived from existing Phase 1 + Phase 2 Sprint 6-7 output.
#                → No new tables, no new API endpoints. Pure UX packaging decision.
#                → This is the aha moment that converts trial users to paid customers.
#
# v8.18 — Third-pass conflict audit (new angles from v8.16 + v8.17).
#          Read: All 12 Sprint prompts (in full), Foundations v1.12, Phase 2 LLD v8.17.
#          Approach: Read Sprint 1 first 1,000+ lines in full; then systematically
#          compared Sprint 2-12 canonical values against LLD Phase 1 table docs.
#          20 angles examined; 2 genuine conflicts found; both fixed.
#
#          NEW ANGLES EXAMINED (not covered in v8.16 or v8.17):
#            Sprint 4 export formats vs audit_exports.format enum ✓
#            Sprint 9 notification_preferences column completeness ✓
#            Sprint 10 subscriptions.tier as sole source of truth ✓
#            Sprint 1 TIER_BRAND_LIMITS vs Phase 2 brand limits ✓
#            Sprint 2 LLM cache key / expiresAt pattern ✓
#            Sprint 7 technical_audits — Phase 2 ALTER TABLE check ✓
#            report_delivery_schedules.time_of_day UTC default ✓
#            brand_entity_scores ALTER TABLE — no entity_score duplicate ✓
#            drizzle.config.ts tablesFilter for Better Auth tables ✓
#            content_structure_audits UNIQUE(brand_id, page_url) as implicit index ✓
#            Cron expressions — all UTC, no AEST literals ✓
#            remediation_tasks.wont_fix_reason Zod refine ✓
#            content_drafts.draft_type naming convention mapping ✓
#            workflow_runs.result_summary JSONB shape ✓
#            Sprint 8 drift_alerts schema ✓
#            Sprint 9 GA4/Looker Studio endpoint references ✓
#            content_drafts.score_before/score_after scope ✓
#            brand_entity_scores Phase 2 ADD COLUMN completeness ✓
#            Sprint 12 no schema changes (confirmed again) ✓
#            sprint 11 landing page — no schema changes ✓
#
#          FIX 1 [MODERATE] — audit_exports.format enum missing 'csv' and 'json'.
#                → Phase 1 table docs listed format as ('sarif'|'junit'|'gha'|'pdf').
#                → Sprint 4 canonical: export endpoint delivers pdf + csv + json (Sprint 4);
#                  sarif + junit + gha ship in Sprint 8 with "Coming Sprint 8" stubs.
#                → audit_exports.format must include all 6 values or Sprint 4's CSV/JSON
#                  exports will have no matching valid value to write.
#                → Fixed: format ('pdf'|'csv'|'json'|'sarif'|'junit'|'gha') with note
#                  indicating Sprint 4 vs Sprint 8 which values ship when.
#
#          FIX 2 [MODERATE] — notification_preferences missing 2 columns in table docs.
#                → Protected table docs listed only: weeklyDigest, digestEmail, emailOnDrift.
#                → Sprint 9 canonical (GD2 fix) has 5 columns:
#                  weeklyDigest, digestEmail, emailOnDrift,
#                  emailOnAuditComplete (boolean DEFAULT false),
#                  emailOnScheduleFailure (boolean DEFAULT true).
#                → Phase 2 code referencing emailOnAuditComplete or emailOnScheduleFailure
#                  would appear to be using undocumented columns. Claude Code building
#                  Phase 2 alert functions would not know these columns exist.
#                → Fixed: all 5 columns listed in protected table docs with defaults noted.
#
#          CONFIRMED CLEAN (same angles, different depth):
#            audit_exports ON DELETE — Phase 1 table, no Phase 2 ALTER TABLE risk ✓
#            report_delivery_schedules.time_of_day DEFAULT '23:00' UTC (H-05 fix) ✓
#            brand_entity_scores no entity_score duplicate (D-01 fix) ✓
#            subscriptions.tier sole source of truth — documented × 3 places ✓
#            content_structure_audits UNIQUE = implicit index, no extra needed ✓
#            workflow_runs.result_summary JSONB shape specified (U-09 fix) ✓
#            Sprint 9 Looker Studio + GA4 endpoints correct ✓
#
# v8.17 — Fresh-angle Phase 1 vs Phase 2 conflict audit (different angles from v8.16).
#          Read: Foundations v1.12, all 12 Sprint prompts, Phase 2 LLD v8.16.
#          Angles examined: RLS coverage, updated_at on mutable tables, FK types,
#          route naming, serve() registrations, Drizzle barrel exports,
#          Sprint 11-12 schema changes, webhook events, LLM_MODE=mock coverage.
#
#          CONFIRMED CLEAN (16 angles checked):
#            RLS: 30 tenant tables ENABLED, 7 global seed tables correctly exempt ✓
#            FK types: all users.id refs are UUID (T6 fix in place) ✓
#            audit_id FK ON DELETE clauses: CASCADE/SET NULL correctly applied ✓
#            Route naming: /organizations/ American spelling throughout ✓
#            serve() registration: all 25+ Phase 2 Inngest functions imported ✓
#            Webhook VALID_EVENTS: 10 total (5 Phase 1 + 5 Phase 2 additions) ✓
#            LLM_MODE=mock: 5 Phase 2 LLM-calling functions mapped to scenarios ✓
#            Sprint 11: no schema changes (landing page only) ✓
#            Sprint 12: no schema changes (ops/monitoring only) ✓
#            Drizzle barrel exports: 8 schema file groups covering all 37 tables ✓
#            content_structure_audits.audited_at: correct (domain timestamp = write time) ✓
#            topical_coverage_gaps.analyzed_at: correct (domain timestamp) ✓
#            Append-only tables (audit_cost_snapshots, crawler_visit_logs etc.): no updated_at needed ✓
#            Global seed tables: no RLS or updated_at needed ✓
#
#          CONFLICT A [SERIOUS] — 6 mutable UPSERT tables missing updated_at.
#                → J-01 fix (v6.7) required updated_at on all mutable Phase 2 tables.
#                  10 tables were fixed at the time. 6 were missed.
#                → These 6 use ON CONFLICT DO UPDATE (UPSERT) patterns and their rows
#                  are mutated in place — exactly the case J-01 addressed.
#                → Without updated_at: Drizzle ORM cannot set timestamps on UPSERT;
#                  no audit trail for when rows were last refreshed; debugging stale
#                  data is impossible (cannot tell if a row is 1 day or 6 months old).
#                → Fixed tables (updated_at TIMESTAMPTZ NOT NULL DEFAULT now() added):
#                  1. visibility_trends        — UPSERT: UNIQUE(brand_id, period_label, period_type)
#                  2. topical_coverage_gaps    — UPSERT: UNIQUE(brand_id, vertical, topic_cluster)
#                  3. agent_readiness_scores   — (v8.22 reclassified APPEND-ONLY: see U-13) refreshed per run
#                  4. brand_consensus_checks   — UPSERT: UNIQUE(brand_id, source_type) per L-01 fix
#                  5. citation_source_intelligence — UPSERT: partial unique indexes (K-01 fix)
#                  6. generated_reports        — (v8.22 reclassified APPEND-ONLY: see U-13) new row per report
#                → updated_at placed before UNIQUE constraint in each table definition.
#                → Comment on each: "set on UPSERT write; J-01 fix (v6.7)"
#
#          NOTE: topical_coverage_gaps was accidentally corrupted during automated patching
#          (the script found ); inside a SQL comment and split the table body).
#          Reconstructed manually: all original columns preserved (topic_label, brand_has_content,
#          brand_content_depth, brand_passage_count, competitor_coverage, estimated_citation_impact,
#          priority_rank, cross_prompt_impact, analyzed_at) + updated_at + UNIQUE constraint.
#
# v8.16 — Phase 1 vs Phase 2 conflict audit (3 fixes, 0 new features).
#          Scope: Full read of Foundations v1.12, all 12 Sprint prompts, and Phase 2 LLD v8.15.
#          Method: Cross-referenced every Phase 2 table, column, query, and tier spec against
#          the canonical Phase 1 sprint prompts before flagging any conflict.
#
#          CONFIRMED CLEAN (not conflicts):
#            All 16 GAPs intact | All 7 Layers intact | 37 Phase 2 tables (no Phase 1 duplicates)
#            Tier pricing A$99/A$299/A$499/A$1,499 matches Sprint 9/10 canonical
#            TIER_AUDIT_LIMITS (Free 1, Starter 4, Growth 12, Agency 30/brand, Agency Pro 60/brand)
#            Sprint 7 8-dimension technical audit scoring schema
#            Sprint 6 11 universal action types + CONFIDENCE_LEVELS
#            Sprint 5 336 prompts (124+104+108), retiredAt IS NULL canonical filter
#            Sprint 3 5-dimension scoring, 5 runs, 200 calls paid / 100 free
#            Sprint 2 column names (engines TEXT[], promptsCount, runsPerPrompt, totalCalls)
#            branded_intent, persona_tag — properly in SQL ALTER TABLE blocks
#            outbound_citation_count, has_author_attribution — in content_structure_audits SQL
#            visit_purpose, source_affinity_note, market_competition_label — in SQL blocks
#            BudgetPolicyService 11 functions correct; AF-01 one-time cost not monthly
#            organizations.slug correctly documented as Sprint 10 HC1 addition
#            Clerk vs Better Auth: consistently handled (C-04 note; LLD body uses Better Auth)
#
#          FIX 1 [BREAKING] — source TEXT column missing from SQL migration block (v8.13 AF-01).
#                → The source TEXT DEFAULT 'curated' column on vertical_pack_prompts
#                  was documented correctly in Phase 1 table notes (line ~1387) but the
#                  ALTER TABLE SQL statement was commented out (-- ALTER TABLE...) rather
#                  than appearing as actual executable SQL in the migration block.
#                → persona_tag and branded_intent had proper ALTER TABLE SQL at lines 3632+.
#                  source did not. Claude Code running the migration would skip it silently.
#                → Fixed: Added ALTER TABLE vertical_pack_prompts ADD COLUMN IF NOT EXISTS
#                  source TEXT DEFAULT 'curated' to the SQL migration block with full
#                  Drizzle schema note: source: text('source').default('curated')
#                → Values: 'curated' (default, all 336 existing prompts) | 'ai_suggested'
#                  (Niche Explorer) | 'custom' (user-added). Zero breakage to Phase 1.
#
#          FIX 2 [MODERATE] — Sample Audit engine unspecified in TIER 0 section.
#                → TIER 0 spec said "1 engine × 5 prompts × 1 run" but did not name the engine.
#                → Sprint 10 canonical (HC1 fix): "1 engine (ChatGPT only)".
#                → ChatGPT is the right choice: AU SMBs understand and trust it; it is the
#                  brand-recognition benchmark. Free tier adds Perplexity; paid adds Claude+Gemini.
#                → Fixed: Added "Engine: ChatGPT ONLY (Sprint 10 canonical)" to TIER 0 cost line.
#
#          FIX 3 [MODERATE] — Per-prompt trend query used citations.brand_id which does not exist.
#                → MentionDesk review (v8.14) added a Sprint 9 Growth+ per-prompt trend sparkline
#                  spec. The SQL query fragment read:
#                  "FROM citations WHERE prompt = ? AND brand_id = ?"
#                → citations table has NO brand_id column. Schema (Foundations + Sprint 2):
#                  citations.audit_id → audits.id → audits.brand_id is the correct path.
#                → Fixed: Query now JOINs audits:
#                  FROM citations c JOIN audits a ON c.audit_id = a.id
#                  WHERE a.brand_id = ? AND c.prompt = ?
#                  Also corrected mention_rate calculation to use COUNT(CASE WHEN brand_mentioned)
#                  / NULLIF(COUNT(*), 0) for correct percentage computation.
#
# v8.15 — Foglift review findings (1 schema patch, 2 additive columns, 0 breaking changes).
#          Sources: foglift.io (all pages read: product, pricing, docs, blog posts,
#          Product Hunt launch post, developer guides, CLI/MCP documentation).
#          Company: Small indie team, Product Hunt launch March 24, 2026.
#          No G2 reviews. Self-promotional blog content only.
#          Referenced approvingly in PRD v1.9 OSS competitor analysis.
#
#          FOGLIFT DISTINCTIVE FEATURES:
#            SEO + GEO + AEO + Performance + Security + Accessibility in ONE scan
#            AEO Content Score: 8 dimensions (Structured Data, Heading Clarity, FAQ Quality,
#              Entity Identity, Content Depth, Citation Formatting, Topical Authority, Crawler Access)
#            Free unlimited Technical Audits — URL-only, no account required
#            CLI (npx foglift-scan) + REST API + MCP server — ALL on Free tier
#            Real browser automation (not API calls)
#            Token-based pricing: pay per engine query
#
#          FEATURES ALREADY COVERED IN VISIBLEAU:
#            SEO + GEO + AEO in one scan → Sprint 7 technical_audits (8 dimensions + 5 rollup)
#            AEO Content Score → content_structure_audits + citation_probability_score (Y-03)
#            Free no-account scan → Sample Audit (TIER 0, 90s, no login)
#            Browser automation → AA-01 web search tools make API ≈ browser result
#            API/MCP → v1.1 roadmap (not needed for AU SMB target market in v1)
#            Structured Data, Heading Clarity, FAQ Quality → Sprint 7 schema auditor +
#              content_structure_audits (answer_capsule_score, faq_block_present)
#            Entity Identity → brand_entity_scores (ABN/Wikipedia/AU directories)
#            AI Crawler Access → Sprint 7 robots.txt + CDN blocking detection
#
#          GENUINE GAP FOUND — Foglift's "Citation Formatting" dimension:
#          Foglift's 8th AEO dimension checks whether page CONTENT cites credible sources
#          (in-text outbound links to .gov.au, .edu.au, ABS, Wikipedia, AU news publishers).
#          This is a POSITIVE citability signal — distinct from Sprint 7's broken outbound
#          link check (which is a NEGATIVE signal). Research basis: Princeton GEO paper
#          (Aggarwal et al. KDD 2024) shows citing authoritative sources increases AI
#          citation probability.
#          VisibleAU content_structure_audits had citation_probability_score but was
#          missing the input signals for citation richness and author attribution.
#
#          PATCH AG-01: 2 columns on content_structure_audits:
#            outbound_citation_count INTEGER:
#              Count credible outbound citations in page body (external links to
#              .gov.au, .edu.au, .org.au, abs.gov.au, Wikipedia, AU news publishers,
#              published research). Contributes to citation_probability_score:
#              0=no adj, 1-2=+0.03, 3-5=+0.06, 6+=+0.09.
#              Action Center recommendation when 0: "Add 2-3 credible outbound citations."
#            has_author_attribution BOOLEAN:
#              Does page have author byline, <meta name=author>, schema Person, rel=author?
#              Positive signal: +0.04 to citation_probability_score.
#              Especially important for Allied Health (AHPRA-registered), Professional
#              Services, SaaS expert content. Less critical for tradie service pages.
#            Both detected by existing Playwright crawl in content-structure-audit.ts.
#            No new infrastructure. Both feed into citation_probability_score formula.
#
# v8.14 — MentionDesk review findings (no schema changes, 1 UI note):
#          Sources: mentiondesk.com, Slashdot listing, SourceForge listing,
#          Booststash deep review (only detailed review found), G2 competitors page.
#          Company: Latvia, founded 2025, no disclosed funding.
#
#          CRITICAL FINDING: MentionDesk has ZERO verified G2 or independent reviews.
#          Only one review found (Booststash, August 2025) — likely affiliate/promotional.
#          G2 alternatives page lists Miro/Creately/Alteryx — wrong category entirely,
#          indicating MentionDesk has minimal G2 presence. No traction data available.
#          This review was conducted thoroughly but the product is too early-stage to
#          provide competitive intelligence comparable to Hall/Profound/Scrunch/Otterly.
#
#          FEATURES REVIEWED (from product descriptions + single review):
#          Pricing: $29-$349/mo (prompt-based tiers), 7 engines including Mistral/DeepSeek
#          Core: visibility tracking, prompt management, historical response archive,
#                competitive intelligence, source intelligence, sentiment analysis,
#                team collaboration (comments/tasks), CSV/PDF/JSON export.
#
#          ALL FEATURES ALREADY COVERED IN VISIBLEAU:
#            Source intelligence → citation_source_intelligence + source_affinity_note (AA-02)
#                                  brand_web_mentions.source_url stores specific publication URLs
#            Historical archive → citations.rawResponse (Phase 1 Sprint 2)
#            Competitive intel → comparison_prompt_results (Phase 2 GAP-10)
#            Sentiment → audits.scoreSentiment + scoreSentimentNumeric (Phase 1)
#            Team collaboration → remediation_tasks (Phase 2, more execution-focused)
#            Export → audit_exports CSV/PDF/JSON (Phase 1 Sprint 4)
#            Prompt suggestion (reviewer complaint) → AF-01 ai_suggested prompts (v8.13)
#
#          REVIEWER'S STATED GAPS IN MENTIONDESK:
#            "No prompt suggestion engine" → VisibleAU AF-01 already addresses this
#            "Reporting not exceptional" → VisibleAU generated_reports + white-label PDF
#            "Monitoring-only, no execution" → VisibleAU execution-first by design
#            "No AU/local market focus" → VisibleAU 336 AU vertical packs
#            "No crawler analytics" → VisibleAU crawler_visit_logs + visit_purpose
#            "No technical audit" → VisibleAU Sprint 7 + content_structure_audits
#
#          ONE GENUINE UI NOTE ADDED:
#          Per-prompt historical trend chart — confirmed from multiple competitor reviews
#          (MentionDesk, Scrunch, Peec all praised per-prompt performance over time).
#          VisibleAU data already exists in citations table (brandMentioned per call).
#          Added as a Sprint 9 Growth+ note: sparkline trend chart under each prompt row.
#          No schema change. One new read-only GET endpoint.
#
#          VERDICT: MentionDesk review confirms VisibleAU's existing design is
#          already stronger. No new schema additions warranted from this review.
#          The product is monitoring-only with no AU focus, no execution layer,
#          no vertical packs, and zero verified customer validation.
#
# v8.13 — danishashko OSS geo-aeo-tracker review findings (2 patches):
#          Source: GitHub repo (danishashko/geo-aeo-tracker), 132★ 39 forks,
#          Bright Data blog post (full deep-read), README.md (full read).
#          Author: Daniel Shashko, Senior SEO/GEO at Bright Data.
#          Purpose: OSS lead magnet for Bright Data LLM Scraper API.
#          Stack: Next.js + Supabase (optional) + Bright Data UI scraping.
#
#          DANISHASHKO DISTINCTIVE FEATURES vs VisibleAU:
#            Prompt Hub + {brand} injection → COVERED (Sprint 5 promptTemplate)
#            Visibility Analytics 0-100 trends → COVERED (visibility_trends)
#            Citations domain-grouped → COVERED (citation_source_intelligence)
#            Citation Opportunities → COVERED (outreach_brief + gap_severity)
#            Drift Alerts → COVERED (Sprint 8 drift detection + send-alerts.ts)
#            Responses browse + highlighting → COVERED (citations.rawResponse)
#            Competitive Intel → COVERED (comparison_prompt_results)
#            Local-first storage → NOT a gap (different architecture choice)
#            BYOK model → NOT a gap (VisibleAU is managed SaaS)
#
#          TWO GENUINE GAPS:
#
#          PATCH AF-01: AI-generated prompt suggestions (Niche Explorer equivalent).
#                → danishashko's "Niche Explorer" uses LLM to generate brand-specific
#                  high-intent AI query suggestions (5-10 prompts per brand setup).
#                → VisibleAU's 336 AU prompts are comprehensive for mainstream verticals
#                  but AU SMBs in edge cases (NDIS physio, niche SaaS, specialist legal)
#                  may need prompts beyond the base set specific to their suburb/service.
#                → Implementation: Sprint 5 Wizard Step 2, one GPT-4o-mini call (~A$0.001),
#                  user accepts/edits/skips suggestions, added to vertical_pack_prompts.
#                → New column: source TEXT DEFAULT 'curated'
#                  'curated' = 336 AU base pack | 'ai_suggested' = Niche Explorer
#                  | 'custom' = user-added manually
#                → Tier: Starter/Free get 3 suggestions; Growth+ get 10
#                → Makes VisibleAU feel personalised from day one — not a generic tool.
#
#          PATCH AF-02: SERP rank correlation note on audit results (design note).
#                → danishashko's SRO Analysis: 6-stage pipeline correlating AI visibility
#                  with traditional Google SERP rank. Shows "you rank #1 Google but only
#                  8% AI mention rate" — explains the Google-AI gap to AU SMBs.
#                → VisibleAU scoped version: one data point, not a full 6-stage pipeline.
#                  "Your Google rank for this query: #N. Your AI visibility: X%."
#                → Design note on citations table (not a schema change for Phase 2).
#                → v1.1 roadmap: add google_serp_rank SMALLINT nullable to citations table.
#                  Populated by optional SerpAPI call (ValueSERP AU ~A$0.001/query).
#                  Display: "You rank #3 on Google for this prompt. AI cites you 12% of
#                  the time. Most #1-3 Google results get 60%+ AI citation rates."
#                → Growth+ feature (AU SMBs who also care about traditional SEO).
#                → Deferred to v1.1: adds external API dependency, optional not critical.
#
#          DEFERRED (not in Phase 2):
#            Persona Fan-Out (generate prompt variants per persona):
#            → 336 AU prompts already have persona-tagged variants.
#              Fan-Out would bloat prompt count and LLM cost for marginal gain.
#              v1.1 enhancement to brand wizard — not Phase 2.
#
# v8.12 — Semrush AI Visibility Toolkit review findings (2 patches, zero breaking changes).
#          Sources: Semrush AI Visibility Toolkit knowledge base (read in full),
#          Semrush One product page, Getmint deep review, Docket.io review (Adobe acquisition),
#          Profound vs Semrush comparison (Nicklafferty), G2 3,300+ Semrush reviews,
#          Trakkr pricing review, NoGood competitive analysis.
#
#          SEMRUSH CONTEXT:
#          Acquired by Adobe for $1.9B on April 28, 2026. Now an Adobe subsidiary.
#          28M users, 117K+ paying customers. 10M+ monthly active users.
#          AI Visibility Toolkit: launched October 2025. $99/mo add-on OR bundled in Semrush One.
#          Largest AI prompt database in market: 100M+ prompts (90M US, 29M ChatGPT).
#          Named "most feature-complete AEO suite shipped by a legacy SEO vendor" (Docket.io).
#
#          SEMRUSH UNIQUE FEATURES (not found in previous competitor reviews):
#            Business Drivers: score individual attributes (Price/Convenience/Innovation)
#            Narrative Drivers: branded vs non-branded intent classification
#            Prompt Research at scale: 100M+ database with volume + difficulty + intent
#            SEO + AI unified: traditional SEO + AI visibility in one platform
#            MCP Server: ChatGPT + Claude integration (50K API units/month)
#            AI PR Toolkit: find LLM-trusted media outlets for targeted pitches
#
#          SEMRUSH GAPS (VisibleAU advantages):
#            Keyword-focused, not pure prompt-level analysis
#            Google-centric (AI Overviews primary; ChatGPT/Perplexity secondary)
#            No execution layer (no content drafts, no outreach briefs)
#            No AU-specific prompt packs — 100M database is US-weighted
#            No crawler visit logs / agent traffic monitoring
#            No hallucination detection
#            Requires Semrush base ($140+) + AI Toolkit ($99) = $239+ minimum
#            Dark pattern cancellation (Trustpilot 2.8/5 for billing)
#            No free trial for AI Toolkit standalone
#
#          FEATURES ALREADY COVERED IN VISIBLEAU:
#            Competitor Research → comparison_prompt_results (Phase 2 GAP-10)
#            Prompt Tracking → vertical_pack_prompts + run-audit.ts (Phase 1)
#            Brand Performance/SoV → share_of_voice_snapshots (Phase 2 GAP-9)
#            AI Site Audit → Sprint 7 technical_audits + content_structure_audits (Phase 2)
#            Sentiment → audits.scoreSentiment + scoreSentimentNumeric (Phase 1)
#            MCP Server → v1.1 roadmap (already noted)
#
#          PATCH AE-01: branded_intent TEXT nullable on vertical_pack_prompts.
#                → Semrush "Narrative Drivers" insight: split performance into branded vs
#                  non-branded mentions to separate loyalty signals from awareness signals.
#                → "Warby Parker reviews" (branded = loyalty) vs "best glasses" (non-branded = awareness)
#                  These are different business problems requiring different fixes.
#                → Values: 'non_branded' | 'branded' | 'semi_branded' | NULL (legacy)
#                → Detection at seed time: IF promptTemplate contains '{brandName}' → 'branded'
#                  ELSE IF suburb-level specifics → 'semi_branded'
#                  ELSE → 'non_branded'
#                → ~90% of 336 AU prompts = non_branded, ~25 = branded, ~20 = semi_branded
#                → UI (Sprint 9, Growth+): Intent filter: Awareness / Reputation / All
#                  "How often AI recommends you when buyers haven't heard of you" (non-branded)
#                  "How accurately AI describes your brand when asked directly" (branded)
#                → Semrush charges add-on pricing. VisibleAU includes on Growth (A$299/mo).
#                → Phase 2 Sprint 1 seed file update: au-tradies.ts, au-allied-health.ts, au-saas.ts
#                → No new API endpoint. No data model change beyond additive nullable column.
#
#          PATCH AE-02: Business Drivers — v1.2 roadmap note on visibility_trends.
#                → Semrush scores individual attributes: Price, Convenience, Innovation, Trust.
#                → For AU SMBs: Tradies (Licensed/Local/Fixed-Price), Allied Health (Bulk Billing/
#                  Specialist), SaaS (AU Data Residency/Integrations). Different from US attributes.
#                → Phase 2 not right: requires AU attribute taxonomy (30-50 attrs/vertical) +
#                  keyword extraction pass on contextSnippets + validation data.
#                → v1.2 (Month 18+): brand_attribute_scores table, attribute seeds per vertical,
#                  post-audit Inngest extraction, radar chart UI on Growth+.
#                → Documented as roadmap note on visibility_trends (no schema change to Phase 2).
#
# v8.11 — HubSpot AEO Grader review findings (2 additive patches, zero breaking changes).
#          Sources: HubSpot AEO Grader product page (live, read in full), HubSpot /aeo-grader,
#          HubSpot Spring 2026 Spotlight release notes, xSeek alternatives guide,
#          The Answer Engine Report deep review, Scribe pricing analysis.
#
#          HUBSPOT PRODUCT STRUCTURE:
#          AEO Grader (free, no login) — one-time snapshot: 5 dimensions × 100pts
#            Sentiment Analysis 40pts, Presence Quality 20pts, Brand Recognition 20pts,
#            Share of Voice 10pts, Market Competition 10pts.
#            Powered by GPT-5.4 mini + Perplexity + Gemini simultaneously.
#            Output: composite score + written interpretation per dimension.
#            Lead magnet for HubSpot AEO paid product.
#          HubSpot AEO (paid, US$50/mo) — daily tracking across ChatGPT/Perplexity/Gemini,
#            competitor comparison, prioritised CRM-connected recommendations.
#            Acquired XFunnel (2026). Included in Marketing Hub Pro/Enterprise.
#
#          FEATURES ALREADY COVERED IN VISIBLEAU:
#            Daily tracking → Phase 1 audits on schedule (Sprint 9)
#            Competitor citation comparison → comparison_prompt_results (Phase 2 GAP-10)
#            Sentiment scoring → audits.scoreSentiment + scoreSentimentNumeric (Phase 1)
#            Share of voice → share_of_voice_snapshots (Phase 2 GAP-9)
#            Written interpretation → rationale TEXT on every score-bearing response (Phase 2)
#            Brand_archetype → 4-quadrant mention × citation matrix (Phase 2)
#            Reddit monitoring → brand_web_mentions + AU subreddit seeds (Phase 2)
#
#          PATCH AD-01: market_competition_label on visibility_trends.
#                → HubSpot's "Market Competition" dimension: Leader / Challenger / Niche Player
#                → DIFFERENT dimension from brand_archetype (archetype = mention × citation;
#                  competition_label = brand citation_rate vs category competitor average)
#                → Classification: citation_rate > 2× competitor avg → 'category_leader'
#                                  citation_rate 0.5-2× avg → 'challenger'
#                                  citation_rate < 0.5× avg → 'niche_player'
#                → Source: share_of_voice_snapshots (already computed) — no LLM cost
#                → UI (Sprint 9, Starter+): badge alongside brand_archetype
#                  "Category Leader" | "Challenger" | "Niche Player"
#                  "You appear more often in AI answers than 80% of your competitors."
#                → Free tier teaser: "Are you a Leader, Challenger, or Niche Player?"
#                → No new table. Additive TEXT column on visibility_trends.
#
#          PATCH AD-02: 5-dimension breakdown on Sample Audit results page (TIER 0).
#                → HubSpot Grader's UX advantage: shows 5 labelled dimensions + written
#                  interpretation per dimension — users understand WHY, not just WHAT.
#                → VisibleAU Sample Audit previously showed composite score + 3 prompts only.
#                → All 5 dimension scores computed in single 90-second ChatGPT run — zero
#                  extra LLM cost. Blurring them was wasting the conversion opportunity.
#                → Now shows: AI Sentiment / AI Presence / Citation Accuracy /
#                  Competitive Position / Market Standing — each with 1-line plain English.
#                → Changed from "Blurred 5-dimension breakdown" to "Show all 5, blur only
#                  competitor comparison + 12-month trend + Action Center."
#                → WHY THIS BEATS HUBSPOT:
#                  90 seconds (vs 3-5 min), AU-specific prompts, 5 real dimensions,
#                  immediate path to continuous tracking (not a one-time tool).
#                → Sprint 10 UI change — no schema change, no API change.
#
# v8.10 — Scrunch Enterprise review → VisibleAU Enterprise tier full redesign.
#          Scrunch Enterprise features reviewed from: official FAQ, /enterprise page,
#          73 G2 reviews, Trakkr review, Getmint review, Cairrot deep review.
#          Cross-referenced against existing VisibleAU Enterprise tier (written v8.9+).
#
#          SCRUNCH ENTERPRISE FEATURES vs VisibleAU:
#            9 LLMs on Enterprise → VisibleAU advantage: all 4 on every paid tier
#            AXP shadow site → still in limited pilot; not generally available as of May 2026
#            SOC 2 Type II → VisibleAU: Type 1 Month 12, Type 2 Month 18
#            SAML/OIDC SSO → VisibleAU: Clerk Enterprise SAML (no code change needed)
#            RBAC → VisibleAU: 4-role system (owner/admin/analyst/viewer) already designed
#            Data API → VisibleAU: v1.1 roadmap (Phase 2 data ready)
#            Hallucination detection → Scrunch Enterprise-only; VisibleAU GROWTH+ — advantage
#            Multi-region/multilingual → VisibleAU: AU_EN v1, NZ_EN/UK_EN Phase 3
#            GA4 integration → VisibleAU: organizations.ga4_measurement_id Sprint 9
#            Product Observability → VisibleAU: v1.2 roadmap with custom vertical packs
#
#          EXISTING ENTERPRISE TIER WAS ALREADY STRONG — confirmed from audit:
#            ✓ 3 distinct AU personas (ASX brand, large agency, regulated industry)
#            ✓ A$4,000 floor pricing with rationale
#            ✓ SOC 2 + APPs + DPA + MSA + invoice billing
#            ✓ SLA (99.5%, P1 4hr, P2 24hr, P3 best effort)
#            ✓ Unlimited brands, custom audit frequency, custom vertical packs
#            ✓ API access (v1.1), SSO (Clerk SAML), 7-year data retention
#            ✓ Dedicated AU CSM, audit trail + SIEM webhook, evidence snapshots
#            ✓ Portfolio analytics, SWOT executive report (weekly, Monday 7am AEST)
#            ✓ 30-min discovery → 14-day POC → MSA → live in 5 business days
#            ✓ 78% gross margin at A$5,000/mo (100 brands)
#
#          PATCHES APPLIED:
#          EC-01: Added 4 missing elements to VISIBILITY LAYER of Enterprise tier:
#            RBAC: 4 existing roles mapped to Enterprise use cases (legal=viewer,
#                  account manager=analyst, CMO=viewer, IT=admin). brand_access JSONB
#                  restricts users to specific brand subsets within org. No code change.
#            HALLUCINATION + CRISIS WORKFLOW: 5-step workflow documented in full
#              (Detection → Alert → Evidence Capture → Remediation → Resolution Tracking).
#              Enterprise P1 SLA on hallucination alerts. Court-admissible evidence snapshots.
#              "No other AU GEO tool offers this end-to-end workflow" — competitive framing.
#            PRODUCT VISIBILITY (v1.2 roadmap): product_visibility_audits table for
#              SKU-level AI mention tracking. Enterprise annual contracts include v1.2
#              product visibility at no extra cost.
#            MULTILINGUAL/MULTI-MARKET: NZ_EN + UK_EN infrastructure already ready
#              (market_code). Phase 3 activates. Enterprise contract includes at same price.
#          EC-02: Strengthened Agency Pro → Enterprise upgrade triggers:
#            Trigger 1: org hits 20+ brands → personalised nudge with brand count
#            Trigger 2: critical hallucination detected → Enterprise SLA pitch
#            Trigger 3: Sri proactively contacts Agency Pro 20+ brand customers
#
# v8.9 — Otterly AI review findings (3 additive patches, zero schema changes,
#         zero breaking changes). Sources: 49 G2 reviews (4.8/5), independent deep
#         reviews, Otterly's own product blog (rebuilt GEO Audit, Feb 2026).
#         Gartner Cool Vendor 2025. 15,000+ users. Austria-based.
#
#         RESEARCH PROCESS:
#           Read all Otterly G2 reviews, 3 independent deep reviews, and Otterly's
#           own product engineering blog. Cross-referenced every feature against
#           Phase 1 sprint prompts + Phase 2 LLD before any change.
#
#         FEATURES ALREADY COVERED IN VISIBLEAU:
#           GEO Crawlability Checker → Phase 1 Sprint 7 robots.txt + CDN block detection
#           Content Checker (Static/AI Readiness/Structured Data) → Phase 1 Sprint 7 SSR
#                check + schema auditor + Phase 2 content_structure_audits
#           Looker Studio export → Phase 1 Sprint 9 /api/org/[id]/looker.json
#           Prompt-based pricing → VisibleAU flat-rate (structural advantage)
#           4 AI engines on all paid tiers → VisibleAU advantage (Otterly has add-ons)
#
#         PATCH AB-01: SWOT prompt analysis framing (UI note, Sprint 9).
#                → Otterly's most praised client-facing output: prompts organised into
#                  Strengths / Weaknesses / Opportunities / Threats.
#                → VisibleAU has all source data — no new tables or API endpoints needed:
#                  Strengths: comparison_prompt_results WHERE brand_won=true
#                  Weaknesses: topical_coverage_gaps WHERE gap_severity='critical'
#                  Opportunities: prompt_volume_estimates high volume + low brand presence
#                  Threats: competitor citation_rate trending up on brand-won prompts
#                → Sprint 9 audit results Growth+ tab "SWOT Analysis" — 4 colour-coded
#                  sections, 3-5 prompts each, plain English, exportable PDF for Agency.
#
#         PATCH AB-02: Crawler identity User-Agent for content_structure_audits.
#                → Otterly rebuilt their GEO Audit around this insight: let teams choose
#                  which AI crawler identity (GPTBot, ClaudeBot) to simulate.
#                → Reveals UA-dependent content differences (Cloudflare Bot Management,
#                  CDN rules, rate limiting can differ per crawler User-Agent).
#                → VisibleAU: lib/crawler/index.ts currently uses default Playwright UA.
#                → Add optional userAgent param to crawlSite(). Phase 2
#                  content-structure-audit.ts passes 'GPTBot/1.1' as default bot UA.
#                → Sprint 6 deliverable. Small config change to existing infrastructure.
#
#         PATCH AB-03: llms.txt honest signal note on llmstxt_versions table.
#                → Otterly REMOVED their llms.txt checker in Feb 2026 after analysing
#                  millions of real citations. Finding: "AI bots crawl llms.txt but we
#                  haven't seen big impacts on AI search visibility."
#                → VisibleAU KEEPS llmstxt_versions — it is a real agent readiness signal.
#                → Added honest framing: llms.txt is signal #5 (behind content structure,
#                  static rendering, structured data, third-party citations).
#                → UI copy rule: depth_score shown INSIDE agent_readiness_scores /100,
#                  NOT as a standalone visibility metric. Prevents AU SMBs from thinking
#                  "good llms.txt score = I'm done" without addressing content structure.
#
# v8.8 — Peec AI review findings — second pass (1 schema addition, 0 breaking changes):
#         Re-read all Peec features with fresh eyes after initial review.
#         Confirmed all other features already covered. Found one genuine addition.
#
#         PATCH AA-02: source_affinity_note TEXT nullable on citation_source_intelligence.
#                → Peec G2 reviewer (Grégoire d.): "I'd love more insights about how
#                  LLMs pick their sources."
#                → VisibleAU citation_source_intelligence stores WHAT sources are cited
#                  (citation_count, citation_share, gap_severity) but NOT WHY they get cited.
#                → source_affinity_note is a STATIC lookup — seeded once per source_type,
#                  not computed per brand. Zero LLM cost. One seed file, ~8 rows.
#                → Seed values explain the citation signals for each AU source type:
#                  reddit_thread → upvote threshold + expert flair + recency signals
#                  au_directory  → complete profile + recent reviews signal
#                  wikipedia     → ABN-verified facts + reliable sources
#                  linkedin_post → long-form articles by verified experts
#                  news_article  → AU publications + quote-in-article vs blog
#                  youtube_video → transcripts + chapters + AU how-to competition gap
#                  review_site   → 4.5+ rating + ≥10 reviews threshold
#                  brand_owned   → FAQ/HowTo schema + answer capsule format
#                → UI (Sprint 9 citation sources panel, Growth+):
#                  "Why does r/tradies get cited? [note] → What to do? [outreach CTA]"
#                → Closes the #1 complaint across all competitor G2 reviews:
#                  "The tool shows what's happening but not why or what to do."
#                → No FK change. No index change. Additive nullable column only.
#
# v8.7 — Peec AI review findings applied (1 config note, zero schema changes):
#         Sources: G2 (2 verified reviews), Cairrot deep review, Discovered Labs review,
#         Airefs review, independent pricing/feature analysis. $29M raised, 2000+ customers.
#
#         RESEARCH PROCESS:
#           Read all Peec features and cross-referenced every single one against
#           Phase 1 sprint prompts + Phase 2 LLD before drawing any conclusions.
#
#         PEEC GAPS ALREADY COVERED IN VISIBLEAU:
#           Source categorisation → citations.cited_source_type (Phase 2, more granular + AU-specific)
#           Gap Analysis (competitor cited, not you) → outreach_brief draft_type (X-01)
#           GA4 integration → organizations.ga4_measurement_id (Phase 1 Sprint 9 GD1)
#           Crawler analytics → crawler_visit_logs + is_active_agent + visit_purpose (Phase 2)
#           Citation probability (why LLMs pick sources) → citation_probability_score (Y-03)
#           Schema/entity optimisation → Phase 1 Sprint 7 schema auditor + brand_entity_scores
#           Proactive citation opportunities → outreach_brief (X-01)
#           AU vertical prompts → Phase 1 Sprint 5: 336 AU prompts (Peec has zero)
#           Clickstream demand → Google Trends AU (W-01) already specified
#
#         PEEC ADVANTAGE INVESTIGATED — UI SCRAPING vs API:
#           Peec simulates real browser sessions to capture what users actually see.
#           VisibleAU uses Vercel AI SDK (API calls) — intentional PRD design decision.
#           API approach = MORE reproducible → better for Wilson 95% CI statistical rigour.
#           RESOLUTION: enable web search tools in each engine's generateText() call
#           to match real-user experience while keeping API reproducibility advantage.
#
#         PATCH AA-01: Web search tool configuration note on run-audit.ts.
#                → No schema change. Config note only.
#                → ChatGPT: enable web_search_preview tool in generateText() call
#                → Perplexity: sonar-pro uses web search by default (no change)
#                → Claude: enable web_search tool (Growth+ tiers)
#                → Gemini: enable useSearchGrounding: true
#                → WHY: without web search, API returns knowledge-cutoff responses.
#                  "best plumber Bondi" without web search = generic training data.
#                  With web search = current AU web content = real-user experience.
#                → VisibleAU answer to Peec's UI scraping: API + web search tools
#                  = reproducible AND current = statistically better than UI scraping.
#
#         VISIBLEAU STRUCTURAL ADVANTAGES OVER PEEC (no LLD change needed):
#           1. Execution-first: Action Center + remediation_tasks vs Peec monitoring-only
#           2. AU vertical packs: 336 pre-built AU prompts vs Peec manual setup
#           3. All 4 engines on A$99 Starter vs Peec add-ons per engine
#           4. 90-second Sample Audit vs Peec requires existing brand mentions for signal
#           5. Content generation (content_drafts) vs Peec no content writing
#           6. Schema/entity optimisation built-in vs Peec no technical tools
#
# v8.6 — Scrunch review findings applied (2 additive patches, zero breaking changes).
#         Pre-change: read all 12 Phase 1 sprint prompts + Foundations v1.12 +
#         Phase 2 LLD v8.5 before making any change. Full duplication audit run.
#
#         PHASE 1 READ SUMMARY:
#           Sprint 1: Multi-tenant foundation, RLS, Stripe, brand CRUD
#           Sprint 2: Single-engine audit, LLM mock mode, response cache
#           Sprint 3: 4 engines, 5-dim scoring, Wilson CIs, model-selector
#           Sprint 4: 11 UI screens, PDF/CSV/JSON exports
#           Sprint 5: 336 AU prompts (124/104/108), category field canonical
#           Sprint 6: 11 action types, research citations, 12 anti-patterns
#           Sprint 7: llms.txt, robots.txt, schema audit, 27 AI bots, Brand&Entity
#           Sprint 8: Local SEO, NAP, drift detection, webhooks, SARIF/JUnit/GHA
#           Sprint 9: Agency tier, white-label PDF, client portal, bulk ops, GA4
#           Sprint 10: Sample audit (90s), Stripe checkout, onboarding wizard
#           Sprint 11: Landing page, /methodology, Loom demos
#           Sprint 12: Sentry, load test, security audit, beta customers, SOC 2 kickoff
#
#         DUPLICATION AUDIT RESULT: audit_cost_snapshots, sampling_policies,
#           market_ai_budget_policies are Phase 2 tables (not in any Phase 1 sprint).
#           No Phase 2 tables duplicate Phase 1 tables. visit_purpose is absent
#           from all Phase 1 sprints, Foundations, and Phase 2 LLD. Confirmed safe.
#
#         PATCH Z-01: visit_purpose TEXT nullable on crawler_visit_logs.
#                → Scrunch's "Agent Traffic" feature: classify WHY a bot visited.
#                  'retrieval' = AI mid-conversation fetching your page (highest intent)
#                  'indexing'  = AI refreshing knowledge base (medium intent)
#                  'training'  = AI ingesting content for model training (low intent)
#                → Detection (lib/crawler/visit-classifier.ts):
#                  is_active_agent=true → 'retrieval'
#                  crawler_tier='data'  → 'training'
#                  Tier 1 bot + pages_in_session > 3 → 'indexing'
#                  else → NULL
#                → Relationship with is_active_agent (W-02): is_active_agent=true
#                  always implies visit_purpose='retrieval'. visit_purpose adds
#                  indexing/training classification to passive visits.
#                  No conflict — complementary columns.
#                → UI (Sprint 9): colour-coded cards with plain-English framing:
#                  🟢 "AI recommended you in 47 live conversations this month"
#                  🔵 "AI crawled your site for knowledge refresh"
#                  ⚪ "AI training crawler visited 3 times"
#                → Added partial index WHERE visit_purpose IS NOT NULL for query efficiency.
#                → No FK change. No existing column change. No breaking change.
#
#         PATCH Z-02: Buyer Stage UI label for category filter.
#                → Scrunch charges for "funnel stage filtering" as a paid feature.
#                → vertical_pack_prompts.category already maps to buyer stages:
#                  'service-discovery'/'problem-driven' → Awareness
#                  'comparison'/'reviews' → Consideration
#                  'recommendation'/'pricing'/'compliance'/'emergency' → Decision
#                → No new column. No new API. UI label note only.
#                  ?buyer_stage=consideration → WHERE category IN ('comparison','reviews')
#                → Sprint 9 Growth+ filter: Buyer Stage dropdown alongside persona_tag.
#                → Scrunch advantage closed at zero engineering cost.
#
# v8.5 — Persona layer added to Phase 2 (nullable ALTER TABLE on vertical_pack_prompts):
#         Pre-change verification: persona_tag absent from all Phase 1 docs, Phase 2 LLD,
#         all 12 sprint prompts, Foundations v1.12. Phase 1 columns confirmed:
#         id, packId, promptTemplate, rank, category, topic, expectedMentionType,
#         notes, createdAt, retiredAt. Zero existing Phase 2 query affected.
#
#         SCHEMA CHANGE: ALTER TABLE vertical_pack_prompts ADD COLUMN IF NOT EXISTS persona_tag TEXT
#           → Nullable. NULL = applies to all personas (majority of prompts — ~296 of 336).
#           → Only ~40 prompts across 3 verticals are genuinely persona-specific and need tagging.
#           → All existing Phase 1 and Phase 2 queries: zero breakage. retiredAt IS NULL filter
#             continues to work; persona_tag IS NULL rows included (correct — generic prompts).
#           → Drizzle: personaTag: text('persona_tag') in db/schema/vertical-pack-prompts.ts
#           → Sprint: Phase 2 Sprint 1 migration + seed file updates (~40 rows tagged)
#
#         TIER GATE: Growth+ (Starter/Free see locked card with upgrade nudge)
#         UI: Sprint 9 Adaptive Segment-Aware UX — prompt results dropdown filter
#             No new API endpoint — existing audit-results route gains ?persona= query param
#             that JOINs vertical_pack_prompts.persona_tag to filter citation rows
#
#         VALUES per vertical:
#           SaaS:          'cto' | 'developer' | 'founder' | 'marketing_director'
#           Tradies:       'homeowner' | 'property_manager' | 'builder'
#           Allied Health: 'patient' | 'referrer' | 'employer'
#
#         COMPETITIVE CONTEXT: AthenaHQ persona targeting is Enterprise-only (custom pricing).
#         VisibleAU ships it on Growth tier (A$299/mo) — direct advantage.
#
# v8.4 — AthenaHQ review findings applied (3 additive notes, zero breaking changes,
#         zero duplication of existing Phase 1 or Phase 2 structures):
#
#         Pre-change verification performed:
#           - vertical_pack_prompts Phase 1 columns confirmed: id, packId, promptTemplate,
#             rank, category, topic, expectedMentionType, notes, createdAt, retiredAt
#           - persona_tag confirmed absent from all Phase 1 docs, Phase 2 LLD, all sprint prompts
#           - hallucination_incidents table unchanged — UI framing note only
#           - citation_probability_score column already existed — UI note only
#
#         PATCH Y-01: persona_tag — v1.1 roadmap flag on vertical_pack_prompts.
#                → AthenaHQ's Enterprise-only persona targeting (CTO/Developer/Founder)
#                  is their praised differentiator. PRD v1.1 already listed "Persona Fan-Out".
#                → Phase 2 is NOT the right sprint — would require reseeding 336 prompts
#                  across 3 verticals during the largest Phase 2 sprint.
#                → Added: precise ALTER TABLE spec flagged for v1.1 sprint:
#                  persona_tag TEXT nullable, seed values per vertical, Growth+ UI filter.
#                → Phase 2 Inngest functions: no change. persona_tag is UI-filter only in v1.1.
#                → No schema change to Phase 1 or Phase 2 tables.
#
#         PATCH Y-02: "Knowledge Gaps" UI framing on hallucination_incidents.
#                → AthenaHQ frames hallucinations as "knowledge gaps" — empowering reframe.
#                  "AI filled a gap in your content with a guess" → customer can act.
#                  "AI hallucinated" → customer feels helpless.
#                → Added UI display rules to hallucination_incidents table comment:
#                  Title: "Knowledge Gaps" (not "Hallucinations") in customer-facing UI.
#                  Each row: "AI is stating X. This happens because your content doesn't cover Y. Fix: Z."
#                  Severity mapping: critical→"Urgent", warning→"Review", info→"Monitor".
#                → Internal code/schema: hallucination_incidents name unchanged everywhere.
#                → No schema change. No API change. Copy change only.
#
#         PATCH Y-03: citation_probability_score UI prominence + scoring formula.
#                → AthenaHQ's ACE Citation Engine (Enterprise-only, most praised feature)
#                  is conceptually identical to citation_probability_score already in LLD.
#                → VisibleAU had the data; no prominence spec existed.
#                → Added: headline metric display spec ("How likely is AI to cite this page? 73%"),
#                  colour-coded badge (≥0.70 green / 0.40-0.69 amber / <0.40 red),
#                  full scoring formula (content_format, answer_capsule_score, freshness_risk,
#                  is_entity_home_candidate, optimal_passage_count inputs with weights),
#                  cross_prompt_impact linkage for pages below 0.40 threshold.
#                → No schema change. Column already existed in content_structure_audits.
#
# v8.3 — Profound G2 review findings applied (2 additive patches, zero breaking changes):
#         Source: 827 verified G2 reviews + 3 independent deep reviews (March-May 2026).
#         Both patches are additive: new draft_type value + new nullable INTEGER column + index.
#
#         PATCH X-01: content_drafts — 'outreach_brief' draft_type added.
#                → Profound's most praised differentiator: tells users exactly WHO to contact
#                  and WHAT to say to earn the citations AI models trust.
#                → PRD v1.1 roadmap listed "Citation Opportunities with outreach briefs" (5-7 days).
#                  The PRD had it; no Phase 2 sprint owned it; now assigned to Sprint 6.
#                → No new table: extends existing content_drafts.draft_type enum.
#                → Data sources already exist: citation_source_intelligence (who gets cited instead)
#                  + brand_web_mentions (Reddit/Quora/LinkedIn threads AI engines cite in AU).
#                → Output: 3-section brief — where competitors win citations, your AU outreach
#                  opportunities (r/AusFinance threads, LinkedIn AU groups, AU directories),
#                  expected impact based on VisibleAU corpus data.
#                → AU-specific advantage: Profound surfaces generic journalist contacts.
#                  VisibleAU surfaces AU-specific channels (r/tradies, Hipages, YPAU, WOMO)
#                  that Profound cannot curate without AU market expertise.
#
#         PATCH X-02: topical_coverage_gaps — cross_prompt_impact INTEGER column added.
#                → Profound surfaces "jewel wins": one content fix that unlocks multiple
#                  prompts simultaneously. Review 9 (Knorr enterprise user): "identifying
#                  jewel wins — where one action unlocks multiple prompts at once — made it
#                  possible to prioritise workstreams and be realistic about what we could improve."
#                → VisibleAU had per-prompt gap analysis but no cross-prompt leverage calculation.
#                → Added: cross_prompt_impact = count of distinct vertical_pack_prompts that
#                  would benefit from closing this specific topical gap.
#                → compute-topical-gaps.ts populates it; NULL when < 2 prompts affected.
#                → UI: "HIGH LEVERAGE — fix this gap → improves 7 prompts" badge in Action Center.
#                → For AU SMB with limited time: "fix these 3 things, cover 80% of your gaps"
#                  is more actionable than a flat list of 20 individual tasks.
#                → New index: cross_prompt_impact DESC NULLS LAST for Action Center sort.
#
#         NOT BUILT (deliberate): Natural language querying (Profound review 6).
#                → "I can ask questions in natural language" — powerful but complex.
#                → Requires LLM integration on top of structured data queries.
#                → Deferred to v1.2. Not a Phase 2 deliverable.
#
# v8.2 — Hall G2 review findings applied (3 additive patches, zero breaking changes):
#         All changes are additive: new column comments, one nullable column extension,
#         one function spec addition. No existing table structure, FK, or RLS policy changed.
#
#         PATCH W-01: prompt_volume_estimates.data_source — source specified.
#                → Table existed but data_source was undefined ('visibleau_corpus' | 'panel_partner').
#                → Hall ships "search demand estimation" combining AI data + clickstream + search intent.
#                → VisibleAU approach: 'visibleau_corpus' (own audit frequency, grows with customers)
#                  + 'google_trends_au' (Google Trends Explore API scoped to AU region).
#                → Combined → 'combined' source with Confirmed/Hypothesis confidence labels.
#                → AU advantage: Google Trends geo=AU gives AU-specific demand signals Hall cannot
#                  replicate with their US-weighted clickstream. Defensible data moat.
#                → Populated by: lib/intelligence/prompt-demand-scorer.ts (new, weekly cron).
#                → No schema change — data_source column already existed.
#
#         PATCH W-02: crawler_visit_logs — two new nullable columns added.
#                → Hall's "agent analytics" and "conversational commerce" distinguish active AI
#                  agent visits (high-intent, mid-conversation) from passive crawler reads (training).
#                → Added: is_active_agent BOOLEAN NOT NULL DEFAULT false
#                          referrer_ai_session TEXT (nullable)
#                → is_active_agent=true: ChatGPT/Claude/Perplexity agent visiting mid-conversation
#                  to verify a fact or get a booking URL. Highest commercial intent signal.
#                → is_active_agent=false: GPTBot/ClaudeBot indexing content for training. Lower intent.
#                → Existing rows: all default to false (passive) — no data migration needed.
#                → No FK changes, no RLS changes, no index changes required.
#
#         PATCH W-03: crawler-log-ingest.ts — middleware snippet spec added.
#                → Hall requires complex server-side middleware setup (docs show Next.js,
#                  Express, Cloudflare, AWS CloudFront, Akamai, Azure integrations).
#                → VisibleAU approach: single JS snippet that customers drop in, self-serve,
#                  under 5 minutes, zero sales contact required.
#                → Spec: POST to api.visibleau.com.au/v1/visit with brandToken + headers.
#                → Tier: is_active_agent tracking = Growth+ (technical user implied).
#                  Passive log import = Starter+ (CSV/nginx log upload).
#                → Positioning note added: Hall entirely sales-led (all plans "Contact sales").
#                  VisibleAU self-serve is a structural moat Hall cannot close.
#
# v8.1 — Full multi-tier experience design (Sample → Free → Starter → Growth → Agency → Agency Pro → Enterprise)
#         Design goal: every tier feels complete; every tier creates natural desire for the next.
#         Revenue and profit are the goal. CX is the mechanism.
#
#         Replaced flat tier gate table with full tier experience design covering:
#         - 7 tiers: Sample Audit / Free / Starter / Growth / Agency / Agency Pro / Enterprise
#         - Each tier: persona, goal, cost target, gross margin, Phase 1+2 features, locked teasers
#         - Upgrade flow: explicit message for each tier → next tier transition
#         - Locked feature UI rule (lib/upgrade/nudge.ts): teaser label + price + single CTA
#         - Full feature gate reference table: all Phase 2 tables across all tiers
#
#         KEY DESIGN DECISIONS:
#         - Free + Starter: crawler_visit_logs + llmstxt_versions (near-zero cost, real value)
#         - Starter: agent_readiness_scores FULL (differentiates from Free, drives Growth desire)
#         - Starter: visibility_trends SUMMARY only — mention_rate + citation_rate as 2 numbers
#         - Starter: citation-failure-diagnosis TOP 1 reason only
#         - Growth: everything unlocks — full intelligence across all 7 layers
#         - Agency: evidence_snapshots + white-label reports + team RBAC + scheduled delivery
#         - Agency Pro: 25 brands + 2×/day + top models + priority queue
#         - Enterprise: custom commercial terms layered on Agency Pro infrastructure
#
# v8.0 — Profit + CX gap audit (4 gaps found, 4 fixed):
#         Principle: Revenue and profit are the goal. CX and reputation are the pillars.
#
#         GAP-A [PROFIT RISK]: No Phase 2 per-function cost targets — developer could build
#                uncontrolled LLM spend into Phase 2 functions.
#                → Fixed: Added cost target table to BudgetPolicyService section.
#                  11 Phase 2 functions with cost targets, frequency, tier gate.
#                  Phase 2 total addition: <US$2.31/brand/month (A$~3.50). Margin stays >85%.
#                  BudgetPolicyService.estimate() must include Phase 2 function costs.
#
#         GAP-B [PROFIT RISK]: Starter tier (A$99) gets zero Phase 2 features.
#                A$200 jump to Growth unlocks everything simultaneously — conversion cliff.
#                → Fixed: Added STARTER UPGRADE PATH with two mechanisms:
#                  1. LOCKED-VISIBLE: Phase 2 cards shown greyed with lock + upgrade CTA.
#                     Zero LLM cost. API returns { locked: true, tier_required: 'growth' }.
#                  2. STARTER TEASER: One visibility_trends summary number (mention_rate +
#                     citation_rate) shown monthly. Zero extra LLM cost — derived from
#                     Growth audit data already computed. Creates desire for full chart.
#
#         GAP-C [PROFIT RISK]: content_draft model routing inconsistency.
#                model-selector.ts I-02 fix said 'cheapest Free/Starter' routing branch.
#                Tier gate table correctly says content_drafts = Growth+ only.
#                Dead code + wrong mental model for developer.
#                → Fixed: Clarified two routing cases only: mid-tier (Growth) and
#                  top-tier (Agency+). Free/Starter branch removed from spec.
#
#         GAP-D [CX RISK]: Retrieval Intelligence (Layer 1) had no tier gates in table.
#                crawler_visit_logs, llmstxt_versions, agent_readiness_scores unspecified.
#                Developer would guess — risking either over-gating (bad CX) or
#                under-gating (margin risk).
#                → Fixed: Added Layer 1 to tier gate table with rationale:
#                  Starter gets crawler_visit_logs + llmstxt_versions (near-zero cost,
#                  shows real AI-readiness data, creates upgrade desire).
#                  Growth+ gets content_structure_audits + agent_readiness_scores.
#
#         GAP-E [PROFIT RISK]: No upgrade nudge pattern specified anywhere in LLD.
#                → Fixed: Combined with GAP-B. Added lib/upgrade/nudge.ts spec:
#                  locked API responses include teaser_label with ONE real number
#                  (computed without LLM cost) to drive upgrade without free access.
#
# v7.9 — Design principle correction: revenue/profit = goal; CX + reputation = pillars
#         Revenue and profit are the highest priority. Customer experience, reputation,
#         and technical quality are the pillars through which sustainable revenue is achieved.
#         No pillar is sacrificed, but they serve the goal — not the other way around.
#         Intent language updated across V-01, V-02, V-03 to reflect this correctly.
#
# v7.8 — ChatGPT strategic review response (GAP 2, GAP 7, GAP 9)
#         Design principle: customer experience + revenue + reputation are co-equal constraints.
#         No feature may sacrifice one for another.
#
#         PATCH V-01: remediation_tasks.priority — explicit scoring formula added.
#                → Formula: Impact × ConfidenceWeight ÷ EffortWeight
#                → Impact = score improvement delta (or estimated_citation_impact for gap tasks)
#                → ConfidenceWeight: sufficient=1.0, partial=0.7, insufficient=0.4, pending=0.5
#                → EffortWeight inverse: low=3, medium=2, high=1 (quick wins float to top)
#                → Final rank = RANK() OVER (PARTITION BY brand_id ORDER BY score DESC)
#                → CX: item #1 is always the single best action right now, no deliberation needed
#                → Revenue: high-impact actions surface first → customers act → results → retention
#                → Reputation: confidence weighting prevents sending customers down expensive
#                  high-effort paths on weak evidence; we protect credibility by being honest
#
#         PATCH V-02: remediation_tasks.confidence_label TEXT column added.
#                → 'High'|'Medium'|'Low'|null derived from parent audit quality_status
#                → sufficient→High, partial→Medium, insufficient→Low, pending→null
#                → For gap-spawned tasks: derived from visibility_trends.sample_quality
#                → Low confidence tasks shown with gentle note (not hidden, not alarming)
#                → CX: only language shown is High/Medium/Low — no statistics exposed
#                → Revenue: transparency keeps customers engaged; they return for more audits
#                → Reputation: VisibleAU never shows confident output on weak data
#
#         PATCH V-03: Phase 2 Explainability Contract — formal API rule.
#                → Every score-bearing Phase 2 API response must include:
#                  rationale (plain-English why), confidence_label, confidence_note, top_action
#                → All text at Year 10 reading level; forbidden: algorithm/heuristic/statistical/CI
#                → lib/platform/explainability.ts ExplainabilityService.annotate() — mandatory
#                → Empty or generic rationale is a build failure, not acceptable output
#                → CX: every screen answerable without help docs, support, or GEO/AEO background
#                → Revenue: customers who understand act; customers who act see results; retention
#                → Reputation: VisibleAU's core market promise is clarity where competitors give
#                  opaque dashboards; every vague API response damages that positioning directly
#
# v7.7 — Data flow + formula audit
#         (new angles: remediation_tasks effort denormalization, mention_rate/citation_rate
#          computation formulas, workflow_runs result_summary shape, citation-failure-diagnosis
#          input contract, mention_source_ratio division-by-zero, provider seed requirement):
#         CONFLICT U-04 [MODERATE]: remediation_tasks missing effort field.
#                → Phase 1 recommendations.effort = 'low'|'medium'|'high' (Sprint 6 spec).
#                → Phase 2 remediation_tasks has recommendation_id FK but no effort column.
#                → Gap-spawned tasks (from fan_out_gap_id / topical_gap_id) have no parent
#                  recommendation, so effort cannot be joined — must be stored on the task itself.
#                → Added effort TEXT with denormalization rule: copy from recommendations.effort
#                  when recommendation_id is set; use heuristic for gap-spawned tasks.
#         CONFLICT U-05 [MODERATE]: mention_rate and citation_rate had no computation formula.
#                → Column comments defined what they measure but not how to compute from raw data.
#                → aggregate-visibility-trend.ts needs exact SQL/Drizzle logic to produce them.
#                → Added: mention_rate = COUNT(DISTINCT promptId WHERE brandMentioned=true) /
#                  COUNT(DISTINCT promptId) × 100, sourced from citations.brandMentioned BOOLEAN.
#                → Added: citation_rate = COUNT(DISTINCT promptId WHERE brand domain in citedSources) /
#                  COUNT(DISTINCT promptId) × 100.
#         CONFLICT U-09 [MODERATE]: workflow_runs.result_summary JSONB had no shape specification.
#                → schedule-workflow-runs.ts writes this field but no TypeScript type existed.
#                → Added: keyed shape per workflow_type (auditsTriggered, reportsGenerated,
#                  auditId, fanOutResultsCount, linkedinScore, consensusScore, errorMessage, durationMs).
#         CONFLICT U-10 [MODERATE]: citation-failure-diagnosis.ts had no input shape.
#                → T-04 added the function and route but left the function signature undefined.
#                → Added: diagnose({ brandId, auditId?, promptId? }) → CitationDiagnosis[].
#                → Reads 3 tables: citation_source_intelligence, comparison_prompt_results,
#                  topical_coverage_gaps. Returns array matching CitationFailureDiagnosis.tsx type.
#         CONFLICT U-12 [MODERATE]: mention_source_ratio = citation_rate / mention_rate
#                → Division by zero when mention_rate = 0 (brand completely invisible).
#                → No guard specified — would produce runtime NaN/Infinity in aggregate function.
#                → Added: mentionSourceRatio = mentionRate > 0 ? citationRate / mentionRate : null.
#                → NULL maps to 'invisible' archetype; UI displays 'N/A' for the ratio.
#         CONFLICT U-14 [MODERATE]: provider_market_capabilities.is_enabled DEFAULT false,
#                → No seed data specified — all providers start disabled at Sprint 1 migration.
#                → ProviderCapabilityRegistry.getEnabledProviders() would return empty array,
#                  silently breaking ALL Phase 2 fan-out, journey, and comparison functions.
#                → Added AU_EN seed block: 4 providers (openai/anthropic/google/perplexity)
#                  seeded with is_enabled=true in db/seed/provider-market-capabilities.ts.
# v7.6 — Cross-document audit: ChatGPT LLD v7 ZIP + Competitor PRD + Killer Features doc
#         (audit angles: LLD v7 SQL addendum conflicts, Competitor PRD R1-R5 + D1-D6 gaps,
#          Citation Failure Diagnosis placement, budget policy default conflicts):
#         CONFLICT T-01 [BREAKING]: ChatGPT LLD v7 SQL addendum market_ai_budget_policies
#                → max_models_per_audit DEFAULT 2 conflicts with PRD §7 canonical 4 engines paid.
#                → LLD v7 addendum would cap paid-tier audits at 2 engines (Free tier limit).
#                → Phase 2 LLD DEFAULT 4 is correct. Added clarification note to column comment.
#                → Root cause: LLD v7 was conservative; didn't reference PRD §7 engine roadmap.
#         CONFLICT T-02 [BREAKING]: ChatGPT LLD v7 SQL addendum market_ai_budget_policies
#                → max_repeated_samples DEFAULT 3 conflicts with Sprint 3 canonical runsPerPrompt=5.
#                → LLD v7 addendum would break Wilson CI math (requires ≥5 runs per Sprint 3).
#                → Phase 2 LLD DEFAULT 5 is correct. Added clarification note to column comment.
#         CONFLICT T-03 [MODERATE]: ChatGPT LLD v7 sampling_policies minimum_repeated_samples=2
#                → Phase 2 LLD uses 3 (minimum for meaningful std dev).
#                → LLD v7's floor of 2 allows std dev of 2 points which is statistically weak.
#                → Phase 2 LLD's 3 is correct per S-03 fix (citation_volatility_score edge case).
#         CONFLICT T-04 [FEATURE GAP]: Citation Failure Diagnosis missing from Phase 2 sprint plan.
#                → CitationFailureDiagnosis.tsx component exists in outputs directory.
#                → Competitor PRD §4 Requirement D2 marks it as Must Have.
#                → Killer Features doc lists it as a primary differentiator.
#                → PRD §4.5 pain points: customers repeatedly ask 'Why doesn't AI cite us?'
#                → No Phase 2 sprint owned it — now assigned to Sprint 3 (Visibility Intelligence).
#                → No new table needed: uses existing citation_source_intelligence,
#                  comparison_prompt_results, topical_coverage_gaps data at read-time.
#                → lib/visibility/citation-failure-diagnosis.ts computes diagnosis.
#                → UI: /brands/[brandId]/visibility/citation-failure page.
#         COMPETITOR PRD COVERAGE ASSESSMENT (Profound/AthenaHQ/Scrunch/Peec/Otterly):
#                → R1 Prompt Intelligence: COVERED (vertical_pack_prompts, run-audit.ts,
#                  volatility-detector.ts). GAP: user-created custom prompt libraries —
#                  intentionally descoped per CLAUDE.md §2 (v1.1 feature).
#                → R2 Citation Intelligence: COVERED (citations table, citation_source_intelligence,
#                  evidence_snapshots). Minor gap: per-competitor citation displacement signal.
#                → R3 Mention Intelligence: COVERED (brand_web_mentions, brand mention tracking).
#                → R4 Share of Voice: COVERED (share_of_voice_snapshots, SoV by engine).
#                → R5 Visibility Monitoring: COVERED (visibility_trends, drift_alerts, cron audits).
#                → D1 Health Check: COVERED (agent_readiness_scores + action_items top 5 fixes).
#                → D2 Citation Failure Diagnosis: NOW COVERED (T-04 fix, Sprint 3).
#                → D3 Confidence Score: COVERED (sample_quality labels Confirmed/Likely/Hypothesis).
#                → D4 Recurring Audits: COVERED (audit_schedules, schedule-audits.ts).
#                → D5 Client Narrative: COVERED (generated_reports, Layer 6 Communication).
#                → D6 Local AI Trust Radius: COVERED (AU vertical packs, local_seo_results).
# v7.5 — Edge case + operational detail audit
#         (new angles: org_feature_flags canonical values, day_of_week/month constraint,
#          citation_volatility_score NULL handling, content-structure crawler reuse,
#          alert-composer triggers):
#         CONFLICT S-01 [MODERATE]: org_feature_flags.flag_key had no documented valid values.
#                → lib/feature-flags/index.ts reads these values but no canonical list existed.
#                → Claude Code implementations would invent arbitrary key names causing silent misses.
#                → Added 8 canonical flag_key values with purpose and access level (operator-only).
#         CONFLICT S-02 [MODERATE]: report_delivery_schedules day_of_week/day_of_month mutual exclusivity.
#                → frequency='weekly': day_of_week must be set (0-6), day_of_month must be NULL.
#                → frequency='monthly': day_of_month must be set (1-28), day_of_week must be NULL.
#                → No constraint documented; both columns could be set simultaneously.
#                → Added Zod refine validation pattern with mutual exclusivity and max day=28 (Feb-safe).
#         CONFLICT S-03 [MODERATE]: citation_volatility_score std dev undefined for <3 audit runs.
#                → New brands have 0-3 audits; std dev of 1-2 values is mathematically undefined.
#                → LLD said 'last 12 runs' with no minimum sample specification.
#                → Added: NULL when audit_count < 3 (not 0.0); std dev over available runs when 3-11;
#                  UI must handle NULL gracefully ('Not enough data (N audits)').
#         CONFLICT S-04 [MODERATE]: content-structure-audit.ts crawler infrastructure unspecified.
#                → Phase 2 weekly content audit crawls brand pages — new or shared with Sprint 7?
#                → Sprint 7 built lib/crawler/index.ts (Playwright, 20-page, 15s, 5min).
#                → Added: Phase 2 REUSES lib/crawler/index.ts — no second Playwright instance.
#                → Rows UPSERTED into content_structure_audits ON UNIQUE(brand_id, page_url).
#
#         CRAWLER IDENTITY USER-AGENT (Otterly review finding — Otterly’s rebuilt GEO Audit
#                lets users choose a crawler identity to simulate how GPTBot, ClaudeBot,
#                or PerplexityBot sees a page. This reveals UA-dependent content differences.):
#                → lib/crawler/index.ts currently uses default Playwright UA (human simulation).
#                → content-structure-audit.ts SHOULD pass GPTBot UA when crawling:
#                       crawlSite(brand.domain, { userAgent: 'GPTBot/1.1' })
#                  Use GPTBot as the default bot UA — most widely allowed (Tier 1 must-allow).
#                  Reveals pages that serve different content to AI bots vs human users:
#                  Cloudflare Bot Management, CDN rules, rate limiting can differ by UA.
#                → lib/crawler/index.ts change: add optional userAgent param to crawlSite().
#                  Default: Playwright UA (human simulation for Phase 1 technical_audits).
#                  Override: 'GPTBot/1.1' for Phase 2 content-structure-audit.ts.
#                → UI note: "Crawled as GPTBot — shows what ChatGPT sees, not what users see."
#                → Sprint 6 deliverable. Small config change to existing infrastructure.
#         CONFLICT S-05 [MODERATE]: alert-composer.ts alert types and triggers unspecified.
#                → 'Drift + hallucination + consensus alert emails' — no trigger conditions or bodies.
#                → Added: 4 alert types (hallucination, drift, consensus, volatility) with:
#                  trigger functions, subject line patterns, body content, recipient filter
#                  (notification_preferences.emailOnDrift pattern from Phase 1 Sprint 9).
# v7.4 — Status machine + type contract audit
#         (new angles: wont_fix dismissed reason, topic_cluster naming convention,
#          org_members invitation flow, BudgetPolicyService type contracts):
#         CONFLICT R-02 [MODERATE]: remediation_tasks 'wont_fix' status has no dismissed reason.
#                → Phase 1 action_items: 'dismissed' status requires dismissedReason (Zod validated).
#                → Phase 2 remediation_tasks: 'wont_fix' status with no reason column.
#                → Added: wont_fix_reason TEXT with Zod refine validation pattern matching Sprint 6.
#         CONFLICT R-03 [MODERATE]: topical_coverage_gaps.topic_cluster — source and naming unspecified.
#                → Sprint 5 vertical_pack_prompts.topic uses hyphens ('emergency-service').
#                → Phase 2 topic_cluster uses underscores ('emergency_service') — different convention.
#                → calculate-topical-gaps.ts must translate: topic.replace(/-/g, '_').
#                → Seed source: DISTINCT topic FROM vertical_pack_prompts WHERE vertical=$brand.vertical
#                  AND retiredAt IS NULL. Topic clusters are a subset of the vertical pack taxonomy.
#         CONFLICT R-04 [MODERATE]: org_members invitation flow — accepted_at unspecified.
#                → Phase 1 Better Auth auth_invitations handles org-level authentication.
#                → Phase 2 org_members is brand-scoped access ON TOP — different layer.
#                → Added: 5-step invitation flow (POST invite → email → GET accept link → set
#                  accepted_at=now() + is_active=true). Note: invitee must already have Better Auth session.
#         CONFLICT R-05 [MODERATE]: BudgetPolicyService — CostEstimate/EnforcementResult types missing.
#                → estimate(), enforce(), record() declared with unknown return types.
#                → Without type definitions, Phase 2 Sprint 1 callers cannot implement correctly.
#                → Added: full TypeScript interface definitions for AuditParams, CostEstimate,
#                  BudgetPolicy, EnforcementResult.
#                → Added: caller spec — run-audit.ts calls estimate() before LLM dispatch;
#                  refresh-audit.ts calls record() after completion.
# v7.3 — CLAUDE.md anti-pattern + scoring formula audit
#         (new angles: cross-org 404 guard, isEngineEnabled() gate, LinkedIn/YouTube score formulas,
#          LLM_MODE=mock coverage for Phase 2 LLM functions):
#         CONFLICT Q-01 [MODERATE]: Phase 2 API routes missing cross-org 404 guard.
#                → CLAUDE.md §8: "Never return 401 on cross-org access — return 404."
#                → O-01 setRlsContext fix correctly uses 401 for unauthenticated (no session).
#                → But missing: empty-result-after-RLS-scoping must return 404, not 401.
#                → Pattern: after main DB query, if result is empty → 404 (RLS silently filtered it).
#                → Returning 401 for wrong-org access leaks org membership information.
#         CONFLICT Q-02 [MODERATE]: Phase 2 LLM functions skip isEngineEnabled() check.
#                → Sprint 12 JD3: added isEngineEnabled() to lib/feature-flags/index.ts.
#                → Phase 2 simulate-query-fan-out.ts, run-journey.ts, run-comparison-prompts.ts
#                  dispatch LLM calls across all 4 engines without checking if each is enabled.
#                → Engine outage (LLM_ENGINE_OPENAI_ENABLED=false) would fail entire Phase 2 function.
#                → Added: filter engines[] via isEngineEnabled() before dispatching.
#         CONFLICT Q-03 [MODERATE]: linkedin_presence_audits.presence_score had no formula.
#                → 8 numeric/boolean columns but no scoring weights → Claude Code invents arbitrary weights.
#                → Formula added: company page (30pts) + founder/practitioner (40pts) + content quality (30pts).
#                → Thresholds sourced from Profound Q1 2026 research (59% citations from individuals,
#                  95% from original posts, 500-2000 word articles = citation sweet spot).
#         CONFLICT Q-04 [MODERATE]: youtube_presence_audits.presence_score had no formula.
#                → Formula added: channel existence (15pts) + content volume (20pts)
#                  + transcript/chapter quality (35pts, strongest predictor) + embedding+schema (20pts)
#                  + AI citation signal (10pts).
#                → Sourced from OtterlyAI YouTube GEO Study March 2026 + BrightEdge AI Overviews data.
#         CONFLICT Q-05 [LOW]: Phase 2 LLM-calling functions not covered by LLM_MODE=mock strategy.
#                → CLAUDE.md §8: "Never run real LLM API calls in tests — use LLM_MODE=mock."
#                → 5 Phase 2 functions make LLM calls with no test fixture guidance.
#                → Added: each function mapped to appropriate canonical mock scenario.
#                → No new scenarios needed (uses existing canonical 4); Sri's approval not required.
# v7.2 — Communication + classification audit
#         (new angles: scheduled report email template, sample_quality derivation,
#          brand_archetype thresholds, hallucination claim_type classification, metric_quality_gates seed):
#         CONFLICT P-01 [MODERATE]: send-scheduled-reports.ts email template not specified.
#                → Phase 1 Sprint 2 fully specified audit-complete email template; same gap here.
#                → Added: From noreply@visibleau.com; subject line patterns (monthly/weekly);
#                  body sections (score card, top win, top gap, PDF attachment, unsubscribe link);
#                  uses lib/email/client.ts Resend singleton — do NOT create a new instance.
#         CONFLICT P-02 [MODERATE]: sample_quality on visibility_trends had no derivation rule.
#                → 'Confirmed'|'Likely'|'Hypothesis'|'Insufficient data' applied to audit aggregates.
#                → Derivation: audit_count < minimum_samples=3 → 'Insufficient data';
#                  coverage > 0.60 → 'Confirmed'; 0.40-0.60 → 'Likely'; <0.40 → 'Hypothesis'.
#                → Reuses Phase 1 lib/confidence-labels/classify.ts for label consistency.
#         CONFLICT P-03 [MODERATE]: brand_archetype classification had no numeric thresholds.
#                → 4 labels defined but no cutoffs; mention-source-divide.ts cannot classify.
#                → Added thresholds: mention_rate ≥ 0.20 = high; citation_rate ≥ 0.10 = high.
#                → Source: Semrush AI Visibility Index Sept 2025 (top-20% brands averaged 21%).
#                → Full 2×2 quadrant matrix added to column comment.
#         CONFLICT P-04 [MODERATE]: detect-hallucinations.ts had no claim_type classification logic.
#                → 'wrong_price'|'wrong_location'|'wrong_product'|'wrong_founder'|'competitor_confusion'
#                  were defined but nothing specified how to distinguish between them.
#                → Classification: keyword regex on citations.hallucinationFlags JSONB (Phase 1 field).
#                → Severity mapping: critical=(wrong_price/wrong_founder/competitor_confusion),
#                  warning=(wrong_product/wrong_location), info=(other).
#         CONFLICT P-05 [MODERATE]: metric_quality_gates table had no seed data.
#                → QualityGateService.evaluate() (O-02 fix) reads this table; without rows it returns
#                  nothing and every audit stays at quality_status='pending' forever.
#                → Added AU_EN seed pattern: 7 metric_key rows with minimum_samples values.
#                → Must be seeded in Phase 2 Sprint 1 (db/seed/metric-quality-gates.ts).
# v7.1 — Security + runtime contract audit
#         (new angles: RLS setRlsContext on all Phase 2 routes, quality_status writer,
#          sample org exclusion extension, audit_cost_snapshots writer, retired prompt filter):
#         CONFLICT O-01 [BREAKING]: All 30+ Phase 2 API routes missing setRlsContext call.
#                → Phase 1 Sprint 1 AA2 fix established: without setRlsContext(db, orgId),
#                  RLS policies cannot read app.current_org_id and are silently bypassed.
#                → Phase 2 adds 30+ new protected routes across 6 intelligence layers.
#                → None referenced setRlsContext — a cross-org data leak in every Phase 2 route.
#                → Added mandatory pattern block: getCurrentUser() → setRlsContext() → db queries.
#                → Applies to every GET/POST/PATCH/DELETE route listed in the Phase 2 API section.
#         CONFLICT O-02 [MODERATE]: audits.quality_status column had no writer specified.
#                → Column defaults to 'pending' but never transitions to 'sufficient'|'partial'|'insufficient'.
#                → Writer: QualityGateService.evaluate(auditId) called from refresh-audit.ts
#                  after scoring completes, reading metric_quality_gates for the audit's market_code.
#         CONFLICT O-03 [MODERATE]: Sample org exclusion (D-03) only covered audit_cost_snapshots.
#                → Sprint 10 synthetic sample org (slug='sample') should never appear in
#                  Phase 2 aggregation data — but 4 functions had no exclusion:
#                  aggregate-visibility-trend.ts, track-brand-web-mentions.ts,
#                  score-agent-readiness.ts, simulate-query-fan-out.ts.
#                → Added: JOIN organizations AND organizations.slug != 'sample' pattern.
#         CONFLICT O-04 [MODERATE]: audit_cost_snapshots table had no writer specified.
#                → Table defined but no INSERT path existed in any Phase 2 or Phase 1 function.
#                → Writer: refresh-audit.ts (Phase 1 post-scoring), via BudgetPolicyService.
#                → Full INSERT pattern added including USD→AUD cents conversion and sample exclusion.
#         CONFLICT O-05 [MODERATE]: simulate-query-fan-out.ts missing retired prompt filter.
#                → Phase 1 Sprint 5 canonical: all vertical_pack_prompts reads filter WHERE retired_at IS NULL.
#                → Phase 2 fan-out reads vertical_pack_prompts to get prompts to run fan-out against.
#                → Without the filter, retired (stale) prompts would be included in fan-out runs.
#                → Added: isNull(verticalPacks.retiredAt) + isNull(verticalPackPrompts.retiredAt) filter.
# v7.0 — Drizzle exports + API contract audit
#         (completing M-series + new N-series: Drizzle barrel exports, content_format mapping,
#          Phase 2 recommendation_keys, YouTube API endpoints, webhook taxonomy, is_false_positive):
#         CONFLICT M-04 [MODERATE]: report_templates.is_default had no seed specification.
#                → is_default=true row must exist before generate-narrative-report.ts can run.
#                → Added full INSERT ON CONFLICT DO NOTHING seed pattern with exact sections JSONB.
#                → generate-narrative-report.ts falls back to core sections if no row found.
#         CONFLICT M-05 [MODERATE]: journey_run_results.journey_score had no formula.
#                → Formula: (brand_appeared_in_n_turns / total_turns) × 100
#                → Early mention bonus: turn 1 = +10pts, turn 2 = +5pts, turn 3+ = no bonus. Cap 100.
#                → Rationale: unprompted first mention is the highest-value signal in a journey.
#         CONFLICT N-01 [BREAKING]: Phase 2 LLD is SQL DDL — no Drizzle ORM schema files specified.
#                → Sprint 9 GA1 fix class: without barrel exports, TypeScript imports fail at build.
#                → Added Drizzle schema file grouping (phase2-platform, phase2-workflow, etc.)
#                → db/schema/index.ts export pattern shown for all 8 Phase 2 schema groups.
#                → Phase 2 ALTER TABLE additions go in existing Phase 1 Drizzle schema files.
#         CONFLICT N-02 [MODERATE]: content_format_detected → content_format mapping unspecified.
#                → content_structure_audits uses 'product_page'|'other' (detected from existing pages).
#                → content_drafts uses 'press_release'|'linkedin_article' (generated, not detected).
#                → content-format-selector.ts must map: 'product_page'→'comparison_article',
#                  'other'→'expert_article'; 'press_release'+'linkedin_article' come from recommendation_key.
#         CONFLICT N-03 [MODERATE]: Phase 2 Action Center recommendation_keys not seeded.
#                → Sprint 6 seeded 11 keys; Phase 2 adds 8 new types (youtube-absence, entity-home-missing,
#                  topical-gap, fan-out-coverage, consensus-discrepancy, knowledge-panel-absent,
#                  wikidata-absent, mcp-endpoint-missing).
#                → Must extend CONFIDENCE_LEVELS + recommendation_research seed per Phase 2 Sprint prompt.
#         CONFLICT N-04 [MODERATE]: youtube_presence_audits — YouTube Data API v3 endpoints not specified.
#                → YOUTUBE_API_KEY was documented (K-05) but API call sequence was missing.
#                → Added: channels.list (subscriber + uploads playlist), playlistItems.list (video IDs),
#                  videos.list (duration + chapters + description), embedding page check.
#         CONFLICT N-05 [MODERATE]: Sprint 8 webhook event taxonomy not extended for Phase 2.
#                → Phase 1 VALID_EVENTS: 5 event types. Phase 2 adds 5 more event types:
#                  'report.generated', 'hallucination.detected', 'hallucination.acknowledged',
#                  'visibility.trend.updated', 'agent.readiness.scored'.
#                → fanout-webhooks.ts (Sprint 8) must handle all 10 event types.
#         CONFLICT N-06 [LOW]: hallucination_incidents missing is_false_positive column.
#                → Teams could acknowledge but not dispute incorrect detections.
#                → is_false_positive BOOLEAN DEFAULT false added; PATCH endpoint sets it.
#                → Distinct from is_acknowledged: false_positive=true dismisses without correcting.
# v6.9 — Data contract + formula audit
#         (new angles: upsert pattern on unique+monthly tables, period_label format,
#          narrative report input shape, agent readiness score formulas):
#         CONFLICT L-01 [MODERATE]: brand_consensus_checks.UNIQUE(brand_id, source_type) — no upsert spec.
#                → Monthly re-checks INSERT into a table with UNIQUE(brand_id, source_type).
#                → Without ON CONFLICT DO UPDATE, re-checks throw duplicate key errors.
#                → Added full ON CONFLICT DO UPDATE pattern to the table comment.
#                → check-cross-platform-consensus.ts must use this upsert — latest state only.
#                → Phase 3 option: add brand_consensus_history table for full history.
#         CONFLICT L-02 [MODERATE]: visibility_trends.period_label format not specified.
#                → '2026-W23'|'2026-06' are examples but no producing function format string given.
#                → UNIQUE(brand_id, period_label, period_type) requires exact label consistency.
#                → Wrong formats ('W23', '2026-6', '2026-23') break the unique constraint silently.
#                → Added: weekly = format(startOfISOWeek(date), "yyyy-'W'II") via date-fns (already installed).
#                       monthly = format(startOfMonth(date), 'yyyy-MM') via date-fns.
#                → 'II' = ISO week number zero-padded 01-53.
#         CONFLICT L-03 [MODERATE]: generate-narrative-report.ts — input shape not specified.
#                → Without knowing which tables it reads, Claude Code produces an incomplete function.
#                → Added full input spec: 8 tables read (visibility_trends, query_fan_out_results,
#                  topical_coverage_gaps, citation_source_intelligence, linkedin_presence_audits,
#                  brand_consensus_checks, brand_entity_scores, content_structure_audits).
#                → All reads nullable-checked; evidence rules from lib/communication/narrative-generator.ts.
#                → Output: generated_reports row with narrative_text + JSONB summary fields.
#         CONFLICT L-04 [LOW]: agent_readiness_scores dimension score formulas not specified.
#                → 5 dimension scores (tech, entity_clarity, verify, authority, task) each /20.
#                → Without formulas, Claude Code invents arbitrary weights; scores are not reproducible.
#                → Added per-dimension formulas as SQL comments on each score column:
#                  tech /20: 8 boolean signals × weights 2-3pts each
#                  entity_clarity /20: 5 boolean signals × weights 3-5pts each
#                  verify /20: ABN+Wikipedia(5+5) + directories(max4) + reviews(max3) + quotes(3)
#                  authority /20: TCG→8pts + citation_rate×6pts + diversity→6pts
#                  task /20: 4 signals × 5pts each (booking/pricing/area/faq)
#                  total /100: sum of all 5 dimension scores
# v6.8 — Database constraint + operational completeness audit
#         (new angles: nullable FK in UNIQUE constraints, is_current/is_active management,
#          competitor_domain source in SoV, Phase 2 env vars):
#         CONFLICT K-01 [MODERATE]: citation_source_intelligence UNIQUE(brand_id, audit_id, engine, source_type)
#                → audit_id is nullable; PostgreSQL NULL != NULL in UNIQUE constraints.
#                → Multiple rows with audit_id=NULL for same brand+engine+source_type are permitted,
#                  defeating the deduplication purpose for aggregate rows.
#                → Replaced single UNIQUE constraint with two partial unique indexes:
#                  csi_unique_with_audit (WHERE audit_id IS NOT NULL)
#                  csi_unique_aggregate (WHERE audit_id IS NULL)
#         CONFLICT K-02 [MODERATE]: llmstxt_versions.is_current — no mechanism to flip old rows.
#                → Multiple rows can have is_current=true for same brand_id (no trigger/constraint).
#                → Added management note: UPDATE SET is_current=false before INSERT in a transaction.
#                → Added partial unique index: UNIQUE ON (brand_id) WHERE is_current = true.
#                → llmstxt-refresh.ts owns this transaction pattern.
#         CONFLICT K-03 [MODERATE]: config_bundle_cache.is_active — same silent-duplicate pattern.
#                → Multiple active bundles per market+locale+segment could coexist.
#                → Added ConfigBundleService.activate() transaction pattern note.
#                → Added partial unique index: UNIQUE ON (market_code, locale, segment) WHERE is_active = true.
#         CONFLICT K-04 [MODERATE]: share_of_voice_snapshots.competitor_domain source unspecified.
#                → Same gap as I-03 (comparison_prompt_results) fixed in v6.6.
#                → Source is brands.competitors TEXT[] (Phase 1 column).
#                → calculate-share-of-voice.ts iterates brands.competitors per brand.
#                → Note added to CREATE TABLE comment.
#         CONFLICT K-05 [LOW]: Phase 2 YOUTUBE_API_KEY env var not documented.
#                → Phase 2 Sprint 3 (track-brand-web-mentions.ts) requires YouTube Data API v3.
#                → YOUTUBE_API_KEY added to env var section with setup instructions.
#                → Confirmed no other new external API keys needed for Phase 2.
# v6.7 — Schema completeness + runtime contract audit
#         (new angles: updatedAt on mutable tables, org_members permission matrix,
#          LinkedIn data source, LLM cache behavior for new task types):
#         CONFLICT J-01 [BREAKING]: 10 Phase 2 mutable tables missing updated_at column.
#                → Phase 1 Foundations rule + precedent (Sprint 8 FG4 + Sprint 9 GA2 fixes):
#                  every mutable record needs updated_at TIMESTAMPTZ NOT NULL DEFAULT now().
#                → Tables fixed: hallucination_incidents, conversation_journeys, workflow_runs,
#                  content_drafts, report_templates, report_delivery_schedules, generated_reports,
#                  org_members, org_feature_flags, agent_readiness_scores.
#                → Append-only tables correctly left without updated_at:
#                  audit_cost_snapshots, crawler_visit_logs, evidence_snapshots, data_residency_log,
#                  google_ai_mode_results, youtube_presence_audits (new row per check = immutable).
#         CONFLICT J-02 [MODERATE]: org_members.role values undocumented against Phase 1 users.role.
#                → Phase 1 users.role: 'owner'|'admin'|'member'
#                → Phase 2 org_members.role: 'owner'|'admin'|'analyst'|'viewer' (different set)
#                → No permission matrix showing what each role can/cannot do.
#                → Full permission matrix added: 8 actions × 4 roles.
#                → 'analyst' ≈ Phase 1 'member' but brand-scoped; 'viewer' = strict read-only.
#         CONFLICT J-03 [MODERATE]: linkedin_presence_audits had no data source specification.
#                → LLD said 'LinkedIn scraping (within ToS)' with no method.
#                → LinkedIn restricts API; raw follower counts require either public page scraping
#                  or OAuth-authenticated Marketing API access.
#                → Phase 2: public cheerio scrape of company + founder public pages.
#                → Fields requiring auth (exact engagement rates) stored as NULL until Phase 3 OAuth.
#                → Brand provides company_page_url + founder_profile_url at brand setup time.
#         CONFLICT J-04 [MODERATE]: Phase 2 LLM calls had no cache behavior specified.
#                → narrative_generation: bypassCache=false + TTL 720h (30 days); monthly reports
#                  reuse same template → cache saves cost for repeated monthly runs.
#                → content_draft: bypassCache=true; each draft is unique per brand+gap+format.
#                → Both use existing Sprint 2 LLMService cache mechanism (bypassCache flag in metadata).
# v6.6 — Integration contract audit (new angles: tier gate specs, model-selector extension,
#         competitor_domain sourcing, web scraping library):
#         CONFLICT I-01 [MODERATE]: Phase 2 features had no tier gate specifications.
#                → linkedin_presence_audits, youtube_presence_audits, conversation_journeys,
#                  comparison_prompt_results, content_drafts, generated_reports all unspecified.
#                → Added full tier gate reference table covering all 20 Phase 2 feature areas
#                  across Free/Starter/Growth/Agency/Agency Pro tiers.
#                → Pattern: Inngest functions check subscriptions.tier via lib/quota/check.ts.
#         CONFLICT I-02 [BREAKING]: lib/llm/model-selector.ts ModelTask union not extended.
#                → Phase 1 ModelTask: 'brand_mention' | 'sentiment' | 'context' (3 types)
#                → Phase 2 adds generate-narrative-report.ts and generate-content-draft.ts,
#                  both making LLM calls without a registered ModelTask type.
#                → Without extension: TypeScript type error + CLAUDE.md §8 anti-pattern violation
#                  (hardcoding model strings outside model-selector.ts).
#                → Added model-selector.ts extension spec:
#                  'narrative_generation' (always cheapest — structured template fill)
#                  'content_draft' (mid-tier Growth+, cheapest Free/Starter)
#                → 40 new test combinations required (5 tiers × 4 engines × 2 tasks).
#         CONFLICT I-03 [MODERATE]: run-comparison-prompts.ts had no spec for competitor_domain source.
#                → Phase 1 brands.competitors TEXT[] is the source (set at brand creation).
#                → Added: reads brands.competitors array, iterates per domain, Growth tier+ gate.
#         CONFLICT I-04 [MODERATE]: brand-mention-tracker.ts had no scraping library specified.
#                → Reddit: fetch() + Reddit JSON search API (no auth needed for public search)
#                → YouTube: YouTube Data API v3 (YOUTUBE_API_KEY env var)
#                → Quora: cheerio scrape
#                → Do NOT use Playwright (too heavy for background weekly job)
#                → Do NOT call LLM providers (scraping ≠ LLM inference)
# v6.5 — Operational completeness audit (new angles: Inngest serve() registration,
#         cron UTC expressions, entity_score naming collision, prompt_sequence shape,
#         report delivery timezone):
#         CONFLICT H-01 [BREAKING]: ~25 Phase 2 Inngest functions had no serve() registration.
#                → Phase 1 Sprint 9 GA1 fix established: without serve(), functions are silently ignored.
#                → Full serve() import block added for all 25 Phase 2 Inngest functions across 6 layers.
#         CONFLICT H-02 [MODERATE]: Phase 2 cron descriptions used vague 'Monday 6am AEST' phrasing.
#                → Phase 1 pattern: always specify UTC cron expressions (e.g. '0 2 * * *').
#                → aggregate-visibility-trend.ts: '0 20 * * 1' (Mon 20:00 UTC = Tue 07:00 AEDT summer / 06:00 AEST winter).
#                → calculate-topical-gaps.ts: '0 21 * * 2' (staggered from visibility trend).
#                → Cron conflict check noted (safe: no Phase 1 crons at these times per JM3 map).
#         CONFLICT H-03 [MODERATE]: agent_readiness_scores.entity_score INTEGER (/20) naming collision.
#                → v6.2 removed entity_score from brand_entity_scores ALTER TABLE (duplicated score_of_10).
#                → agent_readiness_scores uses entity_score for 'entity clarity' dimension (/20 of /100).
#                → Different scale (not /10), different table, different purpose — same column name.
#                → Renamed to entity_clarity_score to eliminate confusion.
#         CONFLICT H-04 [MODERATE]: conversation_journeys.prompt_sequence JSONB had no shape spec.
#                → Without shape doc, Claude Code invents arbitrary structure; run-journey.ts breaks.
#                → Shape added: [{ turn, prompt, intent }] array, 2-8 turns, {brandName} placeholder.
#         CONFLICT H-05 [LOW]: report_delivery_schedules.time_of_day DEFAULT '09:00' labeled 'AEST'.
#                → AU has daylight saving (AEDT=UTC+11 Oct-Apr, AEST=UTC+10 May-Sep).
#                → Storing AEST time as literal '09:00' with no UTC basis misaligns by 1h in summer.
#                → Changed default to '23:00' (UTC) with timezone explanation note.
# v6.4 — Cross-sprint data flow audit (new angles: score aggregation source columns,
#         PDF theme import chain, draft_type naming convention, agency_brand_assets link,
#         vertical enum constraints, workflow quota gate):
#         CONFLICT G-01 [MODERATE]: visibility_trends.score_sentiment_avg / score_context_avg
#                → Phase 1 audits.scoreSentiment is TEXT (categorical 'positive'|'neutral'|'negative')
#                → AVG(scoreSentiment) fails; aggregate must use scoreSentimentNumeric (NUMERIC)
#                → Same for scoreContext TEXT vs scoreContextNumeric NUMERIC
#                → Source column comments added to both columns in visibility_trends
#         CONFLICT G-02 [MODERATE]: lib/communication/pdf-builder.ts missing import from lib/pdf/theme.ts
#                → Sprint 9 (GB4) built lib/pdf/theme.ts: assetToTheme() + buildThemeStyles()
#                → Phase 2 pdf-builder.ts must import Sprint 9's theme, not duplicate it
#                → Import note added to lib/communication/ module block
#         CONFLICT G-03 [MODERATE]: content_drafts.draft_type naming convention mismatch
#                → draft_type uses underscores: 'wikipedia_article', 'reddit_comment'
#                → Phase 1 recommendation_key uses hyphens: 'wikipedia-article', 'reddit-absence'
#                → No string equality — lib/workflow/content-generator.ts must translate
#                → Translation mapping note added to draft_type column comment
#         CONFLICT G-04 [MODERATE]: generated_reports PDF generation missing agency_brand_assets link
#                → Phase 1 Sprint 9 agency_brand_assets table stores logo/colors/footer per org
#                → Phase 2 pdf-builder.ts must read agency_brand_assets for white-label styling
#                → Note added to pdf-builder.ts showing the DB read + theme application pattern
#         CONFLICT G-05 [MODERATE]: Three Phase 2 'vertical TEXT NOT NULL' columns undocumented
#                → conversation_journeys.vertical, topical_coverage_gaps.vertical,
#                  prompt_volume_estimates.vertical all lack valid value documentation
#                → Must match Phase 1 verticalEnum: 'tradies'|'allied_health'|'saas'
#                → Valid value comments added to all three tables
#         CONFLICT G-06 [LOW]: schedule-workflow-runs.ts fires audits without quota check note
#                → Must call checkQuota(orgId, brandId) from lib/quota/check.ts before 'audit/start'
#                → LinkedIn audits + consensus checks are not quota-tracked (correct)
#                → Quota gate note added to function comment
# v6.3 — Structural integrity audit (new angles: FK types, RLS coverage, retention FK,
#         API route naming, env/DB flag interaction, Inngest event naming):
#         CONFLICT E-01 [BREAKING]: users.id is UUID but 6 Phase 2 columns used TEXT REFERENCES users(id)
#                → All fixed: acknowledged_by, assigned_to, approved_by, user_id, invited_by → UUID
#         CONFLICT E-02 [BREAKING]: 30 Phase 2 tenant tables had zero RLS specification
#                → Added full RLS migration block with all 30 ALTER TABLE ENABLE RLS statements
#                → Global seed tables confirmed RLS DISABLED (7 tables)
#         CONFLICT E-03 [BREAKING]: 5 Phase 2 tables had NOT NULL audit_id/citation_id FKs that
#                would fail Sprint 12 12-month retention cron (JH4 fix deletes old audits+citations)
#                → evidence_snapshots: audit_id → ON DELETE SET NULL (immutable archive survives)
#                → audit_cost_snapshots, query_fan_out_results, google_ai_mode_results: ON DELETE CASCADE
#                → hallucination_incidents.citation_id: ON DELETE CASCADE
#         CONFLICT E-04 [MODERATE]: Phase 2 Layer 7 routes used /api/organisations/ (British spelling)
#                → Standardized to /api/organizations/ (American, matches table name) — 13 occurrences
#         CONFLICT E-05 [MODERATE]: org_feature_flags had no interaction note with Phase 1 env flags
#                → Added priority order: DB flags > env vars > defaults; lib/feature-flags/ extension note
# v6.2 — Fresh angle audit (PRD v1.15, CLAUDE.md, prototype v2.59, all sprint prompts re-read):
#         CONFLICT D-01: entity_score INTEGER (Phase 2 ALTER TABLE) duplicates score_of_10 NUMERIC(5,2) (Phase 1)
#                → Prototype BrandEntityAudit shows '7.2 / 10' — Phase 1 score_of_10 IS the entity score
#                → entity_score INTEGER removed from ALTER TABLE; score_of_10 continues as canonical
#                → Phase 2 UI reads score_of_10 directly (no migration needed)
#         CONFLICT D-02: content_structure_audits missing design note vs technical_audits.findings.content
#                → Sprint 7 EB5 fix: findings.content = { wordCount, answerCapsulesFound, answerCapsulesSuggested }
#                → content_structure_audits = per-URL retrieval intelligence (different scope, different cadence)
#                → Design note added: per-URL ongoing vs per-brand technical snapshot
#         CONFLICT D-03: audit_cost_snapshots must exclude sample audit synthetic org (Sprint 10 HC1)
#                → Sample audits run under organizations.slug='sample' (synthetic, auto-deleted 24h)
#                → BudgetPolicyService exclusion note added; sample cost tracked in Redis only
#                → EXTENDED (O-03): D-03 only covered audit_cost_snapshots. Four additional
#                  Phase 2 aggregation functions also process data from sample org brands:
#                  - aggregate-visibility-trend.ts: skip brands WHERE org.slug='sample'
#                  - track-brand-web-mentions.ts: skip brands WHERE org.slug='sample'
#                  - score-agent-readiness.ts: skip brands WHERE org.slug='sample'
#                  - simulate-query-fan-out.ts: skip audits WHERE org.slug='sample'
#                  Pattern: JOIN organizations ON brands.organization_id = organizations.id
#                           AND organizations.slug != 'sample' (or IS NULL)
#         CONFLICT D-04: (confirmed OK) confidence label casing 'Confirmed'|'Likely'|'Hypothesis'
#                → Phase 1 Sprint 8 FL5 fix uses mixed-case in UI; lowercase in classify.ts
#                → Phase 2 LLD mixed-case matches prototype display — consistent, no change needed
#         CONFLICT D-05: trigger-validation-reaudit missing 'audit/start' event name
#                → Phase 1 canonical: audit/start fires run-audit.ts + technical-audit-run.ts in parallel
#                → Phase 2 reaudit now explicitly fires 'audit/start' to reuse Phase 1 infrastructure

---

## CRITICAL RULE — DO NOT BREAK PHASE 1

Every Phase 2 table, service, and API route is ADDITIVE.
No Phase 1 table is modified except by adding nullable columns via migration.
No Phase 1 API route changes its existing response shape.
No Phase 1 Inngest function is replaced — new functions are added alongside.

### Phase 1 tables — must not change structure
**29 Phase 1 tables confirmed from deep transcript audit. All are protected — Phase 2 never recreates or alters these.**

**Core data (Sprints 1–6)**
- `organizations`             — `region` enum ('au'|'nz'|'uk'); Phase 2 maps to `market_code` via `lib/platform/region-to-market-code.ts`
- `users`                     — `role` text ('owner'|'admin'|'member'); Phase 2 `org_members` adds brand-scoped access ON TOP
- `brands`                    — `region` inherited from org at create; same market_code mapping. Late additions via Sprint 9 migration: `client_tag TEXT NULL` (portfolios = GROUP BY client_tag; do NOT create a portfolios table)
- `organizations`             — late additions: `ga4_measurement_id TEXT` + `ga4_api_secret TEXT` (Sprint 9 GD1 — GA4 Measurement Protocol push); `onboarding_complete BOOLEAN DEFAULT false NOT NULL` (Sprint 9 GD5); `slug TEXT UNIQUE` (Sprint 10 HC1 — synthetic demo org). Note: `metadata JSONB` was in Foundations v1.12 but needed an explicit Sprint 10 migration guard
- `audits`                    — Sprint 2 canonical columns: `engines TEXT[]`, `promptsCount INTEGER`, `runsPerPrompt INTEGER`, `totalCalls INTEGER`, `scoreComposite NUMERIC(5,2)`, `totalCostUsd NUMERIC(8,4)`. Sprint 3 adds: `scoreFrequency`, `scoreSentiment`, `scoreSentimentNumeric`, `scoreAccuracy`, `scorePosition`, `scoreContext`, `scoreContextNumeric`, `scoreConfidenceLow`, `scoreConfidenceHigh`, `confidenceIntervals JSONB`. Note: Foundations v1.12 shows `promptCount + engineCount` (Sprint 1 schema) but Sprint 2 v1.12 replaced these with `engines TEXT[]` + `promptsCount` + `runsPerPrompt` + `totalCalls`. Phase 2 adds 4 nullable columns
- `citations`                 — `rawResponse` (full LLM text), `isAccurate`, `hallucinationFlags`, `contextSnippets`, `competitorsMentioned`. Phase 2 adds 2 nullable columns
- `recommendations`           — `category`, `priority`, `effort`; generated per audit by Sprint 6 engine
- `recommendation_research`   — seed-only; `methodKey`, `source`, `confidenceLevel`
  **Phase 2 MUST extend recommendation_research + CONFIDENCE_LEVELS with new keys:**
  Phase 2 Action Center adds recommendation types not in Sprint 6's original 11 keys.
  Each Phase 2 sprint prompt must seed these new keys in db/seed/recommendation-research.ts:
  ```typescript
  // Phase 2 new recommendation_keys (add to CONFIDENCE_LEVELS in lib/recommendations/anti-patterns.ts):
  'youtube-absence'          // Layer 3 GAP 16: no YouTube channel or cited videos
  'entity-home-missing'      // Layer 1 GAP 12: no canonical entity home page
  'topical-gap'              // Layer 2 GAP 6: topic cluster not covered
  'fan-out-coverage'         // Layer 2 GAP 1: brand absent in AI sub-queries
  'consensus-discrepancy'    // Layer 3 GAP 10: brand info inconsistent across sources
  'knowledge-panel-absent'   // Layer 3 GAP 11: no Google Knowledge Panel
  'wikidata-absent'          // Layer 3 GAP 13: no Wikidata entry
  'mcp-endpoint-missing'     // Layer 1 GAP 3: no /mcp.json endpoint
  ```
  BLOCKED_KEYS check still applies — none of these 8 are blocked.
  Confidence levels (Sprint 6 pattern: 'confirmed'|'likely'|'hypothesis') must be set per key.
- `action_items`              — unique on `(auditId, recommendationKey)`; `status` ('open'|'in_progress'|'done'|'dismissed')
- `llm_response_cache`        — `cacheKey` unique; Sprint 2 dedup layer

**Vertical packs (Sprint 5)**
- `vertical_packs`            — `vertical`, `region`, `version`, `promptsCount`
- `vertical_pack_prompts`     — `packId` FK cascade-delete; `category`, `topic`, `rank`
  -- Phase 1 columns: id, packId, promptTemplate, rank, category, topic,
  --   expectedMentionType, notes, createdAt, retiredAt (all defined in Sprint 5)
  -- Phase 2 adds persona_tag via ALTER TABLE (see below — Phase 2 Sprint 1 migration)
  --
  -- AI PROMPT SUGGESTIONS — NICHE EXPLORER EQUIVALENT (danishashko OSS tracker finding):
  -- danishashko's "Niche Explorer" generates brand-specific high-intent AI query suggestions
  -- using an LLM call on brand description + industry + keywords.
  -- VisibleAU's 336 AU prompts are comprehensive for mainstream verticals but AU SMBs in
  -- edge cases (e.g. boutique NDIS physio, specialist conveyancer, niche SaaS) may need
  -- prompts beyond the base set that are specific to their suburb, service, or audience.
  --
  -- IMPLEMENTATION: Brand Setup Wizard (Sprint 5, Step 2 — after vertical selection)
  --   After selecting vertical + location, wizard runs one GPT-4o-mini call:
  --   Prompt: "Generate 5-10 high-intent questions that Australians ask AI platforms
  --            when looking for [brand.productDescription] in [brand.location].
  --            Format: JSON array of strings. Each question should be conversational,
  --            specific to the service and location, and reflect real buyer intent."
  --   Cost: ~A$0.001 per brand setup (negligible, not quota-counted)
  --   Output: wizard shows suggested prompts with checkboxes
  --   User can: ✓ add to their pack | ✗ skip | ✏️ edit before adding
  --   Added prompts: inserted into vertical_pack_prompts with packId, source='ai_suggested',
  --                  category inferred from question type, topic=brand.productDescription,
  --                  branded_intent derived from whether brand name appears
  --
  -- NEW COLUMN: source TEXT on vertical_pack_prompts
  --   'curated' = from the 336 AU base pack (default, most prompts)
  --   'ai_suggested' = generated by the Niche Explorer for this specific brand
  --   'custom' = manually added by the user
  --   Allows filtering in audit results: "Show only your custom prompts" or
  --   "Show curated AU prompts only" — useful for agency clients wanting to see
  --   VisibleAU's research vs their own additions
  --
  -- ALTER TABLE vertical_pack_prompts ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'curated';
  --   Existing 336 prompts: default to 'curated' (correct, zero breakage)
  --   No existing query affected — source is additive metadata
  --
  -- UI: Sprint 5 Wizard Step 2 shows "Suggested prompts for your business:"
  --   [5-10 checkboxes with AI-generated prompts]
  --   "Add selected to your tracking pack" button
  --   Starter/Free: limited to 3 suggestions (full 10 for Growth+)
  --   This makes VisibleAU feel personalised from day one — not a generic tool.

**Technical AI infrastructure (Sprint 7)**
- `technical_audits`          — 8 sub-scores (/18 robots, /18 llms.txt, /16 schema, /14 meta, /12 content, /10 entity, /6 signals, /6 discovery), `/100` composite. `auditId` FK nullable. Phase 2 Layer 1 `content_structure_audits` sits BESIDE this — different scope
- `canary_prompts`            — LLM drift probes; `lastResponseHash`, `driftDetected`
- `validation_corpus_results` — 50-site scoring validation; `withinBand`, `spearmanContribution`
- `citability_methods`        — Princeton KDD + AutoGEO seed data; `methodKey`, `effectSizePct`
- `local_seo_results`         — GMB presence, NAP consistency, directory presence JSONB, suburb coverage JSONB. Sprint 8. **Sits beside `brand_entity_scores` (different scope — local_seo_results = local SEO crawler; brand_entity_scores = AI-visibility entity scoring)**
- `brand_entity_scores`       — **Phase 1 Sprint 7 table** — AU entity checks; `abn_verified`, `abn_number`, `abn_entity_name`, `abn_status`, `wikipedia_au_present`, `wikipedia_au_url`, `wikipedia_au_mentions`, `au_tld_domains JSONB`, `au_directory_presence JSONB`, `score_of_10`, `checked_at`. **Phase 2 EXTENDS with ALTER TABLE nullable columns** (market_code, organization_id, hipages/directory fields, Knowledge Panel, Wikidata) — does NOT recreate

**Agency / client portal (Sprints 8–9)**
- `agency_brand_assets`       — White-label PDF config; `logoUrl`, `primaryColor`, `agencyName`, `contactEmail`
- `client_portal_invites`     — Magic-link read-only brand access
- `client_portal_views`       — Append-only view log; `inviteId`, `ipHash`, `pageViewed`
- `bulk_operations`           — Bulk re-audit / CSV export; `operationType`, `totalBrands`, `completedBrands`
- `audit_exports`             — Per-format export record; `format` ('pdf'|'csv'|'json'|'sarif'|'junit'|'gha'), `downloadCount`
  -- Sprint 4 ships: 'pdf' | 'csv' | 'json' (working). Sprint 8 ships: 'sarif' | 'junit' | 'gha'.
  -- DO NOT omit 'csv' and 'json' — Sprint 4 export endpoint (?format=pdf|csv|json) writes these rows.
  -- (Fix v8.18: LLD previously listed only 4 values, missing csv and json from Sprint 4 canonical.)
- `drift_alerts`              — CI-overlap drift detection; `currentAuditId`, `previousAuditId`, `severity`, `dimensionDeltas`
- `webhook_endpoints`         — Outbound destinations; `channel`, `events[]`, `signingSecret`
  **Phase 2 EXTENDS webhook event taxonomy (Sprint 8 FC4 fix canonical VALID_EVENTS):**
  Sprint 8 VALID_EVENTS: 'audit.completed' | 'audit.score.dropped' | 'audit.score.changed'
                         | 'drift.detected' | 'recommendation.created'
  Phase 2 adds — extend validation in POST /api/webhooks-config route (Zod enum):
  ```typescript
  const VALID_EVENTS = [
    // Phase 1 (Sprint 8):
    'audit.completed', 'audit.score.dropped', 'audit.score.changed',
    'drift.detected', 'recommendation.created',
    // Phase 2 additions:
    'report.generated',            // Layer 6: narrative report created
    'hallucination.detected',      // Layer 3: new hallucination incident
    'hallucination.acknowledged',  // Layer 3: team acknowledges incident
    'visibility.trend.updated',    // Layer 2: weekly trend row inserted
    'agent.readiness.scored',      // Layer 1: agent readiness score refreshed
  ] as const;
  ```
  fanout-webhooks.ts (Sprint 8) must handle these new events alongside Phase 1 events.
  WIRING (WH-01 fix v8.28): declaring an event in VALID_EVENTS only lets a customer SUBSCRIBE to it;
  the event is delivered only if fanout-webhooks.ts is (a) TRIGGERED by a matching internal Inngest
  event and (b) has that event in its internal→external map. Sprint 8's fanout only triggers on
  'audit/complete', 'drift/detected', 'recommendation/created'. Phase 2 MUST extend BOTH the trigger
  list and the deliveryEventName map, and each source function MUST emit the internal slash-event,
  or these 5 events are configurable-but-undeliverable (silent non-delivery). Required additions:
  ```typescript
  // fanout-webhooks.ts — add to the trigger array AND the map:
  //   triggers += [{ event: 'report/generated' }, { event: 'hallucination/detected' },
  //                { event: 'hallucination/acknowledged' }, { event: 'visibility/trend-updated' },
  //                { event: 'agent/readiness-scored' }]
  //   deliveryEventName map += {
  //     'report/generated':          'report.generated',          // emitted by generate-narrative-report.ts
  //     'hallucination/detected':    'hallucination.detected',    // emitted by detect-hallucinations.ts (per incident inserted)
  //     'hallucination/acknowledged':'hallucination.acknowledged',// emitted by PATCH /api/brands/[id]/hallucinations/[id] (when is_acknowledged set true)
  //     'visibility/trend-updated':  'visibility.trend.updated',  // emitted by aggregate-visibility-trend.ts (cron, per brand row)
  //     'agent/readiness-scored':    'agent.readiness.scored',    // emitted by score-agent-readiness.ts
  //   }
  // Each emit must carry { organizationId } in event.data (fanout reads it to scope endpoints + RLS),
  // matching the Sprint 8 payload contract. Internal events keep the slash delimiter; external keep dots.
  ```
- `webhook_deliveries`        — Delivery audit log; `endpointId`, `attemptNumber`, `responseStatus`

**Scheduling / notifications (Sprint 9)**
- `audit_schedules`           — Per-brand cron config; `frequency`, `status` ('active'|'paused'|'quota_exceeded'), `nextRunAt`
- `notification_preferences`  — One row per org (unique); `weeklyDigest`, `digestEmail`, `emailOnDrift`,
  `emailOnAuditComplete`, `emailOnScheduleFailure`
  -- Sprint 9 canonical (GD2 fix): 5 boolean/text columns. Previously listed only 3 here — fix v8.18.
  -- emailOnAuditComplete: boolean DEFAULT false (most users don't want every audit emailed)
  -- emailOnScheduleFailure: boolean DEFAULT true (important — failed scheduled audits need attention)

**Billing (Sprint 10)**
- `subscriptions`             — Stripe mirror; `stripeSubscriptionId`, `tier`, `billingInterval`, `cancelAtPeriodEnd`. **CRITICAL: `subscriptions.tier` is the sole source of truth for tier. Phase 2 budget queries must JOIN `subscriptions.tier` — never `organizations.tier` (can diverge between webhook firings)**
- `processed_webhook_events`  — Stripe idempotency; `stripeEventId` unique

**Better Auth system tables (Sprint 1 migration — all managed by Better Auth library)**
- `auth_users`                — do not write directly
- `auth_sessions`             — do not write directly
- `auth_accounts`             — OAuth providers
- `auth_members`              — Better Auth org membership; distinct from Phase 2 `org_members` which adds brand-scoped access + invite lifecycle ON TOP
- `auth_organizations`        — mirrors `organizations`
- `auth_invitations`          — Better Auth invite tokens
- `auth_verifications`        — email verification

### Phase 1 services — must be preserved
**Inngest functions (confirmed from transcripts)**
- `inngest/functions/run-audit.ts`          — LLM orchestration, 4 engines × prompts × runs
  --
  -- WEB SEARCH TOOL CONFIGURATION (Peec AI review finding):
  -- Peec AI's key methodological advantage: UI scraping simulates real browser sessions,
  -- capturing responses that include web search results — exactly what users see.
  -- VisibleAU uses Vercel AI SDK (API calls). To match real-user experience, each engine
  -- implementation MUST enable web search where the API supports it:
  --
  --   ChatGPT (gpt-4o via @ai-sdk/openai):
  --     Enable the web_search_preview tool in generateText() call:
  --     tools: { web_search_preview: openai.tools.webSearchPreview() }
  --     This makes GPT-4o search the web before answering — matching ChatGPT UI behaviour.
  --     Without this: API uses training data only → misses recent AU business mentions.
  --
  --   Perplexity (sonar-pro via @ai-sdk/perplexity):
  --     Web search is ALWAYS active on sonar/sonar-pro models by default.
  --     No additional configuration needed — already matches real user experience.
  --
  --   Claude (claude-sonnet via @ai-sdk/anthropic):
  --     Web search available via brave_search or web_search tool in API.
  --     Enable for Growth+ tiers where accuracy matters most.
  --     Tool: { webSearch: anthropic.tools.webSearch_20250305({ maxUses: 3 }) }
  --
  --   Gemini (gemini-pro via @ai-sdk/google):
  --     Enable Google Search grounding: useSearchGrounding: true in model config.
  --     This grounds responses in real-time Google Search results.
  --
  -- WHY THIS MATTERS:
  --   Without web search enabled, API calls return knowledge-cutoff responses.
  --   A query like "best plumber Bondi" without web search returns generic training data.
  --   With web search: returns results grounded in current AU web content — matching
  --   what a real user in Bondi asking ChatGPT today would actually see.
  --   This is VisibleAU's ANSWER to Peec's UI scraping methodology advantage.
  --   API + web search tools = reproducible AND current = better than UI scraping.
  --
  -- TIER ROUTING (model-selector.ts):
  --   Starter: gpt-4o-mini (cheapest) + web_search_preview enabled
  --   Growth:  gpt-4o + web_search_preview enabled
  --   All tiers: sonar-pro for Perplexity (web search always on)
  --   Growth+: Claude with web_search tool, Gemini with Search grounding
- `inngest/functions/refresh-audit.ts`      — post-audit scoring pass
- `inngest/functions/send-alerts.ts`        — email + in-app alert dispatch
- `inngest/functions/canary-check.ts`       — Sprint 7 daily LLM drift probe (reads `canary_prompts`)
- `inngest/functions/technical-audit-run.ts` — Sprint 7 long-running crawler (3–5 min/brand; reads `technical_audits`)
- `inngest/functions/fanout-webhooks.ts`    — Sprint 8 outbound webhook fan-out to `webhook_deliveries`
- `inngest/functions/schedule-audits.ts`    — Sprint 9 cron; reads `audit_schedules` + enforces per-tier quotas

**PHASE 2 TIER EXPERIENCE DESIGN**
```
DESIGN PRINCIPLE: Revenue and profit are the goal.
Every tier must feel complete and valuable at its price point.
Every tier must make the next tier feel like a natural, obvious upgrade.
No tier should feel like a crippled version of the one above it.
No tier should feel like it has more than it needs.
```

=============================================================================
TIER 0: SAMPLE AUDIT (pre-signup, no account, landing page only)
=============================================================================
Price:     A$0 — anonymous visitor, no login required
Persona:   "I want to see if this is real before I sign up"
Goal:      Convert visitor to Free or Starter signup within 90 seconds
Cost:      ~A$0.10 per run (1 engine × 5 prompts × 1 run)
Engine:    ChatGPT ONLY (Sprint 10 canonical per HC1 fix: "1 engine (ChatGPT only)")
           Rationale: ChatGPT is the brand-recognition benchmark — AU SMBs understand it.
           Free tier adds Perplexity; paid adds Claude + Gemini. Sample uses ChatGPT alone.

What they get:
  - Single composite visibility score (0-100) for their domain
  - 3 sample prompt results showing exactly what AI says about them
  - 1 top Action (plain English, no jargon) they can act on today
  - Upgrade prompt: "Full audit = 4 engines × 10 prompts × 5 runs → signup free"
  - NO history, NO Action Center, NO account

What they see but cannot access (locked):
  - Blurred competitor comparison — "See how competitors rank — sign up free"
  - Blurred 12-month trend — "Track how this changes over time — sign up free"
  - Blurred Action Center — "See all 11 action types for your brand — sign up free"

5-DIMENSION BREAKDOWN (HubSpot AEO Grader review finding — SHOW, do NOT blur):
  HubSpot's AEO Grader is the market benchmark for free lead-magnet tools.
  Its #1 UX strength: shows 5 LABELLED dimensions with written interpretation,
  not just a composite number. Users understand WHY they scored X.
  VisibleAU should do the same — AND be faster (90s vs HubSpot's 3-5 min).
  ALL 5 dimension scores are already computed in the single 90-second ChatGPT run.
  Showing them costs nothing extra. Blurring them wastes the conversion opportunity.
  --
  SHOW THESE (no blur, no login required):
  --
  1. AI SENTIMENT — "How AI feels about your brand"
     Source: audits.scoreSentimentNumeric (0-100)
     Display: Positive (70-100) / Mixed (40-69) / Needs Work (0-39) + bar
     Written: 1-line interpretation e.g. "AI platforms describe [brand] positively.
              This supports buyer trust when they research you via ChatGPT."
  --
  2. AI PRESENCE — "How often AI mentions your brand"
     Source: audits.scoreFrequency (0-100)
     Display: Frequently / Occasionally / Rarely + bar
     Written: "Your brand appeared in [N]% of our test prompts. AU brands in your
              vertical typically appear in [benchmark]%."
  --
  3. CITATION ACCURACY — "Does AI describe you correctly?"
     Source: audits.scoreAccuracy (0-100)
     Display: Accurate / Minor Issues / Needs Review + bar
     Written: "AI described your [product/service] [accurately/with some gaps].
              Inaccurate descriptions can redirect buyers to competitors."
  --
  4. COMPETITIVE POSITION — "Where AI ranks you vs competitors"
     Source: audits.scorePosition (0-100)
     Display: Top Mention / Mid-Field / Trailing + bar
     Written: "When AI lists brands in [vertical], you typically appear [position].
              Being mentioned first correlates with 2-3× more AI-driven enquiries."
  --
  5. MARKET STANDING — "Are you a Leader, Challenger, or Niche Player?"
     Source: market_competition_label (derived from scoreFrequency vs vertical benchmark)
     Display: Category Leader / Challenger / Niche Player
     Written: "Based on this sample, AI treats [brand] as a [label] in [vertical]
              in [location]. Full audit reveals your complete competitive map."
  --
  Below all 5 dimensions: PRIMARY UPGRADE CTA
  "This is 1 engine × 5 prompts. Full audit = 4 engines × 336 AU prompts.
   Sign up free to run one. Takes 5 minutes." → [Sign up free]
  --
  WHY THIS BEATS HUBSPOT:
  - 90 seconds vs 3-5 minutes
  - AU-specific prompts vs generic industry queries
  - 5 real dimensions vs 5 generic dimensions
  - Immediate upgrade path to continuous tracking (not just a one-off)

Profit note: A$0.10/run cost. Gate strictly. Redis rate-limit: 1 run/IP/24h.
CX note: Result must appear in <90 seconds. If it takes longer, conversion collapses.

=============================================================================
TIER 1: FREE (post-signup, ongoing, no credit card)
=============================================================================
Price:     A$0/mo
Persona:   "Solo AU SMB or developer — I want to explore before committing"
Goal:      Show enough real value that upgrading to Starter feels obvious
Cost:      ~A$3-5/mo per active free user (1 audit × 2 engines × 10 prompts × 5 runs)

Phase 1 features (already built):
  - 1 brand, 2 engines (ChatGPT + Perplexity), 20-prompt library
  - 1 audit/month, full 5-dimension scoring
  - Action Center (rate-limited: top 3 actions only, no research citations)
  - 6-month history retention

Phase 2 features available on Free:
  - crawler_visit_logs         READ ONLY — see which AI bots visited your site
  - llmstxt_versions           READ ONLY — see if you have llms.txt and its score
  - visibility_trends TEASER   ONE number only: "Your mention rate this month: 12%"
                                Full trend chart locked: "See 12-month trend → Starter"
  - remediation_tasks          Top 3 tasks only (same limit as Action Center)

What they see locked (with teaser label):
  - agent_readiness_scores     "Your AI readiness score: 34/100 — see what to fix → Starter"
  - share_of_voice_snapshots   "Competitors are cited 3× more than you — see why → Growth"
  - hallucination_incidents    "1 inaccuracy detected — see what AI got wrong → Growth"
  - content_drafts             "Get AI-written fix drafts for your top actions → Growth"
  - generated_reports          "Share a branded report with your team → Growth"

Profit note: Heavy free users cost A$5-6/mo. Feature flag 'free_tier_enabled'
allows global disable or per-org extension (partner agencies get more).
Upgrade trigger: user hits 1-audit-per-month limit or tries a locked feature.

=============================================================================
TIER 2: STARTER — A$99/mo (~A$65 net)
=============================================================================
Price:     A$99/mo | A$83/mo annual
Persona:   "Solo SaaS founder, single AU SMB — I'm serious, I want weekly tracking"
Goal:      Deliver weekly clarity on AI visibility. Show enough that Growth feels worth A$200 more.
Cost target: A$10-15/mo LLM costs → ~85% gross margin

Phase 1 features (already built):
  - 1 brand, 4 engines (ChatGPT + Claude + Gemini + Perplexity), 50-prompt library
  - 4 audits/month (weekly), full 5-dimension scoring with Wilson CIs
  - Full Action Center (all actions, research citations, effort labels)
  - 12-month history retention
  - Drift alerts, webhook delivery

Phase 2 features available on Starter:
  - crawler_visit_logs         FULL — see all AI bot visits, frequency, blocked/allowed
  - llmstxt_versions           FULL — generate and version llms.txt, see depth score /18
  - agent_readiness_scores     FULL — 5-dimension /100 score, monthly refresh
                                       shows exactly what to fix to be AI-ready
  - visibility_trends SUMMARY  — mention_rate + citation_rate + brand_archetype label
                                  ("You are: Known But Untrusted — here's what that means")
                                  NO trend chart (Growth), NO period comparison (Growth)
  - remediation_tasks          FULL — all tasks, priority ranked, effort labels, confidence labels
  - citation-failure-diagnosis SUMMARY — top 1 reason why AI isn't citing you
                                  Full diagnosis (all reasons + evidence) locked → Growth

What they see locked (with teaser label):
  - visibility_trends CHART    "Your citation rate trend — 12 months → Growth A$299"
  - share_of_voice_snapshots   "You vs competitors: you win 2 of 10 prompts — see breakdown → Growth"
  - topical_coverage_gaps      "3 topics competitors own that you don't — see them → Growth"
  - hallucination_incidents    "Track when AI gets your facts wrong → Growth"
  - generated_reports          "Get a client-ready PDF report → Growth"
  - content_drafts             "Get AI-written fix drafts → Growth"

Profit note: A$10-15/mo cost against A$99 revenue = ~85% margin.
Starter is the volume tier — most customers land here.
CX note: Starter customer's weekly email should be the highlight of their Monday.
"Here's what changed in AI visibility for [brand] this week."

=============================================================================
TIER 3: GROWTH — A$299/mo (~A$195 net)
=============================================================================
Price:     A$299/mo | A$251/mo annual
Persona:   "Mid-market AU SaaS or growing SMB — I want deep intelligence and competitive insight"
Goal:      Make the customer feel like they have an unfair advantage over competitors.
Cost target: A$30-50/mo LLM costs → ~83-90% gross margin (including Phase 2 additions)

Everything in Starter, PLUS:

Phase 2 features fully unlocked:
  - visibility_trends          FULL — 12-month trend chart, period comparison, archetype history
  - share_of_voice_snapshots   FULL — competitor SoV by engine, by prompt category
  - query_fan_out_results      FULL — see the 3-12 sub-queries AI runs per prompt
  - topical_coverage_gaps      FULL — topic clusters you're missing, priority ranked
  - brand_web_mentions         FULL — Reddit/YouTube/Quora mentions, sentiment, frequency
  - citation_source_intelligence FULL — which source types AI cites for your vertical
  - hallucination_incidents    FULL — every AI inaccuracy detected, claim type, severity
  - brand_consensus_checks     FULL — cross-platform consistency score
  - linkedin_presence_audits   FULL — LinkedIn presence score /100, gap breakdown
  - youtube_presence_audits    FULL — YouTube presence score /100, gap breakdown
  - content_structure_audits   FULL — weekly per-URL content format + freshness analysis
  - conversation_journeys      LOCKED — "See how customers discover your brand through
                                multi-turn AI conversations → Agency A$499"
  -- (Regated from Growth to Agency+ per v8.19 ChatGPT review: complex feature SMBs won't use)
  - comparison_prompt_results  FULL — head-to-head: you vs up to 3 competitors per prompt
  - citation-failure-diagnosis FULL — all failure patterns, evidence, remediation links
  - content_drafts             FULL — AI-written drafts for top 5 tasks (Growth model: mid-tier)
  - generated_reports          FULL — AI narrative report, downloadable PDF
  - audit_trail                FULL — all actions logged
  - data_residency_log         FULL

What they see locked (with teaser label):
  - evidence_snapshots         "Legal-grade evidence archive → Agency A$499"
  - report_templates           "White-label branded reports for clients → Agency A$499"
  - report_delivery_schedules  "Auto-send reports to clients weekly → Agency A$499"
  - org_members (RBAC)         "Add team members with role-based access → Agency A$499"

Profit note: A$32-51/mo cost against A$299 = ~83-89% margin. Safe.
Growth is the profit engine tier — high margin, high feature satisfaction.
CX note: Growth customer should feel they have a competitive intelligence team.
Every week they learn something their competitors don't know.

=============================================================================
TIER 4: AGENCY — A$499/mo (~A$325 net)
=============================================================================
Price:     A$499/mo | A$419/mo annual
Persona:   "AU agency starting GEO offering — I need to track and report for 5 clients"
Goal:      Make running a GEO service feel effortless. Client reporting should take <10 minutes.
Cost target: A$40-65/mo LLM costs → ~87-92% gross margin

Everything in Growth for up to 5 brands, PLUS:

Phase 2 features unlocked:
  - evidence_snapshots         FULL — legal-grade immutable evidence archive per brand
  - report_templates           FULL — white-label branded report templates (agency logo)
  - report_delivery_schedules  FULL — auto-send reports to clients weekly or monthly
                                       PDF via email, agency branding throughout
  - org_members (RBAC)         FULL — add team members (viewer/editor/manager roles)
                                       each member sees only their permitted brands
  - Multi-brand dashboard      FULL — all 5 brands in one view, sorted by health score

What they see locked (with teaser label):
  - 25-brand capacity          "Manage up to 25 clients → Agency Pro A$1,499"
  - 2× daily audit frequency   "Daily audits become twice-daily → Agency Pro A$1,499"
  - org_feature_flags          Operator-managed only

Profit note: A$40-65/mo cost against A$499 = ~87-92% margin.
Agency is the retention anchor — agencies that white-label VisibleAU churn almost never.
CX note: The client PDF report is the highest-value moment in the Agency tier.
It needs to look like an expensive consultancy report, not a SaaS export.
Template quality is a competitive moat.

=============================================================================
TIER 5: AGENCY PRO — A$1,499/mo (~A$975 net)
=============================================================================
Price:     A$1,499/mo | A$1,259/mo annual
Persona:   "Established AU agency with 25+ clients — GEO is a core service line"
Goal:      Make VisibleAU the infrastructure for the agency's AI visibility practice.
Cost target: A$80-120/mo LLM costs → ~92% gross margin

Everything in Agency for up to 25 brands, PLUS:
  - 2× daily audits per brand (60 audits/brand/month)
  - Top-tier LLM models on all tasks (GPT-4o, Claude Sonnet, Gemini Pro, Sonar Pro)
  - Priority Inngest queue — Agency Pro audits run before lower tiers
  - Dedicated customer success contact (manual — not a product feature)
  - API access (v1.1 roadmap — Phase 2 ships the data; API endpoint ships v1.1)

What they see locked:
  - Enterprise pricing nudge (triggered when org hits 20+ brands OR requests SSO):
    "You're managing [N] brands. Enterprise gives you unlimited brands, SSO for your
     whole team, and a dedicated AU support contact. Let's talk → [Book 30-min call]"
  - Second trigger (hallucination detected, critical severity):
    "A critical AI hallucination was detected about [brand]. Enterprise customers get
     a 4-hour SLA response and legal-grade evidence archiving. → [Talk to us]"
  - Third trigger (Agency Pro CSM offboarding call):
    Sri proactively identifies Agency Pro customers with 20+ brands and books a
    migration conversation. No inbound required.

Profit note: A$80-120/mo cost against A$1,499 = ~92% gross margin.
Highest absolute margin per customer. Target: 20+ Agency Pro customers = A$30K MRR.
CX note: Agency Pro customers care about reliability and scale, not features.
SLA on audit completion time matters more to them than any new capability.

=============================================================================
TIER 6: ENTERPRISE — Custom (A$3,000–A$15,000+/mo, sales-led)
=============================================================================
Price:     Custom annual contract. No Stripe product in v1. Invoice billing only.
           Pricing rationale: Agency Pro A$1,499 × 25 brands = $37/brand/mo.
           Enterprise at A$3,000+ for unlimited brands = far cheaper per brand.
           Large AU agencies (50+ brands) and ASX-listed brands justify A$5,000+
           because individual department budgets can absorb it easily.
           Do NOT anchor at A$3,000 — floor should be A$4,000 for true Enterprise.

Persona:   THREE distinct enterprise buyers — each needs different framing:
  A) LARGE AU BRAND (ASX-listed, 500+ employees — Telstra, Medibank, CBA, Woolworths)
     Pain: AI answering questions about their products incorrectly at scale.
           A hallucination about Medibank's health cover = regulatory risk.
     Need: Data sovereignty, SOC 2, legal-grade evidence archive, SSO, audit log.
     Entry: "AI is spreading wrong information about your brand to millions of Australians.
             VisibleAU finds it in 90 seconds. Here's what it said about [brand] today."
  B) LARGE AU AGENCY (Dentsu, WPP, GroupM, IPG Mediabrands AU)
     Pain: Managing 50-200 brands — Agency Pro caps at 25.
     Need: Unlimited brands, custom SLA, dedicated CSM, portfolio analytics.
     Entry: "You're capped at 25 brands. Your top 5 clients alone have 40 sub-brands."
  C) REGULATED INDUSTRY (AU government, hospitals, financial advisors)
     Pain: AI citing wrong regulatory information; compliance and audit requirements.
     Need: IRAP alignment, guaranteed AU data residency, immutable audit log, DPA.
     Entry: Procurement-led. Respond to RFT/RFQ. SOC 2 Type 1 is gate to table.

Goal:      Make VisibleAU the compliance-grade AI visibility infrastructure for AU enterprise.
           Revenue: 5 Enterprise contracts at A$5,000/mo = A$25,000 MRR (matches 17× Agency Pro).
           These customers almost never churn — procurement lock-in + embedded workflows.

=== PROCUREMENT LAYER (what AU enterprise requires before signing) ===

  SOC 2 Type 1 by Month 12 post-launch (Sprint 12 kickoff plan).
  SOC 2 Type 2 by Month 18 (required for financial services, health).
  Australian Privacy Principles (APPs) compliance documentation — available v1.
  Data residency guarantee: ALL data stored in Supabase Sydney (ap-southeast-2).
    Contractually guaranteed. Enterprise contract includes a Data Processing Agreement (DPA).
    Supabase Sydney is the default for all plans; Enterprise contract formalises the guarantee.
  MSA (Master Service Agreement): custom terms, liability caps, IP ownership clauses.
    Sri signs MSAs manually in v1. Template in /legal/enterprise-msa-template.md.
  Annual invoice billing: PDF invoice + 30-day payment terms. No Stripe required.
    QuickBooks or similar for invoice generation in v1.
  SLA commitment:
    99.5% uptime (Vercel + Supabase combined — current architecture delivers this).
    P1 (audit system down): 4-hour response, same-day resolution target.
    P2 (data incorrect): 24-hour investigation, 48-hour resolution.
    P3 (feature request): best effort, roadmap consideration.
    Measured monthly. SLA breach = 10% credit on next invoice.

=== OPERATIONAL LAYER (what makes Enterprise worth 3× Agency Pro) ===

  UNLIMITED BRANDS: No cap. 50, 100, 200 brands — same infrastructure.
    Cost impact: Agency Pro runs ~A$80-120/mo for 25 brands.
    Enterprise 100 brands: ~A$320-480/mo LLM costs → still 85%+ gross margin.

  CUSTOM AUDIT FREQUENCY: Beyond Agency Pro 2×/day.
    Enterprise can configure: hourly (for crisis management), 4×/day, or custom schedule.
    e.g. CBA might want 4×/day during a product launch to catch hallucinations fast.

  CUSTOM VERTICAL PACKS: Beyond Tradies/Allied Health/SaaS.
    Enterprise customers in banking, telecoms, retail, government get custom prompt libraries.
    Effort: 2-3 days per new vertical. Delivered as part of onboarding.
    Stored as additional rows in vertical_packs + vertical_pack_prompts (no schema change).

  API ACCESS (REST + webhook):
    Full programmatic access to all audit results, citation data, remediation tasks.
    Endpoint: GET /api/v1/enterprise/brands/{id}/audits (API key auth, rate-limited).
    Webhook push on audit completion (same fanout-webhooks.ts as Phase 1 Sprint 8).
    Enables: feeding VisibleAU data into Power BI, Looker Studio, Tableau, internal dashboards.
    Ships: v1.1 (API layer built on top of Phase 2 data — no new tables needed).

  SSO (SAML 2.0 / OIDC):
    Corporate identity providers: Okta, Azure AD, Google Workspace, Ping Identity.
    Implementation: Clerk supports SAML enterprise connections on Enterprise plan.
    Clerk Enterprise Connection = A$0 to VisibleAU (included in Clerk Enterprise pricing).
    Config: per-org in Clerk dashboard. No code change to VisibleAU itself.
    Ships: v1.1 when first Enterprise customer requires it.

  CUSTOM DATA RETENTION:
    Standard (all other tiers): 12 months citations, 6 months free-tier history.
    Enterprise: up to 7 years (configurable). Required for financial services compliance.
    Implementation: org_feature_flags.data_retention_years (ops-set only).
    No schema change — data is kept, not deleted, on retention override.

  DEDICATED CUSTOMER SUCCESS MANAGER (AU timezone):
    One named CSM for each Enterprise account.
    Weekly 30-min check-in call during onboarding (first 90 days).
    Monthly strategy review after onboarding.
    Slack/Teams channel for async support.
    In v1: Sri is the CSM for Enterprise accounts. Delegate to hire at 3+ accounts.

=== VISIBILITY LAYER (enterprise-specific features) ===

  AUDIT TRAIL (already in Phase 2 Governance Intelligence — L7):
    audit_trail table logs every significant action (audit run, report generated,
    team member added, setting changed). Immutable. Enterprise customers get:
    - Full audit_trail export (CSV, 12+ months)
    - SIEM integration webhook (push to Splunk, Datadog, etc.)
    This is not just a feature — it's a compliance requirement for many AU regulated industries.

  EVIDENCE SNAPSHOTS (already in Phase 2 Trust Intelligence — L3, Agency+):
    Legal-grade immutable archive of AI responses with timestamp + engine + prompt.
    For Enterprise: extended retention + court-admissible export format.
    e.g. Medibank can prove to AHPRA what AI said about their cover on a specific date.

  PORTFOLIO ANALYTICS:
    Cross-brand aggregate view: which brands are gaining/losing AI visibility overall?
    Rolls up share_of_voice_snapshots and visibility_trends across all brands in the org.
    Route: GET /api/v1/enterprise/portfolio/summary
    Already partially designed in agency dashboard Sprint 9 — extend for Enterprise.

  CUSTOM VERTICAL PACKS (see Operational Layer above):
    Prompts specific to the customer's industry: banking regulations, health cover queries,
    telco plan comparisons, government service eligibility. These are not generic.

  SWOT EXECUTIVE REPORT:
    Weekly SWOT email to C-suite (CEO, CMO, CCO).
    Auto-generated from Phase 2 data every Monday 7am AEST.
    Format: 1-page PDF + 5 bullet email. Uses report_delivery_schedules (Agency+).
    Enterprise-specific: covers ALL brands in portfolio in one report.

  ROLE-BASED ACCESS CONTROL (RBAC):
    Scrunch charges Enterprise pricing specifically for granular permission control.
    VisibleAU already has a full 4-role RBAC system in org_members (Phase 2 L6):
      owner   — full org control, billing, delete org, MSA signatory
      admin   — full brand/audit/report control, team management
      analyst — run audits, create tasks, view reports (no content approval, no billing)
      viewer  — read-only; can see reports + evidence snapshots, cannot trigger any action
    Enterprise-specific use cases covered by existing roles:
      Legal/compliance team → viewer (sees evidence snapshots, cannot change anything)
      Agency account manager → analyst (runs audits, exports reports for clients)
      CMO → viewer (receives weekly SWOT report by email, no login required)
      IT/security → admin (manages SSO config, team members)
    Enterprise contract document MUST specify: org_members.brand_access JSONB allows
    restricting individual users to a subset of brands within the org.
    e.g. Account manager for Westpac only sees Westpac brands, not CBA brands.
    This is already designed — ops-set per user row. No code change.

  HALLUCINATION ALERT + CRISIS MANAGEMENT WORKFLOW:
    Scrunch locks hallucination detection to Enterprise-only. VisibleAU includes it
    on ALL tiers (hallucination_incidents + canary_prompts, Phase 1 Sprint 8).
    This is a headline competitive advantage: position it explicitly in Enterprise sales.
    --
    Enterprise-grade crisis workflow (built on existing Phase 2 infrastructure):
    --
    STEP 1 — DETECTION (real-time):
      canary_prompts (Phase 1) runs daily, checking AI model answers for known falsehoods.
      hallucination_incidents table logs: claim_text, claim_type, engine, severity, detected_at.
      Severity: critical (wrong_price / wrong_founder / competitor_confusion)
               warning (wrong_product / wrong_location)
    --
    STEP 2 — ALERT (within minutes of detection):
      send-alerts.ts dispatches immediately on critical hallucination_incidents.
      Enterprise: alert goes to dedicated Slack channel AND named CSM simultaneously.
      CSM acknowledges within 4 hours (P1 SLA).
    --
    STEP 3 — EVIDENCE CAPTURE (automatic):
      evidence_snapshots table captures: full AI response, timestamp, engine, model_version.
      Immutable. Cannot be modified post-creation.
      Enterprise export: court-admissible format with SHA-256 hash of response content.
      Use case: Medibank presents AHPRA with timestamped proof of what AI said about
      health cover on a specific date. Legally defensible paper trail.
    --
    STEP 4 — REMEDIATION (Action Center):
      hallucination_incidents link to remediation_tasks (Phase 2).
      Suggested fix: update canonical brand page, add FAQ schema, submit correction to AI model.
      Cross_prompt_impact shows how many other prompts the fix resolves.
    --
    STEP 5 — RESOLUTION TRACKING:
      canary_prompts re-runs the same prompts after remediation.
      Once AI models stop generating the hallucination: incident closed.
      Timeline logged: detected_at → acknowledged_at → resolved_at.
      Enterprise weekly SWOT report includes "0 active hallucinations" as a health metric.
    --
    NO OTHER AU GEO TOOL OFFERS THIS END-TO-END WORKFLOW.
    Scrunch detects hallucinations (Enterprise-only). VisibleAU detects + evidences + 
    remediates + tracks resolution — at Growth tier and above.

  PRODUCT-LEVEL AI VISIBILITY (v1.2 roadmap):
    Scrunch Enterprise offers "Product Observability" — tracking how AI surfaces
    individual product information (price, specs, availability).
    Relevant for AU eCommerce Enterprise customers (Woolworths, Kogan, JB Hi-Fi).
    VisibleAU v1: product-level tracking via custom vertical pack prompts
    ("What is [product name] price?" prompts in custom library).
    VisibleAU v1.2: dedicated product_visibility_audits table with:
      SKU-level AI mention tracking, price hallucination detection per product,
      catalogue-scale prompt generation from product feed (Shopify/WooCommerce import).
    Enterprise contract: include product visibility in v1.2 commitment at no extra cost
    for customers who sign annual contract before v1.2 ships.

  MULTILINGUAL / MULTI-MARKET:
    Scrunch: multi-region, multilingual in single Enterprise contract.
    VisibleAU v1: AU_EN only. market_code on brand_web_mentions already supports
    'NZ_EN' | 'UK_EN' — infrastructure is ready.
    Phase 3 (post-launch): NZ and UK market packs.
    Enterprise contract: include NZ_EN + UK_EN at same price when Phase 3 ships.
    Note for NZ: same language, slightly different AU references (e.g. Seek vs Trade Me).

=== ENTERPRISE SALES PROCESS (how to close without a sales team) ===

  v1 approach (Sri as solo founder):
  1. Lead source: Agency Pro customers who say "we need more than 25 brands"
               + inbound from AU enterprise marketing LinkedIn content
               + direct outreach to AU agency holding company contacts (Dentsu AU etc.)
  2. Discovery call: 30 min. Two questions: (a) how many brands? (b) SOC 2 required?
  3. POC (proof of concept): 14-day trial at Agency Pro pricing, unlimited brands.
     If they see value, convert to Enterprise annual contract.
  4. Contract: MSA + DPA + SLA + invoice billing. Sign via DocuSign.
  5. Onboarding: custom vertical pack setup + SSO config + CSM introduction.
     Target: live within 5 business days of contract signing.
  6. Success metric: customer sees first hallucination catch or knowledge gap in week 1.

  NEVER: multi-month RFP/RFT process without a paid POC first.
  NEVER: custom feature development without minimum 12-month contract to justify it.

=== ENTERPRISE COST STRUCTURE (VisibleAU economics) ===

  100-brand Enterprise customer (A$5,000/mo):
  LLM costs: ~A$320-480/mo (100 brands × A$3.20-4.80/brand)
  Infra uplift: negligible (Vercel + Supabase scale horizontally)
  CSM time: ~4 hrs/mo (at A$150/hr opportunity cost = A$600)
  Gross margin: (5,000 - 480 - 600) / 5,000 = ~78% — lower than Agency Pro but excellent.
  Note: As customer count grows, CSM time amortises. First 3 Enterprise customers = manual.
        At 5+ customers: hire a dedicated AU enterprise CSM (A$90K salary, recovers at 5 accounts).

=============================================================================
UPGRADE FLOW: HOW EACH TIER CREATES DESIRE FOR THE NEXT
=============================================================================

Sample → Free:    "Your score is 34. Sign up free to see what's dragging it down."
Free → Starter:   "You've hit your 1 audit/month limit. Get weekly tracking for A$99."
                  "Your mention rate is 12% — see the 12-month trend for A$99."
Starter → Growth: "3 topics competitors own that you don't — unlock for A$200 more."
                  "See how you rank vs competitors on every prompt — Growth A$299."
Growth → Agency:  "Share these results with clients. White-label reports — Agency A$499."
                  "Add your team member. Role-based access — Agency A$499."
Agency → Pro:     "You're tracking 5 brands. Scale to 25 — Agency Pro A$1,499."
                  "Twice-daily audits catch changes competitors miss. Agency Pro A$1,499."

LOCKED FEATURE UI RULE (lib/upgrade/nudge.ts):
  Every locked feature card shows:
  1. A teaser label with ONE real number (computed without extra LLM cost)
  2. The feature name in plain English (not a product name)
  3. The exact tier and price to unlock
  4. A single CTA button: "Upgrade to [Tier] — A$[price]/mo"
  Never: feature lists, benefit bullets, sales copy.
  Just: what they're missing, what it would tell them, how much it costs.

=============================================================================
FEATURE GATE REFERENCE TABLE (Phase 2 tables by tier)
=============================================================================
Feature                          | Free | Start | Growth | Agency | AgPro
---------------------------------|------|-------|--------|--------|-------
-- LAYER 1: RETRIEVAL INTELLIGENCE
crawler_visit_logs                |  ✓   |  ✓    |   ✓    |   ✓    |   ✓   read-only, zero LLM cost
llmstxt_versions                  |  ✓   |  ✓    |   ✓    |   ✓    |   ✓   static check, negligible cost
content_structure_audits          |  ✗   |  ✗    |   ✓    |   ✓    |   ✓   weekly Playwright crawl
agent_readiness_scores            |  ✗   |  ✓    |   ✓    |   ✓    |   ✓   Starter: monthly /100 score

-- LAYER 2: VISIBILITY INTELLIGENCE
visibility_trends (TEASER)        |  ✓   |  ✓    |   ✓    |   ✓    |   ✓   Free=1 number; Starter=summary
visibility_trends (FULL)          |  ✗   |  ✗    |   ✓    |   ✓    |   ✓   12-month trend chart
share_of_voice_snapshots          |  ✗   |  ✗    |   ✓    |   ✓    |   ✓   Growth+
query_fan_out_results             |  ✗   |  ✗    |   ✓    |   ✓    |   ✓   Growth+
topical_coverage_gaps             |  ✗   |  ✗    |   ✓    |   ✓    |   ✓   Growth+
brand_web_mentions                |  ✗   |  ✗    |   ✓    |   ✓    |   ✓   Growth+
citation_source_intelligence      |  ✗   |  ✗    |   ✓    |   ✓    |   ✓   Growth+
google_ai_mode_results            |  ✗   |  ✗    |   ✓    |   ✓    |   ✓   stretch goal, Growth+

-- LAYER 3: TRUST INTELLIGENCE
hallucination_incidents           |  ✗   |  ✗    |   ✓    |   ✓    |   ✓   Growth+
evidence_snapshots                |  ✗   |  ✗    |   ✗    |   ✓    |   ✓   Agency+: legal archive
linkedin_presence_audits          |  ✗   |  ✗    |   ✓    |   ✓    |   ✓   Growth+
youtube_presence_audits           |  ✗   |  ✗    |   ✓    |   ✓    |   ✓   Growth+
brand_consensus_checks            |  ✗   |  ✗    |   ✓    |   ✓    |   ✓   Growth+

-- LAYER 4: CONVERSATIONAL DISCOVERY
conversation_journeys (UX)        |  ✗   |  ✗    |   ✗    |   ✓    |   ✓   Agency+: complex feature; SMBs won't use it (v8.19 regate per ChatGPT review)
comparison_prompt_results         |  ✗   |  ✗    |   ✓    |   ✓    |   ✓   Growth+

-- LAYER 5: WORKFLOW INTELLIGENCE
remediation_tasks (top 3 only)    |  ✓   |  ✓    |   ✓    |   ✓    |   ✓   Free+Starter: top 3
remediation_tasks (all)           |  ✗   |  ✗    |   ✓    |   ✓    |   ✓   Growth: all tasks
content_drafts                    |  ✗   |  ✗    |   ✓    |   ✓    |   ✓   Growth: mid-tier model
                                  |      |       |        |        |       Agency Pro: top-tier model

-- LAYER 6: COMMUNICATION INTELLIGENCE
generated_reports                 |  ✗   |  ✗    |   ✓    |   ✓    |   ✓   Growth: self-serve PDF
report_templates                  |  ✗   |  ✗    |   ✗    |   ✓    |   ✓   Agency: white-label branding
report_delivery_schedules         |  ✗   |  ✗    |   ✗    |   ✓    |   ✓   Agency: auto-send to clients

-- LAYER 7: GOVERNANCE INTELLIGENCE
audit_trail                       |  ✗   |  ✗    |   ✓    |   ✓    |   ✓   Growth+
org_members (RBAC)                |  ✗   |  ✗    |   ✗    |   ✓    |   ✓   Agency+: multi-member
data_residency_log                |  ✗   |  ✗    |   ✓    |   ✓    |   ✓   Growth+
org_feature_flags                 |  ✗   |  ✗    |   ✗    |   ✗    |   ✓   ops-managed only

-- CITATION FAILURE DIAGNOSIS (cross-layer feature, Phase 2 Sprint 3)
citation-failure-diagnosis TOP 1  |  ✗   |  ✓    |   ✓    |   ✓    |   ✓   Starter: top reason only
citation-failure-diagnosis FULL   |  ✗   |  ✗    |   ✓    |   ✓    |   ✓   Growth: all reasons + evidence

-- PERSONA LAYER (Phase 2 Sprint 9 — Adaptive Segment-Aware UX)
persona_tag filter (prompt results) |  ✗   |  ✗    |   ✓    |   ✓    |   ✓   Growth+: filter by buyer persona
  -- Starter/Free: locked with upgrade nudge "See how AI describes you to each buyer type → Growth"
  -- Growth+: dropdown filter on prompt results (CTO / Developer / Founder / All)
  -- No extra LLM cost: persona_tag is a filter on existing vertical_pack_prompts rows

-- BUYER STAGE UI LABEL (Scrunch review finding — Scrunch charges for "funnel stage filtering"):
-- vertical_pack_prompts.category already maps to buyer journey stages:
--   'service-discovery' → Awareness   ("what is X?", "types of X")
--   'comparison'        → Consideration ("X vs Y?", "best X for Y?")
--   'recommendation'    → Decision    ("best X near me?", "who is the best X?")
--   'pricing'           → Decision/Conversion ("how much does X cost?")
--   'problem-driven'    → Awareness   ("how do I fix Y?")
--   'reviews'           → Consideration ("is X good?", "X reviews")
--   'compliance'        → Decision    ("is X licensed?", "certified X?")
--   'emergency'         → Decision    ("emergency X near me")
--   'service-specific'  → Consideration/Decision (specific service queries)
--
-- UI (Sprint 9 — Growth+ prompt results filter):
--   Existing persona_tag dropdown gains a second "Buyer Stage" dropdown alongside it.
--   Values: "All stages" | "Awareness" | "Consideration" | "Decision"
--   Implementation: ?buyer_stage=consideration query param → filter WHERE category IN ('comparison','reviews')
--   No new API endpoint. No new column. Pure UI label mapping on existing category values.
--   Starter/Free: locked card "Filter by buyer stage to see where AI recommends you → Growth"
--
-- SCRUNCH ADVANTAGE CLOSED: Scrunch charges for this as a premium feature.
-- VisibleAU derives it from category (already in Phase 1) at zero extra cost.
```
NOTE: Phase 2 Inngest functions must check tier before firing.
Pattern: `const tier = await getTierForOrg(orgId);` then gate against this table.
Phase 1 `lib/quota/check.ts` reads `subscriptions.tier` (canonical) — extend for Phase 2 gates.

STARTER TIER UPGRADE PATH (profit + CX — prevent conversion cliff):
Starter (A$99) currently gets zero Phase 2 features except remediation_tasks.
A$200 jump to Growth unlocks all 7 intelligence layers simultaneously — no gradient.
This creates a conversion cliff: customers see nothing new until they pay A$200 more.

To create a gradual upgrade path that drives revenue without extra cost:
1. LOCKED-VISIBLE PATTERN: Starter users see Phase 2 feature cards in the UI,
   but greyed-out with a lock icon and a single-line upgrade prompt:
   "Unlock AI visibility trends, citation intelligence, and 6 more layers → Growth A$299/mo"
   Implementation: API returns { locked: true, tier_required: 'growth' } instead of data.
   UI renders a locked card with upgrade CTA — same layout, blurred content.
   This is zero additional LLM cost (locked = no computation) and directly drives upgrades.

2. STARTER TEASER FEATURE: Give Starter one Phase 2 metric — visibility_trends summary only
   (not full trend detail). Shows current mention_rate and citation_rate as two numbers.
   Cost: zero — these numbers are computed as part of Growth audits anyway; for Starter,
   compute a single summary row per month (1 extra aggregation query, no LLM call).
   Value: customer sees their score trending, wants the full trend chart → upgrades.
   This mirrors Profound's "partial data" teaser approach which converts at 3× the rate
   of fully-hidden features.

UPGRADE NUDGE PATTERN (lib/upgrade/nudge.ts):
  Every Phase 2 locked API response includes:
  { locked: true, tier_required: 'growth' | 'agency', upgrade_url: '/billing/upgrade',
    teaser_label: string }  // e.g. "Your citation rate this month: 12% — see full trend →"
  The teaser_label shows ONE real number to create genuine desire without full access.
  Rule: teaser is computed only if it can be derived without extra LLM cost.

**ROUTE PARAM CONVENTION (RP-01 fix v8.55):** Two separate Next.js route trees use
DIFFERENT dynamic-segment names — this is intentional and must be preserved:
  - PAGE routes under `app/(auth)/brands/[brandId]/...` use **`[brandId]`** (Phase 1
    Sprint 3/4 convention; all Phase 2 page + loading.tsx files match).
  - API routes under `app/api/brands/[id]/...` use **`[id]`** (Phase 1 API convention).
A single route subtree cannot mix `[id]` and `[brandId]` (Next.js build error). Earlier
drafts had several Phase 2 PAGE dirs as `[id]`; all normalized to `[brandId]`. Do not
"fix" the `/api/brands/[id]/` routes — those are correct as `[id]`.

**Phase 2 Inngest functions — MUST be added to serve() in `app/api/webhooks/inngest/route.ts`:**
(Lesson from Phase 1 Sprint 9 GA1 fix: without serve() registration, Inngest silently ignores all functions)
```typescript
// Layer 1 — Retrieval Intelligence
import { crawlerLogIngest }        from '@/inngest/functions/crawler-log-ingest';
import { contentStructureAudit }   from '@/inngest/functions/content-structure-audit';
import { llmstxtRefresh }          from '@/inngest/functions/llmstxt-refresh';
import { scoreAgentReadiness }     from '@/inngest/functions/score-agent-readiness';
import { auditEntityHome }         from '@/inngest/functions/audit-entity-home';
// Layer 2 — Visibility Intelligence
import { calculateShareOfVoice }   from '@/inngest/functions/calculate-share-of-voice';
import { aggregateVisibilityTrend } from '@/inngest/functions/aggregate-visibility-trend';
import { simulateQueryFanOut }     from '@/inngest/functions/simulate-query-fan-out';
import { calculateTopicalGaps }    from '@/inngest/functions/calculate-topical-gaps';
import { classifyCitationSources } from '@/inngest/functions/classify-citation-sources';
import { trackBrandWebMentions }   from '@/inngest/functions/track-brand-web-mentions';
// Layer 3 — Trust Intelligence
import { detectHallucinations }    from '@/inngest/functions/detect-hallucinations';
import { captureEvidenceSnapshot } from '@/inngest/functions/capture-evidence-snapshot';
import { refreshEntityScore }      from '@/inngest/functions/refresh-entity-score';
import { buildCitationSourceIntelligence } from '@/inngest/functions/build-citation-source-intelligence';
import { auditLinkedinPresence }   from '@/inngest/functions/audit-linkedin-presence';
import { checkCrossPlatformConsensus } from '@/inngest/functions/check-cross-platform-consensus';
import { auditYoutubePresence }    from '@/inngest/functions/audit-youtube-presence';
// Layer 4 — Conversational Discovery
import { runJourney }              from '@/inngest/functions/run-journey';
import { runComparisonPrompts }    from '@/inngest/functions/run-comparison-prompts';
// Layer 5 — Workflow Intelligence
import { generateContentDraft }    from '@/inngest/functions/generate-content-draft';
import { triggerValidationReaudit } from '@/inngest/functions/trigger-validation-reaudit';
import { scheduleWorkflowRuns }    from '@/inngest/functions/schedule-workflow-runs';
// Layer 6 — Communication Intelligence
import { generateNarrativeReport } from '@/inngest/functions/generate-narrative-report';
import { sendScheduledReports }    from '@/inngest/functions/send-scheduled-reports';
// Add ALL above to the serve() array (alongside existing Phase 1 functions)
```

**Lib modules (confirmed from transcripts)**
- `lib/audit/runner.ts`                 — LLM orchestration
- `lib/audit/scorer.ts`                 — 5-dimension scoring + Wilson CIs
- `lib/audit/citation-detector.ts`      — brand mention + competitor detection
- `lib/audit/recommendation-engine.ts`  — 11 universal action types
- `lib/verticals/expand-prompt.ts`      — {brand}/{location}/{competitors} expansion
- `lib/region/detect.ts`               — region detection from URL prefix or geo
- `lib/scheduling/tier-limits.ts`       — `TIER_AUDIT_LIMITS` (Sprint 9 canonical)
- `lib/drift/significance.ts`           — CI-overlap drift math; `ciOverlaps()`, `classifySeverity()`
- `lib/local-seo/gmb-check.ts`          — Google Places two-step check
- `lib/local-seo/directory-check.ts`    — Hipages, YP, ServiceSeeking, WOM checks

**Phase 2 LLM_MODE=mock COVERAGE (CLAUDE.md §8: never run real LLM calls in tests):**
Phase 2 adds LLM-calling functions not yet covered by Phase 1 test strategy:
- simulate-query-fan-out.ts: uses LLMService.complete() for embeddings → must run under LLM_MODE=mock
- run-journey.ts: multi-turn LLM calls → mock with 'happy_path' scenario (brand mentioned turn 1)
- run-comparison-prompts.ts: LLM calls per competitor → mock with 'no_mention' scenario (brand loses)
- generate-narrative-report.ts: LLM generation → mock (return static template string)
- generate-content-draft.ts: LLM generation → mock (return static draft string)
Phase 2 sprint prompts must add these 5 functions to the LLM_MODE=mock test fixtures.
No new mock scenarios — use existing canonical 4: happy_path|no_mention|partial_failure|rate_limited.
(CLAUDE.md: 'Adding scenarios requires Sri's approval.')

**Phase 2 DRIZZLE SCHEMA FILES + BARREL EXPORTS (BREAKING — same class as Sprint 9 GA1 fix):**
Phase 2 LLD provides SQL DDL (CREATE TABLE). Each Phase 2 sprint must ALSO produce:
1. A Drizzle ORM schema file per table group (e.g. `db/schema/phase2-visibility.ts`)
2. Barrel exports added to `db/schema/index.ts` for every new table

Failing to add barrel exports means TypeScript imports break at build time.
Each Phase 2 sprint prompt must include a barrel exports section like Sprint 9 GA1.
Example pattern (Sprint 2 — Workflow Intelligence, tables 29–31):
```typescript
// db/schema/phase2-workflow.ts
import { pgTable, uuid, text, timestamp, jsonb, boolean, integer, date } from 'drizzle-orm/pg-core';
// ... Drizzle ORM equivalents of SQL DDL for remediation_tasks, workflow_runs, content_drafts

// db/schema/index.ts — add these exports after all Phase 1 exports:
export * from './phase2-platform';          // Sprint 1: config_bundle_cache, market_ai_budget_policies...
export * from './phase2-workflow';           // Sprint 2: remediation_tasks, workflow_runs, content_drafts
export * from './phase2-visibility';         // Sprint 3: share_of_voice_snapshots, visibility_trends...
export * from './phase2-trust';              // Sprint 5: hallucination_incidents, evidence_snapshots...
export * from './phase2-discovery';          // Sprint 7: conversation_journeys, journey_run_results...
export * from './phase2-communication';      // Sprint 4: report_templates, generated_reports...
export * from './phase2-governance';         // Sprint 8: audit_trail, org_members, data_residency_log...
export * from './phase2-retrieval';          // Sprint 6: llmstxt_versions, agent_readiness_scores...
```
NOTE: Phase 1 tables (brand_entity_scores, audits, citations) stay in their existing Phase 1 files.
Phase 2 ALTER TABLE additions are added to the existing Phase 1 Drizzle schema files.

**Phase 2 NEW ENV VARS — add to `.env.example` and `.env.local` before Phase 2 Sprint 3:**
```bash
# YouTube Data API v3 — track-brand-web-mentions.ts YouTube mention search
# Get key: console.cloud.google.com → Enable YouTube Data API v3 → Credentials → API key
YOUTUBE_API_KEY=your_youtube_data_api_v3_key
```
No other new external service keys needed for Phase 2:
Reddit JSON search + Quora + LinkedIn public pages = cheerio scraping (no auth).
Wikidata API = public (no auth). ABN Lookup key already in Phase 1 `.env`.
Google Knowledge Panel uses existing Google APIs; no new key.

**PHASE 2 REQUIREMENT: Extend `lib/llm/model-selector.ts` ModelTask union type**
Phase 1 ModelTask = `'brand_mention' | 'sentiment' | 'context'` (3 task types, 72 test combinations).
Phase 2 adds 2 new LLM call types — both must be registered in `model-selector.ts`:
```typescript
// LLM CACHE BEHAVIOR for Phase 2 new task types:
//   'narrative_generation': SET bypassCache=false (let it cache). Monthly report prompts reuse the
//     same template structure → cache hits save cost. TTL: Sprint 2 default 48h is too short;
//     lib/communication/narrative-generator.ts should pass TTL_HOURS=720 (30 days) in the cache key.
//   'content_draft': SET bypassCache=true (always bypass). Each draft is unique to the specific
//     brand + gap + format combination — cached responses would produce stale/wrong content.
// Usage: LLMService.complete({ ..., metadata: { bypassCache: true } }) — same pattern as Sprint 2.

// lib/llm/model-selector.ts — extend ModelTask union (Phase 2 Phase 2 Sprint 4 deliverable):
export type ModelTask =
  | 'brand_mention'         // Phase 1: primary audit call — tier-aware (cheap for Free/Starter, top for Agency Pro)
  | 'sentiment'             // Phase 1: sentiment classification — always cheapest model
  | 'context'               // Phase 1: context label classification — always cheapest model
  | 'narrative_generation'  // Phase 2 NEW (Layer 6): AI narrative report text — cheapest model (structured output, not quality-sensitive)
  | 'content_draft';        // Phase 2 NEW (Layer 5): content draft writing — mid-tier (quality matters for client-facing copy)
  // TIER GATE CONSISTENCY NOTE: content_drafts table is Growth+ only (tier gate table).
  // model-selector.ts must NOT include a 'cheapest Free/Starter' routing branch for this task —
  // that branch is dead code since Free/Starter cannot access content_drafts.
  // Correct routing: Growth → mid-tier (GPT-4o-mini / Claude Haiku / Gemini Flash)
  //                  Agency / Agency Pro → top-tier (GPT-4o / Claude Sonnet / Gemini Pro)
  // The earlier I-02 fix comment saying 'cheapest Free/Starter' for content_draft was incorrect.
  // Only two routing cases exist: mid-tier (Growth) and top-tier (Agency+).

// Add to selectModel() switch:
// case 'narrative_generation': return cheapestModel(engine); // always cheap — structured template fill
// case 'content_draft':        return midTierModel(tier, engine); // growth+ gets mid; free/starter get cheap
```
CLAUDE.md §8 anti-pattern: **Never hardcode model strings outside model-selector.ts.**
Phase 2 generate-narrative-report.ts and generate-content-draft.ts must call
`selectModel(tier, engine, 'narrative_generation')` and `selectModel(tier, engine, 'content_draft')`.
Tests: 5 tiers × 4 engines × 2 new tasks = 40 new combinations in model-selector.test.ts.

### Region → market_code mapping (Phase 1 → Phase 2 bridge)
Phase 1 stores `region` as 'au'|'nz'|'uk'. Phase 2 tables use `market_code` 'AU_EN'|'NZ_EN'|'UK_EN'. All Phase 2 Inngest functions that insert into Phase 2 tables must map at runtime:

```typescript
// lib/platform/region-to-market-code.ts  (NEW in Phase 2 — zero Phase 1 changes)
const MAP: Record<string, string> = {
  au: 'AU_EN', nz: 'NZ_EN', uk: 'UK_EN',
  us: 'US_EN', ca: 'CA_EN', eu: 'EU_EN',
};
export const toMarketCode = (region: string) => MAP[region] ?? 'AU_EN';
// Usage in every Phase 2 Inngest function:
//   const marketCode = toMarketCode(brand.region);
```

### Phase 1 API routes — existing response shapes unchanged
- `GET/POST /api/audits`
- `GET /api/audits/[id]`
- `GET /api/brands`
- `POST /api/brands`
- `GET/PATCH /api/brands/[id]`
- `DELETE /api/brands/[id]`         — soft-delete (sets deletedAt); returns 204
- `GET /api/vertical-packs`
- `GET /api/recommendations`         — returns recommendations generated for a given audit
- `PATCH /api/recommendations/[id]`  — mark done / dismiss (status update)
- `GET /api/action-items`            — alias surface used by Action Center UI
- `PATCH /api/action-items/[id]/status` — update action item status
- `POST /api/webhooks/stripe`
- `POST /api/webhooks/clerk`         — org + user lifecycle events (mapped to Better Auth session on final build)
- `GET /api/health`                  — { status, timestamp, db }

---

## PLATFORM ARCHITECTURE

```
┌──────────────────────────────────────────────────────────────────────┐
│                       PRESENTATION LAYER                             │
│         Next.js 15 App Router · shadcn/ui · Recharts                │
│      Adaptive Segment UX (Agency / SMB / Local Tradie)              │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────────────┐
│                    7 INTELLIGENCE LAYERS                             │
│                                                                      │
│  L1  Retrieval Intelligence       L5  Workflow Intelligence          │
│      + Agent Readiness /100           + Content Drafts               │
│      + MCP Readiness Check            + Validation Loop              │
│      + Content Format Audit           + Format Recommendations       │
│  [NEW]+ Entity Home Audit                                            │
│                                                                      │
│  L2  Visibility Intelligence      L6  Communication Intelligence     │
│      + Query Fan-Out (3-12)           + Narrative Reports            │
│      + Topical Coverage Gap           + Delivery Schedules           │
│      + Citation Source Types                                         │
│      + Mention-Source Divide     L7  Governance Intelligence         │
│      + Google AI Mode (stretch)       + Audit Trail                  │
│  [NEW]+ Brand Web Mentions            + Team RBAC                    │
│  [NEW]+ Citation Volatility Score                                     │
│  L3  Trust Intelligence                                              │
│      + Hallucination Detection    L4  Conversational Discovery       │
│      + Evidence Archive               + Journey Mapping              │
│      + Citation Source Intel          + Comparison Prompts           │
│      + LinkedIn Presence                                             │
│      + Cross-Platform Consensus                                      │
│      + Knowledge Panel Check                                         │
│      + Wikidata Entry Check                                          │
│  [NEW]+ YouTube Presence                                             │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────────────┐
│              PLATFORM FOUNDATION (Phase 2 Sprint 1)                  │
│  ConfigBundleService · BudgetPolicyService · SamplingPolicyService   │
│  QualityGateService · ProviderCapabilityRegistry · Observability     │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
┌──────────────────────────▼───────────────────────────────────────────┐
│                    PHASE 1 FOUNDATION                                │
│  Postgres (Supabase) · Inngest · Vercel AI SDK · Better Auth         │
│  Stripe · Resend · Playwright · Sentry · PostHog                     │
│  29 tables: 7 core + 2 packs + 6 technical + 7 agency/portal +       │
│             2 scheduling + 2 billing + 7 auth_* (Better Auth)         │
│  region enum: 'au'|'nz'|'uk'  →  market_code bridge in Phase 2      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## PHASE 2 LOADING STATE REQUIREMENT (PA-02 fix v8.37)
## Applies to ALL Phase 2 sprints that add customer-facing pages.
##
## Per performance standards and the Phase 1 BK3 fix pattern (loading.tsx added for brands,
## audits, dashboard, portfolio routes in Sprint 10), EVERY Phase 2 intelligence layer page
## MUST have a corresponding loading.tsx skeleton screen in the same route folder.
##
## Required loading.tsx files by sprint:
##   Sprint 2: app/(auth)/brands/[brandId]/workflow/loading.tsx
##             app/(auth)/brands/[brandId]/workflow/drafts/[draftId]/loading.tsx
##   Sprint 3: app/(auth)/brands/[brandId]/visibility/loading.tsx
##             app/(auth)/brands/[brandId]/visibility/citation-failure/loading.tsx
##             app/(auth)/brands/[brandId]/visibility/competitive/loading.tsx
##   Sprint 4: app/(auth)/reports/loading.tsx
##             app/(auth)/reports/[id]/loading.tsx
##   Sprint 5: app/(auth)/brands/[brandId]/trust/loading.tsx
##   Sprint 6: app/(auth)/brands/[brandId]/retrieval/loading.tsx
##   Sprint 7: app/(auth)/brands/[brandId]/discovery/loading.tsx
##   Sprint 8: app/(auth)/team/loading.tsx
##             app/(auth)/data-residency/loading.tsx
##             app/(auth)/audit-trail/loading.tsx
##   Sprint 9: (no new top-level routes — enhances existing dashboard)
##
## SKELETON PATTERN (match Phase 1 BK3 skeleton style):
##   Each loading.tsx renders a skeleton matching the real page structure.
##   Use: <div className="animate-pulse rounded-xl" style={{ background: 'var(--bg-elevated)',
##        height: 'Npx', marginBottom: '16px' }} /> for each major section.
##   Do NOT use a generic spinner — match the page layout exactly.

## PHASE 2 SPRINT 1 — PLATFORM FOUNDATION
## (Must complete before all other sprints — no customer-facing features)

Source: ChatGPT LLD v7 (10 production conflicts + fixes).
Prevents cost blowouts, misleading confidence scores, and broken market config.

### New tables

```sql
-- is_active MANAGEMENT: when deploying a new bundle version, run in a transaction:
--   1. INSERT new row with is_active = true (new bundle version)
--   2. UPDATE config_bundle_cache SET is_active = false
--      WHERE market_code = $mc AND locale = $lo AND segment = $seg
--      AND id != $newId  (deactivate all previous versions)
-- ConfigBundleService.activate(newId) owns this transaction.
-- UNIQUE(market_code, locale, segment, bundle_version) prevents duplicate versions.
-- Multiple is_active=true rows per market+locale+segment are possible without this pattern.
CREATE TABLE config_bundle_cache (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_code       TEXT NOT NULL,           -- 'AU_EN' | 'NZ_EN' | 'UK_EN'
  locale            TEXT NOT NULL,           -- 'en-AU' | 'en-NZ' | 'en-GB'
  segment           TEXT NOT NULL,           -- 'smb' | 'agency' | 'enterprise'
  bundle_version    INTEGER NOT NULL,
  config_digest     TEXT NOT NULL,
  resolved_config   JSONB NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(market_code, locale, segment, bundle_version)
);
-- Only one active bundle per market+locale+segment
CREATE UNIQUE INDEX config_bundle_one_active
  ON config_bundle_cache(market_code, locale, segment) WHERE is_active = true;

CREATE TABLE market_ai_budget_policies (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_code               TEXT NOT NULL,
  segment                   TEXT NOT NULL,
  use_case                  TEXT NOT NULL,
  max_prompts_per_audit     INTEGER NOT NULL DEFAULT 50,
  max_models_per_audit      INTEGER NOT NULL DEFAULT 4,
  -- DEFAULT 4 = paid-tier canonical (PRD §7: ChatGPT, Claude, Gemini, Perplexity).
  -- Free tier = 2 engines (TIER_ENGINES allowlist in lib/llm/tier-engines.ts governs this,
  --   not this column). This column is a hard-stop CEILING — LLD v7 SQL addendum used DEFAULT 2
  --   which conflicts with PRD §7; Phase 2 LLD DEFAULT 4 is correct for paid tiers.
  max_repeated_samples      INTEGER NOT NULL DEFAULT 5,
  -- DEFAULT 5 = Sprint 3 canonical runsPerPrompt (Wilson CI math requires ≥5 runs).
  -- LLD v7 SQL addendum used DEFAULT 3 which would break Wilson CI; Phase 2 LLD DEFAULT 5 is correct.
  max_estimated_cost_cents  INTEGER NOT NULL DEFAULT 500,
  max_fan_out_sub_queries   INTEGER NOT NULL DEFAULT 12,  -- v3.0: updated 8→12
  hard_stop_on_budget       BOOLEAN NOT NULL DEFAULT true,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(market_code, segment, use_case)
);

-- DESIGN NOTE: sampling_policies governs Phase 2 VISIBILITY SCORING calls only.
-- Phase 1 audit runs (run-audit.ts) always use runsPerPrompt=5 — this is Phase 1 canonical
-- and is NOT overridden by sampling_policies (Sprint 3 Wilson CI math requires ≥5 runs).
-- minimum_repeated_samples (default 3) applies to Phase 2 aggregation functions
-- (e.g. visibility_trends, share_of_voice_snapshots) when computing averages from
-- existing Phase 1 audit data — NOT to how many times Phase 1 runs each prompt.
-- If minimum_repeated_samples < 3 audits exist for a period, show 'Insufficient data' label.
CREATE TABLE sampling_policies (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_code                   TEXT NOT NULL,
  segment                       TEXT NOT NULL,
  use_case                      TEXT NOT NULL,
  minimum_prompt_count          INTEGER NOT NULL DEFAULT 10,
  recommended_prompt_count      INTEGER NOT NULL DEFAULT 50,
  minimum_repeated_samples      INTEGER NOT NULL DEFAULT 3,
  -- 3 = minimum AUDITS in a period before trend aggregation is meaningful
  -- NOT the same as Phase 1 runsPerPrompt=5 (per-audit LLM call count, unchangeable)
  confidence_display_threshold  NUMERIC(5,2) NOT NULL DEFAULT 0.60,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(market_code, segment, use_case)
);

-- ── EXECUTIVE WEEKLY AI BRIEF FORMAT (v8.33, ChatGPT Phase 2.5 Rec 2) ──
-- The weekly digest (Phase 1 Sprint 9, send-weekly-digest.ts) and generated_reports (Phase 2
-- Sprint 4) must both support an "Executive AI Brief" format for agency white-labelling.
-- FORMAT (stored as a report_template with template_type='weekly_executive'):
--   SUBJECT: "This Week In AI Visibility — {brand.name}"
--   BODY SECTIONS:
--     1. HEADLINE METRICS (3 bullets max):
--        • "+3 new citations detected" (NEW_CITATION wins from wins feed)
--        • "ChatGPT began citing your business" (first citation from a new engine)
--        • "Competitor {name} lost visibility" (COMPETITOR_DOWN from wins feed)
--     2. TOP OPPORTUNITY (1 item, highest expectedImpactScore from action_items):
--        • Topic, expected benefit one-line, confidence label
--     3. ONE RECOMMENDED ACTION (the top action_item for this brand):
--        • Title, dimension, "estimated: {expectedImpactScore} impact"
--   TONE: plain English, outcome-oriented, no raw metrics unless contextualised.
--   DELIVERY: email (Resend) + dashboard widget + included in white-label PDF exports.
--   RETENTION GOAL: create anticipation and habit — customers open because they expect a win.
-- NO SCHEMA CHANGE: report_templates + generated_reports already handle this. Add
--   template_type='weekly_executive' to the seed file in Phase 2 Sprint 4.

-- SEED REQUIREMENT: metric_quality_gates MUST be seeded in Phase 2 Sprint 1
-- (db/seed/metric-quality-gates.ts) before QualityGateService.evaluate() can function.
-- Without seed rows, every audit's quality_status stays 'pending' indefinitely (O-02 fix).
-- AU_EN seed rows (5 scoring dimensions, 2 supporting metrics):
--   INSERT INTO metric_quality_gates (metric_key, market_code, minimum_samples, minimum_provider_count) VALUES
--     ('frequency',       'AU_EN', 10, 2),  -- ≥10 prompt-engine combinations for reliable frequency score
--     ('sentiment',       'AU_EN', 10, 2),  -- ≥10 citation rows for sentiment distribution
--     ('accuracy',        'AU_EN',  5, 2),  -- ≥5 audits for accuracy pattern (rarer data)
--     ('position',        'AU_EN', 10, 2),  -- ≥10 for position ranking stability
--     ('context',         'AU_EN', 10, 2),  -- ≥10 for context label distribution
--     ('composite',       'AU_EN',  3, 2),  -- ≥3 audits for composite trend (sampling_policies minimum)
--     ('citation_source', 'AU_EN',  5, 2);  -- ≥5 audits for source type classification
--   ON CONFLICT (metric_key, market_code) DO NOTHING;
CREATE TABLE metric_quality_gates (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key              TEXT NOT NULL,
  market_code             TEXT NOT NULL,
  minimum_samples         INTEGER NOT NULL,
  minimum_provider_count  INTEGER NOT NULL DEFAULT 2,
  insufficient_data_label TEXT NOT NULL DEFAULT 'Insufficient data',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(metric_key, market_code)
);

CREATE TABLE prompt_pack_coverage (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_code             TEXT NOT NULL,
  locale                  TEXT NOT NULL,
  segment                 TEXT NOT NULL,
  use_case                TEXT NOT NULL,
  required_template_keys  JSONB NOT NULL,
  available_template_keys JSONB NOT NULL,
  coverage_ratio          NUMERIC(5,2) NOT NULL,
  coverage_status         TEXT NOT NULL,   -- 'complete' | 'partial' | 'missing'
  last_validated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(market_code, locale, segment, use_case)
);

CREATE TABLE provider_market_capabilities (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key                TEXT NOT NULL,
  model_key                   TEXT NOT NULL,
  market_code                 TEXT NOT NULL,
  locale                      TEXT NOT NULL,
  supports_web_retrieval      BOOLEAN NOT NULL DEFAULT false,
  supports_citations          BOOLEAN NOT NULL DEFAULT false,
  supports_location_context   BOOLEAN NOT NULL DEFAULT false,
  supports_query_fan_out      BOOLEAN NOT NULL DEFAULT false,
  max_fan_out_sub_queries     INTEGER NOT NULL DEFAULT 12,  -- v3.0: updated 8→12
  max_context_tokens          INTEGER,
  average_latency_ms          INTEGER,
  estimated_cost_per_1k_cents NUMERIC(8,4),
  is_enabled                  BOOLEAN NOT NULL DEFAULT false,
  -- DEFAULT false means ALL providers start disabled.
  -- SEED REQUIREMENT: provider_market_capabilities MUST be seeded in Phase 2 Sprint 1
  -- (db/seed/provider-market-capabilities.ts) or ProviderCapabilityRegistry.getEnabledProviders()
  -- returns an empty array and ALL Phase 2 fan-out + journey functions fail silently.
  -- AU_EN seed rows (minimum viable — 4 providers, en-AU locale):
  --   ('openai',     'gpt-4o',          'AU_EN', 'en-AU', true, true, true, true, 12, ...)
  --   ('anthropic',  'claude-3-5-sonnet','AU_EN', 'en-AU', true, false, true, true, 10, ...)
  --   ('google',     'gemini-1.5-pro',  'AU_EN', 'en-AU', true, true, true, true, 12, ...)
  --   ('perplexity', 'pplx-70b-online', 'AU_EN', 'en-AU', true, true, true, false, 8, ...)
  -- is_enabled=true for all 4 AU_EN providers at Sprint 1 seed time.
  -- Operator disables individual providers by setting is_enabled=false via ops tooling.
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(provider_key, model_key, market_code, locale)
);

-- WRITER: BudgetPolicyService (lib/platform/budget-policy.service.ts)
-- Inserts ONE row per audit at completion, triggered by the 'audit/complete' event.
-- Populated in refresh-audit.ts (Phase 1 post-scoring pass) after totalCostUsd is finalised:
--   await db.insert(auditCostSnapshots).values({
--     auditId: audit.id,
--     organizationId: audit.organizationId,
--     marketCode: toMarketCode(org.region),
--     locale: 'en-AU',  -- derived from marketCode
--     estimatedCostCents: Math.round(policy.maxEstimatedCostCents),
--     actualCostCents: Math.round(audit.totalCostUsd * 100 / 0.65),  -- USD→AUD cents
--     promptCount: audit.promptsCount,
--     providerCallCount: audit.totalCalls,
--     budgetPolicyId: audit.config_bundle_id ? policy.id : null,
--   });
-- EXCLUSION: skip when org.slug = 'sample' (D-03 + O-03 fix)
CREATE TABLE audit_cost_snapshots (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id             UUID REFERENCES audits(id) ON DELETE CASCADE,
  -- CASCADE: cost snapshots are operational records tied to the audit; delete with audit
  organization_id      UUID NOT NULL REFERENCES organizations(id),
  market_code          TEXT NOT NULL,
  locale               TEXT NOT NULL,
  estimated_cost_cents INTEGER NOT NULL DEFAULT 0,
  actual_cost_cents    INTEGER NOT NULL DEFAULT 0,
  prompt_count         INTEGER NOT NULL DEFAULT 0,
  provider_call_count  INTEGER NOT NULL DEFAULT 0,
  budget_policy_id     UUID REFERENCES market_ai_budget_policies(id) ON DELETE SET NULL,
  -- SET NULL (FK-ON-DELETE fix v8.28): a cost snapshot is a historical fact. If a market budget
  -- policy is ever retired/deleted, keep the snapshot and null the policy link rather than blocking
  -- the delete. (market_ai_budget_policies is global seed config — deletion is rare but must not crash.)
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Column additions to Phase 1 audits table (nullable — safe migration)

```sql
ALTER TABLE audits
  ADD COLUMN IF NOT EXISTS config_bundle_id     UUID REFERENCES config_bundle_cache(id),
  ADD COLUMN IF NOT EXISTS config_digest        TEXT,
  ADD COLUMN IF NOT EXISTS estimated_cost_cents INTEGER,
  ADD COLUMN IF NOT EXISTS quality_status       TEXT DEFAULT 'pending';
  -- 'pending' | 'sufficient' | 'insufficient' | 'partial'
  -- WRITER: QualityGateService (lib/platform/quality-gate.service.ts) sets this
  -- after each audit completes, triggered by the 'audit/complete' Inngest event:
  --   'sufficient'    = all metric_quality_gates.minimum_samples thresholds met
  --   'insufficient'  = critical dimensions below minimum_samples (display warning)
  --   'partial'       = some dimensions met, some below threshold
  --   'pending'       = audit not yet scored (default at row creation)
  -- Pattern: refresh-audit.ts (Phase 1) calls QualityGateService.evaluate(auditId)
  --          after scoring. QualityGateService reads metric_quality_gates for the
  --          audit's market_code and sets audits.quality_status accordingly.
```

### New services

```typescript
// lib/platform/config-bundle.service.ts
export class ConfigBundleService {
  async resolve(market: string, locale: string, segment: string): Promise<ConfigBundle>
  async get(bundleId: string): Promise<ConfigBundle>
  async invalidate(market: string): Promise<void>
}

// lib/platform/budget-policy.service.ts
// CRITICAL: Tier source of truth is subscriptions.tier (not organizations.tier).
// BudgetPolicyService must JOIN: audits → organizations → subscriptions → tier.
// organizations.tier can diverge from subscriptions.tier between Stripe webhook firings.
// Always read subscriptions.tier for any quota/budget calculation.

// TYPE DEFINITIONS:
// interface AuditParams { brandId: string; organizationId: string; promptCount: number; engineCount: number; }
// interface CostEstimate { estimatedCostCents: number; maxAllowedCents: number; withinBudget: boolean; policyId: string; }
// interface BudgetPolicy { maxEstimatedCostCents: number; hardStopOnBudget: boolean; }
// interface EnforcementResult { allowed: boolean; reason?: 'budget_exceeded' | 'policy_disabled' | 'ok'; }
// interface QualityLabel { label: 'Confirmed'|'Likely'|'Hypothesis'|'Insufficient data'; }

// CALLER: run-audit.ts calls estimate() BEFORE firing LLM calls.
//   const estimate = await budgetService.estimate({ brandId, organizationId, promptCount: 10, engineCount: TIER_ENGINES[tier].length });
//   if (!estimate.withinBudget && policy.hardStopOnBudget) throw new Error('Budget exceeded');
// record() is called by refresh-audit.ts after audit completion with actual totalCostUsd.

// PHASE 2 COST TARGETS PER FUNCTION (protect ~85-92% gross margin across all tiers):
// These targets flow from PRD §8 4-layer cost control architecture.
// Phase 1 per-audit cost: <US$3 (A$4.50). Phase 2 adds the following per brand per month:
//
//   Function                         | Cost target  | Frequency  | Tier gate
//   ---------------------------------|--------------|------------|----------
//   simulate-query-fan-out.ts        | <US$0.40/mo  | per audit  | Growth+
//   run-journey.ts                   | <US$0.50/mo  | 2×/mo      | Agency+  (v8.19: journey UX regated Growth+→Agency+)
//   run-comparison-prompts.ts        | <US$0.60/mo  | 2×/mo      | Growth+
//   generate-narrative-report.ts     | <US$0.30/mo  | 1×/mo      | Growth+   cheapest model
//   generate-content-draft.ts        | <US$0.20/mo  | on-demand  | Growth+   mid-tier model
//   build-citation-source-intelligence.ts | <US$0.10/mo | per audit | Growth+
//   content-structure-audit.ts       | <US$0.08/mo  | 4×/mo      | Growth+   Playwright (no LLM)
//   audit-linkedin-presence.ts       | <US$0.02/mo  | 4×/mo      | Growth+   cheerio (no LLM)
//   audit-youtube-presence.ts        | <US$0.04/mo  | 4×/mo      | Growth+   YouTube API free tier
//   track-brand-web-mentions.ts      | <US$0.05/mo  | 4×/mo      | Growth+   Reddit JSON API (no LLM)
//   score-agent-readiness.ts         | <US$0.02/mo  | 1×/mo      | Growth+   rule-based (no LLM)
//
// Phase 2 total addition per brand: <US$2.31/mo (A$~3.50) on Growth+
// Agency Pro 25 brands: <US$57.75/mo additional → margin stays >85%
// Starter: Phase 2 LLM functions are tier-gated OFF → zero additional cost
// BudgetPolicyService.estimate() must include Phase 2 function costs in its estimate
// when those functions are scheduled for the current audit cycle.

export class BudgetPolicyService {
  async estimate(params: AuditParams): Promise<CostEstimate>
  async enforce(estimate: CostEstimate, policy: BudgetPolicy): Promise<EnforcementResult>
  async record(auditId: string, actual: number): Promise<void>
}

// lib/platform/sampling-policy.service.ts
export class SamplingPolicyService {
  async getPolicy(market: string, segment: string, useCase: string): Promise<SamplingPolicy>
  async validate(sampleCount: number, policy: SamplingPolicy): Promise<ValidationResult>
  async getQualityLabel(metric: string, sampleCount: number): Promise<QualityLabel>
  // Returns: 'Confirmed' | 'Likely' | 'Hypothesis' | 'Insufficient data'
}

// lib/platform/provider-capability.registry.ts
export class ProviderCapabilityRegistry {
  async getEnabledProviders(market: string, locale: string): Promise<Provider[]>
  async canHandle(provider: string, market: string, useCase: string): Promise<boolean>
  async supportsFanOut(provider: string, market: string): Promise<boolean>
  async getBestProvider(market: string, useCase: string, tier: Tier): Promise<Provider>
}

// lib/platform/observability.service.ts
export class ObservabilityService {
  emit(event: ObservabilityEvent): void
  // Required events:
  // market_context_resolved | config_bundle_loaded | config_fallback_used
  // prompt_pack_coverage_failed | provider_market_disabled
  // audit_budget_estimated | audit_budget_exceeded
  // score_quality_gate_failed | report_confidence_downgraded
  // frontend_market_changed | fan_out_simulated
  // agent_readiness_scored | mcp_check_completed
  // topical_gap_calculated | citation_source_classified
  // linkedin_presence_audited | consensus_score_calculated  -- v3.0
}
```

### Config validation CLI

```bash
pnpm visibleau config:validate --market AU_EN --locale en-AU
pnpm visibleau config:coverage --all-enabled-markets
pnpm visibleau config:diff --from v1 --to v2
# CI: run on every PR touching config
```

### Acceptance
- All Phase 1 audits pass through BudgetPolicyService + SamplingPolicyService unchanged
- CI passes config:validate on clean AU_EN config
- No Phase 1 test breaks

---

## LAYER 1 — RETRIEVAL INTELLIGENCE

**What it is:** Everything that helps AI crawlers find, read, and trust the
customer's website. Extended with AI Agent Readiness scoring, MCP readiness
check, and Content Format Intelligence.

**Phase 1 foundation used:**
- Sprint 7: llms.txt generator/validator, robots.txt helper, schema auditor,
  SSR check, answer capsule formatter, CDN blocking detection,
  AI discovery endpoints, 8-dimension technical scoring (/100), 27 AI bots

### New tables

```sql
-- AI crawler visit logs (code snippet or server log forwarding)
-- VISIT TYPE DISTINCTION (Hall review finding — Hall tracks active agent visits separately
-- from passive crawler reads; VisibleAU must distinguish these two different signals):
--
--   PASSIVE crawler visit: AI bot indexing content for training or retrieval augmentation.
--     e.g. GPTBot reading your /blog/best-tradie-sydney to update its knowledge base.
--     Detected via: server log User-Agent matching known bot strings.
--     High volume, lower commercial intent.
--
--   ACTIVE agent visit: AI assistant (with web search/browsing tools enabled) visiting
--     your site mid-conversation to verify a fact, check a price, or get a booking URL.
--     e.g. ChatGPT browsing mode reading your /contact after a user asks "book a plumber".
--     Detected via: middleware snippet forwarding full HTTP headers to VisibleAU Visit API.
--     Lower volume, HIGHEST commercial intent — this visit follows an AI recommendation event.
--
-- The is_active_agent flag distinguishes these two. Active agent visits correlated with
-- actual bookings/enquiries are the proof-of-ROI metric that justifies Agency Pro pricing.
-- Hall built this as a separate middleware product (Hall-Monitor). VisibleAU integrates it
-- into the existing crawler_visit_logs table — no second table needed.
CREATE TABLE crawler_visit_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID NOT NULL REFERENCES brands(id),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  crawler_name      TEXT NOT NULL,   -- 'GPTBot' | 'ClaudeBot' | 'PerplexityBot' | 'ChatGPT-User'
  crawler_tier      TEXT NOT NULL,   -- 'must_allow' | 'emerging' | 'data'
  visited_url       TEXT NOT NULL,
  status_code       INTEGER,
  response_time_ms  INTEGER,
  error_type        TEXT,            -- 'blocked_cdn' | 'js_render_fail' | '404' | null
  raw_log_line      TEXT,
  is_active_agent   BOOLEAN NOT NULL DEFAULT false,
  -- true  = active AI agent visit (high-intent: AI assistant mid-conversation, browsing to verify)
  --         Detected by VisibleAU middleware snippet forwarding HTTP headers to Visit API.
  --         Header patterns: User-Agent contains 'ChatGPT-User', 'Claude-User', 'PerplexityBot'
  --         PLUS X-Forwarded-For chain indicates AI assistant infrastructure (not training crawl).
  -- false = passive crawler visit (training/indexing: AI bot reading content, lower intent)
  --         Detected from server log User-Agent alone.
  referrer_ai_session TEXT,
  -- Optional: when is_active_agent=true, the AI platform identifier that triggered the visit.
  -- e.g. 'chatgpt' | 'perplexity' | 'claude' | 'gemini' — populated by middleware snippet.
  -- NULL for passive crawler visits (server log source only).
  visit_purpose     TEXT,
  -- Scrunch calls this "Agent Traffic" — classifies WHY a bot visited, not just which bot.
  -- NULL for visits where purpose cannot be determined.
  -- 'retrieval'  — AI assistant is mid-conversation, fetching your page to answer a live query.
  --               HIGHEST commercial intent. Bot examples: ChatGPT-User, Claude-User, Perplexity-User.
  --               Detection: is_active_agent=true rows are always 'retrieval'.
  --               This is when AI is actively recommending you in a real conversation.
  -- 'indexing'   — AI is refreshing its knowledge base about your brand.
  --               Medium intent. Bot examples: GPTBot, ClaudeBot (deep crawl patterns).
  --               Detection: Tier 1 must-allow bots with multiple pages visited in sequence.
  -- 'training'   — AI ingesting content for model training. Lowest immediate commercial value.
  --               Bot examples: CCBot, Common Crawl, Diffbot.
  --               Detection: Tier 3 data crawler user-agents.
  --
  -- DETECTION LOGIC (lib/crawler/visit-classifier.ts):
  --   if (is_active_agent)                          → 'retrieval'
  --   else if (crawler_tier = 'data')               → 'training'
  --   else if (crawler_tier = 'must_allow'
  --            AND pages_in_session > 3)            → 'indexing'
  --   else                                          → NULL (insufficient signal)
  --
  -- WHY THIS MATTERS FOR AU SMBs:
  -- A tradie seeing "GPTBot visited your booking page 47 times this month" is interesting.
  -- A tradie seeing "ChatGPT was mid-conversation and fetched your booking page 47 times"
  -- understands that AI was actively recommending them to real customers. Completely different.
  --
  -- UI display (Sprint 9 crawler analytics card):
  --   Retrieval: 🟢 "AI recommended you in 47 live conversations this month"
  --   Indexing:  🔵 "AI crawled your site for knowledge refresh (12 pages)"
  --   Training:  ⚪ "AI training crawler visited 3 times"
  visited_at        TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX crawler_logs_brand_idx    ON crawler_visit_logs(brand_id, visited_at DESC);
CREATE INDEX crawler_logs_crawler_idx  ON crawler_visit_logs(crawler_name, visited_at DESC);
CREATE INDEX crawler_logs_purpose_idx  ON crawler_visit_logs(brand_id, visit_purpose, visited_at DESC)
  WHERE visit_purpose IS NOT NULL;  -- partial index: only indexed rows with known purpose

-- RETENTION POLICY (RT-01 fix v8.51): crawler_visit_logs grows unbounded — every AI bot
-- visit on every customer site. Without cleanup it reaches millions of rows, slowing queries
-- (despite indexes) and inflating Supabase storage.
-- EXTEND audit-data-retention.ts (Phase 1 Sprint 12 function, Sunday cron '0 4 * * 0').
-- The extension is applied during Phase 2 Sprint 6 (Retrieval layer — when crawler_visit_logs
-- ships) and Phase 2 Sprint 5 (Trust layer — when brand_web_mentions exists). Guard each DELETE
-- with the table's presence; the Phase 1 function must not reference Phase 2 tables until those
-- migrations have run. Add to also purge:
--   DELETE FROM crawler_visit_logs WHERE visited_at < now() - interval '90 days';
--   (90-day window: dashboards show "AI bot visits last 30/90 days"; older rows have no UI use)
--   DELETE FROM brand_web_mentions WHERE detected_at < now() - interval '180 days';
--   (180-day window: trend charts use ~6 months; older mentions are stale)
-- These two tables have NO audit_id FK so the 12-month audit cascade does not cover them.
-- Both deletes are safe (no downstream FK dependencies on these rows).

-- Per-page content structure + format analysis
-- [GAP 8] Extended with content format detection and freshness scoring
CREATE TABLE content_structure_audits (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id                  UUID NOT NULL REFERENCES brands(id),
  organization_id           UUID NOT NULL REFERENCES organizations(id),
  page_url                  TEXT NOT NULL,
  answer_capsule_score      INTEGER,      -- 0-100
  faq_block_present         BOOLEAN,
  faq_schema_present        BOOLEAN,      -- schema ≠ content impact (honest)
  heading_structure         JSONB,
  capsule_gaps              JSONB,
  word_count                INTEGER,
  optimal_passage_count     INTEGER,      -- passages of 134-167 words (fan-out optimal)
  last_modified             DATE,
  days_since_published      INTEGER,      -- [GAP 8] calculated at audit time
  freshness_risk            TEXT,
  -- [GAP 8] 4-tier: 'fresh' (<30d) | 'aging' (30-60d) | 'at_risk' (60-90d) | 'stale' (>90d)
  -- Research: citation performance begins declining after 4-5 days for new content
  -- Practical threshold: flag at_risk at 60 days, stale at 90 days
  content_format_detected   TEXT,
  -- [GAP 8] 'listicle' | 'how_to_guide' | 'comparison_article' | 'faq_block'
  --         'expert_article' | 'case_study' | 'product_page' | 'other'
  citation_probability_score NUMERIC(4,3),
  -- [GAP 8] estimated probability page gets cited (format × freshness × structure).
  -- Range: 0.000–1.000. Displayed as percentage in UI: 0.73 → "73%".
  --
  -- UI PROMINENCE NOTE (AthenaHQ review finding — their ACE Citation Engine is
  -- their most praised differentiator; VisibleAU already has this data):
  -- citation_probability_score must be the HEADLINE metric in the content audit view.
  -- Do NOT bury it in a data table. Display it as:
  --   "How likely is this page to be cited by AI?  73%  ↑ +12% since last audit"
  --   with a colour-coded badge:  ≥0.70 = green | 0.40–0.69 = amber | <0.40 = red
  --
  -- WHAT DRIVES THE SCORE (inputs to lib/trust/citation-probability-scorer.ts):
  --   content_format_detected:  how_to_guide (+0.18), faq_block (+0.14),
  --                             comparison_article (+0.12), expert_article (+0.10),
  --                             listicle (+0.04), product_page (+0.02)
  --   answer_capsule_score:     0–100 mapped to 0.0–0.25 contribution
  --   freshness_risk:           'fresh'(+0.10), 'aging'(+0.05), 'at_risk'(+0.025), 'stale'(0.00)
  --                             (4-tier — matches the freshness_risk column enum above; v8.67
  --                              reconciliation: the column is fresh/aging/at_risk/stale, so the
  --                              contribution must cover all four, not a 3-tier current/ageing/stale)
  --   is_entity_home_candidate: true adds +0.08 (entity home = highest citation anchor)
  --   optimal_passage_count:    ≥3 passages adds +0.05
  -- Max possible: ~1.00 (in practice 0.85 ceiling — no page is perfectly citable)
  --
  -- ALSO DRIVES: cross_prompt_impact on topical_coverage_gaps — pages with
  --   citation_probability_score < 0.40 on a topic cluster directly reduce
  --   the brand's ability to close that topical gap even with good content quantity.
  -- [GAP 12] Entity Home audit — Jason Barnard / Kalicube, March 2026
  -- The Entity Home is the single canonical URL (usually the About page) that
  -- anchors how algorithms understand a brand. Must have correct Organisation
  -- JSON-LD @id pointing to canonical domain, plus sameAs declarations.
  -- Source: Jason Barnard, Search Engine Land March 2026
  is_entity_home_candidate  BOOLEAN,
  -- true if this page is the About or main landing page
  entity_home_has_org_schema BOOLEAN,
  -- true if page has valid Organisation JSON-LD block
  entity_home_has_id_field  BOOLEAN,
  -- true if Organisation JSON-LD has @id pointing to canonical domain
  entity_home_same_as_count INTEGER,
  -- count of sameAs declarations (Wikipedia, LinkedIn, Wikidata, local directories)
  -- target: ≥3 sameAs declarations for strong entity signals across all regions
  entity_home_page_url      TEXT,
  -- canonical URL confirmed as the Entity Home (null if not yet identified)
  outbound_citation_count   INTEGER,
  -- CITATION FORMATTING (Foglift review finding — Foglift's 8th AEO dimension):
  -- Count of credible outbound citations in the page body.
  -- "Citation Formatting" measures whether content ITSELF cites credible sources
  -- with in-text links — a POSITIVE AI citability signal distinct from broken link detection.
  -- Princeton GEO paper (Aggarwal et al. KDD 2024): citing authoritative sources
  -- increases generative engine citation probability by measurable margin.
  -- VisibleAU Sprint 7 checks for BROKEN outbound links (negative signal).
  -- This column captures CREDIBLE outbound citation richness (positive signal).
  --
  -- DETECTION (content-structure-audit.ts, Playwright crawl):
  --   Count <a href> elements in content body where:
  --     - href is external (different domain from brand)
  --     - target domain is in credible source list:
  --       * .gov.au | .edu.au | .org.au — AU government, academic, non-profit
  --       * wikipedia.org — encyclopaedic reference
  --       * abs.gov.au — Australian Bureau of Statistics (highest AU data authority)
  --       * Known news publishers (smh.com.au, theaustralian.com.au, afr.com, abc.net.au)
  --       * Published research (pubmed, arxiv, nature, springer)
  --   Score: 0 = no credible outbound citations
  --          1-2 = low (minimal sourcing)
  --          3-5 = good (well-sourced content)
  --          6+  = strong (research-grade sourcing)
  --
  -- CONTRIBUTION TO citation_probability_score:
  --   outbound_citation_count = 0:    no adjustment
  --   outbound_citation_count = 1-2:  +0.03
  --   outbound_citation_count = 3-5:  +0.06
  --   outbound_citation_count = 6+:   +0.09
  --
  -- UI: Action Center recommendation when count = 0 on high-priority pages:
  --   "This page has no references to credible sources. AI engines are 2-3× more
  --    likely to cite pages that link to authoritative references like ABS data,
  --    government sources, or published research. Add 2-3 relevant outbound citations."
  has_author_attribution    BOOLEAN,
  -- AUTHOR ATTRIBUTION (Foglift review finding — complements Sprint 7's 'missing author'
  -- negative signal in technical_audits):
  -- Sprint 7 detects 'missing author' as a NEGATIVE signal on technical_audits.
  -- This column captures author attribution as a POSITIVE signal on content_structure_audits.
  -- Different scope: Sprint 7 = brand-level site audit; Phase 2 = per-page content audit.
  --
  -- DETECTION: Does page have:
  --   - a <meta name="author"> tag?
  --   - a visible byline element (class contains 'author', 'byline', 'written-by')?
  --   - a schema.org/Person or schema.org/author JSON-LD block?
  --   - rel="author" link?
  -- Any one of the above = true.
  --
  -- CONTRIBUTION TO citation_probability_score:
  --   has_author_attribution = false: no adjustment (neutral)
  --   has_author_attribution = true:  +0.04 (AI engines trust attributed content more)
  --
  -- ESPECIALLY IMPORTANT FOR:
  --   Allied Health pages (AHPRA-registered practitioner attribution = highest trust signal)
  --   Professional Services (lawyer/accountant name + credentials)
  --   SaaS (named expert or founder byline on blog/comparison pages)
  --   Tradies: less critical (service pages don't need bylines)
  audited_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(brand_id, page_url)
);

-- llms.txt version history
-- is_current MANAGEMENT: before INSERT of a new version, run:
--   UPDATE llmstxt_versions SET is_current = false
--   WHERE brand_id = $brandId AND is_current = true;
-- Then INSERT the new row with is_current = true.
-- This ensures exactly one current version per brand at all times.
-- No DB trigger used — the Inngest function (llmstxt-refresh.ts) owns this logic in a transaction.
-- HONEST SIGNAL NOTE (Otterly review finding):
-- Otterly REMOVED their llms.txt checker in Feb 2026 after analysing millions of
-- citations: "AI bots ARE crawling llms.txt files, but we haven't seen big impacts
-- on AI search visibility." Their data showed llms.txt does not drive AI citations.
-- VisibleAU KEEPS llmstxt_versions — it is a genuine agent readiness signal.
-- BUT: position it honestly. Do NOT market as a primary citation driver.
-- Honest framing: "llms.txt helps AI agents discover your content structure.
--   It is an agent readiness signal, not a citation guarantee."
-- The real citation drivers (per Otterly corpus analysis of millions of responses):
--   #1 Content structure (answer capsules, FAQ H2+20-word answers)
--   #2 Static rendering (AI crawlers cannot render client-side JS)
--   #3 Structured data (schema markup gives AI context and meaning)
--   #4 Third-party citations (Reddit, news, directories = authority signals)
--   #5 llms.txt (agent discovery signal — real but not #1)
-- UI copy rule: llmstxt depth_score shown as part of agent_readiness_scores /100,
--   NOT as a standalone "AI visibility" score. Prevents AU SMBs from thinking
--   "I got a good llms.txt score so I'm set" — they still need content work.
CREATE TABLE llmstxt_versions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID NOT NULL REFERENCES brands(id),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  content           TEXT NOT NULL,
  depth_score       INTEGER NOT NULL,  -- /18
  hosted_url        TEXT,
  is_current        BOOLEAN NOT NULL DEFAULT true,
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Only one current version per brand: partial unique index enforces it
CREATE UNIQUE INDEX llmstxt_one_current_per_brand
  ON llmstxt_versions(brand_id) WHERE is_current = true;

-- [GAP 2] AI Agent Readiness Score — 5 dimensions × 20 pts = /100
-- Source: ARGEO research, Cloudflare Agent Readiness (April 2026)
CREATE TABLE agent_readiness_scores (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id                      UUID NOT NULL REFERENCES brands(id),
  organization_id               UUID NOT NULL REFERENCES organizations(id),
  -- Dimension 1: Technical Accessibility /20
  tech_llmstxt_present          BOOLEAN,
  tech_llmstxt_valid            BOOLEAN,
  tech_robots_allows_crawlers   BOOLEAN,
  tech_ssr_passes               BOOLEAN,
  tech_ai_discovery_endpoints   BOOLEAN,
  tech_page_load_fast           BOOLEAN,      -- <2s for AI crawler user-agents
  -- [GAP 3] MCP readiness check
  tech_mcp_endpoint_present     BOOLEAN,      -- /mcp.json or .well-known/mcp
  tech_mcp_endpoint_valid       BOOLEAN,
  tech_mcp_tools_count          INTEGER,
  tech_score                    INTEGER,      -- /20
  -- tech_score formula: sum of boolean signals × weight:
  --   llmstxt_present(3) + llmstxt_valid(3) + robots_allows_crawlers(3) + ssr_passes(3)
  --   + ai_discovery_endpoints(2) + page_load_fast(2) + mcp_endpoint_present(2) + mcp_endpoint_valid(2)
  --   = max 20; mcp_tools_count adds 0 pts (informational only)
  -- Dimension 2: Entity Clarity /20
  entity_org_schema_present     BOOLEAN,
  entity_local_business_schema  BOOLEAN,
  entity_local_reg_in_schema    BOOLEAN,
  -- Market-agnostic: AU=ABN | NZ=NZBN | UK=Companies House number in schema
  -- Driven by market_code on the parent brand/organization record
  entity_name_consistent        BOOLEAN,
  entity_service_readable       BOOLEAN,
  entity_clarity_score          INTEGER,      -- /20 (renamed from entity_score to avoid collision with
  -- brand_entity_scores.score_of_10 /10. Here it means 'entity clarity dimension of agent readiness',
  -- NOT the overall entity score. Different scale, different table, different purpose.)
  -- entity_clarity_score formula: org_schema_present(5) + local_business_schema(4) + local_reg_in_schema(4)
  --   + name_consistent(4) + service_readable(3) = max 20
  -- Dimension 3: Claim Verifiability /20
  verify_abn_confirmed          BOOLEAN,
  verify_wikipedia_au           BOOLEAN,
  verify_au_directories         INTEGER,      -- count 0-4
  verify_review_citations       INTEGER,
  verify_expert_quotes          BOOLEAN,
  verify_score                  INTEGER,      -- /20
  -- verify_score formula: abn_confirmed(5) + wikipedia_au(5)
  --   + au_directories(min(count,4)×1pt, max 4) + review_citations(min(count,3)×1pt, max 3) + expert_quotes(3) = max 20
  -- Dimension 4: Category Authority /20
  authority_topical_coverage    INTEGER,      -- TCG score 0-100
  authority_prompt_appearance   NUMERIC(5,2),
  authority_citation_diversity  INTEGER,      -- distinct source types
  authority_score               INTEGER,      -- /20
  -- authority_score formula: topical_coverage (TCG score mapped 0-100 → 0-8pts)
  --   + prompt_appearance (citation rate × 6, max 6) + citation_diversity (min(count,6)×1pt, max 6) = max 20
  -- Dimension 5: Task-Fit Signals /20
  task_booking_accessible       BOOLEAN,
  task_pricing_visible          BOOLEAN,
  task_service_area_defined     BOOLEAN,
  task_faq_direct_answers       INTEGER,
  task_score                    INTEGER,      -- /20
  -- task_score formula: booking_accessible(5) + pricing_visible(5) + service_area_defined(5)
  --   + faq_direct_answers (min(count,5)×1pt, max 5) = max 20
  -- LOCAL AI TRUST RADIUS (ChatGPT review finding — GAP 5 / SE5):
  -- Composite score specifically for location-dependent AU businesses (Tradies, Allied Health,
  -- Accountants, Dentists, Local Services). Aggregates 5 signals that determine how well AI
  -- recommends this brand in LOCAL search contexts.
  --
  -- Formula (lib/platform/local-ai-trust-scorer.ts):
  --   gmb_score     = local_seo_results.gmb_completeness_score (0-100) × 0.25
  --   directory_score = (brand_entity_scores.local_directory_count / 4) × 100 × 0.25
  --   abn_score     = (brand_entity_scores.abn_verified ? 100 : 0) × 0.15
  --   nap_score     = local_seo_results.nap_consistency_score (0-100) × 0.20
  --   citation_score = (citation_source_intelligence WHERE source_type='au_directory'
  --                     AND brand_present_in_source=true → count / total × 100) × 0.15
  --   local_ai_trust_score = ROUND(gmb_score + directory_score + abn_score + nap_score + citation_score)
  --
  -- All 4 component tables are populated by Sprint 5-6; this score can be computed in Sprint 6.
  --
  -- UI (Sprint 9 Growth+ — SMB dashboard card):
  --   "Local AI Trust: 67/100"
  --   "AI recommends you in local searches 67% as often as your top competitor."
  --   Suburb-level example (Tradies only, where primaryRegions has multiple suburbs):
  --   Sydney CBD: 82 | Parramatta: 68 | Penrith: 42 | Blacktown: 39
  --
  -- Relevant for: Tradies, Allied Health, Accountants, Dentists — NOT for SaaS
  -- (SaaS brands have vertical='saas' and no meaningful GMB/directory signals)
  -- Scorer checks brand.vertical; skips computation for 'saas', stores NULL.
  local_ai_trust_score          INTEGER,      -- /100 composite; NULL for SaaS brands
  total_score                   INTEGER,      -- /100 = sum of all 5 dimension scores
  gaps                          JSONB,
  scored_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- APPEND-ONLY table (U-13 fix v8.22): one dated row per scoring run, keyed by scored_at.
  -- NOT an UPSERT table — there is no UNIQUE key and no ON CONFLICT. History is retained so
  -- score-agent-readiness.ts can 'alert on significant score drop' by comparing the newest row
  -- to the previous one. Query latest via ORDER BY scored_at DESC LIMIT 1 (agent_readiness_brand_idx).
  -- updated_at equals created time on insert; only changes if a row is later corrected (rare).
);

CREATE INDEX agent_readiness_brand_idx ON agent_readiness_scores(brand_id, scored_at DESC);
```

### New API routes

```
**Phase 2 EXPLAINABILITY CONTRACT — every score-bearing response MUST answer: Where? Why? What next? Impact? Confidence?**

This is a non-negotiable customer experience rule that applies to every Phase 2 API endpoint
that returns a score, label, recommendation, or gap.

The five questions every customer has (from Competitor PRD §6 + PRD §4.5 pain points):
  1. Where do I stand?    → every response includes the current score or status
  2. Why?                 → every response includes a `rationale` TEXT field
  3. What should I do?    → every score-bearing response links to or includes top action(s)
  4. What impact?         → every recommendation includes `estimated_impact` (% or descriptive)
  5. How confident?       → every response includes a `confidence_label` ('High'|'Medium'|'Low'|null)

REQUIRED FIELDS on every Phase 2 score-bearing API response payload:
  {
    // ... score fields ...
    rationale:         string,   // plain-English explanation of WHY the score is what it is
                                 // written for a non-technical agency owner, not a developer
                                 // e.g. "Your brand appears in 3 of 10 prompts. Competitors
                                 //       average 7 of 10. The gap is widest on pricing queries."
    confidence_label:  'High' | 'Medium' | 'Low' | null,
    confidence_note:   string | null,
                                 // null for High (no explanation needed)
                                 // "Based on partial audit data — run 2 more audits to confirm"
                                 // for Medium
                                 // "Early signal only — we need more data before acting on this"
                                 // for Low
    top_action:        string | null,
                                 // Single plain-English next step, or null if none
                                 // e.g. "Create a comparison page targeting 'best tradie Sydney'"
  }

IMPLEMENTATION RULE (lib/platform/explainability.ts):
  Every API route that returns scores must pass its data through ExplainabilityService.annotate()
  before responding. The service:
    1. Reads the score + confidence_label from the data
    2. Generates `rationale` from a template keyed on score type + brand_archetype
    3. Generates `confidence_note` from confidence_label
    4. Reads the top-priority open remediation_task for this brand as `top_action`
  Templates are plain English, written at Year 10 reading level.
  They never use the words 'algorithm', 'heuristic', 'statistical', or 'confidence interval'.

  // EXPLAINABILITY CONTRACT — TypeScript interface (ChatGPT review finding — GAP 9 / SE4):
  // Every Phase 2 scored API response must include this shape alongside the score data.
  // ExplainabilityService.annotate() populates this from templates keyed on (scoreType, brandArchetype).
  // An empty or generic `rationale` is a build failure — Vitest enforces this:
  //   expect(result.explainability.rationale).not.toBe('');
  //   expect(result.explainability.rationale.length).toBeGreaterThan(30);
  //
  -- ── EXPLAINABILITY CONTRACT — PLATFORM-WIDE ACCEPTANCE CRITERION (v8.33, ChatGPT Phase 2.5 Rec 4) ──
-- Every customer-facing recommendation, gap, and insight produced by VisibleAU MUST answer
-- all 5 questions below before it ships. This is a NON-NEGOTIABLE acceptance criterion for
-- every Phase 2 sprint that produces customer-facing output.
--
--   1. Where do I stand?       → standingSummary: plain-English score context
--   2. Why is this happening?  → whyExplanation: specific signal, not generic
--   3. What should I do?       → actionSuggestion: single clearest next step
--   4. What impact could it have? → expectedImpact: evidence-based (no revenue estimates)
--   5. How confident is VisibleAU? → confidenceLabel: confirmed / likely / hypothesis
--
-- VITEST ENFORCEMENT: the existing Vitest test (t.explainability.rationale.length > 30)
-- must be extended to check all 5 fields are non-empty strings for every new intelligence
-- layer output that surfaces to the UI.
-- CONFIDENCE ON GAP ROWS (WF-03 fix v8.34): topical_coverage_gaps has NO confidenceLabel
-- column (adding one would require a schema change, which is out of scope per ChatGPT's
-- instruction). Gap analysis confidence MUST be expressed as follows:
--   • topical_coverage_gaps: hardcode confidenceLabel = 'likely' in the UI layer.
--     Rationale: gaps are detected heuristically (no research citation attached).
--     Display as: "Confidence: Likely — based on competitor content analysis"
--   • action_items: use stored confidenceLabel (confirmed/likely/hypothesis) ✓
--   • comparison_prompt_results: derive from brand_won field (confirmed if brand_won=false
--     and competitor domain is present, likely otherwise) — display in competitive benchmark.
-- NEVER produce unexplained recommendations. This is VisibleAU's strongest differentiator.
-- Competitors show numbers. VisibleAU shows understanding.
--
export interface ExplainabilityAnnotation {
    // WHERE DO I STAND? — Plain-English summary of the score value
    // e.g. "AI platforms mention your brand in 34% of relevant searches."
    // Never: "Your scoreFrequency is 34.2." Never: "Algorithm score: 34."
    standingSummary: string;
    //
    // WHY? — Plain-English explanation of the primary cause
    // e.g. "Competitors have 3× more how-to guides on [topic], which AI cites preferentially."
    // Must reference a specific signal from the data — never generic.
    whyExplanation: string;
    //
    // WHAT NEXT? — Single most important action, plain English
    // e.g. "Write a comparison guide on [topic_cluster] — closes 3 citation gaps at once."
    // Sourced from top-priority open remediation_task for this brand.
    topAction: string;
    //
    // IMPACT? — Specific estimated lift with research citation
    // e.g. "Brands that do this typically improve citation rate by 8-15% within 60 days."
    // Must cite specific research or corpus data. Never invent effect sizes.
    expectedImpact: string;
    //
    // CONFIDENCE? — Derived from sample_quality / confidence_label
    // e.g. "Based on 12 audits (High confidence)."
    // or   "Based on 2 audits (Low confidence — run more audits to strengthen this)."
    confidenceNote: string;
  }
  //
  // Usage in every Phase 2 API route:
  //   const annotation = await ExplainabilityService.annotate({ scoreType, brandId, score, archetype });
  //   return { score, trend, explainability: annotation };

DESIGN INTENT (revenue and profit are the goal; CX and reputation are the pillars):

  The Explainability Contract is a revenue mechanism, not a UX nicety.

  Revenue case:
    The fastest path to churn in a B2B SaaS is a customer who cannot interpret
    their own data. If a score appears without explanation, the customer either
    ignores it (no action = no result = cancellation) or contacts support
    (support cost erodes margin). Plain-English rationale eliminates both outcomes.
    Customers who understand act. Customers who act see results. Customers who see
    results renew, upgrade, and refer agency colleagues. Referral is zero CAC revenue.

  Retention case:
    VisibleAU's paid tiers (Growth A$299, Agency A$499, Agency Pro A$1,499) require
    customers to believe the product is worth more than a cheaper competitor.
    The belief is built through perceived insight quality — the feeling that VisibleAU
    explains things no other tool explains. Every rationale field is a retention investment.

  Reputation case (which is also a revenue case):
    VisibleAU's market position is "the AI visibility tool that actually explains itself."
    A vague or technically-worded rationale ("Score computed from audit data") directly
    contradicts that positioning and undermines the basis for premium pricing.
    Templates must never use: 'algorithm', 'heuristic', 'statistical', 'confidence interval'.
    These words signal complexity, not expertise. They shrink the addressable market.

  If rationale is empty or generic: that is a build failure. Not acceptable output.

**Phase 2 API ROUTE PATTERN — ALL routes MUST call setRlsContext (Phase 1 Sprint 1 AA2 fix):**
Without setRlsContext, Phase 2's 30+ new API routes silently bypass RLS security on all queries.
Every Phase 2 protected route must follow this pattern (includes cross-org 404 per CLAUDE.md §8):
```typescript
import { getCurrentUser } from '@/lib/auth/current-user';
import { setRlsContext, db } from '@/db/client';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await setRlsContext(db, currentUser.organizationId);  // REQUIRED — sets app.current_org_id
  // All db queries below are now RLS-scoped to currentUser.organizationId

  // CROSS-ORG GUARD (CLAUDE.md §8: "Never return 401 on cross-org access — return 404"):
  // After the main DB query, if a brand/resource is found but belongs to a different org,
  // RLS returns empty (not an error). Always check for empty result and return 404:
  //   const resource = await db.select().from(table).where(eq(table.id, params.id));
  //   if (!resource.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // DO NOT return 401 for wrong-org access — that leaks org membership information.
}
```
This applies to every route listed below (GET, POST, PATCH, DELETE).

GET  /api/brands/[id]/retrieval-audit         → full retrieval + agent readiness report
GET  /api/brands/[id]/crawler-logs            → AI crawler visit history
GET  /api/brands/[id]/llmstxt                 → current llms.txt + depth score
POST /api/brands/[id]/llmstxt/generate        → trigger new generation
GET  /api/brands/[id]/content-structure       → per-page content audit + format + freshness
GET  /api/brands/[id]/agent-readiness         → 5-dimension agent readiness score
POST /api/brands/[id]/agent-readiness/refresh → trigger fresh calculation
GET  /api/brands/[id]/entity-home             → [GAP 12] Entity Home audit result
```

### New Inngest functions

```typescript
// inngest/functions/crawler-log-ingest.ts
// TRIGGER (VA-01 fix v8.48): listens on 'visit/ingested' (emitted by app/api/visit/route.ts).
// For passive log imports (CSV/nginx upload), the upload route also emits 'visit/ingested'
// per parsed log line (or batches them). Single trigger event for both active + passive paths.
// SECURITY (BT-01 fix v8.46): The Visit API POST validates brandToken before processing.
// brandToken is stored on the brands table (Phase 2 ALTER — see below).
// Validation: SELECT id FROM brands WHERE brand_token = $brandToken AND organization_id IS NOT NULL.
// If not found → 401 Unauthorized. Never process without validation.
// brandToken format: nanoid(32) — generated when brand is created (Phase 1) OR
//   on first use of the crawler snippet (lazy generation). Stored as brands.brand_token TEXT UNIQUE.
// SCHEMA NOTE: brands.brand_token is added via Phase 2 Sprint 6 migration:
//   ALTER TABLE brands ADD COLUMN IF NOT EXISTS brand_token TEXT UNIQUE;
//   UPDATE brands SET brand_token = nanoid(32) WHERE brand_token IS NULL; -- backfill existing brands
// Fires on webhook from code snippet or log forwarder
// Parses log line → upserts crawler_visit_logs
//
// MIDDLEWARE SNIPPET SPEC (Hall review finding — Hall requires server-side middleware;
// VisibleAU ships a simple Next.js middleware snippet that customers drop in):
//
// File: /public/visibleau-snippet.js (customer installs on their own site)
// Also: Next.js middleware template at /docs/middleware-setup (one-copy install)
//
// What the snippet does:
//   1. On every inbound HTTP request to the customer's site, reads User-Agent + headers
//   2. If User-Agent matches known AI agent pattern (ChatGPT-User, Claude-User, etc.):
//      POST to https://api.visibleau.com.au/v1/visit with:
//        { brandToken, url, userAgent, referrer, timestamp, headers: { x-forwarded-for } }
//   3. VisibleAU Visit API validates brandToken → fires crawler-log-ingest Inngest event
//      → sets is_active_agent=true + referrer_ai_session on the crawler_visit_logs row
//   ── VISIT API ROUTE HANDLER (VA-01 fix v8.48) ──
//   Route: app/api/visit/route.ts (POST). This is a PUBLIC unauthenticated endpoint
//     (no session — the customer's snippet calls it from their visitors' browsers).
//     MIDDLEWARE (MW-01 fix v8.49): MUST add '/api/visit' to the isPublic route matcher
//     in middleware.ts. Phase 1 isPublic currently lists '/', '/pricing', '/sign-in(.*)',
//     '/sign-up(.*)', '/api/webhooks(.*)', '/api/health'. Without adding '/api/visit',
//     the auth middleware blocks visitors' browsers (401) and crawler tracking silently breaks.
//     Security is via brandToken (not a session). Steps (HARDENED v8.67 — SEC-A + SEC-B):
//       a. Zod-validate body: { brandToken: z.string(), url: z.string().url(), userAgent: z.string(),
//          referrer: z.string().optional(), timestamp: z.string() }
//       b. SEC-B — IP-BASED THROTTLE FIRST, BEFORE any DB work: rate-limit by client IP
//          (e.g. 300 req/min/IP) so a flood of INVALID tokens is shed before the brand lookup.
//          Without this, the per-token limit (step d) never triggers for unknown tokens (no valid
//          token to key on) and every request still costs a DB SELECT — an un-throttled
//          DB-amplification path on an unauthenticated endpoint. → 429 when the IP limit is hit.
//       c. SEC-B — NEGATIVE CACHE for unknown tokens: keep a short-TTL (e.g. 60s) in-memory/Redis
//          set of recently-seen invalid brandTokens; if body.brandToken is in it, return 401
//          immediately WITHOUT a DB SELECT. (Populated on each step-d miss.) Sheds repeat-abuse
//          from a single bad token before it amplifies into DB load.
//       d. Look up brand: SELECT id, organization_id, domain FROM brands WHERE brand_token = body.brandToken
//          → 401 if not found (and add the token to the step-c negative cache). Never process
//          without a valid token.
//       e. SEC-A — VALIDATE THE POSTED URL AGAINST THE BRAND'S DOMAIN: the brandToken is
//          necessarily public (it ships in the browser snippet), so a token holder could post
//          visits for arbitrary URLs and pollute crawler_visit_logs. Check
//          new URL(body.url).host === brand.domain (or is a known subdomain of brand.domain);
//          → 422 (or silently drop) if the host doesn't belong to the brand. Only ingest visits
//          for the brand's own pages.
//       f. Rate-limit per brandToken (e.g. 100 req/min) — the per-token ceiling for VALID traffic
//          (now reached only after a valid token + matching domain). → 429 when hit.
//       g. inngest.send({ name: 'visit/ingested', data: { brandId, orgId, ...body } })
//          (crawler-log-ingest.ts listens on 'visit/ingested' — internal slash convention)
//       h. Return 202 Accepted immediately (don't block the visitor's page on processing).
//
// For passive bot crawls (GPTBot etc.): customer pastes log export → same ingest endpoint.
//
// TIER ACCESS:
//   is_active_agent tracking requires Growth+ (middleware snippet setup implies technical user)
//   Passive log import available Starter+ (CSV/nginx log upload)
//
// POSITIONING NOTE (Hall competitive advantage — Hall is entirely sales-led, no self-serve):
//   VisibleAU's middleware snippet must install in under 5 minutes with zero sales contact.
//   Target: copy one file, add one environment variable, deploy. Done.
//   Hall requires contacting sales before any access. VisibleAU's self-serve is a structural
//   moat that Hall cannot close without dismantling their entire enterprise GTM model.

// inngest/functions/content-structure-audit.ts
// Scheduled weekly per brand
// CRON (CR-01 fix v8.50): { cron: '0 22 * * 3' } — Wed 22:00 UTC (collision-free slot)
// CRAWLER: REUSES lib/crawler/index.ts (Sprint 7 canonical Playwright infrastructure).
//   Same 20-page budget, 15s per-page timeout, 5min total — Phase 2 does not build a second crawler.
//   content-structure-audit.ts calls crawlSite(brand.domain) → receives page array.
//   Difference from Sprint 7: Sprint 7 technical-audit-run.ts does full 8-dimension scoring;
//   content-structure-audit.ts only scores answer_capsule, format, freshness, passage_count per URL.
//   Rows are UPSERTED into content_structure_audits WHERE UNIQUE(brand_id, page_url):
//   new pages insert; existing pages update (freshness + format can change week to week).
// Crawls pages, scores answer capsules, counts optimal passages
// Detects content format, calculates freshness_risk and citation_probability_score
// [GAP 8] Recommends format mix: if >80% listicle, suggest how-to guide

// inngest/functions/llmstxt-refresh.ts
// Scheduled monthly per brand
// CRON (CR-01 fix v8.50): { cron: '0 3 1 * *' } — 1st of month 03:00 UTC
// Regenerates llms.txt, compares depth_score, alerts if degraded

// inngest/functions/score-agent-readiness.ts
// WEBHOOK EMIT (WH-01d fix v8.47): after INSERT into agent_readiness_scores:
//   inngest.send({ name: 'agent/readiness-scored', data: { organizationId, brandId, compositeScore } })
//   fanout-webhooks.ts maps → 'agent.readiness.scored'.
// TRIGGER (SR-01 fix v8.44): listens on 'technical-audit/complete' (internal slash).
// See RE-01 fix — Sprint 7 emits both 'technical-audit.complete' (webhook) and
// 'technical-audit/complete' (internal). This function listens on the internal event.
// Fires after each technical audit completes
// Runs 5-dimension checks including MCP endpoint validation
// Stores in agent_readiness_scores, alerts on significant score drop

// inngest/functions/audit-entity-home.ts  [GAP 12]
// TRIGGER (AE-01 fix v8.44): listens on 'technical-audit/complete' (internal slash).
// Same pattern as SR-01 — triggered by Sprint 7 technical-audit-run.ts completion.
// Fires after each technical audit (content-structure pass)
// Identifies Entity Home candidate from site crawl
// Checks Organisation JSON-LD: @id field, sameAs count
// Updates content_structure_audits.is_entity_home_candidate
// and entity_home_* columns on confirmed Entity Home row
// Triggers Action Center recommendation if sameAs < 3
```

### New lib/ module

```typescript
// lib/retrieval/
├── crawler-log-parser.ts      // Parse server log lines → structured events
├── content-auditor.ts         // Answer capsule + passage + format detection
├── content-format-advisor.ts  // [GAP 8] Which format for which engine × query type
├── entity-home-auditor.ts     // [GAP 12] Entity Home page check + sameAs audit
├── llmstxt-generator.ts       // Extended with version tracking
├── agent-readiness.ts         // [GAP 2] 5-dimension readiness scorer
├── mcp-checker.ts             // [GAP 3] MCP endpoint validation
├── retrieval-scorer.ts        // Aggregate 8-dim + agent readiness
└── index.ts
```

### lib/retrieval/content-format-advisor.ts key logic

```typescript
// [GAP 8] Content format recommendations by engine × query type
// Source: GenOptima March 2026, RESONEO April 2026

export const FORMAT_BY_ENGINE: Record<string, Record<string, string>> = {
  chatgpt:    { recommendation: 'listicle',    informational: 'expert_article' },
  gemini:     { recommendation: 'how_to_guide', informational: 'how_to_guide' },
  perplexity: { recommendation: 'listicle',    informational: 'faq_block' },
  all_local:  { recommendation: 'listicle',    informational: 'suburb_specific_article' },
};
// Rule: for every 3 listicle pages, recommend 1 how-to guide
// to cover both recommendation AND informational query types

export function recommendFormat(
  engine: string,
  queryType: 'recommendation' | 'informational',
  existingFormatMix: Record<string, number>,
): { format: string; reason: string }
```

### Frontend additions

```
app/(auth)/brands/[brandId]/retrieval/
├── page.tsx                    // Retrieval Intelligence hub
├── crawler-logs/page.tsx       // AI crawler visit timeline
├── content-structure/page.tsx  // Per-page content + format + freshness audit
├── agent-readiness/page.tsx    // 5-dimension agent readiness
└── entity-home/page.tsx        // [GAP 12] Entity Home audit + sameAs status

components/domain/retrieval/
├── retrieval-score-card.tsx    // 8-dim → 5-cat display with expand
├── agent-readiness-gauge.tsx   // Spider chart: 5 dimensions /20 each
├── mcp-status-card.tsx         // MCP present / valid / tools count
├── crawler-log-table.tsx       // Visit history with error highlighting
├── llmstxt-viewer.tsx          // File + depth score + download
├── content-format-card.tsx     // [GAP 8] Format detected + recommendation
├── freshness-badge.tsx         // [GAP 8] fresh / aging / at_risk / stale
├── passage-counter.tsx         // Count of optimal 134-167 word passages
└── entity-home-status.tsx      // [GAP 12] @id present / sameAs count / gaps
```

### lib/retrieval/entity-home-auditor.ts key logic

```typescript
// [GAP 12] Entity Home audit
// Source: Jason Barnard / Kalicube, Search Engine Land March 2026
// The Entity Home is the single canonical URL anchoring brand identity
// for all algorithms: search engines, LLMs, and Knowledge Graphs.

export async function auditEntityHome(
  brandDomain: string,
  pages: PageCrawlResult[],
): Promise<EntityHomeResult> {
  // 1. Identify the Entity Home candidate (About page, homepage, or /about)
  const candidate = findEntityHomeCandidate(pages);

  // 2. Check Organisation JSON-LD presence
  const orgSchema = extractOrganisationSchema(candidate);

  // 3. Check @id field points to canonical domain
  const hasIdField = orgSchema?.['@id']?.includes(brandDomain) ?? false;

  // 4. Count sameAs declarations
  const sameAsUrls = orgSchema?.sameAs ?? [];
  const sameAsCount = Array.isArray(sameAsUrls) ? sameAsUrls.length : 0;
  // Target: ≥3 sameAs pointing to Wikipedia, LinkedIn, Wikidata, local directories
  // (AU: Hipages, Yellow Pages AU; NZ: Neighbourly; UK: Yell)

  return {
    isEntityHomeCandidate: !!candidate,
    pageUrl: candidate?.url ?? null,
    entityHomeHasOrgSchema: !!orgSchema,
    entityHomeHasIdField: hasIdField,
    entityHomeSameAsCount: sameAsCount,
    gaps: buildEntityHomeGaps(orgSchema, hasIdField, sameAsCount),
  };
}
```

### Action Center integration (new types for Layer 1)

```
[GAP 2] "Agent Readiness: 34/100.
         AI agents cannot efficiently take action on your behalf.
         Top fix: Add /mcp.json to expose your booking tools to AI agents."

[GAP 3] "No MCP endpoint detected. AI agents (Claude, ChatGPT) can read
         your site but cannot take actions. This is the 2026 equivalent
         of not having a contact form."

[GAP 8] "Content format: 94% of your pages are product pages.
         Listicle content accounts for 59.5% of AI citations.
         Recommend: publish 'Top 5 Licensed Electricians in Bondi'
         style content. For Gemini: add one how-to guide per month."

[GAP 8] "15 pages have freshness risk 'at_risk' (60-90 days old).
         Citation performance declines after 60 days.
         Priority: update these pages with current pricing and dates."

[GAP 12] "No Entity Home detected.
          Your About page has no Organisation JSON-LD schema.
          AI systems cannot uniquely identify your brand as a trusted entity.
          Fix: Add Organisation schema with @id pointing to your canonical
          domain + sameAs links to LinkedIn, Wikipedia AU, and Hipages."

[GAP 12] "Entity Home found but only 1 sameAs declaration.
          Target: ≥3 sameAs links so AI systems have corroboration.
          Add: LinkedIn company page URL, Hipages URL, Wikidata entry URL."
```

---

## LAYER 2 — VISIBILITY INTELLIGENCE

**What it is:** Core audit engine extended with Share of Voice, Query Fan-Out
Intelligence (3-12 sub-queries), Topical Coverage Gap, Citation Source Types,
Mention-Source Divide, and Google AI Mode tracking.

**Phase 1 foundation used:**
- Sprint 3: 5-dimension scoring, Wilson CIs, citation storage
- Sprint 5: vertical pack prompts with category and topic fields
- Sprint 8: drift detection, drift_alerts table

### New tables

```sql
-- Share of Voice per engine per category
-- competitor_domain SOURCE: reads brands.competitors TEXT[] (Phase 1 column, set at brand creation).
-- calculate-share-of-voice.ts iterates brands.competitors for each brand to generate SoV rows.
-- If brands.competitors is empty, no SoV rows are generated (brand has no known competitors).
CREATE TABLE share_of_voice_snapshots (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id            UUID NOT NULL REFERENCES brands(id),
  organization_id     UUID NOT NULL REFERENCES organizations(id),
  audit_id            UUID REFERENCES audits(id) ON DELETE CASCADE,
  -- CASCADE (E-03 completion fix): per-audit SoV analytics, deleted with audit at 12mo retention.
  -- Without ON DELETE, audit-data-retention.ts (Sprint 12) DELETE audits would fail with FK violation.
  competitor_domain   TEXT NOT NULL,
  prompt_category     TEXT NOT NULL,
  engine              TEXT NOT NULL,
  brand_share         NUMERIC(5,2),
  competitor_share    NUMERIC(5,2),
  -- UNIT (MS-02): brand_share + competitor_share are PERCENTAGES (0-100), not 0-1 ratios.
  --   Per-engine shares across the tracked set sum to ~100. Matches the prototype SoV donut
  --   (pct 34/28/22/16 = 100) and IntelCard unit="%". calculate-share-of-voice.ts writes
  --   (brand_mention_count / total_mentions_in_category) × 100. Same convention as
  --   visibility_trends.mention_rate / citation_rate (MS-01).
  total_prompts       INTEGER NOT NULL,
  sample_quality      TEXT NOT NULL,   -- 'Confirmed'|'Likely'|'Hypothesis'|'Insufficient data'
  calculated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sov_brand_engine_idx ON share_of_voice_snapshots(brand_id, engine, calculated_at DESC);

-- AU-scoped prompt volume estimates
CREATE TABLE prompt_volume_estimates (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_code               TEXT NOT NULL,
  vertical                  TEXT NOT NULL,
  -- Valid values match Phase 1 verticalEnum: 'tradies' | 'allied_health' | 'saas'
  -- Global seed data table (no organization_id — RLS DISABLED per global table classification)
  topic                     TEXT NOT NULL,
  category                  TEXT NOT NULL,
  estimated_monthly_volume  INTEGER,
  volume_trend              TEXT,   -- 'rising' | 'stable' | 'declining'
  confidence                TEXT NOT NULL,
  data_source               TEXT NOT NULL,
  -- DATA SOURCE SPECIFICATION (Hall review finding — Hall ships "search demand estimation";
  --   VisibleAU must specify where prompt_volume_estimates data comes from):
  --
  -- 'visibleau_corpus': derived from VisibleAU's own audit run history.
  --   Formula: COUNT of times this (topic, vertical, market_code) prompt has been
  --   run across ALL VisibleAU customer audits in the last 90 days.
  --   Seed-able from day 1 using internal audit data; grows in accuracy with customer base.
  --   Populated by: lib/intelligence/prompt-demand-scorer.ts (weekly cron).
  --
  -- 'google_trends_au': Google Trends Explore API (AU region, 12-month rolling window).
  --   Uses vertical_pack_prompts.prompt_text as the query term.
  --   Provides directional AU search volume signal (0-100 relative, not absolute).
  --   Populated by: same weekly cron, one API call per unique topic per vertical.
  --   API: https://trends.google.com/trends/api/explore (no key needed, rate-limited).
  --   Store as: estimated_monthly_volume = relative index * multiplier (calibrated quarterly).
  --
  -- 'combined': Both sources merged. When google_trends_au AND visibleau_corpus agree on
  --   'rising' or 'declining', confidence = 'Confirmed'. When they disagree → 'Hypothesis'.
  --
  -- AU ADVANTAGE: Google Trends scoped to AU (geo=AU) returns AU-specific demand signals.
  --   Hall uses US-weighted clickstream data. VisibleAU's AU-scoped Trends data is more
  --   accurate for AU vertical prompts like "best plumber Bondi" vs "best plumber NYC".
  --   This is a defensible data moat Hall cannot replicate without AU market investment.
  period_start              DATE NOT NULL,
  period_end                DATE NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(market_code, vertical, topic, period_start)
);

-- Rolling visibility trend + [GAP 9] Mention-Source Divide columns
CREATE TABLE visibility_trends (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id              UUID NOT NULL REFERENCES brands(id),
  organization_id       UUID NOT NULL REFERENCES organizations(id),
  period_label          TEXT NOT NULL,
  -- Format (date-fns, Sprint 4 already installed):
  --   weekly:  format(startOfISOWeek(date), "yyyy-'W'II")  → '2026-W23' (ISO week, zero-padded)
  --   monthly: format(startOfMonth(date),  'yyyy-MM')      → '2026-06'
  -- IMPORTANT: use consistent function across all producers (aggregate-visibility-trend.ts,
  --   any backfill script). UNIQUE(brand_id, period_label, period_type) requires exact match.
  --   Wrong: 'W23' (no year), '2026-6' (no zero-pad), '2026-23' (missing 'W')
  period_type           TEXT NOT NULL,    -- 'week' | 'month'
  score_composite_avg   NUMERIC(5,2),
  score_frequency_avg   NUMERIC(5,2),
  score_sentiment_avg   NUMERIC(5,2),
  -- SOURCE: audits.scoreSentimentNumeric (NUMERIC, 0-100) NOT audits.scoreSentiment (TEXT categorical).
  -- AVG(audits.scoreSentiment) would fail — scoreSentiment is 'positive'|'neutral'|'negative' (text).
  -- aggregate-visibility-trend.ts must: AVG(score_sentiment_numeric) → score_sentiment_avg.
  score_accuracy_avg    NUMERIC(5,2),
  score_position_avg    NUMERIC(5,2),
  score_context_avg     NUMERIC(5,2),
  -- SOURCE: audits.scoreContextNumeric (NUMERIC, 0-100) NOT audits.scoreContext (TEXT categorical).
  -- scoreContext is 'recommended'|'listed'|'commodified'; scoreContextNumeric is the numeric variant.
  audit_count           INTEGER NOT NULL,
  sample_quality        TEXT NOT NULL,
  -- Derived by aggregate-visibility-trend.ts using sampling_policies.confidence_display_threshold:
  --   'Confirmed'        = audit_count >= minimum_samples AND citation coverage > 0.60 threshold
  --   'Likely'           = audit_count >= minimum_samples AND coverage 0.40-0.60
  --   'Hypothesis'       = audit_count >= minimum_samples AND coverage < 0.40
  --   'Insufficient data'= audit_count < minimum_samples (reads sampling_policies.minimum_repeated_samples=3)
  -- Same labels as Phase 1 lib/confidence-labels/classify.ts — reuse that module for consistency.
  -- [GAP 9] Mention-Source Divide — Semrush AI Visibility Index Sept 2025
  -- Fewer than 1 in 5 brands are both frequently mentioned AND cited as sources
  mention_rate          NUMERIC(5,2),
  -- % of prompts where brand name is mentioned (with or without URL citation).
  -- FORMULA (aggregate-visibility-trend.ts):
  --   mention_rate = (COUNT DISTINCT citations.promptId WHERE citations.brandMentioned = true
  --                   AND citations.auditId IN <period_audit_ids>)
  --                / (COUNT DISTINCT citations.promptId WHERE citations.auditId IN <period_audit_ids>)
  --                × 100
  -- Source column: citations.brandMentioned BOOLEAN (Phase 1 Sprint 2, set by detectBrandMention()).
  -- Period: all completed audits for this brand within the period_label window.
  citation_rate         NUMERIC(5,2),
  -- % of prompts where brand URL is cited as a source.
  -- FORMULA: (COUNT DISTINCT citations.promptId WHERE citations.citedSources JSONB
  --            contains brand domain AND citations.auditId IN <period_audit_ids>)
  --          / (COUNT DISTINCT citations.promptId WHERE auditId IN <period_audit_ids>) × 100
  mention_source_ratio  NUMERIC(5,2),
  -- citation_rate / mention_rate; <0.2 = known but untrusted.
  -- DIVISION-BY-ZERO GUARD: when mention_rate = 0 (brand never mentioned),
  --   mention_source_ratio MUST be set to NULL (not 0 — division is undefined).
  --   aggregate-visibility-trend.ts:
  --     mentionSourceRatio = mentionRate > 0 ? citationRate / mentionRate : null
  --   A NULL mention_source_ratio means: brand is completely invisible (maps to 'invisible' archetype)
  --   without a meaningful ratio to display. UI shows 'N/A' for this metric.
  brand_archetype       TEXT,
  -- 'recognised_authority' (high mention + high citation)
  -- 'known_but_untrusted'  (high mention + low citation) → fix content structure
  -- 'niche_authority'      (low mention + high citation)  → expand prompt coverage
  -- 'invisible'            (low mention + low citation)   → full GEO strategy
  -- CLASSIFICATION THRESHOLDS (lib/visibility/mention-source-divide.ts):
  market_competition_label  TEXT,
  -- HubSpot AEO Grader review finding: HubSpot's "Market Competition" dimension classifies
  --
  -- BUSINESS DRIVERS (Semrush AI Toolkit review finding — v1.2 ROADMAP, not Phase 2):
  -- Semrush's "Business Drivers" feature scores individual brand attributes:
  --   "Warby Parker scores 55 on Omnichannel Access but only 25 on Value-Driven."
  -- This answers: WHICH specific attributes does AI associate with your brand?
  -- Not just positive/neutral/negative tone — but which DIMENSIONS of brand perception.
  -- For AU SMBs, the attributes are different from US enterprise brands:
  --   Tradies: Licensed/Insured, Local, Responsive, Fixed-Price, Guaranteed Work
  --   Allied Health: Qualified, Bulk Billing, Short Wait Times, Specialist, Accessible
  --   SaaS: Integrations, Support Quality, AU Data Residency, Pricing, Ease of Use
  --
  -- Why this is v1.2 and NOT Phase 2:
  --   Requires AU-specific attribute taxonomy (30-50 attributes per vertical)
  --   Requires keyword extraction pass on citations.contextSnippets per attribute
  --   Requires training data to validate AU-specific attribute signal strength
  --   Phase 2 already computes scoreSentiment (tone) + brand_archetype (position)
  --   Adding per-attribute scoring in Phase 2 risks feature bloat for solo dev
  --
  -- v1.2 implementation (Month 18+):
  --   New table: brand_attribute_scores(brand_id, audit_id, attribute_key, score NUMERIC)
  --   Attribute keys per vertical seeded in db/seed/brand-attributes-[vertical].ts
  --   Extraction: post-audit Inngest step parses contextSnippets for attribute signals
  --   UI: attribute radar chart on brand profile page (Growth+)
  --   e.g. Tradie dashboard: "AI describes you as: ✓ Licensed ✓ Local ✗ Fixed-Price"
  --
  -- Semrush charges add-on pricing for this. VisibleAU v1.2 includes it in Growth.
  -- brands as Leader / Challenger / Niche Player based on share of voice vs category peers.
  -- VisibleAU brand_archetype answers WHERE you are (mention × citation 2×2 matrix).
  -- market_competition_label answers HOW you rank vs competitors — a different dimension.
  -- Both are needed: a brand can be a 'recognised_authority' (high mention + citation)
  -- but still a 'challenger' (ahead of most peers but not the dominant brand in category).
  --
  -- Values:
  --   'category_leader'   — brand citation_rate > 2× average competitor citation_rate
  --                         in share_of_voice_snapshots for this period
  --   'challenger'        — brand citation_rate between 0.5× and 2× of competitor average
  --   'niche_player'      — brand citation_rate < 0.5× of competitor average
  --   NULL                — insufficient competitor data to classify (< 2 competitors tracked)
  --
  -- Classification logic (aggregate-visibility-trend.ts):
  --   1. Pull share_of_voice_snapshots for this brand + period
  --   2. Compute avg competitor citation_rate (brand_present=false rows in same period)
  --   3. Compare brand citation_rate vs competitor avg → assign label
  --   Source: HubSpot AEO Grader framework; adapted for AU GEO context.
  --
  -- UI (Sprint 9 visibility dashboard, Starter+):
  --   Badge alongside brand_archetype: "Category Leader" | "Challenger" | "Niche Player"
  --   Plain English: "You appear more often in AI answers than 80% of your competitors."
  --   Client reports: shown in SWOT Strengths/Threats section (AB-01)
  --   Locked for Free: teaser "Are you a Leader, Challenger, or Niche Player? → Starter A$99"
  -- CLASSIFICATION THRESHOLDS (lib/visibility/mention-source-divide.ts):
  --   UNIT (MS-01 fix): mention_rate and citation_rate are stored as PERCENTAGES (0-100),
  --   per the "× 100" in their FORMULA comments above and the prototype's "67% → 52%" display.
  --   These thresholds are therefore percentage-points, NOT 0-1 ratios. (mention_source_ratio
  --   = citation_rate / mention_rate stays unit-free in 0-1 because the ×100 cancels.)
  --   High mention:  mention_rate >= 20  (brand named in ≥20% of audited prompts)
  --   Low  mention:  mention_rate <  20
  --   High citation: citation_rate >= 10 (brand URL cited in ≥10% of audited prompts)
  --   Low  citation: citation_rate <  10
  --   Source: Semrush AI Visibility Index Sept 2025 — top-20% brands averaged 21% mention rate
  --   Quadrant matrix:
  --     mention≥20 + citation≥10 → 'recognised_authority'
  --     mention≥20 + citation<10 → 'known_but_untrusted'
  --     mention<20 + citation≥10 → 'niche_authority'
  --     mention<20 + citation<10 → 'invisible'
  -- [GAP 15] Citation Volatility Score
  -- Source: eMarketer 2026 — 40-60% of cited sources change month-to-month
  -- across Google AI Mode and ChatGPT. High average citation rate but high
  -- volatility signals a brand at risk even when averages look healthy.
  citation_volatility_score NUMERIC(5,2),
  -- standard deviation of citation_rate across the last 12 completed audit runs.
  -- MINIMUM SAMPLE HANDLING: std dev requires at least 3 data points to be meaningful.
  --   If audit_count < 3: set citation_volatility_score = NULL (not 0.0 — NULL = 'not enough data').
  --   If audit_count 3-11: compute std dev over available runs (n < 12 is acceptable, just less stable).
  --   If audit_count >= 12: compute std dev over last 12 runs.
  -- NULL citation_volatility_score suppresses the volatility badge and Action Center flag.
  -- volatility-scorer.ts must handle NULL gracefully; UI shows 'Not enough data (N audits)'.
  -- <5.0 = stable | 5.0-15.0 = moderate | >15.0 = volatile (at risk)
  calculated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- ROI INTELLIGENCE — GA4-connected (ChatGPT review finding — GAP 3 / SE3; honest version):
  -- These columns are populated ONLY when organizations.ga4_measurement_id is set (Sprint 9 GD1).
  -- When GA4 is not connected, both columns remain NULL and the UI shows an industry benchmark range
  -- with clear disclosure: "Connect GA4 to see your actual numbers."
  -- WARNING: Never populate these from estimates or projections. Real GA4 data only.
  --   ai_referral_sessions = GA4 sessions WHERE source matches AI referrers
  --                          (chatgpt.com, perplexity.ai, claude.ai, gemini.google.com)
  --   ai_lead_estimate     = ai_referral_sessions × organization's GA4 conversion rate
  --                          (conversion rate read from GA4 goals; NULL if no goal configured)
  -- Populated by: aggregate-visibility-trend.ts Inngest function (Sprint 3)
  --   when GA4 config exists → GA4 Data API call → store actual session count
  -- UI (Sprint 9 Growth+, GA4-connected orgs only):
  --   "AI search sent 234 sessions to your site last month."
  --   "Your site converts at 3.2%. That's ~7 leads from AI search."
  --   "Up from 3 last month (+133%)."
  -- UI (Sprint 9 Growth+, no GA4):
  --   "Connect GA4 to see your actual AI traffic. Industry benchmark: 0.5–2% of total traffic."
  ai_referral_sessions          INTEGER,      -- NULL if GA4 not connected; real session count if connected
  ai_lead_estimate              NUMERIC(8,2), -- NULL if no GA4 conversion goal; ai_referral_sessions × conversion_rate
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),  -- set on UPSERT write; J-01 fix (v6.7)
  UNIQUE(brand_id, period_label, period_type)
);

-- [GAP 14] Brand Web Mention Intelligence
-- Source: Ahrefs study of 75K brands (2026); Loganix 680M citation analysis (April 2026)
-- Brand web mentions have the STRONGEST correlation with AI visibility (r=0.664)
-- This is 3× stronger than backlinks (r=0.218) and stronger than domain authority.
-- Reddit is #1 cited source in 7/10 AU B2C verticals on ChatGPT (Optimising AU, March 2026)
-- Perplexity: Reddit = 24-46.7% of all citations (Tinuiti Q1 2026)
-- Brands with millions of Reddit+Quora mentions have 4× higher AI citation rates
-- Tracks UNLINKED brand mentions — not the same as citation tracking in citations table
CREATE TABLE brand_web_mentions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id              UUID NOT NULL REFERENCES brands(id),
  organization_id       UUID NOT NULL REFERENCES organizations(id),
  market_code           TEXT NOT NULL DEFAULT 'AU_EN',
  -- 'AU_EN' | 'NZ_EN' | 'UK_EN' — drives which community platforms to monitor
  -- Phase 2: AU_EN only. Phase 3: add NZ_EN, UK_EN via new seed data rows.
  -- Source classification
  source_platform       TEXT NOT NULL,
  -- 'reddit' | 'youtube' | 'quora' | 'news' | 'review_site' | 'forum' | 'other'
  source_url            TEXT NOT NULL,
  subreddit             TEXT,
  -- Market-specific community platform identifiers:
  -- AU_EN: 'r/australia' | 'r/AusFinance' | 'r/sydney' | 'r/melbourne'
  --        'r/brisbane' | 'r/auslaw' | 'r/AustralianPolitics' | vertical-specific
  -- NZ_EN: 'r/newzealand' | 'r/auckland' | 'r/wellington' | vertical-specific
  -- UK_EN: 'r/unitedkingdom' | 'r/london' | 'r/AskUK' | vertical-specific
  -- Populated from community_platform_seeds table (Phase 3 seed data, no schema change)
  -- Source: Reddit #1 in 7/10 AU B2C verticals; Optimising AU March 2026
  -- Mention details
  mention_text          TEXT,           -- snippet of the mention
  mention_sentiment     TEXT,           -- 'positive' | 'neutral' | 'negative'
  -- Note: citation rates for positive and negative sentiment on Reddit are
  -- nearly identical (5% vs 6.1%) — AI models seek authentic evaluation,
  -- not praise. Invisibility is measurably worse than honest critique.
  upvotes               INTEGER,        -- Reddit upvote count at time of capture
  is_top_comment        BOOLEAN,        -- true if it is the accepted/top answer
  thread_recency_days   INTEGER,        -- days since thread was posted
  -- AI citation relevance
  is_indexed_by_google  BOOLEAN,        -- true if thread appears in Google index
  engine_citation_seen  TEXT,           -- 'chatgpt' | 'perplexity' | 'gemini' | null
  -- set when VisibleAU detects this specific thread cited in an AI response
  -- Vertical relevance
  vertical_match        BOOLEAN,        -- does this thread match brand's vertical?
  detected_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX brand_mentions_brand_idx    ON brand_web_mentions(brand_id, detected_at DESC);
CREATE INDEX brand_mentions_platform_idx ON brand_web_mentions(brand_id, source_platform, detected_at DESC);
CREATE INDEX brand_mentions_market_idx   ON brand_web_mentions(brand_id, market_code, detected_at DESC);
CREATE INDEX brand_mentions_cited_idx    ON brand_web_mentions(brand_id, engine_citation_seen) WHERE engine_citation_seen IS NOT NULL;

-- [GAP 1] Query Fan-Out — sub-queries AI derives from each prompt
-- v3.0: Updated to 3-12 sub-queries (GPT-5.4 uses 10+ per RESONEO April 2026)
-- cosine similarity >0.88 = 7.3x higher citation rate (Wellows, Dec 2025)
CREATE TABLE query_fan_out_results (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id                  UUID REFERENCES audits(id) ON DELETE CASCADE,
  -- CASCADE: fan-out results are per-audit analytics; deleted with audit after 12mo retention
  brand_id                  UUID NOT NULL REFERENCES brands(id),
  organization_id           UUID NOT NULL REFERENCES organizations(id),
  original_prompt           TEXT NOT NULL,
  original_prompt_id        UUID REFERENCES vertical_pack_prompts(id) ON DELETE SET NULL,
  -- SET NULL (FK-ON-DELETE fix v8.28): prompts are normally SOFT-retired (retiredAt), but Phase 1
  -- CK3 requires every FK to vertical_pack_prompts declare ON DELETE for future-proofing. A fan-out
  -- result is a historical observation; if its source prompt is ever hard-removed, keep the result
  -- and null the provenance link (do NOT CASCADE — we don't discard fan-out history).
  engine                    TEXT NOT NULL,
  sub_query                 TEXT NOT NULL,
  sub_query_rank            INTEGER NOT NULL,  -- 1 = first sub-query
  brand_appeared            BOOLEAN NOT NULL,
  brand_position            INTEGER,
  content_similarity_score  NUMERIC(4,3),      -- 0.000–1.000
  above_threshold           BOOLEAN,           -- true if > 0.88
  run_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX fan_out_brand_idx      ON query_fan_out_results(brand_id, run_at DESC);
CREATE INDEX fan_out_audit_idx      ON query_fan_out_results(audit_id);
CREATE INDEX fan_out_threshold_idx  ON query_fan_out_results(brand_id, above_threshold);

-- [GAP 6] Topical Coverage Gap — topic clusters brand covers vs competitors
-- Only 32% of AI citations come from Google top-10 (Surfer SEO, Dec 2025)
CREATE TABLE topical_coverage_gaps (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id                  UUID NOT NULL REFERENCES brands(id),
  organization_id           UUID NOT NULL REFERENCES organizations(id),
  vertical                  TEXT NOT NULL,
  -- Valid values match Phase 1 verticalEnum: 'tradies' | 'allied_health' | 'saas'
  topic_cluster             TEXT NOT NULL,
  -- SOURCE: derived from vertical_pack_prompts.topic (Sprint 5 field, e.g. 'emergency-service').
  -- NAMING CONVENTION: vertical_pack_prompts.topic uses hyphens ('emergency-service')

  -- topic_cluster stores with underscores ('emergency_service') for DB consistency.
  -- calculate-topical-gaps.ts must translate: topic.replace(/-/g, '_') when writing topic_cluster.
  -- Seed values (first run per vertical): calculate-topical-gaps.ts reads DISTINCT topic values
  -- from vertical_pack_prompts WHERE vertical=$brand.vertical AND retiredAt IS NULL.
  -- This means topic_cluster values are always a subset of the vertical pack's topic taxonomy.
  topic_label               TEXT NOT NULL,    -- 'Emergency call-outs' — human-readable label
  brand_has_content         BOOLEAN NOT NULL,
  brand_content_depth       INTEGER,          -- word count of best matching page
  brand_passage_count       INTEGER,          -- 134-167 word optimal passages
  competitor_coverage       JSONB,
  -- [{ domain, has_content, depth, passage_count }]
  estimated_citation_impact NUMERIC(4,2),     -- % citation uplift if gap filled
  priority_rank             INTEGER,
  -- computed: lower number = higher priority (1 = most urgent gap to close)
  cross_prompt_impact       INTEGER,
  -- JEWEL WINS (Profound feature: "one fix unlocks multiple prompts at once"):
  -- Count of distinct prompts in this brand's vertical pack that would benefit
  -- from closing this specific topical gap. Surfaces maximum-leverage actions.
  --
  -- Example: "Writing one comparison article on [topic_cluster] would improve
  -- your visibility on 7 prompts simultaneously" → cross_prompt_impact = 7
  --
  -- Computed by calculate-topical-gaps.ts:
  --   SELECT COUNT(DISTINCT vpp.id) FROM vertical_pack_prompts vpp
  --   WHERE vpp.topic = topical_coverage_gaps.topic_cluster
  --     AND vpp.vertical = brand.vertical
  --     AND vpp.retiredAt IS NULL
  --     AND brand was NOT cited for vpp in last 3 audits
  --
  -- UI (Sprint 9 SMB view): "HIGH LEVERAGE — fix this gap → improves 7 prompts"
  -- Sorted by cross_prompt_impact DESC as primary sort in Action Center.
  -- NULL when cross_prompt_impact < 2 (single-prompt gaps shown without badge).
  -- For a resource-constrained AU SMB: "fix these 3 things, cover 80% of your gaps."
  analyzed_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),  -- set on UPSERT write; J-01 fix (v6.7)
  UNIQUE(brand_id, vertical, topic_cluster)
);
CREATE INDEX topic_gaps_brand_priority_idx ON topical_coverage_gaps(brand_id, priority_rank);
CREATE INDEX topic_gaps_cross_prompt_idx   ON topical_coverage_gaps(brand_id, cross_prompt_impact DESC NULLS LAST);

-- [GAP 5] Google AI Mode — separate surface from Gemini (stretch goal)
-- Surpassed 75M daily users Q1 2026, cites from different source pool than AI Overviews
CREATE TABLE google_ai_mode_results (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id          UUID REFERENCES audits(id) ON DELETE CASCADE,
  brand_id          UUID NOT NULL REFERENCES brands(id),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  prompt            TEXT NOT NULL,
  brand_appeared    BOOLEAN NOT NULL,
  brand_position    INTEGER,
  sub_queries_shown JSONB,   -- fan-out sub-queries Google AI Mode surfaced
  raw_response      TEXT,
  run_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Column additions to Phase 1 citations table (nullable — safe migration)

```sql
-- [GAP 4] Citation source type intelligence
-- 97.4% of AI citations from non-Tier-1 earned media (Profound Dec 2025–Jan 2026)
-- Reddit = 24% of Perplexity; LinkedIn = #2 overall, #1 for professional queries
ALTER TABLE citations
  ADD COLUMN IF NOT EXISTS cited_source_type           TEXT,
  -- 'reddit_thread' | 'linkedin_post' | 'youtube_video' | 'wikipedia'
  -- 'news_article' | 'au_directory' | 'brand_owned' | 'review_site' | 'other'
  ADD COLUMN IF NOT EXISTS cited_source_engine_affinity TEXT;
  -- which engine tends to cite this source type most
  -- 'chatgpt_primary' | 'perplexity_primary' | 'gemini_primary' | 'all' | null
```

### Column additions to Phase 1 notification_preferences table (nullable — safe migration)

```sql
-- NP-01 fix (v8.30): Phase 2 introduces THREE new alert types beyond Phase 1's drift alert
-- (hallucination, consensus, volatility — see alert-composer.ts). Phase 1's notification_preferences
-- pattern (Sprint 9 GD2) is ONE boolean per notification type (emailOnDrift, emailOnAuditComplete,
-- emailOnScheduleFailure). Gating all four alert types on the single emailOnDrift toggle is wrong:
-- a user who disables drift emails would silently lose CRITICAL hallucination alerts, and a user who
-- wants only hallucination alerts cannot separate them. Add one nullable boolean per new alert type,
-- following the Phase 1 per-type pattern. Nullable + DEFAULT so existing rows are safe (no backfill).
ALTER TABLE notification_preferences
  ADD COLUMN IF NOT EXISTS email_on_hallucination BOOLEAN DEFAULT true,
  -- DEFAULT true: a factual error about the brand in an AI answer is the most critical alert
  -- (mirrors emailOnScheduleFailure DEFAULT true — important events default ON).
  ADD COLUMN IF NOT EXISTS email_on_consensus     BOOLEAN DEFAULT false,
  -- DEFAULT false: cross-platform consistency is informational (mirrors emailOnAuditComplete).
  ADD COLUMN IF NOT EXISTS email_on_volatility    BOOLEAN DEFAULT false;
  -- DEFAULT false: citation-source volatility is informational, can be noisy.
  -- Drizzle camelCase: emailOnHallucination, emailOnConsensus, emailOnVolatility.
  -- NULL (existing rows before backfill) is treated as the column DEFAULT by the alert gate
  -- (COALESCE(email_on_hallucination, true) etc.) so legacy orgs still get critical alerts.
```

### Column additions to Phase 1 vertical_pack_prompts table (nullable — safe migration)

```sql
-- PERSONA LAYER (AthenaHQ review finding — their Enterprise-only differentiator;
-- VisibleAU ships it on Growth+ tier from Phase 2 Sprint 9 Adaptive UX)
ALTER TABLE vertical_pack_prompts
  ADD COLUMN IF NOT EXISTS persona_tag TEXT;
  -- Nullable. NULL = prompt applies to all personas (the vast majority of prompts).
  -- Only ~40 of 336 prompts across 3 verticals are persona-specific.
  -- Existing rows: all default to NULL — zero breakage to Phase 1 queries.
  -- All Phase 2 Inngest functions: no change — they filter WHERE retiredAt IS NULL
  --   which continues to work; persona_tag IS NULL rows are included (correct behaviour).
  --
  -- VALID VALUES per vertical:
  --   SaaS:         'cto' | 'developer' | 'founder' | 'marketing_director'
  --   Tradies:      'homeowner' | 'property_manager' | 'builder'
  --   Allied Health:'patient' | 'referrer' | 'employer'
  --
  -- EXAMPLES of persona-specific prompts (seed files updated in Phase 2 Sprint 1):
  --   au-saas.ts:          "best CRM for CTOs"              → persona_tag = 'cto'
  --   au-saas.ts:          "AI tools for developers"        → persona_tag = 'developer'
  --   au-tradies.ts:       "tradie for investment property" → persona_tag = 'property_manager'
  --   au-allied-health.ts: "physio covered by employer"     → persona_tag = 'employer'
  --
  -- DRIZZLE SCHEMA (add to db/schema/vertical-pack-prompts.ts):
  --   personaTag: text('persona_tag'),
  --   // 'cto'|'developer'|'founder'|'marketing_director'  (SaaS)
  --   // 'homeowner'|'property_manager'|'builder'           (Tradies)
  --   // 'patient'|'referrer'|'employer'                    (Allied Health)
  --   // null = applies to all personas
  --
  -- UI (Phase 2 Sprint 9 — Adaptive Segment-Aware UX, Growth+ tier):
  --   Prompt results tab shows a "Persona" dropdown filter.
  --   Selecting 'CTO' filters audit results to prompts WHERE persona_tag = 'cto' OR persona_tag IS NULL.
  --   Selecting 'All' (default) shows all prompts regardless of persona_tag.
  --   Locked with upgrade CTA for Starter/Free: "See how AI describes your brand to each buyer type → Growth"

-- BRANDED INTENT LAYER (Semrush AI Toolkit review finding — Semrush calls this "Narrative Drivers":
-- splitting brand performance into branded vs non-branded mentions to separate loyalty signals
-- from awareness signals. e.g. "Warby Parker reviews" = branded; "best glasses for square faces" = non-branded)
ALTER TABLE vertical_pack_prompts
  ADD COLUMN IF NOT EXISTS branded_intent TEXT;
  -- Nullable. NULL = unknown or mixed (legacy prompts from Phase 1 seed files).
  -- 'non_branded'  — prompt contains no brand name reference; pure category/need query.
  --                  Examples: "best plumber Sydney", "emergency electrician near me",
  --                            "physio that bulk bills", "cheapest project management SaaS"
  --                  These = AWARENESS signals: does AI include you without being asked?
  -- 'branded'      — prompt contains {brandName} placeholder or direct brand reference.
  --                  Examples: "[brand] reviews", "[brand] vs [competitor]", "is [brand] licensed?"
  --                  These = LOYALTY signals: does AI describe you accurately when asked directly?
  -- 'semi_branded' — prompt references brand category with implied brand context.
  --                  Examples: "best plumber in [suburb]" (suggests local search with brand awareness),
  --                            "compare [vertical] services Sydney" (comparison with brand in mind)
  --
  -- DETECTION LOGIC (applied at seed file generation time, not at runtime):
  --   IF promptTemplate contains '{brandName}' → 'branded'
  --   ELSE IF promptTemplate contains suburb-level specifics → 'semi_branded'
  --   ELSE → 'non_branded'
  -- Roughly 90% of the 336 AU vertical pack prompts are non_branded.
  -- ~25 prompts are branded (canary-style checks of brand-direct queries).
  -- ~20 prompts are semi_branded (suburb-level queries).
  --
  -- WHY THIS MATTERS FOR AU SMES:
  -- A tradie seeing "AI mentioned you in 8% of non-branded prompts" understands acquisition.
  -- A tradie seeing "AI described you correctly in 91% of branded prompts" understands reputation.
  -- These are different business problems requiring different fixes.
  --
  -- UI (Phase 2 Sprint 9 — Growth+ tab alongside Persona and Buyer Stage dropdowns):
  --   "Intent" filter: All | Awareness (non-branded) | Reputation (branded)
  --   Non-branded score headline: "How often AI recommends you when buyers haven't heard of you"
  --   Branded score headline: "How accurately AI describes your brand when asked directly"
  --   Semrush charges Enterprise pricing for this insight.
  --   VisibleAU ships it on Growth (A$299/mo) — derivable from prompt template content.
  --
  -- DRIZZLE SCHEMA:
  --   brandedIntent: text('branded_intent'),
  --   // 'branded' | 'non_branded' | 'semi_branded' | null
  --
  -- SEED FILE UPDATE: db/seed/au-tradies.ts, au-allied-health.ts, au-saas.ts
  --   Add brandedIntent field to each prompt definition during Phase 2 Sprint 1.
  --   No migration for Phase 1 rows needed — NULL defaults to "include in all views" (correct).
  --
  -- SEED APPROACH (Phase 2 Sprint 1 — update existing seed files, not a new file):
  --   Only tag prompts that are EXPLICITLY persona-targeted in their wording.
  --   Generic prompts ("best plumber Sydney") stay NULL — they apply to all buyers.
  --   Estimated tags needed: ~15-20 SaaS, ~10-15 Tradies, ~10-12 Allied Health = ~40 rows total.

-- PROMPT SOURCE LAYER (danishashko OSS tracker review finding — Niche Explorer equivalent;
-- AF-01 fix v8.13: source column was documented as a SQL comment in Phase 1 table docs
-- but was missing from this SQL migration block. Fixed in v8.16 audit.)
ALTER TABLE vertical_pack_prompts
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'curated';
  -- 'curated'     = from the 336 AU base pack (default for all existing Phase 1 prompts)
  -- 'ai_suggested' = generated by the Niche Explorer LLM call during brand setup wizard
  -- 'custom'      = manually added by the user from their own prompt management
  --
  -- Existing 336 prompts: default to 'curated' — zero breakage, zero migration needed.
  -- No existing Phase 1 or Phase 2 query affected — source is additive read-only metadata.
  --
  -- DRIZZLE SCHEMA (add to db/schema/vertical-pack-prompts.ts):
  --   source: text('source').default('curated'),
  --   // 'curated' | 'ai_suggested' | 'custom'
  --
  -- UI: Sprint 9 Growth+ prompt results view gains "Source" filter:
  --   "All" | "VisibleAU curated" | "AI suggested" | "Custom"
  --   Agencies use this to separate VisibleAU's research from client-specific additions.
```

### New API routes

```
GET  /api/brands/[id]/share-of-voice   → SoV vs competitors by engine + category
GET  /api/brands/[id]/visibility-trend → rolling trend + Mention-Source Divide
GET  /api/brands/[id]/prompt-volume    → AU prompt volume for this vertical
GET  /api/brands/[id]/query-fan-out    → fan-out results per prompt (3-12 sub-queries)
GET  /api/brands/[id]/topical-gaps     → topic cluster gap analysis
GET  /api/brands/[id]/brand-mentions   → [GAP 14] web mention history by platform
-- NOTE (RT-01 fix v8.31): GET /api/brands/[id]/citation-sources is NOT declared here. It is a
-- Layer 3 / [GAP 4] endpoint (backed by citation_source_intelligence, a Layer 3 table) and is
-- declared once in the Layer 3 route block. Next.js App Router allows only ONE handler per path —
-- it was previously listed in both Layer 2 and Layer 3, which would collide. Canonical home: Layer 3.
GET  /api/organizations/[id]/portfolio → cross-brand visibility overview
```

### New Inngest functions

```typescript
// inngest/functions/calculate-share-of-voice.ts
// TRIGGER (PC-02 fix v8.45): listens on 'audit/complete'.
// Fires after each audit completes
// Computes per-engine SoV → inserts share_of_voice_snapshots
// SAMPLE ORG EXCLUSION (O-03 fix extension v8.24): this fires on EVERY audit, including the
// Sprint 10 synthetic sample audit (org.slug='sample', ChatGPT-only, auto-deleted 24h). Skip it:
//   const [org] = await db.select({ slug: organizations.slug }).from(organizations)
//     .innerJoin(brands, eq(brands.organizationId, organizations.id)).where(eq(brands.id, brandId));
//   if (org.slug === 'sample') return;  // do not write SoV analytics for the demo org
// (Also a Growth+ feature — the sample org is not a paying customer; no analytics owed.)

// inngest/functions/aggregate-visibility-trend.ts
// Cron: { cron: '0 20 * * 1' }  // Monday 20:00 UTC = Tuesday 07:00 AEDT (summer, UTC+11) or 06:00 AEST (winter, UTC+10)
// Phase 1 pattern: always specify cron in UTC. Display 'Tuesday morning' in UI; store UTC in code.
// Conflict check: Mon 20:00 UTC is safe (no Phase 1 crons at this time — see Sprint 12 JM3 schedule map).
// SAMPLE ORG EXCLUSION (O-03 fix): skip brands WHERE organizations.slug = 'sample'.
// Sprint 10 synthetic sample org (auto-deleted 24h) must never appear in trend aggregates.
//   Pattern: JOIN organizations ON brands.organization_id = organizations.id
//            WHERE organizations.slug != 'sample' OR organizations.slug IS NULL
// Aggregates audits → inserts (or UPSERTS) visibility_trends row
// UPSERT PATTERN (VT-01 fix v8.47): visibility_trends has UNIQUE(brand_id, period_label, period_type).
// If aggregate-visibility-trend.ts retries (Inngest step replay), plain INSERT fails.
// Use INSERT ... ON CONFLICT (brand_id, period_label, period_type) DO UPDATE SET
//   score_composite_avg   = EXCLUDED.score_composite_avg,
//   citation_rate         = EXCLUDED.citation_rate,
//   mention_rate          = EXCLUDED.mention_rate,
//   mention_source_ratio  = EXCLUDED.mention_source_ratio,
//   brand_archetype       = EXCLUDED.brand_archetype,
//   citation_volatility_score = EXCLUDED.citation_volatility_score,
//   updated_at            = now();
// This makes the cron safely idempotent — rerunning overwrites with latest data.
// WEBHOOK EMIT (WH-01c fix v8.47): after each visibility_trends INSERT, also emit:
//   inngest.send({ name: 'visibility/trend-updated', data: { organizationId, brandId, periodLabel } })
//   fanout-webhooks.ts maps → 'visibility.trend.updated'. One emit per brand per cron run.
// EMIT (AV-01 fix v8.45): after each visibility_trends INSERT, emit 'trend/aggregated' event
//   inngest.send({ name: 'trend/aggregated', data: { brandId, orgId, periodLabel, periodType } })
//   This triggers generate-narrative-report.ts (NR-01) to generate the monthly report.
//   Only emit when an active report_delivery_schedules row exists for this brand.
// EMPTY PERIOD HANDLING (EP-01 fix v8.43): if a brand has NO completed audits in the
// current period (new brand, or audit failures), DO NOT insert a row with zero values.
// Zero citation_rate would corrupt trend charts and trigger false Action Center alerts.
// Rule: SELECT COUNT(*) FROM audits WHERE brand_id=? AND status='complete'
//         AND created_at BETWEEN period_start AND period_end
//       If count = 0 → SKIP this brand for this period (no INSERT, no error).
//       If count > 0 → compute averages and INSERT as normal.
// This follows the same pattern as the minimum sample handling for citation_volatility_score.
// [GAP 9]  Calculates mention_rate, citation_rate, mention_source_ratio
//          Classifies brand_archetype from Mention-Source Divide quadrant
// [GAP 15] Calculates citation_volatility_score as std dev of citation_rate
//          across the last 12 completed audit runs for this brand
//          Flags brands with score >15.0 as volatile in Action Center

// inngest/functions/simulate-query-fan-out.ts  [GAP 1]
// TRIGGER (PC-06 fix v8.45): listens on 'audit/complete'. Tier gate: Growth+.
// Fires after each audit completes (Growth tier+)
// v3.0: expects 3-12 sub-queries per prompt (GPT-5.4 uses 10+)
// CONCURRENCY (CC-01 fix v8.40): cap simultaneous executions to prevent LLM rate-limit
// cascades when many brands complete audits simultaneously (e.g. Agency Pro bulk-run).
// Without a limit: 25 brands × 12 sub-queries × 4 engines = 1,200 concurrent LLM calls.
// Inngest concurrency config — add to createFunction options:
//   concurrency: { limit: 5 }   // max 5 fan-out runs at once across ALL orgs
// Reasoning: 5 × 48 = 240 max concurrent LLM calls — within provider tier limits.
// Inngest queues excess runs and executes as slots free (no data loss, no manual retry).
// BudgetPolicy remains the per-run cost gate; concurrency is the platform rate gate.
// SAMPLE ORG EXCLUSION (O-03 fix): skip audits WHERE organizations.slug = 'sample'.
// Sprint 10 synthetic sample org runs a real ChatGPT audit. simulate-query-fan-out.ts
// must skip it — fan-out on sample audits would consume LLM quota with zero customer value.
//   Pattern: check audit → brand → organization → if org.slug = 'sample': return early
// RETIRED PROMPT FILTER: when reading vertical_pack_prompts for the audit's vertical,
//   ALWAYS filter WHERE retired_at IS NULL (Phase 1 canonical — Sprint 5 pattern).
//   Retired prompts have retiredAt set; running fan-out against them produces stale results.
//   Query pattern:
//     const prompts = await db.select().from(verticalPackPrompts)
//       .innerJoin(verticalPacks, eq(verticalPackPrompts.packId, verticalPacks.id))
//       .where(and(
//         eq(verticalPacks.vertical, brand.vertical),
//         isNull(verticalPacks.retiredAt),       // ← REQUIRED: exclude retired packs
//         isNull(verticalPackPrompts.retiredAt),  // ← REQUIRED: exclude retired prompts
//       ));
// ENGINE GATE (Sprint 12 JD3): check isEngineEnabled() before dispatching to each engine.
// Phase 2 fan-out, journey, and comparison functions all make multi-engine LLM calls.
// If an engine is down, its env var is set false — skip it rather than fail the whole function:
//   import { isEngineEnabled } from '@/lib/feature-flags';
//   // isEngineEnabled (Sprint 12 JD3) takes PROVIDER names ('openai'|'anthropic'|'google'|
//   // 'perplexity') — these strings are already providers, so the 'as Engine' cast was wrong.
//   type Provider = 'openai' | 'anthropic' | 'google' | 'perplexity';
//   const providers: Provider[] = ['openai','anthropic','google','perplexity'];
//   const enabledProviders = providers.filter(p => isEngineEnabled(p));
//   // proceed with enabledProviders[] — may be empty if all disabled (rare; return early gracefully)
// COSINE SIMILARITY LIBRARY: use ml-distance (lightweight, no native deps):
//   pnpm add ml-distance
//   import { similarity } from 'ml-distance';
//   const score = similarity.cosine(brandVector, subQueryVector);
// Embeddings: use OpenAI text-embedding-3-small (cheapest, 1536 dims) via Vercel AI SDK:
//   import { embed } from 'ai'; import { openai } from '@ai-sdk/openai';
//   const { embedding } = await embed({ model: openai.embedding('text-embedding-3-small'), value: text });
// Embedding cost: ~0.002 cents per 1K tokens — negligible vs LLM audit cost
// Threshold: content_similarity_score > 0.88 → above_threshold = true (7.3× citation rate per GAP 1)
// Computes cosine similarity between brand content and each sub-query
// Stores in query_fan_out_results

// inngest/functions/calculate-topical-gaps.ts  [GAP 6]
// Cron: { cron: '0 21 * * 2' }  // Tuesday 21:00 UTC = Wed 08:00 AEDT (summer, UTC+11) / 07:00 AEST (winter, UTC+10) — stagger from visibility trend
// Scores brand vs all topic clusters in vertical
// Computes estimated_citation_impact per gap
// UPSERT PATTERN (TU-01 fix v8.49): topical_coverage_gaps has UNIQUE(brand_id, vertical, topic_cluster).
// This cron reruns weekly — plain INSERT fails on the second run for the same topic cluster.
// Use INSERT ... ON CONFLICT (brand_id, vertical, topic_cluster) DO UPDATE SET
//   coverage_score = EXCLUDED.coverage_score,
//   competitor_coverage = EXCLUDED.competitor_coverage,
//   estimated_citation_impact = EXCLUDED.estimated_citation_impact,
//   priority_rank = EXCLUDED.priority_rank,
//   updated_at = now();
// Makes the weekly gap recalculation idempotent.
// ACTION CENTER MECHANISM (TG-01 fix v8.46): direct DB INSERT into action_items
//   (Phase 1 pattern — same as run-audit.ts creating recommendations directly).
//   For each topical_coverage_gaps row WHERE priority_rank <= 3 (top gaps):
//     db.insert(actionItems).values({
//       organizationId, brandId,
//       title: `Close topic gap: ${gap.topic_label}`,
//       dimension: 'frequency',  // topical gaps affect frequency dimension
//       expectedImpactScore: gap.priority_rank === 1 ? 'high' : 'medium',
//       confidenceLabel: 'likely',
//       evidenceRefs: [gap.id],  // link back to the topical gap row
//       status: 'open',
//     })
//   No event emitted — direct INSERT is simpler and avoids another function hop.
// Triggers Action Center recommendations for critical gaps

// inngest/functions/classify-citation-sources.ts  [GAP 4]
// TRIGGER (PC-01 fix v8.45): listens on 'audit/complete' (Phase 1 canonical event).
// EMIT (CI-01 fix v8.45): after completing classification, emits 'citations/classified':
//   inngest.send({ name: 'citations/classified', data: { brandId, orgId, auditId } })
//   This triggers build-citation-source-intelligence.ts to aggregate the classified data.
// Fires after each audit completes
// Classifies cited_source_type on citations table
// Detects engine affinity patterns
// SAMPLE ORG EXCLUSION (O-03 fix extension v8.24): fires on EVERY audit including the Sprint 10
// sample audit. Skip when the audit's org.slug='sample' (same pattern as calculate-share-of-voice.ts)
// so citation_source_intelligence is never populated for the throwaway demo org.

// inngest/functions/track-brand-web-mentions.ts  [GAP 14]
// Scheduled weekly per brand
// CRON (CR-01 fix v8.50): { cron: '0 22 * * 4' } — Thu 22:00 UTC (collision-free slot)
// SCRAPING LIBRARY: Use fetch() + cheerio (HTML parsing) for Reddit/Quora.
//   Reddit: fetch `https://www.reddit.com/search.json?q={brandName}&sort=new&t=week` (JSON API, no auth needed for search)
//   YouTube: YouTube Data API v3 (YOUTUBE_API_KEY env var) — search.list endpoint
//   Quora: cheerio scrape (no official API) — respect robots.txt
//   ── RATE LIMITING (RL-01 fix v8.38) ──
//   Reddit JSON API: add 1 second delay between brand scrapes (await sleep(1000)).
//     Unofficial limit is ~60 req/min for the search.json endpoint. With up to 25 brands
//     (Agency Pro), back-to-back calls risk a 429. Inngest step.sleep('1s') pattern.
//   YouTube Data API v3: search.list costs 100 quota units per call.
//     10,000 units/day quota → max 100 searches/day. With 25 brands weekly (≈ 4/day),
//     total = 400 units/day — well within quota. No additional sleep needed.
//   Quora cheerio: add 2 second delay (await sleep(2000)) between requests — HTML scraping
//     without rate limiting triggers Cloudflare bot protection on Quora.
//   Implementation: wrap each brand's scrape in Inngest step.run('scrape-{brandId}', ...)
//     and use step.sleep('1s') between brand iterations inside the Inngest function.
//   Do NOT use Playwright here (too heavy for weekly background scrape; Playwright is for site audits)
//   Do NOT call LLM providers — this is web scraping, not LLM inference
//   pnpm add cheerio — already in package.json? Verify; if not, add to Phase 2 Sprint 3 setup step
// Reads brand.market_code → loads community platform seed list for that market
// AU_EN: r/australia, r/AusFinance, r/sydney, r/melbourne, r/brisbane,
//        r/tradie, r/AusLegal + vertical-specific subreddits
// NZ_EN (Phase 3): r/newzealand, r/auckland, r/wellington + NZ-specific
// UK_EN (Phase 3): r/unitedkingdom, r/london, r/AskUK + UK-specific
// Also searches YouTube, Quora, news sites for brand name in each market
// Classifies sentiment, checks Google index status, counts upvotes
// Flags any thread cited in recent audit results (engine_citation_seen):
//   After inserting brand_web_mentions rows, run a JOIN to check if any source_url
//   appears in recent citations.citedSources JSONB for this brand:
//   SELECT DISTINCT ON (bwm.id) bwm.id, c.engine
//   FROM brand_web_mentions bwm
//   JOIN citations c ON c.audit_id IN (
//     SELECT id FROM audits WHERE brand_id = $brandId ORDER BY created_at DESC LIMIT 10
//   )
//   WHERE c.cited_sources @> jsonb_build_array(jsonb_build_object('url', bwm.source_url))
//      OR c.cited_sources @> jsonb_build_array(jsonb_build_object('domain', bwm.source_domain))
//   If a match is found: UPDATE brand_web_mentions SET engine_citation_seen = c.engine WHERE id = bwm.id
//   citations.citedSources shape (from Phase 1 Sprint 2): [{ domain: string, url: string }]
// Inserts into brand_web_mentions with market_code populated
// [GAP 15] After insertion: recalculates citation_volatility_score on
//   visibility_trends using standard deviation of last 12 citation_rate values
```

### New lib/ module

```typescript
// lib/visibility/
├── share-of-voice.ts              // SoV calculation from citations
├── trend-aggregator.ts            // Weekly/monthly rollup + mention-source divide + volatility
├── mention-source-divide.ts       // [GAP 9]  Archetype classification + ratio
├── brand-mention-tracker.ts       // [GAP 14] Reddit/YouTube/Quora web mention tracking
├── volatility-scorer.ts           // [GAP 15] Std dev of citation_rate across 12 runs
├── prompt-volume.ts               // AU prompt volume lookup
├── volatility-detector.ts         // High-variance prompt detection (per-prompt, not trend-level)
├── query-fan-out.ts               // [GAP 1]  Fan-out simulation (3-12 sub-queries)
├── topical-gap-analyzer.ts        // [GAP 6]  Topic cluster gap calculation
├── citation-source-classifier.ts  // [GAP 4]  Classify source by type + affinity
└── index.ts
```

### Frontend additions

```
app/(auth)/brands/[brandId]/visibility/
├── page.tsx                        // Visibility Intelligence hub
├── share-of-voice/page.tsx         // SoV by engine + category + trend
├── trends/page.tsx                 // Multi-period trend chart + volatility score
├── mention-source/page.tsx         // [GAP 9]  2×2 Mention-Source matrix
├── brand-mentions/page.tsx         // [GAP 14] Web mention history by platform
├── query-fan-out/page.tsx          // [GAP 1]  Fan-out results per prompt
└── topical-gaps/page.tsx           // [GAP 6]  Topic cluster gap heatmap

components/domain/visibility/
├── sov-chart.tsx                   // Stacked bar: brand vs competitors
├── trend-sparkline.tsx             // 12-week rolling trend per dimension
├── mention-source-matrix.tsx       // [GAP 9]  2×2 quadrant: brand + competitors
├── archetype-badge.tsx             // [GAP 9]  'Recognised Authority' etc
├── volatility-badge.tsx            // Per-prompt high-variance indicator
├── volatility-score-card.tsx       // [GAP 15] Trend-level citation stability score
├── brand-mention-feed.tsx          // [GAP 14] Mention list: platform + sentiment + upvotes
├── brand-mention-score-card.tsx    // [GAP 14] Total mentions / Reddit share / cited count
├── reddit-subreddit-map.tsx        // [GAP 14] Community platform map: subreddits/forums by market_code + vertical
├── prompt-volume-card.tsx          // Topic volume + trend
├── fan-out-results.tsx             // [GAP 1]  Sub-query list + similarity
├── similarity-threshold-bar.tsx    // [GAP 1]  Score bar: red <0.88 green >=0.88
├── topical-gap-heatmap.tsx         // [GAP 6]  Covered vs gap clusters
├── citation-source-breakdown.tsx   // [GAP 4]  Source types by engine
└── google-ai-mode-card.tsx         // [GAP 5]  Stretch: AI Mode results
```

### Action Center integration

```
[GAP 1] "ChatGPT runs up to 12 sub-queries from 'best plumber Bondi'.
         You appear in 3 of 10 sub-queries run. Content similarity: 0.61
         (target >0.88 for 7x citation rate).
         Add a 150-word direct-answer section covering emergency call-outs,
         service areas, and after-hours pricing."

[GAP 6] "You cover 28 of 47 topic clusters for AU Tradies.
         Competitors cover 35-40.
         Top 3 uncovered topics = estimated 34% of available citations."

[GAP 9] "Mention-Source Divide: you are 'Known but Untrusted'.
         AI mentions you 34% of the time but only cites your URL 4% of the time.
         Fix: restructure top pages with listicle format + cited statistics."

[GAP 14] "Brand web mentions: 3 in the last 90 days.
          Your AU Tradies competitors average 47 mentions on Reddit alone.
          Reddit is the #1 cited source in 7 of 10 AU B2C verticals on ChatGPT.
          Brands with strong community presence have 4× higher AI citation rates.
          Recommended subreddits: r/australia, r/sydney, r/AusFinance,
          r/tradie. Start with 1 genuine helpful answer per week."

[GAP 14] "0 Reddit threads mentioning your brand are currently indexed by Google.
          Perplexity cites Reddit for 24% of all its answers.
          You are structurally absent from Perplexity's citation pool.
          Action: participate in r/[vertical] threads that match your service
          queries — using a 95/5 value-to-promotion ratio."

[GAP 15] "Citation Volatility: HIGH (score 22.4).
          Your average citation rate is 18% but swings between 4% and 32%.
          40-60% of AI citation sources change month-to-month industry-wide.
          High volatility means a single model update can halve your visibility.
          Fix: diversify citation sources — Reddit, LinkedIn, YouTube — so
          no single source type controls your AI presence."
```

---

## LAYER 3 — TRUST INTELLIGENCE

**What it is:** Hallucination detection, evidence archive, entity scoring,
citation source intelligence, LinkedIn Presence Intelligence, and
Cross-Platform Consensus Score.

**Phase 1 foundation used:**
- Sprint 3: `citations.isAccurate`, `citations.hallucinationFlags`,
  `citations.sentimentLabel`, `citations.contextSnippets`
- Sprint 7: AU Brand & Entity scoring (ABN, Wikipedia, AU TLD, directories)
- Sprint 8: drift alerts

### New tables

```sql
-- Hallucination incidents — logged whenever AI gets brand wrong
-- DESIGN NOTE: Phase 1 `citations` table already has `is_accurate BOOLEAN` + `hallucination_flags JSONB`.
-- These Phase 1 columns flag inaccuracies at the citation level (raw detection).
-- hallucination_incidents is a HIGHER-LEVEL table: tracked, named, acknowledged incidents
-- with severity classification, correct_value, and audit trail. Different scope.
-- A single citation with is_accurate=false may spawn 0 or 1 hallucination_incidents rows
-- depending on whether the content team chooses to formally track the error.
--
-- UI FRAMING — "KNOWLEDGE GAPS" (AthenaHQ review finding):
-- AthenaHQ calls these "knowledge gaps" rather than "hallucinations".
-- The distinction matters for customer psychology and actionability:
--   WRONG framing: "AI hallucinated about your brand" → customer feels helpless
--   RIGHT framing: "AI filled a gap in your content with a guess" → customer can act
--
-- CUSTOMER-FACING UI RULES (applies to all screens reading hallucination_incidents):
--   1. Page/section title: "Knowledge Gaps" — never "Hallucinations" in customer UI
--   2. Each row displayed as:
--      "AI is stating [incorrect_claim] about your brand.
--       This happens because [your content] doesn't authoritatively cover [claim_type topic].
--       Fix: [content action from remediation_tasks]"
--   3. Severity badge: 'critical' → "Urgent", 'warning' → "Review", 'info' → "Monitor"
--   4. is_false_positive=true rows shown as "Resolved — AI now has correct information"
--   5. Internal/developer naming: keep hallucination_incidents everywhere in code/schema.
--      UI copy only uses "Knowledge Gap" — the table name and API response key stay unchanged.
CREATE TABLE hallucination_incidents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id            UUID NOT NULL REFERENCES brands(id),
  organization_id     UUID NOT NULL REFERENCES organizations(id),
  citation_id         UUID REFERENCES citations(id) ON DELETE SET NULL,
  -- SET NULL (HI-01 fix v8.30): hallucination incidents are TRUST records — evidence that an AI
  -- engine stated a factual error about the brand. They are the SAME class as evidence_snapshots
  -- (Layer 3), which uses ON DELETE SET NULL and is EXCLUDED from the 12-month retention cron
  -- precisely so trust/compliance history survives. CASCADE here was inconsistent: it destroyed the
  -- incident when audit-data-retention.ts purges citations at 12 months, losing the AU compliance
  -- record (e.g. "ChatGPT misstated our registration N times in 2026" — the AHPRA/Medibank use case).
  -- citation_id is nullable, so SET NULL is valid; the incident's own columns (engine,
  -- incorrect_claim, correct_value, severity, claim_type) preserve it independently of the citation.
  -- NOTE: like evidence_snapshots, hallucination_incidents should be EXCLUDED from the retention
  -- cron's delete (it is brand-scoped, not audit-scoped — it has no audit_id — so the cron does not
  -- reach it directly; this SET NULL only governs the citation-purge path).
  engine              TEXT NOT NULL,
  prompt              TEXT NOT NULL,
  incorrect_claim     TEXT NOT NULL,
  correct_value       TEXT,
  claim_type          TEXT NOT NULL,
  -- 'wrong_price' | 'wrong_location' | 'wrong_product'
  -- 'wrong_founder' | 'competitor_confusion' | 'other'
  severity            TEXT NOT NULL,   -- 'critical' | 'warning' | 'info'
  is_acknowledged     BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at     TIMESTAMPTZ,
  acknowledged_by     UUID REFERENCES users(id),  -- users.id is UUID (T6 fix, Foundations v1.12)
  is_false_positive   BOOLEAN NOT NULL DEFAULT false,
  -- Set when team determines the AI was actually correct (brand's data was stale/wrong).
  -- PATCH /api/brands/[id]/hallucinations/[id] with { is_false_positive: true } closes it
  -- without creating a content correction task. Separate from is_acknowledged (which just
  -- records that the team saw it). A row can be: acknowledged=true + is_false_positive=false
  -- (genuine error being tracked) OR acknowledged=true + is_false_positive=true (dismissed).
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()  -- set on acknowledge PATCH
);
CREATE INDEX hallucination_brand_idx ON hallucination_incidents(brand_id, created_at DESC);
-- TR-1 "Hallucination Risk" card derivation (CT-04 v8.63 — canonical; CM-01/Q-03 precedent):
--   The /100 risk shown on the Trust hub is DERIVED AT READ TIME — there is NO risk column.
--   risk = LEAST(100, 15 × open_critical + 5 × open_warning + 1 × open_info)
--   where "open" = is_false_positive = false (only a false-positive determination closes an
--   incident; is_acknowledged does NOT — acknowledging records that the team saw it, the
--   factual error still stands until corrected and re-verified). Weights: one unresolved
--   critical is substantial (≈7 saturate the scale), warning = 1/3 of critical, info nominal.
--   Computed in lib/trust/hallucination-risk.ts (pure function over the brand's open rows);
--   "Lower is better (0 = safe)". Prototype fixture: 1 critical + 1 warning open → 20.
--   Do NOT add a risk column — timestamps/flags are the source of truth (same pattern as
--   generated_reports' derived status, CM-01).

-- Immutable evidence archive — never deleted
-- DESIGN NOTE: citations.raw_response already stores the full LLM response.
-- evidence_snapshots is NOT a duplicate — it is the legal-grade immutable archive.
-- citations table is operational (can be pruned/archived in Phase 3).
-- evidence_snapshots rows are NEVER deleted per privacy policy and serve as
-- the audit trail for agency clients and compliance purposes.
-- Only Agency tier+ creates evidence_snapshots rows (cost control).
-- RETENTION CONFLICT NOTE: Sprint 12 audit-data-retention.ts deletes audits+citations
-- older than 12 months (JH4 fix). evidence_snapshots is the LEGAL-GRADE immutable archive
-- and is explicitly EXCLUDED from the retention cron.
-- FK design: audit_id uses ON DELETE SET NULL so deletion of old audits does not cascade.
-- The raw_response + score_at_capture columns preserve the snapshot independently.
--
-- PHASE 1 DEPENDENCY NOTE (E-03 completion — verify before relying on Phase 2 CASCADE behaviour):
-- The Phase 2 audit_id ON DELETE clauses (CASCADE on per-audit analytics; SET NULL here and on
-- remediation_tasks/generated_reports) only fire when audit-data-retention.ts actually DELETEs
-- audits. That cron filters audits.status — Sprint 2 canonical writes status='complete' but the
-- Sprint 12 retention cron as drafted filters eq(audits.status,'completed') (-ed). If that Phase 1
-- mismatch is not reconciled, the retention cron matches ZERO rows and never deletes any audit,
-- so none of the Phase 2 CASCADE/SET NULL paths ever execute. Phase 2 build MUST verify the
-- Sprint 12 cron uses the SAME spelling as Sprint 2 ('complete') before trusting retention cleanup.
-- The Sprint 12 retention cron MUST NOT DELETE evidence_snapshots rows (add exclusion guard).
CREATE TABLE evidence_snapshots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID NOT NULL REFERENCES brands(id),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  audit_id          UUID REFERENCES audits(id) ON DELETE SET NULL,  -- nullable: survives audit deletion
  engine            TEXT NOT NULL,
  prompt            TEXT NOT NULL,
  raw_response      TEXT NOT NULL,
  score_at_capture  NUMERIC(5,2),
  captured_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- brand_entity_scores — Phase 1 Sprint 7 table (ALREADY EXISTS, do not recreate)
-- Phase 1 columns: abn_verified BOOLEAN NOT NULL DEFAULT false, abn_number TEXT,
--   abn_entity_name TEXT, abn_status TEXT, wikipedia_au_present BOOLEAN NOT NULL DEFAULT false,
--   wikipedia_au_url TEXT, wikipedia_au_mentions INTEGER NOT NULL DEFAULT 0,
--   au_tld_domains JSONB NOT NULL DEFAULT '[]', au_directory_presence JSONB NOT NULL DEFAULT '[]',
--   score_of_10 NUMERIC(5,2), checked_at TIMESTAMPTZ NOT NULL
-- Phase 1 has NO organization_id column (RLS enforced via JOIN to brands).
-- Phase 2 extends with ALTER TABLE — all nullable, zero Phase 1 breakage.
-- market_code drives which registry API + which directory seed list to use.
-- Multi-region: AU_EN only in Phase 2; NZ_EN/UK_EN via new seed rows in Phase 3.
-- local_seo_results (Sprint 8) is a different table — GMB/NAP/suburb crawler;
--   brand_entity_scores is monthly AI-visibility entity scoring. Do NOT merge them.
ALTER TABLE brand_entity_scores
  ADD COLUMN IF NOT EXISTS organization_id    UUID REFERENCES organizations(id),
  -- Backfill: UPDATE brand_entity_scores SET organization_id = brands.organization_id
  --   FROM brands WHERE brand_entity_scores.brand_id = brands.id;
  ADD COLUMN IF NOT EXISTS market_code        TEXT DEFAULT 'AU_EN',
  -- 'AU_EN' | 'NZ_EN' | 'UK_EN' — drives which registry + directories to check
  -- Phase 1 abn_verified already handles AU ABN; Phase 2 adds multi-region equivalents:
  ADD COLUMN IF NOT EXISTS local_reg_verified BOOLEAN,
  -- AU: ABN (already in abn_verified) | NZ: NZBN | UK: Companies House
  -- local_reg_verified is the market-agnostic flag; abn_verified keeps working for AU
  ADD COLUMN IF NOT EXISTS local_reg_number   TEXT,         -- registration number found
  -- Phase 2 directory fields (expand Phase 1 au_directory_presence JSONB with typed columns)
  -- Phase 1 au_directory_presence JSONB captures this generically; Phase 2 adds typed cols:
  ADD COLUMN IF NOT EXISTS hipages_present         BOOLEAN,
  ADD COLUMN IF NOT EXISTS hipages_rating          NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS yellow_pages_present    BOOLEAN,
  ADD COLUMN IF NOT EXISTS service_seeking_present BOOLEAN,
  ADD COLUMN IF NOT EXISTS word_of_mouth_present   BOOLEAN,
  ADD COLUMN IF NOT EXISTS word_of_mouth_rating    NUMERIC(3,2),
  ADD COLUMN IF NOT EXISTS local_directory_count   INTEGER,
  ADD COLUMN IF NOT EXISTS local_directory_details JSONB,
  -- [{ name, present, rating }] — market-specific; replaces au_directory_presence JSONB for Phase 2+
  -- Phase 1 au_directory_presence JSONB continues to work; Phase 2 populates both
  ADD COLUMN IF NOT EXISTS wikipedia_local_present BOOLEAN,
  -- market-agnostic: Wikipedia article for this market's language (AU_EN → en.wikipedia.org)
  -- Phase 1 wikipedia_au_present BOOLEAN continues; wikipedia_local_present generalises it
  ADD COLUMN IF NOT EXISTS wikipedia_local_url     TEXT,
  ADD COLUMN IF NOT EXISTS au_tld_present          BOOLEAN,
  -- .com.au domain check (typed flag alongside Phase 1 au_tld_domains JSONB)
  -- entity_score NOT added: Phase 1 already has score_of_10 NUMERIC(5,2) which IS the entity score.
  -- score_of_10 stores 7.2 style decimal (/10); adding entity_score INTEGER would duplicate it.
  -- Phase 2 UI reads score_of_10 directly. (D-01 fix, v6.2)
  -- [GAP 11] Knowledge Graph / Knowledge Panel check
  -- Source: Jason Barnard Algorithmic Trinity framework, Jan 2026
  ADD COLUMN IF NOT EXISTS knowledge_panel_present BOOLEAN,
  ADD COLUMN IF NOT EXISTS knowledge_panel_accurate BOOLEAN,
  ADD COLUMN IF NOT EXISTS knowledge_panel_url     TEXT,
  -- [GAP 13] Wikidata entry check
  -- Wikidata corroborates entity facts used by AI engines
  ADD COLUMN IF NOT EXISTS wikidata_entry_present  BOOLEAN,
  ADD COLUMN IF NOT EXISTS wikidata_entry_url      TEXT;
-- Note: scored_at is NOT added — Phase 1 already has checked_at TIMESTAMPTZ NOT NULL.
-- Phase 2 Inngest `refresh-entity-score` writes to checked_at (existing column).
CREATE INDEX IF NOT EXISTS brand_entity_market_idx
  ON brand_entity_scores(brand_id, market_code, checked_at DESC);

-- [GAP 4] Citation Source Intelligence — aggregated per brand per engine
CREATE TABLE citation_source_intelligence (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id                  UUID NOT NULL REFERENCES brands(id),
  organization_id           UUID NOT NULL REFERENCES organizations(id),
  audit_id                  UUID REFERENCES audits(id) ON DELETE CASCADE,
  -- CASCADE (E-03 completion fix): per-audit citation analytics, deleted with audit at 12mo retention.
  -- Without ON DELETE, audit-data-retention.ts (Sprint 12) DELETE audits would fail with FK violation.
  engine                    TEXT NOT NULL,
  source_type               TEXT NOT NULL,
  -- 'reddit_thread' | 'linkedin_post' | 'youtube_video' | 'wikipedia'
  -- 'news_article' | 'au_directory' | 'brand_owned' | 'review_site' | 'other'
  citation_count            INTEGER NOT NULL,
  citation_share            NUMERIC(5,2),
  brand_present_in_source   BOOLEAN NOT NULL,
  gap_severity              TEXT NOT NULL,
  -- 'critical' (>20% citations, brand absent)
  -- 'warning' (10-20%, brand absent)
  -- 'opportunity' (<10%, brand absent)
  -- 'covered' (brand present)
  market_benchmark          JSONB,
  -- { avgCitationShare, source, engine } from Profound Jan 2026
  source_affinity_note      TEXT,
  -- WHY THIS SOURCE TYPE GETS CITED (Peec AI review finding — G2 reviewer:
  -- "I'd love more insights about how LLMs pick their sources").
  -- Static lookup seeded once per source_type in Phase 2 Sprint 3.
  -- Not computed per brand — applies across all brands in the same source_type.
  --
  -- Seed values (db/seed/citation-source-affinity.ts):
  --   'reddit_thread' → "ChatGPT cites Reddit threads with ≥50 upvotes and expert replies.
  --                      Target r/tradies, r/AusFinance, r/australia. Post genuine expert answers.
  --                      Threads with professional flair get 3× more citations. Perplexity
  --                      favours threads posted <6 months ago."
  --   'au_directory'  → "Perplexity and Google AI Overviews cite AU directories for
  --                      location-based service queries. Complete Hipages/YPAU/ServiceSeeking
  --                      profiles with recent reviews perform best."
  --   'wikipedia'     → "All engines cite Wikipedia for entity definition prompts. A Wikipedia AU
  --                      article with ABN-verified facts is the highest-value single citation asset."
  --   'linkedin_post' → "Claude cites LinkedIn long-form articles (800+ words) by verified experts
  --                      for professional service queries. Short posts underperform."
  --   'news_article'  → "AI Overviews and Gemini cite AU news (SMH, AFR, trade publications)
  --                      for topical authority. A quote in AU news beats 10 blog posts."
  --   'youtube_video' → "Perplexity and ChatGPT cite YouTube how-to and comparison videos
  --                      with transcripts and chapter markers. AU tradie how-to videos have
  --                      very low AI citation competition."
  --   'review_site'   → "Gemini and AI Overviews cite G2/Capterra/Productreview.com.au for
  --                      comparison prompts. 4.5+ rating with ≥10 reviews is the threshold."
  --   'brand_owned'   → "All engines cite brand pages with FAQ/HowTo/Organisation schema.
  --                      Answer capsule format (question H2 + 20-25 word answer) is the
  --                      strongest predictor of AI self-citation."
  --
  -- UI (Sprint 9 citation sources panel, Growth+):
  --   Each source type card: citation_count + gap_severity + source_affinity_note
  --   "Why does r/tradies get cited? [note]. What should you do? [outreach_brief CTA]"
  --   This closes the #1 complaint across Peec/Profound/Scrunch reviews:
  --   "The tool shows what's happening but not why or what to do about it."
  calculated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
  -- UNIQUE CONSTRAINT NOTE: audit_id is nullable (aggregates may not be tied to a specific audit).
  -- PostgreSQL NULL != NULL in UNIQUE constraints — UNIQUE(brand_id, audit_id, engine, source_type)
  -- would allow multiple rows with audit_id=NULL for the same brand+engine+source_type.
  -- Use TWO partial indexes instead:
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),  -- set on UPSERT write; J-01 fix (v6.7)
);

-- Rows tied to a specific audit: enforce uniqueness when audit_id IS NOT NULL
CREATE UNIQUE INDEX csi_unique_with_audit
  ON citation_source_intelligence(brand_id, audit_id, engine, source_type)
  WHERE audit_id IS NOT NULL;
-- Aggregate rows (no specific audit): enforce uniqueness when audit_id IS NULL
CREATE UNIQUE INDEX csi_unique_aggregate
  ON citation_source_intelligence(brand_id, engine, source_type)
  WHERE audit_id IS NULL;
CREATE INDEX csi_brand_engine_idx ON citation_source_intelligence(brand_id, engine, calculated_at DESC);

-- [GAP 7] LinkedIn Presence Intelligence
-- LinkedIn is #1 cited domain for professional queries across all 6 AI platforms
-- (Profound Q1 2026). 59% of citations from individual creators, not company pages.
-- 95% from original posts. Articles 500-2,000 words get most citations.
CREATE TABLE linkedin_presence_audits (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id                    UUID NOT NULL REFERENCES brands(id),
  organization_id             UUID NOT NULL REFERENCES organizations(id),
  market_code                 TEXT NOT NULL DEFAULT 'AU_EN',
  -- 'AU_EN' | 'NZ_EN' | 'UK_EN'
  -- LinkedIn is global — this field controls vertical benchmarks and
  -- recommendation copy for this market. No scraping change needed.
  -- Company page
  company_page_url            TEXT,
  company_page_exists         BOOLEAN,
  company_page_followers      INTEGER,
  company_page_last_post_date DATE,
  company_posts_30d           INTEGER,          -- posts in last 30 days
  company_articles_count      INTEGER,          -- lifetime article count
  -- Founder / practitioner profile
  -- 59% of ChatGPT + AI Mode citations from individual creators
  founder_profile_url         TEXT,
  founder_profile_exists      BOOLEAN,
  founder_followers           INTEGER,          -- threshold: >2,000
  founder_posts_30d           INTEGER,          -- threshold: ≥5 per 4 weeks
  founder_articles_count      INTEGER,
  founder_articles_500plus    INTEGER,          -- articles 500-2,000 words (citation sweet spot)
  -- Content quality
  knowledge_sharing_ratio     NUMERIC(4,3),     -- target: >0.54 (54% knowledge posts)
  original_content_ratio      NUMERIC(4,3),     -- target: >0.95 (95% original vs reshare)
  semantic_relevance_score    NUMERIC(4,3),     -- 0-1: do posts use brand's core terminology?
  -- Score + gaps
  presence_score              INTEGER,          -- /100
  -- presence_score formula (lib/trust/linkedin-auditor.ts):
  --   Company page section (max 30pts):
  --     company_page_exists(15) + company_posts_30d>=4(10) + company_articles_count>=2(5)
  --   Founder/practitioner section (max 40pts):
  --     founder_profile_exists(10) + founder_followers>=2000(10)
  --     + founder_posts_30d>=5(10) + founder_articles_500plus>=2(10)
  --   Content quality section (max 30pts):
  --     knowledge_sharing_ratio>=0.54(15) + original_content_ratio>=0.95(10)
  --     + semantic_relevance_score>=0.7(5)
  --   Source thresholds: Profound Q1 2026 (59% citations from individual creators,
  --   95% from original posts, 500-2000 word articles = citation sweet spot)
  gaps                        JSONB,
  -- [{ dimension, issue, recommendation, priority }]
  audited_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX linkedin_brand_idx ON linkedin_presence_audits(brand_id, audited_at DESC);

-- [GAP 10] Cross-Platform Consensus Score
-- AI citation confidence increases when brand facts are consistent
-- across multiple independent source types
-- Top 10 domains take 46% of ChatGPT citations — these have strong consensus
CREATE TABLE brand_consensus_checks (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id                UUID NOT NULL REFERENCES brands(id),
  organization_id         UUID NOT NULL REFERENCES organizations(id),
  market_code             TEXT NOT NULL DEFAULT 'AU_EN',
  -- 'AU_EN' | 'NZ_EN' | 'UK_EN' — drives which source types are relevant
  source_type             TEXT NOT NULL,
  -- 'website' | 'google_business_profile' | 'local_directory' | 'linkedin'
  -- 'reddit' | 'wikipedia' | 'review_site'
  -- Note: 'au_directory' → 'local_directory' for multi-region clarity
  -- Specific directory names stored in source_url; market_code identifies which market
  source_url              TEXT,
  name_match              BOOLEAN,    -- is brand name consistent here?
  service_match           BOOLEAN,    -- is core service description consistent?
  location_match          BOOLEAN,    -- is location / service area consistent?
  price_positioning       TEXT,       -- 'premium' | 'mid' | 'budget' | 'not_stated'
  differentiators_match   BOOLEAN,
  consistency_score       INTEGER,    -- /100 for this source
  discrepancies           JSONB,
  -- [{ field: 'name', this_source: 'electrical contractor',
  --    website_value: 'licensed electrician' }]
  checked_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),  -- set on UPSERT write; J-01 fix (v6.7)
  UNIQUE(brand_id, source_type)
  -- UPSERT NOTE: check-cross-platform-consensus.ts must use ON CONFLICT to avoid duplicate errors.
  -- Each monthly re-check updates the existing row rather than inserting a new one:
  --   INSERT INTO brand_consensus_checks (...) VALUES (...)
  --   ON CONFLICT (brand_id, source_type) DO UPDATE SET
  --     name_match = EXCLUDED.name_match,
  --     service_match = EXCLUDED.service_match,
  --     location_match = EXCLUDED.location_match,
  --     price_positioning = EXCLUDED.price_positioning,
  --     differentiators_match = EXCLUDED.differentiators_match,
  --     consistency_score = EXCLUDED.consistency_score,
  --     discrepancies = EXCLUDED.discrepancies,
  --     checked_at = EXCLUDED.checked_at;
  -- This preserves the row history-free (latest check only). For full history, add a
  -- brand_consensus_history table in Phase 3.
);
CREATE INDEX consensus_brand_idx ON brand_consensus_checks(brand_id, checked_at DESC);

-- [GAP 16] YouTube Presence Intelligence
-- Sources: OtterlyAI YouTube GEO Study (March 2026), Ahrefs 75K brand study,
--          Neil Patel AI Overview citations research, StudioHawk AU (April 2026)
-- YouTube is #1 cited domain in Google AI Overviews (~30% share, BrightEdge)
-- YouTube mentions correlate with AI visibility at r=0.737 — strongest predictor
-- in Ahrefs dataset, stronger than backlinks, domain authority, or brand mentions
-- How-to citations in AI Overviews up 414% overall; visual demos up 592% (Dec 2025)
-- 94% of YouTube AI citations go to LONG-FORM video (not Shorts) — OtterlyAI
-- 78% of timestamped videos get cited multiple times across 2-5 chapters
-- Citation drives: Perplexity 38.7%, AI Overviews 36.6%, AI Mode 19.6% = 95% total
-- ChatGPT only 4.4% — different mechanism (needs text on embedding page)
-- KEY ENGINE DIFFERENCE: Only Gemini can "watch" a video natively.
--   ChatGPT, Perplexity, Claude all rely on transcript text on the embedding page.
--   VideoObject schema on the embedding page is the highest-value AEO surface.
-- Views/subscribers have near-zero correlation with AI citation frequency (r=-0.03)
-- Description length + chapter structure = strongest predictors of AI citation
-- AU: how-to and instructional content is #1 cited video type for local services
CREATE TABLE youtube_presence_audits (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id                  UUID NOT NULL REFERENCES brands(id),
  organization_id           UUID NOT NULL REFERENCES organizations(id),
  market_code               TEXT NOT NULL DEFAULT 'AU_EN',
  -- Channel basics
  channel_url               TEXT,
  channel_exists            BOOLEAN,
  channel_subscriber_count  INTEGER,       -- note: weak predictor of AI citations
  channel_total_videos      INTEGER,
  -- Long-form vs Shorts breakdown
  longform_video_count      INTEGER,       -- >3 min; these drive 94% of AI citations
  shorts_count              INTEGER,       -- <60s; minimal AI citation value
  longform_ratio            NUMERIC(4,3),  -- target: >0.70 (70%+ long-form)
  -- Content type analysis
  howto_video_count         INTEGER,       -- how-to/tutorial videos — #1 citation type
  -- How-to citations in AI Overviews up 414% (Neil Patel Dec 2025)
  explainer_video_count     INTEGER,       -- explainer/educational videos
  brand_topic_video_count   INTEGER,       -- videos directly about brand's service area
  -- Transcript and chapter quality — STRONGEST citation predictors
  videos_with_transcript    INTEGER,       -- manually corrected transcripts preferred
  videos_with_chapters      INTEGER,       -- timestamped chapters (00:00 Format)
  -- 78% of timestamped videos cited multiple times across 2-5 chapters
  avg_chapter_count         NUMERIC(4,1),  -- avg chapters per long-form video; target ≥5
  avg_description_length    INTEGER,       -- in words; longer = stronger citation predictor
  -- VideoObject schema on embedding pages
  -- Embedding a video on your own site with VideoObject schema is the
  -- highest-value AEO surface — gives ChatGPT/Claude/Perplexity the text to cite
  embedding_pages_count     INTEGER,       -- blog posts embedding YouTube videos
  embedding_pages_with_schema INTEGER,     -- of those, how many have VideoObject schema
  embedding_pages_with_transcript INTEGER, -- of those, how many include full transcript text
  -- AI citation signals
  any_video_cited_in_audit  BOOLEAN,       -- has VisibleAU detected any YouTube URL in citations?
  cited_video_urls          JSONB,         -- array of YouTube URLs seen cited in audits
  -- Score and gaps
  presence_score            INTEGER,       -- /100
  -- presence_score formula (lib/trust/youtube-auditor.ts):
  --   Channel existence section (max 15pts):
  --     channel_exists(15) — if absent, score=0, all other dimensions skipped
  --   Content volume section (max 20pts):
  --     longform_ratio>=0.70(10) + howto_video_count>=3(10)
  --   Transcript/chapter quality section (max 35pts) — strongest citation predictors:
  --     videos_with_chapters>=3(15) + avg_chapter_count>=5(10)
  --     + videos_with_transcript>=2(10)
  --   Embedding + schema section (max 20pts):
  --     embedding_pages_count>=1(10) + embedding_pages_with_schema>=1(10)
  --   AI citation signal (max 10pts):
  --     any_video_cited_in_audit=true(10)
  --   Source: OtterlyAI YouTube GEO Study March 2026; Neil Patel AI Overview citations;
  --   YouTube is #1 cited domain in Google AI Overviews (~30% share, BrightEdge)
  gaps                      JSONB,
  -- [{ dimension, issue, recommendation, priority }]
  audited_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX youtube_brand_idx ON youtube_presence_audits(brand_id, audited_at DESC);
```

### New API routes

```
GET  /api/brands/[id]/trust                 → trust intelligence summary
GET  /api/brands/[id]/hallucinations        → hallucination incidents
PATCH /api/brands/[id]/hallucinations/[id]  → acknowledge incident
GET  /api/brands/[id]/evidence              → immutable evidence archive
GET  /api/brands/[id]/entity-score          → AU entity authority score
POST /api/brands/[id]/entity-score/refresh  → trigger fresh check (registry + Wikipedia + directories + Knowledge Panel + Wikidata)
GET  /api/brands/[id]/citation-sources      → [GAP 4] source intelligence
GET  /api/brands/[id]/linkedin-presence     → [GAP 7]  LinkedIn audit results
POST /api/brands/[id]/linkedin-presence/refresh → trigger fresh audit
GET  /api/brands/[id]/consensus-score       → [GAP 10] cross-platform consistency
POST /api/brands/[id]/consensus-score/refresh   → trigger fresh check
GET  /api/brands/[id]/youtube-presence      → [GAP 16] YouTube audit results
POST /api/brands/[id]/youtube-presence/refresh  → trigger fresh audit
```

EMIT (S8-01 fix v8.68 — fanout producer at source): the PATCH `/api/brands/[id]/hallucinations/[id]`
route, when it sets `is_acknowledged = true`, MUST emit the internal slash-event
`hallucination/acknowledged` so fanout-webhooks.ts can deliver it (the WH-01 map at the Sprint 8
webhook spec lists this event but the producer side must exist at source, or it is
configurable-but-undeliverable — the same class as the WH-01c emit already inlined in
aggregate-visibility-trend.ts for `visibility/trend-updated`):
```typescript
//   await inngest.send({ name: 'hallucination/acknowledged',
//     data: { organizationId, brandId, incidentId } });   // carry organizationId for fanout RLS/scoping
```
One emit per acknowledge action. Internal event keeps the slash delimiter; fanout maps it to the
external `hallucination.acknowledged`. (The companion `visibility/trend-updated` producer emit
already lives inline in aggregate-visibility-trend.ts's spec; together they complete the two
fanout events whose producers the WH-01 review found documented only in the consumer map.)

### New Inngest functions

```typescript
// inngest/functions/detect-hallucinations.ts
// WEBHOOK EMIT (WH-01b fix v8.47; severity corrected v8.67): for each hallucination_incident INSERT with severity='critical'|'warning':
//   inngest.send({ name: 'hallucination/detected', data: { organizationId, brandId, incidentId } })
//   fanout-webhooks.ts maps → 'hallucination.detected'. Only critical+warning to avoid alert fatigue.
// TRIGGER (PC-03 fix v8.45): listens on 'audit/complete'.
// Fires after each audit; creates hallucination_incidents; sends critical alerts
// IMPLEMENTATION (lib/trust/hallucination-detector.ts):
//   1. Read all citations WHERE audit_id=$auditId AND is_accurate=false
//   2. For each inaccurate citation, classify claim_type via keyword rules on incorrect_claim TEXT:
//      'wrong_price'         → LLM mentioned a price/cost/fee that doesn't match brand's pricing page
//      'wrong_location'      → LLM stated a location/suburb/address not matching brand records
//      'wrong_product'       → LLM described a product/service the brand doesn't offer
//      'wrong_founder'       → LLM named a founder/owner not matching ABN/about page
//      'competitor_confusion'→ LLM attributed competitor's product/price/location to this brand
//      'other'               → doesn't match any pattern above
//      Classification: simple keyword regex on citation.hallucinationFlags JSONB (Phase 1 field):
//        if flags include 'price_mismatch' → 'wrong_price'
//        if flags include 'location_mismatch' → 'wrong_location'
//        if flags include 'competitor_mention' → 'competitor_confusion'
//        else → 'other' (human review needed)
//   3. Severity: 'critical' if claim_type in ('wrong_price','wrong_founder','competitor_confusion')
//               'warning'  if claim_type in ('wrong_product','wrong_location')
//               'info'     if claim_type == 'other'
//   4. INSERT hallucination_incidents row; send alert email for critical+warning severity

// inngest/functions/capture-evidence-snapshot.ts
// TRIGGER (PC-04 fix v8.45): listens on 'audit/complete'. Tier gate: Agency+ only.
// Fires after each audit (Agency tier+); immutable archive, 12mo retention

// inngest/functions/refresh-entity-score.ts  (Phase 2 NEW — runs ALONGSIDE Sprint 7's technical-audit-run.ts)
// TRIGGER (RE-01 fix v8.44): listens on 'technical-audit/complete' Inngest event (internal slash).
// Sprint 7 technical-audit-run.ts emits 'technical-audit.complete' for webhooks AND
// 'technical-audit/complete' (slash) for internal function chaining.
// Ensure Sprint 7 technical-audit-run.ts emits BOTH:
//   inngest.send({ name: 'technical-audit.complete', data: { brandId, orgId, auditId } }); // webhook
//   inngest.send({ name: 'technical-audit/complete', data: { brandId, orgId, auditId } }); // internal
// refresh-entity-score.ts listens on 'technical-audit/complete' (internal slash only).
// Sprint 7 `technical-audit-run.ts` already scores brand_entity_scores AU signals (ABN, Wikipedia AU,
//   au_tld_domains, au_directory_presence, score_of_10) as part of the technical audit.
// This function EXTENDS that scoring monthly with AI-visibility signals not covered by Sprint 7:
//   - market_code-driven registry check (AU: ABN Lookup, NZ: NZBN, UK: Companies House)
//   - market-specific directory typed columns (hipages_present, yellow_pages_present, etc)
//   - [GAP 11] Google Knowledge Panel presence + accuracy check
//   - [GAP 13] Wikidata entry lookup
// Sprint 7 continues to write score_of_10 + checked_at on technical audit runs.
// Phase 2 writes the new nullable AU/market columns (NOT entity_score — that was the D-01 duplicate,
// removed; Phase 1 score_of_10 remains the canonical entity score). Phase 2 + Phase 1 cols coexist on the row.
// Do NOT duplicate Sprint 7's ABN check — read abn_verified (Phase 1) before rechecking.
// [GAP 11] Google Knowledge Panel check via SERP + structured data APIs
//   → writes knowledge_panel_present, knowledge_panel_accurate, knowledge_panel_url
// [GAP 13] Wikidata entry lookup via Wikidata API (entity name + domain search)
//   → writes wikidata_entry_present, wikidata_entry_url
// Entity score is Priority 1 for SMB + tradie segments (86% citations controllable)

// inngest/functions/build-citation-source-intelligence.ts  [GAP 4]
// TRIGGER (CI-02 fix v8.45): listens on 'citations/classified' (emitted by classify-citation-sources.ts).
// Not 'audit/complete' directly — must wait for classification to finish first.
// Fires after classify-citation-sources completes
// Groups citations by source type per engine, computes gap_severity

// inngest/functions/audit-linkedin-presence.ts  [GAP 7]
// Scheduled monthly per brand
// CRON (CR-01 fix v8.50): { cron: '0 3 2 * *' } — 2nd of month 03:00 UTC
// DATA SOURCE: LinkedIn data is collected via the following approach (within ToS):
//   1. Company page: fetch linkedin.com/company/{slug} as a public page (no auth needed for public data)
//      Cheerio parses: follower count (in og:description or structured data), last post date, post count
//      Note: LinkedIn rate-limits aggressive scraping — respect crawl delays; use brand-provided slug
//   2. Founder/practitioner: public profile fetch linkedin.com/in/{slug} (brand provides the URL)
//      Parse: connection count (if public), recent post dates, article titles (public activity feed)
//   3. LinkedIn API alternative: if brand connects their LinkedIn Company Page (oauth flow added in Phase 3),
//      use LinkedIn Marketing API for accurate follower/engagement data
//   Phase 2: public page scraping only (brand provides company_page_url + founder_profile_url).
//   Fields that require auth (exact follower counts, engagement rates) stored as NULL if unavailable.
//   knowledge_sharing_ratio, original_content_ratio: computed from last 20 visible public posts.
// pnpm add cheerio — verify in package.json (added for brand-mention-tracker.ts)
// Scores presence /100, identifies gaps, triggers Action Center recommendations
// 'linkedin_company_page' | 'linkedin_founder_profile' | 'linkedin_articles'
// | 'linkedin_posting_frequency' | 'linkedin_content_mix'

// inngest/functions/check-cross-platform-consensus.ts  [GAP 10]
// Scheduled monthly per brand
// CRON (CR-01 fix v8.50): { cron: '0 3 4 * *' } — 4th of month 03:00 UTC
// Checks brand name, service, location, positioning across all source types
// Calculates consistency_score, flags discrepancies
// UPSERT PATTERN (CU-01 fix v8.49): brand_consensus_checks has UNIQUE(brand_id, source_type)
// (per L-01 fix). Monthly cron — plain INSERT fails on the second month for the same source_type.
// Use INSERT ... ON CONFLICT (brand_id, source_type) DO UPDATE SET
//   consistency_score = EXCLUDED.consistency_score,
//   discrepancies = EXCLUDED.discrepancies,
//   nap_data = EXCLUDED.nap_data,
//   updated_at = now();
// Makes the monthly consensus check idempotent.
// Triggers Action Center alert if score < 70

// inngest/functions/audit-youtube-presence.ts  [GAP 16]
// Scheduled monthly per brand
// CRON (CR-01 fix v8.50): { cron: '0 3 3 * *' } — 3rd of month 03:00 UTC
// DATA SOURCE: YouTube Data API v3 (YOUTUBE_API_KEY env var — documented in K-05)
//   Step 1: Resolve channel URL → channel ID
//     GET https://www.googleapis.com/youtube/v3/channels
//       ?part=snippet,statistics,contentDetails&forHandle={handle}&key={YOUTUBE_API_KEY}
//     Extracts: channel_subscriber_count, channel_total_videos, uploads playlist ID
//   Step 2: Fetch recent videos (up to 50)
//     GET https://www.googleapis.com/youtube/v3/playlistItems
//       ?part=snippet&playlistId={uploadsPlaylistId}&maxResults=50&key={YOUTUBE_API_KEY}
//   Step 3: Per-video details (batch up to 50 IDs)
//     GET https://www.googleapis.com/youtube/v3/videos
//       ?part=snippet,contentDetails&id={videoIds}&key={YOUTUBE_API_KEY}
//     Extracts: duration (→ longform >180s vs shorts <60s), description length,
//               chapter markers (timestamps in description), category (how-to = category 26)
//   Step 4: Check embedding pages for VideoObject schema — use brand's sitemap or
//           content_structure_audits rows to find pages with YouTube iframes
// Counts long-form vs Shorts, how-to videos, transcript quality
// Checks chapter structure: avg_chapter_count target ≥5 per long-form video
// Checks embedding pages for VideoObject schema + full transcript text
// Cross-references cited_video_urls from recent audit citations table
// Stores in youtube_presence_audits
// Triggers Action Center recommendations for critical gaps
```

### New lib/ module

```typescript
// lib/trust/
├── hallucination-detector.ts      // Classify inaccuracies by type + severity
├── entity-checker.ts              // Registry lookup (ABN/NZBN/Companies House by market_code), Wikipedia, directories
├── knowledge-panel-checker.ts     // [GAP 11] Google Knowledge Panel check + accuracy
├── wikidata-checker.ts            // [GAP 13] Wikidata entry lookup + URL extraction
├── evidence-archiver.ts           // Immutable snapshot creation + retention
├── trust-scorer.ts                // Aggregate trust signal → score
├── citation-intelligence.ts       // [GAP 4]  Source type gap analysis
├── linkedin-auditor.ts            // [GAP 7]  LinkedIn presence checking + scoring
├── consensus-checker.ts           // [GAP 10] Cross-source consistency checker
├── youtube-auditor.ts             // [GAP 16] YouTube channel + video + schema audit
└── index.ts
```

### Frontend additions

```
app/(auth)/brands/[brandId]/trust/
├── page.tsx                         // Trust Intelligence hub
├── hallucinations/page.tsx          // Incident list + acknowledge
├── evidence/page.tsx                // Snapshot archive + export
├── citation-sources/page.tsx        // [GAP 4]  Source type by engine
├── linkedin-presence/page.tsx       // [GAP 7]  LinkedIn audit results
├── consensus/page.tsx               // [GAP 10] Consistency across sources
├── entity-score/page.tsx            // [GAP 11/13] Knowledge Panel + Wikidata status
└── youtube-presence/page.tsx        // [GAP 16] YouTube channel + video audit

components/domain/trust/
├── trust-score-card.tsx
├── hallucination-incident-row.tsx
├── evidence-snapshot-row.tsx
├── entity-authority-grid.tsx        // Registry (ABN/NZBN/Companies House) / Wikipedia / local directories
├── knowledge-panel-card.tsx         // [GAP 11] Panel present / accurate / URL
├── wikidata-status-card.tsx         // [GAP 13] Entry present / URL / link
├── source-gap-card.tsx              // [GAP 4]  Critical source type gap
├── linkedin-presence-scorecard.tsx  // [GAP 7]  Score + company + founder
├── linkedin-gap-row.tsx             // [GAP 7]  Each gap with recommendation
├── consensus-discrepancy-card.tsx   // [GAP 10] Inconsistency flagged
├── youtube-presence-scorecard.tsx   // [GAP 16] Score + channel stats + gaps
├── youtube-video-audit-row.tsx      // [GAP 16] Per-video: chapters / transcript / schema
└── youtube-gap-card.tsx             // [GAP 16] Critical gap with recommendation
```

### Action Center integration (new types for Layer 3)

```
[GAP 7] Priority 1 for professional + B2B brands:
  "LinkedIn Presence: 23/100.
   LinkedIn is #1 cited domain for professional queries on ChatGPT.
   Your company page exists but has no articles.
   Recommendation: Publish one 500-2,000 word article per month.
   Content type: knowledge-sharing posts score 59% higher for AU allied health."

[GAP 7] "Your founder has no LinkedIn profile.
   59% of ChatGPT + AI Mode LinkedIn citations come from individual
   creators, not company pages. Create a founder profile + post 5x per month."

[GAP 10] "Cross-Platform Consensus: 54/100.
   Your website says 'licensed electrician' but your Hipages profile
   says 'electrical contractor'. AI models treat these as different entities.
   Update Hipages to match website terminology."

[GAP 10] "Your GBP phone number differs from your website.
   NAP inconsistency reduces citation confidence for local queries.
   Update Google Business Profile to match website."

Entity scoring — Priority 1 for SMB + local tradie:
   "AU Directory presence: 1 of 4 directories.
   86% of AI citations come from sources you already control or can claim.
   Add your business to Hipages, Yellow Pages AU, ServiceSeeking."

[GAP 11] "No Google Knowledge Panel found for your brand.
   AI systems — ChatGPT, Gemini, Perplexity — pull from Search Engines,
   LLMs, and Knowledge Graphs simultaneously (Algorithmic Trinity).
   Without a panel, all three engines treat your brand with lower confidence.
   Priority fixes: claim your Google Business Profile, add Organisation
   schema to your About page, build a Wikipedia AU stub or Wikidata entry."

[GAP 11] "Knowledge Panel found but contains inaccurate information.
   Detected mismatch: [field]. This directly causes AI hallucinations.
   Fix: update your Google Business Profile and About page schema so
   Google's Knowledge Graph reflects the correct information."

[GAP 13] "No Wikidata entry found for your brand.
   Wikidata is a machine-readable corroboration source that AI engines
   use to verify entity facts. A Wikidata entry with sameAs links to
   your website, LinkedIn, and ABN registry significantly increases
   citation confidence.
   Action: VisibleAU can generate a Wikidata stub for your review."

[GAP 16] Priority 1 for ALL verticals — YouTube is #1 cited domain in Google AI Overviews:
  "No YouTube channel found for your brand.
   YouTube mentions correlate with AI visibility at r=0.737 — stronger than
   any other signal including backlinks and brand web mentions.
   YouTube citations in AI Overviews increased 414% in 2025.
   Start with 1 long-form how-to video per month targeting your top service queries.
   AU Tradies: 'How to [service] in [suburb]' — exact match to buyer queries."

[GAP 16] "YouTube channel exists but 84% of your videos are Shorts.
   94% of AI citations go to long-form video (>3 min) — not Shorts.
   Shorts have minimal AI citation value.
   Recommendation: Convert your top 3 query topics into 5-10 min explainer videos."

[GAP 16] "Your long-form videos have no chapter timestamps.
   78% of timestamped videos get cited multiple times across 2-5 chapters.
   Add timestamps to all long-form videos (format: 00:00 Introduction).
   Target: ≥5 chapters per video covering distinct service topics."

[GAP 16] "HIGHEST PRIORITY: No blog posts embed your YouTube videos with
   VideoObject schema and full transcript.
   Only Gemini can 'watch' a video natively. ChatGPT, Perplexity, and Claude
   rely entirely on the text of your embedding page to cite your video content.
   A blog post with VideoObject schema + full transcript gives all 4 engines
   the text they need to cite your video as an AI source.
   This is the single highest-value YouTube AEO action you can take."
```

---

## LAYER 4 — CONVERSATIONAL DISCOVERY INTELLIGENCE

**What it is:** Multi-turn conversation journeys, buyer stage mapping,
competitor comparison prompts.

**Phase 1 foundation used:**
- Sprint 5: vertical pack prompts with category and topic fields
- Sprint 3: citations with prompt and contextSnippets

### New tables

```sql
CREATE TABLE conversation_journeys (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id            UUID NOT NULL REFERENCES brands(id),
  organization_id     UUID NOT NULL REFERENCES organizations(id),
  journey_name        TEXT NOT NULL,
  vertical            TEXT NOT NULL,
  -- Valid values match Phase 1 verticalEnum: 'tradies' | 'allied_health' | 'saas'
  -- v1.1 adds: 'professional_services' | 'real_estate'. Use CHECK constraint in migration.
  buyer_stage         TEXT NOT NULL,   -- 'awareness' | 'consideration' | 'decision'
  prompt_sequence     JSONB NOT NULL,
  -- (PS-01 fix v8.50; path corrected v8.57) TypeScript interface (lib/conversational/types.ts)
  -- — EB5/TS-01 pattern. (lib namespace is conversational/, per the lib tree; discovery/ is the
  -- route + component namespace only.)
  -- run-journey.ts reads this to know what to ask each turn; must be typed, not `any`.
  -- export interface JourneyTurn {
  --   turn:   number;                                              // 1-indexed sequence position
  --   prompt: string;                                              // may contain {brandName} placeholder
  --   intent: 'awareness' | 'followup' | 'compare' | 'decide';
  -- }
  -- Column type cast: prompt_sequence as JourneyTurn[]
  -- Validation (Zod, on journey create): z.array(JourneyTurnSchema).min(2).max(8)
  -- Shape: Array of turn objects:
  -- [{ turn: 1, prompt: string, intent: 'awareness'|'followup'|'compare'|'decide' }, ...]
  -- Minimum 2 turns, maximum 8 turns. Prompts reference {brandName} placeholder substituted at run time.
  -- Example: [{ turn: 1, prompt: 'What are the best plumbers in Sydney?', intent: 'awareness' },
  --            { turn: 2, prompt: 'Tell me more about {brandName}', intent: 'followup' }]
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()  -- set on is_active toggle or prompt_sequence edit
);

CREATE TABLE journey_run_results (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id                  UUID NOT NULL REFERENCES conversation_journeys(id) ON DELETE CASCADE,
  -- CASCADE (E-03b fix v8.23): journey_id is NOT NULL (required parent). If a journey definition
  -- is deleted, its run results are orphaned analytics with no meaning → delete them with the journey.
  -- SET NULL is impossible here because the column is NOT NULL, so CASCADE is the only valid choice.
  brand_id                    UUID NOT NULL REFERENCES brands(id),
  organization_id             UUID NOT NULL REFERENCES organizations(id),
  engine                      TEXT NOT NULL,
  run_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  turn_results                JSONB NOT NULL,
  -- [{ turn, prompt, brand_mentioned, position, context_label, competitors_mentioned }]
  brand_appeared_in_n_turns   INTEGER NOT NULL,
  total_turns                 INTEGER NOT NULL,
  journey_score               NUMERIC(5,2),
  -- journey_score formula (lib/conversational/journey-scorer.ts):
  --   Base score: (brand_appeared_in_n_turns / total_turns) × 100
  --   Early mention bonus: if first_mention_turn == 1: +10 pts; turn 2: +5 pts; turn 3+: no bonus
  --   Cap at 100.0
  --   Example: appeared in 3 of 5 turns, first mentioned at turn 1:
  --     (3/5 × 100) + 10 = 70.0
  --   Rationale: brand mentioned in turn 1 of an awareness journey = highest-value signal;
  --   AI cites it unprompted. First mention at turn 3+ = reactive, lower value.
  first_mention_turn          INTEGER
);
CREATE INDEX journey_results_brand_idx   ON journey_run_results(brand_id, run_at DESC);
CREATE INDEX journey_results_journey_idx ON journey_run_results(journey_id, run_at DESC);
-- brand_idx: GET /api/brands/[id]/journeys — list all journey runs for a brand
-- journey_idx: GET /api/brands/[id]/journeys/[journeyId]/runs — turns of specific journey

CREATE TABLE comparison_prompt_results (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id              UUID NOT NULL REFERENCES brands(id),
  organization_id       UUID NOT NULL REFERENCES organizations(id),
  audit_id              UUID REFERENCES audits(id) ON DELETE CASCADE,
  -- CASCADE (E-03 completion fix): per-audit comparison analytics, deleted with audit at 12mo retention.
  -- Without ON DELETE, audit-data-retention.ts (Sprint 12) DELETE audits would fail with FK violation.
  competitor_domain     TEXT NOT NULL,
  prompt                TEXT NOT NULL,
  engine                TEXT NOT NULL,
  brand_won             BOOLEAN,
  brand_mentioned       BOOLEAN NOT NULL,
  competitor_mentioned  BOOLEAN NOT NULL,
  verdict_snippet       TEXT,
  run_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX comparison_brand_idx  ON comparison_prompt_results(brand_id, run_at DESC);
CREATE INDEX comparison_audit_idx  ON comparison_prompt_results(audit_id);
CREATE INDEX comparison_competitor_idx ON comparison_prompt_results(brand_id, competitor_domain, run_at DESC);
-- brand_idx: GET /api/brands/[id]/competitive-benchmark — all comparison results for a brand
-- audit_idx: JOIN from audits → comparison results for a specific audit
-- competitor_idx: filter by specific competitor in benchmark workspace
```

### New API routes

```
GET  /api/brands/[id]/journeys               → active journeys list
POST /api/brands/[id]/journeys               → create journey (Agency+ — v8.19 regated journey UX from Growth+)
POST /api/brands/[id]/journeys/[id]/run      → execute journey
GET  /api/brands/[id]/journeys/[id]/results  → journey history
GET  /api/brands/[id]/comparisons            → competitor comparison results
```

### New Inngest functions

```typescript
// inngest/functions/run-journey.ts
// Multi-turn conversation against engines; stores in journey_run_results
// CONCURRENCY (CC-03 fix v8.41): Agency+ only (Agency Pro max 25 brands).
// Each journey = 5 turns × 4 engines = 20 LLM calls. 25 × 20 = 500 without limit.
// Add to createFunction options: concurrency: { limit: 3 }
// 3 × 20 = 60 max concurrent LLM calls. Journey runs are longer (multi-turn) so a
// lower limit than fan-out is appropriate to avoid starving the audit queue.
// ENGINE GATE (Sprint 12 JD3): check isEngineEnabled() before dispatching to each engine.
// Journey runs make multi-engine LLM calls — if an engine is disabled via env var,
// skip it rather than erroring:
//   import { isEngineEnabled } from '@/lib/feature-flags';
//   // isEngineEnabled (Sprint 12 JD3) takes PROVIDER names ('openai'|'anthropic'|'google'|
//   // 'perplexity') matching the LLM_ENGINE_*_ENABLED env vars — NOT engine names. Map first:
//   const ENGINE_TO_PROVIDER = { chatgpt:'openai', claude:'anthropic', gemini:'google', perplexity:'perplexity' } as const;
//   const engines = (['chatgpt','claude','gemini','perplexity'] as Engine[])
//     .filter(e => isEngineEnabled(ENGINE_TO_PROVIDER[e]));
//   // Keep Engine names for journey_run_results.engine writes; gate on the mapped provider name.
// A journey run against 0 enabled engines should log a warning and return early.
// STEP STRUCTURE (SN-01 fix v8.43): journey runs MUST use step.run() per engine per turn.
// Without steps: failure at turn 4 restarts ALL 20 LLM calls from scratch (quota waste).
// Step naming MUST be STABLE (deterministic) for Inngest replay — use fixed identifiers:
//   await step.run('turn-1-chatgpt', async () => { /* turn 1 for chatgpt */ });
//   await step.run('turn-1-claude',  async () => { /* turn 1 for claude  */ });
//   await step.run('turn-2-chatgpt', async () => { /* turn 2 for chatgpt */ });
//   ... etc.
// NEVER use dynamic step names like `turn-${turnNum}-${engine}` if turnNum or engine
// could change — but in this case turn number + engine name are fixed per journey,
// so template literals are safe: `step.run(\`turn-${i}-${engine}\`, ...)` is valid
// provided i and engine are deterministic across retries (they are — from journey definition).
// Store each turn result immediately after step.run completes (within the step closure)
// so a retry skips already-completed steps.

// inngest/functions/run-comparison-prompts.ts
// TRIGGER (PC-05 fix v8.45): listens on 'audit/complete'.
// Fires after audit; runs '[Competitor] vs [Brand]' prompts
// CONCURRENCY (CC-02 fix v8.41): cap simultaneous runs — same pattern as CC-01 for fan-out.
// Agency Pro: 25 brands × 3 competitors × 4 engines = 300 concurrent LLM calls without limit.
// Add to createFunction options: concurrency: { limit: 3 }
// 3 × (3 competitors × 4 engines) = 36 max concurrent LLM calls. Safe within provider limits.
// ENGINE GATE (Sprint 12 JD3): check isEngineEnabled() before dispatching to each engine.
// Comparison prompts run against the brand's TIER_ENGINES (Growth+ = 4; Free/Starter = 2) — gate each:
//   import { isEngineEnabled } from '@/lib/feature-flags';
//   // isEngineEnabled (Sprint 12 JD3) takes PROVIDER names, NOT engine names — map first:
//   const ENGINE_TO_PROVIDER = { chatgpt:'openai', claude:'anthropic', gemini:'google', perplexity:'perplexity' } as const;
//   const tierEngines = (brand.tier === 'growth' || higher)
//     ? (['chatgpt','claude','gemini','perplexity'] as Engine[])
//     : (['chatgpt','perplexity'] as Engine[]);  // Free/Starter = ChatGPT + Perplexity (TIER_ENGINES)
//   const engines = tierEngines.filter(e => isEngineEnabled(ENGINE_TO_PROVIDER[e]));
// COMPETITOR SOURCE: reads brands.competitors TEXT[] (Phase 1 column, set at brand creation).
//   const brand = await db.select({ competitors: brands.competitors }).from(brands).where(eq(brands.id, brandId));
//   for (const competitorDomain of brand.competitors) {
//     // run prompts for each competitor, insert into comparison_prompt_results
//   }
// Only runs if brand.competitors is non-empty. Tier gate: Growth tier+ (see tier gate table above).
// LLM calls go through LLMService.complete() with task='brand_mention' — same as audit flow.
// STEP STRUCTURE (S7b-02 fix v8.68 — same class as run-journey's SN-01): without step.run(),
// all (competitors × engines) LLM calls are one atomic step — a failure on the last engine
// restarts ALL of them, wasting quota and prolonging the user-facing delay (Agency Pro: up to
// 3 competitors × 4 engines = 12 calls per brand). Wrap each competitor×engine LLM call in its
// own step.run with a DETERMINISTIC template-literal name so Inngest replays only the failed
// step on retry:
//   for (const competitorDomain of brand.competitors) {
//     for (const engine of engines) {
//       const result = await step.run(`compare-${competitorDomain}-${engine}`, async () => {
//         return LLMService.complete({ task: 'brand_mention', engine, /* prompt */ });
//       });
//       // persist this competitor×engine row in its OWN step so the INSERT is retry-idempotent
//       await step.run(`persist-${competitorDomain}-${engine}`, async () => {
//         return db.insert(comparisonPromptResults).values({ /* ...result */ });
//       });
//     }
//   }
// Step names are deterministic (competitor domain + engine from brand.competitors × the fixed
// engine list), so template-literal names are safe across retries — Inngest replays correctly.
// (This mirrors run-journey's 'turn-{i}-{engine}' / 'persist-{engine}' pattern; SN-01 + S7b-01.)
```

### New lib/ module

```typescript
// lib/conversational/
├── journey-runner.ts        // Multi-turn prompt execution
├── journey-scorer.ts        // Score brand across conversation turns
├── comparison-runner.ts     // Head-to-head competitor prompts
├── intent-classifier.ts     // Classify prompts by buyer stage
└── index.ts
```

### Frontend additions

```
app/(auth)/brands/[brandId]/discovery/
├── page.tsx             // Conversational Discovery hub
├── journeys/page.tsx    // Journey list + results
└── comparisons/page.tsx // Competitor comparison results

components/domain/discovery/
├── journey-flow-chart.tsx
├── journey-result-card.tsx
└── comparison-verdict-card.tsx
```

---

## LAYER 5 — WORKFLOW INTELLIGENCE

**What it is:** Converts audit insights into executed tasks. Assign, draft,
approve, validate. Extended with Content Format recommendations and fan-out
gap targeting.

**Phase 1 foundation used:**
- Sprint 6: action_items, recommendations tables
- Sprint 8: drift detection

### New tables

```sql
CREATE TABLE remediation_tasks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id              UUID NOT NULL REFERENCES brands(id),
  organization_id       UUID NOT NULL REFERENCES organizations(id),
  recommendation_id     UUID REFERENCES recommendations(id) ON DELETE SET NULL,
  -- SET NULL (E-03b fix v8.23): a remediation task OUTLIVES its source. If the source recommendation
  -- is deleted, keep the task and null the link (the task tracks ongoing remediation work).
  fan_out_gap_id        UUID,
  -- BUILD ORDER (BD-01 fix v8.35): fan_out_gap_id references query_fan_out_results (Sprint 3
  -- table). Sprint 2 migration MUST create this column as plain UUID (no FK constraint) —
  -- Postgres will reject REFERENCES to a table that doesn't exist yet. Sprint 3 migration adds
  -- the FK constraint via: ALTER TABLE remediation_tasks ADD CONSTRAINT fk_fan_out_gap
  --   FOREIGN KEY (fan_out_gap_id) REFERENCES query_fan_out_results(id) ON DELETE SET NULL;
  -- SET NULL (E-03b fix v8.23): query_fan_out_results CASCADE-deletes when its audit is purged
  -- (v8.21 fix). Without ON DELETE here, that cascade would hit a FK violation and BLOCK the audit
  -- deletion entirely — crashing audit-data-retention.ts. SET NULL keeps the task, nulls the link.
  topical_gap_id        UUID,
  -- BUILD ORDER (BD-01 fix v8.35): topical_gap_id references topical_coverage_gaps (Sprint 3
  -- table). Same pattern as fan_out_gap_id above — create as plain UUID in Sprint 2, add FK
  -- constraint in Sprint 3 migration:
  --   ALTER TABLE remediation_tasks ADD CONSTRAINT fk_topical_gap
  --     FOREIGN KEY (topical_gap_id) REFERENCES topical_coverage_gaps(id) ON DELETE SET NULL;
  -- SET NULL (E-03b fix v8.23): topical_coverage_gaps rows are recomputed/replaced weekly. When an
  -- old gap row is deleted, keep the task and null the link rather than blocking the delete.
  linkedin_gap_source   TEXT,
  -- (SC-01 fix v8.38): Value format is a gap type slug, NOT a UUID or row ID.
  -- Valid values: 'missing_company_page' | 'low_follower_count' | 'missing_showcase_page' |
  --               'no_employee_advocacy' | 'incomplete_about_section'
  -- Set by: score-linkedin-presence.ts when creating remediation_tasks for LinkedIn gaps.
  -- Used by: action-center UI to show "LinkedIn gap: missing company page" in task context.
  consensus_gap_source  TEXT,
  -- (SC-01 fix v8.38): Value format is a discrepancy type slug, NOT a UUID.
  -- Valid values: 'nap_mismatch' | 'category_mismatch' | 'hours_mismatch' |
  --               'phone_mismatch' | 'address_mismatch' | 'name_variation'
  -- Set by: run-consensus-check.ts when brand info conflicts across platforms.
  -- Used by: action-center UI to show "Consensus issue: NAP mismatch" in task context.
  title                 TEXT NOT NULL,
  description           TEXT,
  status                TEXT NOT NULL DEFAULT 'open',
  -- 'open' | 'in_progress' | 'ready_for_review' | 'complete' | 'wont_fix'
  confidence_label      TEXT,
  -- 'High' | 'Medium' | 'Low' | null
  --
  -- DERIVATION (lib/workflow/priority-scorer.ts, set at task creation and after re-audit):
  --   Sourced from the parent audit's quality_status (O-02 fix):
  --     'sufficient'    → 'High'   — confident: show this prominently, no caveats
  --     'partial'       → 'Medium' — show with a soft note: "based on partial data"
  --     'insufficient'  → 'Low'    — show with a clear note: "more audits will improve this"
  --     'pending'       → null     — task is too new to have a confidence label yet
  --
  -- For gap-spawned tasks (no parent recommendation):
  --   Use the visibility_trends.sample_quality for the brand's most recent trend period.
  --   'Confirmed' → 'High' | 'Likely' → 'Medium' | 'Hypothesis' → 'Low' | null → null
  --
  -- DESIGN INTENT (revenue and profit are the goal; CX and reputation are the pillars):
  --
  --   confidence_label drives revenue through two mechanisms:
  --     1. Audit consumption: 'Low confidence' tasks display a note —
  --        "Run a few more audits to strengthen this recommendation."
  --        This is a direct prompt to consume more audits, which is the
  --        primary usage metric on Growth and Agency paid tiers.
  --        More audits = higher engagement = lower churn = higher revenue.
  --     2. Reputation protection: showing false confidence on weak data is
  --        the single highest churn risk in a recommendations product.
  --        If a customer acts on a 'High confidence' recommendation that
  --        was based on 2 audit runs and sees no result, they cancel.
  --        Honest labels prevent that loss. Reputation is a revenue lever.
  --   UI rule: 'Low' is never hidden and never alarming — shown with a simple,
  --   friendly note. 'High' gets a ✓ badge with no copy needed.
  --
  wont_fix_reason       TEXT,
  -- Required when status = 'wont_fix' (mirrors Phase 1 action_items.dismissedReason pattern).
  -- Zod validation in PATCH /api/brands/[id]/tasks/[id]:
  --   z.object({ status: z.enum([...]), wont_fix_reason: z.string().max(500).optional() })
  --   .refine(d => d.status !== 'wont_fix' || !!d.wont_fix_reason,
  --           { message: 'wont_fix_reason required when status is wont_fix', path: ['wont_fix_reason'] })
  effort                TEXT,
  -- 'low' | 'medium' | 'high' — denormalized from recommendations.effort (Phase 1 Sprint 6 field).
  -- Why denormalized: remediation_tasks may also be spawned by fan_out_gap_id or topical_gap_id
  --   (no parent recommendation row), so effort must be set independently.
  -- When recommendation_id IS NOT NULL: copy recommendations.effort at task creation time.
  -- When recommendation_id IS NULL (gap-spawned task): set by schedule-workflow-runs.ts heuristic:
  --   'low'    = content_format change or FAQ block addition
  --   'medium' = new article or schema addition
  --   'high'   = Entity Home rebuild or Wikipedia presence
  priority              INTEGER NOT NULL,
  -- PRIORITY SCORING FORMULA (lib/workflow/priority-scorer.ts):
  --
  --   Priority Score = Impact × ConfidenceWeight ÷ EffortWeight
  --
  --   Impact          = remediation_tasks.score_before - estimated score after fix
  --                     (use topical_coverage_gaps.estimated_citation_impact if recommendation_id is null)
  --                     expressed as a 0-100 numeric (e.g. 12.0 = 12% citation uplift)
  --
  --   ConfidenceWeight = mapped from parent audit's quality_status:
  --                       'sufficient'    → 1.0  (strong statistical basis)
  --                       'partial'       → 0.7  (some dimensions confirmed)
  --                       'insufficient'  → 0.4  (treat with caution)
  --                       'pending'       → 0.5  (default until scored)
  --
  --   EffortWeight     = inverse of effort so low-effort floats to the top:
  --                       'low'    → 3   (quick win — customer can act today)
  --                       'medium' → 2   (worth scheduling this week)
  --                       'high'   → 1   (meaningful project, still worth doing)
  --
  --   Final integer rank = RANK() OVER (PARTITION BY brand_id ORDER BY score DESC)
  --   i.e. priority = 1 is the single best action for this brand right now.
  --
  -- DESIGN INTENT (revenue and profit are the goal; CX and reputation are the pillars):
  --
  --   The priority formula exists to maximise revenue outcomes:
  --     • Customers who always know their #1 action act faster → faster results
  --       → lower churn → higher lifetime value.
  --     • Surfacing high-impact, low-effort tasks first means customers see ROI
  --       quickly on every tier → justifies renewal → drives upgrades.
  --     • Confidence weighting protects reputation: VisibleAU never recommends
  --       an expensive, high-effort fix on weak data. A bad recommendation that
  --       costs a customer time and delivers no result is the fastest path to churn
  --       and a damaging agency review. Honest ranking protects revenue long-term.
  --
  -- Re-computed by priority-scorer.ts after every audit completion and after every
  -- quality_status change. Stored as an integer so the UI can sort simply.
  assigned_to           UUID REFERENCES users(id),  -- users.id is UUID (T6 fix, Foundations v1.12)
  due_date              DATE,
  draft_content         TEXT,
  implementation_notes  TEXT,
  completed_at          TIMESTAMPTZ,
  reaudit_triggered_at  TIMESTAMPTZ,
  reaudit_id            UUID REFERENCES audits(id) ON DELETE SET NULL,
  -- SET NULL (E-03 completion fix): a remediation task OUTLIVES the audit that validated it.
  -- When audit-data-retention.ts deletes the re-audit at 12mo, keep the task; null reaudit_id.
  -- (Contrast with per-audit analytics tables which CASCADE — tasks track work, not analytics.)
  score_before          NUMERIC(5,2),
  score_after           NUMERIC(5,2),
  lift_achieved         NUMERIC(5,2),
  fan_out_before        NUMERIC(5,2),
  fan_out_after         NUMERIC(5,2),
  similarity_before     NUMERIC(4,3),
  similarity_after      NUMERIC(4,3),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tasks_brand_status_idx ON remediation_tasks(brand_id, status);
CREATE INDEX tasks_assigned_idx     ON remediation_tasks(assigned_to, status);

-- ACTION PROGRESS TRACKER — CROSS-SURFACE PLACEMENT (v8.26, ChatGPT CX2 review).
-- The data already exists on remediation_tasks: score_before, score_after, lift_achieved,
-- fan_out_before/after, similarity_before/after, completed_at, reaudit_triggered_at.
-- REQUIREMENT: the "what improved this month?" summary derived from these columns must be
-- surfaced CONSISTENTLY in four places, not just the workflow page:
--   1. Dashboard            — a "Progress this month" card (sum of lift_achieved for tasks
--                             with completed_at in the current month; count of tasks closed).
--   2. Generated reports    — generated_reports.confidence_notes / narrative already carry text;
--                             add a progress block driven by the same query.
--   3. Email digests        — weekly-digest-cron.ts (Phase 1 Sprint 8) appends a progress line.
--   4. White-label exports  — pdf-builder.ts includes the progress block (agency clients see
--                             "we improved your AI visibility by X this month").
-- SOURCE QUERY (one shared helper, lib/workflow/progress-summary.ts):
--   SELECT COUNT(*) FILTER (WHERE status='complete'
--                              AND date_trunc('month', completed_at)=date_trunc('month', now())),
--          COALESCE(SUM(lift_achieved) FILTER (WHERE score_after IS NOT NULL
--                              AND date_trunc('month', completed_at)=date_trunc('month', now())), 0)
--   FROM remediation_tasks WHERE brand_id = $brandId;
-- HONESTY RULE (inherited from v8.19): the SUM FILTER includes `score_after IS NOT NULL` so the
-- displayed lift only counts tasks where a re-audit actually ran (lift_achieved = score_after −
-- score_before, both NULL until re-audit). The SQL now ENFORCES the rule rather than relying on the
-- two columns staying coupled. Never display projected/expected lift as if it were measured.
-- MONTH BOUNDARY: date_trunc('month', now()) is UTC calendar month — identical to Phase 1
-- quota-check.ts (Sprint 9 GD3: date_trunc('month', NOW())), so "this month" matches the billing
-- month a customer's audit quota resets on. Do not switch to AEST here; keep it consistent with quota.
-- TWO-STATE DISPLAY (v8.32, ChatGPT review Rec 6): the UI must present the two numbers from the
-- query above as DISTINCT states so a customer who has done work but whose re-audit hasn't run yet
-- does not perceive inactivity. Render them separately on every surface (dashboard card, report,
-- digest, white-label):
--   • WORK COMPLETED   — COUNT of status='complete' tasks this month. Shown IMMEDIATELY on task
--                        completion. e.g. "3 recommendations completed".
--   • MEASURED IMPACT  — SUM(lift_achieved) over tasks with score_after IS NOT NULL. Until the
--                        validation re-audit runs (trigger-validation-reaudit.ts, ~14 days post-fix),
--                        show "Validation audit scheduled — measured impact pending" rather than a
--                        zero or a blank. Once score_after is set, show the lift (e.g. "Citation rate ↑8%").
-- This keeps the honesty rule intact (no fabricated/projected lift) while making the in-between
-- period feel like progress, not a stall. Presentation-layer only — no schema or query change.

-- AI VISIBILITY WINS FEED — POSITIVE-MOMENTS SURFACE (v8.26, ChatGPT CX1 review).
-- WHY: the platform is rich in gap/problem detection; customers also need visible success
-- moments (wins are remembered more than dashboards — a retention mechanism). Competitors stop
-- at "you have a problem"; the wins feed closes the emotional loop with "here is proof it worked".
-- NO NEW TABLE: the wins feed is a DERIVED, READ-ONLY view computed from data that already exists.
-- A "win" is any of these positive deltas detected for a brand in the current period:
--   - NEW CITATION:     a citations row this audit where the brand domain is newly cited for a
--                       prompt it was NOT cited for in the prior audit (engine + prompt named).
--   - VISIBILITY UP:    visibility_trends.citation_rate or mention_rate rose vs the prior period.
--   - COMPETITOR DOWN:  share_of_voice_snapshots shows a tracked competitor's citation_rate fell
--                       while the brand's held or rose.
--   - GAP CLOSED:       a remediation_task moved to status='complete' with a positive lift_achieved.
--   ── NEW WIN CATEGORIES (v8.33, ChatGPT Phase 2.5 Rec 6) ──
--   ── SPRINT ASSIGNMENT (WS-01 fix v8.37) ──
--   wins-feed.ts is built in TWO phases to maximise retention value:
--
--   PHASE A — Sprint 3 (deliver with Visibility Intelligence):
--     Implement these 4 win types using Phase 1 + Sprint 2/3 data:
--       new_citation:        citations table (Phase 1) ✓
--       new_engine_coverage: citations table (Phase 1) ✓
--       visibility_up:       visibility_trends (Sprint 3) ✓
--       competitor_down:     share_of_voice_snapshots (Sprint 3) ✓
--       gap_closed:          remediation_tasks (Sprint 2) ✓
--     Rationale: delaying until Sprint 5 means customers see NO wins for 2 extra
--     sprints — this directly harms retention. Core wins are available from Sprint 3 data.
--
--   PHASE B — Sprint 5 (extend in Trust Intelligence):
--     Add these 2 win types to the existing wins-feed.ts:
--   - TRUST IMPROVED:   brand_entity_scores.score_of_10 (Phase 1 Drizzle: scoreOf10) rose vs
--                       prior month (JOIN via brandId + MAX(checkedAt) per EC4 fix), OR a
--                       hallucination_incident moved to is_acknowledged=true this period
--                       (hallucination_incidents has NO status column — resolution is tracked via
--                       is_acknowledged BOOLEAN + acknowledged_at TIMESTAMPTZ). Headline:
--                       "Your trust score improved — AI engines now show more accurate info."
-- NO SCHEMA CHANGE: Sprint 5 extension adds trust_improved detection to existing function.
-- SHAPE (lib/communication/wins-feed.ts → GET /api/brands/[id]/wins, Starter+):
--   {
--     type:         'new_citation'         // new citation for a prompt brand wasn't cited before
--               | 'visibility_up'          // citation_rate or mention_rate rose vs prior period
--               | 'competitor_down'        // tracked competitor citation_rate fell
--               | 'gap_closed'            // remediation_task completed with positive lift_achieved
--               | 'trust_improved'         // score_of_10 rose OR is_acknowledged=true on incident
--               | 'new_engine_coverage',  // first-ever citation on an engine with previous zero
--                                          // mentions (DW-01 fix v8.37: merged with former
--                                          // 'new_engine' type — both described the same event)
--     headline:     string,               // plain-English win statement
--     metric_delta: string,               // e.g. '+12% visibility', '+2 citations'
--     reason:       string,               // best-effort correlation, prefixed 'likely linked to:'
--     detected_at:  TIMESTAMPTZ,          // ORDER BY this DESC for chronological timeline
--     engine?:      string,               // e.g. 'chatgpt' — present when win is engine-specific
--     prompt?:      string,               // present when win is prompt-specific
--   }
--   e.g. { type:'new_citation', headline:'ChatGPT cited you for "best plumber Bondi"',
--          metric_delta:'+12% visibility', reason:'likely linked to: Wikipedia entry created',
--          engine:'chatgpt', detected_at:'2026-06-05T10:00:00Z' }
-- ATTRIBUTION HONESTY (v8.19 rule): "reason" is a best-effort correlation (e.g. a remediation_task
--   completed in the same window), shown as "likely linked to:" — never asserted as proven cause.
-- ── OPPORTUNITY IMPACT SCORE DISPLAY (v8.33, ChatGPT Phase 2.5 Rec 1) ──
-- The expectedImpactScore enum (high/medium/low) already exists on action_items and
-- remediation_tasks. Per this review, it must also be shown on:
--   • Gap analysis rows (topical_coverage_gaps) — derive from existing columns:
--       high   = priority_rank = 1 OR cross_prompt_impact >= 5
--       medium = priority_rank = 2 OR cross_prompt_impact 2-4
--       low    = priority_rank >= 3 OR cross_prompt_impact < 2
--       (topical_coverage_gaps has NO numeric gap-size column; use priority_rank +
--        cross_prompt_impact — both exist on the table. Do NOT reference ">50pt gap".)
--   • Competitive benchmark items — derive from share_of_voice_snapshots:
--       high = (competitor_citation_rate - brand_citation_rate) > 30
--       medium = gap 10-30, low = gap < 10
--       (No competitor_advantage_pct column exists — compute delta at query time.)
--   • Wins Feed entries — show "High impact win" when metric_delta > 15%
-- DISPLAY RULE: always show as a coloured pill (danger=high, warning=medium, info=low)
--   with a one-line evidence-based reason. NEVER show revenue estimates or fabricated forecasts.
--   Example: "Add FAQ schema · Potential Impact: High · Frequently cited by AI in this category"
-- NO SCHEMA CHANGE REQUIRED — all data already exists. This is a UX display enhancement only.

-- ORDERING (v8.32, ChatGPT review Rec 5): present the feed as a chronological TIMELINE, newest
--   first — ORDER BY detected_at DESC. Each win is a dated story ("ChatGPT cited your brand" →
--   "Visibility +12%" → "New authority source detected"), which is what makes it a retention and
--   agency-reporting asset. No new field needed (detected_at already exists in the shape above).
-- TIER: Starter+ (Free sees a single teaser win to drive upgrade). Surface on Dashboard +
--   weekly email digest. Read-only; no writes; safe to compute on demand from existing rows.

CREATE TABLE workflow_runs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID NOT NULL REFERENCES brands(id),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  workflow_type     TEXT NOT NULL,
  -- 'weekly_audit' | 'monthly_report' | 'post_fix_validation'
  -- 'fan_out_check' | 'linkedin_audit' | 'consensus_check'
  status            TEXT NOT NULL DEFAULT 'scheduled',
  -- 'scheduled' | 'running' | 'completed' | 'failed'
  -- (Documented enum — every other status column in the LLD lists its values; this one was missing.)
  -- Lifecycle: scheduled (on insert) → running (started_at set) → completed | failed (completed_at set).
  -- schedule-workflow-runs.ts transitions: scheduled→running before work, →completed on success,
  -- →failed on error (with result_summary.errorMessage set).
  -- NAMING NOTE: workflow_runs uses 'completed' (-ed); Phase 1 audits.status uses 'complete'.
  -- These are DELIBERATELY SEPARATE enums on separate tables — never compare one to the other.
  -- workflow_runs.status tracks a workflow lifecycle; audits.status tracks audit execution state.
  -- A query joining the two must not assume the success value is spelled the same in both.
  scheduled_for     TIMESTAMPTZ NOT NULL,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  result_summary    JSONB,
  -- (RS-01 fix v8.39) TypeScript interface (lib/workflow/types.ts) — same pattern as
  -- Phase 1 EB5 fix (technical_audits.findings). Claude Code MUST use this type, not `any`.
  -- export interface WorkflowRunResult {
  --   durationMs:          number;            // always present: completed_at - started_at ms
  --   auditsTriggered?:    number;            // 'weekly_audit' runs only
  --   reportsGenerated?:   number;            // 'monthly_report' runs only
  --   auditId?:            string;            // 'post_fix_validation' runs only
  --   fanOutResultsCount?: number;            // 'fan_out_check' runs only
  --   linkedinScore?:      number;            // 'linkedin_audit' runs only
  --   consensusScore?:     number;            // 'consensus_check' runs only
  --   errorMessage?:       string;            // status='failed' only — never on 'completed' rows
  -- }
  -- Cast in code: result_summary as WorkflowRunResult
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()  -- set on status transitions
);

-- [GAP 8] Extended with content format and fan-out targeting
CREATE TABLE content_drafts (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id                  UUID NOT NULL REFERENCES brands(id),
  organization_id           UUID NOT NULL REFERENCES organizations(id),
  task_id                   UUID REFERENCES remediation_tasks(id) ON DELETE SET NULL,
  -- SET NULL (FK-ON-DELETE fix v8.28): a content draft can OUTLIVE the remediation task that spawned
  -- it. If the task is deleted, keep the draft and null the link rather than blocking the delete.
  draft_type                TEXT NOT NULL,
  -- 'wikipedia_article' | 'comparison_article' | 'faq_block'
  -- 'press_release' | 'reddit_comment' | 'linkedin_post' | 'linkedin_article'
  -- 'answer_capsule' | 'fan_out_content' | 'topical_gap_article'
  -- 'outreach_brief'  ← CITATION OPPORTUNITY (Profound feature; PRD v1.1 roadmap, 5-7 days)
  --
  -- OUTREACH BRIEF spec (lib/communication/outreach-brief-generator.ts):
  -- Profound's strongest differentiator: tells users exactly WHO to contact and WHAT to say
  -- to earn the citations that AI models trust. VisibleAU's AU-specific version:
  --
  -- Input: citation_source_intelligence rows WHERE source_type IN ('reddit_thread',
  --          'linkedin_post', 'youtube_video', 'industry_directory') AND
  --          brand cited by competitor but NOT by this brand.
  --        brand_web_mentions rows WHERE engine_citation_seen IS NOT NULL
  --          (Reddit/Quora threads that AI engines actively cite in AU verticals).
  --
  -- Output draft body (generated by generate-content-draft.ts, draft_type='outreach_brief'):
  --   Section 1: "Where competitors are winning citations you're missing"
  --     - List top 3 Reddit threads/LinkedIn posts AI cites for [topic] in AU
  --     - Show which competitor is mentioned in each, and why (content_format, authority signals)
  --   Section 2: "Your outreach opportunities" (AU-specific)
  --     - r/AusFinance, r/australia, r/tradies threads → reply with expert answer
  --     - LinkedIn AU industry groups → post original article on [topic_cluster]
  --     - AU directory listings → claim/update your listing on Hipages, YPAU, ServiceSeeking
  --     - Local news / trade publications → pitch data-led story about [vertical] trend
  --   Section 3: "Expected impact"
  --     - "Completing 2 of these actions typically improves citation rate by 8-15%
  --        for brands in the [vertical] vertical (based on VisibleAU corpus data)"
  --
  -- TIER GATE: Growth+ (content_drafts gated to Growth already)
  -- SPRINT: Phase 2 Sprint 6 (Communication Intelligence — same sprint as generated_reports)
  -- 'how_to_guide' | 'listicle'
  -- NAMING CONVENTION NOTE: draft_type uses underscores ('wikipedia_article').
  -- Phase 1 recommendation_key uses hyphens ('wikipedia-article', 'reddit-absence').
  -- These are DIFFERENT naming conventions — no direct string equality mapping.
  -- lib/workflow/content-generator.ts must translate:
  --   'wikipedia-article' → 'wikipedia_article'
  --   'reddit-absence'    → 'reddit_comment'
  --   'linkedin-presence' → 'linkedin_post'
  -- Full mapping table lives in lib/workflow/content-generator.ts (not inferred at runtime).
  content_format            TEXT NOT NULL,
  -- [GAP 8] 'listicle' | 'how_to_guide' | 'comparison_article' | 'faq_block'
  --         'expert_article' | 'case_study' | 'press_release' | 'linkedin_article'
  -- Determines structure of AI-generated content
  -- MAPPING FROM content_structure_audits.content_format_detected → content_drafts.content_format:
  -- (lib/workflow/content-format-selector.ts — resolves detected format to best draft format)
  --   'listicle'          → 'listicle'           (direct match)
  --   'how_to_guide'      → 'how_to_guide'        (direct match)
  --   'comparison_article'→ 'comparison_article'  (direct match)
  --   'faq_block'         → 'faq_block'           (direct match)
  --   'expert_article'    → 'expert_article'       (direct match)
  --   'case_study'        → 'case_study'           (direct match)
  --   'product_page'      → 'comparison_article'  (no product_page draft type — use comparison)
  --   'other'             → 'expert_article'       (no other draft type — default to expert)
  -- content_drafts also has 'press_release' and 'linkedin_article' which are not detectable
  -- from existing page content; these are selected by recommendation_key mapping, not format detection.
  format_recommendation_reason TEXT,
  -- [GAP 8] Why this format was chosen for this gap + engine combination
  -- e.g. "Gemini favours how-to guides for informational queries"
  title                     TEXT NOT NULL,
  body                      TEXT NOT NULL,
  target_sub_query          TEXT,   -- which fan-out sub-query this targets
  target_word_count         INTEGER,
  -- [GAP 8] 134-167 for optimal passage citations; 500-2,000 for LinkedIn articles
  status                    TEXT NOT NULL DEFAULT 'draft',
  -- 'draft' | 'approved' | 'published' | 'rejected'
  word_count                INTEGER,
  target_url                TEXT,
  approved_at               TIMESTAMPTZ,
  approved_by               UUID REFERENCES users(id),  -- users.id is UUID (T6 fix, Foundations v1.12)
  published_at              TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()  -- set on status change, approve/reject
);
```

### New API routes

```
GET  /api/brands/[id]/tasks               → task queue (filter by status)
POST /api/brands/[id]/tasks               → create task
PATCH /api/brands/[id]/tasks/[id]         → update task
POST /api/brands/[id]/tasks/[id]/complete → mark complete + trigger reaudit

GET  /api/brands/[id]/drafts              → content drafts
POST /api/brands/[id]/drafts              → generate draft with format
PATCH /api/brands/[id]/drafts/[id]        → approve / reject / published

GET  /api/organizations/[id]/tasks        → cross-brand task queue (agency)

GET  /api/brands/[id]/wins                 → AI Visibility Wins Feed (Starter+; v8.26 CX1) — derived, read-only
-- PAGINATION (PA-01 fix v8.37): wins feed MUST implement default LIMIT 20 ORDER BY detected_at DESC.
-- Query param: ?limit=N (max 50) for infinite scroll. Without a limit this grows unbounded over months.
-- /api/brands/[id]/brand-mentions (GAP 14) MUST use cursor pagination: ?before=<ISO date>&limit=50.
-- brand_web_mentions is scraped weekly — could have 100+ rows per brand per year.
-- /api/brands/[id]/progress returns a single summary object — pagination not applicable.
GET  /api/brands/[id]/progress             → "what improved this month" summary (v8.26 CX2) — derived from remediation_tasks
```

### New Inngest functions

```typescript
// inngest/functions/generate-content-draft.ts
// TRIGGER (GD-01 fix v8.43): listens on 'draft/generate' Inngest event (internal slash convention).
// When user clicks "Generate draft" in the Workflow UI, the server action emits:
//   inngest.send({ name: 'draft/generate', data: { taskId, brandId, orgId, contentFormat } })
// The function receives contentFormat from the event payload (set by the UI selector).
// On completion: updates content_drafts.status from 'pending' to 'draft' (then user can approve).
// Skeleton:
//   export const generateContentDraft = inngest.createFunction(
//     { id: 'generate-content-draft', concurrency: { limit: 5 } },
//     { event: 'draft/generate' },
//     async ({ event, step }) => { ... }
//   );
// [GAP 8] Claude-powered generation with explicit content_format
// CONCURRENCY (CC-04 fix v8.42): content drafts are on-demand (user clicks "Generate").
//   Many brands could request simultaneously. concurrency: { limit: 5 }
// MODEL (MS-01 fix v8.42): MUST call selectModel(tier, engine, 'content_draft')
//   NOT a hardcoded string — CLAUDE.md §8 anti-pattern violation if hardcoded.
//   Growth → mid-tier (Claude Haiku / GPT-4o-mini)
//   Agency / Agency Pro → top-tier (Claude Sonnet / GPT-4o) — quality matters for client copy
// For listicle: structures as "Top N [service] in [location]"
// For how_to_guide: structures as "How to [task] — step by step"
// For linkedin_article: targets 500-2,000 words, knowledge-sharing tone
// For fan_out_content: targets specific sub-query, 134-167 word optimal passage

// inngest/functions/trigger-validation-reaudit.ts
// TRIGGER (TR-01 fix v8.39): listens on 'task/completed' Inngest event (internal slash convention).
// When remediation_task.status is set to 'complete' (PATCH /api/tasks/[id] server action),
// emit: inngest.send({ name: 'task/completed', data: { taskId, brandId, orgId } })
// This function uses step.sleep('14 days') before firing 'audit/start'.
// Pattern: event-driven delayed action (idiomatic Inngest — NOT a daily cron).
// WHY NOT CRON: cron scanning for tasks completed 14 days ago has a timing race condition.
//   Event + step.sleep is exact and replay-safe.
// SKELETON:
//   export const triggerValidationReaudit = inngest.createFunction(
//     { id: 'trigger-validation-reaudit' },
//     { event: 'task/completed' },
//     async ({ event, step }) => {
//       await step.sleep('wait-14-days', '14 days');
//       // checkQuota → fire 'audit/start' (see QUOTA NOTE below)
//     }
//   );
// 14 days after task.completed_at
// Measures score_after, fan_out_after, similarity_after, linkedin_score_after
// QUOTA NOTE (U-14 fix v8.22): this function fires 'audit/start' (D-05) which runs a FULL audit
//   and therefore consumes one TIER_AUDIT_LIMITS slot — identical to schedule-workflow-runs.ts.
//   It MUST call checkQuota(orgId, brandId) from lib/quota/check.ts BEFORE firing 'audit/start'.
//   Because this is a SYSTEM-triggered re-audit (not customer-initiated), handle over-quota
//   GRACEFULLY rather than erroring:
//     const { allowed } = await checkQuota(orgId, brandId);
//     if (!allowed) {
//       // Do NOT fire the re-audit. Leave score_after NULL and set a deferred flag so the
//       // next available quota window retries. Log it; surface "validation pending — quota reached"
//       // on the task card. Never silently drop: lift tracking is core product value.
//       await markReauditDeferred(taskId, 'quota_exceeded');
//       return;
//     }
//   This keeps re-audits consistent with the Sprint 9 rule: NO 'audit/start' outside the quota gate.

// inngest/functions/schedule-workflow-runs.ts
// Daily cron; fires audits + LinkedIn audits + consensus checks on schedule
// QUOTA NOTE: When firing audits, this function MUST call checkQuota(orgId, brandId)
//   from lib/quota/check.ts (Sprint 9 canonical) BEFORE firing 'audit/start'.
//   Phase 1 audit_schedules cron (Sprint 9: inngest/functions/audit-schedules-cron.ts)
//   does the same check. Phase 2 workflow runs are ADDITIONAL to the scheduled audit
//   cadence — do NOT fire standalone audits outside the quota gate.
//   LinkedIn audits and consensus checks are NOT quota-tracked (they don't consume
//   the auditsPerMonth slot — only the 'audit/start' event does).
```

### New lib/ module

```typescript
// lib/workflow/
├── task-manager.ts             // CRUD + status transitions
├── content-generator.ts        // AI draft with format targeting
├── content-format-selector.ts  // [GAP 8] Format decision by engine × query type
├── validation-scheduler.ts     // 14-day reaudit scheduling
├── workflow-orchestrator.ts    // Recurring run management
└── index.ts
```

### Frontend additions

```
app/(auth)/brands/[brandId]/workflow/
├── page.tsx           // Workflow hub
├── tasks/page.tsx     // Task kanban: Open → In Progress → Review → Done
└── drafts/page.tsx    // Content drafts with format label + approve/reject

app/(auth)/action-center/  // Sprint 6 page — enhanced (not replaced)
  // Add: "Create task" on each recommendation
  // Add: "Fix fan-out gap" on sub-query recommendations
  // Add: "Generate draft" with format recommendation shown
  // [GAP 8] Add: "Format: Listicle recommended for ChatGPT" badge on draft button

components/domain/workflow/
├── task-card.tsx             // Status + assigned + due + lift delta
├── task-kanban.tsx           // Board view
├── content-draft-viewer.tsx  // Draft + format label + approve/reject
├── content-format-badge.tsx  // [GAP 8] Format label with engine rationale
├── lift-indicator.tsx        // Score before → after
└── fan-out-lift.tsx          // Sub-query coverage before → after
```

---

## LAYER 6 — COMMUNICATION INTELLIGENCE

**What it is:** Narrative reports, delivery schedules, white-label PDF.
Evidence-bounded — never overclaims when data quality is low.
Extended with LinkedIn performance and consensus sections.

**Phase 1 foundation used:**
- Sprint 9: white-label PDF, agency_brand_assets, client portal
- Sprint 8: drift alerts, weekly email digest
- Sprint 11: Resend email integration

### New tables

```sql
CREATE TABLE report_templates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  name              TEXT NOT NULL,
  template_type     TEXT NOT NULL,
  sections          JSONB NOT NULL,
  -- (TS-01 fix v8.40) TypeScript interface (lib/communication/types.ts) — EB5/RS-01 pattern:
  -- export interface ReportSection {
  --   type:    'executive_summary'    | 'score_breakdown'     | 'mention_source_divide'
  --          | 'fan_out_coverage'     | 'topical_gap_summary' | 'source_type_gaps'
  --          | 'agent_readiness'      | 'linkedin_performance'| 'consensus_score'
  --          | 'knowledge_panel_status' | 'entity_home_status' | 'evidence_snapshots';
  --   include: boolean;   // true = render in report, false = exclude
  --   order?:  number;    // optional explicit rendering order; default = array index
  -- }
  -- Type cast in code: (template.sections as ReportSection[]).filter(s => s.include)
  -- [{ type: 'executive_summary', include: true },
  --  { type: 'score_breakdown', include: true },
  --  { type: 'mention_source_divide', include: true },
  --  { type: 'fan_out_coverage', include: true },
  --  { type: 'topical_gap_summary', include: true },
  --  { type: 'source_type_gaps', include: false },
  --  { type: 'agent_readiness', include: false },
  --  { type: 'linkedin_performance', include: false },
  --  { type: 'consensus_score', include: false },
  --  { type: 'knowledge_panel_status', include: false },
  --  { type: 'entity_home_status', include: false },
  --  { type: 'evidence_snapshots', include: false }]
  tone              TEXT NOT NULL DEFAULT 'professional',
  -- 'professional' | 'plain_english' | 'executive'
  is_default        BOOLEAN NOT NULL DEFAULT false,
  -- SEED REQUIREMENT: A system-default template row (is_default=true) MUST exist in every
  -- organization's report_templates before generate-narrative-report.ts can run.
  -- Seed this in Phase 2 Sprint 4 setup (db/seed/default-report-template.ts):
  --   INSERT INTO report_templates (organization_id, name, template_type, sections, tone, is_default)
  --   SELECT id, 'Default Report', 'standard',
  --     '[{"type":"executive_summary","include":true},
  --       {"type":"score_breakdown","include":true},
  --       {"type":"mention_source_divide","include":true},
  --       {"type":"fan_out_coverage","include":true},
  --       {"type":"topical_gap_summary","include":true},
  --       {"type":"source_type_gaps","include":false},
  --       {"type":"agent_readiness","include":false},
  --       {"type":"linkedin_performance","include":false},
  --       {"type":"consensus_score","include":false},
  --       {"type":"knowledge_panel_status","include":false},
  --       {"type":"entity_home_status","include":false},
  --       {"type":"evidence_snapshots","include":false}]',
  --     'professional', true
  --   FROM organizations WHERE id = $orgId
  --   ON CONFLICT DO NOTHING;
  -- generate-narrative-report.ts reads: SELECT * FROM report_templates
  --   WHERE organization_id=$orgId AND is_default=true LIMIT 1
  -- Falls back to sections with all core sections included if no row found.
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()  -- set on sections/tone/name edits
);

CREATE TABLE generated_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id          UUID NOT NULL REFERENCES brands(id),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  audit_id          UUID REFERENCES audits(id) ON DELETE SET NULL,
  -- SET NULL (E-03 completion fix): a generated/delivered report OUTLIVES its source audit.
  -- Clients already have the PDF; the report record must survive audit purge with audit_id nulled.
  -- When audit-data-retention.ts deletes the audit at 12mo, keep the report; null audit_id.
  template_id       UUID REFERENCES report_templates(id) ON DELETE SET NULL,
  -- SET NULL (FK-ON-DELETE fix v8.28): a generated report is an immutable historical artifact; if the
  -- template is later deleted by an admin, keep the report and null the template link.
  report_type       TEXT NOT NULL,
  period_label      TEXT,
  narrative_text    TEXT NOT NULL,
  headline          TEXT NOT NULL,
  key_wins          JSONB,
  key_gaps          JSONB,
  fan_out_summary   JSONB,       -- sub-query coverage summary
  topical_summary   JSONB,       -- topic cluster gap summary
  mention_source_summary JSONB,  -- archetype + ratio summary
  linkedin_summary  JSONB,       -- presence score + top gap
  consensus_summary JSONB,       -- consistency score + top discrepancy
  entity_home_summary JSONB,     -- [GAP 12] entity home @id + sameAs count
  knowledge_panel_summary JSONB, -- [GAP 11] panel present / accurate status
  confidence_notes  JSONB,
  pdf_url           TEXT,    -- set after PDF renders (row created first, pdf_url populated async)
  email_sent_at     TIMESTAMPTZ,
  -- UI STATUS DERIVATION (CM-01 fix v8.54): generated_reports has NO stored status column.
  -- The CM-1 Reports List renders a status badge that is DERIVED from these two columns:
  --   pdf_url IS NULL                          → 'generating'  (PDF render in flight)
  --   pdf_url IS NOT NULL AND email_sent_at IS NULL → 'ready'  (downloadable, not yet emailed)
  --   email_sent_at IS NOT NULL                → 'published'   (rendered AND delivered)
  -- Compute in the server component / query layer (e.g. a SQL CASE or a lib/communication
  -- mapper); do NOT add a status column — these two timestamps are the single source of truth.
  -- (Same UI-derived-state pattern as conversation_journeys ready/not_run.)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
  -- APPEND-ONLY table (U-13 fix v8.22): one row per generated report, keyed by created_at.
  -- NOT an UPSERT table — no UNIQUE key, no ON CONFLICT. Every regeneration inserts a NEW row
  -- (each report is a distinct artifact with its own pdf_url + period_label; audit trail kept).
  -- updated_at IS still meaningful: the row is inserted first, then pdf_url and email_sent_at
  -- are populated async (PDF render + email send), each touch bumping updated_at.
);

CREATE INDEX reports_brand_type_idx ON generated_reports(brand_id, report_type, created_at DESC);

CREATE TABLE report_delivery_schedules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  brand_id          UUID REFERENCES brands(id),
  -- FK ADDED (R-01 fix v8.23): was a bare UUID with no REFERENCES — the only brand_id in the
  -- entire Phase 2 schema missing its foreign key. Now matches the other 22 brand_id FKs
  -- (no ON DELETE clause = Phase 1 soft-delete convention via brands.deletedAt). Nullable is
  -- intentional: brand_id IS NULL = org-wide schedule (all brands); non-null = single-brand schedule.
  template_id       UUID REFERENCES report_templates(id) ON DELETE SET NULL,
  -- SET NULL (FK-ON-DELETE fix v8.28): if the template is deleted, the schedule keeps running and
  -- falls back to the org default template rather than blocking the template delete.
  frequency         TEXT NOT NULL,   -- 'weekly' | 'monthly'
  day_of_week       INTEGER,
  -- MUTUAL EXCLUSIVITY: day_of_week is set only when frequency='weekly' (0=Sun, 1=Mon … 6=Sat).
  -- When frequency='monthly', day_of_week MUST be NULL.
  -- Default for weekly: 1 (Monday) matching the weekly digest cron (Mon 23:00 UTC).
  -- ── EMAIL DEDUPLICATION RULE (EM-01 fix v8.38) ──
  -- Phase 1 send-weekly-digest.ts and Phase 2 send-scheduled-reports.ts both default to Monday.
  -- An org with a Phase 2 weekly report schedule MUST NOT also receive the Phase 1 digest
  -- on the same day — two Monday emails from VisibleAU = poor UX / spam risk.
  -- RULE: send-weekly-digest.ts MUST check notification_preferences.email_on_digest = true
  -- AND ALSO check: if the brand has an active report_delivery_schedule with frequency='weekly',
  -- SKIP the Phase 1 digest for that brand (the Phase 2 report is the richer superset).
  -- Implementation: in send-weekly-digest.ts, filter out brands where:
  --   EXISTS (SELECT 1 FROM report_delivery_schedules
  --           WHERE (brand_id = b.id OR organization_id = b.organization_id)
  --           AND frequency = 'weekly' AND is_active = true)
  -- This ensures Growth+ customers upgrading to Phase 2 reports automatically stop receiving
  -- the Phase 1 digest without any manual unsubscribe step.
  day_of_month      INTEGER,
  -- MUTUAL EXCLUSIVITY: day_of_month is set only when frequency='monthly' (1-28; cap at 28 to avoid
  -- Feb edge cases). When frequency='weekly', day_of_month MUST be NULL.
  -- send-scheduled-reports.ts Zod validation:
  --   z.object({ frequency: z.enum(['weekly','monthly']), day_of_week: z.number().int().min(0).max(6).optional(),
  --              day_of_month: z.number().int().min(1).max(28).optional() })
  --   .refine(d => d.frequency !== 'weekly' || d.day_of_week != null, { message: 'day_of_week required for weekly' })
  --   .refine(d => d.frequency !== 'monthly' || d.day_of_month != null, { message: 'day_of_month required for monthly' })
  time_of_day       TEXT NOT NULL DEFAULT '23:00',
  -- Stored in UTC. Default 23:00 UTC = 10:00 AEDT (UTC+11 summer) or 09:00 AEST (UTC+10 winter).
  -- TIMEZONE NOTE: AU daylight saving (Oct–Apr) shifts UTC offset. Store and interpret in UTC.
  -- send-scheduled-reports.ts converts to local display time for email subject only.
  -- Do NOT store 'AEST' times — all cron and delivery logic must use UTC (Phase 1 pattern).
  recipient_emails  JSONB NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  last_sent_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()  -- set on frequency/recipients/is_active changes
);
```

### Report generation rules

```typescript
// lib/communication/narrative-generator.ts
// RULE 1: No causal language when quality_status = 'insufficient'
//   BLOCKED: "Your visibility improved because of schema changes."
//   ALLOWED: "Visibility appears to have improved based on available samples."
// RULE 2: Always surface confidence notes when metric is 'Hypothesis' or lower
// RULE 3: Key wins require score_delta > 0 AND sample_quality >= 'Likely'
// RULE 4: Fan-out coverage included when query_fan_out_results exist for period
// RULE 5: Topical gap summary when TCG Score < 70%
// RULE 6: Mention-Source archetype included when visibility_trends has brand_archetype
// RULE 7: LinkedIn section included when linkedin_presence_audits row exists
// RULE 8: Evidence snapshots included only when Agency tier+
// RULE 9: AU local citations framed as Priority 1 for SMB/tradie segments
// RULE 10: Knowledge Panel section included when knowledge_panel_present = false
//          or knowledge_panel_accurate = false — frame as entity risk
// RULE 11: Entity Home section included when entity_home_same_as_count < 3
```

### New API routes

```
GET  /api/brands/[id]/reports            → report history
POST /api/brands/[id]/reports/generate   → generate narrative
GET  /api/brands/[id]/reports/[id]       → report + PDF download

GET  /api/organizations/[id]/report-templates    → list templates
POST /api/organizations/[id]/report-templates    → create template
GET  /api/organizations/[id]/delivery-schedules  → list schedules
POST /api/organizations/[id]/delivery-schedules  → create schedule
```

### New Inngest functions

```typescript
// inngest/functions/generate-narrative-report.ts
// WEBHOOK EMIT (WH-01a fix v8.47): after inserting generated_reports row, emit:
//   inngest.send({ name: 'report/generated', data: { organizationId, brandId, reportId } })
//   fanout-webhooks.ts maps this → external 'report.generated' webhook event.
// TRIGGER (NR-01 fix v8.44): listens on 'trend/aggregated' Inngest event (internal slash convention).
// aggregate-visibility-trend.ts emits this event after writing a visibility_trends row:
//   inngest.send({ name: 'trend/aggregated', data: { brandId, orgId, periodLabel, periodType } })
// This chains trend aggregation → report generation without a separate cron.
// Only fires when report_delivery_schedules has an active row for this brand (check before generation).
// CONCURRENCY (CC-05 fix v8.42): monthly report — Growth+ generates once/month per brand.
//   Agency Pro 25 brands = 25 simultaneous runs at month end. concurrency: { limit: 5 }
// MODEL (MS-02 fix v8.42): MUST call selectModel(tier, engine, 'narrative_generation')
//   narrative_generation → cheapest model (structured output, not quality-sensitive per cost table)
//   NOT a hardcoded string — CLAUDE.md §8 anti-pattern violation if hardcoded.
// INPUT: fired after aggregate-visibility-trend.ts completes for a period.
//   Event payload: { brandId, organizationId, periodLabel, periodType, reportType }
//   Reads from DB (all nullable — function checks presence before including section):
//     visibility_trends          WHERE brand_id = $brandId AND period_label = $periodLabel
//     query_fan_out_results      WHERE brand_id = $brandId (recent, for fan-out summary)
//     topical_coverage_gaps      WHERE brand_id = $brandId (current gaps, priority_rank ASC)
//     citation_source_intelligence WHERE brand_id = $brandId (latest per engine+source_type)
//     linkedin_presence_audits   WHERE brand_id = $brandId ORDER BY created_at DESC LIMIT 1
//     brand_consensus_checks     WHERE brand_id = $brandId
//     brand_entity_scores        WHERE brand_id = $brandId (score_of_10, knowledge_panel_*)
//     content_structure_audits   WHERE brand_id = $brandId (entity_home_has_org_schema)
//   Applies evidence rules from lib/communication/narrative-generator.ts (RULE 1-11)
//   Inserts into generated_reports; updates pdf_url after renderToBuffer()
// OUTPUT: generated_reports row with narrative_text, headline, key_wins, key_gaps JSONBs
// Includes all new sections: fan-out, topical, mention-source divide,
// LinkedIn performance, consensus score
// Evidence-bounded quality rules enforced

// inngest/functions/send-scheduled-reports.ts
// Daily cron; fires reports for due schedules via Resend
// EMAIL TEMPLATE (lib/email/templates/scheduled-report.tsx — React Email component):
//   From:    noreply@visibleau.com  (Phase 1 Resend verified domain)
//   Subject: '[Brand Name] AI Visibility Report — [Month YYYY]'  (monthly)
//            '[Brand Name] AI Visibility Update — Week of [Date]' (weekly)
//   Body sections (React Email):
//     1. Score summary card: composite score + delta from last period
//     2. Top win: highest score_delta dimension this period
//     3. Top gap: lowest-scoring dimension with action link
//     4. PDF attachment: generated_reports.pdf_url (pre-signed Supabase Storage URL, 7-day expiry)
//     5. Footer: unsubscribe link → PATCH report_delivery_schedules is_active=false
//   Uses lib/email/client.ts Resend singleton (Phase 1 pattern from Sprint 2)
//   DO NOT build a new Resend instance — import { resend } from '@/lib/email/client'
```

### New lib/ module

```typescript
// lib/communication/
├── narrative-generator.ts   // Evidence-bounded narrative generation
├── pdf-builder.ts           // Extended with new report sections
//   MUST import: lib/pdf/theme.ts (Sprint 9 canonical: assetToTheme, buildThemeStyles)
//   White-label PDF styling reads agency_brand_assets (Phase 1 Sprint 9 table) for logo/colors/footer.
//   Usage: const asset = await db.select().from(agencyBrandAssets).where(eq(agencyBrandAssets.organizationId, orgId))
//          const theme = assetToTheme(asset[0]);  // lib/pdf/theme.ts
//          const styles = buildThemeStyles(theme); // lib/pdf/theme.ts
//   Do NOT duplicate Sprint 9's theme logic — import it directly from lib/pdf/theme.ts.
├── delivery-scheduler.ts    // Schedule management
├── alert-composer.ts        // Drift + hallucination + consensus alert emails
//   ALERT TYPES + TRIGGERS (all sent via lib/email/client.ts Resend singleton):
//   1. Hallucination alert — trigger: detect-hallucinations.ts creates incident with severity='critical'
//      Subject: '[Brand] AI Hallucination Detected — Immediate Review Needed'
//      Body: engine, incorrect_claim, correct_value, PATCH acknowledge link
//   2. Drift alert — trigger: send-alerts.ts fires on 'drift/detected' Inngest event (Phase 1 Sprint 8)
//      Subject: '[Brand] AI Visibility Drift Alert — [dimension] dropped'
//      Body: dimension, score_before, score_after, CI overlap, link to audit results
//   3. Consensus alert — trigger: check-cross-platform-consensus.ts finds consistency_score < 60
//      Subject: '[Brand] Brand Consistency Issue Detected — [source_type]'
//      Body: source_type, discrepancy fields, link to consensus page
//   4. Volatility alert — trigger: volatility-scorer.ts flags citation_volatility_score > 15.0
//      Subject: '[Brand] Citation Volatility Warning — Sources Changing Rapidly'
//      Body: current score, trend, recommended action
//   Recipients (NP-01 fix v8.30 — gate EACH alert on its OWN preference, not all on emailOnDrift):
//     1. Hallucination → COALESCE(notification_preferences.emailOnHallucination, true)=true orgs
//     2. Drift         → notification_preferences.emailOnDrift=true orgs (Phase 1 Sprint 9, unchanged)
//     3. Consensus     → COALESCE(notification_preferences.emailOnConsensus, false)=true orgs
//     4. Volatility    → COALESCE(notification_preferences.emailOnVolatility, false)=true orgs
//   (Phase 2 ALTER adds email_on_hallucination/consensus/volatility — see notification_preferences
//   column additions above. COALESCE handles legacy rows whose new columns are still NULL.)
└── index.ts
```

### Frontend additions

```
app/(auth)/brands/[brandId]/reports/
├── page.tsx       // Report history
└── [id]/page.tsx  // Report viewer + PDF

app/(auth)/agency/reports/
├── page.tsx           // Cross-brand report management
└── schedules/page.tsx // Delivery configuration

components/domain/communication/
├── report-preview-card.tsx
├── narrative-section.tsx
├── delivery-schedule-form.tsx
└── confidence-note.tsx
```

---

## LAYER 7 — GOVERNANCE INTELLIGENCE

**What it is:** Audit trails, team RBAC, data residency, feature flags.

**Phase 1 foundation used:**
- Sprint 1: Better Auth org sessions + Supabase RLS on all tenant tables
  (Note: Phase 1 migrated from Clerk to Better Auth during Sprint 1 build;
  Better Auth is the confirmed final auth system — `betterAuth` from `better-auth` package)
- Sprint 10: Stripe + processed_webhook_events
- Sprint 12: Sentry, security audit, privacy policy

### New tables

```sql
CREATE TABLE audit_trail (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  user_id           UUID REFERENCES users(id),  -- users.id is UUID (T6 fix, Foundations v1.12)
  action            TEXT NOT NULL,
  -- PHASE 1 actions:
  -- 'audit_triggered' | 'recommendation_dismissed' | 'task_completed'
  -- 'report_generated' | 'brand_deleted' | 'member_invited' | 'tier_changed'
  -- 'linkedin_audit_triggered' | 'consensus_check_triggered'
  -- PHASE 2 actions (AT-01 fix v8.39): added to cover all Phase 2 user-facing actions:
  -- 'draft_approved'              — content_drafts.status set to 'approved' by user
  -- 'draft_dismissed'             — content_drafts.status set to 'dismissed' by user
  -- 'journey_triggered'           — conversation_journeys run initiated (Agency+)
  -- 'hallucination_acknowledged'  — hallucination_incidents.is_acknowledged set true
  -- 'feature_flag_changed'        — org_feature_flags.is_enabled toggled (ops only)
  -- 'data_residency_accessed'     — data_residency_log page viewed (Privacy Act compliance)
  -- 'competitive_benchmark_viewed'— GET /api/brands/[id]/competitive-benchmark called
  -- 'member_role_changed'         — (S8b-03 v8.68) org_members.role updated by owner/admin
  -- 'member_removed'              — (S8b-03 v8.68) org_members row revoked (membership removed)
  -- resource_type for Phase 2: 'content_draft' | 'journey' | 'hallucination_incident'
  --                             | 'feature_flag' | 'competitive_benchmark' | 'org_member'
  resource_type     TEXT NOT NULL,
  resource_id       TEXT,
  metadata          JSONB,
  ip_address        TEXT,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_trail_org_idx ON audit_trail(organization_id, created_at DESC);

-- Team RBAC with brand-scoped access
-- DESIGN NOTE — THREE auth/membership layers in Phase 2:
-- 1. Better Auth `auth_members` (Phase 1): org membership managed by Better Auth library.
--    Links auth_users → auth_organizations. DO NOT write to this table directly.
-- 2. Phase 1 `users.role` ('owner'|'admin'|'member'): org-level role, synced from Better Auth.
--    Phase 2 leaves this unchanged. Users mirror table (uuid PK, clerkUserId = betterAuthUserId).
-- 3. Phase 2 `org_members` (this table): brand-scoped access layer ON TOP.
--    Restricts which brands within an org a member can see/manage.
--    FKs to `users` (our internal mirror), NOT to auth_members (Better Auth internal).
-- Permission check order: Better Auth session → users.role (org-level) → org_members (brand-level).
-- BRAND-ISOLATION MECHANISM (S8b-01 v8.68 — CANONICAL): RLS is ORG-scoped (every tenant table's
--   policy keys on organization_id), so it does NOT by itself enforce org_members.brand_access —
--   without an explicit gate, brand_access is stored-but-inert and any org member can reach any
--   brand in the org. The canonical gate is `assertBrandAccess(user, brandId)`
--   (lib/governance/access-control.ts): it throws / returns 404 when the member's brand_access is
--   a non-null array that does not include brandId (null brand_access = all brands in org). EVERY
--   brand-scoped route (`/api/brands/[id]/...`) and every brand-scoped action (incl the Autopilot
--   approve/execute path consumed by Sprint 9) MUST call it after the session + org check. Sprint 8
--   builds it and retrofits the S1–S7 brand routes; Sprint 9 relies on it. (This is distinct from
--   the action-permission predicate `canPerform`, which answers "may this role do this action";
--   assertBrandAccess answers "may this member touch this brand at all".) The org-level RLS stays
--   as the outer tenant boundary; assertBrandAccess is the inner brand boundary.
CREATE TABLE org_members (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  user_id           UUID NOT NULL REFERENCES users(id),  -- users.id is UUID (T6 fix, Foundations v1.12)
  role              TEXT NOT NULL,
  -- 'owner'   — full org control; same as Phase 1 users.role='owner'; can delete org, manage billing
  -- 'admin'   — full brand/audit/report control; same as Phase 1 users.role='admin'
  -- 'analyst' — read + run audits + create tasks; maps to Phase 1 users.role='member' but narrower
  -- 'viewer'  — read-only; can see reports + audit results, cannot trigger actions
  -- PERMISSION MATRIX (org_members.role governs brand-scoped access; users.role governs org-level):
  -- Action                   | owner | admin | analyst | viewer
  -- Run audit                |  ✓    |  ✓    |   ✓     |  ✗
  -- Create/edit tasks        |  ✓    |  ✓    |   ✓     |  ✗
  -- Approve content drafts   |  ✓    |  ✓    |   ✗     |  ✗
  -- View reports             |  ✓    |  ✓    |   ✓     |  ✓
  -- Generate reports         |  ✓    |  ✓    |   ✓     |  ✗
  -- Edit report templates    |  ✓    |  ✓    |   ✗     |  ✗
  -- Invite team members      |  ✓    |  ✓    |   ✗     |  ✗
  -- Change a member's role    |  ✓    |  ✓    |   ✗     |  ✗   (admin may NOT touch owner — see below)
  -- Assign/revoke OWNER role  |  ✓    |  ✗    |   ✗     |  ✗   (S8b-02 v8.68 — owner only; admin cannot grant/remove owner)
  -- Remove a member           |  ✓    |  ✓    |   ✗     |  ✗   (admin may NOT remove an owner — see below)
  -- Delete brand             |  ✓    |  ✗    |   ✗     |  ✗
  -- ROLE-CEILING RULE (S8b-02 v8.68): admin can manage analyst/viewer/admin rows, but ONLY an
  --   owner may assign the owner role to someone or revoke it (incl demoting/removing another
  --   owner). An admin attempting to grant/revoke owner, or to remove/demote an owner, is denied
  --   (403). Enforced in the role-change + member-remove handlers, not just the matrix.
  -- Note: users.role='member' in Phase 1 = analyst-equivalent for org-level access.
  -- org_members.role is checked AFTER users.role (see 3-layer permission model in DESIGN NOTE above).
  brand_access      JSONB,           -- null = all brands in org; or [brandId, ...] for restricted access
  invited_by        UUID REFERENCES users(id),  -- users.id is UUID (T6 fix, Foundations v1.12)
  invited_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at       TIMESTAMPTZ,
  -- INVITATION FLOW: Phase 2 org_members is the brand-scoped access layer ON TOP of Better Auth.
  -- Phase 1 Better Auth (auth_invitations table) handles org-level auth invitations separately.
  -- Phase 2 org_members invitation flow:
  --   1. Admin POSTs /api/organizations/[id]/members/invite with { userId, role, brandAccess }
  --   2. Row inserted with invited_at=now(), accepted_at=NULL, is_active=false
  --   3. Email sent via Resend to the invited user with a one-time acceptance link
  --   4. User GETs /api/organizations/[id]/members/accept?token=... (nanoid token in link)
  --   5. API sets accepted_at=now(), is_active=true for the org_members row
  -- Note: The invited user must already have a Better Auth session (Phase 1 auth_invitations
  -- handles onboarding new users to the org; org_members is only for existing org members
  -- getting additional brand-scoped access grants or role changes).
  invitation_token  TEXT UNIQUE,
  -- (IT-01 fix v8.41): The invitation accept flow (step 4) routes to
  -- GET /api/organizations/[id]/members/accept?token=<nanoid>
  -- This endpoint validates the token against this column before setting accepted_at=now().
  -- Token: nanoid(21) generated at invite time (POST /api/.../invite), stored here.
  -- Once accepted: clear to NULL (token is single-use; NULL = already accepted or not invited).
  -- Expiry: no expires_at column — if the invited user never accepts, the admin can
  -- re-invite (regenerates token). Simplest correct approach for v1.
  -- CANCELLATION (IC-01 fix v8.47): when admin cancels an invitation:
  --   DELETE FROM org_members WHERE id = $memberId AND accepted_at IS NULL;
  --   (only delete unaccepted rows — never delete active members via cancel endpoint)
  --   If already accepted (accepted_at IS NOT NULL): use role-change or is_active=false instead.
  -- This keeps the table clean — no ghost rows with NULL token + is_active=false + NULL accepted_at.
  is_active         BOOLEAN NOT NULL DEFAULT true,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),  -- set on role change, brand_access update, is_active toggle
  UNIQUE(organization_id, user_id)
);

CREATE TABLE data_residency_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  data_type         TEXT NOT NULL,
  -- 'audit_data' | 'evidence_snapshots' | 'pdf_reports' | 'llm_cache' | 'crawler_logs'
  storage_region    TEXT NOT NULL,   -- e.g. 'ap-southeast-2' (Supabase Sydney), 'us-east-1' (LLM providers)
  provider          TEXT NOT NULL,   -- 'supabase' | 'openai' | 'anthropic' | 'google' | 'perplexity' | 'vercel'
  retention_period  TEXT NOT NULL DEFAULT '12 months',
  -- (DR-02 fix v8.52): GV-2 Data Residency screen renders a Retention column. Values per data_type:
  --   'audit_data'='12 months', 'evidence_snapshots'='12 months', 'pdf_reports'='12 months',
  --   'llm_cache'='30 days', 'crawler_logs'='90 days' (matches RT-01 retention deletes).
  --   These mirror the actual cleanup windows in audit-data-retention.ts — keep in sync.
  encryption_status TEXT NOT NULL DEFAULT 'AES-256 at rest, TLS 1.3 in transit',
  -- (DR-02 fix v8.52): GV-2 renders an Encryption column. Supabase default for all stored data.
  recorded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, data_type)  -- DR-01: one declarative row per data class per org; enables UPSERT ON CONFLICT
);
-- WRITER (DR-01 fix v8.27): this table previously had a reader
-- (GET /api/organizations/[id]/data-residency → storage declarations), RLS, and a tier-matrix
-- entry, but NO documented writer — so the endpoint would always return empty. The writer is a
-- DECLARATIVE upsert, not a per-event log: residency is a property of the platform's
-- infrastructure, the same for every org, so each org gets one row per data_type stating where
-- that data class lives.
--   lib/governance/record-data-residency.ts (called on org provisioning + idempotent on the
--   nightly governance cron) UPSERTs the current declarations from a static config map:
--     const RESIDENCY = [
--       (DR-02 fix v8.52): each entry now carries retention_period + encryption_status for GV-2 screen.
--       { data_type:'audit_data',         storage_region:'ap-southeast-2', provider:'supabase', retention_period:'12 months', encryption_status:'AES-256 at rest, TLS 1.3 in transit' },
--       { data_type:'evidence_snapshots', storage_region:'ap-southeast-2', provider:'supabase', retention_period:'12 months', encryption_status:'AES-256 at rest, TLS 1.3 in transit' },
--       { data_type:'pdf_reports',        storage_region:'ap-southeast-2', provider:'supabase', retention_period:'12 months', encryption_status:'AES-256 at rest, TLS 1.3 in transit' },
--       { data_type:'llm_cache',          storage_region:'ap-southeast-2', provider:'supabase', retention_period:'30 days',   encryption_status:'AES-256 at rest, TLS 1.3 in transit' },
--       { data_type:'crawler_logs',       storage_region:'ap-southeast-2', provider:'supabase', retention_period:'90 days',   encryption_status:'AES-256 at rest, TLS 1.3 in transit' },
--       // LLM processing (transient, not stored): declared for transparency, region = provider default
--       { data_type:'llm_processing_openai',     storage_region:'us',  provider:'openai' },
--       { data_type:'llm_processing_anthropic',  storage_region:'us',  provider:'anthropic' },
--     ];
--   Idempotency: add UNIQUE(organization_id, data_type) and UPSERT ON CONFLICT so re-runs refresh
--   storage_region/provider without duplicating rows (matches the declarative, one-row-per-class model).
--   This is the data residency disclosure AU customers + DPAs ask for ("where does my data live?").

-- INTERACTION WITH PHASE 1 ENV FLAGS:
-- Phase 1 Sprint 1 uses env-driven flags: FREE_TIER_ENABLED_AU=true (lib/feature-flags/index.ts)
-- These are GLOBAL region flags (same for all orgs in that region).
-- org_feature_flags are PER-ORG overrides — they take priority over env flags.
-- Priority order: org_feature_flags (DB) > env vars > hardcoded defaults.
-- Example: FREE_TIER_ENABLED_AU=false but org XYZ gets free tier via org_feature_flags
--          flag_key='free_tier_enabled', is_enabled=true → XYZ can still use free tier.
-- The lib/feature-flags/index.ts function must be extended to check org_feature_flags first.
CREATE TABLE org_feature_flags (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organizations(id),
  flag_key          TEXT NOT NULL,
  -- CANONICAL flag_key VALUES (lib/feature-flags/index.ts reads these):
  -- 'free_tier_enabled'        — override Free tier access for this org (e.g. beta partners)
  -- 'growth_tier_early_access' — unlock Growth features before billing upgrade
  -- 'agency_tier_early_access' — unlock Agency features for pilots
  -- 'fan_out_enabled'          — enable/disable query fan-out for this org
  -- 'linkedin_audit_enabled'   — enable LinkedIn presence audit for this org
  -- 'youtube_audit_enabled'    — enable YouTube presence audit for this org
  -- 'evidence_archive_enabled' — enable evidence snapshots (override Agency gate for approved betas)
  -- 'google_ai_mode_enabled'   — enable stretch-goal Google AI Mode results for this org
  -- All operator-set only (set_by = 'ops' | 'sri'). Never set via user-facing API.
  is_enabled        BOOLEAN NOT NULL,
  reason            TEXT,
  set_by            TEXT,
  expires_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),  -- set on is_enabled toggle or expires_at change
  UNIQUE(organization_id, flag_key)
);
```

### New API routes

```
GET    /api/organizations/[id]/audit-trail        → action history (paginated)
GET    /api/organizations/[id]/members            → team list + roles
POST   /api/organizations/[id]/members/invite     → invite member
PATCH  /api/organizations/[id]/members/[id]       → update role / access
DELETE /api/organizations/[id]/members/[id]       → remove member
GET    /api/organizations/[id]/data-residency     → storage declarations
GET    /api/organizations/[id]/feature-flags      → current flags
```

### New lib/ module

```typescript
// lib/governance/
├── audit-trail.ts       // Record all significant user actions
├── access-control.ts    // RBAC + brand-scoped permission checks
├── feature-flags.ts     // Per-org flag resolution
├── data-residency.ts    // Storage declarations
└── index.ts
```

### Frontend additions

```
app/(auth)/settings/
├── team/page.tsx             // Member management
├── audit-trail/page.tsx      // Action history
└── data-residency/page.tsx   // Storage transparency

components/domain/governance/
├── member-invite-form.tsx
├── audit-trail-row.tsx
└── data-residency-card.tsx
```

---


---

## PHASE 2 RLS POLICY SPECIFICATION

All Phase 2 tenant tables (those with `organization_id` or `brand_id`) require Row Level Security
matching the Phase 1 pattern from Sprint 2 (`app.current_org_id` context variable set by
`lib/db/rls.ts` before each query). Add these to the Phase 2 migration file.

**Pattern (same as Phase 1):**
```sql
-- Repeat for every tenant table below:
ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_isolation" ON <table_name>;  -- idempotency: see note below
CREATE POLICY "org_isolation" ON <table_name>
  FOR ALL
  USING (organization_id::text = current_setting('app.current_org_id', true))
  WITH CHECK (organization_id::text = current_setting('app.current_org_id', true));
```
-- MIGRATION IDEMPOTENCY (MI-01 fix v8.29): the Phase 2 migration file mixes idempotent ALTERs
-- (`ADD COLUMN IF NOT EXISTS`, used 32×) with statements that are NOT idempotent by default. A
-- re-run (CI retry, or resuming a deploy that failed partway) would then crash. Make the WHOLE
-- migration re-runnable:
--   • CREATE TABLE        → `CREATE TABLE IF NOT EXISTS` (all 37 Phase 2 tables).
--   • CREATE INDEX        → `CREATE INDEX IF NOT EXISTS` (all 35 Phase 2 indexes; valid PG ≥9.5).
--   • CREATE POLICY       → Postgres has NO `CREATE POLICY IF NOT EXISTS` in any version, so
--                           precede each with `DROP POLICY IF EXISTS "<name>" ON <table>;`
--                           (shown above) — the standard idempotent idiom on Supabase PG15.
--   • ALTER … ENABLE RLS  → already idempotent (no error if RLS is already enabled).
-- If migrations are applied via drizzle-kit (which tracks applied migrations and won't re-run a
-- completed one), this protects the partial-failure / manual-replay path specifically.
-- RLS-WITHCHECK fix (v8.28): the policy MUST be `FOR ALL` with BOTH `USING` and `WITH CHECK`,
-- matching Phase 1 Sprint 1's "Users mutate only their org's brands" policy — NOT a USING-only
-- policy. `USING` controls which rows are VISIBLE (SELECT/UPDATE/DELETE targeting); `WITH CHECK`
-- validates the org of rows being INSERTED and the NEW org on UPDATE. Without `WITH CHECK`, a
-- user-context write could INSERT a row with a different organization_id, or move a row to another
-- org on UPDATE, defeating tenant isolation on the write path. Phase 2 Inngest jobs use the
-- service_role key (which bypasses RLS by design), but API-route writes rely on this policy as the
-- defense-in-depth backstop the LLD specifies — so both clauses are required on all 30 tables.
-- (Global/seed tables remain RLS-DISABLED — they have no organization_id and are not tenant-scoped.)

**Tenant tables requiring RLS (30 tables):**
```sql
-- Layer 1 — Retrieval Intelligence
ALTER TABLE audit_cost_snapshots    ENABLE ROW LEVEL SECURITY;
ALTER TABLE crawler_visit_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_structure_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE llmstxt_versions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_readiness_scores   ENABLE ROW LEVEL SECURITY;

-- Layer 2 — Visibility Intelligence
ALTER TABLE share_of_voice_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE visibility_trends        ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_web_mentions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE query_fan_out_results    ENABLE ROW LEVEL SECURITY;
ALTER TABLE topical_coverage_gaps    ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_ai_mode_results   ENABLE ROW LEVEL SECURITY;

-- Layer 3 — Trust Intelligence
ALTER TABLE hallucination_incidents    ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_snapshots         ENABLE ROW LEVEL SECURITY;
ALTER TABLE citation_source_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE linkedin_presence_audits   ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_consensus_checks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE youtube_presence_audits    ENABLE ROW LEVEL SECURITY;

-- Layer 4 — Conversational Discovery
ALTER TABLE conversation_journeys    ENABLE ROW LEVEL SECURITY;
ALTER TABLE journey_run_results      ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparison_prompt_results ENABLE ROW LEVEL SECURITY;

-- Layer 5 — Workflow Intelligence
ALTER TABLE remediation_tasks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_runs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_drafts           ENABLE ROW LEVEL SECURITY;

-- Layer 6 — Communication Intelligence
ALTER TABLE report_templates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_reports        ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_delivery_schedules ENABLE ROW LEVEL SECURITY;

-- Layer 7 — Governance Intelligence
ALTER TABLE audit_trail              ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_members              ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_residency_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_feature_flags        ENABLE ROW LEVEL SECURITY;
```
-- Policy for each (replace <table> with actual name):
-- (RLS-WC fix v8.48): Phase 1 pattern is FOR ALL with BOTH USING and WITH CHECK.
-- USING alone protects reads but leaves INSERT/UPDATE open to cross-org writes.
-- WITH CHECK validates the row being written belongs to the current org.
-- CREATE POLICY "org_isolation" ON <table>
--   FOR ALL
--   USING (organization_id::text = current_setting('app.current_org_id', true))
--   WITH CHECK (organization_id::text = current_setting('app.current_org_id', true));
-- Without WITH CHECK, a user could INSERT a row with another org's organization_id,
-- or UPDATE a row to move it cross-tenant — a multi-tenant isolation breach.
-- Service-role connections (Inngest functions) bypass RLS via the service key (Phase 1 pattern).

**Global tables — NO RLS (seed data, no org scoping):**
- `config_bundle_cache`, `market_ai_budget_policies`, `sampling_policies`,
  `metric_quality_gates`, `prompt_pack_coverage`, `provider_market_capabilities`,
  `prompt_volume_estimates`
- Phase 1 precedent: `citability_methods` and `validation_corpus_results` also have RLS DISABLED.

## COMPLETE TABLE INVENTORY — PHASE 2 (v6.0)

All tables below are NEW. No Phase 1 table is dropped or renamed.

### Platform Foundation (Sprint 1) — 7 tables
1.  `config_bundle_cache`
2.  `market_ai_budget_policies`
3.  `sampling_policies`
4.  `metric_quality_gates`
5.  `prompt_pack_coverage`
6.  `provider_market_capabilities`
7.  `audit_cost_snapshots`

### Layer 1 — Retrieval Intelligence (Sprint 6) — 4 tables
8.  `crawler_visit_logs`
9.  `content_structure_audits`        ← v2.0 + [GAP 8] format/freshness + [GAP 12] entity home columns
10. `llmstxt_versions`
11. `agent_readiness_scores`           ← [GAP 2] v2.0

### Layer 2 — Visibility Intelligence (Sprint 3) — 7 tables
12. `share_of_voice_snapshots`
13. `prompt_volume_estimates`
14. `visibility_trends`               ← v2.0 + [GAP 9] mention-source divide + [GAP 15] volatility column
15. `query_fan_out_results`            ← [GAP 1] v2.0; v3.0: 3-12 sub-queries
16. `topical_coverage_gaps`            ← [GAP 6] v2.0
17. `google_ai_mode_results`           ← [GAP 5] stretch goal
18. `brand_web_mentions`              ← [GAP 14] NEW v5.0

### Layer 3 — Trust Intelligence (Sprint 5) — 7 tables
19. `hallucination_incidents`
20. `evidence_snapshots`
21. `brand_entity_scores`              ← Phase 1 Sprint 7 table; Phase 2 extends with ALTER TABLE nullable columns: organization_id, market_code, local_reg_verified, local_reg_number, hipages/directory fields, wikipedia_local_*, au_tld_present; [GAP 11] knowledge_panel_*; [GAP 13] wikidata_* (NOTE: entity_score NOT added — Phase 1 score_of_10 IS the entity score, per D-01 fix)
22. `citation_source_intelligence`     ← [GAP 4]  v2.0
23. `linkedin_presence_audits`         ← [GAP 7]  v3.0
24. `brand_consensus_checks`           ← [GAP 10] v3.0
25. `youtube_presence_audits`          ← [GAP 16] NEW v6.0

### Layer 4 — Conversational Discovery (Sprint 7) — 3 tables
26. `conversation_journeys`
27. `journey_run_results`
28. `comparison_prompt_results`

### Layer 5 — Workflow Intelligence (Sprint 2) — 3 tables
29. `remediation_tasks`               ← v2.0 + [GAP 8] linkedin/consensus/mention gap columns
30. `workflow_runs`
31. `content_drafts`                  ← v2.0 + [GAP 8] content_format column

### Layer 6 — Communication Intelligence (Sprint 4) — 3 tables
32. `report_templates`                ← v2.0 + linkedin/consensus/knowledge-panel sections
33. `generated_reports`               ← v2.0 + mention_source/linkedin/consensus/entity-home columns
34. `report_delivery_schedules`

### Layer 7 — Governance Intelligence (Sprint 8) — 4 tables
35. `audit_trail`
36. `org_members`
37. `data_residency_log`
38. `org_feature_flags`

### Phase 1 table column additions (nullable — no breaking changes)
- `audits`:    config_bundle_id, config_digest, estimated_cost_cents, quality_status
- `citations`: cited_source_type, cited_source_engine_affinity             ← [GAP 4]

### Phase 2 table column additions (nullable — no breaking changes)
- `content_structure_audits`: days_since_published, freshness_risk,
  content_format_detected, citation_probability_score                      ← [GAP 8]
  is_entity_home_candidate, entity_home_has_org_schema,
  entity_home_has_id_field, entity_home_same_as_count,
  entity_home_page_url                                                     ← [GAP 12]
- `brand_entity_scores`: knowledge_panel_present, knowledge_panel_accurate,
  knowledge_panel_url                                                      ← [GAP 11]
  wikidata_entry_present, wikidata_entry_url                               ← [GAP 13]
- `visibility_trends`: mention_rate, citation_rate,
  mention_source_ratio, brand_archetype                                    ← [GAP 9]
  citation_volatility_score                                                ← [GAP 15]

**Total new Phase 2 tables: 37**
-- Note: brand_entity_scores moved from new tables to Phase 1 ALTER TABLE
**Phase 1 table structural additions (all nullable, no breaking changes):**
- `audits`:               4 nullable columns (config_bundle_id, config_digest, estimated_cost_cents, quality_status)
- `citations`:            2 nullable columns (cited_source_type, cited_source_engine_affinity)
- `brand_entity_scores`:  20 nullable columns (organization_id, market_code, local_reg_verified, local_reg_number, hipages_present, hipages_rating, yellow_pages_present, service_seeking_present, word_of_mouth_present, word_of_mouth_rating, local_directory_count, local_directory_details, wikipedia_local_present, wikipedia_local_url, au_tld_present, knowledge_panel_present, knowledge_panel_accurate, knowledge_panel_url, wikidata_entry_present, wikidata_entry_url) — entity_score is NOT among them: Phase 1 score_of_10 NUMERIC(5,2) IS the canonical entity score (D-01 fix removed the duplicate)
  [Note: scored_at NOT added — Phase 1 checked_at continues to serve this purpose]
**Total column additions to Phase 2 tables (within Phase 2 tables only): 15 columns across 3 tables**

---

## PHASE 2 SPRINT PLAN (v4.0)

### Sprint 1 — Platform Foundation (4 weeks)
Install ChatGPT LLD v7 guardrails. No user-facing features.
Tables 1–7. Services: 5 platform services. Config validation CLI.
v3.0: max_fan_out_sub_queries updated to 12 in budget policies.
**Acceptance:** All Phase 1 audits unchanged. CI passes config:validate.

### Sprint 2 — Workflow Intelligence (4 weeks)
Layer 5: tasks, content drafts, validation reaudit.
Tables 29–31. (remediation_tasks=29, workflow_runs=30, content_drafts=31)
v3.0: content_format column on content_drafts; format recommendation
by engine × query type; linkedin_gap_source + consensus_gap_source
on remediation_tasks.
**Acceptance:** Recommendation → Task → Draft (with format label) →
Approve → Mark complete → Reaudit measures lift + fan-out improvement.

### Sprint 3 — Visibility Intelligence + Market Gaps (4 weeks)
Layer 2: SoV, trends, prompt volume, fan-out (3-12), topical gaps,
citation source classifier, Brand Web Mentions, Citation Volatility,
**Citation Failure Diagnosis** (Competitor PRD D2 — Must Have).
Tables 12–18.
v3.0: mention_rate, citation_rate, mention_source_ratio, brand_archetype
columns on visibility_trends; Mention-Source Divide 2×2 matrix.
v5.0: brand_web_mentions table; citation_volatility_score column on
visibility_trends; track-brand-web-mentions Inngest function scheduled
weekly; AU subreddit seed list for vertical pack matching.
v7.0: Citation Failure Diagnosis surface — uses existing citation_source_intelligence,
comparison_prompt_results, and topical_coverage_gaps data to explain *why* a brand
is absent from AI citations for a given prompt. No new table needed — diagnosis is
computed from existing Phase 2 data at read-time via lib/visibility/citation-failure-diagnosis.ts.
// INPUT SHAPE for lib/visibility/citation-failure-diagnosis.ts:
// async function diagnose(input: {
//   brandId: string;        // required — scopes all queries to this brand
//   auditId?: string;       // optional — if provided, scopes to specific audit; else uses latest
//   promptId?: string;      // optional — if provided, scopes diagnosis to single prompt
// }): Promise<CitationDiagnosis[]>
//
// The function reads 3 existing tables:
//   1. citation_source_intelligence — what sources ARE cited (source_type, citation_count)
//   2. comparison_prompt_results    — competitor was cited instead (brand_won=false, competitor_domain)
//   3. topical_coverage_gaps        — brand has no content for topics where competitors are cited
// Returns an array of CitationDiagnosis objects (patternKey, severity, evidence) matching the
// CitationFailureDiagnosis.tsx component's CitationDiagnosis type interface.
UI: `/brands/[brandId]/visibility/citation-failure` page using CitationFailureDiagnosis.tsx
(component already exists in outputs). Explains missing citation patterns, compares
to competitor citations, highlights weak content signals, evidence-backed remediation.
**Acceptance:** After each audit — SoV calculated, fan-out simulated
(up to 12 sub-queries), topical gaps scored, sources classified,
Mention-Source archetype assigned, citation volatility score computed.
Weekly: Reddit/YouTube/Quora mentions scraped and stored per brand.
Action Center fires when mention count < vertical benchmark or
volatility score > 15.0.
Citation Failure Diagnosis available for any prompt where brand was absent.

**COMPETITIVE BENCHMARK WORKSPACE (ChatGPT review finding — GAP 8 / SE8; no new tables):**
Sprint 3 data (SoV, topical gaps, citation sources) all exists per competitor.
Sprint 3 MUST also deliver a Competitive Benchmark Workspace UX tab that joins these
into a single competitor-scoped view. No new tables — pure query design + UX.

Route: `GET /api/brands/[id]/competitive-benchmark?competitor=<domain>`
Reads: `share_of_voice_snapshots` + `topical_coverage_gaps.competitor_coverage` +
       `comparison_prompt_results` (built in Sprint 7, but SoV + topical data available Sprint 3)

Sprint 3 delivers the data layer and a basic benchmark panel. Sprint 7 completes it
when `comparison_prompt_results` data is available.

NULL HANDLING (CPR-01 fix v8.38): The route MUST handle the case where comparison_prompt_results
has no rows (Sprint 3-6 period before Sprint 7 runs). Response shape when table is empty:
  {
    shareOfVoice:    { ... },  // always present (SoV from share_of_voice_snapshots)
    topicalGaps:     [ ... ],  // always present (from topical_coverage_gaps)
    comparisonData:  null,     // NULL when comparison_prompt_results has no rows
    competitorNarrative: null, // skip generateText call when comparisonData is null
    dataAvailableFrom: 'Sprint 7', // UI shows: "Head-to-head comparison available after next audit cycle"
  }
UI contract: when comparisonData is null, show a "Coming soon" placeholder card, NOT an error.
This prevents a broken Sprint 3 page in the 4-sprint window before Sprint 7 ships.

Growth tier: 1 competitor. Agency: 3 competitors. Agency Pro: unlimited competitors.
UI (Sprint 9 for full view; Sprint 3 for data + basic card):
```
COMPETITOR: [competitor domain]
Citations this month:  You 34%  vs  Them 67%   ↓ gap: -33%
Topics they own:       7 topics where they appear and you don't
Why they're winning:   "[top topical gap reason from diagnosis]"
Your fastest path:     "[cross_prompt_impact highest gap action]"
```
This is the highest-value agency retention feature. An agency account manager
uses this in every client meeting. Add it as a locked teaser card for Starter:
"[Competitor] appears 2× more than you in AI search — see full breakdown → Growth"

### Sprint 4 — Communication Intelligence (4 weeks)
Layer 6: narrative reports, delivery schedules, white-label PDF.
Tables 32–34. (report_templates=32, generated_reports=33, report_delivery_schedules=34)
v3.0: LinkedIn performance + consensus sections in report templates.
**Acceptance:** Monthly report includes fan-out coverage, topical gaps,
Mention-Source archetype, LinkedIn presence summary.

### Sprint 5 — Trust Intelligence (4 weeks)
Layer 3: hallucinations, evidence archive, entity scoring,
citation source intelligence, LinkedIn Presence Intelligence,
Cross-Platform Consensus Score, Knowledge Panel check, Wikidata check,
YouTube Presence Intelligence.
Tables 19–25 + ALTER TABLE column additions to brand_entity_scores (Phase 1 table).
Note: brand_entity_scores is a Phase 1 Sprint 7 table. Phase 2 Sprint 5 adds nullable
columns via ALTER TABLE — organization_id, market_code, hipages/directory typed columns,
wikipedia_local_*, local_reg_*, knowledge_panel_*, wikidata_* (entity_score excluded — score_of_10 is canonical, D-01).
Sprint 7's technical-audit-run.ts continues writing Phase 1 columns; Phase 2 extends them.
v6.0: youtube_presence_audits table; audit-youtube-presence Inngest
function runs monthly; youtube-auditor.ts lib module.
**Acceptance:** Hallucinations flagged. Entity score runs monthly
(Priority 1 for SMB/tradie). LinkedIn presence scored monthly.
Consensus check flags discrepancies. Knowledge Panel status detected.
Wikidata entry checked. YouTube channel audited — long-form ratio,
chapter count, embedding page VideoObject schema, transcript presence.
Missing embedding page with schema triggers highest-priority Action Center.

### Sprint 6 — Retrieval Intelligence + Agent Readiness (4 weeks)
Layer 1: crawler logs, content structure, llms.txt versioning,
agent readiness, MCP check, content format advisor, Entity Home audit.
Tables 8–11 + column additions to content_structure_audits.
v4.0: is_entity_home_candidate, entity_home_has_org_schema,
entity_home_has_id_field, entity_home_same_as_count, entity_home_page_url
added to content_structure_audits; audit-entity-home Inngest function
runs after each content-structure pass.
**Acceptance:** Agent Readiness scored per brand. MCP check runs.
Content format detected per page. Freshness risk flagged.
Entity Home identified per brand, @id and sameAs count checked.
Missing @id or sameAs < 3 triggers Action Center recommendation.

### Sprint 7 — Conversational Discovery Intelligence (4 weeks)
Layer 4: journeys, multi-turn execution, competitor comparison.
Tables 26–28. (conversation_journeys=26, journey_run_results=27, comparison_prompt_results=28)
**NOTE (ChatGPT review v8.19 — SE7 / GAP 4):** Build the full data model and Inngest functions
as planned. However, gate the `conversation_journeys` CUSTOMER-FACING UX to Agency+ only.
Growth users see a locked teaser: "See how customers discover your brand through multi-turn
AI conversations → Agency A$499". Rationale: multi-turn journey simulation is a sophisticated
research feature that AU tradies and solo SMBs on Growth ($299/mo) will not use. Showing it
on the Growth dashboard adds noise without value. Agency account managers need it for client
intelligence reports.
`comparison_prompt_results` stays at Growth+ (it answers "am I winning vs competitor?" —
a simpler, high-value insight for all paid customers).
**Acceptance:** 3 pre-built journeys per vertical. Journey runs
against 4 engines. Comparison prompts per competitor.

### Sprint 8 — Governance Intelligence (3 weeks)
Layer 7: audit trail, team RBAC, data residency, feature flags.
Tables 35–38. (audit_trail=35, org_members=36, data_residency_log=37, org_feature_flags=38)
**Acceptance:** All actions logged. Team invite + brand-scoped access.
Data residency page accurate.

### Sprint 9 — AI Visibility Autopilot UX (3 weeks)
-- (Renamed from "Adaptive Segment-Aware UX" per ChatGPT review v8.19 — SE9 / GAP 10)
-- VisibleAU's positioning: Monitor → Explain → Prioritize → Execute → Measure
-- NOT: Monitor → Measure → Report
--
-- Sprint 9 must demonstrate ONE complete Autopilot loop end-to-end as its primary story:
--   Audit complete → #1 gap identified (Prioritize) → Explanation shown (Explain) →
--   Draft generated (Execute) → Customer approves in 1 click → Re-audit runs 48h later →
--   "Your citation rate improved 14%" displayed (Measure)
--
-- This loop already exists in the data model:
--   topical_coverage_gaps → remediation_tasks (priority ranked) → content_drafts (generated) →
--   content_drafts.status='approved' → workflow_runs triggers re-audit → score_after computed
-- Sprint 9 makes this loop VISIBLE to the customer — the aha moment for every Growth user.
--
-- ACTION PROGRESS TRACKER (must ship Sprint 9):
--   Growth+ dashboard: "4 of 11 gaps closed this month. Your citation rate: ↑8%"
--   Source: COUNT(remediation_tasks WHERE status='complete' AND updated_at >= period_start)
--   No new tables. One query. The most important retention metric not currently in the LLD.
--   Losing customers say "I don't know if this is working." The tracker answers that.
--
-- AI VISIBILITY HEALTH CHECK packaging (Sprint 10, but spec here for continuity):
--   Sprint 10 must label the post-first-audit experience as "Your AI Visibility Health Check"
--   — not a raw audit results page. Traffic-light status per section. One recommended action.
--   This is the aha moment that converts trial users into paying customers.
--
-- MentionDesk review finding: Per-prompt historical trend view is one of the
-- most-praised features across multiple competitors. VisibleAU has all the data
-- already (citations table stores every individual LLM call with brandMentioned flag).
-- Add a per-prompt trend chart to the existing prompt results view (Growth+):
--   GET /api/brands/[id]/prompts/[promptId]/trend
--   Query: SELECT DATE_TRUNC('week', c.created_at) as week,
--            COUNT(CASE WHEN c.brand_mentioned THEN 1 END)::float /
--            NULLIF(COUNT(*), 0) AS mention_rate
--          FROM citations c
--          JOIN audits a ON c.audit_id = a.id
--          WHERE a.brand_id = ? AND c.prompt = ?
--          GROUP BY week ORDER BY week
--   Note: citations has no brand_id column — must JOIN audits to filter by brand.
--         (Fix v8.16: original query used citations.brand_id which does not exist;
--          citations.audit_id → audits.brand_id is the correct join path.)
--   UI: small sparkline chart under each prompt row in the results table
--   Shows: weekly mention rate for that specific prompt over last 12 weeks
--   e.g. "best plumber Bondi": 8% → 12% → 22% → 34% (trend visible)
--   Sprint 9 Growth+ — no schema change, one new read-only API route.
No new tables. Pure frontend personalisation.
- Agency: multi-brand command centre + cross-brand task queue
- SMB: health check + top 5 fixes + Mention-Source archetype
  + LinkedIn presence score + Knowledge Panel status
  + brand mention count vs vertical benchmark
- Local tradie: suburb visibility + agent readiness
  + AU directory checklist (Priority 1) + consensus score
  + Entity Home check + Wikidata entry status
  + Reddit mention feed (AU subreddits)
  + YouTube presence score + embedding page gap alert
- Persona layer (Growth+): prompt results dropdown filter by persona_tag
  + 'All' (default) | vertical-specific persona values
  + Locked card with upgrade CTA for Free/Starter
  + No new API — existing /api/brands/[id]/audit-results?persona=cto filter
    reads vertical_pack_prompts.persona_tag via JOIN on citations.promptId
- Buyer Stage filter (Growth+): existing category → Awareness/Consideration/Decision
  + No new column — pure UI label mapping (Z-02)
- SWOT Prompt Analysis (Growth+):
  -- Otterly's GEO Audit surfaces a SWOT framework per brand — the clearest client-facing
  -- output in the category. Otterly's SWOT is prompt-level, not brand-level.
  -- VisibleAU has all the data. What's missing is the framing.
  -- Derived from EXISTING Phase 2 tables — no new queries, no new tables:
  --   Strengths: comparison_prompt_results WHERE brand_won=true, citation_rate > 50
  --              "Prompts where you consistently outrank competitors"
  --   Weaknesses: topical_coverage_gaps WHERE gap_severity='critical'
  --               comparison_prompt_results WHERE brand_won=false, recurring across 3+ audits
  --               "Prompts where competitors beat you every time"
  --   Opportunities: prompt_volume_estimates WHERE estimated_monthly_volume > median
  --                  AND brand citation_rate < 20 (high volume, low presence)
  --                  "High-traffic prompts where no brand dominates yet"
  --   Threats: comparison_prompt_results WHERE competitor_citation_rate is INCREASING
  --            (trending up over last 3 periods) on prompts where brand_won=true previously
  --            "Competitors gaining momentum on your strongest prompts"
  -- UI (Sprint 9 audit results, Growth+ tab labelled "SWOT Analysis"):
  --   4 colour-coded sections, 3-5 prompt examples each, plain English
  --   Agency tier: exportable SWOT PDF for client reports
  --   No new API endpoint — computed at read-time from existing data joins
**Acceptance:** Tier + role → correct default dashboard per segment.

-- AI VISIBILITY HEALTH CHECK — UX PACKAGING SPEC
-- (ChatGPT review finding — GAP 6 / SE6; references Phase 1 Sprint 10 onboarding)
-- Phase 1 Sprint 10 builds the post-signup first-audit flow.
-- Phase 2 Sprint 9 must add a "Health Check" UX layer on top of that first-audit result.
-- This is UX packaging of existing data — no new tables, no new API endpoints.
--
-- After first Phase 1 audit completes (Sprint 10 onboarding flow):
--   → Redirect to /brands/[brandId]/health-check instead of raw /audits/[id]/results
--   → Health Check page synthesises Phase 1 multidim + Sprint 7 technical + Sprint 6 agent readiness
--   → Presents as 5 scored sections with traffic-light status and plain-English interpretation
--   → Shows exactly ONE recommended action (not the full Action Center list)
--   → "Start this action →" CTA leads into the Autopilot execution loop
--
-- HEALTH CHECK OUTPUT (derived from existing data at display time — no new columns):
--   AI SENTIMENT     → audits.scoreSentimentNumeric       (green ≥70 / amber 40-69 / red <40)
--   AI PRESENCE      → audits.scoreFrequency              (green ≥60 / amber 30-59 / red <30)
--   SITE READINESS   → technical_audits.scoreComposite    (green ≥75 / amber 45-74 / red <45)
--   LOCAL AUTHORITY  → agent_readiness_scores.local_ai_trust_score (skip for SaaS brands)
--   #1 ACTION        → remediation_tasks WHERE status='open' ORDER BY priority LIMIT 1
--
-- WHY THIS IS THE HIGHEST-VALUE UX DECISION IN PHASE 2:
--   The first 10 minutes determines renewal. A raw audit results page with 5 dimension scores
--   and 11 action types causes abandonment. A Health Check with 5 traffic lights, 5 plain-English
--   sentences, and 1 clear action creates the aha moment that converts trial users to paid customers.

---

## EXTENSION POINTS — PHASE 3

### Phase 3 — Conversation Explorer (real user prompt data)
Layer 2. `prompt_volume_estimates.data_source` accepts 'panel_partner'
with no schema change.

### Phase 3 — MCP Server Scaffolding (generation, not just checking)
Layer 1 already checks MCP readiness (Phase 2 Sprint 6).
Phase 3 generates the actual MCP server JSON.
New table: `mcp_server_configs`

### Phase 3 — Multi-Region Expansion
All tables that need market context now carry `market_code` (added v5.0):
`brand_web_mentions`, `brand_entity_scores`, `linkedin_presence_audits`,
`brand_consensus_checks`. Plus the Platform Foundation tables from v1.0:
`config_bundle_cache`, `market_ai_budget_policies`, `sampling_policies`,
`metric_quality_gates`, `prompt_pack_coverage`, `provider_market_capabilities`.

Adding NZ_EN or UK_EN requires:
- New seed rows in `config_bundle_cache` (market_code='NZ_EN', locale='en-NZ')
- New rows in `market_ai_budget_policies`, `sampling_policies`, `metric_quality_gates`
- New rows in `provider_market_capabilities` for NZ/UK locale
- New vertical pack seed data for NZ/UK verticals
- New `brand_web_mentions` community platform seed list (r/newzealand, r/auckland etc)
- New `brand_entity_scores` directory seed data (NZ: Neighbourly, Localist;
  UK: Yell, Checkatrade, Trustpilot) stored in `local_directory_details` JSONB
- New `agent_readiness_scores` check: `entity_local_reg_in_schema` resolves
  NZBN for NZ, Companies House for UK via market_code on the brand record

**Zero schema changes needed for Phase 3 expansion.**
All region-specific logic is driven by `market_code` seed data.

---

## STRATEGIC NOTE — MONITORING COMMODITISATION + REDDIT SIGNAL (v5.0)

Source: Amy Wu Martin (X, April 2026) — Amplitude launching free GEO/AEO monitoring.
Reddit finding: Optimising AU (March 2026), Tinuiti Q1 2026, Ahrefs 75K brand study.

**Monitoring commoditisation:** Pure AI visibility monitoring is now free via
Amplitude. Pricing pressure on monitoring-only tools will compress within
12-18 months. VisibleAU's moat is not in monitoring.

**VisibleAU's moat is in:**

1. **Layer 5 — Workflow Intelligence:** Task → Draft (correct format per engine)
   → Approve → Reaudit with lift measurement. No free tool does this.

2. **Layer 6 — Communication Intelligence:** White-label reports delivered on
   schedule. Monitoring data is useless to a client who can't read a dashboard.

3. **AU-specific features:** Vertical packs (Tradies, Allied Health, SaaS),
   suburb-level trust radius, ABN verification, AU directory presence,
   AU Reddit subreddit tracking (r/australia, r/sydney, r/melbourne,
   r/AusFinance, vertical-specific). No global tool prioritises this.

4. **Algorithmic Trinity completeness (v4.0+):** Search Engines (visibility
   scores) + LLMs (citation tracking) + Knowledge Graphs (Knowledge Panel
   + Wikidata + Entity Home). Monitoring-only tools cover legs 1 and 2 only.

5. **Brand Web Mention Intelligence (v5.0):** The strongest single predictor
   of AI visibility is brand web mentions (r=0.664, 3× stronger than
   backlinks). No AU SMB tool tracks this. VisibleAU does.

6. **YouTube Presence Intelligence (v6.0):** YouTube mentions correlate at
   r=0.737 — the strongest predictor in the Ahrefs 75K-brand dataset.
   YouTube is #1 cited domain in Google AI Overviews. VisibleAU audits
   long-form ratio, chapter structure, embedding page VideoObject schema,
   and transcript quality — none of which any AU SMB GEO tool tracks.

**The Reddit finding for AU specifically:**
Reddit is the #1 cited source in 7 of 10 AU B2C verticals on ChatGPT.
Perplexity cites Reddit for 24-46.7% of all answers. Brands with strong
Reddit presence have 4× higher AI citation rates. Invisibility on Reddit
is worse for AI visibility than honest negative reviews. This is an
AU-specific moat: VisibleAU tracks AU subreddits that no global tool
maps to verticals.

**Build decision:** Sprint 2 (Workflow Intelligence) first, Sprint 3
(Visibility + Brand Web Mentions) second. Both are category-defining.

**Community platform seed data by market (Sprint 3 addition, Sprint P3 extended):**

| Market | Vertical        | Primary community platforms                                 |
|--------|-----------------|-------------------------------------------------------------|
| AU_EN  | AU Tradies      | r/australia, r/sydney, r/melbourne, r/brisbane, r/tradie    |
| AU_EN  | Allied Health   | r/australia, r/AskAnAustralian, r/AusHealthcare, r/physio  |
| AU_EN  | SaaS / Tech     | r/AusFinance, r/startups, r/australia, r/msp               |
| AU_EN  | All verticals   | r/AusFinance, r/AskAnAustralian, r/australianpolitics       |
| NZ_EN  | All verticals   | r/newzealand, r/auckland, r/wellington (Phase 3 seed data) |
| UK_EN  | All verticals   | r/unitedkingdom, r/london, r/AskUK (Phase 3 seed data)     |

These are stored as seed data rows — no schema changes needed for Phase 3.
Adding a new market = adding rows to the community platform seed config table.

---

## WHAT DOES NOT CHANGE IN PHASE 1

- All 30 Phase 1 tables: structure unchanged. 3 receive nullable column additions:
  `audits` (4 columns), `citations` (2 columns), `brand_entity_scores` (20 nullable columns added — Phase 1 Sprint 7 table extended by Phase 2 Layer 3).
  All other 27 Phase 1 tables untouched.
- All Phase 1 API routes: existing response shapes fully preserved
- All Phase 1 Inngest functions: unchanged; new Phase 2 functions added alongside
- All Phase 1 lib/ modules: unchanged; new Phase 2 modules in new folders
- All Phase 1 UI pages: enhanced with new components, not replaced
- Better Auth: no changes (confirmed final auth system — `betterAuth` from `better-auth` package, migrated from Clerk during Sprint 1 build via `visibleau-better-auth-setup.md`). Note: CLAUDE.md v1.5 and Foundations v1.12 still reference Clerk throughout — treat those as "Better Auth" per the setup doc's IMPORTANT OVERRIDE instruction
- Stripe products: no changes
- `subscriptions.tier`: canonical tier source — Phase 2 budget policy reads this, not `organizations.tier`
- `users.role`: continues governing org-level permissions; Phase 2 `org_members` adds brand-scoped access on top
- `organizations.region` / `brands.region`: unchanged; Phase 2 derives `market_code` from region at insert time
- Late Phase 1 column additions (Sprints 9–10): `brands.client_tag`, `organizations.ga4_measurement_id`, `organizations.ga4_api_secret`, `organizations.onboarding_complete`, `organizations.slug` — all present in production before Phase 2 build starts

