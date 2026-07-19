/**
 * 从 apps/mobile/.env 加载变量到 process.env（不覆盖已有非空环境变量）。
 * 由 metro.config.js / babel.config.js 在启动时 require。
 */
const fs = require('fs');
const path = require('path');

function loadMobileEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }

  const text = fs.readFileSync(envPath, 'utf8');
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const eq = line.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    const existing = process.env[key];
    if (existing === undefined || existing === '') {
      process.env[key] = val;
    }
  }
}

loadMobileEnv();

module.exports = { loadMobileEnv };
