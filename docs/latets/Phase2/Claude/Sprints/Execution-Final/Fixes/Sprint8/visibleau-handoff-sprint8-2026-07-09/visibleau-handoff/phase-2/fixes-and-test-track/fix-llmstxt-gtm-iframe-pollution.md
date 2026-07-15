# Claude Code — FIX [HIGH]: llms.txt content polluted with GTM tracking-iframe noise (extractContent leaking raw markup)

The generated llms.txt (`/retrieval/llmstxt`) appends GTM `<noscript>` tracking-iframe markup to EVERY page entry:
`- [Page Title](url): <iframe src="https://www.googletagmanager.com/ns.html?id=GTM-KXD4DZ99" height="0" width="0"
style="d...` — on every page, all the way to the `## Generated` footer. llms.txt is the AI-READABLE sitemap VisibleAU
generates for customers to publish; polluting it with tracking-pixel HTML defeats the feature's entire purpose and ships
a broken customer-facing artifact. FIX: strip non-content markup (script/style/iframe/noscript/analytics/0×0 hidden
elements) so the llms.txt is clean. The titles + URLs are already GOOD — this is a strip/filter, not a rewrite.

⚠️ SCOPING FIRST: §6.4 says the generator reuses the SHARED Phase 1 `crawlSite()`/`extractContent()` primitives. So the
leak is either in (a) the SHARED extractContent (blast radius = content-structure-audit + entity-home + agent-readiness
ALL use it) or (b) the S6 llmstxt-generator's OWN handling of extractContent output (S6-local). DETERMINE which before
changing shared code — the fix location + blast radius depend on it.

Env: Windows repo `C:\startup\VisibleAU\src\`. App on LOCAL PROD `visibleau_prod`. Never real prod. Brand: Metropolitan
418f321f-2489-4560-aaa9-895728580465.

## STEP 1 — DIAGNOSE: where is the GTM-iframe leaking in? (shared vs S6-local)
```bash
# The llms.txt generator + what it does with extractContent output:
cat lib/retrieval/llmstxt-generator.ts
grep -n "extractContent\|crawlSite\|iframe\|description\|content\|page\.\|\.map\|title\|url" lib/retrieval/llmstxt-generator.ts
# The shared extractContent — does IT strip script/style/iframe, or return raw-ish HTML/text?
find . -path ./node_modules -prune -o -name "*.ts" -print | xargs grep -l "export.*extractContent\|function extractContent" 2>/dev/null
grep -n "iframe\|script\|style\|noscript\|strip\|remove\|cheerio\|\.text()\|\.html()\|clean" <the extractContent file>
```
Report: (a) does the SHARED extractContent already strip script/style/iframe (in which case the leak is the llms.txt
generator using a RAW field / the wrong extraction output)? OR (b) does extractContent itself return content WITH the GTM
iframe (shared bug)? Identify the EXACT source of the `<iframe ...googletagmanager...>` text in the page-line output.

## STEP 2 — Determine WHAT the llms.txt page line should contain
The current line is `- [Title](url): <junk>`. The `: <junk>` is a page DESCRIPTION slot polluted with the GTM iframe. The
line should be a clean markdown link + (optionally) a clean description:
- **Minimum:** `- [Title](url)` — clean title + URL, NO trailing markup.
- **Better (if a description is intended):** `- [Title](url): <clean one-line description>` — a stripped, readable
  summary (first meaningful sentence / meta description), NOT raw HTML.
Confirm from the generator what the `: ...` slot is meant to be (a description? if so it must be CLEAN text). The titles
+ URLs are already correct — preserve them.

## STEP 3 — FIX (location depends on STEP 1):

### If the leak is in the SHARED extractContent (blast radius = Phase 1 + S6):
- extractContent must STRIP non-content markup before returning: remove `<script>`, `<style>`, `<iframe>`, `<noscript>`,
  and hidden/0×0 elements (height="0" width="0" / display:none) — the GTM noscript iframe is the classic case.
- Use the HTML parser already in the stack (cheerio, per the crawler) to remove those nodes, then extract text.
- ⚠️ Since this is SHARED: after fixing, re-verify the OTHER consumers still work — content-structure-audit
  (citation/format still computed), entity-home (@id/sameAs still detected), agent-readiness. A shared-content fix could
  shift their inputs. Run those screens/tests too.

### If the leak is S6-LOCAL (the generator uses a raw field or doesn't clean extractContent output):
- Fix ONLY llmstxt-generator.ts: when building each page line, use the CLEAN text output (not raw HTML), and if a
  description is included, strip any residual markup (regex-remove `<iframe...>`, `<script...>`, tags) before writing.
- Don't touch the shared extractContent (no Phase 1 blast radius).

Prefer the S6-local fix IF the shared extractContent is already clean and the generator is just grabbing the wrong/raw
field. Only modify shared extractContent if IT is the one leaking the iframe.

## STEP 4 (Finding 2) — verify the depth_score /18 rubric vs the noise
Depth showed **17/18** for a polluted file — suspiciously high. Check the depth_score rubric:
```bash
grep -n "depth_score\|depthScore\|/18\|score\|rubric\|point" lib/retrieval/llmstxt-generator.ts
```
- Does the rubric measure only STRUCTURE (has ## Pages, has links → high score) without penalizing non-content noise? A
  17/18 on a GTM-iframe-polluted file is a misleading customer-facing number (the honest-data concern).
- After STEP 3 cleans the content, re-check the depth score — it should still be high for a genuinely clean file (that's
  fine), but confirm the score isn't INFLATED by the junk. If the rubric can't tell clean from polluted, note it (a
  rubric that rewards junk is a separate quality gap — report, decide whether to address now or later).
Report: what the depth rubric measures + whether 17/18 was inflated by the noise.

## STEP 5 — Regenerate + verify on screen (real data)
```bash
# Regenerate llms.txt for Metropolitan (the Generate New action, or the generator fn), then:
```
Reload `/brands/418f321f.../retrieval/llmstxt`:
- Each page line is CLEAN: `- [Title](url)` (+ clean description if intended) — **NO `<iframe src="googletagmanager...">`
  anywhere**.
- The titles + URLs are preserved (they were already good).
- The `## Generated` footer intact.
- Depth score reflects a genuinely clean file.
Report: the regenerated llms.txt is clean (no GTM iframe / no raw markup), on screen.

## STEP 6 — Report + test
- STEP 1: where the leak was (shared extractContent vs S6-local generator).
- STEP 3: the fix (strip non-content markup) + its location + (if shared) the other consumers re-verified.
- STEP 4: the depth rubric — was 17/18 inflated by noise; addressed or noted.
- STEP 5: clean llms.txt on screen.
- Add a test: the generated llms.txt content contains NO `<iframe`/`<script`/`<style`/`googletagmanager` (assert the
  output is clean markup-free); re-break: feed HTML-with-GTM-iframe → the clean-output assertion FAILS. (This guards the
  core-deliverable-quality bug — the kind no existing test caught because the generator "worked" + scored 17/18.)

## Constraints
- HIGH priority — this is the core "AI-readable" deliverable producing AI-ILLEGIBLE output on a customer-facing file.
- SCOPE FIRST (STEP 1): shared extractContent (Phase 1 blast radius — re-verify other consumers) vs S6-local generator.
  Prefer S6-local if extractContent is already clean; only touch shared code if IT leaks the iframe.
- Strip script/style/iframe/noscript/hidden-0×0 — use the stack's HTML parser (cheerio), not just a regex, for the
  parse; a regex fallback is OK to catch residual tags in the description slot.
- Preserve the good titles + URLs (they're correct) — this is a strip/filter, not a rewrite.
- Verify on screen with a REGENERATED file (real data). Add the no-markup test with re-break.
- Local prod, never real prod. LLD v8.70 / §6.4 win.

## NOTE
HIGH-severity core-deliverable bug found on the last S6 screen: the llms.txt generator leaks GTM `<noscript>`
tracking-iframe markup into EVERY page entry (`- [Title](url): <iframe src="googletagmanager..." height="0" width="0">`),
making the AI-readable sitemap AI-illegible on a file customers publish. The titles + URLs are already good — this is a
strip/filter of non-content markup (script/style/iframe/noscript/hidden-0×0). SCOPE FIRST: §6.4 reuses the SHARED Phase 1
extractContent — determine if the leak is there (blast radius = content-structure + entity-home + agent-readiness, re-
verify them) or S6-local in the generator (prefer this if extractContent is already clean). Also check the depth_score
rubric — 17/18 on a polluted file is suspiciously high (a rubric rewarding junk is a misleading customer metric).
Regenerate + verify clean on screen. Add a no-`<iframe>`/`<script>`/`googletagmanager` output test with re-break — the
guard for a core-quality bug no existing test caught (the generator "worked" and scored 17/18).
