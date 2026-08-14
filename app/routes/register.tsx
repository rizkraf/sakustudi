import { data, Link, redirect, Form } from "react-router";
import { APIError } from "better-auth";
import { eq } from "drizzle-orm";
import { auth } from "~/lib/auth/server";
import { getDb } from "~/lib/db/client";
import { user } from "~/lib/db/schema";
import { recordRequiredConsents } from "~/modules/auth/consent.server";
import { signUpConsentInputSchema } from "~/modules/auth/consent.schema";

import type { Route } from "./+types/register";

type ActionData = {
  error?: string;
};

export const meta: Route.MetaFunction = () => [
  { title: "Create account | SakuStudi" },
];

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const acceptTerms = formData.get("acceptTerms") === "on";
  const acceptPrivacy = formData.get("acceptPrivacy") === "on";

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
  if (password.length < 8) {
    return data<ActionData>(
      { error: "Password must be at least 8 characters long." },
      { status: 400 },
    );
  }

  let createdUserId: string | null = null;
  let createdAtMs: number | null = null;
  try {
    const result = await auth.api.signUpEmail({
      body: { name, email, password },
      headers: request.headers,
    });
    createdUserId = result.user.id;
    createdAtMs = new Date(result.user.createdAt).getTime();
    await recordRequiredConsents(result.user.id, consent.data);
  } catch (error) {
    if (
      createdUserId &&
      createdAtMs !== null &&
      Date.now() - createdAtMs < 10_000
    ) {
      // A failed consent write must never leave a silent partial sign-up.
      // Only remove the account when this request actually created it.
      try {
        await getDb().delete(user).where(eq(user.id, createdUserId));
      } catch (cleanupError) {
        console.error("Failed to clean up partially created account:", cleanupError);
      }
    }
    if (error instanceof APIError) {
      return data<ActionData>({ error: error.message }, { status: 400 });
    }
    console.error("Sign-up failed:", error);
    return data<ActionData>(
      { error: "Sign-up could not be completed. Please try again." },
      { status: 500 },
    );
  }

  throw redirect("/login?registered=1");
}

export default function Register({ actionData }: Route.ComponentProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-page text-ink">
      <div className="w-full max-w-md rounded-card border border-border bg-surface p-8">
        <h1 className="text-lg font-semibold">Create your SakuStudi account</h1>
        <p className="mt-1 text-sm text-muted">
          Already have an account?{" "}
          <Link className="underline" to="/login">
            Sign in
          </Link>
        </p>

        {actionData?.error && (
          <p
            role="alert"
            className="mt-4 rounded-input border border-danger/40 bg-danger/10 p-3 text-sm text-ink"
          >
            {actionData.error}
          </p>
        )}

        <Form method="post" className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-medium">Name</span>
            <input
              name="name"
              type="text"
              required
              autoComplete="name"
              className="mt-1 w-full rounded-input border border-border bg-canvas px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Email</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="mt-1 w-full rounded-input border border-border bg-canvas px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Password</span>
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="mt-1 w-full rounded-input border border-border bg-canvas px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            />
          </label>

          <label className="flex items-start gap-2 text-sm">
            <input name="acceptTerms" type="checkbox" className="mt-1" />
            <span>
              I have read and accept the{" "}
              <Link className="underline" to="/legal/terms">
                Terms of Service
              </Link>
              .
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input name="acceptPrivacy" type="checkbox" className="mt-1" />
            <span>
              I have read and accept the{" "}
              <Link className="underline" to="/legal/privacy">
                Privacy Policy
              </Link>
              .
            </span>
          </label>

          <button
            type="submit"
            className="w-full rounded-input bg-primary px-4 py-2.5 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Create account
          </button>
        </Form>
      </div>
    </main>
  );
}
