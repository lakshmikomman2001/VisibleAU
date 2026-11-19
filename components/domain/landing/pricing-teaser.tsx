import { formatAud, teaserPriceLine } from "@/lib/pricing/gst";
import { TIER_DEFINITIONS } from "@/lib/pricing/tiers";
import { CONTACT_EMAIL } from "@/lib/product";

const TEASER_KEYS = ["free", "starter", "growth", "agency", "agency_pro"] as const;

/**
 * The landing page's plans, from lib/pricing/tiers.ts. 19 Nov (Sri's review): the Free plan was missing while the hero
 * offers a free sample audit and the trust row says "No credit card for free plan". It's listed now wherever /pricing
 * lists it (`showFreeTier`: the same switch, lib/feature-flags isFreeTierEnabled for the visitor's region), so the two
 * pages show the same plans. Enterprise is the "Contact us" line under them, as on /pricing it's a card with no price.
 */
export function PricingTeaser({ showFreeTier }: { showFreeTier: boolean }) {
  const keys = TEASER_KEYS.filter((key) => showFreeTier || key !== "free");
  return (
    <section className="py-20 px-6">
      <h2 className="text-3xl font-bold text-center mb-4">Simple, transparent pricing</h2>
      <p className="text-center text-muted-foreground mb-10">{teaserPriceLine()}</p>
      <div
        className={`grid grid-cols-1 sm:grid-cols-2 gap-4 mx-auto ${keys.length > 4 ? "lg:grid-cols-5 max-w-6xl" : "lg:grid-cols-4 max-w-5xl"}`}
      >
        {keys.map((key) => {
          const tier = TIER_DEFINITIONS.find((t) => t.key === key);
          if (!tier) return null;
          const isFree = tier.monthlyPriceCentsIncGst === 0;
          return (
            <div
              key={key}
              data-teaser-plan={key}
              className="rounded-xl border bg-background p-5 relative"
              style={
                tier.popular ? { borderColor: "var(--accent-blue)", borderWidth: 2 } : undefined
              }
            >
              {tier.popular && (
                <span
                  className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-medium"
                  style={{ backgroundColor: "var(--accent-blue)", color: "var(--accent-blue-fg)" }}
                >
                  Most popular
                </span>
              )}
              <h3 className="font-semibold mb-1">{tier.name}</h3>
              <p className="text-2xl font-bold mb-1">
                {formatAud(tier.monthlyPriceCentsIncGst)}
                {isFree ? null : (
                  <span className="text-sm font-normal text-muted-foreground">/mo</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground mb-3">{tier.frequency}</p>
              <a
                href="/pricing"
                className="inline-block rounded-md border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
              >
                See details
              </a>
            </div>
          );
        })}
      </div>
      <p className="text-center mt-6 text-sm text-muted-foreground">
        Enterprise?{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
          Contact us
        </a>
      </p>
    </section>
  );
}
