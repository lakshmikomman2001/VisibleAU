# VisibleAU — Fan-Out Productisation Plan

**Date:** 5 July 2026
**Owner:** Sri
**Goal:** turn the existing query-fan-out capability (backend already built in Phase 2 Sprint 3 — `query_fan_out_results`) into a **headline metric + demo centerpiece + action link** that upgrades the Phase 2 you're selling now.
**Caveat:** market figures are directional (vendor research, late-2025/2026) — use as "research strongly suggests," not guarantees. The exact platform sub-queries are not public; every tool (including yours) *simulates* fan-out.

---

## 1. Why fan-out is the wedge (the sharpened case)

The "ranking ≠ AI citation" story is now well-documented, which makes fan-out a powerful **education hook**:
- Surfer SEO (Dec 2025): **~68% of AI-cited pages sit outside the top 10** organic results — only ~32% of citations come from top-ranking pages.
- Mike King / SparkToro (Jan 2026): only **~25–39% overlap** between traditional Google rankings and AI citations.
- Synthesis (Ekamoira, Feb 2026): brands optimising *only* for traditional SEO miss **~88% of AI citation opportunities**.
- The mechanic: AI fans **one query into ~10–12 sub-questions**, then synthesises — and **~73% of those sub-queries change every search**, so *coverage of the sub-question space* (not a single ranking) is what protects citation.

**The line this gives you:** "Ranking #1 in Google no longer means AI recommends you. AI breaks your customer's question into ~12 sub-questions and cites whoever covers them. Here's how much of that space you actually cover." That reframe *is* the sale — and fan-out is the only metric that answers it.

---

## 2. Honest competitive read (where you actually differentiate)

Be precise, because fan-out is commoditising at one layer:
- **Sub-query *generation* is becoming commodity.** Free fan-out generators exist (llmrefs, wellows, others) — paste a query, get simulated sub-questions. So "we simulate fan-out" is **not** a durable differentiator on its own.
- **Enterprise trackers** (Profound, quolity, etc.) measure citation share across branches but are US/enterprise-priced, action-light, and not AU-local.
- **The gap VisibleAU fills** (and where all the productisation effort should go): **your brand's actual coverage across the fan-out, your competitors' coverage alongside it, and exactly what to fix for each gap** — integrated into a full audit, white-labelled, AU-first, SMB/agency-priced.

A June-2026 buying guide put the buyer's test bluntly: *"Do not buy the tool that looks best in a demo. Buy the tool that can prove what changed, why it changed, and what to do next."* → **The action link (§5) is the differentiator, not the fan-out itself.** Lead with coverage + competitors + fixes, not "we do fan-out."

---

## 3. The headline metric (design)

Give it a name and make it a hero score alongside the visibility score.

- **Name (recommend): "AI Answer Coverage"** (client-legible). Alternatives: "Answer-Space Coverage," "Fan-Out Coverage." Technical basis = fan-out coverage.
- **What it measures:** when AI fans the customer's core query into its real sub-questions, the **% of those sub-questions where the brand appears / is cited**.
- **Scale:** 0–100 (a true coverage %).
- **Denominator honesty (closes the open "20-denominator" item):** score against the **actual number of sub-queries generated** for that query, shown explicitly — "you appear in **3 of 11** sub-questions (27%)." Never a hidden/fixed denominator; that's a trust-killer.
- **Benchmark context:** research shows **leading brands hold ~25–40% citation share across fan-out branches** — so a 27% score renders as "approaching the leading band," which is both honest and motivating.
- **Confidence label:** carry the existing confidence label (how many sub-queries, how many runs) — per the 5-question Explainability Contract. Don't present a volatile single pull as certainty (fan-out is ~73% dynamic).
- **Positioning vs the visibility score:** two complementary headlines — **Visibility** ("are you recommended for the main question?") + **AI Answer Coverage** ("do you cover the sub-question space that actually drives citation?"). Together they tell the whole story; most tools show only the first.

---

## 4. The agency demo (the fan-out visualization is the centerpiece)

The "aha" is **showing the hidden question space and the client's absence in it.** This is visceral and undeniable, and it's what competitors' free generators and enterprise dashboards *don't* make legible. The flow:

1. **Pick the client's core commercial query** (e.g. "best emergency plumber Sydney").
2. **Reveal the fan-out:** "AI doesn't answer this as one question — it fans it into these ~11 sub-questions your customers are actually asking." *Display the sub-queries.*
3. **Overlay coverage:** green = client appears, red = absent. "Your client shows up in **3 of 11**. Their top competitor: **8 of 11**." *This side-by-side is the punch.*
4. **Headline:** "AI Answer Coverage: **27/100** — leading brands sit at 25–40%."
5. **The gaps:** "Here are the **8 sub-questions you're invisible in.**"
6. **The actions:** "For each, here's exactly what to create or fix." *(the differentiator — §5)*
7. **The takeaway:** it all lands in a **white-label PDF** the agency forwards to their client.

**Demo discipline (from the sales kit):** pre-run the client's query privately first — never run it live for the first time; have a backup query; verify the fan-out completes and the coverage overlay renders cleanly. A broken or empty fan-out live is worse than not showing it.

---

## 5. The gap → action link (the real differentiator)

Each sub-question the brand is absent from is a **specific, nameable content gap → a fix → a task.** This is what turns fan-out from a *diagnostic* (what everyone shows) into *remediation* (your action layer, what the buyer actually pays for):

- Absent sub-query → a recommendation ("create a page/section answering '<sub-question>' with X structure") → a task in the existing workflow loop → re-audit to confirm coverage improved.
- Ties directly into VisibleAU's existing recommendation/remediation engine — fan-out becomes a *source* of prioritised, concrete actions, not just a score.
- Maps to the market's own optimisation playbook (audit fan-out coverage → add FAQ/variant content → structured data → topic clusters), so the fixes you surface match what agencies already know they should do.

**This is the line that wins the deal:** "Others show you the gap. We show you the gap, who's filling it instead, and exactly what to publish to close it."

---

## 6. The report section (white-label, client-facing)

In the white-label report (Sprint 4), a **"AI Answer Coverage"** section: the headline score with benchmark, the fan-out map (sub-questions with green/red coverage), the competitor coverage comparison, and the top 3–5 gap-driven fixes. Client-legible, agency-branded — the artifact that makes the agency look sophisticated to *their* client and justifies the retainer.

---

## 7. Positioning & education (the narrative)

Bake the rank≠citation reframe into the UI and the pitch — it's *why* the metric matters:
- **The hook:** "You rank #1 and still aren't recommended by AI. Here's why." → fan-out coverage.
- **The stat (use sparingly, as research not guarantee):** ~68% of AI citations come from pages *outside* the top 10; SEO-only brands miss ~88% of citation opportunities.
- **The shift:** from *keyword rankings* to *sub-question coverage* — a new metric agencies can sell as a new service, with you as the tooling.
- **The proof:** the demo (§4) *shows* it on their own client, so the education isn't abstract.

---

## 8. Build scope (productising the existing capability)

The fan-out backend exists (`query_fan_out_results`, sub-query generation, coverage measurement). This is **surface + visualise + link + polish**, not a new engine:

- **Headline metric surface** — "AI Answer Coverage" 0–100 + explicit denominator + benchmark context + confidence label. *(Small.)*
- **The fan-out visualization** — the sub-question map with coverage overlay. **This is the main new UI and the demo centerpiece.** *(Moderate — the highest-value build.)*
- **Competitor coverage overlay** — your coverage vs competitors' across the branches (you already hold competitor/SoV data). *(Small–moderate.)*
- **Gap → recommendation mapping** — each absent sub-query generates/links a fix into the existing remediation workflow. *(Moderate — the differentiator.)*
- **Report section** — the white-label "AI Answer Coverage" block. *(Small, builds on Sprint 4.)*
- **Honesty fixes** — resolve the denominator sanity item; ensure the confidence label is wired. *(Small, and important for trust.)*
- **Demo polish** — clean, fast, reliable fan-out run. *(Small but essential.)*

**Sequencing:** this is a *positioning asset for the Phase 2 you're selling now* — so the metric surface + visualization + report are worth doing **sooner** (they compound with go-to-market), ahead of multi-region. The deeper gap→action polish can follow.

---

## 9. Caveats (stay honest — it's your moat)

- **Don't oversell fan-out as unique** — sub-query generation is commoditising. Sell coverage + competitors + fixes + AU-local + price, integrated.
- **Fan-out is dynamic** (~73% of sub-queries change per search) — present coverage as a *trend* with confidence, not a fixed guarantee. Show movement over time, not just a snapshot.
- **Simulated, not ground truth** — the exact platform sub-queries aren't public; be transparent that this is a high-quality simulation (as every tool's is). Honesty here *builds* trust with technical agencies.
- **Research figures are directional** — "research strongly suggests," never "guaranteed." Refresh the stats before external use.

---

## Bottom line
Fan-out is your strongest near-term product/positioning asset *because* it lines up with a documented market shift (rank≠citation) and something you already have. The win isn't "we do fan-out" — it's **"we show your coverage of the questions AI actually asks, who's beating you to them, and exactly what to publish to win them — for your market, at your price."** Productise the metric, the visualization, and the action link; do it sooner as a Phase-2 selling upgrade; stay honest about what's simulated and what's commodity.
