-- Migration 0127 (Vunnara, 7 Nov, methodology v2.2 part 4): a failed call's
-- cost can be unknown. A call that timed out returns no usage, yet the
-- provider may already have billed it (a search run, tokens written before our
-- abort). engine_call_failures.cost_usd was NOT NULL, so such a call was
-- recorded as $0 -- a guessed number shown as measured, understating spend.
-- From now on it is NULL: unknown, and the audit's cost reads "Cost
-- incomplete: 1 call timed out" (lib/audit/answered-count.ts).
--
-- Only the NOT NULL goes; the default '0' stays, so an insert that leaves the
-- column out still means "nothing billed", as before. Metadata-only: no row is
-- rewritten. Existing rows keep their values (prod-fix
-- 0127-failure-cost-unknown-run2b-backfill-timeouts.sql is the optional step
-- that marks past timeouts' $0 as unknown).

ALTER TABLE engine_call_failures ALTER COLUMN cost_usd DROP NOT NULL;
