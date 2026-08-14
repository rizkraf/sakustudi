import { Link } from "react-router";

import type { Route } from "./+types/legal.privacy";

export const meta: Route.MetaFunction = () => [
  { title: "Privacy Policy | SakuStudi" },
];

export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen bg-canvas px-page py-12 text-ink">
      <article className="mx-auto max-w-2xl rounded-card border border-border bg-surface p-8">
        <h1 className="text-xl font-semibold">Privacy Policy</h1>
        <p className="mt-1 text-sm text-muted">
          Last updated: August 1, 2026
        </p>

        <div className="mt-6 space-y-4 text-sm leading-relaxed">
          <section>
            <h2 className="font-semibold">1. What we collect</h2>
            <p>
              We collect your name, email address, and the study data you
              create: courses, activities, notes, reminders, and calendar
              events.
            </p>
          </section>
          <section>
            <h2 className="font-semibold">2. How we use it</h2>
            <p>
              Your data powers the features you use, keeps your account secure,
              and sends you the emails you ask for (verification and password
              resets).
            </p>
          </section>
          <section>
            <h2 className="font-semibold">3. What we do not do</h2>
            <p>
              We do not sell your personal data. We do not share it with third
              parties for advertising.
            </p>
          </section>
          <section>
            <h2 className="font-semibold">4. Storage and security</h2>
            <p>
              Data is stored on servers we control, protected with encryption
              and access controls.
            </p>
          </section>
          <section>
            <h2 className="font-semibold">5. Your rights</h2>
            <p>
              You can export or delete your data at any time. Deleting your
              account removes your personal data.
            </p>
          </section>
          <section>
            <h2 className="font-semibold">6. Changes</h2>
            <p>
              We may update this policy and will record your acceptance of
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
