import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './user.entity';
import { Role } from '../roles/role.entity';
import { ADMIN_ROOT } from '../roles/role.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';

// ─── Mock factories ──────────────────────────────────────────────────────────

const mockUsersRepo = {
  findOne: jest.fn(),
  find: jest.fn(),
  findAndCount: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
  restore: jest.fn(),
};

const mockRolesRepo = {
  findOne: jest.fn(),
};

const mockAuthService = {
  revokeAllSessionsForUser: jest.fn(),
};

function makeUser(overrides: Partial<User> = {}): User {
  const u = new User();
  u.id = 'user-uuid';
  u.email = 'test@example.com';
  u.password = '$2b$10$hashed';
  u.role = { id: 'role-uuid', name: ADMIN_ROOT } as Role;
  u.deletedAt = null;
  u.createdAt = new Date('2026-01-01');
  u.updatedAt = new Date('2026-01-01');
  return Object.assign(u, overrides);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new UsersService(
      mockUsersRepo as any,
      mockRolesRepo as any,
      mockAuthService as any,
    );
  });

  // ── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated list with total', async () => {
      const users = [makeUser(), makeUser({ id: 'user-2', email: 'b@x.com' })];
      mockUsersRepo.findAndCount.mockResolvedValue([users, 2]);

      const query: PaginationQueryDto = { page: 1, limit: 10 };
      const result = await service.findAll(query);

      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });

    it('returns empty list when no users exist', async () => {
      mockUsersRepo.findAndCount.mockResolvedValue([[], 0]);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  // ── findOne ──────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns the user when found', async () => {
      const user = makeUser();
      mockUsersRepo.findOne.mockResolvedValue(user);

      const result = await service.findOne('user-uuid');

      expect(result.id).toBe('user-uuid');
      expect(result.email).toBe('test@example.com');
    });

    it('throws NotFoundException when user does not exist', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates and returns the new user', async () => {
      const dto: CreateUserDto = {
        email: 'new@example.com',
        password: 'Secret123',
        roleId: 'role-uuid',
      };
      const role = { id: 'role-uuid', name: ADMIN_ROOT } as Role;
      const newUser = makeUser({ id: 'new-uuid', email: dto.email });

      mockUsersRepo.findOne.mockResolvedValue(null); // no conflict
      mockRolesRepo.findOne.mockResolvedValue(role);
      mockUsersRepo.create.mockReturnValue(newUser);
      mockUsersRepo.save.mockResolvedValue(newUser);

      const result = await service.create(dto);

      expect(result.email).toBe('new@example.com');
      expect(mockUsersRepo.save).toHaveBeenCalledTimes(1);
    });

    it('throws ConflictException when email already exists', async () => {
      const dto: CreateUserDto = {
        email: 'existing@example.com',
        password: 'Secret123',
      };
      mockUsersRepo.findOne.mockResolvedValue(makeUser({ email: dto.email }));

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when given roleId does not exist', async () => {
      const dto: CreateUserDto = {
        email: 'new@example.com',
        password: 'Secret123',
        roleId: 'bad-role-uuid',
      };
      mockUsersRepo.findOne.mockResolvedValue(null);
      mockRolesRepo.findOne.mockResolvedValue(null);

      await expect(service.create(dto)).rejects.toThrow(NotFoundException);
    });
  });

  // ── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates and returns the user', async () => {
      const dto: UpdateUserDto = { email: 'updated@example.com' };
      const existingUser = makeUser();
      const updatedUser = makeUser({ email: dto.email! });

      mockUsersRepo.findOne.mockResolvedValue(existingUser);
      mockUsersRepo.save.mockResolvedValue(updatedUser);

      const result = await service.update('user-uuid', dto);

      expect(result.email).toBe('updated@example.com');
    });

    it('throws NotFoundException when user to update does not exist', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { email: 'x@x.com' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── remove (soft delete) ─────────────────────────────────────────────────

  describe('remove', () => {
    it('soft-deletes the user and revokes all sessions', async () => {
      const user = makeUser();
      mockUsersRepo.findOne.mockResolvedValue(user);
      mockUsersRepo.softDelete.mockResolvedValue({ affected: 1 });
      mockAuthService.revokeAllSessionsForUser.mockResolvedValue(undefined);

      await service.remove('user-uuid');

      expect(mockUsersRepo.softDelete).toHaveBeenCalledWith('user-uuid');
      expect(mockAuthService.revokeAllSessionsForUser).toHaveBeenCalledWith(
        'user-uuid',
      );
    });

    it('throws NotFoundException when user to delete does not exist', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);

      await expect(service.remove('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── reactivate ───────────────────────────────────────────────────────────

  describe('reactivate', () => {
    it('restores a soft-deleted user and returns them', async () => {
      const softDeletedUser = makeUser({ deletedAt: new Date('2026-01-05') });
      const restoredUser = makeUser({ deletedAt: null });

      mockUsersRepo.findOne
        .mockResolvedValueOnce(softDeletedUser)   // initial check (withDeleted)
        .mockResolvedValueOnce(restoredUser);     // re-fetch after restore
      mockUsersRepo.restore.mockResolvedValue({ affected: 1 });

      const result = await service.reactivate('user-uuid');

      expect(mockUsersRepo.restore).toHaveBeenCalledWith('user-uuid');
      expect(result.deletedAt).toBeNull();
    });

    it('throws NotFoundException when user does not exist at all', async () => {
      mockUsersRepo.findOne.mockResolvedValue(null);

      await expect(service.reactivate('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
