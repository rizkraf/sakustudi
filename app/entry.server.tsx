import { PassThrough } from "node:stream";

import { createReadableStreamFromReadable } from "@react-router/node";
import { renderToPipeableStream } from "react-dom/server";
import {
  ServerRouter,
  type EntryContext,
  type HandleErrorFunction,
} from "react-router";

import { isAppError } from "~/lib/errors/AppError";
import {
  getRequestId,
  logErrorLine,
  setRequestErrorCode,
} from "~/lib/request/request-id.server";

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
) {
  return new Promise((resolve, reject) => {
    const { pipe } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} />,
      {
        onShellReady() {
          responseHeaders.set("Content-Type", "text/html");

          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );

          pipe(body);
        },
        onShellError(error: unknown) {
          reject(error);
        },
      },
    );
  });
}

/**
 * Server-side error reporting: annotates the request context with the error
 * code (so the per-request structured log line carries it) and writes an
 * internal error log with the request ID. Nothing here reaches the browser;
 * the browser only sees the sanitized toActionResponse/ErrorBoundary output.
 */
export const handleError: HandleErrorFunction = (error, { request }) => {
  if (request.signal.aborted) return;
  if (isAppError(error)) {
    setRequestErrorCode(error.code);
  } else {
    setRequestErrorCode("INTERNAL");
  }
  logErrorLine(error, getRequestId());
};
