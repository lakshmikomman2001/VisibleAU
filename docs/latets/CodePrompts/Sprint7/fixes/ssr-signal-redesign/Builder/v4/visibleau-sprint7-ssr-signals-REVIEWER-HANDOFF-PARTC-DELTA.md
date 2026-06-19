# Reviewer Handoff — DELTA review (Part C / E1) — VisibleAU Sprint 7: per-page SSR + Signals
# Scope: ONE additive delta on an already-PASSED change set. This is NOT a full re-review.
# The SSR-per-page + Signals-page change set passed Gate-2 pass 2 (PASS). After that, Sri chose E1
# option (b) — add readable per-row descriptions — and it was folded in as "Part C". Verify only that
# delta: faithful to canon, additive/safe, no regression to the four invariants, no new issues.

---

## 0. What to upload into this chat (ask Sri if missing)
**Canon (verify against — UNMODIFIED; the change set isn't folded in yet):**
1. `sri-visibleau-sprint-7-prompt.md`  — Phase 1 Sprint 7 LLD, 1130 lines.
2. `visibleau-foundations-v1.12.md`     — Phase 1 schema/LLD.
3. `visibleau-prototype.jsx`            — Phase 1 prototype, 4661 lines.

**Prior gate output (context — shows what already passed):**
4. `visibleau-sprint7-ssr-signals-GATE2-FINDINGS-PASS2.md`  — pass-2 verdict (PASS) + the open E1.

**The UPDATED change set (the delta is the new bits in 5–7):**
5. `visibleau-prototype-SignalsAudit-component.jsx`          — v3 (rows now render `detail`).
6. `visibleau-sprint7-ssr-perpage-signals-LLD-addendum.md`   — now includes **Part C** + an (E1) changelog bullet.
7. `visibleau-sprint7-ssr-perpage-signals-BUILD-prompts.md`  — Phase 1 gains **step 7**; Phase 2 FIX 2 renders `detail`.

Everything else in items 5–7 already passed pass 2 — re-confirm it didn't regress, but spend your effort on the delta.

---

## 1. The delta, precisely (this is all that changed since pass 2)
E1 resolution = option (b): negative-signal rows were terse (`pattern`/`severity`/`count` only), so a
plain-English `detail` was added. Four touches:
- **Addendum Part C (C1–C5):** adds `detail: string` to `findings.content.negativeSignals[]` and
  `.promptInjections[]` (additive JSONB); the `score-signals` detectors emit it at detection time;
  it's descriptive-only. B4 + changelog updated; C5 settles the count-vs-0-10 question.
- **Phase 1 build prompt step 7:** `detectNegativeAndInjection` (via `lib/negative-signals/detect.ts`
  + `lib/prompt-injection/detect.ts`) emits `detail`; shape extended; detector tests updated; the
  Marrickville fixture seeds `detail`; verification requires non-empty `detail` + unchanged scores.
- **Phase 2 build prompt FIX 2:** renders `detail` on both row types.
- **SignalsAudit prototype v3:** rows render `detail` (canon fields).

---

## 2. Canon facts to confirm (grep — don't trust this doc)
| # | Fact | Where (approx) | Grep token |
|---|---|---|---|
| G1 | Pre-delta shape: `negativeSignals[]` = `{ pattern, severity, count }`, `promptInjections[]` = `{ pattern, severity, element }`. Part C must ADD `detail`, not remove/rename these. | S7 L572–573 | `negativeSignals: Array`, `promptInjections: Array` |
| G2 | The emit point: `step.run('score-signals', () => detectNegativeAndInjection(crawl))`. | S7 ~L878 | `score-signals`, `detectNegativeAndInjection` |
| G3 | The detector libs exist and already compute the specifics (so emitting `detail` needs NO new detection logic): EE2/EE3 specify all 8+8 patterns' thresholds/selectors. | S7 ~L133, L304, L334, L1119 | `negative-signals/detect`, `prompt-injection/detect`, `EE2`, `EE3` |
| G4 | Scoring path is columns, not findings: `scoreSignals` column; `scoreComposite` sums `signals.score`; rollup reads columns. ⇒ a descriptive JSONB field cannot move a score. | S7 L533, ~L883–884, L376 | `score_signals`, `signals.score`, `scoreSignals) / 48` |
| G5 | The count-vs-0-10 question C5 resolves: L40 says patterns are "scored 0-10"; L572 persists `count`. | S7 L40, L572 | `Each scored 0-10`, `count: number` |

---

## 3. Delta checklist (PASS requires all)
- [ ] **D1 — additive, not destructive.** Part C / step 7 ADD `detail` to both arrays; the existing
  `pattern`/`severity`/`count`/`element` fields are untouched (G1). (Do not repeat the S7S-01 class.)
- [ ] **D2 — emit in the right place.** `detail` is produced by `detectNegativeAndInjection` / the two
  detector libs inside the `score-signals` step (G2/G3) — not somewhere that re-runs detection or
  touches scoring.
- [ ] **D3 — descriptive-only (no scoring impact).** Addendum C4 + Phase 1 step 7 both state `detail`
  must NOT feed `scoreSignals`/`scoreComposite`/rollup; Phase 1 verification asserts unchanged scores
  on an unchanged site (G4). Confirm the wording is unambiguous.
- [ ] **D4 — no migration.** `findings` is already `jsonb`; `detail` is an additive key. Confirm Part C
  claims no migration and that's correct.
- [ ] **D5 — render + fallback.** Prototype v3 and Phase 2 FIX 2 render `detail` (negative: pattern +
  severity + detail; injection: pattern + severity + detail + `element` mono). Older rows without
  `detail` tolerated (UI falls back to pattern + severity). Prototype still uses canon fields (now
  including the real `detail` field) — no `name`/wrong-field regression.
- [ ] **D6 — fixture.** Phase 1 step 7 extends the Marrickville fixture so `negativeSignals[]` /
  `promptInjections[]` rows carry `detail` (UI checkable without a live crawl).
- [ ] **D7 — C5 sound.** The count-vs-0-10 resolution (keep `count` as occurrence count; 0-10 is the
  detectors' internal per-pattern score, not persisted; `detail` is the readable copy) is consistent
  with canon (G5) and introduces no contradiction.

## 4. Invariant re-confirm (the four — the delta touches a backend step + findings shape, so re-check)
1. **Scoring byte-identical — ?** `detail` is additive JSONB + descriptive; scores via columns (G4).
2. **Signals page reads `findings.content` (+ `scoreSignals` column) — ?** Unchanged; now also reads `detail`.
3. **No DB migration — ?** Additive JSONB.
4. **Route detected, not assumed — ?** Untouched by this delta.

## 5. No-regression spot-check
- [ ] Addendum Part C is consistent with Part B and the changelog (no contradiction; B4 now points to Part C).
- [ ] Phase 1 step 7 doesn't conflict with steps 1–6 (SSR work) or the run-order.
- [ ] Prototype v3 is still design-system-consistent (PageShell/Card/Badge, tokens, 0/6-red) and the
  field rename from pass 2 is intact (no `name`/`detail`-as-wrong-field; `detail` is now a real field).

---

## 6. Review rules
- **LLD wins over the prototype.** **Verify by grep against canon**; reject absence-grep false-fails.
- **Flag, don't invent** — any new LLD-level gap → escalate to Sri, don't patch into the change set.
- **A ready-to-paste fix prompt for every issue** (incl. minor): file + exact change + verification grep.
- **Editing rule for any fix you write:** `str_replace` or exact-literal Python only — never `sed`/`perl` with pipe delimiters.
- English only.

## 7. Output format
1. **Verdict:** PASS / PASS-WITH-FIXES / FAIL (on the delta).
2. **Delta checks:** D1–D7 each PASS/FIX (cite canon for any FIX).
3. **Invariant re-confirm:** the four in §4, each PASS/FAIL.
4. **New findings (if any):** id · severity · what · canon location · ready-to-paste fix.
5. **Hand-back:** confirm the change set is build-ready, or list what remains.
