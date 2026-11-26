// @vitest-environment jsdom
/**
 * S02 part 4 (contract components Pill, Chip, Banner; docs/prototypes/token-map.md: "Add generic Pill / Chip / Banner
 * to components/shared"): each contract variant on the app's tokens (token-map's mapping), words always present,
 * the Banner's icon disc hidden from assistive technology.
 */
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { Banner, type BannerTone } from "@/components/shared/banner";
import { Chip } from "@/components/shared/chip";
import { Pill, type PillTone } from "@/components/shared/pill";

describe("Pill", () => {
  const cases: [PillTone, string, string][] = [
    ["neutral", "var(--bg-subtle)", "var(--text-secondary)"],
    ["ai", "var(--accent-blue-soft)", "var(--accent-blue)"],
    ["agency", "var(--agency-soft)", "var(--agency)"],
    ["branded", "var(--warning-soft)", "var(--warning)"],
    ["good", "var(--success-soft)", "var(--success)"],
    ["warn", "var(--warning-soft)", "var(--warning)"],
    ["bad", "var(--danger-soft)", "var(--danger)"],
  ];
  it.each(cases)("%s: the token-map's fill and text, 22px high, its words", (tone, fill, text) => {
    render(<Pill tone={tone} testId={`pill-${tone}`}>{`Label ${tone}`}</Pill>);
    const pill = screen.getByTestId(`pill-${tone}`);
    expect(pill).toHaveTextContent(`Label ${tone}`);
    expect(pill.style.background).toBe(fill);
    expect(pill.style.color).toBe(text);
    expect(pill.style.height).toBe("22px");
  });

  it("branded has the 30% warning border; the dot is decoration", () => {
    render(
      <Pill tone="branded" dot testId="pill">
        Names your business · not scored
      </Pill>,
    );
    const pill = screen.getByTestId("pill");
    expect(pill.style.border).toContain("color-mix(in srgb, var(--warning) 30%, transparent)");
    expect(pill.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});

describe("Chip (fact)", () => {
  it("the key, then the value in bold", () => {
    render(<Chip name="Service" value="Blocked drains" />);
    const value = screen.getByText("Blocked drains");
    expect(value.style.fontWeight).toBe("600");
    expect(value.parentElement).toHaveTextContent("Service: Blocked drains");
  });
});

describe("Banner", () => {
  const cases: [BannerTone, string, string][] = [
    ["neutral", "var(--bg-subtle)", "i"],
    ["info", "var(--accent-blue-soft)", "i"],
    ["warn", "var(--warning-soft)", "!"],
    ["good", "var(--success-soft)", "✓"],
    ["bad", "var(--danger-soft)", "!"],
  ];
  it.each(
    cases,
  )("%s: its fill and an 18px disc that assistive technology skips", (tone, fill, glyph) => {
    render(
      <Banner tone={tone} testId={`banner-${tone}`}>
        Message
      </Banner>,
    );
    const banner = screen.getByTestId(`banner-${tone}`);
    expect(banner.style.background).toBe(fill);
    const disc = banner.firstElementChild as HTMLElement;
    expect(disc).toHaveAttribute("aria-hidden", "true");
    expect(disc.textContent).toBe(glyph);
    expect(disc.style.width).toBe("18px");
  });

  it("the caller's role and actions", () => {
    render(
      <Banner tone="warn" role="alert" actions={<button type="button">Retry</button>}>
        We couldn't load the questions. Try again.
      </Banner>,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("We couldn't load the questions. Try again.");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
