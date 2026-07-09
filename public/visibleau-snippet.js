/**
 * VisibleAU AI Crawler Tracking Snippet
 * Paste this in your site's middleware or server handler.
 * Replace YOUR_BRAND_TOKEN with your brand token from VisibleAU settings.
 */
(function () {
  var BRAND_TOKEN = "YOUR_BRAND_TOKEN";
  var VISIBLEAU_API = "https://api.visibleau.com.au/api/visit";

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
      navigator.sendBeacon(VISIBLEAU_API, payload);
    } else {
      var xhr = new XMLHttpRequest();
      xhr.open("POST", VISIBLEAU_API, true);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.send(payload);
    }
  } catch (e) {
    // Silent fail — don't block the visitor's page
  }
})();
