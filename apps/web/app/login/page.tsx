import { Suspense } from 'react';

import { LoginForm } from '../../components/login-form';

// useSearchParams needs a Suspense boundary during prerendering.
export default function LoginPage() {
  return (
    <main className="auth-page">
      <Suspense fallback={<div className="auth-loading">Loading…</div>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}