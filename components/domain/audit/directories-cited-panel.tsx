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
 * shown -- as host and path on one line, cut off with an ellipsis on a
 * phone; the link itself still goes to the real, un-normalized url.
 */
import { LinkSuggestedProfile } from "@/components/domain/audit/link-suggested-profile";
import { displayUrl, UrlLink } from "@/components/shared/url-link";
import { citedInAnswers } from "@/lib/directories/cited-in-answers";
import { directoryProfileStatus, LINK_PROFILES_HINT } from "@/lib/directories/profile-status";
import { LINK_MAY_NOT_WORK, type LinkDoubt, linkDoubtReason } from "@/lib/urls/link-doubt";

const MAX_INLINE_URLS = 3;

/** What these links are, for someone reading the audit for the first time (13 Nov, part 5). */
export const DIRECTORIES_EXPLAINED =
  "These are the pages AI used as sources for these answers. They list local businesses; being listed on them is one way businesses get recommended.";

export interface DirectoryCitedPanelUrl {
  url: string;
  displayUrl: string;
  /** 13 Nov follow-up, item 5: why it may not work (lib/urls/link-doubt.ts); the link still opens it as stored. */
  doubt?: LinkDoubt | null;
}

export interface DirectoryCitedPanelRow {
  key: string;
  name: string;
  citedCount: number;
  citedUrls: DirectoryCitedPanelUrl[];
  /** DEMO-BLOCKER (1 Nov), part 5 point 3: a confirmed listing with its
   * profile URL -- without one, whether AI cited "your profile" isn't known. */
  ownerProfileLinked: boolean;
  ownerProfileCitedCount: number;
  /** 13 Nov (part 9): a cited page that looks like the brand's own profile, offered to link; never linked
   * by itself (lib/directories/own-profile.ts). */
  suggestedProfileUrl?: string | null;
}

const status = (r: DirectoryCitedPanelRow) => directoryProfileStatus(r);

export function DirectoriesCitedPanel({
  rows,
  totalAnswers,
  brandId,
}: {
  rows: DirectoryCitedPanelRow[];
  totalAnswers: number;
  /** Where "Link it" stores a suggested profile (13 Nov, part 9); without it, no suggestion is offered. */
  brandId?: string;
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
      <h3
        style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 4px" }}
      >
        Directories AI cited
      </h3>
      {/* 13 Nov (Sri's walk-through, part 5): reading his own product, Sri couldn't tell what these links
          were. One line says it. */}
      <p
        data-directories-explained=""
        style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 4px" }}
      >
        {DIRECTORIES_EXPLAINED}
      </p>
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

      {cited.some((r) => !r.ownerProfileLinked) && (
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "0 0 16px" }}>
          {LINK_PROFILES_HINT}
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
                    {r.name} {citedInAnswers(r.citedCount, totalAnswers)}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      color:
                        status(r).kind === "linked" && r.ownerProfileCitedCount > 0
                          ? "var(--success)"
                          : "var(--text-tertiary)",
                    }}
                  >
                    · Your profile: {status(r).label}
                  </span>
                </div>
                {brandId && r.suggestedProfileUrl && status(r).kind === "not_linked" && (
                  <LinkSuggestedProfile
                    brandId={brandId}
                    directoryKey={r.key}
                    directoryName={r.name}
                    url={r.suggestedProfileUrl}
                  />
                )}
                {inline.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                      marginTop: 6,
                      minWidth: 0,
                    }}
                  >
                    {inline.map((entry) =>
                      entry.doubt ? (
                        <div
                          key={entry.url}
                          style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}
                        >
                          <UrlLink
                            url={entry.url}
                            label={displayUrl(entry.displayUrl)}
                            style={{ fontSize: 12, color: "var(--accent-blue)" }}
                          />
                          <span
                            data-link-doubt={entry.doubt}
                            title={linkDoubtReason(entry.doubt)}
                            style={{ fontSize: 11, color: "var(--warning)", flexShrink: 0 }}
                          >
                            {LINK_MAY_NOT_WORK}
                          </span>
                        </div>
                      ) : (
                        <UrlLink
                          key={entry.url}
                          url={entry.url}
                          label={displayUrl(entry.displayUrl)}
                          style={{ fontSize: 12, color: "var(--accent-blue)" }}
                        />
                      ),
                    )}
                    {more > 0 && (
                      <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                        and {more} more
                      </span>
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
