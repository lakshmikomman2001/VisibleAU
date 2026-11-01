/**
 * DEMO-BLOCKER (1 Nov), part 5 -- Sri's decisions on the part 1 findings,
 * the pure parts:
 * 3. "your profile" only when a listing is linked: Not linked yet / 0 cited / k cited;
 * 4. agency branding falls back field by field; the logo fetch is guarded;
 * 5. a template can leave out the optional sections, and an old template leaves none out;
 * 8. the evidence-archive sentence says what's kept, and nothing "immutable";
 * 9. the narrative generator that picked a model and threw it away is gone.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { directoryProfileStatus } from "@/lib/directories/profile-status";
import {
  agencyInitials,
  fetchAgencyLogo,
  resolveAgencyBranding,
} from "@/lib/reports/agency-branding";
import { reportSectionFlags } from "@/lib/reports/report-sections";
import { EVIDENCE_ARCHIVE_SENTENCE } from "@/lib/trust/evidence-archiver";

describe("point 3: directoryProfileStatus", () => {
  it("no confirmed listing with a URL -> 'Not linked yet', whatever the count", () => {
    expect(
      directoryProfileStatus({ ownerProfileLinked: false, ownerProfileCitedCount: 0 }),
    ).toEqual({
      kind: "not_linked",
      label: "Not linked yet",
    });
  });

  it("listed with a URL and not cited -> '0 cited'; listed and cited -> 'k cited'", () => {
    expect(
      directoryProfileStatus({ ownerProfileLinked: true, ownerProfileCitedCount: 0 }).label,
    ).toBe("0 cited");
    expect(
      directoryProfileStatus({ ownerProfileLinked: true, ownerProfileCitedCount: 3 }).label,
    ).toBe("3 cited");
  });
});

describe("point 4: agency branding", () => {
  const empty = { agencyName: null, logoUrl: null, contactLine: null, footerText: null };

  it("a brand row with an empty agency name doesn't hide the workspace row's", () => {
    expect(
      resolveAgencyBranding(
        { ...empty, agencyName: "  ", logoUrl: "https://cdn.example.com/brand-logo.png" },
        { ...empty, agencyName: "Splice Marketing", contactLine: "splice.example.com.au" },
      ),
    ).toEqual({
      name: "Splice Marketing",
      logoUrl: "https://cdn.example.com/brand-logo.png",
      contactLine: "splice.example.com.au",
      footerText: null,
    });
  });

  it("the brand's own field wins when it has one", () => {
    expect(
      resolveAgencyBranding(
        { ...empty, agencyName: "Brand Agency" },
        { ...empty, agencyName: "Workspace" },
      ).name,
    ).toBe("Brand Agency");
    expect(resolveAgencyBranding(null, null).name).toBeNull();
  });

  it("initials for the logo tile", () => {
    expect(agencyInitials("Splice Marketing")).toBe("SP");
    expect(agencyInitials("Acme")).toBe("AC");
  });
});

describe("point 4: fetchAgencyLogo", () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const ok = (bytes: Uint8Array) =>
    vi.fn(
      async () => new Response(bytes.slice().buffer as ArrayBuffer, { status: 200 }),
    ) as unknown as typeof fetch;

  it("fetches a PNG over https", async () => {
    const logo = await fetchAgencyLogo("https://cdn.example.com/logo.png", { fetchImpl: ok(PNG) });
    expect(logo?.format).toBe("png");
    expect(logo?.data.length).toBe(PNG.length);
  });

  it("gives up after the timeout and returns null (the cover draws the initials)", async () => {
    const hang = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    ) as unknown as typeof fetch;
    const started = Date.now();
    expect(
      await fetchAgencyLogo("https://slow.example.com/logo.png", {
        fetchImpl: hang,
        timeoutMs: 50,
      }),
    ).toBeNull();
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("never fetches http, a private or loopback host, or something that isn't a PNG or JPEG", async () => {
    const fetchImpl = ok(PNG);
    for (const url of [
      "http://cdn.example.com/logo.png",
      "https://127.0.0.1/logo.png",
      "https://10.0.0.5/logo.png",
      "https://169.254.169.254/latest/meta-data",
      "https://localhost/logo.png",
      "not a url",
    ]) {
      expect(await fetchAgencyLogo(url, { fetchImpl })).toBeNull();
    }
    expect(fetchImpl).not.toHaveBeenCalled();
    const html = new TextEncoder().encode("<html>not an image</html>");
    expect(
      await fetchAgencyLogo("https://cdn.example.com/logo.png", { fetchImpl: ok(html) }),
    ).toBeNull();
  });
});

describe("point 5: reportSectionFlags", () => {
  it("a template from before these sections existed leaves none out", () => {
    expect(
      reportSectionFlags([
        { type: "executive_summary", include: true },
        { type: "mention_source_divide", include: true },
      ]),
    ).toEqual({
      competitors: true,
      diagnosis: true,
      trend: true,
      recommended_next: true,
      method: true,
    });
    expect(reportSectionFlags(null).method).toBe(true);
  });

  it("include: false leaves that section out", () => {
    const flags = reportSectionFlags([
      { type: "trend", include: false },
      { type: "method", include: false },
      { type: "diagnosis", include: true },
    ]);
    expect(flags).toEqual({
      competitors: true,
      diagnosis: true,
      trend: false,
      recommended_next: true,
      method: false,
    });
  });
});

describe("point 8: the evidence archive, as the report states it", () => {
  it("says what's kept -- never 'immutable' or 'compliance'", () => {
    expect(EVIDENCE_ARCHIVE_SENTENCE).toBe(
      "For each audit we keep the first 500 characters of every first-run answer, with its engine, question and capture time.",
    );
    expect(EVIDENCE_ARCHIVE_SENTENCE).not.toMatch(/immutable|compliance/i);
  });
});

describe("point 9: no model is picked and thrown away in report generation", () => {
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sources(path);
      return /\.(ts|tsx)$/.test(name) ? [path] : [];
    });
  }

  it("lib/communication/narrative-generator.ts is gone, and nothing imports it", () => {
    expect(existsSync("lib/communication/narrative-generator.ts")).toBe(false);
    const importers = ["app", "lib", "inngest", "components"]
      .flatMap(sources)
      .filter((file) => readFileSync(file, "utf8").includes('narrative-generator"'));
    expect(importers).toEqual([]);
  });

  it("the report path never selects a model", () => {
    for (const file of [
      "inngest/functions/generate-narrative-report.ts",
      "inngest/functions/render-report-pdf.ts",
      "lib/reports/report-data.ts",
      "lib/reports/report-narrative.ts",
    ]) {
      expect(readFileSync(file, "utf8")).not.toContain("selectModel");
    }
  });
});
