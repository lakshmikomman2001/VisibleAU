// ═══════════════════════════════════════════════════════════════════════════════
// VisibleAU — AGENT ANALYTICS PROTOTYPE  v1.0  (aligned to LLD v1.5)
// Phase 3 · Layer 1 (Retrieval Intelligence) — EXTENSION
// Screens: AA-1 Crawler Overview · AA-2 Bot Detail · AA-3 Pages & Coverage · AA-4 Setup
//
// SOURCE OF TRUTH: Agent Analytics LLD v1.5  +  Phase 2 LLD v8.70  +  prototype FIX17
// WHEN THIS FILE AND THE LLD DISAGREE → THE LLD WINS.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠ VERSION ALIGNMENT (v1.0 → LLD v1.5) — NO PROTOTYPE CHANGE. Re-verified against canon
//   (Phase 2 LLD v8.70 + FIX17) on all six review axes: data-contract field names,
//   the three-state verification verdict + honesty caveats, the CDN-Shield join (4 verdicts),
//   tiering (Retrieval tab minTier:'Starter'), event naming (dot-external/slash-internal), and
//   invariants. Result: CLEAN on all six — no prototype conflict found. The single finding of
//   that pass (AA-E1) is an LLD-only §9 baseline correction (serve() 25→40, tables 37→71 — canon's
//   stale header figures); the prototype references no invariant count, so it needs no edit. This
//   note updates the stale "LLD v1.2" source-of-truth reference to v1.5 and records the alignment
//   for traceability. (Same convention as FIX17's own "v8.67: NO PROTOTYPE CHANGE" alignment note.)
//   LLD v1.5's two fixes are BOTH internal to the LLD (§10 serve() 28→43 consistency, and §12
//   "build vs verify" wording for the §7.0 crawler card) — neither has any behavioural impact on this
//   prototype's mock, gating, or components; this is a version-reference sync only.
//   The v1.3 tiering rewrite (AA-P3: surface is Starter+, ratio+CDN-join gated at Growth via
//   TierGate) is already reflected in this prototype's gating — re-confirmed, unchanged.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠ PROTOTYPE CONFLICT AUDIT (v1.0 → v1.1) — 6 conflicts found against canon, all fixed.
//   Audited on NEW axes (tokens actually defined · CSS classes · route model · gating
//   mechanism · icon imports · emoji-as-UI) that the LLD audits never touched.
//
//   AA-P1 [HIGH]  Invented `var(--bg-subtle)` — THAT TOKEN DOES NOT EXIST. Canon's surfaces
//                 are --bg-base / --bg-elevated / --bg-hover / --bg-subtle / --bg-active.
//                 A nonexistent CSS var renders transparent, silently. → --bg-subtle.
//                 (I broke my own "NO NEW TOKENS" rule, written in my own notes. Grep first.)
//   AA-P2 [HIGH — ARCHITECTURAL]  Invented a standalone route
//                 /brands/{id}/retrieval/agent-analytics + a nav tile.
//                 CANON: Retrieval is a TAB inside `BrandIntelTabs`
//                 ({ id: 'retrieval', icon: Cpu, layer: 'retrieval', minTier: 'Starter' }).
//                 → Agent Analytics is a SECTION INSIDE the existing Retrieval tab.
//                 NO new route. NO new nav tile. NO nav-orphan risk (it inherits the tab).
//   AA-P3 [HIGH]  Used <TierGate> overlays to gate the ratio + CDN-join, and LLD v1.2 §8
//                 claims "Free sees crawler visits".
//                 CANON: gating is enforced at the TAB level (`minTier` + `tierRank`,
//                 aria-disabled + Lock icon; prototype L874: "tier entitlement is enforced
//                 by BrandIntelTabs"). AND the Retrieval tab is minTier:'Starter' — so a
//                 **FREE USER CANNOT OPEN THE RETRIEVAL TAB AT ALL.**
//                 ⇒ LLD v1.2 §8's "Free ✅ crawler visits" is UNREACHABLE through canon's UI.
//                 RESOLUTION: LLD 3198's "Free + Starter: crawler_visit_logs" is a DATA-
//                 ENTITLEMENT statement, not a UI promise. The operative gate is the tab's
//                 minTier:'Starter' (deliberately set by TG-02). → Agent Analytics baseline
//                 is STARTER. TierGate overlays are used ONLY for sub-features inside the
//                 tab (the Growth-only ratio + CDN-join). **LLD v1.2 §8 NEEDS THIS FIX.**
//   AA-P4 [MED]   Hardcoded color:'#fff'. Canon: NO raw hex — use var(--accent-primary-fg).
//                 (This exact bug — hardcoded color:"white" — shipped in S6 and had to be
//                 swept repo-wide.)
//   AA-P5 [LOW]   11 lucide icons not in canon's import list. VERIFY each exists in the
//                 pinned lucide-react@0.383.0 before building — a missing icon is a build break.
//   AA-P6 [MED]   Emoji (🟢🔵⚪) used as data indicators. Canon uses icon components +
//                 colour dots. Emoji break screen-reader semantics and don't theme.
//
//
//   ── SECOND PROTOTYPE AUDIT (v1.1 → v1.2) — 5 more, on NEW axes:
//      component semantics · data contract · metric coverage ──
//
//   AA-P7  [HIGH]  Used IntelCard for RAW COUNTS with max={value}. IntelCard is a **score**
//                  card — its bar fills value/max, so max=value forces a permanently
//                  100%-FULL BAR: meaningless for a count, and it reads as "perfect score".
//                  → New <CountCard>: same shell, same tokens, NO score bar.
//   AA-P8  [MED]   Data-contract drift. Mock used `ua:` and a PER-BOT `ratio:`.
//                  LLD schema is **crawler_name** / **vendor** / **visit_purpose** /
//                  **crawler_tier**, and **§5.1 defines the ratio PER VENDOR** —
//                  `ratio(vendor, period)` — never per bot. → Fields renamed to match the
//                  schema exactly; per-bot ratio removed; `vendorRatios` added.
//   AA-P9  [MED]   **5xx-for-bots was entirely missing.** LLD §5.2: "a spike means YOU are the
//                  bottleneck." → surfaced in <FindingsStrip> + a 5xx column in the bot table.
//   AA-P10 [MED]   **The unverified-rate alert was missing.** LLD AA-05: unverified > 25% for
//                  one vendor over 1h ⇒ a SCRAPER problem, and itself a sellable finding.
//                  → UNVERIFIED_ALERT_THRESHOLD = 0.25, surfaced in <FindingsStrip>.
//   AA-P11 [LOW]   Mock key `tier:` collided with the USER's subscription tier prop in the same
//                  file. The LLD field is **crawler_tier** (must_allow|emerging|data) — a BOT
//                  classification. → renamed; ambiguity removed before it became a bug.
//
//
//   ── THIRD PROTOTYPE AUDIT (v1.2 → v1.3) — 5 more, on NEW axes:
//      light-theme behaviour · CSS class contracts · a11y/motion · async states ──
//
//   AA-P12 [HIGH]  <VerificationSplit> hardcoded `h-2` (8px) and raw divs.
//                  CANON: `.score-bar-track` is **4px** and `.score-bar-fill` carries a
//                  `transition: width 0.6s cubic-bezier(...)` **plus reduce-motion gating**
//                  (canon's @media prefers-reduced-motion block covers score-fill explicitly).
//                  My bar was DOUBLE the canonical height and skipped both the spring and the
//                  motion-safety. → now uses .score-bar-track / .score-bar-fill.
//   AA-P13 [MED]   Hand-rolled the {bg:*-soft, fg:*-solid} pill FOUR times (VerificationPill,
//                  JOIN_VERDICT, BOT_STATUS, FINDING_META). Canon's **StatusBadge** is exactly
//                  this pattern with a fixed class string: "inline-flex text-[11px] font-medium
//                  px-2 py-0.5 rounded-full". → class string aligned verbatim so every badge in
//                  the product stays visually identical. Do not drift padding/radius/type.
//   AA-P14 [MED]   Hardcoded `boxShadow: var(--glow-retrieval)` on the Recommended card.
//                  CANON: glows are a **DARK-ONLY** affordance — "dark uses deeper shadow +
//                  inset top-highlight; **light uses soft drop**", and light mode neutralises
//                  them. Hardcoding bypasses the theme. → removed; `.card-lift` already carries
//                  theme-correct elevation for BOTH themes.
//   AA-P15 [HIGH]  **NO loading state. NO error state. Anywhere.** Every card assumed data had
//                  arrived. Canon mandates both ("IntelCard has a `loading` prop (skeleton)";
//                  "never render a blank div"). → <CardSkeleton> + <CardError> added; CountCard
//                  takes loading/error/onRetry. Skeletons use Tailwind animate-pulse, which
//                  canon already gates under prefers-reduced-motion.
//   AA-P16 [LOW]   Confirmed SAFE (no change): `--layer-retrieval` IS light-corrected
//                  (#8b5cf6 dark → **#6d28d9** violet-700, 7.10 contrast on white), and
//                  `--focus-ring` is applied GLOBALLY via a `:focus-visible` rule on every
//                  native control — so the buttons in this file inherit it automatically.
//                  Verified, not assumed.
//
//
//   ── FOURTH PROTOTYPE AUDIT (v1.3 → v1.4) — data-consistency + layout axes ──
//      Result: ONE real conflict; responsive breakpoints, container width, and referral/
//      purpose reconciliation all checked and CLEAN (verified, not assumed).
//
//   AA-P17 [MED]  Headline `verifiedCrawls: 1284` did NOT equal the sum of the per-bot verified
//                 counts (1184) — a 100-crawl gap. The headline is a SUM of the table, so a mock
//                 where they disagree seeds a "two views of the same data don't reconcile" bug
//                 (the S7 benchmark class — the headline card and the bot table would visibly
//                 disagree once wired to a real GROUP BY). → headline, unverified, spoofed, and
//                 the purpose split ALL reconciled to the per-bot sums (verified=1184, unver=69,
//                 purpose=823+270+91=1184). Every displayed total now provably ties to the rows.
//
// ─────────────────────────────────────────────────────────────────────────────
// DESIGN-SYSTEM CONTRACT (inherited from FIX17 — DO NOT INVENT NEW TOKENS)
// ─────────────────────────────────────────────────────────────────────────────
//   LAYER            : retrieval → --layer-retrieval #8b5cf6 (purple), soft rgba(139,92,246,0.12)
//                      icon = Cpu · LAYER_META.retrieval · NO new layer, NO new colour token.
//   PLACEMENT        : a SECTION inside the existing **Retrieval tab** (BrandIntelTabs
//                      id:'retrieval', minTier:'Starter'). NOT a route. NOT a new tile.
//   SURFACES         : --bg-base / --bg-elevated / --bg-hover / --bg-subtle / --bg-active
//                      (there is NO --bg-surface)
//   TEXT             : --text-primary / --text-secondary / --text-tertiary / --text-disabled
//   BORDERS          : --border-subtle / --border-default
//   SEMANTIC         : --success / --danger / --warning / --accent-blue / --accent-muted
//                      --success-soft / --danger-soft / --warning-soft / --accent-primary(-fg)
//   NUMERALS         : every number uses fontFamily: 'var(--font-mono)'
//   CLASSES (exist)  : score-bar-track / score-bar-fill / score-bar-dot / card-lift / wins-item
//   ELEVATION        : --elevation-rest / --elevation-hover (via .card-lift)
//   FOCUS            : --focus-ring (FOC-01)
//   GLOW             : --glow-retrieval (dark only; canon neutralises glows on light)
//   RADIUS           : cards rounded-xl · pills rounded-full · buttons rounded-md
//   REUSED COMPONENTS: IntelCard · LayerBadge · SectionHeader · TierGate · EmptyState
//                      StatusBadge · MetricRow   ← IMPORT, do not re-implement
//
// ─────────────────────────────────────────────────────────────────────────────
// TIERING (corrected by AA-P3 — supersedes LLD v1.2 §8's "Free" row)
// ─────────────────────────────────────────────────────────────────────────────
//   Retrieval TAB gate = minTier 'Starter'  →  Free never reaches this surface.
//     STARTER : crawler visits · purpose split · verification (the 3-state verdict)
//     GROWTH  : + crawl-to-referral ratio · + CDN Shield join      ← TierGate overlays here
//     AGENCY  : + unlimited domains · white-label PDF · cross-client rollup
//   TierGate overlays gate ONLY the two Growth sub-features. The visit list, purpose split
//   and verification are visible to every user who can open the tab (i.e. Starter+).
//
// ─────────────────────────────────────────────────────────────────────────────
// CANON RULES THIS PROTOTYPE ENCODES (each maps to an LLD rule — do not "simplify")
// ─────────────────────────────────────────────────────────────────────────────
//   AA-05  THREE-STATE VERDICT. verified | unverified | spoofed | (null = pre-verification).
//          HEADLINE METRICS COUNT `verified` ONLY. unverified/spoofed are SEPARATE lines,
//          never silently merged. A tool that reports spoofed traffic as real AI traffic is
//          worse than no tool. → VerificationSplit; the headline reads verifiedCrawls.
//   AA-13  HONESTY CAVEAT ON THE CARD, NOT BURIED. Referral attribution is structurally
//          incomplete (mobile AI apps strip the referrer; Google AI Mode = noreferrer), so
//          the ratio's referral side is a LOWER BOUND → the true ratio is BETTER than shown.
//          → <HonestyNote> renders inline on RatioCard. NEVER remove it.
//   AA-15  THE CDN SHIELD JOIN — the differentiator. (Shield says × Logs say) → 4 verdicts.
//   AA-14  CORRELATION, NEVER CAUSATION on fetch-precedes-citation.
//   PURPOSE TAXONOMY (canon, verbatim — AA-C2): retrieval | indexing | training.
//          NOT agent/search. Canon's `retrieval` = live user-triggered fetch.
//          retrieval = "a human is reading you through AI RIGHT NOW"  ← strongest signal
//          indexing  = builds the answer index
//          training  = corpus collection — NO citations, NO traffic. Pure cost.
//   A11Y   Score bars carry role="img" + aria-label (AR-05/BK4). Colour is NEVER the sole
//          signal — every state also carries an icon or text label. Focus uses --focus-ring.
//   RESPONSIVE  Mobile-first. Tables scroll-x, and collapse to cards at <sm.
// ═══════════════════════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import {
  Cpu, Bot, ShieldCheck, ShieldAlert, ShieldX, AlertTriangle, ArrowRight,
  CheckCircle2, XCircle, MinusCircle, Upload, Radio, Cloud, Copy, Info,
  TrendingDown, ExternalLink, FileWarning, Search, Ban, Eye
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// MOCK DATA — shaped EXACTLY like the real API payloads (LLD v1.2 §2)
// Brand: Metropolitan Plumbing (the canonical validation brand)
// ─────────────────────────────────────────────────────────────────────────────
const MOCK = {
  brand: { name: 'Metropolitan Plumbing', domain: 'metropolitanplumbing.com.au' },
  tier: 'Growth',   // Retrieval tab floor is STARTER (Free can't open it at all — AA-P3).
                    // Switch to 'Starter' in the dev nav to see the Growth TierGate overlays.
  period: 'Last 30 days',

  // Headline — AA-05: `verified` ONLY. unverified/spoofed shown separately, never merged.
  // AA-P17: EVERY headline number reconciles with the per-bot rows below — the headline is a
  // SUM of the table, so a mock where they disagree would seed a "two views don't reconcile"
  // bug (the S7 benchmark class). verified = Σ bot.verified = 401+63+158+254+28+112+168+0.
  headline: {
    verifiedCrawls:   1184,   // = Σ bots.verified
    unverifiedCrawls:   69,   // = Σ bots.unverified (11+33+25)
    spoofedCrawls:      31,   // = Σ bots.spoofed
    unknownCrawls:     412,   // pre-verification backfill rows (verification_status IS NULL)
    botsSeen:            7,    // = bots with verified>0 (Google-NotebookLM has 0 = never seen)
    referralSessions:    3,   // = Σ vendorRatios.referrals (2+1+0) — the ratio denominator
  },

  // visit_purpose — CANON's 3-value enum (AA-C2). Never agent/search.
  purposeSplit: [
    // AA-P17: sums to the verified total (1184), matching the per-bot visit_purpose rows.
    //   training = 401(GPTBot)+254(ClaudeBot)+168(Bytespider) = 823
    //   indexing = 158(OAI-SearchBot)+112(PerplexityBot)      = 270
    //   retrieval= 63(ChatGPT-User)+28(Claude-User)           = 91
    { purpose: 'training',  label: 'Training',  crawls: 823, pct: 69, tone: 'muted',
      note: 'Corpus collection. No citations, no traffic — pure cost.' },
    { purpose: 'indexing',  label: 'Indexing',  crawls: 270, pct: 23, tone: 'info',
      note: 'Builds the answer index that powers live citations.' },
    { purpose: 'retrieval', label: 'Retrieval', crawls:  91, pct:  8, tone: 'success',
      note: 'A human is reading you through AI right now.' },
  ],

  // AA-P8/AA-P11: field names match the LLD schema EXACTLY.
  //   crawler_name (NOT `ua`) · vendor · crawler_tier (NOT `tier` — that's the USER's plan)
  //   visit_purpose · status_5xx (LLD §5.2) · robots_violations
  // The ratio is computed PER VENDOR (LLD §5.1: `ratio(vendor, period)`), never per bot —
  // referrals arrive as ai_referral_hits keyed on ai_platform, which maps to vendor.
  bots: [
    { vendor: 'openai',     crawler_name: 'GPTBot',            crawler_tier: 'must_allow', visit_purpose: 'training',
      verified: 401, unverified: 11, spoofed:  0, status_5xx:  0, robots_violations: 0, status: 'healthy' },
    { vendor: 'openai',     crawler_name: 'ChatGPT-User',      crawler_tier: 'must_allow', visit_purpose: 'retrieval',
      verified:  63, unverified:  0, spoofed:  0, status_5xx:  0, robots_violations: 0, status: 'healthy' },
    { vendor: 'openai',     crawler_name: 'OAI-SearchBot',     crawler_tier: 'must_allow', visit_purpose: 'indexing',
      verified: 158, unverified:  0, spoofed:  0, status_5xx: 14, robots_violations: 0, status: 'server_errors' },
    { vendor: 'anthropic',  crawler_name: 'ClaudeBot',         crawler_tier: 'must_allow', visit_purpose: 'training',
      verified: 254, unverified: 33, spoofed:  0, status_5xx:  0, robots_violations: 0, status: 'healthy' },
    { vendor: 'anthropic',  crawler_name: 'Claude-User',       crawler_tier: 'must_allow', visit_purpose: 'retrieval',
      verified:  28, unverified:  0, spoofed:  0, status_5xx:  0, robots_violations: 0, status: 'healthy' },
    { vendor: 'perplexity', crawler_name: 'PerplexityBot',     crawler_tier: 'must_allow', visit_purpose: 'indexing',
      verified: 112, unverified:  0, spoofed: 31, status_5xx:  0, robots_violations: 0, status: 'impersonation' },
    { vendor: 'bytedance',  crawler_name: 'Bytespider',        crawler_tier: 'data',       visit_purpose: 'training',
      verified: 168, unverified: 25, spoofed:  0, status_5xx:  0, robots_violations: 47, status: 'robots_violation' },
    { vendor: 'google',     crawler_name: 'Google-NotebookLM', crawler_tier: 'emerging',   visit_purpose: 'retrieval',
      verified:   0, unverified:  0, spoofed:  0, status_5xx:  0, robots_violations: 0, status: 'never_seen' },
  ],

  // AA-P8: the ratio is PER VENDOR (LLD §5.1). ai_referral_hits.ai_platform → vendor.
  vendorRatios: [
    { vendor: 'openai',     verifiedCrawls: 622, referrals: 2, benchmark: 887   },
    { vendor: 'anthropic',  verifiedCrawls: 282, referrals: 1, benchmark: 38000 },
    { vendor: 'perplexity', verifiedCrawls: 112, referrals: 0, benchmark: null  },
  ],

  // AA-15 — THE DIFFERENTIATOR. (CDN Shield diagnosis) × (log reality) → 4 verdicts.
  cdnJoin: [
    { vendor: 'openai',     shield: 'allowed', logs: 'crawling',    verdict: 'healthy' },
    { vendor: 'anthropic',  shield: 'allowed', logs: 'crawling',    verdict: 'healthy' },
    { vendor: 'perplexity', shield: 'allowed', logs: 'crawling',    verdict: 'healthy' },
    { vendor: 'google',     shield: 'allowed', logs: 'never_seen',  verdict: 'not_blocked_never_visited' },
    { vendor: 'meta',       shield: 'blocked', logs: 'never_seen',  verdict: 'self_blocked' },
    { vendor: 'bytedance',  shield: 'blocked', logs: 'crawling',    verdict: 'robots_violation' },
  ],

  topPages: [
    { path: '/emergency-plumber-melbourne', retrieval: 34, indexing: 61, training: 118, cited: true  },
    { path: '/book-a-plumber',              retrieval: 29, indexing: 44, training:  97, cited: true  },
    { path: '/blocked-drains',              retrieval: 12, indexing: 58, training: 141, cited: false },
    { path: '/hot-water-repairs',           retrieval:  9, indexing: 47, training: 132, cited: false },
    { path: '/about',                       retrieval:  4, indexing: 31, training:  88, cited: false },
  ],

  // Sitemap pages NO AI bot has EVER fetched — directly actionable.
  coverageGap: [
    '/services/gas-fitting',
    '/services/leak-detection',
    '/suburbs/richmond',
    '/suburbs/brunswick',
  ],
};

// Public benchmarks (LLD v1.2 §5.1 — context is the insight; a bare number is not)
const RATIO_BENCHMARK = { GPTBot: 887, ClaudeBot: 38000 };

const PURPOSE_META = {
  retrieval: { label: 'Retrieval', dot: 'var(--success)',       soft: 'var(--success-soft)' },
  indexing:  { label: 'Indexing',  dot: 'var(--accent-blue)',   soft: 'var(--accent-muted)' },
  training:  { label: 'Training',  dot: 'var(--text-tertiary)', soft: 'var(--accent-muted)' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT: HonestyNote  (AA-13 — MANDATORY, never remove)
// The referral side is structurally incomplete. State it ON the card.
// EXACT: inline-flex, 11px, text-tertiary, Info icon 12px, top border-subtle, pt-2 mt-2
// ═══════════════════════════════════════════════════════════════════════════════
const HonestyNote = ({ children }) => (
  <div
    className="flex items-start gap-1.5 text-[11px] leading-relaxed pt-2 mt-2"
    style={{ color: 'var(--text-tertiary)', borderTop: '1px solid var(--border-subtle)' }}
  >
    <Info style={{ width: 12, height: 12, flexShrink: 0, marginTop: 1 }} />
    <span>{children}</span>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT: CardSkeleton / CardError  (AA-P15 — canon mandates loading + error states)
//
// Canon: "IntelCard has a `loading` prop (skeleton)" and every async surface needs a loading
// state + an error boundary. NEVER render a blank div. v1.0 of this prototype had NEITHER —
// every card assumed data had already arrived.
//
// Skeletons honour prefers-reduced-motion via Tailwind's animate-pulse, which canon already
// gates in its reduce-motion @media block. Do not hand-roll a shimmer.
// ═══════════════════════════════════════════════════════════════════════════════
const CardSkeleton = () => (
  <div className="rounded-xl p-5" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
    <div className="animate-pulse space-y-3">
      <div className="h-4 w-20 rounded" style={{ background: 'var(--bg-hover)' }} />
      <div className="h-3 w-28 rounded" style={{ background: 'var(--bg-hover)' }} />
      <div className="h-8 w-24 rounded" style={{ background: 'var(--bg-hover)' }} />
      <div className="score-bar-track" />
    </div>
    <span className="sr-only">Loading crawler data…</span>
  </div>
);

const CardError = ({ onRetry }) => (
  <div className="rounded-xl p-5" role="alert"
    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
    <div className="flex items-start gap-2.5">
      <AlertTriangle style={{ width: 15, height: 15, color: 'var(--danger)', flexShrink: 0, marginTop: 1 }} />
      <div className="flex-1">
        <div className="text-[13px] font-medium mb-0.5" style={{ color: 'var(--text-primary)' }}>
          Couldn’t load crawler data
        </div>
        <div className="text-[12px] mb-2.5" style={{ color: 'var(--text-secondary)' }}>
          Your log connection may have dropped. Existing data is unaffected.
        </div>
        <button onClick={onRetry}
          className="h-7 px-2.5 text-[11px] font-medium rounded-md"
          style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}>
          Retry
        </button>
      </div>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT: CountCard  (AA-P7 — IntelCard is the WRONG component for a raw count)
//
// IntelCard renders a SCORE BAR filling value/max. Passing max=value (as v1.0 did) forces a
// permanently 100%-full bar — meaningless for a count, and it visually reads as "perfect
// score". Counts get their own card: same shell, same tokens, NO score bar.
//
// EXACT: same outer shell as IntelCard (bg-elevated, border-default, rounded-xl, p-5,
// card-lift) · LayerBadge top-left · optional finding pill top-right · label 12px tertiary ·
// value text-3xl font-semibold tracking-tight font-mono · desc 11px tertiary.
// ═══════════════════════════════════════════════════════════════════════════════
const CountCard = ({ layer = 'retrieval', label, value, unit, desc, badge, tone, children,
                     loading = false, error = false, onRetry }) => {
  // AA-P15: canon mandates loading + error on every async surface. Never a blank div.
  if (loading) return <CardSkeleton />;
  if (error)   return <CardError onRetry={onRetry} />;
  return (
  <div className="rounded-xl p-5 card-lift"
    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
    <div className="flex items-start justify-between mb-3">
      <LayerBadge layer={layer} />
      {badge}
    </div>
    <div className="text-[12px] mb-1.5" style={{ color: 'var(--text-tertiary)' }}>{label}</div>
    <div className="text-3xl font-semibold tracking-tight"
      style={{ color: tone || 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
      {typeof value === 'number' ? value.toLocaleString() : value}
      {unit && <span className="text-[14px] ml-1.5" style={{ color: 'var(--text-tertiary)' }}>{unit}</span>}
    </div>
    {desc && <div className="text-[11px] mt-2" style={{ color: 'var(--text-tertiary)' }}>{desc}</div>}
    {children}
  </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT: VerificationPill  (AA-05 — three states, never two)
// Colour is NEVER the sole signal — each state carries an icon AND a text label.
// ═══════════════════════════════════════════════════════════════════════════════
const VERIFY_META = {
  verified:   { label: 'Verified',   icon: ShieldCheck, bg: 'var(--success-soft)', fg: 'var(--success)' },
  unverified: { label: 'Unverified', icon: ShieldAlert, bg: 'var(--warning-soft)', fg: 'var(--warning)' },
  spoofed:    { label: 'Spoofed',    icon: ShieldX,     bg: 'var(--danger-soft)',  fg: 'var(--danger)'  },
  unknown:    { label: 'Unknown',    icon: MinusCircle, bg: 'var(--accent-muted)', fg: 'var(--text-tertiary)' },
};

// AA-P13: canon's StatusBadge already defines this pill — "inline-flex, text-[11px],
// font-medium, px-2 py-0.5, rounded-full" with {bg: *-soft, fg: *-solid}. This is a
// DOMAIN-SPECIFIC variant (it adds an icon + a count), so it may not reuse StatusBadge
// verbatim — but it MUST keep StatusBadge's exact class string so every badge in the product
// looks identical. Do not drift the padding, radius or type scale.
const VerificationPill = ({ status, count }) => {
  const m = VERIFY_META[status];
  const Icon = m.icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full"
      style={{ background: m.bg, color: m.fg }}
    >
      <Icon style={{ width: 11, height: 11 }} />
      {m.label}
      {count !== undefined && (
        <span style={{ fontFamily: 'var(--font-mono)' }}>{count}</span>
      )}
    </span>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT: VerificationSplit  (AA-05 — the headline counts VERIFIED ONLY)
// A 4-segment stacked bar. unverified/spoofed/unknown are SHOWN, never merged in.
// ═══════════════════════════════════════════════════════════════════════════════
const VerificationSplit = ({ verified, unverified, spoofed, unknown }) => {
  const total = verified + unverified + spoofed + unknown;
  const seg = (n) => (total ? (n / total) * 100 : 0);
  return (
    <div>
      {/* AA-P12: canon's .score-bar-track is 4px tall and .score-bar-fill carries a 0.6s
          spring transition + reduce-motion handling. A raw `h-2` div stack was DOUBLE the
          canonical height and skipped both. Segments reuse .score-bar-fill's transition. */}
      <div
        className="flex score-bar-track overflow-hidden"
        role="img"
        aria-label={`Verification: ${verified} verified, ${unverified} unverified, ${spoofed} spoofed, ${unknown} unknown`}
      >
        <div className="score-bar-fill" style={{ width: `${seg(verified)}%`,   background: 'var(--success)' }} />
        <div className="score-bar-fill" style={{ width: `${seg(unverified)}%`, background: 'var(--warning)' }} />
        <div className="score-bar-fill" style={{ width: `${seg(spoofed)}%`,    background: 'var(--danger)'  }} />
        <div className="score-bar-fill" style={{ width: `${seg(unknown)}%`,    background: 'var(--text-tertiary)', opacity: 0.35 }} />
      </div>
      <div className="flex flex-wrap gap-1.5 mt-2.5">
        <VerificationPill status="verified"   count={verified} />
        <VerificationPill status="unverified" count={unverified} />
        <VerificationPill status="spoofed"    count={spoofed} />
        {unknown > 0 && <VerificationPill status="unknown" count={unknown} />}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT: RatioCard  (THE headline metric — LLD v1.2 §5.1)
// "N pages crawled per visitor sent". Denominator 0 → "0 visitors sent" (NEVER ∞,
// NEVER a divide-by-zero). Benchmarked against public figures. AA-13 caveat INLINE.
// GATED: Growth+ (§8). Free/Starter see the visits; the RATIO is the paid uplift.
// ═══════════════════════════════════════════════════════════════════════════════
const RatioCard = ({ crawls, referrals, tier }) => {
  // AA-P3: Free never reaches this tab (BrandIntelTabs minTier:'Starter').
  // The ratio is a GROWTH sub-feature → TierGate overlay for Starter only.
  const locked = tier === 'Starter';
  const ratio = referrals > 0 ? Math.round(crawls / referrals) : null;

  return (
    <div className="relative rounded-xl p-5 card-lift"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
      <div className="flex items-start justify-between mb-3">
        <LayerBadge layer="retrieval" />
        <span className="inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-0.5"
          style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
          <TrendingDown style={{ width: 10, height: 10 }} />
          Poor
        </span>
      </div>

      <div className="text-[12px] mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
        Crawl-to-referral ratio
      </div>

      {ratio === null ? (
        <>
          <div className="text-3xl font-semibold tracking-tight mb-1"
            style={{ color: 'var(--danger)', fontFamily: 'var(--font-mono)' }}>
            0
            <span className="text-[14px] ml-1.5" style={{ color: 'var(--text-tertiary)' }}>
              visitors sent
            </span>
          </div>
          <div className="text-[12px] mb-3" style={{ color: 'var(--text-secondary)' }}>
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{crawls}</span>
            {' '}pages crawled · <strong style={{ color: 'var(--danger)' }}>0 visitors returned</strong>
          </div>
        </>
      ) : (
        <div className="text-3xl font-semibold tracking-tight mb-3"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
          {ratio}
          <span className="text-[14px] ml-1" style={{ color: 'var(--text-tertiary)' }}>:1</span>
        </div>
      )}

      {/* Benchmark context — a bare number is not an insight */}
      <div className="rounded-lg p-2.5 text-[11px] leading-relaxed"
        style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
        <strong style={{ color: 'var(--text-primary)' }}>Benchmark:</strong>{' '}
        GPTBot averages{' '}
        <span style={{ fontFamily: 'var(--font-mono)' }}>{RATIO_BENCHMARK.GPTBot.toLocaleString()}:1</span>{' '}
        · ClaudeBot up to{' '}
        <span style={{ fontFamily: 'var(--font-mono)' }}>{RATIO_BENCHMARK.ClaudeBot.toLocaleString()}:1</span>{' '}
        across the web.
      </div>

      {/* AA-13 — MANDATORY. Never remove, never bury. */}
      <HonestyNote>
        Referral attribution is incomplete by design of the platforms: mobile AI apps strip the
        referrer and Google AI Mode sends <code>noreferrer</code>, so AI-driven visitors often land
        in analytics as “Direct”. <strong style={{ color: 'var(--text-secondary)' }}>The real ratio
        is better than shown</strong> — treat this as a floor, not a verdict.
      </HonestyNote>

      {locked && <TierGate requiredTier="Growth" currentTier={tier} feature="Crawl-to-referral ratio" />}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT: PurposeBreakdown  (canon's 3-value taxonomy — the advice engine)
// This is what turns a bot chart into ADVICE: 69% of the crawl budget is training
// bots that will never cite you. Blocking THOSE costs nothing.
// ═══════════════════════════════════════════════════════════════════════════════
const PurposeBreakdown = ({ split }) => (
  <div className="rounded-xl p-5" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
    <SectionHeader
      layer="retrieval"
      title="What are they here for?"
      subtitle="Purpose determines whether a crawl can ever earn you a citation"
    />
    <div className="space-y-3">
      {split.map((p) => {
        const m = PURPOSE_META[p.purpose];
        return (
          <div key={p.purpose}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: m.dot }} aria-hidden="true" />
                <span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                  {m.label}
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[13px] font-semibold"
                  style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                  {p.crawls}
                </span>
                <span className="text-[11px]" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                  {p.pct}%
                </span>
              </div>
            </div>
            <div className="score-bar-track" role="img" aria-label={`${m.label}: ${p.crawls} crawls, ${p.pct} percent`}>
              <div className="score-bar-fill" style={{ width: `${p.pct}%`, background: m.dot }} />
            </div>
            <div className="text-[11px] mt-1.5" style={{ color: 'var(--text-tertiary)' }}>{p.note}</div>
          </div>
        );
      })}
    </div>

    {/* The advice this unlocks — an insight, not a chart */}
    <div className="mt-4 rounded-lg p-3 flex items-start gap-2"
      style={{ background: 'var(--warning-soft)' }}>
      <AlertTriangle style={{ width: 14, height: 14, color: 'var(--warning)', flexShrink: 0, marginTop: 1 }} />
      <div className="text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        <strong style={{ color: 'var(--text-primary)' }}>69% of your AI crawl budget is training bots.</strong>{' '}
        They collect corpus data — they will never cite you and never send a visitor. Blocking them
        costs you nothing in AI visibility. Blocking <em>retrieval</em> bots would remove you from
        AI answers entirely.
      </div>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT: CdnShieldJoinTable  (AA-15 — THE DIFFERENTIATOR)
// (CDN Shield diagnosis) × (log reality). No competitor can produce this: a bot tool
// has logs but no diagnosis; a diagnostic tool has no logs. VisibleAU has BOTH halves.
// GATED: Growth+ (§8).
// ═══════════════════════════════════════════════════════════════════════════════
const JOIN_VERDICT = {
  healthy: {
    label: 'Healthy', icon: CheckCircle2, fg: 'var(--success)', bg: 'var(--success-soft)',
    copy: 'Allowed and crawling — nothing to do.',
  },
  not_blocked_never_visited: {
    label: 'Never visited', icon: Search, fg: 'var(--warning)', bg: 'var(--warning-soft)',
    copy: 'Not blocked — but this engine has never come. A discoverability problem, not a blocking one.',
  },
  self_blocked: {
    label: 'Self-blocked', icon: Ban, fg: 'var(--danger)', bg: 'var(--danger-soft)',
    copy: 'You are invisible to this engine by your own configuration.',
  },
  robots_violation: {
    label: 'Robots violation', icon: FileWarning, fg: 'var(--danger)', bg: 'var(--danger-soft)',
    copy: 'You blocked it and it crawled anyway. Only an edge/WAF rule will stop it.',
  },
};

const CdnShieldJoinTable = ({ rows, tier }) => {
  // AA-P3: GROWTH sub-feature inside the Starter-gated Retrieval tab.
  const locked = tier === 'Starter';
  return (
    <div className="relative rounded-xl p-5" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
      <SectionHeader
        layer="retrieval"
        title="Configuration vs reality"
        subtitle="What CDN Shield says you allow — against what the logs show actually happened"
      />

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-left" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              {['Engine', 'CDN Shield says', 'Logs say', 'Verdict'].map((h) => (
                <th key={h} className="text-[11px] font-medium pb-2 pr-4"
                  style={{ color: 'var(--text-tertiary)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const v = JOIN_VERDICT[r.verdict];
              const Icon = v.icon;
              return (
                <tr key={r.vendor} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td className="py-3 pr-4 text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                    {r.vendor}
                  </td>
                  <td className="py-3 pr-4 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                    {r.shield === 'allowed'
                      ? <span style={{ color: 'var(--success)' }}>Allowed</span>
                      : <span style={{ color: 'var(--danger)'  }}>Blocked</span>}
                  </td>
                  <td className="py-3 pr-4 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                    {r.logs === 'crawling' ? 'Crawling' : 'Never seen'}
                  </td>
                  <td className="py-3">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium rounded-full px-2 py-0.5"
                      style={{ background: v.bg, color: v.fg }}>
                      <Icon style={{ width: 11, height: 11 }} />
                      {v.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile: table → definition-list cards (canon responsive rule) */}
      <div className="sm:hidden space-y-2">
        {rows.map((r) => {
          const v = JOIN_VERDICT[r.verdict];
          const Icon = v.icon;
          return (
            <div key={r.vendor} className="rounded-lg p-3"
              style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>{r.vendor}</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-0.5"
                  style={{ background: v.bg, color: v.fg }}>
                  <Icon style={{ width: 11, height: 11 }} />
                  {v.label}
                </span>
              </div>
              <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                Shield: {r.shield} · Logs: {r.logs === 'crawling' ? 'crawling' : 'never seen'}
              </div>
            </div>
          );
        })}
      </div>

      {/* The two findings that matter — surfaced, not left in a table row */}
      <div className="mt-4 space-y-2">
        {rows.filter((r) => r.verdict !== 'healthy').map((r) => {
          const v = JOIN_VERDICT[r.verdict];
          const Icon = v.icon;
          return (
            <div key={r.vendor} className="rounded-lg p-3 flex items-start gap-2" style={{ background: v.bg }}>
              <Icon style={{ width: 14, height: 14, color: v.fg, flexShrink: 0, marginTop: 1 }} />
              <div className="text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                <strong style={{ color: 'var(--text-primary)', textTransform: 'capitalize' }}>{r.vendor}:</strong>{' '}
                {v.copy}
              </div>
            </div>
          );
        })}
      </div>

      {locked && <TierGate requiredTier="Growth" currentTier={tier} feature="Configuration vs reality" />}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// AA-1 — AGENT ANALYTICS SECTION  (delivers the S9 crawler card that was never built)
//
// AA-P2 [ARCHITECTURAL]: this is NOT a route. It is a SECTION rendered inside the
// EXISTING **Retrieval tab** (BrandIntelTabs id:'retrieval', minTier:'Starter').
//   → NO new route. NO new nav tile. NO nav-orphan risk (it inherits the tab).
//   → It sits BELOW the existing Retrieval content (agent-readiness, llms.txt, CDN Shield).
// Breadcrumbs are the brand's existing ones; the tab supplies the nav.
// ═══════════════════════════════════════════════════════════════════════════════
const AgentAnalyticsHub = ({ tier = MOCK.tier }) => {
  const h = MOCK.headline;

  return (
    <div className="space-y-5">
      {/* Page header — LayerBadge + title + period (canon SectionHeader pattern) */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <LayerBadge layer="retrieval" size="md" />
            <span className="text-[11px] px-2 py-0.5 rounded-full"
              style={{ background: 'var(--accent-muted)', color: 'var(--text-tertiary)' }}>
              Agent Analytics
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Who is reading you?
          </h1>
          <p className="text-[13px] mt-1" style={{ color: 'var(--text-secondary)' }}>
            AI crawlers don’t run JavaScript — your analytics can’t see them. These are the visits{' '}
            <span style={{ fontFamily: 'var(--font-mono)' }}>{MOCK.brand.domain}</span> never told you about.
          </p>
        </div>
        <button
          className="h-8 px-3 text-[12px] font-medium rounded-md inline-flex items-center gap-1.5"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
        >
          {MOCK.period}
        </button>
      </div>

      {/* HEADLINE CARDS — AA-05: the big number is VERIFIED crawls, never total. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* AA-P7: CountCard, not IntelCard — a raw count has no /max, so no score bar. */}
        <CountCard
          label="Verified AI crawls"
          value={h.verifiedCrawls}
          desc="Verified by IP range or reverse-DNS. Spoofed traffic excluded."
        />
        {/* AA-P8: ratio is computed PER VENDOR (LLD §5.1); the card shows the rollup. */}
        <RatioCard crawls={h.verifiedCrawls} referrals={h.referralSessions} tier={tier} />
        <CountCard
          label="AI engines seen"
          value={`${h.botsSeen} of 12`}
          desc="Tracked crawlers that reached your site this period"
        />

        {/* Impersonation — a finding, not a footnote (AA-05) */}
        <div className="rounded-xl p-5 card-lift"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
          <div className="flex items-start justify-between mb-3">
            <LayerBadge layer="retrieval" />
            {h.spoofedCrawls > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-0.5"
                style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
                <AlertTriangle style={{ width: 10, height: 10 }} />
                Finding
              </span>
            )}
          </div>
          <div className="text-[12px] mb-2.5" style={{ color: 'var(--text-tertiary)' }}>Verification</div>
          <VerificationSplit
            verified={h.verifiedCrawls}
            unverified={h.unverifiedCrawls}
            spoofed={h.spoofedCrawls}
            unknown={h.unknownCrawls}
          />
          {h.spoofedCrawls > 0 && (
            <div className="text-[11px] mt-2.5" style={{ color: 'var(--danger)' }}>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{h.spoofedCrawls}</span> requests faked a
              PerplexityBot user-agent. Reverse-DNS says otherwise — likely a scraper.
            </div>
          )}
        </div>
      </div>

      {/* Purpose + CDN join — the two things that make this ADVICE, not a chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <PurposeBreakdown split={MOCK.purposeSplit} />
        <CdnShieldJoinTable rows={MOCK.cdnJoin} tier={tier} />
      </div>

      {/* AA-P9 + AA-P10: the spec'd findings that previously had no surface */}
      <FindingsStrip bots={MOCK.bots} />

      {/* Bot table */}
      <BotTable bots={MOCK.bots} />
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT: BotTable  (AA-1 lower section)
// Colour is never the sole signal — every status has an icon + text label.
// ═══════════════════════════════════════════════════════════════════════════════
const BOT_STATUS = {
  healthy:          { label: 'Healthy',          icon: CheckCircle2, fg: 'var(--success)' },
  impersonation:    { label: 'Impersonation',    icon: ShieldX,      fg: 'var(--danger)'  },
  robots_violation: { label: 'Ignores robots',   icon: FileWarning,  fg: 'var(--danger)'  },
  never_seen:       { label: 'Never seen',       icon: Search,       fg: 'var(--warning)' },
};

const BotTable = ({ bots }) => (
  <div className="rounded-xl p-5" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
    <SectionHeader
      layer="retrieval"
      title="Every AI crawler that reached you"
      subtitle="Verified counts only. Unverified and spoofed hits are excluded from these totals."
    />

    <div className="hidden md:block overflow-x-auto">
      <table className="w-full text-left" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            {/* AA-P8: no per-bot "Referrals" column — the ratio is PER VENDOR (LLD §5.1). */}
            {['Crawler', 'Purpose', 'Verified crawls', 'Verification', '5xx', 'Status'].map((hd) => (
              <th key={hd} className="text-[11px] font-medium pb-2 pr-4" style={{ color: 'var(--text-tertiary)' }}>
                {hd}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bots.map((b) => {
            const pm = PURPOSE_META[b.visit_purpose];
            const sm = BOT_STATUS[b.status];
            const SIcon = sm.icon;
            return (
              <tr key={b.crawler_name} className="wins-item" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td className="py-3 pr-4">
                  <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                    {b.crawler_name}
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{b.vendor}</div>
                </td>
                <td className="py-3 pr-4">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium rounded-full px-2 py-0.5"
                    style={{ background: pm.soft, color: pm.dot }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: pm.dot }} aria-hidden="true" />
                    {pm.label}
                  </span>
                </td>
                <td className="py-3 pr-4 text-[13px]"
                  style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                  {b.verified}
                </td>
                <td className="py-3 pr-4">
                  {b.spoofed > 0
                    ? <VerificationPill status="spoofed" count={b.spoofed} />
                    : b.unverified > 0
                      ? <VerificationPill status="unverified" count={b.unverified} />
                      : <VerificationPill status="verified" />}
                </td>
                <td className="py-3 pr-4 text-[13px]"
                  style={{ color: b.status_5xx > 0 ? 'var(--warning)' : 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                  {b.status_5xx}
                </td>
                <td className="py-3">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium" style={{ color: sm.fg }}>
                    <SIcon style={{ width: 12, height: 12 }} />
                    {sm.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>

    {/* Mobile cards */}
    <div className="md:hidden space-y-2">
      {bots.map((b) => {
        const pm = PURPOSE_META[b.visit_purpose];
        const sm = BOT_STATUS[b.status];
        const SIcon = sm.icon;
        return (
          <div key={b.crawler_name} className="rounded-lg p-3"
            style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] font-medium"
                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{b.crawler_name}</span>
              <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: sm.fg }}>
                <SIcon style={{ width: 12, height: 12 }} />
                {sm.label}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
              <span className="inline-flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: pm.dot }} aria-hidden="true" />
                {pm.label}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>
                {b.verified} verified{b.status_5xx > 0 ? ` · ${b.status_5xx}×5xx` : ''}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT: FindingsStrip  (AA-P9 + AA-P10 — two spec'd metrics that had NO surface)
//
//   AA-P9  5xx-for-bots (LLD §5.2): "a spike means YOU are the bottleneck." If an AI crawler
//          gets 500s, it may stop coming back — a self-inflicted visibility loss.
//   AA-P10 Unverified-rate alert (LLD AA-05): unverified > 25% for one vendor over 1h ⇒ that
//          is a SCRAPER problem, not a crawler problem — and it is itself a sellable finding.
//   Robots violations (LLD §5.2): a bot fetching a path its own robots rule disallows.
//          respects_robots=false families (Bytespider, meta-externalagent) are known offenders.
//
// Findings are ACTIONABLE — each carries a "Create task" CTA into the existing Action Center
// (LLD §6 — reuse remediation_tasks, do NOT build a new task system).
// ═══════════════════════════════════════════════════════════════════════════════
const UNVERIFIED_ALERT_THRESHOLD = 0.25;   // LLD AA-05: >25% over 1h

const FINDING_META = {
  server_errors:    { icon: AlertTriangle, fg: 'var(--warning)', bg: 'var(--warning-soft)', label: 'Server errors' },
  impersonation:    { icon: ShieldX,       fg: 'var(--danger)',  bg: 'var(--danger-soft)',  label: 'Impersonation' },
  robots_violation: { icon: FileWarning,   fg: 'var(--danger)',  bg: 'var(--danger-soft)',  label: 'Robots violation' },
};

const FindingsStrip = ({ bots }) => {
  const findings = [];

  bots.forEach((b) => {
    // AA-P9 — 5xx-for-bots
    if (b.status_5xx > 0) {
      findings.push({
        kind: 'server_errors',
        title: `${b.crawler_name} hit ${b.status_5xx} server errors`,
        body: 'Your server returned 5xx to a crawler that indexes you for AI answers. Repeated failures can make it stop returning — a visibility loss you caused.',
        task: 'fix_5xx_for_bots',
      });
    }
    // AA-P10 — unverified-rate alert (>25%)
    const claimed = b.verified + b.unverified + b.spoofed;
    if (claimed > 0 && b.unverified / claimed > UNVERIFIED_ALERT_THRESHOLD) {
      findings.push({
        kind: 'impersonation',
        title: `${Math.round((b.unverified / claimed) * 100)}% of ${b.crawler_name} traffic is unverifiable`,
        body: 'Above the 25% threshold. Requests claim this crawler but fail reverse-DNS. That is a scraper wearing a costume, not an AI engine.',
        task: 'investigate_impersonation',
      });
    }
    if (b.spoofed > 0) {
      findings.push({
        kind: 'impersonation',
        title: `${b.spoofed} requests faked a ${b.crawler_name} identity`,
        body: 'Reverse-DNS actively contradicts the user-agent. These are excluded from every metric above — but somebody is scraping you.',
        task: 'investigate_impersonation',
      });
    }
    // Robots violations
    if (b.robots_violations > 0) {
      findings.push({
        kind: 'robots_violation',
        title: `${b.crawler_name} ignored robots.txt ${b.robots_violations} times`,
        body: 'This crawler does not honour robots rules. Only an edge or WAF rule will stop it — robots.txt alone will not.',
        task: 'robots_violation_needs_edge_rule',
      });
    }
  });

  if (!findings.length) return null;

  return (
    <div className="rounded-xl p-5" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
      <SectionHeader
        layer="retrieval"
        title={`${findings.length} findings need attention`}
        subtitle="Each one is actionable — send it to the Action Center"
      />
      <div className="space-y-2">
        {findings.map((f, i) => {
          const m = FINDING_META[f.kind];
          const Icon = m.icon;
          return (
            <div key={i} className="rounded-lg p-3 flex items-start gap-2.5" style={{ background: m.bg }}>
              <Icon style={{ width: 15, height: 15, color: m.fg, flexShrink: 0, marginTop: 1 }} />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium mb-0.5" style={{ color: 'var(--text-primary)' }}>
                  {f.title}
                </div>
                <div className="text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {f.body}
                </div>
              </div>
              <button
                className="h-7 px-2.5 text-[11px] font-medium rounded-md flex-shrink-0 inline-flex items-center gap-1"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
              >
                Create task
                <ArrowRight style={{ width: 11, height: 11 }} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SCREEN AA-3 — PAGES & COVERAGE
// `retrieval` hits on a page = A HUMAN IS READING THAT PAGE THROUGH AI RIGHT NOW.
// Coverage gap = sitemap pages NO AI bot has ever fetched → directly actionable.
// ═══════════════════════════════════════════════════════════════════════════════
const PagesAndCoverage = () => (
  <div className="space-y-5">
    <div className="rounded-xl p-5" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
      <SectionHeader
        layer="retrieval"
        title="Which pages is AI actually reading?"
        subtitle="Retrieval hits mean a human asked an AI a question and it fetched this page to answer"
      />
      <div className="space-y-2">
        {MOCK.topPages.map((p) => (
          <div key={p.path} className="rounded-lg p-3"
            style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center justify-between mb-2 gap-2">
              <span className="text-[13px] truncate"
                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                {p.path}
              </span>
              {p.cited && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-0.5 flex-shrink-0"
                  style={{ background: 'var(--success-soft)', color: 'var(--success)' }}>
                  <CheckCircle2 style={{ width: 10, height: 10 }} />
                  Cited in AI answers
                </span>
              )}
            </div>
            {/* AA-P6: colour DOT + label, never emoji (emoji break SR semantics + don't theme) */}
            <div className="flex items-center gap-3 flex-wrap text-[11px]">
              {[['retrieval', p.retrieval], ['indexing', p.indexing], ['training', p.training]].map(([k, n]) => (
                <span key={k} className="inline-flex items-center gap-1.5" style={{ color: 'var(--text-tertiary)' }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: PURPOSE_META[k].dot }} aria-hidden="true" />
                  <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{n}</span>
                  {PURPOSE_META[k].label.toLowerCase()}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* AA-14 — CORRELATION, NEVER CAUSATION */}
      <HonestyNote>
        Pages fetched by <em>retrieval</em> and <em>indexing</em> bots tend to appear in AI answers
        2–4 weeks later. This is a <strong style={{ color: 'var(--text-secondary)' }}>correlation</strong>,
        not proof of causation — a crawl grants access, not influence.
      </HonestyNote>
    </div>

    {/* Coverage gap — an insight, not an empty list */}
    <div className="rounded-xl p-5" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
      <SectionHeader
        layer="retrieval"
        title="Pages AI has never seen"
        subtitle="In your sitemap — but no AI crawler has ever fetched them"
        action={
          <button className="h-8 px-3 text-[12px] font-medium rounded-md inline-flex items-center gap-1.5"
            style={{ background: 'var(--accent-primary)', color: 'var(--accent-primary-fg)' }}>
            Create task
            <ArrowRight style={{ width: 12, height: 12 }} />
          </button>
        }
      />
      <div className="space-y-1.5">
        {MOCK.coverageGap.map((path) => (
          <div key={path} className="flex items-center gap-2 py-2 px-3 rounded-lg"
            style={{ background: 'var(--bg-hover)' }}>
            <XCircle style={{ width: 14, height: 14, color: 'var(--danger)', flexShrink: 0 }} />
            <span className="text-[12px] truncate"
              style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{path}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// SCREEN AA-4 — SETUP / CONNECT
// Three ingestion paths (LLD v1.2 §4). Upload FIRST — it is the only path an AU SMB
// on cPanel/shared hosting can actually use. CF Logpush needs Enterprise (Growth+).
// ═══════════════════════════════════════════════════════════════════════════════
const INGEST_PATHS = [
  {
    id: 'upload', icon: Upload, title: 'Upload a log file', tier: 'Starter',
    desc: 'Works everywhere. Export your access log from cPanel, nginx or Apache and drop it here.',
    detail: '.log / .gz / .csv · Combined or Common Log Format',
    recommended: true,
  },
  {
    id: 'snippet', icon: Radio, title: 'Live snippet', tier: 'Free',
    desc: 'A one-line middleware snippet streams AI-bot visits to VisibleAU in real time.',
    detail: 'Already active on this brand · POST /api/visit',
    active: true,
  },
  {
    id: 'logpush', icon: Cloud, title: 'Cloudflare Logpush', tier: 'Growth',
    desc: 'For high-traffic sites on a Cloudflare Enterprise plan.',
    detail: 'Requires CF Enterprise — most SMB plans cannot use this',
  },
];

const SetupPanel = ({ tier = MOCK.tier }) => (
  <div className="space-y-5">
    <div>
      <h2 className="text-lg font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
        Connect your logs
      </h2>
      <p className="text-[13px] mt-1" style={{ color: 'var(--text-secondary)' }}>
        AI crawlers never touch your analytics. They only appear in server logs — so we need one of these.
      </p>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {INGEST_PATHS.map((p) => {
        const Icon = p.icon;
        return (
          <div key={p.id} className="relative rounded-xl p-5 card-lift"
            /* AA-P14: canon neutralises glows on light ("dark = inset highlight, light = soft
               drop"). Do NOT hardcode a glow — .card-lift already carries the theme-correct
               elevation for both themes. The border alone marks the recommendation. */
            style={{
              background: 'var(--bg-elevated)',
              border: p.recommended
                ? '1px solid var(--layer-retrieval)'
                : '1px solid var(--border-default)',
            }}>
            {p.recommended && (
              <span className="absolute -top-2 left-4 text-[10px] font-medium px-2 py-0.5 rounded-full"
                style={{ background: 'var(--layer-retrieval)', color: 'var(--accent-primary-fg)' }}>
                Recommended
              </span>
            )}
            <div className="flex items-start justify-between mb-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ background: 'var(--layer-retrieval-soft)' }}>
                <Icon style={{ width: 18, height: 18, color: 'var(--layer-retrieval)' }} />
              </div>
              {p.active && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-0.5"
                  style={{ background: 'var(--success-soft)', color: 'var(--success)' }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--success)' }} />
                  Live
                </span>
              )}
            </div>
            <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{p.title}</div>
            <div className="text-[12px] mb-2.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {p.desc}
            </div>
            <div className="text-[11px]" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
              {p.detail}
            </div>
          </div>
        );
      })}
    </div>

    {/* Live confirmation — "we've received N hits" (LLD §6.2) */}
    <div className="rounded-xl p-4 flex items-center gap-3"
      style={{ background: 'var(--success-soft)', border: '1px solid var(--border-subtle)' }}>
      <CheckCircle2 style={{ width: 16, height: 16, color: 'var(--success)', flexShrink: 0 }} />
      <div className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
        <strong style={{ color: 'var(--text-primary)' }}>Connected.</strong> We’ve received{' '}
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>1,874</span>{' '}
        AI-crawler hits in the last 30 days. Only AI-bot traffic is stored — your human visitors are
        never logged.
      </div>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// EMPTY STATE — CONNECTED BUT ZERO HITS
// THE VisibleAU-ism: an empty state that IS a finding, not a shrug. (LLD §7.2)
// ═══════════════════════════════════════════════════════════════════════════════
const AgentAnalyticsEmpty = () => (
  <div className="rounded-xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
    <EmptyState
      layer="retrieval"
      icon={Bot}
      title="No AI crawler has visited yet"
      desc="This is itself a finding. If you're not blocked, it may mean AI engines can't discover you at all — check Retrieval and CDN Shield."
      cta="Check Retrieval health"
    />
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// PROTOTYPE SHELL — screen switcher (dev only; NOT part of the shipped UI)
// ═══════════════════════════════════════════════════════════════════════════════
const SCREENS = {
  'AA-1 Overview':  AgentAnalyticsHub,
  'AA-3 Pages':     PagesAndCoverage,
  'AA-4 Setup':     SetupPanel,
  'Empty state':    AgentAnalyticsEmpty,
};

export default function AgentAnalyticsPrototype() {
  const [screen, setScreen] = useState('AA-1 Overview');
  const [tier, setTier]     = useState(MOCK.tier);
  const Screen = SCREENS[screen];

  return (
    <div style={{ background: 'var(--bg-base)', minHeight: '100vh' }}>
      {/* DEV NAV — remove in production */}
      <div className="flex items-center gap-2 flex-wrap px-6 py-3"
        style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-subtle)' }}>
        {Object.keys(SCREENS).map((s) => (
          <button key={s} onClick={() => setScreen(s)}
            className="h-7 px-3 text-[11px] font-medium rounded-md"
            style={{
              background: screen === s ? 'var(--bg-elevated)' : 'transparent',
              border: `1px solid ${screen === s ? 'var(--border-default)' : 'transparent'}`,
              color: screen === s ? 'var(--text-primary)' : 'var(--text-tertiary)',
            }}>
            {s}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>Tier:</span>
          {/* AA-P3: 'Free' omitted — the Retrieval tab is minTier:'Starter', so Free
              never reaches this surface at all. Gating it here would be fiction. */}
          {['Starter', 'Growth', 'Agency'].map((t) => (
            <button key={t} onClick={() => setTier(t)}
              className="h-7 px-2.5 text-[11px] font-medium rounded-md"
              style={{
                background: tier === t ? 'var(--layer-retrieval-soft)' : 'transparent',
                color: tier === t ? 'var(--layer-retrieval)' : 'var(--text-tertiary)',
              }}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto">
        <Screen tier={tier} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// IMPLEMENTATION NOTES FOR CLAUDE CODE — READ BEFORE BUILDING
// (v1.1 — corrected after a 6-conflict prototype audit against canon. See the header.)
// ═══════════════════════════════════════════════════════════════════════════════
// 1. THIS IS A TAB SECTION, NOT A ROUTE (AA-P2 — architectural).
//    Agent Analytics renders INSIDE the existing **Retrieval tab**
//    (BrandIntelTabs: { id:'retrieval', icon: Cpu, layer:'retrieval', minTier:'Starter' }),
//    below the existing Retrieval content (agent-readiness, llms.txt, CDN Shield).
//      · Do NOT create /brands/{id}/retrieval/agent-analytics.
//      · Do NOT add a brand-page nav tile.
//      · There is therefore NO nav-orphan risk — it inherits the tab's nav. (Nav-orphan has
//        shipped 4×: S5 Trust, S6 Retrieval, S7 Discovery, /settings/notifications.)
//
// 2. GATING IS AT THE TAB LEVEL, NOT PER-CARD (AA-P3).
//    Canon enforces entitlement in BrandIntelTabs via minTier + tierRank (aria-disabled +
//    Lock icon). The Retrieval tab is **minTier:'Starter'** → a FREE USER NEVER REACHES THIS
//    SURFACE. So:
//      STARTER : crawler visits · purpose split · verification (the 3-state verdict)
//      GROWTH  : + crawl-to-referral ratio · + CDN Shield join   ← <TierGate> overlays ONLY here
//      AGENCY  : + unlimited domains · white-label PDF · cross-client rollup
//    ⚠ LLD v1.2 §8 says "Free ✅ crawler visits". That is UNREACHABLE through canon's UI and
//      **the LLD needs this correction.** LLD 3198's "Free + Starter: crawler_visit_logs" is a
//      DATA-entitlement statement, not a UI promise; the operative gate is the tab's minTier.
//
// 3. NO NEW TOKENS. NO RAW HEX. (AA-P1, AA-P4)
//    Every colour is a var(--…) that ALREADY EXISTS in FIX17. There is **no --bg-surface**
//    (canon: --bg-base / --bg-elevated / --bg-hover / --bg-subtle / --bg-active). A nonexistent
//    CSS var renders transparent and silently. Text on a coloured button is
//    var(--accent-primary-fg), never '#fff' — the hardcoded color:"white" bug shipped in S6 and
//    had to be swept repo-wide. Layer = retrieval (purple). There is NO --layer-agent-analytics.
//
// 4. IMPORT, DON'T RE-IMPLEMENT. IntelCard, LayerBadge, SectionHeader, TierGate, EmptyState,
//    StatusBadge, MetricRow already exist. This file re-declares NONE of them. Wire to the real
//    ones. CSS classes score-bar-track / score-bar-fill / score-bar-dot / card-lift / wins-item
//    all exist in canon — use them, don't recreate them.
//
// 5. VERIFY THE ICONS (AA-P5). These are NOT in canon's current import list and must exist in
//    the pinned lucide-react@0.383.0 — a missing icon is a build break:
//      Bot · ShieldCheck · ShieldAlert · ShieldX · Radio · Cloud · FileWarning · Ban ·
//      MinusCircle · Upload · Copy
//    (Search and Info ARE already in canon.)
//
// 6. THE HEADLINE COUNTS `verified` ONLY (AA-05). Do NOT sum verified+unverified into a
//    "total crawls" hero number. The entire credibility of this feature rests on it. A tool
//    that reports spoofed traffic as real AI traffic is worse than no tool.
//
// 7. THE HONESTY NOTE IS NOT DECORATION (AA-13). <HonestyNote> on the RatioCard is a canon
//    requirement. Do not move it to a tooltip, do not collapse it, do not remove it.
//
// 8. PURPOSE ENUM IS CANON'S: retrieval | indexing | training. NOT agent/search.
//    Writing purpose='agent' violates the CHECK constraint. (LLD v1.2 AA-C2 — v1.0 of the LLD
//    invented a 4-value enum whose 'agent' collided with canon's 'retrieval'.)
//
// 9. NO EMOJI AS UI (AA-P6). Purpose indicators are colour dots + text labels (see
//    PURPOSE_META). Emoji break screen-reader semantics and don't respond to the theme.
//
// 10. A11Y + RESPONSIVE + STATES are not optional. Score bars carry role="img" + aria-label
//     (AR-05/BK4). Status is never colour-only — every state has an icon AND a text label.
//     Keyboard focus uses --focus-ring (FOC-01). Every table has a <sm card fallback in this
//     file — ship both. IntelCard has a `loading` prop (skeleton); every async surface needs it
//     plus an error boundary. Never render a blank div.
// ═══════════════════════════════════════════════════════════════════════════════
