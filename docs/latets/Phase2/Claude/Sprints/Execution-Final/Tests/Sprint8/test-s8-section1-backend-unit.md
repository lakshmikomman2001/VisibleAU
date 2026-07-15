# TEST TRACK S8 — SECTION 1: BACKEND UNIT (pure functions, no DB / no events)

## Scope
Fast, isolated logic tests for S8's PURE functions — no DB, no Inngest, no HTTP. Assert against the
CANON values (below), not merely against what the code returns (a test that just mirrors the
implementation can't catch a wrong implementation). This is section 1 of the 5-phase track; build it,
prove each test FAILS on a deliberate re-break, then we move to section 2 (Backend Integration).

## STEP 0 — Inventory first (do NOT skip; avoids duplicating tests the recent fixes already added)
Several S8 fixes already added unit tests (tier-rank from MED-09, provider map from LOW-07, etc.).
List what exists for each target BEFORE writing, so you EXTEND rather than duplicate, and so any
HOLLOW existing test (mirrors impl / never asserts a canon value) gets upgraded, not shadowed.
```bash
cd c:/startup/VisibleAU/src
grep -Rln "isTierAtLeast\|TIER_RANK\|TIER_SEAT_LIMITS\|TIER_BRAND_LIMITS\|canPerformAction\|canAssignRole\|PROVIDER_DISPLAY\|REGION_LABELS\|assertBrandAccess\|EVENT_NAME_MAP" tests/ 2>/dev/null | sort -u
# For each hit, note: does it assert a CANON value (behavioral) or just call the fn and snapshot
# whatever it returns (hollow)? Report per-file before writing.
```
Report the inventory, then write ONLY the missing/weak cases below.

## The pure-function targets + the CANON values to assert

### 1.1 — Tier math (`lib/brands/index.ts`)
`isTierAtLeast(current, required)`, `TIER_RANK`, `TIER_SEAT_LIMITS`, `TIER_BRAND_LIMITS`.
Canon (LLD 767/2332 + Sri's seat decision):
- **Ranks:** free < starter < growth < agency < agency_pro < enterprise.
- **`isTierAtLeast`:** `('growth','agency')` → **false**; `('agency','agency')` → **true**;
  `('agency_pro','agency')` → **true**; `('enterprise','agency')` → **true**;
  `('free','starter')` → false; `('starter','free')` → true.
- **Seat limits (Sri's decision):** free/starter/growth = **1**, agency = **5**, agency_pro = **15**,
  enterprise = Infinity.
- **Brand limits / competitor counts (LLD):** Growth = **1**, Agency = **3**, Agency Pro =
  unlimited/Infinity. (Assert whatever the canonical brand-limit map encodes; if brand-limit ≠
  competitor-count in the code, assert each against its canonical source and note the distinction.)
- **Unknown-key safety:** `TIER_RANK['bogus'] ?? 0` → 0 (or the code's defined fallback);
  `isTierAtLeast('bogus','agency')` must NOT throw and must be false. This is the snake_case /
  undefined-lookup guard (the `agency_pro` vs `Agency Pro` trap) — assert a bad key degrades safely.

### 1.2 — RBAC matrix (`lib/governance/access-control.ts`) — `canPerformAction(role, action)`
Assert the FULL canonical matrix (LLD 8656–8672), all 4 roles × each action. Table-drive it:
| action | owner | admin | analyst | viewer |
|---|---|---|---|---|
| run_audit | ✓ | ✓ | ✓ | ✗ |
| approve_drafts | ✓ | ✓ | ✗ | ✗ |
| view_reports | ✓ | ✓ | ✓ | **✓** |
| generate_reports | ✓ | ✓ | ✓ | ✗ |
| invite_members | ✓ | ✓ | ✗ | ✗ |
| change_member_role | ✓ | ✓ | ✗ | ✗ |
| delete_brand | ✓ | ✗ | ✗ | ✗ |
| **view_audit_trail** | ✓ | ✓ | ✓ | **✗** |   ← the F22/HIGH-12 fix, frozen
(Use the ACTUAL permission-action names in the code — map the canon rows to them; if a canon action
has no permission constant, note it.) **Critically assert the two that differ by one role:**
`canPerformAction('viewer','view_audit_trail') === false` AND
`canPerformAction('viewer','view_reports') === true` — this is the exact HIGH-12 boundary; it must
never regress. Also assert an unknown role/action degrades safely (false, no throw).

### 1.3 — Role-ceiling logic (`canAssignRole` / the role-change predicate) — S8b-02
Canon (LLD 8656 ROLE-CEILING RULE): only an **owner** may assign or revoke the **owner** role
(incl. demoting/removing another owner); an **admin** may manage analyst/viewer/admin but is DENIED
any owner grant/revoke. Assert the pure predicate:
- owner assigning owner → allowed; admin assigning owner → **denied**; admin
  demoting/removing an owner → **denied**; admin changing analyst↔viewer↔admin → allowed;
  analyst/viewer assigning anything → denied.
- **NOTE — carried TS2367:** `access-control.ts:44` has a pre-existing `TS2367` in `canAssignRole`
  (a comparison whose types don't overlap → may be always-true or always-false). Writing these
  cases is the point where it surfaces: if a case that should be DENIED comes back allowed (or
  vice-versa), the type bug is a real logic bug — REPORT it as a finding (don't patch inside this
  test prompt; surface it so it's scoped). If all cases pass, the TS2367 is cosmetic — note that too.

### 1.4 — Display maps (`residency-table.tsx` or wherever `PROVIDER_DISPLAY` / `REGION_LABELS` live)
Pure lookup maps (F13/LOW-07). Canon providers (LLD 1991/3324/6634): openai→"OpenAI",
anthropic→"Anthropic", google→"Google", perplexity→"Perplexity", supabase→"Supabase",
vercel→"Vercel". Region: ap-southeast-2 → "Australia (Sydney)".
- Assert each mapping returns the exact display string (esp. `openai`→"OpenAI", NOT "Openai" — the
  bug LOW-07 fixed).
- Assert the **fallback**: an unmapped provider returns the raw value (not undefined, not a crash).

### 1.5 — `assertBrandAccess` PURE branch (if it has logic separable from the DB call)
If `assertBrandAccess` mixes a pure decision (does role/brand_access permit brand X?) with a DB
read, unit-test ONLY the pure decision with in-memory inputs (a member with brand_access=null = all
brands; brand_access=[id] = only those). If it's inseparable from the DB, SKIP here and note it
belongs in Backend Integration (section 2) — do not spin up a DB in a unit test.

## Test conventions
- Use the project's existing unit runner + file layout (match neighbouring `*.test.ts`). Do NOT
  introduce a new framework.
- Table-driven where the matrix/tier cases are dense (one `it.each` beats 40 copy-pasted its).
- Each assertion targets a CANON value from above, not `expect(fn(x)).toBe(fn(x))` tautologies.
- Pure only: if a target needs a DB/event/HTTP, it is NOT this section — note it for section 2/3.

## RE-BREAK PROOF (required before section 2)
After the tests pass, prove they actually bite — temporarily break each, confirm the RED, revert:
1. Flip `view_audit_trail` to include `'viewer'` → the 1.2 boundary test must FAIL. Revert.
2. Change a seat limit (agency 5→9) → the 1.1 seat test must FAIL. Revert.
3. Change `openai`→"Openai" → the 1.4 test must FAIL. Revert.
4. Flip an `isTierAtLeast` case → 1.1 must FAIL. Revert.
Report the 4 REDs (proof the tests are behavioral, not hollow) + the green after revert.

## Constraints
- INVENTORY first (Step 0) — extend/upgrade, don't duplicate.
- Assert canon values, not implementation mirrors.
- No DB/events/HTTP in this section.
- If the TS2367 (1.3) turns out to be a real logic bug, REPORT it (finding) — do not fix inside this
  test prompt; it gets its own scoped fix.
- Do not touch source files except the temporary re-break flips (all reverted).

## Report back (paste inline)
1. Step 0 inventory: existing unit tests per target + behavioral/hollow classification.
2. What was written (new) vs extended/upgraded (existing) — file list.
3. Test run: all green.
4. The TS2367 verdict (1.3): real logic bug (finding) or cosmetic.
5. RE-BREAK: the 4 REDs + green-after-revert (proof they bite).
