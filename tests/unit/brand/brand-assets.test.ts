/**
 * Rebrand (15 Nov), part 1 -- the icons and the share image are lib/brand.ts's mark, not hand-made copies:
 * scripts/brand/generate-brand-assets.tsx draws each again here, and every committed file must be byte for byte
 * what it draws now. A change to the mark, its colours or the tagline fails this until `pnpm brand:assets` is run.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderBrandAssets } from "@/scripts/brand/generate-brand-assets";

describe("the committed brand assets", () => {
  it("are what the brand module draws now (run `pnpm brand:assets` if not)", async () => {
    const assets = await renderBrandAssets();
    expect(Object.keys(assets).sort()).toEqual([
      "app/apple-icon.png",
      "app/favicon.ico",
      "app/icon.svg",
      "public/icons/icon-192.png",
      "public/icons/icon-512.png",
      "public/icons/icon-maskable-512.png",
      "public/og/vunnara.png",
    ]);
    const stale = Object.entries(assets)
      .filter(([path, data]) => !readFileSync(join(process.cwd(), path)).equals(data))
      .map(([path]) => path);
    expect(stale).toEqual([]);
  }, 120_000);
});
