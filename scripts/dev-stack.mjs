/**
 * 本地全栈开发：Fitness Docker + Langfuse Docker + API/Worker
 *
 * 用法（仓库根目录）：
 *   pnpm dev:stack
 *
 * 环境变量：
 *   LANGFUSE_LOCAL=false  仅起 fitness 基础设施，跳过 Langfuse
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fitnessCompose = join(root, 'docker/docker-compose.yml');
const langfuseCompose = join(root, 'docker/langfuse.compose.yml');
const langfuseLocal = process.env.LANGFUSE_LOCAL !== 'false';
const langfuseHealthUrl = 'http://127.0.0.1:3100/api/public/health';

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      shell: true,
      ...options,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function waitForLangfuse(maxAttempts = 90) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(langfuseHealthUrl, {
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) {
        console.log(`[dev:stack] Langfuse 已就绪：http://127.0.0.1:3100`);
        return;
      }
    } catch {
      // 容器仍在启动或迁移中
    }
    console.log(`[dev:stack] 等待 Langfuse… (${attempt}/${maxAttempts})`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`Langfuse 在 ${maxAttempts * 2}s 内未就绪：${langfuseHealthUrl}`);
}

async function main() {
  const composeArgs = ['compose', '-f', fitnessCompose];
  if (langfuseLocal) {
    composeArgs.push('-f', langfuseCompose);
  }

  console.log('[dev:stack] 启动 Docker 基础设施…');
  await run('docker', [...composeArgs, 'up', '-d']);

  if (langfuseLocal) {
    await waitForLangfuse();
    console.log(
      '[dev:stack] 本地 Langfuse API Key（首次 init）：pk-lf-fitness-local / sk-lf-fitness-local',
    );
  } else {
    console.log('[dev:stack] LANGFUSE_LOCAL=false，已跳过 Langfuse');
  }

  console.log('[dev:stack] 启动 API + Worker…');
  const apiDev = spawn('pnpm', ['--filter', '@fitness/api', 'dev'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  });

  const shutdown = (signal) => {
    if (!apiDev.killed) {
      apiDev.kill(signal);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  apiDev.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  console.error(`[dev:stack] 失败：${error.message}`);
  process.exit(1);
});
