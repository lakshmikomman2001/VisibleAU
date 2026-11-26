// @vitest-environment jsdom
/**
 * 13 Nov (Sri's walk-through, part 2): the wizard's default brand name. A domain that shows its words
 * ("wren-home-services.com.au") suggests "Wren Home Services", editable before creating; a run-together
 * label used as the name ("wrenhomeservices") is asked about -- Continue waits until the owner writes it
 * the way customers do or keeps it -- never used silently.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { WizardForm } from "@/app/(auth)/brands/wizard/wizard-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));
// 16 Nov, part 4: the wizard's step 2 is the business-kind picker (it was the vertical-pack cards).
vi.mock("@/components/domain/vertical/business-kind-picker", () => ({
  BusinessKindPicker: () => null,
}));
vi.mock("@/components/domain/vertical/prompt-preview", () => ({ PromptPreview: () => null }));

const AUDIT_CONFIG = {
  freeEngines: 2,
  freeRuns: 1,
  paidEngines: 4,
  paidRuns: 1,
  promptsPerAudit: 10,
};
const continueButton = () => screen.getByRole("button", { name: "Continue" });

describe("the wizard's brand name", () => {
  it("a domain that shows its words suggests a readable name, which the owner can change", () => {
    render(<WizardForm auditConfig={AUDIT_CONFIG} />);
    fireEvent.change(screen.getByLabelText("Domain"), {
      target: { value: "wren-home-services.com.au" },
    });
    expect(screen.getByLabelText("Brand name")).toHaveValue("Wren Home Services");
    expect(document.querySelector("[data-name-suggested]")).toHaveTextContent(
      "From your web address. Change it if customers write it differently.",
    );
    expect(continueButton()).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Brand name"), {
      target: { value: "Wren Home Services Pty Ltd" },
    });
    // The owner's own name stands when the domain changes again.
    fireEvent.change(screen.getByLabelText("Domain"), { target: { value: "hero-homes.com.au" } });
    expect(screen.getByLabelText("Brand name")).toHaveValue("Wren Home Services Pty Ltd");
  });

  it("a run-together domain suggests nothing (the words can't be told apart)", () => {
    render(<WizardForm auditConfig={AUDIT_CONFIG} />);
    fireEvent.change(screen.getByLabelText("Domain"), {
      target: { value: "wrenhomeservices.com.au" },
    });
    expect(screen.getByLabelText("Brand name")).toHaveValue("");
    expect(continueButton()).toBeDisabled();
  });

  it("the run-together label as the name is asked about; Continue waits for an answer", () => {
    render(<WizardForm auditConfig={AUDIT_CONFIG} />);
    fireEvent.change(screen.getByLabelText("Domain"), {
      target: { value: "wrenhomeservices.com.au" },
    });
    fireEvent.change(screen.getByLabelText("Brand name"), {
      target: { value: "wrenhomeservices" },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("is your web address without its spaces");
    expect(continueButton()).toBeDisabled();
    // Writing it the way customers do answers it...
    fireEvent.change(screen.getByLabelText("Brand name"), {
      target: { value: "Wren Home Services" },
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(continueButton()).toBeEnabled();
    // ...and so does keeping it, on purpose.
    fireEvent.change(screen.getByLabelText("Brand name"), {
      target: { value: "wrenhomeservices" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Keep/ }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(continueButton()).toBeEnabled();
  });
});
