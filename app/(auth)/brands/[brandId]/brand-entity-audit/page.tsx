import { desc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { db, setRlsContext } from "@/db/client";
import { brandEntityScores, brands, technicalAudits } from "@/db/schema";
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
  directoryPresence: Array<{ name: string; present: boolean; url: string | null }>;
}

export default async function BrandEntityAuditPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");
  await setRlsContext(db, currentUser.organizationId);

  const { brandId } = await params;
  if (!isUuid(brandId)) notFound();

  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) notFound();

  const [techAudit] = await db
    .select({
      findings: technicalAudits.findings,
      scoreBrandEntity: technicalAudits.scoreBrandEntity,
      crawledAt: technicalAudits.crawledAt,
    })
    .from(technicalAudits)
    .where(eq(technicalAudits.brandId, brandId))
    .orderBy(desc(technicalAudits.createdAt))
    .limit(1);

  const [_entityScore] = await db
    .select()
    .from(brandEntityScores)
    .where(eq(brandEntityScores.brandId, brandId))
    .orderBy(desc(brandEntityScores.checkedAt))
    .limit(1);

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
      pts: 3,
    },
    {
      label: "Wikipedia AU Presence",
      present: findings?.wikipediaAuPresent ?? false,
      skipped: false,
      detail: findings?.wikipediaAuUrl ?? "Not found on Wikipedia",
      pts: 3,
    },
    {
      label: "Australian TLD (.com.au)",
      present: findings?.auTldPresent ?? false,
      skipped: false,
      detail: findings?.auTldPresent ? brand.domain : "No AU TLD detected",
      pts: 2,
    },
    {
      label: "AU Directory Aggregate",
      present: (findings?.directoryPresence?.filter((d) => d.present)?.length ?? 0) >= 1,
      skipped: false,
      detail: `${findings?.directoryPresence?.filter((d) => d.present)?.length ?? 0} directories found`,
      pts: 2,
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
            color: "var(--text-primary)",
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
                    : "var(--text-tertiary)",
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
                color: sig.present ? "var(--success)" : "var(--text-tertiary)",
              }}
            >
              {sig.present ? sig.pts : 0}/{sig.pts}
            </span>
          </div>
        ))}
      </div>

      {/* Directory Breakdown */}
      {(findings?.directoryPresence?.length ?? 0) > 0 && (
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
          {findings!.directoryPresence.map((dir) => (
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
              <span style={{ fontSize: 14 }}>{dir.present ? "✓" : "✗"}</span>
              <span style={{ flex: 1, fontSize: 13, color: "var(--text-primary)" }}>
                {dir.name}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: dir.present ? "var(--success)" : "var(--text-tertiary)",
                }}
              >
                {dir.present ? "Found" : "Not found"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
