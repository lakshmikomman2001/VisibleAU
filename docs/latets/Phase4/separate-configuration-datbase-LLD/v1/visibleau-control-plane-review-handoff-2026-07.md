# HANDOFF — Review of the VisibleAU Control Plane LLD (v1.6)

**For:** a fresh Claude reviewer chat (independent gate-check / critique role)
**From:** the spec/reviewer chat
**Date:** 5 July 2026
**Task:** independently review the **Control Plane LLD (latest, v1.6)** — verify its 29 already-logged conflict resolutions (CP-1..29) are correct, hunt for **new** conflicts prior passes missed, and produce a ready-to-paste Claude Code fix prompt (or precise doc-edit) for **every** issue found.

---

## 1. Your role
Independent **reviewer** in a multi-chat relay: a spec chat drafts, you gate-check, Claude Code applies to the repo (`C:\startup\VisibleAU\src\`). **No repo access** — review against the attached canon. Direct, no padding. **Verify-before-claim**: check the actual canon before asserting; don't trust memory or this handoff alone. **LLD wins over prototype on conflict.**

**Important:** this LLD has already had **six audit passes (29 conflicts, all fixed)**. Don't just re-derive them. Your value is (a) *verifying* those resolutions are correct/complete, and (b) finding what six passes missed. If you find little that's new, **say so honestly** — do not manufacture findings to look thorough (the project's "audit the audit" lesson: a careful reviewer can rationalize a non-issue into a finding).

## 2. VisibleAU in 60 seconds
AU-first GEO/AEO **AI-visibility auditing** micro-SaaS for Australian SMBs + agencies. Managed SaaS (**not BYOK**). Solo founder, part-time, production-grade. Build status: **Phase 1 complete; Phase 2 complete through Sprint 7.** Canon authority = **Phase 2 LLD v8.70** + **prototype FIX17** + Phase 1 foundations v1.12.

## 3. The document under review (attach these)
- **Under review:** **`visibleau-control-plane-lld-2026-07.md` (v1.6)** — read **§0 first** (the conflict-check log: CP-1..29 across six passes, with resolutions + section refs).
- **Attach for grounding** (verify, don't assume): the **v8.70 handoff bundle** (`visibleau-handoff-2026-07-04.zip` → `phase-2/visibleau-phase2-LLD-v8.70.md`, `phase-2/prototype/visibleau-phase2-prototype-FIX17.jsx`, `phase-1/…foundations-v1.12.md`, the sprint prompts).

## 4. What this LLD is
A **separate operator-only system** — a **separate database** + **separate admin web app** — that **authors app-level configuration** (region/market configs, per-region feature enablement, app settings) and **holds encrypted secrets**, accessible only to the founder + technical support, **never clients**. It **publishes** into the existing tenant mechanisms rather than duplicating them.

**The two integration seams (where all the risk is):**
1. **Publish → `config_bundle_cache`** via `ConfigBundleService.activate()` (the tenant app reads config unchanged).
2. **Operator flags → `org_feature_flags`** (already operator-only, per-tenant) + the tenant-side `feature_flag_changed` audit event.
Plus a new **feature-availability Level-1 gate** in `lib/feature-flags` (platform availability AND per-org flag AND `subscriptions.tier`).

## 5. Grounding facts to verify against (spot-check — don't take on trust)
- **`config_bundle_cache` key = `(market_code, locale, segment, bundle_version)`**, `segment ∈ {smb, agency, enterprise}`, `resolved_config` JSONB, `config_digest`, one-active-per-tuple (`config_bundle_one_active`), `ConfigBundleService.activate(newId)` owns an atomic insert-active+deactivate-old transaction. **`resolved_config`'s internal structure + the `config_digest` algorithm are NOT in v8.70** (only in the repo — see §7 here).
- **`org_feature_flags`** — operator-only (8 keys, `set_by='ops'|'sri'`, "never user-facing"), per-org, RLS enabled, UNIQUE(organization_id, flag_key), `feature_flag_changed` audit event in `audit_trail` (table 35).
- **Managed SaaS / no BYOK** — the secrets are VisibleAU's own (env vars today). Real inventory includes **`ABN_LOOKUP_GUID`**, provider keys, `GOOGLE_PLACES_API_KEY`, Inngest signing/event keys, Stripe (secret + webhook secret), Resend, Supabase; boot-critical: `DATABASE_URL`, `BETTER_AUTH_SECRET`. `ga4_api_secret` is **plaintext** in the tenant DB (Sprint 9).
- **Auth = Better Auth.** **7 tiers**: Sample/Free/Starter/Growth/Agency/Agency Pro/Enterprise, with a `tierRank` map + Phase-1 `TIER_*` constants (tier source = `subscriptions.tier`, never `organizations.tier`).
- Existing patterns to align to: `webhook_endpoints.signingSecret` (request signing), idempotency-via-unique-constraint + UPSERT.

## 6. Review lens — check all of these
1. **Verify the 29 CCs** (§0). Each correct / incomplete / wrong? Any resolution that introduced a new problem? Focus hardest on the majors: **CP-2** (activate transaction), **CP-10** (dual-writer / config ownership), **CP-16** (master-key DR), **CP-22** (segment dimension), **CP-25** (merge-not-replace + write-scope).
2. **New conflicts (a genuinely different angle).** Six angles are done — structural, semantic/integration, downstream, security, config-lifecycle, resilience, dimensional, config-composition, Phase-1-grounded. Bring a *different* one, e.g.: **cost/economics** of running the control plane; **testing/CI** for the control plane + its internal API; **the admin app's own web-security surface** (CSRF, XSS on a secrets-displaying app, rate-limiting operator login); **rollback/DR runbook completeness**; **multi-operator concurrency** beyond CP-17 (concurrent secret edits, optimistic locking); **observability/alerting** (how you know a publish failed or config drifted in prod); or **the operator RBAC edge cases** (support-initiated changes to prod).
3. **The two seams.** Does the publish honour the `activate` transaction, RLS context, atomicity (CP-13), cache invalidation (CP-11), and merge-not-replace (CP-25a)? Is the `feature_flag_changed` event emitted (CP-4)?
4. **Security depth** (this holds secrets): envelope encryption + master key in KMS (never in DB/config); the internal publish API as a poison-all-tenants surface (CP-18); the honest threat model (keys still live in the tenant runtime — CP-6); audit immutability at grant level (CP-9); operator-auth isolation (CP-29).
5. **The "unchanged tenant app" claim** — config *read* unchanged, but feature *evaluation* changes (CP-3). Verify it's stated precisely, not overclaimed.
6. **Non-negotiables:** performance, security, scalability, **UX/accessibility** (the admin app). Design-system sharing across the two apps (CP-23)?
7. **Dead config / dimensional completeness:** every `platform_settings` key has a consumer (CP-28); the `(market, locale, segment)` tuple is handled everywhere (CP-22); `min_tier` uses the canonical 7-tier enum + `tierRank` (CP-24).

## 7. The repo-verification items no doc pass can close (call these out explicitly)
Every audit converged here — the ground truth is in the code, not the LLD. Flag each for Claude Code verification:
- **`resolved_config`'s actual structure** (so publish merges correctly — CP-25a).
- **The `config_digest` algorithm** (so the control plane computes it identically — CP-26).
- **`ConfigBundleService.activate`'s real signature + transaction** (CP-2).
- **How the tenant app seeds config** (`db/seed`) and whether it **caches** config reads (`revalidateTag`?) — CP-10/CP-11.
- **The real `.env` secret surface** (env vars accrete in code faster than docs — CP-27).
- **The `signingSecret`/request-signing convention** to align the internal API (CP-18).

## 8. Sri's standards
- **Verify-before-claim** — check the real canon; never trust memory/handoff alone.
- **A ready-to-paste Claude Code fix prompt for EVERY issue** — incl. LOW; group related; scope precisely (files/sections, exact change, verification greps, constraints). Spec-level issues → a precise doc-edit instruction.
- **Performance, Security, Scalability, UX** non-negotiable, first-class. **LLD wins over prototype.** **English only.** Direct. Right the first time.

## 9. Expected output
1. **Verification of the 29 CCs** — each: confirmed-correct / incomplete / wrong (with why, grounded in canon).
2. **New findings by severity** (Critical / High / Moderate / Low) — what, where (section), why, grounded.
3. A **fix prompt (or doc-edit) for every issue** — the two above.
4. **The repo-verification checklist** (§7) as explicit call-outs for Claude Code.
5. **Readiness verdict** — is v1.6 ready to become a build plan (it's a *horizon* feature — built when there are operators + multiple regions to manage), or what must change first.
6. If your new-conflict search comes up largely empty, **say so** — that's a valid and useful result for a six-times-audited doc.

---
*Context: this is a post-Phase-2 horizon feature (operator tooling), not a near-term build — it doesn't gate the founder's next step (finishing Phase 2 + first paying agencies). It is, however, the most heavily-audited artifact in the project. Enduring caveat across all six passes: **canon ≠ built code** — the §7 items are the real remaining risk, and only the repo can resolve them.*
