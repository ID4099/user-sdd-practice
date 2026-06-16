import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Role } from '../roles/role.entity';
import { User } from './user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * User management module.
 *
 * - Registers TypeORM repositories for User and Role.
 * - Imports AuthModule so UsersService can call AuthService.revokeAllSessionsForUser.
 *   (AuthModule already exports AuthService, JwtAuthGuard, and RolesGuard.)
 * - Provides UsersService and UsersController.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([User, Role]),
    // AuthModule exports AuthService (used by UsersService for session revocation)
    // and exports JwtAuthGuard + RolesGuard (used by UsersController)
    AuthModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
