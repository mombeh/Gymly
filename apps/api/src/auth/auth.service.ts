import { ConflictException, ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import {
  EMAIL_TAKEN_MESSAGE,
  INVALID_CREDENTIALS_MESSAGE,
  inactiveAccountMessage,
  toPublicUser,
  type AuthenticatedUser,
  type CurrentUserResponse,
  type LoginResponse,
} from './auth.types';
import { Prisma } from '../generated/prisma/client';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * Exchanges credentials for an access token.
   *
   * An unknown email and a wrong password produce the same status, the same
   * message, and a comparable amount of work, so the endpoint cannot be used to
   * discover which addresses are registered.
   */
  async login(dto: LoginDto): Promise<LoginResponse> {
    const email = dto.email.trim();
    const password = dto.password;

    // Email matching is case-insensitive: the schema enforces uniqueness on
    // lower(email), and Prisma's exact findUnique cannot use that index.
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });

    if (user === null) {
      await this.passwordService.simulateVerification(password);
      this.logger.warn(`Failed login for an unregistered address (${email.toLowerCase()}).`);

      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    const passwordMatches = await this.passwordService.verify(password, user.passwordHash);

    if (!passwordMatches) {
      this.logger.warn(`Failed login for ${user.email}: incorrect password.`);

      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    // Reached only with the correct password, so naming the reason here does
    // not leak whether an address exists.
    if (user.status !== 'ACTIVE') {
      this.logger.warn(`Rejected login for ${user.email}: account is ${user.status}.`);

      throw new ForbiddenException(inactiveAccountMessage(user.status));
    }

    const accessToken = await this.tokenService.issue({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.tokenService.expiresInSeconds,
      user: toPublicUser(user),
    };
  }

  /**
   * Creates an account and signs the new user in immediately.
   *
   * The response is the same LoginResponse shape as /auth/login, so the client
   * does not need a second round trip to reach the app after registering.
   *
   * Role and status are fixed here rather than taken from the request: role
   * access is not implemented yet, so every account is created as an active
   * MEMBER and authorisation is added in one later, reviewed change.
   */
  async register(dto: RegisterDto): Promise<LoginResponse> {
    // Trimming is mandatory, not cosmetic: the users table carries a CHECK
    // constraint rejecting stored addresses with surrounding whitespace.
    const email = dto.email.trim();

    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
    });

    if (existing !== null) {
      this.logger.warn(`Rejected registration for an already-registered address (${email.toLowerCase()}).`);

      throw new ConflictException(EMAIL_TAKEN_MESSAGE);
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    let user: Awaited<ReturnType<PrismaService['user']['create']>>;

    try {
      user = await this.prisma.user.create({
        data: {
          email,
          firstName: dto.firstName.trim(),
          lastName: dto.lastName.trim(),
          passwordHash,
          role: 'MEMBER',
          status: 'ACTIVE',
        },
      });
    } catch (error) {
      // The lower(email) unique index is the real arbiter. Two registrations
      // for one address can both pass the check above, so the constraint error
      // is translated rather than allowed to surface as a 500.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        this.logger.warn(`Rejected duplicate registration for (${email.toLowerCase()}).`);

        throw new ConflictException(EMAIL_TAKEN_MESSAGE);
      }

      throw error;
    }

    this.logger.log(`Registered a new account for (${email.toLowerCase()}).`);

    const accessToken = await this.tokenService.issue({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.tokenService.expiresInSeconds,
      user: toPublicUser(user),
    };
  }

  /**
   * Resolves the caller from the request identity.
   *
   * The row is re-read rather than served from the token, so a role change,
   * suspension or deletion takes effect immediately instead of at token expiry.
   */
  async currentUser(identity: AuthenticatedUser): Promise<CurrentUserResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: identity.sub } });

    if (user === null) {
      this.logger.warn(`Token referenced user ${identity.sub}, which no longer exists.`);

      throw new UnauthorizedException(INVALID_CREDENTIALS_MESSAGE);
    }

    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException(inactiveAccountMessage(user.status));
    }

    return { user: toPublicUser(user) };
  }
}
