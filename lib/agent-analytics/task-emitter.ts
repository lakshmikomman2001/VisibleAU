import { serviceDb } from "@/db/client";
import { createTask } from "@/lib/workflow/task-manager";
import type { CdnJoinRow } from "./cdn-shield-join";
import type { VerificationRate, FiveXxResult, RobotsViolation } from "./metrics";

export const AA_TASK_TYPES = [
  "unblock_retrieval_bot",
  "fix_5xx_for_bots",
  "add_sitemap_for_ai",
  "thin_content_never_crawled",
  "investigate_impersonation",
  "robots_violation_needs_edge_rule",
] as const;

export type AaTaskType = (typeof AA_TASK_TYPES)[number];

const AA13_CAVEAT =
  "Note: referral attribution is structurally incomplete — many AI platforms send no referrer header. " +
  "The referral side is a lower bound; the true ratio is better than shown.";

interface TaskEmitContext {
  organizationId: string;
  brandId: string;
}

export async function emitCdnJoinTasks(
  ctx: TaskEmitContext,
  joinRows: CdnJoinRow[],
): Promise<number> {
  let emitted = 0;

  for (const row of joinRows) {
    if (row.verdict === "self_blocked") {
      await createTask({
        organizationId: ctx.organizationId,
        brandId: ctx.brandId,
        title: `Unblock ${row.vendor} retrieval bot — currently invisible`,
        description:
          `CDN Shield shows ${row.crawlerName} is blocked by your configuration, ` +
          `and no crawl activity has been observed. Your content is invisible to this AI engine. ` +
          `Review robots.txt and CDN/WAF rules.`,
        dimension: "retrieval",
        recommendationKey: "unblock_retrieval_bot",
        effort: "medium",
        qualityStatus: "sufficient",
      }, serviceDb);
      emitted++;
    }

    if (row.verdict === "robots_violation") {
      await createTask({
        organizationId: ctx.organizationId,
        brandId: ctx.brandId,
        title: `${row.vendor} ignores your robots.txt — consider edge/WAF rule`,
        description:
          `${row.crawlerName} is crawling despite being blocked in your robots.txt. ` +
          `Only an edge-level rule (Cloudflare WAF, Vercel firewall) can enforce blocking.`,
        dimension: "retrieval",
        recommendationKey: "robots_violation_needs_edge_rule",
        effort: "medium",
        qualityStatus: "sufficient",
      }, serviceDb);
      emitted++;
    }
  }

  return emitted;
}

export async function emitCoverageGapTasks(
  ctx: TaskEmitContext,
  gaps: string[],
  sitemapTotal: number,
): Promise<number> {
  if (gaps.length === 0) return 0;

  const coveragePercent = Math.round(((sitemapTotal - gaps.length) / sitemapTotal) * 100);

  if (gaps.length > sitemapTotal * 0.5) {
    await createTask({
      organizationId: ctx.organizationId,
      brandId: ctx.brandId,
      title: `${gaps.length} sitemap pages never crawled by AI — discoverability problem`,
      description:
        `Only ${coveragePercent}% of your sitemap has been visited by any AI crawler. ` +
        `Pages with no crawl activity are invisible to AI engines. ` +
        `Consider: missing internal links, thin content, or sitemap not submitted.`,
      dimension: "retrieval",
      recommendationKey: "add_sitemap_for_ai",
      effort: "low",
      qualityStatus: "partial",
    }, serviceDb);
    return 1;
  }

  if (gaps.length > 0) {
    await createTask({
      organizationId: ctx.organizationId,
      brandId: ctx.brandId,
      title: `${gaps.length} pages never crawled — possible thin content`,
      description:
        `These sitemap pages have never been visited by an AI crawler: ` +
        `${gaps.slice(0, 5).join(", ")}${gaps.length > 5 ? ` (+${gaps.length - 5} more)` : ""}. ` +
        `This may indicate thin or undiscoverable content.`,
      dimension: "retrieval",
      recommendationKey: "thin_content_never_crawled",
      effort: "low",
      qualityStatus: "partial",
    }, serviceDb);
    return 1;
  }

  return 0;
}

export async function emit5xxTasks(
  ctx: TaskEmitContext,
  results: FiveXxResult[],
): Promise<number> {
  let emitted = 0;

  for (const r of results) {
    if (r.rate > 5) {
      await createTask({
        organizationId: ctx.organizationId,
        brandId: ctx.brandId,
        title: `${r.vendor} bots getting ${r.rate}% 5xx errors — you're the bottleneck`,
        description:
          `${r.count5xx} of ${r.totalHits} requests from ${r.vendor} returned 5xx errors. ` +
          `When bots consistently get server errors, they reduce crawl frequency — ` +
          `your content becomes stale in AI responses.`,
        dimension: "retrieval",
        recommendationKey: "fix_5xx_for_bots",
        effort: "high",
        qualityStatus: "sufficient",
      }, serviceDb);
      emitted++;
    }
  }

  return emitted;
}

export async function emitImpersonationTasks(
  ctx: TaskEmitContext,
  rates: VerificationRate[],
): Promise<number> {
  let emitted = 0;

  for (const r of rates) {
    if (r.unverifiedRate > 25 && r.total >= 10) {
      await createTask({
        organizationId: ctx.organizationId,
        brandId: ctx.brandId,
        title: `${r.vendor}: ${r.unverifiedRate}% unverified — possible impersonation`,
        description:
          `${r.unverified} of ${r.total} hits claiming to be ${r.vendor} could not be verified. ` +
          `An unverified rate above 25% suggests scraping activity impersonating AI bots. ` +
          `${r.spoofed > 0 ? `${r.spoofed} hits were confirmed spoofed.` : ""}`,
        dimension: "retrieval",
        recommendationKey: "investigate_impersonation",
        effort: "medium",
        qualityStatus: "sufficient",
      }, serviceDb);
      emitted++;
    }
  }

  return emitted;
}
