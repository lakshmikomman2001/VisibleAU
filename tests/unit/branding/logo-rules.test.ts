/**
 * 2 Nov -- the rules every logo upload follows (lib/branding/logo.ts and
 * lib/branding/svg-logo.ts): a PNG or JPEG judged by its own bytes; a
 * stored logo saved as the serving route's path, for its own workspace
 * only; an SVG refused when it runs a script or loads other files.
 */
import { describe, expect, it } from "vitest";
import {
  isOwnStoredLogo,
  LOGO_FILE,
  logoFormatOf,
  parseStoredLogoUrl,
  storedLogoPath,
  storedLogoUrl,
} from "@/lib/branding/logo";
import { svgLogoProblem } from "@/lib/branding/svg-logo";

const ORG = "6f9c1b0e-3c41-4a8e-9d55-0d7a1e2b3c4d";
const OTHER_ORG = "1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d";
const FILE = "0b7e6a52-2f1d-4c3e-9a8b-7c6d5e4f3a2b.png";

describe("a logo is a PNG or JPEG by its own bytes", () => {
  it("PNG and JPEG signatures; anything else, whatever it's called, is not", () => {
    expect(logoFormatOf(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe("png");
    expect(logoFormatOf(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg");
    expect(logoFormatOf(new TextEncoder().encode("GIF89a"))).toBeNull();
    expect(logoFormatOf(new TextEncoder().encode("<svg xmlns="))).toBeNull();
    expect(logoFormatOf(new TextEncoder().encode("<html><script>"))).toBeNull();
    expect(logoFormatOf(new Uint8Array([]))).toBeNull();
  });
});

describe("a stored logo's URL", () => {
  it("is the serving route's path, and the file sits in the workspace's branding folder", () => {
    expect(storedLogoUrl(ORG, FILE)).toBe(`/api/branding/logo/${ORG}/${FILE}`);
    expect(storedLogoPath(ORG, FILE)).toBe(`${ORG}/branding/${FILE}`);
    expect(parseStoredLogoUrl(storedLogoUrl(ORG, FILE))).toEqual({
      organizationId: ORG,
      file: FILE,
    });
  });

  it("belongs to the workspace that uploaded it, and nothing else passes", () => {
    expect(isOwnStoredLogo(storedLogoUrl(ORG, FILE), ORG)).toBe(true);
    expect(isOwnStoredLogo(storedLogoUrl(ORG, FILE), OTHER_ORG)).toBe(false);
    for (const url of [
      "https://example.com/logo.png",
      `https://app.vunnara.com.au/api/branding/logo/${ORG}/${FILE}`,
      `/api/branding/logo/${ORG}/../${FILE}`,
      `/api/branding/logo/${ORG}/${FILE.replace(".png", ".svg")}`,
      `/api/branding/logo/${ORG}/logo.png`,
      null,
      "",
    ]) {
      expect(isOwnStoredLogo(url, ORG), String(url)).toBe(false);
    }
  });

  it("a file name is a uuid and .png or .jpg -- never a path", () => {
    expect(LOGO_FILE.test(FILE)).toBe(true);
    for (const name of ["../secret.png", "..%2Fsecret.png", `${FILE}/x`, "a.png", `${FILE}.pdf`]) {
      expect(LOGO_FILE.test(name), name).toBe(false);
    }
  });
});

describe("an SVG logo is refused when it runs a script or loads other files", () => {
  it("plain shapes, gradients and an embedded PNG are fine", () => {
    expect(
      svgLogoProblem(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g"/></defs><rect width="10" height="10" fill="url(#g)"/><use href="#g"/><image href="data:image/png;base64,iVBORw0KGgo="/></svg>',
      ),
    ).toBeNull();
  });

  it("scripts, event handlers, embedded HTML, DTDs and outside references are not", () => {
    for (const svg of [
      "<svg><script>alert(1)</script></svg>",
      '<svg onload="alert(1)"></svg>',
      "<svg><foreignObject><div>x</div></foreignObject></svg>",
      '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg>&x;</svg>',
      '<svg><image href="https://evil.example/x.png"/></svg>',
      '<svg><use xlink:href="other.svg#a"/></svg>',
      '<svg><rect style="fill:url(https://evil.example/p)"/></svg>',
      "<svg><style>@import url(x.css);</style></svg>",
      "not an svg at all",
    ]) {
      expect(svgLogoProblem(svg), svg).not.toBeNull();
    }
  });
});
