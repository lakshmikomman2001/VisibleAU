/**
 * 20 Nov (part 6): what a workspace with no plan is told, and where it's sent (lib/pricing/plan-required.ts). Its own
 * file, with no server import, so the client gate (components/domain/plan-required-gate.tsx) can read it.
 */
export const PLAN_REQUIRED = {
  error: "plan_required",
  message: "Your workspace doesn't have a plan yet. Choose one to start.",
  choosePlanUrl: "/pricing",
} as const;
