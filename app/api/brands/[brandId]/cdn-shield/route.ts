import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { withRlsContext } from "@/db/client";
import { brands } from "@/db/schema";
import { assertBrandAccess, BrandAccessDeniedError } from "@/lib/governance";
import { CdnShieldDetector } from "@/lib/crawler/cdn-shield-detector";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ brandId: string }> },
) {
  const { brandId } = await params;
  if (!z.string().uuid().safeParse(brandId).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await assertBrandAccess(currentUser, brandId);
  } catch (e) {
    if (e instanceof BrandAccessDeniedError)
      return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
    throw e;
  }

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [brand] = await tx
      .select({ id: brands.id, domain: brands.domain })
      .from(brands)
      .where(and(eq(brands.id, brandId), eq(brands.organizationId, currentUser.organizationId)));

    if (!brand) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(`https://${brand.domain}`, {
        method: "GET",
        headers: { "User-Agent": "GPTBot/1.1" },
        redirect: "manual",
        signal: controller.signal,
      });
      clearTimeout(timer);

      const headers: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        headers[key] = value;
      });

      const diagnostic = CdnShieldDetector.analyzeHeaders(res.status, headers);

      return NextResponse.json({
        ...diagnostic,
        brandDomain: brand.domain,
        probeStatus: res.status,
      });
    } catch {
      return NextResponse.json({
        isBlockedByCDN: false,
        detectedFirewall: "None",
        remediationSnippet: "Unable to probe domain — check that the domain is accessible.",
        brandDomain: brand.domain,
        probeStatus: null,
      });
    }
  });
}
