import { Platform } from 'react-native';

import { DEV_CONFIG } from './dev-config';

/** Android 模拟器访问宿主机 localhost */
const DEV_ANDROID_BASE = 'http://10.0.2.2:3000/v1';
const DEV_IOS_BASE = 'http://127.0.0.1:3000/v1';

const defaultApiBase = Platform.OS === 'android' ? DEV_ANDROID_BASE : DEV_IOS_BASE;

export const API_BASE_URL = DEV_CONFIG.apiBaseUrl ?? defaultApiBase;

/** Android 模拟器访问宿主机 MinIO；签发预签名 URL 时传给 API */
export const DEV_STORAGE_PUBLIC_ENDPOINT =
  DEV_CONFIG.storagePublicEndpoint ??
  (Platform.OS === 'android' && __DEV__ ? 'http://10.0.2.2:9000' : undefined);

export const DEFAULT_TIMEZONE_OFFSET_MINUTES = 480;

export const AI_POLL_INTERVAL_MS = 1500;
/** 食物识图等短任务 */
export const AI_POLL_TIMEOUT_MS = 180_000;
/** 计划生成（DeepSeek 4 周 mesocycle）常需 3–4 分钟 */
export const AI_POLL_TIMEOUT_PLAN_MS = 360_000;
