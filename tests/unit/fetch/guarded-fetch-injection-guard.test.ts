/**
 * S00B part 2: production code can't switch the guarded fetcher's protections off, or point it somewhere else.
 *
 * Tests reach a local server only by replacing lib/fetch/transport.ts with vi.mock (the test transport lives in
 * tests/helpers/guarded-fetch-test-transport.ts). Nothing else can, because:
 * - lib/fetch reads no environment variable (no "allow private addresses" switch, in any environment);
 * - lib/fetch/transport.ts exports only the two real network steps and their types: no setter, no mutable export;
 * - the guarded fetcher's options have no resolver, connector, agent, lookup or address list;
 * - no production file but lib/fetch/guarded-fetch.ts imports the transport, and none imports the test transport.
 */
import { describe, expect, it } from "vitest";
import {
  NON_TEST_ROOTS,
  readSourcesBeforeAll,
  sourceFiles,
  sourceText,
} from "../../helpers/source-files";

readSourcesBeforeAll(NON_TEST_ROOTS);

const FETCH_DIR = ["lib/fetch"];

describe("the guarded fetcher has no way in for production code", () => {
  it("lib/fetch reads no environment variable", () => {
    const files = sourceFiles(FETCH_DIR);
    expect(files.map((f) => f.path).sort()).toEqual([
      "lib/fetch/address-policy.ts",
      "lib/fetch/guarded-fetch.ts",
      "lib/fetch/transport.ts",
    ]);
    for (const f of files) expect(f.text, f.path).not.toMatch(/process\.env|import\.meta\.env/);
  });

  it("the transport exports only resolveHost, connectPinned and their types: nothing to set or swap", () => {
    const text = sourceText("lib/fetch/transport.ts");
    const exported = [
      ...text.matchAll(
        /^export\s+(?:async\s+)?(function|const|let|var|class|interface|type)\s+(\w+)/gm,
      ),
    ].map((m) => `${m[1]} ${m[2]}`);
    expect(exported.sort()).toEqual([
      "function connectPinned",
      "function resolveHost",
      "interface PinnedTarget",
      "interface ResolvedAddress",
    ]);
    expect(text).not.toMatch(/^export\s+(let|var)\b/m);
    expect(text).not.toMatch(/^export\s*\{/m);
  });

  it("the guarded fetcher's options carry no resolver, connector, agent or address", () => {
    const text = sourceText("lib/fetch/guarded-fetch.ts");
    const block = /export interface GuardedFetchOptions \{([\s\S]*?)\n\}/.exec(text)?.[1] ?? "";
    const keys = [...block.matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]).sort();
    expect(keys).toEqual([
      "allowHttp",
      "allowedContentTypes",
      "body",
      "headers",
      "headersTimeoutMs",
      "maxBytes",
      "maxRedirects",
      "method",
      "obeyRobots",
      "perHostIntervalMs",
      "redirect",
      "signal",
      "timeoutMs",
    ]);
    expect(text).not.toMatch(/^export\s+(let|var)\b/m);
    expect(text).not.toMatch(/export function set\w*|__set|ForTests?\b/);
  });

  it("only guarded-fetch.ts imports the transport, and no production file imports the test transport", () => {
    const importers = sourceFiles(NON_TEST_ROOTS)
      .filter((f) =>
        /from\s+["'](?:@\/lib\/fetch\/transport|\.\/transport|\.\.\/fetch\/transport)["']/.test(
          f.text,
        ),
      )
      .map((f) => f.path);
    expect(importers).toEqual(["lib/fetch/guarded-fetch.ts"]);
    const testTransport = sourceFiles(NON_TEST_ROOTS)
      .filter((f) => f.text.includes("guarded-fetch-test-transport"))
      .map((f) => f.path);
    expect(testTransport).toEqual([]);
  });
});
