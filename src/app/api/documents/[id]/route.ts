import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

export async function GET(_req: Request, ctx: RouteContext<"/api/documents/[id]">) {
  const { id } = await ctx.params;
  const [d] = await db.select().from(schema.documents).where(eq(schema.documents.id, id));
  if (!d?.dataUrl) return new Response("Not found", { status: 404 });
  const [, meta, b64] = /^data:([^;]*);base64,(.*)$/s.exec(d.dataUrl) ?? [];
  return new Response(Buffer.from(b64 ?? "", "base64"), {
    headers: { "Content-Type": meta || "application/octet-stream", "Content-Disposition": `inline; filename="${encodeURIComponent(d.fileName)}"` },
  });
}
