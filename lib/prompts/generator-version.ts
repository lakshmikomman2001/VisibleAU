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
 *
 * lib/audit/get-audit-prompts.ts checks a ready brand's stamped
 * version against this constant at audit-creation time and
 * regenerates first when it's older -- the only way a pack frozen by
 * an old generator ever gets refreshed, since there's no natural
 * re-save once a brand is already confirmed.
 */
export const PROMPT_GENERATOR_VERSION = 2;
