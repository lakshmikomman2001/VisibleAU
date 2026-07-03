-- Subscriptions table — Stripe billing integration
-- Originally created via drizzle-kit push; this migration formalizes it
-- in the pipeline for fresh-DB reproducibility.
-- Idempotent: CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS subscriptions (
  id                     uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        uuid         NOT NULL REFERENCES organizations(id) UNIQUE,
  stripe_customer_id     text         NOT NULL,
  stripe_subscription_id text         NOT NULL UNIQUE,
  stripe_price_id        text         NOT NULL,
  tier                   text         NOT NULL,
  billing_interval       text         NOT NULL,
  status                 text         NOT NULL,
  cancel_at_period_end   boolean      NOT NULL DEFAULT false,
  current_period_start   timestamp with time zone,
  current_period_end     timestamp with time zone,
  metadata               jsonb        NOT NULL DEFAULT '{}',
  created_at             timestamp with time zone NOT NULL DEFAULT now(),
  updated_at             timestamp with time zone NOT NULL DEFAULT now()
);
