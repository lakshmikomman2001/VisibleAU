import { describe, expect, it, vi } from "vitest";

vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: vi.fn().mockReturnValue({
    execute: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings,
      values,
    }),
  };
});

describe("setRlsContext", () => {
  it("calls db.execute with set_config SQL for org id", async () => {
    const mockExecute = vi.fn().mockResolvedValue(undefined);
    const fakeDb = { execute: mockExecute } as never;

    const { setRlsContext } = await import("@/db/client");
    await setRlsContext(fakeDb, "org-uuid-123");

    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("passes orgId as a parameterized value (not raw SQL)", async () => {
    const mockExecute = vi.fn().mockResolvedValue(undefined);
    const fakeDb = { execute: mockExecute } as never;

    const { setRlsContext } = await import("@/db/client");
    await setRlsContext(fakeDb, "test-org-id");

    const sqlArg = mockExecute.mock.calls[0][0];
    expect(sqlArg.values).toContain("test-org-id");
  });
});
