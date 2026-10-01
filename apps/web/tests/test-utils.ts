import { vi, type Mock } from 'vitest';

/** A fetch call captured by the mock, flattened for readable assertions. */
export interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
  /** Parsed request body, for convenience. */
  json(): unknown;
}

/** Minimal Response stand-in; only `ok`, `status` and `text` are used. */
export function jsonResponse(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  } as unknown as Response;
}

export interface FetchMockHandle {
  fetchMock: Mock;
  recordedCall: (index?: number) => RecordedCall;
}

/**
 * Replaces global fetch with a recorder. Callers assert on `recordedCall()`
 * instead of indexing `mock.calls`, which strict indexed access forbids.
 */
export function installFetchMock(): FetchMockHandle {
  const fetchMock = vi.fn();

  vi.stubGlobal('fetch', fetchMock);

  function recordedCall(index = 0): RecordedCall {
    const call = fetchMock.mock.calls[index] as [string, RequestInit] | undefined;

    if (call === undefined) {
      throw new Error(`No fetch call was recorded at index ${index}.`);
    }

    const [url, init = {}] = call;
    const body = init.body as string | undefined;

    return {
      url: String(url),
      method: init.method ?? 'GET',
      headers: (init.headers ?? {}) as Record<string, string>,
      body,
      json: () => JSON.parse(body ?? 'null'),
    };
  }

  return { fetchMock, recordedCall };
}

/** Routes each URL to a stubbed response; unmocked URLs fail loudly. */
export function stubApi(fetchMock: Mock, routes: Record<string, () => Promise<Response>>) {
  fetchMock.mockImplementation(async (url: string) => {
    const match = routes[url];

    if (match === undefined) {
      throw new Error(`Unstubbed request to ${url}`);
    }

    return match();
  });
}