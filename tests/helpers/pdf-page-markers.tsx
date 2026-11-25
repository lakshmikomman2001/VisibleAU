import { renderToBuffer } from "@react-pdf/renderer";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";

/**
 * S01B part 6b (LLD amendment 52): the page each chosen text is laid out on in the real PDF. The renderer's layout
 * isn't reachable from tests (@react-pdf/layout is a transitive dependency), but its pagination calls every node's
 * `render` prop once more for each finished page, with `totalPages` set (resolvePageIndices, @react-pdf/layout 4.6):
 * so a zero-size marker View just before a text reports the page that text landed on.
 *
 * The marker has no size, style or children, so it moves nothing, as long as it isn't in a row or a container with a
 * gap (an extra child there would add a gap): `markPages` refuses to mark a text whose parent is either.
 */
type Props = {
  children?: ReactNode;
  style?: Record<string, unknown> | Array<Record<string, unknown>>;
  render?: unknown;
};

const textOf = (n: unknown): string => {
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(textOf).join("");
  if (!isValidElement(n)) return "";
  const el = n as ReactElement<Props>;
  if (typeof el.type === "function") return textOf((el.type as (p: Props) => ReactNode)(el.props));
  return textOf(el.props.children);
};

const flatStyle = (style: Props["style"]): Record<string, unknown> =>
  Array.isArray(style) ? Object.assign({}, ...style) : (style ?? {});

/** The pages (1-based) each label's texts were laid out on, in order. */
export async function markPages(
  doc: ReactElement,
  labels: Record<string, (text: string) => boolean>,
): Promise<Record<string, number[]>> {
  const hits: Record<string, number[]> = Object.fromEntries(
    Object.keys(labels).map((k) => [k, []]),
  );
  const marker = (label: string) =>
    createElement("VIEW", {
      render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages?: number }) => {
        if (totalPages !== undefined) hits[label].push(pageNumber);
        return null;
      },
    });

  // Function components expanded into the renderer's own elements, with a marker before each matching text.
  const expand = (n: ReactNode, parentStyle: Record<string, unknown> | null): ReactNode => {
    if (Array.isArray(n)) return n.flatMap((c) => withMarker(c, parentStyle));
    if (!isValidElement(n)) return n;
    const el = n as ReactElement<Props>;
    if (typeof el.type === "function")
      return expand((el.type as (p: Props) => ReactNode)(el.props), parentStyle);
    if (el.type === "TEXT") return el;
    // A fragment's children sit in its parent's box.
    const style = typeof el.type === "string" ? flatStyle(el.props.style) : parentStyle;
    return createElement(
      el.type as string,
      { ...el.props, key: el.key ?? undefined },
      ...([] as ReactNode[]).concat(el.props.children ?? []).flatMap((c) => withMarker(c, style)),
    );
  };
  const withMarker = (n: ReactNode, parentStyle: Record<string, unknown> | null): ReactNode[] => {
    if (isValidElement(n) && typeof n.type === "function")
      return ([] as ReactNode[])
        .concat(expand((n.type as (p: Props) => ReactNode)(n.props as Props), parentStyle))
        .flatMap((c) =>
          isValidElement(c) && c.type === "TEXT" ? withMarker(c, parentStyle) : [c],
        );
    if (isValidElement(n) && n.type === "TEXT") {
      const text = textOf(n);
      const label = Object.keys(labels).find((k) => labels[k](text));
      if (label) {
        const row =
          parentStyle?.flexDirection === "row" || parentStyle?.flexDirection === "row-reverse";
        const gap = ["gap", "rowGap", "columnGap"].some((g) => parentStyle?.[g] !== undefined);
        if (row || gap)
          throw new Error(
            `can't mark "${text}" without moving it: its parent is a row or has a gap`,
          );
        return [marker(label), n];
      }
      return [n];
    }
    return [expand(n, parentStyle)];
  };

  await renderToBuffer(expand(doc, null) as ReactElement<never>);
  return hits;
}
