import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({
  db: { transaction: vi.fn() },
}));

vi.mock("@/db/schema", () => ({
  audits: { organizationId: "organization_id" },
}));

import { getNextAuditNumber } from "@/lib/audit/numbering";

describe("getNextAuditNumber", () => {
  it("returns 1 when no audits exist", async () => {
    const mockWhere = vi.fn().mockResolvedValue([{ max: 0 }]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    const num = await getNextAuditNumber("org-1", { select: mockSelect } as never);
    expect(num).toBe(1);
  });

  it("returns max+1 when audits exist", async () => {
    const mockWhere = vi.fn().mockResolvedValue([{ max: 5 }]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    const num = await getNextAuditNumber("org-1", { select: mockSelect } as never);
    expect(num).toBe(6);
  });
});
