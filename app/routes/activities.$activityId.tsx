import { data, redirect, Link, useActionData } from "react-router";

import { AttachmentList } from "~/components/files/AttachmentList";
import { AttachmentPicker } from "~/components/files/AttachmentPicker";
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
import { parseForm } from "~/lib/validation/form-data";
import { AppError } from "~/lib/errors/AppError";
import {
  formatDeadline,
  deriveActivityState,
} from "~/lib/time/deadlines";
import { getActivity, setActivityStatusFromInput } from "~/modules/activities/activities.service";
import { ACTIVITY_TYPE_LABELS, setActivityStatusSchema } from "~/modules/activities/activities.schema";
import {
  createAttachment,
  deleteAttachment,
  formatBytes,
  listParentAttachments,
  maxUploadBytes,
} from "~/modules/files/files.service";
import {
  attachmentDeleteSchema,
  attachmentUploadSchema,
} from "~/modules/files/files.schema";

import type { Route } from "./+types/activities.$activityId";

type ActionData = FieldErrorResponse | undefined;

export const middleware: Route.MiddlewareFunction[] = [
  requireUserMiddleware,
  requireConsentsMiddleware,
  csrfCookieMiddleware,
];

const STATUS_LABELS = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
  overdue: "Overdue",
} as const;

export async function loader({ params, context }: Route.LoaderArgs) {
  const user = context.get(sessionUserContext);
  if (!user) throw redirect("/login");

  let activity;
  try {
    activity = await getActivity(user.id, params.activityId ?? "");
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") {
      throw new Response(null, { status: 404 });
    }
    throw error;
  }
  const attachments = (
    await listParentAttachments(user.id, { kind: "activity", id: activity.id })
  ).map((attachment) => ({
    id: attachment.id,
    filename: attachment.filename,
    sizeLabel: formatBytes(attachment.sizeBytes ?? 0),
    mimeType: attachment.mimeType,
  }));

  return {
    activity,
    now: new Date().toISOString(),
    attachments,
    maxUploadLabel: formatBytes(maxUploadBytes()),
    csrfToken: context.get(csrfTokenContext) || createCsrfToken(user.id),
    user: { name: user.name ?? undefined, email: user.email },
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const user = context.get(sessionUserContext);
  if (!user) throw redirect("/login");

  await assertCsrfMutation(request, user.id);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  try {
    if (intent === "set-status") {
      const parsed = parseForm(setActivityStatusSchema, formData);
      if (isFieldErrorResponse(parsed)) return data(parsed, { status: 400 });
      await setActivityStatusFromInput(user.id, parsed);
      throw redirect(request.url);
    }
    if (intent === "attach-file") {
      const parsed = parseForm(attachmentUploadSchema, formData);
      if (isFieldErrorResponse(parsed)) return data(parsed, { status: 400 });
      await createAttachment(
        user.id,
        { kind: "activity", id: params.activityId ?? "" },
        parsed.file,
      );
      // Canonical URL, not request.url: multipart submissions carry a .data
      // suffix React Router would otherwise follow into a 404 document load.
      throw redirect(`/activities/${params.activityId ?? ""}`);
    }
    if (intent === "delete-attachment") {
      const parsed = parseForm(attachmentDeleteSchema, formData);
      if (isFieldErrorResponse(parsed)) return data(parsed, { status: 400 });
      await deleteAttachment(user.id, parsed.attachmentId);
      throw redirect(`/activities/${params.activityId ?? ""}`);
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

export default function ActivityDetail({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<ActionData>();
  const { activity, attachments, maxUploadLabel, csrfToken, user } = loaderData;
  const state = deriveActivityState(activity, new Date(loaderData.now));

  void actionData;

  const statusClass =
    state === "completed"
      ? "bg-success/20"
      : state === "overdue"
        ? "bg-danger/20"
        : state === "in_progress"
          ? "bg-info/20"
          : "bg-canvas";

  return (
    <AppShell user={user} activeRoute="/activities">
      <main className="mx-auto max-w-3xl">
        <Link
          to="/activities"
          className="text-sm text-muted underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus hover:text-ink"
        >
          ← All activities
        </Link>

        <header className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">{activity.title}</h1>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium text-ink ${statusClass}`}
              >
                {STATUS_LABELS[state]}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted">
              {ACTIVITY_TYPE_LABELS[activity.type]}
              {activity.dueDate
                ? ` · Due ${formatDeadline(activity.dueDate)}`
                : " · No deadline"}
            </p>
          </div>
          <Link
            to={`/activities/${activity.id}/edit`}
            className="inline-flex min-h-11 items-center justify-center rounded-input border border-border bg-surface px-4 py-2.5 text-sm font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus hover:bg-canvas"
          >
            Edit activity
          </Link>
        </header>

        {activity.details && (
          <section className="mt-6 rounded-card border border-border bg-surface p-6">
            <h2 className="text-sm font-semibold">Details</h2>
            <p className="mt-2 whitespace-pre-wrap text-sm text-ink">
              {activity.details}
            </p>
          </section>
        )}

        {activity.link && (
          <section className="mt-6 rounded-card border border-border bg-surface p-6">
            <h2 className="text-sm font-semibold">Link</h2>
            <a
              href={activity.link}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-2 inline-block max-w-full break-all text-sm font-medium text-ink underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus hover:text-muted"
            >
              {activity.link}
            </a>
          </section>
        )}

        <section className="mt-6 rounded-card border border-border bg-surface p-6">
          <h2 className="text-sm font-semibold">Status</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            {state === "completed" ? (
              <form method="post">
                <input type="hidden" name="intent" value="set-status" />
                <input type="hidden" name="activityId" value={activity.id} />
                <input type="hidden" name="status" value="pending" />
                <input type="hidden" name="csrfToken" value={csrfToken} />
                <button
                  type="submit"
                  className="min-h-11 rounded-input border border-border bg-canvas px-4 py-2.5 text-sm font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  Reopen
                </button>
              </form>
            ) : (
              <>
                {state === "not_started" && (
                  <form method="post">
                    <input type="hidden" name="intent" value="set-status" />
                    <input type="hidden" name="activityId" value={activity.id} />
                    <input type="hidden" name="status" value="in_progress" />
                    <input type="hidden" name="csrfToken" value={csrfToken} />
                    <button
                      type="submit"
                      className="min-h-11 rounded-input border border-border bg-canvas px-4 py-2.5 text-sm font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    >
                      Mark in progress
                    </button>
                  </form>
                )}
                <form method="post">
                  <input type="hidden" name="intent" value="set-status" />
                  <input type="hidden" name="activityId" value={activity.id} />
                  <input type="hidden" name="status" value="completed" />
                  <input type="hidden" name="csrfToken" value={csrfToken} />
                  <button
                    type="submit"
                    className="min-h-11 rounded-input bg-primary px-4 py-2.5 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    Mark complete
                  </button>
                </form>
              </>
            )}
          </div>
        </section>

        <section
          aria-labelledby="activity-files-heading"
          className="mt-6 rounded-card border border-border bg-surface p-6"
        >
          <h2 id="activity-files-heading" className="text-sm font-semibold">
            Files
          </h2>
          <AttachmentList items={attachments} csrfToken={csrfToken} />
          <div className="mt-4 border-t border-border pt-4">
            <AttachmentPicker
              csrfToken={csrfToken}
              errors={actionData}
              maxUploadLabel={maxUploadLabel}
            />
          </div>
        </section>
      </main>
    </AppShell>
  );
}
