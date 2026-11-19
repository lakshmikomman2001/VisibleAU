/**
 * 20 Nov (Sri's decision, part 5): an uploaded server log never travels through Inngest. The route stores the file in
 * the private "crawler-logs" bucket, under a folder built from the signed-in workspace and its brand, and sends an event
 * with only a reference (workspace, brand, path, size, SHA-256). The function reads it, keeps the AI crawlers' visits
 * only, and deletes the raw file -- after success, and after the last failed retry. A path for another workspace is
 * refused before anything is read or deleted.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "22222222-2222-4222-8222-222222222222";
const BRAND = "33333333-3333-4333-8333-333333333333";

const state = vi.hoisted(() => ({
  files: new Map<string, Buffer>(),
  downloads: [] as string[],
  deletes: [] as string[],
  events: [] as Array<{ name: string; data: Record<string, unknown> }>,
  inserted: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/storage", () => ({
  getStorage: () => ({
    upload: async (path: string, buffer: Buffer) => {
      state.files.set(path, buffer);
    },
    download: async (path: string) => {
      state.downloads.push(path);
      return state.files.get(path) ?? null;
    },
    delete: async (paths: string[]) => {
      for (const p of paths) {
        state.deletes.push(p);
        state.files.delete(p);
      }
    },
    getDownloadUrl: async () => "",
    list: async () => ({ files: [], folders: [] }),
  }),
}));
vi.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: async (event: { name: string; data: Record<string, unknown> }) => {
      state.events.push(event);
    },
    createFunction: (config: unknown, handler: unknown) => ({ config, handler }),
  },
}));
vi.mock("@/db/client", () => ({
  serviceDb: {
    insert: () => ({
      values: (row: Record<string, unknown>) => ({
        onConflictDoNothing: async () => {
          state.inserted.push(row);
        },
      }),
    }),
  },
  withRlsContext: async (_org: string, fn: (tx: unknown) => unknown) =>
    fn({
      select: () => ({
        from: () => ({
          where: async () => [{ id: BRAND, organizationId: ORG, domain: "acme.com.au" }],
        }),
      }),
    }),
}));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: async () => ({ id: "user-1", organizationId: ORG }),
}));
vi.mock("@/lib/governance", () => ({
  assertBrandAccess: async () => {},
  assertTier: async () => {},
  brandAccessErrorResponse: () => null,
  roleRefusal: async () => null,
  TierInsufficientError: class extends Error {},
  tierRefusal: () => null,
}));
vi.mock("@/lib/agent-analytics/bot-registry", () => ({
  lookupByUserAgent: async (ua: string) =>
    ua.includes("GPTBot")
      ? {
          uaToken: "GPTBot",
          vendor: "openai",
          crawlerTier: "must_allow",
          defaultPurpose: "training",
          isAgentUa: false,
          aiPlatform: "chatgpt",
          verificationPaths: [],
          cidrSourceUrl: null,
          ptrDomainSuffix: null,
          expectedAsns: null,
        }
      : null,
}));

import { POST } from "@/app/api/brands/[brandId]/crawler-logs/upload/route";
import {
  deleteCrawlerLogAfterFailure,
  handleCrawlerLogUpload,
} from "@/inngest/functions/parse-crawler-log";
import type { CrawlerLogUploadedEvent } from "@/lib/agent-analytics/log-upload-storage";

const HUMAN_IP = "203.0.113.9";
const LOG = [
  `${HUMAN_IP} - - [20/Nov/2026:08:00:00 +0000] "GET /pricing HTTP/1.1" 200 5120 "-" "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0"`,
  `20.171.207.1 - - [20/Nov/2026:08:00:05 +0000] "GET /services HTTP/1.1" 200 3200 "-" "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot"`,
].join("\n");

/** Inngest hands a step's result back as JSON: so do we. */
const step = {
  run: async <T>(_id: string, fn: () => Promise<T> | T): Promise<T> => {
    const value = await fn();
    return (value === undefined ? undefined : JSON.parse(JSON.stringify(value))) as T;
  },
};

async function upload(): Promise<Response> {
  const form = new FormData();
  form.append("file", new File([LOG], "access.log", { type: "text/plain" }));
  return POST(
    new Request(`http://localhost/api/brands/${BRAND}/crawler-logs/upload`, {
      method: "POST",
      body: form,
    }),
    { params: Promise.resolve({ brandId: BRAND }) },
  );
}

beforeEach(() => {
  state.files.clear();
  state.downloads = [];
  state.deletes = [];
  state.events = [];
  state.inserted = [];
});

describe("the upload route", () => {
  it("stores the file under the workspace's and brand's folder, and the event carries only a reference", async () => {
    const res = await upload();
    expect(res.status).toBe(202);
    const [path] = [...state.files.keys()];
    expect(path).toMatch(new RegExp(`^${ORG}/crawler-logs/${BRAND}/[0-9a-f-]{36}\\.log$`));
    expect(state.events).toHaveLength(1);
    const event = state.events[0];
    expect(event.name).toBe("crawler-log/uploaded");
    expect(Object.keys(event.data).sort()).toEqual(
      [
        "brandId",
        "domain",
        "filename",
        "organizationId",
        "sha256",
        "sizeBytes",
        "storagePath",
        "uploadedBy",
      ].sort(),
    );
    expect(event.data.storagePath).toBe(path);
    expect(event.data.sizeBytes).toBe(Buffer.byteLength(LOG));
    expect(event.data.sha256).toMatch(/^[0-9a-f]{64}$/);
    // Not a line of the log, nor its content in any encoding.
    const payload = JSON.stringify(event);
    expect(payload).not.toContain(HUMAN_IP);
    expect(payload).not.toContain("GET /pricing");
    expect(payload).not.toContain("GPTBot/1.2");
    expect(payload).not.toContain(Buffer.from(LOG).toString("base64").slice(0, 40));
    expect(payload).not.toContain("contentBase64");
  });
});

describe("the function", () => {
  async function stored(): Promise<CrawlerLogUploadedEvent> {
    await upload();
    return state.events[0].data as unknown as CrawlerLogUploadedEvent;
  }

  it("keeps the AI crawler's visit only, and deletes the raw file once it's parsed", async () => {
    const data = await stored();
    const result = await handleCrawlerLogUpload({ event: { data }, step });
    expect(result).toMatchObject({ status: "processed", hitsIngested: 1, discardedHuman: 1 });
    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0]).toMatchObject({ crawlerName: "GPTBot", organizationId: ORG });
    expect(state.inserted[0].visitedAt).toBeInstanceOf(Date);
    expect(JSON.stringify(state.inserted)).not.toContain(HUMAN_IP);
    expect(state.deletes).toEqual([data.storagePath]);
    expect(state.files.size).toBe(0);
  });

  it("after the last failed retry, the raw file is deleted", async () => {
    const data = await stored();
    await deleteCrawlerLogAfterFailure({ event: { data: { event: { data } } } });
    expect(state.deletes).toEqual([data.storagePath]);
    expect(state.files.size).toBe(0);
  });

  it("a path for another workspace is refused: nothing read, nothing deleted", async () => {
    const data = await stored();
    const forged = {
      ...data,
      storagePath: `${OTHER_ORG}/crawler-logs/${BRAND}/00000000-0000-4000-8000-000000000000.log`,
    };
    await expect(handleCrawlerLogUpload({ event: { data: forged }, step })).rejects.toThrow(
      "isn't in this workspace's folder",
    );
    await deleteCrawlerLogAfterFailure({ event: { data: { event: { data: forged } } } });
    const climbing = {
      ...data,
      storagePath: `${ORG}/crawler-logs/${BRAND}/../../${OTHER_ORG}/x.log`,
    };
    await expect(handleCrawlerLogUpload({ event: { data: climbing }, step })).rejects.toThrow();
    expect(state.downloads).toEqual([]);
    expect(state.deletes).toEqual([]);
  });

  it("an upload sent before this change (the file in the event) is still parsed", async () => {
    const legacy = {
      brandId: BRAND,
      organizationId: ORG,
      domain: "acme.com.au",
      filename: "access.log",
      contentBase64: Buffer.from(LOG).toString("base64"),
    };
    const result = await handleCrawlerLogUpload({ event: { data: legacy }, step });
    expect(result).toMatchObject({ status: "processed", hitsIngested: 1 });
    expect(state.deletes).toEqual([]);
  });
});
