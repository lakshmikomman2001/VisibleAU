// @vitest-environment jsdom
/**
 * 2 Nov ("Upload instead does nothing in Brand basics") -- the logo
 * uploader: a real button opens the file picker (click, Enter or Space); a
 * PNG or JPEG up to 2 MB uploads and is shown; an oversize file, another
 * type, or an SVG that runs a script or loads other files says why and
 * uploads nothing; a clean SVG is drawn into a PNG and that uploads; the
 * server's refusals and failures say what to do. The SVG drawing itself
 * needs a canvas, which jsdom doesn't have: it's replaced here.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { LogoUploader } from "@/components/domain/branding/logo-uploader";
import { LOGO_ERRORS, LOGO_MAX_BYTES } from "@/lib/branding/logo";

const svg = vi.hoisted(() => ({ toPng: vi.fn() }));
vi.mock("@/lib/branding/svg-logo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/branding/svg-logo")>()),
  svgToPng: svg.toPng,
}));

const ORG = "6f9c1b0e-3c41-4a8e-9d55-0d7a1e2b3c4d";
const STORED = `/api/branding/logo/${ORG}/0b7e6a52-2f1d-4c3e-9a8b-7c6d5e4f3a2b.png`;
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);

function Harness({ initial = null }: { initial?: string | null }) {
  const [value, setValue] = useState<string | null>(initial);
  return <LogoUploader value={value} onChange={setValue} initials="SP" owner="the brand" />;
}

function fileInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector("input[type=file]") as HTMLInputElement;
}

function choose(container: HTMLElement, file: File) {
  fireEvent.change(fileInput(container), { target: { files: [file] } });
}

let fetchMock: ReturnType<typeof vi.fn>;
const realCreateObjectUrl = URL.createObjectURL;

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ logoUrl: STORED }), { status: 201 }));
  vi.stubGlobal("fetch", fetchMock);
  URL.createObjectURL = vi.fn(() => "blob:local-preview");
  svg.toPng.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  URL.createObjectURL = realCreateObjectUrl;
});

describe("the preview while it uploads", () => {
  it("is a data: URL -- the site's CSP (vercel.json) blocks blob: images", async () => {
    let finish: (r: Response) => void = () => {};
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const { container } = render(<Harness />);
    choose(container, new File([PNG], "splice.png", { type: "image/png" }));
    const img = await screen.findByRole("img", { name: "Logo for the brand" });
    expect(img.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
    expect(container.querySelector("[data-logo-status]")?.textContent).toBe("Uploading…");
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    finish(new Response(JSON.stringify({ logoUrl: STORED }), { status: 201 }));
    await waitFor(() =>
      expect(screen.getByRole("img", { name: "Logo for the brand" })).toHaveAttribute(
        "src",
        STORED,
      ),
    );
  });
});

describe("the button opens the file picker", () => {
  it("on click", async () => {
    const { container } = render(<Harness />);
    const click = vi.spyOn(fileInput(container), "click");
    await userEvent.click(screen.getByRole("button", { name: "Upload a logo for the brand" }));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it("on Enter and on Space, from the keyboard", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    const click = vi.spyOn(fileInput(container), "click");
    const button = screen.getByRole("button", { name: "Upload a logo for the brand" });
    await user.tab();
    expect(button).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(click).toHaveBeenCalledTimes(1);
    await user.keyboard(" ");
    expect(click).toHaveBeenCalledTimes(2);
  });

  it("has a visible focus ring, names whose logo it is, and points to the size and types", () => {
    render(<Harness />);
    const button = screen.getByRole("button", { name: "Upload a logo for the brand" });
    expect(button.className).toContain("focus-visible:outline");
    expect(button).toHaveAccessibleDescription("PNG, JPEG or SVG, up to 2 MB.");
    expect(fileInput(document.body).accept).toContain("image/png");
  });
});

describe("with no logo", () => {
  it("says 'No logo yet' beside the initials -- never that one was detected", () => {
    const { container } = render(<Harness />);
    expect(container.querySelector("[data-logo-status]")?.textContent).toBe(
      "No logo yet · Upload a logo for the brand",
    );
    expect(container.querySelector("[data-logo-tile]")?.textContent).toBe("SP");
    expect(container.textContent).not.toMatch(/detected/i);
  });
});

describe("a valid file", () => {
  it("a PNG uploads, then the stored logo is shown", async () => {
    const { container } = render(<Harness />);
    choose(container, new File([PNG], "splice.png", { type: "image/png" }));
    await waitFor(() =>
      expect(screen.getByRole("img", { name: "Logo for the brand" })).toHaveAttribute(
        "src",
        STORED,
      ),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/branding/logo");
    expect(init.method).toBe("POST");
    const sent = (init.body as FormData).get("file") as File;
    expect(sent.name).toBe("splice.png");
    expect(container.querySelector("[data-logo-status]")?.textContent).toContain("Logo uploaded");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a JPEG uploads too", async () => {
    const { container } = render(<Harness />);
    choose(container, new File([JPEG], "splice.jpg", { type: "image/jpeg" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("a clean SVG is drawn into a PNG, and the PNG is what uploads", async () => {
    svg.toPng.mockResolvedValue(new Blob([PNG], { type: "image/png" }));
    const { container } = render(<Harness />);
    choose(
      container,
      new File(
        ['<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>'],
        "logo.svg",
        {
          type: "image/svg+xml",
        },
      ),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(svg.toPng).toHaveBeenCalledTimes(1);
    const sent = ((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as FormData).get(
      "file",
    ) as File;
    expect(sent.name).toBe("logo.png");
    expect(sent.type).toBe("image/png");
  });
});

describe("a file it can't take says why, and uploads nothing", () => {
  it("over 2 MB: 'File too large'", async () => {
    const big = new Uint8Array(LOGO_MAX_BYTES + 1);
    big.set(PNG);
    const { container } = render(<Harness />);
    choose(container, new File([big], "huge.png", { type: "image/png" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(LOGO_ERRORS.tooLarge);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a GIF, or a text file named .png: 'Use PNG, JPEG or SVG'", async () => {
    for (const file of [
      new File(["GIF89a...."], "logo.gif", { type: "image/gif" }),
      new File(["just text"], "logo.png", { type: "image/png" }),
    ]) {
      const { container, unmount } = render(<Harness />);
      choose(container, file);
      expect(await screen.findByRole("alert")).toHaveTextContent(LOGO_ERRORS.wrongType);
      unmount();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("an SVG that runs a script: refused, with what to use instead", async () => {
    const { container } = render(<Harness />);
    choose(
      container,
      new File(["<svg><script>alert(1)</script></svg>"], "logo.svg", { type: "image/svg+xml" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(LOGO_ERRORS.unsafeSvg);
    expect(svg.toPng).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the server's answer", () => {
  const cases: Array<[number, string]> = [
    [413, LOGO_ERRORS.tooLarge],
    [415, LOGO_ERRORS.wrongType],
    [403, LOGO_ERRORS.forbidden],
    [502, LOGO_ERRORS.failed],
    [500, LOGO_ERRORS.failed],
  ];
  for (const [status, message] of cases) {
    it(`${status}: '${message}', and the initials come back`, async () => {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "x" }), { status }));
      const { container } = render(<Harness />);
      choose(container, new File([PNG], "splice.png", { type: "image/png" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(container.querySelector("[data-logo-tile]")?.textContent).toBe("SP");
    });
  }

  it("no connection: 'Upload failed: try again'", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { container } = render(<Harness />);
    choose(container, new File([PNG], "splice.png", { type: "image/png" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(LOGO_ERRORS.failed);
  });
});

describe("Remove", () => {
  it("clears the logo, back to 'No logo yet'", async () => {
    const { container } = render(<Harness initial={STORED} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove the logo for the brand" }));
    expect(container.querySelector("[data-logo-status]")?.textContent).toBe(
      "No logo yet · Upload a logo for the brand",
    );
  });
});
