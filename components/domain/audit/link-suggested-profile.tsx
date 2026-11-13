"use client";

import { useState } from "react";
import { displayUrl } from "@/components/shared/url-link";
import { pageNavigation } from "@/lib/hooks/use-safe-poll";
import { actionFailureMessage } from "@/lib/load/fetch-json";

/**
 * 13 Nov (Sri's walk-through, part 9): "This looks like your profile — link it?" for a cited page that is
 * very likely the brand's own profile on a directory (lib/directories/own-profile.ts). Nothing is linked
 * until the owner clicks: the link then goes through the same check as one pasted in Brand settings
 * (PUT /api/brands/[id]/directory-listings, the directory's own profile-link pattern), and the page reloads
 * so "Your profile" counts it.
 */
export function LinkSuggestedProfile({
  brandId,
  directoryKey,
  directoryName,
  url,
}: {
  brandId: string;
  directoryKey: string;
  directoryName: string;
  url: string;
}) {
  const [state, setState] = useState<"idle" | "saving" | "linked">("idle");
  const [error, setError] = useState<string | null>(null);

  const link = async () => {
    setState("saving");
    setError(null);
    try {
      const res = await fetch(`/api/brands/${brandId}/directory-listings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ directoryKey, status: "listed", profileUrl: url }),
      });
      if (!res.ok) {
        setState("idle");
        setError(await actionFailureMessage(res, "The profile couldn't be linked."));
        return;
      }
      setState("linked");
      // A full reload, not router.refresh(): this sits in server-rendered audit pages (and their tests)
      // that mount no app router of their own.
      pageNavigation.reload();
    } catch {
      setState("idle");
      setError("The profile couldn't be linked. Check your connection and try again.");
    }
  };

  if (state === "linked") {
    return (
      <p role="status" style={{ fontSize: 12, color: "var(--success)", margin: "6px 0 0" }}>
        Linked as your {directoryName} profile.
      </p>
    );
  }
  return (
    <div data-suggested-profile={directoryKey} style={{ margin: "6px 0 0" }}>
      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
        This looks like your profile — {displayUrl(url)}. Link it?{" "}
      </span>
      <button
        type="button"
        onClick={link}
        disabled={state === "saving"}
        style={{
          fontSize: 12,
          background: "none",
          border: "none",
          padding: 0,
          cursor: state === "saving" ? "not-allowed" : "pointer",
          color: "var(--accent-blue)",
          textDecoration: "underline",
        }}
      >
        {state === "saving" ? "Linking…" : `Link it as my ${directoryName} profile`}
      </button>
      {error && (
        <p role="alert" style={{ fontSize: 12, color: "var(--danger)", margin: "4px 0 0" }}>
          {error}
        </p>
      )}
    </div>
  );
}
