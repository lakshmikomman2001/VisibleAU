/**
 * Team follow-ups (31 Oct), items 6 and 10 -- the role-by-action matrix, readable from client components
 * (lib/governance/permissions.ts has no imports), and what a refusal says. Sri's decisions (8 Nov): only the
 * owner deletes a brand, and the app says so in those words; integrations, the workspace's email settings
 * and marking its onboarding complete are an owner's or admin's; every description of a role is written
 * from the matrix.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canPerformAction,
  isOrgRole,
  ORG_ROLES,
  refusalMessage,
  roleDescription,
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
  });

  it("an owner-only action says 'the owner', in Sri's words", () => {
    expect(refusalMessage("delete_brand")).toBe("Only the owner can delete a brand.");
    expect(refusalMessage("manage_billing")).toBe("Only the owner can manage billing.");
  });
});

describe("the matrix", () => {
  it("generate_reports: owner, admin, analyst -- never a viewer", () => {
    expect(rolesAllowed("generate_reports")).toEqual(["owner", "admin", "analyst"]);
    expect(canPerformAction("viewer", "generate_reports")).toBe(false);
  });

  it("Sri, 8 Nov: integrations, email settings and onboarding are an owner's or admin's", () => {
    expect(rolesAllowed("manage_integrations")).toEqual(["owner", "admin"]);
    expect(rolesAllowed("manage_notifications")).toEqual(["owner", "admin"]);
    expect(rolesAllowed("complete_onboarding")).toEqual(["owner", "admin"]);
    expect(rolesAllowed("delete_brand")).toEqual(["owner"]);
    expect(rolesAllowed("manage_brands")).toEqual(["owner", "admin"]);
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

describe("a role's description: written from the matrix", () => {
  it("a viewer changes nothing", () => {
    expect(roleDescription("viewer")).toBe("Can view reports. Can't change anything.");
  });

  it("each other role is the one below it plus what the matrix gives it alone", () => {
    expect(roleDescription("analyst")).toMatch(/^Everything a viewer can, and: run audits, /);
    expect(roleDescription("admin")).toMatch(/^Everything an analyst can, and: /);
    expect(roleDescription("owner")).toBe(
      "Everything an admin can, and: delete a brand, manage billing and make someone an owner.",
    );
  });

  it("only the owner's mentions deleting a brand; nobody else's says they can", () => {
    for (const role of ORG_ROLES) {
      expect(roleDescription(role).includes("delete"), role).toBe(role === "owner");
    }
  });

  it("names every action a role may do that the role below it may not", () => {
    expect(roleDescription("admin")).toContain("change integrations");
    expect(roleDescription("analyst")).not.toContain("change integrations");
    expect(roleDescription("admin")).toContain("change the workspace's email settings");
    expect(roleDescription("admin")).toContain("add a brand or change its settings");
  });
});
