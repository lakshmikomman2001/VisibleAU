/**
 * 19 Nov (Sri's review of vunnara.com.au in a private window, before outreach -- "claim only what the product does
 * today"):
 * - "Trusted by early adopters" implied customers there aren't yet: it's "Early access", and no public page words
 *   social proof (testimonials, "trusted by", customer counts) with nothing behind it;
 * - the trust row's "Australian Privacy Act 1988 compliant" (a legal claim nobody has checked) is a link to the
 *   privacy policy, and "No credit card for free plan" shows only where there's a Free plan;
 * - the pricing strip lists the plans /pricing lists, the Free plan included where it's offered;
 * - "Built for Australian SMBs" is said once;
 * - the FAQ: no Privacy Act claim, the providers by name, Google's data and timing only while the setting has Google
 *   on, the free sample told apart from the Free plan's audit, and the prices from tiers.ts with a link to /pricing.
 */
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { EarlyAccess } from "@/components/domain/landing/early-access";
import { faqItems } from "@/components/domain/landing/faq-section";
import { Hero } from "@/components/domain/landing/hero";
import { HowItWorks } from "@/components/domain/landing/how-it-works";
import { PricingTeaser } from "@/components/domain/landing/pricing-teaser";
import { TrustBadges } from "@/components/domain/landing/trust-badges";
import PricingTableClient from "@/components/domain/pricing/pricing-table-client";
import { AUDIT_AI_PROVIDERS } from "@/lib/legal/data-facts";
import type { PublicGoogleAi } from "@/lib/marketing/google-ai";
import { formatAud } from "@/lib/pricing/gst";
import { TIER_DEFINITIONS } from "@/lib/pricing/tiers";
import { readSourcesBeforeAll, sourcePaths, sourceText } from "@/tests/helpers/source-files";

const loaded = vi.hoisted(() => ({ googleAi: null as unknown }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-vunnara-region": "au" }) }));
vi.mock("@/components/domain/google-ai/load-google-ai-claim", () => ({
  loadGoogleAiClaim: async () => loaded.googleAi,
}));

const ON: PublicGoogleAi = {
  surfaces: ["google_ai_overviews", "google_ai_mode"],
  fromTier: "growth",
  fromPlan: "Growth",
  countedInScore: false,
  device: "desktop",
  queueMode: "standard",
};

const PUBLIC_ROOTS = ["app/(marketing)", "components/domain/landing", "components/domain/pricing"];
const SOCIAL_PROOF =
  /trusted by|testimonial|what our customers|customers say|loved by|as seen (?:in|on)|happy customers|\bjoin (?:over )?\d[\d,]*\+? /i;

readSourcesBeforeAll(PUBLIC_ROOTS);

const html = (el: ReactElement) =>
  renderToStaticMarkup(el)
    .replace(/<!-- -->/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&");

/** Code without comments: an explanation isn't page text. */
const code = (path: string) =>
  sourceText(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

// A cold first render can outlast a test's 5 s here; pay for it once.
beforeAll(async () => {
  renderToStaticMarkup(
    createElement(PricingTableClient, { showFreeTier: true, defaultGstInclusive: true }),
  );
  await import("@/app/(marketing)/page");
}, 60_000);

afterEach(() => {
  loaded.googleAi = null;
  vi.unstubAllEnvs();
});

describe("no social proof without proof behind it", () => {
  it('the early-access section is "Early access", with no testimonials grid', () => {
    const section = html(createElement(EarlyAccess));
    expect(section).toContain(">Early access</h2>");
    expect(section).toContain("We're in early access.");
    expect(section).not.toMatch(SOCIAL_PROOF);
  });

  it("no public source words it (comments aside)", () => {
    const offenders = sourcePaths(PUBLIC_ROOTS).flatMap((path) =>
      code(path)
        .split("\n")
        .filter((line) => SOCIAL_PROOF.test(line))
        .map((line) => `${path}: ${line.trim()}`),
    );
    expect(offenders).toEqual([]);
  });
});

describe("the trust row", () => {
  it("links to the privacy policy instead of claiming Privacy Act compliance", () => {
    const row = html(createElement(TrustBadges, { showFreeTier: true }));
    expect(row).toContain('<a href="/privacy"');
    expect(row).toContain(">Privacy policy</a>");
    expect(row).not.toMatch(/Privacy Act|complian/i);
    expect(row).toContain("No credit card for free plan");
  });

  it('says "No credit card for free plan" only where there is a Free plan', () => {
    expect(html(createElement(TrustBadges, { showFreeTier: false }))).not.toMatch(/free plan/i);
  });
});

describe("the pricing strip lists the plans /pricing lists", () => {
  const cardKeys = (markup: string, attribute: string) =>
    [...markup.matchAll(new RegExp(`${attribute}="([a-z_]+)"`, "g"))].map((m) => m[1]);

  for (const showFreeTier of [true, false]) {
    it(`Free plan ${showFreeTier ? "on" : "off"}: the same plans, Enterprise as its "Contact us" line`, () => {
      const strip = html(createElement(PricingTeaser, { showFreeTier }));
      const pricing = html(
        createElement(PricingTableClient, { showFreeTier, defaultGstInclusive: true }),
      );
      expect(cardKeys(strip, "data-teaser-plan")).toEqual(
        cardKeys(pricing, "data-plan-card").filter((key) => key !== "enterprise"),
      );
      expect(strip).toContain("Enterprise?");
      if (showFreeTier) {
        expect(strip).toMatch(/data-teaser-plan="free"[\s\S]*?>Free<\/h3>[\s\S]*?A\$0/);
      } else {
        expect(strip).not.toContain('data-teaser-plan="free"');
      }
    });
  }

  it("each price is tiers.ts's", () => {
    const strip = html(createElement(PricingTeaser, { showFreeTier: true }));
    for (const tier of TIER_DEFINITIONS.filter((t) => t.key !== "enterprise")) {
      expect(strip, tier.key).toContain(formatAud(tier.monthlyPriceCentsIncGst));
    }
  });
});

describe("the landing page", () => {
  it('says "Built for Australian SMBs" once', () => {
    expect(html(createElement(Hero)).split("Built for Australian SMBs")).toHaveLength(2);
  });

  it("composed: early access, the privacy link, and the Free plan where the region offers it", async () => {
    const Landing = (await import("@/app/(marketing)/page")).default;
    vi.stubEnv("FREE_TIER_ENABLED_AU", "true");
    const withFree = html(await Landing());
    expect(withFree).toContain(">Early access</h2>");
    expect(withFree).not.toMatch(/Trusted by|What our customers say/);
    expect(withFree).toContain(">Privacy policy</a>");
    expect(withFree).not.toMatch(/Privacy Act 1988 compliant/);
    expect(withFree).toContain('data-teaser-plan="free"');
    expect(withFree).toContain("No credit card for free plan");
    expect(withFree.split("Built for Australian SMBs")).toHaveLength(2);

    vi.stubEnv("FREE_TIER_ENABLED_AU", "false");
    const withoutFree = html(await Landing());
    expect(withoutFree).not.toContain('data-teaser-plan="free"');
    expect(withoutFree).not.toContain("No credit card for free plan");
    expect(withoutFree).not.toContain("The Free plan's monthly audit");
  });

  it("\"How it works\" tells the free sample apart from the Free plan's audit, with the code's numbers", () => {
    const steps = html(createElement(HowItWorks, { showFreeTier: true }));
    expect(steps).toContain("Each audit on a paid plan: 40+ answers across 4 engines.");
    expect(steps).toContain("The Free plan's monthly audit: 20+ answers across 2 engines.");
    expect(steps).toContain(
      "The free sample audit, with no sign-up, is smaller: 6 questions across 2 engines (12 answers).",
    );
  });
});

describe("the FAQ", () => {
  const answer = (items: ReturnType<typeof faqItems>, q: string) => {
    const item = items.find((i) => i.q === q);
    if (!item) throw new Error(`no FAQ question "${q}"`);
    return item;
  };

  it('"Is my data safe?": the providers by name, nothing about the Privacy Act', () => {
    const data = answer(faqItems({ googleAi: null, showFreeTier: true }), "Is my data safe?");
    expect(data.a).toContain(
      `to ${AUDIT_AI_PROVIDERS} (on the Free plan, ChatGPT and Perplexity only).`,
    );
    expect(AUDIT_AI_PROVIDERS).toBe(
      "OpenAI (ChatGPT), Anthropic (Claude), Google (Gemini) and Perplexity",
    );
    expect(data.a).not.toMatch(/Privacy Act|comply|complian|the AI providers/i);
    expect(data.a).toContain(
      "Two copies are kept until you ask us to delete them: PDF reports you've made, and your business's evidence archive",
    );
    expect(data.a).toContain(
      "If you upload your server logs, we keep the AI crawlers' visits from them (the crawler, the page, the time, the response code and the IP address it came from) for 90 days.",
    );
    expect(data.link).toEqual({ href: "/privacy", text: "Read the privacy policy" });
  });

  it("Google's data and timing are said only while the setting has Google on", () => {
    const off = faqItems({ googleAi: null, showFreeTier: true });
    const all = (items: ReturnType<typeof faqItems>) => items.map((i) => `${i.q} ${i.a}`).join(" ");
    expect(all(off)).not.toMatch(/DataForSEO|Google's results|AI Overviews|AI Mode/);

    const on = faqItems({ googleAi: ON, showFreeTier: true });
    expect(answer(on, "Is my data safe?").a).toContain(
      "On Growth plans and up, the same questions also go to DataForSEO, which asks Google for us, logged out, with the place they're checked from (your postcode, or else your suburb, city or state capital).",
    );
    expect(answer(on, "How long does an audit take?").a).toContain(
      "On Growth plans and up, Google's results arrive about 10 minutes after the four AI engines' answers.",
    );
    expect(on.map((i) => i.q)).toContain("Do you check Google's AI Overviews and AI Mode?");
    expect(on).toHaveLength(off.length + 1);
  });

  it('"How long does an audit take?": the free sample is smaller than the Free plan\'s audit', () => {
    const timing = answer(
      faqItems({ googleAi: null, showFreeTier: true }),
      "How long does an audit take?",
    );
    expect(timing.a).toContain(
      "The free sample audit (no sign-up) is smaller than a plan's audit: it asks 6 questions across 2 AI engines (12 answers). The Free plan's monthly audit gets 20+ answers across 2 engines, and a paid plan's 40+ across 4.",
    );
    const noFree = answer(
      faqItems({ googleAi: null, showFreeTier: false }),
      "How long does an audit take?",
    );
    expect(noFree.a).not.toContain("Free plan");
  });

  it('"How much does it cost?": every price from tiers.ts and a link to /pricing', () => {
    const cost = answer(faqItems({ googleAi: null, showFreeTier: true }), "How much does it cost?");
    expect(cost.a).toBe(
      "Free plan: 1 audit/month across 2 AI engines. Paid plans: Starter A$99/mo, Growth A$299/mo, Agency A$499/mo and Agency Pro A$1,499/mo.",
    );
    for (const tier of TIER_DEFINITIONS.filter((t) => t.monthlyPriceCentsIncGst > 0)) {
      expect(cost.a, tier.key).toContain(
        `${tier.name} ${formatAud(tier.monthlyPriceCentsIncGst)}/mo`,
      );
    }
    expect(cost.link).toEqual({ href: "/pricing", text: "See full pricing" });
    expect(
      answer(faqItems({ googleAi: null, showFreeTier: false }), "How much does it cost?").a,
    ).not.toMatch(/Free plan/);
  });
});
