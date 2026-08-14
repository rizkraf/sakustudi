import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: [
    "./app/lib/db/schema/auth.ts",
    "./app/lib/db/schema/app.ts",
  ],
  out: "./drizzle",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgres://sakustudi:sakustudi@localhost:5432/sakustudi",
  },
  verbose: true,
});
