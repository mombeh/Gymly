import { Gender, MemberStatus } from '../generated/prisma/client';

/**
 * Fixed wording for the outcomes the members module reports, kept in one place
 * so the e2e suite and the service can never drift apart.
 */
export const MEMBER_NOT_FOUND_MESSAGE = 'Member not found';
export const DUPLICATE_PHONE_MESSAGE = 'A member with this phone number already exists';
export const NO_FIELDS_TO_UPDATE_MESSAGE = 'Provide at least one field to update';
export const MEMBER_CODE_UNAVAILABLE_MESSAGE =
  'Could not allocate a member number, please try again';

/**
 * The only member shape allowed to leave the API.
 *
 * Fields are listed explicitly rather than spreading a database row, so a column
 * added later is not published by accident and the service can control the
 * representation of dates.
 */
export interface MemberResponse {
  id: string;
  memberCode: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  /** ISO calendar date, or null when the member has not supplied one. */
  dateOfBirth: string | null;
  gender: Gender | null;
  address: string | null;
  emergencyContact: string | null;
  status: MemberStatus;
  createdAt: string;
  updatedAt: string;
}

/** A page of members plus the fields a client needs to render a pager. */
export interface MemberListResponse {
  members: MemberResponse[];
  total: number;
  page: number;
  limit: number;
  pageCount: number;
}

/** The subset of a database row the response mapper reads. */
export interface MemberRow {
  id: string;
  memberCode: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  dateOfBirth: Date | null;
  gender: Gender | null;
  address: string | null;
  emergencyContact: string | null;
  status: MemberStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Digits only, which is the form the database compares.
 *
 * The members table carries a unique index over regexp_replace(phone, ...) so
 * that "+254 712 345 678" and "(0712) 345 678" cannot be two members. Applying
 * the same reduction here keeps the service's duplicate check and the
 * database's unique index in agreement.
 */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/** ISO calendar date (YYYY-MM-DD) rather than a timestamp. */
function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function toMemberResponse(member: MemberRow): MemberResponse {
  return {
    id: member.id,
    memberCode: member.memberCode,
    firstName: member.firstName,
    lastName: member.lastName,
    phone: member.phone,
    email: member.email,
    dateOfBirth: member.dateOfBirth === null ? null : toIsoDate(member.dateOfBirth),
    gender: member.gender,
    address: member.address,
    emergencyContact: member.emergencyContact,
    status: member.status,
    createdAt: member.createdAt.toISOString(),
    updatedAt: member.updatedAt.toISOString(),
  };
}