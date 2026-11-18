import { notFound } from "next/navigation";
import { db, schema } from "@/db";
import { asc, desc, eq } from "drizzle-orm";
import { Badge, Card, EmptyState, Field, Input, Select } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { cx, date, money, num, todayIso } from "@/lib/format";
import { actualByLine } from "@/lib/job-finance";
import { deleteActualCost, deleteBudgetLine, saveActualCost, saveBudgetLine } from "../../actions";
import { COST_TYPES, contactOptions, getJob, loadJobFinance } from "../../../schedule/_lib/job-data";
import { ModalForm, ConfirmSubmit } from "../../../schedule/_lib/client";
import { btn } from "../../../schedule/_lib/bits";
import { Mini, ProgressBar, pctText, signTone } from "../../../schedule/_lib/bits";

type Line = typeof schema.jobBudgetLines.$inferSelect;
type Cost = typeof schema.actualCosts.$inferSelect;

export default async function JobCostsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  const [lines, costs, suppliers, f] = await Promise.all([
    db.select().from(schema.jobBudgetLines).where(eq(schema.jobBudgetLines.jobId, id)).orderBy(asc(schema.jobBudgetLines.sortOrder)),
    db.select().from(schema.actualCosts).where(eq(schema.actualCosts.jobId, id)).orderBy(desc(schema.actualCosts.date), desc(schema.actualCosts.createdAt)),
    contactOptions(),
    loadJobFinance(job),
  ]);
  const byLine = actualByLine(costs);
  const supplierName = new Map(suppliers.map((s) => [s.value, s.label]));
  const lineOptions = lines.map((l) => ({ value: l.id, label: `${l.category} · ${l.description}` }));
  const categories = [...new Set(lines.map((l) => l.category))];
  const groups = categories.map((c) => ({ category: c, lines: lines.filter((l) => l.category === c) }));
  const costTotalInc = costs.reduce((s, c) => s + c.amount + c.tax, 0);

  const lineFields = (l?: Line) => (
    <>
      <input type="hidden" name="jobId" value={id} />
      {l && <input type="hidden" name="id" value={l.id} />}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <Input name="category" defaultValue={l?.category} required list="budget-categories" placeholder="e.g. Framing" />
        </Field>
        <Field label="Cost type"><Select name="costType" defaultValue={l?.costType ?? "Material"} options={[...COST_TYPES]} /></Field>
        <Field label="Description" className="col-span-2"><Input name="description" defaultValue={l?.description} required /></Field>
        <Field label="Quantity"><Input name="quantity" inputMode="decimal" defaultValue={l ? String(l.quantity) : "1"} /></Field>
        <Field label="Unit"><Input name="uom" defaultValue={l?.uom ?? ""} placeholder="ea, m2, hr…" /></Field>
        <Field label="Unit cost (ex tax)" className="col-span-2" hint="Budget = quantity × unit cost"><Input name="unitCost" inputMode="decimal" defaultValue={l ? String(l.unitCost) : ""} required /></Field>
      </div>
      <div className="flex justify-end border-t border-ink-100 pt-3"><SubmitButton>{l ? "Save line" : "Add line"}</SubmitButton></div>
    </>
  );

  const costFields = (c?: Cost) => (
    <>
      <input type="hidden" name="jobId" value={id} />
      {c && <input type="hidden" name="id" value={c.id} />}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><Input type="date" name="date" required defaultValue={c?.date ?? todayIso()} /></Field>
        <Field label="Reference"><Input name="reference" defaultValue={c?.reference ?? ""} placeholder="Bill / receipt no." /></Field>
        <Field label="Supplier" className="col-span-2"><Select name="supplierId" defaultValue={c?.supplierId ?? ""} options={suppliers} placeholder="— None —" /></Field>
        <Field label="Description" className="col-span-2"><Input name="description" required defaultValue={c?.description} /></Field>
        <Field label="Budget line" className="col-span-2"><Select name="budgetLineId" defaultValue={c?.budgetLineId ?? ""} options={lineOptions} placeholder="— Not linked —" /></Field>
        <Field label="Cost type"><Select name="costType" defaultValue={c?.costType ?? ""} options={[...COST_TYPES]} placeholder="From budget line" /></Field>
        <Field label="Amount (ex tax)"><Input name="amount" inputMode="decimal" required defaultValue={c ? String(c.amount) : ""} /></Field>
        <Field label="Tax" hint="Leave blank to apply GST on expenses"><Input name="tax" inputMode="decimal" defaultValue={c ? String(c.tax) : ""} /></Field>
      </div>
      <div className="flex justify-end border-t border-ink-100 pt-3"><SubmitButton>{c ? "Save cost" : "Add cost"}</SubmitButton></div>
    </>
  );

  return (
    <div className="space-y-6">
      <datalist id="budget-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Mini label="Budget" value={money(f.revisedBudget)} />
        <Mini label="Actual to date" value={money(f.actualToDate)} sub={`incl. ${money(f.labourCost)} timesheet labour`} />
        <Mini label="Remaining" value={money(f.revisedBudget - f.actualToDate)} tone={signTone(f.revisedBudget - f.actualToDate)} />
        <Mini label="Forecast cost" value={money(f.forecastCost)} sub={`Margin ${pctText(f.forecastMarginPercent)}`} />
      </div>

      <Card
        title="Budget lines"
        pad={false}
        actions={<ModalForm title="Add budget line" action={saveBudgetLine} trigger="Add budget line" triggerClassName={btn("secondary", "px-2.5 py-1 text-xs")}>{lineFields()}</ModalForm>}
      >
        {lines.length === 0 ? (
          <p className="p-4 text-sm text-ink-500">No budget lines. Jobs created from an estimate get one line per costing item; add lines here for blank jobs.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="budget-table">
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
                  <th className="px-3 py-2">Item</th>
                  <th className="hidden px-3 py-2 text-right md:table-cell">Qty</th>
                  <th className="hidden px-3 py-2 text-right md:table-cell">Unit cost</th>
                  <th className="px-3 py-2 text-right">Budget</th>
                  <th className="px-3 py-2 text-right">Actual</th>
                  <th className="px-3 py-2 text-right">Variance</th>
                  <th className="hidden w-28 px-3 py-2 sm:table-cell">Used</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              {groups.map((g) => {
                const gb = g.lines.reduce((s, l) => s + l.budget, 0);
                const ga = g.lines.reduce((s, l) => s + (byLine.get(l.id) ?? 0), 0);
                return (
                  <tbody key={g.category}>
                    <tr className="bg-ink-50/60 font-semibold">
                      <td className="px-3 py-1.5 text-ink-800">{g.category}</td>
                      <td className="hidden md:table-cell" /><td className="hidden md:table-cell" />
                      <td className="px-3 py-1.5 text-right tabular-nums">{money(gb)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{money(ga)}</td>
                      <td className={cx("px-3 py-1.5 text-right tabular-nums", signTone(gb - ga))}>{money(gb - ga)}</td>
                      <td className="hidden px-3 sm:table-cell"><ProgressBar value={gb ? (ga / gb) * 100 : ga ? 100 : 0} over={ga > gb + 0.005} label={`${g.category} used`} /></td>
                      <td />
                    </tr>
                    {g.lines.map((l) => {
                      const a = byLine.get(l.id) ?? 0;
                      const over = a > l.budget + 0.005;
                      return (
                        <tr key={l.id} className={cx("border-b border-ink-100", over && "bg-red-50/60")}>
                          <td className="px-3 py-1.5 pl-6">
                            <span className="text-ink-900">{l.description}</span>
                            <span className="ml-2 text-xs text-ink-400">{l.costType}</span>
                            {over && <span className="ml-2"><Badge tone="red">Over</Badge></span>}
                          </td>
                          <td className="hidden px-3 py-1.5 text-right tabular-nums md:table-cell">{num(l.quantity, 3)} {l.uom}</td>
                          <td className="hidden px-3 py-1.5 text-right tabular-nums md:table-cell">{money(l.unitCost)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{money(l.budget)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{money(a)}</td>
                          <td className={cx("px-3 py-1.5 text-right tabular-nums", signTone(l.budget - a))}>{money(l.budget - a)}</td>
                          <td className="hidden px-3 sm:table-cell"><ProgressBar value={l.budget ? (a / l.budget) * 100 : a ? 100 : 0} over={over} /></td>
                          <td className="px-2 py-1">
                            <div className="flex justify-end gap-1">
                              <ModalForm title="Edit budget line" action={saveBudgetLine} trigger="Edit" triggerClassName={btn("ghost", "px-2 py-0.5 text-xs")}>{lineFields(l)}</ModalForm>
                              <form action={deleteBudgetLine}>
                                <input type="hidden" name="id" value={l.id} />
                                <ConfirmSubmit confirmText="Delete?" className="px-2 py-0.5 text-xs">Delete</ConfirmSubmit>
                              </form>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                );
              })}
            </table>
          </div>
        )}
      </Card>

      <Card
        title={`Actual costs (${costs.length})`}
        pad={false}
        actions={<ModalForm title="Add actual cost" action={saveActualCost} trigger="Add cost" triggerClassName={btn("primary", "px-2.5 py-1 text-xs")}>{costFields()}</ModalForm>}
      >
        {costs.length === 0 ? (
          <div className="p-4"><EmptyState title="No costs recorded" body="Record supplier bills, receipts and subcontractor invoices against this job to track spend against the budget." /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" data-testid="cost-table">
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="hidden px-3 py-2 md:table-cell">Supplier</th>
                  <th className="hidden px-3 py-2 lg:table-cell">Budget line</th>
                  <th className="px-3 py-2 text-right">Ex tax</th>
                  <th className="hidden px-3 py-2 text-right sm:table-cell">Tax</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {costs.map((c) => (
                  <tr key={c.id} className="border-b border-ink-100" data-cost={c.description}>
                    <td className="whitespace-nowrap px-3 py-1.5">{date(c.date)}</td>
                    <td className="px-3 py-1.5">
                      <div className="text-ink-900">{c.description}</div>
                      <div className="text-xs text-ink-500">{[c.costType, c.reference].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td className="hidden px-3 py-1.5 md:table-cell">{(c.supplierId && supplierName.get(c.supplierId)) || <span className="text-ink-400">—</span>}</td>
                    <td className="hidden px-3 py-1.5 text-xs lg:table-cell">{(c.budgetLineId && lineOptions.find((o) => o.value === c.budgetLineId)?.label) || <span className="text-ink-400">Unallocated</span>}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{money(c.amount)}</td>
                    <td className="hidden px-3 py-1.5 text-right tabular-nums text-ink-500 sm:table-cell">{money(c.tax)}</td>
                    <td className="px-2 py-1">
                      <div className="flex justify-end gap-1">
                        <ModalForm title="Edit actual cost" action={saveActualCost} trigger="Edit" triggerClassName={btn("ghost", "px-2 py-0.5 text-xs")}>{costFields(c)}</ModalForm>
                        <form action={deleteActualCost}>
                          <input type="hidden" name="id" value={c.id} />
                          <ConfirmSubmit confirmText="Delete?" className="px-2 py-0.5 text-xs">Delete</ConfirmSubmit>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="px-3 py-2" colSpan={2}>Total</td>
                  <td className="hidden md:table-cell" /><td className="hidden lg:table-cell" />
                  <td className="px-3 py-2 text-right tabular-nums" data-testid="cost-total">{money(f.actualCosts)}</td>
                  <td className="hidden px-3 py-2 text-right tabular-nums text-ink-500 sm:table-cell">{money(costTotalInc - f.actualCosts)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
