// @vitest-environment jsdom
/**
 * "Record costs from what each provider actually reports" (6 Nov), item 4 -- "Provider usage:
 * US$..." was a hover-only title on the audit header (and the agency spend figure): phones,
 * keyboards and screen readers never saw it. It is now the accessible description of a real,
 * focusable button whose visible text stays the A$ cost; a tap shows it too.
 */
import "@testing-library/jest-dom/vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ProviderUsageCost } from "@/components/domain/shared/provider-usage-cost";

function renderCost() {
  render(
    <p>
      Audit #36 ·{" "}
      <ProviderUsageCost detail="Provider usage: US$0.47">A$0.72 cost</ProviderUsageCost>
    </p>,
  );
  return screen.getByRole("button", { name: "A$0.72 cost" });
}

// A cold first render can outlast a test's 5 s on this machine; pay for it here.
beforeAll(() => {
  renderCost();
  cleanup();
}, 60_000);

afterEach(cleanup);

describe("the provider's US$ usage is reachable by keyboard and tap", () => {
  it("the US$ text is the control's accessible description; the A$ figure is its name", () => {
    const button = renderCost();

    expect(button).toHaveAccessibleName("A$0.72 cost");
    expect(button).toHaveAccessibleDescription("Provider usage: US$0.47");
    expect(button).not.toHaveAttribute("title");
    expect(button).toHaveAttribute("type", "button");
  });

  it("a keyboard reaches it: Tab focuses the figure", async () => {
    const user = userEvent.setup();
    const button = renderCost();

    await user.tab();

    expect(button).toHaveFocus();
  });

  it("a tap shows the detail, a second tap or Escape hides it again", async () => {
    const user = userEvent.setup();
    const button = renderCost();
    const detail = screen.getByRole("tooltip", { hidden: true });
    expect(detail).toHaveTextContent("Provider usage: US$0.47");
    expect(detail).not.toHaveAttribute("data-open");

    await user.click(button);
    expect(detail).toHaveAttribute("data-open");

    await user.click(button);
    expect(detail).not.toHaveAttribute("data-open");

    await user.click(button);
    await user.keyboard("{Escape}");
    expect(detail).not.toHaveAttribute("data-open");
  });
});

describe("no cost detail is left as a hover-only title", () => {
  it("app/ and components/ have no title={`Provider usage...`} left", () => {
    const files = execFileSync("git", ["ls-files", "app", "components"], { encoding: "utf8" })
      .split("\n")
      .filter((file) => file.endsWith(".tsx"));
    const offenders = files.filter((file) =>
      /title=\{`Provider usage/.test(readFileSync(file, "utf8")),
    );

    expect(offenders).toEqual([]);
  });
});
