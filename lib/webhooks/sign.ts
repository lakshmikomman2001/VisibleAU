import { createHmac } from "node:crypto";

export function signHmacSha256(message: string, secret: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}
