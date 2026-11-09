/**
 * Mock-gate and retention follow-ups (9 Nov), part 8 -- Enterprise's "Contact us" went to hello@visibleau.com, the
 * error page to support@, the privacy page to privacy@ and the rest to hi@visibleau.com, while every email the app
 * sends comes from vunnara.com.au. Every contact address is now one of lib/product.ts's constants, on the sending
 * domain, and none of the old domain's addresses is left anywhere in the code.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ALLOWED_FROM_DOMAINS } from "@/lib/email/send";
import { CONTACT_DOMAIN, CONTACT_EMAIL, PRIVACY_EMAIL, SUPPORT_EMAIL } from "@/lib/product";
import { NON_TEST_ROOTS, readSourcesBeforeAll, sourceFiles } from "../../helpers/source-files";

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-visibleau-region": "au" }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const html = (element: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(element).replace(/&amp;/g, "&");

// The scan's one walk, before the file's tests (tests/helpers/source-files.ts).
readSourcesBeforeAll([...NON_TEST_ROOTS, "public"]);

describe("contact addresses", () => {
  it("are on the domain the app sends from", () => {
    expect(ALLOWED_FROM_DOMAINS).toContain(CONTACT_DOMAIN);
    for (const address of [CONTACT_EMAIL, SUPPORT_EMAIL, PRIVACY_EMAIL]) {
      expect(address.endsWith(`@${CONTACT_DOMAIN}`)).toBe(true);
    }
  });

  it("no address on the old visibleau.com domain anywhere in the code (history and migrations aside)", () => {
    const OLD_ADDRESS = /[A-Za-z0-9._%+-]+@visibleau\.com\b/;
    const offenders = sourceFiles([...NON_TEST_ROOTS, "public"])
      .filter((f) => OLD_ADDRESS.test(f.text))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("each page links its constant", async () => {
    const { Footer } = await import("@/components/domain/landing/footer");
    expect(html(<Footer />)).toContain(`href="mailto:${CONTACT_EMAIL}"`);

    const Terms = (await import("@/app/(marketing)/terms/page")).default;
    expect(html(<Terms />)).toContain(`href="mailto:${CONTACT_EMAIL}"`);

    const About = (await import("@/app/(marketing)/about/page")).default;
    expect(html(<About />)).toContain(`href="mailto:${CONTACT_EMAIL}"`);

    const Privacy = (await import("@/app/(marketing)/privacy/page")).default;
    expect(html(<Privacy />)).toContain(`href="mailto:${PRIVACY_EMAIL}"`);

    const ErrorPage = (await import("@/app/error")).default;
    const err = Object.assign(new Error("boom"), { digest: "d1" });
    expect(html(<ErrorPage error={err} reset={() => {}} />)).toContain(
      `href="mailto:${SUPPORT_EMAIL}"`,
    );

    const { PricingTeaser } = await import("@/components/domain/landing/pricing-teaser");
    expect(html(<PricingTeaser />)).toContain(`href="mailto:${CONTACT_EMAIL}"`);

    const Pricing = (await import("@/app/(marketing)/pricing/page")).default;
    expect(html(await Pricing())).toContain(
      `href="mailto:${CONTACT_EMAIL}?subject=Enterprise%20inquiry"`,
    );
  }, 60_000);
});
