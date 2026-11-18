/**
 * Tiny markdown subset for specification bodies, letters and T&Cs:
 * paragraphs (blank line separated, single newlines kept as line breaks),
 * bullet lists ("- ", "* " or "• ") and **bold**. Produces an AST; rendering is done
 * with React elements (never raw HTML).
 */

export type Inline = { text: string; bold: boolean };
export type Block = { type: "p"; lines: Inline[][] } | { type: "ul"; items: Inline[][] };

const BULLET = /^\s*[-*•]\s+/;

export function parseInline(line: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (const m of line.matchAll(re)) {
    if (m.index > last) out.push({ text: line.slice(last, m.index), bold: false });
    out.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last), bold: false });
  return out;
}

export function parseMarkdown(src: string | null | undefined): Block[] {
  if (!src) return [];
  const blocks: Block[] = [];
  let cur: Block | null = null;
  for (const raw of src.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) {
      cur = null;
      continue;
    }
    if (BULLET.test(line)) {
      if (!cur || cur.type !== "ul") {
        cur = { type: "ul", items: [] };
        blocks.push(cur);
      }
      cur.items.push(parseInline(line.replace(BULLET, "")));
    } else {
      if (!cur || cur.type !== "p") {
        cur = { type: "p", lines: [] };
        blocks.push(cur);
      }
      cur.lines.push(parseInline(line.trim()));
    }
  }
  return blocks;
}

/** Plain-text version (markers stripped) for previews / summaries. */
export function markdownToPlain(src: string | null | undefined): string {
  return parseMarkdown(src)
    .map((b) => (b.type === "p" ? b.lines : b.items).map((l) => l.map((i) => i.text).join("")).join(" "))
    .join(" ");
}
