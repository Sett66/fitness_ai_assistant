/**
 * 开发期 API / 存储覆盖项。
 *
 * 值来自 `apps/mobile/.env`（Metro/Babel 启动时加载，Babel 打包时内联），**不要**在此文件写死局域网 IP。
 * 配置说明见 `apps/mobile/.env.example` 与 `apps/mobile/README.md`「真机联调」。
 *
 * 注意：必须写 `process.env.API_BASE_URL` 这种静态成员访问，Babel 才能内联；勿改成动态 key。
 */
function normalize(raw: string | undefined): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export const DEV_CONFIG = {
  /** 覆盖默认 API base（须含 `/v1`）；null 则走模拟器/本机默认 */
  apiBaseUrl: normalize(process.env.API_BASE_URL),
  /** 覆盖 MinIO 对客户端可见的 endpoint；null 则 Android 模拟器用 10.0.2.2:9000 */
  storagePublicEndpoint: normalize(process.env.STORAGE_PUBLIC_ENDPOINT),
};
