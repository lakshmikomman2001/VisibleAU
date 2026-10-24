import { and, desc, eq, isNull } from "drizzle-orm";
import { serviceDb, withRlsContext } from "@/db/client";
import { actionItems, agencyBrandAssets, audits, brands, clientPortalInvites } from "@/db/schema";
import { getCitedDirectoryNames } from "@/lib/directories/citation-counts";
import { assetToTheme, type PdfTheme } from "@/lib/pdf/theme";
import { getOrgTimezone } from "@/lib/platform/org-timezone";
import {
  displayRecommendationAction,
  displayRecommendationTitle,
} from "@/lib/recommendations/confidence-labels";
import { dimensionLabel } from "@/lib/scoring/dimension-labels";
import type { DimensionKey, DimensionResult } from "@/lib/scoring/dimension-result";
import {
  type MentionDetailCounts,
  positionCard,
  sourceCitationCard,
} from "@/lib/scoring/measured-display";
import { resolveAuditDimensionsAndHeadline } from "@/lib/scoring/resolve-audit-dimensions";

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
    notMentioned,
    distinctSampleCount,
    dimensions,
    headline,
    mentionDetail,
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
          const rawActions = await tx
            .select({
              id: actionItems.id,
              title: actionItems.title,
              action: actionItems.action,
              dimension: actionItems.dimension,
              status: actionItems.status,
              confidenceBasis: actionItems.confidenceBasis,
              recommendationKey: actionItems.recommendationKey,
            })
            .from(actionItems)
            .where(eq(actionItems.auditId, latestAudit.id))
            .limit(20);
          // Build 1 addendum, item 1: the client portal must show the
          // same "Check: " framing for a legacy row as every other
          // surface -- transformed here, at the source.
          const citedDirectories = rawActions.some((r) => r.recommendationKey === "entity-profiles")
            ? await getCitedDirectoryNames(tx, latestAudit.id, brand)
            : [];
          actions = rawActions.map((r) => ({
            id: r.id,
            title: displayRecommendationTitle(r),
            action: displayRecommendationAction(r, citedDirectories),
            dimension: r.dimension,
            status: r.status,
          }));
        }
      }

      // Vunnara (19 Oct): the headline is the Frequency DimensionResult
      // (mention rate), never a blend. insufficientData now means the
      // HEADLINE itself is insufficient_data ("no_answers": zero
      // successful organic answers) -- a real 0% over real answers is
      // scored and shown as 0.0, with notMentioned adding the
      // "Not mentioned in any of N" explanation underneath.
      let insufficientData = false;
      let notMentioned = false;
      let distinctSampleCount = 0;
      // Task #46 (fix: stored value contradicting its own CI): this
      // portal used to show the client the STORED audits.score_*
      // columns directly as the VALUE -- stale the moment a prod-fix
      // changes which citations rows count as organic without the audit
      // being re-run (see lib/scoring/resolve-audit-dimensions.ts's own
      // doc comment). dimensions/headline below are the live, honest
      // recompute (same shared function the audit page, the export
      // route and the badge use), excluding Sentiment/Context entirely.
      let dimensions: Record<DimensionKey, DimensionResult> | null = null;
      let headline: DimensionResult | null = null;
      let mentionDetail: MentionDetailCounts | null = null;
      if (latestAudit) {
        const resolved = await resolveAuditDimensionsAndHeadline(tx, latestAudit.id);
        dimensions = resolved.dimensions;
        headline = resolved.headline;
        distinctSampleCount = resolved.sampleCount;
        insufficientData = resolved.headline.status !== "scored";
        notMentioned = !insufficientData && resolved.mentionedCount === 0;
        mentionDetail = {
          mentionedCount: resolved.mentionedCount,
          rankedCount: resolved.rankedCount,
          medianPosition: resolved.medianPosition,
          sourcedCount: resolved.sourcedCount,
        };
      }

      return {
        theme,
        brand,
        latestAudit,
        actions,
        insufficientData,
        notMentioned,
        distinctSampleCount,
        dimensions,
        headline,
        mentionDetail,
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
              {/* Headline Score (= mention rate, never a blend) */}
              <div className="rounded-lg border bg-card p-6">
                <h2 className="text-lg font-semibold mb-4">Visibility Score</h2>
                <div className="flex items-end gap-2">
                  {/* Task #46 Phase 2 (+ Phase 3, Part C): the old
                      `latestAudit.scoreComposite ? ... : "—"` truthy check
                      never caught a zero-mention audit -- "0.00" is a
                      non-empty, truthy string -- so it rendered that real-but-
                      unqualified "0.0" as if it were a measured low score.
                      Now reads the live-recomputed `headline` (the
                      Frequency DimensionResult) instead of the stored
                      column. */}
                  <span
                    className="text-5xl font-bold"
                    style={{ color: insufficientData ? "var(--text-tertiary)" : theme.accentColor }}
                  >
                    {headline?.status === "scored" ? headline.value.toFixed(1) : insufficientData ? "N/A" : "—"}
                  </span>
                  {headline?.status === "scored" && (
                    <span className="text-muted-foreground mb-2">/ 100</span>
                  )}
                </div>
                {insufficientData && (
                  <p className="text-sm text-muted-foreground mt-2">
                    No AI answers were returned for this audit, so there&apos;s nothing to score yet.
                  </p>
                )}
                {notMentioned && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Not mentioned in any of {distinctSampleCount} AI answers checked this audit.
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-2">
                  Last audited:{" "}
                  {latestAudit.completedAt
                    ? // "Dates show in Sydney time" (23 Oct), item 3
                      new Date(latestAudit.completedAt).toLocaleDateString("en-AU", {
                        timeZone: getOrgTimezone(invite.organizationId),
                      })
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
                    // Audit #36: Position and Source citation show the
                    // counts behind them ("#4", "3 of 3"), never a 0-100
                    // score (lib/scoring/measured-display.ts).
                    const card =
                      mentionDetail && dim.key === "position"
                        ? positionCard(mentionDetail)
                        : mentionDetail && dim.key === "accuracy"
                          ? sourceCitationCard(mentionDetail)
                          : null;
                    const measured = card?.kind === "measured" ? card : null;
                    // Task #46 Phase 3, Part C: Sentiment/Context are a
                    // THIRD, distinct state from Position/Source
                    // citation's insufficient_data -- unconditionally
                    // not_measured (no real classifier exists), never
                    // gated on mention count.
                    // Vunnara (21 Oct, hotfix: "Usually #16"): Position's
                    // OWN not_measured reason ("not_ranked") is a FOURTH,
                    // distinct state -- real mentions exist, there's
                    // simply no list position to show for one (or more)
                    // of them. Split out so it never says "Not yet
                    // measured" (which would wrongly imply no classifier
                    // exists at all, the Sentiment/Context story, not
                    // this one) -- same split as the audit page's own
                    // dimension grid.
                    const notRanked =
                      result?.status === "not_measured" && result.reason === "not_ranked";
                    // counts_only (Position/Source citation with mentions) is
                    // measured -- shown through `measured` below.
                    const notMeasured =
                      result?.status === "not_measured" && result.reason === "no_classifier";
                    const dimInsufficient = result?.status === "insufficient_data";
                    const text = notRanked
                      ? "Not ranked"
                      : notMeasured
                        ? "Not yet measured"
                        : dimInsufficient
                          ? "N/A"
                          : measured
                            ? measured.value
                            : result?.status === "scored"
                              ? result.value.toFixed(1)
                              : "—";
                    return (
                      <div key={dim.label} className="text-center">
                        <p className="text-sm text-muted-foreground">{dim.label}</p>
                        <p
                          className="font-bold mt-1"
                          style={{
                            fontSize: notMeasured || notRanked ? 15 : 24,
                            color:
                              notMeasured || notRanked || dimInsufficient
                                ? "var(--text-tertiary)"
                                : theme.accentColor,
                          }}
                          title={
                            notRanked
                              ? "Mentioned, but not inside a numbered or bulleted list we could rank"
                              : notMeasured
                                ? "Tone and recommendation analysis isn't built yet, so this dimension isn't scored"
                                : undefined
                          }
                        >
                          {text}
                        </p>
                        {measured && (
                          <p className="text-xs text-muted-foreground mt-1">{measured.detail}</p>
                        )}
                        {measured?.smallSampleNote && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {measured.smallSampleNote}
                          </p>
                        )}
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
                            {dimensionLabel(item.dimension)}
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
