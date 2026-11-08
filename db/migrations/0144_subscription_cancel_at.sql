-- Migration 0144 (Vunnara, 9 Nov; mock-gate and retention follow-ups, part 8): Stripe's scheduled cancellation date.
--
-- RUN BEFORE THE PUSH THAT CARRIES IT (prod-fix 0144 run1 -> run3; run4 only to undo).
--
-- A Stripe subscription can be set to cancel on a fixed date (cancel_at, "Auto-cancels 23 Dec 2026" in Stripe),
-- separately from cancel_at_period_end. The webhook handlers stored only the latter, so Splice's sandbox
-- subscription, set to cancel on 23 Dec, showed "Next renewal 24 Nov 2026" with no warning. The pushed handlers
-- store cancel_at here (lib/stripe/webhook-handlers), the billing line says "Plan ends <date>"
-- (lib/pricing/renewal.ts), and the plan rule keeps the plan until then (lib/pricing/effective-tier.ts).
--
-- Why before the push: Drizzle selects every column of its schema, so the pushed code's reads of subscriptions
-- ask for cancel_at. A nullable column with no default changes nothing for the code deployed now.
--
-- Idempotent.

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancel_at timestamptz;
