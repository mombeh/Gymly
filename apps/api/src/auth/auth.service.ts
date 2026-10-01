import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { LoginDto } from './dto/login.dto';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import {
  INVALID_CREDENTIALS_MESSAGE,
  toPublicUser,
  type AuthenticatedUser,
  type CurrentUserResponse,
  type LoginResponse,
} from './auth.types';

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

      throw new ForbiddenException(
        `This account is ${user.status.toLowerCase()}. Contact an owner to reactivate it.`,
      );
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
      throw new ForbiddenException(
        `This account is ${user.status.toLowerCase()}. Contact an owner to reactivate it.`,
      );
    }

    return { user: toPublicUser(user) };
  }
}
