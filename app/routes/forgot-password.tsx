import { Link, Form } from "react-router";
import { APIError } from "better-auth";
import { auth } from "~/lib/auth/server";

import type { Route } from "./+types/forgot-password";

type ActionData = {
  sent?: boolean;
  error?: string;
};

export const meta: Route.MetaFunction = () => [
  { title: "Forgot password | SakuStudi" },
];

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();

  try {
    await auth.api.requestPasswordReset({
      body: { email },
      headers: request.headers,
    });
  } catch (error) {
    if (error instanceof APIError) {
      return { error: "Could not send a reset email. Please try again." } satisfies ActionData;
    }
    throw error;
  }

  return { sent: true } satisfies ActionData;
}

export default function ForgotPassword({ actionData }: Route.ComponentProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-page text-ink">
      <div className="w-full max-w-md rounded-card border border-border bg-surface p-8">
        <h1 className="text-lg font-semibold">Reset your password</h1>
        <p className="mt-1 text-sm text-muted">
          Enter your account email and we will send you a reset link.
        </p>

        {actionData?.sent && (
          <p
            role="status"
            className="mt-4 rounded-input border border-success/40 bg-success/10 p-3 text-sm"
          >
            If an account exists for that email, a reset link is on its way.
          </p>
        )}
        {actionData?.error && (
          <p
            role="alert"
            className="mt-4 rounded-input border border-danger/40 bg-danger/10 p-3 text-sm"
          >
            {actionData.error}
          </p>
        )}

        <Form method="post" className="mt-6 space-y-4">
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
          <button
            type="submit"
            className="w-full rounded-input bg-primary px-4 py-2.5 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Send reset link
          </button>
        </Form>

        <p className="mt-4 text-center text-sm text-muted">
          <Link className="underline" to="/login">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
