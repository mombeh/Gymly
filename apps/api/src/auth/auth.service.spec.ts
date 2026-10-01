import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { INVALID_CREDENTIALS_MESSAGE, toPublicUser } from './auth.types';
import type { PrismaService } from '../prisma/prisma.service';

const plaintext = 'correct-horse-battery-staple';

const storedUser = {
  id: 'e1f2a3b4-0000-4000-8000-000000000001',
  firstName: 'Ada',
  lastName: 'Otieno',
  email: 'ada@gymly.test',
  // Stands in for a real bcrypt digest.
  passwordHash: '$2b$12$j6Dv458mbQA7tX3xj7J7YehB/wWtIi6vYmJwxVJWFUQtEgroZND9q',
  role: 'OWNER' as const,
  status: 'ACTIVE' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createPrismaStub(user: unknown): {
  prisma: PrismaService;
  findFirst: jest.Mock;
  findUnique: jest.Mock;
} {
  const findFirst = jest.fn(() => Promise.resolve(user));
  const findUnique = jest.fn(() => Promise.resolve(user));

  return {
    prisma: { user: { findFirst, findUnique } } as unknown as PrismaService,
    findFirst,
    findUnique,
  };
}

function createService(user: unknown, passwordMatches: boolean) {
  const { prisma, findFirst, findUnique } = createPrismaStub(user);
  const verify = jest.fn(() => Promise.resolve(passwordMatches));
  const simulateVerification = jest.fn(() => Promise.resolve());
  const password = { hash: jest.fn(), verify, simulateVerification } as unknown as PasswordService;

  const issue = jest.fn(() => Promise.resolve('signed.jwt.token'));
  const tokens = {
    issue,
    verify: jest.fn(),
    expiresInSeconds: 900,
  } as unknown as TokenService;

  return {
    service: new AuthService(prisma, password, tokens),
    // Raw mocks are returned separately so assertions never reference a method
    // through a class-typed object.
    password: { verify, simulateVerification },
    tokens: { issue },
    findFirst,
    findUnique,
  };
}

describe('AuthService.login', () => {
  it('returns a token and the public identity for valid credentials', async () => {
    const { service, tokens } = createService(storedUser, true);

    const result = await service.login({ email: storedUser.email, password: plaintext });

    expect(result).toEqual({
      accessToken: 'signed.jwt.token',
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: storedUser.id,
        email: storedUser.email,
        firstName: storedUser.firstName,
        lastName: storedUser.lastName,
        role: 'OWNER',
        status: 'ACTIVE',
      },
    });
    expect(tokens.issue).toHaveBeenCalledWith({
      id: storedUser.id,
      email: storedUser.email,
      role: storedUser.role,
    });
  });

  it('never returns the password hash', async () => {
    const { service } = createService(storedUser, true);

    const result = await service.login({ email: storedUser.email, password: plaintext });

    expect(JSON.stringify(result)).not.toContain('passwordHash');
    expect(JSON.stringify(result)).not.toContain(storedUser.passwordHash);
    expect(Object.keys(result.user)).not.toContain('passwordHash');
  });

  it('rejects an incorrect password without saying the email was valid', async () => {
    const { service, tokens } = createService(storedUser, false);

    await expect(
      service.login({ email: storedUser.email, password: 'wrong' }),
    ).rejects.toThrow(new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE));
    expect(tokens.issue).not.toHaveBeenCalled();
  });

  it('rejects an unknown email with the same message as a wrong password', async () => {
    const { service: unknownUser } = createService(null, true);

    const unknownError = await unknownUser
      .login({ email: 'nobody@gymly.test', password: plaintext })
      .catch((error: unknown) => error);
    const wrongPasswordError = await createService(storedUser, false)
      .service.login({ email: storedUser.email, password: 'wrong' })
      .catch((error: unknown) => error);

    expect(unknownError).toBeInstanceOf(UnauthorizedException);
    expect(wrongPasswordError).toBeInstanceOf(UnauthorizedException);
    expect((unknownError as Error).message).toBe((wrongPasswordError as Error).message);
    expect((unknownError as Error).message).toBe(INVALID_CREDENTIALS_MESSAGE);
  });

  it('burns a hash comparison when the email is unknown, so timing is comparable', async () => {
    const { service, password } = createService(null, true);

    await expect(
      service.login({ email: 'nobody@gymly.test', password: plaintext }),
    ).rejects.toThrow();

    expect(password.simulateVerification).toHaveBeenCalledWith(plaintext);
  });

  it('looks the user up case-insensitively', async () => {
    const { service, findFirst } = createService(storedUser, true);

    await service.login({ email: '  ADA@Gymly.TEST  ', password: plaintext });

    expect(findFirst).toHaveBeenCalledWith({
      where: { email: { equals: 'ADA@Gymly.TEST', mode: 'insensitive' } },
    });
  });

  describe('account status', () => {
    it.each(['PENDING', 'INACTIVE', 'SUSPENDED'] as const)(
      'refuses a %s account even with the correct password',
      async (status) => {
        const { service, tokens } = createService({ ...storedUser, status }, true);

        await expect(
          service.login({ email: storedUser.email, password: plaintext }),
        ).rejects.toThrow(ForbiddenException);
        expect(tokens.issue).not.toHaveBeenCalled();
      },
    );
  });
});

describe('AuthService.currentUser', () => {
  const identity = { sub: storedUser.id, email: storedUser.email, role: storedUser.role };

  it('re-reads the user from the database and returns the public identity', async () => {
    const { service, findUnique } = createService(storedUser, true);

    const result = await service.currentUser(identity);

    expect(findUnique).toHaveBeenCalledWith({ where: { id: storedUser.id } });
    expect(result.user).toEqual(toPublicUser(storedUser));
    expect(Object.keys(result.user)).not.toContain('passwordHash');
  });

  it('rejects a token whose user no longer exists', async () => {
    const { service } = createService(null, true);

    await expect(service.currentUser(identity)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a user whose account is no longer active', async () => {
    const { service } = createService({ ...storedUser, status: 'SUSPENDED' }, true);

    await expect(service.currentUser(identity)).rejects.toThrow(ForbiddenException);
  });
});

describe('toPublicUser', () => {
  it('emits only the allowed fields even when handed a full row', () => {
    const projected = toPublicUser(storedUser);

    expect(Object.keys(projected).sort()).toEqual([
      'email',
      'firstName',
      'id',
      'lastName',
      'role',
      'status',
    ]);
  });
});
