# Claude Code — FIX (prod-blocker): make the Resend client lazy — stop it crashing the Inngest serve endpoint

A missing/invalid `RESEND_API_KEY` currently **crashes the entire Inngest serve endpoint**, blocking ALL
functions (audits, digests, the re-audit loop, scheduled reports — everything). Root cause confirmed:
`lib/digest/send.ts:3` (and/or the Phase 1 Resend singleton it imports) does **`new Resend(process.env.RESEND_API_KEY)`
at MODULE LOAD**. The Inngest serve route imports every function — including the digest cron — so the eager
`new Resend()` throws on import the moment the key is absent, and the whole endpoint 500s.

This is currently masked by a **band-aid**: a placeholder `RESEND_API_KEY=re_local_stub_for_dev` in `.env.local`/
`.env.dev`. That stub stops the crash locally but is NOT a fix — in any environment where the key is missing or
misconfigured (a fresh clone, a misconfigured deploy, a teammate's machine), the endpoint dies and takes every
background job with it. **The real fix is to make Resend lazy** — instantiate it only when an email is actually
sent, inside the send function — so a missing key can NEVER crash module load / the serve endpoint again.

Context (already established): an eager-instantiation sweep of `lib/` for `new Resend|Stripe|Anthropic|OpenAI` at
module level found Resend was the ONLY offender — Stripe and the LLM clients are already lazy. So this is a
contained, single-concern fix.

> **Investigate-first. Confirm WHERE the eager instantiation actually lives before changing it.** Read:
> - `lib/digest/send.ts` — the reported crash site (line ~3). Does it `new Resend(...)` directly at module top
>   level, OR does it `import { resend } from '@/lib/email/client'` (the Phase 1 singleton)?
> - `lib/email/client.ts` — the canonical Phase 1 Resend SINGLETON. Canon mandates everything imports this and
>   "do NOT new up Resend" elsewhere. Does THIS file do `export const resend = new Resend(process.env.RESEND_API_KEY)`
>   at module load? If so, THIS is the true root — making the singleton lazy fixes every consumer at once.
> - All consumers of the Resend client so the fix is consistent (keep the singleton pattern — don't scatter
>   `new Resend()` calls):
>   ```bash
>   grep -rnE "new Resend\(|from '@/lib/email/client'|from '@/lib/digest/send'|resend\.emails|import.*resend" lib/ inngest/ app/ --include=*.ts | head -40
>   ```
> Report: the exact file(s) doing eager `new Resend()`, whether it's the singleton or a direct call in send.ts,
> and the full list of consumers — then apply the lazy pattern at the SINGLETON level.

---

## THE FIX — lazy singleton (do NOT scatter `new Resend()` calls)
Convert the eager module-load instantiation into a lazy getter, preserving the singleton contract (canon: one
Resend client, imported everywhere; never `new Resend()` in consumers):

**In the canonical client file (`lib/email/client.ts`, or wherever the singleton lives):**
- Replace `export const resend = new Resend(process.env.RESEND_API_KEY)` (module-load) with a lazy accessor that
  instantiates on first use and caches it. Pattern (adapt to the codebase's style):
  ```ts
  import { Resend } from 'resend';

  let _resend: Resend | null = null;

  export function getResend(): Resend {
    if (!_resend) {
      const key = process.env.RESEND_API_KEY;
      if (!key) {
        throw new Error('RESEND_API_KEY is not set — cannot send email.');
      }
      _resend = new Resend(key);
    }
    return _resend;
  }
  ```
  - The key check + throw now happens **at SEND time inside a function**, NOT at module load. Importing the module
    can never throw. If the key is missing, only the specific email send fails (cleanly, with a clear error) — the
    serve endpoint and all other functions keep running.
- If other code imports a `resend` const (`import { resend } from '@/lib/email/client'`), update those call sites
  to use `getResend()` at send time (e.g. inside `sendDigestEmail`, `send-scheduled-reports.ts`, invitation
  emails, etc.). Do NOT leave a module-level `export const resend = ...` that instantiates eagerly.
- Keep it a SINGLETON (the cached `_resend`) — do not introduce multiple `new Resend()` across files (canon rule).

**In `lib/digest/send.ts` specifically:**
- Remove the top-level `new Resend(...)` (line ~3). Inside the actual send function, call `getResend()` (or the
  singleton accessor) right before `.emails.send(...)`.

## INVARIANTS — do not violate
- **No `new Resend()` at module load anywhere** — instantiation happens only inside a send function, on first use,
  behind the lazy getter. Importing any email module must never throw on a missing key.
- **Single Resend client (singleton)** — canon mandates one client imported everywhere; do NOT scatter
  `new Resend()` per consumer. The lazy getter caches one instance.
- A missing `RESEND_API_KEY` must fail ONLY the specific email send (clear error), never module load, never the
  Inngest serve endpoint, never other functions.
- Do NOT change email content, templates, the verified sending domain, EM-01 dedup, or any send logic — ONLY the
  instantiation timing (eager → lazy).
- Do NOT touch the already-lazy Stripe / Anthropic / OpenAI clients.

## VERIFY — prove the endpoint survives a missing key (this is the whole point)
1. **The crash is gone WITHOUT the band-aid stub.** Temporarily REMOVE / comment out `RESEND_API_KEY` from
   `.env.local` (and `.env.dev`), restart the Next.js app, and confirm:
   - The Inngest serve endpoint comes up fine (`localhost:8288/apps` → app **Synced**, all functions listed) —
     it does NOT 500 on the missing key anymore. THIS is the proof the fix works (previously this exact state
     crashed the endpoint).
   - Other functions still run — e.g. trigger a non-email function (an audit) and confirm it completes. A missing
     Resend key no longer blocks unrelated jobs.
2. **A real email send fails cleanly (not catastrophically)** with the key still absent: if you can trigger a
   digest/report send, confirm it throws the clear "RESEND_API_KEY is not set" error for THAT send only — the
   serve endpoint and other functions are unaffected.
3. **With the key present** (restore the stub or a real key + restart), email sends work as before — no regression
   to digest/report/invitation emails.
4. No eager instantiation remains:
   ```bash
   grep -rnE "new Resend\(" lib/ inngest/ app/ --include=*.ts
   # → the ONLY occurrence is inside the lazy getter function; NONE at module top-level.
   ```
5. Full suite green (Sprint 1 + Sprint 2); only the known pre-existing `audit_cost_snapshots` red.

## REPORT
- Where the eager `new Resend()` actually lived (the singleton `lib/email/client.ts`, or directly in
  `lib/digest/send.ts`, or both) + the full consumer list.
- The lazy pattern applied (getter + cached singleton) and every call site updated to instantiate at send time.
- **Behavioural proof:** with `RESEND_API_KEY` REMOVED, the Inngest serve endpoint comes up Synced and a non-email
  function still runs (the previously-crashing state now survives). A real email send fails cleanly for that send
  only.
- `grep "new Resend("` result confirming no module-level instantiation remains.
- Confirm invariants: lazy only, single cached client, no scattered `new Resend()`, email logic/templates
  unchanged, Stripe/LLM clients untouched. Suite green.

## NOTE — the band-aid can be retired (optional, your call)
Once the lazy fix is in, the `RESEND_API_KEY=re_local_stub_for_dev` placeholder in `.env.local`/`.env.dev` is no
longer REQUIRED to prevent the crash (the endpoint survives without it). You may keep the stub so local email
sends don't throw, or remove it — either is safe now. The prod go-live still needs a REAL Resend key + verified
sending domain for emails to actually deliver; this fix is about resilience (no crash), not about replacing the
real key.
