import type { MetadataRoute } from "next";
import { BRAND_COLORS, BRAND_ICONS, PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";

/**
 * Rebrand (15 Nov), part 1 -- the web manifest (/manifest.webmanifest, a public route in middleware.ts): the
 * name, line and icons a phone shows when the app is added to its home screen, all from lib/brand.ts.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PRODUCT_NAME,
    short_name: PRODUCT_NAME,
    description: PRODUCT_TAGLINE,
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: BRAND_COLORS.ground,
    theme_color: BRAND_COLORS.ground,
    icons: BRAND_ICONS.map((icon) => ({ ...icon })),
  };
}
