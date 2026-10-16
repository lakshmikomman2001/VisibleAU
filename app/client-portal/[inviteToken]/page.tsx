import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { serviceDb, withRlsContext } from "@/db/client";
import {
  actionItems,
  agencyBrandAssets,
  audits,
  brands,
  citations,
  clientPortalInvites,
} from "@/db/schema";
import { ORGANIC_ONLY } from "@/lib/audit/organic-filter";
import { assetToTheme, type PdfTheme } from "@/lib/pdf/theme";
import {
  type DimensionKey,
  type DimensionResult,
  NOT_MEASURED_DIMENSION,
  resolveComposite,
  resolveDimension,
} from "@/lib/scoring/dimension-result";
import { wilsonCI, wilsonCIFromScore } from "@/lib/scoring/wilson";

interface Props {
  params: Promise<{ inviteToken: string }>;
}

function PortalHeader({ theme }: { theme: PdfTheme }) {
  const name = theme.agencyName || "VisibleAU";

  return (
    <header className="border-b" style={{ borderColor: `${theme.primaryColor}33` }}>
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center">
        {theme.logoUrl ? (
          <img src={theme.logoUrl} alt={name} className="h-8 max-w-[160px] object-contain" />
        ) : (
          <span
            className="text-lg font-semibold tracking-tight"
            style={{ color: theme.primaryColor }}
          >
            {name}
          </span>
        )}
        <span className="ml-3 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
          Client Portal
        </span>
      </div>
    </header>
  );
}

function PortalFooter({ theme }: { theme: PdfTheme }) {
  const hasContact = theme.contactLine || theme.agencyName;
  if (!hasContact && theme.footerText === "Confidential") return null;

  return (
    <footer className="border-t mt-12">
      <div className="max-w-5xl mx-auto px-6 py-6 text-center space-y-1">
        {theme.footerText && theme.footerText !== "Confidential" && (
          <p className="text-xs text-muted-foreground">{theme.footerText}</p>
        )}
        {theme.contactLine && <p className="text-xs text-muted-foreground">{theme.contactLine}</p>}
      </div>
    </footer>
  );
}

export default async function ClientPortalViewPage({ params }: Props) {
  const { inviteToken } = await params;

  // No signed-in user on this public route, and the org isn't known until
  // the invite itself is resolved — bootstrap via serviceDb (bypasses RLS by
  // design), then establish RLS context for every subsequent query below.
  const [invite] = await serviceDb
    .select()
    .from(clientPortalInvites)
    .where(eq(clientPortalInvites.inviteToken, inviteToken))
    .limit(1);

  // Default theme for error states (before we know the org)
  const defaultTheme = assetToTheme(null);

  if (!invite) {
    return (
      <>
        <PortalHeader theme={defaultTheme} />
        <main className="max-w-5xl mx-auto px-6 py-8">
          <div className="text-center py-12">
            <h1 className="text-2xl font-semibold text-red-600 mb-2">Invalid Link</h1>
            <p className="text-muted-foreground">This portal link is invalid or does not exist.</p>
          </div>
        </main>
      </>
    );
  }

  // Every query below is scoped to invite.organizationId, now that the
  // invite itself has resolved which tenant this request belongs to.
  const {
    theme,
    brand,
    latestAudit,
    actions,
    insufficientData,
    distinctSampleCount,
    dimensions,
    composite,
  } = await withRlsContext(invite.organizationId, async (tx) => {
      // Fetch branding: 2-tier lookup (brand-specific first, org-level fallback) — mirrors PDF export
      const [brandAsset] = await tx
        .select()
        .from(agencyBrandAssets)
        .where(
          and(
            eq(agencyBrandAssets.organizationId, invite.organizationId),
            eq(agencyBrandAssets.brandId, invite.brandId),
          ),
        );
      const [orgAsset] = brandAsset
        ? [brandAsset]
        : await tx
            .select()
            .from(agencyBrandAssets)
            .where(
              and(
                eq(agencyBrandAssets.organizationId, invite.organizationId),
                isNull(agencyBrandAssets.brandId),
              ),
            );
      const theme = assetToTheme(orgAsset ?? null);

      const [brand] = await tx.select().from(brands).where(eq(brands.id, invite.brandId)).limit(1);

      let latestAudit: typeof audits.$inferSelect | undefined;
      let actions: {
        id: string;
        title: string;
        action: string;
        dimension: string;
        status: string;
      }[] = [];
      if (brand) {
        [latestAudit] = await tx
          .select()
          .from(audits)
          .where(and(eq(audits.brandId, brand.id), eq(audits.status, "complete")))
          .orderBy(desc(audits.completedAt))
          .limit(1);

        if (latestAudit) {
          actions = await tx
            .select({
              id: actionItems.id,
              title: actionItems.title,
              action: actionItems.action,
              dimension: actionItems.dimension,
              status: actionItems.status,
            })
            .from(actionItems)
            .where(eq(actionItems.auditId, latestAudit.id))
            .limit(20);
        }
      }

      let insufficientData = false;
      let distinctSampleCount = 0;
      // Task #46 Phase 3, Part C: this portal used to show the client the
      // STORED audits.score_composite column directly -- stale for any
      // audit scored before this fix, since that column was blended with
      // Sentiment/Context fabricated from mention presence at 20%/15%
      // weight. dimensions/composite below are the live, honest recompute
      // (same resolveDimension/resolveComposite contract as the audit
      // page, the export route, and app/api/badge/route.ts), excluding
      // Sentiment/Context entirely.
      let dimensions: Record<DimensionKey, DimensionResult> | null = null;
      let composite: ReturnType<typeof resolveComposite> | null = null;
      if (latestAudit) {
        // Task #46 Phase 2: the TRUE independent-sample mention count
        // (organic, run_number = 1 -- lib/scoring/dimension-result.ts's
        // gate), not a truthy check on the stored score columns -- a
        // zero-mention audit's scoreComposite/dimension scores are real,
        // non-fabricated "0.00" strings (always truthy), so the client
        // portal's dimension cards must check this flag, not the raw value.
        const [{ sampleCount, mentionedCount, accWithSourcesCount }] = await tx
          .select({
            sampleCount: count(),
            mentionedCount: sql<number>`COALESCE(SUM(CASE WHEN brand_mentioned = true THEN 1 ELSE 0 END), 0)`,
            accWithSourcesCount: sql<number>`COALESCE(SUM(CASE WHEN brand_mentioned = true AND jsonb_array_length(cited_sources) > 0 THEN 1 ELSE 0 END), 0)`,
          })
          .from(citations)
          .where(
            and(eq(citations.auditId, latestAudit.id), ORGANIC_ONLY, eq(citations.runNumber, 1)),
          );
        distinctSampleCount = Number(sampleCount);
        const mentioned = Number(mentionedCount);
        const accWithSources = Number(accWithSourcesCount);
        insufficientData = mentioned === 0;

        const frequency = resolveDimension(
          Number(latestAudit.scoreFrequency ?? 0),
          wilsonCI(mentioned, distinctSampleCount),
          mentioned,
          { alwaysScored: true },
        );
        const position = resolveDimension(
          Number(latestAudit.scorePosition ?? 0),
          wilsonCIFromScore(Number(latestAudit.scorePosition ?? 0), mentioned),
          mentioned,
        );
        const accuracy = resolveDimension(
          Number(latestAudit.scoreAccuracy ?? 0),
          wilsonCI(accWithSources, mentioned),
          mentioned,
        );
        dimensions = {
          frequency,
          position,
          sentiment: NOT_MEASURED_DIMENSION,
          context: NOT_MEASURED_DIMENSION,
          accuracy,
        };
        composite = resolveComposite(dimensions);
      }

      return {
        theme,
        brand,
        latestAudit,
        actions,
        insufficientData,
        distinctSampleCount,
        dimensions,
        composite,
      };
    });

  if (invite.isRevoked) {
    return (
      <>
        <PortalHeader theme={theme} />
        <main className="max-w-5xl mx-auto px-6 py-8">
          <div className="text-center py-12">
            <h1 className="text-2xl font-semibold text-red-600 mb-2">Access Revoked</h1>
            <p className="text-muted-foreground">
              This portal link has been revoked by the agency.
            </p>
          </div>
        </main>
        <PortalFooter theme={theme} />
      </>
    );
  }

  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
    return (
      <>
        <PortalHeader theme={theme} />
        <main className="max-w-5xl mx-auto px-6 py-8">
          <div className="text-center py-12">
            <h1 className="text-2xl font-semibold text-yellow-600 mb-2">Link Expired</h1>
            <p className="text-muted-foreground">
              This portal link has expired. Please contact your agency for a new one.
            </p>
          </div>
        </main>
        <PortalFooter theme={theme} />
      </>
    );
  }

  if (!brand) {
    return (
      <>
        <PortalHeader theme={theme} />
        <main className="max-w-5xl mx-auto px-6 py-8">
          <div className="text-center py-12">
            <h1 className="text-2xl font-semibold mb-2">Brand Not Found</h1>
            <p className="text-muted-foreground">
              The brand associated with this portal could not be found.
            </p>
          </div>
        </main>
        <PortalFooter theme={theme} />
      </>
    );
  }

  return (
    <>
      <PortalHeader theme={theme} />
      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="space-y-8">
          {/* Brand header */}
          <div>
            <h1 className="text-2xl font-semibold">{brand.name}</h1>
            <p className="text-muted-foreground text-sm mt-1">{brand.domain}</p>
          </div>

          {!latestAudit ? (
            <div className="rounded-lg border bg-card p-6 text-center">
              <p className="text-muted-foreground">
                No completed audits yet. Your agency will run the first audit soon.
              </p>
            </div>
          ) : (
            <>
              {/* Composite Score */}
              <div className="rounded-lg border bg-card p-6">
                <h2 className="text-lg font-semibold mb-4">Composite Visibility Score</h2>
                <div className="flex items-end gap-2">
                  {/* Task #46 Phase 2 (+ Phase 3, Part C): the old
                      `latestAudit.scoreComposite ? ... : "—"` truthy check
                      never caught a zero-mention audit -- "0.00" is a
                      non-empty, truthy string -- so it rendered that real-but-
                      unqualified "0.0" as if it were a measured low score.
                      Now reads the live-recomputed `composite.value`
                      instead of the stored column, which is stale for any
                      audit scored before Sentiment/Context were excluded. */}
                  <span
                    className="text-5xl font-bold"
                    style={{ color: insufficientData ? "var(--text-tertiary)" : theme.accentColor }}
                  >
                    {insufficientData ? "N/A" : composite ? composite.value.toFixed(1) : "—"}
                  </span>
                  {!insufficientData && <span className="text-muted-foreground mb-2">/ 100</span>}
                </div>
                {insufficientData && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Not mentioned in any of {distinctSampleCount} AI answers checked this audit.
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  Last audited:{" "}
                  {latestAudit.completedAt
                    ? new Date(latestAudit.completedAt).toLocaleDateString()
                    : "N/A"}
                </p>
              </div>

              {/* Dimension Scores */}
              <div className="rounded-lg border bg-card p-6">
                <h2 className="text-lg font-semibold mb-4">Dimension Scores</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {/* Display-only relabel ("Source citation"): this dimension measures citation
                  rate (accuracyDimensionScore), not factual correctness. DB column (score_accuracy)
                  and internal key (accuracy) are unchanged — see docs/ops for the Phase 1 writeup. */}
                  {(
                    [
                      { label: "Frequency", key: "frequency" as const },
                      { label: "Position", key: "position" as const },
                      { label: "Sentiment", key: "sentiment" as const },
                      { label: "Context", key: "context" as const },
                      { label: "Source citation", key: "accuracy" as const },
                    ] satisfies Array<{ label: string; key: DimensionKey }>
                  ).map((dim) => {
                    const result = dimensions?.[dim.key];
                    // Task #46 Phase 3, Part C: Sentiment/Context are a
                    // THIRD, distinct state from Position/Source
                    // citation's insufficient_data -- unconditionally
                    // not_measured (no real classifier exists), never
                    // gated on mention count.
                    const notMeasured = result?.status === "not_measured";
                    const dimInsufficient = result?.status === "insufficient_data";
                    const text = notMeasured
                      ? "Not yet measured"
                      : dimInsufficient
                        ? "N/A"
                        : result?.status === "scored"
                          ? result.value.toFixed(1)
                          : "—";
                    return (
                      <div key={dim.label} className="text-center">
                        <p className="text-sm text-muted-foreground">{dim.label}</p>
                        <p
                          className="font-bold mt-1"
                          style={{
                            fontSize: notMeasured ? 15 : 24,
                            color:
                              notMeasured || dimInsufficient
                                ? "var(--text-tertiary)"
                                : theme.accentColor,
                          }}
                          title={
                            notMeasured
                              ? "Tone and recommendation analysis isn't built yet, so this dimension isn't scored"
                              : undefined
                          }
                        >
                          {text}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recommendations */}
              {actions.length > 0 && (
                <div className="rounded-lg border bg-card p-6">
                  <h2 className="text-lg font-semibold mb-4">Recommendations</h2>
                  <ul className="space-y-3">
                    {actions.map((item) => (
                      <li key={item.id} className="border-b pb-3 last:border-b-0 last:pb-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium">{item.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{item.action}</p>
                          </div>
                          <span
                            className="text-xs px-2 py-0.5 rounded flex-shrink-0"
                            style={{
                              backgroundColor: `${theme.primaryColor}15`,
                              color: theme.primaryColor,
                            }}
                          >
                            {item.dimension}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}

          {/* Read-only notice */}
          <p className="text-xs text-center text-muted-foreground">
            This is a read-only view. Contact your agency to request new audits or changes.
          </p>
        </div>
      </main>
      <PortalFooter theme={theme} />
    </>
  );
}
