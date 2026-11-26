// @vitest-environment jsdom
/**
 * S01 part 0 (carry-over from S00 part 4; LLD 8.8.2, T2): the wizard offers the site's own name.
 *
 * In production on 23 Nov 2026, GET /api/brands/name-suggestion?domain=wrenhomeservices.com.au answered
 * {"name":"Wren Home Services","source":"og:site_name",...}, but a name typed before the domain ("wrenhomeservices")
 * kept the field, and the answer was stored without being shown (wizard-form.tsx before S01: it filled the name only
 * while the field was empty or still the wizard's suggestion). Now the answer is offered beside the name ("Use ..."),
 * and inside the run-together notice next to "Keep". A typed name is never replaced without a click.
 *
 * The route's answers here are recorded ones (no live site); a failed ask shows no suggestion, the form stays usable,
 * and the failure is kept the way useLoad keeps one (status and HTTP status), never dropped.
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

/** The production answer for wrenhomeservices.com.au, 23 Nov 2026 (S01 prompt, Part 0), as recorded. */
const HERO_ANSWER = {
  name: "Wren Home Services",
  source: "og:site_name",
  aliases: ["wrenhomeservices", "WrenHomeServices"],
};
const NUMBATEK_ANSWER = { name: "NumbaTek IT", source: "title", aliases: [] };

function stubRoute(respond: () => Response | Promise<Response>) {
  const fetchImpl = vi.fn(async (_url: string) => respond());
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
const askStatus = () =>
  nameField().closest("[data-site-name-ask]")?.getAttribute("data-site-name-ask");
const enterDomain = (value: string) => {
  fireEvent.change(domainField(), { target: { value } });
  fireEvent.blur(domainField());
};

describe("the wizard offers the site's name when the owner typed another", () => {
  it("wrenhomeservices typed first: the run-together notice offers 'Wren Home Services' next to Keep", async () => {
    stubRoute(() => Response.json(HERO_ANSWER));
    render(<WizardForm auditConfig={AUDIT_CONFIG} />);
    fireEvent.change(nameField(), { target: { value: "wrenhomeservices" } });
    enterDomain("wrenhomeservices.com.au");
    await waitFor(() => expect(askStatus()).toBe("answered"));

    const notice = document.querySelector("[data-name-run-together]");
    expect(notice).toHaveTextContent("“wrenhomeservices” is your web address without its spaces.");
    expect(notice).toHaveTextContent("Use “Wren Home Services” · Keep “wrenhomeservices”");
    // Never replaced without the click, and no second offer under the notice.
    expect(nameField()).toHaveValue("wrenhomeservices");
    expect(screen.queryByTestId("wizard-site-name-offer")).toBeNull();

    fireEvent.click(screen.getByTestId("wizard-use-site-name"));
    expect(nameField()).toHaveValue("Wren Home Services");
    expect(document.querySelector("[data-name-run-together]")).toBeNull();
    expect(document.querySelector('[data-name-suggested="site"]')).toHaveTextContent(
      "Suggested from your website's name. Edit if it's different.",
    );
  });

  it("another typed name: offered on its own line, kept until Use is clicked", async () => {
    stubRoute(() => Response.json(NUMBATEK_ANSWER));
    render(<WizardForm auditConfig={AUDIT_CONFIG} />);
    fireEvent.change(nameField(), { target: { value: "Quollen Group" } });
    enterDomain("numbatekit.com.au");
    await waitFor(() => expect(screen.getByTestId("wizard-site-name-offer")).toBeInTheDocument());
    expect(screen.getByTestId("wizard-site-name-offer")).toHaveTextContent(
      "Your website calls the business “NumbaTek IT”. Use “NumbaTek IT”",
    );
    expect(nameField()).toHaveValue("Quollen Group");
    fireEvent.click(screen.getByTestId("wizard-use-site-name"));
    expect(nameField()).toHaveValue("NumbaTek IT");
    expect(screen.queryByTestId("wizard-site-name-offer")).toBeNull();
  });

  it("an empty name is filled as before, and the name equal to the site's offers nothing", async () => {
    stubRoute(() => Response.json(HERO_ANSWER));
    render(<WizardForm auditConfig={AUDIT_CONFIG} />);
    enterDomain("wrenhomeservices.com.au");
    await waitFor(() => expect(nameField()).toHaveValue("Wren Home Services"));
    expect(screen.queryByTestId("wizard-site-name-offer")).toBeNull();
    expect(document.querySelector("[data-name-run-together]")).toBeNull();
  });

  it("no name from the site: no offer, the notice keeps only Keep", async () => {
    stubRoute(() => Response.json({ name: null, source: null, aliases: [] }));
    render(<WizardForm auditConfig={AUDIT_CONFIG} />);
    fireEvent.change(nameField(), { target: { value: "wrenhomeservices" } });
    enterDomain("wrenhomeservices.com.au");
    await waitFor(() => expect(askStatus()).toBe("answered"));
    expect(screen.queryByTestId("wizard-use-site-name")).toBeNull();
    expect(document.querySelector("[data-name-run-together]")).toHaveTextContent(
      "Keep “wrenhomeservices”",
    );
  });

  it("an answer for a domain the owner has since changed is dropped", async () => {
    let release: (r: Response) => void = () => {};
    stubRoute(() => new Promise<Response>((resolve) => (release = resolve)));
    render(<WizardForm auditConfig={AUDIT_CONFIG} />);
    fireEvent.change(nameField(), { target: { value: "Quollen Group" } });
    enterDomain("numbatekit.com.au");
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    fireEvent.change(domainField(), { target: { value: "quollen.com.au" } });
    release(Response.json(NUMBATEK_ANSWER));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("wizard-site-name-offer")).toBeNull();
    expect(askStatus()).toBe("idle");
  });
});

describe("a failed ask: no suggestion, the form usable, the failure kept", () => {
  it.each([
    ["a 500", () => Response.json({ error: "Internal" }, { status: 500 }), 500],
    ["a 429", () => Response.json({ error: "Too many" }, { status: 429 }), 429],
    [
      "no answer",
      () => {
        throw new TypeError("Failed to fetch");
      },
      null,
    ],
  ])("%s", async (_label, respond, httpStatus) => {
    stubRoute(respond);
    render(<WizardForm auditConfig={AUDIT_CONFIG} />);
    enterDomain("numbatekit.com.au");
    await waitFor(() => expect(askStatus()).toBe("failed"));
    expect(
      nameField().closest("[data-site-name-ask]")?.getAttribute("data-site-name-ask-http"),
    ).toBe(httpStatus === null ? "none" : String(httpStatus));
    expect(screen.queryByTestId("wizard-site-name-offer")).toBeNull();
    expect(nameField()).toHaveValue("");
    // Still usable: the owner types the name and can go on.
    fireEvent.change(nameField(), { target: { value: "NumbaTek IT" } });
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });
});

describe("no aliases are pre-filled (C-27)", () => {
  it("the brand is sent without the domain label or the name without spaces", async () => {
    const fetchImpl = stubRoute(() => Response.json(NUMBATEK_ANSWER));
    render(<WizardForm auditConfig={AUDIT_CONFIG} />);
    enterDomain("numbatekit.com.au");
    await waitFor(() => expect(nameField()).toHaveValue("NumbaTek IT"));
    expect(document.querySelector("[data-name-aliases]")).toBeNull();
    expect(String(fetchImpl.mock.calls[0][0])).toBe(
      "/api/brands/name-suggestion?domain=numbatekit.com.au",
    );
  });
});
