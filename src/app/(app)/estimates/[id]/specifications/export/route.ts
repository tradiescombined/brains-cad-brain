import { routeDenied } from "@/lib/permissions";
import { getOrCreateQuoteOptions, loadQuoteModel } from "@/components/quote/data";
import { buildSpecDocument, specToMarkdown } from "@/components/quote/spec-costings";

export const dynamic = "force-dynamic";

/** GET → the estimate's specification as a Markdown download (images are left out). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await routeDenied("estimates.view");
  if (denied) return denied;
  const { id } = await params;
  const opts = await getOrCreateQuoteOptions(id);
  const model = await loadQuoteModel(id, opts);
  if (!model) return new Response("Not found", { status: 404 });
  const md = specToMarkdown(buildSpecDocument(model.specs, model.specItems), {
    title: `Specification — ${model.estimate.name} (${model.estimate.number})`,
    intro: model.specIntro,
    numbers: opts.printSpecificationNumbers,
  });
  const file = `specification-${model.estimate.number}`.replace(/[^A-Za-z0-9_-]+/g, "-") + ".md";
  return new Response(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}
