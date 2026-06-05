import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({
  db: {
    execute: vi.fn(),
  },
}));

import { GET } from "@/app/api/health/route";
// Must import after vi.mock so the mock is active
import { db } from "@/db/client";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with status ok when DB is reachable", async () => {
    (db.execute as ReturnType<typeof vi.fn>).mockResolvedValue([{ "?column?": 1 }]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.db).toBe("ok");
  });

  it("returns 503 with status degraded when DB query fails", async () => {
    (db.execute as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("connection refused"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.db).toBe("error");
  });

  it("always includes timestamp as an ISO string", async () => {
    (db.execute as ReturnType<typeof vi.fn>).mockResolvedValue([{ "?column?": 1 }]);

    const response = await GET();
    const body = await response.json();

    expect(body).toHaveProperty("timestamp");
    // Verify it's a valid ISO date string
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it("includes timestamp even when DB is down", async () => {
    (db.execute as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("timeout"));

    const response = await GET();
    const body = await response.json();

    expect(body).toHaveProperty("timestamp");
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it("response body has exactly three keys", async () => {
    (db.execute as ReturnType<typeof vi.fn>).mockResolvedValue([{ "?column?": 1 }]);

    const response = await GET();
    const body = await response.json();

    expect(Object.keys(body)).toHaveLength(3);
    expect(Object.keys(body).sort()).toEqual(["db", "status", "timestamp"]);
  });

  it("timestamp is close to current time", async () => {
    (db.execute as ReturnType<typeof vi.fn>).mockResolvedValue([{ "?column?": 1 }]);

    const before = Date.now();
    const response = await GET();
    const body = await response.json();
    const after = Date.now();

    const ts = new Date(body.timestamp).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});
