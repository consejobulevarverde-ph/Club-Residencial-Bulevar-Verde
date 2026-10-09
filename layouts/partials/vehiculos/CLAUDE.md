# Vehículos — Claude Code Guide

## Propósito

Pestaña "Vehículos" compartida por `/vigilancia-datos/` y `/administracion-datos/`. Sub-pestañas: **Registrar** (vincular un vehículo a un apartamento), **Reporte** (vehículos asignados/desasignados en un rango de fechas, con exportación CSV), **Sanciones** (vehículos que vigilancia registró en el parqueadero de visitantes con el lector de placas) y, **solo en administración**, **Configuración** (valor de la sanción y días de gracia). El bloque de controversias de residentes vive dentro de Sanciones y también es solo de administración.

En la UI se dice **apartamento**, nunca "unidad" (en datos sigue siendo `Unidad`): los vigilantes no distinguen los dos términos.

## Archivos

| Archivo | Rol |
|---------|-----|
| `index.html` | Contenedor: nav de sub-pestañas (`#showVehiculosRegistrar`, `#showVehiculosReporte`, `#showVehiculosSanciones` y, con modo admin, `#showVehiculosConfiguracion`), incluye los partials y carga `static/js/vehiculos.js` con `window.VEHICULOS_CONFIG = { apiBase, modo }` |
| `registrar.html` | Formulario de registro (`#vehiculosRegistrarView`), con alerta propia `#vehRegistroAlert` |
| `reporte.html` | Filtros, totales, tabla y CSV (`#vehiculosReporteView`, ids con prefijo `vr`) |
| `sanciones.html` | Rango de fechas, totales, filtros y lista (`#vehiculosSancionesView`, ids con prefijo `vs`) + visor de foto `#vsVisor` (se mueve a `<body>` al iniciar). Con modo admin añade el bloque de controversias (prefijo `vk`) |
| `configuracion.html` | Tarifas y días de gracia (`#vehiculosConfiguracionView`, prefijo `vc`). Solo se renderiza con modo admin |

Se incluye **siempre con un dict**, porque el partial decide por `modo` qué bloques renderiza:

```go-html-template
{{ partial "vehiculos/index.html" (dict "ctx" . "modo" "admin") }}       <!-- administracion-datos -->
{{ partial "vehiculos/index.html" (dict "ctx" . "modo" "vigilancia") }}  <!-- vigilancia-datos -->
```

El gating es build-time, al estilo de `partials/convivencia-casos/index.html`: ninguna página del portal
lee claims de Firebase. Es ocultamiento de UI; la autorización real la aplica la API con `requireRoles`.

## JavaScript

`static/js/vehiculos.js` es un IIFE autocontenido (no depende de `core.js` ni del IIFE de vigilancia). Obtiene su propio ID token de Firebase (`getAuthToken()`, mismo patrón que `convivencia-form.js`) y tiene sus propios `esc`, `apiFetch` y `busy`.

- Expone `window.BVVehiculos.mostrar()`: muestra la sub-pestaña actual. Lo llaman `mode('vehicle')` en vigilancia y el stub `static/js/administracion-datos/vehiculos.js` (`registrarModulo`, `onFirstShow`) en administración.
- El reporte y Sanciones se consultan la primera vez que se abre su sub-pestaña (mes actual). Tras registrar un vehículo, el reporte se vuelve a consultar al regresar, conservando el rango elegido.
- **Sanciones** usa el mismo formato que la lista de la ronda del lector de placas (miniatura, placa, ícono de tipo, fecha corta, solo el número de apartamento, ícono de estado; textos largos en `title`/`aria-label`). Los registros "Sin apartamento" tienen un lápiz que abre un campo para asignar el apartamento. La foto completa se pide a la API con el token y se muestra como blob (el bucket es privado).

## API

- Registrar: `POST /api/v1/vigilancia/registrar-vehiculo`. Con `tipoVinculo: VISITANTE` exige `autorizadoPorPersonaId`, y la API comprueba que esa persona esté vinculada a ese apartamento.
- Precarga de «quién autoriza»: `GET /api/v1/vigilancia/apartamentos/:apartamento/residentes` — resuelve el apartamento y devuelve sus personas sin el correo. El formulario la pide al salir del campo de apartamento y memoriza el último consultado para no repetir la llamada en cada blur.
- Reporte: `GET /api/v1/vigilancia/reportes/vehiculos?desde=YYYY-MM-DD&hasta=YYYY-MM-DD` (máx. 93 días, hora Colombia) → Data Connect `ReporteMovimientosVehiculos` en `dataconnect/admin/vigilancia.gql`.
- Sanciones (`dataconnect/admin/parqueadero_visitantes.gql`):
  - `GET /api/v1/vigilancia/parqueadero-visitantes/registros?desde=&hasta=` (máx. 93 días, 500 registros, miniatura incrustada como dataUrl).
  - `GET /api/v1/vigilancia/parqueadero-visitantes/registros/:id/foto` (foto completa).
  - `PATCH /api/v1/vigilancia/parqueadero-visitantes/registros/:id/apartamento` `{ apartamento }` — solo si el registro aún no tiene apartamento (`409` si ya tiene); guarda quién lo asignó. Una controversia aceptada deja el registro sin apartamento, así que vuelve a ser asignable por aquí.
- Controversias y configuración (**solo `administrador`/`superadmin`**, con `requireRoles` por ruta):
  - `GET .../controversias?estado=PENDIENTE|ACEPTADA|RECHAZADA` — incluye el vínculo congelado que atribuyó el registro y marca `retiradoTrasLaCaptura`.
  - `POST .../controversias/:id/resolucion` `{ decision: ACEPTAR|RECHAZAR, motivo }` — aceptar **desasocia** el apartamento sin borrar el registro; `409` si ya estaba resuelta.
  - `GET .../tarifas` (la lee también vigilancia) y `PUT .../tarifas/:tipoVehiculo` `{ valorSancion, diasGraciaVisitante, diasGraciaResidente }`.
  - `GET .../configuracion` (la lee también vigilancia) y `PUT .../configuracion` `{ maxHorasAutorizacionVisitante }` — tope de la ventana que el residente puede elegir al pre-autorizar. Una sola fila global (`id = "GLOBAL"`).
- Pre-autorizaciones: `GET .../autorizacion-vigente?placa=` — si un residente ya autorizó esa placa desde su portal, el formulario lo avisa y el vigilante no tiene que registrarla.

El resto de endpoints vive en el router de vigilancia, que admite los roles vigilancia, administrador y superadmin.

## Reglas

- La validación de placa (`placaValida`) debe coincidir con `src/modules/vigilancia/placas.ts` en la API.
- `$()` es `getElementById` sin null-check: los bloques que solo existen en administración se enganchan dentro de un `if ($(...))`, o `init()` revienta en la página de vigilancia.
- `modoVehiculos()` muestra el Reporte solo cuando el nombre es `reporte`; no uses un fallback por descarte al añadir una vista nueva.
- El formulario de registro va en este orden: apartamento, placa, tipo. El tipo se deduce del formato de la placa (`ABC123` carro, `ABC12D` moto; tolera espacios y guion) y es editable: una corrección manual vale para esa placa y, si se escribe otra, se vuelve a deducir. Con `ELECTRICO`/`SIN PLACA` no se deduce nada. La API sigue exigiendo que placa y tipo coincidan, así que corregir el tipo solo sirve con esas dos placas especiales.
- Registrar un vehículo cierra los vínculos vigentes de esa placa (un vehículo tiene una sola unidad actual) y recupera los registros del parqueadero que quedaron sin apartamento en los últimos 30 días.
- No anidar modales dentro de estas vistas (ver `layouts/CLAUDE.md`); el visor de foto de Sanciones es un overlay propio movido a `<body>`, no un modal de Bootstrap.
