# Reservas — Claude Code Guide

## Propósito

Partials de la pestaña "Reservas" (`/administracion-datos/`, panel administrativo). Sistema de gestión de reservas de zonas comunes, con tres sub-vistas: calendario de agenda, catálogo de zonas, y formulario para reservar/editar reservas.

## Archivos

| Archivo | Rol | Pareja JS |
|---------|-----|-----------|
| `index.html` | Contenedor: nav de sub-pestañas + 3 llamadas a partials | Referenciado por `list.html`: `{{ partial "administracion-datos/reservas/index" . }}` dentro de `<section id="reservasView">` |
| `agenda.html` | Calendario de reservas (grid: zonas × fechas, con slots de 1 hora) | `reservas-agenda.js` |
| `catalogo.html` | CRUD de zonas (listar, crear, editar, eliminar) | `reservas-catalogo.js` |
| `reservar.html` | Formulario de "Reservar" y flujo de "Editar reserva" (intencional duplicación del original) | `reservas-formulario.js` |
| `modal-zona.html` | Modal "Editar zona" (`#modalEditarZona`) | `reservas-catalogo.js` |
| `modales.html` | Modales de acciones de reserva: aprobar, rechazar, cancelar, registrar pago, editar | `reservas-formulario.js` |

## Lógica Asociada

**Sub-pestañas internas** (`index.html`): Los botones `#showReservasAgenda`, `#showReservasReservar`, `#showReservasCatalogo` controlan qué sub-vista se muestra. El wiring está en `core.js` con un mecanismo similar a `registrarModulo`, pero localizado al sub-nav, no al nav superior del panel.

**JavaScript stubs** (todos en `static/js/administracion-datos/`):
- `reservas-agenda.js` — **único que se auto-registra** como módulo del panel superior:
  ```javascript
  AdminDatos.registrarModulo({
    id: 'reservas',
    buttonId: 'showReservas',
    viewId: 'reservasView',
    onFirstShow: AdminDatos.cargarReservasAgenda  // Dispara la carga del calendario
  });
  ```
- `reservas-catalogo.js`, `reservas-formulario.js` — stubs delgados, no usan `registrarModulo`, porque su activación es vía los botones de sub-nav en `index.html`

**Lógica real**: `static/js/administracion-datos/core.js` bajo el namespace `window.AdminDatos`, exponiendo:
- `AdminDatos.cargarReservasAgenda` — carga el calendario y renderiza los slots
- `AdminDatos.state.reservarUnidadId`, `reservarReservasDelDiaCache`, etc. — estado compartido entre sub-vistas
- Helpers: `AdminDatos.$()`, `AdminDatos.apiFetch()`, `AdminDatos.msg()`, etc.
- Emoji: `getEmojiZona()`, `getEmojiEstado()` para badges visuales

## Restricción Crítica: Modales Nunca Anidados

Los modales en `modal-zona.html` y `modales.html` **siempre se llaman aparte, al final de `<main>`**, como hermanos directos de `<section id="app">` — **nunca anidados** dentro de `<section id="reservasView">`. Razón: un modal dentro de un `<section>` oculto con `.hidden` (`display:none`) no se mostraría, aunque Bootstrap intente abrirlo.

## Particularidades Preservadas (No Corregidas)

1. **Código muerto**: `cargarReservasFiltroZonas()` en `core.js` apunta a `#filtroZona` que no existe en ningún partial — se reubicó tal cual durante el refactor, sin eliminar.
2. **Sub-vistas "Reservar" y "Editar"**: ambas usan el mismo formulario (`reservar.html`) con lógica duplicada intencionalmente en el original — se mantiene tal cual, no se consolidó.

## Extensión Futura

Para agregar un campo a la zona o cambiar el calendario:
1. **Markup**: editar el partial correspondiente (`catalogo.html`, `agenda.html`, etc.)
2. **Lógica**: buscar y actualizar la función en `core.js` (p. ej. `cargarReservasAgenda`, `renderZona`, handlers de acciones)
3. **IDs de elementos**: asegurarse de que coincidan entre el HTML y la lógica en `core.js`

Ejemplos de tareas:
- **Add a new zone field** → editar `catalogo.html` (form markup) + `core.js` (submit handler / POST body)
- **Add a new zone type or emoji** → editar `core.js` (`getEmojiZona()`)
- **Change calendar grid layout** → editar `agenda.html` (markup) + `core.js` (`cargarReservasAgenda()`)

---

**Last updated**: 2026-09-08 — creado como parte del refactor de `administracion-datos/list.html`, documentando la arquitectura modular post-split
