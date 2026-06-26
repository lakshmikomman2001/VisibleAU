#!/usr/bin/env tsx
import { db } from "../db/client";
import { organizations } from "../db/schema/organizations";
import { brands } from "../db/schema/brands";
import { audits } from "../db/schema/audits";

if (process.env.NODE_ENV === "production") {
  console.error("❌ Cannot seed demo data in production");
  process.exit(1);
}

if (process.env.DEMO_MODE !== "true") {
  console.error("❌ Set DEMO_MODE=true before seeding");
  process.exit(1);
}

const DEMO_WORKSPACES = [
  {
    org: { slug: "demo-tradies", name: "Demo Plumbing Co" },
    brand: {
      name: "Bondi Plumbing",
      domain: "bondiplumbing.com.au",
      vertical: "tradies" as const,
    },
    audit: { scoreComposite: "72.00" },
  },
  {
    org: { slug: "demo-allied-health", name: "Demo Physio Practice" },
    brand: {
      name: "Sydney Sports Physio",
      domain: "sydneysportsphysio.com.au",
      vertical: "allied_health" as const,
    },
    audit: { scoreComposite: "58.00" },
  },
  {
    org: { slug: "demo-saas", name: "Demo SaaS Startup" },
    brand: {
      name: "CloudSync AU",
      domain: "cloudsync.com.au",
      vertical: "saas" as const,
    },
    audit: { scoreComposite: "85.00" },
  },
];

async function seed() {
  console.log("🌱 Seeding demo data...\n");

  for (const ws of DEMO_WORKSPACES) {
    const [org] = await db
      .insert(organizations)
      .values({
        name: ws.org.name,
        slug: ws.org.slug,
        clerkOrgId: `demo_${ws.org.slug}`,
        tier: "growth",
        region: "au",
      })
      .onConflictDoNothing()
      .returning();

    if (!org) {
      console.log(`  ⏭️  ${ws.org.slug} already exists, skipping`);
      continue;
    }

    const [brand] = await db
      .insert(brands)
      .values({
        organizationId: org.id,
        name: ws.brand.name,
        domain: ws.brand.domain,
        vertical: ws.brand.vertical,
        region: "au",
      })
      .returning();

    await db.insert(audits).values({
      brandId: brand.id,
      organizationId: org.id,
      auditNumber: 1,
      status: "complete",
      engines: ["chatgpt", "claude", "gemini", "perplexity"],
      promptsCount: 10,
      runsPerPrompt: 5,
      totalCalls: 200,
      scoreComposite: ws.audit.scoreComposite,
      completedAt: new Date(),
    });

    console.log(`  ✅ ${ws.org.name} → ${ws.brand.name} (score: ${ws.audit.scoreComposite})`);
  }

  console.log("\n✅ Demo data seeded");
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
