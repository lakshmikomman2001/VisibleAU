import { AI_BOTS, BOT_ROLE_LABELS } from "@/db/seed/ai-bots/seed";
import { PRODUCT_NAME } from "@/lib/product";

interface BotConfig {
  userAgent: string;
  allow: boolean;
}

export function generateRobotsTxtBlock(overrides?: BotConfig[]): string {
  const lines: string[] = [`# === AI Crawler Configuration (${PRODUCT_NAME}) ===`, ""];

  for (const bot of AI_BOTS) {
    const override = overrides?.find((o) => o.userAgent === bot.userAgent);
    const allow = override?.allow ?? bot.defaultAllow;
    lines.push(`# ${bot.displayName} (${BOT_ROLE_LABELS[bot.role]})`);
    lines.push(`User-agent: ${bot.userAgent}`);
    lines.push(allow ? "Allow: /" : "Disallow: /");
    lines.push("");
  }

  lines.push("# === End AI Crawler Configuration ===");
  return lines.join("\n");
}
