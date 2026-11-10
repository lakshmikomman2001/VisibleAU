"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
// It replaces the root layout, so it brings the global styles and the theme itself (Next: "Global error UI must
// define its own <html> and <body> tags, global styles, fonts..."); without them its button had no colours
// (Playwright-run follow-ups, 10 Nov, part 8).
import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en-AU" data-theme="dark">
      <body>
        <div className="flex flex-col items-center justify-center min-h-screen gap-4">
          <h2 className="text-xl font-semibold">Critical error — please refresh</h2>
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground font-medium"
          >
            Refresh
          </button>
        </div>
      </body>
    </html>
  );
}
