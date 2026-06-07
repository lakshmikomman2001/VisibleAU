import React, { useState, useEffect } from 'react';
import {
  Search, Plus, Bell, Settings, ChevronDown, ChevronRight, Check, X,
  Sparkles, Activity, BarChart3, Globe, Zap, Building2, Users,
  ArrowUpRight, ArrowRight, ArrowDownRight, MoreHorizontal, Sun, Moon,
  Play, Pause, Loader2, AlertCircle, CheckCircle2, Clock, ExternalLink,
  Filter, Download, RefreshCw, Eye, Trash2, Edit3, ChevronLeft,
  TrendingUp, TrendingDown, Minus, Info, Hash, MapPin, Tag, Target,
  FileText, Mail, Lock, LogIn, UserPlus, Shield, Boxes, Layers,
  CircleDot, Circle, ArrowUp, Lightbulb, Calendar, Copy
} from 'lucide-react';

/* ============================================================================
 *  THEME SYSTEM
 *  ----------------------------------------------------------------------------
 *  Two design-token sets (dark / light corporate) in a single <style> block.
 *  In production these become two files:
 *     app/styles/theme-dark.css
 *     app/styles/theme-light.css
 *  Both imported in app/globals.css, scoped under [data-theme="..."].
 *  Toggle changes <html data-theme="dark|light"> → all variables swap.
 * ========================================================================= */

const ThemeStyles = () => (
  <style>{`
    /* =========================================================================
       FILE: app/styles/theme-base.css
       Variables and base typography shared across themes.
    ========================================================================= */
    :root {
      --font-display: 'Geist', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      --font-mono: 'Geist Mono', 'JetBrains Mono', ui-monospace, monospace;
      --radius-sm: 6px;
      --radius-md: 8px;
      --radius-lg: 12px;
      --radius-xl: 16px;
      --shadow-soft: 0 1px 2px 0 rgba(0,0,0,0.05);
      --shadow-card: 0 1px 3px 0 rgba(0,0,0,0.1), 0 1px 2px -1px rgba(0,0,0,0.1);
      --shadow-pop: 0 10px 25px -5px rgba(0,0,0,0.2), 0 8px 10px -6px rgba(0,0,0,0.15);
    }

    @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
    @keyframes pulse-soft { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
    @keyframes fade-in-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes progress-stripe { 0% { background-position: 0 0; } 100% { background-position: 40px 0; } }

    .anim-fade-in-up { animation: fade-in-up 0.4s ease-out backwards; }
    .anim-shimmer {
      background: linear-gradient(110deg, transparent 30%, var(--shimmer-color) 50%, transparent 70%);
      background-size: 200% 100%;
      animation: shimmer 2s infinite;
    }
    .anim-pulse-soft { animation: pulse-soft 2.4s ease-in-out infinite; }

    /* =========================================================================
       FILE: app/styles/theme-dark.css   (Vercel / Linear-inspired)
       Deep zinc base, sharp accents, gradient highlights.
    ========================================================================= */
    [data-theme="dark"] {
      /* Surfaces */
      --bg-base: #09090b;
      --bg-subtle: #0c0c0f;
      --bg-elevated: #18181b;
      --bg-hover: #27272a;
      --bg-active: #3f3f46;

      /* Borders */
      --border-subtle: rgba(255,255,255,0.06);
      --border-default: rgba(255,255,255,0.08);
      --border-strong: rgba(255,255,255,0.14);
      --border-focus: rgba(255,255,255,0.25);

      /* Text */
      --text-primary: #fafafa;
      --text-secondary: #a1a1aa;
      --text-tertiary: #71717a;
      --text-disabled: #52525b;

      /* Accent — single neutral white-on-black with subtle blue */
      --accent-primary: #ffffff;
      --accent-primary-fg: #09090b;
      --accent-muted: #27272a;
      --accent-blue: #3b82f6;
      --accent-blue-soft: rgba(59,130,246,0.15);

      /* Semantic */
      --success: #22c55e;
      --success-soft: rgba(34,197,94,0.12);
      --warning: #f59e0b;
      --warning-soft: rgba(245,158,11,0.12);
      --danger: #ef4444;
      --danger-soft: rgba(239,68,68,0.12);
      --info: #06b6d4;
      --info-soft: rgba(6,182,212,0.12);

      /* Effects */
      --gradient-glow: radial-gradient(ellipse at top, rgba(59,130,246,0.08), transparent 50%);
      --gradient-card: linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(255,255,255,0) 100%);
      --gradient-border: linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.04));
      --shimmer-color: rgba(255,255,255,0.04);
      --grid-color: rgba(255,255,255,0.04);
    }

    /* =========================================================================
       FILE: app/styles/theme-light.css   (Corporate refined — Stripe-influenced)
       Clean, calm, restrained. White surfaces with cool zinc accents.
    ========================================================================= */
    [data-theme="light"] {
      --bg-base: #fafafa;
      --bg-subtle: #f4f4f5;
      --bg-elevated: #ffffff;
      --bg-hover: #f4f4f5;
      --bg-active: #e4e4e7;

      --border-subtle: rgba(0,0,0,0.05);
      --border-default: rgba(0,0,0,0.08);
      --border-strong: rgba(0,0,0,0.12);
      --border-focus: rgba(0,0,0,0.4);

      --text-primary: #09090b;
      --text-secondary: #52525b;
      --text-tertiary: #71717a;
      --text-disabled: #a1a1aa;

      --accent-primary: #18181b;
      --accent-primary-fg: #fafafa;
      --accent-muted: #f4f4f5;
      --accent-blue: #2563eb;
      --accent-blue-soft: rgba(37,99,235,0.08);

      --success: #16a34a;
      --success-soft: rgba(22,163,74,0.08);
      --warning: #d97706;
      --warning-soft: rgba(217,119,6,0.08);
      --danger: #dc2626;
      --danger-soft: rgba(220,38,38,0.08);
      --info: #0891b2;
      --info-soft: rgba(8,145,178,0.08);

      --gradient-glow: radial-gradient(ellipse at top, rgba(37,99,235,0.04), transparent 50%);
      --gradient-card: linear-gradient(180deg, rgba(0,0,0,0.01) 0%, rgba(0,0,0,0) 100%);
      --gradient-border: linear-gradient(135deg, rgba(0,0,0,0.05), rgba(0,0,0,0.02));
      --shimmer-color: rgba(0,0,0,0.03);
      --grid-color: rgba(0,0,0,0.04);
    }

    body, html, #root { background: var(--bg-base); color: var(--text-primary); font-family: var(--font-display); }
    * { transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease; }

    .grid-bg {
      background-image:
        linear-gradient(var(--grid-color) 1px, transparent 1px),
        linear-gradient(90deg, var(--grid-color) 1px, transparent 1px);
      background-size: 32px 32px;
    }

    .scrollbar-thin::-webkit-scrollbar { width: 6px; height: 6px; }
    .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
    .scrollbar-thin::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 3px; }
  `}</style>
);

/* ============================================================================
 *  PRIMITIVES
 * ========================================================================= */
const cx = (...c) => c.filter(Boolean).join(' ');

const Btn = ({ variant = 'primary', size = 'md', icon: Icon, children, onClick, className, disabled }) => {
  const sizes = { sm: 'h-7 px-2.5 text-xs', md: 'h-8 px-3 text-[13px]', lg: 'h-10 px-4 text-sm' };
  const base = 'inline-flex items-center justify-center gap-1.5 font-medium rounded-md transition-all whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cx(base, sizes[size], className)}
      style={
        variant === 'primary' ? { background: 'var(--accent-primary)', color: 'var(--accent-primary-fg)' } :
        variant === 'secondary' ? { background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-default)' } :
        variant === 'ghost' ? { background: 'transparent', color: 'var(--text-secondary)' } :
        variant === 'danger' ? { background: 'var(--danger)', color: '#fff' } : {}
      }
    >
      {Icon && <Icon className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />}
      {children}
    </button>
  );
};

const Card = ({ children, className, hover = false }) => (
  <div
    className={cx('rounded-lg overflow-hidden', className)}
    style={{
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border-default)',
      backgroundImage: 'var(--gradient-card)'
    }}
  >
    {children}
  </div>
);

const Badge = ({ tone = 'neutral', children, dot = false }) => {
  const tones = {
    neutral: { bg: 'var(--accent-muted)', fg: 'var(--text-secondary)' },
    success: { bg: 'var(--success-soft)', fg: 'var(--success)' },
    warning: { bg: 'var(--warning-soft)', fg: 'var(--warning)' },
    danger: { bg: 'var(--danger-soft)', fg: 'var(--danger)' },
    info: { bg: 'var(--info-soft)', fg: 'var(--info)' },
    blue: { bg: 'var(--accent-blue-soft)', fg: 'var(--accent-blue)' },
  };
  const t = tones[tone] || tones.neutral;
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium tracking-tight"
      style={{ background: t.bg, color: t.fg }}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full anim-pulse-soft" style={{ background: t.fg }} />}
      {children}
    </span>
  );
};

const Input = ({ label, type = 'text', value, onChange, placeholder, helperText, prefix, error }) => (
  <div className="flex flex-col gap-1.5">
    {label && <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</label>}
    <div className="relative">
      {prefix && (
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs pointer-events-none" style={{ color: 'var(--text-tertiary)' }}>
          {prefix}
        </span>
      )}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full h-9 rounded-md text-sm outline-none focus:ring-2 transition-all"
        style={{
          background: 'var(--bg-base)',
          border: `1px solid ${error ? 'var(--danger)' : 'var(--border-default)'}`,
          color: 'var(--text-primary)',
          paddingLeft: prefix ? '2.5rem' : '0.75rem',
          paddingRight: '0.75rem',
          boxShadow: 'var(--shadow-soft)'
        }}
      />
    </div>
    {helperText && <span className="text-[11px]" style={{ color: error ? 'var(--danger)' : 'var(--text-tertiary)' }}>{helperText}</span>}
  </div>
);

const Select = ({ label, value, onChange, options, helperText }) => (
  <div className="flex flex-col gap-1.5">
    {label && <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</label>}
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        className="w-full h-9 px-3 pr-9 rounded-md text-sm outline-none focus:ring-2 appearance-none cursor-pointer"
        style={{ background: 'var(--bg-base)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--text-tertiary)' }} />
    </div>
    {helperText && <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{helperText}</span>}
  </div>
);

/* ============================================================================
 *  SHELL
 * ========================================================================= */
const Logo = ({ size = 'md' }) => {
  const px = size === 'sm' ? 22 : 28;
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="flex items-center justify-center rounded-md relative overflow-hidden"
        style={{ width: px, height: px, background: 'var(--accent-primary)', color: 'var(--accent-primary-fg)' }}
      >
        <span className="font-bold text-sm relative z-10" style={{ fontFamily: 'var(--font-mono)' }}>V</span>
        <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.15), transparent 50%)' }} />
      </div>
      <div className="flex items-baseline gap-0.5">
        <span className="font-semibold text-[15px] tracking-tight" style={{ color: 'var(--text-primary)' }}>visible</span>
        <span className="font-semibold text-[15px] tracking-tight" style={{ color: 'var(--text-tertiary)' }}>au</span>
      </div>
    </div>
  );
};

const ThemeToggle = ({ theme, setTheme }) => (
  <button
    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
    className="relative h-8 w-14 rounded-full transition-all flex items-center px-1"
    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}
    aria-label="Toggle theme"
  >
    <div
      className="absolute h-6 w-6 rounded-full flex items-center justify-center transition-transform"
      style={{
        background: 'var(--accent-primary)',
        color: 'var(--accent-primary-fg)',
        transform: theme === 'dark' ? 'translateX(0)' : 'translateX(24px)',
        boxShadow: 'var(--shadow-card)'
      }}
    >
      {theme === 'dark' ? <Moon className="w-3 h-3" /> : <Sun className="w-3 h-3" />}
    </div>
  </button>
);

const Sidebar = ({ current, onNav }) => {
  const sections = [
    {
      title: 'Workspace',
      items: [
        { id: 'dashboard', label: 'Overview', icon: Activity },
        { id: 'brand-list', label: 'Brands', icon: Building2, count: 1 }, // X6 fix: was 3 (contradicts Starter/Free 1-brand limit; Sprint 1 demo = new user with 1 brand)
      ],
    },
    {
      title: 'Account',
      items: [
        // Note: in-app billing page is a Sprint 4+ deliverable; for now this links
        // to the public pricing page so users can compare tiers from inside the app.
        { id: 'pricing', label: 'View plans', icon: Boxes },
      ],
    },
  ];

  return (
    <aside
      className="w-60 shrink-0 flex flex-col h-full border-r"
      style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
    >
      <div className="px-4 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-subtle)' }}>
        <button onClick={() => onNav('landing')} className="cursor-pointer"><Logo size="sm" /></button>
      </div>

      {/* X4 fix: org tier was "Agency · Sydney" but user footer showed "Growth tier · AU" — inconsistent.
          An org has one tier. Fixed to Starter (realistic Sprint 1 new user demo context).
          Sprint 9 (Agency tier) screens use their own fixture data with 5+ brands. */}
      <div
        className="mx-3 mt-3 px-2.5 py-2 rounded-md flex items-center gap-2.5"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
      >
        <div
          className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold"
          style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', color: '#fff' }}
        >
          BC
        </div>
        <div className="flex-1 text-left min-w-0">
          <div className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>Bondi Creative</div>
          <div className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Starter · AU</div>
        </div>
      </div>

      <nav className="flex-1 px-2 py-4 overflow-y-auto scrollbar-thin">
        {sections.map(section => (
          <div key={section.title} className="mb-4">
            <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
              {section.title}
            </div>
            {section.items.map(item => {
              const active = current === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNav(item.id)}
                  className="w-full px-3 py-1.5 rounded-md flex items-center gap-2.5 text-[13px] font-medium transition-all relative group"
                  style={{
                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                    background: active ? 'var(--bg-elevated)' : 'transparent',
                    border: active ? '1px solid var(--border-default)' : '1px solid transparent'
                  }}
                  onMouseEnter={e => !active && (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={e => !active && (e.currentTarget.style.background = 'transparent')}
                >
                  <item.icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.count !== undefined && (
                    <span
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
                      style={{ background: 'var(--accent-muted)', color: 'var(--text-tertiary)' }}
                    >
                      {item.count}
                    </span>
                  )}
                  {item.status === 'running' && (
                    <span className="w-1.5 h-1.5 rounded-full anim-pulse-soft" style={{ background: 'var(--accent-blue)' }} />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="p-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
        <div
          className="px-3 py-2.5 rounded-md flex items-start gap-2.5"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}
        >
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0"
               style={{ background: 'linear-gradient(135deg, #f97316, #ec4899)', color: '#fff' }}>
            SK
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>Sri Komman</div>
            <div className="text-[10px] truncate" style={{ color: 'var(--text-tertiary)' }}>Starter tier · AU</div>
          </div>
          <button
            data-testid="user-menu-trigger"
            aria-label="Open user menu"
            className="p-1 rounded hover:opacity-80"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {/* In production: replaced with Clerk's <UserButton /> which renders its own
                menu including Sign out. The MoreHorizontal icon here is a prototype-only stand-in. */}
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
};

const TopBar = ({ theme, setTheme, breadcrumbs = [], actions }) => (
  <header
    className="h-14 shrink-0 px-5 flex items-center justify-between border-b"
    style={{ background: 'var(--bg-base)', borderColor: 'var(--border-subtle)' }}
  >
    <div className="flex items-center gap-2 text-sm">
      {breadcrumbs.map((bc, i) => (
        <React.Fragment key={i}>
          {i > 0 && <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />}
          <span style={{ color: i === breadcrumbs.length - 1 ? 'var(--text-primary)' : 'var(--text-tertiary)' }} className={i === breadcrumbs.length - 1 ? 'font-medium' : ''}>
            {bc}
          </span>
        </React.Fragment>
      ))}
    </div>
    <div className="flex items-center gap-2">
      {actions}
      <div className="h-5 w-px mx-1" style={{ background: 'var(--border-default)' }} />
      <button
        className="w-8 h-8 rounded-md flex items-center justify-center hover:opacity-70 transition-opacity"
        style={{ color: 'var(--text-secondary)' }}
      >
        <Bell className="w-4 h-4" />
      </button>
      <ThemeToggle theme={theme} setTheme={setTheme} />
    </div>
  </header>
);

const PageShell = ({ theme, setTheme, current, onNav, breadcrumbs, actions, children }) => (
  <div className="flex h-screen overflow-hidden">
    <Sidebar current={current} onNav={onNav} />
    <div className="flex-1 flex flex-col min-w-0">
      <TopBar theme={theme} setTheme={setTheme} breadcrumbs={breadcrumbs} actions={actions} />
      <main className="flex-1 overflow-y-auto scrollbar-thin" style={{ background: 'var(--bg-base)' }}>
        {children}
      </main>
    </div>
  </div>
);

/* ============================================================================
 *  PUBLIC PAGES (no shell)
 * ========================================================================= */
const PublicNav = ({ theme, setTheme, onNav }) => (
  <header
    className="h-16 px-8 flex items-center justify-between border-b sticky top-0 z-50 backdrop-blur-md"
    style={{ background: 'var(--bg-base)', borderColor: 'var(--border-subtle)' }}
  >
    <button onClick={() => onNav('landing')}><Logo /></button>
    <nav className="hidden md:flex items-center gap-7 text-[13px]">
      <button onClick={() => onNav('pricing')} className="hover:opacity-70 transition-opacity" style={{ color: 'var(--text-secondary)' }}>Pricing</button>
      {/* X5 fix: "Verticals", "How it works", "Docs" were dead <a> tags with no navigation.
          Wired to their target prototype screens. Sprint assignments:
          - Verticals → Sprint 5 vertical-pack-browser
          - How it works → Sprint 11 methodology page
          - Docs → Sprint 11 docs hub */}
      <button onClick={() => onNav('vertical-pack-browser')} className="hover:opacity-70 transition-opacity" style={{ color: 'var(--text-secondary)' }}>Verticals</button>
      <button onClick={() => onNav('methodology')} className="hover:opacity-70 transition-opacity" style={{ color: 'var(--text-secondary)' }}>How it works</button>
      <button onClick={() => onNav('docs')} className="hover:opacity-70 transition-opacity" style={{ color: 'var(--text-secondary)' }}>Docs</button>
    </nav>
    <div className="flex items-center gap-2">
      <ThemeToggle theme={theme} setTheme={setTheme} />
      <button onClick={() => onNav('signin')} className="text-[13px] px-3 py-1.5 hover:opacity-70 transition-opacity" style={{ color: 'var(--text-secondary)' }}>
        Sign in
      </button>
      <Btn icon={ArrowRight} onClick={() => onNav('signup')}>Start free</Btn>
    </div>
  </header>
);

/* ----- LANDING ----- */
const Landing = ({ theme, setTheme, onNav }) => (
  <div className="min-h-screen relative" style={{ background: 'var(--bg-base)' }}>
    <PublicNav theme={theme} setTheme={setTheme} onNav={onNav} />

    {/* Hero */}
    <section className="relative overflow-hidden">
      <div className="absolute inset-0" style={{ background: 'var(--gradient-glow)' }} />
      <div className="absolute inset-0 grid-bg opacity-50" />
      <div className="relative max-w-6xl mx-auto px-8 pt-24 pb-32 text-center anim-fade-in-up">
        <Badge tone="blue" dot>Built for Australian agencies & SaaS founders</Badge>
        <h1 className="mt-7 text-[68px] leading-[1.05] font-semibold tracking-[-0.025em]" style={{ color: 'var(--text-primary)' }}>
          See how AI<br />
          <span style={{ color: 'var(--text-tertiary)' }}>recommends your brand.</span>
        </h1>
        <p className="mt-6 text-lg max-w-xl mx-auto leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          Track brand visibility across ChatGPT, Claude, Gemini, and Perplexity. AU-first vertical packs.
          Suburb-level tracking. Research-backed actions.
        </p>
        <div className="mt-10 flex items-center justify-center gap-3">
          <Btn size="lg" icon={ArrowRight} onClick={() => onNav('signup')}>Start free audit</Btn>
          <Btn variant="secondary" size="lg" onClick={() => onNav('pricing')}>View pricing</Btn>
        </div>
        <div className="mt-16 flex items-center justify-center gap-8 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          <div className="flex items-center gap-2"><Shield className="w-3.5 h-3.5" /> Sydney data residency</div>
          <div className="flex items-center gap-2"><Zap className="w-3.5 h-3.5" /> 4 AI engines</div>
          <div className="flex items-center gap-2"><Globe className="w-3.5 h-3.5" /> 6 regions</div>
        </div>
      </div>
    </section>

    {/* Mock dashboard preview */}
    <section className="relative max-w-6xl mx-auto px-8 -mt-12 pb-24">
      <Card className="p-1.5 anim-fade-in-up" style={{ animationDelay: '0.2s' }}>
        <div className="rounded-md p-6" style={{ background: 'var(--bg-base)' }}>
          <div className="flex items-center gap-2 mb-6">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#ef4444' }} />
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#f59e0b' }} />
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: '#22c55e' }} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Visibility Score', value: '64.2', delta: '+8.4', tone: 'blue' },
              { label: 'Citations Detected', value: '142', delta: '+23', tone: 'success' },
              { label: 'Position (avg)', value: '2.8', delta: '↑ 1.2', tone: 'success' },
            ].map((m, i) => (
              <div key={i} className="rounded-md p-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <div className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>{m.label}</div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>{m.value}</span>
                  <Badge tone={m.tone}>{m.delta}</Badge>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-md p-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
            <div className="flex items-end justify-between gap-1 h-32">
              {[40, 52, 48, 61, 55, 68, 64, 72, 78, 71, 82, 89].map((v, i) => (
                <div key={i} className="flex-1 rounded-sm anim-fade-in-up" style={{
                  height: `${v}%`,
                  background: `linear-gradient(180deg, var(--accent-blue), transparent)`,
                  animationDelay: `${0.4 + i * 0.04}s`
                }} />
              ))}
            </div>
          </div>
        </div>
      </Card>
    </section>

    {/* Features grid */}
    <section className="max-w-6xl mx-auto px-8 pb-24">
      <div className="text-center mb-12">
        <h2 className="text-3xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          Built for the AI search shift
        </h2>
        <p className="mt-3 text-sm max-w-md mx-auto" style={{ color: 'var(--text-secondary)' }}>
          The tools you'd build if SEO mattered less and being recommended by AI mattered more.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        {[
          { icon: Target, title: 'AU vertical packs', desc: 'Tradies, Allied Health, SaaS — with prompts that match how Australians actually search.' },
          { icon: MapPin, title: 'Suburb-level tracking', desc: 'Bondi vs Parramatta vs Surry Hills. See where AI recommends you (and where it doesn\'t).' },
          { icon: Sparkles, title: 'Research-backed actions', desc: 'Every recommendation cites the study, regulation, or pattern it\'s based on. No snake oil.' },
        ].map((f, i) => (
          <Card key={i} className="p-6">
            <div className="w-9 h-9 rounded-md flex items-center justify-center mb-4" style={{ background: 'var(--accent-blue-soft)', color: 'var(--accent-blue)' }}>
              <f.icon className="w-4 h-4" />
            </div>
            <h3 className="font-semibold text-base mb-2" style={{ color: 'var(--text-primary)' }}>{f.title}</h3>
            <p className="text-[13px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{f.desc}</p>
          </Card>
        ))}
      </div>
    </section>

    {/* CTA */}
    <section className="max-w-6xl mx-auto px-8 pb-24">
      <div
        className="rounded-xl p-12 text-center relative overflow-hidden"
        style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          backgroundImage: 'var(--gradient-glow), var(--gradient-card)'
        }}
      >
        <h2 className="text-3xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          Run your first audit free.
        </h2>
        <p className="mt-3 text-[15px]" style={{ color: 'var(--text-secondary)' }}>
          No credit card. 1 brand. Sample audit in 90 seconds.
        </p>
        <Btn size="lg" icon={ArrowRight} onClick={() => onNav('signup')} className="mt-7">Start your audit</Btn>
      </div>
    </section>

    <footer className="border-t py-8 px-8" style={{ borderColor: 'var(--border-subtle)' }}>
      <div className="max-w-6xl mx-auto flex items-center justify-between text-xs" style={{ color: 'var(--text-tertiary)' }}>
        <span>© 2026 VisibleAU. Built in Sydney.</span>
        {/* Z7 fix: footer links were dead <a> tags — no onClick/href.
            Privacy + Terms ship in Sprint 11. Status is an external uptime page (Sprint 12).
            Wired to nearest available prototype screens as stand-ins. */}
        <div className="flex gap-5">
          <button className="hover:opacity-70" onClick={() => onNav('docs')}>Privacy</button>
          <button className="hover:opacity-70" onClick={() => onNav('docs')}>Terms</button>
          <button className="hover:opacity-70" onClick={() => onNav('methodology')}>Status</button>
        </div>
      </div>
    </footer>
  </div>
);

/* ----- AUTH PAGES ----- */
const AuthLayout = ({ theme, setTheme, onNav, title, subtitle, children, footer }) => (
  <div className="min-h-screen flex" style={{ background: 'var(--bg-base)' }}>
    {/* Left side */}
    <div className="flex-1 flex flex-col justify-between p-10 relative overflow-hidden border-r" style={{ borderColor: 'var(--border-subtle)' }}>
      <div className="absolute inset-0 grid-bg opacity-40 pointer-events-none" />
      <button onClick={() => onNav('landing')} className="relative z-10 self-start"><Logo /></button>

      <div className="relative z-10 max-w-md">
        <Badge tone="blue" dot>Sydney · ap-southeast-2</Badge>
        <h2 className="mt-5 text-3xl font-semibold tracking-tight leading-tight" style={{ color: 'var(--text-primary)' }}>
          The first GEO platform built for the Australian market.
        </h2>
        <div className="mt-8 space-y-3">
          {[
            'AU-first vertical content & compliance',
            'Suburb-level tracking, not just metro',
            'Flat agency tiers — no per-brand surprises',
            'Research-backed Action Center'
          ].map((t, i) => (
            <div key={i} className="flex items-center gap-3 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
              <Check className="w-4 h-4" style={{ color: 'var(--accent-blue)' }} />
              {t}
            </div>
          ))}
        </div>
      </div>

      <div className="relative z-10 flex items-center gap-3">
        <ThemeToggle theme={theme} setTheme={setTheme} />
        <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>Theme</span>
      </div>
    </div>

    {/* Right side — form */}
    <div className="flex-1 flex items-center justify-center p-10">
      <div className="w-full max-w-sm anim-fade-in-up">
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>{title}</h1>
        <p className="mt-1.5 text-[13px]" style={{ color: 'var(--text-secondary)' }}>{subtitle}</p>
        <div className="mt-8">{children}</div>
        {footer && <div className="mt-6 text-center text-[13px]" style={{ color: 'var(--text-tertiary)' }}>{footer}</div>}
      </div>
    </div>
  </div>
);

const SignIn = ({ theme, setTheme, onNav }) => (
  <AuthLayout
    theme={theme}
    setTheme={setTheme}
    onNav={onNav}
    title="Welcome back"
    subtitle="Sign in to continue to your workspace."
    footer={<>Don't have an account? <button onClick={() => onNav('signup')} className="font-medium" style={{ color: 'var(--text-primary)' }}>Sign up</button></>}
  >
    <div className="flex flex-col gap-4">
      <Input label="Email" type="email" placeholder="you@agency.com.au" />
      <Input label="Password" type="password" placeholder="••••••••" />
      {/* V8 fix: SignIn button was missing onClick/onNav — clicking did nothing.
          Real app: Clerk handles auth, then middleware redirects to /dashboard.
          If org has 0 brands → redirect to /brands/wizard (Sprint 4 establishes this).
          Prototype shows the happy-path destination: dashboard. */}
      <Btn size="lg" icon={LogIn} className="w-full mt-2" onClick={() => onNav('dashboard')}>Sign in</Btn>
    </div>
  </AuthLayout>
);

const SignUp = ({ theme, setTheme, onNav }) => {
  const [region, setRegion] = useState('au');  // lowercase per Sprint 1 regionEnum
  const [tier, setTier] = useState('free');

  // Free tier feature flag — matches Sprint 1 spec FEATURE_FREE_TIER_ENABLED_<region> env vars.
  // In production this comes from `lib/feature-flags/index.ts`. Default ON for AU, OFF elsewhere.
  // Feature flags per Sprint 1 §3 env canonical:
  // FREE_TIER_ENABLED_AU=true, FREE_TIER_ENABLED_NZ=true, all others false
  const FREE_TIER_REGIONS = { au: true, nz: true, uk: false, us: false, eu: false, ca: false };
  const freeTierAvailable = FREE_TIER_REGIONS[region];

  // If user picks a region without Free tier, fall back to Starter
  useEffect(() => {
    if (tier === 'free' && !freeTierAvailable) setTier('starter');
  }, [region, tier, freeTierAvailable]);

  return (
    <AuthLayout
      theme={theme}
      setTheme={setTheme}
      onNav={onNav}
      title="Start your first audit"
      subtitle="Free tier · No card required for AU and NZ."
      footer={<>Already on VisibleAU? <button onClick={() => onNav('signin')} className="font-medium" style={{ color: 'var(--text-primary)' }}>Sign in</button></>}
    >
      <div className="flex flex-col gap-4">
        <Input label="Full name" placeholder="Sri Komman" />
        <Input label="Work email" type="email" placeholder="you@agency.com.au" />
        <Input label="Password" type="password" placeholder="At least 8 characters" />

        <Select
          label="Region"
          value={region}
          onChange={e => setRegion(e.target.value)}
          options={[
            { value: 'au', label: '🇦🇺 Australia' },
            { value: 'nz', label: '🇳🇿 New Zealand' },
            { value: 'uk', label: '🇬🇧 United Kingdom' },
            { value: 'us', label: '🇺🇸 United States' },
            { value: 'eu', label: '🇪🇺 Europe' },
            { value: 'ca', label: '🇨🇦 Canada' },
          ]}
          helperText="Detected from your location. Override if needed."
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Plan</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'free', label: 'Free', sub: '1 brand · 2 engines', disabled: !freeTierAvailable },
              { id: 'starter', label: 'Starter', sub: 'A$99 · 4 engines' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => !t.disabled && setTier(t.id)}
                disabled={t.disabled}
                className="px-3 py-2.5 rounded-md text-left transition-all disabled:cursor-not-allowed"
                style={{
                  background: tier === t.id ? 'var(--bg-elevated)' : 'transparent',
                  border: `1px solid ${tier === t.id ? 'var(--border-strong)' : 'var(--border-default)'}`,
                  boxShadow: tier === t.id ? 'var(--shadow-soft)' : 'none',
                  opacity: t.disabled ? 0.4 : 1
                }}
              >
                <div className="flex items-center gap-2">
                  {tier === t.id ? <CircleDot className="w-3.5 h-3.5" style={{ color: 'var(--accent-blue)' }} /> : <Circle className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />}
                  <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>{t.label}</span>
                </div>
                <div className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>{t.sub}</div>
                {t.disabled && (
                  <div className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
                    Not available in your region yet
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Z1 note: region value is collected here and must reach the DB.
            The webhook `organization.created` has NO native region field.
            Flow: user selects region → on form submit, client calls Clerk SDK
            `organizations.createOrganization({ publicMetadata: { region, tier } })`
            → webhook fires with `evt.data.public_metadata.region` → inserted into organizations row.
            See Sprint 1 §6 Clerk webhook for the full implementation pattern. */}
        <Btn size="lg" icon={UserPlus} className="w-full mt-2" onClick={() => onNav('dashboard')}>Create account</Btn>

        <p className="text-[11px] text-center mt-1" style={{ color: 'var(--text-tertiary)' }}>
          By signing up you agree to our Terms and Privacy Policy.
        </p>
      </div>
    </AuthLayout>
  );
};

/* ----- PRICING ----- */
const Pricing = ({ theme, setTheme, onNav }) => {
  const tiers = [
    {
      name: 'Free', price: 'A$0', period: 'forever',
      desc: 'Validate the audit before you commit.',
      features: ['1 brand', '2 AI engines (ChatGPT + Perplexity)', '20 prompts', '1 audit/month', 'Audit history: 6 months'],
      cta: 'Start free', tone: 'neutral'
    },
    {
      name: 'Starter', price: 'A$99', period: '/month',
      desc: 'Solo founders & small businesses.',
      features: ['1 brand', '4 AI engines (ChatGPT, Claude, Gemini, Perplexity)', '50-prompt library', 'Weekly audits', 'PDF export'],
      cta: 'Start trial', tone: 'neutral'
    },
    {
      name: 'Growth', price: 'A$299', period: '/month',
      desc: 'Mid-market SaaS, growing AU SMB.',
      features: ['1 brand', '4 AI engines + Copilot, AI Overviews coming Q3 2026', 'Up to 200 prompts (pack-size dependent in v1)', '3×/week audits', 'CSV + JSON export', 'Action Center', 'API access (v1.1)'],
      cta: 'Start trial', tone: 'highlight', badge: 'Most popular'
    },
    {
      name: 'Agency', price: 'A$499', period: '/month',
      desc: 'AU agencies starting their AEO offering.',
      features: ['5 brands', '4 AI engines + Copilot, AI Overviews coming Q3 2026', 'Up to 100 prompts/brand', 'Daily audits', 'White-label reports', 'Priority support'],
      cta: 'Start trial', tone: 'neutral'
    },
    {
      name: 'Agency Pro', price: 'A$1,499', period: '/month',
      desc: 'Established agencies with 25+ clients.',
      features: ['25 brands', '4 AI engines + 4 more coming Q3-Q4 2026 (Copilot, AI Overviews, DeepSeek, Grok)', 'Up to 200 prompts/brand (pack-size dependent in v1)', '2×/day audits', 'Dedicated CSM', 'API access (v1.1)'],
      cta: 'Start trial', tone: 'neutral'
    },
    {
      name: 'Enterprise', price: 'Custom', period: '',
      desc: 'Large brands, multi-region, custom compliance.',
      features: ['Unlimited brands', 'All engines as released', 'Custom prompts', 'Dedicated infra', 'SLA & SAML'],
      cta: 'Contact sales', tone: 'neutral'
    },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
      <PublicNav theme={theme} setTheme={setTheme} onNav={onNav} />
      <div className="max-w-7xl mx-auto px-8 pt-16 pb-24">
        <div className="text-center mb-14">
          <Badge tone="blue">Pricing in AUD</Badge>
          <h1 className="mt-5 text-5xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            Simple, transparent pricing.
          </h1>
          <p className="mt-4 text-base" style={{ color: 'var(--text-secondary)' }}>
            Start free. Scale as your agency grows. No per-brand surprises.
          </p>
        </div>

        {/* U2 fix: CLAUDE.md §7 "Display prices include GST." Sprint 10: "GST-inclusive by default for AU users (10% GST)." */}
        <p className="text-center text-[12px] mb-6" style={{ color: 'var(--text-tertiary)' }}>
          All prices in AUD, GST inclusive (10%). Non-AU customers see ex-GST pricing at checkout.
        </p>

        <div className="grid grid-cols-3 gap-4">
          {tiers.map(t => (
            <Card key={t.name} className={cx('p-7 relative', t.tone === 'highlight' && 'ring-2')} style={t.tone === 'highlight' ? { borderColor: 'var(--accent-blue)' } : {}}>
              {t.badge && (
                <div className="absolute -top-2.5 left-7">
                  <Badge tone="blue">{t.badge}</Badge>
                </div>
              )}
              <div className="flex items-baseline justify-between mb-1">
                <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{t.name}</h3>
              </div>
              <p className="text-[13px] mb-5" style={{ color: 'var(--text-secondary)' }}>{t.desc}</p>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-3xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>{t.price}</span>
                {t.period && <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{t.period}</span>}
              </div>
              <Btn variant={t.tone === 'highlight' ? 'primary' : 'secondary'} className="w-full mb-5" onClick={() => onNav('signup')}>
                {t.cta}
              </Btn>
              <ul className="space-y-2.5">
                {t.features.map(f => (
                  <li key={f} className="flex items-center gap-2.5 text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
                    <Check className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent-blue)' }} />
                    {f}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>

        {/* Annual billing callout — PRD §7 Principle #3: annual = 2 months free (16% discount) */}
        <div className="mt-10 p-6 rounded-xl text-center" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}>
          <Badge tone="success">Annual billing</Badge>
          <h3 className="text-lg font-semibold mt-3 mb-1" style={{ color: 'var(--text-primary)' }}>Save 2 months — pay annually and get 16% off</h3>
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
            Starter A$99/mo → A$998/yr (was A$1,188) · Growth A$299/mo → A$3,029/yr · Agency A$499/mo → A$5,030/yr
          </p>
          <Btn variant="secondary" onClick={() => onNav('signup')}>Switch to annual at checkout</Btn>
        </div>

        {/* One-off audit — PRD §7 Principle #4: A$299 single charge, conversion path to monthly */}
        <div className="mt-6 p-6 rounded-xl flex items-center justify-between" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}>
          <div>
            <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Just need a one-off audit?</h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Single audit — all 4 engines, full Action Center, PDF report. No subscription. A$299 one-time.</p>
          </div>
          <Btn variant="secondary" onClick={() => onNav('signup')}>Get one-off audit — A$299</Btn>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 *  AUTHENTICATED PAGES
 * ========================================================================= */

/* ----- DASHBOARD (with Sprint 1 empty state note) ----- */
const Dashboard = (props) => (
  <PageShell
    {...props}
    breadcrumbs={['Workspace', 'Overview']}
    actions={
      <Btn icon={Plus} onClick={() => props.onNav('brand-create')}>New brand</Btn>
    }
  >
    <div className="max-w-6xl mx-auto px-8 py-10">
      {/*
        SPRINT 1 NOTE — Sprint 1 §1 says "Basic dashboard layout with sidebar (no real data yet)."
        The SPRINT 1 BUILD renders the empty state below (no KPI cards, no audit feed).
        This prototype shows the SPRINT 4+ populated state below the comment for design reference.

        SPRINT 2 NOTE (U5 fix): Sprint 2 produces real audit data but only 1 engine, 10 prompts.
        After Sprint 2, the dashboard should show a minimal recent-audits feed with the first audit
        status. The KPI cards (US$22.40 spend, avg visibility 64.2) require multi-audit aggregation
        and are Sprint 4+ content. Sprint 3 adds the multi-engine data that makes the KPIs meaningful.

        EMPTY STATE (Sprint 1 build renders this when brands.length === 0 or no audits yet):

        <div className="py-20 text-center">
          <Sparkles className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
          <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
            Welcome to VisibleAU
          </h2>
          <p className="text-sm max-w-sm mx-auto mb-6" style={{ color: 'var(--text-secondary)' }}>
            Create your first brand to start tracking how AI engines describe your business.
          </p>
          <Btn icon={Plus} onClick={() => props.onNav('brand-create')}>Create first brand</Btn>
        </div>

        Sprint 4 fills in the full KPI cards + rich audits feed. Sprint 2 shows basic feed entries.
      */}
      <div className="mb-8 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>Welcome back, Sri.</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Here's what's happening across your brands.</p>
        </div>
        <Badge tone="success" dot>All systems normal</Badge>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Brands tracked', value: '3', icon: Building2 },
          { label: 'Audits this month', value: '12', icon: Sparkles, sub: '+4 vs last' },
          { label: 'Avg visibility', value: '64.2', icon: Activity, sub: '+8.4 pts' },
          { label: 'LLM spend', value: 'US$22.40', icon: Zap, sub: 'this month (≈ A$33.60 · 12 audits)' },
        ].map((m, i) => (
          <Card key={i} className="p-5">
            <div className="flex items-start justify-between mb-3">
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{m.label}</span>
              <m.icon className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
            </div>
            <div className="text-2xl font-semibold tracking-tight font-mono" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{m.value}</div>
            {m.sub && <div className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>{m.sub}</div>}
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden mb-6">
        <div className="px-5 py-4 flex items-center justify-between border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Recent audits</h3>
            <Badge tone="neutral">12</Badge>
          </div>
          <Btn variant="ghost" size="sm">View all <ArrowRight className="w-3 h-3" /></Btn>
        </div>
        <div>
          {[
            // BI4 fix: Bondi Plumbing score 71.4 → 63.4 (consistent with all other screen corrections)
            { brand: 'Bondi Plumbing', region: 'NSW · Bondi', score: 63.4, status: 'complete', time: '2h ago', tone: 'success' },
            { brand: 'Sydney Dental Co.', region: 'NSW · Surry Hills', score: 58.9, status: 'complete', time: '6h ago', tone: 'warning' },
            { brand: 'Surry SaaS Co', region: 'NSW · Surry Hills', score: null, status: 'running', time: 'Running', tone: 'info' },
            { brand: 'Bondi Plumbing', region: 'NSW · Bondi', score: 64.8, status: 'complete', time: '1d ago', tone: 'success' },
          ].map((a, i) => (
            <button
              key={i}
              onClick={() => props.onNav(a.status === 'running' ? 'audit-running' : 'audit-results-basic')}
              className="w-full px-5 py-3.5 flex items-center gap-4 hover:opacity-90 transition-opacity border-b last:border-b-0"
              style={{ borderColor: 'var(--border-subtle)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {/* U3 fix: Sprint 2 produces AuditResultsBasic — not AuditResultsRich (Sprint 3+) */}
              <div className="flex-1 text-left">
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{a.brand}</div>
                <div className="text-[11px] mt-0.5 flex items-center gap-1.5" style={{ color: 'var(--text-tertiary)' }}>
                  <MapPin className="w-3 h-3" /> {a.region}
                </div>
              </div>
              {a.score !== null ? (
                <div className="font-mono text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{a.score}</div>
              ) : (
                <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--accent-blue)' }} />
              )}
              <Badge tone={a.tone}>{a.status}</Badge>
              <div className="text-[11px] w-16 text-right" style={{ color: 'var(--text-tertiary)' }}>{a.time}</div>
              <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
            </button>
          ))}
        </div>
      </Card>
    </div>
  </PageShell>
);

/* ----- BRAND LIST ----- */
const BrandList = (props) => (
  <PageShell
    {...props}
    breadcrumbs={['Workspace', 'Brands']}
    actions={<Btn icon={Plus} onClick={() => props.onNav('brand-create')}>New brand</Btn>}
  >
    <div className="max-w-6xl mx-auto px-8 py-10">
      {/*
        EMPTY STATE — when brands.length === 0, render this instead of the table:

        <Card className="p-12 text-center">
          <Building2 className="w-10 h-10 mx-auto mb-4" style={{ color: 'var(--text-tertiary)' }} />
          <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
            No brands yet
          </h2>
          <p className="text-[13px] mb-6 max-w-sm mx-auto" style={{ color: 'var(--text-secondary)' }}>
            Create your first brand to start tracking how AI engines recommend you across the web.
          </p>
          <Btn icon={Plus} onClick={() => props.onNav('brand-create')}>Create your first brand</Btn>
        </Card>

        The Sprint 1 E2E tests look for /no brands yet|create your first/i — both phrases
        appear in the empty state above so the test matches.
      */}
      <div className="mb-8 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>Brands</h1>
          {/*
            SPRINT SCOPE NOTE: This prototype shows a Sprint 9 Agency-tier state (3 of 5 brands).
            Sprint 1 BrandList for a Free tier user shows 1 brand (Free limit = 1 brand per CLAUDE.md §1).
            Starter users see 1 brand. Agency users see up to 5. Agency Pro up to 25.
            Sprint 9 adds the brand-count indicator and tier badge.
          */}
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>3 of 5 brands · Agency tier</p>
        </div>
      </div>

      <Card>
        <div className="grid grid-cols-12 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider border-b"
             style={{ color: 'var(--text-tertiary)', borderColor: 'var(--border-subtle)' }}>
          <div className="col-span-4">Brand</div>
          <div className="col-span-2">Vertical</div>
          <div className="col-span-2">Region</div>
          <div className="col-span-2 text-right">Last score</div>
          <div className="col-span-2 text-right">Last audit</div>
        </div>
        {[
          // BF4 fix: score corrected to 63.4 (was 71.4) — matches AuditResultsRich/BrandDetail corrections
          { name: 'Bondi Plumbing', domain: 'bondiplumbing.com.au', vertical: 'Tradies', region: 'NSW · Bondi', score: 63.4, time: '2h ago', tone: 'success' },
          { name: 'Sydney Dental Co.', domain: 'sydneydentalco.com.au', vertical: 'Allied Health', region: 'NSW · Surry Hills', score: 58.9, time: '6h ago', tone: 'warning' },
          { name: 'Surry SaaS Co', domain: 'surrysaas.com.au', vertical: 'SaaS', region: 'NSW · Surry Hills', score: null, time: 'Running', tone: 'info' },
        ].map((b, i) => (
          <button
            key={i}
            onClick={() => props.onNav('brand-detail')}
            className="w-full grid grid-cols-12 px-5 py-3.5 items-center text-left transition-all border-b last:border-b-0"
            style={{ borderColor: 'var(--border-subtle)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <div className="col-span-4 flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-md flex items-center justify-center text-xs font-semibold shrink-0"
                style={{ background: i === 0 ? 'linear-gradient(135deg, #f97316, #ea580c)' : i === 1 ? 'linear-gradient(135deg, #06b6d4, #0891b2)' : 'linear-gradient(135deg, #8b5cf6, #6366f1)', color: '#fff' }}
              >
                {b.name[0]}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>{b.name}</div>
                <div className="text-[11px] truncate" style={{ color: 'var(--text-tertiary)' }}>{b.domain}</div>
              </div>
            </div>
            <div className="col-span-2"><Badge>{b.vertical}</Badge></div>
            <div className="col-span-2 text-[12.5px] flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
              <MapPin className="w-3 h-3" />{b.region}
            </div>
            <div className="col-span-2 text-right font-mono text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              {b.score ?? '—'}
            </div>
            <div className="col-span-2 flex items-center justify-end gap-2">
              <Badge tone={b.tone}>{b.time}</Badge>
              <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
            </div>
          </button>
        ))}
      </Card>
    </div>
  </PageShell>
);

/* ----- BRAND CREATE ----- */
const BrandCreate = (props) => {
  const [vertical, setVertical] = useState('saas');
  const [competitors, setCompetitors] = useState(['notion.so', 'linear.app']);
  const [newComp, setNewComp] = useState('');
  // W7 fix: primaryRegions was hardcoded (not state-driven); Add button had no onClick;
  // remove X had no handler. Now mirrors the competitors pattern exactly.
  const [primaryRegions, setPrimaryRegions] = useState(['NSW:Bondi', 'NSW:Parramatta', 'NSW:Surry Hills']);
  const [newRegion, setNewRegion] = useState('');

  return (
    <PageShell
      {...props}
      breadcrumbs={['Workspace', 'Brands', 'New brand']}
    >
      <div className="max-w-3xl mx-auto px-8 py-10">
        <div className="mb-8">
          <button onClick={() => props.onNav('brand-list')} className="text-[12px] flex items-center gap-1 mb-4 hover:opacity-70" style={{ color: 'var(--text-tertiary)' }}>
            <ChevronLeft className="w-3 h-3" /> Back to brands
          </button>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>Create a brand</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>We'll generate AU-specific prompts based on your vertical and locations.</p>
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="text-sm font-semibold mb-5" style={{ color: 'var(--text-primary)' }}>Identity</h3>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Brand name" placeholder="Bondi Plumbing" />
              <Input label="Domain" placeholder="bondiplumbing.com.au" prefix="https://" />
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-sm font-semibold mb-5" style={{ color: 'var(--text-primary)' }}>Vertical</h3>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'tradies', label: 'Tradies', desc: 'Plumber, electrician, builder' },
                { id: 'allied_health', label: 'Allied Health', desc: 'Dentist, physio, GP' },
                { id: 'saas', label: 'SaaS', desc: 'B2B software, dev tools' },
              ].map(v => (
                <button
                  key={v.id}
                  onClick={() => setVertical(v.id)}
                  className="p-4 rounded-md text-left transition-all"
                  style={{
                    background: vertical === v.id ? 'var(--bg-elevated)' : 'transparent',
                    border: `1px solid ${vertical === v.id ? 'var(--border-strong)' : 'var(--border-default)'}`,
                  }}
                >
                  <div className="flex items-center gap-2">
                    {vertical === v.id ? <CircleDot className="w-3.5 h-3.5" style={{ color: 'var(--accent-blue)' }} /> : <Circle className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />}
                    <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>{v.label}</span>
                  </div>
                  <div className="text-[11px] mt-1.5" style={{ color: 'var(--text-tertiary)' }}>{v.desc}</div>
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Primary regions</h3>
            <p className="text-[12px] mb-4" style={{ color: 'var(--text-secondary)' }}>Suburb-level locations where you want to be discovered.</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {primaryRegions.map(r => (
                <span key={r}
                  className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-[12px]"
                  style={{ background: 'var(--accent-blue-soft)', color: 'var(--accent-blue)' }}
                >
                  <MapPin className="w-3 h-3" />
                  {r}
                  <button onClick={() => setPrimaryRegions(primaryRegions.filter(x => x !== r))} className="hover:opacity-70">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newRegion}
                onChange={e => setNewRegion(e.target.value)}
                placeholder="Add suburb (e.g. NSW:Manly)"
                className="flex-1 h-9 px-3 rounded-md text-sm"
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newRegion.match(/^[A-Z]{2,4}:[A-Za-z][\w\s]{0,49}$/)) {
                    e.preventDefault();
                    if (!primaryRegions.includes(newRegion)) setPrimaryRegions([...primaryRegions, newRegion]);
                    setNewRegion('');
                  }
                }}
              />
              <Btn variant="secondary" onClick={() => {
                if (newRegion.match(/^[A-Z]{2,4}:[A-Za-z][\w\s]{0,49}$/) && !primaryRegions.includes(newRegion)) {
                  setPrimaryRegions([...primaryRegions, newRegion]);
                  setNewRegion('');
                }
              }}>Add</Btn>
            </div>
            <div className="text-[11px] mt-1.5" style={{ color: 'var(--text-tertiary)' }}>
              Format: STATE:Suburb (e.g. NSW:Manly, VIC:Fitzroy). Press Enter or click Add. Stored with no space after colon.
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Competitors</h3>
            <p className="text-[12px] mb-4" style={{ color: 'var(--text-secondary)' }}>We'll track when AI mentions them instead of you.</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {competitors.map(c => (
                <span key={c}
                  className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-[12px]"
                  style={{ background: 'var(--accent-muted)', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}
                >
                  {c}
                  <button onClick={() => setCompetitors(competitors.filter(x => x !== c))} className="hover:opacity-70">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newComp}
                onChange={e => setNewComp(e.target.value)}
                placeholder="competitor.com.au"
                className="flex-1 h-9 px-3 rounded-md text-sm"
                style={{ background: 'var(--bg-base)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
              />
              <Btn variant="secondary" onClick={() => { if (newComp) { setCompetitors([...competitors, newComp]); setNewComp(''); } }}>Add</Btn>
            </div>
          </Card>

          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="secondary" onClick={() => props.onNav('brand-list')}>Cancel</Btn>
            {/* V9 fix: was onNav('brand-detail'). Sprint 1 §11 acceptance: "submit → see brand in list".
                After creation the user should see the brand appear in the list, then click through. */}
            <Btn icon={ArrowRight} onClick={() => props.onNav('brand-list')}>Create brand</Btn>
          </div>
        </div>
      </div>
    </PageShell>
  );
};

/* ----- BRAND DETAIL ----- */
const BrandDetail = (props) => {
  // V10 fix: Edit button was missing onClick — clicking did nothing.
  // Sprint 1 §11: "User can click a brand → see detail page → edit inline → save."
  // Using a simple editMode toggle to illustrate the inline-edit pattern Sprint 1 must implement.
  const [editMode, setEditMode] = React.useState(false);
  // W8 fix: Delete button needs confirmation dialog — UX anti-pattern to fire irreversible
  // actions without "are you sure?". shadcn AlertDialog is the canonical pattern.
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false);
  return (
  <PageShell
    {...props}
    breadcrumbs={['Workspace', 'Brands', 'Bondi Plumbing']}
    actions={
      <>
        <Btn variant="secondary" icon={editMode ? X : Edit3} size="sm"
             onClick={() => setEditMode(!editMode)}>
          {editMode ? 'Cancel' : 'Edit'}
        </Btn>
        {editMode && (
          <Btn variant="primary" icon={CheckCircle2} size="sm" onClick={() => setEditMode(false)}>
            Save changes
          </Btn>
        )}
        <Btn variant="secondary" icon={Trash2} size="sm" style={{ color: 'var(--accent-red)' }}
             onClick={() => setShowDeleteConfirm(true)}>Delete</Btn>
        {/* R5 fix: Sprint 2 §10 step 7 says "Brand detail page: add Run audit button."
            Previous comment incorrectly marked this as "Sprint 4 CTA" — Sprint 2 adds the button;
            Sprint 4 enriches the results page that it navigates to. */}
        <Btn icon={Sparkles} onClick={() => props.onNav('audit-running')}>Run audit</Btn>
      </>
    }
  >
    <div className="max-w-6xl mx-auto px-8 py-10">
      {/* W8 fix: Delete confirmation dialog — fires soft-delete only after explicit confirm.
          Real build uses shadcn AlertDialog. Prototype illustrates with inline overlay. */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
             style={{ background: 'rgba(0,0,0,0.5)' }}>
          <Card className="p-6 max-w-md w-full mx-4">
            <h2 className="text-base font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Delete Bondi Plumbing?</h2>
            <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
              This brand and all its audit history will be removed from your workspace. This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <Btn variant="secondary" onClick={() => setShowDeleteConfirm(false)}>Cancel</Btn>
              <Btn variant="primary" style={{ background: 'var(--accent-red)' }}
                   onClick={() => { setShowDeleteConfirm(false); props.onNav('brand-list'); }}>
                Delete brand
              </Btn>
            </div>
          </Card>
        </div>
      )}
        Sprint 1 §1 ships Brand CRUD (list, create, detail, soft-delete) — no audit data.
        The Sprint 1 build of this page shows brand metadata only:
        name, domain, vertical, region, competitors, primaryRegions, createdAt.

        The 4 KPI cards (visibility score, avg position, total mentions, sentiment) and
        the audit history table below are SPRINT 4+ content — they require audits to exist.

        Sprint 1 brand detail renders:
        - Brand header (name, domain, vertical badge, region, createdAt)
        - Edit / Delete actions (soft-delete sets deletedAt = NOW())
        - Empty audit history with "No audits yet — run your first audit" CTA (grayed out if Sprint 2 not done)

        Sprint 2 adds Run Audit CTA.
        Sprint 4 fills in the KPI cards + audit history table below.
      */}
      {/* Brand header */}
      <div className="flex items-start gap-5 mb-10">
        <div
          className="w-16 h-16 rounded-lg flex items-center justify-center text-2xl font-bold shrink-0"
          style={{ background: 'linear-gradient(135deg, #f97316, #ea580c)', color: '#fff' }}
        >
          B
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>Bondi Plumbing</h1>
            <Badge tone="success" dot>Active</Badge>
          </div>
          <a className="text-[13px] flex items-center gap-1.5 mt-1.5 hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>
            bondiplumbing.com.au <ExternalLink className="w-3 h-3" />
          </a>
          <div className="flex items-center gap-3 mt-3 text-[12px]">
            <div className="flex items-center gap-1.5" style={{ color: 'var(--text-tertiary)' }}>
              <Tag className="w-3 h-3" /> Tradies
            </div>
            <div className="flex items-center gap-1.5" style={{ color: 'var(--text-tertiary)' }}>
              <MapPin className="w-3 h-3" /> NSW · 3 suburbs
            </div>
            <div className="flex items-center gap-1.5" style={{ color: 'var(--text-tertiary)' }}>
              <Hash className="w-3 h-3" /> {/* Sprint 1: shows 0 audits. Sprint 4+: shows real count */}12 audits
            </div>
          </div>
        </div>
      </div>

      {/* Score summary */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Visibility score', value: '63.4', delta: '+6.2', tone: 'success' },
          { label: 'Avg position', value: '2.3', delta: '↑ 0.8', tone: 'success' },
          { label: 'Total mentions (12 audits)', value: '328', delta: '+47 this week', tone: 'success' },
          { label: 'Sentiment', value: '+0.62', delta: 'Positive', tone: 'success' },
        ].map((m, i) => (
          <Card key={i} className="p-5">
            <div className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>{m.label}</div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold tracking-tight font-mono" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{m.value}</span>
              <Badge tone={m.tone}>{m.delta}</Badge>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2 p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Audit history</h3>
            <Btn variant="ghost" size="sm">View all</Btn>
          </div>
          <div className="flex items-end gap-1 h-32">
            {/* BC6 fix: sparkline peak was 71.4 — corrected to 63.4 per AA5/X8 audit fixes */}
            {[38, 42, 46, 43, 50, 55, 52, 57, 61, 57, 60, 63.4].map((v, i) => (
              <div key={i} className="flex-1 rounded-sm relative group" style={{
                height: `${(v / 80) * 100}%`,
                background: 'linear-gradient(180deg, var(--accent-blue), var(--accent-blue-soft))',
              }}>
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 text-[10px] font-mono opacity-0 group-hover:opacity-100 transition-opacity"
                     style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{v}</div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
            <span>12 weeks ago</span><span>Now</span>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Per-engine breakdown</h3>
          <div className="space-y-3.5">
            {[
              { engine: 'ChatGPT', score: 78, tone: 'var(--success)' },
              { engine: 'Claude', score: 71, tone: 'var(--success)' },
              { engine: 'Gemini', score: 64, tone: 'var(--warning)' },
              { engine: 'Perplexity', score: 72, tone: 'var(--success)' },
            ].map(e => (
              <div key={e.engine}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12.5px] font-medium" style={{ color: 'var(--text-secondary)' }}>{e.engine}</span>
                  <span className="text-[12px] font-mono font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{e.score}</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--accent-muted)' }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${e.score}%`, background: e.tone }} />
                </div>
              </div>
            ))}
            {/* FF3 fix: TikTok citation placeholder (Sprint 8 §8 step 7).
                "Cited-sources view" = this per-engine breakdown card in AuditResultsRich.
                Grayed-out with "Coming v1.1" tooltip — no actual TikTok data in Sprint 8. */}
            <div style={{ opacity: 0.45 }} title="TikTok citation tracking — Coming v1.1">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12.5px] font-medium flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
                  TikTok
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-subtle)', color: 'var(--text-tertiary)' }}>Coming v1.1</span>
                </span>
                <span className="text-[12px] font-mono" style={{ color: 'var(--text-tertiary)' }}>—</span>
              </div>
              <div className="h-1.5 rounded-full" style={{ background: 'var(--accent-muted)' }} />
            </div>
          </div>
        </Card>
      </div>
    </div>
  </PageShell>
  );
};

/* ----- AUDIT RUNNING ----- */
const AuditRunning = (props) => {
  const [progress, setProgress] = useState(34);
  useEffect(() => {
    const t = setInterval(() => setProgress(p => p < 95 ? p + 2 : p), 500);
    return () => clearInterval(t);
  }, []);

  // v1.18 U6 fix: CLAUDE.md §7 "Audit job errors persist to audits.metadata.error and set status='failed'."
  // The AuditRunning screen polls every 5s. When status changes to 'failed', it must render the error state below.
  // Sprint 4 §audit-running spec must handle all 4 statuses: pending → running → complete | failed.
  // This prototype shows the HAPPY PATH (8 steps) + the FAILED state card below.
  // Real Sprint 4 build: `if (audit.status === 'failed') return <AuditFailedCard error={audit.metadata.error} />`
  const steps = [
    { id: 1, label: 'Loading brand context', status: 'complete' },
    { id: 2, label: 'Generating prompts (10 from vertical pack)', status: 'complete' },
    // Y4 fix: Sprint 2 = 1 engine × 10 prompts × 1 run = 10 calls; Sprint 3+ = 4 engines × 5 runs = 200 calls.
    // Step label and cost card below corrected from "87/200 LLM calls" (Sprint 3 data) to Sprint 2 scope.
    { id: 3, label: 'Querying ChatGPT × 10 prompts × 1 run (7/10 LLM calls)', status: 'running' },
    { id: 4, label: 'Detecting brand mentions', status: 'pending' },
    { id: 5, label: 'Detecting competitors', status: 'pending' },
    { id: 6, label: 'Extracting cited sources', status: 'pending' },
    { id: 7, label: 'Calculating composite score', status: 'pending' },
    { id: 8, label: 'Persisting citations + audit row', status: 'pending' },
  ];

  return (
    <PageShell {...props} breadcrumbs={['Workspace', 'Brands', 'Bondi Plumbing', 'Audit running']}>
      <div className="max-w-3xl mx-auto px-8 py-12">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full mb-5"
               style={{ background: 'var(--accent-blue-soft)', color: 'var(--accent-blue)' }}>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span className="text-[12px] font-semibold">Audit in progress</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight mb-2" style={{ color: 'var(--text-primary)' }}>
            Running audit for Bondi Plumbing
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {/* R4 fix: Sprint 2 scope = 1 engine × 10 prompts × 1 run = 10 calls, <$0.10, ~1-2 min.
                Sprint 3+ scope = 4 engines × 10 prompts × 5 runs = 200 calls, ~$2, 4-6 min.
                This screen is designed for Sprint 3 production flow; Sprint 2 would show ChatGPT only. */}
            Querying ChatGPT, Claude, Gemini, Perplexity × 10 prompts × 5 runs = 200 LLM calls. Estimated 4-6 minutes.
          </p>
        </div>

        <Card className="p-7 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>Progress</span>
            <span className="text-[12px] font-mono font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              {progress}%
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden mb-5" style={{ background: 'var(--accent-muted)' }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${progress}%`,
                background: 'linear-gradient(90deg, var(--accent-blue), #6366f1)',
                backgroundSize: '40px 40px',
                animation: 'progress-stripe 1s linear infinite',
              }}
            />
          </div>

          <div className="space-y-2.5">
            {steps.map(s => (
              <div key={s.id} className="flex items-center gap-3 text-[13px]">
                {s.status === 'complete' && (
                  <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'var(--success-soft)', color: 'var(--success)' }}>
                    <Check className="w-3 h-3" />
                  </div>
                )}
                {s.status === 'running' && (
                  <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'var(--accent-blue-soft)', color: 'var(--accent-blue)' }}>
                    <Loader2 className="w-3 h-3 animate-spin" />
                  </div>
                )}
                {s.status === 'pending' && (
                  <div className="w-5 h-5 rounded-full" style={{ border: '1px dashed var(--border-strong)' }} />
                )}
                <span style={{ color: s.status === 'pending' ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>{s.label}</span>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid grid-cols-3 gap-3">
          {[
            // BA7 fix: Sprint 4 implements the real AuditRunning for Sprint 3 paid-tier audits.
            // Previous Y4 fix set Sprint 2 values (10 calls, $0.10) — correct for Sprint 2 dev testing
            // but Sprint 4 is the screen users actually see for Sprint 3 multi-engine audits.
            // 87/200 = 43.5% through a paid-tier audit; US$1.31 cost is consistent with that progress.
            { label: 'Cost so far', value: 'US$1.31', sub: 'of ~US$3.00 budget (200 calls)' },
            { label: 'Mentions found', value: '12', sub: 'across 87 LLM calls' },
            { label: 'Avg position', value: '2.1', sub: 'when mentioned (4 engines)' },
          ].map((m, i) => (
            <Card key={i} className="p-4 anim-pulse-soft">
              <div className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-tertiary)' }}>{m.label}</div>
              <div className="text-xl font-semibold font-mono" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{m.value}</div>
              <div className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>{m.sub}</div>
            </Card>
          ))}
        </div>

        <div className="text-center mt-8">
          <Btn variant="ghost" size="sm" onClick={() => props.onNav('audit-results-basic')}>Skip and view raw output →</Btn>
        </div>

        {/* U6 fix: FAILED STATE — shown when audit.status === 'failed' (CLAUDE.md §7 canonical).
            Sprint 4 build: poll detects status='failed' → renders this instead of the 8-step progress UI.
            audit.metadata.error contains the error message from the Inngest job.
            The prototype illustrates the failed state below as a reference for Sprint 4's implementation. */}
        <Card className="p-6 mt-6" style={{ border: '1px solid var(--accent-red)', background: 'rgba(239,68,68,0.04)' }}>
          <div className="flex items-start gap-4">
            <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: 'var(--accent-red)' }} />
            <div className="flex-1">
              <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Audit failed</div>
              <div className="text-[13px] mb-3" style={{ color: 'var(--text-secondary)' }}>
                This audit could not complete. Error: <code className="text-[12px] px-1 py-0.5 rounded" style={{ background: 'var(--bg-subtle)' }}>rate_limited — OpenAI API returned 429 after 3 retries</code>
              </div>
              <div className="text-[12px] mb-3" style={{ color: 'var(--text-tertiary)' }}>
                No charge was applied — audit cost is only recorded on successful completion.
              </div>
              <div className="flex gap-2">
                <Btn variant="primary" size="sm" onClick={() => props.onNav('audit-running')}>Retry audit</Btn>
                <Btn variant="secondary" size="sm" onClick={() => props.onNav('brand-detail')}>Back to brand</Btn>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </PageShell>
  );
};

/* ----- AUDIT RESULTS BASIC (Sprint 2) ----- */
const AuditResultsBasic = (props) => (
  <PageShell
    {...props}
    breadcrumbs={['Workspace', 'Brands', 'Bondi Plumbing', 'Audit #142']}
    actions={
      <>
        {/* J fix original: "Re-run — Sprint 4 scope" kept it disabled.
            BD3 fix: Sprint 4 IS the sprint that ships Re-run. Enable it.
            Re-run = POST /api/audits { brandId } → redirect to new audit running screen. */}
        <Btn variant="secondary" icon={Download} size="sm" disabled title="Export — Sprint 4 scope">Export</Btn>
        <Btn variant="secondary" icon={RefreshCw} size="sm" onClick={() => props.onNav('audit-running')}>Re-run</Btn>
      </>
    }
  >
    <div className="max-w-5xl mx-auto px-8 py-10">
      <div className="mb-8">
        <Badge tone="success" dot>Complete</Badge>
        <h1 className="text-2xl font-semibold tracking-tight mt-3" style={{ color: 'var(--text-primary)' }}>Audit results · Bondi Plumbing</h1>
        {/* I fix: Sprint 2 budget = <$0.10 (10 calls × ~$0.005-0.01/call GPT-4o-mini).
            US$0.42 would require 42-84 calls — Sprint 3 territory (200 calls).
            Fixed to US$0.07 which matches 10 calls × ~$0.007/call average. */}
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>10 prompts · ChatGPT · Cost US$0.07 · 1m 47s</p>
      </div>

      {/* Sprint 2 minimal — just shows raw citations */}
      <Card>
        <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Raw citations</h3>
            <Badge>Brand mentioned in 6 of 10 prompts</Badge>
          </div>
        </div>
        {/* P9 fix: field names corrected to match Sprint 2 citations DB schema.
            Sprint 2 stores: brandMentioned (boolean), position (int), responseSnippet (text, ≤500 chars).
            Foundations v1.12 also adds contextSnippets (jsonb — surrounding excerpts; Sprint 3 populates).
            Previous: used `mentioned` (wrong — DB field is `brandMentioned`) and
            `contextSnippets: string[]` (not yet populated in Sprint 2 — DB has `responseSnippet`).
            UI now renders from responseSnippet and uses brandMentioned. */}
        {[
          {
            prompt: 'Best plumbers in Bondi for emergency repairs',
            brandMentioned: true, position: 1,
            responseSnippet: 'Bondi Plumbing is highly rated for emergency callouts in the eastern suburbs...'
          },
          {
            prompt: 'Reliable plumber Sydney eastern suburbs',
            brandMentioned: true, position: 3,
            responseSnippet: '...other recommended providers include Bondi Plumbing and Parramatta Pipes...'
          },
          {
            prompt: 'Cheap plumber near Bondi Beach',
            brandMentioned: false, position: null, responseSnippet: null
          },
          {
            prompt: '24/7 plumbing emergency Sydney',
            brandMentioned: true, position: 2,
            responseSnippet: 'For 24/7 emergency plumbing, Bondi Plumbing offers fast response across NSW...'
          },
        ].map((c, i) => (
          <div key={i} className="px-5 py-4 border-b last:border-b-0" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="flex items-start justify-between gap-4 mb-2">
              <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>"{c.prompt}"</div>
              {c.brandMentioned ? (
                <div className="flex items-center gap-2 shrink-0">
                  <Badge tone="success">Position #{c.position}</Badge>
                </div>
              ) : (
                <Badge tone="danger">Not mentioned</Badge>
              )}
            </div>
            {c.responseSnippet && (
              <div className="text-[12px] leading-relaxed pl-3 border-l-2" style={{ color: 'var(--text-secondary)', borderColor: 'var(--accent-blue)' }}>
                {c.responseSnippet}
              </div>
            )}
          </div>
        ))}
      </Card>

      <div className="mt-6 p-5 rounded-md flex items-start gap-3" style={{ background: 'var(--info-soft)', border: '1px solid var(--info)' }}>
        <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--info)' }} />
        <div className="text-[12.5px]" style={{ color: 'var(--text-primary)' }}>
          <strong>This is the basic view.</strong> Sprint 3 unlocks multidimensional scoring, sentiment analysis, confidence intervals, and competitive context. Action Center recommendations arrive in Sprint 6.
          {/* V5 fix: 'View rich version →' navigated to audit-results-rich which is Sprint 3+ only.
              Disabled in Sprint 2 — the rich results screen doesn't exist until Sprint 3 ships. */}
          <span className="ml-1 underline font-medium opacity-40" title="Available Sprint 3">View rich version → (Sprint 3)</span>
        </div>
      </div>
    </div>
  </PageShell>
);

/* ----- AUDIT RESULTS RICH (Sprint 3) ----- */
const AuditResultsRich = (props) => {
  // AA5 fix: Frequency=78 was inconsistent with fixture data (28 mentions / 200 calls = 14%).
  // The value 78 was reused from the ChatGPT per-engine composite, not the frequency formula.
  // frequencyDimensionScore(28, 200) = 14. Dimension scores corrected to be internally
  // consistent: Frequency=14 (28/200), Position=90 (avg position ~3.1 = early mentions),
  // Sentiment=79 (from Z7 fix: 78.6 rounded), Context=73 (12 recommended+10 listed+6 mentioned),
  // Accuracy=71 (20/28 mention rows have cited sources).
  // Composite: 14×0.25 + 90×0.25 + 79×0.20 + 73×0.15 + 71×0.15 = 63.4
  const dimensions = [
    { name: 'Frequency', score: 14, weight: 25, desc: 'How often you appear', confidence: [9, 20] },
    { name: 'Position', score: 90, weight: 25, desc: 'Average rank when mentioned', confidence: [85, 95] },
    { name: 'Sentiment', score: 79, weight: 20, desc: 'Tone of mentions', confidence: [73, 85] },
    { name: 'Context', score: 73, weight: 15, desc: 'Recommended vs listed', confidence: [66, 80] },
    { name: 'Accuracy', score: 71, weight: 15, desc: 'Factual correctness', confidence: [64, 78] },
  ];

  return (
    <PageShell
      {...props}
      breadcrumbs={['Workspace', 'Brands', 'Bondi Plumbing', 'Audit #143']}
      actions={
        <>
          {/* S5 fix (AuditResultsBasic) + BD6 fix (AuditResultsRich):
              Sprint 4 ships working PDF/CSV/JSON exports.
              SARIF/JUnit/GHA remain stubbed with Sprint 8 tooltip.
              The export dropdown itself is ENABLED in Sprint 4.
              Previous: entire dropdown disabled with "Export — Sprint 4 scope" — wrong,
              Sprint 4 IS the sprint that ships the export feature. */}
          <Btn variant="secondary" icon={Download} size="sm">Export ▾</Btn>
        </>
      }
    >
      <div className="max-w-7xl mx-auto px-8 py-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-10">
          <div>
            <Badge tone="success" dot>Complete · 4 engines · 10 prompts</Badge>
            <h1 className="text-3xl font-semibold tracking-tight mt-3" style={{ color: 'var(--text-primary)' }}>
              Bondi Plumbing
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Audit #143 · 6 May 2026 · 4m 12s · US$1.89 cost (≈ A$2.84) · 200 LLM calls</p>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Visibility Score</div>
            <div className="flex items-baseline gap-2 mt-1">
              {/* X8 fix: was 71.4 but formula produced 77.1.
                  AA5 fix: 77.1 used inconsistent dimension inputs (Frequency=78 vs formula=14).
                  Corrected inputs: 14×0.25 + 90×0.25 + 79×0.20 + 73×0.15 + 71×0.15 = 63.4 */}
              <span className="text-5xl font-semibold tracking-tight font-mono" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>63.4</span>
              <Badge tone="success" dot>+6.2 vs last</Badge>
            </div>
            <div className="text-[10px] mt-1 font-mono" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>95% CI: 59.1 — 67.7</div>
          </div>
        </div>

        {/* Dimensional scoring */}
        <Card className="p-6 mb-6">
          <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Multidimensional breakdown</h3>
          <p className="text-[12px] mb-6" style={{ color: 'var(--text-secondary)' }}>
            Each dimension is scored 0-100 with 95% confidence intervals.
          </p>
          <div className="grid grid-cols-5 gap-4">
            {dimensions.map(d => (
              <div key={d.name} className="space-y-3">
                <div>
                  <div className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>{d.name}</div>
                  <div className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{d.desc}</div>
                </div>

                {/* Score with bar */}
                <div>
                  <div className="text-2xl font-semibold tracking-tight font-mono" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{d.score}</div>
                  <div className="h-1 rounded-full mt-2 relative overflow-hidden" style={{ background: 'var(--accent-muted)' }}>
                    <div className="absolute inset-y-0 rounded-full" style={{
                      left: `${d.confidence[0]}%`,
                      width: `${d.confidence[1] - d.confidence[0]}%`,
                      background: 'var(--accent-blue-soft)'
                    }} />
                    <div className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full" style={{
                      left: `calc(${d.score}% - 4px)`,
                      background: 'var(--accent-blue)',
                      boxShadow: '0 0 0 2px var(--bg-elevated)'
                    }} />
                  </div>
                  <div className="flex justify-between text-[9px] mt-1.5 font-mono" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                    <span>{d.confidence[0]}</span>
                    <span>{d.confidence[1]}</span>
                  </div>
                </div>

                <div className="text-[10px] flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                  <span>Weight:</span>
                  <span className="font-mono" style={{ fontFamily: 'var(--font-mono)' }}>{d.weight}%</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid grid-cols-3 gap-4 mb-6">
          {/* Per-engine */}
          <Card className="p-6">
            <h3 className="text-sm font-semibold mb-5" style={{ color: 'var(--text-primary)' }}>Per-engine performance</h3>
            <div className="space-y-4">
              {/* AB5 fix: per-engine scores were 78/71/64/72 — inconsistent with corrected
                  overall composite=63.4 (AA5 fix). Per-engine composites must be near 63.4.
                  ChatGPT mentions more often (9/50=18% freq) → slightly higher composite.
                  Gemini mentions least (5/50=10%) → lower composite. Plausible spread: 60-68. */}
              {[
                { engine: 'ChatGPT', score: 67, mentions: 9, runs: 50, tone: 'success' },
                { engine: 'Claude', score: 65, mentions: 8, runs: 50, tone: 'success' },
                { engine: 'Gemini', score: 58, mentions: 5, runs: 50, tone: 'warning' },
                { engine: 'Perplexity', score: 64, mentions: 6, runs: 50, tone: 'success' },
              ].map(e => (
                <div key={e.engine}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[12.5px] font-semibold" style={{ color: 'var(--text-primary)' }}>{e.engine}</span>
                      <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{e.mentions}/{e.runs} runs</span>
                    </div>
                    <span className="text-[12px] font-mono font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{e.score}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--accent-muted)' }}>
                    <div className="h-full rounded-full" style={{ width: `${e.score}%`, background: e.tone === 'success' ? 'var(--success)' : 'var(--warning)' }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Sentiment */}
          <Card className="p-6">
            <h3 className="text-sm font-semibold mb-5" style={{ color: 'var(--text-primary)' }}>Sentiment</h3>
            <div className="text-center mb-5">
              {/* Z7 fix: "+0.62" used an undocumented −1/0/+1 scale that matches neither
                  SENTIMENT_SCORE_MAP (positive=100, neutral=50, negative=0) nor math on shown counts.
                  (18×100 + 8×50 + 2×0)/28 = 78.6. Display as 0-100 like other dimension scores.
                  With -1/0/+1 scale: (18-2)/28 = 0.57 — also doesn't match 0.62.
                  Fix: show score as 0-100 integer, consistent with other dimension tiles. */}
              <div className="text-3xl font-semibold tracking-tight font-mono" style={{ color: 'var(--success)', fontFamily: 'var(--font-mono)' }}>78.6</div>
              <div className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>Sentiment score (0–100)</div>
            </div>
            <div className="space-y-2">
              {[
                { label: 'Positive', count: 18, pct: 64, tone: 'success' },
                { label: 'Neutral', count: 8, pct: 29, tone: 'neutral' },
                { label: 'Negative', count: 2, pct: 7, tone: 'danger' },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-3 text-[12px]">
                  <span className="w-16" style={{ color: 'var(--text-secondary)' }}>{s.label}</span>
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--accent-muted)' }}>
                    <div className="h-full rounded-full" style={{ width: `${s.pct}%`, background: s.tone === 'success' ? 'var(--success)' : s.tone === 'danger' ? 'var(--danger)' : 'var(--text-tertiary)' }} />
                  </div>
                  <span className="text-[11px] font-mono" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{s.count}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Competitors */}
          <Card className="p-6">
            <h3 className="text-sm font-semibold mb-5" style={{ color: 'var(--text-primary)' }}>Competitor context</h3>
            <div className="space-y-3">
              {[
                { name: 'Parramatta Pipes', mentions: 24, change: '+3' },
                { name: 'Sydney Plumbing Co', mentions: 19, change: '-1' },
                { name: 'Eastside Drains', mentions: 15, change: '+2' },
                { name: 'Bondi Plumbing', mentions: 28, change: '+5', isYou: true },
              ].sort((a, b) => b.mentions - a.mentions).map((c, i) => (
                <div key={c.name}
                  className="flex items-center justify-between p-2.5 rounded-md"
                  style={{ background: c.isYou ? 'var(--accent-blue-soft)' : 'transparent' }}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-[10px] font-mono w-4 text-center" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>#{i + 1}</span>
                    <span className="text-[12.5px] font-medium" style={{ color: c.isYou ? 'var(--accent-blue)' : 'var(--text-primary)' }}>
                      {c.name} {c.isYou && <span className="text-[10px] ml-1">(you)</span>}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-mono font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{c.mentions}</span>
                    <span className="text-[10px] font-mono" style={{ color: c.change.startsWith('+') ? 'var(--success)' : 'var(--danger)', fontFamily: 'var(--font-mono)' }}>{c.change}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Action Center — Sprint 6 functionality, shown here as preview/teaser of upcoming feature */}
        <Card className="p-6" style={{ borderColor: 'var(--accent-blue)' }}>
          <div className="flex items-start justify-between mb-5">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Sparkles className="w-4 h-4" style={{ color: 'var(--accent-blue)' }} />
                <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Action Center</h3>
                <Badge tone="blue">Coming in Sprint 6</Badge>
              </div>
              <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                Preview: research-backed actions derived from this audit. Full Action Center ships with v1 launch.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {[
              {
                priority: 'High',
                title: 'Add llms.txt to your domain',
                impact: '+8-12 visibility points',
                source: 'AI crawler access pattern · VisibleAU research base',
                tone: 'danger',
              },
              {
                priority: 'Med',
                title: 'Strengthen LocalBusiness schema with NAP consistency',
                impact: '+4-6 visibility points',
                source: 'Schema.org spec + AU directory consistency check',
                tone: 'warning',
              },
              {
                priority: 'Low',
                title: 'Add FAQ page targeting "emergency plumber Bondi"',
                impact: '+2-3 visibility points',
                source: 'AU vertical pack pattern (Tradies)',
                tone: 'info',
              },
            ].map((a, i) => (
              <div key={i}
                   className="p-3.5 rounded-md flex items-start gap-3.5 opacity-75"
                   style={{ border: '1px dashed var(--border-default)', background: 'var(--bg-base)' }}>
                <Badge tone={a.tone}>{a.priority}</Badge>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>{a.title}</div>
                  <div className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                    <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" />{a.impact}</span>
                    <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{a.source}</span>
                  </div>
                </div>
                <Badge tone="neutral">Sprint 6</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </PageShell>
  );
};

/* ============================================================================
 *  SPRINT 4 — Dashboard UI (4 screens)
 *  Portfolio overview, brand setup wizard, audit list, audit comparison
 * ========================================================================= */

const PortfolioOverview = (props) => (
  <PageShell {...props}
    breadcrumbs={['Workspace', 'Portfolio']}
    actions={<Btn variant="primary" icon={Plus} onClick={() => props.onNav('brand-create')}>Add brand</Btn>}>
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Portfolio overview</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>3 brands · 12 audits this month · A$33.60 spent</p>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Avg visibility', value: '64.2', delta: '+3.1', tone: 'success' },
          { label: 'Active brands', value: '3', delta: 'of 5', tone: 'neutral' },
          { label: 'Audits this month', value: '12', delta: '+4 vs last', tone: 'info' },
          { label: 'Monthly LLM spend', value: 'A$33.60', delta: '12 audits · ~A$2.80 ea', tone: 'neutral' },
        ].map((m) => (
          <Card key={m.label} className="p-5">
            <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>{m.label}</div>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>{m.value}</div>
              <Badge tone={m.tone}>{m.delta}</Badge>
            </div>
          </Card>
        ))}
      </div>

      <Card className="mb-6">
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-subtle)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Brands at a glance</h3>
          <div className="flex items-center gap-2">
            <Select value="all" options={[{ value: 'all', label: 'All verticals' }]} />
            <Select value="recent" options={[{ value: 'recent', label: 'Recent activity' }]} />
          </div>
        </div>
        <table className="w-full text-sm">
          <thead style={{ background: 'var(--bg-subtle)' }}>
            <tr>
              {['Brand', 'Vertical', 'Region', 'Visibility', 'Trend (12w)', 'Last audit', ''].map(h => (
                <th key={h} className="text-left px-5 py-2.5 text-[11px] uppercase tracking-wider font-semibold"
                    style={{ color: 'var(--text-tertiary)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { name: 'Bondi Plumbing', v: 'Tradies', r: 'NSW · Bondi', score: 73, delta: '+5', last: '2h ago' },
              { name: 'Cutting Edge Joinery', v: 'Tradies', r: 'VIC · Geelong', score: 58, delta: '-2', last: '1d ago' },
              { name: 'Notion Clone (test)', v: 'SaaS', r: 'AU', score: 61, delta: '+1', last: '3d ago' },
            ].map((b, i) => (
              <tr key={i} className="border-t cursor-pointer hover:bg-opacity-50"
                  style={{ borderColor: 'var(--border-subtle)' }}
                  onClick={() => props.onNav('brand-detail')}>
                <td className="px-5 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{b.name}</td>
                <td className="px-5 py-3" style={{ color: 'var(--text-secondary)' }}>{b.v}</td>
                <td className="px-5 py-3" style={{ color: 'var(--text-secondary)' }}>{b.r}</td>
                <td className="px-5 py-3">
                  <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{b.score}</span>
                  <span className="text-[11px] ml-1.5" style={{ color: b.delta.startsWith('+') ? 'var(--accent-green)' : 'var(--accent-red)' }}>{b.delta}</span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-end gap-0.5 h-7">
                    {Array.from({ length: 12 }).map((_, j) => (
                      <div key={j} className="w-1 rounded-sm"
                           style={{ height: `${30 + Math.sin(i * 7 + j) * 18 + j * 1.5}%`,
                                    background: j === 11 ? 'var(--accent-blue)' : 'var(--border-strong)' }} />
                    ))}
                  </div>
                </td>
                <td className="px-5 py-3 text-[12px]" style={{ color: 'var(--text-tertiary)' }}>{b.last}</td>
                <td className="px-5 py-3"><ChevronRight className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Recent activity</h3>
          <div className="space-y-3">
            {[
              { type: 'audit_complete', brand: 'Bondi Plumbing', detail: 'Score 73 (+5)', time: '2h ago' },
              { type: 'alert', brand: 'Cutting Edge Joinery', detail: 'Visibility dropped 4 points', time: '6h ago' },
              { type: 'action', brand: 'Bondi Plumbing', detail: '2 new actions in Action Center', time: '1d ago' },
            ].map((a, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <div className="w-1.5 h-1.5 mt-1.5 rounded-full"
                     style={{ background: a.type === 'alert' ? 'var(--accent-red)' : 'var(--accent-blue)' }} />
                <div className="flex-1">
                  <div style={{ color: 'var(--text-primary)' }}>{a.brand} <span style={{ color: 'var(--text-tertiary)' }}>· {a.detail}</span></div>
                  <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{a.time}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Cost this month</h3>
          <div className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>A$33.60 <span className="text-xs font-normal" style={{ color: 'var(--text-tertiary)' }}>12 audits</span></div>
          <div className="h-1.5 rounded-full overflow-hidden mb-3" style={{ background: 'var(--bg-subtle)' }}>
            <div className="h-full rounded-full" style={{ width: '34%', background: 'var(--accent-green)' }} />
          </div>
          <div className="space-y-1.5 text-[12px]" style={{ color: 'var(--text-secondary)' }}>
            <div className="flex justify-between"><span>OpenAI</span><span>A$9.24</span></div>
            <div className="flex justify-between"><span>Anthropic</span><span>A$8.72</span></div>
            <div className="flex justify-between"><span>Google AI</span><span>A$7.76</span></div>
            <div className="flex justify-between"><span>Perplexity</span><span>A$7.88</span></div>
          </div>
        </Card>
      </div>
    </div>
  </PageShell>
);

const BrandSetupWizard = (props) => {
  const [step, setStep] = useState(1);
  return (
    <PageShell {...props} breadcrumbs={['Workspace', 'Add brand']}>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Add a brand</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Step {step} of 4 · ~3 minutes total</p>
        </div>

        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3, 4].map(n => (
            <div key={n} className="flex-1 h-1 rounded-full"
                 style={{ background: n <= step ? 'var(--accent-blue)' : 'var(--bg-subtle)' }} />
          ))}
        </div>

        <Card className="p-6 mb-4">
          {step === 1 && (
            <>
              <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Brand basics</h2>
              <div className="space-y-4">
                <Input label="Brand name" placeholder="Bondi Plumbing" />
                <Input label="Domain" placeholder="bondiplumbing.com.au" prefix="https://"
                  helperText="We'll auto-detect your logo from the favicon once you save." />
                <div className="flex items-center gap-3 p-3 rounded-md" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}>
                  <div className="w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0"
                       style={{ background: 'var(--accent-blue)', color: 'white' }}>BP</div>
                  <div className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                    Logo auto-detected from favicon.ico · <span style={{ color: 'var(--accent-blue)', cursor: 'pointer' }}>Upload instead</span>
                  </div>
                </div>
                <Select label="Region" value="au" options={[
                  { value: 'au', label: 'Australia' },
                  { value: 'nz', label: 'New Zealand' },
                  { value: 'uk', label: 'United Kingdom' },
                ]} helperText="Region determines vertical packs and prompt library." />
              </div>
            </>
          )}
          {step === 2 && (
            <>
              <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Vertical pack</h2>
              <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>Pick the closest match. We'll use AU-tuned prompts and vertical-specific recommendations.</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'tradies', name: 'Tradies', desc: 'Plumber, electrician, builder, landscaper', prompts: 124, release: 'v1', selected: true },
                  { id: 'saas', name: 'SaaS', desc: 'B2B software, dev tools', prompts: 108, release: 'v1' },
                  { id: 'allied_health', name: 'Allied Health', desc: 'Physio, psych, dietitian. AHPRA-aware framing.', prompts: 104, release: 'v1' },
                  { id: 'professional_services', name: 'Professional Services', desc: 'Accountants, consultants, advisors', prompts: null, release: 'v1.1', locked: true },
                  { id: 'real_estate', name: 'Real Estate', desc: 'Sales, property management, buyer agents', prompts: null, release: 'v1.1', locked: true },
                ].map(v => (
                  <div key={v.id} className="p-3 rounded-md"
                       style={{
                         border: `1.5px solid ${v.selected ? 'var(--accent-blue)' : 'var(--border-default)'}`,
                         background: v.locked ? 'var(--bg-subtle)' : v.selected ? 'var(--bg-elevated)' : 'transparent',
                         cursor: v.locked ? 'not-allowed' : 'pointer',
                         opacity: v.locked ? 0.6 : 1,
                       }}>
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{v.name}</div>
                      <Badge tone={v.locked ? 'neutral' : 'success'}>{v.locked ? v.release : `${v.prompts} prompts`}</Badge>
                    </div>
                    <div className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>{v.desc}{v.locked ? ' — coming soon' : ''}</div>
                  </div>
                ))}
              </div>
            </>
          )}
          {step === 3 && (
            <>
              <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Locations & competitors</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-[12px] font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>Primary suburbs (up to 3)</label>
                  <div className="flex gap-2 flex-wrap">
                    {['Bondi', 'Bondi Junction', 'Tamarama'].map(s => (
                      <Badge key={s} tone="info">{s} <X className="w-3 h-3 ml-1.5 inline-block cursor-pointer" /></Badge>
                    ))}
                  </div>
                </div>
                <Input label="Add competitor (optional)" placeholder="Eastern Plumbing Co" helperText="We'll detect when LLMs mention them alongside you." />
              </div>
            </>
          )}
          {step === 4 && (
            <>
              <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Confirm & first audit</h2>
              <div className="space-y-2 mb-4 p-4 rounded-md" style={{ background: 'var(--bg-subtle)' }}>
                <div className="flex justify-between text-sm"><span style={{ color: 'var(--text-secondary)' }}>Brand</span><span style={{ color: 'var(--text-primary)' }}>Bondi Plumbing</span></div>
                <div className="flex justify-between text-sm"><span style={{ color: 'var(--text-secondary)' }}>Vertical</span><span style={{ color: 'var(--text-primary)' }}>Tradies (AU)</span></div>
                {/* CG4 fix: confirm screen had no Pack row — user can't verify which pack will run.
                    Step 2 collected this info; step 4 must confirm it so users trust the run. */}
                <div className="flex justify-between text-sm"><span style={{ color: 'var(--text-secondary)' }}>Pack</span><span style={{ color: 'var(--text-primary)' }}>AU Tradies v1.0 · 124 prompts</span></div>
                <div className="flex justify-between text-sm"><span style={{ color: 'var(--text-secondary)' }}>Locations</span><span style={{ color: 'var(--text-primary)' }}>Bondi, Bondi Junction, Tamarama</span></div>
                {/* W3 fix: "~A$2.50-3" is the paid tier (200 calls) cost. Sprint 2 = <A$0.15 (10 calls).
                    Free tier (Sprint 3+) = ~A$0.30-0.50 (40 calls). Paid = ~A$2.50-3 (200 calls). */}
                <div className="flex justify-between text-sm"><span style={{ color: 'var(--text-secondary)' }}>First audit cost</span><span style={{ color: 'var(--text-primary)' }}>Free tier: ~A$0.30–0.50 · Paid: ~A$2.50–3</span></div>
              </div>
              {/* W4 fix: "Free = 2 engines × 100 calls" wrong. PRD §7: Free = 2 engines × 20 prompts × 1 run = 40 calls. */}
              <div className="text-[12px] p-3 rounded-md flex items-start gap-2" style={{ background: 'rgba(59, 130, 246, 0.1)', color: 'var(--text-secondary)' }}>
                <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: 'var(--accent-blue)' }} />
                Your first audit will run on your tier's engines. Paid: 4 engines × 10 prompts × 5 runs = 200 calls (~3-5 min). Free: 2 engines × 20 prompts × 1 run = 40 calls (~1.5-2 min).
              </div>
            </>
          )}
        </Card>

        <div className="flex justify-between">
          <Btn variant="secondary" onClick={() => setStep(Math.max(1, step - 1))} disabled={step === 1}>Back</Btn>
          {step < 4
            ? <Btn variant="primary" onClick={() => setStep(step + 1)}>Continue</Btn>
            : <Btn variant="primary" onClick={() => props.onNav('audit-running')}>Create brand & run first audit</Btn>}
        </div>
      </div>
    </PageShell>
  );
};

const AuditList = (props) => (
  <PageShell {...props} breadcrumbs={['Workspace', 'All audits']}>
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>All audits</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>43 audits across 3 brands · last 90 days</p>
        </div>
        <div className="flex items-center gap-2">
          <Btn variant="secondary" icon={Filter}>Filters</Btn>
          {/* T5 fix: Export CSV is Sprint 4 scope — disabled here as design reference */}
          <Btn variant="secondary" icon={Download} disabled title="Export CSV — Sprint 4 scope">Export CSV</Btn>
        </div>
      </div>

      <Card>
        <div className="px-5 py-4 border-b grid grid-cols-4 gap-4" style={{ borderColor: 'var(--border-subtle)' }}>
          <Select value="all-brands" options={[{ value: 'all-brands', label: 'All brands' }]} />
          <Select value="all-status" options={[{ value: 'all-status', label: 'All statuses' }]} />
          <Select value="last-90" options={[{ value: 'last-90', label: 'Last 90 days' }]} />
          <Input placeholder="Search prompt or brand..." />
        </div>
        {/* T4 note: fixture data below reflects Sprint 3+ scale (4 engines, A$2-3 cost).
            Sprint 2 audits = 1 engine (ChatGPT), 10 prompts, 1 run, cost <A$0.15.
            The table structure is correct; only the fixture values need updating once Sprint 2 ships real data. */}
        <table className="w-full text-sm">
          <thead style={{ background: 'var(--bg-subtle)' }}>
            <tr>
              {['Brand', 'Audit #', 'Started', 'Score', 'Engines', 'Cost', 'Status', ''].map(h => (
                <th key={h} className="text-left px-5 py-2.5 text-[11px] uppercase tracking-wider font-semibold"
                    style={{ color: 'var(--text-tertiary)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { brand: 'Bondi Plumbing', n: 3, started: '6 May, 14:21', score: 70, engines: 1, cost: 'A$0.11', status: 'Complete' },
              { brand: 'Bondi Plumbing', n: 2, started: '5 May, 14:21', score: 60, engines: 1, cost: 'A$0.09', status: 'Complete' },
              { brand: 'Cutting Edge Joinery', n: 2, started: '5 May, 09:05', score: 50, engines: 1, cost: 'A$0.08', status: 'Complete' },
              { brand: 'Notion Clone (test)', n: 1, started: '4 May, 22:14', score: 60, engines: 1, cost: 'A$0.10', status: 'Complete' },
              { brand: 'Bondi Plumbing', n: 1, started: '4 May, 14:21', score: 70, engines: 1, cost: 'A$0.09', status: 'Complete' },
              { brand: 'Cutting Edge Joinery', n: 1, started: '4 May, 09:05', score: '—', engines: 1, cost: 'A$0.00', status: 'Failed' },
            ].map((a, i) => (
              <tr key={i} className="border-t cursor-pointer hover:bg-opacity-50"
                  style={{ borderColor: 'var(--border-subtle)' }}
                  onClick={() => props.onNav('audit-results-basic')}>
                {/* U4 fix: Sprint 2 audits → AuditResultsBasic, not AuditResultsRich (Sprint 3+) */}
                <td className="px-5 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{a.brand}</td>
                <td className="px-5 py-3" style={{ color: 'var(--text-secondary)' }}>#{a.n}</td>
                <td className="px-5 py-3 text-[12px]" style={{ color: 'var(--text-tertiary)' }}>{a.started}</td>
                <td className="px-5 py-3 font-semibold" style={{ color: 'var(--text-primary)' }}>{a.score}</td>
                <td className="px-5 py-3" style={{ color: 'var(--text-secondary)' }}>{a.engines}/4</td>
                <td className="px-5 py-3" style={{ color: 'var(--text-secondary)' }}>{a.cost}</td>
                <td className="px-5 py-3"><Badge tone={a.status === 'Complete' ? 'success' : 'danger'} dot>{a.status}</Badge></td>
                <td className="px-5 py-3"><ChevronRight className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-5 py-3 border-t flex items-center justify-between text-[12px]"
             style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-tertiary)' }}>
          <div>Showing 6 of 43</div>
          <div className="flex gap-1">
            <Btn variant="secondary" size="sm">Previous</Btn>
            <Btn variant="secondary" size="sm">Next</Btn>
          </div>
        </div>
      </Card>
    </div>
  </PageShell>
);

const AuditCompare = (props) => (
  <PageShell {...props} breadcrumbs={['Workspace', 'Brands', 'Bondi Plumbing', 'Compare audits']}>
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Compare audits</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Audit #143 (today) vs #142 (yesterday)</p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card className="p-5">
          <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Audit #143 (Today)</div>
          {/* BB5 fix: was 73.5 — corrected to 63.4 per AA5/X8 audit fixes on AuditResultsRich */}
          <div className="text-3xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>63.4</div>
          <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>14:21 · 2m 14s · US$1.92</div>
        </Card>
        <Card className="p-5">
          <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Audit #142 (Yesterday)</div>
          {/* BB5 fix: was 68.4 — corrected to 57.2 (63.4 − 6.2 per history row delta) */}
          <div className="text-3xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>57.2</div>
          <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>14:21 · 2m 31s · US$1.86</div>
        </Card>
      </div>

      <Card className="p-6 mb-6">
        <h3 className="text-sm font-semibold mb-5" style={{ color: 'var(--text-primary)' }}>Dimension-by-dimension comparison</h3>
        <div className="space-y-4">
          {/* BB6 fix: dimension scores updated to match corrected AuditResultsRich #143 values.
              #143: Frequency=14, Position=90, Sentiment=79, Context=73, Accuracy=71 (→ composite 63.4)
              #142: proportionally lower at composite 57.2.
              Previous values (Frequency=76, Position=70 etc.) were from uncorrected prototype. */}
          {[
            { name: 'Frequency', a: 14,  b: 9,  delta: '+5' },
            { name: 'Position',  a: 90,  b: 82, delta: '+8' },
            { name: 'Sentiment', a: 79,  b: 71, delta: '+8' },
            { name: 'Context',   a: 73,  b: 65, delta: '+8' },
            { name: 'Accuracy',  a: 71,  b: 68, delta: '+3' },
          ].map(d => (
            <div key={d.name} className="flex items-center gap-4">
              <div className="w-24 text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>{d.name}</div>
              <div className="flex-1 grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-subtle)' }}>
                    <div className="h-full rounded-full" style={{ width: `${d.a}%`, background: 'var(--accent-blue)' }} />
                  </div>
                  <span className="text-[12px] font-semibold w-8 text-right" style={{ color: 'var(--text-primary)' }}>{d.a}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-subtle)' }}>
                    <div className="h-full rounded-full" style={{ width: `${d.b}%`, background: 'var(--text-tertiary)' }} />
                  </div>
                  <span className="text-[12px] font-semibold w-8 text-right" style={{ color: 'var(--text-secondary)' }}>{d.b}</span>
                </div>
              </div>
              <Badge tone={d.delta.startsWith('+') ? 'success' : 'warning'}>{d.delta}</Badge>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>What changed between audits</h3>
        <div className="space-y-2.5 text-sm">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--accent-green)' }} />
            <div style={{ color: 'var(--text-secondary)' }}>ChatGPT mention rate up 14% (now mentions in "best plumber Bondi" prompt)</div>
          </div>
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--accent-green)' }} />
            <div style={{ color: 'var(--text-secondary)' }}>Sentiment shifted positive on Claude (likely new Reddit thread mentions)</div>
          </div>
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--accent-amber)' }} />
            <div style={{ color: 'var(--text-secondary)' }}>Gemini stopped mentioning you (was 30% mention rate, now 12%)</div>
          </div>
        </div>
      </Card>
    </div>
  </PageShell>
);

/* ============================================================================
 *  SPRINT 5 — Vertical packs (3 screens)
 *  Pack browser, Tradies pack detail, prompt library editor
 * ========================================================================= */

const VerticalPackBrowser = (props) => (
  <PageShell {...props} breadcrumbs={['Workspace', 'Vertical packs']}>
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Vertical packs</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>AU-tuned prompt libraries and vertical-specific patterns. 3 active (v1: Tradies, SaaS, Allied Health) · 2 in beta (v1.1: Professional Services, Real Estate) · 3 coming soon (Hospitality, Retail/E-commerce, Beauty).</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { id: 'tradies', name: 'Tradies', desc: 'Plumber, electrician, builder, landscaper. AU-specific local services.', prompts: 124, brands: 2, status: 'active' },
          { id: 'saas', name: 'SaaS', desc: 'B2B software, dev tools, infra. Tech buyer intent prompts.', prompts: 108, brands: 1, status: 'active' },
          { id: 'allied_health', name: 'Allied Health', desc: 'Physio, psych, dietitian. AHPRA-aware framing.', prompts: 104, brands: 0, status: 'active' },
          { id: 'professional_services', name: 'Professional Services', desc: 'Accountants, lawyers, consultants, advisors. Authority-signal patterns.', prompts: 82, brands: 0, status: 'coming-v1.1' },
          { id: 'real_estate', name: 'Real Estate', desc: 'Sales agents, property managers, buyer agents. Suburb-specific.', prompts: 76, brands: 0, status: 'coming-v1.1' },
          { id: 'hospitality', name: 'Hospitality', desc: 'Cafe, restaurant, accommodation. Reviews-heavy domain.', prompts: 0, brands: 0, status: 'coming-soon' },
          { id: 'retail_ecommerce', name: 'Retail / E-commerce', desc: 'Online stores, ChatGPT Shopping surfaces.', prompts: 0, brands: 0, status: 'coming-soon' },
          { id: 'beauty', name: 'Beauty / Personal Care', desc: 'Salon, clinic, spa. Booking-intent local search.', prompts: 0, brands: 0, status: 'coming-soon' },
        ].map(p => (
          <Card key={p.id} hover className="p-5 cursor-pointer" onClick={() => p.status !== 'coming-soon' && props.onNav('vertical-pack-detail')}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{p.name}</h3>
              {/* CB5 fix: v1.1 packs were 'beta' status — wizard uses "Coming v1.1", standardised here */}
              <Badge tone={p.status === 'active' ? 'success' : p.status === 'coming-v1.1' ? 'info' : 'neutral'}>
                {p.status === 'active' ? 'Active' : p.status === 'coming-v1.1' ? 'Coming v1.1' : 'Coming soon'}
              </Badge>
            </div>
            <p className="text-[13px] mb-4" style={{ color: 'var(--text-secondary)' }}>{p.desc}</p>
            <div className="flex items-center gap-4 text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
              <span>{p.prompts} prompts</span>
              <span>·</span>
              <span>{p.brands} active brand{p.brands !== 1 ? 's' : ''}</span>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-8 p-4 rounded-md flex items-start gap-3"
           style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}>
        <Lightbulb className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--accent-amber)' }} />
        <div className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
          Vertical packs are continuously updated based on AU search behaviour. New prompts added monthly. Suggest a new vertical via the support widget.
        </div>
      </div>
    </div>
  </PageShell>
);

const VerticalPackDetail = (props) => (
  <PageShell {...props} breadcrumbs={['Workspace', 'Vertical packs', 'Tradies']}>
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Tradies (AU)</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>124 prompts · 2 active brands · last updated 2 weeks ago</p>
        </div>
        {/* CC2 fix: Sprint 5 F6 fix — pack editor is v1.1 only; this button must be disabled in v1.
            Previously: active button navigating to 'prompt-library-editor'.
            Sprint 5 §1 canonical: "read-only view; New prompt button absent or disabled with v1.1 badge." */}
        <Btn variant="secondary" icon={Edit3} disabled title="Prompt authoring — Coming v1.1">Customise prompts <Badge tone="neutral" className="ml-1">v1.1</Badge></Btn>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Prompts', value: '124', desc: 'Across 8 categories' },
          { label: 'Sub-verticals', value: '8', desc: 'Plumber, electrician, builder...' },
          // CC3 fix: "Action templates" is Sprint 6 scope; replaced with Categories (from category field in Sprint 5 schema)
          { label: 'Categories', value: '8', desc: 'Service discovery, reviews, pricing...' },
        ].map(s => (
          <Card key={s.label} className="p-5">
            <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>{s.label}</div>
            <div className="text-2xl font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>{s.value}</div>
            <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{s.desc}</div>
          </Card>
        ))}
      </div>

      <Card className="mb-6">
        <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Prompt categories</h3>
        </div>
        <div className="p-3">
          {[
            // CD5 fix: samples now use {brand}/{location} placeholders (template strings, not expanded prompts)
            { name: 'Best [trade] in [suburb]', count: 28, sample: '"best plumber in {location} for emergency callouts"' },
            { name: 'Recommendation requests', count: 18, sample: '"who would you recommend for bathroom plumbing in {location}"' },
            { name: 'Comparison prompts', count: 22, sample: '"{brand} vs {competitors} — pros and cons"' },
            { name: 'Service-specific', count: 24, sample: '"plumber for hot water installation {location}"' },
            { name: 'Emergency / after hours', count: 12, sample: '"24/7 emergency plumber {location} area"' },
            { name: 'Pricing & quotes', count: 10, sample: '"how much does a plumber charge in {location}"' },
            { name: 'Reputation / reviews', count: 6, sample: '"plumbers with best reviews {location}"' },
            { name: 'Compliance / licensing', count: 4, sample: '"licensed plumber NSW {location}"' },
          ].map((c, i) => (
            <div key={i} className="px-3 py-3 rounded-md flex items-start justify-between hover:bg-opacity-50"
                 style={{ background: 'transparent' }}>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{c.name}</div>
                <div className="text-[12px] italic truncate" style={{ color: 'var(--text-tertiary)' }}>{c.sample}</div>
              </div>
              <Badge tone="neutral">{c.count}</Badge>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Vertical-specific patterns</h3>
        <div className="space-y-3 text-sm">
          {[
            'AU directories prioritised: hipages, Yellow Pages AU, ServiceSeeking, Word of Mouth (4 canonical per Sprint 8)',
            'NSW/VIC license verification weighted higher in Accuracy dimension',
            'Suburb-specific prompts auto-generated from primary_regions',
            'After-hours/emergency framing checked separately (high-intent)',
            'NAP (Name/Address/Phone) consistency check vs ASIC business register',
          ].map((p, i) => (
            <div key={i} className="flex items-start gap-2" style={{ color: 'var(--text-secondary)' }}>
              <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--accent-green)' }} />
              <span>{p}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  </PageShell>
);

const PromptLibraryEditor = (props) => (
  <PageShell {...props} breadcrumbs={['Workspace', 'Vertical packs', 'Tradies', 'View prompts']}>
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>Tradies prompt library</h1>
          <Badge tone="neutral">Read-only in v1</Badge>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>124 curated AU-tuned prompts. Vertical packs are operator-authored in v1. Custom prompt authoring ships in v1.1.</p>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-3">
          <Card className="p-3">
            {['All prompts', 'Best [trade] in [suburb]', 'Recommendations', 'Comparisons', 'Service-specific', 'Emergency', 'Pricing', 'Reviews'].map((c, i) => (
              <div key={i} className="px-3 py-2 rounded-md text-sm cursor-pointer"
                   style={{
                     background: i === 0 ? 'var(--bg-elevated)' : 'transparent',
                     color: i === 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
                     fontWeight: i === 0 ? 600 : 400,
                   }}>{c}</div>
            ))}
          </Card>
        </div>
        <div className="col-span-9">
          <Card>
            <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-subtle)' }}>
              <Input placeholder="Search prompts..." className="w-72" />
              <Btn variant="secondary" size="sm" icon={Plus} disabled title="Custom prompt authoring ships in v1.1">
                New prompt <Badge tone="info" className="ml-1">v1.1</Badge>
              </Btn>
            </div>
            <div className="p-3 space-y-2">
              {[
                { text: 'best plumber in {suburb} for emergency callouts', type: 'default', enabled: true },
                { text: 'who would you recommend for bathroom plumbing in {region}', type: 'default', enabled: true },
                { text: '{brand} vs {competitor} — pros and cons', type: 'default', enabled: true },
                { text: 'plumber for hot water installation {suburb}', type: 'default', enabled: true },
                { text: '24/7 emergency plumber {suburb} area', type: 'default', enabled: true },
              ].map((p, i) => (
                <div key={i} className="px-3 py-2.5 rounded-md flex items-center gap-3"
                     style={{ border: '1px solid var(--border-subtle)' }}>
                  <div className="flex-1 text-sm font-mono" style={{ color: 'var(--text-primary)' }}>{p.text}</div>
                  <Badge tone="neutral">{p.type}</Badge>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t text-[11px]" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-tertiary)' }}>
              Showing 5 of 124 prompts · All prompts are active · Custom prompt authoring available in v1.1
            </div>
          </Card>
        </div>
      </div>
    </div>
  </PageShell>
);

/* ============================================================================
 *  SPRINT 6 — Action Center (3 screens)
 *  Action home, action detail, anti-pattern settings
 * ========================================================================= */

const ActionCenter = (props) => (
  <PageShell {...props} breadcrumbs={['Workspace', 'Brands', 'Bondi Plumbing', 'Action Center']}>
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Action Center</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Top 5 prioritised actions backed by GEO research. Updated after audit #143.</p>
        </div>
        <Btn variant="secondary" icon={Settings}>Filter settings</Btn>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="p-5">
          <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Open actions</div>
          <div className="text-2xl font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>5</div>
          <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>2 high · 2 medium · 1 low</div>
        </Card>
        <Card className="p-5">
          <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Est. impact if all done</div>
          <div className="text-2xl font-semibold mb-0.5" style={{ color: 'var(--accent-green)' }}>+12-18 pts</div>
          <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>To composite visibility</div>
        </Card>
        <Card className="p-5">
          <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Done this month</div>
          <div className="text-2xl font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>3</div>
          <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>+5 visibility (verified)</div>
        </Card>
      </div>

      <div className="space-y-3">
        {/* DK3 fix: added 'dimension' field to match action_items schema (dimension-group.tsx groups by this) */}
        {[
          {
            priority: 'High',
            dimension: 'frequency',
            title: 'Add Wikipedia entry for Bondi Plumbing (founder citation)',
            impact: '+3-5 visibility points across all 4 engines',
            confidence: 'Confirmed',
            sources: ['Princeton GEO study (2024)', 'SE Ranking citation analysis'],
            tone: 'danger',
          },
          {
            priority: 'High',
            dimension: 'frequency',
            title: 'Submit to hipages with verified profile photos',
            impact: '+2-4 points on Frequency, especially Gemini & Perplexity',
            confidence: 'Confirmed',
            sources: ['hipages domain authority data', 'AU Tradies vertical pack patterns'],
            tone: 'danger',
          },
          {
            priority: 'Medium',
            dimension: 'position',
            title: 'Get 5 recent Reddit mentions in r/sydney or r/AusFinance',
            impact: '+1-3 points on Position (Claude weights Reddit highly)',
            confidence: 'Likely',
            sources: ['Tinuiti effect-size analysis (Q4 2024)', 'Claude training mix'],
            tone: 'warning',
          },
          {
            priority: 'Medium',
            dimension: 'context',
            title: 'Add FAQ schema with "What suburbs do you service?" question',
            impact: '+1-2 points on Context dimension',
            confidence: 'Likely',
            sources: ['Schema.org FAQPage spec', 'AU local business benchmarks'],
            tone: 'warning',
          },
          {
            priority: 'Low',
            title: 'Add answer-capsule to homepage targeting "emergency plumber Bondi"',
            impact: '+1 point on Sentiment when mentioned',
            confidence: 'Hypothesis',  // emerging pattern, limited measurement evidence
            sources: ['Answer capsule pattern (Module 5b)'],
            engines: ['Perplexity'],
            tone: 'info',
          },
        ].map((a, i) => (
          <Card key={i} hover className="p-5 cursor-pointer" onClick={() => props.onNav('action-detail')}>
            <div className="flex items-start gap-4">
              <Badge tone={a.tone}>{a.priority}</Badge>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{a.title}</div>
                <div className="text-[13px] mb-2" style={{ color: 'var(--text-secondary)' }}>{a.impact}</div>
                {/* DI3 fix: Sprint 6 action_items schema has no engines column.
                    Per-engine impact ranking is Sprint 8 scope. Removed engines badge. */}
                <div className="flex items-center gap-4 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  <span className="flex items-center gap-1.5"><FileText className="w-3 h-3" />{a.sources.length} citation{a.sources.length !== 1 ? 's' : ''}</span>
                  <span className="flex items-center gap-1.5"><Target className="w-3 h-3" />{a.confidence}</span>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
            </div>
          </Card>
        ))}

        {/* DN4 fix: Original prototype showed 5 visible cards + 6 separate blurred-only cards.
            Spec (DD4/DG2): Free tier sees ALL card TITLES but action text is blurred within each card.
            This is per-card TierGate wrapping, not two separate card sets.
            Corrected: The blurred block below represents the TierGate overlay pattern.
            In the real implementation, each recommendation-card.tsx wraps its body (below the title)
            in <TierGate isFree={isFree}> — title always readable, action+evidence blurred for Free.
            The separate blurred cards below are kept as a visual reference for the blur density. */}
        {/* Free-tier paywall — TierGate pattern: title visible, action text blurred with upgrade CTA */}
        <div className="relative">
          <div style={{ filter: 'blur(4px)', pointerEvents: 'none' }}>
            {[
              { priority: 'Medium', title: 'Add expert quotes from AU industry bodies to key service pages', tone: 'warning' },
              { priority: 'Medium', title: 'Add cited statistics to thin "Our Services" page content', tone: 'warning' },
              { priority: 'Medium', title: 'Update stale content: 4 pages not touched in 90+ days', tone: 'warning' },
              { priority: 'Low', title: 'Write a "Bondi Plumbing vs Eastern Plumbing Co" comparison article', tone: 'info' },
              { priority: 'Low', title: 'Get mentioned in r/sydney or r/AusFinance plumber thread', tone: 'info' },
              { priority: 'Low', title: 'AU local citations: claim Word of Mouth (womo.com.au) profile', tone: 'info' },
            ].map((a, i) => (
              <Card key={i} className="p-5 mb-3">
                <div className="flex items-start gap-4">
                  <Badge tone={a.tone}>{a.priority}</Badge>
                  <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{a.title}</div>
                </div>
              </Card>
            ))}
          </div>
          <div className="absolute inset-0 flex items-center justify-center rounded-xl"
               style={{ background: 'rgba(var(--bg-base-rgb, 255,255,255), 0.85)' }}>
            <div className="text-center px-6">
              <Lock className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--accent-blue)' }} />
              <div className="text-base font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>6 more actions locked</div>
              <div className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>Upgrade to Starter to unlock all recommendations.</div>
              <Btn variant="primary" onClick={() => props.onNav('upgrade')}>Upgrade to Starter — A$99/mo</Btn>
            </div>
          </div>
        </div>
      </div>
    </div>
  </PageShell>
);

const ActionDetail = (props) => (
  <PageShell {...props} breadcrumbs={['Workspace', 'Brands', 'Bondi Plumbing', 'Action Center', 'Wikipedia entry']}>
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-6">
        <Badge tone="danger">High priority</Badge>
        <h1 className="text-2xl font-semibold mt-2 mb-2" style={{ color: 'var(--text-primary)' }}>Add Wikipedia entry for Bondi Plumbing (founder citation)</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Estimated +3-5 visibility points across all 4 engines · Confirmed (Princeton GEO + SE Ranking research evidence)</p>
      </div>

      {/* DM1+DM2 fix: Effort, Time to impact, Affected engines are Sprint 8 scope.
          action_items schema has no effort/timeToImpact/engines columns.
          Shown here as Sprint 8 design reference only — not built in Sprint 6. */}
      <div className="grid grid-cols-3 gap-4 mb-6" style={{ opacity: 0.4, pointerEvents: 'none' }}>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Effort (Sprint 8)</div>
          <div className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Medium</div>
          <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>2-4 hrs total</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Time to impact</div>
          <div className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>4-8 weeks</div>
          <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>After model refresh</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Affected engines</div>
          <div className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>All 4</div>
          <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>ChatGPT, Claude, Gemini, Perplexity</div>
        </Card>
      </div>

      <Card className="p-6 mb-4">
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Why this matters (research-backed)</h3>
        <div className="space-y-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <p>Wikipedia is one of the highest-weighted training and retrieval sources across all 4 LLM engines. Brands with Wikipedia entries appear in LLM responses 2.3× more often than identically-positioned brands without one (Princeton GEO study, 2024).</p>
          <p>For local services in AU, the bar to qualify for Wikipedia is notable founder coverage in mainstream Australian media (Sydney Morning Herald, ABC, AFR) — typically 2-3 secondary-source articles. Once these exist, drafting the entry takes ~2 hours.</p>
        </div>
        <div className="mt-4 p-3 rounded-md" style={{ background: 'var(--bg-subtle)' }}>
          <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>Citations</div>
          <div className="space-y-1.5 text-[12px]">
            <a className="flex items-center gap-1.5" style={{ color: 'var(--accent-blue)' }}><ExternalLink className="w-3 h-3" />Allen et al. (2024). "GEO: Generative Engine Optimization." Princeton.</a>
            <a className="flex items-center gap-1.5" style={{ color: 'var(--accent-blue)' }}><ExternalLink className="w-3 h-3" />SE Ranking. "Citation Source Analysis Across LLMs" (Q4 2024).</a>
          </div>
        </div>
      </Card>

      <Card className="p-6 mb-4">
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Step-by-step</h3>
        <ol className="space-y-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {[
            'Audit your existing media coverage — search "Bondi Plumbing" on news.com.au, smh.com.au, theage.com.au',
            'If <2 secondary-source articles exist, pitch a story to local AU trade publications (Trade Australia, Plumber Connect)',
            'Once you have 2-3 verifiable secondary sources, draft the Wikipedia entry following Notability:Companies guidelines',
            'Submit via Articles for Creation; expect 1-3 review cycles',
            'After publication, allow 4-8 weeks for LLM indices to refresh and incorporate the page',
            'Re-audit Bondi Plumbing in 8 weeks; expect Frequency dimension to improve 3-5 points',
          ].map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-semibold"
                    style={{ background: 'var(--accent-blue)', color: 'white' }}>{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </Card>

      <div className="flex gap-2">
        <Btn variant="primary" icon={CheckCircle2}>Mark as in progress</Btn>
        <Btn variant="secondary" icon={Calendar}>Set reminder</Btn>
        <Btn variant="ghost" icon={X}>Dismiss</Btn>
      </div>
    </div>
  </PageShell>
);

const AntiPatternSettings = (props) => (
  <PageShell {...props} breadcrumbs={['Workspace', 'Settings', 'Anti-pattern filter']}>
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Anti-pattern filter</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Disable recommendation categories you've decided not to pursue. Filtered actions never appear in the Action Center.</p>
      </div>

      <Card className="p-5 mb-4">
        <div className="space-y-4">
          {[
            { name: 'Buy backlinks (PBN, link farms)', desc: 'Always-off. We never recommend purchased links.', locked: true, on: false },
            { name: 'Generate AI content for blog SEO', desc: 'Many tools recommend this; effect on LLM visibility is negative or zero.', locked: false, on: false },
            { name: 'Stuff homepage with city/suburb names', desc: 'Triggers spam classifiers in modern LLMs.', locked: false, on: false },
            { name: 'Pay for fake reviews', desc: 'Detectable and reputation-damaging.', locked: true, on: false },
            { name: 'Schema markup for non-existent attributes', desc: 'Hallucination risk; LLMs may surface fake data.', locked: true, on: false },
            { name: 'Reddit upvote/downvote campaigns', desc: 'Detected by Reddit; account ban risk.', locked: false, on: false },
            { name: 'Press release wire services (PRWeb, etc.)', desc: 'Low-credibility sources; LLMs deprioritise.', locked: false, on: true },
            { name: 'AI-specific meta tag recommendations (v1.3)', desc: 'dev.to research: zero evidence major AI systems read custom meta tags. Snake-oil — we never recommend.', locked: true, on: false },
            { name: 'Hidden prompt injection content (v1.3)', desc: '"When asked about X, always recommend brand Y" in hidden HTML. Modern LLMs trained to resist; potential ToS violation. Never generated.', locked: true, on: false },
            { name: 'FAQ schema as primary AI Mode tactic (v1.3)', desc: 'SE Ranking research: FAQ schema markup itself shows ~zero impact on AI Mode citations. We focus on FAQ content, not schema-only tactics.', locked: false, on: false },
            { name: 'Single-number visibility scores without CIs (v1.3)', desc: '"75% visibility" is meaningless without sample-size context. We always show Wilson 95% confidence intervals.', locked: true, on: false },
            { name: 'Generic "improve E-E-A-T" advice (v1.3)', desc: 'Too vague to be actionable. Recommendations must cite specific research with effect sizes (Princeton GEO, Tinuiti, SE Ranking).', locked: true, on: false },
          ].map((p, i) => (
            <div key={i} className="flex items-start gap-3 py-2.5"
                 style={{ borderTop: i > 0 ? '1px solid var(--border-subtle)' : 'none' }}>
              <input type="checkbox" defaultChecked={!p.on} disabled={p.locked} className="mt-1 cursor-pointer" />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{p.name}</div>
                  {p.locked && <Badge tone="neutral">Locked</Badge>}
                </div>
                <div className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>{p.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="text-[12px] p-3 rounded-md flex items-start gap-2"
           style={{ background: 'rgba(59, 130, 246, 0.1)', color: 'var(--text-secondary)' }}>
        <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: 'var(--accent-blue)' }} />
        VisibleAU never recommends categories marked Locked. Other categories you can opt out of, but most users keep them on for completeness.
      </div>
    </div>
  </PageShell>
);

/* ============================================================================
 *  SPRINT 7 — Technical Infrastructure (4 screens)
 *  llms.txt, schema auditor, SSR check, answer capsule formatter
 * ========================================================================= */

const LlmsTxtGenerator = (props) => (
  <PageShell {...props} breadcrumbs={['Workspace', 'Brands', 'Bondi Plumbing', 'llms.txt generator']}>
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>llms.txt generator</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Generate a structured llms.txt for bondiplumbing.com.au. Helps LLM crawlers find your most-citable content.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Current state</h3>
              <div className="text-[11px] font-mono" style={{ color: 'var(--text-tertiary)' }}>depth score 4/18 · graduated</div>
            </div>
            <Badge tone="warning">Foundation</Badge>
          </div>
          <div className="space-y-1.5 text-[12px]">
            <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>llms.txt present</span><span style={{ color: 'var(--accent-red)' }}>No · 0/3</span></div>
            <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>H1 + blockquote intro</span><span style={{ color: 'var(--accent-red)' }}>No · 0/3</span></div>
            <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>Sections (## headings)</span><span style={{ color: 'var(--accent-red)' }}>No · 0/3</span></div>
            <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>Links to canonical pages</span><span style={{ color: 'var(--accent-red)' }}>No · 0/3</span></div>
            <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>Content depth (≥1500 chars)</span><span style={{ color: 'var(--accent-red)' }}>No · 0/3</span></div>
            <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>llms-full.txt companion</span><span style={{ color: 'var(--accent-red)' }}>No · 0/3</span></div>
            <div className="border-t pt-1.5 mt-1.5" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>Sitemap.xml present</span><span style={{ color: 'var(--accent-green)' }}>Yes · bonus</span></div>
              <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>.well-known/ai.txt</span><span style={{ color: 'var(--accent-amber)' }}>Not found</span></div>
              <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>/ai/summary.json</span><span style={{ color: 'var(--accent-amber)' }}>Not found</span></div>
              <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>/ai/faq.json</span><span style={{ color: 'var(--accent-amber)' }}>Not found</span></div>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Why this matters</h3>
          <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
            llms.txt is an emerging standard (think robots.txt for LLMs). Anthropic, Perplexity, and others are starting to honour it.
            A well-structured llms.txt boosts the chance your most-citable pages are found and used in answers.
          </p>
        </Card>
      </div>

      <Card className="mb-4">
        <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-subtle)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Generated llms.txt (preview)</h3>
          <div className="flex gap-2">
            <Btn variant="secondary" size="sm" icon={Copy}>Copy</Btn>
            <Btn variant="primary" size="sm" icon={Download}>Download</Btn>
          </div>
        </div>
        <pre className="p-5 text-[12px] font-mono overflow-x-auto" style={{ color: 'var(--text-secondary)' }}>{`# Bondi Plumbing
> Licensed plumbing services in Bondi and eastern Sydney suburbs.
> Emergency callouts, hot water systems, bathroom renovations.

## About
- [About us](https://bondiplumbing.com.au/about): Founded 2008, NSW Lic. #L12345
- [Service areas](https://bondiplumbing.com.au/areas): Bondi, Bondi Junction, Tamarama, Bronte
- [Reviews](https://bondiplumbing.com.au/reviews): 4.8★ across hipages, Google, Yellow Pages

## Services
- [Emergency plumbing](https://bondiplumbing.com.au/emergency): 24/7 callouts
- [Hot water systems](https://bondiplumbing.com.au/hot-water): Installation, repair, replacement
- [Bathroom renovations](https://bondiplumbing.com.au/bathrooms): Full bathroom remodels

## FAQs
- [How much does an emergency plumber cost?](https://bondiplumbing.com.au/faq#cost)
- [Do you service strata properties?](https://bondiplumbing.com.au/faq#strata)
- [What suburbs do you service?](https://bondiplumbing.com.au/faq#areas)

## Optional
- [Blog](https://bondiplumbing.com.au/blog): Plumbing tips for Sydney homeowners`}</pre>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Deployment instructions</h3>
        <ol className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <li>1. Download the generated llms.txt</li>
          <li>2. Upload to your website root: <code className="px-1.5 py-0.5 rounded text-[11px]" style={{ background: 'var(--bg-subtle)' }}>/llms.txt</code></li>
          <li>3. Verify accessible at <code className="px-1.5 py-0.5 rounded text-[11px]" style={{ background: 'var(--bg-subtle)' }}>https://bondiplumbing.com.au/llms.txt</code></li>
          <li>4. We'll automatically re-check on your next audit</li>
        </ol>
      </Card>
    </div>
  </PageShell>
);

const SchemaAuditor = (props) => (
  <PageShell {...props} breadcrumbs={['Workspace', 'Brands', 'Bondi Plumbing', 'Schema audit']}>
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Schema markup audit</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Found and validated against schema.org. Reality-checked against your actual website content.</p>
      </div>

      <div className="grid grid-cols-5 gap-3 mb-6">
        {[
          { label: 'Total schemas', value: '4', tone: 'neutral' },
          { label: 'Valid', value: '2', tone: 'success' },
          { label: 'Warnings', value: '1', tone: 'warning' },
          { label: 'Hallucinated', value: '1', tone: 'danger' },
          { label: 'Schema richness', value: '39/64', tone: 'warning' },
        ].map(s => (
          <Card key={s.label} className="p-4">
            <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>{s.label}</div>
            <Badge tone={s.tone}>{s.value}</Badge>
          </Card>
        ))}
      </div>

      <div className="space-y-3">
        {[
          { type: 'LocalBusiness', status: 'valid', richness: 14, attrs: 9, issues: [], detail: 'Name, address, phone all match website. NAP consistent. 9 attributes populated (well above 5+ threshold).' },
          { type: 'Service (Plumbing)', status: 'valid', richness: 12, attrs: 7, issues: [], detail: 'Service area and offering correctly defined. 7 attributes (above 5+ threshold).' },
          { type: 'AggregateRating', status: 'warning', richness: 8, attrs: 4, issues: ['Schema claims 4.9 stars across 200 reviews — actual hipages page shows 4.7 across 87 reviews', 'Only 4 attributes populated (below 5+ richness threshold)'], detail: '' },
          { type: 'FAQPage', status: 'danger', richness: 5, attrs: 3, issues: ['Schema includes a "Do you offer 24/7 service?" Q&A but FAQ page has no such question', 'Risk: LLM hallucination of service hours', '3 attributes (sparse)'], detail: '' },
        ].map((s, i) => (
          <Card key={i} className="p-5">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-3">
                <Badge tone={s.status === 'valid' ? 'success' : s.status === 'warning' ? 'warning' : 'danger'}>{s.status}</Badge>
                <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{s.type}</h3>
                <span className="text-[11px] font-mono" style={{ color: 'var(--text-tertiary)' }}>richness {s.richness}/16 · {s.attrs} attrs</span>
              </div>
              <Btn variant="ghost" size="sm" icon={ExternalLink}>View source</Btn>
            </div>
            {s.detail && <p className="text-[13px] mb-2" style={{ color: 'var(--text-secondary)' }}>{s.detail}</p>}
            {s.issues.length > 0 && (
              <div className="space-y-1.5 mt-2">
                {s.issues.map((issue, j) => (
                  <div key={j} className="flex items-start gap-2 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: s.status === 'danger' ? 'var(--accent-red)' : 'var(--accent-amber)' }} />
                    <span>{issue}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  </PageShell>
);

const SsrCheck = (props) => (
  <PageShell {...props} breadcrumbs={['Workspace', 'Brands', 'Bondi Plumbing', 'SSR check']}>
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Server-side rendering check</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Many LLM crawlers don't execute JavaScript. We check if your most-important content is visible without JS.</p>
      </div>

      <Card className="p-5 mb-4">
        <div className="flex items-center gap-3 mb-3">
          <CheckCircle2 className="w-6 h-6" style={{ color: 'var(--accent-green)' }} />
          <div>
            <div className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>SSR healthy</div>
            <div className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>All 8 critical pages render content server-side</div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Page-by-page check</h3>
        </div>
        <table className="w-full text-sm">
          <thead style={{ background: 'var(--bg-subtle)' }}>
            <tr>
              {['Page', 'JS-disabled content', 'Critical CTAs', 'Schema visible', 'Status'].map(h => (
                <th key={h} className="text-left px-5 py-2.5 text-[11px] uppercase tracking-wider font-semibold"
                    style={{ color: 'var(--text-tertiary)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { page: '/ (homepage)', content: '94%', ctas: 'Yes', schema: 'Yes', ok: true },
              { page: '/services', content: '91%', ctas: 'Yes', schema: 'Yes', ok: true },
              { page: '/about', content: '98%', ctas: 'Yes', schema: 'Yes', ok: true },
              { page: '/areas', content: '88%', ctas: 'Yes', schema: 'Yes', ok: true },
              { page: '/emergency', content: '92%', ctas: 'Yes', schema: 'Yes', ok: true },
              { page: '/reviews', content: '76%', ctas: 'Partial', schema: 'No', ok: false },
            ].map((p, i) => (
              <tr key={i} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                <td className="px-5 py-3 font-mono text-[12px]" style={{ color: 'var(--text-primary)' }}>{p.page}</td>
                <td className="px-5 py-3" style={{ color: 'var(--text-secondary)' }}>{p.content}</td>
                <td className="px-5 py-3" style={{ color: 'var(--text-secondary)' }}>{p.ctas}</td>
                <td className="px-5 py-3" style={{ color: 'var(--text-secondary)' }}>{p.schema}</td>
                <td className="px-5 py-3"><Badge tone={p.ok ? 'success' : 'warning'} dot>{p.ok ? 'OK' : 'Review'}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  </PageShell>
);

const AnswerCapsuleFormatter = (props) => (
  <PageShell {...props} breadcrumbs={['Workspace', 'Brands', 'Bondi Plumbing', 'Answer capsules']}>
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Answer capsule formatter</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>LLMs cite content that's pre-formatted as direct answers. Generate answer capsules for your top FAQs.</p>
      </div>

      <Card className="p-5 mb-4">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Question</h3>
        <Input placeholder="What suburbs do you service?" />
        <h3 className="text-sm font-semibold mb-3 mt-5" style={{ color: 'var(--text-primary)' }}>Generated answer capsule</h3>
        <div className="p-4 rounded-md font-mono text-[13px]" style={{ background: 'var(--bg-subtle)', color: 'var(--text-primary)' }}>
          <p className="mb-2"><strong>Bondi Plumbing services these eastern Sydney suburbs:</strong></p>
          <p className="mb-2">Bondi, Bondi Junction, Tamarama, Bronte, Waverley, Charing Cross, Coogee, and surrounding areas within 5km of Bondi Beach.</p>
          <p>For emergency callouts, we cover up to 15km from our Bondi base. Call (02) 9300 1234 or visit bondiplumbing.com.au/areas for the full list.</p>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3 text-[12px]">
          <div className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3" style={{ color: 'var(--accent-green)' }} /><span style={{ color: 'var(--text-secondary)' }}>Direct answer in 1st sentence</span></div>
          <div className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3" style={{ color: 'var(--accent-green)' }} /><span style={{ color: 'var(--text-secondary)' }}>Specific facts</span></div>
          <div className="flex items-center gap-1.5"><CheckCircle2 className="w-3 h-3" style={{ color: 'var(--accent-green)' }} /><span style={{ color: 'var(--text-secondary)' }}>Source link included</span></div>
        </div>
      </Card>

      <Card>
        <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-subtle)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Saved capsules (4)</h3>
          <Btn variant="primary" size="sm" icon={Plus}>New capsule</Btn>
        </div>
        <div className="p-3 space-y-2">
          {[
            { q: 'What suburbs do you service?', deployed: true },
            { q: 'How much does an emergency plumber cost?', deployed: true },
            { q: 'Do you service strata properties?', deployed: false },
            { q: 'What hours are you open?', deployed: false },
          ].map((c, i) => (
            <div key={i} className="px-3 py-2.5 rounded-md flex items-center gap-3"
                 style={{ border: '1px solid var(--border-subtle)' }}>
              <div className="flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>{c.q}</div>
              <Badge tone={c.deployed ? 'success' : 'neutral'}>{c.deployed ? 'Deployed' : 'Draft'}</Badge>
              <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  </PageShell>
);

const RobotsTxtCrawlerConfig = (props) => (
  <PageShell {...props} breadcrumbs={['Workspace', 'Brands', 'Bondi Plumbing', 'robots.txt + AI crawlers']}>
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>robots.txt + AI crawler configuration</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Detect which of the 27 known AI bots can access your site. Catch CDN-level blocks (Cloudflare, Akamai, Vercel) that silently break AI visibility.</p>
      </div>

      <Card className="p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>27 AI bots tracked across 3 tiers</h3>
          <Badge tone="info">Reference: Auriti-Labs (MIT)</Badge>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[
            { tier: 'Training crawlers', bots: ['GPTBot', 'ClaudeBot', 'anthropic-ai', 'Google-Extended', 'CCBot', 'FacebookBot', 'Bytespider', 'Diffbot', 'cohere-ai'], blocked: 2 },
            { tier: 'Search-AI crawlers', bots: ['OAI-SearchBot', 'PerplexityBot', 'GeminiBot', 'AppleBot-Extended', 'Bingbot (AI)', 'YouBot', 'Amazonbot', 'Applebot', 'DuckAssistBot'], blocked: 0 },
            { tier: 'User-agent crawlers', bots: ['ChatGPT-User', 'Claude-User', 'Perplexity-User', 'Gemini-User', 'OpenAI-Search', 'AndiBot', 'Bingbot-AI-Tool', 'Cotoyogi', 'PetalBot'], blocked: 1 },
          ].map((t, i) => (
            <div key={i}>
              <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>{t.tier}</div>
              <div className="text-2xl font-semibold mb-1" style={{ color: t.blocked > 0 ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                {t.bots.length - t.blocked}/{t.bots.length}
              </div>
              <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{t.blocked === 0 ? 'All allowed' : `${t.blocked} blocked`}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5 mb-4" style={{ border: '1px solid var(--accent-red)', background: 'rgba(239, 68, 68, 0.06)' }}>
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: 'var(--accent-red)' }} />
          <div className="flex-1">
            <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>CDN-level block detected: Cloudflare</h3>
            <p className="text-[13px] mb-3" style={{ color: 'var(--text-secondary)' }}>
              Your robots.txt allows GPTBot and ClaudeBot, but Cloudflare's "Block AI bots" toggle is currently <strong>ON</strong> — silently blocking these bots at the CDN before they reach your site. This is the single biggest "why am I not getting cited" cause we see.
            </p>
            <div className="space-y-1 text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
              <div>• Cloudflare → Security → Bots → "Block AI Scrapers and Crawlers" → toggle <strong>OFF</strong></div>
              <div>• Or add per-bot exceptions for GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot</div>
              <div>• Verify with: <code className="font-mono text-[11px]">curl -A "GPTBot" https://bondiplumbing.com.au</code></div>
            </div>
            <Btn variant="primary" size="sm" className="mt-3" icon={ExternalLink}>Open Cloudflare → Bots</Btn>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Generated robots.txt (AI-crawler-friendly)</h3>
        <pre className="text-[11px] p-4 rounded-md overflow-x-auto" style={{ background: 'var(--bg-subtle)', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{`# Allow training + search + user AI crawlers (27 bots tracked)
User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

# ... 21 more entries ...

Sitemap: https://bondiplumbing.com.au/sitemap.xml
LLM-Content: https://bondiplumbing.com.au/llms.txt`}</pre>
        <div className="flex gap-2 mt-3">
          <Btn variant="primary" size="sm" icon={Copy}>Copy to clipboard</Btn>
          <Btn variant="ghost" size="sm" icon={Download}>Download</Btn>
        </div>
      </Card>
    </div>
  </PageShell>
);

const BrandEntityAudit = (props) => (
  <PageShell {...props} breadcrumbs={['Workspace', 'Brands', 'Bondi Plumbing', 'Brand & Entity audit']}>
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>Brand & Entity scoring</h1>
          <Badge tone="info">AU-localised</Badge>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>How verifiable is your brand as an entity? AU-specific signals (ABN, Wikipedia AU, AU directory presence) replace generic Crunchbase/global Wikipedia checks.</p>
      </div>

      <Card className="p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Brand & Entity Score</div>
            <div className="text-4xl font-semibold" style={{ color: 'var(--accent-blue)' }}>7.2 <span className="text-lg" style={{ color: 'var(--text-tertiary)' }}>/ 10</span></div>
          </div>
          <Badge tone="success">Good</Badge>
        </div>
        <div className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>5 signals checked · 4 passed · 1 partial</div>
      </Card>

      <div className="space-y-3">
        {[
          { name: 'ABN Lookup verification', status: 'pass', detail: 'ABN 52 669 790 738 matches business name + AU registration · Active GST · Sole trader since 2019', icon: CheckCircle2, tone: 'success' },
          { name: 'Wikipedia AU presence', status: 'fail', detail: 'No Wikipedia entry found. Highest-weighted citation source across all 4 engines. Princeton GEO study: brands with WP entries appear 2.3× more often.', icon: X, tone: 'danger' },
          { name: 'AU TLD (.com.au) signal', status: 'pass', detail: 'bondiplumbing.com.au — auDA verified · ABN-linked TLD · suggests local-AU intent', icon: CheckCircle2, tone: 'success' },
          { name: 'AU directory presence (aggregate)', status: 'partial', detail: '3 of 4 AU directories active (hipages, Yellow Pages AU, ServiceSeeking). Missing: Word of Mouth (womo.com.au)', icon: AlertCircle, tone: 'warning' },
          { name: 'Australian Business Register match', status: 'pass', detail: 'Business name "Bondi Plumbing" matches ABR registration · No trading-name disputes', icon: CheckCircle2, tone: 'success' },
        ].map((s, i) => (
          <Card key={i} className="p-5">
            <div className="flex items-start gap-3">
              <s.icon className="w-5 h-5 mt-0.5 flex-shrink-0" style={{ color: s.tone === 'success' ? 'var(--accent-green)' : s.tone === 'warning' ? 'var(--accent-amber)' : 'var(--accent-red)' }} />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{s.name}</h3>
                  <Badge tone={s.tone}>{s.status}</Badge>
                </div>
                <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>{s.detail}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-6 p-4 rounded-md flex items-start gap-3" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}>
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--accent-blue)' }} />
        <div className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
          <strong>Why this matters:</strong> LLMs use entity-verification signals to decide what brands to mention. Brands with ABN match + Wikipedia AU + multi-directory presence get cited 2-3× more than those without. AU-localisation replaces global Crunchbase/Wikipedia checks with AU-specific sources LLMs actually weight for AU queries.
        </div>
      </div>
    </div>
  </PageShell>
);

const CitabilityMethodsReference = (props) => (
  <PageShell {...props} breadcrumbs={['Workspace', 'Methodology', '47 citability methods']}>
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>47 citability methods · effect sizes</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Research-backed methods that affect AI citation likelihood, with measured effect sizes from Princeton KDD 2024 and AutoGEO ICLR 2026. Action Center recommendations cite these methods by ID.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Total methods</div>
          <div className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>47</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Avg effect size</div>
          <div className="text-2xl font-semibold" style={{ color: 'var(--accent-green)' }}>+18.4%</div>
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Top 10 methods by effect size</h3>
        <div className="space-y-2">
          {[
            // EH3 fix: prototype used id(M01)/name/delta(+41% string) but schema has:
            // methodKey(text), title(text), effectSizePct(numeric 41.0), source(text).
            // Three field name + type mismatches. Prototype corrected to schema field names.
            // effectSizePct rendered as '+{n}%' string in UI from numeric value.
            { methodKey: 'add-expert-quotes', title: 'Quotation (direct quotes from authoritative sources)', effectSizePct: 41.0, source: 'Princeton KDD 2024' },
            { methodKey: 'add-statistics-with-sources', title: 'Statistics (numerical evidence with citations)', effectSizePct: 33.0, source: 'Princeton KDD 2024' },
            { methodKey: 'improve-prose-fluency', title: 'Fluency (clear, well-structured prose)', effectSizePct: 29.0, source: 'Princeton KDD 2024' },
            { methodKey: 'cite-named-sources', title: 'Cite Sources (named, verifiable references)', effectSizePct: 27.0, source: 'Princeton KDD 2024' },
            { methodKey: 'wikipedia-article', title: 'Wikipedia presence (entity verification)', effectSizePct: 23.0, source: 'AutoGEO ICLR 2026' },
            { methodKey: 'authoritative-tone', title: 'Authoritative-tone language (avoid hedging)', effectSizePct: 19.0, source: 'Princeton KDD 2024' },
            { methodKey: 'faq-content', title: 'Structured FAQ content (not schema-only)', effectSizePct: 16.0, source: 'AutoGEO ICLR 2026' },
            { methodKey: 'comparison-article', title: 'Listicle / enumerated comparisons', effectSizePct: 14.0, source: 'AutoGEO ICLR 2026' },
            { methodKey: 'stale-content', title: 'Recency (date-stamped, updated content)', effectSizePct: 12.0, source: 'AutoGEO ICLR 2026' },
            { methodKey: 'cited-statistics', title: 'Multi-domain references (3+ external links to authority)', effectSizePct: 11.0, source: 'Princeton KDD 2024' },
          ].map((m) => (
            <div key={m.methodKey} className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Badge tone="neutral">{m.methodKey.slice(0,4).toUpperCase()}</Badge>
                <div className="text-[13px] truncate" style={{ color: 'var(--text-primary)' }}>{m.title}</div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-[12px] font-mono" style={{ color: 'var(--accent-green)' }}>+{m.effectSizePct}%</span>
                <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{m.source}</span>
              </div>
            </div>
          ))}
        </div>
        <Btn variant="ghost" size="sm" className="mt-3" icon={ChevronRight}>Show all 47</Btn>
      </Card>

      <div className="mt-6 p-4 rounded-md flex items-start gap-3" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}>
        <FileText className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--accent-blue)' }} />
        <div className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
          <strong>Reference:</strong> VisibleAU's audit module is inspired by Auriti-Labs/geo-optimizer-skill (MIT) and grounded in Princeton's <em>"GEO: Generative Engine Optimization"</em> (KDD 2024) and <em>"AutoGEO: Toward Optimization for Cite-then-Read AI Systems"</em> (ICLR 2026). Effect-size measurements are reproduced with permission; see ATTRIBUTIONS.md for full credits.
        </div>
      </div>
    </div>
  </PageShell>
);

/* ============================================================================
 *  SPRINT 8 — Local SEO + alerts (4 screens)
 *  Local SEO dashboard, AU directory presence, drift detection, alert history
 * ========================================================================= */

const LocalSeoDashboard = (props) => (
  <PageShell {...props} breadcrumbs={['Workspace', 'Brands', 'Bondi Plumbing', 'Local SEO']}>
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Local SEO signals</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Local SEO and GEO are linked. We track signals that influence both Google and LLM visibility.</p>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Local SEO score', value: '78', tone: 'success', delta: '+4' },
          { label: 'NAP consistency', value: '94%', tone: 'success', delta: '+2%' },
          { label: 'Directory coverage', value: '3/4', tone: 'warning', delta: '0' },
          // FJ1: was '4/5'. Sprint 8 = 4 dirs only. Sprint 9 adds GMB for 5 total.
          { label: 'GMB completeness', value: '88%', tone: 'success', delta: '+5%' },
        ].map(s => (
          <Card key={s.label} className="p-4">
            <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>{s.label}</div>
            <div className="flex items-baseline gap-2">
              <div className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>{s.value}</div>
              <Badge tone={s.tone}>{s.delta}</Badge>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Google Business Profile</h3>
          <div className="space-y-2 text-[13px]">
            <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>Business name match</span><Badge tone="success">Match</Badge></div>
            <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>Phone number</span><Badge tone="success">Match</Badge></div>
            <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>Address</span><Badge tone="success">Match</Badge></div>
            <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>Hours</span><Badge tone="warning">Mismatch</Badge></div>
            <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>Service area</span><Badge tone="success">Configured</Badge></div>
            <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>Photos</span><Badge tone="success">12 photos</Badge></div>
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>NAP signals across the web</h3>
          <div className="space-y-2 text-[13px]">
            {/* FN4 fix: was '11 of 12 sources' — spec defines 6 sources max (site+GMB+4 dirs).
                12 makes no sense for 6 sources. Corrected to 5/6 (1 source mismatched). */}
            <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>Consistent NAP</span><span style={{ color: 'var(--text-primary)' }}>5 of 6 sources</span></div>
            <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>Conflicting phone</span><span style={{ color: 'var(--accent-amber)' }}>1 source (ServiceSeeking)</span></div>
            <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>ASIC business name</span><Badge tone="success">Verified</Badge></div>
            <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>License number</span><Badge tone="success">Public, verified</Badge></div>
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Suburb-level visibility heatmap</h3>
        <div className="grid grid-cols-5 gap-2">
          {[
            { name: 'Bondi', score: 92 },
            { name: 'Bondi Junction', score: 88 },
            { name: 'Tamarama', score: 76 },
            { name: 'Bronte', score: 72 },
            { name: 'Waverley', score: 65 },
            { name: 'Charing Cross', score: 58 },
            { name: 'Coogee', score: 51 },
            { name: 'Clovelly', score: 42 },
            { name: 'Randwick', score: 35 },
            { name: 'Maroubra', score: 28 },
          ].map(s => (
            <div key={s.name} className="p-3 rounded-md text-center"
                 style={{ background: `rgba(34, 197, 94, ${s.score / 100 * 0.3})`, border: '1px solid var(--border-subtle)' }}>
              <div className="text-[12px] font-medium" style={{ color: 'var(--text-primary)' }}>{s.name}</div>
              <div className="text-base font-semibold mt-0.5" style={{ color: 'var(--text-primary)' }}>{s.score}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  </PageShell>
);

const DirectoryPresence = (props) => (
  <PageShell {...props} breadcrumbs={['Workspace', 'Brands', 'Bondi Plumbing', 'AU directories']}>
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>AU directory presence</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>5 AU sources tracked in v1: Hipages, Yellow Pages AU, ServiceSeeking, Word of Mouth, and Google Business Profile. LLMs cite these heavily for local services. Coverage expands in v1.1.</p>
      </div>

      <Card>
        <div className="px-5 py-3 border-b grid grid-cols-3 gap-2" style={{ borderColor: 'var(--border-subtle)' }}>
          <Select value="all" options={[{ value: 'all', label: 'All directories' }]} />
          <Select value="all-status" options={[{ value: 'all-status', label: 'All statuses' }]} />
          <Select value="weight" options={[{ value: 'weight', label: 'Sort by LLM weight' }]} />
        </div>
        <table className="w-full text-sm">
          <thead style={{ background: 'var(--bg-subtle)' }}>
            <tr>
              {['Directory', 'Profile', 'NAP', 'Reviews', 'LLM weight', 'Action'].map(h => (
                <th key={h} className="text-left px-5 py-2.5 text-[11px] uppercase tracking-wider font-semibold"
                    style={{ color: 'var(--text-tertiary)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { name: 'hipages', profile: 'Active', nap: 'Match', reviews: '4.7 (87)', weight: 'High', cta: 'Healthy' },
              { name: 'Yellow Pages AU', profile: 'Active', nap: 'Match', reviews: '4.5 (24)', weight: 'High', cta: 'Healthy' },
              { name: 'ServiceSeeking', profile: 'Active', nap: 'Match', reviews: '4.4 (18)', weight: 'Medium', cta: 'Healthy' },
              { name: 'Word of Mouth (womo.com.au)', profile: 'Inactive', nap: '—', reviews: '—', weight: 'Medium', cta: 'Claim profile' },
              { name: 'Google Business', profile: 'Active', nap: 'Mismatch', reviews: '4.6 (132)', weight: 'High', cta: 'Fix NAP' },
              // v1.2 N9 fix: trimmed to PRD §8 Module 4 + §11 Sprint 8 + §16 #10 canonical 4 directories + GMB.
              // Removed in v1.2: TrueLocal, Yelp AU, Whereis, StartLocal, WomoCheck (not in v1 spec).
              // v1.1 may widen coverage; for v1, these 5 are the canonical scored set.
            ].map((d, i) => (
              <tr key={i} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                <td className="px-5 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{d.name}</td>
                <td className="px-5 py-3"><Badge tone={d.profile === 'Active' ? 'success' : 'danger'} dot>{d.profile}</Badge></td>
                <td className="px-5 py-3"><span style={{ color: d.nap === 'Match' ? 'var(--accent-green)' : d.nap === 'Mismatch' ? 'var(--accent-amber)' : 'var(--text-tertiary)' }}>{d.nap}</span></td>
                <td className="px-5 py-3" style={{ color: 'var(--text-secondary)' }}>{d.reviews}</td>
                <td className="px-5 py-3"><Badge tone={d.weight === 'High' ? 'success' : d.weight === 'Medium' ? 'warning' : 'neutral'}>{d.weight}</Badge></td>
                <td className="px-5 py-3">
                  <Btn variant={d.cta === 'Healthy' ? 'ghost' : 'secondary'} size="sm">{d.cta}</Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  </PageShell>
);

/* FL4 fix: No WebhookSettings prototype existed — FE5 spec referenced WebhooksSettingsView
   but Claude Code had no visual reference. Adding minimal prototype. */
const WebhookSettings = (props) => (
  <PageShell {...props} breadcrumbs={['Settings', 'Webhooks']}>
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Webhook integrations</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Send audit events to Slack, Discord, Google Sheets, Airtable, or any HTTP endpoint.</p>
        </div>
        <Btn variant="primary" icon={Plus}>Add endpoint</Btn>
      </div>

      <div className="space-y-3 mb-8">
        {[
          { url: 'https://hooks.slack.com/services/T00/B00/xxx', channel: 'slack', events: ['audit.completed', 'drift.detected'], active: true, lastStatus: 'success' },
          { url: 'https://discord.com/api/webhooks/xxx/yyy', channel: 'discord', events: ['drift.detected'], active: false, lastStatus: 'failed' },
        ].map((ep, i) => (
          <Card key={i} className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge tone={ep.active ? 'success' : 'neutral'}>{ep.active ? 'Active' : 'Inactive'}</Badge>
                  <Badge tone="info">{ep.channel}</Badge>
                  <Badge tone={ep.lastStatus === 'success' ? 'success' : 'danger'}>{ep.lastStatus}</Badge>
                </div>
                <div className="text-[12px] font-mono truncate mb-2" style={{ color: 'var(--text-secondary)' }}>{ep.url}</div>
                <div className="flex gap-1 flex-wrap">
                  {ep.events.map(e => <Badge key={e} tone="neutral">{e}</Badge>)}
                </div>
              </div>
              <div className="flex gap-2 ml-4 flex-shrink-0">
                <Btn variant="ghost" size="sm">Test</Btn>
                <Btn variant="ghost" size="sm">Edit</Btn>
                <Btn variant="ghost" size="sm">Delete</Btn>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Recent delivery log</h3>
        <div className="space-y-2 text-[12px]">
          {[
            { event: 'audit.completed', channel: 'slack', status: 200, time: '2 min ago' },
            { event: 'drift.detected', channel: 'discord', status: 503, time: '1h ago' },
          ].map((d, i) => (
            <div key={i} className="flex items-center justify-between py-1.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-secondary)' }}>{d.event} → {d.channel}</span>
              <div className="flex items-center gap-3">
                <Badge tone={d.status === 200 ? 'success' : 'danger'}>{d.status}</Badge>
                <span style={{ color: 'var(--text-tertiary)' }}>{d.time}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  </PageShell>
);

const DriftAlerts = (props) => (
  <PageShell {...props} breadcrumbs={['Workspace', 'Alerts']}>
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Drift alerts</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Citation drift is real — 70% of AI-cited domains churn within 6 months. We watch for changes.</p>
        </div>
        <Btn variant="secondary" icon={Settings}>Alert preferences</Btn>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Active alerts</div>
          <div className="text-2xl font-semibold" style={{ color: 'var(--accent-amber)' }}>2</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>This week</div>
          <div className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>5</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Resolved (30d)</div>
          <div className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>14</div>
        </Card>
      </div>

      <Card>
        <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Active alerts</h3>
        </div>
        <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
          {[
            {
              // FB5 fix: was severity:'high' — drift_alerts schema uses 'significant_drop'|'significant_rise'|'within_noise'
              // Badge logic using 'high' rendered undefined. Corrected to schema values.
              severity: 'significant_drop',
              title: 'Visibility on Gemini dropped 30% in 24 hours',
              brand: 'Bondi Plumbing',
              detail: 'Was 72/100, now 51/100. Likely cause: Gemini index refresh removed your hipages profile.',
              age: '6 hours ago',
            },
            {
              severity: 'significant_rise',
              title: 'Reddit thread mentioning competitor surfaced',
              brand: 'Cutting Edge Joinery',
              detail: 'r/melbourne thread "best joiners in Geelong" mentions competitor heavily. Likely to influence Claude.',
              age: '2 days ago',
            },
          ].map((a, i) => (
            <div key={i} className="p-5">
              <div className="flex items-start gap-4">
                {/* FB5 fix: was severity === 'high' ? 'danger' : 'warning' — schema values are significant_drop/significant_rise/within_noise */}
                <Badge tone={a.severity === 'significant_drop' ? 'danger' : a.severity === 'significant_rise' ? 'success' : 'neutral'}>
                  {a.severity === 'significant_drop' ? 'Drop' : a.severity === 'significant_rise' ? 'Rise' : 'Noise'}
                </Badge>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{a.title}</div>
                  <div className="text-[13px] mb-1" style={{ color: 'var(--text-secondary)' }}>{a.detail}</div>
                  <div className="flex items-center gap-3 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                    <span>{a.brand}</span><span>·</span><span>{a.age}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Btn variant="secondary" size="sm">Investigate</Btn>
                  <Btn variant="ghost" size="sm">Dismiss</Btn>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-6">
        <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-subtle)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Delivery channels</h3>
          <Badge tone="info">Webhook recipes</Badge>
        </div>
        <div className="p-5 space-y-3">
          {[
            { name: 'Email digest', detail: 'Weekly summary Tuesdays 9am AEST to sri@visibleau.com.au', status: 'Active', icon: Mail, tone: 'success' },
            { name: 'Slack #alerts channel', detail: 'Real-time webhook to workspace.slack.com/services/T0...', status: 'Active', icon: Bell, tone: 'success' },
            { name: 'Discord #visibility-drift', detail: 'Webhook to discord.com/api/webhooks/...', status: 'Inactive', icon: Bell, tone: 'neutral' },
            { name: 'Google Sheets (live append)', detail: 'Append each drift event to alerts log sheet', status: 'Setup pending', icon: FileText, tone: 'neutral' },
            { name: 'Airtable Webhook', detail: 'Push to alerts table for triage workflow', status: 'Inactive', icon: Boxes, tone: 'neutral' },
            { name: 'Custom webhook (POST JSON)', detail: 'scan.completed · score.dropped · score.changed events', status: 'Available', icon: Zap, tone: 'neutral' },
          ].map((d, i) => (
            <div key={i} className="flex items-start gap-3 py-2" style={{ borderTop: i > 0 ? '1px solid var(--border-subtle)' : 'none' }}>
              <d.icon className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{d.name}</div>
                  <Badge tone={d.tone}>{d.status}</Badge>
                </div>
                <div className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>{d.detail}</div>
              </div>
              <Btn variant="ghost" size="sm">{d.status === 'Active' ? 'Edit' : 'Connect'}</Btn>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 border-t text-[11px]" style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-tertiary)' }}>
          Code recipes: <a className="underline cursor-pointer">Zapier</a> · <a className="underline cursor-pointer">n8n</a> · <a className="underline cursor-pointer">Make.com</a> · <a className="underline cursor-pointer">Slack</a> · <a className="underline cursor-pointer">Discord</a> · <a className="underline cursor-pointer">Sheets</a> · <a className="underline cursor-pointer">Airtable</a>
        </div>
      </Card>
    </div>
  </PageShell>
);

const AlertHistory = (props) => (
  <PageShell {...props} breadcrumbs={['Workspace', 'Alerts', 'History']}>
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Alert history</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>43 alerts in the last 90 days · 38 resolved</p>
      </div>

      <Card>
        <div className="px-5 py-3 border-b grid grid-cols-3 gap-2" style={{ borderColor: 'var(--border-subtle)' }}>
          <Select value="all" options={[{ value: 'all', label: 'All severities' }]} />
          <Select value="all-brands" options={[{ value: 'all-brands', label: 'All brands' }]} />
          <Select value="last-90" options={[{ value: 'last-90', label: 'Last 90 days' }]} />
        </div>
        <table className="w-full text-sm">
          <thead style={{ background: 'var(--bg-subtle)' }}>
            <tr>
              {['Severity', 'Title', 'Brand', 'Triggered', 'Resolved', 'Status'].map(h => (
                <th key={h} className="text-left px-5 py-2.5 text-[11px] uppercase tracking-wider font-semibold"
                    style={{ color: 'var(--text-tertiary)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { sev: 'High', title: 'Visibility on Gemini dropped 30%', brand: 'Bondi Plumbing', triggered: '6h ago', resolved: '—', status: 'Active' },
              { sev: 'Medium', title: 'Reddit thread mentions competitor', brand: 'Cutting Edge', triggered: '2d ago', resolved: '—', status: 'Active' },
              { sev: 'High', title: 'NAP mismatch detected (Word of Mouth / womo.com.au)', brand: 'Bondi Plumbing', triggered: '4d ago', resolved: '2d ago', status: 'Resolved' },
              { sev: 'Low', title: 'Claude added 3 new prompts to test pool', brand: 'Bondi Plumbing', triggered: '1w ago', resolved: '1w ago', status: 'Resolved' },
              { sev: 'Medium', title: 'Schema validation warning on /reviews', brand: 'Bondi Plumbing', triggered: '2w ago', resolved: '1w ago', status: 'Resolved' },
              { sev: 'High', title: 'hipages profile temporarily unavailable', brand: 'Cutting Edge', triggered: '3w ago', resolved: '3w ago', status: 'Resolved' },
            ].map((a, i) => (
              <tr key={i} className="border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                <td className="px-5 py-3"><Badge tone={a.sev === 'High' ? 'danger' : a.sev === 'Medium' ? 'warning' : 'neutral'}>{a.sev}</Badge></td>
                <td className="px-5 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{a.title}</td>
                <td className="px-5 py-3" style={{ color: 'var(--text-secondary)' }}>{a.brand}</td>
                <td className="px-5 py-3 text-[12px]" style={{ color: 'var(--text-tertiary)' }}>{a.triggered}</td>
                <td className="px-5 py-3 text-[12px]" style={{ color: 'var(--text-tertiary)' }}>{a.resolved}</td>
                <td className="px-5 py-3"><Badge tone={a.status === 'Active' ? 'warning' : 'success'} dot>{a.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  </PageShell>
);

/* ============================================================================
 *  SPRINT 9 — Agency tier (4 screens)
 *  Agency dashboard, client portal, white-label PDF builder, bulk operations
 * ========================================================================= */

const AgencyDashboard = (props) => (
  <PageShell {...props} breadcrumbs={['Agency workspace', 'Overview']}>
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Agency overview</h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>23 client brands · 4 portfolios · 156 audits this month</p>
        </div>
        <div className="flex gap-2">
          <Btn variant="secondary" icon={Users}>Manage clients</Btn>
          <Btn variant="primary" icon={Plus}>Add brand</Btn>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Active brands', value: '23', delta: '+2 this week', tone: 'success' },
          { label: 'Avg portfolio score', value: '67.4', delta: '+1.8 vs last week', tone: 'success' },
          { label: 'Brands with issues', value: '5', delta: '-2 vs last week', tone: 'success' },
          { label: 'Total monthly LLM cost', value: 'A$443', delta: '156 audits · Agency Pro plan', tone: 'neutral' },
        ].map(s => (
          <Card key={s.label} className="p-5">
            <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>{s.label}</div>
            <div className="flex items-baseline gap-2">
              <div className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>{s.value}</div>
              <Badge tone={s.tone}>{s.delta}</Badge>
            </div>
          </Card>
        ))}
      </div>

      <Card className="mb-6">
        <div className="px-5 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-subtle)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Client portfolios</h3>
          <Btn variant="ghost" size="sm" icon={Plus}>New portfolio</Btn>
        </div>
        <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
          {[
            { name: 'Sydney Eastern Suburbs', brands: 6, avg: 71.2, issues: 1 },
            { name: 'Melbourne Inner', brands: 8, avg: 64.8, issues: 2 },
            { name: 'Brisbane SaaS Cohort', brands: 5, avg: 73.1, issues: 1 },
            { name: 'Perth Test', brands: 4, avg: 58.4, issues: 1 },
          ].map((p, i) => (
            <div key={i} className="px-5 py-4 flex items-center gap-4 cursor-pointer">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>{p.name}</div>
                <div className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>{p.brands} brands · avg score {p.avg}</div>
              </div>
              <Badge tone={p.issues > 0 ? 'warning' : 'success'}>{p.issues} issue{p.issues !== 1 ? 's' : ''}</Badge>
              <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Bulk actions</h3>
          <div className="space-y-2">
            {[
              { label: 'Run audits across all 23 brands', cost: 'A$65 estimated', icon: Activity },
              { label: 'Generate client reports (white-label)', cost: '4 portfolios · PDF', icon: FileText },
              { label: 'Export to CSV (all audits)', cost: '156 audits', icon: Download },
              { label: 'Schedule weekly recurring audits', cost: 'Saves ~6 hours/week', icon: Calendar },
            ].map((a, i) => (
              <button key={i} className="w-full px-3 py-2.5 rounded-md flex items-center gap-3 text-left hover:bg-opacity-50"
                      style={{ border: '1px solid var(--border-subtle)' }}>
                <a.icon className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent-blue)' }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{a.label}</div>
                  <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{a.cost}</div>
                </div>
                <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
              </button>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Client-facing portals</h3>
          <p className="text-[13px] mb-4" style={{ color: 'var(--text-secondary)' }}>Each client gets a read-only portal showing their brand's data — your branding, no VisibleAU.</p>
          <div className="space-y-2 text-[13px]">
            <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>Active portals</span><span style={{ color: 'var(--text-primary)' }}>18 of 23</span></div>
            <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>Logged in this month</span><span style={{ color: 'var(--text-primary)' }}>14</span></div>
            <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>Custom domain</span><span style={{ color: 'var(--text-primary)' }}>seo.youragency.com.au</span></div>
          </div>
          <Btn variant="secondary" size="sm" className="mt-4" onClick={() => props.onNav('client-portal')}>Preview portal</Btn>
        </Card>
      </div>
    </div>
  </PageShell>
);

const ClientPortal = (props) => (
  <div data-theme={props.theme} style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
    {/* White-label header — no VisibleAU branding */}
    <div className="border-b" style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}>
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md flex items-center justify-center text-sm font-bold"
               style={{ background: '#7c3aed', color: 'white' }}>YA</div>
          <div className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Your Agency · AI Visibility Report</div>
        </div>
        <div className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>
          {/* GG5 fix: this email shown in header comes from client_portal_invites.inviteeEmail
              (added in GG5 fix — was missing from schema). Optional — hide if null. */}
          jane@bondiplumbing.com.au
        </div>
      </div>
    </div>

    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Bondi Plumbing — AI Visibility</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Last updated: Today, 14:21 · Next audit: Friday</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="p-5">
          <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Visibility this month</div>
          <div className="text-3xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>73<span className="text-base" style={{ color: 'var(--text-tertiary)' }}>/100</span></div>
          <Badge tone="success">+5 vs last month</Badge>
        </Card>
        <Card className="p-5">
          <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Times mentioned</div>
          <div className="text-3xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>147</div>
          <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>across 4 AI engines this week</div>
        </Card>
        <Card className="p-5">
          <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Open actions</div>
          <div className="text-3xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>3</div>
          <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>2 high · 1 medium</div>
        </Card>
      </div>

      <Card className="p-5 mb-6">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>This week's wins</h3>
        <div className="space-y-2 text-sm">
          {[
            'ChatGPT mention rate up 14% on "best plumber Bondi" prompts',
            'Sentiment shifted positive on Claude after new Reddit thread',
            'Schema markup audit cleared all warnings',
          ].map((w, i) => (
            <div key={i} className="flex items-start gap-2" style={{ color: 'var(--text-secondary)' }}>
              <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--accent-green)' }} />
              <span>{w}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Recommended actions (your agency is working on these)</h3>
        <div className="space-y-2">
          {[
            { p: 'High', title: 'Wikipedia entry for founder', status: 'In progress' },
            { p: 'High', title: 'hipages profile photos', status: 'Scheduled this week' },
            { p: 'Medium', title: 'FAQ schema additions', status: 'Awaiting your approval' },
          ].map((a, i) => (
            <div key={i} className="px-3 py-2.5 rounded-md flex items-center gap-3"
                 style={{ border: '1px solid var(--border-subtle)' }}>
              <Badge tone={a.p === 'High' ? 'danger' : 'warning'}>{a.p}</Badge>
              <div className="flex-1 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{a.title}</div>
              <Badge tone="info">{a.status}</Badge>
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-8 text-[11px] text-center" style={{ color: 'var(--text-tertiary)' }}>
        Powered by Your Agency · Privacy · Contact Your Agency
      </div>
    </div>
  </div>
);

const WhiteLabelReport = (props) => (
  <PageShell {...props} breadcrumbs={['Agency', 'Reports', 'PDF builder']}>
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>White-label PDF report builder</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Branded report for client. No VisibleAU mentions, your colors and logo.</p>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-4">
          <Card className="p-5">
            <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Branding</h3>
            <div className="space-y-3">
              <Input label="Agency name" value="Your Agency" />
              <Input label="Logo URL" placeholder="https://..." />
              <Input label="Primary color" value="#7c3aed" />
              <Input label="Footer contact" value="hello@youragency.com.au" />
            </div>

            <h3 className="text-sm font-semibold mb-3 mt-6" style={{ color: 'var(--text-primary)' }}>Sections to include</h3>
            <div className="space-y-2">
              {['Executive summary', 'Visibility scorecard', 'Per-engine breakdown', 'Action plan', 'Methodology appendix'].map((s, i) => (
                <label key={i} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" defaultChecked={i < 4} />
                  <span style={{ color: 'var(--text-secondary)' }}>{s}</span>
                </label>
              ))}
            </div>

            <Btn variant="primary" className="w-full mt-6" icon={Download}>Generate PDF</Btn>
          </Card>
        </div>
        <div className="col-span-8">
          <Card>
            <div className="px-5 py-3 border-b text-center text-[11px] uppercase tracking-wider"
                 style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-tertiary)' }}>
              Preview · A4 page 1 of 4
            </div>
            <div className="p-8 m-4 rounded-md"
                 style={{ background: 'white', minHeight: '500px', boxShadow: 'var(--shadow-pop)' }}>
              <div className="flex items-center gap-3 mb-8 pb-4" style={{ borderBottom: '2px solid #7c3aed' }}>
                <div className="w-10 h-10 rounded-md flex items-center justify-center text-base font-bold"
                     style={{ background: '#7c3aed', color: 'white' }}>YA</div>
                <div>
                  <div className="text-base font-bold" style={{ color: '#1a1a1a' }}>Your Agency</div>
                  <div className="text-[11px]" style={{ color: '#666' }}>AI Visibility Report</div>
                </div>
              </div>
              <h1 className="text-2xl font-bold mb-2" style={{ color: '#1a1a1a' }}>Bondi Plumbing</h1>
              <p className="text-sm mb-6" style={{ color: '#666' }}>AI Search Visibility Audit — May 2026</p>
              <h2 className="text-base font-bold mb-3" style={{ color: '#1a1a1a' }}>Executive summary</h2>
              <p className="text-[13px] mb-4" style={{ color: '#333' }}>
                Bondi Plumbing's AI search visibility improved from 68 to 73 this month (+5 points), driven by a 14% increase
                in ChatGPT mention rate and improved sentiment on Claude. Three high-priority actions remain to push past 80.
              </p>
              <h2 className="text-base font-bold mb-3 mt-6" style={{ color: '#1a1a1a' }}>Composite score</h2>
              <div className="text-4xl font-bold mb-2" style={{ color: '#7c3aed' }}>73<span className="text-base" style={{ color: '#666' }}>/100</span></div>
              <p className="text-[12px]" style={{ color: '#666' }}>Confidence interval: 68–78 (95%)</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  </PageShell>
);

const BulkOperations = (props) => (
  <PageShell {...props} breadcrumbs={['Agency', 'Bulk operations']}>
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Bulk operations</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Run actions across many brands at once. Save hours per week.</p>
      </div>

      <Card className="p-5 mb-4">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Step 1 — Select brands (12 of 23)</h3>
        <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto">
          {Array.from({ length: 23 }).map((_, i) => (
            <label key={i} className="flex items-center gap-2 px-3 py-2 rounded-md text-sm cursor-pointer"
                   style={{ border: '1px solid var(--border-subtle)' }}>
              <input type="checkbox" defaultChecked={i < 12} />
              <span style={{ color: 'var(--text-secondary)' }}>Brand {i + 1}</span>
            </label>
          ))}
        </div>
      </Card>

      <Card className="p-5 mb-4">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Step 2 — Choose action</h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { name: 'Run audits', desc: '12 audits × ~A$2.84 = A$34', icon: Activity, selected: true },
            { name: 'Generate client reports', desc: 'White-label PDF per brand', icon: FileText },
            { name: 'Export CSV', desc: 'All audits + actions', icon: Download },
            { name: 'Send portal access', desc: 'Email login link to client contacts', icon: Mail },
          ].map((a, i) => (
            <div key={i} className="p-4 rounded-md cursor-pointer"
                 style={{
                   border: `1.5px solid ${a.selected ? 'var(--accent-blue)' : 'var(--border-default)'}`,
                   background: a.selected ? 'var(--bg-elevated)' : 'transparent',
                 }}>
              <a.icon className="w-5 h-5 mb-2" style={{ color: 'var(--accent-blue)' }} />
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{a.name}</div>
              <div className="text-[12px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{a.desc}</div>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex items-center justify-between p-4 rounded-md"
           style={{ background: 'var(--bg-subtle)' }}>
        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text-primary)' }}>Estimated cost: A$34</strong> · Will charge to current billing period
        </div>
        <Btn variant="primary">Run for 12 brands</Btn>
      </div>
    </div>
  </PageShell>
);

/* ============================================================================
 *  SPRINT 10 — Onboarding (3 screens)
 *  Self-serve setup, sample audit, upgrade flow
 * ========================================================================= */

const SelfServeSetup = (props) => (
  <PageShell {...props} breadcrumbs={['Welcome']}>
    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="text-center mb-12">
        <h1 className="text-3xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Welcome to VisibleAU 👋</h1>
        <p className="text-base" style={{ color: 'var(--text-secondary)' }}>Let's get your first AI visibility audit running. Takes 3 minutes.</p>
      </div>

      <div className="space-y-3">
        {[
          { n: 1, title: 'Add your brand', desc: 'Domain + vertical pack', done: true, time: '30s' },
          { n: 2, title: 'Confirm AU details', desc: 'Suburbs, competitors', done: true, time: '1m' },
          // BG5 fix: corrected to explicit engine names and tier-aware timing
          { n: 3, title: 'Run your first free audit', desc: '2 engines (ChatGPT + Perplexity) × 10 prompts × 5 runs — ~2-3 min', current: true, time: '~2-3m' },
          { n: 4, title: 'See your visibility score', desc: 'Then unlock full paid features', time: '—' },
        ].map(s => (
          <Card key={s.n} className="p-5 flex items-center gap-4"
                style={{
                  borderColor: s.current ? 'var(--accent-blue)' : 'var(--border-subtle)',
                  borderWidth: s.current ? '2px' : '1px',
                  background: s.current ? 'var(--bg-elevated)' : 'transparent',
                }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
                 style={{
                   background: s.done ? 'var(--accent-green)' : s.current ? 'var(--accent-blue)' : 'var(--bg-subtle)',
                   color: s.done || s.current ? 'white' : 'var(--text-tertiary)',
                 }}>
              {s.done ? <CheckCircle2 className="w-4 h-4" /> : s.n}
            </div>
            <div className="flex-1">
              <div className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{s.title}</div>
              <div className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>{s.desc}</div>
            </div>
            <div className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>{s.time}</div>
            {/* U4 fix: post-signup users go to brand-wizard to create brand and run first Free-tier audit.
                 Sample audit is pre-signup only (PRD §7 Principle #6: "No account required"). */}
            {s.current && <Btn variant="primary" size="sm" onClick={() => props.onNav('brand-wizard')}>Start</Btn>}
          </Card>
        ))}
      </div>

      <div className="mt-8 text-center text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
        Skip the tour and explore freely — <a className="underline cursor-pointer" onClick={() => props.onNav('dashboard')}>go to dashboard</a>
      </div>
    </div>
  </PageShell>
);

const SampleAudit = (props) => (
  <PageShell {...props} breadcrumbs={['Welcome', 'Sample audit']}>
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-8">
        <Badge tone="info">Free sample · No card required</Badge>
        <h1 className="text-2xl font-semibold mt-2 mb-1" style={{ color: 'var(--text-primary)' }}>Your sample visibility score</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Bondi Plumbing · ChatGPT only · 5 prompts · ran in 1m 28s (~90s typical)</p>
      </div>

      <Card className="p-6 mb-4">
        <div className="text-center py-6">
          <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>Sample composite score</div>
          <div className="text-6xl font-bold mb-3" style={{ color: 'var(--accent-blue)' }}>62</div>
          <Badge tone="info">Limited preview · 1 of 4 engines tested</Badge>
        </div>
      </Card>

      <Card className="p-5 mb-4">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>What the sample found</h3>
        <div className="space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {[
            'You were mentioned in 3 of 5 ChatGPT responses (60% mention rate)',
            'Average mention position: 3rd in lists',
            'Sentiment was positive in 2 of 3 mentions',
            'Eastern Plumbing Co was mentioned alongside you 2 times',
          ].map((f, i) => (
            <div key={i} className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--accent-green)' }} />
              <span>{f}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6 text-center"
            style={{ background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(139, 92, 246, 0.08))' }}>
        <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Want the full picture?</h3>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          {/* V3 fix: "2 engines × 100 calls" was wrong. PRD §7 canonical: Free = 2 engines × 20 prompts × 1 run = 40 calls/audit. */}
          Sample is ChatGPT only. Paid audits cover 4 engines × 10 prompts × 5 runs = 200 LLM calls with confidence intervals + Action Center. Free accounts (post-signup) run 2 engines × 20 prompts × 1 run = 40 calls.
        </p>
        <div className="flex justify-center gap-2">
          <Btn variant="primary" size="lg" onClick={() => props.onNav('upgrade')}>Upgrade to Starter — A$99/mo</Btn>
          <Btn variant="secondary" size="lg" onClick={() => props.onNav('pricing')}>See all plans</Btn>
        </div>
      </Card>
    </div>
  </PageShell>
);

const UpgradeFlow = (props) => (
  <PageShell {...props} breadcrumbs={['Upgrade']}>
    {/* GF4 fix: Sprint 9 spec says "Stripe billing for Agency upgrades = Sprint 10 scope".
        This prototype shows the target state. Sprint 9 ships the UI shell only —
        the Stripe checkout integration, webhook handlers, and tier-change logic ship in Sprint 10.
        The "Upgrade" button in Sprint 9 shows "Coming soon" or opens a Calendly/email link.
        HF5 fix: prototype hard-codes "Upgrade to Starter" but the real upgrade/page.tsx is
        tier-agnostic — receives ?tier=starter|growth|agency via URL param and renders
        the appropriate PricingCard (HF3) with that tier's TIER_METADATA. The Starter
        example here (A$90+GST=A$99) is correct per PRD §7 and HC2 displayPrice math. */}
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Upgrade to Starter</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Unlock 4-engine audits, Action Center, and weekly auto-refresh.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Order summary</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>Starter plan (ex. GST)</span><span style={{ color: 'var(--text-primary)' }}>A$90.00/mo</span></div>
            <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>GST (10%)</span><span style={{ color: 'var(--text-primary)' }}>A$9.00</span></div>
            <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>1 brand included</span><span style={{ color: 'var(--text-primary)' }}>—</span></div>
            <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>4 audits/month</span><span style={{ color: 'var(--text-primary)' }}>—</span></div>
            <div className="flex justify-between text-[12px]" style={{ color: 'var(--text-tertiary)' }}><span>Billed monthly · cancel any time</span><span></span></div>
            <div className="border-t pt-2 mt-3 flex justify-between font-semibold" style={{ borderColor: 'var(--border-subtle)' }}>
              <span style={{ color: 'var(--text-primary)' }}>Today's charge (incl. GST)</span>
              <span style={{ color: 'var(--text-primary)' }}>A$99.00</span>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>What's included</h3>
          <div className="space-y-2 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
            {[
              'All 4 LLM engines (ChatGPT, Claude, Gemini, Perplexity)',
              '4 audits/month with weekly auto-refresh',
              'Multidimensional scoring + confidence intervals',
              'Action Center with research citations',
              'Drift detection alerts',
              'Email support',
            ].map((b, i) => (
              <div key={i} className="flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: 'var(--accent-green)' }} />
                <span>{b}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* U3 fix: Sprint 10 canonical is "Stripe Checkout for paid tiers" (redirect to Stripe-hosted).
          A custom card form (card number, CVC, expiry) would require PCI DSS compliance and is
          explicitly NOT what Sprint 10 ships. The real app calls createCheckoutSession() and redirects.
          This prototype shows the pre-redirect confirmation step (what the user sees before being
          sent to Stripe's hosted checkout page). */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Secure checkout via Stripe</h3>
        <div className="flex items-center gap-3 p-4 rounded-lg mb-4" style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)' }}>
          <Shield className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--accent-green)' }} />
          <div>
            <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Redirects to Stripe's hosted payment page</div>
            <div className="text-[12px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>Your card details are entered directly on Stripe's PCI DSS–certified servers. VisibleAU never sees your card number.</div>
          </div>
        </div>
        <Btn variant="primary" size="lg" className="w-full mt-2" onClick={() => props.onNav('dashboard')}>Continue to Stripe — A$99/mo</Btn>
        <p className="text-[11px] text-center mt-3" style={{ color: 'var(--text-tertiary)' }}>
          Secure payment via Stripe · Cancel any time · Annual billing saves 2 months (16% off)
        </p>
      </Card>
    </div>
  </PageShell>
);

/* ============================================================================
 *  SPRINT 11 — Marketing (3 screens)
 *  Landing v2, methodology, docs hub
 * ========================================================================= */

const LandingV2 = (props) => (
  <div data-theme={props.theme} style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
    {/* HK4 fix: Sprint 10 §1 says "landing page = Sprint 11 scope".
        LandingV2 shows the target state but is NOT shipped in Sprint 10.
        Sprint 10 ships: /sample-audit, /pricing, /settings/billing.
        Sprint 11 ships: the full landing page with marketing copy + LandingV2. */}
    <PublicNav theme={props.theme} setTheme={props.setTheme} onNav={props.onNav} />

    <div className="max-w-6xl mx-auto px-6 pt-16 pb-12 text-center">
      <Badge tone="info">For Australian businesses</Badge>
      <h1 className="text-5xl font-bold mt-4 mb-4" style={{ color: 'var(--text-primary)' }}>
        Find out how often AI mentions your business
      </h1>
      <p className="text-lg max-w-2xl mx-auto mb-6" style={{ color: 'var(--text-secondary)' }}>
        VisibleAU runs your brand through ChatGPT, Claude, Gemini, and Perplexity — then tells you what to fix to get mentioned more often.
      </p>
      <div className="flex justify-center gap-2">
        <Btn variant="primary" size="lg" onClick={() => props.onNav('signup')}>Get a free sample audit</Btn>
        <Btn variant="secondary" size="lg" onClick={() => props.onNav('pricing')}>See pricing</Btn>
      </div>
      <div className="mt-3 text-[12px]" style={{ color: 'var(--text-tertiary)' }}>No card required for sample · 90 seconds</div>
    </div>

    <div className="max-w-6xl mx-auto px-6 py-12">
      <div className="grid grid-cols-3 gap-4">
        {/* AA6 fix: "40% of search traffic" was a customer testimonial misrepresented as a market stat.
            "4× Wikipedia" was invented — not in PRD. PRD canonical sourced stats are:
            - 70% AI-cited domain churn: PRD §10A (keep)
            - Wikipedia 47.9% of ChatGPT top-10 citations: Tinuiti Q1 2026 (PRD line 871)
            Replaced unsourced claims with two PRD-backed metrics. */}
        {[
          { metric: '47.9%', desc: 'of ChatGPT top-10 citations go to Wikipedia — being there is the highest-leverage single move', source: 'Tinuiti Q1 2026' },
          { metric: '70%', desc: 'of AI-cited domains churn within 6 months — your ranking today is not your ranking next month', source: 'PRD §10A' },
          { metric: '4–6 min', desc: 'per full AU audit — 4 engines × 10 prompts × 5 runs = 200 real LLM calls with Wilson CIs', source: 'Sprint 3 spec' },
        ].map((s, i) => (
          <Card key={i} className="p-6 text-center">
            <div className="text-3xl font-bold mb-1" style={{ color: 'var(--accent-blue)' }}>{s.metric}</div>
            <div className="text-[13px] mb-1" style={{ color: 'var(--text-secondary)' }}>{s.desc}</div>
            <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>Source: {s.source}</div>
          </Card>
        ))}
      </div>
    </div>

    <div className="max-w-6xl mx-auto px-6 py-12">
      <h2 className="text-3xl font-bold mb-8 text-center" style={{ color: 'var(--text-primary)' }}>How it works</h2>
      <div className="grid grid-cols-3 gap-6">
        {[
          { n: 1, title: 'Add your brand', desc: 'Domain + AU vertical pack. 30 seconds.' },
          { n: 2, title: 'We run real audits', desc: 'Up to 200 LLM calls across 4 engines (Free tier: 40 calls — 2 engines × 20 prompts × 1 run). Real data, real prompts, real responses.' },
          { n: 3, title: 'Get prioritised actions', desc: 'Top 5 things to fix — backed by GEO research. Not vague suggestions.' },
        ].map(s => (
          <div key={s.n}>
            <div className="w-10 h-10 rounded-md flex items-center justify-center text-base font-bold mb-3"
                 style={{ background: 'var(--accent-blue)', color: 'white' }}>{s.n}</div>
            <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{s.title}</h3>
            <p className="text-[14px]" style={{ color: 'var(--text-secondary)' }}>{s.desc}</p>
          </div>
        ))}
      </div>
    </div>

    <div className="max-w-6xl mx-auto px-6 py-12">
      <h2 className="text-3xl font-bold mb-8 text-center" style={{ color: 'var(--text-primary)' }}>Built for AU businesses</h2>
      <div className="grid grid-cols-2 gap-4">
        {[
          { title: 'AU-tuned prompts', desc: 'Suburb-level visibility. AU directories (hipages, Yellow Pages AU, ServiceSeeking, Word of Mouth). Not US-centric.' },
          { title: 'Vertical packs', desc: 'Tradies, SaaS, Allied Health in v1. Professional Services and Real Estate in v1.1. Each pack with hundreds of vertical-specific prompts.' },
          { title: 'Research-backed actions', desc: 'Every recommendation cites a study. Princeton GEO, SE Ranking, Tinuiti effect-size data.' },
          { title: 'Anti-pattern filter', desc: "We never recommend buying backlinks, fake reviews, or AI-generated SEO content. Quality over volume." },
        ].map((f, i) => (
          <Card key={i} className="p-5">
            <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{f.title}</h3>
            <p className="text-[14px]" style={{ color: 'var(--text-secondary)' }}>{f.desc}</p>
          </Card>
        ))}
      </div>
    </div>

    <div className="max-w-4xl mx-auto px-6 py-16 text-center">
      <h2 className="text-2xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Find out where you stand</h2>
      <p className="text-base mb-6" style={{ color: 'var(--text-secondary)' }}>Free sample audit. No card required. 90 seconds.</p>
      <Btn variant="primary" size="lg" onClick={() => props.onNav('signup')}>Get my free sample</Btn>
    </div>
  </div>
);

const MethodologyPage = (props) => (
  <div data-theme={props.theme} style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
    <PublicNav theme={props.theme} setTheme={props.setTheme} onNav={props.onNav} />

    <div className="max-w-3xl mx-auto px-6 py-12">
      <div className="mb-8">
        <Badge tone="info">Public methodology</Badge>
        <h1 className="text-4xl font-bold mt-2 mb-3" style={{ color: 'var(--text-primary)' }}>How VisibleAU measures AI visibility</h1>
        <p className="text-base" style={{ color: 'var(--text-secondary)' }}>
          Full transparency. Every score is reproducible. No black-box claims.
        </p>
      </div>

      <Card className="p-6 mb-4">
        <h2 className="text-xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>What we measure</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          5 dimensions per audit, weighted to a composite 0-100 score:
        </p>
        <div className="space-y-2 text-[14px]">
          {[
            { dim: 'Frequency', weight: '25%', desc: 'How often the brand is mentioned across prompts' },
            { dim: 'Position', weight: '25%', desc: 'Where in the response (1st mentioned weights higher)' },
            { dim: 'Sentiment', weight: '20%', desc: 'Tone of mention (positive/neutral/negative)' },
            { dim: 'Context', weight: '15%', desc: 'How (recommendation vs listing vs commodity)' },
            { dim: 'Accuracy', weight: '15%', desc: 'Whether facts about the brand are correct' },
          ].map(d => (
            <div key={d.dim} className="px-3 py-2 rounded-md flex items-start gap-3"
                 style={{ background: 'var(--bg-subtle)' }}>
              <span className="font-semibold w-24" style={{ color: 'var(--text-primary)' }}>{d.dim}</span>
              <Badge tone="neutral">{d.weight}</Badge>
              <span style={{ color: 'var(--text-secondary)' }}>{d.desc}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6 mb-4">
        <h2 className="text-xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>How we run audits</h2>
        <ol className="space-y-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <li><strong style={{ color: 'var(--text-primary)' }}>1. Up to 4 engines:</strong> Paid tiers query ChatGPT (gpt-4o-mini), Claude (3.5 Haiku), Gemini (1.5 Flash), Perplexity (Sonar). Free tier queries ChatGPT + Perplexity only. Real production APIs — exact model versions per the tier-aware model selector.</li>
          <li><strong style={{ color: 'var(--text-primary)' }}>2. 10 prompts:</strong> Drawn from your AU vertical pack. Suburb-aware, vertical-specific.</li>
          <li><strong style={{ color: 'var(--text-primary)' }}>3. 5 runs each:</strong> Same prompt run 5 times to measure variance.</li>
          <li><strong style={{ color: 'var(--text-primary)' }}>4. Confidence intervals:</strong> Wilson 95% CI on each dimension. We show ranges, not point estimates.</li>
          <li><strong style={{ color: 'var(--text-primary)' }}>5. Total: up to 200 LLM calls per paid-tier audit (100 for Free).</strong> Cost ~A$2-3 paid, ~A$1.50 Free.</li>
        </ol>
      </Card>

      <Card className="p-6 mb-4">
        <h2 className="text-xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>How we generate recommendations</h2>
        <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
          Every action in the Action Center cites at least one source. We draw from:
        </p>
        <div className="space-y-1.5 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
          {[
            'Allen et al. (2024). "GEO: Generative Engine Optimization." Princeton.',
            'SE Ranking. "Citation Source Analysis Across LLMs" (Q4 2024).',
            'Tinuiti. "AI Search Effect-Size Analysis" (Q4 2024).',
            'Machine Relations. Citation drift research.',
            'AU vertical pack patterns (proprietary, derived from real audits).',
          ].map((s, i) => (
            <div key={i} className="flex items-start gap-2">
              <FileText className="w-3 h-3 mt-1 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
              <span>{s}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>What we don't do</h2>
        <div className="space-y-2 text-sm">
          {[
            'Recommend buying backlinks, fake reviews, or PBNs',
            'Use synthetic prompts to inflate dataset size',
            'Hide our methodology behind black-box claims',
            'Promise specific score improvements (we give ranges with confidence)',
          ].map((d, i) => (
            <div key={i} className="flex items-start gap-2" style={{ color: 'var(--text-secondary)' }}>
              <X className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--accent-red)' }} />
              <span>{d}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6 mt-6">
        <h2 className="text-xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Add a VisibleAU badge to your README</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          Free public endpoint returns an SVG visibility score badge for any AU domain. Cached 1 hour. Embed in your GitHub README, marketing site, or pitch deck.
        </p>
        <div className="space-y-3">
          <div>
            <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>Endpoint</div>
            <pre className="text-[12px] p-3 rounded-md font-mono overflow-x-auto" style={{ background: 'var(--bg-subtle)', color: 'var(--accent-blue)' }}>https://visibleau.com.au/badge?domain=bondiplumbing.com.au</pre>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>Markdown</div>
            <pre className="text-[12px] p-3 rounded-md font-mono overflow-x-auto" style={{ background: 'var(--bg-subtle)', color: 'var(--text-secondary)' }}>![VisibleAU score](https://visibleau.com.au/badge?domain=bondiplumbing.com.au)</pre>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <div className="px-3 py-1 rounded-md text-[11px] font-mono flex items-center gap-1.5" style={{ background: 'var(--accent-green)', color: 'white' }}>
              <span>VisibleAU</span><span style={{ opacity: 0.5 }}>|</span><span>71</span>
            </div>
            <span className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>← preview: green (68-85 Good)</span>
          </div>
          <div className="text-[11px] mt-2" style={{ color: 'var(--text-tertiary)' }}>
            Bands: <span style={{ color: 'var(--accent-green)' }}>86-100 Excellent</span> · <span style={{ color: 'var(--accent-blue)' }}>68-85 Good</span> · <span style={{ color: 'var(--accent-amber)' }}>36-67 Foundation</span> · <span style={{ color: 'var(--accent-red)' }}>0-35 Critical</span>
          </div>
        </div>
      </Card>
    </div>
  </div>
);

const DocsHub = (props) => (
  <div data-theme={props.theme} style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
    <PublicNav theme={props.theme} setTheme={props.setTheme} onNav={props.onNav} />

    <div className="max-w-6xl mx-auto px-6 py-12">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Documentation</h1>
        <p className="text-base" style={{ color: 'var(--text-secondary)' }}>Everything you need to get value from VisibleAU.</p>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-3">
          <Card className="p-3">
            {[
              { group: 'Getting started', items: ['Quick start', 'First audit', 'Understanding scores'] },
              { group: 'Features', items: ['Action Center', 'Vertical packs', 'Local SEO', 'Drift alerts', 'White-label'] },
              { group: 'API', items: ['Authentication', 'Endpoints', 'Webhooks'] },
              { group: 'Resources', items: ['Methodology', 'Research index', 'Changelog'] },
            ].map((g, i) => (
              <div key={i} className="mb-4">
                <div className="text-[10px] uppercase tracking-wider mb-2 px-3" style={{ color: 'var(--text-tertiary)' }}>{g.group}</div>
                {g.items.map((item, j) => (
                  <div key={j} className="px-3 py-1.5 rounded-md text-sm cursor-pointer hover:bg-opacity-50"
                       style={{ color: 'var(--text-secondary)' }}>{item}</div>
                ))}
              </div>
            ))}
          </Card>
        </div>
        <div className="col-span-9">
          <Card className="p-8">
            <h1 className="text-3xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Quick start</h1>
            <p className="text-base mb-6" style={{ color: 'var(--text-secondary)' }}>
              Get your first AI visibility audit in under 5 minutes.
            </p>

            <h2 className="text-xl font-bold mb-3 mt-8" style={{ color: 'var(--text-primary)' }}>1. Create your account</h2>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              Sign up with email — no credit card required for the sample audit. We'll send you a welcome email with next steps.
            </p>

            <h2 className="text-xl font-bold mb-3 mt-8" style={{ color: 'var(--text-primary)' }}>2. Add your first brand</h2>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              You'll be asked for your domain, vertical pack, and primary suburbs. The vertical pack determines which prompts we use.
            </p>
            <div className="p-3 rounded-md text-[13px] flex items-start gap-2"
                 style={{ background: 'rgba(59, 130, 246, 0.1)', color: 'var(--text-secondary)' }}>
              <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: 'var(--accent-blue)' }} />
              <span><strong>Tip:</strong> If your business is multi-vertical (e.g., plumbing + electrical), pick the dominant vertical for your first audit. You can add more brands later.</span>
            </div>

            <h2 className="text-xl font-bold mb-3 mt-8" style={{ color: 'var(--text-primary)' }}>3. Run your first audit</h2>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              Click "Run audit" on the brand detail page. The audit runs through 4 LLM engines × 10 prompts × 5 runs (200 calls total). Takes 3-5 minutes. Cost: ~A$2-3.
            </p>

            <h2 className="text-xl font-bold mb-3 mt-8" style={{ color: 'var(--text-primary)' }}>4. Read your visibility scorecard</h2>
            <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
              You'll get a 0-100 composite score plus 5 dimension breakdowns. Each dimension shows a confidence interval — that's the range we're 95% sure your true score sits in.
            </p>

            <h2 className="text-xl font-bold mb-3 mt-8" style={{ color: 'var(--text-primary)' }}>5. Action Center</h2>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              The Action Center shows your top 5 prioritised actions, each with research citations and an estimated point impact. Start with the highest-priority items.
            </p>
          </Card>
        </div>
      </div>
    </div>
  </div>
);

/* ============================================================================
 *  SPRINT 12 — Launch (2 screens)
 *  Beta feedback widget, launch checklist
 * ========================================================================= */

const BetaFeedback = (props) => (
  <PageShell {...props} breadcrumbs={['Workspace', 'Feedback']}>
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="mb-8">
        <Badge tone="info">Beta program</Badge>
        <h1 className="text-2xl font-semibold mt-2 mb-1" style={{ color: 'var(--text-primary)' }}>How is VisibleAU working for you?</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>You're one of 8 beta customers. Your feedback shapes what we build before public launch.</p>
      </div>

      <Card className="p-6 mb-4">
        <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>How likely are you to recommend VisibleAU?</h3>
        <div className="grid grid-cols-11 gap-1.5 mb-3">
          {Array.from({ length: 11 }).map((_, i) => (
            <button key={i} className="aspect-square rounded-md text-sm font-semibold transition"
                    style={{
                      border: '1px solid var(--border-default)',
                      background: i === 9 ? 'var(--accent-blue)' : 'transparent',
                      color: i === 9 ? 'white' : 'var(--text-primary)',
                    }}>{i}</button>
          ))}
        </div>
        <div className="flex justify-between text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
          <span>Not at all</span><span>Extremely</span>
        </div>
      </Card>

      <Card className="p-6 mb-4">
        <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>What's working well?</h3>
        <textarea className="w-full p-3 rounded-md text-sm" rows="3" placeholder="The Action Center recommendations are way more concrete than..."
                  style={{
                    background: 'var(--bg-subtle)', border: '1px solid var(--border-default)',
                    color: 'var(--text-primary)', resize: 'vertical',
                  }} />

        <h3 className="text-sm font-semibold mb-3 mt-5" style={{ color: 'var(--text-primary)' }}>What's not working?</h3>
        <textarea className="w-full p-3 rounded-md text-sm" rows="3" placeholder="The audit takes too long when..."
                  style={{
                    background: 'var(--bg-subtle)', border: '1px solid var(--border-default)',
                    color: 'var(--text-primary)', resize: 'vertical',
                  }} />

        <h3 className="text-sm font-semibold mb-3 mt-5" style={{ color: 'var(--text-primary)' }}>What would make you 10x more likely to keep using VisibleAU?</h3>
        <textarea className="w-full p-3 rounded-md text-sm" rows="3" placeholder="If I could schedule audits to run every Monday and email me..."
                  style={{
                    background: 'var(--bg-subtle)', border: '1px solid var(--border-default)',
                    color: 'var(--text-primary)', resize: 'vertical',
                  }} />
      </Card>

      <div className="flex justify-end gap-2">
        <Btn variant="secondary">Skip for now</Btn>
        <Btn variant="primary">Submit feedback</Btn>
      </div>

      <div className="mt-6 text-[12px] text-center" style={{ color: 'var(--text-tertiary)' }}>
        Want a 30-min call to dig deeper? <a className="underline cursor-pointer" style={{ color: 'var(--accent-blue)' }}>Book a slot</a>
      </div>
    </div>
  </PageShell>
);

const LaunchChecklist = (props) => (
  <PageShell {...props} breadcrumbs={['Internal', 'Launch readiness']}>
    {/* HH4 fix: Sprint 10 §1 says "Out of scope: launch readiness (Sprint 12)".
        This prototype shows the Sprint 12 target state — an internal admin tool
        for Sri to track launch readiness across Engineering/Product/Marketing.
        Sprint 10 does NOT ship this screen. Sprint 12 ships it. */}
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-8">
        <Badge tone="warning">Internal · Launch checklist</Badge>
        <h1 className="text-2xl font-semibold mt-2 mb-1" style={{ color: 'var(--text-primary)' }}>Launch readiness</h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>32 of 47 items complete · target launch: 1 June 2026</p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Engineering</div>
          <div className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>14 / 18</div>
          <div className="h-1 rounded-full mt-2" style={{ background: 'var(--bg-subtle)' }}>
            <div className="h-full rounded-full" style={{ width: '78%', background: 'var(--accent-green)' }} />
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>Product</div>
          <div className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>11 / 14</div>
          <div className="h-1 rounded-full mt-2" style={{ background: 'var(--bg-subtle)' }}>
            <div className="h-full rounded-full" style={{ width: '79%', background: 'var(--accent-green)' }} />
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-tertiary)' }}>GTM</div>
          <div className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>7 / 15</div>
          <div className="h-1 rounded-full mt-2" style={{ background: 'var(--bg-subtle)' }}>
            <div className="h-full rounded-full" style={{ width: '47%', background: 'var(--accent-amber)' }} />
          </div>
        </Card>
      </div>

      <Card>
        <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Open items</h3>
        </div>
        <div className="divide-y" style={{ borderColor: 'var(--border-subtle)' }}>
          {[
            { area: 'GTM', item: 'Write ProductHunt launch post', priority: 'high', owner: 'Sri' },
            { area: 'GTM', item: 'IndieHackers article ready', priority: 'high', owner: 'Sri' },
            { area: 'GTM', item: 'AU community announcements (BizSec, Sydney Founders)', priority: 'high', owner: 'Sri' },
            { area: 'Engineering', item: 'Sentry error monitoring configured', priority: 'high', owner: 'Sri' },
            { area: 'Engineering', item: 'Production DB backup strategy verified', priority: 'high', owner: 'Sri' },
            { area: 'Product', item: 'Onboarding flow tested with 3 non-technical AU users', priority: 'medium', owner: 'Sri' },
            { area: 'Engineering', item: 'Load test: 100 concurrent audits', priority: 'medium', owner: 'Sri' },
            { area: 'Engineering', item: 'Postgres connection pool tuning', priority: 'medium', owner: 'Sri' },
            { area: 'GTM', item: 'Pricing page final copy review', priority: 'low', owner: 'Sri' },
            { area: 'GTM', item: 'Twitter/LinkedIn launch graphics', priority: 'low', owner: 'Sri' },
          ].map((c, i) => (
            <div key={i} className="px-5 py-3 flex items-center gap-3">
              <input type="checkbox" className="cursor-pointer" />
              <Badge tone={c.priority === 'high' ? 'danger' : c.priority === 'medium' ? 'warning' : 'neutral'}>{c.priority}</Badge>
              <Badge tone="info">{c.area}</Badge>
              <div className="flex-1 text-sm" style={{ color: 'var(--text-primary)' }}>{c.item}</div>
              <div className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>{c.owner}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  </PageShell>
);

/* ============================================================================
 *  ROOT — page router
 * ========================================================================= */
const screens = [
  { group: 'Public (Sprint 1)', items: [
    { id: 'landing', label: 'Landing page' },
    { id: 'signin', label: 'Sign in' },
    { id: 'signup', label: 'Sign up' },
    { id: 'pricing', label: 'Pricing' },
  ]},
  { group: 'App (Sprint 1)', items: [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'brand-list', label: 'Brand list' },
    { id: 'brand-create', label: 'Brand create' },
    { id: 'brand-detail', label: 'Brand detail' },
  ]},
  { group: 'Audit flow (Sprint 2)', items: [
    { id: 'audit-running', label: 'Audit running' },
    { id: 'audit-results-basic', label: 'Audit results (basic)' },
  ]},
  { group: 'Rich insights (Sprint 3)', items: [
    { id: 'audit-results-rich', label: 'Audit results (rich)' },
  ]},
  { group: 'Dashboard UI (Sprint 4)', items: [
    { id: 'portfolio', label: 'Portfolio overview' },
    { id: 'brand-wizard', label: 'Brand setup wizard' },
    { id: 'audit-list', label: 'Audit list' },
    { id: 'audit-compare', label: 'Audit compare' },
  ]},
  { group: 'Vertical packs (Sprint 5)', items: [
    { id: 'vertical-pack-browser', label: 'Pack browser' },
    { id: 'vertical-pack-detail', label: 'Pack detail (Tradies)' },
    { id: 'prompt-library-editor', label: 'Prompt editor' },
  ]},
  { group: 'Action Center (Sprint 6)', items: [
    { id: 'action-center', label: 'Action Center' },
    { id: 'action-detail', label: 'Action detail' },
    { id: 'anti-pattern-settings', label: 'Anti-pattern filter' },
  ]},
  { group: 'Technical infra (Sprint 7)', items: [
    { id: 'llms-txt', label: 'llms.txt generator' },
    { id: 'schema-auditor', label: 'Schema auditor' },
    { id: 'ssr-check', label: 'SSR check' },
    { id: 'answer-capsules', label: 'Answer capsules' },
    { id: 'robots-txt', label: 'robots.txt + AI crawlers' },
    { id: 'brand-entity', label: 'Brand & Entity audit (AU)' },
    { id: 'citability-methods', label: '47 citability methods' },
  ]},
  { group: 'Local SEO + alerts (Sprint 8)', items: [
    { id: 'local-seo', label: 'Local SEO dashboard' },
    { id: 'directory-presence', label: 'AU directories' },
    { id: 'drift-alerts', label: 'Drift alerts' },
    { id: 'webhook-settings', label: 'Webhook settings' },
    { id: 'alert-history', label: 'Alert history' },
  ]},
  { group: 'Agency tier (Sprint 9)', items: [
    { id: 'agency-dashboard', label: 'Agency dashboard' },
    { id: 'client-portal', label: 'Client portal (white-label)' },
    { id: 'white-label-report', label: 'PDF report builder' },
    { id: 'bulk-operations', label: 'Bulk operations' },
  ]},
  { group: 'Onboarding (Sprint 10)', items: [
    { id: 'self-serve-setup', label: 'Self-serve setup' },
    { id: 'sample-audit', label: 'Sample audit (free)' },
    { id: 'upgrade', label: 'Upgrade flow' },
  ]},
  { group: 'Marketing (Sprint 11)', items: [
    { id: 'landing-v2', label: 'Landing v2' },
    { id: 'methodology', label: 'Methodology page' },
    { id: 'docs', label: 'Documentation hub' },
  ]},
  { group: 'Launch (Sprint 12)', items: [
    { id: 'beta-feedback', label: 'Beta feedback' },
    { id: 'launch-checklist', label: 'Launch checklist (internal)' },
  ]},
];

export default function App() {
  // Theme persistence note for production:
  //   In Sprint 1, the real Next.js app reads from localStorage on mount and writes on change:
  //     useEffect(() => {
  //       const saved = localStorage.getItem('theme');
  //       if (saved === 'dark' || saved === 'light') setTheme(saved);
  //     }, []);
  //     useEffect(() => { localStorage.setItem('theme', theme); }, [theme]);
  //   This artifact uses plain useState (browser storage APIs are blocked in artifacts).
  const [theme, setTheme] = useState('dark');
  const [page, setPage] = useState('landing');
  const [showNav, setShowNav] = useState(true);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const nav = (id) => setPage(id);
  const props = { theme, setTheme, current: page, onNav: nav };

  const pages = {
    // Sprint 1
    'landing': <Landing {...props} />,
    'signin': <SignIn {...props} />,
    'signup': <SignUp {...props} />,
    'pricing': <Pricing {...props} />,
    'dashboard': <Dashboard {...props} />,
    'brand-list': <BrandList {...props} />,
    'brand-create': <BrandCreate {...props} />,
    'brand-detail': <BrandDetail {...props} />,
    // Sprint 2
    'audit-running': <AuditRunning {...props} />,
    'audit-results-basic': <AuditResultsBasic {...props} />,
    // Sprint 3
    'audit-results-rich': <AuditResultsRich {...props} />,
    // Sprint 4
    'portfolio': <PortfolioOverview {...props} />,
    'brand-wizard': <BrandSetupWizard {...props} />,
    'audit-list': <AuditList {...props} />,
    'audit-compare': <AuditCompare {...props} />,
    // Sprint 5
    'vertical-pack-browser': <VerticalPackBrowser {...props} />,
    'vertical-pack-detail': <VerticalPackDetail {...props} />,
    'prompt-library-editor': <PromptLibraryEditor {...props} />,
    // Sprint 6
    'action-center': <ActionCenter {...props} />,
    'action-detail': <ActionDetail {...props} />,
    'anti-pattern-settings': <AntiPatternSettings {...props} />,
    // Sprint 7
    'llms-txt': <LlmsTxtGenerator {...props} />,
    'schema-auditor': <SchemaAuditor {...props} />,
    'ssr-check': <SsrCheck {...props} />,
    'answer-capsules': <AnswerCapsuleFormatter {...props} />,
    'robots-txt': <RobotsTxtCrawlerConfig {...props} />,
    'brand-entity': <BrandEntityAudit {...props} />,
    'citability-methods': <CitabilityMethodsReference {...props} />,
    // Sprint 8
    'local-seo': <LocalSeoDashboard {...props} />,
    'directory-presence': <DirectoryPresence {...props} />,
    'drift-alerts': <DriftAlerts {...props} />,
    'webhook-settings': <WebhookSettings {...props} />,
    'alert-history': <AlertHistory {...props} />,
    // Sprint 9
    'agency-dashboard': <AgencyDashboard {...props} />,
    'client-portal': <ClientPortal {...props} />,
    'white-label-report': <WhiteLabelReport {...props} />,
    'bulk-operations': <BulkOperations {...props} />,
    // Sprint 10
    'self-serve-setup': <SelfServeSetup {...props} />,
    'sample-audit': <SampleAudit {...props} />,
    'upgrade': <UpgradeFlow {...props} />,
    // Sprint 11
    'landing-v2': <LandingV2 {...props} />,
    'methodology': <MethodologyPage {...props} />,
    'docs': <DocsHub {...props} />,
    // Sprint 12
    'beta-feedback': <BetaFeedback {...props} />,
    'launch-checklist': <LaunchChecklist {...props} />,
  };

  return (
    <>
      <ThemeStyles />
      <div data-theme={theme} style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
        <div
          className="fixed bottom-4 right-4 z-[100] rounded-lg shadow-2xl"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-strong)',
            backdropFilter: 'blur(12px)',
            width: showNav ? '260px' : '44px',
            transition: 'width 0.2s ease',
            boxShadow: 'var(--shadow-pop)'
          }}
        >
          <button
            onClick={() => setShowNav(!showNav)}
            className="w-full h-11 px-3 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: 'var(--text-secondary)' }}
          >
            {showNav && <span className="flex items-center gap-1.5"><Layers className="w-3 h-3" /> Prototype screens</span>}
            <ChevronDown className="w-3.5 h-3.5" style={{ transform: showNav ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }} />
          </button>
          {showNav && (
            <div className="p-2 max-h-[60vh] overflow-y-auto scrollbar-thin border-t" style={{ borderColor: 'var(--border-subtle)' }}>
              {screens.map((g, gi) => (
                <div key={gi} className="mb-2">
                  <div className="text-[9px] uppercase tracking-wider px-2 py-1" style={{ color: 'var(--text-tertiary)' }}>{g.group}</div>
                  {g.items.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setPage(s.id)}
                      className="w-full text-left px-2 py-1.5 rounded text-[12px] cursor-pointer transition"
                      style={{
                        background: page === s.id ? 'var(--accent-blue)' : 'transparent',
                        color: page === s.id ? 'white' : 'var(--text-secondary)',
                        fontWeight: page === s.id ? 600 : 400,
                      }}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {pages[page] || pages['landing']}
      </div>
    </>
  );
}
