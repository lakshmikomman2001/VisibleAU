import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { testDb, seedOrganization, truncateAll, subscriptions, organizations } from "./helpers/test-db";
import { enginesForTier } from "@/lib/llm/tier-engines";

describe("tier-source integration (REAL DB — subscriptions.tier is sole source of truth)", () => {
  beforeEach(async () => {
    await testDb.execute(sql`DELETE FROM subscriptions WHERE stripe_customer_id LIKE 'cus_tier_test_%'`);
    await testDb.execute(sql`DELETE FROM organizations WHERE clerk_org_id LIKE 'org_tier_%'`);
  });

  afterAll(async () => {
    await testDb.execute(sql`DELETE FROM subscriptions WHERE stripe_customer_id LIKE 'cus_tier_test_%'`);
    await testDb.execute(sql`DELETE FROM organizations WHERE clerk_org_id LIKE 'org_tier_%'`);
  });

  it("queries subscription tier via real Drizzle query for agency org", async () => {
    const org = await seedOrganization({ clerkOrgId: "org_tier_agency_1", name: "Agency Org", tier: "agency" });
    await testDb.insert(subscriptions).values({
      organizationId: org.id,
      stripeCustomerId: "cus_tier_test_a1",
      stripeSubscriptionId: "sub_tier_test_a1",
      stripePriceId: "price_agency",
      tier: "agency",
      billingInterval: "monthly",
      status: "active",
    });

    const [sub] = await testDb
      .select({ tier: subscriptions.tier })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, org.id));

    const effectiveTier = sub?.tier ?? "free";
    expect(effectiveTier).toBe("agency");
    expect(enginesForTier(effectiveTier)).toHaveLength(4);
  });

  it("DIVERGENCE: org.tier=agency but sub.tier=free → code uses sub.tier (2 engines)", async () => {
    const org = await seedOrganization({ clerkOrgId: "org_tier_diverge_1", name: "Divergent Org", tier: "agency" });
    await testDb.insert(subscriptions).values({
      organizationId: org.id,
      stripeCustomerId: "cus_tier_test_d1",
      stripeSubscriptionId: "sub_tier_test_d1",
      stripePriceId: "price_free",
      tier: "free",
      billingInterval: "monthly",
      status: "active",
    });

    const [sub] = await testDb
      .select({ tier: subscriptions.tier })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, org.id));

    const effectiveTier = sub?.tier ?? "free";
    expect(effectiveTier).toBe("free");
    expect(enginesForTier(effectiveTier)).toHaveLength(2);
  });

  it("NO subscription row → falls back to 'free' (not org.tier)", async () => {
    const org = await seedOrganization({ clerkOrgId: "org_tier_nosub_1", name: "No Sub Org", tier: "starter" });

    const [sub] = await testDb
      .select({ tier: subscriptions.tier })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, org.id));

    expect(sub).toBeUndefined();
    const effectiveTier = sub?.tier ?? "free";
    expect(effectiveTier).toBe("free");
    expect(enginesForTier(effectiveTier)).toHaveLength(2);
  });

  it("agency tier resolves all 4 engines from real DB row", async () => {
    const org = await seedOrganization({ clerkOrgId: "org_tier_ag4_1", name: "Agency 4 Org", tier: "agency" });
    await testDb.insert(subscriptions).values({
      organizationId: org.id,
      stripeCustomerId: "cus_tier_test_ag4",
      stripeSubscriptionId: "sub_tier_test_ag4",
      stripePriceId: "price_agency",
      tier: "agency",
      billingInterval: "monthly",
      status: "active",
    });

    const [sub] = await testDb
      .select({ tier: subscriptions.tier })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, org.id));

    const engines = enginesForTier(sub!.tier);
    expect(engines).toContain("chatgpt");
    expect(engines).toContain("claude");
    expect(engines).toContain("gemini");
    expect(engines).toContain("perplexity");
  });

  it("free tier resolves only chatgpt + perplexity from real DB row", async () => {
    const org = await seedOrganization({ clerkOrgId: "org_tier_fr2_1", name: "Free Org", tier: "free" });
    await testDb.insert(subscriptions).values({
      organizationId: org.id,
      stripeCustomerId: "cus_tier_test_fr2",
      stripeSubscriptionId: "sub_tier_test_fr2",
      stripePriceId: "price_free",
      tier: "free",
      billingInterval: "monthly",
      status: "active",
    });

    const [sub] = await testDb
      .select({ tier: subscriptions.tier })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, org.id));

    const engines = enginesForTier(sub!.tier);
    expect(engines).toHaveLength(2);
    expect(engines).toContain("chatgpt");
    expect(engines).toContain("perplexity");
    expect(engines).not.toContain("claude");
    expect(engines).not.toContain("gemini");
  });

  it("subscription update propagates to tier resolution (upgrade path)", async () => {
    const org = await seedOrganization({ clerkOrgId: "org_tier_upg_1", name: "Upgrade Org", tier: "free" });
    await testDb.insert(subscriptions).values({
      organizationId: org.id,
      stripeCustomerId: "cus_tier_test_upg",
      stripeSubscriptionId: "sub_tier_test_upg",
      stripePriceId: "price_free",
      tier: "free",
      billingInterval: "monthly",
      status: "active",
    });

    // Upgrade to starter
    await testDb
      .update(subscriptions)
      .set({ tier: "starter" })
      .where(eq(subscriptions.organizationId, org.id));

    const [sub] = await testDb
      .select({ tier: subscriptions.tier })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, org.id));

    expect(sub!.tier).toBe("starter");
    expect(enginesForTier(sub!.tier)).toHaveLength(4);
  });

  it("subscription update propagates to tier resolution (downgrade path)", async () => {
    const org = await seedOrganization({ clerkOrgId: "org_tier_dwn_1", name: "Downgrade Org", tier: "agency" });
    await testDb.insert(subscriptions).values({
      organizationId: org.id,
      stripeCustomerId: "cus_tier_test_dwn",
      stripeSubscriptionId: "sub_tier_test_dwn",
      stripePriceId: "price_agency",
      tier: "agency",
      billingInterval: "monthly",
      status: "active",
    });

    // Downgrade to free
    await testDb
      .update(subscriptions)
      .set({ tier: "free" })
      .where(eq(subscriptions.organizationId, org.id));

    const [sub] = await testDb
      .select({ tier: subscriptions.tier })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, org.id));

    expect(sub!.tier).toBe("free");
    expect(enginesForTier(sub!.tier)).toHaveLength(2);
  });

  it("unknown tier in DB row falls closed to free engines", async () => {
    const org = await seedOrganization({ clerkOrgId: "org_tier_unk_1", name: "Unknown Tier Org", tier: "free" });
    await testDb.insert(subscriptions).values({
      organizationId: org.id,
      stripeCustomerId: "cus_tier_test_unk",
      stripeSubscriptionId: "sub_tier_test_unk",
      stripePriceId: "price_free",
      tier: "bogus_nonexistent",
      billingInterval: "monthly",
      status: "active",
    });

    const [sub] = await testDb
      .select({ tier: subscriptions.tier })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, org.id));

    expect(enginesForTier(sub!.tier)).toEqual(enginesForTier("free"));
  });

  it("the exact Drizzle query pattern from run-audit-inline works against real DB", async () => {
    const org = await seedOrganization({ clerkOrgId: "org_tier_rai_1", name: "RAI Pattern Org", tier: "agency" });
    await testDb.insert(subscriptions).values({
      organizationId: org.id,
      stripeCustomerId: "cus_tier_test_rai",
      stripeSubscriptionId: "sub_tier_test_rai",
      stripePriceId: "price_agency",
      tier: "agency",
      billingInterval: "monthly",
      status: "active",
    });

    // Replicates run-audit-inline.ts:43-46
    const [sub] = await testDb
      .select({ tier: subscriptions.tier })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, org.id));

    const effectiveTier = sub?.tier ?? "free";
    const engines = enginesForTier(effectiveTier);
    const runsPerPrompt = 5;
    const totalCalls = engines.length * 10 * runsPerPrompt;

    expect(totalCalls).toBe(200); // 4 engines × 10 prompts × 5 runs
  });

  it("the exact Drizzle query pattern from simulate-query-fan-out works", async () => {
    const org = await seedOrganization({ clerkOrgId: "org_tier_sqfo_1", name: "SQFO Pattern Org", tier: "agency" });
    await testDb.insert(subscriptions).values({
      organizationId: org.id,
      stripeCustomerId: "cus_tier_test_sqfo",
      stripeSubscriptionId: "sub_tier_test_sqfo",
      stripePriceId: "price_agency",
      tier: "agency",
      billingInterval: "monthly",
      status: "active",
    });

    // Replicates simulate-query-fan-out.ts:31-34
    const [sub] = await testDb
      .select({ tier: subscriptions.tier })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, org.id));

    const tier = sub?.tier ?? "free";
    const tierEngines = enginesForTier(tier);
    expect(tierEngines).toHaveLength(4);
  });
});
