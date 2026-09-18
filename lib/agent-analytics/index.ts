export type { RegistryMatch } from "./bot-registry";
export { clearRegistryCache, getRegistryForVendor, lookupByUserAgent } from "./bot-registry";
export type { CdnJoinRow, CdnJoinVerdict, CdnShieldDiagnosis } from "./cdn-shield-join";
export { computeCdnShieldJoin, deriveVerdict } from "./cdn-shield-join";
export type { FetchCitationCorrelation } from "./fetch-precedes-citation";
export { getFetchPrecedesCitation } from "./fetch-precedes-citation";
export type { RefreshResult } from "./ip-ranges";
export { checkCidrContainment, refreshAllIpRanges, refreshIpRangesForVendor } from "./ip-ranges";
export type {
  CoverageGapResult,
  FiveXxResult,
  RatioResult,
  RobotsViolation,
  TopPage,
  VerificationRate,
  VolumeByPurpose,
  VolumeByVendor,
} from "./metrics";
export {
  get5xxForBots,
  getCoverageGap,
  getCrawlToReferralRatio,
  getRobotsViolations,
  getTopPagesByPurpose,
  getVerificationRates,
  getVolumeByPurpose,
  getVolumeByVendor,
} from "./metrics";
export type { ParsedCrawlerHit } from "./parse-crawler-log";
export { parseCrawlerLog } from "./parse-crawler-log";
export type { ReferralRecord, ReferralSource } from "./referral-ingest";
export {
  convertUtmToReferrals,
  extractReferralsFromLogs,
  ingestReferrals,
  normalizeAiPlatform,
} from "./referral-ingest";
export type { AaTaskType } from "./task-emitter";
export {
  AA_TASK_TYPES,
  emit5xxTasks,
  emitCdnJoinTasks,
  emitCoverageGapTasks,
  emitImpersonationTasks,
} from "./task-emitter";
export type { VerificationResult, VerificationStatus, VerifiedVia } from "./verify-crawler-hits";
export { batchVerify, clearVerificationCache, verifyCrawlerHit } from "./verify-crawler-hits";
