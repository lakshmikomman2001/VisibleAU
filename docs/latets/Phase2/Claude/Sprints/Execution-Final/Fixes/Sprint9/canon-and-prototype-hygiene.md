# CANON + PROTOTYPE HYGIENE (Gate 3 items **H** and **I/S9-02**)

## Why this is worth doing before anything else
Both items are **documentation that lies to the next sprint author.** Neither breaks running code —
which is exactly why they'll survive indefinitely unless fixed deliberately.

- **H:** §14 hands Phase 3 the numbers *"37 tables, **25** Inngest functions, 16 GAPs."* **Two are
  wrong.** `serve()` is **41** (canon froze at ~P2-S3); tables are **71** total.
- **I/S9-02:** ⚠️ **Stale prototype copies in `docs/` still render the Health Check with the WRONG
  dimensions** — 5 raw multidims instead of the 4 cross-layer ones. **Production code and the canonical
  prototype are correct; the stale copies are not.**

⚠️ **I/S9-02 is not cosmetic.** F11 — *the Health Check told every customer they scored 0/100
"Critical"* — was the worst bug of Sprint 9. **The next sprint author who opens the wrong `docs/` file
rebuilds it.** A stale spec is a bug generator.

---

## PART 1 — Fix the canon counts (H)

### The true numbers (all verified this sprint)
| Metric | Canon says | **Truth** | Evidence |
|---|---|---|---|
| Inngest functions | 25 | **41** | `serve()` array, post-`e2d8513`; manifest at `scripts/qa/inngest-serve-manifest.txt` |
| Tables | 37 | **71 total** (34 Phase-1 + **37 Phase-2**) | drift checker: 71 tables · 953 columns · 157 indexes, dev == prod |
| GAPs | 16 | **16** ✅ | fixed product-roadmap enumeration (GAP 1–16) |

**Note the tables subtlety:** "37" was **not wrong** — it counted **Phase-2 additions only**. But stated
bare, it reads as the platform total. **Decontextualised, not incorrect.** Fix by making it explicit.

### Task
```bash
cd c:/startup/VisibleAU/src
grep -rn "25 Inngest\|25 functions\|serve() stays 25\|still 25 fns\|37 tables" \
  docs/ --include=*.md | head -20
```
Find **every** occurrence across the LLD (v8.70) and all 9 sprint prompts — §12, §13, and §14 each
carry it.

**Replace with:**
> *"The 7-layer platform: **71 database tables** (34 Phase-1 baseline + 37 Phase-2 additions),
> **41 Inngest functions** (canonical list: `scripts/qa/inngest-serve-manifest.txt`), addressing
> **16 named product GAPs** (GAP 1–16, fixed enumeration)."*

⚠️ **Point the function count at the MANIFEST, not a hard number.** A number in prose goes stale the
moment a sprint adds a function — that is precisely how "25" survived 18 additions. **The manifest is
the source of truth and it is guarded by a set-difference test.**

---

## PART 2 — ⚠️ Kill the stale prototypes (I/S9-02) — the F11 landmine

### The situation
- ✅ **Production code** — correct (4 cross-layer dims)
- ✅ **The canonical prototype** — correct
- ❌ **Stale copies in `docs/`** — `V6`, `V7`, `V9`, `V10`, `V13`, `Sprint123`, `Execution-old` — **still
  show the WRONG 5-dimension raw multidim breakdown**

### The correct Health Check (from the S9 canon)
**4 CROSS-LAYER dimensions** — one per layer, each from its own canonical column:
| Dimension | Source |
|---|---|
| **Presence** (L2 Visibility) | `audits.score_frequency` |
| **Sentiment** (L2 Visibility) | `audits.score_sentiment` |
| **Site Readiness** (L1 Retrieval) | `technical_audits.score_composite` |
| **Local Authority** (L3 Trust) | `brand_entity_scores` → **NULL for SaaS = "not applicable"; NULL otherwise = "not yet measured"** |

❌ **NOT** the 5 raw multidims (`Frequency · Position · Sentiment · Context · Accuracy`) — **those are
the AUDIT DETAIL page's breakdown, a different screen.** ⚠️ **Conflating them IS F11.**

### Task
```bash
grep -rln "scorePosition\|scoreContext\|scoreAccuracy" docs/ | grep -i "health\|prototype"
find docs/ -iname "*prototype*" -o -iname "*FIX*" | sort
```
For **each stale copy**, do ONE of:
1. **DELETE it** if it's a superseded version (V6/V7/V9/V10 almost certainly are), **or**
2. **Mark it dead** — add at the very top:
   ```
   ⚠️ SUPERSEDED — DO NOT BUILD FROM THIS FILE.
   Canonical prototype: <path to FIX17>. This copy contains the pre-F11 Health Check
   (5 raw multidims) and will reproduce the F11 bug if used.
   ```

⚠️ **Prefer DELETION.** A file marked "superseded" still gets opened. **`Execution-old` is a name that
guarantees someone eventually reads it.**

**Then:** confirm **exactly one** canonical prototype remains, and that it shows the **4 cross-layer
dims**.

### Add the guard
```
No file under docs/ that describes the HEALTH CHECK may contain
scorePosition / scoreContext / scoreAccuracy.
```
Add to `scripts/qa/sprint9-invariants.sh` (A10 already asserts this for *code* — **extend it to
`docs/`**). **Re-break it:** re-add one → RED → revert.

---

## CONSTRAINTS
- **Do not touch production code.** Both parts are docs-only. Code is already correct.
- **Do not "fix" the stale prototypes** by editing them into correctness — **delete them.** Multiple
  competing prototypes is the disease; a third correct one doesn't cure it.
- **Point the canon at the manifest**, not at a hard-coded 41 — the number will go stale again.
- If a stale copy is referenced by another doc, **update the reference** to the canonical one.

## REPORT BACK (paste inline)
1. **Every place the stale counts appeared** (LLD + which sprint prompts) → confirm all updated.
2. **The new §14 line**, verbatim.
3. ⚠️ **Every stale prototype found** — deleted, or marked dead? **How many contained the wrong 5-dim
   Health Check?**
4. **Exactly one canonical prototype remains?** Confirm it shows the **4 cross-layer dims**.
5. **The docs guard + its re-break RED.**
