# Claude Code — SMOKE: seed a blocked crawl so the CdnBlockAlert renders — verify remediation, copy, honest-block rule, Starter-tier gate

The Crawler Logs screen shows the empty state (no crawls) and the CDN Shield API returns 200 — but the CdnBlockAlert UI
only appears when there's a BLOCKED crawl. So the enhancement's actual deliverables (the alert card, vendor remediation,
copy-to-clipboard, the honest-block rule, the Starter-tier gate) are UNVERIFIED on screen. Seed a blocked crawl, verify
the alert renders correctly, then verify the honest-block rule (a 200-behind-CDN does NOT alert) and the tier gate.

Env: Windows repo `C:\startup\VisibleAU\src\`. App on LOCAL PROD `visibleau_prod`. Never real prod. Brand: Metropolitan
418f321f-2489-4560-aaa9-895728580465.

## Canon (CDN enhancement v1.3)
- Honest-block rule (§0.5): `isBlockedByCDN=true` ONLY when BOTH (1) a CDN fingerprint (Cloudflare: cf-ray or
  cf-cache-status) AND (2) a block STATUS CODE (403/429/503). A **200 behind a CDN is NOT blocked**. (§0.5 lines 84-88.)
- Persistence: `crawler_visit_logs.error_type='blocked_cdn'` on the blocked page's row; the firewall vendor + remediation
  snippet ride in the **content-structure result / gaps JSONB** (NOT a column on crawler_visit_logs — §0.5 line 100-102).
- UI (§0.5 line 104-108): a **"AI Crawler Access Blocked"** alert card with the remediation snippet + a copy-to-clipboard
  button — shown ONLY when a block is detected. Gate: **passive crawler-logs tier = Starter+** (LLD 3170), NOT Growth+.
- detectedFirewall ∈ Cloudflare | Akamai | Vercel | Unknown | None. 'Unknown' = block status, no recognised CDN.

## STEP 1 — Confirm HOW the CdnBlockAlert gets its data (so the seed matches the real source)
```bash
grep -rn "CdnBlockAlert\|blocked_cdn\|error_type\|detectedFirewall\|remediationSnippet\|cdn-shield" "app/(auth)/brands/[brandId]/retrieval/crawler-logs/page.tsx" components/domain/retrieval/ app/api/brands/[brandId]/cdn-shield/route.ts | head -20
cat app/api/brands/[brandId]/cdn-shield/route.ts
```
Report: does the CdnBlockAlert read from (a) the `/cdn-shield` probe API, (b) crawler_visit_logs rows with
error_type='blocked_cdn', or (c) the content_structure_audits gaps JSONB? The seed must populate whatever the card
actually reads. (Per canon the vendor/snippet lives in the content-structure result/gaps, and error_type='blocked_cdn'
on crawler_visit_logs — so likely BOTH are involved. Confirm which the card reads.)

## STEP 2 — Seed a BLOCKED crawl (Cloudflare fingerprint + 403 → the alert should fire)
Insert a crawler_visit_logs row with error_type='blocked_cdn' for Metropolitan, AND (per STEP 1) populate wherever the
vendor/snippet lives (content_structure_audits gaps JSONB, or the cdn-shield route's source), matching the REAL shape:
```sql
-- crawler_visit_logs: a blocked GPTBot visit (Cloudflare + 403)
INSERT INTO crawler_visit_logs (id, brand_id, organization_id, crawler_name, crawler_tier, user_agent,
  status_code, error_type, visited_url, visit_purpose, is_active_agent, visited_at)
VALUES (gen_random_uuid(), '418f321f-2489-4560-aaa9-895728580465', '<org_id>', 'GPTBot', '<tier>', 'GPTBot/1.1',
  403, 'blocked_cdn', 'https://metropolitanplumbing.com.au/', 'retrieval', false, now());
-- + wherever the vendor+snippet ride (per STEP 1): e.g. content_structure_audits gaps JSONB with
--   {detectedFirewall:'Cloudflare', remediationSnippet:'<the WAF-bypass rule text>'} on the crawled page's row.
```
Use the REAL column names/enums from db/schema (crawler_tier enum, visit_purpose enum). Report the seeded row(s).

## STEP 3 — Verify the CdnBlockAlert RENDERS correctly (on screen)
Reload `/brands/418f321f.../retrieval/crawler-logs`:
- The **"AI Crawler Access Blocked"** alert card appears (it was absent in the empty state).
- Shows **detectedFirewall = Cloudflare** + the **vendor-specific remediation snippet** (the WAF-bypass rule text).
- The **copy-to-clipboard button** works (click → snippet copied; confirm the copy feedback).
- The blocked visit appears in the crawler-log table with error highlighting (§6U.3 "blocked_cdn" highlight).
Report: the alert renders with Cloudflare + remediation snippet; copy-to-clipboard works.

## STEP 4 — Verify the HONEST-BLOCK RULE (the anti-Gemini-bug — the whole point)
Add a SECOND crawler_visit_logs row: Cloudflare fingerprint BUT **status 200** (not a block code):
```sql
INSERT INTO crawler_visit_logs (..., status_code, error_type, visited_url, ...)
VALUES (..., 200, NULL, 'https://metropolitanplumbing.com.au/services', ...);  -- 200, error_type NULL (NOT blocked)
```
- A 200 behind a CDN is NOT a block (§0.5). So this row must NOT set error_type='blocked_cdn', and must NOT contribute a
  block alert. The alert should reflect only the 403 row, not this 200 row.
- If the detector/probe is run against a 200+Cloudflare response, `isBlockedByCDN` must be FALSE (detectedFirewall may be
  'Cloudflare' but not blocked).
Report: the 200+Cloudflare row does NOT trigger a block alert / is not marked blocked — proving the honest-block rule
(fingerprint alone ≠ blocked; needs a 403/429/503).

## STEP 5 — Verify the TIER GATE (Starter+, not Growth+ — the v1.3 handoff's whole concern)
Canon (LLD 3170): the passive crawler-logs / CDN block alert = **Starter+** (passive log import), NOT Growth+
(is_active_agent active tracking). Metropolitan's org is Agency (sees everything), so:
```bash
grep -rn "tier\|Starter\|Growth\|GROWTH\|STARTER\|subscriptions.tier\|passive\|is_active_agent" "app/(auth)/brands/[brandId]/retrieval/crawler-logs/page.tsx" components/domain/retrieval/*cdn* components/domain/retrieval/*crawler* | head
```
- Confirm the CdnBlockAlert (and the crawler-logs view) gates to **Starter+**, reading **subscriptions.tier** (not
  organizations.tier — the invariant).
- If a tier gate is present, confirm it's Starter-class, NOT Growth+. (Optionally: temporarily treat the org as Starter
  → the alert should STILL show, proving Starter+ access. Revert.)
Report: the alert is gated Starter+ (reads subscriptions.tier), not over-gated to Growth+.

## STEP 6 — Clean up the seed (it's test data)
```sql
DELETE FROM crawler_visit_logs WHERE brand_id='418f321f-2489-4560-aaa9-895728580465' AND user_agent='GPTBot/1.1';
-- + revert any content_structure_audits gaps JSONB test edits.
```
(Or leave the blocked row if you want the alert visible for the demo — but note it's seeded, not real.)
Report: seed cleaned (or intentionally kept).

## STEP 7 — Report
- STEP 1: what the CdnBlockAlert reads (probe API / crawler_visit_logs / gaps JSONB).
- STEP 3: alert renders with Cloudflare + remediation snippet + working copy-to-clipboard.
- STEP 4: honest-block rule holds — 200+Cloudflare does NOT alert (the anti-Gemini-bug verified on data).
- STEP 5: tier gate is Starter+ (subscriptions.tier), not Growth+.
- STEP 6: seed cleaned.

## Constraints
- Seed the REAL shape — match db/schema column names/enums; put the vendor/snippet wherever the card actually reads it
  (STEP 1 — likely content-structure gaps JSONB per canon, NOT a crawler_visit_logs column).
- The honest-block rule (STEP 4) is the point — a 200 behind a CDN must NOT be blocked. Verify on data, not just the unit
  test.
- Tier gate = Starter+ (LLD 3170), subscriptions.tier not organizations.tier. Do NOT accept Growth+ (the v1.3 fix's
  concern).
- This is verification (seed + observe) — no code changes unless the alert/tier/honest-block is actually wrong. If it is,
  report and we scope the fix.
- Local prod, never real prod. LLD v8.70 / CDN enhancement §0.5 / LLD 3170 win.

## NOTE
The empty crawler-logs state hides the CDN Shield's actual deliverables. Seed a blocked crawl (crawler_visit_logs
error_type='blocked_cdn' + Cloudflare 403, plus the vendor/snippet wherever the card reads it — per canon the
content-structure gaps JSONB) so the "AI Crawler Access Blocked" alert renders; verify Cloudflare + remediation snippet +
copy-to-clipboard. Then the honest-block rule (add a 200+Cloudflare row → must NOT alert — the anti-Gemini-bug that was
the enhancement's whole point) and the Starter-tier gate (LLD 3170: passive crawler-logs = Starter+, NOT Growth+, reading
subscriptions.tier — the v1.3 handoff's concern). Clean up the seed. Report each on screen.
