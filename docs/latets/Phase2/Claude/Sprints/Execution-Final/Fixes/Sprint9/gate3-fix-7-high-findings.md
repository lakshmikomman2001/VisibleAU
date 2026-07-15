# GATE 3 — THE 7 HIGH FIXES (blocking)

**Run in this order.** F-1 first because it is the only finding that can get **worse by accident**
(one `git checkout -- .` resurrects the deferred surface).

---

## 1. F-1 [HIGH] — ⚠️ COMMIT THE OQ-1 DELETIONS. THEY ARE UNSTAGED.

The 16-file local-SEO removal exists **only in the working tree.** `e2d8513` fixed the `serve()`
import and nothing else. **`git checkout -- .` resurrects the entire deferred surface** — the one S8
built against the §0.6 **DEFER** ruling.

```bash
cd c:/startup/VisibleAU/src
git status --short          # confirm the deletions are unstaged
git add -A
git commit -m "chore(oq-1): commit local-SEO surface removal (§0.6 DEFER)

The 16-file local-SEO surface, built by S8 against the §0.6 DEFER ruling,
was deleted in the working tree but never committed. e2d8513 fixed only
the dead serve() import.

Removes: db/schema/local-seo-results.ts, lib/local-seo/*,
components/domain/local-seo/*, app/api/local-seo/*, the local-seo page,
tests/unit/local-seo/*, the schema barrel export, and the
CREATE TABLE local_seo_results block in sprint-8-tables.sql."
```

**Then F-2 (MED, but do it now — same blast radius):** `db/migrations/0008_brief_luckman.sql` **still
`CREATE TABLE local_seo_results`**, and it's in the drizzle journal. **Any fresh environment recreates
the deferred table.**
- Either neutralise the `CREATE TABLE` block in `0008`, **or** add an explicit drop migration.
- ⚠️ **Only 6 of the journal's migrations are in `__drizzle_migrations`** — the rest were applied
  out-of-band as raw SQL. **That means CI / a new dev machine takes a different path than your local
  DB.** Report how you resolve this; it's a real infra hazard beyond local-SEO.
- **F-3:** remove the 4 dangling `local_seo_results` refs in the e2e helpers/specs
  (`tests/e2e/backend/helpers/db.ts:138`, `sprint2-workflow.spec.ts:69`,
  `sprint3-visibility.spec.ts:72`, `sprint4-reports.spec.ts:60`).

---

## 2. B-2 + B-3 [HIGH ×2] — ⚠️ EVERY REPORT EVER GENERATED IS DEGRADED

```ts
narrative-generator.ts:116   (trend as Record<string, unknown>).qualityStatus   // column: sampleQuality
narrative-generator.ts:134   (trend as Record<string, unknown>).compositeScore  // column: scoreCompositeAvg
```

**Impact — this is the F11 pattern at the report layer:**
- `qualityStatus` → **always `undefined`** → **RULE 1 (no causal language) and RULE 2 (confidence
  notes) have NEVER fired.** Every report ever produced is missing its epistemic caveats — the ones
  the LLD deliberately specified.
- `compositeScore` → **always `0`** → **every executive summary says "Visibility improved by 0.0
  points."** The key-win / key-gap branch has never executed.

⚠️ **The `(trend as Record<string, unknown>)` cast is what let this ship — it bypasses TypeScript.**
The compiler would have caught both.

**Task:**
1. Fix both field names to the real columns.
2. ⚠️ **DELETE THE CASTS.** Type `trend` properly so TS enforces the field names. **The cast is the
   bug's enabler** — leaving it in means the next rename does this again, silently.
3. **Sweep for the same pattern:**
   ```bash
   grep -rn "as Record<string, unknown>\|as any" lib/ app/ --include=*.ts | grep -iE "trend|score|audit|task"
   ```
   **Every one of these is a place TypeScript has been silenced. Report them all.**
4. **Regenerate a real report** for Metropolitan → confirm the exec summary shows a **real delta**
   (not 0.0) and the **quality caveats appear**. **Screenshot / paste the output.**

---

## 3. B-1 [HIGH] — LIVE 23502 CRASH on "Refresh agent readiness"

```ts
// EMITTER — agent-readiness/refresh/route.ts:42
send({ brandId, organizationId })                                    // ← organizationId
// LISTENERS ×3 — audit-entity-home.ts, refresh-entity-score.ts, score-agent-readiness.ts
const { brandId, orgId: organizationId, auditId } = event.data;      // ← expects orgId + auditId
```
`orgId` arrives **undefined** → NULL → **23502 NOT NULL violation.** `auditId` is missing entirely.
**The "Refresh agent readiness" button crashes.**

**This is the exact bug S7 already hit once** (destructured `organizationId`, emitted `orgId`). **It
recurred.**

**Task:** align the emitter to the listeners' contract (`orgId` + `auditId`), or vice versa — **pick
ONE and make all four agree.** Then ⚠️ **sweep EVERY event payload** for the same mismatch:
```bash
# For each createFunction, compare what it destructures against what its emitter sends:
grep -rn "event.data" inngest/functions/*.ts
grep -rn "\.send({" app/ lib/ inngest/ --include=*.ts
```
**Report the emitter↔listener field matrix.** This is a *class*, not an instance.

---

## 4. A-2 [HIGH] — THE CITATION-SOURCE-INTELLIGENCE PIPELINE HAS NEVER RUN

`build-citation-source-intelligence.ts:9` triggers on **`citations/classified`**.
`classify-citation-sources.ts` **never emits it.**

**A paid feature that has never executed in production. Not once.**

**Task:** add the emit at the end of `classify-citation-sources`. Then **run it for real** —
`citation_source_intelligence` must gain rows for Metropolitan. **Verify in the DB** (`SELECT COUNT(*)`),
not just that the code compiles.

⚠️ **Also A-3 (MED, same class):** `fanout-webhooks.ts:22` listens for **`recommendation.created`**;
`generate-recommendations.ts` never emits it → **recommendation webhooks are unreachable.** Fix
alongside.

⚠️ **A-1 / A-4:** `technical-audit-run.ts` emits **BOTH** `technical-audit.complete` (dot, **no
listener**) and `technical-audit/complete` (slash, works). **Delete the dead dot-emit.** This is the
**dot-vs-slash bug, still live.**

---

## 5. D-2 + D-3 [HIGH ×2] — F28 IS ~23 ROUTES, NOT 6

**D-2:** ~17 Growth+/Agency+ routes across **S4/S5** have **no server-side tier check** —
`entity-score`, `hallucinations`, `consensus-score`, `linkedin-presence`, `youtube-presence` (+ refresh
variants), `retrieval-audit`, `content-structure`, `crawler-logs`, `cdn-shield`, `citation-failure`,
`llmstxt`, `competitive-benchmark`, `visibility`.

**D-3 — worse:** **`drafts/[id]` and `tasks/[id]` bypass their parent's gate entirely.** The
collection routes call `assertTier`; the item routes don't. ⚠️ **A free-tier user who knows a UUID can
READ AND MODIFY individual drafts and tasks.** That's a write path, not just a read.

**Task:** apply `assertTier` (from F28's fix) to **every** route in D-2 and D-3.
- ⚠️ **`subscriptions.tier` ONLY** — never `organizations.tier`.
- **Break-proof, behaviourally** (the F28 lesson — a grep for `assertTier` proves nothing): disable
  the gate on **one D-2 route and one `[id]` route** → the free-tier test must go **RED with a 200 and
  a leaked payload**. **Paste both REDs.**
- ⚠️ **D-3's `[id]` routes need a write test too:** a free-tier **PATCH/DELETE** must 403. (F28's own
  break-proof found a `201` — a free user *creating* a task — because nobody tested the write path.)

**And D-1 (MED, do it here):** `lib/brands/index.ts:52` reads **`organizations.tier`**. It works only
because Stripe dual-writes both columns. **One billing path that updates one and not the other → a
silent desync.** Point it at `subscriptions.tier`.

---

## CONSTRAINTS
- **F-1 first** — it's the only one that worsens by accident.
- **Delete the `as Record<string, unknown>` casts** (B-2/B-3). Fixing the field names while leaving the
  cast means the next rename ships the same bug.
- **Behavioural break-proofs only.** A grep for `assertTier` is not a proof — F28 taught us that.
- Do **NOT** re-add local-SEO or recreate the module (§0.6 DEFER).
- Each fix gets a **regression guard** (Section-3 style: guard the behaviour, not the fix).

## REPORT BACK
1. **F-1 commit SHA** + how you resolved `0008_brief_luckman.sql` + the drizzle-journal/out-of-band
   discrepancy.
2. **B-2/B-3:** the diff, **the casts deleted**, the `as any`/`as Record` sweep results, and **a real
   regenerated report** showing a non-zero delta + the quality caveats.
3. **B-1:** the fix + **the full emitter↔listener field matrix** (any other mismatches?).
4. **A-2/A-3/A-1:** the emits added, the dead dot-emit deleted, and **`citation_source_intelligence`
   row count > 0** in the DB.
5. **D-2/D-3:** every route gated + **the two behavioural REDs** (read AND write).
6. Full suite green.
