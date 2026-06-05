import { afterAll, beforeEach } from "vitest";
import { db } from "@/db/client";
import { brands, organizations, users } from "@/db/schema";

beforeEach(async () => {
  try {
    // App tables — FK-safe delete order (brands → users → organizations)
    await db.delete(brands);
    await db.delete(users);
    await db.delete(organizations);
  } catch {
    // Tables may not exist in all test environments — skip silently
  }
});

afterAll(async () => {
  // postgres-js pool closes automatically in test env
});
