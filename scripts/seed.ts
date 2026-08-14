import { closeDb, getDb } from "../app/lib/db/client";
import { CATALOG_SEED_VERSION, seedCatalog } from "../app/lib/db/seed";

async function main(): Promise<void> {
  const db = getDb();
  try {
    await seedCatalog(db);
    console.log(`Catalog seed (v${CATALOG_SEED_VERSION}) applied successfully.`);
  } finally {
    await closeDb();
  }
}

main().catch((error: unknown) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
