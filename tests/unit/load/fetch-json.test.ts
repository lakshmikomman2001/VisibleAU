/**
 * Follow-ups from af8de42..d1eb5a1 (10 Nov), part 1 -- the one way a client page reads an answer
 * (lib/load/fetch-json.ts): a failed answer throws a LoadFailure with the server's own reason, never data.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  actionFailureMessage,
  apiMessage,
  fetchJson,
  LoadFailure,
  loadFailedMessage,
  readJson,
} from "@/lib/load/fetch-json";

afterEach(() => vi.unstubAllGlobals());

describe("apiMessage: the server's reason, in its words", () => {
  it("prefers `message`, then `error` when it's a sentence", async () => {
    expect(await apiMessage(Response.json({ error: "code_x", message: "Do this first." }))).toBe(
      "Do this first.",
    );
    expect(await apiMessage(Response.json({ error: "Only owners can do that." }))).toBe(
      "Only owners can do that.",
    );
  });

  it("never a machine code, an object or a body that isn't JSON", async () => {
    expect(await apiMessage(Response.json({ error: "brand_needs_confirmation" }))).toBeNull();
    expect(await apiMessage(Response.json({ error: { fieldErrors: {} } }))).toBeNull();
    expect(await apiMessage(new Response("<html>Bad gateway</html>", { status: 502 }))).toBeNull();
    expect(await apiMessage(Response.json({ error: "  " }))).toBeNull();
  });
});

describe("readJson / fetchJson", () => {
  it("a 2xx answer is its body", async () => {
    expect(await readJson<{ a: number }>(Response.json({ a: 1 }))).toEqual({ a: 1 });
  });

  it("any other answer throws a LoadFailure with the status and the reason -- never the error body as data", async () => {
    const failure = await readJson(Response.json({ error: "Not found" }, { status: 404 })).catch(
      (e: unknown) => e,
    );
    expect(failure).toBeInstanceOf(LoadFailure);
    expect((failure as LoadFailure).status).toBe(404);
    expect((failure as LoadFailure).detail).toBe("Not found");
  });

  it("a 2xx answer that isn't JSON is a failure too", async () => {
    await expect(readJson(new Response("not json"))).rejects.toBeInstanceOf(LoadFailure);
  });

  it("no answer at all (the network) is a LoadFailure with no status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const failure = await fetchJson("/api/x").catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(LoadFailure);
    expect((failure as LoadFailure).status).toBeNull();
  });

  it("an aborted fetch stays an abort (the page dropped it on purpose)", async () => {
    const controller = new AbortController();
    controller.abort();
    const abort = new DOMException("aborted", "AbortError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abort));
    await expect(fetchJson("/api/x", { signal: controller.signal })).rejects.toBe(abort);
  });
});

describe("the sentences", () => {
  it('a load: "Couldn\'t load <what>."', () => {
    expect(loadFailedMessage("your team")).toBe("Couldn't load your team.");
  });

  it("an action: the server's reason, else the page's own", async () => {
    expect(
      await actionFailureMessage(Response.json({ error: "Not allowed." }, { status: 403 }), "No."),
    ).toBe("Not allowed.");
    expect(await actionFailureMessage(new Response("", { status: 500 }), "It failed.")).toBe(
      "It failed.",
    );
  });
});
