import {
  createPrismaClient,
  DATABASE_URL_MISSING_MESSAGE,
  requireDatabaseUrl,
} from './prisma.service';

describe('prisma database url resolution', () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  afterEach(() => {
    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  describe('requireDatabaseUrl', () => {
    it('returns the configured connection string', () => {
      process.env.DATABASE_URL = 'postgresql://u:p@localhost:5432/gymly';

      expect(requireDatabaseUrl()).toBe('postgresql://u:p@localhost:5432/gymly');
    });

    it('throws a setup-oriented error when the variable is missing', () => {
      delete process.env.DATABASE_URL;

      expect(() => requireDatabaseUrl()).toThrow(DATABASE_URL_MISSING_MESSAGE);
    });

    it('treats a whitespace-only value as missing', () => {
      process.env.DATABASE_URL = '   ';

      expect(() => requireDatabaseUrl()).toThrow(DATABASE_URL_MISSING_MESSAGE);
    });
  });

  describe('createPrismaClient', () => {
    it('fails fast rather than connecting with an unusable value', () => {
      delete process.env.DATABASE_URL;

      expect(() => createPrismaClient()).toThrow(DATABASE_URL_MISSING_MESSAGE);
    });

    it('builds a client from an explicit connection string', () => {
      delete process.env.DATABASE_URL;

      const client = createPrismaClient('postgresql://u:p@localhost:5432/gymly');

      expect(client).toBeDefined();
    });
  });
});
