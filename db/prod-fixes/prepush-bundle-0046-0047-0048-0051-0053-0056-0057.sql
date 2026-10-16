-- prepush-bundle-0046-0047-0048-0051-0053-0056-0057.sql (task #46, 8th
-- follow-up; type-comparison fixed in the 9th follow-up; regenerated in
-- the 16th follow-up to add 0051 and 0053; regenerated again in Phase 3,
-- Part D to add 0056 and 0057 -- supersedes
-- prepush-bundle-0046-0047-0048-0051-0053.sql and
-- prepush-bundle-0046-0047-0048.sql, both kept in place as historical
-- record, not deleted. Does NOT fold in Sri's own separate, unrelated
-- 0054 (rate_limit_counters) work-in-progress -- that bundle
-- (prepush-bundle-0046-0047-0048-0051-0053-0054.sql) is his own, not
-- part of this task.)
--
-- Run on the PRODUCTION branch in the Neon SQL editor, AFTER applying
-- 0051 (db/prod-fixes/0051-ai-bot-ip-ranges-unique-apply-prod.sql), 0053
-- (db/prod-fixes/0053-org-members-invite-expiry-apply-prod.sql), 0056
-- (already applied by Sri 17 Oct -- db/prod-fixes/0056-run2-apply.sql)
-- and 0057 (db/prod-fixes/0057-run2-apply.sql). Screenshot the whole
-- grid. Any STOP -> don't push; send the screenshot to Claude.
--
-- Bundles seven previously-separate read-only prechecks into ONE
-- statement, ONE result grid:
--   - db/prod-fixes/precheck-0046-csi-source-type-constraint.sql
--   - db/prod-fixes/0047-citations-audits-indexes-precheck-prod.sql
--   - db/prod-fixes/diag-0048-schema-drift-prod.sql (column checks only
--     -- its index checks are a separate, standalone concern; the
--     citations/audits index check here is 0047's own, narrower one)
--   - db/prod-fixes/0051-ai-bot-ip-ranges-unique-precheck-prod.sql
--   - db/prod-fixes/0053-org-members-invite-expiry-precheck-prod.sql
--   - db/prod-fixes/0056-run1-precheck.sql (citations.is_cache_hit)
--   - db/prod-fixes/0057-run1-precheck.sql (citations.response_text)
--
-- STRICTLY READ-ONLY: no DDL, DML, SET, or side-effecting functions --
-- every row comes from information_schema/pg_catalog introspection and
-- plain SELECT/COUNT/GROUP BY against existing data. NOT run from
-- Claude Code.
--
-- Column meaning:
--   check_name -- which precheck this row is from ("OVERALL" is this
--                 file's own summary row, not one of the five prechecks)
--   result     -- PASS | STOP | INFO (never anything else)
--   detail     -- the evidence; STOP rows list exactly what's wrong,
--                 INFO rows are context only, never block the push
--
-- "Safe to push": row 0 (OVERALL) shows PASS. "Stop, don't push": OVERALL
-- shows STOP -- read the STOP row(s) below it, then send the screenshot to
-- Claude before pushing 0b31a94..7ecef68.
--
-- Task #46 (16th follow-up, + Phase 3 Part D): row 9 (0048's generic
-- "missing columns" check, driven by expected_columns below) already
-- catches a missing org_members.expires_at / citations.is_cache_hit /
-- citations.response_text once each row is added to expected_columns --
-- rows 17/18/19/20 duplicate those specific checks explicitly and by
-- name anyway, matching this file's own established style (e.g. row 6
-- also restates something the other rows already imply) so "0053",
-- "0051", "0056" and "0057" are each individually visible in the grid,
-- not buried inside row 9's aggregate.
--
-- Task #46 (9th follow-up): the type-mismatch check (row 10, 0048) now
-- compares canonical Postgres type spellings on BOTH sides --
-- live_columns reads pg_catalog's format_type(atttypid, atttypmod)
-- instead of information_schema.columns.data_type/udt_name (which
-- collapsed every array column to the bare string "ARRAY", discarding the
-- element type), and expected_columns' type strings are generated from
-- Drizzle's own getSQLType() through the same canonicalPgType() helper
-- scripts/qa/schema-drift.ts uses, so a naming-only difference (text[]
-- reported as "ARRAY", "timestamp" vs "timestamp without time zone")
-- can't produce a STOP here anymore -- only a real type, time-zone, or
-- precision difference can. See docs/ops/post-launch-db-hardening.md
-- section 46 (9th follow-up) for the before/after proof.

WITH
expected_columns(table_name, column_name, expected_type, expected_not_null) AS (
  VALUES
  ('action_items', 'id', 'uuid', true),
  ('action_items', 'organization_id', 'uuid', true),
  ('action_items', 'brand_id', 'uuid', true),
  ('action_items', 'audit_id', 'uuid', true),
  ('action_items', 'recommendation_key', 'text', true),
  ('action_items', 'dimension', 'text', true),
  ('action_items', 'title', 'text', true),
  ('action_items', 'action', 'text', true),
  ('action_items', 'confidence_label', 'text', true),
  ('action_items', 'expected_impact_score', 'text', true),
  ('action_items', 'evidence_refs', 'jsonb', true),
  ('action_items', 'status', 'text', true),
  ('action_items', 'dismissed_reason', 'text', false),
  ('action_items', 'done_at', 'timestamp with time zone', false),
  ('action_items', 'dismissed_at', 'timestamp with time zone', false),
  ('action_items', 'created_at', 'timestamp with time zone', true),
  ('action_items', 'updated_at', 'timestamp with time zone', true),
  ('agency_brand_assets', 'id', 'uuid', true),
  ('agency_brand_assets', 'organization_id', 'uuid', true),
  ('agency_brand_assets', 'brand_id', 'uuid', false),
  ('agency_brand_assets', 'logo_url', 'text', false),
  ('agency_brand_assets', 'primary_color', 'text', true),
  ('agency_brand_assets', 'secondary_color', 'text', true),
  ('agency_brand_assets', 'accent_color', 'text', true),
  ('agency_brand_assets', 'footer_text', 'text', false),
  ('agency_brand_assets', 'contact_line', 'text', false),
  ('agency_brand_assets', 'agency_name', 'text', false),
  ('agency_brand_assets', 'contact_email', 'text', false),
  ('agency_brand_assets', 'updated_at', 'timestamp with time zone', true),
  ('agent_readiness_scores', 'id', 'uuid', true),
  ('agent_readiness_scores', 'brand_id', 'uuid', true),
  ('agent_readiness_scores', 'organization_id', 'uuid', true),
  ('agent_readiness_scores', 'tech_llmstxt_present', 'boolean', false),
  ('agent_readiness_scores', 'tech_llmstxt_valid', 'boolean', false),
  ('agent_readiness_scores', 'tech_robots_allows_crawlers', 'boolean', false),
  ('agent_readiness_scores', 'tech_ssr_passes', 'boolean', false),
  ('agent_readiness_scores', 'tech_ai_discovery_endpoints', 'boolean', false),
  ('agent_readiness_scores', 'tech_page_load_fast', 'boolean', false),
  ('agent_readiness_scores', 'tech_mcp_endpoint_present', 'boolean', false),
  ('agent_readiness_scores', 'tech_mcp_endpoint_valid', 'boolean', false),
  ('agent_readiness_scores', 'tech_mcp_tools_count', 'integer', false),
  ('agent_readiness_scores', 'tech_score', 'integer', false),
  ('agent_readiness_scores', 'entity_org_schema_present', 'boolean', false),
  ('agent_readiness_scores', 'entity_local_business_schema', 'boolean', false),
  ('agent_readiness_scores', 'entity_local_reg_in_schema', 'boolean', false),
  ('agent_readiness_scores', 'entity_name_consistent', 'boolean', false),
  ('agent_readiness_scores', 'entity_service_readable', 'boolean', false),
  ('agent_readiness_scores', 'entity_clarity_score', 'integer', false),
  ('agent_readiness_scores', 'verify_abn_confirmed', 'boolean', false),
  ('agent_readiness_scores', 'verify_wikipedia_au', 'boolean', false),
  ('agent_readiness_scores', 'verify_au_directories', 'integer', false),
  ('agent_readiness_scores', 'verify_review_citations', 'integer', false),
  ('agent_readiness_scores', 'verify_expert_quotes', 'boolean', false),
  ('agent_readiness_scores', 'verify_score', 'integer', false),
  ('agent_readiness_scores', 'authority_topical_coverage', 'integer', false),
  ('agent_readiness_scores', 'authority_prompt_appearance', 'integer', false),
  ('agent_readiness_scores', 'authority_citation_diversity', 'integer', false),
  ('agent_readiness_scores', 'authority_score', 'integer', false),
  ('agent_readiness_scores', 'task_booking_accessible', 'boolean', false),
  ('agent_readiness_scores', 'task_pricing_visible', 'boolean', false),
  ('agent_readiness_scores', 'task_service_area_defined', 'boolean', false),
  ('agent_readiness_scores', 'task_faq_direct_answers', 'integer', false),
  ('agent_readiness_scores', 'task_score', 'integer', false),
  ('agent_readiness_scores', 'local_ai_trust_score', 'integer', false),
  ('agent_readiness_scores', 'total_score', 'integer', false),
  ('agent_readiness_scores', 'gaps', 'jsonb', false),
  ('agent_readiness_scores', 'scored_at', 'timestamp with time zone', true),
  ('agent_readiness_scores', 'updated_at', 'timestamp with time zone', true),
  ('ai_bot_ip_ranges', 'id', 'uuid', true),
  ('ai_bot_ip_ranges', 'vendor', 'text', true),
  ('ai_bot_ip_ranges', 'cidr', 'cidr', true),
  ('ai_bot_ip_ranges', 'source_url', 'text', true),
  ('ai_bot_ip_ranges', 'version_hash', 'text', true),
  ('ai_bot_ip_ranges', 'is_current', 'boolean', true),
  ('ai_bot_ip_ranges', 'fetched_at', 'timestamp with time zone', true),
  ('ai_bot_registry', 'id', 'uuid', true),
  ('ai_bot_registry', 'ua_token', 'text', true),
  ('ai_bot_registry', 'match_mode', 'text', true),
  ('ai_bot_registry', 'vendor', 'text', true),
  ('ai_bot_registry', 'crawler_tier', 'text', true),
  ('ai_bot_registry', 'default_purpose', 'text', false),
  ('ai_bot_registry', 'is_agent_ua', 'boolean', true),
  ('ai_bot_registry', 'ai_platform', 'text', false),
  ('ai_bot_registry', 'verification_paths', 'jsonb', true),
  ('ai_bot_registry', 'cidr_source_url', 'text', false),
  ('ai_bot_registry', 'ptr_domain_suffix', 'text', false),
  ('ai_bot_registry', 'expected_asns', 'integer[]', false),
  ('ai_bot_registry', 'respects_robots', 'boolean', false),
  ('ai_bot_registry', 'is_active', 'boolean', true),
  ('ai_bot_registry', 'notes', 'text', false),
  ('ai_bot_registry', 'created_at', 'timestamp with time zone', true),
  ('ai_bot_registry', 'updated_at', 'timestamp with time zone', true),
  ('ai_referral_hits', 'id', 'uuid', true),
  ('ai_referral_hits', 'organization_id', 'uuid', true),
  ('ai_referral_hits', 'brand_id', 'uuid', true),
  ('ai_referral_hits', 'referrer_domain', 'text', true),
  ('ai_referral_hits', 'ai_platform', 'text', true),
  ('ai_referral_hits', 'landing_path', 'text', true),
  ('ai_referral_hits', 'session_count', 'integer', true),
  ('ai_referral_hits', 'period_start', 'date', true),
  ('ai_referral_hits', 'period_end', 'date', true),
  ('ai_referral_hits', 'source', 'text', true),
  ('ai_referral_hits', 'created_at', 'timestamp with time zone', true),
  ('audit_cost_snapshots', 'id', 'uuid', true),
  ('audit_cost_snapshots', 'audit_id', 'uuid', true),
  ('audit_cost_snapshots', 'organization_id', 'uuid', true),
  ('audit_cost_snapshots', 'market_code', 'text', true),
  ('audit_cost_snapshots', 'locale', 'text', true),
  ('audit_cost_snapshots', 'estimated_cost_cents', 'integer', true),
  ('audit_cost_snapshots', 'actual_cost_cents', 'integer', true),
  ('audit_cost_snapshots', 'prompt_count', 'integer', true),
  ('audit_cost_snapshots', 'provider_call_count', 'integer', true),
  ('audit_cost_snapshots', 'budget_policy_id', 'uuid', false),
  ('audit_cost_snapshots', 'created_at', 'timestamp with time zone', true),
  ('audit_exports', 'id', 'uuid', true),
  ('audit_exports', 'audit_id', 'uuid', true),
  ('audit_exports', 'organization_id', 'uuid', true),
  ('audit_exports', 'format', 'text', true),
  ('audit_exports', 'generated_at', 'timestamp with time zone', true),
  ('audit_exports', 'file_size_bytes', 'integer', false),
  ('audit_exports', 'download_count', 'integer', true),
  ('audit_schedules', 'id', 'uuid', true),
  ('audit_schedules', 'organization_id', 'uuid', true),
  ('audit_schedules', 'brand_id', 'uuid', true),
  ('audit_schedules', 'frequency', 'text', true),
  ('audit_schedules', 'status', 'text', true),
  ('audit_schedules', 'next_run_at', 'timestamp with time zone', true),
  ('audit_schedules', 'last_run_at', 'timestamp with time zone', false),
  ('audit_schedules', 'paused_reason', 'text', false),
  ('audit_schedules', 'updated_at', 'timestamp with time zone', true),
  ('audit_schedules', 'created_at', 'timestamp with time zone', true),
  ('audit_trail', 'id', 'uuid', true),
  ('audit_trail', 'organization_id', 'uuid', true),
  ('audit_trail', 'user_id', 'uuid', false),
  ('audit_trail', 'action', 'text', true),
  ('audit_trail', 'resource_type', 'text', true),
  ('audit_trail', 'resource_id', 'text', false),
  ('audit_trail', 'metadata', 'jsonb', false),
  ('audit_trail', 'ip_address', 'text', false),
  ('audit_trail', 'user_agent', 'text', false),
  ('audit_trail', 'created_at', 'timestamp with time zone', true),
  ('audits', 'id', 'uuid', true),
  ('audits', 'brand_id', 'uuid', true),
  ('audits', 'organization_id', 'uuid', true),
  ('audits', 'audit_number', 'integer', true),
  ('audits', 'status', 'text', true),
  ('audits', 'triggered_by', 'text', true),
  ('audits', 'engines', 'text[]', true),
  ('audits', 'prompts_count', 'integer', false),
  ('audits', 'runs_per_prompt', 'integer', false),
  ('audits', 'total_calls', 'integer', false),
  ('audits', 'score_composite', 'numeric(5,2)', false),
  ('audits', 'score_frequency', 'numeric(5,2)', false),
  ('audits', 'score_position', 'numeric(5,2)', false),
  ('audits', 'score_sentiment', 'text', false),
  ('audits', 'score_sentiment_numeric', 'numeric(5,2)', false),
  ('audits', 'score_context', 'text', false),
  ('audits', 'score_context_numeric', 'numeric(5,2)', false),
  ('audits', 'score_accuracy', 'numeric(5,2)', false),
  ('audits', 'score_confidence_low', 'numeric(5,2)', false),
  ('audits', 'score_confidence_high', 'numeric(5,2)', false),
  ('audits', 'confidence_intervals', 'jsonb', true),
  ('audits', 'engine_count', 'integer', false),
  ('audits', 'total_cost_usd', 'numeric(10,4)', false),
  ('audits', 'metadata', 'jsonb', true),
  ('audits', 'started_at', 'timestamp with time zone', false),
  ('audits', 'completed_at', 'timestamp with time zone', false),
  ('audits', 'failed_at', 'timestamp with time zone', false),
  ('audits', 'error_message', 'text', false),
  ('audits', 'created_at', 'timestamp with time zone', true),
  ('audits', 'config_bundle_id', 'uuid', false),
  ('audits', 'config_digest', 'text', false),
  ('audits', 'estimated_cost_cents', 'integer', false),
  ('audits', 'quality_status', 'text', false),
  ('auth_accounts', 'id', 'text', true),
  ('auth_accounts', 'account_id', 'text', true),
  ('auth_accounts', 'provider_id', 'text', true),
  ('auth_accounts', 'user_id', 'text', true),
  ('auth_accounts', 'access_token', 'text', false),
  ('auth_accounts', 'refresh_token', 'text', false),
  ('auth_accounts', 'id_token', 'text', false),
  ('auth_accounts', 'access_token_expires_at', 'timestamp with time zone', false),
  ('auth_accounts', 'refresh_token_expires_at', 'timestamp with time zone', false),
  ('auth_accounts', 'scope', 'text', false),
  ('auth_accounts', 'password', 'text', false),
  ('auth_accounts', 'created_at', 'timestamp with time zone', true),
  ('auth_accounts', 'updated_at', 'timestamp with time zone', true),
  ('auth_invitations', 'id', 'text', true),
  ('auth_invitations', 'organization_id', 'text', true),
  ('auth_invitations', 'email', 'text', true),
  ('auth_invitations', 'role', 'text', false),
  ('auth_invitations', 'status', 'text', true),
  ('auth_invitations', 'expires_at', 'timestamp with time zone', true),
  ('auth_invitations', 'inviter_id', 'text', true),
  ('auth_invitations', 'created_at', 'timestamp with time zone', true),
  ('auth_members', 'id', 'text', true),
  ('auth_members', 'organization_id', 'text', true),
  ('auth_members', 'user_id', 'text', true),
  ('auth_members', 'role', 'text', true),
  ('auth_members', 'created_at', 'timestamp with time zone', true),
  ('auth_organizations', 'id', 'text', true),
  ('auth_organizations', 'name', 'text', true),
  ('auth_organizations', 'slug', 'text', false),
  ('auth_organizations', 'logo', 'text', false),
  ('auth_organizations', 'metadata', 'text', false),
  ('auth_organizations', 'created_at', 'timestamp with time zone', true),
  ('auth_sessions', 'id', 'text', true),
  ('auth_sessions', 'expires_at', 'timestamp with time zone', true),
  ('auth_sessions', 'token', 'text', true),
  ('auth_sessions', 'ip_address', 'text', false),
  ('auth_sessions', 'user_agent', 'text', false),
  ('auth_sessions', 'user_id', 'text', true),
  ('auth_sessions', 'created_at', 'timestamp with time zone', true),
  ('auth_sessions', 'updated_at', 'timestamp with time zone', true),
  ('auth_users', 'id', 'text', true),
  ('auth_users', 'name', 'text', true),
  ('auth_users', 'email', 'text', true),
  ('auth_users', 'email_verified', 'boolean', true),
  ('auth_users', 'image', 'text', false),
  ('auth_users', 'created_at', 'timestamp with time zone', true),
  ('auth_users', 'updated_at', 'timestamp with time zone', true),
  ('auth_verifications', 'id', 'text', true),
  ('auth_verifications', 'identifier', 'text', true),
  ('auth_verifications', 'value', 'text', true),
  ('auth_verifications', 'expires_at', 'timestamp with time zone', true),
  ('auth_verifications', 'created_at', 'timestamp with time zone', true),
  ('auth_verifications', 'updated_at', 'timestamp with time zone', true),
  ('brand_consensus_checks', 'id', 'uuid', true),
  ('brand_consensus_checks', 'brand_id', 'uuid', true),
  ('brand_consensus_checks', 'organization_id', 'uuid', true),
  ('brand_consensus_checks', 'market_code', 'text', true),
  ('brand_consensus_checks', 'source_type', 'text', true),
  ('brand_consensus_checks', 'source_url', 'text', false),
  ('brand_consensus_checks', 'name_match', 'boolean', false),
  ('brand_consensus_checks', 'service_match', 'boolean', false),
  ('brand_consensus_checks', 'location_match', 'boolean', false),
  ('brand_consensus_checks', 'price_positioning', 'text', false),
  ('brand_consensus_checks', 'differentiators_match', 'boolean', false),
  ('brand_consensus_checks', 'consistency_score', 'integer', false),
  ('brand_consensus_checks', 'discrepancies', 'jsonb', false),
  ('brand_consensus_checks', 'checked_at', 'timestamp with time zone', true),
  ('brand_consensus_checks', 'updated_at', 'timestamp with time zone', true),
  ('brand_entity_scores', 'id', 'uuid', true),
  ('brand_entity_scores', 'brand_id', 'uuid', true),
  ('brand_entity_scores', 'organization_id', 'uuid', false),
  ('brand_entity_scores', 'market_code', 'text', false),
  ('brand_entity_scores', 'abn_verified', 'boolean', true),
  ('brand_entity_scores', 'abn_number', 'text', false),
  ('brand_entity_scores', 'abn_entity_name', 'text', false),
  ('brand_entity_scores', 'abn_status', 'text', false),
  ('brand_entity_scores', 'local_reg_verified', 'boolean', false),
  ('brand_entity_scores', 'local_reg_number', 'text', false),
  ('brand_entity_scores', 'wikipedia_au_present', 'boolean', true),
  ('brand_entity_scores', 'wikipedia_au_url', 'text', false),
  ('brand_entity_scores', 'wikipedia_au_mentions', 'integer', true),
  ('brand_entity_scores', 'wikipedia_local_present', 'boolean', false),
  ('brand_entity_scores', 'wikipedia_local_url', 'text', false),
  ('brand_entity_scores', 'au_tld_domains', 'jsonb', true),
  ('brand_entity_scores', 'au_tld_present', 'boolean', false),
  ('brand_entity_scores', 'au_directory_presence', 'jsonb', true),
  ('brand_entity_scores', 'hipages_present', 'boolean', false),
  ('brand_entity_scores', 'hipages_rating', 'numeric(3,1)', false),
  ('brand_entity_scores', 'yellow_pages_present', 'boolean', false),
  ('brand_entity_scores', 'service_seeking_present', 'boolean', false),
  ('brand_entity_scores', 'word_of_mouth_present', 'boolean', false),
  ('brand_entity_scores', 'word_of_mouth_rating', 'numeric(3,1)', false),
  ('brand_entity_scores', 'local_directory_count', 'integer', false),
  ('brand_entity_scores', 'local_directory_details', 'jsonb', false),
  ('brand_entity_scores', 'knowledge_panel_present', 'boolean', false),
  ('brand_entity_scores', 'knowledge_panel_accurate', 'boolean', false),
  ('brand_entity_scores', 'knowledge_panel_url', 'text', false),
  ('brand_entity_scores', 'wikidata_entry_present', 'boolean', false),
  ('brand_entity_scores', 'wikidata_entry_url', 'text', false),
  ('brand_entity_scores', 'score_of_10', 'numeric(5,2)', false),
  ('brand_entity_scores', 'checked_at', 'timestamp with time zone', true),
  ('brand_web_mentions', 'id', 'uuid', true),
  ('brand_web_mentions', 'brand_id', 'uuid', true),
  ('brand_web_mentions', 'organization_id', 'uuid', true),
  ('brand_web_mentions', 'market_code', 'text', true),
  ('brand_web_mentions', 'source_platform', 'text', true),
  ('brand_web_mentions', 'source_url', 'text', true),
  ('brand_web_mentions', 'subreddit', 'text', false),
  ('brand_web_mentions', 'mention_text', 'text', false),
  ('brand_web_mentions', 'mention_sentiment', 'text', false),
  ('brand_web_mentions', 'upvotes', 'integer', false),
  ('brand_web_mentions', 'is_top_comment', 'boolean', false),
  ('brand_web_mentions', 'thread_recency_days', 'integer', false),
  ('brand_web_mentions', 'is_indexed_by_google', 'boolean', false),
  ('brand_web_mentions', 'engine_citation_seen', 'text', false),
  ('brand_web_mentions', 'vertical_match', 'boolean', false),
  ('brand_web_mentions', 'detected_at', 'timestamp with time zone', true),
  ('brands', 'id', 'uuid', true),
  ('brands', 'organization_id', 'uuid', true),
  ('brands', 'name', 'text', true),
  ('brands', 'domain', 'text', true),
  ('brands', 'vertical', 'vertical', true),
  ('brands', 'region', 'region', true),
  ('brands', 'competitors', 'text[]', true),
  ('brands', 'primary_regions', 'text[]', true),
  ('brands', 'abn', 'text', false),
  ('brands', 'client_tag', 'text', false),
  ('brands', 'youtube_channel_url', 'text', false),
  ('brands', 'created_at', 'timestamp with time zone', true),
  ('brands', 'updated_at', 'timestamp with time zone', true),
  ('brands', 'deleted_at', 'timestamp with time zone', false),
  ('brands', 'classification', 'jsonb', false),
  ('brands', 'classification_status', 'text', true),
  ('brands', 'classification_at', 'timestamp with time zone', false),
  ('brands', 'prompt_pack', 'jsonb', false),
  ('brands', 'prompt_pack_version', 'integer', false),
  ('brands', 'brand_token', 'text', false),
  ('bulk_operations', 'id', 'uuid', true),
  ('bulk_operations', 'organization_id', 'uuid', true),
  ('bulk_operations', 'operation_type', 'text', true),
  ('bulk_operations', 'status', 'text', true),
  ('bulk_operations', 'total_brands', 'integer', true),
  ('bulk_operations', 'completed_brands', 'integer', true),
  ('bulk_operations', 'failed_brands', 'integer', true),
  ('bulk_operations', 'input_params', 'jsonb', true),
  ('bulk_operations', 'output_url', 'text', false),
  ('bulk_operations', 'error_message', 'text', false),
  ('bulk_operations', 'started_at', 'timestamp with time zone', false),
  ('bulk_operations', 'completed_at', 'timestamp with time zone', false),
  ('bulk_operations', 'created_at', 'timestamp with time zone', true),
  ('bulk_operations', 'updated_at', 'timestamp with time zone', true),
  ('canary_prompts', 'id', 'uuid', true),
  ('canary_prompts', 'prompt_text', 'text', true),
  ('canary_prompts', 'engine', 'text', true),
  ('canary_prompts', 'model', 'text', true),
  ('canary_prompts', 'last_response_hash', 'text', true),
  ('canary_prompts', 'last_response_summary', 'text', false),
  ('canary_prompts', 'drift_detected', 'text', true),
  ('canary_prompts', 'last_checked_at', 'timestamp with time zone', true),
  ('canary_prompts', 'drift_first_seen_at', 'timestamp with time zone', false),
  ('citability_methods', 'id', 'uuid', true),
  ('citability_methods', 'method_key', 'text', true),
  ('citability_methods', 'title', 'text', true),
  ('citability_methods', 'description', 'text', true),
  ('citability_methods', 'source', 'text', true),
  ('citability_methods', 'effect_size_pct', 'numeric(5,2)', false),
  ('citability_methods', 'effect_size_notes', 'text', false),
  ('citability_methods', 'applies_to', 'jsonb', true),
  ('citability_methods', 'citation_url', 'text', false),
  ('citability_methods', 'source_type', 'text', false),
  ('citability_methods', 'impact_tier', 'text', false),
  ('citation_source_intelligence', 'id', 'uuid', true),
  ('citation_source_intelligence', 'brand_id', 'uuid', true),
  ('citation_source_intelligence', 'organization_id', 'uuid', true),
  ('citation_source_intelligence', 'audit_id', 'uuid', false),
  ('citation_source_intelligence', 'engine', 'text', true),
  ('citation_source_intelligence', 'source_type', 'text', true),
  ('citation_source_intelligence', 'citation_count', 'integer', true),
  ('citation_source_intelligence', 'citation_share', 'numeric(5,2)', false),
  ('citation_source_intelligence', 'brand_present_in_source', 'boolean', true),
  ('citation_source_intelligence', 'gap_severity', 'text', true),
  ('citation_source_intelligence', 'market_benchmark', 'jsonb', false),
  ('citation_source_intelligence', 'source_affinity_note', 'text', false),
  ('citation_source_intelligence', 'top_domains', 'jsonb', false),
  ('citation_source_intelligence', 'calculated_at', 'timestamp with time zone', true),
  ('citation_source_intelligence', 'updated_at', 'timestamp with time zone', true),
  ('citations', 'id', 'uuid', true),
  ('citations', 'audit_id', 'uuid', true),
  ('citations', 'engine', 'text', true),
  ('citations', 'prompt', 'text', true),
  ('citations', 'run_number', 'integer', true),
  ('citations', 'brand_mentioned', 'boolean', true),
  ('citations', 'is_branded_prompt', 'boolean', false),
  ('citations', 'position', 'integer', false),
  ('citations', 'sentiment_label', 'text', false),
  ('citations', 'sentiment_score', 'numeric(5,4)', false),
  ('citations', 'context_label', 'text', false),
  ('citations', 'response_snippet', 'text', false),
  -- Task #46 Phase 3, Part B. Nullable, no default -- prod-fix 0057.
  ('citations', 'response_text', 'text', false),
  ('citations', 'context_snippets', 'jsonb', true),
  ('citations', 'cited_sources', 'jsonb', true),
  ('citations', 'llm_cost_usd', 'numeric(10,6)', false),
  ('citations', 'llm_tokens_used', 'integer', false),
  ('citations', 'llm_model', 'text', false),
  ('citations', 'cited_source_type', 'text', false),
  ('citations', 'cited_source_engine_affinity', 'text', false),
  ('citations', 'is_accurate', 'boolean', false),
  ('citations', 'hallucination_flags', 'jsonb', false),
  -- Task #46 Phase 2, Part C. NOT NULL, default false -- prod-fix 0056
  -- (already applied by Sri 17 Oct).
  ('citations', 'is_cache_hit', 'boolean', true),
  ('citations', 'created_at', 'timestamp with time zone', true),
  ('client_portal_invites', 'id', 'uuid', true),
  ('client_portal_invites', 'organization_id', 'uuid', true),
  ('client_portal_invites', 'brand_id', 'uuid', true),
  ('client_portal_invites', 'invite_token', 'text', true),
  ('client_portal_invites', 'invitee_name', 'text', false),
  ('client_portal_invites', 'invitee_email', 'text', false),
  ('client_portal_invites', 'status', 'text', true),
  ('client_portal_invites', 'expires_at', 'timestamp with time zone', false),
  ('client_portal_invites', 'is_revoked', 'boolean', true),
  ('client_portal_invites', 'revoked_at', 'timestamp with time zone', false),
  ('client_portal_invites', 'created_at', 'timestamp with time zone', true),
  ('client_portal_views', 'id', 'uuid', true),
  ('client_portal_views', 'invite_id', 'uuid', true),
  ('client_portal_views', 'organization_id', 'uuid', true),
  ('client_portal_views', 'brand_id', 'uuid', true),
  ('client_portal_views', 'viewed_at', 'timestamp with time zone', true),
  ('client_portal_views', 'ip_hash', 'text', false),
  ('client_portal_views', 'user_agent', 'text', false),
  ('client_portal_views', 'page_viewed', 'text', true),
  ('comparison_prompt_results', 'id', 'uuid', true),
  ('comparison_prompt_results', 'brand_id', 'uuid', true),
  ('comparison_prompt_results', 'organization_id', 'uuid', true),
  ('comparison_prompt_results', 'audit_id', 'uuid', false),
  ('comparison_prompt_results', 'competitor_domain', 'text', true),
  ('comparison_prompt_results', 'prompt', 'text', true),
  ('comparison_prompt_results', 'engine', 'text', true),
  ('comparison_prompt_results', 'brand_won', 'boolean', false),
  ('comparison_prompt_results', 'brand_mentioned', 'boolean', true),
  ('comparison_prompt_results', 'competitor_mentioned', 'boolean', true),
  ('comparison_prompt_results', 'verdict_snippet', 'text', false),
  ('comparison_prompt_results', 'run_at', 'timestamp with time zone', true),
  ('config_bundle_cache', 'id', 'uuid', true),
  ('config_bundle_cache', 'market_code', 'text', true),
  ('config_bundle_cache', 'locale', 'text', true),
  ('config_bundle_cache', 'segment', 'text', true),
  ('config_bundle_cache', 'bundle_version', 'integer', true),
  ('config_bundle_cache', 'config_digest', 'text', true),
  ('config_bundle_cache', 'resolved_config', 'jsonb', true),
  ('config_bundle_cache', 'is_active', 'boolean', true),
  ('config_bundle_cache', 'created_at', 'timestamp with time zone', true),
  ('content_drafts', 'id', 'uuid', true),
  ('content_drafts', 'organization_id', 'uuid', true),
  ('content_drafts', 'brand_id', 'uuid', true),
  ('content_drafts', 'task_id', 'uuid', false),
  ('content_drafts', 'draft_type', 'text', true),
  ('content_drafts', 'content_format', 'text', true),
  ('content_drafts', 'format_recommendation_reason', 'text', false),
  ('content_drafts', 'title', 'text', true),
  ('content_drafts', 'body', 'text', true),
  ('content_drafts', 'target_sub_query', 'text', false),
  ('content_drafts', 'target_word_count', 'integer', false),
  ('content_drafts', 'word_count', 'integer', false),
  ('content_drafts', 'target_url', 'text', false),
  ('content_drafts', 'status', 'text', true),
  ('content_drafts', 'approved_at', 'timestamp with time zone', false),
  ('content_drafts', 'approved_by', 'uuid', false),
  ('content_drafts', 'published_at', 'timestamp with time zone', false),
  ('content_drafts', 'created_at', 'timestamp with time zone', true),
  ('content_drafts', 'updated_at', 'timestamp with time zone', true),
  ('content_structure_audits', 'id', 'uuid', true),
  ('content_structure_audits', 'brand_id', 'uuid', true),
  ('content_structure_audits', 'organization_id', 'uuid', true),
  ('content_structure_audits', 'page_url', 'text', true),
  ('content_structure_audits', 'answer_capsule_score', 'integer', false),
  ('content_structure_audits', 'faq_block_present', 'boolean', false),
  ('content_structure_audits', 'faq_schema_present', 'boolean', false),
  ('content_structure_audits', 'heading_structure', 'jsonb', false),
  ('content_structure_audits', 'capsule_gaps', 'jsonb', false),
  ('content_structure_audits', 'word_count', 'integer', false),
  ('content_structure_audits', 'optimal_passage_count', 'integer', false),
  ('content_structure_audits', 'last_modified', 'text', false),
  ('content_structure_audits', 'days_since_published', 'integer', false),
  ('content_structure_audits', 'freshness_risk', 'text', false),
  ('content_structure_audits', 'content_format_detected', 'text', false),
  ('content_structure_audits', 'citation_probability_score', 'numeric(4,3)', false),
  ('content_structure_audits', 'is_entity_home_candidate', 'boolean', false),
  ('content_structure_audits', 'entity_home_has_org_schema', 'boolean', false),
  ('content_structure_audits', 'entity_home_has_id_field', 'boolean', false),
  ('content_structure_audits', 'entity_home_same_as_count', 'integer', false),
  ('content_structure_audits', 'entity_home_page_url', 'text', false),
  ('content_structure_audits', 'outbound_citation_count', 'integer', false),
  ('content_structure_audits', 'has_author_attribution', 'boolean', false),
  ('content_structure_audits', 'audited_at', 'timestamp with time zone', true),
  ('conversation_journeys', 'id', 'uuid', true),
  ('conversation_journeys', 'brand_id', 'uuid', true),
  ('conversation_journeys', 'organization_id', 'uuid', true),
  ('conversation_journeys', 'journey_name', 'text', true),
  ('conversation_journeys', 'vertical', 'text', true),
  ('conversation_journeys', 'buyer_stage', 'text', true),
  ('conversation_journeys', 'prompt_sequence', 'jsonb', true),
  ('conversation_journeys', 'is_active', 'boolean', true),
  ('conversation_journeys', 'created_at', 'timestamp with time zone', true),
  ('conversation_journeys', 'updated_at', 'timestamp with time zone', true),
  ('crawler_visit_logs', 'id', 'uuid', true),
  ('crawler_visit_logs', 'brand_id', 'uuid', true),
  ('crawler_visit_logs', 'organization_id', 'uuid', true),
  ('crawler_visit_logs', 'crawler_name', 'text', true),
  ('crawler_visit_logs', 'crawler_tier', 'text', true),
  ('crawler_visit_logs', 'visited_url', 'text', true),
  ('crawler_visit_logs', 'status_code', 'integer', false),
  ('crawler_visit_logs', 'response_time_ms', 'integer', false),
  ('crawler_visit_logs', 'error_type', 'text', false),
  ('crawler_visit_logs', 'raw_log_line', 'text', false),
  ('crawler_visit_logs', 'is_active_agent', 'boolean', true),
  ('crawler_visit_logs', 'referrer_ai_session', 'text', false),
  ('crawler_visit_logs', 'visit_purpose', 'text', false),
  ('crawler_visit_logs', 'visited_at', 'timestamp with time zone', true),
  ('crawler_visit_logs', 'created_at', 'timestamp with time zone', true),
  ('crawler_visit_logs', 'source_ip', 'inet', false),
  ('crawler_visit_logs', 'verification_status', 'text', false),
  ('crawler_visit_logs', 'verified_via', 'text', false),
  ('crawler_visit_logs', 'bytes', 'bigint', false),
  ('crawler_visit_logs', 'ingest_source', 'text', true),
  ('data_residency_log', 'id', 'uuid', true),
  ('data_residency_log', 'organization_id', 'uuid', true),
  ('data_residency_log', 'data_type', 'text', true),
  ('data_residency_log', 'storage_region', 'text', true),
  ('data_residency_log', 'provider', 'text', true),
  ('data_residency_log', 'retention_period', 'text', true),
  ('data_residency_log', 'encryption_status', 'text', true),
  ('data_residency_log', 'recorded_at', 'timestamp with time zone', true),
  ('drift_alerts', 'id', 'uuid', true),
  ('drift_alerts', 'organization_id', 'uuid', true),
  ('drift_alerts', 'brand_id', 'uuid', true),
  ('drift_alerts', 'current_audit_id', 'uuid', true),
  ('drift_alerts', 'previous_audit_id', 'uuid', true),
  ('drift_alerts', 'severity', 'text', true),
  ('drift_alerts', 'score_delta', 'numeric(6,2)', false),
  ('drift_alerts', 'dimension_deltas', 'jsonb', true),
  ('drift_alerts', 'acknowledged', 'boolean', true),
  ('drift_alerts', 'acknowledged_at', 'timestamp with time zone', false),
  ('drift_alerts', 'updated_at', 'timestamp with time zone', true),
  ('drift_alerts', 'created_at', 'timestamp with time zone', true),
  ('evidence_snapshots', 'id', 'uuid', true),
  ('evidence_snapshots', 'brand_id', 'uuid', true),
  ('evidence_snapshots', 'organization_id', 'uuid', true),
  ('evidence_snapshots', 'audit_id', 'uuid', false),
  ('evidence_snapshots', 'engine', 'text', true),
  ('evidence_snapshots', 'prompt', 'text', true),
  ('evidence_snapshots', 'raw_response', 'text', true),
  ('evidence_snapshots', 'score_at_capture', 'numeric(5,2)', false),
  ('evidence_snapshots', 'captured_at', 'timestamp with time zone', true),
  ('generated_reports', 'id', 'uuid', true),
  ('generated_reports', 'brand_id', 'uuid', true),
  ('generated_reports', 'organization_id', 'uuid', true),
  ('generated_reports', 'audit_id', 'uuid', false),
  ('generated_reports', 'template_id', 'uuid', false),
  ('generated_reports', 'report_type', 'text', true),
  ('generated_reports', 'period_label', 'text', false),
  ('generated_reports', 'narrative_text', 'text', true),
  ('generated_reports', 'headline', 'text', true),
  ('generated_reports', 'key_wins', 'jsonb', false),
  ('generated_reports', 'key_gaps', 'jsonb', false),
  ('generated_reports', 'fan_out_summary', 'jsonb', false),
  ('generated_reports', 'topical_summary', 'jsonb', false),
  ('generated_reports', 'mention_source_summary', 'jsonb', false),
  ('generated_reports', 'linkedin_summary', 'jsonb', false),
  ('generated_reports', 'consensus_summary', 'jsonb', false),
  ('generated_reports', 'entity_home_summary', 'jsonb', false),
  ('generated_reports', 'knowledge_panel_summary', 'jsonb', false),
  ('generated_reports', 'confidence_notes', 'jsonb', false),
  ('generated_reports', 'pdf_url', 'text', false),
  ('generated_reports', 'email_sent_at', 'timestamp with time zone', false),
  ('generated_reports', 'created_at', 'timestamp with time zone', true),
  ('generated_reports', 'updated_at', 'timestamp with time zone', true),
  ('google_ai_mode_results', 'id', 'uuid', true),
  ('google_ai_mode_results', 'audit_id', 'uuid', false),
  ('google_ai_mode_results', 'brand_id', 'uuid', true),
  ('google_ai_mode_results', 'organization_id', 'uuid', true),
  ('google_ai_mode_results', 'prompt', 'text', true),
  ('google_ai_mode_results', 'brand_appeared', 'boolean', true),
  ('google_ai_mode_results', 'brand_position', 'integer', false),
  ('google_ai_mode_results', 'sub_queries_shown', 'jsonb', false),
  ('google_ai_mode_results', 'raw_response', 'text', false),
  ('google_ai_mode_results', 'run_at', 'timestamp with time zone', true),
  ('hallucination_incidents', 'id', 'uuid', true),
  ('hallucination_incidents', 'brand_id', 'uuid', true),
  ('hallucination_incidents', 'organization_id', 'uuid', true),
  ('hallucination_incidents', 'citation_id', 'uuid', false),
  ('hallucination_incidents', 'engine', 'text', true),
  ('hallucination_incidents', 'prompt', 'text', true),
  ('hallucination_incidents', 'incorrect_claim', 'text', true),
  ('hallucination_incidents', 'correct_value', 'text', false),
  ('hallucination_incidents', 'claim_type', 'text', true),
  ('hallucination_incidents', 'severity', 'text', true),
  ('hallucination_incidents', 'is_acknowledged', 'boolean', true),
  ('hallucination_incidents', 'acknowledged_at', 'timestamp with time zone', false),
  ('hallucination_incidents', 'acknowledged_by', 'uuid', false),
  ('hallucination_incidents', 'is_false_positive', 'boolean', true),
  ('hallucination_incidents', 'created_at', 'timestamp with time zone', true),
  ('hallucination_incidents', 'updated_at', 'timestamp with time zone', true),
  ('journey_run_results', 'id', 'uuid', true),
  ('journey_run_results', 'journey_id', 'uuid', true),
  ('journey_run_results', 'brand_id', 'uuid', true),
  ('journey_run_results', 'organization_id', 'uuid', true),
  ('journey_run_results', 'engine', 'text', true),
  ('journey_run_results', 'run_at', 'timestamp with time zone', true),
  ('journey_run_results', 'turn_results', 'jsonb', true),
  ('journey_run_results', 'brand_appeared_in_n_turns', 'integer', true),
  ('journey_run_results', 'total_turns', 'integer', true),
  ('journey_run_results', 'journey_score', 'numeric(5,2)', false),
  ('journey_run_results', 'first_mention_turn', 'integer', false),
  ('linkedin_presence_audits', 'id', 'uuid', true),
  ('linkedin_presence_audits', 'brand_id', 'uuid', true),
  ('linkedin_presence_audits', 'organization_id', 'uuid', true),
  ('linkedin_presence_audits', 'market_code', 'text', true),
  ('linkedin_presence_audits', 'company_page_url', 'text', false),
  ('linkedin_presence_audits', 'company_page_exists', 'boolean', false),
  ('linkedin_presence_audits', 'company_page_followers', 'integer', false),
  ('linkedin_presence_audits', 'company_page_last_post_date', 'timestamp without time zone', false),
  ('linkedin_presence_audits', 'company_posts_30d', 'integer', false),
  ('linkedin_presence_audits', 'company_articles_count', 'integer', false),
  ('linkedin_presence_audits', 'founder_profile_url', 'text', false),
  ('linkedin_presence_audits', 'founder_profile_exists', 'boolean', false),
  ('linkedin_presence_audits', 'founder_followers', 'integer', false),
  ('linkedin_presence_audits', 'founder_posts_30d', 'integer', false),
  ('linkedin_presence_audits', 'founder_articles_count', 'integer', false),
  ('linkedin_presence_audits', 'founder_articles_500plus', 'integer', false),
  ('linkedin_presence_audits', 'knowledge_sharing_ratio', 'numeric(4,3)', false),
  ('linkedin_presence_audits', 'original_content_ratio', 'numeric(4,3)', false),
  ('linkedin_presence_audits', 'semantic_relevance_score', 'numeric(4,3)', false),
  ('linkedin_presence_audits', 'presence_score', 'integer', false),
  ('linkedin_presence_audits', 'gaps', 'jsonb', false),
  ('linkedin_presence_audits', 'audited_at', 'timestamp with time zone', true),
  ('llm_response_cache', 'id', 'uuid', true),
  ('llm_response_cache', 'cache_key', 'text', true),
  ('llm_response_cache', 'prompt', 'text', true),
  ('llm_response_cache', 'model', 'text', true),
  ('llm_response_cache', 'response', 'text', true),
  ('llm_response_cache', 'tokens_used', 'integer', true),
  ('llm_response_cache', 'cost_estimate_usd', 'numeric(10,6)', true),
  ('llm_response_cache', 'hit_count', 'integer', true),
  ('llm_response_cache', 'cited_urls', 'jsonb', false),
  ('llm_response_cache', 'created_at', 'timestamp with time zone', true),
  ('llm_response_cache', 'expires_at', 'timestamp with time zone', true),
  ('llmstxt_versions', 'id', 'uuid', true),
  ('llmstxt_versions', 'brand_id', 'uuid', true),
  ('llmstxt_versions', 'organization_id', 'uuid', true),
  ('llmstxt_versions', 'content', 'text', true),
  ('llmstxt_versions', 'depth_score', 'integer', true),
  ('llmstxt_versions', 'hosted_url', 'text', false),
  ('llmstxt_versions', 'is_current', 'boolean', true),
  ('llmstxt_versions', 'generated_at', 'timestamp with time zone', true),
  ('market_ai_budget_policies', 'id', 'uuid', true),
  ('market_ai_budget_policies', 'market_code', 'text', true),
  ('market_ai_budget_policies', 'segment', 'text', true),
  ('market_ai_budget_policies', 'use_case', 'text', true),
  ('market_ai_budget_policies', 'max_prompts_per_audit', 'integer', true),
  ('market_ai_budget_policies', 'max_models_per_audit', 'integer', true),
  ('market_ai_budget_policies', 'max_repeated_samples', 'integer', true),
  ('market_ai_budget_policies', 'max_estimated_cost_cents', 'integer', true),
  ('market_ai_budget_policies', 'max_fan_out_sub_queries', 'integer', true),
  ('market_ai_budget_policies', 'hard_stop_on_budget', 'boolean', true),
  ('market_ai_budget_policies', 'created_at', 'timestamp with time zone', true),
  ('metric_quality_gates', 'id', 'uuid', true),
  ('metric_quality_gates', 'metric_key', 'text', true),
  ('metric_quality_gates', 'market_code', 'text', true),
  ('metric_quality_gates', 'minimum_samples', 'integer', true),
  ('metric_quality_gates', 'minimum_provider_count', 'integer', true),
  ('metric_quality_gates', 'insufficient_data_label', 'text', true),
  ('metric_quality_gates', 'created_at', 'timestamp with time zone', true),
  ('notification_preferences', 'id', 'uuid', true),
  ('notification_preferences', 'organization_id', 'uuid', true),
  ('notification_preferences', 'weekly_digest', 'boolean', true),
  ('notification_preferences', 'digest_email', 'text', true),
  ('notification_preferences', 'email_on_drift', 'boolean', true),
  ('notification_preferences', 'email_on_audit_complete', 'boolean', true),
  ('notification_preferences', 'email_on_schedule_failure', 'boolean', true),
  ('notification_preferences', 'email_on_hallucination', 'boolean', false),
  ('notification_preferences', 'email_on_consensus', 'boolean', false),
  ('notification_preferences', 'email_on_volatility', 'boolean', false),
  ('notification_preferences', 'updated_at', 'timestamp with time zone', true),
  ('notification_preferences', 'created_at', 'timestamp with time zone', true),
  ('org_feature_flags', 'id', 'uuid', true),
  ('org_feature_flags', 'organization_id', 'uuid', true),
  ('org_feature_flags', 'flag_key', 'text', true),
  ('org_feature_flags', 'is_enabled', 'boolean', true),
  ('org_feature_flags', 'reason', 'text', false),
  ('org_feature_flags', 'set_by', 'text', false),
  ('org_feature_flags', 'expires_at', 'timestamp with time zone', false),
  ('org_feature_flags', 'created_at', 'timestamp with time zone', true),
  ('org_feature_flags', 'updated_at', 'timestamp with time zone', true),
  ('org_members', 'id', 'uuid', true),
  ('org_members', 'organization_id', 'uuid', true),
  ('org_members', 'user_id', 'uuid', true),
  ('org_members', 'role', 'text', true),
  ('org_members', 'brand_access', 'jsonb', false),
  ('org_members', 'invited_by', 'uuid', false),
  ('org_members', 'invited_at', 'timestamp with time zone', false),
  ('org_members', 'expires_at', 'timestamp with time zone', true),
  ('org_members', 'accepted_at', 'timestamp with time zone', false),
  ('org_members', 'invitation_token', 'text', false),
  ('org_members', 'is_active', 'boolean', true),
  ('org_members', 'updated_at', 'timestamp with time zone', true),
  ('organizations', 'id', 'uuid', true),
  ('organizations', 'clerk_org_id', 'text', true),
  ('organizations', 'name', 'text', true),
  ('organizations', 'slug', 'text', false),
  ('organizations', 'region', 'region', true),
  ('organizations', 'tier', 'tier', true),
  ('organizations', 'stripe_customer_id', 'text', false),
  ('organizations', 'stripe_subscription_id', 'text', false),
  ('organizations', 'subscription_cancelled_at', 'timestamp with time zone', false),
  ('organizations', 'onboarding_complete', 'boolean', true),
  ('organizations', 'ga4_measurement_id', 'text', false),
  ('organizations', 'ga4_api_secret', 'text', false),
  ('organizations', 'metadata', 'jsonb', true),
  ('organizations', 'created_at', 'timestamp with time zone', true),
  ('organizations', 'updated_at', 'timestamp with time zone', true),
  ('organizations', 'deleted_at', 'timestamp with time zone', false),
  ('processed_webhook_events', 'id', 'uuid', true),
  ('processed_webhook_events', 'stripe_event_id', 'text', true),
  ('processed_webhook_events', 'type', 'text', true),
  ('processed_webhook_events', 'processed_at', 'timestamp with time zone', true),
  ('prompt_pack_coverage', 'id', 'uuid', true),
  ('prompt_pack_coverage', 'market_code', 'text', true),
  ('prompt_pack_coverage', 'locale', 'text', true),
  ('prompt_pack_coverage', 'segment', 'text', true),
  ('prompt_pack_coverage', 'use_case', 'text', true),
  ('prompt_pack_coverage', 'required_template_keys', 'jsonb', true),
  ('prompt_pack_coverage', 'available_template_keys', 'jsonb', true),
  ('prompt_pack_coverage', 'coverage_ratio', 'numeric(5,2)', true),
  ('prompt_pack_coverage', 'coverage_status', 'text', true),
  ('prompt_pack_coverage', 'last_validated_at', 'timestamp with time zone', true),
  ('prompt_volume_estimates', 'id', 'uuid', true),
  ('prompt_volume_estimates', 'market_code', 'text', true),
  ('prompt_volume_estimates', 'vertical', 'text', true),
  ('prompt_volume_estimates', 'topic', 'text', true),
  ('prompt_volume_estimates', 'category', 'text', true),
  ('prompt_volume_estimates', 'estimated_monthly_volume', 'integer', false),
  ('prompt_volume_estimates', 'volume_trend', 'text', false),
  ('prompt_volume_estimates', 'confidence', 'text', true),
  ('prompt_volume_estimates', 'data_source', 'text', true),
  ('prompt_volume_estimates', 'period_start', 'date', true),
  ('prompt_volume_estimates', 'period_end', 'date', true),
  ('prompt_volume_estimates', 'created_at', 'timestamp with time zone', true),
  ('provider_market_capabilities', 'id', 'uuid', true),
  ('provider_market_capabilities', 'provider_key', 'text', true),
  ('provider_market_capabilities', 'model_key', 'text', true),
  ('provider_market_capabilities', 'market_code', 'text', true),
  ('provider_market_capabilities', 'locale', 'text', true),
  ('provider_market_capabilities', 'supports_web_retrieval', 'boolean', true),
  ('provider_market_capabilities', 'supports_citations', 'boolean', true),
  ('provider_market_capabilities', 'supports_location_context', 'boolean', true),
  ('provider_market_capabilities', 'supports_query_fan_out', 'boolean', true),
  ('provider_market_capabilities', 'max_fan_out_sub_queries', 'integer', true),
  ('provider_market_capabilities', 'max_context_tokens', 'integer', false),
  ('provider_market_capabilities', 'average_latency_ms', 'integer', false),
  ('provider_market_capabilities', 'estimated_cost_per_1k_cents', 'numeric(8,4)', false),
  ('provider_market_capabilities', 'is_enabled', 'boolean', true),
  ('provider_market_capabilities', 'created_at', 'timestamp with time zone', true),
  ('query_fan_out_results', 'id', 'uuid', true),
  ('query_fan_out_results', 'audit_id', 'uuid', false),
  ('query_fan_out_results', 'brand_id', 'uuid', true),
  ('query_fan_out_results', 'organization_id', 'uuid', true),
  ('query_fan_out_results', 'original_prompt', 'text', true),
  ('query_fan_out_results', 'original_prompt_id', 'uuid', false),
  ('query_fan_out_results', 'engine', 'text', true),
  ('query_fan_out_results', 'sub_query', 'text', true),
  ('query_fan_out_results', 'sub_query_rank', 'integer', true),
  ('query_fan_out_results', 'brand_appeared', 'boolean', true),
  ('query_fan_out_results', 'brand_position', 'integer', false),
  ('query_fan_out_results', 'content_similarity_score', 'numeric(4,3)', false),
  ('query_fan_out_results', 'above_threshold', 'boolean', false),
  ('query_fan_out_results', 'run_at', 'timestamp with time zone', true),
  ('recommendation_research', 'id', 'uuid', true),
  ('recommendation_research', 'recommendation_key', 'text', true),
  ('recommendation_research', 'source', 'text', true),
  ('recommendation_research', 'url', 'text', false),
  ('recommendation_research', 'summary', 'text', true),
  ('recommendation_research', 'confidence_level', 'text', true),
  ('recommendation_research', 'cited_at', 'timestamp with time zone', false),
  ('recommendation_research', 'retrieved_at', 'timestamp with time zone', true),
  ('remediation_tasks', 'id', 'uuid', true),
  ('remediation_tasks', 'organization_id', 'uuid', true),
  ('remediation_tasks', 'brand_id', 'uuid', true),
  ('remediation_tasks', 'audit_id', 'uuid', false),
  ('remediation_tasks', 'recommendation_id', 'uuid', false),
  ('remediation_tasks', 'recommendation_key', 'text', false),
  ('remediation_tasks', 'title', 'text', true),
  ('remediation_tasks', 'description', 'text', false),
  ('remediation_tasks', 'dimension', 'text', false),
  ('remediation_tasks', 'status', 'text', true),
  ('remediation_tasks', 'priority', 'integer', true),
  ('remediation_tasks', 'effort', 'text', false),
  ('remediation_tasks', 'confidence_label', 'text', false),
  ('remediation_tasks', 'assigned_to', 'uuid', false),
  ('remediation_tasks', 'approved_by', 'uuid', false),
  ('remediation_tasks', 'due_date', 'timestamp with time zone', false),
  ('remediation_tasks', 'completed_at', 'timestamp with time zone', false),
  ('remediation_tasks', 'wont_fix_reason', 'text', false),
  ('remediation_tasks', 'score_before', 'numeric(5,2)', false),
  ('remediation_tasks', 'score_after', 'numeric(5,2)', false),
  ('remediation_tasks', 'fan_out_before', 'numeric(5,2)', false),
  ('remediation_tasks', 'fan_out_after', 'numeric(5,2)', false),
  ('remediation_tasks', 'similarity_before', 'numeric(4,3)', false),
  ('remediation_tasks', 'similarity_after', 'numeric(4,3)', false),
  ('remediation_tasks', 'reaudit_id', 'uuid', false),
  ('remediation_tasks', 'reaudit_deferred_reason', 'text', false),
  ('remediation_tasks', 'fan_out_gap_id', 'uuid', false),
  ('remediation_tasks', 'topical_gap_id', 'uuid', false),
  ('remediation_tasks', 'linkedin_gap_source', 'text', false),
  ('remediation_tasks', 'consensus_gap_source', 'text', false),
  ('remediation_tasks', 'lift_achieved', 'numeric(5,2)', false),
  ('remediation_tasks', 'created_at', 'timestamp with time zone', true),
  ('remediation_tasks', 'updated_at', 'timestamp with time zone', true),
  ('report_delivery_schedules', 'id', 'uuid', true),
  ('report_delivery_schedules', 'organization_id', 'uuid', true),
  ('report_delivery_schedules', 'brand_id', 'uuid', false),
  ('report_delivery_schedules', 'template_id', 'uuid', false),
  ('report_delivery_schedules', 'frequency', 'text', true),
  ('report_delivery_schedules', 'day_of_week', 'integer', false),
  ('report_delivery_schedules', 'day_of_month', 'integer', false),
  ('report_delivery_schedules', 'time_of_day', 'text', true),
  ('report_delivery_schedules', 'recipient_emails', 'jsonb', true),
  ('report_delivery_schedules', 'is_active', 'boolean', true),
  ('report_delivery_schedules', 'last_sent_at', 'timestamp with time zone', false),
  ('report_delivery_schedules', 'created_at', 'timestamp with time zone', true),
  ('report_delivery_schedules', 'updated_at', 'timestamp with time zone', true),
  ('report_templates', 'id', 'uuid', true),
  ('report_templates', 'organization_id', 'uuid', true),
  ('report_templates', 'name', 'text', true),
  ('report_templates', 'template_type', 'text', true),
  ('report_templates', 'sections', 'jsonb', true),
  ('report_templates', 'tone', 'text', true),
  ('report_templates', 'is_default', 'boolean', true),
  ('report_templates', 'created_at', 'timestamp with time zone', true),
  ('report_templates', 'updated_at', 'timestamp with time zone', true),
  ('sampling_policies', 'id', 'uuid', true),
  ('sampling_policies', 'market_code', 'text', true),
  ('sampling_policies', 'segment', 'text', true),
  ('sampling_policies', 'use_case', 'text', true),
  ('sampling_policies', 'minimum_prompt_count', 'integer', true),
  ('sampling_policies', 'recommended_prompt_count', 'integer', true),
  ('sampling_policies', 'minimum_repeated_samples', 'integer', true),
  ('sampling_policies', 'confidence_display_threshold', 'numeric(5,2)', true),
  ('sampling_policies', 'created_at', 'timestamp with time zone', true),
  ('share_of_voice_snapshots', 'id', 'uuid', true),
  ('share_of_voice_snapshots', 'brand_id', 'uuid', true),
  ('share_of_voice_snapshots', 'organization_id', 'uuid', true),
  ('share_of_voice_snapshots', 'audit_id', 'uuid', false),
  ('share_of_voice_snapshots', 'competitor_domain', 'text', true),
  ('share_of_voice_snapshots', 'prompt_category', 'text', true),
  ('share_of_voice_snapshots', 'engine', 'text', true),
  ('share_of_voice_snapshots', 'brand_share', 'numeric(5,2)', false),
  ('share_of_voice_snapshots', 'competitor_share', 'numeric(5,2)', false),
  ('share_of_voice_snapshots', 'total_prompts', 'integer', true),
  ('share_of_voice_snapshots', 'sample_quality', 'text', true),
  ('share_of_voice_snapshots', 'brand_mention_count', 'integer', false),
  ('share_of_voice_snapshots', 'competitor_mention_count', 'integer', false),
  ('share_of_voice_snapshots', 'total_mention_count', 'integer', false),
  ('share_of_voice_snapshots', 'calculated_at', 'timestamp with time zone', true),
  ('subscriptions', 'id', 'uuid', true),
  ('subscriptions', 'organization_id', 'uuid', true),
  ('subscriptions', 'stripe_customer_id', 'text', true),
  ('subscriptions', 'stripe_subscription_id', 'text', true),
  ('subscriptions', 'stripe_price_id', 'text', true),
  ('subscriptions', 'tier', 'text', true),
  ('subscriptions', 'billing_interval', 'text', true),
  ('subscriptions', 'status', 'text', true),
  ('subscriptions', 'cancel_at_period_end', 'boolean', true),
  ('subscriptions', 'current_period_start', 'timestamp with time zone', false),
  ('subscriptions', 'current_period_end', 'timestamp with time zone', false),
  ('subscriptions', 'metadata', 'jsonb', true),
  ('subscriptions', 'created_at', 'timestamp with time zone', true),
  ('subscriptions', 'updated_at', 'timestamp with time zone', true),
  ('technical_audits', 'id', 'uuid', true),
  ('technical_audits', 'brand_id', 'uuid', true),
  ('technical_audits', 'organization_id', 'uuid', true),
  ('technical_audits', 'audit_id', 'uuid', false),
  ('technical_audits', 'score_robots', 'numeric(5,2)', false),
  ('technical_audits', 'score_llms_txt', 'numeric(5,2)', false),
  ('technical_audits', 'score_schema', 'numeric(5,2)', false),
  ('technical_audits', 'score_meta', 'numeric(5,2)', false),
  ('technical_audits', 'score_content', 'numeric(5,2)', false),
  ('technical_audits', 'score_brand_entity', 'numeric(5,2)', false),
  ('technical_audits', 'score_signals', 'numeric(5,2)', false),
  ('technical_audits', 'score_ai_discovery', 'numeric(5,2)', false),
  ('technical_audits', 'score_composite', 'numeric(5,2)', false),
  ('technical_audits', 'findings', 'jsonb', true),
  ('technical_audits', 'crawled_at', 'timestamp with time zone', false),
  ('technical_audits', 'created_at', 'timestamp with time zone', true),
  ('technical_audits', 'updated_at', 'timestamp with time zone', true),
  ('topical_coverage_gaps', 'id', 'uuid', true),
  ('topical_coverage_gaps', 'brand_id', 'uuid', true),
  ('topical_coverage_gaps', 'organization_id', 'uuid', true),
  ('topical_coverage_gaps', 'vertical', 'text', true),
  ('topical_coverage_gaps', 'topic_cluster', 'text', true),
  ('topical_coverage_gaps', 'topic_label', 'text', true),
  ('topical_coverage_gaps', 'brand_has_content', 'boolean', true),
  ('topical_coverage_gaps', 'brand_content_depth', 'integer', false),
  ('topical_coverage_gaps', 'brand_passage_count', 'integer', false),
  ('topical_coverage_gaps', 'competitor_coverage', 'jsonb', false),
  ('topical_coverage_gaps', 'estimated_citation_impact', 'numeric(4,2)', false),
  ('topical_coverage_gaps', 'priority_rank', 'integer', false),
  ('topical_coverage_gaps', 'cross_prompt_impact', 'integer', false),
  ('topical_coverage_gaps', 'analyzed_at', 'timestamp with time zone', true),
  ('topical_coverage_gaps', 'updated_at', 'timestamp with time zone', true),
  ('users', 'id', 'uuid', true),
  ('users', 'clerk_user_id', 'text', true),
  ('users', 'organization_id', 'uuid', true),
  ('users', 'email', 'text', true),
  ('users', 'name', 'text', false),
  ('users', 'role', 'text', true),
  ('users', 'created_at', 'timestamp with time zone', true),
  ('users', 'updated_at', 'timestamp with time zone', true),
  ('validation_corpus_results', 'id', 'uuid', true),
  ('validation_corpus_results', 'fixture_name', 'text', true),
  ('validation_corpus_results', 'domain', 'text', true),
  ('validation_corpus_results', 'vertical', 'text', true),
  ('validation_corpus_results', 'region', 'text', true),
  ('validation_corpus_results', 'category', 'text', true),
  ('validation_corpus_results', 'expected_score_min', 'numeric(5,2)', false),
  ('validation_corpus_results', 'expected_score_max', 'numeric(5,2)', false),
  ('validation_corpus_results', 'actual_score', 'numeric(5,2)', false),
  ('validation_corpus_results', 'within_band', 'text', true),
  ('validation_corpus_results', 'spearman_contribution', 'numeric(10,6)', false),
  ('validation_corpus_results', 'run_at', 'timestamp with time zone', true),
  ('vertical_pack_prompts', 'id', 'uuid', true),
  ('vertical_pack_prompts', 'pack_id', 'uuid', true),
  ('vertical_pack_prompts', 'prompt_template', 'text', true),
  ('vertical_pack_prompts', 'rank', 'integer', true),
  ('vertical_pack_prompts', 'category', 'text', false),
  ('vertical_pack_prompts', 'topic', 'text', false),
  ('vertical_pack_prompts', 'expected_mention_type', 'text', false),
  ('vertical_pack_prompts', 'notes', 'text', false),
  ('vertical_pack_prompts', 'persona_tag', 'text', false),
  ('vertical_pack_prompts', 'branded_intent', 'text', false),
  ('vertical_pack_prompts', 'source', 'text', false),
  ('vertical_pack_prompts', 'created_at', 'timestamp with time zone', true),
  ('vertical_packs', 'id', 'uuid', true),
  ('vertical_packs', 'vertical', 'vertical', true),
  ('vertical_packs', 'region', 'region', true),
  ('vertical_packs', 'version', 'text', true),
  ('vertical_packs', 'name', 'text', true),
  ('vertical_packs', 'prompts_count', 'integer', true),
  ('vertical_packs', 'metadata', 'jsonb', true),
  ('vertical_packs', 'published_at', 'timestamp with time zone', true),
  ('vertical_packs', 'retired_at', 'timestamp with time zone', false),
  ('vertical_packs', 'updated_at', 'timestamp with time zone', true),
  ('visibility_trends', 'id', 'uuid', true),
  ('visibility_trends', 'brand_id', 'uuid', true),
  ('visibility_trends', 'organization_id', 'uuid', true),
  ('visibility_trends', 'period_label', 'text', true),
  ('visibility_trends', 'period_type', 'text', true),
  ('visibility_trends', 'score_composite_avg', 'numeric(5,2)', false),
  ('visibility_trends', 'score_frequency_avg', 'numeric(5,2)', false),
  ('visibility_trends', 'score_sentiment_avg', 'numeric(5,2)', false),
  ('visibility_trends', 'score_accuracy_avg', 'numeric(5,2)', false),
  ('visibility_trends', 'score_position_avg', 'numeric(5,2)', false),
  ('visibility_trends', 'score_context_avg', 'numeric(5,2)', false),
  ('visibility_trends', 'audit_count', 'integer', true),
  ('visibility_trends', 'sample_quality', 'text', true),
  ('visibility_trends', 'mention_rate', 'numeric(5,2)', false),
  ('visibility_trends', 'citation_rate', 'numeric(5,2)', false),
  ('visibility_trends', 'mention_source_ratio', 'numeric(5,2)', false),
  ('visibility_trends', 'brand_archetype', 'text', false),
  ('visibility_trends', 'market_competition_label', 'text', false),
  ('visibility_trends', 'citation_volatility_score', 'numeric(5,2)', false),
  ('visibility_trends', 'ai_referral_sessions', 'integer', false),
  ('visibility_trends', 'ai_lead_estimate', 'numeric(8,2)', false),
  ('visibility_trends', 'calculated_at', 'timestamp with time zone', true),
  ('visibility_trends', 'updated_at', 'timestamp with time zone', true),
  ('webhook_deliveries', 'id', 'uuid', true),
  ('webhook_deliveries', 'endpoint_id', 'uuid', true),
  ('webhook_deliveries', 'organization_id', 'uuid', true),
  ('webhook_deliveries', 'event', 'text', true),
  ('webhook_deliveries', 'payload', 'jsonb', true),
  ('webhook_deliveries', 'attempt_number', 'integer', true),
  ('webhook_deliveries', 'response_status', 'integer', false),
  ('webhook_deliveries', 'response_body', 'text', false),
  ('webhook_deliveries', 'delivered_at', 'timestamp with time zone', false),
  ('webhook_deliveries', 'failed_at', 'timestamp with time zone', false),
  ('webhook_deliveries', 'internal_event_id', 'text', false),
  ('webhook_deliveries', 'created_at', 'timestamp with time zone', true),
  ('webhook_endpoints', 'id', 'uuid', true),
  ('webhook_endpoints', 'organization_id', 'uuid', true),
  ('webhook_endpoints', 'url', 'text', true),
  ('webhook_endpoints', 'channel', 'text', true),
  ('webhook_endpoints', 'events', 'text[]', true),
  ('webhook_endpoints', 'signing_secret', 'text', true),
  ('webhook_endpoints', 'is_active', 'boolean', true),
  ('webhook_endpoints', 'last_delivery_at', 'timestamp with time zone', false),
  ('webhook_endpoints', 'last_delivery_status', 'text', false),
  ('webhook_endpoints', 'updated_at', 'timestamp with time zone', true),
  ('webhook_endpoints', 'created_at', 'timestamp with time zone', true),
  ('workflow_runs', 'id', 'uuid', true),
  ('workflow_runs', 'organization_id', 'uuid', true),
  ('workflow_runs', 'brand_id', 'uuid', true),
  ('workflow_runs', 'workflow_type', 'text', true),
  ('workflow_runs', 'status', 'text', true),
  ('workflow_runs', 'scheduled_for', 'timestamp with time zone', true),
  ('workflow_runs', 'started_at', 'timestamp with time zone', false),
  ('workflow_runs', 'completed_at', 'timestamp with time zone', false),
  ('workflow_runs', 'result_summary', 'jsonb', false),
  ('workflow_runs', 'created_at', 'timestamp with time zone', true),
  ('youtube_presence_audits', 'id', 'uuid', true),
  ('youtube_presence_audits', 'brand_id', 'uuid', true),
  ('youtube_presence_audits', 'organization_id', 'uuid', true),
  ('youtube_presence_audits', 'market_code', 'text', true),
  ('youtube_presence_audits', 'channel_url', 'text', false),
  ('youtube_presence_audits', 'channel_id', 'text', false),
  ('youtube_presence_audits', 'channel_title', 'text', false),
  ('youtube_presence_audits', 'last_upload_at', 'timestamp with time zone', false),
  ('youtube_presence_audits', 'match_confidence', 'numeric(4,3)', false),
  ('youtube_presence_audits', 'check_status', 'text', false),
  ('youtube_presence_audits', 'unavailable_reason', 'text', false),
  ('youtube_presence_audits', 'channel_exists', 'boolean', false),
  ('youtube_presence_audits', 'channel_subscriber_count', 'integer', false),
  ('youtube_presence_audits', 'channel_total_videos', 'integer', false),
  ('youtube_presence_audits', 'longform_video_count', 'integer', false),
  ('youtube_presence_audits', 'shorts_count', 'integer', false),
  ('youtube_presence_audits', 'longform_ratio', 'numeric(4,3)', false),
  ('youtube_presence_audits', 'howto_video_count', 'integer', false),
  ('youtube_presence_audits', 'explainer_video_count', 'integer', false),
  ('youtube_presence_audits', 'brand_topic_video_count', 'integer', false),
  ('youtube_presence_audits', 'videos_with_transcript', 'integer', false),
  ('youtube_presence_audits', 'videos_with_chapters', 'integer', false),
  ('youtube_presence_audits', 'avg_chapter_count', 'numeric(4,1)', false),
  ('youtube_presence_audits', 'avg_description_length', 'integer', false),
  ('youtube_presence_audits', 'embedding_pages_count', 'integer', false),
  ('youtube_presence_audits', 'embedding_pages_with_schema', 'integer', false),
  ('youtube_presence_audits', 'embedding_pages_with_transcript', 'integer', false),
  ('youtube_presence_audits', 'any_video_cited_in_audit', 'boolean', false),
  ('youtube_presence_audits', 'cited_video_urls', 'jsonb', false),
  ('youtube_presence_audits', 'presence_score', 'integer', false),
  ('youtube_presence_audits', 'gaps', 'jsonb', false),
  ('youtube_presence_audits', 'audited_at', 'timestamp with time zone', true)
),
live_columns AS (
  -- Task #46 (9th follow-up): pg_catalog's format_type(atttypid, atttypmod)
  -- instead of information_schema.columns.data_type/udt_name -- the latter
  -- collapses every array column to the bare string "ARRAY" with the
  -- element type thrown away (text[] and integer[] both just say "ARRAY"),
  -- which made every array column permanently unmatchable against the
  -- expected side below and forced naming-only differences to look like
  -- real ones. format_type prints exactly what Postgres itself would:
  -- "text[]", "integer[]", "numeric(5,2)", "timestamp without time zone".
  SELECT c.relname AS table_name, a.attname AS column_name,
         format_type(a.atttypid, a.atttypmod) AS live_type,
         CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END AS is_nullable
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  -- relkind = 'r': ordinary tables only. Without this, pg_class in the
  -- public schema also includes every index (relkind 'i') -- each index
  -- has its own pg_attribute rows for its key columns, which showed up
  -- as bogus "extra columns" on a fake "table" named after the index
  -- (e.g. brands_pkey.id) before this filter was added.
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
),
column_diff AS (
  SELECT
    COALESCE(e.table_name, l.table_name) AS table_name,
    COALESCE(e.column_name, l.column_name) AS column_name,
    e.expected_type,
    l.live_type,
    CASE
      WHEN e.column_name IS NULL THEN 'EXTRA'
      WHEN l.column_name IS NULL THEN 'MISSING'
      -- expected_type is already canonicalized to match format_type's own
      -- spelling exactly (see scripts/qa/_tmp-gen-expected-columns.ts /
      -- canonicalPgType() in scripts/qa/schema-drift.ts) -- naming-only
      -- differences (array element type, time-zone short form, precision)
      -- are resolved BEFORE this comparison runs, so an exact mismatch
      -- here means a real type difference, not a formatting one.
      WHEN lower(e.expected_type) <> lower(COALESCE(l.live_type, ''))
        THEN 'MISMATCH'
      ELSE 'OK'
    END AS diff_status
  FROM expected_columns e
  FULL OUTER JOIN live_columns l
    ON e.table_name = l.table_name AND e.column_name = l.column_name
),
source_type_cols AS (
  SELECT table_name, column_name, data_type, udt_name
  FROM information_schema.columns
  WHERE (table_name = 'citation_source_intelligence' AND column_name = 'source_type')
     OR (table_name = 'citations' AND column_name = 'cited_source_type')
),
source_type_checks AS (
  SELECT rel.relname AS table_name, con.conname AS constraint_name,
         pg_get_constraintdef(con.oid) AS constraint_def
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE con.contype = 'c'
    AND rel.relname IN ('citation_source_intelligence', 'citations')
),
source_type_enum AS (
  SELECT t.typname, e.enumlabel
  FROM pg_type t
  JOIN pg_enum e ON e.enumtypid = t.oid
  WHERE t.typname IN (SELECT udt_name FROM source_type_cols)
),
source_type_values AS (
  SELECT source_type, count(*) AS cnt
  FROM citation_source_intelligence
  GROUP BY source_type
),
audits_status AS (
  SELECT status, count(*) AS cnt
  FROM audits
  GROUP BY status
),
citations_audits_indexes AS (
  SELECT tablename, indexname, indexdef
  FROM pg_indexes
  WHERE tablename IN ('citations', 'audits')
),
sentinel_safety AS (
  SELECT
    (SELECT count(*) FROM source_type_cols
       WHERE NOT (data_type IN ('text', 'character varying') OR udt_name IN ('text', 'varchar'))) AS bad_type_count,
    (SELECT count(*) FROM source_type_checks) AS check_count,
    (SELECT count(*) FROM source_type_enum) AS enum_count
),
-- Task #46 (12th follow-up): org-scoped = has organization_id, PLUS the
-- two tables scoped transitively via an FK rather than a direct column
-- (citations -> audit_id -> audits.organization_id; organizations -- the
-- org row itself, scoped by id). See RLS_TRANSITIVE_ORG_TABLES in
-- scripts/qa/schema-drift.ts for the TS-side twin of this list.
org_scoped_tables AS (
  SELECT DISTINCT c.relname AS table_name
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attname = 'organization_id'
    AND a.attnum > 0 AND NOT a.attisdropped
  UNION
  SELECT table_name FROM (VALUES ('citations'), ('organizations')) AS t(table_name)
),
rls_status AS (
  SELECT c.relname AS table_name, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
),
org_policies AS (
  SELECT DISTINCT tablename AS table_name
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (qual LIKE '%app.current_org_id%' OR with_check LIKE '%app.current_org_id%')
),
rls_missing_enable_force AS (
  SELECT ost.table_name
  FROM org_scoped_tables ost
  LEFT JOIN rls_status rs ON rs.table_name = ost.table_name
  WHERE rs.table_name IS NULL OR NOT rs.relrowsecurity OR NOT rs.relforcerowsecurity
),
rls_missing_org_policy AS (
  SELECT ost.table_name
  FROM org_scoped_tables ost
  JOIN rls_status rs ON rs.table_name = ost.table_name AND rs.relrowsecurity AND rs.relforcerowsecurity
  WHERE ost.table_name NOT IN (SELECT table_name FROM org_policies)
),
rls_enabled_no_org_id AS (
  SELECT rs.table_name
  FROM rls_status rs
  WHERE rs.relrowsecurity AND rs.table_name NOT IN (SELECT table_name FROM org_scoped_tables)
),
-- Task #46 (13th follow-up): current_user is whichever role is running
-- THIS query -- in the Neon SQL editor, that's the project owner role
-- (e.g. neondb_owner, a neon_superuser member), never the role Vercel's
-- DATABASE_URL or Inngest's SERVICE_DATABASE_URL actually connect as.
-- The 12th follow-up's check validated locally as visibleau_app (PASS)
-- and as the local superuser (STOP) and concluded it checks current_user
-- -- which is exactly right, and exactly the wrong thing for this
-- purpose: it would report the EDITOR's role, not the APP's, and either
-- false-STOP or (worse) be read as proving something it doesn't. This
-- bundle can only show every login role's own flags, by name, for Sri to
-- cross-reference against what he knows Vercel/Inngest actually use --
-- it cannot determine which one that is. The app's own role is verified
-- app-side instead: a structured db_role_check log line at cold start
-- (lib/db/role-check.ts via instrumentation.ts) and an admin-only route
-- (/api/admin/db-role-check). See docs/ops/post-launch-db-hardening.md
-- section 46 (13th follow-up).
neon_superuser_exists AS (
  SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neon_superuser') AS exists
),
org_table_owners AS (
  SELECT c.relowner::regrole::text AS owner, c.relname AS table_name
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND c.relname IN (SELECT table_name FROM org_scoped_tables)
),
all_login_roles AS (
  SELECT
    r.rolname,
    r.rolsuper,
    r.rolbypassrls,
    CASE WHEN (SELECT exists FROM neon_superuser_exists)
      THEN pg_has_role(r.rolname, 'neon_superuser', 'member')
      ELSE NULL
    END AS is_neon_superuser_member,
    (SELECT string_agg(oto.table_name, ', ' ORDER BY oto.table_name)
     FROM org_table_owners oto WHERE oto.owner = r.rolname) AS owns_org_tables
  FROM pg_roles r
  WHERE r.rolcanlogin = true AND r.rolname NOT LIKE 'pg\_%'
),
-- Task #46 (16th follow-up): 0051's unique constraint, checked by name --
-- migration 0041/0051-apply-prod.sql both create it as
-- ai_bot_ip_ranges_vendor_cidr_unique (a UNIQUE index promoted to a real
-- constraint via "UNIQUE USING INDEX").
ai_bot_ip_ranges_unique_check AS (
  SELECT count(*) AS cnt
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE con.contype = 'u'
    AND rel.relname = 'ai_bot_ip_ranges'
    AND con.conname = 'ai_bot_ip_ranges_vendor_cidr_unique'
),
bundled_checks AS (
  SELECT 1 AS seq,
    '0046: source_type column types (citation_source_intelligence, citations)' AS check_name,
    CASE WHEN count(*) = 2
              AND bool_and(udt_name IN ('text', 'varchar') OR data_type IN ('text', 'character varying'))
         THEN 'PASS' ELSE 'STOP' END AS result,
    COALESCE(string_agg(table_name || '.' || column_name || '=' || data_type || '/' || udt_name, '; '), 'NO ROWS FOUND -- column missing') AS detail
  FROM source_type_cols

  UNION ALL

  SELECT 2, '0046: CHECK constraints on citation_source_intelligence/citations',
    CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'STOP' END,
    COALESCE(string_agg(table_name || '.' || constraint_name || ': ' || constraint_def, '; '), 'none found')
  FROM source_type_checks

  UNION ALL

  SELECT 3, '0046: enum types on source_type columns',
    CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'STOP' END,
    COALESCE(string_agg(typname || '=' || enumlabel, '; '), 'none found')
  FROM source_type_enum

  UNION ALL

  SELECT 4, '0046 info: current citation_source_intelligence.source_type distinct values',
    'INFO',
    COALESCE((SELECT string_agg(source_type || '(' || cnt || ')', ', ' ORDER BY cnt DESC) FROM source_type_values), 'no rows')

  UNION ALL

  SELECT 5, 'Sentinel safety: __no_citations__ insertable into citation_source_intelligence.source_type',
    CASE WHEN (SELECT bad_type_count FROM sentinel_safety) = 0
              AND (SELECT check_count FROM sentinel_safety) = 0
              AND (SELECT enum_count FROM sentinel_safety) = 0
         THEN 'PASS' ELSE 'STOP' END,
    'Derived from the three 0046 rows above -- plain text/varchar, no CHECK, no enum means any string value (including the sentinel) inserts cleanly. No test insert performed.'

  UNION ALL

  SELECT 6, '0047: audits.status literal',
    CASE
      WHEN NOT EXISTS (SELECT 1 FROM audits_status) THEN 'INFO'
      WHEN EXISTS (SELECT 1 FROM audits_status WHERE status ILIKE 'complet%' AND status <> 'complete') THEN 'STOP'
      WHEN NOT EXISTS (SELECT 1 FROM audits_status WHERE status = 'complete') THEN 'STOP'
      ELSE 'PASS'
    END,
    COALESCE((SELECT string_agg(status || '(' || cnt || ')', ', ' ORDER BY cnt DESC) FROM audits_status), 'no audits rows -- nothing to validate against')

  UNION ALL

  SELECT 7, '0047 info: existing indexes on citations/audits',
    'INFO',
    COALESCE((SELECT string_agg(tablename || '.' || indexname || ': ' || indexdef, ' || ') FROM citations_audits_indexes), 'none')

  UNION ALL

  SELECT 8, '0047 info: planned indexes (citations_audit_run_idx, audits_brand_completed_idx) already present?',
    'INFO',
    'citations_audit_run_idx present: ' ||
      (EXISTS (SELECT 1 FROM citations_audits_indexes WHERE indexname = 'citations_audit_run_idx'))::text ||
      '; audits_brand_completed_idx present: ' ||
      (EXISTS (SELECT 1 FROM citations_audits_indexes WHERE indexname = 'audits_brand_completed_idx'))::text ||
      ' -- performance-only, NOT apply-before-push'

  UNION ALL

  SELECT 9, '0048: missing columns (Drizzle schema expects, prod lacks)',
    CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'STOP' END,
    COALESCE(string_agg(table_name || '.' || column_name, ', '), 'none')
  FROM column_diff WHERE diff_status = 'MISSING'

  UNION ALL

  SELECT 10, '0048: type mismatches (same column, different canonical SQL type -- naming-only differences already resolved, see live_columns above)',
    CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'STOP' END,
    COALESCE(string_agg(table_name || '.' || column_name || ' expected=' || expected_type || ' live=' || live_type, ', '), 'none')
  FROM column_diff WHERE diff_status = 'MISMATCH'

  UNION ALL

  SELECT 11, '0048 info: extra columns in prod (not in Drizzle schema)',
    'INFO',
    COALESCE(string_agg(table_name || '.' || column_name, ', '), 'none')
  FROM column_diff WHERE diff_status = 'EXTRA'

  UNION ALL

  SELECT 12, 'RLS: tables missing ENABLE/FORCE row-level security',
    CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'STOP' END,
    COALESCE(string_agg(table_name, ', ' ORDER BY table_name), 'none')
  FROM rls_missing_enable_force

  UNION ALL

  SELECT 13, 'RLS: tables missing a policy referencing app.current_org_id',
    CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'STOP' END,
    COALESCE(string_agg(table_name, ', ' ORDER BY table_name), 'none')
  FROM rls_missing_org_policy

  UNION ALL

  SELECT 14, 'RLS info: tables with RLS enabled but no organization_id column (review)',
    'INFO',
    COALESCE(string_agg(table_name, ', ' ORDER BY table_name), 'none')
  FROM rls_enabled_no_org_id

  UNION ALL

  SELECT 15, 'RLS info: every LOGIN role -- super/bypassrls/neon_superuser-membership flags + which org-scoped tables it owns (cross-reference by the name Vercel''s DATABASE_URL / Inngest''s SERVICE_DATABASE_URL actually use -- never read here; the app''s OWN role is verified app-side, not by this row -- see Part B / db_role_check)',
    'INFO',
    COALESCE(
      string_agg(
        rolname || '(super=' || rolsuper::text ||
        ',bypassrls=' || rolbypassrls::text ||
        ',neon_superuser_member=' || COALESCE(is_neon_superuser_member::text, 'n/a-role-not-in-this-cluster') ||
        ',owns=[' || COALESCE(owns_org_tables, 'none') || ']' ||
        ')',
        '; ' ORDER BY rolname
      ),
      'none'
    )
  FROM all_login_roles

  UNION ALL

  SELECT 16, 'RLS info: the role THIS QUERY itself is running as (current_user) -- this is the editor/session role, NOT the app''s role',
    'INFO',
    'current_user=' || current_user ||
    ' -- proves nothing about what Vercel''s DATABASE_URL or Inngest''s SERVICE_DATABASE_URL actually connect as in prod. ' ||
    'That is verified app-side: a db_role_check log line at cold start, and the /api/admin/db-role-check route (platform-admin only). ' ||
    'Do not read a STOP/PASS into this row -- it is informational only, by design.'

  UNION ALL

  SELECT 17, '0051: ai_bot_ip_ranges (vendor, cidr) unique constraint present',
    CASE WHEN (SELECT cnt FROM ai_bot_ip_ranges_unique_check) = 1 THEN 'PASS' ELSE 'STOP' END,
    'ai_bot_ip_ranges_vendor_cidr_unique found: ' || (SELECT cnt FROM ai_bot_ip_ranges_unique_check)::text ||
    ' (expected 1) -- apply db/prod-fixes/0051-ai-bot-ip-ranges-unique-apply-prod.sql if STOP'

  UNION ALL

  SELECT 18, '0053: org_members.expires_at column present',
    CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'STOP' END,
    COALESCE(string_agg(table_name || '.' || column_name, ', '), 'none') ||
    ' -- apply db/prod-fixes/0053-org-members-invite-expiry-apply-prod.sql if STOP'
  FROM column_diff WHERE diff_status = 'MISSING' AND table_name = 'org_members' AND column_name = 'expires_at'

  UNION ALL

  -- Task #46 Phase 2, Part C / Phase 3, Part D. Already applied by Sri
  -- on 17 Oct via db/prod-fixes/0056-run2-apply.sql -- expected PASS.
  SELECT 19, '0056: citations.is_cache_hit column present (already applied 17 Oct)',
    CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'STOP' END,
    COALESCE(string_agg(table_name || '.' || column_name, ', '), 'none') ||
    ' -- apply db/prod-fixes/0056-run2-apply.sql if STOP (should not be needed)'
  FROM column_diff WHERE diff_status = 'MISSING' AND table_name = 'citations' AND column_name = 'is_cache_hit'

  UNION ALL

  -- Task #46 Phase 3, Part B/D. Apply BEFORE this bundle shows PASS.
  SELECT 20, '0057: citations.response_text column present',
    CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'STOP' END,
    COALESCE(string_agg(table_name || '.' || column_name, ', '), 'none') ||
    ' -- apply db/prod-fixes/0057-run2-apply.sql if STOP'
  FROM column_diff WHERE diff_status = 'MISSING' AND table_name = 'citations' AND column_name = 'response_text'
)

SELECT check_name, result, detail FROM (
  SELECT 0 AS seq, 'OVERALL' AS check_name,
    CASE WHEN EXISTS (SELECT 1 FROM bundled_checks WHERE result = 'STOP') THEN 'STOP' ELSE 'PASS' END AS result,
    (SELECT count(*) FROM bundled_checks WHERE result = 'STOP')::text || ' STOP row(s) below (0 = safe to push)' AS detail

  UNION ALL

  SELECT seq, check_name, result, detail FROM bundled_checks
) AS all_checks
ORDER BY seq;
