import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService, createPrismaClient } from '../src/prisma/prisma.service';
import type { AppConfiguration } from '../src/config/configuration';
import type { PrismaClient } from '../src/generated/prisma/client';
import { INSUFFICIENT_ROLE_MESSAGE } from '../src/auth/guards/roles.guard';
import { AUTHENTICATION_REQUIRED_MESSAGE } from '../src/auth/auth.types';
import { UserRole } from '../src/generated/prisma/client';
import {
  DUPLICATE_PHONE_MESSAGE,
  MEMBER_NOT_FOUND_MESSAGE,
} from '../src/members/member.types';

const PASSWORD = 'members-e2e-password-123';

const ACCOUNTS = [
  { email: 'owner@gymly.test', firstName: 'Ada', lastName: 'Otieno', role: UserRole.OWNER },
  { email: 'desk@gymly.test', firstName: 'Rae', lastName: 'Achieng', role: UserRole.RECEPTIONIST },
  { email: 'trainer@gymly.test', firstName: 'Kai', lastName: 'Mwangi', role: UserRole.TRAINER },
  { email: 'member@gymly.test', firstName: 'Sue', lastName: 'Njeri', role: UserRole.MEMBER },
] as const;

type Account = (typeof ACCOUNTS)[number];

const MEMBERS_URL = '/api/members';

/** A valid create body; spread an override to vary one field per test. */
function newMember(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    firstName: 'Grace',
    lastName: 'Wanjiku',
    phone: '+254712345678',
    ...overrides,
  };
}

describe('Members (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let tokens: Record<UserRole, string>;

  const as = (role: UserRole) => ({ Authorization: `Bearer ${tokens[role]}` });

  /** Signs in through the real login endpoint, once per suite. */
  async function tokenFor(account: Account): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: account.email, password: PASSWORD })
      .expect(200);

    return response.body.accessToken as string;
  }

  beforeAll(async () => {
    const testDatabaseUrl = process.env.TEST_DATABASE_URL;

    if (testDatabaseUrl === undefined || testDatabaseUrl.trim() === '') {
      throw new Error(
        'TEST_DATABASE_URL is not set. These tests delete all members, so they must point at a dedicated test database.',
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

    configureApp(app, app.get(ConfigService).getOrThrow<AppConfiguration>('app'));
    await app.init();
  });

  beforeEach(async () => {
    await prisma.member.deleteMany();
    await prisma.user.deleteMany();

    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    for (const account of ACCOUNTS) {
      await prisma.user.create({ data: { ...account, passwordHash, status: 'ACTIVE' } });
    }

    tokens = {
      OWNER: await tokenFor(ACCOUNTS[0]),
      RECEPTIONIST: await tokenFor(ACCOUNTS[1]),
      TRAINER: await tokenFor(ACCOUNTS[2]),
      MEMBER: await tokenFor(ACCOUNTS[3]),
    };
  });

  afterAll(async () => {
    await prisma.member.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
    await app.close();
  });

  describe('POST /api/members', () => {
    it('registers a member with only the required fields', async () => {
      const response = await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('RECEPTIONIST'))
        .send(newMember())
        .expect(201);

      expect(response.body).toMatchObject({
        firstName: 'Grace',
        lastName: 'Wanjiku',
        phone: '+254712345678',
        status: 'PENDING',
        email: null,
        dateOfBirth: null,
        gender: null,
        address: null,
        emergencyContact: null,
      });
      expect(response.body.id).toEqual(expect.any(String));
    });

    it('stores every optional field that is supplied', async () => {
      const response = await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(
          newMember({
            email: 'grace.wanjiku@gymly.test',
            dateOfBirth: '1995-06-15',
            gender: 'FEMALE',
            address: '12 Kenyatta Avenue, Nairobi',
            emergencyContact: 'Peter Wanjiku, +254722000111',
          }),
        )
        .expect(201);

      expect(response.body).toMatchObject({
        email: 'grace.wanjiku@gymly.test',
        dateOfBirth: '1995-06-15',
        gender: 'FEMALE',
        address: '12 Kenyatta Avenue, Nairobi',
        emergencyContact: 'Peter Wanjiku, +254722000111',
      });
    });

    it('generates a member code the client never sees in the request', async () => {
      const response = await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember())
        .expect(201);

      expect(response.body.memberCode).toMatch(/^GYM-\d{6}$/);
    });

    it('issues a different code to every member', async () => {
      const first = await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember())
        .expect(201);

      const second = await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember({ phone: '+254722000111' }))
        .expect(201);

      expect(second.body.memberCode).not.toBe(first.body.memberCode);
    });

    it('never reissues a code after a member is deactivated', async () => {
      const first = await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember())
        .expect(201);

      await request(app.getHttpServer())
        .patch(`${MEMBERS_URL}/${first.body.id}/deactivate`)
        .set(as('OWNER'))
        .expect(200);

      const next = await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember({ phone: '+254722000111' }))
        .expect(201);

      // A code printed on a membership card must never name a different person.
      expect(next.body.memberCode).not.toBe(first.body.memberCode);
    });

    it('rejects a client-supplied memberCode', async () => {
      const response = await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember({ memberCode: 'GYM-000123' }))
        .expect(400);

      expect(JSON.stringify(response.body.message)).toContain('memberCode');
    });

    it('rejects a client-supplied status', async () => {
      await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember({ status: 'ACTIVE' }))
        .expect(400);
    });

    it('rejects a duplicate phone number', async () => {
      await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember())
        .expect(201);

      const response = await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember({ firstName: 'Impostor' }))
        .expect(409);

      expect(response.body.message).toBe(DUPLICATE_PHONE_MESSAGE);
    });

    it('treats a differently formatted phone number as the same person', async () => {
      // Formatting characters are stripped for comparison; a country-code prefix
      // is not, so "0712..." and "+2540712..." stay distinct numbers by design.
      await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember({ phone: '+254 712 345 678' }))
        .expect(201);

      const response = await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember({ phone: '+254(712)345-678' }))
        .expect(409);

      expect(response.body.message).toBe(DUPLICATE_PHONE_MESSAGE);
    });

    it('leaves exactly one member behind after a refused duplicate', async () => {
      await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember())
        .expect(201);

      await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember())
        .expect(409);

      await expect(prisma.member.count()).resolves.toBe(1);
    });

    it('allows two members to share an email', async () => {
      // Households share an address, so email is not an identity here.
      await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember({ email: 'family@gymly.test' }))
        .expect(201);

      await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember({ phone: '+254722000111', email: 'family@gymly.test' }))
        .expect(201);
    });

    it('stores a member with no membership, which is a valid state', async () => {
      const response = await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember())
        .expect(201);

      // Memberships are not implemented yet, and a member must be recordable
      // before one is sold.
      await expect(
        prisma.member.findUnique({ where: { id: response.body.id } }),
      ).resolves.toMatchObject({ status: 'PENDING' });
    });

    it.each([
      ['a missing firstName', { firstName: undefined }],
      ['a missing lastName', { lastName: undefined }],
      ['a missing phone', { phone: undefined }],
      ['a blank firstName', { firstName: '   ' }],
      ['a non-string firstName', { firstName: 42 }],
      ['a non-string phone', { phone: 712345678 }],
      ['a phone with too few digits', { phone: '12345' }],
      ['a phone with too many digits', { phone: '1234567890123456' }],
      ['an invalid email', { email: 'not-an-email' }],
      ['a future date of birth', { dateOfBirth: '2099-01-01' }],
      ['an unknown gender', { gender: 'ROBOT' }],
      ['a blank address', { address: '   ' }],
    ])('rejects %s', async (_label, override) => {
      await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember(override))
        .expect(400);
    });

    it('writes nothing when the body is invalid', async () => {
      await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember({ phone: 'nope' }))
        .expect(400);

      await expect(prisma.member.count()).resolves.toBe(0);
    });
  });

  describe('GET /api/members', () => {
    async function seed(...rows: Record<string, unknown>[]): Promise<void> {
      for (const row of rows) {
        await request(app.getHttpServer()).post(MEMBERS_URL).set(as('OWNER')).send(newMember(row));
      }
    }

    it('lists members with paging totals', async () => {
      await seed(
        { firstName: 'Grace', lastName: 'Wanjiku', phone: '+254712345678' },
        { firstName: 'Peter', lastName: 'Otieno', phone: '+254722000111' },
        { firstName: 'Amina', lastName: 'Abdi', phone: '+254733000222' },
      );

      const response = await request(app.getHttpServer())
        .get(MEMBERS_URL)
        .query({ page: 1, limit: 2 })
        .set(as('OWNER'))
        .expect(200);

      expect(response.body.total).toBe(3);
      expect(response.body.page).toBe(1);
      expect(response.body.limit).toBe(2);
      expect(response.body.pageCount).toBe(2);
      expect(response.body.members).toHaveLength(2);
    });

    it('orders by surname, then first name', async () => {
      await seed(
        { firstName: 'Zoe', lastName: 'Wanjiku', phone: '+254711000001' },
        { firstName: 'Amina', lastName: 'Wanjiku', phone: '+254711000002' },
        { firstName: 'Peter', lastName: 'Abdi', phone: '+254711000003' },
      );

      const response = await request(app.getHttpServer())
        .get(MEMBERS_URL)
        .set(as('OWNER'))
        .expect(200);

      expect(response.body.members.map((member: { firstName: string }) => member.firstName)).toEqual([
        'Peter',
        'Amina',
        'Zoe',
      ]);
    });

    it('finds a member by member code', async () => {
      const created = await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember())
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(MEMBERS_URL)
        .query({ q: created.body.memberCode })
        .set(as('OWNER'))
        .expect(200);

      expect(response.body.total).toBe(1);
      expect(response.body.members[0].id).toBe(created.body.id);
    });

    it.each([
      ['firstName', 'Grace'],
      ['lastName', 'Wanjiku'],
    ])('finds a member by %s, case-insensitively', async (field, term) => {
      await seed({ [field]: term, phone: '+254711000001' });

      const response = await request(app.getHttpServer())
        .get(MEMBERS_URL)
        .query({ q: term.toUpperCase() })
        .set(as('OWNER'))
        .expect(200);

      expect(response.body.total).toBe(1);
    });

    it('finds a member by part of their name', async () => {
      await seed(
        { firstName: 'Grace', lastName: 'Wanjiku', phone: '+254711000001' },
        { firstName: 'Peter', lastName: 'Otieno', phone: '+254711000002' },
      );

      const response = await request(app.getHttpServer())
        .get(MEMBERS_URL)
        .query({ q: 'anji' })
        .set(as('OWNER'))
        .expect(200);

      expect(response.body.total).toBe(1);
      expect(response.body.members[0].firstName).toBe('Grace');
    });

    it('finds a member by phone digits, whatever formatting was stored', async () => {
      await seed(
        { firstName: 'Grace', lastName: 'Wanjiku', phone: '+254 712 345 678' },
        { firstName: 'Peter', lastName: 'Otieno', phone: '+254722000111' },
      );

      const response = await request(app.getHttpServer())
        .get(MEMBERS_URL)
        .query({ q: '7123456' })
        .set(as('OWNER'))
        .expect(200);

      expect(response.body.total).toBe(1);
      expect(response.body.members[0].firstName).toBe('Grace');
    });

    it('keeps deactivated members in the list, because history refers to them', async () => {
      const created = await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember())
        .expect(201);

      await request(app.getHttpServer())
        .patch(`${MEMBERS_URL}/${created.body.id}/deactivate`)
        .set(as('OWNER'))
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(MEMBERS_URL)
        .set(as('OWNER'))
        .expect(200);

      expect(response.body.total).toBe(1);
    });

    it('hides deactivated members only when asked to', async () => {
      const created = await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember())
        .expect(201);

      await request(app.getHttpServer())
        .patch(`${MEMBERS_URL}/${created.body.id}/deactivate`)
        .set(as('OWNER'))
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(MEMBERS_URL)
        .query({ includeInactive: 'false' })
        .set(as('OWNER'))
        .expect(200);

      expect(response.body.total).toBe(0);
    });

    it('filters by status', async () => {
      const created = await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember())
        .expect(201);

      await prisma.member.update({
        where: { id: created.body.id },
        data: { status: 'ACTIVE' },
      });

      const response = await request(app.getHttpServer())
        .get(MEMBERS_URL)
        .query({ status: 'ACTIVE' })
        .set(as('OWNER'))
        .expect(200);

      expect(response.body.total).toBe(1);
    });

    it('returns an empty page rather than an error when nothing matches', async () => {
      const response = await request(app.getHttpServer())
        .get(MEMBERS_URL)
        .query({ q: 'nobody-by-that-name' })
        .set(as('OWNER'))
        .expect(200);

      expect(response.body).toMatchObject({ members: [], total: 0, pageCount: 0 });
    });

    it.each([
      ['an unknown status', { status: 'RETIRED' }],
      ['a limit beyond the cap', { limit: '1000' }],
      ['a non-numeric page', { page: 'first' }],
    ])('rejects %s', async (_label, query) => {
      await request(app.getHttpServer())
        .get(MEMBERS_URL)
        .query(query)
        .set(as('OWNER'))
        .expect(400);
    });
  });

  describe('GET /api/members/:id', () => {
    it('returns one member', async () => {
      const created = await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember())
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(`${MEMBERS_URL}/${created.body.id}`)
        .set(as('OWNER'))
        .expect(200);

      expect(response.body.id).toBe(created.body.id);
    });

    it('still returns a deactivated member, for historical purposes', async () => {
      const created = await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember())
        .expect(201);

      await request(app.getHttpServer())
        .patch(`${MEMBERS_URL}/${created.body.id}/deactivate`)
        .set(as('OWNER'))
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(`${MEMBERS_URL}/${created.body.id}`)
        .set(as('OWNER'))
        .expect(200);

      expect(response.body.status).toBe('INACTIVE');
    });

    it('answers 404 for an unknown id', async () => {
      const response = await request(app.getHttpServer())
        .get(`${MEMBERS_URL}/e1f2a3b4-0000-4000-8000-000000000009`)
        .set(as('OWNER'))
        .expect(404);

      expect(response.body.message).toBe(MEMBER_NOT_FOUND_MESSAGE);
    });

    it('answers 400 for an id that is not a uuid', async () => {
      await request(app.getHttpServer()).get(`${MEMBERS_URL}/not-a-uuid`).set(as('OWNER')).expect(400);
    });
  });

  describe('PATCH /api/members/:id', () => {
    it('changes the fields that were sent and leaves the others alone', async () => {
      const created = await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember({ address: '12 Kenyatta Avenue' }))
        .expect(201);

      const response = await request(app.getHttpServer())
        .patch(`${MEMBERS_URL}/${created.body.id}`)
        .set(as('OWNER'))
        .send({ firstName: 'Gracie', address: '14 Kenyatta Avenue' })
        .expect(200);

      expect(response.body).toMatchObject({
        firstName: 'Gracie',
        lastName: 'Wanjiku',
        phone: '+254712345678',
        address: '14 Kenyatta Avenue',
      });
    });

    it('lets an explicit null clear an optional field', async () => {
      const created = await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember({ address: '12 Kenyatta Avenue' }))
        .expect(201);

      const response = await request(app.getHttpServer())
        .patch(`${MEMBERS_URL}/${created.body.id}`)
        .set(as('OWNER'))
        .send({ address: null })
        .expect(200);

      expect(response.body.address).toBeNull();
    });

    it('keeps the member code and every timestamped field intact', async () => {
      const created = await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember())
        .expect(201);

      const response = await request(app.getHttpServer())
        .patch(`${MEMBERS_URL}/${created.body.id}`)
        .set(as('OWNER'))
        .send({ lastName: 'Wanjiru' })
        .expect(200);

      expect(response.body.memberCode).toBe(created.body.memberCode);
      expect(response.body.createdAt).toBe(created.body.createdAt);
    });

    it('accepts a new phone number that nobody else holds', async () => {
      const created = await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember())
        .expect(201);

      await request(app.getHttpServer())
        .patch(`${MEMBERS_URL}/${created.body.id}`)
        .set(as('OWNER'))
        .send({ phone: '+254 733 555 444' })
        .expect(200);
    });

    it('accepts saving a member with the phone they already hold', async () => {
      // A correction to a name must not be blocked by the member's own number.
      const created = await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember())
        .expect(201);

      await request(app.getHttpServer())
        .patch(`${MEMBERS_URL}/${created.body.id}`)
        .set(as('OWNER'))
        .send({ firstName: 'Gracie', phone: '+254712345678' })
        .expect(200);
    });

    it('refuses to take a phone number that belongs to another member', async () => {
      const first = await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember())
        .expect(201);

      await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember({ firstName: 'Peter', lastName: 'Otieno', phone: '+254722000111' }))
        .expect(201);

      const response = await request(app.getHttpServer())
        .patch(`${MEMBERS_URL}/${first.body.id}`)
        .set(as('OWNER'))
        .send({ phone: '+254722000111' })
        .expect(409);

      expect(response.body.message).toBe(DUPLICATE_PHONE_MESSAGE);
    });

    it('refuses a body with nothing to change', async () => {
      const created = await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember())
        .expect(201);

      await request(app.getHttpServer())
        .patch(`${MEMBERS_URL}/${created.body.id}`)
        .set(as('OWNER'))
        .send({})
        .expect(400);
    });

    it.each([
      ['a blank name', { firstName: '  ' }],
      ['an invalid phone', { phone: '12345' }],
      ['an invalid email', { email: 'nope' }],
      ['a future date of birth', { dateOfBirth: '2099-01-01' }],
      ['a memberCode', { memberCode: 'GYM-000900' }],
      ['a status', { status: 'INACTIVE' }],
      ['an unknown field', { favouriteColour: 'blue' }],
    ])('rejects an update containing %s', async (_label, body) => {
      const created = await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember())
        .expect(201);

      await request(app.getHttpServer())
        .patch(`${MEMBERS_URL}/${created.body.id}`)
        .set(as('OWNER'))
        .send(body)
        .expect(400);
    });

    it('answers 404 for an unknown id', async () => {
      await request(app.getHttpServer())
        .patch(`${MEMBERS_URL}/e1f2a3b4-0000-4000-8000-000000000009`)
        .set(as('OWNER'))
        .send({ firstName: 'Gracie' })
        .expect(404);
    });
  });

  describe('PATCH /api/members/:id/deactivate', () => {
    it('marks the member inactive without deleting anything', async () => {
      const created = await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember())
        .expect(201);

      const response = await request(app.getHttpServer())
        .patch(`${MEMBERS_URL}/${created.body.id}/deactivate`)
        .set(as('OWNER'))
        .expect(200);

      expect(response.body.status).toBe('INACTIVE');

      // The row is still there, with the same code and creation time.
      await expect(prisma.member.findUnique({ where: { id: created.body.id } })).resolves.toMatchObject(
        { memberCode: created.body.memberCode, status: 'INACTIVE' },
      );
    });

    it('keeps the member retrievable by id and in the list', async () => {
      const created = await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember())
        .expect(201);

      await request(app.getHttpServer())
        .patch(`${MEMBERS_URL}/${created.body.id}/deactivate`)
        .set(as('OWNER'))
        .expect(200);

      await request(app.getHttpServer())
        .get(`${MEMBERS_URL}/${created.body.id}`)
        .set(as('OWNER'))
        .expect(200);

      const list = await request(app.getHttpServer())
        .get(MEMBERS_URL)
        .query({ q: created.body.memberCode })
        .set(as('OWNER'))
        .expect(200);

      expect(list.body.total).toBe(1);
    });

    it('preserves the identifying details, which history points at', async () => {
      const created = await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember({ email: 'grace.wanjiku@gymly.test', dateOfBirth: '1995-06-15' }))
        .expect(201);

      const response = await request(app.getHttpServer())
        .patch(`${MEMBERS_URL}/${created.body.id}/deactivate`)
        .set(as('OWNER'))
        .expect(200);

      expect(response.body).toMatchObject({
        memberCode: created.body.memberCode,
        firstName: 'Grace',
        lastName: 'Wanjiku',
        phone: '+254712345678',
        email: 'grace.wanjiku@gymly.test',
        dateOfBirth: '1995-06-15',
      });
    });

    it('is idempotent, so a retried request is not an error', async () => {
      const created = await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember())
        .expect(201);

      await request(app.getHttpServer())
        .patch(`${MEMBERS_URL}/${created.body.id}/deactivate`)
        .set(as('OWNER'))
        .expect(200);

      await request(app.getHttpServer())
        .patch(`${MEMBERS_URL}/${created.body.id}/deactivate`)
        .set(as('OWNER'))
        .expect(200);
    });

    it('answers 404 for an unknown id', async () => {
      const response = await request(app.getHttpServer())
        .patch(`${MEMBERS_URL}/e1f2a3b4-0000-4000-8000-000000000009/deactivate`)
        .set(as('OWNER'))
        .expect(404);

      expect(response.body.message).toBe(MEMBER_NOT_FOUND_MESSAGE);
    });

    it('answers 400 for an id that is not a uuid', async () => {
      await request(app.getHttpServer())
        .patch(`${MEMBERS_URL}/not-a-uuid/deactivate`)
        .set(as('OWNER'))
        .expect(400);
    });

    it('exposes no way to delete a member', async () => {
      await request(app.getHttpServer())
        .delete(`${MEMBERS_URL}/e1f2a3b4-0000-4000-8000-000000000009`)
        .set(as('OWNER'))
        .expect(404);
    });
  });

  describe('authorization', () => {
    it.each([
      ['post', MEMBERS_URL],
      ['get', MEMBERS_URL],
      ['get', `${MEMBERS_URL}/e1f2a3b4-0000-4000-8000-000000000009`],
      ['patch', `${MEMBERS_URL}/e1f2a3b4-0000-4000-8000-000000000009`],
      ['patch', `${MEMBERS_URL}/e1f2a3b4-0000-4000-8000-000000000009/deactivate`],
    ] as const)('answers 401 for an anonymous %s %s', async (method, path) => {
      const response = await request(app.getHttpServer())[method](path).send({}).expect(401);

      expect(response.body.message).toBe(AUTHENTICATION_REQUIRED_MESSAGE);
    });

    it.each([
      ['TRAINER', 'training programmes, not the member list'],
      ['MEMBER', 'member self-service, not staff member management'],
    ] as const)('answers 403 for a %s reaching the members module', async (role, _why) => {
      const created = await request(app.getHttpServer())
        .post(MEMBERS_URL)
        .set(as('OWNER'))
        .send(newMember())
        .expect(201);

      await request(app.getHttpServer()).get(MEMBERS_URL).set(as(role)).expect(403);
      await request(app.getHttpServer()).post(MEMBERS_URL).set(as(role)).send(newMember()).expect(403);
      await request(app.getHttpServer())
        .get(`${MEMBERS_URL}/${created.body.id}`)
        .set(as(role))
        .expect(403);
      await request(app.getHttpServer())
        .patch(`${MEMBERS_URL}/${created.body.id}`)
        .set(as(role))
        .send({ firstName: 'Nope' })
        .expect(403);
      await request(app.getHttpServer())
        .patch(`${MEMBERS_URL}/${created.body.id}/deactivate`)
        .set(as(role))
        .expect(403);
    });

    it.each(['TRAINER', 'MEMBER'] as const)(
      'reports the refusal as insufficient permission for a %s',
      async (role) => {
        const response = await request(app.getHttpServer()).get(MEMBERS_URL).set(as(role)).expect(403);

        expect(response.body.message).toBe(INSUFFICIENT_ROLE_MESSAGE);
      },
    );

    it('refuses a trainer without listing anyone, pending trainer assignment', async () => {
      const response = await request(app.getHttpServer())
        .get(MEMBERS_URL)
        .set(as('TRAINER'))
        .expect(403);

      // A trainer may only reach members assigned to them. That is a
      // resource-level rule needing the trainer-assignment module, so the whole
      // list is refused rather than guessed at.
      expect(response.body.members).toBeUndefined();
    });

    it.each(['OWNER', 'RECEPTIONIST'] as const)('lets a %s manage members', async (role) => {
      await request(app.getHttpServer()).post(MEMBERS_URL).set(as(role)).send(newMember()).expect(201);
      await request(app.getHttpServer()).get(MEMBERS_URL).set(as(role)).expect(200);
    });

    it('rejects a token signed with the wrong key, whatever role it claims', async () => {
      const { JwtService } = await import('@nestjs/jwt');
      const jwtService = app.get(JwtService);

      const forged = await jwtService.signAsync(
        { sub: '00000000-0000-4000-8000-000000000000', email: 'owner@gymly.test', role: 'OWNER' },
        { secret: 'a-different-secret', expiresIn: '15m' },
      );

      await request(app.getHttpServer())
        .get(MEMBERS_URL)
        .set({ Authorization: `Bearer ${forged}` })
        .expect(401);
    });

    it('does not leak member data to an unauthenticated caller', async () => {
      await request(app.getHttpServer()).post(MEMBERS_URL).set(as('OWNER')).send(newMember()).expect(201);

      const response = await request(app.getHttpServer()).get(MEMBERS_URL).expect(401);

      expect(JSON.stringify(response.body)).not.toContain('Grace');
    });
  });
});