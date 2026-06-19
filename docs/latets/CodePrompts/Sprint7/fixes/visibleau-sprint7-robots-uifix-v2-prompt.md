# VisibleAU — Sprint 7 UI Fix (round 2): robots.txt — generated snippet completeness
# Page: /brands/[brandId]/technical/robots
# Source: re-validation vs prototype RobotsTxtCrawlerConfig (lines 3011–3092).
# Paste everything below the line into a fresh Claude Code session on the VisibleAU repo.

---

> You are applying one follow-up fix to the **robots.txt + AI crawlers** sub-page. Round 1 landed
> correctly (Auriti-Labs badge, per-tier 9/9 counts, title/subtitle/breadcrumb, the generated-snippet
> card) — **keep all of it.** Presentation/output only — no schema, migration, or scoring changes.
>
> ### FIX 1 — [LOW-MOD] Generated robots.txt must represent all 27 bots, and the download must be complete
> **Where:** the "Generated robots.txt (AI-crawler-friendly)" card and the Copy/Download handlers.
> **Problem:** the snippet header reads `# Allow training + search + user AI crawlers (27 bots
> tracked)`, but the body lists only **5** `Allow` entries (GPTBot, ClaudeBot, anthropic-ai,
> Google-Extended, CCBot) before the `Sitemap:` / `LLM-Content:` lines, with no indication that more
> exist. So the preview reads as though only 5 bots are allowed — contradicting the "27 bots tracked"
> header. (The prototype included a `# ... 21 more entries ...` comment to signal truncation.)
> **Fix (prefer the first option):**
> - **Render an `Allow` block for every allowed bot** (all non-blocked bots across the 3 tiers) in
>   the preview, so it is the actual file; **or**
> - keep a short sample and append a truncation comment — `# ... {N} more entries ...` where
>   `N = allowedBots − shown` — matching the prototype, so the preview clearly stands for all 27.
>
> **AND — critical:** confirm the **Copy to clipboard** and **Download** output is the COMPLETE
> robots.txt — every allowed bot's `User-agent` / `Allow: /` block plus the `Sitemap:` and
> `LLM-Content:` lines — **not** just the five shown in the preview. If the download currently emits
> only the previewed sample, fix the generator to emit all allowed bots. The deployed file is the
> actual deliverable of this page, so it must be complete.
>
> **Blocked bots:** any bot that is blocked must be **excluded** from the `Allow` list (and the
> per-tier count / preview must reflect that). For an all-allowed brand like this fixture, all 27
> appear; for a brand with blocks, the blocked ones are omitted from the generated file.
>
> ---
> **Verification (run before reporting done):**
> - The preview either lists all allowed bots or ends the sample with a `# ... {N} more entries ...`
>   note; the "27 bots tracked" header is no longer contradicted by a 5-entry body.
> - **Count check:** Copy and Download produce a file whose `Allow:` entry count equals the number of
>   allowed bots (27 for this fixture). Paste/open and count.
> - With one bot set to disallowed in test data, that bot is absent from the generated file and the
>   tier count drops accordingly.
> - Both themes; no console errors; TS strict, no `any`; design tokens only; page tier unchanged.
>
> Report the files changed and confirm the fix + the count check.

---

## Notes for Sri (not part of the paste)
- Everything else on the page is now correct — this is the only remaining item, and the part that
  actually matters is whether the **download** is complete (5 entries would ship a file that only
  explicitly allows 5 of the 27 bots; the others would still be allowed-by-default, but it undersells
  the feature and contradicts the header). The fix makes both the preview and the file complete.
- Carry-over confirm (no fix needed yet): the red "Blocked" per-bot state isn't exercised by this
  all-allowed data — worth one test with a bot disallowed.
- After this, **D5 robots.txt is done.** Remaining sub-pages: D1 llms.txt, D2 Schema auditor, D3 SSR,
  D4 Answer capsules, D6 Brand & Entity, D7 citability — send whichever is next.
