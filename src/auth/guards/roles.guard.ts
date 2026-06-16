import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Guard that enforces role-based access control.
 *
 * Reads the required roles from the @Roles() decorator metadata.
 * If no roles are required, access is allowed unconditionally.
 * If roles are required, the authenticated user's role.name must match at least one.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No roles required → allow all authenticated requests
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    const userRoleName: string | undefined = user?.role?.name;

    if (!userRoleName || !requiredRoles.includes(userRoleName)) {
      throw new ForbiddenException(
        'You do not have the required role to access this resource.',
      );
    }

    return true;
  }
}
