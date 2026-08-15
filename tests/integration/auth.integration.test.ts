import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { eq, inArray, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { RouterContextProvider } from "react-router";
import { APIError } from "better-auth";

import { auth } from "~/lib/auth/server";
import { closeDb, getDb } from "~/lib/db/client";
import { legalConsents, session, user } from "~/lib/db/schema";
import {
  requireConsentsMiddleware,
  requireSessionUser,
  requireUserMiddleware,
  safeRedirectTarget,
  type SessionUser,
} from "~/lib/auth/session";
import { sessionUserContext } from "~/context";
import {
  createCsrfToken,
  CSRF_COOKIE_NAME,
} from "~/lib/request/security.server";
import {
  createInMemoryMailer,
  setMailAdapter,
} from "~/lib/mail/mailer";
import { LEGAL_CONSENT_TYPES } from "~/modules/auth/consent.schema";
import {
  countConsentRows,
  recordRequiredConsents,
} from "~/modules/auth/consent.server";
import { signUpConsentInputSchema } from "~/modules/auth/consent.schema";
import { action as termsConsentAction } from "~/routes/legal.terms";

const db = getDb();
const createdUserIds: string[] = [];
const EMAIL_SUFFIX = "@auth-int.test";

let mailer = createInMemoryMailer();

function freshMailer() {
  mailer = createInMemoryMailer();
  setMailAdapter(mailer);
  return mailer;
}

function newEmail(): string {
  return `auth-int-${crypto.randomUUID()}${EMAIL_SUFFIX}`;
}

function trackUserId(id: string): void {
  createdUserIds.push(id);
}

async function createVerifiedUser(
  name: string,
  email: string,
  password = "password123",
): Promise<{ userId: string; email: string }> {
  freshMailer();
  const result = await auth.api.signUpEmail({
    body: { name, email, password },
    headers: new Headers(),
  });
  trackUserId(result.user.id);

  const verifyMail = mailer.messages.find((m) => m.kind === "verification");
  expect(verifyMail).toBeDefined();
  const token = verifyMail!.url!.split("token=")[1]?.split("&")[0];
  expect(token).toBeDefined();
  await auth.api.verifyEmail({ query: { token: token! }, headers: new Headers() });

  return { userId: result.user.id, email };
}

function cookieHeaderFromSetCookie(setCookie: string | null): string {
  return (setCookie ?? "")
    .split(/,(?=[^;]+=[^;]+;)/)
    .map((part) => part.split(";")[0])
    .join("; ");
}

async function signInAndGetCookie(
  email: string,
  password = "password123",
): Promise<{ cookie: string; sessionToken: string }> {
  const { headers } = await auth.api.signInEmail({
    body: { email, password },
    headers: new Headers(),
    returnHeaders: true,
  });
  const cookie = cookieHeaderFromSetCookie(headers.get("set-cookie"));
  // Cookie value is "<db-token>.<signature>"; the DB stores only the token.
  const sessionToken = cookie.split("=")[1]?.split(";")[0]?.split(".")[0] ?? "";
  return { cookie, sessionToken };
}

function apiErrorBody(error: unknown): { message?: string; code?: string } {
  if (error instanceof APIError) {
    return {
      message: error.message,
      code: typeof error.body === "object" && error.body ? error.body.code : undefined,
    };
  }
  return {};
}

function middlewareArgs(request: Request, context: RouterContextProvider) {
  return {
    request,
    context,
    params: {},
    pattern: "/",
    url: new URL(request.url),
  };
}

describe("better auth + legal consent integration", () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "./drizzle" });
  }, 60_000);

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await db.delete(user).where(inArray(user.id, createdUserIds));
    }
    await closeDb();
  });

  it("signs up with email/password and sends a verification email", async () => {
    const mailerInstance = freshMailer();
    const email = newEmail();
    const result = await auth.api.signUpEmail({
      body: { name: "Auth Int", email, password: "password123" },
      headers: new Headers(),
    });
    trackUserId(result.user.id);

    expect(result.user.email).toBe(email);
    expect(result.user.emailVerified).toBe(false);

    const verifyMail = mailerInstance.messages.find((m) => m.kind === "verification");
    expect(verifyMail).toBeDefined();
    expect(verifyMail!.to).toBe(email);
    expect(verifyMail!.displayName).toBe("Auth Int");
    expect(verifyMail!.url).toContain("/api/auth/verify-email?token=");

    const rows = await db.select().from(user).where(eq(user.id, result.user.id));
    expect(rows).toHaveLength(1);
  });

  it("records required consent rows after sign-up, without duplication", async () => {
    const email = newEmail();
    const result = await auth.api.signUpEmail({
      body: { name: "Consent User", email, password: "password123" },
      headers: new Headers(),
    });
    trackUserId(result.user.id);

    await recordRequiredConsents(result.user.id, {
      acceptTerms: true,
      acceptPrivacy: true,
    });
    expect(await countConsentRows(result.user.id)).toBe(2);

    await recordRequiredConsents(result.user.id, {
      acceptTerms: true,
      acceptPrivacy: true,
    });
    expect(await countConsentRows(result.user.id)).toBe(2);

    const consentRows = await db
      .select({ consentType: legalConsents.consentType, version: legalConsents.version })
      .from(legalConsents)
      .where(eq(legalConsents.userId, result.user.id));
    expect(consentRows.map((row) => row.consentType).sort()).toEqual(
      [...LEGAL_CONSENT_TYPES].sort(),
    );
    for (const row of consentRows) {
      expect(row.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("rejects sign-up consent input when a required checkbox is not accepted", () => {
    expect(() =>
      signUpConsentInputSchema.parse({ acceptTerms: false, acceptPrivacy: true }),
    ).toThrow();
    expect(() =>
      signUpConsentInputSchema.parse({ acceptTerms: true, acceptPrivacy: false }),
    ).toThrow();
  });

  it("blocks unverified users from signing in", async () => {
    freshMailer();
    const email = newEmail();
    const result = await auth.api.signUpEmail({
      body: { name: "Unverified", email, password: "password123" },
      headers: new Headers(),
    });
    trackUserId(result.user.id);

    let error: unknown;
    try {
      await auth.api.signInEmail({
        body: { email, password: "password123" },
        headers: new Headers(),
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeDefined();
    expect(apiErrorBody(error).code).toBe("EMAIL_NOT_VERIFIED");
  });

  it("allows verified users to sign in and resolves the session user", async () => {
    const email = newEmail();
    await createVerifiedUser("Verified User", email);

    const { cookie } = await signInAndGetCookie(email);

    const session = await auth.api.getSession({
      headers: new Headers({ Cookie: cookie }),
    });
    expect(session?.user.email).toBe(email);

    const request = new Request("http://localhost:3000/", {
      headers: new Headers({ Cookie: cookie }),
    });
    const sessionUser: SessionUser | null = await import("~/lib/auth/session").then(
      (m) => m.getSessionUser(request),
    );
    expect(sessionUser).toEqual({
      id: session?.user.id,
      email,
      name: "Verified User",
    });
  });

  it("rejects sign-in with an invalid password", async () => {
    const email = newEmail();
    await createVerifiedUser("Wrong Pass", email);

    let error: unknown;
    try {
      await auth.api.signInEmail({
        body: { email, password: "wrong-password" },
        headers: new Headers(),
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeDefined();
    expect(apiErrorBody(error).code).toBe("INVALID_EMAIL_OR_PASSWORD");
  });

  it("sends a password reset email and lets the user reset the password", async () => {
    const email = newEmail();
    const { userId } = await createVerifiedUser("Reset User", email);

    freshMailer();
    await auth.api.requestPasswordReset({
      body: { email },
      headers: new Headers(),
    });

    const resetMail = mailer.messages.find((m) => m.kind === "password_reset");
    expect(resetMail).toBeDefined();
    expect(resetMail!.to).toBe(email);
    expect(resetMail!.url).toMatch(/\/reset-password\/\S+$/);

    const resetToken = resetMail!.url!.split("/reset-password/")[1]?.split("?")[0];
    expect(resetToken).toBeDefined();

    await auth.api.resetPassword({
      body: { newPassword: "newpassword456", token: resetToken! },
      headers: new Headers(),
    });

    let error: unknown;
    try {
      await auth.api.signInEmail({
        body: { email, password: "password123" },
        headers: new Headers(),
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeDefined();

    const result = await auth.api.signInEmail({
      body: { email, password: "newpassword456" },
      headers: new Headers(),
    });
    expect(result.user.id).toBe(userId);
  });

  it("revokes a session so the session user is no longer resolvable", async () => {
    const email = newEmail();
    await createVerifiedUser("Revoke Me", email);
    const { cookie, sessionToken } = await signInAndGetCookie(email);

    await auth.api.revokeSession({
      body: { token: sessionToken },
      headers: new Headers({ Cookie: cookie }),
    });

    const session = await auth.api.getSession({
      headers: new Headers({ Cookie: cookie }),
    });
    expect(session).toBeNull();
  });

  it("rejects auth requests from untrusted origins", async () => {
    const email = newEmail();
    await createVerifiedUser("Origin User", email);

    const evilRequest = new Request(
      "http://localhost:3000/api/auth/sign-in/email",
      {
        method: "POST",
        headers: new Headers({
          "Content-Type": "application/json",
          Origin: "http://evil.example",
        }),
        body: JSON.stringify({ email, password: "password123" }),
      },
    );
    const response = await auth.handler(evilRequest);
    expect(response.status).toBe(403);
    const body = (await response.json()) as { code?: string };
    expect(body.code).toBe("INVALID_ORIGIN");

    const trustedRequest = new Request(
      "http://localhost:3000/api/auth/sign-in/email",
      {
        method: "POST",
        headers: new Headers({
          "Content-Type": "application/json",
          Origin: "http://localhost:3000",
        }),
        body: JSON.stringify({ email, password: "password123" }),
      },
    );
    const trustedResponse = await auth.handler(trustedRequest);
    expect(trustedResponse.status).toBe(200);
  });

  it("blocks protected routes when required consent rows are missing", async () => {
    const email = newEmail();
    await createVerifiedUser("No Consent", email);
    const { cookie } = await signInAndGetCookie(email);

    expect(await countConsentRows((await auth.api.getSession({
      headers: new Headers({ Cookie: cookie }),
    }))!.user.id)).toBe(0);

    const request = new Request("http://localhost:3000/notes?tab=1", {
      headers: new Headers({ Cookie: cookie }),
    });
    const context = new RouterContextProvider();

    let redirectResponse: Response | undefined;
    try {
      await requireUserMiddleware(middlewareArgs(request, context), async () =>
        new Response(null, { status: 200 }),
      );
      await requireConsentsMiddleware(middlewareArgs(request, context), async () =>
        new Response(null, { status: 200 }),
      );
    } catch (error) {
      if (error instanceof Response) {
        redirectResponse = error;
      } else {
        throw error;
      }
    }

    expect(redirectResponse).toBeDefined();
    expect(redirectResponse!.status).toBe(302);
    expect(redirectResponse!.headers.get("location")).toBe(
      "/legal/terms?consent=required&next=%2Fnotes%3Ftab%3D1",
    );
  });

  it("re-consents through the terms page and lands back on the intended route", async () => {
    const email = newEmail();
    const { userId } = await createVerifiedUser("Re-consent", email);
    const { cookie } = await signInAndGetCookie(email);

    expect(await countConsentRows(userId)).toBe(0);

    const token = createCsrfToken(userId);
    const formData = new FormData();
    formData.set("acceptTerms", "on");
    formData.set("acceptPrivacy", "on");
    formData.set("next", "/notes?tab=1");
    formData.set("csrfToken", token);
    const request = new Request("http://localhost:3000/legal/terms", {
      method: "POST",
      headers: new Headers({
        Cookie: `${cookie}; ${CSRF_COOKIE_NAME}=${token}`,
        Origin: "http://localhost:3000",
      }),
      body: formData,
    });

    let redirectResponse: Response | undefined;
    try {
      await termsConsentAction({ request } as never);
    } catch (error) {
      if (error instanceof Response) {
        redirectResponse = error;
      } else {
        throw error;
      }
    }

    expect(redirectResponse).toBeDefined();
    expect(redirectResponse!.status).toBe(302);
    expect(redirectResponse!.headers.get("location")).toBe("/notes?tab=1");

    const rows = await db
      .select({ consentType: legalConsents.consentType })
      .from(legalConsents)
      .where(eq(legalConsents.userId, userId));
    expect(rows.map((row) => row.consentType).sort()).toEqual(
      [...LEGAL_CONSENT_TYPES].sort(),
    );
  });

  it("rejects re-consent without accepting both documents", async () => {
    const email = newEmail();
    const { userId } = await createVerifiedUser("Partial Re-consent", email);
    const { cookie } = await signInAndGetCookie(email);

    const token = createCsrfToken(userId);
    const formData = new FormData();
    formData.set("acceptTerms", "on");
    formData.set("csrfToken", token);
    const request = new Request("http://localhost:3000/legal/terms", {
      method: "POST",
      headers: new Headers({
        Cookie: `${cookie}; ${CSRF_COOKIE_NAME}=${token}`,
        Origin: "http://localhost:3000",
      }),
      body: formData,
    });

    const response = await termsConsentAction({ request } as never);
    const responseInit = response as unknown as { init?: { status?: number } };
    expect(responseInit.init?.status).toBe(400);
    expect(await countConsentRows(userId)).toBe(0);
  });

  it("sanitizes the re-consent redirect target against open redirects", () => {
    expect(safeRedirectTarget("/notes")).toBe("/notes");
    expect(safeRedirectTarget("/")).toBe("/");
    expect(safeRedirectTarget("https://evil.example/steal")).toBe("/");
    expect(safeRedirectTarget("//evil.example")).toBe("/");
    expect(safeRedirectTarget("")).toBe("/");
    expect(safeRedirectTarget(undefined)).toBe("/");
  });

  it("lets protected routes through when consents are present", async () => {
    const email = newEmail();
    const { userId } = await createVerifiedUser("With Consent", email);
    await recordRequiredConsents(userId, { acceptTerms: true, acceptPrivacy: true });
    const { cookie } = await signInAndGetCookie(email);

    const request = new Request("http://localhost:3000/", {
      headers: new Headers({ Cookie: cookie }),
    });
    const context = new RouterContextProvider();

    await requireUserMiddleware(middlewareArgs(request, context), async () =>
      new Response(null, { status: 200 }),
    );
    await requireConsentsMiddleware(middlewareArgs(request, context), async () =>
      new Response(null, { status: 200 }),
    );

    expect(context.get(sessionUserContext)).toMatchObject({ email });
  });

  it("redirects unauthenticated requests to /login", async () => {
    const request = new Request("http://localhost:3000/");
    const context = new RouterContextProvider();

    let redirectResponse: Response | undefined;
    try {
      await requireSessionUser(request);
    } catch (error) {
      if (error instanceof Response) {
        redirectResponse = error;
      } else {
        throw error;
      }
    }

    expect(redirectResponse).toBeDefined();
    expect(redirectResponse!.status).toBe(302);
    expect(redirectResponse!.headers.get("location")).toBe("/login");
    void context;
  });

  it("requires a fresh session (or password) to delete an account", async () => {
    const email = newEmail();
    await createVerifiedUser("Delete Me", email);
    const { cookie, sessionToken } = await signInAndGetCookie(email);

    await db.execute(
      sql`UPDATE session SET created_at = now() - interval '2 days' WHERE token = ${sessionToken}`,
    );

    let staleError: unknown;
    try {
      await auth.api.deleteUser({
        body: {},
        headers: new Headers({ Cookie: cookie }),
      });
    } catch (caught) {
      staleError = caught;
    }
    expect(staleError).toBeDefined();
    expect(apiErrorBody(staleError).message).toContain(
      "Re-authenticate to perform this action",
    );

    const fresh = await signInAndGetCookie(email);
    const deleteResult = await auth.api.deleteUser({
      body: {},
      headers: new Headers({ Cookie: fresh.cookie }),
    });
    expect(deleteResult.success).toBe(true);

    const remaining = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, (await auth.api.getSession({
        headers: new Headers({ Cookie: fresh.cookie }),
      }))?.user.id ?? "__deleted__"));
    expect(remaining).toHaveLength(0);
  });

  it("exposes the session via getSessionUser using the server session user id", async () => {
    const email = newEmail();
    const { userId } = await createVerifiedUser("Id User", email);
    const { cookie } = await signInAndGetCookie(email);

    const request = new Request("http://localhost:3000/", {
      headers: new Headers({ Cookie: cookie }),
    });
    const sessionUser = await requireSessionUser(request);
    expect(sessionUser.id).toBe(userId);

    const staleSessionCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(session)
      .where(eq(session.userId, userId));
    expect(Number(staleSessionCount[0].count)).toBeGreaterThanOrEqual(1);
  });

  describe("production secret guard", () => {
    const BOOT_SCRIPT =
      "import('./app/lib/auth/server.ts').then(() => process.exit(0)).catch((e) => { console.error(e?.message ?? String(e)); process.exit(1); })";

    function bootAuthInProduction(
      secret: string | undefined,
    ): { status: number | null; stderr: string } {
      const env: Record<string, string> = {
        ...process.env,
        NODE_ENV: "production",
      };
      if (secret !== undefined) {
        env.BETTER_AUTH_SECRET = secret;
      } else {
        delete env.BETTER_AUTH_SECRET;
      }
      const result = spawnSync(
        process.execPath,
        ["--import", "tsx", "--input-type=module", "-e", BOOT_SCRIPT],
        { env, encoding: "utf8", timeout: 60_000 },
      );
      return { status: result.status, stderr: result.stderr ?? "" };
    }

    it("fails to boot in production without a BETTER_AUTH_SECRET", () => {
      const { status, stderr } = bootAuthInProduction(undefined);
      expect(status).not.toBe(0);
      expect(stderr).toContain("BETTER_AUTH_SECRET");
    });

    it("fails to boot in production with the known placeholder secret", () => {
      const { status, stderr } = bootAuthInProduction(
        "dev-secret-change-me-before-deploy",
      );
      expect(status).not.toBe(0);
      expect(stderr).toContain("BETTER_AUTH_SECRET");
    });

    it("boots in production with a real secret", () => {
      const { status } = bootAuthInProduction(
        "a-strong-random-secret-that-is-not-a-placeholder-0123456789",
      );
      expect(status).toBe(0);
    });
  });
});
