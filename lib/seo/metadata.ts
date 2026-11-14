import { DEFAULT_PAGE_TITLE, OG_IMAGE, PRODUCT_DESCRIPTION, PRODUCT_NAME } from "@/lib/brand";
import { SITE_URL } from "@/lib/product";

/**
 * A public page's title, description, canonical link and Open Graph / Twitter tags. The canonical and
 * og:url are the production site's (lib/product.ts SITE_URL), whatever environment built the page
 * (regression follow-ups, 9 Nov, part 4): they were the product's old domain where NEXT_PUBLIC_APP_URL wasn't
 * set.
 *
 * Rebrand (15 Nov), part 1 -- every name, line and image is lib/brand.ts's:
 *   - the share image (public/og/vunnara.png) is named here as well as in the root layout: a page that sets
 *     its own openGraph replaces the layout's, images included, so without it every public page shared no
 *     image;
 *   - the title is absolute: the root layout's template ("%s | Vunnara") would otherwise add the name twice;
 *   - the default description is PRODUCT_DESCRIPTION, no longer NEXT_PUBLIC_APP_DESCRIPTION's (an
 *     environment value that no environment set, and that could have carried any name).
 */
export function buildMetadata({
  title,
  description,
  path,
}: {
  title?: string;
  description?: string;
  path: string;
}) {
  const fullTitle = title ? `${title} | ${PRODUCT_NAME}` : DEFAULT_PAGE_TITLE;
  const desc = description ?? PRODUCT_DESCRIPTION;
  const url = new URL(path, SITE_URL).href;

  return {
    title: { absolute: fullTitle },
    description: desc,
    openGraph: {
      type: "website" as const,
      locale: "en_AU",
      title: fullTitle,
      description: desc,
      siteName: PRODUCT_NAME,
      url,
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image" as const,
      title: fullTitle,
      description: desc,
      images: [{ url: OG_IMAGE.url, alt: OG_IMAGE.alt }],
    },
    alternates: { canonical: url },
  };
}
