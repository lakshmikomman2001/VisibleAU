# VisibleAU Phase 3 LLD — Audit Report
## 9 Critical Conflicts Found — May 2026

---

## P3-1 ⚠️ CRITICAL — market_code format mismatch: Phase 2 uses `'au'`/`'us'`, Phase 3 uses `'AU_EN'`/`'US_EN'`

**Impact: Every Phase 3 INSERT statement, every JOIN to Phase 2 tables, all fail.**

Phase 2 canonically uses lowercase market codes without locale suffix (`'au'`, `'us'`) — established in Round 1 FIX A and used in every table across 15 audit rounds.

Phase 3 seeds all four registries using uppercase codes with locale suffix: `'AU_EN'`, `'US_EN'`, `'NZ_EN'`, `'UK_EN'`, `'CA_EN'`.

Every Phase 3 `INSERT INTO market_directory_signals VALUES ('US_EN', ...)` joins to `markets WHERE market_code='us'` (Phase 2 value) → **foreign key mismatch on every query**.

**Fix:** Phase 3 adopts Phase 2 lowercase format throughout. All Phase 3 seed data uses `'au'`, `'us'`, `'nz'`, `'uk'`, `'ca'`. Phase 3 new market codes: `'nz'`, `'uk'`, `'ca'`.

---

## P3-2 ⚠️ CRITICAL — Sprint 20 replaces Sprint 15's `USSignalsService` with `SignalsEngine` — no regression protection

Sprint 15 (Phase 2) ships `USSignalsService` with hardcoded Yelp, Angi, BBB, HomeAdvisor. Sprint 20 (Phase 3) **replaces it entirely** with a generic `SignalsEngine` reading from `market_directory_signals`. This means Sprint 15 code is throwaway — fine in principle, but risky in practice:

- If `SignalsEngine` has a bug it breaks **all markets simultaneously** (AU, US, NZ, UK, CA)
- The new market checklist doesn't distinguish "Sprint 20 migration rows" (AU+US) from "new market rows" (NZ, UK, CA) — AU and US signal rows must be seeded first
- Phase 3 has no shadow mode or regression gate for the migration

**Fix:** Sprint 20 scope explicitly:
1. Seeds AU and US rows to `market_directory_signals` as first task
2. Runs `SignalsEngine` in shadow mode for 1 week (both engines run, results compared)
3. Goes live only when results match; Phase 2 `USSignalsService` retained until validated
4. Full AU E2E + US E2E suite run after `SignalsEngine` cuts over

---

## P3-3 ⚠️ CRITICAL — Phase 3 generic location columns conflict with Phase 2 AU/US-specific columns

Phase 3 `LocationPicker` writes to generic columns: `brands.location_primary`, `brands.location_subdivision`, `brands.location_subdivision_abbr`, `brands.location_postal`.

Phase 2 schema uses:
- AU: `brands.primaryRegions TEXT[]` (Phase 1 format, `'STATE:suburb'`)
- US: `brands.us_primary_cities TEXT[]`, `brands.us_state`, `brands.us_zip`, `brands.us_price_range`

Phase 3 introduces a third location schema into the same `brands` table. NZ/UK/CA brands would use `location_primary`; AU continues with `primaryRegions`; US continues with `us_primary_cities`. The `LocationPicker` component and prompt engine must branch by `brand.market_code`.

**Fix:** Phase 3 explicitly states: Sprint 21 adds generic location columns (`location_primary`, `location_subdivision`, `location_subdivision_abbr`, `location_postal`) to `brands`. AU/US brands continue using legacy columns — **no migration of Phase 1/2 data**. `LocationPicker` branches by `market_code`: AU → `primaryRegions`, US → `us_primary_cities/us_state/us_zip`, NZ/UK/CA → new generic columns. Prompt engine branches similarly.

---

## P3-4 ⚠️ CRITICAL — `check_type='scrape'` for BBB, Angi, Checkatrade, Rated People — ToS violation risk centralised across all markets

`market_directory_signals` seeds `check_type='scrape'` for: BBB, Angi, HomeAdvisor (US), Hipages, Yellow Pages AU, ServiceSeeking (AU), NoCowboys (NZ), Checkatrade, Rated People (UK).

Web scraping at scale may violate the Terms of Service of these directories. By centralising all scraping into `SignalsEngine`, a single IP ban or legal notice blocks signals for **all markets simultaneously**.

Phase 3 Section 6 ("What Phase 3 does NOT solve") does not mention this risk.

**Fix:** Sprint 20 DoD includes: legal ToS review for every `check_type='scrape'` entry. Add `tos_compliance_status TEXT` column to `market_directory_signals` (`'compliant'` | `'api_preferred'` | `'risk_accepted'`). Directories prohibiting scraping → `check_type='api'` (with API key) or `check_type='manual'`. Sprint 20 deployment gate: no `check_type='scrape'` row with `tos_compliance_status IS NULL`.

---

## P3-5 ⚠️ CRITICAL — Sprint 24 cross-market agency dashboard conflicts with Phase 2 one-market-per-org schema

Phase 2 FIX VV2 (Round 8) explicitly states: *"Phase 2 supports ONE market per org. Multi-market brand management is Phase 3+"*. The current schema reflects this: `organizations.market_code` is a single `TEXT` column; `subscriptions` has `UNIQUE(organizationId)` (one billing currency per org).

Phase 3 Sprint 24 delivers: *"one VisibleAU account, brands in AU + US + NZ + UK"* — which requires multi-market orgs. Sprint 24 is scoped at ~2 weeks, but the schema migration alone is substantial.

**Fix:** Sprint 24 LLD must specify the schema changes required:
- `organizations.market_code TEXT` → either `TEXT[]` (array) or removed (market_code moves entirely to `brands`)
- `subscriptions` gains multi-currency support (remove single market_code constraint)
- `BudgetPolicyService` uses `brand.market_code` not `org.market_code` for limit lookup
- All current Phase 2 constraints referencing `org.market_code` must be updated

Sprint 24 budget must increase to ~4 weeks to accommodate schema migration + regression testing.

---

## P3-6 ⚠️ CRITICAL — UK GDPR compliance underestimated at 1 day; requires 3–5 days minimum

Phase 3 UK market effort: *"~5 days: 2 days data config, 2 days prompt writing, 1 day ICO registration + VAT verification"*. This underestimates UK GDPR significantly:

| Task | Estimate |
|---|---|
| ICO registration | 1 day |
| Cookie consent update (explicit consent — different from AU/US) | 1 day |
| Right to erasure implementation for UK users (GDPR Article 17) | 1 day |
| Article 30 data processing records | 0.5 day |
| Legal basis for processing documentation (Article 6) | 0.5 day |

**Total: ~4 days compliance**, not 1 day. Sprint 23 budget of ~2 weeks remains viable if compliance is properly scoped. Fix: Sprint 23 scope updated to include full UK GDPR compliance checklist. UK effort estimate revised to *"~5 days data + 4 days compliance = ~9 days total"*.

---

## P3-7 — `stripe:seed --market` script conflicts with Phase 2's `stripe:setup`

Phase 2 uses `pnpm stripe:setup` (made idempotent in FIX FFF2 Round 14). Phase 3 checklist Step 15 references `pnpm visibleau stripe:seed --market [CODE]`. Two different command names for related functionality. After Phase 3 deploys, developers face ambiguity.

**Fix:** Phase 3 Sprint 21 scope clarifies the relationship: `stripe:seed --market` supersedes `stripe:setup`. After Sprint 21, all markets (including AU and US) use `stripe:seed --market [code]`. The Phase 2 `stripe:setup` becomes a legacy alias for `stripe:seed --market au`. Update CLAUDE.md in Sprint 21.

---

## P3-8 — `config:validate` CLI tool referenced in new market checklist but never specified

Checklist Steps 12 and 14 reference `pnpm visibleau config:validate --market [CODE]`. This tool validates registry completeness before a new market goes live. Its checks, output format, and which sprint builds it are not specified anywhere in Phase 3.

**Fix:** Sprint 20 or 21 scope includes building `config:validate`. Validation checks: all required registry tables have rows for the target `market_code` (`market_directory_signals`, `market_location_formats`, `market_legal_snippets`, `market_tax_profiles`, `market_ai_budget_policies`, `sampling_policies`, `metric_quality_gates`, `provider_market_capabilities`). Exits non-zero if any registry is incomplete, with specific missing-row detail.

---

## P3-9 — CA province-level tax variation (5–15%) cannot be expressed in a single `market_tax_profiles.tax_rate` field

`market_tax_profiles` has one `tax_rate` per market. Canada has province-level GST/HST variation: Alberta 5%, Ontario HST 13%, Nova Scotia HST 15%, Quebec GST+QST ~15%. A single rate is incorrect for display.

Note: Stripe Tax (set to `exclusive` for CA) handles actual rate calculation automatically — so billing is correct. But UI display of a single rate misleads customers.

**Fix:** Add `tax_rate_display TEXT NULL` to `market_tax_profiles` for human-readable UI display. CA value: `'5–15% (GST/HST varies by province)'`. AU/UK/NZ: single rate display. `tax_rate` remains as the default/fallback rate for Stripe product seeding; `tax_rate_display` overrides what's shown in the UI.

---

## Summary

| ID | Severity | Fix Sprint |
|---|---|---|
| P3-1 | 🔴 Blocking | S20 — fix all seed data to lowercase |
| P3-2 | 🔴 Blocking | S20 — shadow mode + regression gate |
| P3-3 | 🔴 Blocking | S21 — document location column strategy |
| P3-4 | 🔴 Blocking | S20 — ToS review before deployment |
| P3-5 | 🔴 Blocking | S24 — specify multi-market schema changes |
| P3-6 | 🟠 High | S23 — expand compliance scope |
| P3-7 | 🟠 High | S21 — stripe:seed supersedes stripe:setup |
| P3-8 | 🟠 High | S20/S21 — build config:validate |
| P3-9 | 🟡 Medium | S21 — add tax_rate_display field |

*VisibleAU Phase 3 LLD Audit Report — May 2026*

---

## Round 3 audit — 6 more critical conflicts (P3-19 through P3-24)

---

## P3-19 🔴 CRITICAL — CA market has zero rows in `market_directory_signals` AND no dedicated sprint

**Two compounding gaps that make the CA market unlaunchable.**

Section 3 documents five CA directories: Yellow Pages CA, Yelp CA, HomeStars, BBB Canada, Houzz CA. Section 1.1 seeds signal rows for US, AU, NZ, and UK — but **zero rows for CA**. `CA_EN` only appears in `market_location_formats`, one `market_legal_snippets` row (CASL), and `market_tax_profiles`. Every CA audit would run zero directory checks — `local_signals` dimension stays `NULL` for all CA brands.

Independently: the sprint plan has S20 / S21 / S22 (NZ) / S23 (UK) / S24 (multi-region). **There is no sprint for CA market launch.** CA is fully described in Section 3 but never scheduled.

**Fix:** Add S25 (or expand S24) to launch CA market. Seed CA signal rows in Section 1.1: Yellow Pages CA (`scrape`), Yelp CA (`api`, reuse `YELP_API_KEY`), HomeStars (`scrape`), BBB Canada (`scrape`), Houzz CA (`scrape`).

---

## P3-20 🔴 CRITICAL — Trustpilot UK API requires an API key; seed has `api_key_env_var=null` — all UK Trustpilot checks return HTTP 401

Phase 3 seeds the UK Trustpilot check as `check_type='api'` with `api_key_env_var=null`. The Trustpilot v1 Business Units endpoint (`/v1/business-units/find`) requires `Authorization: apikey {key}` on every request. Without it, the API returns 401 Unauthorized. Every UK brand that has a Trustpilot profile scores zero on this signal — a significant trust indicator for UK businesses is permanently broken.

**Fix:** Option A — `requires_api_key=true`, `api_key_env_var='TRUSTPILOT_API_KEY'`. The Trustpilot Business API is free to register. Option B — change to `check_type='scrape'`, `check_url_template='https://www.trustpilot.com/review/{brand}'` — no API key required.

---

## P3-21 🔴 CRITICAL — New market checklist Step 1 omits `billing_enabled` — new markets block payments indefinitely

Phase 2 `markets` table has a `billing_enabled` column (false by default in Sprint 13, set true in Sprint 17 for US). Checklist Step 1: `INSERT INTO markets (market_code, locale, currency_code, is_enabled=false)` — no `billing_enabled`. Step 16: `UPDATE markets SET is_enabled=true` — still no `billing_enabled`. Step 15 seeds Stripe products for the new market, but the Phase 2 billing gate checks `markets.billing_enabled` before allowing checkout. With `billing_enabled` defaulting to false, NZ/UK/CA customers can browse the pricing page but every checkout attempt is blocked.

**Fix:** Step 16 updated to: `UPDATE markets SET is_enabled=true, billing_enabled=true WHERE market_code='[NEW]'`. Or split into a beta phase (is_enabled=true, billing_enabled=false) followed by a billing go-live step (billing_enabled=true).

---

## P3-22 🔴 CRITICAL — `market_legal_snippets page_target='footer'` only patches web pages — UK GDPR and CASL require legal disclosures in email footers

`market_legal_snippets` renders its snippets in the Next.js web app (privacy page, terms page, web footer). Email templates are managed separately by Resend and have no access to `market_legal_snippets`.

UK commercial email regulations require: sender name, physical address, and opt-out mechanism in every commercial email. Canadian CASL requires: sender identity, mailing address, and a working unsubscribe mechanism (processed within 10 days). These disclosures are not in the current Resend templates, and `market_legal_snippets` with `page_target='footer'` never reaches them.

**Fix:** Phase 3 Sprints 22/23 must update all 5 Resend email flows (audit completion, drift alert, JQ4, portal invite, schedule pause) to include a `{{marketLegalFooter}}` variable. Add `page_target='email_footer'` to `market_legal_snippets`. Each market seeds an email-footer snippet with the required legal text.

---

## P3-23 🔴 CRITICAL — `SignalsEngine.adapterRegistry.get()` has no fallback — unknown `check_type` throws `TypeError`, crashing all signal checks for the brand

```typescript
const adapter = this.adapterRegistry.get(check.checkType);
return adapter.check(url, check); // 💥 TypeError if adapter is undefined
```

If any `market_directory_signals` row contains a `check_type` value not registered in `adapterRegistry`, `adapter` is `undefined` and `.check()` throws. This doesn't just skip the unrecognised check — it crashes `runChecks()` entirely, failing **all** signal checks for that brand. An operator who adds a new directory with a typo in `check_type` silently breaks every signal for an entire market.

**Fix:** Sprint 20 scope: `adapterRegistry.get()` returns a `NullAdapter` for unknown types. `NullAdapter.check()` returns `{ present: false, score: null, skipped: true, reason: 'unknown_check_type' }` and logs a warning. The rest of `runChecks()` continues normally.

---

## P3-24 🔴 CRITICAL — Phase 2 email Inngest functions branch on `'au'` and `'us'` only — NZ/UK/CA brands fall through to the wrong template

Phase 2 `send-audit-complete-email` and `detect-drift` Inngest functions select email templates based on `marketCode` (FIX MM3 R11, TT3 R12). The template selection handles `'au'` and `'us'`. Phase 3 adds three new market codes: `'nz'`, `'uk'`, `'ca'`. These hit the `else` / default branch — likely rendering the AU template for all three, or throwing an unhandled switch case.

A UK customer receives: A$-denominated upgrade CTAs, "VisibleAU Pty Ltd" as legal entity, AU date formatting, and no VAT or ICO reference. A CA customer receives the same AU template instead of the US-style CASL-compliant version.

**Fix:** Phase 3 Sprints 22 and 23 update the Inngest email template switch to handle all five codes explicitly: `'nz'` → AU-style template (similar market, NZD prices); `'uk'` → GBP amounts, VAT/ICO footer, UK physical address; `'ca'` → US-style template with CASL consent footer and CAD pricing.

---

## P3-25 (clarification) — `LocationPicker` one-primary-location-per-brand is intentional; needs documentation

`market_location_formats` has `UNIQUE(market_code)` — one format row per market, one primary location per brand entry. This is by design: multi-location brands use existing array columns (`us_primary_cities[]`, `primaryRegions[]`) for prompt expansion, while `LocationPicker` captures just the primary service location. This design choice should be explicitly documented in the checklist so Phase 3 implementers don't add array-type location columns for NZ/UK/CA.

---

## Combined Phase 3 conflict summary (all 3 rounds)

| ID | Severity | Fix Sprint |
|---|---|---|
| P3-1 | 🔴 | S20 — fix all seed data to lowercase market codes |
| P3-2 | 🔴 | S20 — shadow mode + AU/US regression gate |
| P3-3 | 🔴 | S21 — document legacy vs generic location column strategy |
| P3-4 | 🔴 | S20 — ToS review before deployment gate |
| P3-5 | 🔴 | S24 — specify multi-market org schema changes |
| P3-6 | 🟠 | S23 — expand UK GDPR compliance scope |
| P3-7 | 🟠 | S21 — stripe:seed supersedes stripe:setup |
| P3-8 | 🟠 | S20/S21 — build config:validate CLI tool |
| P3-9 | 🟡 | S21 — add tax_rate_display field for CA |
| P3-10 | 🔴 | S20 — applies_to_verticals must use enum values ('tradies' not 'home_services') |
| P3-11 | 🔴 | S20 — replace {lat}/{lng} GBP URL with text-based search |
| P3-12 | 🔴 | S20 — implement rate_limit_per_hour via Upstash Redis token bucket |
| P3-13 | 🔴 | S22/S23 — define NZ/UK/CA Stripe tier pricing before stripe:seed |
| P3-14 | 🔴 | S23 — CASL explicit consent mechanism in CA signup flow |
| P3-15 | 🔴 | S21 — change CA autocomplete to google_places (existing API key) |
| P3-17 | 🔴 | S20 — SignalsEngine handles AU+US locations only; S21 adds market_location_formats |
| P3-18 | 🟠 | S22/S23 — use 'VisibleAU Pty Ltd (operating in NZ/UK)' until incorporated |
| P3-19 | 🔴 | Add CA sprint + seed CA signal rows |
| P3-20 | 🔴 | S23 — fix Trustpilot API key or switch to scrape |
| P3-21 | 🔴 | All market launches — add billing_enabled=true to checklist Step 16 |
| P3-22 | 🔴 | S22/S23 — add email_footer snippets to Resend templates |
| P3-23 | 🔴 | S20 — NullAdapter fallback for unknown check_type |
| P3-24 | 🔴 | S22/S23 — extend email template switch to handle nz/uk/ca |

**Total: 23 critical conflicts across 3 Phase 3 audit rounds**

*VisibleAU Phase 3 LLD Audit Report — Round 3 added May 2026*

---

## Round 4 audit — 8 more critical conflicts (P3-26 through P3-33)

---

## P3-26 🔴 CRITICAL — Checklist Step 2 inserts `number_format` into `market_locales` — column does not exist in Phase 2 schema

Phase 3 checklist Step 2: `INSERT INTO market_locales (market_code, locale, date_format, number_format)`. Phase 2 `market_locales` has columns: `market_code`, `locale`, `date_format`, `currency_symbol`, `legal_entity_name`. The column `number_format` was never added — it doesn't exist. Every new market launch breaks at Step 2 with a `column "number_format" does not exist` PostgreSQL error.

**Fix:** Either (A) correct the checklist to use existing columns (`currency_symbol`, `legal_entity_name`), or (B) Sprint 21 includes a migration adding `number_format TEXT NULL` to `market_locales` before the checklist is used for NZ/UK/CA.

---

## P3-27 🔴 CRITICAL — `LocationPicker` Google Places autocomplete requires a browser-exposed API key — server-side `GOOGLE_PLACES_API_KEY` is never sent to the browser

`LocationPicker` runs client-side in the browser. Its autocomplete calls Google Places API directly from the browser, which requires an API key passed in the request URL. In Next.js, only env vars prefixed with `NEXT_PUBLIC_` are bundled into the client. `GOOGLE_PLACES_API_KEY` (no prefix) is a server-only secret — it is never exposed to the browser. All `LocationPicker` autocomplete requests fail silently with "API key missing."

**Fix:** Option A — add `NEXT_PUBLIC_GOOGLE_PLACES_API_KEY` with tight Google API key restrictions (allowed APIs: Places only; allowed referrers: `app.visibleau.com`). Option B (recommended for security) — proxy through a Next.js route: `/api/places/autocomplete?q={input}&country={code}` which calls Google Places server-side. No API key exposure.

---

## P3-28 🔴 CRITICAL — `market_vertical_configs.display_name_us` is semantically wrong for NZ/UK/CA — checklist Step 3 has no column for non-US local vertical names

Phase 2 added `display_name_us TEXT NULL` to `market_vertical_configs` specifically for the US market ("Tradies" → "Home Services"). Phase 3 checklist Step 3 says `INSERT INTO market_vertical_configs (market_code, vertical_key × 3)` without specifying which column holds the local name. For UK market, "UK Tradespeople" would need to go somewhere — and the only place is `display_name_us`, which is wrong semantically and misleads every future developer reading the schema.

**Fix:** Sprint 21 migration renames `display_name_us` → `display_name_override`. This column stores any market's local override for the vertical name. CLAUDE.md updated to document the rename. Checklist Step 3 specifies `display_name_override`. All five markets populate it: AU=`'Tradies'`, US=`'Home Services'`, NZ=`'NZ Trades'`, UK=`'Tradespeople'`, CA=`'Home Services'`.

---

## P3-29 🔴 CRITICAL — `{brand}` URL template variable has no defined source field and no URL encoding — breaks for any brand name with spaces or apostrophes

Every `market_directory_signals` URL template uses `{brand}`. For example: `https://www.bbb.org/search?find_text={brand}&find_loc={city}+{state_abbr}`. Phase 3 never specifies: (1) which field from the `brands` table maps to `{brand}` (`brands.name`? `brands.display_name`?), and (2) how the value is URL-encoded. A brand named "Mike's Plumbing" with an apostrophe produces an invalid query string URL. A brand named "Green Valley HVAC" with spaces breaks path segment URLs. Every brand with non-alphanumeric characters in its name returns zero results from all signal checks.

**Fix:** Section 1.1 documents the template variable contract: `{brand}` maps to `brands.name`, encoded with `encodeURIComponent()` for query parameters; `{brand_slug}` = `brands.name` lowercased with spaces replaced by hyphens for path segments. `SignalsEngine.expandTemplate()` applies the correct encoding per URL position.

---

## P3-30 🔴 CRITICAL — Sprint 20 makes Phase 2 FIX HHH2 obsolete but doesn't update CLAUDE.md — contradictory rules for `localSeoAuditFn`

Phase 2 FIX HHH2 (Round 15) adds to CLAUDE.md: *"localSeoAuditFn market dispatch: if marketCode='us' → USSignalsService; else → AU local SEO checks."* Phase 3 Sprint 20 replaces both `USSignalsService` and `AUSignalsService` with `SignalsEngine` for all markets. After Sprint 20, the HHH2 dispatch code is deleted. But CLAUDE.md still says to call `USSignalsService`. Claude Code reading CLAUDE.md for any future task in this codebase may reintroduce the deleted code, undoing the Sprint 20 migration.

**Fix:** Sprint 20 scope explicitly updates CLAUDE.md: remove the HHH2 dispatch rule entirely; add: *"localSeoAuditFn calls SignalsEngine for all markets. USSignalsService and AUSignalsService are deprecated — do not use or recreate. All signal check configuration lives in market_directory_signals table."*

---

## P3-31 🔴 CRITICAL — `market_tax_profiles.requires_nexus_config` boolean field — the BillingService code that reads it is never specified

`market_tax_profiles` has `requires_nexus_config BOOLEAN` (true for US and CA; false for AU, NZ, UK). Phase 3 says "BillingService reads tax behavior from the DB" but never specifies what `requires_nexus_config=true` triggers in code. Does it enable `automatic_tax.enabled: true` on the Stripe checkout session? Does it control whether Stripe Tax nexus detection runs? Without specifying the code path, this column is dead data — the BillingService ignores it and every CA/US checkout silently miscalculates tax.

**Fix:** Section 1.4 documents the BillingService contract: `requires_nexus_config=true` → checkout session includes `automatic_tax: { enabled: true }`; `stripe_tax_behavior` column sets `tax_behavior` on Stripe Price objects during `stripe:seed`; `requires_nexus_config=false` → no `automatic_tax`; prices shown are final (tax-inclusive).

---

## P3-32 🔴 CRITICAL — `market_tax_profiles` body_text contains `[YOUR ABN]`, `[YOUR NZBN]`, `[YOUR VAT NUMBER]` — render verbatim in customer-facing UI and Stripe invoices

Three seed rows contain literal placeholder text: `'GST included. VisibleAU Pty Ltd ABN: [YOUR ABN]'`, `'VisibleAU NZ Ltd NZBN: [YOUR NZBN]'`, `'VisibleAU Limited VAT No: [YOUR VAT NUMBER]'`. This text appears in the web footer, the checkout page tax summary, and Stripe invoice line items. Customers see `[YOUR ABN]` verbatim — looks unfinished and undermines trust.

**Fix:** Option A — add `legal_registration_number TEXT NULL` to `market_locales`. Body text becomes dynamic, pulling from this field. NZ/UK launch with `null` (no registration number displayed until formally registered). Option B — ship seed data with `'VisibleAU Pty Ltd (operating in NZ/UK)'` and no registration number until formally registered. Both options avoid the placeholder antipattern.

---

## P3-33 🔴 CRITICAL — New market checklist has no demo data step — NZ/UK/CA have no demo organisations or brands in staging throughout development

Phase 2 FIX BBB2 (Round 13) updated `demo:seed` to include a US demo org, brand, and audit for developer testing. Phase 3's new market checklist (17 steps) has no equivalent step. Developers building Sprint 22 (NZ) and Sprint 23 (UK/CA) have no staging demo brands to test signal checks, prompt packs, or the complete audit flow. Every developer must manually create test data before they can test anything.

**Fix:** Add Step 0 to the new market checklist: *"Update demo:seed script to include a [NEW_MARKET] demo org + Home Services brand + sample audit record."* Run before Step 1 so staging has representative data from the first day of each market sprint.

---

## Updated combined Phase 3 conflict summary (all 4 rounds)

| ID | Severity | Fix Sprint | Description |
|---|---|---|---|
| P3-1 | 🔴 | S20 | market_code format: 'AU_EN' → 'au' |
| P3-2 | 🔴 | S20 | Shadow mode + regression gate before USSignalsService removal |
| P3-3 | 🔴 | S21 | Legacy vs generic location column strategy |
| P3-4 | 🔴 | S20 | ToS review for all check_type='scrape' |
| P3-5 | 🔴 | S24 | Multi-market org schema changes |
| P3-6 | 🟠 | S23 | UK GDPR ~4 days not 1 day |
| P3-7 | 🟠 | S21 | stripe:seed supersedes stripe:setup |
| P3-8 | 🟠 | S20/S21 | Build config:validate CLI |
| P3-9 | 🟡 | S21 | tax_rate_display TEXT for CA |
| P3-10 | 🔴 | S20 | applies_to_verticals: 'tradies' not 'home_services' |
| P3-11 | 🔴 | S20 | GBP URL: replace {lat}/{lng} with text search |
| P3-12 | 🔴 | S20 | Rate limiter for Promise.all checks |
| P3-13 | 🔴 | S22/S23 | Define NZ/UK/CA tier pricing |
| P3-14 | 🔴 | S23 | CASL explicit consent for CA signup |
| P3-15 | 🔴 | S21 | CA: use google_places not canada_post |
| P3-17 | 🔴 | S20 | SignalsEngine AU+US only until S21 adds location formats |
| P3-18 | 🟠 | S22/S23 | Use 'VisibleAU Pty Ltd (operating in NZ/UK)' |
| P3-19 | 🔴 | Add CA sprint | CA signal rows missing + no CA sprint |
| P3-20 | 🔴 | S23 | Trustpilot UK needs API key |
| P3-21 | 🔴 | All markets | billing_enabled=true missing from checklist Step 16 |
| P3-22 | 🔴 | S22/S23 | email_footer snippets for Resend templates |
| P3-23 | 🔴 | S20 | NullAdapter fallback for unknown check_type |
| P3-24 | 🔴 | S22/S23 | Email Inngest: add nz/uk/ca template branches |
| P3-26 | 🔴 | S21 | Checklist Step 2: number_format column doesn't exist |
| P3-27 | 🔴 | S21 | LocationPicker: NEXT_PUBLIC_ key or API proxy |
| P3-28 | 🔴 | S21 | Rename display_name_us → display_name_override |
| P3-29 | 🔴 | S20 | {brand} variable: define source + URL encoding |
| P3-30 | 🔴 | S20 | CLAUDE.md: remove HHH2 rule, mark services deprecated |
| P3-31 | 🔴 | S21 | BillingService: document requires_nexus_config code path |
| P3-32 | 🔴 | S22/S23 | Replace [YOUR ABN] placeholders before launch |
| P3-33 | 🔴 | Each sprint | Add demo:seed step 0 to new market checklist |

**Total: 31 critical conflicts across 4 Phase 3 audit rounds**

*VisibleAU Phase 3 LLD Audit Report — Round 4 added May 2026*

---

## Round 5 audit — 7 more critical conflicts (P3-34 through P3-40)

---

## P3-34 🔴 CRITICAL — AU signal URL templates use `{suburb}` but `brands.primaryRegions TEXT[]` has no direct suburb field — all AU directory checks return blank locations after Sprint 20

AU signal URL templates use `{suburb}` as a template variable:
- Hipages: `https://hipages.com.au/find/{brand}/{suburb}`
- Yellow Pages AU: `?clue={brand}&locationClue={suburb}+{state}`
- ServiceSeeking: `?q={brand}&location={suburb}`
- Oneflare: `?query={brand}&location={suburb}`

Phase 1 AU brands store locations as `brands.primaryRegions TEXT[]` in the format `['NSW:Bondi:2026', 'VIC:Melbourne:3000']`. There is **no `brands.suburb` column** anywhere in Phase 1 or Phase 2.

`SignalsEngine.expandTemplate('{suburb}', brand, market)` → `undefined`. All four AU directory checks run with a blank suburb. Every AU brand returns "not found" on Hipages, Yellow Pages AU, ServiceSeeking, and Oneflare — **AU local_signals dimension collapses to 0 for all existing AU customers immediately after Sprint 20 deploys.**

**Fix:** Sprint 20 — `SignalsEngine.expandTemplate()` parses `primaryRegions[0]?.split(':')[1]` to extract the suburb for AU brands. Document in Section 1.1: AU uses `{suburb}` parsed from `primaryRegions`; US uses `{city}` from `us_primary_cities[0]`.

---

## P3-35 🔴 CRITICAL — `provider_market_capabilities` checklist Step 11 specifies no engines, no row count — zero rows means all NZ/UK/CA audits fail

Phase 2 seeds 8 rows: 4 engines × 2 markets. Phase 3 checklist Step 11 says only: `INSERT INTO provider_market_capabilities (market_code, engine rows)`. No engine list, no row count, no capability flags. If Claude Code creates zero rows for NZ, `ProviderCapabilityRegistry` returns an empty engine set for every NZ audit — every audit immediately gets `quality_status='insufficient_data'` with 0 LLM responses.

**Fix:** Checklist Step 11 specifies: insert 4 rows per new market — one per engine (`gpt-4`, `claude-sonnet`, `gemini-pro`, `perplexity`), `is_enabled=true` for all. Capability flags copied from the US market rows as the baseline.

---

## P3-36 🔴 CRITICAL — `market_legal_snippets.effective_date` show/hide logic never specified — wrong interpretation hides all UK GDPR content from the privacy page

Schema comment: `effective_date DATE NULL -- show/hide based on date`. Phase 3 never documents the comparison direction. If the legal page renderer treats `effective_date` as a *sunset date* (hide **after** this date) instead of a *go-live date* (show **from** this date), and UK GDPR snippets have a past `effective_date`, they would all be hidden — the UK privacy page would show no GDPR content. That is both a legal compliance failure and a confusing user experience.

**Fix:** Section 1.3 explicitly documents: snippet is shown when `current_date >= effective_date OR effective_date IS NULL`. No sunset/expiry mechanic in Phase 3. Renderer SQL clause: `WHERE effective_date IS NULL OR effective_date <= CURRENT_DATE`.

---

## P3-37 🔴 CRITICAL — `SignalsEngine` multi-city brands: undefined whether checks run once (primary city only) or per city — either choice has major consequences

`SignalsEngine.runChecks(brand, market)` takes a single `Brand` argument. US brands have `us_primary_cities TEXT[]` — potentially 3–5 service cities. AU brands have `primaryRegions TEXT[]` — multiple suburbs. The LLD never specifies which city `{city}` expands to.

- **Primary only:** a Denver/Austin/Seattle HVAC brand only checks Denver on Yelp and Angi. Austin and Seattle presence is never verified — unfair scoring.
- **Per city:** 3 cities × 5 checks = 15 API calls per audit. Agency with 20 brands = 300 API calls (3× expected). Rate limits consumed 3–5× faster than budgeted.

**Fix:** Document explicit strategy in Section 1.1. Recommended: one run per brand using the primary location only (`us_primary_cities[0]`; AU `primaryRegions[0]` parsed suburb). Additional cities not separately checked in Phase 3.

---

## P3-38 🔴 CRITICAL — `stripe:seed` reads `market_tax_profiles` for tax settings but has no source for tier prices (monthly/annual cent amounts) for NZ/UK/CA

Sprint 21 delivers: *"stripe:seed script reads market_tax_profiles."* `market_tax_profiles` provides: `currency_code`, `stripe_tax_behavior`, `standard_rate_percent`. But `stripe.prices.create()` also requires `unit_amount` in the target currency. For NZ: how many NZD cents is the Starter tier? For UK: how many GBP pence? For CA: how many CAD cents? **No price table exists anywhere in Phase 3.** The `stripe:seed` script for NZ/UK/CA is unimplementable as currently specified — it has the tax settings but no amounts to seed.

**Fix:** Add pricing columns to `market_tax_profiles`: `starter_monthly_cents`, `growth_monthly_cents`, `agency_monthly_cents`, `agency_pro_monthly_cents`, `starter_annual_cents`, `growth_annual_cents`, `agency_annual_cents`, `agency_pro_annual_cents`. Populated before `stripe:seed` runs for each new market.

---

## P3-39 🔴 CRITICAL — `{state_abbr}` in three US signal URL paths is ambiguous — `brands.us_state` never specified as abbreviation, producing invalid URLs for 3 directories

BBB, Angi, and HomeAdvisor URL templates use `{state_abbr}` in path segments:
- Angi: `/companylist/{state_abbr}/{city}/{brand}.htm`
- HomeAdvisor: `/c.{brand}.{city}-{state_abbr}.html`

Phase 2 adds `brands.us_state TEXT NULL` but never documents whether it stores the full name (`'Texas'`) or the two-letter abbreviation (`'TX'`). If stored as `'Texas'`, `{state_abbr}='Texas'` → Angi URL `/companylist/Texas/Denver/Brand` → 404 Not Found for every US brand. All three directories return zero results. Phase 2 `us_location_context` stores both `state_name` and `state_abbr` as separate fields.

**Fix:** CLAUDE.md documents: `brands.us_state` stores the **2-letter abbreviation** only (`'TX'`, `'CA'`, `'NY'`). Brand wizard `LocationPicker` collects the abbreviation, not the full name. `{state_abbr}` → `brands.us_state` directly. If `{state}` (full name) is ever needed, it is looked up from `us_location_context.state_name WHERE state_abbr = brands.us_state`.

---

## P3-40 🔴 CRITICAL — UK GDPR Article 17 right to erasure requires a functional data deletion endpoint — Phase 3 Sprint 23 treats it as a legal snippet problem only

UK GDPR Article 17 (right to erasure) requires that UK users can request deletion of **all** their personal data, and that deletion is completed within **30 days**. This is not addressed by adding an ICO registration snippet to the privacy page.

A functional erasure flow requires: a request endpoint (`POST /api/account/gdpr-erasure`), queuing and tracking of the erasure job, actual deletion or anonymisation of: organisations, brands, audits, subscriptions, API keys, and audit results, and a confirmation email upon completion. Phase 2's JQ4 flow handles AU account deletion and US inactive email separately — neither is a UK GDPR erasure flow. ICO fines for Article 17 non-compliance: up to £17.5M or 4% of global annual turnover.

**Fix:** Sprint 23 UK scope must explicitly include the GDPR erasure endpoint alongside ICO registration. Add to Sprint 23 deliverables: `POST /api/account/gdpr-erasure`, 30-day SLA tracking, confirmation email. This is a code change, not just a data change.

---

## Final Phase 3 conflict table (all 5 rounds — 38 critical conflicts)

| ID | Severity | Fix Sprint |
|---|---|---|
| P3-1 through P3-9 | 🔴🟠🟡 | S20–S24 | *(see Round 1)* |
| P3-10 through P3-18 | 🔴🟠 | S20–S24 | *(see Round 2)* |
| P3-19 through P3-25 | 🔴 | S20–S24 | *(see Round 3)* |
| P3-26 | 🔴 | S21 | market_locales: number_format column missing |
| P3-27 | 🔴 | S21 | LocationPicker: NEXT_PUBLIC_ key or proxy |
| P3-28 | 🔴 | S21 | Rename display_name_us → display_name_override |
| P3-29 | 🔴 | S20 | {brand} variable: source + URL encoding |
| P3-30 | 🔴 | S20 | CLAUDE.md: remove HHH2 rule, mark deprecated |
| P3-31 | 🔴 | S21 | requires_nexus_config: document code path |
| P3-32 | 🔴 | S22/S23 | Replace [YOUR ABN] placeholders |
| P3-33 | 🔴 | Each sprint | Add demo:seed step 0 to checklist |
| P3-34 | 🔴 | S20 | AU {suburb}: parse from primaryRegions[0] |
| P3-35 | 🔴 | S22/S23 | provider_market_capabilities: 4 engines per market |
| P3-36 | 🔴 | S21 | effective_date: show-from semantics documented |
| P3-37 | 🔴 | S20 | Multi-city: primary location only documented |
| P3-38 | 🔴 | S21 | stripe:seed: add price columns to market_tax_profiles |
| P3-39 | 🔴 | S20/S21 | brands.us_state: 2-letter abbr only, in CLAUDE.md |
| P3-40 | 🔴 | S23 | UK GDPR Article 17 erasure endpoint |

**Total: 38 critical conflicts across 5 Phase 3 audit rounds**

*VisibleAU Phase 3 LLD Audit Report — Round 5 added May 2026*

---

## Round 6 audit — 5 more critical conflicts (P3-41 through P3-45)

---

## P3-41 🔴 CRITICAL — `presence_selector` and `rating_selector` are NULL for every seeded row — the scraper cannot determine actual presence and the API adapter cannot extract rating values

Every `market_directory_signals` INSERT statement lists only: `market_code, directory_key, display_name, check_type, check_url_template, trust_signal_weight, requires_api_key, api_key_env_var`. The three selector columns — `presence_selector`, `rating_selector`, `review_count_selector` — are omitted from every INSERT, defaulting to NULL across all 20+ seeded rows in all five markets.

**For `check_type='scrape'` (BBB, Angi, Hipages, Checkatrade, NoCowboys, Yellow Pages AU/NZ, Oneflare, Yell):** The scraper fetches the URL but has no CSS selector to determine whether the brand is actually listed. With `presence_selector=NULL`, the adapter defaults to HTTP 200 = "present." A "No results found" page that returns HTTP 200 marks the brand as present. **Every scrape check is a false positive for every brand in every market.**

**For `check_type='api'` (Yelp, Trustpilot, Companies House):** The API returns JSON but `rating_selector=NULL` means the adapter cannot extract the rating value via JSON path. Yelp returns `{"businesses": [{"rating": 4.5}]}` — without `rating_selector='businesses[0].rating'`, the engine gets `rating=null`. **Every API check returns a null score for every brand.**

**Fix:** Sprint 20 seed must include all three selector values for every row. Examples: Yelp — `rating_selector='businesses[0].rating'`, `review_count_selector='businesses[0].review_count'`; BBB — `presence_selector='.business-listing-card'`; Hipages — `presence_selector='.job-listing-card'`. Sprint 20 DoD: at least one scrape check and one API check verified to return a non-null, non-false-positive result for a test brand.

---

## P3-42 🔴 CRITICAL — Phase 3 registry tables have no RLS policy specified — if Phase 2's org-scoped RLS pattern is applied, all market data becomes inaccessible to every user

Phase 2 applies org-scoped Row Level Security to all its tables: `USING (organization_id = auth.uid()::uuid)` or equivalent. Phase 3 introduces four market-level tables that must be globally readable by every authenticated user: `market_directory_signals`, `market_location_formats`, `market_legal_snippets`, `market_tax_profiles`. These tables do not belong to any organisation — they are shared configuration.

Phase 3 never mentions RLS for any of its new tables. If the developer follows Phase 2 patterns (adding RLS to every new table), these tables get org-scoped policies:

- `SignalsEngine` SELECT returns 0 rows → `local_signals=NULL` for all brands
- `LocationPicker` SELECT returns no format → wizard crashes
- Legal pages SELECT returns no snippets → privacy and terms pages are blank
- `BillingService` SELECT returns no tax profile → checkout fails

**Fix:** Phase 3 migration for each new table explicitly creates a global read policy: `CREATE POLICY 'read_all' ON market_directory_signals FOR SELECT USING (true)`. No INSERT/UPDATE/DELETE for end users — registry tables are write-protected, managed via migration only. CLAUDE.md updated: "Phase 3 registry tables use global-read RLS, not org-scoped RLS."

---

## P3-43 🔴 CRITICAL — `trust_signal_weight` aggregation formula for the `local_signals` dimension score is never specified

`market_directory_signals.trust_signal_weight` has values 0.8–2.0 (GBP=2.0, Yelp=1.5, BBB=1.2, Angi=1.0, HomeAdvisor=0.8). Phase 3 defines the weight values but never documents the formula that aggregates individual check results into the single 0–100 `local_signals` dimension score used by Phase 2's composite scoring engine.

Without a specification, Claude Code implements whichever formula seems natural — simple count (wrong: ignores weights), straight average (wrong: ignores absent checks), or something else. A brand with GBP and Yelp present but BBB absent could score 67% (2 of 3) or 72% (weighted) or 53% (weight-normalised) depending on the implementation. These produce different composite scores, different score trends, and different customer upgrade decisions.

**Fix:** Section 1.1 documents the formula: `local_signals_score = (sum of weight × presence_score for each check) / (sum of weights for all checks) × 100`. `presence_score` per check: 0 = absent, 0.5 = present but no rating, 1.0 = present and rated. Sprint 20 DoD: formula verified with a worked example in the test suite.

---

## P3-44 🔴 CRITICAL — `market_ai_budget_policies` checklist Step 8 specifies no limit values — zero rows means every NZ/UK/CA audit is immediately rejected as `budget_exceeded`

Phase 2 seeds 30 rows per market for `market_ai_budget_policies` (3 segments × 2 use_cases × 5 subscription tiers). These rows define the maximum prompts and cost per audit for each combination. Phase 3 checklist Step 8 says only: `INSERT INTO market_ai_budget_policies (market_code, per-segment limits)` — with zero guidance on what those limits should be.

If Claude Code creates zero rows for NZ, UK, and CA, `BudgetPolicyService.getLimit()` returns null for every NZ/UK/CA audit. The service rejects the audit immediately with `budget_exceeded`. Every single NZ/UK/CA audit fails before a single LLM call is made.

**Fix:** Checklist Step 8 specifies: "Insert 30 rows per new market (3 segments × 2 use_cases × 5 tiers). Use US row values as baseline. Adjust max_cost_cents for GBP/NZD/CAD currency equivalents." Phase 3 Section 3 per-market detail tables include the budget policy values for NZ, UK, and CA.

---

## P3-45 🔴 CRITICAL — `market_legal_snippets.is_required=false` behavior is never documented — misinterpretation silently hides legally required content

`market_legal_snippets` has `is_required BOOLEAN DEFAULT true`. Phase 3 never documents what `is_required=false` means for the legal page renderer. Without specification, the renderer may interpret `is_required=false` as "never show this snippet." If any UK GDPR or CASL snippet is accidentally seeded with `is_required=false`, required legal content disappears from the page — creating a GDPR or CASL compliance failure that is invisible during development because the page renders without errors.

**Fix:** Section 1.3 documents: `is_required=true` means the snippet is always rendered for its market_code. `is_required=false` is reserved for future optional supplementary content and is not used in Phase 3. All Phase 3 seeded snippets use `is_required=true`. The legal page renderer in Sprints 22/23: `WHERE market_code=$1 AND is_required=true AND (effective_date IS NULL OR effective_date <= CURRENT_DATE)`.

---

## Final Phase 3 conflict table — all 6 rounds (43 critical conflicts)

| Range | Count | Summary |
|---|---|---|
| P3-1 to P3-9 | 9 | market_code format, shadow mode, location columns, ToS, multi-market org, UK GDPR, stripe:seed naming, config:validate, CA tax |
| P3-10 to P3-18 | 8 | applies_to_verticals enum, GBP lat/lng, rate limiting, NZ/UK/CA pricing, CASL, canada_post API, Sprint 20 ordering, legal entities |
| P3-19 to P3-25 | 6 | CA missing sprint+signals, Trustpilot API key, billing_enabled, email templates, NullAdapter, email template branching |
| P3-26 to P3-33 | 8 | number_format column, NEXT_PUBLIC_ key, display_name_us rename, {brand} encoding, CLAUDE.md stale, requires_nexus_config, placeholders, demo:seed |
| P3-34 to P3-40 | 7 | AU {suburb} parsing, provider capabilities, effective_date, multi-city, stripe:seed prices, {state_abbr}, GDPR Article 17 |
| P3-41 to P3-45 | 5 | presence/rating selectors NULL, RLS policies, trust_signal_weight formula, budget policy limits, is_required behavior |
| **Total** | **43** | |

*VisibleAU Phase 3 LLD Audit Report — Round 6 added May 2026*

---

## Round 7 audit — 6 more critical conflicts (P3-46 through P3-51)

---

## P3-46 🔴 CRITICAL — Checklist Steps 9 and 10 (`sampling_policies`, `metric_quality_gates`) provide no values for NZ/UK/CA — zero rows breaks quality sampling for all new market audits

Phase 2 fixed this exact problem for the US market in Rounds 14: FIX DDD2 seeds 6 `sampling_policies` rows, FIX CCC2 seeds 6 `metric_quality_gates` rows per market. Phase 3 checklist Step 9 says only `INSERT INTO sampling_policies (market_code, minimum prompt counts)` and Step 10 says `INSERT INTO metric_quality_gates (market_code, per-metric gates)`. Neither provides column lists, row counts, or example values.

Zero rows for NZ: `SamplingPolicyService` returns null → `resolved_config.samplingPolicy` is empty → audits skip quality thresholds entirely. Zero rows for NZ `metric_quality_gates`: every audit gets `quality_status='complete'` regardless of how few LLM responses were collected — a NZ audit with one response is marked as complete and shown to the customer as reliable data.

**Fix:** Checklist Steps 9 and 10 specify: "INSERT 6 rows (3 segments × 2 use_cases). Copy US market values as baseline. Adjust minimum_prompt_count if NZ/UK/CA market size warrants different thresholds." Mirrors the same specificity as the Phase 2 approach.

---

## P3-47 🔴 CRITICAL — `market_legal_snippets.body_text` is Markdown but the `LegalSection` React component renders it as a raw string — Markdown links display as broken literal syntax

The `market_legal_snippets.body_text` schema comment says *"markdown-formatted content."* Phase 3's legal page rendering code passes it directly as a React string child:

```tsx
{snippets.map(s => (
  <LegalSection key={s.snippetKey} heading={s.heading} body={s.bodyText} />
))}
```

In React, a string prop rendered inside a component renders as raw text. The UK GDPR privacy snippet contains:
`'If you are unhappy...you have the right to lodge a complaint with the [Information Commissioner's Office](https://ico.org.uk)'`

This renders on screen as the literal string `[Information Commissioner's Office](https://ico.org.uk)` — not a clickable link. The ICO complaint link is a legal requirement for UK GDPR compliance. The CASL government portal link for CA has the same problem.

**Fix:** `LegalSection` component wraps `body_text` through a Markdown parser. Add `react-markdown` as a dependency in Sprint 22: `<ReactMarkdown>{snippet.bodyText}</ReactMarkdown>`. Sprint 22 DoD: ICO complaints link in UK privacy snippet renders as a working anchor tag.

---

## P3-48 🔴 CRITICAL — Prompt variable names per market are never documented — developers writing NZ/UK/CA prompt packs will use US/AU variable names that silently expand to empty strings

Phase 3 `market_location_formats` defines the correct prompt variable name per market: NZ uses `{region}`, UK uses `{county}`, CA uses `{province}` and `{province_abbr}`. Phase 3 checklist Step 13 says only "Write prompt packs → INSERT INTO vertical_pack_prompts." No documentation tells the prompt author which variables to use for each new market.

A developer writing UK prompts following the US pattern writes `{state}` (familiar from US prompts). The Phase 2 prompt guard (FIX PP1, Round 5) only guards against missing `{location}` for AU — there is no guard for `{county}`, `{region}`, or `{province}`. Wrong variables silently expand to empty strings. The UK prompt asks: *"What are the best plumbers in London, ?"* — with a trailing empty subdivision. LLM responses are geography-unbound and useless.

**Fix:** Phase 3 Section 3 per-market tables include a "Required prompt variables" row: NZ — `{city}`, `{region}`, `{postcode}`; UK — `{city}`, `{county}`, `{postcode}`; CA — `{city}`, `{province}`, `{province_abbr}`, `{postal_code}`. Step 13 of the checklist references this table. `config:validate` (Step 12) checks that all prompt packs for the new market use only documented variables.

---

## P3-49 🔴 CRITICAL — GBP text-search URL fix (P3-11) uses `{state}` generically — UK, NZ, and CA have `{county}`, `{region}`, and `{province}` respectively; GBP location search is empty for 3 of 5 markets

The P3-11 fix (Round 2) replaced `{lat},{lng}` with a text-based GBP search using `?query={brand}+{city}+{state}`. This was written with US and AU in mind — both have `{state}`. But UK brands use `{county}`, NZ brands use `{region}`, and CA brands use `{province_abbr}`.

For a UK plumber in London: GBP URL expands to `?query=Mike's Plumbing+London+` — the `{state}` variable is empty because UK brands don't have a `{state}` field. A GBP search with no location returns results from anywhere, producing unreliable presence scores.

**Fix:** GBP `check_url_template` must be market-specific. Each market seeds its own GBP row with the correct subdivision variable:
- AU/US: `?query={brand}+{city}+{state}`
- UK: `?query={brand}+{city}+{county}`
- NZ: `?query={brand}+{city}+{region}`
- CA: `?query={brand}+{city}+{province_abbr}`

Alternatively, introduce a generic `{subdivision}` variable in `SignalsEngine.expandTemplate()` that resolves to whichever subdivision value the market uses, eliminating the need for market-specific GBP rows.

---

## P3-50 🔴 CRITICAL — Clerk signup flow validation hardcodes accepted `market_code` values — NZ/UK/CA user signups are rejected or silently assigned to the wrong market

Phase 2 Sprint 18 sets `USER.publicMetadata.market_code` at signup from the market cookie. The signup validation was written when only `'au'` and `'us'` were valid markets, so validation likely hardcodes: `if (!['au', 'us'].includes(marketCode)) marketCode = 'au'`. When Phase 3 enables NZ, UK, and CA, a visitor who lands on the NZ-market site and signs up gets `market_code='au'` — assigned to the wrong market and billing currency. No Phase 3 sprint scope explicitly updates this validation.

**Fix:** Sprint 22 (NZ market launch) updates the Clerk signup action to validate `market_code` dynamically: `const valid = await db.select().from(markets).where(eq(markets.isEnabled, true))`. Accept any code returned. Never hardcode the accepted market list — it breaks automatically with every new market launch.

---

## P3-51 🔴 CRITICAL — CSS selector breakage has no monitoring or alerting — directories silently mark all brands as "not found" after any site redesign

Scrape-type signal checks depend on `presence_selector` (CSS selector) to determine if a brand listing exists on a directory page. Hipages, Checkatrade, NoCowboys, BBB, and others periodically redesign their search results pages, changing CSS class names. When a selector breaks, `presence_selector.find()` returns nothing → the brand is marked `present=false`. The audit completes with `quality_status='complete'` and no error. The customer sees every brand as "not listed on Hipages" and receives an action item to "get listed" — even though they already are.

This failure is completely silent: no exception, no `quality_status='failed'`, no customer alert. Phase 3 Section 6 ("What Phase 3 does NOT solve") does not mention selector maintenance.

**Fix:** Sprint 20 DoD includes a selector health monitoring check: if more than 80% of brands in a market return `present=false` for a single directory within one hour, trigger a Sentry alert. Add to Phase 3 Section 6: *"CSS selector maintenance for scrape checks is an ongoing operational requirement. Selectors may break within weeks of a directory site redesign."* Sprint 20 DoD: health alert tested with a simulated broken selector.

---

## Final Phase 3 conflict table — all 7 rounds (49 critical conflicts)

| Range | Count | Key themes |
|---|---|---|
| P3-1 to P3-9 (R1) | 9 | market_code format, shadow mode, location columns, ToS, multi-org schema, UK GDPR, stripe naming, config:validate, CA tax |
| P3-10 to P3-18 (R2) | 8 | applies_to_verticals enum, GBP lat/lng, rate limiting, NZ/UK/CA pricing, CASL, paid autocomplete, sprint ordering, legal entities |
| P3-19 to P3-25 (R3) | 6 | CA sprint+signals missing, Trustpilot key, billing_enabled, email snippets, NullAdapter, Inngest branching |
| P3-26 to P3-33 (R4) | 8 | number_format column, NEXT_PUBLIC_ key, display_name_us rename, {brand} encoding, CLAUDE.md stale, requires_nexus_config, ABN placeholders, demo:seed |
| P3-34 to P3-40 (R5) | 7 | AU {suburb} parsing, provider capabilities, effective_date, multi-city, stripe:seed prices, {state_abbr}, GDPR Article 17 |
| P3-41 to P3-45 (R6) | 5 | presence/rating selectors NULL, RLS policies, trust_signal_weight formula, budget limits, is_required behavior |
| P3-46 to P3-51 (R7) | 6 | sampling/quality gate values, Markdown rendering, prompt variable docs, GBP subdivision variable, Clerk signup, CSS selector monitoring |
| **Total** | **49** | |

*VisibleAU Phase 3 LLD Audit Report — Round 7 added May 2026*

---

## Round 8 audit — 5 more critical conflicts (P3-52 through P3-56)

---

## P3-52 🔴 CRITICAL — `SignalResult` type is never defined — Phase 3 `SignalsEngine` returns an undefined interface incompatible with Phase 1's audit result storage schema

Phase 3 shows `async runChecks(brand: Brand, market: MarketContext): Promise<SignalResult[]>` and each adapter returns `Promise<SignalResult>`. The `SignalResult` type is referenced throughout the Phase 3 design but never defined anywhere in the LLD.

Phase 1 Sprint 7 stores local SEO signal results in a flat structure per-directory: `{ hipagesPresent: boolean, oneflareScore: number, ... }`. The new generic `SignalResult` from Phase 3's adapter pattern is structurally different — one object per check, not one flat object per audit. These two structures are incompatible: the Phase 1 storage layer expects the flat format, but `SignalsEngine` produces an array of generic objects.

Without a specified interface, Claude Code implementing Sprint 20 invents whatever `SignalResult` structure seems natural. The Sprint 20 result is permanently incompatible with the Phase 1 audit storage layer. Signal results for AU, US, NZ, UK, and CA all fail to persist after Sprint 20 deploys.

**Fix:** Phase 3 Section 1.1 defines the complete `SignalResult` interface: `directoryKey`, `marketCode`, `present`, `rating`, `reviewCount`, `rawScore` (0–1 for aggregation), `checkedAt`, `errorCode`. Sprint 20 **also** migrates Phase 1's signal storage schema to use this generic structure, replacing the flat per-directory columns.

---

## P3-53 🔴 CRITICAL — Scraper User-Agent not specified — Cloudflare, DataDome, and Akamai bot detection on major directories return 403 or CAPTCHA, silently marking every brand as "not found"

Phase 3 scrape adapters fetch directory URLs using Node.js `fetch()`. The default User-Agent (`node-fetch/2.6.7` or similar) is trivially identified as a bot:
- Hipages (AU): Cloudflare-protected → 403 for non-browser UA
- Checkatrade (UK): DataDome anti-bot → 403 or JavaScript challenge
- BBB (US): Akamai bot detection → CAPTCHA challenge page
- NoCowboys (NZ): may serve 403 or empty results

A 403 response delivers no listing HTML. `presence_selector` finds nothing. Every brand on these directories returns `present=false`. Every AU brand appears "not listed on Hipages." Every UK tradesperson appears "not on Checkatrade." The audit completes with `quality_status='complete'` — no error is raised. Customers receive incorrect "get listed" action items.

**Fix:** Phase 3 Section 1.1 specifies the scrape adapter's request headers: User-Agent must mimic a real Chrome browser; include `Accept`, `Accept-Language`, `Referer` headers. For Cloudflare-hardened directories: document fallback to `check_type='manual'` — periodic human verification logged in a maintenance table. Sprint 20 DoD: each scrape-type directory verifiable to return HTTP 200 with expected HTML.

---

## P3-54 🔴 CRITICAL — Legal page renderer has no market detection fallback — UK visitors arriving via direct link see AU-only content with no GDPR section

Phase 3's legal page reads `market_code` from the market cookie to load the correct snippets. A UK user who clicks a `/privacy` link from an email, a search engine result, or a bookmark arrives without a market cookie. Next.js SSR reads the cookie at page render time — if the cookie isn't set yet, `getMarketCode()` returns null and falls back to `'au'`. The UK visitor sees the AU privacy policy: no ICO reference, no GDPR rights section, no UK data controller disclosure. If they try to exercise their right to erasure, the page doesn't acknowledge it exists.

**Fix:** Legal page uses a prioritised market detection chain: (1) URL path segment (e.g., `/uk/privacy`); (2) market cookie; (3) `Accept-Language` header mapping (`en-GB` → `uk`, `en-NZ` → `nz`, `en-CA` → `ca`); (4) default `'au'`. Phase 3 LLD specifies that each market has a dedicated legal page URL: `/privacy` (AU default), `/uk/privacy`, `/nz/privacy`, `/ca/privacy`. These are linked in email footers and the relevant market's legal snippets.

---

## P3-55 🔴 CRITICAL — Phase 1 AU prompts with `market_code=NULL` are treated as universal prompts and contaminate NZ/UK/CA audits with AU-specific content

Phase 2 migration 0003 adds `vertical_pack_prompts.market_code TEXT NULL`. Phase 1 AU prompts were seeded before Phase 2 and default to `NULL`. The Phase 2 prompt orchestrator likely queries: `WHERE market_code = $1 OR market_code IS NULL` — treating `NULL` as "applies to all markets" (universal prompts).

For a NZ audit: the query returns NZ-specific prompts (`market_code='nz'`) plus all Phase 1 AU prompts (`market_code=NULL`). AU Phase 1 prompts contain `{location}` (AU-specific variable that expands empty for NZ brands), ABN verification references, and AU-specific context ("...as an Australian business"). NZ audits run AU prompts and ask LLMs about the brand's ABN and AU directory presence.

**Fix:** Phase 2 Sprint 13 migration explicitly sets `market_code='au'` for every existing Phase 1 prompt — not `NULL`. Prompt orchestrator uses `WHERE market_code = $1` only — no `IS NULL` fallback. Phase 3 checklist Step 13 states: "All new market prompts must have explicit `market_code` value. `NULL` is not permitted."

---

## P3-56 🔴 CRITICAL — Companies House API returns up to 20 name matches requiring fuzzy matching — the generic `api` adapter with `rating_selector` is the wrong abstraction for a company registry check

Phase 3 seeds the UK Companies House check as `check_type='api'`. The Companies House Search API (`/search/companies?q={brand}`) returns up to 20 matching company records. To determine whether the specific brand is registered, the SignalsEngine must: (1) compare each returned company name against `brands.name` for similarity, and (2) check that the matched company has `company_status='active'`. This is a **fuzzy name matching** problem.

The generic `api` adapter uses `rating_selector` (a JSON path) to extract a single numeric value — but Companies House provides registration status and company type, not a rating. There is no `rating` to extract. `presence_selector` also cannot distinguish the correct company among 20 partial matches. The generic adapter is architecturally incorrect for a company registry check.

**Fix:** Companies House requires a dedicated `check_type='registry'` adapter with name similarity logic (Levenshtein distance or Jaro-Winkler, with a threshold like > 0.85). Phase 3 Section 1.1 documents `'registry'` as a fifth `check_type`, alongside `'api'`, `'scrape'`, `'gbp_category'`, and `'manual'`. Sprint 20 implements the `RegistryAdapter`. Sprint 21's `adapterRegistry` includes it.

---

## Final Phase 3 conflict table — all 8 rounds (54 critical conflicts)

| Range | Count | Key themes |
|---|---|---|
| P3-1 to P3-9 (R1) | 9 | market_code format, shadow mode, location columns, ToS, multi-org, UK GDPR, Stripe naming, config:validate, CA tax |
| P3-10 to P3-18 (R2) | 8 | applies_to_verticals enum, GBP lat/lng, rate limiting, pricing, CASL, canada_post, sprint order, legal entities |
| P3-19 to P3-25 (R3) | 6 | CA sprint+signals missing, Trustpilot key, billing_enabled, email snippets, NullAdapter, Inngest branching |
| P3-26 to P3-33 (R4) | 8 | number_format, NEXT_PUBLIC_ key, display_name rename, {brand} encoding, CLAUDE.md stale, requires_nexus_config, ABN placeholders, demo:seed |
| P3-34 to P3-40 (R5) | 7 | AU {suburb}, provider capabilities, effective_date, multi-city, stripe:seed prices, {state_abbr}, GDPR Article 17 |
| P3-41 to P3-45 (R6) | 5 | presence/rating selectors NULL, RLS, trust_signal_weight formula, budget limits, is_required |
| P3-46 to P3-51 (R7) | 6 | sampling/quality gate values, Markdown rendering, prompt vars, GBP subdivision, Clerk signup, CSS monitoring |
| P3-52 to P3-56 (R8) | 5 | SignalResult type, scraper UA, legal page fallback, NULL prompts contamination, Companies House adapter |
| **Total** | **54** | |

*VisibleAU Phase 3 LLD Audit Report — Round 8 added May 2026*

---

## Round 9 audit — 4 more critical conflicts + 1 clarification (P3-57 through P3-61)

---

## P3-57 🔴 CRITICAL — JQ4 inactive-user flow only handles `'au'` and `'us'` — NZ/UK/CA branches are unspecified; UK GDPR and CA CASL make the default branches legally wrong

Phase 2 JQ4 bifurcates inactive-user handling into two explicit branches:
- **AU:** Send deletion-warning email → delete organisation after 30 days
- **US:** Send inactive-account email → retain data (CAN-SPAM / CCPA opt-out only)

Phase 3 adds NZ, UK, and CA. The JQ4 handler has no third, fourth, or fifth branch. NZ/UK/CA users hit an unhandled case and fall through to whichever is the default — likely AU.

**UK (GDPR):** Sending a deletion warning that then deletes the account does not fulfil GDPR Article 17 erasure obligations. GDPR requires explicit erasure documentation, completion within 30 days of request, and confirmation sent to the user. An auto-deletion triggered by inactivity is a different legal basis from a user-requested erasure. The UK JQ4 flow needs a separate legal path.

**CA (CASL):** Under CASL, sending any commercial electronic message to an inactive CA user who has not recently re-confirmed express consent is a violation, regardless of content. The US inactive-email branch sends a commercial email — that single email to a CA user who has lapsed consent is a CASL violation. Maximum penalty: $10M CAD per violation.

**NZ (Privacy Act 2020):** Similar to AU in outcome (deletion appropriate), but the NZ Privacy Commissioner has specific breach notification requirements for systematic data deletions that differ from the AU Privacy Act.

**Fix:** Sprint 22/23 extends JQ4 to five explicit branches: `'nz'` = AU pattern (deletion warning + delete); `'uk'` = GDPR erasure flow with ICO-compliant completion confirmation; `'ca'` = CASL consent-withdrawal notification + 30-day deletion; `'au'` and `'us'` unchanged.

---

## P3-58 🔴 CRITICAL — `recommendation_research` table has no NZ/UK/CA rows — the Phase 3 checklist has no seeding step — the action centre is completely empty for every new market brand

Phase 2 Sprint 14 seeds `recommendation_research` with `market_code='us'` rows — the action items that appear in a US brand's recommendations after each audit (e.g., "Complete your Google Business Profile", "Get listed on Angi"). The recommendation engine queries `WHERE market_code = $1`. For a NZ brand: `WHERE market_code='nz'` returns 0 rows → 0 recommendations generated → the action centre is blank.

The action centre — the section showing what a business should do next to improve their AI visibility — is the core value proposition of the product. A NZ, UK, or CA customer completes their first audit, sees their score, clicks "View Recommendations", and sees nothing. The Phase 3 checklist (17 steps) has no step for seeding `recommendation_research`.

**Fix:** Add checklist Step 13b: `□ 13b. Seed recommendation_research rows for [NEW_MARKET] — minimum 10 rows per vertical with evidence_refs`. Phase 3 Section 3 per-market tables must specify required recommendation types: NZ (NoCowboys listing, Neighbourly presence, GMB NZ optimisation); UK (Checkatrade profile completion, Companies House registration, GBP UK, Trustpilot setup); CA (HomeStars listing, BBB Canada, Yelp CA profile).

---

## P3-59 🔴 CRITICAL — `brand-entity-audit` UI only handles AU and US card sets — NZ/UK/CA brands see wrong market cards — the long-term fix is data-driven cards from `SignalResult[]`

Phase 2 FIX III3 (Round 15) made the `/brands/[id]/brand-entity-audit` page show:
- **AU brands:** ABN Lookup card, Wikipedia AU card, AU TLD card, AU directory aggregate card
- **US brands:** GBP card, Yelp card, BBB card, Angi card

Phase 3 adds three new markets with entirely different directory sets:
- **NZ:** GBP NZ, NoCowboys, Neighbourly, Yellow NZ
- **UK:** GBP UK, Checkatrade, Companies House, Trustpilot UK
- **CA:** GBP CA, Yelp CA, HomeStars, BBB Canada

The Phase 3 LLD never specifies an update to `brand-entity-audit` for new market codes. NZ/UK/CA brands fall into the AU or US branch and see irrelevant cards (a NZ plumber sees "BBB: Not accredited" or "ABN: Not verified").

Phase 3 has the solution in its own data model: `market_directory_signals.display_name` + `SignalResult[]` from the Sprint 20 migration. The brand-entity-audit page should render cards dynamically from this data, eliminating all hardcoded market branches forever.

**Fix:** Sprint 22 — `brand-entity-audit` page refactored to render signal check cards dynamically from `market_directory_signals.display_name` and `SignalResult[].present` per brand's market. No hardcoded card list. Cards are driven entirely by the registry table. Zero code change required when future markets are added.

---

## P3-60 🔴 CRITICAL — Brand wizard shows `us_price_range` and `us_primary_cities` fields to NZ/UK/CA brands — Phase 2 wizard only branches on `'au'` vs `'us'`

Phase 2 Sprint 18 brand wizard has two conditional branches:
- `market_code='au'`: show ABN field, `primaryRegions[]` array input; hide US-specific fields
- `market_code='us'`: hide ABN; show `us_price_range`, `us_primary_cities[]`, `us_state`, `us_zip`

Phase 3 adds NZ, UK, CA. The wizard has no third branch. NZ brands falling into the AU branch see an ABN field (wrong — NZ businesses don't have ABNs). NZ brands falling into the US branch see a `us_price_range` field and city/state/ZIP inputs labelled for the US (wrong — NZ uses city/region/postcode). Additionally, the Phase 3 `LocationPicker` component (built in Sprint 21) is designed for NZ/UK/CA location collection but no wizard integration point is specified.

**Fix:** Sprint 22 — brand wizard updated for all five market codes. NZ/UK/CA: hide ABN field, hide `us_price_range`, hide `us_primary_cities[]` array input. Show `LocationPicker` component (from Sprint 21) for generic location collection (`location_primary`, `location_subdivision`, `location_postal`). Show a generic price-range field labelled with `market_locales.currency_symbol` (e.g., "Typical job price (NZD)").

---

## P3-61 (clarification) — NZ scheduled audits run at 02:00 UTC = 2pm NZST — audits complete during NZ business hours rather than overnight

02:00 UTC is approximately 14:00–15:00 New Zealand Standard/Daylight Time. Scheduled audits land in NZ users' dashboards mid-afternoon rather than overnight as intended. Not a blocking technical conflict but a UX consideration worth noting in Phase 3 Section 3 under the NZ market. Future enhancement: `audit_schedules.preferred_local_hour` to allow market-appropriate scheduling offsets.

---

## Final Phase 3 conflict table — all 9 rounds (58 critical conflicts)

| Range | Count | Key themes |
|---|---|---|
| P3-1 to P3-9 (R1) | 9 | market_code format, shadow mode, location columns, ToS, multi-org, GDPR, Stripe naming, config:validate, CA tax |
| P3-10 to P3-18 (R2) | 8 | applies_to_verticals, GBP lat/lng, rate limiting, pricing, CASL, canada_post, sprint order, legal entities |
| P3-19 to P3-25 (R3) | 6 | CA sprint+signals, Trustpilot key, billing_enabled, email snippets, NullAdapter, Inngest branching |
| P3-26 to P3-33 (R4) | 8 | number_format, NEXT_PUBLIC_ key, display_name rename, {brand} encoding, CLAUDE.md stale, nexus_config, ABN placeholders, demo:seed |
| P3-34 to P3-40 (R5) | 7 | AU {suburb}, provider capabilities, effective_date, multi-city, stripe:seed prices, {state_abbr}, GDPR Article 17 |
| P3-41 to P3-45 (R6) | 5 | presence/rating selectors NULL, RLS, trust_signal_weight formula, budget limits, is_required |
| P3-46 to P3-51 (R7) | 6 | sampling/quality values, Markdown rendering, prompt vars, GBP subdivision, Clerk signup, CSS monitoring |
| P3-52 to P3-56 (R8) | 5 | SignalResult type, scraper UA, legal page fallback, NULL prompts, Companies House adapter |
| P3-57 to P3-60 (R9) | 4 | JQ4 branching, recommendation_research missing, brand-entity-audit UI, wizard fields |
| **Total** | **58** | |

*VisibleAU Phase 3 LLD Audit Report — Round 9 added May 2026*

---

## Round 10 audit — 5 more critical conflicts (P3-62 through P3-66)

---

## P3-62 🔴 CRITICAL — Phase 3 checklist missing Step 3b for `vertical_packs` — FK constraint fails on Step 13; brand wizard shows no packs for new market brands

The Phase 3 new-market checklist has 17 steps. Step 3 inserts `market_vertical_configs` (the vertical display names and enabled flags). Step 13 inserts `vertical_pack_prompts` (the actual prompt text). Neither step mentions `vertical_packs` — the **parent table** that `vertical_pack_prompts.pack_id` references via foreign key.

Without `vertical_packs` rows for `'nz'`, Step 13's `INSERT INTO vertical_pack_prompts ... (pack_id=...) ` violates the foreign key constraint. Step 13 fails entirely — no NZ prompts are loaded.

Even if the FK is handled (e.g. with nullable pack_id): Phase 2 FIX YY4 (Round 13) made the brand wizard vertical pack browser query `SELECT * FROM vertical_packs WHERE vertical_key=$1 AND market_code='nz'`. With zero rows: the wizard shows no packs → a NZ brand completes the wizard with no vertical pack selected → every NZ audit runs 0 LLM calls and produces no score.

**Fix:** Add checklist Step 3b between Steps 3 and 4: `INSERT INTO vertical_packs (market_code, vertical_key, display_name_override, is_enabled=true)` — one row per vertical. Example for NZ: `('nz', 'tradies', 'NZ Trades', true)`, `('nz', 'professional_services', 'NZ Professionals', true)`, `('nz', 'saas', 'NZ SaaS/Tech', true)`. Step 13 references the Step 3b `pack_id` values when inserting prompts.

---

## P3-63 🔴 CRITICAL — `drift_webhooks.marketDisplayName` is undefined for NZ/UK/CA — webhook payloads have an empty market name column, breaking agency Google Sheets integrations

Phase 2 FIX PP3 (Round 11) adds `marketCode` and `marketDisplayName` to all six drift webhook delivery channel payloads. The drift webhook formatter resolves `marketDisplayName` from a source that only knows two markets: `{ 'au': 'Australia', 'us': 'United States' }` (likely hardcoded or read from a two-row map).

For NZ/UK/CA drift alerts: `marketDisplayName` resolves to `undefined`. Agency customers who connected Google Sheets for drift monitoring during Phase 2 now receive drift notifications with a blank market name column for all new market brands. Column positions are preserved (FIX PP3), but the market identification field — the one that tells an agency which market triggered the drift — shows nothing.

**Fix:** Add a `display_name TEXT NOT NULL` column to `market_locales`. Seed values: `'Australia'`, `'United States'`, `'New Zealand'`, `'United Kingdom'`, `'Canada'`. Drift webhook formatter reads `market_locales.display_name WHERE market_code = event.data.marketCode`. Phase 3 checklist Step 2 updated to include `display_name` in the `market_locales` INSERT.

---

## P3-64 🔴 CRITICAL — All five Phase 2 market-aware marketing pages only handle `'au'` and `'us'` — NZ/UK/CA visitors see wrong copy, wrong pricing, and wrong methodology

Phase 2 made five public marketing pages market-aware with two branches each:

| Page | Phase 2 fix | What NZ/UK/CA visitors see |
|---|---|---|
| `og:title` + meta | FIX TT2 R8 | "AI search visibility for US businesses" |
| `/pricing` amounts | FIX KK R3 | AUD or USD prices |
| `/pricing` features | FIX AAA2 R13 | Hipages/Oneflare (AU) or Yelp/BBB (US) |
| Sample audit results | FIX ZZ4 R13 | "Australian business searches" copy |
| `/methodology` | FIX II3 R10 | AU or US signals explained |

Phase 3 LLD has no sprint or checklist step to update any of these five pages. When Phase 3 enables NZ in Sprint 22, a NZ visitor runs a sample audit and sees "Your AI visibility score for Australian business searches." A UK business sees AUD pricing on the pricing page.

**Fix:** Sprint 22/23 updates all five pages from two-branch `if/else` to five-branch `switch/case` by `market_code`. Add checklist Step 16b (post `is_enabled=true`): *"Verify all five marketing pages show correct copy, pricing, and methodology for [NEW_MARKET]. Run through sample audit flow as a [NEW_MARKET] visitor."*

---

## P3-65 🔴 CRITICAL — `stripe:seed` (Phase 3) never specified to inherit idempotency from `stripe:setup` (Phase 2 FIX FFF2) — running it creates duplicate AU Stripe products

Phase 2 FIX FFF2 (Round 14) made `stripe:setup` idempotent: it calls `stripe.products.list()` before creating any product and skips products that already exist. Sprint 17 DoD: running `stripe:setup` twice produces exactly 22 products, not 32.

Phase 3 Sprint 21 **replaces** `stripe:setup` with a new `stripe:seed --market [code]` script. Phase 3 never states that `stripe:seed` must inherit the FFF2 idempotency logic. If `stripe:seed` is written from scratch (which it likely is, as a new CLI tool), it omits the existence check. Running `stripe:seed --market au` after Phase 2's `stripe:setup` has already created 10 AU products creates a duplicate set of 10 AU products with new `price_id` values. The `PRICE_MAP` still points to the original IDs — the 10 new ones are orphaned and pollute the Stripe dashboard.

**Fix:** Phase 3 Sprint 21 scope explicitly states: `stripe:seed` inherits FIX FFF2 idempotency — it calls `stripe.products.list()` per market before creating any product and skips existing ones. Sprint 21 DoD: run `stripe:seed --market au` twice → still exactly 22 total products in Stripe.

---

## P3-66 🔴 CRITICAL — `market_vertical_configs.is_enabled` default value not specified in checklist Step 3 — if `false`, all NZ/UK/CA verticals are hidden and brands cannot create audits

Phase 2 `market_vertical_configs` has an `is_enabled BOOLEAN` column controlling whether a vertical appears in the brand wizard. Phase 3 checklist Step 3: `INSERT INTO market_vertical_configs (market_code, vertical_key × 3)` — no `is_enabled` value specified. If the database default is `false` (or if the developer omits the field and gets the default), all three verticals for every new market are disabled.

A NZ business visiting the brand wizard: no verticals appear in the dropdown → they cannot complete onboarding → cannot create a brand → cannot run any audits. The entire NZ market is non-functional at go-live.

**Fix:** Checklist Step 3 explicitly specifies `is_enabled=true` for all three vertical rows. Full INSERT example: `VALUES ('nz', 'tradies', true, 'NZ Trades'), ('nz', 'professional_services', true, 'NZ Professionals'), ('nz', 'saas', true, 'NZ SaaS/Tech')`.

---

## Final Phase 3 conflict table — all 10 rounds (63 critical conflicts)

| Range | Count | Key themes |
|---|---|---|
| P3-1 to P3-9 (R1) | 9 | market_code format, shadow mode, location columns, ToS, multi-org, GDPR, Stripe naming, config:validate, CA tax |
| P3-10 to P3-18 (R2) | 8 | applies_to_verticals, GBP lat/lng, rate limiting, pricing, CASL, canada_post, sprint order, legal entities |
| P3-19 to P3-25 (R3) | 6 | CA sprint+signals, Trustpilot key, billing_enabled, email snippets, NullAdapter, Inngest branching |
| P3-26 to P3-33 (R4) | 8 | number_format, NEXT_PUBLIC_ key, display_name rename, {brand} encoding, CLAUDE.md stale, nexus_config, ABN placeholders, demo:seed |
| P3-34 to P3-40 (R5) | 7 | AU {suburb}, provider capabilities, effective_date, multi-city, stripe:seed prices, {state_abbr}, GDPR Article 17 |
| P3-41 to P3-45 (R6) | 5 | presence/rating selectors NULL, RLS, trust_signal_weight formula, budget limits, is_required |
| P3-46 to P3-51 (R7) | 6 | sampling/quality values, Markdown rendering, prompt vars, GBP subdivision, Clerk signup, CSS monitoring |
| P3-52 to P3-56 (R8) | 5 | SignalResult type, scraper UA, legal page fallback, NULL prompts, Companies House adapter |
| P3-57 to P3-60 (R9) | 4 | JQ4 branching, recommendation_research missing, brand-entity-audit UI, wizard fields |
| P3-62 to P3-66 (R10) | 5 | vertical_packs missing, marketDisplayName undefined, marketing pages, stripe:seed idempotency, is_enabled default |
| **Total** | **63** | |

*VisibleAU Phase 3 LLD Audit Report — Round 10 added May 2026*
