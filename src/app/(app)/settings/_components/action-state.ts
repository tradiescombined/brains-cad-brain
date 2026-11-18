/** Result shape returned by form Server Actions used with <ActionForm>. */
export type ActionState = {
  ok?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** Changes on every result so the client can react to repeat submissions. */
  ts?: number;
};

export const okState = (msg: string): ActionState => ({ ok: msg, ts: Date.now() });
export const errState = (msg: string, fieldErrors?: Record<string, string>): ActionState => ({ error: msg, fieldErrors, ts: Date.now() });

/** Flatten zod-style issues into { field: message } (first message per field wins). */
export function issuesToFieldErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const k = String(i.path[0] ?? "_");
    if (!out[k]) out[k] = i.message;
  }
  return out;
}
