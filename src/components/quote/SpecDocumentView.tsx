/**
 * Renders a built specification document (sections by costing category, clauses, items with
 * detail text and images). Pure presentational: used by the quote document and the spec print page.
 */
import { Markdown } from "./Markdown";
import type { SpecDocItem, SpecDocument } from "./spec-costings";

function Num({ n, show, muted }: { n: string; show: boolean; muted?: boolean }) {
  return show ? <span className={muted ? "mr-2 tabular-nums text-ink-500" : "mr-2 tabular-nums"}>{n}</span> : null;
}

function Item({ it, numbers }: { it: SpecDocItem; numbers: boolean }) {
  const text = it.detail?.trim() || it.notes?.trim();
  return (
    <div className="break-inside-avoid" data-testid="spec-doc-item">
      <h4 className="font-medium text-ink-900">
        <Num n={it.number} show={numbers} muted />
        {it.description}
      </h4>
      {text && <Markdown text={text} className="mt-0.5" />}
      {it.imageDataUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={it.imageDataUrl} alt={it.description} className="mt-1.5 max-h-56 max-w-[70%] rounded border border-ink-200 object-contain" />
      )}
    </div>
  );
}

export function SpecDocumentView({ doc, numbers }: { doc: SpecDocument; numbers: boolean }) {
  return (
    <div className="space-y-3">
      {doc.sections.map((s) => (
        <div key={s.id} data-testid="spec-doc-section">
          <h3 className="break-after-avoid font-semibold text-ink-900">
            <Num n={s.number} show={numbers} />
            {s.heading}
          </h3>
          {s.body && <Markdown text={s.body} className="mt-1" />}
          {(s.clauses.length > 0 || s.items.length > 0) && (
            <div className="mt-2 space-y-2 pl-5">
              {s.clauses.map((ch) => (
                <div key={ch.id} className="break-inside-avoid">
                  <h4 className="font-medium text-ink-900">
                    <Num n={ch.number} show={numbers} muted />
                    {ch.heading}
                  </h4>
                  {ch.body && <Markdown text={ch.body} className="mt-0.5" />}
                </div>
              ))}
              {s.items.map((it) => <Item key={it.id} it={it} numbers={numbers} />)}
            </div>
          )}
        </div>
      ))}
      {doc.inclusions && (
        <div data-testid="spec-doc-inclusions">
          <h3 className="break-after-avoid font-semibold text-ink-900">
            <Num n={doc.inclusions.number} show={numbers} />
            Inclusions
          </h3>
          {doc.inclusions.items.some((i) => i.detail?.trim() || i.imageDataUrl) ? (
            <div className="mt-2 space-y-2 pl-5">
              {doc.inclusions.items.map((it) => <Item key={it.id} it={it} numbers={numbers} />)}
            </div>
          ) : (
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {doc.inclusions.items.map((i) => (
                <li key={i.id}>
                  {i.description}
                  {i.notes && <span className="text-ink-500"> — {i.notes}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
