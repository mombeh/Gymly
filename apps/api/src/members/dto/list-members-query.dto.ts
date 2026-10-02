import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MemberStatus } from '../../generated/prisma/client';

/** Guardrails on page size, so one request cannot ask for the whole table. */
export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Query of GET /api/members.
 *
 * `q` is matched against memberCode, firstName, lastName and phone so the desk
 * can find a member by whichever of those the member can actually remember.
 * `includeInactive` defaults to true: deactivated members stay listed, because
 * past attendance and payments still refer to them. Pass false to see only
 * current members.
 */
export class ListMembersQueryDto {
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'q must be a string' })
  @MaxLength(100, { message: 'q must be at most 100 characters' })
  @Matches(/\S/, { message: 'q must not be blank' })
  q?: string;

  @IsOptional()
  @IsEnum(MemberStatus, { message: `status must be one of: ${Object.keys(MemberStatus).join(', ')}` })
  status?: MemberStatus;

  // Query strings arrive as text, and implicit conversion is deliberately off
  // application-wide, so the coercion is declared here instead.
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page must be an integer' })
  @Min(1, { message: 'page must be at least 1' })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit must be at least 1' })
  @Max(MAX_LIMIT, { message: `limit must be at most ${MAX_LIMIT}` })
  limit?: number;

  @IsOptional()
  @IsString({ message: 'includeInactive must be a string' })
  includeInactive?: string;
}