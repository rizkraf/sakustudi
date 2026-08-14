import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router";

import { useRegisterSW } from "virtual:pwa-register/react";

import type { Route } from "./+types/root";
import "./styles/app.css";
import "./styles/rich-text.css";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=Geist+Mono:wght@100..900&display=swap",
  },
];

function PwaUpdatePrompt() {
  const { needRefresh, offlineReady, updateServiceWorker } = useRegisterSW();
  const [needRefreshState] = needRefresh;
  const [offlineReadyState] = offlineReady;

  if (!needRefreshState && !offlineReadyState) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 left-1/2 z-50 w-max max-w-[calc(100vw-48px)] -translate-x-1/2 rounded-card border border-border bg-surface px-4 py-3 shadow-lg"
    >
      <p className="text-sm text-ink">
        {needRefreshState
          ? "A new version is available."
          : "App ready to work offline."}
      </p>
      {needRefreshState && (
        <button
          type="button"
          onClick={() => void updateServiceWorker()}
          className="mt-2 rounded-input bg-primary px-3 py-1.5 text-sm font-medium text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Update
        </button>
      )}
    </div>
  );
}

function PwaStatus() {
  if (import.meta.env.SSR) return null;
  return <PwaUpdatePrompt />;
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#ffce54" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <PwaStatus />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-page text-ink">
      <div className="w-full max-w-md rounded-card border border-border bg-surface p-8 text-center">
        <h1 className="text-lg font-semibold">{message}</h1>
        <p className="mt-2 text-sm text-muted">{details}</p>
        {stack && (
          <pre className="mt-4 max-h-64 w-full overflow-auto rounded-input bg-canvas p-4 text-left text-xs">
            <code>{stack}</code>
          </pre>
        )}
      </div>
    </main>
  );
}
