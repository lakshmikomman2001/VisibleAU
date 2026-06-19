# Gate-2 PASS 2 — Reviewer Handoff — VisibleAU Sprint 7: per-page SSR + Signals sub-page
# Purpose: RE-REVIEW the fixes applied after Gate-2 pass 1. Confirm each finding is resolved, no
# regressions were introduced, AND independently adjudicate ONE disagreement (S7S-03) where the
# fixing chat overrode the pass-1 reviewer. You do not implement — verify against canon, return a verdict.

---

## 0. What to upload into this chat (ask Sri if missing)
**Canon (verify against — these are UNMODIFIED; the change set has not been folded in yet):**
1. `sri-visibleau-sprint-7-prompt.md`  — Phase 1 Sprint 7 LLD, 1130 lines.
2. `visibleau-foundations-v1.12.md`     — Phase 1 schema/LLD.
3. `visibleau-prototype.jsx`            — Phase 1 prototype, 4661 lines.

**Pass-1 output (context):**
4. `visibleau-sprint7-ssr-signals-GATE2-FINDINGS.md`  — the pass-1 findings (S7S-01/02/03 + E1).

**The UPDATED change set (under re-review):**
5. `visibleau-prototype-SignalsAudit-component.jsx`          — v2 (fields reconciled to canon).
6. `visibleau-sprint7-ssr-perpage-signals-LLD-addendum.md`   — updated (Parts A & B).
7. `visibleau-sprint7-ssr-perpage-signals-BUILD-prompts.md`  — updated (Phase 1 + Phase 2).

If any are absent, ask Sri before reviewing. Do not review from memory.

---

## 1. Context (one paragraph)
Pass 1 returned PASS-WITH-FIXES: one MODERATE (**S7S-01**, prototype↔canon field-name mismatch), two
LOW (**S7S-02**, stale "8" in the SsrCheck card; **S7S-03**, a sub-page-count wording slip), and one
escalation (**E1**, the negative-signal explanatory prose has no backing field). The fixing chat
verified all four against canon and applied fixes — **but for S7S-03 it disagreed with the pass-1
reviewer's prescribed fix and applied a different one.** Your job: confirm S7S-01/S7S-02 are correctly
resolved, **independently rule on the S7S-03 disagreement**, confirm E1 is still open (not silently
resolved), and confirm the four invariants still hold + no new issues were introduced.

---

## 2. What changed since pass 1 (verify each)

| finding | what the fixing chat did | what you verify |
|---|---|---|
| **S7S-01** (MOD) | Rewrote `SignalsAudit` (item 5) to canon fields: negative rows `{ pattern, severity, count }`, injection rows `{ pattern, severity, element }`. Removed all `name`/`detail`. Build prompt FIX 2 already used the right fields; dropped the stray word "detail". | Item 5 has **zero** `name:`/`detail:` field defs and renders `pattern`/`count`/`element`. Item 7 FIX 2 row spec matches canon fields and says no `detail`/`name`. |
| **S7S-02** (LOW) | Documented a one-line prototype patch at the top of item 5 (SsrCheck "All 8…" → "All 6…"). Build prompt FIX 1 status card is dynamic from `content.ssr.pagesChecked` and explicitly **supersedes** the hardcoded 8. | The patch in item 5 is correct (SsrCheck card has 6 rows ⇒ "6"). Item 7 FIX 1 says the count is dynamic + supersedes "8". NOTE: canon `prototype.jsx` (item 3) still literally says "All 8" — that's expected; the patch is applied by Sri *after* this gate. Just confirm the patch is correctly specified. |
| **S7S-03** (LOW) | **Overrode the pass-1 fix.** Fixed addendum B1 wording (overview + **6 dimension sub-pages** → add a **7th dimension sub-page**) and kept EG3 at **6→7** — NOT the pass-1 reviewer's **6→8**. | **Adjudicate independently — see §3.** Also confirm B1 is now internally consistent (no "six entries" then seven names). |
| **E1** (escalation) | Did NOT resolve it. Defaulted to display-only (no invented `detail` field); flagged it open for Sri, plus a canon ambiguity (L40 "scored 0-10" vs L572 `count`). | Confirm item 5 invents **no** `detail` field and is display-only; confirm E1 is flagged open, not silently decided. Do **not** decide E1 yourself — it's Sri's call. |

---

## 3. THE S7S-03 ADJUDICATION (your primary task this pass)
Two positions are in conflict. Rule on which is correct by reading canon yourself — do not defer to
either chat.

- **Pass-1 reviewer's position:** canon §4 lists **7** sub-page routes, so after adding Signals there
  are **8**; therefore EG3's "All 6 sub-pages" is an undercount and should become **6 → 8**.
- **Fixing chat's position:** §4's seven `page.tsx` files are the `technical-audit` **overview** *plus*
  **6 dimension sub-pages**; the overview does the 5-cat rollup (reads all of `findings` + score
  columns), not a single `findings[key]`, so it is **not** one of EG3's "6". Therefore EG3 = **6 → 7**,
  and the new Signals page is the **7th dimension sub-page**.

**Evidence to check (grep, confirm or refute each):**
- §4 route list — is `technical-audit/page.tsx` annotated as the overview ("8-dim drill-down + 5-cat
  rollup, EC5 spec"), distinct from the other six? (S7 ~L392–401; grep `technical-audit/page.tsx`)
- EG3 note — what exactly does "All 6 sub-pages read from technical_audits.findings" scope to? (S7
  ~L403; grep `All 6 sub-pages`)
- **The deciding line — the EG3 changelog entry:** does it say the six are *dimension* sub-pages that
  read `findings[key]`, explicitly excluding the overview? (S7 ~L1117; grep `dimension sub-pages`)
- EC5 — does the overview fetch pattern read the whole `findings` + scores and run
  `rollupTo5Categories`, rather than one `findings[key]`? (grep `EC5`, `rollupTo5Categories`)

**Your ruling (state explicitly):** EG3 should be **6 → 7** OR **6 → 8** — with the canon citation
that settles it. If you rule 6→7, confirm the addendum is now correct (it says 6→7). If you rule 6→8,
return a fix prompt to change the addendum's B2 + changelog. Either way, confirm B1's wording is
internally consistent.

---

## 4. Pass-2 verification checklist (PASS requires all)
**A. S7S-01 resolved**
- [ ] Item 5 `SignalsAudit`: negative rows `{ pattern, severity, count }`; injection rows `{ pattern, severity, element }`; **no** `name`/`detail` anywhere.
- [ ] Item 7 FIX 2: row spec = `pattern`+`severity`+`count` (negative) and `pattern`+`severity`+`element` (injection); no `detail`/`name`.
- [ ] Item 5 still reads `findings.content.*` for detail + `scoreSignals` column for /6 (not `findings.signals`).

**B. S7S-02 resolved**
- [ ] Item 5's documented SsrCheck patch is correct ("8"→"6"); item 7 FIX 1 card is dynamic (`content.ssr.pagesChecked`) + supersedes "8".
- [ ] Flag for Sri: apply the SsrCheck patch to `prototype.jsx` when folding the change set in.

**C. S7S-03 adjudicated** (see §3) — explicit 6→7 vs 6→8 ruling with canon citation; B1 internally consistent.

**D. E1 still open**
- [ ] Item 5 invents no `detail`/description field; is display-only; E1 flagged open (incl. the L40-vs-L572 `count` ambiguity). Not silently resolved.

**E. Invariant re-check (the four from pass 1 — confirm still PASS after the fixes)**
- [ ] (1) Scoring byte-identical — the fixes are doc/prototype-only; nothing touches `scoreContent`/`scoreSignals`/`scoreComposite`/rollup.
- [ ] (2) Signals page reads `findings.content` (+ `scoreSignals` column) — fetch pattern in addendum B2 unchanged; prototype now reflects the correct fields.
- [ ] (3) No DB migration — still additive/presentational.
- [ ] (4) Route detected, not assumed — Phase 2 route-detection unchanged.

**F. No new issues introduced by the edits**
- [ ] B1 (rewritten) does not contradict B2 or the changelog.
- [ ] The FIX 1 supersession note does not contradict the dynamic-card spec.
- [ ] Item 5's rewrite is still design-system-consistent (PageShell/Card/Badge, tokens, 0/6-red).

---

## 5. E1 — for Sri, not the reviewer (just confirm it's untouched)
E1 is a content-model decision the fixing chat correctly left to Sri: (a) ship display-only
(`pattern`/`severity`/`count`), or (b) persist a `detail` string via the `score-signals` step (a small
additive backend + LLD change). Plus a canon clarification: L40 says each pattern is "scored 0-10"
while L572 calls the value `count`. **Do not pick (a)/(b) or resolve the ambiguity** — only verify the
change set didn't silently do so and that "Part B presentation only" still holds.

---

## 6. Review rules (apply these)
- **LLD wins over the prototype.** **Verify by grep against the uploaded canon** — do not pass/fail
  from this handoff's or either chat's claims. **Reject absence-grep false-fails.**
- **Flag, don't invent.** Any *new* LLD-level gap → escalate to Sri, don't patch into the change set.
- **A ready-to-paste fix prompt for every issue** (incl. minor): file + exact change + verification grep.
- **Editing rule for any fix you write:** `str_replace` or exact-literal Python only — never `sed`/`perl`
  with pipe delimiters.
- English only.

---

## 7. Output format expected
1. **Verdict:** PASS / PASS-WITH-FIXES / FAIL.
2. **Resolution status per finding:** S7S-01 RESOLVED/NOT · S7S-02 RESOLVED/NOT · **S7S-03 — your 6→7
   vs 6→8 ruling + citation** · E1 confirmed-open/not.
3. **Invariant re-check:** explicit PASS/FAIL on the four in §4E.
4. **New findings (if any):** id · severity · what · canon location · ready-to-paste fix.
5. **Hand-back note:** what Sri must do when folding the change set into canon (apply the SsrCheck
   patch; register `'signals'`; apply the addendum; resolve E1).
