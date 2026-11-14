/**
 * Rebrand (15 Nov), part 1 -- draws every icon and the share image from lib/brand.ts, so they can't drift from
 * the mark the app and the PDF draw:
 *   app/icon.svg                        the mark (browsers that take an SVG icon)
 *   app/favicon.ico                     16, 32 and 48 px
 *   app/apple-icon.png                  180 px, square (iOS rounds it)
 *   public/icons/icon-192.png, -512     the manifest's icons
 *   public/icons/icon-maskable-512.png  square, for Android's own mask
 *   public/og/vunnara.png               1200 x 630, what a shared link shows
 *
 * Usage: pnpm brand:assets (writes the files). tests/unit/brand/brand-assets.test.ts renders them again and
 * fails when a committed file differs, so run this after changing the mark, the colours or the tagline.
 * Rendered with Next's own ImageResponse (satori + resvg), with the PDF's Inter fonts.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { ImageResponse } from "next/og";
import { BRAND_COLORS, brandMarkSvg, OG_IMAGE, PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";
import { SITE_DOMAIN } from "@/lib/product";

const ROOT = join(__dirname, "..", "..");
const INTER = join(ROOT, "lib", "reports", "pdf", "fonts", "inter");

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

async function toBuffer(response: ImageResponse): Promise<Buffer> {
  return Buffer.from(await response.arrayBuffer());
}

/** The mark alone as a PNG, `size` px square, transparent outside its rounded corners unless `rounded` is off. */
async function markPng(size: number, rounded: boolean): Promise<Buffer> {
  return toBuffer(
    new ImageResponse(
      <div style={{ display: "flex", width: "100%", height: "100%" }}>
        {/* biome-ignore lint/performance/noImgElement: satori draws <img>, not next/image */}
        <img src={svgDataUri(brandMarkSvg({ size, rounded }))} width={size} height={size} alt="" />
      </div>,
      { width: size, height: size },
    ),
  );
}

/** The share image: the mark and the name, the tagline under them, and the site's address. No figures. */
async function ogPng(): Promise<Buffer> {
  const font = (file: string) => readFileSync(join(INTER, file));
  return toBuffer(
    new ImageResponse(
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: "88px 96px",
          background: BRAND_COLORS.ground,
          fontFamily: "Inter",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
            {/* biome-ignore lint/performance/noImgElement: satori draws <img>, not next/image */}
            <img src={svgDataUri(brandMarkSvg({ size: 112 }))} width={112} height={112} alt="" />
            <div
              style={{
                fontSize: 104,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "#FAFAFA",
              }}
            >
              {PRODUCT_NAME}
            </div>
          </div>
          <div style={{ fontSize: 42, fontWeight: 400, color: "#D4D4D8" }}>{PRODUCT_TAGLINE}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 48, height: 6, borderRadius: 3, background: BRAND_COLORS.mark }} />
          <div style={{ fontSize: 30, fontWeight: 600, color: "#A1A1AA" }}>{SITE_DOMAIN}</div>
        </div>
      </div>,
      {
        width: OG_IMAGE.width,
        height: OG_IMAGE.height,
        fonts: [
          { name: "Inter", data: font("Inter-Regular.ttf"), weight: 400, style: "normal" },
          { name: "Inter", data: font("Inter-SemiBold.ttf"), weight: 600, style: "normal" },
          { name: "Inter", data: font("Inter-Bold.ttf"), weight: 700, style: "normal" },
        ],
      },
    ),
  );
}

/** An .ico holding each PNG as its own size (the format allows PNG entries; every current browser reads them). */
function ico(images: Array<{ size: number; png: Buffer }>): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries: Buffer[] = [];
  let offset = 6 + 16 * images.length;
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

/** Every brand asset, by its path from the repository root. */
export async function renderBrandAssets(): Promise<Record<string, Buffer>> {
  const favicon = await Promise.all(
    [16, 32, 48].map(async (size) => ({ size, png: await markPng(size, true) })),
  );
  return {
    "app/icon.svg": Buffer.from(brandMarkSvg()),
    "app/favicon.ico": ico(favicon),
    "app/apple-icon.png": await markPng(180, false),
    "public/icons/icon-192.png": await markPng(192, true),
    "public/icons/icon-512.png": await markPng(512, true),
    "public/icons/icon-maskable-512.png": await markPng(512, false),
    [`public${OG_IMAGE.url}`]: await ogPng(),
  };
}

async function main() {
  const assets = await renderBrandAssets();
  for (const [path, data] of Object.entries(assets)) {
    const target = join(ROOT, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, data);
    console.log(`[brand:assets] ${path} (${data.length} bytes)`);
  }
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/brand/generate-brand-assets.tsx")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
