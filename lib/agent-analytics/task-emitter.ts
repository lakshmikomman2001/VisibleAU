import { serviceDb } from "@/db/client";
import { createTask } from "@/lib/workflow/task-manager";
import type { CdnJoinRow } from "./cdn-shield-join";
import type { FiveXxResult, RobotsViolation, VerificationRate } from "./metrics";

export const AA_TASK_TYPES = [
  "unblock_retrieval_bot",
  "fix_5xx_for_bots",
  "add_sitemap_for_ai",
  "thin_content_never_crawled",
  "robots_violation_needs_edge_rule",
] as const;

export type AaTaskType = (typeof AA_TASK_TYPES)[number];

// Leftovers task, part 3 (17 Nov): no "possible impersonation" task. It was raised when more than 25% of a crawler's
// hits were unverified -- but "unverified" is what a hit is when there's no way to check it (no IP for a snippet
// visit, no published range or reverse-DNS suffix for many crawlers), so the share says how much could be checked,
// not that anyone pretended to be a bot. The measured signal is a hit that FAILED verification ("spoofed": a
// reverse-DNS name or ASN that contradicts the crawler it claims to be): inngest/functions/verify-crawler-hits.ts's
// "check-impersonation" step sends the crawler.impersonation-detected webhook when more than 25% of at least 10
// hits in an hour are spoofed. Nothing called the emitter; no task of this type exists in any local database.

interface TaskEmitContext {
  organizationId: string;
  brandId: string;
}

export async function emitCdnJoinTasks(
  ctx: TaskEmitContext,
  joinRows: CdnJoinRow[],
): Promise<number> {
  let emitted = 0;

  // 19 Nov (Sri's review): a task only where robots.txt really keeps an AI search or answer agent out ("self_blocked"
  // is now only those: lib/agent-analytics/cdn-shield-join.ts). Never for Google-Extended ("control_token": a
  // robots.txt setting, not a crawler, and not what puts a site in AI Overviews), nor for a blocked training crawler
  // ("training_blocked": the owner's choice, and not what decides the answers). Titles name the crawler: they said
  // "Unblock google retrieval bot" and "google ignores your robots.txt" off a Google-Extended rule.
  for (const row of joinRows) {
    // 20 Nov (part 2): only a blocked search crawler (OAI-SearchBot, Claude-SearchBot, Googlebot, PerplexityBot) is a
    // task -- it's what puts a site in AI answers. A user-triggered agent's block is shown on CDN Shield, not tasked:
    // OpenAI and Perplexity say robots.txt may not apply to theirs.
    if (row.verdict === "self_blocked" && row.role === "search") {
      await createTask(
        {
          organizationId: ctx.organizationId,
          brandId: ctx.brandId,
          title: `Unblock ${row.crawlerName} in robots.txt`,
          // Follow-ups from af8de42..d1eb5a1, part 2: the block is robots.txt's own rule for the crawler, read as us
          // (it was a probe sent as the crawler). The visits are verified ones in the brand's crawler logs.
          description:
            `Your robots.txt blocks ${row.crawlerName}, the search crawler behind its company's AI answers, and your ` +
            `crawler logs show no verified visits from it. Until robots.txt allows it, it can't index your site for them.`,
          dimension: "retrieval",
          recommendationKey: "unblock_retrieval_bot",
          effort: "medium",
          qualityStatus: "sufficient",
        },
        serviceDb,
      );
      emitted++;
    }

    if (row.verdict === "robots_violation") {
      await createTask(
        {
          organizationId: ctx.organizationId,
          brandId: ctx.brandId,
          title: `${row.crawlerName} visits despite your robots.txt — consider an edge/WAF rule`,
          description:
            `${row.crawlerName} is crawling despite being blocked in your robots.txt. ` +
            `Only an edge-level rule (Cloudflare WAF, Vercel firewall) can enforce blocking.`,
          dimension: "retrieval",
          recommendationKey: "robots_violation_needs_edge_rule",
          effort: "medium",
          qualityStatus: "sufficient",
        },
        serviceDb,
      );
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
    await createTask(
      {
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
      },
      serviceDb,
    );
    return 1;
  }

  if (gaps.length > 0) {
    await createTask(
      {
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
      },
      serviceDb,
    );
    return 1;
  }

  return 0;
}

export async function emit5xxTasks(ctx: TaskEmitContext, results: FiveXxResult[]): Promise<number> {
  let emitted = 0;

  for (const r of results) {
    if (r.rate > 5) {
      await createTask(
        {
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
        },
        serviceDb,
      );
      emitted++;
    }
  }

  return emitted;
}
