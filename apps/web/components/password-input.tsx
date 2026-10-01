'use client';

import { useId, useState } from 'react';

interface PasswordInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Password field with a show/hide toggle.
 *
 * Masking alone makes typos invisible on a long password, so the user cannot
 * tell a mistyped character from a correct one. The toggle exposes the value on
 * demand without changing what is stored or submitted.
 */
export function PasswordInput({
  label,
  value,
  onChange,
  autoComplete,
  invalid = false,
  describedBy,
  disabled = false,
  placeholder,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const inputId = useId();
  const buttonId = `${inputId}-toggle`;

  return (
    <>
      <label className="auth-label" htmlFor={inputId}>
        {label}
      </label>

      <div className="auth-password-field">
        <input
          id={inputId}
          name={label.toLowerCase()}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          className="auth-input auth-password-input"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid}
          aria-describedby={[describedBy, invalid ? buttonId : undefined].filter(Boolean).join(' ') || undefined}
          disabled={disabled}
          placeholder={placeholder}
        />

        <button
          id={buttonId}
          type="button"
          className="auth-password-toggle"
          onClick={() => setVisible((current) => !current)}
          // aria-pressed tells assistive tech the toggle's state, which the icon alone does not.
          aria-pressed={visible}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          title={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          disabled={disabled}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
      <path
        d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line x1="1" y1="1" x2="23" y2="23" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}