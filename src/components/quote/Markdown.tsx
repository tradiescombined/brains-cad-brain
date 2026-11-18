import { Fragment } from "react";
import { parseMarkdown, type Inline } from "./md-parse";
import { cx } from "@/lib/format";

function Line({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) => (p.bold ? <strong key={i} className="font-semibold">{p.text}</strong> : <Fragment key={i}>{p.text}</Fragment>))}
    </>
  );
}

/** Renders the markdown subset from ./markdown.ts. Server and client safe. */
export function Markdown({ text, className }: { text: string | null | undefined; className?: string }) {
  const blocks = parseMarkdown(text);
  if (!blocks.length) return null;
  return (
    <div className={cx("space-y-2", className)}>
      {blocks.map((b, i) =>
        b.type === "p" ? (
          <p key={i}>
            {b.lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                <Line parts={l} />
              </Fragment>
            ))}
          </p>
        ) : (
          <ul key={i} className="list-disc space-y-0.5 pl-5">
            {b.items.map((l, j) => (
              <li key={j}><Line parts={l} /></li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
