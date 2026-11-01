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
