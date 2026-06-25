# VisibleAU — Fix: brand-selector dropdown options are near-invisible (contrast/styling bug)
**Claude Code prompt — paste into a Claude Code session on the VisibleAU repo.**
Small follow-up to the client-portal brand-picker fix. The new "Create Client Portal Invite" modal's
brand `<select>` works and is populated correctly (Canva, XYZ Plumbing Bondi, Asset Plumbing Solutions,
Employment Hero), BUT the option text is nearly invisible — very low contrast (dark text on dark
background, or wrong inherited color). The data is right; it's purely a styling/contrast defect.

## STEP 0 — Locate the select + its styling
```bash
# The brand selector in the create-invite modal:
grep -rniE "Select a brand|Create Client Portal Invite|client-portal" app components 2>/dev/null | head
# Find the <select> / option rendering + its classes:
grep -rniE "<select|<option|brand.*option|option.*brand|appearance-none" app/agency components 2>/dev/null | head -20
```
Open the component and inspect the `<select>` and `<option>` styling.

## STEP 1 — Fix the contrast
The issue is almost certainly one of:
- The `<select>`/`<option>` text color is unset or inheriting a dark color on a dark modal background.
- Native `<option>` elements don't reliably inherit Tailwind text colors / dark-mode tokens across
  browsers — option text/background often needs EXPLICIT colors.
Fix by setting explicit, theme-correct colors that meet WCAG AA contrast on the modal background:
- Ensure the `<select>` has a readable text color and background matching the app's other inputs (reuse
  the same input/select classes used elsewhere in the app for consistency — find an existing styled
  select/input and match it).
- For the `<option>` elements, set explicit background and text color (native option styling is limited;
  in dark UIs set e.g. a dark option background with light text, or use the app's design tokens). If the
  app supports light/dark themes, make sure BOTH themes render readable options.
- If the app already has a styled select component (a shared <Select> or input class), USE THAT instead
  of a raw unstyled `<select>` so it matches the rest of the UI and inherits correct theming.

Confirm contrast: option text vs its background should be clearly readable (WCAG AA ≥ 4.5:1 for normal
text). Don't just lighten slightly — make it clearly legible like the app's other dropdowns/inputs.

## STEP 2 — Verify
- Visually (operator): reopen Agency Dashboard → Client Portals → Create Invite → the brand dropdown
  options (Canva / XYZ Plumbing Bondi / etc.) are now clearly readable.
- Confirm it matches the styling of other selects/inputs in the app (consistency).
- Check BOTH themes if applicable (light + dark) — the screenshot is dark mode; ensure light mode too.
- Typecheck clean.

## STEP 3 — Report
- The component + the styling change (before/after classes or colors).
- Confirmation the options are now legible and match the app's other inputs.
- Any theme-specific handling added.

## Constraints
- Reuse the app's existing input/select styling/tokens for consistency — don't invent a one-off style.
- Meet WCAG AA contrast; readable in all supported themes.
- Styling-only fix — don't change the select's data/behaviour (it's populated correctly already).
