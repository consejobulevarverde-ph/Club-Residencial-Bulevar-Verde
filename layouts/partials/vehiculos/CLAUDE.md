# Vehículos — Claude Code Guide

## Propósito

Pestaña "Vehículos" compartida por `/vigilancia-datos/` y `/administracion-datos/`, con la misma vista en ambos paneles. Tiene tres sub-pestañas: **Registrar** (vincular un vehículo a un apartamento), **Reporte** (vehículos asignados/desasignados en un rango de fechas, con exportación CSV) y **Sanciones** (vehículos que vigilancia registró en el parqueadero de visitantes con el lector de placas).

En la UI se dice **apartamento**, nunca "unidad" (en datos sigue siendo `Unidad`): los vigilantes no distinguen los dos términos.

## Archivos

| Archivo | Rol |
|---------|-----|
| `index.html` | Contenedor: nav de sub-pestañas (`#showVehiculosRegistrar`, `#showVehiculosReporte`, `#showVehiculosSanciones`), incluye los tres partials y carga `static/js/vehiculos.js` con `window.VEHICULOS_CONFIG = { apiBase }` |
| `registrar.html` | Formulario de registro (`#vehiculosRegistrarView`), con alerta propia `#vehRegistroAlert` |
| `reporte.html` | Filtros, totales, tabla y CSV (`#vehiculosReporteView`, ids con prefijo `vr`) |
| `sanciones.html` | Rango de fechas, totales, filtros y lista (`#vehiculosSancionesView`, ids con prefijo `vs`) + visor de foto `#vsVisor` (se mueve a `<body>` al iniciar) |

Se incluye como `<section id="vehiculosView" class="hidden">{{ partial "vehiculos/index.html" . }}</section>` en ambas páginas.

## JavaScript

`static/js/vehiculos.js` es un IIFE autocontenido (no depende de `core.js` ni del IIFE de vigilancia). Obtiene su propio ID token de Firebase (`getAuthToken()`, mismo patrón que `convivencia-form.js`) y tiene sus propios `esc`, `apiFetch` y `busy`.

- Expone `window.BVVehiculos.mostrar()`: muestra la sub-pestaña actual. Lo llaman `mode('vehicle')` en vigilancia y el stub `static/js/administracion-datos/vehiculos.js` (`registrarModulo`, `onFirstShow`) en administración.
- El reporte y Sanciones se consultan la primera vez que se abre su sub-pestaña (mes actual). Tras registrar un vehículo, el reporte se vuelve a consultar al regresar, conservando el rango elegido.
- **Sanciones** usa el mismo formato que la lista de la ronda del lector de placas (miniatura, placa, ícono de tipo, fecha corta, solo el número de apartamento, ícono de estado; textos largos en `title`/`aria-label`). Los registros "Sin apartamento" tienen un lápiz que abre un campo para asignar el apartamento. La foto completa se pide a la API con el token y se muestra como blob (el bucket es privado).

## API

- Registrar: `POST /api/v1/vigilancia/registrar-vehiculo`.
- Reporte: `GET /api/v1/vigilancia/reportes/vehiculos?desde=YYYY-MM-DD&hasta=YYYY-MM-DD` (máx. 93 días, hora Colombia) → Data Connect `ReporteMovimientosVehiculos` en `dataconnect/admin/vigilancia.gql`.
- Sanciones (`dataconnect/admin/parqueadero_visitantes.gql`):
  - `GET /api/v1/vigilancia/parqueadero-visitantes/registros?desde=&hasta=` (máx. 93 días, 500 registros, miniatura incrustada como dataUrl).
  - `GET /api/v1/vigilancia/parqueadero-visitantes/registros/:id/foto` (foto completa).
  - `PATCH /api/v1/vigilancia/parqueadero-visitantes/registros/:id/apartamento` `{ apartamento }` — solo si el registro aún no tiene apartamento (`409` si ya tiene); guarda quién lo asignó.

Todos los endpoints viven en el router de vigilancia, que ya admite los roles vigilancia, administrador y superadmin.

## Reglas

- La validación de placa (`placaValida`) debe coincidir con `src/modules/vigilancia/placas.ts` en la API.
- No anidar modales dentro de estas vistas (ver `layouts/CLAUDE.md`); el visor de foto de Sanciones es un overlay propio movido a `<body>`, no un modal de Bootstrap.
