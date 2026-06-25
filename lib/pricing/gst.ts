const GST_RATE = 0.10;

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
