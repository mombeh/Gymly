import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MemberStatus, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMemberDto, UpdateMemberDto } from './dto/member.dto';
import { DEFAULT_LIMIT, DEFAULT_PAGE, ListMembersQueryDto } from './dto/list-members-query.dto';
import { MEMBER_CODE_EXHAUSTED_MESSAGE, MemberCodeService } from './member-code.service';
import {
  DUPLICATE_PHONE_MESSAGE,
  MEMBER_NOT_FOUND_MESSAGE,
  NO_FIELDS_TO_UPDATE_MESSAGE,
  digitsOnly,
  toMemberResponse,
  type MemberListResponse,
  type MemberResponse,
} from './member.types';

/** Attempts at claiming a member number before giving up. */
const MAX_CODE_ATTEMPTS = 5;

/**
 * Shortest digit run treated as a phone search. Below this the digits-only lookup
 * matches nearly every member, which turns a search box into a table dump.
 */
const MIN_PHONE_SEARCH_DIGITS = 3;

/** Fields a create may write. Absent optional fields are stored as NULL. */
const CREATE_FIELDS = [
  'firstName',
  'lastName',
  'phone',
  'email',
  'dateOfBirth',
  'gender',
  'address',
  'emergencyContact',
] as const;

/** The same list for updates; every one of them is optional there. */
const UPDATE_FIELDS = CREATE_FIELDS;

/**
 * Owns the member lifecycle.
 *
 * Two invariants are worth stating up front because they shape most of the code
 * below:
 *
 *  1. A member record outlives its usefulness. Deactivation flips a status; it
 *     never deletes. Attendance and payment rows will refer to this table, so a
 *     deleted member would leave history pointing at nothing.
 *
 *  2. The member number belongs to the gym, not the member and not the caller.
 *     It is allocated here, and a number is never reissued once used.
 */
@Injectable()
export class MembersService {
  private readonly logger = new Logger(MembersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly memberCodeService: MemberCodeService,
  ) {}

  /**
   * Registers a member.
   *
   * A duplicate phone number is refused outright, because the same person cannot
   * hold two memberships and the digits-only unique index makes that certain. A
   * duplicate email or an identical name is only reported: households legitimately
   * share an address, and a name is not an identity, so refusing on those would
   * block real registrations while catching very little.
   */
  async create(dto: CreateMemberDto): Promise<MemberResponse> {
    await this.assertPhoneIsFree(dto.phone);

    const member = await this.createWithGeneratedCode(dto);

    this.logger.log(`Registered ${member.memberCode} (${member.firstName} ${member.lastName}).`);

    return toMemberResponse(member);
  }

  /**
   * Lists members, optionally filtered by a search term and status.
   *
   * Deactivated members are included by default: past attendance and payments
   * still refer to them, so hiding them by default would make the record of a
   * completed membership impossible to find.
   */
  async list(query: ListMembersQueryDto): Promise<MemberListResponse> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;

    const where = await this.buildListFilter(query);

    const [rows, total] = await Promise.all([
      this.prisma.member.findMany({
        where,
        // Surname first matches how a paper register is read, and the
        // members_last_name_first_name_idx covers this ordering.
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.member.count({ where }),
    ]);

    return {
      members: rows.map(toMemberResponse),
      total,
      page,
      limit,
      pageCount: Math.ceil(total / limit),
    };
  }

  /** One member by id. Deactivated members are still returned. */
  async findOne(id: string): Promise<MemberResponse> {
    const member = await this.prisma.member.findUnique({ where: { id } });

    if (member === null) {
      throw new NotFoundException(MEMBER_NOT_FOUND_MESSAGE);
    }

    return toMemberResponse(member);
  }

  /**
   * Applies a partial change.
   *
   * Only the fields present in the request are written, so an omitted field is
   * left alone and an explicit null clears an optional one. The member number and
   * the status are not updatable here: a number is permanent, and lifecycle
   * changes go through deactivate so that each one is a deliberate, logged act.
   */
  async update(id: string, dto: UpdateMemberDto): Promise<MemberResponse> {
    const data = this.buildUpdateData(dto);

    if (Object.keys(data).length === 0) {
      throw new BadRequestException(NO_FIELDS_TO_UPDATE_MESSAGE);
    }

    if (data.phone !== undefined) {
      // Scoped to this member so re-saving a member without touching its phone
      // is not reported as a conflict with itself.
      await this.assertPhoneIsFree(data.phone, id);
    }

    const member = await this.prisma.member.update({ where: { id }, data });

    this.logger.log(`Updated member ${member.memberCode}.`);

    return toMemberResponse(member);
  }

  /**
   * Marks a member inactive.
   *
   * The row stays, so the member remains retrievable and every historical record
   * that references them still resolves. Repeating the call is a no-op rather
   * than an error: the desk will retry a request that timed out, and the second
   * attempt should not look like a failure.
   */
  async deactivate(id: string): Promise<MemberResponse> {
    const existing = await this.prisma.member.findUnique({ where: { id } });

    if (existing === null) {
      throw new NotFoundException(MEMBER_NOT_FOUND_MESSAGE);
    }

    if (existing.status === MemberStatus.INACTIVE) {
      return toMemberResponse(existing);
    }

    const member = await this.prisma.member.update({
      where: { id },
      data: { status: MemberStatus.INACTIVE },
    });

    this.logger.log(`Deactivated member ${member.memberCode}.`);

    return toMemberResponse(member);
  }

  /**
   * Inserts a member, claiming a number as part of the write.
   *
   * The unique indexes are the authority. A pre-check narrows the common case to
   * a clear 409, but two requests can both pass it, so a violation raised by the
   * database is translated rather than left to surface as a 500. Which index
   * failed decides what happens next: the phone index means the person is
   * already registered, while the member-code index means the number was taken a
   * moment ago and a fresh one should be tried.
   */
  private async createWithGeneratedCode(
    dto: CreateMemberDto,
  ): Promise<Awaited<ReturnType<PrismaService['member']['create']>>> {
    const fields = pickFields(dto, CREATE_FIELDS) as Prisma.MemberCreateInput;

    for (let attempt = 1; attempt <= MAX_CODE_ATTEMPTS; attempt += 1) {
      const memberCode = await this.memberCodeService.next();

      try {
        return await this.prisma.member.create({ data: { ...fields, memberCode } });
      } catch (error) {
        if (!isUniqueViolation(error)) {
          throw error;
        }

        if (await this.phoneIsTaken(dto.phone)) {
          throw new ConflictException(DUPLICATE_PHONE_MESSAGE);
        }

        this.logger.warn(`Member number ${memberCode} was taken; retrying (attempt ${attempt}).`);
      }
    }

    this.memberCodeService.exhausted(MAX_CODE_ATTEMPTS);

    throw new ConflictException(MEMBER_CODE_EXHAUSTED_MESSAGE);
  }

  /** Rejects a phone number that another member already holds. */
  private async assertPhoneIsFree(phone: string, exceptMemberId?: string): Promise<void> {
    if (await this.phoneIsTaken(phone, exceptMemberId)) {
      throw new ConflictException(DUPLICATE_PHONE_MESSAGE);
    }
  }

  /**
   * Compares phones on their digits, mirroring members_phone_digits_key.
   *
   * The index covers formatting variants, so "+254 712 345 678" and
   * "(0712) 345 678" are one person. Prisma cannot express an expression index,
   * hence the raw query; the expression is copied from the migration so the two
   * cannot disagree about what "the same phone number" means.
   */
  private async phoneIsTaken(phone: string, exceptMemberId?: string): Promise<boolean> {
    const digits = digitsOnly(phone);

    const rows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id
      FROM members
      WHERE regexp_replace(phone, '[^0-9]', '', 'g') = ${digits}
        AND (${exceptMemberId ?? null}::uuid IS NULL OR id <> ${exceptMemberId ?? null}::uuid)
      LIMIT 1
    `);

    return rows.length > 0;
  }

  /**
   * Members whose phone digits contain the search term.
   *
   * Runs separately from the main query because only Postgres can strip the
   * formatting characters, and the result is folded back in as a set of ids.
   */
  private async idsMatchingPhoneDigits(term: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id
      FROM members
      WHERE regexp_replace(phone, '[^0-9]', '', 'g') LIKE ${`%${term}%`}
      ORDER BY member_code
      LIMIT 200
    `);

    return rows.map((row) => row.id);
  }

  private async buildListFilter(query: ListMembersQueryDto): Promise<Prisma.MemberWhereInput> {
    const clauses: Prisma.MemberWhereInput[] = [];

    if (query.status !== undefined) {
      clauses.push({ status: query.status });
    } else if (query.includeInactive === 'false') {
      clauses.push({ status: { not: MemberStatus.INACTIVE } });
    }

    const term = query.q;

    if (term !== undefined) {
      const phoneDigits = digitsOnly(term);

      const idMatches =
        phoneDigits.length >= MIN_PHONE_SEARCH_DIGITS ? await this.idsMatchingPhoneDigits(phoneDigits) : [];

      clauses.push({
        OR: [
          { memberCode: { contains: term, mode: 'insensitive' } },
          { firstName: { contains: term, mode: 'insensitive' } },
          { lastName: { contains: term, mode: 'insensitive' } },
          // Literal match first, so a search for a whole stored number is served
          // by the index; the id list covers formatting variants of the same digits.
          { phone: { contains: term, mode: 'insensitive' } },
          ...(idMatches.length > 0 ? [{ id: { in: idMatches } }] : []),
        ],
      });
    }

    return clauses.length > 0 ? { AND: clauses } : {};
  }

  /** The fields actually present in the request, and nothing else. */
  private buildUpdateData(dto: UpdateMemberDto): Prisma.MemberUpdateInput {
    return pickFields(dto, UPDATE_FIELDS) as Prisma.MemberUpdateInput;
  }
}

/**
 * Copies across only the named fields that the request actually supplied.
 *
 * Membership is tested with `in` rather than truthiness, so an explicit null is
 * carried through and clears the column, while an absent field is left out
 * entirely and leaves the stored value alone.
 */
function pickFields<T extends object, K extends readonly (keyof T)[]>(
  source: T,
  fields: K,
): Partial<Pick<T, K[number]>> {
  const picked: Partial<Pick<T, K[number]>> = {};

  for (const field of fields) {
    if (field in source) {
      picked[field] = source[field];
    }
  }

  return picked;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}