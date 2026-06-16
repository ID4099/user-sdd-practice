/**
 * RolesGuard coverage hardening spec.
 *
 * Supplements roles.guard.spec.ts with:
 *  - user with undefined role property (structurally different from null)
 *  - empty roles array on metadata (should allow access, same as undefined)
 *  - user with no role.name match across multiple required roles
 */

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { ADMIN_ROOT } from '../../roles/role.entity';

function buildMockContext(user: unknown): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard — coverage hardening', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('should throw ForbiddenException when user.role is undefined', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([ADMIN_ROOT]);
    const ctx = buildMockContext({ role: undefined });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should allow access when required roles array is empty', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);
    const ctx = buildMockContext({ role: { name: 'ANY' } });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should throw ForbiddenException when user role does not match any of multiple required roles', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([ADMIN_ROOT, 'SUPERUSER']);
    const ctx = buildMockContext({ role: { name: 'VIEWER' } });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
