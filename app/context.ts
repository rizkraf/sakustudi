import { createContext } from "react-router";

import type { SessionUser } from "~/lib/auth/session";

export const valueFromExpressContext = createContext<string>(
  "Hello from React Router",
);

export const sessionUserContext = createContext<SessionUser | null>(null);

/**
 * Per-request signed CSRF token, created by csrfCookieMiddleware so the
 * cookie and the token rendered into forms are the same string
 * (assertCsrfMutation compares them strictly).
 */
export const csrfTokenContext = createContext<string>("");
