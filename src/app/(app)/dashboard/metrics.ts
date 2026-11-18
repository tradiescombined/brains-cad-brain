/**
 * Pure dashboard maths (no DB access) so it can be unit tested.
 * Estimate totals come from the cached `quoteTotal` the calc engine maintains.
 */

export const MIN_CLOSED_FOR_WIN_RATE = 3;

export const LEAD_STAGES = ["New", "Contacted", "Site visit", "Quoting", "Quote sent", "Won", "Lost"] as const;

export type StatusLookup = { name: string; flag: boolean };
export type EstimateLite = { status: string; quoteTotal: number | null; archived?: boolean; isTemplate?: boolean };
export type InvoiceLite = { status: string; total: number | null; amountPaid: number | null; dueDate: string | null };
export type LeadLite = { stage: string; estimatedValue: number | null; archived?: boolean };

const REJECTED_RE = /(reject|lost|declin|cancel)/i;

/** Which estimate statuses count as won (lookup flag, or literally "Accepted") and lost. */
export function classifyStatuses(statuses: StatusLookup[]) {
  const accepted = new Set(statuses.filter((s) => s.flag).map((s) => s.name.toLowerCase()));
  if (accepted.size === 0) accepted.add("accepted");
  const rejected = new Set(statuses.filter((s) => !s.flag && REJECTED_RE.test(s.name)).map((s) => s.name.toLowerCase()));
  if (![...rejected].length) rejected.add("rejected");
  return {
    isAccepted: (s: string) => accepted.has(s.toLowerCase()),
    isRejected: (s: string) => rejected.has(s.toLowerCase()) || (!accepted.has(s.toLowerCase()) && REJECTED_RE.test(s)),
  };
}

export function estimateKpis(estimates: EstimateLite[], statuses: StatusLookup[]) {
  const { isAccepted, isRejected } = classifyStatuses(statuses);
  let openCount = 0, openValue = 0, accepted = 0, acceptedValue = 0, rejected = 0;
  for (const e of estimates) {
    if (e.archived || e.isTemplate) continue;
    const v = Number(e.quoteTotal) || 0;
    if (isAccepted(e.status)) { accepted++; acceptedValue += v; }
    else if (isRejected(e.status)) rejected++;
    else { openCount++; openValue += v; }
  }
  const closed = accepted + rejected;
  return {
    openCount,
    openValue: round2(openValue),
    accepted,
    acceptedValue: round2(acceptedValue),
    rejected,
    closed,
    /** 0..1, or null until enough estimates are closed to be meaningful. */
    winRate: closed >= MIN_CLOSED_FOR_WIN_RATE ? accepted / closed : null,
    closesNeeded: Math.max(0, MIN_CLOSED_FOR_WIN_RATE - closed),
  };
}

/** Outstanding = issued (not draft/void) balance unpaid. Overdue = outstanding past its due date. */
export function invoiceKpis(invoices: InvoiceLite[], today: string) {
  let outstanding = 0, outstandingCount = 0, overdue = 0, overdueCount = 0;
  for (const i of invoices) {
    if (i.status === "Draft" || i.status === "Void" || i.status === "Paid") continue;
    const bal = (Number(i.total) || 0) - (Number(i.amountPaid) || 0);
    if (bal <= 0.005) continue;
    outstanding += bal;
    outstandingCount++;
    if (i.dueDate && i.dueDate.slice(0, 10) < today) { overdue += bal; overdueCount++; }
  }
  return { outstanding: round2(outstanding), outstandingCount, overdue: round2(overdue), overdueCount };
}

export function pipelineByStage(leads: LeadLite[]) {
  const rows = LEAD_STAGES.map((stage) => ({ stage: stage as string, count: 0, value: 0 }));
  for (const l of leads) {
    if (l.archived) continue;
    let r = rows.find((x) => x.stage === l.stage);
    if (!r) rows.push((r = { stage: l.stage, count: 0, value: 0 }));
    r.count++;
    r.value += Number(l.estimatedValue) || 0;
  }
  const max = Math.max(0, ...rows.map((r) => r.value));
  const maxCount = Math.max(0, ...rows.map((r) => r.count));
  return rows.map((r) => ({ ...r, value: round2(r.value), share: max > 0 ? r.value / max : maxCount > 0 ? r.count / maxCount : 0 }));
}

/** Count/value per estimate status, in lookup order (unknown statuses appended). */
export function statusBreakdown(estimates: EstimateLite[], statusOrder: string[]) {
  const rows = statusOrder.map((status) => ({ status, count: 0, value: 0 }));
  for (const e of estimates) {
    if (e.archived || e.isTemplate) continue;
    let r = rows.find((x) => x.status.toLowerCase() === e.status.toLowerCase());
    if (!r) rows.push((r = { status: e.status, count: 0, value: 0 }));
    r.count++;
    r.value += Number(e.quoteTotal) || 0;
  }
  const total = rows.reduce((a, r) => a + r.count, 0);
  return rows.map((r) => ({ ...r, value: round2(r.value), share: total ? r.count / total : 0 }));
}

/** Compact relative time: "just now", "5m ago", "3h ago", "2d ago", else null (caller shows a date). */
export function timeAgo(iso: string, now: Date = new Date()): string | null {
  const t = Date.parse(iso);
  if (isNaN(t)) return null;
  const s = Math.max(0, Math.round((now.getTime() - t) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return null;
}

export type QuickStartInput = { estimates: number; plans: number; catalogueItems: number; sentQuotes: number; jobs: number };
export function quickStartSteps(q: QuickStartInput, links: { latestEstimateId?: string | null } = {}) {
  const e = links.latestEstimateId;
  return [
    { key: "estimate", label: "Create your first estimate", hint: "Start from blank or a template.", done: q.estimates > 0, href: "/estimates/new" },
    { key: "plan", label: "Upload a plan", hint: "Measure lengths, areas and counts off the drawings.", done: q.plans > 0, href: e ? `/estimates/${e}/takeoffs` : "/estimates" },
    { key: "catalogue", label: "Add a catalogue item", hint: "Save your own rates so pricing is one click.", done: q.catalogueItems > 0, href: "/catalogues" },
    { key: "quote", label: "Send a quote", hint: "Share a quote your client can accept online.", done: q.sentQuotes > 0, href: e ? `/estimates/${e}/quote` : "/estimates" },
    { key: "job", label: "Create a job", hint: "Turn an accepted quote into a job with a budget.", done: q.jobs > 0, href: "/jobs" },
  ];
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
