/**
 * S00B part 3, webhooks on the guarded fetcher: a delivery (lib/webhooks/deliver.ts, inventory F11, run by
 * deliver-webhook) and the settings page's test delivery (POST /api/webhooks-config/[id]/test, F12). Both POST to the
 * workspace's endpoint URL, which was only checked to be a URL: any host, any port.
 *
 * Parity: to recorded receivers, both answer as on the parent commit (golden written there with UPDATE_GOLDEN=1):
 * a 2xx, a 5xx, a 410, a redirect, an unknown host. Refusal: an endpoint on an internal address and port, or a
 * receiver that redirects there, is never sent to; the delivery fails as an unreachable endpoint does, and the
 * test delivery answers "Connection failed". Before S00B the internal server received the signed payload.
 */
import { resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { type Fixture, fixtureFetch, golden } from "../../helpers/fetch-fixtures";
import { startInternalServer } from "../../helpers/fixture-sites";

const endpointRow = vi.hoisted(() => ({
  current: {
    id: "endpoint-1",
    organizationId: "org-1",
    url: "https://hooks.fixture-receiver.com/ok",
    channel: "custom",
    signingSecret: "whsec_test",
    isActive: true,
  },
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1", organizationId: "org-1" })),
}));
vi.mock("@/lib/pricing/plan-features", () => ({ planFeatureRefusal: vi.fn(async () => null) }));
vi.mock("@/lib/governance", () => ({ roleRefusal: vi.fn(async () => null) }));
vi.mock("@/db/client", () => ({
  withRlsContext: vi.fn(async (_org: string, fn: (tx: unknown) => unknown) =>
    fn({ select: () => ({ from: () => ({ where: async () => [endpointRow.current] }) }) }),
  ),
}));

const { deliver } = await import("@/lib/webhooks/deliver");
const { POST: testDelivery } = await import("@/app/api/webhooks-config/[id]/test/route");

const realFetch = globalThis.fetch.bind(globalThis);
const GOLDEN = resolve(__dirname, "__golden__/webhooks.json");

const RECEIVERS: Record<string, Fixture> = {
  "https://hooks.fixture-receiver.com/ok": {
    headers: { "content-type": "text/plain" },
    body: "received",
  },
  "https://hooks.fixture-receiver.com/fail": { status: 500, body: "broken" },
  "https://hooks.fixture-receiver.com/gone": { status: 410, body: "" },
  "https://hooks.fixture-receiver.com/moved": { redirect: 301, location: "/landed" },
  "https://hooks.fixture-receiver.com/landed": { body: "landed" },
};

let internal: Awaited<ReturnType<typeof startInternalServer>>;

beforeAll(async () => {
  internal = await startInternalServer();
});

afterAll(async () => {
  await internal.close();
});

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

async function delivered(url: string): Promise<unknown> {
  try {
    return { result: await deliver(url, { hello: "world" }, "abc123", "audit.completed") };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function tested(url: string): Promise<unknown> {
  endpointRow.current = { ...endpointRow.current, url };
  const res = await testDelivery(
    new Request("http://localhost/api/webhooks-config/endpoint-1/test", { method: "POST" }),
    {
      params: Promise.resolve({ id: "endpoint-1" }),
    },
  );
  return { status: res.status, body: await res.json() };
}

describe("parity: deliveries to recorded receivers answer as on the parent commit", () => {
  it("a delivery and a test delivery to each receiver", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(fixtureFetch(RECEIVERS));
    const outputs: Record<string, unknown> = {};
    for (const url of [...Object.keys(RECEIVERS), "https://nowhere.fixture-unknown.com/hook"]) {
      outputs[`deliver ${url}`] = await delivered(url);
      outputs[`test ${url}`] = await tested(url);
    }
    const { expected, actual } = golden(GOLDEN, outputs);
    expect(actual).toBe(expected);
  });
});

describe("refusal: nothing is sent to an internal address", () => {
  it("an endpoint on an internal address and port: the delivery fails, the test says Connection failed", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      fixtureFetch(RECEIVERS, { passThrough: realFetch }),
    );
    const url = `http://127.0.0.1:${internal.port}/hook`;
    expect(await delivered(url)).toMatchObject({ error: expect.stringContaining("blocked_port") });
    expect(await tested(url)).toEqual({
      status: 502,
      body: { status: 0, ok: false, error: "Connection failed" },
    });
    expect(internal.hits).toEqual([]);
  });

  it("a receiver that redirects to an internal address (307 keeps the POST): refused at the redirect", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      fixtureFetch(
        {
          ...RECEIVERS,
          "https://hooks.fixture-receiver.com/bounce": {
            redirect: 307,
            location: `http://127.0.0.1:${internal.port}/hook`,
          },
        },
        { passThrough: realFetch },
      ),
    );
    expect(await delivered("https://hooks.fixture-receiver.com/bounce")).toHaveProperty("error");
    expect(await tested("https://hooks.fixture-receiver.com/bounce")).toMatchObject({
      status: 502,
    });
    expect(internal.hits).toEqual([]);
  });
});
