// ═══════════════════════════════════════════════════════════════════════════════
// VisibleAU — AGENT ANALYTICS PROTOTYPE  v1.0
// Phase 3 · Layer 1 (Retrieval Intelligence) — EXTENSION
// Screens: AA-1 Crawler Overview · AA-2 Bot Detail · AA-3 Pages & Coverage · AA-4 Setup
//
// SOURCE OF TRUTH: Agent Analytics LLD v1.2  +  Phase 2 LLD v8.70  +  prototype FIX17
// WHEN THIS FILE AND THE LLD DISAGREE → THE LLD WINS.
//
// ─────────────────────────────────────────────────────────────────────────────
// DESIGN-SYSTEM CONTRACT (inherited from FIX17 — DO NOT INVENT NEW TOKENS)
// ─────────────────────────────────────────────────────────────────────────────
//   LAYER            : retrieval  →  --layer-retrieval #8b5cf6 (purple), soft rgba(139,92,246,0.12)
//                      icon = Cpu · LAYER_META.retrieval · NO new layer, NO new colour token.
//                      (LLD v1.2 §0.2 AA-C4: canon is 7 layers with 7 WCAG-AA-verified tokens.
//                       Agent Analytics is Layer 1 EXTENDED, not Layer 8.)
//   SURFACES         : --bg-base / --bg-surface / --bg-elevated / --bg-hover
//   TEXT             : --text-primary / --text-secondary / --text-tertiary
//   BORDERS          : --border-subtle / --border-default
//   SEMANTIC         : --success / --danger / --warning / --accent-blue / --accent-muted
//                      --success-soft / --danger-soft / --warning-soft
//   NUMERALS         : every number uses fontFamily: 'var(--font-mono)'  (canon convention)
//   ELEVATION        : --elevation-rest / --elevation-hover  (card-lift class)
//   FOCUS            : --focus-ring  (FOC-01; never remove outline without this)
//   GLOW             : --glow-retrieval  (dark only; canon neutralises glows on light)
//   RADIUS           : cards rounded-xl (12px) · pills rounded-full · buttons rounded-md
//   REUSED COMPONENTS: IntelCard · LayerBadge · SectionHeader · TierGate · EmptyState
//                      StatusBadge · MetricRow · Phase2TopBar   ← import, do not re-implement
//
// ─────────────────────────────────────────────────────────────────────────────
// CANON RULES THIS PROTOTYPE ENCODES (each maps to an LLD rule — do not "simplify")
// ─────────────────────────────────────────────────────────────────────────────
//   AA-05  THREE-STATE VERDICT. verified | unverified | spoofed | (null = pre-verification).
//          HEADLINE METRICS COUNT `verified` ONLY. unverified/spoofed are SEPARATE lines,
//          never silently merged. A tool that reports spoofed traffic as real AI traffic is
//          worse than no tool. → VerificationSplit component; the headline card reads
//          verifiedCrawls, NOT totalCrawls.
//   AA-13  HONESTY CAVEAT ON THE CARD, NOT BURIED. Referral attribution is structurally
//          incomplete (mobile AI apps strip the referrer; Google AI Mode = noreferrer), so
//          the ratio's referral side is a LOWER BOUND → the true ratio is BETTER than shown.
//          → RatioCard renders <HonestyNote> inline. NEVER remove it.
//   AA-15  THE CDN SHIELD JOIN — the differentiator. 4 verdicts from (Shield says × Logs say).
//          "Allowed but never visited" and "Blocked but still crawling" are the two findings
//          no competitor can produce. → CdnShieldJoinTable.
//   AA-14  CORRELATION, NEVER CAUSATION on fetch-precedes-citation.
//   §8     TIERING (LLD v1.2, corrected by AA-C10): crawler visits are FREE (canon LLD 3198 —
//          a deliberate acquisition hook). VERIFICATION = Starter. RATIO + CDN-JOIN = Growth.
//          → TierGate wraps the ratio + join sections ONLY. The visit list is never gated.
//   §7.0   The S9 crawler card was NEVER BUILT (AA-C13) — crawler_visit_logs has been an
//          orphan-reader table since S6. This prototype DELIVERS it.
//   PURPOSE TAXONOMY (canon, verbatim — AA-C2): retrieval | indexing | training.
//          NOT agent/search. Canon's `retrieval` = live user-triggered fetch.
//          retrieval 🟢 = "a human is reading you through AI RIGHT NOW"  ← strongest signal
//          indexing  🔵 = builds the answer index
//          training  ⚪ = corpus collection — NO citations, NO traffic. Pure cost.
//   A11Y   Every score bar carries role="img" + aria-label (AR-05 / BK4).
//          Every interactive element is keyboard-reachable and shows --focus-ring.
//          Colour is NEVER the sole signal — every state also carries a text label or icon.
//   RESPONSIVE  Mobile-first. grid-cols-1 → sm:grid-cols-2 → lg:grid-cols-4.
//          Tables scroll-x on mobile; at <sm they collapse to definition-list cards.
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
  tier: 'Growth',                       // drives TierGate. Try 'Free' / 'Starter' to see gating.
  period: 'Last 30 days',

  // Headline — AA-05: `verified` ONLY. unverified/spoofed shown separately, never merged.
  headline: {
    verifiedCrawls:   1284,
    unverifiedCrawls:  147,
    spoofedCrawls:      31,
    unknownCrawls:     412,   // pre-verification backfill rows (verification_status IS NULL)
    botsSeen:            7,
    referralSessions:    3,   // ai_referral_hits — the denominator
  },

  // visit_purpose — CANON's 3-value enum (AA-C2). Never agent/search.
  purposeSplit: [
    { purpose: 'training',  label: 'Training',  crawls: 892, pct: 69, tone: 'muted',
      note: 'Corpus collection. No citations, no traffic — pure cost.' },
    { purpose: 'indexing',  label: 'Indexing',  crawls: 301, pct: 24, tone: 'info',
      note: 'Builds the answer index that powers live citations.' },
    { purpose: 'retrieval', label: 'Retrieval', crawls:  91, pct:  7, tone: 'success',
      note: 'A human is reading you through AI right now.' },
  ],

  bots: [
    { vendor: 'openai',     ua: 'GPTBot',            tier: 'must_allow', purpose: 'training',
      crawls: 412, verified: 401, unverified: 11, spoofed: 0,  referrals: 0, ratio: null,   status: 'healthy' },
    { vendor: 'openai',     ua: 'ChatGPT-User',      tier: 'must_allow', purpose: 'retrieval',
      crawls:  63, verified:  63, unverified:  0, spoofed: 0,  referrals: 2, ratio: 32,     status: 'healthy' },
    { vendor: 'openai',     ua: 'OAI-SearchBot',     tier: 'must_allow', purpose: 'indexing',
      crawls: 158, verified: 158, unverified:  0, spoofed: 0,  referrals: 0, ratio: null,   status: 'healthy' },
    { vendor: 'anthropic',  ua: 'ClaudeBot',         tier: 'must_allow', purpose: 'training',
      crawls: 287, verified: 254, unverified: 33, spoofed: 0,  referrals: 0, ratio: null,   status: 'healthy' },
    { vendor: 'anthropic',  ua: 'Claude-User',       tier: 'must_allow', purpose: 'retrieval',
      crawls:  28, verified:  28, unverified:  0, spoofed: 0,  referrals: 1, ratio: 28,     status: 'healthy' },
    { vendor: 'perplexity', ua: 'PerplexityBot',     tier: 'must_allow', purpose: 'indexing',
      crawls: 143, verified: 112, unverified:  0, spoofed: 31, referrals: 0, ratio: null,   status: 'impersonation' },
    { vendor: 'bytedance',  ua: 'Bytespider',        tier: 'data',       purpose: 'training',
      crawls: 193, verified: 168, unverified: 25, spoofed: 0,  referrals: 0, ratio: null,   status: 'robots_violation' },
    { vendor: 'google',     ua: 'Google-NotebookLM', tier: 'emerging',   purpose: 'retrieval',
      crawls:   0, verified:   0, unverified:  0, spoofed: 0,  referrals: 0, ratio: null,   status: 'never_seen' },
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
  retrieval: { label: 'Retrieval', dot: 'var(--success)',        soft: 'var(--success-soft)',  icon: '🟢' },
  indexing:  { label: 'Indexing',  dot: 'var(--accent-blue)',    soft: 'var(--accent-muted)',  icon: '🔵' },
  training:  { label: 'Training',  dot: 'var(--text-tertiary)',  soft: 'var(--accent-muted)',  icon: '⚪' },
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
// COMPONENT: VerificationPill  (AA-05 — three states, never two)
// Colour is NEVER the sole signal — each state carries an icon AND a text label.
// ═══════════════════════════════════════════════════════════════════════════════
const VERIFY_META = {
  verified:   { label: 'Verified',   icon: ShieldCheck, bg: 'var(--success-soft)', fg: 'var(--success)' },
  unverified: { label: 'Unverified', icon: ShieldAlert, bg: 'var(--warning-soft)', fg: 'var(--warning)' },
  spoofed:    { label: 'Spoofed',    icon: ShieldX,     bg: 'var(--danger-soft)',  fg: 'var(--danger)'  },
  unknown:    { label: 'Unknown',    icon: MinusCircle, bg: 'var(--accent-muted)', fg: 'var(--text-tertiary)' },
};

const VerificationPill = ({ status, count }) => {
  const m = VERIFY_META[status];
  const Icon = m.icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] font-medium rounded-full px-2 py-0.5"
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
      <div
        className="flex h-2 rounded-full overflow-hidden"
        role="img"
        aria-label={`Verification: ${verified} verified, ${unverified} unverified, ${spoofed} spoofed, ${unknown} unknown`}
        style={{ background: 'var(--bg-hover)' }}
      >
        <div style={{ width: `${seg(verified)}%`,   background: 'var(--success)' }} />
        <div style={{ width: `${seg(unverified)}%`, background: 'var(--warning)' }} />
        <div style={{ width: `${seg(spoofed)}%`,    background: 'var(--danger)'  }} />
        <div style={{ width: `${seg(unknown)}%`,    background: 'var(--text-tertiary)', opacity: 0.35 }} />
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
  const locked = tier === 'Free' || tier === 'Starter';
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
  const locked = tier === 'Free' || tier === 'Starter';
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
// SCREEN AA-1 — CRAWLER OVERVIEW  (the hub; delivers the S9 card that was never built)
// Route: /brands/{brandId}/retrieval/agent-analytics
// Breadcrumbs: Workspace › Brands › Detail › Retrieval › Agent Analytics
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
        <IntelCard
          layer="retrieval"
          label="Verified AI crawls"
          value={h.verifiedCrawls}
          max={h.verifiedCrawls}
          desc="Cryptographically verified — spoofed traffic excluded"
        />
        <RatioCard crawls={h.verifiedCrawls} referrals={h.referralSessions} tier={tier} />
        <IntelCard
          layer="retrieval"
          label="AI engines seen"
          value={h.botsSeen}
          max={12}
          desc="Of 12 tracked crawlers"
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
            {['Crawler', 'Purpose', 'Verified crawls', 'Verification', 'Referrals', 'Status'].map((hd) => (
              <th key={hd} className="text-[11px] font-medium pb-2 pr-4" style={{ color: 'var(--text-tertiary)' }}>
                {hd}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bots.map((b) => {
            const pm = PURPOSE_META[b.purpose];
            const sm = BOT_STATUS[b.status];
            const SIcon = sm.icon;
            return (
              <tr key={b.ua} className="wins-item" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td className="py-3 pr-4">
                  <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                    {b.ua}
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
                  style={{ color: b.referrals > 0 ? 'var(--success)' : 'var(--danger)', fontFamily: 'var(--font-mono)' }}>
                  {b.referrals}
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
        const pm = PURPOSE_META[b.purpose];
        const sm = BOT_STATUS[b.status];
        const SIcon = sm.icon;
        return (
          <div key={b.ua} className="rounded-lg p-3"
            style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] font-medium"
                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{b.ua}</span>
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
                {b.verified} crawls · {b.referrals} referrals
              </span>
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

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
            <div className="flex items-center gap-3 flex-wrap text-[11px]" style={{ fontFamily: 'var(--font-mono)' }}>
              <span style={{ color: 'var(--success)' }}>🟢 {p.retrieval} retrieval</span>
              <span style={{ color: 'var(--accent-blue)' }}>🔵 {p.indexing} indexing</span>
              <span style={{ color: 'var(--text-tertiary)' }}>⚪ {p.training} training</span>
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
            style={{
              background: 'var(--bg-elevated)',
              border: p.recommended ? '1px solid var(--layer-retrieval)' : '1px solid var(--border-default)',
              boxShadow: p.recommended ? 'var(--glow-retrieval)' : undefined,
            }}>
            {p.recommended && (
              <span className="absolute -top-2 left-4 text-[10px] font-medium px-2 py-0.5 rounded-full"
                style={{ background: 'var(--layer-retrieval)', color: '#fff' }}>
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
        style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
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
          {['Free', 'Starter', 'Growth', 'Agency'].map((t) => (
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
// ═══════════════════════════════════════════════════════════════════════════════
// 1. IMPORT, DON'T RE-IMPLEMENT. IntelCard, LayerBadge, SectionHeader, TierGate,
//    EmptyState, StatusBadge, MetricRow already exist in the Phase 2 codebase.
//    This file re-declares NONE of them — it USES them. Wire to the real ones.
//
// 2. NO NEW TOKENS. Every colour here is a var(--…) from FIX17. If you find yourself
//    typing a hex, stop — you're breaking the design system. Layer = retrieval (purple).
//    There is NO --layer-agent-analytics. (LLD v1.2 AA-C4.)
//
// 3. THE HEADLINE COUNTS `verified` ONLY (AA-05). Do not sum verified+unverified into
//    a "total crawls" hero number. The whole credibility of this feature rests on it.
//
// 4. THE HONESTY NOTE IS NOT DECORATION (AA-13). <HonestyNote> on the RatioCard is a
//    canon requirement. Do not move it to a tooltip, do not collapse it, do not remove it.
//
// 5. TIER GATES (§8, corrected by AA-C10):
//      Free    → sees crawler visits + purpose split (canon LLD 3198 — a DELIBERATE hook)
//      Starter → + verification (the 3-state verdict)
//      Growth  → + crawl-to-referral ratio + CDN Shield join
//    TierGate wraps ONLY the ratio card and the CDN-join table. NEVER gate the visit list.
//
// 6. PURPOSE ENUM IS CANON'S: retrieval | indexing | training. NOT agent/search.
//    Writing purpose='agent' will violate the CHECK constraint. (LLD v1.2 AA-C2.)
//
// 7. NAV: add the Agent Analytics entry under the EXISTING Retrieval surface. Nav-orphan
//    has shipped 4× (S5 Trust, S6 Retrieval, S7 Discovery, /settings/notifications).
//    The repo-wide set-difference nav guard MUST cover this route before the sprint closes.
//
// 8. RESPONSIVE IS NOT OPTIONAL. Every table has a <sm card fallback in this file. Ship both.
//
// 9. A11Y: score bars carry role="img" + aria-label (AR-05/BK4). Status is never colour-only
//    — every state has an icon AND a text label. Keyboard focus uses --focus-ring (FOC-01).
//
// 10. LOADING + ERROR: IntelCard has a `loading` prop (skeleton). Every async surface needs
//     it, plus an error boundary. Never render a blank div.
// ═══════════════════════════════════════════════════════════════════════════════
