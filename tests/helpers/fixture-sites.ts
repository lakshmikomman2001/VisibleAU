/**
 * S00B part 3: the recorded public sites every caller parity test reads (tests/unit/fetch-callers/), and a local
 * server that stands in for an internal address. Served through tests/helpers/fetch-fixtures.ts.
 */
import { once } from "node:events";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Fixture } from "./fetch-fixtures";

export const HOME = `<!doctype html><html><head><title>Fixture Plumbing | Sydney plumbers</title>
<meta name="description" content="Licensed plumbers in Sydney since 1998."></head>
<body><header>Top bar</header><nav><a href="/services">Services</a></nav>
<main><h1>Fixture Plumbing</h1><p>Blocked drains, hot water and gas fitting across Sydney.</p>
<a href="/services">Our services</a> <a href="/services/">Services again</a> <a href="/about">About</a>
<a href="/old-page">Old page</a> <a href="http://fixture-plumbing.com.au/blog">Blog</a>
<a href="/contact">Contact</a> <a href="https://other.example/x">Elsewhere</a> <a href="mailto:hi@x.au">Mail</a>
<a href="#top">Top</a></main><footer>Footer</footer></body></html>`;

export const page = (title: string, extra = "") =>
  `<html><head><title>${title}</title></head><body><main><h1>${title}</h1><p>${title} text for the crawl.</p>${extra}</main></body></html>`;

export const html = (body: string, headers: Record<string, string> = {}): Fixture => ({
  headers: { "content-type": "text/html; charset=utf-8", "x-served-by": "fixture", ...headers },
  body,
});

export const SITES: Record<string, Fixture> = {
  // A typical small business site: robots.txt with a sitemap, links, a redirect, an http link, a 404.
  "https://fixture-plumbing.com.au/robots.txt": {
    headers: { "content-type": "text/plain" },
    body: "User-agent: *\nAllow: /\n\nSitemap: https://fixture-plumbing.com.au/sitemap.xml\n",
  },
  "https://fixture-plumbing.com.au/sitemap.xml": {
    headers: { "content-type": "application/xml" },
    body: '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://fixture-plumbing.com.au/</loc></url></urlset>',
  },
  "https://fixture-plumbing.com.au/": html(HOME, {
    "set-cookie": "a=1",
    "cache-control": "max-age=60",
  }),
  "https://fixture-plumbing.com.au/services": html(
    page(
      "Services",
      '<span class="author">Jo Fixture</span><a href="/services/hot-water">Hot water</a>',
    ),
  ),
  "https://fixture-plumbing.com.au/services/hot-water": html(page("Hot water")),
  "https://fixture-plumbing.com.au/about": html(page("About us")),
  "https://fixture-plumbing.com.au/old-page": { redirect: 301, location: "/about-us" },
  "https://fixture-plumbing.com.au/about-us": html(page("About us, moved")),
  "http://fixture-plumbing.com.au/blog": html(page("Blog")),
  "https://fixture-plumbing.com.au/contact": {
    status: 404,
    headers: { "content-type": "text/html" },
    body: "nope",
  },
  // A site whose CDN refuses the checker: robots.txt 403, the sitemap 503, the home page 403.
  "https://fixture-blocked.com.au/robots.txt": { status: 403, body: "denied" },
  "https://fixture-blocked.com.au/sitemap.xml": { status: 503, body: "busy" },
  "https://fixture-blocked.com.au/": {
    status: 403,
    headers: { server: "cloudflare", "cf-ray": "abc" },
    body: "denied",
  },
  // No robots.txt; the sitemap URL answers with the site's own HTML (a soft 404); one page, no links.
  "https://fixture-soft.com.au/robots.txt": { status: 404, body: "" },
  "https://fixture-soft.com.au/sitemap.xml": html("<html><body>Not a sitemap</body></html>"),
  "https://fixture-soft.com.au/": html(page("Soft")),
  // robots.txt names a sitemap on another public host; the home page redirects to www.
  "https://fixture-cdn.com.au/robots.txt": {
    headers: { "content-type": "text/plain" },
    body: "User-agent: GPTBot\nDisallow: /\nSitemap: https://cdn.fixture-assets.com/fixture-cdn/sitemap.xml",
  },
  "https://cdn.fixture-assets.com/fixture-cdn/sitemap.xml": {
    headers: { "content-type": "text/xml" },
    body: "<sitemapindex><sitemap><loc>https://fixture-cdn.com.au/s1.xml</loc></sitemap></sitemapindex>",
  },
  "https://fixture-cdn.com.au/": { redirect: 302, location: "https://www.fixture-cdn.com.au/" },
  "https://www.fixture-cdn.com.au/": html(page("CDN home")),
};

export const FIXTURE_DOMAINS = [
  "fixture-plumbing.com.au",
  "fixture-blocked.com.au",
  "fixture-soft.com.au",
  "fixture-cdn.com.au",
] as const;

/**
 * A local server that answers anything, standing in for an internal service: a request that reached it would show
 * its content ("Internal admin", "Internal Corp", the secret sitemap) in the caller's result.
 */
export async function startInternalServer(): Promise<{
  port: number;
  close: () => Promise<void>;
  hits: string[];
}> {
  const hits: string[] = [];
  const server = http.createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    const url = req.url ?? "/";
    if (url.endsWith("sitemap.xml")) {
      res.writeHead(200, { "content-type": "application/xml" });
      res.end("<urlset><url><loc>http://internal/secret</loc></url></urlset>");
    } else if (url.endsWith("robots.txt")) {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("User-agent: *\nDisallow: /internal-only\n");
    } else if (
      url.endsWith(".txt") ||
      url.endsWith(".json") ||
      url.includes("/ai/") ||
      url.includes("mcp")
    ) {
      const json = url.endsWith(".json") || url.includes("mcp");
      res.writeHead(200, { "content-type": json ? "application/json" : "text/plain" });
      res.end(
        json
          ? JSON.stringify({ tools: ["internal"], secret: "x".repeat(120) })
          : `# Internal\n${"secret ".repeat(30)}`,
      );
    } else {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(
        '<html><head><title>Internal admin</title><meta property="og:site_name" content="Internal Corp"></head><body><main><h1>Internal admin</h1>secret</main></body></html>',
      );
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    port: (server.address() as AddressInfo).port,
    hits,
    close: async () => {
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    },
  };
}
