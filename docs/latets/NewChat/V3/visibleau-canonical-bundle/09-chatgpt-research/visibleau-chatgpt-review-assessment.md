# Review of ChatGPT's VisibleAU killer features + market research

**Reviewed:** 12 May 2026
**Source:** `chatgpt_visibleau_complete_documents_bundle.zip` (2 files, ~1.4 KB content total)
**Verdict in one line:** 12 of 14 items are already in PRD v1.14 at far greater depth. 2 are renames of existing PRD features. **0 are net-new ideas.**

---

## What ChatGPT delivered

Two files in a 74 KB DOCX wrapper, totaling **1,461 bytes of actual content** (the XML overhead is the rest):

- `chatgpt_visibleau_killer_features_and_pain_points.docx` — 856 chars: 6 pain-point bullets, 8 killer-feature bullets, 1 positioning line
- `chatgpt_visibleau_market_research.docx` — 605 chars: 6 strategic-finding bullets, 5 opportunity-area bullets

No detail. No effort estimates. No sprint placement. No schemas. No research citations.

**This is the third ChatGPT review you've received with this signature** (AURELIA v3.9, AURELIA v4.1, now VisibleAU). Same pattern: bullet lists in DOCX wrappers, sized 30-40 KB regardless of how much actual content is inside.

---

## Verification: pain points

I grepped each pain point against `sri-geo-aeo-prd-v1.md` v1.14. Result: **all 6 are already in PRD §4.5** (which is 631 lines covering buyer pain points in detail with cited evidence).

| ChatGPT's pain point | PRD coverage | Status |
|---|---|---|
| Tools identify problems but don't help fix them | §4.5 #3A "Monitoring vs action (THE BIG ONE)" — universal complaint #1 in category | Already covered |
| Local AI visibility intelligence is weak | §1, §2 ("Local SEO + GEO convergence underserved"), §4.5 #5A suburb-level tracking | Already covered |
| Businesses don't understand why AI cites competitors | §4.5 #6 + Module 5 Action Reports with research citations explaining each gap | Already covered |
| AI hallucinations damage brand trust | §4.5 #6D hallucination detection + Sprint 3 multidimensional Accuracy score | Already covered |
| Most tools ignore retrieval infrastructure | §8 Module 5b (llms.txt + robots.txt + schema + SSR + answer capsules) + §2.5 differentiator | Already covered |
| Enterprise GEO tools too expensive/complex | §3 Tier 1 competitor analysis (Profound, Hall, Otterly) + Pricing Principle #1 anchoring | Already covered |

Your PRD §4.5 is ~10x the length of ChatGPT's entire delivery and contains 14 pain categories vs ChatGPT's 6. No gaps.

---

## Verification: 8 killer features

I grepped each. Result:

### Already in PRD with full detail (6 of 8)

| ChatGPT's killer feature | PRD location | Notes |
|---|---|---|
| 1. AI Visibility Action Engine | §8 Module 5 "Action Reports" with 11 specific action types each with research citation (Tinuiti, SE Ranking, Princeton GEO, HubSpot AEO) | PRD is far more specific |
| 2. AI Maps & Geographic Visibility | §8 Module 2 vertical packs (50+ suburb-specific prompts) + §8 Module 4 Local SEO + §4.5 #5A | PRD covers depth + breadth |
| 3. Citation Graph Intelligence | §16 "Citation Opportunities with outreach briefs" (v1.1) + Sprint 3 cited_sources jsonb + §8 v1.1 TikTok addition | PRD has named feature + sprint placement |
| 5. AI Retrieval Infrastructure Audit | §8 Module 5b — the v1.3 differentiator. llms.txt, robots.txt, schema audit, SSR check, answer capsules. Prototype has 5 dedicated screens. | Word-for-word in PRD |
| 7. Solo Founder & Agency Mode | §8 Module 6 Agency tier + §8 v1.2 founder visibility tracking ("no existing tool does this") | PRD has both as named features |
| 8. AI Visibility Revenue Attribution | §8 v1.1 "LLM conversion attribution (Growth tier+)" — Tinuiti data (14.2% vs 2.8%) cited, Month 4-6 placement | PRD has named feature + cited evidence |

### Renamed versions of existing PRD content (2 of 8)

| ChatGPT's killer feature | What it actually is in PRD | Net-new value |
|---|---|---|
| 4. AI Reputation Defense System | Sprint 3 sentiment dimension + Sprint 6 anti-pattern filter + Sprint 8 drift alerts bundled under one name | Naming, not feature |
| 6. AI Brand Memory Timeline | Sprint 8 drift detection + Sprint 9 audit history + Sprint 3 historical visibility tracking bundled under one name | Naming, not feature |

These two are real category-naming suggestions — the components exist but you could brand them differently if it helps positioning. Not new functionality.

---

## Verification: market research findings

All 6 strategic findings are already in PRD §2, §3, §4.5:

| ChatGPT's finding | PRD source |
|---|---|
| GEO/AEO market growing | §2 — $52M→$848M-$1.01B (2025) → $9.8B-$33.7B (2031-2034) at 30-50% CAGR |
| Competitors focus on dashboards/monitoring | §3 Competitor Deep Dive + §4.5 #3A "monitoring vs action" pain point |
| Operational AI visibility opportunity | §5 Product Vision & Positioning |
| Local AU underserved | §1 positioning + §2 "20+ tools surveyed, zero are AU-built" |
| Retrieval infrastructure future category | §2.5 + §8 Module 5b |
| AI memory + citation intelligence unexplored | §8 v1.1 Citation Opportunities + drift detection |

ChatGPT's market findings are the PRD's positioning summarised in 6 lines.

---

## The one item worth considering: positioning re-framing

ChatGPT's only non-derivative suggestion is the strategic direction line:

> "VisibleAU should evolve into: **AI Visibility Infrastructure & Operating System** rather than a simple GEO dashboard."

This is positioning, not features. Honest read:

**Argument for:** "OS" framing is more ambitious; could anchor higher in agency conversations; signals depth (Module 5b retrieval infrastructure + Action Center + drift + scheduling could plausibly be described as an "operating system").

**Argument against:**
- It overshoots actual scope. Real OS positioning requires plugin architecture, third-party developer ecosystem, extensibility APIs — none of which are in v1 or v1.1.
- Solo dev at weekend pace ≠ "infrastructure" brand. "Infrastructure" implies SLAs, 24/7 reliability, deep technical sales — all hard for one founder.
- Profound (with $35M Series B) already positions enterprise. Hall (Sydney, Blackbird-backed) positions enterprise. Competing on "infrastructure & OS" puts VisibleAU against well-capitalized incumbents in their preferred frame.
- PRD §5 positions narrower and more credible: "purpose-built AI search visibility platform for Australian SMBs and agencies." Easier to sell, easier to defend.

**Recommendation:** Keep current positioning. The "AI Visibility Infrastructure & OS" framing is aspirational marketing copy that doesn't match v1 scope. Revisit at v2 if you've earned the right to make the bigger claim.

---

## Honest comparison

| | ChatGPT delivery | PRD v1.14 |
|---|---|---|
| Pages of content | <1 page (1.4 KB) | ~70 pages (193 KB) |
| Pain points covered | 6 (titles only) | 14 categories (with cited evidence in §4.5) |
| Features specified | 8 (titles only) | 7 v1 modules + 37 OSS-derived features + 5 v1.1 + 5 v1.2 (all with effort estimates and sprint placement) |
| Research citations | 0 | 25+ named sources (Princeton GEO, Tinuiti, SE Ranking, HubSpot AEO, Foglift, danishashko, Auriti-Labs, etc.) |
| Sprint placement | None | All features placed in Sprint 1-12 per §11 |
| Effort estimates | None | Hours per feature + total active build 320-411h |
| Schema definitions | None | Full Drizzle schema in Foundations v1.9 |
| Competitive analysis | None | §3 Tier 1-5 with named competitors |
| AU specificity | "Local AU underserved" | 12 AU verticals + 6+ AU directories + suburb-level prompts + ABN Lookup + AU TLD signals + Wikipedia AU |

The PRD is more comprehensive across every axis.

---

## What I'd ignore, what I'd reconsider

**Ignore:**
- All 6 pain points (already in PRD §4.5 at depth)
- 6 of 8 killer features (named or covered with more specificity)
- 5 of 6 market research findings (already in PRD §2-3)

**Reconsider (maybe):**
- Naming "Reputation Defense" as a customer-facing product surface. Right now, sentiment + anti-pattern + drift are scattered across Sprint 3, 6, 8. If marketing benefits from bundling them under one label in the UI, that's a small UX decision worth ~30 minutes to discuss.
- Naming "Brand Memory Timeline" as a customer-facing surface for the historical audit + drift + per-brand trend chart that lives in Sprint 9. Same logic — marketing convenience, not new build.

**Reject:**
- "AI Visibility Infrastructure & OS" positioning. Wrong altitude for v1.

---

## The pattern across three ChatGPT reviews

You now have a clean dataset on what ChatGPT produces when asked to review your work:

| Review | Wrapper size | Actual content | New ideas |
|---|---|---|---|
| AURELIA v3.9 | 92 KB DOCX | +59 bullet paragraphs appended to v3.7 | 0 new ideas; 17 bullet-only "sections" |
| AURELIA v4.1 | 94 KB DOCX | +11 SHALL bullets + 1-sentence audit summary | 0 fixes applied; 6 hardware-spec bullets only fresh content |
| VisibleAU killer features | 74 KB DOCX | 1.4 KB of feature/pain bullets | 0 net-new ideas; 2 renames; 1 positioning suggestion (reject) |

Consistent signature: small content in large wrappers; reframings of existing material as new; no schema/effort/placement detail; no grep-verification against source documents.

This isn't an indictment of ChatGPT — it might be a prompting issue, an output-length constraint, or a model variant difference. But three reviews in, the pattern is clear enough that you can predict the value before opening the file.

---

## Recommendation

**Do nothing with this review.** Your PRD v1.14 is more comprehensive than the suggestions. The two reframings (Reputation Defense, Brand Memory Timeline) are marketing decisions worth considering during Sprint 11 polish, not engineering decisions.

If you want a real external review of VisibleAU's PRD + sprints, the highest-leverage move is to fix the 29 conflicts I catalogued in `visibleau-conflict-audit-prd-vs-sprints.md` first (especially C1 wrong prices, C4 missing Module 5b in sprint plan, H2 sprint scope swap), then ask a fresh reviewer to gap-check the corrected docs. Reviews of a clean spec set are useful; reviews that don't grep-verify against the source aren't.
