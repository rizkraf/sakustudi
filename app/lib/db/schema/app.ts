import { sql } from "drizzle-orm";
import {
  pgEnum,
  pgTable,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const termStatus = pgEnum("term_status", ["active", "archived"]);
export const courseStatus = pgEnum("course_status", [
  "planned",
  "in_progress",
  "completed",
  "dropped",
]);
export const activityType = pgEnum("activity_type", [
  "lecture",
  "assignment",
  "quiz",
  "exam",
  "project",
  "practice",
  "other",
]);
export const activityStatus = pgEnum("activity_status", [
  "pending",
  "in_progress",
  "completed",
]);
export const calendarEventType = pgEnum("calendar_event_type", [
  "class",
  "assignment",
  "exam",
  "reminder",
  "other",
]);
export const reminderStatus = pgEnum("reminder_status", [
  "scheduled",
  "sent",
  "cancelled",
]);
export const reminderChannel = pgEnum("reminder_channel", [
  "push",
  "email",
  "in_app",
]);
export const outboxStatus = pgEnum("outbox_status", [
  "pending",
  "processing",
  "sent",
  "failed",
]);
export const exportType = pgEnum("export_type", [
  "profile",
  "notes",
  "courses",
  "calendar",
  "all",
]);
export const exportStatus = pgEnum("export_status", [
  "pending",
  "processing",
  "ready",
  "failed",
]);

export const profiles = pgTable("profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  displayName: text("display_name"),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  timezone: text("timezone").notNull().default("UTC"),
  settings: jsonb("settings").notNull().default({}),
  onboardingCompletedAt: timestamp("onboarding_completed_at", {
    withTimezone: true,
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const legalConsents = pgTable(
  "legal_consents",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    consentType: text("consent_type").notNull(),
    version: text("version").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    ipAddress: text("ip_address"),
  },
  (t) => [
    index("legal_consents_user_idx").on(t.userId),
    check(
      "legal_consents_type_check",
      sql`${t.consentType} in ('privacy_policy', 'terms_of_service', 'data_processing')`,
    ),
  ],
);

export const studyPrograms = pgTable(
  "study_programs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    sourceVersion: text("source_version")
      .notNull()
      .default("1"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("study_programs_active_idx").on(t.isActive)],
);

export const courseCatalog = pgTable(
  "course_catalog",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    credits: integer("credits").notNull().default(3),
    studyProgramId: text("study_program_id").references(
      () => studyPrograms.id,
      { onDelete: "cascade" },
    ),
    sourceVersion: text("source_version")
      .notNull()
      .default("1"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("course_catalog_study_program_idx").on(t.studyProgramId),
    index("course_catalog_active_idx").on(t.isActive),
  ],
);

export const academicTerms = pgTable(
  "academic_terms",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }).notNull(),
    status: termStatus("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("academic_terms_user_active_unique")
      .on(t.userId)
      .where(sql`${t.status} = 'active'`),
    index("academic_terms_user_idx").on(t.userId),
    check(
      "academic_terms_date_range_check",
      sql`${t.endDate} > ${t.startDate}`,
    ),
  ],
);

export const courses = pgTable(
  "courses",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    catalogId: text("catalog_id").references(() => courseCatalog.id, {
      onDelete: "set null",
    }),
    termId: text("term_id").references(() => academicTerms.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    code: text("code"),
    credits: integer("credits"),
    status: courseStatus("status").notNull().default("planned"),
    color: text("color"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("courses_user_idx").on(t.userId),
    index("courses_catalog_idx").on(t.catalogId),
    index("courses_term_idx").on(t.termId),
    check("courses_credits_check", sql`${t.credits} is null or ${t.credits} >= 0`),
  ],
);

export const activities = pgTable(
  "activities",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    courseId: text("course_id").references(() => courses.id, {
      onDelete: "set null",
    }),
    termId: text("term_id").references(() => academicTerms.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    type: activityType("type").notNull().default("assignment"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    status: activityStatus("status").notNull().default("pending"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    details: text("details"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("activities_user_idx").on(t.userId),
    index("activities_course_idx").on(t.courseId),
    index("activities_term_idx").on(t.termId),
  ],
);

export const notes = pgTable(
  "notes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    courseId: text("course_id").references(() => courses.id, {
      onDelete: "set null",
    }),
    termId: text("term_id").references(() => academicTerms.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    content: text("content"),
    pinned: boolean("pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("notes_user_idx").on(t.userId),
    index("notes_course_idx").on(t.courseId),
    index("notes_term_idx").on(t.termId),
  ],
);

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    eventType: calendarEventType("event_type").notNull().default("other"),
    courseId: text("course_id").references(() => courses.id, {
      onDelete: "set null",
    }),
    location: text("location"),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("calendar_events_user_idx").on(t.userId),
    index("calendar_events_course_idx").on(t.courseId),
    index("calendar_events_start_idx").on(t.startsAt),
    check(
      "calendar_events_range_check",
      sql`${t.endsAt} >= ${t.startsAt}`,
    ),
  ],
);

export const attachments = pgTable(
  "attachments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    courseId: text("course_id").references(() => courses.id, {
      onDelete: "cascade",
    }),
    activityId: text("activity_id").references(() => activities.id, {
      onDelete: "cascade",
    }),
    noteId: text("note_id").references(() => notes.id, {
      onDelete: "cascade",
    }),
    calendarEventId: text("calendar_event_id").references(
      () => calendarEvents.id,
      { onDelete: "cascade" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("attachments_user_idx").on(t.userId),
    index("attachments_course_idx").on(t.courseId),
    index("attachments_activity_idx").on(t.activityId),
    index("attachments_note_idx").on(t.noteId),
    index("attachments_calendar_event_idx").on(t.calendarEventId),
    check(
      "attachments_single_parent_check",
      sql`((${t.courseId} is not null)::int + (${t.activityId} is not null)::int + (${t.noteId} is not null)::int + (${t.calendarEventId} is not null)::int) = 1`,
    ),
  ],
);

export const usefulLinks = pgTable(
  "useful_links",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    url: text("url").notNull(),
    description: text("description"),
    category: text("category"),
    courseId: text("course_id").references(() => courses.id, {
      onDelete: "set null",
    }),
    faviconUrl: text("favicon_url"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("useful_links_user_idx").on(t.userId),
    index("useful_links_course_idx").on(t.courseId),
  ],
);

export const reminders = pgTable(
  "reminders",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    message: text("message"),
    remindAt: timestamp("remind_at", { withTimezone: true }).notNull(),
    status: reminderStatus("status").notNull().default("scheduled"),
    channel: reminderChannel("channel").notNull().default("push"),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("reminders_user_idx").on(t.userId),
    index("reminders_due_idx").on(t.remindAt),
  ],
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    eventKey: text("event_key").notNull().unique(),
    status: outboxStatus("status").notNull().default("pending"),
    payload: jsonb("payload").notNull().default({}),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("outbox_events_user_idx").on(t.userId),
    index("outbox_events_pending_idx")
      .on(t.status, t.nextAttemptAt)
      .where(sql`${t.status} = 'pending'`),
  ],
);

export const dataExports = pgTable(
  "data_exports",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    exportType: exportType("export_type").notNull(),
    status: exportStatus("status").notNull().default("pending"),
    fileUrl: text("file_url"),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => [
    index("data_exports_user_idx").on(t.userId),
    check(
      "data_exports_expiry_check",
      sql`${t.expiresAt} is null or ${t.expiresAt} > ${t.requestedAt}`,
    ),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_logs_user_idx").on(t.userId),
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
  ],
);

export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    eventName: text("event_name").notNull(),
    properties: jsonb("properties").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("analytics_events_user_idx").on(t.userId),
    index("analytics_events_occurred_idx").on(t.occurredAt),
  ],
);
