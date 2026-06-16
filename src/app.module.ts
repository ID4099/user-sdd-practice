import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { RefreshSession } from './auth/refresh-session.entity';
import { Role } from './roles/role.entity';
import { User } from './users/user.entity';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    // Load environment variables globally (no import needed in child modules)
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // TypeORM async configuration driven by ConfigService
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USERNAME', 'postgres'),
        password: config.get<string>('DB_PASSWORD', 'postgres'),
        database: config.get<string>('DB_DATABASE', 'user_admin_system'),
        entities: [Role, User, RefreshSession],
        // Migrations run manually via CLI; never auto-sync in production
        synchronize: config.get<string>('DB_SYNCHRONIZE') === 'true',
        migrations: ['dist/database/migrations/*.js'],
        migrationsRun: false,
        logging: config.get<string>('NODE_ENV') === 'development',
      }),
    }),

    AuthModule,
    UsersModule,
  ],
})
export class AppModule {}
