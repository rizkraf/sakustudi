import { redirect } from "react-router";

import { sessionUserContext } from "~/context";
import { requireUserMiddleware } from "~/lib/auth/session";
import { AppError } from "~/lib/errors/AppError";
import { downloadAttachment } from "~/modules/files/files.service";

import type { Route } from "./+types/files.$attachmentId";

export const middleware: Route.MiddlewareFunction[] = [requireUserMiddleware];

/**
 * Private file download. Ownership is checked inside downloadAttachment
 * before storage is touched; the object is streamed through this handler, so
 * storage credentials or direct object URLs never reach the browser.
 */
export async function loader({ params, context }: Route.LoaderArgs) {
  const user = context.get(sessionUserContext);
  if (!user) throw redirect("/login");

  try {
    return await downloadAttachment(user.id, params.attachmentId ?? "");
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") {
      throw new Response(null, { status: 404 });
    }
    throw error;
  }
}
