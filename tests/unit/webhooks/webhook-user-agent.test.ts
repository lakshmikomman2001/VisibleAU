/**
 * Before the next push (11 Nov), part 3 -- webhook deliveries identify as "Vunnara-Webhook/1.0", from one
 * constant (lib/product.ts WEBHOOK_USER_AGENT). A delivery said "VisibleAU-Webhook/1.0" (a literal in
 * lib/webhooks/deliver.ts) and the settings page's test delivery sent no User-Agent of its own. Sri, 11 Nov:
 * production has no webhook endpoints, so no receiver matches on the old name.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { PRODUCT_NAME, WEBHOOK_HEADERS, WEBHOOK_USER_AGENT } from "@/lib/product";
import { deliver } from "@/lib/webhooks/deliver";
import {
  NON_TEST_ROOTS,
  readSourcesBeforeAll,
  sourceFiles,
  sourceText,
} from "../../helpers/source-files";

readSourcesBeforeAll([...NON_TEST_ROOTS]);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the webhook User-Agent", () => {
  it("is Vunnara-Webhook/1.0, named for the product", () => {
    expect(WEBHOOK_USER_AGENT).toBe("Vunnara-Webhook/1.0");
    expect(WEBHOOK_USER_AGENT.startsWith(`${PRODUCT_NAME}-`)).toBe(true);
  });

  it("is what a delivery sends", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    await deliver("https://hooks.example.com/in", { hello: "world" }, "abc123", "audit.completed");
    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get("User-Agent")).toBe("Vunnara-Webhook/1.0");
    expect(headers.get("X-Vunnara-Signature")).toBe("sha256=abc123");
    expect(headers.get("X-Vunnara-Event")).toBe("audit.completed");
    // GST-free pricing (11 Nov), part 2: X-VisibleAU-* until then.
    expect([...headers.keys()].filter((name) => /visibleau/i.test(name))).toEqual([]);
  });

  it("is what the settings page's test delivery sends, from the same constant", () => {
    const route = sourceText("app/api/webhooks-config/[id]/test/route.ts");
    expect(route).toContain('"User-Agent": WEBHOOK_USER_AGENT');
    expect(sourceText("lib/webhooks/deliver.ts")).toContain('"User-Agent": WEBHOOK_USER_AGENT');
  });

  it("the X-Vunnara-* header names come from WEBHOOK_HEADERS in both senders (GST-free pricing, part 2)", () => {
    expect(WEBHOOK_HEADERS).toEqual({
      signature: "X-Vunnara-Signature",
      event: "X-Vunnara-Event",
      test: "X-Vunnara-Test",
    });
    const route = sourceText("app/api/webhooks-config/[id]/test/route.ts");
    for (const name of ["signature", "event", "test"]) {
      expect(route).toContain(`[WEBHOOK_HEADERS.${name}]:`);
    }
    expect(sourceText("lib/webhooks/deliver.ts")).toContain("[WEBHOOK_HEADERS.signature]:");
    const code = (text: string) =>
      text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    const offenders = sourceFiles([...NON_TEST_ROOTS])
      .filter((f) => /X-VisibleAU-/i.test(code(f.text)))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("the old name is nowhere in shipped code (comments aside)", () => {
    const code = (text: string) =>
      text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    const offenders = sourceFiles([...NON_TEST_ROOTS])
      .filter((f) => /VisibleAU-Webhook/.test(code(f.text)))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });
});
