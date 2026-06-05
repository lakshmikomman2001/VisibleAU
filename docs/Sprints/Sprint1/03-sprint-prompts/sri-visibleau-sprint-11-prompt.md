# Sprint 11 — Polish + Landing + Onboarding

**Sprint:** 11 of 12
**Estimated effort:** 10-15 hours (~2 weekends at 8 hrs/week)
**Goal:** Take the working product to launch-ready. Landing page, pricing polish, onboarding polish, error/loading states, 404/500 pages, public methodology page (47 citability methods), Loom demo recordings.
**Prerequisites:** Sprint 10 complete. Stripe billing working.
**Out of scope:** Production deployment + monitoring (Sprint 12), advanced analytics (v1.1).

---

## 0. Read first

1. `CLAUDE.md`
2. `sri-geo-aeo-prd-v1.md` v1.15 §11 Sprint 11 (deliverables) + §12 Go-to-Market (marketing copy guidance) + §13 Success Metrics (what to surface) — pre-launch marketing copy is operator-authored; Sprint 11 implements the routes.
3. Existing prototype screens: marketing/landing variants in `visibleau-prototype.jsx`

---

## 1. What ships this sprint

- ✓ Marketing landing page (`/`) — hero, social proof, demo CTA, pricing teaser
- ✓ Pricing page polish (Sprint 10 made it functional; Sprint 11 makes it crisp)
- ✓ About / Privacy / Terms pages (stubs operator fills in via CMS — Sprint 11 ships routes + boilerplate text)
- ✓ Onboarding flow refinement: signup → email verify → wizard → first audit running screen
- ✓ Product tour overlay (lightweight — 4 hotspots highlighting sidebar nav, run audit button, results, action center)
- ✓ Error states: 404 page, 500 page, generic error boundary
- ✓ Loading states: skeleton screens for dashboard, brand list, audit results
- ✓ Empty states: every list page has a polished empty state with CTA
- ✓ **Public methodology page** at `/methodology` (Sprint 7 stubbed; Sprint 11 polishes) — renders top-10 of the 47 citability methods catalogue with effect-size deltas, "Show all 47" disclosure, named research citations (Princeton KDD 2024, AutoGEO ICLR 2026, Tinuiti, SE Ranking)
- ✓ **Loom demo recordings** — 3-4 short demos (~90s each) embedded on landing + pricing pages:
  - Sample audit walkthrough (Sprint 10's flow)
  - Brand setup wizard (Sprint 4)
  - Audit results + Action Center (Sprint 3 + Sprint 6)
  - Agency tier overview (Sprint 9)
- ✓ Trust signals: security badges (SSL, GDPR-aware copy), placeholder testimonials section
- ✓ SEO meta tags + Open Graph + sitemap.xml + robots.txt
- ✓ Mobile audit of every page (DevTools mobile preview pass)

**Definition of done:** A first-time visitor to `/` understands what VisibleAU does within 10 seconds. They can try the sample audit (built Sprint 10) and the landing page polish guides them through. If they sign up, the onboarding polish carries them through wizard + first audit. Every error state has a useful page. `/methodology` renders 47 citability methods.

---

## 2. Dependencies to install

```bash
# Optional: product tour
pnpm add react-joyride

# (Upstash dependency removed v1.2 — owned by Sprint 10 sample-audit infrastructure)
```

If you skip react-joyride, build the tour with shadcn Popover + custom positioning.

---

## 3. Environment variables

```bash
# (Upstash env vars removed v1.2 — Sprint 10 owns sample audit rate-limiting)

# SEO
NEXT_PUBLIC_APP_NAME=VisibleAU
NEXT_PUBLIC_APP_DESCRIPTION="Audit your brand's visibility across AI search engines"
```

---

## 4. Project structure additions

```
app/(marketing)/
├── page.tsx                              # ENHANCED — landing
├── pricing/page.tsx                      # POLISH — Sprint 10 functional, Sprint 11 visual polish
├── about/page.tsx                        # NEW
├── privacy/page.tsx                      # NEW
├── terms/page.tsx                        # NEW
└── layout.tsx                            # ENHANCED — marketing header/footer

# (sample-audit/page.tsx + app/api/sample-audit/route.ts owned by Sprint 10, removed from Sprint 11 v1.2)

app/
├── not-found.tsx                         # 404 page
├── error.tsx                             # Error boundary
└── loading.tsx                           # Top-level loading state

lib/
└── seo/
    └── metadata.ts                       # Shared OG / SEO helpers

# (lib/ratelimit/ owned by Sprint 10, removed from Sprint 11 v1.2)

components/domain/
├── landing/
│   ├── hero.tsx
│   ├── how-it-works.tsx                  # 3-step diagram
│   ├── engines-supported.tsx             # 4 engine logos
│   ├── verticals-supported.tsx           # 3 vertical cards
│   ├── pricing-teaser.tsx
│   ├── faq-section.tsx
│   ├── testimonials.tsx                  # Placeholder if Sri has no testimonials yet
│   └── footer.tsx
├── onboarding/
│   ├── welcome-modal.tsx                 # Shows on first dashboard visit
│   └── product-tour.tsx                  # 4-step tour
├── shared/
│   ├── empty-state.tsx                   # Reusable
│   ├── skeleton/                         # Various skeleton screens
│   └── error-boundary.tsx
└── sample/
    ├── sample-audit-form.tsx             # Domain input
    └── sample-audit-results.tsx          # Simplified results

public/
├── og-image.png                          # Default OG image
├── robots.txt
└── sitemap.xml                           # Generated at build time

tests/
├── unit/
│   └── seo/
│       └── metadata.test.ts
└── e2e/
    ├── landing.spec.ts                   # First impression checks
    ├── sample-audit.spec.ts              # No-signup flow
    └── onboarding.spec.ts                # Signup to first audit
```

---

## 5. Database schema

No new tables. Sample audit results live in normal `audits` table with `metadata.source='sample'` flag and `organizationId=null` (or a special "sample" org).

Optional: add migration to allow `organizationId` nullable when `metadata.source='sample'` — but cleaner: create a synthetic "sample" organization at seed time, all sample audits attach to it. Auto-deleted after 24h via Inngest cron.

---

## 6. Landing page structure

`/` sections top-to-bottom (per prototype Landing variants):

1. **Header:** logo, nav (Pricing, About, Sign in, Get started)
2. **Hero:**
   - Headline: "See your brand in ChatGPT, Claude, Gemini, and Perplexity"
   - Subhead: "Get an honest read on how AI search engines describe your business. Built for Australian SMBs."
   - CTA: "Try a free sample audit" → `/sample-audit`
   - Secondary CTA: "See pricing" → `/pricing`
3. **How it works:** 3-step diagram (Enter domain → up to 200 LLM calls across 4 engines → See score + recommendations). Free tier note: "Free runs 100 calls across 2 engines."
4. **Engines supported:** 4 engine logos with "Coming soon: Copilot, Google AI Overviews (Q3)"
5. **Verticals:** 3 cards — AU Tradies / Allied Health / SaaS — with prompt count badges
6. **What's measured:** 5 dimensions (Frequency / Position / Sentiment / Context / Accuracy) — visual
7. **Pricing teaser:** 4 paid tier cards with "From A$X/mo"
8. **FAQ:** 8-10 common questions (cost? privacy? data retention?)
9. **Footer:** copyright, links to Privacy/Terms, social

---

## 7. Sample audit no-signup flow

`/sample-audit`:

1. User enters domain + vertical
2. POST `/api/sample-audit` (rate-limited: 3 per IP per day via Upstash)
3. Sample audit kicks off: 2 engines (ChatGPT + Claude) × 5 prompts × 1 run = 10 calls
4. Live progress UI (same component as logged-in audit running, simplified)
5. Result page: composite score + 5 dim cards (simplified, no detailed citations)
6. CTA: "Run a full audit (all 4 engines, 200 calls) — start free"

Implementation:
- Always uses `LLM_MODE=mock` if `SAMPLE_AUDIT_USE_REAL=false` (default for cost control)
- If real LLM enabled, budget: <$0.50 per sample
- Results NOT emailed (no email captured)
- Sample audits expire after 24h (Inngest cron deletes them)

Rate limiting:
```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(3, '24 h'),
});

const { success } = await ratelimit.limit(`sample:${ip}`);
if (!success) return Response.json({ error: 'Daily limit reached' }, { status: 429 });
```

---

## 8. Error + loading states

### `app/not-found.tsx`

Friendly 404 with: "Couldn't find that page" + back-to-dashboard link + sample of recent audits if logged in.

### `app/error.tsx`

Error boundary: shows generic "Something went wrong" + retry button + link to support email. Logs to Sentry (configured Sprint 12).

### Skeleton screens

For each major page (dashboard, brand list, audit results, action center):
- Use shadcn Skeleton primitives
- Match real layout
- Display while server component fetches

---

## 9. Product tour

Lightweight 4-step tour shown on first dashboard visit (one-time via localStorage flag):

1. Sidebar nav: "Your brands, audits, and insights live here"
2. "Run audit" button: "Click here to run a fresh audit"
3. KPI cards: "Track your visibility over time"
4. Action Center: "We turn audits into specific recommendations"

Each step: highlighted element + tooltip with text + Next/Skip buttons.

---

## 10. SEO + Open Graph

`lib/seo/metadata.ts`:

```typescript
export function buildMetadata({ title, description, path }: { title?: string; description?: string; path: string; }) {
  const fullTitle = title ? `${title} | VisibleAU` : 'VisibleAU — AI Search Visibility for Australian SMBs';
  return {
    title: fullTitle,
    description: description ?? process.env.NEXT_PUBLIC_APP_DESCRIPTION,
    openGraph: {
      title: fullTitle,
      description: description ?? '...',
      images: ['/og-image.png'],
      url: `${process.env.NEXT_PUBLIC_APP_URL}${path}`,
    },
    twitter: { card: 'summary_large_image' },
  };
}
```

Use in every public page's `generateMetadata` function.

`public/robots.txt`:
```
User-agent: *
Allow: /
Disallow: /api/
Disallow: /dashboard
Sitemap: https://visibleau.com/sitemap.xml
```

`sitemap.xml` generated at build via `next-sitemap` package OR hand-maintained for v1.

---

## 11. Claude Code prompt (paste this when starting Sprint 11)

```
We're building VisibleAU Sprint 11: launch-ready polish. Sprint 10 made billing work.
Sprint 11 makes the product feel professional — first impressions matter.

The most important deliverable: the landing page and sample audit flow. These are
what visitors see before they sign up.

Sprint 11 deliverables, in order:

1. LANDING PAGE (the big one)
   - app/(marketing)/page.tsx with 9 sections per §6
   - components/domain/landing/* per §4
   - Hero CTA → /sample-audit
   - Pricing teaser → /pricing
   - Use Sri's brand voice copy if provided; else placeholder + flag for review

2. SAMPLE AUDIT FLOW
   - app/(marketing)/sample-audit/page.tsx
   - app/api/sample-audit/route.ts with Upstash rate limit per §7
   - Synthetic "sample" organization for tenancy
   - Inngest cron deletes sample audits after 24h
   - Default to mock LLM mode for cost control

3. PRICING POLISH
   - Sprint 10's functional pricing → Sprint 11 visual polish
   - Tier comparison table on mobile collapsible
   - GST toggle prominent for AU users
   - "Most popular" badge on Growth tier
   - Annual billing option (10% discount) — stretch goal

4. ERROR + LOADING STATES
   - app/not-found.tsx, app/error.tsx, app/loading.tsx
   - Skeleton screens for dashboard, brand list, audit results, action center
   - Empty states for every list page (no brands, no audits, no recommendations)

5. ONBOARDING
   - Signup → email verify (Clerk handles) → /brands/wizard (Sprint 4)
   - Welcome modal on first dashboard visit
   - 4-step product tour with react-joyride OR custom popovers
   - localStorage flag to never re-show

6. BOILERPLATE PAGES
   - app/(marketing)/about/page.tsx (operator-provided copy)
   - app/(marketing)/privacy/page.tsx (legal copy — Sri provides via CMS or hardcoded)
   - app/(marketing)/terms/page.tsx (same)

7. SEO
   - lib/seo/metadata.ts helper
   - generateMetadata() on every public route
   - public/robots.txt, public/sitemap.xml
   - public/og-image.png (1200×630 branded image)

8. MOBILE AUDIT
   - Walk every page in mobile DevTools preview
   - Fix any horizontal overflow, touch target sizes, font-size readability
   - Test on real phone if possible

9. TESTS
   - E2E: first-impression flow (visit /, click Try sample, complete sample audit)
   - E2E: signup → onboarding → first brand → first audit
   - Accessibility: axe-core scan on landing + pricing + dashboard

POTENTIAL BLOCKERS:
- Landing page copy depends on Sri's brand voice. Use placeholders + flag for review
- Privacy/Terms legal copy: Sri should source from a template (e.g., Termly) or lawyer
- Sample audit cost: if real LLM enabled, monitor closely; recommend mock-only for launch

Start with step 1 (landing). After that's rendering cleanly, step 2 (sample audit).
```

---

## 12. Tests required

- E2E: landing page first impression (CTA visible above fold, sample audit reachable in ≤2 clicks)
- E2E: sample audit no-signup flow
- E2E: signup → onboarding → first audit
- Accessibility: axe-core scan with no critical issues

---

## 13. Acceptance criteria

- [ ] Landing page renders with all 9 sections
- [ ] "Try sample audit" CTA works (no signup, rate-limited)
- [ ] Pricing page polished with comparison + GST toggle
- [ ] 404, 500, error boundary all render gracefully
- [ ] Skeleton screens on dashboard / brand list / audit results
- [ ] Product tour shows once on first dashboard visit
- [ ] OG image present + correct on social share preview
- [ ] robots.txt + sitemap.xml accessible
- [ ] Mobile: no horizontal scroll on any page <375px width
- [ ] Privacy + Terms pages exist with legal copy

---

## 14. Common pitfalls / Sprint 11 anti-patterns

- **Do not** ship a landing page with "Lorem ipsum." Use real copy or operator-flagged placeholders, not Latin.
- **Do not** make sample audit too capable. It's a teaser, not a free product. 2 engines × 5 prompts × 1 run is the cap.
- **Do not** force product tour every visit. localStorage flag is mandatory.
- **Do not** ship without a privacy policy. Australian Privacy Act applies. Use a template even if you'll polish later.
- **Do not** use real customer testimonials without permission.

---

## 15. Handoff to Sprint 12

Ready:
- ✓ Product is launch-ready feature-wise — Sprint 12 handles production infrastructure
- ✓ Sample audit working (Sprint 10) — gives Sprint 12 something to load-test against

Not ready:
- Sentry monitoring (Sprint 12)
- Production deployment (Sprint 12)
- Pre-launch marketing rollout (Sprint 12)

---

## Changelog

- v1.2 (13 May 2026): **Second-pass-fix audit.** **(N6)** v1.1 changelog claimed sample-audit infrastructure was removed from §4, but actual references remained: Upstash deps in §2, env vars in §3, `app/(marketing)/sample-audit/`, `app/api/sample-audit/route.ts`, `lib/ratelimit/` in §4. All now stripped. Sprint 10 v2.0+ owns the entire sample audit. **(N11)** Broken PRD §17 reference fixed — PRD only goes to §16 + Appendices. §0 read-first list now references PRD §11 Sprint 11 + §12 Go-to-Market + §13 Success Metrics. PRD doc reference bumped to v1.15.
- v1.1 (12 May 2026): Conflict-resolution fixes per audit C3 + L8 + L9. Sample audit deliverable removed (moved to Sprint 10 v2.0 at PRD canonical spec: 1 engine ChatGPT, 5 prompts, 1 run). Added `/methodology` public page polish (47 citability methods catalogue from Sprint 7, surface top-10 publicly per PRD §11 Sprint 11). Added Loom demo recordings deliverable (3-4 demos × 90s each on landing + pricing pages per PRD §11 Sprint 11). Sample audit-related infrastructure refs (Upstash, sample-audit route, components) removed from §4 since Sprint 10 now owns them.
- v1.0 (12 May 2026): Initial. Net-new sprint prompt.
