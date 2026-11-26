import path from "node:path";
import { Font } from "@react-pdf/renderer";

/**
 * DEMO-BLOCKER (1 Nov), part 4 -- the report's three typefaces, bundled
 * here as TTF files (each family's OFL licence beside it) and registered
 * from disk: no font is fetched from the network at render time.
 * next.config.ts's outputFileTracingIncludes ships this folder with the
 * Inngest route that renders the PDF.
 *
 * - Fraunces 400/600/700: titles, the h2s, hero and KPI numbers, narrative
 * - Inter 400/500/600/700: body, tables, labels
 * - JetBrains Mono NL 400/500: evidence blocks only. S03 part 0 (LLD amendment 76): the official build without
 *   ligatures (v2.304, same metrics), since react-pdf's fontkit threw "Offset is outside the bounds of the DataView"
 *   laying out JetBrains Mono's ligature sequences ("--", "...", "::", "//", "->", "==", "++", "</").
 */
export const REPORT_FONT_DIR = path.join(process.cwd(), "lib", "reports", "pdf", "fonts");

const file = (family: string, name: string) => path.join(REPORT_FONT_DIR, family, name);

let registered = false;

export function registerReportFonts(): void {
  if (registered) return;
  Font.register({
    family: "Inter",
    fonts: [
      { src: file("inter", "Inter-Regular.ttf"), fontWeight: 400 },
      { src: file("inter", "Inter-Medium.ttf"), fontWeight: 500 },
      { src: file("inter", "Inter-SemiBold.ttf"), fontWeight: 600 },
      { src: file("inter", "Inter-Bold.ttf"), fontWeight: 700 },
    ],
  });
  Font.register({
    family: "Fraunces",
    fonts: [
      { src: file("fraunces", "Fraunces-Regular.ttf"), fontWeight: 400 },
      { src: file("fraunces", "Fraunces-SemiBold.ttf"), fontWeight: 600 },
      { src: file("fraunces", "Fraunces-Bold.ttf"), fontWeight: 700 },
    ],
  });
  Font.register({
    family: "JetBrains Mono NL",
    fonts: [
      { src: file("jetbrains-mono-nl", "JetBrainsMonoNL-Regular.ttf"), fontWeight: 400 },
      { src: file("jetbrains-mono-nl", "JetBrainsMonoNL-Medium.ttf"), fontWeight: 500 },
    ],
  });
  // Never split a word across lines with a hyphen (a question, a name).
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}
