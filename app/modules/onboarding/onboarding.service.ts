import { eq } from "drizzle-orm";

import { getDb } from "~/lib/db/client";
import { profiles } from "~/lib/db/schema";
import { trackEvent } from "~/modules/analytics/analytics.service";

export type OnboardingStatus = {
  completed: boolean;
  completedAt: Date | null;
};

/**
 * Reads the user's onboarding state from their profile. A missing profile
 * row counts as not completed.
 */
export async function getOnboardingStatus(
  userId: string,
): Promise<OnboardingStatus> {
  const db = getDb();
  const [row] = await db
    .select({ completedAt: profiles.onboardingCompletedAt })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  return {
    completed: row?.completedAt != null,
    completedAt: row?.completedAt ?? null,
  };
}

/**
 * Marks onboarding complete. The profile row may not exist yet (sign-up does
 * not create one), so the write upserts instead of failing on a missing row.
 */
export async function completeOnboarding(userId: string): Promise<void> {
  const db = getDb();
  await db
    .insert(profiles)
    .values({
      userId,
      onboardingCompletedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: {
        onboardingCompletedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  await trackEvent(userId, "onboarding_completed");
}
