/**
 * QA seed helpers — insert test rows using service-role client.
 * All test rows use the [S1-QA] prefix in name fields for easy identification.
 * Idempotent: each helper upserts on clerkOrgId / clerkUserId conflict.
 */

import * as schema from "../../../../db/schema";
import { db } from "./db";

// ── Organization ──────────────────────────────────────────────────────────────
export async function seedOrg(data: {
  clerkOrgId: string;
  name: string;
  region?: "au" | "nz" | "uk" | "us" | "ca" | "eu";
  tier?: "free" | "starter" | "growth" | "agency" | "agency_pro";
}) {
  const [org] = await db
    .insert(schema.organizations)
    .values({
      clerkOrgId: data.clerkOrgId,
      name: data.name,
      region: data.region ?? "au",
      tier: data.tier ?? "free",
    })
    .onConflictDoUpdate({
      target: schema.organizations.clerkOrgId,
      set: { name: data.name, tier: data.tier ?? "free" },
    })
    .returning();
  return org;
}

// ── User ──────────────────────────────────────────────────────────────────────
export async function seedUser(data: {
  clerkUserId: string;
  organizationId: string;
  email: string;
  role?: string;
}) {
  const [user] = await db
    .insert(schema.users)
    .values({
      clerkUserId: data.clerkUserId,
      organizationId: data.organizationId,
      email: data.email,
      name: "[S1-QA] Test User",
      role: data.role ?? "owner",
    })
    .onConflictDoUpdate({
      target: schema.users.clerkUserId,
      set: { organizationId: data.organizationId, email: data.email },
    })
    .returning();
  return user;
}

// ── Brand ─────────────────────────────────────────────────────────────────────
export async function seedBrand(data: {
  organizationId: string;
  name?: string;
  domain?: string;
  vertical?: "tradies" | "allied_health" | "saas";
  region?: "au" | "nz" | "uk" | "us" | "ca" | "eu";
}) {
  const [brand] = await db
    .insert(schema.brands)
    .values({
      organizationId: data.organizationId,
      name: data.name ?? "[S1-QA] Test Brand",
      domain: data.domain ?? `s1-qa-${Date.now()}.com.au`,
      vertical: data.vertical ?? "tradies",
      region: data.region ?? "au",
      competitors: [],
      primaryRegions: ["NSW:Bondi"],
    })
    .returning();
  return brand;
}
