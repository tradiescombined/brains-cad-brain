import Link from "next/link";
import { desc } from "drizzle-orm";
import { db, schema } from "@/db";
import { PageHeader, Table, Th, Td, EmptyState, Input } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { ConfirmSubmit } from "@/components/quote/ConfirmSubmit";
import { date } from "@/lib/format";
import { countNodes, fromTemplateContent } from "@/components/quote/spec-tree";
import { createTemplate, deleteTemplate } from "./actions";

export const metadata = { title: "Specification library" };

export default async function SpecLibraryPage() {
  const rows = await db.select().from(schema.specificationTemplates).orderBy(desc(schema.specificationTemplates.updatedAt));
  let n = 0;
  const id = () => `t${++n}`;
  return (
    <div>
      <PageHeader
        title="Specification library"
        subtitle="Reusable sets of specification sections you can insert into any estimate."
        back={{ href: "/settings", label: "Settings" }}
      />
      <form action={createTemplate} className="mb-4 flex max-w-lg gap-2">
        <Input name="name" placeholder="New template name, e.g. Standard kitchen spec" aria-label="New template name" maxLength={120} required />
        <SubmitButton pendingText="Creating…">New template</SubmitButton>
      </form>
      {rows.length === 0 ? (
        <EmptyState
          title="No library templates yet"
          body="Create one here, or open an estimate’s Specifications tab and use “Save as library template”."
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th className="w-28 text-right">Sections</Th>
              <Th className="hidden w-40 sm:table-cell">Updated</Th>
              <Th className="w-44" />
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const nodes = fromTemplateContent(t.content, id);
              return (
                <tr key={t.id} data-testid="library-row">
                  <Td>
                    <Link href={`/settings/spec-library/${t.id}`} className="font-medium text-ink-900 hover:text-brand-700">{t.name}</Link>
                    <div className="truncate text-xs text-ink-500">{nodes.map((x) => x.heading).join(" · ") || "No sections"}</div>
                  </Td>
                  <Td className="text-right tabular-nums">{countNodes(nodes)}</Td>
                  <Td className="hidden text-ink-500 sm:table-cell">{date(t.updatedAt)}</Td>
                  <Td>
                    <div className="flex justify-end gap-2">
                      <Link href={`/settings/spec-library/${t.id}`} className="rounded-md border border-ink-200 px-3 py-1.5 text-sm font-medium hover:bg-ink-50">Edit</Link>
                      <form action={deleteTemplate}>
                        <input type="hidden" name="id" value={t.id} />
                        <ConfirmSubmit confirmText="Confirm delete">Delete</ConfirmSubmit>
                      </form>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
