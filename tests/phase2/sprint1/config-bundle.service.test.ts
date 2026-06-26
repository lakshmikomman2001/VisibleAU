import { beforeEach, describe, expect, it, vi } from "vitest";

const mockWhere = vi.fn();
const mockTxUpdate = vi.fn();
const mockTxSet = vi.fn();

vi.mock("@/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: mockWhere,
      }),
    }),
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    }),
    transaction: vi.fn(async (fn: Function) => {
      const tx = {
        update: () => ({
          set: () => ({
            where: mockTxSet.mockResolvedValue(undefined),
          }),
        }),
      };
      return fn(tx);
    }),
  },
}));

vi.mock("@/db/schema/config-bundle-cache", () => ({
  configBundleCache: {
    id: "id",
    marketCode: "market_code",
    locale: "locale",
    segment: "segment",
    isActive: "is_active",
    bundleVersion: "bundle_version",
  },
}));

vi.mock("@/lib/platform/observability.service", () => ({
  ObservabilityService: { emit: vi.fn() },
}));

import { ConfigBundleService } from "@/lib/platform/config-bundle.service";

describe("ConfigBundleService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("resolve", () => {
    it("returns the active bundle for a market/locale/segment tuple", async () => {
      const activeBundle = {
        id: "b1",
        marketCode: "AU_EN",
        locale: "en-AU",
        segment: "smb",
        bundleVersion: 1,
        configDigest: "abc123",
        resolvedConfig: { version: 1 },
        isActive: true,
        createdAt: new Date(),
      };
      mockWhere.mockResolvedValueOnce([activeBundle]);

      const result = await ConfigBundleService.resolve("AU_EN", "en-AU", "smb");
      expect(result).toEqual(activeBundle);
    });
  });

  describe("activate", () => {
    it("uses a transaction to ensure only one active bundle per tuple", async () => {
      const bundle = {
        id: "b2",
        marketCode: "AU_EN",
        locale: "en-AU",
        segment: "smb",
        bundleVersion: 2,
      };
      mockWhere.mockResolvedValueOnce([bundle]);

      await ConfigBundleService.activate("b2");

      // Transaction should have been called (deactivate others + activate new)
      const { db } = await import("@/db/client");
      expect(db.transaction).toHaveBeenCalledTimes(1);
    });

    it("throws if bundle not found", async () => {
      mockWhere.mockResolvedValueOnce([]);
      await expect(ConfigBundleService.activate("nonexistent")).rejects.toThrow(
        "Bundle nonexistent not found",
      );
    });
  });

  describe("computeDigest", () => {
    it("produces a stable hash for the same config", () => {
      const config = { market: "AU_EN", version: 1 };
      const d1 = ConfigBundleService.computeDigest(config);
      const d2 = ConfigBundleService.computeDigest(config);
      expect(d1).toBe(d2);
      expect(d1).toHaveLength(64); // sha256 hex
    });

    it("produces different hashes for different configs", () => {
      const d1 = ConfigBundleService.computeDigest({ a: 1 });
      const d2 = ConfigBundleService.computeDigest({ a: 2 });
      expect(d1).not.toBe(d2);
    });
  });
});
