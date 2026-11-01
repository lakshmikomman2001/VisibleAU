import { and, eq, sql } from "drizzle-orm";
import { serviceDb, withRlsContext } from "@/db/client";
import { audits, webhookDeliveries, webhookEndpoints } from "@/db/schema";
import { resolveEngineCoverage } from "@/lib/audit/engine-coverage";
import { inngest } from "@/lib/inngest/client";
import { POST_AUDIT_POOL } from "@/lib/inngest/concurrency";
import { resolveAuditDimensionsAndHeadline } from "@/lib/scoring/resolve-audit-dimensions";
import { SCORE_BASIS } from "@/lib/webhooks/events";

const EVENT_NAME_MAP: Record<string, string> = {
  "audit.complete": "audit.completed",
  "drift.detected": "drift.detected",
  "recommendation.created": "recommendation.created",
  "report/generated": "report.generated",
  "hallucination/detected": "hallucination.detected",
  "hallucination/acknowledged": "hallucination.acknowledged",
  "visibility/trend-updated": "visibility.trend.updated",
  "agent/readiness-scored": "agent.readiness.scored",
  "crawler.impersonation-detected": "crawler.impersonation-detected",
};

export const fanoutWebhooksFn = inngest.createFunction(
  {
    id: "fanout-webhooks",
    concurrency: POST_AUDIT_POOL,
    triggers: [
      { event: "audit.complete" },
      { event: "drift.detected" },
      { event: "recommendation.created" },
      { event: "report/generated" },
      { event: "hallucination/detected" },
      { event: "hallucination/acknowledged" },
      { event: "visibility/trend-updated" },
      { event: "agent/readiness-scored" },
      { event: "crawler.impersonation-detected" },
    ],
  },
  async ({
    event,
    step,
  }: {
    event: {
      id: string;
      name: string;
      data: { organizationId?: string; brandId?: string; auditId?: string };
    };
    step: any;
  }) => {
    const { organizationId } = event.data;
    if (!organizationId) return { skipped: true, reason: "no_org_id" };

    const deliveryEventName = EVENT_NAME_MAP[event.name];
    if (!deliveryEventName) return { skipped: true, reason: "unmapped_event" };

    const internalEventId = event.id;

    const endpoints = await step.run("load-endpoints", async () => {
      return withRlsContext(organizationId, async (tx) => {
        return tx
          .select()
          .from(webhookEndpoints)
          .where(
            and(
              eq(webhookEndpoints.organizationId, organizationId),
              eq(webhookEndpoints.isActive, true),
              sql`${deliveryEventName} = ANY(${webhookEndpoints.events})`,
            ),
          );
      });
    });

    if (endpoints.length === 0) return { skipped: true, reason: "no_matching_endpoints" };

    // Vunnara (19 Oct): the raw `audit.complete` event data is only
    // {auditId, brandId, organizationId} -- no score -- so every
    // channel formatter's `scoreComposite` read always fell through to
    // "—"/""/0. Resolve the headline fresh (never the stored column) and
    // attach it under the existing field name, plus `score_basis` so
    // consumers know it's the mention rate, not the old weighted blend.
    // null = insufficient_data (zero successful organic answers).
    const { auditId } = event.data;
    const payload: Record<string, unknown> =
      event.name === "audit.complete" && auditId
        ? await step.run("resolve-headline", async () => {
            const { headline, coverage } = await withRlsContext(organizationId, async (tx) => {
              const [audit] = await tx
                .select({
                  id: audits.id,
                  engines: audits.engines,
                  promptsCount: audits.promptsCount,
                  metadata: audits.metadata,
                })
                .from(audits)
                .where(eq(audits.id, auditId));
              return {
                headline: (await resolveAuditDimensionsAndHeadline(tx, auditId)).headline,
                coverage: audit ? await resolveEngineCoverage(tx, audit) : null,
              };
            });
            return {
              ...event.data,
              scoreComposite: headline.status === "scored" ? headline.value : null,
              score_basis: SCORE_BASIS,
              // Engine-failure follow-ups (1 Nov), item 4 -- additive: how
              // many engines answered, and which answered nothing (every
              // call failed). enginesAnswered < enginesPlanned means
              // scoreComposite is from fewer engines than usual.
              ...(coverage
                ? {
                    enginesAnswered: coverage.enginesAnswered,
                    enginesPlanned: coverage.enginesPlanned,
                    fullyFailedEngines: coverage.fullyFailedEngines,
                  }
                : {}),
            };
          })
        : event.data;

    let delivered = 0;
    for (const ep of endpoints) {
      await step.run(`deliver-${ep.id}`, async () => {
        const [existing] = await serviceDb
          .select({ id: webhookDeliveries.id })
          .from(webhookDeliveries)
          .where(
            and(
              eq(webhookDeliveries.endpointId, ep.id),
              eq(webhookDeliveries.internalEventId, internalEventId),
            ),
          )
          .limit(1);

        if (existing) return { deduped: true };

        await inngest.send({
          name: "webhook.deliver" as const,
          data: {
            endpointId: ep.id,
            eventName: deliveryEventName,
            payload,
            organizationId,
            internalEventId,
          },
        });
      });
      delivered++;
    }

    return { delivered };
  },
);
