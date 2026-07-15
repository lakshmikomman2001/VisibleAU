# GATE 3 — CROSS-PROMPT AUDIT (all 9 Phase 2 sprint prompts)

## What Gate 3 is, and what it is NOT
**Canon (§14):** *"the final cross-prompt audit across all 9 sprint prompts (consistency of
conventions, event names, the cross-sprint contracts — the dual-emit, the fanout extension, the
brand-access gate, the unit rules, the CASCADE/SET NULL choices — **and that nothing one sprint defers
is left unbuilt by its owner**)."*

⚠️ **This is a SEAM audit, not a style audit.** Sprint 9 proved why:
**18/18 §12 greps were green while 29 findings shipped.** A document-level consistency check is exactly
what those greps were — and it caught nothing. **The bugs that cost us were all TWO-DOCUMENT problems**:
prompt A says X, prompt B says X′, **each is internally coherent, and the seam between them breaks the
product.**

**The actual cross-sprint failures we hit — this is the target class:**
| Seam | What broke | Cost |
|---|---|---|
| **`audit.complete` vs `audit/complete`** | dot-vs-slash event name | **silently broke 4 Inngest functions**, incl. `run-comparison-prompts` |
| **`organizationId` vs `orgId`** | destructured one, emitted the other | NULL → **23502 crash** |
| **`'complete'` vs `'completed'`** | status enum | broke bulk CSV export; recurred in the tracker query |
| **`subscriptions.tier` vs `organizations.tier`** | tier source of truth | the S8 footgun — **and the seed of F28** |
| **local_seo DEFERRED (§0.6) → built by S8 anyway** | a deferral ignored by a later sprint | 16-file surface + schema, removed; **left a dead import in `serve()` that shipped to `main`** |

**Every one:** internally consistent in isolation. **Only the pair is wrong.**

---

## THE METHOD — grep the SEAM, not the file
For each contract below: **enumerate every spelling/variant that exists across the 9 prompts AND the
code**, then assert **exactly one** survives. A finding is *"two spellings exist"* — not *"the string
is missing."*

**Where possible, prove it at RUNTIME, not in the document.** S9's lesson: a name being present in a
file proves nothing about whether the emitter and the listener agree.

---

## A — EVENT NAMES (the dot-vs-slash class — this one has already bitten)
```bash
cd c:/startup/VisibleAU/src
# EVERY event string emitted or listened for, across code AND prompts:
grep -rhoE '"[a-z-]+[./][a-z-]+(\.[a-z-]+)?"' inngest/ app/api/ lib/ | sort | uniq -c | sort -rn
grep -rhoE '`[a-z-]+[./][a-z-]+`' inngest/ app/api/ lib/ | sort -u
```
1. **Build the full event inventory:** every `event:` in a `createFunction`, every `.send({name:...})`.
2. ⚠️ **For EVERY event: does an emitter exist AND a listener exist?**
   - **Emitted, never listened for** → a dead emit (silent no-op)
   - **Listened for, never emitted** → a dead function (never fires — *this is what the dot-vs-slash
     bug produced*)
3. ⚠️ **Any event with TWO spellings** (`.` vs `/`, singular vs plural, tense) → **FINDING**.
4. **Dual-emit contract:** canon names it. Find every event emitted from two places and confirm that's
   deliberate, not accidental duplication.
5. **The queued S8-01 source emits:** `visibility/trend-updated` + `hallucination/acknowledged` —
   **do they emit? does anything listen?**

**Deliverable: a matrix — event × emitter(s) × listener(s).** Every row must have ≥1 of each.

## B — FIELD-NAME SEAMS (the `orgId`/`organizationId` class)
```bash
grep -rn "organizationId\|orgId" inngest/ app/api/ lib/ --include=*.ts | grep -iE "event|payload|send\(|data:" | head -40
```
⚠️ **For every Inngest event payload: does the EMITTER's field name match what the HANDLER
destructures?** That mismatch produced a NULL → **23502**. Check **every** event, not just the one we
found.
Same for: `brandId`/`brand_id`, `auditId`/`audit_id`, `taskId`/`task_id` across the event boundary.

## C — ENUM / STATUS SEAMS (`'complete'` vs `'completed'` — hit twice)
```bash
grep -rhoE "'(open|in_progress|ready_for_review|complete|completed|wont_fix|pending|done|current|failed|running)'" \
  app/ lib/ inngest/ components/ | sort | uniq -c | sort -rn
```
1. ⚠️ **`'complete'` vs `'completed'`** — enumerate every occurrence. **The DB enum is the truth.**
2. ⚠️ **`step.status` (`done|current|pending`) must NEVER mix with `remediation_tasks.status`**
   (`open|in_progress|ready_for_review|complete|wont_fix`). Canon: *"Do NOT unify them."*
3. Audit status, draft status, webhook delivery status — same treatment.

## D — THE TIER CONTRACT ⚠️ (F28's root — the highest-value check here)
```bash
grep -rn "organizations.tier\|organizationTier\|org\.tier" app/ lib/ --include=*.ts
grep -rn "subscriptions.tier\|subscriptionTier" app/ lib/ --include=*.ts | wc -l
```
- ⚠️ **`subscriptions.tier` is the SOLE source of truth. ANY read of `organizations.tier` is a
  FINDING.**
- ⚠️ **Every Growth+/Agency+ surface across ALL 9 sprints must gate SERVER-SIDE.** F28 found **6 of 9**
  S9 routes with no tier check — **the same audit has never been run on S1–S8's routes.**
  **Enumerate every tier-gated feature per canon, then assert its route calls `assertTier`.** Expect
  findings.

## E — THE BRAND-ACCESS GATE (S8b-01)
```bash
grep -rLn "assertBrandAccess" app/api/brands/**/route.ts
```
⚠️ **List every brand-scoped route that does NOT call `assertBrandAccess`.** Canon: *"the Autopilot
must not act outside a member's brands."* This must hold across **all 9 sprints' routes**, not just S9.
Cross-org → **404** (not 403).

## F — DEFERRAL ORPHANS ⚠️ (canon names this explicitly)
> *"…and that nothing one sprint defers is left unbuilt by its owner."*

**We already know this check catches things.** Build the deferral ledger:
1. **Every DEFER / "left for later" / "the owner is sprint N" across all 9 prompts** — enumerate.
2. For each: **was it built by its owner? Or built by someone else (a violation)? Or never built?**
3. ⚠️ **The known ones:**
   - **OQ-1 `local_seo_results` — DEFERRED (§0.6).** **S8 built a 16-file surface against the ruling.**
     Removed — but it **left a dead import in `serve()` that shipped to `main`** (`e2d8513`). ⚠️ **Sweep
     for OTHER residue:** any remaining reference to local-SEO in nav, types, tests, seeds, or docs?
   - **S6's `local_ai_trust_score` stays NULL by design (S6b-02)** until `local_seo_results` exists.
     **Confirm nothing treats that NULL as a bug or fabricates a value.**
   - **S9's carried:** F9/F13 explainability (→S6), F12 sparkline host table (→S10), F23 templates (→S7).
     ⚠️ **§13 calls an empty rationale a BUILD FAILURE — and it IS empty.** Is S6 the right owner, and
     is it actually queued?

## G — SCHEMA CONTRACTS (CASCADE / SET NULL / units)
```bash
grep -rn "onDelete\|ON DELETE" db/schema/ db/migrations/ | sort | uniq -c
```
- ⚠️ **Every FK: is the CASCADE/SET NULL choice consistent** for the same *kind* of relationship?
  (Deleting a brand should behave the same way everywhere.)
- **Unit rules:** scores 0–100 vs 0–1 (the S6 citation-band bug was **green ≥0.70 vs ≥0.50** — a unit/
  threshold seam). Percentages vs fractions vs basis points — **enumerate every score column and its
  range.**
- ⚠️ **`brand_entity_scores` has duplicate rows** (no uniqueness constraint — S8 carry). Any other
  table missing one?

## H — THE COUNTS CANON HANDS TO GATE 3 ⚠️
§14 says: *"37 tables, **25 Inngest functions**, 16 GAPs."*
- ⚠️ **`serve()` is 41** (verified; canon's 25 was frozen at ~P2-S3). **§12/§13/§14 are STALE.**
- **Verify the other two:** is it **37 tables**? (The drift checker found **71** — is 37 counting only
  Phase-2 additions?) Is it **16 GAPs**? **Reconcile all three numbers or Gate 3 inherits a false
  baseline.**

## I — THE QUEUED LLD-HYGIENE ITEMS (§14 names them)
Confirm each is still open, correctly owned, and hasn't silently rotted:
- **S7b-02** run-comparison step structure
- **S8-01** the `visibility/trend-updated` + `hallucination/acknowledged` source emits (→ **A5**)
- **S8b-01/02/03** brand-access + role-ceiling + privilege-audit formalisations
- ⚠️ **S9-02 Health Check prototype↔LLD reconciliation** — the prototype still renders the **wrong**
  dimensions (raw multidim). **The code is now correct; the PROTOTYPE is not.** It must move to the 4
  cross-layer dims, or the next sprint reading it rebuilds the bug.

---

## CONSTRAINTS
- ⚠️ **A finding is "two spellings exist," not "a string is missing."** Grep the SEAM.
- **Prove at runtime where possible.** A name present in a file proves nothing about emitter/listener
  agreement — that's what shipped the dot-vs-slash bug past a green grep.
- **Do NOT fix.** Gate 3 **reports**. Each finding gets a severity + owner; Sri decides.
- **Do NOT re-run S9's §12 greps** — they were 18/18 green while 29 findings shipped.

## REPORT BACK
1. **The event matrix** (event × emitter × listener). ⚠️ **Any dead emit / dead listener / two
   spellings?**
2. **Field-name seams** across event payloads (the `orgId` class).
3. **Enum seams** (`complete`/`completed`; step-status vs task-status bleed).
4. ⚠️ **D — every read of `organizations.tier`; every ungated tier surface across S1–S8.** *(F28 was
   only audited in S9.)*
5. **E — every brand-scoped route missing `assertBrandAccess`.**
6. ⚠️ **F — the deferral ledger.** Anything deferred and built anyway, or deferred and orphaned? **Any
   remaining local-SEO residue?**
7. **G — FK/unit inconsistencies.**
8. ⚠️ **H — reconcile 37 tables / 41 functions / 16 GAPs.** What should §14 say?
9. **I — the queued items**, esp. the **prototype↔LLD** Health Check gap.
10. **VERDICT: is Phase 2 coherent across its seams?** Every finding named, with owner + severity.
