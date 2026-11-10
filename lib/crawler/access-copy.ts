/**
 * Follow-ups from af8de42..d1eb5a1 (10 Nov), part 2 -- the words for what our checks can't know about AI
 * crawlers from outside, in one place (CDN Shield, the Crawler Logs page, /about, the methodology).
 */

/** Where a customer uploads their server logs (the setup panel on the Agent Analytics page). */
export const LOG_UPLOAD_POINTER =
  "upload your server logs on the Agent Analytics page (Connect your logs → Upload a log file)";

export const CANT_TEST_FROM_OUTSIDE = "can't be tested from outside";

/** The page-level sentence: never a guess, never a visit pretending to be the crawler. */
export const CDN_UNTESTABLE_SENTENCE = `Whether your CDN or firewall lets AI crawlers through ${CANT_TEST_FROM_OUTSIDE} without pretending to be them, which we don't do: ${LOG_UPLOAD_POINTER} to see their real visits.`;
