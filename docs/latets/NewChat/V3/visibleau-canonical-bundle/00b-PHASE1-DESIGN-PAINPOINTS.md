VISIBLEAU — PHASE 1 DESIGN PAIN POINTS → PHASE 2 PREVENTION (handoff companion)

Read this alongside visibleau-NEW-CHAT-HANDOFF.md. This document exists for one reason:
to explain WHY VisibleAU requires complete, exact design specification up front, and to give
you the concrete checklist that makes "get it right the first time" achievable rather than a slogan.

===============================================================================
WHY THIS DOCUMENT EXISTS — READ BEFORE PUSHING BACK ON THOROUGHNESS
===============================================================================

Phase 1 was built from sprint prompts plus a prototype that conveyed the GIST of each screen but
not the full SPEC. Wherever the prototype/prompt left a gap, Claude Code filled it with its own
defaults — and almost every gap became a defect that had to be fixed AFTER the build, screen by
screen. The result: a long tail of post-build UI-fix prompts (brand-detail, audit-results,
brands-list, action-center, action-detail, vertical-packs, vertical-pack-detail, overview,
audit-detail, two breadcrumb fixes, a server/client crash fix — and live-app bugs after that).

That rework is the cost of under-specification. It is more expensive — in Sri's weekend-paced
time and in the hired developer's time — than specifying completely the first time. So when Sri
asks you to "design properly and review properly, first time," that is not gold-plating; it is the
direct, evidence-based lesson of Phase 1. The Phase 2 prototype and sprint prompts must be COMPLETE
specifications so Claude Code cannot improvise the wrong thing.

This does NOT mean suppress judgment. It means: completeness is the default deliverable. If a
genuine ambiguity exists, resolve it by stating a clear, reasonable assumption and proceeding —
do not bounce the work back, stall, or ship a partial pass and call it done. Flag a true blocker
only when there is a missing CANONICAL decision you cannot reasonably assume; even then, propose a
default and keep going. Scoping questions are not a substitute for doing the work.

===============================================================================
THE CONCRETE COST (what Phase 1 under-specification produced)
===============================================================================

Each of these was a SHIPPED screen that then needed a rework prompt:

- Brand Detail        — build rendered only an inline form; the prototype specified FIVE sections.
                        Almost the entire page was missing. Required a full rewrite.
- Audit Results       — 7 issues; required a full component rebuild.
- Vertical Pack Detail— 11 issues (wrong h1 format, swapped KPI labels, missing button, missing
                        bottom card, missing sample text, wrong badge styles, wrong banner style…).
- Brands List         — rendered separate cards; spec wanted ONE wrapping card with a table of
                        clickable rows; also missing last-audit data (N+1 → needed lateral subquery).
- Action Center       — missing 3 KPI summary cards, missing Filter button, missing priority badge.
- Action Detail       — missing priority badge, missing impact meta line, generic breadcrumb.
- Vertical Packs       — missing "Active" badge, missing icon background wrapper.
- Overview / Audit detail — region shown raw ("NSW:Bondi"), engine shown "Chatgpt" not "ChatGPT".
- Breadcrumbs          — generic "Detail" instead of contextual ("Audit #N", pack name, short title);
                        wrong root ("Account" vs "Settings").
- Brands page          — runtime CRASH: mouse-handler event props added to a SERVER component.

===============================================================================
THE 9 ROOT-CAUSE PATTERNS (and the Phase 2 rule that prevents each)
===============================================================================

PATTERN 1 — WHOLE SECTIONS / COMPONENTS OMITTED  (the most damaging)
  Phase 1: Brand Detail built as one form (5 sections missing); Action Center missing 3 KPI cards;
  Pack Detail missing a whole bottom card + an action button.
  WHY: the prototype showed the screen's "feel" but didn't enumerate every section as a required,
  individually-specified block, so Claude Code built the obvious core and dropped the rest.
  PHASE 2 RULE: every screen in the prototype must contain an explicit, ordered SECTION INVENTORY —
  each section a fully-rendered block with its own header, content, and styling. If a section
  exists in the design, it exists in the prototype as real markup, not as an implied idea.

PATTERN 2 — WRONG LAYOUT STRUCTURE
  Phase 1: Brands List = separate cards instead of one card wrapping a table of rows; Brand Detail
  = inline form instead of multi-section layout.
  WHY: "a list of brands" was specified as intent, not as exact container structure.
  PHASE 2 RULE: specify the exact container hierarchy (card vs table vs grid; what wraps what;
  full-width clickable rows vs separate cards). The prototype's JSX structure IS the spec.

PATTERN 3 — BADGES & SMALL VISUAL ELEMENTS DROPPED
  Phase 1: priority badges, "Active" badges, neutral count badges, icon-in-soft-square wrappers —
  all omitted because they're "small."
  WHY: small elements read as optional decoration when not explicitly required.
  PHASE 2 RULE: every badge, pill, icon wrapper, and status chip is specified with its exact
  component, tone/variant, position, and the condition under which it renders. None are optional.

PATTERN 4 — LABELS & COPY WRONG OR SWAPPED
  Phase 1: Pack Detail KPI labels swapped (Categories / Sub-verticals / Active brands all wrong);
  h1 format wrong ("AU Tradies v1.0" vs "Tradies (AU)"); version in the wrong place.
  WHY: exact label text and ordering weren't pinned, so Claude Code guessed.
  PHASE 2 RULE: every visible label, KPI title, heading format, and meta-line composition is
  written verbatim in the prototype. Card titles and their order are exact, not approximate.

PATTERN 5 — GENERIC BREADCRUMBS / NON-CONTEXTUAL TITLES
  Phase 1: last breadcrumb was literally "Detail" on Audit, Action, and Pack pages; Billing used
  the wrong root ("Account" vs "Settings").
  WHY: breadcrumbs were placeholders, never specified to be derived from the entity.
  PHASE 2 RULE: every detail screen specifies its breadcrumb as a DERIVED value (e.g. "Audit #{n}",
  the pack/brand name, a truncated title) and the exact root segment. No static "Detail".

PATTERN 6 — DATA FORMATTING / ENUM DISPLAY NOT SPECIFIED
  Phase 1: region rendered raw "NSW:Bondi" instead of "NSW · Bondi"; engine rendered "Chatgpt"
  (naive capitalise) instead of "ChatGPT"; live bug "10prompts" missing a space.
  WHY: the transform from stored value → display value wasn't specified, so raw/naive output shipped.
  PHASE 2 RULE: for every field whose stored form differs from its display form (enums, region
  codes, engine ids, money, counts, dates), specify the exact display mapping/format in the
  prototype (e.g. an ENGINE_DISPLAY map; "split ':' join ' · '"; "200 LLM calls" with the space).

PATTERN 7 — DATA-LAYER GAPS SURFACING AS UI DEFECTS
  Phase 1: Brands List shipped without last-audit data (N+1 risk) → needed a lateral subquery
  (BF1); live bugs: 0 engines (tier→engine resolution) and audits.id='new' (flow wiring).
  WHY: the UI's data dependencies weren't named, so the query layer didn't provide them.
  PHASE 2 RULE: each screen spec names the EXACT data it needs and the query shape (joins, lateral
  subqueries, aggregates) — performance-correct (no N+1) per the project's non-negotiables. UI and
  its data contract are specified together, not separately.

PATTERN 8 — SERVER/CLIENT BOUNDARY ERRORS
  Phase 1: a hover effect was added via onMouseEnter/onMouseLeave on a SERVER component → runtime
  crash ("Event handlers cannot be passed to Client Component props").
  WHY: interactivity was added without deciding server vs client, or using a CSS-only alternative.
  PHASE 2 RULE: for every interactive element, state whether it belongs in a server or client
  component, and prefer CSS/Tailwind (hover:, group-hover:) over JS handlers where possible. If a
  handler is needed, the prototype marks that piece as a client component.

PATTERN 9 — DESIGN TOKENS / EXACT SPACING IMPROVISED
  Phase 1: original builds used ad-hoc colours/sizes; every fix had to re-specify exact tokens
  (var(--text-primary), var(--accent-blue-soft)), heights (h-8), font sizes (text-[13px]), radii.
  WHY: the prototype didn't pin tokens/spacing, so Claude Code invented inconsistent values.
  PHASE 2 RULE: the prototype uses the exact design-token variables and exact Tailwind utility
  values everywhere (this is the "fully Figma-style, completely specified" instruction). No bare
  hex, no guessed spacing — tokens and scale values are explicit on every element.

===============================================================================
PHASE 2 DESIGN-COMPLETENESS CHECKLIST (apply to EVERY screen + EVERY sprint prompt)
===============================================================================

Before declaring a Phase 2 prototype screen or sprint prompt "done," confirm ALL of these. If any
box can't be ticked, the spec is not finished — finish it; do not defer it.

SCREEN / PROTOTYPE
  [ ] Ordered section inventory — every section present as real, fully-styled markup (Pattern 1)
  [ ] Exact container hierarchy — card/table/grid structure pinned (Pattern 2)
  [ ] Every badge / pill / icon-wrapper / status chip specified: component, variant, position,
      render condition (Pattern 3)
  [ ] Every label, KPI title, heading format, meta line written verbatim and in correct order (Pattern 4)
  [ ] Breadcrumbs derived from the entity + correct root segment (Pattern 5)
  [ ] Display transforms specified for every stored→display field (enums, regions, engines, money,
      counts, dates) (Pattern 6)
  [ ] EMPTY state, LOADING state (skeleton), and ERROR/boundary state specified for every screen
      and every data-bearing section (non-negotiable: loading states + error boundaries)
  [ ] Mobile-responsive behaviour specified (breakpoints, what stacks/hides) — accessible markup
  [ ] Exact design tokens + Tailwind scale values on every element; no bare hex, no guessed spacing (Pattern 9)
  [ ] Server vs client marked per interactive element; CSS-first interactivity; handlers only in
      client components (Pattern 8)
  [ ] Tier-gating shown where it applies (which sections/actions are gated, at which tier), matching
      the LLD's gates — and "show tab / gate content" vs "hide" decided explicitly

SPRINT PROMPT
  [ ] Names the exact files to create/edit and whether each is server or client
  [ ] Names the EXACT data each screen needs and the query shape — performance-correct, no N+1,
      proper indexes/RLS (Pattern 7 + non-negotiables)
  [ ] References the canonical enums/tiers/route-param conventions from the LLD (no drift)
  [ ] States the empty/loading/error behaviour and the exact display transforms
  [ ] Ends with a verification list (typecheck, lint, the manual flow, the relevant test)

===============================================================================
HOW TO WORK SO THIS DOESN'T RECUR
===============================================================================

- Default to COMPLETE. Produce the whole spec/screen/prompt in one pass. Do not deliver a partial
  and offer to "continue if you'd like" — that is the deferral pattern Sri has explicitly ruled out.
- REVIEW against this checklist before presenting. A self-review pass that catches a missing badge
  or an unspecified empty state now is worth more than a fix prompt later.
- When you find an ambiguity, resolve it with a clearly-stated reasonable assumption and proceed;
  note the assumption inline. Reserve "I need a decision from you" for a genuinely missing canonical
  choice — and even then, propose the default you'd use.
- Hold the four non-negotiables (Performance, Security, Scalability, UX) on every deliverable; they
  are the same standard that turns "looks right" into "is right."
- Respond English first, then Telugu.

The goal is simple: make the Phase 2 prototype and sprint prompts so complete and exact that there
is no second UI-fix cycle. Phase 1 paid for that lesson; Phase 2 should not pay for it again.
