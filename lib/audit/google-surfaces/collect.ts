import { and, eq, inArray, sql } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { auditCostSnapshots, auditGoogleSurfaces, brands, googleSurfaceResults } from "@/db/schema";
import { GOOGLE_COST_SOURCE } from "@/lib/audit/answered-count";
import { detectBrandMention } from "@/lib/audit/detect-mention";
import { verifyMention } from "@/lib/audit/verify-mention";
import { usdToAudCents } from "@/lib/constants/currency";
import type { GoogleLocation } from "@/lib/google-surfaces/location";
import {
  type GoogleQueueMode,
  type GoogleSurface,
  googleSurfacesEnvEnabled,
} from "@/lib/governance/google-surfaces";
import { BudgetPolicyService } from "@/lib/platform/budget-policy.service";
import { hasGoogleSurfaceProviderCredentials } from "@/lib/serp/credentials";
import { DataForSeoProvider } from "@/lib/serp/dataforseo";
import type { GoogleSurfaceProvider, SurfaceTarget, TaskPoll } from "@/lib/serp/provider";
import type { GoogleCollectEventData, StoredGoogleSettings } from "./dispatch";

/**
 * Google AI surfaces, Phase 1, part 2 -- collecting one audit's Google AI Overviews and AI Mode answers,
 * after its four engines have finished (inngest/functions/collect-google-surfaces.ts runs it, in its own
 * steps). Waiting never holds a function open: the questions are posted, then fetched after step.sleep
 * with backoff, up to GOOGLE_COLLECT_CEILING_MS; what's still waiting then is "not completed".
 *
 * Every provider call first checks:
 * - the env kill switch (off: everything still to do is skipped, "switched off");
 * - the per-audit cost ceiling (stored on the audit at its start): questions past it are skipped, saying so;
 * - before posting, the daily spend cap, with the core engines first: Google is skipped unless the day's
 *   spend plus Google's estimate still leaves room for one more core audit.
 * The cost recorded is what the provider reports per task, never a guessed refund.
 */

export interface GoogleStepTools {
  run<T>(id: string, fn: () => Promise<T>): Promise<T>;
  sleep(id: string, ms: number): Promise<unknown>;
  sendEvent(id: string, payload: { name: string; data: Record<string, unknown> }): Promise<unknown>;
}

/** After this long, a question still waiting is "not completed" (Sri, 8 Nov: e.g. 15 minutes). */
export const GOOGLE_COLLECT_CEILING_MS = 15 * 60_000;
/** Waits between fetches: 20 s first (AI Mode answered in 0.1-1.0 min on 11 Nov), 15 minutes in all. */
export const GOOGLE_POLL_DELAYS_S = [20, 30, 45, 60, 90, 120, 150, 180, 205] as const;
const MAX_ATTEMPTS = 2;

/**
 * The provider's published price per question (docs/research/google-ai-surfaces.md 1.2; the 11 Nov sample
 * was charged 0.0012 for both in the standard queue), used only to keep under the ceiling and the daily
 * cap before posting. Priority takes the dearer of DataForSEO's two published overview surcharges.
 */
export const GOOGLE_PRICE_PER_QUESTION_USD: Record<
  GoogleQueueMode,
  Record<GoogleSurface, number>
> = {
  standard: { google_ai_overviews: 0.0012, google_ai_mode: 0.0012 },
  priority: { google_ai_overviews: 0.0024, google_ai_mode: 0.0024 },
  live: { google_ai_overviews: 0.004, google_ai_mode: 0.004 },
};

const REASON = {
  switchedOff: "Skipped: Google was switched off (GOOGLE_AI_SURFACES_ENABLED) during the audit.",
  noCredentials: "Skipped: the provider's credentials aren't set.",
  dailyCap:
    "Skipped: today's spend limit -- Google is skipped first so the four engines can still run.",
  costCeiling: (usd: number) =>
    `Skipped: the cost limit for Google (US$${usd.toFixed(usd < 0.01 ? 4 : 2)} per audit) was reached.`,
  notCompleted: "Not completed: Google hadn't answered within 15 minutes.",
};

type Row = typeof googleSurfaceResults.$inferSelect;

export interface GoogleCollectDeps {
  provider: GoogleSurfaceProvider;
}

export function defaultGoogleCollectDeps(): GoogleCollectDeps {
  return { provider: new DataForSeoProvider() };
}

async function loadSnapshot(auditId: string) {
  const [snap] = await serviceDb
    .select()
    .from(auditGoogleSurfaces)
    .where(eq(auditGoogleSurfaces.auditId, auditId));
  return snap ?? null;
}

async function pendingRows(auditId: string): Promise<Row[]> {
  return serviceDb
    .select()
    .from(googleSurfaceResults)
    .where(
      and(eq(googleSurfaceResults.auditId, auditId), eq(googleSurfaceResults.outcome, "pending")),
    )
    .orderBy(googleSurfaceResults.promptIndex, googleSurfaceResults.surface);
}

async function skipRows(ids: string[], reason: string) {
  if (ids.length === 0) return;
  await serviceDb
    .update(googleSurfaceResults)
    .set({ outcome: "skipped", outcomeReason: reason, updatedAt: new Date() })
    .where(and(inArray(googleSurfaceResults.id, ids), eq(googleSurfaceResults.outcome, "pending")));
}

async function spentSoFar(auditId: string): Promise<number> {
  const [row] = await serviceDb
    .select({ usd: sql<string>`COALESCE(SUM(${googleSurfaceResults.costUsd}), 0)` })
    .from(googleSurfaceResults)
    .where(eq(googleSurfaceResults.auditId, auditId));
  return Number(row?.usd ?? 0);
}

/** The env switch and the credentials, checked before every provider call. Null = go ahead. */
function stopReason(): string | null {
  if (!googleSurfacesEnvEnabled()) return REASON.switchedOff;
  if (!hasGoogleSurfaceProviderCredentials()) return REASON.noCredentials;
  return null;
}

async function loadBrand(brandId: string) {
  const [b] = await serviceDb
    .select({
      name: brands.name,
      domain: brands.domain,
      suburb: brands.suburb,
      city: brands.city,
      state: brands.state,
      locationConfirmedAt: brands.locationConfirmedAt,
      locationMode: brands.locationMode,
    })
    .from(brands)
    .where(eq(brands.id, brandId));
  return b ?? null;
}

type BrandForMention = NonNullable<Awaited<ReturnType<typeof loadBrand>>>;

/** A finished task into its row: shown or not, the answer, its links, and the verified mention rule. */
async function recordDone(
  row: Row,
  poll: Extract<TaskPoll, { state: "done" }>,
  brand: BrandForMention,
  extraCostUsd: number | null,
) {
  const { answer } = poll;
  const base = {
    providerStatusCode: poll.statusCode,
    seDomain: answer.seDomain ?? row.seDomain,
    fetchedAt: answer.fetchedAt ? new Date(answer.fetchedAt) : new Date(),
    rawResponse: poll.raw,
    updatedAt: new Date(),
    ...(extraCostUsd !== null
      ? {
          costUsd: (Number(row.costUsd ?? 0) + extraCostUsd).toFixed(6),
          costSource: "provider_reported",
        }
      : {}),
  };
  if (!answer.shown || !answer.answerText) {
    await serviceDb
      .update(googleSurfaceResults)
      .set({
        ...base,
        outcome: "not_shown",
        outcomeReason:
          row.surface === "google_ai_overviews"
            ? "Google showed no AI Overview for this question."
            : "AI Mode gave no answer for this question.",
        citedLinks: answer.citedLinks,
        googleLinkCount: answer.citedLinks.filter((l) => l.googleLink).length,
      })
      .where(eq(googleSurfaceResults.id, row.id));
    return;
  }
  const mention = await detectBrandMention(answer.answerText, {
    name: brand.name,
    domain: brand.domain,
  });
  // The same rule as every engine (lib/audit/verify-mention.ts): the brand's own domain among the cited
  // sources, or its confirmed suburb or city near the name. Google's own links name no business, so they
  // never count as a source here.
  const sources = answer.citedLinks
    .filter((l) => !l.googleLink)
    .map((l) => ({ domain: l.domain, cited: true }));
  const mentionVerification = mention.found
    ? verifyMention({
        matchIndex: mention.matchIndex,
        responseText: answer.answerText,
        citedSources: sources,
        brand: {
          domain: brand.domain,
          suburb: brand.suburb,
          city: brand.city,
          state: brand.state,
          locationConfirmedAt: brand.locationConfirmedAt,
          locationMode: brand.locationMode,
        },
      })
    : null;
  await serviceDb
    .update(googleSurfaceResults)
    .set({
      ...base,
      outcome: "shown",
      outcomeReason: null,
      answerText: answer.answerText,
      citedLinks: answer.citedLinks,
      googleLinkCount: answer.citedLinks.filter((l) => l.googleLink).length,
      brandMentioned: mention.found,
      mentionVerification,
      position: mention.found ? mention.position : null,
    })
    .where(eq(googleSurfaceResults.id, row.id));
}

async function recordFailed(row: Row, statusCode: number, message: string, raw: unknown) {
  await serviceDb
    .update(googleSurfaceResults)
    .set({
      outcome: "failed",
      outcomeReason: `The provider answered ${statusCode}: ${message}`,
      providerStatusCode: statusCode,
      rawResponse: raw,
      updatedAt: new Date(),
    })
    .where(eq(googleSurfaceResults.id, row.id));
}

function targetOf(snap: NonNullable<Awaited<ReturnType<typeof loadSnapshot>>>): SurfaceTarget {
  const location = snap.location as GoogleLocation;
  const settings = snap.settings as StoredGoogleSettings;
  return { locationCode: location.code, device: settings.device, languageCode: "en" };
}

/** Posts the given rows' questions, one batch per surface, and records each task's id and cost. */
async function postRows(
  rows: Row[],
  target: SurfaceTarget,
  priority: 1 | 2,
  provider: GoogleSurfaceProvider,
) {
  for (const surface of ["google_ai_overviews", "google_ai_mode"] as const) {
    const mine = rows.filter((r) => r.surface === surface);
    if (mine.length === 0) continue;
    const posted = await provider.postTasks(
      surface,
      mine.map((r) => ({ promptIndex: r.promptIndex, question: r.prompt })),
      target,
      priority,
    );
    for (const p of posted) {
      const row = mine.find((r) => r.promptIndex === p.promptIndex);
      if (!row) continue;
      const cost =
        p.costUsd === null ? row.costUsd : (Number(row.costUsd ?? 0) + p.costUsd).toFixed(6);
      await serviceDb
        .update(googleSurfaceResults)
        .set({
          providerTaskId: p.taskId,
          providerStatusCode: p.statusCode,
          attempts: row.attempts + 1,
          costUsd: cost,
          costSource: p.costUsd === null ? row.costSource : "provider_reported",
          ...(p.taskId === null
            ? {
                outcome: "failed" as const,
                outcomeReason: `The provider refused the question: ${p.statusCode} ${p.message}`,
              }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(googleSurfaceResults.id, row.id));
    }
  }
}

/**
 * Which pending rows fit under the per-audit ceiling and the daily cap. The rest are skipped, saying why.
 * Questions go in order, both surfaces for each question, so a ceiling cuts the last questions, not a surface.
 */
async function admit(
  auditId: string,
  organizationId: string,
  brandId: string,
  rows: Row[],
  settings: StoredGoogleSettings,
): Promise<Row[]> {
  const price = GOOGLE_PRICE_PER_QUESTION_USD[settings.queueMode];
  let budget = settings.maxCostUsdPerAudit - (await spentSoFar(auditId));
  const admitted: Row[] = [];
  const overCeiling: string[] = [];
  for (const row of rows) {
    const cost = price[row.surface];
    if (cost <= budget + 1e-9) {
      admitted.push(row);
      budget -= cost;
    } else overCeiling.push(row.id);
  }
  await skipRows(overCeiling, REASON.costCeiling(settings.maxCostUsdPerAudit));
  if (admitted.length === 0) return [];

  const estimateUsd = admitted.reduce((sum, r) => sum + price[r.surface], 0);
  const daily = await BudgetPolicyService.checkDailySpend(organizationId);
  let coreReserveCents = 0;
  try {
    coreReserveCents = (
      await BudgetPolicyService.estimate({
        brandId,
        organizationId,
        promptCount: Math.max(...rows.map((r) => r.promptIndex)) + 1,
        engineCount: 4,
      })
    ).estimatedCostCents;
  } catch {
    // No estimate: the cap check below still applies, without the reserve.
  }
  const spentCents = daily.spentTodayCents + (daily.unpricedReserveCents ?? 0);
  if (
    !daily.allowed ||
    spentCents + usdToAudCents(estimateUsd) + coreReserveCents > daily.capCents
  ) {
    await skipRows(
      admitted.map((r) => r.id),
      REASON.dailyCap,
    );
    return [];
  }
  return admitted;
}

/** One round of fetching every posted, pending task. Returns how many are still waiting. */
async function pollOnce(
  auditId: string,
  brandId: string,
  snap: NonNullable<Awaited<ReturnType<typeof loadSnapshot>>>,
  deps: GoogleCollectDeps,
): Promise<number> {
  const rows = await pendingRows(auditId);
  const stop = stopReason();
  if (stop) {
    await skipRows(
      rows.map((r) => r.id),
      stop,
    );
    return 0;
  }
  const brand = await loadBrand(brandId);
  const settings = snap.settings as StoredGoogleSettings;
  for (const row of rows) {
    if (!row.providerTaskId) continue;
    const poll = await deps.provider.getTask(row.surface, row.providerTaskId);
    if (poll.state === "pending") continue;
    if (poll.state === "done") {
      if (brand) await recordDone(row, poll, brand, null);
      continue;
    }
    // One more (billed) attempt for the provider's retryable codes, if it fits under the ceiling.
    const price = GOOGLE_PRICE_PER_QUESTION_USD[settings.queueMode][row.surface];
    const fits = (await spentSoFar(auditId)) + price <= settings.maxCostUsdPerAudit + 1e-9;
    if (poll.retryable && row.attempts < MAX_ATTEMPTS && fits) {
      await postRows(
        [row],
        targetOf(snap),
        settings.queueMode === "priority" ? 2 : 1,
        deps.provider,
      );
      continue;
    }
    await recordFailed(row, poll.statusCode, poll.message, poll.raw);
  }
  return (await pendingRows(auditId)).filter((r) => r.providerTaskId).length;
}

/** The live queue: one call per question, each its own step. */
async function liveOne(
  auditId: string,
  brandId: string,
  rowId: string,
  snap: NonNullable<Awaited<ReturnType<typeof loadSnapshot>>>,
  deps: GoogleCollectDeps,
): Promise<void> {
  const [row] = await serviceDb
    .select()
    .from(googleSurfaceResults)
    .where(eq(googleSurfaceResults.id, rowId));
  if (row?.outcome !== "pending") return;
  const stop = stopReason();
  if (stop) return skipRows([row.id], stop);
  const settings = snap.settings as StoredGoogleSettings;
  const brand = await loadBrand(brandId);
  const target = targetOf(snap);
  let current = row;
  for (let attempt = row.attempts; attempt < MAX_ATTEMPTS; attempt++) {
    const price = GOOGLE_PRICE_PER_QUESTION_USD.live[row.surface];
    if ((await spentSoFar(auditId)) + price > settings.maxCostUsdPerAudit + 1e-9) {
      return skipRows([row.id], REASON.costCeiling(settings.maxCostUsdPerAudit));
    }
    const live =
      row.surface === "google_ai_overviews"
        ? await deps.provider.aiOverview(row.prompt, target)
        : await deps.provider.aiMode(row.prompt, target);
    await serviceDb
      .update(googleSurfaceResults)
      .set({
        providerTaskId: live.taskId,
        attempts: attempt + 1,
        costUsd:
          live.costUsd === null
            ? current.costUsd
            : (Number(current.costUsd ?? 0) + live.costUsd).toFixed(6),
        costSource: live.costUsd === null ? current.costSource : "provider_reported",
        updatedAt: new Date(),
      })
      .where(eq(googleSurfaceResults.id, row.id));
    const [fresh] = await serviceDb
      .select()
      .from(googleSurfaceResults)
      .where(eq(googleSurfaceResults.id, row.id));
    current = fresh ?? current;
    if (live.poll.state === "done") {
      if (brand) await recordDone(current, live.poll, brand, null);
      return;
    }
    if (live.poll.state === "error" && !live.poll.retryable) {
      return recordFailed(current, live.poll.statusCode, live.poll.message, live.poll.raw);
    }
    if (live.poll.state === "error" && attempt + 1 >= MAX_ATTEMPTS) {
      return recordFailed(current, live.poll.statusCode, live.poll.message, live.poll.raw);
    }
  }
}

/** The end: anything still waiting is "not completed", the cost is recorded once, the audit's Google part is complete. */
export async function finishGoogleSurfaces(auditId: string, leftoverReason = REASON.notCompleted) {
  await serviceDb
    .update(googleSurfaceResults)
    .set({ outcome: "not_completed", outcomeReason: leftoverReason, updatedAt: new Date() })
    .where(
      and(eq(googleSurfaceResults.auditId, auditId), eq(googleSurfaceResults.outcome, "pending")),
    );
  const snap = await loadSnapshot(auditId);
  if (!snap) return { costUsd: 0 };
  const costUsd = await spentSoFar(auditId);
  // Counts toward the daily spend cap (it sums every snapshot); the audit's own cost line leaves it out
  // (lib/audit/answered-count.ts), and the Google block shows it.
  await serviceDb
    .insert(auditCostSnapshots)
    .values({
      auditId,
      organizationId: snap.organizationId,
      marketCode: "AU_EN",
      locale: "en-AU",
      estimatedCostCents: 0,
      actualCostCents: usdToAudCents(costUsd),
      promptCount: 0,
      providerCallCount: 0,
      source: GOOGLE_COST_SOURCE,
    })
    .onConflictDoNothing({ target: [auditCostSnapshots.auditId, auditCostSnapshots.source] });
  await serviceDb
    .update(auditGoogleSurfaces)
    .set({ status: "complete", costUsd: costUsd.toFixed(6), completedAt: new Date() })
    .where(eq(auditGoogleSurfaces.auditId, auditId));
  return { costUsd };
}

/** The whole collection for one audit, step by step. */
export async function collectGoogleSurfaces(
  step: GoogleStepTools,
  data: GoogleCollectEventData,
  deps: GoogleCollectDeps = defaultGoogleCollectDeps(),
): Promise<{ auditId: string; costUsd: number }> {
  const { auditId } = data;

  const plan = await step.run("google:post", async () => {
    const snap = await loadSnapshot(auditId);
    if (!snap || snap.status === "complete")
      return { mode: "none" as const, liveRows: [] as string[] };
    const rows = (await pendingRows(auditId)).filter((r) => !r.providerTaskId);
    const stop = stopReason();
    if (stop) {
      await skipRows(
        rows.map((r) => r.id),
        stop,
      );
      return { mode: "none" as const, liveRows: [] as string[] };
    }
    const settings = snap.settings as StoredGoogleSettings;
    const admitted = await admit(auditId, data.organizationId, data.brandId, rows, settings);
    if (settings.queueMode === "live")
      return { mode: "live" as const, liveRows: admitted.map((r) => r.id) };
    await postRows(
      admitted,
      targetOf(snap),
      settings.queueMode === "priority" ? 2 : 1,
      deps.provider,
    );
    return { mode: "queue" as const, liveRows: [] as string[] };
  });

  if (plan.mode === "live") {
    for (const rowId of plan.liveRows) {
      await step.run(`google:live:${rowId}`, async () => {
        const snap = await loadSnapshot(auditId);
        if (snap) await liveOne(auditId, data.brandId, rowId, snap, deps);
        return null;
      });
    }
  } else if (plan.mode === "queue") {
    for (let n = 0; n < GOOGLE_POLL_DELAYS_S.length; n++) {
      await step.sleep(`google:wait:${n}`, GOOGLE_POLL_DELAYS_S[n] * 1000);
      const waiting = await step.run(`google:poll:${n}`, async () => {
        const snap = await loadSnapshot(auditId);
        return snap ? pollOnce(auditId, data.brandId, snap, deps) : 0;
      });
      if (waiting === 0) break;
    }
  }

  const finished = await step.run("google:finish", () => finishGoogleSurfaces(auditId));

  if (data.sendAuditComplete) {
    await step.sendEvent("google:audit-complete", {
      name: "audit.complete",
      data: { auditId, brandId: data.brandId, organizationId: data.organizationId },
    });
  }
  return { auditId, costUsd: finished.costUsd };
}
