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
    ? `${title} | VisibleAU`
    : "VisibleAU — AI Search Visibility for Australian SMBs";
  const desc =
    description ??
    process.env.NEXT_PUBLIC_APP_DESCRIPTION ??
    "Audit your brand's visibility across AI search engines";
  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://visibleau.com"}${path}`;

  return {
    title: fullTitle,
    description: desc,
    openGraph: {
      title: fullTitle,
      description: desc,
      images: ["/og-image.png"],
      url,
    },
    twitter: { card: "summary_large_image" as const },
    alternates: { canonical: url },
  };
}
