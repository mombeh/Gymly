'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { LOGIN_PATH, useAuth } from '../lib/auth-context';

/**
 * Client-side gate for the signed-in area.
 *
 * The session lives in browser storage, so the decision can only be made after
 * hydration; the API still authorises every request, and this guard exists to
 * keep unauthenticated users out of the UI and to preserve where they were
 * headed.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === 'unauthenticated') {
      const next = encodeURIComponent(pathname);
      router.replace(`${LOGIN_PATH}?next=${next}`);
    }
  }, [status, pathname, router]);

  if (status !== 'authenticated') {
    return (
      <div className="auth-loading" role="status" aria-live="polite">
        Loading your session…
      </div>
    );
  }

  return <>{children}</>;
}