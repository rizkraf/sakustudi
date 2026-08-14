import { data, redirect, Link, useActionData } from "react-router";
import { Form } from "react-router";
import { useFormStatus } from "react-dom";

import { RichTextEditor } from "~/components/editor/RichTextEditor";
import { RichTextViewer } from "~/components/editor/RichTextViewer";
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
import { listOwnedCourses } from "~/modules/courses/courses.repository";
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
import { deleteNote, getNote, updateNote } from "~/modules/notes/notes.service";
import { updateNoteSchema } from "~/modules/notes/notes.schema";

import type { Route } from "./+types/notes.$noteId";

type ActionData = FieldErrorResponse | undefined;

export const middleware: Route.MiddlewareFunction[] = [
  requireUserMiddleware,
  requireConsentsMiddleware,
  csrfCookieMiddleware,
];

export const meta: Route.MetaFunction = ({ loaderData }) => [
  {
    title: loaderData
      ? `${loaderData.note.title} | SakuStudi`
      : "Note | SakuStudi",
  },
];

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const user = context.get(sessionUserContext);
  if (!user) throw redirect("/login");

  let note;
  try {
    note = await getNote(user.id, params.noteId ?? "");
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") {
      throw new Response(null, { status: 404 });
    }
    throw error;
  }

  const editing = new URL(request.url).searchParams.get("edit") === "1";
  const courses = editing ? await listOwnedCourses(user.id) : [];
  const attachments = (await listParentAttachments(user.id, { kind: "note", id: note.id })).map(
    (attachment) => ({
      id: attachment.id,
      filename: attachment.filename,
      sizeLabel: formatBytes(attachment.sizeBytes ?? 0),
      mimeType: attachment.mimeType,
    }),
  );

  return {
    note,
    editing,
    courses,
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
  const noteId = params.noteId ?? "";

  try {
    if (intent === "update") {
      const parsed = parseForm(updateNoteSchema, formData);
      if (isFieldErrorResponse(parsed)) return data(parsed, { status: 400 });
      await updateNote(user.id, noteId, parsed);
      throw redirect(`/notes/${noteId}`);
    }
    if (intent === "delete") {
      await deleteNote(user.id, noteId);
      throw redirect("/notes");
    }
    if (intent === "attach-file") {
      const parsed = parseForm(attachmentUploadSchema, formData);
      if (isFieldErrorResponse(parsed)) return data(parsed, { status: 400 });
      await createAttachment(user.id, { kind: "note", id: noteId }, parsed.file);
      // Canonical URL, not request.url: multipart submissions carry a .data
      // suffix React Router would otherwise follow into a 404 document load.
      throw redirect(`/notes/${noteId}`);
    }
    if (intent === "delete-attachment") {
      const parsed = parseForm(attachmentDeleteSchema, formData);
      if (isFieldErrorResponse(parsed)) return data(parsed, { status: 400 });
      await deleteAttachment(user.id, parsed.attachmentId);
      throw redirect(`/notes/${noteId}`);
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

export default function NoteDetail({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<ActionData>();
  const { note, editing, courses, attachments, maxUploadLabel, csrfToken, user } =
    loaderData;

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

        {editing ? (
          <>
            <h1 className="mt-3 text-xl font-semibold text-ink">Edit note</h1>
            <section className="mt-6 rounded-card border border-border bg-surface p-6">
              <Form method="post" className="space-y-4">
                <input type="hidden" name="intent" value="update" />
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
                    defaultValue={note.title}
                    className={inputClass}
                  />
                  <FieldError field="title" actionData={actionData} />
                </label>

                <label className="block">
                  <span className="text-sm font-medium">Course (optional)</span>
                  <select
                    name="courseId"
                    defaultValue={note.courseId ?? ""}
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
                    <RichTextEditor
                      name="contentHtml"
                      label="Content"
                      initialContent={note.content ?? ""}
                    />
                  </div>
                  <FieldError field="contentHtml" actionData={actionData} />
                </div>

                <label className="block">
                  <span className="text-sm font-medium">Tags (optional)</span>
                  <input
                    name="tags"
                    type="text"
                    defaultValue={note.tags.join(", ")}
                    placeholder="UAS, summary, lecture 1"
                    className={inputClass}
                  />
                  <span className="mt-1 block text-xs text-muted">
                    Comma-separated, up to 10 tags.
                  </span>
                  <FieldError field="tags" actionData={actionData} />
                </label>

                <div className="flex flex-wrap gap-3">
                  <SubmitButton label="Save changes" pendingLabel="Saving…" />
                  <Link
                    to={`/notes/${note.id}`}
                    className="inline-flex min-h-11 items-center justify-center rounded-input border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    Cancel
                  </Link>
                </div>
              </Form>
            </section>
          </>
        ) : (
          <>
            <header className="mt-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold text-ink">{note.title}</h1>
                <p className="mt-1 text-sm text-muted">
                  Updated {new Date(note.updatedAt).toLocaleDateString("en-US")}
                  {note.courseId ? " · Attached to a course" : ""}
                </p>
                {note.tags.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1">
                    {note.tags.map((tag) => (
                      <li
                        key={tag}
                        className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-medium text-ink"
                      >
                        {tag}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex gap-2">
                <Link
                  to={`/notes/${note.id}?edit=1`}
                  className="inline-flex min-h-11 items-center justify-center rounded-input border border-border bg-surface px-4 py-2.5 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  Edit note
                </Link>
                <Form method="post">
                  <input type="hidden" name="intent" value="delete" />
                  <input type="hidden" name="csrfToken" value={csrfToken} />
                  <button
                    type="submit"
                    className="inline-flex min-h-11 items-center justify-center rounded-input border border-danger/40 bg-danger/10 px-4 py-2.5 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    Delete
                  </button>
                </Form>
              </div>
            </header>

            <section className="mt-6 rounded-card border border-border bg-surface p-6">
              <RichTextViewer html={note.content} />
            </section>
          </>
        )}

        <section
          aria-labelledby="note-files-heading"
          className="mt-6 rounded-card border border-border bg-surface p-6"
        >
          <h2 id="note-files-heading" className="text-sm font-semibold">
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
