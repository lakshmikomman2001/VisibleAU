// app/api/visit/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/db/client';
import { brands, crawlerVisitLogs } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { brandToken, currentUrl, referrerHeader, isJsUserAgentActive } = body;

    if (!brandToken) return NextResponse.json({ error: 'MISSING_TOKEN' }, { status: 400 });

    // 1. Verify token authenticity against a cached brand row[cite: 5]
    const [brand] = await db.select().from(brands).where(eq(brands.brandToken, brandToken)).limit(1);
    if (!brand) return NextResponse.json({ error: 'UNAUTHORIZED_TOKEN' }, { status: 401 });

    // 2. Identify if interaction originates from a high-intent generative user assistant session[cite: 5]
    let isActiveAgent = false;
    let visitPurpose = 'indexing';

    if (referrerHeader?.includes('chatgpt.com') || referrerHeader?.includes('perplexity.ai') || isJsUserAgentActive) {
      isActiveAgent = true;
      visitPurpose = 'retrieval'; // Active user-intent session fetching live verification data[cite: 5]
    }

    // 3. Persist the log row idempotently for Layer 2 ROI tracking[cite: 5]
    await db.insert(crawlerVisitLogs).values({
      brandId: brand.id,
      organizationId: brand.organizationId,
      crawlerName: isActiveAgent ? 'AI-Assistant-User' : 'Passive-Bot',
      crawlerTier: 'must_allow',
      visitedUrl: currentUrl,
      isActiveAgent,
      visitPurpose,
      visitedAt: new Date(),
    });

    return NextResponse.json({ success: true }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: 'INTERNAL_SERVER_ERROR' }, { status: 500 });
  }
}