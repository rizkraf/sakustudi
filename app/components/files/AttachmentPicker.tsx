import { Form } from "react-router";
import { useFormStatus } from "react-dom";

import type { FieldErrorResponse } from "~/lib/errors/response";

const FILE_ACCEPT = ".pdf,.png,.jpg,.jpeg,.docx";
const HINT = "PDF, PNG, JPEG, or DOCX";

/**
 * Server-action attachment upload: a multipart form posting intent
 * "attach-file" to the current route. The parent id is NOT part of the form
 * — the route action derives it from its own params, so the picker cannot be
 * repurposed to attach files to other entities. Errors surface under the
 * file field via the route's action data.
 */
export function AttachmentPicker({
  csrfToken,
  errors,
  maxUploadLabel = "10 MB",
}: {
  csrfToken: string;
  errors?: FieldErrorResponse;
  maxUploadLabel?: string;
}) {
  const fileError = errors?.fieldErrors["file"]?.[0];
  const formError = errors?.formErrors?.[0];

  return (
    <Form method="post" encType="multipart/form-data" className="space-y-3">
      <input type="hidden" name="intent" value="attach-file" />
      <input type="hidden" name="csrfToken" value={csrfToken} />

      <label className="block">
        <span className="text-sm font-medium">Add file</span>
        <input
          type="file"
          name="file"
          required
          accept={FILE_ACCEPT}
          className="mt-1 block w-full text-sm text-ink file:mr-3 file:min-h-10 file:cursor-pointer file:rounded-input file:border-0 file:bg-primary/15 file:px-4 file:text-sm file:font-medium file:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        />
        <span className="mt-1 block text-xs text-muted">
          {HINT} · up to {maxUploadLabel} per file.
        </span>
      </label>

      {fileError && (
        <p role="alert" className="text-sm text-danger">
          {fileError}
        </p>
      )}
      {formError && (
        <p
          role="alert"
          className="rounded-input border border-danger/40 bg-danger/10 p-3 text-sm text-ink"
        >
          {formError}
        </p>
      )}

      <UploadButton />
    </Form>
  );
}

function UploadButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 rounded-input bg-primary px-4 py-2.5 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Uploading…" : "Upload"}
    </button>
  );
}
