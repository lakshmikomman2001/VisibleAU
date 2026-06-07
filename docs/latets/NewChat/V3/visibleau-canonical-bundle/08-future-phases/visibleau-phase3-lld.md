# VisibleAU — Phase 3 LLD  
## True Zero-Code Market Addition: NZ · UK · CA and beyond

**Version:** v1.0 · May 2026  
**Builds on:** Phase 1 (Sprints 1–12, AU launch) + Phase 2 (Sprints 13–19, US expansion)  
**Goal:** Adding a new English-speaking market requires zero code changes — only data and config.

---

## Why Phase 3 exists

Phase 2 answered the question "can VisibleAU work in the US?" with yes. But it left a structural problem: every new market still needs a code module for local signals (a `UKSignalsService` alongside `USSignalsService`), a code change for the location picker UI, a code change for legal snippets, and a new Stripe product creation.

That's roughly one week of code per market. Fine for two markets. A real bottleneck at five.

Phase 3 replaces all of that code with four registries — database tables that drive behaviour without a single line of new application code. After Phase 3, adding NZ, CA, or any future English-speaking market is:

1. Insert rows into the four registries
2. Write prompt packs (human/AI effort, no deployment)
3. Flip `is_enabled = true` in the `markets` table
4. Done

---

## The honest accounting — what Phase 2 left as code

| What | Phase 2 status | Phase 3 solution |
|---|---|---|
| **Directory signal checks** | `USSignalsService.ts` (code module) | `market_directory_signals` table — check config is data |
| **Location picker UI** | US: city + state + ZIP hardcoded in wizard | `market_location_formats` table — label and format is data |
| **Legal page sections** | Per-market code branches in privacy/terms | `market_legal_snippets` table — snippets inserted from DB |
| **Currency + tax config** | USD Stripe products created manually | `market_tax_profiles` table — tax behavior and rate is data |

After Phase 3, all four are DB-driven. The application code stays the same for every new market.

---

## Section 1: The Four Registries

### 1.1 `market_directory_signals` — replaces per-market signal service code

**The problem today:** `USSignalsService` has Yelp, Angi, BBB, HomeAdvisor hard-coded. Adding UK means writing `UKSignalsService` with Checkatrade, Rated People, etc. Two code modules. Three markets, three modules.

**The fix:** One generic `SignalsEngine` that reads check configuration from the database.

```sql
CREATE TABLE market_directory_signals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_code           TEXT NOT NULL,
  directory_key         TEXT NOT NULL,         -- 'yelp', 'checkatrade', 'nocowboys'
  display_name          TEXT NOT NULL,         -- shown in audit results UI
  check_type            TEXT NOT NULL,         -- 'api' | 'scrape' | 'gbp_category' | 'manual'
  check_url_template    TEXT NOT NULL,
  -- e.g. 'https://www.yelp.com/search?find_desc={brand}&find_loc={city}+{state}'
  -- e.g. 'https://www.checkatrade.com/search?q={brand}&location={city}+{postcode}'
  presence_selector     TEXT NULL,             -- CSS selector or JSON path for presence check
  rating_selector       TEXT NULL,             -- where to extract the rating
  review_count_selector TEXT NULL,
  trust_signal_weight   NUMERIC(4, 2) DEFAULT 1.0,
  applies_to_verticals  TEXT[] NULL,           -- null = all verticals; ['home_services'] = specific
  requires_api_key      BOOLEAN DEFAULT false,
  api_key_env_var       TEXT NULL,             -- e.g. 'YELP_API_KEY' — looked up from env at runtime
  rate_limit_per_hour   INTEGER DEFAULT 60,
  is_enabled            BOOLEAN DEFAULT true,
  created_at            TIMESTAMPTZ DEFAULT now(),
  UNIQUE(market_code, directory_key)
);
```

**How the generic SignalsEngine works:**

```typescript
// lib/signals/engine.ts — ONE implementation for ALL markets
export class SignalsEngine {
  async runChecks(brand: Brand, market: MarketContext): Promise<SignalResult[]> {
    const checks = await db
      .select().from(marketDirectorySignals)
      .where(
        and(
          eq(marketDirectorySignals.marketCode, market.code),
          eq(marketDirectorySignals.isEnabled, true),
          // verticals filter: null = all, or matches brand vertical
          or(
            isNull(marketDirectorySignals.appliesToVerticals),
            sql`${marketDirectorySignals.appliesToVerticals} @> ARRAY[${brand.vertical}]`
          )
        )
      );

    return Promise.all(checks.map(check =>
      this.runSingleCheck(brand, market, check)
    ));
  }

  private async runSingleCheck(brand, market, check): Promise<SignalResult> {
    const url = this.expandTemplate(check.checkUrlTemplate, brand, market);
    // check_type drives the adapter used: api | scrape | gbp_category
    const adapter = this.adapterRegistry.get(check.checkType);
    return adapter.check(url, check);
  }
}
```

**Seed data — all three markets, zero new code when NZ or UK is added:**

```sql
-- US signals (migrated from USSignalsService.ts)
INSERT INTO market_directory_signals (market_code, directory_key, display_name, check_type, check_url_template, trust_signal_weight, requires_api_key, api_key_env_var) VALUES
('US_EN', 'google_business_profile', 'Google Business Profile', 'api',    'https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input={brand}&inputtype=textquery&locationbias=point:{lat},{lng}', 2.0, true, 'GOOGLE_PLACES_API_KEY'),
('US_EN', 'yelp',                    'Yelp for Business',       'api',    'https://api.yelp.com/v3/businesses/search?term={brand}&location={city}+{state}', 1.5, true, 'YELP_API_KEY'),
('US_EN', 'bbb',                     'Better Business Bureau',  'scrape', 'https://www.bbb.org/search?find_text={brand}&find_loc={city}+{state_abbr}', 1.2, false, null),
('US_EN', 'angi',                    'Angi',                    'scrape', 'https://www.angi.com/companylist/{state_abbr}/{city}/{brand}.htm', 1.0, false, null),
('US_EN', 'homeadvisor',             'HomeAdvisor',             'scrape', 'https://www.homeadvisor.com/c.{brand}.{city}-{state_abbr}.html', 0.8, false, null);

-- AU signals (migrated from Phase 1 Sprint 8 AUSignalsService)
INSERT INTO market_directory_signals (market_code, directory_key, display_name, check_type, check_url_template, trust_signal_weight) VALUES
('AU_EN', 'google_business_profile', 'Google Business Profile', 'api',    'https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input={brand}&inputtype=textquery&locationbias=point:{lat},{lng}', 2.0),
('AU_EN', 'hipages',                 'Hipages',                 'scrape', 'https://hipages.com.au/find/{brand}/{suburb}', 1.5),
('AU_EN', 'yellow_pages_au',         'Yellow Pages AU',         'scrape', 'https://www.yellowpages.com.au/search/listings?clue={brand}&locationClue={suburb}+{state}', 1.2),
('AU_EN', 'serviceseeking',          'ServiceSeeking',          'scrape', 'https://www.serviceseeking.com.au/blog/search/?q={brand}&location={suburb}', 1.0),
('AU_EN', 'oneflare',                'Oneflare',                'scrape', 'https://www.oneflare.com.au/search?query={brand}&location={suburb}', 0.8);

-- NZ signals (NEW MARKET — zero code needed)
INSERT INTO market_directory_signals (market_code, directory_key, display_name, check_type, check_url_template, trust_signal_weight) VALUES
('NZ_EN', 'google_business_profile', 'Google Business Profile', 'api',    'https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input={brand}&inputtype=textquery&locationbias=point:{lat},{lng}', 2.0),
('NZ_EN', 'nocowboys',               'NoCowboys',               'scrape', 'https://www.nocowboys.co.nz/jobs/?searchtrade=all&searchsuburb={city}&searchterm={brand}', 1.5),
('NZ_EN', 'neighbourly',             'Neighbourly',             'scrape', 'https://www.neighbourly.co.nz/business?q={brand}&location={city}', 1.2),
('NZ_EN', 'yellow_nz',               'Yellow NZ',               'scrape', 'https://www.yellow.co.nz/search?q={brand}&l={city}', 1.0),
('NZ_EN', 'builderscrack',           'Builderscrack',           'scrape', 'https://www.builderscrack.co.nz/find-a-tradie?search={brand}&suburb={city}', 0.8);

-- UK signals (NEW MARKET — zero code needed)
INSERT INTO market_directory_signals (market_code, directory_key, display_name, check_type, check_url_template, trust_signal_weight, applies_to_verticals) VALUES
('UK_EN', 'google_business_profile', 'Google Business Profile', 'api',    'https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input={brand}&inputtype=textquery&locationbias=point:{lat},{lng}', 2.0, null),
('UK_EN', 'checkatrade',             'Checkatrade',             'scrape', 'https://www.checkatrade.com/search/?q={brand}&location={city}+{postcode}', 1.8, ARRAY['home_services']),
('UK_EN', 'rated_people',            'Rated People',            'scrape', 'https://www.ratedpeople.com/find/{brand}/{city}', 1.5, ARRAY['home_services']),
('UK_EN', 'trustpilot_uk',           'Trustpilot UK',           'api',    'https://api.trustpilot.com/v1/business-units/find?name={brand}&country=GB', 1.3, null),
('UK_EN', 'yell',                    'Yell.com',                'scrape', 'https://www.yell.com/s/{brand}/{city}/', 1.0, null),
('UK_EN', 'which_trusted_traders',   'Which? Trusted Traders',  'scrape', 'https://trustedtraders.which.co.uk/businesses/search/?s={brand}&location={city}', 1.2, ARRAY['home_services']),
('UK_EN', 'companies_house',         'Companies House',         'api',    'https://api.company-information.service.gov.uk/search/companies?q={brand}', 1.0, ARRAY['professional_services', 'saas']);
```

---

### 1.2 `market_location_formats` — replaces per-market location picker code

**The problem today:** The US brand wizard renders city + state + ZIP. AU renders suburb + postcode. Each market needs a code branch in the wizard. UK needs county + postcode. NZ needs city + region + postcode.

**The fix:** One adaptive `LocationPicker` component that reads format config from the DB.

```sql
CREATE TABLE market_location_formats (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_code              TEXT NOT NULL UNIQUE,
  -- Labels shown in the UI
  primary_label            TEXT NOT NULL,   -- 'City', 'Town', 'Suburb'
  subdivision_label        TEXT NOT NULL,   -- 'State', 'County', 'Region', 'Province'
  subdivision_abbr_label   TEXT NULL,       -- 'State Abbr (e.g. TX)', null if not used
  postal_code_label        TEXT NOT NULL,   -- 'ZIP Code', 'Postcode', 'Postal Code'
  postal_code_placeholder  TEXT NOT NULL,   -- '90210', 'SW1A 1AA', '6011'
  postal_code_regex        TEXT NULL,       -- client-side validation pattern
  -- Prompt template variable mapping
  -- Which DB brand fields map to which prompt template vars
  prompt_var_primary       TEXT NOT NULL DEFAULT '{city}',       -- maps to brands.location_primary
  prompt_var_subdivision   TEXT NOT NULL DEFAULT '{state}',      -- maps to brands.location_subdivision
  prompt_var_subdivision_abbr TEXT NULL,                         -- maps to brands.location_subdivision_abbr
  prompt_var_postal        TEXT NOT NULL DEFAULT '{zip}',        -- maps to brands.location_postal
  -- Autocomplete
  autocomplete_provider    TEXT NULL,    -- 'google_places', 'uk_postcodes_io', 'nz_post', 'canada_post'
  autocomplete_country_code TEXT NULL,  -- 'US', 'GB', 'NZ', 'CA' — passed to autocomplete API
  -- Display
  example_location         TEXT NOT NULL, -- 'Denver, CO 80202' — shown in placeholder
  created_at               TIMESTAMPTZ DEFAULT now()
);
```

**Seed data — all four markets:**

```sql
INSERT INTO market_location_formats VALUES
  ('AU_EN', 'Suburb', 'State', 'State Abbr', 'Postcode', '2000',  '^\d{4}$', '{location}', '{state}', null,        '{postcode}', 'google_places', 'AU', 'Bondi, NSW 2026'),
  ('US_EN', 'City',   'State', 'State Abbr', 'ZIP Code', '90210', '^\d{5}$', '{city}',     '{state}',  '{state_abbr}', '{zip}',  'google_places', 'US', 'Austin, TX 78701'),
  ('NZ_EN', 'City',   'Region', null,        'Postcode', '1010',  '^\d{4}$', '{city}',     '{region}', null,        '{postcode}', 'google_places', 'NZ', 'Auckland, Auckland 1010'),
  ('UK_EN', 'City',   'County', null,        'Postcode', 'SW1A 1AA', '^[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}$', '{city}', '{county}', null, '{postcode}', 'uk_postcodes_io', 'GB', 'London, Greater London SW1A 1AA'),
  ('CA_EN', 'City',   'Province', 'Province Abbr', 'Postal Code', 'A1A 1A1', '^[A-Z]\d[A-Z]\s?\d[A-Z]\d$', '{city}', '{province}', '{province_abbr}', '{postal_code}', 'canada_post', 'CA', 'Toronto, ON M5V 3C6');
```

**The adaptive LocationPicker component (one implementation, all markets):**

```typescript
// components/brand/LocationPicker.tsx
export function LocationPicker({ marketCode }: { marketCode: string }) {
  const { data: fmt } = useQuery(['location-format', marketCode],
    () => api.getLocationFormat(marketCode));

  if (!fmt) return <Skeleton />;

  return (
    <div className="space-y-4">
      <FormField name="locationPrimary"   label={fmt.primaryLabel}     placeholder={fmt.exampleLocation.split(',')[0]} />
      <FormField name="locationSubdivision" label={fmt.subdivisionLabel} autocomplete={fmt.autocompleteProvider} />
      {fmt.subdivisionAbbrLabel && (
        <FormField name="locationSubdivisionAbbr" label={fmt.subdivisionAbbrLabel} />
      )}
      <FormField name="locationPostal" label={fmt.postalCodeLabel}
        placeholder={fmt.postalCodePlaceholder}
        validate={(v) => fmt.postalCodeRegex ? new RegExp(fmt.postalCodeRegex).test(v) : true} />
    </div>
  );
}
```

---

### 1.3 `market_legal_snippets` — replaces per-market legal page code

**The problem today:** Privacy policy has AU-specific APP 8 language. US added CCPA. UK needs UK GDPR + ICO. NZ needs NZ Privacy Act 2020. Each market currently means a code branch in the legal pages.

**The fix:** Legal pages load their required sections from the DB. The template renders whatever snippets exist for the active market.

```sql
CREATE TABLE market_legal_snippets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_code   TEXT NOT NULL,
  snippet_key   TEXT NOT NULL,     -- unique identifier within a page
  page_target   TEXT NOT NULL,     -- 'privacy' | 'terms' | 'footer' | 'cookie_policy'
  section_order INTEGER NOT NULL,  -- controls rendering order within the page
  heading       TEXT NULL,         -- section heading, null = no heading
  body_text     TEXT NOT NULL,     -- markdown-formatted content
  is_required   BOOLEAN DEFAULT true,
  effective_date DATE NULL,        -- show/hide based on date
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(market_code, page_target, snippet_key)
);
```

**Seed examples:**

```sql
-- UK GDPR section for privacy page
INSERT INTO market_legal_snippets (market_code, snippet_key, page_target, section_order, heading, body_text) VALUES
('UK_EN', 'uk_gdpr_controller',   'privacy', 10,
  'Data Controller (UK)',
  'VisibleAU Limited is the data controller for personal data processed for UK customers. We are registered with the Information Commissioner''s Office (ICO). You have rights under UK GDPR including access, rectification, erasure, restriction, and portability of your personal data.'),

('UK_EN', 'uk_ico_complaints',    'privacy', 11,
  'Complaints to the ICO',
  'If you are unhappy with how we have handled your personal data, you have the right to lodge a complaint with the Information Commissioner''s Office (ico.org.uk) or call 0303 123 1113.'),

('UK_EN', 'uk_vat_terms',         'terms', 20,
  'VAT and Pricing',
  'All prices shown exclude VAT. VAT at the current rate of 20% will be added at checkout for UK customers. VisibleAU Limited is VAT registered in the United Kingdom.'),

-- NZ Privacy Act section
('NZ_EN', 'nz_privacy_act',       'privacy', 10,
  'Privacy Act 2020 (New Zealand)',
  'VisibleAU collects and holds personal information in accordance with the Privacy Act 2020 (New Zealand). You have the right to access and correct personal information we hold about you. Contact our Privacy Officer at privacy@visibleau.com.'),

('NZ_EN', 'nz_privacy_commissioner', 'privacy', 11,
  'Privacy Commissioner',
  'If you have concerns about how we handle your personal information, you may contact the Office of the Privacy Commissioner at privacy.org.nz or 0800 803 909.'),

-- CA CASL section
('CA_EN', 'ca_casl_consent',      'terms', 20,
  'CASL Compliance',
  'Commercial electronic messages sent to Canadian residents comply with Canada''s Anti-Spam Legislation (CASL). You may withdraw consent to receive commercial messages at any time using the unsubscribe link in any email.');
```

**The legal page component (one implementation, all markets):**

```typescript
// app/(marketing)/privacy/page.tsx
export default async function PrivacyPage() {
  const market   = await getMarketFromRequest();
  const snippets = await db.select().from(marketLegalSnippets)
    .where(and(
      eq(marketLegalSnippets.marketCode, market.code),
      eq(marketLegalSnippets.pageTarget, 'privacy'),
      eq(marketLegalSnippets.isRequired, true)
    ))
    .orderBy(asc(marketLegalSnippets.sectionOrder));

  return (
    <LegalPage title="Privacy Policy">
      <CorePrivacyContent />       {/* common to all markets */}
      {snippets.map(s => (
        <LegalSection key={s.snippetKey} heading={s.heading} body={s.bodyText} />
      ))}
    </LegalPage>
  );
}
```

---

### 1.4 `market_tax_profiles` — replaces per-market Stripe product creation

**The problem today:** AU uses `tax_behavior: 'inclusive'` (GST-inclusive). US uses `tax_behavior: 'exclusive'` (Stripe Tax adds state sales tax on top). UK uses VAT-inclusive. NZ uses GST-inclusive. Each market needs manual Stripe product setup and code changes to select the right behavior.

**The fix:** One `BillingService` that reads tax behavior and rate from the DB. Stripe product seeding is scripted and driven by this table.

```sql
CREATE TABLE market_tax_profiles (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_code             TEXT NOT NULL UNIQUE,
  currency_code           TEXT NOT NULL,      -- 'AUD', 'USD', 'GBP', 'NZD', 'CAD'
  stripe_tax_behavior     TEXT NOT NULL,      -- 'inclusive' | 'exclusive'
  -- 'inclusive': tax is baked into the price shown (AU GST, UK VAT, NZ GST)
  -- 'exclusive': tax is added on top (US sales tax, CA GST/HST)
  tax_name                TEXT NOT NULL,      -- 'GST', 'VAT', 'Sales Tax'
  standard_rate_percent   NUMERIC(5, 2) NULL, -- 10 for AU, 20 for UK, 15 for NZ; null for US/CA (varies)
  stripe_tax_enabled      BOOLEAN DEFAULT true,
  tax_registration_ref    TEXT NULL,          -- 'ABN: 12 345 678 901', 'VAT: GB123456789'
  invoice_footer_text     TEXT NULL,          -- shown on Stripe invoices
  requires_nexus_config   BOOLEAN DEFAULT false, -- true for US and CA (state/province nexus)
  created_at              TIMESTAMPTZ DEFAULT now()
);
```

**Seed data:**

```sql
INSERT INTO market_tax_profiles (market_code, currency_code, stripe_tax_behavior, tax_name, standard_rate_percent, invoice_footer_text, requires_nexus_config) VALUES
('AU_EN', 'AUD', 'inclusive', 'GST', 10.00, 'GST included. VisibleAU Pty Ltd ABN: [YOUR ABN]', false),
('US_EN', 'USD', 'exclusive', 'Sales Tax', null, 'Sales tax calculated at checkout based on your location.', true),
('NZ_EN', 'NZD', 'inclusive', 'GST', 15.00, 'GST included. VisibleAU NZ Ltd NZBN: [YOUR NZBN]', false),
('UK_EN', 'GBP', 'inclusive', 'VAT', 20.00, 'VAT included at 20%. VisibleAU Limited VAT No: [YOUR VAT]', false),
('CA_EN', 'CAD', 'exclusive', 'GST/HST', null, 'Applicable GST/HST added at checkout based on your province.', true);
```

---

## Section 2: The New Market Checklist — zero code, just data

After Phase 3, this is the complete checklist to launch a new English-speaking market. **No code changes required.**

```
NEW MARKET LAUNCH CHECKLIST
Market: ___________  Target date: ___________

□ 1. INSERT INTO markets (market_code, locale, currency_code, is_enabled=false)
□ 2. INSERT INTO market_locales (market_code, locale, date_format, number_format)
□ 3. INSERT INTO market_vertical_configs (market_code, vertical_key × 3)
□ 4. INSERT INTO market_location_formats (market_code, labels, regex, prompt vars)
□ 5. INSERT INTO market_directory_signals (market_code, directory rows)
□ 6. INSERT INTO market_legal_snippets (market_code, required legal sections)
□ 7. INSERT INTO market_tax_profiles (market_code, currency, tax behavior)
□ 8. INSERT INTO market_ai_budget_policies (market_code, per-segment limits)
□ 9. INSERT INTO sampling_policies (market_code, minimum prompt counts)
□ 10. INSERT INTO metric_quality_gates (market_code, per-metric gates)
□ 11. INSERT INTO provider_market_capabilities (market_code, engine rows)
□ 12. Run pnpm visibleau config:validate --market [NEW_MARKET_CODE]
□ 13. Write prompt packs → INSERT INTO vertical_pack_prompts (market_code=[NEW])
□ 14. Run pnpm visibleau config:coverage --market [NEW_MARKET_CODE]  (must be ≥ 80%)
□ 15. Seed Stripe products for new currency (run: pnpm stripe:seed --market [NEW])
□ 16. UPDATE markets SET is_enabled = true WHERE market_code = '[NEW_MARKET_CODE]'
□ 17. Deploy (no code changes — just migration with new rows)
```

---

## Section 3: Phase 3 markets — NZ, UK, CA

### NZ — lowest effort, first to go live

| | Detail |
|---|---|
| **Market code** | `NZ_EN` |
| **Locale** | `en-NZ` |
| **Currency** | NZD — GST-inclusive at 15% |
| **Tax** | NZ GST (15%) — same Stripe inclusive behavior as AU |
| **Location format** | City + Region + 4-digit postcode |
| **Directories** | NoCowboys, Neighbourly, Yellow NZ, Builderscrack, Localist |
| **Privacy law** | Privacy Act 2020 (NZ) — similar to AU APP obligations |
| **Verticals** | NZ Trades, NZ Health Professionals, NZ SaaS |
| **Prompt count target** | 80+ per vertical (NZ market is small — fewer city/region combinations needed) |
| **Effort** | ~3 days of data work, no code. The AU infrastructure is nearly identical. |
| **Why first** | AU and NZ are deeply linked — many AU businesses already have NZ customers. Easy upsell. |

### UK — medium effort, large opportunity

| | Detail |
|---|---|
| **Market code** | `UK_EN` |
| **Locale** | `en-GB` |
| **Currency** | GBP — VAT-inclusive at 20% |
| **Tax** | UK VAT (20%) — same Stripe inclusive behavior as AU/NZ |
| **Location format** | City + County + UK postcode (regex: `^[A-Z]{1,2}[0-9][0-9A-Z]?\s?[0-9][A-Z]{2}$`) |
| **Directories** | Checkatrade, Rated People, Trustpilot UK, Companies House, Which? Trusted Traders, Yell.com |
| **Privacy law** | UK GDPR + Data Protection Act 2018. ICO registration required. |
| **Verticals** | UK Tradespeople, UK Health Professionals, UK SaaS |
| **Prompt count target** | 100+ per vertical — major UK cities (London, Manchester, Birmingham, Leeds, Bristol...) |
| **Effort** | ~5 days: 2 days data config, 2 days prompt writing, 1 day ICO registration + VAT verification |
| **Why third (after US and NZ)** | GDPR/ICO compliance adds non-trivial research effort. But UK SaaS market is significant — $89B and growing fast with AI adoption. |

### CA — low effort, natural extension of US

| | Detail |
|---|---|
| **Market code** | `CA_EN` |
| **Locale** | `en-CA` |
| **Currency** | CAD — GST/HST exclusive (varies by province: 5%–15%) |
| **Tax** | Stripe Tax with Canadian nexus. CASL for email marketing. |
| **Location format** | City + Province + Canadian postal code (`A1A 1A1`) |
| **Directories** | Yellow Pages CA, Yelp CA, HomeStars, BBB Canada, Houzz CA |
| **Privacy law** | PIPEDA + provincial laws. CASL for commercial email. |
| **Verticals** | CA Home Services, CA Professional Services, CA SaaS |
| **Prompt count target** | 80+ per vertical — major CA cities (Toronto, Vancouver, Montreal, Calgary...) |
| **Effort** | ~3 days — many US directories (Yelp, BBB) also operate in Canada. Minimal new signal work. |
| **Why last** | CA is a natural follow-on from US. Many US prompt templates need only minor adaptation. |

---

## Section 4: Phase 3 sprint plan

Five sprints. The first two build the registries. The last three launch markets using them.

| Sprint | Name | Core deliverable | Duration |
|---|---|---|---|
| **S20** | Signals registry | `market_directory_signals` table. Generic `SignalsEngine` replaces `USSignalsService` and `AUSignalsService`. All AU and US signal checks migrated to DB rows. Phase 1 + 2 signal results unchanged. | ~2 weeks |
| **S21** | Location + legal + tax registries | `market_location_formats` — adaptive `LocationPicker`. `market_legal_snippets` — dynamic legal pages. `market_tax_profiles` — config-driven Stripe tax behavior. `stripe:seed` script reads market_tax_profiles. | ~2 weeks |
| **S22** | NZ market | First market launched using all four registries — zero code. NZ market config seeded, NZ prompt packs written, NZ Stripe products seeded, NZ beta cohort (3–5 NZ businesses). Proof that the registry system works. | ~2 weeks |
| **S23** | UK market | UK market config seeded, UK prompt packs written (UK cities + trades). ICO registration. UK VAT verification. UK Checkatrade/Rated People signal checks configured via registry. UK beta cohort (3–5 UK businesses). | ~2 weeks |
| **S24** | Multi-region ops maturity | Cross-market agency dashboard (one VisibleAU account, brands in AU + US + NZ + UK). Consolidated PDF reports across markets. Multi-market signup flow. CI gate runs config:coverage for all enabled markets simultaneously. | ~2 weeks |

**Total Phase 3: ~10 weeks.**

---

## Section 5: What this unlocks after Phase 3

Once the four registries are live and proven with NZ and UK, adding any future English-speaking market looks like this:

| Market | Effort (data only) | What makes it easy |
|---|---|---|
| Singapore | ~3 days | Similar structure to AU; Yelp, Google, local Yellow Pages. English is an official language. |
| Ireland | ~2 days | UK directories mostly work. Irish-specific: Golden Pages, Done Deal. |
| South Africa | ~3 days | English market. Directories: Gumtree SA, HelloPeter, Yellosa. |
| India (EN) | ~4 days | Larger prompt pack needed (many cities). Directories: Justdial, Sulekha, Indiamart. |
| UAE (EN) | ~3 days | English-language searches. Directories: Dubai Business Directory, Bayut, Property Finder. |

The pattern is always: seed the four registries, write prompts, flip `is_enabled`. No code, no deployment risk.

---

## Section 6: What Phase 3 does NOT solve

Being honest about what still requires code, even after Phase 3:

| Area | Why still needs code | Future path |
|---|---|---|
| Non-English markets (FR, DE, ES...) | AI engine prompts need to be in the target language. Translation pipeline is a code problem. | Phase 4 — multi-language engine |
| Schema markup auditing per market | Structured data requirements vary by market (schema.org coverage differs). | Phase 4 — schema auditor registry |
| AI engine coverage gaps | If a new AI engine appears (e.g. xAI Grok for US), it's a new LLM implementation | Covered by existing `provider_market_capabilities` registry + new engine module |
| Custom prompt packs for enterprise | Enterprise customers wanting their own prompt library is a code feature (Sprint 9 Phase 1 pattern) | Already in the Phase 1 vertical pack admin UI pattern |

---

## Appendix: The full registry table reference

| Registry table | Replaces | Phase 3 sprint |
|---|---|---|
| `market_directory_signals` | `USSignalsService.ts`, `AUSignalsService.ts`, future `UKSignalsService.ts`... | S20 |
| `market_location_formats` | Hardcoded city/state/suburb/postcode fields in brand wizard per market | S21 |
| `market_legal_snippets` | Per-market code branches in `/privacy`, `/terms`, and cookie policy pages | S21 |
| `market_tax_profiles` | Manual Stripe product creation and `tax_behavior` hardcoded per market | S21 |
| `markets` *(Phase 2)* | Manual market enable/disable | Phase 2 S13 |
| `market_locales` *(Phase 2)* | Hardcoded locale strings per market | Phase 2 S13 |
| `market_vertical_configs` *(Phase 2)* | Hardcoded vertical lists per market in UI | Phase 2 S13 |
| `config_bundle_cache` *(Phase 2)* | Repeated DB config reads per audit | Phase 2 S13 |
| `provider_market_capabilities` *(Phase 2)* | Hardcoded engine lists per market in audit job | Phase 2 S13 |
| `market_ai_budget_policies` *(Phase 2)* | No budget governance in Phase 1 | Phase 2 S16 |
| `sampling_policies` *(Phase 2)* | No sample quality gates in Phase 1 | Phase 2 S16 |
| `metric_quality_gates` *(Phase 2)* | No "insufficient data" logic in Phase 1 | Phase 2 S16 |

After Phase 3, 14 registries drive all market-specific behaviour. **Adding a new English-speaking market is a data exercise, not an engineering project.**

---

*VisibleAU Phase 3 LLD v1.0 — May 2026 — Confidential*  
*Builds on Phase 1 (Sprints 1–12) + Phase 2 (Sprints 13–19, US expansion)*
