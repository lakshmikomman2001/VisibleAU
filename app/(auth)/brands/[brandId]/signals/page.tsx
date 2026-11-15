import { desc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { SignalsDetail } from "@/components/domain/technical/signals-detail";
import { SiteUnreachableNotice } from "@/components/domain/technical/site-unreachable-notice";
import { withRlsContext } from "@/db/client";
import { brands, technicalAudits } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { brandCrumb, CRUMB } from "@/lib/navigation/breadcrumbs";
import { getOrgTimezone } from "@/lib/platform/org-timezone";
import { measured, NOT_MEASURED } from "@/lib/scoring/measured";
import { crawlReach } from "@/lib/technical-audit/crawl-status";
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

  const { brandId } = await params;
  if (!isUuid(brandId)) notFound();

  const { brand, techAudit } = await withRlsContext(currentUser.organizationId, async (tx) => {
    const [brand] = await tx.select().from(brands).where(eq(brands.id, brandId)).limit(1);
    if (!brand) notFound();

    const [techAudit] = await tx
      .select({
        findings: technicalAudits.findings,
        scoreSignals: technicalAudits.scoreSignals,
        crawledAt: technicalAudits.crawledAt,
      })
      .from(technicalAudits)
      .where(eq(technicalAudits.brandId, brandId))
      .orderBy(desc(technicalAudits.createdAt))
      .limit(1);

    return { brand, techAudit };
  });

  if (!techAudit) {
    return (
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 32px" }}>
        <SetBreadcrumbs
          crumbs={[CRUMB.workspace, CRUMB.brands, brandCrumb(brand), { label: "Signals" }]}
        />
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
  // 17 Nov, part 3: a crawl that never reached the site scanned no page -- it read a clean 6 of 6, "No negative
  // signals detected". And an audit that stored no list didn't scan either: null is "not checked", never [].
  const reach = crawlReach(techAudit.findings);
  const unreached = reach.kind === "unreached";
  const crawledOn = techAudit.crawledAt
    ? new Date(techAudit.crawledAt).toLocaleDateString("en-AU", {
        timeZone: getOrgTimezone(currentUser.organizationId),
      })
    : null;
  const storedSignals = content?.negativeSignals;
  const storedInjections = content?.promptInjections;
  const negativeSignals =
    !unreached && Array.isArray(storedSignals) ? (storedSignals as NegativeSignalRow[]) : null;
  const promptInjections =
    !unreached && Array.isArray(storedInjections)
      ? (storedInjections as PromptInjectionRow[])
      : null;
  // 9 Nov (part 9): a missing sub-score is "Not measured yet" -- no number, no "Needs attention" band
  // (lib/scoring/measured.ts).
  const scoreM = measured(unreached || negativeSignals === null ? null : techAudit.scoreSignals);
  const score = scoreM.measured ? scoreM.value : null;
  const pagesScanned = reach.kind === "reached" ? reach.pagesCrawled : null;

  const scoreColor =
    score === null
      ? "var(--text-tertiary)"
      : score <= 2
        ? "var(--danger)"
        : score <= 4
          ? "var(--warning)"
          : "var(--success)";
  const scoreBand =
    score === null ? null : score <= 2 ? "Needs attention" : score <= 4 ? "Moderate" : "Healthy";
  // Rendered only with a band (a measured score).
  const scoreBandColor =
    score === null || score <= 2
      ? { bg: "var(--danger-soft)", fg: "var(--danger)" }
      : score <= 4
        ? { bg: "var(--warning-soft)", fg: "var(--warning)" }
        : { bg: "var(--success-soft)", fg: "var(--success)" };

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px" }}>
      <SetBreadcrumbs
        crumbs={[CRUMB.workspace, CRUMB.brands, brandCrumb(brand), { label: "Signals" }]}
      />

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
        {/* 17 Nov, part 3: it said "Lower is better", but the score starts at 6 and loses points for each
            negative signal: higher is better. Prompt injection is listed but never changes it. */}
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
          Spam, manipulation and injected content that can erode AI trust in your site. The score
          starts at 6 and loses points for each negative signal found, so higher is better. Prompt
          injection is listed below but doesn&apos;t change the score.
        </p>
        {crawledOn && (
          <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "4px 0 0" }}>
            Crawled {crawledOn}
            {pagesScanned !== null
              ? ` · ${pagesScanned} ${pagesScanned === 1 ? "page" : "pages"} scanned`
              : ""}
          </p>
        )}
      </div>

      {reach.kind === "unreached" && (
        <SiteUnreachableNotice
          domain={brand.domain}
          checkedOn={crawledOn}
          httpStatus={reach.httpStatus}
        />
      )}

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
            {score === null ? (
              <div style={{ fontSize: 14, color: scoreColor }}>
                {unreached ? "Not checked" : NOT_MEASURED}
              </div>
            ) : (
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
            )}
          </div>
          {scoreBand !== null && (
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
          )}
        </div>
        {score !== null && negativeSignals !== null && (
          <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
            Based on {negativeSignals.length} negative signal
            {negativeSignals.length !== 1 ? "s" : ""} detected
          </div>
        )}
      </div>

      {/* Detail sections: null lists read "Not checked" (components/domain/technical/signals-detail.tsx). */}
      <SignalsDetail
        negativeSignals={negativeSignals}
        promptInjections={promptInjections}
        notCheckedReason={unreached ? "No page was read on this audit." : null}
      />
    </div>
  );
}
