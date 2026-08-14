import { data, redirect, useActionData, useLoaderData } from "react-router";

import { AppShell } from "~/components/layout/AppShell";
import { csrfTokenContext, sessionUserContext } from "~/context";
import { DeleteAccountDialog } from "~/components/privacy/DeleteAccountDialog";
import { ExportDataButton } from "~/components/privacy/ExportDataButton";
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
  listUserConsents,
  requestAccountDeletion,
} from "~/modules/privacy/privacy.service";
import { deleteAccountSchema } from "~/modules/privacy/privacy.schema";
import {
  listUserExports,
  requestDataExport,
} from "~/modules/exports/export.service";

import type { Route } from "./+types/settings.privacy";

type ActionData = FieldErrorResponse | undefined;

export const middleware: Route.MiddlewareFunction[] = [
  requireUserMiddleware,
  requireConsentsMiddleware,
  csrfCookieMiddleware,
];

export const meta: Route.MetaFunction = () => [
  { title: "Privacy & Data | SakuStudi" },
];

export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(sessionUserContext);
  if (!user) throw redirect("/login");

  const [consents, exports] = await Promise.all([
    listUserConsents(user.id),
    listUserExports(user.id),
  ]);

  return {
    consents,
    exports,
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
    if (intent === "request-export") {
      await requestDataExport(user.id);
      throw redirect(request.url);
    }
    if (intent === "delete-account") {
      const parsed = parseForm(deleteAccountSchema, formData);
      if (isFieldErrorResponse(parsed)) return data(parsed, { status: 400 });
      const password = String(formData.get("password") ?? "");
      await requestAccountDeletion(user.id, request, password || undefined);
      throw redirect("/?deleted=1");
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

const EXPORT_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
};

export default function PrivacySettings() {
  const actionData = useActionData<ActionData>();
  const { consents, exports, csrfToken, user } = useLoaderData<typeof loader>();

  return (
    <AppShell user={user} activeRoute="/settings/profile">
      <h1 className="text-lg font-semibold text-ink">Privacy &amp; data</h1>

      {actionData && (
        <div
          role="alert"
          className="mt-4 rounded-control border border-border bg-surface p-3 text-sm text-ink"
        >
          {actionData.formErrors.join(" ")}
          {Object.values(actionData.fieldErrors)
            .flat()
            .map((message) => ` ${message}`)}
        </div>
      )}

      <section className="mt-6 rounded-card border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">Legal consents</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {consents.length === 0 ? (
            <li className="text-muted">No consent records.</li>
          ) : (
            consents.map((consent) => (
              <li key={`${consent.documentType}-${consent.version}`}>
                <span className="font-medium text-ink">{consent.documentType}</span>{" "}
                <span className="text-muted">
                  v{consent.version} ·{" "}
                  {new Date(consent.acceptedAt).toLocaleDateString("en-US")}
                </span>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="mt-6 rounded-card border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">Export your data</h2>
        <p className="mt-2 text-sm text-muted">
          A ZIP with your notes, activities, courses, reminders, and private
          files. Expires 24 hours after it is ready.
        </p>
        <div className="mt-3">
          <ExportDataButton csrfToken={csrfToken} />
        </div>
        {exports.length > 0 && (
          <ul className="mt-4 space-y-2 text-sm">
            {exports.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-control bg-canvas px-3 py-2"
              >
                <span className="text-muted">
                  {new Date(item.requestedAt).toLocaleString("en-US")} ·{" "}
                  {EXPORT_STATUS_LABELS[item.status] ?? item.status}
                </span>
                {item.status === "ready" && item.fileUrl ? (
                  <a
                    href={`/exports/${item.id}/download`}
                    className="text-sm font-medium text-ink underline underline-offset-2"
                  >
                    Download
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-card border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-danger">Delete account</h2>
        <p className="mt-2 text-sm text-muted">
          Deletes your account, notes, files, and all associated data. This
          cannot be undone. You may be asked to re-authenticate.
        </p>
        <DeleteAccountDialog
          csrfToken={csrfToken}
          errorMessage={actionData?.formErrors.join(" ")}
        />
      </section>
    </AppShell>
  );
}
