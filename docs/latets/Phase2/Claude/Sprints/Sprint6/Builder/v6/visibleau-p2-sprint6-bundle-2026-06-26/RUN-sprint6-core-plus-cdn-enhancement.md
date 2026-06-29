# DRIVER PROMPT — Phase 2 Sprint 6 (core) + CDN Shield Enhancement, one session, in order
# Paste this ENTIRE block into a fresh Claude Code session pointed at the VisibleAU repo.
# It does NOT contain the specs — it ORCHESTRATES the two canonical prompt files in sequence
# with a hard checkpoint between them. The two source prompts remain the authority; do not
# rewrite or summarise them. When any spec and the LLD disagree, THE LLD WINS.
#
# Prerequisites (must already be true before you paste this — see "STOP conditions" below):
#   • Phase 1 Sprints 1–12 are built (esp. S12: the audit-data-retention cron + the
#     audits.status='complete' fix — Phase 2 retention/cascade depends on it).
#   • Phase 2 Sprints 1–5 are built and merged (S6 reads S1 budget/provider services, S4
#     narrative slots, S5 brand_entity_scores/citation_source_intelligence).
#   • Both prompt files are present in the repo root (or a known path):
#       - visibleau-p2-sprint-6-prompt.md            (the Gate-3 core, v1.5)
#       - visibleau-p2-sprint6-cdn-shield-enhancement.md   (the net-new CDN delta, v1.3)
#     and the canonical LLD visibleau-7layer-lld.md (v8.68) is accessible for reference.

You are going to build **Phase 2 Sprint 6 (Retrieval Intelligence + Agent Readiness)** and then
apply the **CDN Shield enhancement** on top of it, in ONE session, as two ordered phases with a
verification checkpoint between them. Follow this exactly. Do not reorder. Do not merge the two
specs. Do not start the enhancement until Phase A passes its checkpoint.

────────────────────────────────────────────────────────────────────────
PHASE 0 — PRE-FLIGHT (do this first; if any check fails, STOP and report)
────────────────────────────────────────────────────────────────────────
Run these and print the results. If any prints STOP, halt and tell me which one — do not proceed.
```bash
# Right canon:
grep -m1 "^# Version:" visibleau-7layer-lld.md            # expect: # Version: 8.68 (8.67/8.66 also valid)
grep -c "ATTRIBUTION CORRECTION" visibleau-7layer-lld.md  # expect: >=1   (0 → STOP: stale LLD)
# Both prompt files present:
test -f visibleau-p2-sprint-6-prompt.md && echo "OK core prompt" || echo "STOP: core Sprint 6 prompt missing"
test -f visibleau-p2-sprint6-cdn-shield-enhancement.md && echo "OK enhancement prompt" || echo "STOP: CDN enhancement prompt missing"
# Phase 2 prerequisites merged (S1 platform services, S5 trust tables the scorer reads):
test -f lib/platform/budget-policy.service.ts -o -f lib/platform/budget-policy.ts && echo "OK S1 budget service" || echo "STOP: Sprint 1 not built — S6 depends on it"
grep -rqE "brand_entity_scores" db/schema/ && echo "OK S5 brand_entity_scores present" || echo "STOP: Sprint 5 not built — S6 reads it"
# Phase 1 S12 retention cron exists (S6 §8.6 extends it; the local_ai_trust_score window decision depends on it):
test -f inngest/functions/audit-data-retention.ts && echo "OK P1 S12 retention cron" || echo "STOP: Phase 1 Sprint 12 retention cron missing — build P1 S11–S12 first"
```
Also confirm the working tree is clean (committed or stashed) so Phase A and Phase B land as
reviewable, separable commits. If the tree is dirty, stop and ask me to commit/stash first.

────────────────────────────────────────────────────────────────────────
PHASE A — BUILD THE CANONICAL SPRINT 6 CORE (the Gate-3 spec, unchanged)
────────────────────────────────────────────────────────────────────────
1. **Read `visibleau-p2-sprint-6-prompt.md` top-to-bottom** (all of §0–§14). Treat it as the
   authority for this phase. Open the LLD regions it cites when you need detail; the LLD wins on
   any conflict.
2. **Execute its §10 ("CLAUDE CODE PROMPT") instructions** to build Sprint 6 exactly as specified:
   the 4 tables (crawler_visit_logs, content_structure_audits, llmstxt_versions,
   agent_readiness_scores) + the brands.brand_token ALTER; the 5 Inngest functions registered in
   serve(); the 10 lib/retrieval modules + local-ai-trust-scorer + explainability; the §8.4a
   task-fit detection (kept OUT of local-ai-trust-scorer.ts); the public Visit API route; the 5
   screens; the S4 wiring; and the §8.6 retention extension (guarded).
   - Honour every locked rule in its §0.5 and §13: append-only crawler_visit_logs &
     agent_readiness_scores (no UPSERT); content_structure_audits UPSERT on (brand_id, page_url);
     entity_clarity_score ≠ score_of_10; local_ai_trust_score NULL for SaaS AND NULL in the
     S6→S8 window per §6.6; setRlsContext on every protected route; cross-org → 404 not 401;
     selectModel for every LLM call; no hex-alpha on var() (use color-mix).
3. **Write the tests** the core prompt's §11 requires (LLM_MODE=mock; no real LLM/network calls).
4. **CHECKPOINT A — run the core prompt's §12 verification greps verbatim and print every result.**
   Then run the project's typecheck + the Sprint 6 tests:
   ```bash
   pnpm typecheck   # or the repo's tsc script
   pnpm test tests/phase2/sprint6   # or the repo's vitest path for S6
   ```
   **GATE:** If any §12 grep prints FAIL, or typecheck fails, or any S6 test fails — STOP. Fix
   within the core spec's intent (LLD wins), re-run Checkpoint A, and do NOT start Phase B until
   Checkpoint A is fully green. Report the Checkpoint A results to me before continuing.
5. **Commit Phase A** as its own commit, e.g.:
   `git add -A && git commit -m "Phase 2 Sprint 6: Retrieval Intelligence + Agent Readiness (core, LLD v8.68)"`

   ⛔ Do not proceed to Phase B until Checkpoint A is green and committed.

────────────────────────────────────────────────────────────────────────
PHASE B — APPLY THE CDN SHIELD ENHANCEMENT (the net-new delta, on top)
────────────────────────────────────────────────────────────────────────
1. **Read `visibleau-p2-sprint6-cdn-shield-enhancement.md` top-to-bottom.** It is a DELTA on top
   of the Phase A build — it adds the CDN firewall detector, the remediation snippet, the UI
   alert card, and (optionally) the Tier-0 hook and Visit-API hardening. It changes NO schema and
   adds NO Inngest function.
2. **Run its §0.3 STEP-0 GATE first** and print results. Because Phase A is now built, these
   should pass (crawler exists, content-structure-audit.ts exists, error_type column present,
   §8.4a consumes blocked_cdn, detector path free). **If any STEP-0 line prints STOP, halt** —
   that means Phase A didn't actually land that surface; go back and fix Phase A.
3. **Execute its §10 ("CLAUDE CODE PROMPT") instructions** in the order given:
   - Create `lib/crawler/cdn-shield-detector.ts` as a PURE function over (statusCode, headers),
     honest-data rule from §0.5 — a block requires a CDN fingerprint AND a 403/429/503 status; a
     **200 behind a CDN is NOT a block**. Include the exact remediation-snippet strings. No DB,
     no network, no new deps. Place it in `lib/crawler/`, NEVER `lib/platform/`.
   - Create its test, including the mandatory **Cloudflare-header + status-200 → isBlockedByCDN
     === false** case.
   - Edit `inngest/functions/content-structure-audit.ts` to run the detector on the
     ALREADY-FETCHED GPTBot crawl result, persist error_type='blocked_cdn' (existing column — do
     NOT alter the table) + carry detectedFirewall + remediationSnippet in the result/gaps JSONB.
     No new crawl, no new column.
   - Edit the retrieval UI (crawler-logs view / RetrievalHub) to show the "AI Crawler Access
     Blocked" alert card with the snippet + copy-to-clipboard, only on a detected block, behind
     the SAME tier as the built S6 crawler-logs view (passive-crawl output → passive crawler-logs
     tier per the enhancement §1, not the active-agent Growth+ gate); tokens/ARIA per existing components.
   - **§4 Tier-0 hook (optional):** only after the above is green. ≤5s parallel GPTBot header
     probe in the sample-audit path, reuse the sample flow's EXISTING domain guard, feed the same
     detector, render the conversion teaser on a real block, skip silently on timeout. If you do
     NOT do §4, say so explicitly.
   - **§5 Visit-API SEC-A/SEC-B hardening (optional, recommended):** apply per LLD 5762–5780 step
     order (Zod → IP throttle → negative cache → token lookup/401 → SEC-A domain check →
     per-token limit → emit → 202). If you skip §5, say so explicitly.
4. **CHECKPOINT B — run the enhancement prompt's §12 verification greps verbatim and print every
   result.** Then re-run typecheck + the CDN test + the S6 suite (to confirm the delta didn't
   break the core):
   ```bash
   pnpm typecheck
   pnpm test tests/phase2/sprint6   # core S6 tests still green
   pnpm test -t "cdn-shield" 2>/dev/null || pnpm test tests/phase2/sprint6/cdn-shield-detector.test.ts
   ```
   **GATE:** If any §12 grep prints FAIL (especially "no new columns", "no platform collision",
   and the 200-not-blocked test), or any previously-green S6 test now fails — STOP and fix within
   the enhancement's intent. Report Checkpoint B results to me.
5. **Commit Phase B** as a SEPARATE commit, e.g.:
   `git add -A && git commit -m "Phase 2 Sprint 6: CDN Shield detector + remediation snippet + Tier-0 hook (enhancement)"`

────────────────────────────────────────────────────────────────────────
FINAL REPORT (print this at the end)
────────────────────────────────────────────────────────────────────────
- Phase 0 pre-flight: pass/fail (which checks).
- Phase A: what was built (tables, functions, routes, screens); Checkpoint A grep + test results.
- Phase B: what the enhancement added; whether §4 (Tier-0) and §5 (Visit hardening) were applied
  or skipped (state which); Checkpoint B grep + test results.
- serve() Inngest function count after this session (should be the post-S6 total, e.g. 23 — the
  enhancement adds none).
- Any place the LLD overrode a prompt instruction, and what you did.
- Two commits present (core + enhancement), separable.

────────────────────────────────────────────────────────────────────────
HARD RULES FOR THIS WHOLE SESSION (do not violate)
────────────────────────────────────────────────────────────────────────
- **Order is fixed:** Phase A fully green + committed BEFORE Phase B. Never interleave them.
- **The two prompt files are the authority; the LLD overrides both.** Do not rewrite, condense,
  or "improve" either spec — execute them.
- **Additive only:** no Phase 1/Phase 2 table altered except documented nullable ALTERs; the
  enhancement adds NO schema, NO column, NO Inngest function, NO second crawler. serve() count
  unchanged by Phase B.
- **The CDN detector lives in `lib/crawler/`, never `lib/platform/`** (avoids the
  local-ai-trust-scorer.ts collision).
- **Honest-data:** a CDN block is asserted only on a real status code (403/429/503) + CDN
  fingerprint — never on the presence of a CDN alone. A 200 behind Cloudflare is NOT blocked.
- **No real LLM/network calls in tests** (LLM_MODE=mock).
- If anything is ambiguous or a STOP/GATE trips, **halt and ask me** — do not guess and push on.
