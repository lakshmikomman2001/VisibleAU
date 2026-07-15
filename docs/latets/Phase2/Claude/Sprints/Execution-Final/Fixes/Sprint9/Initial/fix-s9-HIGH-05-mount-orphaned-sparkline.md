# FIX S9-HIGH-05 (F12) — PromptTrendSparkline is ORPHANED: built, tested, grep-green, never mounted

## Severity: HIGH — a complete feature (route + query + component + states + tier gate) is invisible to users. The LLD added it because it is "one of the most-praised features across multiple competitors" (MentionDesk/Otterly parity) — so S9 ships without the competitive rationale it was scoped for.

## The finding
Everything EXCEPT the mount point is correct:
- **Route** (`app/api/brands/[brandId]/prompts/[promptId]/trend/route.ts`): v8.16-compliant —
  `JOIN audits a ON c.audit_id = a.id`, **zero** `citations.brand_id`, `assertBrandAccess` +
  `withRlsContext` + Growth+ gate. ✅
- **Component** (`prompt-trend-sparkline.tsx`): correctly coded, reads its envelope properly
  (`d.trend` — **no F11-class unwrap bug**), has loading/empty/error states. ✅
- **Mount:** ❌ **NO PAGE IMPORTS IT.** The "prompt-results table" the spec places it in
  (§6U.5: "a small 12-week sparkline under each prompt row") does not exist.

**A new failure class: "built but never mounted."** Note grep #3 ("v8.16 JOIN audits in trend route
— PASS, 1 match") is *technically true* while the feature does not exist for any user. The grep
verified a query nobody can trigger.

---

## STEP 1 — FIRST establish whether a host exists (this decides the whole fix)
The report says the prompt-results table "was never built." Verify that before building anything —
it may exist under another name (audit-results, prompt breakdown, per-prompt view, the citations
table on an audit page).

```bash
cd c:/startup/VisibleAU/src
# Is there ANY UI that lists prompts per brand/audit? (the natural host)
grep -rln "prompt" app/\(auth\)/ components/domain/ 2>/dev/null | grep -viE "trend|sparkline" | head -20
# Specifically: a table/list rendering individual prompts + their results
grep -rn "prompts\.map\|promptResults\|citations\.map\|prompt_text\|c\.prompt\|promptText" \
  components/domain/**/*.tsx app/\(auth\)/**/*.tsx 2>/dev/null | head -15
# What does the audit-results route return — does it already serve per-prompt rows?
grep -rln "audit-results\|auditResults" app/api/ | head
grep -n "prompt\|citation" "app/api/brands/[brandId]/audit-results/route.ts" 2>/dev/null | head
# And the existing screens that COULD host it (the brand grid tiles: Visibility, Discovery, Reports…)
ls "app/(auth)/brands/[brandId]/"
```

**CLASSIFY and report which case:**

### CASE A — a per-prompt table/list EXISTS somewhere
(e.g. an audit-results page, a Visibility screen, a Discovery comparison view showing individual
prompts). → **The fix is small: mount the component into that row.** Go to Step 2A.

### CASE B — NO per-prompt UI exists anywhere
Then the sparkline has no host, and mounting it means building the host table too. → **That is a
SCOPE GAP in S9, not a wiring bug.** Go to Step 2B — and note the severity re-frames: the *feature*
(per-prompt trend) was never really shipped, only its parts. **REPORT this clearly** so Sri can
decide whether to build the host now or carry it.

---

## STEP 2A — (Case A) Mount into the existing per-prompt table
- Import `PromptTrendSparkline` into the row component of the existing prompt table.
- Pass `brandId` + `promptId` (or the prompt text — match the route's params: the route keys on
  `[promptId]`, so confirm the table has a promptId to pass; if it only has the prompt *text*,
  check how the route resolves `promptId` and wire accordingly).
- Place it per §6U.5: **under each prompt row**, Growth+ only.
- **RESPONSIVE (also a finding):** the component is a fixed `w-24`. §6U.5 binds: *"on `<sm` it moves
  BELOW the prompt text rather than inline."* Implement that (the current fixed width is the 3A/#6
  FAIL). Keep it fixed-width on `≥sm`, stacked below on `<sm`.
- Tier: the route already 403s for <Growth. In the UI, follow the existing convention (hide, or show
  a locked state) — do NOT render a component that fires a 403.

## STEP 2B — (Case B) No host exists — REPORT, don't silently build
If there is genuinely no per-prompt UI:
1. **Report it as a scope finding** (S9 shipped the sparkline's parts but not its home).
2. Propose the minimal honest host: the smallest surface that satisfies §6U.5 — e.g. a per-prompt
   list on the existing audit-results/Visibility screen, each row = the prompt text + its
   mention-rate + the sparkline. Do NOT build a large new screen unprompted; describe the minimal
   option and let Sri decide.
3. **Do not fabricate a mount** by dropping the sparkline somewhere it doesn't belong (e.g. onto the
   Health Check) — that would satisfy a grep while violating the spec.

---

## STEP 3 — Verify the numbers on screen (the F11 discipline — do NOT skip)
Once mounted, the sparkline must show REAL weekly data, not a plausible-looking line.
Use **Metropolitan** (`418f321f-2489-4560-aaa9-895728580465`, 18 audits = real history).

Pick one prompt visible on screen, then run the canonical v8.16 query and COMPARE:
```bash
psql "$PROD" -c "
  SELECT DATE_TRUNC('week', c.created_at) AS week,
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE c.brand_mentioned) AS mentioned,
         ROUND(COUNT(*) FILTER (WHERE c.brand_mentioned)::numeric / NULLIF(COUNT(*),0) * 100, 1) AS mention_rate_pct
  FROM citations c
  JOIN audits a ON c.audit_id = a.id
  WHERE a.brand_id = '418f321f-2489-4560-aaa9-895728580465'
    AND c.prompt = '<PASTE ONE PROMPT FROM THE SCREEN>'
  GROUP BY week ORDER BY week;"
```
**The rendered weekly rates MUST match these numbers.** (F11 shipped a screen whose every value was
wrong while looking entirely plausible — do not accept "a line renders" as proof.)

Also check:
- **Bondi** (1 audit) → the **"Not enough history yet"** empty state (NOT a flat-zero line, which
  would falsely imply 0% mentions rather than no data).
- **`<sm`** → the sparkline sits BELOW the prompt text.
- The terminal → a **200** on `/api/brands/{id}/prompts/{promptId}/trend`.

---

## STEP 4 — Close the class (so "built but never mounted" can't recur silently)
The brand-grid nav guard (F10) catches unreachable *routes*. It does not catch unmounted
*components*. Add a cheap guard:
- A test that asserts every component under `components/domain/**` that is a "feature" component
  (or at minimum: the S9 components — `prompt-trend-sparkline`, `action-progress-tracker`,
  `autopilot-loop`, `health-check-panel`, `persona-dashboard`) **is imported by at least one page**.
- Implementation: grep the `app/` tree for an import of each; fail if zero importers.
- Add a documented waiver list for components deliberately not yet mounted (with the reason), so the
  guard states the truth rather than hiding it.
This is the same set-difference shape as the nav guard — it would have caught F12 at build time.

## Constraints
- Do NOT change the route (it's correct — v8.16 JOIN, brand gate, tier gate).
- Do NOT change the component's data handling (it unwraps correctly).
- Do NOT invent a mount point that violates §6U.5 (the sparkline belongs under prompt rows).
- If Case B, REPORT before building a host screen — don't expand scope unilaterally.
- Verify rendered numbers against the DB (Step 3) — a rendering line is not proof of correct data.

## Report back (paste inline)
1. **CASE A or CASE B** — does a per-prompt table exist? (name the file, or confirm none exists)
2. If A: the mount + the `<sm` responsive fix.
   If B: the scope finding + your proposed minimal host (do not build it yet).
3. **Screenshot** the sparkline rendering on Metropolitan + the DB weekly rates → **do they match?**
4. Bondi's "Not enough history yet" empty state.
5. The `<sm` shot (sparkline below the prompt text).
6. The component-mount guard + its re-break.
