# VisibleAU — Diagnose + fix "Step 1of 4" spacing (and explain the false "already fixed")
**Claude Code prompt — paste into a Claude Code session on the VisibleAU repo.**

## Context
A screenshot of the brand wizard (`/brands/wizard`) Step 1 shows the indicator rendering
**"Step 1of 4"** — missing the space between the number and "of". A prior session reported this was
"already correct — no fix needed." The rendered screen disagrees. Find out WHY the prior check was
wrong, then fix it.

## STEP 0 — Find EVERY place the step label is produced (don't trust a single grep)
The bug is almost certainly a missing space in a TEMPLATE (e.g. `` `Step ${step}of ${total}` ``),
NOT a literal "1of" string — so grepping for "1of" will find nothing. Search for the TEMPLATE shape:
```bash
grep -rnE "Step \{|Step \$\{|\}of|\} of|Step.*of.*total|of \$\{|of \{" app components | grep -iE "step|wizard"
grep -rniE "step.*of|`Step|Step " app/\(auth\)/brands/wizard components/domain | grep -iE "step|of 4|of \$"
```
Report EVERY match — there may be more than one (a shared header + an inline copy, or mobile/desktop
variants). For each, quote the exact line and say whether it has the space or not.

## STEP 1 — Diagnose why the prior "already fixed" was wrong
State which of these it was (so the operator understands the failure mode):
- (a) the broken output is from a template with a missing space (`${step}of`), so a literal grep
  missed it;
- (b) there are multiple render paths and a prior check looked at a correct one while a different one
  renders the live screen;
- (c) the change was made but not saved / not in this file;
- (d) something else — explain.

## STEP 2 — Fix
In the template(s) that render the live Step 1 indicator, ensure a space on BOTH sides of "of":
`` `Step ${step} of ${total}` `` (renders "Step 1 of 4"). Apply to ALL matches found in STEP 0 so
every render path is consistent. Do not change anything else.

## Verification
```bash
grep -rnE "\}of|Step \$\{[a-zA-Z]+\}of" app components   # → NO matches (no missing-space templates remain)
```
Then state: load `/brands/wizard` — Step 1 reads **"Step 1 of 4"**; advancing shows "Step 2 of 4",
etc. Report the STEP 0 matches, the diagnosis (a/b/c/d), the file(s) changed, and the grep result.
