/**
 * Export request control: submits the export intent. The result list is
 * rendered by the privacy settings page (server-rendered).
 */
export function ExportDataButton({
  csrfToken,
  disabled = false,
}: {
  csrfToken: string;
  disabled?: boolean;
}) {
  return (
    <form method="post">
      <input type="hidden" name="intent" value="request-export" />
      <input type="hidden" name="csrfToken" value={csrfToken} />
      <button
        type="submit"
        disabled={disabled}
        className="min-h-11 rounded-control bg-primary px-4 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50"
      >
        Request export
      </button>
    </form>
  );
}
