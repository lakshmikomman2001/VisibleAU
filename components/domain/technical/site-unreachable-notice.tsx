import { AlertCircle } from "lucide-react";
import { siteUnreachableSentence } from "@/lib/technical-audit/crawl-status";

/**
 * 17 Nov, part 3: the one notice every technical page shows when the latest crawl never reached the site
 * (lib/technical-audit/crawl-status.ts crawlReach). It replaces the checks' scores, never sits beside them.
 */
export function SiteUnreachableNotice({
  domain,
  checkedOn,
  httpStatus,
}: {
  domain: string;
  /** The crawl's date, formatted for the reader ("14/11/2026"), or null. */
  checkedOn: string | null;
  httpStatus: number | null;
}) {
  return (
    <section
      aria-label="Site not reached"
      data-site-unreachable
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        padding: 16,
        borderRadius: 8,
        background: "var(--warning-soft)",
        border: "1px solid var(--warning)",
        marginBottom: 24,
      }}
    >
      <AlertCircle
        aria-hidden="true"
        style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2, color: "var(--warning)" }}
      />
      <div>
        <div
          style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}
        >
          We couldn&apos;t reach your site
        </div>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0, lineHeight: 1.5 }}>
          {siteUnreachableSentence(domain, checkedOn, httpStatus)}
        </p>
      </div>
    </section>
  );
}
