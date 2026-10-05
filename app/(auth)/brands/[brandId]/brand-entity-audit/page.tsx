import { desc, eq } from "drizzle-orm";
import { ExternalLink } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { withRlsContext } from "@/db/client";
import { brandEntityScores, brands, technicalAudits } from "@/db/schema";
import type { DirectoryStatus } from "@/lib/brand-entity/au-directory-aggregate";
import { BRAND_ENTITY_WEIGHTS, scoreDirectoryTier } from "@/lib/brand-entity/score";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isUuid } from "@/lib/validation/uuid";

interface BrandEntityFindings {
  score: number;
  abnVerified: boolean;
  abnNumber: string | null;
  abnStatus?: string | null;
  wikipediaAuPresent: boolean;
  wikipediaAuUrl?: string | null;
  auTldPresent: boolean;
  // Task QQQ: `status` matches what checkAuDirectories / KK actually store
  // (findings are never re-derived from `present` alone) -- older audits
  // stored before this field existed won't have it, hence optional.
  directoryPresence: Array<{
    name: string;
    present: boolean;
    status?: DirectoryStatus;
    url: string | null;
  }>;
}

export default async function BrandEntityAuditPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");

  const { brandId } = await params;
  if (!isUuid(brandId)) notFound();

  const { brand, techAudit } = await withRlsContext(currentUser.organizationId, async (tx) => {
    const [brand] = await tx.select().from(brands).where(eq(brands.id, brandId)).limit(1);
    if (!brand) notFound();

    const [techAudit] = await tx
      .select({
        findings: technicalAudits.findings,
        scoreBrandEntity: technicalAudits.scoreBrandEntity,
        crawledAt: technicalAudits.crawledAt,
      })
      .from(technicalAudits)
      .where(eq(technicalAudits.brandId, brandId))
      .orderBy(desc(technicalAudits.createdAt))
      .limit(1);

    const [_entityScore] = await tx
      .select()
      .from(brandEntityScores)
      .where(eq(brandEntityScores.brandId, brandId))
      .orderBy(desc(brandEntityScores.checkedAt))
      .limit(1);

    return { brand, techAudit };
  });

  if (!techAudit) {
    return (
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 32px" }}>
        <SetBreadcrumbs crumbs={["Workspace", "Brands", brand.name, "Brand & Entity"]} />
        <div
          style={{
            padding: 48,
            textAlign: "center",
            borderRadius: 8,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
          }}
        >
          <p style={{ fontSize: 14, color: "var(--text-tertiary)" }}>
            Run a technical audit first.
          </p>
        </div>
      </div>
    );
  }

  const findings = (techAudit.findings as Record<string, unknown>)?.brandEntity as
    | BrandEntityFindings
    | undefined;
  const score = Number(techAudit.scoreBrandEntity ?? 0);

  const abnSkipped = findings?.abnStatus === "check_skipped";
  // Task QQQ: read the real stored status, don't re-derive a binary from
  // `present` -- a legacy audit from before `status` existed falls back to
  // present -> "listed" / !present -> "not_listed" (the only two states
  // that binary could ever have meant).
  const directoriesWithStatus = (findings?.directoryPresence ?? []).map((dir) => ({
    ...dir,
    status: dir.status ?? ((dir.present ? "listed" : "not_listed") as DirectoryStatus),
  }));
  // Task WW: the directory check is graduated (0/1/2 pts), not boolean --
  // scoreDirectoryTier is imported from the scorer rather than
  // re-implemented, so this row can show the real 1-of-2 partial-credit
  // case instead of collapsing it to present/absent. Unchanged by QQQ --
  // `present` was already true only for `status === "listed"`, so this
  // count was already "listed only," never lumping in "unverifiable."
  const directoryCount = findings?.directoryPresence?.filter((d) => d.present)?.length ?? 0;
  const directoryEarned = scoreDirectoryTier(directoryCount);
  const signals = [
    {
      label: "ABN Lookup Verification",
      present: findings?.abnVerified ?? false,
      skipped: abnSkipped,
      detail: abnSkipped
        ? "Check temporarily unavailable — verification pending"
        : findings?.abnNumber
          ? `ABN: ${findings.abnNumber}`
          : "No ABN verified",
      earned: findings?.abnVerified ? BRAND_ENTITY_WEIGHTS.abnVerified : 0,
      max: BRAND_ENTITY_WEIGHTS.abnVerified,
    },
    {
      label: "Wikipedia AU Presence",
      present: findings?.wikipediaAuPresent ?? false,
      skipped: false,
      detail: findings?.wikipediaAuUrl ?? "Not found on Wikipedia",
      earned: findings?.wikipediaAuPresent ? BRAND_ENTITY_WEIGHTS.wikipediaAuPresent : 0,
      max: BRAND_ENTITY_WEIGHTS.wikipediaAuPresent,
    },
    {
      label: "Australian TLD (.com.au)",
      present: findings?.auTldPresent ?? false,
      skipped: false,
      detail: findings?.auTldPresent ? brand.domain : "No AU TLD detected",
      earned: findings?.auTldPresent ? BRAND_ENTITY_WEIGHTS.auTldPresent : 0,
      max: BRAND_ENTITY_WEIGHTS.auTldPresent,
    },
    {
      label: "AU Directory Aggregate",
      present: directoryEarned > 0,
      skipped: false,
      detail: `${directoryCount} director${directoryCount === 1 ? "y" : "ies"} found`,
      earned: directoryEarned,
      max: BRAND_ENTITY_WEIGHTS.directoryMax,
    },
  ];

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px" }}>
      <SetBreadcrumbs crumbs={["Workspace", "Brands", brand.name, "Brand & Entity"]} />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 24,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 600,
              color: "var(--text-primary)",
              margin: "0 0 4px",
            }}
          >
            Brand &amp; Entity Audit
          </h1>
          <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: 0 }}>
            AU-localised brand presence signals &middot; Score: {score}/10
          </p>
        </div>
        <div
          style={{
            fontSize: 36,
            fontWeight: 600,
            fontFamily: "var(--font-mono)",
            color: score > 7 ? "var(--success)" : score >= 4 ? "var(--warning)" : "var(--danger)",
          }}
        >
          {score}/10
        </div>
      </div>

      {/* Signal Cards */}
      <div
        style={{
          borderRadius: 8,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          overflow: "hidden",
          marginBottom: 24,
        }}
      >
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
            Entity Signals
          </h3>
        </div>
        {signals.map((sig) => (
          <div
            key={sig.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "14px 20px",
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <span
              style={{
                fontSize: 16,
                color: sig.skipped
                  ? "var(--warning)"
                  : sig.present
                    ? "var(--success)"
                    : "var(--danger)",
              }}
            >
              {sig.skipped ? "⏳" : sig.present ? "✓" : "✗"}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                {sig.label}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: sig.skipped ? "var(--warning)" : "var(--text-tertiary)",
                }}
              >
                {sig.detail}
              </div>
            </div>
            <span
              style={{
                fontSize: 13,
                fontFamily: "var(--font-mono)",
                color: sig.skipped
                  ? "var(--warning)"
                  : sig.present
                    ? "var(--success)"
                    : "var(--danger)",
              }}
            >
              {sig.skipped ? "—" : sig.earned}/{sig.max}
            </span>
          </div>
        ))}
      </div>

      {/* Directory Breakdown */}
      {directoriesWithStatus.length > 0 && (
        <div
          style={{
            borderRadius: 8,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
              AU Directory Presence
            </h3>
          </div>
          {directoriesWithStatus.map((dir) => {
            // Task QQQ: three real states, not a present/absent binary --
            // "unverifiable" (the directory blocked or failed our check)
            // must never read as "Not found," which would tell a customer
            // they're confirmed absent from a directory we simply couldn't
            // check (the exact regression KK fixed in scoring, re-broken
            // here in display).
            const statusColor =
              dir.status === "listed"
                ? "var(--success)"
                : dir.status === "unverifiable"
                  ? "var(--warning)"
                  : "var(--danger)";
            const statusLabel =
              dir.status === "listed"
                ? "Listed"
                : dir.status === "unverifiable"
                  ? "Couldn't verify"
                  : "Not found";
            const statusIcon = dir.status === "listed" ? "✓" : dir.status === "unverifiable" ? "?" : "✗";

            return (
              <div
                key={dir.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 20px",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
              >
                <span style={{ fontSize: 14, color: statusColor }}>{statusIcon}</span>
                <span style={{ flex: 1, fontSize: 13, color: "var(--text-primary)" }}>
                  {dir.name}
                </span>
                {dir.status === "listed" && dir.url && (
                  <a
                    href={dir.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      color: "var(--text-tertiary)",
                    }}
                  >
                    <ExternalLink style={{ width: 12, height: 12 }} />
                  </a>
                )}
                <span style={{ fontSize: 11, color: statusColor }}>{statusLabel}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
