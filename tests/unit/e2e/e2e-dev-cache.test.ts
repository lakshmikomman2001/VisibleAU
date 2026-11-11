/**
 * Before the next push (11 Nov), part 5 -- why `pnpm e2e:server` held 7-8 GB: Turbopack's filesystem cache for
 * `next dev` (on by default since Next 16.1) had grown to 8.7 GB in .next/dev/cache, and a server restoring it
 * held 6.9 GB within 30 seconds of starting, before it served a page; free memory fell to 474 MB. With the cache
 * moved aside the same server started at 338 MB and peaked at 2.8 GB compiling two pages. The Playwright dev
 * server (pnpm e2e:server and every config's webServer) runs without the cache; `pnpm dev` keeps it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { E2E_SERVER_ENV, e2eWebServer } from "@/tests/e2e/helpers/e2e-config";

const saved = process.env.E2E_DEV_SERVER;

afterEach(() => {
  if (saved === undefined) delete process.env.E2E_DEV_SERVER;
  else process.env.E2E_DEV_SERVER = saved;
  vi.resetModules();
});

async function loadConfig() {
  vi.resetModules();
  return (await import("@/next.config")).default;
}

describe("the e2e dev server's Turbopack cache", () => {
  it("every e2e server is started with E2E_DEV_SERVER=1", () => {
    expect(E2E_SERVER_ENV.E2E_DEV_SERVER).toBe("1");
    expect(e2eWebServer().env.E2E_DEV_SERVER).toBe("1");
  });

  it("next.config turns the filesystem cache off for it", async () => {
    process.env.E2E_DEV_SERVER = "1";
    const config = await loadConfig();
    expect(config.experimental?.turbopackFileSystemCacheForDev).toBe(false);
  }, 30_000);

  it("and leaves it on for any other dev server (pnpm dev)", async () => {
    delete process.env.E2E_DEV_SERVER;
    const config = await loadConfig();
    expect(config.experimental?.turbopackFileSystemCacheForDev).toBe(true);
  }, 30_000);
});
