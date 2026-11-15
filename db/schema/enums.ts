import { pgEnum } from "drizzle-orm/pg-core";

export const tierEnum = pgEnum("tier", [
  "free",
  "starter",
  "growth",
  "agency",
  "agency_pro",
  "enterprise",
]);

export const regionEnum = pgEnum("region", ["au", "nz", "uk", "us", "ca", "eu"]);

export const verticalEnum = pgEnum("vertical", [
  "tradies",
  "allied_health",
  "saas",
  "professional_services",
  "real_estate",
  // 16 Nov, part 4 (migration 0151): the wizard's "Other local business" -- a café, a gym, a salon, a shop, an
  // accountant, a law firm... Its questions come from the confirmed business type, like every vertical's.
  "local_business",
]);

export type Tier = (typeof tierEnum.enumValues)[number];
export type Region = (typeof regionEnum.enumValues)[number];
export type Vertical = (typeof verticalEnum.enumValues)[number];
