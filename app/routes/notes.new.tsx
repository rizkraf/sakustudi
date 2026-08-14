import { data, redirect, Link, useActionData } from "react-router";
import { Form } from "react-router";
import { useFormStatus } from "react-dom";

import { RichTextEditor } from "~/components/editor/RichTextEditor";
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
import { listOwnedCourses } from "~/modules/courses/courses.repository";
import { createNote } from "~/modules/notes/notes.service";
import { createNoteSchema } from "~/modules/notes/notes.schema";

import type { Route } from "./+types/notes.new";

type ActionData = FieldErrorResponse | undefined;

export const middleware: Route.MiddlewareFunction[] = [
  requireUserMiddleware,
  requireConsentsMiddleware,
  csrfCookieMiddleware,
];

export const meta: Route.MetaFunction = () => [{ title: "New Note | SakuStudi" }];

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = context.get(sessionUserContext);
  if (!user) throw redirect("/login");

  const courses = await listOwnedCourses(user.id);
  const preselectCourseId = new URL(request.url).searchParams.get("courseId");

  return {
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
      const parsed = parseForm(createNoteSchema, formData);
      if (isFieldErrorResponse(parsed)) return data(parsed, { status: 400 });
      const note = await createNote(user.id, parsed);
      throw redirect(`/notes/${note.id}`);
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

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 rounded-input bg-primary px-4 py-2.5 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function FieldError({ field, actionData }: { field: string; actionData?: FieldErrorResponse }) {
  const errors = actionData?.fieldErrors[field];
  if (!errors || errors.length === 0) return null;
  return (
    <p role="alert" className="mt-1 text-sm text-danger">
      {errors[0]}
    </p>
  );
}

export default function NewNote({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<ActionData>();
  const { courses, preselectCourseId, csrfToken, user } = loaderData;

  const formError =
    actionData && actionData.formErrors.length > 0
      ? actionData.formErrors[0]
      : undefined;

  const inputClass =
    "mt-1 w-full rounded-input border border-border bg-canvas px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

  return (
    <AppShell user={user} activeRoute="/notes">
      <main className="mx-auto max-w-3xl">
        <Link
          to="/notes"
          className="text-sm text-muted underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus hover:text-ink"
        >
          ← All notes
        </Link>

        <h1 className="mt-3 text-xl font-semibold text-ink">New note</h1>
        <p className="mt-1 text-sm text-muted">
          Capture material, summaries, and exam prep.
        </p>

        <section className="mt-6 rounded-card border border-border bg-surface p-6">
          <Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="create" />
            <input type="hidden" name="csrfToken" value={csrfToken} />
            {formError && (
              <p
                role="alert"
                className="rounded-input border border-danger/40 bg-danger/10 p-3 text-sm text-ink"
              >
                {formError}
              </p>
            )}

            <label className="block">
              <span className="text-sm font-medium">Title</span>
              <input
                name="title"
                type="text"
                required
                className={inputClass}
              />
              <FieldError field="title" actionData={actionData} />
            </label>

            <label className="block">
              <span className="text-sm font-medium">Course (optional)</span>
              <select
                name="courseId"
                defaultValue={
                  preselectCourseId &&
                  courses.some((course) => course.id === preselectCourseId)
                    ? preselectCourseId
                    : ""
                }
                className={inputClass}
              >
                <option value="">No course</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                    {course.code ? ` (${course.code})` : ""}
                  </option>
                ))}
              </select>
              <FieldError field="courseId" actionData={actionData} />
            </label>

            <div>
              <span className="block text-sm font-medium">Content</span>
              <div className="mt-1">
                <RichTextEditor name="contentHtml" label="Content" />
              </div>
              <FieldError field="contentHtml" actionData={actionData} />
            </div>

            <label className="block">
              <span className="text-sm font-medium">Tags (optional)</span>
              <input
                name="tags"
                type="text"
                placeholder="UAS, summary, lecture 1"
                className={inputClass}
              />
              <span className="mt-1 block text-xs text-muted">
                Comma-separated, up to 10 tags.
              </span>
              <FieldError field="tags" actionData={actionData} />
            </label>

            <SubmitButton label="Create note" pendingLabel="Creating…" />
          </Form>
        </section>
      </main>
    </AppShell>
  );
}
