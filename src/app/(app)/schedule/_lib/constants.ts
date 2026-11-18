/** Shared jobs-module constants (safe for client and server). */
export const JOB_STATUSES = ["Not started", "In progress", "On hold", "Completed", "Cancelled"] as const;
export const ACTIVE_STATUSES = ["Not started", "In progress", "On hold"] as const;
export const COST_TYPES = ["Material", "Labour", "MatLab", "Equipment", "Subcontractor", "Other"] as const;
export const SELECTION_STATUSES = ["Pending", "Selected", "Approved"] as const;
export const TASK_COLOURS = [
  { value: "#0a8077", label: "Teal" },
  { value: "#2563eb", label: "Blue" },
  { value: "#7c3aed", label: "Violet" },
  { value: "#db2777", label: "Pink" },
  { value: "#ea580c", label: "Orange" },
  { value: "#ca8a04", label: "Mustard" },
  { value: "#16a34a", label: "Green" },
  { value: "#475569", label: "Slate" },
];

/** Result returned by every jobs-module form action (used with useActionState). */
export type ActionResult = { ok: boolean; error?: string; at?: number } | null;
