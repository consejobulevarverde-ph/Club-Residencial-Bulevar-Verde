# Lector de placas — Claude Code Guide

## Propósito

Pestaña "Lector de placas" de `/vigilancia-datos/`. El vigilante toma una foto del vehículo y el módulo
reconoce la placa. **Etapa 1: solo reconocimiento, 100 % en el dispositivo** — no llama a la API, no
usa Firebase, no guarda ni envía la foto. Buscar la placa en la API o registrar ingresos es etapa 2.

## Archivos

| Archivo | Rol |
|---------|-----|
| `index.html` | UI (`.lector-placas-panel`, ids con prefijo `lp`), estilos propios y `window.LECTOR_PLACAS_CONFIG = { vendorBase }` |
| `static/js/lector-placas.js` | IIFE autocontenido; expone `window.BVLectorPlacas.mostrar()` (lo llama `mode('lectorPlacas')`) |
| `static/vendor/tesseract/` | Tesseract.js 5.1.1 autoalojado (ver `VERSION.txt`); se carga perezosamente al abrir la pestaña |

Se incluye como `<section id="lectorPlacasView" class="hidden">{{ partial "lector-placas/index.html" . }}</section>`.

## Pipeline

1. **Captura**: `<input type="file" capture="environment">` (cámara nativa) o "Elegir imagen" (galería).
   No usa `evidence-camera.js`: su marca de agua y GPS estorban al OCR.
2. **Foto**: `createImageBitmap(..., { imageOrientation: 'from-image' })`, lado mayor ≤ 1600 px.
3. **Localización** (`localizarPlacas`): máscara de amarillo en HSV sobre copia de 640 px → cierre
   morfológico → componentes conexos → filtro por tamaño, relación (carro ~2:1, moto ~1.35:1) y relleno.
   Hasta 3 regiones.
4. **Recorte** (`prepararRecorte` + `filtrarCaracteres`): escala, gris, Otsu y deja solo manchas con
   forma y altura de carácter dentro de la placa (quita marco, emblema entre grupos, tornillos y
   ciudad). Carro omite la franja de la ciudad; moto lee las dos líneas.
5. **OCR**: PSM 7 (carro) / PSM 6 (moto), whitelist `A-Z0-9`; si no hay lectura de confianza alta
   prueba el otro tipo y la siguiente región.
6. **Respaldo** (`leerFotoCompleta`): si por color no hubo lectura de confianza media, PSM 11 (texto
   disperso) sobre toda la foto, una línea por fragmento. Cubre placas blancas (servicio público) y
   plateadas antiguas. Si tampoco hay lectura, se pide "Marcar placa" (arrastre sobre la foto).
7. **Normalización** (`fragmentosOcr` + `lecturasDesdeFragmento`): ventanas de 6 caracteres, corrige
   confusiones por posición (`0↔O`, `1↔I`, `8↔B`…) y valida con los regex de carro/moto. El puntaje
   usa la **confianza por carácter** (con whitelist, Tesseract devuelve 0 en palabra/línea), resta
   por corrección y por caracteres sobrantes, y suma si varias pasadas coinciden. Bajo
   `PUNTAJE_MINIMO` se descarta.

Probado en Chrome de escritorio con fotos reales de Wikimedia Commons (placas amarillas, blancas y
plateadas, de cerca y a distancia): ~0,3–0,9 s por foto con el motor ya cargado. Falta validar en
teléfonos reales (tiempos y cámara nativa).

## Reglas

- Los regex de `FORMATOS` deben coincidir con `placaValida` en `static/js/vehiculos.js` (y con
  `placaCoincideConTipo` en la API).
- `/vendor/**` se sirve con `Cache-Control` inmutable de 1 año (`firebase.json`): para actualizar
  Tesseract, usar una ruta nueva versionada en vez de sobrescribir los archivos.
- El texto del OCR se trata como no confiable: todo lo que va a `innerHTML` pasa por `esc()`.
