import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { routeDenied } from "@/lib/permissions";

/** Serves a specification item image (stored as a data URL) so the editor payload stays small. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const denied = await routeDenied("estimates.view");
  if (denied) return denied;
  const { id, itemId } = await params;
  const t = schema.specItemDetails;
  const [d] = await db.select({ data: t.imageDataUrl }).from(t).where(and(eq(t.estimateItemId, itemId), eq(t.estimateId, id)));
  const m = d?.data ? /^data:([^;,]+);base64,([\s\S]*)$/.exec(d.data) : null;
  if (!m) return new Response("Not found", { status: 404 });
  const body = Buffer.from(m[2], "base64");
  return new Response(body, {
    headers: {
      "Content-Type": m[1],
      "Content-Length": String(body.length),
      // The editor links with ?v=<updatedAt>, so long-lived caching is safe.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
