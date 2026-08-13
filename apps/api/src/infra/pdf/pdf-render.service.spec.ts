import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { planPdfPageRender } from './pdf-render.service';

describe('planPdfPageRender', () => {
  it('超出 maxPages 时截断', () => {
    expect(planPdfPageRender(18, 15)).toEqual({ renderCount: 15, truncated: true });
  });

  it('未超限时不截断', () => {
    expect(planPdfPageRender(2, 15)).toEqual({ renderCount: 2, truncated: false });
  });
});

describe('pdfjs + @napi-rs/canvas 渲染', () => {
  it('在独立 Node 进程中把 PDF 页渲染成 PNG', () => {
    const script = join(process.cwd(), 'test/pdf-render.smoke.mjs');
    const out = execFileSync(process.execPath, [script], {
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(out).toContain('magic PNG');
    expect(out).toContain('truncated true');
    expect(out).toContain('ok');
  }, 30_000);
});
