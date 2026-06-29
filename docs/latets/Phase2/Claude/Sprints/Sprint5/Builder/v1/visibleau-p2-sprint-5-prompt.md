# VisibleAU Phase 2 — SPRINT 5 PROMPT: Trust Intelligence
# Version: 1.0 | Built against: LLD v8.66 (REVIEWED-r2) | Sprint: 5 of 9 | 4 weeks
# Source anchors (r2/v8.66): Sprint 5 plan (~8946), Layer 3 §"TRUST INTELLIGENCE" (~6716),
# tables hallucination_incidents 6755, evidence_snapshots 6826, brand_entity_scores ALTER
# 6850, citation_source_intelligence 6897, linkedin_presence_audits 6974,
# brand_consensus_checks 7024, youtube_presence_audits 7082; CT-04 risk formula (~6793),
# Inngest specs (~7140), lib modules (~7300), API routes (~7110), MI-01 (~8645), RLS (~8629),
# prototype TrustHub (2370). NOTE: line numbers are navigational — open the region; LLD wins.

> HOW TO USE: read §0, then paste §10 into a fresh Claude Code session on the VisibleAU
> repo. §1–§9 are the spec; §11–§14 are tests/acceptance/pitfalls/handoff. When this prompt
> and the LLD disagree, THE LLD WINS and this prompt is the bug.

---

## 0. READ FIRST — CONTEXT & CONVENTIONS

### 0.1 What Sprint 5 is
**Trust Intelligence (Layer 3)** — the trust + authority layer, and the **payoff sprint for
Sprint 4**: it creates the tables whose absence left S4's report sections + alerts dormant,
and **wires their reads into S4's narrative-generator slots + the alert-composer triggers**.
Ships: hallucination detection (with the read-time risk score), the immutable evidence
archive, monthly entity-authority scoring (registry + Wikipedia + directories + Knowledge
Panel + Wikidata — the brand_entity_scores ALTER), citation source intelligence (GAP 4 L3
half), LinkedIn presence (GAP 7), cross-platform consensus (GAP 10), Knowledge Panel (GAP 11),
Wikidata (GAP 13), and YouTube presence (GAP 16). (LLD 8946–8964.)

### 0.2 Prerequisites & the S4→S5 wiring contract (do this — it's the point of the sprint)
Sprints 1–4 merged. S5 reads S1's budget service + `selectModel()`, Phase 1's
brand_entity_scores (the ALTER target) + citations, and Phase 1 Sprint 8's `drift/detected`.
**It must close the S4 forward slots:**
- Wire each S5 table's read into the **S4 narrative-generator** typed slots:
  linkedin_presence_audits → linkedin_performance; brand_consensus_checks → consensus_score;
  brand_entity_scores (knowledge_panel_* cols) → knowledge_panel_status;
  citation_source_intelligence → source_type_gaps; evidence_snapshots → evidence_snapshots
  (Agency+). (entity_home_status + agent_readiness remain S6 slots.)
- Wire the **S4 alert-composer** triggers: detect-hallucinations → the hallucination alert;
  check-cross-platform-consensus (score < 60/70) → the consensus alert. (Drift + volatility
  were already wired in S4 from Phase 1 / S3.)

### 0.3 Verify you are on the right LLD before starting
```bash
grep -m1 "^# Version:" visibleau-7layer-lld.md          # → # Version: 8.66 (or 8.65 — both valid) | Date: June 2026
grep -cE "ATTRIBUTION CORRECT(ED IN CROSS-REVIEW|ION)" visibleau-7layer-lld.md   # → ≥1
```
Canon is `visibleau-phase2-v8.66-complete-REVIEWED` (v8.65 r2 also valid — v8.66 changed only
the prototype reduced-motion reset). If version is below 8.65 or marker count is 0, STOP.

### 0.4 SHARED CONVENTIONS (binding; from master plan §7)
- **Better Auth** canonical; **zero Clerk**. Page routes `[brandId]`; API routes `[id]`.
- **`subscriptions.tier`**, never `organizations.tier`. **TIER_ENGINES** governs engine
  counts. **`selectModel(tier, engine, useCase)`** for every LLM call — never hardcoded.
- **MI-01 migration idempotency (v8.29):** whole migration re-runnable — `CREATE TABLE IF NOT
  EXISTS`, `CREATE INDEX IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS` (the ALTER), `DROP POLICY
  IF EXISTS "<name>" ON <table>;` before each `CREATE POLICY`.
- **RLS** USING + WITH CHECK on every tenant table (all 6 new tables carry organization_id →
  all get RLS). **brand_entity_scores** is a Phase 1 table whose Phase 1 RLS is enforced via a
  JOIN to brands; the ALTER ADDS a nullable organization_id (backfilled) but **do not change
  its existing RLS posture** unless the LLD's RLS spec lists it — follow the spec at ~8629.
- `LLM_MODE=mock` in all tests.
- **Tier gates:** Trust hub = **Growth** (master plan §7); evidence_snapshots are **Agency+**
  (creation + view); citation-sources panel is Growth+. Entity score is Priority 1 for
  SMB/tradie (no gate beyond the hub).
- **UI** token-driven (dark + `[data-theme="light"]`; `color-mix` for faint fills, RT-01;
  `--focus-ring`/`--elevation`; `tabular-nums`; ARIA per FIX 13; reduced-motion reset from S2).

### 0.5 The read-time derivations + enums + UPSERT rules Sprint 5 introduces (copy EXACTLY)
- **Hallucination Risk is READ-TIME — NO risk column (CT-04, LLD 6793).** The TR-1 Trust-hub
  /100 card is derived: `risk = LEAST(100, 15×open_critical + 5×open_warning + 1×open_info)`
  where **open = `is_false_positive = false`** (acknowledging does NOT close an incident — only
  a false-positive determination does). Pure function in `lib/trust/hallucination-risk.ts`;
  "lower is better (0 = safe)". Fixture: 1 critical + 1 warning open → 20. Do NOT add a column.
- `hallucination_incidents.claim_type` = wrong_price | wrong_location | wrong_product |
  wrong_founder | competitor_confusion | other. `severity` = critical | warning | info.
  Two independent flags: `is_acknowledged` (team saw it) and `is_false_positive` (AI was
  actually right) — a row can be acknowledged-but-genuine or acknowledged-and-dismissed.
- `citation_source_intelligence` — **audit_id is NULLABLE, so a single UNIQUE(...) is wrong**
  (Postgres NULL≠NULL). Use **TWO partial unique indexes** (LLD 6960): `csi_unique_with_audit
  (brand_id, audit_id, engine, source_type) WHERE audit_id IS NOT NULL` and
  `csi_unique_aggregate (brand_id, engine, source_type) WHERE audit_id IS NULL`. gap_severity =
  critical (>20% citations, brand absent) | warning (10–20%) | opportunity (<10%) | covered.
- `brand_consensus_checks` has **UNIQUE(brand_id, source_type)** and the monthly cron MUST
  **UPSERT** (`ON CONFLICT (brand_id, source_type) DO UPDATE`) — plain INSERT fails month 2
  (CU-01, LLD 7244). source_type = website | google_business_profile | local_directory |
  linkedin | reddit | wikipedia | review_site.
- **FK ON DELETE:** hallucination_incidents.citation_id SET NULL (trust record outlives
  citation — HI-01); evidence_snapshots.audit_id SET NULL (immutable archive survives audit
  purge); citation_source_intelligence.audit_id **CASCADE** (per-audit analytics).
- **brand_entity_scores ALTER: do NOT add `entity_score`** — Phase 1 `score_of_10` is the
  canonical entity score (D-01). Do NOT add `scored_at` — Phase 1 `checked_at` exists.

---

## 1. WHAT SHIPS THIS SPRINT
- 6 new tables (§5): hallucination_incidents (#19), evidence_snapshots (#20),
  citation_source_intelligence (#22), linkedin_presence_audits (#23), brand_consensus_checks
  (#24), youtube_presence_audits (#25) + the **brand_entity_scores ALTER** (#21 — nullable
  cols for org/market/directories/knowledge-panel/wikidata).
- 2 mandatory seeds (§5.8): `citation-source-affinity` (the per-source_type
  `source_affinity_note` static lookup — 8 types) and the consensus/entity nothing-extra.
- 7 Inngest functions (§8): detect-hallucinations, capture-evidence-snapshot,
  refresh-entity-score (monthly), build-citation-source-intelligence, audit-linkedin-presence
  (monthly), check-cross-platform-consensus (monthly), audit-youtube-presence (monthly) — all
  registered in `serve()`.
- 11 lib modules (§6) under `lib/trust/`.
- The **S4 wiring** (§0.2) — narrative-generator slots + alert-composer triggers.
- 8 screens (§6U) under the Trust hub + the per-GAP components.
- API routes (§9): trust summary + per-GAP GET/refresh + hallucination acknowledge PATCH.
- **GAP coverage:** 4 (citation sources, L3 half), 7 (LinkedIn), 10 (consensus), 11
  (Knowledge Panel), 13 (Wikidata), 16 (YouTube).

---

## 2. DEPENDENCIES TO INSTALL
`cheerio` (LinkedIn public-page parsing — confirm whether S3's brand-mention-tracker already
added it; reuse if so). No other new runtime packages. YouTube uses the YouTube Data API v3
over HTTP (no SDK needed).

## 3. ENVIRONMENT VARIABLES (additions)
- `YOUTUBE_API_KEY` (K-05) — YouTube Data API v3 for audit-youtube-presence.
- Registry/Knowledge-Panel/Wikidata checks use public APIs (ABN Lookup, SERP/structured-data,
  Wikidata API) — confirm whether any require a key; if a SERP provider key is needed for the
  Knowledge Panel check, document it (do not hardcode). LinkedIn = public-page scraping in
  Phase 2 (no key; brand provides company_page_url + founder_profile_url).

---

## 4. PROJECT STRUCTURE ADDITIONS
Every file below is specified in §5–§9 / §6U. No file appears without a spec.
```
db/
├── schema/
│   ├── hallucination-incidents.ts · evidence-snapshots.ts · citation-source-intelligence.ts
│   ├── linkedin-presence-audits.ts · brand-consensus-checks.ts · youtube-presence-audits.ts
│   └── brand-entity-scores.ts            // EDIT Phase 1 schema: add the nullable ALTER cols
├── migrations/
│   ├── 00NN_phase2_sprint5_trust.sql     // 6 CREATEs (IF NOT EXISTS) + indexes + RLS
│   └── 00NN_phase2_sprint5_entity_alter.sql  // brand_entity_scores ALTER (ADD COLUMN IF NOT EXISTS) + backfill
└── seed/
    └── citation-source-affinity.ts       // §5.8 (8 source_type affinity notes)

lib/trust/
├── hallucination-detector.ts · hallucination-risk.ts   // §6.1 (detector + read-time risk)
├── entity-checker.ts · knowledge-panel-checker.ts · wikidata-checker.ts  // §6.2 [GAP 11/13]
├── evidence-archiver.ts · trust-scorer.ts              // §6.3
├── citation-intelligence.ts                            // §6.4 [GAP 4]
├── linkedin-auditor.ts · consensus-checker.ts · youtube-auditor.ts  // §6.5 [GAP 7/10/16]
└── index.ts

inngest/functions/
├── detect-hallucinations.ts        // §8.1 event 'audit/complete', emits 'hallucination/detected'
├── capture-evidence-snapshot.ts    // §8.2 event 'audit/complete', Agency+
├── refresh-entity-score.ts         // §8.3 event 'technical-audit/complete' [GAP 11/13]
├── build-citation-source-intelligence.ts  // §8.4 event 'citations/classified' [GAP 4]
├── audit-linkedin-presence.ts      // §8.5 cron '0 3 2 * *' [GAP 7]
├── check-cross-platform-consensus.ts  // §8.6 cron '0 3 4 * *' [GAP 10]
└── audit-youtube-presence.ts       // §8.7 cron '0 3 3 * *' [GAP 16]

app/(auth)/brands/[brandId]/trust/
├── page.tsx · hallucinations/page.tsx · evidence/page.tsx · citation-sources/page.tsx
├── linkedin-presence/page.tsx · consensus/page.tsx · entity-score/page.tsx · youtube-presence/page.tsx
components/domain/trust/   (the 14 components listed in §6U)

app/api/brands/[id]/trust/route.ts · hallucinations/route.ts · hallucinations/[hid]/route.ts
app/api/brands/[id]/evidence/route.ts · entity-score/route.ts · entity-score/refresh/route.ts
app/api/brands/[id]/citation-sources/route.ts
app/api/brands/[id]/linkedin-presence/route.ts · linkedin-presence/refresh/route.ts
app/api/brands/[id]/consensus-score/route.ts · consensus-score/refresh/route.ts
app/api/brands/[id]/youtube-presence/route.ts · youtube-presence/refresh/route.ts

tests/phase2/sprint5/  (§11)
```

---

## 5. DATABASE SCHEMA ADDITIONS

Copy each definition VERBATIM from the LLD (anchors inline). Apply **MI-01** to both
migrations. Run the table migration first, then the ALTER migration.

### 5.1 hallucination_incidents (#19, LLD 6755)
Full columns per the LLD. `citation_id` REFERENCES citations(id) **ON DELETE SET NULL**
(HI-01 — trust record outlives the citation; it's brand-scoped, not audit-scoped, and is
excluded from the 12-mo retention path). `claim_type` + `severity` enums (§0.5). The two
independent flags `is_acknowledged` / `is_false_positive` (§0.5). `acknowledged_by` REFERENCES
users(id) (UUID, T6). Index `hallucination_brand_idx (brand_id, created_at DESC)`. **No risk
column** — risk is read-time (§0.5 / §6.1).

### 5.2 evidence_snapshots (#20, LLD 6826) — immutable archive
`audit_id` REFERENCES audits(id) **ON DELETE SET NULL** (survives audit deletion). `raw_response`
TEXT NOT NULL; `score_at_capture` NUMERIC(5,2); `captured_at`. **Only Agency+ creates rows.**
**Retention exclusion:** this table is the legal-grade immutable archive — the Sprint 12
audit-data-retention cron MUST NOT delete it (note this for S12; it has no audit_id-driven
delete path, but add the exclusion guard when S12 lands). Rows are NEVER deleted.

### 5.3 brand_entity_scores ALTER (#21, LLD 6850) — Phase 1 table, nullable additions only
ADD COLUMN IF NOT EXISTS (all nullable): `organization_id` UUID REFERENCES organizations(id)
(+ **backfill** `UPDATE … SET organization_id = brands.organization_id FROM brands WHERE
brand_id = brands.id`); `market_code` TEXT DEFAULT 'AU_EN'; `local_reg_verified` BOOLEAN +
`local_reg_number` TEXT; the typed directory cols (hipages_present/_rating,
yellow_pages_present, service_seeking_present, word_of_mouth_present/_rating,
local_directory_count, local_directory_details JSONB); `wikipedia_local_present` +
`wikipedia_local_url`; `au_tld_present`; **[GAP 11]** knowledge_panel_present/_accurate/_url;
**[GAP 13]** wikidata_entry_present/_url. **Do NOT add `entity_score`** (D-01 — score_of_10 is
canonical) **or `scored_at`** (checked_at exists). Index `brand_entity_market_idx (brand_id,
market_code, checked_at DESC)`.

### 5.4 citation_source_intelligence (#22, LLD 6897) — GAP 4
`audit_id` REFERENCES audits(id) **ON DELETE CASCADE** (per-audit analytics). `source_type`
(9-value enum), `gap_severity` (4-value enum §0.5), `citation_share` NUMERIC(5,2),
`market_benchmark` JSONB, `source_affinity_note` TEXT (seeded, §5.8). **TWO partial unique
indexes** (§0.5, LLD 6960) — NOT a single UNIQUE. Index `csi_brand_engine_idx`.

### 5.5 linkedin_presence_audits (#23, LLD 6974) — GAP 7
All company/founder/content-quality columns + `presence_score` INTEGER (/100 — the formula is
in §6.5, NOT a column-computed value) + `gaps` JSONB. `market_code` TEXT NOT NULL DEFAULT
'AU_EN'. Index `linkedin_brand_idx`.

### 5.6 brand_consensus_checks (#24, LLD 7024) — GAP 10
source_type (7-value enum §0.5), match booleans, `consistency_score` INTEGER (/100),
`discrepancies` JSONB. **UNIQUE(brand_id, source_type)** — the monthly cron UPSERTs (§0.5).
Index `consensus_brand_idx`.

### 5.7 youtube_presence_audits (#25, LLD 7082) — GAP 16
Channel/longform/content-type/transcript-chapter/embedding-schema columns + `presence_score`
INTEGER (/100 — formula in §6.5) + `cited_video_urls` JSONB + `gaps` JSONB. Index
`youtube_brand_idx`.

### 5.8 Seeds (MANDATORY) — db/seed/citation-source-affinity.ts (LLD 6905)
Seed the 8 `source_affinity_note` static strings keyed by source_type (reddit_thread,
au_directory, wikipedia, linkedin_post, news_article, youtube_video, review_site,
brand_owned) — the "WHY this source gets cited" copy from the LLD. These are NOT per-brand;
they're a static lookup the citation-sources UI reads. `ON CONFLICT DO NOTHING`.

### 5.9 RLS
All 6 new tables carry organization_id → enable RLS with USING + WITH CHECK on
organization_id, MI-01 `DROP POLICY IF EXISTS` guard. For brand_entity_scores, follow the LLD
RLS spec (~8629) — its Phase 1 posture (JOIN-to-brands) governs unless the spec lists it;
the new organization_id column is backfilled but does not by itself change the policy.

---

## 6. LIB MODULES (LLD 7300)

### 6.1 hallucination-detector.ts + hallucination-risk.ts
- **detector** (LLD 7140): on audit/complete, read citations WHERE audit_id AND
  is_accurate=false; classify claim_type by keyword rules on citation.hallucinationFlags
  (price_mismatch→wrong_price, location_mismatch→wrong_location, competitor_mention→
  competitor_confusion, else other); severity = critical (wrong_price/wrong_founder/
  competitor_confusion) | warning (wrong_product/wrong_location) | info (other); INSERT
  hallucination_incidents.
- **risk** (§0.5): pure function `risk(openIncidents): number` =
  `LEAST(100, 15×crit + 5×warn + 1×info)` over `is_false_positive=false` rows. No column.

### 6.2 entity-checker.ts + knowledge-panel-checker.ts + wikidata-checker.ts
- entity-checker: market_code-driven registry (AU ABN Lookup / NZ NZBN / UK Companies House),
  Wikipedia, directories. **Read Phase 1 abn_verified before re-checking ABN — do not
  duplicate Sprint 7's check.**
- knowledge-panel-checker [GAP 11]: SERP + structured-data → knowledge_panel_present/_accurate/
  _url.
- wikidata-checker [GAP 13]: Wikidata API (entity name + domain) → wikidata_entry_present/_url.

### 6.3 evidence-archiver.ts + trust-scorer.ts
- evidence-archiver: immutable snapshot creation (Agency+); never deletes.
- trust-scorer: aggregate trust signals → the Trust-hub score.

### 6.4 citation-intelligence.ts — GAP 4 (LLD 7228)
Group classified citations by source_type per engine; compute gap_severity (§0.5); attach the
seeded source_affinity_note. Consumed by §8.4 (which runs after classify-citation-sources).

### 6.5 linkedin-auditor.ts + consensus-checker.ts + youtube-auditor.ts
Each owns its **presence/consistency score formula verbatim** (the LLD gives the exact point
breakdowns):
- **linkedin-auditor** (LLD 7000): company page (30) + founder (40) + content quality (30);
  thresholds founder_followers≥2000, founder_posts_30d≥5, founder_articles_500plus≥2,
  knowledge_sharing_ratio≥0.54, original_content_ratio≥0.95. Public-page scraping via cheerio
  (brand provides URLs); auth-only fields NULL if unavailable.
- **consensus-checker** (LLD 7036): per-source consistency_score /100; flags discrepancies;
  the cron UPSERTs (§0.5); Action Center alert when score < 70.
- **youtube-auditor** (LLD 7110): channel existence (15, else score=0) + content volume (20) +
  transcript/chapter quality (35) + embedding/schema (20) + AI-citation signal (10).

### 6.6 Wire the S4 forward slots + alert triggers (§0.2 — required this sprint)
Implement the reads from §0.2 into the S4 narrative-generator's typed slots and the
alert-composer's hallucination + consensus triggers. This is what makes S4's dormant report
sections + alerts go live.

---

## 6U. UI SPECIFICATION

GLOBAL UI RULES (per S2 §6U): tokens only; `color-mix` faint fills (RT-01); `--focus-ring` +
`--elevation`; `tabular-nums`; ARIA per FIX 13; reduced-motion reset from S2. Each screen has a
STATES matrix + a `RESPONSIVE:` line. Shared foundation (LayerBadge/IntelCard/TierGate/
StatusBadge/ConfidenceBadge) exists from S2 — consume it. Trust hub = Growth+.

### 6U.2 Trust hub — TrustHub (prototype 2370)
LayerBadge "trust". The **Hallucination Risk card** (trust-score-card.tsx) shows the read-time
/100 (CT-04, §0.5) — "lower is better (0 = safe)"; NEVER read a risk column. Section tiles
link to the 7 sub-screens. tabular-nums on scores.
STATES — loading: skeletons; empty (no audits yet): EmptyState "Run an audit to see trust
intelligence"; error: boundary.
**RESPONSIVE:** tiles `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`.

### 6U.3 Hallucinations — hallucinations/page.tsx + hallucination-incident-row.tsx
List incidents (severity pill danger/warning/info; claim_type; engine; incorrect_claim vs
correct_value). Acknowledge action (PATCH → is_acknowledged) and a "mark false positive"
action (PATCH → is_false_positive) — **distinct** (§0.5). Risk recomputes from open rows.
STATES — loading: row skeletons; empty (clean): a POSITIVE EmptyState "No hallucinations
detected — your brand facts are consistent"; error: boundary.
**RESPONSIVE:** rows reflow to stacked cards on `<md`.

### 6U.4 Evidence archive — evidence/page.tsx + evidence-snapshot-row.tsx (Agency+)
Immutable snapshot list + export. TierGate for non-Agency ("Evidence archive is an Agency
feature").
STATES — loading: skeleton; empty: EmptyState; locked (non-Agency): TierGate; error: boundary.
**RESPONSIVE:** single-column list; export action in a sticky header on `<md`.

### 6U.5 Citation sources — citation-sources/page.tsx + source-gap-card.tsx (GAP 4, Growth+)
Per source_type per engine: citation_count + gap_severity + the seeded source_affinity_note
("Why does r/tradies get cited? […]. What should you do? […]"). This closes the "shows what,
not why/what-to-do" complaint — keep the affinity note prominent.
STATES — loading: skeleton; empty: EmptyState; error: boundary.
**RESPONSIVE:** source cards `grid-cols-1 md:grid-cols-2`.

### 6U.6 LinkedIn presence — linkedin-presence/page.tsx (GAP 7)
linkedin-presence-scorecard.tsx (score /100 + company + founder breakdown) + linkedin-gap-row
per gap with recommendation + a refresh action (POST). Score formula display matches §6.5.
STATES — loading: skeleton; empty (no audit yet): "Add your LinkedIn URLs and run an audit";
error: boundary.
**RESPONSIVE:** scorecard sections stack on `<md`.

### 6U.7 Consensus — consensus/page.tsx + consensus-discrepancy-card.tsx (GAP 10)
Per-source consistency rows + discrepancy cards ("website says X, Hipages says Y").
STATES — loading: skeleton; empty: EmptyState; error: boundary.
**RESPONSIVE:** discrepancy cards single-column.

### 6U.8 Entity score — entity-score/page.tsx (GAP 11/13)
entity-authority-grid.tsx (registry / Wikipedia / directories), knowledge-panel-card.tsx
(present/accurate/url), wikidata-status-card.tsx (entry present/url). Score reads **score_of_10**
(D-01 — never an entity_score column). Refresh action (POST).
STATES — loading: skeleton; empty: "Run an entity check"; error: boundary.
**RESPONSIVE:** grid `grid-cols-1 lg:grid-cols-2`.

### 6U.9 YouTube presence — youtube-presence/page.tsx (GAP 16)
youtube-presence-scorecard.tsx (score + channel stats) + youtube-video-audit-row.tsx (per
video: chapters/transcript/schema) + youtube-gap-card.tsx. Refresh action (POST).
STATES — loading: skeleton; empty (no channel): "No YouTube channel found — add your channel
URL"; error: boundary.
**RESPONSIVE:** video rows reflow to cards on `<md`.

---

## 7. (No CLI changes this sprint.)

## 8. INNGEST FUNCTIONS (register all 7 in serve() alongside S2–S4; LLD 7140)

### 8.1 detect-hallucinations.ts (LLD 7140)
Event **`audit/complete`** (PC-03). Runs detector (§6.1); INSERT incidents; **send the
hallucination alert via the S4 alert-composer for critical+warning**. **Emit
`hallucination/detected`** (`{ organizationId, brandId, incidentId }`) for critical+high only
(WH-01b — fanout-webhooks maps to external `hallucination.detected`; critical+high to avoid
alert fatigue).

### 8.2 capture-evidence-snapshot.ts (LLD 7165)
Event **`audit/complete`**, **Agency+ only** (PC-04). Immutable archive write.

### 8.3 refresh-entity-score.ts (LLD 7169) — runs ALONGSIDE Sprint 7's technical-audit-run
Event **`technical-audit/complete`** (internal slash — RE-01). **Sprint 7's
technical-audit-run.ts must emit BOTH `technical-audit.complete` (dot, webhooks) AND
`technical-audit/complete` (slash, internal) — verify/ensure this when S7 is built.** Extends
Phase 1 scoring monthly with: market_code registry check, typed directory cols, [GAP 11]
Knowledge Panel, [GAP 13] Wikidata. **Read abn_verified before re-checking ABN.** Writes the
new nullable cols (NOT entity_score) + checked_at.

### 8.4 build-citation-source-intelligence.ts (LLD 7218) — GAP 4
Event **`citations/classified`** (emitted by S3's classify-citation-sources — CI-02, NOT
audit/complete directly). Groups by source_type per engine, computes gap_severity, attaches
affinity notes; UPSERT via the two partial unique indexes.

### 8.5 audit-linkedin-presence.ts (LLD 7195) — GAP 7
Cron **`'0 3 2 * *'`** (2nd of month 03:00 UTC — CR-01). Public-page scraping (cheerio);
scores /100 (§6.5); Action Center recommendations.

### 8.6 check-cross-platform-consensus.ts (LLD 7240) — GAP 10
Cron **`'0 3 4 * *'`** (4th 03:00 UTC). Per-source consistency; **UPSERT ON CONFLICT
(brand_id, source_type)** (CU-01); Action Center alert + **the S4 consensus alert when score
< 70** (and the LLD's < 60 trust threshold for the alert-composer — use the LLD's stated
thresholds).

### 8.7 audit-youtube-presence.ts (LLD 7256) — GAP 16
Cron **`'0 3 3 * *'`** (3rd 03:00 UTC). YouTube Data API v3 (YOUTUBE_API_KEY): channels →
playlistItems → videos; classify longform/shorts/how-to, transcript/chapter quality, embedding
VideoObject schema; cross-reference cited_video_urls; score /100 (§6.5).

**serve():** add all 7 to the existing array; remove none. (Running Phase 2 total after S5:
3 (S2) + 6 (S3) + 2 (S4) + 7 (S5) = 18 of the eventual 25.)

---

## 9. API ROUTES (LLD 7110) — `[id]` params; Better Auth + org scoping; Zod; tier-gated
- `GET /api/brands/[id]/trust` — trust summary (incl the read-time risk).
- `GET …/hallucinations` · `PATCH …/hallucinations/[hid]` (acknowledge / mark false-positive).
- `GET …/evidence` (Agency+).
- `GET …/entity-score` · `POST …/entity-score/refresh`.
- `GET …/citation-sources` (Growth+).
- `GET …/linkedin-presence` · `POST …/linkedin-presence/refresh`.
- `GET …/consensus-score` · `POST …/consensus-score/refresh`.
- `GET …/youtube-presence` · `POST …/youtube-presence/refresh`.
Every route: Better Auth session + org scoping; Zod; correct codes; tier gates.

---

## 10. CLAUDE CODE PROMPT (paste this to open Sprint 5)

> You are implementing **VisibleAU Phase 2 — Sprint 5: Trust Intelligence** (Layer 3) — the
> payoff sprint that creates the trust/authority tables AND wires their reads into Sprint 4's
> dormant narrative-generator slots + alert-composer triggers. Sprints 1–4 are merged.
> Authority: `visibleau-7layer-lld.md` v8.66, Layer 3 "TRUST INTELLIGENCE" (~6716) and the
> Sprint 5 plan (~8946). Where this prompt and the LLD differ, the LLD wins.
>
> Build, in order:
> 1. Drizzle schemas + TWO MI-01-idempotent migrations: (a) the 6 new tables (CREATE TABLE IF
>    NOT EXISTS, indexes IF NOT EXISTS, DROP POLICY IF EXISTS before each CREATE POLICY, RLS
>    on all 6 — all carry organization_id); (b) the brand_entity_scores ALTER (ADD COLUMN IF
>    NOT EXISTS for every new nullable col + the organization_id backfill UPDATE). CRITICAL:
>    do NOT add entity_score (D-01 — score_of_10 is canonical) or scored_at (checked_at
>    exists); hallucination_incidents has NO risk column (risk is read-time, CT-04);
>    citation_source_intelligence uses TWO partial unique indexes (audit_id is nullable, not a
>    single UNIQUE); brand_consensus_checks has UNIQUE(brand_id, source_type) and its cron
>    UPSERTs; FK ON DELETE: hallucination.citation_id + evidence.audit_id SET NULL,
>    citation_source_intelligence.audit_id CASCADE.
> 2. The seed (§5.8): citation-source-affinity (8 source_type notes), ON CONFLICT DO NOTHING.
> 3. The 11 lib/trust modules (§6): hallucination-detector + hallucination-risk (the pure
>    read-time LEAST(100,15c+5w+1i) over is_false_positive=false rows); entity-checker (read
>    abn_verified before re-checking — don't duplicate S7), knowledge-panel-checker [GAP 11],
>    wikidata-checker [GAP 13]; evidence-archiver, trust-scorer; citation-intelligence [GAP 4];
>    linkedin-auditor / consensus-checker / youtube-auditor with their EXACT score formulas
>    from §6.5. All LLM calls use selectModel(tier, engine, …) — no hardcoded models.
> 4. The 7 Inngest functions (§8), registered in serve() alongside S2–S4: detect-hallucinations
>    (audit/complete, emits hallucination/detected, sends the S4 hallucination alert),
>    capture-evidence-snapshot (audit/complete, Agency+), refresh-entity-score (technical-audit/
>    complete — and ensure S7 will emit BOTH dot+slash forms), build-citation-source-
>    intelligence (citations/classified), audit-linkedin-presence (cron 0 3 2 * *),
>    check-cross-platform-consensus (cron 0 3 4 * *, UPSERT, S4 consensus alert),
>    audit-youtube-presence (cron 0 3 3 * *, YouTube Data API v3).
> 5. **Wire the S4 forward slots + alert triggers (§0.2/§6.6):** linkedin_presence_audits→
>    linkedin_performance, brand_consensus_checks→consensus_score, brand_entity_scores
>    knowledge_panel cols→knowledge_panel_status, citation_source_intelligence→source_type_gaps,
>    evidence_snapshots→evidence_snapshots (Agency+) in the S4 narrative-generator; and the
>    hallucination + consensus triggers in the S4 alert-composer. This lights up what S4 left
>    dormant.
> 6. The 8 Trust screens (§6U) + the 14 components: the read-time Hallucination Risk card
>    (never a column), the distinct acknowledge vs false-positive actions, citation-source
>    cards with the affinity note prominent, the LinkedIn/consensus/entity/YouTube scorecards
>    matching the §6.5 formulas. Both themes; STATES matrices + RESPONSIVE per screen; ARIA per
>    FIX 13; Trust hub Growth+, evidence Agency+.
> 7. The API routes (§9): [id] params, Better Auth + org scoping, Zod, tier gates.
>
> Constraints: TS strict, no `any`. LLM_MODE=mock in tests. subscriptions.tier (never
> organizations.tier). selectModel() — no hardcoded models/engine lists. Run §12 greps + §11
> tests and report.

---

## 11. TESTS REQUIRED (LLM_MODE=mock)
- `hallucination-risk.test.ts` — LEAST(100, 15c+5w+1i) over is_false_positive=false rows;
  acknowledging does NOT lower risk, marking false-positive DOES; fixture 1 crit + 1 warn → 20.
- `hallucination-detector.test.ts` — claim_type classification from hallucinationFlags;
  severity mapping (wrong_price→critical etc.).
- `entity-checker.test.ts` — reads abn_verified before re-checking ABN (no duplicate S7 call);
  market_code drives the registry.
- `citation-intelligence.test.ts` — gap_severity boundaries (>20 critical / 10–20 warning /
  <10 opportunity / present covered); the two partial unique indexes prevent dup (with and
  without audit_id).
- `linkedin-auditor.test.ts` / `consensus-checker.test.ts` / `youtube-auditor.test.ts` — each
  score formula at its thresholds; consensus cron UPSERTs (no month-2 dup); youtube channel-
  absent → score 0.
- `s4-wiring.integration.test.ts` — once an S5 row exists, the S4 narrative-generator renders
  the corresponding section (linkedin_performance/consensus_score/knowledge_panel_status) and
  the S4 alert-composer fires the hallucination/consensus alert (gated on its own preference).
- `entity-alter.migration.test.ts` — the ALTER adds the nullable cols; entity_score + scored_at
  are NOT added; backfill populates organization_id; re-running is a no-op.
- `trust-rls.test.ts` — cross-org reads blocked on all 6 new tables.

## 12. VERIFICATION GREPS
```bash
grep -c "CREATE TABLE IF NOT EXISTS" db/migrations/*sprint5_trust.sql                 # → 6
grep -c "DROP POLICY IF EXISTS" db/migrations/*sprint5_trust.sql                      # → 6
grep -c "ADD COLUMN IF NOT EXISTS" db/migrations/*sprint5_entity_alter.sql            # → ≥18
# D-01: entity_score / scored_at NOT added
grep -ciE "add column[^;]*entity_score|add column[^;]*scored_at" db/migrations/*sprint5_entity_alter.sql  # → 0
# CT-04: no risk column; risk is read-time
grep -ic "risk_score\|risk " db/schema/hallucination-incidents.ts | grep -qx 0 && echo "no risk col OK"
grep -Rc "LEAST(100" lib/trust/hallucination-risk.ts                                  # → ≥1
grep -Rc "is_false_positive" lib/trust/hallucination-risk.ts                          # → ≥1
# citation_source_intelligence: TWO partial unique indexes (not one UNIQUE)
grep -cE "csi_unique_with_audit|csi_unique_aggregate" db/migrations/*sprint5_trust.sql # → 2
# consensus UPSERT
grep -Rc "ON CONFLICT (brand_id, source_type)\|onConflict" inngest/functions/check-cross-platform-consensus.ts  # → ≥1
# FK ON DELETE rules
grep -E "citation_id|audit_id" db/migrations/*sprint5_trust.sql | grep -c "ON DELETE SET NULL"  # → ≥2
grep -c "ON DELETE CASCADE" db/migrations/*sprint5_trust.sql                          # → ≥1  (citation_source_intelligence.audit_id)
# Inngest crons + events
grep -Rc "'0 3 2 \* \*'" inngest/functions/audit-linkedin-presence.ts                 # → ≥1
grep -Rc "'technical-audit/complete'" inngest/functions/refresh-entity-score.ts       # → ≥1
grep -Rc "'citations/classified'" inngest/functions/build-citation-source-intelligence.ts  # → ≥1
grep -Rc "'hallucination/detected'" inngest/functions/detect-hallucinations.ts        # → ≥1
# S4 wiring: the slots are now read
grep -Rc "linkedin_presence_audits\|brand_consensus_checks\|citation_source_intelligence" lib/communication/narrative-generator.ts  # → ≥1
# 7 functions registered (running total 18)
grep -cE "detectHallucinations|captureEvidenceSnapshot|refreshEntityScore|buildCitationSourceIntelligence|auditLinkedinPresence|checkCrossPlatformConsensus|auditYoutubePresence" app/api/webhooks/inngest/route.ts  # → 7
# no hardcoded model; selectModel where LLM used
grep -RnE "'claude-3|'gpt-4|'gemini-" lib/trust/                                      # → 0
# UI: no hex-alpha on var(); RESPONSIVE + tabular
grep -REc "var\(--[a-z-]+\)[0-9a-fA-F]{2}" components/domain/trust/                    # → 0
grep -RcE "sm:grid-cols|md:|lg:grid-cols" app/\(auth\)/brands/\[brandId\]/trust/       # → ≥1
# subscriptions.tier, no Clerk
grep -RnE "organizations\.tier|org\.tier" lib/trust/ | grep -iv subscriptions         # → 0
grep -Rc "Clerk\|@clerk" lib/trust/ db/ app/api/brands/                               # → 0
```

## 13. COMMON PITFALLS / SPRINT 5 ANTI-PATTERNS
- **Adding a risk column to hallucination_incidents.** Risk is READ-TIME (CT-04):
  LEAST(100,15c+5w+1i) over is_false_positive=false rows; timestamps/flags are the truth.
- **Treating is_acknowledged as closing an incident.** Only is_false_positive=false counts as
  "open" for risk; acknowledging just records the team saw it.
- **A single UNIQUE on citation_source_intelligence.** audit_id is nullable → NULL≠NULL lets
  dupes through; use the TWO partial unique indexes.
- **Plain INSERT in the consensus cron.** It has UNIQUE(brand_id, source_type) → month 2 fails;
  UPSERT ON CONFLICT.
- **Adding entity_score or scored_at in the ALTER.** D-01: score_of_10 is canonical;
  checked_at exists. Both are duplicates.
- **Duplicating Sprint 7's ABN check.** Read abn_verified (Phase 1) before re-checking.
- **Wrong FK ON DELETE.** hallucination.citation_id + evidence.audit_id SET NULL (trust
  records survive); citation_source_intelligence.audit_id CASCADE (per-audit).
- **Wrong Inngest events.** detect-hallucinations on audit/complete; build-citation-source-
  intelligence on citations/classified (NOT audit/complete — must wait for classification);
  refresh-entity-score on technical-audit/complete (slash, internal); the monthly crons on
  their exact dates (2nd/3rd/4th 03:00 UTC).
- **Forgetting the S4 wiring (§0.2).** If you don't wire the slots + alert triggers, S4's
  report sections + hallucination/consensus alerts stay dormant — that's the whole point of S5.
- **Hardcoding the entity/registry/YouTube model or engine list** instead of selectModel +
  TIER_ENGINES.
- **Deleting evidence_snapshots** — it's the immutable legal-grade archive (retention-excluded).
- **Missing RLS** on any of the 6 new tables, or the MI-01 idempotency guards.

## 14. HANDOFF TO SPRINT 6
After Sprint 5: the trust layer is live and S4's dormant report sections (linkedin/consensus/
knowledge-panel) + alerts (hallucination/consensus) now fire. Two S6 slots remain open in the
S4 narrative-generator: **entity_home_status** and **agent_readiness**. **Sprint 6 (Retrieval
Intelligence + Agent Readiness, Layer 1)** creates tables 8–11 (crawler_visit_logs,
content_structure_audits + the entity-home ALTER, llmstxt_versions, agent_readiness_scores)
and must wire content_structure_audits → entity_home_status and agent_readiness_scores →
agent_readiness in the S4 narrative-generator (closing the last two slots). Sprint 6 requires:
S1 services + the PUBLIC /api/visit route (VA-01) for crawler logging.

## CHANGELOG
- v1.0 — Initial Sprint 5 prompt, generated single-pass against verified LLD v8.66
  (REVIEWED-r2). Schema/Inngest/lib/route detail cited to LLD ~6716–7375 + ~8946; UI to
  prototype TrustHub (2370); conventions from master plan §7. §1 module list is the complete
  enumeration of the §4 tree (per the S3-01 lesson). Implements the S4→S5 wiring contract
  (closes 5 of the 7 S4 narrative-generator slots + the hallucination/consensus alert
  triggers; entity_home + agent_readiness remain S6). Awaiting Gate 2.
