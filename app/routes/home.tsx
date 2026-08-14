import { AppShell } from "~/components/layout/AppShell";
import { sessionUserContext, valueFromExpressContext } from "~/context";
import { requireConsentsMiddleware, requireUserMiddleware } from "~/lib/auth/session";

import type { Route } from "./+types/home";
import { Welcome } from "../welcome/welcome";

export const middleware: Route.MiddlewareFunction[] = [
  requireUserMiddleware,
  requireConsentsMiddleware,
];

export function meta({}: Route.MetaArgs) {
  return [
    { title: "SakuStudi" },
    { name: "description", content: "Your study companion." },
  ];
}

export function loader({ context }: Route.LoaderArgs) {
  return {
    message: context.get(valueFromExpressContext),
    user: context.get(sessionUserContext),
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <AppShell activeRoute="/dashboard">
      <Welcome message={loaderData.message} />
    </AppShell>
  );
}
