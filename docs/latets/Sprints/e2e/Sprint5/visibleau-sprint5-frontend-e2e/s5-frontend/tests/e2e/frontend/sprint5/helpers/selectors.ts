/**
 * tests/e2e/frontend/sprint5/helpers/selectors.ts
 *
 * Shared Playwright selector constants for Sprint 5 UI elements.
 * Centralising selectors here means a single rename in the component
 * only requires updating this file, not every spec.
 *
 * Selector strategy:
 *   - Role + accessible name first (most resilient to style changes)
 *   - data-testid second (when role selectors are ambiguous)
 *   - CSS text selectors last (only for content-only assertions)
 *
 * All Sprint 5 components should have these data-testid attributes added
 * during implementation. The CLAUDE.md documents which testids are required.
 */

// ---------------------------------------------------------------------------
// Wizard (step 2 — vertical pack selection)
// ---------------------------------------------------------------------------

export const WIZARD = {
  /** Step 2 heading */
  step2Heading: 'h2:has-text("Vertical pack")',

  /** Step 2 sub-text */
  step2Subtext: 'text=Pick the closest match',

  /** Pack card by vertical name — e.g. WIZARD.packCard('Tradies') */
  packCard: (name: string) => `[data-testid="pack-card-${name.toLowerCase().replace(/ /g, '-')}"]`,

  /** Badge on a pack card showing prompt count or v1.1 */
  packCardBadge: (name: string) =>
    `[data-testid="pack-card-${name.toLowerCase().replace(/ /g, '-')}"] [data-testid="pack-badge"]`,

  /** PromptPreview section rendered below the selected card */
  promptPreview: '[data-testid="prompt-preview"]',

  /** Loading state within PromptPreview */
  promptPreviewLoading: '[data-testid="prompt-preview-loading"]',

  /** Individual expanded prompt lines inside PromptPreview */
  promptPreviewItem: '[data-testid="prompt-preview-item"]',

  /** "Continue" button in wizard footer */
  continueBtn: 'button:has-text("Continue")',

  /** "Back" button in wizard footer */
  backBtn: 'button:has-text("Back")',

  /** Step 4 confirm screen — Pack row label */
  confirmPackLabel: 'text=Pack',

  // D8 FIX: The prototype Pack row value span has no data-testid.
  // Use a structural selector: the sibling span next to the 'Pack' label.
  // The confirm screen row is: <span>Pack</span><span>{value}</span> inside a flex div.
  // Playwright CSS :right-of() isn't available, but we can select the row's second span.
  /** Step 4 confirm screen — Pack row value (e.g. "AU Tradies v1.0 · 124 prompts") */
  confirmPackValue: '[data-testid="confirm-pack-value"], div:has(> span:text-is("Pack")) span:last-child',

  /** "Create brand & run first audit" submit button */
  createBrandBtn: 'button:has-text("Create brand")',
} as const;

// ---------------------------------------------------------------------------
// Vertical pack browser (/verticals)
// ---------------------------------------------------------------------------

export const BROWSER_PAGE = {
  /** Page heading */
  heading: 'h1:has-text("Vertical packs")',

  /** Page subtitle (contains "3 active") */
  subtitle: 'p:has-text("3 active")',

  // C7 FIX: The PackBrowser component uses ONE shared renderCard function for both
  // wizard mode and browser mode (Sprint 5 spec shows a single renderCard with no
  // mode-conditional testid). Using 'browser-pack-card-X' would fail because the
  // developer will use the same testid in both contexts.
  // Both WIZARD and BROWSER_PAGE use the 'pack-card-X' prefix.
  // There is no page-level collision since wizard (step 2) and browser (/verticals)
  // are on completely different routes.

  /** Individual pack card by name — same prefix as WIZARD.packCard */
  packCard: (name: string) => `[data-testid="pack-card-${name.toLowerCase().replace(/ /g, '-')}"]`,

  /** Status badge on a browser pack card */
  packBadge: (name: string) =>
    `[data-testid="pack-card-${name.toLowerCase().replace(/ /g, '-')}"] [data-testid="status-badge"]`,

  /** Info banner at bottom of page */
  infoBanner: '[data-testid="packs-info-banner"]',

  /** All pack cards (for counting) — matches both active and coming-soon cards */
  allCards: '[data-testid^="pack-card-"]',
} as const;

// ---------------------------------------------------------------------------
// Vertical pack detail (/verticals/[packId])
// ---------------------------------------------------------------------------

export const DETAIL_PAGE = {
  /** Breadcrumb — "Vertical packs" crumb */
  breadcrumbVerticalPacks: 'nav:has-text("Vertical packs"), [data-testid="breadcrumb"]:has-text("Vertical packs")',

  /** Page heading "Tradies (AU)" */
  heading: 'h1:has-text("Tradies (AU)")',

  /** Sub-heading "124 prompts · 2 active brands · last updated" */
  subheading: 'p:has-text("124 prompts")',

  /** "Customise prompts" button — must be disabled in v1 */
  customiseBtn: 'button:has-text("Customise prompts")',

  // D12 FIX: KPI testids are not in the Sprint 5 spec — the developer will implement the
  // feature but may not add these specific testids. Use text-based selectors: each KPI
  // card contains a large number and a label. Match by the known label text.
  /** KPI card — Prompts (text-based, resilient to testid absence) */
  kpiPrompts: '[data-testid="kpi-prompts"], [class*="kpi"]:has-text("Prompts"), div:has(> *:text-is("Prompts")):has-text("124")',

  /** KPI card — Sub-verticals (text-based fallback) */
  kpiSubVerticals: '[data-testid="kpi-sub-verticals"], [class*="kpi"]:has-text("Sub-vertical"), div:has(> *:text-matches("Sub.vertical")):has-text("8")',

  /** KPI card — Categories (text-based fallback) */
  kpiCategories: '[data-testid="kpi-categories"], [class*="kpi"]:has-text("Categories"), div:has(> *:text-is("Categories")):has-text("8")',

  /** Category breakdown section (text-based fallback) */
  categorySection: '[data-testid="category-breakdown"], section:has-text("Category breakdown"), div:has-text("Category breakdown")',

  // D12 FIX: category-row testid not in spec. The category breakdown is a table or list.
  // Use structural selectors: rows inside the breakdown section, or any li/tr with a count badge.
  // The prototype shows rows with: category name | count badge | sample prompt.
  /** Individual category row (structural fallback) */
  categoryRow: '[data-testid="category-row"], [data-testid="category-breakdown"] > *, [data-testid="category-breakdown"] tr, div:has-text("Category breakdown") ~ * li, div:has-text("Category breakdown") ~ * tr',

  // D10 FIX: The vertical-specific patterns card appears in the prototype but is NOT
  // specified in the Sprint 5 implementation spec (PackDetailPage spec in CM3 only
  // specifies breadcrumb, header, Customise button, and categoryBreakdown).
  // A developer following the spec will not implement this card.
  // Kept as optional selector — test FE-S5-32 is converted to a soft assertion.
  /** Vertical-specific patterns card (optional — prototype-only, not in Sprint 5 spec) */
  patternsCard: '[data-testid="vertical-patterns"], div:has-text("hipages"), div:has-text("Yellow Pages")',
} as const;

// ---------------------------------------------------------------------------
// Sidebar navigation
// ---------------------------------------------------------------------------

export const SIDEBAR = {
  /** "Vertical packs" link in Insights sidebar group (CB4 fix) */
  verticalPacksLink: 'a[href="/verticals"]:has-text("Vertical packs"), nav a:has-text("Vertical packs")',

  /** Insights group label */
  insightsGroup: 'text=Insights',

  /** Dashboard link (for confirming we are on an authenticated page) */
  dashboardLink: 'a[href="/dashboard"]',
} as const;
