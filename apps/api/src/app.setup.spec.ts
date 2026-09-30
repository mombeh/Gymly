import { BadRequestException, ValidationPipe, type ArgumentMetadata } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsEmail, IsInt, IsString, Min, MinLength } from 'class-validator';
import { validationPipeOptions } from './app.setup';

/**
 * Stand-in for a future member/user DTO. Lives in the spec so the production
 * prefix/CORS/filter setup is verified without creating a business module.
 */
class SampleDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsEmail()
  email!: string;

  @Type(() => Number)
  @IsInt()
  @Min(18)
  age!: number;
}

const bodyMetadata: ArgumentMetadata = { type: 'body', metatype: SampleDto, data: '' };

describe('global validation pipe', () => {
  // Built from the same exported options the application uses.
  const pipe = new ValidationPipe(validationPipeOptions);

  it('accepts a valid payload', async () => {
    const result = await pipe.transform(
      { name: 'Grace', email: 'grace@gymly.test', age: 30 },
      bodyMetadata,
    );

    expect(result).toEqual({ name: 'Grace', email: 'grace@gymly.test', age: 30 });
  });

  it('rejects a malformed email', async () => {
    await expect(pipe.transform({ name: 'Grace', email: 'nope', age: 30 }, bodyMetadata)).rejects.toThrow();
  });

  it('rejects a value below the declared minimum', async () => {
    await expect(
      pipe.transform({ name: 'Grace', email: 'grace@gymly.test', age: 12 }, bodyMetadata),
    ).rejects.toThrow();
  });

  it('rejects a missing required field', async () => {
    await expect(
      pipe.transform({ email: 'grace@gymly.test', age: 30 }, bodyMetadata),
    ).rejects.toThrow();
  });

  it('rejects unknown properties rather than silently dropping them', async () => {
    const error = await pipe
      .transform(
        { name: 'Grace', email: 'grace@gymly.test', age: 30, isAdmin: true },
        bodyMetadata,
      )
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(BadRequestException);

    // The per-field detail lives on the exception response, not on .message.
    const payload = (error as BadRequestException).getResponse() as { message: string[] };

    expect(payload.message.join(' ')).toMatch(/isAdmin/);
  });

  it('enforces the configured options', () => {
    expect(validationPipeOptions.whitelist).toBe(true);
    expect(validationPipeOptions.forbidNonWhitelisted).toBe(true);
    expect(validationPipeOptions.transform).toBe(true);
  });
});
