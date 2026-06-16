import { NotFoundException } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { User } from './user.entity';
import { Role } from '../roles/role.entity';
import { ADMIN_ROOT } from '../roles/role.entity';
import { PaginationQueryDto } from './dto/pagination-query.dto';

// ─── Mock service ────────────────────────────────────────────────────────────

const mockUsersService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  reactivate: jest.fn(),
};

function makeUser(overrides: Partial<User> = {}): User {
  const u = new User();
  u.id = 'user-uuid';
  u.email = 'test@example.com';
  u.role = { id: 'role-uuid', name: ADMIN_ROOT } as Role;
  u.deletedAt = null;
  return Object.assign(u, overrides);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = new UsersController(mockUsersService as unknown as UsersService);
  });

  // ── GET /users ─────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated result from service', async () => {
      const paginatedResult = {
        data: [makeUser()],
        total: 1,
        page: 1,
        limit: 10,
      };
      mockUsersService.findAll.mockResolvedValue(paginatedResult);

      const query: PaginationQueryDto = { page: 1, limit: 10 };
      const result = await controller.findAll(query);

      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(mockUsersService.findAll).toHaveBeenCalledWith(query);
    });

    it('delegates pagination params to service unchanged', async () => {
      const paginatedResult = { data: [], total: 0, page: 3, limit: 25 };
      mockUsersService.findAll.mockResolvedValue(paginatedResult);

      const query: PaginationQueryDto = { page: 3, limit: 25 };
      await controller.findAll(query);

      expect(mockUsersService.findAll).toHaveBeenCalledWith(query);
    });
  });

  // ── GET /users/:id ─────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns a single user', async () => {
      const user = makeUser();
      mockUsersService.findOne.mockResolvedValue(user);

      const result = await controller.findOne('user-uuid');

      expect(result.id).toBe('user-uuid');
    });

    it('propagates NotFoundException from service', async () => {
      mockUsersService.findOne.mockRejectedValue(
        new NotFoundException('Not found'),
      );

      await expect(controller.findOne('bad-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── POST /users ────────────────────────────────────────────────────────────

  describe('create', () => {
    it('returns the created user with 201', async () => {
      const user = makeUser({ id: 'new-uuid' });
      mockUsersService.create.mockResolvedValue(user);

      const dto = { email: 'new@example.com', password: 'Secret123' };
      const result = await controller.create(dto as any);

      expect(result.id).toBe('new-uuid');
      expect(mockUsersService.create).toHaveBeenCalledWith(dto);
    });
  });

  // ── PATCH /users/:id ───────────────────────────────────────────────────────

  describe('update', () => {
    it('returns the updated user', async () => {
      const updatedUser = makeUser({ email: 'updated@example.com' });
      mockUsersService.update.mockResolvedValue(updatedUser);

      const dto = { email: 'updated@example.com' };
      const result = await controller.update('user-uuid', dto as any);

      expect(result.email).toBe('updated@example.com');
    });
  });

  // ── DELETE /users/:id ──────────────────────────────────────────────────────

  describe('remove', () => {
    it('calls service.remove and returns void (204)', async () => {
      mockUsersService.remove.mockResolvedValue(undefined);

      await expect(controller.remove('user-uuid')).resolves.toBeUndefined();
      expect(mockUsersService.remove).toHaveBeenCalledWith('user-uuid');
    });
  });

  // ── POST /users/:id/reactivate ─────────────────────────────────────────────

  describe('reactivate', () => {
    it('returns the reactivated user', async () => {
      const user = makeUser({ deletedAt: null });
      mockUsersService.reactivate.mockResolvedValue(user);

      const result = await controller.reactivate('user-uuid');

      expect(result.deletedAt).toBeNull();
      expect(mockUsersService.reactivate).toHaveBeenCalledWith('user-uuid');
    });
  });
});
