# Propuesta: user-admin-system

## Intención
Construir un Sistema de Administración de Usuarios exclusivamente de backend que proporcione gestión segura de usuarios, autenticación y Control de Acceso Basado en Roles (RBAC). Responde a la necesidad de administrar usuarios internos, asignar roles y aplicar revocación inmediata de acceso al desactivar un usuario, sin eliminación física de los registros.

## Alcance

### Dentro del Alcance
- Configuración de la aplicación NestJS, TypeORM y PostgreSQL mediante Docker Compose.
- Módulo de Autenticación: endpoint de login que emite access tokens JWT de corta duración (15 min) y refresh tokens de larga duración (7 días); hash de contraseñas.
- Estrategia de refresh tokens: rotación en cada uso, almacenamiento únicamente del hash del token en base de datos, detección de reutilización con revocación de sesión completa, endpoint `POST /auth/logout` que invalida la sesión activa.
- Cookies seguras: access y refresh tokens entregados en cookies `httpOnly`, `secure`, `sameSite=Strict`, con protección CSRF donde aplique.
- Módulo de Usuarios: endpoints REST para listado de usuarios (con paginación), creación, actualización, borrado lógico (desactivación) y reactivación.
- Gestión de Roles: asignación de roles existentes a usuarios (sin CRUD de roles).
- Middleware/Guards RBAC: aplica el requisito de rol `ADMIN_ROOT` para acciones de gestión de usuarios; valida el JWT y rechaza inmediatamente a usuarios desactivados/con borrado lógico en cada request; la desactivación invalida también la capacidad de refresh.
- Campos de auditoría: registro de metadatos de creación y actualización.

### Fuera del Alcance
- Interfaz de usuario frontend (diferida).
- Operaciones CRUD sobre el catálogo de roles.
- Flujos de recuperación y restablecimiento de contraseña.
- Integraciones con sistemas externos.
- Notificaciones por correo electrónico o SMS.
- Eliminación física de usuarios.

## Capacidades

> Esta sección es el CONTRATO entre las fases de propuesta y specs.

### Nuevas Capacidades
- `user-auth`: Login, emisión de access JWT (15 min) y refresh token (7 días, rotación en cada uso), validación de requests (incluidas verificaciones de desactivación inmediata), logout con revocación de sesión, y detección de reutilización de refresh tokens.
- `user-management`: Endpoints CRUD para usuarios, borrado lógico, reactivación y asignación de roles.
- `rbac-enforcement`: Guards que aplican el requisito de rol `ADMIN_ROOT` en las rutas protegidas.
- `database-schema`: Modelos de usuario, rol y sesión de refresh token (hash, familia, expiración, revocación); migraciones y campos de metadatos de auditoría.

### Capacidades Modificadas
- Ninguna

## Enfoque
Implementar un backend modular con NestJS utilizando TypeORM para PostgreSQL.
- **Autenticación**: Utilizar la estrategia JWT de Passport. Access token de corta duración (15 min) y refresh token de larga duración (7 días). El refresh token se almacena únicamente en su forma hasheada (`bcrypt`) en la entidad `RefreshSession`. En cada llamada a `POST /auth/refresh`, se emite un nuevo par de tokens (rotación) y se invalida el anterior; si se detecta reutilización de un token ya consumido, se revoca toda la cadena de sesión del usuario. `POST /auth/logout` invalida la sesión activa. Todos los tokens viajan en cookies `httpOnly`, `secure`, `sameSite=Strict`. Para aplicar la revocación inmediata de acceso por desactivación de usuario, se verifica el estado activo en la base de datos en cada request protegido.
- **Validación**: Aplicar validación de DTOs mediante `class-validator` y `class-transformer`.
- **Borrado Lógico**: Utilizar `@DeleteDateColumn` de TypeORM junto con campos de auditoría. La desactivación invalida también cualquier sesión de refresh activa del usuario.

## Áreas Afectadas

| Área | Impacto | Descripción |
|------|---------|-------------|
| `src/main.ts` | Nueva | Bootstrap de la aplicación NestJS |
| `src/auth/` | Nueva | Controlador de autenticación, estrategia JWT, guards, manejo de refresh tokens y logout |
| `src/auth/refresh-session.entity.ts` | Nueva | Entidad de sesión de refresh token (hash, expiración, indicador de revocación) |
| `src/users/` | Nueva | Módulo de usuarios, controladores, servicios, DTOs |
| `src/roles/` | Nueva | Definiciones de roles y lógica de asignación |
| `src/database/` | Nueva | Configuración de TypeORM y entidades |
| `docker-compose.yml` | Nuevo | Entorno de desarrollo local con PostgreSQL |

## Riesgos

| Riesgo | Probabilidad | Mitigación |
|--------|-------------|-----------|
| Carga en la BD por verificaciones del estado del usuario en cada request | Media | Mitigar con indexación en la BD sobre ID/estado del usuario. Introducir Redis más adelante si las consultas a la BD se convierten en un cuello de botella. |
| Reutilización de refresh token por exfiltración | Baja-Media | Detección de reuse invalida la sesión completa; ventana de exposición limitada a 15 min del access token. |
| Gestión de cookies en clientes no-navegador | Baja | Documentar el comportamiento esperado; las cookies están marcadas `httpOnly`/`secure` y no requieren lógica en el cliente. |

## Plan de Reversión
Al tratarse de un proyecto greenfield, la reversión consiste en eliminar el esquema de base de datos y los contenedores, y remover los directorios y archivos de configuración agregados.

## Dependencias
- Docker (para PostgreSQL mediante docker-compose)
- Entorno Node.js

## Criterios de Éxito
- [ ] El servidor NestJS se conecta a PostgreSQL mediante Docker.
- [ ] Los usuarios se autentican y reciben un access token JWT (15 min) y un refresh token (7 días) en cookies `httpOnly`.
- [ ] `POST /auth/refresh` emite nuevos tokens y revoca el par anterior (rotación).
- [ ] La reutilización de un refresh token ya consumido revoca toda la sesión activa del usuario.
- [ ] `POST /auth/logout` revoca la sesión de refresh activa.
- [ ] El rol `ADMIN_ROOT` puede listar, crear, actualizar, desactivar y reactivar usuarios.
- [ ] Los usuarios desactivados son bloqueados inmediatamente al intentar acceder a los endpoints protegidos, y sus sesiones de refresh son revocadas.
- [ ] Ningún usuario es eliminado físicamente.
- [ ] Todas las entradas son validadas mediante `class-validator`.
