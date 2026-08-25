DO $$ BEGIN CREATE TYPE "public"."region" AS ENUM('au', 'nz', 'uk', 'us', 'ca', 'eu'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."tier" AS ENUM('free', 'starter', 'growth', 'agency', 'agency_pro', 'enterprise'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN CREATE TYPE "public"."vertical" AS ENUM('tradies', 'allied_health', 'saas', 'professional_services', 'real_estate'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "action_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"audit_id" uuid NOT NULL,
	"recommendation_key" text NOT NULL,
	"dimension" text NOT NULL,
	"title" text NOT NULL,
	"action" text NOT NULL,
	"confidence_label" text NOT NULL,
	"expected_impact_score" text NOT NULL,
	"evidence_refs" jsonb DEFAULT '[]' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"dismissed_reason" text,
	"done_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"audit_number" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"triggered_by" text DEFAULT 'manual' NOT NULL,
	"engines" text[] DEFAULT '{}' NOT NULL,
	"prompts_count" integer,
	"runs_per_prompt" integer,
	"total_calls" integer,
	"score_composite" numeric(5, 2),
	"score_frequency" numeric(5, 2),
	"score_position" numeric(5, 2),
	"score_sentiment" text,
	"score_sentiment_numeric" numeric(5, 2),
	"score_context" text,
	"score_context_numeric" numeric(5, 2),
	"score_accuracy" numeric(5, 2),
	"score_confidence_low" numeric(5, 2),
	"score_confidence_high" numeric(5, 2),
	"confidence_intervals" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"engine_count" integer,
	"total_cost_usd" numeric(10, 4),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"config_bundle_id" uuid,
	"config_digest" text,
	"estimated_cost_cents" integer,
	"quality_status" text DEFAULT 'pending'
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"domain" text NOT NULL,
	"vertical" "vertical" NOT NULL,
	"region" "region" NOT NULL,
	"competitors" text[] DEFAULT '{}' NOT NULL,
	"primary_regions" text[] DEFAULT '{}' NOT NULL,
	"abn" text,
	"client_tag" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"classification" jsonb DEFAULT 'null'::jsonb,
	"classification_status" text DEFAULT 'pending' NOT NULL,
	"classification_at" timestamp with time zone,
	"prompt_pack" jsonb DEFAULT 'null'::jsonb,
	"prompt_pack_version" integer DEFAULT 1,
	"brand_token" text,
	CONSTRAINT "brands_brand_token_unique" UNIQUE("brand_token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "canary_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_text" text NOT NULL,
	"engine" text NOT NULL,
	"model" text NOT NULL,
	"last_response_hash" text NOT NULL,
	"last_response_summary" text,
	"drift_detected" text DEFAULT 'false' NOT NULL,
	"last_checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"drift_first_seen_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "citations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"engine" text NOT NULL,
	"prompt" text NOT NULL,
	"run_number" integer DEFAULT 1 NOT NULL,
	"brand_mentioned" boolean NOT NULL,
	"position" integer,
	"sentiment_label" text,
	"sentiment_score" numeric(5, 4),
	"context_label" text,
	"response_snippet" text,
	"context_snippets" jsonb DEFAULT '[]' NOT NULL,
	"cited_sources" jsonb DEFAULT '[]' NOT NULL,
	"llm_cost_usd" numeric(10, 6),
	"llm_tokens_used" integer,
	"llm_model" text,
	"cited_source_type" text,
	"cited_source_engine_affinity" text,
	"is_accurate" boolean,
	"hallucination_flags" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "llm_response_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cache_key" text NOT NULL,
	"prompt" text NOT NULL,
	"model" text NOT NULL,
	"response" text NOT NULL,
	"tokens_used" integer NOT NULL,
	"cost_estimate_usd" numeric(10, 6) NOT NULL,
	"hit_count" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "llm_response_cache_cache_key_unique" UNIQUE("cache_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_org_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text,
	"region" "region" DEFAULT 'au' NOT NULL,
	"tier" "tier" DEFAULT 'free' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"subscription_cancelled_at" timestamp with time zone,
	"onboarding_complete" boolean DEFAULT false NOT NULL,
	"ga4_measurement_id" text,
	"ga4_api_secret" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "organizations_clerk_org_id_unique" UNIQUE("clerk_org_id"),
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recommendation_research" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recommendation_key" text NOT NULL,
	"source" text NOT NULL,
	"url" text,
	"summary" text NOT NULL,
	"confidence_level" text NOT NULL,
	"cited_at" timestamp with time zone,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vertical_pack_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pack_id" uuid NOT NULL,
	"prompt_template" text NOT NULL,
	"rank" integer NOT NULL,
	"category" text,
	"topic" text,
	"expected_mention_type" text,
	"notes" text,
	"persona_tag" text,
	"branded_intent" text,
	"source" text DEFAULT 'curated',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vertical_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vertical" "vertical" NOT NULL,
	"region" "region" NOT NULL,
	"version" text NOT NULL,
	"name" text NOT NULL,
	"prompts_count" integer NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retired_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "technical_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"audit_id" uuid,
	"score_robots" numeric(5, 2),
	"score_llms_txt" numeric(5, 2),
	"score_schema" numeric(5, 2),
	"score_meta" numeric(5, 2),
	"score_content" numeric(5, 2),
	"score_brand_entity" numeric(5, 2),
	"score_signals" numeric(5, 2),
	"score_ai_discovery" numeric(5, 2),
	"score_composite" numeric(5, 2),
	"findings" jsonb DEFAULT '{}' NOT NULL,
	"crawled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "brand_entity_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"organization_id" uuid,
	"market_code" text DEFAULT 'AU_EN',
	"abn_verified" boolean DEFAULT false NOT NULL,
	"abn_number" text,
	"abn_entity_name" text,
	"abn_status" text,
	"local_reg_verified" boolean,
	"local_reg_number" text,
	"wikipedia_au_present" boolean DEFAULT false NOT NULL,
	"wikipedia_au_url" text,
	"wikipedia_au_mentions" integer DEFAULT 0 NOT NULL,
	"wikipedia_local_present" boolean,
	"wikipedia_local_url" text,
	"au_tld_domains" jsonb DEFAULT '[]' NOT NULL,
	"au_tld_present" boolean,
	"au_directory_presence" jsonb DEFAULT '[]' NOT NULL,
	"hipages_present" boolean,
	"hipages_rating" numeric(3, 1),
	"yellow_pages_present" boolean,
	"service_seeking_present" boolean,
	"word_of_mouth_present" boolean,
	"word_of_mouth_rating" numeric(3, 1),
	"local_directory_count" integer,
	"local_directory_details" jsonb,
	"knowledge_panel_present" boolean,
	"knowledge_panel_accurate" boolean,
	"knowledge_panel_url" text,
	"wikidata_entry_present" boolean,
	"wikidata_entry_url" text,
	"score_of_10" numeric(5, 2),
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "citability_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"method_key" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"source" text NOT NULL,
	"effect_size_pct" numeric(5, 2),
	"effect_size_notes" text,
	"applies_to" jsonb DEFAULT '[]' NOT NULL,
	CONSTRAINT "citability_methods_method_key_unique" UNIQUE("method_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "validation_corpus_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fixture_name" text NOT NULL,
	"domain" text NOT NULL,
	"vertical" text NOT NULL,
	"region" text NOT NULL,
	"category" text NOT NULL,
	"expected_score_min" numeric(5, 2),
	"expected_score_max" numeric(5, 2),
	"actual_score" numeric(5, 2),
	"within_band" text NOT NULL,
	"spearman_contribution" numeric(10, 6),
	"run_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "drift_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"current_audit_id" uuid NOT NULL,
	"previous_audit_id" uuid NOT NULL,
	"severity" text NOT NULL,
	"score_delta" numeric(6, 2),
	"dimension_deltas" jsonb DEFAULT '{}' NOT NULL,
	"acknowledged" boolean DEFAULT false NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhook_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"url" text NOT NULL,
	"channel" text NOT NULL,
	"events" text[] NOT NULL,
	"signing_secret" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_delivery_at" timestamp with time zone,
	"last_delivery_status" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"response_status" integer,
	"response_body" text,
	"delivered_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"internal_event_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"format" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"file_size_bytes" integer,
	"download_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bulk_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"operation_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"total_brands" integer DEFAULT 0 NOT NULL,
	"completed_brands" integer DEFAULT 0 NOT NULL,
	"failed_brands" integer DEFAULT 0 NOT NULL,
	"input_params" jsonb DEFAULT '{}' NOT NULL,
	"output_url" text,
	"error_message" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agency_brand_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"brand_id" uuid,
	"logo_url" text,
	"primary_color" text DEFAULT '#0066CC' NOT NULL,
	"secondary_color" text DEFAULT '#1A1A1A' NOT NULL,
	"accent_color" text DEFAULT '#FF6B35' NOT NULL,
	"footer_text" text,
	"contact_line" text,
	"agency_name" text,
	"contact_email" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "client_portal_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"invite_token" text NOT NULL,
	"invitee_name" text,
	"invitee_email" text,
	"status" text DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone,
	"is_revoked" boolean DEFAULT false NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_portal_invites_invite_token_unique" UNIQUE("invite_token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "client_portal_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invite_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_hash" text,
	"user_agent" text,
	"page_viewed" text DEFAULT 'overview' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"frequency" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone,
	"paused_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"weekly_digest" boolean DEFAULT true NOT NULL,
	"digest_email" text NOT NULL,
	"email_on_drift" boolean DEFAULT true NOT NULL,
	"email_on_audit_complete" boolean DEFAULT false NOT NULL,
	"email_on_schedule_failure" boolean DEFAULT true NOT NULL,
	"email_on_hallucination" boolean DEFAULT true,
	"email_on_consensus" boolean DEFAULT false,
	"email_on_volatility" boolean DEFAULT false,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"stripe_subscription_id" text NOT NULL,
	"stripe_price_id" text NOT NULL,
	"tier" text NOT NULL,
	"billing_interval" text NOT NULL,
	"status" text NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_organization_id_unique" UNIQUE("organization_id"),
	CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "processed_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stripe_event_id" text NOT NULL,
	"type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processed_webhook_events_stripe_event_id_unique" UNIQUE("stripe_event_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "config_bundle_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_code" text NOT NULL,
	"locale" text NOT NULL,
	"segment" text NOT NULL,
	"bundle_version" integer NOT NULL,
	"config_digest" text NOT NULL,
	"resolved_config" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "market_ai_budget_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_code" text NOT NULL,
	"segment" text NOT NULL,
	"use_case" text NOT NULL,
	"max_prompts_per_audit" integer DEFAULT 50 NOT NULL,
	"max_models_per_audit" integer DEFAULT 4 NOT NULL,
	"max_repeated_samples" integer DEFAULT 5 NOT NULL,
	"max_estimated_cost_cents" integer DEFAULT 500 NOT NULL,
	"max_fan_out_sub_queries" integer DEFAULT 12 NOT NULL,
	"hard_stop_on_budget" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sampling_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_code" text NOT NULL,
	"segment" text NOT NULL,
	"use_case" text NOT NULL,
	"minimum_prompt_count" integer DEFAULT 10 NOT NULL,
	"recommended_prompt_count" integer DEFAULT 50 NOT NULL,
	"minimum_repeated_samples" integer DEFAULT 3 NOT NULL,
	"confidence_display_threshold" numeric(5, 2) DEFAULT '0.60' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "metric_quality_gates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"metric_key" text NOT NULL,
	"market_code" text NOT NULL,
	"minimum_samples" integer NOT NULL,
	"minimum_provider_count" integer DEFAULT 2 NOT NULL,
	"insufficient_data_label" text DEFAULT 'Insufficient data' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "prompt_pack_coverage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_code" text NOT NULL,
	"locale" text NOT NULL,
	"segment" text NOT NULL,
	"use_case" text NOT NULL,
	"required_template_keys" jsonb NOT NULL,
	"available_template_keys" jsonb NOT NULL,
	"coverage_ratio" numeric(5, 2) NOT NULL,
	"coverage_status" text NOT NULL,
	"last_validated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provider_market_capabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_key" text NOT NULL,
	"model_key" text NOT NULL,
	"market_code" text NOT NULL,
	"locale" text NOT NULL,
	"supports_web_retrieval" boolean DEFAULT false NOT NULL,
	"supports_citations" boolean DEFAULT false NOT NULL,
	"supports_location_context" boolean DEFAULT false NOT NULL,
	"supports_query_fan_out" boolean DEFAULT false NOT NULL,
	"max_fan_out_sub_queries" integer DEFAULT 12 NOT NULL,
	"max_context_tokens" integer,
	"average_latency_ms" integer,
	"estimated_cost_per_1k_cents" numeric(8, 4),
	"is_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_cost_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"market_code" text NOT NULL,
	"locale" text NOT NULL,
	"estimated_cost_cents" integer DEFAULT 0 NOT NULL,
	"actual_cost_cents" integer DEFAULT 0 NOT NULL,
	"prompt_count" integer DEFAULT 0 NOT NULL,
	"provider_call_count" integer DEFAULT 0 NOT NULL,
	"budget_policy_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "remediation_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"audit_id" uuid,
	"recommendation_id" uuid,
	"recommendation_key" text,
	"title" text NOT NULL,
	"description" text,
	"dimension" text,
	"status" text DEFAULT 'open' NOT NULL,
	"priority" integer NOT NULL,
	"effort" text,
	"confidence_label" text,
	"assigned_to" uuid,
	"approved_by" uuid,
	"due_date" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"wont_fix_reason" text,
	"score_before" numeric(5, 2),
	"score_after" numeric(5, 2),
	"fan_out_before" numeric(5, 2),
	"fan_out_after" numeric(5, 2),
	"similarity_before" numeric(4, 3),
	"similarity_after" numeric(4, 3),
	"reaudit_id" uuid,
	"reaudit_deferred_reason" text,
	"fan_out_gap_id" uuid,
	"topical_gap_id" uuid,
	"linkedin_gap_source" text,
	"consensus_gap_source" text,
	"lift_achieved" numeric(5, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workflow_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"workflow_type" text NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"result_summary" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"task_id" uuid,
	"draft_type" text NOT NULL,
	"content_format" text NOT NULL,
	"format_recommendation_reason" text,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"target_sub_query" text,
	"target_word_count" integer,
	"word_count" integer,
	"target_url" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "share_of_voice_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"audit_id" uuid,
	"competitor_domain" text NOT NULL,
	"prompt_category" text NOT NULL,
	"engine" text NOT NULL,
	"brand_share" numeric(5, 2),
	"competitor_share" numeric(5, 2),
	"total_prompts" integer NOT NULL,
	"sample_quality" text NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "prompt_volume_estimates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_code" text NOT NULL,
	"vertical" text NOT NULL,
	"topic" text NOT NULL,
	"category" text NOT NULL,
	"estimated_monthly_volume" integer,
	"volume_trend" text,
	"confidence" text NOT NULL,
	"data_source" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prompt_volume_estimates_market_code_vertical_topic_period_start_unique" UNIQUE("market_code","vertical","topic","period_start")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "visibility_trends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"period_label" text NOT NULL,
	"period_type" text NOT NULL,
	"score_composite_avg" numeric(5, 2),
	"score_frequency_avg" numeric(5, 2),
	"score_sentiment_avg" numeric(5, 2),
	"score_accuracy_avg" numeric(5, 2),
	"score_position_avg" numeric(5, 2),
	"score_context_avg" numeric(5, 2),
	"audit_count" integer NOT NULL,
	"sample_quality" text NOT NULL,
	"mention_rate" numeric(5, 2),
	"citation_rate" numeric(5, 2),
	"mention_source_ratio" numeric(5, 2),
	"brand_archetype" text,
	"market_competition_label" text,
	"citation_volatility_score" numeric(5, 2),
	"ai_referral_sessions" integer,
	"ai_lead_estimate" numeric(8, 2),
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visibility_trends_brand_id_period_label_period_type_unique" UNIQUE("brand_id","period_label","period_type")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "brand_web_mentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"market_code" text DEFAULT 'AU_EN' NOT NULL,
	"source_platform" text NOT NULL,
	"source_url" text NOT NULL,
	"subreddit" text,
	"mention_text" text,
	"mention_sentiment" text,
	"upvotes" integer,
	"is_top_comment" boolean,
	"thread_recency_days" integer,
	"is_indexed_by_google" boolean,
	"engine_citation_seen" text,
	"vertical_match" boolean,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "query_fan_out_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid,
	"brand_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"original_prompt" text NOT NULL,
	"original_prompt_id" uuid,
	"engine" text NOT NULL,
	"sub_query" text NOT NULL,
	"sub_query_rank" integer NOT NULL,
	"brand_appeared" boolean NOT NULL,
	"brand_position" integer,
	"content_similarity_score" numeric(4, 3),
	"above_threshold" boolean,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "topical_coverage_gaps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"vertical" text NOT NULL,
	"topic_cluster" text NOT NULL,
	"topic_label" text NOT NULL,
	"brand_has_content" boolean NOT NULL,
	"brand_content_depth" integer,
	"brand_passage_count" integer,
	"competitor_coverage" jsonb,
	"estimated_citation_impact" numeric(4, 2),
	"priority_rank" integer,
	"cross_prompt_impact" integer,
	"analyzed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topical_coverage_gaps_brand_id_vertical_topic_cluster_unique" UNIQUE("brand_id","vertical","topic_cluster")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "google_ai_mode_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid,
	"brand_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"prompt" text NOT NULL,
	"brand_appeared" boolean NOT NULL,
	"brand_position" integer,
	"sub_queries_shown" jsonb,
	"raw_response" text,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "report_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"template_type" text NOT NULL,
	"sections" jsonb NOT NULL,
	"tone" text DEFAULT 'professional' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "generated_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"audit_id" uuid,
	"template_id" uuid,
	"report_type" text NOT NULL,
	"period_label" text,
	"narrative_text" text NOT NULL,
	"headline" text NOT NULL,
	"key_wins" jsonb,
	"key_gaps" jsonb,
	"fan_out_summary" jsonb,
	"topical_summary" jsonb,
	"mention_source_summary" jsonb,
	"linkedin_summary" jsonb,
	"consensus_summary" jsonb,
	"entity_home_summary" jsonb,
	"knowledge_panel_summary" jsonb,
	"confidence_notes" jsonb,
	"pdf_url" text,
	"email_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "report_delivery_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"brand_id" uuid,
	"template_id" uuid,
	"frequency" text NOT NULL,
	"day_of_week" integer,
	"day_of_month" integer,
	"time_of_day" text DEFAULT '23:00' NOT NULL,
	"recipient_emails" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hallucination_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"citation_id" uuid,
	"engine" text NOT NULL,
	"prompt" text NOT NULL,
	"incorrect_claim" text NOT NULL,
	"correct_value" text,
	"claim_type" text NOT NULL,
	"severity" text NOT NULL,
	"is_acknowledged" boolean DEFAULT false NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"acknowledged_by" uuid,
	"is_false_positive" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evidence_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"audit_id" uuid,
	"engine" text NOT NULL,
	"prompt" text NOT NULL,
	"raw_response" text NOT NULL,
	"score_at_capture" numeric(5, 2),
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "citation_source_intelligence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"audit_id" uuid,
	"engine" text NOT NULL,
	"source_type" text NOT NULL,
	"citation_count" integer NOT NULL,
	"citation_share" numeric(5, 2),
	"brand_present_in_source" boolean NOT NULL,
	"gap_severity" text NOT NULL,
	"market_benchmark" jsonb,
	"source_affinity_note" text,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "linkedin_presence_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"market_code" text DEFAULT 'AU_EN' NOT NULL,
	"company_page_url" text,
	"company_page_exists" boolean,
	"company_page_followers" integer,
	"company_page_last_post_date" timestamp,
	"company_posts_30d" integer,
	"company_articles_count" integer,
	"founder_profile_url" text,
	"founder_profile_exists" boolean,
	"founder_followers" integer,
	"founder_posts_30d" integer,
	"founder_articles_count" integer,
	"founder_articles_500plus" integer,
	"knowledge_sharing_ratio" numeric(4, 3),
	"original_content_ratio" numeric(4, 3),
	"semantic_relevance_score" numeric(4, 3),
	"presence_score" integer,
	"gaps" jsonb,
	"audited_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "brand_consensus_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"market_code" text DEFAULT 'AU_EN' NOT NULL,
	"source_type" text NOT NULL,
	"source_url" text,
	"name_match" boolean,
	"service_match" boolean,
	"location_match" boolean,
	"price_positioning" text,
	"differentiators_match" boolean,
	"consistency_score" integer,
	"discrepancies" jsonb,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_consensus_checks_brand_id_source_type_unique" UNIQUE("brand_id","source_type")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "youtube_presence_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"market_code" text DEFAULT 'AU_EN' NOT NULL,
	"channel_url" text,
	"channel_exists" boolean,
	"channel_subscriber_count" integer,
	"channel_total_videos" integer,
	"longform_video_count" integer,
	"shorts_count" integer,
	"longform_ratio" numeric(4, 3),
	"howto_video_count" integer,
	"explainer_video_count" integer,
	"brand_topic_video_count" integer,
	"videos_with_transcript" integer,
	"videos_with_chapters" integer,
	"avg_chapter_count" numeric(4, 1),
	"avg_description_length" integer,
	"embedding_pages_count" integer,
	"embedding_pages_with_schema" integer,
	"embedding_pages_with_transcript" integer,
	"any_video_cited_in_audit" boolean,
	"cited_video_urls" jsonb,
	"presence_score" integer,
	"gaps" jsonb,
	"audited_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "crawler_visit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"crawler_name" text NOT NULL,
	"crawler_tier" text NOT NULL,
	"visited_url" text NOT NULL,
	"status_code" integer,
	"response_time_ms" integer,
	"error_type" text,
	"raw_log_line" text,
	"is_active_agent" boolean DEFAULT false NOT NULL,
	"referrer_ai_session" text,
	"visit_purpose" text,
	"visited_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_structure_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"page_url" text NOT NULL,
	"answer_capsule_score" integer,
	"faq_block_present" boolean,
	"faq_schema_present" boolean,
	"heading_structure" jsonb,
	"capsule_gaps" jsonb,
	"word_count" integer,
	"optimal_passage_count" integer,
	"last_modified" text,
	"days_since_published" integer,
	"freshness_risk" text,
	"content_format_detected" text,
	"citation_probability_score" numeric(4, 3),
	"is_entity_home_candidate" boolean,
	"entity_home_has_org_schema" boolean,
	"entity_home_has_id_field" boolean,
	"entity_home_same_as_count" integer,
	"entity_home_page_url" text,
	"outbound_citation_count" integer,
	"has_author_attribution" boolean,
	"audited_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "llmstxt_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"content" text NOT NULL,
	"depth_score" integer NOT NULL,
	"hosted_url" text,
	"is_current" boolean DEFAULT true NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_readiness_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"tech_llmstxt_present" boolean,
	"tech_llmstxt_valid" boolean,
	"tech_robots_allows_crawlers" boolean,
	"tech_ssr_passes" boolean,
	"tech_ai_discovery_endpoints" boolean,
	"tech_page_load_fast" boolean,
	"tech_mcp_endpoint_present" boolean,
	"tech_mcp_endpoint_valid" boolean,
	"tech_mcp_tools_count" integer,
	"tech_score" integer,
	"entity_org_schema_present" boolean,
	"entity_local_business_schema" boolean,
	"entity_local_reg_in_schema" boolean,
	"entity_name_consistent" boolean,
	"entity_service_readable" boolean,
	"entity_clarity_score" integer,
	"verify_abn_confirmed" boolean,
	"verify_wikipedia_au" boolean,
	"verify_au_directories" integer,
	"verify_review_citations" integer,
	"verify_expert_quotes" boolean,
	"verify_score" integer,
	"authority_topical_coverage" integer,
	"authority_prompt_appearance" integer,
	"authority_citation_diversity" integer,
	"authority_score" integer,
	"task_booking_accessible" boolean,
	"task_pricing_visible" boolean,
	"task_service_area_defined" boolean,
	"task_faq_direct_answers" integer,
	"task_score" integer,
	"local_ai_trust_score" integer,
	"total_score" integer,
	"gaps" jsonb,
	"scored_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversation_journeys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"journey_name" text NOT NULL,
	"vertical" text NOT NULL,
	"buyer_stage" text NOT NULL,
	"prompt_sequence" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "journey_run_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journey_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"engine" text NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"turn_results" jsonb NOT NULL,
	"brand_appeared_in_n_turns" integer NOT NULL,
	"total_turns" integer NOT NULL,
	"journey_score" numeric(5, 2),
	"first_mention_turn" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "comparison_prompt_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"audit_id" uuid,
	"competitor_domain" text NOT NULL,
	"prompt" text NOT NULL,
	"engine" text NOT NULL,
	"brand_won" boolean,
	"brand_mentioned" boolean NOT NULL,
	"competitor_mentioned" boolean NOT NULL,
	"verdict_snippet" text,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_trail" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"metadata" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "org_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"brand_access" jsonb DEFAULT 'null'::jsonb,
	"invited_by" uuid,
	"invited_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"invitation_token" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_members_invitation_token_unique" UNIQUE("invitation_token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "data_residency_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"data_type" text NOT NULL,
	"storage_region" text NOT NULL,
	"provider" text NOT NULL,
	"retention_period" text DEFAULT '12 months' NOT NULL,
	"encryption_status" text DEFAULT 'AES-256 at rest, TLS 1.3 in transit' NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "org_feature_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"flag_key" text NOT NULL,
	"is_enabled" boolean NOT NULL,
	"reason" text,
	"set_by" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "action_items" ADD CONSTRAINT "action_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "action_items" ADD CONSTRAINT "action_items_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "action_items" ADD CONSTRAINT "action_items_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "audits" ADD CONSTRAINT "audits_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "audits" ADD CONSTRAINT "audits_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "audits" ADD CONSTRAINT "audits_config_bundle_id_config_bundle_cache_id_fk" FOREIGN KEY ("config_bundle_id") REFERENCES "public"."config_bundle_cache"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "brands" ADD CONSTRAINT "brands_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "citations" ADD CONSTRAINT "citations_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "vertical_pack_prompts" ADD CONSTRAINT "vertical_pack_prompts_pack_id_vertical_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."vertical_packs"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "technical_audits" ADD CONSTRAINT "technical_audits_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "technical_audits" ADD CONSTRAINT "technical_audits_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "technical_audits" ADD CONSTRAINT "technical_audits_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "brand_entity_scores" ADD CONSTRAINT "brand_entity_scores_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "brand_entity_scores" ADD CONSTRAINT "brand_entity_scores_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "drift_alerts" ADD CONSTRAINT "drift_alerts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "drift_alerts" ADD CONSTRAINT "drift_alerts_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "drift_alerts" ADD CONSTRAINT "drift_alerts_current_audit_id_audits_id_fk" FOREIGN KEY ("current_audit_id") REFERENCES "public"."audits"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "drift_alerts" ADD CONSTRAINT "drift_alerts_previous_audit_id_audits_id_fk" FOREIGN KEY ("previous_audit_id") REFERENCES "public"."audits"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "audit_exports" ADD CONSTRAINT "audit_exports_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "audit_exports" ADD CONSTRAINT "audit_exports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "bulk_operations" ADD CONSTRAINT "bulk_operations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "agency_brand_assets" ADD CONSTRAINT "agency_brand_assets_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "agency_brand_assets" ADD CONSTRAINT "agency_brand_assets_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "client_portal_invites" ADD CONSTRAINT "client_portal_invites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "client_portal_invites" ADD CONSTRAINT "client_portal_invites_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "client_portal_views" ADD CONSTRAINT "client_portal_views_invite_id_client_portal_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."client_portal_invites"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "client_portal_views" ADD CONSTRAINT "client_portal_views_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "client_portal_views" ADD CONSTRAINT "client_portal_views_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "audit_schedules" ADD CONSTRAINT "audit_schedules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "audit_schedules" ADD CONSTRAINT "audit_schedules_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "audit_cost_snapshots" ADD CONSTRAINT "audit_cost_snapshots_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "audit_cost_snapshots" ADD CONSTRAINT "audit_cost_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "audit_cost_snapshots" ADD CONSTRAINT "audit_cost_snapshots_budget_policy_id_market_ai_budget_policies_id_fk" FOREIGN KEY ("budget_policy_id") REFERENCES "public"."market_ai_budget_policies"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "remediation_tasks" ADD CONSTRAINT "remediation_tasks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "remediation_tasks" ADD CONSTRAINT "remediation_tasks_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "remediation_tasks" ADD CONSTRAINT "remediation_tasks_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "remediation_tasks" ADD CONSTRAINT "remediation_tasks_recommendation_id_action_items_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."action_items"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "remediation_tasks" ADD CONSTRAINT "remediation_tasks_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "remediation_tasks" ADD CONSTRAINT "remediation_tasks_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "remediation_tasks" ADD CONSTRAINT "remediation_tasks_reaudit_id_audits_id_fk" FOREIGN KEY ("reaudit_id") REFERENCES "public"."audits"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "workflow_runs" ADD CONSTRAINT "workflow_runs_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_task_id_remediation_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."remediation_tasks"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "share_of_voice_snapshots" ADD CONSTRAINT "share_of_voice_snapshots_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "share_of_voice_snapshots" ADD CONSTRAINT "share_of_voice_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "share_of_voice_snapshots" ADD CONSTRAINT "share_of_voice_snapshots_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "visibility_trends" ADD CONSTRAINT "visibility_trends_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "visibility_trends" ADD CONSTRAINT "visibility_trends_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "brand_web_mentions" ADD CONSTRAINT "brand_web_mentions_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "brand_web_mentions" ADD CONSTRAINT "brand_web_mentions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "query_fan_out_results" ADD CONSTRAINT "query_fan_out_results_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "query_fan_out_results" ADD CONSTRAINT "query_fan_out_results_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "query_fan_out_results" ADD CONSTRAINT "query_fan_out_results_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "query_fan_out_results" ADD CONSTRAINT "query_fan_out_results_original_prompt_id_vertical_pack_prompts_id_fk" FOREIGN KEY ("original_prompt_id") REFERENCES "public"."vertical_pack_prompts"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "topical_coverage_gaps" ADD CONSTRAINT "topical_coverage_gaps_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "topical_coverage_gaps" ADD CONSTRAINT "topical_coverage_gaps_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "google_ai_mode_results" ADD CONSTRAINT "google_ai_mode_results_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "google_ai_mode_results" ADD CONSTRAINT "google_ai_mode_results_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "google_ai_mode_results" ADD CONSTRAINT "google_ai_mode_results_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "report_templates" ADD CONSTRAINT "report_templates_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "generated_reports" ADD CONSTRAINT "generated_reports_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "generated_reports" ADD CONSTRAINT "generated_reports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "generated_reports" ADD CONSTRAINT "generated_reports_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "generated_reports" ADD CONSTRAINT "generated_reports_template_id_report_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."report_templates"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "report_delivery_schedules" ADD CONSTRAINT "report_delivery_schedules_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "report_delivery_schedules" ADD CONSTRAINT "report_delivery_schedules_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "report_delivery_schedules" ADD CONSTRAINT "report_delivery_schedules_template_id_report_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."report_templates"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hallucination_incidents" ADD CONSTRAINT "hallucination_incidents_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hallucination_incidents" ADD CONSTRAINT "hallucination_incidents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hallucination_incidents" ADD CONSTRAINT "hallucination_incidents_citation_id_citations_id_fk" FOREIGN KEY ("citation_id") REFERENCES "public"."citations"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "hallucination_incidents" ADD CONSTRAINT "hallucination_incidents_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "evidence_snapshots" ADD CONSTRAINT "evidence_snapshots_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "evidence_snapshots" ADD CONSTRAINT "evidence_snapshots_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "evidence_snapshots" ADD CONSTRAINT "evidence_snapshots_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE set null ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "citation_source_intelligence" ADD CONSTRAINT "citation_source_intelligence_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "citation_source_intelligence" ADD CONSTRAINT "citation_source_intelligence_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "citation_source_intelligence" ADD CONSTRAINT "citation_source_intelligence_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "linkedin_presence_audits" ADD CONSTRAINT "linkedin_presence_audits_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "linkedin_presence_audits" ADD CONSTRAINT "linkedin_presence_audits_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "brand_consensus_checks" ADD CONSTRAINT "brand_consensus_checks_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "brand_consensus_checks" ADD CONSTRAINT "brand_consensus_checks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "youtube_presence_audits" ADD CONSTRAINT "youtube_presence_audits_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "youtube_presence_audits" ADD CONSTRAINT "youtube_presence_audits_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "crawler_visit_logs" ADD CONSTRAINT "crawler_visit_logs_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "crawler_visit_logs" ADD CONSTRAINT "crawler_visit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "content_structure_audits" ADD CONSTRAINT "content_structure_audits_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "content_structure_audits" ADD CONSTRAINT "content_structure_audits_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "llmstxt_versions" ADD CONSTRAINT "llmstxt_versions_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "llmstxt_versions" ADD CONSTRAINT "llmstxt_versions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "agent_readiness_scores" ADD CONSTRAINT "agent_readiness_scores_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "agent_readiness_scores" ADD CONSTRAINT "agent_readiness_scores_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "conversation_journeys" ADD CONSTRAINT "conversation_journeys_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "conversation_journeys" ADD CONSTRAINT "conversation_journeys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "journey_run_results" ADD CONSTRAINT "journey_run_results_journey_id_conversation_journeys_id_fk" FOREIGN KEY ("journey_id") REFERENCES "public"."conversation_journeys"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "journey_run_results" ADD CONSTRAINT "journey_run_results_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "journey_run_results" ADD CONSTRAINT "journey_run_results_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "comparison_prompt_results" ADD CONSTRAINT "comparison_prompt_results_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "comparison_prompt_results" ADD CONSTRAINT "comparison_prompt_results_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "comparison_prompt_results" ADD CONSTRAINT "comparison_prompt_results_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "audit_trail" ADD CONSTRAINT "audit_trail_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "audit_trail" ADD CONSTRAINT "audit_trail_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "org_members" ADD CONSTRAINT "org_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "org_members" ADD CONSTRAINT "org_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "org_members" ADD CONSTRAINT "org_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "data_residency_log" ADD CONSTRAINT "data_residency_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "org_feature_flags" ADD CONSTRAINT "org_feature_flags_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object OR undefined_column THEN NULL; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "action_items_audit_rec_idx" ON "action_items" USING btree ("audit_id","recommendation_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "audits_org_audit_number_idx" ON "audits" USING btree ("organization_id","audit_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audits_org_completed_idx" ON "audits" USING btree ("organization_id","completed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recommendation_research_key_idx" ON "recommendation_research" USING btree ("recommendation_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vertical_packs_vertical_region_idx" ON "vertical_packs" USING btree ("vertical","region");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "technical_audits_audit_id_idx" ON "technical_audits" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "technical_audits_brand_created_idx" ON "technical_audits" USING btree ("brand_id","created_at");--> statement-breakpoint
DO $$ BEGIN CREATE INDEX IF NOT EXISTS "brand_entity_market_idx" ON "brand_entity_scores" USING btree ("brand_id","market_code","checked_at"); EXCEPTION WHEN undefined_column THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drift_alerts_org_acknowledged_idx" ON "drift_alerts" USING btree ("organization_id","acknowledged");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "drift_alerts_brand_created_idx" ON "drift_alerts" USING btree ("brand_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "webhook_deliveries_endpoint_created_idx" ON "webhook_deliveries" USING btree ("endpoint_id","created_at");--> statement-breakpoint
DO $$ BEGIN CREATE INDEX IF NOT EXISTS "webhook_deliveries_endpoint_event_id_idx" ON "webhook_deliveries" USING btree ("endpoint_id","internal_event_id"); EXCEPTION WHEN undefined_column THEN NULL; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "audit_exports_audit_format_idx" ON "audit_exports" USING btree ("audit_id","format");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_org_brand_assets" ON "agency_brand_assets" USING btree ("organization_id","brand_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_schedules_status_next_run_idx" ON "audit_schedules" USING btree ("status","next_run_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "audit_schedules_brand_unique_idx" ON "audit_schedules" USING btree ("brand_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notification_preferences_org_idx" ON "notification_preferences" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "config_bundle_unique_version" ON "config_bundle_cache" USING btree ("market_code","locale","segment","bundle_version");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "config_bundle_one_active" ON "config_bundle_cache" USING btree ("market_code","locale","segment") WHERE is_active = true;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "budget_policy_unique" ON "market_ai_budget_policies" USING btree ("market_code","segment","use_case");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sampling_policy_unique" ON "sampling_policies" USING btree ("market_code","segment","use_case");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "metric_quality_gate_unique" ON "metric_quality_gates" USING btree ("metric_key","market_code");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "prompt_pack_coverage_unique" ON "prompt_pack_coverage" USING btree ("market_code","locale","segment","use_case");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "provider_capability_unique" ON "provider_market_capabilities" USING btree ("provider_key","model_key","market_code","locale");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_cost_org_created_idx" ON "audit_cost_snapshots" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_cost_audit_id_idx" ON "audit_cost_snapshots" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_brand_status_idx" ON "remediation_tasks" USING btree ("brand_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_assigned_idx" ON "remediation_tasks" USING btree ("assigned_to","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_runs_org_status_idx" ON "workflow_runs" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_runs_brand_scheduled_idx" ON "workflow_runs" USING btree ("brand_id","scheduled_for");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sov_brand_engine_idx" ON "share_of_voice_snapshots" USING btree ("brand_id","engine","calculated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brand_mentions_brand_idx" ON "brand_web_mentions" USING btree ("brand_id","detected_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brand_mentions_platform_idx" ON "brand_web_mentions" USING btree ("brand_id","source_platform","detected_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brand_mentions_market_idx" ON "brand_web_mentions" USING btree ("brand_id","market_code","detected_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fan_out_brand_idx" ON "query_fan_out_results" USING btree ("brand_id","run_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fan_out_audit_idx" ON "query_fan_out_results" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fan_out_threshold_idx" ON "query_fan_out_results" USING btree ("brand_id","above_threshold");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "topic_gaps_brand_priority_idx" ON "topical_coverage_gaps" USING btree ("brand_id","priority_rank");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "topic_gaps_cross_prompt_idx" ON "topical_coverage_gaps" USING btree ("brand_id","cross_prompt_impact");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reports_brand_type_idx" ON "generated_reports" USING btree ("brand_id","report_type","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hallucination_brand_idx" ON "hallucination_incidents" USING btree ("brand_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "csi_unique_with_audit" ON "citation_source_intelligence" USING btree ("brand_id","audit_id","engine","source_type") WHERE audit_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "csi_unique_aggregate" ON "citation_source_intelligence" USING btree ("brand_id","engine","source_type") WHERE audit_id IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "csi_brand_engine_idx" ON "citation_source_intelligence" USING btree ("brand_id","engine","calculated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "linkedin_brand_idx" ON "linkedin_presence_audits" USING btree ("brand_id","audited_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "consensus_brand_idx" ON "brand_consensus_checks" USING btree ("brand_id","checked_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "youtube_brand_idx" ON "youtube_presence_audits" USING btree ("brand_id","audited_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawler_logs_brand_idx" ON "crawler_visit_logs" USING btree ("brand_id","visited_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawler_logs_crawler_idx" ON "crawler_visit_logs" USING btree ("crawler_name","visited_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "content_structure_brand_page_idx" ON "content_structure_audits" USING btree ("brand_id","page_url");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_structure_brand_idx" ON "content_structure_audits" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_readiness_brand_idx" ON "agent_readiness_scores" USING btree ("brand_id","scored_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journey_results_brand_idx" ON "journey_run_results" USING btree ("brand_id","run_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "journey_results_journey_idx" ON "journey_run_results" USING btree ("journey_id","run_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comparison_brand_idx" ON "comparison_prompt_results" USING btree ("brand_id","run_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comparison_audit_idx" ON "comparison_prompt_results" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comparison_competitor_idx" ON "comparison_prompt_results" USING btree ("brand_id","competitor_domain","run_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_trail_org_idx" ON "audit_trail" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "org_members_org_user_idx" ON "org_members" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "data_residency_org_type_idx" ON "data_residency_log" USING btree ("organization_id","data_type");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "org_feature_flags_org_key_idx" ON "org_feature_flags" USING btree ("organization_id","flag_key");