import type { CrawlResult } from "@/lib/crawler/types";

interface CdnDetection {
  detected: boolean;
  vendor: string | null;
  blocking: boolean;
  remediation: string | null;
}

export function detectCdnBlocking(crawl: CrawlResult): CdnDetection {
  const homepage = crawl.pages[0];
  if (!homepage) return { detected: false, vendor: null, blocking: false, remediation: null };

  const server = (homepage.headers?.server ?? "").toLowerCase();
  const via = (homepage.headers?.via ?? "").toLowerCase();
  const cfRay = homepage.headers?.["cf-ray"];

  let vendor: string | null = null;
  if (cfRay || server.includes("cloudflare")) vendor = "Cloudflare";
  else if (server.includes("akamai") || via.includes("akamai")) vendor = "Akamai";
  else if (server.includes("vercel") || homepage.headers?.["x-vercel-id"]) vendor = "Vercel";

  const blocking = homepage.statusCode === 403 || homepage.statusCode === 503;

  const remediations: Record<string, string> = {
    Cloudflare: "Go to Cloudflare Dashboard → Security → Bots → Configure Bot Fight Mode to allow verified AI bots.",
    Akamai: "In Akamai Control Center → Security Configuration → Bot Manager → Add AI crawler user-agents to the allow list.",
    Vercel: "In vercel.json, add AI bot user-agents to the firewall allowlist or disable bot protection for /api routes.",
  };

  return {
    detected: vendor !== null,
    vendor,
    blocking,
    remediation: blocking && vendor ? remediations[vendor] ?? null : null,
  };
}
