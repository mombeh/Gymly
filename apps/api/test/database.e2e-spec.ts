import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../src/generated/prisma/client';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const devDatabaseUrl = process.env.DATABASE_URL;

if (testDatabaseUrl === undefined || testDatabaseUrl.trim() === '') {
  throw new Error(
    'TEST_DATABASE_URL is not set. These tests TRUNCATE the users and members tables, so they must point at a dedicated test database. Copy apps/api/.env.example to apps/api/.env.',
  );
}

if (devDatabaseUrl !== undefined && devDatabaseUrl === testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL must not be the same as DATABASE_URL. These tests delete all rows.',
  );
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl }) });

const validUser = {
  firstName: 'Ada',
  lastName: 'Otieno',
  email: 'ada.otieno@gymly.test',
  // Stands in for a bcrypt/argon2 digest. The database stores it verbatim and
  // never receives a plaintext password.
  passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJ',
};

const validMember = {
  memberCode: 'GYM-000001',
  firstName: 'Grace',
  lastName: 'Wanjiku',
  phone: '+254712345678',
};

async function expectRejected(action: Promise<unknown>): Promise<Error> {
  try {
    await action;
  } catch (error) {
    return error as Error;
  }

  throw new Error('Expected the write to be rejected, but it succeeded.');
}

function expectUniqueViolation(error: Error): void {
  expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  expect((error as Prisma.PrismaClientKnownRequestError).code).toBe('P2002');
}

beforeEach(async () => {
  await prisma.member.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('database connectivity', () => {
  it('connects to the test database and can query it', async () => {
    await expect(prisma.user.count()).resolves.toBe(0);
  });
});

describe('User model', () => {
  it('applies defaults and preserves timestamps', async () => {
    const before = new Date();
    const user = await prisma.user.create({ data: validUser });
    const after = new Date();

    expect(user.role).toBe('MEMBER');
    expect(user.status).toBe('PENDING');
    expect(user.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect(user.createdAt.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
    expect(user.updatedAt.getTime()).toBeGreaterThanOrEqual(user.createdAt.getTime() - 1000);
  });

  it('stores the password hash verbatim and never the plaintext', async () => {
    const user = await prisma.user.create({ data: validUser });

    expect(user.passwordHash).toBe(validUser.passwordHash);
    expect(user.passwordHash).not.toBe('correct-horse-battery-staple');
    expect(Object.keys(user)).not.toContain('password');
  });

  it('rejects a duplicate email', async () => {
    await prisma.user.create({ data: validUser });

    const error = await expectRejected(
      prisma.user.create({ data: { ...validUser, firstName: 'Impostor' } }),
    );

    expectUniqueViolation(error);
  });

  it('treats email uniqueness as case-insensitive', async () => {
    await prisma.user.create({ data: validUser });

    const error = await expectRejected(
      prisma.user.create({ data: { ...validUser, email: 'ADA.OTIENO@GYMly.TEST' } }),
    );

    expectUniqueViolation(error);
  });

  it('rejects a blank email', async () => {
    // Postgres evaluates the email CHECKs in an unspecified order, so a value that
    // is both blank and whitespace-padded may trip either constraint. Both reject it.
    const error = await expectRejected(prisma.user.create({ data: { ...validUser, email: '   ' } }));

    expect(error.message).toMatch(/users_email_not_blank|users_email_no_surrounding_whitespace/);
  });

  it('rejects an email with surrounding whitespace', async () => {
    const error = await expectRejected(
      prisma.user.create({ data: { ...validUser, email: ' ada.otieno@gymly.test ' } }),
    );

    expect(error.message).toContain('users_email_no_surrounding_whitespace');
  });

  it('rejects a malformed email', async () => {
    const error = await expectRejected(
      prisma.user.create({ data: { ...validUser, email: 'not-an-email' } }),
    );

    expect(error.message).toContain('users_email_shape');
  });

  it('rejects an empty password hash', async () => {
    const error = await expectRejected(
      prisma.user.create({ data: { ...validUser, passwordHash: '  ' } }),
    );

    expect(error.message).toContain('users_password_hash_not_blank');
  });

  it('accepts every declared role and status', async () => {
    const roles = ['OWNER', 'ADMIN', 'STAFF', 'MEMBER'] as const;
    const statuses = ['PENDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED'] as const;

    for (const [index, role] of roles.entries()) {
      await expect(
        prisma.user.create({
          data: {
            ...validUser,
            email: `role-${role}@gymly.test`,
            role,
            status: statuses[index % statuses.length],
          },
        }),
      ).resolves.toMatchObject({ role, status: statuses[index % statuses.length] });
    }
  });

  it('refuses a role that is not in the enum', async () => {
    await expect(
      prisma.user.create({ data: { ...validUser, role: 'SUPERUSER' as never } }),
    ).rejects.toThrow();
  });

  it('refuses a status that is not in the enum', async () => {
    await expect(
      prisma.user.create({ data: { ...validUser, status: 'BANNED' as never } }),
    ).rejects.toThrow();
  });
});

describe('Member model', () => {
  it('creates a member with only the required fields', async () => {
    const member = await prisma.member.create({ data: validMember });

    expect(member.email).toBeNull();
    expect(member.dateOfBirth).toBeNull();
    expect(member.gender).toBeNull();
    expect(member.address).toBeNull();
    expect(member.emergencyContact).toBeNull();
    expect(member.status).toBe('PENDING');
  });

  it('stores every optional field when supplied', async () => {
    const member = await prisma.member.create({
      data: {
        ...validMember,
        email: 'grace.wanjiku@gymly.test',
        dateOfBirth: new Date('1995-06-15T00:00:00.000Z'),
        gender: 'FEMALE',
        address: '12 Kenyatta Avenue, Nairobi',
        emergencyContact: 'Peter Wanjiku, +254722000111',
        status: 'ACTIVE',
      },
    });

    expect(member.email).toBe('grace.wanjiku@gymly.test');
    expect(member.gender).toBe('FEMALE');
    expect(member.address).toBe('12 Kenyatta Avenue, Nairobi');
    expect(member.emergencyContact).toBe('Peter Wanjiku, +254722000111');
    expect(member.status).toBe('ACTIVE');
  });

  it('stores dateOfBirth as a date without a time component', async () => {
    const member = await prisma.member.create({
      data: { ...validMember, dateOfBirth: new Date('1995-06-15T00:00:00.000Z') },
    });

    expect(member.dateOfBirth?.toISOString().slice(0, 10)).toBe('1995-06-15');
  });

  it('rejects a duplicate member code', async () => {
    await prisma.member.create({ data: validMember });

    const error = await expectRejected(
      prisma.member.create({ data: { ...validMember, phone: '+254799999999' } }),
    );

    expectUniqueViolation(error);
  });

  it('treats member code uniqueness as case-insensitive', async () => {
    await prisma.member.create({ data: validMember });

    const error = await expectRejected(
      prisma.member.create({
        data: { ...validMember, memberCode: 'gym-000001', phone: '+254799999999' },
      }),
    );

    expectUniqueViolation(error);
  });

  it('rejects a differently formatted duplicate phone number', async () => {
    await prisma.member.create({ data: validMember });

    const error = await expectRejected(
      prisma.member.create({
        data: { ...validMember, memberCode: 'GYM-000002', phone: '+254 712 345 678' },
      }),
    );

    expectUniqueViolation(error);
  });

  it('allows two members to share the same email', async () => {
    await prisma.member.create({ data: { ...validMember, email: 'family@gymly.test' } });
    const second = await prisma.member.create({
      data: { ...validMember, memberCode: 'GYM-000002', phone: '+254799999999', email: 'family@gymly.test' },
    });

    expect(second.email).toBe('family@gymly.test');
  });

  it('rejects a phone number with too few digits', async () => {
    const error = await expectRejected(
      prisma.member.create({ data: { ...validMember, phone: '12345' } }),
    );

    expect(error.message).toContain('members_phone_digit_count');
  });

  it('rejects a phone number with too many digits', async () => {
    const error = await expectRejected(
      prisma.member.create({ data: { ...validMember, phone: '1234567890123456' } }),
    );

    expect(error.message).toContain('members_phone_digit_count');
  });

  it('rejects a date of birth in the future', async () => {
    const future = new Date();
    future.setUTCFullYear(future.getUTCFullYear() + 1);

    const error = await expectRejected(
      prisma.member.create({ data: { ...validMember, dateOfBirth: future } }),
    );

    expect(error.message).toContain('members_date_of_birth_range');
  });

  it('rejects an implausibly old date of birth', async () => {
    const error = await expectRejected(
      prisma.member.create({ data: { ...validMember, dateOfBirth: new Date('1899-12-31T00:00:00.000Z') } }),
    );

    expect(error.message).toContain('members_date_of_birth_range');
  });

  it('rejects a blank optional string, keeping NULL distinct from empty', async () => {
    const error = await expectRejected(
      prisma.member.create({ data: { ...validMember, address: '   ' } }),
    );

    expect(error.message).toContain('members_address_not_blank');
  });

  it('rejects a missing member code', async () => {
    await expect(
      prisma.member.create({ data: { ...validMember, memberCode: '   ' } }),
    ).rejects.toThrow();
  });

  it('refuses a status that is not in the enum', async () => {
    await expect(
      prisma.member.create({ data: { ...validMember, status: 'BANNED' as never } }),
    ).rejects.toThrow();
  });

  it('refuses a gender that is not in the enum', async () => {
    await expect(
      prisma.member.create({ data: { ...validMember, gender: 'UNKNOWN' as never } }),
    ).rejects.toThrow();
  });
});
