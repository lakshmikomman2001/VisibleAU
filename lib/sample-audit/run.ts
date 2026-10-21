import { serviceDb } from "@/db/client";
import { audits, brands } from "@/db/schema";
import { getNextAuditNumber } from "@/lib/audit/numbering";
import { runAuditInline } from "@/lib/audit/run-audit-inline";
import { normalizeBrandName } from "@/lib/brands/normalize";
import { METHODOLOGY_VERSION } from "@/lib/llm/methodology";
import { findLocation } from "@/lib/locations";
import { SAMPLE_AUDIT_CONFIG, SAMPLE_AUDIT_DEADLINE_MS } from "./config";
import { ensureSampleOrg } from "./synthetic-org";

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

/**
 * Reliability follow-up, item 4 -- AU_LOCATIONS is only 20 curated
 * suburbs; a business anywhere else (e.g. Norwest, which isn't in
 * that list) would otherwise have to pick a WRONG one, and the sample
 * would ask about a place that isn't theirs. "custom" models exactly
 * what the wizard already does for an uncurated suburb
 * (lib/locations.ts's resolveCityForSuburb -- NULL city, never
 * guessed, until Build 2's full ABS suburb dataset lands): a free-
 * text suburb plus a real AU state, honestly stored as "we don't know
 * the city for this one" rather than inventing one.
 */
export type SampleAuditLocation =
  | { type: "curated"; value: string }
  | { type: "custom"; suburb: string; state: string };

/**
 * Audit reliability, Part C, item 4 -- `location` is now required and
 * visitor-supplied (validated by app/api/sample-audit/route.ts's zod
 * schema before this function is ever called). Without a real
 * location, every non-Sydney business used to get questions about the
 * wrong city (the old hardcoded "NSW:Sydney") and would score near 0
 * for a reason that had nothing to do with their real AI visibility --
 * misleading for exactly the visitors this free tool exists to
 * attract.
 *
 * Vunnara (sample-audit follow-up, 20 Oct)'s own reasoning for why
 * this is exactly ONE location, not several, still applies: get-audit-
 * prompts.ts pulls `promptsCount` TEMPLATE ROWS, expands each one
 * across every listed location, flattens, THEN slices back down to
 * promptsCount -- more than one location would multiply a {location}
 * template into N variants before that final slice, drawing from
 * fewer distinct template questions instead of the intended variety.
 */
export async function runSampleAudit(
  domain: string,
  vertical: string,
  location: SampleAuditLocation,
): Promise<SampleAuditResult> {
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

  let suburb: string;
  let city: string | null;
  let state: string;
  let primaryRegion: string;
  if (location.type === "curated") {
    const loc = findLocation(location.value);
    if (!loc) {
      // Defensive only -- app/api/sample-audit/route.ts's zod schema
      // already restricts a "curated" value to a real AU_LOCATIONS
      // entry, so this never fires in practice. Never guessed/
      // defaulted: a brand row with a fabricated location would be
      // exactly the "no mock data" violation this whole item exists
      // to close.
      throw new Error(`Unknown location: ${location.value}`);
    }
    suburb = location.value.split(":").slice(1).join(":");
    city = loc.city;
    state = loc.state;
    primaryRegion = location.value;
  } else {
    // Reliability follow-up, item 4 -- "My suburb isn't listed":
    // exactly like the wizard's own uncurated-suburb path
    // (lib/locations.ts's resolveCityForSuburb returns NULL for any
    // suburb outside the curated AU_LOCATIONS list) -- city stays
    // NULL, never guessed. Build 2 brings the full ABS suburb dataset,
    // which is the real fix for this gap; until then this is honest,
    // not degraded -- the questions still name the real suburb and
    // state the visitor actually typed, just without a curated city
    // fallback for the rare {region}-only (not {location}) template.
    suburb = location.suburb.trim();
    city = null;
    state = location.state;
    primaryRegion = `${state}:${suburb}`;
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
      primaryRegions: [primaryRegion],
      // Audit reliability, Part C, item 4: a real, visitor-confirmed
      // location -- set with locationConfirmedAt exactly like a real
      // brand's own wizard confirmation (lib/brands/region-label.ts's
      // buildEngineLocation requires both locationMode: "fixed" and a
      // confirmed timestamp before it will bias an engine's web search
      // at all), not a guess, so this sample is treated identically to
      // any other confirmed-location brand downstream.
      suburb,
      city,
      state,
      locationMode: "fixed",
      locationConfirmedAt: new Date(),
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
    // Audit reliability, Part C, item 1 -- computed fresh, right
    // before the real work starts, not at module load: an epoch-ms
    // deadline comfortably inside the route's 60s maxDuration.
    deadlineAt: Date.now() + SAMPLE_AUDIT_DEADLINE_MS,
  }).catch((err) => console.error("[sample-audit] Inline execution failed:", err));

  return { auditId, brandId: brand.id, completion };
}
