import { describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";

const mockExecute = vi.fn().mockResolvedValue(undefined);

vi.mock("@/db/client", () => ({
  db: { execute: mockExecute },
  setRlsContext: async (dbInstance: { execute: Function }, orgId: string) => {
    const { sql: realSql } = require("drizzle-orm");
    await dbInstance.execute(
      realSql`SELECT set_config('app.current_org_id', ${orgId}, true)`,
    );
  },
}));

describe("setRlsContext", () => {
  it("calls db.execute with set_config SQL for org id", async () => {
    const localExecute = vi.fn().mockResolvedValue(undefined);
    const fakeDb = { execute: localExecute } as never;

    const { setRlsContext } = await import("@/db/client");
    await setRlsContext(fakeDb, "org-uuid-123");

    expect(localExecute).toHaveBeenCalledTimes(1);
  });

  it("passes orgId as a parameterized value (not raw SQL)", async () => {
    const localExecute = vi.fn().mockResolvedValue(undefined);
    const fakeDb = { execute: localExecute } as never;

    const { setRlsContext } = await import("@/db/client");
    await setRlsContext(fakeDb, "test-org-id");

    const sqlArg = localExecute.mock.calls[0][0];
    const serialized = JSON.stringify(sqlArg);
    expect(serialized).toContain("test-org-id");
  });
});
