'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { ApiError, NetworkError } from '../lib/api-client';
import { useAuth } from '../lib/auth-context';
import { safeNextPath } from '../lib/navigation';
import { PasswordInput } from './password-input';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mirrors the API's RegisterDto so the user is told before a round trip. */
const MIN_PASSWORD_LENGTH = 8;

interface FieldErrors {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

export interface RegisterValues {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export function validateRegister(values: RegisterValues): FieldErrors {
  const errors: FieldErrors = {};

  if (values.firstName.trim() === '') {
    errors.firstName = 'Enter your first name.';
  }

  if (values.lastName.trim() === '') {
    errors.lastName = 'Enter your last name.';
  }

  if (values.email.trim() === '') {
    errors.email = 'Enter your email address.';
  } else if (!EMAIL_PATTERN.test(values.email.trim())) {
    errors.email = 'Enter a valid email address.';
  }

  if (values.password === '') {
    errors.password = 'Choose a password.';
  } else if (values.password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  if (values.confirmPassword !== values.password) {
    errors.confirmPassword = 'Passwords do not match.';
  }

  return errors;
}

export function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { register } = useAuth();

  const [values, setValues] = useState<RegisterValues>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const nextPath = searchParams.get('next');

  function set<K extends keyof RegisterValues>(key: K, value: RegisterValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const errors = validateRegister(values);
    setFieldErrors(errors);
    setFormError(null);

    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);

    try {
      await register({
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        password: values.password,
      });
      router.replace(safeNextPath(nextPath));
    } catch (error) {
      setFormError(describeError(error));
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="auth-form">
      <h1 className="auth-title">Create your account</h1>
      <p className="auth-subtitle">Start managing your gym in a minute.</p>

      <label className="auth-label" htmlFor="firstName">
        First name
      </label>
      <input
        id="firstName"
        name="firstName"
        type="text"
        autoComplete="given-name"
        className="auth-input"
        value={values.firstName}
        onChange={(event) => set('firstName', event.target.value)}
        aria-invalid={fieldErrors.firstName !== undefined}
        aria-describedby={fieldErrors.firstName !== undefined ? 'firstName-error' : undefined}
        disabled={isSubmitting}
      />
      {fieldErrors.firstName !== undefined && (
        <p id="firstName-error" className="auth-field-error" role="alert">
          {fieldErrors.firstName}
        </p>
      )}

      <label className="auth-label" htmlFor="lastName">
        Last name
      </label>
      <input
        id="lastName"
        name="lastName"
        type="text"
        autoComplete="family-name"
        className="auth-input"
        value={values.lastName}
        onChange={(event) => set('lastName', event.target.value)}
        aria-invalid={fieldErrors.lastName !== undefined}
        aria-describedby={fieldErrors.lastName !== undefined ? 'lastName-error' : undefined}
        disabled={isSubmitting}
      />
      {fieldErrors.lastName !== undefined && (
        <p id="lastName-error" className="auth-field-error" role="alert">
          {fieldErrors.lastName}
        </p>
      )}

      <label className="auth-label" htmlFor="register-email">
        Email
      </label>
      <input
        id="register-email"
        name="email"
        type="email"
        autoComplete="email"
        className="auth-input"
        value={values.email}
        onChange={(event) => set('email', event.target.value)}
        aria-invalid={fieldErrors.email !== undefined}
        aria-describedby={fieldErrors.email !== undefined ? 'register-email-error' : undefined}
        disabled={isSubmitting}
      />
      {fieldErrors.email !== undefined && (
        <p id="register-email-error" className="auth-field-error" role="alert">
          {fieldErrors.email}
        </p>
      )}

      <PasswordInput
        label="Password"
        value={values.password}
        onChange={(value) => set('password', value)}
        autoComplete="new-password"
        invalid={fieldErrors.password !== undefined}
        describedBy={fieldErrors.password !== undefined ? 'register-password-error' : undefined}
        disabled={isSubmitting}
      />
      {fieldErrors.password !== undefined ? (
        <p id="register-password-error" className="auth-field-error" role="alert">
          {fieldErrors.password}
        </p>
      ) : (
        <p className="auth-hint">At least {MIN_PASSWORD_LENGTH} characters.</p>
      )}

      <PasswordInput
        label="Confirm password"
        value={values.confirmPassword}
        onChange={(value) => set('confirmPassword', value)}
        autoComplete="new-password"
        invalid={fieldErrors.confirmPassword !== undefined}
        describedBy={fieldErrors.confirmPassword !== undefined ? 'confirm-password-error' : undefined}
        disabled={isSubmitting}
      />
      {fieldErrors.confirmPassword !== undefined && (
        <p id="confirm-password-error" className="auth-field-error" role="alert">
          {fieldErrors.confirmPassword}
        </p>
      )}

      {formError !== null && (
        <p className="auth-form-error" role="alert">
          {formError}
        </p>
      )}

      <button type="submit" className="auth-submit" disabled={isSubmitting}>
        {isSubmitting ? 'Creating account…' : 'Create account'}
      </button>

      <p className="auth-switch">
        Already have an account?{' '}
        <Link className="auth-link" href={loginHref(nextPath)}>
          Sign in
        </Link>
      </p>
    </form>
  );
}

function loginHref(nextPath: string | null): string {
  return nextPath === null ? '/login' : `/login?next=${encodeURIComponent(nextPath)}`;
}

/** Turns any failure into something safe and specific enough to act on. */
function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    // The address is already taken: point at signing in rather than dead-ending.
    if (error.status === 409) {
      return 'An account with this email already exists. Try signing in instead.';
    }
    if (error.status === 400) {
      return error.message || 'Check the details you entered and try again.';
    }
    return error.message;
  }

  if (error instanceof NetworkError) return error.message;

  return 'Something went wrong. Try again.';
}