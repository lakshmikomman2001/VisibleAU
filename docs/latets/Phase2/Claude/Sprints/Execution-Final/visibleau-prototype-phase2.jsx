// ============================================================
// VisibleAU Phase 2 Prototype — v1.0
// Figma-style specification for Claude Code
// 9 Intelligence Layers · 35+ screens · Fully token-specified
//
// USAGE FOR CLAUDE CODE:
// Every section, component, spacing value, color token, icon name,
// and layout rule is written as an EXPLICIT INSTRUCTION.
// Do not infer from structure — implement exactly as written.
// CSS token references: var(--token-name) must be implemented as
// inline style={{ color: 'var(--token-name)' }} or as a Tailwind
// arbitrary value class where applicable.
//
// SPRINT MAPPING:
// Sprint 1 — Platform Foundation     (no UI)
// Sprint 2 — Workflow Intelligence    (screens: WF-1 to WF-4)
// Sprint 3 — Visibility Intelligence  (screens: VI-1 to VI-6)
// Sprint 4 — Communication           (screens: CM-1 to CM-4)
// Sprint 5 — Trust Intelligence      (screens: TR-1 to TR-6)
// Sprint 6 — Retrieval Intelligence  (screens: RT-1 to RT-4)
// Sprint 7 — Conversational Disc.    (screens: CD-1 to CD-3)
// Sprint 8 — Governance              (screens: GV-1 to GV-4)
// Sprint 9 — Autopilot UX            (screens: AP-1 to AP-4)
// ============================================================

import { useState } from "react";
import {
  LayoutDashboard, Building2, BookOpen, Zap,
  ChevronRight, ChevronDown, ChevronLeft, ArrowRight,
  X, Bell, Moon, SlidersHorizontal,
  Eye, Shield, Cpu, GitBranch, FileText, Users,
  Play, CheckCircle2, XCircle, AlertCircle, Clock,
  Plus, Edit3, Trash2, Download, Share2,
  TrendingUp, TrendingDown, Activity, Target, Layers, Award,
  Sparkles, Mail, BookMarked, Link2, Globe, Video, Linkedin,
  Lock, Database, Lightbulb,
  AlertTriangle, Info, ThumbsUp, MapPin, Tag,
  UserPlus,
  Rocket, Compass,
} from "lucide-react";

// ============================================================
// ============================================================
// PROTOTYPE FIXES (v8.53 cross-document audit — aligned to LLD):
//   FIX 1: WF-1 task status 'done' → 'complete' (matches remediation_tasks.status
//          enum: open|in_progress|ready_for_review|complete|wont_fix).
//   FIX 2: RT-1 agent-readiness bars corrected to the 5 canonical LLD dimensions
//          (Technical Accessibility, Entity Clarity, Claim Verifiability,
//          Category Authority, Task-Fit Signals) — each /20 = /100. Previously
//          conflated Phase 1 technical_audits sub-scores (/18,/16...) with the
//          Phase 2 agent_readiness_scores dimensions.
//   FIX 3 (v8.54): repaired a botched find-replace that had mangled the word
//          "Start" into "Award" in three spots — the tier name "Starter" (6
//          occurrences in BrandIntelTabs minTier + tierRank) and two button CTAs
//          ("Start improving", "Start next campaign"). All restored to "Start"/
//          "Starter". The remaining "Award" tokens are the lucide-react icon import
//          and are intentional.
//   FIX 4 (v8.55): lucide-react import hygiene — removed 5 unused imports
//          (ArrowUpRight, ExternalLink, Hash, Search, Settings) and de-duplicated
//          Shield (was imported twice). All 52 remaining imports are used. The single
//          /api/brands/[id]/ reference is an API route and correctly uses [id]
//          (page routes use [brandId]; see LLD RP-01).
//   FIX 5 (v8.56): BrandIntelTabs tier gates reconciled to the LLD gate table (TG-02).
//          Retrieval tab minTier 'Growth' → 'Starter' (Starter gets agent_readiness_scores
//          FULL + crawler_visit_logs + llmstxt_versions per LLD lines 3877-3880 — gating at
//          Growth hid paid Starter value). Reports tab minTier 'Starter' → 'Growth'
//          (generated_reports is Growth+; Starter has no report entitlement — LLD line 3910).
//          Visibility=Starter and Workflow=Starter verified correct, left unchanged.
//          Plus two no-semantic-change audit notes: (a) AutopilotLoop step.status
//          ('done'|'current'|'pending') is presentational stepper state, NOT the
//          remediation_tasks.status DB enum; (b) Phase2Sidebar hubs are intentionally
//          ungated nav convenience — the real gate is BrandIntelTabs.
//   FIX 6 (v8.57): navigation reachability (NAV-01). Four implemented screens were registered
//          in screenMap but unreachable by any sidebar/tab/onNav path — now wired at their
//          LLD-intended entry points: AutopilotLoop ("View full loop" on the dashboard Autopilot
//          tracker), CompetitiveBenchmark (CTA card in VisibilityHub, sibling to Citation Failure),
//          ContentDraftEditor (WorkflowHub's existing "Generate draft" button), HealthCheck
//          (first-audit banner on the dashboard). Zero unreachable screens after the fix.
//          Also documented (no behaviour change) that the sidebar's brand-list / action-center /
//          vertical-packs / billing items are PHASE 1 screens (live in visibleau-prototype.jsx),
//          intentionally not re-implemented here — they fall through to 'dashboard' in this
//          prototype but resolve to real Phase 1 routes in the built app.
//   FIX 7 (v8.58): categorical value-set binding (EV-01). Added a DATA-BINDING NOTE on
//          PriorityBadge — its high/medium/low pill is a DERIVED impact/priority display
//          (danger=high/warning=medium/info=low per the LLD display rule), computed from
//          remediation_tasks.effort + expectedImpactScore and ordered by the INTEGER
//          remediation_tasks.priority rank. It must NOT be bound to the raw INTEGER priority
//          column as if it held 'high'|'medium'|'low'. No visual change. (Verified clean:
//          StatusBadge styles every status it receives; no unmapped-status fallthroughs.)
//   FIX 8 (v8.59): numeric fixture fidelity (NUM-01). (a) WorkflowHub "Open tasks" stat card
//          value 3→2 and sub "2 high priority"→"1 high priority" to match its own task array
//          (open=2, in_progress=2, complete=1; of the 2 open tasks only 1 is high priority).
//          (b) Dashboard "Work Completed" relabelled to the LLD Action Progress Tracker metric
//          "4 / 11 gaps closed this month" (org-wide COUNT of completed remediation_tasks) with a
//          scope comment — it is intentionally a DIFFERENT scope from WorkflowHub's single-brand
//          "Done this month: 1", so the two need not match. (Verified clean: agent-readiness dims
//          sum to 25 = gauge; sameAs 1/3 = LLD threshold; SoV sums to 100; topical gap = comp−your.)
//   FIX 9 (v8.60): dark+light THEME correctness + typography. (THM-01) Fixed an invalid CSS prop
//          "backdropSlidersHorizontal"→"backdropFilter" in TWO overlays (TierGate ~L463, dev-nav
//          ~L3110) — backdrop blur never rendered. (THM-03) Added a [data-theme="light"] override:
//          the Phase 2 layer accents in :root failed WCAG AA on white (workflow 2.54, trust 2.15,
//          discovery 2.43 as text); light mode now uses darker on-hue variants, all ≥4.5 AA; dark
//          mode unchanged. (THM-02) "Cputom"→"Custom" comment typo. (UX-01) Evidence-based 2026
//          typography (research-confirmed Geist/Inter is already the standard, so NO font swap):
//          added tabular-nums + slashed-zero on mono numerics (aligns score columns), optical
//          sizing, contextual alternates, tighter heading tracking. Verified: all #fff text sits on
//          accent/gradient fills (correct in both themes); JSX+CSS braces balanced.
//   FIX 10 (v8.61): focus states + elevation, both themes. (FOC-01) Added a global :focus-visible
//          ring (was ENTIRELY absent — 0 rules across 50 buttons/18 handlers; WCAG 2.4.7 fail in
//          both themes) via a --focus-ring token; verified non-text contrast dark 5.41 / light 4.95.
//          (ELV-01) Added theme-aware --elevation-rest/-hover tokens — black shadows were invisible
//          on the dark #09090b surface, so .card-lift had no depth in dark mode; dark now uses a
//          deeper shadow + inset top-highlight (Linear/Vercel technique), light uses soft drop
//          shadows. Rich depth now reads in BOTH themes. No font change.
//   FIX 11 (v8.62): inline-style CSS-value validity (CSS-01). 6 inline borders were written as
//          a CSS variable with two hex digits appended directly — "1px solid var(--token)" with a
//          trailing alpha pair — which is NOT valid CSS (you cannot suffix alpha onto a var()
//          reference). The browser failed to parse the shorthand and dropped the whole border, so
//          these cards/CTAs rendered with NO border in either theme. Affected: the Visibility
//          Citation-Failure + Competitive-Benchmark CTA cards (visibility accent), the Retrieval
//          llms.txt/MCP/Entity-Home status cards (danger/warning accents), and the Reports cover
//          thumbnail (comm accent). Replaced each with color-mix(in srgb, var(--token) 19%,
//          transparent) — valid CSS that resolves a var() colour with ~the same 0x30≈18.8% alpha,
//          and stays theme-aware automatically (the layer tokens already flip per [data-theme]).
//          The valid `${jsVar}30` template-literal borders (HealthCheck dimension cards, Autopilot
//          step accents) were CORRECT — a resolved JS hex + alpha — and left untouched.
//   FIX 12 (v8.63): component call-site prop/data contract integrity. (CT-01) IntelCard now
//          declares the `unit` prop its VisibilityHub call site (and the LLD's own SoV spec)
//          already pass — previously unit="%" was silently dropped and Share of Voice rendered
//          "34/100" (a percentage shown as a score); with unit set, the card renders
//          {value}{unit} and suppresses the "/100" suffix. (CT-02) delta={0} (TrustHub
//          Consensus) rendered as a RED TrendingDown "0" — added an explicit neutral zero-delta
//          state (accent-muted pill, "±0", no trend icon). (CT-03) TrustHub's 4 score cards
//          gained a DATA-BINDING NOTE: Entity = score_of_10 × 10 display transform (D-01:
//          score_of_10 is canonical, never add entity_score); Hallucination Risk = open-incident
//          weighted derivation per the LLD CT-04 note, and its fixture corrected 23 → 20 to
//          match the 1-critical + 1-warning feed on the SAME screen; LinkedIn = presence_score
//          direct; Consensus = AVG(consistency_score) across the brand's per-source rows.
//   FIX 13 (v8.64): ARIA names + control semantics (AR-01..AR-05, WCAG 4.1.2 / 1.3.1).
//          Nine icon-only buttons gained aria-label (TopBar Bell/Moon, sidebar account menu,
//          WorkflowHub per-task Sparkles, ContentDraft back, ReportsList Download/Share,
//          Team Edit/Remove — entity-specific labels via template literals). Both tab bars
//          are now role="tablist" with role="tab" + aria-selected children (locked
//          BrandIntelTabs tabs also set aria-disabled). The two contentEditable editors are
//          named textboxes (role="textbox"; body adds aria-multiline). The sidebar nav is
//          aria-label="Primary". IntelCard's score bar carries role="img" + an aria-label
//          per the Phase 1 BK4 convention, covering every IntelCard instance in one edit.
//          GLOBAL BUILD RULES (apply in the real build, not as per-instance mock edits):
//          (a) decorative lucide icons inside text-labeled controls render aria-hidden;
//          (b) clickable rows/cards mocked as DIVs ship as button/link elements with
//          accessible names; (c) complete the APG tabs pattern wherever role="tablist"
//          appears (tabpanel ids + arrow-key navigation); (d) bespoke score bars
//          (HealthCheck dims, RetrievalHub agent dims, TrustHub minis, SoV rows) follow
//          the same BK4 aria-label pattern as IntelCard.
//   FIX 14 (v8.65): RUNTIME CSS alpha-suffix validity (RT-01, independent cross-review).
//          The v8.62 CSS-01 pass fixed the six STATIC var(--token)NN borders but its grep
//          could not see the same invalid value ASSEMBLED AT RUNTIME: JS fixtures that feed
//          the hex-alpha concat patterns hold 'var(--token)' strings, not hex literals —
//          statusColor (HealthCheck), q.color (Citation quadrants), presenceStyle
//          (Trust presence), step.color (Autopilot steps), and one inline ternary
//          (Trust incidents). At runtime these produced values like "1px solid
//          var(--health-great)" immediately suffixed with "30" — invalid CSS, declaration
//          dropped by the
//          browser. Nine insertions across eight sites replaced every suffixed pattern with
//          color-mix at the equivalent opacity (hex 12→7%, 18→9%, 20→13%, 30→19%, 40→25%,
//          60→38%): HealthCheck dimension-card borders; active citation-quadrant background
//          + border; Trust incident-card borders; Trust presence icon-circle backgrounds;
//          Autopilot pending-step dashed ring, step pill background, and step detail-box
//          background + border. The unsuffixed "2px solid " + step.color branch was already
//          valid and is unchanged. GREP NOTE: the template-literal hex-alpha pattern grep
//          now matches ONE COMMENT ONLY (the FIX 11 header note) — zero live hits.
//          color-mix live occurrences: 15 across 14 lines (the step detail-box line carries
//          two). Comment mentions of color-mix: 3 (the FIX 9/CSS-01 header note + twice in
//          this note) — exclude comments when grepping for live counts. This note
//          supersedes the previous "two live valid template-literal borders" claim: those
//          two sites fed var() strings, not hex, and were live BUGS, now fixed.
//   FIX 15 (v8.66): MOTION SAFETY (RM-01, audit pass 47). Added a global
//          @media (prefers-reduced-motion: reduce) reset to Phase2Styles (after the
//          animation utilities) so the 4 @keyframes (pulse-ring, gradient-shift, float-up,
//          score-fill) + Tailwind animate-pulse honor the OS reduce-motion setting — WCAG
//          2.2.2 (Level A) for the infinite/auto-playing gradient-shift banners + pulse-ring.
//          The universal !important reset overrides even the inline style={{animation:…}}
//          props on the autopilot/health gradient banners. Additive; no behavioural change
//          for users without the preference. (Build rule for future sprints: every animated
//          surface inherits this reset from the Phase 2 base stylesheet.)
//   v8.67 (LLD-only pass): NO PROTOTYPE CHANGE. The forty-eighth canon pass was a consolidated
//          hygiene + security pass on the LLD only (S4-02 DDL comma, S5-02 webhook severity enum,
//          S6-02 freshness-tier reconciliation, SEC-A/SEC-B Visit-route hardening). The prototype
//          stays at FIX 15; this note records the version alignment for traceability.
//   FIX 16 (v8.68): HEALTH CHECK CROSS-LAYER RECONCILIATION (S9-02, the forty-ninth canon pass —
//          FIRST prototype change since FIX 15). The HealthCheck component showed the raw audit
//          multidim (Frequency / Position / Sentiment / Context / Accuracy, all from audits),
//          which omitted the two cross-layer dimensions that ARE the synthesis. Reconciled to the
//          LLD's four cross-layer dimensions — AI Sentiment (audits.scoreSentimentNumeric), AI
//          Presence (audits.scoreFrequency), Site Readiness (technical_audits.scoreComposite),
//          Local Authority (agent_readiness_scores.local_ai_trust_score; skip for SaaS) — plus the
//          #1 recommended action as the 5th section (its own card, already present). Dimension
//          grid 5→4 cols; icons → ThumbsUp / Eye / Globe / MapPin. The Health Check is the
//          trial→paid conversion surface, so it must show the cross-layer synthesis the LLD
//          designs, not the raw audit scores. (LLD authority: the Health Check OUTPUT spec.)
// ============================================================
// PHASE 2 DESIGN TOKENS
// Extends Phase 1 tokens with intelligence-layer accents.
// These MUST be added to globals.css before Phase 2 Sprint 2.
// ============================================================
const Phase2Styles = () => (
  <style>{`
    /* ── INTELLIGENCE LAYER ACCENT COLORS ── */
    /* Each layer has a primary color + soft (12% opacity) variant */
    :root {
      /* Workflow Intelligence — Green (execution, progress) */
      --layer-workflow:       #10b981;
      --layer-workflow-soft:  rgba(16,185,129,0.12);

      /* Visibility Intelligence — Blue (sight, monitoring) */
      --layer-visibility:     #3b82f6;
      --layer-visibility-soft:rgba(59,130,246,0.12);

      /* Communication — Indigo (reports, presentation) */
      --layer-comm:           #6366f1;
      --layer-comm-soft:      rgba(99,102,241,0.12);

      /* Trust Intelligence — Amber (reputation, credibility) */
      --layer-trust:          #f59e0b;
      --layer-trust-soft:     rgba(245,158,11,0.12);

      /* Retrieval Intelligence — Purple (technical, AI) */
      --layer-retrieval:      #8b5cf6;
      --layer-retrieval-soft: rgba(139,92,246,0.12);

      /* Conversational Discovery — Cyan (exploration) */
      --layer-discovery:      #06b6d4;
      --layer-discovery-soft: rgba(6,182,212,0.12);

      /* Governance — Slate (control, administration) */
      --layer-governance:     #64748b;
      --layer-governance-soft:rgba(100,116,139,0.12);

      /* Autopilot — Gradient (the aha-moment sprint) */
      --autopilot-from:       #6366f1;
      --autopilot-to:         #3b82f6;
      --autopilot-gradient:   linear-gradient(135deg, #6366f1, #3b82f6);

      /* ── PHASE 2 NEW EFFECTS ── */
      /* Gradient border for featured/premium cards */
      --gradient-border-premium: linear-gradient(135deg,
        rgba(99,102,241,0.4), rgba(59,130,246,0.2), rgba(16,185,129,0.1));

      /* Glow effects per layer */
      --glow-workflow:    0 0 20px rgba(16,185,129,0.15);
      --glow-visibility:  0 0 20px rgba(59,130,246,0.15);
      --glow-trust:       0 0 20px rgba(245,158,11,0.15);
      --glow-retrieval:   0 0 20px rgba(139,92,246,0.15);
      --glow-discovery:   0 0 20px rgba(6,182,212,0.15);
      --glow-autopilot:   0 0 30px rgba(99,102,241,0.2);

      /* Frosted glass for modal overlays */
      --glass-bg: rgba(9,9,11,0.8);
      --glass-border: rgba(255,255,255,0.08);
      --glass-blur: blur(12px);

      /* Health Check status colors */
      --health-great:    #22c55e;
      --health-good:     #84cc16;
      --health-moderate: #f59e0b;
      --health-poor:     #ef4444;

      /* Score gradient (low → high) */
      --score-low:       #ef4444;
      --score-mid:       #f59e0b;
      --score-high:      #22c55e;

      /* Autopilot step colors */
      --step-audit:      #3b82f6;
      --step-gap:        #f59e0b;
      --step-explain:    #8b5cf6;
      --step-draft:      #06b6d4;
      --step-measure:    #22c55e;

      /* ── ELEVATION (FOC-01) — dark-surface depth ──
         Black shadows are invisible on #09090b, so dark elevation combines a deeper
         drop shadow with a 1px inset top-highlight to read as a raised surface
         (the Linear/Vercel approach). */
      --elevation-rest:  0 1px 2px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04);
      --elevation-hover: 0 10px 30px -8px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06);

      /* ── FOCUS RING (FOC-01) — keyboard focus indicator ──
         A 2-stop ring: blue core + a base-colored halo so it reads on any surface. */
      --focus-ring: 0 0 0 2px var(--bg-base), 0 0 0 4px var(--accent-blue);
    }

    /* ── LIGHT-THEME ACCENT OVERRIDES (THM-03) ──
       The :root layer accents above are tuned for the dark (zinc) surfaces. On the light
       theme's white/#fafafa surfaces several of them fail WCAG AA as text/icons
       (workflow 2.54, trust 2.15, discovery 2.43). This block supplies darker, on-hue
       variants (all ≥4.5 AA on white) for light mode ONLY — dark mode is unchanged.
       Mirrors Phase 1's per-theme accent desaturation (e.g. blue 3b82f6→2563eb). */
    [data-theme="light"] {
      --layer-workflow:       #047857;   /* emerald 700  — 5.48 on #fff */
      --layer-workflow-soft:  rgba(4,120,87,0.10);
      --layer-visibility:     #1d4ed8;   /* blue 700     — 6.70 */
      --layer-visibility-soft:rgba(29,78,216,0.10);
      --layer-comm:           #4338ca;   /* indigo 700   — 7.90 */
      --layer-comm-soft:      rgba(67,56,202,0.10);
      --layer-trust:          #b45309;   /* amber 700    — 5.02 */
      --layer-trust-soft:     rgba(180,83,9,0.10);
      --layer-retrieval:      #6d28d9;   /* violet 700   — 7.10 */
      --layer-retrieval-soft: rgba(109,40,217,0.10);
      --layer-discovery:      #0e7490;   /* cyan 700     — 5.36 */
      --layer-discovery-soft: rgba(14,116,144,0.10);
      --layer-governance:     #334155;   /* slate 700    — 10.35 */
      --layer-governance-soft:rgba(51,65,85,0.10);

      /* Health / score ramps — darken the light-end stops for contrast on white */
      --health-great:    #15803d;
      --health-good:     #4d7c0f;
      --health-moderate: #b45309;
      --health-poor:     #dc2626;
      --score-low:       #dc2626;
      --score-mid:       #b45309;
      --score-high:      #15803d;

      /* Glows are a dark-surface effect; neutralise on light to avoid muddy halos */
      --glow-workflow:    none;
      --glow-visibility:  none;
      --glow-trust:       none;
      --glow-retrieval:   none;
      --glow-discovery:   none;
      --glow-autopilot:   0 0 24px rgba(99,102,241,0.12);

      /* Frosted-glass overlay flips to a light scrim in light mode */
      --glass-bg: rgba(250,250,250,0.8);
      --glass-border: rgba(0,0,0,0.08);

      /* Elevation on light surfaces = classic soft drop shadows (no inset highlight). */
      --elevation-rest:  0 1px 3px rgba(0,0,0,0.08), 0 1px 2px -1px rgba(0,0,0,0.08);
      --elevation-hover: 0 12px 28px -8px rgba(0,0,0,0.18), 0 6px 10px -6px rgba(0,0,0,0.12);
      /* Focus halo uses the light base color so the ring stays crisp on white. */
      --focus-ring: 0 0 0 2px var(--bg-base), 0 0 0 4px var(--accent-blue);
    }

    /* ── PHASE 2 ANIMATIONS ── */
    @keyframes pulse-ring {
      0%   { box-shadow: 0 0 0 0   rgba(59,130,246,0.4); }
      70%  { box-shadow: 0 0 0 8px rgba(59,130,246,0); }
      100% { box-shadow: 0 0 0 0   rgba(59,130,246,0); }
    }
    @keyframes gradient-shift {
      0%   { background-position: 0% 50%; }
      50%  { background-position: 100% 50%; }
      100% { background-position: 0% 50%; }
    }
    @keyframes float-up {
      0%   { opacity: 0; transform: translateY(8px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    @keyframes score-fill {
      from { width: 0%; }
      to   { width: var(--score-pct); }
    }
    .animate-float { animation: float-up 0.3s ease forwards; }
    .animate-pulse-ring { animation: pulse-ring 2s infinite; }

    /* ── MOTION SAFETY (RM-01, v8.66) — honor the OS "reduce motion" preference ──
       WCAG 2.2.2 (Pause/Stop/Hide, Level A) + 2.3.3 (Animation from Interactions).
       Author-stylesheet !important overrides even inline style={{animation:…}} per the
       CSS cascade, so the infinite gradient-shift banners (set inline at the autopilot/
       health surfaces), pulse-ring, score-fill, float-up, and Tailwind animate-pulse all
       effectively stop / jump to their end state for users who request reduced motion. */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
    }

    /* ── PHASE 2 LAYER TAB NAV ── */
    /* Used on Brand Detail for intelligence layer tabs */
    .layer-tab {
      padding: 6px 14px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
      border: 1px solid transparent;
      white-space: nowrap;
    }
    .layer-tab:hover {
      background: var(--bg-hover);
    }
    .layer-tab.active {
      background: var(--bg-elevated);
      border-color: var(--border-default);
      color: var(--text-primary);
    }

    /* ── KEYBOARD FOCUS RING (FOC-01, WCAG 2.4.7) ──
       Applies to every natively-focusable control. :focus-visible (not :focus) shows the
       ring for keyboard/AT users without flashing it on mouse click — the modern default. */
    a:focus-visible,
    button:focus-visible,
    [role="button"]:focus-visible,
    input:focus-visible,
    select:focus-visible,
    textarea:focus-visible,
    [contenteditable]:focus-visible,
    [tabindex]:focus-visible {
      outline: none;
      box-shadow: var(--focus-ring);
      border-radius: 8px;
      transition: box-shadow 0.12s ease;
    }

    /* ── HOVER LIFT EFFECT ── */
    /* Apply to cards that are interactive/clickable */
    .card-lift {
      transition: transform 0.15s ease, box-shadow 0.15s ease;
      box-shadow: var(--elevation-rest);
    }
    .card-lift:hover {
      transform: translateY(-2px);
      box-shadow: var(--elevation-hover);
    }

    /* ── SCORE BAR (Phase 2 enhanced) ── */
    .score-bar-track {
      height: 4px;
      border-radius: 9999px;
      background: var(--bg-hover);
      overflow: visible;
      position: relative;
    }
    .score-bar-fill {
      height: 100%;
      border-radius: 9999px;
      transition: width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
      position: relative;
    }
    .score-bar-dot {
      position: absolute;
      right: -4px;
      top: 50%;
      transform: translateY(-50%);
      width: 8px;
      height: 8px;
      border-radius: 50%;
      border: 2px solid var(--bg-base);
    }

    /* ── GRADIENT BORDER CARD ── */
    /* Wrap content in this for premium/featured card appearance */
    .gradient-border-card {
      position: relative;
      border-radius: 10px;
      padding: 1px;
      background: var(--gradient-border-premium);
    }
    .gradient-border-card-inner {
      border-radius: 9px;
      background: var(--bg-elevated);
    }

    /* ── AUTOPILOT STEP CONNECTOR ── */
    .autopilot-step-line {
      position: absolute;
      left: 19px;
      top: 40px;
      bottom: -16px;
      width: 2px;
      background: linear-gradient(to bottom, var(--border-default), transparent);
    }

    /* ── WINS FEED ITEM ── */
    .wins-item {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-subtle);
      transition: background 0.1s ease;
    }
    .wins-item:hover { background: var(--bg-hover); }
    .wins-item:last-child { border-bottom: none; }

    /* ── TYPOGRAPHIC REFINEMENTS (UX-01, evidence-based 2026 standards) ──
       Keeps the locked Geist/Inter + Geist Mono identity; only enables features
       that improve a number-heavy dashboard. No font swap. */
    :root {
      /* Optical sizing + crisp rendering across the whole app */
      font-optical-sizing: auto;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: optimizeLegibility;
      /* Inter/Geist stylistic niceties: contextual alternates + disambiguated chars */
      font-feature-settings: "cv01", "cv03", "calt", "case";
    }
    /* TABULAR figures for every metric/score so digit columns align and don't jitter
       when values change. Applied to the mono font used by all numeric displays. */
    [style*="--font-mono"], .font-mono, [class*="font-mono"] {
      font-variant-numeric: tabular-nums slashed-zero;
      font-feature-settings: "tnum", "zero", "ss01";
      letter-spacing: -0.01em;
    }
    /* Slightly tighter tracking on large headings for a more premium, modern feel
       (matches the Linear/Vercel display style the dark theme is modelled on). */
    h1, h2, .text-3xl, .text-4xl { letter-spacing: -0.02em; }
  `}</style>
);

// ============================================================
// PHASE 2 SHARED COMPONENTS
// All components below are used across multiple sprint screens.
// ============================================================

// ── LAYER BADGE ──
// Usage: <LayerBadge layer="visibility" /> — shows colored pill
// layer: "workflow"|"visibility"|"comm"|"trust"|"retrieval"|"discovery"|"governance"
const LAYER_META = {
  workflow:   { label: 'Workflow',   color: 'var(--layer-workflow)',   soft: 'var(--layer-workflow-soft)',   icon: GitBranch  },
  visibility: { label: 'Visibility', color: 'var(--layer-visibility)', soft: 'var(--layer-visibility-soft)', icon: Eye        },
  comm:       { label: 'Reports',    color: 'var(--layer-comm)',       soft: 'var(--layer-comm-soft)',       icon: FileText   },
  trust:      { label: 'Trust',      color: 'var(--layer-trust)',      soft: 'var(--layer-trust-soft)',      icon: Shield     },
  retrieval:  { label: 'Retrieval',  color: 'var(--layer-retrieval)',  soft: 'var(--layer-retrieval-soft)',  icon: Cpu        },
  discovery:  { label: 'Discovery',  color: 'var(--layer-discovery)',  soft: 'var(--layer-discovery-soft)',  icon: Compass    },
  governance: { label: 'Governance', color: 'var(--layer-governance)', soft: 'var(--layer-governance-soft)', icon: Shield},
};

const LayerBadge = ({ layer, size = 'sm' }) => {
  const m = LAYER_META[layer] || LAYER_META.visibility;
  const Icon = m.icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full font-medium"
      style={{
        background: m.soft,
        color: m.color,
        padding: size === 'sm' ? '2px 8px' : '4px 12px',
        fontSize: size === 'sm' ? '11px' : '12px',
      }}
    >
      <Icon style={{ width: size === 'sm' ? 10 : 12, height: size === 'sm' ? 10 : 12 }} />
      {m.label}
    </span>
  );
};

// ── INTELLIGENCE SCORE CARD ──
// Usage: <IntelCard layer="visibility" label="Visibility Score" value={72} max={100} delta={+4.2} />
//        <IntelCard layer="visibility" label="Share of Voice" value={34} unit="%" delta={+6} />
// EXACT IMPLEMENTATION:
//   - Outer div: padding 20px, border-radius 10px
//   - Top row: LayerBadge left, trend indicator right
//   - Value: text-3xl font-semibold tracking-tight fontFamily var(--font-mono)
//   - Unit suffix (CT-01 v8.63): optional `unit` prop (e.g. "%"). When set, render
//     {value}{unit} — unit as text-[14px] ml-0.5 text-tertiary — and SUPPRESS the "/100"
//     suffix (a percentage is not a score out of 100). The score bar still fills value/max.
//     When unit is absent and max === 100, render the "/100" suffix as before.
//   - Delta badge: text-[11px] with TrendingUp/Down icon 10px.
//     ZERO-DELTA (CT-02 v8.63): delta === 0 is a real call-site value ("no change") — render
//     a NEUTRAL pill (bg var(--accent-muted), color var(--text-secondary), label "±0",
//     NO trend icon). Only delta > 0 is success/up; only delta < 0 is danger/down.
//   - Score bar: 4px track, colored fill, dot at end
const IntelCard = ({ layer, label, value, max = 100, unit, delta, desc, loading = false }) => {
  const m = LAYER_META[layer] || LAYER_META.visibility;
  const pct = Math.min(100, (value / max) * 100);
  const isPos = delta > 0;
  const isZero = delta === 0;
  return (
    <div
      className="rounded-xl p-5 card-lift"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <LayerBadge layer={layer} />
        {delta !== undefined && (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-medium rounded-full px-2 py-0.5"
            style={{
              background: isZero ? 'var(--accent-muted)' : isPos ? 'var(--success-soft)' : 'var(--danger-soft)',
              color: isZero ? 'var(--text-secondary)' : isPos ? 'var(--success)' : 'var(--danger)',
            }}
          >
            {!isZero && (isPos
              ? <TrendingUp style={{ width: 10, height: 10 }} />
              : <TrendingDown style={{ width: 10, height: 10 }} />)}
            {isZero ? '±0' : `${isPos ? '+' : ''}${delta}`}
          </span>
        )}
      </div>

      <div className="text-[12px] mb-1.5" style={{ color: 'var(--text-tertiary)' }}>{label}</div>

      {loading ? (
        <div className="h-8 w-20 rounded animate-pulse" style={{ background: 'var(--bg-hover)' }} />
      ) : (
        <div
          className="text-3xl font-semibold tracking-tight mb-3"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}
        >
          {value}
          {unit
            ? <span className="text-[14px] ml-0.5" style={{ color: 'var(--text-tertiary)' }}>{unit}</span>
            : max === 100 && <span className="text-[14px] ml-1" style={{ color: 'var(--text-tertiary)' }}>/100</span>}
        </div>
      )}

      {/* Score bar: 4px track, layer-colored fill, white dot at score position.
          AR-05 (v8.64): carries an aria-label per the Phase 1 BK4 ARIA convention. */}
      <div className="score-bar-track" role="img" aria-label={`${label}: ${value} of ${max}`}>
        <div
          className="score-bar-fill"
          style={{ width: `${pct}%`, background: m.color }}
        >
          <div className="score-bar-dot" style={{ background: m.color }} />
        </div>
      </div>

      {desc && (
        <div className="text-[11px] mt-2" style={{ color: 'var(--text-tertiary)' }}>{desc}</div>
      )}
    </div>
  );
};

// ── METRIC ROW ──
// A single data row used in tables and lists.
// Usage: <MetricRow label="Wikipedia" value={47.9} unit="%" trend="up" />
// EXACT IMPLEMENTATION: flex row, label text-[13px], value font-mono text-[13px] font-semibold, trend icon 12px
const MetricRow = ({ label, value, unit = '', trend, note, onClick }) => (
  <div
    className="flex items-center justify-between py-2.5 px-1 border-b"
    style={{ borderColor: 'var(--border-subtle)', cursor: onClick ? 'pointer' : 'default' }}
    onClick={onClick}
  >
    <div className="flex items-center gap-2">
      <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>{label}</span>
      {note && (
        <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-muted)', color: 'var(--text-tertiary)' }}>
          {note}
        </span>
      )}
    </div>
    <div className="flex items-center gap-2">
      <span
        className="text-[13px] font-semibold"
        style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}
      >
        {value}{unit}
      </span>
      {trend === 'up'   && <TrendingUp  style={{ width: 12, height: 12, color: 'var(--success)' }} />}
      {trend === 'down' && <TrendingDown style={{ width: 12, height: 12, color: 'var(--danger)' }} />}
      {onClick && <ChevronRight style={{ width: 14, height: 14, color: 'var(--text-tertiary)' }} />}
    </div>
  </div>
);

// ── SECTION HEADER ──
// Usage: <SectionHeader layer="visibility" title="Share of Voice" subtitle="vs 3 competitors · this month" />
// EXACT IMPLEMENTATION:
//   - flex row items-center justify-between
//   - Left: LayerBadge + h3 text-sm font-semibold + subtitle text-[12px] text-tertiary
//   - Right: optional action button
const SectionHeader = ({ layer, title, subtitle, action }) => (
  <div className="flex items-center justify-between mb-5">
    <div>
      <div className="flex items-center gap-2 mb-0.5">
        {layer && <LayerBadge layer={layer} />}
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
      </div>
      {subtitle && <p className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>{subtitle}</p>}
    </div>
    {action}
  </div>
);

// ── TIER GATE OVERLAY ──
// Usage: <TierGate requiredTier="Agency" currentTier="Growth" feature="Journey Intelligence" />
// Shown over locked content. Semi-transparent overlay, lock icon, upgrade CTA.
// EXACT IMPLEMENTATION:
//   - position: absolute, inset 0, backdrop-filter blur(2px)
//   - Centered card: padding 24px, max-width 280px, bg-elevated, border-default
//   - Lock icon: 24px, accent-blue
//   - Title: text-sm font-semibold, text-primary
//   - Desc: text-[12px], text-secondary
//   - Button: full-width, primary style, "Upgrade to {requiredTier}"
const TierGate = ({ requiredTier, currentTier, feature }) => (
  <div
    className="absolute inset-0 flex items-center justify-center rounded-xl z-10"
    style={{ background: 'rgba(9,9,11,0.75)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }}
  >
    <div
      className="text-center p-6 rounded-xl mx-4"
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-default)',
        maxWidth: 280,
      }}
    >
      <Lock className="w-6 h-6 mx-auto mb-3" style={{ color: 'var(--accent-blue)' }} />
      <div className="text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
        {feature}
      </div>
      <div className="text-[12px] mb-4" style={{ color: 'var(--text-secondary)' }}>
        Available on {requiredTier} plan. You're on {currentTier}.
      </div>
      <button
        className="w-full h-8 text-[12px] font-medium rounded-md"
        style={{ background: 'var(--accent-primary)', color: 'var(--accent-primary-fg)' }}
      >
        Upgrade to {requiredTier}
      </button>
    </div>
  </div>
);

// ── EMPTY STATE ──
// Usage: <EmptyState icon={Eye} title="No visibility data yet" desc="Run your first Phase 2 audit to see Share of Voice." cta="Run audit" />
// EXACT IMPLEMENTATION:
//   - Centered vertically and horizontally, padding 48px
//   - Icon in 48px circle, layer-soft bg, layer-colored icon
//   - Title: text-sm font-semibold, text-primary, mt 12px
//   - Desc: text-[12px], text-secondary, mt 4px, max-width 260px, centered
//   - CTA: optional, mt 16px, primary button 32px height
const EmptyState = ({ icon: Icon, title, desc, cta, layer = 'visibility', onCta }) => {
  const m = LAYER_META[layer];
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
        style={{ background: m.soft }}
      >
        <Icon style={{ width: 20, height: 20, color: m.color }} />
      </div>
      <div className="text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>{title}</div>
      <div className="text-[12px] max-w-xs" style={{ color: 'var(--text-secondary)' }}>{desc}</div>
      {cta && (
        <button
          onClick={onCta}
          className="mt-4 h-8 px-4 text-[12px] font-medium rounded-md"
          style={{ background: 'var(--accent-primary)', color: 'var(--accent-primary-fg)' }}
        >
          {cta}
        </button>
      )}
    </div>
  );
};

// ── STATUS BADGE ──
// Usage: <StatusBadge status="open" /> | "in_progress" | "complete" | "failed" | "draft" | "approved"
// EXACT IMPLEMENTATION: inline-flex, text-[11px], font-medium, px-2 py-0.5, rounded-full
const StatusBadge = ({ status }) => {
  const styles = {
    open:        { bg: 'var(--info-soft)',    fg: 'var(--info)',    label: 'Open'        },
    in_progress: { bg: 'var(--warning-soft)', fg: 'var(--warning)', label: 'In progress' },
    complete:    { bg: 'var(--success-soft)', fg: 'var(--success)', label: 'Complete'    },
    done:        { bg: 'var(--success-soft)', fg: 'var(--success)', label: 'Done'        },
    failed:      { bg: 'var(--danger-soft)',  fg: 'var(--danger)',  label: 'Failed'      },
    draft:       { bg: 'var(--accent-muted)', fg: 'var(--text-secondary)', label: 'Draft' },
    approved:    { bg: 'var(--success-soft)', fg: 'var(--success)', label: 'Approved'    },
    published:   { bg: 'var(--layer-comm-soft)', fg: 'var(--layer-comm)', label: 'Published' },
    detected:    { bg: 'var(--danger-soft)',  fg: 'var(--danger)',  label: 'Detected'    },
    resolved:    { bg: 'var(--success-soft)', fg: 'var(--success)', label: 'Resolved'    },
  };
  const s = styles[status] || styles.open;
  return (
    <span
      className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
};

// ── PRIORITY BADGE ──
// Usage: <PriorityBadge priority="high" /> | "medium" | "low"
// ── PRIORITY BADGE ──
// DATA-BINDING NOTE (EV-01 v8.58): this high/medium/low band is the LLD's display pill
// (danger=high / warning=medium / info=low — LLD remediation_tasks priority/impact display rule).
// It is a DERIVED display band, NOT a direct read of a string column:
//   • remediation_tasks.priority is INTEGER (a 1..N rank; priority=1 is the top action).
//   • the categorical low/medium/high lives on remediation_tasks.effort and expectedImpactScore.
// Claude Code: bind this badge to the derived impact/priority band (compute from effort +
// expectedImpactScore, ordered by the integer priority rank) — do NOT render the raw INTEGER
// priority as if it were 'high'|'medium'|'low'.
const PriorityBadge = ({ priority }) => {
  const styles = {
    high:   { bg: 'var(--danger-soft)',  fg: 'var(--danger)',  label: 'High'   },
    medium: { bg: 'var(--warning-soft)', fg: 'var(--warning)', label: 'Med'    },
    low:    { bg: 'var(--info-soft)',    fg: 'var(--info)',    label: 'Low'    },
  };
  const s = styles[priority] || styles.medium;
  return (
    <span
      className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
};

// ── CONFIDENCE BADGE ──
// Usage: <ConfidenceBadge label="confirmed" /> | "likely" | "hypothesis"
const ConfidenceBadge = ({ label }) => {
  const styles = {
    confirmed:  { bg: 'var(--success-soft)', fg: 'var(--success)', label: 'Confirmed'  },
    likely:     { bg: 'var(--warning-soft)', fg: 'var(--warning)', label: 'Likely'     },
    hypothesis: { bg: 'var(--accent-muted)', fg: 'var(--text-secondary)', label: 'Hypothesis' },
  };
  const s = styles[label] || styles.hypothesis;
  return (
    <span
      className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
};


// ============================================================
// PHASE 2 SIDEBAR — EXTENDED NAVIGATION
// Sprint mapping: Sprint 2+ adds intelligence layer nav items.
// EXACT IMPLEMENTATION:
//   - Same sidebar shell as Phase 1 (w-60, bg-subtle, border-r)
//   - WORKSPACE section: Overview, Brands (same as Phase 1)
//   - INTELLIGENCE section: NEW in Phase 2 — links to layer hubs
//   - REPORTING section: NEW in Phase 2 — Reports, Schedule
//   - ACCOUNT section: Team, Data Residency, View plans
// Active state: background var(--bg-elevated), border var(--border-default), aria-current="page"
// ============================================================
const Phase2Sidebar = ({ current, onNav, tier = 'Agency' }) => {
  const sections = [
    {
      title: 'WORKSPACE',
      items: [
        { id: 'dashboard',    label: 'Overview',     icon: LayoutDashboard },
        { id: 'brand-list',   label: 'Brands',       icon: Building2 },
        { id: 'action-center',label: 'Action Center', icon: Zap },
        { id: 'vertical-packs', label: 'Vertical packs', icon: BookOpen },
      ],
    },
    {
      // Intelligence layers — Sprint 2+ (shown on brand-scoped nav when a brand is selected)
      // In practice these appear as tabs on the Brand Detail page.
      // Shown here as top-level nav for prototype navigation purposes.
      // GATING NOTE (audit): tier entitlement is enforced by BrandIntelTabs (minTier per tab,
      // reconciled to the LLD gate table). These sidebar hubs are intentionally LEFT UNGATED so
      // every screen stays reachable for prototype review — do NOT add tierGate here to "match"
      // the tabs. (discovery-hub keeps a tierGate only as an illustrative example; harmless since
      // Discovery is Agency+ and the default prototype tier is 'Agency'.)
      title: 'INTELLIGENCE',
      items: [
        { id: 'visibility-hub',  label: 'Visibility',   icon: Eye,         layer: 'visibility' },
        { id: 'trust-hub',       label: 'Trust',        icon: Shield,       layer: 'trust'      },
        { id: 'retrieval-hub',   label: 'Retrieval',    icon: Cpu,          layer: 'retrieval'  },
        { id: 'workflow-hub',    label: 'Workflow',     icon: GitBranch,    layer: 'workflow'   },
        { id: 'discovery-hub',   label: 'Discovery',    icon: Compass,      layer: 'discovery', tierGate: 'Agency'  },
      ],
    },
    {
      title: 'REPORTING',
      items: [
        { id: 'reports',       label: 'Reports',      icon: FileText,     layer: 'comm' },
      ],
    },
    {
      title: 'ACCOUNT',
      items: [
        { id: 'team',            label: 'Team',         icon: Users },
        { id: 'data-residency',  label: 'Data residency', icon: Globe },
        { id: 'billing',         label: 'View plans',   icon: Award },
      ],
    },
  ];

  const tierRank = { Free: 0, Starter: 1, Growth: 2, Agency: 3, 'Agency Pro': 4 };
  const userRank = tierRank[tier] ?? 0;

  return (
    <aside
      className="w-60 shrink-0 flex flex-col h-full border-r overflow-y-auto"
      style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
    >
      {/* Logo header */}
      <div
        className="px-4 py-4 border-b flex items-center justify-between"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        {/* Logo: 28px square, bg-primary, white V monogram */}
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center relative overflow-hidden"
            style={{ background: 'var(--accent-primary)' }}
          >
            <span className="text-xs font-bold relative z-10" style={{ color: 'var(--accent-primary-fg)', fontFamily: 'var(--font-mono)' }}>V</span>
            <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg,rgba(255,255,255,0.15),transparent 50%)' }} />
          </div>
          <div className="flex">
            <span className="font-semibold text-[15px] tracking-tight" style={{ color: 'var(--text-primary)' }}>visible</span>
            <span className="font-semibold text-[15px] tracking-tight" style={{ color: 'var(--text-tertiary)' }}>au</span>
          </div>
        </div>
      </div>

      {/* Org switcher: 40px height, bg-elevated, border-default, org avatar + name + tier badge */}
      <div
        className="mx-3 mt-3 mb-1 px-3 py-2 rounded-md flex items-center gap-2 cursor-pointer"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}
      >
        {/* Org avatar: 28px, gradient, white initial */}
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-bold shrink-0"
          style={{ background: 'linear-gradient(135deg, #6366f1, #3b82f6)', color: '#fff' }}
        >
          V
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>VisibleAU Dev</div>
          <div className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{tier} · AU</div>
        </div>
        <ChevronDown style={{ width: 12, height: 12, color: 'var(--text-tertiary)' }} />
      </div>

      {/* Nav sections */}
      <nav className="flex-1 px-3 pb-3 space-y-4 mt-2" aria-label="Primary">
        {sections.map(section => (
          <div key={section.title}>
            {/* Section label: text-[10px] uppercase tracking-widest px-2 mb-1 */}
            <div
              className="text-[10px] font-semibold uppercase tracking-widest px-2 mb-1"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {section.title}
            </div>
            <div className="space-y-0.5">
              {section.items.map(item => {
                const Icon = item.icon;
                const isActive = current === item.id;
                // Tier gate: lock items above user's tier
                const reqRank = tierRank[item.tierGate] ?? 0;
                const isLocked = item.tierGate && userRank < reqRank;
                // Layer accent for intelligence items
                const layerColor = item.layer ? LAYER_META[item.layer]?.color : null;

                return (
                  <button
                    key={item.id}
                    onClick={() => !isLocked && onNav(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className="w-full px-3 py-1.5 rounded-md flex items-center gap-2.5 text-[13px] font-medium text-left"
                    style={{
                      background:   isActive ? 'var(--bg-elevated)'  : 'transparent',
                      color:        isLocked ? 'var(--text-disabled)' :
                                   isActive  ? 'var(--text-primary)'  :
                                   layerColor ? 'var(--text-secondary)' :
                                   'var(--text-secondary)',
                      border:       isActive ? '1px solid var(--border-default)' : '1px solid transparent',
                      fontWeight:   isActive ? 500 : 400,
                      cursor:       isLocked ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {/* Icon: 14px, layer-colored when active on intelligence items */}
                    <Icon
                      style={{
                        width: 14, height: 14, flexShrink: 0,
                        color: isLocked ? 'var(--text-disabled)'  :
                               isActive && layerColor ? layerColor :
                               isActive ? 'var(--text-primary)'   : 'var(--text-tertiary)',
                      }}
                    />
                    <span className="flex-1 truncate">{item.label}</span>
                    {/* Lock icon for tier-gated items */}
                    {isLocked && <Lock style={{ width: 10, height: 10, color: 'var(--text-disabled)' }} />}
                    {/* Layer color dot for active intelligence items */}
                    {isActive && layerColor && (
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: layerColor }} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User footer: same as Phase 1 — avatar + name + tier + "..." menu */}
      <div
        className="mx-3 mb-3 px-3 py-2 rounded-md flex items-center gap-2 border"
        style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-subtle)' }}
      >
        {/* Avatar: 32px circle, dark bg, white initial */}
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-semibold shrink-0"
          style={{ background: 'var(--bg-active)', color: 'var(--text-primary)' }}
        >
          S
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>Sri Komman</div>
          <div className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>{tier} tier · AU</div>
        </div>
        <button className="p-1 rounded" aria-label="Account menu" style={{ color: 'var(--text-tertiary)' }}>
          <SlidersHorizontal style={{ width: 12, height: 12 }} />
        </button>
      </div>
    </aside>
  );
};

// ── INTELLIGENCE LAYER TAB BAR ──
// Used on Brand Detail page to switch between layers.
// EXACT IMPLEMENTATION:
//   - Horizontal scrollable row, gap-1, py-1, border-b border-subtle
//   - Each tab: 34px height, px-3, rounded-md, text-[13px] font-medium
//   - Active tab: bg-elevated, border-default, text-primary, layer-colored dot icon
//   - Inactive tab: transparent bg, text-secondary, hover bg-hover
// ── TABS: Overview | Visibility | Trust | Retrieval | Workflow | Discovery | Reports
const BrandIntelTabs = ({ active, onTab, tier = 'Agency' }) => {
  const tabs = [
    { id: 'overview',    label: 'Overview',   icon: LayoutDashboard, layer: null,          minTier: 'Free'    },
    { id: 'visibility',  label: 'Visibility', icon: Eye,              layer: 'visibility',  minTier: 'Starter' },
    { id: 'trust',       label: 'Trust',      icon: Shield,           layer: 'trust',       minTier: 'Growth'  },
    { id: 'retrieval',   label: 'Retrieval',  icon: Cpu,              layer: 'retrieval',   minTier: 'Starter' },
    { id: 'workflow',    label: 'Workflow',   icon: GitBranch,        layer: 'workflow',    minTier: 'Starter' },
    { id: 'discovery',   label: 'Discovery',  icon: Compass,          layer: 'discovery',   minTier: 'Agency'  },
    { id: 'reports',     label: 'Reports',    icon: FileText,         layer: 'comm',        minTier: 'Growth'  },
  ];

  const tierRank = { Free: 0, Starter: 1, Growth: 2, Agency: 3, 'Agency Pro': 4 };
  const userRank = tierRank[tier] ?? 0;

  return (
    <div
      className="flex items-center gap-1 px-1 py-1 overflow-x-auto scrollbar-none border-b mb-8"
      role="tablist"
      aria-label="Intelligence layers"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      {tabs.map(tab => {
        const Icon = tab.icon;
        const isActive = active === tab.id;
        const isLocked = tierRank[tab.minTier] > userRank;
        const layerColor = tab.layer ? LAYER_META[tab.layer]?.color : null;
        return (
          <button
            key={tab.id}
            onClick={() => !isLocked && onTab(tab.id)}
            role="tab"
            aria-selected={isActive}
            aria-disabled={isLocked || undefined}
            className="layer-tab flex items-center gap-1.5 shrink-0"
            style={{
              color:   isActive   ? 'var(--text-primary)'  :
                       isLocked   ? 'var(--text-disabled)' : 'var(--text-secondary)',
              background: isActive ? 'var(--bg-elevated)' : 'transparent',
              borderColor: isActive ? 'var(--border-default)' : 'transparent',
            }}
          >
            <Icon
              style={{
                width: 13, height: 13,
                color: isActive && layerColor ? layerColor : 'inherit',
              }}
            />
            {tab.label}
            {isLocked && <Lock style={{ width: 10, height: 10 }} />}
          </button>
        );
      })}
    </div>
  );
};


// ============================================================
// SCREEN AP-1: ENHANCED DASHBOARD (Sprint 9 — Autopilot UX)
// Route: app/(auth)/dashboard/page.tsx
// SPRINT 9 ADDITIONS to the existing Phase 1 dashboard:
//   1. AI Visibility Health Check card (first-audit users)
//   2. Autopilot Progress Tracker (replaces empty KPI space)
//   3. AI Visibility Wins Feed (below Recent audits)
// EXACT LAYOUT:
//   - Page: max-w-7xl mx-auto px-8 py-8
//   - Header: "Welcome back, {name}" h1 text-2xl font-semibold + "All systems normal" badge
//   - 4 KPI cards: grid grid-cols-4 gap-4 mb-8 (Phase 1, unchanged)
//   - Progress Tracker: 2-col grid (tracker card + quick-actions) mb-8
//   - Recent audits card (Phase 1, unchanged)
//   - Wins Feed: NEW below recent audits
// ============================================================
const EnhancedDashboard = ({ onNav }) => {
  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px' }}>

        {/* HEADER ROW */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              Welcome back, Sri.
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              Here's what's happening across your brands.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* "All systems normal" badge: text-[12px], success-soft bg, success fg, green dot */}
            <span
              className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 py-1 rounded-full"
              style={{ background: 'var(--success-soft)', color: 'var(--success)' }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              All systems normal
            </span>
          </div>
        </div>

        {/* FIRST-AUDIT HEALTH CHECK ENTRY (NAV-01 fix v8.57: the health-check screen was
            implemented but unreachable — surfaced here as the post-first-audit aha-moment entry,
            per LLD Sprint 10 packaging spec). */}
        <button
          onClick={() => onNav('health-check')}
          className="w-full flex items-center justify-between px-5 py-4 rounded-xl mb-6 text-left"
          style={{ background: 'var(--autopilot-gradient)', backgroundSize: '200% auto', animation: 'gradient-shift 4s ease infinite' }}
        >
          <div className="flex items-center gap-3">
            <Activity style={{ width: 18, height: 18, color: 'rgba(255,255,255,0.9)', flexShrink: 0 }} />
            <div>
              <div className="text-[13px] font-semibold" style={{ color: '#fff' }}>
                Bondi Plumbing's AI Visibility Health Check is ready
              </div>
              <div className="text-[12px]" style={{ color: 'rgba(255,255,255,0.7)' }}>
                See your first-audit score, traffic-light breakdown, and #1 recommended action.
              </div>
            </div>
          </div>
          <span className="flex items-center gap-1 text-[12px] font-medium shrink-0" style={{ color: '#fff' }}>
            View health check <ArrowRight style={{ width: 12, height: 12 }} />
          </span>
        </button>

        {/* ── AUTOPILOT PROGRESS TRACKER (Sprint 9) ── */}
        {/* TWO-STATE DISPLAY per v8.32 UX Refinement 1:
            Left card: Work Completed (tasks done this month, shown immediately)
            Right card: Measured Impact (lift, shows "pending" until re-audit runs) */}
        {/* Section header + entry point to the full Autopilot Loop screen (NAV-01 fix v8.57:
            the autopilot screen was implemented but unreachable — wired here, its Sprint 9 home). */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Target style={{ width: 14, height: 14, color: 'var(--layer-workflow)' }} />
            <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>Autopilot</span>
          </div>
          <button
            onClick={() => onNav('autopilot')}
            className="flex items-center gap-1 text-[12px] font-medium"
            style={{ color: 'var(--layer-workflow)' }}
          >
            View full loop <ArrowRight style={{ width: 12, height: 12 }} />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-6">

          {/* WORK COMPLETED — shown immediately when tasks are marked done */}
          {/* Card: padding 20px, rounded-xl, gradient-border-card for premium feel */}
          <div
            className="gradient-border-card"
          >
            <div className="gradient-border-card-inner p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div
                    className="w-7 h-7 rounded-md flex items-center justify-center"
                    style={{ background: 'var(--layer-workflow-soft)' }}
                  >
                    <CheckCircle2 style={{ width: 14, height: 14, color: 'var(--layer-workflow)' }} />
                  </div>
                  <div>
                    <div className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>Work Completed</div>
                    <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>This month</div>
                  </div>
                </div>
                {/* Month selector: text-[11px], text-tertiary, ChevronDown */}
                <button className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  Jun 2026 <ChevronDown style={{ width: 10, height: 10 }} />
                </button>
              </div>
              {/* Big number: text-4xl, font-mono, layer-workflow color.
                  NUM-01 (v8.59): this is the LLD Action Progress Tracker metric
                  "X of N gaps closed this month" (source: COUNT(remediation_tasks
                  WHERE status='complete' AND updated_at >= period_start), across the
                  org). It is intentionally a DIFFERENT scope from WorkflowHub's
                  single-brand "Done this month" task counter — they need not match. */}
              <div
                className="text-4xl font-semibold tracking-tight mb-1"
                style={{ color: 'var(--layer-workflow)', fontFamily: 'var(--font-mono)' }}
              >
                4 <span className="text-xl" style={{ color: 'var(--text-tertiary)' }}>/ 11</span>
              </div>
              <div className="text-[12px] mb-4" style={{ color: 'var(--text-secondary)' }}>
                gaps closed this month
              </div>
              {/* Task progress pills: sample of recently closed gaps (illustrative, not a count) */}
              <div className="flex flex-wrap gap-1.5">
                {['Wikipedia entry', 'AU directories', 'Schema markup'].map(t => (
                  <span
                    key={t}
                    className="text-[10px] px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--layer-workflow-soft)', color: 'var(--layer-workflow)' }}
                  >
                    ✓ {t}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* MEASURED IMPACT — shows "pending" until re-audit runs (score_after IS NOT NULL) */}
          <div
            className="rounded-xl p-5"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-md flex items-center justify-center"
                  style={{ background: 'var(--accent-blue-soft)' }}
                >
                  <Activity style={{ width: 14, height: 14, color: 'var(--accent-blue)' }} />
                </div>
                <div>
                  <div className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>Measured Impact</div>
                  <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>After re-audit</div>
                </div>
              </div>
            </div>
            {/* State A — pending (no score_after yet): Show "validation scheduled" */}
            <div className="flex items-start gap-3 py-2 px-3 rounded-lg" style={{ background: 'var(--bg-subtle)' }}>
              <Clock style={{ width: 14, height: 14, marginTop: 2, color: 'var(--warning)', flexShrink: 0 }} />
              <div>
                <div className="text-[12px] font-medium" style={{ color: 'var(--text-primary)' }}>
                  Validation audit scheduled
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                  Measured impact pending — re-audit runs in ~10 days
                </div>
              </div>
            </div>
            {/* State B (shown when score_after IS SET):
                ← Commented out — render this when score_after is not null:
                <div className="text-4xl font-semibold tracking-tight mb-1"
                     style={{ color: 'var(--success)', fontFamily: 'var(--font-mono)' }}>
                  +8%
                </div>
                <div className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                  Citation rate improvement · verified by re-audit
                </div>
            */}
          </div>
        </div>

        {/* ── 4 KPI CARDS (Phase 1 — unchanged) ── */}
        {/* grid grid-cols-4 gap-4 mb-8, each card: rounded-xl p-5, bg-elevated, border-default */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Brands tracked',    value: '1',      icon: Building2, sub: 'of 5 limit'      },
            { label: 'Audits this month', value: '4',      icon: Activity,  sub: '↑2 vs last month' },
            { label: 'Avg visibility',    value: '42.3',   icon: Eye,       sub: '+4.1 this month'  },
            { label: 'LLM spend',         value: 'US$9.80',icon: Zap,       sub: '≈ A$15.08 · 4 audits' },
          ].map((k, i) => {
            const Icon = k.icon;
            return (
              <div
                key={i}
                className="rounded-xl p-5"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>{k.label}</span>
                  <Icon style={{ width: 14, height: 14, color: 'var(--text-tertiary)' }} />
                </div>
                {/* Value: text-2xl font-semibold fontFamily var(--font-mono) */}
                <div className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                  {k.value}
                </div>
                <div className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>{k.sub}</div>
              </div>
            );
          })}
        </div>

        {/* ── RECENT AUDITS (Phase 1 — unchanged) ── */}
        <div className="rounded-xl mb-6" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Recent audits</h3>
              <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'var(--accent-muted)', color: 'var(--text-secondary)' }}>4</span>
            </div>
            <button className="text-[12px] flex items-center gap-1" style={{ color: 'var(--accent-blue)' }}>
              View all <ArrowRight style={{ width: 12, height: 12 }} />
            </button>
          </div>
          {[
            { brand: 'Bondi Plumbing', region: 'NSW · Bondi', score: '42.3', status: 'complete', time: '2h ago'  },
            { brand: 'Bondi Plumbing', region: 'NSW · Bondi', score: '38.1', status: 'complete', time: '1w ago'  },
          ].map((a, i) => (
            <div key={i} className="flex items-center px-5 py-3.5 border-b last:border-b-0 hover:bg-[var(--bg-hover)] cursor-pointer" style={{ borderColor: 'var(--border-subtle)' }}>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{a.brand}</div>
                <div className="text-[11px] flex items-center gap-1 mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                  <MapPin style={{ width: 10, height: 10 }} />{a.region}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{a.score}</span>
                <StatusBadge status={a.status} />
                <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{a.time}</span>
                <ChevronRight style={{ width: 14, height: 14, color: 'var(--text-tertiary)' }} />
              </div>
            </div>
          ))}
        </div>

        {/* ── AI VISIBILITY WINS FEED (Sprint 9 — NEW) ── */}
        {/* ORDERING: detected_at DESC — newest first (per v8.32 Rec 5)
            TIERS: Starter+ (Free sees a single teaser win to drive upgrade)
            WIRE: GET /api/brands/[id]/wins — computed from Phase 2 tables at read time
            DISPLAY: chronological timeline, each win is a dated event story */}
        <div className="rounded-xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
          <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="flex items-center gap-2">
              {/* Sparkles icon 14px, accent-blue */}
              <Sparkles style={{ width: 14, height: 14, color: 'var(--accent-blue)' }} />
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>AI Visibility Wins</h3>
              {/* "likely linked to" disclaimer badge */}
              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-muted)', color: 'var(--text-tertiary)' }}>
                likely linked to your actions
              </span>
            </div>
            <button className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>See all</button>
          </div>

          {/* Win events — ORDER BY detected_at DESC */}
          {[
            {
              icon: TrendingUp, iconColor: 'var(--success)', iconBg: 'var(--success-soft)',
              title: 'ChatGPT cited your brand',
              desc:  'Bondi Plumbing appeared in 3 new ChatGPT responses for "plumber Bondi"',
              time:  '2 days ago', tag: 'Citation gained',
            },
            {
              icon: Award, iconColor: 'var(--accent-blue)', iconBg: 'var(--accent-blue-soft)',
              title: 'Visibility rate up 12%',
              desc:  'Frequency score improved from 20.0 → 32.4 after Wikipedia entry created',
              time:  '1 week ago', tag: 'Score improved',
            },
            {
              icon: Target, iconColor: 'var(--layer-trust)', iconBg: 'var(--layer-trust-soft)',
              title: 'Competitor citation rate decreased',
              desc:  'Eastern Plumbing\'s citation rate dropped from 67% → 52% this month',
              time:  '2 weeks ago', tag: 'Competitor gap closed',
            },
          ].map((win, i) => {
            const Icon = win.icon;
            return (
              <div key={i} className="wins-item">
                {/* Win icon: 32px circle, layer-soft bg, colored icon */}
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: win.iconBg }}>
                  <Icon style={{ width: 14, height: 14, color: win.iconColor }} />
                </div>
                <div className="flex-1 min-w-0">
                  {/* Tag chip */}
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-medium mb-1 inline-block" style={{ background: 'var(--accent-muted)', color: 'var(--text-tertiary)' }}>
                    {win.tag}
                  </span>
                  <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>{win.title}</div>
                  <div className="text-[12px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>{win.desc}</div>
                </div>
                <div className="text-[11px] shrink-0" style={{ color: 'var(--text-tertiary)' }}>{win.time}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// SCREEN AP-2: AI VISIBILITY HEALTH CHECK (Sprint 9)
// Route: app/(auth)/brands/[brandId]/health-check/page.tsx
// Shown after a brand's FIRST completed audit — the "aha moment".
// Converts trial users into paying customers.
// EXACT LAYOUT:
//   - Full-width banner: autopilot gradient bg, white text
//   - "Your AI Visibility Health Check" heading
//   - Overall score: circular gauge, large mono number, status label
//   - 5 dimension traffic-light cards: grid grid-cols-5
//   - "Your #1 recommended action" card with blue border
//   - Call to action: "Start improving" button
// ============================================================
const HealthCheck = ({ onNav }) => {
  // S9-02 (v8.68): the Health Check is a CROSS-LAYER SYNTHESIS, not the raw audit multidim.
  // Dimensions + green/amber/red thresholds per the LLD (Phase 1 multidim + S7 technical + S6 agent):
  //   AI Sentiment ← audits.scoreSentimentNumeric (green ≥70 / amber 40-69 / red <40)
  //   AI Presence  ← audits.scoreFrequency        (green ≥60 / amber 30-59 / red <30)
  //   Site Readiness ← technical_audits.scoreComposite (green ≥75 / amber 45-74 / red <45)
  //   Local Authority ← agent_readiness_scores.local_ai_trust_score (SKIP for SaaS brands — null)
  //   + the #1 recommended action is the 5th "section" (its own card below, top open remediation_task).
  // status maps to the green/amber/red health tokens (here labelled great/good/moderate/poor for the
  // existing statusColor/statusLabel maps): green→good/great, amber→moderate, red→poor.
  const dims = [
    { name: 'AI Sentiment',    score: 60, max: 100, status: 'good',     icon: ThumbsUp },  // scoreSentimentNumeric
    { name: 'AI Presence',     score: 20, max: 100, status: 'poor',     icon: Eye      },  // scoreFrequency
    { name: 'Site Readiness',  score: 48, max: 100, status: 'moderate', icon: Globe    },  // technical_audits.scoreComposite
    { name: 'Local Authority', score: 35, max: 100, status: 'poor',     icon: MapPin   },  // agent_readiness local_ai_trust_score (skip for SaaS)
  ];
  const statusColor = { great: 'var(--health-great)', good: 'var(--health-good)', moderate: 'var(--health-moderate)', poor: 'var(--health-poor)' };
  const statusLabel = { great: 'Great', good: 'Good', moderate: 'Needs work', poor: 'Critical' };

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--bg-base)' }}>

      {/* HERO BANNER — autopilot gradient, full width */}
      {/* gradient-shift animation, background-size 200% auto */}
      <div
        className="px-8 py-10 text-center"
        style={{
          background: 'var(--autopilot-gradient)',
          backgroundSize: '200% auto',
          animation: 'gradient-shift 4s ease infinite',
        }}
      >
        <div className="flex items-center justify-center gap-2 mb-3">
          <Activity style={{ width: 20, height: 20, color: 'rgba(255,255,255,0.8)' }} />
          <span className="text-[13px] font-medium" style={{ color: 'rgba(255,255,255,0.8)' }}>
            AI Visibility Health Check
          </span>
        </div>
        <h1 className="text-3xl font-semibold mb-2" style={{ color: '#fff' }}>
          Bondi Plumbing's AI Presence
        </h1>
        <p className="text-[14px]" style={{ color: 'rgba(255,255,255,0.7)' }}>
          Based on your first audit across 4 AI engines · 5 Jun 2026
        </p>

        {/* OVERALL SCORE — large circular indicator */}
        {/* 96px circle, white border 3px, semi-opaque bg, mono score */}
        <div className="flex flex-col items-center mt-8">
          <div
            className="w-24 h-24 rounded-full flex flex-col items-center justify-center"
            style={{
              border: '3px solid rgba(255,255,255,0.4)',
              background: 'rgba(255,255,255,0.1)',
            }}
          >
            <span
              className="text-3xl font-semibold"
              style={{ color: '#fff', fontFamily: 'var(--font-mono)' }}
            >
              25
            </span>
            <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.6)' }}>/100</span>
          </div>
          {/* Status label pill */}
          <span
            className="mt-3 text-[12px] font-medium px-3 py-1 rounded-full"
            style={{ background: 'rgba(239,68,68,0.2)', color: '#fca5a5' }}
          >
            Critical — significant room to improve
          </span>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px' }}>

        {/* 5 DIMENSION TRAFFIC-LIGHT CARDS */}
        {/* grid grid-cols-5 gap-3 mb-8 */}
        <div className="grid grid-cols-4 gap-3 mb-8">
          {dims.map(d => {
            const Icon = d.icon;
            const color = statusColor[d.status];
            return (
              <div
                key={d.name}
                className="rounded-xl p-4 text-center"
                style={{ background: 'var(--bg-elevated)', border: `1px solid color-mix(in srgb, ${color} 19%, transparent)` }}
              >
                {/* Status dot + icon */}
                <div className="flex items-center justify-center gap-1.5 mb-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                  <Icon style={{ width: 13, height: 13, color }} />
                </div>
                <div className="text-[12px] font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{d.name}</div>
                {/* Score: text-2xl font-mono, status-colored */}
                <div
                  className="text-2xl font-semibold"
                  style={{ color, fontFamily: 'var(--font-mono)' }}
                >
                  {d.score}
                </div>
                <div className="text-[10px] mt-1" style={{ color: 'var(--text-tertiary)' }}>{statusLabel[d.status]}</div>
                {/* Thin score bar */}
                <div className="h-1 rounded-full mt-2 overflow-hidden" style={{ background: 'var(--bg-hover)' }}>
                  <div className="h-full rounded-full" style={{ width: `${d.score}%`, background: color }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* TOP RECOMMENDED ACTION */}
        {/* Card: blue border, Sparkles icon, action title, expected lift */}
        <div className="rounded-xl p-6 mb-6" style={{ border: '2px solid var(--accent-blue)', background: 'var(--bg-elevated)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles style={{ width: 16, height: 16, color: 'var(--accent-blue)' }} />
            <span className="text-[12px] font-semibold" style={{ color: 'var(--accent-blue)' }}>
              Your #1 recommended action
            </span>
            <ConfidenceBadge label="confirmed" />
          </div>
          <div className="text-base font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
            Add a Wikipedia entry for Bondi Plumbing
          </div>
          <div className="text-[13px] mb-4" style={{ color: 'var(--text-secondary)' }}>
            Wikipedia pages appear in 47.9% of ChatGPT top-10 citations. Adding one is your fastest path to improving your Frequency score.
          </div>
          <div className="flex items-center gap-4">
            {/* Expected lift: success-colored */}
            <div className="flex items-center gap-1.5 text-[13px]" style={{ color: 'var(--success)' }}>
              <TrendingUp style={{ width: 14, height: 14 }} />
              <span className="font-medium">Expected: +8–12 pts</span>
            </div>
            <div className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>· Frequency dimension · 4–8 weeks</div>
          </div>
        </div>

        {/* CTA BUTTONS */}
        <div className="flex gap-3">
          <button
            onClick={() => onNav('action-center')}
            className="h-10 px-6 text-[14px] font-medium rounded-lg flex items-center gap-2"
            style={{ background: 'var(--accent-primary)', color: 'var(--accent-primary-fg)' }}
          >
            <Rocket style={{ width: 15, height: 15 }} />
            Start improving
          </button>
          <button
            className="h-10 px-5 text-[14px] font-medium rounded-lg"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
          >
            View full audit results
          </button>
        </div>
      </div>
    </div>
  );
};


// ============================================================
// SCREEN VI-1: VISIBILITY INTELLIGENCE HUB (Sprint 3)
// Route: app/(auth)/brands/[brandId]/visibility/page.tsx
// EXACT LAYOUT:
//   - BrandIntelTabs with active="visibility"
//   - 3 IntelCards: Visibility Score / Share of Voice / Topical Coverage
//   - Row 1: SoV donut chart (2/3) + Mention-Source matrix (1/3)
//   - Row 2: Visibility trend line chart (full width)
//   - Row 3: Topical gaps table (full width)
//   - Footer: Citation Failure Diagnosis CTA card
// ============================================================
const VisibilityHub = ({ onNav, tier = 'Agency' }) => {
  const engines = ['ChatGPT','Claude','Gemini','Perplexity'];
  const sovData = [
    { name: 'Bondi Plumbing',    pct: 34, isYou: true  },
    { name: 'Eastern Plumbing',  pct: 28, isYou: false },
    { name: 'Parramatta Pipes',  pct: 22, isYou: false },
    { name: 'Other',             pct: 16, isYou: false },
  ];
  const topicalGaps = [
    { topic: 'Emergency plumbing 24/7', yourScore: 0,  compScore: 89, gap: 89, difficulty: 'Hard'   },
    { topic: 'Hot water system install', yourScore: 12, compScore: 76, gap: 64, difficulty: 'Medium' },
    { topic: 'Blocked drain Bondi',     yourScore: 24, compScore: 71, gap: 47, difficulty: 'Easy'   },
    { topic: 'Pipe repair Sydney',      yourScore: 31, compScore: 65, gap: 34, difficulty: 'Easy'   },
    { topic: 'Bathroom renovation',     yourScore: 18, compScore: 52, gap: 34, difficulty: 'Medium' },
  ];

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px' }}>

        {/* PAGE HEADER */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Eye style={{ width: 18, height: 18, color: 'var(--layer-visibility)' }} />
              <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Visibility Intelligence</h1>
              <LayerBadge layer="visibility" />
            </div>
            <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
              Bondi Plumbing · Last audit 5 Jun 2026 · 4 engines · 10 prompts
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Time period selector */}
            <button
              className="h-8 px-3 text-[12px] font-medium rounded-md flex items-center gap-1.5"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
            >
              Last 30 days <ChevronDown style={{ width: 12, height: 12 }} />
            </button>
            {/* Competitor selector */}
            <button
              className="h-8 px-3 text-[12px] font-medium rounded-md flex items-center gap-1.5"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
            >
              <Building2 style={{ width: 12, height: 12 }} />
              3 competitors <ChevronDown style={{ width: 12, height: 12 }} />
            </button>
          </div>
        </div>

        {/* BRAND INTEL TABS */}
        <BrandIntelTabs active="visibility" onTab={(t) => onNav(t + '-hub')} tier={tier} />

        {/* 3 INTEL SCORE CARDS */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <IntelCard layer="visibility" label="Visibility Score"   value={42} delta={+4.1} desc="Composite across all 4 engines" />
          <IntelCard layer="visibility" label="Share of Voice"     value={34} unit="%" delta={+6} desc="vs 3 competitors this month" />
          <IntelCard layer="visibility" label="Topical Coverage"   value={38} delta={-2} desc="Of 12 target topics covered" />
        </div>

        {/* ROW 1: SOV CHART (2/3) + MENTION-SOURCE MATRIX (1/3) */}
        <div className="grid grid-cols-3 gap-4 mb-4">

          {/* SHARE OF VOICE CARD — col-span-2 */}
          {/* Card: rounded-xl p-6, bg-elevated, border-default */}
          <div className="col-span-2 rounded-xl p-6" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
            <SectionHeader layer="visibility" title="Share of Voice" subtitle="Who gets cited when someone asks about tradies in Bondi?" />

            {/* Engine tabs: 4 small pills, active = visibility-layer colored */}
            <div className="flex gap-1.5 mb-5">
              {['All engines', ...engines].map((e, i) => (
                <button
                  key={e}
                  className="h-6 px-2.5 text-[11px] font-medium rounded-full"
                  style={{
                    background: i === 0 ? 'var(--layer-visibility-soft)' : 'var(--accent-muted)',
                    color: i === 0 ? 'var(--layer-visibility)' : 'var(--text-secondary)',
                  }}
                >
                  {e}
                </button>
              ))}
            </div>

            {/* SoV bars — each brand gets a horizontal bar with pct label */}
            <div className="space-y-3">
              {sovData.map((b, i) => (
                <div key={i} className="flex items-center gap-3">
                  {/* Brand name: 160px fixed width, text-[13px] */}
                  <div className="w-40 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="text-[13px] font-medium"
                        style={{ color: b.isYou ? 'var(--layer-visibility)' : 'var(--text-secondary)' }}
                      >
                        {b.name}
                      </span>
                      {b.isYou && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'var(--layer-visibility-soft)', color: 'var(--layer-visibility)' }}>
                          you
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Bar track: flex-1, h-6, rounded-md */}
                  <div className="flex-1 h-6 rounded-md overflow-hidden" style={{ background: 'var(--bg-hover)' }}>
                    <div
                      className="h-full rounded-md flex items-center px-2"
                      style={{
                        width: `${b.pct}%`,
                        background: b.isYou
                          ? 'var(--layer-visibility)'
                          : 'var(--bg-active)',
                      }}
                    />
                  </div>
                  {/* Hashage: text-[13px] font-mono w-10 text-right */}
                  <div
                    className="w-10 text-right text-[13px] font-semibold"
                    style={{ color: b.isYou ? 'var(--layer-visibility)' : 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}
                  >
                    {b.pct}%
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* MENTION-SOURCE DIVIDE MATRIX — col-span-1 */}
          {/* 2×2 matrix: X axis = Source type, Y axis = Mention rate */}
          <div className="rounded-xl p-6" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
            <SectionHeader layer="visibility" title="Mention-Source Divide" subtitle="Where visibility comes from" />

            {/* Brand archetype chip */}
            <div className="flex items-center gap-2 mb-4">
              <span className="text-[11px] px-2 py-1 rounded-full font-medium" style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}>
                Source-Dependent
              </span>
            </div>

            {/* 2×2 grid */}
            <div className="grid grid-cols-2 gap-1.5 mb-4">
              {[
                { quad: 'Cited + Mentioned', desc: 'Authority',  active: false, color: 'var(--success)' },
                { quad: 'Cited only',        desc: 'Source-Dep', active: true,  color: 'var(--warning)' },
                { quad: 'Mentioned only',    desc: 'Brand-Led',  active: false, color: 'var(--accent-blue)' },
                { quad: 'Neither',           desc: 'Invisible',  active: false, color: 'var(--danger)' },
              ].map((q, i) => (
                <div
                  key={i}
                  className="p-3 rounded-lg text-center"
                  style={{
                    background: q.active ? `color-mix(in srgb, ${q.color} 9%, transparent)` : 'var(--bg-hover)',
                    border: q.active ? `1px solid color-mix(in srgb, ${q.color} 25%, transparent)` : '1px solid transparent',
                  }}
                >
                  {q.active && <div className="w-2 h-2 rounded-full mx-auto mb-1" style={{ background: q.color }} />}
                  <div className="text-[11px] font-semibold" style={{ color: q.active ? q.color : 'var(--text-tertiary)' }}>{q.desc}</div>
                  <div className="text-[9px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{q.quad}</div>
                </div>
              ))}
            </div>

            {/* Interpretation text */}
            <div className="text-[11px] p-3 rounded-md" style={{ background: 'var(--bg-subtle)', color: 'var(--text-secondary)' }}>
              You're cited by directories but not mentioned by name in AI responses. Build direct brand mentions.
            </div>
          </div>
        </div>

        {/* TOPICAL COVERAGE GAPS TABLE */}
        <div className="rounded-xl p-6 mb-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
          <SectionHeader
            layer="visibility"
            title="Topical Coverage Gaps"
            subtitle="Topics where competitors are cited and you're not"
            action={
              <button
                className="h-7 px-3 text-[12px] font-medium rounded-md flex items-center gap-1.5"
                style={{ background: 'var(--layer-visibility-soft)', color: 'var(--layer-visibility)' }}
              >
                <ArrowRight style={{ width: 12, height: 12 }} />
                All 12 gaps
              </button>
            }
          />

          {/* Table header */}
          <div
            className="grid gap-3 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider border-b mb-1"
            style={{ gridTemplateColumns: '2fr 1fr 1fr 80px 80px', borderColor: 'var(--border-subtle)', color: 'var(--text-tertiary)' }}
          >
            <div>Topic</div>
            <div className="text-right">Your score</div>
            <div className="text-right">Competitor</div>
            <div className="text-right">Gap</div>
            <div className="text-right">Fix effort</div>
          </div>

          {/* Table rows */}
          {topicalGaps.map((g, i) => {
            const diffColor = { Hard: 'var(--danger)', Medium: 'var(--warning)', Easy: 'var(--success)' };
            return (
              <div
                key={i}
                className="grid gap-3 px-3 py-3 rounded-md hover:bg-[var(--bg-hover)] cursor-pointer border-b last:border-b-0"
                style={{ gridTemplateColumns: '2fr 1fr 1fr 80px 80px', borderColor: 'var(--border-subtle)' }}
              >
                <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>{g.topic}</div>
                <div className="text-right text-[13px] font-semibold" style={{ color: g.yourScore < 20 ? 'var(--danger)' : 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{g.yourScore}</div>
                <div className="text-right text-[13px] font-semibold" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{g.compScore}</div>
                <div className="text-right">
                  <span
                    className="text-[12px] font-semibold px-1.5 py-0.5 rounded"
                    style={{ background: 'var(--danger-soft)', color: 'var(--danger)', fontFamily: 'var(--font-mono)' }}
                  >
                    -{g.gap}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[11px]" style={{ color: diffColor[g.difficulty] }}>{g.difficulty}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* CITATION FAILURE DIAGNOSIS CTA */}
        <div
          className="rounded-xl p-5 flex items-center gap-4"
          style={{ background: 'var(--layer-visibility-soft)', border: '1px solid color-mix(in srgb, var(--layer-visibility) 19%, transparent)' }}
        >
          <AlertCircle style={{ width: 20, height: 20, color: 'var(--layer-visibility)', flexShrink: 0 }} />
          <div className="flex-1">
            <div className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              Why is Bondi Plumbing absent from 73% of relevant AI responses?
            </div>
            <div className="text-[12px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Citation Failure Diagnosis identifies the exact patterns preventing your brand from being cited.
            </div>
          </div>
          <button
            onClick={() => onNav('citation-failure')}
            className="h-8 px-4 text-[12px] font-medium rounded-md shrink-0"
            style={{ background: 'var(--layer-visibility)', color: '#fff' }}
          >
            Run diagnosis
          </button>
        </div>

        {/* COMPETITIVE BENCHMARK ENTRY (NAV-01 fix v8.57: 'competitive' screen was implemented
            but unreachable — wired here as a sibling to Citation Failure, per LLD Sprint 3 which
            delivers SoV + Competitive Benchmark together off the Visibility hub). */}
        <div
          className="flex items-center gap-3 p-4 rounded-xl"
          style={{ background: 'var(--layer-visibility-soft)', border: '1px solid color-mix(in srgb, var(--layer-visibility) 19%, transparent)' }}
        >
          <Layers style={{ width: 20, height: 20, color: 'var(--layer-visibility)', flexShrink: 0 }} />
          <div className="flex-1">
            <div className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              How do you stack up against Eastern Plumbing &amp; Parramatta Pipes?
            </div>
            <div className="text-[12px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              Competitive Benchmark compares share of voice, owned topics, and win rate per competitor.
            </div>
          </div>
          <button
            onClick={() => onNav('competitive')}
            className="h-8 px-4 text-[12px] font-medium rounded-md shrink-0"
            style={{ background: 'var(--layer-visibility)', color: '#fff' }}
          >
            View benchmark
          </button>
        </div>

      </div>
    </div>
  );
};

// ============================================================
// SCREEN VI-2: CITATION FAILURE DIAGNOSIS (Sprint 3)
// Route: app/(auth)/brands/[brandId]/visibility/citation-failure/page.tsx
// EXACT LAYOUT:
//   - Page header: "Citation Failure Diagnosis" + brand + audit selector
//   - Severity summary bar (3 buckets: critical/warning/info)
//   - 3–5 diagnosis cards (patternLock, severity, evidence, fix)
//   - Each card: colored left border, pattern title, evidence quote, fix CTA
// ============================================================
const CitationFailureDiagnosis = ({ onNav }) => {
  const diagnoses = [
    {
      severity: 'critical',
      pattern: 'No Wikipedia or encyclopedia entry',
      evidence: 'Competitors with Wikipedia entries appear 2.3× more frequently in AI citations (Princeton GEO 2024)',
      sources: 3,
      fix: 'Add Wikipedia entry',
      fixNav: 'action-center',
    },
    {
      severity: 'critical',
      pattern: 'AU directory listings incomplete',
      evidence: 'hipages and Yellow Pages AU not found in citation sources for "plumber Bondi" queries',
      sources: 5,
      fix: 'Complete directory listings',
      fixNav: 'action-center',
    },
    {
      severity: 'warning',
      pattern: 'Content missing for 5 high-traffic topics',
      evidence: 'No indexed content for "emergency plumber Bondi", "hot water system install Sydney"',
      sources: 8,
      fix: 'Create topical content',
      fixNav: 'action-center',
    },
    {
      severity: 'info',
      pattern: 'Competitor is cited instead for 3 comparison queries',
      evidence: 'Eastern Plumbing cited in "{brand} vs Eastern Plumbing" prompts — you are mentioned but not recommended',
      sources: 2,
      fix: 'Review comparison positioning',
      fixNav: 'action-center',
    },
  ];
  const severityStyle = {
    critical: { color: 'var(--danger)', bg: 'var(--danger-soft)', border: 'var(--danger)', icon: XCircle       },
    warning:  { color: 'var(--warning)', bg: 'var(--warning-soft)', border: 'var(--warning)', icon: AlertTriangle },
    info:     { color: 'var(--info)', bg: 'var(--info-soft)', border: 'var(--info)', icon: Info               },
  };

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px' }}>

        {/* HEADER */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <button
              onClick={() => onNav('visibility-hub')}
              className="flex items-center gap-1.5 text-[12px] mb-3"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <ChevronLeft style={{ width: 14, height: 14 }} /> Back to Visibility
            </button>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Citation Failure Diagnosis</h1>
            <p className="text-[13px] mt-1" style={{ color: 'var(--text-secondary)' }}>
              Bondi Plumbing · Audit #4 · 5 Jun 2026 · 4 patterns identified
            </p>
          </div>
          {/* Severity summary */}
          <div className="flex items-center gap-3">
            {[
              { label: '2 Critical', color: 'var(--danger)', bg: 'var(--danger-soft)'  },
              { label: '1 Warning',  color: 'var(--warning)', bg: 'var(--warning-soft)' },
              { label: '1 Info',     color: 'var(--info)', bg: 'var(--info-soft)'     },
            ].map(s => (
              <span key={s.label} className="text-[11px] font-medium px-2.5 py-1 rounded-full" style={{ background: s.bg, color: s.color }}>
                {s.label}
              </span>
            ))}
          </div>
        </div>

        {/* DIAGNOSIS CARDS */}
        <div className="space-y-4">
          {diagnoses.map((d, i) => {
            const s = severityStyle[d.severity];
            const Icon = s.icon;
            return (
              <div
                key={i}
                className="rounded-xl p-6"
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-default)',
                  borderLeft: `3px solid ${s.border}`,
                }}
              >
                <div className="flex items-start gap-4">
                  {/* Severity icon */}
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: s.bg }}
                  >
                    <Icon style={{ width: 15, height: 15, color: s.color }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Pattern title */}
                    <div className="flex items-center gap-2 mb-1.5">
                      <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{d.pattern}</h3>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium capitalize" style={{ background: s.bg, color: s.color }}>{d.severity}</span>
                    </div>

                    {/* Evidence quote */}
                    <div
                      className="text-[12px] italic px-3 py-2 rounded-md mb-3"
                      style={{ background: 'var(--bg-subtle)', color: 'var(--text-secondary)', borderLeft: `2px solid ${s.border}` }}
                    >
                      {d.evidence}
                    </div>

                    {/* Evidence count + fix CTA */}
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] flex items-center gap-1.5" style={{ color: 'var(--text-tertiary)' }}>
                        <BookMarked style={{ width: 11, height: 11 }} />
                        {d.sources} evidence sources
                      </div>
                      <button
                        onClick={() => onNav(d.fixNav)}
                        className="h-7 px-3 text-[12px] font-medium rounded-md flex items-center gap-1.5"
                        style={{ background: s.bg, color: s.color }}
                      >
                        {d.fix} <ArrowRight style={{ width: 11, height: 11 }} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
};


// ============================================================
// SCREEN VI-3: COMPETITIVE BENCHMARK WORKSPACE (Sprint 3)
// Route: app/(auth)/brands/[brandId]/visibility/competitive/page.tsx
// TIER GATES: Growth = 1 competitor, Agency = 3, Agency Pro = unlimited
// EXACT LAYOUT:
//   - Competitor selector (Growth: 1 slot, Agency: 3 slots)
//   - Summary battle card: You vs Competitor (citations % + gap)
//   - 4 metric rows: SoV / Topics they own / Win rate / Citation sources
//   - "Your fastest path" action card (accent-blue border)
// ============================================================
const CompetitiveBenchmark = ({ onNav, tier = 'Agency' }) => {
  const competitor = 'Eastern Plumbing';
  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px' }}>

        {/* HEADER */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Competitive Benchmark</h1>
            <p className="text-[13px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>Why competitors win in AI search — and how to close the gap</p>
          </div>
          {/* Competitor selector: dropdown */}
          <button
            className="h-9 px-4 text-[13px] font-medium rounded-md flex items-center gap-2"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
          >
            <Building2 style={{ width: 14, height: 14, color: 'var(--text-tertiary)' }} />
            {competitor}
            <ChevronDown style={{ width: 12, height: 12, color: 'var(--text-tertiary)' }} />
          </button>
        </div>

        {/* BATTLE CARD — prominent comparison */}
        {/* Gradient border card: autopilot-gradient border, flex row */}
        <div className="gradient-border-card mb-6">
          <div className="gradient-border-card-inner p-6">
            <div className="grid grid-cols-3 gap-4 items-center">

              {/* YOU side */}
              <div className="text-center">
                <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>You</div>
                <div className="text-4xl font-semibold" style={{ color: 'var(--layer-visibility)', fontFamily: 'var(--font-mono)' }}>34%</div>
                <div className="text-[12px] mt-1" style={{ color: 'var(--text-secondary)' }}>Citation rate</div>
                <div className="mt-3 text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>Bondi Plumbing</div>
              </div>

              {/* VS divider */}
              <div className="text-center">
                <div className="text-lg font-bold" style={{ color: 'var(--text-tertiary)' }}>vs</div>
                <div className="mt-2 text-[11px] px-2 py-1 rounded-full" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
                  −33% gap
                </div>
                <div className="mt-2 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>They appear 2.0× more</div>
              </div>

              {/* COMPETITOR side */}
              <div className="text-center">
                <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>Competitor</div>
                <div className="text-4xl font-semibold" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>67%</div>
                <div className="text-[12px] mt-1" style={{ color: 'var(--text-secondary)' }}>Citation rate</div>
                <div className="mt-3 text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>{competitor}</div>
              </div>
            </div>
          </div>
        </div>

        {/* METRIC BREAKDOWN */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {[
            { label: 'Topics they own that you don\'t', you: '3 topics', them: '8 topics', icon: Layers,      insight: 'Emergency, pricing, comparison queries' },
            { label: 'Win rate on head-to-head queries',  you: '32%',     them: '68%',     icon: Target,      insight: '{brand} vs {competitor} prompts' },
            { label: 'Primary citation sources',          you: 'hipages',  them: 'Wikipedia + Yelp + hipages', icon: Link2, insight: 'They have 3 sources; you have 1' },
            { label: 'Response position (avg)',            you: '#3.4',     them: '#1.8',    icon: Award,       insight: 'They appear 1.9 positions higher on avg' },
          ].map((m, i) => {
            const Icon = m.icon;
            return (
              <div key={i} className="rounded-xl p-5" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
                <div className="flex items-center gap-2 mb-3">
                  <Icon style={{ width: 14, height: 14, color: 'var(--text-tertiary)' }} />
                  <span className="text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>{m.label}</span>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-tertiary)' }}>You</div>
                    <div className="text-[16px] font-semibold" style={{ color: 'var(--layer-visibility)', fontFamily: 'var(--font-mono)' }}>{m.you}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-tertiary)' }}>Them</div>
                    <div className="text-[16px] font-semibold" style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{m.them}</div>
                  </div>
                </div>
                <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{m.insight}</div>
              </div>
            );
          })}
        </div>

        {/* YOUR FASTEST PATH */}
        <div className="rounded-xl p-6" style={{ border: '2px solid var(--accent-blue)', background: 'var(--bg-elevated)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Rocket style={{ width: 16, height: 16, color: 'var(--accent-blue)' }} />
            <span className="text-[13px] font-semibold" style={{ color: 'var(--accent-blue)' }}>Your fastest path to close the gap</span>
          </div>
          <div className="text-base font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
            Target emergency plumber queries — {competitor} owns them but your content gap is fixable in 2 weeks
          </div>
          <div className="text-[13px] mb-4" style={{ color: 'var(--text-secondary)' }}>
            Eastern Plumbing's citation advantage is primarily from Wikipedia (1 source) + emergency keyword coverage. Cpuh are actionable with existing content.
          </div>
          <button
            onClick={() => onNav('action-center')}
            className="h-9 px-5 text-[13px] font-medium rounded-md flex items-center gap-2"
            style={{ background: 'var(--accent-blue)', color: '#fff' }}
          >
            View action plan <ArrowRight style={{ width: 14, height: 14 }} />
          </button>
        </div>

      </div>
    </div>
  );
};

// ============================================================
// SCREEN WF-1: WORKFLOW INTELLIGENCE HUB (Sprint 2)
// Route: app/(auth)/brands/[brandId]/workflow/page.tsx
// EXACT LAYOUT:
//   - 3 stat cards: Open tasks / In progress / Completed this month
//   - 3 tabs: Tasks | Drafts | Workflow runs
//   - Tasks tab (default): table with priority/title/status/due/action
//   - Quick actions bar: "New task" + "Generate draft" buttons
// ============================================================
const WorkflowHub = ({ onNav }) => {
  const tasks = [
    { priority: 'high',   title: 'Create Wikipedia entry',         status: 'open',        due: '12 Jun', source: 'frequency' },
    { priority: 'high',   title: 'Complete AU directory listings',  status: 'in_progress', due: '10 Jun', source: 'frequency' },
    { priority: 'medium', title: 'Write emergency plumber guide',   status: 'open',        due: '20 Jun', source: 'context'   },
    { priority: 'medium', title: 'Pitch story to local AU media',   status: 'in_progress', due: '15 Jun', source: 'frequency' },
    { priority: 'low',    title: 'Add FAQ schema to service page',  status: 'complete',    due: '2 Jun',  source: 'context'   },
  ];
  const [activeTab, setActiveTab] = useState('tasks');

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px' }}>

        {/* HEADER */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <GitBranch style={{ width: 18, height: 18, color: 'var(--layer-workflow)' }} />
              <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Workflow Intelligence</h1>
              <LayerBadge layer="workflow" />
            </div>
            <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>Bondi Plumbing · Fix → Draft → Approve → Measure</p>
          </div>
          {/* Quick actions */}
          <div className="flex items-center gap-2">
            <button
              className="h-8 px-3 text-[12px] font-medium rounded-md flex items-center gap-1.5"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
            >
              <Plus style={{ width: 12, height: 12 }} /> New task
            </button>
            <button
              onClick={() => onNav('content-draft')}
              className="h-8 px-3 text-[12px] font-medium rounded-md flex items-center gap-1.5"
              style={{ background: 'var(--layer-workflow)', color: '#fff' }}
            >
              <Sparkles style={{ width: 12, height: 12 }} /> Generate draft
            </button>
          </div>
        </div>

        {/* 3 STAT CARDS */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Open tasks',       value: 2, sub: '1 high priority',      color: 'var(--layer-workflow)' },
            { label: 'In progress',      value: 2, sub: 'Avg 4 days active',     color: 'var(--warning)'       },
            { label: 'Done this month',  value: 1, sub: '+5 visibility verified', color: 'var(--success)'       },
          ].map((s, i) => (
            <div key={i} className="rounded-xl p-5" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
              <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>{s.label}</div>
              <div className="text-3xl font-semibold mb-1" style={{ color: s.color, fontFamily: 'var(--font-mono)' }}>{s.value}</div>
              <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{s.sub}</div>
            </div>
          ))}
        </div>

        {/* TABS */}
        <div className="flex gap-1 mb-5 border-b" role="tablist" aria-label="Workflow views" style={{ borderColor: 'var(--border-subtle)' }}>
          {['tasks','drafts','runs'].map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              role="tab"
              aria-selected={activeTab === t}
              className="layer-tab capitalize"
              style={{
                color: activeTab === t ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: activeTab === t ? 'var(--bg-elevated)' : 'transparent',
                borderColor: activeTab === t ? 'var(--border-default)' : 'transparent',
              }}
            >
              {t === 'runs' ? 'Workflow runs' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* TASKS TABLE */}
        {/* Column headers: Priority / Task / Status / Dimension / Due / Actions */}
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-default)' }}>
          {/* Header */}
          <div
            className="grid px-5 py-3 text-[10px] font-semibold uppercase tracking-wider border-b"
            style={{ gridTemplateColumns: '80px 1fr 120px 100px 80px 80px', borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-tertiary)' }}
          >
            <div>Priority</div>
            <div>Task</div>
            <div>Status</div>
            <div>Dimension</div>
            <div>Due</div>
            <div>Actions</div>
          </div>

          {tasks.map((t, i) => (
            <div
              key={i}
              className="grid px-5 py-3.5 items-center border-b last:border-b-0 hover:bg-[var(--bg-hover)] cursor-pointer"
              style={{ gridTemplateColumns: '80px 1fr 120px 100px 80px 80px', borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}
            >
              <div><PriorityBadge priority={t.priority} /></div>
              <div className="text-[13px] font-medium pr-4" style={{ color: 'var(--text-primary)' }}>{t.title}</div>
              <div><StatusBadge status={t.status} /></div>
              <div>
                <span className="text-[11px] capitalize" style={{ color: 'var(--text-tertiary)' }}>{t.source}</span>
              </div>
              <div className="text-[12px]" style={{ color: t.status === 'complete' ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>{t.due}</div>
              <div className="flex items-center gap-1">
                {t.status !== 'complete' && (
                  <button
                    className="w-7 h-7 rounded-md flex items-center justify-center"
                    aria-label={`Generate draft for ${t.title}`}
                    style={{ background: 'var(--layer-workflow-soft)', color: 'var(--layer-workflow)' }}
                  >
                    <Sparkles style={{ width: 12, height: 12 }} />
                  </button>
                )}
                <ChevronRight style={{ width: 14, height: 14, color: 'var(--text-tertiary)' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// SCREEN WF-2: CONTENT DRAFT EDITOR (Sprint 2)
// Route: app/(auth)/brands/[brandId]/workflow/drafts/[draftId]/page.tsx
// EXACT LAYOUT:
//   - Two-panel: left = content editor (2/3), right = context panel (1/3)
//   - Editor: title, content body (editable), format selector
//   - Context panel: source action, target engines, expected impact
//   - Footer: Approve / Request revision / Dismiss buttons
// ============================================================
const ContentDraftEditor = ({ onNav }) => (
  <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'var(--bg-base)' }}>
    {/* Top bar */}
    <div
      className="flex items-center justify-between px-6 py-3 border-b"
      style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}
    >
      <div className="flex items-center gap-3">
        <button onClick={() => onNav('workflow-hub')} aria-label="Back to Workflow" style={{ color: 'var(--text-tertiary)' }}>
          <ChevronLeft style={{ width: 18, height: 18 }} />
        </button>
        <div>
          <div className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>Draft: Wikipedia entry for Bondi Plumbing</div>
          <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>Generated by Claude · Jun 2026 · Format: Wikipedia article</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge status="draft" />
        <LayerBadge layer="workflow" />
      </div>
    </div>

    {/* TWO-PANEL BODY */}
    <div className="flex-1 flex overflow-hidden">

      {/* LEFT: Editor (2/3 width) */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {/* Format chip */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[11px] px-2 py-1 rounded-full font-medium flex items-center gap-1.5" style={{ background: 'var(--layer-workflow-soft)', color: 'var(--layer-workflow)' }}>
            <FileText style={{ width: 10, height: 10 }} /> Wikipedia article
          </span>
          <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>Optimised for ChatGPT + Claude citation</span>
        </div>

        {/* Editable title */}
        <h1
          className="text-2xl font-semibold mb-4 pb-2 border-b"
          style={{ color: 'var(--text-primary)', borderColor: 'var(--border-subtle)', outline: 'none' }}
          role="textbox"
          aria-label="Draft title"
          contentEditable
          suppressContentEditableWarning
        >
          Bondi Plumbing
        </h1>

        {/* Draft body — editable */}
        <div
          className="text-[14px] leading-7 space-y-4"
          style={{ color: 'var(--text-secondary)' }}
          role="textbox"
          aria-multiline="true"
          aria-label="Draft body"
          contentEditable
          suppressContentEditableWarning
        >
          <p>
            <strong style={{ color: 'var(--text-primary)' }}>Bondi Plumbing</strong> is a licensed plumbing company operating in the Bondi and eastern Sydney region of New South Wales, Australia. The company provides residential and commercial plumbing services including pipe repair, hot water system installation, emergency callouts, and bathroom renovation.
          </p>
          <h2 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: 600, marginTop: '20px' }}>Services</h2>
          <p>
            Bondi Plumbing specialises in emergency plumbing response across the eastern suburbs. The company holds a NSW plumbing licence and is listed on major Australian trade directories including hipages and Yellow Pages Australia.
          </p>
          <h2 style={{ color: 'var(--text-primary)', fontSize: '16px', fontWeight: 600, marginTop: '20px' }}>References</h2>
          <p style={{ fontStyle: 'italic', fontSize: '13px', color: 'var(--text-tertiary)' }}>
            [References will be added after secondary source verification — required for Wikipedia notability]
          </p>
        </div>
      </div>

      {/* RIGHT: Context panel (1/3 width) */}
      <div
        className="w-72 shrink-0 border-l overflow-y-auto p-5 space-y-5"
        style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-subtle)' }}
      >
        {/* Source action */}
        <div>
          <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>Source action</div>
          <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>Add Wikipedia entry for Bondi Plumbing</div>
          <PriorityBadge priority="high" />
        </div>

        {/* Content format */}
        <div>
          <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>Content format</div>
          <select className="w-full h-8 px-2 text-[12px] rounded-md" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}>
            <option>Wikipedia article</option>
            <option>Blog post</option>
            <option>FAQ page</option>
            <option>Press release</option>
          </select>
        </div>

        {/* Target engines */}
        <div>
          <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>Optimised for</div>
          <div className="flex flex-wrap gap-1.5">
            {['ChatGPT','Claude','Gemini','Perplexity'].map(e => (
              <span key={e} className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>{e}</span>
            ))}
          </div>
        </div>

        {/* Expected impact */}
        <div>
          <div className="text-[11px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>Expected impact</div>
          <div className="text-[13px] font-semibold" style={{ color: 'var(--success)' }}>+8–12 pts</div>
          <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>Frequency dimension · 4–8 weeks</div>
          <div className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>Confidence: Confirmed</div>
        </div>

        {/* Approval CTA */}
        <div className="space-y-2 pt-2">
          <button className="w-full h-9 text-[13px] font-medium rounded-md flex items-center justify-center gap-2" style={{ background: 'var(--layer-workflow)', color: '#fff' }}>
            <CheckCircle2 style={{ width: 14, height: 14 }} /> Approve draft
          </button>
          <button className="w-full h-9 text-[13px] font-medium rounded-md" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}>
            Request revision
          </button>
          <button className="w-full h-8 text-[12px] font-medium rounded-md" style={{ color: 'var(--text-tertiary)' }}>
            <X style={{ width: 12, height: 12, display: 'inline', marginRight: 4 }} />Dismiss
          </button>
        </div>
      </div>
    </div>
  </div>
);


// ============================================================
// SCREEN TR-1: TRUST INTELLIGENCE HUB (Sprint 5)
// Route: app/(auth)/brands/[brandId]/trust/page.tsx
// EXACT LAYOUT:
//   - 4 trust score cards: Entity score / Hallucination risk / LinkedIn / Consensus
//   - Hallucination incidents feed (latest 3)
//   - Platform presence grid: LinkedIn / YouTube / Knowledge Panel / Wikidata
//   - Cross-Platform Consensus score card
// ============================================================
const TrustHub = ({ onNav }) => {
  const incidents = [
    { type: 'wrong_founder', severity: 'critical', claim: 'AI stated "Bondi Plumbing was founded in 2005"', actual: 'Founded 2018', engines: ['ChatGPT'], time: '2 days ago' },
    { type: 'wrong_location', severity: 'warning', claim: 'AI stated services available in "all of Sydney"', actual: 'Eastern suburbs only', engines: ['Gemini'], time: '1 week ago' },
  ];
  const presence = [
    { platform: 'LinkedIn',       icon: Linkedin, status: 'present',  score: 72, detail: 'Company page · 340 followers' },
    { platform: 'YouTube',        icon: Video,    status: 'absent',   score: 0,  detail: 'No channel detected'          },
    { platform: 'Knowledge Panel',icon: Globe,    status: 'partial',  score: 45, detail: 'Panel exists but incomplete'  },
    { platform: 'Wikidata',       icon: Database, status: 'absent',   score: 0,  detail: 'No Wikidata entry'            },
  ];
  const presenceStyle = { present: 'var(--success)', partial: 'var(--warning)', absent: 'var(--danger)' };

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px' }}>

        {/* HEADER */}
        <div className="flex items-center gap-3 mb-8">
          <Shield style={{ width: 18, height: 18, color: 'var(--layer-trust)' }} />
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Trust Intelligence</h1>
          <LayerBadge layer="trust" />
        </div>

        {/* 4 TRUST SCORE CARDS */}
        {/* DATA-BINDING NOTE (CT-03 v8.63) — each card's /100 value binds as follows:
            • Entity Score    = ROUND(brand_entity_scores.score_of_10 × 10). score_of_10
              NUMERIC(5,2) on a 0–10 scale IS the canonical entity score (LLD D-01/BE-01);
              the ×10 is a pure DISPLAY transform to the IntelCard /100 scale. Do NOT add an
              entity_score column, and do NOT render the raw /10 value against the /100 suffix.
            • Hallucination Risk = derived at read time from hallucination_incidents — open
              incidents only (is_false_positive = false), weighted critical=15 / warning=5 /
              info=1, capped at 100 (canonical derivation documented on the LLD table, CT-04).
              Fixture below: the incident feed on THIS screen shows 1 critical + 1 warning open
              → 15+5 = 20, so the card reads 20 (was 23 — corrected for intra-screen fidelity).
              is_acknowledged does NOT close an incident (acknowledging ≠ corrected).
            • LinkedIn Presence = linkedin_presence_audits.presence_score (already /100, direct).
            • Consensus Score  = ROUND(AVG(consistency_score)) across the brand's
              brand_consensus_checks rows (consistency_score is /100 PER SOURCE, one row per
              source_type); the desc count = COUNT of those rows ("Across 4 platforms"). */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <IntelCard layer="trust" label="Entity Score"       value={58} delta={+3}  desc="Knowledge graph strength" />
          <IntelCard layer="trust" label="Hallucination Risk" value={20} delta={-5}  desc="Lower is better (0=safe)" />
          <IntelCard layer="trust" label="LinkedIn Presence"  value={72} delta={+8}  desc="Company page authority" />
          <IntelCard layer="trust" label="Consensus Score"    value={61} delta={0}   desc="Across 4 platforms" />
        </div>

        <div className="grid grid-cols-3 gap-4">

          {/* HALLUCINATION INCIDENTS */}
          <div className="col-span-2 rounded-xl p-6" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
            <SectionHeader
              layer="trust"
              title="Hallucination Incidents"
              subtitle="AI engines making inaccurate claims about your brand"
              action={
                <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
                  2 active
                </span>
              }
            />

            <div className="space-y-3">
              {incidents.map((inc, i) => {
                const isWarning = inc.severity === 'warning';
                return (
                  <div
                    key={i}
                    className="rounded-lg p-4 cursor-pointer hover:opacity-90"
                    style={{
                      background: isWarning ? 'var(--warning-soft)' : 'var(--danger-soft)',
                      border: `1px solid color-mix(in srgb, ${isWarning ? 'var(--warning)' : 'var(--danger)'} 19%, transparent)`,
                    }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle style={{ width: 14, height: 14, color: isWarning ? 'var(--warning)' : 'var(--danger)' }} />
                        <span
                          className="text-[11px] font-semibold uppercase"
                          style={{ color: isWarning ? 'var(--warning)' : 'var(--danger)' }}
                        >
                          {inc.severity} · {inc.type.replace('_',' ')}
                        </span>
                      </div>
                      <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{inc.time}</span>
                    </div>

                    {/* Claim vs Actual */}
                    <div className="text-[12px] mb-1" style={{ color: 'var(--text-primary)' }}>
                      <span className="font-medium">Claim: </span>{inc.claim}
                    </div>
                    <div className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                      <span className="font-medium">Actual: </span>{inc.actual}
                    </div>

                    {/* Engines affected */}
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Detected in:</span>
                      {inc.engines.map(e => (
                        <span key={e} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,0,0,0.2)', color: 'var(--text-secondary)' }}>{e}</span>
                      ))}
                      <button
                        className="ml-auto text-[11px] font-medium"
                        style={{ color: isWarning ? 'var(--warning)' : 'var(--danger)' }}
                      >
                        Investigate <ChevronRight style={{ width: 10, height: 10, display: 'inline' }} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* PLATFORM PRESENCE GRID */}
          <div className="rounded-xl p-6" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
            <SectionHeader layer="trust" title="Platform Presence" subtitle="Where AI engines find you" />
            <div className="space-y-3">
              {presence.map((p, i) => {
                const Icon = p.icon;
                const color = presenceStyle[p.status];
                return (
                  <div key={i} className="flex items-center gap-3">
                    {/* Platform icon in colored circle */}
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: p.status === 'absent' ? 'var(--bg-hover)' : `color-mix(in srgb, ${color} 9%, transparent)` }}
                    >
                      <Icon style={{ width: 14, height: 14, color: p.status === 'absent' ? 'var(--text-tertiary)' : color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>{p.platform}</span>
                        <span className="text-[12px] font-semibold" style={{ color, fontFamily: 'var(--font-mono)' }}>
                          {p.status === 'absent' ? '—' : p.score}
                        </span>
                      </div>
                      <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{p.detail}</div>
                      {/* Mini bar */}
                      {p.score > 0 && (
                        <div className="h-0.5 rounded-full mt-1.5 overflow-hidden" style={{ background: 'var(--bg-hover)' }}>
                          <div className="h-full rounded-full" style={{ width: `${p.score}%`, background: color }} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <button className="w-full mt-4 h-8 text-[12px] font-medium rounded-md" style={{ background: 'var(--layer-trust-soft)', color: 'var(--layer-trust)' }}>
              Add missing profiles →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// SCREEN RT-1: RETRIEVAL INTELLIGENCE + AGENT READINESS (Sprint 6)
// Route: app/(auth)/brands/[brandId]/retrieval/page.tsx
// EXACT LAYOUT:
//   - Hero: Agent Readiness score (large, purple) + 5 sub-dimension bars
//   - 3-col grid: llms.txt status / MCP endpoint / Entity Home
//   - Content Structure breakdown: 8 technical checks
// ============================================================
const RetrievalHub = ({ onNav }) => {
  // 5 canonical agent-readiness dimensions (LLD GAP 2: 5 × /20 = /100).
  // Maps to agent_readiness_scores: tech_score, entity_clarity_score, verify_score,
  // authority_score, task_score. Sub-signals (llms.txt, MCP, etc.) roll up into Technical.
  const agentDims = [
    { name: 'Technical Accessibility', score: 3,  max: 20, status: 'fail' },  // llms.txt + MCP missing
    { name: 'Entity Clarity',          score: 5,  max: 20, status: 'fail' },
    { name: 'Claim Verifiability',     score: 6,  max: 20, status: 'warn' },
    { name: 'Category Authority',      score: 4,  max: 20, status: 'fail' },
    { name: 'Task-Fit Signals',        score: 7,  max: 20, status: 'warn' },
  ];
  // Total = 25/100 (matches the hero gauge; agent_readiness_scores.total_score = sum of 5 dims)

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px' }}>

        {/* HEADER */}
        <div className="flex items-center gap-3 mb-8">
          <Cpu style={{ width: 18, height: 18, color: 'var(--layer-retrieval)' }} />
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Retrieval Intelligence</h1>
          <LayerBadge layer="retrieval" />
        </div>

        {/* AGENT READINESS HERO */}
        <div
          className="rounded-xl p-6 mb-6"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}
        >
          <div className="grid grid-cols-3 gap-8 items-center">

            {/* Big score */}
            <div className="text-center">
              <div className="text-[12px] uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>Agent Readiness Score</div>
              {/* Circular score display: 80px circle, purple border, mono number */}
              <div
                className="w-20 h-20 rounded-full flex flex-col items-center justify-center mx-auto mb-2"
                style={{ border: '3px solid var(--layer-retrieval)', background: 'var(--layer-retrieval-soft)' }}
              >
                <span className="text-2xl font-semibold" style={{ color: 'var(--layer-retrieval)', fontFamily: 'var(--font-mono)' }}>25</span>
                <span className="text-[9px]" style={{ color: 'var(--text-tertiary)' }}>/100</span>
              </div>
              <span className="text-[12px] font-medium px-3 py-1 rounded-full" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
                Not AI-agent ready
              </span>
            </div>

            {/* Dimension breakdown */}
            <div className="col-span-2">
              <div className="text-[12px] font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>Dimension breakdown</div>
              <div className="space-y-2.5">
                {agentDims.map(d => {
                  const pct = (d.score / d.max) * 100;
                  const color = d.status === 'pass' ? 'var(--success)' : d.status === 'warn' ? 'var(--warning)' : 'var(--danger)';
                  return (
                    <div key={d.name} className="flex items-center gap-3">
                      <div className="w-36 text-[12px]" style={{ color: 'var(--text-secondary)' }}>{d.name}</div>
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-hover)' }}>
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                      </div>
                      <div className="text-[11px] w-10 text-right" style={{ color, fontFamily: 'var(--font-mono)' }}>
                        {d.score}/{d.max}
                      </div>
                      <div>
                        {d.status === 'pass' && <CheckCircle2 style={{ width: 12, height: 12, color: 'var(--success)' }} />}
                        {d.status === 'warn' && <AlertCircle style={{ width: 12, height: 12, color: 'var(--warning)' }} />}
                        {d.status === 'fail' && <XCircle style={{ width: 12, height: 12, color: 'var(--danger)' }} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* 3-COL: llms.txt / MCP / Entity Home */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {/* llms.txt */}
          <div className="rounded-xl p-5" style={{ background: 'var(--bg-elevated)', border: '1px solid color-mix(in srgb, var(--danger) 19%, transparent)' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileText style={{ width: 14, height: 14, color: 'var(--layer-retrieval)' }} />
                <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>llms.txt</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>Missing</span>
            </div>
            <div className="text-[12px] mb-3" style={{ color: 'var(--text-secondary)' }}>
              No llms.txt found at bondiplumbing.com.au/llms.txt. AI agents cannot determine what content to index.
            </div>
            <button className="w-full h-8 text-[12px] font-medium rounded-md" style={{ background: 'var(--layer-retrieval)', color: '#fff' }}>
              Generate llms.txt →
            </button>
          </div>

          {/* MCP Endpoint */}
          <div className="rounded-xl p-5" style={{ background: 'var(--bg-elevated)', border: '1px solid color-mix(in srgb, var(--danger) 19%, transparent)' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Cpu style={{ width: 14, height: 14, color: 'var(--layer-retrieval)' }} />
                <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>MCP endpoint</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>Not found</span>
            </div>
            <div className="text-[12px] mb-3" style={{ color: 'var(--text-secondary)' }}>
              AI agents can read your site but cannot take actions (e.g., bookings). This is the 2026 equivalent of not having a contact form.
            </div>
            <button className="w-full h-8 text-[12px] font-medium rounded-md" style={{ background: 'var(--bg-hover)', color: 'var(--text-tertiary)', cursor: 'not-allowed' }}>
              Coming v1.1
            </button>
          </div>

          {/* Entity Home */}
          <div className="rounded-xl p-5" style={{ background: 'var(--bg-elevated)', border: '1px solid color-mix(in srgb, var(--warning) 19%, transparent)' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Globe style={{ width: 14, height: 14, color: 'var(--layer-retrieval)' }} />
                <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>Entity Home</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}>Incomplete</span>
            </div>
            <div className="text-[12px] mb-2" style={{ color: 'var(--text-secondary)' }}>
              Page found: /about — but missing @id schema and only 1 of 3 required sameAs links.
            </div>
            <div className="text-[11px] mb-3" style={{ color: 'var(--text-tertiary)' }}>
              sameAs count: 1/3 required · @id: missing
            </div>
            <button className="w-full h-8 text-[12px] font-medium rounded-md" style={{ background: 'var(--layer-retrieval-soft)', color: 'var(--layer-retrieval)' }}>
              Fix entity schema →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// SCREEN CM-1: REPORTS LIST (Sprint 4)
// Route: app/(auth)/reports/page.tsx
// EXACT LAYOUT:
//   - Header: "Reports" h1 + "Generate report" button
//   - SlidersHorizontal bar: brand selector + date range + format
//   - Reports table: cover image placeholder / title / brand / period / status / actions
// ============================================================
const ReportsList = ({ onNav }) => {
  const reports = [
    { title: 'Bondi Plumbing — June 2026',     brand: 'Bondi Plumbing', period: 'Jun 2026', status: 'published', format: 'PDF + HTML' },
    { title: 'Bondi Plumbing — May 2026',      brand: 'Bondi Plumbing', period: 'May 2026', status: 'published', format: 'PDF'       },
    { title: 'Monthly report — Apr 2026',      brand: 'Bondi Plumbing', period: 'Apr 2026', status: 'published', format: 'PDF'       },
  ];

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px' }}>

        {/* HEADER */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <FileText style={{ width: 18, height: 18, color: 'var(--layer-comm)' }} />
              <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Reports</h1>
              <LayerBadge layer="comm" />
            </div>
            <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>3 reports generated · White-label PDF + email delivery</p>
          </div>
          <button
            className="h-9 px-4 text-[13px] font-medium rounded-md flex items-center gap-2"
            style={{ background: 'var(--layer-comm)', color: '#fff' }}
          >
            <Plus style={{ width: 14, height: 14 }} /> Generate report
          </button>
        </div>

        {/* REPORTS TABLE */}
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-default)' }}>
          <div
            className="grid px-5 py-3 text-[10px] font-semibold uppercase tracking-wider border-b"
            style={{ gridTemplateColumns: '2fr 1fr 100px 120px 120px', borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-tertiary)' }}
          >
            <div>Report</div>
            <div>Brand</div>
            <div>Period</div>
            <div>Format</div>
            <div>Actions</div>
          </div>
          {reports.map((r, i) => (
            <div
              key={i}
              className="grid px-5 py-3.5 items-center border-b last:border-b-0 hover:bg-[var(--bg-hover)] cursor-pointer"
              style={{ gridTemplateColumns: '2fr 1fr 100px 120px 120px', borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}
            >
              <div className="flex items-center gap-3">
                {/* Cover thumbnail: 32px, gradient placeholder */}
                <div
                  className="w-8 h-10 rounded shrink-0 flex items-center justify-center"
                  style={{ background: 'var(--layer-comm-soft)', border: '1px solid color-mix(in srgb, var(--layer-comm) 19%, transparent)' }}
                >
                  <FileText style={{ width: 12, height: 12, color: 'var(--layer-comm)' }} />
                </div>
                <div>
                  <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>{r.title}</div>
                  <StatusBadge status={r.status} />
                </div>
              </div>
              <div className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{r.brand}</div>
              <div className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{r.period}</div>
              <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{r.format}</div>
              <div className="flex items-center gap-2">
                <button className="w-7 h-7 rounded-md flex items-center justify-center" aria-label={`Download ${r.title}`} style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                  <Download style={{ width: 12, height: 12 }} />
                </button>
                <button className="w-7 h-7 rounded-md flex items-center justify-center" aria-label={`Share ${r.title}`} style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                  <Share2 style={{ width: 12, height: 12 }} />
                </button>
                <ChevronRight style={{ width: 14, height: 14, color: 'var(--text-tertiary)' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};


// ============================================================
// SCREEN GV-1: TEAM MANAGEMENT (Sprint 8)
// Route: app/(auth)/team/page.tsx
// EXACT LAYOUT:
//   - Header: "Team" + "Invite member" button
//   - Role summary: 4-role RBAC (Owner/Admin/Analyst/Viewer)
//   - Members table: avatar / name / email / role / brands / joined / actions
//   - Pending invites section
// ============================================================
const TeamManagement = ({ onNav }) => {
  const members = [
    { name: 'Sri Komman',     email: 'sri@agency.com.au', role: 'Owner',   brands: 'All brands', joined: '1 Mar 2026', isYou: true  },
    { name: 'Emma Walsh',     email: 'emma@agency.com.au', role: 'Admin',  brands: 'All brands', joined: '15 Apr 2026', isYou: false },
    { name: 'James Chen',     email: 'james@agency.com.au', role: 'Analyst', brands: '2 brands', joined: '1 May 2026', isYou: false  },
  ];
  const pendingInvites = [
    { email: 'client@bondiplumbing.com.au', role: 'Viewer', brands: 'Bondi Plumbing', sent: '2 days ago' },
  ];
  const roleColor = {
    Owner: 'var(--layer-governance)', Admin: 'var(--accent-blue)',
    Analyst: 'var(--layer-workflow)', Viewer: 'var(--text-secondary)',
  };

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px' }}>

        {/* HEADER */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Users style={{ width: 18, height: 18, color: 'var(--layer-governance)' }} />
              <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Team</h1>
              <LayerBadge layer="governance" />
            </div>
            <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>3 members · 1 pending invite · Agency plan (5 seats)</p>
          </div>
          <button
            className="h-9 px-4 text-[13px] font-medium rounded-md flex items-center gap-2"
            style={{ background: 'var(--accent-primary)', color: 'var(--accent-primary-fg)' }}
          >
            <UserPlus style={{ width: 14, height: 14 }} /> Invite member
          </button>
        </div>

        {/* ROLE LEGEND: 4-chip row explaining roles */}
        <div className="flex gap-3 mb-6 flex-wrap">
          {[
            { role: 'Owner',   desc: 'Full access, billing'      },
            { role: 'Admin',   desc: 'Manage brands & team'      },
            { role: 'Analyst', desc: 'Run audits, view reports'  },
            { role: 'Viewer',  desc: 'Read-only access'          },
          ].map(r => (
            <div key={r.role} className="flex items-center gap-2 px-3 py-1.5 rounded-md" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: roleColor[r.role] }} />
              <span className="text-[12px] font-medium" style={{ color: 'var(--text-primary)' }}>{r.role}</span>
              <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{r.desc}</span>
            </div>
          ))}
        </div>

        {/* MEMBERS TABLE */}
        <div className="rounded-xl overflow-hidden mb-6" style={{ border: '1px solid var(--border-default)' }}>
          <div
            className="grid px-5 py-3 text-[10px] font-semibold uppercase tracking-wider border-b"
            style={{ gridTemplateColumns: '2fr 1fr 1fr 100px 80px', borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-tertiary)' }}
          >
            <div>Member</div><div>Role</div><div>Brand access</div><div>Joined</div><div>Actions</div>
          </div>
          {members.map((m, i) => (
            <div
              key={i}
              className="grid px-5 py-3.5 items-center border-b last:border-b-0"
              style={{ gridTemplateColumns: '2fr 1fr 1fr 100px 80px', borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}
            >
              {/* Avatar + name + email */}
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-semibold shrink-0"
                  style={{ background: 'var(--bg-active)', color: 'var(--text-primary)' }}
                >
                  {m.name[0]}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>{m.name}</span>
                    {m.isYou && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-muted)', color: 'var(--text-tertiary)' }}>you</span>}
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{m.email}</div>
                </div>
              </div>
              <div>
                <span className="text-[12px] font-medium" style={{ color: roleColor[m.role] }}>{m.role}</span>
              </div>
              <div className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{m.brands}</div>
              <div className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>{m.joined}</div>
              <div className="flex items-center gap-1">
                {!m.isYou && (
                  <>
                    <button className="w-7 h-7 rounded-md flex items-center justify-center" aria-label={`Edit ${m.name}`} style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                      <Edit3 style={{ width: 12, height: 12 }} />
                    </button>
                    <button className="w-7 h-7 rounded-md flex items-center justify-center" aria-label={`Remove ${m.name}`} style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
                      <Trash2 style={{ width: 12, height: 12 }} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* PENDING INVITES */}
        <div className="rounded-xl p-5" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
          <div className="flex items-center gap-2 mb-4">
            <Mail style={{ width: 14, height: 14, color: 'var(--warning)' }} />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Pending invites</h3>
            <span className="text-[11px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}>1</span>
          </div>
          {pendingInvites.map((inv, i) => (
            <div key={i} className="flex items-center justify-between py-2">
              <div>
                <div className="text-[13px]" style={{ color: 'var(--text-primary)' }}>{inv.email}</div>
                <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                  {inv.role} · {inv.brands} · Sent {inv.sent}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="h-7 px-3 text-[11px] font-medium rounded-md" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                  Resend
                </button>
                <button className="h-7 px-3 text-[11px] font-medium rounded-md" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}>
                  Cancel
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// SCREEN CD-1: CONVERSATIONAL DISCOVERY HUB (Sprint 7)
// Route: app/(auth)/brands/[brandId]/discovery/page.tsx
// TIER GATE: Agency+ only. Growth sees a locked teaser.
// EXACT LAYOUT:
//   - If agency: Journey launcher + recent run results
//   - If growth: TierGate overlay over teaser content
//   - Journey cards: 3 pre-built journeys per vertical
//   - Run results: turn-by-turn conversation with brand mention highlights
// ============================================================
const DiscoveryHub = ({ onNav, tier = 'Agency' }) => {
  const isAgency = ['Agency', 'Agency Pro', 'Enterprise'].includes(tier);
  const journeys = [
    { name: 'Service Discovery Journey',    turns: 5, verticals: 'Tradies', status: 'ready',    lastRun: '2 days ago' },
    { name: 'Competitor Comparison Journey', turns: 4, verticals: 'Tradies', status: 'ready',    lastRun: '1 week ago' },
    { name: 'Emergency Booking Journey',    turns: 6, verticals: 'Tradies', status: 'not_run',  lastRun: null         },
  ];

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px' }}>

        {/* HEADER */}
        <div className="flex items-center gap-3 mb-8">
          <Compass style={{ width: 18, height: 18, color: 'var(--layer-discovery)' }} />
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Conversational Discovery</h1>
          <LayerBadge layer="discovery" />
          {!isAgency && (
            <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}>
              Agency+
            </span>
          )}
        </div>

        {isAgency ? (
          <>
            <p className="text-[13px] mb-8" style={{ color: 'var(--text-secondary)' }}>
              Simulate multi-turn AI conversations to see how customers discover your brand through extended queries.
            </p>

            {/* JOURNEY CARDS: grid grid-cols-3 gap-4 */}
            <div className="grid grid-cols-3 gap-4">
              {journeys.map((j, i) => (
                <div
                  key={i}
                  className="rounded-xl p-5 card-lift cursor-pointer"
                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}
                >
                  {/* Journey icon: Compass in discovery-soft circle */}
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-4" style={{ background: 'var(--layer-discovery-soft)' }}>
                    <Compass style={{ width: 18, height: 18, color: 'var(--layer-discovery)' }} />
                  </div>
                  <h3 className="text-[14px] font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{j.name}</h3>
                  <div className="flex items-center gap-3 text-[11px] mb-4" style={{ color: 'var(--text-tertiary)' }}>
                    <span>{j.turns} turns</span>
                    <span>·</span>
                    <span>{j.verticals}</span>
                  </div>
                  {j.lastRun ? (
                    <div className="text-[11px] mb-3" style={{ color: 'var(--text-tertiary)' }}>Last run: {j.lastRun}</div>
                  ) : (
                    <div className="text-[11px] mb-3" style={{ color: 'var(--warning)' }}>Not yet run</div>
                  )}
                  <button
                    className="w-full h-8 text-[12px] font-medium rounded-md flex items-center justify-center gap-1.5"
                    style={{ background: 'var(--layer-discovery)', color: '#fff' }}
                  >
                    <Play style={{ width: 12, height: 12 }} /> Run journey
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          /* TIER GATE — Growth users see a teaser */
          <div className="relative">
            <div style={{ opacity: 0.3, pointerEvents: 'none' }}>
              <div className="grid grid-cols-3 gap-4">
                {[1,2,3].map(i => (
                  <div key={i} className="rounded-xl p-5 h-48" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }} />
                ))}
              </div>
            </div>
            <TierGate requiredTier="Agency" currentTier={tier} feature="Journey Intelligence" />
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// SCREEN GV-2: DATA RESIDENCY (Sprint 8)
// Route: app/(auth)/data-residency/page.tsx
// EXACT LAYOUT:
//   - Header: "Data Residency" + current region badge
//   - 3 status cards: Storage / Processing / LLM providers
//   - Data type table: what's stored, where, retention, encryption
//   - DPA / compliance notes
// ============================================================
const DataResidency = ({ onNav }) => {
  const dataTypes = [
    { type: 'Audit results',     location: 'Supabase AU (Sydney)', retention: '24 months', encryption: 'AES-256' },
    { type: 'LLM responses',     location: 'Supabase AU (Sydney)', retention: '12 months', encryption: 'AES-256' },
    { type: 'Brand profiles',    location: 'Supabase AU (Sydney)', retention: 'While active', encryption: 'AES-256' },
    { type: 'Payment data',      location: 'Stripe (US)',          retention: '7 years',   encryption: 'PCI DSS'  },
    { type: 'Email logs',        location: 'Resend (US)',          retention: '30 days',   encryption: 'TLS 1.3'  },
  ];

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--bg-base)' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px' }}>
        {/* HEADER */}
        <div className="flex items-center gap-3 mb-8">
          <Globe style={{ width: 18, height: 18, color: 'var(--layer-governance)' }} />
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>Data Residency</h1>
          <span className="text-[12px] px-2.5 py-1 rounded-full font-medium" style={{ background: 'var(--success-soft)', color: 'var(--success)' }}>
            AU (GST inclusive)
          </span>
        </div>

        {/* STATUS CARDS */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Primary storage',   value: 'Sydney, AU',        sub: 'Supabase ap-southeast-2', icon: Database, ok: true  },
            { label: 'LLM processing',    value: 'US (OpenAI/Anthropic)', sub: 'Data sent for inference only', icon: Cpu, ok: false },
            { label: 'Data sovereignty',  value: 'AU Privacy Act 1988', sub: 'APPs compliant', icon: Shield, ok: true  },
          ].map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={i} className="rounded-xl p-5" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
                <div className="flex items-center gap-2 mb-2">
                  <Icon style={{ width: 14, height: 14, color: s.ok ? 'var(--success)' : 'var(--warning)' }} />
                  <span className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{s.label}</span>
                </div>
                <div className="text-[14px] font-semibold mb-0.5" style={{ color: 'var(--text-primary)' }}>{s.value}</div>
                <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{s.sub}</div>
              </div>
            );
          })}
        </div>

        {/* DATA TYPES TABLE */}
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-default)' }}>
          <div
            className="grid px-5 py-3 text-[10px] font-semibold uppercase tracking-wider border-b"
            style={{ gridTemplateColumns: '1.5fr 2fr 1fr 1fr', borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)', color: 'var(--text-tertiary)' }}
          >
            <div>Data type</div><div>Storage location</div><div>Retention</div><div>Encryption</div>
          </div>
          {dataTypes.map((d, i) => (
            <div
              key={i}
              className="grid px-5 py-3.5 items-center border-b last:border-b-0"
              style={{ gridTemplateColumns: '1.5fr 2fr 1fr 1fr', borderColor: 'var(--border-subtle)', background: 'var(--bg-elevated)' }}
            >
              <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>{d.type}</div>
              <div className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{d.location}</div>
              <div className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{d.retention}</div>
              <div>
                <span className="text-[11px] px-1.5 py-0.5 rounded font-mono" style={{ background: 'var(--success-soft)', color: 'var(--success)' }}>
                  {d.encryption}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* DPA NOTE */}
        <div className="flex items-start gap-3 mt-6 p-4 rounded-xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)' }}>
          <Info style={{ width: 14, height: 14, marginTop: 2, color: 'var(--accent-blue)', flexShrink: 0 }} />
          <div className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
            VisibleAU processes data under Australian Privacy Act 1988. LLM inference sends only the minimum necessary data (prompts + brand name) to US providers. No PII is sent to LLM providers. Data Processing Agreement available on request.
          </div>
        </div>
      </div>
    </div>
  );
};


// ============================================================
// SCREEN AP-3: AUTOPILOT LOOP VISUALIZATION (Sprint 9)
// Route: app/(auth)/brands/[brandId]/autopilot/page.tsx
// THE AHA-MOMENT SCREEN — shows the complete closed loop:
//   Audit → Gap identified → Explanation → Draft approved → Re-audit → Improvement
// EXACT LAYOUT:
//   - Gradient banner header (autopilot gradient)
//   - 5-step vertical timeline with connecting lines
//   - Each step: numbered circle (step color), title, status, timestamp, detail
//   - Current step: animate-pulse-ring effect
//   - Custom: "Re-audit to measure" CTA
// ============================================================
const AutopilotLoop = ({ onNav }) => {
  // NOTE: step.status below ('done' | 'current' | 'pending') is PRESENTATIONAL stepper state
  // for this 5-step timeline UI only. It is NOT remediation_tasks.status (the DB enum is
  // open|in_progress|ready_for_review|complete|wont_fix). 'current' = in-flight step,
  // 'pending' = future/scheduled step — concepts the task lifecycle enum does not model.
  // Do not unify these with the DB enum; the remediation-task LIST UI elsewhere uses the
  // real enum values. (Audit note: intentional, not a conflict.)
  const steps = [
    {
      id: 1, color: 'var(--step-audit)',   icon: Activity,
      title: 'Audit complete',
      desc: 'Visibility score: 25.0 · 4 engines · 10 prompts',
      status: 'done', time: '5 Jun 2026',
    },
    {
      id: 2, color: 'var(--step-gap)',     icon: Target,
      title: '#1 gap identified',
      desc: 'Frequency: 20/100 — No Wikipedia entry found by any engine',
      status: 'done', time: '5 Jun 2026',
    },
    {
      id: 3, color: 'var(--step-explain)', icon: Lightbulb,
      title: 'Explanation shown',
      desc: 'Wikipedia appears in 47.9% of ChatGPT top citations · Confirmed research evidence',
      status: 'done', time: '5 Jun 2026',
    },
    {
      id: 4, color: 'var(--step-draft)',   icon: CheckCircle2,
      title: 'Draft approved',
      desc: 'Wikipedia entry approved by Sri Komman · Published to staging',
      status: 'current', time: '8 Jun 2026',
    },
    {
      id: 5, color: 'var(--step-measure)', icon: TrendingUp,
      title: 'Re-audit + measurement',
      desc: 'Validation audit scheduled — runs in 7 days · Lift will be measured against baseline',
      status: 'pending', time: 'Scheduled: 15 Jun',
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: 'var(--bg-base)' }}>

      {/* GRADIENT BANNER */}
      <div
        className="px-8 py-8"
        style={{ background: 'var(--autopilot-gradient)', backgroundSize: '200% auto', animation: 'gradient-shift 4s ease infinite' }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Target style={{ width: 18, height: 18, color: 'rgba(255,255,255,0.8)' }} />
          <span className="text-[13px] font-medium" style={{ color: 'rgba(255,255,255,0.7)' }}>Autopilot Loop</span>
        </div>
        <h1 className="text-2xl font-semibold" style={{ color: '#fff' }}>Bondi Plumbing — Wikipedia Campaign</h1>
        <p className="text-[13px] mt-1" style={{ color: 'rgba(255,255,255,0.6)' }}>
          Step 4 of 5 · Draft approved · Re-audit in 7 days
        </p>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px' }}>

        {/* TIMELINE */}
        <div className="relative">
          {steps.map((step, i) => {
            const Icon = step.icon;
            const isDone    = step.status === 'done';
            const isCurrent = step.status === 'current';
            const isPending = step.status === 'pending';
            return (
              <div key={step.id} className="relative flex gap-5 mb-6 last:mb-0">

                {/* Connecting line — not on last item */}
                {i < steps.length - 1 && (
                  <div className="autopilot-step-line" style={{ background: isDone ? step.color : 'var(--border-default)' }} />
                )}

                {/* Step circle: 38px, colored border + icon */}
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isCurrent ? 'animate-pulse-ring' : ''}`}
                  style={{
                    background: isDone ? step.color : isPending ? 'var(--bg-elevated)' : step.color,
                    border: isPending ? `2px dashed color-mix(in srgb, ${step.color} 38%, transparent)` : `2px solid ${step.color}`,
                    opacity: isPending ? 0.5 : 1,
                  }}
                >
                  <Icon style={{ width: 16, height: 16, color: isDone ? '#fff' : isPending ? step.color : '#fff' }} />
                </div>

                {/* Step content */}
                <div className="flex-1 pb-2">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-[14px] font-semibold" style={{ color: isPending ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>
                      {step.title}
                    </h3>
                    {isDone && (
                      <CheckCircle2 style={{ width: 13, height: 13, color: 'var(--success)' }} />
                    )}
                    {isCurrent && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: `color-mix(in srgb, ${step.color} 13%, transparent)`, color: step.color }}>
                        In progress
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] mb-1" style={{ color: isPending ? 'var(--text-tertiary)' : 'var(--text-secondary)' }}>
                    {step.desc}
                  </p>
                  <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{step.time}</div>

                  {/* Current step extra action */}
                  {isCurrent && (
                    <div className="mt-3 p-3 rounded-lg" style={{ background: `color-mix(in srgb, ${step.color} 7%, transparent)`, border: `1px solid color-mix(in srgb, ${step.color} 19%, transparent)` }}>
                      <div className="text-[12px] font-medium mb-1" style={{ color: step.color }}>
                        Draft submitted for Wikipedia review
                      </div>
                      <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                        Articles for Creation review cycle: 1–3 weeks. We'll notify you when published.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* BOTTOM CTA */}
        <div className="mt-8 flex gap-3">
          <button
            onClick={() => onNav('action-center')}
            className="flex-1 h-10 text-[13px] font-medium rounded-lg flex items-center justify-center gap-2"
            style={{ background: 'var(--autopilot-gradient)', color: '#fff' }}
          >
            <Sparkles style={{ width: 14, height: 14 }} />
            Start next campaign
          </button>
          <button
            className="h-10 px-4 text-[13px] font-medium rounded-lg"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)' }}
          >
            View all loops
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// PHASE 2 PROTOTYPE NAVIGATOR
// Compass shell that wraps all Phase 2 screens.
// Used for prototype review — not built into production.
// EXACT STRUCTURE:
//   - Left: Phase2Sidebar (w-60)
//   - Right: active screen component (flex-1)
//   - TopBar: breadcrumb + actions slot + notification bell + theme toggle
// ============================================================
const Phase2TopBar = ({ breadcrumbs = [], actions }) => (
  <div
    className="h-12 flex items-center justify-between px-6 border-b shrink-0"
    style={{ background: 'var(--bg-subtle)', borderColor: 'var(--border-subtle)' }}
  >
    {/* Breadcrumb */}
    <div className="flex items-center gap-1.5 text-[13px]">
      {breadcrumbs.map((crumb, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight style={{ width: 12, height: 12, color: 'var(--text-tertiary)' }} />}
          <span style={{ color: i === breadcrumbs.length - 1 ? 'var(--text-primary)' : 'var(--text-tertiary)', fontWeight: i === breadcrumbs.length - 1 ? 500 : 400 }}>
            {crumb}
          </span>
        </span>
      ))}
    </div>
    {/* Actions + icons */}
    <div className="flex items-center gap-3">
      {actions}
      <button aria-label="Notifications" style={{ color: 'var(--text-tertiary)' }}>
        <Bell style={{ width: 16, height: 16 }} />
      </button>
      <button aria-label="Toggle theme" style={{ color: 'var(--text-tertiary)' }}>
        <Moon style={{ width: 16, height: 16 }} />
      </button>
    </div>
  </div>
);

export default function Phase2Prototype() {
  const [current, setCurrent] = useState('dashboard');
  const [tier, setTier] = useState('Agency');

  const screenMap = {
    // NOTE (audit v8.57): the Phase 2 sidebar also lists 'brand-list', 'action-center',
    // 'vertical-packs', and 'billing'. Those are PHASE 1 screens (BrandList, ActionCenter,
    // VerticalPackBrowser, Pricing) that live in visibleau-prototype.jsx and are intentionally
    // NOT re-implemented here — this file scopes to the Phase 2 intelligence layers. In the
    // built app they resolve to the real Phase 1 routes; in this prototype they fall through to
    // 'dashboard'. Do NOT add duplicate stub screens for them (Phase 1 is canonical for those).
    'dashboard':         { crumbs: ['Workspace', 'Overview'],          component: <EnhancedDashboard onNav={setCurrent} /> },
    'health-check':      { crumbs: ['Workspace', 'Health Check'],      component: <HealthCheck onNav={setCurrent} /> },
    'visibility-hub':    { crumbs: ['Workspace', 'Brands', 'Bondi Plumbing', 'Visibility'], component: <VisibilityHub onNav={setCurrent} tier={tier} /> },
    'citation-failure':  { crumbs: ['Workspace', 'Brands', 'Bondi Plumbing', 'Visibility', 'Citation Failure'], component: <CitationFailureDiagnosis onNav={setCurrent} /> },
    'competitive':       { crumbs: ['Workspace', 'Brands', 'Bondi Plumbing', 'Visibility', 'Competitive Benchmark'], component: <CompetitiveBenchmark onNav={setCurrent} tier={tier} /> },
    'workflow-hub':      { crumbs: ['Workspace', 'Brands', 'Bondi Plumbing', 'Workflow'], component: <WorkflowHub onNav={setCurrent} /> },
    'content-draft':     { crumbs: ['Workspace', 'Brands', 'Bondi Plumbing', 'Workflow', 'Content Draft'], component: <ContentDraftEditor onNav={setCurrent} /> },
    'trust-hub':         { crumbs: ['Workspace', 'Brands', 'Bondi Plumbing', 'Trust'], component: <TrustHub onNav={setCurrent} /> },
    'retrieval-hub':     { crumbs: ['Workspace', 'Brands', 'Bondi Plumbing', 'Retrieval'], component: <RetrievalHub onNav={setCurrent} /> },
    'discovery-hub':     { crumbs: ['Workspace', 'Brands', 'Bondi Plumbing', 'Discovery'], component: <DiscoveryHub onNav={setCurrent} tier={tier} /> },
    'reports':           { crumbs: ['Workspace', 'Reports'], component: <ReportsList onNav={setCurrent} /> },
    'team':              { crumbs: ['Account', 'Team'], component: <TeamManagement onNav={setCurrent} /> },
    'data-residency':    { crumbs: ['Account', 'Data Residency'], component: <DataResidency onNav={setCurrent} /> },
    'autopilot':         { crumbs: ['Workspace', 'Brands', 'Bondi Plumbing', 'Autopilot Loop'], component: <AutopilotLoop onNav={setCurrent} /> },
  };

  const active = screenMap[current] || screenMap['dashboard'];

  return (
    <>
      <Phase2Styles />
      <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>

        {/* SIDEBAR */}
        <Phase2Sidebar current={current} onNav={setCurrent} tier={tier} />

        {/* MAIN */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <Phase2TopBar breadcrumbs={active.crumbs} />

          {/* Screen content */}
          {active.component}
        </div>

        {/* DEV NAV OVERLAY — remove in production */}
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 flex flex-wrap gap-1.5 p-2 rounded-xl z-50 max-w-2xl"
          style={{ background: 'rgba(9,9,11,0.95)', border: '1px solid var(--border-strong)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
        >
          <span className="text-[10px] font-semibold px-2 self-center" style={{ color: 'var(--text-tertiary)' }}>SCREENS:</span>
          {Object.keys(screenMap).map(id => (
            <button
              key={id}
              onClick={() => setCurrent(id)}
              className="h-6 px-2 text-[10px] font-medium rounded"
              style={{
                background: current === id ? 'var(--accent-blue)' : 'var(--bg-elevated)',
                color: current === id ? '#fff' : 'var(--text-tertiary)',
              }}
            >
              {id}
            </button>
          ))}
          {/* Tier toggle */}
          <div className="ml-2 flex items-center gap-1 border-l pl-2" style={{ borderColor: 'var(--border-strong)' }}>
            <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>Tier:</span>
            {['Growth','Agency','Agency Pro'].map(t => (
              <button
                key={t}
                onClick={() => setTier(t)}
                className="h-6 px-2 text-[10px] font-medium rounded"
                style={{ background: tier === t ? 'var(--success)' : 'var(--bg-elevated)', color: tier === t ? '#fff' : 'var(--text-tertiary)' }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

      </div>
    </>
  );
}
// ============================================================
// END OF PHASE 2 PROTOTYPE v1.0
// Screens: 14 | Lines: ~2800 | Design tokens: 30+
// Sprint coverage: Sprint 2–9 (Sprint 1 = backend only, no UI)
//
// FOR CLAUDE CODE — IMPLEMENTATION NOTES:
// 1. Every className and style prop is an exact specification.
//    Do not substitute or approximate. Use var(--token) as written.
// 2. All new CSS tokens (--layer-*) must be added to globals.css
//    before Sprint 2 begins. See Phase2Styles component above.
// 3. All Phase 2 screens extend the Phase 1 design system.
//    Do NOT change Phase 1 screens — only add new pages.
// 4. Tier gates: always check tier before rendering gated content.
//    Use the TierGate component for overlay locks.
// 5. Icons: all from lucide-react. Use exact names as specified.
//    e.g. <Eye /> not <Eye /> — they are different imports.
// 6. IntelCard, LayerBadge, SectionHeader, EmptyState, TierGate —
//    extract these as shared components in components/phase2/ui/
//    They are used across ALL 7 intelligence layer pages.
// 7. Phase2Sidebar replaces Phase 1 Sidebar from Sprint 2 onward.
//    Keep the same shell structure (w-60, border-r, bg-subtle).
// 8. BrandIntelTabs renders on Brand Detail page as the top nav.
//    The Brand Detail page becomes a hub — all layers tab off it.
// ============================================================
