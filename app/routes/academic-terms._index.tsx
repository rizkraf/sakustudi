import { data, redirect, Form, Link, useActionData } from "react-router";

import { csrfTokenContext, sessionUserContext } from "~/context";
import { requireConsentsMiddleware, requireUserMiddleware } from "~/lib/auth/session";
import { isFieldErrorResponse, type FieldErrorResponse } from "~/lib/errors/response";
import {
  assertCsrfMutation,
  createCsrfToken,
  csrfCookieMiddleware,
} from "~/lib/request/security.server";
import { parseForm } from "~/lib/validation/form-data";
import { listTermCourseCounts } from "~/modules/catalog/catalog.repository";
import { createAcademicTerm, setActiveTerm } from "~/modules/academic-terms/terms.service";
import {
  findActiveTerm,
  listOwnedTerms,
} from "~/modules/academic-terms/terms.repository";
import { createTermSchema } from "~/modules/academic-terms/terms.schema";

import type { Route } from "./+types/academic-terms._index";

type ActionData = FieldErrorResponse | undefined;

export const middleware: Route.MiddlewareFunction[] = [
  requireUserMiddleware,
  requireConsentsMiddleware,
  csrfCookieMiddleware,
];

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export const meta: Route.MetaFunction = () => [
  { title: "Academic Terms | SakuStudi" },
];

export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(sessionUserContext);
  if (!user) throw redirect("/login");

  const [terms, counts, activeTerm] = await Promise.all([
    listOwnedTerms(user.id),
    listTermCourseCounts(user.id),
    findActiveTerm(user.id),
  ]);

  const countByTerm = new Map(counts.map((row) => [row.termId, row.count]));
  const now = new Date();

  return {
    terms: terms.map((term) => ({
      ...term,
      courseCount: countByTerm.get(term.id) ?? 0,
    })),
    activeTermId: activeTerm?.id ?? null,
    csrfToken: context.get(csrfTokenContext) || createCsrfToken(user.id),
    defaults: {
      name: "Semester 1",
      startDate: toDateInputValue(now),
      endDate: toDateInputValue(
        new Date(now.getFullYear(), now.getMonth() + 6, now.getDate()),
      ),
    },
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = context.get(sessionUserContext);
  if (!user) throw redirect("/login");

  await assertCsrfMutation(request, user.id);
  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "create") {
    const parsed = parseForm(createTermSchema, formData);
    if (isFieldErrorResponse(parsed)) return data(parsed, { status: 400 });
    await createAcademicTerm(user.id, parsed);
    throw redirect("/academic-terms");
  }

  if (intent === "activate") {
    const termId = String(formData.get("termId") ?? "");
    if (termId === "") {
      return data<FieldErrorResponse>(
        { ok: false, fieldErrors: {}, formErrors: ["Term id is required."] },
        { status: 400 },
      );
    }
    await setActiveTerm(user.id, termId);
    throw redirect("/academic-terms");
  }

  return data<FieldErrorResponse>(
    { ok: false, fieldErrors: {}, formErrors: ["Unknown action."] },
    { status: 400 },
  );
}

function FieldError({
  field,
  actionData,
}: {
  field: string;
  actionData: ActionData;
}) {
  const errors = actionData?.fieldErrors[field];
  if (!errors || errors.length === 0) return null;
  return (
    <p role="alert" className="mt-1 text-sm text-danger">
      {errors[0]}
    </p>
  );
}

export default function AcademicTermsIndex({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<ActionData>();
  const { terms, activeTermId, csrfToken, defaults } = loaderData;

  return (
    <main className="mx-auto max-w-3xl px-page pb-24 pt-6 text-ink lg:pb-10 lg:pt-8">
      <h1 className="text-xl font-semibold">Academic Terms</h1>
      <p className="mt-1 text-sm text-muted">
        One active term at a time. Courses and activities live inside a term.
      </p>

      <section className="mt-6 rounded-card border border-border bg-surface p-6">
        <h2 className="text-sm font-semibold">New term</h2>
        <Form method="post" className="mt-4 space-y-4">
          <input type="hidden" name="intent" value="create" />
          <input type="hidden" name="csrfToken" value={csrfToken} />
          <label className="block">
            <span className="text-sm font-medium">Term name</span>
            <input
              name="name"
              type="text"
              required
              defaultValue={defaults.name}
              className="mt-1 w-full rounded-input border border-border bg-canvas px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            />
            <FieldError field="name" actionData={actionData} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium">Start date</span>
              <input
                name="startDate"
                type="date"
                required
                defaultValue={defaults.startDate}
                className="mt-1 w-full rounded-input border border-border bg-canvas px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              />
              <FieldError field="startDate" actionData={actionData} />
            </label>
            <label className="block">
              <span className="text-sm font-medium">End date</span>
              <input
                name="endDate"
                type="date"
                required
                defaultValue={defaults.endDate}
                className="mt-1 w-full rounded-input border border-border bg-canvas px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              />
              <FieldError field="endDate" actionData={actionData} />
            </label>
          </div>
          <button
            type="submit"
            className="min-h-11 rounded-input bg-primary px-4 py-2.5 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Create term
          </button>
        </Form>
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="text-sm font-semibold">Your terms</h2>
        {terms.length === 0 && (
          <p className="rounded-input border border-border bg-surface px-4 py-6 text-center text-sm text-muted">
            No terms yet. Create your first term above.
          </p>
        )}
        {terms.map((term) => (
          <article
            key={term.id}
            className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-4"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to={`/academic-terms/${term.id}`}
                  className="text-sm font-semibold text-ink underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus hover:underline"
                >
                  {term.name}
                </Link>
                {term.id === activeTermId ? (
                  <span className="rounded-full bg-success/20 px-2 py-0.5 text-xs font-medium text-ink">
                    Active
                  </span>
                ) : (
                  <span className="rounded-full bg-canvas px-2 py-0.5 text-xs text-muted">
                    Archived
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-muted">
                {formatDate(term.startDate)} – {formatDate(term.endDate)} ·{" "}
                {term.courseCount} {term.courseCount === 1 ? "course" : "courses"}
              </p>
            </div>
            {term.id !== activeTermId && (
              <Form method="post">
                <input type="hidden" name="intent" value="activate" />
                <input type="hidden" name="termId" value={term.id} />
                <input type="hidden" name="csrfToken" value={csrfToken} />
                <button
                  type="submit"
                  className="min-h-11 rounded-input border border-border bg-canvas px-4 py-2 text-sm font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  Set active
                </button>
              </Form>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}
