ALTER TABLE "citations" DROP CONSTRAINT IF EXISTS "citations_audit_id_audits_id_fk";
--> statement-breakpoint
ALTER TABLE "technical_audits" DROP CONSTRAINT IF EXISTS "technical_audits_audit_id_audits_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "technical_audits_audit_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "brand_entity_market_idx";--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "citations" ADD CONSTRAINT "citations_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "technical_audits" ADD CONSTRAINT "technical_audits_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "technical_audits_audit_id_uniq" ON "technical_audits" USING btree ("audit_id");--> statement-breakpoint
DO $$ BEGIN CREATE UNIQUE INDEX IF NOT EXISTS "brand_entity_brand_market_checked_uniq" ON "brand_entity_scores" USING btree ("brand_id","market_code","checked_at"); EXCEPTION WHEN undefined_column THEN NULL; END $$;