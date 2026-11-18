import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";

/** Serves a plan image stored as a data URL so page payloads stay small and the browser can cache it. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; planId: string }> }) {
  const { id, planId } = await params;
  const [p] = await db
    .select({ data: schema.plans.imageDataUrl })
    .from(schema.plans)
    .where(and(eq(schema.plans.id, planId), eq(schema.plans.estimateId, id)));
  const m = p?.data ? /^data:([^;,]+);base64,([\s\S]*)$/.exec(p.data) : null;
  if (!m) return new Response("Not found", { status: 404 });
  const body = Buffer.from(m[2], "base64");
  return new Response(body, {
    headers: {
      "Content-Type": m[1],
      "Content-Length": String(body.length),
      // The page links with ?v=<updatedAt>, so long-lived caching is safe.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
