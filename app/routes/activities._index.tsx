import { data, redirect, Link, useActionData } from "react-router";

import { ActivityCard } from "~/components/activities/ActivityCard";
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
import { findActiveTerm } from "~/modules/academic-terms/terms.repository";
import { listActivityPage } from "~/modules/activities/activities.service";
import { setActivityStatusFromInput } from "~/modules/activities/activities.service";
import { setActivityStatusSchema } from "~/modules/activities/activities.schema";

import type { Route } from "./+types/activities._index";

type ActionData = FieldErrorResponse | undefined;

export const middleware: Route.MiddlewareFunction[] = [
  requireUserMiddleware,
  requireConsentsMiddleware,
  csrfCookieMiddleware,
];

const PAGE_SIZE = 10;

export const meta: Route.MetaFunction = () => [
  { title: "Activities | SakuStudi" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = context.get(sessionUserContext);
  if (!user) throw redirect("/login");

  const activeTerm = await findActiveTerm(user.id);
  if (!activeTerm) {
    return {
      noTerm: true as const,
      csrfToken: context.get(csrfTokenContext) || createCsrfToken(user.id),
      user: { name: user.name ?? undefined, email: user.email },
    };
  }

  const page = Number(new URL(request.url).searchParams.get("page") ?? 1);
  const result = await listActivityPage(user.id, activeTerm.id, page, PAGE_SIZE);

  return {
    noTerm: false as const,
    term: activeTerm,
    page: result,
    now: new Date().toISOString(),
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
    if (intent === "set-status") {
      const parsed = parseForm(setActivityStatusSchema, formData);
      if (isFieldErrorResponse(parsed)) return data(parsed, { status: 400 });
      await setActivityStatusFromInput(user.id, parsed);
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

export default function ActivitiesIndex({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<ActionData>();
  const { csrfToken, user } = loaderData;

  void actionData;

  if (loaderData.noTerm) {
    return (
      <AppShell user={user} activeRoute="/activities">
        <section className="mx-auto max-w-3xl rounded-card border border-dashed border-border bg-surface px-6 py-12 text-center">
          <h1 className="text-lg font-semibold text-ink">No active term</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
            Activities live inside an academic term. Create your active term
            first, then add courses and activities.
          </p>
          <Link
            to="/academic-terms"
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-input bg-primary px-5 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Go to academic terms
          </Link>
        </section>
      </AppShell>
    );
  }

  const { term, page, now } = loaderData;
  const { items, total, page: currentPage, pageCount } = page;
  const hasPrev = currentPage > 1;
  const hasNext = currentPage < pageCount;

  return (
    <AppShell user={user} activeRoute="/activities">
      <div className="mx-auto max-w-3xl">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-ink">Activities</h1>
            <p className="mt-1 text-sm text-muted">
              {term.name} · {total} {total === 1 ? "activity" : "activities"}
            </p>
          </div>
          <Link
            to="/activities/new"
            className="inline-flex min-h-11 items-center justify-center rounded-input bg-primary px-4 py-2.5 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus hover:bg-primary/90"
          >
            New activity
          </Link>
        </header>

        {items.length === 0 ? (
          <section className="mt-6 rounded-card border border-dashed border-border bg-surface px-6 py-12 text-center">
            <h2 className="text-lg font-semibold text-ink">No activities yet</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
              Add your first activity for {term.name} to track deadlines,
              notes, and progress.
            </p>
            <Link
              to="/activities/new"
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-input bg-primary px-5 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              Create activity
            </Link>
          </section>
        ) : (
          <ul className="mt-6 space-y-2">
            {items.map((activity) => (
              <li key={activity.id}>
                <ActivityCard
                  activity={activity}
                  now={new Date(now)}
                  csrfToken={csrfToken}
                  to={`/activities/${activity.id}`}
                />
              </li>
            ))}
          </ul>
        )}

        {total > PAGE_SIZE && (
          <nav
            aria-label="Activity pages"
            className="mt-6 flex items-center justify-between gap-3"
          >
            {hasPrev ? (
              <Link
                to={`/activities?page=${currentPage - 1}`}
                className="min-h-11 rounded-input border border-border bg-surface px-4 py-2 text-sm font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                ← Previous
              </Link>
            ) : (
              <span className="min-h-11 px-4 py-2 text-sm text-muted" aria-hidden="true">
                ← Previous
              </span>
            )}
            <p className="text-sm text-muted">
              Page {currentPage} of {pageCount}
            </p>
            {hasNext ? (
              <Link
                to={`/activities?page=${currentPage + 1}`}
                className="min-h-11 rounded-input border border-border bg-surface px-4 py-2 text-sm font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                Next →
              </Link>
            ) : (
              <span className="min-h-11 px-4 py-2 text-sm text-muted" aria-hidden="true">
                Next →
              </span>
            )}
          </nav>
        )}
      </div>
    </AppShell>
  );
}
