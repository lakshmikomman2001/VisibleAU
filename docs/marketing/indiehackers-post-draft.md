# I just launched VisibleAU — AI search visibility for AU SMBs

## What it does

VisibleAU audits how ChatGPT, Claude, Gemini and Perplexity describe your business. You enter your domain, we fire 200 prompts across 4 AI engines, and you get a composite visibility score 0-100 with per-dimension breakdowns (frequency, position, sentiment, context, accuracy).

The Action Center then gives you prioritised recommendations — not generic SEO advice, but specific citations from published research (Princeton GEO, Ahrefs studies, SE Ranking) on what actually moves the needle in AI search.

## Why AU specifically

Australian small businesses — tradies, physios, local SaaS — are quietly anxious about AI replacing Google for many buyer journeys. But every AI visibility tool on the market is US-focused with USD pricing. VisibleAU is built for AU: AUD pricing inclusive of GST, AU-specific vertical prompt packs (we know how Australians search for a plumber differently than Americans), and Sydney-hosted data.

## MRR goal and timeline

- Month 1: 5-10 beta customers, validate PMF
- Month 3: A$3,000 MRR (30 Starter plans)
- Month 6: A$10,000 MRR (mix of Starter + Growth + Agency)
- Pricing: Free tier → Starter A$99/mo → Growth A$299/mo → Agency A$499/mo

## 3 biggest technical challenges

1. **LLM cost control.** 200 API calls per audit could be expensive. Built a 4-layer cost architecture: response caching (70% reduction), canary-based re-query scheduling, tier-based model routing, and regex-first citation detection. Result: ~US$2-3 per audit, 85%+ gross margin.

2. **Statistical scoring.** A single AI response is noisy. We run each prompt 5 times and compute Wilson 95% confidence intervals per dimension. This makes the score meaningful — you can trust the difference between 72 and 65 is real, not noise.

3. **Multi-engine normalisation.** ChatGPT, Claude, Gemini and Perplexity all structure responses differently. Building a unified citation detection layer that works across all 4 was harder than expected.

## Honest early metrics

Beta cohort: TBD (launching to 5-10 friendly customers this sprint). Will update with real numbers.

## What's next

v1.1 (Q3 2026): Microsoft Copilot + Google AI Overviews engines, topical authority gap analyser, competitor battlecards. v1.2: DeepSeek + Grok engines.

## Would you use this for your business?

If you're an AU business owner curious whether AI search engines mention your brand — I'd love to give you a free audit. DM me or try the sample audit at visibleau.com.
