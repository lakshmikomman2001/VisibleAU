/**
 * Methodology v2.2 (Sri's decision, 7 Nov), part 1 -- the most an engine may write in one answer, in output
 * tokens: ChatGPT's and Claude's maxOutputTokens, Perplexity's max_tokens, and Gemini's maxOutputTokens on
 * gemini-3.5-flash-lite. Before this, ai@6 dropped the adapters' `maxTokens: 800` (it reads only
 * maxOutputTokens), so ChatGPT and Claude ran at their models' own limits (Claude Sonnet 4.6: 128,000
 * tokens); Perplexity's own fetch did send max_tokens: 800.
 *
 * Why 8,192 -- diag-0121 on production (25 audits, 11 Oct to 7 Nov 2026, 488 answers with their full text):
 * - The longest answers at p99 were Gemini's: 8,292 characters, about 2,073 tokens at 4 characters a token
 *   and 2,764 at 3. 8,192 is 4x the first and 2.96x the second.
 * - Every engine's longest answer stays under it: at most 2,933 tokens (Gemini's 8,798 characters, at 3
 *   characters a token). Gemini's whole call, input and thinking included, never passed 3,970 tokens.
 * - Nothing reached the old limits (no answer flagged as cut off, every recorded stop a normal one), so no
 *   real answer changes.
 * - It bounds a runaway Claude Sonnet 4.6 answer at 8,192 output tokens x US$15 per 1M = about US$0.12,
 *   where the model's own 128,000 allowed US$1.92.
 * An answer that reaches it is still kept and flagged (citations.answer_truncated, with the provider's stop
 * reason: max_tokens, MAX_TOKENS, length or max_output_tokens -- lib/llm/stop-reason.ts), as before.
 */
export const ANSWER_MAX_OUTPUT_TOKENS = 8192;
