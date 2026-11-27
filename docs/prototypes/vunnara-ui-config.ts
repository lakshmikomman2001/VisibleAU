/* =============================================================================
 * Vunnara UI contract: client enhancements (canonical)
 * Repo path : docs/prototypes/vunnara-ui-config.ts
 * Version   : 1.9 · 27 Nov 2026 (1.9: S03 as built and LLD amendments 84–96: P02 regeneration banner, Free view
 *             only, the draft prompt on return and only for a changed draft, Add disabled at the limit, as-built
 *             messages; P03 HTML line and the confirm screen's button; overlays at z-50; P05 page wrapper, one error
 *             banner, two-block skeleton, "Last change" words; P07.mix example, P07.split one source per line and
 *             audit page only; P10 two steps until S06, Remove, no-spare line; C-36–C-38).
 *             1.8 · 27 Nov 2026 (1.8: S02 as built and LLD amendment 79: P02 intro names the plan's engines, singular
 *             forms, template pill, the audit on the section line, a squares legend, the Questions tile).
 *             1.7 · 26 Nov 2026 (1.7: LLD amendment 68: the agency's saved order for other actions wins in P09).
 *             1.6 · 25 Nov 2026 (1.6: the real reports' review, LLD amendments 61–63: P09 Over time before
 *             Beyond AI answers, rows kept together, page fill; other actions in Inter and by priority; P07/P09 Beyond
 *             tile copy; P08 outline order). 1.5 · 25 Nov 2026 (1.5: S01B review: Method kept whole, strengths without a status pill, a hidden
 *             action's finding keeps its card). 1.4 · 24 Nov 2026 (1.4: S01 as built and the PDF review: P09 each finding once, findings limit,
 *             pages flow; P09.cover amber; P07 tile words; P08 checks copy; P13, P17, P18 as built.
 *             1.3: a Basic report keeps today's Diagnosis heading, N15; "Why your score is what
 *             it is" is P08's outline label only. 1.2: S00's token map and as-is verification folded in: app token names and
 *             values, roles, ABN field, branded limit 5, findings g–j, D-UI2–D-UI6; C-25–C-34. 1.1: report tiers)
 * Pairs with: docs/lld/vunnara-client-enhancements-lld-v1.md (behaviour, data, APIs)
 *             docs/prototypes/client-enhancements-v2.html (the visual, rendered from this file's data)
 *             docs/prototypes/PROTOTYPE-GUIDE.md (how to build a screen from this file)
 *
 * Why one typed file (the NexusBook lesson): screens built from prose and HTML alone drifted
 * apart; one audit found 54 conflicts between builds. Every UI decision now lives here once:
 * tokens, component specs, each screen's nodes, copy, states, interactions, accessibility,
 * responsive rules and acceptance checks. The HTML prototype embeds this same data.
 *
 * This file is documentation. Nothing in the app imports it. Check it with:
 *   npx tsc --noEmit --strict --target es2022 --lib es2022 --module esnext --moduleResolution bundler --skipLibCheck docs/prototypes/vunnara-ui-config.ts
 *
 * Placeholders in copy use {camelCase}. Example values shown in the HTML (Hero Home Services,
 * TechCore IT, Splice Marketing, audit numbers, percentages) are illustrative layout examples,
 * never data to ship.
 * ========================================================================== */

/* ----------------------------------------------------------------------------
 * 0. Types (the template every screen follows)
 * ------------------------------------------------------------------------- */

export type ScreenId =
  | 'P00' | 'P01' | 'P02' | 'P03' | 'P04' | 'P05' | 'P06' | 'P07' | 'P08'
  | 'P09' | 'P10' | 'P11' | 'P12' | 'P13' | 'P14' | 'P15' | 'P16' | 'P17' | 'P18';

export type SprintId =
  | 'S00' | 'S01' | 'S02' | 'S03' | 'S04' | 'S05' | 'S06' | 'S07' | 'S08' | 'S09' | 'S10';

export type FlagName =
  | 'report_v2' | 'abn_suggestion' | 'question_library' | 'agency_questions'
  | 'visibility_reach' | 'business_taxonomy' | 'qi_website' | 'qi_listings'
  | 'qi_demand' | 'qi_competitors' | 'qi_pretest' | 'qi_learning' | 'question_packs';

export type ComponentName =
  | 'AppShell' | 'PageHeader' | 'Card' | 'Button' | 'IconButton' | 'Link' | 'Pill' | 'Chip'
  | 'Input' | 'Textarea' | 'Field' | 'Checkbox' | 'Toggle' | 'Stepper' | 'Segmented'
  | 'EvidenceLine' | 'Banner' | 'Table' | 'List' | 'QuestionRow' | 'ReachHeader'
  | 'EngineDots' | 'DraftBar' | 'Modal' | 'Drawer' | 'CheckItem' | 'StatTile' | 'ScoreFigure'
  | 'ProgressBar' | 'SegmentedBar' | 'LockMarker' | 'Kbd' | 'Combobox' | 'Menu' | 'StepIndicator'
  | 'ProgressRow' | 'Spinner' | 'Skeleton' | 'Toast' | 'Tooltip' | 'PdfPage';

/** 'map'  = the app very likely already has an equivalent. Use the app's variable or class (recorded in
 *           docs/prototypes/token-map.md by S00 Part 0b). If the app's value differs, the app's value wins.
 *  'new'  = does not exist in the app yet. Add it to the app theme in light AND dark exactly as given. */
export type TokenStatus = 'map' | 'new';

export interface ColorToken {
  name: `--${string}`;   // the contract's role name, used throughout this file
  app: string;           // the variable to use in the app (token-map.md section 1). Always write this one in code
  light: string;         // the app's value (light), from token-map.md
  dark: string;          // the app's value (dark)
  status: TokenStatus;
  use: string;
}

export interface TypeRole {
  name: string;
  family: 'ui' | 'mono' | 'report';
  size: number;        // px
  line: number;        // px line-height
  weight: 400 | 500 | 600 | 700;
  tracking?: string;   // letter-spacing
  transform?: 'uppercase';
  color?: `--${string}`;
  use: string;
}

export type InteractiveState =
  | 'default' | 'hover' | 'active' | 'focus' | 'disabled' | 'loading' | 'selected' | 'error' | 'readOnly'
  | 'empty' | 'stale' | 'success';

export interface ComponentSpec {
  name: ComponentName;
  protoClass: string;          // class used in client-enhancements-v2.html
  purpose: string;
  anatomy: string[];           // parts and exact measurements
  sizes?: Record<string, string>;
  variants?: Record<string, string>;
  states: Partial<Record<InteractiveState, string>>;
  a11y: string[];
  responsive?: string[];
  mapTo: string;               // which existing app component to extend (VERIFY in S00 Part 0b)
}

/** One element on a screen. `id` is unique, matches data-node="…" in the HTML, and becomes the
 *  Playwright data-testid in kebab case (testIdOf('P02.draftBar') === 'p02-draft-bar'). */
export interface NodeSpec {
  id: string;
  component: ComponentName | 'Text' | 'Layout';
  variant?: string;
  copy?: string;               // exact wording; {placeholders} are data
  bind?: string;               // where the data comes from
  style?: string;              // only what differs from the component's default, in tokens
  behaviour?: string[];
  a11y?: string;
  showWhen?: string;           // condition; hidden otherwise (no empty space left behind)
}

export type StateKey =
  | 'loading' | 'empty' | 'error' | 'noPermission' | 'planLock' | 'flagOff'
  | 'partial' | 'conflict' | 'overLimit' | 'stale' | 'success';

export interface StateSpec {
  show: string;                // what renders
  copy?: string;               // exact wording
  action?: string;             // the one action offered
}

export interface ScreenSpec {
  id: ScreenId;
  title: string;
  route: string;
  sprints: SprintId[];
  flags: FlagName[];
  frame: { kind: 'app' | 'modal' | 'drawer' | 'standalone' | 'pdf'; width: number; contentMaxWidth?: number; mobile: boolean };
  access: { roles: string; plans: string };
  layout: string[];
  nodes: NodeSpec[];
  states: Partial<Record<StateKey, StateSpec>>;
  interactions: { on: string; then: string }[];
  api: { call: string; use: string }[];
  a11y: string[];
  responsive: string[];
  acceptance: string[];
  lld: string[];
}

export interface ConflictResolution {
  id: string;
  where: string;
  conflict: string;
  resolution: string;
}

/* ----------------------------------------------------------------------------
 * 1. Precedence (read first)
 * ------------------------------------------------------------------------- */

export const precedence = [
  '1. Existing app code wins for anything that already exists: data, APIs, behaviour, and token VALUES the app already defines. Report differences with file:line; never silently change existing screens.',
  '2. For new UI, this file wins over the HTML prototype and over LLD prose (it resolves their differences, listed in `conflicts`).',
  '3. The HTML prototype wins over LLD prose for visual layout when this file is silent.',
  '4. Map, never duplicate: every token and component here maps to an existing app variable or component (token-map.md). Only items with status "new" are added to the app theme.',
  '5. Copy is exact. Change wording only through this file (and say so in the report).',
  '6. Every screen ships all of its listed states. A screen without its loading, empty, error and no-permission states is not done.',
  '7. Flags off = the app is exactly as today. Each screen lists what shows when its flag is off.',
  '8. LLD section 0 (v1.3) and docs/prototypes/token-map.md amend this file; where they differ from it, they win. In code, always use each token\'s `app` variable.',
] as const;

/* ----------------------------------------------------------------------------
 * 2. Tokens
 * ------------------------------------------------------------------------- */

export const color: ColorToken[] = [
  { name: '--bg',               app: '--bg-base',            light: '#fafafa', dark: '#09090b', status: 'map', use: 'Page background' },
  { name: '--surface',          app: '--bg-elevated',        light: '#ffffff', dark: '#18181b', status: 'map', use: 'Cards, modals, drawers' },
  { name: '--surface-2',        app: '--bg-subtle',          light: '#f4f4f5', dark: '#0c0c0f', status: 'map', use: 'Reach headers, evidence lines, neutral pills and chips (hover fill: --bg-hover #f4f4f5 / #27272a)' },
  { name: '--surface-3',        app: '--bg-active',          light: '#e4e4e7', dark: '#3f3f46', status: 'map', use: 'Bar tracks, empty engine dots, pressed fill' },
  { name: '--border',           app: '--border-default',     light: 'rgba(0,0,0,.08)', dark: 'rgba(255,255,255,.08)', status: 'map', use: 'Card borders and row dividers (decorative)' },
  { name: '--border-strong',    app: '--border-strong',      light: 'rgba(0,0,0,.12)', dark: 'rgba(255,255,255,.14)', status: 'map', use: 'Secondary button border, evidence left rule (decorative)' },
  { name: '--border-control',   app: '--border-control',     light: '#8a8a93', dark: '#71717a', status: 'new', use: 'Form control boundaries (added in S00, D-UI1 applied app-wide)' },
  { name: '--text',             app: '--text-primary',       light: '#09090b', dark: '#fafafa', status: 'map', use: 'Primary text' },
  { name: '--text-2',           app: '--text-secondary',     light: '#52525b', dark: '#a1a1aa', status: 'map', use: 'Body text, field labels, chip text' },
  { name: '--text-3',           app: '--text-tertiary',      light: '#6b6b74', dark: '#8f8f98', status: 'map', use: 'Muted text: help, meta, table headers, overlines' },
  { name: '--accent',           app: '--accent-blue',        light: '#2160eb', dark: '#5190f7', status: 'map', use: 'Links, toggles on, focus ring, accent buttons, progress fill' },
  { name: '--accent-strong',    app: '--accent-blue',        light: '#2160eb', dark: '#5190f7', status: 'map', use: 'AI-suggested pill text, selected segment text (no separate hover colour in the app, T-04)' },
  { name: '--accent-tint',      app: '--accent-blue-soft',   light: 'rgba(33,96,235,.08)', dark: 'rgba(81,144,247,.15)', status: 'map', use: 'Info banners, AI-suggested pill, selected option and segment' },
  { name: '--on-accent',        app: '--accent-blue-fg',     light: '#ffffff', dark: '#09090b', status: 'map', use: 'Text and icons on --accent' },
  { name: '--primary-btn',      app: '--accent-primary',     light: '#18181b', dark: '#ffffff', status: 'map', use: 'Primary button fill' },
  { name: '--primary-btn-hover',app: '(none yet)',           light: '#27272a', dark: '#e4e4e7', status: 'new', use: 'Primary button hover. Add as --accent-primary-hover only when a new screen needs it (T-05)' },
  { name: '--on-primary',       app: '--accent-primary-fg',  light: '#fafafa', dark: '#09090b', status: 'map', use: 'Text on primary button' },
  { name: '--good',             app: '--success',            light: '#117c38', dark: '#22c55e', status: 'map', use: 'Strong band (≥ 30%), passed checks, complete' },
  { name: '--good-tint',        app: '--success-soft',       light: 'rgba(17,124,56,.08)', dark: 'rgba(34,197,94,.12)', status: 'map', use: 'Good pill and banner fill' },
  { name: '--warn',             app: '--warning',            light: '#a25904', dark: '#f59e0b', status: 'map', use: 'Developing band (10–29%), small sample, stale, names-your-business label, weak question' },
  { name: '--warn-tint',        app: '--warning-soft',       light: 'rgba(162,89,4,.08)', dark: 'rgba(245,158,11,.12)', status: 'map', use: 'Warn pill, banner and weak-row fill' },
  { name: '--bad',              app: '--danger',             light: '#cf2121', dark: '#f15c5c', status: 'map', use: 'Low band (< 10%), High priority, blocking checks, errors' },
  { name: '--bad-tint',         app: '--danger-soft',        light: 'rgba(207,33,33,.08)', dark: 'rgba(241,92,92,.12)', status: 'map', use: 'Bad pill fill, failed check icon fill' },
  { name: '--agency',           app: '--agency',             light: '#6d28d9', dark: '#c4b5fd', status: 'new', use: 'Content written by the agency ONLY (added in S00)' },
  { name: '--agency-tint',      app: '--agency-soft',        light: '#f5f3ff', dark: '#211a3a', status: 'new', use: 'Agency pill fill (added in S00 under the app\'s naming, T-01)' },
  { name: '--on-status',        app: '--warning-fg / --success-fg / --danger-fg', light: '#ffffff', dark: '#0a0a0b', status: 'new', use: 'Glyph on a solid warn / good / bad disc (T-02; --warning-fg added in S00)' },
  { name: '--overlay',          app: '--overlay-scrim',      light: 'rgba(0,0,0,.6)', dark: 'rgba(0,0,0,.6)', status: 'map', use: 'Scrim behind modals and drawers' },
];

/** Measured WCAG 2.2 ratios for every text pair the screens use (computed, not estimated). */
export const contrast = {
  app: 'Re-measured by S00 with the app\'s values: every text and control pair passes its threshold (token-map.md section 1, "Contrast, re-measured"). Re-measure any new pair with a script.',
  pdf: { 'agency #5B21B6/#EDE9FE': 7.57, 'eyebrow #8A5A00/#FFFFFF': 5.93, 'footer #6B6B76/#FFFFFF': 5.26, 'evidence #3F3F46/#F6F5F2': 9.58 },
  rule: 'Text ≥ 4.5:1 (≥ 3:1 at ≥ 24px or ≥ 18.66px bold). Control boundaries and focus indicators ≥ 3:1. Disabled controls are exempt but keep their label legible.',
} as const;

export const fontFamily = {
  ui: '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  report: '"Fraunces", Georgia, serif',
  note: 'The app loads no web font today (Inter is only named; Windows shows Arial). Don\'t add font loading in these sprints (D-UI2). Fraunces and the PDF fonts are embedded by react-pdf as today.',
} as const;

export const typography: TypeRole[] = [
  { name: 'score',        family: 'mono', size: 40,   line: 44, weight: 600, use: 'Headline Visibility figure (colour by band)' },
  { name: 'display',      family: 'ui',   size: 30,   line: 36, weight: 700, color: '--text', use: 'Main page title (audit page brand name, wizard title)' },
  { name: 'pageTitle',    family: 'ui',   size: 24,   line: 30, weight: 700, color: '--text', use: 'Sub-page title (Questions, Questions settings)' },
  { name: 'stepTitle',    family: 'ui',   size: 20,   line: 26, weight: 600, color: '--text', use: 'Wizard step card title' },
  { name: 'dialogTitle',  family: 'ui',   size: 18,   line: 24, weight: 600, color: '--text', use: 'Modal, drawer and confirm-card titles' },
  { name: 'cardTitle',    family: 'ui',   size: 16,   line: 22, weight: 600, color: '--text', use: 'Card titles' },
  { name: 'question',     family: 'ui',   size: 14.5, line: 21, weight: 400, color: '--text', use: 'Question text in rows' },
  { name: 'body',         family: 'ui',   size: 14,   line: 20, weight: 400, color: '--text', use: 'Default text, inputs, nav items' },
  { name: 'bodySm',       family: 'ui',   size: 13.5, line: 19, weight: 400, color: '--text', use: 'Banners, table cells, check items' },
  { name: 'control',      family: 'ui',   size: 13.5, line: 16, weight: 500, use: 'Button labels (md)' },
  { name: 'controlSm',    family: 'ui',   size: 12.5, line: 16, weight: 500, use: 'Button labels (sm)' },
  { name: 'label',        family: 'ui',   size: 13,   line: 18, weight: 500, color: '--text-2', use: 'Field labels' },
  { name: 'sub',          family: 'ui',   size: 13,   line: 18, weight: 400, color: '--text-3', use: 'Card and page subtitles' },
  { name: 'help',         family: 'ui',   size: 12.5, line: 17, weight: 400, color: '--text-3', use: 'Help text, inline meta, counters' },
  { name: 'pill',         family: 'ui',   size: 12,   line: 16, weight: 500, use: 'Pill labels' },
  { name: 'chip',         family: 'ui',   size: 12,   line: 16, weight: 400, color: '--text-2', use: 'Chip text (value part 600 --text)' },
  { name: 'overline',     family: 'ui',   size: 11.5, line: 16, weight: 600, tracking: '0.06em', transform: 'uppercase', color: '--text-3', use: 'Table headers, group labels' },
  { name: 'navLabel',     family: 'ui',   size: 11,   line: 14, weight: 600, tracking: '0.1em', transform: 'uppercase', color: '--text-3', use: 'Sidebar group labels (existing)' },
  { name: 'figure',       family: 'mono', size: 12,   line: 16, weight: 400, color: '--text-3', use: 'Counts, intervals, dates beside figures' },
  { name: 'figureStrong', family: 'mono', size: 13.5, line: 19, weight: 500, color: '--text', use: 'Numbers in tables and totals ("10 of 10")' },
  { name: 'evidence',     family: 'mono', size: 12,   line: 18, weight: 400, color: '--text-2', use: 'Evidence lines and quotes' },
  { name: 'tileValue',    family: 'mono', size: 28,   line: 34, weight: 600, use: 'Stat tile values (colour by band when a score)' },
  { name: 'kbd',          family: 'mono', size: 11,   line: 14, weight: 500, color: '--text-2', use: 'Keyboard hints' },
];

export const typeRule =
  'Roles that existing screens already use (page and card titles, body, labels, help, table text) take the app\'s values from token-map.md section 2 (10–14 px scale, 600-weight titles, line height 1.5). Roles used only by new components (question rows, reach headers, draft bar, evidence lines, tiles, combobox) use the values below, line heights included (D-UI3). Use the exact size and line height. If the app\'s scale lacks a value (14.5, 13.5, 12.5, 11.5), use an arbitrary value (e.g. text-[13.5px] leading-[19px]); never round. If an existing screen already uses a different value for the same role, the existing value wins and token-map.md records it.';

export const space = { s1: 4, s2: 8, s3: 12, s4: 16, s5: 20, s6: 24, s8: 32, s10: 40 } as const;
export const spaceRule = 'All gaps and paddings come from the 4-pt scale above. Exceptions are listed per component (e.g. question row 14 × 16, banner 12 × 14, content 28 × 32).';

export const radius = { card: 12, control: 8, pill: 999, banner: 10, menu: 10, modal: 14, option: 6, evidence: '0 6px 6px 0', kbd: 4, engineDot: 3 } as const;

export const shadow = {
  pop: { light: '0 8px 28px rgba(10,10,11,.12), 0 2px 6px rgba(10,10,11,.06)', dark: '0 8px 28px rgba(0,0,0,.5), 0 2px 6px rgba(0,0,0,.4)', use: 'Menus, modals, drawers, draft bar, toasts' },
  focus: { value: '0 0 0 2px var(--surface), 0 0 0 4px var(--accent)', use: 'Every interactive element on :focus-visible (never on mouse click)' },
  knob: { value: '0 1px 2px rgba(0,0,0,.25)', use: 'Toggle knob' },
} as const;

export const motion = {
  colour: '120ms ease-out (background, border, colour on hover/active)',
  toggle: '160ms ease-out (knob left 2px → 18px)',
  overlay: '160ms ease-out (scrim opacity 0 → 1; modal opacity 0 → 1 and scale .98 → 1)',
  drawer: '200ms cubic-bezier(.2,.8,.2,1) (translateX 100% → 0)',
  skeleton: '1.2s ease-in-out infinite (opacity 1 → .55 → 1)',
  reduced: 'prefers-reduced-motion: no transforms or pulses; opacity changes only, 0–120ms',
} as const;

// overlay 50 as built (S03, amendment 93): drawers and modals cover the cookie banner (also z-50, earlier in the page), like ConfirmDialog
export const zIndex = { stickyBar: 10, dropdown: 30, overlay: 50, toast: 50 } as const;

export const breakpoints = {
  mobile: '< 640px (Tailwind sm starts at 640): one column; existing mobile navigation drawer; targets ≥ 44px tall; new side drawers become full-screen sheets; modals full width with 16px margin',
  tablet: '640–1023px: the shell is the same as mobile (it switches only at lg 1024); content grids of 3–4 become 2',
  desktop: '≥ 1024px: 240px sidebar + content; grids as drawn',
  wide: '≥ 1100px: Beyond AI answers tiles in 4 columns',
  prototypeFrames: 'The HTML draws each screen at 1240px (desktop) and 390px (mobile). It uses container queries so both fit on one page; implement with the app\'s existing viewport breakpoints (Tailwind sm 640 / md 768 / lg 1024, VERIFY).',
} as const;

export const layout = {
  sidebar: 'Existing shell, unchanged: width 224 (--app-sidebar-width), shown at ≥ 1024 only',
  topBar: 'Existing: 48 tall at ≥ 1024 (padding 0 24), 56 below with a 44 px menu button and a separate 36 px breadcrumb row',
  content: 'Follow the page you\'re adding to (token-map.md section 5: 28 × 32 on list pages, 32 × 24 with max widths on detail pages); below 1024 the app forces 16 px side padding',
  card: 'padding 24 (tight 16); 1px --border; --surface. Radius: 8 as most existing cards use inline, 12 for new cards only if the page already uses rounded-lg',
} as const;

export const icons = {
  library: 'The app\'s existing icon set (lucide-react, VERIFY). 16px in rows and buttons, 14px in sm buttons, 12px in pills; stroke as existing usage.',
  map: {
    info: 'Info', question: 'CircleHelp', warn: 'TriangleAlert', ok: 'Check', fail: 'X', plus: 'Plus', minus: 'Minus',
    drag: 'GripVertical', more: 'Ellipsis', close: 'X', swap: 'RefreshCw', lock: 'Lock', starOn: 'Star (filled)', starOff: 'Star',
    chevron: 'ChevronDown', external: 'ExternalLink', upload: 'Upload', up: 'ArrowUp', down: 'ArrowDown',
  },
  note: 'The prototype uses text glyphs (i, !, ✓, ⋮⋮, •••) as stand-ins for these icons.',
} as const;

export const scoreBands = {
  strong: { from: 30, color: '--good', label: 'Strong' },
  developing: { from: 10, to: 29, color: '--warn', label: 'Developing' },
  low: { to: 9, color: '--bad', label: 'Low' },
  note: 'Thresholds match the code (lib/scoring/headline-color.ts). App colours --success / --warning / --danger. D-BAND: the colour follows the figure shown (rounded), so 9.6 shown as "10%" is Developing, not Low. The band word is always visible text (existing HEADLINE_BAND_LABELS).',
} as const;

export const reachLabels = {
  local: 'Local · {city}',
  state: '{stateAbbrev}',
  country: '{countryName}',
  global: 'Worldwide',
  rowTitles: { local: 'Local', state: 'State', country: 'Country', global: 'Worldwide' },
  order: ['local', 'state', 'country', 'global'],
  note: 'Code value "global"; customer-facing word "Worldwide" everywhere (C-07).',
} as const;

export const engines = {
  order: ['ChatGPT', 'Claude', 'Gemini', 'Perplexity'],
  note: 'Fixed order for engine dots and engine tables (VERIFY production order; existing wins). Evidence lines list engines by count, highest first.',
} as const;

export const intents = {
  best: 'Best', reviews: 'Reviews', price: 'Price', near: 'Near me', problem: 'Problem',
  emergency: 'Emergency', comparison: 'Comparison', other: 'Other',
} as const;

/* ----------------------------------------------------------------------------
 * 3. Components (every variant and state specified)
 * ------------------------------------------------------------------------- */

export const components: ComponentSpec[] = [
  {
    name: 'AppShell', protoClass: '.app .sb .top .content', purpose: 'Existing authenticated layout. Unchanged by these sprints.',
    anatomy: ['Sidebar 240 (logo, workspace switcher, WORKSPACE and ACCOUNT groups)', 'Top bar 56 (breadcrumbs, brand selector)', 'Content area (padding 28 × 32, gap 20)'],
    states: { default: 'As production' },
    a11y: ['Existing landmarks: nav for sidebar, main for content'],
    responsive: ['Existing mobile behaviour (VERIFY); the prototype hides the sidebar at ≤ 640 and shows a menu button in the top bar'],
    mapTo: 'components/domain/app-shell.tsx (sidebar 224 at ≥ 1024, mobile drawer below). Do not restyle.',
  },
  {
    name: 'PageHeader', protoClass: '.h1 + .sub', purpose: 'Title, one subtitle line, actions on the right.',
    anatomy: ['Title: type display or pageTitle', 'Subtitle: type sub, margin-top 0 (6 when under display)', 'Actions: Button row, gap 12, aligned to the title baseline row'],
    states: { default: 'Title left, actions right' },
    a11y: ['Title is the page h1'],
    responsive: ['≤ 640: actions wrap below the subtitle, each button full width'],
    mapTo: 'Existing page header pattern (VERIFY)',
  },
  {
    name: 'Card', protoClass: '.card / .card.tight', purpose: 'Grouped content on --surface.',
    anatomy: ['Padding 24 (tight 16)', 'Radius 12', 'Border 1px --border', 'Title type cardTitle, margin-bottom 4', 'Subtitle type sub'],
    variants: { default: 'padding 24', tight: 'padding 16', flush: 'padding 0 (tables); header row padding 16 × 20', highlight: 'border colour color-mix(--accent 35%, --border) (confirm card P10 only)' },
    states: { default: 'Static' },
    a11y: ['Card title is a heading at the level that fits the page (h2 under the page h1)'],
    mapTo: 'No shared Card: existing cards are inline (radius 8, --border-default, --bg-elevated). New screens follow the page they sit in.',
  },
  {
    name: 'Button', protoClass: '.btn (.primary .accent .ghost .danger .sm)', purpose: 'Actions.',
    anatomy: ['Height 36 (sm 28); padding 0 14 (sm 0 10); radius 8; gap 8 icon–label', 'Label type control (sm controlSm), no wrap', 'Optional leading icon 16 (sm 14)'],
    sizes: { md: 'height 36, padding 0 14', sm: 'height 28, padding 0 10 (dense rows only)' },
    variants: {
      primary: 'fill --primary-btn, text --on-primary, border --primary-btn. One per view region.',
      secondary: 'fill --surface, text --text, border 1px --border-strong (default variant)',
      accent: 'fill --accent, text --on-accent, border --accent. Inline accept actions (Add, Add "in {place}")',
      ghost: 'transparent fill and border, text --text-2',
      danger: 'fill --surface, text --bad, border color-mix(--bad 40%, --border)',
    },
    states: {
      hover: 'primary → --primary-btn-hover; secondary → fill --surface-2; accent → --accent-strong fill and border; ghost → fill --surface-2, text --text; danger → fill --bad-tint',
      active: 'secondary/ghost → fill --surface-3; primary/accent → as hover',
      focus: 'shadow.focus on :focus-visible',
      disabled: 'opacity .45; cursor not-allowed; no hover; native disabled (or aria-disabled with a tooltip explaining why when the reason matters)',
      loading: 'Spinner 14 replaces the leading icon; label stays; aria-busy="true"; not clickable; width does not change',
    },
    a11y: ['Native <button>; icon-only buttons use IconButton', 'Disabled-with-reason buttons keep focusable via aria-disabled and show the reason in a Tooltip'],
    responsive: ['≤ 640: min-height 44 (sm too); footer and page actions full width'],
    mapTo: 'No shared Button exists (buttons are styled inline per screen, token-map TC rows). Create one shared button for new screens only, using these variants; don\'t migrate existing screens.',
  },
  {
    name: 'IconButton', protoClass: '.btn.sm.ghost[aria-label]', purpose: 'Icon-only actions: close, more, move up/down.',
    anatomy: ['28 × 28 (36 × 36 for close in dialogs); icon 16; radius 8'],
    states: { hover: 'fill --surface-2', focus: 'shadow.focus', disabled: 'opacity .45' },
    a11y: ['aria-label required ("Close", "More actions for {question}", "Move up")', 'Menu buttons: aria-haspopup="menu", aria-expanded'],
    responsive: ['≤ 640: 44 × 44 hit area'],
    mapTo: 'Existing Button size="icon" (VERIFY)',
  },
  {
    name: 'Link', protoClass: 'a', purpose: 'Inline navigation and low-weight actions.',
    anatomy: ['Colour --accent; underline on hover; inherits font size (help links 12.5)'],
    states: { hover: 'underline', focus: 'shadow.focus with radius 4' },
    a11y: ['Real <a href> for navigation; a <button> styled as link for actions'],
    mapTo: 'Existing link styles',
  },
  {
    name: 'Pill', protoClass: '.pill (.n .ai .ag .br .good .warn .bad)', purpose: 'Status and provenance labels. Always words, never colour alone.',
    anatomy: ['Height 22; padding 0 8; radius 999; gap 6; type pill; optional 6px dot (currentColor) first'],
    variants: {
      neutral: '.n: fill --surface-2, text --text-2, border --border. "Original set", "Always on", "No channel linked", report type names in lists',
      ai: '.ai: fill --accent-tint, text --accent-strong. "AI-suggested"',
      agency: '.ag: fill --agency-tint, text --agency. "Written by {agency}", "Your recommendation", "Custom"',
      branded: '.br: fill --warn-tint, text --warn, border color-mix(--warn 30%, transparent). "Names your business · not scored"',
      good: '.good: fill --good-tint, text --good. "Complete", "ABN verified", "Search crawlers allowed"',
      warn: '.warn: fill --warn-tint, text --warn. "Small sample", weak-question pill',
      bad: '.bad: fill --bad-tint, text --bad. "High" priority, "Low"',
    },
    states: { default: 'Static, not interactive' },
    a11y: ['Plain text inside; when the pill abbreviates (e.g. "Small sample"), a Tooltip gives the full sentence'],
    mapTo: 'Existing Badge (VERIFY); add variants by mapping to the colour tokens',
  },
  {
    name: 'Chip', protoClass: '.chip', purpose: 'Facts about a thing ("Service: Plumbing"), removable values (aliases, selected types), and sector shortcuts.',
    anatomy: ['Height 24; padding 0 10; radius 999; fill --surface-2; border 1px --border; type chip; key text --text-2 then value 600 --text', 'Removable: trailing × as a 16 × 16 button'],
    variants: { fact: 'Static', removable: 'Value + × button', selectable: 'Sector chip: selected = fill --accent-tint, text --accent-strong, 600', star: 'Type chip with ★ (main) / ☆ (make main) toggle before the name' },
    states: { hover: 'selectable/removable: border --border-strong', focus: 'shadow.focus', selected: 'selectable: as variant' },
    a11y: ['× button aria-label "Remove {value}"', 'Star button aria-pressed, aria-label "Make {type} the main type"', 'Selectable chips are toggle buttons (aria-pressed)'],
    responsive: ['Rows of chips wrap with gap 6–8'],
    mapTo: 'Existing Badge/Tag or new small component (VERIFY)',
  },
  {
    name: 'Input', protoClass: '.inp', purpose: 'Single-line text.',
    anatomy: ['Height 36; padding 0 12; radius 8; border 1px --border-control; fill --surface; type body'],
    states: { hover: 'border --text-3', focus: 'border --accent + shadow.focus', error: 'border --bad; error text below (help size, --bad), aria-invalid', disabled: 'fill --surface-2, text --text-3', readOnly: 'fill --surface-2; no border change on hover' },
    a11y: ['Visible label (Field); aria-describedby → help and error ids'],
    responsive: ['≤ 640: height 44, font-size 16 (prevents iOS zoom)'],
    mapTo: 'No shared Input: controls are styled inline (87 in 33 files); D-UI1 already gives them --border-control. New screens may add one shared input; never migrate existing ones.',
  },
  {
    name: 'Textarea', protoClass: 'textarea.inp', purpose: 'Multi-line text (question text, notes).',
    anatomy: ['Min height 84; padding 10 × 12; line height 20; resize vertical; otherwise as Input', 'Counter under it: help type, right side, "{n} / {max} characters"'],
    states: { focus: 'as Input', error: 'as Input; counter turns --bad when over max' },
    a11y: ['Counter is in aria-describedby; announced politely only when within 20 of the max'],
    mapTo: 'Existing Textarea',
  },
  {
    name: 'Field', protoClass: '.field', purpose: 'Label + control + help/error.',
    anatomy: ['Column, gap 6', 'Label type label', 'Help type help', 'Error type help in --bad with warn icon 12'],
    states: { error: 'Error replaces help' },
    a11y: ['<label for>; group controls (chips, segmented) use fieldset + legend styled as label'],
    mapTo: 'Existing form field pattern',
  },
  {
    name: 'Checkbox', protoClass: 'input[type=checkbox]', purpose: 'Include/exclude (services on the confirm screen).',
    anatomy: ['16 × 16 inside a 24 × 24 hit area; accent-color --accent; border --border-control'],
    states: { focus: 'shadow.focus', disabled: 'opacity .45' },
    a11y: ['Label is the service name (aria-labelledby the row title)'],
    responsive: ['≤ 640: the whole row toggles it (44 tall)'],
    mapTo: 'Existing Checkbox',
  },
  {
    name: 'Toggle', protoClass: '.tgl (.on .lock)', purpose: 'On/off settings (reaches, include in report, section switches).',
    anatomy: ['Track 36 × 20, radius 999', 'Knob 16 × 16 white, top 2, left 2 (on: left 18), shadow.knob', 'Hit area 36 × 36 (the row label also toggles it)'],
    variants: { off: 'track --border-control', on: 'track --accent', locked: 'track --accent at opacity .55, knob on; not operable; label "Always on"' },
    states: { hover: 'off → track --text-3; on → track --accent-strong', focus: 'shadow.focus around the track', disabled: 'opacity .45' },
    a11y: ['<button role="switch" aria-checked>', 'Accessible name from the row title ("NSW", "Include: Link your Yellow Pages…")', 'Locked: aria-disabled="true", name "Local, always on"'],
    responsive: ['≤ 640: hit area 44 × 44'],
    mapTo: 'The two existing hand-built role="switch" buttons (settings/notifications, schedule-form) set the pattern; their off tracks use --border-control since S00.',
  },
  {
    name: 'Stepper', protoClass: '.stepper', purpose: 'Small integers (questions per reach, packs per brand, default count).',
    anatomy: ['Height 32; border 1px --border-control; radius 8; overflow hidden', '− and + buttons 30 wide, text --text-2', 'Value min-width 30, figureStrong type, centred'],
    states: { hover: 'button fill --surface-2', focus: 'shadow.focus on the focused button', disabled: 'whole control opacity .45 (e.g. Worldwide off)', error: 'border --bad when the server refuses' },
    a11y: ['Group with role="spinbutton" on the value (aria-valuemin/max/now, aria-label "{reach} questions")', 'Buttons aria-label "Fewer {thing}" / "More {thing}"; disabled at min/max', 'Up/Down arrow keys change the value when the value is focused'],
    responsive: ['≤ 640: height 44; buttons 44 wide'],
    mapTo: 'New small component built from existing Button (VERIFY no existing number stepper)',
  },
  {
    name: 'Segmented', protoClass: '.seg / .tiers .tcard', purpose: 'One choice among 2–4 (Area in the add drawer; report type in P08).',
    anatomy: ['Inline-flex; border 1px --border-control; radius 8', 'Segments padding 6 × 12, type bodySm 13, --text-2, divider 1px --border', 'Selected: fill --accent-tint, text --accent-strong, 600'],
    variants: { inline: 'As anatomy (Area)', cards: 'Grid of equal cards, gap 8; card padding 12, radius 10, border 1px --border-control, --surface, column gap 4; title 14/600 --text; description help 12.5 --text-3. Selected: border 2px --accent (padding 11), fill --accent-tint. Locked: opacity .6 on text, LockMarker + Upgrade link under the description' },
    states: { hover: 'unselected segment or card fill --surface-2', focus: 'shadow.focus on the focused segment or card', disabled: 'cards variant: locked card not selectable, aria-disabled' },
    a11y: ['role="radiogroup" with radios (arrow keys move and select)'],
    responsive: ['≤ 640: full width, segments share width equally; long labels wrap to two lines'],
    mapTo: 'Existing ToggleGroup/Tabs (VERIFY)',
  },
  {
    name: 'EvidenceLine', protoClass: '.evi', purpose: 'Measured evidence or a quote under a finding, action or service.',
    anatomy: ['Type evidence; fill --surface-2; left rule 3px --border-strong; padding 6 × 10; radius 0 6 6 0; overflow-wrap anywhere'],
    variants: { counts: '"{source} cited in {n} of {total} answers · {more} · audit #{n}"', quote: '"“{quote ≤ 200 chars}” · {engine} · “{question}”"' },
    states: { default: 'Read-only text, never editable' },
    a11y: ['Plain text; quotes in <q> or with quote marks'],
    mapTo: 'New. Production answer quotes use a plain 2px left border (response-answer-text.tsx:43), not mono (TC-34); new evidence lines use this spec.',
  },
  {
    name: 'Banner', protoClass: '.banner (.info .warn .good)', purpose: 'Inline messages and one-tap suggestions.',
    anatomy: ['Flex, gap 12, align start; padding 12 × 14; radius 10; border 1px', 'Icon disc 18 (glyph 11 bold)', 'Body type bodySm; optional bold first phrase', 'Actions right: sm buttons, gap 8'],
    variants: {
      neutral: 'fill --surface-2, border --border, icon disc --accent with --on-accent',
      info: 'fill --accent-tint, border color-mix(--accent 25%, transparent), icon disc --accent',
      warn: 'fill --warn-tint, border color-mix(--warn 30%, transparent), icon disc --warn with --warning-fg',
      good: 'fill --good-tint, border color-mix(--good 30%, transparent), icon disc --good with --success-fg',
    },
    states: { default: 'Static; dismissible banners have a "Not now" ghost button, never a bare ×' },
    a11y: ['Static banners are plain content; banners that appear after an action use role="status" (or role="alert" for errors)'],
    responsive: ['≤ 640: actions move below the text, left aligned, full-width buttons'],
    mapTo: 'Existing Alert (VERIFY)',
  },
  {
    name: 'Table', protoClass: '.tbl', purpose: 'Lists with columns (brands, packs, signals, reports).',
    anatomy: ['th: type overline, padding 10 × 12, bottom border --border', 'td: type bodySm, padding 12, bottom border --border (none on last row), vertical-align middle', 'Numbers: figureStrong'],
    states: { hover: 'row fill --surface-2 when the row is a link target' },
    a11y: ['Real <table> with <th scope="col">; the row action is a link with the brand name in its accessible name ("Edit questions for Hero Home Services")'],
    responsive: ['≤ 640: horizontal scroll inside the card (first column sticky)'],
    mapTo: 'Existing Table',
  },
  {
    name: 'List', protoClass: '.list', purpose: 'Bordered container for rows (question sections, reach rows).',
    anatomy: ['Border 1px --border; radius 12; --surface; overflow hidden', 'Optional ReachHeader on top'],
    states: { default: 'Static' },
    a11y: ['role="list" with role="listitem" rows (or <ul>/<li>)'],
    mapTo: 'New wrapper or existing Card with no padding',
  },
  {
    name: 'QuestionRow', protoClass: '.qrow', purpose: 'One question (or one reach/service/report item) with meta and an action.',
    anatomy: ['Grid columns 20 | 1fr | auto (reach rows 44 | 1fr | auto; confirm rows 24 | 1fr | auto; report rows 20 | 44 | 1fr | auto); gap 12; align start; padding 14 × 16; bottom border --border (none on last)', 'Question text: type question', 'Meta row: flex wrap, gap 6, margin-top 6 (pills, chips, help, engine dots)'],
    variants: { view: 'No handle; more menu only', edit: 'Drag handle (GripVertical 16, --text-3, cursor grab)', weak: 'Row fill --warn-tint + warn pill + "Swap" link', suggestion: 'Inside a tight card: padding 12 × 0; trailing Add button', branded: 'No handle, no engine dots, branded pill' },
    states: { hover: 'edit: fill --surface-2', focus: 'shadow.focus inset on the row when it is focusable for keyboard moves', selected: 'while dragging: shadow.pop, fill --surface' },
    a11y: ['Row is a listitem; handle is a button "Reorder: {question}"; Alt+↑/↓ moves; moves announced in a polite live region'],
    responsive: ['≤ 640: trailing column moves under the meta row (except the more button, which stays top-right)'],
    mapTo: 'New component (questions feature)',
  },
  {
    name: 'ReachHeader', protoClass: '.reach-h', purpose: 'Section header inside a List.',
    anatomy: ['Flex space-between; padding 12 × 16; fill --surface-2; bottom border --border; radius 12 12 0 0', 'Left: title 14/600 --text + count 12.5 --text-3', 'Right: last-audit summary 12.5 --text-3'],
    states: { default: 'Static' },
    a11y: ['Title is an h2/h3 that labels the section (aria-labelledby)'],
    responsive: ['≤ 640: right text drops under the title'],
    mapTo: 'New',
  },
  {
    name: 'EngineDots', protoClass: '.eng', purpose: 'Last result per engine for one question.',
    anatomy: ['Inline-flex gap 3; four 12 × 12 squares, radius 3, fixed engine order', 'Named: fill and border --good with a white ✓ (8px) glyph', 'Not named: fill --surface-3, border --border', 'Unverified (D-UI6): fill --warn-tint, border --warn, "?" glyph 8px --warn (the audit page\'s "Maybe": mentioned, not confirmed as the business)', 'Failed: diagonal hatch of --text-3 on --surface-3', 'Preceded by help text "Named you:"'],
    states: { hover: 'Tooltip per dot: "{engine}: named you" / "{engine}: mentioned, not confirmed as you" / "{engine}: didn\'t name you" / "{engine}: answer failed"' },
    a11y: ['role="img" aria-label "Named you on {list}; unconfirmed on {list}; not on {list}; failed on {list}"', 'Fill, glyph and hatch differ, so colour is never the only signal'],
    mapTo: 'New',
  },
  {
    name: 'DraftBar', protoClass: '.drawbar', purpose: 'Sticky summary of unsaved question changes.',
    anatomy: ['Sticky bottom 0 inside the content column (z stickyBar); flex space-between; gap 12; padding 12 × 16; --surface; border 1px --border-strong; radius 12; shadow.pop', 'Left: "Draft" 600 + chips (+{n} added, −{n} removed, {n} moved) + counts in figure type', 'Right: Discard (ghost) + Apply from the next audit (primary)'],
    states: { default: 'Shown in edit mode; "No changes yet" and Apply disabled when the draft is empty', error: 'Inline error text above the bar (409/402/422 copy)' },
    a11y: ['region labelled "Draft changes"; count changes announced politely'],
    responsive: ['≤ 640: fixed to the viewport bottom, full width, radius 0; counts on line 1, buttons full width on line 2; content gets bottom padding equal to the bar height'],
    mapTo: 'New',
  },
  {
    name: 'Modal', protoClass: '.overlay > .modal', purpose: 'Confirmations and short forms.',
    anatomy: ['Scrim --overlay (z overlay)', 'Panel width 560 (contents panel 1100, two columns 1fr | 320); padding 24; radius 14; --surface; border 1px --border; shadow.pop', 'Title type dialogTitle; subtitle type sub', 'Footer: space-between, margin-top 20; secondary info left, buttons right (Cancel ghost, confirm primary)'],
    states: { default: 'Opens with motion.overlay', loading: 'Confirm button loading state; Cancel stays enabled', error: 'Inline banner above the footer' },
    a11y: ['role="dialog" aria-modal="true" aria-labelledby the title', 'Focus trapped; initial focus as each screen says; Esc closes unless a request is in flight; focus returns to the opener'],
    responsive: ['≤ 640: full width minus 16px margins, max-height 100dvh − 32, body scrolls, footer sticky'],
    mapTo: 'components/shared/confirm-dialog.tsx pattern (role, focus trap, Esc, focus return). No Radix is used: don\'t introduce it.',
  },
  {
    name: 'Drawer', protoClass: '.drawer', purpose: 'Side panel form over the current page (add question, history).',
    anatomy: ['Right edge; width 480; full height; --surface; left border --border; shadow.pop; padding 24; column gap 16', 'Header row: title dialogTitle + close IconButton', 'Footer pinned to the bottom (margin-top auto)'],
    states: { default: 'Opens with motion.drawer' },
    a11y: ['As Modal (role="dialog", focus trap, Esc, return focus)'],
    responsive: ['≤ 640: full-screen sheet; footer sticky; primary button full width'],
    mapTo: 'No right-hand sheet exists: build one from the mobile-nav drawer pattern (components/domain/mobile-nav-drawer.tsx: focus trap, scrim, 200ms slide), mirrored to the right.',
  },
  {
    name: 'CheckItem', protoClass: '.check (i.ok i.wn i.no)', purpose: 'Validation and progress lines.',
    anatomy: ['Flex gap 10, align start, type bodySm', 'Disc 18 × 18 radius 999, glyph 11 bold: ok ✓ (--good on --good-tint), warn ! (--warn on --warn-tint), fail ✕ (--bad on --bad-tint), pending · (--text-3 on --surface-2)'],
    states: { default: 'Static', error: 'Fail line text turns --bad' },
    a11y: ['Container aria-live="polite" when lines update as the user types; each line starts with a visually hidden "Passed:", "Warning:" or "Problem:"'],
    mapTo: 'New',
  },
  {
    name: 'StatTile', protoClass: '.tile', purpose: 'A figure with its label and detail.',
    anatomy: ['Border 1px --border; radius 12; padding 16; --surface', 'Label .k: 12.5 --text-3 (may include a pill)', 'Value .v: type tileValue, margin-top 6, colour by band for scores', 'Detail .d: type figure, margin-top 4'],
    variants: { score: 'Value coloured by scoreBands', status: 'Value replaced by a pill + detail lines (Beyond AI answers)', finding: 'Title 600 + priority pill on one row, sub text, EvidenceLine (audit findings)' },
    states: { stale: 'Detail line "Last checked {date}, may be out of date" in --warn', empty: 'Neutral pill + action link; never a 0' },
    a11y: ['Value and label read together (dl/dt/dd or aria-label "{label}: {value}")'],
    mapTo: 'Existing stat card (VERIFY)',
  },
  {
    name: 'ScoreFigure', protoClass: '.mono 40/44', purpose: 'Headline Visibility.',
    anatomy: ['Overline "VISIBILITY" (help 12.5, tracking .1em)', 'Figure type score, colour by band', 'Detail type figure: "Mentioned in {m} of {n} answers · {reachLabel}"'],
    states: { default: 'As production; only the reach label is new' },
    a11y: ['Existing'],
    mapTo: 'Existing audit header figure. Change only the label line.',
  },
  {
    name: 'ProgressBar', protoClass: '.bar > i', purpose: 'Progress (wizard steps, analysis).',
    anatomy: ['Height 8; radius 999; track --surface-3; fill --accent'],
    states: { default: 'Width = percent' },
    a11y: ['role="progressbar" aria-valuenow/min/max and a label'],
    mapTo: 'Existing Progress',
  },
  {
    name: 'SegmentedBar', protoClass: '.bar (gradient stops)', purpose: 'Split of everyday questions across reaches.',
    anatomy: ['As ProgressBar; one segment per enabled reach in reach order; fills --accent at 100%, 60%, 30%, 15% (color-mix with --surface)', 'Legend under it: help type "Local {n} · NSW {n} (small sample) · …"'],
    states: { default: 'Widths = target ÷ limit' },
    a11y: ['role="img" aria-label "Local 4, NSW 3, Australia 3"'],
    mapTo: 'New (or existing chart primitive)',
  },
  {
    name: 'LockMarker', protoClass: '.lock', purpose: 'Shows a plan-gated control.',
    anatomy: ['Inline; type 11.5/16 --text-3; border 1px dashed --border-strong; radius 6; padding 1 × 6; text = plan name ("Growth", "Agency")', 'Followed by link "Upgrade" to /pricing (D-UI5; 23 existing uses through PlanLockedCard)'],
    states: { default: 'The gated control is disabled (aria-disabled) and its tooltip says "Available on {plan} and up"' },
    a11y: ['Marker text is read with the control ("Write your own, available on Growth and up")'],
    mapTo: 'Existing PlanLockBadge / PlanLockedCard (token-map section 3)',
  },
  {
    name: 'Kbd', protoClass: '.kbd', purpose: 'Keyboard hints.',
    anatomy: ['Type kbd; border 1px --border-strong, bottom 2px; radius 4; padding 2 × 5'],
    states: { default: 'Static' },
    a11y: ['<kbd>'],
    mapTo: 'New or existing',
  },
  {
    name: 'Combobox', protoClass: '.combo + .menu + .opt', purpose: 'Search-and-pick (business types).',
    anatomy: ['Input inside a wrapper with border --accent and shadow.focus while open', 'Listbox below, margin-top 6: border --border, radius 10, --surface, shadow.pop, padding 6, max-height 360 scroll', 'Option: padding 8 × 10, radius 6, flex space-between; title 600 body; detail 12 --text-3 ("{sector} · also “{alias}”" or "service match: “{service}”")', 'Active option fill --accent-tint; Enter hint Kbd on the active option', 'Footer option "Can\'t find it? Add a custom type" separated by a top border'],
    states: { default: 'Closed until typing or ↓', loading: 'Not needed (static list in memory)', empty: 'Option text "No match for “{query}”" + the custom type option', disabled: 'Custom option shows LockMarker when the plan is below Growth' },
    a11y: ['ARIA 1.2 combobox: role="combobox" on the input, aria-expanded, aria-controls the listbox, aria-activedescendant; ↑/↓ move, Enter selects, Esc closes, Home/End', 'Result count announced politely ("4 results")'],
    responsive: ['≤ 640: listbox full width; max-height 50dvh'],
    mapTo: 'No combobox library: build on the workspace-switcher listbox pattern (components/domain/agency/workspace-switcher.tsx), adding the ARIA 1.2 combobox input.',
  },
  {
    name: 'Menu', protoClass: '.menu', purpose: 'Row overflow menus (•••).',
    anatomy: ['As the listbox surface; items 36 tall, padding 8 × 10, radius 6, body type; destructive items --bad'],
    states: { hover: 'item fill --surface-2', focus: 'item fill --accent-tint' },
    a11y: ['role="menu" with menuitems; arrow keys; Esc returns focus to the button'],
    mapTo: 'The account menu pattern (role="menu", components/domain/app-sidebar.tsx). No Radix.',
  },
  {
    name: 'StepIndicator', protoClass: '.steps', purpose: 'Steps of the confirm flow.',
    anatomy: ['Flex gap 8; each step: 24 circle (figure 12/600) + label 13.5; connectors 24 × 1 --border-strong', 'Current: circle --accent fill, --on-accent text; label 600 --text', 'Done: circle --good-tint with --good ✓', 'Upcoming: circle border --border-strong; label --text-3'],
    states: { default: 'Not clickable except done steps (go back)' },
    a11y: ['<ol> with aria-current="step" on the current step'],
    responsive: ['≤ 640: labels hidden except the current step; circles stay'],
    mapTo: 'Existing wizard step pattern (VERIFY)',
  },
  {
    name: 'ProgressRow', protoClass: '.prog', purpose: 'One layer of the analysis.',
    anatomy: ['Grid 22 | 1fr | auto; gap 12; padding 12 × 0; bottom border --border', 'Status: CheckItem disc (done ✓ / waiting ·) or Spinner (running); failed = warn disc', 'Label body (running: 600); detail help on the right'],
    states: { default: 'waiting: label --text-3, detail "Waiting"', loading: 'running: Spinner + label 600', success: 'done: ✓ + detail ("9 pages · 14 services found")', error: 'failed: ! + "Couldn\'t check" + reason in detail; run continues' },
    a11y: ['List; completed steps announced in a polite live region'],
    mapTo: 'New',
  },
  {
    name: 'Spinner', protoClass: '.spin', purpose: 'In-progress indicator inside rows and buttons.',
    anatomy: ['18 × 18 (14 in buttons); border 2px --accent-tint; top border --accent; rotate 0.8s linear infinite'],
    states: { default: 'reduced motion: static ring with "In progress" text kept' },
    a11y: ['aria-label "In progress" or hidden when the label already says it'],
    mapTo: 'Existing Spinner',
  },
  {
    name: 'Skeleton', protoClass: '.sk (v2 prototype)', purpose: 'Loading placeholders that match the final layout.',
    anatomy: ['Blocks fill --surface-2; radius 6 (text lines 12 tall), 8 (controls), 12 (cards)', 'Pulse motion.skeleton', 'Row skeletons repeat the final row grid and height'],
    states: { default: 'Shown after 150ms of loading (avoid flashes); replaced without layout shift' },
    a11y: ['Container aria-busy="true"; a visually hidden "Loading {thing}"'],
    mapTo: 'Tailwind animate-pulse blocks on --bg-subtle (components/shared/skeleton/* exist but are unused; either is fine).',
  },
  {
    name: 'Toast', protoClass: '(existing)', purpose: 'Confirmation after an action that leaves the page as it was.',
    anatomy: ['Existing toast component and position'],
    states: { success: 'Copy per screen', error: 'Copy per screen, with Retry when it makes sense' },
    a11y: ['Existing (role="status")'],
    mapTo: 'No toast is mounted (D-UI4): render the same copy as inline role="status" feedback next to the action (components/shared/save-feedback.tsx). Don\'t mount sonner.',
  },
  {
    name: 'Tooltip', protoClass: '(existing)', purpose: 'Short explanations on hover and focus.',
    anatomy: ['Existing tooltip; max width 280; body 12.5'],
    states: { default: 'Opens on hover after 300ms and immediately on focus; Esc closes' },
    a11y: ['aria-describedby; never the only place for required information on touch devices (repeat in help text where it matters)'],
    mapTo: 'InfoTip (components/domain/shared/info-tip.tsx): shown on hover, focus or tap. Never rely on a native title alone.',
  },
  {
    name: 'PdfPage', protoClass: '.pdf (.ph .eyebrow h5 .lead .grp .act .ev .pp .t4 .tl .pf)', purpose: 'react-pdf A4 pages (P09).',
    anatomy: [
      'A4 595 × 842pt; padding 40 × 44; Inter 10/14 #111',
      'Header .ph: 8.5pt #6B6B76, bottom rule #E7E5E0, margin-bottom 18: agency name left, "AI VISIBILITY REPORT · {BRAND} · WEEK {w}, {yyyy}" right',
      'Eyebrow: JetBrains Mono 600 8.5/12, tracking .14em, #8A5A00: "{nn} · {SECTION}" left, qualifier right',
      'Title h5: Fraunces 600 20/24 #111, margin 8 0 6',
      'Lead: 10pt #3F3F46, margin-bottom 14',
      'Group label .grp: JetBrains Mono 600 8.5/12, tracking .1em, #6B6B76, margin 12 0 6',
      'Action card .act: border #E7E5E0, radius 8, padding 10 × 12, margin-bottom 8; title 10.5/600; evidence .ev Mono 8.5/12 #3F3F46 on #F6F5F2 with 2pt left rule #C9C5BC, padding 4 × 6',
      'Priority pills .pp: Inter 600 8/12, padding 1 × 6, radius 99: HIGH #9B1C1C/#FDE8E8, MEDIUM #8A5A00/#FEF3C7, DONE #03543F/#DEF7EC, OPEN #1E429F/#E1EFFE, AGENCY #5B21B6/#EDE9FE',
      'Agency note: 9pt #5B21B6, prefix "Note from {agency}: "',
      'Tile grid .t4: 2 columns gap 10; tile border #E7E5E0 radius 8 padding 10 × 12 min-height 150; title Inter 600 11/14; date line Mono 8/11 #6B6B76 uppercase; body 9.5/13',
      'Footer .pf: absolute bottom 24, left/right 44; 8pt #6B6B76; top rule #E7E5E0; "Confidential · Prepared for {brand} by {agency}" left, "Page {n} of {m}" right',
    ],
    states: { default: 'Text only from contents_snapshot; groups render only when non-empty' },
    a11y: ['Real text (no images of text); reading order follows the visual order'],
    mapTo: 'lib/reports/pdf/report-document.tsx existing primitives; keep its palette where it already defines one (C-12).',
  },
];

/** data-testid convention: node id → kebab case. 'P02.draftBar' → 'p02-draft-bar'. */
export function testIdOf(nodeId: string): string {
  return nodeId
    .replace(/\./g, '-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}


/* ----------------------------------------------------------------------------
 * 4. Screens
 *    Every screen: meta → layout → nodes → states → interactions → api → a11y →
 *    responsive → acceptance. Node ids match data-node="…" in the HTML frames.
 * ------------------------------------------------------------------------- */

const P00: ScreenSpec = {
  id: 'P00', title: 'Foundations: tokens and components', route: '—', sprints: ['S00'], flags: [],
  frame: { kind: 'standalone', width: 1240, mobile: false },
  access: { roles: '—', plans: '—' },
  layout: ['Reference sheet. Sections 2 and 3 of this file are the specification; the HTML P00 renders them.'],
  nodes: [
    { id: 'P00.colours', component: 'Table', copy: 'Colour tokens (light and dark, with status map/new)', bind: 'color' },
    { id: 'P00.type', component: 'Layout', copy: 'Type roles with live samples', bind: 'typography' },
    { id: 'P00.components', component: 'Layout', copy: 'Every component variant in every state', bind: 'components' },
  ],
  states: {},
  interactions: [{ on: 'Theme buttons (Light / Dark / System)', then: 'Switch the whole prototype theme; every frame must stay legible' }],
  api: [],
  a11y: ['Contrast table in `contrast` must hold after mapping to app values; re-measure any token whose app value differs'],
  responsive: [],
  acceptance: [
    'docs/prototypes/token-map.md maps every token and component here to an app variable/component with file:line (S00 Part 0b)',
    'Tokens with status "new" (--border-control, --agency, --agency-tint, --on-status) exist in the app theme in light and dark',
    'No second design system: no duplicated colour variables, no parallel Button/Badge components',
  ],
  lld: ['9'],
};

const P01: ScreenSpec = {
  id: 'P01', title: 'Brand settings: reach, aliases, ABN', route: '/brands/:id (Brand settings)', sprints: ['S00', 'S01', 'S04', 'S10'],
  flags: ['visibility_reach', 'abn_suggestion', 'question_packs'],
  frame: { kind: 'app', width: 1240, mobile: true },
  access: { roles: 'Owners and admins edit (manage_brands); other roles and the client portal read-only (lib/governance/permissions.ts)', plans: 'All plans; reach limit Starter 1, Growth 2, Agency and up 4 (D-QI8)' },
  layout: [
    'AppShell; breadcrumbs "Workspace › Brands › {brand}"; content column gap 20',
    'Card 1 "Brand settings": grid 2 columns gap 16 (name, domain); then "Also known as"; then ABN field; vertical gap 16',
    'Card 2 "Where do you want to be visible?": header row (title + sub left, plan chip right); suggestion banner (margin-top 16); List of 4 reach rows (margin-top 16); totals block (margin-top 16, gap 8); actions (margin-top 20)',
  ],
  nodes: [
    { id: 'P01.identity', component: 'Card', copy: 'Brand settings' },
    { id: 'P01.identity.name', component: 'Field', variant: 'Input', copy: 'Brand name|Suggested from your website\'s name. Edit if it\'s different.', bind: 'brands.name', behaviour: ['Required; trimmed; existing length limit (VERIFY)', 'Help line shows only while the name equals the suggestion made when the brand was added (S00 Part 4)'] },
    { id: 'P01.identity.domain', component: 'Field', variant: 'Input', copy: 'Domain', bind: 'brands.domain', behaviour: ['Existing behaviour, unchanged'] },
    { id: 'P01.aliases', component: 'Field', variant: 'Chip removable + Button ghost sm', copy: 'Also known as|+ Add a name|Other ways AI might write your name. Used to recognise mentions.', bind: 'brands.aliases', behaviour: ['Up to 10 names, each 2–60 characters, unique ignoring case, not equal to the brand name ignoring case and spaces', 'Never suggest the name without spaces or the domain stem: detection already matches those (LLD section 0, #5)', '"+ Add a name" turns into an inline Input (36 tall) with Enter to add and Esc to cancel', 'Suggested aliases from S00 Part 4 are pre-filled when the brand is added; never added silently later'] },
    { id: 'P01.abn', component: 'Banner', variant: 'info', copy: 'Is this your ABN?|{abn} · {entityName} · {state} {postcode} · {status}|Found on the Australian Business Register by your business name.|Confirm|Not mine', bind: 'brands.abn_suggestion (S01 Part 8)', showWhen: 'flag abn_suggestion on AND brands.abn is empty AND a confident ABR match exists AND not dismissed', style: 'ABN line type evidence without fill (mono 12.5)', behaviour: ['Confirm (primary sm) writes the ABN, queues the entity check, replaces the banner with the ABN in a read-only Input and inline status "ABN saved. We\'ll check the register now."', 'Not mine (ghost sm) hides it for this brand permanently'] },
    { id: 'P01.abnField', component: 'Field', variant: 'Input', copy: 'ABN|11 digits, from the Australian Business Register|Enter the 11 digits of an ABN.|This isn\'t a valid ABN. Check the digits.', bind: 'brands.abn (exists; PATCH /api/brands/:id gains it in S01)', behaviour: ['Accepts spaces as typed and saves digits only; validated with the ABN checksum on the client and the server', 'Empty is allowed (no ABN); saving a new ABN queues the entity check', 'Read-only for roles without manage_brands'] },
    { id: 'P01.reach', component: 'Card', copy: 'Where do you want to be visible?|Local is always on. Add NSW, Australia or worldwide to see whether AI recommends you beyond your area. Each area gets its own questions and its own score.|{planName}: up to {reachLimit} areas', showWhen: 'flag visibility_reach on', behaviour: ['"NSW" and "Australia" in the help text come from lib/markets (the brand\'s state and country)'] },
    { id: 'P01.reach.suggest', component: 'Banner', variant: 'info', copy: 'Your website says you work across {scope} ("{quote}"). Add {reachList}?|Add|Not now', bind: 'GET /reaches → suggestions[0]', showWhen: 'a suggestion exists and was not dismissed', behaviour: ['Add (accent sm) switches the listed reaches on in the form (not saved until Save)', 'Not now (ghost sm) stores the dismissal per brand and reason', 'Never enables a reach by itself'] },
    { id: 'P01.reach.list', component: 'List' },
    { id: 'P01.reach.local', component: 'QuestionRow', variant: 'reach (44 | 1fr | auto)', copy: 'Local|Always on|City: {city}|Areas: {areas}|Suburb: {suburb} {state} {postcode}|Change|Questions', bind: 'reaches[local]', behaviour: ['Toggle locked on', 'Chips show only the parts the brand has (hide empty ones)', '"Change" opens the existing location editor', 'Stepper min 4, max = limit − other targets'] },
    { id: 'P01.reach.state', component: 'QuestionRow', variant: 'reach', copy: 'State|{stateAbbrev}|Google AI checked from {stateAbbrev}, or {capital} if a state can\'t be set (labelled)|Questions', bind: 'reaches[state]', behaviour: ['Toggle on → stepper gets the default split value (keep ≥ 4 Local, share the rest evenly)', 'Toggle off → stepper 0 and disabled'] },
    { id: 'P01.reach.country', component: 'QuestionRow', variant: 'reach', copy: 'Country|{countryName}|Questions', bind: 'reaches[country]' },
    { id: 'P01.reach.global', component: 'QuestionRow', variant: 'reach', copy: 'Worldwide|Measured on the four AI engines only. Google\'s AI answers always depend on a country.|Questions', bind: 'reaches[global]' },
    { id: 'P01.reach.total', component: 'Text', copy: 'Everyday questions used|{used} of {limit}', style: 'label help; value figureStrong', behaviour: ['Updates live; at the limit every + is disabled with tooltip "Limit reached. Lower another area or add a question pack."'] },
    { id: 'P01.reach.bar', component: 'SegmentedBar', a11y: 'role="img" aria-label "Local 4, NSW 3, Australia 3"' },
    { id: 'P01.reach.legend', component: 'Text', copy: 'Local {n} · {stateAbbrev} {n} (small sample) · {countryName} {n} (small sample) · Want more? Add a question pack', style: 'help', behaviour: ['"(small sample)" when a reach has < 5 questions; tooltip: "Small sample ({n} questions): this figure can move a lot between audits."', '"Want more? Add a question pack" only when flag question_packs is on and the plan offers packs; links to /settings/billing'] },
    { id: 'P01.reach.actions', component: 'Layout', copy: 'Save and review questions|Cancel', behaviour: ['Save (primary): PUT /reaches; on 200 navigate to /brands/:id/questions?edit=1 with the returned draft (P02 → P04)', 'Cancel (ghost): restore the last saved values', 'Save disabled until something changed'] },
  ],
  states: {
    loading: { show: 'Skeleton: card 1 with two 36px fields and a chip row; card 2 with title lines and four 64px reach rows' },
    error: { show: 'Banner warn in place of the card that failed', copy: 'We couldn\'t load these settings. Check your connection and try again.', action: 'Retry' },
    noPermission: { show: 'Inputs read-only, toggles and steppers disabled, actions hidden; banner neutral at the top of each card', copy: 'View only. Owners and admins can change these settings.' },
    planLock: { show: 'Toggles beyond the plan\'s reach limit stay off and disabled, with LockMarker "{plan}" and an "Upgrade" link to /pricing on the row', copy: 'Available on {plan} and up' },
    overLimit: { show: '402 from PUT: inline error under the total', copy: 'Your plan includes {limit} everyday questions per brand. Remove one, or add a question pack.' },
    flagOff: { show: 'visibility_reach off: card 2 not rendered (brand settings as today plus aliases). abn_suggestion off: no ABN banner.' },
  },
  interactions: [
    { on: 'Turn a reach on', then: 'Stepper enabled with the default split; total and bar update; nothing saved yet' },
    { on: 'Turn a reach off', then: 'Stepper 0; its questions will be removed in the draft after Save' },
    { on: 'Try to turn Local off (click, Space, API)', then: 'Nothing happens in the UI; PUT with local disabled returns 422' },
    { on: 'Save', then: 'PUT /api/brands/:id/reaches → P02 edit mode with draft questions for added reaches; nothing changes for audits until P04 apply' },
    { on: 'Leave with unsaved changes', then: 'Existing unsaved-changes prompt (VERIFY) or "Leave without saving?" Leave / Stay' },
  ],
  api: [
    { call: 'GET /api/brands/:id/reaches', use: 'Reaches, places, targets, plan limit, suggestions' },
    { call: 'PUT /api/brands/:id/reaches', use: '{ reaches: [{reach, enabled, place, targetCount}] } → 200 + draft; 402 over limit; 422 invalid place or Local disabled' },
    { call: 'Existing brand update route (S00 Part 4)', use: 'name, aliases' },
    { call: 'ABN confirm/dismiss route (S01 Part 8, name from code)', use: 'Confirm or dismiss the suggestion' },
  ],
  a11y: [
    'Reach rows: toggles are role="switch" named by the row title; locked Local has aria-disabled="true" and name "Local, always on"',
    'Steppers: role="spinbutton" with aria-label "{reach} questions", min/max/now',
    'Suggestion and ABN banners are labelled regions; after Add/Confirm, focus moves to the first changed control',
    'Totals line is aria-live="polite"',
  ],
  responsive: [
    '≤ 640: card 1 grid becomes one column',
    '≤ 640: reach row becomes 44 | 1fr; the stepper moves to a second line under the chips (aligned to the text column)',
    '≤ 640: banner actions drop below the text; Save and Cancel full width, Save first',
  ],
  acceptance: [
    'Existing brands show exactly one enabled reach (Local) with their current location and question count',
    'Local can\'t be switched off by mouse, keyboard or API',
    'The total never exceeds the limit; + buttons disable at the limit with the tooltip',
    'Toggles beyond the plan limit show the lock marker and Upgrade link and stay off',
    'Save leads to the Questions tab in edit mode with a draft for each added reach; audits unchanged until applied',
    'ABN banner never appears when brands.abn is set; Not mine hides it for good',
    'With all three flags off the page equals today\'s page plus the aliases field',
  ],
  lld: ['8.4.1', '8.4.6', '8.4.7', '8.8.2', '8.8.6', 'E'],
};

const P02: ScreenSpec = {
  id: 'P02', title: 'Brand → Questions tab (view and edit)', route: '/brands/:id/questions (edit mode ?edit=1)', sprints: ['S02', 'S03', 'S04', 'S09'],
  flags: ['question_library', 'agency_questions', 'visibility_reach', 'qi_learning'],
  frame: { kind: 'app', width: 1240, mobile: true },
  access: { roles: 'All members view; owners, admins and analysts edit (edit_brand_data); other roles and the client portal view only', plans: 'View all plans. Edit: Free is view only (LLD 8.3.5 "as today, fixed"; amendment 93); Starter swaps/removes/reorders among suggestions only (D4); Growth and up write their own. Free: suggestions hidden.' },
  layout: [
    'AppShell; breadcrumbs "Workspace › Brands › {brand} › Questions"',
    'PageHeader: title (pageTitle) + subtitle; actions History (secondary) and Edit questions (primary)',
    'Info banner (neutral); the legend; the regeneration banner when shown (amendment 84)',
    'One List per enabled reach in reach order, then the "Names your business" list; gap 20 between lists',
    'Suggestions card (tight)',
    'DraftBar sticky at the bottom in edit mode',
  ],
  nodes: [
    { id: 'P02.entry', component: 'Card', variant: 'tile (the brand overview\'s existing tool tile)', copy: 'Questions|What every audit asks', showWhen: 'flag question_library on', behaviour: ['First of the brand overview\'s tools; opens /brands/:id/questions. Brand pages are routes opened from tiles, not a tab strip (S02 as built, amendment 79)', 'Flag off: the overview\'s links are exactly as before'] },
    { id: 'P02.header', component: 'PageHeader', copy: 'Questions|Version {version} · applied {date} by {userName} · {everyday} everyday + {branded} that name your business · comparing since audit #{auditNumber}', bind: 'GET /questions → set', behaviour: ['"comparing since audit #N" = first audit with the current question_set_hash; omitted when no audit used this version yet ("not used in an audit yet")', 'Version 1 created by the backfill reads "Version 1 · your original questions"', 'One question naming the business reads "1 that names your business" (amendment 79)'] },
    { id: 'P02.header.history', component: 'Button', variant: 'secondary', copy: 'History', behaviour: ['Opens a read-only Drawer: versions newest first, each "Version {v} · {date} · {userName} · {everyday} everyday · used in audits #{a}–#{b}"', 'One audit: "used in audit #{a}"; none: "not used in an audit yet" (amendment 79)'] },
    { id: 'P02.header.edit', component: 'Button', variant: 'primary', copy: 'Edit questions', showWhen: 'role can edit and flag agency_questions on (S03)', behaviour: ['Enters edit mode (URL ?edit=1); button hidden while editing'] },
    { id: 'P02.intro', component: 'Banner', variant: 'neutral', copy: 'Every audit asks these questions on {engines}. Only everyday questions count toward your score.|How questions are chosen', behaviour: ['Link opens the methodology page anchor (/methodology#how-we-gather-answers)', '{engines}: the engines the workspace\'s plan asks, in EngineDots order: "ChatGPT, Claude, Gemini and Perplexity" on Starter and up, "ChatGPT and Perplexity" on Free (amendment 79)'] },
    { id: 'P02.legend', component: 'Text', variant: 'help', copy: 'Squares, left to right: {engineList} · ✓ named you · ? named but not verified · striped: no answer (failed). Only ✓ counts.', behaviour: ['Once, under the intro, only when a row shows EngineDots', '{engineList}: the plan\'s engines joined with " · ", in EngineDots order (amendment 79)'] },
    { id: 'P02.regenBanner', component: 'Banner', variant: 'neutral', copy: 'Your business details changed after these questions were set. Review the suggestions.|Review suggestions', showWhen: 'a regeneration (rename, location change, newer generator) added suggestions after a person applied the current set (amendment 84)', behaviour: ['Under the legend, above the lists', '"Review suggestions" scrolls to the Suggestions card and moves focus to its heading', 'Goes when a new version is applied'] },
    { id: 'P02.section.local', component: 'List', copy: '{reachLabel}|{n} questions|Last audit (#{auditNumber}): {m} of {a} answers named you', bind: 'set.items grouped by reach', behaviour: ['Header uses ReachHeader; "· small sample" after the count when n < 5', 'Right text omitted when the version has no audit yet', 'Without flag visibility_reach there is one section titled "Everyday questions"'] },
    { id: 'P02.row', component: 'QuestionRow', variant: 'view / edit', copy: '{text}|Named you:', bind: 'item.text, item.source, item.service_label, item.intent, lastResult[engine]', behaviour: ['Source pill: Original set (neutral) / From your business type (neutral; template) / AI-suggested (ai) / Written by {agencyName} (agency; "Written by your agency" until S03 binds the name)', 'Chips: service label, intent label (intents map)', 'EngineDots from the last audit that used this question; omitted if none'] },
    { id: 'P02.row.more', component: 'IconButton', variant: 'Menu', copy: 'More actions for {text}', behaviour: ['View mode: Copy text, See answers in the last audit', 'Edit mode: Edit wording (archives old, adds new), Swap for a suggestion, Move to another area (S04), Move up, Move down, Remove from set, Archive'] },
    { id: 'P02.row.weak', component: 'QuestionRow', variant: 'weak', copy: 'AI doesn\'t name any business here (last 2 audits)|Swap', showWhen: 'flag qi_learning on and the question is flagged (S09)', behaviour: ['"Swap" opens P16 inline under the row'] },
    { id: 'P02.section.branded', component: 'List', copy: 'Names your business|{n} questions · not scored|Shown in results, never counted', behaviour: ['Rows use variant branded with pill "Names your business · not scored"; never draggable into reach sections'] },
    { id: 'P02.suggestions', component: 'Card', variant: 'tight', copy: 'Suggestions|{sourceLine}|Add', bind: 'GET /questions → suggestions', showWhen: 'plan is not Free', behaviour: ['{sourceLine}: before S06 "From your business type"; with website analysis "From your website"; adds ", listings" (S07) and " and local search demand" (S08) as those layers are on', 'Each suggestion row: question text, reason chips (Service: {service} · {sourcePath}, Demand: {level}, Pre-test: named {n} businesses)', 'Add (secondary sm) disabled in view mode with tooltip "Edit questions to add"; in edit mode adds to the draft in the suggestion\'s reach', 'In edit mode at the plan\'s limit, Add is disabled with the tooltip "Your plan includes {limit} everyday questions per brand. Remove one, or add a question pack."; Swap (row menu) and Remove still work (amendment 96)', 'A suggestion copied from another brand carries its source pill ("Written by {agencyName}")'] },
    { id: 'P02.addQuestion', component: 'Button', variant: 'secondary sm', copy: '+ Add question', showWhen: 'edit mode, at the foot of each reach section', behaviour: ['Opens P03 with the reach preselected', 'Starter: LockMarker "Growth" instead of the button', 'At the plan\'s limit: disabled, with the limit sentence as its tooltip and as a help line under the everyday list (amendment 96)'] },
    { id: 'P02.draftBar', component: 'DraftBar', copy: 'Draft|+{added} added|−{removed} removed|{moved} moved|{everyday} of {limit} everyday · {branded} of 5 naming you|No changes yet|Discard|Apply from the next audit', showWhen: 'edit mode', behaviour: ['Chips only for non-zero counts; "No changes yet" when empty and Apply disabled', 'Discard: existing confirm dialog "Discard your changes?" (Keep editing / Discard) → back to view mode', 'Apply opens P04', 'Inline errors above the bar, as built (amendment 93): "Keep at least 5 everyday questions." (422); "Only Local questions for now." (422, until S04); the archive refusal for a question in the current set (409 in_current_set; S04 quotes S03\'s sentence in its report)'] },
  ],
  states: {
    loading: { show: 'Skeleton: header lines, banner block, two sections with header + 3 rows each (row height 72)' },
    empty: { show: 'Card with one sentence and one action', copy: 'No questions yet. Confirm your business details to create them.', action: 'Confirm details' },
    error: { show: 'Banner warn replacing the lists', copy: 'We couldn\'t load the questions. Try again.', action: 'Retry' },
    noPermission: { show: 'View mode only; no Edit button; banner neutral under the header', copy: 'View only. Owners, admins and analysts can change questions.' },
    planLock: { show: 'Starter in edit mode: "+ Add question" replaced by LockMarker "Growth" + Upgrade; Free: view only (no Edit button) and no suggestions card', copy: 'Writing your own questions is available on Growth and up.' },
    conflict: { show: '409 from apply: banner warn above the draft bar; draft kept', copy: 'Someone else changed these questions. Reload to see their version.', action: 'Reload' },
    overLimit: { show: '402 from apply: inline error above the draft bar', copy: 'Your plan includes {limit} everyday questions per brand. Remove one, or add a question pack.' },
    flagOff: { show: 'question_library off: no Questions tab; /brands/:id/questions redirects to the brand page. agency_questions off: view mode only.' },
  },
  interactions: [
    { on: 'Edit questions', then: 'Edit mode: handles, + Add question per section, suggestions Add enabled, DraftBar shown' },
    { on: 'Drag a row, or focus its handle and press Alt+↑/↓', then: 'Row moves within its section; live region "Moved to position {n} of {m}"; draft counts "{n} moved"' },
    { on: 'Come back to the page with a saved draft that differs from the current set', then: 'Banner "Keep your draft?" Keep / Discard above the lists (asked on return: a custom prompt on leaving isn\'t possible; amendment 93); an unchanged draft is dropped silently (amendment 96); the draft lives in sessionStorage for this tab (convenience only; the server validates on apply)' },
    { on: 'Apply from the next audit', then: 'P04 modal' },
    { on: 'Apply succeeds', then: 'Inline status "Questions applied. The next audit will use version {v}."; view mode; header shows the new version; if a removed question couldn\'t be archived, the status adds "{n} removed question(s) couldn\'t be archived; they stay in the library."' },
  ],
  api: [
    { call: 'GET /api/brands/:id/questions', use: 'One request for the whole tab: { set, library, suggestions, limits }' },
    { call: 'POST /api/brands/:id/questions/:qid/archive', use: 'Archive from the menu (409 if in the current set)' },
    { call: 'POST /api/brands/:id/question-sets', use: 'Through P04 only' },
  ],
  a11y: [
    'Each section is a <section aria-labelledby> whose header title is an h2',
    'Rows are listitems; the drag handle is a button "Reorder: {text}" with aria-describedby "Press Alt and the up or down arrow to move"',
    'EngineDots role="img" with the full sentence',
    'DraftBar is a region "Draft changes"; its counts are aria-live="polite"',
  ],
  responsive: [
    '≤ 640: header actions wrap under the subtitle (full width)',
    '≤ 640: handles hidden; reorder through the menu (Move up / Move down)',
    '≤ 640: DraftBar fixed to the viewport bottom, counts on line 1, buttons on line 2 (Apply first)',
    '≤ 640: suggestion Add button moves under the chips',
  ],
  acceptance: [
    'View mode renders from one request; no N+1 per row',
    'Sections follow reach order then "Names your business"; branded questions never counted or draggable into reaches',
    'Header counts equal the set; "comparing since" equals the first audit with this hash',
    'Edit mode works by keyboard alone (reorder, menu, add, apply)',
    'A draft survives a reload in the same tab and is discarded on request',
    'Viewer and client portal never see edit controls',
    'Flags off: no tab, redirect as specified',
  ],
  lld: ['8.2', '8.3', '8.4.6', '8.6.8', '10'],
};

const P03: ScreenSpec = {
  id: 'P03', title: 'Add question drawer', route: 'Drawer over /brands/:id/questions?edit=1', sprints: ['S03'],
  flags: ['agency_questions'],
  frame: { kind: 'drawer', width: 1240, mobile: true },
  access: { roles: 'Owners, admins and analysts (edit_brand_data)', plans: 'Growth and up' },
  layout: ['Drawer 480 on the right at z-50, over the cookie banner (amendment 93); column gap 16; title row; textarea field; area segmented; check list (gap 8); info banner; footer pinned to the bottom'],
  nodes: [
    { id: 'P03.title', component: 'Text', copy: 'Add a question', style: 'dialogTitle' },
    { id: 'P03.close', component: 'IconButton', copy: 'Close' },
    { id: 'P03.text', component: 'Textarea', copy: 'Question a customer would ask AI|{n} / 200 characters', behaviour: ['Autofocus on open', 'Checks run 250ms after typing stops (POST validate); the last response wins'] },
    { id: 'P03.area', component: 'Segmented', copy: 'Area|{reachLabels…}', behaviour: ['Only enabled reaches; preselected from the section that opened the drawer', 'Changing area re-runs the checks'] },
    { id: 'P03.checks', component: 'CheckItem', copy: [
      'One question, 10–200 characters',
      'Not already in your questions',
      'Doesn\'t name your business, so it counts toward your score',
      'No links, emails or phone numbers',
    ].join('|'), behaviour: [
      'Always-shown lines (pass ✓ / fail ✕). Fail lines turn --bad and block Add',
      'Naming the business switches line 3 to warn: "Names your business, so it\'s shown but not scored" and the label preview to the branded pill',
      'Conditional line: fail "Plain text only: remove the HTML." for any HTML tag (amendment 89)', 'Conditional lines: warn "No place in the question. AI answers differ by place, and Gemini can\'t be told your location." + accent sm button "Add “in {place}”" (not for Worldwide); fail "Already 5 questions name your business. Remove one first."; fail "This reads like an instruction to the AI, not a customer\'s question."; warn "Names {competitor}. That\'s fine: it\'s counted as a comparison question."',
    ] },
    { id: 'P03.label', component: 'Banner', variant: 'neutral', copy: 'It will be labelled {pill} on the audit page and in reports.', behaviour: ['{pill} = Written by {agencyName} (agency) or Names your business · not scored (branded)'] },
    { id: 'P03.footer', component: 'Layout', copy: 'Added to your draft. Nothing changes until you apply.|Add to draft', behaviour: ['Add to draft (primary) disabled while a blocking check fails or checks are pending', 'On add: drawer closes, the new row appears at the end of its section with focus, live region "Question added to your draft"', 'On the confirm screen (P10.step3) the button reads "Add question" (amendment 93)'] },
  ],
  states: {
    loading: { show: 'Checks pending: each line shows the pending disc and "Checking…"; Add disabled' },
    error: { show: 'Validate request failed: check list replaced by one warn line', copy: 'We couldn\'t check this question. Try again.', action: 'Try again' },
    planLock: { show: 'Drawer never opens below Growth (P02 shows the lock instead)' },
  },
  interactions: [
    { on: 'Click "Add “in {place}”"', then: 'Inserts " in {place}" before the final "?" (or at the end), re-runs checks, keeps the caret at the end' },
    { on: 'Esc or Close', then: 'Closes without adding; if text was typed, asks "Discard this question?" (Keep / Discard)' },
  ],
  api: [{ call: 'POST /api/brands/:id/questions/validate', use: '{ text, reach } → { ok, kind, checks[] }; the server re-runs the same checks on apply' }],
  a11y: [
    'role="dialog" labelled by the title; focus trap; Esc; focus returns to the "+ Add question" button that opened it',
    'Check list aria-live="polite"; textarea aria-describedby → counter and checks',
  ],
  responsive: ['≤ 640: full-screen sheet; footer sticky; Add to draft full width'],
  acceptance: [
    'Every LLD 8.3.2 check is shown with the copy above and blocks or warns as listed',
    'Server re-validation rejects anything the client let through (422)',
    'The one-click place fix produces a question that passes',
    'Keyboard only: open, type, choose area, fix place, add',
  ],
  lld: ['8.3.2', 'C2'],
};

const P04: ScreenSpec = {
  id: 'P04', title: 'Apply changes modal', route: 'Modal over P02', sprints: ['S03'], flags: ['agency_questions'],
  frame: { kind: 'modal', width: 1240, mobile: true },
  access: { roles: 'Owners, admins and analysts (edit_brand_data)', plans: 'All plans with edit rights' },
  layout: ['Modal 560 at z-50, over the cookie banner (amendment 93); title; subtitle; change list (gap 8, margin 16 0); warn banner; footer (margin-top 20)'],
  nodes: [
    { id: 'P04.title', component: 'Text', copy: 'Apply new questions from the next audit?', style: 'dialogTitle' },
    { id: 'P04.subtitle', component: 'Text', copy: '{brand} · version {from} → {to}', style: 'sub' },
    { id: 'P04.changes', component: 'CheckItem', copy: '+ {text} {sourcePill}|− {text}|↕ {text} moved to {reachLabel}', behaviour: ['Net changes only; reworded = one removal + one addition; reorders are not listed (they don\'t change the comparison)'] },
    { id: 'P04.notice', component: 'Banner', variant: 'warn', copy: 'This starts a new comparison.|Audits #{first}–#{last} stay in your history; the trend restarts from the next audit. An audit that is already running keeps the current questions.', bind: 'current comparison run (first and last audit with the current hash)', behaviour: ['If no audit used the current version: "Your trend hasn\'t started yet, so nothing restarts."'] },
    { id: 'P04.footer', component: 'Layout', copy: '{everyday} of {limit} everyday · {branded} naming you|Cancel|Apply from the next audit', behaviour: ['Initial focus on Cancel; Enter never auto-confirms', 'Apply shows the loading state; Esc disabled while the request runs'] },
  ],
  states: {
    loading: { show: 'Apply button loading; Cancel enabled' },
    conflict: { show: '409: modal closes; P02 shows the conflict banner', copy: 'Someone else changed these questions. Reload to see their version.' },
    overLimit: { show: '402: inline error above the footer; modal stays open', copy: 'Your plan includes {limit} everyday questions per brand. Remove one, or add a question pack.' },
    error: { show: '422 or network: inline banner above the footer', copy: 'Some questions didn\'t pass the checks. Fix them in your draft and try again.' },
    success: { show: 'Modal closes; inline status above the Questions list (D-UI4)', copy: 'Questions applied. The next audit will use version {to}.' },
  },
  interactions: [{ on: 'Apply', then: 'POST question-sets with baseVersion; 201 → success state' }],
  api: [{ call: 'POST /api/brands/:id/question-sets', use: '{ baseVersion, items[{questionId?|text, reach, position}], count } → 201 {version}; 409; 402; 422' }],
  a11y: ['role="dialog" aria-modal; initial focus Cancel; focus returns to the Apply button in the DraftBar'],
  responsive: ['≤ 640: full width minus 16px; buttons full width (Apply first)'],
  acceptance: [
    'The audit range in the notice matches the comparison run in the data',
    'A running audit is unaffected (it keeps its question_set_id)',
    'Double-clicking Apply creates one version',
  ],
  lld: ['8.2.3', '8.3.7', 'E'],
};

const P05: ScreenSpec = {
  id: 'P05', title: 'Workspace → Questions settings', route: '/settings/questions', sprints: ['S03', 'S04', 'S10'], flags: ['agency_questions'],
  frame: { kind: 'app', width: 1240, mobile: true },
  access: { roles: 'Owners and admins (existing settings rule)', plans: 'Growth and up edit; Starter sees counts and suggestions only' },
  layout: ['AppShell; breadcrumbs "Account › Questions" (as built: the Account group); the same page wrapper (side padding, max width) as the other Account pages (amendment 95); PageHeader; Defaults card (grid 3 columns gap 16); Brands card (flush) with header row and Table'],
  nodes: [
    { id: 'P05.header', component: 'PageHeader', copy: 'Questions|Choose how many questions each brand is audited on, and write your own. Questions always belong to one brand.' },
    { id: 'P05.defaults', component: 'Card', copy: 'Defaults for new brands' },
    { id: 'P05.defaults.count', component: 'Field', variant: 'Stepper', copy: 'Everyday questions per brand|{planName} includes {included} per brand, plus packs', behaviour: ['Min 5, max the plan\'s included count; affects new brands only'] },
    { id: 'P05.defaults.fill', component: 'Field', variant: 'Toggle', copy: 'Fill empty slots with AI suggestions' },
    { id: 'P05.defaults.reach', component: 'Field', variant: 'Chip', copy: 'Default areas|Local · always on|Add more areas per brand', behaviour: ['S04 makes this a multi-select within the reach limit; Local always included'] },
    { id: 'P05.brands', component: 'Card', variant: 'flush', copy: 'Brands|Copy questions from another brand' },
    { id: 'P05.brands.table', component: 'Table', copy: 'Brand|Areas|Everyday|Written by you|Version|Last change|Edit questions', bind: 'one query for all brands in the workspace', behaviour: ['Everyday "{active} / {allowed}" + neutral pill "+{packs} pack(s)" when packs are assigned (S10)', 'Last change: "Original questions · {date}" for 0155\'s version 1; "Confirmed · {date} · {userName}" for a version saved by the confirm screen; "{date} · {userName}" for one applied in P04 (amendment 95; it printed "backfill")', 'Sorted by last change, newest first; search box above the table past 10 brands; pagination past 50'] },
  ],
  states: {
    loading: { show: 'Skeleton: two blocks, the defaults card and the table (as built; amendment 93)' },
    empty: { show: 'In the Brands card', copy: 'No brands yet. Add a brand to set its questions.', action: 'Add brand' },
    error: { show: 'One banner warn for the page: it loads from one request, so both cards fail together (amendment 93)', copy: 'We couldn\'t load question settings. Try again.', action: 'Retry' },
    noPermission: { show: 'Existing settings permission handling (viewer can\'t open settings)' },
    planLock: { show: 'Starter: steppers, toggle and Copy disabled with LockMarker "Growth"; table read-only' },
    flagOff: { show: 'agency_questions off: page not in the settings navigation; route returns the existing 404' },
  },
  interactions: [
    { on: 'Copy questions from another brand', then: 'Modal: Source brand and Target brand selects (same workspace, different brands) → Copy; copied questions land as suggestions in the target\'s library with places swapped where they match; inline status "Copied {n} questions to {target} as suggestions. Review them in its Questions tab."' },
    { on: 'Change a default', then: 'Saves on change (debounced 500ms) with inline "Saved" status (D-UI4); never touches existing brands' },
  ],
  api: [
    { call: 'Existing workspace settings route or new GET/PUT /api/settings/questions (S03 decides; name from code)', use: 'Defaults' },
    { call: 'POST /api/brands/:id/questions/copy-from', use: '{ sourceBrandId } → { added }' },
  ],
  a11y: ['Table semantics; "Edit questions" links include the brand name in their accessible name'],
  responsive: ['≤ 640: defaults grid one column; table scrolls horizontally with the brand column sticky', 'Never wider than the viewport: checked at 390, 768, 1240 and 1920 (amendment 95)'],
  acceptance: [
    'One query for the table (no per-brand requests)',
    'Changing defaults never changes an existing brand\'s set',
    'Copy lands as suggestions only and keeps brand-specific places',
  ],
  lld: ['8.3.4', '8.3.5'],
};

const P06: ScreenSpec = {
  id: 'P06', title: 'Add brand wizard, step 2: what does the business do?', route: '/brands/wizard (step 2)', sprints: ['S05'], flags: ['business_taxonomy'],
  frame: { kind: 'app', width: 1240, contentMaxWidth: 860, mobile: true },
  access: { roles: 'Roles that can add brands today (manage_brands: owners and admins)', plans: 'All; custom types Growth and up (D5)' },
  layout: ['Content max width 860; title block; 4-segment step bar (gap 6); step card; footer row Back / Continue'],
  nodes: [
    { id: 'P06.header', component: 'PageHeader', copy: 'Add a brand|Step 2 of {steps} · about 3 minutes in total', style: 'title type display', behaviour: ['{steps} from the existing wizard (VERIFY)'] },
    { id: 'P06.progress', component: 'ProgressBar', variant: 'segmented steps', a11y: 'role="progressbar" aria-valuenow={step} aria-valuemax={steps} aria-label "Step {step} of {steps}"' },
    { id: 'P06.card', component: 'Card', copy: 'What does the business do?|Search by what customers call it. Pick one or more; star the main one. You\'ll confirm the services next.', style: 'title type stepTitle' },
    { id: 'P06.search', component: 'Combobox', copy: 'Business type|{typeName}|{sectorName} · also “{alias}”|service match: “{service}”|Can\'t find it? Add a custom type|Only your workspace sees it · Growth and up|Custom', bind: 'lib/taxonomy static JSON (versioned) + workspace custom types first', behaviour: ['Ranking: name > alias > service; accent-insensitive prefix and token match', 'Up to 8 results; the custom option is always last', 'Enter adds the active result to Selected and clears the input'] },
    { id: 'P06.selected', component: 'Field', variant: 'Chip star + removable', copy: 'Selected|★ {main}|☆ {other}', behaviour: ['Max 5 types; first pick is main; one main always; removing the main promotes the next', 'At 5: input disabled with help "You can pick up to 5 types."'] },
    { id: 'P06.sectors', component: 'Field', variant: 'Chip selectable', copy: 'Or browse by sector|{sectorName}…', behaviour: ['Selecting a sector filters the results list to that sector (input empty shows all its types A–Z)', 'The old four cards map to the first four chips: Tradies → Trades and home services, Allied health → Health and wellbeing, SaaS → Software and online, Other local business → shows all sectors'] },
    { id: 'P06.footer', component: 'Layout', copy: 'Back|Continue', behaviour: ['Continue (primary) disabled until one type is selected', 'Writes brand_business_types and keeps classification.category / vertical mapped back (S05 Part 4)'] },
  ],
  states: {
    empty: { show: 'No match in the listbox', copy: 'No match for “{query}”. Try another word, or add a custom type.' },
    planLock: { show: 'Custom option shows LockMarker "Growth" and opens nothing' },
    flagOff: { show: 'business_taxonomy off: today\'s four cards, unchanged' },
    error: { show: 'Taxonomy JSON failed to load: the four sector cards from today are shown as a fallback with a neutral banner', copy: 'We couldn\'t load the full list of business types. Pick the closest group for now; you can change it later in brand settings.' },
  },
  interactions: [
    { on: 'Click ☆ on a selected chip', then: 'It becomes main (★); the previous main becomes ☆' },
    { on: 'Choose the custom option (Growth and up)', then: 'Opens P11 with the typed text as the name' },
  ],
  api: [{ call: 'Static taxonomy JSON (long cache, version in the URL) + custom types from the existing brand wizard data call', use: 'No request per keystroke' }],
  a11y: ['ARIA 1.2 combobox (see component); results count announced', 'Selected chips: star toggle aria-pressed; remove buttons named'],
  responsive: ['≤ 640: content full width; sector chips scroll horizontally in one row; Back/Continue full width (Continue first)'],
  acceptance: [
    '"managed it" → Managed IT services provider first; "sparky" → Electrician; "MSP" → Managed IT',
    'Search over 250 types responds in < 50ms in the browser test',
    'Keyboard-only selection, starring and removal work; axe has no violations',
    'Flag off: wizard identical to today',
  ],
  lld: ['8.5.2', '8.5.4'],
};

const P07: ScreenSpec = {
  id: 'P07', title: 'Audit page additions', route: '/audits/:id', sprints: ['S01', 'S03', 'S04'], flags: ['report_v2', 'agency_questions', 'visibility_reach'],
  frame: { kind: 'app', width: 1240, mobile: true },
  access: { roles: 'All members; client portal shows the same cards read-only', plans: 'All' },
  layout: ['Existing header and cards unchanged. Added: reach row card (S04), mix and split lines (S03), "Why, and what to do next" finding tiles (S01), "Beyond AI answers" card (S01)'],
  nodes: [
    { id: 'P07.header', component: 'Layout', copy: 'Complete · {engines} engines · {questions} questions|{brand}|Audit #{n} · {date} · {questions} questions × {engines} engines = {answers} answers · Method: {methodLabel}', behaviour: ['Existing header; only the question count wording is new'] },
    { id: 'P07.score', component: 'ScoreFigure', copy: 'VISIBILITY|{pct}%|Mentioned in {m} of {n} answers · {reachLabel}', behaviour: ['{reachLabel}: "Local · {city}" for Local-only brands; "across Local, NSW and Australia" otherwise (D-QI9)'] },
    { id: 'P07.reachRow', component: 'Card', copy: 'Where AI recommends you|Each area has its own questions', showWhen: 'flag visibility_reach on and more than one enabled reach' },
    { id: 'P07.reachRow.tile', component: 'StatTile', variant: 'score', copy: '{reachLabel}|{pct}%|{m} of {n} answers · 95% CI {lo}–{hi}%|Small sample', bind: 'audit_reach_results', behaviour: ['One tile per reach in reach order; grid 3 (4 when Worldwide is on)', 'Small sample pill when the reach has < 5 questions (tooltip sentence)'] },
    { id: 'P07.mix', component: 'Text', copy: '{total} questions: {everyday} everyday ({ai} AI-suggested, {agency} written by {agencyName}) and {branded} that name the business.', style: 'help, margin-top 12', showWhen: 'flag agency_questions on (S03)', behaviour: ['Omit parts that are zero; singular forms', 'A brand whose questions were never changed: "13 questions: 10 everyday (all from the original set) and 3 that name the business." (amendment 93)', 'Also in the client portal (under "Mentioned in …") and on the PDF Method page (from the report snapshot)'] },
    { id: 'P07.split', component: 'Text', copy: 'AI-suggested questions: {pct}% ({m} of {n})|Written by {agencyName}: {pct}% ({m} of {n})', style: 'help', showWhen: 'both sources exist in this audit (D2)', behaviour: ['Each source on its own line under the headline, right-aligned with it; a long agency name never wraps inside a part (amendment 94)', 'Audit page only: not the client portal, not the PDF (amendment 93)', 'Counted exactly as the headline: when the headline includes Google\'s AI answers, they are split too, so the parts add up to the headline (amendment 88)'] },
    { id: 'P07.findings', component: 'Card', copy: 'Why, and what to do next', behaviour: ['Existing rules a–f plus g–j (LLD 8.1.5); also listed in Recommended actions'] },
    { id: 'P07.finding', component: 'StatTile', variant: 'finding', copy: '{title}|{priority}|{explanation}|{evidence}', behaviour: ['Priority pill: High (bad), Medium (warn), Strength (good)', 'Rule h quotes the matched sentence (≤ 200 chars) with engine and question', 'Never shows "No finding rule matched"'] },
    { id: 'P07.beyond', component: 'Card', copy: 'Beyond AI answers|Separate from the Visibility score', showWhen: 'flag report_v2 on' },
    { id: 'P07.beyond.identity', component: 'StatTile', variant: 'status', copy: 'Business identity|ABN verified|{status} · {entityName} · checked {date}|.au domain: {yes|no} · Wikipedia: {wikiStatus}', behaviour: ['No ABN: neutral pill "No ABN on file" + link "Add your ABN" (brand settings)', 'Words, never symbols, in mono text: the PDF\'s mono font has no ✓ (amendment 55)'] },
    { id: 'P07.beyond.youtube', component: 'StatTile', variant: 'status', copy: 'YouTube|No channel linked|Add your channel', behaviour: ['Linked: "Channel found" (good) + "{videos} videos · last upload {date}" (nothing measures which videos AI cited, so no such line)', 'Check unavailable (no YOUTUBE_API_KEY or the check switched off): neutral "Not checked"'] },
    { id: 'P07.beyond.crawlers', component: 'StatTile', variant: 'status', copy: 'AI crawlers|Search crawlers allowed|{allowed} of {total} AI search crawlers allowed · checked {date}|Visits: not measured|Next step: Upload server logs', behaviour: ['The next-step line is printed once (amendment 55)', 'Blocked crawlers: warn pill "{n} search crawlers blocked" + names', 'Visits measured: "Visits in 30 days: {n} ({bots})"'] },
    { id: 'P07.beyond.technical', component: 'StatTile', variant: 'score', copy: 'Website technical|{score} of {max} points|checked {date}|Weakest: {area}, {a} of {b} points', style: 'value 22/28 mono 600', behaviour: ['Uses the existing technical audit; not run: neutral "Not checked yet" + "Run check"', '"points" is the score\'s unit as the scoring code defines it (S01C confirms); {area} in plain words ("structured data", not "Schema"); the scoring version is printed in the PDF\'s Method line, not on the tile (amendment 63)'] },
  ],
  states: {
    loading: { show: 'Existing audit page loading; new cards use Skeleton tiles of the final size' },
    stale: { show: 'Any Beyond tile older than 30 days: detail line in --warn', copy: 'Last checked {date}, may be out of date' },
    empty: { show: 'A Beyond tile with no data: neutral pill + action link, never a 0', copy: 'Not checked yet' },
    partial: { show: 'Partial audits keep the existing partial treatment; reach tiles from partial data say "partial" in the detail line' },
    flagOff: { show: 'All three flags off: the audit page is exactly today\'s' },
  },
  interactions: [{ on: 'Hover or focus a reach tile', then: 'Tooltip: "{m} of {n} everyday answers in {reachLabel} named you."' }],
  api: [{ call: 'Existing audit page data loader + audit_reach_results + latest entity/YouTube/robots/technical rows (one query each, no per-tile requests)', use: 'Server-rendered' }],
  a11y: ['Tiles read as "{label}: {value}, {detail}"', 'Priority pills are words, not colour only'],
  responsive: ['Reach tiles: 3–4 columns ≥ 1024, 2 columns 641–1023, 1 column ≤ 640', 'Beyond tiles: 4 columns ≥ 1100, 2 columns ≥ 641, 1 column ≤ 640', '≤ 640: score block moves under the title (left aligned)'],
  acceptance: [
    'Local-only brand: headline number identical to today; label "Local · {city}"; no reach row',
    'Sum of reach tiles\' mentions/answers equals the headline counts',
    'A 0% audit (TechCore #52 fixture) shows findings g–j and Recommended actions are not empty',
    'Every Beyond tile shows its own date; none shows a 0 for "not measured"',
  ],
  lld: ['8.1.4', '8.1.5', '8.3.3', '8.4.6', '10'],
};

const P08: ScreenSpec = {
  id: 'P08', title: 'Report contents panel with report type', route: '/brands/:id/reports → Generate report (modal)', sprints: ['S01'], flags: ['report_v2'],
  frame: { kind: 'modal', width: 1240, mobile: true },
  access: { roles: 'Owners, admins and analysts (generate_reports)', plans: 'Reports are Growth and up (D-RT1 revised): Growth Basic and Standard; Agency, Agency Pro, Enterprise all three, chosen per report (D-RT2). Curation Agency and up (D1)' },
  layout: [
    'Modal 1100, two columns 1fr | 320, padding 0',
    'Left (padding 24, right border): header; report type picker (margin-top 16); then by tier: Standard and Enhanced show "What to do next · measured", "Recommended by {agency}" + "+ Add your own action", "Sections"; Enhanced also shows "Checks before this report"; Basic shows one help line instead',
    'Right (padding 24, --surface-2): "Report outline" ordered list, note, buttons pinned to the bottom',
  ],
  nodes: [
    { id: 'P08.header', component: 'Layout', copy: 'Report contents|{brand} · based on audit #{n} · Week {w}', behaviour: ['Close IconButton top right'] },
    { id: 'P08.tier', component: 'Segmented', variant: 'cards', copy: 'Report type|{basicName}|Score, engine by engine, Google Search AI, where AI looks, competitors, trend, and why your score is what it is.|{standardName}|Everything in Basic, plus an action plan: what to do next, the evidence for each action, and what was done since the last report.|{enhancedName}|Everything in Standard, plus checks beyond AI answers: business identity and ABN, YouTube, AI crawler access, website technical health and your directory profiles.|Available on {plan} and up', bind: 'tiers.ts maxReportTier(plan); report_brand_preferences.default_tier; report_tier_names', behaviour: ['Three cards in tier order; names from report_tier_names (Agency and up) else Basic, Standard, Enhanced; the descriptions always use the plain words above', 'Default selection: the brand\'s last tier, else the plan\'s highest tier', 'Tiers above the plan: card disabled, LockMarker "{plan}" + Upgrade link (app only, never in the PDF)', 'Changing the tier updates the left column and the outline immediately; the choice is saved as the brand default when a report is generated or saved'] },
    { id: 'P08.basicNote', component: 'Text', copy: 'A Basic report has today\'s report pages, including why the score is what it is. Choose {standardName} to add an action plan.', style: 'help, margin-top 16', showWhen: 'tier = basic', behaviour: ['Second sentence only when Standard is in the plan'] },
    { id: 'P08.measured', component: 'List', copy: 'What to do next · measured', style: 'group label type overline, margin 18 0 8', showWhen: 'tier = standard or enhanced' },
    { id: 'P08.measured.item', component: 'QuestionRow', variant: 'report (20 | 44 | 1fr | auto)', copy: '{title}|{evidence}|Add a note for your client (optional)|{priority}', behaviour: ['Include Toggle; reorder by drag or ↑/↓ IconButtons ("Move up", "Move down")', 'Note Input (32 tall) ≤ 400 chars, shown when included', 'Excluded rows: content opacity .6', 'Evidence is read-only'] },
    { id: 'P08.agency', component: 'List', copy: 'Recommended by {agencyName}|Your recommendation|Shown as "Recommended by {agencyName}", never as measured.|Edit', showWhen: 'tier = standard or enhanced', behaviour: ['Agency pill; Edit opens an inline form: title (5–120), detail (≤ 600), priority (High/Medium/Low); Archive in the form'] },
    { id: 'P08.addAction', component: 'Button', variant: 'secondary sm', copy: '+ Add your own action', showWhen: 'tier = standard or enhanced' },
    { id: 'P08.checks', component: 'List', copy: 'Checks before this report|Business identity (ABN)|YouTube|AI crawler access|Website technical|Your directory profiles|Checked {age} · will reuse|Checked {age} · will run again (about {duration})|From audit #{n}|No channel linked · shown as not linked|Not checked yet · will run again (about {duration})|Not checked · shown as not checked|Before an Enhanced report, checks older than their window run again. None of them change the Visibility score.', showWhen: 'tier = enhanced', bind: 'latest result per check vs D-RT4 windows (identity 30 days, crawler access 7, YouTube 7, technical 30)', behaviour: ['Rows 40 tall, padding 10 × 16; label body; status help on the right; "will run again" in --warn', 'Read-only: the windows are fixed (D-RT4)'] },
    { id: 'P08.sections', component: 'Layout', copy: 'Sections|Done since the last report ({n} items)|General advice, not drawn from this audit', showWhen: 'tier = standard or enhanced', behaviour: ['Two Toggles, both on by default; "Done since" hidden when n = 0; general advice lists evidence-backed items only (8.8.5)', 'No "Beyond AI answers" toggle: the tier decides (C-23)'] },
    { id: 'P08.outline', component: 'Layout', copy: 'Report outline · {tierName}|Cover|Summary|Engine by engine|Google Search AI|Where AI looks|Competitors|Why your score is what it is|Why, and what to do next · {n} actions|Over time|Beyond AI answers|Method and notes', behaviour: ['Basic: "Why your score is what it is" and no Beyond AI answers; Standard: "Why, and what to do next · {n} actions"; Enhanced: plus "Beyond AI answers"', 'Pages added by the tier in 600 --text'] },
    { id: 'P08.footer', component: 'Layout', copy: 'Your choices are saved for {brand} and used next time. Generated reports never change afterwards.|Generate {tierName} report|Save without generating', behaviour: ['Generate (primary): the existing generate route with { periodType, tier, contents } (the server picks the basis audit, as today); panel closes; the P17 row shows "Generating…" (Enhanced: "Running checks…" first)', 'Save without generating (ghost): saves report_action_choices / report_brand_preferences (with default_tier); inline status "Report contents saved." (D-UI4)'] },
  ],
  states: {
    loading: { show: 'Skeleton: three tier cards, then rows in the left column; outline static' },
    empty: { show: 'No measured actions (Standard or Enhanced)', copy: 'No measured actions for this audit. You can still add your own.' },
    error: { show: 'Inline banner above the footer', copy: 'We couldn\'t save your choices. Try again.' },
    planLock: { show: 'Growth: Enhanced locked "Agency" with Upgrade to /pricing; toggles, reorder, notes and agency actions disabled with LockMarker "Agency"; Generate enabled', copy: 'Available on {plan} and up' },
    overLimit: { show: '402 report_tier_not_in_plan (plan changed while open): inline banner; the picker falls back to the highest allowed tier', copy: 'Your plan now includes reports up to {tierName}. Choose another report type.' },
    flagOff: { show: 'report_v2 off: "Generate report" works as today (no panel, today\'s report)' },
  },
  interactions: [
    { on: 'Pick a tier', then: 'Left column and outline switch to that tier\'s contents; nothing saved yet' },
    { on: 'Toggle, reorder or note', then: 'Outline updates immediately; nothing is saved until Generate or Save' },
  ],
  api: [
    { call: 'POST /api/brands/:id/reports/generate { periodLabel?, periodType, tier, contents }', use: '402 report_tier_not_in_plan above the plan; the server derives the page set from the tier and drops anything else' },
    { call: 'GET/PUT /api/brands/:id/report-preferences', use: 'default_tier, section toggles, action choices' },
  ],
  a11y: ['Tier picker is a radiogroup ("Report type"); arrow keys move and select; locked cards are aria-disabled with the plan in their name', 'Dialog with initial focus on the selected tier card', 'Move buttons named with the item title; live region announces new positions'],
  responsive: ['≤ 900: outline column collapses under the list', '≤ 640: full-screen modal; tier cards stack in one column; footer buttons sticky at the bottom'],
  acceptance: [
    'Generated PDF contains exactly the selected tier\'s pages and the included items in the chosen order with notes (contents_snapshot.tier)',
    'Tier above the plan is refused by the server (402) even if the UI is bypassed',
    'Enhanced lists each check with its age and re-runs only stale ones',
    'Re-rendering an old report uses its snapshot, unchanged by later edits or plan changes',
    'Growth can generate Basic or Standard but not curate',
  ],
  lld: ['8.1.3', '8.1.7', 'D'],
};

const P09: ScreenSpec = {
  id: 'P09', title: 'PDF pages: cover, what to do next, beyond AI answers, reach row', route: 'PDF (react-pdf)', sprints: ['S01', 'S04'], flags: ['report_v2', 'visibility_reach'],
  frame: { kind: 'pdf', width: 1240, mobile: false },
  access: { roles: 'Report readers', plans: 'All plans that have reports; pages by tier (8.1.7)' },
  layout: ['A4 pages with the existing header/footer; agency branding unchanged', 'Basic: today\'s pages and page breaks (today\'s Diagnosis page with its heading unchanged, findings a–j within today\'s limit of 3 problems + 1 strength; N15)', 'Standard: the section "Why, and what to do next" in place of Diagnosis, then Over time and Method and notes. Enhanced: "Beyond AI answers" between Over time and Method and notes (amendment 62)', 'Standard and Enhanced: from "Why, and what to do next" onwards sections flow; a section starts on the current page when at least a third of it is left; headings stay with their first item; cards never split; Method and notes is kept whole and starts on a new page when it doesn\'t fit (amendment 52)', 'Beyond AI answers keeps its tiles together by row: a row never splits and the heading stays with its first row; the directory-profiles tile may start the next page (amendment 62)', 'Page fill: no page other than the last is less than half full where the content allows it; Enhanced for a brand shaped like the real audit #54 fits 8 pages (amendment 62)'],
  nodes: [
    { id: 'P09.cover', component: 'PdfPage', variant: 'cover (existing)', copy: '{TIER NAME}', showWhen: 'Agency and up (D-RT3)', style: 'Eyebrow style (JetBrains Mono 500 8.5/12, tracking .14em, #FCD34D: the cover is navy, so the evidence block\'s amber, ≥ 4.5:1) on its own line directly above the existing cover title; uppercase of the tier name (amendment 45)', behaviour: ['The rest of the cover is unchanged (illustrative in the prototype)', 'Never shown for Starter or Growth'] },
    { id: 'P09.next', component: 'PdfPage', copy: '{nn} · WHY, AND WHAT TO DO NEXT|MEASURED · AUDIT #{n}|What we found, and what to do next|Each action shows the evidence from this audit. Notes and actions from {agencyName} are labelled.', showWhen: 'tier = standard or enhanced (Basic keeps today\'s Diagnosis page and its heading, with findings a–j (N15); P08\'s outline calls it "Why your score is what it is")', behaviour: ['Each finding appears once (existing card style), carrying its Action Center item\'s priority and status pills and {agencyName}\'s note when there is one (amendment 52)', 'At most 3 problem findings and 1 strength, by impact (today\'s rule); the rest appear only as actions. The limit is the PDF\'s; the audit page lists every finding', 'A strength card shows only its STRENGTH label, never a status pill; a finding whose action the agency hid keeps its card without the action\'s pills or note', 'Then groups OTHER ACTIONS FROM THIS AUDIT (measured items not shown as a finding), RECOMMENDED BY {AGENCY}, DONE SINCE THE LAST REPORT, GENERAL ADVICE, NOT DRAWN FROM THIS AUDIT (when switched on)', 'Groups render only when non-empty; never prints "No finding rule matched"', 'The sentence "Notes and actions from {agencyName} are labelled." only when the report has at least one note or action from {agencyName} (amendment 61)', 'OTHER ACTIONS FROM THIS AUDIT: text in Inter, only the "· audit #{n}" tag in mono; ordered High, Medium, Low, then newest first (amendment 61), unless the agency saved an order for the group in the report contents panel, which then wins (amendment 68)'] },
    { id: 'P09.next.action', component: 'PdfPage', variant: 'action card', copy: '{PRIORITY}|{STATUS}|{title}|{evidence}|Note from {agencyName}: {note}' },
    { id: 'P09.beyond', component: 'PdfPage', copy: '{nn} · BEYOND AI ANSWERS|SEPARATE CHECKS · OWN DATES|What else we checked about your business|These checks are separate from the Visibility score and don\'t change it.', showWhen: 'tier = enhanced', behaviour: ['2 × 2 tiles: Business identity, YouTube, AI crawlers, Website technical; then "Your directory profiles" across both columns; each prints its own date line', 'Missing data prints "Not checked" + how to enable; older than 30 days prints "may be out of date"; a failed refresh prints "Couldn\'t check on {date}: {reason}"'] },
    { id: 'P09.beyond.directories', component: 'PdfPage', variant: 'wide tile', copy: 'Your directory profiles|FROM AUDIT #{n} · {DATE}|Linked {linked} of {cited} directories AI cites for your questions.|{directory} · cited in {n} of {total} answers · linked|{directory} · cited in {n} of {total} answers · not linked yet|+ {k} more in section {nn}', showWhen: 'tier = enhanced', behaviour: ['Directories from the basis audit citations over directory_registry, top 6 by citations; "+ {k} more" only when more than 6, naming the Where AI looks section (amendment 63); linked status from the brand\'s directory links (S7 adds confirmed listing matches)', 'None linked: "No profiles linked yet." + the cited directories'] },
    { id: 'P09.reachRow', component: 'PdfPage', variant: 'tile row', copy: '{reachLabel}|{pct}%|{m} of {n}', showWhen: 'more than one enabled reach (Summary page only, every tier)' },
    { id: 'P09.method', component: 'PdfPage', variant: 'method additions', copy: '{mix line}|Checks outside AI answers: identity {date} · YouTube {date} · crawlers {date} · technical {date}, {scoringVersion} scoring', behaviour: ['"Checks outside AI answers" line only in Enhanced; the technical scoring version is printed here, not on the tile (amendment 63)'] },
  ],
  states: { flagOff: { show: 'report_v2 off: today\'s PDF unchanged' } },
  interactions: [],
  api: [{ call: 'render-report-pdf job', use: 'Reads only generated_reports.contents_snapshot (tier included); Enhanced runs the refresh step first' }],
  a11y: ['Text is real text; colours meet the PDF contrast values in `contrast.pdf`'],
  responsive: [],
  acceptance: [
    'Page images for every seeded fixture in all three tiers match these layouts, including the fourth seed shaped like the real audit #54 report (S01C); its Enhanced PDF has at most 8 pages',
    'Basic PDF passes N15 (today\'s pages; only the allowed corrections differ)',
    'No Basic or Standard PDF mentions another tier, a price or a plan',
    'Agency items always labelled; measured items never use agency colours',
    'Footer and meta text ≥ 4.5:1 (#6B6B76 on white, C-12)',
  ],
  lld: ['8.1.2', '8.1.4', '8.1.7', 'D'],
};

const P10: ScreenSpec = {
  id: 'P10', title: 'Confirm business v2', route: '/brands/:id (confirm flow)', sprints: ['S03', 'S05', 'S06', 'S07', 'S08'],
  flags: ['qi_website', 'business_taxonomy', 'qi_listings', 'qi_demand', 'qi_competitors', 'qi_pretest'],
  frame: { kind: 'app', width: 1240, mobile: true },
  access: { roles: 'Owners, admins and analysts (edit_brand_data)', plans: 'All; "Add your own question" Growth and up' },
  layout: ['Highlight Card with header (title + sub left, StepIndicator right); step body; footer row (help left, primary right)', 'Step 1 Services list; Step 2 Where you work; Step 3 Questions (P02 rows)'],
  nodes: [
    { id: 'P10.card', component: 'Card', variant: 'highlight', copy: 'Confirm what {brand} does|We read {pages} pages of {domain} and {listings} listing(s). Untick anything that\'s wrong; nothing is used until you confirm.', behaviour: ['Sub line names only the sources actually used'] },
    { id: 'P10.steps', component: 'StepIndicator', copy: 'Services|Where you work|Questions', behaviour: ['S03–S05: two steps on today\'s card, "Business details" and "Questions"; S06 makes them the three above (amendment 93)'] },
    { id: 'P10.types', component: 'Layout', copy: 'Detected business types|{type} · {confidence}', showWhen: 'flag business_taxonomy on (S05)', behaviour: ['Above the services: detected types grouped by sector with High/Medium/Low pills and the P06 search to change them; every confirmation writes classification_feedback'] },
    { id: 'P10.service', component: 'QuestionRow', variant: 'confirm (24 | 1fr | auto)', copy: '{service}|Website · {path}|“{quote}”|Own section|Demand: {level}', behaviour: ['Pre-ticked when prominence is high or medium; low unticked with help "Low prominence · unticked by default"', 'Evidence chips per source (website path, listing, competitor count); quote ≤ 300 chars on expand', 'Demand chip only with qi_demand (S08); "Own section" neutral pill when the service has its own page or section'] },
    { id: 'P10.competitorAsk', component: 'QuestionRow', variant: 'confirm, fill --surface-2', copy: 'Do you also offer {service}?|{n} of your {m} competitors list it|Yes|No', showWhen: 'flag qi_competitors on (S08)', behaviour: ['Yes adds the service ticked; No records the answer; never added without Yes'] },
    { id: 'P10.addService', component: 'Button', variant: 'secondary sm', copy: '+ Add a service' },
    { id: 'P10.listing', component: 'Banner', variant: 'info', copy: 'Is this your {directory} profile?|{name} · {suburb} {state} · matched by {matchReasons}|Yes, link it|No', showWhen: 'flag qi_listings on and a strong match exists (S07)', behaviour: ['Yes writes the existing directory-links store; No stores the dismissal'] },
    { id: 'P10.footer', component: 'Layout', copy: 'Step 2 confirms suburbs and areas (Local always on); step 3 shows the questions with why each was chosen.|Next: where you work' },
    { id: 'P10.step2', component: 'Card', variant: 'tight', copy: 'Where you work|Base: {suburb} {state} {postcode}|Served: {areas}|Local · {city}|Always on|{reach} (suggested)', behaviour: ['Evidence line with the website quote that suggests a wider reach', 'Suggested reaches start off; turning on follows P01 rules'] },
    { id: 'P10.step3', component: 'Card', variant: 'tight', copy: 'Questions|Service: {service} · {path}|Demand: {level}|Pre-test: named {n} businesses|{everyday} of {limit} everyday|Confirm and start the first audit', behaviour: ['Uses P02 rows with reason chips; swap for a spare; Growth and up "Add your own question" (P03, whose button reads "Add question" here)', 'Remove on everyday rows, down to 5; a removed generated question goes back to the spares (amendment 93)', 'No spare to swap in: no Swap buttons, and the help line "No other questions to swap in for this business type yet." under the everyday list (amendment 85)', 'Confirm saves the profile, applies set v1 (new brand) or v n+1 with the P04 notice (existing brand), starts the first audit for new brands'] },
  ],
  states: {
    loading: { show: 'P12 while analysis runs; then this screen' },
    partial: { show: 'Banner warn at the top of the card', copy: 'We couldn\'t read your website ({reason}). We used your listings and business type instead.' },
    error: { show: 'Save failed: inline banner above the footer', copy: 'We couldn\'t save your details. Try again.' },
    flagOff: { show: 'qi_website off: today\'s "Confirm your business details" with the S03 Questions step' },
  },
  interactions: [
    { on: 'Next / Back', then: 'Moves between steps; choices kept; Back available on steps 2 and 3' },
    { on: 'Confirm and start the first audit', then: 'Button loading; on success navigate to the audit progress page (existing)' },
  ],
  api: [{ call: 'S06 confirm route (name from code) + existing audit start', use: 'Save profile, apply set, start audit' }],
  a11y: ['Checkbox rows labelled by the service name; quotes expandable by keyboard (button "Show evidence")', 'StepIndicator aria-current'],
  responsive: ['≤ 640: right-hand pills move under the evidence chips; step 2 and 3 cards stack; footer buttons full width'],
  acceptance: [
    'Nothing is used until Confirm',
    'Unticked services never appear in questions',
    'Competitor services and listings are offered only when strong, never auto-added',
    'Flags off: today\'s confirm screen (plus the S03 Questions step)',
  ],
  lld: ['8.3.6', '8.5.3', '8.6.4', '8.6.6', '8.6.7'],
};

const P11: ScreenSpec = {
  id: 'P11', title: 'Custom business type', route: 'Modal from P06 and /settings/business-types', sprints: ['S05'], flags: ['business_taxonomy'],
  frame: { kind: 'modal', width: 1240, mobile: true },
  access: { roles: 'Owners and admins', plans: 'Growth 5 · Agency 20 · Agency Pro unlimited (D5)' },
  layout: ['Modal 560; title; sub; fields (gap 16): Name, grid 2 (Sector, Closest type), What it does, Services chips; footer'],
  nodes: [
    { id: 'P11.title', component: 'Text', copy: 'Add a custom business type', style: 'dialogTitle' },
    { id: 'P11.sub', component: 'Text', copy: 'Only {workspace} sees it. Questions use the closest type\'s question style plus your services.', style: 'sub' },
    { id: 'P11.name', component: 'Field', variant: 'Input', copy: 'Name|3–60 characters', behaviour: ['Unique per workspace ignoring case → error "You already have this type."'] },
    { id: 'P11.sector', component: 'Field', variant: 'Select', copy: 'Sector', behaviour: ['Required; existing Select component'] },
    { id: 'P11.closest', component: 'Field', variant: 'Combobox', copy: 'Closest type (optional)', behaviour: ['Searches within the chosen sector; empty → the sector\'s general template family'] },
    { id: 'P11.description', component: 'Field', variant: 'Input', copy: 'What it does (one line)', behaviour: ['≤ 140 characters'] },
    { id: 'P11.services', component: 'Field', variant: 'Chip removable + Button ghost sm', copy: 'Services|+ Add', behaviour: ['1–30 services, each 2–60 characters'] },
    { id: 'P11.footer', component: 'Layout', copy: '{used} of {limit} custom types used|Cancel|Add type', behaviour: ['Agency Pro shows "{used} custom types" (no limit)', 'Add type (primary) adds it to Selected in P06 or to the list on the settings page'] },
  ],
  states: {
    overLimit: { show: '402: inline error above the footer', copy: 'You\'ve used all {limit} custom types on {plan}. Archive one or upgrade.' },
    error: { show: 'Inline banner', copy: 'We couldn\'t add this type. Try again.' },
    planLock: { show: 'Never opens below Growth' },
  },
  interactions: [{ on: 'Esc / Cancel', then: 'Closes; if fields changed, asks "Discard this type?"' }],
  api: [{ call: 'S05 custom type routes (name from code)', use: 'Create, edit, archive' }],
  a11y: ['Dialog; initial focus on Name; errors linked with aria-describedby'],
  responsive: ['≤ 640: grid one column; full-width modal'],
  acceptance: ['Cross-workspace isolation (another workspace never sees it)', 'XSS payloads render as text', 'Limits enforced on the server'],
  lld: ['8.5.4'],
};

const P12: ScreenSpec = {
  id: 'P12', title: 'Analysis progress', route: '/brands/:id (while analysis runs)', sprints: ['S06', 'S07', 'S08'], flags: ['qi_website', 'qi_listings', 'qi_demand', 'qi_competitors', 'qi_pretest'],
  frame: { kind: 'app', width: 1240, contentMaxWidth: 760, mobile: true },
  access: { roles: 'All members', plans: 'All' },
  layout: ['Content max width 760; Card with title, sub, ProgressBar (margin 16 0), ProgressRows'],
  nodes: [
    { id: 'P12.card', component: 'Card', copy: 'Getting to know {brand}|Usually under 3 minutes. You can leave this page; it keeps running.', style: 'title dialogTitle', behaviour: ['No email promise (C-15) unless a notification is actually built'] },
    { id: 'P12.bar', component: 'ProgressBar', bind: 'completed layers ÷ enabled layers' },
    { id: 'P12.rows', component: 'ProgressRow', copy: 'Reading your website|Checking your listings|Checking what customers search for|Looking at your competitors|Writing your questions|Testing that questions get businesses named', bind: 'analysis_runs.layers', behaviour: ['Rows 1:1 with layers enabled by flags; disabled layers omitted', 'Done details: "{pages} pages · {services} services found", "{n} likely profile(s)", "{places}", "{n} competitors", "{n} questions", "{n} of {m} passed"', 'Waiting detail "Waiting"; failed "Couldn\'t check · {reason}"'] },
  ],
  states: {
    partial: { show: 'Run finishes with a failed layer: banner warn under the card, then P10', copy: 'We couldn\'t read your website ({reason}). We used your listings and business type instead.' },
    error: { show: 'Whole run failed', copy: 'We couldn\'t finish getting to know {brand}. Try again, or continue with your business type.', action: 'Try again' },
    success: { show: 'Navigate to P10 step 1' },
  },
  interactions: [{ on: 'Progress update', then: 'Poll every 3s (or the existing realtime pattern) until done; stop polling when the tab is hidden' }],
  api: [{ call: 'GET analysis run status (S06, name from code)', use: 'Layers with status and detail; costs never sent to the browser' }],
  a11y: ['aria-live="polite" announces each completed row'],
  responsive: ['≤ 640: details drop under the labels'],
  acceptance: ['Costs never appear in the response or the page', 'A failed layer never stops the run'],
  lld: ['8.6.5', '8.6.9', '14'],
};

const P13: ScreenSpec = {
  id: 'P13', title: 'Client portal: reports', route: '/client-portal/:token', sprints: ['S01'], flags: ['report_v2'],
  frame: { kind: 'standalone', width: 1000, mobile: true },
  access: { roles: 'Portal token holder (read-only)', plans: 'Plans with the client portal' },
  layout: ['Existing portal header with agency branding; Card flush with header and Table'],
  nodes: [
    { id: 'P13.header', component: 'Layout', copy: '{agencyName}|· {brand}|Shared with you by {agencyName}', behaviour: ['Existing portal branding'] },
    { id: 'P13.reports', component: 'Card', variant: 'flush', copy: 'Reports|AI visibility reports prepared for you.' },
    { id: 'P13.table', component: 'Table', copy: 'Report|Period|Based on|Visibility|Generated|Download PDF', bind: 'generated_reports with a stored PDF for the portal\'s brand(s), newest first', behaviour: ['Report column: neutral Pill with the tier name (the agency\'s names when set, P18)', 'Visibility coloured by band (figureStrong)', 'Links signed for 10 minutes when the page loads (existing storage pattern; no new route, so no new serviceDb read; amendment 46)'] },
  ],
  states: {
    empty: { show: 'In the card', copy: 'No reports yet. Your agency will share them here.' },
    error: { show: 'Download failed', copy: 'This download link has expired. Try again.', action: 'Try again' },
    flagOff: { show: 'report_v2 off: portal as today' },
  },
  interactions: [{ on: 'Download PDF', then: 'Downloads through the link signed at page load; after 10 minutes the row shows the expired state' }],
  api: [{ call: 'Existing portal loader; links signed at load (S01 Part 12)', use: 'Never a public bucket' }],
  a11y: ['Download links named "Download PDF for {period}"'],
  responsive: ['≤ 640: table scrolls; period column sticky'],
  acceptance: ['Only the portal\'s brand reports listed', 'Signed URLs expire'],
  lld: ['8.1.6', '8.1.7'],
};

const P14: ScreenSpec = {
  id: 'P14', title: 'Billing: question packs', route: '/settings/billing', sprints: ['S10'], flags: ['question_packs'],
  frame: { kind: 'app', width: 1240, mobile: true },
  access: { roles: 'owner, admin (existing billing rule)', plans: 'Plans that offer packs (D8); hidden on Free and Starter' },
  layout: ['Existing billing page; new Card: header row; grid 3 StatTiles; Table of brands with Steppers'],
  nodes: [
    { id: 'P14.card', component: 'Card', copy: 'Question packs|Each pack adds 10 everyday questions to one brand, every audit.|Price per pack: {price}|Buy packs', behaviour: ['{price} read from Stripe for the plan; never hard-coded; no GST shown', 'Buy packs (primary) → existing Checkout / Customer Portal flow'] },
    { id: 'P14.tiles', component: 'StatTile', copy: 'Packs owned|Assigned|Available', behaviour: ['Available coloured --good when > 0'] },
    { id: 'P14.table', component: 'Table', copy: 'Brand|Everyday questions|Packs', behaviour: ['Stepper per brand: + disabled when Available = 0; − to 0 allowed', 'Changing a stepper saves through the assignment API (one transaction, sum check)'] },
  ],
  states: {
    loading: { show: 'Skeleton tiles and 3 table rows' },
    empty: { show: 'No packs owned', copy: 'No question packs yet. Buy a pack to add 10 everyday questions to a brand.', action: 'Buy packs' },
    error: { show: 'Assignment refused', copy: 'That would assign more packs than you own. Buy more packs or lower another brand.' },
    noPermission: { show: 'Existing billing permission handling' },
    flagOff: { show: 'question_packs off: card not rendered' },
  },
  interactions: [{ on: 'Lower a brand\'s packs', then: 'Opens that brand\'s P02 draft to choose which questions go; if dismissed, the lowest-ranked everyday questions are removed from the next audit with the P04 notice' }],
  api: [{ call: 'S10 assignment route (name from code) + Stripe webhook', use: 'select … for update on the organization' }],
  a11y: ['Steppers labelled "Packs for {brand}"'],
  responsive: ['≤ 640: tiles one column; table scrolls'],
  acceptance: ['No invented prices anywhere; the price shown comes from Stripe', 'Concurrent assignments can\'t exceed packs owned'],
  lld: ['8.7'],
};

const P15: ScreenSpec = {
  id: 'P15', title: 'Operator: taxonomy signals', route: '/admin/taxonomy', sprints: ['S05', 'S09'], flags: ['business_taxonomy', 'qi_learning'],
  frame: { kind: 'standalone', width: 1000, mobile: false },
  access: { roles: 'Operators only (PLATFORM_ADMIN_EMAILS); others 403', plans: '—' },
  layout: ['Existing admin layout; Card flush with header row and Table; S09 adds a "Question signals" card below'],
  nodes: [
    { id: 'P15.header', component: 'Layout', copy: 'Taxonomy signals|Detection kept as main type (30 days): {pct}% of new brands|Refreshed nightly' },
    { id: 'P15.table', component: 'Table', copy: 'Signal|Key|Workspaces|Times|Propose new type|Propose alias', bind: 'refresh_taxonomy_signals() output (k ≥ 3)', behaviour: ['Propose writes a change file under db/taxonomy-changes/ plus a run1–run4 template; no live production edit'] },
    { id: 'P15.questionSignals', component: 'Table', copy: 'Question signals|Business type|Intent|Area|Naming rate|Workspaces', showWhen: 'S09', behaviour: ['Aggregate only, k ≥ 3'] },
  ],
  states: {
    empty: { show: 'No signal reaches 3 workspaces yet', copy: 'No signals yet. They appear once 3 or more workspaces show the same pattern.' },
    noPermission: { show: '403 page (existing)' },
  },
  interactions: [],
  api: [{ call: 'Operator-only loader', use: 'Never returns workspace, brand, URL or user data' }],
  a11y: ['Table semantics'],
  responsive: ['Desktop only (operator tool); usable at 1024'],
  acceptance: ['Non-operators get 403', 'No names, URLs or text beyond normalised type names'],
  lld: ['8.5.5', '8.6.8'],
};

const P16: ScreenSpec = {
  id: 'P16', title: 'Weak question flag and swap', route: 'Inside P02 (and Recommended actions)', sprints: ['S09'], flags: ['qi_learning'],
  frame: { kind: 'standalone', width: 900, mobile: true },
  access: { roles: 'Owners, admins and analysts act (edit_brand_data); others see the flag only', plans: 'All with edit rights' },
  layout: ['QuestionRow variant weak; swap Banner (neutral, fill --surface) inside the row, margin-top 10'],
  nodes: [
    { id: 'P16.row', component: 'QuestionRow', variant: 'weak', copy: '{text}|AI doesn\'t name any business here (last 2 audits)' },
    { id: 'P16.swap', component: 'Banner', variant: 'neutral', copy: 'Swap it for “{suggestion}”?|Service: {service}|Demand: {level}|Pre-test: named {n} businesses|Swap in draft|Keep', behaviour: ['Swap in draft (primary sm) adds the change to the P02 draft and enters edit mode; applying still goes through P04', 'Keep (ghost sm) hides the flag until 2 more audits run'] },
    { id: 'P16.action', component: 'Layout', copy: 'AI doesn\'t name any business for this question', behaviour: ['Recommended action title on the audit page (S09 Part 2) linking to the row'] },
  ],
  states: {
    empty: { show: 'No spare exists: one is generated; while generating the banner shows "Finding a better question…" with a Spinner' },
    noPermission: { show: 'Pill only; no swap banner' },
    flagOff: { show: 'qi_learning off: nothing shown' },
  },
  interactions: [{ on: 'Swap in draft', then: 'P02 edit mode with the swap in the draft (−1, +1)' }],
  api: [{ call: 'question_results + S09 flag route (name from code)', use: 'Flag and snooze' }],
  a11y: ['Banner is a region labelled "Suggested swap"'],
  responsive: ['≤ 640: banner actions under the text'],
  acceptance: ['Flag only after 2 consecutive audits with naming rate 0 (failed answers excluded)', 'Nothing changes without apply'],
  lld: ['8.6.8'],
};

const P17: ScreenSpec = {
  id: 'P17', title: 'Brand → Reports (report type column)', route: '/brands/:id/reports (existing page, VERIFY)', sprints: ['S01'], flags: ['report_v2'],
  frame: { kind: 'app', width: 1240, mobile: true },
  access: { roles: 'All members see and download; owners, admins and analysts generate (generate_reports)', plans: 'Growth and up (reports start at Growth)' },
  layout: ['AppShell; breadcrumbs "Workspace › Brands › {brand} › Reports"; PageHeader with Generate report; Card flush with the Table', 'Everything except the Report column, the statuses and the P08 hand-off is the existing page: keep its columns and order if they differ (VERIFY in S0)'],
  nodes: [
    { id: 'P17.header', component: 'PageHeader', copy: 'Reports|PDF reports for {brand}. A generated report never changes.' },
    { id: 'P17.generate', component: 'Button', variant: 'primary', copy: 'Generate report', behaviour: ['Opens P08 for the latest complete audit', 'Disabled with tooltip "Run an audit first" when no complete audit exists'] },
    { id: 'P17.list', component: 'Card', variant: 'flush' },
    { id: 'P17.table', component: 'Table', copy: 'Report|Period|Based on|Visibility|Generated|Status|Download PDF|{tierName}|Week {w}, {yyyy}|Audit #{n}|{date} · {userName}|Ready|Published|Running checks…|Generating…|Failed|Try again', bind: 'generated_reports for the brand, newest first (report_tier, contents_snapshot, status)', behaviour: ['Report column: a neutral Pill with the tier name inside the existing Report cell (agency names on Agency plans); rows generated before tiers read the Basic name. As built (amendment 43): the page keeps its columns (Report, Period, Status, Actions); the copy lists the information shown, not new columns', 'Status (existing deriveReportStatus): Ready (good pill), Published (neutral pill: emailed), Generating… (Spinner 14 + help text), Failed (bad pill) + "Try again" (secondary sm; re-renders from the snapshot for reports made after S01); new: Running checks… while an Enhanced refresh runs', 'Visibility coloured by band (figureStrong)', 'Pagination as the existing page (none today)'] },
  ],
  states: {
    loading: { show: 'Skeleton header and 4 table rows (row height 48)' },
    empty: { show: 'In the card', copy: 'No reports yet. Generate one from the latest audit.', action: 'Generate report' },
    error: { show: 'Banner warn in the card', copy: 'We couldn\'t load reports. Try again.', action: 'Retry' },
    noPermission: { show: 'Viewer: Generate hidden; downloads allowed' },
    flagOff: { show: 'report_v2 off: the page as today (no Report column; Generate works as today)' },
  },
  interactions: [
    { on: 'Generate report', then: 'P08' },
    { on: 'A report finishes', then: 'Row status changes to Ready without reload (existing polling: every 4 s, up to 12 minutes)' },
  ],
  api: [{ call: 'Existing reports loader + report_tier', use: 'One query for the list (no per-row requests)' }],
  a11y: ['Download links named "Download {tierName} PDF for {period}"', 'Status changes announced politely'],
  responsive: ['≤ 640: header button full width; table scrolls with the Report column sticky'],
  acceptance: ['Every row shows its tier name; old rows show Basic', 'Status moves Running checks… → Generating… → Ready for Enhanced', 'Try again uses the stored snapshot'],
  lld: ['8.1.6', '8.1.7'],
};

const P18: ScreenSpec = {
  id: 'P18', title: 'Report branding → Report names', route: '/settings/report-branding (existing page)', sprints: ['S01'], flags: ['report_v2'],
  frame: { kind: 'app', width: 1240, contentMaxWidth: 860, mobile: true },
  access: { roles: 'Owners and admins (manage_branding)', plans: 'Agency, Agency Pro, Enterprise edit (D-RT3); other plans see the card locked' },
  layout: ['AppShell; breadcrumbs "Workspace › Settings › Report branding"; existing branding cards first (unchanged); new Card "Report names" below them; Card "What each report contains" (read-only) below that'],
  nodes: [
    { id: 'P18.card', component: 'Card', copy: 'Report names|Shown on the report cover, in your reports list and in the client portal. Use the names you sell under.' },
    { id: 'P18.basic', component: 'Field', variant: 'Input', copy: 'Basic report name|Default: Basic · up to 24 characters', bind: 'report_tier_names.basic' },
    { id: 'P18.standard', component: 'Field', variant: 'Input', copy: 'Standard report name|Default: Standard', bind: 'report_tier_names.standard' },
    { id: 'P18.enhanced', component: 'Field', variant: 'Input', copy: 'Enhanced report name|Default: Enhanced', bind: 'report_tier_names.enhanced' },
    { id: 'P18.preview', component: 'Banner', variant: 'neutral', copy: 'Cover preview: {ENHANCED NAME} · Your clients see these names, not Basic, Standard or Enhanced, unless you keep them.', behaviour: ['Updates as the user types'] },
    { id: 'P18.actions', component: 'Layout', copy: 'Save names|Reset to defaults', behaviour: ['Save (primary) disabled until changed or while invalid; inline status "Report names saved." (D-UI4)', 'Reset (ghost) fills the defaults; still needs Save'] },
    { id: 'P18.contents', component: 'Table', copy: 'What each report contains|Report|Contains|{basicName}|{standardName}|{enhancedName}', bind: 'Appendix E tier descriptions', behaviour: ['Read-only, so agencies can describe each tier to their clients'] },
  ],
  states: {
    loading: { show: 'Skeleton: three 36px fields' },
    error: { show: 'Validation under the field (help size, --bad)', copy: 'Use 1–24 characters, different from your other report names.' },
    planLock: { show: 'Below Agency the whole Report branding page is the existing plan-locked page (white_label_reports), so this card never shows; the API answers 403 plan_required (amendment 44)', copy: 'Renaming reports is available on Agency and up.' },
    noPermission: { show: 'Existing branding permission handling' },
    flagOff: { show: 'report_v2 off: card not rendered' },
  },
  interactions: [{ on: 'Save names', then: 'PUT /api/report-branding with report_tier_names; names apply to reports generated from now on (old PDFs keep their snapshot names)' }],
  api: [{ call: 'PUT /api/report-branding + report_tier_names (workspace row of agency_brand_assets)', use: 'zod: each 1–24 chars after trim, no control characters, unique ignoring case; 402 below Agency' }],
  a11y: ['Labels tied to inputs; errors in aria-describedby; preview is aria-live="polite"'],
  responsive: ['≤ 640: grid one column; buttons full width (Save first)'],
  acceptance: ['Names show on the cover (Agency and up), in P17, P08 and the portal', 'Old reports keep the names in their snapshot', 'Server refuses names below Agency (402) and invalid names (422)', 'XSS payloads stored and shown as text'],
  lld: ['8.1.7'],
};

export const screens: ScreenSpec[] = [P00, P01, P02, P03, P04, P05, P06, P07, P08, P09, P10, P11, P12, P13, P14, P15, P16, P17, P18];

/* ----------------------------------------------------------------------------
 * 5. Conflicts resolved (prototype v1 ↔ LLD ↔ sprint prompts)
 *    This file is canonical for each of these. The v2 HTML already shows the resolution.
 * ------------------------------------------------------------------------- */

export const conflicts: ConflictResolution[] = [
  { id: 'C-01', where: 'P04 vs LLD appendix E', conflict: 'Notice says "Audits #50–#55" in the prototype and "#50–#54" in appendix E', resolution: 'Copy uses {first}–{last} from the current comparison run; both numbers were examples' },
  { id: 'C-02', where: 'P04 vs appendix E', conflict: 'Prototype adds "An audit that is already running keeps the current questions."', resolution: 'Keep the sentence (it is true by design and answers the obvious question)' },
  { id: 'C-03', where: 'P02, P16, appendix E, LLD 8.6.8, S09', conflict: 'Four wordings for the weak-question message', resolution: 'Row pill "AI doesn\'t name any business here (last 2 audits)"; Recommended action "AI doesn\'t name any business for this question"; swap banner "Swap it for “{suggestion}”?"' },
  { id: 'C-04', where: 'P07 vs appendix E', conflict: 'Different example numbers in the mix and split lines', resolution: 'Templates with placeholders (P07.mix, P07.split); zero parts omitted' },
  { id: 'C-05', where: 'Pills vs appendix E', conflict: '"Small sample" pill vs the full appendix E sentence', resolution: 'Pill "Small sample"; tooltip "Small sample ({n} questions): this figure can move a lot between audits."' },
  { id: 'C-06', where: 'P01 row titles vs section headers', conflict: 'Rows say State/Country; elsewhere NSW/Australia', resolution: 'P01 rows: title "State"/"Country" + place chip. Everywhere else: reachLabels (Local · {city}, {stateAbbrev}, {countryName}, Worldwide)' },
  { id: 'C-07', where: 'P01 "Worldwide" vs LLD "Global"', conflict: 'Two words for one reach; LLD 8.4.5 copy says "Global questions are measured on the four AI engines only."', resolution: 'Code value global; customer word "Worldwide" everywhere, including that Google section line ("Worldwide questions are measured on the four AI engines only.")' },
  { id: 'C-08', where: 'P02 engine dots vs P08 evidence', conflict: 'Engine order differs', resolution: 'Dots and tables: fixed order (engines.order, existing wins). Evidence lines: by count, highest first' },
  { id: 'C-09', where: 'Engine dots', conflict: 'Green vs grey squares relied on colour', resolution: 'Named dots carry a ✓ glyph; failed dots are hatched (WCAG 1.4.1)' },
  { id: 'C-10', where: 'P00 rule "targets ≥ 36px" vs sm buttons (28), toggles (20), steppers (32)', conflict: 'The rule and the components disagreed', resolution: 'Desktop minimum 24 × 24 (WCAG 2.2 2.5.8) for dense controls with the 36 rule for primary actions; toggles get a 36 × 36 hit area; ≤ 640 every control is ≥ 44 tall' },
  { id: 'C-11', where: 'Inputs, steppers, segmented, toggle-off track', conflict: '--border-strong #D4D4D8 is 1.48:1 on white; WCAG 1.4.11 needs 3:1 for control boundaries', resolution: 'New token --border-control (#8A8A93 / #71717A). Decision D-UI1: apply app-wide (one variable) by default; Sri may limit it to new screens' },
  { id: 'C-12', where: 'P09 PDF footer', conflict: '#8A8A93 on white is 3.42:1 for 8pt text', resolution: 'Footer and meta #6B6B76 (5.26:1). If report-document.tsx already uses a passing grey, keep it' },
  { id: 'C-13', where: 'Banner warn/good icon in dark mode', conflict: 'White glyph on #FBBF24 is 1.67:1', resolution: 'New token --on-status (white light, #0A0A0B dark)' },
  { id: 'C-14', where: 'P02/P05 example "by Srii"', conflict: 'A real person\'s name in the prototype', resolution: 'Example user "Jordan"; real UI shows {userName}' },
  { id: 'C-15', where: 'P12 "we\'ll email you when it\'s ready"', conflict: 'No sprint builds that email (claim only what the product does)', resolution: 'Copy "You can leave this page; it keeps running." until an email exists' },
  { id: 'C-16', where: 'P03 place fix vs LLD 8.3.2', conflict: '"Add ‘in Sydney’?" vs button "Add “in Western Sydney”"', resolution: 'Warn line + accent button "Add “in {place}”" where {place} is the reach\'s main area or city' },
  { id: 'C-17', where: 'P02 History button', conflict: 'Drawn but not specified', resolution: 'Read-only Drawer of versions (P02.header.history)' },
  { id: 'C-18', where: 'P02 Discard', conflict: 'Unspecified confirmation', resolution: 'Existing confirm dialog "Discard your changes?" Keep editing / Discard' },
  { id: 'C-19', where: 'P02 draft bar', conflict: 'Prototype showed it with changes only', resolution: 'Always shown in edit mode; "No changes yet" with Apply disabled when empty' },
  { id: 'C-20', where: 'Hover/active states', conflict: 'Prototype v1 defined none', resolution: 'Defined per component (Button, Toggle, Input, Chip, Menu, Table rows)' },
  { id: 'C-21', where: 'Brand name suggestion help (P01)', conflict: 'Help shown forever', resolution: 'Shown only while the name still equals the suggestion' },
  { id: 'C-22', where: 'Suggestions card source line (P02)', conflict: 'Prototype claimed "website, listings and local search demand" before those layers exist', resolution: 'Source line lists only the layers that are on (P02.suggestions)' },
  { id: 'C-23', where: 'P08 "Beyond AI answers" section toggle vs report tiers', conflict: 'A toggle and the tier both decided whether the page appears', resolution: 'Toggle removed; the tier decides (Enhanced). LLD 7.5 drops include_beyond_ai and adds default_tier' },
  { id: 'C-24', where: 'D1 ("every paid plan gets What to do next") vs report tiers', conflict: 'Starter would get the action plan in its PDF although Basic excludes it', resolution: 'The PDF action plan is Standard and up; the audit page\'s Recommended actions and the Action Center stay on every plan (D1 updated in LLD 20)' },
  { id: 'C-25', where: 'Colour tokens (token map T-01–T-07)', conflict: 'Contract names and values differed from the app', resolution: 'Each token now carries its app variable and the app\'s values; code always uses `app`. --agency-tint is --agency-soft; --on-status is --warning-fg / --success-fg / --danger-fg; --accent-strong is --accent-blue' },
  { id: 'C-26', where: 'Roles on every screen', conflict: 'The contract named an "editor" role that doesn\'t exist', resolution: 'Roles follow lib/governance/permissions.ts: brand settings manage_brands (owners, admins); questions edit_brand_data (owners, admins, analysts); reports generate_reports (owners, admins, analysts); branding manage_branding (owners, admins)' },
  { id: 'C-27', where: 'P01.aliases', conflict: 'S00 kept case-only duplicates and suggested forms detection already matches', resolution: 'Unique ignoring case; never suggest the name without spaces or the domain stem (S01 carry-over)' },
  { id: 'C-28', where: 'Questions naming the business (P02, P03, LLD)', conflict: '"Up to 3" vs packs that carry 3 to 5', resolution: 'Limit 5 everywhere (D-QI-BR)' },
  { id: 'C-29', where: 'Finding rules (P07, P09, LLD 8.1.5)', conflict: 'New rules were lettered f–i but f already exists (Reddit)', resolution: 'New rules are g–j' },
  { id: 'C-30', where: 'P01 ABN', conflict: 'The ABN suggestion had no field to save into or point to', resolution: 'New P01.abnField; PATCH /api/brands/:id gains abn (S01)' },
  { id: 'C-31', where: 'P07/P09 Beyond AI answers copy', conflict: '"Videos cited by AI", "trading as" and CDN Shield visits have no source', resolution: 'Removed; visits say "upload server logs"; one entity name' },
  { id: 'C-32', where: 'Toasts in copy', conflict: 'No toast is mounted in the app', resolution: 'Same copy as inline role="status" feedback (D-UI4)' },
  { id: 'C-33', where: 'LockMarker Upgrade link', conflict: 'Billing vs /pricing (23 existing uses)', resolution: '/pricing (D-UI5)' },
  { id: 'C-35', where: 'P09 Enhanced page order', conflict: 'Beyond AI answers before Over time left the real Enhanced report with a page holding only the chart', resolution: 'Over time first (06 in Standard and Enhanced); Beyond tiles kept by row; page-fill goal (amendment 62)' },
  { id: 'C-34', where: 'EngineDots', conflict: 'The audit page has a "Maybe" result the contract lacked', resolution: 'Fourth state "unverified" (D-UI6)' },
  { id: 'C-36', where: 'P07.mix vs LLD 8.3.3 and S03', conflict: 'The contract\'s untouched-brand example "13 questions: 13 everyday." counted the branded questions as everyday', resolution: '"13 questions: 10 everyday (all from the original set) and 3 that name the business." (amendment 93)' },
  { id: 'C-37', where: 'P02 "Keep your draft?"', conflict: 'Asked on leaving the page, which only the browser\'s own beforeunload prompt can do', resolution: 'Asked on return, and only for a draft that differs from the current set (amendments 93, 96)' },
  { id: 'C-38', where: 'zIndex.overlay 40 vs the cookie banner (z-50)', conflict: 'The drawer and modal sat under the cookie banner (spec 17\'s first run)', resolution: 'Overlays at 50, as ConfirmDialog (amendment 93)' },
];

/** Decisions this file adds (defaults apply unless Sri says otherwise). */
export const uiDecisions = [
  { id: 'D-UI1', question: 'Control borders at 3:1', default: 'Done in S00: app-wide', neededBy: 'S00' },
  { id: 'D-UI2', question: 'Web fonts', default: 'Agreed: not in these sprints (separate task)', neededBy: '—' },
  { id: 'D-UI3', question: 'Line heights for new components', default: 'Agreed: contract values for new components; existing screens keep theirs', neededBy: 'S01' },
  { id: 'D-UI4', question: 'Toast vs inline feedback', default: 'Agreed: inline role="status"', neededBy: 'S01' },
  { id: 'D-UI5', question: 'Upgrade link destination', default: 'Agreed: /pricing', neededBy: 'S01' },
  { id: 'D-UI6', question: 'EngineDots unverified state', default: 'Agreed: add it', neededBy: 'S02' },
] as const;

export const uiConfig = {
  version: '1.9',
  date: '2026-11-27',
  precedence, color, contrast, fontFamily, typography, typeRule, space, spaceRule, radius, shadow, motion, zIndex,
  breakpoints, layout, icons, scoreBands, reachLabels, engines, intents, components, screens, conflicts, uiDecisions,
} as const;

export default uiConfig;
