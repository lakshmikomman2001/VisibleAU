import Link from "next/link";
import {
  AuthNotice,
  authTextStyle,
  SimpleAuthCard,
} from "@/components/domain/auth/simple-auth-card";
import { INVITE_UNUSABLE } from "@/lib/auth/invite";

/**
 * Live invite test follow-ups (8 Nov), part 1 -- what the invite page shows someone signed out whose token
 * can't be used: unknown, expired, used, or its workspace closed. The one answer the invite routes give
 * (INVITE_UNUSABLE_REFUSAL), whatever the reason, so nothing is learnt from it.
 */
export default function InviteNotFound() {
  return (
    <SimpleAuthCard title="Team invitation">
      <AuthNotice tone="error">{INVITE_UNUSABLE}</AuthNotice>
      <p style={{ ...authTextStyle, marginTop: 16 }}>
        <Link href="/sign-in" style={{ color: "var(--accent-blue)" }}>
          Sign in
        </Link>
      </p>
    </SimpleAuthCard>
  );
}
