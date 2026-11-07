"use client";

import { Check, UserPlus } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { CheckInbox } from "@/components/domain/auth/check-inbox";
import { InviteSignUp } from "@/components/domain/auth/invite-sign-up";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { signUp } from "@/lib/auth/client";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/auth/password-rules";
import { authPagePath, inviteFromPath, newWorkspacePath, safeRedirectPath } from "@/lib/auth/paths";

function LogoMark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div
        style={{
          width: 28,
          height: 28,
          background: "var(--accent-primary)",
          color: "var(--accent-primary-fg)",
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontWeight: 700,
            fontSize: 14,
            position: "relative",
            zIndex: 1,
          }}
        >
          V
        </span>
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(135deg, rgba(255,255,255,0.15), transparent 50%)",
          }}
        />
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 1 }}>
        <span
          style={{
            fontWeight: 600,
            fontSize: 16,
            letterSpacing: "-0.02em",
            color: "var(--text-primary)",
          }}
        >
          visible
        </span>
        <span
          style={{
            fontWeight: 600,
            fontSize: 16,
            letterSpacing: "-0.02em",
            color: "var(--text-tertiary)",
          }}
        >
          au
        </span>
      </div>
    </div>
  );
}

const FEATURES = [
  "AU-first vertical content & compliance",
  "Suburb-level tracking, not just metro",
  "Flat agency tiers — no per-brand surprises",
  "Research-backed Action Center",
];

const INPUT_STYLE: React.CSSProperties = {
  height: 36,
  borderRadius: 6,
  fontSize: 14,
  padding: "0 12px",
  outline: "none",
  background: "var(--bg-base)",
  border: "1px solid var(--border-default)",
  color: "var(--text-primary)",
  boxShadow: "var(--shadow-soft)",
  width: "100%",
};

/** The sign-up form; page.tsx sends anyone already signed in on before it renders. */
export function SignUpForm() {
  const searchParams = useSearchParams();
  // Team follow-ups, item 3: where a link (an invite's) asked to go once the account exists. Then no
  // workspace of its own is made, so the form doesn't ask for its name.
  const next = safeRedirectPath(searchParams.get("redirectTo"));
  const [name, setName] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // 3 Nov: no session until the address is verified, so the workspace can't be
  // made yet. The link comes back, through sign-in, to /no-workspace with this name.
  const [checkingInbox, setCheckingInbox] = useState(false);
  const afterVerifying = next ?? newWorkspacePath(agencyName);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signUp.email({ name, email, password, callbackURL: afterVerifying });
    setLoading(false);
    if (result.error) {
      setError(result.error.message ?? "Sign up failed");
      return;
    }
    setCheckingInbox(true);
  }

  // Item 4: an invite's link -- its address filled in and locked, and the account joins that workspace.
  const invite = inviteFromPath(next);
  if (invite) return <InviteSignUp orgId={invite.orgId} token={invite.token} />;

  if (checkingInbox) {
    return (
      <CheckInbox
        email={email}
        callbackURL={afterVerifying}
        onStartAgain={() => setCheckingInbox(false)}
      />
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: "var(--bg-base)" }}>
      {/* Left panel */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 40,
          position: "relative",
          overflow: "hidden",
          borderRight: "1px solid var(--border-subtle)",
        }}
      >
        <div
          className="grid-bg"
          style={{ position: "absolute", inset: 0, opacity: 0.4, pointerEvents: "none" }}
        />

        <div style={{ position: "relative", zIndex: 1, alignSelf: "flex-start" }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <LogoMark />
          </Link>
        </div>

        <div style={{ position: "relative", zIndex: 1, maxWidth: 400 }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "2px 8px",
              borderRadius: 9999,
              fontSize: 11,
              fontWeight: 500,
              background: "var(--accent-blue-soft)",
              color: "var(--accent-blue)",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "var(--accent-blue)",
                animation: "pulse-soft 2.4s ease-in-out infinite",
              }}
            />
            Sydney · ap-southeast-2
          </span>
          <h2
            style={{
              marginTop: 20,
              fontSize: 30,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              lineHeight: 1.25,
              color: "var(--text-primary)",
            }}
          >
            The first GEO platform built for the Australian market.
          </h2>
          <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 12 }}>
            {FEATURES.map((text) => (
              <div
                key={text}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  fontSize: 13,
                  color: "var(--text-secondary)",
                }}
              >
                <Check
                  style={{ width: 16, height: 16, color: "var(--accent-blue)", flexShrink: 0 }}
                />
                {text}
              </div>
            ))}
          </div>
        </div>

        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <ThemeToggle />
          <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>Theme</span>
        </div>
      </div>

      {/* Right panel */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 40,
        }}
      >
        <div className="anim-fade-in-up" style={{ width: "100%", maxWidth: 360 }}>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            Create your account
          </h1>
          <p style={{ marginTop: 6, fontSize: 13, color: "var(--text-secondary)" }}>
            Start tracking AI visibility for your agency.
          </p>

          <form
            onSubmit={handleSubmit}
            style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 16 }}
          >
            {error && (
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 6,
                  fontSize: 13,
                  background: "var(--danger-soft)",
                  color: "var(--danger)",
                }}
              >
                {error}
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label
                htmlFor="signup-name"
                style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}
              >
                Full name
              </label>
              <input
                id="signup-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                required
                style={INPUT_STYLE}
              />
            </div>
            {!next && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <label
                  htmlFor="signup-agency"
                  style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}
                >
                  Agency name
                </label>
                <input
                  id="signup-agency"
                  type="text"
                  value={agencyName}
                  onChange={(e) => setAgencyName(e.target.value)}
                  placeholder="Your agency or business name"
                  required
                  style={INPUT_STYLE}
                />
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label
                htmlFor="signup-email"
                style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}
              >
                Email
              </label>
              <input
                id="signup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                style={INPUT_STYLE}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label
                htmlFor="signup-password"
                style={{ fontSize: 12, fontWeight: 500, color: "var(--text-secondary)" }}
              >
                Password
              </label>
              <input
                id="signup-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={`Min ${PASSWORD_MIN_LENGTH} characters`}
                required
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={PASSWORD_MAX_LENGTH}
                style={INPUT_STYLE}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 8,
                height: 40,
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                fontSize: 14,
                fontWeight: 500,
                background: "var(--accent-primary)",
                color: "var(--accent-primary-fg)",
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.5 : 1,
                width: "100%",
              }}
            >
              <UserPlus style={{ width: 14, height: 14 }} />
              {loading ? "Creating account..." : "Create account"}
            </button>
          </form>

          <div
            style={{
              marginTop: 24,
              textAlign: "center",
              fontSize: 13,
              color: "var(--text-tertiary)",
            }}
          >
            Already have an account?{" "}
            <Link
              href={authPagePath("/sign-in", next)}
              style={{ fontWeight: 500, color: "var(--text-primary)", textDecoration: "none" }}
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
