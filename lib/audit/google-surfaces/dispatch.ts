import { and, eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { auditGoogleSurfaces, googleSurfaceResults } from "@/db/schema";
import { type GoogleLocation, resolveGoogleLocation } from "@/lib/google-surfaces/location";
import {
  brandGooglePostcode,
  type GoogleSurface,
  type GoogleSurfaceSettings,
  resolveGoogleSurfaces,
} from "@/lib/governance/google-surfaces";
import { inngest } from "@/lib/inngest/client";
import { GOOGLE_STORED_REASON } from "./reasons";

/**
 * Google AI surfaces, Phase 1, part 2 -- how an audit hands its questions to Google AI Overviews and AI Mode
 * without touching anything else it does (Sri, 1 Nov).
 *
 * 1. At the audit's start (run-audit's load-audit step, or the inline runner's own start), once:
 *    startGoogleSurfaces resolves the switches (lib/governance/google-surfaces.ts) and, only when a surface
 *    is on, stores what this audit runs with (audit_google_surfaces) -- surfaces, settings, location.
 *    With the env switch off it reads nothing and writes nothing.
 * 2. After the core audit has finished (its finalize), queueGoogleQuestions writes one pending row per
 *    surface and question, and the event google-surfaces/collect starts the Google function
 *    (inngest/functions/collect-google-surfaces.ts): its own steps, its own concurrency, after the four
 *    engines are done. A Google problem is recorded in the Google rows only.
 */

export const GOOGLE_COLLECT_EVENT = "google-surfaces/collect";
export const GOOGLE_PROVIDER = "dataforseo";
/** The Google domain each surface is fetched on (the sample: AI Mode runs on google.com with gl=AU). */
export const GOOGLE_SURFACE_DOMAIN: Record<GoogleSurface, string> = {
  google_ai_overviews: "google.com.au",
  google_ai_mode: "google.com",
};

export interface GoogleCollectEventData {
  auditId: string;
  brandId: string;
  organizationId: string;
  /** run-audit sends audit.complete only once Google is done, so the email and PDF include it. */
  sendAuditComplete: boolean;
}

/** What an audit stored at its start (audit_google_surfaces.settings). */
export interface StoredGoogleSettings extends GoogleSurfaceSettings {
  provider: string;
  decisions: Record<GoogleSurface, { on: boolean; reason: string }>;
}

export interface GoogleSurfacesStart {
  surfaces: GoogleSurface[];
}

/**
 * Once, at the audit's start. Null when Google is off for this audit (and then nothing was read or
 * written with the env switch off). Never throws: a problem here leaves Google off for this audit.
 */
export async function startGoogleSurfaces(input: {
  audit: { id: string; organizationId: string; triggeredBy: string | null };
  brand: {
    id: string;
    suburb: string | null;
    city: string | null;
    state: string | null;
    locationMode: string | null;
  };
  tier: string;
}): Promise<GoogleSurfacesStart | null> {
  const { audit, brand, tier } = input;
  try {
    const resolved = await resolveGoogleSurfaces(audit.organizationId, {
      tier,
      isSample: audit.triggeredBy === "sample",
    });
    if (resolved.surfaces.length === 0) return null;
    const location = resolveGoogleLocation({
      postcode: await brandGooglePostcode(brand.id),
      suburb: brand.suburb,
      city: brand.city,
      state: brand.state,
      locationMode: brand.locationMode,
    });
    const settings: StoredGoogleSettings = {
      ...resolved.settings,
      provider: GOOGLE_PROVIDER,
      decisions: resolved.decisions,
    };
    await serviceDb
      .insert(auditGoogleSurfaces)
      .values({
        auditId: audit.id,
        organizationId: audit.organizationId,
        surfaces: resolved.surfaces,
        settings,
        location: location.ok ? location.location : null,
        status: location.ok ? "queued" : "complete",
        statusReason: location.ok ? null : location.reason,
        completedAt: location.ok ? null : new Date(),
      })
      .onConflictDoNothing();
    return { surfaces: resolved.surfaces };
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "google_surfaces_start_failed",
        auditId: audit.id,
        error: err instanceof Error ? err.name : "unknown",
      }),
    );
    return null;
  }
}

/**
 * After the core audit finished: one pending row per surface and question. True when there's something
 * for the Google function to do. Never throws.
 */
export async function queueGoogleQuestions(
  auditId: string,
  prompts: readonly { text: string; isBranded: boolean }[],
): Promise<boolean> {
  try {
    const [snap] = await serviceDb
      .select()
      .from(auditGoogleSurfaces)
      .where(eq(auditGoogleSurfaces.auditId, auditId));
    if (snap?.status !== "queued" || !snap.location) return false;
    const location = snap.location as GoogleLocation;
    const settings = snap.settings as StoredGoogleSettings;
    const rows = (snap.surfaces as GoogleSurface[]).flatMap((surface) =>
      prompts.map((p, promptIndex) => ({
        auditId,
        organizationId: snap.organizationId,
        surface,
        prompt: p.text,
        promptIndex,
        isBrandedPrompt: p.isBranded,
        outcome: "pending" as const,
        provider: settings.provider,
        locationCode: location.code,
        locationLabel: location.label,
        device: settings.device,
        seDomain: GOOGLE_SURFACE_DOMAIN[surface],
        languageCode: "en",
        queueMode: settings.queueMode,
      })),
    );
    if (rows.length === 0) {
      await finishWithoutCollecting(auditId, GOOGLE_STORED_REASON.noQuestions);
      return false;
    }
    await serviceDb.insert(googleSurfaceResults).values(rows).onConflictDoNothing();
    await serviceDb
      .update(auditGoogleSurfaces)
      .set({ status: "collecting" })
      .where(
        and(eq(auditGoogleSurfaces.auditId, auditId), eq(auditGoogleSurfaces.status, "queued")),
      );
    return true;
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "google_surfaces_queue_failed",
        auditId,
        error: err instanceof Error ? err.name : "unknown",
      }),
    );
    return false;
  }
}

/** Every question still pending is skipped, with why, and the audit's Google part is complete. */
export async function finishWithoutCollecting(auditId: string, reason: string): Promise<void> {
  await serviceDb
    .update(googleSurfaceResults)
    .set({ outcome: "skipped", outcomeReason: reason, updatedAt: new Date() })
    .where(
      and(eq(googleSurfaceResults.auditId, auditId), eq(googleSurfaceResults.outcome, "pending")),
    );
  await serviceDb
    .update(auditGoogleSurfaces)
    .set({ status: "complete", statusReason: reason, completedAt: new Date() })
    .where(eq(auditGoogleSurfaces.auditId, auditId));
}

/**
 * The inline runner's hand-off (scheduled, bulk, validation and workflow audits run it inside another
 * function's step, which has no steps of its own to wait in): queue, then send the event. If it can't be
 * sent, the questions are skipped and the page says why. Never throws.
 */
export async function dispatchGoogleSurfacesInline(
  audit: { id: string; brandId: string; organizationId: string },
  prompts: readonly { text: string; isBranded: boolean }[],
): Promise<void> {
  if (!(await queueGoogleQuestions(audit.id, prompts))) return;
  const data: GoogleCollectEventData = {
    auditId: audit.id,
    brandId: audit.brandId,
    organizationId: audit.organizationId,
    sendAuditComplete: false,
  };
  try {
    await inngest.send({ name: GOOGLE_COLLECT_EVENT, data });
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "google_surfaces_dispatch_failed",
        auditId: audit.id,
        error: err instanceof Error ? err.name : "unknown",
      }),
    );
    await finishWithoutCollecting(audit.id, GOOGLE_STORED_REASON.runnerUnreachable).catch(() => {});
  }
}
