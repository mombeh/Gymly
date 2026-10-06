import type { UserRole, UserStatus } from '../generated/prisma/client';

export const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password';
export const AUTHENTICATION_REQUIRED_MESSAGE = 'Authentication required';
export const EMAIL_TAKEN_MESSAGE = 'An account with this email already exists';

/**
 * The wording for an account that is not ACTIVE.
 *
 * Named here rather than written at each refusal point, so login, /auth/me and
 * the request guard cannot drift into telling a caller three different things
 * about the same state.
 *
 * Safe to name the state: it is only ever produced after the caller has already
 * proved the password (or presented a valid token), so it reveals nothing about
 * whether the address is registered.
 */
export function inactiveAccountMessage(status: string): string {
  return `This account is ${status.toLowerCase()}. Contact an owner to reactivate it.`;
}

/**
 * Claims carried by an access token. `sub` is the user id; the rest is a
 * convenience copy so the frontend does not need a lookup to render a name.
 * Role and status are re-read from the database on every protected request
 * rather than trusted from the token, so a token cannot outlive a revoked role.
 */
export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

/** Identity attached to the request by JwtAuthGuard. */
export interface AuthenticatedUser {
  sub: string;
  email: string;
  role: UserRole;
}

/**
 * The only user shape allowed to leave the API.
 *
 * Fields are listed explicitly rather than spreading a database row, so
 * passwordHash cannot be returned even by accident.
 */
export interface PublicUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  /** Lifetime in seconds, so the client can schedule a refresh. */
  expiresIn: number;
  user: PublicUser;
}

export interface CurrentUserResponse {
  user: PublicUser;
}

type UserRow = Pick<PublicUser, 'id' | 'email' | 'firstName' | 'lastName' | 'role' | 'status'>;

export function toPublicUser(user: UserRow): PublicUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    status: user.status,
  };
}
