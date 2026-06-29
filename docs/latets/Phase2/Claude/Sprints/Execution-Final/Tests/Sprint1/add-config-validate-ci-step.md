# Claude Code — Add `config:validate` CI step to ci.yml (Sprint 1 Finding 1)

Section 5 found the `config:validate` CI step is MISSING from `.github/workflows/ci.yml`. The LLD §7 (line 5082)
requires it: **run `config:validate` on every PR that touches config.** Add the step to the existing CI
workflow so a broken config fails CI before merge.

> Investigate-first: read the existing `ci.yml` and match its structure (job names, setup steps, package
> manager, how it installs deps + connects to a DB). Don't bolt on a step that doesn't fit the existing
> pipeline. Add ONLY this step — don't restructure the workflow.

## THE REQUIREMENT (LLD §7 / 5082)
- Command: `pnpm visibleau config:validate --market AU_EN --locale en-AU`
- It exits non-zero on any config failure (missing enabled provider / budget policy / sampling policy /
  incomplete prompt-pack coverage / no active bundle) → **so CI fails on bad config.**
- Should run on PRs (the LLD says "every PR that touches config" — see scoping note below).

## STEP 1 — Read the existing workflow
```bash
cat .github/workflows/ci.yml
ls .github/workflows/
# Note: the package manager (pnpm?), the node setup, how existing jobs install deps, and whether any job
# already has a DB available (config:validate resolves bundles/policies — it needs DB access if the existing
# test job has a Postgres service, reuse that pattern).
```
Determine:
- Which job to add the step to (an existing lint/test job) vs a new job.
- How deps are installed (so the step has `pnpm`/the CLI available).
- Whether `config:validate` needs a DB connection in CI (it reads config tables). If the existing test job
  spins up a Postgres service + seeds, the validate step should run AFTER seeds in that job (or in a job with
  the same DB setup). If config:validate can run against a migrated+seeded test DB, wire it there.

## STEP 2 — Add the step
Add a step that runs `pnpm visibleau config:validate --market AU_EN --locale en-AU` in the appropriate job,
AFTER dependencies are installed and (if needed) after the DB is migrated + seeded. Example shape (ADAPT to the
real ci.yml — match its style, indentation, and existing setup):
```yaml
      - name: Validate Phase 2 config
        run: pnpm visibleau config:validate --market AU_EN --locale en-AU
```
- Place it so a non-zero exit FAILS the job (default behaviour — don't add `continue-on-error`).
- If the existing CI has separate jobs for lint vs test-with-DB, put this in the one that has DB access (it
  resolves bundles/policies from the DB).

## STEP 3 — Scoping (LLD says "PRs that touch config")
The LLD scopes it to "every PR that touches config." Two reasonable interpretations — pick the simpler unless
the repo already does path-filtering:
- **Simplest (recommended):** run it on every PR (the existing CI trigger). Config validation is cheap and
  catching a broken config on any PR is strictly safer. No path filter needed.
- **Path-filtered (only if the repo already uses `paths:` filters):** scope to PRs touching config dirs
  (`db/seed/**`, `lib/platform/**`, config bundle files). Only do this if it matches the repo's existing
  convention — otherwise the simple always-run is better.
Report which you chose and why.

## STEP 4 — Verify
```bash
# Confirm the step is in the workflow + well-formed YAML:
grep -n "config:validate" .github/workflows/ci.yml
# (Optional) lint the workflow YAML if a linter is available, or just confirm valid indentation.
```
- Confirm the step runs in a job that has the CLI (and DB if needed) available.
- Confirm no `continue-on-error` (a config failure MUST fail CI).
- Do NOT change other CI steps or restructure jobs.

## NOTE — the dev-DB caveat (Finding 3, informational)
Section 5 found `config:validate` currently exits 1 on the dev DB because the **sampling policy** and **active
config bundle** rows aren't seeded yet. So for CI to pass, the CI test DB must have those rows seeded — OR
those are later-sprint seeds and CI isn't expected to pass validate yet. **If the CI seed step does NOT create
a valid config (sampling policy + active bundle), this new step will FAIL CI.** Before finalizing:
- Check whether the CI's seed/setup creates a complete, valid config for AU_EN. If yes → the step will pass.
- If NO (those rows are seeded in a later sprint) → REPORT this to Sri rather than forcing it: adding the step
  now would red the CI until the config is seedable. Sri decides whether to (a) add the missing seeds now, or
  (b) defer the CI step until the config is complete. **Do not seed fake rows to make CI green.**

## REPORT
- The existing ci.yml structure + which job/where the step was added.
- The scoping choice (every-PR vs path-filtered) + why.
- **Whether the CI test DB seeds a valid config** — if not, flag that this step will fail CI until the sampling
  policy + active bundle are seedable (Sprint dependency), and await Sri's decision rather than forcing green.
- Confirm: step added, fails-on-error, no other CI changes.
