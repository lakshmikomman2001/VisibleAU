# FIX S9-HIGH-04 (F11) — Health Check renders ALL ZEROS: envelope unwrap failure

## Severity: HIGH — the trial→paid conversion screen tells every brand they are 0/100 "Critical", including brands scoring 100.

## Root cause (diagnosed)
Every API wraps its payload in a named property. `health-check/page.tsx` reads
`await res.json()` as if it WERE the inner data — it never unwraps the envelope. Eight fields
resolve to `undefined` → `null` → **`Number(null) = 0`** → `classifyScore(0)` → red → "Critical".

**Why nothing caught it:** no throw, no 500, no failed test. Missing data silently becomes a
*plausible score*, and the band logic then honestly renders "Critical" from garbage. The page works
perfectly and lies perfectly. (18/18 greps + 70/70 tests were green.)

| # | Dimension | Route | API returns | Component reads | Result |
|---|---|---|---|---|---|
| 1 | AI Sentiment | `/latest-audit` | `response.audit.scoreSentimentNumeric` | `audit.scoreSentimentNumeric` | undefined → 0 |
| 2 | AI Presence | `/latest-audit` | `response.audit.scoreFrequency` | `audit.scoreFrequency` | undefined → 0 |
| 3 | **Site Readiness** | `/retrieval-audit` | **NOT SERVED** | `tech?.scoreComposite` | undefined → 0 |
| 4 | Local Authority | `/agent-readiness` | `response.latest.localAiTrustScore` | `agent?.localAiTrustScore` | undefined → 0 |
| 5 | Engine count | `/latest-audit` | `response.audit.engines` | `audit.engines?.length` | undefined → 0 |
| 6 | Audit date | `/latest-audit` | `response.audit.completedAt` | `audit.completedAt` | undefined → "Recent" |
| 7 | Brand name | `/brands/[brandId]` | `response.brand.name` | `brand?.name` | undefined → "Brand" |
| 8 | Brand vertical | `/brands/[brandId]` | `response.brand.vertical` | `brand?.vertical` | undefined → "" → non-SaaS |

## Task — `app/(auth)/brands/[brandId]/health-check/page.tsx` (no API changes)

### Step 1 — Unwrap every envelope
```ts
const brand = (await brandRes.json()).brand;          // was: await brandRes.json()
const audit = (await auditRes.json()).audit;          // was: await auditRes.json()
const agent = (await agentRes.json()).latest;         // was: await agentRes.json()  ← note: .latest, not the top level
```
Then the existing reads (`audit.scoreSentimentNumeric`, `audit.scoreFrequency`,
`agent?.localAiTrustScore`, `audit.engines?.length`, `audit.completedAt`, `brand?.name`,
`brand?.vertical`) all resolve correctly. **Be defensive:** the envelope key may be absent on an
error/empty response — use `(await res.json())?.audit ?? null` so a missing envelope yields null
(→ the honest empty/pre-audit state), not a crash.

### Step 2 — ⚠️ SITE READINESS: use the CORRECT source (do NOT substitute the nearest field)
The diagnosis suggests sourcing it from `audit.scoreComposite` "already available after unwrap".
**Do not do that without verifying.** Canon binds:
> **SITE READINESS** ← **`technical_audits.scoreComposite`** (green ≥75 / amber 45–74 / red <45)

`audits.score_composite` and `technical_audits.score_composite` are **different columns from
different tables**. For Metropolitan, the DB shows `technical_audits.score_composite = 37` (latest)
— the `audits` row's composite is a *different* number. Substituting the audit-level composite would
render a **wrong-but-plausible** Site Readiness — the exact bug class we're fixing, with a different
wrong number.

So:
```bash
cd c:/startup/VisibleAU/src
# Which route serves technical_audits.score_composite? (the brand grid has a "Technical Audit" tile)
grep -rln "technicalAudits\|technical_audits\|scoreComposite" app/api/brands/ | head
grep -n "scoreComposite\|technicalAudits\|return NextResponse\|json(" \
  "app/api/brands/[brandId]/technical-audit/route.ts" 2>/dev/null | head
```
- Point the Health Check at the route that actually serves `technical_audits.score_composite`
  (likely `/technical-audit`), unwrap ITS envelope correctly, and read `scoreComposite` from there.
- **Drop the `/retrieval-audit` fetch** — the diagnosis confirms it serves
  `{ agentReadiness, llmstxt, contentPages, recentVisits }` and contains no Site Readiness data. It's
  dead weight (and it's currently the source of the wrong binding).
- If NO route serves `technical_audits.score_composite`, REPORT that — then the Health Check needs a
  server-side read (the page is a server component; it can query directly, or a small route is
  needed). Do not fake it with the audit-level composite.

### Step 3 — Verify against the ANSWER KEY (the DB truth)
After the fix, the two brands MUST render these exact bands:

**Metropolitan Plumbing** (`418f321f-2489-4560-aaa9-895728580465`):
| Dimension | Value | Expected band |
|---|---|---|
| AI Sentiment | 100 | **GREEN** |
| AI Presence | 5 | **RED** |
| Site Readiness | 37 (`technical_audits`) | **RED** |
| Local Authority | 20 (non-NULL, tradies) | **RED — card MUST render** |
| Overall | 40.5 | **AMBER** |
| Header | 18 audits | **not "0 AI engines"** |

**Bondi Plumbing** (`0f531803-b529-4d09-9fd6-b6272b5baba8`):
| Dimension | Value | Expected band |
|---|---|---|
| AI Sentiment | 50 | **AMBER** |
| AI Presence | 0 | **RED** |
| Site Readiness | 21 | **RED** |
| Local Authority | NULL (tradies) | **skip/null state** (see F8 below) |
| Overall | 23.67 | **RED** |

### Step 4 — F8 (now unmasked): Local Authority when the score is genuinely NULL
With the unwrap fixed, Metropolitan's card will render (score 20). But **Bondi's is genuinely NULL**
(S6b-02 defers `local_ai_trust_score` until `local_seo_results` exists). Current logic:
`if (!isSaas && localAuthorityScore != null) { push(card) }` → the card is **omitted entirely** for a
non-SaaS brand with a NULL score.

Canon distinguishes two DIFFERENT states:
- **SaaS brand** → *"skip for SaaS brands"* → hidden entirely ✅ (keep this)
- **Non-SaaS, NULL score** → *"NULL until local_seo_results exists per S6b-02"* → **not-yet-measured**,
  not inapplicable. §6U.3's states list includes *"partial (insufficient data): show with the
  confidence_note caveat"* — that's the shape this should take.

Silently omitting it means a **tradie** — the persona for whom Local Authority is the MOST relevant
dimension — never learns it exists or that it's coming. **Render a null/"not yet measured" state for
non-SaaS + NULL** (a card with the dimension name + a caveat), while keeping the SaaS hide. Severity
LOW-MED; do it in this fix since we're in the file.

### Step 5 — F9: the #1 Action's rationale
`rationale: topTask.description ?? topTask.explainability?.rationale ?? ""` → for a task with a NULL
description and no `explainability` property, this yields **`""`**. LLD 5607: *"An empty or generic
`rationale` is a build failure."* And the S9 RULE binds: S9 **RENDERS** the stored
`{ score, explainability }` from S6's annotations — it must not regenerate.
- Check whether the tasks route returns an `explainability` annotation at all (and whether the
  envelope unwrap was hiding it too — `/tasks` likely returns `{ tasks: [...] }`).
- If the annotation EXISTS but wasn't reachable → the unwrap fix may resolve F9 for free. Confirm.
- If S6 never stored an annotation for these tasks → REPORT it (that's an upstream gap, not an S9
  bug) and render an honest fallback rather than an empty string — never a blank rationale on the
  conversion screen.

## Verify (on screen — this is the whole point)
Screenshot BOTH:
1. `/brands/418f321f-.../health-check` → Sentiment **GREEN 100** · Presence RED 5 · Site Readiness RED
   37 · **Local Authority RED 20 (card present)** · Overall **AMBER 40.5** · header shows the real
   engine count (not 0).
2. `/brands/0f531803-.../health-check` → Sentiment **AMBER 50** · Presence RED 0 · Site Readiness RED
   21 · Local Authority **null/not-yet-measured state** · Overall **RED 23.67**.

## Constraints
- Do NOT change `classifyScore` — the `>=` thresholds are CORRECT (verified).
- Do NOT change the dimension set or the 3-band scale — the LLD reconciliation (S9-02) is RIGHT.
- Site Readiness MUST come from `technical_audits.score_composite`, not the audits-table composite.
- Defensive unwrap (`?.audit ?? null`) so a missing envelope → honest empty state, not a crash.
- Keep `assertBrandAccess` / tier gate / RLS on any route touched.

## Report back (paste inline)
1. The unwrap diff (the 3–4 lines).
2. Which route serves `technical_audits.score_composite` + the new Site Readiness binding (or a
   report if none exists).
3. **Both screenshots** vs the answer key — band by band.
4. F8: the non-SaaS NULL Local Authority state (what it renders now).
5. F9: does the unwrap fix reveal a stored rationale, or is it genuinely missing upstream?
