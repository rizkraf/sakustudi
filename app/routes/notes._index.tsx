import { data, redirect, Link, useActionData } from "react-router";
import { Form } from "react-router";

import { AppShell } from "~/components/layout/AppShell";
import { csrfTokenContext, sessionUserContext } from "~/context";
import {
  requireConsentsMiddleware,
  requireUserMiddleware,
} from "~/lib/auth/session";
import {
  toFormActionResponse,
  type FieldErrorResponse,
} from "~/lib/errors/response";
import {
  assertCsrfMutation,
  createCsrfToken,
  csrfCookieMiddleware,
} from "~/lib/request/security.server";
import { listOwnedCourses } from "~/modules/courses/courses.repository";
import { deleteNote, searchNotes } from "~/modules/notes/notes.service";

import type { Route } from "./+types/notes._index";

type ActionData = FieldErrorResponse | undefined;

export const middleware: Route.MiddlewareFunction[] = [
  requireUserMiddleware,
  requireConsentsMiddleware,
  csrfCookieMiddleware,
];

export const meta: Route.MetaFunction = () => [{ title: "Notes | SakuStudi" }];

function excerpt(contentText: string, max = 140): string {
  const text = contentText.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = context.get(sessionUserContext);
  if (!user) throw redirect("/login");

  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const courseIdParam = url.searchParams.get("courseId");
  const courseId = courseIdParam === "" ? null : courseIdParam;
  const tag = url.searchParams.get("tag") || undefined;

  const [notes, courses] = await Promise.all([
    searchNotes(user.id, { query, courseId, tag: tag || undefined }),
    listOwnedCourses(user.id),
  ]);

  return {
    notes,
    courses,
    filters: { query, courseId, tag },
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
    if (intent === "delete") {
      const noteId = String(formData.get("noteId") ?? "");
      if (!noteId) {
        return data<FieldErrorResponse>(
          { ok: false, fieldErrors: {}, formErrors: ["Note is missing."] },
          { status: 400 },
        );
      }
      await deleteNote(user.id, noteId);
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

export default function NotesIndex({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<ActionData>();
  const { notes, courses, filters, csrfToken, user } = loaderData;

  void actionData;

  const inputClass =
    "mt-1 w-full rounded-input border border-border bg-canvas px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus";

  return (
    <AppShell user={user} activeRoute="/notes">
      <div className="mx-auto max-w-3xl">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-ink">Notes</h1>
            <p className="mt-1 text-sm text-muted">
              {notes.length} {notes.length === 1 ? "note" : "notes"}
            </p>
          </div>
          <Link
            to="/notes/new"
            className="inline-flex min-h-11 items-center justify-center rounded-input bg-primary px-4 py-2.5 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus hover:bg-primary/90"
          >
            New note
          </Link>
        </header>

        <Form method="get" className="mt-6 rounded-card border border-border bg-surface p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium">Search</span>
              <input
                name="q"
                type="search"
                defaultValue={filters.query}
                placeholder="Search note text…"
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Course</span>
              <select name="courseId" defaultValue={filters.courseId ?? ""} className={inputClass}>
                <option value="">All courses</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium">Tag</span>
              <input
                name="tag"
                type="text"
                defaultValue={filters.tag ?? ""}
                placeholder="e.g. UAS"
                className={inputClass}
              />
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                className="min-h-11 rounded-input border border-border bg-surface px-4 py-2 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                Search
              </button>
            </div>
          </div>
        </Form>

        {notes.length === 0 ? (
          <section className="mt-6 rounded-card border border-dashed border-border bg-surface px-6 py-12 text-center">
            <h2 className="text-lg font-semibold text-ink">No notes found</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
              {filters.query || filters.courseId || filters.tag
                ? "No notes match the current search. Try different filters."
                : "Capture course material, summaries, and exam prep as notes."}
            </p>
            <Link
              to="/notes/new"
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-input bg-primary px-5 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              Create note
            </Link>
          </section>
        ) : (
          <ul className="mt-6 space-y-2">
            {notes.map((note) => (
              <li key={note.id}>
                <article className="rounded-card border border-border bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      to={`/notes/${note.id}`}
                      className="min-h-11 text-base font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    >
                      {note.title}
                    </Link>
                    <Form method="post" className="shrink-0">
                      <input type="hidden" name="intent" value="delete" />
                      <input type="hidden" name="noteId" value={note.id} />
                      <input type="hidden" name="csrfToken" value={csrfToken} />
                      <button
                        type="submit"
                        className="min-h-11 rounded-input px-2 py-1 text-xs font-medium text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus hover:text-danger"
                      >
                        Delete
                      </button>
                    </Form>
                  </div>
                  {note.contentText && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted">
                      {excerpt(note.contentText)}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted">
                    {note.courseName ? `${note.courseName} · ` : ""}
                    {note.tags.length > 0 ? `${note.tags.join(", ")} · ` : ""}
                    Updated {new Date(note.updatedAt).toLocaleDateString("en-US")}
                  </p>
                </article>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
