/**
 * URGENT PDF reports (1 Nov), part 0 -- production's PDF upload failed with
 * only "Supabase Storage upload failed: fetch failed". The real reason was
 * in err.cause, which the adapter dropped. Through the real
 * SupabaseStorageAdapter and storage-js, with fetch stubbed to fail the way
 * Node's fetch does (a TypeError whose cause is the system error).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { redactSecrets } from "@/lib/storage/redact";
import { SupabaseStorageAdapter } from "@/lib/storage/supabase-adapter";
import { describeBody } from "@/lib/storage/upload-error";

const HOST = "abcdefghijklmnopqrst.supabase.co";
/** A made-up JWT-shaped string; never a real key. */
const FAKE_JWT = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.c2lnbmF0dXJlLW5vdC1yZWFs`;

/** Node's fetch failing below HTTP: TypeError("fetch failed") with the system error as its cause. */
function fetchFailed(cause: Error & { code?: string }) {
  return vi.fn(() => Promise.reject(new TypeError("fetch failed", { cause })));
}

function systemError(message: string, code: string) {
  return Object.assign(new Error(message), { code });
}

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", `https://${HOST}`);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", FAKE_JWT);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function uploadError(): Promise<string> {
  const body = Buffer.alloc(48_213, 1);
  const err = await new SupabaseStorageAdapter()
    .upload("org-1/report-1.pdf", body, "application/pdf")
    .then(() => null)
    .catch((e: Error) => e);
  expect(err).toBeInstanceOf(Error);
  return (err as Error).message;
}

describe("a storage upload that fails below HTTP names the real reason", () => {
  it("a DNS failure (ENOTFOUND): the code, the host, the body -- and no URL or key", async () => {
    vi.stubGlobal("fetch", fetchFailed(systemError(`getaddrinfo ENOTFOUND ${HOST}`, "ENOTFOUND")));
    const message = await uploadError();
    expect(message).toBe(
      `Supabase Storage upload failed: fetch failed (cause: ENOTFOUND, Error: getaddrinfo ENOTFOUND ${HOST}) [body: 48213 bytes, Buffer]`,
    );
    expect(message).not.toMatch(/https?:\/\//);
    expect(message).not.toContain(FAKE_JWT);
  });

  it("connection refused, a connect timeout and a TLS failure keep their codes", async () => {
    for (const [code, text] of [
      ["ECONNREFUSED", "connect ECONNREFUSED 203.0.113.7:443"],
      ["UND_ERR_CONNECT_TIMEOUT", "Connect Timeout Error"],
      ["CERT_HAS_EXPIRED", "certificate has expired"],
    ]) {
      vi.stubGlobal("fetch", fetchFailed(systemError(text, code)));
      const message = await uploadError();
      expect(message, code).toContain(`(cause: ${code}, Error: ${text})`);
    }
  });

  it("a cause whose message carries a URL or a JWT: redacted", async () => {
    vi.stubGlobal(
      "fetch",
      fetchFailed(
        systemError(
          `request to https://${HOST}/storage/v1/object/reports/x.pdf?token=${FAKE_JWT} failed, Bearer ${FAKE_JWT}`,
          "ECONNRESET",
        ),
      ),
    );
    const message = await uploadError();
    expect(message).toContain("(cause: ECONNRESET, Error: request to [url] failed, Bearer [jwt])");
    expect(message).not.toContain(FAKE_JWT);
    expect(message).not.toContain("/storage/v1");
  });

  it("storage answering with an error keeps its HTTP status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ statusCode: "404", error: "not_found", message: "Bucket not found" }),
            {
              status: 400,
              headers: { "content-type": "application/json" },
            },
          ),
        ),
      ),
    );
    const message = await uploadError();
    expect(message).toBe(
      "Supabase Storage upload failed: HTTP 400 Bucket not found [body: 48213 bytes, Buffer]",
    );
  });
});

describe("redactSecrets", () => {
  it("strips URLs of any scheme, JWTs, Supabase keys, bearer tokens, key=value pairs and long tokens", () => {
    const out = redactSecrets(
      [
        "postgres://user:pass@db.example.com:5432/app",
        `https://${HOST}/storage/v1/object/sign/reports/a.pdf?token=abc`,
        FAKE_JWT,
        "sb_secret_AbCdEf0123456789",
        "sb_publishable_AbCdEf0123456789",
        "Authorization: Bearer abc.def.ghi",
        "apikey=s3cr3t&x=1",
        "a".repeat(40),
      ].join(" | "),
    );
    expect(out).toBe(
      "[url] | [url] | [jwt] | [key] | [key] | Authorization: Bearer [token] | apikey=[redacted]&x=1 | [token]",
    );
  });

  it("keeps a bare hostname, an IP, an error code and a 20-character project ref", () => {
    const text = `getaddrinfo ENOTFOUND ${HOST} 203.0.113.7:443 ECONNREFUSED abcdefghijklmnopqrst`;
    expect(redactSecrets(text)).toBe(text);
  });
});

describe("describeBody", () => {
  it("names the size and type of what was sent", () => {
    expect(describeBody(Buffer.from("abc"))).toBe("3 bytes, Buffer");
    expect(describeBody(new Uint8Array(5))).toBe("5 bytes, Uint8Array");
    expect(describeBody(new ReadableStream())).toBe("size unknown, ReadableStream");
    expect(describeBody({ pipe: () => undefined })).toBe("size unknown, Node stream");
  });
});
