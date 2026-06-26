import { db, schema }         from './db';
import { eq, and, isNull, inArray } from 'drizzle-orm';

export async function seedOrg(p: {
  clerkOrgId: string; name: string; tier?: string;
  ga4MeasurementId?: string | null; ga4ApiSecret?: string | null;
}) {
  const [o] = await db.insert(schema.organizations)
    .values({
      clerkOrgId:       p.clerkOrgId,
      name:             p.name,
      region:           'au',
      tier:             p.tier ?? 'agency',
      ga4MeasurementId: p.ga4MeasurementId ?? null,
      ga4ApiSecret:     p.ga4ApiSecret     ?? null,
    })
    .onConflictDoUpdate({
      target: schema.organizations.clerkOrgId,
      set:    { name: p.name, tier: p.tier ?? 'agency' },
    })
    .returning();
  return o;
}

export async function seedUser(p: { clerkUserId: string; organizationId: string; email: string }) {
  const [u] = await db.insert(schema.users)
    .values({ clerkUserId: p.clerkUserId, organizationId: p.organizationId,
              email: p.email, name: '[S9QA]', role: 'owner' })
    .onConflictDoUpdate({ target: schema.users.clerkUserId,
      set: { organizationId: p.organizationId } })
    .returning();
  return u;
}

export async function seedBrand(p: {
  organizationId: string; name?: string; clientTag?: string | null;
}) {
  const [b] = await db.insert(schema.brands).values({
    organizationId: p.organizationId,
    name:           p.name ?? '[S9QA] Brand',
    domain:         `s9qa-${Date.now()}-${Math.random().toString(36).slice(2,7)}.com.au`,
    vertical: 'tradies', region: 'au', competitors: [],
    primaryRegions: ['NSW:Bondi'],
    clientTag:      p.clientTag ?? null,
  }).returning();
  return b;
}

export async function seedAudit(p: {
  organizationId: string; brandId: string;
  auditNumber?: number; scoreComposite?: string; createdAt?: Date;
}) {
  const [a] = await db.insert(schema.audits).values({
    organizationId: p.organizationId,
    brandId:        p.brandId,
    auditNumber:    p.auditNumber ?? 1,
    triggeredBy:    'manual',
    status:         'complete',
    engines:        ['chatgpt','claude','gemini','perplexity'],
    runsPerPrompt: 5, promptsCount: 10, promptCount: 10, totalCalls: 200, engineCount: 4,
    scoreFrequency: '42.00', scorePosition: '55.00', scoreAccuracy: '38.00',
    scoreSentimentNumeric: '67.00', scoreContextNumeric: '51.00',
    scoreComposite: p.scoreComposite ?? '58.40',
    confidenceIntervals: { frequency: { lower: 0.32, upper: 0.54 } },
    totalCostUsd: '1.89',
    metadata:    { mockScenario: 's9qa' },
    startedAt:   new Date(Date.now() - 252_000),
    completedAt: new Date(),
    createdAt:   p.createdAt ?? new Date(),
  }).returning();
  return a;
}

export async function seedAgencyBrandAsset(p: {
  organizationId: string;
  brandId: string | null;
  primaryColor?: string;
  agencyName?: string;
}) {
  if (p.brandId === null) {
    const existing = await db.select({ id: schema.agencyBrandAssets.id })
      .from(schema.agencyBrandAssets)
      .where(and(
        eq(schema.agencyBrandAssets.organizationId, p.organizationId),
        isNull(schema.agencyBrandAssets.brandId),
      ));
    if (existing.length > 0) {
      const [r] = await db.update(schema.agencyBrandAssets)
        .set({
          primaryColor: p.primaryColor ?? '#003366',
          agencyName:   p.agencyName ?? '[S9QA] Agency',
          updatedAt:    new Date(),
        })
        .where(eq(schema.agencyBrandAssets.id, existing[0].id))
        .returning();
      return r;
    }
  }
  const [r] = await db.insert(schema.agencyBrandAssets)
    .values({
      organizationId: p.organizationId,
      brandId:        p.brandId,
      primaryColor:   p.primaryColor ?? '#003366',
      secondaryColor: '#1A1A1A',
      accentColor:    '#FF6B35',
      agencyName:     p.agencyName ?? '[S9QA] Agency',
      contactEmail:   'qa@s9qa.com.au',
      updatedAt:      new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.agencyBrandAssets.organizationId, schema.agencyBrandAssets.brandId],
      set: {
        primaryColor: p.primaryColor ?? '#003366',
        agencyName:   p.agencyName ?? '[S9QA] Agency',
        updatedAt:    new Date(),
      },
    })
    .returning();
  return r;
}

export async function seedClientPortalInvite(p: {
  organizationId: string;
  brandId: string;
  isRevoked?: boolean;
  inviteeEmail?: string | null;
  expiresAt?: Date | null;
}) {
  const { nanoid } = await import('nanoid');
  const token = nanoid(32);
  const [i] = await db.insert(schema.clientPortalInvites).values({
    organizationId: p.organizationId,
    brandId:        p.brandId,
    inviteToken:    token,
    inviteeEmail:   p.inviteeEmail ?? null,
    status:         'active',
    expiresAt:      p.expiresAt ?? new Date(Date.now() + 30 * 86_400_000),
    isRevoked:      p.isRevoked ?? false,
    createdAt:      new Date(),
  }).returning();
  return i;
}

export async function seedAuditSchedule(p: {
  organizationId: string; brandId: string;
  frequency: string; status?: string; nextRunAt?: Date;
}) {
  const [s] = await db.insert(schema.auditSchedules).values({
    organizationId: p.organizationId,
    brandId:        p.brandId,
    frequency:      p.frequency,
    status:         p.status ?? 'active',
    nextRunAt:      p.nextRunAt ?? new Date(Date.now() + 86_400_000),
    updatedAt:      new Date(),
    createdAt:      new Date(),
  }).returning();
  return s;
}

export async function seedNotificationPrefs(p: {
  organizationId: string; email: string; weeklyDigest?: boolean;
}) {
  const [n] = await db.insert(schema.notificationPreferences)
    .values({
      organizationId:         p.organizationId,
      digestEmail:            p.email,
      weeklyDigest:           p.weeklyDigest ?? true,
      emailOnDrift:           true,
      emailOnAuditComplete:   false,
      emailOnScheduleFailure: true,
      updatedAt:              new Date(),
      createdAt:              new Date(),
    })
    .onConflictDoUpdate({
      target: schema.notificationPreferences.organizationId,
      set: {
        digestEmail:   p.email,
        weeklyDigest:  p.weeklyDigest ?? true,
        updatedAt:     new Date(),
      },
    })
    .returning();
  return n;
}

export async function cleanupOrg(orgId: string) {
  await db.delete(schema.clientPortalViews)
    .where(eq(schema.clientPortalViews.organizationId, orgId)).catch(() => {});
  await db.delete(schema.clientPortalInvites)
    .where(eq(schema.clientPortalInvites.organizationId, orgId)).catch(() => {});
  await db.delete(schema.bulkOperations)
    .where(eq(schema.bulkOperations.organizationId, orgId)).catch(() => {});
  await db.delete(schema.auditSchedules)
    .where(eq(schema.auditSchedules.organizationId, orgId)).catch(() => {});
  await db.delete(schema.notificationPreferences)
    .where(eq(schema.notificationPreferences.organizationId, orgId)).catch(() => {});
  await db.delete(schema.agencyBrandAssets)
    .where(eq(schema.agencyBrandAssets.organizationId, orgId)).catch(() => {});
  const brands = await db.select({ id: schema.brands.id })
    .from(schema.brands).where(eq(schema.brands.organizationId, orgId));
  if (brands.length) {
    const bids = brands.map(b => b.id);
    await db.delete(schema.audits)
      .where(inArray(schema.audits.brandId, bids)).catch(() => {});
  }
  await db.delete(schema.brands)
    .where(eq(schema.brands.organizationId, orgId)).catch(() => {});
  await db.delete(schema.users)
    .where(eq(schema.users.organizationId, orgId)).catch(() => {});
  await db.delete(schema.organizations)
    .where(eq(schema.organizations.id, orgId)).catch(() => {});
}
