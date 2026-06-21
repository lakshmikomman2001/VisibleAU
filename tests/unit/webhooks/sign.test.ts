import { describe, expect, it } from "vitest";
import { signHmacSha256 } from "@/lib/webhooks/sign";
import { createHmac } from "node:crypto";

describe("signHmacSha256", () => {
  it("produces deterministic output", () => {
    const a = signHmacSha256("hello", "secret");
    const b = signHmacSha256("hello", "secret");
    expect(a).toBe(b);
  });

  it("matches Node.js crypto reference", () => {
    const expected = createHmac("sha256", "my-key")
      .update('{"test":true}')
      .digest("hex");
    expect(signHmacSha256('{"test":true}', "my-key")).toBe(expected);
  });

  it("different secrets produce different signatures", () => {
    const a = signHmacSha256("data", "secret-a");
    const b = signHmacSha256("data", "secret-b");
    expect(a).not.toBe(b);
  });

  it("different messages produce different signatures", () => {
    const a = signHmacSha256("msg-a", "secret");
    const b = signHmacSha256("msg-b", "secret");
    expect(a).not.toBe(b);
  });

  it("returns a hex string", () => {
    const sig = signHmacSha256("test", "key");
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });
});
