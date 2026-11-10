import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import {
  assertLegalEntityForProduction,
  LEGACY_TRACKING_SNIPPET_PATH,
  TRACKING_SNIPPET_PATH,
} from "./lib/product";

// A production build stops while the legal name or ABN is still a placeholder (lib/product.ts).
assertLegalEntityForProduction();

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-auth"],
  // DEMO-BLOCKER (1 Nov), part 4: the report PDF's bundled fonts are read
  // from disk at render time (lib/reports/pdf/fonts.ts), inside the Inngest
  // function render-report-pdf -- ship them with the route that serves it.
  // 2 Nov: and with Settings -> Report branding's preview, the same renderer.
  outputFileTracingIncludes: {
    "/api/webhooks/inngest": ["./lib/reports/pdf/fonts/**/*"],
    "/api/report-branding/preview": ["./lib/reports/pdf/fonts/**/*"],
  },
  // Playwright-run follow-ups (10 Nov), part 7: the redirect from the old domain's www host to its apex is gone
  // (the app isn't served there; Vercel redirects www.vunnara.com.au itself). The tracking snippet was renamed;
  // its old path serves the same file, so a link to it keeps working.
  async rewrites() {
    return [{ source: LEGACY_TRACKING_SNIPPET_PATH, destination: TRACKING_SNIPPET_PATH }];
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
