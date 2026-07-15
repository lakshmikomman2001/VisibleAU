# VisibleAU — Investigate WHY the Step 4 callout still shows "5 runs = 100 calls", then FIX
**Claude Code prompt — paste into a Claude Code session on the VisibleAU repo.**
Scope: brand wizard Step 4 ("Confirm & run first audit") in `app/(auth)/brands/wizard/page.tsx`.
Frontend copy only — no schema, no API, no audit logic, no `tier-engines.ts` change.

---

## Situation
A previous change was supposed to make the Step 4 callout DERIVE its call counts from config
(`enginesForTier` × `PROMPTS_PER_AUDIT` × `runsForTier`). That change reported success ("helpers
imported and used"). BUT after a clean dev-server restart, the rendered screen STILL shows the OLD
hardcoded text:
> "Your first audit will run on your tier's engines. Paid: 4 engines × 10 prompts × 5 runs = 200
> calls (~3–5 min). Free: 2 engines × 10 prompts × 5 runs = 100 calls (~1–2 min)."
With `TIER_RUNS_FREE=3` set, the Free line should read **"3 runs = 60 calls"**. It doesn't.

This is a builder-reported-fixed-but-screen-disagrees situation. Do NOT assume the prior change
worked. INVESTIGATE the actual cause first, report it, THEN fix the real problem.

---

## STEP 1 — Investigate (run ALL of these, paste raw output, then diagnose)

```bash
# (a) Is the OLD hardcoded literal still in the file?
grep -n "5 runs = 100\|× 5 runs = 100\|100 calls\|= 100 calls\|200 calls\|× 5 runs" "app/(auth)/brands/wizard/page.tsx"

# (b) Were the derived helpers actually IMPORTED?
grep -n "enginesForTier\|runsForTier\|PROMPTS_PER_AUDIT" "app/(auth)/brands/wizard/page.tsx"

# (c) Were the computed values actually DEFINED and USED in the JSX (not just imported)?
grep -n "freeCalls\|freeRuns\|paidCalls\|paidRuns\|runWord\|freeEngines\|paidEngines" "app/(auth)/brands/wizard/page.tsx"

# (d) Is there a SECOND copy of this callout in another file (mobile variant, sub-component)?
grep -rn "2 engines × 10 prompts\|runs = 100 calls\|will run on your tier" app components

# (e) Is TIER_RUNS_FREE set, and in the env file the DEV server actually loads?
grep -rn "TIER_RUNS_FREE" .env .env.dev .env.local 2>/dev/null
# Which env file does the dev script load? Check package.json + any dotenv/next config:
grep -nE "dev\"|env-cmd|dotenv|--env|NODE_ENV|\.env\.dev" package.json next.config.* 2>/dev/null

# (f) Confirm runsForTier actually reads the env and clamps (sanity):
sed -n '1,60p' lib/llm/tier-engines.ts | grep -nE "TIER_RUNS_|runsForTier|envRunsFor|RUNS_MAX|process.env"

# (g) Prove runsForTier('free') returns 3 in THIS env (not just in a test):
npx tsx -e "process.env.TIER_RUNS_FREE='3'; import('./lib/llm/tier-engines').then(m => console.log('runsForTier(free) =', m.runsForTier('free')))" 2>&1 | tail -3
```

## STEP 2 — Diagnose (state which it is, with evidence from STEP 1)
Pick the actual cause:
- **(A) Old literal still present** — grep (a) returned the hardcoded string → the prior edit did NOT
  replace the rendered callout (changed the wrong line, didn't save, or edited a comment). 
- **(B) Helpers imported but not used in JSX** — grep (b) found imports but grep (c) found the
  computed vars are NOT referenced inside the returned JSX → the displayed text is still the literal.
- **(C) Second copy** — grep (d) found the callout in a DIFFERENT file that actually renders Step 4.
- **(D) Env not loaded** — grep (e)/(f)/(g) show `TIER_RUNS_FREE` isn't in the file the dev server
  loads, or a name mismatch, or `runsForTier('free')` returns 5 not 3 → config never reaches the page,
  so even a correctly-derived callout would show defaults.
- **(E) Something else** — explain with evidence.

It may be MORE THAN ONE (e.g. B + D). Report all that apply.

## STEP 3 — Fix the actual cause(s)
- If **(A)/(B)/(C)**: ensure the rendered callout JSX uses the derived values. The callout text must
  be built from:
  ```
  freeEngines = enginesForTier('free').length
  freeRuns    = runsForTier('free')
  freeCalls   = freeEngines * PROMPTS_PER_AUDIT * freeRuns
  paidEngines = enginesForTier('growth').length
  paidRuns    = runsForTier('growth')
  paidCalls   = paidEngines * PROMPTS_PER_AUDIT * paidRuns
  runWord = (n) => `${n} run${n === 1 ? '' : 's'}`
  ```
  and rendered like: "Paid: {paidEngines} engines × {PROMPTS_PER_AUDIT} prompts × {runWord(paidRuns)}
  = {paidCalls} calls. Free: {freeEngines} engines × {PROMPTS_PER_AUDIT} prompts × {runWord(freeRuns)}
  = {freeCalls} calls." Remove EVERY hardcoded "5 runs", "100 calls", "200 calls", "2 engines",
  "4 engines" literal from the callout. If there's a second copy (C), fix it too — or better, extract
  the callout into ONE shared component so it can't diverge again.
- If **(D)**: report the exact problem (var missing from `.env.dev`, name mismatch, wrong env file
  loaded). If it's simply that `TIER_RUNS_FREE` is in `.env.local` but the dev server loads `.env.dev`
  (or vice-versa), add it to the correct file. Do NOT change `runsForTier`'s logic — only ensure the
  env reaches the running process. Then a server restart should reflect it.

Note: the computed values are at MODULE level (evaluated once at load). That's fine for a server env
var, but it REQUIRES a dev-server restart to pick up env or code changes — make sure verification is
done AFTER a restart.

## STEP 4 — Verify (this time, observe the rendered output, not "will render")
1. `pnpm typecheck` + `pnpm lint` clean.
2. Greps clean:
   ```bash
   grep -n "5 runs = 100\|200 calls\|= 100 calls\|2 engines × 10 prompts × 5" "app/(auth)/brands/wizard/page.tsx"   # → no matches
   grep -n "freeCalls\|paidCalls" "app/(auth)/brands/wizard/page.tsx"   # → present AND referenced in JSX
   ```
3. **Restart the dev server**, hard-refresh, walk the wizard to Step 4, and CONFIRM the rendered
   callout shows **"Free: 2 engines × 10 prompts × 3 runs = 60 calls"** (with `TIER_RUNS_FREE=3`).
   Report what the screen actually says — quote it.
4. Round-trip: set `TIER_RUNS_FREE=5`, restart → callout shows "5 runs = 100 calls"; set back to 3,
   restart → "3 runs = 60 calls". Report both observed values.

Report: the STEP 1 raw grep output, the STEP 2 diagnosis (which cause, with evidence), the fix
applied, and the STEP 4 OBSERVED rendered text (not predicted). The deliverable is the screen showing
60, confirmed after a restart.
