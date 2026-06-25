"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check } from "lucide-react";
import { formatAud, priceExGst } from "@/lib/pricing/gst";
import {
  ONE_OFF_AUDIT_PRICE_CENTS_INC_GST,
  TIER_DEFINITIONS,
} from "@/lib/pricing/tiers";

interface Props {
  showFreeTier: boolean;
  defaultGstInclusive: boolean;
}

export default function PricingTableClient({
  showFreeTier,
  defaultGstInclusive,
}: Props) {
  const router = useRouter();
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [gstInclusive, setGstInclusive] = useState(defaultGstInclusive);
  const [loadingTier, setLoadingTier] = useState<string | null>(null);

  const tiers = showFreeTier
    ? TIER_DEFINITIONS
    : TIER_DEFINITIONS.filter((t) => t.key !== "free");

  function getPrice(cents: number) {
    if (cents === 0) return cents;
    return gstInclusive ? cents : priceExGst(cents);
  }

  async function handleUpgrade(tierKey: string) {
    if (tierKey === "free" || tierKey === "enterprise") return;
    setLoadingTier(tierKey);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: tierKey, billing }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        router.push("/sign-in");
      }
    } catch {
      router.push("/sign-in");
    } finally {
      setLoadingTier(null);
    }
  }

  const oneOffPrice = getPrice(ONE_OFF_AUDIT_PRICE_CENTS_INC_GST);

  return (
    <div>
      {/* Toggles */}
      <div className="flex flex-wrap items-center justify-center gap-6 mb-10">
        {/* Billing toggle */}
        <div
          className="inline-flex items-center rounded-lg p-1"
          style={{ backgroundColor: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
        >
          <button
            onClick={() => setBilling("monthly")}
            className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
            style={
              billing === "monthly"
                ? { backgroundColor: "#3b82f6", color: "#fff" }
                : { color: "var(--text-secondary)" }
            }
          >
            Monthly
          </button>
          <button
            onClick={() => setBilling("annual")}
            className="px-4 py-2 rounded-md text-sm font-medium transition-colors"
            style={
              billing === "annual"
                ? { backgroundColor: "#3b82f6", color: "#fff" }
                : { color: "var(--text-secondary)" }
            }
          >
            Annual
            <span className="ml-1 text-xs opacity-75">(2 months free)</span>
          </button>
        </div>

        {/* GST toggle */}
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            ex GST
          </span>
          <button
            onClick={() => setGstInclusive(!gstInclusive)}
            className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
            style={{ backgroundColor: gstInclusive ? "#3b82f6" : "#3f3f46" }}
            aria-label="Toggle GST inclusive pricing"
          >
            <span
              className="inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform"
              style={{
                transform: gstInclusive ? "translateX(18px)" : "translateX(3px)",
              }}
            />
          </button>
          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
            inc GST
          </span>
        </div>
      </div>

      {/* Tier cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {tiers.map((tier) => {
          const rawPrice =
            billing === "annual"
              ? tier.annualPriceCentsIncGst
              : tier.monthlyPriceCentsIncGst;
          const displayPrice = getPrice(rawPrice);
          const isEnterprise = tier.key === "enterprise";
          const isFree = tier.key === "free";

          return (
            <div
              key={tier.key}
              className="rounded-lg p-6 flex flex-col"
              style={{
                border: tier.popular
                  ? "2px solid #3b82f6"
                  : "1px solid var(--border-default)",
                backgroundColor: "var(--bg-elevated)",
                position: "relative",
              }}
            >
              {tier.popular && (
                <span
                  className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-medium"
                  style={{ backgroundColor: "#3b82f6", color: "#fff" }}
                >
                  Most popular
                </span>
              )}

              <h3
                className="text-lg font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                {tier.name}
              </h3>

              <div className="mt-2 mb-1">
                {isEnterprise ? (
                  <span
                    className="text-2xl font-bold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Custom
                  </span>
                ) : isFree ? (
                  <span
                    className="text-2xl font-bold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    A$0
                  </span>
                ) : (
                  <>
                    <span
                      className="text-2xl font-bold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {formatAud(
                        billing === "annual"
                          ? Math.round(displayPrice / 12)
                          : displayPrice,
                      )}
                    </span>
                    <span
                      className="text-sm ml-1"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      /mo
                    </span>
                    {billing === "annual" && (
                      <div
                        className="text-xs mt-0.5"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {formatAud(displayPrice)} billed annually
                      </div>
                    )}
                  </>
                )}
              </div>

              <p
                className="text-sm mb-4"
                style={{ color: "var(--text-secondary)" }}
              >
                {tier.frequency}
              </p>

              <ul className="flex-1 space-y-2 mb-6">
                {tier.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2 text-sm"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <Check
                      className="mt-0.5 flex-shrink-0"
                      style={{ width: 14, height: 14, color: "#22c55e" }}
                    />
                    {f}
                  </li>
                ))}
              </ul>

              {isEnterprise ? (
                <a
                  href="mailto:hello@visibleau.com?subject=Enterprise%20inquiry"
                  className="block w-full text-center rounded-md px-4 py-2 text-sm font-medium"
                  style={{
                    border: "1px solid var(--border-default)",
                    color: "var(--text-primary)",
                  }}
                >
                  Contact us
                </a>
              ) : isFree ? (
                <a
                  href="/sign-up"
                  className="block w-full text-center rounded-md px-4 py-2 text-sm font-medium"
                  style={{
                    border: "1px solid var(--border-default)",
                    color: "var(--text-primary)",
                  }}
                >
                  Get started free
                </a>
              ) : (
                <button
                  onClick={() => handleUpgrade(tier.key)}
                  disabled={loadingTier === tier.key}
                  className="w-full rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
                  style={
                    tier.popular
                      ? { backgroundColor: "#3b82f6", color: "#fff" }
                      : {
                          border: "1px solid #3b82f6",
                          color: "#3b82f6",
                        }
                  }
                >
                  {loadingTier === tier.key ? "Loading..." : "Upgrade"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* One-off audit section */}
      <div
        className="mt-12 rounded-lg p-6 text-center"
        style={{
          backgroundColor: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
        }}
      >
        <h3
          className="text-lg font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          One-off Audit
        </h3>
        <p
          className="text-sm mt-1 mb-2"
          style={{ color: "var(--text-secondary)" }}
        >
          Need a single comprehensive audit without a subscription?
        </p>
        <p
          className="text-2xl font-bold mb-1"
          style={{ color: "var(--text-primary)" }}
        >
          {formatAud(oneOffPrice)}
        </p>
        <p className="text-xs mb-4" style={{ color: "var(--text-tertiary)" }}>
          {gstInclusive ? "inc GST" : "ex GST"} &middot; 4 engines, 10 prompts,
          5 runs per prompt
        </p>
        <a
          href="/sign-in"
          className="inline-block rounded-md px-6 py-2 text-sm font-medium"
          style={{
            border: "1px solid #3b82f6",
            color: "#3b82f6",
          }}
        >
          Purchase one-off audit
        </a>
      </div>

      {/* GST note */}
      <p
        className="text-center text-xs mt-6"
        style={{ color: "var(--text-tertiary)" }}
      >
        All prices in AUD.{" "}
        {gstInclusive
          ? "Prices include 10% GST for Australian customers."
          : "GST of 10% applies to Australian customers at checkout."}
      </p>
    </div>
  );
}
