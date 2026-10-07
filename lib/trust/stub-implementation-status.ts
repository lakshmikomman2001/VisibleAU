/**
 * Trust Intelligence honesty pass. LinkedIn Presence, YouTube Presence,
 * and Consensus Score have never performed a real external check -- their
 * scoring cron jobs (inngest/functions/audit-linkedin-presence.ts,
 * audit-youtube-presence.ts, check-cross-platform-consensus.ts) and their
 * manual "Refresh" API routes all hardcode the same placeholder input
 * (every field false/0, or for Consensus, every field `true` -- which is
 * what fabricated the "100% / top tier" result) behind a
 * `// TODO: implement ... in production` comment that was never resolved.
 *
 * Per Sri's rule -- "no tile may assert a result it did not measure" --
 * every consumer of these three checks (the GET routes, the refresh
 * routes, and the cron jobs themselves) must check this flag and refuse
 * to read, write, or present a score while it is false. Flip the
 * relevant flag to `true` only once that check's real implementation
 * actually performs the lookup it claims to. See
 * docs/ops/post-launch-db-hardening.md section 34.
 */
export const TRUST_CHECK_IMPLEMENTED = {
  linkedinPresence: false,
  youtubePresence: false,
  consensusScore: false,
} as const;

export type TrustCheckKey = keyof typeof TRUST_CHECK_IMPLEMENTED;

export const NOT_YET_IMPLEMENTED_RESPONSE = { implemented: false as const };
