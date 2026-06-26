"use client";

import { useState, useEffect } from "react";

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("cookie-consent")) setVisible(true);
  }, []);

  const accept = () => {
    localStorage.setItem("cookie-consent", "accepted");
    setVisible(false);
  };

  const decline = () => {
    localStorage.setItem("cookie-consent", "declined");
    setVisible(false);
    import("posthog-js").then(({ default: posthog }) =>
      posthog.opt_out_capturing(),
    );
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-background border-t shadow-lg">
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          We use cookies for authentication and analytics.{" "}
          <a href="/privacy#cookies" className="underline">
            Learn more
          </a>
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={decline}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
          >
            Decline
          </button>
          <button
            onClick={accept}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground font-medium"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
