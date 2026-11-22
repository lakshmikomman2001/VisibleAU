// @vitest-environment jsdom
/**
 * S00 part 4 (22 Nov; LLD 8.8.2, T2): the wizard asks the business's own site for its name when the domain is
 * entered (GET /api/brands/name-suggestion) and suggests it, editable: "TechCore IT" for techcoreit.com.au, never
 * the run-together label. The aliases it will save are shown under the name, and sent with the brand along with the
 * suggestion. A name the owner typed is never replaced.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { WizardForm } from "@/app/(auth)/brands/wizard/wizard-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));
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

function stubSuggestion(answer: {
  name: string | null;
  source: string | null;
  aliases?: string[];
}) {
  const fetchImpl = vi.fn(async (_url: string) => Response.json({ aliases: [], ...answer }));
  vi.stubGlobal("fetch", fetchImpl);
  return fetchImpl;
}

beforeAll(() => {
  render(<WizardForm auditConfig={AUDIT_CONFIG} />).unmount();
}, 60_000);

afterEach(() => {
  vi.unstubAllGlobals();
});

const domainField = () => screen.getByLabelText("Domain");
const nameField = () => screen.getByLabelText("Brand name");

describe("the wizard suggests the site's own name", () => {
  it("techcoreit.com.au -> 'TechCore IT', said to come from the website, editable", async () => {
    const fetchImpl = stubSuggestion({ name: "TechCore IT", source: "title" });
    render(<WizardForm auditConfig={AUDIT_CONFIG} />);
    fireEvent.change(domainField(), { target: { value: "techcoreit.com.au" } });
    fireEvent.blur(domainField());
    await waitFor(() => expect(nameField()).toHaveValue("TechCore IT"));
    expect(String(fetchImpl.mock.calls[0][0])).toBe(
      "/api/brands/name-suggestion?domain=techcoreit.com.au",
    );
    expect(document.querySelector('[data-name-suggested="site"]')).toHaveTextContent(
      "Suggested from your website's name. Edit if it's different.",
    );
    // S01 part 0 (LLD section 0.2 #5, contract C-27: "stop suggesting the name without spaces or the domain stem"):
    // no aliases are pre-filled, so the "Also recognised as techcoreit and TechCoreIT" line S00 showed is gone.
    expect(document.querySelector("[data-name-aliases]")).toBeNull();
    fireEvent.change(nameField(), { target: { value: "TechCore IT Services" } });
    expect(document.querySelector('[data-name-suggested="site"]')).toBeNull();
  });

  it("never replaces a name the owner already typed", async () => {
    stubSuggestion({ name: "TechCore IT", source: "og:site_name" });
    render(<WizardForm auditConfig={AUDIT_CONFIG} />);
    fireEvent.change(nameField(), { target: { value: "Astorio Group" } });
    fireEvent.change(domainField(), { target: { value: "techcoreit.com.au" } });
    fireEvent.blur(domainField());
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(nameField()).toHaveValue("Astorio Group");
  });

  it("a suggestion from the domain alone, or none, changes nothing", async () => {
    stubSuggestion({ name: null, source: null });
    render(<WizardForm auditConfig={AUDIT_CONFIG} />);
    fireEvent.change(domainField(), { target: { value: "techcoreit.com.au" } });
    fireEvent.blur(domainField());
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(nameField()).toHaveValue("");
  });

  it("a failed request changes nothing (the owner types the name)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "no" }, { status: 429 })),
    );
    render(<WizardForm auditConfig={AUDIT_CONFIG} />);
    fireEvent.change(domainField(), { target: { value: "hero-home-services.com.au" } });
    fireEvent.blur(domainField());
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(nameField()).toHaveValue("Hero Home Services");
    expect(document.querySelector("[data-name-suggested]")).toHaveTextContent(
      "From your web address. Change it if customers write it differently.",
    );
  });
});
