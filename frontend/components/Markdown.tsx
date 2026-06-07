/*
  Tutor markdown renderer.
  react-markdown + remark-gfm so real OpenAI output (nested emphasis, lists,
  tables, code fences, links) renders correctly. All visual styling lives in the
  `.tutor-md` scope in globals.css, driven by our design tokens — no generic
  library defaults bleed through.
*/

import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

// Inline links (e.g. tutor-written source mentions) open in a new tab.
const COMPONENTS: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};

// Normalize LaTeX delimiters to the $…$ / $$…$$ that remark-math understands.
// Covers the escaped forms \( \) and \[ \] that web-search content often uses.
function normalizeMath(src: string): string {
  return src
    .replace(/\\\[\s*([\s\S]+?)\s*\\\]/g, (_m, body) => `\n\n$$${body}$$\n\n`)
    .replace(/\\\(\s*([\s\S]+?)\s*\\\)/g, (_m, body) => `$${body}$`);
}

export function Markdown({
  source,
  streaming = false,
  size = "base",
}: {
  source: string;
  streaming?: boolean;
  size?: "base" | "lg";
}) {
  const cls = ["tutor-md", streaming && "is-streaming", size === "lg" && "is-lg"]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={cls}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={COMPONENTS}
      >
        {normalizeMath(source)}
      </ReactMarkdown>
    </div>
  );
}
