import { apiRequest, ApiError } from './api-client';
import type {
  CreateMemberInput,
  ListMembersQuery,
  Member,
  MemberPage,
  UpdateMemberInput,
} from './member-types';

/**
 * Every member call the frontend makes, in one place.
 *
 * These wrap the shared apiRequest client rather than calling fetch directly, so
 * the base URL, the Authorization header and the error contract stay defined once.
 * Each call takes the token explicitly: the token lives in browser storage, and
 * threading it through a function argument keeps the data layer free of any
 * dependency on React or on the auth provider.
 */

const MEMBERS_PATH = '/members';

/** Builds a query string, omitting empty values so the API sees no blank filter. */
function toSearchParams(query: ListMembersQuery): string {
  const params = new URLSearchParams();

  if (query.q !== undefined && query.q.trim() !== '') {
    params.set('q', query.q.trim());
  }

  if (query.status !== undefined) {
    params.set('status', query.status);
  }

  if (query.page !== undefined) {
    params.set('page', String(query.page));
  }

  if (query.limit !== undefined) {
    params.set('limit', String(query.limit));
  }

  if (query.includeInactive === false) {
    // The API includes deactivated members by default; this is how they are hidden.
    params.set('includeInactive', 'false');
  }

  const search = params.toString();

  return search === '' ? '' : `?${search}`;
}

/**
 * Strips the optional fields that were left blank.
 *
 * An empty string is not the same as "not provided": the API rejects a blank
 * address, so sending one would fail the whole save for a field the person never
 * filled in. Clearing an existing value is done explicitly, with null.
 */
function compactOptional(input: CreateMemberInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    phone: input.phone.trim(),
  };

  if (input.email !== undefined && input.email.trim() !== '') {
    body['email'] = input.email.trim();
  }

  if (input.dateOfBirth !== undefined && input.dateOfBirth !== '') {
    body['dateOfBirth'] = input.dateOfBirth;
  }

  if (input.gender !== undefined && input.gender !== '') {
    body['gender'] = input.gender;
  }

  if (input.address !== undefined && input.address.trim() !== '') {
    body['address'] = input.address.trim();
  }

  if (input.emergencyContact !== undefined && input.emergencyContact.trim() !== '') {
    body['emergencyContact'] = input.emergencyContact.trim();
  }

  return body;
}

export function listMembers(query: ListMembersQuery, token: string, signal?: AbortSignal) {
  return apiRequest<MemberPage>(`${MEMBERS_PATH}${toSearchParams(query)}`, { token, signal });
}

export function getMember(id: string, token: string, signal?: AbortSignal) {
  return apiRequest<Member>(`${MEMBERS_PATH}/${id}`, { token, signal });
}

export function createMember(input: CreateMemberInput, token: string) {
  return apiRequest<Member>(MEMBERS_PATH, {
    method: 'POST',
    body: compactOptional(input),
    token,
  });
}

/**
 * Sends only the fields that changed.
 *
 * The endpoint is a partial update, so sending an unchanged field would be noise
 * at best; sending an omitted one as blank would be rejected. A field the person
 * deliberately cleared travels as null.
 */
export function updateMember(id: string, input: UpdateMemberInput, token: string) {
  const body: Record<string, unknown> = {};

  if (input.firstName !== undefined) body['firstName'] = input.firstName.trim();
  if (input.lastName !== undefined) body['lastName'] = input.lastName.trim();
  if (input.phone !== undefined) body['phone'] = input.phone.trim();

  if (input.email !== undefined) body['email'] = input.email?.trim() || null;
  if (input.dateOfBirth !== undefined) body['dateOfBirth'] = input.dateOfBirth || null;
  if (input.gender !== undefined && input.gender !== null) body['gender'] = input.gender;
  if (input.address !== undefined) body['address'] = input.address?.trim() || null;
  if (input.emergencyContact !== undefined) {
    body['emergencyContact'] = input.emergencyContact?.trim() || null;
  }

  return apiRequest<Member>(`${MEMBERS_PATH}/${id}`, { method: 'PATCH', body, token });
}

export function deactivateMember(id: string, token: string) {
  return apiRequest<Member>(`${MEMBERS_PATH}/${id}/deactivate`, { method: 'PATCH', token });
}

/**
 * Turns a failure into a message the person can act on.
 *
 * A 409 on the members endpoints is the duplicate-phone case, which is a
 * predictable outcome of registering at the front desk rather than a fault, so
 * it gets a message that says what to do next instead of echoing the API's.
 */
export function describeMemberError(error: unknown, context: 'create' | 'update' | 'load'): string {
  if (error instanceof ApiError) {
    if (error.status === 409) {
      return 'A member with this phone number already exists. Search for them and edit their record instead.';
    }

    if (error.status === 403) {
      return 'You do not have permission to manage members. Ask an owner for access.';
    }

    if (error.status === 400) {
      return error.message === ''
        ? 'The API rejected those details. Check the form and try again.'
        : error.message;
    }

    if (error.status === 404 && context === 'load') {
      return 'That member could not be found. They may have been removed.';
    }

    return error.message;
  }

  if (error instanceof Error && error.name === 'NetworkError') {
    return 'Could not reach the Gymly server. Check your connection and try again.';
  }

  return 'Something went wrong. Try again.';
}