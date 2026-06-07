# Claude Code — fix the Add-brand wizard (`/brands/wizard`) to match the prototype

## Context

The built `/brands/wizard` has drifted from the canonical prototype. Step 1 is missing fields and uses the wrong shell, breadcrumb, and headings. The prototype is the UI source of truth — match it. Work **diagnostic-first**: investigate and report, then fix the shell, then Step 1, then verify Steps 2–4, then prove it live.

## Canonical reference — read this first

Open the **`BrandSetupWizard`** component in `visibleau-prototype.jsx` (around line 2037). That component is the source of truth for this page. Note there is ALSO a separate single-page `brand-create` form in the prototype (around line 1124) — **do not** confuse them; `/brands/wizard` must match the 4-step `BrandSetupWizard`, not the single-page form.

═══════════════════════════════════════════════════════════════════════════════
## PHASE 1 — INVESTIGATE AND REPORT (no changes)
═══════════════════════════════════════════════════════════════════════════════

1. Find the built wizard file (e.g. `app/(auth)/brands/wizard/page.tsx` and any step components). Read it.
2. Confirm `/brands/wizard` renders the 4-step wizard (not the single-page `brand-create` form), and report whether a separate brand-create form also exists in the codebase.
3. For the **shell**, report the current: breadcrumb, page heading(s), step subtitle, progress bar, card wrapper, and footer buttons.
4. For **each of the 4 steps**, list the fields/content present versus the prototype's `BrandSetupWizard`.
5. Report how a brand is submitted (the server action / mutation) and which fields it currently persists. Report the `brands` table columns.

### → REPORT 1–5 before changing anything.

═══════════════════════════════════════════════════════════════════════════════
## PHASE 2 — FIX THE WIZARD SHELL (match the prototype exactly)
═══════════════════════════════════════════════════════════════════════════════

- **Breadcrumb:** `['Workspace', 'Add brand']` (currently wrong: "Workspace › Brands › New Brand").
- **Page h1:** **"Add a brand"** (text-2xl, font-semibold) — currently MISSING.
- **Subtitle** directly under the h1: **"Step {step} of 4 · ~3 minutes total"** — currently shows only "Step 1 of 4" and is mis-placed.
- **Progress bar:** 4 equal segments (`flex items-center gap-2`, each `flex-1 h-1 rounded-full`); a segment is filled with `--accent-blue` if its index ≤ current step, otherwise `--bg-subtle`.
- **Wrap each step's content in a `Card`** (`p-6 mb-4`) — the built step appears to have no card.
- **Container:** `max-w-3xl mx-auto px-6 py-8`.
- **Footer** (`flex justify-between`):
  - **"Back"** button, `variant="secondary"`, **`disabled` on step 1** (rendered, not hidden) — currently MISSING.
  - Steps 1–3: **"Continue"**, `variant="primary"` (accent-blue) — currently muted/grey; must be primary.
  - Step 4: **"Create brand & run first audit"**, `variant="primary"` → navigates to the audit-running page and triggers the first audit.
- **Remove** the invented heading "Tell us about your brand" (it is in neither prototype screen).

═══════════════════════════════════════════════════════════════════════════════
## PHASE 3 — FIX STEP 1 "Brand basics" (the main gap)
═══════════════════════════════════════════════════════════════════════════════

Inside the Card, the step heading (h2) is **"Brand basics"**. Step 1 must contain ALL of the following — currently only items 1 and a partial 2 exist:

1. Input **"Brand name"**, placeholder `Bondi Plumbing`. ✓ keep.
2. Input **"Domain"**, placeholder `bondiplumbing.com.au`, **with `prefix="https://"`** and **helperText "We'll auto-detect your logo from the favicon once you save."** — currently missing the prefix and the helper text.
3. **Logo auto-detect box** — currently MISSING entirely. A row (`p-3 rounded-md`, `--bg-subtle` background, `1px solid --border-subtle`) containing: an 8×8 rounded avatar of the brand initials (accent-blue bg, white text), and the caption "Logo auto-detected from favicon.ico · Upload instead" where **"Upload instead"** is accent-blue and clickable.
4. **Region select** — currently MISSING entirely. Label "Region", options Australia / New Zealand / United Kingdom, **Australia selected by default**, helperText "Region determines vertical packs and prompt library." **Phase-1 reality:** the product is AU-only, so render **New Zealand and United Kingdom as disabled / "coming soon"** (not selectable) — consistent with how v1.1 vertical packs are locked elsewhere. Australia is the only choosable value.

**Persistence:** wire Domain (normalise/strip the `https://`) into the brand-create action. For Region: persist `'AU'`. Only add a `region` column if the `brands` schema doesn't already have one AND you can do so cleanly — otherwise default region to `'AU'` server-side; do not force a schema change just to store a value that is always AU in Phase 1. (If you do add a migration, follow the project's migration workflow.)

═══════════════════════════════════════════════════════════════════════════════
## PHASE 4 — VERIFY STEPS 2–4 AGAINST THE PROTOTYPE AND FIX DEVIATIONS
═══════════════════════════════════════════════════════════════════════════════

The screenshot only showed Step 1, but the same stripping may affect the rest. Compare each to `BrandSetupWizard` and fix any deviation:

- **Step 2 "Vertical pack":** h2 "Vertical pack" + intro "Pick the closest match. We'll use AU-tuned prompts and vertical-specific recommendations." Then a **2-column grid** of vertical cards: Tradies (selected, "124 prompts"), SaaS ("108 prompts"), Allied Health ("104 prompts") as v1/active; Professional Services and Real Estate as **v1.1 locked** ("Coming v1.1", not-allowed cursor, reduced opacity). Match the selected/locked border + badge styling.
- **Step 3 "Locations & competitors":** label "Primary suburbs (up to 3)" with removable chips (e.g. Bondi, Bondi Junction, Tamarama, each with an X); Input "Add competitor (optional)" placeholder "Eastern Plumbing Co", helper "We'll detect when LLMs mention them alongside you."
- **Step 4 "Confirm & first audit":** a summary box (`--bg-subtle`) with rows Brand / Vertical / **Pack** (e.g. "AU Tradies v1.0 · 124 prompts") / Locations / **First audit cost** "Free tier: ~A$0.30–0.50 · Paid: ~A$2.50–3"; followed by an info box (accent-blue tint, Info icon): "Your first audit will run on your tier's engines. Paid: 4 engines × 10 prompts × 5 runs = 200 calls (~3–5 min). Free: 2 engines × 20 prompts × 1 run = 40 calls (~1.5–2 min)."

Report which steps needed fixes and what they were.

═══════════════════════════════════════════════════════════════════════════════
## PHASE 5 — VERIFY
═══════════════════════════════════════════════════════════════════════════════

1. Render each step and compare side-by-side to the prototype: shell (breadcrumb "Workspace › Add brand", h1 "Add a brand", subtitle with "· ~3 minutes total", 4-segment progress bar, Card wrapper), per-step content, and footer.
2. **Step 1:** all four items present — Domain shows the `https://` prefix + helper text; the logo auto-detect box renders; Region defaults to Australia with NZ/UK disabled.
3. **Footer:** Back is present and disabled on step 1; Continue is the primary (accent-blue) variant and advances the step; on step 4 the button reads **"Create brand & run first audit"** and triggers brand creation + the first audit.
4. New fields persist (query the DB for the created brand's domain and region).
5. `pnpm typecheck` and `pnpm lint` clean.
6. Clear `.next`, restart, and confirm the changes render live (not a stale build).

## Final report
Summarise, per step, what was missing and is now fixed; the shell corrections (breadcrumb, h1, subtitle, card, footer + Continue variant); the Step-1 fields restored (Domain prefix/helper, logo box, Region select); any `region` schema decision; and the Steps 2–4 audit result. Paste the DB query showing the created brand.
