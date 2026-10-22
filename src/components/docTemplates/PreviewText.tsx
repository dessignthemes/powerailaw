"use client";

// Shows template text the way the Word file will look (see format.ts).
function inline(text: string, key: number) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <span key={key}>
      {parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : <span key={i}>{p}</span>))}
    </span>
  );
}

export default function PreviewText({ text, className = "" }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  return (
    <div className={`font-serif text-[13px] leading-relaxed ${className}`}>
      {lines.map((raw, i) => {
        const line = raw.replace(/\s+$/, "");
        if (line.trim() === "---") return <hr key={i} className="my-4 border-dashed border-line" />;
        if (!line.trim()) return <div key={i} className="h-3" />;
        if (line.startsWith("# ")) return <div key={i} className="text-center font-bold underline text-[15px] my-2">{line.slice(2)}</div>;
        if (line.startsWith("## ")) return <div key={i} className="font-bold my-1">{inline(line.slice(3), i)}</div>;
        if (line.startsWith("::")) return <div key={i} className="text-center">{inline(line.slice(2).trim(), i)}</div>;
        if (line.startsWith(">>")) return <div key={i} className="text-right">{inline(line.slice(2).trim(), i)}</div>;
        return <div key={i}>{inline(line, i)}</div>;
      })}
    </div>
  );
}
