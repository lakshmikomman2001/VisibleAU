import type { ProviderAccountStatus } from "./provider";

/**
 * Google AI follow-ups (12 Nov), part 4 -- what the operator's Test connection (/admin/settings, POST
 * /api/admin/settings/test-connection) shows. "Provider credentials: On · set" only means the env vars
 * exist; this is what DataForSEO says of them, from its free account endpoint.
 */

/** Once per 30 seconds, for every operator together (the provider's account endpoint is shared). */
export const TEST_CONNECTION_WINDOW_MS = 30_000;
/** Below this the page warns, so a top-up comes before the Google checks stop on "out of credit". */
export const LOW_BALANCE_USD = 5;

export interface TestConnectionResult {
  state: "accepted" | "rejected" | "error" | "not_set";
  /** "Accepted · balance US$0.97", "Rejected: the login or password is wrong (DataForSEO 40100)", ... */
  line: string;
  balanceUsd: number | null;
  lowBalance: boolean;
  /** The provider's status code, when it answered. */
  statusCode: number | null;
  checkedAt: string;
}

export function credentialsNotSetResult(checkedAt: string): TestConnectionResult {
  return {
    state: "not_set",
    line: "Not tested: DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD aren't set.",
    balanceUsd: null,
    lowBalance: false,
    statusCode: null,
    checkedAt,
  };
}

/** The provider's answer as the page shows it. It carries no credential or header: none is in `status`. */
export function testConnectionResult(
  status: ProviderAccountStatus,
  checkedAt: string,
): TestConnectionResult {
  if (status.state === "accepted") {
    return {
      state: "accepted",
      line:
        status.balanceUsd === null
          ? "Accepted · the provider didn't say the balance"
          : `Accepted · balance US$${status.balanceUsd.toFixed(2)}`,
      balanceUsd: status.balanceUsd,
      lowBalance: status.balanceUsd !== null && status.balanceUsd < LOW_BALANCE_USD,
      statusCode: status.statusCode,
      checkedAt,
    };
  }
  if (status.state === "rejected") {
    return {
      state: "rejected",
      line: `Rejected: the login or password is wrong (DataForSEO ${status.statusCode})`,
      balanceUsd: null,
      lowBalance: false,
      statusCode: status.statusCode,
      checkedAt,
    };
  }
  return {
    state: "error",
    line:
      status.statusCode === 0
        ? `Not tested: ${status.message}`
        : `Not tested: DataForSEO answered ${status.statusCode} (${status.message})`,
    balanceUsd: null,
    lowBalance: false,
    statusCode: status.statusCode === 0 ? null : status.statusCode,
    checkedAt,
  };
}
