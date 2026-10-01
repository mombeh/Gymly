const TOKEN_KEY = 'gymly.auth.token';

/**
 * Persists the access token for the browser session.
 *
 * Storage is a deliberate trade-off. The API issues a bearer token with no
 * cookie, so the client must hold the credential itself. localStorage keeps
 * the session across reloads and lets the client route without a server round
 * trip, but it is readable by any script running on the origin, so an XSS
 * bug would expose the token. Moving to an httpOnly cookie would remove that
 * exposure but requires the API to set one, which is out of scope here.
 *
 * Passwords are never stored, only the token.
 */
function safeStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    // Blocked by browser privacy settings; the session then lasts one page load.
    return null;
  }
}

export function readToken(): string | null {
  try {
    return safeStorage()?.getItem(TOKEN_KEY) ?? null;
  } catch {
    return null;
  }
}

export function writeToken(token: string): void {
  try {
    safeStorage()?.setItem(TOKEN_KEY, token);
  } catch {
    // Quota or privacy failure: the in-memory session still works for this page load.
  }
}

export function clearToken(): void {
  try {
    safeStorage()?.removeItem(TOKEN_KEY);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}