import { data, Link, redirect, useSearchParams, Form } from "react-router";
import { APIError } from "better-auth";
import { auth } from "~/lib/auth/server";

import type { Route } from "./+types/login";

type ActionData = {
  error?: string;
};

export const meta: Route.MetaFunction = () => [
  { title: "Sign in | SakuStudi" },
];

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  try {
    const { headers } = await auth.api.signInEmail({
      body: { email, password },
      headers: request.headers,
      returnHeaders: true,
    });
    throw redirect("/", { headers });
  } catch (error) {
    if (error instanceof APIError) {
      return data<ActionData>(
        { error: error.message || "Invalid email or password." },
        { status: 401 },
      );
    }
    throw error;
  }

  throw redirect("/");
}

export default function Login({ actionData }: Route.ComponentProps) {
  const [searchParams] = useSearchParams();

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-page text-ink">
      <div className="w-full max-w-md rounded-card border border-border bg-surface p-8">
        <h1 className="text-lg font-semibold">Sign in to SakuStudi</h1>
        <p className="mt-1 text-sm text-muted">
          New to SakuStudi?{" "}
          <Link className="underline" to="/register">
            Create an account
          </Link>
        </p>

        {searchParams.get("registered") === "1" && (
          <p
            role="status"
            className="mt-4 rounded-input border border-success/40 bg-success/10 p-3 text-sm"
          >
            Account created. Check your email for a verification link before
            signing in.
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
          <label className="block">
            <span className="text-sm font-medium">Password</span>
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="mt-1 w-full rounded-input border border-border bg-canvas px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            />
          </label>

          <div className="flex items-center justify-between text-sm">
            <Link className="underline" to="/forgot-password">
              Forgot password?
            </Link>
          </div>

          <button
            type="submit"
            className="w-full rounded-input bg-primary px-4 py-2.5 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Sign in
          </button>
        </Form>
      </div>
    </main>
  );
}
