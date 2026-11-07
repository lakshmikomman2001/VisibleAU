// @vitest-environment jsdom
/**
 * Team follow-ups (31 Oct), item 1 -- a pending invite on the Team page says who it's for: the address it
 * was sent to, the role and brands it gives, when it was sent and when it expires, with Resend and Cancel
 * for those who manage the team. On production the row showed only "analyst".
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type PendingInvite,
  PendingInviteRow,
} from "@/components/domain/governance/pending-invite-row";

const NOW = new Date("2026-11-07T01:00:00Z"); // 7 Nov, 12:00 in Sydney

const INVITE: PendingInvite = {
  id: "inv-1",
  role: "analyst",
  brandAccess: null,
  invitedAt: "2026-11-05T23:00:00Z", // 6 Nov in Sydney
  expiresAt: "2026-11-12T23:00:00Z", // 13 Nov in Sydney
  email: null, // their profile is in their own workspace
  invitedEmail: "lee.invitee@example.com",
};

function row(invite: Partial<PendingInvite> = {}, canManage = true) {
  const onResend = vi.fn();
  const onCancel = vi.fn();
  render(
    createElement(PendingInviteRow, {
      invite: { ...INVITE, ...invite },
      canManage,
      onResend,
      onCancel,
      now: NOW,
    }),
  );
  return { onResend, onCancel };
}

afterEach(cleanup);

describe("a pending invite says who it's for", () => {
  it("shows the address it was sent to, the role, brands, sent date and expiry", () => {
    row();
    expect(screen.getByText("lee.invitee@example.com")).toBeInTheDocument();
    expect(screen.getByText("Analyst")).toBeInTheDocument();
    expect(screen.getByText("All brands")).toBeInTheDocument();
    expect(screen.getByText("Sent 6 Nov")).toBeInTheDocument();
    expect(screen.getByText("Expires 13 Nov")).toBeInTheDocument();
  });

  it("says when an invite has expired, and how many brands it covers", () => {
    row({ expiresAt: "2026-11-02T23:00:00Z", brandAccess: ["b1", "b2"] });
    expect(screen.getByText("Expired 3 Nov")).toBeInTheDocument();
    expect(screen.getByText("2 brands")).toBeInTheDocument();
  });

  it("an invite from another year shows the year", () => {
    row({ invitedAt: "2025-12-30T01:00:00Z", expiresAt: "2026-01-06T01:00:00Z" });
    expect(screen.getByText("Sent 30 Dec 2025")).toBeInTheDocument();
    expect(screen.getByText("Expired 6 Jan")).toBeInTheDocument();
  });

  it("Resend re-sends to that address; Cancel cancels it", () => {
    const { onResend, onCancel } = row();
    fireEvent.click(screen.getByRole("button", { name: "Resend" }));
    expect(onResend).toHaveBeenCalledWith(
      expect.objectContaining({ id: "inv-1", invitedEmail: "lee.invitee@example.com" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledWith("inv-1");
  });

  it("an invite sent before addresses were kept says so, and can't be re-sent", () => {
    row({ invitedEmail: null, email: null });
    expect(screen.getByText(/Address not recorded/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resend" })).toBeDisabled();
  });

  it("someone who can't manage the team sees the invite without the buttons", () => {
    row({}, false);
    expect(screen.getByText("lee.invitee@example.com")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("wraps instead of overflowing on a phone: a long address breaks, the details and buttons wrap", () => {
    row({
      invitedEmail: "a-very-long-address-for-a-narrow-screen@an-agency-with-a-long-domain.com.au",
    });
    const root = document.querySelector("[data-pending-invite]");
    expect(root).toHaveClass("flex-wrap");
    expect(document.querySelector("[data-invite-email]")).toHaveClass("break-all");
    expect(screen.getByRole("button", { name: "Resend" }).parentElement).toHaveClass("flex-wrap");
  });
});
