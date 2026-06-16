import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

// Minimal AuthGuard factory mock
const mockSuperCanActivate = jest.fn();

jest.mock('@nestjs/passport', () => ({
  AuthGuard: () => {
    return class {
      canActivate(ctx: ExecutionContext) {
        return mockSuperCanActivate(ctx);
      }
    };
  },
}));

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  beforeEach(() => {
    guard = new JwtAuthGuard();
    mockSuperCanActivate.mockReset();
  });

  it('should allow the request when the JWT is valid', async () => {
    mockSuperCanActivate.mockResolvedValue(true);
    const ctx = {} as ExecutionContext;
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('should throw UnauthorizedException when JWT validation fails', async () => {
    mockSuperCanActivate.mockRejectedValue(new Error('jwt expired'));
    const ctx = {} as ExecutionContext;
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when super returns false', async () => {
    mockSuperCanActivate.mockResolvedValue(false);
    const ctx = {} as ExecutionContext;
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });
});
