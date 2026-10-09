# Todos — entorno local, sesiones, warnings, limpieza, supervisor, dashboard, migraciones, bugs, placas y offline

Escrito el 2026-10-08. Cada punto parte de lo que se **verificó** en el código ese día, no de
suposiciones; lo que no se pudo comprobar está marcado. Contrasta con el repositorio antes de actuar.

Orden sugerido: **0 → 3 → 2 → 4 → 1**. Los warnings (3) son lo más barato y destraban el CI; el entorno
local (1) es lo más grande y conviene hacerlo con la limpieza (4) ya hecha, para no sembrar sobre ruido.

---

## 0. Antes que nada — hallazgos fuera de la lista

Salieron al explorar y pesan más que cualquiera de los cuatro puntos.

### 0.1 Secreto de producción escrito en el código fuente  — prioridad alta
`bulevar-verde-api/src/services/resident-token.ts` (función `getSecret`): si `RESIDENT_SESSION_SECRET`
no está definido **y** `NODE_ENV === "production"`, devuelve una cadena hexadecimal fija escrita en el
código y commiteada. Con ese valor cualquiera con acceso al repositorio puede **firmar sesiones válidas
de residente, comité y consejo**: el HMAC es lo único que las protege.

- Está commiteado, así que hay que tratarlo como **comprometido**, no solo retirarlo del código.
- Pasos: (1) confirmar que `RESIDENT_SESSION_SECRET` está definido en Cloud Run (si lo está, el fallback
  nunca se usa, pero sigue siendo un riesgo latente); (2) **rotar** el secreto en Cloud Run, lo que cierra
  todas las sesiones vigentes (aceptable: duran 2 h); (3) eliminar el fallback y hacer que, sin variable,
  la API **falle al arrancar** en producción en vez de inventar una clave; (4) en desarrollo seguir
  generando una aleatoria por proceso (como hoy).
- Los tests de `resident-token` y de rutas firman con `signResidentToken`: seguirán funcionando porque en
  `NODE_ENV=test` cae a la rama aleatoria.
- No copiar el valor a ningún documento ni log.

### 0.2 Trazas `DEBUG` en el arranque — **hecho 2026-10-09** (sin desplegar)
`bulevar-verde-api/src/server.ts` líneas 5-7 imprimen si el secreto está presente, `NODE_ENV` y los
nombres de las variables de entorno que contengan `RESIDENT` o `NODE`. Quitar las tres líneas. No filtran
el valor, pero son ruido en producción y revelan qué variables existen.

### 0.4 Corregido en esta sesión: `ELECTRICO` / `SIN PLACA` desvinculaban otros apartamentos
Detectado al revisar el formato de placas (punto 11). El cierre de vínculos de la Fase 2 actuaba sobre una
fila de `Vehiculo` **compartida** por todos los vehículos sin placa, así que registrar uno cerraba el
vínculo de otro apartamento. Ya está corregido y probado; el diseño de fondo sigue abierto en el punto 11.
Si la API con la Fase 2 ya se desplegó, conviene revisar si hubo registros de este tipo desde entonces.

### 0.3 Lo que se comprobó que está bien
`client_secret_*.json` y `.env` de la API están en `.gitignore` y **nunca se commitearon** (el historial
no tiene rastro). `.env.example` sí está rastreado y es lo correcto.

---

## 1. Entorno local con una base de datos parecida a producción

### Estado hoy
- La API arranca con `npm run dev` (`tsx watch`) y tiene `.env.example`, pero **no hay emuladores
  configurados**: `firebase.json` del frontend solo declara `hosting` y `dataconnect`.
- El frontend apunta a producción: `hugo.toml` fija `apiBaseUrl` al servicio de Cloud Run. **Servir con
  `hugo server` no vuelve local a la API** (ya lo advierte `CLAUDE.md`).
- Existen scripts de importación en `data/` (`importar_unidades_csv_real_admin.py`,
  `importar_personas_vinculos.py`, `importar_registro_vehicular.py`, …) y en la API
  (`scripts/bootstrap-superadmin.mjs`, `importar-parqueaderos.js`). Sirven de precedente de siembra, pero
  el nombre `csv_real` indica que trabajan sobre datos reales.
- El emulador de Data Connect **ya funciona** con el schema y los conectores reales (así se validó todo el
  trabajo del parqueadero de visitantes). En la máquina hay dos emuladores viejos ocupando los puertos
  9399 y 9499 desde el 29/09 y el 04/10; hay que pararlos o usar otros puertos.

### Decisión que hay que tomar primero: ¿de dónde salen los datos?
| Opción | Ventaja | Riesgo |
|---|---|---|
| **A. Sintéticos con la forma de producción** (recomendada) | No sale ningún dato personal de producción. Reproducible con semilla fija | Hay que modelar bien la distribución para que se parezca |
| B. Volcado de producción anonimizado | Más fiel | Hay datos personales (nombres, documentos, correos, teléfonos, placas, fotos de vehículos) y campos de texto libre (descargos, observaciones, controversias) donde el nombre real se cuela. Una anonimización con fugas es peor que no tenerla. Habría que revisar la base legal (Ley 1581 de 2012 / habeas data) |

Con la opción A, lo único que se extrae de producción son **formas y volúmenes**: número de torres y
apartamentos (la estructura de `Unidad` no es dato personal), cuántas personas por unidad, vehículos por
unidad, proporción carro/moto, cuántos registros de parqueadero por mes. Todo lo demás se genera.

### Alcance propuesto
1. **Emuladores**: añadir a `firebase.json` los de Data Connect, Auth y Storage con puertos fijos que no
   choquen con los existentes; proyecto `demo-*` para que ningún cliente pueda tocar servicios reales.
2. **API local**: variables del emulador (`FIREBASE_AUTH_EMULATOR_HOST`, `DATA_CONNECT_EMULATOR_HOST`,
   `STORAGE_EMULATOR_HOST`), SMTP a un buzón de captura (Mailpit) o `SMTP_HOST` vacío. Un
   `.env.local.example` aparte del de producción.
3. **Frontend local**: sobrescribir `apiBaseUrl` sin editar `hugo.toml`, con
   `HUGO_PARAMS_APIBASEURL=http://localhost:8080` o un `config/local/hugo.toml`
   (`hugo server --environment local`). Revisar cómo se inicializa Firebase en el cliente para apuntar
   Auth al emulador (**sin comprobar todavía**: no se localizó el punto de inicialización).
4. **Semilla**: un script determinista (semilla de RNG fija) que cree unidades, personas con documentos y
   correos inventados (`@example.test`), vehículos con placas válidas (`ABC123` carro, `ABC12D` moto,
   respetando `Vehiculo.placa @unique`), vínculos, registros de parqueadero con fotos de relleno,
   controversias en cada estado, autorizaciones vigentes/vencidas/anuladas, y los usuarios de
   vigilancia/administración en el emulador de Auth con los claims de rol.
5. **Un solo comando** que levante emuladores + siembre + API + `hugo server`, y otro que lo reinicie
   limpio.

### Guardas de seguridad (no negociables)
- El script de siembra **se niega a ejecutarse** si el proyecto de Firebase no empieza por `demo-` o si
  `FIREBASE_PROJECT_ID` es el de producción. Un `seed` apuntando por error a producción es el peor caso.
- Las fotos de relleno no son fotos reales de vehículos.
- Ningún valor de `.env` de producción se copia al entorno local.

### Criterios de aceptación
- Con un comando, el portal del residente, vigilancia y administración funcionan contra datos locales y
  se puede recorrer el flujo completo del parqueadero (captura → atribución → controversia → resolución).
- Este flujo **nunca se ha probado en navegador real** (ver `parqueadero-visitantes-pendiente.md`, punto
  4): el entorno local es lo que por fin lo permite.
- Probar la guarda: lanzar el seed apuntando a un proyecto no `demo-` y comprobar que aborta.

---

## 2. Que las sesiones expiren

### Estado hoy — **hay tres tipos de sesión y solo uno es el problema**
| Sesión | Mecanismo | ¿Expira? |
|---|---|---|
| Residente, comité, consejo | Token HMAC propio, `exp` de 2 h; `verifyResidentToken` **sí lo comprueba** (`resident-token.ts:54`). Guardado en `sessionStorage` | **Sí**, a las 2 h absolutas y al cerrar la pestaña |
| Administración, vigilancia | Firebase Auth. Ningún archivo llama a `setPersistence`, así que rige el valor por defecto (**LOCAL**) | **No en la práctica**: sobrevive al cierre del navegador y el token de ID se renueva solo indefinidamente |
| Gestión de PQRS | Sesión propia con `expiresAt` en `sessionStorage` (`pqrs-gestion.js:193`) | Sí, comprobada en el cliente. **Sin revisar** que el servidor también la valide |

Por tanto el trabajo real está en el **personal con Firebase Auth**. Es el caso delicado: el dispositivo de
portería es compartido y la sesión de un vigilante queda abierta para el siguiente turno.

Lo que ya ayuda: `authenticate` usa `verifyIdToken(token, true)`, es decir, **comprueba revocación**. Si se
revocan los refresh tokens de un usuario, su sesión muere en el servidor. Hoy nadie lo hace.

### Enfoque propuesto
1. **Servidor, que es lo que no se puede saltar**: en `authenticate` rechazar con 401 cuando
   `Date.now()/1000 - decodedToken.auth_time` supera una edad máxima por rol. `auth_time` es la hora del
   último inicio de sesión real (no cambia con las renovaciones del token), así que acota la sesión
   aunque el cliente la mantenga viva.
2. **Cliente**: `setPersistence(SESSION)` en administración y vigilancia para que no sobreviva al cierre del
   navegador, más un cierre por inactividad con aviso previo. Esto es comodidad y defensa en profundidad,
   no la garantía.
3. **Mensajes**: hoy el portal del residente no maneja el 401: al expirar muestra «Error de conexión: La
   sesión no es válida o expiró» en cada pantalla. Debe volver al login con un mensaje claro, como ya hace
   `partials/organo-portal.html`.

### Decisiones que hay que tomar
- **Duración por rol.** Propuesta de partida, a confirmar con quien conoce la operación: administración
  8 h; vigilancia lo que dure un turno (¿12 h?); residente/comité/consejo se queda en 2 h. ¿Absoluta o por
  inactividad en cada caso?
- ¿El cierre por inactividad en vigilancia es aceptable durante una ronda con el lector de placas?

### Cuidado con el lector de placas
`lector-placas-cola.js` guarda las capturas en IndexedDB y **reintenta ante 401/403**
(`ESTADOS_TRANSITORIOS`). Eso está bien pensado, pero significa que una sesión que caduque a mitad de ronda
**no debe borrar la cola**: debe pedir iniciar sesión de nuevo y conservar las capturas pendientes con su
`clientRequestId` (regla de `.claude/rules/frontend.md`). Es el caso de prueba más importante.

### Criterios de aceptación
- Con `auth_time` simulado más viejo que el máximo, la API responde 401 a cada rol con su límite.
- Cerrar y reabrir el navegador en administración/vigilancia obliga a iniciar sesión.
- Expirar la sesión de vigilancia con capturas en cola no pierde ninguna y se envían tras reautenticar.
- El residente que expira ve el login, no un error genérico.
- Tests en la API para la edad máxima por rol (hay patrón para mockear `firebaseAuth.verifyIdToken`).

---

## 3. Resolver los warnings de Hugo — **hecho 2026-10-09**

CI subido a 0.167.0 en el mismo cambio. Build local: 0 WARN, 30 páginas, `lang="es-co"`. **Falta** ver el
build de CI en verde antes de fusionar. Lo de abajo queda como registro.

Son tres y salen de dos causas. **Antes de tocar nada hay un bloqueo.**

### Bloqueo: el CI usa Hugo 0.157.0
`.github/workflows/firebase-deploy.yml` fija `hugo-version: '0.157.0'`. Las APIs nuevas
(`locale`, `.Site.Language.Locale`) llegaron en **0.158**; en 0.157 no existen. Si se corrigen los
warnings sin subir esa versión, el despliegue **fallará o generará `lang=""`**. Localmente se usa 0.167.
Orden obligatorio: subir la versión del CI y verificar que compila, y solo después cambiar las plantillas.

### Los tres warnings
| Warning | Dónde | Arreglo |
|---|---|---|
| `languageCode` deprecado | `hugo.toml:2` (`languageCode = 'es-co'`) | Pasar a `locale = 'es-co'` (con Hugo ≥ 0.158) |
| `.Site.LanguageCode` deprecado | 13 plantillas: `404.html`, `index.html`, `datos-personales`, `administracion-datos`, `vigilancia-datos`, `guia-casos-convivencia`, `politica-datos-personales`, `prueba-api-unidades`, `sanciones`, `pqrs/{gestion,consulta,list}`, `partials/organo-portal` | Sustituir por `.Site.Language.Locale` en el `<html lang>`. Mantener los `| default "es"` donde existen |
| Sin layout para `taxonomy` | Hugo genera páginas de taxonomía que no tienen plantilla | El sitio **no usa** tags ni categories (no hay front matter con ellas ni taxonomías declaradas), así que lo limpio es `disableKinds = ["taxonomy", "term"]` en `hugo.toml`, no inventar una plantilla |

### Verificación
- `hugo --gc --minify` sin ningún `WARN`.
- El `<html lang>` de las páginas compiladas sigue siendo `es-co`.
- El recuento de páginas no cambia salvo por las de taxonomía que desaparecen (hoy 32).
- Build de CI verde con la versión nueva **antes** de fusionar.

---

## 4. Borrar lo que no se use

**Regla: nada se borra sin que lo apruebes**, y aquí solo hay una lista clasificada con su evidencia.
Todo está en git, así que borrar es reversible, pero conviene hacerlo en commits separados por grupo.

### A. Parece seguro
| Qué | Evidencia |
|---|---|
| El entorno virtual de Python dentro de `data/` | `data/` tiene 5.559 archivos, pero solo **10 rastreados por git**. El resto son `.py`, `.pyc`, `.pyd`, `.pyi`, `.lib`, `.f90` — el aspecto de librerías instaladas (numpy y similares). Confirmar que hay un `pyvenv.cfg` o un `Lib/site-packages`. Es local, no está en el repo; moverlo fuera del repositorio y añadirlo a `.gitignore` |
| Trazas `DEBUG` de `server.ts` | Ver 0.2 |
| `githubci.log` (API) | `*.log` ya está en `.gitignore`; es un residuo local |
| Carpetas vacías `themes/` e `i18n/` | 0 archivos; git no las rastrea |

### B. Probablemente sobra — confirma tú
| Qué | Evidencia | Duda |
|---|---|---|
| `layouts/prueba-api-unidades/` y `content/prueba-api-unidades/` | Ningún enlace, menú, ni documento la referencia (búsqueda en `layouts`, `content`, `static`, `hugo.toml` y los `.md`). Es una página de prueba con login de Firebase | Se publica en Hosting, así que hoy es una pantalla accesible por URL directa. Confirmar que nadie la usa |
| `test-pqrs-detailed.js`, `test-pqrs-login.js` (raíz) | Solo los menciona `CLAUDE.md`, para advertir que **llaman a un servicio remoto**. No están en ningún workflow | Mover a una carpeta de utilidades o borrar |
| Scripts de importación de parqueaderos en la API (`analizar-parqueaderos.js`, `hacer-import-parqueaderos.js`, `importar-parqueaderos.js`) | Son importaciones puntuales | Si ya se ejecutaron, sobran; pueden servir de plantilla para la semilla del punto 1 |
| `skills-lock.json` | Ningún archivo lo referencia | Parece de herramientas de Claude; confirmar |

### C. NO borrar sin investigar más — parecen basura y no lo son
| Qué | Por qué se conserva |
|---|---|
| `google/` (9 archivos, Apps Script heredado) | `layouts/sanciones/list.html` **aún consulta** su Web App (`WEBAPP_URL`) y la página pública de sanciones de cartera depende de él. Borrarlo rompe `/sanciones/` |
| `redirect.html` y `.github/workflows/hugo.yml` | Despliegan una redirección a GitHub Pages desde `main`. Puede estar vigente o ser un residuo de antes de Firebase; hay que preguntar |
| `data/*.py`, `LEEME.md`, `REGLAS_OPERATIVAS.md` | Importadores y documentación de reglas del módulo de vehículos; las reglas se citan en otros documentos |
| `public/`, `resources/` | Generados y en `.gitignore`; no tocar en exploraciones, y se regeneran |

### Código muerto dentro de los archivos (sin hacer)
No se ejecutó ninguna herramienta de detección. Propuesta:
- **API (TypeScript)**: `knip` o `ts-prune` para exports y archivos sin uso.
- **Frontend**: no hay bundler; hacer una pasada de `grep` por cada función/ID del JS inline de
  `layouts/datos-personales/list.html` (varios miles de líneas) y de `static/js/`. Cuidado con IDs que solo se
  usan desde otro archivo.
- Operaciones de Data Connect sin referencia en la API: cruzar por nombre (cada `query`/`mutation` de
  `dataconnect/admin/*.gql` contra las cadenas de `src/`), porque la API las invoca por cadena y el SDK
  generado no las delata. No se hizo ese cruce todavía.

### Criterios de aceptación
- Cada borrado va en su commit con la evidencia en el mensaje.
- Tras borrar: `hugo --gc --minify` limpio, `npm run check` verde, y búsqueda de las rutas borradas sin
  coincidencias.

---

---

## 5. Rol de supervisor de vigilancia

### Estado hoy
- **No existe**: ninguna mención de `supervisor` en la API ni en el frontend.
- Los roles son **cadenas libres** en los custom claims de Firebase (`roles: [...]`);
  `PUT /usuarios/:uid/roles` acepta cualquier texto de 2 a 50 caracteres. Crear el rol en sí es solo
  asignar la cadena; el trabajo está en decidir **dónde** se admite.
- Las listas de roles están **copiadas por módulo**, no centralizadas: `VIGILANCIA_ROLES`
  (`vigilancia/routes.ts`), `ADMIN_ROLES` (definida por separado en `convivencia/routes.ts` y en
  `vigilancia/parqueadero-visitantes.ts`), `STAFF_ROLES` (`reservas/routes.ts`), `CONVIVENCIA_ROLES`, y
  `requireRoles("administrador", "superadmin")` escrito a mano en otros sitios. Añadir un rol hoy es tocar
  cada lista sin una vista de conjunto de qué ruta admite a quién.
- `getRoles` (`middleware/authorization.ts`) acepta **también** un claim booleano cuyo nombre sea el rol:
  cualquier claim con valor `true` cuenta como rol. Hay que tenerlo presente al nombrar el nuevo.
- Los portales **no leen claims en el cliente**; el gating es build-time por página (ver
  `partials/vehiculos/index.html`). Un supervisor que entre por la página de vigilancia vería lo mismo que
  un vigilante salvo que se introduzca un patrón nuevo.

### Qué hay que definir primero (no está en ninguna parte)
¿Qué puede hacer un supervisor que un vigilante no? Sin eso cualquier implementación es inventada.
Candidatos, a confirmar con quien conoce la operación: ver sanciones y controversias en solo lectura;
corregir un apartamento asignado por error (hoy la asignación es de un solo sentido); anular una captura
errónea; ver reportes por vigilante o por turno; ver tarifas. **No** debería resolver controversias: eso
cambia a quién se cobra y es de administración.

### Enfoque propuesto
1. Nombre del rol: `supervisor_vigilancia`.
2. **Centralizar los roles** en un módulo único con constantes y jerarquía
   (`vigilancia ⊂ supervisor_vigilancia ⊂ administrador ⊂ superadmin`) y sustituir las copias. Es el
   cambio de mayor valor y menor riesgo, y evita que el rol nuevo se olvide en una lista.
3. Un **test de matriz rol × ruta** que enumere las rutas con sus roles esperados. Hoy no hay una vista de
   conjunto y es la única forma de detectar una lista a la que se le olvidó el rol, o peor, una a la que se
   le añadió de más.
4. Decidir el patrón de frontend para mostrar acciones de supervisor (página aparte, o leer claims en el
   cliente, que sería el primer caso en el proyecto).
5. Cómo se asigna el rol: `PUT /usuarios/:uid/roles` ya sirve; documentarlo.

### Criterios de aceptación
- La matriz de tests pasa para los cuatro roles de staff y falla si una ruta cambia de roles sin querer.
- Un usuario con solo `supervisor_vigilancia` accede a lo de vigilancia y a lo definido para él, y recibe
  403 en todo lo de administración.
- Cero listas de roles duplicadas.

---

## 6. Mejorar el dashboard de administración

### Estado hoy
- `GET /dashboard/metricas` (`dashboard/routes.ts`, 37 líneas) devuelve **cuatro conteos**: unidades,
  personas, vehículos y parqueaderos activos. Y los calcula **trayendo la lista de ids y midiendo su
  longitud**, no contando en la base.
- Frontend: `static/js/administracion-datos/dashboard.js`.
- No dice nada de lo que hay **pendiente** ni de qué pasó últimamente.

### Qué debería mostrar
| Área | Pendientes | Novedades |
|---|---|---|
| Parqueadero de visitantes | Controversias en estado `PENDIENTE`; registros **sin apartamento** | Capturas de las últimas 24 h / 7 d; controversias nuevas |
| Convivencia | Casos sin resolver; descargos o apelaciones recibidos y sin leer; casos pendientes de notificar | Casos nuevos y decisiones recientes |
| Reservas | Pendientes de pago o de aprobación | Reservas nuevas |
| PQRS | Abiertas y vencidas (**depende del punto 8**) | Nuevas |
| Datos | Personas sin correo | — |

Todas las fuentes de las dos primeras filas **ya existen** (`/convivencia/...`, `/parqueadero-visitantes/
controversias?estado=PENDIENTE`, `sinResolver`); lo que falta es agregarlas.

### Enfoque propuesto
1. Un endpoint agregador `GET /dashboard/pendientes` que lance las consultas **en paralelo** y devuelva,
   por área, un conteo y los últimos N elementos, cada uno con el enlace al módulo y filtro
   correspondiente. Es mejor un endpoint que N llamadas desde el cliente.
2. **Contar en la base.** Data Connect expone campos `_count` (aparecieron en los mensajes del
   emulador, p. ej. `fechaControversia_count`); sustituir el patrón «traer ids y medir longitud», que además
   se degrada con el crecimiento.
3. Respetar el rol: el mismo endpoint filtra por quién pregunta (administrador, y supervisor/consejo si se
   les da una vista).
4. Añadir las áreas de forma incremental: primero parqueadero y convivencia, que no dependen de nada.

### Riesgo
Un dashboard que consulta seis fuentes puede ser lento y frágil. Si una falla no debe tumbar las demás:
cada área devuelve su estado de forma independiente (`ok` / `error`).

### Criterios de aceptación
- El administrador ve de un vistazo cuántas controversias y casos esperan acción, y llega a ellos con un clic.
- Una fuente caída muestra su tarjeta en error y el resto sigue funcionando.
- Las métricas existentes no cambian de valor (comparar antes/después con los mismos datos).

---

## 7. Migrar mantenimiento a base de datos y bucket

### Estado hoy
«Mantenimiento» no es un módulo independiente: está **dentro del bloque PQRS**
(`static/js/pqrs-maintenance.js`, 1.130 líneas). Los reportes se guardan en **Google Sheets y Drive**, por
medio del Apps Script `google/pqrs.js`:
- hoja `Reportes Mantenimiento`,
- carpeta de Drive `Reportes Mantenimiento - Evidencias`,
- carpeta `Reportes Mantenimiento - Respaldo de cola`.

El cliente guarda una **cola en IndexedDB** (`bulevar-verde-pqrs` / `maintenanceQueue`) con hasta 3 fotos
por reporte y la reenvía al Web App. **No hay nada en la API ni en Data Connect.**

### Destino
- Tablas en Data Connect (reporte, evidencias, estados/eventos) y un **bucket privado de Cloud Storage**
  para las fotos, con acceso por URL firmada o proxy.
- Patrones del proyecto que se reutilizan, para no reinventar: el bucket y su script de creación
  (`scripts/crear-bucket-*.sh`), `descargarFotoRegistro`, y la cola offline idempotente con
  `clientRequestId` del lector de placas.

### Puntos a decidir
1. **Subida de fotos**: base64 dentro del JSON (patrón del parqueadero, aceptable con 3 fotos comprimidas)
   o sesión reanudable directa al bucket (patrón de convivencia). Una petición mayor de 32 MiB en Cloud Run
   devuelve un 413 del balanceador que **no aparece en los logs**.
2. **¿Modelo común con PQRS?** Comparten Apps Script, hoja de cálculo y UI. Conviene decidirlo **junto con
   el punto 8** antes de diseñar tablas; si se hacen por separado, mantenimiento primero por estar más
   aislado (no se comprobó que no dependa de PQRS en el servidor).
3. **Identidad**: quién reporta y con qué sesión (hoy el formulario es de acceso abierto o por Web App; no
   se comprobó).

### Migración de lo existente
Script idempotente que lea la hoja, copie cada archivo de Drive al bucket y cree las filas. **No borrar
Drive ni la hoja** hasta validar. Las colas IndexedDB que ya tengan los usuarios apuntan al Web App viejo:
hay que mantenerlo vivo o dar compatibilidad durante la transición para no perder reportes pendientes.
Los datos incluyen personas y fotos: probar la migración con la semilla sintética del punto 1, no con
datos reales en local.

### Criterios de aceptación
- Un reporte con 3 fotos se crea sin conexión, se reenvía idempotentemente y queda en base + bucket.
- El conteo de reportes y de archivos coincide con la hoja y la carpeta de origen.
- El Web App viejo sigue aceptando hasta confirmar que no quedan colas pendientes.

---

## 8. Migrar PQRS a base de datos y abrir el dashboard del consejo

### Estado hoy
Es una **aplicación entera sobre Apps Script**, no un almacenamiento:
`google/pqrs.js` (2.815 líneas, hoja `Respuestas de formulario 1` de Google Forms), más
`pqrs-gestion.js` (1.811), `pqrs-consulta.js` (308) y tres plantillas (`list`, `consulta`, `gestion`). La
gestión tiene **su propia sesión** con `expiresAt` contra el Web App. Los scripts `test-pqrs-*.js` llaman al
servicio remoto. Es la migración más grande de la lista y la única que cambia una aplicación completa.

### Fases sugeridas
1. **Inventario** de lo que hace `google/pqrs.js`: estados, plantillas y envío de correos, plazos y
   alertas, reportes, adjuntos, permisos. Sin esto el modelo se queda corto y se descubre tarde.
2. Modelo en Data Connect y API (con la decisión del punto 7 sobre modelo común).
3. Frontend pantalla por pantalla: formulario público, consulta, gestión.
4. Migración de históricos, con validación de conteos.
5. Corte: el Web App viejo en solo lectura hasta confirmar.

### Cosas que cambian de naturaleza
- **Autenticación de la gestión**: pasa de sesión propia a Firebase (administración) o a un token propio.
  Se coordina con el punto 2 (expiración) y con el 5 (roles).
- **Formulario y consulta públicos**: hoy sin sesión de usuario. En la API necesitan límite de peticiones,
  validación estricta y la garantía de que la consulta de un radicado no permita ver los de otros. No se
  comprobó cómo se protege hoy la consulta.
- **Datos personales y quejas contra personas**: mínimo necesario en cada vista.

### Dashboard del consejo
Hoy el portal del consejo (`consejo-administracion-datos`, sobre `partials/organo-portal.html`) es de
**solo consulta de los casos de convivencia que administración les remitió**. **No existe un dashboard** del
consejo: lo que hay es una lista de casos. Interpretación a confirmar: añadir al portal una vista de PQRS
y un resumen, en solo lectura.

Decisión que lo condiciona: ¿el consejo ve **todas** las PQRS o solo las que administración le remita, como
con convivencia? Mantener el principio de remisión es lo coherente y lo más seguro.

### Criterios de aceptación
- Toda funcionalidad inventariada tiene su equivalente o una decisión explícita de descartarla.
- Una PQRS creada, respondida y cerrada en el sistema nuevo genera los mismos correos que en el viejo.
- El consejo ve exactamente lo que se le remite y nada más; un test lo comprueba.

---

## 9. Bug: la descarga de documentos del usuario

**El síntoma exacto no está descrito**, y desde aquí no se puede reproducir (exige un propietario real y
credenciales de PhEnLinea). Lo que sigue es el análisis del código: hay defectos comprobables, pero **no
hay certeza de cuál es el que se ve**. Primer paso: que quien lo vio diga qué pantalla, qué documento,
qué dispositivo y qué ocurre (¿pestaña en blanco?, ¿botón girando?, ¿mensaje de error?).

Se asume que «documentos del usuario» es la pestaña **Facturación** del portal del residente (cuenta de
cobro, estado de cuenta, recibo, certificado, paz y salvo). Si se refiere a *Documentos del club* (Drive),
es otro código (`partials/documentos-club.html`) y esta sección no aplica.

### Cómo funciona hoy
`descargarDocumento` (`layouts/datos-personales/list.html`, ~línea 3337):
1. `window.open('', '_blank')` **antes** de pedir nada, para esquivar el bloqueador de ventanas emergentes.
2. Llama a la API (`/cuenta-cobro` o `/informes/:tipo`), que consulta a **PhEnLinea** (tercero).
3. Si llega `success` y una URL, hace `ventana.location.href = url`.

La API (`datos-personales/routes.ts`, ~líneas 855-905) hace, en cada clic: cargar el perfil completo de la
unidad, y consultar PhEnLinea con **autenticación y consulta que pueden tardar hasta 45 s cada una**
(`ph-en-linea.ts`). Es decir, el usuario puede mirar una pestaña en blanco hasta ~90 s.

### Defectos comprobados en el código
| # | Defecto | Efecto |
|---|---|---|
| 1 | `window.open` puede devolver `null` (navegador integrado de WhatsApp o Instagram, Safari con bloqueo, algunos móviles) y **no se comprueba**. Luego se usa `ventana.location` y `ventana.close()` | `TypeError`; el `catch` también falla al llamar `ventana.close()` sobre `null`. **El botón se queda en «Descargando…» para siempre**, sin mensaje |
| 2 | `marcarDocumentoNoDisponible` hace `button.dataset.old = undefined`, que guarda la **cadena** `"undefined"` | Si algo restaura el botón después, el texto sería «undefined». Y el botón queda deshabilitado hasta recargar, sin forma de reintentar |
| 3 | Si la API falla por tiempo de espera (504) el mensaje sale, pero la pestaña en blanco ya se cerró tarde | Pestaña vacía visible durante toda la espera |
| 4 | `$('documentosError').textContent = '…' + esc(error.message)` — se escapa **y** se asigna con `textContent` | El texto aparece con entidades (`&amp;`, `&quot;`) literales |
| 5 | La URL que devuelve PhEnLinea se abre tal cual. Si es de un solo uso, caduca o es `http://` | Descarga que falla en el tercero, no en nuestro código. **Sin comprobar** |
| 6 | Un fallo y «no hay documento» se tratan igual en pantalla («No disponible») | El residente no distingue «aún no existe» de «hubo un error, reintenta» |

**2026-10-09: corregidos 1, 2 y 4** en el cliente. Con `window.open` nulo se muestra un enlace «Abrir
documento» (solo `http(s)`); el error previo se limpia en cada clic. Solo `node --check`, sin navegador.
Siguen abiertos 3, 5 y 6.

### Enfoque propuesto
1. **Reproducir primero** con el caso real y con DevTools (móvil si el síntoma es móvil).
2. Corregir 1, 2 y 4 sin discusión: son defectos del cliente.
3. Evaluar **dejar de abrir una ventana en blanco**: pedir la URL, y navegar a ella (o un enlace
   «Abrir documento» como respuesta del clic) cuando llegue. Evita el bloqueador sin la pestaña vacía.
4. En la API, devolver errores distinguibles (`no_disponible` frente a `servicio_no_disponible`) y bajar el
   tiempo de espera percibido; valorar cachear el token de PhEnLinea (ya hay `expiresAt`).
5. Si la URL del tercero es de un solo uso o caduca, descargar el PDF **desde la API** y servirlo con
   `Content-Disposition`, en vez de redirigir al usuario a un enlace ajeno.

### Criterios de aceptación
- Con `window.open` devolviendo `null`, el botón vuelve a su estado y se muestra un mensaje claro.
- Un documento no disponible se distingue de un error y deja reintentar.
- No queda ninguna pestaña en blanco esperando.
- Test del cliente (jsdom, con `window.open` y `fetch` simulados) para cada rama.

---

## 10. Bug: «Gestión de zonas comunes» no carga al primer clic — **hecho 2026-10-09**

Arreglo mínimo (punto 1): el clic de Catálogo carga si la caché está vacía. Puntos 2-3 sin hacer. Sin
probar en navegador.

### Síntoma
En administración → Reservas, al pulsar la última pestaña (**Catálogo**, gestión de zonas comunes) no
muestra nada. Hay que ir a otra pestaña y volver para que aparezca.

### Causa raíz (confirmada en el código)
Es justo lo que se sospechaba: **la llamada a la API se hace en el momento equivocado.**

`static/js/administracion-datos/core.js`, ~línea 835:
```js
showReservasCatalogo.addEventListener('click', function () { modeReservas('catalogo'); });
```
El clic en Catálogo **solo cambia la vista**. Nunca llama a `cargarReservasCatalogo()`. El catálogo se
carga únicamente como **efecto secundario** de pulsar *Reservar* (~línea 836), que hace
`zonasCatalogoCache.length ? … : cargarReservasCatalogo()`. Por eso el comportamiento descrito: pulsar
Reservar y volver a Catálogo es lo que, sin que nadie lo pretenda, dispara la carga.

Contraste: *Reservar* y *Agenda* sí cargan lo suyo en su propio clic; Catálogo es la única pestaña que
depende de otra. Y al entrar al módulo (`showReservas`) solo se carga la **agenda**.

### Arreglo propuesto
1. En el clic de Catálogo: `modeReservas('catalogo')` y **cargar si la caché está vacía**
   (`zonasCatalogoCache.length ? Promise.resolve() : cargarReservasCatalogo()`), igual que hace Reservar.
2. Decidir si **refrescar siempre** al entrar: es una pantalla de gestión y otro administrador pudo
   cambiar zonas; la caché podría estar obsoleta. Recargar en cada entrada es barato (lista corta).
3. Extraer el patrón «cambiar de pestaña y cargar lo suyo» a un solo sitio. Hoy cada pestaña lo repite a
   mano, y de ahí que a una se le olvidara. Reservar y Catálogo comparten `zonasCatalogoCache`, así que
   conviene un único `asegurarCatalogo()` que ambas llamen.
4. Tras guardar o editar una zona hay que invalidar la caché; comprobar que ya se hace.

### Cosas que encontré de paso
- `static/js/administracion-datos/reservas-catalogo.js` y `reservas-formulario.js` son **marcadores
  vacíos** («funcionalidad fusionada en core.js»): se cargan en la página sin hacer nada. Candidatos al
  punto 4 de esta lista.
- Convive un `mode()` interno antiguo con el registro de módulos; la navegación del panel tiene dos
  sistemas y esto es parte de por qué es fácil olvidar una carga.

### Criterios de aceptación
- Con la sesión recién iniciada, ir a Reservas y pulsar Catálogo muestra las zonas **al primer clic**, sin
  tocar otra pestaña.
- Reservar sigue funcionando y no duplica la llamada si el catálogo ya está cargado.
- Un test jsdom reproduce el fallo antes del arreglo (clic en Catálogo sin llamada a `/reservas/catalogo`)
  y lo pasa después. Hay precedente: la simulación del panel que se hizo para separar la búsqueda.

---

## 11. Unificar en un solo punto el formato de placas colombianas

### Estado hoy: el mismo formato escrito en al menos nueve sitios, y **no todos dicen lo mismo**
| Dónde | Qué define |
|---|---|
| `bulevar-verde-api/src/modules/vigilancia/placas.ts` | Carro `^[A-Z]{3}\d{3}$`, moto `^[A-Z]{3}\d{2}[A-Z]$`, marcadores `ELECTRICO` / `SIN PLACA` |
| `static/js/vehiculos.js` | `placaValida()` y `tipoPorPlaca()` (esta última **la añadí yo en esta sesión** al hacer la detección automática del tipo: es otra copia más) |
| `static/js/lector-placas-ocr.js` (`FORMATOS`) | Los dos formatos, con el comentario «deben coincidir con vehiculos.js y placas.ts» |
| `static/js/lector-placas.js` | Texto de ayuda `ABC12D` / `ABC123` |
| `layouts/datos-personales/list.html` (~línea 4300) | **Regex distinta**: `^[A-Z]{3}(?:\d{3}\|\d{2}[A-Z]\|\d{2})$`, es decir acepta además **5 caracteres** (`ABC12`) |
| `google/datos_maestros_info_aptos.js`, `google/sanciones.js` (×3) | Apps Script heredado, con su propia copia |

La API del portal del residente **no valida el formato**: `vehiculoSchema` solo exige `min(1)`. La regex del
cliente es lo único que lo frena, y cualquier llamada directa la salta. Lo mismo `autorizacionVisitanteSchema`
(`POST /autorizaciones-visitante`, solo `min(1).max(10)`): acepta incluso una placa marcador
(`SIN PLACA`). No afecta la atribución porque el lector nunca captura marcadores, pero debe usar la
validación única.

`static/js/vehiculos.js` tiene además `normalizarPlaca()` (mayúsculas, sin espacios, puntos ni guiones;
los marcadores conservan su forma), añadida al corregir un bug: el formulario detectaba el tipo de
`ABC 123` y luego rechazaba esa misma placa al registrarla. Es la normalización correcta, pero es **otra
copia** a absorber por el módulo único.

### Consecuencia real
El residente puede registrar `ABC12` (formato antiguo de moto) desde su portal, y vigilancia **no puede**
registrar ni leer esa misma placa. Son dos puertas con reglas distintas sobre la misma tabla.

### Decisiones previas a unificar
1. **¿Qué formatos son válidos?** Hoy: carro `ABC123` y moto `ABC12D`. El portal añade `ABC12`. Faltan por
   decidir, con una fuente oficial (Ministerio de Transporte / RUNT) y no de memoria: motos antiguas,
   remolques, vehículos oficiales y diplomáticos, y si el parqueadero de visitantes debe aceptarlos.
2. **Las placas marcador** (`ELECTRICO`, `SIN PLACA`): ver el defecto de abajo.

### Defecto encontrado y **ya corregido** en esta sesión
`Vehiculo.placa` es única, así que **todas** las placas `ELECTRICO`/`SIN PLACA` comparten una sola fila.
Con el cierre de vínculos de la Fase 2 (un vehículo = una unidad vigente), registrar una moto eléctrica
en el apartamento 205 **cerraba el vínculo de la del 101**. Se corrigió con `esPlacaMarcador()` en
`placas.ts`: ni `cerrarVinculosVigentes` ni `recuperarRegistrosHuerfanos` actúan sobre marcadores. Tres
pruebas lo cubren (portal, vigilancia, ambos marcadores).

Sigue **abierto el diseño de fondo**: todos los vehículos sin placa comparten identidad. Dos apartamentos
con scooter eléctrico quedan vinculados al *mismo* vehículo en los reportes. Opciones: una placa sintética
única por vehículo (`SIN PLACA-<id>`), o tratarlos como vehículos sin identidad que no entran en `Vehiculo`.

### Enfoque propuesto
1. **Una definición, un contrato.** La API (`placas.ts`) es la fuente de verdad. En el frontend, un solo
   módulo `static/js/placas-colombia.js` que exponga `normalizar`, `tipoDe`, `esValida` y la lista de
   formatos; lo usan `vehiculos.js`, el OCR, el lector y el portal del residente. Se borran las demás copias.
2. **Normalizar en un solo sitio**: mayúsculas, sin espacios, puntos ni guiones (ya lo exige
   `data/REGLAS_OPERATIVAS.md`; hoy cada pantalla lo hace a su manera).
3. **Un fichero de casos compartido** (`placas-casos.json`: placa → válida/tipo esperado, incluidos los
   límites y los marcadores) que ejecutan **a la vez** los tests de la API y los del frontend. Como son dos
   repositorios, este fichero es lo que impide que las dos definiciones se separen otra vez.
4. **Validar en el servidor del portal.** `vehiculoSchema` debe usar la misma función que vigilancia.
5. Las copias de Apps Script: o se actualizan, o se anotan como heredadas a retirar (ver el punto 4 de esta
   lista y el módulo `google/`, que sigue sirviendo a `/sanciones/`).

### Criterios de aceptación
- `grep` de `[A-Z]{3}` en `layouts/`, `static/js/` y `src/` solo encuentra la definición única.
- Cada formato aceptado en el portal es aceptado por vigilancia y por el lector, y viceversa.
- El fichero de casos pasa en API y frontend; romper una regex hace fallar ambos.

---

## 12. Reparar y mejorar la identificación de placas del lector

### Lo primero: lo que dices que falla, **en el texto ya funciona**
Se ejecutó la función real `corregir()` de `lector-placas-ocr.js` con tus ejemplos:

| Lectura | Como carro (`LLLDDD`) | Como moto (`LLLDDL`) |
|---|---|---|
| `OOOOOO` | `OOO000` (3 cambios) | `OOO00O` (2 cambios) |
| `TS666H` | no es válida | `TSG66H` (1 cambio) |

Es decir, la regla `6→G` por posición existe (`A_LETRA`/`A_DIGITO`) y `TS666H` se corrige bien. **Por tanto
la causa de lo que ves no está en esa regla**: o el OCR entrega otro texto del que imaginas (la placa de
moto tiene **dos líneas**, que se leen juntas), o interviene la puntuación. Hay que verlo con las fotos
reales antes de tocar el algoritmo.

### Defecto de diseño comprobado: el empate entre carro y moto
`OOOOOO` es ambiguo y el algoritmo lo resuelve **mal para tu caso**. El puntaje es
`confianza − 15 × cambios − …`, así que cada cambio cuesta lo mismo. Con confianza 90 la moto
`OOO00O` (2 cambios) puntúa 60 y el carro `OOO000` (3 cambios) 45; incluso con el bono de +8 por tipo
esperado el carro llega a 53 y **pierde**. Tú dirías `OOO000`: es una convención de lectura, no una
consecuencia del algoritmo.

### Otras carencias comprobadas en las tablas
- **Solo hay confusiones dígito↔letra, ninguna letra↔letra** (G↔C, H↔N/M, D↔O, E↔F, V↔Y…), que son las
  que más abundan en una placa real.
- **Asimétricas**: `A_DIGITO` convierte D, Q y U en `0`, pero `A_LETRA` solo convierte `0` en `O`. Una `D`
  leída como `0` (p. ej. `ABC120` por `ABC12D`) se queda sin corregir y sale como `ABC12O`.
- Faltan 3, 7 y 9 en `A_LETRA`.
- **El coste de cada confusión es el mismo**: `O↔0` es muy probable y `A↔4` mucho menos, y hoy valen igual.

### Qué se propone
1. **Primero medir.** Montar un corpus de fotos de placas (propias o puestas en escena; **no** sacarlas del
   bucket de producción sin una decisión sobre datos personales) con su placa real, y un arnés que ejecute
   Tesseract y mida: acierto exacto, acierto en el top 3, y errores por tipo. Sin esto cualquier ajuste es
   a ciegas. Tesseract.js corre en Node, así que el arnés no necesita navegador.
2. **Costes de confusión ponderados** en lugar de 15 fijos: una matriz de confusión (`O/0`, `G/6`, `I/1`,
   `S/5`, `B/8`, `Z/2`…) con coste bajo para las probables, y letra↔letra incluida.
3. **Aprovechar las alternativas de Tesseract** por carácter, no solo la primera lectura. *Sin comprobar*
   que la versión 5.1.1 autoalojada las entregue con el whitelist activo.
4. **Reglas por posición de la estructura**: las tres primeras son letras; el último carácter decide el
   tipo (letra = moto, dígito = carro); a partir de ahí se resuelve el empate carro/moto con un *a priori*
   (los carros son más frecuentes) y no por número de cambios.
5. **Ajuste a placas conocidas.** La idea más potente: el edificio es un conjunto cerrado de vehículos. Si
   una lectura queda a una sola sustitución de una placa ya registrada, se propone esa. Cuidado: implica
   llevar una lista de placas al dispositivo; valorar privacidad (¿hash? ¿consulta a la API?).
6. **Que el vigilante vea las alternativas**: «¿ABC12D o ABC120?» con un toque, en vez de escribir.

### Criterios de aceptación
- El arnés reporta un acierto base y mejora de forma medible tras cada cambio; ningún ajuste se acepta sin
  ese número.
- `OOOOOO` se resuelve a `OOO000` con una regla explícita y probada, no por azar del puntaje.
- Un test por cada confusión de la matriz, y por cada empate carro/moto.

---

## 13. Mejorar el modo offline del lector de placas

### Lo que ya funciona
La cola (`lector-placas-cola.js`) es sólida: guarda en IndexedDB, **reenvía al volver la red** (evento
`online`) y por temporizador, **en orden de captura**, se detiene al primer error transitorio y **libera
la foto** del teléfono una vez enviada. Es idempotente por `clientRequestId`.

### Dónde se rompe
| # | Hueco | Efecto |
|---|---|---|
| 1 | **No hay service worker.** Ningún archivo lo registra; solo hay un `site.webmanifest` | «Offline» hoy significa solo «la página que ya estaba abierta sigue viva». Si el vigilante recarga, cierra la pestaña o abre la app **sin cobertura**, no carga nada: ni la página, ni el JS, ni Tesseract |
| 2 | El motor OCR (Tesseract y los datos de idioma) se **carga perezosamente** desde `/vendor/tesseract/` | Sin red en el primer uso no hay lectura. Si el navegador cachea o no los datos de idioma es un detalle de Tesseract.js, **sin comprobar** |
| 3 | **No se pide almacenamiento persistente** (`navigator.storage.persist()` no aparece en el código) y no se maneja la cuota | El navegador puede desalojar la cola bajo presión de espacio, y Safari en iOS borra los datos de sitios sin uso. Con 100+ fotos por noche, en el peor caso **se pierden capturas sin aviso** |
| 4 | Reintento por **intervalo fijo**, sin retroceso | Con la red mala insiste igual cada vez, gastando batería y datos |
| 5 | `navigator.onLine` se usa como interruptor y **no es fiable** (es verdadero en una wifi sin internet) | Se intenta enviar y falla, aunque el código lo tolera |
| 6 | Los errores permanentes (4xx) pasan a `rechazado` y **quedan esperando una acción manual** | Una captura con `fechaCaptura` de más de 30 días (la API la rechaza) o una foto demasiado grande se queda parada |
| 7 | **La unidad se atribuye cuando se sube, no cuando se fotografía** | Un vehículo cuyo vínculo cambió entre la captura y el envío se atribuye con el estado *actual*. En una ronda larga sin red es el caso normal |

El hueco 7 merece atención aparte: `VinculoVehiculoUnidad` conserva `vigenteDesde`/`vigenteHasta`, así que la
API **podría** resolver la unidad *a la fecha de captura*. Hoy no lo hace.

### Qué se propone
1. **Service worker** que precachee el shell de la página del lector y el motor OCR (`/vendor/tesseract/`),
   con una versión de caché para invalidarla. Es lo que convierte «offline» en real. Hay que acotarlo a
   las rutas del lector y no al resto del sitio.
2. `navigator.storage.persist()` al iniciar la ronda, y **aviso al vigilante** si el navegador lo niega o si
   queda poco espacio (`storage.estimate()`).
3. **Retroceso exponencial** con tope, reiniciado al volver el evento `online`.
4. Detectar la conectividad real con una petición ligera en vez de fiarse de `navigator.onLine`.
5. Un estado visible y **recuperable** para los `rechazado`, con la causa, y reintento o corrección en un
   toque (hoy hay `reintentar` y `descartar` por registro).
6. **Resolver la unidad a la fecha de captura** en la API (hueco 7).
7. Un **indicador de ronda**: «37 guardadas, 12 sin enviar» siempre a la vista, y un botón de exportar la
   cola por si todo falla.

### Cómo probarlo
Los fallos de offline no aparecen en el escritorio con buena red. Hace falta: modo avión real en un móvil,
un caso de **captive portal** (wifi sin salida), cierre y reapertura de la app sin cobertura, y llenar el
almacenamiento. Conviene que lo cubra el entorno local del punto 1 con una API que se pueda cortar.

### Criterios de aceptación
- Con el móvil en modo avión, cerrar el navegador, reabrirlo y hacer una ronda de 20 capturas **funciona** y
  las 20 llegan al volver la red, sin duplicados.
- Si el navegador niega el almacenamiento persistente, el vigilante lo sabe antes de empezar.
- Una captura atribuida a la fecha en que se tomó, no a la de envío (con un test que cambie el vínculo
  entre ambas).
- Ninguna captura queda en `rechazado` sin que el vigilante vea por qué.

---

## Orden sugerido para la segunda tanda

**Los dos bugs (9 y 10) van antes que todo lo demás de esta tanda**: son defectos que el usuario ya sufre
y son pequeños. El 10 es un arreglo de pocas líneas con causa confirmada; el 9 necesita primero que
alguien describa el síntoma.

El punto 11 (formato único de placas) va **antes** que el 12 (OCR): el OCR debe apoyarse en la definición
única, no en una copia más. El 12 empieza por montar el corpus de fotos y el arnés de medida, y el 13
(offline) es independiente de ambos salvo por la parte de atribuir la unidad a la fecha de captura.

Después, `1 (entorno local)` primero, porque 7 y 8 mueven datos con personas y hay que ensayar contra datos
sintéticos. Luego `5 (roles)`, que condiciona 6 y 8. Después `7` y `8` decididos juntos, y `6 (dashboard)`
al final, cuando existan las fuentes que mostrar, aunque su primera versión (parqueadero y convivencia)
puede salir antes.

---

## Preguntas abiertas para quien decide

1. Entorno local: ¿sintéticos con la forma de producción (recomendado) o volcado anonimizado?
2. Expiración: ¿qué duración por rol, y absoluta o por inactividad? ¿Cuánto dura un turno de vigilancia?
3. ¿Se puede rotar `RESIDENT_SESSION_SECRET` en Cloud Run (cierra las sesiones vigentes, máx. 2 h)?
4. Limpieza: ¿`prueba-api-unidades` y `hugo.yml`/`redirect.html` siguen en uso?
5. Supervisor: ¿qué puede hacer que un vigilante no? ¿Puede corregir un apartamento asignado por error?
6. Dashboard: ¿qué pendientes son críticos para administración? ¿Ventana de «novedades»: 24 h, 7 días?
7. Mantenimiento y PQRS: ¿modelo común o separado? ¿Quién reporta mantenimiento y con qué identidad?
8. Consejo: ¿ve todas las PQRS o solo las remitidas? ¿«Dashboard» es una vista nueva o la lista actual ampliada?
9. Descarga de documentos: ¿qué pantalla (Facturación o Documentos del club), qué dispositivo y qué ocurre exactamente al fallar?
10. Zonas comunes: ¿el catálogo debe refrescarse en cada entrada a la pestaña o basta con cargarlo una vez?
11. Placas: ¿qué formatos son válidos (motos antiguas, remolques, oficiales, diplomáticos)? ¿Cuál es la fuente oficial?
12. OCR: ¿hay fotos de placas utilizables como corpus de prueba, sin usar las del bucket de producción?
13. Sin placa: ¿una placa sintética única por vehículo o dejar de registrarlos en `Vehiculo`?
14. Offline: ¿qué dispositivos usa vigilancia (Android o iOS, y qué navegador)? Condiciona el service worker y la persistencia.
