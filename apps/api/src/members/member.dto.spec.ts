import { ValidationPipe } from '@nestjs/common';
import {
  PHONE_MAX_LENGTH,
  countPhoneDigits,
  isValidPhoneNumber,
} from './phone.validator';
import { CreateMemberDto, UpdateMemberDto } from './dto/member.dto';
import { ListMembersQueryDto, MAX_LIMIT } from './dto/list-members-query.dto';

/**
 * The same pipe the application uses, so these assertions describe production
 * behaviour rather than a hand-rolled validation call.
 */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: false },
});

async function validate<T>(
  metatype: new () => T,
  payload: Record<string, unknown>,
): Promise<{ value?: T; errors: string[] }> {
  try {
    const value = await pipe.transform(payload, { type: 'body', metatype });

    return { value, errors: [] };
  } catch (error) {
    const response = (error as { getResponse?: () => { message?: string[] } }).getResponse?.();

    return { errors: response?.message ?? [String(error)] };
  }
}

const validMember = {
  firstName: 'Grace',
  lastName: 'Wanjiku',
  phone: '+254712345678',
};

describe('phone validation', () => {
  it.each([
    ['0712345678'],
    ['+254712345678'],
    ['+254 712 345 678'],
    ['(0712) 345-678'],
    ['7123456'],
    ['123456789012345'],
  ])('accepts %s', (phone) => {
    expect(isValidPhoneNumber(phone)).toBe(true);
  });

  it.each([
    ['too few digits', '071234'],
    ['too many digits', '1234567890123456'],
    ['letters only', 'call-me'],
    ['an empty string', ''],
    ['a number', 712345678],
    ['an object', { number: '0712345678' }],
  ])('rejects %s', (_label, phone) => {
    expect(isValidPhoneNumber(phone)).toBe(false);
  });

  it('rejects a phone longer than the column, however few digits it has', () => {
    expect(isValidPhoneNumber(`0712345678${' '.repeat(PHONE_MAX_LENGTH)}`)).toBe(false);
  });

  it('counts only digits, which is what the database index compares', () => {
    expect(countPhoneDigits('+254 (712) 345-678')).toBe(12);
  });
});

describe('CreateMemberDto', () => {
  it('accepts a member with only the required fields', async () => {
    const { value, errors } = await validate(CreateMemberDto, { ...validMember });

    expect(errors).toEqual([]);
    expect(value).toMatchObject(validMember);
  });

  it('accepts every optional field', async () => {
    const { errors } = await validate(CreateMemberDto, {
      ...validMember,
      email: 'grace.wanjiku@gymly.test',
      dateOfBirth: '1995-06-15',
      gender: 'FEMALE',
      address: '12 Kenyatta Avenue, Nairobi',
      emergencyContact: 'Peter Wanjiku, +254722000111',
    });

    expect(errors).toEqual([]);
  });

  it('trims the text fields', async () => {
    const { value } = await validate(CreateMemberDto, {
      firstName: '  Grace  ',
      lastName: ' Wanjiku ',
      phone: '  +254712345678  ',
    });

    expect(value).toMatchObject({
      firstName: 'Grace',
      lastName: 'Wanjiku',
      phone: '+254712345678',
    });
  });

  it.each([
    ['firstName', 'lastName'],
    ['lastName', 'phone'],
  ])('requires %s', async (missing) => {
    const payload: Record<string, unknown> = { ...validMember };
    delete payload[missing];

    const { errors } = await validate(CreateMemberDto, payload);

    expect(errors.join(' ')).toContain(missing);
  });

  it('rejects a blank required name rather than storing whitespace', async () => {
    const { errors } = await validate(CreateMemberDto, { ...validMember, firstName: '   ' });

    expect(errors.join(' ')).toContain('firstName');
  });

  it.each([
    ['an invalid format', 'not-an-email'],
    ['no domain', 'grace@'],
    ['no local part', '@gymly.test'],
  ])('rejects an email with %s', async (_label, email) => {
    const { errors } = await validate(CreateMemberDto, { ...validMember, email });

    expect(errors.join(' ')).toContain('email');
  });

  it('accepts a missing email, because it is optional', async () => {
    const { errors } = await validate(CreateMemberDto, { ...validMember, email: undefined });

    expect(errors).toEqual([]);
  });

  it.each([
    ['a string that is not a date', 'the nineties'],
    ['a future date', '2099-01-01'],
    ['an implausibly old date', '1899-12-31'],
  ])('rejects a date of birth that is %s', async (_label, dateOfBirth) => {
    const { errors } = await validate(CreateMemberDto, { ...validMember, dateOfBirth });

    expect(errors.join(' ')).toContain('dateOfBirth');
  });

  it('rejects a gender outside the enum', async () => {
    const { errors } = await validate(CreateMemberDto, { ...validMember, gender: 'ROBOT' });

    expect(errors.join(' ')).toContain('gender');
  });

  it.each([
    ['firstName', 42],
    ['lastName', { value: 'Wanjiku' }],
    ['phone', 712345678],
    ['email', ['grace@gymly.test']],
    ['address', 12],
  ])('rejects %s supplied as the wrong type', async (field, value) => {
    const { errors } = await validate(CreateMemberDto, { ...validMember, [field]: value });

    expect(errors.join(' ')).toContain(field);
  });

  it('rejects a blank optional string, keeping NULL distinct from empty', async () => {
    const { errors } = await validate(CreateMemberDto, { ...validMember, address: '   ' });

    expect(errors.join(' ')).toContain('address');
  });

  it('refuses a client-supplied memberCode', async () => {
    const { errors } = await validate(CreateMemberDto, {
      ...validMember,
      memberCode: 'GYM-000123',
    });

    expect(errors.join(' ')).toContain('memberCode');
  });

  it('refuses a client-supplied status', async () => {
    const { errors } = await validate(CreateMemberDto, { ...validMember, status: 'ACTIVE' });

    expect(errors.join(' ')).toContain('status');
  });

  it('refuses an attempt to set the primary key', async () => {
    const { errors } = await validate(CreateMemberDto, {
      ...validMember,
      id: 'e1f2a3b4-0000-4000-8000-000000000009',
    });

    expect(errors.join(' ')).toContain('id');
  });
});

describe('UpdateMemberDto', () => {
  it('accepts an empty body, which the service then refuses as a no-op', async () => {
    // Validation cannot know whether the service has a rule about emptiness;
    // the meaningful check is that nothing here rejects it, so the rule lives in
    // one place.
    const { errors } = await validate(UpdateMemberDto, {});

    expect(errors).toEqual([]);
  });

  it('accepts a single changed field', async () => {
    const { value, errors } = await validate(UpdateMemberDto, { lastName: 'Wanjiru' });

    expect(errors).toEqual([]);
    expect(value).toMatchObject({ lastName: 'Wanjiru' });
  });

  it('leaves out fields the client did not send', async () => {
    const { value } = await validate(UpdateMemberDto, { firstName: 'Gracie' });

    // Only the sent key is an own property, which is how the service tells an
    // absent field from one set to null.
    expect(Object.keys(value ?? {})).toEqual(['firstName']);
  });

  it('carries an explicit null through, so an optional field can be cleared', async () => {
    const { value } = await validate(UpdateMemberDto, { address: null });

    expect(Object.keys(value ?? {})).toEqual(['address']);
    expect(value?.address).toBeNull();
  });

  it('refuses to clear a field the database requires', async () => {
    const { errors } = await validate(UpdateMemberDto, { phone: null });

    expect(errors.join(' ')).toContain('phone');
  });

  it('refuses a null name, which would violate the column', async () => {
    const { errors } = await validate(UpdateMemberDto, { firstName: null });

    expect(errors.join(' ')).toContain('firstName');
  });

  it.each([
    ['an invalid phone', { phone: '123' }],
    ['a blank name', { lastName: '  ' }],
    ['an invalid email', { email: 'nope' }],
    ['a future date of birth', { dateOfBirth: '2099-01-01' }],
    ['an unknown gender', { gender: 'ROBOT' }],
  ])('applies the same rules as create: rejects %s', async (_label, payload) => {
    const { errors } = await validate(UpdateMemberDto, payload);

    expect(errors.length).toBeGreaterThan(0);
  });

  it('still refuses a client-supplied memberCode', async () => {
    const { errors } = await validate(UpdateMemberDto, { memberCode: 'GYM-000500' });

    expect(errors.join(' ')).toContain('memberCode');
  });

  it('still refuses a client-supplied status, so status changes go through deactivate', async () => {
    const { errors } = await validate(UpdateMemberDto, { status: 'INACTIVE' });

    expect(errors.join(' ')).toContain('status');
  });
});

describe('ListMembersQueryDto', () => {
  it('defaults when nothing is supplied', async () => {
    const { value, errors } = await validate(ListMembersQueryDto, {});

    expect(errors).toEqual([]);
    expect(value).toEqual({});
  });

  it('coerces page and limit from the query string', async () => {
    // Query parameters arrive as text and implicit conversion is off by design,
    // so the DTO declares the coercion.
    const { value, errors } = await validate(ListMembersQueryDto, { page: '2', limit: '10' });

    expect(errors).toEqual([]);
    expect(value).toEqual({ page: 2, limit: 10 });
  });

  it.each([
    ['a non-numeric page', { page: 'first' }],
    ['a zero page', { page: '0' }],
    ['a zero limit', { limit: '0' }],
    ['a limit beyond the cap', { limit: String(MAX_LIMIT + 1) }],
  ])('rejects %s', async (_label, payload) => {
    const { errors } = await validate(ListMembersQueryDto, payload);

    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a status outside the enum', async () => {
    const { errors } = await validate(ListMembersQueryDto, { status: 'RETIRED' });

    expect(errors.join(' ')).toContain('status');
  });

  it('rejects a blank search term, which would match everything', async () => {
    const { errors } = await validate(ListMembersQueryDto, { q: '   ' });

    expect(errors.join(' ')).toContain('q');
  });

  it('rejects an unknown parameter', async () => {
    const { errors } = await validate(ListMembersQueryDto, { orderBy: 'passwordHash' });

    expect(errors.join(' ')).toContain('orderBy');
  });
});