/***************************************
 * PQRS Y MANTENIMIENTO
 * CLUB RESIDENCIAL BULEVAR VERDE
 ***************************************/

const PQRS_VERSION = '2.3.0-email-api-notificaciones';
const PQRS_TIMEZONE = 'America/Bogota';
const API_BULEVAR_VERDE_BASE_URL = 'https://bulevar-verde-api-739757275794.us-east4.run.app';
// Dominio público del sitio (baseURL de hugo.toml). Lo usan los enlaces de los correos.
const PQRS_PUBLIC_BASE_URL = 'https://bulevar-verde-app.web.app';

// Consulta pública (sin autenticación): topes para proteger la cuota de Apps Script
// y evitar la enumeración de radicados o el uso del formulario como relé de correo.
const PQRS_RATE_LIMIT_PREFIX = 'pqrs_rate_';
const PQRS_CONSULTA_MAX_GLOBAL = 120;        // consultas cada 10 min
const PQRS_CONSULTA_MAX_FALLIDAS = 30;       // radicados inexistentes cada 10 min
const PQRS_RESUMEN_MAX_POR_CORREO = 3;       // resúmenes por correo cada hora
const PQRS_NOTIFICACION_MAX_POR_CORREO = 5;  // confirmaciones por correo cada hora

const PQRS_ADMIN_EMAIL = 'bulevarverdeadmon@gmail.com';
const PQRS_CC_EMAIL = 'consejo.bulevarverde@gmail.com';
const PQRS_FORM_SHEET_NAME = 'Respuestas de formulario 1';

const MANTENIMIENTO_SHEET_NAME = 'Reportes Mantenimiento';
const MANTENIMIENTO_FOLDER_NAME = 'Reportes Mantenimiento - Evidencias';
const MANTENIMIENTO_PENDING_FOLDER_NAME = 'Reportes Mantenimiento - Respaldo de cola';
const MANTENIMIENTO_PENDING_FOLDER_PROPERTY = 'MANTENIMIENTO_PENDING_FOLDER_ID';
const MANTENIMIENTO_MAX_PHOTOS = 3;
const MANTENIMIENTO_MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MANTENIMIENTO_MAX_VIDEO_BYTES = 15 * 1024 * 1024;

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
  'Correo electrónico',
  'Ubicación de la zona afectada',
  'Descripción',
  'Estado',
  'Responsable',
  'Prioridad',
  'Foto 1',
  'Foto 2',
  'Foto 3',
  'Fecha de atención',
  'Fecha de cierre',
  'Foto Cierre',
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

    const cuerpoHtml =
      '<div style="font-family: \'Segoe UI\', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">' +
        '<div style="background-color: #2c5f2d; color: #ffffff; padding: 20px; text-align: center;">' +
          '<h2 style="margin: 0; font-size: 18px; font-weight: 700;">Club Residencial Bulevar Verde</h2>' +
          '<p style="margin: 4px 0 0; font-size: 14px; opacity: 0.9;">Nueva PQRS Recibida</p>' +
        '</div>' +
        '<div style="padding: 20px; color: #333333; line-height: 1.6; font-size: 14px;">' +
          '<div style="background-color: #f4fbf4; border-left: 4px solid #2c5f2d; border-radius: 4px; padding: 14px; margin-bottom: 16px;">' +
            '<p style="margin: 0 0 6px;"><strong>ID del caso:</strong> ' + pqrsEscapeHtml_(idCaso) + '</p>' +
            '<p style="margin: 0 0 6px;"><strong>Solicitante:</strong> ' + pqrsEscapeHtml_(nombre) + '</p>' +
            '<p style="margin: 0 0 6px;"><strong>Torre / Apto:</strong> Torre ' + pqrsEscapeHtml_(torre) + ' - Apto ' + pqrsEscapeHtml_(apto) + '</p>' +
            '<p style="margin: 0 0 6px;"><strong>Correo:</strong> ' + pqrsEscapeHtml_(email) + '</p>' +
            '<p style="margin: 0 0 6px;"><strong>Tipo:</strong> ' + pqrsEscapeHtml_(tipoSolicitud) + ' | <strong>Categoría:</strong> ' + pqrsEscapeHtml_(categoria) + '</p>' +
            '<p style="margin: 0 0 6px;"><strong>Fecha recepción:</strong> ' + pqrsEscapeHtml_(fechaStr) + '</p>' +
            '<p style="margin: 10px 0 0;"><strong>Descripción:</strong><br><span style="white-space: pre-line;">' + pqrsEscapeHtml_(descripcion) + '</span></p>' +
          '</div>' +
        '</div>' +
      '</div>';

    enviarCorreoViaSancionesAPI_({
      to: PQRS_ADMIN_EMAIL,
      subject: '[Bulevar Verde] Nueva PQRS recibida - ' + idCaso,
      body: cuerpo,
      htmlBody: cuerpoHtml
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
  const html = pqrsBuildBridgeHtml_();

  return HtmlService.createHtmlOutput(html)
    .setTitle('Mantenimiento - Bulevar Verde')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  const parameters = e && e.parameter ? e.parameter : {};
  const action = safeTrimPQRS_(parameters.action);
  const requestId = pqrsSafeId_(parameters.requestId);

  try {

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
      payloadChars: rawPayload.length,
      clientRequestId: payload && payload.clientRequestId
        ? pqrsSafeId_(payload.clientRequestId)
        : ''
    }));

    let result;
    if (action === 'crearReporteMantenimiento') {
      result = crearReporteMantenimiento(payload);
    } else if (action === 'verificarReporteMantenimiento') {
      result = verificarReporteMantenimiento(payload);
    } else if (action === 'iniciarSesionGestionMantenimiento') {
      result = iniciarSesionGestionMantenimiento(payload);
    } else if (action === 'listarReportesMantenimiento') {
      result = listarReportesMantenimiento(payload);
    } else if (action === 'obtenerReporteMantenimiento') {
      result = obtenerReporteMantenimiento(payload);
    } else if (action === 'obtenerEvidenciaMantenimiento') {
      result = obtenerEvidenciaMantenimiento(payload);
    } else if (action === 'subirEvidenciaGestionMantenimiento') {
      result = subirEvidenciaGestionMantenimiento(payload);
    } else if (action === 'finalizarReporteMantenimiento') {
      result = finalizarReporteMantenimiento(payload);
    } else if (action === 'actualizarEstadoMantenimiento') {
      result = actualizarEstadoMantenimiento(payload);
    } else if (action === 'consultarReportesMantenimientoPublico') {
      result = consultarReportesMantenimientoPublico(payload);
    } else if (action === 'cerrarSesionGestionMantenimiento') {
      result = cerrarSesionGestionMantenimiento(payload);
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

    return pqrsBuildPostResponseHtml_(requestId, true, result, '');
  } catch (error) {
    const message = error && error.message
      ? error.message
      : String(error || 'Error inesperado');

    console.error(JSON.stringify({
      event: 'PQRS_MAINTENANCE_POST_FAILED',
      requestId: requestId,
      action: action,
      ok: false,
      error: message
    }));

    return pqrsBuildPostResponseHtml_(requestId, false, null, message);
  }
}

function pqrsBuildPostResponseHtml_(requestId, ok, data, error) {
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
      var message = ${message};
      try {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage(message, '*');
        }
      } catch (parentError) {}
      try {
        if (window.top && window.top !== window && window.top !== window.parent) {
          window.top.postMessage(message, '*');
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

function pqrsBuildBridgeHtml_() {
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
        actualizarEstadoMantenimiento: 'actualizarEstadoMantenimiento',
        consultarReportesMantenimientoPublico: 'consultarReportesMantenimientoPublico',
        cerrarSesionGestionMantenimiento: 'cerrarSesionGestionMantenimiento'
      };

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
        } else if (serverFunction === 'actualizarEstadoMantenimiento') {
          runner.actualizarEstadoMantenimiento(payload, event.origin);
        } else if (serverFunction === 'consultarReportesMantenimientoPublico') {
          runner.consultarReportesMantenimientoPublico(payload, event.origin);
        } else {
          runner.cerrarSesionGestionMantenimiento(payload, event.origin);
        }
      });

      window.top.postMessage({ type: 'PORTAL_BV_READY' }, '*');

      status.textContent = 'Puente disponible.';
    }());
  </script>
</body>
</html>`;
}

/***************************************
 * CREAR REPORTE DE MANTENIMIENTO
 ***************************************/
function crearReporteMantenimiento(payload) {
  payload = payload || {};

  const clientRequestId = pqrsSafeId_(payload.clientRequestId);
  const reportadoPor = safeTrimPQRS_(payload.reportadoPor);
  const correo = safeTrimPQRS_(payload.correo || payload.email).toLowerCase();
  const ubicacion = safeTrimPQRS_(payload.ubicacion);
  const descripcion = safeTrimPQRS_(payload.descripcion);
  const fotos = Array.isArray(payload.fotos) ? payload.fotos : [];

  if (!clientRequestId) {
    throw new Error('No fue posible identificar la solicitud.');
  }
  if (reportadoPor.length < 3 || reportadoPor.length > 120) {
    throw new Error('Ingresa el nombre de quien realiza el reporte.');
  }
  // Los reportes guardados en la cola de un dispositivo antes de existir el campo
  // de correo se envían marcados como legacyWithoutEmail; de lo contrario quedarían
  // rechazados para siempre. Solo se conservan sin notificación al residente.
  const legacyWithoutEmail = !correo && payload.legacyWithoutEmail === true;
  if (!legacyWithoutEmail && (!correo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo))) {
    throw new Error('Ingresa un correo electrónico válido para recibir las notificaciones.');
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

  // Antes de tocar la hoja se conserva una copia completa del payload en
  // una carpeta privada de Drive. Esto permite recuperar el reporte incluso
  // si la tabla rechaza una operación o el dispositivo deja de estar disponible.
  try {
    pqrsBackupPendingMaintenancePayload_(payload);
  } catch (backupError) {
    console.error(JSON.stringify({
      event: 'PQRS_MAINTENANCE_BACKUP_FAILED',
      clientRequestId: clientRequestId,
      error: backupError && backupError.message
        ? backupError.message
        : String(backupError)
    }));
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const ss = pqrsGetSpreadsheet_();
    // El envío normal solo obtiene la hoja. No debe intentar cambiar formatos,
    // anchos, validaciones ni tipos de columnas en cada reporte.
    const sheet = pqrsGetMaintenanceSheet_(ss);
    pqrsValidateMaintenanceHeaders_(sheet);
    const existing = pqrsFindMaintenanceReport_(sheet, clientRequestId);

    if (existing) {
      pqrsDeletePendingMaintenanceBackup_(clientRequestId);
      return {
        ok: true,
        duplicate: true,
        reportId: existing.reportId,
        message: 'El reporte ya había sido registrado.'
      };
    }

    const now = new Date();
    const reportedAt = pqrsParseDate_(payload.reportedAt) || now;
    // El ID es estable para el mismo clientRequestId. Un reintento después de
    // una respuesta perdida no crea otro conjunto de evidencias.
    const reportId = pqrsGenerateMaintenanceId_(reportedAt, clientRequestId);
    const folder = pqrsGetMaintenanceFolder_();
    const photoRecords = [];

    fotos.forEach(function (photo, index) {
      photoRecords.push(
        pqrsSaveMaintenancePhoto_(folder, reportId, photo, index + 1)
      );
    });

    const rowValues = [
      reportId,                          // 1: ID Reporte
      clientRequestId,                   // 2: ID Solicitud Cliente
      reportedAt,                        // 3: Fecha reporte
      now,                               // 4: Fecha recepcion
      reportadoPor,                      // 5: Reportado por
      correo,                            // 6: Correo electrónico
      ubicacion,                         // 7: Ubicacion
      descripcion,                       // 8: Descripcion
      'Abierto',                         // 9: Estado
      '',                                // 10: Responsable
      'Media',                           // 11: Prioridad
      photoRecords[0] ? 'Foto 1' : '',   // 12: Foto 1
      photoRecords[1] ? 'Foto 2' : '',   // 13: Foto 2
      photoRecords[2] ? 'Foto 3' : '',   // 14: Foto 3
      '',                                // 15: Fecha de atención
      '',                                // 16: Fecha de cierre
      '',                                // 17: Foto Cierre
      '',                                // 18: Observaciones de gestión
      PQRS_VERSION                       // 19: Versión
    ];

    sheet.appendRow(rowValues);
    const row = sheet.getLastRow();

    try {
      pqrsFormatMaintenanceRow_(sheet, row, photoRecords);
    } catch (formatError) {
      // La fila ya está guardada. Un problema visual de la tabla no debe hacer
      // que el dispositivo conserve y reenvíe indefinidamente el reporte.
      console.error(JSON.stringify({
        event: 'PQRS_MAINTENANCE_ROW_FORMAT_FAILED',
        clientRequestId: clientRequestId,
        reportId: reportId,
        row: row,
        error: formatError && formatError.message
          ? formatError.message
          : String(formatError)
      }));
    }
    SpreadsheetApp.flush();

    // La fila ya quedó confirmada; se elimina el respaldo temporal de Drive.
    pqrsDeletePendingMaintenanceBackup_(clientRequestId);

    // El formulario es público: el correo del residente es un dato sin verificar.
    // Superado el tope, el reporte se guarda igual pero la confirmación solo va a
    // la administración, para que no sirva de relé hacia terceros.
    const notifyResident = Boolean(correo) &&
      !pqrsRateLimitExceeded_('notificacion-correo', correo, PQRS_NOTIFICACION_MAX_POR_CORREO, 3600);

    pqrsSendMaintenanceNotification_({
      reportId: reportId,
      reportadoPor: reportadoPor,
      correo: notifyResident ? correo : '',
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

function verificarReporteMantenimiento(payload) {
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

function iniciarSesionGestionMantenimiento(payload) {
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
    pqrsHash_(nombre).slice(0, 32);
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
    expiresAt: expiresAt
  }));

  return {
    ok: true,
    token: token,
    nombre: nombre,
    expiresAt: expiresAt
  };
}

function cerrarSesionGestionMantenimiento(payload) {
  const token = pqrsSafeToken_((payload || {}).token);

  if (token) {
    CacheService.getScriptCache().remove(
      pqrsMaintenanceSessionKey_(token)
    );
  }

  return { ok: true };
}

function listarReportesMantenimiento(payload) {
  const session = pqrsRequireMaintenanceSession_(
    (payload || {}).token
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

  // Fotos iniciales en columnas 12, 13, 14
  const richPhotoLinks = sheet.getRange(
    2,
    12,
    lastRow - 1,
    3
  ).getRichTextValues();

  // Foto de cierre en columna 17
  const richClosureLinks = sheet.getRange(
    2,
    17,
    lastRow - 1,
    1
  ).getRichTextValues();

  const reportes = values
    .map(function (row, index) {
      const closureRich = richClosureLinks[index] && richClosureLinks[index][0];
      const closureUrl = closureRich && typeof closureRich.getLinkUrl === 'function'
        ? safeTrimPQRS_(closureRich.getLinkUrl())
        : safeTrimPQRS_(row[16]);

      return {
        row: row,
        rowNumber: index + 2,
        photoLinks: pqrsExtractPhotoLinks_(row, richPhotoLinks[index], 12),
        closurePhotoLink: closureUrl
      };
    })
    .filter(function (item) {
      return !!safeTrimPQRS_(item.row[0]);
    })
    .map(function (item) {
      return pqrsMaintenanceRowToObject_(
        item.row,
        item.rowNumber,
        item.photoLinks,
        item.closurePhotoLink
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

function obtenerReporteMantenimiento(payload) {
  pqrsRequireMaintenanceSession_((payload || {}).token);
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
      pqrsGetMaintenancePhotoLinksForRow_(sheet, found.row, row),
      pqrsGetClosurePhotoLinkForRow_(sheet, found.row, row)
    )
  };
}

function consultarReportesMantenimientoPublico(payload) {
  payload = payload || {};

  const reportId = pqrsSafeId_(safeTrimPQRS_(payload.reportId || payload.id));
  const correo = safeTrimPQRS_(payload.correo || payload.email).toLowerCase();

  if (!reportId && !correo) {
    throw new Error('Debes ingresar el número de radicado (ID) o el correo electrónico registrado.');
  }

  if (!reportId && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    throw new Error('Ingresa un correo electrónico válido.');
  }

  if (pqrsRateLimitExceeded_('consulta', 'global', PQRS_CONSULTA_MAX_GLOBAL, 600)) {
    throw new Error('Hay demasiadas consultas en este momento. Intenta nuevamente en unos minutos.');
  }

  // El radicado actúa como llave: llega solo al correo de quien hizo el reporte.
  // Buscar por correo NO devuelve datos en pantalla (ver pqrsEnviarResumenPorCorreo_).
  return reportId
    ? pqrsConsultarPorRadicado_(reportId)
    : pqrsEnviarResumenPorCorreo_(correo);
}

function pqrsConsultarPorRadicado_(reportId) {
  const sheet = pqrsGetMaintenanceSheet_(pqrsGetSpreadsheet_());
  const found = pqrsFindMaintenanceReportById_(sheet, reportId);

  if (!found) {
    // Los intentos fallidos se cuentan aparte para frenar la enumeración de radicados.
    if (pqrsRateLimitExceeded_('radicado-fallido', 'global', PQRS_CONSULTA_MAX_FALLIDAS, 600)) {
      throw new Error('Demasiados intentos con radicados inexistentes. Intenta más tarde.');
    }
    return { ok: true, total: 0, reportes: [] };
  }

  const row = sheet.getRange(found.row, 1, 1, MANTENIMIENTO_HEADERS.length).getValues()[0];
  const item = pqrsMaintenanceRowToObject_(
    row,
    found.row,
    pqrsGetMaintenancePhotoLinksForRow_(sheet, found.row, row),
    pqrsGetClosurePhotoLinkForRow_(sheet, found.row, row)
  );

  return { ok: true, total: 1, reportes: [pqrsPublicMaintenanceView_(item)] };
}

// Vista pública: sin correo y con el nombre del reportante abreviado.
function pqrsPublicMaintenanceView_(item) {
  return {
    reportId: item.reportId,
    fechaReporte: item.fechaReporte,
    reportadoPor: pqrsMaskName_(item.reportadoPor),
    ubicacion: item.ubicacion,
    descripcion: item.descripcion,
    estado: item.estado,
    responsable: item.responsable,
    prioridad: item.prioridad,
    fechaAtencion: item.fechaAtencion,
    fechaCierre: item.fechaCierre,
    fotos: item.fotos || [],
    fotoCierre: item.fotoCierre || '',
    observacionesGestion: item.observacionesGestion || ''
  };
}

function pqrsMaskName_(name) {
  const parts = safeTrimPQRS_(name).split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return [parts[0]].concat(parts.slice(1).map(function (part) {
    return part.charAt(0).toUpperCase() + '.';
  })).join(' ');
}

// Respuesta idéntica exista o no el correo: no revela qué correos tienen reportes.
// El detalle (radicados, estado, ubicación) solo se envía a esa bandeja.
function pqrsEnviarResumenPorCorreo_(correo) {
  const respuesta = {
    ok: true,
    modo: 'correo',
    message: 'Si el correo tiene solicitudes registradas, te enviamos un resumen con los radicados a tu bandeja de entrada.'
  };

  if (pqrsRateLimitExceeded_('resumen-correo', correo, PQRS_RESUMEN_MAX_POR_CORREO, 3600)) {
    return respuesta;
  }

  const sheet = pqrsGetMaintenanceSheet_(pqrsGetSpreadsheet_());
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return respuesta;

  const cells = sheet
    .getRange(2, 6, lastRow - 1, 1)
    .createTextFinder(correo)
    .matchEntireCell(true)
    .findAll();
  if (!cells.length) return respuesta;

  const reportes = cells.map(function (cell) {
    const row = sheet.getRange(cell.getRow(), 1, 1, MANTENIMIENTO_HEADERS.length).getValues()[0];
    return {
      reportId: safeTrimPQRS_(row[0]),
      fecha: pqrsDateToIso_(row[2]),
      ubicacion: safeTrimPQRS_(row[6]),
      estado: safeTrimPQRS_(row[8]) || 'Abierto'
    };
  }).sort(function (a, b) {
    return String(b.fecha).localeCompare(String(a.fecha));
  }).slice(0, 20);

  const filas = reportes.map(function (reporte) {
    const enlace = PQRS_PUBLIC_BASE_URL + '/pqrs/consulta/?id=' + encodeURIComponent(reporte.reportId);
    return '<tr>' +
      '<td style="padding: 6px 8px; border-bottom: 1px solid #eee;"><a href="' + pqrsEscapeHtml_(enlace) + '" style="color: #2c5f2d; font-weight: 700;">' + pqrsEscapeHtml_(reporte.reportId) + '</a></td>' +
      '<td style="padding: 6px 8px; border-bottom: 1px solid #eee;">' + pqrsEscapeHtml_(reporte.estado) + '</td>' +
      '<td style="padding: 6px 8px; border-bottom: 1px solid #eee;">' + pqrsEscapeHtml_(reporte.ubicacion) + '</td>' +
      '</tr>';
  }).join('');

  const texto = reportes.map(function (reporte) {
    return '• ' + reporte.reportId + ' (' + reporte.estado + ') - ' + reporte.ubicacion + '\n  ' +
      PQRS_PUBLIC_BASE_URL + '/pqrs/consulta/?id=' + encodeURIComponent(reporte.reportId);
  }).join('\n');

  enviarCorreoViaSancionesAPI_({
    to: correo,
    subject: '[Bulevar Verde] Resumen de tus solicitudes de mantenimiento',
    body: 'Solicitaste consultar tus reportes de mantenimiento en el portal del Club Residencial Bulevar Verde.\n\n' +
      texto + '\n\nSi no fuiste tú, puedes ignorar este mensaje.',
    htmlBody: '<div style="font-family: \'Segoe UI\', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">' +
      '<div style="background-color: #2c5f2d; color: #ffffff; padding: 20px; text-align: center;"><h2 style="margin: 0; font-size: 18px;">Club Residencial Bulevar Verde</h2>' +
      '<p style="margin: 4px 0 0; font-size: 14px;">Resumen de tus solicitudes de mantenimiento</p></div>' +
      '<div style="padding: 20px; color: #333333; font-size: 14px; line-height: 1.6;">' +
      '<p style="margin-top: 0;">Solicitaste consultar tus reportes en el portal. Abre el radicado para ver el detalle:</p>' +
      '<table style="width: 100%; border-collapse: collapse; font-size: 14px;"><tr><th align="left" style="padding: 6px 8px;">Radicado</th><th align="left" style="padding: 6px 8px;">Estado</th><th align="left" style="padding: 6px 8px;">Ubicación</th></tr>' + filas + '</table>' +
      '<p style="font-size: 12px; color: #777; margin-bottom: 0;">Si no fuiste tú, puedes ignorar este mensaje.</p>' +
      '</div></div>'
  });

  return respuesta;
}

// Contador por ventana en CacheService. No es atómico, pero basta para frenar abuso.
function pqrsRateLimitExceeded_(bucket, key, max, windowSeconds) {
  const cache = CacheService.getScriptCache();
  const cacheKey = PQRS_RATE_LIMIT_PREFIX + bucket + '_' + pqrsHash_(String(key)).slice(0, 32);
  const current = Number(cache.get(cacheKey) || 0);

  if (current >= max) return true;

  cache.put(cacheKey, String(current + 1), windowSeconds);
  return false;
}

function obtenerEvidenciaMantenimiento(payload) {
  pqrsRequireMaintenanceSession_((payload || {}).token);
  payload = payload || {};

  const reportId = pqrsSafeId_(payload.reportId);
  const photoIndex = Number(payload.photoIndex || 0);
  let photoUrl = safeTrimPQRS_(payload.photoUrl);
  let fileId = '';

  if (photoUrl) {
    fileId = pqrsExtractGoogleDriveFileId_(photoUrl);
  }

  if (!fileId) {
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
    photoUrl = links[photoIndex - 1] || '';

    if (!photoUrl) {
      throw new Error('La evidencia solicitada no existe.');
    }

    fileId = pqrsExtractGoogleDriveFileId_(photoUrl);
  }

  if (!fileId) {
    throw new Error('No fue posible identificar el archivo de la evidencia.');
  }

  let file;
  try {
    file = DriveApp.getFileById(fileId);
  } catch (error) {
    throw new Error('No fue posible acceder al archivo de la evidencia.');
  }

  // El cliente puede enviar cualquier enlace de Drive: solo se sirven archivos de
  // la carpeta de evidencias de mantenimiento.
  if (!pqrsIsMaintenanceFolderFile_(file)) {
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
    fileId: fileId,
    mimeType: mimeType,
    bytes: bytes.length,
    dataUrl: 'data:' + mimeType + ';base64,' + Utilities.base64Encode(bytes)
  };
}

function subirEvidenciaGestionMantenimiento(payload) {
  const session = pqrsRequireMaintenanceSession_(
    (payload || {}).token
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
    /^data:((?:image|video)\/(?:jpeg|jpg|png|webp|mp4|webm));base64,([A-Za-z0-9+/=]+)$/i
  );
  if (!match) {
    throw new Error('La evidencia de cierre tiene un formato inválido.');
  }

  const mimeType = match[1].toLowerCase().replace('image/jpg', 'image/jpeg');
  const bytes = Utilities.base64Decode(match[2]);
  if (!bytes.length) {
    throw new Error('La evidencia de cierre está vacía.');
  }

  const isVideo = /^video\//i.test(mimeType);
  const maxBytes = isVideo ? MANTENIMIENTO_MAX_VIDEO_BYTES : MANTENIMIENTO_MAX_IMAGE_BYTES;
  if (bytes.length > maxBytes) {
    throw new Error('La evidencia de cierre supera el tamaño permitido.');
  }

  const extension = mimeType === 'image/png'
    ? 'png'
    : mimeType === 'image/webp'
      ? 'webp'
      : mimeType === 'video/mp4'
        ? 'mp4'
        : mimeType === 'video/webm'
          ? 'webm'
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
    sessionName: session.nombre
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

function finalizarReporteMantenimiento(payload) {
  const session = pqrsRequireMaintenanceSession_(
    (payload || {}).token
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

  // La URL de la evidencia viene del cliente: debe ser un archivo de la carpeta de
  // mantenimiento. Se guarda la URL canónica de Drive, no el texto recibido.
  let evidenceUrl = '';
  let evidenceFile = null;
  const requestedEvidenceUrl = safeTrimPQRS_(payload.evidenceUrl);
  if (requestedEvidenceUrl) {
    const evidenceFileId = pqrsExtractGoogleDriveFileId_(requestedEvidenceUrl);
    try {
      evidenceFile = evidenceFileId ? DriveApp.getFileById(evidenceFileId) : null;
    } catch (driveError) {
      evidenceFile = null;
    }
    if (!evidenceFile || !pqrsIsMaintenanceFolderFile_(evidenceFile)) {
      throw new Error('La evidencia de cierre no es válida.');
    }
    evidenceUrl = evidenceFile.getUrl();
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
    const currentStatus = safeTrimPQRS_(current[8]);

    if (currentStatus === 'Cerrado') {
      return {
        ok: true,
        alreadyClosed: true,
        reportId: reportId,
        message: 'El reporte ya se encontraba cerrado.',
        reporte: pqrsMaintenanceRowToObject_(
          current,
          row,
          pqrsGetMaintenancePhotoLinksForRow_(sheet, row, current),
          pqrsGetClosurePhotoLinkForRow_(sheet, row, current)
        )
      };
    }

    const now = new Date();
    const previousObservations = safeTrimPQRS_(current[17]);
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

    sheet.getRange(row, 9).setValue('Cerrado');
    sheet.getRange(row, 10).setValue(responsable);
    if (!current[14]) {
      sheet.getRange(row, 15).setValue(now);
    }
    sheet.getRange(row, 16).setValue(now);

    // Evidencia fotográfica de cierre en columna 17 (Foto Cierre)
    if (evidenceUrl) {
      const richText = SpreadsheetApp.newRichTextValue()
        .setText('🖼️ Foto Cierre')
        .setLinkUrl(evidenceUrl)
        .build();

      sheet.getRange(row, 17).setRichTextValue(richText);

      try {
        const image = sheet.insertImage(evidenceFile.getBlob(), 17, row);
        image.setWidth(120).setHeight(90);
        image.setAltTextTitle('Foto de Cierre');
        sheet.setRowHeight(row, 105);
      } catch (imgError) {
        Logger.log('No fue posible insertar miniatura de cierre sobre la celda: ' + (imgError.message || String(imgError)));
      }
    }

    sheet.getRange(row, 18).setValue(consolidatedObservations);
    sheet.getRange(row, 19).setValue(PQRS_VERSION);
    SpreadsheetApp.flush();

    const updated = sheet.getRange(
      row,
      1,
      1,
      MANTENIMIENTO_HEADERS.length
    ).getValues()[0];

    const photoLinks = pqrsGetMaintenancePhotoLinksForRow_(sheet, row, updated);
    pqrsSendMaintenanceClosureNotification_({
      reportId: reportId,
      reportadoPor: safeTrimPQRS_(updated[4]),
      correo: safeTrimPQRS_(updated[5]),
      ubicacion: safeTrimPQRS_(updated[6]),
      descripcion: safeTrimPQRS_(updated[7]),
      responsable: responsable,
      observaciones: observaciones,
      photoLinks: photoLinks,
      closureEvidenceUrl: evidenceUrl,
      closedAt: now,
      spreadsheetUrl: ss.getUrl()
    });

    console.log(JSON.stringify({
      event: 'PQRS_MAINTENANCE_REPORT_CLOSED',
      reportId: reportId,
      responsable: responsable,
      sessionName: session.nombre
    }));

    return {
      ok: true,
      alreadyClosed: false,
      reportId: reportId,
      message: 'La atención fue finalizada y registrada en el mismo reporte.',
      reporte: pqrsMaintenanceRowToObject_(
        updated,
        row,
        photoLinks,
        evidenceUrl
      )
    };
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function actualizarEstadoMantenimiento(payload) {
  const session = pqrsRequireMaintenanceSession_((payload || {}).token);
  payload = payload || {};

  const reportId = pqrsSafeId_(payload.reportId);
  const nuevoEstado = safeTrimPQRS_(payload.nuevoEstado);
  const responsable = safeTrimPQRS_(payload.responsable) || session.nombre;
  const observaciones = safeTrimPQRS_(payload.observaciones);

  if (!reportId) {
    throw new Error('No se identificó el reporte a actualizar.');
  }
  // El cierre se hace con "Finalizar atención" (exige observaciones y evidencia);
  // aquí solo se marca el inicio de la atención.
  if (nuevoEstado !== 'En proceso') {
    throw new Error('Estado inválido. Para cerrar un reporte usa "Finalizar atención".');
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
    const current = sheet.getRange(row, 1, 1, MANTENIMIENTO_HEADERS.length).getValues()[0];
    const previousStatus = safeTrimPQRS_(current[8]);

    if (previousStatus === 'Cerrado') {
      throw new Error('El reporte ya está cerrado y no puede volver a "En proceso".');
    }

    if (previousStatus === 'En proceso') {
      // Idempotente: no repite la entrada de historial ni el correo al residente.
      return {
        ok: true,
        alreadyInProgress: true,
        reportId: reportId,
        estado: 'En proceso',
        message: 'El reporte ya estaba en proceso.',
        reporte: pqrsMaintenanceRowToObject_(
          current,
          row,
          pqrsGetMaintenancePhotoLinksForRow_(sheet, row, current),
          pqrsGetClosurePhotoLinkForRow_(sheet, row, current)
        )
      };
    }

    const now = new Date();
    const timestamp = Utilities.formatDate(
      now,
      Session.getScriptTimeZone() || PQRS_TIMEZONE,
      'yyyy-MM-dd HH:mm'
    );

    const previousObservations = safeTrimPQRS_(current[17]);
    let entryText = '';
    if (observaciones) {
      entryText = '[' + timestamp + '] (' + nuevoEstado + ') ' + responsable + ': ' + observaciones;
    } else {
      entryText = '[' + timestamp + '] Estado cambiado a ' + nuevoEstado + ' por ' + responsable;
    }
    const consolidatedObservations = previousObservations
      ? previousObservations + '\n\n' + entryText
      : entryText;

    sheet.getRange(row, 9).setValue(nuevoEstado);
    sheet.getRange(row, 10).setValue(responsable);
    sheet.getRange(row, 18).setValue(consolidatedObservations);
    sheet.getRange(row, 19).setValue(PQRS_VERSION);

    if (!current[14]) {
      sheet.getRange(row, 15).setValue(now);
    }

    SpreadsheetApp.flush();

    const updated = sheet.getRange(row, 1, 1, MANTENIMIENTO_HEADERS.length).getValues()[0];
    const photoLinks = pqrsGetMaintenancePhotoLinksForRow_(sheet, row, updated);
    const closurePhotoLink = pqrsGetClosurePhotoLinkForRow_(sheet, row, updated);

    pqrsSendMaintenanceInProgressNotification_({
      reportId: reportId,
      reportadoPor: safeTrimPQRS_(updated[4]),
      correo: safeTrimPQRS_(updated[5]),
      ubicacion: safeTrimPQRS_(updated[6]),
      descripcion: safeTrimPQRS_(updated[7]),
      responsable: responsable,
      observaciones: observaciones,
      attentionStartedAt: now,
      spreadsheetUrl: ss.getUrl()
    });

    return {
      ok: true,
      reportId: reportId,
      estado: nuevoEstado,
      message: 'Estado actualizado a ' + nuevoEstado + ' correctamente.',
      reporte: pqrsMaintenanceRowToObject_(
        updated,
        row,
        photoLinks,
        closurePhotoLink
      )
    };
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function pqrsRequireMaintenanceSession_(token) {
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

function pqrsMaintenanceRowToObject_(row, rowNumber, photoLinks, closurePhotoLink) {
  const is19ColSchema = row.length === 19 || MANTENIMIENTO_HEADERS.length === 19;

  if (is19ColSchema) {
    return {
      fila: rowNumber,
      reportId: safeTrimPQRS_(row[0]),
      clientRequestId: safeTrimPQRS_(row[1]),
      fechaReporte: pqrsDateToIso_(row[2]),
      fechaRecepcion: pqrsDateToIso_(row[3]),
      reportadoPor: safeTrimPQRS_(row[4]),
      correo: safeTrimPQRS_(row[5]),
      ubicacion: safeTrimPQRS_(row[6]),
      descripcion: safeTrimPQRS_(row[7]),
      estado: safeTrimPQRS_(row[8]) || 'Abierto',
      responsable: safeTrimPQRS_(row[9]),
      prioridad: safeTrimPQRS_(row[10]) || 'Media',
      fotos: Array.isArray(photoLinks) ? photoLinks : [],
      fechaAtencion: pqrsDateToIso_(row[14]),
      fechaCierre: pqrsDateToIso_(row[15]),
      fotoCierre: closurePhotoLink || safeTrimPQRS_(row[16]),
      observacionesGestion: safeTrimPQRS_(row[17]),
      version: safeTrimPQRS_(row[18])
    };
  }

  // Retrocompatibilidad con esquemas anteriores (21/23 columnas)
  const isNewSchema = row.length >= 21 || (row[5] && String(row[5]).indexOf('@') !== -1);
  const emailColIdx = isNewSchema ? 5 : -1;
  const offset = isNewSchema ? 1 : 0;
  const hasClosurePhotoCols = row.length >= 23 || (row[20] !== undefined);

  let fotoCierreUrl = closurePhotoLink || '';
  let obsIndex = 18 + offset;
  let verIndex = 19 + offset;

  if (hasClosurePhotoCols) {
    fotoCierreUrl = fotoCierreUrl || safeTrimPQRS_(row[20]) || safeTrimPQRS_(row[19]);
    obsIndex = 21;
    verIndex = 22;
  }

  return {
    fila: rowNumber,
    reportId: safeTrimPQRS_(row[0]),
    clientRequestId: safeTrimPQRS_(row[1]),
    fechaReporte: pqrsDateToIso_(row[2]),
    fechaRecepcion: pqrsDateToIso_(row[3]),
    reportadoPor: safeTrimPQRS_(row[4]),
    correo: emailColIdx !== -1 ? safeTrimPQRS_(row[emailColIdx]) : '',
    ubicacion: safeTrimPQRS_(row[5 + offset]),
    descripcion: safeTrimPQRS_(row[6 + offset]),
    estado: safeTrimPQRS_(row[7 + offset]) || 'Abierto',
    responsable: safeTrimPQRS_(row[8 + offset]),
    prioridad: safeTrimPQRS_(row[9 + offset]) || 'Media',
    fotos: Array.isArray(photoLinks) ? photoLinks : [],
    fechaAtencion: pqrsDateToIso_(row[16 + offset]),
    fechaCierre: pqrsDateToIso_(row[17 + offset]),
    fotoCierre: fotoCierreUrl || '',
    observacionesGestion: safeTrimPQRS_(row[obsIndex]),
    version: safeTrimPQRS_(row[verIndex])
  };
}

function pqrsGetMaintenancePhotoLinksForRow_(sheet, rowNumber, rowValues) {
  // Fotos iniciales en columnas 12, 13, 14
  const richValues = sheet.getRange(rowNumber, 12, 1, 3).getRichTextValues()[0];
  return pqrsExtractPhotoLinks_(rowValues, richValues, 12);
}

function pqrsGetClosurePhotoLinkForRow_(sheet, rowNumber, rowValues) {
  try {
    const rich = sheet.getRange(rowNumber, 17).getRichTextValue();
    const richUrl = rich && typeof rich.getLinkUrl === 'function'
      ? safeTrimPQRS_(rich.getLinkUrl())
      : '';
    const rawValue = rowValues ? safeTrimPQRS_(rowValues[16]) : '';
    return richUrl || (/^https:\/\//i.test(rawValue) ? rawValue : '');
  } catch (e) {
    return '';
  }
}

function pqrsExtractPhotoLinks_(rowValues, richValues, startCol) {
  const baseCol = (startCol || 12) - 1;
  return [0, 1, 2]
    .map(function (index) {
      const rich = richValues && richValues[index];
      const richUrl = rich && typeof rich.getLinkUrl === 'function'
        ? safeTrimPQRS_(rich.getLinkUrl())
        : '';
      const rawValue = rowValues && rowValues[baseCol + index]
        ? safeTrimPQRS_(rowValues[baseCol + index])
        : '';
      return richUrl || (/^https:\/\//i.test(rawValue) ? rawValue : '');
    })
    .filter(function (url) { return !!url; });
}


function pqrsIsMaintenanceFolderFile_(file) {
  const folderId = pqrsGetMaintenanceFolder_().getId();
  const parents = file.getParents();

  while (parents.hasNext()) {
    if (parents.next().getId() === folderId) return true;
  }
  return false;
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

  // Reparar y vincular hipervínculos interactivos en todas las filas existentes
  pqrsRepairExistingPhotoLinks_(sheet, folder);

  const result = {
    ok: true,
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl(),
    sheetName: sheet.getName(),
    folderId: folder.getId(),
    folderUrl: folder.getUrl(),
    message: 'Estructura de mantenimiento creada y fotos existentes vinculadas correctamente.'
  };

  console.log(JSON.stringify(result));
  return result;
}

function pqrsRepairExistingPhotoLinks_(sheet, folder) {
  try {
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    const rows = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();

    // Indexar la carpeta una sola vez: recorrerla por cada fila es O(filas x archivos)
    // y agota el límite de ejecución cuando crece el historial.
    const filesByName = {};
    const closureFileByReportId = {};
    const folderFiles = folder.getFiles();
    while (folderFiles.hasNext()) {
      const folderFile = folderFiles.next();
      const folderFileName = folderFile.getName();
      filesByName[folderFileName] = folderFile;

      const closureMatch = folderFileName.match(/^(.+?)-(?:gestion-|cierre)/);
      if (closureMatch && !closureFileByReportId[closureMatch[1]]) {
        closureFileByReportId[closureMatch[1]] = folderFile;
      }
    }

    // Mapear imágenes existentes en la hoja para no duplicarlas
    const existingImages = sheet.getImages();
    const imagePositions = {};
    existingImages.forEach(function (img) {
      try {
        const anchor = img.getAnchorCell();
        if (anchor) {
          imagePositions[anchor.getRow() + '_' + anchor.getColumn()] = true;
        }
      } catch (e) {}
    });

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2;
      const reportId = safeTrimPQRS_(rows[i][0]);
      if (!reportId) continue;

      let hasPhotos = false;

      // 1. Fotos iniciales (Columnas 12, 13, 14: Foto 1, Foto 2, Foto 3)
      for (let photoNum = 1; photoNum <= 3; photoNum++) {
        const colNum = 11 + photoNum;
        const cell = sheet.getRange(rowNum, colNum);

        const extensions = ['jpg', 'jpeg', 'png', 'webp'];
        let foundFile = null;

        for (let extIdx = 0; extIdx < extensions.length; extIdx++) {
          const fileName = reportId + '-foto-' + photoNum + '.' + extensions[extIdx];
          if (filesByName[fileName]) {
            foundFile = filesByName[fileName];
            break;
          }
        }

        if (foundFile) {
          hasPhotos = true;
          const richText = SpreadsheetApp.newRichTextValue()
            .setText('🖼️ Foto ' + photoNum)
            .setLinkUrl(foundFile.getUrl())
            .build();
          cell.setRichTextValue(richText);

          // Si no tiene imagen flotante insertada en esta celda, insertarla
          const posKey = rowNum + '_' + colNum;
          if (!imagePositions[posKey]) {
            try {
              const image = sheet.insertImage(foundFile.getBlob(), colNum, rowNum);
              image.setWidth(120).setHeight(90);
              image.setAltTextTitle('Foto ' + photoNum);
              imagePositions[posKey] = true;
            } catch (imgErr) {
              Logger.log('Error insertando imagen en repair: ' + (imgErr.message || String(imgErr)));
            }
          }
        }
      }

      // 2. Foto de Cierre (Columna 17)
      const closureCol = 17;
      const closureCell = sheet.getRange(rowNum, closureCol);
      let closureFile = closureFileByReportId[reportId] || null;

      if (!closureFile) {
        const obsText = safeTrimPQRS_(rows[i][17]) || safeTrimPQRS_(rows[i][rows[i].length - 2]);
        const fileId = pqrsExtractGoogleDriveFileId_(obsText);
        if (fileId) {
          try {
            closureFile = DriveApp.getFileById(fileId);
          } catch (e) {}
        }
      }

      if (closureFile) {
        hasPhotos = true;
        const richText = SpreadsheetApp.newRichTextValue()
          .setText('🖼️ Foto Cierre')
          .setLinkUrl(closureFile.getUrl())
          .build();
        closureCell.setRichTextValue(richText);

        const posKey = rowNum + '_' + closureCol;
        if (!imagePositions[posKey]) {
          try {
            const image = sheet.insertImage(closureFile.getBlob(), closureCol, rowNum);
            image.setWidth(120).setHeight(90);
            image.setAltTextTitle('Foto de Cierre');
            imagePositions[posKey] = true;
          } catch (imgErr) {
            Logger.log('Error insertando imagen de cierre en repair: ' + (imgErr.message || String(imgErr)));
          }
        }
      }

      if (hasPhotos) {
        sheet.setRowHeight(rowNum, 105);
      }
    }
  } catch (repairErr) {
    Logger.log('Nota en reparación de enlaces de fotos: ' + (repairErr.message || String(repairErr)));
  }
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

function pqrsValidateMaintenanceHeaders_(sheet) {
  const lastColumn = Math.max(sheet.getLastColumn(), MANTENIMIENTO_HEADERS.length);
  let headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0]
    .map(function (value) { return safeTrimPQRS_(value); });

  // 1. Migración automática si la hoja aún no tiene la columna 'Correo electrónico'
  if (headers.indexOf('Correo electrónico') === -1 && headers.indexOf('Reportado por') !== -1) {
    const reportadoIdx = headers.indexOf('Reportado por');
    sheet.insertColumnAfter(reportadoIdx + 1);
    headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      .map(function (value) { return safeTrimPQRS_(value); });
  }

  // 2. Eliminar columnas antiguas de 'Enlace Foto' si existen
  const enlaceCols = ['Enlace Foto 1', 'Enlace Foto 2', 'Enlace Foto 3', 'Enlace Foto Cierre'];
  enlaceCols.forEach(function (colName) {
    const colIdx = headers.indexOf(colName);
    if (colIdx !== -1) {
      sheet.deleteColumn(colIdx + 1);
      headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0]
        .map(function (value) { return safeTrimPQRS_(value); });
    }
  });

  // 3. Insertar 'Foto Cierre' si falta
  if (headers.indexOf('Foto Cierre') === -1) {
    const obsIdx = headers.indexOf('Observaciones de gestión');
    if (obsIdx !== -1) {
      sheet.insertColumnBefore(obsIdx + 1);
    }
  }

  sheet.getRange(1, 1, 1, MANTENIMIENTO_HEADERS.length).setValues([MANTENIMIENTO_HEADERS]);
  headers = sheet.getRange(1, 1, 1, MANTENIMIENTO_HEADERS.length).getValues()[0]
    .map(function (value) { return safeTrimPQRS_(value); });

  const missing = MANTENIMIENTO_HEADERS.filter(function (header, index) {
    return headers[index] !== header;
  });

  if (missing.length) {
    throw new Error(
      'La hoja de mantenimiento no tiene la estructura esperada. ' +
      'Faltan o cambiaron encabezados: ' + missing.join(', ')
    );
  }

  return true;
}

function pqrsEnsureMaintenanceSheet_(ss) {
  let sheet = ss.getSheetByName(MANTENIMIENTO_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(MANTENIMIENTO_SHEET_NAME);

  const currentLastColumn = Math.max(sheet.getLastColumn(), 1);
  let currentHeaders = sheet.getRange(1, 1, 1, currentLastColumn).getValues()[0]
    .map(function (value) { return safeTrimPQRS_(value); });

  if (currentHeaders.indexOf('Correo electrónico') === -1 && currentHeaders.indexOf('Reportado por') !== -1) {
    const reportadoIdx = currentHeaders.indexOf('Reportado por');
    sheet.insertColumnAfter(reportadoIdx + 1);
    currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
      .map(function (value) { return safeTrimPQRS_(value); });
  }

  // Eliminar columnas redundantes de 'Enlace Foto'
  const enlaceCols = ['Enlace Foto 1', 'Enlace Foto 2', 'Enlace Foto 3', 'Enlace Foto Cierre'];
  enlaceCols.forEach(function (colName) {
    const colIdx = currentHeaders.indexOf(colName);
    if (colIdx !== -1) {
      sheet.deleteColumn(colIdx + 1);
      currentHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0]
        .map(function (value) { return safeTrimPQRS_(value); });
    }
  });

  if (currentHeaders.indexOf('Foto Cierre') === -1) {
    const obsIdx = currentHeaders.indexOf('Observaciones de gestión');
    if (obsIdx !== -1) {
      sheet.insertColumnBefore(obsIdx + 1);
    }
  }

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
    160, // 1: ID Reporte
    200, // 2: ID Solicitud Cliente
    150, // 3: Fecha reporte
    150, // 4: Fecha recepcion
    180, // 5: Reportado por
    200, // 6: Correo
    230, // 7: Ubicacion
    360, // 8: Descripcion
    120, // 9: Estado
    150, // 10: Responsable
    90,  // 11: Prioridad
    140, // 12: Foto 1
    140, // 13: Foto 2
    140, // 14: Foto 3
    150, // 15: Fecha atencion
    150, // 16: Fecha cierre
    140, // 17: Foto Cierre
    320, // 18: Observaciones de gestion
    180  // 19: Version
  ];
  widths.forEach(function (width, index) {
    sheet.setColumnWidth(index + 1, width);
  });

  const maxRows = Math.max(sheet.getMaxRows() - 1, 1);

  // 1. Quitar validación de lista desplegable de la columna Estado (columna 9) para bloquear manipulación directa
  sheet.getRange(2, 9, maxRows, 1).clearDataValidations();

  // 2. Establecer aviso/protección en columna Estado para que se actualice únicamente desde el portal web
  try {
    const protections = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
    let stateProtection = null;
    for (let i = 0; i < protections.length; i++) {
      if (protections[i].getDescription() === 'Estado gestionado exclusivamente por el portal web') {
        stateProtection = protections[i];
        break;
      }
    }
    if (!stateProtection) {
      stateProtection = sheet.getRange(2, 9, maxRows, 1).protect();
      stateProtection.setDescription('Estado gestionado exclusivamente por el portal web');
      stateProtection.setWarningOnly(true);
    }
  } catch (protErr) {
    Logger.log('Nota sobre protección de celda: ' + (protErr.message || String(protErr)));
  }

  // 3. Validación de prioridad (columna 11)
  sheet.getRange(2, 11, maxRows, 1).setDataValidation(
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
  const existingFiles = folder.getFilesByName(fileName);
  let file;

  if (existingFiles.hasNext()) {
    // Reutiliza la evidencia creada por un intento anterior que no alcanzó a
    // confirmar la fila. Así se evitan archivos duplicados en cada reintento.
    file = existingFiles.next();
    while (existingFiles.hasNext()) {
      existingFiles.next().setTrashed(true);
    }
  } else {
    file = folder.createFile(blob);
  }

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
    const photoColumn = 12 + index; // Col 12 (Foto 1), Col 13 (Foto 2), Col 14 (Foto 3)

    const linkRichText = SpreadsheetApp.newRichTextValue()
      .setText('🖼️ Foto ' + (index + 1))
      .setLinkUrl(photo.url)
      .build();

    sheet.getRange(row, photoColumn).setRichTextValue(linkRichText);

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

function pqrsGetPendingMaintenanceFolder_() {
  const properties = PropertiesService.getScriptProperties();
  const configuredId = safeTrimPQRS_(
    properties.getProperty(MANTENIMIENTO_PENDING_FOLDER_PROPERTY)
  );

  if (configuredId) {
    try {
      return DriveApp.getFolderById(configuredId);
    } catch (error) {
      Logger.log(
        'La carpeta de respaldo configurada no está disponible: ' +
        (error.message || String(error))
      );
    }
  }

  const folders = DriveApp.getFoldersByName(MANTENIMIENTO_PENDING_FOLDER_NAME);
  const folder = folders.hasNext()
    ? folders.next()
    : DriveApp.createFolder(MANTENIMIENTO_PENDING_FOLDER_NAME);

  properties.setProperty(MANTENIMIENTO_PENDING_FOLDER_PROPERTY, folder.getId());
  return folder;
}

function pqrsBackupPendingMaintenancePayload_(payload) {
  payload = payload || {};
  const clientRequestId = pqrsSafeId_(payload.clientRequestId);

  if (!clientRequestId) {
    throw new Error('No se puede respaldar un reporte sin clientRequestId.');
  }

  const folder = pqrsGetPendingMaintenanceFolder_();
  const fileName = 'PENDIENTE-' + clientRequestId + '.json';
  const envelope = {
    backupVersion: 1,
    backedUpAt: new Date().toISOString(),
    scriptVersion: PQRS_VERSION,
    clientRequestId: clientRequestId,
    payload: payload
  };
  const content = JSON.stringify(envelope);
  const files = folder.getFilesByName(fileName);
  let file;

  if (files.hasNext()) {
    file = files.next();
    file.setContent(content);
    while (files.hasNext()) {
      files.next().setTrashed(true);
    }
  } else {
    file = folder.createFile(fileName, content, MimeType.PLAIN_TEXT);
  }

  file.setDescription(
    'Respaldo temporal de un reporte de mantenimiento pendiente. ' +
    'Se elimina automáticamente cuando la fila queda confirmada.'
  );

  console.log(JSON.stringify({
    event: 'PQRS_MAINTENANCE_BACKUP_SAVED',
    clientRequestId: clientRequestId,
    fileId: file.getId(),
    bytes: content.length
  }));

  return {
    fileId: file.getId(),
    fileUrl: file.getUrl(),
    fileName: fileName,
    bytes: content.length
  };
}

function pqrsDeletePendingMaintenanceBackup_(clientRequestId) {
  clientRequestId = pqrsSafeId_(clientRequestId);
  if (!clientRequestId) return 0;

  try {
    const folder = pqrsGetPendingMaintenanceFolder_();
    const files = folder.getFilesByName(
      'PENDIENTE-' + clientRequestId + '.json'
    );
    let deleted = 0;

    while (files.hasNext()) {
      files.next().setTrashed(true);
      deleted += 1;
    }

    if (deleted) {
      console.log(JSON.stringify({
        event: 'PQRS_MAINTENANCE_BACKUP_REMOVED',
        clientRequestId: clientRequestId,
        deleted: deleted
      }));
    }

    return deleted;
  } catch (error) {
    // La limpieza del respaldo es secundaria. La confirmación del reporte no
    // debe fallar si Drive no permite eliminar temporalmente el archivo.
    console.error(JSON.stringify({
      event: 'PQRS_MAINTENANCE_BACKUP_REMOVE_FAILED',
      clientRequestId: clientRequestId,
      error: error && error.message ? error.message : String(error)
    }));
    return 0;
  }
}

/**
 * Ejecutar manualmente desde Apps Script para revisar qué reportes quedaron
 * respaldados en Drive y aún no han sido confirmados en la hoja.
 */
function listarRespaldosPendientesMantenimiento() {
  const folder = pqrsGetPendingMaintenanceFolder_();
  const files = folder.getFiles();
  const result = [];

  while (files.hasNext()) {
    const file = files.next();
    if (!/^PENDIENTE-.*\.json$/i.test(file.getName())) continue;
    result.push({
      name: file.getName(),
      url: file.getUrl(),
      sizeBytes: file.getSize(),
      updatedAt: file.getLastUpdated().toISOString()
    });
  }

  result.sort(function (a, b) {
    return String(a.updatedAt).localeCompare(String(b.updatedAt));
  });
  console.log(JSON.stringify(result));
  return result;
}

/**
 * Recupera manualmente hasta 10 respaldos por ejecución. Úsala únicamente si
 * el dispositivo deja de reintentar. Los archivos confirmados se eliminan de
 * la carpeta de respaldo de forma automática.
 */
function recuperarRespaldosPendientesMantenimiento(limite) {
  const maxItems = Math.max(1, Math.min(Number(limite || 10), 10));
  const folder = pqrsGetPendingMaintenanceFolder_();
  const files = folder.getFiles();
  const result = [];
  let processed = 0;

  while (files.hasNext() && processed < maxItems) {
    const file = files.next();
    if (!/^PENDIENTE-.*\.json$/i.test(file.getName())) continue;
    processed += 1;

    try {
      const envelope = JSON.parse(file.getBlob().getDataAsString('UTF-8'));
      const response = crearReporteMantenimiento(envelope.payload || {});
      result.push({
        file: file.getName(),
        ok: true,
        reportId: response && response.reportId || '',
        duplicate: Boolean(response && response.duplicate)
      });
    } catch (error) {
      result.push({
        file: file.getName(),
        ok: false,
        error: error && error.message ? error.message : String(error)
      });
    }
  }

  console.log(JSON.stringify(result));
  return result;
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

function pqrsGenerateMaintenanceId_(date, clientRequestId) {
  const prefix = Utilities.formatDate(
    date,
    Session.getScriptTimeZone() || PQRS_TIMEZONE,
    'yyyyMMdd-HHmmss'
  );
  const stableSource = pqrsSafeId_(clientRequestId);
  const suffix = stableSource
    ? pqrsHash_(stableSource).replace(/[^A-Za-z0-9]/g, '').slice(0, 5).toUpperCase()
    : Utilities.getUuid().replace(/-/g, '').slice(0, 5).toUpperCase();
  return 'MANT-' + prefix + '-' + suffix;
}


function pqrsSendMaintenanceClosureNotification_(report) {
  try {
    const reportId = safeTrimPQRS_(report.reportId) || 'MANT-N/A';
    const reportadoPor = safeTrimPQRS_(report.reportadoPor) || 'Residente';
    const correo = safeTrimPQRS_(report.correo);
    const ubicacion = safeTrimPQRS_(report.ubicacion) || 'No especificada';
    const descripcion = safeTrimPQRS_(report.descripcion) || 'Sin descripción';
    const responsable = safeTrimPQRS_(report.responsable) || 'Equipo de mantenimiento';
    const observaciones = safeTrimPQRS_(report.observaciones) || 'Atención completada satisfactoriamente.';
    const photoLinks = Array.isArray(report.photoLinks) ? report.photoLinks : [];
    const closureEvidenceUrl = safeTrimPQRS_(report.closureEvidenceUrl);
    const closedAt = report.closedAt instanceof Date ? report.closedAt : new Date();
    const closedAtStr = Utilities.formatDate(
      closedAt,
      Session.getScriptTimeZone() || PQRS_TIMEZONE,
      'yyyy-MM-dd HH:mm'
    );

    const closureEvidenceHtml = closureEvidenceUrl
      ? '<p style="margin: 0;"><a href="' + pqrsEscapeHtml_(closureEvidenceUrl) + '" style="color: #2c5f2d; text-decoration: underline; font-weight: 700; font-size: 14px;" target="_blank">📸 Ver fotografía de finalización (Cierre)</a></p>'
      : '<p style="margin: 0; color: #777;">Sin fotografía de cierre adjunta.</p>';

    const initialPhotosHtml = photoLinks.length
      ? '<ul style="margin: 4px 0 0; padding-left: 20px;">' +
        photoLinks.map(function (url, index) {
          return '<li style="margin-bottom: 4px;"><a href="' + pqrsEscapeHtml_(url) + '" style="color: #4a7c4e; text-decoration: underline;" target="_blank">Ver fotografía inicial ' + (index + 1) + '</a></li>';
        }).join('') + '</ul>'
      : '<p style="margin: 0; color: #888;">Sin fotografías iniciales.</p>';

    const plainTextBody =
      'CLUB RESIDENCIAL BULEVAR VERDE\n' +
      'Notificación de Cierre: Solicitud de Mantenimiento Finalizada\n\n' +
      'Estimado(a) ' + reportadoPor + ',\n\n' +
      'Te informamos que tu solicitud de mantenimiento ha sido finalizada y cerrada.\n\n' +
      'RESUMEN DEL CIERRE:\n' +
      '• Número de Radicado: ' + reportId + '\n' +
      '• Ubicación: ' + ubicacion + '\n' +
      '• Problema reportado: ' + descripcion + '\n' +
      '• Estado: Cerrado / Resuelto\n' +
      '• Responsable de atención: ' + responsable + '\n' +
      '• Fecha de cierre: ' + closedAtStr + '\n' +
      '• Observaciones de gestión:\n' + observaciones + '\n\n' +
      (closureEvidenceUrl ? '• FOTO DE FINALIZACIÓN / CIERRE:\n' + closureEvidenceUrl + '\n\n' : '') +
      (photoLinks.length ? '• FOTOS INICIALES DEL REPORTE:\n' + photoLinks.map(function (u, i) { return 'Foto ' + (i + 1) + ': ' + u; }).join('\n') + '\n\n' : '') +
      'Agradecemos tu reporte y compromiso con el cuidado de las zonas comunes del club.\n\n' +
      'Atentamente,\n' +
      'Administración Club Residencial Bulevar Verde\n' +
      'Calle 70 # 59 265, Itagüí, Antioquia\n' +
      'bulevarverdeadmon@gmail.com';

    const htmlBody =
      '<div style="font-family: \'Segoe UI\', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">' +
        '<div style="background-color: #2c5f2d; color: #ffffff; padding: 24px 20px; text-align: center;">' +
          '<h2 style="margin: 0; font-size: 20px; font-weight: 700;">Club Residencial Bulevar Verde</h2>' +
          '<p style="margin: 6px 0 0; font-size: 14px; opacity: 0.9;">Solicitud de Mantenimiento Finalizada</p>' +
        '</div>' +
        '<div style="padding: 24px 20px; color: #333333; line-height: 1.6;">' +
          '<p style="font-size: 15px; margin-top: 0;">Hola <strong>' + pqrsEscapeHtml_(reportadoPor) + '</strong>,</p>' +
          '<p style="font-size: 14px;">Te informamos que tu reporte de mantenimiento ha sido <strong>atendido y cerrado</strong> por el equipo de administración:</p>' +
          '<div style="background-color: #f4fbf4; border-left: 4px solid #2c5f2d; border-radius: 4px; padding: 16px; margin: 20px 0;">' +
            '<table style="width: 100%; border-collapse: collapse; font-size: 14px;">' +
              '<tr><td style="padding: 6px 0; color: #555; width: 140px; font-weight: 600;">Radicado:</td><td style="padding: 6px 0; font-weight: 700; color: #2c5f2d;">' + pqrsEscapeHtml_(reportId) + '</td></tr>' +
              '<tr><td style="padding: 6px 0; color: #555; font-weight: 600;">Ubicación:</td><td style="padding: 6px 0;">' + pqrsEscapeHtml_(ubicacion) + '</td></tr>' +
              '<tr><td style="padding: 6px 0; color: #555; font-weight: 600;">Estado:</td><td style="padding: 6px 0;"><span style="background-color: #e8f5e9; color: #2e7d32; padding: 2px 8px; border-radius: 4px; font-weight: 700;">Cerrado / Resuelto</span></td></tr>' +
              '<tr><td style="padding: 6px 0; color: #555; font-weight: 600;">Responsable:</td><td style="padding: 6px 0;">' + pqrsEscapeHtml_(responsable) + '</td></tr>' +
              '<tr><td style="padding: 6px 0; color: #555; font-weight: 600;">Fecha de cierre:</td><td style="padding: 6px 0;">' + pqrsEscapeHtml_(closedAtStr) + '</td></tr>' +
              '<tr><td style="padding: 6px 0; color: #555; font-weight: 600; vertical-align: top;">Observaciones:</td><td style="padding: 6px 0; white-space: pre-line; background-color: #ffffff; padding: 10px; border-radius: 4px; border: 1px solid #dce8dd;">' + pqrsEscapeHtml_(observaciones) + '</td></tr>' +
              '<tr><td style="padding: 6px 0; color: #555; font-weight: 600; vertical-align: top;">Foto de cierre:</td><td style="padding: 6px 0;">' + closureEvidenceHtml + '</td></tr>' +
              '<tr><td style="padding: 6px 0; color: #555; font-weight: 600; vertical-align: top;">Fotos iniciales:</td><td style="padding: 6px 0;">' + initialPhotosHtml + '</td></tr>' +
            '</table>' +
          '</div>' +
          '<div style="text-align: center; margin: 24px 0 10px;">' +
            '<a href=\"' + PQRS_PUBLIC_BASE_URL + '/pqrs/consulta/?id=' + encodeURIComponent(reportId) + '" style="background-color: #2c5f2d; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 700; font-size: 14px; display: inline-block;" target="_blank">🔍 Ver detalle completo en línea</a>' +
          '</div>' +
          '<p style="font-size: 13px; color: #555; text-align: center; margin-top: 15px;">Muchas gracias por tu reporte y colaboración para mantener las instalaciones de nuestro club en óptimas condiciones.</p>' +
        '</div>' +
        '<div style="background-color: #f9f9f9; border-top: 1px solid #eeeeee; padding: 16px 20px; font-size: 12px; color: #777; text-align: center;">' +
          '<p style="margin: 0 0 4px;">Club Residencial Bulevar Verde • Itagüí, Antioquia</p>' +
          '<p style="margin: 0;">Este es un mensaje automático de notificación generado por el portal web.</p>' +
        '</div>' +
      '</div>';

    const isValidEmail = correo && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);
    const toRecipient = isValidEmail ? correo : PQRS_ADMIN_EMAIL;
    const ccRecipient = isValidEmail ? [PQRS_ADMIN_EMAIL, PQRS_CC_EMAIL].filter(Boolean).join(',') : '';

    enviarCorreoViaSancionesAPI_({
      to: toRecipient,
      cc: ccRecipient,
      subject: '[Bulevar Verde] Solicitud de mantenimiento finalizada - ' + reportId,
      body: plainTextBody,
      htmlBody: htmlBody
    });

    Logger.log(
      'Notificación de cierre enviada exitosamente para reporte ' + reportId +
      ' a ' + toRecipient + (ccRecipient ? ' (CC: ' + ccRecipient + ')' : '')
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
    const reportId = safeTrimPQRS_(report.reportId) || 'MANT-N/A';
    const reportadoPor = safeTrimPQRS_(report.reportadoPor) || 'Residente';
    const correo = safeTrimPQRS_(report.correo);
    const ubicacion = safeTrimPQRS_(report.ubicacion) || 'No especificada';
    const descripcion = safeTrimPQRS_(report.descripcion) || 'Sin descripción';
    const photoRecords = Array.isArray(report.photoRecords) ? report.photoRecords : [];
    const reportedAt = report.reportedAt instanceof Date ? report.reportedAt : new Date();
    const reportedAtStr = Utilities.formatDate(
      reportedAt,
      Session.getScriptTimeZone() || PQRS_TIMEZONE,
      'yyyy-MM-dd HH:mm'
    );

    const photoLinksHtml = photoRecords.length
      ? '<ul style="margin: 0; padding-left: 20px;">' +
        photoRecords.map(function (photo, index) {
          return '<li style="margin-bottom: 6px;"><a href="' + pqrsEscapeHtml_(photo.url) + '" style="color: #2c5f2d; text-decoration: underline; font-weight: 600;" target="_blank">Ver fotografía ' + (index + 1) + '</a></li>';
        }).join('') + '</ul>'
      : '<p style="margin: 0; color: #666;">Sin fotografías adjuntas.</p>';

    const photoText = photoRecords.length
      ? photoRecords.map(function (photo, index) {
          return 'Foto ' + (index + 1) + ': ' + photo.url;
        }).join('\n')
      : 'Sin fotografías adjuntas.';

    const plainTextBody =
      'CLUB RESIDENCIAL BULEVAR VERDE\n' +
      'Confirmación de Solicitud de Mantenimiento\n\n' +
      'Estimado(a) ' + reportadoPor + ',\n\n' +
      'Hemos recibido exitosamente tu reporte de mantenimiento para zonas comunes.\n\n' +
      'RESUMEN DEL REPORTE:\n' +
      '• Número de Radicado: ' + reportId + '\n' +
      '• Fecha y Hora: ' + reportedAtStr + '\n' +
      '• Ubicación: ' + ubicacion + '\n' +
      '• Descripción: ' + descripcion + '\n' +
      '• Estado Inicial: Abierto (En cola de revisión)\n\n' +
      'FOTOGRAFÍAS ADJUNTAS:\n' + photoText + '\n\n' +
      'CONSULTA EN LÍNEA:\n' +
      'Puedes consultar el avance en tiempo real en:\n' +
      PQRS_PUBLIC_BASE_URL + '/pqrs/consulta/?id=' + encodeURIComponent(reportId) + '\n\n' +
      'La administración y el equipo técnico revisarán la solicitud a la brevedad.\n' +
      'Te notificaremos por correo cuando haya novedades o cuando el caso sea cerrado.\n\n' +
      'Atentamente,\n' +
      'Administración Club Residencial Bulevar Verde\n' +
      'Calle 70 # 59 265, Itagüí, Antioquia\n' +
      'bulevarverdeadmon@gmail.com';

    const htmlBody =
      '<div style="font-family: \'Segoe UI\', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">' +
        '<div style="background-color: #2c5f2d; color: #ffffff; padding: 24px 20px; text-align: center;">' +
          '<h2 style="margin: 0; font-size: 20px; font-weight: 700;">Club Residencial Bulevar Verde</h2>' +
          '<p style="margin: 6px 0 0; font-size: 14px; opacity: 0.9;">Solicitud de Mantenimiento Recibida</p>' +
        '</div>' +
        '<div style="padding: 24px 20px; color: #333333; line-height: 1.6;">' +
          '<p style="font-size: 15px; margin-top: 0;">Hola <strong>' + pqrsEscapeHtml_(reportadoPor) + '</strong>,</p>' +
          '<p style="font-size: 14px;">Hemos registrado tu reporte de mantenimiento en las zonas comunes con el siguiente detalle:</p>' +
          '<div style="background-color: #f4fbf4; border-left: 4px solid #2c5f2d; border-radius: 4px; padding: 16px; margin: 20px 0;">' +
            '<table style="width: 100%; border-collapse: collapse; font-size: 14px;">' +
              '<tr><td style="padding: 6px 0; color: #555; width: 140px; font-weight: 600;">Radicado:</td><td style="padding: 6px 0; font-weight: 700; color: #2c5f2d;">' + pqrsEscapeHtml_(reportId) + '</td></tr>' +
              '<tr><td style="padding: 6px 0; color: #555; font-weight: 600;">Fecha y hora:</td><td style="padding: 6px 0;">' + pqrsEscapeHtml_(reportedAtStr) + '</td></tr>' +
              '<tr><td style="padding: 6px 0; color: #555; font-weight: 600;">Ubicación:</td><td style="padding: 6px 0;">' + pqrsEscapeHtml_(ubicacion) + '</td></tr>' +
              '<tr><td style="padding: 6px 0; color: #555; font-weight: 600;">Estado:</td><td style="padding: 6px 0;"><span style="background-color: #e8f5e9; color: #2e7d32; padding: 2px 8px; border-radius: 4px; font-weight: 700;">Abierto</span></td></tr>' +
              '<tr><td style="padding: 6px 0; color: #555; font-weight: 600; vertical-align: top;">Descripción:</td><td style="padding: 6px 0; white-space: pre-line;">' + pqrsEscapeHtml_(descripcion) + '</td></tr>' +
              '<tr><td style="padding: 6px 0; color: #555; font-weight: 600; vertical-align: top;">Fotografías:</td><td style="padding: 6px 0;">' + photoLinksHtml + '</td></tr>' +
            '</table>' +
          '</div>' +
          '<div style="text-align: center; margin: 24px 0 10px;">' +
            '<a href=\"' + PQRS_PUBLIC_BASE_URL + '/pqrs/consulta/?id=' + encodeURIComponent(reportId) + '" style="background-color: #2c5f2d; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 700; font-size: 14px; display: inline-block;" target="_blank">🔍 Consultar estado en línea</a>' +
          '</div>' +
          '<p style="font-size: 13px; color: #555; text-align: center; margin-top: 15px;">La administración y el personal de mantenimiento atenderán esta solicitud según la prioridad y disponibilidad de recursos. Te mantendremos informado.</p>' +
        '</div>' +
        '<div style="background-color: #f9f9f9; border-top: 1px solid #eeeeee; padding: 16px 20px; font-size: 12px; color: #777; text-align: center;">' +
          '<p style="margin: 0 0 4px;">Club Residencial Bulevar Verde • Itagüí, Antioquia</p>' +
          '<p style="margin: 0;">Este es un mensaje automático de confirmación generado por el portal web.</p>' +
        '</div>' +
      '</div>';

    const isValidEmail = correo && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);
    const toRecipient = isValidEmail ? correo : PQRS_ADMIN_EMAIL;
    const ccRecipient = isValidEmail ? [PQRS_ADMIN_EMAIL, PQRS_CC_EMAIL].filter(Boolean).join(',') : '';

    enviarCorreoViaSancionesAPI_({
      to: toRecipient,
      cc: ccRecipient,
      subject: '[Bulevar Verde] Solicitud de mantenimiento recibida - ' + reportId,
      body: plainTextBody,
      htmlBody: htmlBody
    });

    Logger.log(
      'Notificación de creación enviada exitosamente para reporte ' + reportId +
      ' a ' + toRecipient + (ccRecipient ? ' (CC: ' + ccRecipient + ')' : '')
    );
  } catch (error) {
    Logger.log(
      'El reporte se guardó, pero no fue posible enviar la notificación: ' +
      (error.message || String(error))
    );
  }
}

function pqrsSendMaintenanceInProgressNotification_(report) {
  try {
    const reportId = safeTrimPQRS_(report.reportId) || 'MANT-N/A';
    const reportadoPor = safeTrimPQRS_(report.reportadoPor) || 'Residente';
    const correo = safeTrimPQRS_(report.correo);
    const ubicacion = safeTrimPQRS_(report.ubicacion) || 'No especificada';
    const descripcion = safeTrimPQRS_(report.descripcion) || 'Sin descripción';
    const responsable = safeTrimPQRS_(report.responsable) || 'Equipo de mantenimiento';
    const observaciones = safeTrimPQRS_(report.observaciones);
    const attentionStartedAt = report.attentionStartedAt instanceof Date ? report.attentionStartedAt : new Date();
    const startedAtStr = Utilities.formatDate(
      attentionStartedAt,
      Session.getScriptTimeZone() || PQRS_TIMEZONE,
      'yyyy-MM-dd HH:mm'
    );

    const plainTextBody =
      'CLUB RESIDENCIAL BULEVAR VERDE\n' +
      'Notificación: Solicitud de Mantenimiento En Proceso\n\n' +
      'Estimado(a) ' + reportadoPor + ',\n\n' +
      'Te informamos que tu reporte de mantenimiento ha cambiado de estado y se encuentra actualmente EN PROCESO de atención.\n\n' +
      'DETALLE DE LA SOLICITUD:\n' +
      '• Número de Radicado: ' + reportId + '\n' +
      '• Ubicación: ' + ubicacion + '\n' +
      '• Problema reportado: ' + descripcion + '\n' +
      '• Estado actual: En proceso\n' +
      '• Responsable de atención: ' + responsable + '\n' +
      '• Fecha de inicio de atención: ' + startedAtStr + '\n' +
      (observaciones ? '• Nota inicial: ' + observaciones + '\n' : '') + '\n' +
      'CONSULTA EN LÍNEA:\n' +
      PQRS_PUBLIC_BASE_URL + '/pqrs/consulta/?id=' + encodeURIComponent(reportId) + '\n\n' +
      'El personal de mantenimiento se encuentra gestionando la solución. Te informaremos oportunamente cuando el caso sea finalizado.\n\n' +
      'Atentamente,\n' +
      'Administración Club Residencial Bulevar Verde\n' +
      'Calle 70 # 59 265, Itagüí, Antioquia\n' +
      'bulevarverdeadmon@gmail.com';

    const htmlBody =
      '<div style="font-family: \'Segoe UI\', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">' +
        '<div style="background-color: #1976d2; color: #ffffff; padding: 24px 20px; text-align: center;">' +
          '<h2 style="margin: 0; font-size: 20px; font-weight: 700;">Club Residencial Bulevar Verde</h2>' +
          '<p style="margin: 6px 0 0; font-size: 14px; opacity: 0.9;">Solicitud de Mantenimiento En Proceso</p>' +
        '</div>' +
        '<div style="padding: 24px 20px; color: #333333; line-height: 1.6;">' +
          '<p style="font-size: 15px; margin-top: 0;">Hola <strong>' + pqrsEscapeHtml_(reportadoPor) + '</strong>,</p>' +
          '<p style="font-size: 14px;">Te informamos que tu reporte de mantenimiento ha cambiado de estado y ahora está <strong>EN PROCESO</strong> de atención:</p>' +
          '<div style="background-color: #e3f2fd; border-left: 4px solid #1976d2; border-radius: 4px; padding: 16px; margin: 20px 0;">' +
            '<table style="width: 100%; border-collapse: collapse; font-size: 14px;">' +
              '<tr><td style="padding: 6px 0; color: #555; width: 140px; font-weight: 600;">Radicado:</td><td style="padding: 6px 0; font-weight: 700; color: #1976d2;">' + pqrsEscapeHtml_(reportId) + '</td></tr>' +
              '<tr><td style="padding: 6px 0; color: #555; font-weight: 600;">Ubicación:</td><td style="padding: 6px 0;">' + pqrsEscapeHtml_(ubicacion) + '</td></tr>' +
              '<tr><td style="padding: 6px 0; color: #555; font-weight: 600;">Estado:</td><td style="padding: 6px 0;"><span style="background-color: #bbdefb; color: #0d47a1; padding: 2px 8px; border-radius: 4px; font-weight: 700;">En proceso</span></td></tr>' +
              '<tr><td style="padding: 6px 0; color: #555; font-weight: 600;">Responsable:</td><td style="padding: 6px 0;">' + pqrsEscapeHtml_(responsable) + '</td></tr>' +
              '<tr><td style="padding: 6px 0; color: #555; font-weight: 600;">Fecha de atención:</td><td style="padding: 6px 0;">' + pqrsEscapeHtml_(startedAtStr) + '</td></tr>' +
              '<tr><td style="padding: 6px 0; color: #555; font-weight: 600; vertical-align: top;">Descripción:</td><td style="padding: 6px 0; white-space: pre-line;">' + pqrsEscapeHtml_(descripcion) + '</td></tr>' +
              (observaciones ? '<tr><td style="padding: 6px 0; color: #555; font-weight: 600; vertical-align: top;">Observaciones:</td><td style="padding: 6px 0; white-space: pre-line;">' + pqrsEscapeHtml_(observaciones) + '</td></tr>' : '') +
            '</table>' +
          '</div>' +
          '<div style="text-align: center; margin: 24px 0 10px;">' +
            '<a href=\"' + PQRS_PUBLIC_BASE_URL + '/pqrs/consulta/?id=' + encodeURIComponent(reportId) + '" style="background-color: #1976d2; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 700; font-size: 14px; display: inline-block;" target="_blank">🔍 Consultar avance en línea</a>' +
          '</div>' +
          '<p style="font-size: 13px; color: #555; text-align: center; margin-top: 15px;">El personal de mantenimiento se encuentra trabajando en la solución. Te informaremos oportunamente cuando el caso sea finalizado.</p>' +
        '</div>' +
        '<div style="background-color: #f9f9f9; border-top: 1px solid #eeeeee; padding: 16px 20px; font-size: 12px; color: #777; text-align: center;">' +
          '<p style="margin: 0 0 4px;">Club Residencial Bulevar Verde • Itagüí, Antioquia</p>' +
          '<p style="margin: 0;">Este es un mensaje automático de notificación generado por el portal web.</p>' +
        '</div>' +
      '</div>';

    const isValidEmail = correo && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);
    const toRecipient = isValidEmail ? correo : PQRS_ADMIN_EMAIL;
    const ccRecipient = isValidEmail ? [PQRS_ADMIN_EMAIL, PQRS_CC_EMAIL].filter(Boolean).join(',') : '';

    enviarCorreoViaSancionesAPI_({
      to: toRecipient,
      cc: ccRecipient,
      subject: '[Bulevar Verde] Solicitud de mantenimiento en proceso - ' + reportId,
      body: plainTextBody,
      htmlBody: htmlBody
    });

    Logger.log(
      'Notificación de En proceso enviada exitosamente para reporte ' + reportId +
      ' a ' + toRecipient + (ccRecipient ? ' (CC: ' + ccRecipient + ')' : '')
    );
  } catch (error) {
    Logger.log(
      'No fue posible enviar la notificación de En proceso: ' +
      (error.message || String(error))
    );
  }
}

function pqrsEscapeHtml_(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/***************************************
 * SEGURIDAD Y HELPERS
 ***************************************/
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

  Logger.log('Trigger PQRS (onFormSubmit) creado correctamente.');
}

function eliminarTriggersPQRS_() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    const handler = trigger.getHandlerFunction();
    if (handler === 'onFormSubmit' || handler === 'onSpreadsheetEditMantenimiento') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

/***************************************
 * NOTIFICACIONES VÍA API BULEVAR VERDE
 ***************************************/
/**
 * Envía un correo a través del API de Bulevar Verde.
 * Siempre incluye replyTo: bulevarverdeadmon@gmail.com. "to" y "cc" viajan en mensajes separados.
 *
 * @param {Object} options - { to, cc (opcional), subject, htmlBody, body (opcional), replyTo (opcional) }
 * @return {boolean} - true si fue enviado/encolado exitosamente, false si falló
 */
function enviarCorreoViaSancionesAPI_(options) {
  const principales = pqrsSplitEmails_(options.to);
  const copias = pqrsSplitEmails_(options.cc).filter(function (email) {
    return principales.indexOf(email) === -1;
  });

  if (!principales.length && !copias.length) {
    Logger.log('enviarCorreoViaSancionesAPI_: No se especificaron destinatarios válidos.');
    return false;
  }

  // El API (POST /api/v1/notificaciones/enviar) no tiene campo "cc": todo lo que va en
  // "to" lo ven todos los destinatarios. Cada grupo se envía en su propio mensaje para
  // que el residente no vea las direcciones internas ni al revés.
  let enviado = false;
  [principales, copias].forEach(function (grupo) {
    if (grupo.length && pqrsEnviarGrupoViaAPI_(grupo, options)) enviado = true;
  });
  return enviado;
}

function pqrsSplitEmails_(value) {
  const emails = [];
  if (!value) return emails;

  String(value).split(',').forEach(function (email) {
    const clean = safeTrimPQRS_(email);
    if (clean && emails.indexOf(clean) === -1) emails.push(clean);
  });
  return emails;
}

function pqrsEnviarGrupoViaAPI_(destinatarios, options) {
  const apiToken = PropertiesService.getScriptProperties().getProperty('SANCIONES_API_TOKEN');
  const apiEndpoint = API_BULEVAR_VERDE_BASE_URL + '/api/v1/notificaciones/enviar';

  // Límites del API: asunto <= 200, html <= 200.000, texto <= 100.000 y hasta 100 destinatarios.
  const payload = {
    to: destinatarios,
    subject: String(options.subject || '').slice(0, 200),
    replyTo: options.replyTo || 'bulevarverdeadmon@gmail.com'
  };
  if (options.htmlBody) payload.html = String(options.htmlBody).slice(0, 200000);
  if (options.body) payload.text = String(options.body).slice(0, 100000);

  function respaldoMailApp(motivo) {
    // MailApp tiene cuota diaria: solo se usa si el API no aceptó el mensaje.
    try {
      MailApp.sendEmail({
        to: destinatarios.join(','),
        subject: options.subject,
        body: options.body || '',
        htmlBody: options.htmlBody || ''
      });
      Logger.log('enviarCorreoViaSancionesAPI_: respaldo con MailApp ejecutado (' + motivo + ').');
      return true;
    } catch (fallbackErr) {
      Logger.log('enviarCorreoViaSancionesAPI_: el respaldo con MailApp también falló: ' + fallbackErr);
      return false;
    }
  }

  try {
    const response = UrlFetchApp.fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + (apiToken || ''),
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
      timeout: 15
    });

    const statusCode = response.getResponseCode();
    if (statusCode === 200 || statusCode === 202) {
      Logger.log('enviarCorreoViaSancionesAPI_: correo enviado/encolado exitosamente para ' + destinatarios.join(', '));
      return true;
    }

    Logger.log('enviarCorreoViaSancionesAPI_: error HTTP ' + statusCode + ' para ' + destinatarios.join(', ') + ': ' + response.getContentText());
    return respaldoMailApp('HTTP ' + statusCode);
  } catch (error) {
    Logger.log('enviarCorreoViaSancionesAPI_: error enviando correo para ' + destinatarios.join(', ') + ': ' + error);
    return respaldoMailApp('excepción');
  }
}
