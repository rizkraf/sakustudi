import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { closeDb, getDb } from "~/lib/db/client";
import { legalConsents, user } from "~/lib/db/schema";
import {
  getMissingConsents,
  recordRequiredConsents,
} from "~/modules/auth/consent.server";
import { LEGAL_DOCUMENT_VERSIONS } from "~/modules/auth/consent.schema";

const db = getDb();
const createdUserIds: string[] = [];

function newUserId(): string {
  const id = crypto.randomUUID();
  createdUserIds.push(id);
  return id;
}

async function createUser(id: string): Promise<void> {
  await db.insert(user).values({
    id,
    name: "Consent Integration User",
    email: `${id}@consent-int.test`,
    emailVerified: true,
  });
}

async function insertConsent(userId: string, type: string, version: string): Promise<void> {
  await db.insert(legalConsents).values({
    userId,
    consentType: type,
    version,
    acceptedAt: new Date(),
  });
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
});

afterAll(async () => {
  for (const id of createdUserIds) {
    await db.delete(user).where(eq(user.id, id)).catch(() => undefined);
  }
  await closeDb();
});

describe("consent version awareness", () => {
  it("treats a stale privacy version as missing", async () => {
    const userId = newUserId();
    await createUser(userId);
    await insertConsent(userId, "terms_of_service", LEGAL_DOCUMENT_VERSIONS.terms_of_service);
    await insertConsent(userId, "privacy_policy", "2020-01-01");

    const missing = await getMissingConsents(userId);
    expect(missing).toEqual(["privacy_policy"]);
  });

  it("recordRequiredConsents replaces a stale version row", async () => {
    const userId = newUserId();
    await createUser(userId);
    await insertConsent(userId, "privacy_policy", "2020-01-01");

    await recordRequiredConsents(userId, {
      acceptTerms: true,
      acceptPrivacy: true,
    });

    const rows = await db
      .select()
      .from(legalConsents)
      .where(eq(legalConsents.userId, userId));
    expect(rows).toHaveLength(2);
    const privacy = rows.find((r) => r.consentType === "privacy_policy");
    expect(privacy?.version).toBe(LEGAL_DOCUMENT_VERSIONS.privacy_policy);
    expect(await getMissingConsents(userId)).toEqual([]);
  });

  it("keeps current-version rows untouched", async () => {
    const userId = newUserId();
    await createUser(userId);
    await insertConsent(userId, "terms_of_service", LEGAL_DOCUMENT_VERSIONS.terms_of_service);
    await insertConsent(userId, "privacy_policy", LEGAL_DOCUMENT_VERSIONS.privacy_policy);

    await recordRequiredConsents(userId, {
      acceptTerms: true,
      acceptPrivacy: true,
    });

    const rows = await db
      .select()
      .from(legalConsents)
      .where(eq(legalConsents.userId, userId));
    expect(rows).toHaveLength(2);
  });
});
