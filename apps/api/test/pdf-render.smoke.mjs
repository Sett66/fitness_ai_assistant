import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';

globalThis.DOMMatrix ??= DOMMatrix;
globalThis.ImageData ??= ImageData;
globalThis.Path2D ??= Path2D;

const require = createRequire(import.meta.url);
const pdfjsRoot = dirname(require.resolve('pdfjs-dist/package.json'));
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
  join(pdfjsRoot, 'legacy/build/pdf.worker.mjs'),
).href;

function makeBlankPdf(pageCount) {
  const objs = [];
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  const kids = Array.from({ length: pageCount }, (_, i) => `${3 + i} 0 R`).join(' ');
  objs[2] = `<< /Type /Pages /Count ${pageCount} /Kids [${kids}] >>`;
  for (let i = 0; i < pageCount; i += 1) {
    objs[3 + i] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << >> >>';
  }
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 1; i < objs.length; i += 1) {
    offsets[i] = Buffer.byteLength(body);
    body += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xrefPos = Buffer.byteLength(body);
  let xref = `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i += 1) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  body += xref;
  body += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(body);
}

const maxPages = 2;
const data = Uint8Array.from(makeBlankPdf(3));
const loadingTask = pdfjs.getDocument({
  data,
  cMapUrl: `${pathToFileURL(join(pdfjsRoot, 'cmaps')).href}/`,
  cMapPacked: true,
  standardFontDataUrl: `${pathToFileURL(join(pdfjsRoot, 'standard_fonts')).href}/`,
  verbosity: 0,
});
const pdf = await loadingTask.promise;
const truncated = pdf.numPages > maxPages;
const renderCount = Math.min(pdf.numPages, maxPages);
const numPages = pdf.numPages;
const factory = pdf.canvasFactory;
const page = await pdf.getPage(1);
const viewport = page.getViewport({ scale: 1 });
const canvasAndContext = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
await page.render({
  canvasContext: canvasAndContext.context,
  canvas: canvasAndContext.canvas,
  viewport,
}).promise;
const png = canvasAndContext.canvas.toBuffer('image/png');
factory.destroy(canvasAndContext);
page.cleanup();
await loadingTask.destroy();

console.log('numPages', numPages);
console.log('renderCount', renderCount);
console.log('truncated', truncated);
console.log('pngBytes', png.length, 'magic', png.subarray(1, 4).toString('ascii'));
console.log('ok');
