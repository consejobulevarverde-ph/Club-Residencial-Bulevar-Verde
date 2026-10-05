# Herramienta web de preparación de evidencias (video e imagen)

Estado: **diseño validado con un spike; no implementado**. Fecha: 2026-10-05.

## 1. Propósito y alcance

Herramienta web **independiente** para convertir, recortar y comprimir archivos multimedia en el navegador del usuario antes de adjuntarlos como evidencia. Casos de uso:

- Videos AVI exportados por el sistema de control de acceso (Hikvision) → MP4 compatible con teléfonos.
- Imágenes BMP de las cámaras → JPEG optimizado.
- Videos MP4/MOV pesados → MP4 720p comprimido.
- Recorte visual del fragmento relevante antes de comprimir.

**No forma parte del flujo de creación de casos de convivencia.** Ese flujo asume que el archivo ya cumple los requisitos de §2 y solo lo valida. La herramienta prepara el archivo; el usuario lo adjunta después por el flujo normal.

Principios:
- Todo el procesamiento ocurre en el dispositivo; no hay conversión en el servidor ni como respaldo.
- El original solo se lee (`File.slice()` o WORKERFS); nunca se modifica, se mueve ni se sube.
- Si el archivo o el navegador no son compatibles, se muestra un error claro.

## 2. Requisitos del archivo final (contrato con la carga de evidencias)

| Tipo | Requisito |
|---|---|
| Video | MP4 con H.264 (High o Main), `yuv420p`, lado corto ≤ 720 px, misma proporción, fps de la fuente (sin subirlos), AAC-LC si hay audio, *fast start* (`moov` antes de `mdat`). **≤ 5 min y ≤ 200 MB** (límite final aprobado). |
| Imagen | JPEG con calidad ~0,85 y lado máximo de 1600 o 2048 px (decisión pendiente). |
| Original | Sin límite aprobado. Valores propuestos para validar en los PC reales: ≤ 4 GB y ≤ 120 min. |

> Transitorio: mientras la carga use el transporte actual (JSON + base64 a Cloud Run), el máximo efectivo por archivo es **23 MB** (`static/js/evidence-types.js`). Los 200 MB requieren la subida directa a Cloud Storage del plan de evidencias.

## 3. Archivos de muestra analizados

Carpeta de origen: `drive-download-20261003T214535Z-1-001` (copia local; no versionada).

### AVI del control de acceso (Hikvision)
`ASCENSORES_T8-P1-2_…_12243696.avi`, 4,16 MB.

| Elemento | Valor |
|---|---|
| Contenedor | RIFF AVI con índice `idx1` (5.062 entradas); sin OpenDML |
| Pista 0 `vids` | **HEVC/H.265 Main**, 1920×1080 (*coded* 1920×1088), `yuvj420p` (rango completo), `strh` rate/scale = **15,014936 fps**, 1.141 chunks `00dc` en *Annex B* (VPS/SPS/PPS en banda) |
| Pista 1 `auds` | **G.711 µ-law** (`wFormatTag` 7), 8 kHz, mono, 1.900 chunks `01wb` de 320 B |
| Pista 2 `pris` | Datos privados `PRIV` (chunks `02hk`); **deben ignorarse** |
| Keyframes | 19 IRAP en 1.140 frames con imagen (uno cada ~4 s) |
| Duración | **76 s reales** (frames ÷ fps de `strh`). La duración que reporta ffprobe para el contenedor (134,6 s) **no es fiable**. |
| Particularidad | Hay chunks de video sin imagen (solo conjuntos de parámetros): deben anteponerse al siguiente frame |

### BMP de cámara
`TODAS_PARQUE INFANTIL_…_11208731.bmp`: 2560×1440, 32 bpp, `BI_RGB` sin compresión, de abajo arriba, 14,7 MB. El navegador lo decodifica con `createImageBitmap`.

### Contexto del incidente CV20261003_63625
`VideoMascota.mp4` (40,4 MB; 53,8 MB en base64) superó el límite HTTP/1 de 32 MiB de Cloud Run. El 413 lo devuelve el frontend de Google y **no queda en los logs**. Convertido a 720p, ocupa 6,3 MB.

## 4. Arquitectura

```
Archivo (File) ──► Detección de capacidades ──► ¿Ruta A posible? ──sí──► Ruta A: WebCodecs + Mediabunny
                                                    │                      (rápida, usa la GPU)
                                                    no (solo PC)
                                                    ▼
                                             Ruta B: ffmpeg.wasm 1 hilo + WORKERFS
                                                    │                      (lenta, universal)
                                                    ▼
                                    MP4/JPEG final (Blob) ──► Descargar / adjuntar
```

- **Un Web Worker por archivo.** El timeout de **10 min de procesamiento local** se aplica con `worker.terminate()` (en B, además, `ffmpeg.terminate()`), que detiene el trabajo de verdad y libera WebCodecs, `VideoFrame` y la memoria wasm. Los reintentos son manuales (máximo 3), sin reintentos automáticos.
- **Ruta A (principal):**
  - **Demuxer AVI propio** (§5).
  - `VideoDecoder` (HEVC/H.264, o MJPEG con `createImageBitmap`) → `OffscreenCanvas` 720p → `VideoSampleSource` de Mediabunny (H.264).
  - Audio µ-law decodificado en JS → `OfflineAudioContext` a 48 kHz → `AudioSampleSource` (AAC).
  - Salida con `Mp4OutputFormat({ fastStart: 'in-memory' })`.
  - Para MP4/MOV/WebM de entrada se usa directamente `Conversion` de Mediabunny.
- **Ruta B (respaldo, solo PC):** `@ffmpeg/ffmpeg` 0.12 + `@ffmpeg/core` de un hilo; el original se monta con `mount('WORKERFS', {files:[file]}, '/in')` (sin copiarlo a memoria). Cubre códecs que WebCodecs no decodifica (Xvid, HEVC sin hardware).
- **Sin COOP/COEP:** el multihilo de ffmpeg.wasm exige aislamiento entre orígenes, lo que rompería los iframes y miniaturas de Drive, los CDN y los scripts de `gstatic`. Las rutas A y B de un hilo **no requieren cabeceras nuevas** y no afectan Firebase Authentication (el sitio usa correo/contraseña y token personalizado, sin popups). Si en el futuro se agrega una CSP, debe incluir `wasm-unsafe-eval`.
- **Distribución:** autoalojado en `static/vendor/` (patrón de `static/vendor/tesseract`, con caché inmutable de `firebase.json`) y cargado solo cuando se necesita.
  - `mediabunny.min.mjs`: 676 KB (MPL-2.0).
  - `ffmpeg-core.wasm`: 32,2 MB (**GPL-2.0-or-later**, incluye x264): publicar LICENSE y enlace a la fuente exacta.
  - `@ffmpeg/ffmpeg`: MIT.

## 5. Demuxer AVI (requisitos verificados con la muestra)

1. Validar `RIFF`/`AVI `. Recorrer `LIST hdrl`: `avih` y cada `LIST strl` (`strh`: tipo, *handler*, scale, rate, length; `strf`: BITMAPINFOHEADER o WAVEFORMATEX).
2. Localizar `LIST movi` y `idx1`. Los offsets de `idx1` pueden ser relativos a `movi` o absolutos: comprobar si el fourcc en `movi + offset` coincide con el de la entrada.
3. Leer por ventanas (8 MB) con `File.slice()`, sin cargar el archivo completo.
4. Video: agrupar los chunks `NNdc`/`NNdb` en *access units*. Un chunk sin NAL VCL (tipo HEVC < 32) se antepone al siguiente. Es keyframe si contiene un NAL IRAP (tipos 16-21); no se confía en los flags de `idx1`.
5. Tiempos: `frame_i × scale/rate` de `strh`. **No redondear** la tasa en el muxer (`frameRate: 15` con 15,015 fps reales generó una marca de tiempo duplicada a los 33,5 s).
6. Audio µ-law (`wFormatTag` 7): tabla G.711 → Float32 → remuestreo a 48 kHz. A-law (6) y PCM (1) son análogos. Otros formatos → ruta B.
7. Ignorar pistas `pris`/`PRIV` y cualquier otra que no sea `vids`/`auds`.
8. Pendiente: OpenDML (`indx`/`AVIX`) para AVI de más de 1 GB, y AVI sin `idx1` (lectura secuencial de `movi`).

Códec HEVC para `VideoDecoder`: `hvc1.1.6.L120.90` (Main, nivel 4), sin `description` (*Annex B*).

## 6. Parámetros de codificación

| Ruta | Video | Audio |
|---|---|---|
| A (WebCodecs) | H.264 `avc1.640020`, **~1 Mbps** a 720p15, keyframe cada 2 s, `latencyMode: 'quality'`. El codificador de hardware necesita unas 2,7 veces el bitrate de x264 para la misma calidad. | AAC-LC 48 kHz, **96 kbps** (Chrome/Edge rechazan 48 y 64 kbps) |
| B (ffmpeg.wasm) | `-map 0:v:0 -map 0:a:0 -vf scale=-2:720,format=yuv420p -c:v libx264 -preset veryfast -crf 23` | `-c:a aac -ar 48000 -ac 1 -b:a 48k` |
| Común | `-movflags +faststart` o `fastStart: 'in-memory'`; conservar fps de la fuente; *copy* sin recodificar si la fuente ya cumple §2 y no hay recorte | Sin audio → MP4 sin pista de audio |

Tamaño esperado: 5 min a 720p15 ≈ 37 MB (A) o ≈ 15 MB (B), muy por debajo de 200 MB. Al recodificar hay pérdida de calidad y el usuario debe saberlo.

## 7. Recorte visual

- **MP4/MOV/WebM:** `<video>` nativo con tiradores de inicio y fin, ±1 frame. El corte final es exacto porque se recodifica.
- **AVI con WebCodecs (opción R1, viable):** visor de frames en canvas con una tira de miniaturas de los keyframes. Al mover el tirador se decodifica desde el keyframe anterior. Latencia medida: **mediana de 168 ms, máximo de 302 ms**.
- **AVI sin WebCodecs (ruta B):** solo una tira de miniaturas generada con ffmpeg.wasm (lenta y poco precisa), o convertir antes el AVI completo y recortar el MP4 (R2). Pendiente de decidir.
- Validaciones: fin > inicio, tramo ≤ 5 min y dentro de la duración real.

## 8. Resultados del spike (PC de prueba)

PC de prueba: Ryzen 5 5600H, 23 GB de RAM, GPU AMD integrada + NVIDIA RTX 3050, Windows 11 Home (no N), Chrome 154 y Edge 154. **Es superior a un PC de portería típico**: los tiempos son optimistas.

| Prueba | Chrome 154 | Edge 154 |
|---|---|---|
| Decodificación HEVC en WebCodecs | **Sí, por hardware**; por software no | **No** (sin "HEVC Video Extensions"; no probado con la extensión) |
| Codificación H.264 en WebCodecs | Sí (hardware y software; modo *quantizer* disponible) | Sí |
| AAC con `AudioEncoder` | Solo ≥96 kbps a 48 kHz (mono o estéreo) | Igual |
| AVI 76 s → MP4 720p (ruta A) | **9,1 s** (115 fps), 9,4 MB, SSIM 0,986 | No disponible |
| Recorte 20-50 s (ruta A) | 4,2 s; 30,07 s y 450 frames exactos | — |
| AVI 76 s → MP4 720p (ruta B) | 129 s (~1,7× el tiempo real), 3,7 MB, SSIM 0,989 | 124 s |
| Corte por timeout de la ruta B (`terminate()` a los 3 s) | Rechazo a 3.007 ms; trabajo detenido | 3.012 ms |
| MP4 40,4 MB → 720p (`Conversion`) | 14,6 s → 6,3 MB | 13,4 s |
| BMP 2560×1440 → JPEG 0,85 | 51 ms; 434 KB (1600 px) / 950 KB (2560 px) | Igual |
| Memoria del navegador (base → pico) | 488 → 790 MB (ruta A); 508 → 1.094 MB (todo) | 499 → 1.056 MB |

Todas las salidas pasan ffprobe y se decodifican sin errores, con `moov` antes de `mdat`. El SHA-256 del AVI original es idéntico antes y después.

Conclusiones:
1. La ruta A es rápida y ligera en Chrome: 5 min de tramo ≈ 40 s.
2. Edge sin la extensión HEVC solo puede usar B: 5 min ≈ 8 min en este PC, **cerca del timeout de 10 min**. En un PC más lento lo superaría.
3. El recorte visual del AVI es viable en Chrome con el visor de frames.

## 9. Riesgos y decisiones pendientes

1. **Navegador estándar** para quien prepara evidencias: Chrome (recomendado) o Edge con la extensión HEVC (sin verificar; puede tener costo).
2. **Ruta B con tramos largos:** aceptar timeouts en PC lentos o limitar el tramo (p. ej. 2 min) cuando no hay HEVC por hardware.
3. **Spike en los PC reales de portería y administración:** necesario antes de fijar los límites del original y de memoria.
4. **Ubicación de la herramienta** en el portal (página propia con acceso de personal) y si el resultado se descarga o se pasa directamente al formulario de evidencias.
5. Lado máximo del JPEG (1600 o 2048 px) y si se permite 1080p cuando haga falta detalle (sigue dentro de 200 MB).
6. Otros AVI de Hikvision u otros fabricantes pueden traer H.264, MJPEG o códecs propietarios: hacen falta más muestras.
7. Licencia GPL de `ffmpeg-core` al distribuirlo desde el sitio.

## 10. Reproducir el spike

Requisitos: Node 22+, Chrome o Edge instalados y ffmpeg/ffprobe nativos (solo para validar las salidas).

```bash
mkdir spike && cd spike && npm init -y
npm i mediabunny @ffmpeg/ffmpeg@0.12 @ffmpeg/util@0.12 @ffmpeg/core@0.12 playwright-core
# Copiar server.mjs, index.html, spike.mjs y run.mjs del anexo; ajustar DIR/FILES en run.mjs
node run.mjs chrome,msedge                      # todas las pruebas
node run.mjs chrome aviCompleto,aviRecorte20a50  # subconjunto
```

Los resultados se guardan en `results/` (MP4/JPEG generados y `resultados-*.json`). `run.mjs` abre el navegador instalado con Playwright (canales `chrome`/`msedge`, visible) y suma el *working set* del árbol de procesos del navegador cada 2 s.

Validación de las salidas:

```bash
ffprobe -v error -show_entries format=duration,size:stream=codec_name,profile,width,height,avg_frame_rate -of compact=p=0 salida.mp4
ffmpeg -v error -i salida.mp4 -f null -   # sin salida = sin errores de decodificación
```

## Anexo: código del spike

Código de prueba, no de producción: corre en el hilo principal (la herramienta usará un Worker por archivo), solo implementa HEVC en la ruta A y no implementa OpenDML.

<details>
<summary><code>spike.mjs</code></summary>

```js
// Spike: viabilidad del procesamiento local de evidencias (AVI HEVC Hikvision, BMP, MP4).
import {
  Output, Mp4OutputFormat, BufferTarget, VideoSampleSource, AudioSampleSource, VideoSample, AudioSample,
  Quality, Input, BlobSource, ALL_FORMATS, Conversion,
} from './node_modules/mediabunny/dist/bundles/mediabunny.min.mjs';

const logEl = document.getElementById('log');
const log = (...a) => { logEl.textContent += a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') + '\n'; };
const now = () => performance.now();
const secs = (t0) => Math.round((now() - t0) / 10) / 100;

async function save(name, data) {
  await fetch('/save?name=' + encodeURIComponent(name), { method: 'POST', body: data });
}

function withTimeout(promise, ms, onTimeout) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => { try { onTimeout && onTimeout(); } catch {} reject(new Error('timeout ' + ms + ' ms')); }, ms); }),
  ]);
}

// ---------- Capacidades ----------
async function capacidades() {
  const r = { userAgent: navigator.userAgent, webcodecs: typeof VideoDecoder !== 'undefined' };
  const hevcCodecs = ['hvc1.1.6.L120.90', 'hev1.1.6.L120.90', 'hvc1.1.6.L120.B0', 'hvc1.1.6.L93.B0'];
  r.hevcDecode = {};
  for (const hw of ['no-preference', 'prefer-hardware', 'prefer-software']) {
    for (const codec of hevcCodecs) {
      try {
        const s = await VideoDecoder.isConfigSupported({ codec, codedWidth: 1920, codedHeight: 1080, hardwareAcceleration: hw });
        if (s.supported) { r.hevcDecode[hw] = codec; break; }
      } catch (e) { r.hevcDecode[hw + '_error'] = String(e); }
    }
    if (!r.hevcDecode[hw]) r.hevcDecode[hw] = false;
  }
  r.avcEncode = {};
  for (const hw of ['no-preference', 'prefer-hardware', 'prefer-software']) {
    for (const codec of ['avc1.640020', 'avc1.4d0020', 'avc1.42e020']) {
      const s = await VideoEncoder.isConfigSupported({ codec, width: 1280, height: 720, bitrate: 900_000, framerate: 15, hardwareAcceleration: hw });
      if (s.supported) { r.avcEncode[hw] = codec; break; }
    }
    if (!r.avcEncode[hw]) r.avcEncode[hw] = false;
  }
  try {
    r.avcQuantizer = (await VideoEncoder.isConfigSupported({ codec: 'avc1.640020', width: 1280, height: 720, bitrateMode: 'quantizer', framerate: 15 })).supported;
  } catch { r.avcQuantizer = false; }
  r.aacEncode = typeof AudioEncoder !== 'undefined'
    ? (await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 1, bitrate: 48000 })).supported
    : false;
  r.aacConfigs = await configsAac();
  r.opfs = !!(navigator.storage && navigator.storage.getDirectory);
  r.deviceMemoryGB = navigator.deviceMemory || null;
  r.hardwareConcurrency = navigator.hardwareConcurrency;
  r.crossOriginIsolated = self.crossOriginIsolated;
  return r;
}

const CANDIDATOS_AAC = [
  { numberOfChannels: 1, sampleRate: 48000, bitrate: 48000 },
  { numberOfChannels: 1, sampleRate: 48000, bitrate: 64000 },
  { numberOfChannels: 1, sampleRate: 48000, bitrate: 96000 },
  { numberOfChannels: 1, sampleRate: 44100, bitrate: 64000 },
  { numberOfChannels: 2, sampleRate: 48000, bitrate: 96000 },
  { numberOfChannels: 2, sampleRate: 48000, bitrate: 128000 },
];
async function configsAac() {
  if (typeof AudioEncoder === 'undefined') return [];
  const ok = [];
  for (const c of CANDIDATOS_AAC) {
    if ((await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', ...c })).supported) ok.push(c.numberOfChannels + 'ch/' + c.sampleRate + '/' + c.bitrate);
  }
  return ok;
}
async function elegirAac() {
  for (const c of CANDIDATOS_AAC) {
    if ((await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', ...c })).supported) return c;
  }
  return null;
}

// ---------- Lectura por ventanas (no copia el archivo completo) ----------
class LectorArchivo {
  constructor(file, ventana = 8 << 20) { this.file = file; this.ventana = ventana; this.base = -1; this.buf = null; }
  async read(off, len) {
    if (len > this.ventana) return new Uint8Array(await this.file.slice(off, off + len).arrayBuffer());
    if (!(this.buf && off >= this.base && off + len <= this.base + this.buf.length)) {
      this.base = off;
      this.buf = new Uint8Array(await this.file.slice(off, Math.min(this.file.size, off + this.ventana)).arrayBuffer());
    }
    return this.buf.subarray(off - this.base, off - this.base + len);
  }
}

const fourcc = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const u16 = (b, o) => b[o] | (b[o + 1] << 8);

// ---------- Demuxer AVI (RIFF + idx1) ----------
async function parseAvi(file) {
  const rd = new LectorArchivo(file);
  const head = await rd.read(0, 12);
  if (fourcc(head, 0) !== 'RIFF' || fourcc(head, 8) !== 'AVI ') throw new Error('No es un AVI RIFF');
  const streams = [];
  let avih = null, moviOff = -1, moviEnd = -1, idx = null;
  let off = 12;
  const riffEnd = Math.min(file.size, 8 + u32(head, 4));
  while (off + 8 <= riffEnd) {
    const h = await rd.read(off, 12);
    const id = fourcc(h, 0), size = u32(h, 4);
    if (id === 'LIST' && fourcc(h, 8) === 'hdrl') {
      const hdrl = await rd.read(off + 12, size - 4);
      let p = 0;
      while (p + 8 <= hdrl.length) {
        const cid = fourcc(hdrl, p), cs = u32(hdrl, p + 4);
        if (cid === 'avih') avih = { usPerFrame: u32(hdrl, p + 8), totalFrames: u32(hdrl, p + 24), width: u32(hdrl, p + 40), height: u32(hdrl, p + 44) };
        if (cid === 'LIST' && fourcc(hdrl, p + 8) === 'strl') {
          const s = {};
          let q = p + 12;
          while (q + 8 <= p + 8 + cs) {
            const sid = fourcc(hdrl, q), ss = u32(hdrl, q + 4);
            if (sid === 'strh') Object.assign(s, { type: fourcc(hdrl, q + 8), handler: fourcc(hdrl, q + 12), scale: u32(hdrl, q + 28), rate: u32(hdrl, q + 32), length: u32(hdrl, q + 40) });
            if (sid === 'strf') {
              if (s.type === 'vids') Object.assign(s, { width: u32(hdrl, q + 12), height: u32(hdrl, q + 16), compression: fourcc(hdrl, q + 24) });
              if (s.type === 'auds') Object.assign(s, { formatTag: u16(hdrl, q + 8), channels: u16(hdrl, q + 10), sampleRate: u32(hdrl, q + 12), bits: u16(hdrl, q + 22) });
            }
            q += 8 + ss + (ss & 1);
          }
          streams.push(s);
        }
        p += 8 + cs + (cs & 1);
      }
    } else if (id === 'LIST' && fourcc(h, 8) === 'movi') {
      moviOff = off + 8; moviEnd = off + 8 + size;
    } else if (id === 'idx1') {
      idx = await rd.read(off + 8, size);
      idx = idx.slice();
    }
    off += 8 + size + (size & 1);
  }
  if (!idx) throw new Error('AVI sin índice idx1 (no soportado en el spike)');
  // Base de offsets: relativa a 'movi' o absoluta
  const firstOff = u32(idx, 8);
  const probe = await rd.read(moviOff + firstOff, 4);
  const base = fourcc(probe, 0) === fourcc(idx, 0) ? moviOff : 0;
  const entries = [];
  for (let i = 0; i + 16 <= idx.length; i += 16) {
    entries.push({ id: fourcc(idx, i), flags: u32(idx, i + 4), off: base + u32(idx, i + 8) + 8, size: u32(idx, i + 12) });
  }
  return { rd, avih, streams, entries, moviOff, moviEnd };
}

function codecDeVideo(s) {
  const h = (s.handler + s.compression).toUpperCase();
  if (/HEVC|H265|HVC1|HEV1/.test(h)) return 'hevc';
  if (/H264|AVC1|X264/.test(h)) return 'avc';
  if (/MJPG/.test(h)) return 'mjpeg';
  return 'desconocido:' + s.handler + '/' + s.compression;
}

// Tipos de NAL HEVC en un access unit Annex B
function nalTypesHevc(b) {
  const tipos = [];
  for (let i = 0; i + 3 < b.length; i++) {
    if (b[i] === 0 && b[i + 1] === 0 && (b[i + 2] === 1 || (b[i + 2] === 0 && b[i + 3] === 1))) {
      const start = b[i + 2] === 1 ? i + 3 : i + 4;
      tipos.push((b[start] >> 1) & 0x3f);
      i = start;
    }
  }
  return tipos;
}

// Agrupa los chunks de video en access units con imagen (VCL); los chunks sin imagen se anteponen al siguiente.
async function framesDeVideo(avi, vIdx) {
  const tag = String(vIdx).padStart(2, '0');
  const ves = avi.entries.filter((e) => e.id.startsWith(tag) && (e.id.endsWith('dc') || e.id.endsWith('db')) && e.size > 0);
  const frames = [];
  let pendientes = [];
  for (const e of ves) {
    const data = (await avi.rd.read(e.off, e.size)).slice();
    const tipos = nalTypesHevc(data);
    const vcl = tipos.some((t) => t < 32);
    if (!vcl) { pendientes.push(data); continue; }
    const partes = pendientes.concat([data]);
    pendientes = [];
    const total = partes.reduce((a, p) => a + p.length, 0);
    const au = new Uint8Array(total);
    let o = 0;
    for (const p of partes) { au.set(p, o); o += p.length; }
    frames.push({ data: au, key: tipos.some((t) => t >= 16 && t <= 21) });
  }
  return frames;
}

function muLawDecode(b) {
  const out = new Float32Array(b.length);
  for (let i = 0; i < b.length; i++) {
    let u = ~b[i] & 0xff;
    const sign = u & 0x80, exponent = (u >> 4) & 0x07, mantissa = u & 0x0f;
    let sample = ((mantissa << 3) + 0x84) << exponent;
    sample -= 0x84;
    out[i] = (sign ? -sample : sample) / 32768;
  }
  return out;
}

async function audioDeAvi(avi, aIdx, s, desde, hasta) {
  const tag = String(aIdx).padStart(2, '0');
  const aes = avi.entries.filter((e) => e.id.startsWith(tag) && e.id.endsWith('wb'));
  const partes = [];
  for (const e of aes) partes.push((await avi.rd.read(e.off, e.size)).slice());
  const total = partes.reduce((a, p) => a + p.length, 0);
  const raw = new Uint8Array(total);
  let o = 0;
  for (const p of partes) { raw.set(p, o); o += p.length; }
  if (s.formatTag !== 7) throw new Error('Audio AVI no soportado en el spike: formatTag ' + s.formatTag);
  const pcm = muLawDecode(raw);
  const ini = Math.floor(desde * s.sampleRate), fin = Math.min(pcm.length, Math.ceil(hasta * s.sampleRate));
  const tramo = pcm.subarray(ini, fin);
  const destino = 48000;
  const ctx = new OfflineAudioContext(1, Math.ceil(tramo.length * destino / s.sampleRate), destino);
  const buffer = ctx.createBuffer(1, tramo.length, s.sampleRate);
  buffer.copyToChannel(tramo, 0);
  const src = ctx.createBufferSource();
  src.buffer = buffer; src.connect(ctx.destination); src.start();
  const rendered = await ctx.startRendering();
  return { pcm48: rendered.getChannelData(0), sampleRate: destino };
}

// ---------- Conversión WebCodecs + Mediabunny ----------
async function convertirAviWebCodecs(file, { desde = 0, hasta = Infinity, bitrate = 900_000, hevcCodec, nombre }) {
  const t0 = now();
  const avi = await parseAvi(file);
  const tParse = secs(t0);
  const vIdx = avi.streams.findIndex((s) => s.type === 'vids');
  const aIdx = avi.streams.findIndex((s) => s.type === 'auds');
  const vs = avi.streams[vIdx];
  const codec = codecDeVideo(vs);
  if (codec !== 'hevc') throw new Error('El spike solo implementa HEVC por WebCodecs; códec: ' + codec);
  const fps = vs.rate / vs.scale;
  const frames = await framesDeVideo(avi, vIdx);
  const duracion = frames.length / fps;
  hasta = Math.min(hasta, duracion);
  const iniFrame = Math.floor(desde * fps), finFrame = Math.min(frames.length, Math.ceil(hasta * fps));
  let k = iniFrame;
  while (k > 0 && !frames[k].key) k--;

  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const vsrc = new VideoSampleSource({ codec: 'avc', quality: new Quality({ bitrate }), keyFrameInterval: 2, latencyMode: 'quality' });
  output.addVideoTrack(vsrc, { frameRate: Math.round(fps) });
  let audio = null, asrc = null, audioPos = 0;
  if (aIdx >= 0) {
    audio = await audioDeAvi(avi, aIdx, avi.streams[aIdx], desde, hasta);
    audio.cfg = await elegirAac();
    if (!audio.cfg) throw new Error('Este navegador no tiene codificador AAC');
    asrc = new AudioSampleSource({ codec: 'aac', quality: new Quality({ bitrate: audio.cfg.bitrate }) });
    output.addAudioTrack(asrc);
  }
  await output.start();

  const dt = 1 / fps;
  let tw = 0, th = 0, canvas = null, ctx2d = null, decodificados = 0, codificados = 0, errorDec = null;
  const cola = [];
  const decoder = new VideoDecoder({ output: (f) => cola.push(f), error: (e) => { errorDec = e; } });
  decoder.configure({ codec: hevcCodec, hardwareAcceleration: 'no-preference' });

  async function empujarAudioHasta(t) {
    if (!asrc) return;
    const sr = audio.sampleRate;
    while (audioPos < audio.pcm48.length && audioPos / sr <= t + 1) {
      const n = Math.min(sr, audio.pcm48.length - audioPos);
      const ch = audio.cfg.numberOfChannels;
      const mono = audio.pcm48.subarray(audioPos, audioPos + n);
      let data = mono.slice();
      if (ch === 2) { data = new Float32Array(n * 2); for (let i = 0; i < n; i++) { data[2 * i] = mono[i]; data[2 * i + 1] = mono[i]; } }
      const s = new AudioSample({ data, format: 'f32', numberOfChannels: ch, sampleRate: sr, timestamp: audioPos / sr });
      await asrc.add(s); s.close();
      audioPos += n;
    }
  }

  async function procesarCola() {
    while (cola.length) {
      const f = cola.shift();
      decodificados++;
      const ts = f.timestamp / 1e6;
      if (ts + 1e-6 < desde || ts > hasta) { f.close(); continue; }
      if (!canvas) {
        const dw = f.displayWidth, dh = f.displayHeight;
        th = Math.min(720, dh); tw = Math.round((dw * th) / dh / 2) * 2;
        canvas = new OffscreenCanvas(tw, th); ctx2d = canvas.getContext('2d');
      }
      ctx2d.drawImage(f, 0, 0, tw, th);
      f.close();
      const t = ts - desde;
      const nf = new VideoFrame(canvas, { timestamp: Math.round(t * 1e6), duration: Math.round(dt * 1e6) });
      await empujarAudioHasta(t);
      const sample = new VideoSample(nf);
      await vsrc.add(sample);
      sample.close(); nf.close();
      codificados++;
    }
  }

  const tDec0 = now();
  for (let i = k; i < finFrame; i++) {
    if (errorDec) throw errorDec;
    decoder.decode(new EncodedVideoChunk({ type: i === k ? 'key' : (frames[i].key ? 'key' : 'delta'), timestamp: Math.round(i * dt * 1e6), duration: Math.round(dt * 1e6), data: frames[i].data }));
    if (decoder.decodeQueueSize > 6) await new Promise((r) => decoder.addEventListener('dequeue', r, { once: true }));
    await procesarCola();
  }
  await decoder.flush();
  await procesarCola();
  decoder.close();
  if (errorDec) throw errorDec;
  await empujarAudioHasta(Infinity);
  vsrc.close(); if (asrc) asrc.close();
  await output.finalize();
  const buf = output.target.buffer;
  const tTotal = secs(t0);
  await save(nombre, buf);
  return {
    avi: { avih: avi.avih, streams: avi.streams, framesConImagen: frames.length, keyframes: frames.filter((f) => f.key).length, fps: Math.round(fps * 1000) / 1000, duracionCalculada: Math.round(duracion * 10) / 10 },
    tramo: [desde, hasta], salida: { ancho: tw, alto: th, bytes: buf.byteLength, audio: audio && audio.cfg },
    tiempos: { parseS: tParse, totalS: tTotal, decodificacionYCodificacionS: secs(tDec0) },
    framesDecodificados: decodificados, framesCodificados: codificados,
    fpsProcesamiento: Math.round((decodificados / ((now() - tDec0) / 1000)) * 10) / 10,
  };
}

// Latencia de "frame en el instante t" para el recorte visual (decodificar desde el keyframe previo).
async function latenciaBusqueda(file, hevcCodec, muestras = 8) {
  const avi = await parseAvi(file);
  const vIdx = avi.streams.findIndex((s) => s.type === 'vids');
  const vs = avi.streams[vIdx];
  const fps = vs.rate / vs.scale;
  const frames = await framesDeVideo(avi, vIdx);
  const res = [];
  for (let m = 0; m < muestras; m++) {
    const objetivo = Math.floor(((m + 0.5) / muestras) * frames.length);
    let k = objetivo; while (k > 0 && !frames[k].key) k--;
    const t0 = now();
    const bmp = await new Promise((resolve, reject) => {
      let n = 0;
      const dec = new VideoDecoder({
        output: async (f) => {
          if (n++ === objetivo - k) { const b = await createImageBitmap(f, { resizeWidth: 320, resizeHeight: 180 }); f.close(); dec.close(); resolve(b); } else f.close();
        },
        error: reject,
      });
      dec.configure({ codec: hevcCodec });
      for (let i = k; i <= objetivo; i++) dec.decode(new EncodedVideoChunk({ type: i === k ? 'key' : 'delta', timestamp: Math.round((i / fps) * 1e6), data: frames[i].data }));
      dec.flush().catch(() => {});
    });
    bmp.close();
    res.push({ frame: objetivo, decodificados: objetivo - k + 1, ms: Math.round(now() - t0) });
  }
  const ms = res.map((r) => r.ms).sort((a, b) => a - b);
  return { muestras: res, medianaMs: ms[Math.floor(ms.length / 2)], maxMs: ms[ms.length - 1] };
}

// ---------- ffmpeg.wasm (1 hilo, WORKERFS) ----------
async function ffmpegWasm(file, { args, salida, nombre, timeoutMs = 600_000 }) {
  const { FFmpeg } = await import('./node_modules/@ffmpeg/ffmpeg/dist/esm/index.js');
  const ff = new FFmpeg();
  let ultimaLinea = '';
  ff.on('log', ({ message }) => { ultimaLinea = message; });
  const t0 = now();
  await ff.load({ coreURL: new URL('./node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js', location.href).href, wasmURL: new URL('./node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm', location.href).href });
  const tCarga = secs(t0);
  await ff.createDir('/in');
  await ff.mount('WORKERFS', { files: [file] }, '/in');
  const t1 = now();
  const code = await withTimeout(ff.exec(['-hide_banner', '-i', '/in/' + file.name, ...args, salida]), timeoutMs, () => ff.terminate());
  const tExec = secs(t1);
  const data = await ff.readFile(salida);
  await save(nombre, data);
  ff.terminate();
  return { exitCode: code, cargaS: tCarga, conversionS: tExec, bytes: data.byteLength, ultimaLinea };
}

// Corta un trabajo de ffmpeg.wasm a los 3 s: comprueba que terminate() detiene el Worker.
async function ffmpegTerminar(file) {
  const { FFmpeg } = await import('./node_modules/@ffmpeg/ffmpeg/dist/esm/index.js');
  const ff = new FFmpeg();
  await ff.load({ coreURL: new URL('./node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js', location.href).href, wasmURL: new URL('./node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm', location.href).href });
  await ff.createDir('/in');
  await ff.mount('WORKERFS', { files: [file] }, '/in');
  const t0 = now();
  const trabajo = ff.exec(['-i', '/in/' + file.name, '-c:v', 'libx264', '-preset', 'veryslow', '/o.mp4']);
  try {
    await withTimeout(trabajo, 3000, () => ff.terminate());
    return { terminado: false, nota: 'terminó antes de 3 s' };
  } catch (e) {
    return { terminado: true, errorRecibido: String(e.message || e), msHastaRechazo: Math.round(now() - t0) };
  }
}

// ---------- BMP ----------
async function bmpAJpeg(file) {
  const t0 = now();
  const bmp = await createImageBitmap(file);
  const tDecode = Math.round(now() - t0);
  const res = { origen: { ancho: bmp.width, alto: bmp.height, bytes: file.size }, decodificarMs: tDecode, salidas: {} };
  for (const lado of [2560, 1600]) {
    const esc = Math.min(1, lado / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * esc), h = Math.round(bmp.height * esc);
    const c = new OffscreenCanvas(w, h);
    c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    const t1 = now();
    const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
    res.salidas[lado] = { ancho: w, alto: h, bytes: blob.size, ms: Math.round(now() - t1) };
    await save('bmp_' + lado + '.jpg', blob);
  }
  bmp.close();
  return res;
}

// ---------- MP4 → MP4 720p (Conversion) ----------
async function convertirMp4(file, nombre) {
  const t0 = now();
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const conv = await Conversion.init({
    input, output,
    video: { height: 720, codec: 'avc', quality: new Quality({ bitrate: 1_200_000 }), frameRate: 30 },
    audio: { codec: 'aac', quality: new Quality({ bitrate: 96_000 }) },
  });
  if (!conv.isValid) throw new Error('Conversión inválida: ' + JSON.stringify(conv.discardedTracks.map((d) => d.reason)));
  await conv.execute();
  const buf = output.target.buffer;
  await save(nombre, buf);
  return { origenBytes: file.size, salidaBytes: buf.byteLength, segundos: secs(t0) };
}

window.runAll = async function (etiqueta, solo) {
  const out = { etiqueta };
  const avi = document.getElementById('avi').files[0];
  const bmp = document.getElementById('bmp').files[0];
  const mp4 = document.getElementById('mp4').files[0];
  const paso = async (nombre, fn) => {
    if (solo && !solo.includes(nombre) && nombre !== 'capacidades') return;
    log('> ' + nombre);
    try { out[nombre] = await fn(); log('  ok', out[nombre]); } catch (e) { out[nombre] = { error: String(e && (e.message || e)) }; log('  ERROR', out[nombre]); }
  };
  await paso('capacidades', capacidades);
  const hevc = out.capacidades.hevcDecode && out.capacidades.hevcDecode['no-preference'];
  await paso('bmp', () => bmpAJpeg(bmp));
  if (hevc) {
    await paso('aviCompleto', () => withTimeout(convertirAviWebCodecs(avi, { hevcCodec: hevc, nombre: etiqueta + '_avi_webcodecs.mp4' }), 600_000));
    await paso('aviRecorte20a50', () => withTimeout(convertirAviWebCodecs(avi, { desde: 20, hasta: 50, hevcCodec: hevc, nombre: etiqueta + '_avi_webcodecs_20-50.mp4' }), 600_000));
    await paso('busquedaFrames', () => latenciaBusqueda(avi, hevc));
  } else {
    out.aviCompleto = { error: 'Sin decodificador HEVC en WebCodecs' };
  }
  await paso('mp4Conversion', () => withTimeout(convertirMp4(mp4, etiqueta + '_mp4_720.mp4'), 600_000));
  await paso('ffmpegWasm', () => ffmpegWasm(avi, {
    args: ['-map', '0:v:0', '-map', '0:a:0', '-vf', 'scale=-2:720,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-ar', '48000', '-ac', '1', '-b:a', '48k', '-movflags', '+faststart'],
    salida: '/out.mp4', nombre: etiqueta + '_avi_ffmpegwasm.mp4',
  }));
  await paso('ffmpegTerminar', () => ffmpegTerminar(avi));
  return out;
};
log('listo');
```

</details>

<details>
<summary><code>index.html</code></summary>

```html
<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Spike evidencias</title></head>
<body>
<h1>Spike procesamiento local de evidencias</h1>
<p>AVI <input type="file" id="avi"> BMP <input type="file" id="bmp"> MP4 <input type="file" id="mp4"></p>
<pre id="log"></pre>
<script type="module" src="./spike.mjs"></script>
</body></html>
```

</details>

<details>
<summary><code>server.mjs</code></summary>

```js
// Servidor estático mínimo para el spike (solo 127.0.0.1). POST /save?name=x guarda el cuerpo en results/.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const RESULTS = path.join(ROOT, 'results');
fs.mkdirSync(RESULTS, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json' };

export function startServer(port = 8765) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'POST' && url.pathname === '/save') {
      const name = path.basename(url.searchParams.get('name') || 'out.bin');
      const out = fs.createWriteStream(path.join(RESULTS, name));
      req.pipe(out).on('finish', () => { res.writeHead(204); res.end(); });
      return;
    }
    const file = path.join(ROOT, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}
```

</details>

<details>
<summary><code>run.mjs</code></summary>

```js
// Ejecuta el spike en el Chrome/Edge instalados y mide la memoria (working set) de su árbol de procesos.
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from './server.mjs';

const DIR = '<carpeta-de-muestras>';
const FILES = {
  avi: path.join(DIR, 'muestra-hikvision.avi'),
  bmp: path.join(DIR, 'muestra-camara.bmp'),
  mp4: path.join(DIR, 'muestra.mp4'),
};
const channels = (process.argv[2] || 'chrome,msedge').split(',');
const solo = process.argv[3] ? process.argv[3].split(',') : null;

function memoriaArbolMB(pid) {
  const ps = `$all = Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize; $ids = @(${pid}); do { $n = $ids.Count; $ids = @($ids + ($all | Where-Object { $ids -contains $_.ParentProcessId } | ForEach-Object ProcessId)) | Select-Object -Unique } while ($ids.Count -ne $n); [math]::Round((($all | Where-Object { $ids -contains $_.ProcessId } | Measure-Object WorkingSetSize -Sum).Sum)/1MB)`;
  try { return Number(execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim()); } catch { return null; }
}

const server = await startServer(8765);
const resultados = {};
for (const channel of channels) {
  const bs = await chromium.launchServer({ channel, headless: false });
  const pid = bs.process().pid;
  const browser = await chromium.connect(bs.wsEndpoint());
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log(`[${channel}] consola:`, m.text().slice(0, 300)); });
  await page.goto('http://127.0.0.1:8765/');
  await page.waitForFunction(() => typeof window.runAll === 'function');
  await page.setInputFiles('#avi', FILES.avi);
  await page.setInputFiles('#bmp', FILES.bmp);
  await page.setInputFiles('#mp4', FILES.mp4);
  const base = memoriaArbolMB(pid);
  let pico = base;
  const timer = setInterval(() => { const m = memoriaArbolMB(pid); if (m && m > pico) pico = m; }, 2000);
  const t0 = Date.now();
  const r = await page.evaluate((et) => window.runAll(et[0], et[1]), [channel, solo]).catch((e) => ({ error: String(e) }));
  clearInterval(timer);
  r.memoriaNavegadorMB = { base, pico };
  r.duracionTotalS = Math.round((Date.now() - t0) / 1000);
  resultados[channel] = r;
  console.log(`== ${channel}`, JSON.stringify(r, null, 1).slice(0, 6000));
  await browser.close();
  await bs.close();
}
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname.slice(1)), 'results', 'resultados-' + channels.join('-') + (solo ? '-parcial' : '') + '.json'), JSON.stringify(resultados, null, 2));
server.close();
```

</details>
