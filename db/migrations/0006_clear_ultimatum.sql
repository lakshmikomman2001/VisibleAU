CREATE TABLE "action_items" (
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
CREATE TABLE "recommendation_research" (
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
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_items" ADD CONSTRAINT "action_items_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "action_items_audit_rec_idx" ON "action_items" USING btree ("audit_id","recommendation_key");--> statement-breakpoint
CREATE INDEX "recommendation_research_key_idx" ON "recommendation_research" USING btree ("recommendation_key");