import type { CrawlResult } from "@/lib/crawler/types";

interface SSRCheckResult {
  score: number;
  findings: {
    score: number;
    ssrRatio: number;
    renderMode: "ssr" | "partial" | "csr";
    spaDetected: boolean;
    framework: string | null;
  };
}

export async function checkSSR(domain: string, crawl: CrawlResult): Promise<SSRCheckResult> {
  const homepage = crawl.pages[0];
  if (!homepage) {
    return { score: 0, findings: { score: 0, ssrRatio: 0, renderMode: "csr", spaDetected: false, framework: null } };
  }

  const noJsContentLength = homepage.textContent.length;
  const hasReactRoot = homepage.html.includes("__next") || homepage.html.includes("__nuxt");
  const hasAngular = homepage.html.includes("ng-version") || homepage.html.includes("ng-app");
  const hasVue = homepage.html.includes("data-v-") || homepage.html.includes("__vue");

  let framework: string | null = null;
  if (homepage.html.includes("__next")) framework = "Next.js";
  else if (homepage.html.includes("__nuxt")) framework = "Nuxt";
  else if (hasAngular) framework = "Angular";
  else if (hasVue) framework = "Vue";
  else if (homepage.html.includes("data-reactroot")) framework = "React";

  const bodyHasContent = homepage.wordCount > 50;
  const hasMetaContent = homepage.html.includes("<meta") && homepage.title.length > 0;
  const ssrRatio = bodyHasContent ? 0.85 : hasMetaContent ? 0.5 : 0.2;

  let renderMode: "ssr" | "partial" | "csr";
  let score: number;
  if (ssrRatio > 0.7) { renderMode = "ssr"; score = 6; }
  else if (ssrRatio >= 0.4) { renderMode = "partial"; score = 3; }
  else { renderMode = "csr"; score = 0; }

  const spaDetected = !!framework && renderMode === "csr";

  return {
    score,
    findings: { score, ssrRatio: Math.round(ssrRatio * 100) / 100, renderMode, spaDetected, framework },
  };
}
