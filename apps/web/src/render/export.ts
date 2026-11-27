import "server-only";
import { strToU8, zipSync } from "fflate";
import { PDFDocument } from "pdf-lib";

/** One PDF page per slide at the slide's pixel size (LinkedIn document posts accept this as-is). */
export async function slidesToPdf(pngs: Uint8Array[], size = { width: 1080, height: 1350 }, title = "Carousel"): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setCreator("ContentOS");
  pdf.setProducer("ContentOS");
  for (const png of pngs) {
    const img = await pdf.embedPng(png);
    const page = pdf.addPage([size.width, size.height]);
    page.drawImage(img, { x: 0, y: 0, width: size.width, height: size.height });
  }
  return pdf.save();
}

export function slidesToZip(pngs: Uint8Array[], pdf: Uint8Array, readme: string): Uint8Array {
  const files: Record<string, [Uint8Array, { level: 0 | 6 }]> = {};
  pngs.forEach((png, i) => {
    // PNGs are already compressed; store them as they are.
    files[`slide-${String(i + 1).padStart(2, "0")}.png`] = [png, { level: 0 }];
  });
  files["carousel.pdf"] = [pdf, { level: 6 }];
  files["README.txt"] = [strToU8(readme), { level: 6 }];
  return zipSync(files);
}
