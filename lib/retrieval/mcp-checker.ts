import { CRAWLER_USER_AGENT } from "@/lib/product";

export interface McpCheckResult {
  mcpEndpointPresent: boolean;
  mcpEndpointValid: boolean;
  mcpToolsCount: number;
}

export async function checkMcpEndpoint(domain: string): Promise<McpCheckResult> {
  const urls = [`https://${domain}/mcp.json`, `https://${domain}/.well-known/mcp`];

  for (const url of urls) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, {
        signal: controller.signal,
        // Follow-ups from af8de42..d1eb5a1, part 2: the one user agent every check sends (it was the old name's
        // "VisibleAU-MCP-Check/1.0").
        headers: { "User-Agent": CRAWLER_USER_AGENT },
      });
      clearTimeout(timer);

      if (!res.ok) continue;

      const text = await res.text();
      try {
        const json = JSON.parse(text);
        const tools = Array.isArray(json.tools) ? json.tools.length : 0;
        return {
          mcpEndpointPresent: true,
          mcpEndpointValid: true,
          mcpToolsCount: tools,
        };
      } catch {
        return {
          mcpEndpointPresent: true,
          mcpEndpointValid: false,
          mcpToolsCount: 0,
        };
      }
    } catch {}
  }

  return {
    mcpEndpointPresent: false,
    mcpEndpointValid: false,
    mcpToolsCount: 0,
  };
}
