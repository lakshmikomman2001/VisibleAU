# VisibleAU — Fix: Agency Branding "Save" returns "Validation failed" (likely empty optional fields)
**Claude Code prompt — paste into a Claude Code session on the VisibleAU repo.**
On `/agency/branding`, filling Agency Name + colors and clicking "Save Branding" returns **"Validation
failed"** and does NOT save. Logo URL, Footer Text, Contact Line were left EMPTY (placeholders only).
Likely cause: validation rejects empty OPTIONAL fields (e.g. a URL validator failing on empty string),
OR requires fields that should be optional. Also, the error is uselessly vague — it doesn't say which
field failed.

## STEP 0 — Find the validation (schema + where it runs) and report exactly what's failing
```bash
# The save API + its validation:
sed -n '1,120p' app/api/agency/branding/route.ts
# The validation schema (zod or similar) for branding fields:
grep -rniE "agencyName|logoUrl|primaryColor|footerText|contactLine|brandingSchema|z\.object|z\.string|\.url\(|\.optional\(|nullable|regex.*#|hex" app/api/agency/branding lib app/(auth)/agency/branding 2>/dev/null | head -40
# The client form submit (to see what it sends — empty string vs undefined vs null):
grep -rniE "Save Branding|onSubmit|fetch.*branding|PATCH.*branding|JSON.stringify|Validation failed" app/(auth)/agency/branding 2>/dev/null | head
```
Report: the exact validation schema for each field, and what the CLIENT sends for empty fields (empty
string `""`? null? undefined?). Identify WHICH field(s) fail validation when Logo URL / Footer Text /
Contact Line are empty.

## STEP 1 — Fix: make optional fields truly optional + accept empties
The expected behaviour: only Agency Name (and valid colors) should be required; Logo URL, Footer Text,
Contact Line, Secondary/Accent colors are OPTIONAL and may be blank. Fix the validation so:
- **Logo URL:** optional — accept empty string / null / omitted. If provided, validate as URL; if blank,
  treat as "not set" (null). A bare `z.string().url()` FAILS on `""` — use the pattern this codebase
  uses for optional URLs, e.g. `z.string().url().optional().or(z.literal(""))` then normalize `""`→null,
  or `z.union([z.string().url(), z.literal("")]).optional()`. Match the existing optional-field
  convention in the repo.
- **Footer Text / Contact Line:** optional strings — accept empty/blank → store as null.
- **Colors:** required ones (primary/accent per current behaviour) validated as hex; optional ones may be
  blank. Confirm the hex regex accepts the given values (#0066CC, #1A1A1A, #FF6B35) — these look valid,
  so colors are probably NOT the failure, but verify.
- Normalize empty strings to null on save (so the 2-tier branding fetch + assetToTheme() treat unset
  fields correctly — consistent with the fallback behaviour).
- Ensure CLIENT and SERVER validation agree (if the client sends `""` for empty, the server schema must
  accept it). If the client should send null/undefined for blanks, fix the client to do so.

## STEP 2 — Fix the vague error (UX)
"Validation failed" with no detail is poor. Improve it:
- Return the specific validation error(s) from the API (which field + why), and surface them in the form
  (e.g. inline under the offending field, or a message listing the issues).
- At minimum, the user should know WHICH field is invalid and why (e.g. "Logo URL must be a valid URL or
  left blank").

## STEP 3 — Verify
Operator:
1. `/agency/branding` → Agency Name "Acme Digital", colors as-is, leave Logo URL / Footer / Contact
   BLANK → Save → should SUCCEED now (no "Validation failed"), branding persists.
2. Reload the page → the saved values are still there (persistence confirmed).
3. Also test WITH a logo URL + footer + contact filled → saves fine.
4. Negative: enter an invalid Logo URL (e.g. "not-a-url") → should show a CLEAR field-specific error
   (not generic "Validation failed").
Also: typecheck clean.

## STEP 4 — Report
- The validation schema before/after (which field rejected empties + the fix).
- Whether client/server disagreed on empty representation, and how it's reconciled.
- The improved error messaging.
- Confirmation: saving with optional fields blank now succeeds + persists.

## Constraints
- Only Agency Name + required colors are mandatory; Logo URL / Footer Text / Contact Line / optional
  colors may be blank. Don't make optional fields required.
- Match the repo's existing optional-field / hex-color validation conventions; normalize ""→null on save.
- Keep client and server validation in agreement.
- Improve the error to be field-specific (no bare "Validation failed").
- Don't change the branding render logic (that works — Preview shows correctly); this is the SAVE path.
