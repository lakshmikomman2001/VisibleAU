import { desc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { SiteUnreachableNotice } from "@/components/domain/technical/site-unreachable-notice";
import { withRlsContext } from "@/db/client";
import { brands, technicalAudits } from "@/db/schema";
import { AI_BOTS } from "@/db/seed/ai-bots/seed";
import { getCurrentUser } from "@/lib/auth/current-user";
import { brandCrumb, CRUMB } from "@/lib/navigation/breadcrumbs";
import { getOrgTimezone } from "@/lib/platform/org-timezone";
import type { RobotsFindings } from "@/lib/robots-txt/analyze";
import {
  botRow,
  botStatusLabel,
  matrixNotCheckedSentence,
  NOT_CHECKED_BOT,
  robotsMatrixState,
  snippetAgents,
  tierSummary,
} from "@/lib/robots-txt/display";
import { measured, NOT_MEASURED } from "@/lib/scoring/measured";
import { crawlReach } from "@/lib/technical-audit/crawl-status";
import { isUuid } from "@/lib/validation/uuid";
import { RobotsTxtSnippet } from "./robots-txt-snippet";

export default async function RobotsTxtConfigPage({
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
        scoreRobots: technicalAudits.scoreRobots,
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
          crumbs={[
            CRUMB.workspace,
            CRUMB.brands,
            brandCrumb(brand),
            { label: "robots.txt + AI crawlers" },
          ]}
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

  const robots = (techAudit.findings as Record<string, unknown>)?.robots as
    | Partial<RobotsFindings>
    | undefined;
  // 17 Nov, part 3: a crawl that never reached the site has no robots.txt score (an older row stored one,
  // with 3 points for a home page check that had nothing to look at).
  const reach = crawlReach(techAudit.findings);
  const crawledOn = techAudit.crawledAt
    ? new Date(techAudit.crawledAt).toLocaleDateString("en-AU", {
        timeZone: getOrgTimezone(currentUser.organizationId),
      })
    : null;
  // 9 Nov (part 9): a missing sub-score is "Not measured yet", never 0/18 (lib/scoring/measured.ts).
  const scoreM = measured(reach.kind === "unreached" ? null : techAudit.scoreRobots);
  const score = scoreM.measured ? scoreM.value : null;
  // Every crawler's verdict comes from the audit's own evaluation (lib/robots-txt/display.ts); one it didn't
  // evaluate is "Not checked", never a green tick.
  const matrix = robotsMatrixState(robots);
  const matrixNote = matrixNotCheckedSentence(matrix);

  const tiers = [
    { tier: 1, label: "Training" },
    { tier: 2, label: "Search-AI" },
    { tier: 3, label: "User-agent" },
  ] as const;

  const allowedBotAgents = snippetAgents(robots);

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px" }}>
      <SetBreadcrumbs
        crumbs={[
          CRUMB.workspace,
          CRUMB.brands,
          brandCrumb(brand),
          { label: "robots.txt + AI crawlers" },
        ]}
      />

      {/* Header — FIX 3 */}
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
              margin: "0 0 6px",
            }}
          >
            robots.txt + AI crawler configuration
          </h1>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              margin: 0,
              maxWidth: 560,
              lineHeight: 1.5,
            }}
          >
            What your robots.txt tells each of the {AI_BOTS.length} AI crawlers we track, from its
            rules for your home page. A firewall or CDN can still turn an AI crawler away: we only
            see what your site answers our own crawler.
          </p>
          {crawledOn && (
            <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "4px 0 0" }}>
              Checked {crawledOn}
            </p>
          )}
        </div>
        {score === null ? (
          <div style={{ fontSize: 14, color: "var(--text-tertiary)" }}>
            {reach.kind === "unreached" || robots?.fetchStatus === "unreachable"
              ? "Not checked"
              : NOT_MEASURED}
          </div>
        ) : (
          <div
            style={{
              fontSize: 36,
              fontWeight: 600,
              fontFamily: "var(--font-mono)",
              fontVariantNumeric: "tabular-nums",
              color: "var(--text-primary)",
            }}
          >
            {score}/18
          </div>
        )}
      </div>

      {reach.kind === "unreached" && (
        <SiteUnreachableNotice
          domain={brand.domain}
          checkedOn={crawledOn}
          httpStatus={reach.httpStatus}
        />
      )}

      {/* 17 Nov, part 3: only from a real answer -- the home page turned our crawler away with a 403 or 503
          (lib/robots-txt/analyze.ts). It said "CDN Blocking Detected", which no check could ever set. */}
      {robots?.cdnBlockingDetected && reach.kind !== "unreached" && (
        <div
          style={{
            padding: 16,
            borderRadius: 8,
            background: "var(--warning-soft)",
            border: "1px solid var(--warning)",
            marginBottom: 24,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--warning)", marginBottom: 4 }}>
            Your site turned our crawler away
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Your home page answered our crawler with HTTP {robots.homepageHttpStatus}
            {robots.cdnVendor ? ` (served by ${robots.cdnVendor})` : ""}. AI crawlers may be turned
            away too: check your firewall or bot protection settings.
          </div>
        </div>
      )}

      {/* FIX 1 — Auriti-Labs attribution badge + section header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
          {AI_BOTS.length} AI bots tracked across 3 tiers
        </h2>
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            padding: "2px 8px",
            borderRadius: 9999,
            background: "var(--accent-blue-soft)",
            color: "var(--accent-blue)",
          }}
        >
          Reference: Auriti-Labs (MIT)
        </span>
      </div>

      {matrixNote && (
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "0 0 12px" }}>
          {matrixNote}
        </p>
      )}

      {/* 27-Bot Matrix — with FIX 2 per-tier allowed count */}
      {tiers.map(({ tier, label }) => {
        const bots = AI_BOTS.filter((b) => b.tier === tier);
        const summary = tierSummary(
          robots,
          bots.map((b) => b.userAgent),
        );
        const allAllowed = summary.checked && summary.blocked === 0;
        return (
          <div
            key={tier}
            style={{
              borderRadius: 8,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-default)",
              overflow: "hidden",
              marginBottom: 16,
            }}
          >
            <div
              style={{
                padding: "14px 20px",
                borderBottom: "1px solid var(--border-subtle)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <h3
                  style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}
                >
                  Tier {tier} — {label}
                </h3>
                <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
                  {!summary.checked
                    ? NOT_CHECKED_BOT
                    : allAllowed
                      ? "All allowed"
                      : `${summary.blocked} blocked`}
                </div>
              </div>
              {summary.checked ? (
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 600,
                    fontFamily: "var(--font-mono)",
                    fontVariantNumeric: "tabular-nums",
                    color: allAllowed ? "var(--success)" : "var(--danger)",
                  }}
                >
                  {summary.allowed}/{summary.total}
                </div>
              ) : null}
            </div>
            {bots.map((bot) => {
              const row = botRow(robots, bot.userAgent);
              const isBlocked = row.checked && row.verdict.verdict === "blocked";
              const isAllowed = row.checked && row.verdict.verdict === "allowed";
              return (
                <div
                  key={bot.userAgent}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 20px",
                    borderBottom: "1px solid var(--border-subtle)",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      fontSize: 14,
                      color: isBlocked
                        ? "var(--danger)"
                        : isAllowed
                          ? "var(--success)"
                          : "var(--text-tertiary)",
                    }}
                  >
                    {isBlocked ? "✗" : isAllowed ? "✓" : "–"}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                      {bot.displayName}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                      {bot.description}
                    </div>
                  </div>
                  <span
                    title={row.checked && row.verdict.rule ? row.verdict.rule : undefined}
                    style={{
                      fontSize: 11,
                      padding: "2px 8px",
                      borderRadius: 4,
                      background: isBlocked
                        ? "var(--danger-soft)"
                        : isAllowed
                          ? "var(--success-soft)"
                          : "var(--accent-muted)",
                      color: isBlocked
                        ? "var(--danger)"
                        : isAllowed
                          ? "var(--success)"
                          : "var(--text-tertiary)",
                    }}
                  >
                    {botStatusLabel(row)}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Recommendations */}
      {/* On a crawl that never reached the site, "No robots.txt found" is a request that failed, not advice. */}
      {(robots?.recommendations?.length ?? 0) > 0 &&
        !(reach.kind === "unreached" && robots?.fetchStatus !== "found") && (
          <div
            style={{
              borderRadius: 8,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-default)",
              padding: 20,
              marginBottom: 16,
            }}
          >
            <h3
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--text-primary)",
                margin: "0 0 12px",
              }}
            >
              Recommendations
            </h3>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {robots?.recommendations?.map((rec) => (
                <li
                  key={rec}
                  style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 6 }}
                >
                  {rec}
                </li>
              ))}
            </ul>
          </div>
        )}

      {/* FIX 4 — Generated robots.txt snippet */}
      <RobotsTxtSnippet domain={brand.domain} allowedBotAgents={allowedBotAgents} />
    </div>
  );
}
