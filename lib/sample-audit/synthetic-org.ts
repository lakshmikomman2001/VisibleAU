import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";

const SAMPLE_ORG_SLUG = "__sample__";

export async function ensureSampleOrg() {
  const [existing] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, SAMPLE_ORG_SLUG));

  if (existing) return existing;

  const [created] = await db
    .insert(organizations)
    .values({
      clerkOrgId: `sample_${Date.now()}`,
      name: "Sample Audit",
      slug: SAMPLE_ORG_SLUG,
      tier: "free",
      metadata: { isSampleOrg: true },
    })
    .returning();

  return created;
}
