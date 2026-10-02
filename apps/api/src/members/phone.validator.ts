import { registerDecorator, isString, type ValidationOptions } from 'class-validator';

/** E.164 caps a subscriber number at 15 digits. */
const MIN_DIGITS = 7;
const MAX_DIGITS = 15;

/** Column width, mirrored from the schema so an oversized value fails as 400. */
export const PHONE_MAX_LENGTH = 32;

/**
 * The same reduction the database's members_phone_digits_key index performs:
 * strip everything that is not a digit, then require 7-15 of them.
 *
 * Writing the rule once here and once in SQL keeps the two in step by
 * construction: this function is what decides whether a request is worth
 * sending, the index is what guarantees it under concurrency.
 */
export function countPhoneDigits(value: string): number {
  return value.replace(/\D/g, '').length;
}

export function isValidPhoneNumber(value: unknown): boolean {
  if (!isString(value)) {
    return false;
  }

  if (value.length === 0 || value.length > PHONE_MAX_LENGTH) {
    return false;
  }

  const digits = countPhoneDigits(value);

  return digits >= MIN_DIGITS && digits <= MAX_DIGITS;
}

/**
 * A phone number as the members module accepts it.
 *
 * Formatting is preserved exactly as entered, because reception staff read
 * these back to members and normalising the display form is not this module's
 * decision to make. Only the digits are validated.
 */
export function IsMemberPhone(validationOptions?: ValidationOptions): PropertyDecorator {
  return function decorate(target: object, propertyKey: string | symbol): void {
    registerDecorator({
      name: 'isMemberPhone',
      target: target.constructor,
      propertyName: propertyKey.toString(),
      options: validationOptions,
      validator: {
        validate: (value: unknown): boolean => isValidPhoneNumber(value),
        defaultMessage: () => `phone must contain ${MIN_DIGITS}-${MAX_DIGITS} digits`,
      },
    });
  };
}