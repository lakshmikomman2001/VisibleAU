/**
 * 17 Nov, part 3: the crawl records what the site answered. fetchPage returned null for any non-2xx answer or
 * a timeout, and robots.txt / the sitemap kept only "got a body or not", so a site that was down looked like a
 * site with no pages, no robots.txt and no sitemap -- every check after it scored a failed request as a fact.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { crawlSite } from "@/lib/crawler";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stub(answer: (url: string) => Response | Promise<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => answer(String(input))),
  );
}

describe("crawlSite -- the home page's answer", () => {
  it("a home page that answers 503: no pages, homepage.reached false with the status, and an error that says it", async () => {
    stub(() => new Response("down", { status: 503 }));
    const result = await crawlSite("down.example.com.au", { maxPages: 5 });
    expect(result.pages).toEqual([]);
    expect(result.homepage).toEqual({
      url: "https://down.example.com.au",
      reached: false,
      httpStatus: 503,
    });
    expect(result.errors).toEqual(["Failed to fetch https://down.example.com.au (HTTP 503)"]);
    expect(result.robotsTxtFetch).toEqual({ status: "unreachable", httpStatus: 503 });
    expect(result.sitemap).toEqual({
      url: "https://down.example.com.au/sitemap.xml",
      status: "unreachable",
      httpStatus: 503,
    });
  });

  it("no answer at all (a timeout or DNS failure): httpStatus null", async () => {
    stub(() => {
      throw new TypeError("fetch failed");
    });
    const result = await crawlSite("gone.example.com.au", { maxPages: 5 });
    expect(result.homepage).toEqual({
      url: "https://gone.example.com.au",
      reached: false,
      httpStatus: null,
    });
    expect(result.errors).toEqual(["Failed to fetch https://gone.example.com.au (no answer)"]);
    expect(result.robotsTxtFetch).toEqual({ status: "unreachable", httpStatus: null });
  });

  it("a site that answers: homepage reached with its status; a 404 robots.txt is 'absent', a real sitemap 'found'", async () => {
    stub((url) => {
      if (url.endsWith("/robots.txt")) return new Response("nope", { status: 404 });
      if (url.endsWith("/sitemap.xml"))
        return new Response(
          '<?xml version="1.0"?><urlset><url><loc>https://a.com.au/</loc></url></urlset>',
        );
      return new Response(
        "<html><head><title>Home</title></head><body><main>Hi</main></body></html>",
        {
          headers: { "content-type": "text/html" },
        },
      );
    });
    const result = await crawlSite("a.com.au", { maxPages: 1 });
    expect(result.pages).toHaveLength(1);
    expect(result.homepage).toEqual({ url: "https://a.com.au", reached: true, httpStatus: 200 });
    expect(result.robotsTxtFetch).toEqual({ status: "absent", httpStatus: 404 });
    expect(result.sitemap?.status).toBe("found");
  });

  it("a sitemap URL that serves the site's own HTML page (a soft 404) is 'absent', not found", async () => {
    stub(() => new Response("<!doctype html><html><body>Page not found</body></html>"));
    const result = await crawlSite("soft.example.com.au", { maxPages: 0 });
    expect(result.sitemap?.status).toBe("absent");
  });

  it("maxPages 0 never asks for the home page, so there's no homepage outcome", async () => {
    stub(() => new Response("ok"));
    const result = await crawlSite("a.com.au", { maxPages: 0 });
    expect(result.homepage).toBeUndefined();
  });
});
