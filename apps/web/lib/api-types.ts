/**
 * Shape of a user as returned by the backend. Mirrors the API's PublicUser,
 * which is the only user representation the API exposes.
 */
export interface PublicUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'OWNER' | 'RECEPTIONIST' | 'TRAINER' | 'MEMBER';
  status: 'PENDING' | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
}

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: PublicUser;
}

export interface CurrentUserResponse {
  user: PublicUser;
}

/** Error body produced by the API's global exception filter. */
export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path?: string;
  timestamp?: string;
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'statusCode' in value &&
    'message' in value
  );
}