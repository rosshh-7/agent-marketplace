// Thin fetch wrapper shared by every resource module in src/api/. Handles
// JSON (de)serialization, bearer-token auth, and turning FastAPI's default
// error body ({detail: ...}) into a readable Error.

import { ApiErrorBody } from '../types';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function extractErrorMessage(body: ApiErrorBody | null, fallback: string): string {
  if (!body || !body.detail) return fallback;
  const { detail } = body;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    // FastAPI/pydantic validation error shape: [{msg, loc, ...}, ...]
    return detail.map((d) => (typeof d === 'object' && d && 'msg' in d ? (d as { msg: string }).msg : String(d))).join('; ');
  }
  return fallback;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  token?: string | null;
  json?: unknown;
  form?: FormData;
  signal?: AbortSignal;
}

/**
 * Performs a request against the backend and returns the parsed JSON body.
 * `path` should start with `/api/...` — the base URL (empty in dev, where
 * webpack-dev-server proxies /api to the backend) is prefixed automatically.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  let body: BodyInit | undefined;

  if (options.form) {
    body = options.form;
    // Do not set Content-Type manually — the browser sets the multipart
    // boundary automatically when body is a FormData instance.
  } else if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.json);
  }

  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const response = await fetch(`${__API_BASE_URL__}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body,
    signal: options.signal,
  });

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const parsed = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    throw new ApiError(
      extractErrorMessage(parsed as ApiErrorBody | null, `Request failed with status ${response.status}`),
      response.status,
    );
  }

  return parsed as T;
}

/** Builds an absolute URL for endpoints consumed outside of `fetch` (iframe src, download links, etc). */
export function apiUrl(path: string): string {
  return `${__API_BASE_URL__}${path}`;
}
