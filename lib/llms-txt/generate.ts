import type { CrawlResult } from "@/lib/crawler/types";

interface LlmsTxtOptions {
  brandName: string;
  domain: string;
  vertical: string;
  description?: string;
}

export function generateLlmsTxt(crawl: CrawlResult, opts: LlmsTxtOptions): string {
  const lines: string[] = [];

  lines.push(`# ${opts.brandName}`);
  lines.push("");
  lines.push(`> ${opts.description ?? `${opts.brandName} is an Australian ${opts.vertical.replace(/_/g, " ")} business based at ${opts.domain}.`}`);
  lines.push("");

  const servicePages = crawl.pages.filter(
    (p) => p.wordCount > 100 && !p.url.includes("/blog") && !p.url.includes("/news"),
  );
  const blogPages = crawl.pages.filter(
    (p) => p.url.includes("/blog") || p.url.includes("/news") || p.url.includes("/article"),
  );

  if (servicePages.length > 0) {
    lines.push("## Services");
    lines.push("");
    for (const page of servicePages.slice(0, 10)) {
      const title = page.title || page.url.split("/").pop() || "Page";
      lines.push(`- [${title}](${page.url}): ${page.excerpt.slice(0, 120)}`);
    }
    lines.push("");
  }

  if (blogPages.length > 0) {
    lines.push("## Resources");
    lines.push("");
    for (const page of blogPages.slice(0, 5)) {
      const title = page.title || "Article";
      lines.push(`- [${title}](${page.url}): ${page.excerpt.slice(0, 120)}`);
    }
    lines.push("");
  }

  lines.push("## Contact");
  lines.push("");
  lines.push(`- Website: https://${opts.domain}`);
  lines.push(`- Region: Australia`);
  lines.push("");

  return lines.join("\n");
}
