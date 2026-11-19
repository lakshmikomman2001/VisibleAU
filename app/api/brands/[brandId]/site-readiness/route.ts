import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands, technicalAudits } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  assertBrandAccess,
  assertTier,
  brandAccessErrorResponse,
  TierInsufficientError,
  tierRefusal,
} from "@/lib/governance";
import { brandFeaturePlan } from "@/lib/pricing/brand-features";
import { crawlReach } from "@/lib/technical-audit/crawl-status";
import { compositeMaxFor, TECHNICAL_AUDIT_MAX_SCORE } from "@/lib/technical-audit/score-aggregator";

export async function GET(_req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  if (!z.string().uuid().safeParse(brandId).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await assertTier(currentUser.organizationId, brandFeaturePlan("site_readiness"));
  } catch (e) {
    if (e instanceof TierInsufficientError) return tierRefusal(e);
    throw e;
  }

  try {
    await assertBrandAccess(currentUser, brandId);
  } catch (e) {
    const res = brandAccessErrorResponse(e);
    if (res) return res;
    throw e;
  }

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [brand] = await tx
      .select({ id: brands.id })
      .from(brands)
      .where(and(eq(brands.id, brandId), eq(brands.organizationId, currentUser.organizationId)));

    if (!brand) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [latest] = await tx
      .select({
        scoreComposite: technicalAudits.scoreComposite,
        findings: technicalAudits.findings,
        createdAt: technicalAudits.createdAt,
      })
      .from(technicalAudits)
      .where(eq(technicalAudits.brandId, brandId))
      .orderBy(desc(technicalAudits.createdAt))
      .limit(1);

    // 17 Nov, part 3: a crawl that never reached the site has no site-readiness score (an older row still
    // stores the scorers' zeros for it); siteUnreachable says why.
    const siteUnreachable = latest ? crawlReach(latest.findings).kind === "unreached" : false;

    // Health Check (7 Nov): the score on its own scale (out of TECHNICAL_AUDIT_MAX_SCORE, not 100)
    // and when it was checked, so the card can say both.
    return NextResponse.json({
      scoreComposite: siteUnreachable ? null : (latest?.scoreComposite ?? null),
      // 19 Nov: the audit's own maximum (95 from 19 Nov, 98 while the /ai/ files counted, 100 before 21 Oct).
      maxScore: latest
        ? compositeMaxFor(
            latest.createdAt,
            (latest.findings as { aiDiscovery?: { optionalFilesScored?: boolean } } | null)
              ?.aiDiscovery,
          )
        : TECHNICAL_AUDIT_MAX_SCORE,
      checkedAt: latest?.createdAt ?? null,
      siteUnreachable,
    });
  });
}
