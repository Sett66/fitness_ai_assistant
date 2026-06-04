import { AuthSuccessResponseSchema, RefreshRequestSchema, TokenPairSchema } from '@fitness/shared';
import { API_BASE_URL } from '../env';
import { getAccessToken, getRefreshToken, useAuthStore } from '../store/auth-store';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  auth?: boolean;
  headers?: Record<string, string>;
  /** 轮询等场景禁用 HTTP 缓存，避免 304 返回旧状态 */
  noCache?: boolean;
};

let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(RefreshRequestSchema.parse({ refreshToken })),
  });

  if (!res.ok) {
    await useAuthStore.getState().clearAuth();
    return false;
  }

  const json = (await res.json()) as unknown;
  const tokens = TokenPairSchema.parse(json);
  await useAuthStore.getState().setTokens({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  });
  return true;
}

async function ensureRefreshed(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, headers = {}, noCache = false } = options;

  const doFetch = async (_retry: boolean): Promise<Response> => {
    const reqHeaders: Record<string, string> = {
      Accept: 'application/json',
      ...headers,
    };
    if (noCache) {
      reqHeaders['Cache-Control'] = 'no-cache, no-store';
      reqHeaders.Pragma = 'no-cache';
    }
    if (body !== undefined) {
      reqHeaders['Content-Type'] = 'application/json';
    }
    if (auth) {
      const token = getAccessToken();
      if (token) reqHeaders.Authorization = `Bearer ${token}`;
    }

    return fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: reqHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      ...(noCache ? { cache: 'no-store' as const } : {}),
    });
  };

  let res = await doFetch(false);

  if (res.status === 401 && auth) {
    const ok = await ensureRefreshed();
    if (ok) {
      res = await doFetch(true);
    }
  }

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    let code: string | undefined;
    try {
      const errJson = (await res.json()) as { message?: string; code?: string };
      message = errJson.message ?? message;
      code = errJson.code;
    } catch {
      // ignore
    }
    throw new ApiError(message, res.status, code);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

export async function apiAuth<T>(
  path: '/auth/register' | '/auth/login',
  body: unknown,
): Promise<T> {
  const json = await apiFetch<unknown>(path, { method: 'POST', body, auth: false });
  return AuthSuccessResponseSchema.parse(json) as T;
}

/**
 * 上传本地文件到 S3 预签名 URL。
 * RN 相册返回的 content:// URI 不能用 fetch 读取，需用 XHR + { uri }。
 * 预签名 URL 的 host 不可改写（会破坏签名），由 API 按 clientPublicEndpoint 签发。
 */
export async function uploadToPresignedUrl(
  uploadUrl: string,
  fileUri: string,
  mime: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new ApiError('上传失败', xhr.status));
      }
    };
    xhr.onerror = () => {
      reject(new ApiError('无法连接存储服务，请检查网络或 MinIO 配置', 0));
    };
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', mime);
    xhr.send({ uri: fileUri, type: mime, name: 'upload' } as unknown as Blob);
  });
}

export async function pollAiTask<T>(
  taskId: string,
  intervalMs: number,
  timeoutMs: number,
): Promise<T> {
  const start = Date.now();
  while (timeoutMs > Date.now() - start) {
    const status = await apiFetch<{
      status: string;
      result?: T;
      errorMsg?: string | null;
    }>(`/ai/tasks/${taskId}`, { noCache: true });

    if (status.status === 'DONE') {
      return status.result as T;
    }
    if (status.status === 'FAILED' || status.status === 'CANCELLED') {
      throw new ApiError(status.errorMsg ?? 'AI 任务失败', 500);
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, intervalMs);
    });
  }
  throw new ApiError('AI 任务超时', 408);
}

export type SseEventHandler = (event: string, data: unknown) => void;

export type SseStreamHandle = {
  abort: () => void;
};

let activeSseXhr: XMLHttpRequest | null = null;
let sseAbortRequested = false;

/** 中止当前进行中的 SSE 流式请求（Coach 停止生成）。 */
export function abortActiveSseStream(): void {
  sseAbortRequested = true;
  activeSseXhr?.abort();
  activeSseXhr = null;
}

function parseSseChunk(buffer: string, onEvent: SseEventHandler): string {
  const parts = buffer.split('\n\n');
  const remainder = parts.pop() ?? '';

  for (const part of parts) {
    if (!part.trim()) continue;
    let eventName = 'message';
    let dataLine = '';
    for (const line of part.split('\n')) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLine += line.slice(5).trim();
      }
    }
    if (!dataLine) continue;
    try {
      onEvent(eventName, JSON.parse(dataLine) as unknown);
    } catch {
      onEvent(eventName, dataLine);
    }
  }

  return remainder;
}

/**
 * POST + SSE 流式响应（Coach CHAT 等）。RN 下用 XHR 增量读取，避免 fetch ReadableStream 类型限制。
 */
export async function apiStreamSSE(
  path: string,
  body: unknown,
  onEvent: SseEventHandler,
  options?: { timeoutMs?: number },
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 120_000;
  const url = `${API_BASE_URL}${path}`;
  const payload = JSON.stringify(body);

  const runXhr = (authToken: string | null): Promise<void> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      activeSseXhr = xhr;
      let buffer = '';
      let lastIndex = 0;
      let streamError: ApiError | null = null;
      const timer = setTimeout(() => {
        xhr.abort();
        reject(new ApiError('流式请求超时', 408));
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        if (activeSseXhr === xhr) {
          activeSseXhr = null;
        }
      };

      const flushIncoming = () => {
        const chunk = xhr.responseText.slice(lastIndex);
        lastIndex = xhr.responseText.length;
        if (!chunk) return;
        buffer += chunk;
        buffer = parseSseChunk(buffer, (event, data) => {
          if (event === 'error') {
            const errPayload = data as { message?: string; code?: string };
            streamError = new ApiError(errPayload.message ?? '流式请求失败', 500, errPayload.code);
            return;
          }
          onEvent(event, data);
        });
      };

      xhr.onprogress = flushIncoming;
      xhr.onload = () => {
        cleanup();
        flushIncoming();
        if (buffer.trim()) {
          parseSseChunk(`${buffer}\n\n`, onEvent);
        }
        if (xhr.status === 401) {
          reject(new ApiError('未授权', 401));
          return;
        }
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new ApiError(`HTTP ${xhr.status}`, xhr.status));
          return;
        }
        if (streamError) {
          reject(streamError);
          return;
        }
        resolve();
      };
      xhr.onerror = () => {
        cleanup();
        reject(new ApiError('网络错误', 0));
      };
      xhr.onabort = () => {
        cleanup();
        if (sseAbortRequested) {
          sseAbortRequested = false;
          reject(new ApiError('流式请求已取消', 0, 'STREAM_ABORTED'));
          return;
        }
        reject(new ApiError('流式请求已取消', 0));
      };

      xhr.open('POST', url);
      xhr.setRequestHeader('Accept', 'text/event-stream');
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Cache-Control', 'no-cache');
      if (authToken) {
        xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
      }
      xhr.send(payload);
    });

  let token = getAccessToken();
  try {
    await runXhr(token);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      const ok = await ensureRefreshed();
      if (ok) {
        token = getAccessToken();
        await runXhr(token);
        return;
      }
    }
    throw err;
  }
}
