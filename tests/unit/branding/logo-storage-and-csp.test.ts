// @vitest-environment jsdom
/**
 * 2 Nov -- what production's settings require of logo uploads, which a test
 * on local storage can't show:
 * - scripts/ensure-report-storage-bucket.ts made the "reports" bucket
 *   PDF-only, so a logo upload there is refused: logos have their own
 *   private "logos" bucket (PNG and JPEG, up to 2 MB);
 * - vercel.json's CSP allows data: images and not blob: ones, so the SVG
 *   is drawn from a data: URL (the uploader's preview: logo-uploader.test.tsx).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { svgToPng } from "@/lib/branding/svg-logo";
import { SupabaseStorageAdapter } from "@/lib/storage/supabase-adapter";

const supabase = vi.hoisted(() => ({
  buckets: [] as string[],
  download: vi.fn(),
  upload: vi.fn(async () => ({ error: null })),
}));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    storage: {
      from: (bucket: string) => {
        supabase.buckets.push(bucket);
        return { upload: supabase.upload, download: supabase.download };
      },
    },
  }),
}));

afterEach(() => {
  supabase.buckets.length = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Supabase storage: logos have their own bucket", () => {
  it("the adapter uses the bucket it's given; report PDFs stay in 'reports'", async () => {
    await new SupabaseStorageAdapter("logos").upload(
      "o/branding/f.png",
      Buffer.from("x"),
      "image/png",
    );
    await new SupabaseStorageAdapter().upload("o/r.pdf", Buffer.from("x"), "application/pdf");
    expect(supabase.buckets).toEqual(["logos", "reports"]);
  });

  it("download: the bytes; null when there's no such file; storage failing throws, without its URL", async () => {
    const adapter = new SupabaseStorageAdapter("logos");
    supabase.download.mockResolvedValueOnce({
      data: new Blob([new Uint8Array([1, 2, 3])]),
      error: null,
    });
    expect(await adapter.download("o/branding/f.png")).toEqual(Buffer.from([1, 2, 3]));
    supabase.download.mockResolvedValueOnce({
      data: null,
      error: { message: "Object not found", status: 400 },
    });
    expect(await adapter.download("o/branding/gone.png")).toBeNull();
    supabase.download.mockResolvedValueOnce({
      data: null,
      error: { message: "connect failed https://abc.supabase.co/storage", status: 503 },
    });
    await expect(adapter.download("o/branding/f.png")).rejects.toThrow(
      "Supabase Storage download failed: connect failed [url]",
    );
  });

  it("the setup script makes it private, PNG and JPEG only, up to 2 MB", () => {
    const script = readFileSync(
      join(process.cwd(), "scripts/ensure-logo-storage-bucket.ts"),
      "utf8",
    );
    expect(script).toContain('const BUCKET = "logos"');
    expect(script).toContain("public: false");
    expect(script).toContain('allowedMimeTypes: ["image/png", "image/jpeg"]');
    expect(script).toContain("fileSizeLimit: 2 * 1024 * 1024");
  });
});

describe("the site's CSP", () => {
  it("allows data: images, which the uploader's preview and the SVG drawing rely on", () => {
    const vercel = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
      headers: Array<{ headers: Array<{ key: string; value: string }> }>;
    };
    const csp = vercel.headers
      .flatMap((h) => h.headers)
      .find((h) => h.key === "Content-Security-Policy")?.value;
    const imgSrc = csp?.split(";").find((d) => d.trim().startsWith("img-src")) ?? "";
    expect(imgSrc).toContain("data:");
    expect(imgSrc).toContain("'self'");
  });

  it("svgToPng draws from a data: URL, never a blob: one", async () => {
    const createObjectURL = vi.fn(() => "blob:nope");
    URL.createObjectURL = createObjectURL;
    let src = "";
    class FakeImage {
      naturalWidth = 24;
      naturalHeight = 12;
      onload: () => void = () => {};
      set src(value: string) {
        src = value;
        this.onload();
      }
    }
    vi.stubGlobal("Image", FakeImage);
    const png = new Blob(["png"], { type: "image/png" });
    const drawImage = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toBlob: (done: (b: Blob) => void) => done(png),
    };
    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) =>
      tag === "canvas" ? canvas : realCreateElement(tag)) as typeof document.createElement);

    const out = await svgToPng('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="12"/>');

    expect(out).toBe(png);
    expect(src.startsWith("data:image/svg+xml")).toBe(true);
    expect(createObjectURL).not.toHaveBeenCalled();
    // The longest side becomes 512 pixels, keeping the shape.
    expect([canvas.width, canvas.height]).toEqual([512, 256]);
    expect(drawImage).toHaveBeenCalledTimes(1);
  });
});
