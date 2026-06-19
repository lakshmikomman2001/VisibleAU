# VisibleAU — Answer Capsules (D4) fix prompts
# From the built-UI review (visibleau-answer-capsules-BUILT-UI-REVIEW.md). Findings AC-01 + AC-02.
# Pins to Sprint 7 canon (sri-visibleau-sprint-7-prompt.md). TS strict, no `any`; design tokens only;
#   both light/dark themes. Editing: str_replace / exact-literal only — never sed/perl with pipes.
#
# THERE ARE TWO PATHS — pick ONE:
#   • OPTION A (recommended, full feature): PROMPT A1 (backend) → A2 (UI). Persists the questions so
#     the page lists them and "Suggest Rewrite" actually works. Run A1 first, verify, then A2.
#   • OPTION B (defer the formatter): PROMPT B only — a copy-only fix so the page stops advertising a
#     feature it can't invoke. Use this if you want to move on and build the formatter later.
# Do NOT run both A and B. (B is a subset of what A delivers.)

═══════════════════════════════════════════════════════════════════════════════
OPTION A · PROMPT A1 — BACKEND (run first) · persist the per-question capsule data
═══════════════════════════════════════════════════════════════════════════════

> You are making the Answer Capsules data actionable. Today the crawl finds question headings and
> checks each for a 20–25 word capsule, but only the COUNTS survive into `findings.content`
> (`answerCapsulesFound`, `answerCapsulesSuggested`) — the question text is discarded, so the UI
> can't list which questions need capsules or call the rewrite endpoint. This adds the per-question
> list. **Additive JSONB — no migration, and scoring must NOT change.**
>
> **1. Emit a `questions[]` array.** In the answer-capsule detection
> (`lib/answer-capsules/find-questions.ts` + `check-capsule.ts`, called during the crawl and consumed
> by the `score-ssr` step's `checkSSR()` which returns `findings.content`), collect one entry per
> question heading found:
> ```
> questions: Array<{
>   heading: string,        // the H2/H3 question text, e.g. "What suburbs do you service?"
>   hasCapsule: boolean,    // true if a 20–25 word direct answer follows it (check-capsule result)
>   excerpt: string         // the content currently below the heading (slice ~200 chars) — needed by the rewrite endpoint
> }>
> ```
> `answerCapsulesFound` = `questions.filter(q => q.hasCapsule).length`, and the total questions =
> `questions.length` (so the UI's Total / With / Need all derive from this one array, staying
> consistent with the existing counts).
>
> **2. Add it to the `findings.content` shape** (the EB5 `content` block in the findings JSONB type —
> Sprint 7 prompt, the `content: { … }` definition) additively, everything else unchanged:
> ```
> //   content: {
> //     score: number,  // /12  (UNCHANGED formula)
> //     wordCount: number, answerCapsulesFound: number, answerCapsulesSuggested: number,
> //     questions: Array<{ heading: string, hasCapsule: boolean, excerpt: string }>,   // NEW (additive)
> //     ssr: { … }, negativeSignals: […], promptInjections: […]
> //   },
> ```
> `findings` is already `jsonb` → **no migration**. Older audit rows without `content.questions` must
> be tolerated by the UI (fall back to the counts / an EmptyState).
>
> **3. Scoring UNCHANGED.** `scoreContent` (/12) keeps `ssrScore(0-6) + capsuleScore(0-6)` with
> `capsuleScore` from `capsulePassRate = answerCapsulesFound / totalQuestions` exactly as today. The
> `questions[]` array is descriptive/presentational — it must NOT change `capsuleScore`,
> `scoreContent`, `scoreComposite`, or `rollupTo5Categories`. After this change a re-run on an
> unchanged site yields the same `scoreContent`/`scoreComposite`/rollup as before.
>
> **4. Tests** (`tests/unit/answer-capsules/check-capsule.test.ts` or a new `find-questions.test.ts`):
> assert `questions[]` shape; `answerCapsulesFound === questions.filter(hasCapsule).length`; total ===
> `questions.length`; an all-have-capsules page → score unchanged vs the count-based computation.
>
> **5. Validation fixture.** Extend the existing Marrickville mock-brand fixture so its latest
> `findings.content.questions` holds a realistic array (e.g. 4 questions, 0 with capsules, each with a
> heading + a short excerpt) matching the current Bondi screenshot (Total 4 / With 0 / Need 4), so the
> UI is checkable without a live crawl.
>
> **Verify before reporting done:**
> - A re-run (or the seed) populates `findings.content.questions[]` with `{heading, hasCapsule,
>   excerpt}` per question; `answerCapsulesFound` matches `filter(hasCapsule).length`.
> - `scoreContent`, `scoreComposite`, and the 5-cat rollup are unchanged on an unchanged site.
> - `npm run typecheck` + the answer-capsule unit tests pass.
> Report the files changed.

─────────────────────────────────────────────────────────────────────────────

═══════════════════════════════════════════════════════════════════════════════
OPTION A · PROMPT A2 — UI (run after A1 verifies) · list questions + working Suggest Rewrite
═══════════════════════════════════════════════════════════════════════════════

> You are adding the per-question list + on-demand "Suggest Rewrite" to the Answer Capsules page.
> Authority: Sprint 7 canon (the `POST /api/answer-capsules/generate` endpoint) + the now-persisted
> `findings.content.questions[]` from PROMPT A1. Keep the existing stats cards. No schema/scoring change.
>
> **ROUTE CHECK FIRST.** Grep for the real Answer Capsules page path (canon is
> `app/(auth)/brands/[brandId]/answer-capsules/page.tsx`; the build may differ, e.g. `/technical/…`).
> State the route you found and used.
>
> **1. Keep the three stat cards** (Total Questions / With Capsules / Need Capsules) — they're correct.
> Derive them from `content.questions` (total = length; with = `filter(q => q.hasCapsule).length`;
> need = total − with) so they stay consistent with the list below.
>
> **2. Add a "Questions" list** below the stats, one row per `content.questions[]`:
> - the `heading` text;
> - a status badge — `success` "Has capsule" when `hasCapsule`, else `warning` "Needs capsule";
> - for rows where `!hasCapsule`, a **"Suggest Rewrite"** button.
> If `content.questions` is absent (older audits) or empty, render the existing EmptyState / "Re-run
> the technical audit" message.
>
> **3. Wire "Suggest Rewrite"** to `POST /api/answer-capsules/generate` with body
> `{ brandId, question: row.heading, existingContent: row.excerpt }`; on success it returns
> `{ capsule: string }` — show the returned ~20–25 word capsule inline under that row (a result card
> like the prototype's "Generated answer capsule" block: the capsule text in a mono/subtle box, with a
> copy button). Show a loading state on the button while the request is in flight and an inline error
> state on failure. This is on-demand only (one call per click) — do NOT batch-generate or call it on
> page load (canon: never during the crawl; haiku, ~0.1¢/call).
> - Note: canon defines NO persistence for generated capsules (no saved/deployed model), so the
>   generated capsule is shown for copy/paste only — do NOT add a "deploy"/"save" action or a
>   "Saved capsules" list (that part of the old prototype has no backing data; leave it out).
>
> **4. Keep the "What is an Answer Capsule?" explainer.** Now that Suggest Rewrite is real, the
> explainer's reference to it is accurate — leave it (or point it at the per-row button).
>
> **Verify before reporting done:**
> - The page lists each question from `content.questions` with the right Has/Needs-capsule badge;
>   the stat cards match the list.
> - "Suggest Rewrite" on a needs-capsule row calls the generate endpoint and renders the returned
>   ~20–25 word capsule inline (with loading + error states); no deploy/save action exists.
> - Older audits (no `content.questions`) show the EmptyState, no crash.
> - Both themes; no console errors; `npm run typecheck` passes.
> Report the route used and the files changed.

─────────────────────────────────────────────────────────────────────────────

═══════════════════════════════════════════════════════════════════════════════
OPTION B (defer the formatter) · copy-only · stop advertising the uninvokable feature
═══════════════════════════════════════════════════════════════════════════════

> Use this ONLY if you are NOT building the per-question formatter now (otherwise use Option A). On
> the Answer Capsules page (grep for the real route — canon
> `app/(auth)/brands/[brandId]/answer-capsules/page.tsx`), the "What is an Answer Capsule?" explainer
> says "Use the 'Suggest Rewrite' feature via the API to generate AI-written capsules for headings
> that lack them." — but the page has no Suggest-Rewrite control, so it advertises an action the user
> can't take here.
> Change that sentence so it doesn't promise an on-page feature that doesn't exist — e.g.
> "Answer capsules can be generated on-demand for headings that lack a direct answer." Do NOT add a
> non-functional button; keep the three stat cards and the rest of the explainer as-is. No
> data/scoring change.
> Verify: the explainer no longer references a "Suggest Rewrite" feature the page can't invoke;
> `npm run typecheck` passes. Report the file changed.

─────────────────────────────────────────────────────────────────────────────

## Notes (not part of the paste)
- **Option A** delivers the canon-correct version of what the prototype was gesturing at — a working
  per-question Suggest Rewrite — WITHOUT the prototype's unbacked "Saved capsules / Deployed / Draft"
  workflow (canon has no persistence for generated capsules, so that stays out).
- **Option B** is the move-on-now choice: one sentence, no feature, defer the formatter to a later
  sprint. Either is correct; it's a scope call.
- Both are additive/presentational and touch no scoring/security/composite.
