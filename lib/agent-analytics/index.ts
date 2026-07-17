export { lookupByUserAgent, clearRegistryCache, getRegistryForVendor } from "./bot-registry";
export type { RegistryMatch } from "./bot-registry";

export { checkCidrContainment, refreshIpRangesForVendor, refreshAllIpRanges } from "./ip-ranges";
export type { RefreshResult } from "./ip-ranges";

export { verifyCrawlerHit, batchVerify, clearVerificationCache } from "./verify-crawler-hits";
export type { VerificationStatus, VerifiedVia, VerificationResult } from "./verify-crawler-hits";

export { parseCrawlerLog } from "./parse-crawler-log";
export type { ParsedCrawlerHit } from "./parse-crawler-log";

export {
  getCrawlToReferralRatio,
  getVolumeByVendor,
  getVolumeByPurpose,
  getTopPagesByPurpose,
  getCoverageGap,
  get5xxForBots,
  getRobotsViolations,
  getVerificationRates,
} from "./metrics";
export type {
  RatioResult,
  VolumeByVendor,
  VolumeByPurpose,
  TopPage,
  CoverageGapResult,
  FiveXxResult,
  RobotsViolation,
  VerificationRate,
} from "./metrics";

export { computeCdnShieldJoin, deriveVerdict } from "./cdn-shield-join";
export type { CdnJoinVerdict, CdnJoinRow, CdnShieldDiagnosis } from "./cdn-shield-join";

export { ingestReferrals, normalizeAiPlatform, extractReferralsFromLogs, convertUtmToReferrals } from "./referral-ingest";
export type { ReferralSource, ReferralRecord } from "./referral-ingest";

export { getFetchPrecedesCitation } from "./fetch-precedes-citation";
export type { FetchCitationCorrelation } from "./fetch-precedes-citation";

export {
  AA_TASK_TYPES,
  emitCdnJoinTasks,
  emitCoverageGapTasks,
  emit5xxTasks,
  emitImpersonationTasks,
} from "./task-emitter";
export type { AaTaskType } from "./task-emitter";
