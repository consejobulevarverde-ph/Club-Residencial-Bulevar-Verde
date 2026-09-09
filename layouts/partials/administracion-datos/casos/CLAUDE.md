# Casos de Convivencia — Claude Code Guide

## Propósito

Partials de la pestaña "Casos Convivencia" (`/administracion-datos/`, panel administrativo). Muestra la lista de casos de convivencia registrados, su estado (máquina de estados Ley 675/2001), detalles, y acciones disponibles según el estado actual del caso.

## Archivos

| Archivo | Rol | Invocado desde |
|---------|-----|----------------|
| `casos-convivencia.html` | Vista de lista/detalle/acciones | `<section id="casosConvivenciaView">` en `layouts/administracion-datos/list.html` vía `{{ partial "administracion-datos/casos/casos-convivencia" . }}` |
| `modales.html` | Modales Bootstrap: "Editar información del caso" + "Anular caso" | Final de `<main>` en `list.html`, como hermano directo de `<section id="app">` |

## Lógica Asociada

**Pareja JavaScript**: `static/js/administracion-datos/casos-convivencia.js` — stub delgado que se auto-registra como módulo:

```javascript
AdminDatos.registrarModulo({
  id: 'casosConvivencia',
  buttonId: 'showCasosConvivencia',
  viewId: 'casosConvivenciaView',
  onFirstShow: AdminDatos.cargarCasosConvivencia
});
```

**Lógica real**: Todo el comportamiento (`cargarCasosConvivencia`, render de lista/detalle, handlers de acciones de estado) vive en `static/js/administracion-datos/core.js` bajo el namespace `window.AdminDatos`, exponiendo:
- `AdminDatos.cargarCasosConvivencia` — carga los casos desde la API y renderiza la lista
- `AdminDatos.state.currentUnidadId` — unidad seleccionada en el búsqueda del dashboard
- Helpers: `AdminDatos.$()`, `AdminDatos.apiFetch()`, `AdminDatos.msg()`, etc.

## Restricción Crítica: Modales Nunca Anidados

Los modales en `modales.html` **siempre se llaman aparte, al final de `<main>`**, como hermanos directos de `<section id="app">` — **nunca anidados** dentro de `<section id="casosConvivenciaView">`. Razón: si un modal quedara dentro de un `<section>` que está oculto con `.hidden` (que aplica `display:none`), el navegador no lo mostraría aunque Bootstrap intente abrirlo (un ancestro oculto occulta todo el subárbol, incluidos los `display: block` del modal).

## Particularidad Preservada (No Corregida)

Los handlers de `#editCasoSubmitBtn` y `#anularCasoSubmitBtn` (en `core.js`) llaman `.json()` sobre un resultado de `AdminDatos.apiFetch()` que ya viene parseado en JSON — parece un bug latente que probablemente cae en el `.catch()` y muestra un error genérico al admin. **Se reubicó tal cual durante el refactor, sin corregir**. Se puede arreglar aparte como follow-up si se quiere.

## Nota: "Registrar Caso" Es Otro Directorio

El flujo "Registrar Caso" (crear un nuevo caso de convivencia desde cero) es completamente separado, no vive aquí:
- Partial: `layouts/partials/convivencia-form.html`
- JavaScript: `static/js/convivencia-form.js` (con su propio namespace `window.BVEvidenceCamera` para captura de fotos)

"Registrar Caso" aparece como botón en el nav superior del panel (`showConvivencia`) y apunta a un formulario wizard que está compartido con la página `/vigilancia-datos/`.

## Extensión Futura

Para agregar un nueva acción o cambiar la UI de la lista:
1. Editar `casos-convivencia.html` para el markup
2. Buscar la función correspondiente en `core.js` (`cargarCasosConvivencia`, handlers de botones, etc.) y actualizar ahí
3. Revisar que los IDs de elementos coincidan entre el HTML y la lógica en `core.js`

---

**Last updated**: 2026-09-08 — creado como parte del refactor de `administracion-datos/list.html`, documentando la arquitectura modular post-split
