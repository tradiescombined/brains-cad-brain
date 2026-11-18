/**
 * Specification tree helpers (pure, immutable). Max 2 levels: sections (1, 2) and clauses (1.1).
 */

export interface SpecNode {
  id: string;
  heading: string;
  body: string;
  children: SpecNode[];
  /** Top-level only: linked costing category (estimate_items.id). Absent/null = custom section. */
  categoryItemId?: string | null;
}

export interface SpecRow {
  id: string;
  parentId: string | null;
  sortOrder: number;
  heading: string;
  body: string | null;
  categoryItemId?: string | null;
}

export const MAX_DEPTH = 2;

/** Builds a sorted tree from DB rows. Orphans become top level; deeper rows are flattened to level 2. */
export function fromRows(rows: SpecRow[]): SpecNode[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const sorted = [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
  const top = (r: SpecRow): SpecRow => {
    let cur = r;
    const seen = new Set<string>();
    while (cur.parentId && byId.has(cur.parentId) && !seen.has(cur.id)) {
      seen.add(cur.id);
      cur = byId.get(cur.parentId)!;
    }
    return cur;
  };
  const roots: SpecNode[] = [];
  const nodes = new Map<string, SpecNode>();
  for (const r of sorted) {
    const t = top(r);
    if (t.id === r.id) {
      const n: SpecNode = { id: r.id, heading: r.heading, body: r.body ?? "", children: [], ...(r.categoryItemId ? { categoryItemId: r.categoryItemId } : {}) };
      nodes.set(r.id, n);
      roots.push(n);
    }
  }
  for (const r of sorted) {
    const t = top(r);
    if (t.id !== r.id) nodes.get(t.id)?.children.push({ id: r.id, heading: r.heading, body: r.body ?? "", children: [] });
  }
  return roots;
}

/** Flattens to rows with parentId and contiguous sortOrder. */
export function toRows(nodes: SpecNode[]): SpecRow[] {
  const out: SpecRow[] = [];
  nodes.forEach((n, i) => {
    out.push({ id: n.id, parentId: null, sortOrder: i, heading: n.heading, body: n.body || null, categoryItemId: n.categoryItemId ?? null });
    n.children.forEach((c, j) => out.push({ id: c.id, parentId: n.id, sortOrder: j, heading: c.heading, body: c.body || null, categoryItemId: null }));
  });
  return out;
}

/** id -> "1" / "1.2" */
export function numberTree(nodes: SpecNode[]): Record<string, string> {
  const out: Record<string, string> = {};
  nodes.forEach((n, i) => {
    out[n.id] = String(i + 1);
    n.children.forEach((c, j) => (out[c.id] = `${i + 1}.${j + 1}`));
  });
  return out;
}

export function countNodes(nodes: SpecNode[]): number {
  return nodes.reduce((s, n) => s + 1 + n.children.length, 0);
}

/** Locates a node: parent index (or -1 for top level) and index within siblings. */
export function locate(nodes: SpecNode[], id: string): { parent: number; index: number } | null {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) return { parent: -1, index: i };
    const j = nodes[i].children.findIndex((c) => c.id === id);
    if (j >= 0) return { parent: i, index: j };
  }
  return null;
}

const clone = (nodes: SpecNode[]) => nodes.map((n) => ({ ...n, children: [...n.children] }));
const siblingsOf = (nodes: SpecNode[], parent: number) => (parent < 0 ? nodes : nodes[parent].children);

export function addNode(nodes: SpecNode[], parentId: string | null, node: Omit<SpecNode, "children"> & { children?: SpecNode[] }): SpecNode[] {
  const next = clone(nodes);
  const n: SpecNode = { ...node, children: parentId ? [] : node.children ?? [] };
  if (!parentId) return [...next, n];
  const p = next.find((x) => x.id === parentId);
  if (!p) return [...next, n];
  p.children.push(n);
  return next;
}

export function updateNode(nodes: SpecNode[], id: string, patch: Partial<Pick<SpecNode, "heading" | "body" | "categoryItemId">>): SpecNode[] {
  return nodes.map((n) =>
    n.id === id
      ? { ...n, ...patch }
      : { ...n, children: n.children.map((c) => (c.id === id ? { ...c, ...patch } : c)) },
  );
}

/** Removes a node (and its children). */
export function removeNode(nodes: SpecNode[], id: string): SpecNode[] {
  return nodes.filter((n) => n.id !== id).map((n) => ({ ...n, children: n.children.filter((c) => c.id !== id) }));
}

export function canMove(nodes: SpecNode[], id: string, dir: -1 | 1): boolean {
  const loc = locate(nodes, id);
  if (!loc) return false;
  const t = loc.index + dir;
  return t >= 0 && t < siblingsOf(nodes, loc.parent).length;
}

/** Swaps a node with its previous (-1) or next (+1) sibling. */
export function moveNode(nodes: SpecNode[], id: string, dir: -1 | 1): SpecNode[] {
  if (!canMove(nodes, id, dir)) return nodes;
  const next = clone(nodes);
  const loc = locate(next, id)!;
  const sibs = siblingsOf(next, loc.parent);
  const t = loc.index + dir;
  [sibs[loc.index], sibs[t]] = [sibs[t], sibs[loc.index]];
  return next;
}

/** Moves a top-level section to `toIndex` (drag and drop). Out-of-range targets are clamped. */
export function moveTopLevelTo(nodes: SpecNode[], id: string, toIndex: number): SpecNode[] {
  const from = nodes.findIndex((n) => n.id === id);
  if (from < 0) return nodes;
  const to = Math.max(0, Math.min(nodes.length - 1, toIndex));
  if (to === from) return nodes;
  const next = clone(nodes);
  const [n] = next.splice(from, 1);
  next.splice(to, 0, n);
  return next;
}

/** A top-level, unlinked node without children can become the last clause of the section above it. */
export function canIndent(nodes: SpecNode[], id: string): boolean {
  const loc = locate(nodes, id);
  return !!loc && loc.parent < 0 && loc.index > 0 && nodes[loc.index].children.length === 0 && !nodes[loc.index].categoryItemId;
}

export function indentNode(nodes: SpecNode[], id: string): SpecNode[] {
  if (!canIndent(nodes, id)) return nodes;
  const next = clone(nodes);
  const loc = locate(next, id)!;
  const [n] = next.splice(loc.index, 1);
  next[loc.index - 1].children.push({ ...n, children: [] });
  return next;
}

export function canOutdent(nodes: SpecNode[], id: string): boolean {
  const loc = locate(nodes, id);
  return !!loc && loc.parent >= 0;
}

/** A clause becomes a top-level section placed directly after its former parent. */
export function outdentNode(nodes: SpecNode[], id: string): SpecNode[] {
  if (!canOutdent(nodes, id)) return nodes;
  const next = clone(nodes);
  const loc = locate(next, id)!;
  const [n] = next[loc.parent].children.splice(loc.index, 1);
  next.splice(loc.parent + 1, 0, { ...n, children: [] });
  return next;
}

/** Library template JSON: [{heading, body, children?}] */
export type TemplateEntry = { heading: string; body?: string; children?: TemplateEntry[] };

export function toTemplateContent(nodes: SpecNode[]): string {
  const strip = (n: SpecNode): TemplateEntry => {
    const e: TemplateEntry = { heading: n.heading, body: n.body };
    if (n.children.length) e.children = n.children.map(strip);
    return e;
  };
  return JSON.stringify(nodes.map(strip));
}

/** Parses template JSON into nodes with fresh ids. Invalid JSON -> []. Deeper levels are flattened into level 2. */
export function fromTemplateContent(json: string | null | undefined, newId: () => string): SpecNode[] {
  let data: unknown;
  try {
    data = JSON.parse(json || "[]");
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const asEntry = (v: unknown): TemplateEntry | null => {
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    const heading = typeof o.heading === "string" ? o.heading : "";
    const body = typeof o.body === "string" ? o.body : "";
    if (!heading.trim() && !body.trim() && !Array.isArray(o.children)) return null;
    return { heading: heading || "Untitled section", body, children: Array.isArray(o.children) ? (o.children as unknown[]).map(asEntry).filter((x): x is TemplateEntry => !!x) : [] };
  };
  const flatten = (e: TemplateEntry): SpecNode[] => [
    { id: newId(), heading: e.heading, body: e.body ?? "", children: [] },
    ...(e.children ?? []).flatMap(flatten),
  ];
  return data
    .map(asEntry)
    .filter((x): x is TemplateEntry => !!x)
    .map((e) => ({ id: newId(), heading: e.heading, body: e.body ?? "", children: (e.children ?? []).flatMap(flatten) }));
}

/** Validates & normalises a tree posted from the client editor. Returns null if malformed. */
export function sanitizeTree(input: unknown, isValidId: (id: string) => boolean = () => true): SpecNode[] | null {
  if (!Array.isArray(input)) return null;
  const seen = new Set<string>();
  const one = (v: unknown, depth: number): SpecNode | null => {
    if (!v || typeof v !== "object") return null;
    const o = v as Record<string, unknown>;
    if (typeof o.id !== "string" || !o.id || seen.has(o.id) || !isValidId(o.id)) return null;
    seen.add(o.id);
    const heading = typeof o.heading === "string" ? o.heading.trim().slice(0, 300) : "";
    const body = typeof o.body === "string" ? o.body.slice(0, 20000) : "";
    const kids = depth < MAX_DEPTH && Array.isArray(o.children) ? o.children : [];
    const children: SpecNode[] = [];
    for (const k of kids) {
      const c = one(k, depth + 1);
      if (!c) return null;
      children.push(c);
    }
    const link = depth === 1 && typeof o.categoryItemId === "string" && o.categoryItemId && isValidId(o.categoryItemId) ? o.categoryItemId : null;
    return { id: o.id, heading: heading || "Untitled section", body, children, ...(link ? { categoryItemId: link } : {}) };
  };
  const out: SpecNode[] = [];
  for (const v of input) {
    const n = one(v, 1);
    if (!n) return null;
    out.push(n);
  }
  return out;
}
