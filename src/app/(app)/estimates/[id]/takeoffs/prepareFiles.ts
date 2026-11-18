"use client";
/** Browser-side conversion of uploaded files into plan pages (data URL + pixel size). */

export interface PreparedPage {
  label: string;
  dataUrl: string;
  width: number;
  height: number;
  sourceDpi: number | null;
}

const MAX_BYTES = 20 * 1024 * 1024;
/** Longest side, in px, a PDF page is rendered at. */
const PDF_TARGET_PX = 3200;

function baseName(name: string) {
  return name.replace(/\.[^.]+$/, "").trim() || "Plan";
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read the file"));
    r.readAsDataURL(file);
  });
}

function imageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error("The image could not be decoded"));
    img.src = src;
  });
}

export function fileKind(file: File): "image" | "pdf" | null {
  const n = file.name.toLowerCase();
  if (file.type === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (/^image\/(png|jpeg)$/.test(file.type) || /\.(png|jpe?g)$/.test(n)) return "image";
  return null;
}

async function prepareImage(file: File): Promise<PreparedPage[]> {
  if (file.size > MAX_BYTES) throw new Error(`${file.name} is larger than 20 MB`);
  const dataUrl = await readAsDataUrl(file);
  const { width, height } = await imageSize(dataUrl);
  return [{ label: baseName(file.name), dataUrl, width, height, sourceDpi: null }];
}

async function preparePdf(file: File, onProgress?: (msg: string) => void): Promise<PreparedPage[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  const out: PreparedPage[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      onProgress?.(`Rendering ${file.name} page ${i} of ${doc.numPages}…`);
      const page = await doc.getPage(i);
      const unit = page.getViewport({ scale: 1 });
      const scale = Math.min(4, Math.max(1, PDF_TARGET_PX / Math.max(unit.width, unit.height)));
      const vp = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas is not available in this browser");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
      let dataUrl = canvas.toDataURL("image/png");
      if (dataUrl.length * 0.75 > MAX_BYTES) dataUrl = canvas.toDataURL("image/jpeg", 0.85);
      out.push({
        label: doc.numPages > 1 ? `${baseName(file.name)} – p${i}` : baseName(file.name),
        dataUrl,
        width: canvas.width,
        height: canvas.height,
        sourceDpi: Math.round(72 * scale * 100) / 100,
      });
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  return out;
}

/** Converts files to plan pages. Each PDF page becomes its own plan. */
export async function prepareFiles(files: File[], onProgress?: (msg: string) => void): Promise<PreparedPage[]> {
  const pages: PreparedPage[] = [];
  for (const f of files) {
    const kind = fileKind(f);
    if (!kind) throw new Error(`${f.name}: only PNG, JPG or PDF files can be used as plans`);
    onProgress?.(`Reading ${f.name}…`);
    pages.push(...(kind === "pdf" ? await preparePdf(f, onProgress) : await prepareImage(f)));
  }
  return pages;
}
