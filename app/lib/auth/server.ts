import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb } from "~/lib/db/client";
import { account, session, user, verification } from "~/lib/db/schema";
import { sendAuthEmail } from "~/lib/mail/mailer";

const DEFAULT_BASE_URL = "http://localhost:3000";
const KNOWN_DEV_SECRET = "dev-secret-change-me-before-deploy";
const IS_PRODUCTION = process.env.NODE_ENV === "production";

const BASE_URL = process.env.BETTER_AUTH_URL ?? DEFAULT_BASE_URL;
const SECRET =
  process.env.BETTER_AUTH_SECRET ??
  (IS_PRODUCTION ? "" : KNOWN_DEV_SECRET);

if (IS_PRODUCTION && (!SECRET || SECRET === KNOWN_DEV_SECRET)) {
  throw new Error(
    "BETTER_AUTH_SECRET must be set to a strong random secret in production. " +
      "Generate one with `openssl rand -base64 32`.",
  );
}
const TRUSTED_ORIGINS = (
  process.env.BETTER_AUTH_TRUSTED_ORIGINS ??
  ""
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const SECURE_COOKIES =
  process.env.BETTER_AUTH_SECURE_COOKIES === "true" || BASE_URL.startsWith("https://");

export function createAuth() {
  return betterAuth({
    appName: "SakuStudi",
    secret: SECRET,
    baseURL: BASE_URL,
    trustedOrigins:
      TRUSTED_ORIGINS.length > 0 ? TRUSTED_ORIGINS : [BASE_URL],
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: { user, session, account, verification },
    }),
    user: {
      deleteUser: {
        enabled: true,
      },
    },
    session: {
      cookieCache: { enabled: false },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      sendResetPassword: async ({ user: resetUser, url }) => {
        await sendAuthEmail({
          kind: "password_reset",
          to: resetUser.email,
          // Point the reset link at the app's reset-password page instead of
          // Better Auth's bare /api/auth callback endpoint.
          url: url.replace("/api/auth/reset-password/", "/reset-password/"),
          displayName: resetUser.name,
        });
      },
    },
    emailVerification: {
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user: verifyUser, url }) => {
        await sendAuthEmail({
          kind: "verification",
          to: verifyUser.email,
          url,
          displayName: verifyUser.name,
        });
      },
    },
    advanced: {
      cookiePrefix: "sakustudi",
      secureCookies: SECURE_COOKIES,
      // Better Auth auto-skips origin checks in test environments; keep them
      // enforced so trusted-origin rejection is real in every environment.
      disableOriginCheck: false,
    },
  });
}

export const auth = createAuth();

export function getAuth() {
  return auth;
}
