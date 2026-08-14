/**
 * Destructive delete-account form: explicit confirmation ("DELETE") plus an
 * optional password for re-authentication when the session is not fresh.
 * Server-side fresh-session enforcement stays authoritative (see
 * requestAccountDeletion).
 */
export function DeleteAccountDialog({
  csrfToken,
  errorMessage,
}: {
  csrfToken: string;
  errorMessage?: string;
}) {
  return (
    <form method="post" className="mt-3 space-y-3">
      <input type="hidden" name="intent" value="delete-account" />
      <input type="hidden" name="csrfToken" value={csrfToken} />
      {errorMessage ? (
        <p role="alert" className="text-sm text-danger">
          {errorMessage}
        </p>
      ) : null}
      <label className="block text-sm font-medium text-ink" htmlFor="confirmation">
        Type DELETE to confirm
      </label>
      <input
        id="confirmation"
        name="confirmation"
        type="text"
        autoComplete="off"
        className="block w-full rounded-input border border-border bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      />
      <label className="block text-sm font-medium text-ink" htmlFor="password">
        Password (required unless your session is fresh)
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        className="block w-full rounded-input border border-border bg-surface px-3 py-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      />
      <button
        type="submit"
        className="min-h-11 rounded-control border border-danger bg-surface px-4 text-sm font-semibold text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        Delete account
      </button>
    </form>
  );
}
