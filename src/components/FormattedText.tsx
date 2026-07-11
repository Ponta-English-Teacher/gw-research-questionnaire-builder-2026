import React from "react";

function parseInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter((p) => p.length > 0);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
}

/**
 * Renders lightweight markdown (headings, bullet/numbered lists, blank-line
 * paragraphs, **bold**) without pulling in a markdown dependency. AI chat
 * replies are prompted to use exactly this subset of formatting.
 */
export default function FormattedText({ content }: { content: string }) {
  const blocks = content.trim().split(/\n\s*\n/);

  return (
    <div className="space-y-2">
      {blocks.map((block, bi) => {
        const lines = block
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        if (lines.length === 0) return null;

        const isHeading = /^#{1,3}\s+/.test(lines[0]);
        const headingText = isHeading ? lines[0].replace(/^#{1,3}\s+/, "") : null;
        const remainingLines = isHeading ? lines.slice(1) : lines;

        const isList =
          remainingLines.length > 0 &&
          remainingLines.every((l) => /^[-*]\s+/.test(l) || /^\d+[.)]\s+/.test(l));

        return (
          <div key={bi}>
            {headingText && (
              <h4 className="font-semibold text-sm mt-1 mb-1">{parseInline(headingText)}</h4>
            )}
            {isList ? (
              <ul className="list-disc pl-5 space-y-1 text-sm">
                {remainingLines.map((l, li) => (
                  <li key={li}>{parseInline(l.replace(/^([-*]|\d+[.)])\s+/, ""))}</li>
                ))}
              </ul>
            ) : (
              remainingLines.length > 0 && (
                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                  {parseInline(remainingLines.join(" "))}
                </p>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}
