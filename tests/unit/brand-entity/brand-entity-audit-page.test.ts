/**
 * ⚠️ QQQ — the Brand & Entity directory table rendered a present/absent
 * binary that collapsed checkAuDirectories' real "unverifiable" status
 * (the directory blocked or failed our check -- task KK) into a false
 * "Not found," telling a customer they're confirmed absent from a
 * directory we actually couldn't check at all. Fixed to read the real
 * stored three-state status instead of re-deriving a binary.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scoreDirectoryTier } from "@/lib/brand-entity/score";

describe("⚠️ QQQ — Brand & Entity page: real status carried through, not re-derived", () => {
  const src = readFileSync("app/(auth)/brands/[brandId]/brand-entity-audit/page.tsx", "utf8");

  it("the directory type declares status: DirectoryStatus, imported from the real checker (single-sourced)", () => {
    expect(src).toMatch(
      /import\s+type\s*\{\s*DirectoryStatus\s*\}\s*from\s*"@\/lib\/brand-entity\/au-directory-aggregate"/,
    );
    expect(src).toMatch(/status\?:\s*DirectoryStatus/);
  });

  it("a legacy audit without a stored status falls back safely (present -> listed, !present -> not_listed), no crash", () => {
    expect(src).toMatch(
      /status:\s*dir\.status\s*\?\?\s*\(\(dir\.present\s*\?\s*"listed"\s*:\s*"not_listed"\)/,
    );
  });

  it("the old present/absent binary ('Found'/'Not found' off dir.present) is gone from the directory row", () => {
    expect(src).not.toMatch(/\{dir\.present\s*\?\s*"Found"\s*:\s*"Not found"\}/);
  });

  it("renders all three real states, 'unverifiable' distinct from 'not_listed'", () => {
    expect(src).toMatch(/dir\.status === "listed"\s*\n?\s*\?\s*"Listed"/);
    expect(src).toMatch(/"unverifiable"[\s\S]{0,40}\?\s*"Couldn't verify"/);
    expect(src).toMatch(/:\s*"Not found"/);
    // unverifiable must not share the hard-fail (danger) color with not_listed.
    expect(src).toMatch(/"unverifiable"\s*\n?\s*\?\s*"var\(--warning\)"/);
  });

  it("a listed directory links to its real profile url (task RRR: via the shared VerifiedSource component, not a one-off anchor)", () => {
    expect(src).toMatch(/dir\.status === "listed"\s*&&\s*dir\.url/);
    expect(src).toMatch(/<VerifiedSource source=\{dir\.name\} url=\{dir\.url\}/);
  });

  it("the AU Directory Aggregate count is unchanged: still counts only dir.present (== listed), never unverifiable", () => {
    expect(src).toMatch(
      /const directoryCount = findings\?\.directoryPresence\?\.filter\(\(d\) => d\.present\)\?\.length \?\? 0;/,
    );
  });
});

describe("⚠️ QQQ — three-state label logic (replicated from the page's derivation)", () => {
  type DirectoryStatus = "listed" | "not_listed" | "unverifiable";

  function statusLabel(status: DirectoryStatus): string {
    return status === "listed" ? "Listed" : status === "unverifiable" ? "Couldn't verify" : "Not found";
  }

  it("listed -> 'Listed'", () => {
    expect(statusLabel("listed")).toBe("Listed");
  });

  it("not_listed -> 'Not found'", () => {
    expect(statusLabel("not_listed")).toBe("Not found");
  });

  it("unverifiable -> 'Couldn't verify', never 'Not found'", () => {
    expect(statusLabel("unverifiable")).toBe("Couldn't verify");
    expect(statusLabel("unverifiable")).not.toBe("Not found");
  });
});

describe("⚠️ QQQ — AU Directory Aggregate score is unchanged for Bondi (display/type only, no scorer change)", () => {
  it("Bondi's real shape (0/2, all four not_listed) still earns 0/2 using the page's own derivation", () => {
    // Bondi's real shape (task KK/PPP): none of the four directories are
    // confirmed listed. Mirrors the page's directoryCount derivation --
    // filter(d => d.present) -- against directories that now also carry
    // the real `status` field this task adds to the type.
    const directoryPresence = [
      { name: "Hipages", present: false, status: "not_listed" as const, url: null },
      { name: "Yellow Pages AU", present: false, status: "not_listed" as const, url: null },
      { name: "ServiceSeeking", present: false, status: "not_listed" as const, url: null },
      { name: "Word of Mouth", present: false, status: "not_listed" as const, url: null },
    ];
    const directoryCount = directoryPresence.filter((d) => d.present).length;
    expect(directoryCount).toBe(0);
    expect(scoreDirectoryTier(directoryCount)).toBe(0);
  });

  it("an 'unverifiable' directory still contributes 0, same as not_listed -- the label changes, the number doesn't", () => {
    const directoryPresence = [
      { name: "Hipages", present: false, status: "unverifiable" as const, url: null },
      { name: "Yellow Pages AU", present: true, status: "listed" as const, url: "https://www.yellowpages.com.au/some-brand" },
    ];
    const directoryCount = directoryPresence.filter((d) => d.present).length;
    expect(directoryCount).toBe(1); // only the listed one counts
    expect(scoreDirectoryTier(directoryCount)).toBe(1);
  });
});

describe("⚠️ RRR — the real sources are surfaced via the shared VerifiedSource component", () => {
  const src = readFileSync("app/(auth)/brands/[brandId]/brand-entity-audit/page.tsx", "utf8");

  it("imports the shared VerifiedSource component (the first of its kind -- confirmed none existed before PPP/RRR)", () => {
    expect(src).toMatch(
      /import\s*\{\s*VerifiedSource\s*\}\s*from\s*"@\/components\/domain\/brand-entity\/verified-source"/,
    );
  });

  it("every signal's detail row conditionally renders a VerifiedSource when it has a source to show", () => {
    expect(src).toMatch(/\{sig\.source &&/);
    expect(src).toMatch(/<VerifiedSource\s*\n?\s*source=\{sig\.source\.name\}/);
  });

  it("ABN: the real ABR view URL format is used, live-verified (HTTP 200, 'Current details for ABN ... | ABN Lookup')", () => {
    expect(src).toMatch(/https:\/\/abr\.business\.gov\.au\/ABN\/View\?abn=/);
  });

  it("ABN: distinguishes not-provided / provided-but-unverified / verified using brand.abn, not just abnStatus", () => {
    expect(src).toMatch(/const abnOnFile = brand\.abn;/);
    expect(src).toMatch(/No ABN on file — add it in brand settings to verify against the ABR/);
    expect(src).toMatch(/Verified on the Australian Business Register/);
    expect(src).toMatch(/isn't active on the ABR/);
    expect(src).toMatch(/ABN on file, but we couldn't verify it against the ABR/);
  });

  it("ABN: uses entityScore.abnEntityName (the previously-discarded _entityScore query) when verified", () => {
    expect(src).toMatch(/entityScore\?\.abnEntityName/);
    // the query result must be destructured as a real, used binding --
    // not thrown away as `const [_entityScore] = ...`.
    expect(src).not.toMatch(/const\s*\[_entityScore\]/);
  });

  it("Wikipedia: a found result links the real wikipediaAuUrl; a not-found result links a reconstructible search, not inert text", () => {
    expect(src).toMatch(/const wikipediaSourceUrl = wikipediaFound/);
    expect(src).toMatch(/wikipediaSearchUrl\(brand\.name\)/);
    expect(src).toMatch(/Checked Wikipedia — no Australian page found/);
  });

  it("AU TLD keeps source: null (Part E: its evidence is the domain itself, already shown as the detail text)", () => {
    expect(src).toMatch(/label: "Australian TLD \(\.com\.au\)"[\s\S]{0,300}source: null/);
  });

  it("the agency framing line is present under the header", () => {
    expect(src).toMatch(/Every signal is checked against a public source/);
  });

  it("no scoring field (present/earned/max) changed -- only detail text and the new source field were added", () => {
    expect(src).toMatch(/earned: findings\?\.abnVerified \? BRAND_ENTITY_WEIGHTS\.abnVerified : 0/);
    expect(src).toMatch(
      /earned: findings\?\.wikipediaAuPresent \? BRAND_ENTITY_WEIGHTS\.wikipediaAuPresent : 0/,
    );
    expect(src).toMatch(/earned: findings\?\.auTldPresent \? BRAND_ENTITY_WEIGHTS\.auTldPresent : 0/);
    expect(src).toMatch(/earned: directoryEarned/);
  });
});
