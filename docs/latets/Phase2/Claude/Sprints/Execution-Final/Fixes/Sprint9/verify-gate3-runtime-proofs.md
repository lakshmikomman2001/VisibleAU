# RUNTIME PROOF — B-2/B-3 (the narrative generator) + A-2/A-3 (the dead pipelines)

## Why a code review is not enough for THESE two
Both fixes touch code paths that have **NEVER ONCE EXECUTED in the product's history**:
- **B-2/B-3:** `compositeScore` was always `undefined` → `Number(undefined) = NaN` → **the key-win /
  key-gap branch has never fired.** `qualityStatus` was always `undefined` → **the data-quality rules
  (RULE 1 no-causal-language, RULE 2 confidence-notes) have never appeared in ANY report the product
  has ever generated.**
- **A-2:** `build-citation-source-intelligence` listens for an event **nothing ever emitted.** The
  function has **never run.**

**Reviewing a path that has never executed is exactly the evidence that failed ~35 times across S9 +
Gate 3.** The code compiles. That was also true of F11, F15, F17, B-2, and B-3 — every one of which
compiled, passed tests, and lied.

⚠️ **Read the SERVER TERMINAL for both.** A dead event chain is **invisible in code** — that is
precisely how the dot-vs-slash bug survived a green grep for two sprints.

---

## PROOF 1 — Generate a real report and READ IT

### Setup
Metropolitan Plumbing = `418f321f-2489-4560-aaa9-895728580465` — **18 audits**, so it has real
`visibility_trends` history (the data the exec summary needs).

```bash
cd c:/startup/VisibleAU/src
# Confirm the trend data the generator reads actually exists and is non-zero:
psql "$PROD" -c "
  SELECT week_start, score_composite_avg, sample_quality, citation_rate
  FROM visibility_trends
  WHERE brand_id='418f321f-2489-4560-aaa9-895728580465'
  ORDER BY week_start DESC LIMIT 4;"
```
⚠️ **Build the answer key BEFORE reading the report** (the F11 discipline). If the last two weeks'
`score_composite_avg` are e.g. 39.8 → 36.3, **the exec summary must say a delta of ≈ −3.5** — a real,
signed number.
**If `score_composite_avg` is NULL/0 for every row, say so** — then the generator can't produce a real
delta regardless, and *that* is the finding (an upstream `aggregate-visibility-trend` problem, not
B-3).

### Generate
Trigger the report the way the app does (the `/reports/generate` route, or the
`generate-narrative-report` Inngest fn directly — whichever is the real path).

### ⚠️ READ THE OUTPUT — this is the proof
Paste the **actual generated exec-summary text**, and answer:
1. Does it show a **real, signed delta** — or still **"Visibility improved by 0.0 points"**?
2. ⚠️ Do the **data-quality caveats** appear? (RULE 1 — no causal language; RULE 2 — confidence
   notes.) **They have never appeared in any report this product has produced.** If `sample_quality`
   is `low`/`insufficient` for these weeks, the caveats MUST now be present.
3. Does the **key-win / key-gap** branch execute (it was gated on the NaN)?
4. ⚠️ **Does the delta MATCH the DB answer key from the setup step?** A number rendering is not a
   number being *right*.

**If it still says 0.0 → the fix did not take. Report that plainly.**

---

## PROOF 2 — Run a real audit and WATCH THE TERMINAL

### Before
```bash
psql "$PROD" -c "SELECT COUNT(*) AS csi_rows FROM citation_source_intelligence;"
psql "$PROD" -c "SELECT COUNT(*) AS wh_rows FROM webhook_deliveries;"
```
⚠️ **`citation_source_intelligence` should be 0 or near-0 — the function has NEVER fired.** Record
both numbers.

### Run
Trigger a **real audit** for Metropolitan (the app's own "Run audit" button, or the `audit/requested`
event). Mock LLM mode is fine — the point is the **event chain**, not the LLM output.

### ⚠️ WATCH THE SERVER TERMINAL — the load-bearing step
You are looking for the chain to actually propagate:
```
✓ run-audit                              → emits audit/complete
✓ classify-citation-sources              → ⚠️ MUST now emit citations/classified
✓ build-citation-source-intelligence     → ⚠️ MUST now EXECUTE (it never has)
✓ generate-recommendations               → ⚠️ MUST now emit recommendation.created
✓ fanout-webhooks                        → ⚠️ MUST now receive it
```
**Paste the terminal output.** If `build-citation-source-intelligence` **does not appear**, the emit
is still not reaching it — **and no amount of code review will tell you that.**

### After
```bash
psql "$PROD" -c "
  SELECT COUNT(*) FROM citation_source_intelligence
  WHERE brand_id='418f321f-2489-4560-aaa9-895728580465';"
psql "$PROD" -c "SELECT COUNT(*) FROM webhook_deliveries;"
```
⚠️ **`citation_source_intelligence` MUST be > 0.** A compiling emit is a claim; **a row is a proof.**

**And check for the failure mode this class produces:** if the function *ran* but wrote **zero rows**,
that's a *second* bug (it fired but did nothing) — inspect the terminal for a silent early-return.

---

## ⚠️ WHAT TO DO IF SOMETHING FAILS
- **The report still says 0.0** → either the fix didn't take, or `visibility_trends.score_composite_avg`
  is itself NULL/0 (an upstream aggregation bug). **The setup query distinguishes them — say which.**
- **`build-citation-source-intelligence` never appears in the terminal** → the emit isn't landing.
  Check the event name **character by character** (`citations/classified` — slash, plural, exact) on
  BOTH sides. **This is the dot-vs-slash class; it has bitten twice.**
- **It runs but writes 0 rows** → a silent early-return. Read the function's guards.

**A failed proof is a finding, not an embarrassment. Report it plainly — do not adjust anything to
make it pass.**

## REPORT BACK (paste inline)
1. **The DB answer key** (last 4 weeks of `visibility_trends` for Metropolitan).
2. ⚠️ **The generated exec-summary TEXT, verbatim.** Real signed delta matching the answer key? **Do
   the quality caveats appear?**
3. ⚠️ **The server terminal during the audit** — does `build-citation-source-intelligence` **execute**?
4. **`citation_source_intelligence` row count: before → after.** Must be > 0.
5. **`webhook_deliveries`: before → after** (A-3).
6. Any failure, stated plainly.
