# VisibleAU — Phase 1 START-HERE Handoff (for a new chat)

**Generated:** 2026-06-22 · **Owner:** Sri (solo dev, Sydney, weekend pace + 1 hired dev)
**Purpose:** Give a fresh chat enough context to act as the **reviewer/spec chat** for VisibleAU Phase 1.

---

## 1. What VisibleAU is
AU-first **GEO/AEO visibility-auditing SaaS** (Generative/Answer Engine Optimization) for Australian
SMBs and agencies. It audits how visible a brand is across AI engines (ChatGPT, Claude, Gemini,
Perplexity) and scores it (composite + 4 dimensions: Frequency, Position, Sentiment, Accuracy). Built on
Next.js (App Router), Drizzle ORM, Postgres, Better Auth, Inngest (background jobs), Resend (email).

## 2. The two-chat relay workflow (IMPORTANT — how to operate)
- **THIS chat = the reviewer/spec chat.** It reads canon, verifies built features against canon, and
  authors **ready-to-paste Claude Code fix prompts**. It does NOT write the app code directly.
- **A separate Claude Code chat = the builder.** It applies the prompts to the Next.js repo.
- Sri relays between them and sends screenshots / Claude Code reports back here for verification.
- **The container resets between chats** — re-extract canon each session; deliverables are downloaded.

## 3. Binding working agreements (carry these forward)
1. **English only** by default (Telugu translation OFF unless explicitly asked in-conversation).
2. **Verify-before-claim:** grep ACTUAL canon; never trust a handoff/summary/Claude-Code self-report
   without checking. "Typecheck passes + code reported done ≠ works on real data" — verify against live
   data/screenshots. (This bit us 3× this session — see §6.)
3. **LLD/sprint-prompt = actual scope; prototype = aspirational richer vision.** On conflict, build
   follows canon (LLD/sprint prompt), not the prototype. When canon is SILENT → FLAG it, don't invent.
4. **Default: give a ready-to-paste Claude Code fix prompt for EVERY issue** (incl. LOW/cosmetic),
   scoped to file + exact change + verification greps.
5. **Performance / Security / Scalability / UX = first-class.** Optimized queries, indexing, RLS, no
   N+1s, secure auth, accessible + mobile-responsive UI, loading/error states, production-grade.
6. **NO fabricated/mock data in scoring or client-facing paths.** This is a TRUST product — a report
   that invents a number is the worst possible bug. Honest empty states > fake fallbacks. (Enforced
   repeatedly this session: removed a hardcoded "72.4" from the PDF builder + branding preview; kept
   "No completed audit" honest empty states; no fabricated portal counts / recommendations / per-engine
   numbers.)
7. **str_replace / exact-literal edits only** in fix prompts.

## 4. Canon locations (re-extract each session — container resets)
The canonical Phase 1 source lives in this bundle:
- `01-foundational/` — PRD v1.15, foundations v1.12, architecture overview v1.6, CLAUDE.md
- `02-lld/visibleau-7layer-lld.md` — the 7-layer LLD (underpins the build)
- `03-prototype/visibleau-prototype.jsx` — the Phase 1 prototype (~4600 lines; aspirational UI)
- `04-sprint-prompts/` — Sprint 1–12 prompts + index (the actual build scope)
- `05-original-fix-prompts/` — UI + bug fix prompts authored BEFORE this session
- `06-session-fix-prompts/` — fix prompts authored THIS session (agency surface, PDF, Sprint 8/9) — see §6
- `07-supporting/` — Better Auth setup, local stack guide, external services, Claude Code reading order
  (read `visibleau-claude-code-reading-order.md` first if building)

## 5. Dev / Prod two-mode setup (caused repeated confusion — read this)
Sri runs **START-DEV.bat** and **START-PROD.bat**:
- **Dev:** database `visibleau` + `LLM_MODE=mock` (mock LLM responses).
- **Prod:** database `visibleau_prod` + `LLM_MODE=real` (real engine calls).
- **KEY:** real audit data exists in BOTH — the dev DB DOES have Bondi/Marrickville audits (Bondi 88.3,
  Marrickville 13.8). UI/structure/nav verification works fine in dev. Only fresh **real-LLM** audits
  need prod mode.
- **Lesson:** when a data-dependent feature looks empty, FIRST ask "am I in the right database?" before
  "is this a bug?" — but DON'T over-attribute to dev/prod either (a real regression this session was
  initially mis-attributed to dev/prod; Sri's pushback was correct). The disambiguator: if `/overview`
  and the feature DISAGREE in the SAME DB, it's a code bug; if they agree (both empty), it's the DB.

## 6. What was done THIS session (agency surface + PDF builder + Sprint 8/9)
All fix prompts are in `06-session-fix-prompts/`. Status as verified by Sri's screenshots:

### Sprint 8 (verified PASS)
- **Local SEO GMB card** (`visibleau-local-seo-GMB-card-fix.md`) — added GMB card with honest data
  (real field values + completeness, NOT fabricated match badges). VERIFIED.
- **FM5 drift indicator** (`visibleau-sprint8-FM5-drift-indicator-fix.md`) — drift severity on audit
  history rows via scalar subquery. VERIFIED (389 tests pass).

### Sprint 9 agency surface — root cause + fixes (ALL VERIFIED)
- **Root cause** (`visibleau-agency-gaps-root-cause.md`): agency pages were "built but UNLINKED" —
  navigation was lost at the prototype→sprint-prompt translation. The Agency Dashboard was missing the
  entry-point CARDS that link to the agency pages.
- **AgencyDashboard crash** (`visibleau-agency-dashboard-ambiguous-id-fix.md`) — "column id ambiguous"
  in a top-movers subquery. Fixed. VERIFIED (/agency renders: 3 brands, avg 78.x, etc.).
- **Workspace switcher** (`visibleau-GH2-workspace-switcher-nav.md` + `...-404-fix.md`) — top-bar "All
  brands (N)" → /agency; fixed a phantom-route 404 (GH2 pointed at non-existent /brands/[id]/audits →
  corrected to /brands/[id]). VERIFIED.
- **Dashboard entry-point cards** (`visibleau-agency-dashboard-cards-nav.md`) — added "Bulk Actions" +
  "Client-Facing Portals" cards with real data (no mocks), making the unlinked pages reachable.
  VERIFIED. (NOTE: this prompt caused a regression in the PDF builder — see below.)

### White-label PDF builder — multi-fix, NOW FULLY COMPLETE + VERIFIED
A sequence, each verified before the next:
- `visibleau-pdf-builder-realdata-export-fix.md` — P0 build the missing two-column builder + Generate
  PDF button; P1 replace hardcoded mock "72.4" with REAL audit data; P2 fix broken export (was serving
  HTML as PDF) → real react-pdf; P3 wire branding. (Route: `/api/audits/[auditId]/export?format=pdf` —
  WITH /api/.)
- `visibleau-pdf-builder-layout-fix.md` — columns collapsed; fixed to prototype's max-w-6xl + grid.
- `visibleau-pdf-whitelabel-header-fix.md` — header showed "VisibleAU" → resolves agency name / neutral
  default, NEVER VisibleAU (white-label).
- `visibleau-pdf-builder-regression-fix.md` — the dashboard-cards prompt broke the PDF builder's audit
  query (showed "No completed audit" while /overview showed the audits). Root cause: a `status =
  'completed'` vs actual `'complete'` style mismatch. Fixed by aligning to the working dashboard query.
- `visibleau-pdf-report-polish.md` — wired section checkboxes to drive REAL content (exec summary, CI,
  per-engine breakdown, action plan from real data); de-duplicated header.
- `visibleau-pdf-exec-summary-dimension-fix.md` — exec summary showed "strongest = weakest"; fixed
  min/max + tie handling.
**VERIFIED:** PDF shows real 88.3 (not 72.4), real export (visibleau-audit-129.pdf opens as real PDF),
no VisibleAU, two-column layout, real exec summary/CI/per-engine, header fixed.

### Bulk CSV export — FIXED + VERIFIED
- `visibleau-bulk-csv-export-fix.md` — CSV was header-only (no rows) even for Bondi (which has audits).
  Root cause: **`eq(audits.status, "completed")` should be `"complete"`** (the DB has zero `'completed'`
  rows). Fixed. Header expanded 5→10 cols (Brand/Domain/Vertical/Audit#/Date/Composite+4 dims). The
  5-col summary is an INTENTIONAL agency rollup, distinct from the per-audit 14-col citation export at
  `/api/audits/[id]/export?format=csv` (canon BD1). VERIFIED (Bondi exports 23 real rows).

### Notification preferences — FIXED + VERIFIED
- `visibleau-notification-toggles-fix.md` — the 3 "Email on…" options were labels with NO toggle
  controls. Added toggles for emailOnDrift / emailOnAuditComplete / emailOnScheduleFailure + the
  weeklyDigest toggle, bound to the real `notification_preferences` schema, initialized from canon
  defaults (digest on, drift on, audit-complete OFF, schedule-failure on). VERIFIED: toggles render +
  persist across save/reload; digest email persists.

### Branding page — preview placeholder fix (delivered)
- `visibleau-branding-preview-placeholder-fix.md` — replaces the fake "Score: 72.4" in the branding
  PREVIEW (a styling mockup) with a neutral placeholder. (Apply if not yet done.)

### Misc
- `visibleau-html-lang-check.md` — browser offered "Translate from French"; verified/fixed `<html
  lang>` to en-AU. RESOLVED.
- **Marrickville 13.8 fully diagnosed** (`visibleau-marrickville-13.8-diagnostic.md`) — NOT a scoring
  bug. Marrickville is a PRE-FIX brand (classification_status=pending, no smart prompt pack) → its audit
  used the generic allied_health fallback (asked a dental studio about chiropractors/podiatrists) + was
  mock-mode → artifact score. Systemic finding: classification only fires on brand CREATION; all
  pre-fix brands (Marrickville, Canva) are stuck unclassified.
- **Classification backfill** (`visibleau-classification-backfill.md`) — the canon-designed
  `classify-existing-brands.ts` Inngest fn (event `brand/classify-all`) existed + was registered +
  idempotent; root cause was it was never TRIGGERED. Mock-mode backfill tested PASS (all 3 brands →
  complete, idempotency confirmed, reset done). Two triggers in place: admin API
  `/api/admin/backfill-classify` + CLI `scripts/run-backfill.ts`.

## 7. Open items / next steps (none blocking; agency surface is functional)
1. **Real-mode classification backfill** (~$0.003) — run `LLM_MODE=real npx tsx scripts/run-backfill.ts`
   (point at `visibleau_prod` if you want real Marrickville scoring) → gives pre-fix brands real prompt
   packs. NOTE: this will RECLASSIFY Bondi too, which may SHIFT its 88.3 on next audit (expected — real
   classified pack vs the old trades-vertical fallback that happened to fit a plumber).
2. **Optional Marrickville re-audit** (~$0.84, real mode) AFTER the backfill → its real dental score.
   The backfill alone fixes PROMPTS for the next audit; it does NOT re-score history.
3. **`'completed'` grep-sweep (RECOMMENDED)** — the `complete` vs `completed` typo bit TWICE this session
   (PDF builder regression + bulk CSV). The DB value is `'complete'`. Run
   `grep -rn "completed" --include="*.ts"` across the repo to catch the same typo in untested features
   (drift alerts, GA4 push, weekly digest send, "Email on Audit Complete" firing — all filter completed
   audits). Cheap insurance.
4. **Confirm the per-audit 14-column citation CSV** (`/api/audits/[id]/export?format=csv`, canon BD1)
   exists/works — the bulk summary intentionally ISN'T it.
5. **Deferred (minor):** branding logo is URL-paste, canon L33 wants drag-drop Supabase Storage upload
   (2MB, PNG/SVG/JPG). Functional as-is.
6. **Genuine gaps (deferred):** `/brands/[brandId]/branding` (per-brand white-label override — unbuilt);
   `/agency/client-portals/new` (create-invite is INLINE on the portals page — confirmed, likely no
   separate page needed).
7. **Not yet visually verified:** `/brands/[brandId]/schedule` (per-brand scheduling), public
   `/client-portal/[token]` (read-only client view). Client-portals E2E (create invite → token → public
   view loads) not yet end-to-end tested.
8. **Top Movers shows 0.0** — likely legitimate (Bondi consistently 88.3); will confirm once any score
   changes.

## 8. Agency pages verified reachable + correct this session
✅ /agency (via workspace switcher "All brands") · ✅ /agency/reports/pdf-builder (via "Generate client
reports" — fully polished) · ✅ /agency/branding (via "Branding & logo") · ✅ /agency/bulk (via "Run
audits across all 3 brands" — CSV fixed) · ✅ /agency/client-portals (via "Manage portals" — full table,
inline Create Invite) · ✅ /settings/notifications (via "Notification preferences" — toggles work +
persist).
Full path WORKS: workspace switcher → Agency Dashboard → Generate client reports → PDF Builder →
Generate PDF → download.

## 9. Test brands currently in the DB (3)
- **Bondi Plumbing** (bondiplumbing.com.au, trades_plumbing) — composite **88.3**, many complete audits.
  Good real-data test brand.
- **Marrickville Dental Studio** (marrickvilledental.com.au, allied_health) — **13.8** ARTIFACT score
  (stale pre-fix brand; see §6). Fix = backfill + re-audit.
- **Asset Plumbing Solutions** (assetplumbingsolutions.com.au).

---
**Bottom line for the new chat:** Phase 1 agency surface is functional and reachable; the major bugs
(PDF fake data, broken export, white-label leak, the regression, bulk CSV, missing toggles) are fixed +
verified. Operate as the reviewer chat per §2–3. Highest-value remaining proactive task = the
`'completed'` grep-sweep (§7.3). Re-extract canon before working; verify against real data, not reports.
