# VisibleAU — Sprint 7 UI Fix: robots.txt + AI crawlers sub-page (D5)
# Page: /brands/[brandId]/technical/robots  (component built from prototype RobotsTxtCrawlerConfig)
# Source: Sprint 7 Gate-2 sub-page validation vs prototype `visibleau-prototype.jsx` lines 3011–3092.
# Paste everything below the line into a fresh Claude Code session on the VisibleAU repo.

---

> You are fixing the **robots.txt + AI crawlers** sub-page of the Technical Audit
> (`app/(auth)/brands/[brandId]/technical/robots/...`). Authority: the prototype
> `RobotsTxtCrawlerConfig` (lines 3011–3092) and Sprint 7 spec §16. **The 27-bot taxonomy across the
> 3 tiers (Training / Search-AI / User-agent, 9 each) is already correct — do NOT change the bot list,
> the tiers, or the scoring.** These are presentation gaps against the prototype. Presentation only —
> no schema, migration, or scoring changes.
>
> ### FIX 1 — [MOD] Add the Auriti-Labs (MIT) attribution badge
> **Where:** the bots section header (top of the tiers area).
> **Problem:** the prototype shows `<Badge tone="info">Reference: Auriti-Labs (MIT)</Badge>` on the
> "27 AI bots tracked across 3 tiers" card. Sprint 7 §16 **requires** this attribution. It is missing
> on the built page.
> **Fix:** add the `Reference: Auriti-Labs (MIT)` badge (info tone) at the top of the bots section,
> beside a header like "27 AI bots tracked across 3 tiers".
>
> ### FIX 2 — [MOD] Add a per-tier allowed count (X/9), red when any are blocked
> **Where:** each tier section header (or a compact summary above the list).
> **Problem:** the prototype's headline element is a per-tier count — allowed/total (e.g. **7/9**),
> rendered in `var(--accent-red)` when any bots are blocked (`var(--accent-green)` when all allowed),
> with a sub-label "All allowed" / "{n} blocked". The build shows only "(9 bots)" — the bot count, not
> the allowed/blocked rollup — so a tier with blocked bots wouldn't stand out.
> **Fix:** for each tier, compute `allowed = total − blocked` and show **`{allowed}/{total}`** in the
> tier header (e.g. "Tier 1 — Training · 9/9 allowed"), coloured green when `blocked === 0` and **red**
> when `blocked > 0`, with the "All allowed / {n} blocked" sub-label. Keep the per-bot rows below it.
>
> ### FIX 3 — [LOW-MOD] Restore the title / subtitle / breadcrumb framing
> **Where:** the page header.
> **Problem:** the build uses title "Robots.txt AI Configuration", subtitle "robots.txt found · Score:
> 18/18", breadcrumb leaf "Robots.txt" — which drops the page's core value prop (CDN-level block
> detection).
> **Fix:**
> - Title → **"robots.txt + AI crawler configuration"**
> - Subtitle → **"Detect which of the 27 known AI bots can access your site. Catch CDN-level blocks
>   (Cloudflare, Akamai, Vercel) that silently break AI visibility."**
> - Breadcrumb leaf → **"robots.txt + AI crawlers"**
> (You may keep the "18/18" score in the header — it's a useful addition and not a conflict. But the
> subtitle must carry the CDN-block-detection framing, not just the score.)
>
> ### FIX 4 — [MOD] Ensure the generated robots.txt snippet card is present
> **Where:** below the three tier sections.
> **Problem:** the prototype ends with a **"Generated robots.txt (AI-crawler-friendly)"** card — a mono
> `<pre>` listing `User-agent: <bot>` / `Allow: /` blocks for the tracked bots plus
> `Sitemap:` and `LLM-Content:` lines — with **Copy to clipboard** and **Download** buttons. This is
> the actionable output of the page.
> **Fix:** confirm this card renders below Tier 3. If it is missing, add it: a `var(--font-mono)`
> `<pre>` on `var(--bg-subtle)` with the generated rules (Allow entries for the allowed bots, the
> Sitemap line, the `LLM-Content: https://<domain>/llms.txt` line) + Copy and Download buttons.
>
> ---
> **Verification (run before reporting done):**
> - The `Reference: Auriti-Labs (MIT)` badge is visible at the top of the bots section.
> - Each tier header shows `{allowed}/{total}` — green when all allowed, **red** when any blocked.
> - **Blocked state:** set one bot to disallowed in test data and confirm it renders a **red
>   "Blocked"** badge (the current Allowed/Default scale must also have a Blocked state), and that its
>   tier count goes red and the sub-label reads "1 blocked".
> - The subtitle mentions the 27 bots and CDN-level block detection; breadcrumb leaf is "robots.txt +
>   AI crawlers".
> - The generated robots.txt snippet card with Copy + Download renders below the tiers.
> - Both themes; no console errors; TS strict, no `any`; design tokens only.
>
> Report the files changed and confirm each fix + the verification.
>
> ---
> **Optional — exact-prototype layout (only if Sri asks):** the prototype shows the bots as a compact
> 3-column tier *summary* (one column per tier: tier name + the `{allowed}/{total}` count + "All
> allowed / N blocked"), NOT a per-bot list. The current build's per-bot list is an acceptable
> enhancement; FIXES 1–4 keep it. If an exact prototype match is wanted instead, replace the per-bot
> list with that compact 3-column summary card and drop the per-row badges.

---

## Notes for Sri (not part of the paste)
- The bot taxonomy is spot-on — these fixes are about the *framing* the prototype provides: the §16
  attribution, the per-tier allowed/blocked rollup, the CDN-block value prop, and the generated
  snippet (which may already be below the fold in your screenshots — FIX 4 just confirms it).
- The verbose per-bot list vs the prototype's compact summary is your design call; I kept the list in
  the prompt and noted the exact-match alternative at the bottom.
- Next sub-pages still to validate: D1 llms.txt, D2 Schema auditor, D3 SSR, D4 Answer capsules,
  D6 Brand & Entity, D7 citability. Send whichever is next and I'll validate + (if needed) fix-prompt.
