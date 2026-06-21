CREATE TABLE "local_seo_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"gmb_present" boolean DEFAULT false NOT NULL,
	"gmb_completeness" numeric(5, 2),
	"gmb_review_count" integer DEFAULT 0 NOT NULL,
	"gmb_avg_rating" numeric(3, 2),
	"directory_presence" jsonb DEFAULT '[]' NOT NULL,
	"nap_consistency" numeric(5, 2),
	"nap_findings" jsonb DEFAULT '[]' NOT NULL,
	"suburb_coverage" jsonb DEFAULT '[]' NOT NULL,
	"score_composite" numeric(5, 2),
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drift_alerts" (
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
CREATE TABLE "webhook_endpoints" (
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
CREATE TABLE "webhook_deliveries" (
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"format" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"file_size_bytes" integer,
	"download_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bulk_operations" (
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
ALTER TABLE "brands" ADD COLUMN "abn" text;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "classification" jsonb DEFAULT 'null'::jsonb;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "classification_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "classification_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "prompt_pack" jsonb DEFAULT 'null'::jsonb;--> statement-breakpoint
ALTER TABLE "brands" ADD COLUMN "prompt_pack_version" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "local_seo_results" ADD CONSTRAINT "local_seo_results_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "local_seo_results" ADD CONSTRAINT "local_seo_results_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drift_alerts" ADD CONSTRAINT "drift_alerts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drift_alerts" ADD CONSTRAINT "drift_alerts_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drift_alerts" ADD CONSTRAINT "drift_alerts_current_audit_id_audits_id_fk" FOREIGN KEY ("current_audit_id") REFERENCES "public"."audits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drift_alerts" ADD CONSTRAINT "drift_alerts_previous_audit_id_audits_id_fk" FOREIGN KEY ("previous_audit_id") REFERENCES "public"."audits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_exports" ADD CONSTRAINT "audit_exports_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_exports" ADD CONSTRAINT "audit_exports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_operations" ADD CONSTRAINT "bulk_operations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "local_seo_results_brand_checked_idx" ON "local_seo_results" USING btree ("brand_id","checked_at");--> statement-breakpoint
CREATE INDEX "drift_alerts_org_acknowledged_idx" ON "drift_alerts" USING btree ("organization_id","acknowledged");--> statement-breakpoint
CREATE INDEX "drift_alerts_brand_created_idx" ON "drift_alerts" USING btree ("brand_id","created_at");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_endpoint_created_idx" ON "webhook_deliveries" USING btree ("endpoint_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_exports_audit_format_idx" ON "audit_exports" USING btree ("audit_id","format");