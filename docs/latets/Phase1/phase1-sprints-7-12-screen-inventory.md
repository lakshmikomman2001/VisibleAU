# VisibleAU Phase 1 — Sprints 7–12: new screens & modified screens

Source: prototype `screens` registry (grouped by sprint) + Sprint 7–12 prompts (scope + cross-sprint modification notes).
**24 new screens** across Sprints 7–12, plus modifications to earlier-sprint screens.

Note: the prototype's section-header comments (e.g. "Sprint 7 (4 screens)") are stale from an earlier draft; the **`screens` registry is authoritative** and is what's listed below.

---

## Sprint 7 — Technical AI Infrastructure (Module 5b) · 7 new screens
The largest sprint by effort.

**New screens**
1. llms.txt generator (`llms-txt`) — graduated /18 depth scoring
2. robots.txt + AI crawlers (`robots-txt`) — 27 AI bots, 3 tiers, opt-in/out per crawler
3. Schema auditor (`schema-auditor`) — richness /16, honest impact reporting
4. SSR check (`ssr-check`)
5. Answer capsules (`answer-capsules`)
6. Brand & Entity audit (AU) (`brand-entity`)
7. 47 citability methods (`citability-methods`)
- Plus the product page **Technical audit** `/brands/[id]/technical-audit` (8-dimension drill-down + 5-category rollup), driven by `technical-audit-run.ts`.

**Modified existing screens**
- **Audit list (Sprint 4):** now shows the multidimensional audit as the primary row, with a **"+ technical audit" badge** on rows where both completed (requires `technical_audits.auditId` FK).
- **"Run Audit" button / audit flow (Sprint 4):** one click now fires BOTH the multidim audit (Sprint 3, 200 calls) AND the technical audit (parallel).
- **Audit-completion email:** now summarises both audits.
- **Per-audit cost budget:** display rises from <US$3 to <US$3.50 (site-crawler cost).

---

## Sprint 8 — Local SEO + Multi-Engine Polish (Drift + Webhooks + Exports) · 5 new screens

**New screens**
1. Local SEO dashboard (`local-seo`) — GBP completeness, NAP consistency, suburb-keyword coverage
2. AU directories (`directory-presence`) — Hipages, Yellow Pages AU, ServiceSeeking, Word of Mouth
3. Drift alerts (`drift-alerts`) — Wilson-CI-overlap drift detection
4. Webhook settings (`webhook-settings`) — Slack / Discord / Sheets / Airtable / Email / custom
5. Alert history (`alert-history`)

**Modified existing screens**
- **Audit list (Sprint 4) + `GET /api/audits`:** extended with a LEFT JOIN on `drift_alerts` to feed a **drift-severity indicator** badge on audit rows (FM5 fix).
- **Audit export route (`audits/[auditId]/export`, Sprint 4 stub):** extended with `format=sarif|junit|gha`.
- **Audit results:** confidence labels now persisted at audit-result level.

---

## Sprint 9 — Agency Tier · 4 new screens

**New screens**
1. Agency dashboard (`agency-dashboard`) at **`/agency`** — portfolio composite, top movers, pending drift alerts, upcoming scheduled audits, monthly LLM spend
2. Client portal — white-label (`client-portal`)
3. PDF report builder — white-label (`white-label-report`)
4. Bulk operations (`bulk-operations`)

**Modified existing screens**
- **Top-bar / nav shell:** multi-brand **workspace switcher** dropdown added (schema existed since Sprint 1; Sprint 9 adds the UI).
- **Brands table (Sprint 4):** `clientTag` column added (portfolio grouping = `GROUP BY clientTag`; no separate portfolios table).
- **PDF render (Sprint 4):** extended with agency theming/branding (`agency_brand_assets`).
- **Audit scheduling:** scheduled recurring audits added (cross-client cadence).
- **Organizations:** GA4 / Looker Studio export columns (`ga4_measurement_id`, `ga4_api_secret`).

---

## Sprint 10 — Onboarding + Sample Audit + Stripe Billing · 3 new screens

**New screens**
1. Self-serve setup (`self-serve-setup`) — the `/welcome` onboarding flow
2. Sample audit — free (`sample-audit`) — pre-signup at `/sample-audit`: 1 engine (ChatGPT), 5 prompts, ~90s, ~A$0.10, rate-limited 3/IP/day
3. Upgrade flow (`upgrade`) — Stripe checkout

**Modified existing screens**
- **Signup flow (Sprint 1):** signup → email verify → wizard → first audit; after verify, redirect to **`/brands/wizard`** (not `/dashboard`).
- **Brand wizard (Sprint 4):** on completion, **auto-triggers the first audit** using the new user's tier rules.
- **Pricing page (Sprint 1):** becomes **functional** — Stripe checkout wired (one-off A$299 + annual prices + customer portal + webhooks).
- **Navigation / shell:** first-time UX state machine — nav hints to a "complete your first audit" CTA until the first audit completes (`org.metadata.firstTimeFlowComplete`).

---

## Sprint 11 — Polish + Landing + Onboarding · 3 new screens

**New screens**
1. Landing v2 (`landing-v2`) — marketing landing `/` (hero, social proof, demo CTA, pricing teaser)
2. Methodology page (`methodology`) — public 47-citability-methods page
3. Documentation hub (`docs`)
- Plus route stubs: **About / Privacy / Terms**, and **404 / 500** error pages.

**Modified existing screens**
- **Landing page (Sprint 1):** replaced/upgraded by Landing v2.
- **Pricing page (Sprint 10 functional → Sprint 11 crisp/polished).**
- **Brand wizard (Sprint 4):** add `<ProgressStepper currentStep>` to the header + smooth step transitions.
- **"First audit running" screen (`running/page.tsx`, Sprint 10):** copy polished → "Your first audit is running! ⚡".
- **Dashboard page (Sprint 3 server component):** IM1 fix — welcome/first-time content added.
- **Sidebar (Sprint 4)** and **Action Center entry (Sprint 6):** `data-tour` hooks added for the product tour.
- Error / loading states added across screens.

---

## Sprint 12 — Launch Readiness · 2 new screens
Mostly infrastructure (Sentry, monitoring, backups, load testing, security audit, legal finalisation, production deploy) — light on screens.

**New screens**
1. Beta feedback (`beta-feedback`)
2. Launch checklist — internal (`launch-checklist`)
- Plus the **cookie-consent banner** (mounts in both marketing and auth layouts → affects every page).

**Modified existing screens / cross-sprint file changes (JO4 — Sprint 12 must update 6 earlier-sprint files)**
- `feature-flags`, `inngest/index.ts`, `dashboard/page.tsx`, `DashboardView`, `PricingCard`, `error.tsx`.
- **Clerk webhook (Sprint 1):** add the missing svix signature verification.
- **Privacy / Terms (Sprint 11 stubs):** finalised (9-section ToS, NSW governing law).

---

### Quick totals
| Sprint | New screens | Headline modifications |
|---|---|---|
| 7 | 7 (+ technical-audit page) | audit list (+technical badge), Run-Audit fires both, completion email |
| 8 | 5 | audit list (drift badge), export route (sarif/junit/gha) |
| 9 | 4 | top-bar workspace switcher, brands.clientTag, PDF theming, scheduling |
| 10 | 3 | signup flow, wizard auto-audit, pricing page (Stripe), nav first-time state |
| 11 | 3 (+ About/Privacy/Terms, 404/500) | landing replaced, pricing polish, wizard stepper, running-screen copy |
| 12 | 2 (+ cookie banner) | 6 cross-sprint files, Clerk webhook svix, legal finalised |

**Note:** auth currently migrating Clerk → Better Auth, so "Clerk" references above become Better Auth equivalents.
