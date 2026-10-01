import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Body of POST /api/auth/register.
 *
 * Role and status are deliberately absent. The global ValidationPipe runs with
 * forbidNonWhitelisted, so a caller who sends them is rejected outright rather
 * than being able to grant themselves an owner account.
 */
export class RegisterDto {
  @IsString({ message: 'firstName must be a string' })
  @MinLength(1, { message: 'firstName must not be empty' })
  @MaxLength(100, { message: 'firstName must be at most 100 characters' })
  firstName!: string;

  @IsString({ message: 'lastName must be a string' })
  @MinLength(1, { message: 'lastName must not be empty' })
  @MaxLength(100, { message: 'lastName must be at most 100 characters' })
  lastName!: string;

  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(320, { message: 'email must be at most 320 characters' })
  email!: string;

  // Registration is where strength can be demanded; login only checks that a
  // password was supplied, so existing accounts are never locked out by a new rule.
  @IsString({ message: 'password must be a string' })
  @MinLength(8, { message: 'password must be at least 8 characters' })
  @MaxLength(200, { message: 'password must be at most 200 characters' })
  password!: string;
}