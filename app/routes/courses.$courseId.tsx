import { data, redirect, Link, useActionData } from "react-router";

import { ActivityCard } from "~/components/activities/ActivityCard";
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
import { getCourseDetail } from "~/modules/courses/courses.service";
import { setActivityStatusFromInput } from "~/modules/activities/activities.service";
import { setActivityStatusSchema } from "~/modules/activities/activities.schema";

import type { Route } from "./+types/courses.$courseId";

type ActionData = FieldErrorResponse | undefined;

export const middleware: Route.MiddlewareFunction[] = [
  requireUserMiddleware,
  requireConsentsMiddleware,
  csrfCookieMiddleware,
];

export const meta: Route.MetaFunction = ({ loaderData }) => [
  {
    title: loaderData
      ? `${loaderData.course.name} | SakuStudi`
      : "Course | SakuStudi",
  },
];

export async function loader({ params, context }: Route.LoaderArgs) {
  const user = context.get(sessionUserContext);
  if (!user) throw redirect("/login");

  let detail;
  try {
    detail = await getCourseDetail(user.id, params.courseId ?? "");
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") {
      throw new Response(null, { status: 404 });
    }
    throw error;
  }
  return {
    ...detail,
    now: new Date().toISOString(),
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
    if (intent === "set-status") {
      const parsed = parseForm(setActivityStatusSchema, formData);
      if (isFieldErrorResponse(parsed)) return data(parsed, { status: 400 });
      await setActivityStatusFromInput(user.id, parsed);
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

export default function CourseDetail({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<ActionData>();
  const { course, progress, completedCount, totalCount, activities, csrfToken, user } =
    loaderData;

  void actionData;

  return (
    <AppShell user={user} activeRoute="/academic-terms">
      <main className="mx-auto max-w-3xl">
        {course.termId ? (
          <Link
            to={`/academic-terms/${course.termId}`}
            className="text-sm text-muted underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus hover:text-ink"
          >
            ← Back to term
          </Link>
        ) : (
          <Link
            to="/academic-terms"
            className="text-sm text-muted underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus hover:text-ink"
          >
            ← All terms
          </Link>
        )}

        <header className="mt-3">
          <h1 className="text-xl font-semibold text-ink">{course.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {course.code ? `${course.code} · ` : ""}
            {completedCount} of {totalCount} activities complete · {progress}%
          </p>
        </header>

        <div
          role="progressbar"
          aria-label={`${course.name} progress`}
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-4 h-2 overflow-hidden rounded-full bg-canvas"
        >
          <div
            className="h-full rounded-full bg-success"
            style={{ width: `${progress}%` }}
          />
        </div>

        <section className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Activities</h2>
            <Link
              to={`/activities/new?courseId=${course.id}`}
              className="inline-flex min-h-11 items-center justify-center rounded-input bg-primary px-4 py-2.5 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus hover:bg-primary/90"
            >
              Add activity
            </Link>
          </div>
          {activities.length === 0 ? (
            <p className="mt-3 rounded-card border border-dashed border-border bg-surface px-6 py-8 text-center text-sm text-muted">
              No activities for this course yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {activities.map((activity) => (
                <li key={activity.id}>
                  <ActivityCard
                    activity={activity}
                    now={new Date(loaderData.now)}
                    csrfToken={csrfToken}
                    to={`/activities/${activity.id}`}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </AppShell>
  );
}
