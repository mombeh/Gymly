import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Human-readable gym member number, e.g. GYM-000123. */
export const MEMBER_CODE_PREFIX = 'GYM-';

/** Zero padding, fixed so codes sort lexicographically in the same order as numerically. */
const MEMBER_CODE_WIDTH = 6;

/** Rendered when a series of allocations is exhausted. */
export const MEMBER_CODE_EXHAUSTED_MESSAGE = 'Could not allocate a member number, please try again';

/**
 * Allocates the member number. The client never supplies one.
 *
 * The number is derived from the highest code already in use rather than from a
 * row count, so a code is never reused after a member is deactivated and the
 * sequence does not depend on how many rows still exist. Gaps are acceptable and
 * in fact desirable: a code that has once been printed on a membership card must
 * never identify a different person later.
 */
@Injectable()
export class MemberCodeService {
  private readonly logger = new Logger(MemberCodeService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * The next unused member number.
   *
   * This is a candidate, not a guarantee: two receptionists registering at the
   * same instant can read the same maximum and pick the same number. The unique
   * index is the authority, so the caller inserts and retries on conflict rather
   * than trusting this read.
   */
  async next(): Promise<string> {
    const rows = await this.prisma.$queryRaw<{ highest: string | number | null }[]>(Prisma.sql`
      SELECT MAX(NULLIF(regexp_replace(member_code, '[^0-9]', '', 'g'), '')::bigint) AS highest
      FROM members
      WHERE member_code LIKE ${`${MEMBER_CODE_PREFIX}%`}
    `);

    const highest = rows[0]?.highest;

    return formatMemberCode(toSequenceNumber(highest) + 1);
  }

  /** Logs an exhausted allocation, so a rare collision storm is diagnosable. */
  exhausted(attempts: number): void {
    this.logger.error(`Could not allocate a member number after ${attempts} attempts.`);
  }
}

/**
 * Postgres returns bigint as a string to avoid precision loss, so a numeric
 * result can arrive as either type depending on the driver.
 */
function toSequenceNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }

  const parsed = typeof value === 'number' ? value : Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Renders a sequence number as a member code.
 *
 * Exported so the unit tests can assert the exact format the service depends on,
 * without going through the database.
 */
export function formatMemberCode(sequenceNumber: number): string {
  return `${MEMBER_CODE_PREFIX}${String(sequenceNumber).padStart(MEMBER_CODE_WIDTH, '0')}`;
}