/**
 * URGENT PDF reports (1 Nov), part 2 -- a storage host that takes the
 * request and never answers. Before, Node's fetch alone limited it (10 s
 * to connect, then up to 300 s for the response headers), per attempt.
 * Now every Supabase request gives up at 30 s, and that counts as storage
 * unavailable. Through the real adapter and storage-js, on a fake clock.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pdfFailureReasonFor } from "@/lib/communication/report-pdf-failure";
import { SupabaseStorageAdapter } from "@/lib/storage/supabase-adapter";

const HOST = "abcdefghijklmnopqrst.supabase.co";

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("SUPABASE_URL", `https://${HOST}`);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_AbCdEf0123456789");
  // Accepts the request and never answers -- until its signal aborts.
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    ),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("an upload that hangs gives up at 30 s", () => {
  it("still waiting at 29 s; failed at 30 s, as a timeout, counted as storage unavailable", async () => {
    let outcome: Error | "uploaded" | null = null;
    new SupabaseStorageAdapter()
      .upload("org-1/report-1.pdf", Buffer.from("%PDF"), "application/pdf")
      .then(() => {
        outcome = "uploaded";
      })
      .catch((e: Error) => {
        outcome = e;
      });

    await vi.advanceTimersByTimeAsync(29_000);
    expect(outcome).toBeNull();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(outcome).toBeInstanceOf(Error);
    const message = (outcome as unknown as Error).message;
    expect(message).toContain("(cause: TimeoutError: The storage request took longer than 30 s)");
    expect(message).not.toMatch(/https?:\/\//);
    expect(pdfFailureReasonFor(message)).toBe("storage_unavailable");
  });
});
