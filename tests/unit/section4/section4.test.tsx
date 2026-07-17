// @vitest-environment jsdom
/**
 * SECTION 4 — Frontend Unit (component render tests)
 *
 * Assert AA components render per the prototype's spec:
 * Step 1: CDN-join verdict mapping (4 verdicts → exact label/color)
 * Step 2: Verification 3-state (AA-05 — verified-only, >25% warning)
 * Step 3: Empty state as finding (§7.2 — the VisibleAU-ism)
 * Step 4: MANDATORY honesty caveats (AA-13, AA-14)
 * Step 5: Tier-gate show/hide + BUILD-02 coverage merge
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import React from "react";

// ─── Framework mocks (same pattern as sprint9 component tests) ───────────

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [k: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useParams: () => ({ brandId: "test-brand-id" }),
  usePathname: () => "/brands/test-brand-id",
}));

// ─── Component imports ───────────────────────────────────────────────────

import { AgentAnalyticsCrawlerCard } from "@/components/domain/retrieval/agent-analytics-crawler-card";
import { AgentAnalyticsSection } from "@/components/domain/retrieval/agent-analytics-section";
import { AgentAnalyticsSetupPanel } from "@/components/domain/retrieval/agent-analytics-setup-panel";
import {
  AgentAnalyticsPagesCoverage,
  mergeTopPages,
} from "@/components/domain/retrieval/agent-analytics-pages-coverage";
import { TierGate } from "@/components/phase2/tier-gate";

// ─── Helpers ─────────────────────────────────────────────────────────────

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

function stubFetch(body: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
}

const OVERVIEW = {
  volumeByVendor: [
    {
      vendor: "OpenAI",
      crawlerTier: "tier1",
      total: 100,
      retrieval: 50,
      indexing: 40,
      training: 10,
    },
  ],
  volumeByPurpose: [
    { purpose: "retrieval", count: 50, percentage: 50 },
    { purpose: "indexing", count: 40, percentage: 40 },
  ],
  verificationRates: [
    {
      vendor: "OpenAI",
      verified: 90,
      unverified: 5,
      spoofed: 5,
      total: 100,
      unverifiedRate: 5,
      spoofedRate: 5,
    },
  ],
  periodStart: "2026-06-01",
  periodEnd: "2026-07-01",
};

function cdnRow(
  verdict: string,
  vendor = "Bot",
  blocked = false,
  active = true,
) {
  return {
    vendor,
    crawlerName: `${vendor}Crawler`,
    shieldBlocked: blocked,
    hasCrawlActivity: active,
    verdict,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 1 — CDN-join verdict mapping (4 verdicts → exact label/color)
// ═══════════════════════════════════════════════════════════════════════════

describe("Step 1 — CDN-join verdict mapping", () => {
  function renderWithCdn(rows: ReturnType<typeof cdnRow>[]) {
    stubFetch({ cdnJoin: { results: rows } });
    return render(
      <AgentAnalyticsSection
        overview={OVERVIEW}
        ratioData={null}
        ratioLocked={false}
        brandId="t"
      />,
    );
  }

  it("healthy → 'Healthy' in var(--success)", async () => {
    const { findByText } = renderWithCdn([cdnRow("healthy", "OpenAI")]);
    const el = await findByText("Healthy");
    expect(el.style.color).toBe("var(--success)");
  });

  it("not_blocked_never_visited → correct label in var(--warning)", async () => {
    const { findByText } = renderWithCdn([
      cdnRow("not_blocked_never_visited", "Anthropic", false, false),
    ]);
    const el = await findByText("Not Blocked — Never Visited");
    expect(el.style.color).toBe("var(--warning)");
  });

  it("self_blocked → 'Self-Blocked — Invisible' in var(--danger)", async () => {
    const { findByText } = renderWithCdn([
      cdnRow("self_blocked", "Google", true, false),
    ]);
    const el = await findByText("Self-Blocked — Invisible");
    expect(el.style.color).toBe("var(--danger)");
  });

  it("robots_violation → 'Robots Violation' in var(--danger)", async () => {
    const { findByText } = renderWithCdn([
      cdnRow("robots_violation", "Perplexity", true, true),
    ]);
    const el = await findByText("Robots Violation");
    expect(el.style.color).toBe("var(--danger)");
  });

  it("self_blocked vs robots_violation: same color, DISTINCT labels (opposite meanings)", async () => {
    const { findByText } = renderWithCdn([
      cdnRow("self_blocked", "BotA", true, false),
      cdnRow("robots_violation", "BotB", true, true),
    ]);
    const sb = await findByText("Self-Blocked — Invisible");
    const rv = await findByText("Robots Violation");
    expect(sb.textContent).not.toBe(rv.textContent);
    expect(sb.style.color).toBe("var(--danger)");
    expect(rv.style.color).toBe("var(--danger)");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// STEP 2 — Verification 3-state display (AA-05)
// ═══════════════════════════════════════════════════════════════════════════

describe("Step 2 — Verification 3-state (AA-05)", () => {
  function card(v: number, u: number, s: number) {
    return render(
      <AgentAnalyticsCrawlerCard
        retrievalHits={0}
        indexingHits={0}
        trainingHits={0}
        totalHits={0}
        verified={v}
        unverified={u}
        spoofed={s}
        ratioData={null}
        ratioLocked={false}
      />,
    );
  }

  it("verified=0, unverified=8 → Verified badge shows 0, not 8 (AA-05 headline rule)", () => {
    const { container } = card(0, 8, 0);
    // VerificationBadge structure: [dot span][count span][label span]
    // Find the "Verified" label span, then its previous sibling is the count
    const spans = Array.from(container.querySelectorAll("span"));
    const verifiedLabel = spans.find((s) => s.textContent === "Verified");
    expect(verifiedLabel).toBeTruthy();
    const countSpan = verifiedLabel!.previousElementSibling as HTMLElement;
    expect(countSpan.textContent).toBe("0");
  });

  it("renders 3 distinct verification states (Verified / Unverified / Spoofed)", () => {
    const { container } = card(50, 30, 20);
    const text = container.textContent!;
    expect(text).toContain("Verified");
    expect(text).toContain("Unverified");
    expect(text).toContain("Spoofed");
    expect(text).toContain("50");
    expect(text).toContain("30");
    expect(text).toContain("20");
  });

  it(">25% unverified rate → impersonation warning renders", () => {
    // 1/(2+1+0) = 33.3% > 25%
    const { container } = card(2, 1, 0);
    expect(container.textContent).toContain("Unverified rate exceeds 25%");
    expect(container.textContent).toContain("possible bot impersonation");
  });

  it("≤25% unverified rate → no warning", () => {
    // 1/(3+1+0) = 25% exactly — NOT > 25%
    const { container } = card(3, 1, 0);
    expect(container.textContent).not.toContain("Unverified rate exceeds 25%");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// STEP 3 — Empty state as finding (§7.2 — the VisibleAU-ism)
// ═══════════════════════════════════════════════════════════════════════════

describe("Step 3 — Empty state as finding (§7.2)", () => {
  it("totalHits=0 → finding-framed empty state (not generic 'no data')", () => {
    const { container } = render(
      <AgentAnalyticsSetupPanel brandId="t" totalHits={0} />,
    );
    const t = container.textContent!;
    expect(t).toContain("no AI crawler has visited yet");
    expect(t).toContain("This is itself a finding");
    expect(t).toContain("Check Retrieval and CDN Shield");
  });

  it("totalHits>0 → connected state with hit count, no finding", () => {
    const { container } = render(
      <AgentAnalyticsSetupPanel brandId="t" totalHits={42} />,
    );
    const t = container.textContent!;
    expect(t).toContain("Connected.");
    expect(t).toContain("42");
    expect(t).not.toContain("This is itself a finding");
  });

  it("setup panel always renders the 3 ingestion cards", () => {
    const { container } = render(
      <AgentAnalyticsSetupPanel brandId="t" totalHits={0} />,
    );
    const t = container.textContent!;
    expect(t).toContain("Upload a log file");
    expect(t).toContain("Live snippet");
    expect(t).toContain("Cloudflare Logpush");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// STEP 4 — MANDATORY caveats (AA-13, AA-14)
// ═══════════════════════════════════════════════════════════════════════════

describe("Step 4 — MANDATORY caveats (AA-13, AA-14)", () => {
  const CAVEAT =
    "Referral attribution is structurally incomplete. Treat this as a floor, not a verdict.";

  it("AA-13: ratio caveat renders ON the card when ratioData present", () => {
    const { container } = render(
      <AgentAnalyticsCrawlerCard
        retrievalHits={50}
        indexingHits={30}
        trainingHits={20}
        totalHits={100}
        verified={90}
        unverified={5}
        spoofed={5}
        ratioData={{
          results: [
            {
              vendor: "OpenAI",
              verifiedCrawls: 100,
              referralSessions: 10,
              ratio: 10,
              ratioLabel: "10:1",
              benchmark: 8,
            },
          ],
          caveat: CAVEAT,
        }}
        ratioLocked={false}
      />,
    );
    expect(container.textContent).toContain("structurally incomplete");
    expect(container.textContent).toContain("floor, not a verdict");
  });

  it("AA-14: correlation caveat renders on coverage panel", async () => {
    stubFetch({
      coverage: {
        gap: {
          sitemapUrls: ["https://x.com/a"],
          crawledUrls: ["https://x.com/a"],
          gaps: [],
          coveragePercent: 100,
        },
        topRetrieval: [
          {
            url: "https://x.com/about",
            hitCount: 5,
            purpose: "retrieval",
            lastVisit: "2026-07-01",
          },
        ],
        topIndexing: [],
        periodStart: "2026-06-01",
        periodEnd: "2026-07-01",
      },
    });
    const { container } = render(
      <AgentAnalyticsPagesCoverage brandId="t" />,
    );
    await waitFor(() => {
      expect(container.textContent).toContain("correlation");
      expect(container.textContent).toContain("not proof of causation");
      expect(container.textContent).toContain(
        "a crawl grants access, not influence",
      );
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// STEP 5 — Tier gate + coverage merge (BUILD-02 real shape)
// ═══════════════════════════════════════════════════════════════════════════

describe("Step 5 — Tier gate + coverage merge", () => {
  it("TierGate locked → 'Growth plan required' overlay", () => {
    const { container } = render(
      <TierGate requiredTier="Growth" locked={true}>
        <p>Content</p>
      </TierGate>,
    );
    expect(container.textContent).toContain("Growth plan required");
    expect(container.textContent).toContain("Upgrade");
  });

  it("TierGate unlocked → content renders without overlay", () => {
    const { container } = render(
      <TierGate requiredTier="Growth" locked={false}>
        <p>Unlocked</p>
      </TierGate>,
    );
    expect(container.textContent).toContain("Unlocked");
    expect(container.textContent).not.toContain("Growth plan required");
  });

  it("mergeTopPages dedupes URLs across retrieval + indexing, sorts by total", () => {
    const retrieval = [
      {
        url: "https://x.com/a",
        hitCount: 10,
        purpose: "retrieval",
        lastVisit: "2026-07-01",
      },
      {
        url: "https://x.com/b",
        hitCount: 5,
        purpose: "retrieval",
        lastVisit: "2026-07-01",
      },
    ];
    const indexing = [
      {
        url: "https://x.com/a",
        hitCount: 8,
        purpose: "indexing",
        lastVisit: "2026-07-01",
      },
      {
        url: "https://x.com/c",
        hitCount: 15,
        purpose: "indexing",
        lastVisit: "2026-07-01",
      },
    ];
    const merged = mergeTopPages(retrieval, indexing);

    // 3 unique URLs, not 4 (dedup "a")
    expect(merged).toHaveLength(3);

    const a = merged.find((p) => p.url === "https://x.com/a")!;
    expect(a.retrieval).toBe(10);
    expect(a.indexing).toBe(8);

    const b = merged.find((p) => p.url === "https://x.com/b")!;
    expect(b.retrieval).toBe(5);
    expect(b.indexing).toBe(0);

    const c = merged.find((p) => p.url === "https://x.com/c")!;
    expect(c.retrieval).toBe(0);
    expect(c.indexing).toBe(15);

    // Sorted by total (retrieval+indexing) descending: a=18, c=15, b=5
    expect(merged[0].url).toBe("https://x.com/a");
    expect(merged[1].url).toBe("https://x.com/c");
    expect(merged[2].url).toBe("https://x.com/b");
  });

  it("coverage gap renders sitemap-never-crawled URLs", async () => {
    stubFetch({
      coverage: {
        gap: {
          sitemapUrls: ["https://x.com/about", "https://x.com/missing"],
          crawledUrls: ["https://x.com/about"],
          gaps: ["https://x.com/missing"],
          coveragePercent: 50,
        },
        topRetrieval: [],
        topIndexing: [],
        periodStart: "2026-06-01",
        periodEnd: "2026-07-01",
      },
    });
    const { container } = render(
      <AgentAnalyticsPagesCoverage brandId="t" />,
    );
    await waitFor(() => {
      expect(container.textContent).toContain("/missing");
    });
  });
});
