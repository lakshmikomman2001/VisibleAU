-- Migration 0106 (Vunnara, 31 Oct, A1): the audit-complete email is on
-- by default for the org's owner and admins (Sri's decision; anyone can
-- switch it off under Settings > Notifications).
--
-- The app already treats "no notification_preferences row" as on
-- (lib/email/recipients.ts, NOTIFICATION_PREFERENCES.audit_complete);
-- this makes a row inserted without the column agree. The app never
-- relies on this default -- the table's only writer, PATCH
-- /api/notification-preferences, always sends the column -- so it can
-- be applied before or after the code that depends on it.
--
-- Existing rows keep the value they hold. Every row was written by Save
-- on the settings page, which sends every switch as shown, so a stored
-- false can't be told apart from "saved while the old default showed
-- off" -- nothing records which (no updated_by, no audit-trail entry).
-- Flipping any of them is Sri's call (prod-fix 0106 run1 prints the
-- counts).
BEGIN;

ALTER TABLE notification_preferences
  ALTER COLUMN email_on_audit_complete SET DEFAULT true;

COMMIT;
