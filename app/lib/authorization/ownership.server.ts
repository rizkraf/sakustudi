import type { OwnedResource } from "~/modules/shared/types";

import { AppError } from "~/lib/errors/AppError";

/**
 * Ownership guard: throws a generic NOT_FOUND for missing resources AND for
 * resources owned by another user, so cross-tenant probes cannot distinguish
 * "does not exist" from "exists but not yours".
 */
export function requireOwnedUser(
  userId: string,
  resource: OwnedResource | null | undefined,
): void {
  if (!resource || resource.userId === null || resource.userId !== userId) {
    throw new AppError("NOT_FOUND", "Not found.");
  }
}
