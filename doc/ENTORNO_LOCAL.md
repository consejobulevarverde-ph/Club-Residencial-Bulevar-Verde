# Entorno local — datos de acceso de prueba

Todo lo de este documento es **ficticio y solo vale en local**. Las cuentas existen únicamente dentro de los
emuladores de Firebase (proyecto `demo-bulevar-verde`); ninguna funciona en producción, y nada de producción
funciona aquí. Las claves son públicas a propósito: no reutilices ninguna en un sistema real.

Última verificación: 2026-10-09, con 28 pruebas automáticas de API y flujos (28/28) más el flujo de residente.
El navegador **no** se ha probado.

## Arrancar y parar

Desde `bulevar-verde-api`:

```
npm run local
```

Levanta los emuladores (Auth, Storage, Data Connect), aplica la semilla, arranca la API y `hugo server`.
El primer arranque tarda varios minutos; los siguientes, menos. `Ctrl+C` lo cierra todo. **Los datos viven en
memoria**: cada arranque parte de cero con la misma semilla. Si algún puerto está ocupado, el script lo dice y
aborta.

Requisitos: Node 22+, Hugo, firebase-tools y **JDK 21 o superior** (el script lo busca solo si el `java` del PATH
es más viejo). Sin Mailpit los flujos que envían correo responden 503 (ver «Correos»).

| Servicio | URL |
|---|---|
| Sitio (Hugo) | http://localhost:1313/ |
| API y documentación | http://localhost:8080/api-docs |
| Interfaz de los emuladores | http://localhost:4710/ |
| Correos (si hay Mailpit) | http://localhost:8025/ |

Puertos de emuladores: Auth 9109, Storage 9209, Data Connect 9419, hub 4810, logging 4910.

## Administración

Pantalla: http://localhost:1313/administracion-datos/

| Rol | Correo | Clave |
|---|---|---|
| Administrador | `admin@example.test` | `local-1234` |
| Superadmin | `superadmin@example.test` | `local-1234` |

Entra con correo y clave (emulador de Auth). Ve todo: unidades, personas, vehículos, parqueaderos, sanciones y
controversias del parqueadero de visitantes, convivencia, reservas y personal.

## Vigilancia

Pantalla: http://localhost:1313/vigilancia-datos/

| Vigilante | Número de documento |
|---|---|
| Vigilante Local 1 | `90000001` |
| Vigilante Local 2 | `90000002` |
| Vigilante Local 3 | `90000003` |

Entra **solo con el número de documento**, sin clave. Puede registrar vehículos y capturar placas del parqueadero
de visitantes, pero no ve las métricas de administración, las controversias ni el personal (403).

## Residente (un apartamento)

Pantalla: http://localhost:1313/datos-personales/

| Dato | Valor |
|---|---|
| Apartamento | `1101` (torre 1, código `T1-101`) |
| Documento | `1000000001` |
| Persona | Luis Ejemplo 1, propietario |
| Correo registrado | `persona-1@example.test` |

El login tiene dos pasos. Primero se escribe apartamento y documento; después aparecen cinco correos
enmascarados y hay que elegir el real. **El correcto es el que empieza por `per`** y termina en
`@example.test` (por ejemplo `per**********@example.test`); los otros cuatro son señuelos con letras al azar y
dominios de correos comunes.

Otras unidades para probar: el apartamento es `<torre><piso><número>`, con torres 1, 2, 3, 4 y 8, pisos 1 a 6 y
números 01 a 03 (`1101`, `1102`, `1103`, `1201`… `8603`). El documento de cada persona es
`1000000001 + n`, donde `n` es su orden; las dos primeras (`1000000001` y `1000000002`) son de la unidad `1101`,
las dos siguientes de `1102`, y así. Una de cada veinte no tiene correo y no puede entrar (responde
`sin_correo_registrado`).

## Qué trae la semilla

| Dato | Cantidad |
|---|---|
| Unidades | 90 |
| Personas | 180 (propietario + residente o arrendatario por unidad; correos `@example.test`) |
| Vehículos | 66, incluida una moto `ABC12` de formato antiguo en la unidad `1101` |
| Parqueaderos | 33 |
| Registros de parqueadero de visitantes | 60 de los últimos 10 días, con foto y miniatura de relleno |
| Controversias | 3 pendientes, 1 aceptada, 1 rechazada |
| Autorizaciones de visitante | 3 (2 vigentes, 1 vencida) |
| Tarifas | Carro 50 000, moto 25 000, 3 días de gracia a visitantes |

Aproximadamente el 20 % de los registros tiene `placaDetectada` distinta de `placa` (error simulado del OCR).
**No incluye** convivencia, reservas, cartera, PQRS ni mantenimiento. Los volúmenes se ajustan con las variables
`SEED_TORRES`, `SEED_PISOS` y `SEED_APTOS_POR_PISO` (lo hace `npm run local:seed`).

## Qué se probó y qué no

Probado contra la API local (28 comprobaciones): servicios y páginas arriba; login de administración;
métricas (90 / 180 / 66 / 33); unidades; 60 registros con miniatura y foto; controversias por estado; 401 sin
token; login de vigilancia (y 404 con un documento inexistente); 403 de vigilancia en rutas de administración;
captura de una placa de residente (atribuye el apartamento); reintento idempotente con el mismo
`clientRequestId`; captura de placa desconocida (sin apartamento); rechazo de placa con formato inválido o que
no corresponde al tipo; y el login completo de residente (elegir correo, perfil, opción incorrecta → 400,
documento ajeno → 404).

**No probado**: nada en el navegador (los formularios de login con el emulador, las pantallas de parqueadero,
el lector de placas); la subida reanudable de evidencias de convivencia; el sustituto local de Cloud Tasks; y
el correo.

## Correos

Sin Mailpit, los flujos que envían correo (por ejemplo decisiones del Consejo o notificaciones de convivencia)
responden 503. Para verlos: descarga el ejecutable de Mailpit, ponlo en el PATH o define `MAILPIT_PATH`, y
vuelve a ejecutar `npm run local`. Los correos aparecerán en http://localhost:8025/.

## Límites y avisos

- Las URLs de los Apps Script (PQRS, sanciones, reservas del portal) están **vacías en local** a propósito,
  para no escribir en hojas reales; esas pantallas no funcionan aquí.
- El entorno rechaza proyectos que no empiecen por `demo-`, y la API no usa credenciales de Google en este
  modo. Ver `.claude/references/todos.md`, punto 1, para las protecciones y las decisiones de diseño.
- Aunque los accesos son falsos, el login de vigilancia solo con documento es el mismo diseño que hay en
  producción (riesgo abierto N7 en `todos.md`).
