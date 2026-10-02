/**
 * Client-side validation for the member form.
 *
 * These rules mirror the API's DTOs so the person is told what is wrong before a
 * round trip. They are a convenience, not a guarantee: the API validates every
 * request regardless, and its message wins if the two ever disagree.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Matches the API's members_phone_digit_count CHECK constraint. */
const MIN_PHONE_DIGITS = 7;
const MAX_PHONE_DIGITS = 15;

/** Matches the API's members_date_of_birth_range CHECK constraint. */
const EARLIEST_DATE_OF_BIRTH = '1900-01-01';

export interface MemberFormValues {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  dateOfBirth: string;
  gender: string;
  address: string;
  emergencyContact: string;
}

export type MemberFormErrors = Partial<Record<keyof MemberFormValues, string>>;

export const EMPTY_MEMBER_FORM: MemberFormValues = {
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  dateOfBirth: '',
  gender: '',
  address: '',
  emergencyContact: '',
};

/** Digits only, the form the phone column's CHECK constraint counts. */
export function countPhoneDigits(phone: string): number {
  return phone.replace(/\D/g, '').length;
}

function validateFirstName(value: string): string | undefined {
  if (value.trim() === '') return 'Enter the first name.';

  if (value.trim().length > 100) return 'First name must be at most 100 characters.';

  return undefined;
}

function validateLastName(value: string): string | undefined {
  if (value.trim() === '') return 'Enter the last name.';

  if (value.trim().length > 100) return 'Last name must be at most 100 characters.';

  return undefined;
}

function validatePhone(value: string): string | undefined {
  if (value.trim() === '') return 'Enter the phone number.';

  const digits = countPhoneDigits(value);

  if (digits < MIN_PHONE_DIGITS || digits > MAX_PHONE_DIGITS) {
    return `Phone number must contain ${MIN_PHONE_DIGITS}-${MAX_PHONE_DIGITS} digits.`;
  }

  return undefined;
}

function validateEmail(value: string): string | undefined {
  if (value.trim() === '') return undefined;

  if (!EMAIL_PATTERN.test(value.trim())) return 'Enter a valid email address.';

  return undefined;
}

function validateDateOfBirth(value: string): string | undefined {
  if (value.trim() === '') return undefined;

  // A date input yields YYYY-MM-DD; anything else came from somewhere else.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return 'Enter a valid date.';

  const parsed = new Date(`${value.trim()}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) return 'Enter a valid date.';

  if (value.trim() < EARLIEST_DATE_OF_BIRTH) {
    return 'Date of birth must be on or after 1900-01-01.';
  }

  const today = new Date().toISOString().slice(0, 10);

  if (value.trim() > today) return 'Date of birth must be in the past.';

  return undefined;
}

function validateLongText(value: string, label: string): string | undefined {
  if (value.trim() === '') return undefined;

  if (value.trim().length > 500) return `${label} must be at most 500 characters.`;

  return undefined;
}

/**
 * Validates the whole form.
 *
 * Every field is checked even after the first failure, so a form with several
 * problems reports them together instead of one per attempt.
 */
export function validateMemberForm(values: MemberFormValues): MemberFormErrors {
  const errors: MemberFormErrors = {};

  const firstName = validateFirstName(values.firstName);
  if (firstName !== undefined) errors.firstName = firstName;

  const lastName = validateLastName(values.lastName);
  if (lastName !== undefined) errors.lastName = lastName;

  const phone = validatePhone(values.phone);
  if (phone !== undefined) errors.phone = phone;

  const email = validateEmail(values.email);
  if (email !== undefined) errors.email = email;

  const dateOfBirth = validateDateOfBirth(values.dateOfBirth);
  if (dateOfBirth !== undefined) errors.dateOfBirth = dateOfBirth;

  const address = validateLongText(values.address, 'Address');
  if (address !== undefined) errors.address = address;

  const emergencyContact = validateLongText(values.emergencyContact, 'Emergency contact');
  if (emergencyContact !== undefined) errors.emergencyContact = emergencyContact;

  return errors;
}

/**
 * Checks an edit form has something to save.
 *
 * The API refuses a PATCH with no fields, so submitting an untouched form would
 * fail with a message about the request rather than one about the form.
 */
export function hasChanges(original: MemberFormValues, current: MemberFormValues): boolean {
  return (Object.keys(current) as (keyof MemberFormValues)[]).some(
    (key) => original[key] !== current[key],
  );
}