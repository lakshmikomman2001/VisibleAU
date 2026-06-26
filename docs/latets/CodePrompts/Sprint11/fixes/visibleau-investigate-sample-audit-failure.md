# VisibleAU — INVESTIGATION PROMPT: Sample audit fails immediately ("Audit failed. Please try again.")

**Phase/Sprint:** Phase 1, Sprint 10 (sample-audit flow). **This is a DIAGNOSIS task, not a fix task.**
Your job is to find the ROOT CAUSE and report it. **Do NOT change any code yet.** At the end, report your
findings in the "REPORT BACK" format. A targeted fix prompt will follow once the cause is confirmed.

---

## CONTEXT — what just happened (verified)

The public, no-login "free sample audit" was just fixed for a SEPARATE bug (status polling used to redirect
to `/sign-in`; that is now resolved — the poll returns `200`). With that fix in place, the real execution
state is now visible, and it shows a NEW, deeper problem:

A logged-out visitor (incognito) runs a sample audit. The flow creates the audit fine, but the running page
shows **"Audit failed. Please try again."** almost immediately, progress stuck at **0%**. Dev-server log:

```
GET  /                                                          200   ← landing OK
GET  /sample-audit                                              200   ← form OK
POST /api/sample-audit  201 in 499ms                            ← create OK (fast — returns auditId only)
GET  /sample-audit/running?auditId=7bfcd36d-...  200            ← running page OK
GET  /api/sample-audit/7bfcd36d-.../status  200 in 858ms        ← poll OK (the redirect fix works), but...
                                                                  ← ...the status it returns is 'failed'
```

**Key facts to internalise before investigating:**
- The create route (`POST /api/sample-audit`) returns in ~499ms with only an `auditId`, then the page polls
  for status. So execution is **asynchronous / backgrounded** (NOT the synchronous `runSampleAudit()` that
  returns scores inline, which is how the Sprint 10 prompt HB3 sketched it). The audit runs in a background
  job (likely an Inngest function) AFTER the 201.
- Because it's backgrounded, **the failing error is NOT in the HTTP request log** — it's thrown inside the
  background job and printed/stored elsewhere. Finding that error is the whole point of this task.
- It fails **immediately at 0%**, not partway. An instant failure points at a PRECONDITION/SETUP error
  (missing column, missing sample org, missing env, bad tenancy attach) rather than a mid-audit LLM error.
- Dev runs with `LLM_MODE=mock` — so this is almost certainly NOT a real API-key/network issue.

## TWO LEADING HYPOTHESES (from Sprint 10 canon — confirm or rule out, don't assume)

1. **`ensureSampleOrg()` / the `organizations.slug` column (HH5 dependency).** The sample flow attaches all
   sample audits to a synthetic org found via `WHERE slug = 'sample'`. Sprint 10 canon explicitly warns
   (HH5): the `slug` column is added by a Sprint 10 migration, and `ensureSampleOrg()` throws "column slug
   does not exist" if the migration hasn't run in this DB. An instant 0% failure is exactly this shape.
2. **The background runner can't attach tenancy / find the sample org or prompts**, or the mock path for the
   single-engine ChatGPT sample run (`lib/sample-audit/run.ts`, HA4 `runSampleAudit`) throws before writing
   any progress.

These are leads, not conclusions. Follow the evidence.

---

## INVESTIGATION STEPS (read-only — gather evidence, change nothing)

### Step 1 — Get the real error from the background job
The HTTP log won't have it. Find it in one of these:
```bash
# a) The dev-server terminal: scroll up AND down around the POST /api/sample-audit 201 line.
#    Background/Inngest errors often print as a separate block, sometimes seconds after the 201,
#    sometimes interleaved above the request lines. Look for: "Error:", a stack trace, "column",
#    "relation", "ensureSampleOrg", "runSampleAudit", "function failed", "audit/start".
#
# b) If Inngest dev server is running (dashboard at http://localhost:8288):
#    open it → Runs → find the failed run for this audit → read its error/stack trace.
#
# c) Search the codebase for where status is set to 'failed' and what's logged there:
grep -rnE "status:\s*'failed'|status = 'failed'|'failed'" inngest/ lib/ app/api/sample-audit/ | head
#    Open each hit — the catch block that sets 'failed' is where the real error is caught.
#    Note whether it logs the error (console.error) or swallows it. THAT catch is the crime scene.
```

### Step 2 — Map the actual execution path (what really runs after the 201)
The Sprint 10 prompt sketched a synchronous `runSampleAudit()`, but the built flow is async. Find the truth:
```bash
# What does POST /api/sample-audit actually do — call runSampleAudit inline, or send an Inngest event?
find app -path '*sample-audit*' -name 'route.ts'
grep -nE "runSampleAudit|inngest.send|audit/start|sample.*audit|createAudit|status" $(find app -path '*api/sample-audit*' -name 'route.ts')
#
# Find the background function that actually executes the sample audit:
grep -rnE "sample|runSampleAudit|audit/start|run-audit" inngest/functions/ | head
#    Open the function that runs the sample audit end-to-end. Trace it top-to-bottom:
#    org attach (ensureSampleOrg?) → prompt selection → mock LLM calls → scoring → status='complete'.
#    Identify the EARLIEST step that could throw (that's where 0% failure originates).
#
# Read the sample-audit lib files referenced by canon:
find lib -path '*sample-audit*'
#    e.g. lib/sample-audit/run.ts (HA4), lib/sample-audit/synthetic-org.ts (ensureSampleOrg, HC1/HH5)
#    Read ensureSampleOrg() — does it query WHERE slug='sample'? does it have the HH5 guard?
```

### Step 3 — Ask the database the diagnostic questions
```bash
# 3a. Does the slug column exist? (Hypothesis 1 — the HH5 migration-order bug)
psql "$DATABASE_URL" -c "\d organizations" | grep -i slug
#     → if NO slug column: that's almost certainly the cause. (Confirm in Step 1's error too.)

# 3b. Did the synthetic sample org get created?
psql "$DATABASE_URL" -c "SELECT id, slug, name FROM organizations WHERE slug = 'sample';"
#     → 0 rows: ensureSampleOrg never ran/seeded, OR it's created lazily and is failing.

# 3c. What does the failed audit row say, and did it attach to the sample org?
psql "$DATABASE_URL" -c "SELECT a.id, a.status, a.organization_id, o.slug FROM audits a LEFT JOIN organizations o ON o.id = a.organization_id WHERE a.id = '7bfcd36d-4dd2-4511-8d90-0e3cb2a917be';"
#     → organization_id NULL or not the sample org → tenancy attach failed in the runner.
#     → (if the audits table has an 'error' / 'error_message' column, also select it — it may hold the cause.)

# 3d. Were any partial results written before it failed? (tells you how far it got)
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM citations WHERE audit_id = '7bfcd36d-4dd2-4511-8d90-0e3cb2a917be';"
#     → 0 → failed before any LLM call (precondition error). >0 → failed during scoring/finalize.
```

### Step 4 — Check the migration / seed state (if Hypothesis 1 looks likely)
```bash
# Has the slug migration been applied to THIS database?
ls -1 drizzle/ migrations/ 2>/dev/null | grep -iE "slug|sample" | head
grep -rniE "ADD COLUMN.*slug|slug text|slug.*unique" drizzle/ migrations/ db/ 2>/dev/null | head
#    And whether ensureSampleOrg is seeded anywhere (seed script) vs created lazily on first sample audit:
grep -rnE "ensureSampleOrg" scripts/ lib/ db/ inngest/ | head
```

### Step 5 — Confirm env preconditions the background job needs (rule out the boring causes)
```bash
# The async flow + Inngest needs these locally; the synchronous sketch didn't. Confirm they're set in .env.dev:
grep -nE "LLM_MODE|INNGEST_SIGNING_KEY|INNGEST_EVENT_KEY|UPSTASH_REDIS_REST_URL|UPSTASH_REDIS_REST_TOKEN|DATABASE_URL" .env.dev 2>/dev/null
#    Note: your handoff flags a known local Inngest-sync 500 (functions not discovered locally). If the
#    sample audit runs via Inngest and Inngest isn't synced locally, the function may never execute (or
#    error) → instant 'failed'. Check whether the sample audit depends on Inngest at all (Step 2 tells you).
#    Also confirm START-DEV.bat copied .env.dev → .env.local (env changes need a re-run to take effect).
```

---

## RULES WHILE INVESTIGATING
- **Change nothing.** No code edits, no migrations run, no seeds — just read, query, and report. (If you
  believe running a migration is the fix, say so in the report; don't run it yet — Sri decides.)
- **Find the actual thrown error string.** Do not infer the cause from symptoms alone. The catch block that
  sets `status='failed'` (Step 1c) is the authoritative source — quote the real error it catches/logs.
- **Distinguish the layers:** the status-redirect bug is already fixed (poll returns 200). This is a
  separate BACKEND execution failure. Don't re-diagnose the redirect.
- **`audits.status` is `'complete'`** (no trailing -d) and the failure state is `'failed'`. Don't conflate
  with `workflow_runs` `'completed'` or Stripe `*_completed` event names.

---

## REPORT BACK (this is the deliverable — fill in every line)
1. **The real error:** the exact thrown error string + which file/line caught it and set `status='failed'`
   (from Step 1). If you couldn't find it, say exactly where you looked and what the catch block does with
   the error (logs it? swallows it?).
2. **Execution path:** does `POST /api/sample-audit` run the audit inline or send an Inngest event? Name the
   background function that executes it (from Step 2).
3. **Earliest failing step:** the first operation in that path that throws (org attach? prompt load? mock
   LLM? scoring? finalize?).
4. **DB findings:** does `organizations.slug` exist (Y/N)? does the `sample` org row exist (Y/N)? what are
   the failed audit's `status` + `organization_id` + `slug`? how many `citations` rows (0 or >0)? (Step 3.)
5. **Migration/seed state:** is the slug migration applied? is `ensureSampleOrg` seeded or lazy? (Step 4.)
6. **Env/Inngest:** does the sample audit depend on Inngest locally, and is Inngest synced/running? are the
   needed env vars set in `.env.dev` (and copied to `.env.local`)? (Step 5.)
7. **Your diagnosis:** one paragraph — which hypothesis (1, 2, or something else) the evidence supports, and
   what the fix will need to address. **Do not implement it** — just state it.
