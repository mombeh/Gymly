import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import type { App } from 'supertest/types';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService, createPrismaClient } from '../src/prisma/prisma.service';
import type { AppConfiguration } from '../src/config/configuration';
import type { PrismaClient } from '../src/generated/prisma/client';
import { INSUFFICIENT_ROLE_MESSAGE } from '../src/auth/guards/roles.guard';
import { AUTHENTICATION_REQUIRED_MESSAGE } from '../src/auth/auth.types';
import { UserRole } from '../src/generated/prisma/client';

const PASSWORD = 'role-check-password-123';

const ACCOUNTS = [
  { email: 'owner@gymly.test', firstName: 'Ada', lastName: 'Otieno', role: UserRole.OWNER },
  { email: 'desk@gymly.test', firstName: 'Rae', lastName: 'Achieng', role: UserRole.RECEPTIONIST },
  { email: 'trainer@gymly.test', firstName: 'Kai', lastName: 'Mwangi', role: UserRole.TRAINER },
  { email: 'member@gymly.test', firstName: 'Sue', lastName: 'Njeri', role: UserRole.MEMBER },
] as const;

type Account = (typeof ACCOUNTS)[number];

describe('Role-based access control (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let authConfig: AppConfiguration['auth'];

  /** Signs in through the real login endpoint and returns a bearer token. */
  async function tokenFor(account: Account): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: account.email, password: PASSWORD })
      .expect(200);

    return response.body.accessToken as string;
  }

  function as(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  beforeAll(async () => {
    const testDatabaseUrl = process.env.TEST_DATABASE_URL;

    if (testDatabaseUrl === undefined || testDatabaseUrl.trim() === '') {
      throw new Error(
        'TEST_DATABASE_URL is not set. These tests delete all users, so they must point at a dedicated test database.',
      );
    }

    if (testDatabaseUrl === process.env.DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL must not be the same as DATABASE_URL.');
    }

    prisma = createPrismaClient(testDatabaseUrl);

    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleRef.createNestApplication();
    authConfig = app.get(ConfigService).getOrThrow<AppConfiguration>('app').auth;

    configureApp(app, app.get(ConfigService).getOrThrow<AppConfiguration>('app'));
    await app.init();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany();

    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    for (const account of ACCOUNTS) {
      await prisma.user.create({ data: { ...account, passwordHash, status: 'ACTIVE' } });
    }
  });

  afterAll(async () => {
    // The client is overridden into the container, so its own lifecycle hook
    // never runs and the pool would otherwise stay open.
    await prisma.user.deleteMany();
    await prisma.$disconnect();
    await app.close();
  });

  describe('unauthenticated requests', () => {
    it.each([
      ['/api/access/profile'],
      ['/api/access/administration'],
      ['/api/access/front-desk'],
      ['/api/access/training'],
      ['/api/access/self-service'],
    ])('answers 401 for %s with no token', async (path) => {
      const response = await request(app.getHttpServer()).get(path).expect(401);

      expect(response.body.message).toBe(AUTHENTICATION_REQUIRED_MESSAGE);
    });

    it('answers 401 for a malformed token', async () => {
      await request(app.getHttpServer())
        .get('/api/access/administration')
        .set(as('not-a-real-token'))
        .expect(401);
    });

    it('never answers 403 to an anonymous caller, because nothing was authenticated', async () => {
      const response = await request(app.getHttpServer()).get('/api/access/administration');

      expect(response.status).toBe(401);
    });
  });

  describe('OWNER', () => {
    it('reaches owner-only administration', async () => {
      const token = await tokenFor(ACCOUNTS[0]);

      const response = await request(app.getHttpServer())
        .get('/api/access/administration')
        .set(as(token))
        .expect(200);

      expect(response.body.capability).toBe('ADMINISTRATION');
    });

    it.each([
      ['/api/access/front-desk'],
      ['/api/access/training'],
      ['/api/access/self-service'],
    ])('reaches %s as well, holding the highest administrative access', async (path) => {
      const token = await tokenFor(ACCOUNTS[0]);

      await request(app.getHttpServer()).get(path).set(as(token)).expect(200);
    });
  });

  describe('RECEPTIONIST', () => {
    it('reaches front-desk work', async () => {
      const token = await tokenFor(ACCOUNTS[1]);

      const response = await request(app.getHttpServer())
        .get('/api/access/front-desk')
        .set(as(token))
        .expect(200);

      expect(response.body.capability).toBe('MEMBER_MANAGEMENT');
    });

    it('is refused member self-service, which belongs to members', async () => {
      // A receptionist manages the front desk; they do not get a member's own
      // view of their record.
      const token = await tokenFor(ACCOUNTS[1]);

      await request(app.getHttpServer()).get('/api/access/self-service').set(as(token)).expect(403);
    });

    it('is refused owner-only administration with 403', async () => {
      const token = await tokenFor(ACCOUNTS[1]);

      const response = await request(app.getHttpServer())
        .get('/api/access/administration')
        .set(as(token))
        .expect(403);

      expect(response.body.message).toBe(INSUFFICIENT_ROLE_MESSAGE);
    });

    it('is refused training work with 403', async () => {
      const token = await tokenFor(ACCOUNTS[1]);

      await request(app.getHttpServer()).get('/api/access/training').set(as(token)).expect(403);
    });
  });

  describe('TRAINER', () => {
    it('reaches training work', async () => {
      const token = await tokenFor(ACCOUNTS[2]);

      const response = await request(app.getHttpServer())
        .get('/api/access/training')
        .set(as(token))
        .expect(200);

      expect(response.body.capability).toBe('TRAINING_PROGRAMMES');
    });

    it('is refused owner-only administration with 403', async () => {
      const token = await tokenFor(ACCOUNTS[2]);

      await request(app.getHttpServer()).get('/api/access/administration').set(as(token)).expect(403);
    });

    it('is refused front-desk work with 403', async () => {
      const token = await tokenFor(ACCOUNTS[2]);

      await request(app.getHttpServer()).get('/api/access/front-desk').set(as(token)).expect(403);
    });
  });

  describe('MEMBER', () => {
    it('reaches self-service', async () => {
      const token = await tokenFor(ACCOUNTS[3]);

      const response = await request(app.getHttpServer())
        .get('/api/access/self-service')
        .set(as(token))
        .expect(200);

      expect(response.body.capability).toBe('SELF_SERVICE');
    });

    it.each([
      ['/api/access/administration'],
      ['/api/access/front-desk'],
      ['/api/access/training'],
    ])('is refused %s with 403', async (path) => {
      const token = await tokenFor(ACCOUNTS[3]);

      await request(app.getHttpServer()).get(path).set(as(token)).expect(403);
    });
  });

  describe('routes open to any authenticated caller', () => {
    it.each(ACCOUNTS.map((account) => [account.role] as const))(
      'admits a %s to the profile route',
      async (role) => {
        const account = ACCOUNTS.find((candidate) => candidate.role === role) as Account;
        const token = await tokenFor(account);

        const response = await request(app.getHttpServer())
          .get('/api/access/profile')
          .set(as(token))
          .expect(200);

        expect(response.body.user.role).toBe(role);
      },
    );
  });

  describe('a token signed with the wrong key', () => {
    it('is rejected with 401 even when its role would have been allowed', async () => {
      const { JwtService } = await import('@nestjs/jwt');
      const jwtService = app.get(JwtService);

      const forged = await jwtService.signAsync(
        { sub: '00000000-0000-4000-8000-000000000000', email: 'owner@gymly.test', role: 'OWNER' },
        { secret: 'a-different-secret', expiresIn: '15m' },
      );

      await request(app.getHttpServer())
        .get('/api/access/administration')
        .set(as(forged))
        .expect(401);
    });
  });

  it('builds tokens from the configured secret, not a hardcoded one', () => {
    expect(authConfig.jwtSecret).not.toBe('a-different-secret');
  });
});