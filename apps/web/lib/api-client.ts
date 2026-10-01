import { isApiErrorBody, type ApiErrorBody } from './api-types';

export const MISSING_API_URL_MESSAGE =
  'NEXT_PUBLIC_API_URL is not set. Copy apps/web/.env.example to apps/web/.env.local and set it.';

/**
 * Base URL of the Gymly API, including the API prefix, e.g.
 * "http://localhost:3000/api".
 *
 * Read from the environment only. Next.js inlines NEXT_PUBLIC_* variables at
 * build time, so the value is captured once per bundle rather than per request.
 */
export function getApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;

  if (configured === undefined || configured.trim() === '') {
    throw new Error(MISSING_API_URL_MESSAGE);
  }

  return configured.replace(/\/+$/, '');
}

/** A non-2xx response from the API, carrying the backend's error message. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: ApiErrorBody,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** True when the API rejected the request because the caller is not authenticated. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

/** A request that never reached the API (offline, DNS failure, CORS block). */
export class NetworkError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * Flattens the API's `message`, which is a string for single errors and an
 * array of strings for validation failures.
 */
function toMessage(body: ApiErrorBody): string {
  return Array.isArray(body.message) ? body.message.join(' ') : body.message;
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Bearer token for protected endpoints. */
  token?: string | null;
  signal?: AbortSignal;
}

/**
 * The single HTTP client for the Gymly frontend.
 *
 * Every backend call goes through here so that the base URL, the Authorization
 * header and the error contract are defined in exactly one place.
 */
export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token, signal } = options;
  const url = `${getApiBaseUrl()}${path}`;

  const headers: Record<string, string> = { Accept: 'application/json' };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response: Response;

  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    throw new NetworkError('Could not reach the Gymly server. Check your connection.', error);
  }

  const rawText = await response.text();
  let parsed: unknown = null;

  if (rawText !== '') {
    try {
      parsed = JSON.parse(rawText) as unknown;
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    const errorBody = isApiErrorBody(parsed) ? parsed : undefined;

    throw new ApiError(
      errorBody === undefined ? `Request failed with status ${response.status}` : toMessage(errorBody),
      response.status,
      errorBody,
    );
  }

  return parsed as T;
}