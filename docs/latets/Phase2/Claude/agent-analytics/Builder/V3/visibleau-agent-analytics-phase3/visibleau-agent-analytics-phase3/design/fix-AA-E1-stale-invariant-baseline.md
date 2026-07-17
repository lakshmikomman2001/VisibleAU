# FIX AA-E1 [MED] — §9 invariant baseline is stale (and the root cause is in canon)

## The finding
The Agent Analytics LLD §9 declares its invariant delta as:
- `serve() 25/25 → 28`
- `37 tables → 40`

It **faithfully cited canon** — Phase 2 LLD v8.70 states `serve()=25/25` and `37 tables` in every
revision header. **So the AA LLD is not wrong about what canon says.** But **canon is stale**, and we
proved it this session:
- ⚠️ **serve() = 40 today** — verified via `scripts/qa/inngest-serve-manifest.txt` (canon froze "25" at
  ~P2-S3 while ~15 functions were added across S4–S9; the phantom-writer removal then took it 41→40).
- ⚠️ **71 tables total** (34 Phase-1 + 37 Phase-2). Canon's "37" is the Phase-2-only count stated as if
  it were the platform total.

**Consequence:** after building Agent Analytics, serve() is actually **~43** (40+3), not 28, and tables
**~74** (71+3), not 40. **A reviewer trusting §9 builds against the wrong invariant.** This is the exact
propagation the Phase 2 handoff warned about — *"a wrong baseline propagates into Phase 3"* — happening
in a real Phase 3 doc.

⚠️ **The deltas are correct** (+3 functions, +3 tables, +1 GAP). **Only the baselines are wrong.** And
the root cause is in **canon (v8.70)**, not the AA LLD — so this fixes both, or v8.70 hands the same
stale numbers to the *next* Phase 3 design too.

**These are DOCUMENTATION files (design + canon). No code changes. READ then edit.**

---

## PART 1 — Fix the Agent Analytics LLD §9

File: `agent-analytics/visibleau-agent-analytics-LLD-v1.3.md`, §9 (AA-20) invariant table.

**Change the baselines (keep the deltas):**

| Invariant | Was (stale) | Fix to |
|---|---|---|
| **Tables** | 37 → 40 | **71 → 74** *(34 Phase-1 + 37 Phase-2 = 71; +3 AA tables = 74)* |
| **serve()** | 25/25 → 28/28 | **40 → 43** *(canonical source: `scripts/qa/inngest-serve-manifest.txt`)* |
| **GAPs** | 16 → 17 | **16 → 17** *(unchanged — correct)* |
| **Layers** | 7 → 7 | **7 → 7** *(unchanged — correct)* |

⚠️ **Add a note** in §9 so this doesn't get "corrected" back:
> *"Baselines reflect the TRUE post-Phase-2 state (serve()=40 per the manifest, 71 tables total),
> not v8.70's header figures, which were frozen at ~P2-S3 (serve()=25) and count Phase-2 tables only
> (37). Function count's source of truth is `scripts/qa/inngest-serve-manifest.txt` — do not hard-code
> a number that will go stale again."*

⚠️ **Also check §0.2 / §0.2b** — the ledger entries AA-C3 and AA-C12 quote canon's "37 tables, 16 GAPs,
serve()=25/25" as the thing being reconciled against. **Leave those as historical record** (they
correctly describe what canon *said* at audit time) — but if any *live* baseline statement outside the
§9 table repeats "25" or "37" as current truth, fix it too. **Report every occurrence you change vs
leave, and why.**

---

## PART 2 — Sync canon v8.70 (the root cause)

File: `phase-2-canon/visibleau-phase2-LLD-v8.70.md`

⚠️ **This is the actual bug.** v8.70 repeats `serve()=25/25`, `37 tables`, `16 GAPs` in ~20 revision
headers. The GAP count (16) is right; the other two are stale.

```bash
cd /tmp   # or wherever canon lives in the repo — c:/startup/VisibleAU/... 
grep -nc "serve()=25/25" <path>/visibleau-phase2-LLD-v8.70.md
grep -nc "37 tables\|37 Phase 2 tables" <path>/visibleau-phase2-LLD-v8.70.md
```
**Decide the correction with Sri before mass-editing** — two options:
- **(A) Update every header** to `serve()=40`, `71 tables (34 P1 + 37 P2)`. Accurate but touches ~20
  lines and rewrites history in the headers.
- **(B) Leave the historical headers, add ONE authoritative "CURRENT INVARIANTS (as of Phase 2
  complete)" block** at the top of v8.70 stating: *serve()=40 (source: manifest), 71 tables (34+37),
  16 GAPs, 7 layers* — and note the per-revision headers are point-in-time.

⚠️ **Recommend (B)** — it's less destructive, preserves the audit trail, and gives future Phase 3
designs ONE place to read the truth. **But this is Sri's call — do not mass-edit canon unilaterally.**
Report the occurrence counts and propose; wait for the decision on A vs B.

**Whichever:** the number MUST point at `scripts/qa/inngest-serve-manifest.txt` as the function
source-of-truth, not a hard-coded literal — "25" survived 15+ additions precisely because it was a
literal nobody re-checked.

---

## CONSTRAINTS
- **Documentation only.** No code, no schema, no migration.
- ⚠️ **Do NOT edit the §0.2/§0.2b historical ledgers** to change what canon "said" — they're a record of
  the audit and are correct as history. Only fix *live current-truth* statements.
- **Do NOT mass-edit canon v8.70 unilaterally** — report counts, propose A vs B, get Sri's decision.
- Point function count at the manifest, never a bare literal.
- The AA GAP delta (16→17) and Layer count (7→7) are correct — leave them.

## REPORT BACK (paste inline)
1. **AA LLD §9** — updated to `serve() 40→43`, `tables 71→74`? Note added?
2. **Every "25"/"37" occurrence in the AA LLD** — which you changed (live baseline) vs left (historical
   ledger), and why.
3. **Canon v8.70** — occurrence counts for `serve()=25/25` and `37 tables`; your **A-vs-B
   recommendation** for the correction (do NOT apply the mass edit yet — await Sri).
4. Confirm the GAP (16→17) and Layer (7) figures were left unchanged.
