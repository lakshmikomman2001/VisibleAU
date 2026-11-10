/**
 * Vunnara AI Crawler Tracking Snippet
 * Paste this in your site's middleware or server handler.
 * Replace YOUR_BRAND_TOKEN with your brand token from Vunnara settings.
 */
(function () {
  var BRAND_TOKEN = "YOUR_BRAND_TOKEN";
  // The app's own /api/visit on the production site (lib/product.ts SITE_URL; tests/unit/copy/public-urls
  // checks they agree). It named an api. host on the product's old domain, which this app never served.
  var VUNNARA_API = "https://vunnara.com.au/api/visit";

  var AI_AGENTS = [
    "ChatGPT-User",
    "Claude-User",
    "PerplexityBot",
    "Perplexity-User",
    "GPTBot",
    "ClaudeBot",
    "OAI-SearchBot",
    "Google-Extended",
    "CCBot",
  ];

  if (typeof navigator === "undefined" || !navigator.userAgent) return;

  var ua = navigator.userAgent;
  var isAI = AI_AGENTS.some(function (agent) {
    return ua.indexOf(agent) !== -1;
  });

  if (!isAI) return;

  try {
    var payload = JSON.stringify({
      brandToken: BRAND_TOKEN,
      url: window.location.href,
      userAgent: ua,
      referrer: document.referrer || undefined,
      timestamp: new Date().toISOString(),
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon(VUNNARA_API, payload);
    } else {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", VUNNARA_API, true);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.send(payload);
    }
  } catch (e) {
    // Silent fail — don't block the visitor's page
  }
})();
