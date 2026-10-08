# Parqueadero de visitantes — estado y pendientes

Escrito el 2026-10-08 al cerrar tres fases de trabajo. Documento de traspaso: dice qué quedó hecho,
qué falta, qué decisiones ya están tomadas y qué trampas cuestan horas si se redescubren.

Contrasta siempre con el código antes de actuar: este documento envejece, el repositorio no.

---

## De qué va

Sanciones del parqueadero de visitantes. El lector de placas de vigilancia fotografía vehículos
estacionados allí (`RegistroParqueaderoVisitante`) y el registro se atribuye a un apartamento. Alrededor
de eso se construyó: el portal del residente para verlas y controvertirlas, la resolución por
administración, la configuración de tarifas y días de gracia, y la pre-autorización de visitantes.

Repositorios: este (Hugo + JS sin framework + schema y operaciones Data Connect) y `../bulevar-verde-api`.

---

## Qué quedó hecho

### Fase 1 — Portal del residente
- Pestaña **Sanciones** dividida en sub-pestañas **Convivencia** (sin cambios) y **Parq Visitantes**.
- Listado paginado del histórico de la unidad, miniaturas perezosas, visor de foto, detalle y
  controversia de solo texto que avisa a administración por correo.
- `layouts/datos-personales/list.html`; API en `../bulevar-verde-api/src/modules/datos-personales/routes.ts`.

### Fase 2 — Administración
- Resolución de controversias: **aceptar desasocia** la unidad del registro (no lo borra) y lo deja
  reasignable con `PATCH /registros/:id/apartamento`; rechazar lo deja igual. Guarda por estado
  `PENDIENTE` en el `where`, así dos resoluciones simultáneas no se pisan.
- Pestaña **Configuración** (solo administración) con valor de la sanción por tipo y días de gracia.
- Asignación retroactiva: al asociar un vehículo a una unidad, los registros huérfanos de esa placa de
  los últimos 30 días vuelven a esa unidad, **excluyendo los ya posprocesados**.
- Dos defectos corregidos: el IDOR del retiro de vínculo y la evasión por vínculo duplicado.

### Fase 3 — Autorización de ingreso
- `POST /registrar-vehiculo` exige `autorizadoPorPersonaId` para `VISITANTE` y lo valida contra los
  residentes de la unidad. El formulario de vigilancia los precarga al escribir el apartamento.
- Pre-autorización desde el portal del residente (`AutorizacionIngresoVisitante`), 24 h por defecto,
  ampliable hasta el tope que fija administración, anulable.
- Vigilancia detecta la placa ya autorizada y avisa de que no hace falta registrarla.

Estado: 237 tests en la API, typecheck y build verdes; schema y las 29 operaciones compilan con el
emulador.

---

## Pendiente

### 1. Cálculo del valor de la sanción — el grande
**No existe.** `fechaPosprocesamiento` es solo una marca; `RegistroParqueaderoVisitante` no tiene campo
de valor ni FK a `Sancion`, y la tabla `Sancion` se usa únicamente para convivencia. La configuración
(valor por tipo y días de gracia) ya se **guarda y se edita**, pero nadie la **aplica**.

Lo que hay que definir antes de implementarlo:
- **Semántica de los días de gracia.** No existe nada parecido en el repositorio ni en el legado. La
  asamblea autorizó 3 días para visitantes reales y 0 para vehículos de residentes, pero falta decidir
  si son por mes, consecutivos, por placa o por apartamento. El legado
  (`google/sanciones.js:6126-6150`) cobra **cada** registro sin días libres, agrupando por placa + tipo
  dentro del periodo mensual.
- **De dónde sale «visitante real» vs «residente».** Ya está resuelto en los datos: el registro congela
  `vinculoId` y `autorizacionId`, y `unidadOrigenAsignacion` dice `PLACA`, `AUTORIZACION`, `MANUAL` o
  `RETROACTIVA`. Un registro con `AUTORIZACION` es visitante real; con un vínculo `PROPIO`/`RESIDENTE`
  es vehículo de residente.
- **Historial de tarifas por periodo.** El comentario del schema advierte que el valor «puede cambiar de
  un mes a otro». Hoy hay una sola fila vigente por tipo, así que no se sabe qué valor aplicaba a un
  registro antiguo. Si el cálculo corre sobre histórico, hace falta versionar por periodo.

### 2. Reporte de sanciones por apartamento
Lo pidió el usuario como implementación futura. Cuando exista, su **corte de facturación sustituye** al
filtro `fechaPosprocesamiento: { isNull: true }` de la asignación retroactiva
(`AsignarRetroactivoRegistrosParqueaderoVisitanteAdmin`), que es el único corte que hay hoy.

### 3. Unificar el vocabulario de `tipoVinculo`
`VinculoVehiculoUnidad.tipoVinculo` es `String!` libre y conviven dos vocabularios crudos en la misma
columna: el portal del residente escribe `PROPIO` / `VISITANTE_AUTORIZADO` y vigilancia
`RESIDENTE` / `VISITANTE` (más `AUTORIZADO_CONTROL_ACCESO` y `NO_DETERMINADO` del importador).

Está **mitigado, no resuelto**: `esVinculoResidente()` en
`../bulevar-verde-api/src/modules/vigilancia/parqueadero-visitantes.ts` normaliza en el punto donde decide la atribución.
Sigue pendiente que las vistas que agrupan por `tipoVinculo` (`static/js/vehiculos.js`, reporte de
movimientos) dejen de mostrarlos como categorías separadas, y que un filtro por `"VISITANTE"` capte
también los del portal. Eso ya sí requiere migración de datos.

### 4. Pruebas en navegador real
**Nunca se hicieron en ninguna de las tres fases.** La verificación fue estática más simulación en
jsdom. Las pantallas exigen sesión (residente con token propio, vigilancia/administración con Firebase)
y `apiBaseUrl` apunta al backend remoto incluso sirviendo con `hugo server`, así que no hubo forma de
recorrerlas de extremo a extremo. Queda pendiente al menos: el conmutador de sub-pestañas en móvil, el
visor de foto a pantalla completa, y el formulario de autorización con una sesión de vigilancia real.

### 5. Despliegue
Al cerrar: la API está commiteada hasta `52f5c4d auth visitantes` y el Data Connect hasta
`b464b78`. **El frontend de las fases 2 y 3 estaba sin commitear**
(los partials de `layouts/partials/vehiculos/`, `static/js/vehiculos.js` y `layouts/datos-personales/list.html`).
Verifica el estado real antes de desplegar.

Orden seguro: migración SQL → conector (`--force`) → API → Hosting.

### 6. `protegidoHasta`: evaluado y descartado
`data/REGLAS_OPERATIVAS.md:18-34` dice que un vínculo de visitante debe llevar
`protegidoHasta = hoy + 45 días`, y ningún código lo escribe. La regla es de **retención mínima de
datos**, no de bloqueo del retiro, y el retiro ya es cierre lógico (la fila se conserva con
`esActual=false`, `vigenteHasta` y el actor). Implementarlo añadiría una columna que nadie lee.
No se hizo a propósito; si se retoma, que sea con un lector que lo justifique.

### 7. Cabos menores
- `autorizadoPorPersonaId` está en el `@allow` de `CrearVinculoVehiculoUnidadAdmin` (portal del
  residente) pero ese flujo **nunca lo escribe**: se incluyó para no pedir otro `--force` después.
- `registradoPorUid` en vínculos creados antes de la Fase 2 es null; no hay backfill.
- La asignación retroactiva puede atribuir a un apartamento registros de una visita anterior a otro
  apartamento. Es una consecuencia aceptada: la controversia es la válvula de escape, y por eso
  `unidadOrigenAsignacion = "RETROACTIVA"` llega a la vista de resolución.
- Queda el incentivo de **no registrar nunca el vehículo**: solo lo cierra la asignación manual del
  vigilante, que ya existe.

---

## Decisiones ya tomadas — no re-litigar

| Tema | Decisión |
|---|---|
| Fuente de datos del portal | La API nueva sobre `RegistroParqueaderoVisitante`, no el Web App legacy de Apps Script |
| Qué ve el residente | **Todos** los registros de su unidad, procesados o no, con badge de estado |
| Controversia | Solo texto, sin adjuntos, una sola vez por registro |
| Controversia aceptada | **Desasocia** la unidad; el registro permanece y es reasignable |
| Dónde resuelve administración | En la pestaña Sanciones del módulo de Vehículos, no en una vista nueva |
| Ventana retroactiva | 30 días, misma para residentes y visitantes, excluyendo los ya posprocesados |
| Dónde viven las pre-autorizaciones | **Tabla propia**, no filas de `VinculoVehiculoUnidad` |
| Visitante pre-autorizado que se queda | Genera sanción **al apartamento que autorizó**, y son los días de gracia configurables los que deciden si se cobra |
| Duración de la autorización | La elige el residente: 24 h por defecto, tope configurable por administración |
| Valores iniciales | CARRO $8.000, MOTO $3.000 (el legado cobraba 7.000 / 1.000; se usan los nuevos) |

### Dos reglas anti-evasión que hay que preservar
1. **El vínculo de residente tiene precedencia sobre la pre-autorización.** Si no, cualquiera pediría a
   un vecino que «pre-autorice» su propio carro para trasladarle la sanción. Vive en
   `atribucionPorPlaca()`.
2. **Un vehículo tiene una sola unidad actual.** Crear un vínculo cierra los vigentes de esa placa. Sin
   esto quedaban varios `esActual=true`, la placa resolvía a más de una unidad y el registro quedaba
   «sin apartamento», es decir **sin sanción**. Fue la evasión más limpia que había.

---

## Trampas que cuestan horas

### Data Connect
- **No se puede apuntar a una tabla cuya clave compuesta contiene campos de referencia.** Una relación
  `vinculo: VinculoVehiculoUnidad` falla al compilar con `On X.vinculo @ref(references): Reference
  another reference field VinculoVehiculoUnidad.vehiculo`. Por eso el registro guarda `vinculoId: UUID`
  **escalar**, apuntando al `id` que es `@unique`. Consecuencia: no se puede navegar del registro al
  vínculo; el contexto se trae con una segunda consulta (`ObtenerVinculosVehiculoPorIdsAdmin`).
- **`in: []` no significa «sin filtro»**: no coincide con nada. Hay que evitar la consulta cuando la
  lista de ids está vacía.
- **Ampliar un `@allow` existente pide `--force`** al desplegar, y el CLI lo marca como BREAKING. Si los
  campos añadidos son opcionales, es un falso positivo: las llamadas antiguas siguen siendo válidas.
- **Añadir una variable no nula a una operación sí rompe de verdad.** Pasó con
  `RetirarVinculoVehiculoUnidadAdmin` (`unidadId`, `retiradoPorUid`): entre el deploy del conector y el
  de la API, el botón de quitar un vehículo del portal falla. La ventana es inevitable —Data Connect
  rechaza variables desconocidas, así que el conector tiene que aceptarlas antes de que la API pueda
  enviarlas—; se minimiza desplegando la API inmediatamente después.
- Un `_insert` devuelve un `*_KeyOutput` **sin subcampos**: se invoca sin selección
  (`mutation { unidad_insert(data: {...}) }`) y la respuesta ya trae la clave.
- `dataconnect/.dataconnect/` es snapshot generado y está en `.gitignore`: queda desactualizado hasta
  regenerarlo y no se edita a mano.

### Frontend
- `showTab()` conmuta **todos** los elementos con `.tab-pane-content`. Los paneles de sub-pestañas no
  deben llevar esa clase o el nav padre los oculta.
- Un overlay `position: fixed` dentro de un pane oculto no cubre la pantalla: hay que moverlo a
  `<body>` en el init, como hacen `#pvVisor` y `#vsVisor`.
- `$()` en `static/js/vehiculos.js` es `getElementById` **sin null-check**: los bloques que solo existen
  en administración se enganchan dentro de un `if ($(...))`, o `init()` revienta en vigilancia.
- `partials/vehiculos/index.html` se invoca **siempre con un dict**
  (`dict "ctx" . "modo" "admin"|"vigilancia"`). El gating es build-time de Hugo; ninguna página del
  portal lee claims de Firebase. Es ocultamiento de UI: la autorización real la aplica `requireRoles`.
- El listener de `#profileTabs` ignora los botones bajo un ancestro oculto (`button.closest('.hidden')`),
  así que sin sesión los clics en pestañas no hacen nada. Es correcto, pero sorprende al simular.
- El JS del portal del residente vive **inline** en el layout. Para `node --check` hay que extraer el
  bloque `<script>` del HTML compilado.
- No copiar el `apiFetch`/`getAuthToken` de `vehiculos.js` (Firebase) a flujos de residentes: el portal
  usa su propio token de sesión. Lo prohíbe `.claude/rules/frontend.md`.

---

## Cómo verificar sin desplegar

Esta receta fue la que encontró los fallos reales; vale la pena reusarla.

### Data Connect: compilar en copia aislada
El emulador valida **también las operaciones del conector**, con fichero y línea. Comprobado
rompiendo un campo a propósito.

```bash
R=<scratchpad>/dc-real
cp -r <repo>/dataconnect "$R/dataconnect" && rm -rf "$R/dataconnect/.dataconnect"
# firebase.json con puertos libres: los 9399 y 9499 suelen estar ocupados por emuladores previos
cd "$R" && firebase emulators:exec --only dataconnect --project demo-bulevar "echo ok"
grep -oiE "Errors:.*" dataconnect-debug.log   # sin salida = compila limpio
```

Para probar **semántica con datos reales** (que `unidadId: null` desasocia de verdad, que una guarda en
el `where` es atómica, que una ventana de vigencia filtra bien), lanzar un script contra
`…/services/portal-bulevar-verde:executeGraphql` dentro de ese `emulators:exec`. Así se validaron la
resolución de controversias, la retroactividad y las autorizaciones.

### API
`npm run check` en `../bulevar-verde-api` (typecheck + vitest + build). Los tests mockean
`executeAdminQuery`/`executeAdminMutation`; para rutas con rol se mockea `../../config/firebase.js`
(`firebaseAuth.verifyIdToken`) y `executeQuery` para `obtenerVigilante`.

### Frontend
`hugo --minify --destination <dir temporal fuera del repo>`, y simulación en **jsdom** cargando la
página compilada con `fetch` y Firebase mockeados. Encontró cuatro fallos reales que la revisión
estática no vio: duplicación de filas al conmutar rápido, el mensaje de confirmación borrado por
`clearAlert()`, una llamada repetida a la API en cada blur, y el fallback de `modoVehiculos()`.

Limitaciones de jsdom a polirrellenar: `scrollIntoView`, `URL.createObjectURL`/`revokeObjectURL`, y
`'IntersectionObserver' in window` (hay que `delete window.IntersectionObserver`, no asignarle
`undefined`, para probar el camino de respaldo). El script difiere `init()` a `DOMContentLoaded`: hay
que esperar ese evento antes de interactuar.

---

## Mapa rápido de archivos

| Archivo | Qué contiene |
|---|---|
| `dataconnect/schema/schema.gql` | `RegistroParqueaderoVisitante`, `AutorizacionIngresoVisitante`, `TarifaParqueaderoVisitante`, `ConfiguracionParqueaderoVisitante`, `VinculoVehiculoUnidad` |
| `dataconnect/admin/parqueadero_visitantes.gql` | Captura, listados, controversias, resolución, retroactividad, tarifas |
| `dataconnect/admin/autorizaciones_visitante.gql` | Pre-autorizaciones y configuración global |
| `layouts/datos-personales/list.html` | Portal del residente (sub-pestañas de Sanciones y pre-autorización), JS inline |
| `layouts/partials/vehiculos/` | Módulo de vehículos; su `CLAUDE.md` documenta ids, endpoints y reglas |
| `static/js/vehiculos.js` | Registrar, reporte, sanciones, controversias y configuración |
| `../bulevar-verde-api/src/modules/vigilancia/parqueadero-visitantes.ts` | Captura, atribución (`atribucionPorPlaca`), controversias, tarifas, autorizaciones |
| `../bulevar-verde-api/src/modules/datos-personales/routes.ts` | Rutas del residente: sanciones, controversia, pre-autorizaciones |
