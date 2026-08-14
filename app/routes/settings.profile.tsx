import { redirect } from "react-router";

import { AppShell } from "~/components/layout/AppShell";
import { sessionUserContext } from "~/context";
import {
  requireConsentsMiddleware,
  requireUserMiddleware,
} from "~/lib/auth/session";

import type { Route } from "./+types/settings.profile";

export const middleware: Route.MiddlewareFunction[] = [
  requireUserMiddleware,
  requireConsentsMiddleware,
];

export const meta: Route.MetaFunction = () => [
  { title: "Profile | SakuStudi" },
];

export async function loader({ context }: Route.LoaderArgs) {
  const user = context.get(sessionUserContext);
  if (!user) throw redirect("/login");
  return {
    user: { name: user.name ?? undefined, email: user.email },
  };
}

export default function ProfileSettings({
  loaderData,
}: Route.ComponentProps) {
  const { user } = loaderData;
  return (
    <AppShell user={user} activeRoute="/settings/profile">
      <h1 className="text-lg font-semibold text-ink">Profile</h1>

      <section className="mt-6 rounded-card border border-border bg-surface p-4">
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="font-medium text-muted">Name</dt>
            <dd className="text-ink">{user.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="font-medium text-muted">Email</dt>
            <dd className="text-ink">{user.email}</dd>
          </div>
        </dl>
      </section>

      <nav className="mt-6 space-y-2 text-sm" aria-label="More settings">
        <a
          href="/settings/reminders"
          className="block rounded-control border border-border bg-surface px-4 py-3 font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Reminder settings
        </a>
        <a
          href="/settings/privacy"
          className="block rounded-control border border-border bg-surface px-4 py-3 font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Privacy &amp; data
        </a>
      </nav>
    </AppShell>
  );
}
