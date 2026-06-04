/**
 * 仅在 workspace 包 dist 缺失时触发 build，避免 dev 重启时反复 rimraf 锁定的 Prisma DLL。
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const packages = [
  { name: '@fitness/db', marker: 'packages/db/dist/index.d.ts' },
  { name: '@fitness/shared', marker: 'packages/shared/dist/index.d.ts' },
  { name: '@fitness/ai-core', marker: 'packages/ai-core/dist/index.d.ts' },
];

for (const pkg of packages) {
  const markerPath = join(root, pkg.marker);
  if (existsSync(markerPath)) {
    console.log(`[ensure-deps] skip ${pkg.name} (already built)`);
    continue;
  }
  console.log(`[ensure-deps] build ${pkg.name}…`);
  execSync(`pnpm --filter ${pkg.name} build`, { cwd: root, stdio: 'inherit' });
}
