-- diag-0060-prompts-per-audit.sql (task #46, read-only prompt-pipeline diagnosis)
--
-- PRODUCTION branch. READ-ONLY. Paste into the Neon SQL editor. NOT run
-- from Claude Code -- there is no prod access from that environment.
-- Sri-authorized only. TWO separate SELECT statements below (a blank
-- line and "-- Query 2" mark the split) -- run them as two pastes if
-- your SQL client only shows one result grid per execution.
--
-- Pinned to two brand ids (never a name lookup -- several brands share
-- names):
--   188a76ff-70ea-47f0-bab4-fc2f03c98c9d -- Get Plumbing
--   54b58fce-98f9-4749-ae25-9e541c0f874a -- Bondi Plumbing
--
-- WHAT THIS CHECKS, per brand:
--
-- Query 1 (brand_state): the brand's own stored location/classification
-- state at the time this is run -- primary_regions (the "STATE:suburb"
-- strings prompts are actually built from, per lib/verticals/expand-prompt.ts's
-- formatLocation and lib/audit/run-audit-inline.ts's getAuditPrompts),
-- classification_status/classification_at (when/whether the async
-- classification job -- inngest/functions/classify-on-brand-create.ts /
-- classify-existing-brands.ts -- completed), and prompt_pack_version /
-- how many prompts are in the stored prompt_pack array. This is the
-- state TODAY, not at each audit's own run time -- Postgres doesn't keep
-- a history of this row, so it can only be compared against each
-- audit's completed_at as a rough "before/after" signal, never proof.
--
-- Query 2 (prompts_per_audit): for every COMPLETED audit for this brand,
-- every DISTINCT prompt text actually asked (citations.prompt -- this
-- table stores one row per prompt x engine x run; prompt text is NOT
-- stored anywhere else, e.g. there is no audits.prompts snapshot column),
-- its is_branded_prompt flag, and which engines answered it at
-- run_number = 1 (the real calls; run_number > 1 are cache replays of
-- the exact same prompt text within the same audit and would be
-- redundant here). This is what directly answers "why did audit #20 have
-- 10 prompts with none branded, and #23 have 9 with 4 branded" -- compare
-- the two audits' rows directly, and cross-reference each audit's
-- completed_at against Query 1's classification_at.
--
-- HYPOTHESIS THIS IS DESIGNED TO LET SRI CONFIRM/REFUTE (code-reading
-- evidence only, not yet verified against prod data): brand.classification
-- starts NULL for an existing brand (classification_status = 'pending')
-- -- in that state, getAuditPrompts/the Inngest "load-pack" step both
-- fall through to the DETERMINISTIC vertical_pack_prompts template path
-- (rank-ordered, LIMIT 10, no randomness) -- see
-- lib/audit/run-audit-inline.ts:518-548 and
-- inngest/functions/run-audit.ts:110-145. Once classifyAndStoreBrand
-- (lib/brands/classify-and-store.ts) completes -- triggered either at
-- brand-creation time (classify-on-brand-create.ts) or by the one-off
-- "brand/classify-all" backfill event (classify-existing-brands.ts,
-- 2s-apart batch over every brand with classification IS NULL) --
-- brand.prompt_pack gets populated via buildPromptPack
-- (lib/prompts/build-prompt-pack.ts), which uses Math.random() shuffle()
-- and a Set-based dedup that can yield fewer than the requested 10 after
-- removing duplicates. Every SUBSEQUENT audit for that brand then reads
-- from prompt_pack instead of the vertical pack templates, flagging
-- "branded" by provenance (lib/audit/flag-branded-prompts.ts's
-- isBrandedPackPrompt: matches the brand-name-containing prompts
-- buildEnrichedPrompts would deterministically generate -- up to 4 of
-- them: 2 "X vs competitor", 1 "best alternatives to X", 1 "is X
-- popular"). If Get Plumbing's classification_at falls between audit
-- #20's completed_at and #23's completed_at, that is direct, strong
-- support for this being the root cause -- a one-time classification-
-- completion event, not an ongoing per-audit randomization or a code
-- change between the two runs.
--
-- SEPARATE, ALREADY-CONFIRMED-BY-CODE-READING FACT (no query needed,
-- noted here for context): brand creation's wizard
-- (app/(auth)/brands/wizard/wizard-form.tsx:96) defaults primary_regions
-- to ["NSW:Sydney CBD"] whenever the user submits without picking a
-- suburb -- "NSW:Bondi" IS a valid, selectable option
-- (lib/locations/index.ts:3), so if Bondi Plumbing's primary_regions
-- below still reads "NSW:Sydney CBD", that is a data-entry gap (the
-- suburb step was skipped when this brand was created), not a bug in
-- the prompt-generation code itself -- the code faithfully builds
-- prompts from whatever location the brand record actually has.

WITH target_brands AS (
  SELECT * FROM (VALUES
    ('188a76ff-70ea-47f0-bab4-fc2f03c98c9d'::uuid, 'Get Plumbing (pinned)'),
    ('54b58fce-98f9-4749-ae25-9e541c0f874a'::uuid, 'Bondi Plumbing (pinned)')
  ) AS t(id, pinned_label)
)

-- Query 1: brand_state
SELECT
  tb.pinned_label,
  b.id AS brand_id,
  b.name AS stored_name,
  b.vertical,
  b.region,
  b.primary_regions,
  b.classification_status,
  b.classification_at,
  b.prompt_pack_version,
  CASE WHEN b.prompt_pack IS NULL THEN NULL ELSE jsonb_array_length(b.prompt_pack) END AS prompt_pack_length,
  b.prompt_pack AS prompt_pack_full_text
FROM target_brands tb
JOIN brands b ON b.id = tb.id
ORDER BY tb.pinned_label;

-- Query 2: prompts_per_audit
--
-- One row per (audit, distinct prompt text). citations.prompt is the
-- only place prompt text is stored -- there is no snapshot column on
-- audits itself. engines_answered lists every engine that has a
-- run_number = 1 (real call, not a cache replay) row for that exact
-- prompt text in that audit; run_count is how many distinct engines
-- that is, out of the audit's own engine_count, so a partial-coverage
-- prompt (e.g. one engine failed/timed out) is visible directly.
WITH target_brands AS (
  SELECT * FROM (VALUES
    ('188a76ff-70ea-47f0-bab4-fc2f03c98c9d'::uuid, 'Get Plumbing (pinned)'),
    ('54b58fce-98f9-4749-ae25-9e541c0f874a'::uuid, 'Bondi Plumbing (pinned)')
  ) AS t(id, pinned_label)
),
target_audits AS (
  SELECT
    tb.pinned_label,
    a.id AS audit_id,
    a.audit_number,
    a.engine_count,
    a.prompts_count AS stored_prompts_count,
    a.completed_at
  FROM target_brands tb
  JOIN audits a ON a.brand_id = tb.id
  WHERE a.status = 'complete'
)
SELECT
  ta.pinned_label,
  ta.audit_number,
  ta.completed_at,
  ta.engine_count AS audit_engine_count,
  ta.stored_prompts_count,
  c.prompt,
  bool_or(c.is_branded_prompt) AS is_branded_prompt,
  array_agg(DISTINCT c.engine ORDER BY c.engine) AS engines_answered,
  count(DISTINCT c.engine) AS run_count
FROM target_audits ta
JOIN citations c ON c.audit_id = ta.audit_id AND c.run_number = 1
GROUP BY ta.pinned_label, ta.audit_number, ta.completed_at, ta.engine_count, ta.stored_prompts_count, c.prompt
ORDER BY ta.pinned_label, ta.audit_number, min(c.created_at);
