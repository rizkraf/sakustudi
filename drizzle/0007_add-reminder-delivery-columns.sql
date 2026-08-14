ALTER TYPE "public"."reminder_status" ADD VALUE 'failed';--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "activity_id" text;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "deadline_version" integer;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "job_id" text;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "failed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reminders" ADD COLUMN "read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reminders_activity_idx" ON "reminders" USING btree ("activity_id");