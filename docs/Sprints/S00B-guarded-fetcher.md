# S00B — Security: one guarded fetch path for customer websites

> **Before Part 1:** follow `docs/lld/CLAUDE-CODE-RUNBOOK.md` (read order, pre-flight, rules, stop points). At the end, save your report-back to `docs/Sprints/reports/S00B-report.md` and commit it as the last commit.

Start with `git fetch origin` and build on `origin/main` (S00 pushed); say which hash. Read LLD section 0 (D-SEC1 and amendment 19), 8.6.2 (guarded fetcher), 11 (security) and 4 (non-regression); `docs/lld/as-is-verification.md` (amendment 19 and the section that lists the fetch sites); `docs/Sprints/reports/S00-report.md` (Part 4: the name-suggestion route).

**Why this sprint:** S00 found about eight places that fetch a customer's website with no protection against being pointed at an internal address (SSRF), plus S00's own name suggestion and `app/api/crawl`, which accepts any domain. This sprint gives them one protected fetch path. **Nothing a customer sees changes.**

**Rules (every part):**
- One commit per numbered part (Part 3 may use one commit per caller group); don't amend; commit only in a separate step after tests finish, never chained with `;`. **Never push.**
- Targeted tests only (related tests, new tests RED on the parent then GREEN, typecheck, lint compared with the parent per changed file, named guards). Full suites only if Sri asks. Playwright only in parts that change UI: none expected, so report "Playwright: not needed (no UI change)" unless a part changes a screen.
- ⛔ No production writes; no migration expected (if one turns out to be needed, stop and report). No mock data in production paths. No `any`. No new `serviceDb`. Secrets by variable name only.
- **Non-regression is the main acceptance:** for public websites, every migrated caller returns exactly what it returns today (technical audit scores and findings, robots analysis, classification input, CDN Shield verdicts, name suggestions, crawl output), proven on recorded fixtures. Network protections are the only change.
- **Per-caller behaviour stays as it is:** each caller keeps its own user agent, robots.txt behaviour, timeout, redirect limit, size limit and http/https handling, passed to the fetcher as options. Where a caller has no timeout or no size limit today, set a bound (say which) and show it doesn't change results on the fixtures.
- If the LLD contradicts the code, the code wins: report with file:line; continue only with independent parts.

## 1. Inventory (no code change)
Write `docs/lld/fetch-inventory.md`: every server-side path that fetches a URL built from customer input (domains, page URLs, sitemaps, robots.txt, redirect targets, profile URLs, logo URLs fetched by the server). For each: file:line, what it fetches, who can trigger it (route or job, role, plan, rate limit, signed-in or anonymous), user agent, timeout, redirects, size limit, robots.txt behaviour, http/https, runtime (Node or Edge). List separately the fixed-host API clients that are **not** in scope (ABR, YouTube Data API, DataForSEO, LLM providers, Stripe, Resend, Supabase, Inngest, Upstash, Neon) so the guard in Part 4 can allow them by name. Flag any customer-URL fetch that anonymous visitors can trigger.

## 2. The guarded fetcher (LLD 8.6.2)
`lib/fetch/guarded-fetch.ts` (Node runtime):
- **Always on (every caller):** schemes `http:`/`https:` only; ports 80 and 443 only; no credentials in URLs; the host resolved once and every address checked; refuse private, loopback, link-local, CGNAT (100.64/10), multicast, broadcast, unspecified, IPv6 ULA and link-local, IPv4-mapped IPv6, and cloud metadata addresses (169.254.169.254, fd00:ec2::254, `metadata.google.internal`); refuse IP literals in any notation (decimal, octal, hex, short forms) that land in those ranges; connect to the checked address with the original Host and SNI (DNS pinning, no second lookup); every redirect re-checked from the start; a hard overall timeout and a hard body cap even when the caller asks for more.
- **Per caller (options, defaulting to the caller's current behaviour):** user agent, timeout, max redirects, max bytes, allowed content types, `obeyRobots` (default off; S06+ callers turn it on), per-host rate limit (default off), whether plain `http:` is tried.
- Refusals return a typed error (`blocked_address`, `blocked_scheme`, `blocked_port`, `too_many_redirects`, `too_large`, `timeout`, `bad_content_type`) and are logged with the host and reason only (no page content, no query strings).
- Tests (RED first): every blocked class above, including DNS rebinding (first lookup public, second private: the pinned address is used), a redirect to a private address, too many redirects, oversize body, wrong content type, port 8080, IP notations; public fixtures pass. Tests reach a local test server only through an injected resolver/connector that exists in test code; a guard test proves production code can't enable it (no env switch).

## 3. Move every caller onto it
One caller group per commit, in this order unless the inventory suggests a safer one: the crawler (`lib/crawler/index.ts`, including robots.txt and sitemap fetches) → classification's home-page read → CDN Shield's probe (`lib/crawler/crawler-access.ts`) → the name suggestion (`GET /api/brands/name-suggestion`) → `app/api/crawl` → the rest from the inventory.
- Each caller keeps its output shape, error paths and options (rule above). A refused address follows the caller's existing "couldn't reach the site" path; nothing crashes.
- `app/api/crawl`: keep today's auth and behaviour for legitimate use; if anonymous visitors can call it without a rate limit, add the existing Upstash rate limiter (say which limit) and report it. S00's Playwright run logged `rate_limit_ip_salt_missing` 10 times on the local server: name the environment variable behind it, say what the rate limiter does when it is missing (file:line), and whether the limiter used here depends on it.
- Tests per caller: its existing tests pass unchanged; a new test shows a private-address target is refused through the caller's existing error path; the fixture outputs are byte-identical to the parent commit.

## 4. Guard against new unguarded fetches
A source-scan test (alongside the existing guards) that fails when server code under `app/`, `lib/` or `inngest/` calls `fetch`, `undici`, `http(s).request`, `axios` or `got` with a URL that isn't a constant from the named fixed-host clients, outside `lib/fetch/`. The allowlist is explicit (file and host) and documented in the test.

## 5. Inventory update
Add a "migrated in" column (commit hash) to `docs/lld/fetch-inventory.md` and list anything left out with the reason. Propose LLD amendments if any.

## Report-back
- Per part: file:line, changes, tests (RED/GREEN, by name), guards, Playwright ("not needed" unless UI changed).
- The inventory summary (how many fetch sites, how many migrated, anything anonymous).
- Fixture parity: every migrated caller's outputs identical on public fixtures.
- Commit hashes and `git log origin/main..main --oneline`.
- Vercel environment: every variable production needs for this sprint, by name only, required or optional, including the one behind `rate_limit_ip_salt_missing` and what happens in production without it.
- Push notes: migration (none expected); Inngest resync (no, unless a function's configuration changed: say which); safe while an audit runs (expected yes: audits keep fetching public sites the same way); no flag (nothing customer-visible changes).

Commit messages end with these two lines exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015t9HuZaoYxNVzVR718W5od
