# Diseño: user-admin-system

## Enfoque Técnico

Backend modular NestJS con TypeORM sobre PostgreSQL (Docker Compose). Cinco módulos alineados a las capacidades del proposal: `DatabaseModule` (TypeORM + entidades), `AuthModule` (login, JWT, refresh tokens, `JwtStrategy`), `UsersModule` (CRUD, borrado lógico, asignación de roles), `RolesModule` (entidad y semilla) y la entidad `RefreshSession`. RBAC se aplica vía `JwtAuthGuard` + `RolesGuard`. La revocación inmediata (specs `user-auth` y `rbac-enforcement`) se garantiza re-consultando estado del usuario en BD en cada request protegido dentro de la `JwtStrategy.validate`, no confiando solo en el payload del token.

## Decisiones de Arquitectura

| Decisión | Elección | Alternativa descartada | Rationale |
|----------|----------|------------------------|-----------|
| Validación de estado | `JwtStrategy.validate` consulta BD y rechaza si `deletedAt != null` | Confiar en claims del JWT | El token sobrevive a la desactivación; la consulta cumple "revocación inmediata" sin lista de revocación. |
| Borrado lógico | `@DeleteDateColumn` (`deletedAt`) + `softDelete`/`restore` | `DELETE` físico o flag `isActive` manual | Cumple "no eliminación física" y auditoría con soporte nativo del ORM. |
| Autorización por rol | `RolesGuard` + `@Roles(ADMIN_ROOT)` leyendo metadata | Lógica `if` en cada controlador | Declarativo, centralizado y testeable; un único punto de cambio. |
| Hash de contraseña | `bcrypt` en hook `@BeforeInsert`/`@BeforeUpdate` | Texto plano / hash en servicio | Centraliza el cifrado en la entidad; impide persistir credenciales sin hash. |
| Schema en dev | `synchronize: false` + migraciones TypeORM | `synchronize: true` | Control explícito del esquema y trazabilidad; evita cambios destructivos automáticos. |
| Relación user-role | `@ManyToOne` (User → Role) | `@ManyToMany` | El alcance asigna un rol existente por usuario; simplifica el `RolesGuard`. |
| Access token lifetime | 15 minutos (`JWT_ACCESS_EXPIRES_IN=15m`) | 1 hora o más | Ventana de exposición corta ante robo de token; el refresh token renueva la sesión sin re-login. |
| Refresh token lifetime | 7 días (`JWT_REFRESH_EXPIRES_IN=7d`) | 30 días | Balance entre UX (no forzar login frecuente) y riesgo de exfiltración de larga duración. |
| Rotación de refresh token | Rotación en cada `POST /auth/refresh`; token anterior inmediatamente invalidado | Reutilización sin rotación | Limita la ventana de ataque a la vida del access token si un refresh token es exfiltrado. |
| Almacenamiento del refresh token | Solo el hash `bcrypt` del token en `RefreshSession.tokenHash` | Token en texto plano | Un atacante con acceso a la BD no puede reutilizar el token; el texto plano nunca persiste. |
| Detección de reutilización | Si un token consumido se vuelve a presentar, se revoca toda la `RefreshSession` del usuario | Ignorar reutilización o solo rechazar | Señal de compromiso: si un token ya rotado es presentado, la sesión entera queda comprometida. |
| Transporte de tokens | Cookies `httpOnly`, `secure`, `sameSite=Strict` | `Authorization: Bearer` en header / `localStorage` | Impide acceso desde JavaScript (XSS) y limita el uso cross-site (CSRF). |
| Protección CSRF | `sameSite=Strict` elimina la mayor parte del riesgo; para entornos cross-origin documentar uso de CSRF token doble-submit | Sin mitigación adicional | `sameSite=Strict` es suficiente en SPA same-origin; se documenta la alternativa para APIs públicas. |
| Revocación por desactivación | `UsersService.softDelete` invoca `AuthService.revokeAllSessionsForUser(userId)` | Depender de expiración natural | Garantiza revocación inmediata del refresh aunque el access token aún esté vigente (≤15 min). |
| Logout | `POST /auth/logout` marca la `RefreshSession` como revocada y limpia cookies | Solo limpiar cookies en cliente | Garantiza que el refresh token no sea reutilizable incluso si el cliente no limpia la cookie. |

## Flujo de Datos

Login y emisión de tokens:

    POST /auth/login ──→ AuthController ──→ AuthService
                                               │ valida credenciales (bcrypt.compare)
                                               │ rechaza si deletedAt != null (403/401)
                                               │ genera accessToken (JWT, 15 min)
                                               │ genera refreshToken (opaque, 7 días)
                                               │ persiste RefreshSession { tokenHash, userId, expiresAt }
                                               └──→ Set-Cookie: accessToken (httpOnly), refreshToken (httpOnly)
                                                    Response 200

Refresh con rotación:

    POST /auth/refresh ──→ AuthController ──→ AuthService
                                               │ lee refreshToken de cookie
                                               │ busca RefreshSession por hash
                                               │  ├── no encontrada / expirada / revocada → 401
                                               │  └── tokenHash coincide pero ya fue consumido → revocar sesión → 401
                                               │ marca sesión anterior como consumida
                                               │ genera nuevo par (accessToken + refreshToken)
                                               │ persiste nueva RefreshSession
                                               └──→ Set-Cookie: nuevos tokens; Response 200

Logout:

    POST /auth/logout ──→ AuthController ──→ AuthService
                                              │ lee refreshToken de cookie
                                              │ marca RefreshSession como revocada
                                              └──→ Clear-Cookie; Response 200

Request protegido con revocación inmediata (flujo complejo):

    Client          JwtAuthGuard      JwtStrategy        UsersRepo        RolesGuard      Controller
      │  Cookie JWT      │                 │                 │                │               │
      │─────────────────▶│                 │                 │                │               │
      │                  │ verifica firma  │                 │                │               │
      │                  │────────────────▶│ validate(payload)                │               │
      │                  │                 │ findOne(sub)    │                │               │
      │                  │                 │────────────────▶│                │               │
      │                  │                 │◀── user / null ─│                │               │
      │                  │   user==null o deletedAt!=null ⇒ 401/403           │               │
      │                  │                 │ retorna user activo               │               │
      │                  │                 │────────────────────────────────▶│ rol ADMIN_ROOT?│
      │                  │                 │                 │   no ⇒ 403     │               │
      │                  │                 │                 │   sí ──────────────────────────▶│
      │◀──────────────────────────────────────────────── respuesta ──────────────────────────│

## Cambios de Archivos

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `docker-compose.yml` | Crear | Servicio PostgreSQL para desarrollo local. |
| `.env.example` | Crear | `DB_*`, `JWT_SECRET`, `JWT_ACCESS_EXPIRES_IN=15m`, `JWT_REFRESH_EXPIRES_IN=7d`. |
| `package.json`, `tsconfig.json`, `nest-cli.json` | Crear | Scaffolding NestJS + dependencias. |
| `src/main.ts` | Crear | Bootstrap + `ValidationPipe` global (whitelist, transform) + configuración de cookies. |
| `src/app.module.ts` | Crear | Ensambla módulos y `ConfigModule`. |
| `src/database/data-source.ts` | Crear | `DataSource` TypeORM para migraciones. |
| `src/database/migrations/*` | Crear | Migración inicial (tablas users, roles, refresh_sessions). |
| `src/roles/role.entity.ts` | Crear | Entidad `Role` (`id`, `name`). |
| `src/roles/roles.seed.ts` | Crear | Semilla del rol `ADMIN_ROOT`. |
| `src/users/user.entity.ts` | Crear | Entidad `User` + auditoría + hooks de hash. |
| `src/users/users.{module,controller,service}.ts` | Crear | CRUD, soft-delete, reactivación, asignación de rol; soft-delete invoca revocación de refresh sessions. |
| `src/users/dto/*.dto.ts` | Crear | `CreateUserDto`, `UpdateUserDto`, `PaginationQueryDto` con `class-validator`. |
| `src/auth/refresh-session.entity.ts` | Crear | Entidad `RefreshSession` (`id`, `userId`, `tokenHash`, `expiresAt`, `revokedAt`, `consumedAt`). |
| `src/auth/auth.{module,controller,service}.ts` | Crear | Login, refresh con rotación, logout y revocación de sesiones. |
| `src/auth/jwt.strategy.ts` | Crear | Valida access token y estado activo en BD. |
| `src/auth/refresh.strategy.ts` | Crear | Valida refresh token desde cookie, detecta reutilización y rota. |
| `src/auth/guards/{jwt-auth,roles}.guard.ts` | Crear | Guards de autenticación y rol. |
| `src/auth/decorators/roles.decorator.ts` | Crear | `@Roles(...)` vía `SetMetadata`. |

## Interfaces / Contratos

```ts
// User: auditoría + soft delete (deletedAt poblado, sin DELETE físico)
@CreateDateColumn() createdAt: Date;
@UpdateDateColumn() updatedAt: Date;
@DeleteDateColumn() deletedAt?: Date;

// RefreshSession: almacena solo el hash; nunca el token en texto plano
interface RefreshSession {
  id: string;            // UUID
  userId: string;
  tokenHash: string;     // bcrypt hash del refresh token opaco
  expiresAt: Date;       // now + 7 días
  consumedAt?: Date;     // poblado al rotar; indica que ya fue usado
  revokedAt?: Date;      // poblado en logout o reuse-detection
}

// JWT access token payload (15 min)
interface JwtPayload { sub: string; email: string; role: string; }

// Variables de entorno
JWT_SECRET=...
JWT_ACCESS_EXPIRES_IN=15m   // access token
JWT_REFRESH_EXPIRES_IN=7d   // refresh token

// Constante canónica del rol
const ADMIN_ROOT = 'ADMIN_ROOT';
```

Endpoints:
- `POST /auth/login` — emite access + refresh token en cookies `httpOnly`
- `POST /auth/refresh` — rota refresh token; requiere cookie de refresh válida
- `POST /auth/logout` — revoca la sesión de refresh activa y limpia cookies
- `GET /users?page&limit` · `POST /users` · `PATCH /users/:id` · `DELETE /users/:id` (soft) · `POST /users/:id/reactivate`

Rutas `/users*` protegidas por `JwtAuthGuard` + `RolesGuard(ADMIN_ROOT)`.

> **Nota CSRF**: Con `sameSite=Strict` y frontend same-origin, no se requiere cabecera CSRF adicional. Si el API es consumido desde un origen diferente, implementar el patrón double-submit CSRF token en cabecera `X-CSRF-Token`.

## Estrategia de Pruebas

| Capa | Qué probar | Enfoque |
|------|-----------|---------|
| Unit | `RolesGuard`, hash en hooks, `AuthService` (login, refresh, logout, reuse-detection) | Jest + repositorios mockeados |
| Integration | `JwtStrategy` rechaza usuario con `deletedAt`; `RefreshStrategy` detecta token consumido y revoca sesión | Test DB / repo en memoria |
| E2E | Login → refresh → logout; desactivación → 403 inmediato + refresh inválido; reuse-detection revoca sesión; validación 400; paginación | `supertest` + Postgres efímero |

Nota: el runner de pruebas aún no existe (`config.yaml: testing.runner.available=false`). Esta estrategia se materializará al añadir Jest en la fase de tasks/apply.

## Migración / Rollout

Proyecto greenfield: migración inicial de TypeORM crea las tablas `roles`, `users` y `refresh_sessions`; la semilla inserta `ADMIN_ROOT`. Reversión = `down` de la migración o derribar contenedores y volúmenes Docker.

## Preguntas Abiertas

- [ ] Ninguna que bloquee el diseño. Pendiente menor: creación del primer ADMIN_ROOT vía semilla y configuración del `cookie-parser` en `main.ts`.
