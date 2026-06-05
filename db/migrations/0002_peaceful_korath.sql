CREATE TABLE "audits" (
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
	"total_cost_usd" numeric(10, 4),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "citations" (
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_response_cache" (
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
ALTER TABLE "audits" ADD CONSTRAINT "audits_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "audits_org_audit_number_idx" ON "audits" USING btree ("organization_id","audit_number");--> statement-breakpoint
CREATE INDEX "audits_org_completed_idx" ON "audits" USING btree ("organization_id","completed_at");