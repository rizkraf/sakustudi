import { data, Link, redirect, Form } from "react-router";
import { APIError } from "better-auth";
import { auth } from "~/lib/auth/server";

import type { Route } from "./+types/reset-password.$token";

type ActionData = {
  error?: string;
};

export const meta: Route.MetaFunction = () => [
  { title: "Reset password | SakuStudi" },
];

export async function action({ request, params }: Route.ActionArgs) {
  const formData = await request.formData();
  const newPassword = String(formData.get("newPassword") ?? "");
  const token = params.token ?? "";

  if (newPassword.length < 8) {
    return data<ActionData>(
      { error: "Password must be at least 8 characters long." },
      { status: 400 },
    );
  }

  try {
    await auth.api.resetPassword({
      body: { newPassword, token },
      headers: request.headers,
    });
  } catch (error) {
    if (error instanceof APIError) {
      return data<ActionData>(
        { error: error.message || "This reset link is invalid or has expired." },
        { status: 400 },
      );
    }
    throw error;
  }

  throw redirect("/login?reset=1");
}

export default function ResetPassword({ actionData }: Route.ComponentProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-page text-ink">
      <div className="w-full max-w-md rounded-card border border-border bg-surface p-8">
        <h1 className="text-lg font-semibold">Choose a new password</h1>
        <p className="mt-1 text-sm text-muted">
          Enter a new password for your account.
        </p>

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
            <span className="text-sm font-medium">New password</span>
            <input
              name="newPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="mt-1 w-full rounded-input border border-border bg-canvas px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            />
          </label>
          <button
            type="submit"
            className="w-full rounded-input bg-primary px-4 py-2.5 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Reset password
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
