import { eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "./db";

export async function seedOrg(p: { clerkOrgId: string; name: string; tier?: string }) {
  const [org] = await db
    .insert(schema.organizations)
    .values({
      clerkOrgId: p.clerkOrgId,
      name: p.name,
      region: "au",
      tier: (p.tier ?? "agency") as "agency",
    })
    .onConflictDoUpdate({
      target: schema.organizations.clerkOrgId,
      set: { name: p.name, tier: (p.tier ?? "agency") as "agency" },
    })
    .returning();
  return org;
}

export async function seedUser(p: {
  clerkUserId: string;
  organizationId: string;
  email: string;
}) {
  const [user] = await db
    .insert(schema.users)
    .values({
      clerkUserId: p.clerkUserId,
      organizationId: p.organizationId,
      email: p.email,
      name: "[S6-QA] User",
      role: "owner",
    })
    .onConflictDoUpdate({
      target: schema.users.clerkUserId,
      set: { organizationId: p.organizationId, email: p.email },
    })
    .returning();
  return user;
}

export async function seedBrand(p: { organizationId: string; name?: string }) {
  const [brand] = await db
    .insert(schema.brands)
    .values({
      organizationId: p.organizationId,
      name: p.name ?? "[S6-QA] Brand",
      domain: `s6-qa-${Date.now()}.com.au`,
      vertical: "tradies",
      region: "au",
      competitors: [],
      primaryRegions: ["NSW:Bondi"],
    })
    .returning();
  return brand;
}

export async function seedAudit(p: { organizationId: string; brandId: string }) {
  const [audit] = await db
    .insert(schema.audits)
    .values({
      organizationId: p.organizationId,
      brandId: p.brandId,
      auditNumber: Math.floor(Math.random() * 90000) + 10000,
      triggeredBy: "manual",
      status: "complete",
      engines: ["chatgpt"],
      runsPerPrompt: 1,
      promptsCount: 10,
      totalCalls: 10,
      scoreComposite: "25.00",
      scoreFrequency: "10.00",
      scorePosition: "10.00",
      scoreAccuracy: "10.00",
      scoreSentimentNumeric: "60.00",
      scoreContextNumeric: "10.00",
      totalCostUsd: "0.50",
      metadata: {},
      startedAt: new Date(Date.now() - 60000),
      completedAt: new Date(),
    })
    .returning();
  return audit;
}

export async function seedActionItems(p: {
  organizationId: string;
  brandId: string;
  auditId: string;
}) {
  const items = [
    {
      recommendationKey: "wikipedia-article",
      dimension: "frequency",
      title: "Add a Wikipedia entry for your business",
      action: "Draft a neutral, citation-backed Wikipedia article about your business.",
      confidenceLabel: "confirmed",
      expectedImpactScore: "high",
      evidenceRefs: [
        {
          source: "Princeton GEO Study (2024)",
          url: "https://arxiv.org/abs/2404.11973",
          summary: "Wikipedia = 47.9% of ChatGPT top-10 citation share.",
        },
      ],
    },
    {
      recommendationKey: "au-local-citations",
      dimension: "frequency",
      title: "Your AU local directory listings are incomplete",
      action:
        "Submit your business to hipages, Yellow Pages AU, ServiceSeeking with consistent NAP data.",
      confidenceLabel: "confirmed",
      expectedImpactScore: "high",
      evidenceRefs: [
        {
          source: "Local SEO AU analysis",
          url: "",
          summary: "NAP consistency heavily weights LLM local responses.",
        },
      ],
    },
    {
      recommendationKey: "faq-content",
      dimension: "context",
      title: "Add FAQ schema to your main service page",
      action: 'Add a FAQPage schema block answering common customer questions.',
      confidenceLabel: "likely",
      expectedImpactScore: "medium",
      evidenceRefs: [
        {
          source: "SE Ranking AI Mode (Dec 2025)",
          url: "https://seranking.com/blog/ai-overviews-study/",
          summary: "FAQ blocks average 4.9 AI citations vs 4.4 without.",
        },
      ],
    },
    {
      recommendationKey: "stale-content",
      dimension: "accuracy",
      title: "Update pages older than 12 months",
      action: 'Add a "Last updated" date and refresh pricing and contact details.',
      confidenceLabel: "confirmed",
      expectedImpactScore: "high",
      evidenceRefs: [],
    },
    {
      recommendationKey: "comparison-article",
      dimension: "position",
      title: "Write a service comparison guide",
      action: "Publish a 600-word guide comparing your service with alternatives.",
      confidenceLabel: "hypothesis",
      expectedImpactScore: "medium",
      evidenceRefs: [],
    },
  ];

  const rows = items.map((item) => ({
    organizationId: p.organizationId,
    brandId: p.brandId,
    auditId: p.auditId,
    ...item,
    status: "open",
    updatedAt: new Date(),
  }));

  await db.insert(schema.actionItems).values(rows).onConflictDoNothing();
}

export async function cleanupOrg(orgId: string) {
  if (!orgId) return;
  const auditRows = await db
    .select({ id: schema.audits.id })
    .from(schema.audits)
    .where(eq(schema.audits.organizationId, orgId));
  if (auditRows.length > 0) {
    const auditIds = auditRows.map((a) => a.id);
    await db
      .delete(schema.actionItems)
      .where(inArray(schema.actionItems.auditId, auditIds));
    await db
      .delete(schema.citations)
      .where(inArray(schema.citations.auditId, auditIds));
  }
  await db.delete(schema.audits).where(eq(schema.audits.organizationId, orgId));
  await db.delete(schema.brands).where(eq(schema.brands.organizationId, orgId));
  await db.delete(schema.users).where(eq(schema.users.organizationId, orgId));
  await db.delete(schema.organizations).where(eq(schema.organizations.id, orgId));
}
