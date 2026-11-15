import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { TRUST_CHECK_IMPLEMENTED } from "@/lib/trust/stub-implementation-status";

/**
 * 17 Nov, part 2 -- no placeholder for a check that isn't built: while YouTube presence isn't
 * (TRUST_CHECK_IMPLEMENTED.youtubePresence), this page doesn't exist (404), as the trust hub already hides its tile. It said
 * "Not yet available" and "hasn't been built yet — this tile will populate once it ships".
 */
export default function Layout({ children }: { children: ReactNode }) {
  if (!TRUST_CHECK_IMPLEMENTED.youtubePresence) notFound();
  return children;
}
