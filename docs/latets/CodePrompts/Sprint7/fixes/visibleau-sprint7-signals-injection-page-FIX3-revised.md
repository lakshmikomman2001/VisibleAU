# VisibleAU — Sprint 7 FIX 3 (revised): prompt-injection `detail` must name the page
# Page: /brands/[brandId]/signals   Detector: lib/prompt-injection/detect.ts (via the score-signals step)
#
# Why revised: after the first attempt the injection rows STILL show no page, and every row of the same
# pattern shows the IDENTICAL detail string (the two "HTML comment injection" rows are byte-identical;
# both "Invisible Unicode" rows are byte-identical). That means `detail` is currently a STATIC
# per-pattern description, not a per-detection template — so "add the page" is not "fill a {path} slot",
# the detector has to BUILD the detail per detection. Contrast: the negative-signals detector already
# builds per-detection details ("267 words on /plumber-bondi", "123 words on /contact-us").

═══════════════════════════════════════════════════════════════════════════════
STEP 0 — confirm which problem this is BEFORE re-applying (don't skip)
═══════════════════════════════════════════════════════════════════════════════

1. Did the earlier edit land?  grep the injection detail strings in lib/prompt-injection/detect.ts.
   If they're still the static descriptions ("Off-screen text hidden via CSS — may contain instructions
   targeting AI assistants", "Zero-width characters in page content…") with no path interpolation, the
   edit never took — go to the fix below.

2. Was the audit RE-RUN after the edit?  `detail` is persisted into `findings` (JSONB) at audit time,
   so a code change alone does NOT rewrite Bondi Plumbing's existing findings. If code changed but the
   audit wasn't re-run, THAT is the whole problem — re-run the Bondi Plumbing audit and re-check before
   touching anything else.

3. Does the prompt-injection detector receive per-page context?  The negative-signals detector clearly
   does (its details name the page). Confirm the injection detector has the page/path for each detection
   available at the point it builds `detail`. If it currently scans concatenated content with no page
   attribution, that attribution has to be threaded through first (mirror how negative-signals does it).

═══════════════════════════════════════════════════════════════════════════════
THE FIX
═══════════════════════════════════════════════════════════════════════════════

> In `lib/prompt-injection/detect.ts`, build each detection's `detail` PER DETECTION and include the
> page path, the same way `lib/negative-signals/detect.ts` templates its details. Replace the static
> per-pattern description with a template that interpolates the path of the page the injection was found
> on:
>   hidden-text             → `Off-screen text hidden via CSS on ${path} — may contain instructions targeting AI assistants.`
>   html-comment-injection  → `LLM-directed instruction in an HTML comment on ${path} — invisible to users, readable by AI crawlers.`
>   invisible-unicode       → `Zero-width characters in page content on ${path} — often used to smuggle hidden instructions to AI crawlers.`
>   (+ the remaining injection patterns the detector emits: monochrome-text, micro-font-text,
>    data-attribute-injection, aria-hidden-abuse, llm-instruction — same shape, page interpolated)
> Confirm the actual pattern keys + the variable that holds the current page in the detector, and use
> those. Keep the `element` mono block exactly as-is. `detail` is additive text only — it must NOT feed
> `scoreSignals` / `scoreComposite` / the technical-audit rollup; scores stay byte-identical on an
> unchanged site.
>
> After the edit, RE-RUN the Bondi Plumbing audit so the persisted findings regenerate (the page won't
> appear on the existing audit without a fresh run).
>
> Verify before reporting done:
> - grep the detector: the injection `detail` now interpolates `${path}`; no static description string
>   remains.
> - The Bondi Plumbing audit has a fresh run/created timestamp (findings regenerated).
> - On the Signals page, every injection row's detail names the page it was found on, AND two
>   same-pattern detections on different pages now show DIFFERENT detail strings — specifically, the
>   currently-identical "HTML comment injection" pair must diverge.
> - `scoreSignals` and the composite/rollup are unchanged (compare before/after on the same site data).
