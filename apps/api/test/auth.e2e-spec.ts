import { Test, type TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { createPrismaClient } from '../src/prisma/prisma.service';
import { PrismaService } from '../src/prisma/prisma.service';
import type { AppConfiguration } from '../src/config/configuration';
import type { PrismaClient } from '../src/generated/prisma/client';

const OWNER_PASSWORD = 'owner-password-123';
const TRAINER_PASSWORD = 'trainer-password-123';

const OWNER = { email: 'owner@gymly.test', firstName: 'Ada', lastName: 'Otieno', role: 'OWNER' as const };
const TRAINER = { email: 'trainer@gymly.test', firstName: 'Kai', lastName: 'Mwangi', role: 'TRAINER' as const };
const SUSPENDED = { email: 'suspended@gymly.test', firstName: 'Sue', lastName: 'Njeri', role: 'MEMBER' as const };

describe('Authentication (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let authConfig: AppConfiguration['auth'];

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

    await prisma.user.create({
      data: { ...OWNER, passwordHash: await bcrypt.hash(OWNER_PASSWORD, 10), status: 'ACTIVE' },
    });
    await prisma.user.create({
      data: { ...TRAINER, passwordHash: await bcrypt.hash(TRAINER_PASSWORD, 10), status: 'ACTIVE' },
    });
    await prisma.user.create({
      data: { ...SUSPENDED, passwordHash: await bcrypt.hash('unused-password-123', 10), status: 'SUSPENDED' },
    });
  });

  afterAll(async () => {
    await prisma.user.deleteMany();
    await prisma.$disconnect();
    await app.close();
  });

  describe('POST /api/auth/login', () => {
    it('issues a token and identity for valid credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: OWNER.email, password: OWNER_PASSWORD })
        .expect(200);

      expect(response.body).toMatchObject({
        accessToken: expect.any(String),
        tokenType: 'Bearer',
        expiresIn: 900,
        user: {
          id: expect.any(String),
          email: OWNER.email,
          firstName: OWNER.firstName,
          lastName: OWNER.lastName,
          role: 'OWNER',
          status: 'ACTIVE',
        },
      });
    });

    it('never returns the password hash', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: OWNER.email, password: OWNER_PASSWORD })
        .expect(200);

      expect(response.body.user).not.toHaveProperty('passwordHash');
      expect(JSON.stringify(response.body)).not.toMatch(/\$2[aby]\$/);
    });

    it('returns a token that carries the role as a claim', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: TRAINER.email, password: TRAINER_PASSWORD })
        .expect(200);

      const claims = app
        .get(JwtService)
        .verify<{ sub: string; role: string; email: string }>(response.body.accessToken);

      expect(claims.role).toBe('TRAINER');
      expect(claims.email).toBe(TRAINER.email);
      expect(claims.sub).toEqual(expect.any(String));
    });

    it('matches the email case-insensitively', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: OWNER.email.toUpperCase(), password: OWNER_PASSWORD })
        .expect(200);
    });

    it('rejects an invalid password with 401', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: OWNER.email, password: 'not-the-password' })
        .expect(401);

      expect(response.body.message).toBe('Invalid email or password');
      expect(response.body).not.toHaveProperty('accessToken');
    });

    it('rejects an unknown email with 401 and the identical message', async () => {
      const unknown = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nobody@gymly.test', password: OWNER_PASSWORD })
        .expect(401);

      const wrongPassword = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: OWNER.email, password: 'not-the-password' })
        .expect(401);

      // Identical status and message, so a caller cannot tell the two apart.
      // The timestamp is the only permitted difference.
      const { timestamp: _unknownAt, ...unknownBody } = unknown.body as Record<string, unknown>;
      const { timestamp: _wrongAt, ...wrongBody } = wrongPassword.body as Record<string, unknown>;

      expect(unknownBody).toEqual(wrongBody);
      expect(unknownBody['message']).toBe('Invalid email or password');
    });

    it('rejects a suspended account with 403', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: SUSPENDED.email, password: 'unused-password-123' })
        .expect(403);

      expect(response.body).not.toHaveProperty('accessToken');
    });

    describe('input validation', () => {
      it('rejects a missing password', async () => {
        const response = await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({ email: OWNER.email })
          .expect(400);

        expect(JSON.stringify(response.body.message)).toMatch(/password/i);
      });

      it('rejects a malformed email', async () => {
        await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({ email: 'not-an-email', password: OWNER_PASSWORD })
          .expect(400);
      });

      it('rejects a completely empty body', async () => {
        await request(app.getHttpServer()).post('/api/auth/login').send({}).expect(400);
      });

      it('rejects unknown properties rather than ignoring them', async () => {
        await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({ email: OWNER.email, password: OWNER_PASSWORD, isOwner: true })
          .expect(400);
      });

      it('rejects a non-string password', async () => {
        await request(app.getHttpServer())
          .post('/api/auth/login')
          .send({ email: OWNER.email, password: { $ne: null } })
          .expect(400);
      });
    });
  });

  describe('GET /api/auth/me', () => {
    async function login(): Promise<string> {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: OWNER.email, password: OWNER_PASSWORD })
        .expect(200);

      return response.body.accessToken as string;
    }

    it('returns the identity for a valid token', async () => {
      const accessToken = await login();

      const response = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.user).toEqual({
        id: expect.any(String),
        email: OWNER.email,
        firstName: OWNER.firstName,
        lastName: OWNER.lastName,
        role: 'OWNER',
        status: 'ACTIVE',
      });
    });

    it('never returns the password hash', async () => {
      const accessToken = await login();

      const response = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.user).not.toHaveProperty('passwordHash');
      expect(JSON.stringify(response.body)).not.toMatch(/\$2[aby]\$/);
    });

    it('rejects a request with no Authorization header', async () => {
      await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    });

    it('rejects a non-Bearer scheme', async () => {
      const accessToken = await login();

      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Basic ${accessToken}`)
        .expect(401);
    });

    it('rejects a garbage token', async () => {
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', 'Bearer not.a.real.token')
        .expect(401);
    });

    it('rejects a token signed with a different secret', async () => {
      const foreign = new JwtService({ secret: 'a-different-signing-key-of-32-chars' });
      const token = await foreign.signAsync({ sub: 'any-id', email: OWNER.email, role: 'OWNER' });

      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });

    it('rejects an expired token', async () => {
      const expiring = new JwtService({
        secret: authConfig.jwtSecret,
        signOptions: { algorithm: 'HS256', expiresIn: '-1s' },
      });
      const token = await expiring.signAsync({ sub: 'any-id', email: OWNER.email, role: 'OWNER' });

      const response = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);

      expect(response.body.message).toBe('Invalid email or password');
    });

    it('rejects a valid token once the account is suspended', async () => {
      const accessToken = await login();

      await prisma.user.update({
        where: { email: OWNER.email },
        data: { status: 'SUSPENDED' },
      });

      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
    });

    it('rejects a valid token once the account is deleted', async () => {
      const accessToken = await login();

      await prisma.user.delete({ where: { email: OWNER.email } });

      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(401);
    });
  });
});
