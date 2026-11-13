import type { CSSProperties, ReactNode } from "react";
import { type Block, type Inline, parseMarkdown } from "@/lib/answers/markdown";

/**
 * 13 Nov (Sri's walk-through, part 10): an AI answer as formatted text -- bold, lists, tables, links -- not
 * raw markdown. Built from lib/answers/markdown.ts's data as React elements: no HTML is ever set, so an
 * answer's `<script>` shows as text, and only http(s) links are links (opened in a new tab, rel="noopener
 * noreferrer nofollow", without tracking parameters).
 */

const cell: CSSProperties = {
  border: "1px solid var(--border-default)",
  padding: "4px 8px",
  textAlign: "left",
  verticalAlign: "top",
};

function inlines(nodes: Inline[], key = ""): ReactNode[] {
  return nodes.map((node, i) => {
    const k = `${key}${i}`;
    switch (node.kind) {
      case "text":
        return node.text;
      case "break":
        return <br key={k} />;
      case "strong":
        return <strong key={k}>{inlines(node.children, `${k}-`)}</strong>;
      case "em":
        return <em key={k}>{inlines(node.children, `${k}-`)}</em>;
      case "code":
        return (
          <code key={k} style={{ fontFamily: "var(--font-mono)", fontSize: "0.95em" }}>
            {node.text}
          </code>
        );
      case "link":
        return (
          <a
            key={k}
            href={node.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            style={{ color: "var(--accent-blue)", overflowWrap: "anywhere" }}
          >
            {inlines(node.children, `${k}-`)}
          </a>
        );
    }
    return null;
  });
}

function block(b: Block, i: number): ReactNode {
  switch (b.kind) {
    case "heading":
      return (
        <p key={i} style={{ fontWeight: 600, color: "var(--text-primary)", margin: "8px 0 4px" }}>
          {inlines(b.children)}
        </p>
      );
    case "paragraph":
      return (
        <p key={i} style={{ margin: "0 0 6px" }}>
          {inlines(b.children)}
        </p>
      );
    case "list": {
      const List = b.ordered ? "ol" : "ul";
      return (
        <List key={i} style={{ margin: "0 0 6px", paddingLeft: 20 }}>
          {b.items.map((item, j) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a parsed answer is static -- its parts never reorder
            <li key={`${i}-${j}`}>
              {inlines(item.children)}
              {item.sublist && (
                <ul style={{ margin: "2px 0", paddingLeft: 18 }}>
                  {item.sublist.items.map((sub, k) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: a parsed answer is static -- its parts never reorder
                    <li key={`${i}-${j}-${k}`}>{inlines(sub.children)}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </List>
      );
    }
    case "table":
      return (
        <div key={i} style={{ overflowX: "auto", margin: "0 0 8px" }}>
          <table style={{ borderCollapse: "collapse", fontSize: "inherit" }}>
            <thead>
              <tr>
                {b.header.map((h, j) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: a parsed answer is static -- its parts never reorder
                  <th key={`${i}-h${j}`} style={{ ...cell, fontWeight: 600 }}>
                    {inlines(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((row, r) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: a parsed answer is static -- its parts never reorder
                <tr key={`${i}-r${r}`}>
                  {row.map((c, j) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: a parsed answer is static -- its parts never reorder
                    <td key={`${i}-r${r}-${j}`} style={cell}>
                      {inlines(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "code":
      return (
        <pre
          key={i}
          style={{ whiteSpace: "pre-wrap", fontFamily: "var(--font-mono)", margin: "0 0 6px" }}
        >
          {b.text}
        </pre>
      );
    case "rule":
      return (
        <hr
          key={i}
          style={{ border: 0, borderTop: "1px solid var(--border-subtle)", margin: "8px 0" }}
        />
      );
  }
}

export function AnswerMarkdown({ text }: { text: string }) {
  return <>{parseMarkdown(text).map(block)}</>;
}
