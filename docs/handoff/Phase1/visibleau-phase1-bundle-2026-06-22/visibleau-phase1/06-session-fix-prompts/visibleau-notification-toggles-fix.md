# VisibleAU — Add missing toggles to Notification Preferences page — Claude Code prompt
# Confirmed gap: /settings/notifications shows the 3 "Email on..." options (Drift Alert, Audit Complete,
#   Schedule Failure) as TEXT LABELS ONLY — there are NO toggle/switch/checkbox controls, so the user
#   CANNOT turn them on or off. The Weekly Digest email field works + saves ("Preferences saved."
#   confirmed), but the 3 booleans are non-functional labels. A preferences page must let users SET the
#   preferences.
# Schema EXISTS (canon L827 notification_preferences, L620/L624): the table has weeklyDigest, digestEmail,
#   emailOnDrift, emailOnAuditComplete, emailOnScheduleFailure. So the columns are there — the UI just
#   never rendered controls bound to the 3 booleans. Add toggles wired to those fields + the save.
# Pins: canon notification_preferences schema (L827), the PATCH body Zod (L624:
#   { weeklyDigest?, digestEmail?, emailOnDrift?, emailOnAuditComplete?, emailOnScheduleFailure? }),
#   the existing save that already persists digestEmail. str_replace/exact-literal only.

═══════════════════════════════════════════════════════════════════════════════
STEP 1 — Add a toggle control to each of the 3 "Email on..." options
═══════════════════════════════════════════════════════════════════════════════
> On the Notification Preferences page (`app/(auth)/settings/notifications/...`), each of these rows
> currently shows a label + description but NO control:
> - "Email on Drift Alert" → bind to `emailOnDrift`
> - "Email on Audit Complete" → bind to `emailOnAuditComplete`
> - "Email on Schedule Failure" → bind to `emailOnScheduleFailure`
> Add a **toggle/switch** (or checkbox) to each row, on the right side of the label, reflecting the
> current boolean value from the loaded `notification_preferences` row and updating local state on click.
> - Also confirm the **Weekly Digest** section has a toggle for `weeklyDigest` itself (the digest on/off),
>   not just the email field — canon's schema has `weeklyDigest` boolean separate from `digestEmail`. If
>   the weeklyDigest on/off toggle is also missing, add it.
> - Use the project's existing switch/toggle component (check the design system / shadcn ui Switch or an
>   existing toggle used elsewhere — e.g. on the webhooks or settings pages) so it matches the app's
>   styling. Do NOT invent a new toggle style.
> - **Dark-mode visibility:** ensure the toggle is clearly visible in dark mode in BOTH off and on states
>   (an off-toggle must not be near-invisible against the dark card — this page is dark and the controls
>   were missing/invisible). Use the design-token colors so on/off are distinguishable.

═══════════════════════════════════════════════════════════════════════════════
STEP 2 — Wire the toggles into the existing Save
═══════════════════════════════════════════════════════════════════════════════
> The Save Preferences action already persists `digestEmail` (confirmed working — "Preferences saved.").
> Extend it to also send the 3 boolean toggle states (+ weeklyDigest) in the PATCH/POST body, per canon's
> Zod (L624: `{ weeklyDigest?, digestEmail?, emailOnDrift?, emailOnAuditComplete?, emailOnScheduleFailure? }`).
> - On load, fetch the org's `notification_preferences` row and initialize ALL toggles from it (so a
>   returning user sees their saved on/off states, not defaults).
> - On Save, upsert all fields (the route already upserts on organizationId — extend the values).
> - Defaults for a brand-new org (per canon L620): weeklyDigest true, emailOnDrift true,
>   emailOnAuditComplete false, emailOnScheduleFailure true (use canon's defaults if the row doesn't
>   exist yet).
> Do NOT change the digestEmail behaviour that already works.

═══════════════════════════════════════════════════════════════════════════════
STEP 3 — Verify (controls + persistence)
═══════════════════════════════════════════════════════════════════════════════
> - Each "Email on..." row now has a visible, clickable toggle (visible in dark mode, off AND on).
> - Toggle one (e.g. emailOnAuditComplete) ON, set the digest email, click Save → "Preferences saved."
> - **Reload the page** → the toggle you flipped STAYS in its new state, and the email persists (proves
>   the booleans round-trip to the DB, not just local state).
> - Toggle one OFF, save, reload → stays off.
> - `npm run typecheck` passes; the digestEmail save still works (no regression).
> Report: the toggles added + bound fields, confirmation they persist across reload, and a note on
> dark-mode visibility.

─────────────────────────────────────────────────────────────────────────────

## Notes for Sri (not part of the paste)
- **Real gap, now confirmed by interaction** — the 3 email options were labels with no controls, so they
  couldn't be set. The schema columns (emailOnDrift / emailOnAuditComplete / emailOnScheduleFailure)
  already exist per canon; only the UI controls + their wiring into save were missing.
- **The digest email already saves** (you saw "Preferences saved.") — so the save plumbing works; this
  just adds the 3 booleans to it. Low risk.
- **Dark-mode visibility called out** — the controls being invisible (vs absent) was a real possibility,
  so the fix requires the toggle to be clearly visible in both states on the dark card.
- **Relevant to the `'completed'` footgun:** "Email on Audit Complete" fires off completed audits — when
  you later test whether these emails actually SEND, that code path is a candidate for the same
  complete/completed typo. (Another nudge toward the grep-sweep.)
- Per your relay discipline: the meaningful verification is the **save + reload** round-trip — that the
  toggles persist, not just render. A toggle that flips visually but resets on reload would be a
  separate (persistence) bug.
