import { redirect } from "react-router";

import { sessionUserContext } from "~/context";
import { requireUserMiddleware } from "~/lib/auth/session";
import { AppError } from "~/lib/errors/AppError";
import { getExportDownload } from "~/modules/exports/export.service";

import type { Route } from "./+types/exports.$exportId.download";

export const middleware: Route.MiddlewareFunction[] = [requireUserMiddleware];

/**
 * Authorized export download. Ownership and 24-hour expiry are checked
 * before storage is touched; the ZIP streams through this handler.
 */
export async function loader({ params, context }: Route.LoaderArgs) {
  const user = context.get(sessionUserContext);
  if (!user) throw redirect("/login");

  try {
    return await getExportDownload(user.id, params.exportId ?? "");
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") {
      throw new Response(null, { status: 404 });
    }
    throw error;
  }
}
