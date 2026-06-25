export interface TierDefinition {
  key: string;
  name: string;
  monthlyPriceCentsIncGst: number;
  annualPriceCentsIncGst: number;
  brands: number;
  engines: number;
  frequency: string;
  features: string[];
  popular?: boolean;
}

export const TIER_DEFINITIONS: TierDefinition[] = [
  {
    key: "free",
    name: "Free",
    monthlyPriceCentsIncGst: 0,
    annualPriceCentsIncGst: 0,
    brands: 1,
    engines: 2,
    frequency: "1 audit/month",
    features: [
      "1 brand",
      "2 AI engines",
      "1 audit per month",
      "Basic visibility score",
    ],
  },
  {
    key: "starter",
    name: "Starter",
    monthlyPriceCentsIncGst: 9900,
    annualPriceCentsIncGst: 99000,
    brands: 1,
    engines: 4,
    frequency: "Weekly audits",
    features: [
      "1 brand",
      "4 AI engines",
      "Weekly automated audits",
      "Full 7-layer scoring",
      "Action items & recommendations",
      "Email reports",
    ],
  },
  {
    key: "growth",
    name: "Growth",
    monthlyPriceCentsIncGst: 29900,
    annualPriceCentsIncGst: 299000,
    brands: 1,
    engines: 4,
    frequency: "3x/week audits",
    popular: true,
    features: [
      "1 brand",
      "4 AI engines",
      "3x weekly audits",
      "Full 7-layer scoring",
      "Drift detection alerts",
      "Competitor tracking",
      "PDF export",
    ],
  },
  {
    key: "agency",
    name: "Agency",
    monthlyPriceCentsIncGst: 49900,
    annualPriceCentsIncGst: 499000,
    brands: 5,
    engines: 4,
    frequency: "Daily audits",
    features: [
      "5 brands",
      "4 AI engines",
      "Daily automated audits",
      "Client portal",
      "White-label reports",
      "Webhook integrations",
      "Priority support",
    ],
  },
  {
    key: "agency_pro",
    name: "Agency Pro",
    monthlyPriceCentsIncGst: 149900,
    annualPriceCentsIncGst: 1499000,
    brands: 25,
    engines: 4,
    frequency: "2x daily audits",
    features: [
      "25 brands",
      "4 AI engines",
      "2x daily audits",
      "Everything in Agency",
      "Bulk operations",
      "GA4 integration",
      "Custom branding",
      "Dedicated support",
    ],
  },
  {
    key: "enterprise",
    name: "Enterprise",
    monthlyPriceCentsIncGst: 0,
    annualPriceCentsIncGst: 0,
    brands: -1,
    engines: 4,
    frequency: "Custom",
    features: [
      "Unlimited brands",
      "Custom audit frequency",
      "SSO & SAML",
      "SLA guarantee",
      "Dedicated account manager",
      "Custom integrations",
    ],
  },
];

export const ONE_OFF_AUDIT_PRICE_CENTS_INC_GST = 29900;

export function getTierDefinition(key: string): TierDefinition | undefined {
  return TIER_DEFINITIONS.find((t) => t.key === key);
}
