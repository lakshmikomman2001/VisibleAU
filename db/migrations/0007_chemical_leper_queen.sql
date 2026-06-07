CREATE TABLE "technical_audits" (
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
CREATE TABLE "brand_entity_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"abn_verified" boolean DEFAULT false NOT NULL,
	"abn_number" text,
	"abn_entity_name" text,
	"abn_status" text,
	"wikipedia_au_present" boolean DEFAULT false NOT NULL,
	"wikipedia_au_url" text,
	"wikipedia_au_mentions" integer DEFAULT 0 NOT NULL,
	"au_tld_domains" jsonb DEFAULT '[]' NOT NULL,
	"au_directory_presence" jsonb DEFAULT '[]' NOT NULL,
	"score_of_10" numeric(5, 2),
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "citability_methods" (
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
CREATE TABLE "validation_corpus_results" (
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
ALTER TABLE "technical_audits" ADD CONSTRAINT "technical_audits_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_audits" ADD CONSTRAINT "technical_audits_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_audits" ADD CONSTRAINT "technical_audits_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_entity_scores" ADD CONSTRAINT "brand_entity_scores_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "technical_audits_audit_id_idx" ON "technical_audits" USING btree ("audit_id");--> statement-breakpoint
CREATE INDEX "technical_audits_brand_created_idx" ON "technical_audits" USING btree ("brand_id","created_at");--> statement-breakpoint
ALTER TABLE "technical_audits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "brand_entity_scores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "citability_methods" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "validation_corpus_results" DISABLE ROW LEVEL SECURITY;