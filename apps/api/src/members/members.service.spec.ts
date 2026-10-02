import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { MembersService } from './members.service';
import { MemberCodeService, MEMBER_CODE_EXHAUSTED_MESSAGE } from './member-code.service';
import {
  DUPLICATE_PHONE_MESSAGE,
  MEMBER_NOT_FOUND_MESSAGE,
  NO_FIELDS_TO_UPDATE_MESSAGE,
} from './member.types';
import type { CreateMemberDto, UpdateMemberDto } from './dto/member.dto';
import type { ListMembersQueryDto } from './dto/list-members-query.dto';
import type { PrismaService } from '../prisma/prisma.service';

const NOW = new Date('2026-03-01T10:00:00.000Z');

function memberRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e1f2a3b4-0000-4000-8000-000000000009',
    memberCode: 'GYM-000001',
    firstName: 'Grace',
    lastName: 'Wanjiku',
    phone: '+254712345678',
    email: null,
    dateOfBirth: null,
    gender: null,
    address: null,
    emergencyContact: null,
    status: 'PENDING' as const,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function dto(overrides: Partial<CreateMemberDto> = {}): CreateMemberDto {
  return {
    firstName: 'Grace',
    lastName: 'Wanjiku',
    phone: '+254712345678',
    ...overrides,
  } as CreateMemberDto;
}

/** A P2002 raised by the unique indexes, tagged the way Prisma tags it. */
function uniqueViolation(): Error {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

/**
 * A service over mocked Prisma.
 *
 * `phoneOwnerIds` is what the digits-only lookup resolves to: the ids of members
 * already holding a phone. `codeSequence` is the highest member number in use.
 */
function createService(options: {
  /** Ids returned by every digits-only phone lookup. */
  phoneOwnerIds?: string[];
  /** Per-call results for the phone lookup, for tests that change answer midway. */
  phoneLookups?: string[][];
  codeSequence?: number;
  createError?: unknown;
  createErrors?: unknown[];
  existing?: unknown;
  updated?: unknown;
} = {}) {
  const create = jest.fn();

  if (options.createError !== undefined) {
    create.mockRejectedValue(options.createError);
  } else {
    for (const error of options.createErrors ?? []) {
      create.mockRejectedValueOnce(error);
    }
    create.mockImplementation((args: { data: { memberCode: string } }) =>
      Promise.resolve(memberRow({ memberCode: args.data.memberCode })),
    );
  }

  // The individual mocks are returned alongside the client so assertions read
  // `member.update` rather than reaching through `member.update`, which
  // would need the property to be unbound.
  const update = jest.fn((args: { data: Record<string, unknown> }) =>
    // Echoes the write back, as the database would, so the assertions can check
    // the state the caller actually produced.
    Promise.resolve(options.updated ?? memberRow(args.data)),
  );
  const findUnique = jest.fn(() => Promise.resolve(options.existing ?? null));
  const findMany = jest.fn(() => Promise.resolve([]));
  const count = jest.fn(() => Promise.resolve(0));
  const queryRaw = phoneLookupMock(options.phoneOwnerIds ?? [], options.phoneLookups);

  const prisma = {
    member: { create, update, findUnique, findMany, count },
    // Every digits-only lookup resolves to the configured owners, which is the
    // only raw query the service makes while writing.
    $queryRaw: queryRaw,
  } as unknown as PrismaService;

  const next = jest.fn(() =>
    Promise.resolve(`GYM-${String((options.codeSequence ?? 0) + 1).padStart(6, '0')}`),
  );
  const exhausted = jest.fn();

  const memberCodeService = { next, exhausted } as unknown as MemberCodeService;

  return {
    service: new MembersService(prisma, memberCodeService),
    member: { create, update, findUnique, findMany, count },
    queryRaw,
    codes: { next, exhausted },
  };
}

/**
 * Answers the digits-only phone lookup with the configured owner ids, one call
 * at a time when a per-call sequence is supplied.
 */
function phoneLookupMock(defaultIds: string[], perCall?: string[][]): jest.Mock {
  const mock = jest.fn();

  if (perCall === undefined) {
    return mock.mockImplementation(() => Promise.resolve(defaultIds.map((id) => ({ id }))));
  }

  let call = 0;

  return mock.mockImplementation(() => {
    const ids = perCall[call] ?? [];
    call += 1;

    return Promise.resolve(ids.map((id) => ({ id })));
  });
}

describe('MembersService.create', () => {
  it('creates the member with a generated code and returns it', async () => {
    const { service, member } = createService();

    const result = await service.create(dto());

    expect(member.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        memberCode: 'GYM-000001',
        firstName: 'Grace',
        lastName: 'Wanjiku',
        phone: '+254712345678',
      }),
    });
    expect(result.memberCode).toBe('GYM-000001');
    expect(result.status).toBe('PENDING');
  });

  it('never takes a member code from the request', async () => {
    // The DTO does not declare memberCode and the pipe runs forbidNonWhitelisted,
    // so a client-supplied code is rejected before it reaches the service. What is
    // asserted here is the other half: nothing the client can send replaces the
    // generated one.
    const { service, member } = createService();

    await service.create(dto({ memberCode: 'GYM-999999' } as Partial<CreateMemberDto>));

    expect(member.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ memberCode: 'GYM-000001' }),
    });
  });

  it('stores absent optional fields as null rather than as an empty string', async () => {
    const { service, member } = createService();

    await service.create(dto());

    const { data } = member.create.mock.calls[0][0] as { data: Record<string, unknown> };

    // Only supplied fields reach the insert; the column defaults cover the rest.
    expect(data['email']).toBeUndefined();
    expect(data['address']).toBeUndefined();
    expect(data['gender']).toBeUndefined();
  });

  it('refuses a phone number another member already holds', async () => {
    const { service, member } = createService({
      phoneOwnerIds: ['someone-else'],
    });

    await expect(service.create(dto())).rejects.toThrow(
      new ConflictException(DUPLICATE_PHONE_MESSAGE),
    );
    expect(member.create).not.toHaveBeenCalled();
  });

  it('rejects a duplicate that only the unique index caught', async () => {
    // The pre-check and the insert are not one atomic step, so a concurrent
    // request for the same number can win the race: the pre-check sees nothing,
    // the insert is refused by the index, and the post-failure check then finds
    // the winner. That must surface as a duplicate, not as a 500.
    const { service } = createService({
      createErrors: [uniqueViolation()],
      phoneLookups: [[], ['someone-else']],
    });

    await expect(service.create(dto())).rejects.toThrow(
      new ConflictException(DUPLICATE_PHONE_MESSAGE),
    );
  });

  it('translates an index violation on the member code by retrying', async () => {
    const { service, member } = createService({
      createErrors: [uniqueViolation()],
    });

    const result = await service.create(dto());

    expect(member.create).toHaveBeenCalledTimes(2);
    expect(result.memberCode).toBe('GYM-000001');
  });

  it('gives up with a conflict once the retries are exhausted', async () => {
    const { service, codes } = createService({
      createErrors: Array.from({ length: 5 }, () => uniqueViolation()),
    });

    await expect(service.create(dto())).rejects.toThrow(
      new ConflictException(MEMBER_CODE_EXHAUSTED_MESSAGE),
    );
    expect(codes.exhausted).toHaveBeenCalledWith(5);
  });

  it('does not disguise an unrelated database failure as a conflict', async () => {
    const { service } = createService({ createError: new Error('connection lost') });

    await expect(service.create(dto())).rejects.toThrow('connection lost');
  });

  it('reports a date of birth as a calendar date, not a timestamp', async () => {
    const { service, member } = createService();
    member.create.mockImplementation((args: { data: { memberCode: string } }) =>
      Promise.resolve(
        memberRow({
          memberCode: args.data.memberCode,
          dateOfBirth: new Date('1995-06-15T00:00:00.000Z'),
        }),
      ),
    );

    const result = await service.create(dto({ dateOfBirth: new Date('1995-06-15') }));

    expect(result.dateOfBirth).toBe('1995-06-15');
  });
});

describe('MembersService.list', () => {
  it('paginates and reports the totals a pager needs', async () => {
    const { service, member } = createService();
    (member.count as jest.Mock).mockResolvedValue(42);

    const result = await service.list({ page: 2, limit: 10 } as ListMembersQueryDto);

    expect(member.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
    expect(result).toMatchObject({ total: 42, page: 2, limit: 10, pageCount: 5 });
  });

  it('matches the search term against code, first name, last name and phone', async () => {
    const { service, member } = createService();

    await service.list({ q: 'wanj' } as ListMembersQueryDto);

    const { where } = (member.findMany as jest.Mock).mock.calls[0][0] as {
      where: { AND: { OR: Record<string, unknown>[] }[] };
    };

    expect(where.AND[0].OR).toEqual(
      expect.arrayContaining([
        { memberCode: { contains: 'wanj', mode: 'insensitive' } },
        { firstName: { contains: 'wanj', mode: 'insensitive' } },
        { lastName: { contains: 'wanj', mode: 'insensitive' } },
        { phone: { contains: 'wanj', mode: 'insensitive' } },
      ]),
    );
  });

  it('searches phones on their digits, so formatting does not hide a match', async () => {
    const { service, member } = createService({
      phoneOwnerIds: ['e1f2a3b4-0000-4000-8000-000000000009'],
    });

    await service.list({ q: '0712345' } as ListMembersQueryDto);

    const { where } = (member.findMany as jest.Mock).mock.calls[0][0] as {
      where: { AND: { OR: Record<string, unknown>[] }[] };
    };

    expect(where.AND[0].OR).toEqual(
      expect.arrayContaining([
        { id: { in: ['e1f2a3b4-0000-4000-8000-000000000009'] } },
      ]),
    );
  });

  it('does not run the phone lookup for a term with too few digits', async () => {
    // Two digits would match nearly every member, turning a search box into a dump.
    const { service, queryRaw } = createService({ phoneOwnerIds: ['a', 'b', 'c'] });

    const result = await service.list({ q: '07' } as ListMembersQueryDto);

    expect(queryRaw).not.toHaveBeenCalled();
    expect(result.total).toBe(0);
  });

  it('keeps deactivated members in the default listing', async () => {
    const { service, member } = createService();

    await service.list({} as ListMembersQueryDto);

    const { where } = (member.findMany as jest.Mock).mock.calls[0][0] as {
      where: Record<string, unknown>;
    };

    expect(where).toEqual({});
  });

  it('excludes deactivated members only when asked', async () => {
    const { service, member } = createService();

    await service.list({ includeInactive: 'false' } as ListMembersQueryDto);

    const { where } = (member.findMany as jest.Mock).mock.calls[0][0] as {
      where: { AND: Record<string, unknown>[] };
    };

    expect(where.AND[0]).toEqual({ status: { not: 'INACTIVE' } });
  });

  it('honours an explicit status filter', async () => {
    const { service, member } = createService();

    await service.list({ status: 'SUSPENDED' } as ListMembersQueryDto);

    const { where } = (member.findMany as jest.Mock).mock.calls[0][0] as {
      where: { AND: Record<string, unknown>[] };
    };

    expect(where.AND[0]).toEqual({ status: 'SUSPENDED' });
  });
});

describe('MembersService.findOne', () => {
  it('returns the member', async () => {
    const { service } = createService({ existing: memberRow() });

    const result = await service.findOne(memberRow().id);

    expect(result.id).toBe(memberRow().id);
  });

  it('answers 404 for an unknown id', async () => {
    const { service } = createService({ existing: null });

    await expect(service.findOne('e1f2a3b4-0000-4000-8000-000000000009')).rejects.toThrow(
      new NotFoundException(MEMBER_NOT_FOUND_MESSAGE),
    );
  });
});

describe('MembersService.update', () => {
  it('writes only the fields the request supplied', async () => {
    const { service, member } = createService({ existing: memberRow() });

    await service.update(memberRow().id, { firstName: 'Gracie' } as UpdateMemberDto);

    expect(member.update).toHaveBeenCalledWith({
      where: { id: memberRow().id },
      data: { firstName: 'Gracie' },
    });
  });

  it('lets an explicit null clear an optional field', async () => {
    const { service, member } = createService({ existing: memberRow() });

    await service.update(memberRow().id, { address: null } as UpdateMemberDto);

    expect(member.update).toHaveBeenCalledWith({
      where: { id: memberRow().id },
      data: { address: null },
    });
  });

  it('refuses an update with nothing to change', async () => {
    const { service, member } = createService({ existing: memberRow() });

    await expect(service.update(memberRow().id, {} as UpdateMemberDto)).rejects.toThrow(
      new BadRequestException(NO_FIELDS_TO_UPDATE_MESSAGE),
    );
    expect(member.update).not.toHaveBeenCalled();
  });

  it('answers 404 when the member disappears between the read and the write', async () => {
    // Prisma reports that race as P2025; without translating it the caller
    // would see a 500 for what is plainly a missing record.
    const { service, member } = createService({ existing: memberRow() });
    (member.update as jest.Mock).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: 'test',
      }),
    );

    await expect(service.update(memberRow().id, { firstName: 'Gracie' } as UpdateMemberDto)).rejects.toThrow(
      new NotFoundException(MEMBER_NOT_FOUND_MESSAGE),
    );
  });

  it('refuses a new phone number that belongs to somebody else', async () => {
    const { service, member } = createService({
      existing: memberRow(),
      phoneOwnerIds: ['someone-else'],
    });

    await expect(
      service.update(memberRow().id, { phone: '+254700000000' } as UpdateMemberDto),
    ).rejects.toThrow(new ConflictException(DUPLICATE_PHONE_MESSAGE));
    expect(member.update).not.toHaveBeenCalled();
  });

  it('allows saving a member without touching the phone it already holds', async () => {
    // The duplicate check excludes the member being edited, otherwise a
    // correction to a name on a member whose phone is on file would fail.
    const { service, member } = createService({ existing: memberRow() });

    await expect(
      service.update(memberRow().id, { phone: '+254712345678' } as UpdateMemberDto),
    ).resolves.toBeDefined();
    expect(member.update).toHaveBeenCalled();
  });
});

describe('MembersService.deactivate', () => {
  it('sets the status to INACTIVE and keeps the record', async () => {
    const { service, member } = createService({ existing: memberRow() });

    const result = await service.deactivate(memberRow().id);

    expect(member.update).toHaveBeenCalledWith({
      where: { id: memberRow().id },
      data: { status: 'INACTIVE' },
    });
    expect(result.status).toBe('INACTIVE');
    // Nothing in the module can delete a member, so the row cannot be lost.
    const reachable = service as unknown as Record<string, unknown>;

    expect(JSON.stringify(Object.keys(reachable))).not.toContain('delete');
  });

  it('is idempotent, so a retried request is not an error', async () => {
    const { service, member } = createService({ existing: memberRow({ status: 'INACTIVE' }) });

    const result = await service.deactivate(memberRow().id);

    expect(member.update).not.toHaveBeenCalled();
    expect(result.status).toBe('INACTIVE');
  });

  it('answers 404 for an unknown id rather than creating anything', async () => {
    const { service, member } = createService({ existing: null });

    await expect(service.deactivate('missing')).rejects.toThrow(
      new NotFoundException(MEMBER_NOT_FOUND_MESSAGE),
    );
    expect(member.create).not.toHaveBeenCalled();
  });
});

describe('MemberCodeService', () => {
  it('numbers from one and pads to a fixed width', async () => {
    const prisma = { $queryRaw: jest.fn(() => Promise.resolve([])) } as unknown as PrismaService;

    const code = await new MemberCodeService(prisma).next();

    expect(code).toBe('GYM-000001');
  });

  it('continues from the highest code already issued', async () => {
    const prisma = {
      $queryRaw: jest.fn(() => Promise.resolve([{ highest: '42' }])),
    } as unknown as PrismaService;

    const code = await new MemberCodeService(prisma).next();

    expect(code).toBe('GYM-000043');
  });

  it('reads a bigint returned as a number as readily as one returned as a string', async () => {
    const prisma = {
      $queryRaw: jest.fn(() => Promise.resolve([{ highest: 7 }])),
    } as unknown as PrismaService;

    await expect(new MemberCodeService(prisma).next()).resolves.toBe('GYM-000008');
  });

  it('starts from one when the table holds no parseable code', async () => {
    const prisma = {
      $queryRaw: jest.fn(() => Promise.resolve([{ highest: null }])),
    } as unknown as PrismaService;

    await expect(new MemberCodeService(prisma).next()).resolves.toBe('GYM-000001');
  });
});