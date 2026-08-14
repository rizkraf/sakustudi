import { data, redirect, useActionData } from "react-router";

import { ActivityCard } from "~/components/activities/ActivityCard";
import { DashboardSummary } from "~/components/dashboard/DashboardSummary";
import { ProgressCard } from "~/components/dashboard/ProgressCard";
import { UpcomingDeadlines } from "~/components/dashboard/UpcomingDeadlines";
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
import { setActivityStatusFromInput } from "~/modules/activities/activities.service";
import { setActivityStatusSchema } from "~/modules/activities/activities.schema";
import { getDashboardData } from "~/modules/dashboard/dashboard.service";

import type { Route } from "./+types/dashboard";

type ActionData = FieldErrorResponse | undefined;

export const middleware: Route.MiddlewareFunction[] = [
  requireUserMiddleware,
  requireConsentsMiddleware,
  csrfCookieMiddleware,
];

export const meta: Route.MetaFunction = () => [
  { title: "Dashboard | SakuStudi" },
];

export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(sessionUserContext);
  if (!user) throw redirect("/login");

  const dashboard = await getDashboardData(user.id);
  return {
    ...dashboard,
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
      // Post-redirect-get revalidates the dashboard loader.
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

export default function Dashboard({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<ActionData>();
  const now = new Date(loaderData.now);
  const { activeTerm, courses, upcomingActivities, overdueActivities } =
    loaderData;

  void actionData;

  return (
    <AppShell user={loaderData.user} activeRoute="/dashboard">
      <DashboardSummary
        activeTermName={activeTerm?.name ?? null}
        courseCount={loaderData.courseCount}
        overdueCount={overdueActivities.length}
        upcomingCount={upcomingActivities.length}
      />

      <section className="mt-6">
        <h2 className="text-sm font-semibold">Upcoming deadlines</h2>
        <div className="mt-3">
          <UpcomingDeadlines
            activities={upcomingActivities}
            now={now}
            csrfToken={loaderData.csrfToken}
          />
        </div>
      </section>

      {overdueActivities.length > 0 && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-danger">Overdue</h2>
          <ul className="mt-3 space-y-2">
            {overdueActivities.map((activity) => (
              <li key={activity.id}>
                <ActivityCard
                  activity={activity}
                  now={now}
                  csrfToken={loaderData.csrfToken}
                  to={`/activities/${activity.id}`}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6">
        <h2 className="text-sm font-semibold">Course progress</h2>
        {courses.length === 0 ? (
          <p className="mt-3 rounded-card border border-dashed border-border bg-surface px-6 py-8 text-center text-sm text-muted">
            No courses in this term yet.
          </p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {courses.map(({ course, progress }) => (
              <ProgressCard key={course.id} course={course} progress={progress} />
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
