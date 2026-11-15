export type { RegistryMatch } from "./bot-registry";
export { clearRegistryCache, getRegistryForVendor, lookupByUserAgent } from "./bot-registry";
export type { CdnJoinRow, CdnJoinVerdict, VerdictInput } from "./cdn-shield-join";
export { computeCdnShieldJoin, deriveVerdict, joinCrawlerAccess } from "./cdn-shield-join";
export type { RefreshResult } from "./ip-ranges";
export { checkCidrContainment, refreshAllIpRanges, refreshIpRangesForVendor } from "./ip-ranges";
export type {
  CoverageGapResult,
  FiveXxResult,
  IngestSourceSummary,
  RobotsViolation,
  TopPage,
  VerificationRate,
  VolumeByPurpose,
  VolumeByVendor,
} from "./metrics";
export {
  countCrawlerVisits,
  get5xxForBots,
  getCoverageGap,
  getIngestSources,
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
} from "./task-emitter";
export type { VerificationResult, VerificationStatus, VerifiedVia } from "./verify-crawler-hits";
export { batchVerify, clearVerificationCache, verifyCrawlerHit } from "./verify-crawler-hits";
