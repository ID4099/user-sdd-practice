# user-admin-system

NestJS backend for user administration with JWT authentication, refresh token rotation, RBAC, and soft-delete user management.

## Requirements

- Node.js 20+
- Docker and Docker Compose
- npm

## Local Bootstrap

### 1. Environment variables

Copy `.env.example` and configure:

```bash
cp .env.example .env
```

Edit `.env` with your values:

```
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_DATABASE=user_admin_system
JWT_SECRET=your-strong-secret-here
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

### 2. Start PostgreSQL

```bash
docker-compose up -d
```

This starts a `postgres:15-alpine` container with a healthcheck. The database is ready when the healthcheck passes.

### 3. Run migrations

```bash
npm run migration:run
```

Applies the initial schema (tables: `roles`, `users`, `refresh_sessions`).

### 4. Seed ADMIN_ROOT role

```bash
npm run start -- --entryFile seed
```

Or run the seed directly in development:

```bash
npx ts-node -e "require('./src/roles/roles.seed').runSeed()"
```

This inserts the `ADMIN_ROOT` role idempotently — safe to run multiple times.

### 5. Start the server

```bash
# Development (hot-reload)
npm run start:dev

# Production
npm run build
npm run start:prod
```

The API listens on `http://localhost:3000` by default.

---

## Authentication Flow

### Login

```http
POST /auth/login
Content-Type: application/json

{ "email": "user@example.com", "password": "password123" }
```

Response `200 OK` sets two `HttpOnly; SameSite=Strict` cookies:
- `accessToken` — JWT, valid for `JWT_ACCESS_EXPIRES_IN` (default 15 minutes)
- `refreshToken` — opaque UUID token, valid for `JWT_REFRESH_EXPIRES_IN` (default 7 days)

### Refresh

```http
POST /auth/refresh
Cookie: refreshToken=<token>
```

Returns `200 OK` and rotates both cookies. The previous refresh token is immediately invalidated.

**Reuse-detection**: if a consumed (already rotated) refresh token is presented, all active sessions for that user are revoked and `401 Unauthorized` is returned. This signals a potential token theft.

### Logout

```http
POST /auth/logout
Cookie: accessToken=<jwt>; refreshToken=<token>
```

Returns `200 OK`. Marks the active refresh session as revoked and clears both cookies. Idempotent — safe to call even if already logged out.

---

## User Management API

All endpoints require a valid `accessToken` cookie and the `ADMIN_ROOT` role.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/users?page=1&limit=10` | List users (paginated) |
| `POST` | `/users` | Create a user |
| `PATCH` | `/users/:id` | Update a user |
| `DELETE` | `/users/:id` | Soft-delete a user |
| `POST` | `/users/:id/reactivate` | Reactivate a soft-deleted user |

### Create user payload

```json
{
  "email": "user@example.com",
  "password": "minSixChars",
  "roleId": "uuid-of-an-existing-role"
}
```

`roleId` is optional. Email must be unique.

### Soft delete vs physical delete

`DELETE /users/:id` performs a **soft delete** only: it populates the `deleted_at` column. The physical row is never removed. On soft delete, all active refresh sessions for the user are immediately revoked so the user cannot renew their access token.

---

## Database Migrations

```bash
# Run all pending migrations
npm run migration:run

# Revert the last migration
npm run migration:revert

# Generate a new migration from entity changes
npm run migration:generate -- src/database/migrations/MigrationName
```

Migrations use TypeORM CLI with the standalone `DataSource` at `src/database/data-source.ts`.

---

## Test Commands

```bash
# Run all unit tests
npm test

# Run unit tests in watch mode
npm run test:watch

# Run unit tests with coverage report
npm run test:cov

# Run E2E tests (supertest, no real DB required)
npm run test:e2e

# TypeScript type check (no emit)
npx tsc --noEmit
```

### Test architecture

| Layer | Tool | Location |
|-------|------|----------|
| Unit | Jest + ts-jest | `src/**/*.spec.ts` |
| Integration | Jest + @nestjs/testing | `src/auth/auth.integration.spec.ts` |
| E2E | Jest + supertest + @nestjs/testing | `test/user-admin.e2e-spec.ts` |

E2E tests use a fully-wired NestJS application with mock TypeORM repositories — no running PostgreSQL is needed to run the E2E suite.

---

## Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_USERNAME` | `postgres` | PostgreSQL user |
| `DB_PASSWORD` | `postgres` | PostgreSQL password |
| `DB_DATABASE` | `user_admin_system` | Database name |
| `JWT_SECRET` | *(required)* | Secret key for signing access tokens |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Access token lifetime (e.g. `15m`, `1h`) |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token lifetime (e.g. `7d`, `30d`) |

---

## Security Notes

### Token storage

Access and refresh tokens are stored exclusively in `HttpOnly; SameSite=Strict` cookies. They are never accessible from JavaScript, which mitigates XSS-based token theft.

### CSRF protection

With `SameSite=Strict`, the browser will not send the cookies on cross-site requests. For same-origin SPAs this is sufficient. See [CSRF / cross-origin note](./openspec/changes/user-admin-system/design.md) for cross-origin scenarios.

### Refresh token hash

The plain refresh token is returned to the client once and never stored. Only its `bcrypt` hash is persisted in `refresh_sessions.token_hash`. A database breach does not expose reusable tokens.
