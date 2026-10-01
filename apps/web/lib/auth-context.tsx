'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { ApiError, apiRequest } from './api-client';
import { clearToken, readToken, writeToken } from './auth-storage';
import type { CurrentUserResponse, LoginResponse, PublicUser } from './api-types';

export const LOGIN_PATH = '/login';

/**
 * `loading` covers the first render and the token validation on boot, so the
 * UI can hold back any redirect decision until the session is actually known.
 */
export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthContextValue {
  status: AuthStatus;
  user: PublicUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<PublicUser | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Restore the session on boot. A stored token is treated as unproven until
  // the API accepts it, so an expired or revoked token cannot open the app.
  useEffect(() => {
    const token = readToken();

    if (token === null) {
      setStatus('unauthenticated');
      return;
    }

    const controller = new AbortController();

    void (async () => {
      try {
        const response = await apiRequest<CurrentUserResponse>('/auth/me', {
          token,
          signal: controller.signal,
        });

        if (!mounted.current) return;
        setUser(response.user);
        setStatus('authenticated');
      } catch {
        if (!mounted.current) return;
        clearToken();
        setUser(null);
        setStatus('unauthenticated');
      }
    })();

    return () => controller.abort();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiRequest<LoginResponse>('/auth/login', {
      method: 'POST',
      body: { email: email.trim(), password },
    });

    writeToken(response.accessToken);
    setUser(response.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    setStatus('unauthenticated');
    router.replace(LOGIN_PATH);
  }, [router]);

  const value = useMemo(
    () => ({ status, user, login, logout }),
    [status, user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (context === null) {
    throw new Error('useAuth must be used inside an AuthProvider.');
  }

  return context;
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}