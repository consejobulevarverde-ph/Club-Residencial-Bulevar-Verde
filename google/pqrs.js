/***************************************
 * PQRS Y MANTENIMIENTO
 * CLUB RESIDENCIAL BULEVAR VERDE
 ***************************************/

const PQRS_VERSION = '2.0.0-mantenimiento-offline';
const PQRS_TIMEZONE = 'America/Bogota';

const PQRS_ADMIN_EMAIL = 'bulevarverdeadmon@gmail.com';
const PQRS_CC_EMAIL = 'consejo.bulevarverde@gmail.com';
const PQRS_FORM_SHEET_NAME = 'Respuestas de formulario 1';

const MANTENIMIENTO_SHEET_NAME = 'Reportes Mantenimiento';
const MANTENIMIENTO_FOLDER_NAME = 'Reportes Mantenimiento - Evidencias';
const MANTENIMIENTO_MAX_PHOTOS = 3;
const MANTENIMIENTO_MAX_IMAGE_BYTES = 2 * 1024 * 1024;

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
      cc: PQRS_CC_EMAIL,
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
        verificarReporteMantenimiento: 'verificarReporteMantenimiento'
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
        } else {
          runner.verificarReporteMantenimiento(payload, event.origin);
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

  const sheet = pqrsEnsureMaintenanceSheet_(pqrsGetSpreadsheet_());
  const existing = pqrsFindMaintenanceReport_(sheet, clientRequestId);

  return {
    ok: true,
    exists: !!existing,
    reportId: existing ? existing.reportId : ''
  };
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

  sheet.getRange('C:D').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  sheet.getRange('Q:R').setNumberFormat('yyyy-mm-dd hh:mm:ss');

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

    MailApp.sendEmail({
      to: PQRS_ADMIN_EMAIL,
      cc: PQRS_CC_EMAIL,
      subject: '[Bulevar Verde] Nuevo reporte de mantenimiento - ' + report.reportId,
      body: body
    });
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
