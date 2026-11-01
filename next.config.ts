import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-auth"],
  // DEMO-BLOCKER (1 Nov), part 4: the report PDF's bundled fonts are read
  // from disk at render time (lib/reports/pdf/fonts.ts), inside the Inngest
  // function render-report-pdf -- ship them with the route that serves it.
  outputFileTracingIncludes: {
    "/api/webhooks/inngest": ["./lib/reports/pdf/fonts/**/*"],
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.visibleau.com" }],
        destination: "https://visibleau.com/:path*",
        permanent: true,
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/**" },
      { protocol: "https", hostname: "img.clerk.com" },
    ],
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
});
