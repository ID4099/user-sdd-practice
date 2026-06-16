import { Reflector } from '@nestjs/core';
import { Roles, ROLES_KEY } from './roles.decorator';

describe('Roles decorator', () => {
  it('should set metadata with ROLES_KEY when @Roles is applied to a handler', () => {
    const reflector = new Reflector();

    class TestController {
      @Roles('ADMIN_ROOT')
      testHandler() {}
    }

    const metadata = reflector.get<string[]>(
      ROLES_KEY,
      TestController.prototype.testHandler,
    );
    expect(metadata).toEqual(['ADMIN_ROOT']);
  });

  it('should support multiple roles in metadata', () => {
    const reflector = new Reflector();

    class TestController {
      @Roles('ADMIN_ROOT', 'EDITOR')
      multiRoleHandler() {}
    }

    const metadata = reflector.get<string[]>(
      ROLES_KEY,
      TestController.prototype.multiRoleHandler,
    );
    expect(metadata).toEqual(['ADMIN_ROOT', 'EDITOR']);
  });
});
