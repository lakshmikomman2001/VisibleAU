# Claude Code — FIX (Retrieval Hub, Finding 1): remove the standalone "—/18 llms.txt Depth" stat card; surface depth_score INSIDE agent-readiness (+ verify hub layout vs prototype)

The Retrieval Intelligence hub (`/brands/[id]/retrieval`) shows a standalone top-level stat card **"llms.txt Depth —/18"**
as a PEER to the "56/100 Agent Readiness" card. This VIOLATES an explicit LLD copy rule and reintroduces a conflation
the prototype already fixed (FIX-2). Remove the standalone card; surface depth_score inside the agent-readiness /100
score. Then verify the hub layout against the prototype (Finding 2).

Env: Windows repo `C:\startup\VisibleAU\src\`. App on LOCAL PROD `visibleau_prod`. Never real prod. Brand: Metropolitan
418f321f-2489-4560-aaa9-895728580465. Canon: LLD v8.70.

## Finding 1 — WHY it's a bug (not a style nit): the LLD copy rule + its rationale
LLD v8.70 states the rule TWICE, with the reason:
- Line 5457-5459: *"UI copy rule: llmstxt depth_score shown as part of agent_readiness_scores /100, NOT as a standalone
  'AI visibility' score. **Prevents AU SMBs from thinking 'I got a good llms.txt score so I'm set' — they still need
  content work.**"*
- Line 2911: *"depth_score shown INSIDE agent_readiness_scores /100, NOT as a standalone visibility metric."*
- Prototype FIX-2 (LLD 791) already REMOVED this exact conflation: a prior draft mixed Phase-1 technical_audits /18
  sub-scores with Phase-2 agent_readiness /100 dimensions; FIX-2 relabelled the bars to the 5 canonical dimensions
  (each /20) and nested llms.txt as a sub-signal. The standalone `—/18` hub card reintroduces the removed conflation.

So depth_score (/18) must NOT be a top-level hub stat card. It's a SUB-SIGNAL that rolls up into the **Technical
Accessibility** dimension of agent-readiness (prototype: "Sub-signals (llms.txt, MCP, etc.) roll up into Technical").
The `—` also shows it's empty (no llms.txt generated for Metropolitan) — doubly wrong: architecturally misplaced AND
empty.

## STEP 1 — Find the hub's stat-card row + the depth card
```bash
grep -rn "llms.txt Depth\|llms.txt.*Depth\|depth_score\|depthScore\|/18\|Agent Readiness\|Avg Citation\|Crawler Visits\|StatCard\|stat.*card" "app/(auth)/brands/[brandId]/retrieval/page.tsx" components/domain/retrieval/ | head -20
```
Report: which component/section renders the 4 stat cards (56/100 Agent Readiness, —/18 llms.txt Depth, 34% Avg Citation
Prob, 0 Crawler Visits), and where the depth card is defined.

## STEP 2 — Remove the standalone "—/18 llms.txt Depth" stat card
- Delete the depth_score stat card from the top-level hub stat row. The remaining hub stats should be the ones that ARE
  top-level metrics: **Agent Readiness 56/100, Avg Citation Prob 34%, Crawler Visits 0** (these 3 are legitimately
  hub-level; llms.txt depth is not).
- Do NOT delete the depth_score DATA or the llms.txt sub-screen — only remove it as a standalone HUB STAT CARD. The
  depth_score still lives on the llms.txt sub-screen (llmstxt-viewer.tsx, §6U — "file + depth_score /18 + download") and
  that's the correct place for the /18 detail.

## STEP 3 — Surface depth_score INSIDE agent-readiness (the LLD copy rule's positive requirement)
The rule isn't just "remove the card" — it's "show depth_score AS PART OF agent_readiness /100." So depth_score should
appear nested within the Agent Readiness presentation, as a contributor to the **Technical Accessibility** dimension:
- On the Agent Readiness sub-screen (or the hub's agent-readiness section), when the Technical Accessibility dimension is
  shown, surface the llms.txt depth as a sub-signal of it (e.g. "Technical Accessibility 14/20 — llms.txt depth: 12/18,
  MCP: absent"). Match how the prototype nests sub-signals under Technical.
- Confirm agent-readiness's Technical dimension actually FACTORS depth_score (it should, per "llms.txt rolls up into
  Technical") — if the /18 depth feeds the /20 Technical score, showing it there is the honest framing the LLD wants.
```bash
grep -n "depth_score\|depthScore\|technical\|tech_score\|llms\|Technical Accessibility" lib/retrieval/agent-readiness.ts | head
```
Report: does the Technical dimension incorporate depth_score, and is depth now shown nested under Technical (not as a
standalone hub card)?

## STEP 4 (Finding 2 — VERIFY, don't blindly change) — hub layout vs the prototype
The prototype (RetrievalHub 2537) specifies the hub as: **Hero: Agent Readiness score (large, purple) + 5 sub-dimension
bars** (Technical/Entity Clarity/Claim Verifiability/Category Authority/Task-Fit, each /20), plus a **3-col grid: llms.txt
status / MCP endpoint / Entity Home**. The rendered hub instead shows 4 summary stat cards + 5 "View details" tiles.
```bash
grep -rn "dimension\|bar\|hero\|gauge\|Technical Accessibility\|Entity Clarity\|3.col\|grid-cols-3\|llms.txt status\|MCP\|Entity Home" "app/(auth)/brands/[brandId]/retrieval/page.tsx" components/domain/retrieval/ | head
```
Report (do NOT change yet — this is a verify step): does the hub show the prototype's **hero gauge + 5 dimension bars +
3-col status grid**, or only the summary stat cards + tiles? If it's only stat-cards-and-tiles, that's a design
deviation from the prototype — report it as a finding (is it an acceptable simplification, or should the hub show the 5
agent-readiness dimension bars per prototype 2537?). We decide the fix after seeing what's there.

## STEP 5 — Verify Finding 1 on screen
Reload `/brands/418f321f.../retrieval`:
- The standalone "—/18 llms.txt Depth" stat card is GONE from the hub stat row.
- The remaining hub stats are Agent Readiness 56/100, Avg Citation Prob 34%, Crawler Visits 0.
- depth_score now appears nested under the Technical Accessibility dimension of agent-readiness (on the hub's
  agent-readiness section or the sub-screen), NOT as a peer metric.
- The llms.txt sub-screen still shows the /18 depth (unchanged — that's its correct home).
Report: the depth card is gone from the hub; depth is nested under Technical; llms.txt sub-screen unaffected.

## STEP 6 — Report
- Finding 1: the standalone —/18 depth card removed; depth_score surfaced inside agent-readiness (Technical dimension)
  per LLD 5457/2911; llms.txt sub-screen still shows /18. On screen confirmed.
- Finding 2: report the hub layout (hero+bars+grid vs stat-cards+tiles) — a finding to decide, not fixed this pass.
- Add/adjust a test if the hub's stat cards are unit-tested (assert no standalone depth_score /18 hub card; assert the 3
  legit hub stats).

## Constraints
- Finding 1 is a real LLD violation (5457/2911 copy rule + the FIX-2 conflation) — remove the standalone card, surface
  depth INSIDE agent-readiness. Do NOT delete depth_score data or the llms.txt sub-screen (/18 belongs there).
- The rule's POINT (LLD 5459): don't let depth_score read as a standalone "I'm set" score — nest it under Technical so
  it's honestly a sub-signal. Implement the nesting, not just the deletion.
- Finding 2 is VERIFY-ONLY this pass — report the layout deviation; we decide the fix after. Don't restructure the hub
  blindly.
- Verify Finding 1 on screen (card gone, depth nested, llms.txt sub-screen intact). Local prod, never real prod.
- LLD v8.70 / prototype 2537 win.

## NOTE
Finding 1 is a confirmed LLD violation, not a style nit: the hub shows a standalone "llms.txt Depth —/18" stat card as a
peer to Agent Readiness, but LLD 5457/2911 has an explicit copy rule — depth_score must be shown INSIDE agent_readiness
/100, NOT standalone, specifically to stop AU SMBs thinking "good llms.txt = done" without content work. The prototype's
FIX-2 already removed this exact conflation. Remove the standalone hub card, surface depth nested under the Technical
Accessibility dimension (where llms.txt rolls up), keep the /18 on the llms.txt sub-screen. Finding 2 (hub shows stat
cards+tiles vs the prototype's hero-gauge + 5 dimension bars + 3-col status grid) is a VERIFY step — report the deviation,
decide the fix after. Verify Finding 1 on screen: the —/18 card is gone, depth is nested under Technical.
