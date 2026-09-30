/**
 * window.BVEvidenceTypes — Módulo compartido para validación y metadatos de tipos de evidencia
 * Uso en múltiples páginas: datos-personales, convivencia (casos, corrección), admin, comité.
 *
 * Singletons:
 * - window.BVEvidenceTypes.ACCEPT — string para <input accept>
 * - window.BVEvidenceTypes.clasificar(file) → { categoria, ext, mime } | null
 * - window.BVEvidenceTypes.icono(categoria) → string (nombre clase bi-icon)
 * - window.BVEvidenceTypes.maxBytes(categoria) → number
 * - window.BVEvidenceTypes.limiteLegible(categoria) → string ("20MB", "50MB", "25MB")
 * - window.BVEvidenceTypes.validar(file) → { ok: true } | { ok: false, error: string }
 */
(function () {
  "use strict";

  // Tabla centralizada: MIME → { ext, categoria }
  var TIPOS = {
    // Imagen
    "image/jpeg": { ext: "jpg", categoria: "image" },
    "image/jpg": { ext: "jpg", categoria: "image" },
    "image/png": { ext: "png", categoria: "image" },
    "image/webp": { ext: "webp", categoria: "image" },
    // Video
    "video/mp4": { ext: "mp4", categoria: "video" },
    "video/quicktime": { ext: "mov", categoria: "video" },
    "video/webm": { ext: "webm", categoria: "video" },
    // PDF
    "application/pdf": { ext: "pdf", categoria: "pdf" },
    // Audio
    "audio/mpeg": { ext: "mp3", categoria: "audio" },
    "audio/mp4": { ext: "m4a", categoria: "audio" },
    "audio/x-m4a": { ext: "m4a", categoria: "audio" },
    "audio/aac": { ext: "aac", categoria: "audio" },
    "audio/wav": { ext: "wav", categoria: "audio" },
    "audio/x-wav": { ext: "wav", categoria: "audio" },
    "audio/ogg": { ext: "ogg", categoria: "audio" },
    "audio/webm": { ext: "webm", categoria: "audio" },
    "audio/opus": { ext: "opus", categoria: "audio" },
    // Documentos
    "application/msword": { ext: "doc", categoria: "documento" },
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
      ext: "docx",
      categoria: "documento",
    },
    "application/vnd.ms-excel": { ext: "xls", categoria: "documento" },
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
      ext: "xlsx",
      categoria: "documento",
    },
    "application/vnd.ms-powerpoint": { ext: "ppt", categoria: "documento" },
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
      ext: "pptx",
      categoria: "documento",
    },
    "text/plain": { ext: "txt", categoria: "documento" },
    "text/csv": { ext: "csv", categoria: "documento" },
    "application/rtf": { ext: "rtf", categoria: "documento" },
    "application/vnd.oasis.opendocument.text": { ext: "odt", categoria: "documento" },
    "application/vnd.oasis.opendocument.spreadsheet": { ext: "ods", categoria: "documento" },
  };

  // Fallback de MIME por extensión (cuando file.type viene vacío, ej. en Windows/Android con .docx/.m4a)
  var MIME_BY_EXTENSION = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    pdf: "application/pdf",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    wav: "audio/wav",
    ogg: "audio/ogg",
    opus: "audio/opus",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain",
    csv: "text/csv",
    rtf: "application/rtf",
    odt: "application/vnd.oasis.opendocument.text",
    ods: "application/vnd.oasis.opendocument.spreadsheet",
  };

  var MAX_BYTES = {
    image: 20 * 1024 * 1024,
    video: 50 * 1024 * 1024,
    pdf: 50 * 1024 * 1024,
    audio: 50 * 1024 * 1024,
    documento: 25 * 1024 * 1024,
  };

  var LIMITE_LEGIBLE = {
    image: "20MB",
    video: "50MB",
    pdf: "50MB",
    audio: "50MB",
    documento: "25MB",
  };

  var ICONO = {
    image: "bi-image",
    video: "bi-camera-video",
    pdf: "bi-file-earmark-pdf",
    audio: "bi-file-earmark-music",
    documento: "bi-file-earmark-text",
  };

  // Extraer extensión de un nombre de archivo
  function extensionDe(nombre) {
    var match = nombre.match(/\.([a-z0-9]+)$/i);
    return match ? match[1].toLowerCase() : "";
  }

  // Inferir MIME por extensión si file.type viene vacío
  function inferirMimePorExtension(nombre) {
    var ext = extensionDe(nombre);
    return MIME_BY_EXTENSION[ext];
  }

  // Clasificar un File: devuelve { categoria, ext, mime } o null si no es permitido
  // Si file.type está vacío, intenta por extensión. Si aún no hay match, rechaza.
  function clasificar(file) {
    var mime = file.type || inferirMimePorExtension(file.name) || "";
    var info = TIPOS[mime];
    if (!info) return null;
    return {
      categoria: info.categoria,
      ext: info.ext,
      mime: mime,
      mimeInferida: !file.type && mime !== "", // flag si se infirió por extensión
    };
  }

  // Validar un File contra límites
  function validar(file) {
    var clasificacion = clasificar(file);
    if (!clasificacion) {
      return {
        ok: false,
        error:
          "Tipo de archivo no permitido. Se aceptan: imágenes (JPEG, PNG, WebP), video (MP4, MOV, WebM), PDF, audio (MP3, M4A, AAC, WAV, OGG) y documentos (DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, CSV, RTF, ODT, ODS).",
      };
    }
    var maxBytes = MAX_BYTES[clasificacion.categoria];
    if (file.size > maxBytes) {
      return {
        ok: false,
        error: "El archivo supera el tamaño máximo permitido (" + LIMITE_LEGIBLE[clasificacion.categoria] + ").",
      };
    }
    return { ok: true };
  }

  // Público
  window.BVEvidenceTypes = {
    // String de accept para <input accept>
    ACCEPT:
      "image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,application/pdf," +
      "audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,audio/x-wav,audio/ogg,audio/webm,audio/opus," +
      "application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
      "application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet," +
      "application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation," +
      "text/plain,text/csv,application/rtf,application/vnd.oasis.opendocument.text," +
      "application/vnd.oasis.opendocument.spreadsheet",

    clasificar: clasificar,
    validar: validar,
    icono: function (categoria) {
      return ICONO[categoria] || ICONO.documento;
    },
    maxBytes: function (categoria) {
      return MAX_BYTES[categoria] || MAX_BYTES.image;
    },
    limiteLegible: function (categoria) {
      return LIMITE_LEGIBLE[categoria] || LIMITE_LEGIBLE.image;
    },

    // Inferir mime por extensión (usado cuando file.type está vacío)
    inferirMimePorExtension: inferirMimePorExtension,

    // Extraer extensión de un nombre
    extensionDe: extensionDe,

    // Tabla de tipos (solo lectura, para debug/testing)
    TIPOS: TIPOS,
  };
})();
