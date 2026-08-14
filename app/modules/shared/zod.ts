import type { z } from "zod";

/**
 * Maps Zod issues to the { field: string[] } shape used by AppError
 * VALIDATION_FAILED fieldErrors and the FieldErrorResponse contract, so
 * service-level validation failures render the same per-field UI as
 * form-level parseForm failures.
 */
export function zodIssuesToFieldErrors(
  error: z.ZodError,
): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    if (issue.path.length > 0) {
      const key = String(issue.path[0]);
      (fieldErrors[key] ??= []).push(issue.message);
    }
  }
  return fieldErrors;
}
