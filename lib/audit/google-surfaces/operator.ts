import { desc, eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import {
  auditGoogleSurfaces,
  audits,
  brands,
  googleSurfaceResults,
  organizations,
} from "@/db/schema";
import { appUrl } from "@/lib/email/links";
import { operatorRecipients } from "@/lib/email/operator-recipients";
import { idempotencyKeyFor, sendEmailOrThrow } from "@/lib/email/send";
import { googleProviderProblemEmail } from "@/lib/email/templates/alerts/google-provider-problem";
import { GOOGLE_SURFACE_NAMES, type GoogleSurface } from "@/lib/governance/google-surfaces";
import { claimOncePerWindow, releaseClaim } from "@/lib/governance/pg-rate-limit";
import {
  dataForSeoErrorCategory,
  GOOGLE_PROVIDER_ERROR_LABELS,
  type GoogleProviderErrorCategory,
  stopsTheRun,
} from "@/lib/serp/dataforseo-errors";
import { GOOGLE_STORED_REASON, googleRowErrorCategory } from "./reasons";

/**
 * Google AI follow-ups (12 Nov), part 2 -- what the operator sees of the provider's problems, on
 * /admin/settings only (lib/auth/platform-admin.ts checks who that is before this is read). Unlike every
 * customer surface, this is the stored reason as it is: the provider's code and its own message.
 *
 * Part 3: the last run ("Last Google run: login rejected at <time> (audit #N)") and the operators' alert
 * when a refused account stopped a run -- at most once per category per 24 hours.
 */

/** "2026-11-12 03:03 UTC", as the page's change history shows times. */
const utc = (d: Date) => `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;

export interface GoogleProviderErrorEntry {
  id: string;
  at: string;
  auditNumber: number | null;
  workspace: string | null;
  brand: string | null;
  surface: string;
  /** The provider's status code; null when it didn't answer at all. */
  code: number | null;
  /** "login rejected", "timed out", ... */
  category: string;
  /** The stored reason: the provider's own message, as it answered. */
  message: string | null;
}

export interface GoogleAccountProblem {
  code: number;
  label: string;
  at: string;
}

export interface GoogleLastRun {
  auditId: string;
  auditNumber: number | null;
  brand: string | null;
  workspace: string | null;
  at: string;
  questions: number;
  checked: number;
  /** The refused account that stopped it, if one did. */
  problem: GoogleAccountProblem | null;
  /** "Last Google run: login rejected at 2026-11-12 03:03 UTC (audit #44, Omega Services)". */
  line: string;
}

/** Everything the operator's page shows about the provider's health. */
export interface GoogleOperatorHealth {
  lastRun: GoogleLastRun | null;
  providerErrors: GoogleProviderErrorEntry[];
}

export async function loadGoogleOperatorHealth(): Promise<GoogleOperatorHealth> {
  const [lastRun, providerErrors] = await Promise.all([
    loadLastGoogleRun(),
    loadRecentGoogleProviderErrors(),
  ]);
  return { lastRun, providerErrors };
}

interface StoredOutcome {
  outcome: string;
  code: number | null;
  at: Date;
}

/** The first refusal of the account in a run's rows (login rejected, out of credit), if any. */
function accountProblemOf(rows: StoredOutcome[]): { code: number; at: Date } | null {
  const refusals = rows
    .filter(
      (r): r is StoredOutcome & { code: number } =>
        (r.outcome === "failed" || r.outcome === "not_completed") &&
        r.code !== null &&
        stopsTheRun(dataForSeoErrorCategory(r.code)),
    )
    .sort(
      (a, b) => Number(a.outcome !== "failed") - Number(b.outcome !== "failed") || +a.at - +b.at,
    );
  return refusals[0] ? { code: refusals[0].code, at: refusals[0].at } : null;
}

async function auditLabel(auditId: string) {
  const [meta] = await serviceDb
    .select({
      auditNumber: audits.auditNumber,
      brand: brands.name,
      workspace: organizations.name,
      organizationId: audits.organizationId,
    })
    .from(audits)
    .leftJoin(brands, eq(brands.id, audits.brandId))
    .leftJoin(organizations, eq(organizations.id, audits.organizationId))
    .where(eq(audits.id, auditId));
  return meta ?? null;
}

async function outcomesOf(auditId: string) {
  return serviceDb
    .select({
      outcome: googleSurfaceResults.outcome,
      code: googleSurfaceResults.providerStatusCode,
      at: googleSurfaceResults.updatedAt,
      reason: googleSurfaceResults.outcomeReason,
    })
    .from(googleSurfaceResults)
    .where(eq(googleSurfaceResults.auditId, auditId));
}

/** The latest audit whose Google part finished, every workspace, and whether a refused account stopped it. */
export async function loadLastGoogleRun(): Promise<GoogleLastRun | null> {
  const [snap] = await serviceDb
    .select({ auditId: auditGoogleSurfaces.auditId, completedAt: auditGoogleSurfaces.completedAt })
    .from(auditGoogleSurfaces)
    .where(eq(auditGoogleSurfaces.status, "complete"))
    .orderBy(desc(auditGoogleSurfaces.completedAt))
    .limit(1);
  if (!snap?.completedAt) return null;
  const [rows, meta] = await Promise.all([outcomesOf(snap.auditId), auditLabel(snap.auditId)]);
  const found = accountProblemOf(rows);
  const problem = found
    ? {
        code: found.code,
        label: GOOGLE_PROVIDER_ERROR_LABELS[dataForSeoErrorCategory(found.code)],
        at: found.at.toISOString(),
      }
    : null;
  const checked = rows.filter((r) => r.outcome === "shown" || r.outcome === "not_shown").length;
  const where = [
    meta?.auditNumber !== undefined && meta?.auditNumber !== null
      ? `audit #${meta.auditNumber}`
      : null,
    meta?.brand ?? null,
  ]
    .filter(Boolean)
    .join(", ");
  const line = problem
    ? `Last Google run: ${problem.label} at ${utc(new Date(problem.at))} (${where})`
    : `Last Google run: ${checked} of ${rows.length} questions checked, at ${utc(snap.completedAt)} (${where})`;
  return {
    auditId: snap.auditId,
    auditNumber: meta?.auditNumber ?? null,
    brand: meta?.brand ?? null,
    workspace: meta?.workspace ?? null,
    at: snap.completedAt.toISOString(),
    questions: rows.length,
    checked,
    problem,
    line,
  };
}

const ALERT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The rate_limit_counters key that keeps the alert to one per category per 24 hours. */
export function googleAlertKey(category: GoogleProviderErrorCategory): string {
  return `google-provider-alert:${category}`;
}

/**
 * Part 3: when a refused account stopped this audit's Google run, email PLATFORM_ADMIN_EMAILS through the
 * existing Resend setup -- at most once per category per 24 hours (claimOncePerWindow; given back if the
 * send fails). Returns how many emails went out. The email names the category, the code and the audit:
 * never the credentials, a header or the provider's own message.
 */
export async function alertOperatorsOnAccountProblem(auditId: string): Promise<number> {
  const rows = await outcomesOf(auditId);
  const found = accountProblemOf(rows);
  if (!found) return 0;
  const category = dataForSeoErrorCategory(found.code);
  const recipients = operatorRecipients();
  console.warn(
    JSON.stringify({
      event: "google_surfaces_account_problem",
      auditId,
      code: found.code,
      category,
    }),
  );
  if (recipients.length === 0) {
    console.warn(
      JSON.stringify({
        event: "google_surfaces_account_problem_no_operator",
        auditId,
        reason: "PLATFORM_ADMIN_EMAILS is not set",
      }),
    );
    return 0;
  }
  const key = googleAlertKey(category);
  if (!(await claimOncePerWindow(key, ALERT_WINDOW_MS))) {
    console.log(JSON.stringify({ event: "google_surfaces_alert_deduplicated", auditId, category }));
    return 0;
  }
  try {
    const meta = await auditLabel(auditId);
    const email = googleProviderProblemEmail({
      label: GOOGLE_PROVIDER_ERROR_LABELS[category],
      statusCode: found.code,
      auditNumber: meta?.auditNumber ?? 0,
      brandName: meta?.brand ?? "",
      organizationName: meta?.workspace ?? "",
      at: utc(found.at),
      notSent: rows.filter(
        (r) =>
          r.outcome === "not_completed" && r.reason?.startsWith(GOOGLE_STORED_REASON.stoppedPrefix),
      ).length,
      adminUrl: appUrl("/admin/settings"),
    });
    for (const to of recipients) {
      await sendEmailOrThrow({
        to,
        ...email,
        category: "alert",
        organizationId: meta?.organizationId,
        idempotencyKey: idempotencyKeyFor(`google-provider-alert:${auditId}:${category}`, to),
      });
    }
  } catch (err) {
    await releaseClaim(key);
    throw err;
  }
  return recipients.length;
}

/** The latest questions the provider failed, every workspace. */
export async function loadRecentGoogleProviderErrors(
  limit = 10,
): Promise<GoogleProviderErrorEntry[]> {
  const rows = await serviceDb
    .select({
      id: googleSurfaceResults.id,
      at: googleSurfaceResults.updatedAt,
      outcome: googleSurfaceResults.outcome,
      surface: googleSurfaceResults.surface,
      code: googleSurfaceResults.providerStatusCode,
      message: googleSurfaceResults.outcomeReason,
      auditNumber: audits.auditNumber,
      brand: brands.name,
      workspace: organizations.name,
    })
    .from(googleSurfaceResults)
    .leftJoin(audits, eq(audits.id, googleSurfaceResults.auditId))
    .leftJoin(brands, eq(brands.id, audits.brandId))
    .leftJoin(organizations, eq(organizations.id, googleSurfaceResults.organizationId))
    // Failed only: a question stopped after a refusal (part 3) isn't something the provider said.
    .where(eq(googleSurfaceResults.outcome, "failed"))
    .orderBy(desc(googleSurfaceResults.updatedAt))
    .limit(limit);
  return rows
    .map((r) => {
      const category = googleRowErrorCategory({
        outcome: r.outcome,
        providerStatusCode: r.code,
        outcomeReason: r.message,
      });
      return category
        ? {
            id: r.id,
            at: r.at.toISOString(),
            auditNumber: r.auditNumber,
            workspace: r.workspace,
            brand: r.brand,
            surface: GOOGLE_SURFACE_NAMES[r.surface as GoogleSurface] ?? r.surface,
            code: r.code,
            category: GOOGLE_PROVIDER_ERROR_LABELS[category],
            message: r.message,
          }
        : null;
    })
    .filter((e): e is GoogleProviderErrorEntry => e !== null);
}
