import { isProductionRuntime } from "@/lib/mock-mode";

export async function GET() {
  // Demo mode is a local-development switch, like the mock shortcuts: production (NODE_ENV or VERCEL_ENV) 404s.
  if (isProductionRuntime()) {
    return new Response(null, { status: 404 });
  }
  if (process.env.DEMO_MODE !== "true") {
    return new Response(null, { status: 404 });
  }

  return Response.json({
    message: "Demo mode active. Sign in with a demo account to explore.",
    workspaces: ["demo-tradies", "demo-allied-health", "demo-saas"],
  });
}
