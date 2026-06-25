import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";

export async function isFirstTimeUser(orgId: string): Promise<boolean> {
  const [org] = await db
    .select({ onboardingComplete: organizations.onboardingComplete })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  if (!org) return false;
  return !org.onboardingComplete;
}

export async function markOnboardingComplete(orgId: string): Promise<void> {
  await db
    .update(organizations)
    .set({ onboardingComplete: true, updatedAt: new Date() })
    .where(eq(organizations.id, orgId));
}
