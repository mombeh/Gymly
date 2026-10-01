import type { ReactNode } from 'react';

import { ProtectedRoute } from '../../components/protected-route';

/** Every route in this group requires an authenticated session. */
export default function ProtectedLayout({ children }: { children: ReactNode }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}