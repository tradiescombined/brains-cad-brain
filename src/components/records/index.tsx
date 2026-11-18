/**
 * Reusable record panels: <NotesPanel> and <DocumentsPanel> for any entity
 * (entityType: "estimate" | "job" | "client" | "contact" | "lead" | ...).
 * `path` = the page path to revalidate after changes.
 */
import { db, schema } from "@/db";
import { and, desc, eq } from "drizzle-orm";
import { Card, Textarea, Select } from "@/components/ui";
import { SubmitButton } from "@/components/ui/client";
import { date } from "@/lib/format";
import { getLookups } from "@/lib/settings";
import { addNote, deleteNote, uploadDocuments, deleteDocument } from "./actions";
import { currentPermissions } from "@/lib/permissions";

type P = { entityType: string; entityId: string; path: string };

export async function NotesPanel({ entityType, entityId, path }: P) {
  const edit = (await currentPermissions())["notes.edit"];
  const rows = await db
    .select()
    .from(schema.notes)
    .where(and(eq(schema.notes.entityType, entityType), eq(schema.notes.entityId, entityId)))
    .orderBy(desc(schema.notes.createdAt));
  return (
    <Card title="Notes">
      {edit && <form action={addNote} className="space-y-2">
        <input type="hidden" name="entityType" value={entityType} />
        <input type="hidden" name="entityId" value={entityId} />
        <input type="hidden" name="path" value={path} />
        <Textarea name="body" placeholder="Write a note…" rows={2} />
        <div className="flex justify-end"><SubmitButton variant="secondary">Add note</SubmitButton></div>
      </form>}
      <ul className="mt-3 space-y-2">
        {rows.map((n) => (
          <li key={n.id} className="rounded-md bg-ink-50 p-3 text-sm">
            <p className="whitespace-pre-wrap text-ink-800">{n.body}</p>
            <div className="mt-1 flex items-center justify-between text-xs text-ink-500">
              <span>{n.author} · {date(n.createdAt)}</span>
              {edit && <form action={deleteNote}>
                <input type="hidden" name="id" value={n.id} />
                <input type="hidden" name="path" value={path} />
                <button className="text-ink-400 hover:text-red-600">Delete</button>
              </form>}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export async function DocumentsPanel({ entityType, entityId, path }: P) {
  const edit = (await currentPermissions())["notes.edit"];
  const rows = await db
    .select({ id: schema.documents.id, folder: schema.documents.folder, fileName: schema.documents.fileName, sizeBytes: schema.documents.sizeBytes, createdAt: schema.documents.createdAt })
    .from(schema.documents)
    .where(and(eq(schema.documents.entityType, entityType), eq(schema.documents.entityId, entityId)))
    .orderBy(desc(schema.documents.createdAt));
  const folders = (await getLookups("document_folder")).map((f) => f.name);
  const byFolder = new Map<string, typeof rows>();
  for (const r of rows) byFolder.set(r.folder, [...(byFolder.get(r.folder) ?? []), r]);
  return (
    <Card title="Documents">
      {edit && <form action={uploadDocuments} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="entityType" value={entityType} />
        <input type="hidden" name="entityId" value={entityId} />
        <input type="hidden" name="path" value={path} />
        <input type="file" name="files" multiple className="text-sm file:mr-2 file:rounded-md file:border file:border-ink-200 file:bg-white file:px-2 file:py-1 file:text-sm" />
        <Select name="folder" options={folders.length ? folders : ["Unassigned"]} className="w-40" />
        <SubmitButton variant="secondary" pendingText="Uploading…">Upload</SubmitButton>
      </form>}
      {[...byFolder].map(([folder, docs]) => (
        <div key={folder} className="mt-4">
          <div className="text-xs font-semibold text-ink-500">{folder} ({docs.length})</div>
          <ul className="mt-1 divide-y divide-ink-100">
            {docs.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-1.5 text-sm">
                <a href={`/api/documents/${d.id}`} target="_blank" className="truncate text-brand-700 hover:underline">{d.fileName}</a>
                <span className="flex items-center gap-3 text-xs text-ink-500">
                  {Math.ceil((d.sizeBytes ?? 0) / 1024)} KB · {date(d.createdAt)}
                  {edit && <form action={deleteDocument}>
                    <input type="hidden" name="id" value={d.id} />
                    <input type="hidden" name="path" value={path} />
                    <button className="text-ink-400 hover:text-red-600">Delete</button>
                  </form>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {rows.length === 0 && <p className="mt-3 text-sm text-ink-500">No documents yet.</p>}
    </Card>
  );
}
