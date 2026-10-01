import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, NetworkError, apiRequest, getApiBaseUrl } from '../lib/api-client';

function jsonResponse(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  } as unknown as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getApiBaseUrl', () => {
  const original = process.env.NEXT_PUBLIC_API_URL;

  afterEach(() => {
    process.env.NEXT_PUBLIC_API_URL = original;
  });

  it('reads the API URL from the environment rather than a hardcoded host', () => {
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3000/api';
    expect(getApiBaseUrl()).toBe('http://localhost:3000/api');
  });

  it('trims trailing slashes so paths are not doubled', () => {
    process.env.NEXT_PUBLIC_API_URL = 'http://localhost:3000/api//';
    expect(getApiBaseUrl()).toBe('http://localhost:3000/api');
  });

  it('fails loudly when the variable is missing instead of guessing a host', () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    expect(() => getApiBaseUrl()).toThrow(/NEXT_PUBLIC_API_URL/);
  });
});

describe('apiRequest', () => {
  it('sends JSON and parses the response', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { accessToken: 'abc' }));

    await expect(apiRequest('/auth/login', { method: 'POST', body: { email: 'a@b.c' } })).resolves.toEqual({
      accessToken: 'abc',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3000/api/auth/login');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ email: 'a@b.c' });
  });

  it('attaches the bearer token when one is supplied', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { user: {} }));

    await apiRequest('/auth/me', { token: 'token-123' });

    expect(fetchMock.mock.calls[0][1].headers['Authorization']).toBe('Bearer token-123');
  });

  it('omits the Authorization header when there is no token', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));

    await apiRequest('/auth/login', { method: 'POST' });

    expect(fetchMock.mock.calls[0][1].headers['Authorization']).toBeUndefined();
  });

  it('surfaces a single-message API error with its status', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, { statusCode: 401, error: 'Unauthorized', message: 'Invalid email or password' }),
    );

    await expect(apiRequest('/auth/login', { method: 'POST' })).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
      message: 'Invalid email or password',
      isUnauthorized: true,
    });
  });

  it('joins the message array returned by validation failures', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, { statusCode: 400, error: 'Bad Request', message: ['email must be an email', 'password must not be empty'] }),
    );

    const error = await apiRequest('/auth/login', { method: 'POST' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe('email must be an email password must not be empty');
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500));

    const error = await apiRequest('/auth/me', { token: 't' }).catch((e: unknown) => e);

    expect((error as ApiError).message).toBe('Request failed with status 500');
  });

  it('reports an unreachable server as a network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const error = await apiRequest('/auth/login', { method: 'POST' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(NetworkError);
    expect((error as NetworkError).message).toMatch(/could not reach the gymly server/i);
  });
});