import { AI_BOTS } from "@/db/seed/ai-bots/seed";

interface BotConfig {
  userAgent: string;
  allow: boolean;
}

export function generateRobotsTxtBlock(overrides?: BotConfig[]): string {
  const lines: string[] = [
    "# === AI Crawler Configuration (VisibleAU) ===",
    "",
  ];

  for (const bot of AI_BOTS) {
    const override = overrides?.find((o) => o.userAgent === bot.userAgent);
    const allow = override?.allow ?? bot.defaultAllow;
    lines.push(`# ${bot.displayName} (${bot.tierLabel})`);
    lines.push(`User-agent: ${bot.userAgent}`);
    lines.push(allow ? "Allow: /" : "Disallow: /");
    lines.push("");
  }

  lines.push("# === End AI Crawler Configuration ===");
  return lines.join("\n");
}
