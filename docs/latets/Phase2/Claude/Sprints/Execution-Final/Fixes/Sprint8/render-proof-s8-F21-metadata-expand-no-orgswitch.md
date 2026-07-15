# RENDER-PROOF S8 F21 — audit-log-row metadata expand (WITHOUT the org switcher)

## Why this exists
F21's fix (the metadata "Details" expand) can only be SEEN on a row that HAS metadata. Those rows
(`hallucination_acknowledged` + `{brandId: 418f321f…}`) live on the Metropolitan/Agency org, and
switching to that org in the UI hasn't been working (the app keeps landing on the Growth org, whose
rows all have null metadata → no expand control, correctly). So instead of the live UI, render the
component directly against the two REAL metadata rows. This proves F21 at the component level, which
is sufficient render-proof.

Pick whichever of the two options is easier. Option A (Playwright component/story screenshot) gives
an actual image; Option B (a tiny route or story) lets you screenshot in the browser without org
switching. Either closes F21.

## Option A — Playwright renders the component with a real metadata row (preferred; produces an image)
The Playwright harness already exists at `tests/e2e/`. Add a throwaway spec that mounts
`audit-log-row` with a metadata-bearing entry, expands it, and screenshots.

```bash
cd c:/startup/VisibleAU/src
# Confirm the two real rows + their metadata (so we use real data, not invented):
psql "$PROD" -c "
  SELECT id, action, resource_type, user_id, metadata, created_at
  FROM audit_trail
  WHERE metadata IS NOT NULL
  ORDER BY created_at DESC;"
```
Create `tests/e2e/_tmp-f21-metadata-expand.spec.ts` that:
1. Renders `<AuditLogRow entry={…}>` with an entry mirroring a real row:
   `{ action: 'hallucination_acknowledged', resourceType: 'hallucination_incident',
      actorName: 'Test Agency 1', createdAt: <ts>, metadata: { brandId: '418f321f-...' } }`
   (use the real brandId + a real ts from the query above).
2. Asserts a "Details" / expand control is present (metadata non-null).
3. Clicks it; asserts the panel becomes visible and contains `brandId` and the truncated id
   (`418f321f…`); asserts `aria-expanded` flips false→true.
4. `await page.screenshot({ path: 'tests/e2e/f21-expanded.png' })` with the row expanded.
5. Also render a SECOND instance with `metadata: null` and assert NO expand control (compact) — the
   negative case in the same image if convenient.

Run just this spec:
```bash
npx playwright test tests/e2e/_tmp-f21-metadata-expand.spec.ts
```
Then open `tests/e2e/f21-expanded.png` and paste it. (Delete the tmp spec after — it's a proof, not
a kept test; the real F21 test goes in the Frontend Unit/E2E section of the track.)

## Option B — a temporary story/route to screenshot in-browser (no org switch)
If Playwright screenshotting is fiddly, add a throwaway page that renders the row with a real
metadata entry, so you can just navigate + screenshot:
```
app/(dev)/_f21/page.tsx   (or wherever dev-only pages live)
```
Render two `<AuditLogRow>`: one with `metadata: { brandId: '418f321f-...' }`, one with
`metadata: null`. Navigate to `/_f21`, expand the first, screenshot showing `brandId: 418f321f…`
revealed and the second row compact. Remove the page after.

## What the screenshot/proof must show (either option)
- The metadata row shows a **"Details" / expand control**.
- Expanding it reveals **`brandId: 418f321f…`** (truncated, matching resourceId truncation) in a
  `<dl>` key/value panel.
- `aria-expanded` toggles false→true (Option A asserts it; Option B: keyboard-operable).
- The **null-metadata row shows NO control** (stays compact).

## Constraints
- Use the REAL metadata (`brandId`) + a real row from the psql query — do not invent values.
- Throwaway artifacts (tmp spec / dev page) are removed after the proof; the permanent F21 test
  belongs in the test-track sections.
- Do not modify `audit-log-row.tsx` (the fix is already applied; this only PROVES it renders).

## Report back (paste inline)
1. The psql dump of the 2 metadata rows (confirming real brandId used).
2. The screenshot (Option A `f21-expanded.png`, or Option B browser capture) showing the expanded
   `brandId` + the compact null-metadata row.
3. Confirmation aria-expanded toggles + null-metadata row has no control.
