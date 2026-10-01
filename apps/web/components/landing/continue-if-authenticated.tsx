'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { safeNextPath } from '../../lib/navigation';
import { useAuth } from '../../lib/auth-context';

/**
 * Keeps a signed-in visitor off the marketing page.
 *
 * The landing page itself stays static so it renders without waiting on the
 * session. This only sends an already-authenticated visitor onwards once the
 * provider has resolved, and respects a `?next=` destination so a shared link
 * is not swallowed by the marketing page.
 */
export function ContinueIfAuthenticated() {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated') {
      const params = new URLSearchParams(window.location.search);
      router.replace(safeNextPath(params.get('next')));
    }
  }, [status, router]);

  if (status === 'authenticated') {
    return (
      <div className="auth-loading" role="status">
        Taking you to your dashboard…
      </div>
    );
  }

  return null;
}