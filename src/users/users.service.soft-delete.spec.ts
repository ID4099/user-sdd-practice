import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './user.entity';
import { Role } from '../roles/role.entity';
import { ADMIN_ROOT } from '../roles/role.entity';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockUsersRepo = {
  findOne: jest.fn(),
  softDelete: jest.fn(),
  restore: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  findAndCount: jest.fn(),
};

const mockRolesRepo = {
  findOne: jest.fn(),
};

const callOrder: string[] = [];

const mockAuthService = {
  revokeAllSessionsForUser: jest.fn().mockImplementation(async () => {
    callOrder.push('revokeAllSessionsForUser');
  }),
};

function makeUser(overrides: Partial<User> = {}): User {
  const u = new User();
  u.id = 'user-uuid';
  u.email = 'test@example.com';
  u.password = '$2b$10$hashed';
  u.role = { id: 'role-uuid', name: ADMIN_ROOT } as Role;
  u.deletedAt = null;
  return Object.assign(u, overrides);
}

// ─── Tests: soft-delete + session revocation contract ────────────────────────

describe('UsersService — soft-delete + session revocation contract', () => {
  let service: UsersService;

  beforeEach(() => {
    jest.resetAllMocks();
    callOrder.length = 0;
    // Re-apply the order tracker after resetAllMocks
    mockAuthService.revokeAllSessionsForUser.mockImplementation(async () => {
      callOrder.push('revokeAllSessionsForUser');
    });
    mockUsersRepo.softDelete.mockImplementation(async () => {
      callOrder.push('softDelete');
      return { affected: 1 };
    });

    service = new UsersService(
      mockUsersRepo as any,
      mockRolesRepo as any,
      mockAuthService as any,
    );
  });

  it('calls softDelete and revokeAllSessionsForUser when removing a user', async () => {
    mockUsersRepo.findOne.mockResolvedValue(makeUser());

    await service.remove('user-uuid');

    expect(mockUsersRepo.softDelete).toHaveBeenCalledWith('user-uuid');
    expect(mockAuthService.revokeAllSessionsForUser).toHaveBeenCalledWith(
      'user-uuid',
    );
  });

  it('calls softDelete BEFORE revokeAllSessionsForUser (order contract)', async () => {
    mockUsersRepo.findOne.mockResolvedValue(makeUser());

    await service.remove('user-uuid');

    expect(callOrder[0]).toBe('softDelete');
    expect(callOrder[1]).toBe('revokeAllSessionsForUser');
  });

  it('does NOT call revokeAllSessionsForUser when user is not found', async () => {
    mockUsersRepo.findOne.mockResolvedValue(null);

    await expect(service.remove('nonexistent')).rejects.toThrow(
      NotFoundException,
    );
    expect(mockAuthService.revokeAllSessionsForUser).not.toHaveBeenCalled();
  });

  // ── restore contract ──────────────────────────────────────────────────────

  it('calls restore on the correct user id', async () => {
    const deletedUser = makeUser({ deletedAt: new Date() });
    const restoredUser = makeUser({ deletedAt: null });

    mockUsersRepo.findOne
      .mockResolvedValueOnce(deletedUser)
      .mockResolvedValueOnce(restoredUser);
    mockUsersRepo.restore.mockResolvedValue({ affected: 1 });

    await service.reactivate('user-uuid');

    expect(mockUsersRepo.restore).toHaveBeenCalledWith('user-uuid');
  });

  it('does NOT call revokeAllSessionsForUser during reactivation', async () => {
    const deletedUser = makeUser({ deletedAt: new Date() });
    const restoredUser = makeUser({ deletedAt: null });

    mockUsersRepo.findOne
      .mockResolvedValueOnce(deletedUser)
      .mockResolvedValueOnce(restoredUser);
    mockUsersRepo.restore.mockResolvedValue({ affected: 1 });

    await service.reactivate('user-uuid');

    expect(mockAuthService.revokeAllSessionsForUser).not.toHaveBeenCalled();
  });
});
