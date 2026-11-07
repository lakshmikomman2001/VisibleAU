/**
 * Team follow-ups (31 Oct), items 6 and 10 -- the role-by-action matrix, readable from client components
 * (lib/governance/permissions.ts has no imports), and what a refusal says.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canPerformAction,
  isOrgRole,
  refusalMessage,
  rolesAllowed,
} from "@/lib/governance/permissions";

describe("what a refusal says", () => {
  it("names the roles that may, with the right article", () => {
    expect(refusalMessage("generate_reports")).toBe(
      "Only an owner, admin or analyst can generate reports.",
    );
    expect(refusalMessage("manage_branding")).toBe(
      "Only an owner or admin can change the report branding.",
    );
    expect(refusalMessage("delete_brand")).toBe("Only an owner can delete a brand.");
  });
});

describe("the matrix", () => {
  it("generate_reports: owner, admin, analyst -- never a viewer", () => {
    expect(rolesAllowed("generate_reports")).toEqual(["owner", "admin", "analyst"]);
    expect(canPerformAction("viewer", "generate_reports")).toBe(false);
  });

  it("a profile's legacy role ('member') isn't a role", () => {
    expect(isOrgRole("member")).toBe(false);
    expect(isOrgRole("analyst")).toBe(true);
  });

  it("has no imports, so a client component can read it", () => {
    const source = readFileSync(join(__dirname, "../../../lib/governance/permissions.ts"), "utf8");
    expect(source).not.toMatch(/^import /m);
  });
});
