# VERIFY S8 FINALE — recordAction writes (Priority 2) + WH-01 webhook chain delivers (Priority 1)

## Why this is the finale
Every S8 screen now renders correctly, but the audit-trail screen shows "No activity yet" — which
is AMBIGUOUS: it looks identical whether (a) nothing audited has happened yet, or (b) `recordAction`
is silently broken (the S7 `organizationId` vs `orgId` → 23502 class). A screenshot cannot tell
these apart. This prompt resolves it by triggering REAL audited actions and checking whether rows
land — and simultaneously tests the #1 cross-sprint payoff: the WH-01 webhook chain delivery.

READ-ONLY where it checks; the "trigger an action" steps use the app's real UI/API paths (no raw
INSERTs). Run against **`visibleau_prod`**. Use the real connection string from the env as `$PROD`.

---

## PART A — Does recordAction ALREADY have evidence? (the zero-cost check first)

`GET /api/organizations/[id]/data-residency` records `data_residency_accessed` (S8 prompt §9). The
data-residency page was ALREADY VIEWED earlier this session on the **Metropolitan** org
(`da1071de-6dbd-4e08-8f43-29f76c123be9`). So if recordAction writes, a row should already exist.

```bash
cd c:/startup/VisibleAU/src
# All audit_trail rows for Metropolitan (should include data_residency_accessed from the earlier view):
psql "$PROD" -c "
  SELECT action, resource_type, user_id, created_at
  FROM audit_trail
  WHERE organization_id = 'da1071de-6dbd-4e08-8f43-29f76c123be9'
  ORDER BY created_at DESC LIMIT 20;"
# Total rows across ALL orgs (is the table empty everywhere, or just per-org?):
psql "$PROD" -c "SELECT count(*) AS total_audit_rows, count(DISTINCT organization_id) AS orgs FROM audit_trail;"
```
INTERPRET:
- **≥1 `data_residency_accessed` row for Metropolitan** → recordAction WRITES. The Growth org's
  "No activity yet" is correct-empty (residency was never viewed on the Growth org). Proceed to
  Part B to exercise the remaining actions + webhooks.
- **0 rows for Metropolitan despite the page having been viewed** → recordAction is NOT writing on
  the residency GET. This is a real finding (Priority 2). Go to Part D to diagnose WHY (wrong orgId
  key? missing call? behind a branch?).

---

## PART B — Trigger the other audited actions on a real path, confirm rows land
Trigger each audited action that's reachable, then re-query. Use the app UI/API (NOT raw INSERT).

The 9 audited actions + how to trigger (do the ones reachable on the available orgs/tiers):
| Action | Trigger | Notes |
|---|---|---|
| `data_residency_accessed` | Load /settings/data-residency | works any tier (Part A) |
| `competitive_benchmark_viewed` | Load a brand's competitive-benchmark | Growth gets 1 competitor; Metropolitan (Agency) has 4 — use Metropolitan |
| `draft_approved` / `draft_dismissed` | Approve/dismiss a content draft | needs a draft to exist (Growth+); use whichever org has drafts |
| `journey_triggered` | Run a conversation journey | **Agency+ only** — use Metropolitan, not the Growth org |
| `hallucination_acknowledged` | Acknowledge a hallucination incident | needs an incident; Metropolitan likely has some |
| `feature_flag_changed` | operator flag toggle | operator-only path; may skip |
| `member_role_changed` / `member_removed` | change/remove a member | Agency org (Metropolitan) — needs a 2nd member; optional |

Do at least: **view competitive-benchmark on Metropolitan** and **acknowledge a hallucination on
Metropolitan** (both Agency, both likely have data), plus **re-view data-residency** to generate a
fresh row. Watch the SERVER TERMINAL during each for a **23502 / NOT NULL / null-org** error (the
S7 signature). Then:
```bash
psql "$PROD" -c "
  SELECT action, resource_type, user_id, resource_id, created_at
  FROM audit_trail
  WHERE organization_id = 'da1071de-6dbd-4e08-8f43-29f76c123be9'
  ORDER BY created_at DESC LIMIT 20;"
```
EXPECT: a new row per triggered action, with the correct `action`, `resource_type`, a non-null
`organization_id`, and `user_id` = the acting user (or null for system). NO 23502 in the terminal.
- If an action fires but NO row lands → that specific backward-edit (recordAction call) is missing
  or mis-wired on that route → finding, name the route.
- If the terminal throws 23502/null-org → the `organizationId`-vs-`orgId` destructure bug on that
  route → finding (the S7 HIGH class).

Then reload **/settings/audit-trail on the Metropolitan org** (switch org in the top-bar) and
confirm the rows RENDER (action + resource_type + actor + timestamp), pagination works, and "system"
shows for any null user_id. (The Growth org's trail stays empty unless you triggered actions there —
that's correct, RLS is per-org.)

---

## PART C — The WH-01 webhook chain (Priority 1 — the #1 cross-sprint payoff)
The 5 Phase 2 webhook events (internal slash → external dot) deliver only if the source emits AND
fanout maps AND a real POST lands in `webhook_deliveries`. The 2 NEWLY-ADDED emits are highest risk
(`visibility/trend-updated`, `hallucination/acknowledged`) — mirror of S7's dual-emit bug.

### C1 — Configure a webhook endpoint (so there's something to deliver to)
```bash
# Find how webhook endpoints are registered (the webhook_endpoints/subscriptions table + the UI/API):
grep -Rn "webhook_endpoints\|webhookEndpoints\|VALID_EVENTS\|subscribe.*event" app/ lib/ db/ | grep -v test | head
```
Register a test endpoint on the Metropolitan org subscribed to the 5 Phase 2 events. Use a
request-bin style catch URL (e.g. a webhook.site URL) so real POSTs are visible — or, if outbound
is restricted, confirm delivery via the `webhook_deliveries` rows alone.

### C2 — Fire the events via a real audit + the acknowledge path, READ THE TERMINAL
Run a real audit on Metropolitan (fires report/generated, visibility/trend-updated,
agent/readiness-scored, hallucination/detected as applicable) AND acknowledge a hallucination
(fires hallucination/acknowledged). Watch the server terminal for:
- each internal slash event emitted (`visibility/trend-updated`, `hallucination/acknowledged`, etc.)
- fanout-webhooks picking each up and mapping slash→dot
- **any slash-vs-dot mismatch** (an event that fires but fanout never catches = the S7 bug)

### C3 — Confirm actual deliveries landed
```bash
psql "$PROD" -c "
  SELECT event_type, endpoint_id, response_status, attempt_number, created_at
  FROM webhook_deliveries
  WHERE created_at > now() - interval '15 minutes'
  ORDER BY created_at DESC LIMIT 30;"
```
EXPECT: delivery rows for the fired events (the dot forms: report.generated,
visibility.trend.updated, hallucination.acknowledged, agent.readiness.scored,
hallucination.detected as applicable), each with a real response_status. Specifically confirm the
**2 newly-added emits** produced deliveries — if report.generated delivers but
visibility.trend.updated / hallucination.acknowledged do NOT, those emits are dead (the exact WH-01
failure mode). 
### C4 — Retry idempotency
If any delivery shows multiple attempts, confirm the dedup (webhook_deliveries + step.run per
endpoint) prevented a double-POST to the customer (attempt_number increments but the endpoint isn't
hit twice for the same event id). A retry must be a no-op, not a duplicate delivery.

---

## PART D — ONLY IF Part A/B shows recordAction not writing (diagnosis, no fix yet)
```bash
sed -n '1,60p' lib/governance/audit-trail.ts   # confirm recordAction destructures organizationId (not orgId) and INSERTs
# Check each of the 7 audited routes actually calls it AND passes the right key:
for R in \
  "app/api/organizations/[orgId]/data-residency/route.ts" \
  "app/api/brands/[brandId]/competitive-benchmark/route.ts" \
  "app/api/brands/[brandId]/journeys/[journeyId]/run/route.ts" \
  "app/api/brands/[brandId]/hallucinations/[id]/route.ts" \
  "app/api/brands/[brandId]/drafts/[id]/route.ts" ; do
  echo "=== $R ==="; grep -n "recordAction\|organizationId\|orgId" "$R";
done
```
REPORT which routes call recordAction, and whether any passes `orgId` where recordAction expects
`organizationId` (or vice-versa) — the S7 null-org signature. Do NOT fix here; report so the fix is
scoped precisely.

## Constraints
- Trigger actions via real UI/API paths — NO raw INSERTs into audit_trail (that would fake the very
  thing we're testing).
- Read the SERVER TERMINAL during every triggered action — the 23502/null-org and slash-vs-dot bugs
  only show there, not in the row count.
- `$PROD` connection from env; tier via subscriptions.tier.
- Real webhook endpoint only (webhook.site or similar) — don't fabricate delivery rows.

## Report back (paste inline)
1. Part A: the Metropolitan audit_trail dump + total-rows count → recordAction writes, or not.
2. Part B: which actions were triggered, the new rows that landed (or didn't), any 23502 in the
   terminal, and confirmation the rows render on /settings/audit-trail.
3. Part C: the webhook_deliveries rows after the audit + acknowledge — especially whether the 2
   newly-added emits (visibility.trend.updated, hallucination.acknowledged) delivered. Any
   slash-vs-dot mismatch in the terminal.
4. Part D (only if needed): which routes call recordAction + any orgId/organizationId mismatch.
