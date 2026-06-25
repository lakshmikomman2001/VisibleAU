import { db, schema }    from './db';
import { eq, inArray }   from 'drizzle-orm';

export async function seedOrg(p: {
  clerkOrgId: string;
  name:       string;
  tier?:      string;
  metadata?:  Record<string, unknown>;
  slug?:      string | null;
}) {
  const existing = await db.select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(eq(schema.organizations.clerkOrgId, p.clerkOrgId)).limit(1);
  if (existing.length) await cleanupOrg(existing[0].id);

  const [o] = await db.insert(schema.organizations)
    .values({
      clerkOrgId:         p.clerkOrgId,
      name:               p.name,
      region:             'au',
      tier:               p.tier               ?? 'free',
      metadata:           p.metadata           ?? {},
      slug:               p.slug               ?? null,
      onboardingComplete: false,
    })
    .returning();
  return o;
}

export async function seedUser(p: {
  clerkUserId:    string;
  organizationId: string;
  email:          string;
}) {
  const [u] = await db.insert(schema.users)
    .values({ clerkUserId: p.clerkUserId, organizationId: p.organizationId,
              email: p.email, name: '[S10QA]', role: 'owner' })
    .onConflictDoUpdate({ target: schema.users.clerkUserId,
      set: { organizationId: p.organizationId } })
    .returning();
  return u;
}

export async function seedBrand(p: {
  organizationId: string;
  name?:          string;
  domain?:        string;
}) {
  const [b] = await db.insert(schema.brands)
    .values({
      organizationId: p.organizationId,
      name:           p.name   ?? '[S10QA] Brand',
      domain:         p.domain ?? `s10qa-${Date.now()}.com.au`,
      vertical: 'tradies', region: 'au', competitors: [],
      primaryRegions: ['NSW:Sydney'],
    })
    .returning();
  return b;
}

export async function seedSubscription(p: {
  organizationId:       string;
  tier?:                string;
  billingInterval?:     'monthly' | 'annual';
  status?:              string;
  cancelAtPeriodEnd?:   boolean;
  stripeCustomerId?:    string;
  stripeSubscriptionId?: string;
  stripePriceId?:       string;
}) {
  const now    = new Date();
  const month  = new Date(now); month.setMonth(month.getMonth() + 1);
  const [s] = await db.insert(schema.subscriptions)
    .values({
      organizationId:       p.organizationId,
      stripeCustomerId:     p.stripeCustomerId    ?? `cus_s10qa_${Date.now()}`,
      stripeSubscriptionId: p.stripeSubscriptionId ?? `sub_s10qa_${Date.now()}`,
      stripePriceId:        p.stripePriceId       ?? process.env.STRIPE_PRICE_STARTER_MONTHLY!,
      tier:                 p.tier                ?? 'starter',
      billingInterval:      p.billingInterval      ?? 'monthly',
      status:               p.status              ?? 'active',
      cancelAtPeriodEnd:    p.cancelAtPeriodEnd    ?? false,
      currentPeriodStart:   now,
      currentPeriodEnd:     month,
      metadata:             {},
    })
    .returning();
  return s;
}

export async function cleanupOrg(orgId: string) {
  if (!orgId) return;
  const auditIds = (await db.select({ id: schema.audits.id })
    .from(schema.audits)
    .where(eq(schema.audits.organizationId, orgId))).map(a => a.id);

  if (auditIds.length) {
    await db.delete(schema.citations)
      .where(inArray(schema.citations.auditId, auditIds)).catch(() => {});
  }
  await db.delete(schema.audits)
    .where(eq(schema.audits.organizationId, orgId)).catch(() => {});
  await db.delete(schema.brands)
    .where(eq(schema.brands.organizationId, orgId)).catch(() => {});
  await db.delete(schema.users)
    .where(eq(schema.users.organizationId, orgId)).catch(() => {});
  await db.delete(schema.subscriptions)
    .where(eq(schema.subscriptions.organizationId, orgId)).catch(() => {});
  await db.delete(schema.organizations)
    .where(eq(schema.organizations.id, orgId)).catch(() => {});
}

export async function cleanupSampleOrg() {
  const [org] = await db.select({ id: schema.organizations.id })
    .from(schema.organizations)
    .where(eq(schema.organizations.slug, 'sample')).limit(1);
  if (org) await cleanupOrg(org.id);
}

export async function cleanupWebhookEvent(stripeEventId: string) {
  await db.delete(schema.processedWebhookEvents)
    .where(eq(schema.processedWebhookEvents.stripeEventId, stripeEventId)).catch(() => {});
}
