# Casos de Convivencia (vista compartida) — Claude Code Guide

## Propósito

Vista "Casos Convivencia" — lista, detalle y acciones de la máquina de estados (Ley 675/2001) — compartida
por cuatro páginas con autenticación distinta:

| Página | Modo | API | Token |
|--------|------|-----|-------|
| `/administracion-datos/` (tab "Casos Convivencia") | `admin` | `/api/v1/convivencia` | Firebase ID token |
| `/comite-convivencia-datos/` | `comite` | `/api/v1/comite-convivencia` | Token de sesión del comité (`sessionStorage.bvComiteConvivenciaToken`) |
| `/consejo-administracion-datos/` | `consejo` | `/api/v1/consejo-administracion` | Token de sesión del consejo (`sessionStorage.bvConsejoAdministracionToken`); **solo consulta** (`acciones: []`) |
| `/revisor-fiscal-datos/` | `revisor` | `/api/v1/revisor-fiscal` | Token de la revisoría (`sessionStorage.bvRevisorFiscalToken`, propósito `SESION_REVISOR_FISCAL`); **solo consulta**, ve los mismos casos que el consejo |

Las páginas del comité, del consejo y de la revisoría fiscal comparten el shell `layouts/partials/organo-portal.html` (login por documento + esta vista);
cada `list.html` solo le pasa prefijo de IDs, ruta de login y claves de `sessionStorage`.

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
| `DESCARGOS_EN_NOMBRE` | `casoAccionesDescargos` (registrar descargos por el residente) | ✓ | ✓ | `PENDIENTE_DESCARGOS`, sin `descargosResidente` — mismo endpoint/schema que usa el propio residente (`registrarDescargos` en `convivencia/actions.ts`) |
| `NOTIFICACIONES` | botones en `casoDetailRegistro` (reintentar / marcar como enviada) | ✓ | | notificación `FALLIDA`, `INCIERTA` o `SIN_DESTINATARIOS` (marcar enviada: solo `INCIERTA`) |
| `OCULTAR_EVIDENCIA` | switch `casoDetailEvidenciaOcultaSwitch` junto a «Evidencias» | ✓ | | cualquier estado y registro; reversible |
| `NOTIFICAR` | botón `casoDetailNotificarBtn` + modal `modalNotificarCaso` | ✓ | | caso `FINALIZADO` y no `ANULADO`, notificación a residentes no en curso («Notificar» / «Volver a notificar») |
| `REMITIR` | `casoDetailRemisionSection` (pipeline Administración ▶ Comité ▶ Consejo, botones `casoRemisionComiteBtn` / `casoRemisionConsejoBtn`) | ✓ | | caso `FINALIZADO` y no `ANULADO`; definitiva por órgano |

**Notificación al residente:** un llamado de atención (`requiereProcesoFormal: false`) se notifica solo al finalizar; un caso de
proceso formal queda `pendienteNotificar` (insignia «Pendiente de notificar», fila `RESIDENTES` en `POR_NOTIFICAR`): el residente no
lo ve y la API rechaza el trámite con `409 caso_pendiente_notificar` (también la remisión). Administración lo notifica con el modal
(`GET {rutaCasos}/casos/{id}/destinatarios`, `POST …/notificar { personaIds }`): casilla, nombre, correo y tipo, todos preseleccionados
(salvo sin correo) y «Enviar notificación» al final. Los correos los resuelve el servidor, nunca el cliente. «Notificado» solo con
`ENVIADA` (aceptada por el servidor de correo); el historial dice «Notificado a: …». Se puede volver a notificar.

**Comunicación de las decisiones del Consejo:** al aprobar o rechazar la sanción y al ratificar o revocar tras el recurso, la API
registra la decisión y deja en la misma transacción una fila de notificación `SANCION`, `RECURSO` o `CIERRE_SIN_SANCION` que se envía
sola a los destinatarios del aviso del caso (reglamento arts. 46 y 48; Ley 675 arts. 51 y 62: de ahí corren los 5 días hábiles de la
reposición y el mes de la impugnación). Aquí solo se muestran en «Registro y notificación» (títulos en `TITULO_NOTIFICACION`) con
reintentar / marcar como enviada; no se calcula la fecha límite porque los días hábiles dependen de los festivos.

**Lectura del residente:** `fechaLecturaResidente` (+ `lecturaResidentePorUid`) en el detalle. Lo marca el portal del residente
(`layouts/datos-personales/list.html`): a los 20 s de abrir el detalle del caso llama `POST /sanciones/{caseCode}/lectura`, **en
silencio** (sin toast, insignia ni mensaje; un error se ignora y se reintenta al reabrir). Aquí solo se muestra: «Leída por el residente
el …» o «Sin abrir en el portal» en la fila de la notificación a residentes. Mide que el residente abrió el caso en el portal, no que
leyó el correo. Se conserva la primera lectura: «Volver a notificar» no la reinicia.

**Evidencia oculta:** `evidenciaOculta` (detalle y lista). Administración la ve siempre, con insignia «Evidencia oculta» y el switch;
para comité, consejo, residente y vigilancia la **API** devuelve `evidencias: []`/`adjuntos: []` y responde 404 al abrir archivos
(`sinEvidenciaOculta`). El front solo muestra el aviso `casoDetailEvidenciaOcultaAviso` (y `sancionEvidenciaOcultaAviso` en
`layouts/datos-personales/list.html`); nunca debe confiar en ocultar en el cliente. `PATCH {rutaCasos}/casos/{id}/evidencia-oculta`
con `{ oculta }` (solo admin; eventos `EVIDENCIA_OCULTADA` / `EVIDENCIA_MOSTRADA`).

**Remisión (visibilidad por órgano):** administración ve y gestiona todos los casos. Cada caso trae `remitidoComite` / `remitidoConsejo`
(+ `fechaRemision*`); un caso nuevo nace sin remitir. La API solo muestra al comité los casos con `remitidoComite` y al consejo los
con `remitidoConsejo` (el resto responde 404 aunque se conozca el id). Las dos etapas son independientes y la remisión es definitiva
(`POST {rutaCasos}/casos/{id}/remitir` con `{ organo: "COMITE" | "CONSEJO" }`; eventos `CASO_REMITIDO_COMITE` / `CASO_REMITIDO_CONSEJO`).
La lista de administración muestra insignias «Comité» / «Consejo» por fila. El consejo no tiene acciones: sus decisiones (aprobar,
rechazar, devolver) las sigue registrando administración con `CONSEJO_DECISION`.

**Registro progresivo:** un caso con `registro: BORRADOR` («Pendiente de completar») aún no se finalizó ni se notificó. La lista de
administración lo muestra con insignia; el comité no lo ve (la API lo filtra). En el detalle solo quedan editar, severidad y anular:
las acciones del procedimiento las rechaza la API (`caso_en_borrador`). `casoDetailRegistroSection` muestra los archivos declarados
del borrador y el estado de cada notificación; «Enviada» significa aceptada por el servidor de correo. Evidencias con
`almacenamiento: GCS` se abren con `GET {rutaCasos}/casos/{id}/evidencias/{evidenciaId}/acceso` (URL firmada de 15 min).

El comité es conciliador (Ley 675, Art. 58): no aprueba ni propone sanciones y solo actúa antes de que el
caso tenga una sanción impuesta. La API aplica las mismas reglas; la UI solo evita mostrar lo que fallaría.

## Pestañas «Resumen» y «Casos»

La vista abre en **«Resumen»** (`#casosConvivenciaResumenView`): tarjetas con conteos de **todos** los casos, para los tres
llamadores, y desglose de los casos finalizados por estado. Usa `GET {rutaCasos}/resumen` (en los tres routers; no cuelga de
`/casos` para no chocar con `/casos/:id`). Respuesta `{ total, pendientes, abiertos, cerrados, anulados, remitidosComite,
remitidosConsejo, porEstado }`. Pendientes son los borradores; abiertos y cerrados son finalizados no terminales y terminales
sin anular. El resumen nunca incluye datos de casos, porque comité y consejo lo ven aunque no tengan acceso a esos casos.
Se recarga cada vez que se entra a la pestaña. «Casos» (`#casosConvivenciaListView`) carga la lista la primera vez. El detalle
oculta las pestañas y «Volver al listado» regresa a «Casos».

## Filtros de la lista

`casosConvivenciaFiltroApartamento`/`Severidad`/`PalabraClave`, junto al filtro de estado — todos
server-side (`GET /casos?estado=&severidad=&apartamento=&q=`). `apartamento`/`q` son coincidencia parcial
(`contains`), **sensible a mayúsculas/minúsculas** (Data Connect no ofrece un `contains` case-insensitive
aquí); `q` solo busca en `motivo` (no hay `_or` disponible en las queries de Data Connect de este
repo para buscar también en `descripcion`/`razonNotificacion` en una sola consulta). Los inputs de texto
usan debounce (~350 ms); el select de severidad recarga al `change`, igual que el de estado.

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
