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
  **IO5 fix: "onboarding flow refinement" — what does Sprint 11 actually change vs Sprint 10?**
  Sprint 10 HH3 specifies `/onboarding` renders BrandWizard. Sprint 11 onboarding refinements:
  1. **Add `<ProgressStepper currentStep={wizardStep} />`** (IN5) to BrandWizard header — visual step indicator
  2. **Smooth transitions between wizard steps** — animate step content with CSS or Framer Motion
  3. **"First audit running" screen** = the `running/page.tsx` (Sprint 10 HJ1) — Sprint 11 polishes its copy:
     change "Running your sample audit…" to "Your first audit is running! ⚡" (tone matches WelcomeModal HE4)
  4. **No new pages or routes** — Sprint 11 refinements are CSS/copy polish on existing Sprint 10 pages
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
  **IF4 fix: embed component and placeholder never specified. Canonical Loom embed pattern:**
  ```typescript
  // components/shared/loom-embed.tsx
  export function LoomEmbed({ loomId, title, placeholder = true }: {
    loomId?: string; title: string; placeholder?: boolean;
  }) {
    if (!loomId || placeholder) {
      // Sri hasn't recorded yet — show a branded placeholder:
      return (
        <div className="aspect-video bg-muted rounded-xl flex flex-col items-center
                        justify-center gap-2 border border-dashed">
          <PlayCircle className="w-12 h-12 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{title} — demo coming soon</p>
        </div>
      );
    }
    return (
      <div className="aspect-video rounded-xl overflow-hidden">
        <iframe
          src={`https://www.loom.com/embed/${loomId}?hide_owner=true&hide_share=true`}
          allowFullScreen className="w-full h-full" title={title}
        />
      </div>
    );
  }
  // Usage: <LoomEmbed loomId={process.env.NEXT_PUBLIC_LOOM_SAMPLE_AUDIT_ID} title="Sample audit walkthrough" />
  // Env vars: NEXT_PUBLIC_LOOM_SAMPLE_AUDIT_ID, NEXT_PUBLIC_LOOM_WIZARD_ID, etc.
  ```
- ✓ Trust signals: security badges (SSL, GDPR-aware copy), placeholder testimonials section
  **IJ1 fix: "security badges (SSL, GDPR-aware copy)" — no component or placement specified.**
  Add `components/domain/landing/trust-badges.tsx`:
  ```typescript
  // Appears below Hero CTA buttons — social proof before the fold break.
  export function TrustBadges() {
    const badges = [
      { icon: '🔒', text: 'SSL encrypted' },
      { icon: '🇦🇺', text: 'Australian Privacy Act 1988 compliant' },
      { icon: '🗑️', text: 'Prompt data deleted within 24h' },
      { icon: '💳', text: 'No credit card for free plan' },
    ];
    return (
      <div className="flex flex-wrap justify-center gap-4 mt-6">
        {badges.map(b => (
          <div key={b.text} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>{b.icon}</span><span>{b.text}</span>
          </div>
        ))}
      </div>
    );
  }
  // Note: "GDPR-aware copy" — VisibleAU is an Australian business; GDPR applies to EU users.
  // Use "Privacy Act 1988 compliant" as primary. Add "GDPR-aware" only if actively targeting EU.
  ```
  Place in `hero.tsx` below the CTA buttons. Also add to §4 landing components list.
- ✓ SEO meta tags + Open Graph + sitemap.xml + robots.txt
- ✓ Mobile audit of every page (DevTools mobile preview pass)

**Definition of done:** A first-time visitor to `/` understands what VisibleAU does within 10 seconds. They can try the sample audit (built Sprint 10) and the landing page polish guides them through. If they sign up, the onboarding polish carries them through wizard + first audit. Every error state has a useful page. `/methodology` renders 47 citability methods.

---

## 2. Dependencies to install

```bash
# Optional: product tour
pnpm add react-joyride

# IB4 fix: §10 uses next-sitemap for sitemap.xml generation but it was never in §2.
# Without this, `next-sitemap` postbuild step fails with 'Cannot find module':
pnpm add next-sitemap

# IK5 fix: §12 tests require axe-core accessibility scans — never in §2 dependencies.
# @axe-core/playwright integrates with the existing Playwright E2E test setup:
pnpm add -D @axe-core/playwright axe-core

# (Upstash dependency removed v1.2 — owned by Sprint 10 sample-audit infrastructure)
```

If you skip react-joyride, build the tour with shadcn Popover + custom positioning.
**IB5 fix: fallback never specified. Canonical shadcn Popover approach:**
```typescript
// components/domain/onboarding/product-tour.tsx  ('use client')
// Props: { onComplete: () => void } — parent calls POST /api/onboarding/tour-complete
// State: step 0-3 (4 steps). Each step: { target: string; title: string; body: string }
// Render: fixed-position Popover anchored to document.querySelector(step.target).
// Steps: [
//   { target: '[data-tour="sidebar"]',       title: 'Your brands & audits', body: '...' },
//   { target: '[data-tour="run-audit"]',      title: 'Run a fresh audit',   body: '...' },
//   { target: '[data-tour="kpi-cards"]',      title: 'Track visibility',    body: '...' },
//   { target: '[data-tour="action-center"]',  title: 'Action Center',       body: '...' },
// ]
// Each sidebar/dashboard element needs data-tour="..." attribute added.
// "Next" advances step; "Skip" or step 4 calls onComplete() which fires tour-complete API.
```

---

## 3. Environment variables

```bash
# (Upstash env vars removed v1.2 — Sprint 10 owns sample audit rate-limiting)

# SEO
NEXT_PUBLIC_APP_NAME=VisibleAU
NEXT_PUBLIC_APP_DESCRIPTION="Audit your brand's visibility across AI search engines"
# IB1 fix: buildMetadata (§10) uses NEXT_PUBLIC_APP_URL for OG url field — was missing from §3.
# Without this, OG URLs render as 'undefined/pricing' breaking all social share previews:
NEXT_PUBLIC_APP_URL=https://visibleau.com   # production; use http://localhost:3000 in dev

# IK1 fix: LoomEmbed component (IF4) uses NEXT_PUBLIC_LOOM_* env vars — missing from §3.
# Loom video IDs from your Loom dashboard (https://www.loom.com/looms).
# Leave blank during development — LoomEmbed shows branded placeholder if undefined:
NEXT_PUBLIC_LOOM_SAMPLE_AUDIT_ID=         # e.g. abc123def456 (from Loom share URL)
NEXT_PUBLIC_LOOM_WIZARD_ID=               # Brand setup wizard demo
NEXT_PUBLIC_LOOM_RESULTS_ID=              # Audit results + Action Center demo
NEXT_PUBLIC_LOOM_AGENCY_ID=               # Agency tier overview demo
```

---

## 4. Project structure additions

```
app/(marketing)/
├── page.tsx                              # ENHANCED — landing
│   # II1 fix: page body never written. Assembles all 9 sections from §6 in order:
│   # import type { Metadata } from 'next';
│   # import { buildMetadata } from '@/lib/seo/metadata';
│   # import { Hero } from '@/components/domain/landing/hero';
│   # import { TrustBadges } from '@/components/domain/landing/trust-badges';  // IJ1 + IL5
│   # import { HowItWorks } from '@/components/domain/landing/how-it-works';
│   # import { EnginesSupported } from '@/components/domain/landing/engines-supported';
│   # import { VerticalsSupported } from '@/components/domain/landing/verticals-supported';
│   # import { WhatsMeasured } from '@/components/domain/landing/dimensions';
│   # import { PricingTeaser } from '@/components/domain/landing/pricing-teaser';
│   # import { FaqSection } from '@/components/domain/landing/faq-section';
│   # import { Testimonials } from '@/components/domain/landing/testimonials';
│   #
│   # export function generateMetadata(): Metadata {
│   #   return buildMetadata({ title: undefined, path: '/' });  // uses default title
│   # }
│   #
│   # export default function LandingPage() {
│   #   return (
│   #     <>
│   #       <Hero />               {/* §6 section 2 */}
│   #       <TrustBadges />        {/* IJ1: SSL/Privacy Act badges below hero — IL5 adds to assembly */}
│   #       <HowItWorks />         {/* §6 section 3 */}
│   #       <EnginesSupported />   {/* §6 section 4 */}
│   #       <VerticalsSupported /> {/* §6 section 5 */}
│   #       <WhatsMeasured />      {/* §6 section 6 */}
│   #       <PricingTeaser />      {/* §6 section 7 */}
│   #       <Testimonials />       {/* §6 section 7b — bonus/social proof, not one of 9 (IM3) */}
│   #       <FaqSection />         {/* §6 section 8 */}
│   #     </>
│   #   );
│   # }
│   # Note: Header (§6 section 1) + Footer (§6 section 9b) are in layout.tsx (II2).
├── pricing/page.tsx                      # POLISH — Sprint 10 functional, Sprint 11 visual polish
│   # IO3 fix: "Sprint 11 visual polish" — never specified what Sprint 11 changes.
│   # Sprint 10's pricing page renders <PricingTableClient currentTier={} defaultIncGst={} />
│   # Sprint 11 minimal additions (do NOT re-implement Sprint 10's billing infrastructure):
│   # 1. Import and render <TierComparisonTable /> (IN4) below PricingTableClient
│   # 2. Pass isMostPopular={tier === 'growth'} — already handled by HI4 PricingTableClient IL4
│   # 3. Make BillingIntervalToggle "Save 2 months" badge prominent (CSS update in HF2)
│   # 4. Add generateMetadata() export:
│   #    export function generateMetadata() {
│   #      return buildMetadata({ title: 'Pricing', path: '/pricing',
│   #        description: 'Transparent AU pricing for AI search visibility. From A$99/mo inc. GST.' });
│   #    }
├── about/page.tsx                        # NEW
├── privacy/page.tsx                      # NEW
├── terms/page.tsx                        # NEW
├── methodology/page.tsx                  # ID1 fix: §1 deliverable + Definition of Done — MISSING from §4.
│                                         # Renders top-10 of 47 citability methods from Sprint 7 corpus.
│                                         # "Show all 47" disclosure pattern.
│                                         # Named research citations: Princeton KDD 2024, AutoGEO ICLR 2026,
│                                         # Tinuiti, SE Ranking. Each method: title + effect-size delta.
│                                         # Public route — no auth required. buildMetadata for SEO.
│                                         # II4 fix: body and data source never specified.
│                                         # Data source: Sprint 7 corpus fixture at lib/methodology/methods.ts
│                                         # IL3 fix: methods.ts schema never specified. Each entry:
│                                         # export type CitabilityMethod = {
│                                         #   id: string;           // e.g. 'schema-faq-markup'
│                                         #   name: string;         // e.g. 'FAQ Schema Markup'
│                                         #   dimension: 'frequency'|'position'|'sentiment'|'context'|'accuracy';
│                                         #   effectSizeDelta: string; // e.g. '+12%' or '+0.8 position'
│                                         #   description: string;  // 1-2 sentence explanation
│                                         #   citation: string;     // e.g. 'Princeton KDD 2024'
│                                         #   citationUrl?: string; // link to paper/source
│                                         #   effort: 'low'|'medium'|'high';
│                                         # }
│                                         # File is operator-authored — Sri populates all 47 entries from Sprint 7 corpus.
│                                         # Sprint 11 delivers the page that renders them; data population is §7's pending work.
│                                         # (47 citability method rows — Sri authors this file with real data).
│                                         # Page pattern:
│                                         # import type { Metadata } from 'next';
│                                         # import { buildMetadata } from '@/lib/seo/metadata';
│                                         # import type { CitabilityMethod } from '@/lib/methodology/methods';
│                                         # // IQ3 fix: Collapsible used below but import never specified:
│                                         # import { Collapsible, CollapsibleTrigger, CollapsibleContent }
│                                         #   from '@/components/ui/collapsible';  // shadcn/ui
│                                         # export default async function MethodologyPage() {
│                                         #   const { top10, all47 } = await getMethodsData();
│                                         #   return (
│                                         #     <article className="max-w-4xl mx-auto px-6 py-16">
│                                         #       <h1>VisibleAU Methodology</h1>
│                                         #       <p>Based on {all47.length} citability methods...</p>
│                                         #       {/* Top 10 always visible: */}
│                                         #       {top10.map(m => <MethodCard key={m.id} method={m} />)}
│                                         #       {/* "Show all 47" — shadcn Collapsible: */}
│                                         #       <Collapsible>
│                                         #         <CollapsibleTrigger>Show all 47 methods</CollapsibleTrigger>
│                                         #         <CollapsibleContent>
│                                         #           {all47.slice(10).map(m => <MethodCard key={m.id} method={m} />)}
│                                         #         </CollapsibleContent>
│                                         #       </Collapsible>
│                                         #       <ResearchCitations />  {/* Princeton KDD 2024, AutoGEO ICLR 2026, Tinuiti, SE Ranking */}
│                                         #     </article>
│                                         #   );
│                                         # }
│                                         # lib/methodology/methods.ts must be authored by Sri (operator data).
└── layout.tsx                            # ENHANCED — marketing header/footer
    # II2 fix: IF1 gave canonical nav items but layout.tsx was never written.
    # 'use client' NOT needed — layout is a server component; nav interactivity via <a> tags.
    # IP2 fix: prototype's PublicNav passes theme+setTheme props for ThemeToggle (useState).
    # A server component cannot use useState. Resolve: extract ThemeToggle as a client island.
    # Create components/shared/theme-toggle.tsx with 'use client' — layout remains a server component:
    # 'use client'
    # import { useEffect, useState } from 'react';
    # export function ThemeToggle() {
    #   const [theme, setTheme] = useState<'light'|'dark'>('light');
    #   useEffect(() => { document.documentElement.classList.toggle('dark', theme === 'dark'); }, [theme]);
    #   return <button onClick={() => setTheme(t => t==='dark'?'light':'dark')}>🌙</button>;
    # }
    # Then import ThemeToggle in layout.tsx without making layout itself 'use client'.
    # import { Footer } from '@/components/domain/landing/footer';
    # import Link from 'next/link';
    # import { Logo } from '@/components/shared/logo';  // or inline SVG
    #
    # export default function MarketingLayout({ children }: { children: React.ReactNode }) {
    #   return (
    #     <>
    #       <header className="h-16 px-8 flex items-center justify-between border-b sticky top-0
    #                          z-50 backdrop-blur-md bg-background/80">
    #         <Link href="/"><Logo /></Link>
    #         <nav className="hidden md:flex items-center gap-7 text-sm text-muted-foreground">
    #           <Link href="/pricing" className="hover:text-foreground transition-colors">Pricing</Link>
    #           <Link href="/methodology" className="hover:text-foreground transition-colors">Methodology</Link>
    #           <Link href="/about" className="hover:text-foreground transition-colors">About</Link>
    #         </nav>
    #         <div className="flex items-center gap-2">
    #           <Link href="/sign-in" className="text-sm px-3 py-1.5 text-muted-foreground hover:text-foreground">
    #             Sign in
    #           </Link>
    #           <Link href="/sign-up" className="btn-primary text-sm px-4 py-2 rounded-lg">
    #             Get started
    #           </Link>
    #         </div>
    #       </header>
    #       <main>{children}</main>
    #       <Footer />
    #     </>
    #   );
    # }

# (sample-audit/page.tsx + app/api/sample-audit/route.ts owned by Sprint 10, removed from Sprint 11 v1.2)

app/
├── not-found.tsx                         # 404 page (IE2 spec)
├── error.tsx                             # Error boundary (IC1: must be 'use client')
└── loading.tsx                           # Top-level loading state
    # IG5 fix: listed but never specified. In Next.js App Router, loading.tsx wraps the
    # page in a Suspense boundary — shown while server components fetch data.
    # export default function Loading() {
    #   return (
    #     <div className="min-h-screen flex items-center justify-center">
    #       <div className="flex flex-col items-center gap-3">
    #         <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
    #       </div>
    #     </div>
    #   );
    # }
    # Note: this top-level loading.tsx is a global fallback. For richer page-specific
    # skeletons, wrap each page's Suspense boundary with the named skeleton components
    # from components/shared/skeleton/ (IF3) rather than relying on this global one.

app/api/
└── onboarding/
    └── tour-complete/route.ts            # IC4 fix: IB5 product-tour calls this but route never created
        # export async function POST(req: Request) {
        #   const currentUser = await getCurrentUser();
        #   if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        #   const [org] = await db.select({ metadata: organizations.metadata })
        #     .from(organizations).where(eq(organizations.id, currentUser.organizationId));
        #   await db.update(organizations)
        #     .set({ metadata: { ...(org?.metadata as any ?? {}), productTourComplete: true } })
        #     .where(eq(organizations.id, currentUser.organizationId));
        #   return NextResponse.json({ ok: true });
        # }

lib/
└── seo/
    └── metadata.ts                       # Shared OG / SEO helpers

# (lib/ratelimit/ owned by Sprint 10, removed from Sprint 11 v1.2)

components/domain/
├── landing/
│   ├── hero.tsx
│   │   # IF5 fix: §6 section 2 specifies exact hero content but hero.tsx has no body.
│   │   # Canonical hero.tsx using §6 content:
│   │   # IP1 fix: hero.tsx uses <Badge> but import never specified.
│   │   # Prototype has a custom Badge (const Badge = ({ tone, children, dot })).
│   │   # Use shadcn Badge for consistency with design system:
│   │   # import { Badge } from '@/components/ui/badge';  // shadcn/ui Badge
│   │   # OR reuse prototype's custom Badge from components/shared/badge.tsx if it exists.
│   │   # Canonical for Sprint 11: shadcn Badge with className override for the hero pill style.
│   │   # export function Hero() {
│   │   #   return (
│   │   #     <section className="relative overflow-hidden py-24 text-center">
│   │   #       <Badge>Built for Australian SMBs</Badge>
│   │   #       <h1 className="mt-6 text-5xl font-bold tracking-tight">
│   │   #         See your brand in ChatGPT, Claude, Gemini, and Perplexity
│   │   #       </h1>
│   │   #       <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
│   │   #         Get an honest read on how AI search engines describe your business.
│   │   #         Built for Australian SMBs.
│   │   #       </p>
│   │   #       <div className="mt-8 flex justify-center gap-3">
│   │   #         <a href="/sample-audit">
│   │   #           <Button size="lg">Try a free sample audit</Button>  {/* Sprint 10 route */}
│   │   #         </a>
│   │   #         <a href="/pricing">
│   │   #           <Button variant="outline" size="lg">See pricing</Button>
│   │   #         </a>
│   │   #       </div>
│   │   #     </section>
│   │   #   );
│   │   # }
│   ├── trust-badges.tsx                  # IO1 fix: IJ1 created component, IL5 added to assembly JSX,
│   │                                     # but IJ1's "Also add to §4 landing components list" was never done.
│   │                                     # Body: IJ1 spec — 4 AU-specific security badges below Hero CTA.
│   ├── how-it-works.tsx                  # 3-step diagram
│   │   # IG1 fix: §6 section 3 gives the 3 steps but component has no body.
│   │   # export function HowItWorks() {
│   │   #   const steps = [
│   │   #     { n: 1, title: 'Enter your domain',
│   │   #       desc: 'Add your business domain and select your industry vertical.' },
│   │   #     { n: 2, title: 'AI engines scan your brand',
│   │   #       desc: 'We send standardised prompts across ChatGPT, Claude, Gemini, and Perplexity.' +
│   │   #             ' Paid: up to 200 calls × 4 engines. Free: 100 calls × 2 engines.' },
│   │   #     { n: 3, title: 'See your visibility score',
│   │   #       desc: 'Get a composite score across 5 dimensions with specific recommendations.' },
│   │   #   ];
│   │   #   return (
│   │   #     <section className="py-20">
│   │   #       <h2 className="text-3xl font-bold text-center mb-12">How it works</h2>
│   │   #       <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
│   │   #         {steps.map(s => (
│   │   #           <div key={s.n} className="text-center">
│   │   #             <div className="w-10 h-10 rounded-full bg-primary text-white font-bold
│   │   #                            flex items-center justify-center mx-auto mb-4">{s.n}</div>
│   │   #             <h3 className="font-semibold mb-2">{s.title}</h3>
│   │   #             <p className="text-sm text-muted-foreground">{s.desc}</p>
│   │   #           </div>
│   │   #         ))}
│   │   #       </div>
│   │   #     </section>
│   │   #   );
│   │   # }
│   ├── engines-supported.tsx             # 4 engine logos
│   │   # IH1 fix: no body, engine names unspecified, "Q3" has no year (ambiguous).
│   │   # Today is May 2026 — "Q3" means Q3 2026 (July–Sept 2026). Pin the year.
│   │   # The 4 engines: ChatGPT (OpenAI), Claude (Anthropic), Gemini (Google), Perplexity.
│   │   # export function EnginesSupported() {
│   │   #   const engines = [
│   │   #     { name: 'ChatGPT',    logo: '/engines/chatgpt.svg',    color: '#10a37f' },
│   │   #     { name: 'Claude',     logo: '/engines/claude.svg',     color: '#D97706' },
│   │   #     { name: 'Gemini',     logo: '/engines/gemini.svg',     color: '#4285F4' },
│   │   #     { name: 'Perplexity', logo: '/engines/perplexity.svg', color: '#6366f1' },
│   │   #   ];
│   │   #   return (
│   │   #     <section className="py-20">
│   │   #       <h2 className="text-3xl font-bold text-center mb-4">Engines we audit</h2>
│   │   #       <div className="flex justify-center gap-8 flex-wrap mb-6">
│   │   #         {engines.map(e => (
│   │   #           <div key={e.name} className="flex flex-col items-center gap-2">
│   │   #             <div className="w-16 h-16 rounded-2xl border flex items-center justify-center"
│   │   #                  style={{ borderColor: e.color + '33' }}>
│   │   #               {/* Use Next.js Image with engine SVG logo from /public/engines/ */}
│   │   #               <span className="text-2xl font-bold" style={{ color: e.color }}>
│   │   #                 {e.name[0]}
│   │   #               </span>
│   │   #             </div>
│   │   #             <span className="text-sm font-medium">{e.name}</span>
│   │   #           </div>
│   │   #         ))}
│   │   #       </div>
│   │   #       <p className="text-center text-sm text-muted-foreground">
│   │   #         Coming soon: Microsoft Copilot, Google AI Overviews (Q3 2026)
│   │   #         {/* IH1: "Q3" pinned to Q3 2026 — July–September 2026 */}
│   │   #       </p>
│   │   #     </section>
│   │   #   );
│   │   # }
│   │   # Note: add engine SVG logos to /public/engines/ directory.
│   ├── verticals-supported.tsx           # 3 vertical cards
│   │   # IG2 fix: §6 section 5 specifies "3 cards — AU Tradies / Allied Health / SaaS
│   │   # — with prompt count badges" but component has no body.
│   │   # Prompt counts come from Sprint 5 vertical-pack data (each vertical has N prompts).
│   │   # export function VerticalsSupported() {
│   │   #   const verticals = [
│   │   #     { name: 'AU Tradies', icon: '🔧', desc: 'Plumbers, electricians, builders,\
│   │   #       landscapers, cleaners', prompts: 60, eg: '"best plumber in Bondi"' },
│   │   #     { name: 'Allied Health', icon: '🏥', desc: 'Physios, dentists, optometrists,\
│   │   #       psychologists', prompts: 55, eg: '"recommend a physio in Melbourne"' },
│   │   #     { name: 'Professional Services', icon: '💼', desc: 'Accountants, lawyers,\
│   │   #       financial advisers, IT consultants', prompts: 50,
│   │   #       eg: '"best accountant for small business Sydney"' },
│   │   #   ];
│   │   #   return (
│   │   #     <section className="py-20">
│   │   #       <h2 className="text-3xl font-bold text-center mb-12">
│   │   #         Built for Australian service businesses
│   │   #       </h2>
│   │   #       <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
│   │   #         {verticals.map(v => (
│   │   #           <div key={v.name} className="rounded-xl border p-6">
│   │   #             <div className="text-3xl mb-3">{v.icon}</div>
│   │   #             <h3 className="font-semibold mb-1">{v.name}</h3>
│   │   #             <Badge>{v.prompts} prompt templates</Badge>
│   │   #             <p className="text-sm text-muted-foreground mt-2">{v.desc}</p>
│   │   #             <p className="text-xs text-muted-foreground mt-2">e.g. {v.eg}</p>
│   │   #           </div>
│   │   #         ))}
│   │   #       </div>
│   │   #     </section>
│   │   #   );
│   │   # }
│   ├── pricing-teaser.tsx
│   │   # IH2 fix: IE4 described the content but component body was never written.
│   │   # Must import from Sprint 10's tiers.ts (HE1) and gst.ts (HC2):
│   │   # import { TIER_METADATA } from '@/lib/pricing/tiers';
│   │   # import { addGst } from '@/lib/pricing/gst';
│   │   #
│   │   # const TEASER_TIERS = ['starter', 'growth', 'agency', 'agency_pro'] as const;
│   │   #
│   │   # export function PricingTeaser() {
│   │   #   return (
│   │   #     <section className="py-20 bg-muted/30">
│   │   #       <h2 className="text-3xl font-bold text-center mb-4">Simple, transparent pricing</h2>
│   │   #       <p className="text-center text-muted-foreground mb-10">
│   │   #         All prices inc. GST. Cancel any time.
│   │   #       </p>
│   │   #       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto px-6">
│   │   #         {TEASER_TIERS.map(tier => {
│   │   #           const meta = TIER_METADATA[tier];
│   │   #           const priceIncGst = addGst(meta.priceAudExGst ?? 0);
│   │   #           return (
│   │   #             <div key={tier} className="rounded-xl border bg-background p-5">
│   │   #               <h3 className="font-semibold mb-1">{meta.label}</h3>
│   │   #               <p className="text-2xl font-bold mb-3">
│   │   #                 From A${priceIncGst}<span className="text-sm font-normal">/mo</span>
│   │   #               </p>
│   │   #               <a href="/pricing"><Button variant="outline" size="sm">See details</Button></a>
│   │   #             </div>
│   │   #           );
│   │   #         })}
│   │   #       </div>
│   │   #       <p className="text-center mt-6 text-sm text-muted-foreground">
│   │   #         Enterprise? <a href="mailto:hi@visibleau.com">Contact us</a>
│   │   #       </p>
│   │   #     </section>
│   │   #   );
│   │   # }
│   ├── dimensions.tsx                    # IG3 fix: §6 section 6 "What's measured" — NO component in §4
│   │   # §13 acceptance: "renders with all 9 sections" — this is section 6. Missing = fails acceptance.
│   │   # export function WhatsMeasured() {
│   │   #   const dims = [
│   │   #     { name: 'Frequency',  icon: '📊', desc: 'How often your brand is mentioned' },
│   │   #     { name: 'Position',   icon: '🏆', desc: 'Where you appear in AI response lists' },
│   │   #     { name: 'Sentiment',  icon: '😊', desc: 'Tone of mentions — positive/neutral/negative' },
│   │   #     { name: 'Context',    icon: '🔍', desc: 'Which prompts trigger your brand' },
│   │   #     { name: 'Accuracy',   icon: '✅', desc: 'Whether AI facts about you are correct' },
│   │   #   ];
│   │   #   return (
│   │   #     <section className="py-20 bg-muted/30">
│   │   #       <h2 className="text-3xl font-bold text-center mb-12">What we measure</h2>
│   │   #       <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 max-w-5xl mx-auto">
│   │   #         {dims.map(d => (
│   │   #           <div key={d.name} className="text-center p-4 rounded-xl bg-background border">
│   │   #             <div className="text-2xl mb-2">{d.icon}</div>
│   │   #             <h3 className="font-semibold text-sm mb-1">{d.name}</h3>
│   │   #             <p className="text-xs text-muted-foreground">{d.desc}</p>
│   │   #           </div>
│   │   #         ))}
│   │   #       </div>
│   │   #     </section>
│   │   #   );
│   │   # }
│   ├── faq-section.tsx
│   ├── testimonials.tsx                  # Placeholder if Sri has no testimonials yet
│   │   # IH3 fix: §14 says "Do not use real testimonials without permission" but
│   │   # no placeholder design was specified. Canonical placeholder approach:
│   │   # export function Testimonials({ items }: {
│   │   #   items?: Array<{ quote: string; author: string; company: string; role: string }>;
│   │   # }) {
│   │   #   // If no real testimonials provided: show a "Be among the first" CTA instead.
│   │   #   // This avoids fake testimonials entirely (§14 anti-pattern).
│   │   #   if (!items || items.length === 0) {
│   │   #     return (
│   │   #       <section className="py-20 text-center">
│   │   #         <h2 className="text-3xl font-bold mb-4">Trusted by early adopters</h2>
│   │   #         <p className="text-muted-foreground mb-6 max-w-md mx-auto">
│   │   #           We're in early access. Join and help shape how AI search visibility
│   │   #           is measured for Australian businesses.
│   │   #         </p>
│   │   #         <a href="/sign-up"><Button>Get early access</Button></a>
│   │   #       </section>
│   │   #     );
│   │   #   }
│   │   #   // Real testimonials (when available — only add with written permission):
│   │   #   return (/* grid of quote cards */);
│   │   # }
│   │   # Sri passes items={undefined} for launch; updates to real quotes when collected.
│   └── footer.tsx
│       # IG4 fix: §6 section 9 says "copyright, links to Privacy/Terms, social" — component never spec'd.
│       # Privacy Policy link required on every page under Australia's Privacy Act 1988.
│       # export function Footer() {
│       #   return (
│       #     <footer className="border-t py-8 mt-16">
│       #       <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row
│       #                       items-center justify-between gap-4 text-sm text-muted-foreground">
│       #         <span>© {new Date().getFullYear()} VisibleAU Pty Ltd. All rights reserved.</span>
│       #         <nav className="flex gap-6">
│       #           <a href="/privacy" className="hover:text-foreground transition-colors">Privacy</a>
│       #           <a href="/terms" className="hover:text-foreground transition-colors">Terms</a>
│       #           <a href="/methodology" className="hover:text-foreground transition-colors">Methodology</a>
│       #           <a href="mailto:hi@visibleau.com" className="hover:text-foreground transition-colors">Contact</a>
│       #         </nav>
│       #       </div>
│       #     </footer>
│       #   );
│       # }
│       # Note: "social" links (§6 section 9) — defer to v1.1 when accounts are set up.
├── onboarding/
│   ├── welcome-modal.tsx                 # IN2 fix: Sprint 10 HE4 owns this — Sprint 11 reuses
│   │                                     # (do not recreate; use via IM1/IM5 dashboard page update)
│   ├── progress-stepper.tsx              # IN5 fix: listed in original Sprint 11 spec as "4-step indicator
│   │                                     # (Sprint 4 wizard wrapper)" — missing from §4 entirely.
│   │                                     # Shows step progress during wizard: Add brand → Configure → Run audit → See results
│   │                                     # export function ProgressStepper({ currentStep }: { currentStep: 1|2|3|4 }) {
│   │                                     #   const steps = ['Add brand', 'Configure', 'Run audit', 'See results'];
│   │                                     #   return (
│   │                                     #     <div className="flex items-center gap-2">
│   │                                     #       {steps.map((s, i) => (
│   │                                     #         <div key={s} className={`flex items-center gap-1 text-xs ${i < currentStep ? 'text-primary' : 'text-muted-foreground'}`}>
│   │                                     #           <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${i < currentStep ? 'bg-primary text-white' : 'bg-muted'}`}>{i+1}</span>
│   │                                     #           <span>{s}</span>
│   │                                     #           {i < steps.length - 1 && <span className="mx-1 text-muted-foreground">→</span>}
│   │                                     #         </div>
│   │                                     #       ))}
│   │                                     #     </div>
│   │                                     #   );
│   │                                     # }
│   │                                     # Used in Sprint 4's BrandWizard and onboarding/page.tsx (HH3) header area.
│   └── product-tour.tsx                  # 4-step tour (IB5 + IJ4 spec)
├── shared/
│   ├── empty-state.tsx                   # Reusable (IF2 spec)
│   ├── loom-embed.tsx                    # IO2 fix: IF4 spec — placeholder or iframe embed
│   ├── theme-toggle.tsx                  # IQ1 fix: IP2 extracted ThemeToggle as a client island
│   │                                     # but never added it to §4 shared list.
│   │                                     # 'use client'; useEffect toggles document.documentElement dark class.
│   │                                     # Imported by app/(marketing)/layout.tsx (server component safe).
│   ├── logo.tsx                          # IQ2 fix: II2 layout.tsx imports Logo from @/components/shared/logo
│   │                                     # but logo.tsx was never in §4 at all. Module-not-found at build time.
│   │                                     # export function Logo({ className }: { className?: string }) {
│   │                                     #   return (
│   │                                     #     <span className={cn('font-bold text-lg tracking-tight', className)}>
│   │                                     #       Visible<span className="text-primary">AU</span>
│   │                                     #     </span>
│   │                                     #   );
│   │                                     # }
│   │                                     # v1.1: replace with an SVG logo once brand assets are finalised.
│   │                                     # but was never in §4's shared list. Body: IF4 spec —
│   │                                     # placeholder when loomId undefined; iframe when set.
│   │                                     # Import: import { LoomEmbed } from '@/components/shared/loom-embed'
│   │   # IF2 fix: used on every list page but never specified. Props + canonical variants:
│   │   # export function EmptyState({ icon, title, description, cta }: {
│   │   #   icon?: LucideIcon;
│   │   #   title: string;
│   │   #   description: string;
│   │   #   cta?: { label: string; href: string };
│   │   # }) {
│   │   #   return (
│   │   #     <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
│   │   #       {icon && <Icon className="w-10 h-10 text-muted-foreground" />}
│   │   #       <h3 className="text-base font-semibold">{title}</h3>
│   │   #       <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
│   │   #       {cta && <a href={cta.href}><Button>{cta.label}</Button></a>}
│   │   #     </div>
│   │   #   );
│   │   # }
│   │   # Canonical instances (anti-patterns forbid Lorem ipsum — use real copy):
│   │   # Brands page:  title="Add your first brand" desc="Track how AI search engines describe your business"  cta={{ label: "Add brand", href: "/brands/new" }}
│   │   # Audits page:  title="No audits yet" desc="Run your first audit to see how you appear in AI results" cta={{ label: "Run audit", href: "/brands" }}
│   │   # Actions page: title="No recommendations yet" desc="Complete an audit to get specific action items" cta={{ label: "View audits", href: "/audits" }}
│   ├── skeleton/                         # Various skeleton screens
│   │   # IF3 fix: directory listed with no named files. §1 specifies 4 pages needing skeletons:
│   │   ├── dashboard-skeleton.tsx         # 4 KPI card placeholders + recent audits list
│   │   ├── brand-list-skeleton.tsx        # 3-6 brand card placeholders in a grid
│   │   ├── audit-results-skeleton.tsx     # 5 dimension score cards + citation list placeholders
│   │   └── action-center-skeleton.tsx    # Grouped recommendation item placeholders
│   │   # Each: 'use client' not needed — server skeletons rendered before Suspense boundary resolves
│   │   # Pattern: <Skeleton className="h-24 w-full rounded-lg" /> from shadcn/ui
│   └── error-boundary.tsx
│       # IK3 fix: listed in §4 but body never specified. Different from app/error.tsx (IC1)
│       # which is Next.js page-level. This is a React class Error Boundary for wrapping
│       # client component subtrees (e.g. the audit results chart that may throw):
│       # 'use client';
│       # import { Component, type ReactNode } from 'react';
│       # export class ErrorBoundary extends Component<
│       #   { children: ReactNode; fallback?: ReactNode },
│       #   { hasError: boolean; error?: Error }
│       # > {
│       #   state = { hasError: false, error: undefined };
│       #   static getDerivedStateFromError(error: Error) {
│       #     return { hasError: true, error };
│       #   }
│       #   render() {
│       #     if (this.state.hasError) {
│       #       return this.props.fallback ?? (
│       #         <div className="rounded-lg border border-destructive p-4 text-sm text-destructive">
│       #           Something went wrong in this section.
│       #           <button onClick={() => this.setState({ hasError: false })} className="ml-2 underline">
│       #             Retry
│       #           </button>
│       #         </div>
│       #       );
│       #     }
│       #     return this.props.children;
│       #   }
│       # }
│       # Usage: <ErrorBoundary><AuditResultsChart /></ErrorBoundary>
# IA5 fix: components/domain/sample/ was listed here but v1.2 changelog removed sample
# audit infrastructure from Sprint 11. Sprint 10 owns:
#   components/domain/sample-audit/sample-form.tsx  (HG4)
#   components/domain/sample-audit/live-progress.tsx (HG3)
#   components/domain/sample-audit/result-card.tsx   (HI3)
# Sprint 11 must NOT recreate these. Use Sprint 10's existing components.

public/
├── og-image.png                          # Default OG image (operator-authored — IJ3)
├── engines/                              # IL1 fix: IH1 references /engines/*.svg but dir never in §4.
│   │                                     # These are THIRD-PARTY TRADEMARK LOGOS — operator must source legally.
│   │                                     # Official sources (check current brand guidelines):
│   │   ├── chatgpt.svg                   # OpenAI brand kit: https://openai.com/brand
│   │   ├── claude.svg                    # Anthropic brand kit: https://www.anthropic.com/brand
│   │   ├── gemini.svg                    # Google brand kit: https://about.google/brand-resource-center/
│   │   └── perplexity.svg               # Perplexity brand kit: https://perplexity.ai (press kit)
│   │                                     # Dev fallback: use IH1's letter-initial approach (no trademark risk).
│   │                                     # Production: use official SVGs with attribution per each brand's guidelines.
└── sitemap.xml                           # Generated at build time by next-sitemap

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

No new tables. **IA3 fix: was `organizationId=null` (or synthetic org) — conflicts with Sprint 10 canonical (HC1/HA4/HM2). `audits.organizationId` is NOT NULL. Canonical pattern already shipped in Sprint 10:**
- Synthetic "sample" org (`slug='sample'`) created at seed time via `ensureSampleOrg()`
- All sample audits use `organizationId = sampleOrg.id` and `metadata.isSample = true`
- Inngest cron (`sample-audit-cleanup.ts`, Sprint 10 HB4) deletes them after 24h
- Do NOT make `organizationId` nullable — this breaks RLS and Sprint 10 FK constraints

---

## 6. Landing page structure

`/` sections top-to-bottom (per prototype Landing variants):

1. **Header:** logo, nav (Pricing, About, Sign in, Get started)
   **IF1 fix: prototype `PublicNav` has different nav items (Pricing, Verticals, How it works, Docs, Sign in, Start free) — conflicts with §6's spec. Canonical for Sprint 11 `layout.tsx`:**
   - Nav links: **Pricing** → `/pricing` | **Methodology** (replaces "How it works") → `/methodology` | **About** → `/about`
   - Auth CTAs: **Sign in** → `/sign-in` (Clerk) | **Get started** → `/sign-up` (Clerk)
   - "Verticals" and "Docs" deferred to v1.1 (no dedicated pages yet)
   - Prototype CTA text "Start free" → use "Get started" to match §6
   - `layout.tsx` renders this header + the footer (Privacy · Terms · © VisibleAU 2026)
2. **Hero:**
   - Headline: "See your brand in ChatGPT, Claude, Gemini, and Perplexity"
   - Subhead: "Get an honest read on how AI search engines describe your business. Built for Australian SMBs."
   - CTA: "Try a free sample audit" → `/sample-audit`
   - Secondary CTA: "See pricing" → `/pricing`
3. **How it works:** 3-step diagram (Enter domain → LLM calls across AI engines → See score + recommendations). **IC3 fix: "up to 200 LLM calls across 4 engines" only applies to paid tiers. Copy must be tier-aware:**
   - Paid tier label: "Up to 200 calls across 4 engines (4 engines × 10 prompts × 5 runs)"
   - Free tier note: "Free plan: 100 calls across 2 engines (2 engines × 10 prompts × 5 runs)"
   - Sample audit note: "Free sample: 5 calls, 1 engine (~90 seconds)"
   - Suggest showing the paid-tier number prominently with the free note below it.
4. **Engines supported:** 4 engine logos with "Coming soon: Copilot, Google AI Overviews (Q3)"
5. **Verticals:** 3 cards — AU Tradies / Allied Health / SaaS — with prompt count badges
6. **What's measured:** 5 dimensions (Frequency / Position / Sentiment / Context / Accuracy) — visual
7. **Pricing teaser:** **IE4 fix: "4 paid tier cards" — Sprint 10 TIER_METADATA has 5 paid tiers (Starter/Growth/Agency/Agency Pro/Enterprise). Canonical teaser: show 4 cards (Starter, Growth, Agency, Agency Pro) with their inc-GST "From A$X/mo" prices using `TIER_METADATA.priceAudExGst + addGst()`. Enterprise = "Contact us" — omit from teaser or show as a text-only CTA below the 4 cards.**
7b. **Testimonials** *(social proof — bonus section between 7 and 8, not counted in §6's 9 sections):* **IM3 fix: `<Testimonials />` is in the landing page assembly (II1/IL5) as "section 8" but §6 numbers FAQ as section 8. Testimonials is an unlisted bonus section. The §13 acceptance criterion "all 9 sections" counts only §6's numbered sections 1-9; Testimonials is extra and doesn't affect the count.**
8. **FAQ:** **IE5 fix: "8-10 common questions" with no actual content — §14 anti-pattern says "Do not ship Lorem ipsum". Canonical 8 FAQ entries for `faq-section.tsx`:**
   1. **How does it work?** We send your brand name and domain to ChatGPT, Claude, Gemini, and Perplexity using standardised prompts. We count how often you're mentioned, where, and in what context.
   2. **Does it use real AI engines?** Yes. Every audit calls the actual production APIs — not mocked responses — so results reflect what customers using those tools see right now.
   3. **How much does it cost?** Free plan: 3 audits/month across 2 engines. Starter from A$99/mo inc. GST. See full pricing.
   4. **Is my data safe?** Your domain and business name are sent to LLM providers via their API. We don't store prompt inputs beyond 24 hours. We comply with Australia's Privacy Act 1988.
   5. **How long does an audit take?** 2-5 minutes for a full paid-tier audit (200 LLM calls). Free sample takes ~90 seconds (5 calls, 1 engine).
   6. **Can I cancel anytime?** Yes. No lock-in. Cancel from your billing settings at any time. Your plan remains active until the end of the billing period.
   7. **What industries do you support?** Currently optimised for AU tradies, allied health, and professional services. More verticals added regularly.
   8. **What is "AI visibility" exactly?** It's how often and how positively your business is mentioned when someone asks an AI assistant about your service category and location.

   **IH4 fix: IE5 gave content but `faq-section.tsx` rendering pattern never specified. Use shadcn Accordion:**
   ```typescript
   // import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
   // export function FaqSection() {
   //   return (
   //     <section className="py-20 max-w-3xl mx-auto px-6">
   //       <h2 className="text-3xl font-bold text-center mb-10">Frequently asked questions</h2>
   //       <Accordion type="single" collapsible className="w-full">
   //         {FAQ_ITEMS.map((item, i) => (
   //           <AccordionItem key={i} value={`item-${i}`}>
   //             <AccordionTrigger>{item.q}</AccordionTrigger>
   //             <AccordionContent>{item.a}</AccordionContent>
   //           </AccordionItem>
   //         ))}
   //       </Accordion>
   //     </section>
   //   );
   // }
   // const FAQ_ITEMS = [ /* 8 Q&A objects from IE5 */ ];
   ```
9. **Footer:** copyright, links to Privacy/Terms, social

---

## 7. Sample audit no-signup flow

**II3 fix: This entire §7 section describes Sprint 10's implementation — contradicts ID2 which removed the sample audit from Sprint 11's Claude Code prompt. Sprint 10 owns all sample audit infrastructure (routes, rate-limiting, components, cron, synthetic org). Sprint 11's responsibility is limited to:**

- The landing page hero CTA: `<a href="/sample-audit">Try a free sample audit</a>` — points to Sprint 10's route
- The `<LoomEmbed>` component (IF4) on the landing page showing the sample audit walkthrough demo
- NOT implementing any new sample audit routes, components, or rate-limiting

**For Sprint 10 implementation details, see Sprint 10 spec: HB3 (route), HB4 (cleanup cron), HB5 (rate-limit), HC1 (synthetic org), HE2 (result page), HG3 (live progress), HG4 (form), HJ1 (running page).**

---

## 8. Error + loading states

### `app/not-found.tsx`

Friendly 404 with: "Couldn't find that page" + back-to-dashboard link + sample of recent audits if logged in.

**IE2 fix: "shows recent audits if logged in" — the auth pattern in `not-found.tsx` was never specified. Canonical implementation:**
```typescript
// not-found.tsx is a server component — Clerk's auth() IS available here
// (Clerk middleware runs before not-found, so auth context exists)
import { auth } from '@clerk/nextjs/server';

export default async function NotFound() {
  const { userId } = auth();  // null if unauthenticated — no redirect
  let recentAudits: Array<{ id: string; brandName: string; scoreComposite: number | null }> = [];

  if (userId) {
    // Fetch up to 3 recent audits — wrapped in try/catch to never block the 404:
    try {
      const currentUser = await getCurrentUser();
      if (currentUser) {
        await setRlsContext(db, currentUser.organizationId);
        recentAudits = await db.select({ id: audits.id, brandName: brands.name,
          scoreComposite: audits.scoreComposite })
          .from(audits).innerJoin(brands, eq(audits.brandId, brands.id))
          .where(eq(brands.organizationId, currentUser.organizationId))
          .orderBy(desc(audits.createdAt)).limit(3);
      }
    } catch { /* silently skip — never block the 404 page */ }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold">404</h1>
      <p>Couldn't find that page.</p>
      <a href={userId ? '/dashboard' : '/'}>
        {userId ? '← Back to dashboard' : '← Back to home'}
      </a>
      {recentAudits.length > 0 && (
        <div><h3>Your recent audits:</h3>
          {recentAudits.map(a => <a key={a.id} href={`/audits/${a.id}`}>{a.brandName}</a>)}
        </div>
      )}
    </div>
  );
}
```

### `app/error.tsx`

**IC1 fix: `error.tsx` MUST be a Client Component in Next.js App Router. Missing `'use client'` causes a build error: "error.tsx must be a Client Component". Canonical:**
```typescript
'use client';  // REQUIRED — error boundaries use React state/effects

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Sentry.captureException(error);  // Sprint 12 adds Sentry — leave this commented for now
    console.error('Error boundary caught:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        {error.digest ? `Error ID: ${error.digest}` : 'An unexpected error occurred.'}
      </p>
      <div className="flex gap-2">
        <button onClick={reset}>Try again</button>
        <a href="mailto:support@visibleau.com">Contact support</a>
      </div>
    </div>
  );
}
```

### Skeleton screens

For each major page (dashboard, brand list, audit results, action center):
- Use shadcn Skeleton primitives
- Match real layout
- Display while server component fetches

---

## 9. Product tour

Lightweight 4-step tour shown on first dashboard visit (one-time — **IA2 fix: was "localStorage flag" — corrected to `org.metadata` server-side flag per Sprint 10 HE3**. localStorage is not SSR-safe in Next.js App Router and fails cross-device. Use `org.metadata.productTourComplete: boolean` — set via `POST /api/onboarding/tour-complete` when user clicks "Done" or "Skip". Dashboard page server component checks `!org.metadata.productTourComplete` and passes `showTour={true}` to the client dashboard component):

**IM1 fix: the specific update to Sprint 3's `app/(auth)/dashboard/page.tsx` was never specified. Add to the server component:**
```typescript
// In app/(auth)/dashboard/page.tsx (Sprint 3) — add after existing data fetches:
const [orgMeta] = await db.select({ metadata: organizations.metadata })
  .from(organizations).where(eq(organizations.id, currentUser.organizationId));
const showTour = !(orgMeta?.metadata as any)?.productTourComplete;
// Pass to DashboardView (IM5):
return <DashboardView {...existingProps} showTour={showTour} />;
```

**IM5 fix: `DashboardView` client component (Sprint 3) must accept `showTour` and render `ProductTour`. Add to DashboardView's props and JSX:**
```typescript
// IP3 fix: DashboardView 'use client' directive was never confirmed — required because:
// (1) ProductTour uses react-joyride which is client-only
// (2) router.refresh() from useRouter() is client-only
// Confirm/add at top of components/domain/dashboard/dashboard-view.tsx:
// 'use client'
// import { useRouter } from 'next/navigation';
// Props: { ..., showTour: boolean }
// In JSX (after main content):
// {showTour && (
//   <ProductTour onComplete={async () => {
//     await fetch('/api/onboarding/tour-complete', { method: 'POST' });
//     router.refresh();  // re-fetch showTour=false from server
//   }} />
// )}
```

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
      // IC2 fix: was description ?? '...' — literal '...' ships to production on all OG tags.
      // Must fall back to the env var, not a placeholder string:
      description: description ?? process.env.NEXT_PUBLIC_APP_DESCRIPTION ?? '',
      images: ['/og-image.png'],
      url: `${process.env.NEXT_PUBLIC_APP_URL}${path}`,
    },
    twitter: { card: 'summary_large_image' },
    // IP5 fix: canonical URL missing — without it Google may treat ?tab=monthly and
    // ?tab=annual as duplicate content on the pricing page:
    alternates: { canonical: `${process.env.NEXT_PUBLIC_APP_URL}${path}` },
  };
}
```
  };
}
```

Use in every public page's `generateMetadata` function.

**IH5 fix: "use in every public page" but usage pattern never shown. Canonical Next.js App Router pattern:**
```typescript
// app/(marketing)/pricing/page.tsx — example usage:
import { buildMetadata } from '@/lib/seo/metadata';
import type { Metadata } from 'next';

export function generateMetadata(): Metadata {
  return buildMetadata({
    title: 'Pricing',
    description: 'Transparent AU pricing for AI search visibility audits. From A$99/mo inc. GST.',
    path: '/pricing',
  });
}

export default function PricingPage() { /* ... */ }
```
Pages that don't pass a description fall back to `NEXT_PUBLIC_APP_DESCRIPTION` (IC2 + IB1 fixes).
`generateMetadata` can be `async` for dynamic pages (e.g. brand-specific OG tags).

`public/robots.txt`:
**IM2 fix: manual robots.txt content still existed here despite IK4 removing the file from §4. Contradiction — the text spec was never deleted. REMOVED. `next-sitemap.config.js` with `generateRobotsTxt: true` (ID3) is the single source of truth. The Disallow list from ID4 is already in `next-sitemap.config.js`'s `robotsTxtOptions`. Do NOT create or commit a manual `public/robots.txt`.**

`sitemap.xml` generated at build via `next-sitemap` package OR hand-maintained for v1.

**ID3 fix: `next-sitemap` requires a config file AND `package.json` `postbuild` entry — never specified:**
```javascript
// next-sitemap.config.js (project root):
/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'https://visibleau.com',
  generateRobotsTxt: true,  // overwrites public/robots.txt — keep robots.txt spec in sync
  robotsTxtOptions: {
    policies: [
      { userAgent: '*', allow: '/' },
      { userAgent: '*', disallow: ['/api/', '/dashboard', '/settings', '/brands',
                                    '/audit', '/agency', '/onboarding', '/welcome'] },
    ],
  },
  exclude: ['/api/*', '/dashboard/*', '/settings/*', '/brands/*',
            '/audit/*', '/agency/*', '/onboarding', '/welcome'],
  // IP4 fix: next-sitemap autodiscovers all statically-rendered pages. Confirm coverage:
  // Auto-discovered: /, /pricing, /about, /privacy, /terms, /methodology (all server components)
  // If /methodology uses generateStaticParams it's included automatically.
  // If any page is NOT auto-discovered (e.g. behind a catch-all route), add:
  // additionalPaths: async (config) => [
  //   await config.transform(config, '/methodology'),
  // ],
  // For Sprint 11: no additionalPaths needed — all marketing pages are static server components.
};
```
```json
// package.json — add to "scripts":
"postbuild": "next-sitemap"
```

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

2. SAMPLE AUDIT FLOW — **ID2 fix: Sprint 10 owns the entire sample audit infrastructure (IA5 + v1.2 changelog). Do NOT recreate any of the following — they ship in Sprint 10:**
   - `app/(marketing)/sample-audit/page.tsx` → Sprint 10 HH4
   - `app/(marketing)/sample-audit/running/page.tsx` → Sprint 10 HJ1
   - `app/(marketing)/sample-audit/result/[id]/page.tsx` → Sprint 10 HE2
   - `app/api/sample-audit/route.ts` with Upstash rate limit → Sprint 10 HB3 + HB5
   - `ensureSampleOrg()` synthetic org → Sprint 10 HC1
   - `sample-audit-cleanup.ts` Inngest cron → Sprint 10 HB4
   - **Sprint 11's job: ensure landing page hero CTA ("Try a free sample audit") links correctly to `/sample-audit` (Sprint 10's route). No new implementation needed.**

3. PRICING POLISH
   - Sprint 10's functional pricing → Sprint 11 visual polish
   - Tier comparison table on mobile collapsible
   **IN4 fix: "Tier comparison table on mobile collapsible" — no component in §4 and no spec. Add `components/domain/pricing/tier-comparison-table.tsx`:**
   ```
   // Rows: Audits/month, Engines, Brands, Client portal, Agency branding, Support level
   // Columns: Free, Starter, Growth, Agency (4 main tiers from TIER_METADATA)
   // Mobile: shadcn Collapsible wraps each tier column — tap to expand/collapse
   // Desktop: full table visible (no collapsible)
   // Data sourced from TIER_METADATA (HE1) + TIER_AUDIT_LIMITS (HE1)
   // Add below PricingTableClient on app/(marketing)/pricing/page.tsx
   ```
   - GST toggle prominent for AU users
   **IQ4 fix: "GST toggle prominent" — "prominent" never defined. Concrete Sprint 11 change to Sprint 10's GstToggle (HF1):**
   - Add an 🇦🇺 flag emoji or "AU" label before the toggle: `🇦🇺 Show prices inc. GST`
   - Default to `incGst={true}` (AU users see inc-GST prices by default — this is legal best practice under Australian Consumer Law requiring GST-inclusive pricing in ads)
   - Place toggle above the pricing cards, not below them
   - Visual treatment: `rounded-full bg-muted px-3 py-1 text-sm flex items-center gap-2`
   - "Most popular" badge on Growth tier
   - **IC5 fix: "Annual billing option... stretch goal" is wrong — Sprint 10 already ships annual billing** (STRIPE_PRICE_*_ANNUAL env vars, PRICE_MAP annual keys, BillingIntervalToggle, PricingTableClient). Sprint 11's job for pricing is **polish the toggle UI only**: make BillingIntervalToggle visually prominent with a "Save 2 months" badge, add a "Most popular" badge on Growth tier, ensure mobile layout collapses tier cards cleanly. Do NOT re-implement annual billing infrastructure.
   **IL4 fix: "Most popular" badge — implementation never specified. Update Sprint 10's `PricingCard` (HF3) to accept an `isMostPopular` prop:**
   ```typescript
   // In HF3's PricingCard, add: isMostPopular?: boolean to props
   // Sprint 11 pricing polish adds:
   // {isMostPopular && <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white">Most popular</Badge>}
   // In PricingTableClient (HI4), pass isMostPopular={tier === 'growth'} to each PricingCard.
   ```

4. ERROR + LOADING STATES
   - app/not-found.tsx, app/error.tsx, app/loading.tsx
   - Skeleton screens for dashboard, brand list, audit results, action center
   - Empty states for every list page (no brands, no audits, no recommendations)

5. ONBOARDING
   - Signup → email verify (Clerk handles) → **/onboarding** (IB2 fix: was `/brands/wizard` — Sprint 10 HM1 established canonical chain: Clerk → `/welcome` → `/onboarding` → BrandWizard component. Do not redirect directly to `/brands/wizard`.)
   - Welcome modal on first dashboard visit
   - 4-step product tour with react-joyride OR custom popovers (IB5 spec)
   **IJ4 fix: react-joyride is in §2 pnpm install but its implementation was never specified (IB5 only gave the shadcn Popover fallback). Canonical react-joyride usage in `product-tour.tsx`:**
   ```typescript
   // 'use client' — joyride is client-only
   import Joyride, { type Step } from 'react-joyride';
   const TOUR_STEPS: Step[] = [
     { target: '[data-tour="sidebar"]',      content: 'Your brands, audits, and insights live here', disableBeacon: true },
     { target: '[data-tour="run-audit"]',    content: 'Click here to run a fresh audit' },
     { target: '[data-tour="kpi-cards"]',    content: 'Track your visibility score over time' },
     { target: '[data-tour="action-center"]',content: 'We turn audits into specific recommendations' },
   ];
   export function ProductTour({ onComplete }: { onComplete: () => void }) {
     return (
       <Joyride steps={TOUR_STEPS} run={true} continuous showSkipButton
         styles={{ options: { primaryColor: 'var(--accent-blue)' } }}
         callback={({ status }) => {
           if (['finished', 'skipped'].includes(status)) onComplete();
         }} />
     );
   }
   // If joyride not installed: use IB5's shadcn Popover fallback instead.
   ```
   **IK2 fix: `data-tour` selectors above require existing dashboard components to have these attributes added. Sprint 11 must update these Sprint 3-6 components:**
   - `components/layout/sidebar.tsx` (Sprint 4) → add `data-tour="sidebar"` to the sidebar root element
   - `app/(auth)/brands/[id]/audits/page.tsx` or run-audit button (Sprint 3) → add `data-tour="run-audit"` to the "Run audit" button
   - `components/domain/dashboard/kpi-cards.tsx` (Sprint 3) → add `data-tour="kpi-cards"` to the KPI card grid wrapper
   - `app/(auth)/brands/[id]/actions/page.tsx` or ActionCenter link (Sprint 6) → add `data-tour="action-center"` to the Action Center entry point
   - **IE1 fix: "localStorage flag to never re-show" is wrong — same bug as IA2 fixed in §9. Use `org.metadata.productTourComplete` server-side flag (set via POST /api/onboarding/tour-complete per IC4). NOT localStorage (not SSR-safe, fails cross-device).**

6. BOILERPLATE PAGES
   - **IM4 fix: about/privacy/terms pages are in `app/(marketing)/` route group — never explicitly confirmed. Being inside (marketing) means they automatically use `app/(marketing)/layout.tsx` (II2) which renders the PublicNav header + Footer. No separate layout needed.**
   - app/(marketing)/about/page.tsx — **IO4 fix: `generateMetadata` never shown. Pattern:**
     ```typescript
     export function generateMetadata() { return buildMetadata({ title: 'About', path: '/about' }); }
     export default function AboutPage() {
       return (
         <article className="prose max-w-3xl mx-auto py-16 px-6">
           <h1>About VisibleAU</h1>
           {/* IQ5 fix: IO4 had <p>Operator-provided copy.</p> — this is Lorem ipsum by another name.
               §14 anti-pattern: "Do not ship Lorem ipsum." Use real stub copy Sri can ship day 1: */}
           <p>VisibleAU helps Australian service businesses understand how AI search engines describe
              them when customers ask questions like "best plumber in Bondi" or "recommend a physio
              in Melbourne."</p>
           <p>Built by an indie developer in Sydney. Questions? <a href="mailto:hi@visibleau.com">
              hi@visibleau.com</a></p>
         </article>
       );
     }
     ```
   - app/(marketing)/privacy/page.tsx — same pattern: title='Privacy Policy', path='/privacy'
   - app/(marketing)/terms/page.tsx — same pattern: title='Terms of Service', path='/terms'
   - All three: `buildMetadata` + `<article className="prose">` wrapper. Sri provides copy.
   **II5 fix: "operator-provided copy" with no page structure. All three must use `buildMetadata` and share a consistent layout. Canonical pattern (same for about/privacy/terms):**
   ```typescript
   // Each page: export function generateMetadata() + default export
   export function generateMetadata(): Metadata {
     return buildMetadata({ title: 'Privacy Policy', path: '/privacy' });
   }
   export default function PrivacyPage() {
     return (
       <article className="max-w-3xl mx-auto px-6 py-16 prose prose-sm">
         <h1>Privacy Policy</h1>
         <p className="text-muted-foreground">Last updated: {/* Sri fills in date */}</p>
         {/* Sri provides content — use Termly or lawyer-reviewed template */}
         {/* MINIMUM required under Australian Privacy Act 1988 (Privacy Principles): */}
         {/* 1. What personal information is collected (email, domain, business name) */}
         {/* 2. How it is used (LLM API calls, audit reports) */}
         {/* 3. Who it is disclosed to (OpenAI, Anthropic, Google, Perplexity APIs) */}
         {/* 4. How to access/correct your information (email hi@visibleau.com) */}
         {/* 5. Complaint process (OAIC link) */}
         <p>For questions: <a href="mailto:privacy@visibleau.com">privacy@visibleau.com</a></p>
       </article>
     );
   }
   ```
   **Note: Privacy Policy is legally required under Australian Privacy Act 1988 before launch.**

7. SEO
   - lib/seo/metadata.ts helper
   - generateMetadata() on every public route
   - **IL2 fix: "public/robots.txt" removed from Step 7 — IK4 established that next-sitemap.config.js with generateRobotsTxt: true is the canonical source. Do NOT create a manual public/robots.txt.** Let the postbuild script generate it.
   - public/sitemap.xml (auto-generated by next-sitemap postbuild)
   - public/og-image.png (1200×630 branded image — operator-authored, IJ3)
     **IJ3 fix: Claude Code cannot create image assets — this is operator-authored. Sri must create it.**
     Specification: 1200×630px PNG, ≤200KB. Content: VisibleAU logo + headline "AI Search Visibility for Australian SMBs" on a dark background with brand colours.
     Tools: Canva (free, has OG image templates at 1200×630) or Figma.
     Fallback for dev: copy any 1200×630 placeholder PNG to `/public/og-image.png` — the acceptance criterion checks presence, not content.
     Future option: generate dynamically via `app/(marketing)/og/route.tsx` using `@vercel/og` (Satori) — defer to v1.1 if static image is acceptable for launch.

8. MOBILE AUDIT
   - Walk every page in mobile DevTools preview
   - Fix any horizontal overflow, touch target sizes, font-size readability
   - Test on real phone if possible

9. TESTS
   - E2E: first-impression flow — **IN3 fix: "complete sample audit" removed from Step 9 (contradicts ID2 which says Sprint 11 does NOT own the sample audit flow). Correct Sprint 11 E2E scope: visit `/`, assert hero CTA links to `/sample-audit` (HTTP 200 on click). The full sample-audit flow test belongs in Sprint 10's `sample-audit.spec.ts`.**
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
- **IJ2 fix: "E2E: sample audit no-signup flow" conflicts with ID2 — Sprint 10 owns the sample audit infrastructure. Sprint 11's test scope:**
  - Sprint 11 test: `landing.spec.ts` — visit `/`, assert "Try a free sample audit" CTA exists and `href="/sample-audit"`. Click it, assert Sprint 10's `/sample-audit` page loads (HTTP 200). That is the full Sprint 11 E2E scope for sample audit.
  - The full no-signup flow test (domain entry → 90s wait → result page) belongs in Sprint 10's `sample-audit.spec.ts`.
- E2E: signup → onboarding → first audit
- Accessibility: axe-core scan with no critical issues

---

## 13. Acceptance criteria

- [ ] Landing page renders with all 9 sections
- [ ] "Try sample audit" CTA works (no signup, rate-limited)
- [ ] Pricing page polished with comparison + GST toggle
- [ ] 404, 500, error boundary all render gracefully
- [ ] Skeleton screens on dashboard / brand list / audit results
- [ ] Product tour shows once on first dashboard visit (org.metadata.productTourComplete flag)
  **IJ5 fix: no test methodology specified. E2E test pattern:**
  1. Create a fresh test org (or reset `org.metadata.productTourComplete = false` via test DB helper)
  2. Sign in → visit `/dashboard` → assert tour overlay is visible (e.g. `[data-tour-active="true"]` or joyride's `.react-joyride__tooltip` selector)
  3. Click "Skip" or "Done" → assert `POST /api/onboarding/tour-complete` was called (intercept in Playwright)
  4. Refresh `/dashboard` → assert tour overlay is NOT visible (flag is now `true`)
- [ ] OG image present + correct on social share preview
- [ ] robots.txt + sitemap.xml accessible
- [ ] Mobile: no horizontal scroll on any page <375px width
- [ ] Privacy + Terms pages exist with legal copy
- [ ] **IE3 fix: /methodology renders top-10 citability methods with "Show all 47" disclosure and named research citations** (was in Definition of Done but absent from acceptance criteria — Claude Code uses acceptance criteria to verify completion)

---

## 14. Common pitfalls / Sprint 11 anti-patterns

- **Do not** ship a landing page with "Lorem ipsum." Use real copy or operator-flagged placeholders, not Latin.
- **Do not** make sample audit too capable. It's a teaser, not a free product. **1 engine (ChatGPT) × 5 prompts × 1 run = 5 calls** is the cap per PRD §7 canonical (C3 fix). Sprint 11 §7 previously said 2 engines — corrected here (IA1 fix).
- **Do not** force product tour every visit. Use `org.metadata.productTourComplete` flag (IA2 fix — not localStorage: localStorage is not SSR-safe and fails cross-device).
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

- v1.19 (18 May 2026): **Forty-eighth-pass audit — theme-toggle in §4, logo.tsx in §4, Collapsible import, GST prominent spec, about page real copy (IQ1-IQ5).** **(IQ1)** §4 shared/: theme-toggle.tsx added — IP2 created the spec in layout comments but never added to §4 shared list. **(IQ2)** §4 shared/: logo.tsx added — II2 layout imports @/components/shared/logo but file was absent from §4; text fallback (VisibleAU in bold) until SVG brand asset ready. **(IQ3)** methodology/page.tsx: Collapsible import line added — shadcn import from @/components/ui/collapsible was missing; TypeScript compile would fail. **(IQ4)** §11 Step 3: GST toggle prominent defined — AU flag + default incGst=true + above-card placement + rounded-full treatment; Australian Consumer Law requires inc-GST pricing in ads. **(IQ5)** §11 Step 6 about/page.tsx: placeholder prose replaced with real stub copy (two sentences about VisibleAU + contact) — IO4 had Operator-provided copy which is Lorem ipsum by another name; §14 forbids it.
- v1.18 (18 May 2026): **Forty-fifth-pass audit — Badge import, ThemeToggle client island, DashboardView use client, sitemap autodiscovery, buildMetadata canonical (IP1-IP5).** **(IP1)** hero.tsx: Badge import specified — use shadcn Badge from @/components/ui/badge, not prototype custom Badge. **(IP2)** marketing/layout.tsx: ThemeToggle extracted as client island (components/shared/theme-toggle.tsx with use client + useEffect) — layout remains a server component. **(IP3)** DashboardView: use client directive confirmed + useRouter import specified for router.refresh() after tour complete. **(IP4)** next-sitemap.config.js: autodiscovery confirmed for all marketing pages; additionalPaths pattern provided for edge cases. **(IP5)** lib/seo/metadata.ts: alternates.canonical added — prevents duplicate content signals from pricing page query params.
- v1.17 (18 May 2026): **Forty-second-pass audit — trust-badges in §4, loom-embed in §4, pricing page minimal changes, about/privacy/terms generateMetadata, onboarding refinement spec (IO1-IO5).** **(IO1)** §4 landing/: trust-badges.tsx added to component list — IJ1 created it, IL5 added to assembly, but §4 list never updated. **(IO2)** §4 shared/: loom-embed.tsx added — IF4 specified at components/shared/ but missing from §4 list. **(IO3)** §4 pricing/page.tsx: minimal Sprint 11 changes specified — TierComparisonTable (IN4) + generateMetadata; no billing infrastructure re-implementation. **(IO4)** §11 Step 6: about/privacy/terms generateMetadata export pattern shown for all 3 pages. **(IO5)** §1: onboarding refinement defined — ProgressStepper (IN5) in wizard header; running screen copy polish; no new routes.
- v1.16 (18 May 2026): **Thirty-seventh-pass audit — assembly comments, welcome-modal ownership, Step 9 E2E, tier comparison table, progress-stepper (IN1-IN5).** **(IN1)** §4 page.tsx: Testimonials comment corrected to 7b (bonus); FaqSection corrected to section 8. **(IN2)** §4 onboarding: welcome-modal.tsx clarified as Sprint 10 HE4 owned — Sprint 11 reuses via IM1/IM5, does not recreate. **(IN3)** §11 Step 9: E2E test "complete sample audit" removed — Sprint 11 only tests CTA link (ID2 established Sprint 10 owns the full flow). **(IN4)** §11 Step 3 + §4: tier-comparison-table.tsx added — data from TIER_METADATA/TIER_AUDIT_LIMITS; mobile shadcn Collapsible per column; desktop full table. **(IN5)** §4 onboarding: progress-stepper.tsx added — 4-step indicator (Add brand/Configure/Run audit/See results) for BrandWizard and onboarding/page.tsx.
- v1.15 (18 May 2026): **Thirty-third-pass audit — dashboard showTour update, robots.txt body removed, testimonials section numbering, about/privacy/terms group, DashboardView client update (IM1-IM5).** **(IM1)** §9: Sprint 3 dashboard/page.tsx update specified — query org.metadata, compute showTour, pass to DashboardView. **(IM2)** §10: manual robots.txt content body deleted — IK4 note said remove but text persisted as a contradiction. **(IM3)** §6: Testimonials clarified as section 7b (bonus, not one of 9) — was conflicting with FAQ=section 8. **(IM4)** §11 Step 6: about/privacy/terms confirmed inside app/(marketing)/ route group — share marketing layout.tsx automatically. **(IM5)** §9: DashboardView client component update specified — showTour prop, ProductTour conditional render, router.refresh() after onComplete.
- v1.14 (18 May 2026): **Twenty-ninth-pass audit — engine SVG logos, robots.txt Step 7, methods.ts schema, Most Popular badge, TrustBadges in assembly (IL1-IL5).** **(IL1)** §4 public/engines/: 4 SVG files marked as operator-authored third-party trademark assets with official brand kit URLs; letter-initial fallback for dev. **(IL2)** §11 Step 7: public/robots.txt removed from deliverables — IK4 established next-sitemap canonical source. **(IL3)** methodology/methods.ts: CitabilityMethod type specified (id/name/dimension/effectSizeDelta/description/citation/citationUrl/effort). **(IL4)** §11 Step 3: Most Popular badge implementation — isMostPopular prop on PricingCard; absolute-positioned badge; passed from PricingTableClient for Growth tier. **(IL5)** §4 page.tsx: TrustBadges import + JSX added — IJ1 created the component but it was missing from the landing page assembly.
- v1.13 (18 May 2026): **Twenty-sixth-pass audit — NEXT_PUBLIC_LOOM env vars, data-tour attribute targets, error-boundary class, robots.txt canonical, axe-core install (IK1-IK5).** **(IK1)** §3: 4 NEXT_PUBLIC_LOOM_* vars added (sample-audit/wizard/results/agency); blank=placeholder. **(IK2)** §11 Step 5: data-tour attributes must be added to 4 existing Sprint 3-6 components (sidebar/run-audit button/kpi-cards/action-center). **(IK3)** §4 error-boundary.tsx: React class ErrorBoundary with getDerivedStateFromError + Retry button. **(IK4)** §4 public/: manual robots.txt removed — next-sitemap.config.js with generateRobotsTxt is canonical; having both causes build-time overwrite confusion. **(IK5)** §2: pnpm add -D @axe-core/playwright axe-core added — §12 accessibility scan requires it.
- v1.12 (18 May 2026): **Twenty-second-pass audit — TrustBadges component, E2E test scope, og-image operator asset, react-joyride spec, tour test methodology (IJ1-IJ5).** **(IJ1)** §1: TrustBadges component — 4 AU-specific badges (SSL/Privacy Act/24h deletion/no card); placed below Hero CTA. **(IJ2)** §12: E2E sample audit test corrected — Sprint 11 only tests CTA href; Sprint 10 owns the full flow test. **(IJ3)** §11 Step 7: og-image.png marked as operator-authored asset; 1200x630px PNG spec; Canva/Figma; @vercel/og deferred to v1.1. **(IJ4)** §11 Step 5: react-joyride Joyride component spec — TOUR_STEPS array, run/continuous/showSkipButton props, callback for finished/skipped. **(IJ5)** §13: tour acceptance criterion has 4-step test methodology — reset flag, visit dashboard, assert visible, skip, assert hidden.
- v1.11 (18 May 2026): **Twentieth-pass audit — landing page.tsx assembly, layout.tsx, §7 Sprint 10 ref, methodology body, about/privacy/terms structure (II1-II5).** **(II1)** §4 page.tsx: assembly of all 9 section components with generateMetadata. **(II2)** §4 layout.tsx: marketing header+footer component with canonical nav from IF1. **(II3)** §7: entire section replaced with Sprint 10 ownership note — was still describing Sprint 10 infrastructure. **(II4)** §4 methodology/page.tsx: body specified — Collapsible for Show all 47; lib/methodology/methods.ts = operator-authored data file. **(II5)** §11 Step 6: about/privacy/terms page structure with buildMetadata + prose article; Australian Privacy Act 1988 minimum requirements listed.
- v1.10 (18 May 2026): **Seventeenth-pass audit — engines body+Q3 year, pricing-teaser body, testimonials placeholder, faq accordion, generateMetadata usage (IH1-IH5).** **(IH1)** engines-supported.tsx: 4 engines named (ChatGPT/Claude/Gemini/Perplexity); Coming soon pinned to Q3 2026. **(IH2)** pricing-teaser.tsx: body using TIER_METADATA+addGst from Sprint 10 tiers.ts/gst.ts. **(IH3)** testimonials.tsx: placeholder = "Get early access" CTA when items=undefined; avoids fake quotes. **(IH4)** faq-section.tsx: shadcn Accordion rendering for IE5 Q&A entries. **(IH5)** §10: generateMetadata usage example added — export function + buildMetadata call pattern.
- v1.9 (18 May 2026): **Fourteenth-pass audit — how-it-works body, verticals body, dimensions component, footer body, loading.tsx (IG1-IG5).** **(IG1)** §4 how-it-works.tsx: HowItWorks component with 3-step array from §6 section 3. **(IG2)** §4 verticals-supported.tsx: 3 vertical cards (Tradies/Allied Health/Professional Services) with prompt counts and examples. **(IG3)** §4: dimensions.tsx added — §6 section 6 had no §4 component; acceptance criterion "all 9 sections" would fail without it. **(IG4)** §4 footer.tsx: copyright + Privacy/Terms/Methodology/Contact links; social deferred to v1.1. **(IG5)** §4 loading.tsx: spinner fallback specified; page-specific skeletons use IF3 named files.
- v1.8 (18 May 2026): **Eleventh-pass audit — nav items resolved, empty-state spec, skeleton files named, Loom embed, hero.tsx body (IF1-IF5).** **(IF1)** §6 header: canonical nav = Pricing|Methodology|About|Sign in|Get started — resolves §6 vs prototype conflict. **(IF2)** §4 empty-state.tsx: EmptyState props + 3 canonical instances (brands/audits/actions pages). **(IF3)** §4 skeleton/: 4 files named — dashboard/brand-list/audit-results/action-center skeletons. **(IF4)** §1 Loom: LoomEmbed component with placeholder (branded coming-soon) + real iframe; NEXT_PUBLIC_LOOM_* env vars. **(IF5)** §4 hero.tsx: body specified using §6 section 2 content — headline, subhead, two CTAs linking to Sprint 10 /sample-audit and /pricing.
- v1.7 (18 May 2026): **Eighth-pass audit — Step 5 localStorage, not-found auth pattern, methodology acceptance, 4 vs 5 paid tiers, FAQ content (IE1-IE5).** **(IE1)** §11 Step 5: localStorage corrected to org.metadata.productTourComplete — IA2 fixed §9 but missed Step 5. **(IE2)** §8: not-found.tsx conditional auth pattern specified — auth() + setRlsContext + try/catch silent fallback. **(IE3)** §13: /methodology acceptance criterion added — was in Definition of Done but absent from acceptance list. **(IE4)** §6: 4 paid tier cards clarified — show Starter/Growth/Agency/AgencyPro; Enterprise = contact us text CTA. **(IE5)** §6: 8 canonical FAQ Q&A entries specified — anti-pattern forbids Lorem ipsum but no content was provided.
- v1.6 (18 May 2026): **Fourth-pass audit — /methodology in §4, Step 2 sample audit replaced, next-sitemap config, robots.txt private routes, Upstash code removed (ID1-ID5).** **(ID1)** §4: methodology/page.tsx added — §1 deliverable + Definition of Done listed it but §4 omitted it entirely. **(ID2)** §11 Step 2: SAMPLE AUDIT FLOW replaced with Sprint 10 ownership note — 7 Sprint 10 refs listed; Sprint 11 just links to /sample-audit. **(ID3)** §10: next-sitemap.config.js + postbuild script specified — package installed (IB4) but config never written. **(ID4)** §10 robots.txt: /settings /brands /audit /agency /onboarding /welcome all added to Disallow — were indexable. **(ID5)** §7: Upstash rate-limit code block removed — Sprint 10 HB5 owns this; v1.2 changelog confirmed removal.
- v1.5 (18 May 2026): **Third-pass audit — error.tsx use client, OG description placeholder, 200 vs 100 calls, tour-complete route, annual billing already shipped (IC1-IC5).** **(IC1)** §8: error.tsx full spec with use client + Error props + Sentry comment stub. **(IC2)** §10: OG description fixed from literal ... to process.env.NEXT_PUBLIC_APP_DESCRIPTION. **(IC3)** §6 step 3: 200 calls clarified as paid-tier only; free = 100 calls across 2 engines; sample = 5 calls. **(IC4)** §4: POST /api/onboarding/tour-complete route added — IB5 referenced it but it was never in project structure. **(IC5)** §11 Step 3: annual billing corrected — Sprint 10 already ships it; Sprint 11 polishes toggle UI only.
- v1.4 (18 May 2026): **Second-pass audit — NEXT_PUBLIC_APP_URL env, /onboarding not /brands/wizard, SAMPLE_AUDIT_USE_REAL_LLM, next-sitemap install, product-tour fallback (IB1-IB5).** **(IB1)** §3: NEXT_PUBLIC_APP_URL=https://visibleau.com added — buildMetadata OG url uses it. **(IB2)** §11 Step 5: /brands/wizard corrected to /onboarding per Sprint 10 HM1. **(IB3)** §7: SAMPLE_AUDIT_USE_REAL corrected to SAMPLE_AUDIT_USE_REAL_LLM (Sprint 10 N14 rename). **(IB4)** §2: pnpm add next-sitemap added — §10 references it but it was never in dependencies. **(IB5)** §2: fallback product-tour.tsx pattern specified — shadcn Popover with data-tour attributes, step array, onComplete → POST /api/onboarding/tour-complete.
- v1.3 (18 May 2026): **First-pass audit — sample 1 engine fix, localStorage tour, organizationId null, annual 16% not 10%, sample/ components removed (IA1-IA5).** **(IA1)** §7 + §14: sample audit corrected to 1 engine ChatGPT × 5 prompts × 1 run = 5 calls per Sprint 10 v2.0 C3 fix. **(IA2)** §9 + §14: product tour one-time flag corrected from localStorage to org.metadata.productTourComplete (SSR-safe, cross-device). **(IA3)** §5: organizationId=null alternative removed; Sprint 10 canonical synthetic-org pattern documented. **(IA4)** §11: annual discount corrected from "10%" to "2 months free (≈16% off)" per PRD §7 Principle #3. **(IA5)** §4: components/domain/sample/ subtree removed — Sprint 10 owns these; Sprint 11 must reuse, not recreate.
- v1.2 (13 May 2026): **Second-pass-fix audit.** **(N6)** v1.1 changelog claimed sample-audit infrastructure was removed from §4, but actual references remained: Upstash deps in §2, env vars in §3, `app/(marketing)/sample-audit/`, `app/api/sample-audit/route.ts`, `lib/ratelimit/` in §4. All now stripped. Sprint 10 v2.0+ owns the entire sample audit. **(N11)** Broken PRD §17 reference fixed — PRD only goes to §16 + Appendices. §0 read-first list now references PRD §11 Sprint 11 + §12 Go-to-Market + §13 Success Metrics. PRD doc reference bumped to v1.15.
- v1.1 (12 May 2026): Conflict-resolution fixes per audit C3 + L8 + L9. Sample audit deliverable removed (moved to Sprint 10 v2.0 at PRD canonical spec: 1 engine ChatGPT, 5 prompts, 1 run). Added `/methodology` public page polish (47 citability methods catalogue from Sprint 7, surface top-10 publicly per PRD §11 Sprint 11). Added Loom demo recordings deliverable (3-4 demos × 90s each on landing + pricing pages per PRD §11 Sprint 11). Sample audit-related infrastructure refs (Upstash, sample-audit route, components) removed from §4 since Sprint 10 now owns them.
- v1.0 (12 May 2026): Initial. Net-new sprint prompt.
