// @vitest-environment jsdom
/**
 * S01 part 8 (contract P08.tier, P08.a11y; LLD 8.1.7): the report type picker.
 * - Three cards in tier order with appendix E's descriptions; a radiogroup named "Report type".
 * - A tier above the plan: aria-disabled with the plan in its name, the lock marker, "Available on Agency and up" and
 *   an Upgrade link to /pricing (reachable by keyboard: it sits outside the radio); clicking it selects nothing.
 * - Arrow keys move and select among the tiers the plan includes (skipping the locked one); Space selects.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ReportTierPicker } from "@/components/domain/reports/report-tier-picker";
import type { TierOption } from "@/lib/reports/report-tier-choice";
import type { ReportTier } from "@/lib/reports/report-tiers";
import { TIER_DESCRIPTIONS } from "@/lib/reports/report-tiers";

const GROWTH: TierOption[] = [
  { tier: "basic", name: "Basic", description: TIER_DESCRIPTIONS.basic, lockedPlan: null },
  { tier: "standard", name: "Standard", description: TIER_DESCRIPTIONS.standard, lockedPlan: null },
  {
    tier: "enhanced",
    name: "Enhanced",
    description: TIER_DESCRIPTIONS.enhanced,
    lockedPlan: "Agency",
  },
];

function Picker({ options, start }: { options: TierOption[]; start: ReportTier }) {
  const [value, setValue] = useState<ReportTier>(start);
  return <ReportTierPicker options={options} value={value} onChange={setValue} />;
}

beforeAll(() => {
  render(<Picker options={GROWTH} start="standard" />).unmount();
}, 60_000);

describe("the report type picker", () => {
  it("is a radiogroup named Report type with three cards in tier order and their descriptions", () => {
    render(<Picker options={GROWTH} start="standard" />);
    const group = screen.getByRole("radiogroup", { name: "Report type" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("data-testid"))).toEqual([
      "p08-tier-basic",
      "p08-tier-standard",
      "p08-tier-enhanced",
    ]);
    expect(radios[1]).toHaveAttribute("aria-checked", "true");
    expect(radios[1]).toHaveTextContent(TIER_DESCRIPTIONS.standard);
  });

  it("a tier above the plan is locked with the plan's name and an Upgrade link to /pricing", () => {
    render(<Picker options={GROWTH} start="standard" />);
    const locked = screen.getByRole("radio", { name: "Enhanced, available on Agency and up" });
    expect(locked).toHaveAttribute("aria-disabled", "true");
    expect(locked).toHaveAttribute("tabindex", "-1");
    const card = locked.parentElement as HTMLElement;
    expect(card).toHaveTextContent("Available on Agency and up");
    const upgrade = within(card).getByRole("link", { name: "Upgrade" });
    expect(upgrade).toHaveAttribute("href", "/pricing");
    expect(upgrade).not.toHaveAttribute("tabindex");
    fireEvent.click(locked);
    expect(locked).toHaveAttribute("aria-checked", "false");
  });

  it("arrow keys move and select among the included tiers, skipping the locked one; Space selects", () => {
    render(<Picker options={GROWTH} start="basic" />);
    const basic = screen.getByRole("radio", { name: "Basic" });
    const standard = screen.getByRole("radio", { name: "Standard" });
    expect(basic).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(basic, { key: "ArrowRight" });
    expect(standard).toHaveAttribute("aria-checked", "true");
    expect(document.activeElement).toBe(standard);
    // Past the end wraps to Basic: Enhanced is locked.
    fireEvent.keyDown(standard, { key: "ArrowDown" });
    expect(basic).toHaveAttribute("aria-checked", "true");
    fireEvent.keyDown(basic, { key: "ArrowLeft" });
    expect(standard).toHaveAttribute("aria-checked", "true");
    fireEvent.click(basic);
    expect(basic).toHaveAttribute("aria-checked", "true");
    fireEvent.keyDown(standard, { key: " " });
    expect(standard).toHaveAttribute("aria-checked", "true");
  });

  it("an agency's own names; nothing locked on Agency and up", () => {
    const onChange = vi.fn();
    render(
      <ReportTierPicker
        options={[
          { ...GROWTH[0], name: "Essentials" },
          { ...GROWTH[1], name: "Growth Plan" },
          { ...GROWTH[2], name: "Premium Audit", lockedPlan: null },
        ]}
        value="enhanced"
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("radio", { name: "Premium Audit" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.queryByRole("link", { name: "Upgrade" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Essentials" }));
    expect(onChange).toHaveBeenCalledWith("basic");
  });
});
