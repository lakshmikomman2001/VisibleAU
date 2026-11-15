"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { SUPPORT_EMAIL } from "@/lib/product";

/**
 * An error on a signed-in page, inside the app's one shell (sidebar and top bar stay, so the way out is still there).
 * Leftovers task, part 1 (17 Nov): the root app/error.tsx replaced the whole signed-in layout, and with the root
 * loading.tsx (now removed) the page answered 200 and could leave a hidden second copy of the shell in the page.
 */
export default function SignedInErrorPage({
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
    <div className="flex flex-col items-start gap-4 px-4 py-10 sm:px-8" data-app-error>
      <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
        Something went wrong
      </h1>
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {error.digest ? `Error ID: ${error.digest}` : "An unexpected error occurred."}
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Try again
        </button>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="rounded-md border px-4 py-2 text-sm transition-colors hover:bg-muted"
        >
          Contact support
        </a>
      </div>
    </div>
  );
}
