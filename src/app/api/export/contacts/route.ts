import { db, schema } from "@/db";
import { asc, eq } from "drizzle-orm";
import { exportFileName, toCsv, type CsvCell } from "@/app/(app)/clients/csv";
import { parseGroups } from "@/app/(app)/clients/list";
import { CONTACT_FIELDS } from "@/app/(app)/contacts/fields";

export const dynamic = "force-dynamic";

/** GET /api/export/contacts[?archived=1] → CSV of suppliers & trades (headers match the importer). */
export async function GET(req: Request) {
  const includeArchived = new URL(req.url).searchParams.get("archived") === "1";
  const q = db.select().from(schema.contacts).orderBy(asc(schema.contacts.name));
  const rows = includeArchived ? await q : await q.where(eq(schema.contacts.archived, false));
  const header = [...CONTACT_FIELDS.map((f) => f.label), "Archived", "Created"];
  const body = rows.map((r) => [
    ...CONTACT_FIELDS.map((f): CsvCell => (f.key === "groups" ? parseGroups(r.groups).join("; ") : (r[f.key as keyof typeof r] as CsvCell))),
    r.archived,
    r.createdAt.slice(0, 10),
  ]);
  return new Response("﻿" + toCsv([header, ...body]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName("suppliers-trades")}"`,
      "Cache-Control": "no-store",
    },
  });
}
