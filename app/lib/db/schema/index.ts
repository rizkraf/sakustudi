import * as authSchema from "./auth";
import * as appSchema from "./app";

export * from "./auth";
export * from "./app";

export const schema = {
  ...authSchema,
  ...appSchema,
};

export type AppSchema = typeof schema;
