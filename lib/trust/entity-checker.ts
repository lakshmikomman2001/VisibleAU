import { desc, eq } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { brandEntityScores } from "@/db/schema";
import { isMockMode } from "@/lib/mock-mode";
import { TRUST_CHECK_IMPLEMENTED } from "./stub-implementation-status";

export interface EntityCheckResult {
  // null = not implemented (TRUST_CHECK_IMPLEMENTED.knowledgePanel/wikidata
  // is false) -- distinct from a real measured "not present".
  knowledgePanelPresent: boolean | null;
  knowledgePanelAccurate: boolean | null;
  knowledgePanelUrl: string | null;
  wikidataEntryPresent: boolean | null;
  wikidataEntryUrl: string | null;
  /** null when the registry lookup didn't complete (leftovers task, part 3): the stored value is kept. */
  localRegVerified: boolean | null;
  localRegNumber: string | null;
}

export async function refreshEntityScore(
  tx: DbClient,
  brandId: string,
  organizationId: string,
  marketCode: string = "AU_EN",
): Promise<EntityCheckResult> {
  // 17 Nov, part 3: the brand's LATEST row -- the one the technical audit just wrote (its
  // technical-audit/complete event is what runs this, inngest/functions/refresh-entity-score.ts). It took
  // `.limit(1)` with no order, an arbitrary row (often the first ever), and stamped it checked_at = now: the
  // Entity Score page (latest row by checked_at) then showed that old row's facts as checked today. This
  // update is also what sets the row's organization_id (the technical audit's insert leaves it null, and the
  // page reads under RLS), so it must land on the new row.
  const existing = await tx
    .select()
    .from(brandEntityScores)
    .where(eq(brandEntityScores.brandId, brandId))
    .orderBy(desc(brandEntityScores.checkedAt))
    .limit(1);

  const current = existing[0];
  const abnAlreadyVerified = current?.abnVerified ?? false;

  let localRegVerified: boolean | null = abnAlreadyVerified;
  let localRegNumber = current?.abnNumber ?? null;

  if (!abnAlreadyVerified) {
    // Leftovers task, part 3 (17 Nov): a lookup that didn't complete changes nothing -- it wrote "not verified".
    const registryResult = await checkRegistry(marketCode, current?.abnNumber ?? null);
    localRegVerified = registryResult?.verified ?? null;
    localRegNumber = registryResult?.number ?? localRegNumber;
  }

  // Trust Intelligence honesty pass follow-up: checkKnowledgePanel and
  // checkWikidata are hardcoded stubs (always "not present") -- gated the
  // same way Consensus/LinkedIn/YouTube were, so a refresh never writes a
  // fabricated "not found" result over whatever (if anything) is already
  // stored. See docs/ops/post-launch-db-hardening.md section 35.
  const kpResult = TRUST_CHECK_IMPLEMENTED.knowledgePanel
    ? await checkKnowledgePanel(brandId)
    : null;
  const wdResult = TRUST_CHECK_IMPLEMENTED.wikidata ? await checkWikidata(brandId) : null;
  // Leftovers task, part 3 (17 Nov): no directory check. It was a stub that wrote "not on hipages, Yellow Pages,
  // ServiceSeeking or Word of Mouth" and a count of 0 for every brand, checking nothing.

  const updates: Record<string, unknown> = {
    organizationId,
    marketCode,
    ...(localRegVerified === null ? {} : { localRegVerified, localRegNumber }),
    ...(kpResult
      ? {
          knowledgePanelPresent: kpResult.present,
          knowledgePanelAccurate: kpResult.accurate,
          knowledgePanelUrl: kpResult.url,
        }
      : {}),
    ...(wdResult ? { wikidataEntryPresent: wdResult.present, wikidataEntryUrl: wdResult.url } : {}),
    // 17 Nov, part 3: no checked_at. This re-checks nothing the Entity Score page shows (the ABN result here
    // goes to local_reg_*, the directory and Knowledge Panel/Wikidata checks are stubs); the ABN, .au and
    // Wikipedia facts were checked when the technical audit wrote the row, and checked_at says when.
  };

  if (current) {
    await tx.update(brandEntityScores).set(updates).where(eq(brandEntityScores.id, current.id));
  }

  return {
    knowledgePanelPresent: kpResult?.present ?? null,
    knowledgePanelAccurate: kpResult?.accurate ?? null,
    knowledgePanelUrl: kpResult?.url ?? null,
    wikidataEntryPresent: wdResult?.present ?? null,
    wikidataEntryUrl: wdResult?.url ?? null,
    localRegVerified,
    localRegNumber,
  };
}

async function checkRegistry(
  marketCode: string,
  existingNumber: string | null,
): Promise<{ verified: boolean; number: string | null } | null> {
  // Mock mode counts any stored ABN as verified without a lookup: local development only. isMockMode() throws
  // in production, so the check fails and stores nothing, and an ABN is never "verified" unless the ABR said so.
  if (isMockMode()) {
    return { verified: !!existingNumber, number: existingNumber };
  }

  if (marketCode.startsWith("AU") && existingNumber) {
    try {
      const res = await fetch(
        `https://abr.business.gov.au/json/AbnDetails.aspx?abn=${existingNumber}&callback=cb`,
        { signal: AbortSignal.timeout(10_000) },
      );
      // Leftovers task, part 3: an HTTP error, a timeout or an answer that isn't the register's is "couldn't check"
      // (null), never "not verified".
      if (!res.ok) return null;
      const text = await res.text();
      const match = text.match(/cb\((.*)\)/);
      if (!match) return null;
      const data = JSON.parse(match[1]);
      return { verified: data.Abn === existingNumber, number: existingNumber };
    } catch {
      return null;
    }
  }

  // No ABN to look up (or not an Australian market): nothing was checked; keep what's stored.
  return null;
}

// The two checks below are stubs, the same in every mode (each had a mock branch identical to its other one).
async function checkKnowledgePanel(
  _brandId: string,
): Promise<{ present: boolean; accurate: boolean | null; url: string | null }> {
  return { present: false, accurate: null, url: null };
}

async function checkWikidata(_brandId: string): Promise<{ present: boolean; url: string | null }> {
  return { present: false, url: null };
}
