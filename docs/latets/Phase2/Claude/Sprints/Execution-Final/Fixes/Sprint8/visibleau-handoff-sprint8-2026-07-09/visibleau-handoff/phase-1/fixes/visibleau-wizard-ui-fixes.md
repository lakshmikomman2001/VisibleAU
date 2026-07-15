# VisibleAU Fix — Brand-creation wizard UI/content (Steps 1–4) vs prototype
**Claude Code prompt — paste into a Claude Code session on the VisibleAU repo.**
Scope: the post-signup brand wizard at `app/(auth)/brands/wizard/page.tsx` (+ its step components).
Frontend/content only — no schema, no API, no audit logic. Each item below was found by comparing
the built wizard to the prototype (`visibleau-prototype.jsx`, BrandSetupWizard ~line 2037).

> NOTE on canon authority: the prototype is the UI reference here; where a value also appears in a
> sprint prompt (e.g. the `STATE:Suburb` regex), the sprint prompt wins. Verify each literal against
> the repo before changing — do not trust this prompt's quoted strings blindly; confirm them.

---

## STEP 0 — Investigate (report, then proceed)
```bash
sed -n '1,60p' app/\(auth\)/brands/wizard/page.tsx | grep -nE "Step|of 4|vertical|pack|suburb|favicon|logo"
grep -rnE "vertical pack|Vertical pack|prompts|Active|brands using pack|using pack" app/\(auth\)/brands/wizard components/domain
grep -rnE "favicon|auto-detect|Logo|Upload instead|detect.*logo" app components lib   # is favicon detection BUILT?
grep -rnE "primaryRegions|STATE:|up to 3|slice\(0, ?3\)|length >= 3|maxSuburbs|suburb" app/\(auth\)/brands/wizard components
grep -rnE "Step \{?\w+\}?of|of 4|Step 1of|`Step" app/\(auth\)/brands/wizard
```
Report:
- (a) Whether **favicon/logo auto-detection is actually implemented** anywhere (a real fetch of
  favicon.ico / a logo-resolution service), or whether the domain field only has helper TEXT with no
  detection behind it. **This gates STEP 2 below.**
- (b) How the Step 2 pack cards are rendered + whether "N brands using pack" is a real query or a
  hardcoded "0".
- (c) How Step 3 suburbs are added/stored + whether a 3-item cap is enforced.
- (d) The exact "Step X of 4" string template.

---

## STEP 1 — Step 1 spacing nit ("Step 1of 4")
The step indicator renders **"Step 1of 4"** (missing space between the number and "of"). Fix the
template so it reads **"Step 1 of 4"** (a space on both sides of "of"). Likely a missing space in a
template literal like `` `Step ${n}of 4` `` → `` `Step ${n} of 4` ``. Apply to all four steps.

---

## STEP 2 — Step 1 favicon/logo preview chip (CONDITIONAL on STEP 0(a))
The prototype Step 1 shows, under the domain field, a logo-preview chip:
> an 8×8 box with the brand initials + text: **"Logo auto-detected from favicon.ico · Upload instead"**
> (where "Upload instead" is a blue, clickable affordance).

- **IF STEP 0(a) found favicon detection IS built:** add the preview chip wired to the REAL detected
  logo/initials, with a working "Upload instead" affordance. Use the repo's existing upload pattern
  if one exists; otherwise link to wherever logo upload lives. The initials fallback shows only when
  no favicon resolves.
- **IF favicon detection is NOT built:** do **NOT** add a chip that shows a fake "detected" logo —
  that would be fabricated data (violates the no-mock-data rule). Instead, leave the existing helper
  text as-is and add a one-line `// TODO(sprint-11): add favicon auto-detect + logo preview chip
  (prototype Step 1) once detection is implemented` near the domain field. Report that you chose this
  branch and why.

State clearly in your report which branch you took.

---

## STEP 3 — Step 2 active-pack card descriptions (restore from prototype)
The three ACTIVE pack cards (Tradies / SaaS / Allied Health) are missing their description lines that
the prototype shows. Restore them with the EXACT prototype copy (verify against the data source in the
repo first — there may be a packs array with a `desc`/`description` field that's simply not being
rendered on active cards):

- **Tradies** — `Plumber, electrician, builder, landscaper`
- **SaaS** — `B2B software, dev tools`
- **Allied Health** — `Physio, psych, dietitian. AHPRA-aware framing.`
  - "AHPRA" is correct (Australian Health Practitioner Regulation Agency) — do not alter the spelling.
- Locked cards already show descriptions; confirm theirs match the prototype:
  - **Professional Services** — `Accountants, consultants, advisors` + " — coming soon" / "v1.1" badge
  - **Real Estate** — `Sales, property management, buyer agents` + " — coming soon" / "v1.1" badge

If the description text already exists in the packs data but isn't rendered for active cards, the fix
is to render the existing `desc` field (don't duplicate/hardcode it in the component).

---

## STEP 4 — Step 2 "N brands using pack" honesty (verify, fix only if fake)
The built cards show "**0 brands using pack**" (not in the prototype). For a new org this 0 is
correct IF it's a real count.
- If STEP 0(b) showed it's a **real query** (counts brands on that pack for the org): leave it — it's
  a good addition. Add nothing.
- If it's a **hardcoded "0"**: either (preferred) wire it to a real count
  (`SELECT count(*) FROM brands WHERE org = ... AND vertical = pack.id`), or remove the line entirely.
  Do not ship a hardcoded "0" that will lie once the org has brands (no-fabricated-data rule).
Report which case applied and what you did.

---

## STEP 5 — Step 3 suburb "up to 3" cap + chip behaviour (verify, fix if missing)
The label promises "**Primary suburbs (up to 3)**" and the prototype shows added suburbs as removable
`Badge` chips with an X. Confirm the built behaviour and fix gaps:
- **Cap:** adding a 4th suburb must be prevented (disable the Add button / input when 3 are present,
  with a tiny "Up to 3 suburbs" hint). If no cap is enforced, add it.
- **Chips:** added suburbs render as removable chips (X removes them). If they don't render or can't
  be removed, fix.
- **Storage format:** suburbs persist as `STATE:Suburb` per the canonical Zod regex
  `/^[A-Z]{2,4}:[A-Za-z][A-Za-z\s]{0,49}$/` (Sprint 1 W4; column `primaryRegions text[]`). If the
  wizard stores bare suburb strings (e.g. "Bondi") instead of "NSW:Bondi", that's a real bug — the
  `POST /api/brands` validation will reject them. Confirm the wizard either (a) lets the user pick a
  state + suburb, or (b) prefixes the org's region/state. Report the current behaviour; fix if it
  produces strings that fail the regex.

> Do NOT change the regex, the column, or the API. Only ensure the wizard SENDS conformant values
> and enforces the cap client-side.

---

## STEP 6 — (No change expected) Step 4 confirm
Step 4's call-count/cost copy was already corrected in the runs-per-prompt fix (now derives from
`runsForTier()`). Do NOT re-touch it here. Just confirm via grep that Step 4 shows no stale literal:
```bash
grep -nE "1 run = 20|A\$0\.30|2 engines × 20 prompts" app/\(auth\)/brands/wizard/page.tsx   # → no matches
```
If a stale literal is somehow still present, STOP and report (it means the earlier fix didn't cover
this file) — don't fix it blind here.

---

## Constraints
- Frontend/content only. No schema, no migration, no API, no audit/scoring changes.
- No fabricated data: the favicon chip (STEP 2) and the pack usage count (STEP 4) must reflect REAL
  values or be omitted — never a fake "detected logo" or hardcoded count.
- Restore prototype copy EXACTLY (verify literals against the repo's packs data first).
- Reuse existing UI primitives (Badge, Input, design tokens). TypeScript strict, no `any`.
- Mobile-responsive + accessible (the suburb chips' X is a real button with an aria-label like
  `Remove {suburb}`; the disabled-at-3 state is conveyed, not just visual).

---

## Verification (run + report)
1. `pnpm typecheck` + `pnpm lint` clean.
2. Step indicator reads "Step 1 of 4" (spacing fixed) on every step.
3. Step 2: the three active cards show their descriptions incl.
   "Physio, psych, dietitian. AHPRA-aware framing." on Allied Health; locked cards correct.
   ```bash
   grep -rnE "Plumber, electrician|B2B software|AHPRA-aware framing" app components   # present
   ```
4. Step 2 usage count: state real-query vs removed (report which).
5. Step 3 manual: add 3 suburbs → they appear as removable chips; the 4th is blocked; removing one
   re-enables Add. Confirm a created brand persists `primaryRegions` as `STATE:Suburb` values
   (check the DB row or the POST payload) — they pass the regex.
6. Favicon: report which branch (chip added vs TODO) and why.
7. Step 4: grep confirms no stale call-count/cost literal remains.

Report: STEP 0 findings, the favicon branch taken, the usage-count case, files changed, and the
Step 3 manual result (cap + chips + STATE:Suburb storage).
