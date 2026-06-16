# Exploración: Sistema de Administración de Usuarios (`user-admin-system`)

_Generado: 2026-06-11 | Fase: sdd-explore | Almacenamiento de artefactos: openspec_

---

## Estado Actual

Este es un **proyecto desde cero (greenfield)**. No existen archivos fuente, frameworks, bases de
datos ni infraestructura.
El directorio `openspec/` fue inicializado el 2026-06-11 sin stack detectado.
No hay specs, pruebas ni patrones de código previos que preservar o integrar.

Todas las decisiones — estrategia de autenticación, stack tecnológico, esquema de base de datos,
diseño de API — están abiertas y deben tomarse antes de la propuesta y las specs. Esto representa
tanto una oportunidad (sin restricciones de legado) como un riesgo (múltiples decisiones sin
resolver que pueden bloquear las fases posteriores).

---

## Áreas Afectadas (Propuestas)

Al ser un proyecto greenfield, las "áreas afectadas" corresponden a los **módulos y límites de
archivos propuestos** que deberán establecerse:

| Capa | Ruta Propuesta | Motivo |
|------|---------------|--------|
| Entrada del backend | `src/server/index.*` | Bootstrap del servidor HTTP, configuración de middlewares |
| Módulo de autenticación | `src/server/auth/` | Endpoint de login, estrategia de sesión/token, hash de contraseñas |
| Módulo de usuarios | `src/server/users/` | API estilo CRUD: listar, crear, editar, desactivar, reactivar |
| Middleware RBAC | `src/server/middleware/rbac.*` | Verificación de permisos en el backend por RN-003 |
| Capa de base de datos | `src/server/db/` | Migraciones de esquema, configuración del ORM/cliente de consultas |
| Entrada del frontend | `src/client/index.*` | Bootstrap de la SPA, configuración del router |
| Vistas de autenticación | `src/client/views/auth/` | Pantalla de login (HU-001) |
| Vista del dashboard | `src/client/views/dashboard/` | Dashboard básico (entregable dentro del alcance) |
| Módulo de administración de usuarios | `src/client/views/admin/users/` | Listar, crear, editar, desactivar, reactivar (HU-002..HU-006) |
| Guard RBAC (frontend) | `src/client/guards/` | Restricción de acceso a nivel de ruta (HU-007) |
| Configuración / entorno | `.env`, `config/` | Conexión a BD, secreto de sesión, configuración de la aplicación |
| Pruebas | `tests/` | Pruebas unitarias e de integración (sin runner configurado aún) |

---

## Enfoques

### Enfoque 1: Node.js + Express + PostgreSQL (REST, sesiones JWT)

Un enfoque full-stack convencional con un stack probado y bien comprendido.

- **Backend**: Node.js / TypeScript, Express, PostgreSQL, Prisma o Knex como ORM.
- **Autenticación**: JWT (access token + refresh token), bcrypt para contraseñas, almacenados en cookies `httpOnly`.
- **Frontend**: React + TypeScript, React Router v6, Axios, biblioteca de componentes UI ligera.
- **RBAC**: Rol verificado en el middleware antes de cada ruta protegida; rol almacenado en el claim del JWT.

| Aspecto | Evaluación |
|---------|-----------|
| Ventajas | Ecosistema maduro, amplio pool de talento, migraciones de esquema fáciles en PostgreSQL, patrones RBAC bien documentados |
| Desventajas | La apatridia del JWT requiere estrategia de rotación del refresh token para logout/desactivación; JWT en cookies requiere mitigación de CSRF |
| Esfuerzo | Medio |
| Ajuste no funcional | Paginación + ≥10k usuarios: PostgreSQL lo maneja con consultas indexadas. Respuesta `<3s`: alcanzable con indexación adecuada. Disponibilidad 99%: preocupación de capa de despliegue, fuera del alcance de v1. |

### Enfoque 2: Node.js + NestJS + PostgreSQL (REST, sesiones del lado del servidor)

Un framework más estructurado y opinionado. La sesión se almacena en el servidor (Redis o BD).

- **Backend**: NestJS (Express internamente), TypeORM o Prisma, PostgreSQL.
- **Autenticación**: Passport.js con estrategia local, sesiones persistidas en Redis o BD.
- **Frontend**: Igual que el Enfoque 1.
- **RBAC**: Guards y Decoradores de NestJS.

| Aspecto | Evaluación |
|---------|-----------|
| Ventajas | DI integrado, decoradores y Guards hacen el RBAC más ergonómico; sesión del lado del servidor = invalidación inmediata al desactivar (satisface RN-004) |
| Desventajas | Curva de aprendizaje de NestJS; dependencia de Redis agrega complejidad operacional; configuración inicial más pesada |
| Esfuerzo | Medio–Alto |
| Ajuste no funcional | La invalidación de sesión para usuarios desactivados es trivialmente correcta — sin problema de ciclo de vida de tokens |

### Enfoque 3: Monolito con Renderizado del Lado del Servidor (Next.js Full-Stack)

Frontend y backend unificados en un único proyecto Next.js usando API Routes o Server Actions.

- **Stack**: Next.js (App Router), TypeScript, PostgreSQL, Prisma, NextAuth.js / Auth.js.
- **Autenticación**: NextAuth con proveedor de credenciales, gestión de sesión integrada.
- **RBAC**: Middleware + componentes de servidor.

| Aspecto | Evaluación |
|---------|-----------|
| Ventajas | Repositorio único, excelente DX, sesión integrada, SSR para carga inicial rápida, responsivo por defecto |
| Desventajas | El proveedor de credenciales de NextAuth es menos probado para RBAC empresarial; mezclar paradigmas SSR y SPA puede generar confusión en el equipo; dependencia de patrones de Vercel |
| Esfuerzo | Bajo–Medio (rápido de armar, complejo de personalizar RBAC en profundidad) |
| Ajuste no funcional | Respuesta `<3s`: SSR ayuda; disponibilidad 99% depende del despliegue |

---

## Recomendación

**Enfoque 1 (Node.js + Express + PostgreSQL + React, JWT con cookies `httpOnly`)**  
combinado con **invalidación de sesión inmediata al desactivar** (ver Ambigüedades §3 más abajo).

Justificación:
- Explícito, educativo, sin magia — alineado con la naturaleza aparente de aprendizaje/práctica del proyecto.
- JWT en cookies `httpOnly` proporciona tanto escalabilidad apátrida como protección contra XSS.
- La invalidación por desactivación puede resolverse con un **token de acceso de corta duración + lista de bloqueo en el servidor para usuarios desactivados** (verificada en cada request) — evita la complejidad completa del Enfoque 2 mientras satisface RN-004.
- La separación limpia entre dominios frontend/backend permite escalado y pruebas independientes.
- PostgreSQL + Prisma ofrecen migraciones de esquema robustas y type-safety en las consultas.

> ⚠️ **Esta recomendación es provisional** — debe confirmarse una vez resueltas las ambigüedades
> indicadas a continuación. El stack tecnológico es la decisión más crítica pendiente.

---

## Ambigüedades y Decisiones Pendientes

Estas DEBEN resolverse antes de que las fases de propuesta y specs puedan completarse de forma segura.
Cada una está etiquetada con su impacto en las fases posteriores.

### A1 — Stack Tecnológico (CRÍTICO)
**Pregunta**: ¿Qué lenguaje, framework y base de datos se utilizarán?  
**Impacto**: Bloquea TODAS las specs, el diseño y las tareas. Las rutas de archivos, los patrones y el enfoque de pruebas dependen de esta decisión.  
**Opciones**: (ver Enfoques más arriba) o un stack diferente.

### A2 — Estrategia de Autenticación / Mecanismo de Sesión (CRÍTICO)
**Pregunta**: ¿JWT (apátrida) o sesiones del lado del servidor? Si JWT: ¿access + refresh o token único? ¿Token en cookie o en header `Authorization`?  
**Impacto**: Afecta directamente a HU-001 (login), RN-004 (usuarios desactivados no pueden iniciar sesión) y el NFR de seguridad. JWT en cookie requiere manejo de CSRF; JWT en header requiere configuración de CORS.

### A3 — Desactivación + Invalidación Inmediata (ALTO)
**Pregunta**: Cuando se desactiva un usuario (HU-005), ¿deben invalidarse inmediatamente sus sesiones/tokens activos?  
**Impacto**: Si es afirmativo + se elige JWT → requiere una lista de bloqueo en el servidor o un TTL de token corto. Con sesiones: se resuelve de forma trivial. El BRD dice "los usuarios desactivados no pueden iniciar sesión" (RN-004) pero no aclara las sesiones *ya activas*.

### A4 — Política de Contraseñas (MEDIO)
**Pregunta**: ¿Cuáles son los requisitos de contraseña? (longitud mínima, complejidad, expiración)  
**Impacto**: Reglas de validación en los flujos de creación y edición de usuarios. El BRD solo indica "contraseñas cifradas" (RN-006), sin definir ninguna política.

### A5 — Extensibilidad del Modelo de Roles (MEDIO)
**Pregunta**: ¿Los dos roles (`Administrador General`, `Usuario Estándar`) son enumeraciones hardcodeadas o se almacenan en una tabla `roles`?  
**Impacto**: Si son hardcodeados: esquema más simple, sin UI de gestión de roles. Si se almacenan: se requiere una funcionalidad de gestión de roles (listada como entregable v1 — "gestión de roles" — pero ninguna historia de usuario cubre el CRUD de roles). Esta es una contradicción de alcance que debe resolverse.

### A6 — Modelo de Campos de Auditoría (MEDIO)
**Pregunta**: El BRD establece "campos de auditoría para operaciones de creación/actualización" (RN-007). ¿Qué debe auditarse exactamente? (`created_at`, `updated_at`, `created_by`, `updated_by`? ¿Una tabla `audit_log` separada?)  
**Impacto**: Diseño del esquema de base de datos y estimación de esfuerzo para las operaciones CRUD.

### A7 — Reglas de Reactivación (MEDIO)
**Pregunta**: ¿Puede cualquier administrador reactivar a cualquier usuario desactivado (HU-006)? ¿Existe algún período de espera o límite? ¿Puede un administrador desactivado reactivarse a sí mismo?  
**Impacto**: Completitud de las reglas de negocio para el endpoint de reactivación y las verificaciones RBAC.

### A8 — Valores Predeterminados de Paginación (BAJO)
**Pregunta**: ¿Cuál es el tamaño de página predeterminado para el listado de usuarios (HU-002)? ¿Se requiere paginación basada en cursor u offset?  
**Impacto**: Contrato de la API y diseño del componente de lista en el frontend. El BRD menciona "paginación" pero no especifica valores predeterminados.

### A9 — Interpretación de la Disponibilidad (BAJO)
**Pregunta**: "Disponibilidad 99%" — ¿es un SLA estricto para la infraestructura v1 o un objetivo de despliegue para operaciones futuras?  
**Impacto**: Si es SLA estricto: requiere infraestructura de alta disponibilidad (balanceador de carga, réplicas) que está fuera del alcance. Si es aspiracional para v1: documentarlo como objetivo no funcional sin mandatar infraestructura específica. Dada la magnitud de v1, la segunda opción es más realista.

### A10 — Alcance del Entregable "Gestión de Roles" (ALTO — Contradicción de Alcance)
**Pregunta**: La lista de entregables incluye "gestión de roles", pero HU-001..HU-007 no contienen historias de usuario para gestionar roles. ¿La gestión de roles se refiere únicamente a la asignación de roles existentes a usuarios (cubierta por HU-003/HU-004), o también incluye crear y editar roles?  
**Impacto**: Si crear/editar roles está en el alcance → se necesitan 1–2 historias de usuario adicionales y un flujo CRUD de `roles`. Si no → el término "gestión de roles" en los entregables debería renombrarse a "asignación de roles" para evitar confusión.

---

## Riesgos

| # | Riesgo | Severidad | Mitigación |
|---|--------|-----------|-----------|
| R1 | Sin stack tecnológico definido — bloquea todas las fases posteriores | **Crítico** | Resolver A1 antes de la propuesta |
| R2 | Conflicto JWT + desactivación (RN-004 vs tokens apátridas) | **Alto** | Resolver A2 + A3 juntos; elegir sesiones o patrón de lista de bloqueo |
| R3 | Ambigüedad del alcance de "gestión de roles" puede inflar el alcance v1 de forma inesperada | **Alto** | Resolver A10; clarificar el propósito del entregable |
| R4 | Sin runner de pruebas configurado — la fase de verificación será manual | **Medio** | Agregar runner de pruebas (Jest/Vitest) como primera tarea de configuración; actualizar `openspec/config.yaml` |
| R5 | La disponibilidad del 99% no puede garantizarse solo mediante código de aplicación | **Medio** | Declarar como objetivo de despliegue, no como requisito de código v1 |
| R6 — Política de contraseñas indefinida — reglas de validación sin determinar | **Medio** | Resolver A4 antes de las specs |
| R7 | Modelo de auditoría indefinido — las decisiones de esquema son irreversibles una vez que existen datos | **Medio** | Resolver A6 antes del diseño |
| R8 | Greenfield: todas las decisiones arquitectónicas tomadas en un solo sprint | **Medio** | Usar esta exploración como mecanismo forzador; resolver A1–A10 antes de aprobar la propuesta |

---

## Listo para la Propuesta

**Aún no — deben resolverse 3 bloqueos:**

1. **A1 (Stack Tecnológico)** — la propuesta no puede nombrar archivos, patrones ni herramientas sin esto.
2. **A2 + A3 (Estrategia de Autenticación + Invalidación por Desactivación)** — la spec del módulo de autenticación depende por completo de estas decisiones.
3. **A10 (Alcance de la Gestión de Roles)** — riesgo de inflación de alcance silenciosa si se deja sin resolver.

**Una vez resueltos A1, A2/A3 y A10**, las ambigüedades restantes (A4–A9) pueden abordarse
dentro de las fases de propuesta o specs sin bloquearlas.

**Lo que el orquestador debe comunicar al usuario:**

> "La exploración está completa. Antes de pasar a la propuesta, necesito 3 decisiones de tu parte:
> 1. **Stack tecnológico** — ¿qué framework, lenguaje y base de datos estás considerando?
> 2. **Estrategia de autenticación** — ¿JWT (cookies o header?) o sesiones del lado del servidor?
> 3. **Alcance de la gestión de roles** — ¿'gestión de roles' significa asignar roles existentes a usuarios, o también crear y editar roles desde una interfaz?"
