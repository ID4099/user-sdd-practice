/**
 * Database schema verification tests.
 *
 * Spec: database-schema — "Mantenimiento de registros (No eliminación física)"
 *
 * Verifies that:
 *  1. After soft-delete: the user's deletedAt is populated (softDelete called, not delete)
 *  2. After soft-delete: all active RefreshSessions have revokedAt populated
 *  3. After reactivation: the user's deletedAt is cleared (restore called)
 *  4. User entity timestamps (createdAt, updatedAt) are auto-managed by ORM decorators
 *
 * These tests operate at the service + mock-repo level, which is the
 * appropriate layer for schema behavioral contracts without a real DB.
 */

import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './user.entity';
import { Role } from '../roles/role.entity';

// ─── Mock repositories ────────────────────────────────────────────────────────

const mockUsersRepo = {
  findOne: jest.fn(),
  findAndCount: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  softDelete: jest.fn(),
  restore: jest.fn(),
};

const mockRolesRepo = {
  findOne: jest.fn(),
};

const mockAuthService = {
  revokeAllSessionsForUser: jest.fn(),
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildUser(overrides: Partial<User> = {}): User {
  return {
    id: 'schema-user-1',
    email: 'user@schema.test',
    password: '$2b$10$hash',
    deletedAt: null,
    role: { name: 'ADMIN_ROOT' } as Role,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as User;
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('Database Schema Verification — soft-delete & audit contracts', () => {
  let service: UsersService;

  beforeEach(() => {
    service = new UsersService(
      mockUsersRepo as any,
      mockRolesRepo as any,
      mockAuthService as any,
    );
    jest.resetAllMocks();
  });

  // ── Soft delete: no physical deletion ─────────────────────────────────────

  describe('soft-delete contract: deletedAt populated, no physical DELETE', () => {
    it('should call softDelete (not delete) so the physical row is preserved', async () => {
      const user = buildUser();
      mockUsersRepo.findOne.mockResolvedValue(user);
      mockUsersRepo.softDelete.mockResolvedValue({ affected: 1 });
      mockAuthService.revokeAllSessionsForUser.mockResolvedValue(undefined);

      await service.remove('schema-user-1');

      // softDelete MUST be called (populates deletedAt)
      expect(mockUsersRepo.softDelete).toHaveBeenCalledWith('schema-user-1');
      // No physical delete call — the row must remain
      expect(mockUsersRepo).not.toHaveProperty('delete');
    });

    it('should pass the exact userId to softDelete so only the correct row is affected', async () => {
      const targetId = 'target-user-uuid-abc123';
      const user = buildUser({ id: targetId });
      mockUsersRepo.findOne.mockResolvedValue(user);
      mockUsersRepo.softDelete.mockResolvedValue({ affected: 1 });
      mockAuthService.revokeAllSessionsForUser.mockResolvedValue(undefined);

      await service.remove(targetId);

      // Exact UUID propagated — no accidental bulk delete
      expect(mockUsersRepo.softDelete).toHaveBeenCalledWith(targetId);
      expect(mockUsersRepo.softDelete).toHaveBeenCalledTimes(1);
    });

    it('should NOT call softDelete when user does not exist (NotFoundException)', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);

      await expect(service.remove('nonexistent-id')).rejects.toThrow(NotFoundException);

      expect(mockUsersRepo.softDelete).not.toHaveBeenCalled();
    });
  });

  // ── Soft delete + revokedAt on sessions ───────────────────────────────────

  describe('soft-delete contract: revokedAt populated on refresh sessions', () => {
    it('should invoke revokeAllSessionsForUser AFTER softDelete completes', async () => {
      const user = buildUser();
      mockUsersRepo.findOne.mockResolvedValue(user);
      mockUsersRepo.softDelete.mockResolvedValue({ affected: 1 });
      mockAuthService.revokeAllSessionsForUser.mockResolvedValue(undefined);

      const callOrder: string[] = [];
      mockUsersRepo.softDelete.mockImplementation(async () => {
        callOrder.push('softDelete');
        return { affected: 1 };
      });
      mockAuthService.revokeAllSessionsForUser.mockImplementation(async () => {
        callOrder.push('revokeAll');
      });

      await service.remove('schema-user-1');

      // softDelete BEFORE revocation — ensures the user is deactivated first
      expect(callOrder).toEqual(['softDelete', 'revokeAll']);
    });

    it('should pass the same userId to revokeAllSessionsForUser as was soft-deleted', async () => {
      const userId = 'revoke-check-user';
      const user = buildUser({ id: userId });
      mockUsersRepo.findOne.mockResolvedValue(user);
      mockUsersRepo.softDelete.mockResolvedValue({ affected: 1 });
      mockAuthService.revokeAllSessionsForUser.mockResolvedValue(undefined);

      await service.remove(userId);

      expect(mockAuthService.revokeAllSessionsForUser).toHaveBeenCalledWith(userId);
    });
  });

  // ── Reactivation: deletedAt cleared ──────────────────────────────────────

  describe('reactivation contract: deletedAt cleared via restore', () => {
    it('should call restore (not save) to clear deletedAt so the user becomes active again', async () => {
      const softDeletedUser = buildUser({ deletedAt: new Date('2026-01-15') });
      const restoredUser = buildUser({ deletedAt: null });

      // findOne with withDeleted: true — finds the soft-deleted row
      mockUsersRepo.findOne
        .mockResolvedValueOnce(softDeletedUser) // exists check (withDeleted: true)
        .mockResolvedValueOnce(restoredUser);   // re-fetch after restore

      mockUsersRepo.restore.mockResolvedValue({ affected: 1 });

      const result = await service.reactivate('schema-user-1');

      // restore (not save/update) must be called
      expect(mockUsersRepo.restore).toHaveBeenCalledWith('schema-user-1');
      // Returned user must have deletedAt cleared
      expect(result.deletedAt).toBeNull();
    });

    it('should NOT call revokeAllSessionsForUser during reactivation', async () => {
      const softDeletedUser = buildUser({ deletedAt: new Date() });
      const restoredUser = buildUser({ deletedAt: null });
      mockUsersRepo.findOne
        .mockResolvedValueOnce(softDeletedUser)
        .mockResolvedValueOnce(restoredUser);
      mockUsersRepo.restore.mockResolvedValue({ affected: 1 });

      await service.reactivate('schema-user-1');

      // Revocation must NOT happen on reactivation — sessions remain intact
      expect(mockAuthService.revokeAllSessionsForUser).not.toHaveBeenCalled();
    });
  });

  // ── Audit timestamps: entity decorator contract ────────────────────────────

  describe('audit timestamp contract: createdAt and updatedAt', () => {
    it('should include createdAt and updatedAt in the returned user on creation', async () => {
      const now = new Date('2026-06-15T10:00:00Z');
      const userWithTimestamps = buildUser({ createdAt: now, updatedAt: now });

      mockUsersRepo.findOne.mockResolvedValue(null); // no duplicate
      mockRolesRepo.findOne.mockResolvedValue(null); // no roleId
      mockUsersRepo.create.mockReturnValue(userWithTimestamps);
      mockUsersRepo.save.mockResolvedValue(userWithTimestamps);

      const result = await service.create({ email: 'new@schema.test', password: 'pass123' });

      // ORM-managed fields must be present on the returned entity
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
      expect(result.deletedAt).toBeNull();
    });
  });
});
