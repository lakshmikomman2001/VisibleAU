import {
  combineOutcomes,
  type FetchOutcome,
  outcomeForError,
  outcomeForStatus,
} from "@/lib/crawler/fetch-outcome";
import { guardedFetch } from "@/lib/fetch/guarded-fetch";
import { CRAWLER_USER_AGENT } from "@/lib/product";

/** S00B part 3 (inventory F9): a manifest's size bound (none before). */
export const MCP_MANIFEST_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Leftovers task, part 3 (17 Nov): present true (a manifest answered), false (both places said 404 or 410), or null
 * (couldn't check: a timeout, no answer, a 403/429 or 5xx at a place that didn't say "absent"), with why in
 * mcpCheckFailure. Any failed request was "absent" -- "MCP: absent" and the gap "No MCP endpoint found".
 */
export interface McpCheckResult {
  mcpEndpointPresent: boolean | null;
  mcpEndpointValid: boolean | null;
  mcpToolsCount: number;
  mcpCheckFailure?: string;
}

export async function checkMcpEndpoint(domain: string): Promise<McpCheckResult> {
  const urls = [`https://${domain}/mcp.json`, `https://${domain}/.well-known/mcp`];
  const outcomes: FetchOutcome[] = [];

  for (const url of urls) {
    try {
      // S00B part 3: through the guarded fetcher (an internal address is refused: "couldn't check" below), with its
      // own options as before: our user agent, 5 s.
      const res = await guardedFetch(url, {
        timeoutMs: 5000,
        maxBytes: MCP_MANIFEST_MAX_BYTES,
        // Follow-ups from af8de42..d1eb5a1, part 2: the one user agent every check sends (it was the old name's
        // "VisibleAU-MCP-Check/1.0").
        headers: { "User-Agent": CRAWLER_USER_AGENT },
      });

      if (!res.ok) {
        outcomes.push(outcomeForStatus(res.status));
        continue;
      }

      const text = await res.text();
      try {
        const json = JSON.parse(text);
        const tools = Array.isArray(json.tools) ? json.tools.length : 0;
        return { mcpEndpointPresent: true, mcpEndpointValid: true, mcpToolsCount: tools };
      } catch {
        return { mcpEndpointPresent: true, mcpEndpointValid: false, mcpToolsCount: 0 };
      }
    } catch (err) {
      outcomes.push(outcomeForError(err));
    }
  }

  const outcome = combineOutcomes(outcomes);
  if (outcome.state === "unchecked") {
    return {
      mcpEndpointPresent: null,
      mcpEndpointValid: null,
      mcpToolsCount: 0,
      mcpCheckFailure: outcome.reason,
    };
  }
  return { mcpEndpointPresent: false, mcpEndpointValid: false, mcpToolsCount: 0 };
}
