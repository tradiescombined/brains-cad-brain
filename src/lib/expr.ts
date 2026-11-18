/**
 * Safe quantity-formula evaluator for costing rows.
 *
 * Supported:
 *   numbers (12, 0.45, .45), + - * / ^, parentheses, unary minus
 *   [M1] / [M:code]  -> value of takeoff measurement with that code
 *   [W10]            -> wastage multiplier 1.10 (10% waste)
 *   [Q]              -> the parent item's quantity (for recipe components)
 *   functions: ceil(x), floor(x), round(x[,dp]), roundup(x, step), min(a,b,..), max(a,b,..), abs(x), sqrt(x)
 *
 * Never uses eval. Throws ExprError on invalid input.
 */
export class ExprError extends Error {}

export interface ExprContext {
  measurements?: Record<string, number>; // keyed by code e.g. "M1"
  parentQuantity?: number;
}

type Tok =
  | { t: "num"; v: number }
  | { t: "ref"; v: string }
  | { t: "id"; v: string }
  | { t: "op"; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const s = src.slice(i, j);
      if ((s.match(/\./g) || []).length > 1 || s === ".") throw new ExprError(`Bad number "${s}"`);
      out.push({ t: "num", v: parseFloat(s) });
      i = j; continue;
    }
    if (c === "[") {
      const j = src.indexOf("]", i);
      if (j < 0) throw new ExprError("Missing ]");
      out.push({ t: "ref", v: src.slice(i + 1, j).trim() });
      i = j + 1; continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[a-zA-Z_0-9]/.test(src[j])) j++;
      out.push({ t: "id", v: src.slice(i, j).toLowerCase() });
      i = j; continue;
    }
    if ("+-*/^(),".includes(c)) { out.push({ t: "op", v: c }); i++; continue; }
    if (c === "x" || c === "×") { out.push({ t: "op", v: "*" }); i++; continue; }
    throw new ExprError(`Unexpected "${c}"`);
  }
  return out;
}

const FUNCS: Record<string, (...a: number[]) => number> = {
  ceil: (x) => Math.ceil(x),
  floor: (x) => Math.floor(x),
  round: (x, dp = 0) => { const f = 10 ** dp; return Math.round(x * f) / f; },
  roundup: (x, step = 1) => (step > 0 ? Math.ceil(x / step - 1e-9) * step : x),
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
  abs: (x) => Math.abs(x),
  sqrt: (x) => Math.sqrt(x),
};

export function resolveRef(ref: string, ctx: ExprContext): number {
  const r = ref.toUpperCase();
  if (r === "Q") return ctx.parentQuantity ?? 1;
  const w = /^W(\d+(?:\.\d+)?)$/.exec(r);
  if (w) return 1 + parseFloat(w[1]) / 100;
  const code = r.startsWith("M:") ? ref.slice(2).trim() : ref.trim();
  const m = ctx.measurements ?? {};
  const hit = Object.keys(m).find((k) => k.toUpperCase() === code.toUpperCase());
  if (hit === undefined) throw new ExprError(`Unknown measurement [${ref}]`);
  return m[hit];
}

export function evaluate(src: string | null | undefined, ctx: ExprContext = {}): number {
  if (src == null || String(src).trim() === "") return 0;
  const toks = tokenize(String(src).replace(/^=/, ""));
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.t === "op" && (peek() as { v: string }).v === v;

  function expr(): number {
    let v = term();
    while (isOp("+") || isOp("-")) {
      const op = (toks[p++] as { v: string }).v;
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  function term(): number {
    let v = power();
    while (isOp("*") || isOp("/")) {
      const op = (toks[p++] as { v: string }).v;
      const r = power();
      if (op === "/" && r === 0) throw new ExprError("Divide by zero");
      v = op === "*" ? v * r : v / r;
    }
    return v;
  }
  function power(): number {
    const b = unary();
    if (isOp("^")) { p++; return b ** power(); }
    return b;
  }
  function unary(): number {
    if (isOp("-")) { p++; return -unary(); }
    if (isOp("+")) { p++; return unary(); }
    return primary();
  }
  function primary(): number {
    const tk = toks[p++];
    if (!tk) throw new ExprError("Unexpected end of formula");
    if (tk.t === "num") return tk.v;
    if (tk.t === "ref") return resolveRef(tk.v, ctx);
    if (tk.t === "id") {
      const f = FUNCS[tk.v];
      if (!f) throw new ExprError(`Unknown function ${tk.v}`);
      if (!isOp("(")) throw new ExprError(`Expected ( after ${tk.v}`);
      p++;
      const args: number[] = [];
      if (!isOp(")")) {
        args.push(expr());
        while (isOp(",")) { p++; args.push(expr()); }
      }
      if (!isOp(")")) throw new ExprError("Missing )");
      p++;
      return f(...args);
    }
    if (tk.v === "(") {
      const v = expr();
      if (!isOp(")")) throw new ExprError("Missing )");
      p++;
      return v;
    }
    throw new ExprError(`Unexpected "${tk.v}"`);
  }

  const v = expr();
  if (p < toks.length) throw new ExprError("Unexpected trailing input");
  if (!Number.isFinite(v)) throw new ExprError("Result is not a number");
  return v;
}

/** Evaluate, returning {value, error} instead of throwing. */
export function tryEvaluate(src: string | null | undefined, ctx: ExprContext = {}): { value: number; error?: string } {
  try {
    return { value: evaluate(src, ctx) };
  } catch (e) {
    return { value: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Measurement codes referenced by a formula, e.g. ["M1","M3"]. */
export function referencedMeasurements(src: string | null | undefined): string[] {
  if (!src) return [];
  return [...String(src).matchAll(/\[([^\]]+)\]/g)]
    .map((m) => m[1].trim())
    .filter((r) => !/^W\d/i.test(r) && r.toUpperCase() !== "Q")
    .map((r) => (r.toUpperCase().startsWith("M:") ? r.slice(2).trim() : r));
}
