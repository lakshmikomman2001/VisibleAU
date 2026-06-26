export async function GET() {
  if (process.env.NODE_ENV === "production") {
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
