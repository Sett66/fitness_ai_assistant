import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 只删 tsc 产物与 tsbuildinfo，保留 dist/generated（含可能被 Node 锁定的 query_engine DLL） */
const artifacts = [
  'dist/index.js',
  'dist/index.js.map',
  'dist/index.d.ts',
  'dist/index.d.ts.map',
  'dist/client.js',
  'dist/client.js.map',
  'dist/client.d.ts',
  'dist/client.d.ts.map',
  'tsconfig.build.tsbuildinfo',
];

for (const rel of artifacts) {
  try {
    rmSync(join(root, rel), { force: true });
  } catch {
    // Windows 上偶发 EPERM，不阻断 build
  }
}
