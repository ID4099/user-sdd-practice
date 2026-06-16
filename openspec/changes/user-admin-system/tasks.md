# Tasks: Sistema de Administración de Usuarios

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 1100-1600 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4 |
| Delivery strategy | ask-on-risk (resolved: feature-branch-chain) |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Base NestJS + PostgreSQL + esquema inicial | PR 1 | Incluye `docker-compose.yml`, config, entidades (users, roles, refresh_sessions), migración y seed de `ADMIN_ROOT`. |
| 2 | Autenticación JWT + refresh tokens con rotación + RBAC + revocación | PR 2 | Depende de PR 1; integra `JwtStrategy`, `RefreshStrategy`, `JwtAuthGuard`, `RolesGuard`, cookies, logout y reuse-detection. |
| 3 | CRUD de usuarios + soft delete/reactivación + revocación de refresh sessions | PR 3 | Depende de PR 2; soft-delete invoca revocación de sesiones; cierra escenarios de specs. |
| 4 | Pruebas + documentación | PR 4 | Depende de PR 3; configura Jest, cubre escenarios unit/integration/e2e incluyendo rotación y reuse-detection. |

## Phase 1: Foundation / Infrastructure

- [x] 1.1 Crear `package.json`, `tsconfig.json`, `nest-cli.json` y scripts base (start/build/typeorm/migration).
- [x] 1.2 Crear `.env.example` y `docker-compose.yml` con variables `DB_*`, `JWT_SECRET`, `JWT_ACCESS_EXPIRES_IN=15m`, `JWT_REFRESH_EXPIRES_IN=7d` y servicio PostgreSQL.
- [x] 1.3 Crear `src/main.ts` con `ValidationPipe` global (`whitelist`, `transform`), configuración de `cookie-parser` y `src/app.module.ts` con `ConfigModule`.
- [x] 1.4 Crear `src/database/data-source.ts` y `src/database/migrations/*` para tablas `roles`, `users` y `refresh_sessions` con `createdAt/updatedAt/deletedAt` donde aplique.
- [x] 1.5 Crear `src/roles/role.entity.ts` y `src/roles/roles.seed.ts` para insertar `ADMIN_ROOT` idempotentemente.
- [x] 1.6 Crear `src/users/user.entity.ts` con `ManyToOne` a rol, `DeleteDateColumn` y hash `bcrypt` en hooks de entidad.

## Phase 2: Core Security Implementation

- [x] 2.1 Crear `src/auth/refresh-session.entity.ts` con campos `id`, `userId`, `tokenHash`, `expiresAt`, `consumedAt`, `revokedAt`.
- [x] 2.2 Crear `src/auth/auth.module.ts`, `src/auth/auth.controller.ts`, `src/auth/auth.service.ts` con `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`.
- [x] 2.3 Implementar en `AuthService`: validación de credenciales (`bcrypt.compare`), rechazo 401/403 para usuario desactivado, generación de access token (15 min) y refresh token opaco (7 días), persistencia del hash en `RefreshSession`, y limpieza de cookies en logout.
- [x] 2.4 Implementar rotación en `AuthService.refresh`: validar hash de `RefreshSession`, marcar como `consumedAt`, detectar reutilización (si ya está consumida → revocar sesión completa → 401), emitir nuevo par de tokens.
- [x] 2.5 Implementar `AuthService.revokeAllSessionsForUser(userId)`: marca `revokedAt` en todas las `RefreshSession` activas del usuario.
- [x] 2.6 Crear `src/auth/jwt.strategy.ts` para validar firma del access token y re-consultar usuario activo en BD en cada request protegido.
- [x] 2.7 Crear `src/auth/guards/jwt-auth.guard.ts`, `src/auth/guards/roles.guard.ts` y `src/auth/decorators/roles.decorator.ts`.

## Phase 3: User Management / Integration

- [x] 3.1 Crear `src/users/dto/create-user.dto.ts`, `update-user.dto.ts`, `pagination-query.dto.ts` con `class-validator`.
- [x] 3.2 Crear `src/users/users.module.ts`, `src/users/users.service.ts`, `src/users/users.controller.ts` con `GET/POST/PATCH/DELETE /users` y `POST /users/:id/reactivate`.
- [x] 3.3 Aplicar `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(ADMIN_ROOT)` en rutas `/users*` y verificar paginación `page/limit`.
- [x] 3.4 Implementar soft delete (`softDelete`) e invocar `AuthService.revokeAllSessionsForUser(userId)` al desactivar; implementar restore (`restore`) en reactivación, sin eliminación física de registros.

## Phase 4: Testing / Verification

- [x] 4.1 Configurar Jest (`jest.config.*`, scripts, setup) para habilitar unit/integration/e2e en el proyecto.
- [x] 4.2 Unit tests: `AuthService` (login exitoso, credenciales inválidas, usuario desactivado, refresh con rotación, logout, reuse-detection revoca sesión) y `RolesGuard` (403 sin `ADMIN_ROOT`).
- [x] 4.3 Integration tests: `JwtStrategy` rechaza usuario con `deletedAt` aunque el access token sea válido; `AuthService.refresh` detecta token consumido y revoca sesión completa.
- [x] 4.4 E2E con `supertest`: cubrir escenarios de specs `user-auth` (login, refresh, logout, reuse-detection, expiración), `user-management` y `rbac-enforcement` (200/201/400/401/403).
- [x] 4.5 Verificar `database-schema`: tras soft delete, el registro sigue en `users` con `deletedAt` poblado y las `RefreshSession` del usuario tienen `revokedAt` poblado.

## Phase 5: Cleanup / Documentation

- [x] 5.1 Documentar en `README.md` bootstrap local, migraciones, seed `ADMIN_ROOT`, variables de entorno (`JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`), flujo de refresh/logout y comandos de prueba.
- [x] 5.2 Revisar y alinear códigos HTTP/mensajes de error en controladores para coherencia con los escenarios Given/When/Then.
- [x] 5.3 Documentar nota CSRF: confirmar comportamiento de `sameSite=Strict` para entorno same-origin; describir patrón double-submit para escenarios cross-origin.
