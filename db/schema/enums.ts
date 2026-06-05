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
]);

export type Tier = (typeof tierEnum.enumValues)[number];
export type Region = (typeof regionEnum.enumValues)[number];
export type Vertical = (typeof verticalEnum.enumValues)[number];
