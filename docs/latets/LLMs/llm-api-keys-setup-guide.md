# VisibleAU — LLM API Keys Setup Guide (June 2026)

Four keys to obtain, one per engine. Set each into `.env.local` (gitignored — see Security).

| Engine | Provider | Env var | Key prefix |
|---|---|---|---|
| ChatGPT | OpenAI | `OPENAI_API_KEY` | `sk-proj-…` |
| Claude | Anthropic | `ANTHROPIC_API_KEY` | `sk-ant-…` |
| Gemini | Google AI Studio | `GOOGLE_AI_API_KEY` | `AIza…` |
| Perplexity | Perplexity | `PERPLEXITY_API_KEY` | `pplx-…` |

---

## Read first — 3 things true for all four

1. **The API is separate from the consumer subscription.** ChatGPT Plus, Claude Pro, and Perplexity Pro do **not** include API access. API usage is billed separately, per token. Having a Plus/Pro plan doesn't help here.
2. **A payment method is required to actually use them** (only Gemini has a usable free tier — see below). The keys themselves are free to create; the *calls* cost money.
3. **Each key is shown only once.** Copy it the moment it's generated. If you lose it, revoke and regenerate.

---

## 1. OpenAI — ChatGPT engine → `OPENAI_API_KEY`

1. Go to **platform.openai.com** and sign up / sign in (email, or Google/Microsoft/Apple SSO — same login as ChatGPT, but billing is separate).
2. Verify your **email and phone number** (SMS) — OpenAI requires phone verification.
3. **Add billing/credit:** platform.openai.com/settings/organization/billing/overview → *Add to credit balance* → add a card → add credit (**$5 minimum**; no free trial credits in 2026). Optionally enable **auto-recharge** so you don't hit 429 errors at zero balance.
4. **Set a budget cap + alert:** Settings → Organization → *Limits*. Set a monthly budget (e.g. US$10) and an email alert.
5. **Create the key:** platform.openai.com/api-keys → *Create new secret key* → name it `visibleau-dev` → **copy immediately**.
6. Put it in `.env.local` as `OPENAI_API_KEY=sk-proj-…`

---

## 2. Anthropic — Claude engine → `ANTHROPIC_API_KEY`

1. Go to **console.anthropic.com** — this is the developer Console. **Not** claude.ai (that's the consumer chat app; keys/billing don't live there). Sign up / sign in (email or Google SSO).
2. **Add billing:** Settings → *Billing* → add a card. Pay-as-you-go (no subscription needed). New accounts sometimes get a small one-time credit; there's no ongoing free tier.
3. **Set a spending limit:** Anthropic lets you set a hard cap **per key** as well as a monthly limit. Set ~US$10–25 for a dev key.
4. **Create the key:** Settings → *API Keys* → *Create Key* → name it `visibleau-dev` → **copy immediately**.
5. Put it in `.env.local` as `ANTHROPIC_API_KEY=sk-ant-…`

---

## 3. Google — Gemini engine → `GOOGLE_AI_API_KEY`

1. Go to **aistudio.google.com** and sign in with your Google account. Accept the *Generative AI Additional Terms* and confirm your region (Australia is supported).
2. **Create the key:** aistudio.google.com/api-keys → *Create API key*. It creates or links a Google Cloud project automatically → **copy the key**.
3. **Free tier works immediately** — Gemini Flash is roughly 10 requests/min, ~250–500/day on the free tier. That's enough for the one-time validation run. For higher limits or Pro models, enable billing on the linked Cloud project (AI Studio → *Usage & Billing*; paid accounts have a mandatory monthly cap). Note: a new account's $300 Google Cloud welcome credit does **not** apply to Gemini API usage.
4. **⚠ Restrict the key (do this — there's a deadline):** new keys are unrestricted by default, and **from 19 June 2026 the Gemini API blocks unrestricted keys.** Go to console.cloud.google.com/apis/credentials → select your key → restrict it to the **Generative Language API**. Also set a billing budget alert there.
5. Put it in `.env.local` as `GOOGLE_AI_API_KEY=AIza…`

---

## 4. Perplexity — Perplexity engine → `PERPLEXITY_API_KEY`

1. Go to **perplexity.ai** and sign in. Click your **profile picture (top-right) → Settings → API** tab (the API dashboard). A Perplexity Pro plan does *not* include API credits.
2. **Add a payment method + buy credits — required.** Perplexity has **no free tier**: a Free plan gives zero API credits, and you must load prepaid credits before you can generate a key. Set a **monthly spending cap** while you're here.
3. **Generate the key:** API section → *Generate* / *Create key* → name it `visibleau-dev` → **copy immediately**.
4. Put it in `.env.local` as `PERPLEXITY_API_KEY=pplx-…`
   *(Your app calls Perplexity through an OpenAI-compatible endpoint, but the key is still this `pplx-` key.)*

---

## Security — do not skip

- **Never commit keys.** All four go in **`.env.local`**, and `.env.local` must be in **`.gitignore`**. Never hardcode a key in source, never put one in a committed `.env`. A leaked key means someone runs up *your* bill — scrapers actively crawl public repos for keys (a developer lost US$82,000 to a single leaked Gemini key in Feb 2026). Quick check: `git check-ignore .env.local` should print the path; `git grep -i "sk-ant-\|sk-proj-\|pplx-\|AIza"` should find nothing in committed files.
- **Set a spend cap on every provider.** OpenAI budget limit, Anthropic per-key cap, Gemini Cloud budget alert, Perplexity monthly cap. This is your safety net against a runaway loop or a retry bug — set them *before* you run anything.
- **Restrict the Gemini key** to the Generative Language API (and beat the 19 June 2026 deadline).
- **One key per environment** later: a separate `visibleau-prod` key when you deploy, so you can revoke one without breaking the other.

---

## Cost expectation

Starting balances: Gemini = free tier; OpenAI ≈ $5 prepaid minimum; Perplexity = small prepaid; Anthropic = card on file. Your one-time validation audit (~US$2) just draws down these balances — the minimum top-ups aren't extra cost, they're prepaid credit you'll use over time. Keep dev on mock mode (free) and only spend when you deliberately run real.

---

## When all four are in `.env.local`

Set `LLM_MODE` to the real value, make sure local Postgres + `npm run dev` + the Inngest dev server are running, then run one audit on a real brand and one on the fake test brand to validate. Then switch `LLM_MODE` back to mock for continued development.
