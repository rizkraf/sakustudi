import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb } from "../app/lib/db/client";

async function main(): Promise<void> {
  const db = getDb();
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("Migrations applied successfully.");
  } finally {
    await closeDb();
  }
}

main().catch((error: unknown) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
