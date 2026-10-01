export type NodeEnvironment = 'development' | 'test' | 'production';

export interface AppEnv {
  NODE_ENV: NodeEnvironment;
  PORT: number;
  API_PREFIX: string;
  DATABASE_URL: string;
  FRONTEND_URL: string[];
  CORS_CREDENTIALS: boolean;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
}

export const SETUP_HINT =
  'Copy apps/api/.env.example to apps/api/.env and set the missing values.';

const NODE_ENVIRONMENTS: readonly NodeEnvironment[] = ['development', 'test', 'production'];

const DEFAULTS = {
  NODE_ENV: 'development' as NodeEnvironment,
  PORT: 3000,
  API_PREFIX: 'api',
  FRONTEND_URL: 'http://localhost:8000',
  CORS_CREDENTIALS: true,
  JWT_EXPIRES_IN: '15m',
} as const;

const SUPPORTED_DATABASE_PROTOCOLS = ['postgresql://', 'postgres://'];

/** HS256 signing keys need enough entropy to resist brute force. */
export const MIN_JWT_SECRET_LENGTH = 32;

/** Collects every problem so one boot reports all of them, not just the first. */
class EnvValidationError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(
      `Invalid environment configuration:\n${problems.map((problem) => `  - ${problem}`).join('\n')}\n\n${SETUP_HINT}`,
    );
    this.name = 'EnvValidationError';
  }
}

/** Renders a value for an error message without falling back to "[object Object]". */
function describeValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (value === null || typeof value !== 'object') {
    return String(value);
  }

  return JSON.stringify(value) ?? 'an object';
}

function readString(
  raw: Record<string, unknown>,
  key: string,
  fallback: string,
  problems: string[],
): string {
  const value = raw[key];

  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value !== 'string') {
    problems.push(`${key} must be a string.`);
    return fallback;
  }

  return value;
}

function readPort(raw: Record<string, unknown>, problems: string[]): number {
  const value = raw['PORT'];

  if (value === undefined || value === null || value === '') {
    return DEFAULTS.PORT;
  }

  const port = typeof value === 'number' ? value : Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    problems.push(`PORT must be an integer between 1 and 65535, received "${describeValue(value)}".`);
    return DEFAULTS.PORT;
  }

  return port;
}

function readApiPrefix(raw: Record<string, unknown>, problems: string[]): string {
  const prefix = readString(raw, 'API_PREFIX', DEFAULTS.API_PREFIX, problems).replace(/^\/+|\/+$/g, '');

  if (prefix === '') {
    problems.push('API_PREFIX must not be empty.');
    return DEFAULTS.API_PREFIX;
  }

  if (/\s/.test(prefix)) {
    problems.push(`API_PREFIX must not contain whitespace, received "${prefix}".`);
    return DEFAULTS.API_PREFIX;
  }

  return prefix;
}

function readDatabaseUrl(raw: Record<string, unknown>, problems: string[]): string {
  const value = raw['DATABASE_URL'];

  if (value === undefined || value === null || value === '') {
    problems.push('DATABASE_URL is required.');
    return '';
  }

  if (typeof value !== 'string') {
    problems.push('DATABASE_URL must be a string.');
    return '';
  }

  const trimmed = value.trim();

  if (!SUPPORTED_DATABASE_PROTOCOLS.some((protocol) => trimmed.startsWith(protocol))) {
    problems.push('DATABASE_URL must be a PostgreSQL connection string (postgresql://...).');
  }

  return trimmed;
}

/** Accepts a comma-separated list and returns normalised origins without a trailing slash. */
function readFrontendUrls(raw: Record<string, unknown>, problems: string[]): string[] {
  const value = readString(raw, 'FRONTEND_URL', DEFAULTS.FRONTEND_URL, problems);
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');

  if (entries.length === 0) {
    problems.push('FRONTEND_URL must list at least one origin.');
    return [DEFAULTS.FRONTEND_URL];
  }

  const origins = entries.map((entry) => {
    const withProtocol = /^https?:\/\//.test(entry) ? entry : `https://${entry}`;

    try {
      const { protocol, origin } = new URL(withProtocol);

      if (protocol !== 'http:' && protocol !== 'https:') {
        problems.push(`FRONTEND_URL "${entry}" must use http or https.`);
        return entry;
      }

      return origin;
    } catch {
      problems.push(`FRONTEND_URL "${entry}" is not a valid origin.`);
      return entry;
    }
  });

  return [...new Set(origins)];
}

function readBoolean(
  raw: Record<string, unknown>,
  key: string,
  fallback: boolean,
  problems: string[],
): boolean {
  const value = raw[key];

  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (value === true || value === 'true') {
    return true;
  }

  if (value === false || value === 'false') {
    return false;
  }

  problems.push(`${key} must be "true" or "false", received "${describeValue(value)}".`);

  return fallback;
}

/**
 * Validates process environment against Gymly's runtime requirements.
 * Throws EnvValidationError listing every problem at once, so a misconfigured
 * deployment fails at boot with an actionable message instead of a cryptic
 * connection error later.
 */
export function validateEnv(raw: Record<string, unknown>): AppEnv {
  const problems: string[] = [];

  const nodeEnvRaw = readString(raw, 'NODE_ENV', DEFAULTS.NODE_ENV, problems);
  const nodeEnv = NODE_ENVIRONMENTS.find((value) => value === nodeEnvRaw);

  if (nodeEnv === undefined) {
    problems.push(`NODE_ENV must be one of ${NODE_ENVIRONMENTS.join(', ')}, received "${nodeEnvRaw}".`);
  }

  const env: AppEnv = {
    NODE_ENV: nodeEnv ?? DEFAULTS.NODE_ENV,
    PORT: readPort(raw, problems),
    API_PREFIX: readApiPrefix(raw, problems),
    DATABASE_URL: readDatabaseUrl(raw, problems),
    FRONTEND_URL: readFrontendUrls(raw, problems),
    CORS_CREDENTIALS: readBoolean(raw, 'CORS_CREDENTIALS', DEFAULTS.CORS_CREDENTIALS, problems),
  };

  if (problems.length > 0) {
    throw new EnvValidationError(problems);
  }

  return env;
}
