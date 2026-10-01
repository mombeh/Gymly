import { ConflictException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { EMAIL_TAKEN_MESSAGE } from './auth.types';
import type { RegisterDto } from './dto/register.dto';
import type { PrismaService } from '../prisma/prisma.service';

const plaintext = 'correct-horse-battery-staple';

const createdUser = {
  id: 'e1f2a3b4-0000-4000-8000-000000000009',
  firstName: 'Nkwenu',
  lastName: 'Inadine',
  email: 'nkwenuinadine31@gmail.com',
  passwordHash: '$2b$12$j6Dv458mbQA7tX3xj7J7YehB/wWtIi6vYmJwxVJWFUQtEgroZND9q',
  role: 'MEMBER' as const,
  status: 'ACTIVE' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const validDto: RegisterDto = {
  firstName: 'Nkwenu',
  lastName: 'Inadine',
  email: 'nkwenuinadine31@gmail.com',
  password: plaintext,
};

function uniqueConstraintError(): Error {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

/**
 * Builds a service whose user lookup returns `existing` and whose create
 * resolves to the created row. `createError` simulates a constraint failure.
 */
function createService(options: {
  existing?: unknown;
  created?: unknown;
  createError?: Error;
}) {
  const findFirst = jest.fn(() => Promise.resolve(options.existing ?? null));
  const create = jest.fn(() =>
    options.createError === undefined
      ? Promise.resolve(options.created ?? createdUser)
      : Promise.reject(options.createError),
  );

  const prisma = { user: { findFirst, create } } as unknown as PrismaService;

  const hash = jest.fn(() => Promise.resolve('$2b$12$hasheddigest'));
  const password = { hash, verify: jest.fn(), simulateVerification: jest.fn() } as unknown as PasswordService;

  const issue = jest.fn(() => Promise.resolve('signed.jwt.token'));
  const tokens = { issue, verify: jest.fn(), expiresInSeconds: 900 } as unknown as TokenService;

  return {
    service: new AuthService(prisma, password, tokens),
    findFirst,
    create,
    hash,
    tokens: { issue },
  };
}

describe('AuthService.register', () => {
  it('creates the account and returns a token so the caller is signed in', async () => {
    const { service, tokens } = createService({});

    const result = await service.register(validDto);

    expect(result).toEqual({
      accessToken: 'signed.jwt.token',
      tokenType: 'Bearer',
      expiresIn: 900,
      user: {
        id: createdUser.id,
        email: createdUser.email,
        firstName: createdUser.firstName,
        lastName: createdUser.lastName,
        role: 'MEMBER',
        status: 'ACTIVE',
      },
    });
    expect(tokens.issue).toHaveBeenCalledWith({
      id: createdUser.id,
      email: createdUser.email,
      role: 'MEMBER',
    });
  });

  it('creates the account as ACTIVE so it can actually log in', async () => {
    const { service, create } = createService({});

    await service.register(validDto);

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'ACTIVE', role: 'MEMBER' }),
    });
  });

  it('never returns or logs the password or its hash', async () => {
    const { service, hash } = createService({});

    const result = await service.register(validDto);
    const serialised = JSON.stringify(result);

    expect(hash).toHaveBeenCalledWith(plaintext);
    expect(serialised).not.toContain(plaintext);
    expect(serialised).not.toContain('passwordHash');
    expect(Object.keys(result.user)).not.toContain('passwordHash');
  });

  it('trims whitespace, which the users table requires', async () => {
    const { service, create } = createService({});

    await service.register({ ...validDto, email: '  spaced@gymly.test  ', firstName: ' Ada ' });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ email: 'spaced@gymly.test', firstName: 'Ada' }),
    });
  });

  it('checks for an existing address case-insensitively', async () => {
    const { service, findFirst } = createService({});

    await service.register({ ...validDto, email: 'NkwenuInadine31@Gmail.com' });

    expect(findFirst).toHaveBeenCalledWith({
      where: { email: { equals: 'NkwenuInadine31@Gmail.com', mode: 'insensitive' } },
    });
  });

  it('rejects an address that is already registered', async () => {
    const { service, create, tokens } = createService({ existing: createdUser });

    await expect(service.register(validDto)).rejects.toThrow(new ConflictException(EMAIL_TAKEN_MESSAGE));
    expect(create).not.toHaveBeenCalled();
    expect(tokens.issue).not.toHaveBeenCalled();
  });

  it('translates a unique-index violation into the same conflict', async () => {
    // Two concurrent registrations can both pass the pre-check; the index decides.
    const { service } = createService({ createError: uniqueConstraintError() });

    await expect(service.register(validDto)).rejects.toThrow(new ConflictException(EMAIL_TAKEN_MESSAGE));
  });

  it('does not disguise an unrelated database failure as a conflict', async () => {
    const { service } = createService({ createError: new Error('connection lost') });

    await expect(service.register(validDto)).rejects.toThrow('connection lost');
  });
});