/**
 * S01B part 4f (LLD amendment 55): every string a report PDF prints, with the font it's printed in, and the characters
 * that font has no glyph for. The identity tile once printed ".au domain" with a blank where its tick should be: the
 * PDF's mono font has none, and react-pdf draws nothing for a missing glyph.
 *
 * Reads the document's element tree as tests/helpers/pdf-text.ts does (function components called with their props,
 * `render` props with page 1), carrying the inherited font family and weight down from the page, views and text runs
 * (react-pdf inherits both). Each family and weight is resolved through react-pdf's own font store (Font.getFont: the
 * registered file, or its nearest registered weight) and checked with fontkit's hasGlyphForCodePoint.
 */
import { Font } from "@react-pdf/renderer";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { registerReportFonts } from "@/lib/reports/pdf/fonts";

export interface PrintedRun {
  text: string;
  fontFamily: string;
  fontWeight: number;
}

interface FontState {
  fontFamily: string;
  fontWeight: number;
}

type Props = Record<string, unknown> & { children?: ReactNode; style?: unknown };

const PAGE_ARGS = { pageNumber: 1, totalPages: 1, subPageNumber: 1, subPageTotalPages: 1 };

function styleOf(props: Props): Record<string, unknown> {
  const flat = (s: unknown): Record<string, unknown> =>
    Array.isArray(s)
      ? Object.assign({}, ...s.map(flat))
      : s && typeof s === "object"
        ? (s as Record<string, unknown>)
        : {};
  return {
    ...flat(props.style),
    ...(typeof props.fontFamily === "string" ? { fontFamily: props.fontFamily } : {}),
    ...(props.fontWeight !== undefined ? { fontWeight: props.fontWeight } : {}),
  };
}

function inherit(state: FontState, props: Props): FontState {
  const style = styleOf(props);
  const weight = style.fontWeight;
  return {
    fontFamily: typeof style.fontFamily === "string" ? style.fontFamily : state.fontFamily,
    fontWeight:
      typeof weight === "number"
        ? weight
        : weight === "bold"
          ? 700
          : weight === "normal"
            ? 400
            : state.fontWeight,
  };
}

/** Every text run the document prints, with its font. `root` is the <Document> element. */
export function printedRuns(root: ReactNode, base: FontState): PrintedRun[] {
  const out: PrintedRun[] = [];
  const walk = (node: unknown, state: FontState): void => {
    if (node === null || node === undefined || typeof node === "boolean") return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child, state);
      return;
    }
    if (typeof node === "string" || typeof node === "number") {
      const text = String(node);
      if (text.trim()) out.push({ text, ...state });
      return;
    }
    if (!isValidElement(node)) return;
    const el = node as ReactElement<Props>;
    if (typeof el.type === "function") {
      walk((el.type as (p: Props) => ReactNode)(el.props), state);
      return;
    }
    const next = inherit(state, el.props);
    if (typeof el.props.render === "function")
      walk((el.props.render as (a: typeof PAGE_ARGS) => ReactNode)(PAGE_ARGS), next);
    walk(el.props.children, next);
  };
  walk(root, base);
  return out;
}

export interface MissingGlyph {
  fontFamily: string;
  fontWeight: number;
  char: string;
  codePoint: string;
  text: string;
}

/** The characters of `runs` their fonts can't draw (spaces and line breaks aside). */
export async function missingGlyphs(runs: readonly PrintedRun[]): Promise<MissingGlyph[]> {
  registerReportFonts();
  const missing: MissingGlyph[] = [];
  const seen = new Set<string>();
  for (const run of runs) {
    const source = Font.getFont({ fontFamily: run.fontFamily, fontWeight: run.fontWeight });
    if (!source) throw new Error(`No registered font for ${run.fontFamily} ${run.fontWeight}`);
    await source.load();
    const font = source.data as { hasGlyphForCodePoint: (cp: number) => boolean } | null;
    if (!font) throw new Error(`${run.fontFamily} ${run.fontWeight} didn't load`);
    for (const char of run.text) {
      if (/\s/.test(char)) continue;
      const cp = char.codePointAt(0) ?? 0;
      const key = `${run.fontFamily}|${source.fontWeight}|${cp}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!font.hasGlyphForCodePoint(cp))
        missing.push({
          fontFamily: run.fontFamily,
          fontWeight: source.fontWeight,
          char,
          codePoint: `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`,
          text: run.text,
        });
    }
  }
  return missing;
}
