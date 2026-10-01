'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { ApiError, NetworkError } from '../lib/api-client';
import { useAuth } from '../lib/auth-context';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FieldErrors {
  email?: string;
  password?: string;
}

function validate(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};

  if (email.trim() === '') {
    errors.email = 'Enter your email address.';
  } else if (!EMAIL_PATTERN.test(email.trim())) {
    errors.email = 'Enter a valid email address.';
  }

  if (password === '') {
    errors.password = 'Enter your password.';
  }

  return errors;
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const nextPath = searchParams.get('next');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const errors = validate(email, password);
    setFieldErrors(errors);
    setFormError(null);

    // Client-side checks only catch the obvious cases; the API revalidates.
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);

    try {
      await login(email, password);
      router.replace(nextPath !== null && nextPath.startsWith('/') ? nextPath : '/dashboard');
    } catch (error) {
      setFormError(describeError(error));
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="auth-form">
      <h1 className="auth-title">Sign in to Gymly</h1>
      <p className="auth-subtitle">Use your staff account to continue.</p>

      <label className="auth-label" htmlFor="email">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        className="auth-input"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        aria-invalid={fieldErrors.email !== undefined}
        aria-describedby={fieldErrors.email !== undefined ? 'email-error' : undefined}
        disabled={isSubmitting}
      />
      {fieldErrors.email !== undefined && (
        <p id="email-error" className="auth-field-error" role="alert">
          {fieldErrors.email}
        </p>
      )}

      <label className="auth-label" htmlFor="password">
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        className="auth-input"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        aria-invalid={fieldErrors.password !== undefined}
        aria-describedby={fieldErrors.password !== undefined ? 'password-error' : undefined}
        disabled={isSubmitting}
      />
      {fieldErrors.password !== undefined && (
        <p id="password-error" className="auth-field-error" role="alert">
          {fieldErrors.password}
        </p>
      )}

      {formError !== null && (
        <p className="auth-form-error" role="alert">
          {formError}
        </p>
      )}

      <button type="submit" className="auth-submit" disabled={isSubmitting}>
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

/** Turns any failure into something safe and specific enough to act on. */
function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Invalid email or password.';
    if (error.status === 403) {
      return error.message || 'This account is not active. Contact an owner.';
    }
    if (error.status === 400) {
      return error.message || 'Check the details you entered and try again.';
    }
    return error.message;
  }

  if (error instanceof NetworkError) return error.message;

  return 'Something went wrong. Try again.';
}