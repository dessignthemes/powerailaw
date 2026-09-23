"use client";

import { Fragment, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Citation } from "@/components/ai/types";

// Replaces [S#] markers with citation chips — but only for sources the
// server actually returned for this message.
function withCitations(children: ReactNode, citations: Citation[], onCite: (c: Citation) => void): ReactNode {
  const walk = (node: ReactNode, key: string): ReactNode => {
    if (typeof node === "string") {
      const parts = node.split(/(\[S\d{1,3}\])/g);
      if (parts.length === 1) return node;
      return parts.map((p, i) => {
        const m = p.match(/^\[(S\d{1,3})\]$/);
        const c = m && citations.find((x) => x.id === m[1]);
        if (!c) return <Fragment key={`${key}-${i}`}>{p}</Fragment>;
        return (
          <button
            key={`${key}-${i}`}
            onClick={() => onCite(c)}
            title={`${c.name}${c.page ? `, page ${c.page}` : c.section ? `, ${c.section}` : ""}`}
            className="inline-flex items-center align-baseline mx-0.5 px-1.5 rounded-md bg-card-alt border border-line text-[11.5px] font-medium text-ink hover:border-muted leading-[18px]"
          >
            {c.id.replace("S", "")}
          </button>
        );
      });
    }
    if (Array.isArray(node)) return node.map((n, i) => <Fragment key={`${key}.${i}`}>{walk(n, `${key}.${i}`)}</Fragment>);
    return node;
  };
  return walk(children, "c");
}

export default function Markdown({
  text,
  citations,
  onCite,
}: {
  text: string;
  citations: Citation[];
  onCite: (c: Citation) => void;
}) {
  const cite = (children: ReactNode) => withCitations(children, citations, onCite);
  return (
    <div className="ai-md text-[14.5px] leading-[1.65] break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="my-2.5 first:mt-0 last:mb-0">{cite(children)}</p>,
          li: ({ children }) => <li className="my-1">{cite(children)}</li>,
          td: ({ children }) => <td className="border border-line px-2.5 py-1.5 align-top">{cite(children)}</td>,
          th: ({ children }) => <th className="border border-line px-2.5 py-1.5 text-left bg-card-alt font-semibold">{children}</th>,
          h1: ({ children }) => <h3 className="font-display text-[18px] font-semibold mt-5 mb-2">{children}</h3>,
          h2: ({ children }) => <h3 className="font-display text-[16.5px] font-semibold mt-5 mb-2">{children}</h3>,
          h3: ({ children }) => <h4 className="text-[15px] font-semibold mt-4 mb-1.5">{children}</h4>,
          ul: ({ children }) => <ul className="list-disc pl-5 my-2.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 my-2.5">{children}</ol>,
          blockquote: ({ children }) => <blockquote className="border-l-2 border-line pl-3 text-muted my-3">{children}</blockquote>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              {children}
            </a>
          ),
          code: ({ children }) => <code className="mono text-[12.5px] bg-card-alt rounded px-1 py-0.5">{children}</code>,
          pre: ({ children }) => <pre className="mono text-[12.5px] bg-card-alt rounded-xl p-3 overflow-x-auto my-3">{children}</pre>,
          table: ({ children }) => (
            <div className="overflow-x-auto my-3">
              <table className="border-collapse text-[13.5px]">{children}</table>
            </div>
          ),
          hr: () => <hr className="my-4 border-line" />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
