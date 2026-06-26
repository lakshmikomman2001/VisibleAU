import type { Metadata } from "next";
import { Suspense } from "react";
import { PostHogPageView } from "@/components/analytics/posthog-page-view";
import { CookieConsentBanner } from "@/components/domain/shared/cookie-consent-banner";
import { PHProvider } from "@/components/providers/posthog-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "VisibleAU",
  description: "AI search visibility platform for Australian businesses",
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
