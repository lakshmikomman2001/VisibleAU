/**
 * 13 Nov (part 2): the wizard's readable name from the domain, only where the domain shows the words; a
 * run-together label is asked about, never guessed; and "1 suburb" / "2 suburbs".
 */
import { describe, expect, it } from "vitest";
import { withCompetitorAdded } from "@/lib/brands/competitor-limits";
import {
  domainLabel,
  isRunTogetherDomainName,
  readableNameFromDomain,
} from "@/lib/brands/name-from-domain";
import { pluralise } from "@/lib/format/pluralise";

describe("readableNameFromDomain", () => {
  it.each([
    ["hero-home-services.com.au", "Hero Home Services"],
    ["https://www.smith-and-jones.com.au/contact", "Smith and Jones"],
    ["bondi_plumbing.com.au", "Bondi Plumbing"],
  ])("%s -> %s", (domain, name) => {
    expect(readableNameFromDomain(domain)).toBe(name);
  });

  it.each([
    "herohomeservices.com.au",
    "omega.com.au",
    "",
  ])("%s: no guess (the words don't show, or one word)", (domain) => {
    expect(readableNameFromDomain(domain)).toBeNull();
  });

  it("domainLabel strips the scheme, www and the suffix", () => {
    expect(domainLabel("https://www.HeroHomeServices.com.au/x")).toBe("herohomeservices");
  });
});

describe("isRunTogetherDomainName", () => {
  it("the bare label as the name is asked about", () => {
    expect(isRunTogetherDomainName("herohomeservices", "herohomeservices.com.au")).toBe(true);
    expect(isRunTogetherDomainName("HeroHomeServices", "https://herohomeservices.com.au")).toBe(
      true,
    );
  });

  it.each([
    ["Hero Home Services", "herohomeservices.com.au"],
    ["Omega", "omega.com.au"],
    ["plumbers", "plumbers.com.au"],
    ["herohomeservices", "otherdomain.com.au"],
  ])("%s for %s is not", (name, domain) => {
    expect(isRunTogetherDomainName(name, domain)).toBe(false);
  });
});

describe("pluralise", () => {
  it.each([
    [0, "0 suburbs"],
    [1, "1 suburb"],
    [2, "2 suburbs"],
  ])("%i", (n, text) => {
    expect(pluralise(n, "suburb")).toBe(text);
  });
  it("an irregular plural", () => {
    expect(pluralise(3, "category", "categories")).toBe("3 categories");
  });
});

describe("withCompetitorAdded: the wizard's and Brand settings' one rule", () => {
  it("adds a trimmed name", () => {
    expect(withCompetitorAdded(["Fixit"], "  Acme Plumbing ")).toEqual({
      list: ["Fixit", "Acme Plumbing"],
      error: null,
    });
  });
  it.each([
    [[], "  ", "Enter a competitor's name."],
    [["Acme"], "acme", "acme is already listed."],
    [["A", "B", "C", "D", "E"], "F", "5 competitors at most. Remove one to add another."],
    [[], "x".repeat(101), "A competitor's name is 100 characters at most."],
  ])("%j + %s: %s", (list, input, error) => {
    expect(withCompetitorAdded(list, input)).toEqual({ list, error });
  });
});
