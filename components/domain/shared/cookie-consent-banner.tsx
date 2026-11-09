"use client";

import { useEffect, useRef, useState } from "react";

/**
 * While the banner is open, its height, for the space pages keep free under their last control
 * (app/globals.css). Playwright-run follow-ups (9 Nov), part 3 (U1): fixed to the bottom of the
 * screen, the unanswered banner covered the running audit page's last control ("Skip and view raw
 * output") and the page couldn't be scrolled far enough to uncover it.
 */
export const COOKIE_BANNER_HEIGHT_VAR = "--cookie-banner-height";

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!localStorage.getItem("cookie-consent")) setVisible(true);
  }, []);

  useEffect(() => {
    const banner = bannerRef.current;
    if (!visible || !banner) return;
    const root = document.documentElement;
    const reserve = () =>
      root.style.setProperty(
        COOKIE_BANNER_HEIGHT_VAR,
        `${banner.getBoundingClientRect().height}px`,
      );
    reserve();
    // Its height changes with the width (the text wraps, the buttons stack on a phone).
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(reserve);
    observer?.observe(banner);
    return () => {
      observer?.disconnect();
      root.style.removeProperty(COOKIE_BANNER_HEIGHT_VAR);
    };
  }, [visible]);

  const accept = () => {
    localStorage.setItem("cookie-consent", "accepted");
    setVisible(false);
  };

  const decline = () => {
    localStorage.setItem("cookie-consent", "declined");
    setVisible(false);
    import("posthog-js").then(({ default: posthog }) => posthog.opt_out_capturing());
  };

  if (!visible) return null;

  return (
    // In the signed-in app at 1024px and wider it starts where the sidebar
    // ends, so the account menu and Sign out stay clickable (app/globals.css).
    // On a phone the open drawer and its scrim sit above it. While it's open,
    // pages keep its height free at the bottom (COOKIE_BANNER_HEIGHT_VAR).
    <div
      ref={bannerRef}
      data-cookie-banner
      className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-background border-t shadow-lg"
    >
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          We use cookies for authentication and analytics.{" "}
          <a href="/privacy#cookies" className="underline">
            Learn more
          </a>
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={decline}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
          >
            Decline
          </button>
          <button
            type="button"
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
