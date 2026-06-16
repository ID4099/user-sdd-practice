import { SetMetadata } from '@nestjs/common';

/** Metadata key used by RolesGuard to read the required roles. */
export const ROLES_KEY = 'roles';

/**
 * Decorator that attaches required roles to a route handler or controller.
 * Read by RolesGuard to enforce role-based access control.
 *
 * @example
 *   @Roles(ADMIN_ROOT)
 *   @Get()
 *   findAll() {}
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
