export interface PdfTheme {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  footerText: string;
  contactLine: string;
  agencyName: string | null;
}

export function assetToTheme(asset: {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  logoUrl?: string | null;
  footerText?: string | null;
  contactLine?: string | null;
  agencyName?: string | null;
} | null): PdfTheme {
  return {
    primaryColor: asset?.primaryColor ?? "#0066CC",
    secondaryColor: asset?.secondaryColor ?? "#1A1A1A",
    accentColor: asset?.accentColor ?? "#FF6B35",
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
