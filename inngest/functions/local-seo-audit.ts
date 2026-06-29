import { eq } from "drizzle-orm";
import { db, setRlsContext } from "@/db/client";
import { brands, localSeoResults } from "@/db/schema";
import { inngest } from "@/lib/inngest/client";
import { checkAuDirectories, type DirectoryResult } from "@/lib/local-seo/au-directories";
import { checkGmb } from "@/lib/local-seo/gmb-check";
import { checkNapConsistency, type NapSource } from "@/lib/local-seo/nap-consistency";
import { computeLocalSeoScore } from "@/lib/local-seo/score";
import { checkSuburbCoverage } from "@/lib/local-seo/suburb-coverage";

export const localSeoAuditFn = inngest.createFunction(
  { id: "local-seo-audit", retries: 2, triggers: [{ event: "audit.complete" }] },
  async ({ event, step }: { event: { data: { auditId: string; brandId?: string; organizationId?: string } }; step: any }) => {
    const { brandId: eventBrandId, organizationId: eventOrgId } = event.data;

    const brand = await step.run("load-brand", async () => {
      if (eventBrandId) {
        const [b] = await db.select().from(brands).where(eq(brands.id, eventBrandId));
        return b;
      }
      return null;
    });

    if (!brand) return { skipped: true, reason: "brand_not_found" };

    const organizationId = eventOrgId ?? brand.organizationId;
    const regionParts = (brand.primaryRegions as string[])?.[0]?.split(":");
    const suburb = regionParts && regionParts.length > 1 ? regionParts[regionParts.length - 1] : regionParts?.[0];

    const gmb = await step.run("check-gmb", () =>
      checkGmb(brand.domain, brand.name),
    );

    const directories = await step.run("check-directories", () =>
      checkAuDirectories(brand.domain, brand.name, suburb),
    );

    const napSources: NapSource[] = [
      { label: "website", name: brand.name, address: "", phone: "" },
      ...(gmb.present
        ? [{ label: "gmb", name: gmb.name ?? "", address: gmb.address ?? "", phone: gmb.phone ?? "" }]
        : []),
      ...directories
        .filter((d: DirectoryResult) => d.present)
        .map((d: DirectoryResult) => ({
          label: d.directory,
          name: d.name ?? brand.name,
          address: d.address ?? "",
          phone: d.phone ?? "",
        })),
    ];

    const nap = await step.run("check-nap", () =>
      checkNapConsistency(napSources),
    );

    const suburbs = await step.run("check-suburbs", () => {
      const regions = (brand.primaryRegions as string[]) ?? [];
      const suburbNames = regions.map((r) => r.split(":")[1] ?? r).filter(Boolean);
      return checkSuburbCoverage(suburbNames, null);
    });

    const scoreComposite = computeLocalSeoScore({ gmb, directories, nap, suburbs });

    await step.run("persist", async () => {
      await setRlsContext(db, organizationId);
      await db.insert(localSeoResults).values({
        brandId: brand.id,
        organizationId,
        gmbPresent: gmb.present,
        gmbCompleteness: String(gmb.completeness),
        gmbReviewCount: gmb.reviewCount ?? 0,
        gmbAvgRating: gmb.avgRating != null ? String(gmb.avgRating) : null,
        directoryPresence: directories,
        napConsistency: String(nap.score),
        napFindings: nap.findings,
        suburbCoverage: suburbs,
        scoreComposite: String(scoreComposite),
      });
    });

    return { brandId: brand.id, scoreComposite };
  },
);
