import { PRODUCT_NAME, SITE_URL } from "@/lib/product";

/**
 * A public page's title, description, canonical link and Open Graph / Twitter tags. The canonical and
 * og:url are the production site's (lib/product.ts SITE_URL), whatever environment built the page
 * (regression follow-ups, 9 Nov, part 4): they were the old visibleau.com where NEXT_PUBLIC_APP_URL wasn't
 * set. No og:image until one exists: /og-image.png was named here but never added to public/, so every
 * shared page pointed at a 404.
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
  const fullTitle = title
    ? `${title} | ${PRODUCT_NAME}`
    : `${PRODUCT_NAME} — AI Search Visibility for Australian SMBs`;
  const desc =
    description ??
    process.env.NEXT_PUBLIC_APP_DESCRIPTION ??
    "Audit your brand's visibility across AI search engines";
  const url = new URL(path, SITE_URL).href;

  return {
    title: fullTitle,
    description: desc,
    openGraph: {
      title: fullTitle,
      description: desc,
      siteName: PRODUCT_NAME,
      url,
    },
    twitter: { card: "summary" as const },
    alternates: { canonical: url },
  };
}
