CREATE TABLE "canary_prompts" (
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
ALTER TABLE "audits" ADD COLUMN "score_frequency" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "audits" ADD COLUMN "score_position" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "audits" ADD COLUMN "score_sentiment" text;--> statement-breakpoint
ALTER TABLE "audits" ADD COLUMN "score_sentiment_numeric" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "audits" ADD COLUMN "score_context" text;--> statement-breakpoint
ALTER TABLE "audits" ADD COLUMN "score_context_numeric" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "audits" ADD COLUMN "score_accuracy" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "audits" ADD COLUMN "score_confidence_low" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "audits" ADD COLUMN "score_confidence_high" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "audits" ADD COLUMN "confidence_intervals" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "audits" ADD COLUMN "engine_count" integer;