# Sprint 8 — Local SEO + Multi-Engine Polish (Drift + Webhooks + Exports)

**Sprint:** 8 of 12
**Estimated effort:** 60-80 hours (~7-10 weekends at 8 hrs/week — PRD §11 baseline + "~5-7 additional days vs baseline" for OSS-derived additions)
**Goal:** AU Local SEO (Module 4) + drift detection with Wilson CI overlap + SARIF/JUnit/GHA exports live + webhook integrations (Slack/Discord/Sheets/Airtable/Email/custom) + confidence labels persisted at audit-result level.
**Prerequisites:** Sprint 7 complete. Technical audit + Brand & Entity scoring shipping. 50-site corpus passing Spearman > 0.7 gate.
**Out of scope:** Agency tier multi-brand (Sprint 9), Stripe billing (Sprint 10), onboarding flow (Sprint 10).

---

## 0. Read first

1. `CLAUDE.md`
2. `sri-geo-aeo-prd-v1.md` v1.14 §8 Module 4 (Local SEO) + §8 Module 7 (Notifications & Alerts) + §11 Sprint 8 expanded scope + §16 OSS additions to Sprint 8
3. `visibleau-prototype.jsx` lines 2905-3188 (Local SEO + AU directories + Alerts pages)
4. PRD §8 Module 7 (Notifications & Alerts) + §10 Layer 2 (canary prompts) — drift detection trigger + alert delivery channels. Wilson CI overlap math is original to Sprint 8 (informed by §4.5 pain points 6C, 14C, 14D).

---

## 1. What ships this sprint

### Module 4 — Local SEO (PRD §8 + PRD §11 Sprint 8 baseline)

- ✓ **Google Business Profile (GMB) completeness check** — Public GBP API or scraping (within ToS): name, address, phone, hours, photos count, review count, average rating, response rate
- ✓ **AU directory presence** — 4 canonical directories: **Hipages, Yellow Pages AU, ServiceSeeking, Word of Mouth** (per PRD §11 Sprint 8 "now incl. Word of Mouth — 4 directories total"). Sprint 9 adds Google Business Profile to make 5 total. Per-directory: present (yes/no), URL, review count, average rating.
- ✓ **NAP (Name/Address/Phone) consistency** — Pull from customer site + GMB + AU directories. Compute consistency score 0-100. Flag inconsistencies (e.g., "phone differs between site and Hipages").
- ✓ **Suburb-level keyword presence** — For brands with `primaryRegions: ['Bondi', 'Coogee']`, check whether site content + meta + schema include each suburb. Per-suburb coverage report.

### Drift detection (PRD §8 Module 7 + §10 Layer 2)

- ✓ **Drift detection on audit.complete** — Compare current audit's 5-dim scores + composite to most recent prior audit for same brand. Use **Wilson 95% CI overlap math** from Sprint 3 to determine statistical significance.
- ✓ **Drift severity** — `significant_drop` | `significant_rise` | `within_noise`. Within-noise drift does NOT alert.
- ✓ **Per-dimension drift breakdown** — Which dimensions drifted significantly + by how much.
- ✓ **Drift alerts page** at `/drift-alerts` — list of unacknowledged alerts with brand + delta + dimensions. Acknowledge UX.
- ✓ **Brand detail drift indicator** — small badge on each audit history row showing drift severity.
  **FM5 fix — Sprint 4's audit-list page and `GET /api/audits` never updated to include drift severity.**
  FK2 specified the `drift-indicator.tsx` component but not how Sprint 4's page feeds it data.
  Update Sprint 4's `GET /api/audits` query to LEFT JOIN drift_alerts:
  ```typescript
  // In app/api/audits/route.ts (Sprint 4) — extend the SELECT to include drift severity:
  db.select({
    ...getTableColumns(audits),
    brandName: brands.name,
    // Sprint 8 addition: LEFT JOIN to get most recent unacknowledged drift alert for each audit:
    driftSeverity: driftAlerts.severity,  // null if no alert
  })
  .from(audits)
  .innerJoin(brands, eq(audits.brandId, brands.id))
  .leftJoin(
    driftAlerts,
    and(eq(driftAlerts.currentAuditId, audits.id), eq(driftAlerts.acknowledged, false))
  )
  .where(...conditions).orderBy(desc(audits.createdAt)).limit(limit);
  ```
  The `drift-indicator.tsx` component receives `driftSeverity: string | null` as a prop.

### Confidence labels (PRD §11 Sprint 8 + §16 Group 3 #15)

- ✓ **Categorical confidence labels at audit-result level** — Confirmed | Likely | Hypothesis (NOT %-numeric per PRD anti-pattern). Already implemented at Action Center level in Sprint 6; Sprint 8 surfaces equivalent labels on the audit-result dimension cards (e.g., "Sentiment: 67/100 — Confirmed" vs "Context: 42/100 — Hypothesis").
- ✓ Confidence-label classification logic moved into `lib/confidence-labels/` so Sprint 6 + Sprint 8 share the same source of truth.

### Export formats (PRD §11 Sprint 8)

- ✓ **SARIF v2.1.0** export of audit findings (validates against published JSON Schema)
- ✓ **JUnit XML** export (parseable by Jest reporters + GitHub Actions test-result UIs)
- ✓ **GitHub Actions annotations** — `::warning::` / `::error::` text output for inline PR comments
- ✓ Sprint 4's "Coming Sprint 8" stubs replaced with working endpoints

### Webhook integrations (PRD §11 Sprint 8 + §16 #4-#5)

- ✓ **Webhook event taxonomy** — `audit.completed`, `audit.score.dropped`, `audit.score.changed`, `drift.detected`, `recommendation.created` (per Foglift reference)
- ✓ **6 delivery channels** — Email (already from Sprint 2), Slack, Discord, Google Sheets, Airtable, custom HTTP webhook
- ✓ **Webhook signature verification** — HMAC-SHA256 with per-endpoint secret
- ✓ **Per-org webhook config UI** at `/settings/webhooks` — add endpoint URL, pick events, generate secret, test delivery
- ✓ **Webhook recipe library** — public docs page with copy-paste Zapier / n8n / Make.com recipes (`/docs/integrations/zapier` etc.)
- ✓ **Retry logic** — exponential backoff 1m / 5m / 30m / 2h / 8h; mark dead after 5 failures

### Additional

- ✓ **TikTok citation placeholder** — UI element in cited-sources view grayed out with "Coming v1.1" tooltip (PRD v1.1)
- ✓ ATTRIBUTIONS.md updated — Foglift (webhook event taxonomy + 6-channel pattern) attributed

**Definition of done:** A brand has GMB + 4 AU directories + NAP consistency scored. After audit.complete, drift detection compares to prior audit and creates an alert if Wilson CIs don't overlap. SARIF/JUnit/GHA exports download as valid documents. Org admins configure Slack webhook at /settings/webhooks → next audit completion → message arrives in Slack channel.

---

## 2. Dependencies to install

```bash
# XML for SARIF + JUnit
pnpm add xmlbuilder2

# Webhook signing
pnpm add @stablelib/hmac @stablelib/sha256

# JSON Schema validation for SARIF (dev only)
pnpm add -D @cfworker/json-schema

# Google Sheets / Airtable webhook recipes don't need libs — they're standard HTTP POSTs

# Crawler already installed Sprint 7 — reused for NAP consistency
```

---

## 3. Environment variables (additions)

```bash
# Optional: GMB scraping rate-limit (use legitimate API if available)
# FJ5 fix: 'GMB_API_KEY' is a misnomer — this is actually a Google Places API key.
# Google Business Profile has no direct public API; the Places API is used instead.
# The key is obtained from Google Cloud Console → Places API (new) → API key.
GMB_API_KEY=          # = your Google Places API key (used in FD3 Text Search + Place Details calls)
# Alias for clarity in new code: prefer GOOGLE_PLACES_API_KEY; GMB_API_KEY kept for backwards compat
GOOGLE_PLACES_API_KEY=${GMB_API_KEY}  # same value — both names valid

# Webhook delivery
WEBHOOK_SIGNING_SECRET_PREFIX=whsec_
```

---

## 4. Project structure additions

```
db/schema/
├── local-seo-results.ts                       # NEW
├── drift-alerts.ts                            # NEW
├── webhook-endpoints.ts                       # NEW
├── webhook-deliveries.ts                      # NEW
└── audit-exports.ts                           # NEW (track generated SARIF/JUnit/GHA)
    # FB6 fix: listed in project structure and barrel-exported but schema never written.
    # The export route generates the file on-demand; this table caches + logs each generation:
    #
    # export const auditExports = pgTable('audit_exports', {
    #   id: uuid('id').primaryKey().defaultRandom(),
    #   auditId: uuid('audit_id').references(() => audits.id).notNull(),
    #   organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
    #   format: text('format').notNull(),           // 'sarif' | 'junit' | 'gha' | 'pdf'
    #   generatedAt: timestamp('generated_at', { withTimezone: true }).defaultNow().notNull(),
    #   fileSizeBytes: integer('file_size_bytes'),
    #   downloadCount: integer('download_count').default(0).notNull(),
    # });
    # RLS: ENABLE — organizationId col present; same policy as drift_alerts.
    # Index: (auditId) for export history on audit detail page.

lib/
├── local-seo/
│   ├── gmb-check.ts                           # GBP completeness
│   │   # FD3 fix: Google Places Text Search → Place Details two-step specified.
│   │   # FK4 fix: GmbResult interface specified. FM2 fix: checkGmb function body never written.
│   │   # export async function checkGmb(domain: string, brandName: string): Promise<GmbResult> {
│   │   #   const key = process.env.GMB_API_KEY;
│   │   #   if (!key) return { present: false, completeness: 0, reviewCount: null, avgRating: null,
│   │   #     placeId: null, name: null, address: null, phone: null };
│   │   #
│   │   #   // Step 1: Text Search to find Place ID
│   │   #   const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${
│   │   #     encodeURIComponent(brandName + ' ' + domain)}&key=${key}`;
│   │   #   const searchRes = await fetch(searchUrl).then(r => r.json());
│   │   #   if (!searchRes.results?.length) return { present: false, completeness: 0,
│   │   #     reviewCount: null, avgRating: null, placeId: null, name: null, address: null, phone: null };
│   │   #
│   │   #   const placeId = searchRes.results[0].place_id;
│   │   #
│   │   #   // Step 2: Place Details
│   │   #   const fields = 'name,formatted_address,formatted_phone_number,opening_hours,photos,rating,user_ratings_total';
│   │   #   const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${key}`;
│   │   #   const detail = await fetch(detailUrl).then(r => r.json());
│   │   #   const r = detail.result ?? {};
│   │   #
│   │   #   const fields6 = [r.name, r.formatted_address, r.formatted_phone_number,
│   │   #     r.opening_hours, r.photos?.length > 0 ? true : null, r.user_ratings_total];
│   │   #   const completeness = Math.round((fields6.filter(Boolean).length / 6) * 100);
│   │   #
│   │   #   return {
│   │   #     present: true, completeness, placeId,
│   │   #     reviewCount: r.user_ratings_total ?? null,
│   │   #     avgRating: r.rating ?? null,
│   │   #     name: r.name ?? null, address: r.formatted_address ?? null,
│   │   #     phone: r.formatted_phone_number ?? null,
│   │   #   };
│   │   # }
│   │   # gmb.avgRating — these come from the Places API `rating` and `user_ratings_total` fields.
│   │   # Unlike directories (FG5: null for Sprint 8), GMB DOES return these from Places API.
│   │   # Canonical return type:
│   │   # interface GmbResult {
│   │   #   present: boolean;
│   │   #   completeness: number;      // 0-100: % of 6 key fields populated
│   │   #   reviewCount: number | null; // from user_ratings_total (null if not found)
│   │   #   avgRating: number | null;   // from rating (null if not found)
│   │   #   placeId: string | null;
│   │   #   name: string | null;        // for NAP consistency
│   │   #   address: string | null;     // for NAP consistency
│   │   #   phone: string | null;       // for NAP consistency
│   │   # }
│   │   # the approach is Google Places API (Text Search → Place Details). Two-step:
│   │   #
│   │   # Step 1 — Text Search to find the Place ID:
│   │   # GET https://maps.googleapis.com/maps/api/place/textsearch/json
│   │   #   ?query=${encodeURIComponent(brandName + ' ' + brandDomain)}&key=${GMB_API_KEY}
│   │   # Extract: results[0].place_id (if no results → gmbPresent: false, return early)
│   │   #
│   │   # Step 2 — Place Details for completeness fields:
│   │   # GET https://maps.googleapis.com/maps/api/place/details/json
│   │   #   ?place_id=${placeId}&fields=name,formatted_address,formatted_phone_number,
│   │   #   opening_hours,photos,rating,user_ratings_total&key=${GMB_API_KEY}
│   │   # Map response: { name, address, phone, hours, photosCount, reviewCount, avgRating }
│   │   # gmbCompleteness = % of fields present (name+address+phone+hours+photos+reviews ÷ 6 × 100)
│   │   # Error handling: 403 = invalid key; ZERO_RESULTS = not found; rate limit = retry once
│   ├── au-directories.ts                      # 4-directory presence (Hipages, YPAU, SS, WoM)
│   │   # FG1 fix: detection method never specified. FG5 fix: field depth per directory.
│   │   # Method: HTTP fetch of each directory's public search URL + cheerio parse.
│   │   # All 4 are legitimate public search pages — no auth required, reasonable rate limit.
│   │   #
│   │   # Search URL patterns (search by brand name + suburb):
│   │   #   Hipages: https://hipages.com.au/find/{category}/{suburb}?q={brandName}
│   │   #     or simpler: https://hipages.com.au/companies/search?q={brandName}
│   │   #   Yellow Pages AU: https://www.yellowpages.com.au/search/listings?q={brandName}&locationClue={suburb}
│   │   #   ServiceSeeking: https://www.serviceseeking.com.au/services/all/in/{suburb}?q={brandName}
│   │   #   Word of Mouth: https://www.womo.com.au/search/?q={brandName}&location={suburb}
│   │   #
│   │   # Field depth per directory:
│   │   #   present: bool — any result matching brand name appears in HTML (use includes() on h2/h3 text)
│   │   #   url: string|null — href of first matching result link
│   │   #   reviewCount: Sprint 8 = null (not deep-parsed; too brittle, DOM changes often)
│   │   #   avgRating: Sprint 8 = null (same — Sprint 9 adds deep-parse if needed)
│   │   # FG5 clarification: Sprint 8 delivers presence+url only. reviewCount/avgRating columns
│   │   # exist in the schema for Sprint 9 to populate — store null for now.
│   │   # Rate limiting: add 1s delay between directory requests; max 15s timeout per directory.
│   ├── nap-consistency.ts                     # cross-source NAP comparison
│   │   # FJ4 fix: checkNapConsistency function body never written. FA4 calls it but
│   │   # FB4 only specified the formula, not the TypeScript implementation.
│   │   #
│   │   # export interface NapSource { name: string; address: string; phone: string; label: string; }
│   │   # export interface NapResult { score: number; findings: NapFinding[]; }
│   │   # interface NapFinding { source: string; name: string; address: string; phone: string;
│   │   #   matches: { name: boolean; address: boolean; phone: boolean }; }
│   │   #
│   │   # export function checkNapConsistency(sources: NapSource[]): NapResult {
│   │   #   if (sources.length < 2) return { score: 100, findings: [] };
│   │   #   // Pairwise comparison: C(n,2) pairs
│   │   #   let nameMatches = 0, addressMatches = 0, phoneMatches = 0, total = 0;
│   │   #   for (let i = 0; i < sources.length; i++) {
│   │   #     for (let j = i + 1; j < sources.length; j++) {
│   │   #       const a = sources[i], b = sources[j];
│   │   #       nameMatches    += normalise(a.name)    === normalise(b.name)    ? 1 : 0;
│   │   #       addressMatches += normaliseAddress(a.address) === normaliseAddress(b.address) ? 1 : 0;
│   │   #       phoneMatches   += normalisePhone(a.phone) === normalisePhone(b.phone) ? 1 : 0;
│   │   #       total++;
│   │   #     }
│   │   #   }
│   │   #   const score = total > 0
│   │   #     ? Number(((nameMatches + addressMatches + phoneMatches) / (total * 3) * 100).toFixed(2))
│   │   #     : 100;
│   │   #   // Build findings (each source as a row with match flags vs the majority):
│   │   #   const findings: NapFinding[] = sources.map(s => ({
│   │   #     source: s.label, name: s.name, address: s.address, phone: s.phone,
│   │   #     matches: { name: true, address: true, phone: true }  // simplified — flag source-vs-modal
│   │   #   }));
│   │   #   return { score, findings };
│   │   # }
│   │   # Callers: brand data (from brands table), gmb result, directories array → map to NapSource[]
│   ├── suburb-coverage.ts                     # suburb-level keyword check
│   │   # FD2 fix: detection method never specified. Uses cached crawl result (no re-crawl):
│   │   # function checkSuburbCoverage(domain: string, suburbs: string[], crawl: CrawlResult)
│   │   # For each suburb (case-insensitive):
│   │   #   mentionedInContent: suburb appears in readability textContent of any crawled page
│   │   #     (use: crawl.pages.some(p => p.extractedContent.textContent.toLowerCase().includes(suburb.toLowerCase())))
│   │   #   mentionedInMeta: suburb in <title> or <meta name="description"> of any page
│   │   #     (use cheerio: $('title').text() + $('meta[name="description"]').attr('content'))
│   │   #   mentionedInSchema: suburb in any JSON-LD @type LocalBusiness address fields
│   │   #     (parse JSON-LD blocks, check addressLocality + addressRegion)
│   │   # Returns: Array<{ suburb: string, mentionedInContent: bool, mentionedInMeta: bool, mentionedInSchema: bool }>
│   └── score.ts                               # composite local SEO score
│       # FI1 fix: computeLocalSeoScore function body never written. FF2 specified
│       # weights but not the TypeScript code:
│       #
│       # interface LocalSeoInputs {
│       #   gmb: { present: boolean; completeness: number };  // completeness 0-100
│       #   directories: Array<{ present: boolean }>;         // 4 directories
│       #   nap: { score: number };                           // napConsistency 0-100
│       #   suburbs: Array<{ mentionedInContent: boolean; mentionedInMeta: boolean; mentionedInSchema: boolean }>;
│       # }
│       #
│       # export function computeLocalSeoScore(inputs: LocalSeoInputs): number {
│       #   const gmbScore    = inputs.gmb.present ? inputs.gmb.completeness : 0;
│       #   const napScore    = inputs.nap.score;
│       #   const dirScore    = inputs.directories.length > 0
│       #     ? (inputs.directories.filter(d => d.present).length / inputs.directories.length) * 100
│       #     : 0;
│       #   const suburbScore = inputs.suburbs.length > 0
│       #     ? (inputs.suburbs.filter(s => s.mentionedInContent || s.mentionedInMeta || s.mentionedInSchema).length
│       #        / inputs.suburbs.length) * 100
│       #     : 100;  // No suburbs configured = full marks (not a gap)
│       #   return Number(((gmbScore * 0.30) + (napScore * 0.30) + (dirScore * 0.25) + (suburbScore * 0.15)).toFixed(2));
│       # }
├── drift/
│   ├── detect.ts                              # audit-to-audit comparison
│   │   # FK5 fix: detect.ts body never specified. Same lib-vs-Inngest pattern as Sprint 6
│   │   # buildRecommendations (DE1 fix) — pure logic in lib/, orchestration in Inngest.
│   │   # detect-drift.ts (Inngest) CALLS detectDrift() from this module inside a step.
│   │   # Pure logic, no DB access, fully unit-testable:
│   │   #
│   │   # export interface DriftInput {
│   │   #   currentScores: Record<string, number>;  // { frequency: 24, ... }
│   │   #   previousScores: Record<string, number>;
│   │   #   currentCIs: Record<string, { lower: number; upper: number }>;
│   │   #   previousCIs: Record<string, { lower: number; upper: number }>;
│   │   #   currentComposite: number;
│   │   #   previousComposite: number;
│   │   # }
│   │   # export interface DriftOutput {
│   │   #   compositeSeverity: 'significant_drop'|'significant_rise'|'within_noise';
│   │   #   scoreDelta: number;
│   │   #   dimensionDeltas: Record<string, { delta: number; severity: string; currentCI: CI|null; previousCI: CI|null }>;
│   │   #   hasSignificant: boolean;  // true if any dimension or composite is significant
│   │   # }
│   │   # export function detectDrift(input: DriftInput): DriftOutput {
│   │   #   // uses classifySeverity (significance.ts) + FC1 composite threshold
│   │   # }
│   ├── significance.ts                        # Wilson CI overlap math (reused from Sprint 3)
│   ├── severity.ts                            # significant_drop | significant_rise | within_noise
│   └── types.ts
├── confidence-labels/                         # NEW shared module
│   ├── classify.ts                            # Confirmed | Likely | Hypothesis
│   │   # FL5 fix: classify.ts is the entry point but was never assembled as a module.
│   │   # FC2 described two axes; FC5 specified classifyByScore in rules.ts.
│   │   # classify.ts is the unified export — Sprint 6 + Sprint 8 both import from here:
│   │   #
│   │   # // lib/confidence-labels/classify.ts
│   │   # export { CONFIDENCE_LEVELS } from '../recommendations/confidence-labels';
│   │   # // (re-export Sprint 6's key→label map for backwards compat)
│   │   #
│   │   # export function classifyByKey(key: string): 'confirmed'|'likely'|'hypothesis' {
│   │   #   return CONFIDENCE_LEVELS[key] ?? 'hypothesis';
│   │   # }
│   │   #
│   │   # export function classifyByScore(score: number): 'confirmed'|'likely'|'hypothesis' {
│   │   #   if (score >= 70) return 'confirmed';
│   │   #   if (score >= 40) return 'likely';
│   │   #   return 'hypothesis';
│   │   # }
│   │   #
│   │   # Sprint 6 Action Center usage:  classifyByKey(recommendation.recommendationKey)
│   │   # Sprint 8 dimension card usage: classifyByScore(dimensionScore)
│   └── rules.ts                               # category → label mapping
│       # FC5 fix: thresholds never specified. Two axes:
│       # Axis 1 (by recommendationKey, Sprint 6): existing CONFIDENCE_LEVELS map imported here.
│       # Axis 2 (by dimension score, Sprint 8):
│       #   score ≥ 70 → 'confirmed'; score 40-69 → 'likely'; score < 40 → 'hypothesis'
│       # export function classifyByScore(score: number): 'confirmed'|'likely'|'hypothesis' {
│       #   if (score >= 70) return 'confirmed';
│       #   if (score >= 40) return 'likely';
│       #   return 'hypothesis';
│       # }
├── exports/
│   ├── sarif.ts                               # SARIF v2.1.0 builder
│   │   # FK3 fix: buildSarif function signature never specified. FA5 showed the SARIF JSON
│   │   # structure; FF1 calls buildSarif(audit) — but the type and field mapping were missing.
│   │   #
│   │   # export function buildSarif(audit: {
│   │   #   id: string; brandId: string; scores: Record<string, number>;
│   │   #   scoreComposite: string | number; createdAt: Date;
│   │   # }): SarifLog {
│   │   #   const DIMS = ['frequency','position','sentiment','context','accuracy'] as const;
│   │   #   const RULES = DIMS.map((dim, i) => ({
│   │   #     id: `VA00${i+1}`, name: `${dim.charAt(0).toUpperCase()}${dim.slice(1)}Score`,
│   │   #     shortDescription: { text: `AI ${dim} dimension score` },
│   │   #     helpUri: `https://visibleau.com/docs/scoring#${dim}`,
│   │   #   }));
│   │   #   const scores = (audit.scores ?? {}) as Record<string, number>;
│   │   #   const results = DIMS
│   │   #     .filter(dim => (scores[dim] ?? 100) < 70)  // only failing/warning dimensions
│   │   #     .map(dim => {
│   │   #       const score = scores[dim] ?? 0;
│   │   #       return {
│   │   #         ruleId: RULES[DIMS.indexOf(dim)].id,
│   │   #         level: score < 30 ? 'error' : score < 50 ? 'warning' : 'note',
│   │   #         message: { text: `${dim} score ${score}/100` },
│   │   #         locations: [{ physicalLocation: {
│   │   #           artifactLocation: { uri: `brand/${audit.brandId}`, uriBaseId: '%SRCROOT%' }
│   │   #         }}],
│   │   #       };
│   │   #     });
│   │   #   return { '$schema': 'https://schemastore.azurewebsites.net/schemas/json/sarif-2.1.0.json',
│   │   #     version: '2.1.0', runs: [{ tool: { driver: { name: 'VisibleAU', version: '1.0.0',
│   │   #       rules: RULES } }, results, invocations: [{ executionSuccessful: true }] }] };
│   │   # }
│   ├── junit.ts                               # JUnit XML builder
│   │   # FE1 fix: JUnit XML structure specified. FL2 fix: buildJunit function never written.
│   │   # export function buildJunit(audit: {
│   │   #   id: string; brandId: string; brandName?: string;
│   │   #   scores: Record<string, number>; createdAt: Date;
│   │   # }): string {
│   │   #   const DIMS = ['frequency','position','sentiment','context','accuracy'];
│   │   #   const scores = audit.scores ?? {};
│   │   #   const failures = DIMS.filter(d => (scores[d] ?? 100) < 50).length;
│   │   #   const root = create({ version: '1.0', encoding: 'UTF-8' }).ele('testsuites', {
│   │   #     name: 'VisibleAU Audit', tests: DIMS.length, failures
│   │   #   });
│   │   #   const suite = root.ele('testsuite', {
│   │   #     name: audit.brandName ?? audit.brandId, tests: DIMS.length, failures,
│   │   #     timestamp: audit.createdAt.toISOString(), time: '0'
│   │   #   });
│   │   #   for (const dim of DIMS) {
│   │   #     const score = scores[dim] ?? 0;
│   │   #     const tc = suite.ele('testcase', {
│   │   #       name: `${dim.charAt(0).toUpperCase()}${dim.slice(1)} score`,
│   │   #       classname: `dimension.${dim}`, time: '0'
│   │   #     });
│   │   #     if (score < 50) {
│   │   #       tc.ele('failure', { message: `Score ${score}/100 — below 50 threshold`, type: 'ScoreFailure' })
│   │   #         .txt(`${dim} score: ${score}/100.`);
│   │   #     }
│   │   #   }
│   │   #   return root.end({ prettyPrint: true });  // xmlbuilder2
│   │   # }
│   │   # <testsuites name="VisibleAU Audit" tests="{N}" failures="{F}">
│   │   #   <testsuite name="{brandName}" tests="{N}" failures="{F}"
│   │   #              timestamp="{auditCreatedAt}" time="0">
│   │   #     <!-- One <testcase> per dimension: -->
│   │   #     <testcase name="Frequency score" classname="dimension.frequency"
│   │   #               time="0">
│   │   #       <!-- Present only if score < 50 (failure threshold): -->
│   │   #       <failure message="Score 24/100 — below 50 threshold"
│   │   #                type="ScoreFailure">
│   │   #         Frequency score: 24/100. Brand appears in AI responses less than 25% of prompts.
│   │   #         Recommended: add Wikipedia presence, claim AU directories.
│   │   #       </failure>
│   │   #     </testcase>
│   │   #     <testcase name="Position score" classname="dimension.position" time="0" />  <!-- pass: no child -->
│   │   #   </testsuite>
│   │   # </testsuites>
│   │   # Pass = score ≥ 50; failure = score < 50. Built with xmlbuilder2.
│   ├── gha.ts                                 # GitHub Actions annotation builder
│   │   # FE2 fix: annotation syntax specified. FL3 fix: buildGha function never written.
│   │   # export function buildGha(audit: {
│   │   #   scores: Record<string, number>;
│   │   # }): string {
│   │   #   const DIMS = ['frequency','position','sentiment','context','accuracy'];
│   │   #   const scores = audit.scores ?? {};
│   │   #   const lines: string[] = [];
│   │   #   for (const dim of DIMS) {
│   │   #     const score = scores[dim] ?? 0;
│   │   #     const label = `${dim.charAt(0).toUpperCase()}${dim.slice(1)} Score`;
│   │   #     const msg = `${score}/100`;
│   │   #     if (score < 30)       lines.push(`::error title=${label}::${msg}`);
│   │   #     else if (score < 50)  lines.push(`::warning title=${label}::${msg}`);
│   │   #     else if (score < 70)  lines.push(`::notice title=${label}::${msg}`);
│   │   #     // score >= 70: silent pass
│   │   #   }
│   │   #   return lines.join('\n');  // plain text, one annotation per line
│   │   # }
│   │   # Without title=, GitHub renders annotations without labels in PR diff views.
│   │   # Full GHA workflow command syntax for VisibleAU audit findings:
│   │   #
│   │   # Failure (score < 30):  ::error title={Dimension} Score::{message}
│   │   # Warning (score 30-49): ::warning title={Dimension} Score::{message}
│   │   # Notice (score 50-69):  ::notice title={Dimension} Score::{message}
│   │   # (score ≥ 70: no annotation — passing dimensions are silent)
│   │   #
│   │   # Example output line:
│   │   # ::warning title=Frequency Score::24/100 — Brand appears in <25% of AI responses. Add Wikipedia presence.
│   │   # ::error title=Sentiment Score::18/100 — Negative brand sentiment detected in 3 engines.
│   │   #
│   │   # gha.ts returns a plain string with one annotation per line.
│   │   # The export route writes it as text/plain (not JSON) with filename audit-{id}.txt.
│   └── pdf.ts                                 # already from Sprint 4 — refactored here
│       # FF4 fix: "refactored here" never explained. Sprint 4's PDF generation lives inline
│       # in app/api/audits/[auditId]/export/route.ts as a handler branch.
│       # Sprint 8 refactor: extract the PDF generation logic into lib/exports/pdf.ts
│       # so the export route dispatcher (FF1) can call buildPdf(audit) alongside buildSarif/buildJunit/buildGha.
│       # Refactor: move the @react-pdf/renderer rendering call out of route.ts into:
│       # export async function buildPdf(audit: Audit): Promise<Buffer>
│       # The route.ts just calls: const pdfBuf = await buildPdf(audit); return new Response(pdfBuf, {...})
│       # No functional change to the PDF output — purely a code organisation refactor for consistency.
└── webhooks/
    ├── sign.ts                                # HMAC-SHA256 per-endpoint
    │   # FG2 fix: signHmacSha256 function body never specified.
    │   # Use Node.js built-in crypto — @stablelib/hmac is unnecessary overhead:
    │   # import { createHmac } from 'crypto';
    │   # export function signHmacSha256(message: string, secret: string): string {
    │   #   return createHmac('sha256', secret).update(message).digest('hex');
    │   # }
    │   # Signature sent as X-VisibleAU-Signature: sha256={hex} header.
    │   # Customer verification: createHmac('sha256', secret).update(rawBody).digest('hex') === sig.
    │   # Note: remove @stablelib/hmac + @stablelib/sha256 from package.json — not needed.
    ├── deliver.ts                             # POST with retry
    │   # FJ2 fix: deliver.ts body never specified. This is the raw HTTP delivery function
    │   # called by deliver-webhook.ts Inngest function (which handles retries via Inngest).
    │   #
    │   # export interface DeliveryResult { ok: boolean; status: number; body: string }
    │   #
    │   # export async function deliver(
    │   #   url: string, body: unknown, signature: string, eventName: string
    │   # ): Promise<DeliveryResult> {
    │   #   const res = await fetch(url, {
    │   #     method: 'POST',
    │   #     headers: {
    │   #       'Content-Type': 'application/json',
    │   #       'X-VisibleAU-Signature': `sha256=${signature}`,
    │   #       'X-VisibleAU-Event': eventName,
    │   #       'User-Agent': 'VisibleAU-Webhook/1.0',
    │   #     },
    │   #     body: JSON.stringify(body),
    │   #     signal: AbortSignal.timeout(10_000),  // 10s timeout per delivery attempt
    │   #   });
    │   #   const responseBody = await res.text().catch(() => '');
    │   #   if (!res.ok) throw new Error(`Delivery failed: ${res.status}`);  // Inngest retries on throw
    │   #   return { ok: res.ok, status: res.status, body: responseBody };
    │   # }
    ├── retry.ts                               # exponential backoff queue
    │   # FD1 fix: retry.ts is NOT a retry queue — Inngest handles retries.
    │   # FM1 fix: dead-letter cleanup function body never written.
    │   # Called by deliver-webhook.ts Inngest function AFTER each delivery failure:
    │   #
    │   # export async function handleDeliveryFailure(endpointId: string): Promise<void> {
    │   #   // Count recent consecutive failures for this endpoint:
    │   #   const recentDeliveries = await db.select()
    │   #     .from(webhookDeliveries)
    │   #     .where(eq(webhookDeliveries.endpointId, endpointId))
    │   #     .orderBy(desc(webhookDeliveries.createdAt)).limit(5);
    │   #
    │   #   const allFailed = recentDeliveries.length === 5
    │   #     && recentDeliveries.every(d => d.responseStatus === null || (d.responseStatus >= 400));
    │   #
    │   #   if (allFailed) {
    │   #     // Mark endpoint dead — disable it to stop further delivery attempts:
    │   #     await db.update(webhookEndpoints)
    │   #       .set({ isActive: false, lastDeliveryStatus: 'dead', updatedAt: new Date() })
    │   #       .where(eq(webhookEndpoints.id, endpointId));
    │   #     console.warn(`Webhook endpoint ${endpointId} disabled after 5 consecutive failures`);
    │   #   } else {
    │   #     await db.update(webhookEndpoints)
    │   #       .set({ lastDeliveryStatus: 'failed', lastDeliveryAt: new Date(), updatedAt: new Date() })
    │   #       .where(eq(webhookEndpoints.id, endpointId));
    │   #   }
    │   # }
    │   # Called in deliver-webhook.ts inside a catch block after all Inngest retries exhausted.
    ├── channels/
    │   ├── slack.ts                           # Slack-formatted message
    │   │   # FC3 fix: formatSlack output shape never specified.
    │   │   # Returns Slack Block Kit format: { text: string (fallback), blocks: KnownBlock[] }
    │   │   # header block: brandName + eventName; section block: score + date fields;
    │   │   # actions block: "View audit" button linking to the audit page in VisibleAU.
    │   ├── discord.ts                         # Discord-formatted message
    │   │   # FH3 fix: formatDiscord never specified (FC3 only covered Slack).
    │   │   # Discord incoming webhook format: { content?: string, embeds: Embed[] }
    │   │   # function formatDiscord(eventName: string, payload: WebhookPayload) {
    │   │   #   const colour = payload.severity === 'significant_drop' ? 0xEF4444  // red
    │   │   #     : payload.severity === 'significant_rise' ? 0x22C55E              // green
    │   │   #     : 0x3B82F6;                                                        // blue (default)
    │   │   #   return { embeds: [{
    │   │   #     title: `${payload.brandName} — ${eventName}`,
    │   │   #     color: colour,
    │   │   #     fields: [
    │   │   #       { name: 'Score', value: String(payload.scoreComposite ?? payload.currentScore ?? '—'), inline: true },
    │   │   #       { name: 'Delta', value: payload.delta != null ? `${payload.delta > 0 ? '+' : ''}${payload.delta}` : '—', inline: true },
    │   │   #     ],
    │   │   #     url: payload.url,
    │   │   #     footer: { text: 'VisibleAU' },
    │   │   #     timestamp: new Date().toISOString(),
    │   │   #   }]};
    │   │   # }
    │   ├── sheets.ts                          # Google Sheets append row
    │   │   # FK1 fix: formatSheets body never specified.
    │   │   # Google Sheets has no direct webhook API. The channel URL is an Apps Script web app:
    │   │   # https://script.google.com/macros/s/{SCRIPT_ID}/exec
    │   │   # The Apps Script receives POST body and calls sheet.appendRow([...values]).
    │   │   # formatSheets returns a flat object — Apps Script must map fields to columns:
    │   │   # function formatSheets(eventName: string, payload: WebhookPayload) {
    │   │   #   return {
    │   │   #     event: eventName, brand: payload.brandName,
    │   │   #     score: payload.scoreComposite ?? payload.currentScore ?? '',
    │   │   #     delta: payload.delta ?? payload.scoreDelta ?? '',
    │   │   #     timestamp: new Date().toISOString(), url: payload.url,
    │   │   #   };
    │   │   # }
    │   ├── airtable.ts                        # Airtable record insert
    │   │   # FK1 fix: formatAirtable body never specified.
    │   │   # Airtable REST API: POST https://api.airtable.com/v0/{baseId}/{tableId}
    │   │   # Auth: Authorization: Bearer {AIRTABLE_API_KEY} (per-org config, stored in endpoint.url as query param or in a separate secret field)
    │   │   # Sprint 8: encode base/table/key in the endpoint URL as query params for simplicity:
    │   │   #   e.g. https://api.airtable.com/v0/appXXX/tblYYY?apiKey=patZZZ
    │   │   # formatAirtable returns Airtable's POST body format:
    │   │   # function formatAirtable(eventName: string, payload: WebhookPayload) {
    │   │   #   return {
    │   │   #     fields: {
    │   │   #       'Event': eventName, 'Brand': payload.brandName,
    │   │   #       'Score': payload.scoreComposite ?? payload.currentScore ?? 0,
    │   │   #       'Delta': payload.delta ?? 0, 'Date': new Date().toISOString(),
    │   │   #       'URL': payload.url,
    │   │   #     }
    │   │   #   };
    │   │   # }
    │   └── custom-http.ts                     # generic JSON POST
    │       # FM3 fix: "pass payload through unchanged" was prose — TypeScript never written.
    │       # function formatCustomHttp(eventName: string, payload: WebhookPayload): unknown {
    │       #   // Custom HTTP: wrap payload in an envelope with event metadata.
    │       #   // Customer's receiver gets the full typed payload unchanged:
    │       #   return {
    │       #     event: eventName,
    │       #     timestamp: new Date().toISOString(),
    │       #     data: payload,  // full WebhookPayload — customer can extract any field
    │       #   };
    │       # }
    │       # This is the safest format: structured envelope + typed data.
    │       # The customer's server receives JSON and can use any field from the payload. §1 says "Email (already from Sprint 2)".
    │   # Sprint 8 email delivery is NOT a new formatter — it reuses Sprint 2's
    │   # sendAuditCompleteEmail Inngest function pattern via Resend.
    │   # formatEmail() in the switch should call the existing email sending logic:
    │   # case 'email': return { to: endpoint.url, subject: `VisibleAU: ${eventName}`,
    │   #   html: `<p>${payload.brandName} — score ${payload.scoreComposite}</p>
    │   #          <a href="${payload.url}">View audit</a>` };
    │   # deliver.ts for email channel: use Resend SDK (already installed Sprint 2)
    │   # instead of fetch(). The endpoint.url for email channel = recipient email address.
    └── events.ts                              # event taxonomy
        # FH2 fix: payload shapes never specified. formatSlack/Discord/etc. receive payload
        # typed as unknown — no type safety. Canonical payload per event:
        #
        # export type AuditCompletedPayload = {
        #   eventName: 'audit.completed';
        #   brandId: string; brandName: string; auditId: string;
        #   scoreComposite: number; createdAt: string;  // ISO8601
        #   url: string;  // deep link to audit in VisibleAU
        # };
        # export type AuditScoreDroppedPayload = {
        #   eventName: 'audit.score.dropped';
        #   brandId: string; brandName: string;
        #   previousScore: number; currentScore: number; delta: number;
        #   url: string;
        # };
        # export type DriftDetectedPayload = {
        #   eventName: 'drift.detected';
        #   brandId: string; brandName: string;
        #   severity: 'significant_drop' | 'significant_rise';
        #   scoreDelta: number; affectedDimensions: string[];
        #   url: string;
        # };
        # export type RecommendationCreatedPayload = {
        #   eventName: 'recommendation.created';
        #   brandId: string; brandName: string;
        #   recommendationCount: number; highPriorityCount: number;
        #   url: string;
        # };
        # export type WebhookPayload = AuditCompletedPayload | AuditScoreDroppedPayload
        #   | DriftDetectedPayload | RecommendationCreatedPayload;
        # Note: audit.score.changed is a subset of audit.completed (emit when |delta| > 5)

inngest/functions/
├── local-seo-audit.ts                         # NEW — triggered by audit.complete
├── detect-drift.ts                            # NEW — triggered by audit.complete
├── deliver-webhook.ts                         # NEW — triggered by audit.completed / drift.detected / etc.
└── fanout-webhooks.ts                         # NEW — FH1 fix: the missing bridge.
    # CRITICAL: deliver-webhook.ts listens to 'webhook.deliver' but nothing emits it.
    # detect-drift.ts emits 'drift/detected'; run-audit.ts emits 'audit/complete'.
    # Neither emits 'webhook.deliver'. Without this function, NO webhook is ever delivered.
    #
    # fanout-webhooks.ts listens to ALL delivery-triggering events and fans out to
    # per-endpoint 'webhook.deliver' events:
    #
    # export const fanoutWebhooksFn = inngest.createFunction(
    #   { id: 'fanout-webhooks' },
    #   [{ event: 'audit/complete' }, { event: 'drift/detected' }, { event: 'recommendation/created' }],
    #   async ({ event, step }) => {
    #     const { organizationId } = event.data;
    #     // Map internal Inngest event → external delivery event name:
    #     const deliveryEventName = {
    #       'audit/complete': 'audit.completed',
    #       'drift/detected': 'drift.detected',
    #       'recommendation/created': 'recommendation.created',
    #     }[event.name];
    #     if (!deliveryEventName) return;
    #
    #     // Load all active endpoints for this org subscribed to this event:
    #     const endpoints = await step.run('load-endpoints', async () => {
    #       await setRlsContext(db, organizationId);
    #       return db.select().from(webhookEndpoints)
    #         .where(and(eq(webhookEndpoints.organizationId, organizationId),
    #                    eq(webhookEndpoints.isActive, true),
    #                    sql`${deliveryEventName} = ANY(${webhookEndpoints.events})`));
    #     });
    #
    #     // Emit one 'webhook.deliver' per matching endpoint:
    #     if (endpoints.length > 0) {
    #       await inngest.send(endpoints.map(ep => ({
    #         name: 'webhook.deliver',
    #         data: { endpointId: ep.id, eventName: deliveryEventName, payload: event.data },
    #       })));
    #     }
    #   }
    # );
    # Add fanoutWebhooksFn to serve() in app/api/inngest/route.ts.

app/(auth)/
├── brands/[brandId]/local-seo/page.tsx        # NEW
├── drift-alerts/page.tsx                      # NEW
└── settings/webhooks/page.tsx                 # NEW

app/(marketing)/docs/integrations/
├── zapier/page.tsx                            # NEW recipe page
├── n8n/page.tsx                               # NEW recipe page
├── make-com/page.tsx                          # NEW recipe page
├── slack/page.tsx
├── discord/page.tsx
├── sheets/page.tsx
└── airtable/page.tsx

app/api/
├── audits/[auditId]/export/route.ts           # EXTEND with format=sarif|junit|gha (was Sprint 4 stub)
│   # FF1 fix: route body never written for the Sprint 8 extension.
│   # Sprint 4 handles format=pdf|csv|json. Sprint 8 adds sarif|junit|gha:
│   #
│   # export async function GET(req: Request, { params }: { params: { auditId: string } }) {
│   #   const { searchParams } = new URL(req.url);
│   #   const format = searchParams.get('format') ?? 'pdf';
│   #
│   #   // Sprint 4 formats: delegate to existing handlers
│   #   if (['pdf', 'csv', 'json'].includes(format)) return existingExportHandler(req, params);
│   #
│   #   // Sprint 8 formats:
│   #   const currentUser = await getCurrentUser();
│   #   if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
│   #   await setRlsContext(db, currentUser.organizationId);
│   #   const [audit] = await db.select().from(audits).where(eq(audits.id, params.auditId));
│   #   if (!audit) return NextResponse.json({ error: 'Not found' }, { status: 404 });
│   #
│   #   if (format === 'sarif') {
│   #     const sarif = buildSarif(audit);  // lib/exports/sarif.ts
│   #     return new Response(JSON.stringify(sarif, null, 2), {
│   #       headers: { 'Content-Type': 'application/json',
│   #                  'Content-Disposition': `attachment; filename="audit-${params.auditId}.sarif.json"` }
│   #     });
│   #   }
│   #   if (format === 'junit') {
│   #     const xml = buildJunit(audit);  // lib/exports/junit.ts → string
│   #     return new Response(xml, {
│   #       headers: { 'Content-Type': 'application/xml',
│   #                  'Content-Disposition': `attachment; filename="audit-${params.auditId}-junit.xml"` }
│   #     });
│   #   }
│   #   if (format === 'gha') {
│   #     const txt = buildGha(audit);  // lib/exports/gha.ts → string
│   #     return new Response(txt, {
│   #       headers: { 'Content-Type': 'text/plain',
│   #                  'Content-Disposition': `attachment; filename="audit-${params.auditId}-gha.txt"` }
│   #     });
│   #   }
│   #   return NextResponse.json({ error: 'Unknown format' }, { status: 400 });
│   # }
│   # FH5 fix: export route never increments audit_exports.downloadCount.
│   # Add AFTER generating the response body but BEFORE returning it:
│   # await db.insert(auditExports).values({
│   #   auditId: params.auditId, organizationId: currentUser.organizationId,
│   #   format, generatedAt: new Date(), fileSizeBytes: body.length, downloadCount: 1,
│   # }).onConflictDoUpdate({
│   #   target: [auditExports.auditId, auditExports.format],  // unique index needed
│   #   set: { downloadCount: sql`${auditExports.downloadCount} + 1`, generatedAt: new Date() },
│   # });
│   # Note: add uniqueIndex('audit_exports_audit_format_idx').on(table.auditId, table.format)
│   # to the audit_exports table definition to enable the onConflictDoUpdate target.
├── local-seo/[brandId]/route.ts               # NEW
│   # FI2 fix: route listed as #NEW but body never specified.
│   # Returns latest local_seo_results row for the brand (cross-org protected via RLS):
│   # export async function GET(req: Request, { params }: { params: { brandId: string } }) {
│   #   const currentUser = await getCurrentUser();
│   #   if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
│   #   await setRlsContext(db, currentUser.organizationId);
│   #   const [result] = await db.select().from(localSeoResults)
│   #     .where(eq(localSeoResults.brandId, params.brandId))
│   #     .orderBy(desc(localSeoResults.checkedAt)).limit(1);
│   #   if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 });
│   #   return NextResponse.json(result);
│   # }
│   # Note: RLS scopes by organizationId — cross-org returns no rows → 404.
├── drift-alerts/
│   ├── route.ts                               # GET list
│   │   # FJ3 fix: GET list route body never specified (FD5 only covered the page component).
│   │   # export async function GET(req: Request) {
│   │   #   const { searchParams } = new URL(req.url);
│   │   #   const acknowledged = searchParams.get('acknowledged');  // 'true'|'false'|null (all)
│   │   #   const currentUser = await getCurrentUser();
│   │   #   if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
│   │   #   await setRlsContext(db, currentUser.organizationId);
│   │   #   const conditions = [eq(driftAlerts.organizationId, currentUser.organizationId)];
│   │   #   if (acknowledged === 'false') conditions.push(eq(driftAlerts.acknowledged, false));
│   │   #   if (acknowledged === 'true')  conditions.push(eq(driftAlerts.acknowledged, true));
│   │   #   const alerts = await db.select({ ...getTableColumns(driftAlerts), brandName: brands.name })
│   │   #     .from(driftAlerts).innerJoin(brands, eq(driftAlerts.brandId, brands.id))
│   │   #     .where(and(...conditions)).orderBy(desc(driftAlerts.createdAt)).limit(100);
│   │   #   return NextResponse.json({ alerts });
│   │   # }
│   └── [id]/route.ts                          # PATCH acknowledge
│       # FE4 fix: route listed but body never specified. Cross-org protection + timestamps:
│       # export async function PATCH(req: Request, { params }: { params: { id: string } }) {
│       #   const currentUser = await getCurrentUser();
│       #   if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
│       #   await setRlsContext(db, currentUser.organizationId);
│       #
│       #   const [updated] = await db.update(driftAlerts)
│       #     .set({ acknowledged: true, acknowledgedAt: new Date(), updatedAt: new Date() })  // FG3: updatedAt
│       #     .where(eq(driftAlerts.id, params.id))
│       #     .returning({ id: driftAlerts.id });
│       #   // RLS scopes to org — cross-org returns 0 rows → 404
│       #   if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
│       #   return NextResponse.json({ id: updated.id, acknowledged: true });
│       #   // Note: do NOT emit a webhook event for acknowledge — it's a UI action, not an audit event.
│       # }
└── webhooks-config/
    ├── route.ts                               # GET list + POST create per-org
    │   # FF5 fix: POST body never specified. Signing secret generated server-side:
    │   # POST body (Zod): { url: z.string().url(), channel: z.enum([...6 channels]),
    │   #   events: z.array(z.enum(VALID_EVENTS)).min(1) }  // FC4 VALID_EVENTS enum
    │   # Handler:
    │   # const signingSecret = `whsec_${crypto.randomBytes(24).toString('base64url')}`;
    │   # await db.insert(webhookEndpoints).values({
    │   #   organizationId: currentUser.organizationId, url, channel, events, signingSecret, isActive: true
    │   # }).returning();
    │   # Response: { id, url, channel, events, signingSecret }  ← signingSecret shown ONCE on creation
    │   # (never returned again — customer must copy it now; no retrieval endpoint for secret)
    ├── [id]/route.ts                          # PATCH edit + DELETE
    │   # FG4 fix: PATCH and DELETE bodies never specified.
    │   #
    │   # PATCH — editable fields: url, events[], isActive (toggle).
    │   #   Zod: { url?: z.string().url(), events?: z.array(z.enum(VALID_EVENTS)).min(1),
    │   #          isActive?: z.boolean() }
    │   #   signingSecret is NOT editable via PATCH (use dedicated /rotate endpoint if needed).
    │   #   await setRlsContext(db, currentUser.organizationId);
    │   #   await db.update(webhookEndpoints).set({ url, events, isActive, updatedAt: new Date() })
    │   #     .where(and(eq(webhookEndpoints.id, params.id),
    │   #                eq(webhookEndpoints.organizationId, currentUser.organizationId)));
    │   #   // Note: Sprint 8 webhookEndpoints schema needs updatedAt column (add alongside FG3).
    │   #
    │   # DELETE — hard delete (webhook deliveries preserved for audit trail):
    │   #   await setRlsContext(db, currentUser.organizationId);
    │   #   await db.delete(webhookEndpoints)
    │   #     .where(and(eq(webhookEndpoints.id, params.id),
    │   #                eq(webhookEndpoints.organizationId, currentUser.organizationId)));
    │   #   return NextResponse.json({ deleted: true });
    └── [id]/test/route.ts                     # POST test delivery
        # FH4 fix: route listed but body never specified. Sends a synthetic test payload
        # to verify the endpoint URL is reachable and signature verification works:
        # export async function POST(req: Request, { params }: { params: { id: string } }) {
        #   const currentUser = await getCurrentUser();
        #   if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        #   await setRlsContext(db, currentUser.organizationId);
        #   const [endpoint] = await db.select().from(webhookEndpoints)
        #     .where(and(eq(webhookEndpoints.id, params.id),
        #                eq(webhookEndpoints.organizationId, currentUser.organizationId)));
        #   if (!endpoint) return NextResponse.json({ error: 'Not found' }, { status: 404 });
        #
        #   // Send a synthetic 'audit.completed' test payload:
        #   const testPayload: AuditCompletedPayload = {
        #     eventName: 'audit.completed', brandId: 'test', brandName: 'Test Brand',
        #     auditId: 'test', scoreComposite: 72, createdAt: new Date().toISOString(),
        #     url: `${process.env.NEXT_PUBLIC_BASE_URL}/brands/test`,
        #   };
        #   const body = formatForChannel(endpoint.channel, 'audit.completed', testPayload);
        #   const sig = signHmacSha256(JSON.stringify(body), endpoint.signingSecret);
        #   const res = await fetch(endpoint.url, {
        #     method: 'POST',
        #     headers: { 'Content-Type': 'application/json', 'X-VisibleAU-Signature': `sha256=${sig}`,
        #                'X-VisibleAU-Event': 'audit.completed', 'X-VisibleAU-Test': 'true' },
        #     body: JSON.stringify(body),
        #   });
        #   return NextResponse.json({ status: res.status, ok: res.ok });
        # }

components/domain/
├── local-seo/
│   ├── gmb-card.tsx
│   ├── directory-presence-matrix.tsx          # 4-directory grid (+ GMB)
│   ├── nap-consistency-table.tsx
│   └── suburb-coverage-card.tsx
├── drift/
│   ├── drift-alert-card.tsx
│   ├── drift-indicator.tsx                    # used on audit history rows
│   │   # FK2 fix: component spec never written. Appears on Sprint 4 audit-list rows.
│   │   # Props: { brandId: string; auditId: string }  — 'use client' or server-rendered inline
│   │   # Data: reads from drift_alerts WHERE brandId = brandId AND currentAuditId = auditId
│   │   #   (fetched server-side in the audit-list page component, passed as prop)
│   │   # Rendering:
│   │   #   if no alert for this audit → renders nothing (null)
│   │   #   severity='significant_drop' → <Badge tone="danger">↓ Drop</Badge>
│   │   #   severity='significant_rise' → <Badge tone="success">↑ Rise</Badge>
│   │   #   severity='within_noise'    → renders nothing (noise alerts don't reach DB per §6)
│   │   # Pattern: Sprint 4 audit-list page adds a JOIN or subquery on drift_alerts:
│   │   #   LEFT JOIN (SELECT currentAuditId, severity FROM drift_alerts WHERE acknowledged=false)
│   │   #   AS latestDrift ON latestDrift.currentAuditId = audits.id
│   └── drift-comparison.tsx                   # reuses Sprint 4 audit-compare
├── webhooks/
│   ├── webhook-config-form.tsx
│   ├── delivery-history-table.tsx
│   └── channel-picker.tsx
└── exports/
    ├── format-tooltip.tsx                     # explains SARIF/JUnit/GHA in plain language
    └── ci-integration-cta.tsx                 # CTA: "drop SARIF into your CI"

tests/
├── unit/
│   ├── local-seo/
│   │   ├── gmb-check.test.ts
│   │   ├── au-directories.test.ts
│   │   ├── nap-consistency.test.ts
│   │   └── suburb-coverage.test.ts
│   ├── drift/
│   │   ├── significance.test.ts               # 20+ Wilson CI overlap cases
│   │   ├── detect.test.ts
│   │   └── severity.test.ts
│   ├── confidence-labels/
│   │   └── classify.test.ts
│   ├── exports/
│   │   ├── sarif.test.ts                      # JSON Schema validation
│   │   ├── junit.test.ts                      # valid XML
│   │   └── gha.test.ts
│   └── webhooks/
│       ├── sign.test.ts
│       ├── deliver.test.ts (with msw mock)
│       └── channels/                          # 5 channel format tests
└── integration/
    ├── local-seo/full-audit.test.ts
    ├── drift/detect-on-complete.test.ts
    └── webhooks/end-to-end-delivery.test.ts   # uses msw to mock Slack/Discord/etc.
```

---

**FO2 fix — `bulk_operations` table listed in barrel exports and project structure but schema never written:**

```typescript
// db/schema/bulk-operations.ts
export const bulkOperations = pgTable('bulk_operations', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  operationType: text('operation_type').notNull(),  // 'reaudit' | 'csv_export' | 'ga4_push' | 'sarif_export'
  status: text('status').default('pending').notNull(),  // 'pending' | 'running' | 'complete' | 'failed'
  totalBrands: integer('total_brands').default(0).notNull(),
  completedBrands: integer('completed_brands').default(0).notNull(),
  failedBrands: integer('failed_brands').default(0).notNull(),
  inputParams: jsonb('input_params').default('{}').notNull(),  // { brandIds, dateRange, format, etc. }
  outputUrl: text('output_url'),                               // download URL when complete (CSV/export)
  errorMessage: text('error_message'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
// RLS: ENABLE with org_isolation policy (same pattern as all Sprint 8 tenant tables).
```

### `local_seo_results.ts`

```typescript
import { pgTable, uuid, text, boolean, numeric, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';
// FA1 fix: gmbPresent was text('gmb_present').default('false') — boolean stored as string.
// Same EA1 bug from Sprint 7. All boolean columns corrected to boolean() type.

export const localSeoResults = pgTable('local_seo_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  brandId: uuid('brand_id').references(() => brands.id).notNull(),
  // FB1 fix: organizationId missing — FA3 said ENABLE RLS (tenant data) but without this column
  // the standard RLS policy (organization_id = current_setting(...)) cannot work.
  // FA4 persist also calls setRlsContext(db, organizationId) but had no org column to filter on.
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),

  gmbPresent: boolean('gmb_present').default(false).notNull(),  // FA1 fix: was text
  gmbCompleteness: numeric('gmb_completeness', { precision: 5, scale: 2 }),  // 0-100
  gmbReviewCount: integer('gmb_review_count').default(0).notNull(),
  gmbAvgRating: numeric('gmb_avg_rating', { precision: 3, scale: 2 }),

  directoryPresence: jsonb('directory_presence').default('[]').notNull(),
  // Shape: [{ directory: 'hipages', present: bool, url, reviewCount, avgRating }, ...]
  // 4 directories: hipages, yellow_pages_au, service_seeking, word_of_mouth

  napConsistency: numeric('nap_consistency', { precision: 5, scale: 2 }),  // 0-100
  // FB4 fix: napConsistency formula never specified.
  // Checks name, address, phone across: customer site + GMB + 4 AU directories = up to 6 sources.
  // Per field (name/address/phone): score = matchingPairs / totalPairs × 100
  //   matchingPairs = number of source pairs that agree (normalised string match)
  //   totalPairs = n*(n-1)/2 where n = sources that have this field
  // napConsistency = mean of (nameScore + addressScore + phoneScore) / 3
  // Example: 3 sources agree on phone, 1 differs → 3 matching out of 3 total pairs → 100%
  // Normalisation: strip spaces/dashes from phone; lowercase+trim name; normalise address abbreviations
  // FI4 fix: "normalise address abbreviations" never specified — without this, "14 King St" vs
  // "14 King Street" scores as mismatch. AU address abbreviation map:
  // const AU_ADDRESS_ABBREV: Record<string, string> = {
  //   '\\bst\\b': 'street', '\\brd\\b': 'road', '\\bave\\b': 'avenue', '\\bav\\b': 'avenue',
  //   '\\bdr\\b': 'drive', '\\bct\\b': 'court', '\\bcl\\b': 'close', '\\bpl\\b': 'place',
  //   '\\bcr\\b': 'crescent', '\\bhwy\\b': 'highway', '\\bpde\\b': 'parade',
  //   '\\blane\\b': 'lane', '\\bblvd\\b': 'boulevard', '\\bterr\\b': 'terrace',
  // };
  // normaliseAddress(addr: string): string {
  //   let s = addr.toLowerCase().trim();
  //   for (const [abbrev, full] of Object.entries(AU_ADDRESS_ABBREV)) {
  //     s = s.replace(new RegExp(abbrev, 'gi'), full);
  //   }
  //   return s.replace(/\s+/g, ' ').trim();
  // }
  napFindings: jsonb('nap_findings').default('[]').notNull(),
  // [{ source, name, address, phone, matches: { name, address, phone } }, ...]

  suburbCoverage: jsonb('suburb_coverage').default('[]').notNull(),
  // [{ suburb, mentionedInContent: bool, mentionedInMeta: bool, mentionedInSchema: bool }, ...]

  scoreComposite: numeric('score_composite', { precision: 5, scale: 2 }),
  // FF2 fix: scoreComposite formula never specified. Weighted composite of 4 sub-scores:
  //   GMB completeness (0-100):  weight 30% — primary local signal, highest LLM impact
  //   NAP consistency (0-100):   weight 30% — cross-source consistency = entity trust
  //   Directory coverage (0-100): weight 25% — % of 4 directories present (presenceCount/4 × 100)
  //   Suburb coverage (0-100):    weight 15% — % of primaryRegions mentioned in content
  // scoreComposite = (gmb × 0.30) + (nap × 0.30) + (directory × 0.25) + (suburb × 0.15)
  // Computed in lib/local-seo/score.ts → computeLocalSeoScore({ gmb, directories, nap, suburbs })

  checkedAt: timestamp('checked_at', { withTimezone: true }).defaultNow().notNull(),
  // FO5 fix: createdAt missing from local_seo_results — every other Sprint 8 table has it;
  // createdAt is the Foundations standard for immutable row creation timestamp:
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

### `drift_alerts.ts`

```typescript
export const driftAlerts = pgTable('drift_alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  brandId: uuid('brand_id').references(() => brands.id).notNull(),
  currentAuditId: uuid('current_audit_id').references(() => audits.id).notNull(),
  previousAuditId: uuid('previous_audit_id').references(() => audits.id).notNull(),
  severity: text('severity').notNull(),  // 'significant_drop' | 'significant_rise' | 'within_noise'
  scoreDelta: numeric('score_delta', { precision: 6, scale: 2 }),
  dimensionDeltas: jsonb('dimension_deltas').default('{}').notNull(),
  // { frequency: { delta, significant: bool, currentCI, previousCI }, ... }
  acknowledged: boolean('acknowledged').default(false).notNull(),  // FA1 fix: was text
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  // FG3 fix: updatedAt missing from drift_alerts. PATCH acknowledge modifies the row but
  // there was no general audit timestamp. Follows Foundations pattern (every mutable row needs updatedAt):
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

Index on `(organizationId, acknowledged)` and `(brandId, createdAt DESC)`.

**FN3 fix — indexes were specified in prose but never added to Drizzle schema definition. Add to `drift_alerts.ts`:**
```typescript
import { pgTable, uuid, text, boolean, numeric, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
// In the pgTable second argument (table factory):
}, (table) => ({
  orgAcknowledgedIdx: index('drift_alerts_org_acknowledged_idx').on(table.organizationId, table.acknowledged),
  brandCreatedIdx:    index('drift_alerts_brand_created_idx').on(table.brandId, table.createdAt),
}));

### `webhook_endpoints.ts`

```typescript
export const webhookEndpoints = pgTable('webhook_endpoints', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  url: text('url').notNull(),
  channel: text('channel').notNull(),     // 'slack' | 'discord' | 'sheets' | 'airtable' | 'email' | 'custom'
  events: text('events').array().notNull(),
  // FC4 fix: events stored as free-text strings with no validation.
  // 'audit.complete' (typo) vs 'audit.completed' (canonical) = silent miss.
  // Canonical delivery event taxonomy (NOTE: uses DOTS, not slashes — distinct from
  // internal Inngest events 'audit/complete' which use slashes):
  // 'audit.completed' | 'audit.score.dropped' | 'audit.score.changed'
  // | 'drift.detected' | 'recommendation.created'
  // Validate on insert with Zod in the POST /api/webhooks-config route:
  // const VALID_EVENTS = ['audit.completed', 'audit.score.dropped', 'audit.score.changed',
  //   'drift.detected', 'recommendation.created'] as const;
  // z.array(z.enum(VALID_EVENTS)).min(1)
  signingSecret: text('signing_secret').notNull(),  // generated whsec_*
  isActive: boolean('is_active').default(true).notNull(),  // FA1 fix: was text
  lastDeliveryAt: timestamp('last_delivery_at', { withTimezone: true }),
  lastDeliveryStatus: text('last_delivery_status'),  // 'success' | 'failed' | etc.
  // FG4 fix: updatedAt needed — PATCH route edits this row; follows Foundations mutable-row pattern:
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

### `webhook_deliveries.ts` (delivery audit log)

```typescript
export const webhookDeliveries = pgTable('webhook_deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  endpointId: uuid('endpoint_id').references(() => webhookEndpoints.id).notNull(),
  // FD4 fix: no organizationId — FA3 said ENABLE RLS but Supabase cannot easily join
  // through endpointId → webhook_endpoints.organizationId in a row-level policy.
  // Fix: denormalise organizationId directly into webhook_deliveries (standard pattern).
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  event: text('event').notNull(),
  payload: jsonb('payload').notNull(),
  attemptNumber: integer('attempt_number').default(1).notNull(),
  responseStatus: integer('response_status'),
  responseBody: text('response_body'),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  failedAt: timestamp('failed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
// FD4 RLS SQL for webhook_deliveries:
// ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "org_isolation" ON webhook_deliveries
//   USING (organization_id = current_setting('app.current_organization_id')::uuid);
```

Migrate:
```bash
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

**FA3 fix — barrel exports and `db/client.ts` never specified (recurring gap: Sprint 5 CH2, Sprint 6 DA4, Sprint 7 EB1):**

**FI3 fix — RLS migration SQL never shown for drift_alerts and audit_exports (FA3 said ENABLE but no SQL):**
```sql
-- drift_alerts: tenant data, org-scoped
ALTER TABLE drift_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON drift_alerts
  USING (organization_id = current_setting('app.current_organization_id')::uuid);

-- audit_exports: tenant data, org-scoped
ALTER TABLE audit_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON audit_exports
  USING (organization_id = current_setting('app.current_organization_id')::uuid);

-- local_seo_results: tenant data, org-scoped
ALTER TABLE local_seo_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON local_seo_results
  USING (organization_id = current_setting('app.current_organization_id')::uuid);

-- webhook_endpoints + webhook_deliveries: tenant data (already noted in FD4, shown here for completeness)
ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON webhook_endpoints
  USING (organization_id = current_setting('app.current_organization_id')::uuid);
ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON webhook_deliveries
  USING (organization_id = current_setting('app.current_organization_id')::uuid);
```

```typescript
// Add to db/schema/index.ts:
export * from './local-seo-results';
export * from './drift-alerts';
export * from './webhook-endpoints';
export * from './webhook-deliveries';
export * from './audit-exports';  // FM4 fix: missing from original FA3 list (added in FB6, never propagated)
export type LocalSeoResult = InferSelectModel<typeof localSeoResults>;
export type DriftAlert = InferSelectModel<typeof driftAlerts>;
export type WebhookEndpoint = InferSelectModel<typeof webhookEndpoints>;
export type WebhookDelivery = InferSelectModel<typeof webhookDeliveries>;
export type AuditExport = InferSelectModel<typeof auditExports>;  // FM4 fix

// Add to db/client.ts schema object:
// localSeoResults, driftAlerts, webhookEndpoints, webhookDeliveries, auditExports

// RLS policy matrix:
// local_seo_results → ENABLE (tenant data, has brandId via organizationId join)
// drift_alerts → ENABLE (has organizationId)
// webhook_endpoints → ENABLE (has organizationId)
// webhook_deliveries → ENABLE (references webhook_endpoints which is org-scoped)
// audit_exports → ENABLE if it has organizationId; otherwise DISABLE if global
```

Also add `detectDriftFn`, `localSeoAuditFn`, and `deliverWebhookFn` to `app/api/inngest/route.ts` `serve()` array (same pattern as Sprint 6 DB5 + Sprint 7 EA3).

---

## 6. Drift detection math (PRD §8 Module 7 alert triggers + §10 Layer 2 canary; Wilson CI overlap original)

Wilson CI overlap from Sprint 3 already computed per dimension. Sprint 8 uses it:

**FO4 fix — `computeWilsonCI` / jsonb unpack pattern never specified. Sprint 3 stores:**
```typescript
// In audits.confidenceIntervals (Sprint 3 FB5 fix):
// { frequency: { lower: 0.12, upper: 0.38 }, position: { lower: 0.45, upper: 0.71 }, ... }
// Sprint 8 detect-drift.ts unpacks this for each dimension:

function getCI(confidenceIntervals: Record<string, { lower: number; upper: number }> | null,
               dimension: string): CI {
  const ci = confidenceIntervals?.[dimension];
  if (!ci) {
    // FO4: if no CI stored (e.g. older audit before Sprint 3), default to wide CI so
    // ciOverlaps always returns true (conservative — never false-positive on drift):
    return { lower: 0, upper: 1 };
  }
  // Sprint 3 stores as proportions (0-1); convert to 0-100 scale for clarity:
  return { lower: ci.lower * 100, upper: ci.upper * 100 };
}
// Usage in detect-drift.ts: getCI(currentAudit.confidenceIntervals, 'frequency')
```

```typescript
// lib/drift/significance.ts
interface CI { lower: number; upper: number; }

export function ciOverlaps(a: CI, b: CI): boolean {
  return !(a.upper < b.lower || b.upper < a.lower);
}

export function classifySeverity(
  currentScore: number,
  previousScore: number,
  currentCI: CI,
  previousCI: CI
): 'significant_drop' | 'significant_rise' | 'within_noise' {
  if (ciOverlaps(currentCI, previousCI)) return 'within_noise';
  return currentScore < previousScore ? 'significant_drop' : 'significant_rise';
}
```

```typescript
// inngest/functions/detect-drift.ts
export const detectDriftFn = inngest.createFunction(
  { id: 'detect-drift' },
  // FA2 fix: was { event: 'audit.complete' } (dot syntax). Sprint 2/3 fires 'audit/complete'
  // (slash syntax — Inngest convention). Sprint 6 DA3 established the canonical.
  // Same Inngest fan-out pattern: both detect-drift AND generate-recommendations listen to audit/complete.
  { event: 'audit/complete' },
  async ({ event, step }) => {
    const { auditId, brandId, organizationId } = event.data;

    const [currentAudit, previousAudit] = await step.run('load-audits', async () => {
      await setRlsContext(db, organizationId);
      const [current] = await db.select().from(audits)
        .where(eq(audits.id, auditId));
      // FB5 fix (Wilson CI source): confidenceIntervals is Sprint 3 jsonb: { frequency: { lower, upper }, ... }
      const [previous] = await db.select().from(audits)
        .where(and(eq(audits.brandId, brandId), ne(audits.id, auditId), eq(audits.status, 'complete')))
        .orderBy(desc(audits.createdAt)).limit(1);
      return [current, previous ?? null];
    });

    if (!previousAudit) return { skipped: true, reason: 'first_audit_no_comparison' };

    const compositeSeverity = await step.run('compute-composite', () => {
      // FC1 fix: composite score has no Wilson CI (it's a derived sum, not a Binomial proportion).
      // The original code used ciOverlaps({lower:0,upper:100},{lower:0,upper:100}) which ALWAYS
      // returns true → composite drift always classified as 'within_noise', never alerting.
      // Fix: use raw score delta with a minimum threshold instead:
      const delta = Number(currentAudit.scoreComposite) - Number(previousAudit.scoreComposite);
      const COMPOSITE_NOISE_THRESHOLD = 5;  // <5pt delta = within noise for composite
      if (Math.abs(delta) < COMPOSITE_NOISE_THRESHOLD) return 'within_noise';
      return delta < 0 ? 'significant_drop' : 'significant_rise';
    });

    const dimensionDeltas = await step.run('compute-dimensions', () => {
      // FB5 fix: unpack confidenceIntervals jsonb from Sprint 3 format:
      // { frequency: { lower, upper }, position: { lower, upper }, ... }
      const dims = ['frequency', 'position', 'sentiment', 'context', 'accuracy'] as const;
      const currentCIs  = (currentAudit.confidenceIntervals  as Record<string, { lower: number; upper: number }>) ?? {};
      const previousCIs = (previousAudit.confidenceIntervals as Record<string, { lower: number; upper: number }>) ?? {};
      const currentScores  = currentAudit.scores  as Record<string, number> ?? {};
      const previousScores = previousAudit.scores as Record<string, number> ?? {};

      return Object.fromEntries(dims.map(dim => {
        const severity = classifySeverity(
          currentScores[dim]  ?? 50, previousScores[dim] ?? 50,
          currentCIs[dim]  ?? { lower: 0, upper: 100 },
          previousCIs[dim] ?? { lower: 0, upper: 100 },
        );
        return [dim, {
          delta: (currentScores[dim] ?? 50) - (previousScores[dim] ?? 50),
          severity,
          currentCI:  currentCIs[dim]  ?? null,
          previousCI: previousCIs[dim] ?? null,
        }];
      }));
    });

    const hasSignificant = compositeSeverity !== 'within_noise'
      || Object.values(dimensionDeltas).some(d => d.severity !== 'within_noise');

    if (!hasSignificant) return { skipped: true, reason: 'within_noise' };

    await step.run('persist-alert', async () => {
      await setRlsContext(db, organizationId);
      await db.insert(driftAlerts).values({
        organizationId, brandId,
        currentAuditId: auditId,
        previousAuditId: previousAudit.id,
        severity: compositeSeverity,
        scoreDelta: Number(currentAudit.scoreComposite) - Number(previousAudit.scoreComposite),
        dimensionDeltas,
      });
    });

    await inngest.send({ name: 'drift/detected', data: { brandId, organizationId, auditId } });
  }
);
```

---

## 7. Webhook delivery pipeline

```typescript
// inngest/functions/deliver-webhook.ts
export const deliverWebhookFn = inngest.createFunction(
  // FD1 fix: §1 said "1m/5m/30m/2h/8h" but { retries: 5 } uses Inngest's DEFAULT backoff
  // (30s, 1m, 5m, 30m, ~1h). The custom schedule in §1 was aspirational.
  // Use Inngest default: simpler, well-tested, and close enough to the desired schedule.
  // lib/webhooks/retry.ts purpose: handles DEAD-LETTER logic only —
  //   after 5 Inngest failures, marks endpoint.lastDeliveryStatus='failed';
  //   if endpoint has 5+ consecutive failures, sets isActive=false (dead endpoint).
  //   This is NOT a retry queue — Inngest handles retries; retry.ts handles post-failure cleanup.
  { id: 'deliver-webhook', retries: 5 },
  { event: 'webhook.deliver' },   // emitted by fanout-webhooks.ts (FH1)
  // FN5 fix: deliver-webhook.ts never persisted delivery results to webhook_deliveries.
  // The FN2 fix above adds try/catch that inserts to webhook_deliveries on both success and failure.
  // This is the only place webhook_deliveries rows are written — not in a separate step.
  // Success insert: { endpointId, organizationId, event, payload, responseStatus, deliveredAt }
  // Failure insert: { endpointId, organizationId, event, payload, failedAt } (no responseStatus)
  async ({ event, step }) => {
    const { endpointId, eventName, payload } = event.data;
    // FB3 fix: loadEndpoint and formatForChannel were undefined — both specified here:
    //
    // loadEndpoint: simple DB query on webhookEndpoints:
    // FO1 fix: original had no setRlsContext — webhookEndpoints has RLS ENABLED; without context
    // query returns 0 rows → endpoint is undefined → function crashes before any delivery.
    // async function loadEndpoint(id: string, organizationId: string) {
    //   await setRlsContext(db, organizationId);
    //   const [ep] = await db.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, id));
    //   return ep ?? null;
    // }
    // deliver-webhook.ts passes event.data.organizationId to loadEndpoint.
    //
    // formatForChannel: routing switch to channel-specific formatters:
    // function formatForChannel(channel: string, eventName: string, payload: unknown) {
    //   switch (channel) {
    //     case 'slack':   return formatSlack(eventName, payload);    // lib/webhooks/channels/slack.ts
    //     case 'discord': return formatDiscord(eventName, payload);  // lib/webhooks/channels/discord.ts
    //     case 'sheets':  return formatSheets(eventName, payload);   // lib/webhooks/channels/sheets.ts
    //     case 'airtable': return formatAirtable(eventName, payload);// lib/webhooks/channels/airtable.ts
    //     case 'email':   return formatEmail(eventName, payload);    // lib/webhooks/channels/email.ts
    //     case 'custom':  return payload;  // pass through unchanged
    //     default: return payload;
    //   }
    // }
    const endpoint = await loadEndpoint(endpointId);
    if (!endpoint?.isActive) return;

    const formattedBody = formatForChannel(endpoint.channel, eventName, payload);
    const signature = signHmacSha256(JSON.stringify(formattedBody), endpoint.signingSecret);

    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VisibleAU-Signature': signature,
        'X-VisibleAU-Event': eventName,
      },
      body: JSON.stringify(formattedBody),
    });

    // Persist delivery row + update endpoint last_delivery_status
    // Throw on 5xx so Inngest retries with exponential backoff
    // FN2 fix: deliver-webhook.ts never called handleDeliveryFailure — dead-letter cleanup unreachable.
    // After all Inngest retries exhausted, Inngest fires the function one final time.
    // Wrap the deliver() call to catch final failure and trigger dead-letter cleanup:
    // try {
    //   const result = await deliver(endpoint.url, formattedBody, signature, eventName);
    //   await db.insert(webhookDeliveries).values({ endpointId, organizationId, event: eventName,
    //     payload: formattedBody, responseStatus: result.status, deliveredAt: new Date() });
    //   await db.update(webhookEndpoints).set({ lastDeliveryStatus: 'success', lastDeliveryAt: new Date() })
    //     .where(eq(webhookEndpoints.id, endpointId));
    // } catch (err) {
    //   await db.insert(webhookDeliveries).values({ endpointId, organizationId, event: eventName,
    //     payload: formattedBody, failedAt: new Date() });
    //   await handleDeliveryFailure(endpointId);  // from retry.ts — checks consecutive failures
    //   throw err;  // re-throw so Inngest retries (or marks as failed after retries exhausted)
    // }
  }
);
```

Channels format payload differently:
- **Slack**: `{ text: "Audit completed for Bondi Plumbing", blocks: [...] }`
- **Discord**: `{ content: "...", embeds: [...] }`
- **Sheets**: append row via Apps Script web app URL
- **Airtable**: POST to base + table endpoint with API key in URL
- **Custom HTTP**: pass payload through unchanged

---

## 8. Claude Code prompt (paste this when starting Sprint 8)

```
We're building VisibleAU Sprint 8: Local SEO + Drift + Exports + Webhooks. Sprint 7 shipped
Module 5b technical infrastructure. Sprint 8 layers Module 4 (Local SEO) + makes the audit
results useful for ongoing monitoring (drift) + actionable in customer workflows (webhooks).

Most important constraint: drift detection uses Wilson CI overlap. If CIs overlap, do NOT
alert. This is the false-positive guard against natural LLM run-to-run variance.

Sprint 8 deliverables, in order:

1. SCHEMA
   - 5 new tables per §5
   - Migrate

2. LOCAL SEO (Module 4)
   - lib/local-seo/* per §4
   - inngest/functions/local-seo-audit.ts triggered by `audit/complete` (FA2: slash not dot)
   - 4 AU directories: Hipages, Yellow Pages AU, ServiceSeeking, Word of Mouth (PRD §11 Sprint 8 canonical)
   - NAP consistency across site + GMB + directories
   - Suburb coverage report
   - /brands/[id]/local-seo page
   - **FE3 fix — `local-seo/page.tsx` server component never specified:**
     ```tsx
     // app/(auth)/brands/[brandId]/local-seo/page.tsx — server component
     export default async function LocalSeoPage({ params }: { params: { brandId: string } }) {
       const currentUser = await getCurrentUser();
       if (!currentUser) redirect('/sign-in');
       await setRlsContext(db, currentUser.organizationId);

       const [latestResult] = await db.select().from(localSeoResults)
         .where(eq(localSeoResults.brandId, params.brandId))
         .orderBy(desc(localSeoResults.checkedAt)).limit(1);

       if (!latestResult) return (
         <EmptyState message="No Local SEO data yet. Local SEO runs automatically after each audit." />
       );

       // Prototype shows 4 KPI cards: score, NAP consistency %, directory coverage N/5, GMB completeness %
       // All data read from latestResult — no additional queries
       return <LocalSeoDashboardView result={latestResult} />;
     }
     // LocalSeoDashboardView: pure display component ('use server' compatible, no client events needed)
     // Renders: 4 KPI cards + GMB card + NAP signals table + directory matrix + suburb coverage list
     ```
     ```typescript
     export const localSeoAuditFn = inngest.createFunction(
       { id: 'local-seo-audit' },
       { event: 'audit/complete' },
       async ({ event, step }) => {
         const { auditId, brandId, organizationId } = event.data;
         const brand = await step.run('load-brand', () =>
           db.select().from(brands).where(eq(brands.id, brandId)).then(r => r[0]));

         const [gmb, directories, nap, suburbs] = await Promise.all([
           step.run('check-gmb',        () => checkGmb(brand.domain, brand.name)),
           step.run('check-directories',() => checkAuDirectories(brand.domain, brand.name)),
           step.run('check-nap',        () => {
           // FN1 fix: FA4 called checkNapConsistency(brand, gmb, directories) — 3 args.
           // FJ4 defined the function as (sources: NapSource[]) — 1 array arg. Mismatch.
           // FO3 fix: brands table has no phone or address columns (Sprint 4 brand form only
           // collects name, domain, vertical, primaryRegions, competitors — not NAP fields).
           // Website NAP is extracted from the crawl result (structured data / footer scrape):
           const napSources: import('@/lib/local-seo/nap-consistency').NapSource[] = [
             // website NAP from crawl (LocalBusiness schema or footer text):
             { label: 'website',
               name: crawl.structuredData?.name ?? brand.name,
               address: crawl.structuredData?.address ?? '',
               phone: crawl.structuredData?.phone ?? '' },
             ...(gmb.present ? [{ label: 'gmb', name: gmb.name ?? '', address: gmb.address ?? '', phone: gmb.phone ?? '' }] : []),
             ...directories.filter(d => d.present && d.name).map(d => ({
               label: d.directory, name: d.name ?? '', address: d.address ?? '', phone: d.phone ?? ''
             })),
           ];
           return checkNapConsistency(napSources);
         }),
           step.run('check-suburbs',    () => checkSuburbCoverage(brand.domain, brand.primaryRegions ?? [])),
         ]);

         const scoreComposite = computeLocalSeoScore({ gmb, directories, nap, suburbs });
         await step.run('persist', async () => {
           await setRlsContext(db, organizationId);
           await db.insert(localSeoResults).values({
             brandId, organizationId,
             gmbPresent: gmb.present, gmbCompleteness: gmb.completeness,
             gmbReviewCount: gmb.reviewCount, gmbAvgRating: gmb.avgRating,
             directoryPresence: directories, napConsistency: nap.score,
             napFindings: nap.findings, suburbCoverage: suburbs, scoreComposite,
           });
         });
       }
     );
     ```

3. DRIFT DETECTION
   - lib/drift/significance.ts per §6 (Wilson CI overlap)
   - inngest/functions/detect-drift.ts triggered by `audit/complete` (FA2: slash not dot)
   - /drift-alerts page with acknowledge UX
   - Drift indicator on brand detail audit history rows
   - **FD5 fix — `drift-alerts/page.tsx` server component never specified:**
     ```tsx
     // app/(auth)/drift-alerts/page.tsx — server component
     export default async function DriftAlertsPage() {
       const currentUser = await getCurrentUser();
       if (!currentUser) redirect('/sign-in');
       await setRlsContext(db, currentUser.organizationId);

       const [activeCount, weekCount, resolvedCount, activeAlerts] = await Promise.all([
         // KPI counts matching prototype 3-card header:
         db.select({ count: sql<number>`count(*)::int` }).from(driftAlerts)
           .where(and(eq(driftAlerts.organizationId, currentUser.organizationId),
                      eq(driftAlerts.acknowledged, false))),
         db.select({ count: sql<number>`count(*)::int` }).from(driftAlerts)
           .where(and(eq(driftAlerts.organizationId, currentUser.organizationId),
                      gte(driftAlerts.createdAt, sql`NOW() - INTERVAL '7 days'`))),
         db.select({ count: sql<number>`count(*)::int` }).from(driftAlerts)
           .where(and(eq(driftAlerts.organizationId, currentUser.organizationId),
                      eq(driftAlerts.acknowledged, true),
                      gte(driftAlerts.acknowledgedAt, sql`NOW() - INTERVAL '30 days'`))),
         // Alert list — unacknowledged only, newest first, JOIN brands for name:
         db.select({ ...getTableColumns(driftAlerts), brandName: brands.name })
           .from(driftAlerts).innerJoin(brands, eq(driftAlerts.brandId, brands.id))
           .where(and(eq(driftAlerts.organizationId, currentUser.organizationId),
                      eq(driftAlerts.acknowledged, false)))
           .orderBy(desc(driftAlerts.createdAt)).limit(50),
       ]);

       return <DriftAlertsView
         activeCount={activeCount[0].count} weekCount={weekCount[0].count}
         resolvedCount={resolvedCount[0].count} alerts={activeAlerts} />;
     }
     // DriftAlertsView 'use client' — handles PATCH /api/drift-alerts/[id] acknowledge calls
     ```

4. CONFIDENCE LABELS (shared module)
   - lib/confidence-labels/* moved out of Sprint 6's inline definition
   - Sprint 6 Action Center + Sprint 8 audit-result dimension cards share the same rules
   - **FC2 fix — no migration plan specified. Refactor path:**
     1. Create `lib/confidence-labels/classify.ts` with `classifyConfidence(key: string): 'confirmed'|'likely'|'hypothesis'`
     2. Create `lib/confidence-labels/rules.ts` with score-to-label thresholds (FC5 fix below)
     3. In Sprint 6's `lib/recommendations/confidence-labels.ts`: replace inline `CONFIDENCE_LEVELS` map with `import { classifyConfidence } from '@/lib/confidence-labels/classify'`
     4. Sprint 8 audit-result dimension cards call the same `classifyConfidence` function
     5. Backwards compatible: existing Sprint 6 recommendation classifications are unchanged
     **Note:** Sprint 6 classifies by `recommendationKey` (e.g. `'wikipedia-article'`). Sprint 8 classifies by **dimension score** (e.g. frequency=67 → 'confirmed'). These are two different classification axes both using the same three labels — the shared module must support both.

5. EXPORT FORMATS
   - lib/exports/sarif.ts (validates against SARIF v2.1.0 JSON Schema)
   - **FA5 fix — SARIF structure never specified; non-compliant output fails acceptance test:**
     ```typescript
     // Canonical SARIF v2.1.0 structure for a VisibleAU audit:
     {
       "$schema": "https://schemastore.azurewebsites.net/schemas/json/sarif-2.1.0.json",
       "version": "2.1.0",
       "runs": [{
         "tool": {
           "driver": {
             "name": "VisibleAU",
             "version": "1.0.0",
             "rules": [
               // One rule per scoring dimension:
               { "id": "VA001", "name": "FrequencyScore",
                 "shortDescription": { "text": "AI mention frequency dimension score" },
                 "helpUri": "https://visibleau.com/docs/scoring#frequency" },
               // ... VA002-VA005 for Position, Sentiment, Context, Accuracy
             ]
           }
         },
         "results": [
           // One result per dimension that falls below threshold (score < 50):
           { "ruleId": "VA001",
             "level": "warning",  // 'error' if score < 30, 'warning' if 30-49, 'note' if 50-69
             "message": { "text": "Frequency score 24/100 — brand rarely appears in AI responses" },
             "locations": [{
               "physicalLocation": {
                 "artifactLocation": { "uri": "https://bondiplumbing.com.au", "uriBaseId": "%SRCROOT%" }
               }
             }]
           }
         ],
         "invocations": [{ "executionSuccessful": true }]
       }]
     }
     ```
     Validate with: `import { validate } from '@cfworker/json-schema'` (dev dep). Acceptance test asserts no validation errors.
   - lib/exports/junit.ts (XML parseable by Jest reporters)
   - lib/exports/gha.ts (::warning::/::error:: annotations)
   - app/api/audits/[auditId]/export/route.ts extended for format=sarif|junit|gha
   - Sprint 4's "Coming Sprint 8" stubs now work

6. WEBHOOK INTEGRATIONS
   - lib/webhooks/* with 6 channel adapters
   - inngest/functions/deliver-webhook.ts with retry logic
   - /settings/webhooks page (add endpoint, pick events, test delivery)
   - Webhook recipe pages at /docs/integrations/{zapier,n8n,make-com,slack,discord,sheets,airtable}
   - **FE5 fix — `settings/webhooks/page.tsx` server component never specified:**
     ```tsx
     // app/(auth)/settings/webhooks/page.tsx — server component
     export default async function WebhooksSettingsPage() {
       const currentUser = await getCurrentUser();
       if (!currentUser) redirect('/sign-in');
       await setRlsContext(db, currentUser.organizationId);

       // Load existing endpoints + last 5 deliveries per endpoint:
       const endpoints = await db.select().from(webhookEndpoints)
         .where(eq(webhookEndpoints.organizationId, currentUser.organizationId))
         .orderBy(desc(webhookEndpoints.createdAt));

       // Recent delivery history across all endpoints (last 20):
       const recentDeliveries = await db.select().from(webhookDeliveries)
         .where(eq(webhookDeliveries.organizationId, currentUser.organizationId))
         .orderBy(desc(webhookDeliveries.createdAt)).limit(20);

       return <WebhooksSettingsView
         endpoints={endpoints} recentDeliveries={recentDeliveries}
         validEvents={VALID_EVENTS} />;  // FC4: VALID_EVENTS enum
     }
     // WebhooksSettingsView is 'use client' — handles:
     //   POST /api/webhooks-config (create), PATCH /api/webhooks-config/[id] (edit/toggle),
     //   DELETE /api/webhooks-config/[id], POST /api/webhooks-config/[id]/test (test delivery)
     ```

7. TIKTOK PLACEHOLDER
   - Cited-sources view: add grayed-out "TikTok" badge with "Coming v1.1" tooltip
   - Don't actually parse TikTok (deferred to v1.1)

8. ATTRIBUTIONS.md UPDATE
   - Foglift (MIT) — webhook event taxonomy + 6-channel pattern

9. TESTS
   - Unit per §4 (especially Wilson CI overlap edge cases — 20+ test cases)
   - Integration: 2-audit drift detection, full webhook delivery via msw
   - E2E: configure Slack webhook, run audit, verify message arrives at mock server
   - SARIF: validate against JSON Schema in tests
   - Regression: 50-site corpus still passes Spearman > 0.7 after Sprint 8 changes

POTENTIAL BLOCKERS:
- GMB scraping ToS — use official Places API where possible, document fallback approach
- AU directory scraping ToS — same caution; cache aggressively, respect robots.txt
- SARIF schema strictness — validate every field against the v2.1.0 spec
- Webhook retries — Inngest handles backoff, but be careful not to retry 4xx (those are config errors, not transient)

Start with step 1. After schema migrates, step 2 (Local SEO) before drift (step 3) so audit.complete
event-chain ordering is predictable: local-seo-audit → detect-drift → deliver-webhook.
```

---

## 9. Tests required

- Unit: per §4 file tree (~25 test files)
- Integration: drift detection on 2 consecutive audits; webhook delivery with msw mocks
- E2E: configure each webhook channel + run audit + verify delivery
- Regression: 50-site corpus passes Spearman > 0.7

---

## 10. Acceptance criteria

- [ ] Local SEO audit runs after every `audit/complete` (FA2: slash not dot)
- [ ] 4 AU directories tracked correctly (Hipages, YPAU, SS, WoM)
- [ ] NAP consistency reports inconsistencies with source attribution
- [ ] Suburb coverage report per primary region
- [ ] Drift detection: within-noise drift does NOT alert
- [ ] Drift detection: significant drop creates `drift_alerts` row
- [ ] SARIF export validates against v2.1.0 JSON Schema
- [ ] JUnit export parses with standard XML parsers
- [ ] GHA output renders as inline annotation in test runs
- [ ] Slack webhook: configure → run audit → message arrives
- [ ] Webhook signature verified server-side (test rejects tampered payloads)
- [ ] TikTok placeholder shows in cited-sources UI with "Coming v1.1"
- [ ] `fanout-webhooks.ts` registered in serve() — end-to-end: run audit → drift detected → Slack message arrives (FH1 fan-out verified)
- [ ] Test delivery endpoint returns `{ ok: true }` for a valid Slack webhook URL (FH4)
- [ ] Wilson CI significance tests pass with 20+ edge cases (equal CIs, non-overlapping, partial overlap, composite threshold)
- [ ] `audit_exports.downloadCount` increments on each SARIF/JUnit/GHA download; verify via DB query (FH5)
- [ ] No regression on Sprint 1-7 tests; corpus Spearman > 0.7

---

## 11. Common pitfalls / Sprint 8 anti-patterns

- **Do not** alert on within-noise drift. CIs must NOT overlap. This is the false-positive guard.
- **Do not** retry 4xx webhook responses (config error). Only retry 5xx + timeouts.
- **Do not** scrape GMB / AU directories without checking ToS. Use APIs where available; cache aggressively where not.
- **Do not** include TikTok actual parsing in Sprint 8. Placeholder only — v1.1.
- **Do not** persist webhook payload longer than 30 days. Compliance + storage cost.
- **Do not** export full audit payload via SARIF/JUnit/GHA — these formats are summary findings, not raw data dumps. Map findings → SARIF rules.

---

## 12. Handoff to Sprint 9

Ready:
- ✓ Drift detection running — Sprint 9 scheduled audits trigger drift checks automatically
- ✓ Webhooks live — Sprint 9 agency tier extends with multi-brand webhook routing per agency
- ✓ Local SEO scores — Sprint 9 portfolio view aggregates across brands
- ✓ Export formats — Sprint 9 bulk export uses CSV; agency tier extends with GA4/Looker Studio

Not ready:
- Agency tier multi-brand workspace (Sprint 9)
- White-label PDF (Sprint 9)
- Scheduled recurring audits (Sprint 9 — drift detection currently runs only on manual audits)

---

## Changelog

- v1.17 (18 May 2026): **Twenty-first-pass audit — loadEndpoint setRlsContext, bulk_operations schema, brand NAP source, Wilson CI unpack, local_seo_results createdAt (FO1-FO5).** **(FO1)** §7 loadEndpoint: `setRlsContext(db, organizationId)` added — webhookEndpoints has RLS ENABLED; without context query returns 0 rows → crash. **(FO2)** §5: `bulk_operations` table schema written — operationType/status/totalBrands/completedBrands/failedBrands/inputParams/outputUrl; RLS ENABLE. **(FO3)** §7 NAP source: website NAP extracted from crawl structured data (brand.phone/address don't exist in Sprint 4 brands table); `crawl.structuredData?.phone` pattern. **(FO4)** §6 significance.ts: `getCI()` helper specified — unpacks Sprint 3 confidenceIntervals jsonb (stored as 0-1 proportions); converts to 0-100 scale; falls back to wide CI {0,1} for older audits. **(FO5)** §5 local_seo_results: `createdAt` added — Foundations standard for all table rows; was missing while every other Sprint 8 table had it.
- v1.16 (18 May 2026): **Twentieth-pass audit — checkNapConsistency signature, handleDeliveryFailure wiring, drift_alerts indexes, NAP 11/12 prototype, webhook_deliveries insert (FN1-FN5).** **(FN1)** FA4 Inngest: checkNapConsistency call fixed — FA4 passed (brand,gmb,directories) but FJ4 defined (NapSource[]); now maps each source to NapSource[] before calling. **(FN2+FN5)** §7 deliver-webhook.ts: handleDeliveryFailure now called in catch block; webhook_deliveries INSERT on success and failure (responseStatus on success, failedAt on failure). **(FN3)** §5 drift_alerts: orgAcknowledgedIdx + brandCreatedIdx Drizzle index definitions added — prose indexes never made it into the schema factory. **(FN4)** Prototype NAP card: '11 of 12 sources' → '5 of 6' — spec defines 6 sources max; 12 was impossible.
- v1.15 (18 May 2026): **Nineteenth-pass audit — retry.ts dead-letter, checkGmb body, custom-http.ts, audit_exports barrel, Sprint 4 drift JOIN (FM1-FM5).** **(FM1)** §4 retry.ts: `handleDeliveryFailure(endpointId)` body — counts last 5 deliveries; if all failed: sets isActive=false+lastDeliveryStatus='dead'; else updates lastDeliveryStatus='failed'. **(FM2)** §4 gmb-check.ts: `checkGmb(domain, brandName)` body — Text Search → Place Details two-step; 6-field completeness; returns GmbResult including name/address/phone for NAP. **(FM3)** §4 custom-http.ts: `formatCustomHttp` returns `{event, timestamp, data: payload}` envelope — typed wrapper around unchanged WebhookPayload. **(FM4)** FA3 barrel: `auditExports` + `AuditExport` type added — missing since FB6 wrote the schema after FA3 barrel list was finalized. **(FM5)** §1 drift indicator: Sprint 4 `GET /api/audits` extended with LEFT JOIN drift_alerts on currentAuditId+acknowledged=false; `driftSeverity` prop passed to drift-indicator.tsx.
- v1.14 (18 May 2026): **Seventeenth-pass audit — email channel, buildJunit, buildGha, WebhookSettings prototype, classify.ts (FL1-FL5).** **(FL1)** §7 email channel: clarified as Sprint 2 Resend reuse — endpoint.url = recipient email; formatEmail returns {to,subject,html}; deliver.ts uses Resend SDK not fetch for email. **(FL2)** §4 junit.ts: `buildJunit(audit)` function body — xmlbuilder2 create; 5 dimension testcases; failure child only when score<50; prettyPrint output. **(FL3)** §4 gha.ts: `buildGha(audit)` function body — iterates 5 dims; error/warning/notice by threshold; join('\n'); silent for ≥70. **(FL4)** Prototype: `WebhookSettings` component added — endpoint list with active/channel/lastStatus badges, test/edit/delete actions, delivery log table; registered in dev nav as 'webhook-settings'. **(FL5)** §4 confidence-labels/classify.ts: unified module assembled — re-exports CONFIDENCE_LEVELS from Sprint 6; exports classifyByKey(key) and classifyByScore(score); Sprint 6 uses classifyByKey, Sprint 8 dimension cards use classifyByScore.
- v1.13 (18 May 2026): **Fifteenth-pass audit — Sheets/Airtable formatters, drift-indicator, buildSarif, GMB return type, detect.ts pure logic (FK1-FK5).** **(FK1)** §4 sheets.ts+airtable.ts: formatSheets returns flat JSON for Apps Script; formatAirtable returns `{fields:{...}}` for Airtable REST API with auth via URL. **(FK2)** §4 drift-indicator.tsx: LEFT JOIN drift_alerts on audit-list; danger badge for drop, success for rise, null for noise. **(FK3)** §4 sarif.ts: `buildSarif(audit)` body — 5 dimension rules VA001-VA005; level=error/warning/note by threshold. **(FK4)** §4 gmb-check.ts: GmbResult interface with reviewCount+avgRating from Places API + NAP fields for consistency check. **(FK5)** §4 drift/detect.ts: `detectDrift(DriftInput):DriftOutput` pure logic; DriftInput/DriftOutput interfaces; called by Inngest function inside step.run().
- v1.12 (18 May 2026): **Thirteenth-pass audit — directory coverage prototype, deliver.ts body, drift-alerts GET, checkNapConsistency, GMB_API_KEY clarity (FJ1-FJ5).** **(FJ1)** Prototype LocalSeoDashboard: '4/5' → '3/4' — Sprint 8 has 4 directories; Sprint 9 adds GMB to make 5; prototype was showing Sprint 9 state. **(FJ2)** §4 deliver.ts: `deliver(url, body, signature, eventName)` function body — fetch with 10s AbortSignal timeout; throws on non-OK (Inngest retries); User-Agent header; returns DeliveryResult. **(FJ3)** §4 drift-alerts/route.ts: GET list body — `?acknowledged=true|false` filter param; setRlsContext; JOIN brands for brandName; limit 100 ordered by createdAt DESC. **(FJ4)** §4 nap-consistency.ts: `checkNapConsistency(sources: NapSource[])` body — C(n,2) pairwise loop; name/address/phone match counts; score = matches÷(total×3)×100; findings array per source. **(FJ5)** §3: `GMB_API_KEY` clarified as a Google Places API key (not a GMB-specific API); alias `GOOGLE_PLACES_API_KEY` added.
- v1.11 (18 May 2026): **Twelfth-pass audit — computeLocalSeoScore body, local-seo route, RLS SQL, address normalisation, acceptance criteria (FI1-FI5).** **(FI1)** §4 score.ts: `computeLocalSeoScore` TypeScript body — gmbScore(0 if absent)+napScore+dirScore(present÷4×100)+suburbScore(mentioned÷total×100 or 100 if none configured); weighted sum to 2dp. **(FI2)** §4 local-seo/[brandId]/route.ts: GET body — setRlsContext + select latest by checkedAt DESC + 404 if none. **(FI3)** §5 migration: RLS SQL for all 5 new tenant tables (drift_alerts, audit_exports, local_seo_results, webhook_endpoints, webhook_deliveries). **(FI4)** §5 napConsistency: AU address abbreviation map — 14 entries (St/Rd/Ave/Dr/Ct/Cl/Pl/Cr/Hwy/Pde/Lane/Blvd/Terr); normaliseAddress regex replaces before string comparison. **(FI5)** §12 acceptance: 4 items added — fanout-webhooks end-to-end, test delivery endpoint, 20+ Wilson CI test cases, downloadCount increment verification.
- v1.10 (18 May 2026): **Eleventh-pass audit — fan-out bridge, event payloads, Discord format, test delivery route, download tracking (FH1-FH5).** **(FH1)** §4 Inngest: `fanout-webhooks.ts` added — CRITICAL missing bridge; deliver-webhook listens to 'webhook.deliver' but nothing emitted it; fan-out function listens to all audit/drift/recommendation events, queries matching active endpoints, emits one 'webhook.deliver' per endpoint; add to serve(). **(FH2)** §4 events.ts: payload types for all 5 events — AuditCompletedPayload, AuditScoreDroppedPayload, DriftDetectedPayload, RecommendationCreatedPayload; union type WebhookPayload. **(FH3)** §4 discord.ts: Discord embed format — colour coded by severity (red/green/blue); embeds array with title/color/fields/url/footer/timestamp. **(FH4)** §4 webhooks-config/[id]/test/route.ts: synthetic 'audit.completed' test payload; formatForChannel + signHmacSha256 + fetch; 'X-VisibleAU-Test: true' header; returns {status, ok}. **(FH5)** §4 export/route.ts: `audit_exports` upsert after each download — INSERT with onConflictDoUpdate incrementing downloadCount; requires unique index on (auditId, format).
- v1.9 (18 May 2026): **Seventh-pass audit — au-directories detection, sign.ts implementation, updatedAt columns, PATCH/DELETE routes, directory field depth (FG1-FG5).** **(FG1+FG5)** §4 au-directories.ts: HTTP fetch of each directory public search URL + cheerio parse — search URL patterns for Hipages/YPAU/SS/WoM specified; Sprint 8 = presence+url only, reviewCount/avgRating null (Sprint 9 deep-parse); 1s delay between requests. **(FG2)** §4 sign.ts: `signHmacSha256` uses Node.js built-in `createHmac('sha256')` not @stablelib — @stablelib deps are unnecessary; customer verification pattern shown; sig format `sha256={hex}`. **(FG3)** §5 drift_alerts + webhook_endpoints: `updatedAt` added to both tables — PATCH routes modify these rows; Foundations requires updatedAt on all mutable rows; FE4 PATCH updated to set updatedAt. **(FG4)** §4 webhooks-config/[id]/route.ts: PATCH edits url/events/isActive (not signingSecret); DELETE hard-deletes endpoint (deliveries preserved for audit trail); both with setRlsContext.
- v1.8 (18 May 2026): **Sixth-pass audit — export route dispatcher, local-seo composite, TikTok placeholder, pdf.ts refactor, webhooks-config POST (FF1-FF5).** **(FF1)** §4 export/route.ts: full dispatcher specified — Sprint 4 formats delegated to existing handler; Sprint 8 sarif/junit/gha each return Response with correct Content-Type and filename. **(FF2)** §5 scoreComposite: weighted formula — GMB(30%)+NAP(30%)+directories(25%)+suburbs(15%); computed in lib/local-seo/score.ts. **(FF3)** Prototype AuditResultsRich: TikTok placeholder added to per-engine breakdown card — grayed-out row (opacity:0.45) with "Coming v1.1" tooltip badge; no data, dash score. **(FF4)** §4 pdf.ts: refactor purpose specified — extract buildPdf(audit) from Sprint 4's inline route handler; no functional change, purely code organisation for dispatcher consistency. **(FF5)** §4 webhooks-config/route.ts: POST body — Zod validates url/channel/events; signingSecret generated server-side with crypto.randomBytes; shown ONCE in response, never retrievable again.
- v1.7 (18 May 2026): **Fifth-pass audit — JUnit XML structure, GHA annotation syntax, local-seo page, drift-alert PATCH, webhooks settings page (FE1-FE5).** **(FE1)** §4 junit.ts: `<testsuites>/<testsuite>/<testcase>` shape specified — pass=score≥50/failure=score<50; `<failure>` child only on failure; classname=`dimension.{name}`; built with xmlbuilder2. **(FE2)** §4 gha.ts: full annotation syntax — `::warning title={Dimension} Score::{message}`; error<30/warning30-49/notice50-69/silent≥70; plain text output file. **(FE3)** §8 step 2: `local-seo/page.tsx` server component — single query on `localSeoResults` ordered by checkedAt DESC; EmptyState when no data; `LocalSeoDashboardView` pure display. **(FE4)** §4 `drift-alerts/[id]/route.ts` PATCH body — setRlsContext + db.update(acknowledged=true, acknowledgedAt=NOW()) + RLS cross-org 404; no webhook event on acknowledge. **(FE5)** §8 step 6: `settings/webhooks/page.tsx` server component — endpoints + last 20 deliveries queries; `WebhooksSettingsView` 'use client' handles all CRUD.
- v1.6 (18 May 2026): **Fourth-pass audit — retry schedule, suburb detection, GMB API, deliveries organizationId, drift-alerts page (FD1-FD5).** **(FD1)** §7 deliver-webhook.ts: clarified Inngest `{retries:5}` default backoff is correct; `retry.ts` handles dead-letter cleanup only (5 consecutive failures → isActive=false), not a retry queue. **(FD2)** §4 suburb-coverage.ts: detection specified — readability textContent for content, cheerio for meta tags, JSON-LD LocalBusiness address fields for schema; uses cached CrawlResult, no re-crawl. **(FD3)** §4 gmb-check.ts: Google Places Text Search → Place Details two-step specified — URLs, fields param, response mapping, completeness formula (6 fields ÷ 6 × 100). **(FD4)** §5 webhook_deliveries: `organizationId` added directly to table (denormalised); RLS SQL specified — joining via endpointId was not RLS-expressible in Supabase. **(FD5)** §8 step 3: `drift-alerts/page.tsx` server component — 4 parallel queries (active/week/resolved counts + alert list with JOIN brands); `DriftAlertsView` 'use client' handles PATCH acknowledge.
- v1.5 (18 May 2026): **Third-pass audit — composite CI bug, confidence-labels migration, Slack shape, event validation, score thresholds (FC1-FC5).** **(FC1)** §6 detect-drift.ts: composite `ciOverlaps({0,100},{0,100})` always returns true → all composite drift classified as `within_noise`; replaced with raw delta threshold (COMPOSITE_NOISE_THRESHOLD=5pts). **(FC2)** §8 step 4: confidence-labels migration plan — 5-step refactor from Sprint 6 inline to shared lib; clarified two classification axes (recommendationKey vs dimension score). **(FC3)** §4 slack.ts: Block Kit format specified — fallback `text` + header/section/actions blocks with "View audit" button. **(FC4)** §5 webhook_endpoints: Zod enum for 5 valid event names; clarified delivery events use dots (`audit.completed`) not slashes (`audit/complete`). **(FC5)** §4 confidence-labels/rules.ts: `classifyByScore` thresholds — ≥70='confirmed', 40-69='likely', <40='hypothesis'.
- v1.4 (18 May 2026): **Second-pass audit — detect-drift body, loadEndpoint/formatForChannel, NAP formula, DriftAlerts severity, audit_exports schema (FB2-FB6).** **(FB2)** §6 detect-drift.ts: full Inngest body written — load current+prior audits; first-audit early return; composite severity; per-dimension Wilson CI unpacking from Sprint 3 `confidenceIntervals` jsonb; `drift_alerts` insert + `drift/detected` event. **(FB3)** §7 deliver-webhook.ts: `loadEndpoint()` (DB select by id) and `formatForChannel()` (switch routing to 6 channel formatters) now specified. **(FB4)** §5 napConsistency: formula specified — pair-wise normalised string comparison across 6 sources; mean of name/address/phone scores; normalisation rules included. **(FB5)** Prototype DriftAlerts: `severity:'high'|'medium'` corrected to `'significant_drop'|'significant_rise'`; badge tone and label updated; second alert fixed. **(FB6)** §4/§5: `audit_exports` table schema written — auditId+organizationId+format+generatedAt+fileSizeBytes+downloadCount; RLS ENABLE; index on auditId.
- v1.3 (18 May 2026): **First-pass audit — boolean types, event name, barrel exports, local-seo body, SARIF structure (FA1-FA5).** **(FA1)** §5: `gmbPresent`, `acknowledged`, `isActive` corrected from `text().default('false'/'true')` to `boolean()` — same EA1 pattern from Sprint 7; string comparisons throughout code. **(FA2)** §6 detect-drift + §8 steps 2+3: `'audit.complete'` (dot) → `'audit/complete'` (slash) — Sprint 2/3 uses slash; Sprint 6 DA3 established canonical; mismatched name = function never fires. **(FA3)** §5 after migration: barrel exports for all 5 new tables + RLS matrix + `serve()` additions. **(FA4)** §8 step 2: `local-seo-audit.ts` Inngest body — parallel GMB+directories+NAP+suburbs steps → persist with setRlsContext. **(FA5)** §8 step 5: canonical SARIF v2.1.0 structure specified — `$schema`, `runs[].tool.driver.rules`, `runs[].results` with level/ruleId/message/locations; validation with `@cfworker/json-schema`.

---

- v2.1 (13 May 2026): **Second-pass-fix audit N11.** Broken PRD reference §12 → corrected to §8 Module 7 + §10 Layer 2. §12 is "Go-to-Market," not drift detection. Three locations corrected: §0 read-first list, §1 drift-detection sub-heading, §6 math sub-heading. Wilson CI overlap math is original to Sprint 8 (informed by §4.5 pain points 6C/14C/14D).
- v2.0 (12 May 2026): **Complete rewrite per conflict-audit H1 + H3 + H4 + L1 + L2.** Sprint 8 v1.0 had Drift + Exports only (~24-30h). PRD §11 Sprint 8 = Module 4 Local SEO + Multi-engine polish + drift + SARIF/JUnit/GHA + confidence labels + webhooks (~5-7 additional days vs baseline). v2.0 implements PRD canonical: Module 4 Local SEO (GMB + 4 AU directories per PRD canonical: Hipages/YPAU/SS/WoM + NAP + suburb coverage), drift detection (Wilson CI overlap), SARIF/JUnit/GHA exports live (was stubbed), confidence labels persisted at audit-result level (was Sprint 6 only), webhook integrations (6 channels + Zapier/n8n/Make.com recipes per Foglift reference), TikTok placeholder. ATTRIBUTIONS.md adds Foglift.
- v1.0 (12 May 2026): Initial. Net-new sprint prompt. **Conflicts: Local SEO mis-placed, webhooks missing, confidence labels not at audit-result level.**
