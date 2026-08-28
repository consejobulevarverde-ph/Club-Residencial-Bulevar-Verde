# Requerimiento funcional y técnico: Control de asistencia y votación para asambleas

**Proyecto:** Club Residencial Bulevar Verde  
**Estado:** Borrador para revisión funcional, jurídica y técnica  
**Versión:** 1.0  
**Fecha:** 27 de agosto de 2026  
**Alcance inicial:** Asambleas sectoriales y Asamblea General de Propietarios

---

## 1. Propósito

Implementar en el portal de Bulevar Verde una funcionalidad para la asamblea:

1. Preparar el censo de participantes y derechos de voto de una asamblea.
2. Registrar y auditar la asistencia presencial o virtual y calificarl el quorum.
3. Gestionar propietarios, copropietarios, representantes, apoderados y delegados.
4. Calcular el quórum en tiempo real y conservar cortes históricos verificables.
5. Crear, abrir, cerrar y auditar votaciones.
6. Aplicar diferentes reglas de voto según el tipo de decisión y el RPH.
7. Evitar votos duplicados, modificaciones no autorizadas y pérdida de información.
8. Generar anexos de asistencia, quórum y resultados para el acta.

La solución debe soportar más de 1.000 personas conectadas, picos simultáneos de votación y operación con alta disponibilidad, sin incorporar la transmisión de video dentro de la infraestructura transaccional.

---

## 2. Contexto normativo y reglas del RPH

La implementación debe parametrizar las reglas y no asumir que todas las decisiones se cuentan de la misma manera.

Como mínimo se deben contemplar las siguientes disposiciones del RPH de Bulevar Verde:

- Artículo 61: los votos de la Asamblea General y la diferencia entre decisiones con contenido económico y no económico.
- Artículo 68: segunda convocatoria.
- Artículos 69 a 71: reuniones no presenciales, evidencia inequívoca de la comunicación y registro de identidad, contenido y hora.
- Artículo 72: quórum y mayorías ordinarias.
- Artículo 73: decisiones que exigen mayoría calificada del 70 % de los coeficientes que integran el Club Residencial.
- Artículo 75: información mínima que debe contener el acta.
- Artículo 78: conformación de cinco asambleas sectoriales y posibilidad de convocarlas virtualmente.
- Artículo 79: representación, copropiedad, prohibición de fraccionar el voto de un mismo bien y límite de cinco propietarios representados por una persona.
- Artículos 81, 86 y 87: número de votos y quórum de las asambleas sectoriales.
- Artículo 90: elección de tres delegados por asamblea sectorial y distribución de los votos que representarán en la Asamblea General.
- Artículo 30 y disposiciones concordantes: condición de mora y restricciones definidas por el RPH.

La clasificación jurídica de cada votación debe ser aprobada por la administración, el presidente y/o el asesor jurídico antes de abrirla. El sistema ejecuta la regla configurada, pero no decide autónomamente si un asunto es económico, no económico o de mayoría calificada.

Antes de producción se debe realizar una validación jurídica del flujo completo, especialmente de las reglas aplicables a reuniones virtuales, propietarios morosos, votaciones secretas, poderes y decisiones de segunda convocatoria.

---

## 3. Arquitectura actual que debe conservarse

### 3.1 Frontend

- Hugo como generador de sitio estático.
- Firebase Hosting como alojamiento y CDN.
- Bootstrap 5.3.3, Bootstrap Icons y JavaScript vanilla.
- Una IIFE por página para encapsular el comportamiento JavaScript.
- Configuración de endpoints mediante parámetros de `hugo.toml`.

### 3.2 Backend y datos

- API `bulevar-verde-api` desplegada en Cloud Run, región `us-east4`.
- Firebase Data Connect como capa GraphQL.
- PostgreSQL en Cloud SQL como sistema de registro.
- Entidades existentes reutilizables: `Unidad`, `Parqueadero`, `Persona`, `VinculoUnidadPersona`, `HistorialCartera`, `UsuarioPortal` y `EventoAuditoria`.

### 3.3 Autenticación actual

- Residentes: flujo `/api/v1/datos-personales/iniciar` y `/api/v1/datos-personales/validar`, con token de sesión firmado y almacenado en `sessionStorage` bajo `bvDatosPersonalesToken`.
- Administración y personal: Firebase Authentication y envío del Firebase ID token a la API.
- La API valida la identidad, el rol y la autorización antes de ejecutar operaciones administrativas de Data Connect.

### 3.4 Decisión arquitectónica obligatoria

La asistencia, el censo, el quórum y los votos deben almacenarse transaccionalmente en PostgreSQL por medio de la API y Data Connect.

Google Apps Script, Google Sheets y el navegador no pueden ser el sistema oficial de registro de asistencia o votos. Se pueden utilizar servicios externos para transmisión, correo o almacenamiento de soportes, pero nunca como única fuente de verdad del resultado.

---

## 4. Principios de diseño

1. **La persona se autentica; el derecho de voto pertenece al bien privado.**
2. **El censo de cada asamblea es una fotografía inmutable.** Los cambios posteriores en personas, unidades, coeficientes o cartera no alteran una asamblea ya publicada.
3. **Asistencia y conexión son conceptos diferentes.** Una persona puede estar registrada legalmente como asistente aunque temporalmente pierda conexión.
4. **El servidor es autoritativo.** Apertura, cierre, hora, elegibilidad, peso y aceptación del voto se determinan en backend.
5. **Todo comando crítico debe ser idempotente.** Un reintento de red no puede crear un segundo voto.
6. **Los registros cerrados no se editan.** Cualquier corrección crea una nueva ronda o un evento compensatorio auditado.
7. **El voto no se calcula desde datos vivos.** Cada derecho utiliza el peso congelado en el censo.
8. **El video se desacopla del voto.** Una falla del streaming no debe derribar el control de asistencia ni la API de votación.
9. **Privacidad por diseño.** No se guardan elecciones individuales en logs técnicos ni se exponen a participantes no autorizados.

---

## 5. Alcance

### 5.1 Incluido en el MVP

- Creación y configuración de asambleas sectoriales y generales.
- Primera y segunda convocatoria.
- Generación, revisión, publicación y cierre del censo.
- Registro manual y virtual de asistencia.
- Asociación de una persona con uno o varios derechos de voto.
- Registro de apoderados, representantes y delegados.
- Aplicación del límite de cinco propietarios representados, cuando corresponda.
- Cálculo de quórum por número de votos, coeficientes o peso configurado.
- Votaciones ordinarias y de mayoría calificada.
- Decisiones económicas y no económicas.
- Votos a favor, en contra y en blanco; opciones múltiples cuando la proposición lo requiera.
- Votaciones públicas y secretas.
- Resultados en tiempo real para la mesa y publicación posterior al cierre.
- Auditoría completa y exportación de anexos.
- Enlace externo de transmisión configurable por asamblea.
- Operación desde dispositivos móviles y computadores.

### 5.2 Fuera del MVP

- Hospedaje o distribución propia de video.
- Reconocimiento facial o biometría.
- Envío masivo de SMS como mecanismo principal de autenticación.
- Firma electrónica certificada de poderes.
- Transcripción automática de la reunión.
- Redacción automática del acta completa.
- Integración contable bidireccional para actualizar cartera durante la asamblea.

---

## 6. Actores y permisos

### 6.1 Participante

Propietario, copropietario, representante legal, apoderado o delegado que puede:

- Autenticarse.
- Consultar la asamblea para la cual fue habilitado.
- Confirmar su asistencia.
- Ver los bienes o derechos que representa.
- Consultar el peso aplicable a cada derecho sin exponer información sensible de otros propietarios.
- Votar cuando una votación esté abierta.
- Obtener comprobante de recepción.
- Consultar resultados autorizados.

### 6.2 Operador de registro

Usuario administrativo habilitado para:

- Buscar personas y bienes en el censo.
- Registrar asistencia presencial o asistida.
- Verificar documentos y poderes.
- Resolver duplicidades antes de abrir la reunión.
- No puede modificar el resultado ni abrir/cerrar votaciones.

### 6.3 Secretario

Rol asignado dentro de una asamblea. Puede:

- Registrar proposiciones y texto definitivo de preguntas.
- Preparar votaciones en borrador.
- Consultar asistencia, quórum y resultados.
- Generar exportaciones para el acta.

### 6.4 Presidente

Rol asignado dentro de una asamblea. Puede:

- Declarar instalada la reunión.
- Autorizar apertura y cierre de votaciones.
- Suspender una votación ante una contingencia.
- Autorizar una nueva ronda cuando exista justificación registrada.

### 6.5 Administrador

Reutiliza los roles actuales `administrador` y `superadmin` de la API. Puede:

- Crear y configurar asambleas.
- Generar y publicar censos.
- Gestionar representantes, poderes y delegados.
- Asignar miembros de mesa.
- Consultar auditoría y exportar información.

### 6.6 Revisor fiscal / auditor

Rol de solo lectura asignado por asamblea. Puede:

- Consultar censo, asistencia, quórum, eventos y resultados.
- Descargar exportaciones verificables.
- Registrar una constancia u observación sin alterar datos existentes.

Los roles presidente, secretario, operador y auditor deben asignarse por asamblea. No es obligatorio convertirlos en nuevos valores de `UsuarioPortal.rolGlobal` durante el MVP.

---

## 7. Flujo funcional principal

### 7.1 Preparación

1. El administrador crea la asamblea.
2. Define tipo, sector, convocatoria, fecha, zona horaria, ventanas de registro y enlace de transmisión.
3. Genera un censo preliminar desde las unidades, parqueaderos, personas, vínculos y cartera existentes.
4. El sistema crea derechos de voto independientes del dato vivo.
5. Administración revisa titulares, copropietarios, mora, coeficientes, votos sectoriales, poderes y delegaciones.
6. Se resuelven inconsistencias.
7. Se publica y congela el censo.
8. El sistema envía o habilita las credenciales de acceso.

### 7.2 Registro de asistencia

1. El participante ingresa por el portal de residentes o recibe atención en una mesa de registro.
2. El sistema valida la sesión y muestra la asamblea disponible.
3. El participante revisa la identidad y los derechos que representará.
4. Confirma expresamente su asistencia.
5. El servidor registra hora, origen, sesión y derechos activados.
6. El tablero actualiza asistencia y quórum agregado.
7. Cualquier sustitución de representante queda auditada y no puede producir doble representación.

### 7.3 Instalación

1. El presidente consulta el quórum.
2. El sistema genera un corte inmutable de quórum.
3. El presidente declara instalada o no instalada la reunión.
4. Si aplica segunda convocatoria, la asamblea debe estar configurada explícitamente como tal; no se cambia el tipo de convocatoria silenciosamente.

### 7.4 Votación

1. El secretario crea o selecciona una votación en borrador.
2. La mesa revisa el texto, opciones, regla de peso, denominador, mayoría y visibilidad.
3. El presidente abre la votación.
4. El participante selecciona una opción para cada derecho que representa.
5. La interfaz muestra un resumen y solicita confirmación.
6. El backend valida elegibilidad, estado, horario, derecho y duplicidad.
7. El voto se registra y devuelve un comprobante.
8. Al cerrar, se consolida el resultado y se genera un corte de quórum asociado.
9. Los participantes ven el resultado únicamente si la configuración lo permite.

### 7.5 Cierre

1. Se cierran todas las votaciones pendientes.
2. Se registra el cierre de la asamblea.
3. Se generan anexos de asistentes, representaciones, quórum, votaciones, resultados y eventos críticos.
4. La asamblea pasa a solo lectura.

---

## 8. Requerimientos funcionales

### RF-001. Crear asamblea

El administrador debe poder crear una asamblea con:

- Nombre y descripción.
- Tipo: `SECTORIAL`, `GENERAL`, `EXTRAORDINARIA` u otro valor parametrizable.
- Sector aplicable: 1 a 5, todos o conjunto específico.
- Convocatoria: `PRIMERA` o `SEGUNDA`.
- Modalidad: `VIRTUAL`, `PRESENCIAL` o `MIXTA`.
- Fecha y hora programadas.
- Inicio y cierre del registro.
- Enlace de transmisión y enlace de respaldo opcionales.
- Reglas generales de quórum.
- Estado inicial `BORRADOR`.

### RF-002. Estados de la asamblea

Estados mínimos:

```text
BORRADOR -> CENSO_EN_REVISION -> PUBLICADA -> REGISTRO_ABIERTO
-> INSTALADA -> EN_CURSO -> CERRADA
```

También debe existir `CANCELADA`. Cada transición debe validarse en backend y generar un evento de auditoría.

### RF-003. Generar censo preliminar

El administrador debe poder generar un censo desde:

- `Unidad`.
- `Parqueadero`.
- `Persona`.
- `VinculoUnidadPersona` activo a la fecha de corte.
- Coeficientes registrados.
- Tabla de votos sectoriales configurada.
- Último `HistorialCartera` válido para la fecha de corte.

El sistema no debe reutilizar `elegibleReservas` para decidir el derecho político. Debe calcular o registrar un campo independiente `elegibleVotar`, su motivo y la fuente utilizada.

### RF-004. Fotografía inmutable del censo

Al publicar el censo se deben congelar:

- Bien privado y tipo.
- Sector.
- Titular o titulares conocidos.
- Persona inicialmente habilitada para representar el derecho.
- Coeficiente.
- Número de votos sectoriales o generales.
- Estado de elegibilidad.
- Motivo de restricción.
- Periodo y fecha de corte de cartera.
- Regla de voto aplicable.

Los cambios posteriores requieren una corrección auditada del censo antes de instalar la asamblea. Después de instalada, no se permite editar el censo; debe registrarse una novedad compensatoria autorizada.

### RF-005. Gestionar inconsistencias del censo

El sistema debe listar como mínimo:

- Bien sin propietario activo.
- Varios representantes activos para el mismo bien.
- Coeficiente ausente o inválido.
- Parqueadero sin asociación válida cuando la regla requiera agruparlo.
- Persona sin documento.
- Persona sin medio de contacto.
- Copropiedad sin representante único.
- Poder duplicado.
- Una persona con más de cinco propietarios representados.
- Total de coeficientes o votos distinto del valor esperado configurado.

No se podrá publicar el censo mientras existan errores bloqueantes.

### RF-006. Gestionar representaciones y poderes

Debe ser posible registrar para una asamblea:

- Otorgante.
- Apoderado o representante.
- Bien o derechos cubiertos.
- Fecha de recepción.
- Tipo de representación.
- Estado: `PENDIENTE`, `APROBADA`, `RECHAZADA`, `REVOCADA`.
- Observación.
- URL o identificador del soporte.
- Hash SHA-256 del soporte cuando exista archivo digital.
- Usuario que verificó y fecha de verificación.

Una representación aprobada no puede asignar el mismo derecho simultáneamente a dos personas.

### RF-007. Aplicar límite de representaciones

El sistema debe impedir aprobar una configuración que exceda el máximo de cinco propietarios representados por una persona, salvo que una regla jurídica expresamente configurada determine que el límite no aplica a un caso de representación legal.

El conteo debe diferenciar propietarios representados de cantidad de bienes, para no aplicar incorrectamente el límite a un propietario que posea varios bienes.

### RF-008. Gestionar delegados sectoriales

Para la Asamblea General debe poder registrarse:

- Sectorial de origen.
- Tres delegados elegidos.
- Distribución de votos a favor, en contra y en blanco que llevará cada delegado.
- Derechos que se descuentan porque el propietario asistirá directamente.
- Acta o soporte de la elección sectorial.

La suma de votos de delegados y asistentes directos debe conciliar con el total de la sectorial.

### RF-009. Autenticación de residentes

La funcionalidad debe reutilizar el flujo actual del portal de datos personales.

- Si existe una sesión válida, la API debe verificarla y solicitar confirmación de ingreso a la asamblea.
- Si no existe, se reutilizan `/iniciar` y `/validar`.
- El token de asamblea no debe contener PII; como máximo identificadores opacos de persona, sesión y asamblea.
- Debido a que la sesión actual dura dos horas, la API debe emitir una sesión específica de asamblea con expiración configurable que cubra el evento, o implementar renovación segura mientras la asamblea permanezca activa.
- El token se almacena únicamente en `sessionStorage`.

### RF-010. Autenticación del personal

Administradores y operadores deben utilizar Firebase Authentication. Todos los endpoints administrativos reciben Firebase ID token y verifican rol y asignación dentro de la asamblea.

### RF-011. Registrar asistencia virtual

El participante debe presionar una acción explícita `Registrar mi asistencia`. La API debe registrar:

- Asamblea.
- Persona autenticada.
- Derechos que representa.
- Hora oficial del servidor.
- Modalidad virtual.
- Identificador de sesión.
- IP y agente de usuario tratados según política de datos.
- Versión de términos o declaración aceptada.

Debe devolverse un comprobante de asistencia.

### RF-012. Registrar asistencia presencial o asistida

Un operador puede registrar asistencia presencial después de verificar documento. El registro debe guardar quién realizó la operación y el motivo. El participante no necesita una cuenta Firebase.

### RF-013. Prevenir doble asistencia o representación

Un derecho de voto no puede quedar activo para dos representantes en la misma asamblea. Si el titular aparece después de haber otorgado poder, el operador debe resolver la situación con una transición auditada antes de activar el derecho.

### RF-014. Estado de conexión

El portal debe enviar una señal liviana de actividad con intervalo configurable, recomendado entre 45 y 60 segundos. El tablero distinguirá:

- Asistencia registrada.
- Sesión con conexión activa.
- Última actividad.
- Sesión desconectada temporalmente.

La pérdida de una señal no elimina la asistencia legal ni modifica silenciosamente el quórum. Los cortes de quórum registran la regla utilizada.

### RF-015. Calcular quórum

El motor debe soportar:

- Peso por coeficiente.
- Peso por número de votos sectoriales.
- Un voto por bien privado.
- Peso específico congelado en el censo.
- Denominador sobre total elegible o total representado.
- Primera y segunda convocatoria.
- Umbral `MAYOR_QUE_50`, `MITAD_MAS_UNO`, porcentaje configurable u otra regla explícita.

El resultado debe mostrar numerador, denominador, porcentaje, regla y estado `ALCANZADO` o `NO_ALCANZADO`.

### RF-016. Generar cortes de quórum

Se debe crear un registro inmutable:

- Al solicitarlo la mesa.
- Al instalar la reunión.
- Al abrir cada votación.
- Al cerrar cada votación.
- Al cerrar la asamblea.

Cada corte contiene los derechos presentes o representados, totales agregados y hash de integridad.

### RF-017. Crear votación

La mesa debe definir:

- Título.
- Texto exacto de la proposición.
- Opciones.
- Tipo: económica, no económica, elección o personalizada.
- Modelo de peso.
- Denominador.
- Regla de aprobación.
- Si permite voto en blanco.
- Si es pública o secreta.
- Orden en la agenda.
- Duración sugerida.

### RF-018. Estados de votación

Estados mínimos:

```text
BORRADOR -> LISTA -> ABIERTA -> CERRADA -> CONSOLIDADA
```

También deben existir `SUSPENDIDA`, `ANULADA` y `REEMPLAZADA`. Solo el presidente o administrador autorizado puede abrir, cerrar, suspender o anular.

### RF-019. Abrir votación

Al abrir, el servidor debe:

- Congelar la versión del texto y opciones.
- Asociar el corte de quórum de apertura.
- Registrar hora de servidor.
- Publicar el evento a los participantes.
- Rechazar cualquier edición posterior de la pregunta.

### RF-020. Emitir voto

El participante puede votar por uno o varios derechos que representa. La interfaz debe permitir opciones distintas por derecho, porque una persona puede seguir instrucciones diferentes de varios poderdantes.

El request debe incluir:

- `votacionId`.
- `ronda`.
- `idempotencyKey` generado una sola vez por confirmación.
- Lista de `derechoVotoId` y `opcionId`.

El backend valida en una transacción:

- Sesión y asamblea.
- Votación abierta.
- Hora del servidor dentro de la ventana.
- Derecho activo y representado por la persona.
- Derecho elegible para esa votación.
- Opción válida.
- Ausencia de voto previo para el mismo derecho y ronda.

### RF-021. Confirmación final

Antes de enviar, la interfaz debe mostrar el resumen de todos los derechos y opciones. Después de confirmar, el voto es definitivo para esa ronda y no puede editarse.

Si la mesa necesita repetir la votación, debe crear una nueva ronda y conservar la anterior como reemplazada o anulada con motivo.

### RF-022. Idempotencia y reintentos

Si el cliente no recibe respuesta, debe reintentar con el mismo `idempotencyKey`. La API devuelve el comprobante original sin registrar un voto adicional.

Debe existir un endpoint para consultar el estado de un comprobante sin revelar la opción elegida cuando la votación sea secreta.

### RF-023. Comprobante

La API devuelve:

- Código de comprobante.
- Fecha y hora de recepción.
- Votación y ronda.
- Cantidad de derechos procesados.
- Hash verificable.
- Estado `ACEPTADO`.

En votación secreta, el comprobante no incluirá la opción ni permitirá relacionarla públicamente con la persona.

### RF-024. Resultados

La mesa debe ver, con actualización agregada:

- Derechos habilitados.
- Derechos representados al corte.
- Derechos que votaron.
- Participación porcentual.
- Totales por opción.
- Totales por peso.
- Votos en blanco.
- Derechos sin votar.
- Regla de aprobación y resultado.

El resultado público se muestra solo después del cierre, salvo que se configure expresamente otra conducta.

### RF-025. Votación secreta

En votaciones secretas:

- La UI administrativa no muestra selección individual.
- Logs y auditoría no incluyen la opción junto a la identidad.
- Se conserva evidencia suficiente para demostrar que cada derecho votó una sola vez.
- La exportación pública contiene agregados.
- El mecanismo técnico de separación o cifrado debe documentarse antes de habilitar esta modalidad en producción.

### RF-026. Anulación y nueva ronda

No se permite borrar votos. Para repetir una votación:

1. Presidente registra motivo.
2. La ronda anterior pasa a `ANULADA` o `REEMPLAZADA`.
3. Se crea una nueva ronda con nuevo identificador.
4. Los resultados oficiales señalan cuál ronda es válida.

### RF-027. Constancias e intervenciones

Debe ser posible registrar una constancia con:

- Persona.
- Calidad en que actúa.
- Texto.
- Hora del servidor.
- Referencia opcional a una votación.
- Usuario que transcribió, si fue una intervención verbal.

### RF-028. Cerrar asamblea

Solo se permite cerrar cuando no existan votaciones abiertas o suspendidas. El cierre genera un último corte de quórum y bloquea modificaciones ordinarias.

### RF-029. Exportaciones

Generar como mínimo:

1. CSV de asistentes y representaciones.
2. CSV de derechos de voto congelados.
3. CSV de cortes de quórum.
4. CSV y PDF de resultados por votación.
5. JSON técnico de auditoría con hashes.
6. Anexo PDF consolidado para el acta.

Las exportaciones deben incluir zona horaria `America/Bogota`, versión del censo, fecha de generación y hash SHA-256.

### RF-030. Auditoría

Se deben auditar:

- Creación y cambios de configuración.
- Generación, corrección y publicación del censo.
- Aprobación, rechazo y revocación de poderes.
- Registro y sustitución de asistencia.
- Cortes de quórum.
- Apertura, suspensión, cierre, anulación y consolidación de votaciones.
- Aceptación de votos y reintentos, sin exponer opción secreta.
- Exportaciones.
- Cierre de la asamblea.

Los eventos deben ser append-only y reutilizar los datos disponibles en `EventoAuditoria` o una entidad específica de asambleas.

---

## 9. Reglas de negocio

### RN-001. Fuente del derecho

El derecho de voto se determina desde el censo congelado, no desde la sesión ni desde el frontend.

### RN-002. Bienes privados

El modelo debe representar apartamentos, parqueaderos y locales cuando jurídicamente tengan derecho independiente. No se debe asumir que `Unidad` siempre representa la totalidad de los derechos de un propietario.

### RN-003. Copropiedad

Cuando un bien tenga varios titulares, debe existir un único representante activo para el ejercicio del derecho.

### RN-004. No fraccionamiento

Un mismo derecho no puede repartirse entre dos personas ni votar parcialmente. Una persona que representa varios derechos sí puede votar de manera distinta por cada uno.

### RN-005. Mora

La elegibilidad política debe tener un campo y una justificación propios. El valor se congela al publicar el censo y solamente puede corregirse mediante novedad auditada.

### RN-006. Modelos de peso

Valores mínimos:

- `COEFICIENTE`.
- `UN_VOTO_POR_BIEN`.
- `VOTOS_SECTORIALES`.
- `PESO_CONGELADO`.

### RN-007. Denominadores

Valores mínimos:

- `TOTAL_ELEGIBLE`.
- `TOTAL_REPRESENTADO_CORTE_APERTURA`.
- `TOTAL_REPRESENTADO_CORTE_CIERRE`.
- `TOTAL_VOTOS_EMITIDOS` solo cuando exista aprobación jurídica expresa.

### RN-008. Mayorías

El motor no debe codificar una sola fórmula. Cada votación almacena:

- Operador: `MAYOR_QUE`, `MAYOR_O_IGUAL`, `MITAD_MAS_UNO`.
- Umbral numérico o porcentual.
- Denominador.
- Modelo de peso.

### RN-009. Hora

Todos los timestamps se almacenan como `Timestamp` en UTC. La presentación y exportación oficial utilizan `America/Bogota`.

### RN-010. Inmutabilidad

No hay endpoints `DELETE` para votos, asistencia, cortes o resultados cerrados. Las correcciones son eventos compensatorios.

### RN-011. Resultado definitivo

El resultado se calcula en backend. El frontend nunca determina si una proposición fue aprobada.

### RN-012. Transmisión

El enlace de video puede cambiarse durante una contingencia y el cambio se audita. La disponibilidad del video no define la disponibilidad de la API.

---

## 10. Modelo de datos propuesto

Los nombres finales deben ajustarse a las convenciones de Firebase Data Connect. Se propone agregar las siguientes entidades al `schema.gql`.

### 10.1 Asamblea

Campos mínimos:

```text
id UUID
codigo String unique
nombre String
descripcion String?
tipo String
sector String?
convocatoria String
modalidad String
estado String
fechaProgramada Timestamp
registroDesde Timestamp
registroHasta Timestamp
fechaInstalacion Timestamp?
fechaCierre Timestamp?
zonaHoraria String default America/Bogota
urlTransmision String?
urlTransmisionRespaldo String?
versionCenso Int
creadoPorUid String
fechaCreacion Timestamp
fechaActualizacion Timestamp
```

### 10.2 MiembroMesaAsamblea

```text
id UUID
asamblea Asamblea
usuarioPortal UsuarioPortal
rol String
activo Boolean
fechaAsignacion Timestamp
```

Restricción única sugerida: `(asamblea_id, usuario_portal_id, rol)`.

### 10.3 DerechoVotoAsamblea

Fotografía del derecho de voto:

```text
id UUID
asamblea Asamblea
tipoBien String
bienId UUID
codigoBien String
sector String?
propietarioPersonaId UUID?
propietarioNombreSnapshot String?
representantePersonaId UUID?
coeficienteSnapshot numeric(18,8)
votosSectorialesSnapshot numeric(18,8)
pesoBaseSnapshot numeric(18,8)
elegibleVotar Boolean
motivoNoElegible String?
periodoCarteraSnapshot String?
estadoCarteraSnapshot String?
versionCenso Int
activo Boolean
fechaCreacion Timestamp
```

Restricción única sugerida: `(asamblea_id, tipo_bien, bien_id, version_censo)`.

### 10.4 RepresentacionAsamblea

```text
id UUID
asamblea Asamblea
otorgantePersonaId UUID
representantePersonaId UUID
tipo String
estado String
soporteUrl String?
soporteHash String?
fechaRecepcion Timestamp
verificadoPorUid String?
fechaVerificacion Timestamp?
motivo String?
fechaCreacion Timestamp
```

La relación entre representación y derechos debe modelarse mediante una tabla intermedia `RepresentacionDerechoVoto`.

### 10.5 SesionAsamblea

```text
id UUID
asamblea Asamblea
persona Persona
tokenHash String unique
estado String
origen String
expiraEn Timestamp
ultimaActividad Timestamp?
fechaCreacion Timestamp
fechaRevocacion Timestamp?
```

Nunca se debe almacenar el token en texto plano.

### 10.6 RegistroAsistencia

```text
id UUID
asamblea Asamblea
persona Persona
modalidad String
estado String
sesionAsamblea SesionAsamblea?
registradoPorUid String?
fechaRegistro Timestamp
ultimaActividad Timestamp?
versionDeclaracion String?
direccionIp String?
agenteUsuario String?
comprobante String unique
```

La relación entre asistencia y derechos debe modelarse mediante `AsistenciaDerechoVoto`, con restricción única por `(asamblea_id, derecho_voto_id, estado_activo)` implementada mediante índice o validación transaccional.

### 10.7 CorteQuorum

```text
id UUID
asamblea Asamblea
tipoCorte String
referenciaId UUID?
modeloPeso String
denominadorTipo String
totalElegible numeric(20,8)
totalRepresentado numeric(20,8)
porcentaje numeric(12,8)
umbral numeric(12,8)
alcanzado Boolean
detalleHash String
generadoPorUid String?
fechaCreacion Timestamp
```

### 10.8 Votacion

```text
id UUID
asamblea Asamblea
codigo String
ronda Int
titulo String
proposicion String
tipo String
modeloPeso String
denominadorTipo String
reglaMayoria String
umbral numeric(12,8)?
permiteBlanco Boolean
esSecreta Boolean
estado String
orden Int
abreEn Timestamp?
cierraEn Timestamp?
corteApertura CorteQuorum?
corteCierre CorteQuorum?
reemplazaVotacionId UUID?
motivoEstado String?
creadoPorUid String
fechaCreacion Timestamp
fechaActualizacion Timestamp
```

Restricción única sugerida: `(asamblea_id, codigo, ronda)`.

### 10.9 OpcionVotacion

```text
id UUID
votacion Votacion
codigo String
texto String
orden Int
esBlanco Boolean
activo Boolean
```

### 10.10 Voto

Para votaciones no secretas:

```text
id UUID
votacion Votacion
derechoVoto DerechoVotoAsamblea
opcion OpcionVotacion
personaEmisora Persona
sesionAsamblea SesionAsamblea?
pesoAplicado numeric(20,8)
idempotencyKey String
comprobante String
fechaRecepcion Timestamp
integridadHash String
```

Restricciones únicas obligatorias:

- `(votacion_id, derecho_voto_id)`.
- `(votacion_id, idempotency_key)`.
- `comprobante` único.

Para votaciones secretas se debe diseñar una separación técnica que impida consultar directamente identidad y opción en una sola tabla o consulta administrativa.

### 10.11 ResultadoVotacion

```text
id UUID
votacion Votacion unique
totalElegible numeric(20,8)
totalRepresentado numeric(20,8)
totalEmitido numeric(20,8)
totalBlanco numeric(20,8)
aprobada Boolean?
reglaAplicada Any
detalleResultado Any
integridadHash String
fechaConsolidacion Timestamp
```

### 10.12 ConstanciaAsamblea

```text
id UUID
asamblea Asamblea
persona Persona?
votacion Votacion?
texto String
origen String
registradoPorUid String?
fechaCreacion Timestamp
```

---

## 11. Operaciones Data Connect propuestas

Crear un conector o grupo de operaciones `asambleas.gql` dentro de `dataconnect/admin/`.

### Consultas administrativas

- `ListarAsambleasAdmin`.
- `ObtenerAsambleaAdmin`.
- `ListarCensoAsambleaAdmin`.
- `ListarInconsistenciasCensoAdmin`.
- `ListarAsistenciaAdmin`.
- `ObtenerQuorumAdmin`.
- `ListarVotacionesAdmin`.
- `ObtenerResultadoVotacionAdmin`.
- `ListarAuditoriaAsambleaAdmin`.

### Mutaciones administrativas

- `CrearAsambleaAdmin`.
- `ActualizarAsambleaAdmin`.
- `GenerarCensoAsambleaAdmin`.
- `CorregirDerechoVotoAdmin`.
- `PublicarCensoAsambleaAdmin`.
- `CrearRepresentacionAdmin`.
- `VerificarRepresentacionAdmin`.
- `RegistrarAsistenciaAdmin`.
- `CrearCorteQuorumAdmin`.
- `CrearVotacionAdmin`.
- `AbrirVotacionAdmin`.
- `CerrarVotacionAdmin`.
- `SuspenderVotacionAdmin`.
- `AnularVotacionAdmin`.
- `CerrarAsambleaAdmin`.

### Operaciones de servicio para residentes

Siguiendo el patrón de `datos_personales.gql`, deben quedar con `@auth(level: NO_ACCESS)` y ejecutarse solamente desde la API después de validar el token propio:

- `ObtenerAsambleasPersonaAdmin`.
- `ObtenerDerechosRepresentadosAdmin`.
- `RegistrarAsistenciaPersonaAdmin`.
- `ObtenerVotacionAbiertaPersonaAdmin`.
- `RegistrarVotosPersonaAdmin`.
- `ConsultarComprobanteVotoAdmin`.
- `ObtenerResultadosPublicadosPersonaAdmin`.

La creación del voto, la validación del derecho y la restricción única deben ocurrir en una sola transacción.

---

## 12. API REST propuesta

### 12.1 Endpoints para residentes

Base: `/api/v1/datos-personales/asambleas`

| Método | Endpoint | Propósito |
|---|---|---|
| GET | `/disponibles` | Listar asambleas habilitadas para la persona |
| POST | `/:asambleaId/sesion` | Crear o renovar sesión específica de asamblea |
| GET | `/:asambleaId/mi-participacion` | Consultar derechos, representación y asistencia |
| POST | `/:asambleaId/asistencia` | Registrar asistencia explícita |
| POST | `/:asambleaId/actividad` | Actualizar señal de conexión |
| GET | `/:asambleaId/estado` | Obtener estado, quórum público y votación vigente |
| GET | `/:asambleaId/votaciones/abierta` | Obtener pregunta y opciones abiertas |
| POST | `/:asambleaId/votaciones/:votacionId/votos` | Emitir lote de votos |
| GET | `/:asambleaId/comprobantes/:codigo` | Consultar recepción del voto |
| GET | `/:asambleaId/resultados` | Consultar resultados publicados |
| POST | `/:asambleaId/constancias` | Registrar constancia escrita |

### 12.2 Endpoints administrativos

Base: `/api/v1/asambleas`

| Método | Endpoint | Propósito |
|---|---|---|
| GET | `/` | Listar asambleas |
| POST | `/` | Crear asamblea |
| GET | `/:id` | Consultar detalle |
| PATCH | `/:id` | Actualizar configuración permitida |
| POST | `/:id/censo/generar` | Generar censo preliminar |
| GET | `/:id/censo` | Consultar censo e inconsistencias |
| PATCH | `/:id/censo/derechos/:derechoId` | Corregir un derecho antes de publicar |
| POST | `/:id/censo/publicar` | Congelar censo |
| GET | `/:id/representaciones` | Consultar poderes y delegaciones |
| POST | `/:id/representaciones` | Registrar poder o delegación |
| PATCH | `/:id/representaciones/:representacionId` | Aprobar, rechazar o revocar |
| POST | `/:id/asistencia` | Registro asistido |
| GET | `/:id/asistencia` | Tablero de asistencia |
| POST | `/:id/quorum/cortes` | Generar corte de quórum |
| GET | `/:id/quorum` | Consultar quórum actual e histórico |
| POST | `/:id/instalar` | Declarar instalada la asamblea |
| GET | `/:id/votaciones` | Listar votaciones |
| POST | `/:id/votaciones` | Crear votación |
| POST | `/:id/votaciones/:votacionId/abrir` | Abrir |
| POST | `/:id/votaciones/:votacionId/cerrar` | Cerrar y consolidar |
| POST | `/:id/votaciones/:votacionId/suspender` | Suspender |
| POST | `/:id/votaciones/:votacionId/anular` | Anular con motivo |
| GET | `/:id/votaciones/:votacionId/resultados` | Consultar resultado |
| POST | `/:id/cerrar` | Cerrar asamblea |
| GET | `/:id/exportaciones/:tipo` | Descargar anexos |
| GET | `/:id/auditoria` | Consultar eventos |

### 12.3 Convención de respuestas

Mantener el formato general de la API actual:

```json
{
  "success": true,
  "data": {},
  "error": null
}
```

Errores críticos mínimos:

- `ASAMBLEA_NO_DISPONIBLE`.
- `CENSO_NO_PUBLICADO`.
- `SESION_ASAMBLEA_EXPIRADA`.
- `DERECHO_NO_REPRESENTADO`.
- `DERECHO_NO_ELEGIBLE`.
- `VOTACION_NO_ABIERTA`.
- `VOTACION_CERRADA`.
- `OPCION_INVALIDA`.
- `VOTO_YA_REGISTRADO`.
- `IDEMPOTENCY_CONFLICT`.
- `QUORUM_NO_ALCANZADO`.
- `TRANSICION_ESTADO_INVALIDA`.

---

## 13. Frontend propuesto

### 13.1 Portal del participante

Crear:

```text
content/asambleas/_index.md
layouts/asambleas/list.html
```

Ruta pública del módulo: `/asambleas/`, con autenticación integrada al flujo de residentes.

No se recomienda agregar toda la funcionalidad como una nueva pestaña dentro de `layouts/datos-personales/list.html`, porque ese archivo ya concentra múltiples módulos. Una página independiente reduce el impacto de regresiones y permite optimizar la carga durante el evento.

La página debe mantener:

- Bootstrap 5.3.3.
- Montserrat y variables visuales de Bulevar Verde.
- JavaScript vanilla.
- Una IIFE.
- Helpers `esc`, `apiFetch`, `alertMessage`, `loading` o equivalentes consistentes.
- Uso de `textContent` y escape de datos.
- Validaciones nulas de elementos DOM.

Secciones mínimas:

1. Inicio de sesión.
2. Asamblea disponible.
3. Identidad y derechos representados.
4. Confirmación de asistencia.
5. Estado de la reunión y enlace de transmisión.
6. Quórum público.
7. Votación abierta.
8. Confirmación de selección.
9. Comprobante.
10. Resultados publicados.
11. Constancias.

### 13.2 Panel administrativo

Crear una página independiente:

```text
content/administracion-asambleas/_index.md
layouts/administracion-asambleas/list.html
```

Ruta: `/administracion-asambleas/`.

Debe reutilizar Firebase Auth y el patrón `withIdToken` de las páginas administrativas actuales.

Pestañas o vistas mínimas:

- Configuración.
- Censo.
- Poderes y delegados.
- Registro de asistencia.
- Quórum.
- Votaciones.
- Resultados.
- Exportaciones y auditoría.

### 13.3 Actualización en tiempo real

Para el MVP se permite polling controlado:

- Estado de asamblea: cada 5 segundos.
- Votación abierta: cada 3 segundos durante la reunión.
- Actividad de sesión: cada 45 a 60 segundos.
- Resultados administrativos: cada 2 a 5 segundos.

No se debe consultar la lista completa de votos en cada ciclo. La API entrega documentos o respuestas agregadas y utiliza `ETag`, versión o `updatedAt` para evitar respuestas innecesarias.

### 13.4 Accesibilidad y móviles

- Botones de voto con área táctil mínima de 44 px.
- Contraste WCAG AA.
- No depender únicamente del color.
- Confirmación clara antes de emitir.
- Evitar tablas horizontales en móvil.
- Mantener selección local ante un error recuperable, sin marcarla como aceptada hasta recibir comprobante.

---

## 14. Requerimientos no funcionales

### RNF-001. Capacidad

- 1.500 sesiones concurrentes como carga de validación.
- Pico de 1.000 solicitudes de consulta en 10 segundos.
- Pico de 500 derechos votados en 10 segundos.
- Soporte para al menos 50 votaciones por asamblea.

### RNF-002. Rendimiento

- `POST /votos`: p95 menor de 800 ms bajo carga objetivo, excluyendo latencia extrema del cliente.
- Consultas de estado agregadas: p95 menor de 500 ms.
- La apertura o cierre debe reflejarse en clientes en máximo 5 segundos.

### RNF-003. Disponibilidad

- Objetivo operativo durante la ventana de asamblea: 99,9 % o superior.
- Cloud Run con mínimo de dos instancias precalentadas durante el evento.
- Escalamiento y concurrencia probados antes de producción.
- Cloud SQL con alta disponibilidad habilitada y copias de seguridad verificadas.
- No desplegar nuevas versiones desde una hora antes hasta finalizar la asamblea.

### RNF-004. Integridad

- Restricciones únicas en base de datos para impedir doble voto.
- Transacciones para aceptar lotes de derechos.
- Idempotencia obligatoria.
- Hashes SHA-256 para censos, cortes, resultados y exportaciones.
- Hora de servidor, nunca hora suministrada por el navegador.

### RNF-005. Seguridad

- TLS en todas las comunicaciones.
- Firebase ID token para operaciones administrativas.
- Sesión firmada específica para participantes.
- Tokens guardados como hash en servidor.
- Rate limiting por sesión, persona, IP y endpoint.
- Validación de CORS para dominios oficiales.
- No exponer documentos, coeficientes de terceros ni votos individuales.
- No incluir opciones secretas en Cloud Logging.
- Protección contra XSS, CSRF donde aplique, inyección y enumeración de identificadores.

### RNF-006. Privacidad

- Cumplimiento de la política de tratamiento de datos y Ley 1581 de 2012.
- Aviso específico para datos recolectados durante la asamblea.
- Retención configurada para IP, agente de usuario y soportes.
- Exportaciones administrativas protegidas por rol.

### RNF-007. Costos

- Hosting estático desde Firebase Hosting.
- No servir video desde Cloud Run o Firebase Hosting.
- Consultas agregadas y polling limitado.
- Precalentar Cloud Run solo durante la ventana del evento.
- Presupuesto y alertas de consumo antes de cada asamblea.
- Límite máximo de instancias calculado para proteger Cloud SQL sin impedir el pico esperado.

### RNF-008. Observabilidad

Métricas mínimas:

- Sesiones autenticadas.
- Asistencias registradas.
- Conexiones activas.
- Latencia y tasa de error por endpoint.
- Votos aceptados y rechazados por código de negocio.
- Reintentos idempotentes.
- Conexiones y saturación de Cloud SQL.
- Tiempo de actualización del resultado.

Alertas críticas:

- Error rate mayor de 1 % durante 2 minutos.
- p95 de voto mayor de 1,5 segundos.
- Conexiones de base de datos mayores de 80 %.
- Respuestas 429 o 5xx sostenidas.
- Diferencia entre votos aceptados y resultados consolidados.

---

## 15. Resiliencia y contingencia

1. El cliente reintenta únicamente solicitudes idempotentes y conserva el mismo `idempotencyKey`.
2. Después de un timeout, consulta el comprobante antes de permitir un nuevo intento.
3. Si falla la transmisión, administración puede cambiar al enlace de respaldo sin cerrar la votación, dejando auditoría.
4. Si falla el portal, el operador puede registrar asistencia asistida cuando el procedimiento de contingencia lo autorice.
5. Una suspensión de votación bloquea nuevos votos y conserva los ya recibidos hasta que la mesa decida reanudar o anular.
6. Una nueva ronda nunca sobrescribe la anterior.
7. Debe existir una exportación previa del censo publicado para contingencia.
8. Debe realizarse respaldo de base de datos antes de abrir registro y después de cerrar la asamblea.

---

## 16. Criterios de aceptación

### CA-001. Censo congelado

**Dado** un censo publicado,  
**cuando** cambia el coeficiente o propietario en datos maestros,  
**entonces** el derecho de voto de la asamblea conserva los valores publicados.

### CA-002. Derecho único

**Dado** un apartamento representado por un apoderado,  
**cuando** otro usuario intenta activar el mismo derecho,  
**entonces** la API rechaza la operación y no duplica quórum.

### CA-003. Límite de poderes

**Dado** un representante con cinco propietarios representados,  
**cuando** se intenta aprobar un sexto poder no exceptuado,  
**entonces** el sistema lo bloquea y explica el motivo.

### CA-004. Registro de asistencia

**Dado** un participante autenticado y habilitado,  
**cuando** confirma asistencia,  
**entonces** recibe comprobante y sus derechos aparecen una sola vez en el quórum.

### CA-005. Pérdida de conexión

**Dado** un asistente registrado,  
**cuando** deja de enviar actividad,  
**entonces** se muestra desconectado operativamente pero no se borra su registro legal.

### CA-006. Instalación

**Dado** que la regla de quórum no se cumple,  
**cuando** el presidente intenta instalar una asamblea de primera convocatoria,  
**entonces** la API rechaza la transición, salvo procedimiento autorizado y auditado.

### CA-007. Voto aceptado

**Dado** una votación abierta y un derecho habilitado,  
**cuando** el participante confirma una opción,  
**entonces** la API registra el voto con peso congelado y devuelve comprobante.

### CA-008. Prevención de doble voto

**Dado** un derecho que ya votó en la ronda,  
**cuando** se intenta votar nuevamente con otra idempotency key,  
**entonces** la API devuelve `VOTO_YA_REGISTRADO` y conserva el voto original.

### CA-009. Reintento de red

**Dado** un voto aceptado cuya respuesta no llegó al cliente,  
**cuando** se reenvía el mismo request con la misma idempotency key,  
**entonces** se devuelve el comprobante original sin crear otro registro.

### CA-010. Cierre por servidor

**Dado** una votación cerrada por el servidor,  
**cuando** un cliente con pantalla desactualizada envía un voto,  
**entonces** la API lo rechaza y no altera el resultado.

### CA-011. Mayoría parametrizada

**Dado** una decisión configurada con 70 % del total elegible,  
**cuando** se consolida,  
**entonces** la aprobación se calcula sobre el total elegible congelado y no sobre quienes votaron.

### CA-012. Decisión no económica

**Dado** una votación configurada `UN_VOTO_POR_BIEN`,  
**cuando** se consolida,  
**entonces** cada derecho habilitado pesa uno, sin utilizar el coeficiente.

### CA-013. Representante con varios derechos

**Dado** un apoderado con tres derechos,  
**cuando** selecciona opciones distintas,  
**entonces** cada derecho se registra separadamente sin fraccionar ninguno.

### CA-014. Nueva ronda

**Dado** una ronda cerrada,  
**cuando** la mesa autoriza repetirla,  
**entonces** se crea una nueva ronda y la anterior permanece disponible para auditoría.

### CA-015. Votación secreta

**Dado** una votación secreta,  
**cuando** un administrador consulta resultados,  
**entonces** solo recibe agregados y no puede asociar persona con opción.

### CA-016. Exportación

**Dado** una asamblea cerrada,  
**cuando** el secretario genera anexos,  
**entonces** obtiene archivos con fecha de Bogotá, versión del censo y hash verificable.

### CA-017. Auditoría

**Dado** cualquier apertura, cierre, anulación o corrección,  
**cuando** el auditor consulta la línea de tiempo,  
**entonces** encuentra actor, acción, motivo y hora sin registros sobrescritos.

### CA-018. Carga

**Dado** 1.500 sesiones concurrentes y un pico de 500 votos en 10 segundos,  
**cuando** se ejecuta la prueba de carga,  
**entonces** no se registran votos duplicados ni pérdida de votos y se cumplen los objetivos de latencia acordados.

---

## 17. Estrategia de pruebas

### 17.1 Pruebas unitarias

- Cálculo de cada modelo de peso.
- Cálculo de denominadores y mayorías.
- Primera y segunda convocatoria.
- Límite de representaciones.
- Conciliación de delegados.
- Máquina de estados de asamblea y votación.
- Creación y verificación de hashes.

### 17.2 Pruebas de integración

- Autenticación de residente y creación de sesión de asamblea.
- Firebase Auth y permisos administrativos.
- Generación de censo desde datos maestros.
- Transacción de lote de votos.
- Restricciones únicas bajo concurrencia.
- Reintento idempotente.
- Cierre y consolidación.
- Exportaciones.

### 17.3 Pruebas end-to-end

- Propietario de un apartamento.
- Copropiedad con representante único.
- Apoderado de varios propietarios.
- Propietario con apartamento y parqueadero.
- Propietario que asiste directamente y se descuenta de un delegado.
- Usuario moroso según censo.
- Registro presencial asistido.
- Pérdida y recuperación de conexión.
- Votación económica, no económica, calificada y secreta.
- Segunda convocatoria.

### 17.4 Pruebas de carga y caos

- Entrada simultánea de 1.500 sesiones.
- Apertura de votación con todos los clientes consultando estado.
- 500 derechos votando en 10 segundos.
- Reintentos por timeout.
- Reinicio de una instancia Cloud Run.
- Conmutación de alta disponibilidad de Cloud SQL en ambiente controlado.
- Falla del enlace de transmisión sin afectar la API.

### 17.5 Simulacro

Realizar al menos un simulacro completo con usuarios reales, mesa, revisor fiscal y equipo de soporte entre 7 y 15 días antes de la asamblea oficial.

---

## 18. Plan de implementación sugerido

### Fase 1. Fundamentos

- Validación jurídica y definición de fórmulas.
- Modelos Data Connect.
- Índices y restricciones SQL.
- Máquina de estados.
- Auditoría.

### Fase 2. Censo y representaciones

- Generador de censo.
- Pantalla de inconsistencias.
- Poderes, copropiedad y delegados.
- Publicación y hash del censo.

### Fase 3. Asistencia y quórum

- Sesión específica de asamblea.
- Registro virtual y asistido.
- Estado de conexión.
- Cortes de quórum.

### Fase 4. Votación

- Preguntas y opciones.
- Apertura y cierre.
- Voto transaccional e idempotente.
- Resultados y nuevas rondas.

### Fase 5. Exportación y endurecimiento

- Anexos para acta.
- Métricas y alertas.
- Pruebas de carga.
- Revisión de seguridad.
- Simulacro.

---

## 19. Definición de terminado

La funcionalidad se considera lista para producción cuando:

- Las reglas jurídicas y fórmulas estén aprobadas por escrito.
- El censo concilie con los totales oficiales.
- Existan restricciones de base de datos para impedir doble voto.
- Se hayan probado reintentos idempotentes.
- No sea posible modificar o borrar votos cerrados desde la API.
- Se cumplan las pruebas unitarias, integración y end-to-end.
- La prueba de 1.500 sesiones y el pico de votación sean satisfactorios.
- Cloud Run y Cloud SQL estén configurados para la ventana de alta disponibilidad.
- Las alertas y tableros estén activos.
- Existan exportaciones verificables.
- Se haya ejecutado un simulacro completo.
- Administración, presidente, secretario, revisor fiscal y soporte hayan recibido capacitación.
- Exista un procedimiento de contingencia aprobado.

---

## 20. Decisiones pendientes antes de desarrollar

1. Confirmar si los parqueaderos votan siempre como derechos independientes o cuándo se agrupan con apartamentos.
2. Cargar y validar la tabla definitiva de votos sectoriales y generales.
3. Definir con precisión las reglas para propietarios en mora.
4. Definir si una persona puede conservar simultáneamente más de una sesión de visualización y cuál controla el voto.
5. Aprobar el mecanismo técnico de votación secreta.
6. Definir el tiempo oficial de cada votación y quién puede extenderlo.
7. Definir el tratamiento de votos en blanco para cada tipo de decisión.
8. Definir política de retención de IP, agente de usuario, poderes y comprobantes.
9. Definir proveedor de correo y mecanismo de contingencia para usuarios sin correo actualizado.
10. Confirmar roles y personas autorizadas para operar la mesa.
11. Definir formato oficial del anexo PDF para el acta.
12. Confirmar si el MVP incluirá constancias escritas o se dejarán para una segunda entrega.

---

## 21. Referencias

- Reglamento de Propiedad Horizontal de Club Residencial Bulevar Verde, artículos 30, 61, 68 a 75 y 78 a 90.
- Ley 675 de 2001, régimen de propiedad horizontal.
- Sentencia C-522 de 2002 de la Corte Constitucional.
- Arquitectura vigente del proyecto: Hugo, Firebase Hosting, Cloud Run, Firebase Auth, Firebase Data Connect y PostgreSQL/Cloud SQL.

