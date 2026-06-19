# VisibleAU Phase 2 — SPRINT 4 PROMPT: GATE 2 FINDINGS (PASS 2 — fix-validation + fresh angle)
# Reviewer: independent reviewer chat | Date: June 2026
# Reviewing: visibleau-p2-sprint-4-prompt.md **v1.1** (Communication Intelligence)
# Canon used: visibleau-phase2-v8_65-complete-REVIEWED-r2 (authorized; v8.66 deltas don't touch S4 regions).
# Pass-1 angle: fidelity-to-LLD + correctness rules (findings S4-01, S4-02).
# Pass-2 angle (this doc): PHASE-1 REUSE / EXTERNAL-DEPENDENCY INTEGRITY — are the ~8
#   "reuse Phase 1, don't re-create" claims actually backed by real Phase-1 artifacts with the
#   right attribution? (A wrong reuse claim → Claude Code fails to import, or silently
#   duplicates infra.) Genuinely new: no prior pass audited the Phase-1 reuse surface.

---

## 1. VERDICT — **PASS-WITH-FIXES → near-clean** (both v1.1 fixes correct; one LOW completeness item)

**(a) v1.1 fixes — BOTH VERIFIED CORRECTLY APPLIED, and the big one is thorough + coherent:**
- **S4-01 (self-activation mechanism) — reframed consistently across 7 locations.** The
  unimplementable "self-activate with zero code change" claim is gone; §0.1, §1, §6.1, §8.1,
  §10, §13, §14 now say S4 builds the **section framework** for all 12 types, wires the reads
  whose tables exist now (S3 + Phase 1), and leaves the S5/S6 sections as **unwired typed
  slots** that the owning sprint wires — explicitly "do NOT import or query those tables in S4
  (they don't exist yet → TS/SQL would fail)", with a `to_regclass` raw-SQL guard offered as
  the single-pass alternative. This now matches §6.4's alert-composer framing (the
  contradiction I flagged is resolved). The §11 test was fixed too: it no longer asserts a
  "no row" condition on the absent linkedin table — it asserts the framework omits unwired
  slots and tests row-omission on a table that EXISTS in S4 (fan_out_coverage). No
  contradictory "zero code" leftover remains (the only two occurrences are the corrective
  "NOT magically with zero code" and the changelog quoting the removed claim).
  - **Coherence bonus:** the §6.1 "wire now" set (executive_summary, score_breakdown,
    mention_source_divide, fan_out_coverage, topical_gap_summary) is exactly the seed's **5
    core `include:true` sections** — framework wires the seeded-on sections, slots the
    seeded-off ones. Clean alignment.
- **S4-02 (LLD DDL typo) — handled.** §5.2 gained a "DDL note: the LLD's generated_reports
  block has a stray-comma typo … emit CLEAN, valid SQL/Drizzle; do not reproduce the typo,"
  and the changelog records it was flagged to Sri as an LLD cleanup. Correct.

**(b) Fresh angle (Phase-1 reuse integrity) — CLEAN.** All eight "reuse Phase 1" claims are
backed by the LLD with the correct attribution (details in §2). (c) §12 negative greps execute.

The only new item is **S4b-01 (LOW)** — a completeness gap in the (newly-reframed) §6.1 split.

---

## 2. FRESH ANGLE — PHASE-1 REUSE / EXTERNAL-DEPENDENCY INTEGRITY (all claims verified)

Each "reuse Phase 1, don't re-create" claim checked against the LLD:
- **`lib/pdf/theme.ts` (`assetToTheme`, `buildThemeStyles`)** — prompt says Phase 1 **Sprint 9**.
  LLD confirms: "Sprint 9 (GB4) built lib/pdf/theme.ts: assetToTheme() + buildThemeStyles()"
  (LLD 3604, 8358–8362). ✓
- **`lib/email/client.ts` (Resend singleton)** — prompt says Phase 1. LLD: "Uses lib/email/
  client.ts Resend singleton (Phase 1 pattern from Sprint 2) … import { resend } from
  '@/lib/email/client'" (LLD 8348–8349). ✓
- **React Email templates** — prompt says reuse Phase 1's setup for `scheduled-report.tsx` +
  alerts. LLD specifies the template as a "**React Email** component" (LLD 8338/8342). ✓
  (The package string "react-email" isn't in the LLD, but the approach — React Email — is
  explicitly named; the prompt correctly hedges "confirm Phase 1 uses these.")
- **`@react-pdf/renderer` / `renderToBuffer()`** — prompt says reuse Phase 1 Sprint 9. LLD
  references `@react-pdf/renderer` + `renderToBuffer` (LLD 2046 / 8362 region). ✓
- **`send-weekly-digest.ts`** (the EM-01 guard target) — prompt says Phase 1. LLD: "Phase 1
  send-weekly-digest.ts" (LLD 1213/8235; "Phase 1 Sprint 9" at 4840). ✓
- **`drift/detected` event** (alert-composer drift trigger) — prompt says Phase 1 **Sprint 8**.
  LLD: "Drift alert — trigger … 'drift/detected' Inngest event (Phase 1 Sprint 8)" (LLD 8370). ✓
- **`agency_brand_assets`** (PDF theme source) — present in the LLD (7 hits). ✓
- **`noreply@visibleau.com`** (verified domain) — present in the LLD (2 hits). ✓
- (`RESEND_API_KEY` is not named in the LLD, but the Resend singleton + verified domain ARE,
  and the prompt says "existing … None new" — a reasonable reference to existing Phase-1 config,
  not a defect.)
- **Alert-trigger phases all correct:** hallucination (S5), drift (Phase 1 Sprint 8),
  consensus (S5), volatility (S3) — each gated on its own preference (NP-01). ✓

No reuse claim is unbacked or mis-attributed — Claude Code won't fail-to-import or duplicate.

---

## 3. NEW FINDING (pass 2)

### S4b-01 — [LOW] §6.1's wire-now/forward split buckets only 10 of the 12 section types
- **Internal inconsistency:** the reframed §6.1 block says the framework covers "all 12 section
  types," then explicitly buckets: **wire now (5)** = executive_summary, score_breakdown,
  mention_source_divide, fan_out_coverage, topical_gap_summary; **forward slots (5)** =
  linkedin_performance / consensus_score / knowledge_panel_status (S5), entity_home_status (S6),
  source_type_gaps (S5). That's 10. **`agent_readiness` and `evidence_snapshots` are in neither
  bucket.**
- **What I checked:** `evidence_snapshots` is a confirmed **Sprint 5** table (LLD 4591:
  "Sprint 5: hallucination_incidents, evidence_snapshots…"; CREATE TABLE at 6797) and is
  **Agency+** (narrative RULE 8) — so it's clearly a forward slot, yet §6.1's forward list omits
  it (even though §14's handoff lists evidence_snapshots as an S5 table). `agent_readiness_scores`
  is at LLD 5358 (Layer 1); whether the `agent_readiness` section is wire-now or a forward slot
  depends on that table's sprint, which §6.1 doesn't state.
- **Why it matters (LOW):** the framework claim covers rendering, and a builder could infer the
  same "wire if the table exists, slot if not" rule — but since the prompt deliberately
  enumerates the split, omitting 2 (one of them a definitively-S5, Agency+ section) leaves a
  builder uncertain whether to wire `agent_readiness` now and how to treat `evidence_snapshots`.
- **Required fix:** bucket all 12 in §6.1 — add **`evidence_snapshots` → forward slot (S5,
  Agency+ per RULE 8)**, and place **`agent_readiness`** per `agent_readiness_scores`' sprint
  (wire-now if that table exists by S4, else a forward slot). One sentence. No LLD change.

---

## 4. CLEAN — verified this pass
- Both v1.1 fixes correctly applied; the S4-01 reframe is consistent across 7 locations,
  resolves the §6.4 contradiction, fixes the §11 test, and aligns with the seed's 5 core
  sections; no "zero code" leftover.
- Phase-1 reuse integrity: all 8 reuse claims LLD-backed with correct sprint attribution;
  alert-trigger phases correct; no fail-to-import / duplication risk.
- §12 negative greps execute as intended (no-status-column → 0; no ON CONFLICT → 0; Resend
  singleton reused / `new Resend(` → 0; theme imported).
- The four pass-1 high-risk areas remain clean (v1.1 didn't touch them): structural traps (C2),
  narrative RULES 1–11 (C3), event chain + reuse (C4), EM-01 dedup (C5).
- The §1-vs-tree enumeration discipline still holds (4 lib modules = §4 tree = §6.1–§6.4).

---

## 5. NEXT STEP
One LOW prompt-internal fix, no LLD change:
- **S4b-01** — bucket all 12 section types in §6.1 (`evidence_snapshots` → S5/Agency+ forward
  slot; `agent_readiness` per its table's sprint). Worth a quick v1.2 touch; not blocking.
With S4b-01 applied, Sprint 4 is ready for Claude Code. This was a near-clean pass: the v1.1
fixes are thorough and coherent (the S4-01 reframe is a model fix — consistent across 7
locations and aligned with the seed), the Phase-1 reuse surface is fully grounded, and the
fresh angle surfaced only one low-severity enumeration gap.

Forward note for the Sprint 5 review: S5 is where the dormant slots light up — confirm S5
creates hallucination_incidents, brand_consensus_checks, linkedin_presence_audits,
citation_source_intelligence, evidence_snapshots (+ the brand_entity_scores ALTER) and **wires
their reads into the S4 narrative-generator's typed slots + the alert-composer's triggers**
(the S4→S5 contract this prompt's §14 sets up).

— End of SPRINT4-FINDINGS-PASS2.md
