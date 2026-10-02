'use client';

import { useState } from 'react';

import {
  EMPTY_MEMBER_FORM,
  hasChanges,
  validateMemberForm,
  type MemberFormErrors,
  type MemberFormValues,
} from '../../lib/member-validation';
import { GENDER_OPTIONS, genderLabel, type Gender, type Member } from '../../lib/member-types';

interface MemberFormProps {
  /** Present when editing; absent when registering. */
  member?: Member;
  submitLabel: string;
  busyLabel: string;
  isSubmitting: boolean;
  onSubmit: (values: MemberFormValues) => void;
  onCancel?: () => void;
}

/**
 * The member fields, shared by the registration and edit pages.
 *
 * There is no member-code input anywhere in this form. The number is assigned by
 * the API, and a field that is not rendered cannot be filled in, so the client
 * has no way to send one.
 */
export function MemberForm({
  member,
  submitLabel,
  busyLabel,
  isSubmitting,
  onSubmit,
  onCancel,
}: MemberFormProps) {
  const [values, setValues] = useState<MemberFormValues>(() => valuesFromMember(member));
  const [errors, setErrors] = useState<MemberFormErrors>({});

  function set<K extends keyof MemberFormValues>(key: K, value: MemberFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit() {
    if (isSubmitting) return;

    const found = validateMemberForm(values);

    // On edit, a form nobody changed would be refused by the API, so it is
    // caught here with a message about the form instead of about the request.
    if (member !== undefined && !hasChanges(valuesFromMember(member), values)) {
      setErrors({ firstName: 'Change something before saving.' });

      return;
    }

    setErrors(found);

    if (Object.keys(found).length > 0) return;

    onSubmit(values);
  }

  return (
    <form
      className="form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit();
      }}
    >
      {member !== undefined && (
        <p className="form-note">
          Member code <strong>{member.memberCode}</strong> was issued by the gym and cannot be
          changed.
        </p>
      )}

      <div className="form-grid">
        <Field label="First name" htmlFor="firstName" error={errors.firstName} required>
          <input
            id="firstName"
            name="firstName"
            type="text"
            autoComplete="given-name"
            className="field-input"
            value={values.firstName}
            onChange={(event) => set('firstName', event.target.value)}
            disabled={isSubmitting}
            required
            aria-invalid={errors.firstName !== undefined}
            aria-describedby={errors.firstName !== undefined ? 'firstName-error' : undefined}
          />
        </Field>

        <Field label="Last name" htmlFor="lastName" error={errors.lastName} required>
          <input
            id="lastName"
            name="lastName"
            type="text"
            autoComplete="family-name"
            className="field-input"
            value={values.lastName}
            onChange={(event) => set('lastName', event.target.value)}
            disabled={isSubmitting}
            required
            aria-invalid={errors.lastName !== undefined}
            aria-describedby={errors.lastName !== undefined ? 'lastName-error' : undefined}
          />
        </Field>

        <Field label="Phone" htmlFor="phone" error={errors.phone} required>
          <input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            className="field-input"
            placeholder="+254 712 345 678"
            value={values.phone}
            onChange={(event) => set('phone', event.target.value)}
            disabled={isSubmitting}
            required
            aria-invalid={errors.phone !== undefined}
            aria-describedby={errors.phone !== undefined ? 'phone-error' : 'phone-hint'}
          />
          {errors.phone === undefined && (
            <p id="phone-hint" className="field-hint">
              Between 7 and 15 digits. Formatting is kept as typed.
            </p>
          )}
        </Field>

        <Field label="Email" htmlFor="member-email" error={errors.email}>
          <input
            id="member-email"
            name="email"
            type="email"
            autoComplete="email"
            className="field-input"
            value={values.email}
            onChange={(event) => set('email', event.target.value)}
            disabled={isSubmitting}
            aria-invalid={errors.email !== undefined}
            aria-describedby={errors.email !== undefined ? 'member-email-error' : undefined}
          />
        </Field>

        <Field label="Date of birth" htmlFor="dateOfBirth" error={errors.dateOfBirth}>
          <input
            id="dateOfBirth"
            name="dateOfBirth"
            type="date"
            autoComplete="bday"
            min="1900-01-01"
            max={new Date().toISOString().slice(0, 10)}
            className="field-input"
            value={values.dateOfBirth}
            onChange={(event) => set('dateOfBirth', event.target.value)}
            disabled={isSubmitting}
            aria-invalid={errors.dateOfBirth !== undefined}
            aria-describedby={errors.dateOfBirth !== undefined ? 'dateOfBirth-error' : undefined}
          />
        </Field>

        <Field label="Gender" htmlFor="gender" error={errors.gender}>
          <select
            id="gender"
            name="gender"
            className="field-input"
            value={values.gender}
            onChange={(event) => set('gender', event.target.value)}
            disabled={isSubmitting}
            aria-invalid={errors.gender !== undefined}
            aria-describedby={errors.gender !== undefined ? 'gender-error' : undefined}
          >
            <option value="">Not stated</option>
            {GENDER_OPTIONS.map((option: Gender) => (
              <option key={option} value={option}>
                {genderLabel(option)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Address" htmlFor="address" error={errors.address}>
          <textarea
            id="address"
            name="address"
            rows={3}
            className="field-input"
            value={values.address}
            onChange={(event) => set('address', event.target.value)}
            disabled={isSubmitting}
            aria-invalid={errors.address !== undefined}
            aria-describedby={errors.address !== undefined ? 'address-error' : undefined}
          />
        </Field>

        <Field
          label="Emergency contact"
          htmlFor="emergencyContact"
          error={errors.emergencyContact}
          hint="Name and phone number of someone to call."
        >
          <textarea
            id="emergencyContact"
            name="emergencyContact"
            rows={3}
            className="field-input"
            value={values.emergencyContact}
            onChange={(event) => set('emergencyContact', event.target.value)}
            disabled={isSubmitting}
            aria-invalid={errors.emergencyContact !== undefined}
            aria-describedby={
              errors.emergencyContact !== undefined ? 'emergencyContact-error' : undefined
            }
          />
        </Field>
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? busyLabel : submitLabel}
        </button>

        {onCancel !== undefined && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}

/**
 * Label, control and error as one unit.
 *
 * The error is wired with aria-describedby so a screen reader announces why the
 * control was refused, and the asterisk is drawn in CSS so it is not read aloud.
 */
function Field({ label, htmlFor, error, required, hint, children }: FieldProps) {
  const errorId = `${htmlFor}-error`;

  return (
    <div className="field">
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {required === true && <span className="field-required" aria-hidden="true"> *</span>}
      </label>

      {children}

      {error !== undefined ? (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      ) : (
        hint !== undefined && <p className="field-hint">{hint}</p>
      )}
    </div>
  );
}

/** A blank form, or one prefilled from the member being edited. */
export function valuesFromMember(member?: Member): MemberFormValues {
  if (member === undefined) return EMPTY_MEMBER_FORM;

  return {
    firstName: member.firstName,
    lastName: member.lastName,
    phone: member.phone,
    email: member.email ?? '',
    dateOfBirth: member.dateOfBirth ?? '',
    gender: member.gender ?? '',
    address: member.address ?? '',
    emergencyContact: member.emergencyContact ?? '',
  };
}