/**
 * The text a react-pdf document draws, read from its element tree: every
 * <Text> becomes one string (its nested strings joined), function
 * components are called with their props, and `render` props (page
 * numbers) are called with the given page. The report's components are
 * plain functions of their props (no hooks), so this is exactly what the
 * PDF prints, without parsing a compressed PDF.
 */
import { isValidElement, type ReactElement, type ReactNode } from "react";

export interface PageArgs {
  pageNumber: number;
  totalPages: number;
  subPageNumber: number;
  subPageTotalPages: number;
}

const DEFAULT_PAGE: PageArgs = {
  pageNumber: 1,
  totalPages: 1,
  subPageNumber: 1,
  subPageTotalPages: 1,
};

type Props = Record<string, unknown> & { children?: ReactNode };

function expand(node: unknown, page: PageArgs, visit: (n: unknown) => void): void {
  if (node === null || node === undefined || typeof node === "boolean") return;
  if (Array.isArray(node)) {
    for (const child of node) expand(child, page, visit);
    return;
  }
  visit(node);
}

/** Every string inside one element, joined (for one <Text>). */
function textOf(node: unknown, page: PageArgs): string {
  let out = "";
  const visit = (n: unknown): void => {
    if (typeof n === "string" || typeof n === "number") {
      out += String(n);
      return;
    }
    if (!isValidElement(n)) return;
    const el = n as ReactElement<Props>;
    if (typeof el.type === "function") {
      expand((el.type as (p: Props) => ReactNode)(el.props), page, visit);
      return;
    }
    if (typeof el.props.render === "function") {
      expand((el.props.render as (a: PageArgs) => ReactNode)(page), page, visit);
    }
    expand(el.props.children, page, visit);
  };
  expand(node, page, visit);
  return out;
}

export function collectPdfText(
  root: ReactNode,
  page: PageArgs = DEFAULT_PAGE,
  options: { skipSvg?: boolean } = {},
): string[] {
  const out: string[] = [];
  const visit = (n: unknown): void => {
    if (typeof n === "string" || typeof n === "number") {
      out.push(String(n));
      return;
    }
    if (!isValidElement(n)) return;
    const el = n as ReactElement<Props>;
    if (typeof el.type === "function") {
      expand((el.type as (p: Props) => ReactNode)(el.props), page, visit);
      return;
    }
    if (options.skipSvg && el.type === "SVG") return;
    if (el.type === "TEXT") {
      const text = textOf(n, page);
      if (text) out.push(text);
      return;
    }
    if (typeof el.props.render === "function") {
      expand((el.props.render as (a: PageArgs) => ReactNode)(page), page, visit);
    }
    expand(el.props.children, page, visit);
  };
  expand(root, page, visit);
  return out;
}

/** Every element of one primitive type ("SVG", "CIRCLE", …) the document draws, function components expanded. */
export function findPdfElements(root: ReactNode, type: string): ReactElement<Props>[] {
  const found: ReactElement<Props>[] = [];
  const visit = (n: unknown): void => {
    if (!isValidElement(n)) return;
    const el = n as ReactElement<Props>;
    if (typeof el.type === "function") {
      expand((el.type as (p: Props) => ReactNode)(el.props), DEFAULT_PAGE, visit);
      return;
    }
    if (el.type === type) found.push(el);
    if (typeof el.props.render === "function") {
      expand((el.props.render as (a: PageArgs) => ReactNode)(DEFAULT_PAGE), DEFAULT_PAGE, visit);
    }
    expand(el.props.children, DEFAULT_PAGE, visit);
  };
  expand(root, DEFAULT_PAGE, visit);
  return found;
}

type Style = Record<string, unknown>;

function styleOf(el: ReactElement<Props>): Style {
  const raw = el.props.style;
  if (Array.isArray(raw)) return Object.assign({}, ...raw.filter(Boolean));
  return (raw as Style | undefined) ?? {};
}

/** A text box in a row can narrow to its share of the row, so its lines wrap instead of running past the edge. */
function canNarrow(style: Style): boolean {
  const flex = style.flex;
  const shrink = style.flexShrink;
  return (
    (typeof flex === "number" && flex > 0) ||
    (typeof flex === "string" && flex.trim() !== "" && flex.trim() !== "0") ||
    (typeof shrink === "number" && shrink > 0) ||
    style.width !== undefined ||
    style.maxWidth !== undefined ||
    style.flexBasis !== undefined
  );
}

/**
 * 14 Nov, part 4 (Sri's review of audit #48: finding 2's action line ran off the page's right edge). react-pdf
 * (yoga) lays a row's children out at their natural width unless a child may shrink, so a long <Text> directly in
 * a flexDirection "row" <View> that has no flex, flexShrink, width, maxWidth or flexBasis doesn't wrap: it runs
 * past its box and the page. Every such text longer than `minLength` characters, with its text, function
 * components expanded. (The renderer's own layout isn't reachable from tests: @react-pdf/layout is only a
 * transitive dependency here.)
 */
export function textThatCannotWrap(root: ReactNode, minLength = 30): string[] {
  const found: string[] = [];
  const visit = (n: unknown, parentIsRow: boolean): void => {
    if (Array.isArray(n)) {
      for (const c of n) visit(c, parentIsRow);
      return;
    }
    if (!isValidElement(n)) return;
    const el = n as ReactElement<Props>;
    if (typeof el.type === "function") {
      visit((el.type as (p: Props) => ReactNode)(el.props), parentIsRow);
      return;
    }
    if (el.type === "TEXT") {
      const text = textOf(el, DEFAULT_PAGE);
      if (parentIsRow && text.length > minLength && !canNarrow(styleOf(el))) found.push(text);
      return;
    }
    // A row that wraps (flexWrap "wrap") moves a child that doesn't fit to the next line, whole.
    const style = el.type === "VIEW" ? styleOf(el) : {};
    const isRow = style.flexDirection === "row" && style.flexWrap !== "wrap";
    if (typeof el.props.render === "function") {
      visit((el.props.render as (a: PageArgs) => ReactNode)(DEFAULT_PAGE), isRow);
    }
    visit(el.props.children, isRow);
  };
  visit(root, false);
  return found;
}

/** Each PAGE element's text, in order, with its own page number. */
export function collectPdfPages(root: ReactNode, options: { skipSvg?: boolean } = {}): string[][] {
  const pages: ReactElement<Props>[] = [];
  const find = (n: unknown): void => {
    if (!isValidElement(n)) {
      if (Array.isArray(n)) for (const c of n) find(c);
      return;
    }
    const el = n as ReactElement<Props>;
    if (typeof el.type === "function") {
      find((el.type as (p: Props) => ReactNode)(el.props));
      return;
    }
    if (el.type === "PAGE") {
      pages.push(el);
      return;
    }
    expand(el.props.children, DEFAULT_PAGE, find);
  };
  find(root);
  return pages.map((el, i) =>
    collectPdfText(
      el,
      { pageNumber: i + 1, totalPages: pages.length, subPageNumber: 1, subPageTotalPages: 1 },
      options,
    ),
  );
}
