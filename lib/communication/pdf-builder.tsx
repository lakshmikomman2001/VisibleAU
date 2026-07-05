import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import { eq, and, isNull } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { agencyBrandAssets } from "@/db/schema";
import { assetToTheme, buildThemeStyles } from "@/lib/pdf/theme";
import type { PdfTheme } from "@/lib/pdf/theme";
import type { ReportTone } from "./types";

/* ---------- types ---------- */

export interface ReportSectionData {
  title: string;
  body: string;
}

export interface BuildReportPdfParams {
  organizationId: string;
  headline: string;
  narrativeText: string;
  sections: ReportSectionData[];
  tone: ReportTone;
  brandId?: string | null;
}

/* ---------- tone helpers ---------- */

const TONE_LABELS: Record<ReportTone, string> = {
  professional: "Professional Report",
  plain_english: "Plain English Report",
  executive: "Executive Brief",
};

function tonePageSize(tone: ReportTone): "A4" | "LETTER" {
  return tone === "executive" ? "LETTER" : "A4";
}

/* ---------- React PDF component ---------- */

function NarrativeReport({
  headline,
  narrativeText,
  sections,
  tone,
  theme,
}: {
  headline: string;
  narrativeText: string;
  sections: ReportSectionData[];
  tone: ReportTone;
  theme: PdfTheme;
}) {
  const ts = buildThemeStyles(theme);

  const s = StyleSheet.create({
    page: {
      padding: 40,
      fontSize: 11,
      fontFamily: "Helvetica",
      color: "#333",
    },
    header: {
      ...ts.header,
      marginHorizontal: -40,
      marginTop: -40,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    headerText: { color: "#ffffff", fontSize: 16, fontWeight: "bold" },
    headerSub: { color: "rgba(255,255,255,0.7)", fontSize: 10 },
    headline: {
      fontSize: 18,
      fontWeight: "bold",
      color: ts.bodyText.color,
      marginBottom: 8,
    },
    narrativeText: {
      fontSize: 10,
      color: "#444",
      lineHeight: 1.5,
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: 12,
      fontWeight: "bold",
      color: ts.accent.color,
      marginBottom: 6,
      marginTop: 14,
    },
    sectionBody: {
      fontSize: 10,
      color: "#444",
      lineHeight: 1.5,
      marginBottom: 10,
    },
    footer: {
      position: "absolute",
      bottom: 20,
      left: 40,
      right: 40,
      ...ts.footer,
    },
    generatedDate: {
      fontSize: 9,
      color: "#888",
      marginBottom: 14,
    },
  });

  return (
    <Document>
      <Page size={tonePageSize(tone)} style={s.page}>
        {/* Header bar */}
        <View style={s.header}>
          <Text style={s.headerText}>
            {theme.agencyName ?? "VisibleAU"}
          </Text>
          <Text style={s.headerSub}>{TONE_LABELS[tone]}</Text>
        </View>

        {/* Headline */}
        <Text style={s.headline}>{headline}</Text>
        <Text style={s.generatedDate}>
          Generated: {new Date().toLocaleDateString("en-AU")}
        </Text>

        {/* Narrative intro */}
        {narrativeText ? (
          <Text style={s.narrativeText}>{narrativeText}</Text>
        ) : null}

        {/* Dynamic sections */}
        {sections.map((section, idx) => (
          <View key={`section-${idx}`}>
            <Text style={s.sectionTitle}>{section.title}</Text>
            <Text style={s.sectionBody}>{section.body}</Text>
          </View>
        ))}

        {/* Footer */}
        <View style={s.footer}>
          <Text>{theme.footerText || "Confidential"}</Text>
          {theme.contactLine ? <Text>{theme.contactLine}</Text> : null}
        </View>
      </Page>
    </Document>
  );
}

/* ---------- main export ---------- */

export async function buildReportPdf(
  params: BuildReportPdfParams,
): Promise<Buffer> {
  const { organizationId, headline, narrativeText, sections, tone, brandId } =
    params;

  // 1. Read agency_brand_assets for org's branding (brand-specific first, fall back to org-wide)
  const conditions = [
    eq(agencyBrandAssets.organizationId, organizationId),
  ];
  if (brandId) {
    conditions.push(eq(agencyBrandAssets.brandId, brandId));
  } else {
    conditions.push(isNull(agencyBrandAssets.brandId));
  }

  const [asset] = await serviceDb
    .select()
    .from(agencyBrandAssets)
    .where(and(...conditions))
    .limit(1);

  // If brand-specific not found and we searched for a brand, fall back to org-wide
  let resolvedAsset = asset ?? null;
  if (!resolvedAsset && brandId) {
    const [orgWide] = await serviceDb
      .select()
      .from(agencyBrandAssets)
      .where(
        and(
          eq(agencyBrandAssets.organizationId, organizationId),
          isNull(agencyBrandAssets.brandId),
        ),
      )
      .limit(1);
    resolvedAsset = orgWide ?? null;
  }

  // 2. Convert to theme using Sprint 9's helpers
  const theme = assetToTheme(resolvedAsset);

  // 3. Render to buffer
  const buffer = await renderToBuffer(
    <NarrativeReport
      headline={headline}
      narrativeText={narrativeText}
      sections={sections}
      tone={tone}
      theme={theme}
    />,
  );

  return buffer;
}
