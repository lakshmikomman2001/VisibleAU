# Claude Code — S6 track PHASE 4 (Frontend E2E): the 5 retrieval-screen Playwright specs (harness EXISTS — just add specs)

Harness confirmed (Verdict A): @playwright/test + config + auth fixture (signInAsTestUser, auto-signs-in) + db.ts
serviceDb seed + prior sprint2-4 specs. So this is the SMALL case — write the 5 S6 retrieval-screen specs under
tests/e2e/sprint6/, mirroring the manual screen pass (each finding this session gets a browser-level assertion). Match the
sprint4-reports.spec.ts pattern (seed via serviceDb → auto-signed-in test → page.goto → assert DOM). This is Phase 4 of
5 (BE Unit ✓ / BE E2E ✓ / FE Unit ✓ / **FE E2E this** / QA next).

Env: Windows repo `C:\startup\VisibleAU\src\`. E2E on DEV DB `visibleau` (.env.test.local). Test user
sri@visibleau.local. Never prod. tests/e2e/sprint6/. Run: `npx playwright test` (or a sprint6 config like sprints 2-4).

## STEP 1 — Match the existing E2E pattern + set up the sprint6 seed
```bash
cat tests/e2e/sprint4/*.spec.ts 2>/dev/null | head -60    # the seed→signin→goto→assert pattern to mirror
cat tests/e2e/helpers/db.ts                                # the serviceDb helpers (ensureOrganization/User, brands)
cat tests/e2e/helpers/auth.ts                              # the extended `test` that auto-signs-in
ls tests/e2e/sprint4/ ; cat tests/e2e/sprint4/playwright.config.* 2>/dev/null   # per-sprint config pattern
```
Report the exact pattern (how sprint4 seeds a brand + its data, how it imports the auto-signin test, how it runs).

## STEP 2 — Seed helper for S6 retrieval (beforeAll / a fixture)
Seed Metropolitan (or a dedicated E2E brand) with the S6 data the screens read — same tables/shapes as the integration
tests:
- brand (with brand_token), org, subscription (Agency/Starter+ so retrieval is visible), default-report-template.
- **agent_readiness_scores**: a row with total_score=56, the 5 dims (tech 14/entity 16/verify 8/authority 5/task 13),
  gaps.
- **content_structure_audits**: rows for /about (entity-home cols populated: is_entity_home_candidate=true,
  entity_home_has_org_schema=true, entity_home_has_id_field=true, entity_home_same_as_count=4; citation_probability=0.45,
  format=expert_article) + /services (0.22, listicle, aging).
- (optional) **crawler_visit_logs**: leave empty for the empty-state assertion, OR seed a blocked_cdn+Cloudflare row for
  the CdnBlockAlert assertion (see Screen 4).
Clean up in afterAll (delete the seeded rows — the deleteBrandsByIds helper + the S6 tables).

## STEP 3 — The 5 screen specs (each mirrors the manual pass finding):

### sprint6/retrieval-hub.spec.ts — /brands/{id}/retrieval
- 3 stat cards visible: **Agent Readiness /100, Avg Citation Prob %, Crawler Visits** — and **NO standalone
  "llms.txt Depth /18" card** (the depth-card fix; assert the /18 depth stat is absent).
- The 5 sub-screen tiles present (Crawler Logs, Content Structure, Agent Readiness, Entity Home, llms.txt) and a tile is
  clickable → navigates to its sub-route (the nav + the 404-that-was — assert the hub route resolves 200, not 404).

### sprint6/agent-readiness.spec.ts — /retrieval/agent-readiness
- **56/100** visible + the **5 dimension bars** with correct labels (Technical/Entity Clarity/Verifiability/Authority/
  Task-Fit).
- The **"Technical sub-signals"** section (llms.txt depth + MCP) renders (Finding-1 fix).
- **The Refresh Score button is VISIBLE** (`toBeVisible()`) and clickable — THE assertion that would have caught the
  invisible-button bug (white-on-white). Assert it's visible AND has readable text (not the empty white rectangle).
  (Clicking it emits → Inngest; if Inngest isn't running in E2E, assert the button is visible+enabled without requiring
  the emit to succeed — visibility is the guard, not the emit.)

### sprint6/entity-home.spec.ts — /retrieval/entity-home
- **@id present · sameAs count 4/3 · Organisation schema present · Complete badge** (the real entity-home fields — Bug B
  display fix). Assert these appear; assert **Citation/Capsule/Format are NOT** on the entity-home status card.
- **NO "Audited Pages" content-structure grid** (the grid-removal fix — assert that section is absent).
- Empty-state variant (optional): a brand with no entity home → "We haven't identified your Entity Home yet".

### sprint6/crawler-logs.spec.ts — /retrieval/crawler-logs
- **Empty state**: with no crawler_visit_logs → "No crawler visits recorded yet. Install the tracking snippet".
- **CdnBlockAlert** (if you seed a blocked_cdn+Cloudflare row): the "AI Crawler Access Blocked" alert renders with the
  remediation snippet + copy button. (The alert reads the live /cdn-shield probe per the walk — if the probe needs the
  live domain, assert the empty/normal state instead and note the alert needs a real blocked domain; don't fake it.)

### sprint6/content-structure.spec.ts — /retrieval/content-structure
- **The full-width citation HEADLINE** renders ABOVE the per-page cards: "How likely is this page to be cited by AI?" +
  the % (the §13 headline fix — assert the headline text is present and prominent, not only in card corners).
- The headline's **band color** matches (45% → amber/Moderate).
- The per-page cards render below (format/freshness/capsule/passages). Stub rows (all-null) are NOT shown (the filter).

## STEP 4 — Run + report, then STOP
```bash
npx playwright test tests/e2e/sprint6/    # or the sprint6 config
```
- The 5 specs pass (seed → auto-signin → goto → assert). Report per screen what's asserted + green.
- Note any screen where a real-data limitation applies (e.g. CdnBlockAlert needs a live blocked domain — assert the
  reachable state, don't fake it).
- E2E green; count. Confirm this is the FE E2E phase (the one skipped in S5) now DONE for S6.
STOP — do NOT start QA. Report, and QA (the §12 grep script) is the LAST phase.

## Constraints
- FRONTEND E2E ONLY (the 5 screen specs). Not QA. Add specs to the EXISTING harness — do NOT rebuild config/auth.
- Mirror sprint4-reports.spec.ts (seed via serviceDb → the auto-signin `test` → page.goto → assert DOM). Clean up seeds
  in afterAll.
- The Refresh-VISIBLE assertion (agent-readiness) is the marquee one — it's the E2E that would have caught the invisible
  button. Assert toBeVisible() + readable, not just present in DOM.
- Assert the walk fixes at the BROWSER level: no depth card (hub), @id/sameAs not content-structure (entity-home), no
  Audited Pages grid, the citation headline present (content-structure), the empty state (crawler-logs).
- Real-data honesty: if a screen needs data E2E can't produce (live blocked domain for CdnBlockAlert), assert the
  reachable state and note the limitation — do NOT fake it.
- DEV DB `visibleau` (.env.test.local), never prod. LLD v8.70 / §6U win.

## NOTE
Phase 4 of 5 — Frontend E2E (the phase skipped in S5), harness EXISTS so it's just adding the 5 S6 retrieval-screen
Playwright specs under tests/e2e/sprint6/, mirroring sprint4's pattern (serviceDb seed → auto-signin fixture → goto →
assert). Each spec asserts a manual-pass finding at the BROWSER level: hub 3 stats + no /18 depth card + tiles navigate
(+ route resolves, not the 404); agent-readiness 56/100 + 5 bars + sub-signals + **Refresh button VISIBLE** (the marquee
assertion — the E2E that would have caught the invisible button); entity-home @id/sameAs/org-schema not content-structure
+ no Audited Pages grid; crawler-logs empty state (+ CdnBlockAlert if a blocked row seeded); content-structure the
full-width citation headline. Seed via serviceDb (same tables as integration), clean up in afterAll, be honest where
real-data limits apply (don't fake the CDN alert). STOP after FE E2E; QA (§12 grep script) is the last phase.
