ALTER TABLE "notes" ADD COLUMN "content_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;