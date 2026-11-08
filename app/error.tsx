"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { SUPPORT_EMAIL } from "@/lib/product";

export default function ErrorPage({
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
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        {error.digest ? `Error ID: ${error.digest}` : "An unexpected error occurred."}
      </p>
      <div className="flex gap-3 mt-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground font-medium"
        >
          Try again
        </button>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="rounded-md border px-4 py-2 text-sm hover:bg-muted transition-colors"
        >
          Contact support
        </a>
      </div>
    </div>
  );
}
