# Sprint 9 — Agency Tier (Multi-Brand + White-Label PDF + Client Portal + Bulk Operations + Scheduled Audits)

**Sprint:** 9 of 12
**Estimated effort:** 30-40 hours (~4-5 weekends at 8 hrs/week — PRD §11 Sprint 9 baseline)
**Goal:** Unlock Agency (A$499/mo, 5 brands) and Agency Pro (A$1,499/mo, 25 brands) tiers. Multi-brand workspace + agency dashboard + white-label PDF reports + client portal (limited view) + bulk operations + GA4/Looker Studio exports. Plus scheduled recurring audits (since agencies need cross-client cadence).
**Prerequisites:** Sprint 8 complete. Local SEO + drift + webhooks shipping.
**Out of scope:** Stripe billing for Agency upgrades (Sprint 10), onboarding flow (Sprint 10).

---

## 0. Read first

1. `CLAUDE.md`
2. `sri-geo-aeo-prd-v1.md` v1.14 §8 Module 6 (Agency Dashboard) + §11 Sprint 9 + §16 OSS additions to agency tier
3. `visibleau-prototype.jsx` lines 3189-3484 (Agency workspace + PDF builder + Bulk operations screens)

---

## 1. What ships this sprint

### Multi-brand workspace (PRD §8 Module 6)

- ✓ **Multi-brand workspace switcher** — Top-bar dropdown lets agency users switch between brands instantly. Already exists at schema level since Sprint 1 (one Clerk org = one workspace; multiple brands per org). Sprint 9 adds the polish UI.
- ✓ **Agency dashboard** at `/agency` — Overview across all client brands: portfolio composite score, top-3 movers (up/down), drift alerts pending acknowledgment, upcoming scheduled audits, LLM spend this month
- ✓ **Per-brand client assignment** — Optional: tag each brand with a "client" identifier (free-text or linked agency contact). Used by client portal.

### White-label PDF reports (PRD §8 Module 6 + conflict-audit H4)

- ✓ **Schema: `agency_brand_assets`** — Per-org: logo URL (Supabase Storage), primary color, secondary color, accent color, footer text, contact line
- ✓ **PDF template engine** — Sprint 4's basic PDF becomes a templated PDF where logo + colors + footer swap from `agency_brand_assets`
- ✓ **Per-brand override** — Agency can set different branding per brand (e.g., reseller use case: brand A gets reseller's logo, brand B gets agency's logo)
- ✓ **Logo upload UI** at `/agency/branding` — drag-and-drop, file-size limit 2MB, PNG/SVG/JPG accepted
- ✓ **Color picker UI** with live preview
- ✓ **PDF builder preview** at `/agency/reports/pdf-builder` per prototype line 3360

### Client portal (PRD §8 Module 6 + conflict-audit H4)

- ✓ **Schema: `client_portal_invites`** — Email-based magic-link invites with per-brand read-only scope
- ✓ **Client portal route group** `/client-portal/[invite-token]` — limited view: brand's audit results + recommendations only, NO ability to trigger new audits, NO settings, NO billing
- ✓ **Magic-link auth** — Click email link → Clerk creates limited-permissions session → portal renders
- ✓ **Audit log** — Track when clients view their portal (timestamp, IP, optional UA)
- ✓ **Agency UI** at `/agency/client-portals` — list of issued invites, revoke individual, regenerate

### Bulk operations (PRD §8 Module 6)

- ✓ **Bulk re-audit** — Select N brands → trigger audits in parallel (capped at concurrency 4 per Inngest config)
- ✓ **Bulk export to CSV** — Select N brands + date range → download single CSV with one row per audit
- ✓ **Bulk export to GA4** — Per-brand GA4 measurement-protocol push of audit-complete event (custom events: `audit_completed`, `audit_score_dropped`)
- ✓ **Bulk export to Looker Studio** — Generate Looker Studio data-source URL pointing at a per-org JSON endpoint (`/api/org/[orgId]/looker.json` with API key auth)
- ✓ **Bulk operations UI** at `/agency/bulk` per prototype line 3426

### Scheduled recurring audits (was originally my Sprint 9 v1.0; folded into Agency tier here)

- ✓ **Schema: `audit_schedules`** — Per-brand frequency (daily / weekly / monthly), next run timestamp, status (active / paused / quota_exceeded), pause reason
- ✓ **Tier-aware quota** — Per-tier audit caps per month (Free 1, Starter 4, Growth 12, Agency 30/brand, Agency Pro 60/brand). Enforced at schedule trigger time.
- ✓ **Inngest cron** — Daily 02:00 UTC picks up due schedules, fires audit if quota allows
- ✓ **Quota-exceeded UX** — Schedule auto-pauses with upgrade CTA when monthly cap hit
- ✓ **Weekly digest** — Tuesday 09:00 AEST (per PRD §8 Module 7 canonical, not Sunday): email with portfolio summary, scores, drift alerts

### Portfolio analytics enhanced (was originally my Sprint 9 v1.0; folded here)

- ✓ **Trend charts** via Recharts — per-brand 30-day composite-score trend on shared axis
- ✓ **Top movers** — biggest gains + biggest drops by composite delta
- ✓ **LLM spend rollup** — total cost across all brands this month

**Definition of done:** Agency user has 5+ brands. Agency dashboard renders portfolio overview. User uploads logo → PDF report exports with that logo + custom colors. Client portal invite link works (email → click → see brand's audit results only, no admin). Bulk re-audit fires 5 audits in parallel. Bulk CSV exports all brands' last 30 days. GA4 measurement-protocol pushes audit-complete events. Scheduled audits run on cron per tier frequency. Weekly digest arrives Tuesday 09:00 AEST.

---

## 2. Dependencies to install

```bash
# Recharts already installed Sprint 4
# date-fns already installed Sprint 4

# Magic-link tokens
pnpm add nanoid

# GA4 measurement protocol (server-side)
# No lib needed — direct HTTP

# CSV (already installed via papaparse in Sprint 5)
```

---

## 3. Environment variables (additions)

```bash
GA4_MEASUREMENT_PROTOCOL_API_SECRET=  # optional per-org; set in webhook config UI
```

---

## 4. Project structure additions

```
db/schema/
├── agency-brand-assets.ts                    # NEW — logo + colors per org per brand
├── client-portal-invites.ts                  # NEW
├── client-portal-views.ts                    # NEW — audit log of portal access
├── audit-schedules.ts                        # NEW (was originally drafted in v1.0 Sprint 9)
├── notification-preferences.ts               # NEW
└── bulk-operations.ts                        # NEW — track bulk re-audit / export jobs

lib/
├── agency/
│   ├── workspace.ts                          # current-brand resolver from URL or topbar selection
│   ├── branding.ts                           # load assets for org+brand pair (with fallback)
│   └── portfolio.ts                          # portfolio metrics aggregation
├── pdf/
│   ├── render.ts                             # extends Sprint 4 PDF with theming
│   ├── theme.ts                              # apply logo + colors to a base template
│   └── templates/
│       ├── basic.tsx                         # Sprint 4 default
│       └── white-label.tsx                   # NEW — themed wrapper
├── client-portal/
│   ├── invites.ts                            # generate + revoke invites
│   ├── magic-link.ts                         # token + verify
│   └── permissions.ts                        # read-only scope enforcement
├── bulk/
│   ├── reaudit.ts                            # bulk trigger via Inngest
│   ├── csv-export.ts                         # multi-brand CSV builder
│   ├── ga4-push.ts                           # GA4 measurement protocol POST
│   └── looker-studio-url.ts                  # signed JSON-source URL builder
├── scheduling/
│   ├── calculate-next-run.ts                 # date math per frequency
│   ├── tier-limits.ts                        # per-tier caps (matches PRD §7)
│   └── quota-check.ts
└── digest/
    ├── compose.ts                            # weekly portfolio summary
    └── send.ts                               # Resend email send

inngest/functions/
├── audit-schedules-cron.ts                   # NEW daily 02:00 UTC
├── weekly-digest-cron.ts                     # NEW Tuesday 09:00 AEST (= Mon 23:00 UTC during AEDT)
├── bulk-reaudit-orchestrate.ts               # NEW fanout to per-brand audits
└── ga4-push.ts                               # NEW triggered by audit.complete if GA4 configured

app/(auth)/
├── agency/
│   ├── page.tsx                              # agency dashboard
│   ├── branding/page.tsx                     # logo + colors upload
│   ├── reports/pdf-builder/page.tsx          # per prototype line 3360
│   ├── bulk/page.tsx                         # per prototype line 3426
│   ├── client-portals/page.tsx               # invite management
│   └── client-portals/new/page.tsx           # issue new invite
├── brands/[brandId]/
│   ├── schedule/page.tsx                     # per-brand scheduling UI
│   └── branding/page.tsx                     # per-brand white-label override
├── portfolio/page.tsx                        # ENHANCED — Sprint 4 stub now populated
└── settings/notifications/page.tsx           # weekly digest preference

app/client-portal/                             # NEW — public-ish route group
├── layout.tsx                                # minimal layout (no sidebar)
├── [inviteToken]/page.tsx                    # validates token → renders read-only view
└── [inviteToken]/audits/[auditId]/page.tsx

app/api/
├── agency/
│   ├── branding/route.ts                     # GET + PATCH per-org branding
│   ├── bulk-reaudit/route.ts                 # POST trigger bulk
│   ├── bulk-export/route.ts                  # POST trigger export, returns job id
│   └── ga4-config/route.ts                   # GET + PATCH per-org GA4 secret
├── audit-schedules/
│   ├── route.ts                              # GET list + POST create
│   └── [id]/route.ts                         # PATCH (pause/resume) + DELETE
├── client-portal/
│   ├── invites/route.ts                      # POST create
│   ├── invites/[id]/route.ts                 # DELETE revoke
│   └── verify/[token]/route.ts               # GET validate token (returns brand info)
└── notification-preferences/route.ts         # GET + PATCH

components/domain/agency/
├── portfolio-grid.tsx
├── top-movers.tsx
├── workspace-switcher.tsx                    # topbar brand selector
├── branding-form.tsx
├── pdf-preview.tsx
├── client-portal-invite-form.tsx
├── bulk-action-bar.tsx
└── schedule-form.tsx

tests/
├── unit/
│   ├── agency/
│   │   ├── branding.test.ts
│   │   └── portfolio.test.ts
│   ├── pdf/theme.test.ts
│   ├── client-portal/
│   │   ├── invites.test.ts
│   │   └── permissions.test.ts
│   ├── bulk/
│   │   ├── reaudit.test.ts
│   │   └── csv-export.test.ts
│   ├── scheduling/
│   │   ├── calculate-next-run.test.ts
│   │   ├── tier-limits.test.ts
│   │   └── quota-check.test.ts
│   └── digest/compose.test.ts
└── integration/
    ├── agency/multi-brand-flow.test.ts
    ├── client-portal/end-to-end.test.ts
    ├── bulk/parallel-reaudit.test.ts
    └── scheduling/cron-pickup.test.ts
```

---

## 5. Database schema additions

### `agency_brand_assets.ts`

```typescript
export const agencyBrandAssets = pgTable('agency_brand_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  brandId: uuid('brand_id').references(() => brands.id),  // null = org-default
  logoUrl: text('logo_url'),                              // Supabase Storage URL
  primaryColor: text('primary_color').default('#0066CC').notNull(),
  secondaryColor: text('secondary_color').default('#1A1A1A').notNull(),
  accentColor: text('accent_color').default('#FF6B35').notNull(),
  footerText: text('footer_text'),
  contactLine: text('contact_line'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniqueOrgBrand: { columns: [t.organizationId, t.brandId], name: 'unique_org_brand_assets' },
}));
```

### `client_portal_invites.ts`

```typescript
export const clientPortalInvites = pgTable('client_portal_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  brandId: uuid('brand_id').references(() => brands.id).notNull(),
  inviteToken: text('invite_token').unique().notNull(),  // nanoid(32)
  inviteeEmail: text('invitee_email').notNull(),
  inviteeName: text('invitee_name'),
  status: text('status').default('active').notNull(),    // 'active' | 'revoked' | 'expired'
  expiresAt: timestamp('expires_at', { withTimezone: true }),  // null = no expiry
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});
```

### `audit_schedules.ts`

```typescript
export const auditSchedules = pgTable('audit_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  brandId: uuid('brand_id').references(() => brands.id).notNull(),
  frequency: text('frequency').notNull(),       // 'daily' | 'weekly' | '3x_weekly' | '2x_daily' | 'monthly'
  status: text('status').default('active').notNull(),  // 'active' | 'paused' | 'quota_exceeded'
  nextRunAt: timestamp('next_run_at', { withTimezone: true }).notNull(),
  lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  pausedReason: text('paused_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

Index on `(status, nextRunAt)` for cron query.

---

## 6. Per-tier scheduling rules (matches PRD §7 canonical)

```typescript
// lib/scheduling/tier-limits.ts — MATCHES PRD CANONICAL
export const TIER_AUDIT_LIMITS = {
  free:       { auditsPerMonth: 1,    brandsMax: 1,  frequency: 'manual',     maxScheduled: 0  },
  starter:    { auditsPerMonth: 4,    brandsMax: 1,  frequency: 'weekly',     maxScheduled: 1  },
  growth:     { auditsPerMonth: 12,   brandsMax: 1,  frequency: '3x_weekly',  maxScheduled: 1  },
  agency:     { auditsPerBrandPerMonth: 30,  brandsMax: 5,  frequency: 'daily',     maxScheduled: 5  },
  agency_pro: { auditsPerBrandPerMonth: 60,  brandsMax: 25, frequency: '2x_daily',  maxScheduled: 25 },
  enterprise: { auditsPerBrandPerMonth: Infinity, brandsMax: Infinity, frequency: 'daily', maxScheduled: Infinity },
} as const;
```

**Critical:** these numbers come straight from PRD §7. The previous Sprint 9 v1.0 had wrong values (5 audits/mo for Starter; 25 audits/mo + 5 brands for Growth; etc.). Fixed per conflict-audit C2.

**Shared multidim + technical-audit quota (v2.1 third-pass-fix B6 clarification):** Per the Sprint 7 v2.1 + CLAUDE.md v1.3 N3 design decision, a single "Run Audit" click fires BOTH the multidimensional audit (Sprint 3) AND the technical audit (Sprint 7) in parallel via the same `audit/start` Inngest event. **They share one tier-quota slot.** Quota enforcement (`lib/quota/check.ts`) counts only `audits` table rows (the multidim audit), not `technical_audits` — the latter is a satellite table joined via `technical_audits.audit_id`. Free tier audits include both: technical audit cost (~US$0.30 site crawler) applies even on Free, so the Free 100-call multidim budget (~US$1.50) + technical (~US$0.30) = ~US$1.80 total. The combined per-audit cost budget is **<US$3.50 paid / ~US$2 Free** per `audits.metadata.combined_cost_target_usd`.

If Sri later flips the design to "separate technical-audit button + separate quota" (the N3-rejected alternative), `TIER_AUDIT_LIMITS` would gain a `technicalAuditsPerMonth` column and `lib/quota/check.ts` would gate on both tables independently. v1 retains the shared-quota model.

---

## 7. Weekly digest cron — Tuesday 09:00 AEST per PRD §8 Module 7

```typescript
// inngest/functions/weekly-digest-cron.ts
export const weeklyDigestCron = inngest.createFunction(
  { id: 'weekly-digest-cron' },
  // AEDT (UTC+11) Oct-Apr; AEST (UTC+10) Apr-Oct. 09:00 AEDT = 22:00 UTC prior day; 09:00 AEST = 23:00 UTC prior day.
  // PRD §8 Module 7 canonical: "Tuesday 9am AEST default" — interpret as the local-time Tuesday morning.
  // Cron 23:00 UTC Monday → 09:00 AEST Tuesday (or 10:00 AEDT Tuesday).
  // Honor per-user `notification_preferences.timezone` when sending.
  { cron: '0 23 * * 1' },
  async ({ step }) => {
    // Load all users with digestFrequency='weekly'
    // For each: compose digest payload + send via Resend
  }
);
```

(Conflict-audit L1: was originally "Sunday 09:00 AEDT" in my v1.0; PRD canonical is Tuesday.)

---

## 8. Claude Code prompt (paste this when starting Sprint 9)

```
We're building VisibleAU Sprint 9: Agency Tier. Sprint 8 shipped Local SEO + drift + webhooks.
Sprint 9 unlocks the A$499/mo and A$1,499/mo tiers with multi-brand workspace + white-label PDF
+ client portal + bulk operations + scheduled audits.

Most important constraint: per-tier audit limits MUST match PRD §7 canonical. Do not invent
numbers. The previous Sprint 9 v1.0 had wrong limits (conflict-audit C2). Use §6 verbatim.

Sprint 9 deliverables, in order:

1. SCHEMA
   - 6 new tables per §4
   - Migrate

2. AGENCY DASHBOARD + PORTFOLIO
   - /agency page with portfolio grid + top-movers + LLM spend rollup
   - /portfolio page (Sprint 4 stub) now populated
   - Topbar workspace switcher (multi-brand)

3. WHITE-LABEL PDF
   - agency_brand_assets table per §5
   - lib/pdf/theme.ts applies logo + colors to base template
   - /agency/branding UI for logo upload (Supabase Storage) + color pickers
   - /agency/reports/pdf-builder preview per prototype line 3360
   - Sprint 4's basic PDF stays as default; white-label kicks in when assets configured

4. CLIENT PORTAL
   - client_portal_invites table
   - /client-portal/[inviteToken] route group (limited, read-only)
   - Magic-link auth: nanoid token in email, Clerk creates session on click
   - /agency/client-portals UI for invite management

5. BULK OPERATIONS
   - /agency/bulk per prototype line 3426
   - Bulk re-audit: select brands → fanout via Inngest with concurrency 4
   - Bulk CSV export: single CSV with one row per audit across selected brands
   - GA4 measurement protocol push (per audit.complete if GA4 config exists)
   - Looker Studio JSON-source URL with API-key auth

6. SCHEDULED AUDITS
   - audit_schedules table per §5
   - lib/scheduling/tier-limits.ts per §6 — MATCHES PRD §7 CANONICAL exactly
   - inngest/functions/audit-schedules-cron.ts daily 02:00 UTC pickup
   - /brands/[id]/schedule UI for per-brand frequency + status

7. WEEKLY DIGEST
   - inngest/functions/weekly-digest-cron.ts Tuesday 09:00 AEST per PRD §8 Module 7
   - lib/digest/compose.ts builds portfolio summary
   - /settings/notifications UI for digest preferences

8. TIER GATING
   - Free/Starter/Growth see "Upgrade to Agency" CTAs in agency-only screens
   - Agency+ sees full features
   - Tier checks server-side (organizations.tier)

9. TESTS
   - Unit per §4 (~20 test files)
   - Integration: multi-brand audit flow, client portal end-to-end (invite → click → view),
     bulk parallel reaudit, cron pickup respects quota
   - E2E: agency uploads logo + runs audit + downloads white-label PDF, client clicks
     invite link + sees brand-only view

POTENTIAL BLOCKERS:
- Supabase Storage RLS policies for logo uploads — public-read on logos bucket
- Magic-link auth UX: Clerk's session API needs special config for token-based sessions
- AEST/AEDT timezone in weekly digest cron — handle DST transitions
- Bulk reaudit cost — 5 brands × 200 calls = 1000 LLM calls × ~$0.015 = $15 per bulk run.
  Display cost preview before confirming bulk action.

Start with step 1. After schema migrates, step 2 (dashboard) is the visible win that
makes the rest of the sprint feel real.
```

---

## 9. Tests required

- Unit: per §4 (~20 test files)
- Integration: multi-brand flow, client portal end-to-end, bulk parallel reaudit, cron + quota
- E2E: agency uploads logo + white-label PDF; client invite link → portal view

---

## 10. Acceptance criteria

- [ ] Agency dashboard renders portfolio across all brands
- [ ] Topbar workspace switcher selects between brands
- [ ] Logo upload to Supabase Storage works
- [ ] Color picker updates PDF template preview
- [ ] White-label PDF exports with custom logo + colors
- [ ] Client portal invite email arrives
- [ ] Click invite link → see brand-only audits, NO ability to trigger new audit
- [ ] Bulk re-audit fires N parallel audits respecting concurrency 4
- [ ] Bulk CSV export downloads complete CSV
- [ ] GA4 push: per-brand audit-complete event arrives in GA4 Real-Time
- [ ] Looker Studio URL renders dashboard with brand data
- [ ] **Per-tier limits MATCH PRD §7 canonical exactly (PRD §6 numbers above)**
- [ ] Cron picks up due schedule; quota gate prevents over-cap audits
- [ ] Weekly digest arrives Tuesday 09:00 AEST (verify with test user in AU timezone)
- [ ] Free/Starter/Growth see upgrade CTAs in agency-only screens
- [ ] No regression on Sprint 1-8 tests

---

## 11. Common pitfalls / Sprint 9 anti-patterns

- **Do not** invent tier limits. Use PRD §7 numbers exactly (per §6 of this prompt).
- **Do not** allow client portal users to trigger audits, view billing, or see other brands. Read-only + brand-scoped.
- **Do not** ship the bulk re-audit without a cost-preview confirm dialog. 5+ brands × A$3 each adds up; user must consent.
- **Do not** persist client portal magic-link tokens longer than necessary. Default 90-day expiry; agency can revoke earlier.
- **Do not** auto-pause schedules without explanation. `pausedReason` field is mandatory when transitioning to paused state.
- **Do not** send weekly digest to users with 0 brands. Skip them.
- **Do not** put GA4 secret in client-visible code. Server-side only, per-org config.

---

## 12. Handoff to Sprint 10

Ready:
- ✓ Agency tier features fully operational — Sprint 10 Stripe upgrades unlock them via tier transitions
- ✓ Tier-aware quota enforcement — Sprint 10 billing reads from same `TIER_AUDIT_LIMITS`
- ✓ Quota-exceeded UX — Sprint 10 wires upgrade CTAs to Stripe Checkout

Not ready:
- Stripe checkout flow (Sprint 10)
- Onboarding + sample audit (Sprint 10)
- Tier upgrade/downgrade webhooks (Sprint 10)

---

## Changelog

- v2.1 (13 May 2026): **Third-pass-fix audit B6.** §6 TIER_AUDIT_LIMITS section gained explicit clarification on the shared multidim+technical quota model per Sprint 7 v2.1 + CLAUDE.md v1.3 N3 design. One "Run Audit" click = one quota slot (counted on `audits` table only); `technical_audits` is satellite. Combined per-audit cost budget: <US$3.50 paid / ~US$2 Free. Noted operator-override path if Sri later wants separate quotas.
- v2.0 (12 May 2026): **Complete rewrite per conflict-audit H2 + H4 + L1.** Sprint 9 v1.0 was "Scheduled audits + portfolio analytics" — PRD §11 says Sprint 9 = Agency tier. v2.0 implements PRD canonical: multi-brand workspace, agency dashboard, white-label PDF (with `agency_brand_assets`), client portal (with `client_portal_invites` magic-link auth), bulk operations (re-audit + CSV + GA4 + Looker Studio), scheduled recurring audits folded in here (since agencies need cross-client cadence), Tuesday 09:00 AEST weekly digest per PRD §8 Module 7 (was Sunday). **Tier limits corrected to PRD §7 canonical** (Starter weekly 4/mo, Growth 3×/week 12/mo, Agency daily 30/brand/mo with 5 brands, Agency Pro 2×/day 60/brand/mo with 25 brands).
- v1.0 (12 May 2026): Initial. Net-new sprint prompt. **Conflicts: wrong scope (was scheduled audits), wrong tier limits, wrong digest day.**
