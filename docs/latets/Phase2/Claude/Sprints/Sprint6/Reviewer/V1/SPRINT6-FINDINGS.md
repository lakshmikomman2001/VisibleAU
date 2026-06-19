# VisibleAU Phase 2 — SPRINT 6 PROMPT: GATE 2 FINDINGS
# Reviewer: independent reviewer chat | Date: June 2026
# Reviewing: visibleau-p2-sprint-6-prompt.md v1.0 (Retrieval Intelligence + Agent Readiness, Layer 1)
# Canon used: visibleau-phase2-v8_65-complete-REVIEWED-r2 (authorized — v8.66 changed only the
#   prototype reduced-motion reset + LLD changelog; the Layer 1 regions are identical). The
#   prompt's v8.66 anchors map to r2 at ≈ −29; verified by content, not line number.

---

## 1. VERDICT — **PASS-WITH-FIXES** (one MODERATE + two LOW-MOD; plus two LLD-level security escalations)

A strong, faithful prompt for a large security-sensitive sprint. The three builder-flagged
high-risk areas are **clean**: the structural traps (C2 — all five verified), the PUBLIC Visit
API route (C4 — the prompt reproduces the LLD's VA-01/BT-01/MW-01 spec verbatim), and the
S4→S6 wiring (C6 — the last two slots, confirmed against the LLD's 12-section enum). The
findings: a crawler-log write-semantics contradiction (S6-01, the one to fix), a
freshness-enum/formula mismatch on the headline metric (S6-02), and the §1 under-enumeration
pattern recurring (S6-03). Separately, two security-hardening items on the public route — which
the prompt copies faithfully from the LLD — are escalated to Sri at the LLD level.

---

## 2. FINDINGS

### S6-01 — [MODERATE] crawler-log-ingest is told to "UPSERT" an append-only table
- **What the prompt says:** §8.1 — "crawler-log-ingest.ts … Parses → **UPSERT** crawler_visit_logs".
- **What the LLD says:** crawler_visit_logs is **APPEND-ONLY** — "append-only (not UPSERT) — no
  UNIQUE needed, correct" (LLD 2035). I confirmed the table body has **no UNIQUE constraint**
  (only three indexes, incl the partial `crawler_logs_purpose_idx`); each crawler visit is a
  distinct log event.
- **Why it matters:** an UPSERT (`INSERT … ON CONFLICT`) needs a conflict target — there is
  none. Taken literally, a builder either (a) errors (no conflict target) and has to reverse-
  engineer the intent, or worse (b) invents a UNIQUE key (e.g. brand_id+crawler_name+visited_at)
  that **wrongly collapses distinct visits into one row** — destroying the visit-frequency data
  that is the entire point of a visit log. This is the inverse of S6's own agent_readiness
  append-only rule, applied to the wrong table.
- **Required fix:** §8.1 → **INSERT** (append a new row per visit), not UPSERT. Add a §0.5 line
  ("crawler_visit_logs is append-only — no UNIQUE, no ON CONFLICT") and a §12 grep paralleling
  the agent_readiness one: `grep -ic "on conflict\|onConflict" inngest/functions/crawler-log-ingest.ts → 0`.
  (If de-duplication between the active-snippet path and the passive-log-import path is actually
  wanted, that's an LLD change — add a UNIQUE key — and should be escalated, not assumed.)

### S6-02 — [LOW-MODERATE] freshness_risk enum (4-tier) doesn't map cleanly to the citation_probability contribution (3-tier)
- **What I found (an LLD-internal inconsistency the prompt inherits):**
  - The **column enum** (§0.5, LLD 5211) is **4-tier**: `fresh (<30d) | aging (30–60d) | at_risk
    (60–90d) | stale (>90d)`.
  - The **citation_probability freshness contribution** (§6.2, LLD 5233) is **3-tier with
    different names**: `current(+0.10) | ageing(+0.05) | stale(0.00)`.
- **The gap:** `at_risk` (60–90d — a common page state) has **no defined citation_probability
  contribution**, and the names don't line up (`current` vs `fresh`; `ageing` vs `aging`). A
  builder implementing citation-probability-scorer must guess what `at_risk` contributes and
  reconcile the names. This is the **headline** metric of the content-audit UI (green/amber/red),
  so the ambiguity is on the most visible number.
- **Required fix:** in §6.2, give the explicit 4→contribution mapping for citation-probability-
  scorer, e.g. `fresh→+0.10, aging→+0.05, at_risk→+0.025 (or +0.00), stale→0.00`, using the
  column's enum value names. **Escalate to Sri** the LLD-internal mismatch (the citation_probability
  comment at LLD 5233 uses a 3-tier `current/ageing/stale` while the column at LLD 5211 is the
  4-tier `fresh/aging/at_risk/stale`) so the LLD reconciles them.

### S6-03 — [LOW-MODERATE] §1 under-enumerates the lib modules (the S1-02/S2b-01/S3-01 pattern recurs)
- **What the prompt says:** §1 (line 105) — "**8 lib modules** (§6) under `lib/retrieval/` + the
  local-ai-trust-scorer (lib/platform)."
- **What §6 / the §4 tree actually specify:** **10** lib/retrieval/ modules — crawler-log-parser,
  visit-classifier, content-auditor, content-format-advisor, citation-probability-scorer,
  entity-home-auditor, llmstxt-generator, agent-readiness, mcp-checker, retrieval-scorer — **plus
  2** lib/platform/ modules (local-ai-trust-scorer **and** explainability; §1 names only the first).
- **Why it matters:** this is exactly the §1-vs-tree under-enumeration that earlier sprints fixed
  (S4 and S5 held the line); it resurfaces here. The §4 tree/§6 are authoritative so Claude Code
  builds all 10, but §1 is meant to be the complete enumeration — and the project's own history
  ties this pattern to under-built deliverables.
- **Required fix:** §1 → "**10 lib modules** under `lib/retrieval/` + **2** under `lib/platform/`
  (local-ai-trust-scorer + explainability — the latter if not already present)."

---

## 3. SECURITY ESCALATIONS — the PUBLIC Visit route (LLD-level, NOT prompt bugs)
The prompt's §9.1 reproduces the LLD's VA-01/BT-01/MW-01 spec **verbatim** (isPublic matcher,
Zod-validate → brand lookup → 401 → per-token rate-limit → emit visit/ingested → 202), so the
prompt is faithful. But the handoff explicitly asks me to scrutinize this new public surface, and
two characteristics of the **LLD design** are worth hardening (escalate to Sri; they apply to the
LLD's Visit-route spec, which the prompt correctly mirrors):

- **SEC-A [LOW] — the posted `url` is not validated against the brand's domain.** The Zod schema
  checks `url: z.string().url()` (any valid URL), not that its host belongs to the brand's
  registered domain. A token-holder (the token is necessarily public — it ships in the
  browser snippet) can post visits for arbitrary URLs, polluting crawler_visit_logs. Suggest
  validating `new URL(body.url).host` against `brand.domain` (and known subdomains) before ingest.
- **SEC-B [LOW-MOD] — rate-limit ordering + scope on the public endpoint.** The LLD order is
  brand-token **DB lookup (step b) → rate-limit (step c)**, and the rate-limit is **per-token
  only**. So a flood of *invalid* tokens never hits the per-token limit (no valid token to key on)
  and each request still triggers a DB SELECT — an un-throttled DB-amplification path on an
  unauthenticated endpoint. Suggest an **IP-based throttle before the brand lookup** (and/or a
  short-TTL negative cache for unknown tokens) so abusive traffic is shed before the DB. This is a
  Performance/Security/Scalability item per the standing non-negotiables.

(Not flagged: the token being public is inherent to client-side analytics — like a GA measurement
ID — and is an accepted self-serve tradeoff; the 202-immediate + Inngest-offload design is good.)

---

## 4. RULINGS / OPEN-QUESTION CHECK
No OPEN QUESTIONS block. Forward dependencies are correctly scoped: the crawler reuse
(`lib/crawler/index.ts` is Sprint 7 — §13 says scaffold the shared one if S7 isn't built, do NOT
fork; matches LLD 3280); score-agent-readiness + audit-entity-home on `technical-audit/complete`
(slash) with the S7 dual-emit note (SR-01/AE-01, LLD 5715); agent/readiness-scored consumed by S8
fanout-webhooks (forward, WH-01d). Trivial optional LLD-hygiene (not a prompt bug): the LLD file
inventory at 8069 mislabels the GAP-8 engine module `content-format-selector.ts`; the canonical
module spec (LLD 5731/5740) and the prompt both correctly call it `content-format-advisor.ts`
(distinct from the real `lib/workflow/content-format-selector.ts`, LLD 7937).

---

## 5. CLEAN — independently derived against the LLD/prototype
- **C1 schema (4 tables + brand_token ALTER) — verbatim ✓.** crawler_visit_logs (3 indexes incl
  the partial purpose idx; no UNIQUE — see S6-01), content_structure_audits (the GAP-8 + entity-
  home cols, UNIQUE(brand_id,page_url)), llmstxt_versions (the partial one-current index),
  agent_readiness_scores (the 5 dims + local_ai_trust_score), and `ALTER brands ADD brand_token
  TEXT UNIQUE` + nanoid(32) backfill (LLD 5637–5638 verbatim).
- **C2 structural traps (highest-value) — all five PERFECT ✓.** (a) agent_readiness_scores
  APPEND-ONLY (U-13, LLD 1997–2010); (b) llmstxt_versions partial unique one-current + the
  set-others-false transaction (LLD 3500/5321); (c) content_structure_audits UPSERT on
  UNIQUE(brand_id,page_url) (LLD 5315/5692); (d) entity_clarity_score ≠ score_of_10 (renamed to
  avoid the collision, LLD 5386/3587); (e) local_ai_trust_score NULL for SaaS (LLD 2193).
- **C3 score formulas — ✓.** The 5 agent-readiness dimensions each /20 with the exact point
  breakdowns (LLD 5386–5413: entity_clarity 5/4/4/4/3, verify 5/5/min4/min3/3, authority TCG→8 /
  rate×6 / div6, task 5/5/5/min5, tech sums to 20); citation_probability contributions (LLD
  5232–5237, author +0.04, ~0.85 ceiling — except the freshness tier mapping, S6-02);
  FORMAT_BY_ENGINE (LLD 5746–5752: chatgpt listicle/expert_article, gemini how_to_guide,
  perplexity listicle/faq_block) + the 3:1 listicle:how-to rule.
- **C4 the PUBLIC Visit route — faithful to the LLD ✓.** §9.1 reproduces VA-01/BT-01/MW-01
  verbatim (LLD 5655–5672): the exact isPublic list + the five steps (Zod → brand lookup → 401 →
  per-token rate-limit → emit visit/ingested → 202) + the brand_token backing + the snippet.
  (Hardening = §3 escalations, not a fidelity defect.)
- **C5 Inngest (5 fns) — ✓.** crawler-log-ingest (visit/ingested), content-structure-audit (cron
  0 22 * * 3, REUSE crawler, UPSERT), llmstxt-refresh (cron 0 3 1 * *, one-current txn),
  score-agent-readiness (technical-audit/complete slash, emits agent/readiness-scored),
  audit-entity-home (technical-audit/complete slash, Action Center sameAs<3, LLD 5722) + the
  guarded retention extension (crawler_visit_logs >90d, LLD 5187). serve() running total **23**
  (3+6+2+7+5); the master plan confirms S7 adds the final 2 → 25.
- **C6 the S4→S6 wiring (the last two slots) — CORRECT ✓.** LLD 8123–8125 + 8136/8140 show
  `entity_home_status` and `agent_readiness` are exactly the two remaining `include:false` slots;
  §0.2/§6.7 wire content_structure_audits entity_home_* → entity_home_status and
  agent_readiness_scores → agent_readiness. After this all 12 S4 sections are wired.
- **C7 explainability + RLS — ✓.** The explainability contract (rationale/confidence_label/
  confidence_note/top_action via ExplainabilityService.annotate, LLD 2215) on every score-bearing
  route; setRlsContext on every protected route (LLD 1586); cross-org → 404, unauthenticated →
  401, the Visit route the one documented public exception.
- **C8 UI — ✓.** RetrievalHub anchor lands (prototype 2537); citation_probability as the HEADLINE
  (green/amber/red, not buried); visit_purpose badges; the agent-readiness spider gauge + MCP card
  + local-AI-trust hidden/NULL for SaaS; STATES + RESPONSIVE per screen; Retrieval hub Starter+,
  is_active_agent tracking Growth+.
- **C9 template/depth — ✓ except the count (S6-03).** Sections 0–14 + §6U; §12 greps mostly sound;
  §10 self-contained. (The §1 lib-module enumeration is the S6-03 finding.)

---

## 6. NEXT STEP
- **S6-01** (crawler-log-ingest → INSERT, not UPSERT; add the no-ON-CONFLICT grep) — MODERATE, the
  one to fix; a literal read produces a data bug.
- **S6-02** (map all 4 freshness_risk values in §6.2; escalate the LLD 5211-vs-5233 mismatch) — LOW-MOD.
- **S6-03** (§1 → 10 lib/retrieval + 2 lib/platform) — LOW-MOD.
- **SEC-A / SEC-B** (Visit-route hardening) — escalate to Sri as LLD changes; the prompt is faithful.
With S6-01 fixed (and ideally S6-02/03), Sprint 6 is ready for Claude Code. The traps, the public-
route spec, the formulas, and the S4→S6 wiring are all correct.

**Forward note for Sprint 7 (Conversational Discovery Intelligence, Layer 4):** S7 builds the
canonical `lib/crawler/index.ts` Playwright infra **and** technical-audit-run.ts that S5/S6 already
depend on — so verify it emits BOTH `technical-audit.complete` (dot, webhooks) AND
`technical-audit/complete` (slash, internal), which refresh-entity-score (S5), score-agent-readiness
(S6) and audit-entity-home (S6) all listen on. S7 also fills the CPR-01 "Coming soon" comparison
data (comparison_prompt_results). Confirm S7's §1 enumeration matches its §4 tree (S6-03 recurred —
watch it), and that the new tables' Inngest events have matching producers/consumers.

— End of SPRINT6-FINDINGS.md
