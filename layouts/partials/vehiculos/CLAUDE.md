# Vehículos — Claude Code Guide

## Propósito

Pestaña "Vehículos" compartida por `/vigilancia-datos/` y `/administracion-datos/`, con la misma vista en ambos paneles. Tiene dos sub-pestañas: **Registrar** (vincular un vehículo a una unidad) y **Reporte** (vehículos asignados/desasignados en un rango de fechas, con exportación CSV).

## Archivos

| Archivo | Rol |
|---------|-----|
| `index.html` | Contenedor: nav de sub-pestañas (`#showVehiculosRegistrar`, `#showVehiculosReporte`), incluye los dos partials y carga `static/js/vehiculos.js` con `window.VEHICULOS_CONFIG = { apiBase }` |
| `registrar.html` | Formulario de registro (`#vehiculosRegistrarView`), con alerta propia `#vehRegistroAlert` |
| `reporte.html` | Filtros, totales, tabla y CSV (`#vehiculosReporteView`, ids con prefijo `vr`) |

Se incluye como `<section id="vehiculosView" class="hidden">{{ partial "vehiculos/index.html" . }}</section>` en ambas páginas.

## JavaScript

`static/js/vehiculos.js` es un IIFE autocontenido (no depende de `core.js` ni del IIFE de vigilancia). Obtiene su propio ID token de Firebase (`getAuthToken()`, mismo patrón que `convivencia-form.js`) y tiene sus propios `esc`, `apiFetch` y `busy`.

- Expone `window.BVVehiculos.mostrar()`: muestra la sub-pestaña actual. Lo llaman `mode('vehicle')` en vigilancia y el stub `static/js/administracion-datos/vehiculos.js` (`registrarModulo`, `onFirstShow`) en administración.
- El reporte se consulta la primera vez que se abre su sub-pestaña (mes actual). Tras registrar un vehículo, se vuelve a consultar al regresar al reporte, conservando el rango elegido.

## API

- Registrar: `POST /api/v1/vigilancia/registrar-vehiculo`.
- Reporte: `GET /api/v1/vigilancia/reportes/vehiculos?desde=YYYY-MM-DD&hasta=YYYY-MM-DD` (máx. 93 días, hora Colombia) → Data Connect `ReporteMovimientosVehiculos` en `dataconnect/admin/vigilancia.gql`.

Ambos endpoints viven en el router de vigilancia, que ya admite los roles vigilancia, administrador y superadmin.

## Reglas

- La validación de placa (`placaValida`) debe coincidir con `placaCoincideConTipo` en `bulevar-verde-api/src/modules/vigilancia/routes.ts`.
- No anidar modales dentro de estas vistas (ver `layouts/CLAUDE.md`); hoy no hay ninguno.
