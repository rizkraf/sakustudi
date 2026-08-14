import { data, redirect, useActionData } from "react-router";

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
import { isSmtpCapable } from "~/lib/mail/mailer";
import {
  assertCsrfMutation,
  createCsrfToken,
  csrfCookieMiddleware,
} from "~/lib/request/security.server";
import { parseForm } from "~/lib/validation/form-data";
import { z } from "zod";
import {
  getReminderPreferences,
  listRecentReminders,
  markReminderRead,
  setReminderPreferences,
} from "~/modules/reminders/reminders.service";

import type { Route } from "./+types/settings.reminders";

type ActionData = FieldErrorResponse | undefined;

export const middleware: Route.MiddlewareFunction[] = [
  requireUserMiddleware,
  requireConsentsMiddleware,
  csrfCookieMiddleware,
];

export const meta: Route.MetaFunction = () => [
  { title: "Reminder Settings | SakuStudi" },
];

const toggleEmailSchema = z.object({
  emailEnabled: z.enum(["on", "off"]),
});

const markReadSchema = z.object({
  reminderId: z.string().uuid("Reminder is not valid."),
});

export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(sessionUserContext);
  if (!user) throw redirect("/login");

  const [preferences, recent] = await Promise.all([
    getReminderPreferences(user.id),
    listRecentReminders(user.id, 20),
  ]);

  return {
    preferences,
    smtpCapable: isSmtpCapable(),
    recent,
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
    if (intent === "toggle-email") {
      const parsed = parseForm(toggleEmailSchema, formData);
      if (isFieldErrorResponse(parsed)) return data(parsed, { status: 400 });
      await setReminderPreferences(user.id, {
        emailEnabled: parsed.emailEnabled === "on",
      });
      throw redirect(request.url);
    }
    if (intent === "mark-read") {
      const parsed = parseForm(markReadSchema, formData);
      if (isFieldErrorResponse(parsed)) return data(parsed, { status: 400 });
      await markReminderRead(user.id, parsed.reminderId);
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

function formatReminderTime(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  sent: "Sent",
  cancelled: "Cancelled",
  failed: "Failed",
};

export default function ReminderSettings({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<ActionData>();
  const { csrfToken, user, preferences, smtpCapable, recent } = loaderData;

  return (
    <AppShell user={user} activeRoute="/settings/profile">
      <h1 className="text-lg font-semibold text-ink">Reminder settings</h1>

      <section className="mt-6 rounded-card border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">Delivery</h2>
        {smtpCapable ? (
          <form method="post" className="mt-3 flex items-center justify-between gap-3">
            <input type="hidden" name="intent" value="toggle-email" />
            <input type="hidden" name="csrfToken" value={csrfToken} />
            <div>
              <p className="text-sm font-medium text-ink">Email reminders</p>
              <p className="text-xs text-muted">
                Receive deadline reminders by email in addition to in-app.
              </p>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
              <span className="sr-only">Email reminders</span>
              <select
                name="emailEnabled"
                defaultValue={preferences.emailEnabled ? "on" : "off"}
                className="rounded-input border border-border bg-canvas px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <option value="off">Off</option>
                <option value="on">On</option>
              </select>
              <button
                type="submit"
                className="rounded-input bg-primary px-4 py-2 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                Save
              </button>
            </label>
          </form>
        ) : (
          <p className="mt-3 text-sm text-muted">
            Email reminders are unavailable because no SMTP transport is
            configured on this server. In-app reminders are always on.
          </p>
        )}
        {actionData?.formErrors && actionData.formErrors.length > 0 && (
          <p className="mt-2 text-sm text-danger" role="alert">
            {actionData.formErrors.join(" ")}
          </p>
        )}
      </section>

      <section className="mt-6 rounded-card border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">Recent reminders</h2>
        {recent.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            No reminders yet. They appear after you create activities with
            deadlines.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {recent.map((reminder) => (
              <li
                key={reminder.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {reminder.title}
                    <span className="ml-2 text-xs font-normal text-muted">
                      {reminder.channel === "email" ? "Email" : "In-app"} ·{" "}
                      {STATUS_LABELS[reminder.status] ?? reminder.status}
                    </span>
                  </p>
                  <p className="truncate text-xs text-muted">
                    {formatReminderTime(reminder.remindAt)}
                    {reminder.message ? ` — ${reminder.message}` : ""}
                  </p>
                </div>
                {reminder.status === "sent" &&
                  reminder.channel === "in_app" &&
                  reminder.readAt === null && (
                    <form method="post" className="shrink-0">
                      <input type="hidden" name="intent" value="mark-read" />
                      <input type="hidden" name="reminderId" value={reminder.id} />
                      <input type="hidden" name="csrfToken" value={csrfToken} />
                      <button
                        type="submit"
                        className="rounded-input bg-primary px-3 py-1.5 text-xs font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                      >
                        Mark read
                      </button>
                    </form>
                  )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
