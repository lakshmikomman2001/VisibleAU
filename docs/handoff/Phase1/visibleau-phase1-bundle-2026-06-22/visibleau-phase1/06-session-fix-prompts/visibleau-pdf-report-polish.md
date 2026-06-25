# VisibleAU — Polish the white-label PDF report (header + section content) — Claude Code prompt
# Status: PDF builder works — real data (Bondi 88.3), real export, no VisibleAU leak, two-column layout.
#   Two POLISH items remain (quality, not integrity):
#   (1) Duplicate header label — the report header shows "AI Visibility Report" TWICE (left + right),
#       and it's in the exported PDF too ("AI Visibility Report AI Visibility Report").
#   (2) Section checkboxes are decorative — checking "Executive summary" / "Per-engine breakdown" etc.
#       does NOT change the report. The report only shows the scorecard; the prototype's richer report
#       has an exec summary, a CI line, and (implied) per-engine + action sections the checkboxes should
#       drive.
# Pins: prototype WhiteLabelReport body (proto L3790-3800: exec summary prose, "Confidence interval:
#   68–78 (95%)", composite); checklist (proto L3764: Executive summary / Visibility scorecard /
#   Per-engine breakdown / Action plan / Methodology appendix). str_replace/exact-literal only.

╔═══════════════════════════════════════════════════════════════════════════════╗
║ NON-NEGOTIABLE: every section's content comes from REAL audit data. The          ║
║ prototype's exec-summary prose ("improved from 68 to 73", "14% increase in       ║
║ ChatGPT mention rate") is MOCK — do NOT hardcode it. Generate each section from   ║
║ the brand's real audit (composite, dimensions, CI, per-engine scores, real        ║
║ recommendations). If a datum doesn't exist, omit that line — never fabricate      ║
║ prose or numbers. This is a client-facing report for a TRUST product; the same    ║
║ no-fake-data rule that fixed the 72.4 mock applies to the new sections.           ║
╚═══════════════════════════════════════════════════════════════════════════════╝

═══════════════════════════════════════════════════════════════════════════════
PART 1 — Fix the duplicate header label
═══════════════════════════════════════════════════════════════════════════════
> The report header banner shows "AI Visibility Report" on BOTH the left and right. Per the prototype
> (L3784-3788), the header has TWO DIFFERENT things: left = the agency's NAME/logo ("Your Agency"),
> right = the report-type label ("AI Visibility Report"). The duplicate is because the agency-name slot
> falls back to "AI Visibility Report" when no agency name is set (the neutral default from the earlier
> fix), so both slots show the same string.
> Fix the left (agency-name) slot's neutral default so it does NOT duplicate the right label:
> - If an agency name is set (agency_brand_assets or the Branding "Agency name" field) → show it on the
>   left (+ logo). The right stays "AI Visibility Report". (Two different things — correct.)
> - If NO agency name is set → the left slot should show something OTHER than "AI Visibility Report" —
>   options: the brand being reported on ("Bondi Plumbing"), or leave the left slot empty/logo-only, or
>   a neutral mark. Pick whichever reads cleanly. The point: left ≠ right; no doubled label.
> - Apply to BOTH the on-screen preview AND the exported PDF (the duplicate is in the PDF too).
> - Still NEVER "VisibleAU" (white-label rule holds).
> Verify: header shows the agency name (or a clean non-duplicate default) on the left + "AI Visibility
> Report" on the right — no doubling, in preview and in the downloaded PDF.

═══════════════════════════════════════════════════════════════════════════════
PART 2 — Wire the section checkboxes to drive report content (from REAL data)
═══════════════════════════════════════════════════════════════════════════════
> Currently the "Sections to include" checkboxes don't change the report. Make each checkbox actually
> include/exclude its section, in BOTH the preview and the exported PDF. Build each section from the
> brand's REAL latest-completed-audit data (the same source as the 88.3 composite). Sections (proto
> L3764):
>
> 1. **Executive summary** — a short generated paragraph from real data. The prototype's version cites
>    score change + a driver + remaining actions. Generate the equivalent from what EXISTS:
>    - If a prior audit exists: "{brand}'s AI visibility is {composite}/100" + the delta vs prior
>      ("up/down X points since {date}") — use the REAL delta (same Wilson-CI delta logic as elsewhere).
>    - Mention a real driver if derivable (e.g. the highest/lowest dimension, or the strongest engine).
>    - Mention the number of open action items (real count) if any.
>    - If there's no prior audit (no delta) → a single-audit version ("{brand}'s current AI visibility
>      is {composite}/100", note the strongest/weakest dimension). Do NOT invent a "+5 points" trend
>      that didn't happen. Omit any claim you can't back with data.
>
> 2. **Visibility scorecard** — the existing composite + 4 dimension cards (already built). This is the
>    section that's currently always shown; make it gated by THIS checkbox.
>
> 3. **Per-engine breakdown** — real per-engine scores from the audit (ChatGPT / Claude / Gemini /
>    Perplexity — whichever the audit actually ran, tier-aware). Show each engine's mention rate /
>    score from the real audit data. If per-engine data isn't stored on the audit, show what IS
>    available (or omit the section with a note) — do NOT fabricate per-engine numbers.
>
> 4. **Action plan** — the brand's REAL recommendations (the Action Center items). The report already
>    shows "Key Recommendations: No open action items" honestly — make that the Action-plan section,
>    gated by this checkbox, listing real recommendations when they exist.
>
> 5. **Methodology appendix** — static explanatory text about how the audit works (engines queried,
>    scoring dimensions, Wilson CI). This one is genuinely static/boilerplate (it's methodology, not
>    brand data) — a fixed description is fine here. Off by default (matches the prototype's first-4-
>    checked default).
>
> Also add the **Confidence interval** line under the composite (prototype L3799: "Confidence interval:
> X–Y (95%)") — from the audit's REAL Wilson CI bounds (scoreConfidenceLow–scoreConfidenceHigh), with a
> null guard ("—" or omit) if a Sprint-2-style audit has no CI. This belongs with the scorecard/exec
> summary.
>
> Behaviour: unchecking a section removes it from BOTH preview and exported PDF. The PDF's "page 1 of N"
> should reflect the actual content length. Default checked state matches the prototype (first 4 on,
> Methodology off).

═══════════════════════════════════════════════════════════════════════════════
PART 3 — Verify (real data, both preview and export)
═══════════════════════════════════════════════════════════════════════════════
> - Header: no duplicate label — agency name (or clean default) left, "AI Visibility Report" right; in
>   preview AND downloaded PDF; never "VisibleAU".
> - Each checkbox toggles its section in the preview; the exported PDF matches the checked sections.
> - Executive summary reads from REAL data (Bondi's real composite/delta/dimensions) — no hardcoded
>   "68 to 73 / 14% ChatGPT" mock prose. A brand with no prior audit shows the single-audit version, no
>   invented trend.
> - CI line shows the real Wilson CI (or is omitted/"—" if none) — not a made-up interval.
> - Per-engine breakdown shows real per-engine data (or is honestly limited) — no fabricated engine
>   numbers.
> - Action plan = real recommendations (or honest "No open action items").
> - Composite still 88.3 for Bondi; export still produces a real PDF; `npm run typecheck` passes; both
>   themes.
> Report: the header fix, which sections are now wired + their data source, a sample of the generated
> exec summary (confirming it's from real data), and a re-exported PDF showing the richer content.

─────────────────────────────────────────────────────────────────────────────

## Notes for Sri (not part of the paste)
- **The dashboard cards are already done** (built + verified + the regression they caused was fixed
  earlier this session), so this prompt is just the PDF polish — the last items on the white-label
  report.
- **The honesty bar is the whole point of Part 2.** The prototype's exec summary is vivid MOCK prose
  with specific fake stats. The temptation is to copy that style — but a client-facing report must
  generate its summary from REAL data and omit what it can't back. Same principle that drove the 72.4→
  88.3 fix; here it applies to the new prose sections. I've made it the non-negotiable up top.
- **Per-engine + CI depend on the audit storing that data.** If the audit doesn't persist per-engine
  scores or CI bounds, the prompt says to show what's available and omit the rest (not fabricate). If
  Claude Code reports those data aren't stored, that's a finding — we'd decide whether to surface them
  from the existing audit payload or leave those sections out.
- After this, the white-label report matches the prototype's richer design AND stays fully honest —
  completing the PDF builder properly.
- Per your relay discipline: this is client-facing content generation, so the bit worth the closest
  look is that the exec summary and any per-engine/CI numbers are REAL (not plausible-looking
  fabrications) — verify the generated prose against the brand's actual audit.
