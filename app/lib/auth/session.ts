import { redirect, type MiddlewareFunction } from "react-router";
import { sessionUserContext } from "~/context";
import { setRequestUserId } from "~/lib/request/request-id.server";
import { getMissingConsents } from "~/modules/auth/consent.server";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
};

export function toSessionUser(user: {
  id: string;
  email: string;
  name: string;
  image?: string | null;
}): SessionUser {
  return { id: user.id, email: user.email, name: user.name };
}

export async function getSessionUser(request: Request): Promise<SessionUser | null> {
  const { getAuth } = await import("~/lib/auth/server");
  const auth = getAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;
  return toSessionUser(session.user);
}

export async function requireSessionUser(request: Request): Promise<SessionUser> {
  const user = await getSessionUser(request);
  if (!user) {
    throw redirect("/login");
  }
  return user;
}

/**
 * Route middleware for protected app routes: loads the Better Auth session,
 * stores the user in router context, and redirects to /login when absent.
 */
export const requireUserMiddleware: MiddlewareFunction<Response> = async ({
  request,
  context,
}) => {
  const user = await getSessionUser(request);
  if (!user) {
    throw redirect("/login");
  }
  context.set(sessionUserContext, user);
  setRequestUserId(user.id);
};

/**
 * Route middleware that runs after requireUserMiddleware and blocks routes
 * when required legal consent rows are missing. The redirect keeps the
 * originally intended destination so the re-consent flow can return the user.
 */
export const requireConsentsMiddleware: MiddlewareFunction<Response> = async ({
  context,
  url,
}) => {
  const user = context.get(sessionUserContext);
  if (!user) {
    throw redirect("/login");
  }
  const missing = await getMissingConsents(user.id);
  if (missing.length > 0) {
    const next = url.pathname + url.search;
    throw redirect(`/legal/terms?consent=required&next=${encodeURIComponent(next)}`);
  }
};

export function safeRedirectTarget(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return "/";
  }
  return next;
}
