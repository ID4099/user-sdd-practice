import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { User } from '../users/user.entity';

// Mock ConfigService
const mockConfigService = {
  get: jest.fn().mockReturnValue('test-secret'),
};

// Mock UsersRepository
const mockUsersRepo = {
  findOne: jest.fn(),
};

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    strategy = new JwtStrategy(
      mockConfigService as any,
      mockUsersRepo as any,
    );
    jest.clearAllMocks();
  });

  it('should return the active user when the payload is valid and user exists', async () => {
    const user: Partial<User> = {
      id: 'uuid-1',
      email: 'admin@example.com',
      deletedAt: null,
      role: { name: 'ADMIN_ROOT' } as any,
    };
    mockUsersRepo.findOne.mockResolvedValue(user);

    const result = await strategy.validate({ sub: 'uuid-1', email: 'admin@example.com', role: 'ADMIN_ROOT' });
    expect(result).toEqual(user);
    expect(mockUsersRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'uuid-1' },
      withDeleted: true,
    });
  });

  it('should throw UnauthorizedException when user does not exist', async () => {
    mockUsersRepo.findOne.mockResolvedValue(null);

    await expect(
      strategy.validate({ sub: 'non-existent', email: 'x@x.com', role: 'ADMIN_ROOT' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when user has deletedAt populated (soft-deleted / deactivated)', async () => {
    const deactivatedUser: Partial<User> = {
      id: 'uuid-2',
      email: 'banned@example.com',
      deletedAt: new Date('2024-01-01'),
      role: { name: 'ADMIN_ROOT' } as any,
    };
    mockUsersRepo.findOne.mockResolvedValue(deactivatedUser);

    await expect(
      strategy.validate({ sub: 'uuid-2', email: 'banned@example.com', role: 'ADMIN_ROOT' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
