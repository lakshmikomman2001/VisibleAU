import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getRateLimiterBackend,
  getRedisConfig,
  RATE_LIMITER_ENV_NAMES,
} from "@/lib/sample-audit/rate-limit";

/**
 * Task #46 (18th follow-up): Vercel's Upstash Marketplace integration
 * creates KV_REST_API_URL/KV_REST_API_TOKEN (plus KV_REST_API_READ_ONLY_TOKEN,
 * KV_URL, REDIS_URL), never UPSTASH_REDIS_REST_URL/_TOKEN. These tests
 * prove getRedisConfig()'s explicit fallback, and that the read-only
 * token and the two TCP connection strings are never read for this.
 */
describe("getRedisConfig() / getRateLimiterBackend() -- UPSTASH_* then KV_REST_API_* fallback", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses UPSTASH_REDIS_REST_URL/_TOKEN when both are set", () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://real-upstash.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "real-upstash-token");
    vi.stubEnv("KV_REST_API_URL", "https://kv.upstash.io");
    vi.stubEnv("KV_REST_API_TOKEN", "kv-token");

    const config = getRedisConfig();
    expect(config?.source).toBe("upstash");
    expect(config?.url).toBe("https://real-upstash.upstash.io");
    expect(getRateLimiterBackend()).toBe("upstash");
  });

  it("falls back to KV_REST_API_URL/_TOKEN when UPSTASH_* is unset", () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.stubEnv("KV_REST_API_URL", "https://kv.upstash.io");
    vi.stubEnv("KV_REST_API_TOKEN", "kv-token");

    const config = getRedisConfig();
    expect(config?.source).toBe("kv");
    expect(config?.url).toBe("https://kv.upstash.io");
    expect(getRateLimiterBackend()).toBe("kv");
  });

  it("falls back to KV_REST_API_* when UPSTASH_* is the localhost test placeholder", () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "http://localhost:6379");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "local-stub");
    vi.stubEnv("KV_REST_API_URL", "https://kv.upstash.io");
    vi.stubEnv("KV_REST_API_TOKEN", "kv-token");

    expect(getRedisConfig()?.source).toBe("kv");
  });

  it("reports 'disabled' when neither pair is configured", () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.stubEnv("KV_REST_API_URL", "");
    vi.stubEnv("KV_REST_API_TOKEN", "");

    expect(getRedisConfig()).toBeNull();
    expect(getRateLimiterBackend()).toBe("disabled");
  });

  it("never resolves using KV_REST_API_READ_ONLY_TOKEN -- a read-only token alone is not enough", () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.stubEnv("KV_REST_API_URL", "");
    vi.stubEnv("KV_REST_API_TOKEN", "");
    vi.stubEnv("KV_REST_API_READ_ONLY_TOKEN", "some-read-only-token");

    expect(getRedisConfig()).toBeNull();
  });

  it("never reads KV_URL or REDIS_URL -- those are TCP connection strings, not the REST client", () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.stubEnv("KV_REST_API_URL", "");
    vi.stubEnv("KV_REST_API_TOKEN", "");
    vi.stubEnv("KV_URL", "rediss://default:secret@some-host.upstash.io:6379");
    vi.stubEnv("REDIS_URL", "rediss://default:secret@some-host.upstash.io:6379");

    expect(getRedisConfig()).toBeNull();
    expect(getRateLimiterBackend()).toBe("disabled");
  });

  it("RATE_LIMITER_ENV_NAMES lists exactly the 4 names actually read, for the startup log", () => {
    expect(RATE_LIMITER_ENV_NAMES).toEqual([
      "UPSTASH_REDIS_REST_URL",
      "UPSTASH_REDIS_REST_TOKEN",
      "KV_REST_API_URL",
      "KV_REST_API_TOKEN",
    ]);
  });
});
