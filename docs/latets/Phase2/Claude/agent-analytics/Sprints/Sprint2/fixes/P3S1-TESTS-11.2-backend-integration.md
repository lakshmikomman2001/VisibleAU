# P3-S1 · TESTS §11.2 — Backend Integration + Direct-Pipeline E2E (Section 2, final S1 test section)

> **Type:** TEST-BUILD. Section 2 of 2 (the two frontend sections are n/a — S1 has no UI). This builds
> **real-database integration tests** + an **automated end-to-end pipeline run**, against the **local dev
> database** (`visibleau`). Real DB, real parser/verifier/DB-writes — **DNS still mocked** (deterministic,
> offline), but everything else is real.
>
> **Fixtures: the tests OWN their data.** Dev is empty (WALK-01 cleaned it out). There is no standing "real
> data" to point at — so each test **seeds its own controlled fixtures** (1 org + 1 brand minimum; the
> `ai_bot_registry` is already seeded at 20 rows) in `beforeAll`/`beforeEach` and **tears them down** in
> `afterAll`/`afterEach`. This is the WALK-01 pattern: create → assert → clean up. Tests must be
> **idempotent and self-contained** — runnable repeatedly, leaving dev exactly as they found it.
>
> **Event chain scope (decided):** Section 2 drives the pipeline **directly** (parse → insert → verify in
> code) — this is where the assertable invariants live (dedup count, cache-lookup count, fails-closed).
> **It does NOT drive the real HTTP route + Inngest** — the Inngest dot-vs-slash *wiring* proof (AA-21)
> stays with the **manual route test** (`P3S1-MANUAL-upload-route-test.md`), which covers it cleanly.
> Forcing full Inngest into an automated test tends to be flaky; the wiring is proven separately.
>
> **Break-proofs, same as Section 1:** build green, then break the code each test guards, confirm the test
> goes RED, restore. A test that stays green when its target breaks is not a guard.
>
> ⚠️ **Run against DEV only** (`visibleau`), never prod. `.env.local` points at dev now (FIX-01), so the
> default is correct — but set the test DB explicitly so a config change can't silently point tests at
> prod. **Never `drizzle-kit push`.**

---

## §11.2 TESTS TO BUILD

### Group E — Schema / migration presence (real DB structural assertions)

**E1 — the 5 ALTER columns + 3 tables exist.** Query the dev DB's `information_schema` → assert
`crawler_visit_logs` has `source_ip` (INET), `verification_status`, `verified_via`, `bytes`,
`ingest_source`; and `ai_bot_registry`, `ai_bot_ip_ranges`, `ai_referral_hits` exist. (This is a live
structural check, not a grep — it proves the migration is actually applied to the DB the tests run on.)

**E2 — `source_ip` is INET and `cidr` is CIDR (locks FIX-01).** Assert `crawler_visit_logs.source_ip`
`data_type='inet'` and `ai_bot_ip_ranges.cidr` `data_type='cidr'`. *(Guards against the TEXT regression
that FIX-01 corrected.)*
> Break-proof: not a code break — instead assert the test would FAIL if pointed at a DB where the column
> were TEXT (you can prove the assertion is real by temporarily changing the expected value to 'text' and
> seeing it go red, then restore). Confirm the assertion is meaningful.

**E3 — RLS state on `ai_referral_hits` — assert REALITY, not the stale spec.** ⚠️ **The §11 spec says
"RLS forced" — that is NOT the current state and must NOT be asserted.** WALK-01 proved RLS is `ENABLE`d
(not `FORCE`d) and the app's superuser connection bypasses it (**Finding #2, parked**). Assert what is
actually true and correct for now:
- `ai_referral_hits` has RLS **enabled** (`relrowsecurity = true`) and the `org_isolation` policy exists
  (USING + WITH CHECK).
- `ai_bot_registry` and `ai_bot_ip_ranges` have **NO** org-isolation policy (they're global reference
  tables — correct).
- Add a `// KNOWN (Finding #2): RLS is ENABLED not FORCED; the app connects as superuser and bypasses
  RLS. assertBrandAccess is the enforced boundary. Tracked for the pre-GTM security pass — do NOT "fix"
  by forcing RLS here (product-wide change).` comment.
⚠️ **Do NOT write a test asserting `relforcerowsecurity = true`** — it would fail, and "fixing" it forces
RLS product-wide, the exact change we deferred.

### Group F — Dedup (AA-02) — locks FIX-02

**F1 — re-ingest the same file → row count unchanged.** Seed org+brand. Ingest the synthetic log
(WALK-01's 13-line file) → assert 8 rows. Ingest the **identical** file again → assert **still 8** (not
16). Clean up.
> Break-proof: this is the FIX-02 bug. Temporarily drop the dedup unique index (or change the insert to
> not use `onConflictDoNothing`) → the second ingest doubles to 16 → **test RED**. Restore the index.
> *(This is the regression guard that makes AA-02 un-reintroducible silently.)*

**F2 — a genuinely-new line still inserts (discriminating proof).** After the double-ingest that held at
8, ingest a variant with ONE changed URL → assert count = 9 (the new line inserts; the 8 duplicates
don't). *(Proves the dedup key discriminates on content, not blanket-rejects — the same distinction the
FIX-02 break-proof made.)*

### Group G — Verification cache (AA-10) — the cost-critical invariant

**G1 — N hits from 3 IPs → exactly 3 DNS lookups.** ⚠️ Per AA-10, verification caches per unique
`(source_ip, vendor)` tuple for 24h — "a million hits from 3 IPs = 3 lookups." Build a fixture of, say,
300 hits spread across exactly **3 distinct source IPs** (same vendor). Run verification. **Spy/count the
mocked `dns.reverse` (and forward-resolve) call count** → assert it was called for **3 tuples, not 300**.
> Break-proof: disable the per-tuple cache (force a lookup every hit) → the DNS spy shows 300 calls →
> **test RED**. Restore. *(This is the invariant that stops a big log from melting the DNS budget — and
> it's invisible without counting the calls.)*

⚠️ **Assert the cache KEY is `(source_ip, vendor)`, not just `source_ip`** — two different vendors sharing
an IP (rare but possible on shared cloud) must both be checked. Add a mini-case: 2 hits, same IP, 2
different claimed vendors → assert 2 lookups (not 1 collapsed by an over-broad cache key).

### Group H — IP-range refresh fails closed (AA-06)

**H1 — malformed vendor JSON → fails closed, previous `is_current` retained.** Seed `ai_bot_ip_ranges`
with a known-good current version (a couple of rows, `is_current=true`). Run the refresh job feeding it
**malformed** vendor JSON (schema violation). Assert: the job **fails closed** — the previous rows are
**still `is_current=true`** (NOT wiped/replaced), and no partial/garbage rows were written.
> Break-proof: change the importer to write-then-validate (or to clear current before parsing) → the
> malformed feed wipes the good version → **test RED**. Restore. *(AA-06: a vendor breaking their JSON
> schema must never blind our verification by nuking the last known-good ranges.)*

### Group I — Direct-pipeline end-to-end (the automated walk)

**I1 — full pipeline against real dev DB, asserted to WALK-01's answer key.** Seed org+brand. Run
parse → insert → verify on the synthetic log **directly** (not via HTTP/Inngest). Assert the DB state
matches WALK-01 exactly:
- **8 rows** land (3 static + 2 human discarded).
- **0 verified** (all TEST-NET IPs; DNS mocked to return no-PTR / non-matching so nothing verifies).
- the spoof row (`GPTBot` @ `198.51.100.99`) is **not verified**.
- `ingest_source='log_upload'` on all 8.
- agent bots (`ChatGPT-User`, `Claude-User`) → `visit_purpose='retrieval'`.
- Clean up.
> Break-proof: break the AA-12 static-asset filter → the 3 `.css/.js/.png` rows appear → count becomes 11
> → **test RED**. Restore. *(One end-to-end guard that the whole chain still produces the proven result.)*

**I2 — verify-then-classify ordering holds in the real pipeline.** With DNS mocked so one row is `spoofed`
(resolving-but-non-matching PTR), assert that spoofed row is NOT treated as a real classified visit in the
persisted output. *(The §11.1 D1 invariant, now proven end-to-end against the DB.)*

---

## FIXTURE + RUN DISCIPLINE

- **Seed helper:** a shared `beforeAll` that creates 1 org + 1 brand (returns their IDs) and a
  `afterAll`/`afterEach` that deletes all rows the test created (crawler_visit_logs, ai_referral_hits,
  ai_bot_ip_ranges test rows, the brand, the org) — tag test rows (e.g. brand domain
  `p3s1-integration-test.local`, URLs `/p3s1int-*`) so cleanup is unambiguous and can NEVER touch other
  data. **The 20-row registry is shared/global — do NOT delete it.**
- **Isolation:** tests must not depend on execution order or on each other's leftover rows. Each seeds
  what it needs.
- **DB:** explicit dev connection (`visibleau`). Assert `current_database()` = `visibleau` in setup so a
  misconfig can't run these against prod.
- **DNS mocked** (`vi.mock("dns")`) with per-test control over what `reverse`/`resolve` return (so G1 can
  count calls, A-style cases can force verified/spoofed/unverified). **DB is real.**
- **After the full run:** assert dev `crawler_visit_logs` count = 0 (everything cleaned up).

---

## REPORT-BACK (paste inline)

- **Green run:** test count, all passing? Confirm run was against `visibleau` (dev), and dev is clean
  (count 0) afterward.
- ⚠️ **Break-proof results for EACH of E2, F1, G1, H1, I1:** did the test go RED when its target was
  broken, green again when restored? (The section's real proof.)
- **F1 (dedup):** confirm re-ingest held at 8 and F2's new line inserted (→9) — locks FIX-02.
- **G1 (cache):** confirm the DNS spy showed **3** calls for 300 hits (not 300), and the 2-vendor-same-IP
  mini-case showed 2 (not 1).
- **H1 (fails-closed):** confirm malformed JSON left the previous `is_current` rows intact.
- ⚠️ **E3 (RLS):** confirm the test asserts RLS **enabled + policy present** (NOT forced), and the
  Finding #2 KNOWN comment is in place. **Confirm no test asserts `relforcerowsecurity=true`.**
- **I1:** confirm the end-to-end result matched WALK-01 (8 / 0 verified / spoof caught / log_upload).

**⚠️ VERDICT at the top:**
> **Is §11.2 green against real dev DB, all break-proofs confirmed RED-on-break, fixtures self-cleaning
> (dev left at 0), and RLS asserted as-is (enabled, not forced)?** YES → S1's automated test track is
> complete (both applicable sections); the only remaining S1 proof is the manual route + Inngest-wiring
> test, and then §12 greps as a standalone pass. NO → list which tests are hollow or failing.

**Constraints recap:** real dev DB, DNS mocked; tests own their fixtures and clean up (dev → 0); assert
RLS **reality** (enabled+policy, NOT forced — don't force RLS here, Finding #2 is parked); every test has
a break-proof that actually goes RED; dedup test locks FIX-02; cache test counts DNS calls (the invisible
invariant); direct-pipeline E2E (Inngest wiring proven by the manual test, not here); never
`drizzle-kit push`; do NOT build §12 greps yet — that's the standalone final pass.
