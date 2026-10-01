/** Default landing page for a signed-in user. */
export const DEFAULT_AUTHENTICATED_PATH = '/dashboard';

/**
 * Resolves the `next` query parameter to a path inside this app.
 *
 * Values that are not a single-slash-prefixed relative path are discarded, so a
 * crafted `?next=https://evil.example.com` cannot turn login into an open
 * redirect that ships a freshly-minted token to another origin.
 */
export function safeNextPath(nextPath: string | null): string {
  if (nextPath === null) return DEFAULT_AUTHENTICATED_PATH;

  // "//host" is protocol-relative and "https://host" is absolute; both must be
  // rejected. A backslash is treated as a slash by some browsers.
  if (!nextPath.startsWith('/')) return DEFAULT_AUTHENTICATED_PATH;
  if (nextPath.startsWith('//')) return DEFAULT_AUTHENTICATED_PATH;
  if (nextPath.startsWith('/\\')) return DEFAULT_AUTHENTICATED_PATH;
  if (nextPath.includes('\\')) return DEFAULT_AUTHENTICATED_PATH;

  return nextPath;
}