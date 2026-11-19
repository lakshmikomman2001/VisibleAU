/**
 * The AI crawlers and robots.txt tokens the robots.txt page shows, each with what it's for.
 *
 * 20 Nov (Sri's decision, part 2): every token from OpenAI, Anthropic, Google, Perplexity and Common Crawl has the role
 * its owner's own page gives it (quoted, with the links, in lib/robots-txt/evaluate.ts AI_CRAWLERS_CHECKED). Only the
 * search crawlers count toward the robots.txt score; blocking a training crawler or a control token is the owner's
 * choice. Three names this list carried appear on no page of the company they were credited to, so they're gone:
 * GeminiBot, Gemini-User (Google) and OpenAI-Search (OpenAI). Claude-SearchBot and Googlebot were missing. Crawlers
 * from other companies are shown as "other": what robots.txt says for each, never scored, and no claim about what it's
 * for that we haven't checked. The list used to be credited to Auriti-Labs' reference project.
 */
export type BotRole = "search" | "user" | "training" | "control" | "other";

export const BOT_ROLE_LABELS: Record<BotRole, string> = {
  search: "Search crawler",
  user: "User-triggered agent",
  training: "Training and dataset crawler",
  control: "Control token",
  other: "Other AI crawler",
};

export const AI_BOTS = [
  // Search crawlers: what puts a site in AI answers. The only ones the robots.txt score counts.
  {
    userAgent: "OAI-SearchBot",
    displayName: "OAI-SearchBot",
    role: "search",
    defaultAllow: true,
    description:
      "OpenAI's search crawler: surfaces websites in ChatGPT's search answers. Sites that block it aren't shown there.",
  },
  {
    userAgent: "Claude-SearchBot",
    displayName: "Claude-SearchBot",
    role: "search",
    defaultAllow: true,
    description:
      "Anthropic's search crawler: indexes pages for Claude's search results. Blocking it may reduce your visibility there.",
  },
  {
    userAgent: "PerplexityBot",
    displayName: "PerplexityBot",
    role: "search",
    defaultAllow: true,
    description:
      "Perplexity's search crawler: surfaces and links websites in Perplexity's answers. Not used for training.",
  },
  {
    userAgent: "Googlebot",
    displayName: "Googlebot",
    role: "search",
    defaultAllow: true,
    description:
      "Google Search's crawler. Its rules apply to Google Search and all its features, AI Overviews and AI Mode included.",
  },
  // User-triggered agents: fetch a page when someone asks the assistant. Shown, not scored.
  {
    userAgent: "ChatGPT-User",
    displayName: "ChatGPT-User",
    role: "user",
    defaultAllow: true,
    description:
      "Visits a page when a ChatGPT user asks. OpenAI says robots.txt rules may not apply to it.",
  },
  {
    userAgent: "Claude-User",
    displayName: "Claude-User",
    role: "user",
    defaultAllow: true,
    description:
      "Visits a page when someone asks Claude a question. Anthropic says its bots honour robots.txt.",
  },
  {
    userAgent: "Perplexity-User",
    displayName: "Perplexity-User",
    role: "user",
    defaultAllow: true,
    description:
      "Visits a page when someone asks Perplexity. Perplexity says it generally ignores robots.txt rules.",
  },
  // Training and dataset crawlers: blocking them is the owner's choice, and doesn't keep a site out of AI answers.
  {
    userAgent: "GPTBot",
    displayName: "GPTBot",
    role: "training",
    defaultAllow: true,
    description:
      "Collects pages that may be used to train OpenAI's models. ChatGPT's search uses OAI-SearchBot.",
  },
  {
    userAgent: "ClaudeBot",
    displayName: "ClaudeBot",
    role: "training",
    defaultAllow: true,
    description: "Collects pages that could contribute to training Anthropic's models.",
  },
  {
    userAgent: "CCBot",
    displayName: "CCBot",
    role: "training",
    defaultAllow: true,
    description:
      "Common Crawl's crawler, for its open archive of web pages that anyone can analyse.",
  },
  // Control tokens: a robots.txt setting, not a crawler. Nothing visits as it.
  {
    userAgent: "Google-Extended",
    displayName: "Google-Extended",
    role: "control",
    defaultAllow: true,
    description:
      "Not a crawler: Google's robots.txt setting for whether pages may train Gemini and ground its answers. It doesn't affect Google Search.",
  },
  // Other AI crawlers: their owners' pages aren't checked here, so they're shown and never scored.
  {
    userAgent: "anthropic-ai",
    displayName: "anthropic-ai",
    role: "other",
    defaultAllow: true,
    description: "An older Anthropic name, not on Anthropic's current list of its bots.",
  },
  {
    userAgent: "FacebookBot",
    displayName: "FacebookBot",
    role: "other",
    defaultAllow: false,
    description: "Meta's crawler.",
  },
  {
    userAgent: "Bytespider",
    displayName: "Bytespider",
    role: "other",
    defaultAllow: false,
    description: "ByteDance's crawler.",
  },
  {
    userAgent: "Diffbot",
    displayName: "Diffbot",
    role: "other",
    defaultAllow: false,
    description: "Diffbot's crawler.",
  },
  {
    userAgent: "cohere-ai",
    displayName: "cohere-ai",
    role: "other",
    defaultAllow: false,
    description: "Cohere's crawler.",
  },
  {
    userAgent: "AppleBot-Extended",
    displayName: "Applebot-Extended",
    role: "other",
    defaultAllow: true,
    description: "An Apple robots.txt name.",
  },
  {
    userAgent: "bingbot",
    displayName: "Bingbot",
    role: "other",
    defaultAllow: true,
    description: "Microsoft Bing's crawler.",
  },
  {
    userAgent: "YouBot",
    displayName: "YouBot",
    role: "other",
    defaultAllow: true,
    description: "You.com's crawler.",
  },
  {
    userAgent: "Amazonbot",
    displayName: "Amazonbot",
    role: "other",
    defaultAllow: false,
    description: "Amazon's crawler.",
  },
  {
    userAgent: "Applebot",
    displayName: "Applebot",
    role: "other",
    defaultAllow: true,
    description: "Apple's crawler.",
  },
  {
    userAgent: "DuckAssistBot",
    displayName: "DuckAssistBot",
    role: "other",
    defaultAllow: true,
    description: "DuckDuckGo's crawler.",
  },
  {
    userAgent: "AndiBot",
    displayName: "AndiBot",
    role: "other",
    defaultAllow: false,
    description: "Andi's crawler.",
  },
  {
    userAgent: "Bingbot-AI-Tool",
    displayName: "Bingbot AI Tool",
    role: "other",
    defaultAllow: true,
    description: "A name some robots.txt files use.",
  },
  {
    userAgent: "Cotoyogi",
    displayName: "Cotoyogi",
    role: "other",
    defaultAllow: false,
    description: "Cotoyogi's crawler.",
  },
  {
    userAgent: "PetalBot",
    displayName: "PetalBot",
    role: "other",
    defaultAllow: false,
    description: "Petal Search's crawler.",
  },
] as const satisfies ReadonlyArray<{
  userAgent: string;
  displayName: string;
  role: BotRole;
  defaultAllow: boolean;
  description: string;
}>;
