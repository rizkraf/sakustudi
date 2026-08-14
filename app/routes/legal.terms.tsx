import { Link, useSearchParams } from "react-router";

import type { Route } from "./+types/legal.terms";

export const meta: Route.MetaFunction = () => [
  { title: "Terms of Service | SakuStudi" },
];

export default function TermsOfService() {
  const [searchParams] = useSearchParams();
  const consentRequired = searchParams.get("consent") === "required";

  return (
    <main className="min-h-screen bg-canvas px-page py-12 text-ink">
      <article className="mx-auto max-w-2xl rounded-card border border-border bg-surface p-8">
        <h1 className="text-xl font-semibold">Terms of Service</h1>
        <p className="mt-1 text-sm text-muted">
          Last updated: August 1, 2026
        </p>

        {consentRequired && (
          <p
            role="status"
            className="mt-4 rounded-input border border-info/40 bg-info/10 p-3 text-sm"
          >
            You must accept the Terms of Service and Privacy Policy to continue
            using SakuStudi.
          </p>
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
