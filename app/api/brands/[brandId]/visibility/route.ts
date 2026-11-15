import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertBrandAccess, brandAccessErrorResponse } from "@/lib/governance";
import { effectiveTier } from "@/lib/pricing/effective-tier";
import { mentionsAndSourcesForLatestAudit } from "@/lib/visibility/mentions-and-sources-for-audit";
import {
  latestCompleteAudit,
  shareOfVoiceForAudit,
  sovPayload,
} from "@/lib/visibility/share-of-voice";

export async function GET(_req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId } = await params;
  if (!z.string().uuid().safeParse(brandId).success)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await assertBrandAccess(currentUser, brandId);
  } catch (e) {
    const res = brandAccessErrorResponse(e);
    if (res) return res;
    throw e;
  }

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [brand] = await tx
      .select()
      .from(brands)
      .where(
        and(
          eq(brands.id, brandId),
          eq(brands.organizationId, currentUser.organizationId),
          isNull(brands.deletedAt),
        ),
      );
    if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const tier = await effectiveTier(tx, currentUser.organizationId);

    // One Share of Voice (7 Nov): the brand's latest complete audit, counted by the one counter the
    // Overview, audit page, PDF and wins feed read -- never the retired share_of_voice_snapshots rows
    // (the brand against every cited site), and never a share computed in the browser.
    const shareOfVoice = await shareOfVoiceForAudit(
      tx,
      {
        id: brand.id,
        name: brand.name,
        competitors: brand.competitors,
        competitorWebsites: brand.competitorWebsites,
      },
      await latestCompleteAudit(tx, brandId),
    );

    // 17 Nov, part 1: the "Mentions and sources" card is the latest complete audit's own figures, by the audit
    // page's definitions (lib/visibility/mentions-and-sources.ts) -- never the weekly trend row's. Part 3: and the
    // page reads no visibility_trends row at all (its volatility chip, the spread of that row's own-domain
    // "citation rate" over 12 rows of any period, methodology or questions, is gone).
    const mentionsAndSources = await mentionsAndSourcesForLatestAudit(tx, brandId);

    return NextResponse.json({
      mentionsAndSources,
      shareOfVoice: sovPayload(shareOfVoice, currentUser.organizationId),
      tier,
      brandDomain: brand.domain ?? "",
    });
  });
}
