"use client";
/**
 * Specification tree editor (2 levels). Edits locally and saves the whole tree through a
 * server action (hidden JSON input). Used by the estimate Specifications tab and the
 * specification library.
 */
import { useActionState, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, Input, Textarea, Field } from "@/components/ui";
import { Modal } from "@/components/ui/client";
import { cx } from "@/lib/format";
import { Markdown } from "./Markdown";
import {
  addNode, canIndent, canMove, canOutdent, countNodes, fromTemplateContent, indentNode, moveNode, numberTree,
  outdentNode, removeNode, updateNode, type SpecNode,
} from "./spec-tree";

export type EditorActionState = { ok: boolean; message: string; at: number } | null;
type Action = (prev: EditorActionState, fd: FormData) => Promise<EditorActionState>;

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export interface LibraryTemplate { id: string; name: string; content: string }

export function SpecEditor({
  initial, saveAction, intro, name, templates, saveAsTemplateAction, emptyHint, header,
}: {
  initial: SpecNode[];
  saveAction: Action;
  /** When defined, shows the specification intro field (estimates). */
  intro?: string | null;
  /** When defined, shows a required template name field (library). */
  name?: string;
  templates?: LibraryTemplate[];
  saveAsTemplateAction?: Action;
  emptyHint?: string;
  header?: ReactNode;
}) {
  const [tree, setTree] = useState<SpecNode[]>(initial);
  const [introText, setIntroText] = useState(intro ?? "");
  const [nameText, setNameText] = useState(name ?? "");
  const [editing, setEditing] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState(saveAction, null);
  const snap = (t: SpecNode[], i: string, n: string) => JSON.stringify([t, i, n]);
  const [saved, setSaved] = useState(() => snap(initial, intro ?? "", name ?? ""));
  const submitted = useRef(saved);
  const current = snap(tree, introText, nameText);
  const dirty = current !== saved;
  const numbers = useMemo(() => numberTree(tree), [tree]);

  useEffect(() => {
    if (state?.ok) setSaved(submitted.current);
  }, [state]);

  const add = (parentId: string | null) => {
    const id = newId();
    setTree((t) => addNode(t, parentId, { id, heading: "", body: "" }));
    setEditing(id);
  };

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        const by = (e.nativeEvent as SubmitEvent).submitter;
        if (by && by.getAttribute("data-testid") !== "spec-save") return;
        submitted.current = current;
        setEditing(null);
      }}
      className="space-y-4"
    >
      <input type="hidden" name="tree" value={JSON.stringify(tree)} />

      <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-200 bg-white/95 px-3 py-2 shadow-xs backdrop-blur lg:top-2">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          {header}
          <span className="text-ink-500">{countNodes(tree)} section{countNodes(tree) === 1 ? "" : "s"}</span>
          {dirty ? (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800" data-testid="spec-dirty">Unsaved changes</span>
          ) : state?.ok ? (
            <span className="text-xs font-medium text-emerald-700" data-testid="spec-saved">Saved</span>
          ) : null}
          {state && !state.ok && <span className="text-xs font-medium text-red-700" role="alert">{state.message}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {templates && <InsertFromLibrary templates={templates} onInsert={(nodes) => setTree((t) => [...t, ...nodes])} />}
          {saveAsTemplateAction && <SaveAsTemplate tree={tree} action={saveAsTemplateAction} />}
          <Button type="submit" disabled={pending || !dirty} data-testid="spec-save">{pending ? "Saving…" : "Save"}</Button>
        </div>
      </div>

      {name !== undefined && (
        <Field label="Template name">
          <Input name="name" required maxLength={120} value={nameText} onChange={(e) => setNameText(e.target.value)} placeholder="e.g. Standard bathroom inclusions" />
        </Field>
      )}

      {intro !== undefined && (
        <section className="rounded-lg border border-ink-200 bg-white p-4">
          <Field label="Introduction (optional)" hint="Appears above the specification sections on the quote. Supports **bold** and - bullet lists.">
            <Textarea name="intro" rows={3} value={introText} onChange={(e) => setIntroText(e.target.value)} placeholder="e.g. The following specification forms part of this quotation…" />
          </Field>
        </section>
      )}

      {tree.length === 0 ? (
        <div className="rounded-lg border border-dashed border-ink-300 bg-white px-6 py-10 text-center">
          <p className="font-medium text-ink-800">No specification sections yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">{emptyHint ?? "Add sections describing materials, finishes and standards. Add clauses under a section for detail."}</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button type="button" onClick={() => add(null)}>Add section</Button>
          </div>
        </div>
      ) : (
        <ol className="space-y-2" data-testid="spec-tree">
          {tree.map((n) => (
            <li key={n.id} className="rounded-lg border border-ink-200 bg-white">
              <NodeRow
                node={n} number={numbers[n.id]} depth={1} tree={tree} setTree={setTree}
                editing={editing === n.id} setEditing={setEditing} onAddChild={() => add(n.id)}
              />
              {n.children.length > 0 && (
                <ol className="border-t border-ink-100">
                  {n.children.map((ch) => (
                    <li key={ch.id} className="border-b border-ink-100 pl-8 last:border-b-0">
                      <NodeRow node={ch} number={numbers[ch.id]} depth={2} tree={tree} setTree={setTree} editing={editing === ch.id} setEditing={setEditing} />
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ol>
      )}
      {tree.length > 0 && (
        <div>
          <Button type="button" variant="secondary" onClick={() => add(null)}>+ Add section</Button>
        </div>
      )}
    </form>
  );
}

function IconBtn({ label, onClick, disabled, children, danger }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode; danger?: boolean }) {
  return (
    <button
      type="button" title={label} aria-label={label} onClick={onClick} disabled={disabled}
      className={cx("rounded px-1.5 py-0.5 text-sm text-ink-500 hover:bg-ink-100 hover:text-ink-900 disabled:pointer-events-none disabled:opacity-30", danger && "hover:bg-red-50 hover:text-red-700")}
    >
      {children}
    </button>
  );
}

function NodeRow({
  node, number, depth, tree, setTree, editing, setEditing, onAddChild,
}: {
  node: SpecNode; number: string; depth: 1 | 2; tree: SpecNode[];
  setTree: (f: (t: SpecNode[]) => SpecNode[]) => void; editing: boolean; setEditing: (id: string | null) => void; onAddChild?: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const set = (patch: Partial<SpecNode>) => setTree((t) => updateNode(t, node.id, patch));

  const wrap = (kind: "bold" | "bullet") => {
    const el = bodyRef.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b, value } = el;
    let next: string;
    if (kind === "bold") {
      const sel = value.slice(a, b) || "bold text";
      next = value.slice(0, a) + `**${sel}**` + value.slice(b);
    } else {
      const lineStart = value.lastIndexOf("\n", a - 1) + 1;
      next = value.slice(0, lineStart) + "- " + value.slice(lineStart);
    }
    set({ body: next });
    requestAnimationFrame(() => el.focus());
  };

  if (editing) {
    return (
      <div className="space-y-2 p-3" data-testid="spec-editing">
        <div className="flex items-center gap-2">
          <span className="w-8 shrink-0 text-sm font-semibold tabular-nums text-ink-400">{number}</span>
          <Input
            autoFocus aria-label="Section heading" placeholder={depth === 1 ? "Section heading, e.g. Tiling" : "Clause heading"}
            value={node.heading} onChange={(e) => set({ heading: e.target.value })} maxLength={300}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                bodyRef.current?.focus();
              }
            }}
          />
        </div>
        <div className="pl-10">
          <div className="mb-1 flex items-center gap-1">
            <button type="button" onClick={() => wrap("bold")} className="rounded border border-ink-200 px-2 py-0.5 text-xs font-bold hover:bg-ink-50">B</button>
            <button type="button" onClick={() => wrap("bullet")} className="rounded border border-ink-200 px-2 py-0.5 text-xs hover:bg-ink-50">• List</button>
            <span className="ml-2 text-xs text-ink-400">Blank line = new paragraph · “- ” starts a bullet · **bold**</span>
          </div>
          <Textarea ref={bodyRef} aria-label="Section body" rows={5} value={node.body} onChange={(e) => set({ body: e.target.value })} placeholder="Describe what is included…" />
          <div className="mt-2 flex justify-end">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Done</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-2 p-3" data-testid="spec-node">
      <span className={cx("w-8 shrink-0 pt-0.5 text-sm font-semibold tabular-nums", depth === 1 ? "text-ink-700" : "text-ink-400")}>{number}</span>
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(node.id)}>
        <div className={cx("text-ink-900", depth === 1 ? "font-semibold" : "font-medium")}>{node.heading || <span className="italic text-ink-400">Untitled section</span>}</div>
        {node.body ? (
          <Markdown text={node.body} className="mt-1 text-sm text-ink-600" />
        ) : (
          <div className="mt-0.5 text-xs text-ink-400">Click to add detail</div>
        )}
      </button>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-0.5">
        {confirmDelete ? (
          <>
            <span className="mr-1 text-xs text-red-700">{depth === 1 && node.children.length ? `Delete with ${node.children.length} clause(s)?` : "Delete?"}</span>
            <button type="button" className="rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white" onClick={() => setTree((t) => removeNode(t, node.id))}>Delete</button>
            <button type="button" className="rounded px-2 py-0.5 text-xs text-ink-600 hover:bg-ink-100" onClick={() => setConfirmDelete(false)}>Cancel</button>
          </>
        ) : (
          <>
            <IconBtn label="Move up" onClick={() => setTree((t) => moveNode(t, node.id, -1))} disabled={!canMove(tree, node.id, -1)}>↑</IconBtn>
            <IconBtn label="Move down" onClick={() => setTree((t) => moveNode(t, node.id, 1))} disabled={!canMove(tree, node.id, 1)}>↓</IconBtn>
            {depth === 1 ? (
              <IconBtn label="Indent (make clause of section above)" onClick={() => setTree((t) => indentNode(t, node.id))} disabled={!canIndent(tree, node.id)}>→</IconBtn>
            ) : (
              <IconBtn label="Outdent (make a section)" onClick={() => setTree((t) => outdentNode(t, node.id))} disabled={!canOutdent(tree, node.id)}>←</IconBtn>
            )}
            {onAddChild && <IconBtn label="Add clause" onClick={onAddChild}>+</IconBtn>}
            <IconBtn label="Edit" onClick={() => setEditing(node.id)}>✎</IconBtn>
            <IconBtn label="Delete" danger onClick={() => setConfirmDelete(true)}>✕</IconBtn>
          </>
        )}
      </div>
    </div>
  );
}

function InsertFromLibrary({ templates, onInsert }: { templates: LibraryTemplate[]; onInsert: (n: SpecNode[]) => void }) {
  return (
    <Modal
      title="Insert from library"
      trigger={(open) => <Button type="button" variant="secondary" onClick={open}>Insert from library</Button>}
    >
      {(close) =>
        templates.length === 0 ? (
          <p className="text-sm text-ink-500">Your library is empty. Use “Save as library template” to store a set of sections for reuse.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {templates.map((t) => {
              const nodes = fromTemplateContent(t.content, newId);
              return (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-ink-900">{t.name}</div>
                    <div className="truncate text-xs text-ink-500">{countNodes(nodes)} sections · {nodes.map((n) => n.heading).join(", ") || "empty"}</div>
                  </div>
                  <Button type="button" variant="secondary" onClick={() => { onInsert(fromTemplateContent(t.content, newId)); close(); }}>Insert</Button>
                </li>
              );
            })}
          </ul>
        )
      }
    </Modal>
  );
}

function SaveAsTemplate({ tree, action }: { tree: SpecNode[]; action: Action }) {
  return (
    <Modal
      title="Save as library template"
      trigger={(open) => <Button type="button" variant="secondary" onClick={open} disabled={tree.length === 0}>Save as library template</Button>}
    >
      {() => <SaveAsTemplateForm tree={tree} action={action} />}
    </Modal>
  );
}

function SaveAsTemplateForm({ tree, action }: { tree: SpecNode[]; action: Action }) {
  const [state, formAction, pending] = useActionState(action, null);
  // The modal renders inside the editor's <form> (nested forms are invalid HTML), so this
  // submits the outer form with an alternate action via the button's formAction.
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-600">Saves the {countNodes(tree)} current sections (including unsaved edits) to your specification library.</p>
      <input type="hidden" name="templateTree" value={JSON.stringify(tree)} />
      <Field label="Template name">
        <Input name="templateName" maxLength={120} placeholder="e.g. Standard bathroom spec" autoFocus />
      </Field>
      {state && <p className={cx("text-sm", state.ok ? "text-emerald-700" : "text-red-700")} role="status">{state.message}</p>}
      <div className="flex justify-end">
        <Button type="submit" formAction={formAction} disabled={pending}>{pending ? "Saving…" : "Save template"}</Button>
      </div>
    </div>
  );
}
