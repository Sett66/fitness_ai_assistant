import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { Injectable, Logger } from '@nestjs/common';
import { REPORT_PDF_MAX_PAGES, REPORT_PDF_RENDER_DPI } from '@fitness/shared';

export type PdfRenderOptions = {
  dpi?: number;
  maxPages?: number;
};

export type PdfRenderResult = {
  pages: Buffer[];
  pageCount: number;
  truncated: boolean;
};

export function planPdfPageRender(
  pageCount: number,
  maxPages: number,
): { renderCount: number; truncated: boolean } {
  return {
    renderCount: Math.min(pageCount, maxPages),
    truncated: pageCount > maxPages,
  };
}

const PDF_USER_SPACE_DPI = 72;
const MAX_PAGE_EDGE_PX = 4096;
const PDFJS_LEGACY = 'pdfjs-dist/legacy/build/pdf.mjs';

type PdfJsModule = typeof import('pdfjs-dist');

type CanvasAndContext = {
  canvas: { toBuffer: (mime: 'image/png') => Buffer; width: number; height: number };
  context: unknown;
};

type NodeCanvasFactory = {
  create: (width: number, height: number) => CanvasAndContext;
  destroy: (canvasAndContext: CanvasAndContext) => void;
};

const cjsRequire = createRequire(__filename);

@Injectable()
export class PdfRenderService {
  private readonly logger = new Logger(PdfRenderService.name);

  async renderPdfToImages(
    buffer: Buffer,
    options: PdfRenderOptions = {},
  ): Promise<PdfRenderResult> {
    const dpi = options.dpi ?? REPORT_PDF_RENDER_DPI;
    const maxPages = options.maxPages ?? REPORT_PDF_MAX_PAGES;
    const pdfjs = await loadPdfjs();
    const pdfjsRoot = dirname(cjsRequire.resolve('pdfjs-dist/package.json'));

    const data = Uint8Array.from(buffer);
    const loadingTask = pdfjs.getDocument({
      data,
      cMapUrl: dirUrl(join(pdfjsRoot, 'cmaps')),
      cMapPacked: true,
      standardFontDataUrl: dirUrl(join(pdfjsRoot, 'standard_fonts')),
      wasmUrl: dirUrl(join(pdfjsRoot, 'wasm')),
      verbosity: 0,
    });

    const pdf = await loadingTask.promise;
    try {
      const { renderCount, truncated } = planPdfPageRender(pdf.numPages, maxPages);
      if (truncated) {
        this.logger.warn(`PDF 共 ${pdf.numPages} 页，截断为前 ${maxPages} 页`);
      }

      const pages: Buffer[] = [];
      const canvasFactory = pdf.canvasFactory as NodeCanvasFactory;
      const scale = dpi / PDF_USER_SPACE_DPI;

      for (let pageNumber = 1; pageNumber <= renderCount; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        let viewport = page.getViewport({ scale });
        const longest = Math.max(viewport.width, viewport.height);
        if (longest > MAX_PAGE_EDGE_PX) {
          viewport = page.getViewport({ scale: scale * (MAX_PAGE_EDGE_PX / longest) });
        }

        const canvasAndContext = canvasFactory.create(
          Math.ceil(viewport.width),
          Math.ceil(viewport.height),
        );
        try {
          await page.render({
            canvasContext: canvasAndContext.context as never,
            canvas: canvasAndContext.canvas as never,
            viewport,
          }).promise;
          pages.push(canvasAndContext.canvas.toBuffer('image/png'));
        } finally {
          canvasFactory.destroy(canvasAndContext);
          page.cleanup();
        }
      }

      return { pages, pageCount: pdf.numPages, truncated };
    } finally {
      await loadingTask.destroy();
    }
  }
}

let pdfjsPromise: Promise<PdfJsModule> | null = null;

async function loadPdfjs(): Promise<PdfJsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const canvas = await import('@napi-rs/canvas');
      const global = globalThis as typeof globalThis & {
        DOMMatrix?: unknown;
        ImageData?: unknown;
        Path2D?: unknown;
      };
      global.DOMMatrix ??= canvas.DOMMatrix;
      global.ImageData ??= canvas.ImageData;
      global.Path2D ??= canvas.Path2D;

      const pdfjs = (await import(PDFJS_LEGACY)) as PdfJsModule;
      const pdfjsRoot = dirname(cjsRequire.resolve('pdfjs-dist/package.json'));
      pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
        join(pdfjsRoot, 'legacy/build/pdf.worker.mjs'),
      ).href;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

function dirUrl(dir: string): string {
  const href = pathToFileURL(dir).href;
  return href.endsWith('/') ? href : `${href}/`;
}
