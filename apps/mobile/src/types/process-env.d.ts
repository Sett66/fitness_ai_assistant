/** Babel 内联用；运行时由 Metro/Babel 从 apps/mobile/.env 注入 */
declare const process: {
  env: {
    API_BASE_URL?: string;
    STORAGE_PUBLIC_ENDPOINT?: string;
    [key: string]: string | undefined;
  };
};
