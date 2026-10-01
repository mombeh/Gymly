import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type {
  AuthenticatedUser,
  CurrentUserResponse,
  LoginResponse,
} from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** POST /api/auth/login */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<LoginResponse> {
    return this.authService.login(dto);
  }

  /** GET /api/auth/me */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  currentUser(@CurrentUser() user: AuthenticatedUser): Promise<CurrentUserResponse> {
    return this.authService.currentUser(user);
  }
}
