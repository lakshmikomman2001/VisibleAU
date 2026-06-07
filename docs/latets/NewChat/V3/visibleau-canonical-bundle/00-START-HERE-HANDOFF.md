VISIBLEAU — START HERE (Handoff to a new chat)

===============================================================================
SECTION A — CURRENT CANONICAL VERSIONS (USE EXACTLY THESE, IGNORE EVERYTHING ELSE)
===============================================================================

ACTIVE WORK — the files you will almost always touch:

| Artifact                | Use this EXACT file                          | Current version |
|-------------------------|----------------------------------------------|-----------------|
| Phase 2 LLD             | visibleau-7layer-lld.md                      | v8.55  (header: "# Version: 8.55") |
| Phase 2 prototype       | visibleau-prototype-phase2.jsx               | aligned to LLD v8.55 (fix-note lists FIX 1 v8.53 → FIX 4 v8.55) |

PHASE 1 (the built AU product) — canonical files:

| Artifact                | Use this EXACT file                          | Current version |
|-------------------------|----------------------------------------------|-----------------|
| Phase 1 prototype       | visibleau-prototype.jsx                      | canonical (final of the v2.59 draft line; ~44 screens) |
| Phase 1 "LLD"           | (NO single file — see note below)            | = Foundations + CLAUDE.md + Architecture + the 12 sprint prompts |
| PRD                     | visibleau-prd-v1.15.md                       | v1.15 |
| Foundations             | visibleau-foundations-v1.12.md               | v1.12 |
| Build rules             | CLAUDE.md                                    | canonical |
| Architecture            | visibleau-architecture-overview-v1.6.md      | v1.6 |
| Phase 1 sprint prompts  | 04-sprint-prompts/sri-visibleau-sprint-{1..12}-prompt.md | canonical (the UNVERSIONED files ARE the latest) |
| Sprint index            | 04-sprint-prompts/sri-visibleau-sprint-prompts-index.md  | canonical |

FUTURE / FORWARD-LOOKING + RESEARCH (read only when the task calls for it):

| Artifact                       | Use this EXACT file                                  | Version / status |
|--------------------------------|------------------------------------------------------|------------------|
| Phase 3 LLD (geographic)       | 08-future-phases/visibleau-phase3-lld.md             | v1.0 (forward-looking) |
| Phase 3 audit report           | 08-future-phases/visibleau-phase3-audit-report.md    | history |
| Multi-region infra plan        | 08-future-phases/sri-visibleau-multi-region-phase-2.md | v1.0 (deferred) |
| ChatGPT research + reviews     | 09-chatgpt-research/ (7 files — see Section D)        | mixed; some already applied |

THERE IS NO "PHASE 1 LLD" FILE. Phase 1's low-level design is spread across Foundations
(v1.12) + CLAUDE.md + Architecture (v1.6) + the 12 sprint prompts (each sprint prompt is the
build-level spec for that sprint). If someone asks for "the Phase 1 LLD," that set is it.

THERE IS NO SEPARATE "PHASE 2.5" BUILD. "Phase 2.5" is the name of a ChatGPT product-
enhancement review whose 6 recommendations were already selectively folded INTO the Phase 2
LLD at v8.55 (applied at v8.33 — search the LLD changelog for "Phase 2.5 Rec"). The only
standalone trace is a "Phase 2.5 — Expansion" roadmap section inside
09-chatgpt-research/visibleau-phase2-feature-analysis.md. Do not look for a Phase 2.5 LLD or
prototype — they do not exist.

-------------------------------------------------------------------------------
DANGER — DO NOT PICK THE WRONG FILE:

1. The Phase 2 prototype is the file with the "-phase2" suffix: visibleau-prototype-phase2.jsx.
   It has NO "-vX.XX" number.
2. Files named visibleau-prototype-vX.XX.jsx (e.g. v2.59) are OLD PHASE 1 prototype drafts.
   A high number like "v2.59" does NOT mean newer than "-phase2". They are different artifacts:
      visibleau-prototype-phase2.jsx  = PHASE 2 prototype (14 screens)   <- current
      visibleau-prototype.jsx         = PHASE 1 prototype (~44 screens)  <- current
      visibleau-prototype-v*.jsx      = stale Phase 1 drafts             <- IGNORE, never open
3. The Phase 2 LLD is a single file (visibleau-7layer-lld.md); its version lives inside it
   ("# Version: 8.55"). No LLD draft files exist to confuse.
4. Ignore EVERY "-vN.NN" dated draft of any file (sprint prompts, prototypes, master-bundle
   zips). This bundle ships only the canonical current files. If you are ever handed a folder
   of dated drafts, use ONLY the unversioned canonical names in the tables above.

SELF-VERIFY after extracting the bundle (run this; if it fails, tell Sri the bundle is stale):
   grep -m1 "^# Version:" **/visibleau-7layer-lld.md            # expect 8.55 (or higher)
   grep -m1 "FIX 4 (v8.55)" **/visibleau-prototype-phase2.jsx   # expect a match
   ls **/visibleau-prototype*.jsx                               # expect exactly two: .jsx and -phase2.jsx
If the LLD is not 8.55+ or the prototype fix-note is missing, STOP and report before any work.

===============================================================================
SECTION B — PHASE MAP (the word "Phase 2" is overloaded — read this once)
===============================================================================

Three different documents use "Phase 2/3" to mean different things. Disambiguate as follows:

- PHASE 1  = the built AU product, Sprints 1–12. (PRD + Foundations + CLAUDE.md + Architecture
  + 12 sprint prompts + visibleau-prototype.jsx.) STATUS: Sprints 1–6 built (UI-fix passes
  applied); Sprints 7–12 not yet built; the live app is being debugged screen-by-screen.

- PHASE 2 (ACTIVE — this is what "Phase 2 work" means in our sessions) = the 7-LAYER
  INTELLIGENCE PLATFORM. File: visibleau-7layer-lld.md (v8.55) + visibleau-prototype-phase2.jsx.
  9 sprints, ~34 weeks at weekend pace; Sprint 1 (Platform Foundation) is a hard prerequisite.
  Hardened through 36 conflict-audit passes. THIS is the primary design artifact.

- PHASE 2.5 = a ChatGPT product-enhancement REVIEW (Recs 1–6), already merged into the Phase 2
  LLD (v8.33). Not a separate build. See Section A.

- PHASE 3 (GEOGRAPHIC) = zero-code expansion to NZ/UK/CA. File:
  08-future-phases/visibleau-phase3-lld.md (v1.0) + its audit report. NOTE: this document uses
  its OWN phase taxonomy where "Phase 2 = US expansion, Sprints 13–19" and "Phase 3 = other
  English markets." That "Phase 2 (US)" is NOT the 7-layer platform. Forward-looking; not active.

- MULTI-REGION "PHASE 2" (INFRASTRUCTURE) = lifting infra into true multi-region. File:
  08-future-phases/sri-visibleau-multi-region-phase-2.md (v1.0). Deferred until revenue/regulation
  demands it. Yet another distinct meaning of "Phase 2." Not active.

When Sri says "Phase 2" in day-to-day work, assume the 7-layer intelligence platform
(visibleau-7layer-lld.md) unless they explicitly say "US expansion," "multi-region," or "geographic."

===============================================================================
> READ THIS WHOLE FILE FIRST, then read the canonical files BEFORE doing anything — no writing
> code, editing the LLD, touching a prototype, or designing sprint prompts until you've read the
> relevant files and confirmed the versions in Section A. Skipping the reads, or grabbing a stale
> draft, causes drift (wrong enums, tiers, routes, duplicated tables) — exactly what this project
> spends most of its effort preventing.
===============================================================================

COMPANION DOC — READ IT TOO: 00b-PHASE1-DESIGN-PAINPOINTS.md (also at
visibleau-PHASE1-DESIGN-PAINPOINTS.md) explains the Phase 1 under-specification that caused
~12 post-build UI-fix cycles, and the design-completeness checklist for Phase 2. If you feel
tempted to push back on doing thorough, first-time-right design/review work, read it first.

SECTION 0 — HOW THIS BUNDLE REACHED YOU, AND WHERE THE FILES ARE

A previous chat created all of VisibleAU's documents in ITS OWN container at
/mnt/user-data/outputs/. THAT FILESYSTEM DOES NOT CARRY OVER BETWEEN CHATS — each Claude chat
starts with a fresh, empty container. A new chat cannot see a prior chat's files on disk; they
must be UPLOADED. This bundle (visibleau-canonical-bundle.zip) is how the files travel. If you
are reading this, Sri uploaded it; the files are at /mnt/user-data/uploads/ (possibly still zipped).

   ls -la /mnt/user-data/uploads/
   mkdir -p /tmp/visibleau && unzip -o /mnt/user-data/uploads/visibleau-canonical-bundle.zip -d /tmp/visibleau
   find /tmp/visibleau -type f | sort

Read from where they extracted (e.g. /tmp/visibleau/visibleau-canonical-bundle/...). Do NOT
assume /mnt/user-data/outputs/ already holds them — verify on disk first.

BETTER LONG-TERM HOME: a Claude Project. Put this bundle's files into the Project's knowledge and
start every VisibleAU chat inside that project. For large files Claude must read with tools (the
LLD is ~590 KB), uploading the zip per chat is still the most reliable way to get them onto disk.

-------------------------------------------------------------------------------
SECTION 1 — WHO YOU'RE WORKING WITH AND HOW TO RESPOND

- Sri — Sydney-based solo full-stack developer (16+ yrs), full-time job in financial services,
  building VisibleAU as a side project at weekend pace (~8 hrs/week), with a full-time developer
  hired for the build.
- BILINGUAL RESPONSES ARE MANDATORY. Every response: English first, then the same content in
  Telugu. Code and technical terms stay in English even inside the Telugu portion.
- NON-NEGOTIABLE first-class concerns for ALL work: Performance, Security, Scalability, UX Design
  — optimised DB queries, indexing, RLS, no N+1s, secure auth, accessible + mobile-responsive UI,
  loading states, error boundaries, production-grade code. No corner-cutting.
- EXECUTION PRINCIPLE: "do it first and get it right the first time." For Phase 2 sprint
  prompts/prototypes, execute completely and correctly on the first attempt — no pushback/stalling.
- PROTOTYPE FIDELITY: Phase 2 prototypes must be fully Figma-style with completely specified UI
  styles (NexusBook approach) so Claude Code does not miss styling.

-------------------------------------------------------------------------------
SECTION 2 — WHAT VISIBLEAU IS

An AI-search-visibility auditing SaaS for the Australian market: audits how brands appear across
AI engines (ChatGPT, Claude, Gemini, Perplexity), scores visibility, detects hallucinations,
tracks citations, and (Phase 2) adds the 7-layer intelligence platform.

Architecture (locked): Next.js 15+ App Router (server components for DB reads, client for
interactivity) · Supabase Postgres + RLS + Drizzle ORM · Better Auth (migrated from Clerk in
Phase 1) · Inngest for background jobs · Vercel AI SDK with a central model selector
(lib/llm/model-selector.ts — never hardcode model strings). Tiers: Free / Starter / Growth /
Agency / Agency Pro (pricing A$99 / A$299).

-------------------------------------------------------------------------------
SECTION C — WHAT'S IN THIS BUNDLE (folders inside visibleau-canonical-bundle/)

01-foundational/   PRD v1.15, Foundations v1.12, CLAUDE.md, Architecture v1.6  (read first, in order)
02-phase2-lld/     visibleau-7layer-lld.md  (Phase 2 LLD v8.55 — read its changelog block first; ~8,600 lines)
03-prototypes/     visibleau-prototype.jsx (Phase 1)  +  visibleau-prototype-phase2.jsx (Phase 2)
04-sprint-prompts/ the 12 canonical Phase 1 sprint prompts + index
05-ui-fix-prompts/ Phase 1 screen-by-screen UI corrections (Sprints 1–6)
06-bug-fix-prompts/ fix-run-audit-new-uuid-error.md (RESOLVED) + fix-audit-zero-engines.md (OPEN)
07-supporting/     local-stack (+ conflict-audit), better-auth-setup (+ conflict-audit-v3),
                   external-services-guide, citation-diagnosis-spec, claude-code-reading-order
08-future-phases/  Phase 3 LLD v1.0 + Phase 3 audit report + multi-region Phase 2 plan v1.0
09-chatgpt-research/ Phase 2 feature-analysis (contains the "Phase 2.5 — Expansion" section),
                   chatgpt strategic-review-response, two Phase 2 ChatGPT handoffs, and the
                   three original 07-chatgpt-review files (see Section D)

-------------------------------------------------------------------------------
SECTION D — CHATGPT RESEARCH / REVIEW WORK (in 09-chatgpt-research/)

These capture independent ChatGPT product/strategy input and Claude's responses. Some of it is
ALREADY APPLIED to the LLD; treat the rest as advisory history, not canonical truth.

- chatgpt-original-market-research.md            — ChatGPT's original market research input (history)
- chatgpt-original-killer-features-and-pain-points.md — ChatGPT's original feature/pain-point input (history)
- visibleau-chatgpt-review-assessment.md         — assessment of ChatGPT's review
- visibleau-phase2-feature-analysis.md           — Phase 2 feature analysis; includes "Phase 2.5 — Expansion"
- visibleau-phase2-chatgpt-handoff.md            — handoff prepared FOR ChatGPT (Phase 2)
- visibleau-phase2-lld-chatgpt-handoff.md        — handoff FOR ChatGPT to review the Phase 2 LLD
- visibleau-chatgpt-strategic-review-response.md — Claude's point-by-point response to ChatGPT's
                                                   strategy review (reviewed LLD v8.18)

IMPORTANT: ChatGPT's "Phase 2.5" review recommendations (Recs 1–6) are ALREADY merged into the
Phase 2 LLD (v8.55; applied at v8.33). Do not re-apply them — the LLD is the source of truth.

-------------------------------------------------------------------------------
SECTION 4 — THE CONFLICT-AUDIT METHODOLOGY (the core ongoing activity)

Most sessions are conflict-audit passes on the Phase 2 LLD and prototype. Follow exactly:

1. Read the Phase 1 sprint prompts, CLAUDE.md, Foundations, the CURRENT LLD (v8.55), and the
   Phase 2 prototype.
2. Pick a GENUINELY FRESH ANGLE each pass (don't repeat a prior angle — the LLD changelog lists
   what's already been checked).
3. Find conflicts. For EACH, FIRST assess which document is authoritative (LLD schema = canonical
   for data shapes/enums; prototype = canonical for UI/UX layout; Phase 1 sprint prompts =
   canonical for already-built behavior). THEN fix it in the correct document — LLD or prototype.
4. VERSION-BUMP the LLD (v8.55 -> v8.56) with a detailed changelog entry: the conflict, the
   authoritative-document assessment, the fix, and what was confirmed clean. Update the prototype's
   header fix-note when the prototype is edited.
5. VERIFY before presenting: 37 CREATE TABLEs, all 16 GAPs, serve() = 25/25 Inngest functions,
   no cron collisions, prototype braces/parens balance (global { == } and ( == ); the naive
   scanner false-negatives on braces inside strings/JSX, so check edited regions too).
6. present_files the changed document(s). THEN Sri must download them and re-upload to the next
   chat (or update the Project) — outputs do not persist across chats (Section 0). The new chat
   must always re-confirm the version table in Section A.

GOTCHA: when a changelog/fix-note DESCRIBES a corrupted string you just fixed, do NOT reproduce
the corrupted literal in the note — it re-introduces the string future greps look for. Describe
the change in prose.

-------------------------------------------------------------------------------
SECTION 5 — KEY LOCKED FACTS (don't re-litigate settled decisions)

- 37 tables, 16 GAPs, 25 Inngest functions (serve() = 25/25) — invariants.
- Tiers & gates: Journeys = Agency+ (regated from Growth+ in v8.19). Competitors: Growth=1,
  Agency=3, Agency Pro=unlimited. Engines: Free = 2 (ChatGPT + Perplexity), all paid = 4
  (TIER_ENGINES in lib/llm/tier-engines.ts is the single source of truth — never hardcode 4).
- agent_readiness_scores: 5 dimensions (Technical Accessibility, Entity Clarity, Claim
  Verifiability, Category Authority, Task-Fit Signals) x /20 = /100; append-only. Distinct from
  Phase 1 technical_audits (8 sub-scores /18,/16...). Do not conflate.
- Route params: PAGE routes use [brandId]; API routes use [id] — separate route trees, must NOT
  be unified (RP-01).
- Status enums: remediation_tasks.status = open|in_progress|ready_for_review|complete|wont_fix
  (NOT 'done'). workflow_runs.status = scheduled|running|completed|failed ('-ed'). audits.status
  = 'complete'. TEXT enums have NO CHECK — validation is app-layer Zod; CHECK only for RLS.
- Report status is UI-derived (no column): pdf_url NULL -> generating; set + email_sent_at NULL
  -> ready; email_sent_at set -> published.
- Inngest events: internal = slash (audit/complete); external webhooks = dots (audit.completed).
  Internal slash events must NOT appear in VALID_EVENTS.
- Retention: audit-data-retention.ts (Sunday cron) — audits (12mo) + crawler_visit_logs (90d) +
  brand_web_mentions (180d), the latter two added during Phase 2 Sprints 6/5.

-------------------------------------------------------------------------------
SECTION 6 — MOST RECENT ACTIVITY (live Phase 1 app debugging)

The last turns moved from doc-auditing to debugging the running app. Two Run-audit bugs:

1. audits.id = 'new' crash (RESOLVED). Run audit hit the audit-detail page with auditId = "new";
   Postgres rejected the non-UUID. Fix: 06-bug-fix-prompts/fix-run-audit-new-uuid-error.md
   (create-then-redirect to the returned auditId + UUID guard -> notFound()). Button now navigates
   correctly to the progress page.
2. "0 engines / 0 LLM calls" (OPEN — pending). On an Agency-tier brand the progress page shows
   "Querying 0 engines x 10 prompts x 5 runs = 0 LLM calls" at 0%. Root cause: tier->engine
   resolution returns an EMPTY list (not even Free's 2). The progress screen itself is correct per
   the Phase 1 prototype's AuditRunning — it truthfully renders a row created with 0 engines. Fix:
   06-bug-fix-prompts/fix-audit-zero-engines.md (investigate tier value vs TIER_ENGINES keys /
   org-join / empty default; fix at source; never let an empty engine list reach the row; also
   fixes a cosmetic "10prompts" missing-space). LIKELY THE NEXT THING SRI PICKS UP.

For any new live-app bug: diagnose from the actual error text, cross-check the relevant sprint
prompt + prototype for intended behavior, decide built-code-bug vs spec-gap, and (when asked)
write a Claude Code fix prompt that tells Claude Code to INVESTIGATE THE REAL FILES FIRST and
verify with typecheck + lint + the relevant test + the manual flow.

-------------------------------------------------------------------------------
SECTION 7 — HOW TO START YOUR FIRST RESPONSE

1. Extract the bundle (Section 0), run the Section A self-checks, and confirm to Sri that the
   Phase 2 LLD reads v8.55 and the Phase 2 prototype shows the v8.55 fix-note. State which
   canonical files you loaded.
2. Ask Sri what's next (continue Phase 2 LLD/prototype conflict audits? apply the open
   fix-audit-zero-engines.md? begin Phase 2 sprint-prompt design? fix another live screen?).
3. Respond English then Telugu; hold the Performance / Security / Scalability / UX non-negotiables.
