import { isAppError } from "~/lib/errors/AppError";
import {
  getRequestId,
  logErrorLine,
  REQUEST_ID_HEADER,
  setRequestErrorCode,
} from "~/lib/request/request-id.server";

export type FieldErrorResponse = {
  ok: false;
  fieldErrors: Record<string, string[]>;
  formErrors: string[];
};

export type ErrorResponseBody = {
  ok: false;
  error: {
    code: string;
    message?: string;
    requestId?: string;
  };
};

export function isFieldErrorResponse(
  value: unknown,
): value is FieldErrorResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as FieldErrorResponse).ok === false &&
    "fieldErrors" in value &&
    "formErrors" in value
  );
}

const ERROR_MESSAGES: Record<string, string> = {
  VALIDATION_FAILED: "Please fix the highlighted fields.",
  UNAUTHENTICATED: "Sign in required.",
  FORBIDDEN: "You are not allowed to do that.",
  NOT_FOUND: "Not found.",
  CONFLICT: "The resource conflicts with an existing one.",
  LIMIT_EXCEEDED: "The limit for this action has been reached.",
  RATE_LIMITED: "Too many requests. Try again later.",
  DEPENDENCY_UNAVAILABLE: "A required service is temporarily unavailable.",
};

const ERROR_STATUS: Record<string, number> = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  LIMIT_EXCEEDED: 422,
  RATE_LIMITED: 429,
  DEPENDENCY_UNAVAILABLE: 503,
};

/**
 * Normalizes domain failures into JSON error responses. Validation failures
 * use the FieldErrorResponse shape so forms can render per-field errors;
 * every other failure returns a stable { ok: false, error } body. Unexpected
 * errors are logged server-side and returned as a request-ID response that
 * never leaks internal details (SQL, providers, stacks) to the browser.
 */
export function toActionResponse(error: unknown): Response {
  const requestId = getRequestId();

  if (isFieldErrorResponse(error)) {
    return jsonWithRequestId(
      {
        ok: false,
        fieldErrors: error.fieldErrors,
        formErrors: error.formErrors,
      },
      { status: 400, requestId },
    );
  }

  if (isAppError(error)) {
    setRequestErrorCode(error.code);
    const status = ERROR_STATUS[error.code] ?? 500;
    if (error.code === "VALIDATION_FAILED") {
      return jsonWithRequestId(
        {
          ok: false,
          fieldErrors: error.fieldErrors ?? {},
          formErrors: error.message ? [error.message] : [],
        },
        { status, requestId },
      );
    }
    return jsonWithRequestId(
      {
        ok: false,
        error: {
          code: error.code,
          message: ERROR_MESSAGES[error.code] ?? error.message,
          requestId: requestId || undefined,
        },
      },
      { status, requestId },
    );
  }

  setRequestErrorCode("INTERNAL");
  logErrorLine(error, requestId);
  return jsonWithRequestId(
    {
      ok: false,
      error: {
        code: "INTERNAL",
        requestId: requestId || undefined,
      },
    },
    { status: 500, requestId },
  );
}

/**
 * Form-friendly variant of toActionResponse for route actions: every
 * AppError comes back in the FieldErrorResponse shape ({ ok: false,
 * fieldErrors, formErrors }) with the domain message in formErrors and the
 * code's HTTP status (CONFLICT -> 409, NOT_FOUND -> 404, ...), so forms can
 * render domain guidance (e.g. "You already have an active term...") instead
 * of surfacing the generic error boundary. redirect() throws a Response,
 * which is re-thrown untouched so it never becomes an error body. Unexpected
 * errors fall through to the sanitized toActionResponse path.
 */
export function toFormActionResponse(error: unknown): Response {
  if (error instanceof Response) {
    throw error;
  }
  if (isAppError(error)) {
    setRequestErrorCode(error.code);
    const status = ERROR_STATUS[error.code] ?? 500;
    return jsonWithRequestId(
      {
        ok: false,
        fieldErrors: error.fieldErrors ?? {},
        formErrors: [error.message],
      },
      { status, requestId: getRequestId() },
    );
  }
  return toActionResponse(error);
}

function jsonWithRequestId(
  body: FieldErrorResponse | ErrorResponseBody,
  options: { status: number; requestId: string },
): Response {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options.requestId !== "") {
    headers[REQUEST_ID_HEADER] = options.requestId;
  }
  return Response.json(body, { status: options.status, headers });
}
