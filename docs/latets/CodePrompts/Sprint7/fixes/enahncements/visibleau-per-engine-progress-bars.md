# VisibleAU — Enhancement: per-engine progress bars on the live audit screen — Claude Code prompt
# What: under the aggregate "Querying 4 engines × 10 prompts × 5 runs (113/200 LLM calls)" row, show
#   FOUR per-engine progress bars (ChatGPT / Claude / Gemini / Perplexity), each with its own
#   completed/total count + percentage, so the user can see which engine is ahead/lagging.
# Scope: a prototype design (Figma-style, matching the existing AuditProgress component) + a MINIMAL
#   backend change to emit per-engine counts + the UI. Pins to Sprint 3 `run-audit.ts` (the engine
#   loop) + the existing live-progress component. TS strict; design tokens only; both themes;
#   str_replace/exact-literal only.

╔═══════════════════════════════════════════════════════════════════════════════╗
║ CONTEXT (verify in the repo before coding):                                     ║
║ • The live-progress screen already exists (the stepped checklist + aggregate     ║
║   bar + cost/mentions/avg-position cards). FIND the component that renders it     ║
║   (search "Querying" / "LLM calls" / "Detecting brand mentions") and the         ║
║   endpoint/poll it reads progress from. Extend THAT — do not build a new screen.  ║
║ • Backend loop (Sprint 3 run-audit.ts): for (const engine of engines) { for      ║
║   prompts { for runs } } — so each engine does prompts.length × RUNS_PER_PROMPT   ║
║   calls (paid: 10×5 = 50/engine; Free: 2 engines only). Per-engine progress is    ║
║   simply each engine's completed calls / (prompts.length × RUNS_PER_PROMPT).      ║
║ • Engines are tier-derived (enginesForTier) — Free = 2 (ChatGPT + Perplexity),    ║
║   paid = 4. RENDER ONLY THE ACTIVE ENGINES, not a hardcoded 4.                    ║
╚═══════════════════════════════════════════════════════════════════════════════╝

═══════════════════════════════════════════════════════════════════════════════
STEP 1 — PROTOTYPE (Figma-style; fold into the live-audit component in prototype.jsx)
═══════════════════════════════════════════════════════════════════════════════

> Add a per-engine progress block directly BELOW the aggregate "Querying …" step row, ABOVE
> "Detecting brand mentions". Match the existing AuditProgress design system exactly (same Card, the
> `--accent-blue` fill, the `progress-stripe` animation used by the main bar, text tokens). One row per
> ACTIVE engine. Fully-specified styling so Claude Code doesn't guess:
>
> ```jsx
> {/* PER-ENGINE PROGRESS — renders only active (tier-derived) engines */}
> <div className="mt-3 ml-9 space-y-2.5">   {/* ml-9 indents under the parent step's icon+gap */}
>   {engineProgress.map((e) => {
>     const pct = e.total > 0 ? Math.round((e.done / e.total) * 100) : 0;
>     const isDone = e.done >= e.total && e.total > 0;
>     return (
>       <div key={e.engine}>
>         <div className="flex items-center justify-between mb-1">
>           <div className="flex items-center gap-2">
>             {/* small engine dot/logo slot — use a 5px rounded dot in the engine's accent for now */}
>             <span className="w-1.5 h-1.5 rounded-full" style={{ background: isDone ? 'var(--accent-green, #22c55e)' : 'var(--accent-blue)' }} />
>             <span className="text-[12px] font-medium" style={{ color: 'var(--text-secondary)' }}>{e.label}</span>
>           </div>
>           <span className="text-[11px] font-mono tabular-nums" style={{ color: 'var(--text-tertiary)' }}>
>             {e.done}/{e.total} · {pct}%
>           </span>
>         </div>
>         <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: 'var(--bg-subtle)' }}>
>           <div
>             className="h-full rounded-full transition-all duration-500"
>             style={{
>               width: `${pct}%`,
>               background: isDone ? 'var(--accent-green, #22c55e)' : 'var(--accent-blue)',
>             }}
>           />
>         </div>
>       </div>
>     );
>   })}
> </div>
> ```
> Sample data for the prototype (mirrors the 113/200 screenshot mid-run — engines at different
> progress so the value of the feature is visible):
> ```jsx
> const engineProgress = [
>   { engine: 'chatgpt',    label: 'ChatGPT',    done: 38, total: 50 },
>   { engine: 'claude',     label: 'Claude',     done: 31, total: 50 },
>   { engine: 'gemini',     label: 'Gemini',     done: 24, total: 50 },
>   { engine: 'perplexity', label: 'Perplexity', done: 20, total: 50 },
> ];  // sums to 113/200 — consistent with the parent aggregate row
> ```
> Notes: bars are thin (h-1.5) and subordinate to the main bar (visually a sub-list, not four big
> bars). Completed engine → green dot + green bar. Keep the parent aggregate row as-is. Bump the
> prototype changelog (this is a prototype enhancement for the live-audit screen).

═══════════════════════════════════════════════════════════════════════════════
STEP 2 — BACKEND (minimal) · emit per-engine completed counts in the progress payload
═══════════════════════════════════════════════════════════════════════════════

> The live screen polls some progress source (find it — likely the audit row's status/progress fields
> or a progress endpoint the build added). Today it exposes an AGGREGATE completed-call count
> (113/200). Add a per-engine breakdown alongside it. Keep it additive — do NOT change the audit
> scoring, the call loop's behaviour, or the final `perEngineSummary`.
>
> 1. **Track per-engine completion.** In `run-audit.ts` (the `for (const engine of engines)` loop),
>    maintain a counter per engine as calls complete (you already increment an aggregate counter for
>    the 113/200 — increment a per-engine one in the same place). Each engine's total =
>    `prompts.length × RUNS_PER_PROMPT`.
> 2. **Expose it where the aggregate progress is exposed.** Add an `engineProgress` array to whatever
>    the live screen reads (the progress endpoint response, or the audit row's progress JSON — match
>    the existing mechanism; do not invent a new channel):
>    ```
>    engineProgress: Array<{ engine: string, done: number, total: number }>
>    ```
>    populated only for the ACTIVE engines (`enginesForTier(tier)`), so Free-tier audits return 2 rows,
>    paid return 4. `done` = that engine's completed calls so far; `total` = prompts × runs.
> 3. **Update cadence:** it must update as the audit progresses (same polling/refresh the 113/200 uses
>    — likely Inngest step updates or a periodic DB write). Don't add a heavier mechanism than what's
>    already there; piggyback on the existing progress write.
> 4. **No scoring/behaviour change:** the loop still runs identically; this only reports counts. The
>    sum of `engineProgress[].done` must equal the aggregate completed count (113 in the screenshot).
>
> If the build currently DERIVES 113/200 on the client (e.g. counts persisted citation rows) rather
> than tracking it server-side, prefer the SAME approach for per-engine: derive each engine's `done`
> from the same source (e.g. count citations/results grouped by engine) so the two stay consistent and
> you add no new write path. State which approach the build uses and which you extended.

═══════════════════════════════════════════════════════════════════════════════
STEP 3 — UI · render the per-engine bars from the real payload
═══════════════════════════════════════════════════════════════════════════════

> In the live-audit progress component (the real one, matching the prototype from Step 1), render the
> per-engine bars from the backend's `engineProgress` array, directly under the aggregate "Querying …"
> step row:
> - One thin bar per engine with `{done}/{total} · {pct}%`, `pct = round(done/total*100)`.
> - In-progress engine → `--accent-blue` bar; completed (done>=total) → green bar + green dot.
> - Render ONLY the engines present in the payload (tier-derived — 2 for Free, 4 for paid). Do not
>   hardcode 4 or assume engine names; map over what the backend returns.
> - Use the engine's display label (ChatGPT/Claude/Gemini/Perplexity) from a small engine→label map;
>   fall back to the raw engine key if unmapped.
> - Graceful states: before any call completes → all at 0/total · 0%; if `engineProgress` is absent
>   (older in-flight audits / the field not yet populated) → render nothing extra (just the existing
>   aggregate row), no crash.
> - Match the prototype styling exactly (thin h-1.5 bars, indented sub-list, tabular-nums counts).
>
> **Verify before reporting done:**
> - During a real (or mock) audit, the four per-engine bars appear under the aggregate row and ADVANCE
>   as calls complete; their counts sum to the aggregate (e.g. 38+31+24+20 = 113).
> - A Free-tier audit shows only 2 engine bars (ChatGPT + Perplexity); paid shows 4.
> - Completed engines turn green; the aggregate row + cost/mentions cards are unchanged.
> - Both light/dark themes; no console errors; `npm run typecheck` passes.
> Report the progress source used (server-tracked vs derived), the files changed, and a screenshot/
> description of the four bars mid-run.

─────────────────────────────────────────────────────────────────────────────

## Notes for Sri (not part of the paste)
- **Backend change is minimal and additive** — you already track the aggregate 113/200; per-engine is
  the same count split by engine (each engine does prompts×runs calls). No scoring or loop change.
- **The prototype is Figma-style and matches the existing live-audit component** (thin subordinate
  bars, the same accent-blue + stripe, green on complete) so Claude Code doesn't restyle the screen.
- **Tier-aware by design:** Free-tier audits run only 2 engines, so the UI maps over whatever the
  backend returns rather than assuming 4 — important so a Free audit doesn't show two empty bars.
- **One thing to confirm during build:** how the existing 113/200 is sourced (server-tracked in the
  audit row vs derived from persisted rows on the client). The prompt tells Claude Code to extend the
  SAME mechanism for per-engine so the two never disagree — worth eyeballing in the report.
- This is a pure UX enhancement to an existing (beyond-canon) progress screen — no canon/LLD change
  needed, but if you keep a running "build extras beyond canon" note, add the per-engine progress
  there for traceability.
