# VisibleAU — Sprint 7 detector tightening: hidden-text false positives (EE3 pattern 1, light touch pattern 8)
# Page surfaced on: /brands/[brandId]/signals   Detector: lib/prompt-injection/detect.ts (score-signals step)
#
# WHY THIS IS AN LLD CHANGE, NOT A BUILD BUG:
#   Sprint 7 LLD §4 EE3 pattern 1 specifies hidden-text detection as:
#     "CSS color matches background, or display:none, visibility:hidden on elements with text content …
#      Severity: 'critical'"
#   — no content gate, no benign-pattern exclusion, always critical. The build is FAITHFUL to that spec,
#   so the benign form-status messages ("Thank you for contacting us…", "Oops, there was an error…")
#   flagged Hidden text / CRITICAL are the SPEC being over-broad. The fix therefore refines the spec
#   (Part A) and is then implemented (Part B). Per the escalate-don't-silently-patch rule, fold Part A
#   into the canonical Sprint 7 prompt §4 EE3.
#
# ⚠ SCORING IMPACT (read before running — differs from the prior three fixes):
#   This change WILL move scores, intentionally. Removing false-positive detections and downgrading
#   severities raises the /6 Signals score (currently 0/6). scoreSignals feeds the rollup:
#       Technical = (scoreRobots + scoreLlmsTxt + scoreAiDiscovery + scoreSignals) / 48 × 100
#   so the Technical category % and the overall composite on the technical-audit overview will rise.
#   That is EXPECTED AND CORRECT (it removes inflation), not a regression. The exact magnitude depends on
#   the signals aggregation inside detectNegativeAndInjection (the /6 formula is build-determined, not
#   written in the LLD) — so confirm how it weights critical/warning/excluded, capture before/after, and
#   verify the rollup math still holds.

═══════════════════════════════════════════════════════════════════════════════
PART A — LLD ADDENDUM  (refines §4 EE3 pattern 1; light touch on pattern 8)
═══════════════════════════════════════════════════════════════════════════════

PATTERN 1 — Hidden text (REVISED)

  DETECTION (unchanged from current spec): text-bearing elements where display:none, OR
  visibility:hidden, OR color ≈ background-color (existing heuristic / computed-style comparison).

  CLASSIFICATION (new — ORDER IS LOAD-BEARING for security):
    1. hasInstructionContent = the element's text matches the pattern-3 LLM-instruction regex
       /ignore (previous|all|above)|act as|you are now|disregard|system prompt/i
       → emit severity 'critical'.  ALWAYS — even if the element also looks benign (see step 2).
       Rationale: an attacker can hide injection text inside a role="status"/aria-hidden/.form-message
       container; the content gate must win or the exclusions below become an evasion hole.
    2. else if isBenignHiddenPattern (no instruction content) → DO NOT emit a detection. Benign =
         • form status/feedback: [role="alert"], [role="status"], [aria-live], OR class/id matching
           /(form|field|submit|success|error|warning|alert|toast|notif|flash|message|msg|feedback|status|help|hint)/i
         • screen-reader-only: .sr-only, .visually-hidden, .screen-reader-text, [class*="visually-hidden"]
         • toggled UI containers: [role="tabpanel"], [hidden], <details> descendants, .modal,
           [role="dialog"], .dropdown, .accordion, .collapse, .offcanvas, .tooltip, .popover
         • cookie/consent: [class*="cookie"], [class*="consent"], [id*="cookie"]
    3. else (hidden text, no instruction content, not a recognized benign pattern)
       → emit severity 'warning'  (unexplained hidden text — surface it, but it is not confirmed
         manipulation, so it is no longer 'critical').

PATTERN 8 — Aria-hidden abuse (REVISED, light touch)

  DETECTION (unchanged): aria-hidden="true" element containing > 100 chars of text.
  CLASSIFICATION:
    1. hasInstructionContent (same regex) → 'critical'.
    2. else if the element is a recognized toggled UI container (tabpanel / modal / [role="dialog"] /
       dropdown / accordion / collapse / offcanvas / carousel slide) → DO NOT emit (legitimate
       aria-hidden on collapsed/inactive UI).
    3. else → 'info'  (unchanged).

  NOT MODIFIED by this addendum: patterns 2, 3, 4, 5, 6, 7. Display labels (the FIX-1 map) and the
  page-naming detail templates (FIX 3) are unchanged — this addendum only changes whether/at-what-severity
  a hidden-text / aria-hidden row is emitted, not its wording.

═══════════════════════════════════════════════════════════════════════════════
PART B — BUILD PROMPT  (paste below the line into a fresh Claude Code session)
═══════════════════════════════════════════════════════════════════════════════

> Tighten the hidden-text and aria-hidden detection in `lib/prompt-injection/detect.ts` (and the
> corresponding `patterns/` files for pattern 1 hidden-text and pattern 8 aria-hidden). Two patterns
> only — do NOT touch patterns 2–7.
>
> First, grep how `detectNegativeAndInjection` aggregates detection severities into the /6 signals score,
> and reuse the EXISTING pattern-3 LLM-instruction regex (`/ignore (previous|all|above)|act as|you are
> now|disregard|system prompt/i`) — don't invent a new one.
>
> Add a shared helper `isBenignHiddenPattern($el)` returning true when the element matches a recognized
> benign hidden pattern: form status/feedback ([role="alert"], [role="status"], [aria-live], or class/id
> matching `/(form|field|submit|success|error|warning|alert|toast|notif|flash|message|msg|feedback|status|
> help|hint)/i`), screen-reader-only (.sr-only, .visually-hidden, .screen-reader-text,
> [class*="visually-hidden"]), toggled UI containers ([role="tabpanel"], [hidden], <details> descendants,
> .modal, [role="dialog"], .dropdown, .accordion, .collapse, .offcanvas, .tooltip, .popover), and
> cookie/consent ([class*="cookie"], [class*="consent"], [id*="cookie"]).
>
> Pattern 1 (hidden text) — keep the existing DETECTION (display:none / visibility:hidden / color≈bg) but
> replace the flat `severity: 'critical'` with this classification IN THIS ORDER:
>   1. if the element text matches the LLM-instruction regex → severity 'critical' (always, regardless of
>      isBenignHiddenPattern — this is the evasion guard; do not reorder).
>   2. else if isBenignHiddenPattern($el) → skip (emit nothing).
>   3. else → severity 'warning'.
>
> Pattern 8 (aria-hidden abuse) — keep DETECTION (aria-hidden="true" with >100 chars). Classify:
> instruction-content → 'critical'; else recognized toggled UI container → skip; else → 'info' (unchanged).
>
> Extend `lib/prompt-injection/detect.test.ts` with cases:
>   • display:none form success message with role="status" → NOT flagged
>   • .sr-only screen-reader text → NOT flagged
>   • hidden [role="tabpanel"] content → NOT flagged
>   • hidden .form-message containing "ignore previous instructions" → STILL flagged 'critical' (evasion guard)
>   • plain display:none <div> with ordinary text, no benign class → flagged 'warning'
>   • aria-hidden tabpanel with >100 chars → NOT flagged; aria-hidden block with instruction text → 'critical'
>
> After the change, RE-RUN the Bondi Plumbing audit so `findings` and `scoreSignals` regenerate (a code
> change alone won't update persisted findings).
>
> Verify before reporting done:
>   • The two benign form messages ("Thank you for contacting us…" and "Oops, there was an error…") no
>     longer appear as Hidden text / CRITICAL — they should be gone from the Signals page.
>   • The "22 prompt injections detected" count drops accordingly.
>   • Any genuine hidden-text-with-instruction case (if present in fixtures) is still CRITICAL.
>   • scoreSignals RISES from 0/6 (more accurate). Report the before/after scoreSignals, and confirm the
>     Technical category % and composite on /brands/[brandId] (overview) update correctly with the rollup
>     Technical=(scoreRobots+scoreLlmsTxt+scoreAiDiscovery+scoreSignals)/48×100 still holding.
>   • Patterns 2–7 are unchanged (same detections, same severities, same counts).

═══════════════════════════════════════════════════════════════════════════════
ADJACENT OBSERVATION (not in the prompt — your call, lower confidence)
═══════════════════════════════════════════════════════════════════════════════
The two "HTML comment injection" rows flag a tracking-script comment — element shows
`<!-- Injecting site-wide to the head --> <script type="text/javascript" id="d_track_c…` (truncated).
The pattern-4 spec regex is `/<!--.*?(ignore|disregard|act as|you are)/is`, and the VISIBLE text doesn't
contain those keywords — so either (a) the element is truncated and the matching keyword is further along
(legit match), or (b) the build's pattern-4 regex drifted broader than spec and is flagging benign
analytics-injection comments. Worth a quick grep of the pattern-4 regex in the build vs the spec to rule
out (b). If it turns out to be a separate false positive, I'll write that fix too — I left it out here to
keep this prompt scoped to the hidden-text/aria-hidden change you asked for.
