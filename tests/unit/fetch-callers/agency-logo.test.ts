/**
 * S00B part 3, the agency logo fetched at render time (lib/reports/agency-logo-loader.ts loadAgencyLogo ->
 * lib/reports/agency-branding.ts fetchAgencyLogo, inventory F10: only for a logo URL that isn't the workspace's
 * own upload) on the guarded fetcher.
 *
 * Parity: on recorded logo URLs, loadAgencyLogo returns what it did on the parent commit (golden written there with
 * UPDATE_GOLDEN=1): a PNG or JPEG, or null for http, a redirect, a 404, a page that isn't an image, or one over
 * 2 MB. Refusal: a logo on an address fetchAgencyLogo's own string check lets through (a reserved range) is never
 * fetched, and the cover gets no logo (null, its existing path); before S00B the reserved address served the logo.
 */
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadAgencyLogo } from "@/lib/reports/agency-logo-loader";
import { type Fixture, fixtureFetch, golden } from "../../helpers/fetch-fixtures";

const GOLDEN = resolve(__dirname, "__golden__/agency-logo.json");

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 1, 2, 3,
]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 2, 3]);
const image = (bytes: Uint8Array, type: string): Fixture => ({
  headers: { "content-type": type },
  body: bytes,
});

const LOGOS: Record<string, Fixture> = {
  "https://cdn.fixture-agency.com/logo.png": image(PNG, "image/png"),
  "https://cdn.fixture-agency.com/logo.jpg": image(JPEG, "image/jpeg"),
  "https://cdn.fixture-agency.com/untyped": image(PNG, "application/octet-stream"),
  "https://cdn.fixture-agency.com/moved.png": { redirect: 302, location: "/logo.png" },
  "https://cdn.fixture-agency.com/missing.png": { status: 404, body: "" },
  "https://cdn.fixture-agency.com/page.png": {
    headers: { "content-type": "text/html" },
    body: "<html></html>",
  },
  "https://cdn.fixture-agency.com/huge.png": {
    headers: { "content-type": "image/png", "content-length": String(3 * 1024 * 1024) },
    body: PNG,
  },
  "http://cdn.fixture-agency.com/logo.png": image(PNG, "image/png"),
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("parity: recorded logo URLs give what they gave on the parent commit", () => {
  it("eight URLs", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(fixtureFetch(LOGOS));
    const outputs: Record<string, unknown> = {};
    for (const url of Object.keys(LOGOS)) {
      const logo = await loadAgencyLogo(url);
      outputs[url] = logo
        ? { format: logo.format, base64: Buffer.from(logo.data).toString("base64") }
        : null;
    }
    const { expected, actual } = golden(GOLDEN, outputs);
    expect(actual).toBe(expected);
  });
});

describe("refusal: a logo on an internal or reserved address is never fetched", () => {
  it("198.18.0.1 (benchmarking, not in the string check): no logo, and the refusal logged", async () => {
    // The fixture answers for it, standing in for a host on that range that serves the image.
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(fixtureFetch({ "https://198.18.0.1/logo.png": image(PNG, "image/png") }));
    expect(await loadAgencyLogo("https://198.18.0.1/logo.png")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    const refusals = vi
      .mocked(console.warn)
      .mock.calls.map((c) => String(c[0]))
      .filter((line) => line.includes('"guarded_fetch_refused"'));
    expect(refusals.map((line) => JSON.parse(line))).toEqual([
      {
        event: "guarded_fetch_refused",
        host: "198.18.0.1",
        reason: "blocked_address",
        detail: "benchmarking",
      },
    ]);
  });
});
