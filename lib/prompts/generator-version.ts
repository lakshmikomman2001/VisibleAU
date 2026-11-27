/**
 * Vunnara hotfix 2 (19 Oct, post-609e323), item 4: which generation of
 * the prompt GENERATOR (lib/prompts/build-prompt-pack.ts) produced a
 * brand's frozen prompt_pack -- written explicitly at pack-regeneration
 * time (lib/prompts/regenerate-prompt-pack.ts), never relied on as a
 * bare DB column default beyond "1 for every pack generated before
 * this feature existed." Same pattern as lib/llm/methodology.ts's
 * METHODOLOGY_VERSION.
 *
 * 1 = the generator as it existed before this hotfix: duplicate place
 *     names possible (classification.intentSignals could already
 *     carry one, appended on top of again), the hipages platform
 *     mention in trades_general, and up to 12 organic questions
 *     (intentSignal-derived ones bypassed the 10-question budget).
 * 2 = this hotfix's generator: validate-question.ts's render-time
 *     checks, no third-party platform names, exactly 10 organic.
 * 3 = 13 Nov, part 4 (Sri's live check): no " -- " in a question ("Plumber
 *     in Norwest, NSW -- who do locals trust for general repairs?" now
 *     reads "… NSW — who do locals trust …"). A stored pack regenerates on
 *     its next audit (or a rename); stored audit questions are never
 *     rewritten.
 * 4 = 14 Nov, part 1 (Sri's review of audit #48): no "What Australian tech
 *     companies are leading in their space in 2025?" for an Australian-
 *     founded brand of any vertical (it reached Wren Home Services, a
 *     handyman, and counted as an everyday question). Version 3 rebuilt
 *     packs with the same generator, so it kept it; 4 rebuilds them without.
 *   - 5 (16 Nov, part 1): the general type is local -- its questions name the business's own service and its
 *     suburb ("Best dog groomer in Parramatta?"), never "Best General business options in Australia?".
 *   - 6 (16 Nov, part 2): a restaurant's questions no longer ask about cafés or brunch (the café type has them).
 *
 * lib/audit/get-audit-prompts.ts checks a ready brand's stamped
 * version against this constant at audit-creation time and
 * regenerates first when it's older -- the only way a pack frozen by
 * an old generator ever gets refreshed, since there's no natural
 * re-save once a brand is already confirmed.
 */
export const PROMPT_GENERATOR_VERSION = 6;
