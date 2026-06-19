# VisibleAU — Sprint 7 Validation Handoff
# Date: June 2026
# Written by: the Claude session that built and fixed Sprints 1–7
# For: a fresh Claude chat to validate Sprint 7 built screens against the prototype
# Sprint: 7 of 12 — Technical AI Infrastructure

This document gives you everything you need to validate Sprint 7. Read it fully before
asking Sri for screenshots. The new chat's prior response was accurate — use it as the
starting point, not something to redo.

---

## SECTION A — WHAT THE PRIOR CHAT GOT RIGHT (keep these findings)

The prior chat's analysis was correct on all points. Do not re-litigate:

1. **The technical-audit overview page (8-dim + 5-category rollup, "Technical Score 41/100")
   has NO prototype screen to compare against.** Sprint 7's LLD spec (EC1/EC5) defined the
   data model and roll-up formula, but no visual prototype was ever drawn for the overview
   page itself. This is a known gap — Phase 1 prototypes were under-specified, which is
   exactly why Phase 2 prototypes went fully Figma-style. The overview page cannot be
   validated against a prototype; it can only be validated against design system consistency.

2. **The build correctly reused the prototype's design system.** The prior chat confirmed:
   - Top-right score treatment (small uppercase label + large number) matches `AuditResultsRich`
   - Dark Card surfaces and grid layout match prototype conventions
   - Green/amber bars match the prototype's status palette

3. **Three specific gaps on the overview page were correctly identified:**
   - **0-score treatment**: Schema markup 0/16 should render as red/danger, not neutral/empty
   - **No delta badge**: Missing "+N vs last audit" trend indicator (worth flagging but low priority)
   - **Mono font**: The "41" score should use `var(--font-mono)` to match prototype convention

These three gaps are **confirmed findings** — do not re-examine them. Add them to your
findings list and move on to validating the 7 sub-pages, which DO have prototype screens.

---

## SECTION B — THE PROTOTYPE FILE

The canonical prototype is `visibleau-prototype.jsx` (4,661 lines). Sri uploaded it to
this chat. The 7 Sprint 7 components live at these line ranges:

| Screen | Component | Lines |
|--------|-----------|-------|
| llms.txt generator | `LlmsTxtGenerator` | 2765–2849 |
| Schema auditor | `SchemaAuditor` | 2850–2906 |
| SSR check | `SsrCheck` | 2907–2961 |
| Answer capsules | `AnswerCapsuleFormatter` | 2962–3010 |
| robots.txt + AI crawlers | `RobotsTxtCrawlerConfig` | 3011–3092 |
| Brand & Entity audit (AU) | `BrandEntityAudit` | 3093–3147 |
| 47 citability methods | `CitabilityMethodsReference` | 3148–3212 |

The overview page (`/brands/[brandId]/technical-audit`) has NO prototype component.
Do not ask Sri for a screenshot of the overview to compare against — there is nothing
to compare it to. Focus your validation on the 7 sub-pages above.

---

## SECTION C — HOW TO NAVIGATE TO EACH SCREEN (built app)

All Sprint 7 screens live under Brand detail. The navigation path:

1. Go to `localhost:3000/brands`
2. Click any brand row (e.g. Bondi Plumbing)
3. The Brand detail page now has a **Technical audit** section/tab (added in the Sprint 7
   completion fix)
4. Click **View technical audit** → lands on the overview page
   (`/brands/[brandId]/technical-audit`)
5. From the overview, each sub-page is accessible via tabs or cards:

| Sub-page | Direct URL |
|----------|-----------|
| llms.txt generator | `/brands/[brandId]/technical/llms-txt` |
| Schema auditor | `/brands/[brandId]/technical/schema` |
| SSR check | `/brands/[brandId]/technical/ssr` |
| Answer capsules | `/brands/[brandId]/technical/answer-capsules` |
| robots.txt + AI crawlers | `/brands/[brandId]/technical/robots` |
| Brand & Entity audit | `/brands/[brandId]/technical/entity` |
| 47 citability methods | `/methodology/citability` |

Ask Sri to share a screenshot of each sub-page. You can validate them one at a time.

---

## SECTION D — VALIDATION CHECKLIST PER SCREEN

Use this to check each screenshot Sri shares. Flag mismatches with the prototype.
The prototype uses Bondi Plumbing as the demo brand — Sri's screenshots will show
their actual brand data, which will differ from prototype fixture values. That is correct.
Only flag structural/UI mismatches, not data differences.

### D1 — llms.txt generator
Prototype breadcrumb: `Workspace › Brands › Bondi Plumbing › llms.txt generator`

Validate:
- [ ] Breadcrumb matches (with actual brand name)
- [ ] "Foundation" warning badge visible near the page title or header
- [ ] Explanatory text present: "llms.txt is an emerging standard (think robots.txt for LLMs).
      Anthropic, Perplexity, and others are starting to honour it."
- [ ] Generated llms.txt preview panel shown (Markdown format with ## Optional section)
- [ ] At least one URL link visible in the preview (e.g. emergency plumbing, services)
- [ ] "Download llms.txt" button present
- [ ] Deployment instructions present (where to place the file)
- [ ] NO red console errors

Status convention: badge tone "warning" = amber. If the build uses different colours,
flag it — prototype is authoritative on tone/colour conventions.

---

### D2 — Schema auditor
Prototype breadcrumb: `Workspace › Brands › Bondi Plumbing › Schema audit`

Validate:
- [ ] Breadcrumb correct
- [ ] 5 KPI stat cards at top:
      Total schemas · Valid · Warnings · Hallucinated · Schema richness (score/max)
      Tones: neutral · success · warning · danger · warning
- [ ] Schema table below with columns: Type, Status badge, Richness score, Attributes, Issues
- [ ] Status badges use 3-value scale: `valid` (success/green) · `warning` (amber) · `danger` (red)
- [ ] **CRITICAL — 0-score treatment:** any schema with score 0/N must render as `danger`
      (red badge), NOT as neutral/empty. This is the confirmed gap from the prior review.
      Flag if it shows as neutral.
- [ ] Reality-check text present: honest statement about schema's actual impact on AI engines
      e.g. "Schema markup itself shows zero measurable impact on ChatGPT, Claude, Perplexity,
      Gemini per SE Ranking research" or similar hedging language
- [ ] Hallucination risk flagged: if a schema claim contradicts the live site (e.g. star ratings
      don't match), the row shows danger status with an explanation

---

### D3 — SSR check
Prototype breadcrumb: `Workspace › Brands › Bondi Plumbing › SSR check`

Validate:
- [ ] Breadcrumb correct
- [ ] Table with 5 columns: Page · JS-disabled content (%) · Critical CTAs · Schema visible · Status
- [ ] At least 4–6 page rows (homepage, /services, /about, /areas, /emergency, /reviews or equivalent)
- [ ] Content percentages shown as numbers (e.g. 94%, 91%, 76%)
- [ ] Pass/fail status per row (green tick / red cross or equivalent badges)
- [ ] The /reviews equivalent page (or lowest-scoring page) shows a failure / partial status
- [ ] "Critical CTAs: Partial" shown for at least one page where CTAs aren't fully SSR'd
- [ ] Explanation of why SSR matters for AI crawler visibility present

---

### D4 — Answer capsules
Prototype breadcrumb: `Workspace › Brands › Bondi Plumbing › Answer capsules`

Validate:
- [ ] Breadcrumb correct
- [ ] List of question-based headings detected on the brand's site
- [ ] Each capsule shows: question text · Deployed (success/green) or Draft (neutral) badge
- [ ] At least some capsules in "Deployed" state, some in "Draft"
- [ ] Deployed capsules have a 20–25 word direct answer preview
- [ ] Draft capsules have a "Rewrite suggestion" or similar action
- [ ] No capsules shown without a badge (every row has a status)

---

### D5 — robots.txt + AI crawlers
Prototype breadcrumb: `Workspace › Brands › Bondi Plumbing › robots.txt + AI crawlers`

Validate:
- [ ] Breadcrumb correct
- [ ] "Reference: Auriti-Labs (MIT)" attribution badge visible (required by Sprint 7 spec §16)
- [ ] Bots grouped into 3 tiers:
      Tier 1 — Training crawlers (GPTBot, ClaudeBot, anthropic-ai, Google-Extended, CCBot etc.)
      Tier 2 — Search-AI crawlers (OAI-SearchBot, PerplexityBot, GeminiBot, AppleBot-Extended etc.)
      Tier 3 — User-agent crawlers (ChatGPT-User, Claude-User, Perplexity-User etc.)
- [ ] Per-tier count: e.g. "7/9 allowed" shown
- [ ] CDN warning card present IF the brand's CDN is blocking bots (Cloudflare "Block AI bots"
      toggle). Prototype shows this as the most important finding ("single biggest why am I not
      getting cited cause"). If the brand has no CDN block, card may be absent — that is correct.
- [ ] Generated robots.txt snippet shown with specific bot names
- [ ] Allow/block toggle or indicator per bot or per tier

---

### D6 — Brand & Entity audit (AU)
Prototype breadcrumb: `Workspace › Brands › Bondi Plumbing › Brand & Entity audit`

Validate:
- [ ] Breadcrumb correct
- [ ] "AU-localised" info badge visible
- [ ] 5 signal cards (each with pass/fail/partial status):
      1. ABN Lookup verification — pass (green) if ABN found and active
      2. Wikipedia AU presence — likely fail (red danger) for most brands; shows citation impact
         stat: "brands with WP entries appear 2.3× more often" (Princeton GEO)
      3. AU TLD (.com.au) signal — pass (green) if brand uses .com.au
      4. AU directory presence (aggregate) — pass/partial/fail based on
         hipages · Yellow Pages AU · ServiceSeeking · Word of Mouth (womo.com.au)
      5. Australian Business Register match — pass (green) if business name matches ABR
- [ ] Each card shows: signal name · status badge · detail text explaining the finding
- [ ] Status uses: `pass` (success/green) · `fail` (danger/red) · `partial` (warning/amber)
- [ ] Entity score /10 shown (composite of the 5 signals)
- [ ] IMPORTANT: entity score is derived from `brand_entity_scores.score_of_10` — there is NO
      separate `entity_score` column. If the build shows a different column name, flag it.

---

### D7 — 47 citability methods
Prototype breadcrumb: `Workspace › Methodology › 47 citability methods`
Route: `/methodology/citability` (NOT under /brands/[brandId]/ — it is a global reference page)

Validate:
- [ ] Breadcrumb: `Workspace › Methodology › 47 citability methods` (NOT brand-scoped)
- [ ] Page title: "47 citability methods · effect sizes" or similar
- [ ] Methods list visible with: method name · short key badge (4-char uppercase) · effect size data
- [ ] Methods sourced from Princeton KDD 2024 + AutoGEO ICLR 2026 (attribution visible or in footer)
- [ ] Free tier: shows top 10 methods only
      Starter+ tier: shows all 47
      (If testing on Agency tier, all 47 should be visible)
- [ ] Each method links to or shows the Action Center evidence for that method
- [ ] No methods have invented effect sizes — all figures should be from published papers only
      (Sprint 7 spec EB4 explicitly said "DO NOT invent effect sizes")

---

## SECTION E — OVERVIEW PAGE DESIGN REVIEW (no prototype — convention check only)

Since the overview page has no prototype, validate it against the prototype's established
design conventions rather than a specific screen. Ask Sri for a full-page screenshot
(scrolled to show all content) and check:

- [ ] **Score display:** large number in `var(--font-mono)` tabular-nums, small uppercase label
      above it — matches `AuditResultsRich` "VISIBILITY SCORE / 63.4" pattern
- [ ] **0-score treatment (CONFIRMED GAP):** any dimension with score 0 renders as
      red/danger, not neutral/grey/empty bar
- [ ] **5-category rollup:** Technical · Content · Authority · Schema · Performance
      (Performance may be stubbed as v1.1 per Sprint 7 spec)
- [ ] **8-dimension drill-down:** expandable or linked from the 5 categories
- [ ] **Card surfaces:** dark `--bg-elevated` background, `--border-subtle` border
- [ ] **Status bars:** use the same green/amber/red palette as SchemaAuditor
      (valid → green, warning → amber, danger → red)
- [ ] **Delta badge (CONFIRMED GAP — lower priority):** "+N vs last audit" badge missing.
      Flag but do not block sprint sign-off on this alone.
- [ ] **Navigation:** back link to Brand detail present

---

## SECTION F — WHAT DOES NOT NEED VALIDATION THIS SPRINT

Do NOT ask Sri for screenshots of these — they are out of Sprint 7 scope:

- Audit results rich page (Sprint 3, already validated)
- Action Center (Sprint 6, already validated)
- Local SEO dashboard (Sprint 8, not yet built)
- Any Phase 2 screens

The `technical-audit-run.ts` Inngest function internals (does it fire, does it store
correctly) are validated by the presence of scores on the overview page — if scores show,
the function ran. Do not ask Sri to open the Inngest dashboard unless scores are missing.

---

## SECTION G — FINDINGS FORMAT

Report findings in this format so they can be turned into fix prompts:

**PASS** — screen matches prototype, no action needed
**GAP [severity]** — description of what's missing or wrong

Severity: HIGH (blocks sprint sign-off) · MOD (fix before Sprint 8) · LOW (nice to have)

Confirmed gaps already found (carry these forward, do not re-examine):
- **GAP [MOD]** Overview page: 0-score dimensions render as neutral, should be danger/red
- **GAP [LOW]** Overview page: missing delta badge vs last audit
- **GAP [LOW]** Overview page: confirm "41" score uses var(--font-mono) tabular-nums

Sprint 7 sign-off gate: all 7 sub-pages PASS + the HIGH/MOD gaps on the overview page
are fixed. LOW gaps can carry to a polish pass.

---

## SECTION H — WORKING AGREEMENTS WITH SRI

- English only — no Telugu unless Sri explicitly requests it.
- Do not re-examine findings the prior chat already confirmed (Section A).
- Validate against the prototype where a prototype screen exists (Sections D1–D7).
- Validate against design conventions where no prototype exists (Section E).
- Do not invent findings — if something looks different but works consistently within
  the prototype's design system, that is acceptable. Only flag genuine deviations.
- Do not suggest Sprint 8 work during this validation pass.
- If a sub-page is completely missing (404 or blank), that is a HIGH finding — report
  it immediately so a fix prompt can be written.

— End of handoff. Ask Sri to share screenshots of each sub-page listed in Section D,
  starting with D1 (llms.txt generator). Validate one screen at a time.
