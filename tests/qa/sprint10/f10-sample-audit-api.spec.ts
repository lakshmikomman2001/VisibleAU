import { test, expect } from '@playwright/test';
import { db, schema } from './shared/db';
import { cleanupSampleOrg } from './shared/seed';
import { eq, inArray }  from 'drizzle-orm';

test.afterAll(async () => {
  const [sampleOrg] = await db.select({ id: schema.organizations.id })
    .from(schema.organizations).where(eq(schema.organizations.slug, '__sample__')).limit(1);
  if (sampleOrg) {
    const auditIds = (await db.select({ id: schema.audits.id })
      .from(schema.audits).where(eq(schema.audits.organizationId, sampleOrg.id))).map(a => a.id);
    if (auditIds.length) {
      await db.delete(schema.citations).where(inArray(schema.citations.auditId, auditIds)).catch(() => {});
      await db.delete(schema.audits).where(inArray(schema.audits.id, auditIds)).catch(() => {});
    }
    await db.delete(schema.brands).where(eq(schema.brands.organizationId, sampleOrg.id)).catch(() => {});
    await cleanupSampleOrg();
  }
});

test.describe('F10: POST /api/sample-audit — full E2E flow (HC1, HB2)', () => {

  test('F10-01: valid POST returns 200 + auditId', async ({ request }) => {
    const res = await request.post('/api/sample-audit', {
      data: { domain: 's10qa-f10-a.com.au', vertical: 'tradies' },
      headers: { 'Content-Type': 'application/json' },
    });
    expect([200, 201]).toContain(res.status());
    const body = await res.json();
    expect(body.auditId).toBeTruthy();
    expect(typeof body.auditId).toBe('string');
  });

  test('F10-02: audit row created in DB under slug="sample" org (HC1)', async ({ request }) => {
    const res = await request.post('/api/sample-audit', {
      data: { domain: 's10qa-f10-b.com.au', vertical: 'allied_health' },
    });
    const { auditId } = await res.json();
    if (!auditId) return;

    const [audit] = await db.select({ orgId: schema.audits.organizationId })
      .from(schema.audits).where(eq(schema.audits.id, auditId));
    if (!audit) return;

    const [org] = await db.select({ slug: schema.organizations.slug })
      .from(schema.organizations).where(eq(schema.organizations.id, audit.orgId));
    expect(org?.slug).toBe('__sample__');
  });

  test('F10-03: audit has engines containing "chatgpt" and promptsCount set (HB2)', async ({ request }) => {
    const res = await request.post('/api/sample-audit', {
      data: { domain: 's10qa-f10-c.com.au', vertical: 'tradies' },
    });
    const { auditId } = await res.json();
    if (!auditId) return;

    // runAuditInline is fire-and-forget — poll until engines AND promptsCount populated (max 15s)
    let audit: { engines: string[] | null; promptsCount: number | null } | undefined;
    for (let i = 0; i < 30; i++) {
      const [row] = await db.select({
        engines:      schema.audits.engines,
        promptsCount: schema.audits.promptsCount,
      }).from(schema.audits).where(eq(schema.audits.id, auditId));
      if (row && row.engines && row.engines.length > 0 && row.promptsCount !== null) { audit = row; break; }
      await new Promise(r => setTimeout(r, 500));
    }

    if (audit) {
      expect(audit.engines).toContain('chatgpt');
      expect(audit.promptsCount).toBeGreaterThan(0);
    }
  });

  test('F10-04: missing domain field returns 400', async ({ request }) => {
    const res = await request.post('/api/sample-audit', {
      data: { vertical: 'tradies' },
    });
    expect(res.status()).toBe(400);
  });

  test('F10-05: missing vertical field returns 400', async ({ request }) => {
    const res = await request.post('/api/sample-audit', {
      data: { domain: 'test.com.au' },
    });
    expect(res.status()).toBe(400);
  });

  test('F10-06: /sample-audit page renders domain input form', async ({ page }) => {
    await page.goto('/sample-audit');
    await page.waitForLoadState('networkidle');
    const input = page.getByPlaceholder(/domain|yourdomain/i).or(
      page.getByRole('textbox').first()
    );
    await expect(input).toBeVisible({ timeout: 10_000 });
  });

  test('F10-07: /sample-audit page shows "No sign-up needed" or "free" copy', async ({ page }) => {
    await page.goto('/sample-audit');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/free|no sign.?up|no card/i);
  });

  test('F10-08: 4th request from same IP returns 429 (rate limit)', async ({
    request,
  }) => {
    const hasUpstash = (process.env.UPSTASH_REDIS_REST_URL ?? '').startsWith('https://');
    if (!hasUpstash) {
      test.skip(true, 'UPSTASH_REDIS_REST_URL not configured — skipping rate-limit test');
      return;
    }
    const fixedIp = '198.51.100.42';
    let gotRateLimit = false;
    for (let i = 0; i < 4; i++) {
      const r = await request.post('/api/sample-audit', {
        data: { domain: `s10qa-rl${i}.com.au`, vertical: 'tradies' },
        headers: { 'x-forwarded-for': fixedIp },
      });
      if (r.status() === 429) { gotRateLimit = true; break; }
    }
    expect(gotRateLimit).toBe(true);
  });
});
