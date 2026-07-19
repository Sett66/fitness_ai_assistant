import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cwd = join(dirname(fileURLToPath(import.meta.url)), '..');

const children = ['start:api', 'start:worker'].map((script) =>
  spawn('pnpm', ['run', script], { cwd, stdio: 'inherit', shell: true }),
);

const shutdown = () => {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

for (const child of children) {
  child.on('exit', (code) => {
    if (code && code !== 0) shutdown();
  });
}
