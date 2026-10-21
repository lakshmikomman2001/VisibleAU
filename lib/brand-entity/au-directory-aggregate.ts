/**
 * Vunnara (21 Oct, "directory listings... never scraping", Part A) --
 * the live fetch() implementation that used to live here (checkDirectory/
 * checkAuDirectories/AU_DIRECTORIES) is DELETED, not feature-flagged off.
 * It requested hipages.com.au/find/{brand-slug} -- a trade-CATEGORY
 * browse page, not a business-name search -- so it 404'd for almost any
 * real business name and recorded that 404 as a confirmed "not_listed".
 * ServiceSeeking's own Terms and Conditions prohibit "automated
 * scripting tools" and any commercial use of information obtained from
 * the site without written approval; hipages' robots.txt disallows "/"
 * for a generic (non-self-identifying) user agent, the one this code
 * used. Neither site's own bot-wall/JS-rendering behaviour was ever
 * handled either -- a 200 response from either would be misread as a
 * confirmed absence just as easily as a real one. See this hotfix's own
 * report-back for the full inventory.
 *
 * Only the TYPES remain, kept for two reasons: (1) lib/recommendations/
 * evidence.ts's DirectoryEvidence shape and triggers.ts's
 * evaluateAuDirectories (the au-local-citations rule) still reference
 * them -- that rule is retired in its own, later commit ("Part E"),
 * which is also when these types finally go; (2) a historical audit's
 * already-stored action_items.evidence_refs / technical_audits.findings
 * rows still have data shaped like this, read (never trusted as
 * current) by legacy-row display code.
 *
 * Directory presence now comes ONLY from the owner's own confirmation
 * (brand_directory_listings, Part C) or from counting what AI answers
 * actually cited (Part D) -- never from an automated lookup against a
 * site that didn't permit one.
 */
export type DirectoryStatus = "listed" | "not_listed" | "unverifiable";

export interface DirectoryPresence {
  name: string;
  /** True only when status === "listed". */
  present: boolean;
  status: DirectoryStatus;
  url: string | null;
  finding: string;
}

export interface AuDirectoryResult {
  auDirectoryCount: number;
  auDirectoryPresence: DirectoryPresence[];
}
