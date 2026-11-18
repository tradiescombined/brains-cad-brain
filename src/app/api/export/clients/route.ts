import { db, schema } from "@/db";
import { asc, eq } from "drizzle-orm";
import { exportFileName, toCsv } from "@/app/(app)/clients/csv";
import { CLIENT_FIELDS } from "@/app/(app)/clients/fields";

export const dynamic = "force-dynamic";

/** GET /api/export/clients[?archived=1] → CSV of clients (column headers match the importer). */
export async function GET(req: Request) {
  const includeArchived = new URL(req.url).searchParams.get("archived") === "1";
  const q = db.select().from(schema.clients).orderBy(asc(schema.clients.name));
  const rows = includeArchived ? await q : await q.where(eq(schema.clients.archived, false));
  const header = [...CLIENT_FIELDS.map((f) => f.label), "Archived", "Created"];
  const body = rows.map((r) => [
    ...CLIENT_FIELDS.map((f) => r[f.key as keyof typeof r] as string | number | null),
    r.archived,
    r.createdAt.slice(0, 10),
  ]);
  return new Response("﻿" + toCsv([header, ...body]), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName("clients")}"`,
      "Cache-Control": "no-store",
    },
  });
}
