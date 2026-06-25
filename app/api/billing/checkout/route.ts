import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { BillingInterval } from "@/lib/stripe/price-map";
import { createCheckoutSession } from "@/lib/stripe/checkout";

const checkoutSchema = z.object({
  tier: z.enum(["starter", "growth", "agency", "agency_pro"]),
  billing: z.enum(["monthly", "annual"]).default("monthly"),
});

export async function POST(req: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { tier, billing } = parsed.data;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  try {
    const session = await createCheckoutSession({
      tier,
      billing: billing as BillingInterval,
      organizationId: currentUser.organizationId,
      customerEmail: currentUser.email,
      successUrl: `${appUrl}/settings/billing?success=true`,
      cancelUrl: `${appUrl}/pricing?canceled=true`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[billing/checkout] Failed:", err);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 },
    );
  }
}
