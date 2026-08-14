import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "~/lib/db/client";
import { legalConsents } from "~/lib/db/schema";
import {
  LEGAL_CONSENT_TYPES,
  LEGAL_DOCUMENT_VERSIONS,
  signUpConsentInputSchema,
} from "./consent.schema";
import type { LegalConsentType, SignUpConsentInput } from "./consent.schema";

export async function recordRequiredConsents(
  userId: string,
  input: SignUpConsentInput,
): Promise<void> {
  signUpConsentInputSchema.parse(input);

  const db = getDb();
  const existing = await db
    .select({ consentType: legalConsents.consentType })
    .from(legalConsents)
    .where(eq(legalConsents.userId, userId));

  const existingTypes = new Set(existing.map((row) => row.consentType));

  const rows = LEGAL_CONSENT_TYPES.filter((type) => !existingTypes.has(type)).map(
    (type) => ({
      userId,
      consentType: type,
      version: LEGAL_DOCUMENT_VERSIONS[type],
    }),
  );

  if (rows.length > 0) {
    await db.insert(legalConsents).values(rows);
  }
}

export async function getMissingConsents(userId: string): Promise<LegalConsentType[]> {
  const db = getDb();
  const existing = await db
    .select({ consentType: legalConsents.consentType })
    .from(legalConsents)
    .where(
      and(
        eq(legalConsents.userId, userId),
        inArray(legalConsents.consentType, LEGAL_CONSENT_TYPES),
      ),
    );

  const existingTypes = new Set(existing.map((row) => row.consentType));
  return LEGAL_CONSENT_TYPES.filter((type) => !existingTypes.has(type));
}

export async function hasRequiredConsents(userId: string): Promise<boolean> {
  const missing = await getMissingConsents(userId);
  return missing.length === 0;
}

export async function countConsentRows(userId: string): Promise<number> {
  const db = getDb();
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(legalConsents)
    .where(eq(legalConsents.userId, userId));
  return Number(result[0]?.count ?? 0);
}
