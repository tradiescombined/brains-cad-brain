import { notFound } from "next/navigation";
import { DocumentsPanel, NotesPanel } from "@/components/records";
import { getJob } from "../../../schedule/_lib/job-data";

export default async function JobFilesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  const path = `/jobs/${id}/files`;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <NotesPanel entityType="job" entityId={id} path={path} />
      <DocumentsPanel entityType="job" entityId={id} path={path} />
    </div>
  );
}
