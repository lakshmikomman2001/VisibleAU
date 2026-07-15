ALTER TABLE "citations" DROP CONSTRAINT "citations_audit_id_audits_id_fk";
--> statement-breakpoint
ALTER TABLE "technical_audits" DROP CONSTRAINT "technical_audits_audit_id_audits_id_fk";
--> statement-breakpoint
DROP INDEX "technical_audits_audit_id_idx";--> statement-breakpoint
DROP INDEX "brand_entity_market_idx";--> statement-breakpoint
ALTER TABLE "citations" ADD CONSTRAINT "citations_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "technical_audits" ADD CONSTRAINT "technical_audits_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "technical_audits_audit_id_uniq" ON "technical_audits" USING btree ("audit_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brand_entity_brand_market_checked_uniq" ON "brand_entity_scores" USING btree ("brand_id","market_code","checked_at");