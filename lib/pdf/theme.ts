export interface PdfTheme {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  footerText: string;
  contactLine: string;
  agencyName: string | null;
}

/**
 * GST-free pricing (11 Nov), part 2 -- the report PDF's own colours, printed where a workspace has saved none.
 * Report colours, not the app's theme: the settings pages and the branding routes read them from here, so no
 * component holds a hex colour (tests/unit/theme/no-hex-in-components.test.ts).
 */
export const DEFAULT_REPORT_COLOURS = {
  primaryColor: "#0066CC",
  secondaryColor: "#1A1A1A",
  accentColor: "#FF6B35",
} as const;

/** The PDF's page, white whatever the app's theme (the branding preview's frame shows it). */
export const PDF_PAPER_COLOUR = "#ffffff";

export function assetToTheme(
  asset: {
    primaryColor?: string | null;
    secondaryColor?: string | null;
    accentColor?: string | null;
    logoUrl?: string | null;
    footerText?: string | null;
    contactLine?: string | null;
    agencyName?: string | null;
  } | null,
): PdfTheme {
  return {
    primaryColor: asset?.primaryColor ?? DEFAULT_REPORT_COLOURS.primaryColor,
    secondaryColor: asset?.secondaryColor ?? DEFAULT_REPORT_COLOURS.secondaryColor,
    accentColor: asset?.accentColor ?? DEFAULT_REPORT_COLOURS.accentColor,
    logoUrl: asset?.logoUrl ?? null,
    footerText: asset?.footerText ?? "Confidential",
    contactLine: asset?.contactLine ?? "",
    agencyName: asset?.agencyName ?? null,
  };
}

export function buildThemeStyles(theme: PdfTheme) {
  return {
    header: { backgroundColor: theme.primaryColor, padding: 16, marginBottom: 20 },
    accent: { color: theme.accentColor },
    bodyText: { color: theme.secondaryColor },
    footer: { color: "#666666", fontSize: 8 },
  };
}
