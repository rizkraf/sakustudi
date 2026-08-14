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
import { findActiveTerm } from "~/modules/academic-terms/terms.repository";
import { listOwnedTermCourses } from "~/modules/catalog/catalog.repository";
import { createActivity } from "~/modules/activities/activities.service";
import { createActivitySchema } from "~/modules/activities/activities.schema";

import type { Route } from "./+types/activities.new";

type ActionData = FieldErrorResponse | undefined;

export const middleware: Route.MiddlewareFunction[] = [
  requireUserMiddleware,
  requireConsentsMiddleware,
  csrfCookieMiddleware,
];

export const meta: Route.MetaFunction = () => [
  { title: "New Activity | SakuStudi" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = context.get(sessionUserContext);
  if (!user) throw redirect("/login");

  const activeTerm = await findActiveTerm(user.id);
  if (!activeTerm) {
    return {
      noTerm: true as const,
      csrfToken: context.get(csrfTokenContext) || createCsrfToken(user.id),
      user: { name: user.name ?? undefined, email: user.email },
    };
  }

  const courses = await listOwnedTermCourses(user.id, activeTerm.id);
  const preselectCourseId = new URL(request.url).searchParams.get("courseId");

  return {
    noTerm: false as const,
    term: activeTerm,
    courses,
    preselectCourseId,
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
    if (intent === "create") {
      const parsed = parseForm(createActivitySchema, formData);
      if (isFieldErrorResponse(parsed)) return data(parsed, { status: 400 });
      await createActivity(user.id, parsed);
      throw redirect("/activities");
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

export default function NewActivity({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<ActionData>();
  const { csrfToken, user } = loaderData;

  void actionData;

  return (
    <AppShell user={user} activeRoute="/activities">
      <main className="mx-auto max-w-3xl">
        <Link
          to="/activities"
          className="text-sm text-muted underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus hover:text-ink"
        >
          ← All activities
        </Link>

        {loaderData.noTerm ? (
          <section className="mt-6 rounded-card border border-dashed border-border bg-surface px-6 py-12 text-center">
            <h1 className="text-lg font-semibold text-ink">No active term</h1>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
              Create your active academic term before adding activities.
            </p>
            <Link
              to="/academic-terms"
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-input bg-primary px-5 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              Go to academic terms
            </Link>
          </section>
        ) : (
          <>
            <h1 className="mt-3 text-xl font-semibold text-ink">New activity</h1>
            <p className="mt-1 text-sm text-muted">
              Add an activity to {loaderData.term.name}.
            </p>
            <section className="mt-6 rounded-card border border-border bg-surface p-6">
              <ActivityForm
                courses={loaderData.courses}
                csrfToken={csrfToken}
                submitLabel="Create activity"
                pendingLabel="Creating…"
                defaults={
                  loaderData.preselectCourseId &&
                  loaderData.courses.some(
                    (course) => course.id === loaderData.preselectCourseId,
                  )
                    ? {
                        title: "",
                        type: "assignment",
                        courseId: loaderData.preselectCourseId,
                        deadline: null,
                        details: null,
                        link: null,
                      }
                    : undefined
                }
              />
            </section>
          </>
        )}
      </main>
    </AppShell>
  );
}
