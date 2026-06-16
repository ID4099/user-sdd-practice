# Especificación: database-schema

## Propósito
Modelado de persistencia, relaciones usuario-rol y metadatos de auditoría para garantizar el borrado lógico.

## Requisitos

### Requisito: Persistencia y Auditoría

El sistema DEBE almacenar los usuarios con relación a sus roles e incluir marcas de tiempo para auditoría (`createdAt`, `updatedAt`, `deletedAt`).

#### Escenario: Integridad de datos en creación

- GIVEN un nuevo registro de usuario insertado vía TypeORM
- WHEN se guarda en la base de datos PostgreSQL
- THEN el ORM completa automáticamente los campos `createdAt` y `updatedAt`.

#### Escenario: Mantenimiento de registros (No eliminación física)

- GIVEN un usuario eliminado lógicamente mediante el módulo de gestión
- WHEN se inspecciona la tabla de usuarios en PostgreSQL
- THEN el registro correspondiente sigue presente pero con el campo `deletedAt` poblado.
