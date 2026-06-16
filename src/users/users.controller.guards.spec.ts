import 'reflect-metadata';
import { UsersController } from './users.controller';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { ADMIN_ROOT } from '../roles/role.entity';
import { GUARDS_METADATA } from '@nestjs/common/constants';

describe('UsersController — Guard and Role metadata', () => {
  it('has JwtAuthGuard applied at controller level', () => {
    const guards: any[] = Reflect.getMetadata(
      GUARDS_METADATA,
      UsersController,
    );
    const guardNames = (guards ?? []).map((g: any) =>
      typeof g === 'function' ? g.name : g?.constructor?.name,
    );
    expect(guardNames).toContain('JwtAuthGuard');
  });

  it('has RolesGuard applied at controller level', () => {
    const guards: any[] = Reflect.getMetadata(
      GUARDS_METADATA,
      UsersController,
    );
    const guardNames = (guards ?? []).map((g: any) =>
      typeof g === 'function' ? g.name : g?.constructor?.name,
    );
    expect(guardNames).toContain('RolesGuard');
  });

  it('requires ADMIN_ROOT role on the controller', () => {
    const roles: string[] = Reflect.getMetadata(ROLES_KEY, UsersController);
    expect(roles).toBeDefined();
    expect(roles).toContain(ADMIN_ROOT);
  });

  it('ADMIN_ROOT value is the canonical string "ADMIN_ROOT"', () => {
    // Guards against accidental value change in role.entity.ts
    expect(ADMIN_ROOT).toBe('ADMIN_ROOT');
  });
});
