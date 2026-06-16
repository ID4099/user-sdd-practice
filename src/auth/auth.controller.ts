import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LoginDto } from './dto/login.dto';

/** Cookie options shared by both access and refresh token cookies. */
const COOKIE_DEFAULTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
};

/**
 * Handles authentication endpoints:
 *  POST /auth/login   — 200 on success; 401 invalid creds; 403 deactivated user
 *  POST /auth/refresh — 200 on success; 401 missing/expired/consumed/revoked token
 *  POST /auth/logout  — 200 always (idempotent); requires valid access token (JwtAuthGuard)
 *
 * HTTP code alignment with specs:
 *  - user-auth/login:   200 | 401 | 403
 *  - user-auth/refresh: 200 | 401
 *  - user-auth/logout:  200
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ── POST /auth/login ───────────────────────────────────────────────────────

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Res() res: Response,
  ): Promise<void> {
    const { accessToken, refreshToken } = await this.authService.login(
      loginDto.email,
      loginDto.password,
    );

    this.setTokenCookies(res, accessToken, refreshToken);
    res.json({ message: 'Login successful.' });
  }

  // ── POST /auth/refresh ─────────────────────────────────────────────────────
  //
  // Note: this endpoint intentionally does NOT require a JwtAuthGuard.
  // The access token is typically expired when a refresh is attempted.
  // userId is read from req.user (populated by a guard), which will be
  // undefined when the access token is absent or expired. AuthService.refresh
  // handles this safely: undefined userId → no session found → 401.
  // HTTP alignment: 200 (success), 401 (missing/invalid/expired/consumed token).

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res() res: Response): Promise<void> {
    const plainRefreshToken: string | undefined = req.cookies?.refreshToken;
    if (!plainRefreshToken) {
      throw new UnauthorizedException('Refresh token not provided.');
    }

    const userId = (req.user as any)?.id;
    const { accessToken, refreshToken } = await this.authService.refresh(
      userId,
      plainRefreshToken,
    );

    this.setTokenCookies(res, accessToken, refreshToken);
    res.json({ message: 'Tokens refreshed.' });
  }

  // ── POST /auth/logout ──────────────────────────────────────────────────────

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res() res: Response): Promise<void> {
    const plainRefreshToken: string | undefined = req.cookies?.refreshToken;
    const userId = (req.user as any)?.id;

    if (plainRefreshToken && userId) {
      await this.authService.logout(userId, plainRefreshToken);
    }

    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    res.json({ message: 'Logged out successfully.' });
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private setTokenCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ): void {
    res.cookie('accessToken', accessToken, {
      ...COOKIE_DEFAULTS,
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    res.cookie('refreshToken', refreshToken, {
      ...COOKIE_DEFAULTS,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  }
}
