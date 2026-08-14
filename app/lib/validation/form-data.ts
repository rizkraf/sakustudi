import { z } from "zod";

import type { FieldErrorResponse } from "~/lib/errors/response";

/**
 * Converts FormData to a plain record. Repeated keys (multi-select/checkbox
 * groups) become arrays so schemas can validate them directly.
 */
function formDataToRecord(formData: FormData): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    const values = formData.getAll(key);
    record[key] = values.length > 1 ? values : (values[0] ?? "");
  }
  return record;
}

/**
 * Parses form input against a Zod schema and normalizes failures into the
 * FieldErrorResponse contract used by forms: field-level issues keyed by
 * field name, form-level issues in formErrors.
 *
 * Note: zod v4 has no ZodSchema alias; z.ZodType<T> is the equivalent type.
 */
export function parseForm<T>(
  schema: z.ZodType<T>,
  formData: FormData,
): T | FieldErrorResponse {
  const result = schema.safeParse(formDataToRecord(formData));
  if (result.success) {
    return result.data;
  }

  const fieldErrors: Record<string, string[]> = {};
  const formErrors: string[] = [];
  for (const issue of result.error.issues) {
    if (issue.path.length > 0) {
      const key = String(issue.path[0]);
      (fieldErrors[key] ??= []).push(issue.message);
    } else {
      formErrors.push(issue.message);
    }
  }
  return { ok: false, fieldErrors, formErrors };
}
