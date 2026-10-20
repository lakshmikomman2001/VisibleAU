import { serviceDb } from "@/db/client";
import { audits, brands } from "@/db/schema";
import { getNextAuditNumber } from "@/lib/audit/numbering";
import { runAuditInline } from "@/lib/audit/run-audit-inline";
import { normalizeBrandName } from "@/lib/brands/normalize";
import { METHODOLOGY_VERSION } from "@/lib/llm/methodology";
import { SAMPLE_AUDIT_CONFIG } from "./config";
import { ensureSampleOrg } from "./synthetic-org";

// Vunnara (sample-audit follow-up, 20 Oct): a single location, not 3
// (Sydney/Melbourne/Brisbane). A sample brand needs AT LEAST one real
// location so {location}-templated vertical-pack prompts expand at all
// (lib/verticals/expand-prompt.ts returns [] for an empty list) -- that
// was the original reason this existed. But get-audit-prompts.ts pulls
// `promptsCount` TEMPLATE ROWS, expands each one across every listed
// location, flattens, THEN slices back down to promptsCount -- with 3
// locations, a {location} template multiplies into 3 variants before
// that final slice, so SAMPLE_AUDIT_CONFIG.promptsCount (6) ends up
// drawing from only its first ~2 ranked templates (each x3 cities), not
// 6 actually distinct questions. One location keeps the sample
// representative of real question VARIETY (6 different template
// questions) rather than the same ~2 questions asked 3 ways.
const SAMPLE_PRIMARY_REGIONS = ["NSW:Sydney"];

export interface SampleAuditResult {
  auditId: string;
  brandId: string;
  // Vunnara (sample-audit follow-up, 20 Oct): the background execution
  // promise, started below -- already running by the time this
  // function returns, same as before this fix, so a caller that
  // ignores this field (every pre-existing caller, including direct
  // script/test invocations outside any Next.js request) sees
  // byte-identical behaviour. A caller that IS inside a real request
  // (app/api/sample-audit/route.ts) passes this straight to `after()`
  // (next/server) so the platform keeps the invocation alive until it
  // settles -- `after()` itself must be called from within a request
  // scope (it throws otherwise, confirmed directly: Next.js's own
  // after.ts checks workAsyncStorage.getStore()), which is exactly why
  // this lives in the route, not in here.
  completion: Promise<void>;
}

export async function runSampleAudit(domain: string, vertical: string): Promise<SampleAuditResult> {
  // Vunnara (sample-audit follow-up, 20 Oct): the real shape is now 12
  // planned calls (SAMPLE_AUDIT_CONFIG), not the old, never-wired 5 --
  // the cost estimate below (and this cap) moved with it. Default cap
  // kept comfortably above the new estimate (A$0.70), not coincidentally
  // equal to it the way the old 0.10/0.10 pair was (see config.ts).
  const capAud = parseFloat(process.env.SAMPLE_AUDIT_COST_CAP_AUD ?? "1.00");
  if (SAMPLE_AUDIT_CONFIG.estimatedCostAud > capAud) {
    throw new Error(
      `Estimated cost A$${SAMPLE_AUDIT_CONFIG.estimatedCostAud} exceeds cap A$${capAud}`,
    );
  }

  const sampleOrg = await ensureSampleOrg();

  const [brand] = await serviceDb
    .insert(brands)
    .values({
      organizationId: sampleOrg.id,
      // Vunnara Build 1, Part A: same write-time normalisation as the
      // real brand create/update routes, even though this value comes
      // from a domain string, not a free-text name field.
      name: normalizeBrandName(domain),
      domain,
      vertical: vertical as any,
      region: "au",
      primaryRegions: SAMPLE_PRIMARY_REGIONS,
    })
    .returning();

  const { auditId } = await serviceDb.transaction(async (tx) => {
    const num = await getNextAuditNumber(sampleOrg.id, tx);
    const [inserted] = await tx
      .insert(audits)
      .values({
        brandId: brand.id,
        organizationId: sampleOrg.id,
        auditNumber: num,
        triggeredBy: "sample",
        status: "pending",
        metadata: {
          isSample: true,
          costAud: SAMPLE_AUDIT_CONFIG.estimatedCostAud,
        },
        promptPackVersion: brand.promptPackVersion ?? 1,
        methodologyVersion: METHODOLOGY_VERSION,
      })
      .returning({ id: audits.id });
    return { auditId: inserted.id };
  });

  // SAMPLE_AUDIT_CONFIG's engines/promptsCount/runsPerPrompt/
  // concurrencyLimit are now ACTUALLY threaded into execution (see
  // runAuditInline's own doc comment) -- before this fix they were
  // declared but never passed anywhere, and the sample silently ran
  // the free tier's real defaults instead (2 engines x the global
  // 10-prompt count). Started immediately (fire-and-forget, same as
  // before this fix) so a direct caller outside any HTTP request
  // (scripts, tests) sees unchanged behaviour -- see `completion`'s
  // own doc comment on SampleAuditResult for why app/api/sample-audit/
  // route.ts additionally wraps this exact promise in `after()`.
  const completion = runAuditInline(auditId, {
    engines: SAMPLE_AUDIT_CONFIG.engines,
    promptsCount: SAMPLE_AUDIT_CONFIG.promptsCount,
    runsPerPrompt: SAMPLE_AUDIT_CONFIG.runsPerPrompt,
    concurrencyLimit: SAMPLE_AUDIT_CONFIG.concurrencyLimit,
  }).catch((err) => console.error("[sample-audit] Inline execution failed:", err));

  return { auditId, brandId: brand.id, completion };
}
