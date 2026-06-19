import { desc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { SignalsDetail } from "@/components/domain/technical/signals-detail";
import { db, setRlsContext } from "@/db/client";
import { brands, technicalAudits } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isUuid } from "@/lib/validation/uuid";

interface NegativeSignalRow {
  pattern: string;
  severity: string;
  count: number;
  detail?: string;
}

interface PromptInjectionRow {
  pattern: string;
  severity: string;
  element: string;
  detail?: string;
}

export default async function SignalsPage({ params }: { params: Promise<{ brandId: string }> }) {
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
      scoreSignals: technicalAudits.scoreSignals,
      crawledAt: technicalAudits.crawledAt,
    })
    .from(technicalAudits)
    .where(eq(technicalAudits.brandId, brandId))
    .orderBy(desc(technicalAudits.createdAt))
    .limit(1);

  if (!techAudit) {
    return (
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 32px" }}>
        <SetBreadcrumbs crumbs={["Workspace", "Brands", brand.name, "Signals"]} />
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

  const content = (techAudit.findings as Record<string, unknown>)?.content as
    | Record<string, unknown>
    | undefined;
  const negativeSignals = (content?.negativeSignals ?? []) as NegativeSignalRow[];
  const promptInjections = (content?.promptInjections ?? []) as PromptInjectionRow[];
  const score = Number(techAudit.scoreSignals ?? 0);

  const scoreColor =
    score <= 2 ? "var(--danger)" : score <= 4 ? "var(--warning)" : "var(--success)";
  const scoreBand = score <= 2 ? "Needs attention" : score <= 4 ? "Moderate" : "Healthy";
  const scoreBandColor =
    score <= 2
      ? { bg: "var(--danger-soft)", fg: "var(--danger)" }
      : score <= 4
        ? { bg: "var(--warning-soft)", fg: "var(--warning)" }
        : { bg: "var(--success-soft)", fg: "var(--success)" };

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px" }}>
      <SetBreadcrumbs crumbs={["Workspace", "Brands", brand.name, "Signals"]} />

      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            color: "var(--text-primary)",
            margin: "0 0 4px",
          }}
        >
          Negative signals &amp; prompt injection
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
          Spam, manipulation, and injected content that erode AI trust in your site. Lower is better
          — these reduce how often LLMs cite you.
        </p>
      </div>

      {/* Score card */}
      <div
        style={{
          padding: 24,
          borderRadius: 8,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "var(--text-tertiary)",
                marginBottom: 4,
              }}
            >
              Signals Score
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span
                style={{
                  fontSize: 36,
                  fontWeight: 600,
                  fontFamily: "var(--font-mono)",
                  fontVariantNumeric: "tabular-nums",
                  color: scoreColor,
                }}
              >
                {score}
              </span>
              <span
                style={{
                  fontSize: 18,
                  color: "var(--text-tertiary)",
                }}
              >
                / 6
              </span>
            </div>
          </div>
          <span
            style={{
              padding: "4px 12px",
              borderRadius: 9999,
              fontSize: 12,
              fontWeight: 600,
              background: scoreBandColor.bg,
              color: scoreBandColor.fg,
            }}
          >
            {scoreBand}
          </span>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
          {negativeSignals.length} negative signal{negativeSignals.length !== 1 ? "s" : ""} ·{" "}
          {promptInjections.length} prompt injection{promptInjections.length !== 1 ? "s" : ""}{" "}
          detected
        </div>
      </div>

      {/* Detail sections */}
      <SignalsDetail negativeSignals={negativeSignals} promptInjections={promptInjections} />
    </div>
  );
}
