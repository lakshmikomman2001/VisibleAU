import { test, expect } from '@playwright/test';

test.describe('F09: Sample audit status API (public)', () => {
  test('F09-01: invalid UUID returns 404', async ({ request }) => {
    const res = await request.get('/api/sample-audit/not-a-uuid/status');
    expect(res.status()).toBe(404);
  });

  test('F09-02: random valid UUID returns 404 (not a sample audit)', async ({ request }) => {
    const res = await request.get('/api/sample-audit/00000000-0000-0000-0000-000000000000/status');
    expect(res.status()).toBe(404);
  });

  test('F09-03: endpoint does not require authentication', async ({ request }) => {
    const res = await request.get('/api/sample-audit/00000000-0000-0000-0000-000000000001/status');
    expect(res.status()).not.toBe(401);
    expect(res.status()).not.toBe(403);
  });
});
