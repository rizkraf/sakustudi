ALTER TABLE "course_catalog" ADD COLUMN "source_version" text DEFAULT '1' NOT NULL;--> statement-breakpoint
ALTER TABLE "study_programs" ADD COLUMN "source_version" text DEFAULT '1' NOT NULL;--> statement-breakpoint
ALTER TABLE "study_programs" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX "activities_term_idx" ON "activities" USING btree ("term_id");--> statement-breakpoint
CREATE INDEX "attachments_course_idx" ON "attachments" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "attachments_activity_idx" ON "attachments" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "attachments_note_idx" ON "attachments" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "attachments_calendar_event_idx" ON "attachments" USING btree ("calendar_event_id");--> statement-breakpoint
CREATE INDEX "calendar_events_course_idx" ON "calendar_events" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "course_catalog_study_program_idx" ON "course_catalog" USING btree ("study_program_id");--> statement-breakpoint
CREATE INDEX "course_catalog_active_idx" ON "course_catalog" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "courses_catalog_idx" ON "courses" USING btree ("catalog_id");--> statement-breakpoint
CREATE INDEX "notes_term_idx" ON "notes" USING btree ("term_id");--> statement-breakpoint
CREATE INDEX "study_programs_active_idx" ON "study_programs" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "useful_links_course_idx" ON "useful_links" USING btree ("course_id");