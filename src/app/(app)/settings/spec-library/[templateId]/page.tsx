import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { PageHeader } from "@/components/ui";
import { ConfirmSubmit } from "@/components/quote/ConfirmSubmit";
import { SpecEditor } from "@/components/quote/SpecEditor";
import { fromTemplateContent } from "@/components/quote/spec-tree";
import { deleteTemplate, saveTemplate } from "../actions";

export const metadata = { title: "Edit library template" };

export default async function EditTemplatePage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  const [t] = await db.select().from(schema.specificationTemplates).where(eq(schema.specificationTemplates.id, templateId));
  if (!t) notFound();
  const initial = fromTemplateContent(t.content, () => crypto.randomUUID());
  return (
    <div className="max-w-4xl">
      <PageHeader
        title={t.name}
        subtitle="Edit the sections stored in this template. Changes don’t affect estimates that already used it."
        back={{ href: "/settings/spec-library", label: "Specification library" }}
        actions={
          <form action={deleteTemplate}>
            <input type="hidden" name="id" value={t.id} />
            <ConfirmSubmit confirmText="Confirm delete">Delete template</ConfirmSubmit>
          </form>
        }
      />
      <SpecEditor initial={initial} name={t.name} saveAction={saveTemplate.bind(null, t.id)} emptyHint="Add the sections this template should insert into an estimate." />
    </div>
  );
}
