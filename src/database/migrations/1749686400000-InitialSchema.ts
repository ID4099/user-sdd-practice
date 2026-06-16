import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial migration: creates roles, users, and refresh_sessions tables.
 *
 * roles          — static lookup table seeded with ADMIN_ROOT
 * users          — main user table with soft-delete (deleted_at)
 * refresh_sessions — stores bcrypt hash of refresh tokens; never stores plain tokens
 */
export class InitialSchema1749686400000 implements MigrationInterface {
  name = 'InitialSchema1749686400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- roles -----------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "roles" (
        "id"         UUID              NOT NULL DEFAULT gen_random_uuid(),
        "name"       CHARACTER VARYING NOT NULL,
        "created_at" TIMESTAMP         NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP         NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_roles_name" UNIQUE ("name"),
        CONSTRAINT "PK_roles" PRIMARY KEY ("id")
      )
    `);

    // --- users -----------------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id"           UUID              NOT NULL DEFAULT gen_random_uuid(),
        "email"        CHARACTER VARYING NOT NULL,
        "password"     CHARACTER VARYING NOT NULL,
        "role_id"      UUID,
        "created_at"   TIMESTAMP         NOT NULL DEFAULT now(),
        "updated_at"   TIMESTAMP         NOT NULL DEFAULT now(),
        "deleted_at"   TIMESTAMP,
        CONSTRAINT "UQ_users_email"  UNIQUE ("email"),
        CONSTRAINT "PK_users"        PRIMARY KEY ("id"),
        CONSTRAINT "FK_users_role"   FOREIGN KEY ("role_id")
          REFERENCES "roles"("id") ON DELETE SET NULL
      )
    `);

    // Index on email for login queries and on deleted_at for JwtStrategy checks
    await queryRunner.query(
      `CREATE INDEX "IDX_users_email"      ON "users" ("email")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_users_deleted_at" ON "users" ("deleted_at")`,
    );

    // --- refresh_sessions ------------------------------------------------
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "refresh_sessions" (
        "id"          UUID      NOT NULL DEFAULT gen_random_uuid(),
        "user_id"     UUID      NOT NULL,
        "token_hash"  TEXT      NOT NULL,
        "expires_at"  TIMESTAMP NOT NULL,
        "consumed_at" TIMESTAMP,
        "revoked_at"  TIMESTAMP,
        "created_at"  TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refresh_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_refresh_sessions_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Composite index to efficiently look up active sessions by user
    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_sessions_user_id" ON "refresh_sessions" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_sessions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "roles"`);
  }
}
