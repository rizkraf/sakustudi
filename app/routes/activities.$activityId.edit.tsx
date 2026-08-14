import { data, redirect, Link, useActionData } from "react-router";

import { ActivityForm } from "~/components/activities/ActivityForm";
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
import { getActivity, updateActivity } from "~/modules/activities/activities.service";
import { updateActivitySchema } from "~/modules/activities/activities.schema";
import { listOwnedCourses } from "~/modules/courses/courses.repository";

import type { Route } from "./+types/activities.$activityId.edit";

type ActionData = FieldErrorResponse | undefined;

export const middleware: Route.MiddlewareFunction[] = [
  requireUserMiddleware,
  requireConsentsMiddleware,
  csrfCookieMiddleware,
];

export const meta: Route.MetaFunction = () => [
  { title: "Edit Activity | SakuStudi" },
];

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
  const courses = await listOwnedCourses(user.id);

  return {
    activity,
    courses,
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
    if (intent === "update") {
      const parsed = parseForm(updateActivitySchema, formData);
      if (isFieldErrorResponse(parsed)) return data(parsed, { status: 400 });
      await updateActivity(user.id, params.activityId ?? "", parsed);
      throw redirect(`/activities/${params.activityId}`);
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

export default function EditActivity({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<ActionData>();
  const { activity, courses, csrfToken, user } = loaderData;

  void actionData;

  return (
    <AppShell user={user} activeRoute="/activities">
      <main className="mx-auto max-w-3xl">
        <Link
          to={`/activities/${activity.id}`}
          className="text-sm text-muted underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus hover:text-ink"
        >
          ← Back to activity
        </Link>
        <h1 className="mt-3 text-xl font-semibold text-ink">Edit activity</h1>
        <section className="mt-6 rounded-card border border-border bg-surface p-6">
          <ActivityForm
            courses={courses}
            csrfToken={csrfToken}
            submitLabel="Save changes"
            pendingLabel="Saving…"
            intent="update"
            defaults={{
              title: activity.title,
              type: activity.type,
              courseId: activity.courseId,
              deadline: activity.dueDate,
              details: activity.details,
              link: activity.link,
            }}
          />
        </section>
      </main>
    </AppShell>
  );
}
