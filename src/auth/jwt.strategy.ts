import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';

/** Shape of the JWT access token payload. */
export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

/**
 * Passport JWT strategy for access-token validation.
 *
 * Token extraction: reads from the 'accessToken' httpOnly cookie.
 * State check: re-queries the database on every request so that a
 * deactivated (soft-deleted) user is rejected immediately — even if
 * their token has not yet expired.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {
    super({
      // Read token from cookie, falling back to Authorization Bearer header
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => request?.cookies?.accessToken ?? null,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'fallback-secret'),
    });
  }

  /**
   * Called by Passport after signature + expiry verification.
   * Re-queries DB to enforce immediate revocation on deactivation.
   */
  async validate(payload: JwtPayload): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id: payload.sub },
      withDeleted: true,
    });

    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    if (user.deletedAt !== null) {
      throw new UnauthorizedException('User account has been deactivated.');
    }

    return user;
  }
}
