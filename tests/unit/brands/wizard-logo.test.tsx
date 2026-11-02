// @vitest-environment jsdom
/**
 * 2 Nov ("Upload instead does nothing in Brand basics") -- the new-brand
 * wizard's logo row. Sri, 20:19: an "SP" initials tile beside "Logo
 * auto-detected from favicon.ico · Upload instead", and "Upload instead"
 * did nothing -- a <span> with no handler. Nothing had been detected
 * either: the initials meant the browser's own try at
 * https://<domain>/favicon.ico had failed, and nothing was stored.
 *
 * Now the row says "No logo yet" until a logo is uploaded, its button opens
 * the file picker, and the uploaded logo is saved with the brand. The pack
 * picker and prompt preview (their own fetches) are stood in for here.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { WizardForm } from "@/app/(auth)/brands/wizard/wizard-form";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/components/domain/set-breadcrumbs", () => ({ SetBreadcrumbs: () => null }));
vi.mock("@/components/domain/vertical/prompt-preview", () => ({ PromptPreview: () => null }));
vi.mock("@/components/domain/vertical/pack-browser", () => ({
  PackBrowser: ({ onSelect }: { onSelect: (pack: Record<string, unknown>) => void }) => (
    <button
      type="button"
      onClick={() =>
        onSelect({ id: "pack-trades", name: "Trades", promptsCount: 10, vertical: "tradies" })
      }
    >
      Pick Trades
    </button>
  ),
}));

const ORG = "6f9c1b0e-3c41-4a8e-9d55-0d7a1e2b3c4d";
const STORED = `/api/branding/logo/${ORG}/0b7e6a52-2f1d-4c3e-9a8b-7c6d5e4f3a2b.png`;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const CONFIG = { freeEngines: 2, freeRuns: 1, paidEngines: 4, paidRuns: 1, promptsPerAudit: 13 };

let fetchMock: ReturnType<typeof vi.fn>;
const realCreate = URL.createObjectURL;
const realRevoke = URL.revokeObjectURL;

beforeEach(() => {
  fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/branding/logo") {
      return new Response(JSON.stringify({ logoUrl: STORED }), { status: 201 });
    }
    if (url === "/api/brands") {
      return new Response(JSON.stringify({ brand: { id: "brand-1" } }), { status: 201 });
    }
    return new Response(JSON.stringify({ auditId: "audit-1" }), { status: 201 });
  });
  vi.stubGlobal("fetch", fetchMock);
  URL.createObjectURL = vi.fn(() => "blob:local-preview");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  URL.createObjectURL = realCreate;
  URL.revokeObjectURL = realRevoke;
});

async function brandBasics() {
  const user = userEvent.setup();
  const view = render(<WizardForm auditConfig={CONFIG} />);
  await user.type(screen.getByLabelText("Brand name"), "Splice Marketing");
  await user.type(screen.getByLabelText("Domain"), "splicemarketing.com.au");
  return { user, ...view };
}

describe("Brand basics' logo row says what's true", () => {
  it("no logo yet: the initials are a placeholder, nothing 'auto-detected from favicon.ico'", async () => {
    const { container } = await brandBasics();
    expect(container.querySelector("[data-logo-status]")?.textContent).toBe(
      "No logo yet · Upload a logo for the brand",
    );
    expect(container.querySelector("[data-logo-tile]")?.textContent).toBe("SP");
    expect(container.textContent).not.toMatch(/auto-detect|favicon|Upload instead/i);
  });

  it("'Upload a logo' opens the file picker", async () => {
    const { user, container } = await brandBasics();
    const input = container.querySelector("input[type=file]") as HTMLInputElement;
    const click = vi.spyOn(input, "click");
    await user.click(screen.getByRole("button", { name: "Upload a logo for the brand" }));
    expect(click).toHaveBeenCalledTimes(1);
  });
});

describe("an uploaded logo is saved with the brand", () => {
  it("uploads, says 'Logo uploaded', and goes with the brand when it's created", async () => {
    const { user, container } = await brandBasics();
    fireEvent.change(container.querySelector("input[type=file]") as HTMLInputElement, {
      target: { files: [new File([PNG], "splice.png", { type: "image/png" })] },
    });
    await waitFor(() =>
      expect(container.querySelector("[data-logo-status]")?.textContent).toContain("Logo uploaded"),
    );
    expect(screen.getByRole("img", { name: "Logo for the brand" })).toHaveAttribute("src", STORED);

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Pick Trades" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByLabelText(/No fixed location/));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(container.textContent).toContain("LogoUploaded");
    await user.click(screen.getByRole("button", { name: "Create brand & run first audit" }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/audits/audit-1"));
    const create = fetchMock.mock.calls.find((c) => c[0] === "/api/brands") as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(String(create[1].body))).toMatchObject({
      name: "Splice Marketing",
      domain: "splicemarketing.com.au",
      logoUrl: STORED,
    });
  });

  it("without a logo, none is sent", async () => {
    const { user } = await brandBasics();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Pick Trades" }));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByLabelText(/No fixed location/));
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Create brand & run first audit" }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => c[0] === "/api/brands")).toBe(true),
    );
    const create = fetchMock.mock.calls.find((c) => c[0] === "/api/brands") as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(String(create[1].body))).not.toHaveProperty("logoUrl");
  });
});
