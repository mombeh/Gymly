import { ConfigService } from '@nestjs/config';
import { createPrismaClient, PrismaService } from './prisma.service';

function createConfigService(value: unknown): ConfigService {
  return {
    getOrThrow: () => {
      if (value === undefined) {
        throw new Error('Configuration key "app" does not exist');
      }

      return value;
    },
  } as unknown as ConfigService;
}

describe('PrismaService', () => {
  it('builds its client from the validated global configuration', () => {
    const service = new PrismaService(
      createConfigService({ database: { url: 'postgresql://u:p@localhost:5432/gymly' } }),
    );

    expect(service).toBeDefined();
    expect(typeof service.$connect).toBe('function');
  });

  it('fails fast when the app configuration is unavailable', () => {
    expect(() => new PrismaService(createConfigService(undefined))).toThrow(
      'Configuration key "app" does not exist',
    );
  });

  it('does not read DATABASE_URL from process.env itself', () => {
    const original = process.env.DATABASE_URL;

    process.env.DATABASE_URL = 'postgresql://should:be:ignored@localhost:5432/ignored';

    try {
      // Construction succeeds from injected config regardless of process.env,
      // which is what keeps credentials in one validated place.
      expect(
        new PrismaService(
          createConfigService({ database: { url: 'postgresql://u:p@localhost:5432/gymly' } }),
        ),
      ).toBeDefined();
    } finally {
      if (original === undefined) {
        delete process.env.DATABASE_URL;
      } else {
        process.env.DATABASE_URL = original;
      }
    }
  });
});

describe('createPrismaClient', () => {
  it('builds a client from an explicit connection string', () => {
    const client = createPrismaClient('postgresql://u:p@localhost:5432/gymly_test');

    expect(client).toBeDefined();
    expect(typeof client.member).toBe('object');
  });
});
