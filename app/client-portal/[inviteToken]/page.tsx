import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { actionItems, agencyBrandAssets, audits, brands, clientPortalInvites } from "@/db/schema";
import { assetToTheme, type PdfTheme } from "@/lib/pdf/theme";

interface Props {
  params: Promise<{ inviteToken: string }>;
}

function PortalHeader({ theme }: { theme: PdfTheme }) {
  const name = theme.agencyName || "VisibleAU";

  return (
    <header
      className="border-b"
      style={{ borderColor: `${theme.primaryColor}33` }}
    >
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center">
        {theme.logoUrl ? (
          <img
            src={theme.logoUrl}
            alt={name}
            className="h-8 max-w-[160px] object-contain"
          />
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
        {theme.contactLine && (
          <p className="text-xs text-muted-foreground">{theme.contactLine}</p>
        )}
      </div>
    </footer>
  );
}

export default async function ClientPortalViewPage({ params }: Props) {
  const { inviteToken } = await params;

  const [invite] = await db
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
            <p className="text-muted-foreground">
              This portal link is invalid or does not exist.
            </p>
          </div>
        </main>
      </>
    );
  }

  // Fetch branding: 2-tier lookup (brand-specific first, org-level fallback) — mirrors PDF export
  const [brandAsset] = await db
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
    : await db
        .select()
        .from(agencyBrandAssets)
        .where(
          and(
            eq(agencyBrandAssets.organizationId, invite.organizationId),
            isNull(agencyBrandAssets.brandId),
          ),
        );
  const theme = assetToTheme(orgAsset ?? null);

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

  const [brand] = await db
    .select()
    .from(brands)
    .where(eq(brands.id, invite.brandId))
    .limit(1);

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

  const [latestAudit] = await db
    .select()
    .from(audits)
    .where(and(eq(audits.brandId, brand.id), eq(audits.status, "complete")))
    .orderBy(desc(audits.completedAt))
    .limit(1);

  let actions: { id: string; title: string; action: string; dimension: string; status: string }[] =
    [];
  if (latestAudit) {
    actions = await db
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
                  <span
                    className="text-5xl font-bold"
                    style={{ color: theme.accentColor }}
                  >
                    {latestAudit.scoreComposite
                      ? parseFloat(latestAudit.scoreComposite).toFixed(1)
                      : "—"}
                  </span>
                  <span className="text-muted-foreground mb-2">/ 100</span>
                </div>
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
                  {[
                    { label: "Frequency", value: latestAudit.scoreFrequency },
                    { label: "Position", value: latestAudit.scorePosition },
                    { label: "Sentiment", value: latestAudit.scoreSentimentNumeric },
                    { label: "Accuracy", value: latestAudit.scoreAccuracy },
                  ].map((dim) => (
                    <div key={dim.label} className="text-center">
                      <p className="text-sm text-muted-foreground">{dim.label}</p>
                      <p
                        className="text-2xl font-bold mt-1"
                        style={{ color: theme.accentColor }}
                      >
                        {dim.value ? parseFloat(dim.value).toFixed(1) : "—"}
                      </p>
                    </div>
                  ))}
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
