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
  **GB5 fix — Prototype `AgencyDashboard` shows "Client portfolios" as a grouped view. No `portfolios` table exists in Sprint 9 schema. Canonical: portfolios = GROUP BY `brands.clientTag` (free-text). Add `clientTag: text('client_tag')` to Sprint 4's `brands` table via Sprint 9 migration. Portfolio dashboard aggregates: `SELECT client_tag, count(*) as brand_count, avg(score) FROM brands GROUP BY client_tag WHERE client_tag IS NOT NULL`. Do NOT create a separate `portfolios` table.**

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
│   │   # GE1 fix: the main React-PDF themed document component is never specified.
│   │   # render.ts wraps Sprint 4's PDF generation with agency theming:
│   │   # export async function renderWhitelabelPdf(
│   │   #   audit: Audit & { brandName: string }, asset: AgencyBrandAsset | null, sections: string[]
│   │   # ): Promise<Buffer> {
│   │   #   const theme = assetToTheme(asset);  // from theme.ts
│   │   #   const styles = buildThemeStyles(theme);
│   │   #   const doc = (
│   │   #     <Document>
│   │   #       <Page size="A4" style={{ padding: 40 }}>
│   │   #         <View style={[styles.header, { padding: 16, marginBottom: 20 }]}>
│   │   #           {theme.logoUrl && <Image src={theme.logoUrl} style={{ height: 28 }} />}
│   │   #           <Text style={{ color: 'white', fontSize: 16, fontWeight: 'bold' }}>
│   │   #             {audit.brandName} — AI Visibility Report
│   │   #           </Text>
│   │   #         </View>
│   │   #         {sections.includes('Visibility scorecard') && <ScorecardSection audit={audit} styles={styles} />}
│   │   #         {sections.includes('Action plan') && <ActionPlanSection audit={audit} styles={styles} />}
│   │   #         <View style={[styles.footer, { position: 'absolute', bottom: 24, left: 40, right: 40 }]}>
│   │   #           <Text style={styles.footer}>{theme.contactLine || ''} · {theme.footerText}</Text>
│   │   #         </View>
│   │   #       </Page>
│   │   #     </Document>
│   │   #   );
│   │   #   return await renderToBuffer(doc);  // @react-pdf/renderer
│   │   # }
│   ├── theme.ts                              # apply logo + colors to a base template
│   │   # GB4 fix: theme.ts never specified. React-PDF applies styles via StyleSheet.create().
│   │   # The theme.ts module generates a themed StyleSheet from agency_brand_assets:
│   │   #
│   │   # import { AgencyBrandAsset } from '@/db/schema';
│   │   # import { StyleSheet } from '@react-pdf/renderer';
│   │   #
│   │   # export interface PdfTheme {
│   │   #   primaryColor: string;   // CSS hex e.g. '#0066CC'
│   │   #   secondaryColor: string;
│   │   #   accentColor: string;
│   │   #   logoUrl: string | null;
│   │   #   footerText: string;
│   │   #   contactLine: string;
│   │   # }
│   │   #
│   │   # export function assetToTheme(asset: AgencyBrandAsset | null): PdfTheme {
│   │   #   return {
│   │   #     primaryColor:   asset?.primaryColor   ?? '#0066CC',
│   │   #     secondaryColor: asset?.secondaryColor ?? '#1A1A1A',
│   │   #     accentColor:    asset?.accentColor    ?? '#FF6B35',
│   │   #     logoUrl:        asset?.logoUrl        ?? null,
│   │   #     footerText:     asset?.footerText     ?? 'Powered by VisibleAU',
│   │   #     contactLine:    asset?.contactLine    ?? '',
│   │   #   };
│   │   # }
│   │   #
│   │   # export function buildThemeStyles(theme: PdfTheme) {
│   │   #   return StyleSheet.create({
│   │   #     header:    { backgroundColor: theme.primaryColor },
│   │   #     accent:    { color: theme.accentColor },
│   │   #     bodyText:  { color: theme.secondaryColor },
│   │   #     footer:    { color: '#666666', fontSize: 8 },
│   │   #   });
│   │   # }
│   └── templates/
│       ├── basic.tsx                         # Sprint 4 default
│       └── white-label.tsx                   # NEW — themed wrapper
├── client-portal/
│   ├── invites.ts                            # generate + revoke invites
│   │   # GE2 fix: functions never written. GA5 described token storage but not the code:
│   │   # import { nanoid } from 'nanoid';
│   │   #
│   │   # export async function generateInvite(organizationId: string, brandId: string,
│   │   #   expiresInDays = 30): Promise<string> {
│   │   #   const token = nanoid(32);
│   │   #   await setRlsContext(db, organizationId);
│   │   #   await db.insert(clientPortalInvites).values({
│   │   #     organizationId, brandId, inviteToken: token,
│   │   #     expiresAt: new Date(Date.now() + expiresInDays * 86_400_000),
│   │   #     isRevoked: false,
│   │   #   });
│   │   #   const portalUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/client-portal/${token}`;
│   │   #   // Send invite email via Resend (optional — caller can also just copy the URL):
│   │   #   return portalUrl;
│   │   # }
│   │   #
│   │   # export async function revokeInvite(organizationId: string, inviteId: string): Promise<void> {
│   │   #   await setRlsContext(db, organizationId);
│   │   #   await db.update(clientPortalInvites)
│   │   #     .set({ isRevoked: true, revokedAt: new Date() })
│   │   #     .where(and(eq(clientPortalInvites.id, inviteId),
│   │   #                eq(clientPortalInvites.organizationId, organizationId)));
│   │   # }
│   ├── magic-link.ts                         # token + verify
│   │   # GA5 fix: "Clerk creates limited-permissions session on click" never specified.
│   │   # Clerk does not natively support token-gated limited sessions.
│   │   # Canonical pattern for Sprint 9:
│   │   # 1. Token = nanoid(32) stored in client_portal_invites.inviteToken
│   │   # 2. Email contains URL: https://app.visibleau.com/client-portal/{token}
│   │   # 3. app/client-portal/[inviteToken]/page.tsx calls GET /api/client-portal/verify/{token}
│   │   # 4. verify route: checks token in DB (not expired, not revoked), returns { brandId, orgId }
│   │   # 5. Page stores { token, brandId } in a short-lived httpOnly cookie (24h)
│   │   #    → NOT a full Clerk session — client portal uses token auth, not Clerk auth
│   │   # 6. All client-portal API calls include this cookie; middleware validates token each request
│   │   # 7. lib/client-portal/permissions.ts: isValidPortalToken(token, brandId) → bool
│   │   # NOTE: this is NOT a Clerk session. Client portal users are NOT Clerk users.
│   │   # Magic-link = token-in-URL → cookie; separate from main app Clerk auth.
│   │   # GE3 fix — client-portal middleware never written (GA5 said "middleware validates
│   │   # per-request" but no code). Add to middleware.ts (alongside Clerk auth config):
│   │   # if (pathname.startsWith('/client-portal/') && !pathname.includes('/verify')
│   │   #     && !pathname.includes('/invalid')) {
│   │   #   const cpToken = req.cookies.get('cp_token')?.value;
│   │   #   if (!cpToken) return NextResponse.redirect(new URL('/client-portal/invalid', req.url));
│   │   # }
│   │   # // Deep token validation (DB check) happens in each /api/client-portal/* route handler.
│   │   #
│   │   # GC2 fix — app/client-portal/[inviteToken]/page.tsx server component never specified.
│   │   # This route is OUTSIDE the (auth) group — no Clerk middleware, no redirect.
│   │   # export default async function ClientPortalPage({ params }) {
│   │   #   const verifyRes = await fetch(
│   │   #     `${process.env.NEXT_PUBLIC_BASE_URL}/api/client-portal/verify/${params.inviteToken}`,
│   │   #     { cache: 'no-store' });
│   │   #   if (!verifyRes.ok) return <InvalidLinkView />;
│   │   #   const { brandId, brandName } = await verifyRes.json();
│   │   #   cookies().set('cp_token', params.inviteToken, { httpOnly: true, maxAge: 86400 });
│   │   #   // Fetch scoped data via token-auth API routes:
│   │   #   const [audit, recs] = await Promise.all([
│   │   #     fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/client-portal/audit/${brandId}`,
│   │   #           { headers: { Cookie: `cp_token=${params.inviteToken}` } }).then(r=>r.json()),
│   │   #     fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/client-portal/recommendations/${brandId}`,
│   │   #           { headers: { Cookie: `cp_token=${params.inviteToken}` } }).then(r=>r.json()),
│   │   #   ]);
│   │   #   return <ClientPortalView brandName={brandName} audit={audit} recommendations={recs} />;
│   │   #   // ClientPortalView: read-only — no audit trigger, no settings, no billing
│   │   # }
│   └── permissions.ts                        # read-only scope enforcement
├── bulk/
│   ├── reaudit.ts                            # bulk trigger via Inngest
│   ├── csv-export.ts                         # multi-brand CSV builder
│   ├── ga4-push.ts                           # GA4 measurement protocol POST
│   │   # GC4 fix: body never written. GA4 Measurement Protocol v2 API:
│   │   # Triggered by 'audit/complete' event (alongside generate-recommendations etc.)
│   │   # Only fires if the brand's organization has GA4 config (measurementId + apiSecret).
│   │   #
│   │   # export const ga4PushFn = inngest.createFunction(
│   │   #   { id: 'ga4-push' },
│   │   #   { event: 'audit/complete' },
│   │   #   async ({ event, step }) => {
│   │   #     const { auditId, brandId, organizationId } = event.data;
│   │   #     await step.run('push-to-ga4', async () => {
│   │   #       await setRlsContext(db, organizationId);
│   │   #       const [org] = await db.select({ ga4MeasurementId: organizations.ga4MeasurementId,
│   │   #                                       ga4ApiSecret: organizations.ga4ApiSecret })
│   │   #         .from(organizations).where(eq(organizations.id, organizationId));
│   │   #       if (!org?.ga4MeasurementId || !org?.ga4ApiSecret) return;  // not configured
│   │   #
│   │   #       const [audit] = await db.select().from(audits).where(eq(audits.id, auditId));
│   │   #       // GA4 Measurement Protocol v2 endpoint:
│   │   #       await fetch(
│   │   #         `https://www.google-analytics.com/mp/collect?measurement_id=${org.ga4MeasurementId}&api_secret=${org.ga4ApiSecret}`,
│   │   #         { method: 'POST', headers: { 'Content-Type': 'application/json' },
│   │   #           body: JSON.stringify({
│   │   #             client_id: brandId,  // use brandId as GA4 client_id
│   │   #             events: [{ name: 'audit_completed',
│   │   #               params: { brand_id: brandId, score_composite: audit.scoreComposite,
│   │   #                         audit_id: auditId, engagement_time_msec: 1 } }]
│   │   #           })
│   │   #         });
│   │   #     });
│   │   #   }
│   │   # );
│   │   # Note: organizations table needs ga4MeasurementId + ga4ApiSecret columns (Sprint 9 migration).
│   └── looker-studio-url.ts                  # signed JSON-source URL builder
├── scheduling/
│   ├── calculate-next-run.ts                 # date math per frequency
│   │   # GC3 fix: listed but never implemented. GB3 cron calls calculateNextRun(frequency, now).
│   │   # 5 frequency values from audit_schedules.frequency:
│   │   # import { addDays, addHours, addMonths, setHours, nextMonday } from 'date-fns';
│   │   #
│   │   # export function calculateNextRun(frequency: string, from: Date): Date {
│   │   #   switch (frequency) {
│   │   #     case 'daily':     return addDays(from, 1);
│   │   #     case 'weekly':    return addDays(from, 7);
│   │   #     case '3x_weekly': return addDays(from, Math.ceil(7 / 3));   // ~every 2.3 days
│   │   #     case '2x_daily':  return addHours(from, 12);
│   │   #     case 'monthly':   return addMonths(from, 1);
│   │   #     default:          return addDays(from, 7);  // safe fallback
│   │   #   }
│   │   # }
│   │   # Note: `from` is the PREVIOUS run time, not now — ensures schedule stays aligned
│   │   # even if the cron runs slightly late. next = lastRunAt + interval.
│   ├── tier-limits.ts                        # per-tier caps (matches PRD §7)
│   └── quota-check.ts
│       # GD3 fix: body never written. GB3 cron calls checkQuota(organizationId, brandId).
│       # Must check monthly audit count against tier limits and return boolean:
│       #
│       # import { TIER_AUDIT_LIMITS } from './tier-limits';
│       # export async function checkQuota(organizationId: string, brandId: string): Promise<boolean> {
│       #   // Get org tier:
│       #   const [org] = await db.select({ tier: organizations.tier })
│       #     .from(organizations).where(eq(organizations.id, organizationId));
│       #   if (!org) return false;
│       #
│       #   const limit = TIER_AUDIT_LIMITS[org.tier]?.auditsPerMonth;
│       #   if (!limit) return true;  // unlimited tier (enterprise)
│       #
│       #   // Count audits this calendar month for this org:
│       #   const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
│       #     .from(audits).innerJoin(brands, eq(audits.brandId, brands.id))
│       #     .where(and(
│       #       eq(brands.organizationId, organizationId),
│       #       gte(audits.createdAt, sql`date_trunc('month', NOW())`),
│       #     ));
│       #
│       #   return count < limit;  // true = quota allows; false = at/over limit
│       # }
└── digest/
    ├── compose.ts                            # weekly portfolio summary (buildDigestHtml — GF3)
    └── send.ts                               # Resend email send
        # GG4 fix: GC1 cron called resend.emails.send() inline — inconsistent with having
        # a separate send.ts module in lib/digest/. send.ts should wrap the Resend call:
        # export async function sendDigestEmail(to: string, html: string): Promise<void> {
        #   await resend.emails.send({
        #     from: 'digest@visibleau.com',
        #     to,
        #     subject: `VisibleAU Weekly Digest — ${new Date().toLocaleDateString('en-AU')}`,
        #     html,
        #   });
        # }
        # GC1 cron should call: await sendDigestEmail(pref.digestEmail, buildDigestHtml(weeklyAudits))
        # This makes digest sending testable without mocking Resend directly in the cron.
    │   # GF3 fix: buildDigestHtml called in GC1 but never specified.
    │   # export function buildDigestHtml(
    │   #   audits: Array<{ brandName: string; scoreComposite: number | null }>
    │   # ): string {
    │   #   const rows = audits.map(a =>
    │   #     `<tr><td style="padding:8px;border-bottom:1px solid #eee">${a.brandName}</td>
    │   #      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;font-weight:600">
    │   #        ${a.scoreComposite ?? '—'}/100</td></tr>`
    │   #   ).join('');
    │   #   return `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto">
    │   #     <h2 style="color:#0066CC">VisibleAU Weekly Digest</h2>
    │   #     <p>${new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
    │   #     <table style="width:100%;border-collapse:collapse">
    │   #       <thead><tr>
    │   #         <th style="text-align:left;padding:8px;background:#f5f5f5">Brand</th>
    │   #         <th style="text-align:right;padding:8px;background:#f5f5f5">Score</th>
    │   #       </tr></thead>
    │   #       <tbody>${rows}</tbody>
    │   #     </table>
    │   #     <p style="color:#666;font-size:12px;margin-top:24px">
    │   #       Sent by <a href="https://visibleau.com">VisibleAU</a>.
    │   #       <a href="${process.env.NEXT_PUBLIC_BASE_URL}/settings/notifications">Manage preferences</a>
    │   #     </p>
    │   #   </body></html>`;
    │   # }
    └── send.ts                               # Resend email send

inngest/functions/
├── audit-schedules-cron.ts                   # NEW daily 02:00 UTC
│   # GB3 fix: cron body never written. Step sequence:
│   # export const auditSchedulesCron = inngest.createFunction(
│   #   { id: 'audit-schedules-cron' },
│   #   { cron: '0 2 * * *' },  // 02:00 UTC daily
│   #   async ({ step }) => {
│   #     const dueSchedules = await step.run('load-due', async () => {
│   #       // No setRlsContext — cron runs as system, not org-scoped:
│   #       return db.select({ id: auditSchedules.id, brandId: auditSchedules.brandId,
│   #                          organizationId: auditSchedules.organizationId,
│   #                          frequency: auditSchedules.frequency })
│   #         .from(auditSchedules)
│   #         .where(and(eq(auditSchedules.status, 'active'),
│   #                    lte(auditSchedules.nextRunAt, new Date())));
│   #     });
│   #
│   #     for (const schedule of dueSchedules) {
│   #       await step.run(`process-${schedule.id}`, async () => {
│   #         // Check quota:
│   #         const allowed = await checkQuota(schedule.organizationId, schedule.brandId);
│   #         if (!allowed) {
│   #           await db.update(auditSchedules)
│   #             .set({ status: 'quota_exceeded', pausedReason: 'Monthly audit quota reached',
│   #                   updatedAt: new Date() })
│   #             .where(eq(auditSchedules.id, schedule.id));
│   #           return;
│   #         }
│   #         // Fire audit + update nextRunAt:
│   #         await inngest.send({ name: 'audit/start',
│   #           data: { brandId: schedule.brandId, organizationId: schedule.organizationId,
│   #                   triggeredBy: 'schedule' } });
│   #         const nextRun = calculateNextRun(schedule.frequency, new Date());
│   #         await db.update(auditSchedules)
│   #           .set({ lastRunAt: new Date(), nextRunAt: nextRun, updatedAt: new Date() })
│   #           .where(eq(auditSchedules.id, schedule.id));
│   #       });
│   #     }
│   #   }
│   # );
├── weekly-digest-cron.ts                     # NEW Tuesday 09:00 AEST (= Mon 23:00 UTC during AEDT)
│   # GC1 fix: body never written. Sends per-org branded digest email:
│   # export const weeklyDigestCron = inngest.createFunction(
│   #   { id: 'weekly-digest-cron' },
│   #   { cron: '0 23 * * 1' },  // Mon 23:00 UTC = Tue 09:00 AEST
│   #   async ({ step }) => {
│   #     const prefs = await step.run('load-opted-in', async () =>
│   #       db.select({ organizationId: notificationPreferences.organizationId,
│   #                   digestEmail: notificationPreferences.digestEmail })
│   #         .from(notificationPreferences)
│   #         .where(eq(notificationPreferences.weeklyDigest, true)));
│   #     for (const pref of prefs) {
│   #       await step.run(`digest-${pref.organizationId}`, async () => {
│   #         await setRlsContext(db, pref.organizationId);
│   #         const weeklyAudits = await db.select({ brandName: brands.name,
│   #           scoreComposite: audits.scoreComposite })
│   #           .from(audits).innerJoin(brands, eq(audits.brandId, brands.id))
│   #           .where(and(eq(brands.organizationId, pref.organizationId),
│   #                      gte(audits.createdAt, sql`NOW() - INTERVAL '7 days'`)));
│   #         if (!weeklyAudits.length) return;  // skip orgs with no audits this week
│   #         await resend.emails.send({ from: 'digest@visibleau.com', to: pref.digestEmail,
│   #           subject: `VisibleAU Weekly Digest — ${new Date().toLocaleDateString('en-AU')}`,
│   #           html: buildDigestHtml(weeklyAudits) });
│   #       });
│   #     }
│   #   }
│   # );
├── bulk-reaudit-orchestrate.ts               # NEW fanout to per-brand audits
│   # GB2 fix: body never written. Inngest enforces concurrency via { concurrency: 4 } config.
│   # This limits how many parallel executions of THIS function run at once per org.
│   #
│   # export const bulkReauditOrchestrate = inngest.createFunction(
│   #   { id: 'bulk-reaudit-orchestrate',
│   #     concurrency: { limit: 4, key: 'event.data.organizationId' } },
│   #   // concurrency key = per-org: org A's 4 concurrent ≠ org B's 4 concurrent
│   #   { event: 'bulk/reaudit.requested' },
│   #   async ({ event, step }) => {
│   #     const { brandIds, organizationId, bulkOperationId } = event.data;
│   #
│   #     // Update bulk_operations status to 'running':
│   #     await step.run('mark-running', async () => {
│   #       await setRlsContext(db, organizationId);
│   #       await db.update(bulkOperations).set({ status: 'running', startedAt: new Date() })
│   #         .where(eq(bulkOperations.id, bulkOperationId));
│   #     });
│   #
│   #     // Fan out one audit/start event per brand (Inngest handles per-brand concurrency):
│   #     await step.run('fanout-audits', async () => {
│   #       await inngest.send(brandIds.map(brandId => ({
│   #         name: 'audit/start',
│   #         data: { brandId, organizationId, triggeredBy: 'bulk_reaudit', bulkOperationId },
│   #       })));
│   #     });
│   #
│   #     // Wait for all brands to complete (simplified — production uses event correlation):
│   #     await step.sleep('wait-for-audits', `${brandIds.length * 5}m`);
│   #
│   #     await step.run('mark-complete', async () => {
│   #       await setRlsContext(db, organizationId);
│   #       await db.update(bulkOperations).set({ status: 'complete', completedAt: new Date() })
│   #         .where(eq(bulkOperations.id, bulkOperationId));
│   #     });
│   #   }
│   # );
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
│   │   # GG3 fix: both GET and PATCH bodies never specified.
│   │   # GET — returns current agencyBrandAssets for org (or nulls if not set):
│   │   # export async function GET() {
│   │   #   const currentUser = await getCurrentUser();
│   │   #   if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
│   │   #   await setRlsContext(db, currentUser.organizationId);
│   │   #   const [asset] = await db.select().from(agencyBrandAssets)
│   │   #     .where(and(eq(agencyBrandAssets.organizationId, currentUser.organizationId),
│   │   #                isNull(agencyBrandAssets.brandId)));  // org-default (not per-brand)
│   │   #   return NextResponse.json(asset ?? null);
│   │   # }
│   │   # PATCH — upsert branding:
│   │   # Zod: { logoUrl?, primaryColor?, secondaryColor?, accentColor?, footerText?,
│   │   #        contactLine?, agencyName?, contactEmail? }
│   │   # export async function PATCH(req: Request) {
│   │   #   const currentUser = await getCurrentUser();
│   │   #   if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
│   │   #   await setRlsContext(db, currentUser.organizationId);
│   │   #   const updates = await req.json();
│   │   #   const [upserted] = await db.insert(agencyBrandAssets)
│   │   #     .values({ organizationId: currentUser.organizationId, brandId: null, ...updates })
│   │   #     .onConflictDoUpdate({ target: [agencyBrandAssets.organizationId, agencyBrandAssets.brandId],
│   │   #                           set: { ...updates, updatedAt: new Date() } })
│   │   #     .returning();
│   │   #   return NextResponse.json(upserted);
│   │   # }
│   ├── bulk-reaudit/route.ts                 # POST trigger bulk
│   ├── bulk-export/route.ts                  # POST trigger export — GH4 fix: GD4 created a
│   │   # separate POST /api/bulk/csv/route.ts as a second route for the same feature.
│   │   # Consolidate: canonical route is here at /api/agency/bulk-export/route.ts.
│   │   # body: { brandIds: string[], format: 'csv'|'sarif'|'junit', dateRange?: { from, to } }
│   │   # For CSV: streams CSV inline (Content-Disposition: attachment) — same logic as GD4.
│   │   # For sarif/junit: delegates to lib/exports/sarif.ts / junit.ts per brand, zipped.
│   │   # Returns: { downloadUrl?: string } or inline Content-Disposition stream.
│   │   # DELETE /api/bulk/csv/route.ts — that GD4 route was a duplicate. Use this one.
│   └── ga4-config/route.ts                   # GET + PATCH per-org GA4 secret
│       # GH5 fix: route listed but body never specified. GC4 reads org.ga4MeasurementId + ga4ApiSecret.
│       # GET — returns current GA4 config (redact apiSecret — return only whether it's set):
│       # export async function GET() {
│       #   const currentUser = await getCurrentUser();
│       #   if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
│       #   const [org] = await db.select({ ga4MeasurementId: organizations.ga4MeasurementId,
│       #     hasApiSecret: sql<boolean>`ga4_api_secret IS NOT NULL` })
│       #     .from(organizations).where(eq(organizations.id, currentUser.organizationId));
│       #   return NextResponse.json({ ga4MeasurementId: org?.ga4MeasurementId ?? null,
│       #                              hasApiSecret: org?.hasApiSecret ?? false });
│       # }
│       # PATCH — save GA4 config:
│       # Zod: { ga4MeasurementId: z.string(), ga4ApiSecret: z.string() }
│       # export async function PATCH(req: Request) {
│       #   const currentUser = await getCurrentUser();
│       #   if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
│       #   const { ga4MeasurementId, ga4ApiSecret } = await req.json();
│       #   await db.update(organizations).set({ ga4MeasurementId, ga4ApiSecret })
│       #     .where(eq(organizations.id, currentUser.organizationId));
│       #   return NextResponse.json({ ok: true });
│       # }
├── audit-schedules/
│   ├── route.ts                              # GET list + POST create
│   │   # GG2 fix: GET list body never specified. Scheduling page loads all org schedules:
│   │   # export async function GET(req: Request) {
│   │   #   const currentUser = await getCurrentUser();
│   │   #   if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
│   │   #   await setRlsContext(db, currentUser.organizationId);
│   │   #   const schedules = await db.select({
│   │   #     ...getTableColumns(auditSchedules), brandName: brands.name, domain: brands.domain
│   │   #   }).from(auditSchedules)
│   │   #     .innerJoin(brands, eq(auditSchedules.brandId, brands.id))
│   │   #     .where(eq(auditSchedules.organizationId, currentUser.organizationId))
│   │   #     .orderBy(asc(brands.name));
│   │   #   return NextResponse.json({ schedules });
│   │   # }
│   └── [id]/route.ts                         # PATCH (pause/resume) + DELETE
├── client-portal/
│   ├── invites/route.ts                      # POST create
│   │   # GF5 fix: POST body never specified despite GE2 writing generateInvite():
│   │   # export async function POST(req: Request) {
│   │   #   const currentUser = await getCurrentUser();
│   │   #   if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
│   │   #   // Zod: { brandId: z.string().uuid(), inviteeName?: z.string().optional(),
│   │   #   //        expiresInDays?: z.number().int().min(1).max(365).default(30) }
│   │   #   const { brandId, inviteeName, expiresInDays = 30 } = await req.json();
│   │   #   // Verify brand belongs to org:
│   │   #   await setRlsContext(db, currentUser.organizationId);
│   │   #   const [brand] = await db.select().from(brands).where(eq(brands.id, brandId));
│   │   #   if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
│   │   #   const portalUrl = await generateInvite(currentUser.organizationId, brandId, expiresInDays);
│   │   #   return NextResponse.json({ portalUrl, expiresInDays });
│   │   # }
│   ├── invites/[id]/route.ts                 # DELETE revoke
│   └── verify/[token]/route.ts               # GET validate token (returns brand info)
│       # GF2 fix: route listed but body never written. Must check isRevoked, expiresAt:
│       # export async function GET(req: Request, { params }: { params: { token: string } }) {
│       #   // No auth — public endpoint (token IS the auth):
│       #   const [invite] = await db.select({
│       #     id: clientPortalInvites.id, brandId: clientPortalInvites.brandId,
│       #     organizationId: clientPortalInvites.organizationId,
│       #     isRevoked: clientPortalInvites.isRevoked, expiresAt: clientPortalInvites.expiresAt,
│       #   }).from(clientPortalInvites).where(eq(clientPortalInvites.inviteToken, params.token));
│       #
│       #   if (!invite) return NextResponse.json({ error: 'Invalid link' }, { status: 404 });
│       #   if (invite.isRevoked) return NextResponse.json({ error: 'Link revoked' }, { status: 403 });
│       #   if (invite.expiresAt && invite.expiresAt < new Date())
│       #     return NextResponse.json({ error: 'Link expired' }, { status: 403 });
│       #
│       #   // Fetch brand name for display (bypass RLS — use service-level query or inner join):
│       #   const [brand] = await db.select({ name: brands.name })
│       #     .from(brands).where(eq(brands.id, invite.brandId));
│       #   return NextResponse.json({ brandId: invite.brandId, brandName: brand?.name ?? '',
│       #                              organizationId: invite.organizationId });
│       # }
└── notification-preferences/route.ts         # GET + PATCH
    # GH1 fix: route listed but body never specified.
    # GET — returns current preferences (or defaults if no row yet):
    # export async function GET() {
    #   const currentUser = await getCurrentUser();
    #   if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    #   await setRlsContext(db, currentUser.organizationId);
    #   const [prefs] = await db.select().from(notificationPreferences)
    #     .where(eq(notificationPreferences.organizationId, currentUser.organizationId));
    #   // Return row or defaults:
    #   return NextResponse.json(prefs ?? {
    #     weeklyDigest: true, digestEmail: currentUser.email,
    #     emailOnDrift: true, emailOnAuditComplete: false, emailOnScheduleFailure: true
    #   });
    # }
    # PATCH — upsert preferences:
    # Zod: { weeklyDigest?, digestEmail?, emailOnDrift?, emailOnAuditComplete?, emailOnScheduleFailure? }
    # export async function PATCH(req: Request) {
    #   const currentUser = await getCurrentUser();
    #   if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    #   await setRlsContext(db, currentUser.organizationId);
    #   const updates = await req.json();
    #   const [upserted] = await db.insert(notificationPreferences)
    #     .values({ organizationId: currentUser.organizationId, digestEmail: currentUser.email, ...updates })
    #     .onConflictDoUpdate({ target: [notificationPreferences.organizationId],
    #                           set: { ...updates, updatedAt: new Date() } })
    #     .returning();
    #   return NextResponse.json(upserted);
    # }

components/domain/agency/
├── portfolio-grid.tsx
├── top-movers.tsx
├── workspace-switcher.tsx                    # topbar brand selector
│   # GH2 fix: component never specified. Appears in AgencyDashboard topbar.
│   # Lets user switch "active brand context" for the current session.
│   # Data source: existing GET /api/brands (Sprint 4) — returns all org brands.
│   # Pattern ('use client'):
│   # - On mount: fetch('/api/brands') → list of { id, name, domain }
│   # - Renders a <select> or dropdown with brand names
│   # - On change: router.push(`/brands/${selectedId}/audits`)
│   # - Shows current brand name if on a brand-specific page (read from URL params)
│   # - For Agency plan: shows "All brands (23)" option → navigates to /agency
│   # Props: { currentBrandId?: string } — highlighted in dropdown if on a brand page
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
  // GC5 fix: WhiteLabelReport prototype shows "Agency name" + "Footer contact" inputs.
  // These require columns missing from the schema:
  agencyName: text('agency_name'),     // shown in PDF header instead of "VisibleAU"
  contactEmail: text('contact_email'), // footer email — maps to prototype "Footer contact" input
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
// GA3 fix: original used { columns: [...], name: '...' } — invalid Drizzle v0.29+ syntax.
// Drizzle requires uniqueIndex() in the factory callback:
}, (t) => ({
  uniqueOrgBrand: uniqueIndex('unique_org_brand_assets').on(t.organizationId, t.brandId),
}));
```

### `client_portal_invites.ts`

```typescript
export const clientPortalInvites = pgTable('client_portal_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  brandId: uuid('brand_id').references(() => brands.id).notNull(),
  inviteToken: text('invite_token').unique().notNull(),  // nanoid(32)
  inviteeName: text('invitee_name'),
  // GG5 fix: prototype shows client email in portal header. GH3 fix: was .notNull() — email is optional.
  inviteeEmail: text('invitee_email'),  // nullable — agency may not know client email at invite time
  status: text('status').default('active').notNull(),    // 'active' | 'revoked' | 'expired'
  expiresAt: timestamp('expires_at', { withTimezone: true }),  // null = no expiry
  // GF1 fix: GE2's revokeInvite() sets isRevoked=true but column was missing from schema.
  // isRevoked is separate from status — faster boolean check for middleware validation:
  isRevoked: boolean('is_revoked').default(false).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

**GG1 fix — `client_portal_views` listed in barrel exports and RLS migration but pgTable never specified. Add to `db/schema/client-portal-views.ts`:**
```typescript
export const clientPortalViews = pgTable('client_portal_views', {
  id: uuid('id').primaryKey().defaultRandom(),
  inviteId: uuid('invite_id').references(() => clientPortalInvites.id).notNull(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  brandId: uuid('brand_id').references(() => brands.id).notNull(),
  viewedAt: timestamp('viewed_at', { withTimezone: true }).defaultNow().notNull(),
  ipHash: text('ip_hash'),   // SHA-256 hash of visitor IP (privacy-safe analytics)
  userAgent: text('user_agent'),
  pageViewed: text('page_viewed').default('overview').notNull(),  // 'overview'|'actions'|'history'
});
// Tracks each page view through a client portal link — used for "last viewed" + engagement stats.
// No updatedAt — append-only audit log.
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
  // GA2 fix: updatedAt missing — schedule is mutable (pause/resume changes status).
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
// GA2 fix: index was in prose but not in Drizzle factory — pnpm drizzle-kit generate ignores prose.
}, (t) => ({
  statusNextRunIdx: index('audit_schedules_status_next_run_idx').on(t.status, t.nextRunAt),
}));
```

Index on `(status, nextRunAt)` for cron query.

**GA1 fix — barrel exports never specified (recurring gap: Sprints 5/6/7/8). Add to `db/schema/index.ts`:**
```typescript
export * from './agency-brand-assets';
export * from './client-portal-invites';
export * from './client-portal-views';
export * from './audit-schedules';
export * from './notification-preferences';
export * from './bulk-operations';
export type AgencyBrandAsset = InferSelectModel<typeof agencyBrandAssets>;
export type ClientPortalInvite = InferSelectModel<typeof clientPortalInvites>;
export type AuditSchedule = InferSelectModel<typeof auditSchedules>;
```

**RLS policy matrix (Sprint 9 new tables):**
```sql
-- All tenant data — standard org_isolation policy:
ALTER TABLE agency_brand_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON agency_brand_assets
  USING (organization_id = current_setting('app.current_organization_id')::uuid);

ALTER TABLE client_portal_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON client_portal_invites
  USING (organization_id = current_setting('app.current_organization_id')::uuid);

ALTER TABLE client_portal_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON client_portal_views
  USING (organization_id = current_setting('app.current_organization_id')::uuid);

ALTER TABLE audit_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON audit_schedules
  USING (organization_id = current_setting('app.current_organization_id')::uuid);

-- notification_preferences + bulk_operations: ENABLE with same pattern
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON notification_preferences
  USING (organization_id = current_setting('app.current_organization_id')::uuid);
ALTER TABLE bulk_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON bulk_operations
  USING (organization_id = current_setting('app.current_organization_id')::uuid);
```

**GD1 fix — GC4 `ga4PushFn` queries `organizations.ga4MeasurementId` + `ga4ApiSecret` but NO Sprint 9 migration adds these to the Sprint 2 `organizations` table. Add to Sprint 9 migration:**
```sql
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ga4_measurement_id text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ga4_api_secret text;
-- GB5 fix: portfolios = clientTag; add to Sprint 4 brands table:
ALTER TABLE brands ADD COLUMN IF NOT EXISTS client_tag text;
```
Also add to `db/schema/organizations.ts` Drizzle definition:
```typescript
ga4MeasurementId: text('ga4_measurement_id'),
ga4ApiSecret:     text('ga4_api_secret'),
```

**GD2 fix — `notificationPreferences` pgTable body never specified (referenced in GC1 weekly digest and GD1 RLS). Add to `db/schema/notification-preferences.ts`:**
```typescript
export const notificationPreferences = pgTable('notification_preferences', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  weeklyDigest: boolean('weekly_digest').default(true).notNull(),
  digestEmail: text('digest_email').notNull(),   // recipient email for digest
  emailOnDrift: boolean('email_on_drift').default(true).notNull(),
  emailOnAuditComplete: boolean('email_on_audit_complete').default(false).notNull(),
  emailOnScheduleFailure: boolean('email_on_schedule_failure').default(true).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  uniqueOrg: uniqueIndex('notification_preferences_org_idx').on(t.organizationId),
  // One row per org — upsert on settings save
}));
```

**`serve()` additions for Sprint 9 Inngest functions:**
```typescript
import { auditSchedulesCron } from '@/inngest/functions/audit-schedules-cron';
import { weeklyDigestCron } from '@/inngest/functions/weekly-digest-cron';
import { bulkReauditOrchestrate } from '@/inngest/functions/bulk-reaudit-orchestrate';
import { ga4PushFn } from '@/inngest/functions/ga4-push';
// Add all 4 to the serve() functions array alongside Sprint 6-8 functions.
```

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
   - **GA4 fix — cron Inngest functions never added to `serve()`. Without registration Inngest cannot invoke them.** Add `auditSchedulesCron`, `weeklyDigestCron`, `bulkReauditOrchestrate`, `ga4PushFn` to `serve()` array in `app/api/inngest/route.ts` (see GA1 imports above).

2. AGENCY DASHBOARD + PORTFOLIO
   - /agency page with portfolio grid + top-movers + LLM spend rollup
   - /portfolio page (Sprint 4 stub) now populated
   - Topbar workspace switcher (multi-brand)
   - **GB1 fix — `/agency/page.tsx` server component never specified:**
     ```tsx
     // app/(auth)/agency/page.tsx — server component
     export default async function AgencyPage() {
       const currentUser = await getCurrentUser();
       if (!currentUser) redirect('/sign-in');
       if (!['agency', 'agency_pro', 'enterprise'].includes(currentUser.tier))
         return <TierGate requiredTier="agency" />;
       await setRlsContext(db, currentUser.organizationId);

       const [allBrands, recentAudits, driftPending, scheduledUpcoming] = await Promise.all([
         // All brands for org (for KPI counts):
         db.select({ id: brands.id, name: brands.name, clientTag: brands.clientTag })
           .from(brands).where(eq(brands.organizationId, currentUser.organizationId)),
         // Most recent audit per brand (for avg score + top movers):
         db.select({ brandId: audits.brandId, scoreComposite: audits.scoreComposite,
                     createdAt: audits.createdAt, brandName: brands.name })
           .from(audits).innerJoin(brands, eq(audits.brandId, brands.id))
           .where(eq(brands.organizationId, currentUser.organizationId))
           .orderBy(desc(audits.createdAt)).limit(50),
         // Unacknowledged drift alerts count:
         db.select({ count: sql<number>`count(*)::int` }).from(driftAlerts)
           .where(and(eq(driftAlerts.organizationId, currentUser.organizationId),
                      eq(driftAlerts.acknowledged, false))),
         // Next scheduled audit:
         db.select().from(auditSchedules)
           .where(and(eq(auditSchedules.organizationId, currentUser.organizationId),
                      eq(auditSchedules.status, 'active')))
           .orderBy(asc(auditSchedules.nextRunAt)).limit(5),
       ]);

       return <AgencyDashboardView brands={allBrands} recentAudits={recentAudits}
                driftCount={driftPending[0].count} upcomingSchedules={scheduledUpcoming} />;
     }
     ```

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
   - **GD4 fix — bulk CSV export route body never specified. Add `POST /api/bulk/csv/route.ts`:**
     ```typescript
     // body: { brandIds: string[], dateRange?: { from: string, to: string } }
     // z.object({ brandIds: z.array(z.string().uuid()).min(1).max(50),
     //            dateRange: z.object({ from: z.string(), to: z.string() }).optional() })
     export async function POST(req: Request) {
       const currentUser = await getCurrentUser();
       if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
       await setRlsContext(db, currentUser.organizationId);
       const { brandIds, dateRange } = await req.json();
       const from = dateRange?.from ? new Date(dateRange.from) : subDays(new Date(), 30);
       const to   = dateRange?.to   ? new Date(dateRange.to)   : new Date();

       // Query all audits for selected brands in date range:
       const rows = await db.select({
         brandName: brands.name, domain: brands.domain, vertical: brands.vertical,
         auditDate: audits.createdAt, scoreFrequency: audits.scores, // jsonb
         scoreComposite: audits.scoreComposite,
       }).from(audits).innerJoin(brands, eq(audits.brandId, brands.id))
         .where(and(inArray(audits.brandId, brandIds),
                    gte(audits.createdAt, from), lte(audits.createdAt, to)))
         .orderBy(brands.name, desc(audits.createdAt));

       // Build CSV string (use papaparse or manual join):
       const csv = [
         'Brand,Domain,Vertical,Audit Date,Composite Score',
         ...rows.map(r => `${r.brandName},${r.domain},${r.vertical},${r.auditDate.toISOString().slice(0,10)},${r.scoreComposite}`)
       ].join('\n');

       // Track in bulk_operations:
       await db.insert(bulkOperations).values({
         organizationId: currentUser.organizationId, operationType: 'csv_export',
         status: 'complete', totalBrands: brandIds.length, completedBrands: brandIds.length,
         startedAt: new Date(), completedAt: new Date(),
       });

       return new Response(csv, { headers: { 'Content-Type': 'text/csv',
         'Content-Disposition': `attachment; filename="visibleau-export-${new Date().toISOString().slice(0,10)}.csv"` } });
     }
     ```
   - Bulk CSV export: single CSV with one row per audit across selected brands
   - GA4 measurement protocol push (per audit.complete if GA4 config exists)
   - **GE4 fix — `PATCH /api/audit-schedules/[id]/route.ts` never specified. Users need pause/resume from the scheduling page:**
     ```typescript
     // Zod body: { status: z.enum(['active', 'paused']), pausedReason?: z.string().optional() }
     export async function PATCH(req: Request, { params }: { params: { id: string } }) {
       const currentUser = await getCurrentUser();
       if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
       await setRlsContext(db, currentUser.organizationId);
       const { status, pausedReason } = await req.json();
       const [updated] = await db.update(auditSchedules)
         .set({ status, pausedReason: status === 'paused' ? (pausedReason ?? 'Manually paused') : null,
                updatedAt: new Date() })
         .where(and(eq(auditSchedules.id, params.id),
                    eq(auditSchedules.organizationId, currentUser.organizationId)))
         .returning({ id: auditSchedules.id, status: auditSchedules.status });
       if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
       return NextResponse.json(updated);
     }
     ```
   - **GD5 fix — `SelfServeSetup` onboarding screen never specifies when/how it triggers.**
     The prototype `SelfServeSetup` is a 4-step welcome flow. Trigger pattern:
     - Sprint 4's Clerk `afterSignUp` redirect goes to `/welcome` (not `/dashboard`)
     - **GE5 fix — how this is configured never shown. Clerk uses env var:**
       ```bash
       # In .env.local (add to Sprint 4's Clerk env vars):
       NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/welcome
       # (NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL is the older deprecated key — use the above)
       ```
       This redirects ALL new Clerk sign-ups to `/welcome`. Existing users who sign in go to the default (Sprint 4's `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/dashboard`).
     - `app/(auth)/welcome/page.tsx` renders `<SelfServeSetup />` for new users
     - New user detection: `brands.count === 0 AND currentUser.createdAt > now() - 5min`
     - After step 4 ("See your visibility score"): redirect to `/brands/{newBrandId}/audits`
     - On subsequent logins (onboardingComplete = true): skip `/welcome` → go to `/dashboard`
     - Store `onboardingComplete: boolean` on `organizations` table (Sprint 9 migration adds it)
     - Middleware check: `if (!org.onboardingComplete && req.nextUrl.pathname !== '/welcome') redirect('/welcome')`
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

- v1.10 (18 May 2026): **Sixteenth-pass audit — notification-preferences route, workspace-switcher, inviteeEmail nullable, bulk-export consolidation, ga4-config route (GH1-GH5).** **(GH1)** notification-preferences/route.ts: GET returns row or defaults; PATCH upserts via onConflictDoUpdate on organizationId. **(GH2)** workspace-switcher.tsx: 'use client'; fetches /api/brands on mount; dropdown to router.push per brand; "All brands" option → /agency. **(GH3)** inviteeEmail: removed .notNull() — email is optional; also removed duplicate column definition from GG5. **(GH4)** bulk-export routes consolidated: /api/agency/bulk-export/route.ts is canonical; /api/bulk/csv/route.ts from GD4 is a duplicate. **(GH5)** ga4-config/route.ts: GET redacts apiSecret (returns hasApiSecret boolean); PATCH saves both fields.
- v1.9 (18 May 2026): **Fifteenth-pass audit — client_portal_views schema, audit-schedules GET, branding GET+PATCH, digest send.ts, inviteeEmail (GG1-GG5).** **(GG1)** §5: client_portal_views pgTable specified — viewedAt+ipHash+userAgent+pageViewed; append-only portal engagement analytics. **(GG2)** §4 audit-schedules GET: setRlsContext+innerJoin brands+orderBy brandName. **(GG3)** §4 branding/route.ts: GET org-default (brandId=null); PATCH upsert with onConflictDoUpdate. **(GG4)** §4 digest/send.ts: `sendDigestEmail(to,html)` wrapper; GC1 cron should call it not inline Resend. **(GG5)** §5 client_portal_invites+prototype: `inviteeEmail text` added; portal header shows this email.
- v1.8 (18 May 2026): **Eleventh-pass audit — isRevoked schema, verify route, buildDigestHtml, UpgradeFlow Sprint 10, invite POST route (GF1-GF5).** **(GF1)** §5 client_portal_invites: `isRevoked: boolean().default(false).notNull()` added — GE2's revokeInvite() set this field but column was missing; faster boolean check than status string. **(GF2)** §4 verify/[token]/route.ts: body specified — checks isRevoked+expiresAt; returns {brandId,brandName,organizationId}; no auth (token IS the auth). **(GF3)** §4 digest/compose.ts: `buildDigestHtml(audits)` — simple HTML table of brandName+scoreComposite; manage-preferences unsubscribe link. **(GF4)** Prototype UpgradeFlow: Sprint 10 scope note added — Stripe billing ships in Sprint 10; Sprint 9 ships UI shell only. **(GF5)** §4 client-portal/invites/route.ts POST body — Zod validates brandId+inviteeName+expiresInDays; verifies brand belongs to org; calls generateInvite().
- v1.7 (18 May 2026): **Tenth-pass audit — pdf render, invites functions, middleware, schedule PATCH, Clerk env var (GE1-GE5).** **(GE1)** §4 pdf/render.ts: `renderWhitelabelPdf(audit, asset, sections)` body — React-PDF Document with themed header/scorecard/action/footer; calls `renderToBuffer()`. **(GE2)** §4 invites.ts: `generateInvite(orgId, brandId)` — nanoid(32) + insert clientPortalInvites + return portal URL; `revokeInvite` — sets isRevoked=true. **(GE3)** §4 middleware.ts: client-portal route guard — checks cp_token cookie; redirects to /client-portal/invalid if absent; deep DB check in API route handlers. **(GE4)** §8 step 7: `PATCH /api/audit-schedules/[id]` body — status enum (active/paused); sets pausedReason; setRlsContext; returning check for 404. **(GE5)** §3 env vars: `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/welcome` — the specific Clerk env var needed for afterSignUp redirect.
- v1.6 (18 May 2026): **Eighth-pass audit — organizations GA4 migration, notificationPreferences schema, quota-check body, bulk CSV route, SelfServeSetup trigger (GD1-GD5).** **(GD1)** migration SQL: `ALTER TABLE organizations ADD COLUMN ga4_measurement_id text; ga4_api_secret text; brands ADD client_tag text;` — GC4 queried these columns but no migration existed. **(GD2)** `notification_preferences` pgTable fully specified — weeklyDigest+digestEmail+emailOnDrift+emailOnAuditComplete+emailOnScheduleFailure; uniqueIndex on organizationId. **(GD3)** `quota-check.ts`: `checkQuota(orgId, brandId)` body — reads org.tier → TIER_AUDIT_LIMITS; counts audits this calendar month via date_trunc; returns bool. **(GD4)** `POST /api/bulk/csv`: Zod body; date-range audit query; CSV string; bulkOperations insert; Content-Disposition response. **(GD5)** SelfServeSetup trigger: `/welcome` route; new-user detection; `organizations.onboardingComplete` flag; middleware redirect for incomplete onboarding.
- v1.5 (18 May 2026): **Fifth-pass audit — weekly digest body, client-portal page, calculateNextRun, ga4-push body, agencyName+contactEmail (GC1-GC5).** **(GC1)** weekly-digest-cron.ts: Mon 23:00 UTC cron; loads weeklyDigest=true prefs; per-org audit summary + Resend email. **(GC2)** client-portal/[inviteToken]/page.tsx: outside (auth) group; verify token → set cookie → fetch audit+recs → ClientPortalView read-only. **(GC3)** calculate-next-run.ts: 5 frequencies via date-fns; from=lastRunAt for alignment. **(GC4)** ga4-push.ts: listens to audit/complete; GA4 Measurement Protocol v2 POST; organizations needs ga4 columns. **(GC5)** agencyBrandAssets: agencyName+contactEmail added.
- v1.4 (18 May 2026): **Third-pass audit — agency dashboard page, bulk-reaudit body, cron body, pdf theme, portfolios = clientTag (GB1-GB5).** **(GB1)** §8 step 2: `/agency/page.tsx` server component — 4 parallel queries (brands, recentAudits, driftCount, upcomingSchedules); tier gate for non-Agency users; AgencyDashboardView client component. **(GB2)** §4 bulk-reaudit-orchestrate.ts: Inngest body with `concurrency: { limit: 4, key: 'event.data.organizationId' }` — per-org concurrency limit; fan-out via `inngest.send(brandIds.map(...))` each firing `audit/start`; updates bulkOperations status. **(GB3)** §4 audit-schedules-cron.ts: daily 02:00 UTC cron body — loads due active schedules; per-schedule quota check; fires `audit/start`; updates nextRunAt via `calculateNextRun`; auto-pauses on quota_exceeded. **(GB4)** §4 pdf/theme.ts: `assetToTheme(asset)` + `buildThemeStyles(theme)` specified — maps `agencyBrandAssets` to React-PDF StyleSheet; defaults to VisibleAU brand when no assets configured. **(GB5)** §1: portfolios = `brands.clientTag` GROUP BY (no separate table); `clientTag: text('client_tag')` added to Sprint 4 brands via Sprint 9 migration.
- v1.3 (18 May 2026): **Second-pass audit — barrel exports+RLS, audit_schedules index+updatedAt, Drizzle uniqueIndex syntax, serve() cron registration, magic-link auth pattern (GA1-GA5).** **(GA1)** §5: barrel exports for all 6 new tables + RLS SQL + serve() imports for 4 new Inngest functions. **(GA2)** §5 audit_schedules: updatedAt added; statusNextRunIdx Drizzle index in factory callback. **(GA3)** §5 agencyBrandAssets: invalid unique constraint syntax replaced with uniqueIndex(). **(GA4)** §8 step 1: 4 cron/bulk Inngest functions registered in serve(). **(GA5)** §4 magic-link.ts: nanoid token → httpOnly cookie; NOT a Clerk session; per-request token validation in middleware.
- v2.1 (13 May 2026): **Third-pass-fix audit B6.** §6 TIER_AUDIT_LIMITS section gained explicit clarification on the shared multidim+technical quota model per Sprint 7 v2.1 + CLAUDE.md v1.3 N3 design. One "Run Audit" click = one quota slot (counted on `audits` table only); `technical_audits` is satellite. Combined per-audit cost budget: <US$3.50 paid / ~US$2 Free. Noted operator-override path if Sri later wants separate quotas.
- v2.0 (12 May 2026): **Complete rewrite per conflict-audit H2 + H4 + L1.** Sprint 9 v1.0 was "Scheduled audits + portfolio analytics" — PRD §11 says Sprint 9 = Agency tier. v2.0 implements PRD canonical: multi-brand workspace, agency dashboard, white-label PDF (with `agency_brand_assets`), client portal (with `client_portal_invites` magic-link auth), bulk operations (re-audit + CSV + GA4 + Looker Studio), scheduled recurring audits folded in here (since agencies need cross-client cadence), Tuesday 09:00 AEST weekly digest per PRD §8 Module 7 (was Sunday). **Tier limits corrected to PRD §7 canonical** (Starter weekly 4/mo, Growth 3×/week 12/mo, Agency daily 30/brand/mo with 5 brands, Agency Pro 2×/day 60/brand/mo with 25 brands).
- v1.0 (12 May 2026): Initial. Net-new sprint prompt. **Conflicts: wrong scope (was scheduled audits), wrong tier limits, wrong digest day.**
