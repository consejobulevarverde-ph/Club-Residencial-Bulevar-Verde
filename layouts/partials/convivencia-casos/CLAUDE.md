# Casos de Convivencia (vista compartida) — Claude Code Guide

## Propósito

Vista "Casos Convivencia" — lista, detalle y acciones de la máquina de estados (Ley 675/2001) — compartida
por dos páginas con autenticación distinta:

| Página | Modo | API | Token |
|--------|------|-----|-------|
| `/administracion-datos/` (tab "Casos Convivencia") | `admin` | `/api/v1/convivencia` | Firebase ID token |
| `/comite-convivencia-datos/` | `comite` | `/api/v1/comite-convivencia` | Token de sesión del comité (`sessionStorage.bvComiteConvivenciaToken`) |

Mismo patrón que `layouts/partials/vehiculos/` (partial + script autocontenido), extendido con token y
permisos por llamador.

## Archivos

| Archivo | Rol |
|---------|-----|
| `index.html` | Lista/detalle/bloques de acción, alerta propia `#casosConvivenciaAlert`, y un `<script>` inline que define la config base según el modo: `{{ partial "convivencia-casos/index.html" (dict "ctx" . "modo" "admin") }}` |
| `modales.html` | Modales "Editar información del caso" (solo narrativa; la severidad tiene su propio bloque) y "Anular caso" |
| `static/js/convivencia-casos.js` | Toda la lógica (IIFE autocontenido, no depende de `core.js`). Expone `window.BVConvivenciaCasos.mostrar()` |

## Config (`window.CONVIVENCIA_CASOS_CONFIG`)

- Del partial (según `modo`): `apiBase` (host), `rutaCasos`, `acciones`, `anularSoloSinSancion`.
- De la página: `obtenerToken()` (Promise<string>) y, opcional, `onNoAutorizado()` (401).
  - Admin: `static/js/administracion-datos/casos-convivencia.js` (stub que además registra el tab con
    `AdminDatos.registrarModulo`, `onFirstShow` → `BVConvivenciaCasos.mostrar()`).
  - Comité: la IIFE de `layouts/comite-convivencia-datos/list.html`.
- El script lee la config **en cada llamada**, así la página puede completarla después de cargarlo.

## Acciones por llamador

Cada bloque se muestra si la acción está en `acciones` **y** el estado del caso la admite
(`actualizarAccionesDisponibles`):

| Acción | Elemento | Admin | Comité | Además requiere |
|--------|----------|:-----:|:------:|-----------------|
| `EDITAR` | `casoDetailEditarBtn` | ✓ | | — |
| `ANULAR` | `casoDetailAnularBtn` | ✓ | ✓ | estado ≠ `ANULADO`; comité: sin `sancion` |
| `EVIDENCIA_CASO` | `casoDetailEvidenciaForm` | ✓ | | estado ≠ `ANULADO` |
| `CAMBIAR_SEVERIDAD` | `casoAccionesSeveridad` | ✓ | ✓ | sin `sancion` y estado no terminal |
| `ACTA_COMITE` | `casoAccionesComite` | ✓ | ✓ | proceso formal, `PENDIENTE_DESCARGOS`/`CON_DESCARGOS`, sin acta |
| `CIERRE` | `casoAccionesCierre` (cerrar sin sanción o archivar) | ✓ | ✓ | `PENDIENTE_DESCARGOS`/`CON_DESCARGOS` |
| `PROPONER_SANCION` | `casoAccionesProponerSancion` | ✓ | | proceso formal, en trámite |
| `CONSEJO_DECISION` | `casoAccionesConsejo` | ✓ | | `PENDIENTE_APROBACION_CONSEJO` |
| `RESOLVER_APELACION` | `casoAccionesApelacion` | ✓ | | `EN_APELACION` |

El comité es conciliador (Ley 675, Art. 58): no aprueba ni propone sanciones y solo actúa antes de que el
caso tenga una sanción impuesta. La API aplica las mismas reglas; la UI solo evita mostrar lo que fallaría.

## Reglas

- **Modales fuera de secciones ocultas**: `modales.html` se incluye al final de `<main>`, como hermano de las
  secciones de la página, nunca dentro de `#casosConvivenciaView`/`#comiteApp` (un ancestro con `.hidden`
  oculta el modal aunque Bootstrap lo abra).
- **Orden de carga**: el partial solo define la config; `js/convivencia-casos.js` se carga al final de la
  página, después de `modales.html`. Los modales se instancian al primer uso porque `bootstrap.bundle` se
  carga después de los scripts en administración.
- `apiFetch` del script ya devuelve el JSON parseado: usar `resp.data`, nunca `.json()` sobre su resultado.
- Nuevas sub-rutas: deben existir con el mismo path en `/api/v1/convivencia` y, si el comité las usa, en
  `/api/v1/comite-convivencia` (`bulevar-verde-api/src/modules/comite-convivencia/routes.ts`).

## "Registrar Caso" es otro flujo

Crear un caso nuevo vive en `layouts/partials/convivencia-form.html` + `static/js/convivencia-form.js`,
compartido con `/vigilancia-datos/`. El comité no crea casos.
