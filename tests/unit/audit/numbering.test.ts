import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({
  db: { transaction: vi.fn() },
}));

vi.mock("@/db/schema", () => ({
  audits: { organizationId: "organization_id" },
  brands: { id: "id", promptPackVersion: "prompt_pack_version" },
}));

import { getBrandPromptPackVersion, getNextAuditNumber } from "@/lib/audit/numbering";

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

// Vunnara Build 1, Part E.2: every audit row remembers which prompt-
// pack generation it ran, read right before the insert.
describe("getBrandPromptPackVersion", () => {
  it("returns the brand's current promptPackVersion", async () => {
    const mockWhere = vi.fn().mockResolvedValue([{ promptPackVersion: 3 }]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    const version = await getBrandPromptPackVersion("brand-1", { select: mockSelect } as never);
    expect(version).toBe(3);
  });

  it("defaults to 1 when the brand has no promptPackVersion set yet", async () => {
    const mockWhere = vi.fn().mockResolvedValue([{ promptPackVersion: null }]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    const version = await getBrandPromptPackVersion("brand-1", { select: mockSelect } as never);
    expect(version).toBe(1);
  });

  it("defaults to 1 when the brand row isn't found", async () => {
    const mockWhere = vi.fn().mockResolvedValue([]);
    const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
    const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
    const version = await getBrandPromptPackVersion("missing-brand", { select: mockSelect } as never);
    expect(version).toBe(1);
  });
});
