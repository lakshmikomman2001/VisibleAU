import { PRODUCT_NAME } from "@/lib/product";

/**
 * Live invite test follow-ups (8 Nov), part 3 -- the one rule for what the app says about when a plan renews.
 * On 8 Nov Splice's billing page said "Next renewal 24 Sep 2026": the page showed the subscription row's
 * stored period end as the next renewal, whatever it was. The row's period end only moves when Stripe's
 * webhook says so, so it can be stale, and a plan nobody set up in Stripe never renews at all.
 *
 * The line says only what the row supports:
 * - no paid plan: nothing ("—");
 * - not a Stripe subscription (its id isn't Stripe's): "Plan set by Vunnara, no automatic renewal";
 * - past due or unpaid: says that, with no date;
 * - cancellation scheduled: "Plan ends <date>", or "Plan ended <date>" once it's passed;
 * - a period end still ahead: "Next renewal <date>" -- the only case that says it;
 * - a period end already passed: "Not confirmed: the last period ended <date>", never "Next renewal".
 *
 * The billing page is the only place a renewal date is shown (no email or other page has one), and it shows
 * whatever this returns (tests/unit/pricing/renewal-line.test.ts guards that).
 */
export interface RenewalSource {
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  stripeSubscriptionId: string;
}

export type RenewalKind =
  | "none"
  | "manual"
  | "past_due"
  | "unpaid"
  | "renews"
  | "ends"
  | "ended"
  | "not_confirmed";

export interface RenewalLine {
  kind: RenewalKind;
  label: string;
  value: string;
}

/**
 * Whether Stripe renews this subscription: its id is one Stripe made ("sub_" and at least 14 letters and
 * digits). A seeded one ("sub_test_..."), or one written by hand without a Stripe subscription behind it,
 * isn't.
 */
export function isStripeSubscriptionId(id: string): boolean {
  return /^sub_[A-Za-z0-9]{14,}$/.test(id);
}

export function renewalLine(
  sub: RenewalSource | null,
  formatDate: (date: Date) => string,
  now: Date = new Date(),
): RenewalLine {
  if (!sub) return { kind: "none", label: "Next renewal", value: "—" };
  if (!isStripeSubscriptionId(sub.stripeSubscriptionId)) {
    return {
      kind: "manual",
      label: "Renewal",
      value: `Plan set by ${PRODUCT_NAME}, no automatic renewal`,
    };
  }
  if (sub.status === "past_due") {
    return {
      kind: "past_due",
      label: "Payment",
      value: "Past due: the last payment didn't go through",
    };
  }
  if (sub.status === "unpaid") {
    return { kind: "unpaid", label: "Payment", value: "Unpaid: the last invoice hasn't been paid" };
  }
  const end = sub.currentPeriodEnd;
  if (!end) return { kind: "none", label: "Next renewal", value: "—" };
  const passed = end.getTime() <= now.getTime();
  if (sub.cancelAtPeriodEnd) {
    return passed
      ? { kind: "ended", label: "Plan ended", value: formatDate(end) }
      : { kind: "ends", label: "Plan ends", value: formatDate(end) };
  }
  if (!passed) return { kind: "renews", label: "Next renewal", value: formatDate(end) };
  return {
    kind: "not_confirmed",
    label: "Renewal",
    value: `Not confirmed: the last period ended ${formatDate(end)}`,
  };
}
