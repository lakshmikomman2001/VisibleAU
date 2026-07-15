# Claude Code — VERIFY (behavioral, not static): tier gating follows subscriptions.tier when the two fields DIVERGE

The tier-source fix (14 locations) is STATICALLY verified: reads subscriptions.tier, compiles, defaults to free. But
the invariant exists for ONE case — when `subscriptions.tier` and `organizations.tier` DISAGREE (org.tier lags between
Stripe webhooks / was never backfilled). Static grep can't prove behavior in that case. This test forces the two fields
apart and confirms the UI + audit path follow `subscriptions.tier`. Verification only — restore the DB after.

Env: local PROD DB. Test org = the one behind Bondi/Metropolitan (Test Org Agency 1, currently Agency).

## Concrete gates to assert (verified against canon)
- **Reports** surface = **Growth+** (generated_reports Growth+; Starter LOCKED) — LLD 607/610
- **Delivery schedules** = **Agency+** (report_delivery_schedules) — LLD 1064/1786; agency/schedules/page.tsx gates here
- **Retrieval** = Starter+ (context, not the focus)
- **Audit engine count** = `TIER_ENGINES[tier].length` (Free/Starter=2, Growth+=4) — run-audit.ts:47 reads tier

## STEP 0 — Record the current true state (to restore later)
```bash
psql "$DATABASE_URL" -c "SELECT o.id AS org_id, o.tier AS org_tier, s.tier AS sub_tier FROM organizations o LEFT JOIN subscriptions s ON s.organization_id=o.id WHERE o.id=(SELECT organization_id FROM brands WHERE domain='metropolitanplumbing.com.au');"
```
Note the org_id, org_tier, sub_tier. **Save these — you will restore them in STEP 4.**

## STEP 1 — Force DIVERGENCE: subscriptions.tier=agency, organizations.tier=starter
The point: if the app were still (wrongly) reading org.tier, it would gate as STARTER. If it correctly reads
subscriptions.tier, it gates as AGENCY. Set them to disagree:
```bash
psql "$DATABASE_URL" -c "UPDATE organizations SET tier='starter' WHERE id='<ORG_ID>';"
psql "$DATABASE_URL" -c "UPDATE subscriptions SET tier='agency' WHERE organization_id='<ORG_ID>';"
psql "$DATABASE_URL" -c "SELECT o.tier org_tier, s.tier sub_tier FROM organizations o JOIN subscriptions s ON s.organization_id=o.id WHERE o.id='<ORG_ID>';"
# Expect: org_tier=starter, sub_tier=agency  (deliberately divergent)
```

## STEP 2 — Assert the UI follows subscriptions.tier (=agency), NOT org.tier (=starter)
Reload each page in the browser (org.tier now says starter; correct behavior = full Agency access from sub.tier):
- **Reports** (`/brands/<id>/reports`): should be ACCESSIBLE (Growth+), not locked/upgrade-gated.
- **Agency dashboard** (`/agency`): should render Agency features, not a Starter upgrade prompt.
- **Delivery schedules** (`/agency/schedules`): should be ACCESSIBLE (Agency+).
- **Action Center** (`/action-center`): Agency-level entitlements.
If any of these show a STARTER/locked state, the page is still reading org.tier → that callsite wasn't actually fixed.
Report each page's observed access level.

## STEP 3 — Assert the AUDIT PATH follows subscriptions.tier (the callsite that spends money)
run-audit.ts:47 now reads subscriptions.tier → drives TIER_ENGINES engine count. With sub.tier=agency, an audit must
fire 4 engines (not 2 as starter would):
```bash
# Trigger an audit for Metropolitan, then:
psql "$DATABASE_URL" -c "SELECT DISTINCT engine FROM citations c JOIN audits a ON c.audit_id=a.id WHERE a.brand_id=(SELECT id FROM brands WHERE domain='metropolitanplumbing.com.au') AND a.created_at > now() - interval '15 min' ORDER BY engine;"
# Expect 4 engines (chatgpt, claude, gemini, perplexity) — proving the audit read sub.tier=agency, not org.tier=starter
```
Report the engine count. 4 = audit path correctly reads subscriptions.tier. 2 = it's reading org.tier (starter) → bug
in run-audit.ts:47 despite the grep.

## STEP 4 — RESTORE the true state (do NOT leave the DB divergent)
```bash
psql "$DATABASE_URL" -c "UPDATE organizations SET tier='<ORIGINAL_ORG_TIER>' WHERE id='<ORG_ID>';"
psql "$DATABASE_URL" -c "UPDATE subscriptions SET tier='<ORIGINAL_SUB_TIER>' WHERE organization_id='<ORG_ID>';"
psql "$DATABASE_URL" -c "SELECT o.tier org_tier, s.tier sub_tier FROM organizations o JOIN subscriptions s ON s.organization_id=o.id WHERE o.id='<ORG_ID>';"
# Confirm both back to the STEP 0 values.
```

## (Optional) STEP 5 — the fail-closed direction
If quick: set sub.tier=starter, org.tier=agency (reverse divergence). Reports/schedules should now be LOCKED (following
sub.tier=starter), proving it doesn't over-grant from a stale agency org.tier. Restore after.

## VERDICT
- **PASS:** with sub=agency / org=starter, all four pages show AGENCY access AND the audit fires 4 engines → every
  callsite follows subscriptions.tier; the invariant holds behaviorally, not just statically. Fix fully verified.
- **FAIL at a page:** that page still reads org.tier (showed starter/locked) → name it; that callsite needs re-fixing.
- **FAIL at audit:** 2 engines → run-audit.ts:47 still reads org.tier → re-fix (this is the money callsite).
- Report each page's access + the engine count, and CONFIRM the DB was restored (STEP 4).

## Constraints
- Verification only — no code changes. RESTORE the DB in STEP 4 (don't leave it divergent).
- Real 4-engine spend in STEP 3 — one audit. Confirm PROD DB.
- Use a transaction or careful UPDATE/restore so you don't strand the org in a wrong tier.

## NOTE
This is the case the fix exists for: the two tier fields DISAGREE. Static verification proved "reads the right field";
this proves "gates correctly when they diverge" — the only scenario that was ever broken. sub=agency/org=starter is the
decisive setup: correct code shows Agency everywhere (UI + 4-engine audit); the old bug would show Starter. The audit
callsite (STEP 3) matters most — it's freshly changed AND it drives real spend. Restore the DB when done.
