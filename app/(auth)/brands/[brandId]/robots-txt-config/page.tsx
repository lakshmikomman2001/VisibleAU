import { desc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { db, setRlsContext } from "@/db/client";
import { brands, technicalAudits } from "@/db/schema";
import { AI_BOTS } from "@/db/seed/ai-bots/seed";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isUuid } from "@/lib/validation/uuid";
import { RobotsTxtSnippet } from "./robots-txt-snippet";

interface RobotsFindings {
  present: boolean;
  score: number;
  aiBotsAllowed: string[];
  aiBotsBlocked: string[];
  cdnBlockingDetected: boolean;
  cdnVendor: string | null;
  recommendations: string[];
}

export default async function RobotsTxtConfigPage({
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
      scoreRobots: technicalAudits.scoreRobots,
      crawledAt: technicalAudits.crawledAt,
    })
    .from(technicalAudits)
    .where(eq(technicalAudits.brandId, brandId))
    .orderBy(desc(technicalAudits.createdAt))
    .limit(1);

  if (!techAudit) {
    return (
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 32px" }}>
        <SetBreadcrumbs crumbs={["Workspace", "Brands", brand.name, "robots.txt + AI crawlers"]} />
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
    | RobotsFindings
    | undefined;
  const score = Number(techAudit.scoreRobots ?? 0);
  const allowed = new Set(robots?.aiBotsAllowed ?? []);
  const blocked = new Set(robots?.aiBotsBlocked ?? []);

  const tiers = [
    { tier: 1, label: "Training" },
    { tier: 2, label: "Search-AI" },
    { tier: 3, label: "User-agent" },
  ] as const;

  const allowedBotAgents = AI_BOTS.filter((b) => !blocked.has(b.userAgent)).map((b) => b.userAgent);

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px" }}>
      <SetBreadcrumbs crumbs={["Workspace", "Brands", brand.name, "robots.txt + AI crawlers"]} />

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
            Detect which of the 27 known AI bots can access your site. Catch CDN-level blocks
            (Cloudflare, Akamai, Vercel) that silently break AI visibility.
          </p>
        </div>
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
      </div>

      {/* CDN blocking alert */}
      {robots?.cdnBlockingDetected && (
        <div
          style={{
            padding: 16,
            borderRadius: 8,
            background: "var(--danger-soft)",
            border: "1px solid var(--danger)",
            marginBottom: 24,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--danger)", marginBottom: 4 }}>
            CDN Blocking Detected
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {robots.cdnVendor} may be blocking AI crawlers. Check your bot management settings.
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
          27 AI bots tracked across 3 tiers
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

      {/* 27-Bot Matrix — with FIX 2 per-tier allowed count */}
      {tiers.map(({ tier, label }) => {
        const bots = AI_BOTS.filter((b) => b.tier === tier);
        const tierBlockedCount = bots.filter((b) => blocked.has(b.userAgent)).length;
        const tierAllowedCount = bots.length - tierBlockedCount;
        const allAllowed = tierBlockedCount === 0;
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
                  {allAllowed ? "All allowed" : `${tierBlockedCount} blocked`}
                </div>
              </div>
              <div
                style={{
                  fontSize: 24,
                  fontWeight: 600,
                  fontFamily: "var(--font-mono)",
                  fontVariantNumeric: "tabular-nums",
                  color: allAllowed ? "var(--success)" : "var(--danger)",
                }}
              >
                {tierAllowedCount}/{bots.length}
              </div>
            </div>
            {bots.map((bot) => {
              const isAllowed = allowed.has(bot.userAgent);
              const isBlocked = blocked.has(bot.userAgent);
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
                    style={{
                      fontSize: 14,
                      color: isBlocked ? "var(--danger)" : "var(--success)",
                    }}
                  >
                    {isBlocked ? "✗" : "✓"}
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
                    {isBlocked ? "Blocked" : isAllowed ? "Allowed" : "Default"}
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Recommendations */}
      {(robots?.recommendations?.length ?? 0) > 0 && (
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
            {robots?.recommendations.map((rec) => (
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
