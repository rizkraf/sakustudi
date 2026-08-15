import { data, Link, redirect, Form } from "react-router";

import { csrfTokenContext } from "~/context";
import {
  getSessionUser,
  requireSessionUser,
  requireUserMiddleware,
  safeRedirectTarget,
} from "~/lib/auth/session";
import {
  assertCsrfMutation,
  createCsrfToken,
  csrfCookieMiddleware,
} from "~/lib/request/security.server";
import { recordRequiredConsents } from "~/modules/auth/consent.server";
import { LEGAL_DOCUMENT_VERSIONS, signUpConsentInputSchema } from "~/modules/auth/consent.schema";

import type { Route } from "./+types/legal.terms";

type ActionData = {
  error?: string;
};

export const meta: Route.MetaFunction = () => [
  { title: "Terms of Service | SakuStudi" },
];

export const middleware: Route.MiddlewareFunction[] = [
  requireUserMiddleware,
  csrfCookieMiddleware,
];

export async function action({ request }: Route.ActionArgs) {
  const user = await requireSessionUser(request);
  await assertCsrfMutation(request, user.id);

  const formData = await request.formData();
  const acceptTerms = formData.get("acceptTerms") === "on";
  const acceptPrivacy = formData.get("acceptPrivacy") === "on";
  const next = String(formData.get("next") ?? "");

  const consent = signUpConsentInputSchema.safeParse({
    acceptTerms,
    acceptPrivacy,
  });
  if (!consent.success) {
    return data<ActionData>(
      { error: consent.error.issues[0]?.message ?? "Please accept the required terms." },
      { status: 400 },
    );
  }

  await recordRequiredConsents(user.id, consent.data);
  throw redirect(safeRedirectTarget(next));
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const searchParams = new URL(request.url).searchParams;
  const user = await getSessionUser(request);
  return {
    consentRequired: searchParams.get("consent") === "required",
    next: searchParams.get("next") ?? "/",
    csrfToken:
      user === null
        ? ""
        : context.get(csrfTokenContext) || createCsrfToken(user.id),
    hasUser: user !== null,
  };
}

export default function TermsOfService({
  actionData,
  loaderData,
}: Route.ComponentProps) {
  const { consentRequired, next, csrfToken, hasUser } = loaderData;

  return (
    <main className="min-h-screen bg-canvas px-page py-12 text-ink">
      <article className="mx-auto max-w-2xl rounded-card border border-border bg-surface p-8">
        <h1 className="text-xl font-semibold">Terms of Service</h1>
        <p className="mt-1 text-sm text-muted">
          Last updated: August 1, 2026
        </p>

        {consentRequired && hasUser && (
          <div
            role="status"
            className="mt-4 rounded-input border border-info/40 bg-info/10 p-3 text-sm"
          >
            <p>
              You must accept the Terms of Service and Privacy Policy to
              continue using SakuStudi.
            </p>
            <Form method="post" className="mt-3 space-y-3">
              <input type="hidden" name="next" value={next} />
              <input type="hidden" name="csrfToken" value={csrfToken} />
              <label className="flex items-start gap-2">
                <input name="acceptTerms" type="checkbox" className="mt-1" />
                <span>
                  I accept the{" "}
                  <span className="font-medium">Terms of Service</span> (version{" "}
                  {LEGAL_DOCUMENT_VERSIONS.terms_of_service}).
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input name="acceptPrivacy" type="checkbox" className="mt-1" />
                <span>
                  I accept the{" "}
                  <span className="font-medium">Privacy Policy</span>.
                </span>
              </label>
              {actionData?.error && (
                <p role="alert" className="text-sm text-danger">
                  {actionData.error}
                </p>
              )}
              <button
                type="submit"
                className="rounded-input bg-primary px-4 py-2 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                Accept and continue
              </button>
            </Form>
          </div>
        )}

        <div className="mt-6 space-y-4 text-sm leading-relaxed">
          <section>
            <h2 className="font-semibold">1. Acceptance</h2>
            <p>
              By creating an account you agree to these Terms of Service. If
              you do not agree, do not use SakuStudi.
            </p>
          </section>
          <section>
            <h2 className="font-semibold">2. The Service</h2>
            <p>
              SakuStudi helps you organize your studies: courses, activities,
              notes, reminders, and calendars. We may add, change, or remove
              features at any time.
            </p>
          </section>
          <section>
            <h2 className="font-semibold">3. Your Account</h2>
            <p>
              You are responsible for keeping your credentials secure and for
              everything done with your account. You may delete your account at
              any time.
            </p>
          </section>
          <section>
            <h2 className="font-semibold">4. Acceptable Use</h2>
            <p>
              Do not misuse the service, attempt to disrupt it, or use it for
              unlawful purposes.
            </p>
          </section>
          <section>
            <h2 className="font-semibold">5. Termination</h2>
            <p>
              We may suspend or terminate access that violates these terms.
            </p>
          </section>
          <section>
            <h2 className="font-semibold">6. Changes</h2>
            <p>
              We may update these terms and will record your acceptance of
              updated versions.
            </p>
          </section>
        </div>

        <p className="mt-6 text-sm text-muted">
          <Link className="underline" to="/">
            Back to SakuStudi
          </Link>
        </p>
      </article>
    </main>
  );
}
