import { GST_REGISTERED, LEGAL_ENTITY_NAME } from "@/lib/product";

const GST_RATE = 0.1;

export function priceIncGst(exGstCents: number): number {
  return Math.round(exGstCents * (1 + GST_RATE));
}

export function priceExGst(incGstCents: number): number {
  return Math.round(incGstCents / (1 + GST_RATE));
}

export function gstAmount(incGstCents: number): number {
  return incGstCents - priceExGst(incGstCents);
}

export function formatAud(cents: number): string {
  return `A$${(cents / 100).toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function formatAudDecimal(cents: number): string {
  return `A$${(cents / 100).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/*
 * GST-free pricing (11 Nov): every word the product says about GST, and every price that depends on it, comes
 * from here, read from lib/product.ts GST_REGISTERED -- false today (the ABN isn't registered for GST). Each
 * takes `registered` (default the switch) so the registered path stays tested. Nothing else may say "GST"
 * (tests/unit/pricing/no-gst-copy.test.ts).
 */

/** The price a card shows. Not registered: the list price everywhere. Registered: ex GST unless inc is chosen. */
export function displayPriceCents(
  listCents: number,
  gstInclusive: boolean,
  registered: boolean = GST_REGISTERED,
): number {
  if (listCents === 0 || !registered || gstInclusive) return listCents;
  return priceExGst(listCents);
}

/** The line under the plan cards. */
export function pricingNote(gstInclusive: boolean, registered: boolean = GST_REGISTERED): string {
  if (!registered) return "Prices are in Australian dollars. No GST is charged.";
  return `All prices in AUD. ${
    gstInclusive
      ? "Prices include 10% GST for Australian customers."
      : "GST of 10% applies to Australian customers at checkout."
  }`;
}

/** The inc/ex toggle's accessible name (the toggle shows only while registered). */
export const GST_TOGGLE_LABEL = "Toggle GST inclusive pricing";

/** A price's tax label ("inc GST" / "ex GST"), or null when nothing is said (not registered). */
export function gstLabel(
  gstInclusive: boolean,
  registered: boolean = GST_REGISTERED,
): string | null {
  if (!registered) return null;
  return gstInclusive ? "inc GST" : "ex GST";
}

/** The pricing page's description (metadata). */
export function pricingMetaDescription(registered: boolean = GST_REGISTERED): string {
  const base =
    "Per-brand flat-rate pricing for AI search visibility audits. No per-prompt surprises.";
  return registered
    ? `${base} All prices in AUD inc GST.`
    : `${base} All prices in Australian dollars.`;
}

/** The landing page's line over the plan teaser. */
export function teaserPriceLine(registered: boolean = GST_REGISTERED): string {
  return registered
    ? "All prices inc. GST. Cancel any time."
    : "Prices in Australian dollars. Cancel any time.";
}

/** What follows a monthly price in running text ("from A$99/mo inc. GST"), or nothing. */
export function priceTaxSuffix(registered: boolean = GST_REGISTERED): string {
  return registered ? " inc. GST" : "";
}

/** The billing page's Region value. */
export function billingRegionLabel(registered: boolean = GST_REGISTERED): string {
  return registered ? "AU (GST inclusive)" : "AU";
}

/** The Terms' sentence on what prices are in. */
export function termsPricesSentence(registered: boolean = GST_REGISTERED): string {
  return registered
    ? "All prices are in Australian dollars and include GST."
    : `Prices are in Australian dollars. ${LEGAL_ENTITY_NAME} is not registered for GST, so no GST is charged.`;
}
