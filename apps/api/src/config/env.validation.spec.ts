import { validateEnv } from './env.validation';

const validEnv = {
  DATABASE_URL: 'postgresql://gymly:secret@127.0.0.1:5432/gymly?schema=public',
};

describe('validateEnv', () => {
  it('applies documented defaults when only the required value is set', () => {
    expect(validateEnv({ ...validEnv })).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      API_PREFIX: 'api',
      DATABASE_URL: validEnv.DATABASE_URL,
      FRONTEND_URL: ['http://localhost:8000'],
      CORS_CREDENTIALS: true,
    });
  });

  describe('DATABASE_URL', () => {
    it('is required', () => {
      expect(() => validateEnv({})).toThrow('DATABASE_URL is required.');
    });

    it('must be a PostgreSQL connection string', () => {
      expect(() => validateEnv({ DATABASE_URL: 'mysql://localhost/gymly' })).toThrow(
        'DATABASE_URL must be a PostgreSQL connection string',
      );
    });

    it('accepts the postgres:// alias', () => {
      expect(
        validateEnv({ DATABASE_URL: 'postgres://u:p@localhost:5432/gymly' }).DATABASE_URL,
      ).toBe('postgres://u:p@localhost:5432/gymly');
    });

    it('never supplies a default, so credentials cannot be baked in', () => {
      expect(() => validateEnv({})).toThrow();
    });
  });

  describe('PORT', () => {
    it('is parsed as a number', () => {
      expect(validateEnv({ ...validEnv, PORT: '8080' }).PORT).toBe(8080);
    });

    it.each(['0', '70000', 'not-a-port', '3000.5'])('rejects %s', (value) => {
      expect(() => validateEnv({ ...validEnv, PORT: value })).toThrow('PORT must be an integer');
    });
  });

  describe('API_PREFIX', () => {
    it('strips surrounding slashes', () => {
      expect(validateEnv({ ...validEnv, API_PREFIX: '/v1/' }).API_PREFIX).toBe('v1');
    });

    it('treats an empty value as unset and falls back to the default', () => {
      expect(validateEnv({ ...validEnv, API_PREFIX: '' }).API_PREFIX).toBe('api');
    });

    it.each(['/', '   '])('rejects %p', (value) => {
      expect(() => validateEnv({ ...validEnv, API_PREFIX: value })).toThrow('API_PREFIX');
    });
  });

  describe('FRONTEND_URL', () => {
    it('parses a comma-separated list and removes duplicates', () => {
      expect(
        validateEnv({
          ...validEnv,
          FRONTEND_URL: 'http://localhost:8000, https://gymly.co,http://localhost:8000',
        }).FRONTEND_URL,
      ).toEqual(['http://localhost:8000', 'https://gymly.co']);
    });

    it('normalises a trailing slash away', () => {
      expect(validateEnv({ ...validEnv, FRONTEND_URL: 'https://gymly.co/' }).FRONTEND_URL).toEqual([
        'https://gymly.co',
      ]);
    });

    it('rejects an unparseable origin', () => {
      expect(() => validateEnv({ ...validEnv, FRONTEND_URL: 'http://' })).toThrow(
        'is not a valid origin',
      );
    });
  });

  describe('CORS_CREDENTIALS', () => {
    it.each([
      ['true', true],
      ['false', false],
    ])('parses %s', (value, expected) => {
      expect(validateEnv({ ...validEnv, CORS_CREDENTIALS: value }).CORS_CREDENTIALS).toBe(expected);
    });

    it('rejects any other value', () => {
      expect(() => validateEnv({ ...validEnv, CORS_CREDENTIALS: 'yes' })).toThrow(
        'CORS_CREDENTIALS must be "true" or "false"',
      );
    });
  });

  describe('NODE_ENV', () => {
    it.each(['development', 'test', 'production'])('accepts %s', (value) => {
      expect(validateEnv({ ...validEnv, NODE_ENV: value }).NODE_ENV).toBe(value);
    });

    it('rejects an unknown environment', () => {
      expect(() => validateEnv({ ...validEnv, NODE_ENV: 'staging' })).toThrow(
        'NODE_ENV must be one of',
      );
    });
  });

  it('reports every problem at once instead of only the first', () => {
    let message = '';

    try {
      validateEnv({ NODE_ENV: 'staging', PORT: 'nope' });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('DATABASE_URL is required.');
    expect(message).toContain('NODE_ENV must be one of');
    expect(message).toContain('PORT must be an integer');
  });
});
