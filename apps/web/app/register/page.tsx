import { Suspense } from 'react';

import { RegisterForm } from '../../components/register-form';

// useSearchParams needs a Suspense boundary during prerendering.
export default function RegisterPage() {
  return (
    <main className="auth-page">
      <Suspense fallback={<div className="auth-loading">Loading…</div>}>
        <RegisterForm />
      </Suspense>
    </main>
  );
}