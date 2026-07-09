import type { CrawlPage } from "@/lib/crawler/types";

export interface EntityHomeResult {
  isEntityHomeCandidate: boolean;
  entityHomeHasOrgSchema: boolean;
  entityHomeHasIdField: boolean;
  entityHomeSameAsCount: number;
  entityHomePageUrl: string | null;
  gaps: string[];
}

export function auditEntityHome(brandDomain: string, pages: CrawlPage[]): EntityHomeResult {
  const candidate = pages.find((p) => {
    const lower = p.url.toLowerCase();
    return lower.includes("/about") || lower === `https://${brandDomain}` || lower === `https://${brandDomain}/`;
  });

  if (!candidate) {
    return {
      isEntityHomeCandidate: false,
      entityHomeHasOrgSchema: false,
      entityHomeHasIdField: false,
      entityHomeSameAsCount: 0,
      entityHomePageUrl: null,
      gaps: ["No Entity Home candidate identified. Create an About page with Organisation JSON-LD."],
    };
  }

  const html = candidate.html;
  const gaps: string[] = [];

  const orgSchemaMatch = html.match(/"@type"\s*:\s*"(?:Organization|LocalBusiness)"/i);
  const entityHomeHasOrgSchema = orgSchemaMatch !== null;
  if (!entityHomeHasOrgSchema) {
    gaps.push("Missing Organisation JSON-LD on your Entity Home page. Add a structured data block.");
  }

  let entityHomeHasIdField = false;
  if (entityHomeHasOrgSchema) {
    const idMatch = html.match(/"@id"\s*:\s*"([^"]+)"/);
    if (idMatch) {
      const idUrl = idMatch[1];
      entityHomeHasIdField = idUrl.includes(brandDomain);
      if (!entityHomeHasIdField) {
        gaps.push(`@id points to ${idUrl} instead of ${brandDomain}. Update to your canonical domain.`);
      }
    } else {
      gaps.push("Organisation JSON-LD is missing @id. Add an @id pointing to your canonical domain.");
    }
  }

  let entityHomeSameAsCount = 0;
  const sameAsMatch = html.match(/"sameAs"\s*:\s*\[([^\]]*)\]/);
  if (sameAsMatch) {
    const urls = sameAsMatch[1].match(/"https?:\/\/[^"]+"/g);
    entityHomeSameAsCount = urls ? urls.length : 0;
  }
  if (entityHomeSameAsCount < 3) {
    gaps.push(
      `Only ${entityHomeSameAsCount} sameAs declarations found (target: ≥3). Add links to Wikipedia, LinkedIn, Wikidata, or local directories.`,
    );
  }

  return {
    isEntityHomeCandidate: true,
    entityHomeHasOrgSchema,
    entityHomeHasIdField,
    entityHomeSameAsCount,
    entityHomePageUrl: candidate.url,
    gaps,
  };
}
