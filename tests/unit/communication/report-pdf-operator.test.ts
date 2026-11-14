/**
 * 14 Nov, part 6 (Sri's review of audit #48) -- when a report's PDF fails, the operator reads why on /admin/reports
 * ("Storage unavailable (Supabase project paused or unreachable)") with the failure's own message, secrets
 * stripped; and a report stuck at "Generating…" ends as Failed after a stated 10 minutes, with the page checking
 * on its own until then.
 */
import { describe, expect, it } from "vitest";
import {
  PDF_FAILURE_DETAIL_MAX,
  pdfFailureCause,
  pdfFailureDetailFor,
  pdfFailureOperatorLine,
} from "@/lib/communication/report-pdf-failure";
import { REPORT_MAX_WAIT_MS } from "@/lib/communication/report-poll";
import {
  REPORT_GENERATING_NOTE,
  REPORT_PDF_STALLED_MINUTES,
  REPORT_PDF_STALLED_MS,
} from "@/lib/communication/types";

/** What lib/storage/upload-error.ts throws when the Supabase project's hostname doesn't resolve (paused). */
const PAUSED =
  "Supabase Storage upload failed: fetch failed (cause: ENOTFOUND, Error: getaddrinfo ENOTFOUND jnadabcdefghijklmnop.supabase.co) [body: 48213 bytes, Buffer]";

describe("what the operator reads", () => {
  it.each([
    ["storage_unavailable", PAUSED, "Storage unavailable (Supabase project paused or unreachable)"],
    [
      "storage_unavailable",
      "Supabase Storage upload failed: fetch failed (cause: ECONNREFUSED, Error: connect ECONNREFUSED 10.0.0.1:443)",
      "Storage unavailable (the connection was refused)",
    ],
    [
      "storage_unavailable",
      "Supabase Storage upload failed: fetch failed (cause: UND_ERR_CONNECT_TIMEOUT, ConnectTimeoutError: Connect Timeout Error)",
      "Storage unavailable (no answer in time)",
    ],
    [
      "storage_rejected",
      "Supabase Storage upload failed: HTTP 404 Bucket not found [body: 10 bytes, Buffer]",
      "Storage refused the upload (storage answered HTTP 404)",
    ],
    [
      "storage_misconfigured",
      "Storage is misconfigured: storage URL missing (SUPABASE_URL)",
      "Storage misconfigured",
    ],
    [
      "render_error",
      "Cannot read properties of undefined (reading 'map')",
      "The PDF couldn't be built",
    ],
  ] as const)("%s: %s", (reason, message, line) => {
    expect(pdfFailureOperatorLine(reason, pdfFailureDetailFor(message))).toBe(line);
  });

  it("before migration 0149 there's no message: the category alone", () => {
    expect(pdfFailureOperatorLine("storage_unavailable", null)).toBe("Storage unavailable");
    expect(pdfFailureCause(null)).toBeNull();
  });

  it("a report that never finished, with nothing recorded", () => {
    expect(pdfFailureOperatorLine(null, null)).toBe(
      "Didn't finish within 10 minutes, and no failure was recorded",
    );
  });
});

describe("the stored message", () => {
  it("keeps the hostname (it says which project), drops URLs, keys and tokens, on one line", () => {
    const stored = pdfFailureDetailFor(
      `${PAUSED}\n  at https://jnadabcdefghijklmnop.supabase.co/storage/v1/object/reports?token=abc Bearer eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJl`,
    );
    expect(stored).toContain("getaddrinfo ENOTFOUND jnadabcdefghijklmnop.supabase.co");
    expect(stored).not.toMatch(/https?:\/\//);
    expect(stored).not.toContain("eyJ");
    expect(stored).not.toContain("token=abc");
    expect(stored).not.toContain("\n");
  });

  it(`at most ${PDF_FAILURE_DETAIL_MAX} characters`, () => {
    expect(pdfFailureDetailFor(`render failed: ${"word ".repeat(400)}`)).toHaveLength(
      PDF_FAILURE_DETAIL_MAX,
    );
  });
});

describe("a report stuck at Generating…", () => {
  it("is marked failed after 10 minutes, and the page says so while it waits (never 'ready': the Ready badge is found by its text)", () => {
    expect(REPORT_PDF_STALLED_MINUTES).toBe(10);
    expect(REPORT_PDF_STALLED_MS).toBe(10 * 60_000);
    expect(REPORT_GENERATING_NOTE).toBe(
      "Usually under a minute. After 10 minutes without a PDF, it's marked failed and you can try again.",
    );
    expect(REPORT_GENERATING_NOTE).not.toMatch(/ready/i);
  });

  it("the page keeps checking past that, so it turns to Failed on its own", () => {
    expect(REPORT_MAX_WAIT_MS).toBeGreaterThan(REPORT_PDF_STALLED_MS);
  });
});
