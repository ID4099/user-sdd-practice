import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { ADMIN_ROOT } from '../../roles/role.entity';

function buildMockContext(user: unknown, handler: unknown = {}): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('should allow access when no roles metadata is set', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const ctx = buildMockContext({ role: { name: 'ANY' } });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow access when user has the required ADMIN_ROOT role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([ADMIN_ROOT]);
    const ctx = buildMockContext({ role: { name: ADMIN_ROOT } });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should throw ForbiddenException when user lacks required role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([ADMIN_ROOT]);
    const ctx = buildMockContext({ role: { name: 'USER' } });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when user has no role at all', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([ADMIN_ROOT]);
    const ctx = buildMockContext({ role: null });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should check ROLES_KEY metadata against correct reflector key', () => {
    const spy = jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(undefined);
    const handler = {};
    const ctx = buildMockContext({ role: { name: ADMIN_ROOT } }, handler);
    guard.canActivate(ctx);
    expect(spy).toHaveBeenCalledWith(ROLES_KEY, expect.any(Array));
  });
});
