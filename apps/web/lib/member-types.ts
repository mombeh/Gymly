/**
 * Member shapes as returned by the Gymly API.
 *
 * These mirror the API's MemberResponse one for one. They are declared here
 * rather than imported from the API workspace so the web app keeps no build-time
 * dependency on the server package; if the two ever disagree, the API is right.
 */

export type MemberStatus = 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'UNDISCLOSED';

export interface Member {
  id: string;
  /** Assigned by the API on creation. Never entered by a person. */
  memberCode: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  /** ISO calendar date, YYYY-MM-DD, or null. */
  dateOfBirth: string | null;
  gender: Gender | null;
  address: string | null;
  emergencyContact: string | null;
  status: MemberStatus;
  createdAt: string;
  updatedAt: string;
}

export interface MemberPage {
  members: Member[];
  total: number;
  page: number;
  limit: number;
  pageCount: number;
}

export interface ListMembersQuery {
  q?: string;
  status?: MemberStatus;
  page?: number;
  limit?: number;
  includeInactive?: boolean;
}

/** Body of POST /members. memberCode is absent because the API assigns it. */
export interface CreateMemberInput {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  dateOfBirth?: string;
  gender?: Gender;
  address?: string;
  emergencyContact?: string;
}

/**
 * Body of PATCH /members/:id.
 *
 * Every field is optional and a `null` clears an optional one, which is why the
 * values are nullable: absent means "leave alone", null means "clear".
 */
export interface UpdateMemberInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string | null;
  dateOfBirth?: string | null;
  gender?: Gender | null;
  address?: string | null;
  emergencyContact?: string | null;
}

/** Human-readable status, so the UI never shows raw enum names. */
export function memberStatusLabel(status: MemberStatus): string {
  switch (status) {
    case 'PENDING':
      return 'Pending';
    case 'ACTIVE':
      return 'Active';
    case 'INACTIVE':
      return 'Inactive';
    case 'SUSPENDED':
      return 'Suspended';
  }
}

/** Gender options, offered in a neutral order with "prefer not to say" first. */
export const GENDER_OPTIONS: readonly Gender[] = [
  'MALE',
  'FEMALE',
  'OTHER',
  'UNDISCLOSED',
];

export function genderLabel(gender: Gender): string {
  switch (gender) {
    case 'MALE':
      return 'Male';
    case 'FEMALE':
      return 'Female';
    case 'OTHER':
      return 'Other';
    case 'UNDISCLOSED':
      return 'Prefer not to say';
  }
}

/** Memberships, payments and attendance are not built yet. */
export const UPCOMING_SECTIONS = [
  {
    key: 'memberships',
    title: 'Membership history',
    description: 'Plans, start and end dates, and renewals will appear here once the membership API exists.',
  },
  {
    key: 'payments',
    title: 'Payment history',
    description: 'Amounts paid, dates and receipts will appear here once the payments API exists.',
  },
  {
    key: 'attendance',
    title: 'Attendance history',
    description: 'Check-ins and class attendance will appear here once the attendance API exists.',
  },
] as const;