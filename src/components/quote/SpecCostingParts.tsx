"use client";
/**
 * Costing-linked parts of the estimate Specifications tab: the spec items listed under a linked
 * category section (detail text + image, include/remove toggle) and the Export menu.
 * Item changes save immediately through their own server actions (not the section Save button).
 */
import { useState, useTransition } from "react";
import { Button, LinkButton, Textarea } from "@/components/ui";
import { Modal } from "@/components/ui/client";
import { cx, num } from "@/lib/format";
import { Markdown } from "./Markdown";

export type SpecItemResult = { ok: true } | { ok: false; error: string };

export interface SpecTabItem {
  id: string;
  /** Root costing category id (null = loose item). */
  categoryId: string | null;
  description: string;
  quantity: number;
  uom: string | null;
  notes: string | null;
  inSpec: boolean;
  detail: string;
  /** URL of the stored image (cache-busted), null when none. */
  imageUrl: string | null;
}

export interface SpecCostingContext {
  estimateId: string;
  canEdit: boolean;
  /** Root costing categories in costing order. */
  categories: { id: string; name: string }[];
  /** All costing items in costing order. */
  items: SpecTabItem[];
  setInSpec: (itemId: string, on: boolean) => Promise<SpecItemResult>;
  saveDetail: (itemId: string, input: { body: string; image?: string | null }) => Promise<SpecItemResult>;
}

const MAX_IMAGE_BYTES = 1_500_000;

/** Items of one linked category: flagged items (numbered after the section's clauses) + "add items". */
export function SpecItemsPanel({
  ctx, categoryId, sectionNumber, offset, visible,
}: {
  ctx: SpecCostingContext;
  categoryId: string;
  sectionNumber: string;
  /** Number of clauses before the items (items continue the numbering). */
  offset: number;
  /** Search filter: only these item ids (null = all). */
  visible: Set<string> | null;
}) {
  const all = ctx.items.filter((i) => i.categoryId === categoryId);
  const included = all.filter((i) => i.inSpec);
  const others = all.filter((i) => !i.inSpec);
  const shown = included.filter((i) => !visible || visible.has(i.id));
  if (!all.length) {
    return <p className="border-t border-ink-100 px-3 py-2 pl-11 text-xs text-ink-400">This costing category has no items yet.</p>;
  }
  return (
    <div className="border-t border-ink-100" data-testid="spec-items">
      {included.length === 0 && (
        <p className="px-3 py-2 pl-11 text-xs text-ink-500">No items from this category are included yet.</p>
      )}
      <ol>
        {shown.map((it) => (
          <li key={it.id} className="border-b border-ink-100 pl-8 last:border-b-0">
            <SpecItemCard ctx={ctx} item={it} number={`${sectionNumber}.${offset + included.indexOf(it) + 1}`} />
          </li>
        ))}
      </ol>
      {ctx.canEdit && others.length > 0 && !visible && (
        <details className="border-t border-ink-100 px-3 py-2 pl-11 text-sm" data-testid="spec-add-items">
          <summary className="cursor-pointer select-none text-xs font-medium text-brand-700 hover:underline">
            Add costing items ({others.length})
          </summary>
          <ul className="mt-2 space-y-1">
            {others.map((it) => (
              <li key={it.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-ink-700">{it.description || "Untitled item"}</span>
                <IncludeButton ctx={ctx} item={it} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function IncludeButton({ ctx, item }: { ctx: SpecCostingContext; item: SpecTabItem }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex shrink-0 items-center gap-2">
      {error && <span className="text-xs text-red-700" role="alert">{error}</span>}
      <button
        type="button"
        disabled={pending}
        aria-label={`Include ${item.description || "item"} in specifications`}
        className="rounded border border-ink-200 px-2 py-0.5 text-xs font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-50"
        onClick={() =>
          start(async () => {
            const r = await ctx.setInSpec(item.id, true);
            setError(r.ok ? null : r.error);
          })
        }
      >
        {pending ? "Adding…" : "Include"}
      </button>
    </span>
  );
}

function SpecItemCard({ ctx, item, number }: { ctx: SpecCostingContext; item: SpecTabItem; number: string }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(item.detail);
  /** undefined = unchanged, null = remove, string = new data URL */
  const [image, setImage] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const preview = image === undefined ? item.imageUrl : image;

  const onFile = (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(png|jpeg|gif|webp)$/.test(f.type)) return setError("Choose a PNG, JPEG, GIF or WebP image.");
    if (f.size > MAX_IMAGE_BYTES) return setError("Images must be under 1.5 MB.");
    const r = new FileReader();
    r.onload = () => {
      setError(null);
      setImage(String(r.result));
    };
    r.readAsDataURL(f);
  };

  const save = () =>
    start(async () => {
      const r = await ctx.saveDetail(item.id, { body, image });
      if (r.ok) {
        setEditing(false);
        setImage(undefined);
        setError(null);
      } else setError(r.error);
    });

  const remove = () =>
    start(async () => {
      const r = await ctx.setInSpec(item.id, false);
      if (!r.ok) setError(r.error);
    });

  return (
    <div className="flex items-start gap-2 p-3" data-testid="spec-item">
      <span className="w-10 shrink-0 pt-0.5 text-sm font-semibold tabular-nums text-ink-400">{number}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium text-ink-900">{item.description || "Untitled item"}</span>
          <span className="text-xs text-ink-400">{num(item.quantity, 3)} {item.uom}</span>
          <span className="rounded bg-brand-50 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700" title="From costings">S</span>
        </div>
        {editing ? (
          <div className="mt-2 space-y-2" data-testid="spec-item-editing">
            <Textarea
              aria-label="Specification detail" rows={4} value={body} maxLength={20000} autoFocus
              onChange={(e) => setBody(e.target.value)} placeholder="Brand, model, finish, colour, standard…"
            />
            <div className="flex flex-wrap items-center gap-3">
              {preview ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="" className="h-20 max-w-40 rounded border border-ink-200 object-contain" />
                  <button type="button" className="text-xs font-medium text-red-700 hover:underline" onClick={() => setImage(null)}>Remove image</button>
                </>
              ) : null}
              <label className="cursor-pointer rounded border border-ink-200 px-2 py-1 text-xs font-medium text-ink-700 hover:bg-ink-50">
                {preview ? "Replace image" : "Add image"}
                <input
                  type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" aria-label="Item image"
                  onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }}
                />
              </label>
              <span className="text-xs text-ink-400">PNG, JPEG, GIF or WebP up to 1.5 MB</span>
            </div>
            {error && <p className="text-xs font-medium text-red-700" role="alert">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => { setEditing(false); setBody(item.detail); setImage(undefined); setError(null); }}>Cancel</Button>
              <Button type="button" onClick={save} disabled={pending}>{pending ? "Saving…" : "Save detail"}</Button>
            </div>
          </div>
        ) : (
          <>
            {item.detail ? (
              <Markdown text={item.detail} className="mt-1 text-sm text-ink-600" />
            ) : item.notes ? (
              <div className="mt-0.5 text-xs text-ink-500" title="Costing notes print when there is no detail">{item.notes}</div>
            ) : null}
            {item.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.imageUrl} alt={item.description} className="mt-2 max-h-40 max-w-64 rounded border border-ink-200 object-contain" />
            )}
            {error && <p className="mt-1 text-xs font-medium text-red-700" role="alert">{error}</p>}
          </>
        )}
      </div>
      {ctx.canEdit && !editing && (
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button" className="rounded px-2 py-0.5 text-xs font-medium text-brand-700 hover:bg-ink-100"
            onClick={() => { setBody(item.detail); setEditing(true); }}
          >
            {item.detail || item.imageUrl ? "Edit detail" : "Add detail"}
          </button>
          <button
            type="button" disabled={pending} title="Remove from specifications (turns off “Show in specification”)"
            aria-label={`Remove ${item.description || "item"} from specifications`}
            className={cx("rounded px-1.5 py-0.5 text-sm text-ink-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-40")}
            onClick={remove}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

export function ExportMenu({ estimateId, dirty }: { estimateId: string; dirty: boolean }) {
  return (
    <Modal title="Export specification" trigger={(open) => <Button type="button" variant="secondary" onClick={open}>Export</Button>}>
      {() => (
        <div className="space-y-3 text-sm">
          {dirty && <p className="rounded bg-amber-50 px-3 py-2 text-amber-800">You have unsaved changes. Save first to include them in the export.</p>}
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-medium text-ink-900">Printable document</div>
              <div className="text-xs text-ink-500">Opens a clean A4 page and the print dialog (save as PDF).</div>
            </div>
            <LinkButton href={`/estimates/${estimateId}/specifications/print`} target="_blank" variant="secondary">Print / PDF</LinkButton>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-medium text-ink-900">Markdown file</div>
              <div className="text-xs text-ink-500">Plain text with headings, for email or other tools (no images).</div>
            </div>
            <a
              href={`/estimates/${estimateId}/specifications/export`} download
              className="inline-flex items-center rounded-md border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-50"
            >
              Download .md
            </a>
          </div>
        </div>
      )}
    </Modal>
  );
}
