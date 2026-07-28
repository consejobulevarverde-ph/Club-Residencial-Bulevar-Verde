/***************************************
 * PQRS Y MANTENIMIENTO
 * CLUB RESIDENCIAL BULEVAR VERDE
 ***************************************/

const PQRS_VERSION = '2.1.3-evidencia-cierre';
const PQRS_TIMEZONE = 'America/Bogota';

const PQRS_ADMIN_EMAIL = 'bulevarverdeadmon@gmail.com';
const PQRS_CC_EMAIL = 'consejo.bulevarverde@gmail.com';
const PQRS_FORM_SHEET_NAME = 'Respuestas de formulario 1';

const MANTENIMIENTO_SHEET_NAME = 'Reportes Mantenimiento';
const MANTENIMIENTO_FOLDER_NAME = 'Reportes Mantenimiento - Evidencias';
const MANTENIMIENTO_MAX_PHOTOS = 3;
const MANTENIMIENTO_MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const MANTENIMIENTO_GESTION_SESSION_SECONDS = 6 * 60 * 60;
const MANTENIMIENTO_GESTION_KEY_HASH_PROPERTY = 'MANTENIMIENTO_GESTION_CLAVE_HASH';
const MANTENIMIENTO_GESTION_SECRET_PROPERTY = 'MANTENIMIENTO_GESTION_SECRET';
const MANTENIMIENTO_GESTION_SESSION_PREFIX = 'pqrs_mantenimiento_session_';
const MANTENIMIENTO_GESTION_ATTEMPT_PREFIX = 'pqrs_mantenimiento_login_';

const MANTENIMIENTO_HEADERS = Object.freeze([
  'ID Reporte',
  'ID Solicitud Cliente',
  'Fecha y hora del reporte',
  'Fecha y hora de recepción',
  'Reportado por',
  'Ubicación de la zona afectada',
  'Descripción',
  'Estado',
  'Responsable',
  'Prioridad',
  'Foto 1',
  'Foto 2',
  'Foto 3',
  'Enlace Foto 1',
  'Enlace Foto 2',
  'Enlace Foto 3',
  'Fecha de atención',
  'Fecha de cierre',
  'Observaciones de gestión',
  'Versión'
]);

/***************************************
 * GOOGLE FORM PQRS EXISTENTE
 ***************************************/
function onFormSubmit(e) {
  try {
    if (!e || !e.range) {
      throw new Error(
        'Este script debe ejecutarse desde el trigger de envío de formulario.'
      );
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet =
      ss.getSheetByName(PQRS_FORM_SHEET_NAME) ||
      e.range.getSheet() ||
      ss.getActiveSheet();

    const row = e.range.getRow();
    const lastColumn = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    const values = sheet.getRange(row, 1, 1, lastColumn).getValues()[0];
    const data = {};

    headers.forEach(function (header, index) {
      data[safeTrimPQRS_(header)] = values[index];
    });

    const fecha = new Date();
    const fechaStr = Utilities.formatDate(
      fecha,
      Session.getScriptTimeZone() || PQRS_TIMEZONE,
      'yyyy-MM-dd HH:mm'
    );
    const consecutivo = Utilities.formatDate(
      fecha,
      Session.getScriptTimeZone() || PQRS_TIMEZONE,
      'yyyyMMdd-HHmmss'
    );
    const idCaso = 'PQRS-' + consecutivo;

    const nombre = getPQRSValue_(data, ['Nombre completo', 'Nombre']);
    const torre = getPQRSValue_(data, ['Torre']);
    const apto = getPQRSValue_(data, [
      'Numero de Apartamento',
      'Número de Apartamento',
      'Apartamento',
      'Apto'
    ]);
    const email = getPQRSValue_(data, [
      'Correo electrónico',
      'Dirección de correo electrónico',
      'Email'
    ]);
    const tipoSolicitud = getPQRSValue_(data, [
      'Tipo de solicitud',
      'Tipo'
    ]);
    const categoria = getPQRSValue_(data, ['Categoría', 'Categoria']);
    const descripcion = getPQRSValue_(data, [
      'Descripción detallada de la solicitud',
      'Descripcion detallada de la solicitud',
      'Escribe tu PQRS',
      'PQRS'
    ]);

    const cuerpo =
      'Se ha recibido una nueva PQRS.\n\n' +
      'ID del caso: ' + idCaso + '\n\n' +
      'Datos del solicitante:\n' +
      'Nombre completo: ' + nombre + '\n' +
      'Torre: ' + torre + '\n' +
      'Número de Apartamento: ' + apto + '\n' +
      'Correo electrónico: ' + email + '\n\n' +
      'Detalle de la solicitud:\n' +
      'Tipo de solicitud: ' + tipoSolicitud + '\n' +
      'Categoría: ' + categoria + '\n' +
      'Descripción detallada de la solicitud:\n' +
      descripcion + '\n\n' +
      'Estado inicial: Pendiente\n\n' +
      'Fecha de recepción: ' + fechaStr + '\n\n' +
      'Este correo fue generado automáticamente desde el formulario de PQRS de Bulevar Verde.';

    MailApp.sendEmail({
      to: PQRS_ADMIN_EMAIL,
      subject: '[Bulevar Verde] Nueva PQRS recibida - ' + idCaso,
      body: cuerpo
    });

    setPQRSColumnIfExists_(sheet, headers, row, 'ID Caso', idCaso);
    setPQRSColumnIfExists_(sheet, headers, row, 'Estado', 'Pendiente');
    setPQRSColumnIfExists_(sheet, headers, row, 'Fecha Gestión', fechaStr);

    Logger.log('PQRS enviada correctamente: ' + idCaso);
  } catch (error) {
    Logger.log('Error en onFormSubmit PQRS: ' + (error.message || String(error)));
    throw error;
  }
}

/***************************************
 * WEB APP / PUENTE PARA EL FORMULARIO
 * DE MANTENIMIENTO EN HUGO
 ***************************************/
function doGet() {
  const html = pqrsBuildBridgeHtml_(pqrsGetAllowedOrigins_());

  return HtmlService.createHtmlOutput(html)
    .setTitle('Mantenimiento - Bulevar Verde')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  const parameters = e && e.parameter ? e.parameter : {};
  const action = safeTrimPQRS_(parameters.action);
  const requestId = pqrsSafeId_(parameters.requestId);
  const origin = safeTrimPQRS_(parameters.origin);

  try {
    pqrsAssertOrigin_(origin);

    if (!requestId) {
      throw new Error('La solicitud no contiene un identificador válido.');
    }

    let payload = {};
    const rawPayload = safeTrimPQRS_(parameters.payload);
    if (rawPayload) {
      try {
        payload = JSON.parse(rawPayload);
      } catch (error) {
        throw new Error('El contenido del reporte no es JSON válido.');
      }
    }

    console.log(JSON.stringify({
      event: 'PQRS_MAINTENANCE_POST_RECEIVED',
      requestId: requestId,
      action: action,
      origin: origin,
      payloadChars: rawPayload.length,
      clientRequestId: payload && payload.clientRequestId
        ? pqrsSafeId_(payload.clientRequestId)
        : ''
    }));

    let result;
    if (action === 'crearReporteMantenimiento') {
      result = crearReporteMantenimiento(payload, origin);
    } else if (action === 'verificarReporteMantenimiento') {
      result = verificarReporteMantenimiento(payload, origin);
    } else if (action === 'iniciarSesionGestionMantenimiento') {
      result = iniciarSesionGestionMantenimiento(payload, origin);
    } else if (action === 'listarReportesMantenimiento') {
      result = listarReportesMantenimiento(payload, origin);
    } else if (action === 'obtenerReporteMantenimiento') {
      result = obtenerReporteMantenimiento(payload, origin);
    } else if (action === 'obtenerEvidenciaMantenimiento') {
      result = obtenerEvidenciaMantenimiento(payload, origin);
    } else if (action === 'subirEvidenciaGestionMantenimiento') {
      result = subirEvidenciaGestionMantenimiento(payload, origin);
    } else if (action === 'finalizarReporteMantenimiento') {
      result = finalizarReporteMantenimiento(payload, origin);
    } else if (action === 'cerrarSesionGestionMantenimiento') {
      result = cerrarSesionGestionMantenimiento(payload, origin);
    } else {
      throw new Error('Acción no permitida.');
    }

    console.log(JSON.stringify({
      event: 'PQRS_MAINTENANCE_POST_COMPLETED',
      requestId: requestId,
      action: action,
      ok: true,
      reportId: result && result.reportId ? result.reportId : ''
    }));

    return pqrsBuildPostResponseHtml_(origin, requestId, true, result, '');
  } catch (error) {
    const message = error && error.message
      ? error.message
      : String(error || 'Error inesperado');

    console.error(JSON.stringify({
      event: 'PQRS_MAINTENANCE_POST_FAILED',
      requestId: requestId,
      action: action,
      origin: origin,
      ok: false,
      error: message
    }));

    return pqrsBuildPostResponseHtml_(origin, requestId, false, null, message);
  }
}

function pqrsBuildPostResponseHtml_(origin, requestId, ok, data, error) {
  const targetOrigin = pqrsJsonForInlineScript_(origin || '*');
  const message = pqrsJsonForInlineScript_({
    type: 'PORTAL_BV_RESPONSE',
    requestId: requestId,
    ok: !!ok,
    data: data || null,
    error: error || ''
  });

  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Resultado del reporte</title>
</head>
<body>
  <p>${ok ? 'Reporte procesado.' : 'No fue posible procesar el reporte.'}</p>
  <script>
    (function () {
      'use strict';
      var targetOrigin = ${targetOrigin};
      var message = ${message};
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(message, targetOrigin || '*');
        }
      } catch (parentError) {}
      try {
        if (window.top && window.top !== window && window.top !== window.parent) {
          window.top.postMessage(message, targetOrigin || '*');
        }
      } catch (topError) {}
    }());
  </script>
</body>
</html>`;

  return HtmlService.createHtmlOutput(html)
    .setTitle('Resultado de mantenimiento - Bulevar Verde')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function pqrsJsonForInlineScript_(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function pqrsBuildBridgeHtml_(allowedOrigins) {
  const originsJson = JSON.stringify(allowedOrigins);

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Puente de mantenimiento</title>
</head>
<body>
  <p id="status">Conectando…</p>
  <script>
    (function () {
      'use strict';
      const allowedOrigins = ${originsJson};
      const status = document.getElementById('status');
      const actionMap = {
        crearReporteMantenimiento: 'crearReporteMantenimiento',
        verificarReporteMantenimiento: 'verificarReporteMantenimiento',
        iniciarSesionGestionMantenimiento: 'iniciarSesionGestionMantenimiento',
        listarReportesMantenimiento: 'listarReportesMantenimiento',
        obtenerReporteMantenimiento: 'obtenerReporteMantenimiento',
        obtenerEvidenciaMantenimiento: 'obtenerEvidenciaMantenimiento',
        subirEvidenciaGestionMantenimiento: 'subirEvidenciaGestionMantenimiento',
        finalizarReporteMantenimiento: 'finalizarReporteMantenimiento',
        cerrarSesionGestionMantenimiento: 'cerrarSesionGestionMantenimiento'
      };

      function originAllowed(origin) {
        return allowedOrigins.indexOf('*') !== -1 ||
          allowedOrigins.indexOf(origin) !== -1;
      }

      function reply(origin, requestId, ok, data, error) {
        window.top.postMessage({
          type: 'PORTAL_BV_RESPONSE',
          requestId: requestId,
          ok: ok,
          data: data || null,
          error: error || ''
        }, origin || '*');
      }

      window.addEventListener('message', function (event) {
        const message = event.data || {};

        if (event.source !== window.top) return;
        if (!originAllowed(event.origin)) return;
        if (message.type !== 'PORTAL_BV_REQUEST') return;

        const serverFunction = actionMap[message.action];
        if (!serverFunction) {
          reply(event.origin, message.requestId, false, null, 'Acción no permitida.');
          return;
        }

        const payload = message.payload || {};
        const runner = google.script.run
          .withSuccessHandler(function (result) {
            if (result === null || typeof result === 'undefined') {
              reply(
                event.origin,
                message.requestId,
                false,
                null,
                'El servicio no devolvió datos.'
              );
              return;
            }
            reply(event.origin, message.requestId, true, result, '');
          })
          .withFailureHandler(function (failure) {
            const text = failure && failure.message
              ? failure.message
              : String(failure || 'Error inesperado');
            reply(event.origin, message.requestId, false, null, text);
          });

        if (serverFunction === 'crearReporteMantenimiento') {
          runner.crearReporteMantenimiento(payload, event.origin);
        } else if (serverFunction === 'verificarReporteMantenimiento') {
          runner.verificarReporteMantenimiento(payload, event.origin);
        } else if (serverFunction === 'iniciarSesionGestionMantenimiento') {
          runner.iniciarSesionGestionMantenimiento(payload, event.origin);
        } else if (serverFunction === 'listarReportesMantenimiento') {
          runner.listarReportesMantenimiento(payload, event.origin);
        } else if (serverFunction === 'obtenerReporteMantenimiento') {
          runner.obtenerReporteMantenimiento(payload, event.origin);
        } else if (serverFunction === 'obtenerEvidenciaMantenimiento') {
          runner.obtenerEvidenciaMantenimiento(payload, event.origin);
        } else if (serverFunction === 'subirEvidenciaGestionMantenimiento') {
          runner.subirEvidenciaGestionMantenimiento(payload, event.origin);
        } else if (serverFunction === 'finalizarReporteMantenimiento') {
          runner.finalizarReporteMantenimiento(payload, event.origin);
        } else {
          runner.cerrarSesionGestionMantenimiento(payload, event.origin);
        }
      });

      if (allowedOrigins.indexOf('*') !== -1) {
        window.top.postMessage({ type: 'PORTAL_BV_READY' }, '*');
      } else {
        allowedOrigins.forEach(function (origin) {
          window.top.postMessage({ type: 'PORTAL_BV_READY' }, origin);
        });
      }

      status.textContent = 'Puente disponible.';
    }());
  </script>
</body>
</html>`;
}

/***************************************
 * CREAR REPORTE DE MANTENIMIENTO
 ***************************************/
function crearReporteMantenimiento(payload, origin) {
  pqrsAssertOrigin_(origin);
  payload = payload || {};

  const clientRequestId = pqrsSafeId_(payload.clientRequestId);
  const reportadoPor = safeTrimPQRS_(payload.reportadoPor);
  const ubicacion = safeTrimPQRS_(payload.ubicacion);
  const descripcion = safeTrimPQRS_(payload.descripcion);
  const fotos = Array.isArray(payload.fotos) ? payload.fotos : [];

  if (!clientRequestId) {
    throw new Error('No fue posible identificar la solicitud.');
  }
  if (reportadoPor.length < 3 || reportadoPor.length > 120) {
    throw new Error('Ingresa el nombre de quien realiza el reporte.');
  }
  if (ubicacion.length < 3 || ubicacion.length > 250) {
    throw new Error('Ingresa una ubicación válida de la zona afectada.');
  }
  if (descripcion.length < 10 || descripcion.length > 3000) {
    throw new Error('La descripción debe tener entre 10 y 3000 caracteres.');
  }
  if (fotos.length > MANTENIMIENTO_MAX_PHOTOS) {
    throw new Error('Solo se permiten hasta tres fotografías.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const ss = pqrsGetSpreadsheet_();
    const sheet = pqrsEnsureMaintenanceSheet_(ss);
    const existing = pqrsFindMaintenanceReport_(sheet, clientRequestId);

    if (existing) {
      return {
        ok: true,
        duplicate: true,
        reportId: existing.reportId,
        message: 'El reporte ya había sido registrado.'
      };
    }

    const now = new Date();
    const reportedAt = pqrsParseDate_(payload.reportedAt) || now;
    const reportId = pqrsGenerateMaintenanceId_(now);
    const folder = pqrsGetMaintenanceFolder_();
    const photoRecords = [];

    fotos.forEach(function (photo, index) {
      photoRecords.push(
        pqrsSaveMaintenancePhoto_(folder, reportId, photo, index + 1)
      );
    });

    const rowValues = [
      reportId,
      clientRequestId,
      reportedAt,
      now,
      reportadoPor,
      ubicacion,
      descripcion,
      'Abierto',
      '',
      'Media',
      photoRecords[0] ? 'Foto 1' : '',
      photoRecords[1] ? 'Foto 2' : '',
      photoRecords[2] ? 'Foto 3' : '',
      photoRecords[0] ? photoRecords[0].url : '',
      photoRecords[1] ? photoRecords[1].url : '',
      photoRecords[2] ? photoRecords[2].url : '',
      '',
      '',
      '',
      PQRS_VERSION
    ];

    sheet.appendRow(rowValues);
    const row = sheet.getLastRow();

    pqrsFormatMaintenanceRow_(sheet, row, photoRecords);
    SpreadsheetApp.flush();

    pqrsSendMaintenanceNotification_({
      reportId: reportId,
      reportadoPor: reportadoPor,
      ubicacion: ubicacion,
      descripcion: descripcion,
      reportedAt: reportedAt,
      receivedAt: now,
      photoRecords: photoRecords,
      spreadsheetUrl: ss.getUrl()
    });

    return {
      ok: true,
      duplicate: false,
      reportId: reportId,
      receivedAt: now.toISOString(),
      message: 'Reporte de mantenimiento registrado correctamente.'
    };
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function verificarReporteMantenimiento(payload, origin) {
  pqrsAssertOrigin_(origin);
  payload = payload || {};

  const clientRequestId = pqrsSafeId_(payload.clientRequestId);
  if (!clientRequestId) {
    throw new Error('ID de solicitud inválido.');
  }

  const sheet = pqrsGetMaintenanceSheet_();
  const existing = pqrsFindMaintenanceReport_(sheet, clientRequestId);

  return {
    ok: true,
    exists: !!existing,
    reportId: existing ? existing.reportId : ''
  };
}


/***************************************
 * GESTIÓN DE REPORTES DE MANTENIMIENTO
 ***************************************/
function configurarClaveGestionMantenimiento(clave) {
  clave = safeTrimPQRS_(clave);

  if (clave.length < 6 || clave.length > 100) {
    throw new Error('La clave de gestión debe tener entre 6 y 100 caracteres.');
  }

  const properties = PropertiesService.getScriptProperties();
  let secret = safeTrimPQRS_(
    properties.getProperty(MANTENIMIENTO_GESTION_SECRET_PROPERTY)
  );

  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    properties.setProperty(MANTENIMIENTO_GESTION_SECRET_PROPERTY, secret);
  }

  properties.setProperty(
    MANTENIMIENTO_GESTION_KEY_HASH_PROPERTY,
    pqrsHash_(clave + '|' + secret)
  );

  return {
    ok: true,
    message: 'Clave de gestión configurada correctamente.'
  };
}

function iniciarSesionGestionMantenimiento(payload, origin) {
  pqrsAssertOrigin_(origin);
  payload = payload || {};

  const nombre = safeTrimPQRS_(payload.nombre);
  const clave = safeTrimPQRS_(payload.clave);

  if (nombre.length < 3 || nombre.length > 120) {
    throw new Error('Ingresa el nombre de la persona que realizará el mantenimiento.');
  }
  if (!clave) {
    throw new Error('Ingresa la clave de gestión.');
  }

  const properties = PropertiesService.getScriptProperties();
  const expectedHash = safeTrimPQRS_(
    properties.getProperty(MANTENIMIENTO_GESTION_KEY_HASH_PROPERTY)
  );
  const secret = safeTrimPQRS_(
    properties.getProperty(MANTENIMIENTO_GESTION_SECRET_PROPERTY)
  );

  if (!expectedHash || !secret) {
    throw new Error(
      'La gestión de mantenimiento todavía no tiene una clave configurada. Ejecuta configurarClaveGestionMantenimiento desde Apps Script.'
    );
  }

  const cache = CacheService.getScriptCache();
  const attemptKey = MANTENIMIENTO_GESTION_ATTEMPT_PREFIX +
    pqrsHash_(origin).slice(0, 32);
  const attempts = Number(cache.get(attemptKey) || 0);

  if (attempts >= 8) {
    throw new Error('Se agotaron temporalmente los intentos de ingreso. Intenta nuevamente en 15 minutos.');
  }

  const receivedHash = pqrsHash_(clave + '|' + secret);
  if (receivedHash !== expectedHash) {
    cache.put(attemptKey, String(attempts + 1), 15 * 60);
    throw new Error('La clave de gestión no es válida.');
  }

  cache.remove(attemptKey);

  const token = Utilities.getUuid().replace(/-/g, '') +
    Utilities.getUuid().replace(/-/g, '');
  const expiresAt = Date.now() + MANTENIMIENTO_GESTION_SESSION_SECONDS * 1000;
  const session = {
    nombre: nombre,
    origin: origin,
    createdAt: Date.now(),
    expiresAt: expiresAt
  };

  cache.put(
    pqrsMaintenanceSessionKey_(token),
    JSON.stringify(session),
    MANTENIMIENTO_GESTION_SESSION_SECONDS
  );

  console.log(JSON.stringify({
    event: 'PQRS_MAINTENANCE_MANAGEMENT_LOGIN',
    name: nombre,
    origin: origin,
    expiresAt: expiresAt
  }));

  return {
    ok: true,
    token: token,
    nombre: nombre,
    expiresAt: expiresAt
  };
}

function cerrarSesionGestionMantenimiento(payload, origin) {
  pqrsAssertOrigin_(origin);
  const token = pqrsSafeToken_((payload || {}).token);

  if (token) {
    CacheService.getScriptCache().remove(
      pqrsMaintenanceSessionKey_(token)
    );
  }

  return { ok: true };
}

function listarReportesMantenimiento(payload, origin) {
  const session = pqrsRequireMaintenanceSession_(
    (payload || {}).token,
    origin
  );
  const sheet = pqrsGetMaintenanceSheet_();
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return {
      ok: true,
      usuario: session.nombre,
      total: 0,
      reportes: []
    };
  }

  const values = sheet.getRange(
    2,
    1,
    lastRow - 1,
    MANTENIMIENTO_HEADERS.length
  ).getValues();

  const richPhotoLinks = sheet.getRange(
    2,
    14,
    lastRow - 1,
    3
  ).getRichTextValues();

  const reportes = values
    .map(function (row, index) {
      return {
        row: row,
        rowNumber: index + 2,
        photoLinks: pqrsExtractPhotoLinks_(row, richPhotoLinks[index])
      };
    })
    .filter(function (item) {
      return !!safeTrimPQRS_(item.row[0]);
    })
    .map(function (item) {
      return pqrsMaintenanceRowToObject_(
        item.row,
        item.rowNumber,
        item.photoLinks
      );
    })
    .sort(function (a, b) {
      const aClosed = a.estado === 'Cerrado' || a.estado === 'Resuelto';
      const bClosed = b.estado === 'Cerrado' || b.estado === 'Resuelto';
      if (aClosed !== bClosed) return aClosed ? 1 : -1;
      return String(b.fechaRecepcion || b.fechaReporte || '')
        .localeCompare(String(a.fechaRecepcion || a.fechaReporte || ''));
    });

  return {
    ok: true,
    usuario: session.nombre,
    total: reportes.length,
    reportes: reportes
  };
}

function obtenerReporteMantenimiento(payload, origin) {
  pqrsRequireMaintenanceSession_((payload || {}).token, origin);
  const reportId = pqrsSafeId_((payload || {}).reportId);

  if (!reportId) {
    throw new Error('Debes indicar el reporte que deseas consultar.');
  }

  const sheet = pqrsGetMaintenanceSheet_();
  const found = pqrsFindMaintenanceReportById_(sheet, reportId);

  if (!found) {
    throw new Error('El reporte solicitado no existe.');
  }

  const row = sheet.getRange(
    found.row,
    1,
    1,
    MANTENIMIENTO_HEADERS.length
  ).getValues()[0];

  return {
    ok: true,
    reporte: pqrsMaintenanceRowToObject_(
      row,
      found.row,
      pqrsGetMaintenancePhotoLinksForRow_(sheet, found.row, row)
    )
  };
}


function obtenerEvidenciaMantenimiento(payload, origin) {
  pqrsRequireMaintenanceSession_((payload || {}).token, origin);
  payload = payload || {};

  const reportId = pqrsSafeId_(payload.reportId);
  const photoIndex = Number(payload.photoIndex || 0);

  if (!reportId) {
    throw new Error('No se identificó el reporte de la evidencia.');
  }
  if (!Number.isInteger(photoIndex) || photoIndex < 1 || photoIndex > 3) {
    throw new Error('El número de evidencia no es válido.');
  }

  const sheet = pqrsGetMaintenanceSheet_();
  const found = pqrsFindMaintenanceReportById_(sheet, reportId);

  if (!found) {
    throw new Error('El reporte solicitado no existe.');
  }

  const row = sheet.getRange(
    found.row,
    1,
    1,
    MANTENIMIENTO_HEADERS.length
  ).getValues()[0];
  const links = pqrsGetMaintenancePhotoLinksForRow_(sheet, found.row, row);
  const photoUrl = links[photoIndex - 1] || '';

  if (!photoUrl) {
    throw new Error('La evidencia solicitada no existe.');
  }

  const fileId = pqrsExtractGoogleDriveFileId_(photoUrl);
  if (!fileId) {
    throw new Error('No fue posible identificar el archivo de la evidencia.');
  }

  let file;
  try {
    file = DriveApp.getFileById(fileId);
  } catch (error) {
    throw new Error('No fue posible acceder al archivo de la evidencia.');
  }

  const blob = file.getBlob();
  const mimeType = safeTrimPQRS_(blob.getContentType()) || 'image/jpeg';

  if (!/^image\//i.test(mimeType)) {
    throw new Error('El archivo de evidencia no es una imagen válida.');
  }

  const bytes = blob.getBytes();
  if (!bytes || !bytes.length) {
    throw new Error('La evidencia está vacía.');
  }

  // Las imágenes del formulario ya se comprimen antes de subirlas. Este límite
  // evita respuestas excesivamente grandes en caso de archivos antiguos.
  if (bytes.length > 5 * 1024 * 1024) {
    throw new Error('La evidencia es demasiado grande para previsualizarla.');
  }

  return {
    ok: true,
    reportId: reportId,
    photoIndex: photoIndex,
    mimeType: mimeType,
    bytes: bytes.length,
    dataUrl: 'data:' + mimeType + ';base64,' + Utilities.base64Encode(bytes)
  };
}

function subirEvidenciaGestionMantenimiento(payload, origin) {
  const session = pqrsRequireMaintenanceSession_(
    (payload || {}).token,
    origin
  );
  payload = payload || {};

  const reportId = pqrsSafeId_(payload.reportId);
  const clientEvidenceId = pqrsSafeId_(payload.clientEvidenceId);
  const evidence = payload.evidence || {};

  if (!reportId) {
    throw new Error('No se identificó el reporte asociado a la evidencia.');
  }
  if (!clientEvidenceId) {
    throw new Error('No se identificó la evidencia de cierre.');
  }

  const sheet = pqrsGetMaintenanceSheet_();
  const found = pqrsFindMaintenanceReportById_(sheet, reportId);
  if (!found) {
    throw new Error('El reporte solicitado no existe.');
  }

  const dataUrl = String(evidence.dataUrl || '');
  const match = dataUrl.match(
    /^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i
  );
  if (!match) {
    throw new Error('La evidencia de cierre tiene un formato inválido.');
  }

  const mimeType = match[1].toLowerCase().replace('image/jpg', 'image/jpeg');
  const bytes = Utilities.base64Decode(match[2]);
  if (!bytes.length) {
    throw new Error('La evidencia de cierre está vacía.');
  }
  if (bytes.length > MANTENIMIENTO_MAX_IMAGE_BYTES) {
    throw new Error('La evidencia de cierre supera el tamaño permitido.');
  }

  const extension = mimeType === 'image/png'
    ? 'png'
    : mimeType === 'image/webp'
      ? 'webp'
      : 'jpg';
  const safeEvidenceId = clientEvidenceId.replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 80);
  const fileName = reportId + '-gestion-' + safeEvidenceId + '.' + extension;
  const folder = pqrsGetMaintenanceFolder_();
  const existing = folder.getFilesByName(fileName);

  if (existing.hasNext()) {
    const existingFile = existing.next();
    return {
      ok: true,
      duplicate: true,
      reportId: reportId,
      fileId: existingFile.getId(),
      url: existingFile.getUrl(),
      bytes: existingFile.getSize()
    };
  }

  const blob = Utilities.newBlob(bytes, mimeType, fileName);
  const file = folder.createFile(blob);
  file.setDescription(
    'Evidencia de cierre del reporte ' + reportId +
    '. Cargada por ' + session.nombre + '.'
  );

  console.log(JSON.stringify({
    event: 'PQRS_MAINTENANCE_CLOSURE_EVIDENCE_UPLOADED',
    reportId: reportId,
    fileId: file.getId(),
    bytes: bytes.length,
    sessionName: session.nombre,
    origin: origin
  }));

  return {
    ok: true,
    duplicate: false,
    reportId: reportId,
    fileId: file.getId(),
    url: file.getUrl(),
    bytes: bytes.length
  };
}

function finalizarReporteMantenimiento(payload, origin) {
  const session = pqrsRequireMaintenanceSession_(
    (payload || {}).token,
    origin
  );
  payload = payload || {};

  const reportId = pqrsSafeId_(payload.reportId);
  const responsable = safeTrimPQRS_(payload.responsable) || session.nombre;
  const observaciones = safeTrimPQRS_(payload.observaciones);

  if (!reportId) {
    throw new Error('No se identificó el reporte que deseas finalizar.');
  }
  if (responsable.length < 3 || responsable.length > 120) {
    throw new Error('Ingresa el nombre de la persona responsable de la atención.');
  }
  if (observaciones.length < 5 || observaciones.length > 3000) {
    throw new Error('Las observaciones de cierre deben tener entre 5 y 3000 caracteres.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const ss = pqrsGetSpreadsheet_();
    const sheet = pqrsGetMaintenanceSheet_(ss);
    const found = pqrsFindMaintenanceReportById_(sheet, reportId);

    if (!found) {
      throw new Error('El reporte solicitado no existe.');
    }

    const row = found.row;
    const current = sheet.getRange(
      row,
      1,
      1,
      MANTENIMIENTO_HEADERS.length
    ).getValues()[0];
    const currentStatus = safeTrimPQRS_(current[7]);

    if (currentStatus === 'Cerrado') {
      return {
        ok: true,
        alreadyClosed: true,
        reportId: reportId,
        message: 'El reporte ya se encontraba cerrado.',
        reporte: pqrsMaintenanceRowToObject_(
          current,
          row,
          pqrsGetMaintenancePhotoLinksForRow_(sheet, row, current)
        )
      };
    }

    const now = new Date();
    const previousObservations = safeTrimPQRS_(current[18]);
    const timestamp = Utilities.formatDate(
      now,
      Session.getScriptTimeZone() || PQRS_TIMEZONE,
      'yyyy-MM-dd HH:mm'
    );
    const closureEntry =
      '[' + timestamp + '] ' + responsable + ': ' + observaciones;
    const consolidatedObservations = previousObservations
      ? previousObservations + '\n\n' + closureEntry
      : closureEntry;

    sheet.getRange(row, 8).setValue('Cerrado');
    sheet.getRange(row, 9).setValue(responsable);
    if (!current[16]) {
      sheet.getRange(row, 17).setValue(now);
    }
    sheet.getRange(row, 18).setValue(now);
    sheet.getRange(row, 19).setValue(consolidatedObservations);
    sheet.getRange(row, 20).setValue(PQRS_VERSION);
    SpreadsheetApp.flush();

    const updated = sheet.getRange(
      row,
      1,
      1,
      MANTENIMIENTO_HEADERS.length
    ).getValues()[0];

    pqrsSendMaintenanceClosureNotification_({
      reportId: reportId,
      responsable: responsable,
      observaciones: observaciones,
      ubicacion: safeTrimPQRS_(updated[5]),
      descripcion: safeTrimPQRS_(updated[6]),
      closedAt: now,
      spreadsheetUrl: ss.getUrl()
    });

    console.log(JSON.stringify({
      event: 'PQRS_MAINTENANCE_REPORT_CLOSED',
      reportId: reportId,
      responsable: responsable,
      sessionName: session.nombre,
      origin: origin
    }));

    return {
      ok: true,
      alreadyClosed: false,
      reportId: reportId,
      message: 'La atención fue finalizada y registrada en el mismo reporte.',
      reporte: pqrsMaintenanceRowToObject_(
        updated,
        row,
        pqrsGetMaintenancePhotoLinksForRow_(sheet, row, updated)
      )
    };
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function pqrsRequireMaintenanceSession_(token, origin) {
  pqrsAssertOrigin_(origin);
  token = pqrsSafeToken_(token);

  if (!token) {
    throw new Error('Sesión de gestión requerida.');
  }

  const cache = CacheService.getScriptCache();
  const key = pqrsMaintenanceSessionKey_(token);
  const raw = cache.get(key);

  if (!raw) {
    throw new Error('La sesión de gestión venció. Ingresa nuevamente.');
  }

  const session = JSON.parse(raw);
  if (session.origin !== origin) {
    cache.remove(key);
    throw new Error('El origen de la sesión no es válido.');
  }
  if (Date.now() > Number(session.expiresAt || 0)) {
    cache.remove(key);
    throw new Error('La sesión de gestión venció. Ingresa nuevamente.');
  }

  return session;
}

function pqrsMaintenanceSessionKey_(token) {
  return MANTENIMIENTO_GESTION_SESSION_PREFIX +
    pqrsHash_(token).slice(0, 48);
}

function pqrsMaintenanceRowToObject_(row, rowNumber, photoLinks) {
  return {
    fila: rowNumber,
    reportId: safeTrimPQRS_(row[0]),
    clientRequestId: safeTrimPQRS_(row[1]),
    fechaReporte: pqrsDateToIso_(row[2]),
    fechaRecepcion: pqrsDateToIso_(row[3]),
    reportadoPor: safeTrimPQRS_(row[4]),
    ubicacion: safeTrimPQRS_(row[5]),
    descripcion: safeTrimPQRS_(row[6]),
    estado: safeTrimPQRS_(row[7]) || 'Abierto',
    responsable: safeTrimPQRS_(row[8]),
    prioridad: safeTrimPQRS_(row[9]) || 'Media',
    fotos: Array.isArray(photoLinks)
      ? photoLinks
      : [row[13], row[14], row[15]]
          .map(function (value) { return safeTrimPQRS_(value); })
          .filter(function (value) { return /^https:\/\//i.test(value); }),
    fechaAtencion: pqrsDateToIso_(row[16]),
    fechaCierre: pqrsDateToIso_(row[17]),
    observacionesGestion: safeTrimPQRS_(row[18]),
    version: safeTrimPQRS_(row[19])
  };
}

function pqrsGetMaintenancePhotoLinksForRow_(sheet, rowNumber, rowValues) {
  const richValues = sheet.getRange(rowNumber, 14, 1, 3)
    .getRichTextValues()[0];
  return pqrsExtractPhotoLinks_(rowValues, richValues);
}

function pqrsExtractPhotoLinks_(rowValues, richValues) {
  return [0, 1, 2]
    .map(function (index) {
      const rich = richValues && richValues[index];
      const richUrl = rich && typeof rich.getLinkUrl === 'function'
        ? safeTrimPQRS_(rich.getLinkUrl())
        : '';
      const rawValue = rowValues
        ? safeTrimPQRS_(rowValues[13 + index])
        : '';
      return richUrl || (/^https:\/\//i.test(rawValue) ? rawValue : '');
    })
    .filter(function (url) { return !!url; });
}


function pqrsExtractGoogleDriveFileId_(url) {
  const value = safeTrimPQRS_(url);
  if (!value) return '';

  const pathMatch = value.match(/\/file\/d\/([^/?#]+)/i);
  if (pathMatch && pathMatch[1]) {
    return pqrsSafeDriveFileId_(pathMatch[1]);
  }

  const queryMatch = value.match(/[?&]id=([^&#]+)/i);
  if (queryMatch && queryMatch[1]) {
    try {
      return pqrsSafeDriveFileId_(decodeURIComponent(queryMatch[1]));
    } catch (error) {
      return pqrsSafeDriveFileId_(queryMatch[1]);
    }
  }

  return '';
}

function pqrsSafeDriveFileId_(value) {
  return safeTrimPQRS_(value)
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 180);
}

function pqrsFindMaintenanceReportById_(sheet, reportId) {
  if (sheet.getLastRow() < 2) return null;

  const finder = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, 1)
    .createTextFinder(reportId)
    .matchEntireCell(true)
    .findNext();

  return finder ? { row: finder.getRow(), reportId: reportId } : null;
}

function pqrsDateToIso_(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? '' : date.toISOString();
}

function pqrsSafeToken_(value) {
  return safeTrimPQRS_(value)
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 160);
}

function pqrsHash_(value) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value || ''),
    Utilities.Charset.UTF_8
  );
  return Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '');
}

/***************************************
 * INSTALACIÓN / CONFIGURACIÓN
 ***************************************/
function crearEstructuraMantenimiento() {
  const ss = pqrsGetSpreadsheet_();
  const sheet = pqrsEnsureMaintenanceSheet_(ss);
  const folder = pqrsGetMaintenanceFolder_();

  const result = {
    ok: true,
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    sheetName: sheet.getName(),
    folderId: folder.getId(),
    folderUrl: folder.getUrl(),
    message: 'Estructura de mantenimiento creada o validada.'
  };

  console.log(JSON.stringify(result));
  return result;
}

function configurarOrigenesPQRS(origenes) {
  const values = Array.isArray(origenes)
    ? origenes
    : String(origenes || '').split(',');

  const normalized = values
    .map(function (value) { return safeTrimPQRS_(value); })
    .filter(function (value) { return !!value; });

  if (!normalized.length) {
    throw new Error('Debes indicar al menos un origen HTTPS.');
  }

  PropertiesService.getScriptProperties().setProperty(
    'PQRS_ALLOWED_ORIGINS',
    normalized.join(',')
  );

  return {
    ok: true,
    origins: normalized
  };
}

/***************************************
 * HOJA Y FOTOGRAFÍAS
 ***************************************/
function pqrsGetSpreadsheet_() {
  const properties = PropertiesService.getScriptProperties();
  const configuredId = safeTrimPQRS_(
    properties.getProperty('PQRS_SPREADSHEET_ID')
  );

  if (configuredId) {
    try {
      return SpreadsheetApp.openById(configuredId);
    } catch (error) {
      Logger.log(
        'No fue posible abrir PQRS_SPREADSHEET_ID: ' +
        (error.message || String(error))
      );
    }
  }

  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) {
    properties.setProperty('PQRS_SPREADSHEET_ID', active.getId());
    return active;
  }

  throw new Error(
    'No se identificó el archivo de PQRS. Ejecuta crearEstructuraMantenimiento desde el script vinculado a la hoja antes de publicar la Web App.'
  );
}

function pqrsGetMaintenanceSheet_(ss) {
  const spreadsheet = ss || pqrsGetSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(MANTENIMIENTO_SHEET_NAME);

  if (!sheet) {
    throw new Error(
      'No existe la hoja de reportes de mantenimiento. Ejecuta crearEstructuraMantenimiento una sola vez desde Apps Script.'
    );
  }

  return sheet;
}

function pqrsEnsureMaintenanceSheet_(ss) {
  let sheet = ss.getSheetByName(MANTENIMIENTO_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(MANTENIMIENTO_SHEET_NAME);

  const currentLastColumn = Math.max(sheet.getLastColumn(), 1);
  const currentHeaders = sheet.getRange(1, 1, 1, currentLastColumn).getValues()[0]
    .map(function (value) { return safeTrimPQRS_(value); });

  if (sheet.getLastRow() === 0 || !currentHeaders[0]) {
    sheet.getRange(1, 1, 1, MANTENIMIENTO_HEADERS.length)
      .setValues([MANTENIMIENTO_HEADERS]);
  } else {
    MANTENIMIENTO_HEADERS.forEach(function (header, index) {
      if (currentHeaders[index] !== header) {
        sheet.getRange(1, index + 1).setValue(header);
      }
    });
  }

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, MANTENIMIENTO_HEADERS.length)
    .setBackground('#2c5f2d')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setWrap(true)
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  const widths = [
    160, 200, 150, 150, 180, 230, 360, 100, 150, 90,
    130, 130, 130, 220, 220, 220, 150, 150, 320, 180
  ];
  widths.forEach(function (width, index) {
    sheet.setColumnWidth(index + 1, width);
  });

  // No se aplica setNumberFormat a columnas completas. Las columnas de una
  // tabla de Google Sheets pueden tener un tipo administrado y rechazar el
  // cambio con: "No puedes establecer el formato de los números...".
  // Los valores se guardan como Date y la UI los transforma a ISO al leerlos.

  const maxRows = Math.max(sheet.getMaxRows() - 1, 1);
  sheet.getRange(2, 8, maxRows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(
        ['Abierto', 'Asignado', 'En proceso', 'Resuelto', 'Cerrado'],
        true
      )
      .setAllowInvalid(false)
      .build()
  );
  sheet.getRange(2, 10, maxRows, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(['Baja', 'Media', 'Alta', 'Urgente'], true)
      .setAllowInvalid(false)
      .build()
  );

  return sheet;
}

function pqrsSaveMaintenancePhoto_(folder, reportId, photo, photoNumber) {
  photo = photo || {};
  const dataUrl = String(photo.dataUrl || '');
  const match = dataUrl.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);

  if (!match) {
    throw new Error('La fotografía ' + photoNumber + ' tiene un formato inválido.');
  }

  const mimeType = match[1].toLowerCase().replace('image/jpg', 'image/jpeg');
  const bytes = Utilities.base64Decode(match[2]);

  if (!bytes.length) {
    throw new Error('La fotografía ' + photoNumber + ' está vacía.');
  }
  if (bytes.length > MANTENIMIENTO_MAX_IMAGE_BYTES) {
    throw new Error(
      'La fotografía ' + photoNumber +
      ' supera el tamaño permitido después de la compresión.'
    );
  }

  const extension = mimeType === 'image/png'
    ? 'png'
    : mimeType === 'image/webp'
      ? 'webp'
      : 'jpg';
  const fileName = reportId + '-foto-' + photoNumber + '.' + extension;
  const blob = Utilities.newBlob(bytes, mimeType, fileName);
  const file = folder.createFile(blob);

  file.setDescription(
    'Evidencia fotográfica del reporte de mantenimiento ' + reportId + '.'
  );

  return {
    fileId: file.getId(),
    url: file.getUrl(),
    blob: blob,
    sizeBytes: bytes.length,
    name: fileName
  };
}

function pqrsFormatMaintenanceRow_(sheet, row, photoRecords) {
  sheet.getRange(row, 1, 1, MANTENIMIENTO_HEADERS.length)
    .setVerticalAlignment('top')
    .setWrap(true);
  sheet.setRowHeight(row, photoRecords.length ? 105 : 45);

  photoRecords.forEach(function (photo, index) {
    const photoColumn = 11 + index;
    const linkColumn = 14 + index;

    const richText = SpreadsheetApp.newRichTextValue()
      .setText('Abrir foto ' + (index + 1))
      .setLinkUrl(photo.url)
      .build();

    sheet.getRange(row, linkColumn).setRichTextValue(richText);

    try {
      const image = sheet.insertImage(photo.blob, photoColumn, row);
      image.setWidth(120).setHeight(90);
      image.setAltTextTitle('Foto ' + (index + 1));
      image.setAltTextDescription(
        'Evidencia fotográfica del reporte de mantenimiento.'
      );
    } catch (error) {
      Logger.log(
        'No fue posible insertar la foto ' + (index + 1) +
        ' sobre la hoja: ' + (error.message || String(error))
      );
      sheet.getRange(row, photoColumn).setRichTextValue(richText);
    }
  });
}

function pqrsGetMaintenanceFolder_() {
  const properties = PropertiesService.getScriptProperties();
  const configuredId = safeTrimPQRS_(
    properties.getProperty('MANTENIMIENTO_DRIVE_FOLDER_ID')
  );

  if (configuredId) {
    try {
      return DriveApp.getFolderById(configuredId);
    } catch (error) {
      Logger.log(
        'La carpeta configurada no está disponible: ' +
        (error.message || String(error))
      );
    }
  }

  const folders = DriveApp.getFoldersByName(MANTENIMIENTO_FOLDER_NAME);
  const folder = folders.hasNext()
    ? folders.next()
    : DriveApp.createFolder(MANTENIMIENTO_FOLDER_NAME);

  properties.setProperty('MANTENIMIENTO_DRIVE_FOLDER_ID', folder.getId());
  return folder;
}

/***************************************
 * BÚSQUEDA, IDENTIFICADORES Y CORREO
 ***************************************/
function pqrsFindMaintenanceReport_(sheet, clientRequestId) {
  if (sheet.getLastRow() < 2) return null;

  const finder = sheet
    .getRange(2, 2, sheet.getLastRow() - 1, 1)
    .createTextFinder(clientRequestId)
    .matchEntireCell(true)
    .findNext();

  if (!finder) return null;

  return {
    row: finder.getRow(),
    reportId: safeTrimPQRS_(sheet.getRange(finder.getRow(), 1).getValue())
  };
}

function pqrsGenerateMaintenanceId_(date) {
  const prefix = Utilities.formatDate(
    date,
    Session.getScriptTimeZone() || PQRS_TIMEZONE,
    'yyyyMMdd-HHmmss'
  );
  const suffix = Utilities.getUuid().replace(/-/g, '').slice(0, 5).toUpperCase();
  return 'MANT-' + prefix + '-' + suffix;
}


function pqrsSendMaintenanceClosureNotification_(report) {
  try {
    const body =
      'Se finalizó una solicitud de mantenimiento.\n\n' +
      'ID del reporte: ' + report.reportId + '\n' +
      'Responsable: ' + report.responsable + '\n' +
      'Ubicación: ' + report.ubicacion + '\n' +
      'Problema reportado: ' + report.descripcion + '\n\n' +
      'Gestión realizada:\n' + report.observaciones + '\n\n' +
      'Fecha de cierre: ' + Utilities.formatDate(
        report.closedAt,
        Session.getScriptTimeZone() || PQRS_TIMEZONE,
        'yyyy-MM-dd HH:mm'
      ) + '\n\n' +
      'Hoja de seguimiento: ' + report.spreadsheetUrl + '\n\n' +
      'Este correo fue generado automáticamente por el portal de Bulevar Verde.';

    // ENVÍO DE CORREO DE MANTENIMIENTO DESHABILITADO.
    // Se conserva el código para poder reactivarlo posteriormente.
    /*
    MailApp.sendEmail({
      to: PQRS_ADMIN_EMAIL,
      subject: '[Bulevar Verde] Mantenimiento finalizado - ' + report.reportId,
      body: body
    });
    */
    Logger.log(
      'Correo de cierre de mantenimiento omitido por configuración: ' +
      report.reportId
    );
  } catch (error) {
    Logger.log(
      'El reporte se cerró, pero no fue posible enviar la notificación: ' +
      (error.message || String(error))
    );
  }
}

function pqrsSendMaintenanceNotification_(report) {
  try {
    const photoLines = report.photoRecords.length
      ? report.photoRecords.map(function (photo, index) {
          return 'Foto ' + (index + 1) + ': ' + photo.url;
        }).join('\n')
      : 'Sin fotografías adjuntas.';

    const body =
      'Se registró una nueva solicitud de mantenimiento.\n\n' +
      'ID del reporte: ' + report.reportId + '\n' +
      'Reportado por: ' + report.reportadoPor + '\n' +
      'Ubicación: ' + report.ubicacion + '\n' +
      'Descripción: ' + report.descripcion + '\n\n' +
      photoLines + '\n\n' +
      'Hoja de seguimiento: ' + report.spreadsheetUrl + '\n\n' +
      'Este correo fue generado automáticamente por el portal de Bulevar Verde.';

    // ENVÍO DE CORREO DE MANTENIMIENTO DESHABILITADO.
    // Se conserva el código para poder reactivarlo posteriormente.
    /*
    MailApp.sendEmail({
      to: PQRS_ADMIN_EMAIL,
      subject: '[Bulevar Verde] Nuevo reporte de mantenimiento - ' + report.reportId,
      body: body
    });
    */
    Logger.log(
      'Correo de creación de mantenimiento omitido por configuración: ' +
      report.reportId
    );
  } catch (error) {
    Logger.log(
      'El reporte se guardó, pero no fue posible enviar la notificación: ' +
      (error.message || String(error))
    );
  }
}

/***************************************
 * SEGURIDAD Y HELPERS
 ***************************************/
function pqrsGetAllowedOrigins_() {
  const configured = safeTrimPQRS_(
    PropertiesService.getScriptProperties().getProperty('PQRS_ALLOWED_ORIGINS')
  );

  const origins = configured
    ? configured.split(',')
    : [
        'https://consejobulevarverde-ph.github.io',
        'http://localhost:1313',
        'http://127.0.0.1:1313'
      ];

  return origins
    .map(function (origin) { return safeTrimPQRS_(origin); })
    .filter(function (origin) { return !!origin; });
}

function pqrsAssertOrigin_(origin) {
  const allowed = pqrsGetAllowedOrigins_();
  if (allowed.indexOf('*') !== -1) return;
  if (allowed.indexOf(safeTrimPQRS_(origin)) === -1) {
    throw new Error('Origen no autorizado.');
  }
}

function pqrsParseDate_(value) {
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

function pqrsSafeId_(value) {
  return safeTrimPQRS_(value).replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 120);
}

function safeTrimPQRS_(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function getPQRSValue_(data, possibleKeys) {
  for (let i = 0; i < possibleKeys.length; i += 1) {
    const key = possibleKeys[i];
    if (data[key] !== undefined && data[key] !== null && data[key] !== '') {
      return data[key];
    }
  }
  return '';
}

function setPQRSColumnIfExists_(sheet, headers, row, columnName, value) {
  const idx = headers
    .map(function (header) { return safeTrimPQRS_(header); })
    .indexOf(columnName);

  if (idx !== -1) sheet.getRange(row, idx + 1).setValue(value);
}

/***************************************
 * CREAR TRIGGER PQRS
 * Ejecutar una sola vez manualmente
 ***************************************/
function crearTriggerPQRS() {
  eliminarTriggersPQRS_();

  ScriptApp.newTrigger('onFormSubmit')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onFormSubmit()
    .create();

  Logger.log('Trigger PQRS creado correctamente.');
}

function eliminarTriggersPQRS_() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'onFormSubmit') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}
