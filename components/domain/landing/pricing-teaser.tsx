import { TIER_DEFINITIONS } from "@/lib/pricing/tiers";
import { formatAud } from "@/lib/pricing/gst";

const TEASER_KEYS = ["starter", "growth", "agency", "agency_pro"] as const;

export function PricingTeaser() {
  return (
    <section className="py-20 px-6">
      <h2 className="text-3xl font-bold text-center mb-4">
        Simple, transparent pricing
      </h2>
      <p className="text-center text-muted-foreground mb-10">
        All prices inc. GST. Cancel any time.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
        {TEASER_KEYS.map((key) => {
          const tier = TIER_DEFINITIONS.find((t) => t.key === key);
          if (!tier) return null;
          return (
            <div
              key={key}
              className="rounded-xl border bg-background p-5 relative"
              style={tier.popular ? { borderColor: "#3b82f6", borderWidth: 2 } : undefined}
            >
              {tier.popular && (
                <span
                  className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-medium"
                  style={{ backgroundColor: "#3b82f6", color: "#fff" }}
                >
                  Most popular
                </span>
              )}
              <h3 className="font-semibold mb-1">{tier.name}</h3>
              <p className="text-2xl font-bold mb-3">
                {formatAud(tier.monthlyPriceCentsIncGst)}
                <span className="text-sm font-normal text-muted-foreground">
                  /mo
                </span>
              </p>
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
        <a href="mailto:hi@visibleau.com" className="underline">
          Contact us
        </a>
      </p>
    </section>
  );
}
