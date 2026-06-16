# Especificación: user-auth

## Propósito
Gestión de autenticación de usuarios mediante JWT de corta duración (access token) y refresh tokens de larga duración con rotación, validación del estado del usuario y revocación segura de sesiones.

## Decisiones de Token

| Parámetro | Valor |
|-----------|-------|
| Access token lifetime | 15 minutos |
| Refresh token lifetime | 7 días |
| Rotación de refresh token | En cada llamada a `/auth/refresh` |
| Almacenamiento server-side | Solo el hash (`bcrypt`) del refresh token en `RefreshSession` |
| Transporte de tokens | Cookies `httpOnly`, `secure`, `sameSite=Strict` |
| Protección CSRF | Requerida para endpoints que muten estado (ver nota en diseño) |

## Requisitos

### Requisito: Autenticación de Usuario

El sistema DEBE permitir a los usuarios autenticarse proporcionando credenciales válidas y DEBE emitir un access token JWT (15 min) y un refresh token (7 días) en cookies `httpOnly` tras una autenticación exitosa.

#### Escenario: Login exitoso

- GIVEN credenciales válidas
- WHEN el usuario realiza un POST a `/auth/login`
- THEN el sistema devuelve un status 200 y establece cookies `httpOnly` con el access token (15 min) y el refresh token (7 días).

#### Escenario: Credenciales inválidas

- GIVEN credenciales incorrectas
- WHEN el usuario realiza un POST a `/auth/login`
- THEN el sistema devuelve un status 401 Unauthorized.

#### Escenario: Usuario desactivado intenta login

- GIVEN un usuario con borrado lógico (desactivado)
- WHEN el usuario intenta hacer login
- THEN el sistema devuelve un status 403 Forbidden o 401 Unauthorized y no emite tokens.

---

### Requisito: Refresh de Tokens con Rotación

El sistema DEBE emitir un nuevo par de tokens (access + refresh) en cada llamada a `/auth/refresh`, invalidando el refresh token anterior. El refresh token anterior DEBE ser ireutilizable tras la rotación.

#### Escenario: Refresh exitoso

- GIVEN una cookie de refresh token válida y no consumida
- WHEN el cliente realiza un POST a `/auth/refresh`
- THEN el sistema devuelve status 200, emite un nuevo access token y un nuevo refresh token en cookies `httpOnly`, e invalida el token anterior.

#### Escenario: Refresh token expirado

- GIVEN una cookie de refresh token expirado (> 7 días)
- WHEN el cliente realiza un POST a `/auth/refresh`
- THEN el sistema devuelve status 401 Unauthorized y no emite tokens.

#### Escenario: Refresh token ya consumido (detección de reutilización)

- GIVEN un refresh token que ya fue rotado en una llamada anterior
- WHEN el cliente (o un atacante) intenta usarlo en un POST a `/auth/refresh`
- THEN el sistema DEBE revocar la sesión activa completa del usuario y devolver status 401 Unauthorized.

---

### Requisito: Logout

El sistema DEBE permitir a un usuario autenticado invalidar su sesión de refresh activa.

#### Escenario: Logout exitoso

- GIVEN un usuario autenticado con una sesión de refresh activa
- WHEN el usuario realiza un POST a `/auth/logout`
- THEN el sistema revoca la sesión de refresh, limpia las cookies y devuelve status 200.

---

### Requisito: Revocación por Desactivación

Al desactivar un usuario (soft delete), el sistema DEBE revocar inmediatamente todas sus sesiones de refresh activas, además de bloquear el access token en cada request protegido.

#### Escenario: Desactivación revoca refresh sessions

- GIVEN un usuario activo con sesiones de refresh vigentes
- WHEN un administrador desactiva al usuario (`DELETE /users/:id`)
- THEN todas las `RefreshSession` del usuario son marcadas como revocadas y el usuario no puede renovar su acceso.
