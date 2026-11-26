/**
 * S00 part 3 (22 Nov; LLD 8.8.1, T3): acronyms, articles and spaces in questions. NumbaTek IT's audit #52 asked
 * "Best managed it services in …?" and "Is NumbaTek IT a good choice for a managed it services in …?": the
 * classifier's words are stored lower case, so IT lost its capitals, and "a" went before a plural.
 *
 * - toServicePhrase restores the listed acronyms; withArticle puts "a"/"an" by sound and none before a plural or
 *   uncountable service;
 * - validateGeneratedQuestion now also refuses a lower-case acronym and "a/an + plural" (doubled spaces it already
 *   refused), looking past the brand, its competitors and the place;
 * - every question the existing templates write still passes (no question an audit asks today is dropped).
 *
 * The audit #52 question texts aren't stored in the repo (production data); the regression below rebuilds NumbaTek
 * IT's pack the way #52's was built (the general local type, the classifier's service words "managed it services")
 * and checks the two texts T3 quotes.
 */
import { describe, expect, it } from "vitest";
import { AU_ALLIED_HEALTH_PROMPTS } from "@/db/seed/verticals/au-allied-health";
import { AU_SAAS_PROMPTS } from "@/db/seed/verticals/au-saas";
import { AU_TRADIES_PROMPTS } from "@/db/seed/verticals/au-tradies";
import { buildPromptPack, serviceWordFor } from "@/lib/prompts/build-prompt-pack";
import {
  ACRONYMS,
  articleBeforePluralProblem,
  lowerCaseAcronymProblem,
  toServicePhrase,
  withArticle,
} from "@/lib/prompts/phrasing";
import {
  CATEGORY_KEYS,
  CATEGORY_LABELS,
  CATEGORY_SERVICE_PHRASE,
  CATEGORY_TEMPLATES,
  SERVICE_WORD_FALLBACK,
} from "@/lib/prompts/templates";
import { validateGeneratedQuestion } from "@/lib/prompts/validate-question";
import type { BrandClassification } from "@/lib/types/brand";
import { expandPrompt, formatCompetitors, formatLocation } from "@/lib/verticals/expand-prompt";

describe("toServicePhrase: the listed acronyms in their own casing", () => {
  it('"managed it services" -> "managed IT services"', () => {
    expect(toServicePhrase("managed it services")).toBe("managed IT services");
    expect(toServicePhrase("it support")).toBe("IT support");
  });

  it("HVAC, NDIS, CCTV, SEO and the rest of the list", () => {
    expect(toServicePhrase("hvac repairs")).toBe("HVAC repairs");
    expect(toServicePhrase("ndis provider")).toBe("NDIS provider");
    expect(toServicePhrase("cctv installer")).toBe("CCTV installer");
    expect(toServicePhrase("seo agency")).toBe("SEO agency");
    expect(toServicePhrase("voip phone systems")).toBe("VoIP phone systems");
    expect(toServicePhrase("wi-fi installer")).toBe("Wi-Fi installer");
    expect(toServicePhrase("saas platform")).toBe("SaaS platform");
    for (const acronym of ACRONYMS)
      expect(toServicePhrase(`${acronym.toLowerCase()} specialist`)).toBe(`${acronym} specialist`);
  });

  it("leaves everything else as it was: no acronym inside a word, no other word changed", () => {
    expect(toServicePhrase("dog groomer")).toBe("dog groomer");
    expect(toServicePhrase("kitchen fitout")).toBe("kitchen fitout");
    expect(toServicePhrase("bathroom renovations")).toBe("bathroom renovations");
    expect(toServicePhrase("acupuncture")).toBe("acupuncture");
    expect(toServicePhrase("gift shop")).toBe("gift shop");
  });
});

describe("withArticle: by sound, and never before a plural or uncountable service", () => {
  it("no article before a plural: 'a good choice for managed IT services'", () => {
    expect(withArticle("managed IT services")).toBe("managed IT services");
    expect(withArticle("HVAC repairs")).toBe("HVAC repairs");
    expect(withArticle("VoIP phone systems")).toBe("VoIP phone systems");
  });

  it("no article before an uncountable service", () => {
    expect(withArticle("dog grooming")).toBe("dog grooming");
    expect(withArticle("IT support")).toBe("IT support");
    expect(withArticle("pest control")).toBe("pest control");
  });

  it("'an' by the letter's sound for spelled acronyms, 'a' for the ones said as a word", () => {
    expect(withArticle("IT consultant")).toBe("an IT consultant");
    expect(withArticle("SEO agency")).toBe("an SEO agency");
    expect(withArticle("NDIS provider")).toBe("an NDIS provider");
    expect(withArticle("HVAC technician")).toBe("an HVAC technician");
    expect(withArticle("MRI clinic")).toBe("an MRI clinic");
    expect(withArticle("CCTV installer")).toBe("a CCTV installer");
    expect(withArticle("GP clinic")).toBe("a GP clinic");
    expect(withArticle("SaaS platform")).toBe("a SaaS platform");
    expect(withArticle("VoIP provider")).toBe("a VoIP provider");
    expect(withArticle("Wi-Fi installer")).toBe("a Wi-Fi installer");
  });

  it("ordinary singular services as before ('a dog groomer', 'an accountant', 'a café')", () => {
    expect(withArticle("dog groomer")).toBe("a dog groomer");
    expect(withArticle("accountant")).toBe("an accountant");
    expect(withArticle("café")).toBe("a café");
    expect(withArticle("bike shop")).toBe("a bike shop");
  });
});

describe("validateGeneratedQuestion: lower-case acronyms, a/an + plural, doubled spaces", () => {
  const region = "Riverstone, NSW";

  it("refuses a lower-case acronym from the list", () => {
    expect(validateGeneratedQuestion("Best managed it services in Riverstone?", region)).toEqual({
      valid: false,
      reason: 'acronym in lower case ("managed it")',
    });
    expect(validateGeneratedQuestion("Best seo agency in Riverstone?", region).valid).toBe(false);
    expect(
      validateGeneratedQuestion("Seo agency in Riverstone with good reviews?", region).valid,
    ).toBe(false);
    expect(validateGeneratedQuestion("Who fixes hvac systems in Riverstone?", region).valid).toBe(
      false,
    );
    expect(validateGeneratedQuestion("Trusted ndis provider in Riverstone?", region).valid).toBe(
      false,
    );
    expect(validateGeneratedQuestion("Best cctv installer in Riverstone?", region).valid).toBe(
      false,
    );
  });

  it('refuses "a"/"an" before a plural', () => {
    expect(
      validateGeneratedQuestion(
        "Is NumbaTek IT a good choice for a managed IT services in Riverstone?",
        region,
        true,
        ["NumbaTek IT"],
      ),
    ).toEqual({ valid: false, reason: '"a"/"an" before a plural ("a managed IT services")' });
  });

  it("still refuses doubled spaces, with that reason first", () => {
    expect(validateGeneratedQuestion("Best  managed it services in Riverstone?", region)).toEqual({
      valid: false,
      reason: "doubled whitespace",
    });
  });

  it("passes the corrected questions", () => {
    expect(validateGeneratedQuestion("Best managed IT services in Riverstone?", region).valid).toBe(
      true,
    );
    expect(
      validateGeneratedQuestion(
        "Is NumbaTek IT a good choice for managed IT services in Riverstone?",
        region,
        true,
        ["NumbaTek IT"],
      ).valid,
    ).toBe(true);
  });

  it("never mistakes the pronoun, a quantity, or a singular for the problems", () => {
    for (const q of [
      "Is it worth it for small businesses in Riverstone?",
      "Does it support invoicing in Riverstone?",
      "Where can I get a few quotes in Riverstone?",
      "Plumber in Riverstone for a blocked drain, who do locals recommend?",
      "Best plumber in Riverstone for a leaking tap or toilet?",
      "Is a business account worth it in Riverstone?",
      "Best IT support in Riverstone?",
    ])
      expect(validateGeneratedQuestion(q, region), q).toEqual({ valid: true });
  });

  it("looks past the brand, its competitors and the place: a business called 'Seo Plumbing' is a name", () => {
    expect(
      validateGeneratedQuestion("Is Seo Plumbing the best plumber in Riverstone?", region, true, [
        "Seo Plumbing",
      ]).valid,
    ).toBe(true);
    expect(validateGeneratedQuestion("Best plumber in Bas Hill?", "Bas Hill, NSW").valid).toBe(
      true,
    );
  });
});

/** Every template rendered the way the app renders it (lib/prompts/build-prompt-pack.ts, expand-prompt.ts). */
function everyRenderedTemplate(): string[] {
  const out: string[] = [];
  const region = "Norwest, NSW";
  for (const [category, buckets] of Object.entries(CATEGORY_TEMPLATES)) {
    const label = CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] ?? category;
    const service =
      SERVICE_WORD_FALLBACK[category as keyof typeof SERVICE_WORD_FALLBACK] ?? "dog groomer";
    for (const list of Object.values(buckets ?? {}))
      for (const template of list ?? [])
        out.push(
          template
            .replace(/\{region\}/g, region)
            .replace(/\{category\}/g, label)
            .replace(/\{service\}/g, service),
        );
  }
  const ctx = {
    brand: { name: "Yabby Services", domain: "yabby-services.com.au" },
    competitors: ["Wren Home Services", "Norwest Plumbing Co"],
    locations: ["NSW:Norwest", "NSW:Bondi"],
  };
  for (const pack of [AU_TRADIES_PROMPTS, AU_ALLIED_HEALTH_PROMPTS, AU_SAAS_PROMPTS])
    for (const p of pack) {
      const template = p.promptTemplate;
      out.push(
        ...(template.includes("{location}")
          ? ctx.locations.map((l) => template.replace(/\{location\}/g, l.split(":")[1]))
          : [template]
        ).map((t) =>
          t
            .replace(/\{brand\}/g, ctx.brand.name)
            .replace(/\{domain\}/g, ctx.brand.domain)
            .replace(/\{competitors\}/g, ctx.competitors.join(", ")),
        ),
      );
    }
  for (const phrase of Object.values(CATEGORY_SERVICE_PHRASE))
    out.push(`Is Yabby Services a good choice for ${phrase} in Norwest, NSW?`);
  return out;
}

describe("no question the existing templates write is refused by the new checks (N1)", () => {
  it("every category template, vertical-pack template and service phrase passes both new checks", () => {
    const texts = everyRenderedTemplate();
    expect(texts.length).toBeGreaterThan(500);
    // As validateGeneratedQuestion does: the names in a question (brand, competitors, place) are data, not words.
    const refused = texts
      .map((t) =>
        t.replace(/Yabby Services|Wren Home Services|Norwest Plumbing Co|Norwest|Bondi/g, "Name"),
      )
      .map((t) => ({
        t,
        acronym: lowerCaseAcronymProblem(t),
        plural: articleBeforePluralProblem(t),
      }))
      .filter((r) => r.acronym || r.plural);
    expect(refused).toEqual([]);
  });

  it("toServicePhrase changes no category's own words (every label and service phrase is already right)", () => {
    for (const key of CATEGORY_KEYS) {
      expect(toServicePhrase(CATEGORY_LABELS[key])).toBe(CATEGORY_LABELS[key]);
      expect(toServicePhrase(CATEGORY_SERVICE_PHRASE[key])).toBe(CATEGORY_SERVICE_PHRASE[key]);
    }
  });

  it("the vertical packs (asked live for brands without their own pack): no question is dropped for a new reason", () => {
    const brand = { name: "Yabby Services", domain: "yabby-services.com.au" };
    const competitors = ["Wren Home Services", "Norwest Plumbing Co"];
    const newReason = /^(acronym in lower case|"a"\/"an" before a plural)/;
    const droppedForNewReason: string[] = [];
    let checked = 0;
    for (const pack of [AU_TRADIES_PROMPTS, AU_ALLIED_HEALTH_PROMPTS, AU_SAAS_PROMPTS])
      for (const p of pack) {
        if (!p.promptTemplate.includes("{location}")) continue;
        for (const raw of ["NSW:Norwest", "NSW:Bondi", "VIC:Box Hill"]) {
          const loc = formatLocation(raw);
          const text = p.promptTemplate
            .replace(/\{brand\}/g, brand.name)
            .replace(/\{domain\}/g, brand.domain)
            .replace(/\{location\}/g, loc)
            .replace(/\{competitors\}/g, formatCompetitors(competitors));
          const result = validateGeneratedQuestion(text, loc, true, [brand.name, ...competitors]);
          checked++;
          if (!result.valid && newReason.test(result.reason ?? "")) droppedForNewReason.push(text);
        }
      }
    expect(checked).toBeGreaterThan(300);
    expect(droppedForNewReason).toEqual([]);
    // And expandPrompt itself still writes every one it wrote before for these templates.
    const ctx = { brand, competitors, locations: ["NSW:Norwest"] };
    expect(
      AU_TRADIES_PROMPTS.flatMap((p) => expandPrompt(p.promptTemplate, ctx)).length,
    ).toBeGreaterThan(20);
  });
});

describe("NumbaTek IT's audit #52, rebuilt the way it was built", () => {
  const classification: BrandClassification = {
    category: "general",
    buyerType: "smb",
    audience: "businesses",
    intentSignals: [],
    competitors: [],
    auRelevance: "au_founded",
    confidence: 0.82,
    service: "managed it services",
  };
  const region = "Riverstone, NSW";
  const pack = buildPromptPack(
    classification,
    "NumbaTek IT",
    "numbatekit.com.au",
    { competitors: [], categories: ["general"], audience: "businesses" },
    region,
    10,
    "numbatek-it-brand-id",
  );

  it("the two texts T3 quotes would be refused now", () => {
    expect(validateGeneratedQuestion("Best managed it services in Riverstone?", region).valid).toBe(
      false,
    );
    expect(
      validateGeneratedQuestion(
        "Is NumbaTek IT a good choice for a managed it services in Riverstone?",
        region,
        true,
        ["NumbaTek IT"],
      ).valid,
    ).toBe(false);
  });

  it("its service words come out as 'managed IT services'", () => {
    expect(serviceWordFor("general", classification, region)).toBe("managed IT services");
  });

  it("'a good choice for managed IT services', and no question writes 'managed it' or 'a managed'", () => {
    expect(pack).toContain(
      "Is NumbaTek IT a good choice for managed IT services in Riverstone, NSW?",
    );
    expect(pack.length).toBeGreaterThan(3);
    for (const q of pack) {
      expect(q).not.toMatch(/managed it\b/);
      expect(q).not.toMatch(/\ban? managed IT services\b/);
      expect(q).not.toMatch(/\s{2,}/);
    }
  });

  it("its everyday questions name the service as 'managed IT services'", () => {
    const everyday = pack.filter((q) => !q.includes("NumbaTek IT"));
    expect(everyday.length).toBeGreaterThan(0);
    expect(everyday.some((q) => q.includes("managed IT services"))).toBe(true);
  });

  it("a stray space around the brand's name never reaches a question", () => {
    const spaced = buildPromptPack(
      classification,
      " NumbaTek IT ",
      "numbatekit.com.au",
      { competitors: ["Acme MSP"], categories: ["general"], audience: "businesses" },
      region,
      10,
      "numbatek-it-brand-id",
    );
    for (const q of spaced) {
      expect(q).not.toMatch(/\s{2,}/);
      expect(q).not.toMatch(/^\s|\s$| \?/);
    }
    expect(spaced).toContain(
      "NumbaTek IT vs Acme MSP — which is better for Australian businesses?",
    );
  });
});
