import { data, Link, redirect, useActionData } from "react-router";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

import { AppShell } from "~/components/layout/AppShell";
import { csrfTokenContext, sessionUserContext } from "~/context";
import {
  requireConsentsMiddleware,
  requireUserMiddleware,
} from "~/lib/auth/session";
import {
  isFieldErrorResponse,
  toFormActionResponse,
  type FieldErrorResponse,
} from "~/lib/errors/response";
import {
  assertCsrfMutation,
  createCsrfToken,
  csrfCookieMiddleware,
} from "~/lib/request/security.server";
import { DEADLINE_TIME_ZONE } from "~/lib/time/deadlines";
import { parseForm } from "~/lib/validation/form-data";
import {
  createCalendarEventSchema,
  deleteCalendarEventSchema,
  CALENDAR_EVENT_TYPE_LABELS,
} from "~/modules/calendar/calendar.schema";
import {
  createCalendarEvent,
  deleteCalendarEventFromInput,
  getCalendarData,
  type CalendarDay,
} from "~/modules/calendar/calendar.service";
import {
  listUnreadInAppReminders,
  markReminderRead,
} from "~/modules/reminders/reminders.service";

import type { Route } from "./+types/calendar";

type ActionData = FieldErrorResponse | undefined;

export const middleware: Route.MiddlewareFunction[] = [
  requireUserMiddleware,
  requireConsentsMiddleware,
  csrfCookieMiddleware,
];

export const meta: Route.MetaFunction = () => [{ title: "Calendar | SakuStudi" }];

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

function monthRange(param: string | null): { monthKey: string; from: Date; to: Date } {
  const nowJakarta = toZonedTime(new Date(), DEADLINE_TIME_ZONE);
  const fallback = `${nowJakarta.getUTCFullYear()}-${String(
    nowJakarta.getUTCMonth() + 1,
  ).padStart(2, "0")}`;
  const monthKey = param && MONTH_PATTERN.test(param) ? param : fallback;
  const [year, month] = monthKey.split("-").map(Number);
  const from = fromZonedTime(
    new Date(Date.UTC(year, month - 1, 1, 0, 0)),
    DEADLINE_TIME_ZONE,
  );
  const to = fromZonedTime(
    new Date(Date.UTC(year, month, 1, 0, 0)),
    DEADLINE_TIME_ZONE,
  );
  return { monthKey, from, to };
}

function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatMonth(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
}

function formatEventTime(date: Date): string {
  const zoned = toZonedTime(date, DEADLINE_TIME_ZONE);
  return zoned.toLocaleTimeString("en-US", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDayLabel(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = context.get(sessionUserContext);
  if (!user) throw redirect("/login");

  const { monthKey, from, to } = monthRange(
    new URL(request.url).searchParams.get("month"),
  );
  const [days, unreadReminders] = await Promise.all([
    getCalendarData(user.id, from, to),
    listUnreadInAppReminders(user.id, 10),
  ]);

  return {
    prevMonth: shiftMonth(monthKey, -1),
    nextMonth: shiftMonth(monthKey, 1),
    monthLabel: formatMonth(monthKey),
    days,
    unreadReminders,
    csrfToken: context.get(csrfTokenContext) || createCsrfToken(user.id),
    user: { name: user.name ?? undefined, email: user.email },
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = context.get(sessionUserContext);
  if (!user) throw redirect("/login");

  await assertCsrfMutation(request, user.id);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  try {
    if (intent === "create-event") {
      const parsed = parseForm(createCalendarEventSchema, formData);
      if (isFieldErrorResponse(parsed)) return data(parsed, { status: 400 });
      await createCalendarEvent(user.id, parsed);
      throw redirect(request.url);
    }
    if (intent === "delete-event") {
      const parsed = parseForm(deleteCalendarEventSchema, formData);
      if (isFieldErrorResponse(parsed)) return data(parsed, { status: 400 });
      await deleteCalendarEventFromInput(user.id, parsed);
      throw redirect(request.url);
    }
    if (intent === "mark-reminder-read") {
      const reminderId = String(formData.get("reminderId") ?? "");
      if (reminderId) {
        await markReminderRead(user.id, reminderId);
      }
      throw redirect(request.url);
    }

    return data<FieldErrorResponse>(
      { ok: false, fieldErrors: {}, formErrors: ["Unknown action."] },
      { status: 400 },
    );
  } catch (error) {
    if (error instanceof Response) throw error;
    return toFormActionResponse(error);
  }
}

function ReminderBell({
  reminders,
  csrfToken,
}: {
  reminders: Array<{ id: string; title: string; message: string | null; remindAt: string | Date }>;
  csrfToken: string;
}) {
  if (reminders.length === 0) {
    return null;
  }
  return (
    <section className="rounded-card border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold">Unread reminders</h2>
      <ul className="mt-3 space-y-2">
        {reminders.map((reminder) => (
          <li
            key={reminder.id}
            className="flex items-start justify-between gap-3 rounded-control bg-canvas px-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{reminder.title}</p>
              {reminder.message && (
                <p className="truncate text-xs text-muted">{reminder.message}</p>
              )}
            </div>
            <form method="post">
              <input type="hidden" name="intent" value="mark-reminder-read" />
              <input type="hidden" name="reminderId" value={reminder.id} />
              <input type="hidden" name="csrfToken" value={csrfToken} />
              <button
                type="submit"
                className="shrink-0 rounded-input bg-primary px-3 py-1.5 text-xs font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                Mark read
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}

function DayList({
  days,
  csrfToken,
}: {
  days: CalendarDay[];
  csrfToken: string;
}) {
  if (days.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-border bg-surface px-6 py-10 text-center text-sm text-muted">
        Nothing scheduled this month.
      </p>
    );
  }
  return (
    <ol className="space-y-3">
      {days.map((day) => (
        <li key={day.date} className="rounded-card border border-border bg-surface p-4">
          <h3 className="text-sm font-semibold text-ink">{formatDayLabel(day.date)}</h3>
          <ul className="mt-2 space-y-1.5">
            {day.deadlines.map((deadline) => (
              <li key={`a-${deadline.activityId}`} className="flex items-center gap-2 text-sm">
                <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-primary" />
                <Link
                  to={`/activities/${deadline.activityId}`}
                  className="min-w-0 truncate text-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  {deadline.title}
                </Link>
                {deadline.courseName && (
                  <span className="truncate text-xs text-muted">{deadline.courseName}</span>
                )}
              </li>
            ))}
            {day.events.map((event) => (
              <li key={`e-${event.id}`} className="flex items-center gap-2 text-sm">
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full border border-ink bg-transparent"
                />
                <span className="min-w-0 truncate text-ink">{event.title}</span>
                <span className="shrink-0 text-xs text-muted">
                  {formatEventTime(new Date(event.startsAt))}–
                  {formatEventTime(new Date(event.endsAt))}
                  {event.location ? ` · ${event.location}` : ""}
                </span>
                <form method="post" className="shrink-0">
                  <input type="hidden" name="intent" value="delete-event" />
                  <input type="hidden" name="eventId" value={event.id} />
                  <input type="hidden" name="csrfToken" value={csrfToken} />
                  <button
                    type="submit"
                    aria-label={`Delete ${event.title}`}
                    className="text-xs text-muted underline underline-offset-2 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    Delete
                  </button>
                </form>
              </li>
            ))}
            {day.deadlines.length === 0 && day.events.length === 0 && (
              <li className="text-xs text-muted">Nothing scheduled</li>
            )}
          </ul>
        </li>
      ))}
    </ol>
  );
}

function inputClass(fieldErrors: Record<string, string[]> | undefined, field: string) {
  return [
    "w-full rounded-input border bg-canvas px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
    fieldErrors?.[field] ? "border-danger" : "border-border",
  ].join(" ");
}

export default function Calendar({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<ActionData>();
  const { csrfToken, user, prevMonth, nextMonth, monthLabel } = loaderData;

  return (
    <AppShell user={user} activeRoute="/calendar">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-ink">{monthLabel}</h1>
        <nav aria-label="Month" className="flex items-center gap-2">
          <Link
            to={`/calendar?month=${prevMonth}`}
            className="rounded-input border border-border px-3 py-1.5 text-sm text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            ← Previous
          </Link>
          <Link
            to="/calendar"
            className="rounded-input border border-border px-3 py-1.5 text-sm text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Today
          </Link>
          <Link
            to={`/calendar?month=${nextMonth}`}
            className="rounded-input border border-border px-3 py-1.5 text-sm text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Next →
          </Link>
        </nav>
      </header>

      <div className="mt-6 space-y-6">
        <ReminderBell reminders={loaderData.unreadReminders} csrfToken={csrfToken} />

        <section className="rounded-card border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">Add event</h2>
          <form method="post" className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="intent" value="create-event" />
            <input type="hidden" name="csrfToken" value={csrfToken} />
            <label className="contents">
              <span className="sr-only">Title</span>
              <input
                name="title"
                type="text"
                placeholder="Event title"
                className={inputClass(actionData?.fieldErrors, "title")}
              />
            </label>
            <label className="contents">
              <span className="sr-only">Type</span>
              <select
                name="eventType"
                defaultValue="other"
                className={inputClass(actionData?.fieldErrors, "eventType")}
              >
                {Object.entries(CALENDAR_EVENT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="contents">
              <span className="sr-only">Starts at</span>
              <input
                name="startsAt"
                type="datetime-local"
                className={inputClass(actionData?.fieldErrors, "startsAt")}
              />
            </label>
            <label className="contents">
              <span className="sr-only">Ends at</span>
              <input
                name="endsAt"
                type="datetime-local"
                className={inputClass(actionData?.fieldErrors, "endsAt")}
              />
            </label>
            <label className="contents">
              <span className="sr-only">Location</span>
              <input
                name="location"
                type="text"
                placeholder="Location (optional)"
                className={inputClass(actionData?.fieldErrors, "location")}
              />
            </label>
            <button
              type="submit"
              className="rounded-input bg-primary px-4 py-2 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              Add event
            </button>
          </form>
          {actionData?.formErrors && actionData.formErrors.length > 0 && (
            <p className="mt-2 text-sm text-danger" role="alert">
              {actionData.formErrors.join(" ")}
            </p>
          )}
          <p className="mt-3 text-xs text-muted">
            Times are shown in Asia/Jakarta (WIB). Activity deadlines appear
            automatically.
          </p>
        </section>

        <DayList days={loaderData.days} csrfToken={csrfToken} />
      </div>
    </AppShell>
  );
}
