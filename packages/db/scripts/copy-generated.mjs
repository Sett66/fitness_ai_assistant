import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const src = join(root, 'src', 'generated');
const dest = join(root, 'dist', 'generated');

mkdirSync(dest, { recursive: true });

/** Windows：跳过已存在且可能被占用的原生二进制 */
function shouldSkipCopy(name) {
  return name.endsWith('.dll.node') || name.endsWith('.so.node') || name.endsWith('.dylib.node');
}

function copyDir(from, to) {
  for (const entry of readdirSync(from)) {
    const srcPath = join(from, entry);
    const destPath = join(to, entry);
    const st = statSync(srcPath);
    if (st.isDirectory()) {
      mkdirSync(destPath, { recursive: true });
      copyDir(srcPath, destPath);
      continue;
    }
    if (shouldSkipCopy(entry) && existsSync(destPath)) {
      continue;
    }
    try {
      cpSync(srcPath, destPath, { force: true });
    } catch (err) {
      if (shouldSkipCopy(entry) && existsSync(destPath)) {
        continue;
      }
      throw err;
    }
  }
}

copyDir(src, dest);
