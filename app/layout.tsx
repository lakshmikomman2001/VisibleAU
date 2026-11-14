import type { Metadata } from "next";
import { Suspense } from "react";
import { PostHogPageView } from "@/components/analytics/posthog-page-view";
import { CookieConsentBanner } from "@/components/domain/shared/cookie-consent-banner";
import { PHProvider } from "@/components/providers/posthog-provider";
import { DEFAULT_PAGE_TITLE, OG_IMAGE, PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";
import { SITE_URL } from "@/lib/product";
import "./globals.css";

export const metadata: Metadata = {
  // Every URL-based field below this layout resolves against the production site (lib/product.ts), never
  // the http://localhost:3000 Next falls back to (9 Nov, the build's metadataBase warning).
  metadataBase: new URL(SITE_URL),
  // Rebrand (15 Nov), part 1: every name, line and image here is lib/brand.ts's. A page that names itself
  // reads "<its title> | Vunnara"; one that doesn't, "Vunnara". The icons are app/favicon.ico, app/icon.svg
  // and app/apple-icon.png, and app/manifest.ts the web manifest (all drawn from the same mark).
  applicationName: PRODUCT_NAME,
  title: { default: PRODUCT_NAME, template: `%s | ${PRODUCT_NAME}` },
  description: PRODUCT_TAGLINE,
  openGraph: {
    type: "website",
    locale: "en_AU",
    siteName: PRODUCT_NAME,
    title: DEFAULT_PAGE_TITLE,
    description: PRODUCT_TAGLINE,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_PAGE_TITLE,
    description: PRODUCT_TAGLINE,
    images: [{ url: OG_IMAGE.url, alt: OG_IMAGE.alt }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" translate="no" data-theme="dark" suppressHydrationWarning>
      <head>
        <meta name="google" content="notranslate" />
      </head>
      <body className="antialiased">
        <PHProvider>
          <Suspense fallback={null}>
            <PostHogPageView />
          </Suspense>
          <CookieConsentBanner />
          {children}
        </PHProvider>
      </body>
    </html>
  );
}
