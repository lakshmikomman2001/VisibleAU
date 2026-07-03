import { eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { organizations } from "@/db/schema";

export async function isFirstTimeUser(orgId: string): Promise<boolean> {
  const [org] = await serviceDb
    .select({ onboardingComplete: organizations.onboardingComplete })
    .from(organizations)
    .where(eq(organizations.id, orgId));
  if (!org) return false;
  return !org.onboardingComplete;
}

export async function markOnboardingComplete(orgId: string): Promise<void> {
  await serviceDb
    .update(organizations)
    .set({ onboardingComplete: true, updatedAt: new Date() })
    .where(eq(organizations.id, orgId));
}
