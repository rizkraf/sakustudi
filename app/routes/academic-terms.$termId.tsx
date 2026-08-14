import { data, redirect, Form, Link, useActionData } from "react-router";
import { z } from "zod";

import { CoursePicker } from "~/components/catalog/CoursePicker";
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
import {
  createCourseFromCatalog,
  createCustomCourse,
  customCourseSchema,
  listCatalogCourses,
} from "~/modules/catalog/catalog.service";
import { listOwnedTermCourses } from "~/modules/catalog/catalog.repository";
import { setActiveTerm } from "~/modules/academic-terms/terms.service";
import { findOwnedTerm } from "~/modules/academic-terms/terms.repository";

import type { Route } from "./+types/academic-terms.$termId";

type ActionData = FieldErrorResponse | undefined;

export const middleware: Route.MiddlewareFunction[] = [
  requireUserMiddleware,
  requireConsentsMiddleware,
  csrfCookieMiddleware,
];

const addCatalogCoursesSchema = z.object({
  courseIds: z.preprocess(
    (value) =>
      value === undefined || value === ""
        ? []
        : Array.isArray(value)
          ? value
          : [value],
    z.array(z.string().uuid("A selected course is not valid.")).max(100),
  ),
});

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export const meta: Route.MetaFunction = ({ loaderData }) => [
  {
    title: loaderData
      ? `${loaderData.term.name} | SakuStudi`
      : "Term | SakuStudi",
  },
];

export async function loader({ params, context }: Route.LoaderArgs) {
  const user = context.get(sessionUserContext);
  if (!user) throw redirect("/login");

  const term = await findOwnedTerm(user.id, params.termId ?? "");
  if (!term) {
    throw new Response(null, { status: 404 });
  }

  const [courses, catalogCourses] = await Promise.all([
    listOwnedTermCourses(user.id, term.id),
    listCatalogCourses(user.id, {}),
  ]);

  return {
    term,
    courses,
    catalogCourses,
    csrfToken: context.get(csrfTokenContext) || createCsrfToken(user.id),
  };
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const user = context.get(sessionUserContext);
  if (!user) throw redirect("/login");

  await assertCsrfMutation(request, user.id);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");
  const termId = params.termId ?? "";

  try {
    if (intent === "activate") {
      await setActiveTerm(user.id, termId);
      throw redirect(`/academic-terms/${termId}`);
    }

    if (intent === "add-catalog") {
      const parsed = parseForm(addCatalogCoursesSchema, formData);
      if (isFieldErrorResponse(parsed)) return data(parsed, { status: 400 });
      for (const courseId of parsed.courseIds) {
        await createCourseFromCatalog(user.id, termId, courseId);
      }
      throw redirect(`/academic-terms/${termId}`);
    }

    if (intent === "add-custom") {
      const parsed = parseForm(customCourseSchema, formData);
      if (isFieldErrorResponse(parsed)) return data(parsed, { status: 400 });
      await createCustomCourse(user.id, termId, parsed);
      throw redirect(`/academic-terms/${termId}`);
    }

    return data<FieldErrorResponse>(
      { ok: false, fieldErrors: {}, formErrors: ["Unknown action."] },
      { status: 400 },
    );
  } catch (error) {
    // redirect() throws a Response; never convert it into an error body.
    if (error instanceof Response) throw error;
    return toFormActionResponse(error);
  }
}

export default function AcademicTermDetail({
  loaderData,
}: Route.ComponentProps) {
  const actionData = useActionData<ActionData>();
  const { term, courses, catalogCourses, csrfToken } = loaderData;
  const isActive = term.status === "active";
  const formError =
    actionData && actionData.formErrors.length > 0
      ? actionData.formErrors[0]
      : undefined;

  return (
    <main className="mx-auto max-w-3xl px-page pb-24 pt-6 text-ink lg:pb-10 lg:pt-8">
      <Link
        to="/academic-terms"
        className="text-sm text-muted underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus hover:text-ink"
      >
        ← All terms
      </Link>

      <header className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{term.name}</h1>
        {isActive ? (
          <span className="rounded-full bg-success/20 px-2 py-0.5 text-xs font-medium text-ink">
            Active
          </span>
        ) : (
          <span className="rounded-full bg-canvas px-2 py-0.5 text-xs text-muted">
            Archived
          </span>
        )}
      </header>
      <p className="mt-1 text-sm text-muted">
        {formatDate(term.startDate)} – {formatDate(term.endDate)}
      </p>

      {formError && (
        <p
          role="alert"
          className="mt-4 rounded-input border border-danger/40 bg-danger/10 p-3 text-sm text-ink"
        >
          {formError}
        </p>
      )}

      {!isActive && (
        <Form method="post" className="mt-4">
          <input type="hidden" name="intent" value="activate" />
          <input type="hidden" name="csrfToken" value={csrfToken} />
          <button
            type="submit"
            className="min-h-11 rounded-input bg-primary px-4 py-2.5 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Make active
          </button>
        </Form>
      )}

      <section className="mt-6 rounded-card border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold">Courses ({courses.length})</h2>
        {courses.length === 0 && (
          <p className="mt-3 rounded-input border border-border bg-canvas px-3 py-4 text-center text-sm text-muted">
            No courses in this term yet. Add some below.
          </p>
        )}
        <ul className="mt-3 space-y-2">
          {courses.map((course) => (
            <li
              key={course.id}
              className="flex flex-wrap items-center gap-2 rounded-input border border-border bg-canvas px-3 py-2"
            >
              <span className="min-w-0 text-sm">
                <span className="font-medium text-ink">{course.name}</span>
                {course.code && (
                  <span className="ml-2 font-mono text-xs text-muted">
                    {course.code}
                  </span>
                )}
                {course.catalogId && (
                  <span className="ml-2 rounded-full bg-primary/20 px-2 py-0.5 text-xs">
                    UT catalog
                  </span>
                )}
              </span>
              {course.credits !== null && (
                <span className="ml-auto text-xs text-muted">
                  {course.credits} credits
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6 rounded-card border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold">Add courses</h2>
        <Form method="post" className="mt-4 space-y-4">
          <input type="hidden" name="intent" value="add-catalog" />
          <input type="hidden" name="csrfToken" value={csrfToken} />
          <CoursePicker
            courses={catalogCourses}
            name="courseIds"
            label="From the UT catalog"
            emptyMessage="No catalog courses found."
          />
          <button
            type="submit"
            className="min-h-11 rounded-input bg-primary px-4 py-2.5 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Add selected courses
          </button>
        </Form>

        <Form
          method="post"
          className="mt-6 space-y-3 border-t border-border pt-4"
        >
          <input type="hidden" name="intent" value="add-custom" />
          <input type="hidden" name="csrfToken" value={csrfToken} />
          <p className="text-sm font-medium">Custom course</p>
          <label className="block">
            <span className="text-sm font-medium">Course name</span>
            <input
              name="name"
              type="text"
              required
              className="mt-1 w-full rounded-input border border-border bg-canvas px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Course code</span>
            <input
              name="code"
              type="text"
              className="mt-1 w-full rounded-input border border-border bg-canvas px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            />
          </label>
          {actionData?.fieldErrors.name && (
            <p role="alert" className="text-sm text-danger">
              {actionData.fieldErrors.name[0]}
            </p>
          )}
          <button
            type="submit"
            className="min-h-11 rounded-input border border-border bg-canvas px-4 py-2.5 text-sm font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Add custom course
          </button>
        </Form>
      </section>
    </main>
  );
}
