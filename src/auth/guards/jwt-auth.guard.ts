import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard that validates the JWT access token from the httpOnly cookie.
 *
 * Delegates signature verification to the 'jwt' Passport strategy.
 * Throws UnauthorizedException on any failure so clients receive a clean 401.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const result = await super.canActivate(context);
      if (!result) {
        throw new UnauthorizedException('Authentication required.');
      }
      return true;
    } catch (error) {
      throw new UnauthorizedException('Authentication required.');
    }
  }
}
