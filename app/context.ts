import { createContext } from "react-router";

import type { SessionUser } from "~/lib/auth/session";

export const valueFromExpressContext = createContext<string>(
  "Hello from React Router",
);

export const sessionUserContext = createContext<SessionUser | null>(null);
