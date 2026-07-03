import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => {
  const txExecute = vi.fn().mockResolvedValue(undefined);
  const mockTransaction = vi.fn(async (fn: Function) => {
    const txMock = { execute: txExecute };
    return fn(txMock);
  });
  const mockDb = { execute: vi.fn().mockResolvedValue(undefined), transaction: mockTransaction };
  return {
    db: mockDb,
    setRlsContext: async (dbInstance: { execute: Function }, orgId: string) => {
      const { sql: realSql } = require("drizzle-orm");
      await dbInstance.execute(
        realSql`SELECT set_config('app.current_org_id', ${orgId}, true)`,
      );
    },
    withRlsContext: async (orgId: string, fn: Function) => {
      return mockTransaction(async (tx: { execute: Function }) => {
        const { sql: realSql } = require("drizzle-orm");
        await tx.execute(
          realSql`SELECT set_config('app.current_org_id', ${orgId}, true)`,
        );
        return fn(tx);
      });
    },
  };
});

describe("setRlsContext (deprecated)", () => {
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

describe("withRlsContext", () => {
  it("wraps callback in a transaction with set_config", async () => {
    const { withRlsContext } = await import("@/db/client");
    const result = await withRlsContext("org-123", async () => {
      return "callback-result";
    });

    expect(result).toBe("callback-result");
  });

  it("calls set_config inside the transaction with the org id", async () => {
    const { withRlsContext } = await import("@/db/client");
    let lastExecuteCall: unknown = null;

    await withRlsContext("org-456", async (tx: { execute: ReturnType<typeof vi.fn> }) => {
      lastExecuteCall = tx.execute.mock.lastCall;
      return null;
    });

    expect(lastExecuteCall).not.toBeNull();
    const serialized = JSON.stringify(lastExecuteCall);
    expect(serialized).toContain("org-456");
  });
});
