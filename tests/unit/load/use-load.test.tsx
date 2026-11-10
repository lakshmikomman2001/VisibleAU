// @vitest-environment jsdom
/**
 * Follow-ups from af8de42..d1eb5a1 (10 Nov), part 1 -- the one loader (lib/hooks/use-load.ts): loading, then
 * error, empty or ready, and nothing else. "empty" only after a load that worked; a failure is "error" with
 * the server's reason; Try again (retry) loads again; a newer load drops an older one's answer.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useLoad } from "@/lib/hooks/use-load";
import { LoadFailure } from "@/lib/load/fetch-json";

describe("useLoad", () => {
  it("loading, then ready with the data", async () => {
    const load = vi.fn(async () => [1, 2]);
    const { result } = renderHook(() => useLoad(load, { isEmpty: (rows) => rows.length === 0 }));
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.data).toEqual([1, 2]);
  });

  it("empty only after a load that worked and found nothing", async () => {
    const { result } = renderHook(() =>
      useLoad(async () => [] as number[], { isEmpty: (rows) => rows.length === 0 }),
    );
    await waitFor(() => expect(result.current.status).toBe("empty"));
  });

  it("a failure is error, with the server's reason and status -- never empty", async () => {
    const load = async (): Promise<number[]> => {
      throw new LoadFailure(403, "Only owners can see this.");
    };
    const { result } = renderHook(() => useLoad(load, { isEmpty: (rows) => rows.length === 0 }));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.data).toBeNull();
    expect(result.current.detail).toBe("Only owners can see this.");
    if (result.current.status === "error") expect(result.current.httpStatus).toBe(403);
  });

  it("any other throw is error too, with no reason to show", async () => {
    const { result } = renderHook(() =>
      useLoad(async () => {
        throw new Error("boom");
      }),
    );
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.detail).toBeNull();
  });

  it("retry after an error shows loading, then the answer", async () => {
    let fail = true;
    const load = vi.fn(async () => {
      if (fail) throw new LoadFailure(500, null);
      return "saved";
    });
    const { result } = renderHook(() => useLoad(load));
    await waitFor(() => expect(result.current.status).toBe("error"));
    fail = false;
    act(() => result.current.retry());
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.data).toBe("saved"));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("enabled: false doesn't load", async () => {
    const load = vi.fn(async () => 1);
    const { result } = renderHook(() => useLoad(load, { enabled: false }));
    await new Promise((r) => setTimeout(r, 20));
    expect(load).not.toHaveBeenCalled();
    expect(result.current.status).toBe("loading");
  });

  it("a new load (another brand) drops the old one's answer and starts from loading", async () => {
    let resolveA: (v: string) => void = () => {};
    const loadA = () => new Promise<string>((r) => (resolveA = r));
    const loadB = async () => "brand B";
    const { result, rerender } = renderHook(({ load }) => useLoad(load), {
      initialProps: { load: loadA as (signal: AbortSignal) => Promise<string> },
    });
    rerender({ load: loadB });
    await waitFor(() => expect(result.current.data).toBe("brand B"));
    resolveA("brand A");
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.data).toBe("brand B");
  });
});

describe("useLoad: an answer it can't read", () => {
  it("a 2xx without the list it should have is error, never an unhandled rejection", async () => {
    // 55f29e3's follow-up: isEmpty threw on an answer without the list (role-decisions-ui's `{}` for
    // /api/brands), outside the error handler, so the page stayed on loading and the rejection was unhandled.
    const load = async () => (({}) as { brands: string[] }).brands;
    const { result } = renderHook(() => useLoad(load, { isEmpty: (rows) => rows.length === 0 }));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.data).toBeNull();
  });
});
