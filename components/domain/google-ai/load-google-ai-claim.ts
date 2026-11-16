import { connection } from "next/server";
import { publicGoogleAi } from "@/lib/governance/google-surfaces";
import { googleSurfacesCanRun } from "@/lib/governance/google-surfaces-env";
import type { PublicGoogleAi } from "@/lib/marketing/google-ai";

/**
 * 16 Nov (Sri: Google's AI answers on for Growth and up, and said so on the public pages only while it's true) -- how a
 * public page learns what it may say, at request time. With the env switch off or no credentials it's null at once
 * and the page stays static: changing either takes a redeploy, which rebuilds it. Otherwise the page renders per
 * request (connection()), so the global setting on /admin/settings is read as an audit reads it, and switching it off
 * takes the claim off the next page load -- never a prerendered claim left behind.
 * tests/unit/google-surfaces/public-google-claims.test.ts: every public page that says anything about Google's AI
 * answers gets it from here, through components/domain/google-ai/google-ai-claim.tsx.
 */
export async function loadGoogleAiClaim(): Promise<PublicGoogleAi | null> {
  if (!googleSurfacesCanRun()) return null;
  await connection();
  return publicGoogleAi();
}
