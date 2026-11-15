// @vitest-environment jsdom
/**
 * 16 Nov, part 4 -- the wizard's "What kind of business?": Tradies, Allied health, SaaS / software and "Other local
 * business" (with a hint), and what each brings: the preview's questions and the business types offered first on
 * the confirmation card.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import {
  BUSINESS_KINDS,
  BusinessKindPicker,
} from "@/components/domain/vertical/business-kind-picker";
import { verticalEnum } from "@/db/schema/enums";
import { categoryChoices } from "@/lib/brands/category-choices";
import { wizardPreviewQuestions } from "@/lib/prompts/wizard-preview";
import { brandFormSchema } from "@/lib/schemas/brand";

describe("the wizard's business kinds", () => {
  it("offers Other local business beside Tradies, Allied health and SaaS, with a hint", () => {
    const onChange = vi.fn();
    render(<BusinessKindPicker value="" onChange={onChange} />);
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("data-business-kind"))).toEqual([
      "tradies",
      "allied_health",
      "saas",
      "local_business",
    ]);
    expect(screen.getByText("Other local business")).toBeInTheDocument();
    expect(screen.getByText(/Cafés, gyms, salons, shops, accountants/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Other local business/ }));
    expect(onChange).toHaveBeenCalledWith("local_business");
  });

  it("offers only verticals the database and the API take (professional services and real estate have no pack)", () => {
    for (const kind of BUSINESS_KINDS) {
      expect(verticalEnum.enumValues).toContain(kind.vertical);
      expect(brandFormSchema.shape.vertical.safeParse(kind.vertical).success, kind.vertical).toBe(
        true,
      );
    }
    expect(BUSINESS_KINDS.map((k) => k.vertical)).not.toContain("professional_services");
    expect(BUSINESS_KINDS.map((k) => k.vertical)).not.toContain("real_estate");
  });

  it("Other local business previews one example per local type, in the owner's suburb", () => {
    const examples = wizardPreviewQuestions("local_business", "NSW:Parramatta");
    expect(examples).toEqual([
      "Best cafés in Parramatta?",
      "Best gym in Parramatta?",
      "Best salon in Parramatta?",
      "Best local shop in Parramatta?",
      "Best accountant in Parramatta for small business?",
    ]);
  });

  it("puts the local types first on the confirmation card", () => {
    const { first } = categoryChoices("local_business", []);
    expect(first.slice(0, 6)).toEqual([
      "cafe",
      "hospitality_restaurant",
      "fitness_gym",
      "beauty_salon",
      "retail_shop",
      "accounting_practice",
    ]);
    expect(first).toContain("general");
    expect(first).not.toContain("trades_plumbing");
  });
});
