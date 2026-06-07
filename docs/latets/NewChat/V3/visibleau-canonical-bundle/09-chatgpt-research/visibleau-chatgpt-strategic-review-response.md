# VisibleAU — Response to ChatGPT Independent Product Strategy Review
## Author: Claude (Phase 2 LLD author, with full LLD access)
## Date: June 2026 | LLD Version reviewed: 8.18

This response is grounded in the actual LLD content — every claim is verified against
the document before it's written. Where ChatGPT is right, it's acknowledged. Where the
LLD already addresses the concern, the exact location is cited. Where ChatGPT is wrong
or the suggestion would harm the product, it's rejected with reasoning.

---

## Overall Scores — Honest Reassessment

| Dimension | ChatGPT | LLD Author (honest) | Rationale |
|---|---|---|---|
| Architecture | 9/10 | **8.5/10** | Strong, but Phase 2 sprint ordering has a sequencing problem |
| Data Model | 9/10 | **8.5/10** | 37 tables, well-designed, but 4–5 are premature for v1 |
| Competitive Coverage | 9/10 | **9/10** | Agree — 10 competitors deeply audited, all gaps addressed |
| Customer Experience | 7/10 | **6/10** | ChatGPT is being generous. Growth tier unlocks 15 features simultaneously |
| Commercial Differentiation | 7.5/10 | **7/10** | AU moat is real; monetisation of the moat is underworked |
| Long-Term Moat | 8/10 | **7.5/10** | Data network effect potential exists but not designed for |
| **Overall** | — | **7.5/10** | Technically excellent. Productised inadequately |

**The single most important finding:** ChatGPT's "intelligence collection rather than
customer outcomes" concern is correct. The LLD is an engineer's document that happens
to contain a tier design, rather than a product document that happens to have a schema.
Every decision in Phase 2 was optimised for coverage and correctness. That is the right
choice for a data model. It is the wrong choice for a product people pay for.

---

## SQ1: Can VisibleAU become an "AI Visibility Operating System"?

**Short answer: Yes, but the claim must be earned, and it isn't yet.**

What the LLD has that supports "OS" positioning:
- Workflow execution loop: `remediation_tasks` → `content_drafts` → `workflow_runs` → re-audit
- 10+ autonomous Inngest functions running continuously per brand
- Team collaboration: `org_members` RBAC, brand-scoped access
- Governance: `audit_trail`, `data_residency_log`
- API access on v1.1 roadmap

What makes it a *dashboard*, not an OS right now:
1. The customer still decides which of 11 action types to act on
2. Content drafts are generated but the approval-to-publish loop has no UX spec
3. The lift measurement cycle (`score_after`, `lift_achieved` on `remediation_tasks`)
   is in the schema but is never surfaced to the customer as a visible loop
4. Nothing is automated without customer initiation

**The gap is narrow and fillable.** The OS claim becomes true the moment one complete
loop is demonstrated visibly:

> Audit complete → #1 gap identified → Draft written → Customer approves in 1 click
> → Re-audit runs in 48 hours → "Your citation rate improved 14%. Here's what moved."

That loop exists in the data model. It has no UX spec. Sprint 9 must make it the
centrepiece, not the seventh item on a features list.

**Can competitors copy it?** Semrush and Profound could build the loop — they have the
engineering depth. What they cannot copy quickly is the AU prompt specificity and the
closed execution layer for AU SMBs who need suburb-level prompts, not generic keywords.
The moat is the AU content layer + the closed loop, not the monitoring.

**Recommended action:** Sprint 9 UX spec must describe one complete Autopilot loop
end-to-end as the primary UX story. Rename the experience from "Adaptive Segment-Aware
UX" to "AI Visibility Autopilot" in all UX copy — zero engineering cost, immediate
positioning change.

---

## SQ2: Explainability

**Short answer: Specified, but not enforced as a testable constraint.**

What the LLD has:
- `ExplainabilityService.annotate()` is documented as mandatory
- Plain-English rule: Year 10 reading level
- Forbidden words: algorithm / heuristic / statistical / CI
- The 5-question framework is in the handoff doc
- Templates keyed on score type + brand_archetype

What is missing:
1. The 5-question framework is not in the LLD as a sprint requirement — it exists
   only in a handoff document Claude wrote for ChatGPT
2. No per-feature explainability spec exists (what does "where do I stand" say for
   topical_coverage_gaps vs citation_source_intelligence vs agent_readiness_scores?)
3. No acceptance criterion verifies explainability — "empty rationale = build failure"
   is stated in a changelog comment, not a test

**What must be added to the LLD — mandatory, not aspirational:**

Every Phase 2 sprint's acceptance criteria must include:

```
EXPLAINABILITY REQUIREMENT for [feature]:
  WHERE DO I STAND?  "[Plain-English sentence from the score]"
  WHY?               "[Plain-English cause, no jargon]"
  WHAT NEXT?         "[Single most important action]"
  IMPACT?            "[Specific % lift, research-cited]"
  CONFIDENCE?        "Based on [N] audits (High/Medium/Low confidence)"

ExplainabilityService.annotate() must return this shape for every scored response.
Vitest: empty rationale field fails CI.
```

Without this, explainability remains philosophy in a changelog. Claude Code will
write functional code that returns scores with no rationale, because no test fails.

---

## SQ3: Citation Failure Diagnosis™

**Short answer: Already built. Wrongly positioned. Should lead the product.**

What the LLD actually has (verified):
- `lib/visibility/citation-failure-diagnosis.ts` reads 3 existing tables
  (`citation_source_intelligence`, `comparison_prompt_results`, `topical_coverage_gaps`)
- No new table needed — computed at read-time
- `CitationFailureDiagnosis.tsx` component already exists in outputs
- Route: `/brands/[id]/visibility/citation-failure`
- Tier gating: Starter = top 1 reason, Growth = full diagnosis with evidence

The problem is positioning, not implementation. In the current sprint plan, Citation
Failure Diagnosis appears in Sprint 3 as item 7 of 9 features, listed after SoV,
visibility trends, prompt volume, fan-out, topical gaps, and citation source classifier.

**The commercial case for leading with it:**

Every agency sales call goes like this: "Can you tell me why my competitor is cited
and I'm not?" That is the question. VisibleAU is the only AU tool that answers it
with evidence — specific source types, specific topical gaps, specific competitor
citations — at A$299/mo instead of Profound's US$499/mo for one engine.

**What should change:**

| Now | Should be |
|---|---|
| Sprint 3, item 7 of 9 | Sprint 2, primary deliverable |
| Free: not available | Free: "Your competitor appears in AI 3× more. Find out why → Sign up" |
| Starter: top 1 reason (correct) | Starter: top 1 reason with the competitor named |
| Growth: full diagnosis | Growth: full diagnosis + 1-click action creation |
| Landing page: not mentioned | Landing page: "Find out in 60 seconds why AI recommends your competitor instead of you" |

This is the highest-leverage product positioning change available. It costs nothing
to move it earlier — the tables it reads are built in Sprint 3 regardless.

---

## SQ4: Opportunity Prioritization Engine™

**Short answer: Already implemented correctly. One gap: progress visibility.**

The LLD has the exact formula:
```
Priority Score = Impact × ConfidenceWeight ÷ EffortWeight
```
Implemented in `lib/workflow/priority-scorer.ts`, stored in `remediation_tasks.priority`.
The full derivation is documented including revenue rationale (customers who act on
correct priorities see results faster, reducing churn — this is explicit in the LLD).

What ChatGPT gets right: the name "Action Center" is generic. "Your #1 Action Today"
or simply a numbered priority list with the rationale visible makes the prioritization
feel tangible.

**The one genuine gap:** The LLD tracks `remediation_tasks WHERE status='complete'`
but never surfaces this to the customer as a progress metric. There is no "You've
closed 4 of 11 gaps this month. Your citation rate improved 8%." A customer with no
visible progress has no reason to renew.

**Action Progress Tracker — what to add:**

The data already exists. The fix is a single derived metric on the dashboard:
```
Active gaps: 7  |  Closed this month: 4  |  Citation rate: ↑8%
```
No new tables. One query on `remediation_tasks`. Sprint 6 should add this to the
Growth+ dashboard. It is the highest-ROI retention feature in the entire Phase 2 plan.

---

## SQ5: ROI Intelligence™

**Short answer: Partially implementable honestly. Revenue projection is dangerous.**

What the LLD already has:
- `organizations.ga4_measurement_id` + `ga4_api_secret` (Sprint 9 GD1)
- GA4 Measurement Protocol push: `audit_completed`, `audit_score_dropped` events
- `visibility_trends` stores `citation_rate`, `mention_rate`, `score_frequency_avg`

The full chain ChatGPT proposes — Visibility Gain → Traffic Potential → Lead Potential
→ Revenue Potential — is **only partially honest**:

| Layer | Data available | Honest to show? |
|---|---|---|
| Visibility Gain | Yes — `citation_rate` trends in `visibility_trends` | Yes |
| AI Referral Traffic | Yes, if GA4 connected — actual sessions from AI referrers | Yes |
| Lead Potential | No — requires conversion data VisibleAU doesn't collect | Only with massive caveats |
| Revenue Potential | No — requires sales data VisibleAU cannot access | Never fabricate this |

**Would agencies buy ROI Intelligence?** Yes — but only if it's honest. The fastest
path to agency churn is showing a CMO a fabricated "A$47,000/mo revenue potential from
AI search" that doesn't match reality. AU agencies have seen enough vendor dashboards
full of vanity metrics.

**What to build (version that agencies will trust):**

For brands with GA4 connected:
> "AI search sent 234 sessions to your site last month. Your site converts at 3.2%.
> That's ~7 leads from AI search this month. Up from 3 last month (+133%)."

For brands without GA4:
> "Connect GA4 to see your actual AI traffic. Industry benchmark: brands in your
> vertical typically receive 0.5–2% of total traffic from AI search."

**LLD addition:** Add `ai_referral_sessions INTEGER` and `ai_lead_estimate NUMERIC(6,2)`
to `visibility_trends`. Populate from GA4 real data when connected; show benchmark
ranges when not. Label clearly which is real and which is estimated.

---

## SQ6: Local AI Trust Radius™

**Short answer: The data exists across 4 tables. The unified score and UX do not.**

What the LLD has:
- `local_seo_results` — GMB, NAP, 4 AU directories (Sprint 8)
- `brand_entity_scores` — ABN, Hipages, Yellow Pages, ServiceSeeking, WOMO
- `citation_source_intelligence` — `au_directory` source type citations
- `agent_readiness_scores` — includes local entity signals

**What's missing:** These four tables are never joined into a single "Local AI Trust"
number. A plumber in Bondi must visit four separate dashboard sections to understand
their local AI standing. That is a UX failure, not a data failure.

**The commercial case:**

"Local AI Trust Radius" is an immediately legible concept for AU tradies and allied
health professionals, who think in terms of suburb reach, local reputation, and
directory presence. "AI Visibility Score: 67" is abstract. "Your Local AI Trust Score:
67 — AI recommends you in Bondi but not Parramatta" is something a plumber calls their
office manager about.

**What to add to the LLD:**

A derived `local_ai_trust_score` on `agent_readiness_scores`, computed as a weighted
composite of:
- GMB completeness (25%) — `local_seo_results.gmb_completeness_score`
- AU directory presence (25%) — `brand_entity_scores.local_directory_count` ÷ 4
- ABN verified (15%) — `brand_entity_scores.abn_verified`
- NAP consistency (20%) — `local_seo_results.nap_consistency_score`
- Local directory citations (15%) — `citation_source_intelligence` WHERE
  `source_type='au_directory'` AND `brand_present_in_source=true`

Surface as a single card in the SMB Growth dashboard:
> "Local AI Trust: 67/100. AI recommends you in local searches 67% as often as your
> top competitor. Fix: Complete your Hipages profile (missing 3 sections)."

Sprint 6 (Retrieval Intelligence + Agent Readiness) is the right home. No new tables.

---

## SQ7: AI Visibility Health Check™

**Short answer: Already exists. Needs packaging, not building.**

What the LLD has:
- Sample Audit (TIER 0): 5 dimensions with plain-English interpretation, 90 seconds
  (HubSpot AEO Grader insight already applied — all 5 dimensions shown, not blurred)
- Sprint 7 technical audit: 8 sub-scores → 5 rolled-up categories
- `agent_readiness_scores`: /100 composite with 5 sub-dimensions
- Sprint 10 onboarding wizard: 4-step brand setup → first audit

**The gap is packaging:** After the first audit completes, the customer sees an audit
results page with dimensions, scores, and an Action Center. They do not see anything
labelled "Your AI Visibility Health Check." The same data, presented as a Health Check
report with a traffic-light status per section, converts better and is more actionable
than raw dimension scores.

**What to add:** Sprint 10 should explicitly label the post-first-audit experience as
"Your AI Visibility Health Check" — one page that synthesises multidim audit +
technical audit + agent readiness into a single prioritised view:

```
Section 1: AI SENTIMENT     — How AI feels about your brand        [67/100 🟡]
Section 2: AI PRESENCE      — How often AI mentions you            [34/100 🔴]
Section 3: SITE READINESS   — How ready your site is for AI bots   [81/100 🟢]
Section 4: LOCAL AUTHORITY  — Your local AI trust signals           [52/100 🟡]
Section 5: YOUR #1 ACTION   — "Add 3 FAQ sections to your service page"
```

This is the aha moment for every new user. It costs one UX sprint to package correctly.

---

## SQ8: Competitive Benchmark Workspace™

**Short answer: The data exists across 3 tables. No unified workspace exists. This is a gap.**

What the LLD has:
- `comparison_prompt_results` — brand vs competitor per prompt per engine (Sprint 7)
- `share_of_voice_snapshots` — SoV percentages per engine (Sprint 3)
- `topical_coverage_gaps.competitor_coverage` JSONB — competitor content depth per topic
- SWOT Prompt Analysis tab (Sprint 9, Otterly review finding)

**What's missing:** These are four separate locations in the dashboard. An agency
account manager preparing a client report must visit four sections to build the
competitive picture. There is no single "You vs [Competitor]" workspace.

**Why this matters commercially:** For agencies, the "You vs Competitor" view is the
primary client deliverable justification. "Your competitor appears in 67% of AI prompts
about [topic]; you appear in 34%" is the sentence that wins renewal conversations.
Currently, assembling that sentence requires manually checking four dashboard sections.

**What to add to Sprint 9:**

A "Competitor Workspace" tab on the Growth+ brand dashboard that presents:

```
COMPETITOR: [competitor domain]
Citations this month:    You 34%  vs  Them 67%   ↓ 33% gap
Share of Voice:          You 28%  vs  Them 58%   ↓ 30% gap
Topics they own:         7 topics you don't cover
Why they're winning:     "6 how-to guides you don't have in [vertical]"
Your fastest path:       "Write a comparison guide on [topic] — closes 3 gaps at once"
```

No new tables. Pure query design against existing Phase 2 data. Sprint 9 is the right
sprint. One tab, one competitor at a time. Growth: 1 competitor. Agency: 3 competitors.

---

## SQ9: Customer Experience — Data-Rich, Insight-Poor

**This is the most important strategic risk in the entire review. ChatGPT is correct.**

What a Growth customer sees after Phase 2 launches:
- AI Visibility Score
- Citation Rate
- Mention Rate
- Brand Archetype label
- Share of Voice
- Fan-out sub-query results
- Topical Coverage Gaps (N gaps)
- Citation Source Intelligence
- Brand Web Mentions
- Hallucination Incidents
- Consensus Score
- LinkedIn Presence Score
- YouTube Presence Score
- Content Structure Audits
- Agent Readiness Score
- Local AI Trust (if added)
- Competitive Benchmark (if added)
- Citation Failure Diagnosis
- Action Center (11 action types)
- Generated narrative report

**That is 20+ data points on one brand dashboard.** A SaaS founder or a plumber in
Bondi will look at this for 90 seconds and close the tab.

**What to simplify — immediately:**

The dashboard must have a strict information hierarchy:

**Above the fold (always visible):**
- AI Visibility Score: 67/100 ↑8 this week
- #1 Action: [specific task] — estimated +12% citation rate
- Key change: "ChatGPT started citing [competitor] for [prompt] — you're not there yet"

**First drill-down (one click):**
- Citation Failure Diagnosis (why you're not cited)
- Competitive position (vs top competitor)
- Local AI Trust (for local businesses)

**Second drill-down (expert mode):**
- All intelligence layers
- Per-engine breakdowns
- Fan-out analysis
- Topical gaps detail

**What to remove from the default Growth dashboard view:**
- `query_fan_out_results` as a user-visible feature — show the insight it produces
  ("AI asks 8 follow-up questions about [topic] where you have no content"), not the
  raw sub-queries
- `google_ai_mode_results` — AU data is thin; shown at Growth level it looks
  impressive but performs poorly. Defer to v1.2.
- `brand_consensus_checks` from the Growth default view — move to an "advanced"
  section. It's useful but not a daily-use feature
- LinkedIn and YouTube presence from the default dashboard — move to a separate
  "Authority Signals" section that loads on demand

**What to make more prominent:**
- The trend direction: one large arrow showing AI Visibility Score up/down/flat
- The Action Progress tracker: "4 of 11 gaps closed this month"
- The competitor gap: one number, one name, one sentence

---

## SQ10: Monetisation — Features Ranked by Revenue Generation

**Ranked by AU market willingness-to-pay, not technical impressiveness:**

| Rank | Feature | Revenue mechanism | Tier |
|---|---|---|---|
| 1 | **Citation Failure Diagnosis** | Highest-urgency question every agency client asks; drives signup + upgrade | Free teaser → Growth |
| 2 | **White-label PDF Reports** | Agencies bill clients A$300–500/report; VisibleAU saves 3 hrs/client/month | Agency |
| 3 | **Hallucination Crisis Workflow** | Regulatory risk unlock for enterprise; one hallucination incident = contract | Enterprise |
| 4 | **Competitive Benchmark Workspace** | Agencies justify retainers with competitive data | Growth |
| 5 | **Action Progress Tracker** | Retention driver; shows ROI of subscription; prevents churn | Growth |
| 6 | **Local AI Trust Radius** | AU SMBs understand "local" immediately; suburb-level urgency | Starter |
| 7 | **GA4-Connected ROI Intelligence** | CMOs need attribution; honest version trusted by AU agencies | Growth/Agency |
| 8 | **Automated Report Delivery** | Agencies save 2 hrs/client/month on reporting; direct cost saving | Agency |
| 9 | **SWOT Prompt Analysis** | Agency pitch tool — competitive picture in one view | Agency |
| 10 | **Opportunity Prioritization (#1 Action)** | Customers who act see results; customers who see results renew | Growth |

**Features with low willingness-to-pay, currently over-weighted in the UX:**

- `conversation_journeys` — interesting for enterprise research; tradies will never use it
- `brand_consensus_checks` — useful internally; not a buying reason
- `llmstxt_versions` — technical; no customer asks "how's my llms.txt depth score?"
- Fan-out sub-query detail — customers want the insight, not the methodology

---

## SQ11: Market Expansion

**Short answer: Infrastructure is genuinely ready. Content is not. Sequence matters.**

**What the LLD has (confirmed):**
- `market_code` TEXT across all Phase 2 tables (56 references)
- `provider_market_capabilities` — provider seed data per market
- `brand_entity_scores` ALTER TABLE: `local_reg_verified`, `local_reg_number` for NZ/UK
- `NZ_EN` referenced 18 times, `UK_EN` 17 times
- Infrastructure is genuinely multi-region from day 1

**What's missing for NZ (Month 6-9 target):**
- NZ vertical pack prompts: zero exist. All 336 prompts reference AU context.
  "Best plumber Sydney" does not work in Auckland.
- NZ directory integrations: no NZ equivalents of Hipages/WOMO are specified
- NZBN lookup: noted in ALTER TABLE but no integration specified

**What would break if you launched UK before fixing NZ:**
- `local_seo_results` AU-directory checks hardcoded to Hipages/Yellow Pages AU —
  a UK brand scores 0/4 on AU directories, which is meaningless noise
- All 336 prompts are AU-framed; UK prompts need a complete rewrite
- `brand_entity_scores.abn_verified` is AU-only; UK brands fail this

**Recommended sequence:**
- NZ: Month 6 (same timezone, NZBN integration, 30% prompt rewrite)
- UK: Month 12 (Companies House integration, full prompt rebuild, GBP pricing)
- US: Not recommended as primary expansion — too competitive, no AU moat applies
- Canada: Month 18+ alongside UK content reuse

---

## SQ12: Enterprise Blockers

**3 real blockers. 1 is architectural. 2 are documentation gaps.**

### Blocker 1 — SSO is in a comment, not a sprint (architectural)

The LLD says "Clerk Enterprise SAML (no code change needed)." This is optimistic.
Clerk SAML requires a separate Clerk plan, per-customer IdP configuration, and a
user experience for IdP-initiated login. There is no sprint for this. An enterprise
security team will ask for SSO in week 1 of procurement — and currently there is no
deployment runbook, no sprint estimate, and no pricing plan that covers the Clerk
enterprise cost.

**Fix:** Add an explicit SSO Sprint between Phase 2 Sprint 8 (Governance) and Sprint 9.
Estimate: 1-2 weeks. Prerequisite for first enterprise contract.

### Blocker 2 — DPA not operationalised (documentation gap)

The Enterprise tier correctly lists a Data Processing Agreement (DPA) as a procurement
requirement. The LLD has no `enterprise_contracts` table, no DPA version tracking, no
signed-DPA gate before data starts being stored for enterprise customers.

When an AU government procurement officer asks "Show me the DPA version under which
you're operating my data today" — currently there is no answer from the product.

**Fix:** Add `enterprise_contracts` table with fields:
`dpa_version TEXT`, `dpa_signed_at TIMESTAMPTZ`, `msa_reference TEXT`,
`sla_tier TEXT`, `data_residency_confirmed BOOLEAN`.
Sprint 8 (Governance Intelligence) is the natural home.

### Blocker 3 — IRAP mentioned once, not scoped (documentation gap)

IRAP (Information Security Registered Assessors Program) is required for any AU
government customer. The LLD mentions it once in the Enterprise tier description.
The actual IRAP process takes 6-12 months and must begin at v1 launch, not as a
reactive measure. There is no sprint, no cost estimate, and no preparation checklist.

**Fix:** Add an IRAP preparation task to Sprint 12 (alongside the SOC 2 kickoff):
identify an IRAP assessor, scope the assessment, begin the security documentation
process. This is not a code change — it is a business process that must start on day 1.

**What is NOT a blocker (correctly handled):**
- SOC 2 Type 1 by Month 12 — correctly scoped in Sprint 12
- Data residency Supabase Sydney — contractually guaranteeable from day 1
- Audit trail — present in Layer 7
- RBAC 4-role system — sufficient for enterprise requirements

---

## Features to Remove from v1

| Feature | Reason |
|---|---|
| `google_ai_mode_results` (as UX feature) | Google AI Mode data quality for AU is thin. Including it at Growth level creates a dashboard slot that confuses rather than informs. Keep the table (data has future value), disable the UI until v1.2. |
| `query_fan_out_results` (as UX feature) | Sub-query methodology is infrastructure. Customers want the insight ("AI asks 8 questions about roofing where you have no content"), not the raw sub-queries. Show the insight. Hide the data. |
| `conversation_journeys` for Free/Starter/Growth | A multi-turn AI conversation journey is an enterprise research tool. Keep the table. Gate the UX to Agency Pro only. |
| `brand_consensus_checks` from default dashboard | Useful as a background quality signal. Not a daily-use feature. Move to advanced/expert view. Remove from the default Growth dashboard layout. |

---

## Features to Delay to v1.1

| Feature | Delay reason | When |
|---|---|---|
| `youtube_presence_audits` UI | YouTube Data API cost + complexity; core value proposition doesn't depend on it. Build the table (Sprint 5); delay the UX. | v1.1 Month 8 |
| `linkedin_presence_audits` for SMB tier | LinkedIn scraping ToS risk; most AU tradies don't have LinkedIn. Relevant for SaaS and professional services only. | v1.1 Month 8 |
| ROI revenue projection (revenue potential layer) | Needs real GA4 data to be honest. Build GA4 integration (Sprint 9); delay revenue projection UI until real data accumulates. | v1.1 Month 8 |
| UK/Canada market launch | Prompt rebuild required; not revenue-ready at v1 pace | Month 12+ |
| Full `conversation_journeys` UX | Build the data model (Sprint 7 as planned); delay the UX until agency feedback confirms demand | v1.1 |

---

## Features to Accelerate

| Feature | Move from | Move to | Why |
|---|---|---|---|
| **Citation Failure Diagnosis** | Sprint 3, item 7 | Sprint 2, primary deliverable | Highest-urgency customer question; already computable from Phase 1 data; drives conversion and upgrade |
| **Competitive Benchmark tab** | Sprint 9 | Sprint 3 alongside SoV | Agency upgrade trigger; needs to exist when SoV data exists |
| **Action Progress Tracker** | Not in LLD | Sprint 6 | Retention driver; trivial to build (one count query); highest ROI per hour of engineering |
| **Local AI Trust Radius composite** | Not in LLD | Sprint 6 | AU SMB positioning centrepiece; all component data ready in Sprint 5-6 |
| **Health Check packaging** | Sprint 10 (implicit) | Sprint 10 (explicit UX spec) | Aha moment for every new user; the same data needs intentional presentation |
| **"Autopilot" UX framing** | Not in LLD | Sprint 9 | Positioning change costs nothing; changes product perception entirely |

---

## Final Scores — Overall Product Score, Market Opportunity, Differentiation, Monetisation, CX

| Dimension | Score | Notes |
|---|---|---|
| Overall Product | **7.5/10** | Strong platform; CX is the constraint |
| Market Opportunity | **9/10** | AU GEO market is real, early, and defensible |
| Differentiation | **8/10** | AU specificity + execution layer are genuine moats |
| Monetisation | **6.5/10** | Revenue potential underworked; tier logic is solid but unclear UX |
| Customer Experience | **6/10** | Will improve dramatically with 3 UX changes |

---

## Top 10 Improvements

1. **Redesign the Growth dashboard to show ONE score above the fold.** AI Visibility
   Score 0-100, trend direction, one action. Everything else is a drill-down. The
   current design gives equal visual weight to 20 data points — which means customers
   weight them all equally at zero.

2. **Accelerate Citation Failure Diagnosis to Sprint 2 and lead the marketing with it.**
   "Find out in 60 seconds why AI recommends your competitor instead of you" is the
   headline. The feature is already computable from Phase 1 data. Currently scheduled
   as Sprint 3 item 7. This is the single biggest misallocation in the sprint plan.

3. **Add per-sprint Explainability Specs as acceptance criteria.** Every Phase 2 sprint
   must answer the 5 questions (Where/Why/What/Impact/Confidence) for each feature it
   ships. These go in the acceptance criteria, not in a philosophy statement. A Vitest
   that fails on empty `rationale` fields enforces this.

4. **Add Action Progress Tracker to Sprint 6.** One query. One metric. "4 of 11 gaps
   closed this month. Your citation rate improved 8%." The LLD tracks task completion
   in `remediation_tasks.status` but never shows the customer they're making progress.
   This is the most important retention feature not currently in the LLD.

5. **Build Local AI Trust Radius as a derived composite score in Sprint 6.** All four
   component data sources (GMB, directories, ABN, citations) exist by Sprint 5-6.
   One weighted formula, one number, one card for AU local businesses. "Local AI Trust:
   67/100 — AI recommends you locally 67% as often as your top competitor."

6. **Add Competitive Benchmark Workspace tab to Sprint 3.** The data (SoV, comparison
   prompts, topical gaps) all lands in Sprint 3-7. The workspace synthesises it in one
   view per competitor. Growth: 1 competitor. Agency: 3 competitors. Agency Pro: unlimited.
   This is the agency retention anchor feature and currently has no UX specification.

7. **Rename Sprint 9 from "Adaptive Segment-Aware UX" to "AI Visibility Autopilot".**
   The data model already enables automation. The UX must demonstrate one complete
   automated loop (Audit → Gap → Draft → Approve → Re-audit → Lift shown). The name
   change costs nothing and changes how every downstream decision is made.

8. **Gate `conversation_journeys` UX to Agency Pro.** It's a sophisticated feature that
   requires competitor data and multi-turn LLM execution. Growth customers (solo SMBs
   and small SaaS) will not use it. Build the table (Sprint 7); delay the UX to Agency
   Pro launch.

9. **Operationalise the DPA in Sprint 8.** Add `enterprise_contracts` table with DPA
   version tracking, MSA reference, and sign-date. Without this, the first enterprise
   procurement conversation will hit a wall at "show me the DPA governing my data."

10. **Add a Health Check UX spec to Sprint 10.** The first post-audit experience must
    be labelled and presented as "Your AI Visibility Health Check" — not an audit
    results page. Traffic-light status per section. One recommended action. This is
    the aha moment that converts trial users into paying customers.

---

## Top 10 Risks

1. **Information overload kills SMB adoption.** The Growth dashboard currently has
   20+ data points. Most AU tradies will close the app within 5 minutes. The fix is
   a strict UX hierarchy, not more features. This is the highest-probability failure mode.

2. **34 weeks of solo weekend development with accumulating schema debt.** One
   significant design decision discovered late (say, Sprint 7) can cascade backwards
   and invalidate Sprint 2 work. The sprint ordering (Workflow Sprint 2, Visibility
   Sprint 3) means the customer-facing features come before the intelligence features —
   which is correct — but also means the execution layer exists before the intelligence
   that feeds it.

3. **Latency of Phase 2 insights is invisible in the onboarding experience.** Most Phase
   2 intelligence (LinkedIn audits, YouTube audits, consensus checks) runs weekly or
   monthly. A customer who runs their first audit on Day 1 will not have meaningful Phase
   2 intelligence for 4 weeks. The onboarding experience says nothing about this. That is
   a setup for Week 4 churn when Phase 2 features don't appear to be doing anything.

4. **AU prompt pack freshness.** 336 prompts seeded at Sprint 5. AI search evolves fast.
   By Month 12, a meaningful portion of prompts may not reflect current AU search
   behaviour. There is no automated prompt refresh mechanism in the LLD.

5. **GA4 dependency makes ROI Intelligence unavailable to the most natural customers.**
   Most AU tradies and allied health professionals have no GA4. The most commercially
   compelling feature for agencies depends on infrastructure the SMB customer base
   typically lacks. Solve by showing industry benchmarks when GA4 is not connected —
   clearly labelled as estimates, not measurements.

6. **Competitor response.** Semrush (now Adobe) has the engineering depth to build AU
   vertical packs in 3 months if they observe VisibleAU gaining traction. Profound
   could add AU prompts as a localization sprint. The moat is early customer
   relationships and AU-specific institutional knowledge, not the code.

7. **LLM cost exposure on margin.** All Phase 2 LLM costs are estimated in USD against
   AUD-denominated revenue. A 20% USD appreciation or OpenAI pricing change can hit
   83-90% gross margins before repricing is possible. The BudgetPolicyService guards
   against runaway costs, but the FX exposure is unhedged.

8. **"Court-admissible" claim needs legal review before any marketing use.** The LLD
   describes `evidence_snapshots` as "court-admissible." Making this claim in marketing
   without a lawyer reviewing the evidence preservation methodology is both a
   reputational and legal risk. Change to "legal-grade" or "audit-ready" until reviewed.

9. **IRAP preparation hasn't started.** The first AU government or hospital enterprise
   customer will require IRAP alignment. That process takes 6-12 months. If it starts
   at the point of the first enterprise enquiry, VisibleAU will lose 6-12 months of
   potential revenue while the process completes. It must start at v1 launch.

10. **White-label PDF quality is the highest-churn risk in the agency tier.** The
    PDF report is the primary reason agencies stay. If the AI-generated narrative is
    generic ("Your brand has an AI visibility score of 67, which indicates moderate
    visibility"), agencies will stop using VisibleAU before the client relationship
    is established. The report template and `generate-narrative-report.ts` quality need
    a dedicated review sprint before any agency customer sees them.

---

## Top 10 Revenue Opportunities

1. **AU Agency GEO Service Line — A$10K–45K MRR at 20-30 agencies.**
   At Agency A$499 – Agency Pro A$1,499. Each agency client saves 2-4 hours/month
   on reporting. Direct cost saving = direct ROI = easy renewal conversation.

2. **Citation Failure Diagnosis as standalone one-off report — A$29.**
   No account required. "Why isn't AI recommending me?" as a purchasable PDF.
   Converts to Starter subscriptions at the moment of maximum urgency.

3. **ASX-listed brand hallucination monitoring — A$5,000+/mo.**
   One hallucination about Medibank's health cover policy is a compliance incident.
   A single enterprise contract at A$5,000/mo funds 3 months of development.

4. **Allied Health compliance package — A$299/mo (Growth positioned specifically).**
   AHPRA-registered practitioners need AI visibility monitoring that understands
   Section 133 testimonial restrictions. VisibleAU's existing AU knowledge is a moat.

5. **White-label GEO reporting reseller programme.**
   AU digital marketing agencies can resell VisibleAU under their brand. Revenue share
   model. Uses existing white-label PDF infrastructure. No additional engineering.

6. **AU government tender response.**
   IRAP-aligned offering. A single government contract could be A$50K-200K annually.
   Requires the 12-month IRAP groundwork starting now.

7. **Vertical-specific prompt packs as paid add-ons — A$49/mo.**
   "AU Financial Services prompt pack", "AU Real Estate prompt pack". Low marginal cost.
   High perceived value for verticals not covered by the base 3.

8. **Annual enterprise pre-payment (12 months upfront at 15% discount).**
   Cash flow to hire a second developer and accelerate the roadmap. One A$50K annual
   prepayment covers significant development capacity.

9. **"AI Visibility Audit" productised consulting — A$1,500–3,000.**
   A human-reviewed 30-page report using VisibleAU data, sold as a one-off engagement.
   Funds early growth while SaaS scales. Generates product feedback from real customers.

10. **Integration partnerships with AU digital marketing platforms.**
    Campaign Monitor, HubSpot AU, or Canva for Agencies as distribution channels.
    Each integration creates a referral pathway to VisibleAU's natural customer base.

---

## Final Recommendation — Single Most Important Thing

**The product is built around what VisibleAU can measure, not around what customers
will pay to know.**

Before Phase 2 build begins, answer these three questions for each of the three
primary personas, and evaluate every sprint against them:

**For the AU tradie (plumber, electrician, builder):**
> "Why is [competitor] showing up when people ask AI for a plumber in my suburb, and I'm not?
> And what's the one thing I can do about it today?"

**For the AU agency (5-25 brand accounts manager):**
> "Show me a report I can send to my client tomorrow morning that demonstrates their AI
> visibility position versus their top 3 competitors — with my logo on it."

**For the AU enterprise (ASX-listed brand, hospital, government agency):**
> "Show me every time AI said something inaccurate about our brand this month, with
> evidence I can take to legal, and a remediation plan with a measurable outcome."

Every one of these three questions is answerable with the current LLD data model.
None of them is answered by the current UX specification.

The data model is built for what VisibleAU needs to be.
The UX must now be rebuilt for what customers need to feel.

---

*Prepared June 2026. All feature presence/absence claims verified against LLD v8.18
(6,011 lines, 37 Phase 2 tables, 16 GAPs, 7 layers) before writing. No claim is
based on assumption — all are based on direct LLD content.*
