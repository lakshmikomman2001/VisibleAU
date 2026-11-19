# Privacy policy: the full factual picture (draft)

> **Draft, not legal advice; to be reviewed before publishing.** Not linked from the site. Written from the code on
> 20 November 2026 for Sri to have reviewed by someone qualified. Each statement names the file it comes from. Where
> the code or the repository can't show something (a signed agreement, a provider's own region or retention), it says
> so instead of guessing.

The live page is `app/(marketing)/privacy/page.tsx`. Its sentences about what is sent and kept come from
`lib/legal/data-facts.ts` and `lib/marketing/google-ai.ts`, which the landing page's FAQ reads too, so the two can't
drift. This draft covers more than the live page does: every processor, what each receives, and how long each kind of
data is kept.

## 1. What we collect

| Data | When | Where it's kept | Source |
|---|---|---|---|
| Email address, name, password hash, sessions | Sign-up and sign-in | Neon (Postgres), better-auth's tables | `lib/auth/server.ts` |
| Workspace name, members and their roles | Sign-up, invites | Neon | `lib/auth/server.ts`, `lib/auth/invite.ts` |
| A business's name, website address, kind of business, area served, confirmed location (suburb, city, state, postcode) | Adding a business | Neon `brands` | `app/api/brands/route.ts` |
| The questions an audit asks and the answers it gets back (full text), the sources an answer cites, the model, cost and tokens | Each audit | Neon `citations`, `audits` | `lib/audit/run-audit-inline.ts` |
| An evidence archive: the first 500 characters of each answer, with its question | Each audit | Neon `evidence_snapshots` | `lib/trust/evidence-archiver.ts`, `lib/audit/response-snippet.ts` |
| Google's AI Overviews and AI Mode results for an audit's questions | Each audit on a plan that has them, while the global setting is on | Neon `google_surface_results` | `lib/audit/google-surfaces/` |
| A technical audit of the business's website (robots.txt, llms.txt, schema, meta tags, page text) | Each technical audit | Neon `technical_audits` | `lib/technical-audit/orchestrate.ts` |
| PDF reports | When a report is made | Supabase Storage, bucket `reports` (private) | `inngest/functions/render-report-pdf.ts` |
| Report logos | When uploaded | Supabase Storage, bucket `logos` (private) | `lib/branding/logo.ts` |
| AI crawlers' visits from uploaded server logs: the crawler, the page, the time, the response code, the size, the IP address it came from | Each log upload | Neon `crawler_visit_logs` | `inngest/functions/parse-crawler-log.ts` |
| The uploaded log file itself, every line | Each log upload, until it's parsed | From part 5 of this change: Supabase Storage, bucket `crawler-logs` (private), deleted once parsed. Before it: inside the Inngest event | `app/api/brands/[brandId]/crawler-logs/upload/route.ts` |
| A free sample audit's website address, kind of business and suburb, its questions and answers | The home page's free sample audit (no sign-up) | Neon, in a system workspace with no members | `lib/sample-audit/run.ts` |
| A sample visitor's IP address, as a rate-limit key | The free sample audit | Upstash Redis (the raw address), or Neon `rate_limit_counters` (a salted hash) when Redis isn't configured | `lib/sample-audit/rate-limit.ts`, `lib/governance/pg-rate-limit.ts` |
| An IP address, with its count of sign-in, sign-up, password and email attempts | Those requests | Neon (better-auth's rate-limit table) | `lib/auth/rate-limit-rules.ts` |
| Page views (the full URL, query string included) and the PostHog defaults (autocapture) | Browsing the site | PostHog | `components/providers/posthog-provider.tsx`, `components/analytics/posthog-page-view.tsx` |
| Error reports | When something fails | Sentry | `sentry.server.config.ts`, `sentry.client.config.ts`, `sentry.edge.config.ts` |
| Payment details | Checkout | Stripe (we never see the card) | `lib/stripe/checkout.ts` |

## 2. Who processes it

"Region" is what the code or its configuration sets. A region that is only a label in our own code (shown on the Data
Residency page) is marked as such; it is not a setting that puts data there.

| Processor | What it receives | Region | Source |
|---|---|---|---|
| Neon (Postgres) | Everything in section 1 that's kept in Neon | Label only: "AWS ap-southeast-2 (Sydney)" (`NEON_REGION`, `lib/governance/residency-config.ts:6`). Not set in config; `docs/ops/neon-vercel-deploy-runbook.md:24` says ap-southeast-2 | `db/client.ts` (`DATABASE_URL`) |
| Vercel | Every request and response; the app's server code runs there | `vercel.json` `"regions": ["syd1"]` for functions. The middleware runs on Vercel's global network (`app/(auth)/settings/data-residency/page.tsx`) | `vercel.json`, `next.config.ts` |
| Supabase Storage | PDF reports, logos, and (from part 5) uploaded log files until they're parsed | Label only: "AWS ap-southeast-2 (Sydney)" (`SUPABASE_STORAGE_REGION`, `residency-config.ts:7`). Not set in config. Sri's notes say production's PDFs are in a Sydney project | `lib/supabase.ts`, `lib/storage/` |
| Resend | The recipient's address, the subject and the body of each email: password resets, verification, invites, audit-complete, scheduled reports, alerts, the weekly digest | Not set in config | `lib/email/send.ts` |
| Inngest | Event payloads and each step's saved output for background jobs: audit ids, brand ids, counts; parsed crawler visits (with the crawlers' IP addresses); and, before part 5, every line of an uploaded log file | Not set in config | `lib/inngest/client.ts` |
| Sentry | Error reports and 10% of traces (server, edge, browser); browser session replays (1% of sessions, every session with an error) | Not set in config | `sentry.*.config.ts` |
| PostHog | Page views with the full URL, and autocaptured clicks and inputs (the SDK's defaults) | Host `https://app.posthog.com` by default (`NEXT_PUBLIC_POSTHOG_HOST` otherwise); its region isn't set in our config | `components/providers/posthog-provider.tsx` |
| Upstash Redis | The free sample audit's rate-limit keys (raw IP addresses), and the public badge's (`badge:<address>`) | Not set in config. `prod-fixes/prompts/addendum-function-region-syd1.md` says syd1 | `lib/sample-audit/rate-limit.ts`, `app/api/badge/route.ts` |
| Stripe | The payer's email, the workspace's id (and a brand's, for a one-off audit) | Not set in config | `lib/stripe/checkout.ts`, `lib/stripe/portal.ts` |
| OpenAI (ChatGPT) | An audit's questions; a confirmed location's city and state for ChatGPT's web search | Label only: "US" (`residency-config.ts`) | `lib/llm/openai-impl.ts`, `lib/brands/region-label.ts` |
| Anthropic (Claude) | An audit's questions and the confirmed city and state, as for OpenAI; and, when a business is added, its name, website address and home page's title, description and main heading, to work out what kind of business it is | Label only: "US" | `lib/llm/anthropic-impl.ts`, `lib/brands/classify-brand.ts` |
| Google (Gemini) | An audit's questions | Label only: "US" | `lib/llm/google-impl.ts` |
| Perplexity | An audit's questions | Label only: "US" | `lib/llm/perplexity-impl.ts` |
| DataForSEO (DataForSEO OÜ, Estonia) | An audit's questions, the Google location each is checked from (the postcode where Google supports it, otherwise the suburb, city or state capital) and the language; it asks Google for us, logged out | DataForSEO doesn't say where it processes data; the processors it lists are in the United States and Germany (`residency-config.ts:57-67`) | `lib/serp/dataforseo.ts:77-79` |
| DNS resolvers and Team Cymru | The IP address of each uploaded AI-crawler visit, to check it's really that company's crawler (reverse and forward DNS, and an ASN lookup at `origin.asn.cymru.com`) | Not set in config | `lib/agent-analytics/verify-crawler-hits.ts` |

**Data processing agreements.** No signed agreement with any of these processors is in the repository or its docs.
The live page said "We use these services under their respective data processing agreements"; from 20 November it
doesn't. The Data Residency page's "Data Processing Agreement" heading (`app/(auth)/settings/data-residency/page.tsx`)
is a description, not an agreement. If agreements are signed (most of these providers offer one to accept online),
list them here with their dates.

## 3. How long each kind of data is kept

| Data | Kept | Source |
|---|---|---|
| An audit's results: questions, answers, citations, failed engine calls, drift alerts, exports, open and dismissed actions, Google's results, technical audits | 12 months after the audit ran, then deleted by a weekly job (Sundays 04:00 UTC); sooner if asked | `lib/retention/audit-retention.ts`, `inngest/functions/audit-data-retention.ts` (`AUDIT_DATA_RETENTION_MONTHS`) |
| PDF reports and their files; the evidence archive; actions someone has started or finished | Until the workspace asks us to delete them; no job deletes them | `lib/legal/data-facts.ts` `KEPT_UNTIL_YOU_ASK` |
| AI crawlers' visits from uploaded logs | 90 days after the visit | `CRAWLER_LOG_RETENTION_DAYS` |
| The uploaded log file | From part 5: deleted once it's parsed, or when parsing fails for the last time. Before part 5: in Inngest's event store for its own period (Inngest's limits page lists trace and log history of 24 hours on Free, 7 days on Pro, 14 days on Business, up to 365 days on Enterprise: https://www.inngest.com/docs/usage-limits/inngest; which plan this account is on isn't in the repository) | `inngest/functions/parse-crawler-log.ts` |
| AI referral visits | 90 days | `AI_REFERRAL_HIT_RETENTION_DAYS` |
| Cached AI answers (reused for identical questions) | Reused for 24 hours (48 for memory-only answers), then deleted by the weekly job | `ANSWER_CACHE_REUSE_HOURS` |
| A free sample audit's brand (the visitor's website address and suburb), audit, questions and answers | 24 hours after its audit, by a daily clean-up (03:00 UTC), brand row included once it has no audit left (`SAMPLE_AUDIT_RETENTION_HOURS`). A brand that a monthly job had written a YouTube row for couldn't be deleted (a foreign key); part 9 of this change fixes that | `inngest/functions/sample-audit-cleanup.ts` |
| Sample rate-limit counters (hashed IP, when Redis isn't configured) | 2 days | `SAMPLE_RATE_LIMIT_COUNTER_RETENTION_DAYS` |
| Sign-in rate-limit counts (IP address) | 24 hours after the last attempt | `AUTH_RATE_LIMIT_RETENTION_HOURS` |
| DataForSEO's own copy of the questions and results | 12 months, by DataForSEO's terms | `DATAFORSEO_TASK_RETENTION_MONTHS` |
| Accounts, workspaces, businesses | Until deleted; closing a workspace doesn't delete its data | `lib/auth/server.ts` |
| Emails at Resend, events at Inngest, errors at Sentry, analytics at PostHog | By each provider's own retention; none is set in our config | — |

## 4. Error reports and analytics: what's configured to keep personal information out

**Sentry** (`sentry.server.config.ts`, `sentry.client.config.ts`, `sentry.edge.config.ts`):
- `sendDefaultPii` isn't set, so the SDK's default applies.
- Server: `beforeSend` deletes `event.user.email`, `ip_address` and `username`, replaces `domain=...` in the request URL
  with `domain=[REDACTED]`, and deletes `extra.brandName`, `extra.domain` and `extra.organizationId`. It doesn't touch
  the request body, headers, cookies, other query strings or breadcrumbs. `Sentry.httpIntegration()` is used with its
  defaults; in @sentry/node 10.x `maxIncomingRequestBodySize` defaults to "medium", which attaches up to 10 KB of an
  incoming request's body to an error event (a log upload's first lines, before part 5's change, could be among them).
- Browser: `beforeSend` deletes `event.user.email` and `ip_address`. Session replay: `maskAllText: true`,
  `blockAllMedia: false`, `maskAllInputs` not set; 1% of sessions and every session with an error.
- Edge: no `beforeSend` scrubbing.
- There's no `instrumentation-client.ts`, and `instrumentation.ts` loads only the server and edge configs, so under
  Next 16 the browser config (and its replays) may not load at all: worth checking in Sentry before describing it.

**PostHog** (`components/providers/posthog-provider.tsx`):
- `capture_pageview: false` (page views are sent by `components/analytics/posthog-page-view.tsx`, with the full URL and
  query string); `persistence: "localStorage+cookie"`.
- Not set: `person_profiles`, `autocapture` (on by default), session recording, input masking, IP handling. Those follow
  the PostHog project's own settings.
- Consent: PostHog starts on page load, before the cookie banner is answered. Only "Decline" stops it
  (`posthog.opt_out_capturing()`, `components/domain/shared/cookie-consent-banner.tsx`); "Accept" only remembers the
  answer.
- No `identify` call: page views aren't tied to an account by our code.

## 5. To decide before publishing

1. Whether to list each processor by name on the live page (it names the four AI providers, Stripe and DataForSEO).
2. Whether to accept each provider's data processing agreement, and then say so.
3. PostHog before consent: start it only after "Accept", or say plainly that analytics run until "Decline".
4. Sentry: strip request bodies (`maxIncomingRequestBodySize: "none"`) and add the edge scrubbing, or describe them.
5. The AI providers' "United States": a label in `residency-config.ts`, true as far as their API terms go, but not
   something our configuration sets.
6. Where data is stored: the live page doesn't say; Neon and Supabase are labelled Sydney in our code, and functions run
   in syd1.
