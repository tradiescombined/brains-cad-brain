import { notFound } from "next/navigation";
import { db, schema } from "@/db";
import { and, asc, eq } from "drizzle-orm";
import { Badge, EmptyState, Field, Input, Select, statusTone } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { cx, date, money, todayIso } from "@/lib/format";
import { parseOptions, selectionDifference } from "@/lib/job-finance";
import { deleteSelection, saveSelection } from "../../actions";
import { getJob, SELECTION_STATUSES } from "../../../schedule/_lib/job-data";
import { ModalForm, ConfirmSubmit } from "../../../schedule/_lib/client";
import { btn } from "../../../schedule/_lib/bits";
import { Mini } from "../../../schedule/_lib/bits";
import { OptionsEditor } from "./OptionsEditor";

type Sel = typeof schema.selections.$inferSelect;

export default async function JobSelectionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  const rows = await db
    .select()
    .from(schema.selections)
    .where(and(eq(schema.selections.jobId, id), eq(schema.selections.archived, false)))
    .orderBy(asc(schema.selections.category), asc(schema.selections.name));
  const items = rows.map((r) => {
    const options = parseOptions(r.options);
    return { ...r, opts: options, ...selectionDifference({ options, chosenOption: r.chosenOption, allowance: r.allowance }) };
  });
  const today = todayIso();
  const categories = [...new Set(items.map((i) => i.category))];
  const netDiff = items.reduce((s, i) => s + (i.difference ?? 0), 0);
  const pending = items.filter((i) => i.status === "Pending").length;
  const overdue = items.filter((i) => i.status === "Pending" && i.dueDate && i.dueDate < today).length;

  const fields = (s?: Sel & { opts: { name: string; price: number }[] }) => (
    <>
      <input type="hidden" name="jobId" value={id} />
      {s && <input type="hidden" name="id" value={s.id} />}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category"><Input name="category" required defaultValue={s?.category} list="sel-categories" placeholder="e.g. Kitchen" /></Field>
        <Field label="Item"><Input name="name" required defaultValue={s?.name} placeholder="e.g. Benchtop" /></Field>
        <Field label="Due date"><Input type="date" name="dueDate" defaultValue={s?.dueDate ?? ""} /></Field>
        <Field label="Status"><Select name="status" defaultValue={s?.status ?? "Pending"} options={[...SELECTION_STATUSES]} /></Field>
      </div>
      <OptionsEditor initial={s?.opts ?? []} chosen={s?.chosenOption ?? null} allowance={s?.allowance ?? null} />
      <div className="flex justify-end border-t border-ink-100 pt-3"><SubmitButton>{s ? "Save selection" : "Add selection"}</SubmitButton></div>
    </>
  );

  return (
    <div className="space-y-6">
      <datalist id="sel-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid flex-1 grid-cols-3 gap-3 sm:max-w-xl">
          <Mini label="Selections" value={String(items.length)} />
          <Mini label="Awaiting client" value={String(pending)} sub={overdue ? `${overdue} overdue` : undefined} warn={overdue > 0} />
          <Mini label="Net vs allowances" value={money(netDiff)} tone={netDiff > 0 ? "text-amber-700" : netDiff < 0 ? "text-emerald-700" : undefined} />
        </div>
        <ModalForm title="Add selection" action={saveSelection} trigger="Add selection" wide>{fields()}</ModalForm>
      </div>

      {items.length === 0 ? (
        <EmptyState title="No selections yet" body="Track the fixtures and finishes your client needs to choose — list the options with prices and compare the chosen one against its allowance." />
      ) : (
        categories.map((c) => (
          <section key={c}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">{c}</h2>
            <div className="overflow-x-auto rounded-lg border border-ink-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-ink-200 bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
                    <th className="px-3 py-2">Item</th>
                    <th className="px-3 py-2">Chosen</th>
                    <th className="px-3 py-2 text-right">Allowance</th>
                    <th className="px-3 py-2 text-right">Chosen price</th>
                    <th className="px-3 py-2 text-right">Difference</th>
                    <th className="hidden px-3 py-2 md:table-cell">Due</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {items
                    .filter((i) => i.category === c)
                    .map((s) => (
                      <tr key={s.id} className="border-b border-ink-100 last:border-0" data-selection={s.name}>
                        <td className="px-3 py-2">
                          <div className="font-medium text-ink-900">{s.name}</div>
                          <div className="text-xs text-ink-500">{s.opts.length ? s.opts.map((o) => `${o.name} ${money(o.price, { cents: false })}`).join(" · ") : "No options listed"}</div>
                        </td>
                        <td className="px-3 py-2">{s.chosenOption || <span className="text-ink-400">—</span>}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{s.allowance === null ? <span className="text-ink-400">—</span> : money(s.allowance)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{s.chosenPrice === null ? <span className="text-ink-400">—</span> : money(s.chosenPrice)}</td>
                        <td className={cx("px-3 py-2 text-right tabular-nums", s.difference === null ? "" : s.difference > 0 ? "text-amber-700" : s.difference < 0 ? "text-emerald-700" : "")} data-col="difference">
                          {s.difference === null ? <span className="text-ink-400">—</span> : `${s.difference > 0 ? "+" : ""}${money(s.difference)}`}
                        </td>
                        <td className={cx("hidden whitespace-nowrap px-3 py-2 md:table-cell", s.status === "Pending" && s.dueDate && s.dueDate < today && "font-medium text-red-700")}>{date(s.dueDate) || <span className="text-ink-400">—</span>}</td>
                        <td className="px-3 py-2"><Badge tone={statusTone(s.status)}>{s.status}</Badge></td>
                        <td className="px-2 py-1">
                          <div className="flex justify-end gap-1">
                            <ModalForm title="Edit selection" action={saveSelection} trigger="Edit" wide triggerClassName={btn("ghost", "px-2 py-0.5 text-xs")}>{fields(s)}</ModalForm>
                            <form action={deleteSelection}>
                              <input type="hidden" name="id" value={s.id} />
                              <ConfirmSubmit confirmText="Delete?" className="px-2 py-0.5 text-xs">Delete</ConfirmSubmit>
                            </form>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
