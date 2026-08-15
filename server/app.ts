import { RouterContextProvider } from "react-router";
import { createRequestHandler } from "@react-router/express";
import express from "express";

import { valueFromExpressContext } from "~/context";
import { rateLimitMiddleware } from "~/lib/rate-limit/middleware";
import { requestIdMiddleware } from "~/lib/request/request-id.server";

export const app = express();

app.use(requestIdMiddleware);
app.use(rateLimitMiddleware);

app.use(
  createRequestHandler({
    build: () => import("virtual:react-router/server-build"),
    getLoadContext() {
      const context = new RouterContextProvider();
      context.set(valueFromExpressContext, "Hello from Express");
      return context;
    },
  }),
);
