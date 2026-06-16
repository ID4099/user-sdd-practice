# Especificación: rbac-enforcement

## Propósito
Aplicación de políticas de acceso basadas en roles (`ADMIN_ROOT`) y revocación inmediata de permisos.

## Requisitos

### Requisito: Autorización por Rol y Estado

El sistema DEBE validar que el requester posea el rol `ADMIN_ROOT` y que la cuenta esté activa en cada request protegido.

#### Escenario: Acceso permitido

- GIVEN un JWT válido de un usuario activo con rol `ADMIN_ROOT`
- WHEN el usuario accede a una ruta protegida
- THEN el sistema procesa la solicitud exitosamente.

#### Escenario: Falta de permisos

- GIVEN un JWT válido de un usuario sin el rol `ADMIN_ROOT`
- WHEN el usuario accede a una ruta de administración
- THEN el sistema devuelve un status 403 Forbidden.

#### Escenario: Revocación inmediata

- GIVEN un JWT previamente válido de un usuario que acaba de ser desactivado en base de datos
- WHEN el usuario intenta acceder a cualquier ruta protegida
- THEN el sistema detecta el estado inactivo en el Guard y devuelve 403 Forbidden o 401 Unauthorized.
