import type { ReactNode } from "react";
import type { PublicGoogleAi } from "@/lib/marketing/google-ai";

/**
 * 16 Nov -- the setting-aware component: what a public page says about Google's AI answers, only while the global
 * setting has them on. `googleAi` is what loadGoogleAiClaim() (./load-google-ai-claim.ts) returned for this request;
 * null renders nothing. The words are lib/marketing/google-ai.ts's.
 */
export function GoogleAiClaim({
  googleAi,
  children,
}: {
  googleAi: PublicGoogleAi | null;
  children: (googleAi: PublicGoogleAi) => ReactNode;
}) {
  if (!googleAi) return null;
  return <>{children(googleAi)}</>;
}
