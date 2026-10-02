# Lector de placas — Claude Code Guide

## Propósito

Pestaña "Lector de placas" de `/vigilancia-datos/`: registro de vehículos en el **parqueadero de
visitantes**. El vigilante hace una ronda (100+ vehículos por noche): foto → lectura de la placa en el
dispositivo → confirma placa y tipo → el registro queda en una cola local y se envía a la API cuando
hay conexión → la cámara queda lista para el siguiente vehículo.

La sanción a la unidad (moto/carro, valor variable por mes) **no** se calcula aquí: es una etapa
posterior que leerá estos registros y marcará `fechaPosprocesamiento`.

## Archivos

| Archivo | Rol |
|---------|-----|
| `index.html` | Panel (botón "Iniciar ronda", lista de registros), overlay de cámara (`#lpOverlay`, se mueve a `<body>` al iniciar), estilos y `window.LECTOR_PLACAS_CONFIG = { apiBase, vendorBase }` |
| `static/js/lector-placas-ocr.js` | `window.BVPlacasOcr`: motor sin UI (localizar, enderezar, OCR, normalizar) |
| `static/js/lector-placas-cola.js` | `window.BVLectorPlacasCola`: cola en IndexedDB (`bv-lector-placas`) y envío a la API |
| `static/js/lector-placas.js` | UI: cámara en vivo, revisión, marca de fecha/hora, lista. Expone `window.BVLectorPlacas.mostrar()` (lo llama `mode('lectorPlacas')`) |
| `static/vendor/tesseract/` | Tesseract.js 5.1.1 autoalojado (ver `VERSION.txt`) |

## Captura

- Cámara en vivo con `getUserMedia` (1920×1080 ideal, cámara trasera) para poder dibujar guías:
  línea de horizonte (verde cuando el teléfono está nivelado, vía `devicemotion`; iOS pide permiso en
  el toque de "Iniciar ronda") y marco de placa. Aviso "Gira el teléfono" en vertical; en Android se
  intenta pantalla completa + bloqueo en horizontal.
- **Flash**: la cámara en vivo de una página no expone el flash de foto, solo la linterna (luz
  continua, constraint `torch`). Se enciende por defecto; el botón ⚡ de la barra la apaga/enciende y
  la preferencia queda en `localStorage.bvLectorPlacasLinterna`. Se apaga mientras se revisa la foto y
  vuelve al regresar a la cámara. Solo aparece donde `track.getCapabilities().torch` existe (Chrome en
  Android; Safari en iOS no lo permite).
- Si la cámara en vivo no está disponible, aparece el respaldo `<input capture="environment">` (ahí el
  flash lo maneja la app de cámara del teléfono).
- Al registrar, la foto (≤1600 px, JPEG 0,82) lleva una marca discreta con fecha y hora (Bogotá) en la
  esquina inferior derecha. El OCR siempre corre sobre la foto **sin** marca.

## Pipeline OCR (`lector-placas-ocr.js`)

1. **Localización** por color amarillo (HSV) sobre copia de 640 px → cierre morfológico → componentes
   con momentos de segundo orden: centro, largo/ancho reales y **ángulo** de la placa (hasta 25°).
2. **Recorte enderezado**: se dibuja la foto girada `-ángulo` alrededor del centro de la placa; gris,
   Otsu y `filtrarCaracteres` (solo manchas con forma/altura de carácter dentro de la placa). Con los
   centros de los caracteres se mide la inclinación residual (mínimos cuadrados) y, si pasa de 1,5°,
   se vuelve a recortar corregido.
3. **OCR**: PSM 7 (carro) / PSM 6 (moto), whitelist `A-Z0-9`. Respaldo PSM 11 sobre toda la foto para
   placas blancas/plateadas. Si nada funciona, el vigilante escribe la placa o usa "Marcar placa".
4. **Normalización**: ventanas de 6 caracteres, corrección de confusiones por posición, puntaje con la
   confianza por carácter (Tesseract da 0 en palabra/línea con whitelist).

Probado en Chrome de escritorio con fotos reales de Wikimedia Commons, también giradas ±10°.

## Cola y envío (`lector-placas-cola.js`)

- `POST /api/v1/vigilancia/parqueadero-visitantes/registros` con `{ clientRequestId, placa,
  placaDetectada, tipoVehiculo, fechaCaptura, foto (dataUrl JPEG) }`. Idempotente por
  `clientRequestId`: reintentar nunca duplica.
- Cada registro guarda el `uid` del vigilante y solo se envía con esa sesión (la API toma el nombre
  del vigilante del token, nunca del cliente).
- Envío en orden; se detiene al primer error de red y reintenta cada 30 s y al volver la conexión.
  Errores de validación (4xx) quedan como "Rechazado" con Reintentar/Descartar.
- Tras enviar se borra la foto del teléfono; los enviados se muestran 24 h.
- Limitación: la página debe haberse abierto con conexión (no hay service worker). La cola y el
  motor OCR sí funcionan sin conexión una vez cargados.

## Reglas

- Los regex de `FORMATOS` deben coincidir con `placaValida` en `static/js/vehiculos.js` y con
  `src/modules/vigilancia/placas.ts` en la API.
- `/vendor/**` se sirve con `Cache-Control` inmutable de 1 año: para actualizar Tesseract, usar una
  ruta nueva versionada.
- El texto del OCR se trata como no confiable: todo lo que va a `innerHTML` pasa por `esc()`.
