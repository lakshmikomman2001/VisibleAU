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
GMB_API_KEY=

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

lib/
├── local-seo/
│   ├── gmb-check.ts                           # GBP completeness
│   ├── au-directories.ts                      # 4-directory presence (Hipages, YPAU, SS, WoM)
│   ├── nap-consistency.ts                     # cross-source NAP comparison
│   ├── suburb-coverage.ts                     # suburb-level keyword check
│   └── score.ts                               # composite local SEO score
├── drift/
│   ├── detect.ts                              # audit-to-audit comparison
│   ├── significance.ts                        # Wilson CI overlap math (reused from Sprint 3)
│   ├── severity.ts                            # significant_drop | significant_rise | within_noise
│   └── types.ts
├── confidence-labels/                         # NEW shared module
│   ├── classify.ts                            # Confirmed | Likely | Hypothesis
│   └── rules.ts                               # category → label mapping
├── exports/
│   ├── sarif.ts                               # SARIF v2.1.0 builder
│   ├── junit.ts                               # JUnit XML builder
│   ├── gha.ts                                 # GitHub Actions annotation builder
│   └── pdf.ts                                 # already from Sprint 4 — refactored here
└── webhooks/
    ├── sign.ts                                # HMAC-SHA256 per-endpoint
    ├── deliver.ts                             # POST with retry
    ├── retry.ts                               # exponential backoff queue
    ├── channels/
    │   ├── slack.ts                           # Slack-formatted message
    │   ├── discord.ts                         # Discord-formatted message
    │   ├── sheets.ts                          # Google Sheets append row
    │   ├── airtable.ts                        # Airtable record insert
    │   └── custom-http.ts                     # generic JSON POST
    └── events.ts                              # event taxonomy

inngest/functions/
├── local-seo-audit.ts                         # NEW — triggered by audit.complete
├── detect-drift.ts                            # NEW — triggered by audit.complete
└── deliver-webhook.ts                         # NEW — triggered by audit.completed / drift.detected / etc.

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
├── local-seo/[brandId]/route.ts               # NEW
├── drift-alerts/
│   ├── route.ts                               # GET list
│   └── [id]/route.ts                          # PATCH acknowledge
└── webhooks-config/
    ├── route.ts                               # GET list + POST create per-org
    ├── [id]/route.ts                          # PATCH edit + DELETE
    └── [id]/test/route.ts                     # POST test delivery

components/domain/
├── local-seo/
│   ├── gmb-card.tsx
│   ├── directory-presence-matrix.tsx          # 4-directory grid (+ GMB)
│   ├── nap-consistency-table.tsx
│   └── suburb-coverage-card.tsx
├── drift/
│   ├── drift-alert-card.tsx
│   ├── drift-indicator.tsx                    # used on audit history rows
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

## 5. Database schema additions

### `local_seo_results.ts`

```typescript
export const localSeoResults = pgTable('local_seo_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  brandId: uuid('brand_id').references(() => brands.id).notNull(),

  gmbPresent: text('gmb_present').default('false').notNull(),
  gmbCompleteness: numeric('gmb_completeness', { precision: 5, scale: 2 }),  // 0-100
  gmbReviewCount: integer('gmb_review_count').default(0).notNull(),
  gmbAvgRating: numeric('gmb_avg_rating', { precision: 3, scale: 2 }),

  directoryPresence: jsonb('directory_presence').default('[]').notNull(),
  // Shape: [{ directory: 'hipages', present: bool, url, reviewCount, avgRating }, ...]
  // 4 directories: hipages, yellow_pages_au, service_seeking, word_of_mouth

  napConsistency: numeric('nap_consistency', { precision: 5, scale: 2 }),  // 0-100
  napFindings: jsonb('nap_findings').default('[]').notNull(),
  // [{ source, name, address, phone, matches: { name, address, phone } }, ...]

  suburbCoverage: jsonb('suburb_coverage').default('[]').notNull(),
  // [{ suburb, mentionedInContent: bool, mentionedInMeta: bool, mentionedInSchema: bool }, ...]

  scoreComposite: numeric('score_composite', { precision: 5, scale: 2 }),

  checkedAt: timestamp('checked_at', { withTimezone: true }).defaultNow().notNull(),
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
  acknowledged: text('acknowledged').default('false').notNull(),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

Index on `(organizationId, acknowledged)` and `(brandId, createdAt DESC)`.

### `webhook_endpoints.ts`

```typescript
export const webhookEndpoints = pgTable('webhook_endpoints', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  url: text('url').notNull(),
  channel: text('channel').notNull(),     // 'slack' | 'discord' | 'sheets' | 'airtable' | 'email' | 'custom'
  events: text('events').array().notNull(),  // ['audit.completed', 'drift.detected', ...]
  signingSecret: text('signing_secret').notNull(),  // generated whsec_*
  isActive: text('is_active').default('true').notNull(),
  lastDeliveryAt: timestamp('last_delivery_at', { withTimezone: true }),
  lastDeliveryStatus: text('last_delivery_status'),  // 'success' | 'failed' | etc.
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

### `webhook_deliveries.ts` (delivery audit log)

```typescript
export const webhookDeliveries = pgTable('webhook_deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  endpointId: uuid('endpoint_id').references(() => webhookEndpoints.id).notNull(),
  event: text('event').notNull(),
  payload: jsonb('payload').notNull(),
  attemptNumber: integer('attempt_number').default(1).notNull(),
  responseStatus: integer('response_status'),
  responseBody: text('response_body'),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  failedAt: timestamp('failed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

Migrate:
```bash
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

---

## 6. Drift detection math (PRD §8 Module 7 alert triggers + §10 Layer 2 canary; Wilson CI overlap original)

Wilson CI overlap from Sprint 3 already computed per dimension. Sprint 8 uses it:

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
  { event: 'audit.complete' },
  async ({ event, step }) => {
    const { auditId } = event.data;
    // Load current audit
    // Find prior audit for same brand (status=complete, ordered desc, limit 1)
    // If no prior: return early (first audit, nothing to compare)
    // Compute composite-level severity
    // Compute per-dimension severities
    // If any significant: insert drift_alerts row + emit drift.detected event
  }
);
```

---

## 7. Webhook delivery pipeline

```typescript
// inngest/functions/deliver-webhook.ts
export const deliverWebhookFn = inngest.createFunction(
  { id: 'deliver-webhook', retries: 5 },
  { event: 'webhook.deliver' },   // emitted by other Inngest functions
  async ({ event, step }) => {
    const { endpointId, eventName, payload } = event.data;
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
   - inngest/functions/local-seo-audit.ts triggered by audit.complete
   - 4 AU directories: Hipages, Yellow Pages AU, ServiceSeeking, Word of Mouth (PRD §11 Sprint 8 canonical)
   - NAP consistency across site + GMB + directories
   - Suburb coverage report
   - /brands/[id]/local-seo page

3. DRIFT DETECTION
   - lib/drift/significance.ts per §6 (Wilson CI overlap)
   - inngest/functions/detect-drift.ts triggered by audit.complete
   - /drift-alerts page with acknowledge UX
   - Drift indicator on brand detail audit history rows

4. CONFIDENCE LABELS (shared module)
   - lib/confidence-labels/* moved out of Sprint 6's inline definition
   - Sprint 6 Action Center + Sprint 8 audit-result dimension cards share the same rules

5. EXPORT FORMATS
   - lib/exports/sarif.ts (validates against SARIF v2.1.0 JSON Schema)
   - lib/exports/junit.ts (XML parseable by Jest reporters)
   - lib/exports/gha.ts (::warning::/::error:: annotations)
   - app/api/audits/[auditId]/export/route.ts extended for format=sarif|junit|gha
   - Sprint 4's "Coming Sprint 8" stubs now work

6. WEBHOOK INTEGRATIONS
   - lib/webhooks/* with 6 channel adapters
   - inngest/functions/deliver-webhook.ts with retry logic
   - /settings/webhooks page (add endpoint, pick events, test delivery)
   - Webhook recipe pages at /docs/integrations/{zapier,n8n,make-com,slack,discord,sheets,airtable}

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

- [ ] Local SEO audit runs after every audit.complete
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

- v2.1 (13 May 2026): **Second-pass-fix audit N11.** Broken PRD reference §12 → corrected to §8 Module 7 + §10 Layer 2. §12 is "Go-to-Market," not drift detection. Three locations corrected: §0 read-first list, §1 drift-detection sub-heading, §6 math sub-heading. Wilson CI overlap math is original to Sprint 8 (informed by §4.5 pain points 6C/14C/14D).
- v2.0 (12 May 2026): **Complete rewrite per conflict-audit H1 + H3 + H4 + L1 + L2.** Sprint 8 v1.0 had Drift + Exports only (~24-30h). PRD §11 Sprint 8 = Module 4 Local SEO + Multi-engine polish + drift + SARIF/JUnit/GHA + confidence labels + webhooks (~5-7 additional days vs baseline). v2.0 implements PRD canonical: Module 4 Local SEO (GMB + 4 AU directories per PRD canonical: Hipages/YPAU/SS/WoM + NAP + suburb coverage), drift detection (Wilson CI overlap), SARIF/JUnit/GHA exports live (was stubbed), confidence labels persisted at audit-result level (was Sprint 6 only), webhook integrations (6 channels + Zapier/n8n/Make.com recipes per Foglift reference), TikTok placeholder. ATTRIBUTIONS.md adds Foglift.
- v1.0 (12 May 2026): Initial. Net-new sprint prompt. **Conflicts: Local SEO mis-placed, webhooks missing, confidence labels not at audit-result level.**
