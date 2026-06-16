# Especificación: user-management

## Propósito
Operaciones CRUD exclusivas para administradores, incluyendo borrado lógico y asignación de roles.

## Requisitos

### Requisito: Gestión de Usuarios

El sistema DEBE permitir listar, crear, actualizar, desactivar y reactivar usuarios, y asignarles roles existentes, sin eliminación física. Las entradas DEBEN ser validadas.

#### Escenario: Creación de usuario

- GIVEN un payload válido con datos de usuario y rol asignado
- WHEN el administrador realiza un POST a `/users`
- THEN el sistema crea el usuario y devuelve un status 201.

#### Escenario: Error de validación de entrada

- GIVEN un payload inválido (ej. email mal formado)
- WHEN se realiza un POST a `/users`
- THEN el sistema rechaza la petición con status 400 Bad Request.

#### Escenario: Listado de usuarios con paginación

- GIVEN múltiples usuarios en el sistema
- WHEN se realiza un GET a `/users?page=1&limit=10`
- THEN el sistema devuelve un status 200 con una lista paginada.

#### Escenario: Borrado lógico de usuario

- GIVEN un ID de usuario activo
- WHEN el administrador realiza un DELETE a `/users/:id`
- THEN el sistema aplica un borrado lógico (desactivación) devolviendo status 200 o 204.

#### Escenario: Reactivación de usuario

- GIVEN un ID de usuario con borrado lógico
- WHEN el administrador realiza un POST a `/users/:id/reactivate` (o endpoint equivalente)
- THEN el sistema reactiva al usuario y permite su acceso nuevamente.
