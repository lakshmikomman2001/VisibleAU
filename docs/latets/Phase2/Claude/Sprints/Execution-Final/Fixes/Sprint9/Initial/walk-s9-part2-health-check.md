# S9 WALK — PART 2: The AI Visibility Health Check (§6U.3, LLD 9162+)

## Why this screen is the highest-risk surface in S9
Four risk factors stack here — the same profile that hid F21 + HIGH-12 in S8:
1. **Precise numeric thresholds.** A wrong band mapping shows a brand as "green/healthy" when it's
   actually red. Plausible-looking, silently wrong, and no grep can catch it.
2. **The prototype is KNOWN-WRONG** (S9-02 / FIX 16). The prompt says so explicitly: the prototype
   HealthCheck (1399) renders the WRONG dimensions (raw audit multidim: Frequency/Position/Sentiment/
   Context/Accuracy) and a 4-band scale (great/good/moderate/poor). **The LLD governs** — 4
   CROSS-LAYER dimensions + a 3-band green/amber/red map. So the build had **no correct visual
   reference** — exactly the condition that made S8's un-prototyped audit-trail the buggiest screen.
3. **A NULL edge case** — Local Authority (`local_ai_trust_score`) is NULL for every brand (S6b-02
   deferral). Must render a skip/null state, NOT "0" and NOT a red band.
4. **A conditional hide** — SaaS brands hide Local Authority entirely.

The LLD calls this "the highest-value UX decision in Phase 2" (the trial→paid conversion moment). A
wrong traffic light here is a customer-facing lie about their AI visibility.

---

## STEP 0 — Get the EXPECTED bands first (or you can't grade the screen)
Before opening the page, compute what each dimension SHOULD show. Without this, a plausible-looking
traffic light can't be distinguished from a wrong one.

```bash
cd c:/startup/VisibleAU/src
# The brand on the dashboard banner: Bondi Plumbing. Its latest audit + technical audit + agent readiness:
psql "$PROD" -c "
  SELECT b.name, b.vertical,
         a.id AS audit_id, a.score_sentiment_numeric, a.score_frequency, a.created_at
  FROM brands b
  LEFT JOIN audits a ON a.brand_id = b.id AND a.status='complete'
  WHERE b.name ILIKE '%bondi%'
  ORDER BY a.created_at DESC LIMIT 3;"

psql "$PROD" -c "
  SELECT score_composite, created_at FROM technical_audits
  WHERE brand_id = (SELECT id FROM brands WHERE name ILIKE '%bondi%' LIMIT 1)
  ORDER BY created_at DESC LIMIT 2;"

psql "$PROD" -c "
  SELECT local_ai_trust_score, created_at FROM agent_readiness_scores
  WHERE brand_id = (SELECT id FROM brands WHERE name ILIKE '%bondi%' LIMIT 1)
  ORDER BY created_at DESC LIMIT 2;"

# The #1 action (5th section):
psql "$PROD" -c "
  SELECT id, title, status, priority
  FROM remediation_tasks
  WHERE brand_id = (SELECT id FROM brands WHERE name ILIKE '%bondi%' LIMIT 1)
    AND status='open'
  ORDER BY priority LIMIT 1;"
```

### Now compute the EXPECTED band per the LLD thresholds (write these down):
| Dimension | Source column | LLD thresholds | Actual value | **Expected band** |
|---|---|---|---|---|
| **AI SENTIMENT** | `audits.score_sentiment_numeric` | green **≥70** / amber **40–69** / red **<40** | ? | ? |
| **AI PRESENCE** | `audits.score_frequency` | green **≥60** / amber **30–59** / red **<30** | ? | ? |
| **SITE READINESS** | `technical_audits.score_composite` | green **≥75** / amber **45–74** / red **<45** | ? | ? |
| **LOCAL AUTHORITY** | `agent_readiness_scores.local_ai_trust_score` | (NULL per S6b-02) | ? | **skip/null state** |
| **#1 ACTION** | top open `remediation_task` by priority | — | ? | the real task title |

**Boundary cases matter most.** If a value sits exactly on a boundary (70, 60, 75, 40, 30, 45), that's
the highest-value check — an off-by-one (`>` vs `>=`) is the classic band bug. Note any value within
±2 of a threshold.

---

## WALK 2A — The Health Check page
Open **`/brands/{bondiBrandId}/health-check`** (Growth+; the dashboard banner links to it). Screenshot
the full page.

### The bindings (§6U.3 + LLD)
| # | Check | PASS | FAIL |
|---|---|---|---|
| 1 | **CROSS-LAYER dimensions** — the whole point | AI Sentiment · AI Presence · Site Readiness · Local Authority (+ #1 Action) | ❌ Raw audit multidim (Frequency/Position/Sentiment/Context/Accuracy) — the prototype's wrong set. The prompt says "do NOT show the raw audit multidim scores." |
| 2 | **3-band traffic light** | green / amber / red | ❌ the prototype's 4-band great/good/moderate/poor |
| 3 | **Bands match the LLD thresholds** | each dimension's band = what you computed in Step 0 | ❌ any mismatch — esp. an off-by-one at a boundary |
| 4 | **LOCAL AUTHORITY (NULL)** | a skip / "not available" / "coming soon" state | ❌ rendered as **0** · ❌ rendered **red** · ❌ blank/undefined · ❌ a crash |
| 5 | **#1 ACTION (5th section)** | the real top-priority open task, its **explainability rationale** (plain English, ≥30 chars, no "algorithm/heuristic/statistical/confidence interval"), + a **"Start this action →" CTA** | ❌ a mock/placeholder task · ❌ missing rationale · ❌ CTA absent or dead |
| 6 | **"Start this action →" leads into the Autopilot loop** | clicking it navigates to `/brands/{id}/autopilot` (§6U.2) | ❌ dead link / wrong destination |
| 7 | **Plain-English interpretation per section** | each of the 4 dims has a one-sentence explanation (the explainability templates) | ❌ bare numbers with no interpretation |
| 8 | **Hero banner** | autopilot gradient, **reduced-motion-safe** (`motion-safe:` gating — the ungated `animate-pulse` we just fixed elsewhere suggests this may recur) | ❌ ungated animation |

### The EXPLAINABILITY contract check (LLD 5607–5654 — richer than the prompt implies)
The LLD binds a **5-question contract** on every customer-facing recommendation/insight:
1. Where do I stand? → `standingSummary`
2. Why is this happening? → `whyExplanation`
3. What should I do? → `actionSuggestion`
4. What impact could it have? → `expectedImpact` (evidence-based, **no revenue estimates**)
5. How confident is VisibleAU? → `confidenceLabel` (`confirmed` | `likely` | `hypothesis`)

And the **S9 RULE**: Sprint 9 **RENDERS** the stored `{ score, explainability }` from S6's
annotations — it must **NOT regenerate** (no `ExplainabilityService` import, no `annotate()` call in
S9 components). grep #12 claims 0 matches — good — but confirm on screen that a **real stored
rationale** appears (not an empty string / generic filler; the LLD says "an empty or generic
rationale is a build failure").
- Also: **gap rows have NO confidenceLabel column** (WF-03 v8.34) → the UI hardcodes
  `confidenceLabel = 'likely'` for gap-derived content. If the #1 action shows a confidence label,
  confirm it's `likely` (not a fabricated `confirmed`).

### STATES (§6U.3) — try each
- **pre-audit** (a brand with no completed audit): "Run your first audit to see your Health Check"
- **partial** (insufficient audits): shown WITH the `confidence_note` caveat
- **SaaS brand:** **Local Authority hidden entirely** (the other 3 + #1 action shown). ⚠️ Find a SaaS
  brand if one exists (the org has "Canva" per the earlier diagnosis — likely SaaS). If none exists,
  note it as untested and check the code branch instead.
- **loading:** section skeletons
- **error:** boundary

### RESPONSIVE (§6U.3)
Section cards: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-5`; the hero **stacks on `<md`**.
Screenshot at **narrow (<md)** and confirm the hero stacks + cards go single-column.

---

## WALK 2B — The prototype↔build reconciliation (S9-02)
The prompt says the prototype "needs the same correction so prototype and LLD agree." Confirm which
happened:
```bash
grep -n "Frequency\|Position\|Context\|Accuracy\|AI SENTIMENT\|AI PRESENCE\|SITE READINESS\|LOCAL AUTHORITY\|great\|good\|moderate\|poor\|green\|amber\|red" \
  components/domain/health-check/*.tsx 2>/dev/null | head -20
```
- If the BUILD renders the 4 cross-layer dims + 3-band → the build is correct (the prototype remains
  stale; flag it for canon, like S8's TierGate).
- If the BUILD copied the prototype's wrong dims/4-band → **FINDING (HIGH)** — the build followed the
  known-bad prototype over the LLD, and the customer sees the wrong health picture entirely.

---

## Report back (paste inline)
1. **Step 0 table** — the actual values + the EXPECTED band per dimension (this is the answer key).
2. **Screenshot: `/brands/{bondiBrandId}/health-check`** — full page.
3. **Screenshot: the same page at `<md`** (hero stacked, cards single-column).
4. Do the rendered bands MATCH the expected bands from Step 0? (dimension by dimension)
5. **Local Authority**: what does it render (skip state / 0 / red / blank)?
6. **#1 Action**: the task title + the explainability rationale text (paste it — I want to see it's
   real, not generic) + does the CTA navigate to the autopilot loop?
7. The 2B grep — 4 cross-layer dims + 3-band (correct), or the prototype's wrong set (HIGH finding)?
8. **The terminal** during the page load (errors? which routes?).
9. If a SaaS brand exists (Canva?), the Local-Authority-hidden state — else note untested.
