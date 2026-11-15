// @vitest-environment jsdom
/**
 * 17 Nov, part 3 -- the Signals page's lists. An audit that stored no list (or whose crawl never reached the
 * site) read "Based on 0 negative signals" and "No negative signals detected": a scan nobody ran shown as a clean
 * result. A null list is "Not checked" now; an empty list stays "No negative signals detected".
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { SignalsDetail } from "@/components/domain/technical/signals-detail";

describe("SignalsDetail", () => {
  it("null lists read 'Not checked' with the reason -- never 'No negative signals detected'", () => {
    const { container } = render(
      <SignalsDetail
        negativeSignals={null}
        promptInjections={null}
        notCheckedReason="No page was read on this audit."
      />,
    );
    expect(screen.getAllByText("Not checked. No page was read on this audit.")).toHaveLength(2);
    expect(container.textContent).not.toContain("No negative signals detected.");
    expect(container.textContent).not.toContain("No prompt injection detected.");
    expect(container.textContent).not.toContain("(0)");
  }, 20_000);

  it("a real empty scan is still 'No negative signals detected', with its count", () => {
    const { container } = render(<SignalsDetail negativeSignals={[]} promptInjections={[]} />);
    expect(screen.getByText("No negative signals detected.")).toBeInTheDocument();
    expect(container.textContent).toContain("(0)");
  });
});
