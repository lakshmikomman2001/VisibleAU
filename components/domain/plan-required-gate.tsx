"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { PLAN_REQUIRED } from "@/lib/pricing/plan-required-copy";

/** Where a workspace with no plan may still go: Billing, to see it has none (and after checkout, before Stripe says). */
const OPEN_WITHOUT_A_PLAN = ["/settings/billing"];

/**
 * 20 Nov (part 6): a workspace made while the free plan was off has no plan until checkout (lib/pricing/plan-required.ts).
 * Every page of the app but Billing sends it to the plan picker (/pricing), and says why while it goes.
 */
export function PlanRequiredGate({
  needsPlan,
  children,
}: {
  needsPlan: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const open = OPEN_WITHOUT_A_PLAN.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const gated = needsPlan && !open;

  useEffect(() => {
    if (gated) router.replace(PLAN_REQUIRED.choosePlanUrl);
  }, [gated, router]);

  if (!gated) return <>{children}</>;
  return (
    <div
      data-plan-required=""
      style={{ maxWidth: 560, margin: "80px auto", padding: "0 24px", textAlign: "center" }}
    >
      <h1
        style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", margin: "0 0 8px" }}
      >
        Choose a plan to start
      </h1>
      <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 16px" }}>
        {PLAN_REQUIRED.message} Audits start once you have one.
      </p>
      <Link
        href={PLAN_REQUIRED.choosePlanUrl}
        style={{ fontSize: 14, fontWeight: 500, color: "var(--accent-blue)" }}
      >
        See the plans
      </Link>
    </div>
  );
}
