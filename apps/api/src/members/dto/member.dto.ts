import { applyDecorators } from '@nestjs/common';
import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxDate,
  MaxLength,
  MinDate,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Gender } from '../../generated/prisma/client';
import { IsMemberPhone } from '../phone.validator';

/** Oldest date of birth the members table will store. */
const EARLIEST_DATE_OF_BIRTH = new Date('1900-01-01T00:00:00.000Z');

/** Trims a string, leaving anything else (including undefined) untouched. */
const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * A personal name: present, non-blank, and within the column width.
 *
 * Built once and applied to firstName and lastName rather than written out
 * twice, so the two fields cannot drift apart on a rule such as length.
 */
function NameField(field: 'firstName' | 'lastName'): PropertyDecorator {
  return (target: object, propertyKey: string | symbol): void => {
    applyDecorators(
      Transform(trim),
      IsString({ message: `${field} must be a string` }),
      MinLength(1, { message: `${field} must not be empty` }),
      MaxLength(100, { message: `${field} must be at most 100 characters` }),
      Matches(/\S/, { message: `${field} must not be only whitespace` }),
    )(target, propertyKey);
  };
}

/**
 * Optional free text, where blank is rejected so "not provided" and "provided
 * but empty" stay distinguishable, matching the table's CHECK constraints.
 */
function OptionalTextField(field: 'address' | 'emergencyContact'): PropertyDecorator {
  return (target: object, propertyKey: string | symbol): void => {
    applyDecorators(
      Transform(trim),
      IsString({ message: `${field} must be a string` }),
      MaxLength(500, { message: `${field} must be at most 500 characters` }),
      Matches(/\S/, { message: `${field} must not be blank` }),
    )(target, propertyKey);
  };
}

/**
 * Body of POST /api/members.
 *
 * memberCode is deliberately absent: the global ValidationPipe runs with
 * forbidNonWhitelisted, so a caller who sends one is rejected with 400 rather
 * than choosing their own member number. status is absent for the same reason,
 * because deactivation has its own endpoint and a new member starts PENDING.
 *
 * Every property uses `declare`, which suppresses the emitted field
 * initialiser. Without it the class would define an own property for each one,
 * and the service could no longer tell "the client sent this field" from "this
 * field exists and happens to be undefined", which is what a partial update
 * depends on.
 */
export class CreateMemberDto {
  @NameField('firstName')
  declare firstName: string;

  @NameField('lastName')
  declare lastName: string;

  @Transform(trim)
  @IsMemberPhone({ message: 'phone must contain 7-15 digits' })
  declare phone: string;

  // The members table has no unique index on email: two members of one household
  // legitimately share an address, so a duplicate email is allowed and is
  // surfaced by duplicate review rather than by rejecting the write.
  @IsOptional()
  @Transform(trim)
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(320, { message: 'email must be at most 320 characters' })
  declare email?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'dateOfBirth must be a valid date' })
  @MinDate(EARLIEST_DATE_OF_BIRTH, { message: 'dateOfBirth must be on or after 1900-01-01' })
  @MaxDate(() => new Date(), { message: 'dateOfBirth must be in the past' })
  declare dateOfBirth?: Date;

  @IsOptional()
  @IsEnum(Gender, { message: `gender must be one of: ${Object.keys(Gender).join(', ')}` })
  declare gender?: Gender;

  @IsOptional()
  @OptionalTextField('address')
  declare address?: string;

  @IsOptional()
  @OptionalTextField('emergencyContact')
  declare emergencyContact?: string;
}

/**
 * Body of PATCH /api/members/:id.
 *
 * Only the fields actually present are written, so an absent field is left
 * untouched and an explicit null clears an optional one. firstName, lastName and
 * phone are required on create, so an update may not write a value a create would
 * have refused: they validate when supplied and are skipped when absent, but an
 * explicit null is rejected rather than treated as "leave it alone".
 */
export class UpdateMemberDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @NameField('firstName')
  declare firstName?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @NameField('lastName')
  declare lastName?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trim)
  @IsMemberPhone({ message: 'phone must contain 7-15 digits' })
  declare phone?: string;

  @IsOptional()
  @Transform(trim)
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(320, { message: 'email must be at most 320 characters' })
  declare email?: string | null;

  @IsOptional()
  @Type(() => Date)
  @IsDate({ message: 'dateOfBirth must be a valid date' })
  @MinDate(EARLIEST_DATE_OF_BIRTH, { message: 'dateOfBirth must be on or after 1900-01-01' })
  @MaxDate(() => new Date(), { message: 'dateOfBirth must be in the past' })
  declare dateOfBirth?: Date | null;

  @IsOptional()
  @IsEnum(Gender, { message: `gender must be one of: ${Object.keys(Gender).join(', ')}` })
  declare gender?: Gender | null;

  @IsOptional()
  @OptionalTextField('address')
  declare address?: string | null;

  @IsOptional()
  @OptionalTextField('emergencyContact')
  declare emergencyContact?: string | null;
}