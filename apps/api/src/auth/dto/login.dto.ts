import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(320, { message: 'email must be at most 320 characters' })
  email!: string;

  @IsString({ message: 'password must be a string' })
  @MinLength(1, { message: 'password must not be empty' })
  // bcrypt only considers the first 72 bytes, so the ceiling is stated here
  // instead of letting a longer passphrase be silently truncated.
  @MaxLength(200, { message: 'password must be at most 200 characters' })
  password!: string;
}
