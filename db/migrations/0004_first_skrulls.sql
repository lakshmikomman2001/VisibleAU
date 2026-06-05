CREATE TABLE "vertical_packs" (
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
CREATE TABLE "vertical_pack_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pack_id" uuid NOT NULL,
	"prompt_template" text NOT NULL,
	"rank" integer NOT NULL,
	"category" text,
	"topic" text,
	"expected_mention_type" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vertical_pack_prompts" ADD CONSTRAINT "vertical_pack_prompts_pack_id_vertical_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."vertical_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vertical_packs_vertical_region_idx" ON "vertical_packs" USING btree ("vertical","region");--> statement-breakpoint
ALTER TABLE "vertical_packs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "vertical_pack_prompts" DISABLE ROW LEVEL SECURITY;