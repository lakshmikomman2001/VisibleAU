/**
 * Vunnara (21 Oct, "directory listings... never scraping", Part D) --
 * a plain, factual read of what Part D's batched citation count found:
 * which of this brand's relevant directories (lib/directories/
 * registry.ts) AI answers actually cited this audit, and whether any
 * cited URL was the owner's own confirmed profile (Part C). Makes no
 * recommendation itself (that's the directory-visibility rule, Part E,
 * shown in Action Center below this panel) -- just the measured count
 * and the real cited URLs, linked.
 *
 * Polish (21 Oct, audit #30 live) -- citedUrls is now DISTINCT pages
 * (lib/directories/citation-counts.ts's own dedup, by host+path+query
 * once tracking params are stripped): the same page tagged with two
 * different utm_source values by two different answers used to show
 * up twice. Each entry's displayUrl (not its real url) is what's
 * shown; the link itself still goes to the real, un-normalized url.
 */
const MAX_INLINE_URLS = 3;

export interface DirectoryCitedPanelUrl {
  url: string;
  displayUrl: string;
}

export interface DirectoryCitedPanelRow {
  key: string;
  name: string;
  citedCount: number;
  citedUrls: DirectoryCitedPanelUrl[];
  ownerProfileCited: boolean;
}

export function DirectoriesCitedPanel({
  rows,
  totalAnswers,
}: {
  rows: DirectoryCitedPanelRow[];
  totalAnswers: number;
}) {
  const cited = rows
    .filter((r) => r.citedCount > 0)
    // Highest count first; ties broken by name so the order is
    // deterministic and never just "whatever order the registry
    // happened to list them in" for two directories cited equally
    // often.
    .sort((a, b) => b.citedCount - a.citedCount || a.name.localeCompare(b.name));

  return (
    <div
      role="region"
      aria-label="Directories AI cited"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-default)",
        borderRadius: 8,
        padding: 24,
      }}
    >
      <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 4px" }}>
        Directories AI cited
      </h3>
      <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "0 0 20px" }}>
        {totalAnswers === 0
          ? "No answers to everyday customer questions (questions that don't name your business) to check yet."
          : `Out of ${totalAnswers} answer${totalAnswers === 1 ? "" : "s"} to everyday customer questions (questions that don't name your business).`}
      </p>

      {totalAnswers > 0 && cited.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>
          None of your relevant directories were cited by any AI answer this audit.
        </p>
      )}

      {cited.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {cited.map((r) => {
            const inline = r.citedUrls.slice(0, MAX_INLINE_URLS);
            const more = r.citedUrls.length - inline.length;
            return (
              <div key={r.key}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                    {r.name} cited in {r.citedCount} of {totalAnswers} answers
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color: r.ownerProfileCited ? "var(--success)" : "var(--text-tertiary)",
                    }}
                  >
                    · {r.ownerProfileCited ? "including your own profile" : "none were your profile"}
                  </span>
                </div>
                {inline.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                      marginTop: 6,
                    }}
                  >
                    {inline.map((entry) => (
                      <a
                        key={entry.url}
                        href={entry.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 12, color: "var(--accent-blue)", wordBreak: "break-all" }}
                      >
                        {entry.displayUrl}
                      </a>
                    ))}
                    {more > 0 && (
                      <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>and {more} more</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
