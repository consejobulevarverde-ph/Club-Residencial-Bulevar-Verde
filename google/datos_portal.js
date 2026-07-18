/**
 * PORTAL DE DATOS PERSONALES - CLUB RESIDENCIAL BULEVAR VERDE
 * Complemento para datos_maestros_info_aptos_v3.gs
 *
 * Arquitectura:
 * - Hugo/GitHub Pages aloja las interfaces públicas.
 * - Esta Web App sirve únicamente un puente HTML embebido en iframe.
 * - El puente usa google.script.run; no expone datos por GET ni JSONP.
 * - Los residentes se autentican con apartamento, documento y una pregunta
 *   de selección múltiple sobre su correo registrado.
 * - Administración y vigilancia conservan la autenticación por código OTP.
 * - Las modificaciones del residente crean solicitudes; no alteran directamente
 *   las tablas generadas por Datos Maestros.
 * - La administración aprueba o rechaza. Las aprobaciones se almacenan como
 *   datos vigentes del portal y sobreviven a reconstrucciones del maestro.
 *
 * Requiere estar en el MISMO proyecto que datos_maestros_info_aptos_v3.gs.
 */

const PORTAL_VERSION = '1.4.1-admin-edicion-unidad-propietarios';
const PORTAL_TIMEZONE = 'America/Bogota';

const PORTAL_SHEETS = Object.freeze({
  USERS: 'Usuarios_Portal',
  REQUESTS: 'Solicitudes_Actualizacion',
  APPROVED: 'Datos_Aprobados_Portal',
  AUDIT: 'Portal_Auditoria',
  VEHICLE_OVERRIDES: 'Vehiculos_Overrides'
});

const PORTAL_HEADERS = Object.freeze({
  USERS: [
    'Email', 'Nombre', 'Rol', 'Activo', 'Observaciones', 'FechaActualizacion'
  ],
  REQUESTS: [
    'SolicitudID', 'FechaSolicitud', 'UnidadID', 'EmailAutenticado',
    'PersonaSolicitanteID', 'Secciones', 'DatosAnterioresJSON',
    'DatosPropuestosJSON', 'ObservacionesResidente', 'Estado',
    'FechaDecision', 'UsuarioDecision', 'ObservacionesDecision',
    'FechaAplicacion', 'ResultadoAplicacion', 'VersionPortal'
  ],
  APPROVED: [
    'RegistroID', 'UnidadID', 'Seccion', 'DatosJSON', 'Estado',
    'SolicitudID', 'FechaAprobacion', 'AprobadoPor', 'FechaActualizacion'
  ],
  AUDIT: [
    'EventoID', 'FechaHora', 'Accion', 'Rol', 'Email', 'UnidadID',
    'Resultado', 'Detalle', 'VersionPortal'
  ],
  VEHICLE_OVERRIDES: [
    'OverrideID', 'VehiculoID', 'Placa', 'UnidadOrigenID',
    'UnidadDestinoID', 'Accion', 'TipoVehiculo', 'TipoVinculo',
    'Estado', 'SolicitudID', 'Motivo', 'Usuario',
    'FechaCreacion', 'FechaActualizacion'
  ]
});

const PORTAL_ROLE = Object.freeze({
  RESIDENTE: 'RESIDENTE',
  ADMIN: 'ADMIN',
  VIGILANCIA: 'VIGILANCIA'
});

const PORTAL_IDENTITY_TYPE = Object.freeze({
  PROPIETARIO: 'PROPIETARIO',
  RESIDENTE_PRINCIPAL: 'RESIDENTE_PRINCIPAL',
  RESIDENTE: 'RESIDENTE'
});

const PORTAL_UNIDENTIFIED_UNIT_ID = '9999';

const PORTAL_VEHICLE_RECOGNITION = Object.freeze({
  PROPIO: 'PROPIO',
  VISITANTE: 'VISITANTE_AUTORIZADO',
  NO_RECONOCIDO: 'NO_RECONOCIDO',
  PENDIENTE: 'PENDIENTE_CONFIRMAR'
});

const PORTAL_REQUEST_STATUS = Object.freeze({
  PENDING: 'PENDIENTE',
  APPROVED: 'APROBADA',
  REJECTED: 'RECHAZADA'
});

const PORTAL_SECTIONS = Object.freeze({
  CONTACTO: 'CONTACTO',
  RESIDENTES: 'RESIDENTES',
  VEHICULOS: 'VEHICULOS',
  MASCOTAS: 'MASCOTAS',
  EMERGENCIA: 'EMERGENCIA'
});

const PORTAL_ALLOWED_SECTIONS = Object.freeze([
  PORTAL_SECTIONS.CONTACTO,
  PORTAL_SECTIONS.RESIDENTES,
  PORTAL_SECTIONS.VEHICULOS,
  PORTAL_SECTIONS.MASCOTAS,
  PORTAL_SECTIONS.EMERGENCIA
]);

const PORTAL_CONFIG_DEFAULTS = Object.freeze([
  ['PORTAL_ALLOWED_ORIGINS', '*', 'Orígenes HTTPS autorizados, separados por coma.', 'SI'],
  ['PORTAL_OTP_MINUTES', '10', 'Vigencia del código OTP.', 'SI'],
  ['PORTAL_SESSION_MINUTES_RESIDENTE', '30', 'Vigencia de sesión de residente.', 'SI'],
  ['PORTAL_SESSION_MINUTES_INTERNO', '60', 'Vigencia de sesión de administración y vigilancia.', 'SI'],
  ['PORTAL_SECURITY_CHALLENGE_MINUTES', '10', 'Vigencia de la pregunta de seguridad del módulo de datos personales.', 'SI'],
  ['PORTAL_MAX_SECURITY_ATTEMPTS', '5', 'Intentos máximos para responder la pregunta de seguridad.', 'SI'],
  ['PORTAL_MAX_SECURITY_CHALLENGES_PER_HOUR', '8', 'Máximo de retos de seguridad por apartamento y documento cada hora.', 'SI'],
  ['PORTAL_MAX_OTP_ATTEMPTS', '5', 'Intentos máximos por código.', 'SI'],
  ['PORTAL_MAX_OTP_SENDS_PER_HOUR', '4', 'Máximo de envíos de código por hora por identidad.', 'SI'],
  ['PORTAL_ADMIN_TEST_FIXED_CODE_ENABLED', 'SI', 'Modo de pruebas: administración usa código fijo y no recibe correo OTP.', 'SI'],
  ['PORTAL_ADMIN_TEST_FIXED_CODE', '841244', 'Código fijo de seis dígitos para administración durante pruebas.', 'SI'],
  ['PORTAL_REPLY_TO', 'bulevarverdeadmon@gmail.com', 'Correo de respuesta del portal.', 'SI'],
  ['PORTAL_FROM_NAME', 'Administración Bulevar Verde', 'Nombre del remitente.', 'SI'],
  ['PORTAL_SEED_ADMIN_EMAIL', 'bulevarverdeadmon@gmail.com', 'Usuario administrador inicial.', 'SI']
]);

/***************************************
 * INSTALACIÓN Y ESTRUCTURA
 ***************************************/
function portalCrearEstructura() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const properties = PropertiesService.getScriptProperties();
    const configuredId = portalSafeTrim_(
      properties.getProperty('PORTAL_MASTER_SPREADSHEET_ID')
    );

    let ss = null;

    // Primero utiliza el archivo maestro ya configurado.
    if (configuredId) {
      try {
        ss = SpreadsheetApp.openById(configuredId);
      } catch (error) {
        console.warn(
          'No fue posible abrir PORTAL_MASTER_SPREADSHEET_ID=' +
          configuredId + ': ' + (error.message || String(error))
        );
      }
    }

    // Si datos maestros está instalado en el mismo proyecto, reutiliza su archivo.
    if (!ss && typeof dmGetMasterSpreadsheet_ === 'function') {
      try {
        ss = dmGetMasterSpreadsheet_();
      } catch (error) {
        console.warn(
          'No fue posible obtener el archivo desde datos maestros: ' +
          (error.message || String(error))
        );
      }
    }

    // Último recurso para scripts vinculados a una hoja.
    if (!ss) {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    }

    if (!ss) {
      throw new Error(
        'No fue posible identificar el archivo maestro. Configura la propiedad ' +
        'PORTAL_MASTER_SPREADSHEET_ID con el ID de la hoja Info aptos.'
      );
    }

    properties.setProperty('PORTAL_MASTER_SPREADSHEET_ID', ss.getId());

    portalEnsureSheet_(ss, PORTAL_SHEETS.USERS, PORTAL_HEADERS.USERS);
    portalEnsureSheet_(ss, PORTAL_SHEETS.REQUESTS, PORTAL_HEADERS.REQUESTS);
    portalEnsureSheet_(ss, PORTAL_SHEETS.APPROVED, PORTAL_HEADERS.APPROVED);
    portalEnsureSheet_(ss, PORTAL_SHEETS.AUDIT, PORTAL_HEADERS.AUDIT);
    portalEnsureSheet_(ss, PORTAL_SHEETS.VEHICLE_OVERRIDES, PORTAL_HEADERS.VEHICLE_OVERRIDES);

    portalEnsureConfig_(ss);
    portalSeedAdmin_(ss);
    portalEnsureSecret_();
    portalFormatSheets_(ss);

    portalAudit_({
      action: 'CREAR_ESTRUCTURA',
      role: 'SISTEMA',
      email: Session.getActiveUser().getEmail() || '',
      unitId: '',
      result: 'OK',
      detail: 'Estructura del portal creada o validada.'
    });

    SpreadsheetApp.flush();

    const result = {
      ok: true,
      spreadsheetId: ss.getId(),
      spreadsheetName: ss.getName(),
      message: 'Estructura creada o validada. Revisa Config y Usuarios_Portal antes de desplegar la Web App.'
    };

    // No utiliza SpreadsheetApp.getUi(), por lo que funciona desde el editor,
    // proyectos independientes, Web Apps y ejecuciones sin interfaz gráfica.
    console.log(JSON.stringify(result));
    return result;
  } finally {
    if (lock.hasLock()) {
      lock.releaseLock();
    }
  }
}

function portalFormatSheets_(ss) {
  const styles = {
    header: '#2c5f2d',
    white: '#ffffff'
  };

  Object.keys(PORTAL_SHEETS).forEach(function (key) {
    const sheet = ss.getSheetByName(PORTAL_SHEETS[key]);
    if (!sheet || sheet.getLastColumn() < 1) return;
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, sheet.getLastColumn())
      .setFontWeight('bold')
      .setFontColor(styles.white)
      .setBackground(styles.header)
      .setWrap(true);
  });
}

function portalEnsureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sheet;
  }

  const current = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length))
    .getValues()[0]
    .map(portalSafeTrim_);

  headers.forEach(function (header, index) {
    if (current[index] !== header) {
      sheet.getRange(1, index + 1).setValue(header);
    }
  });

  return sheet;
}

/**
 * Obtiene una hoja operativa del portal y la crea/repara si falta.
 * Evita errores genéricos como "Cannot read properties of null (reading 'appendRow')".
 */
function portalGetRequiredSheet_(key) {
  const name = PORTAL_SHEETS[key];
  const headers = PORTAL_HEADERS[key];

  if (!name || !headers) {
    throw new Error('Hoja de portal no configurada: ' + key);
  }

  return portalEnsureSheet_(portalGetSpreadsheet_(), name, headers);
}

/** Diagnóstico manual seguro para validar la instalación del portal. */
function portalDiagnosticarEstructura() {
  const ss = portalGetSpreadsheet_();
  const sheets = {};

  Object.keys(PORTAL_SHEETS).forEach(function (key) {
    const name = PORTAL_SHEETS[key];
    const sheet = ss.getSheetByName(name);
    sheets[key] = {
      nombre: name,
      existe: !!sheet,
      filas: sheet ? sheet.getLastRow() : 0,
      columnas: sheet ? sheet.getLastColumn() : 0
    };
  });

  return {
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    sheets: sheets,
    allowedOrigins: portalGetAllowedOrigins_(),
    versionPortal: PORTAL_VERSION
  };
}

function portalEnsureConfig_(ss) {
  const sheetName = typeof DM_SHEETS !== 'undefined' && DM_SHEETS.CONFIG
    ? DM_SHEETS.CONFIG
    : 'Config';

  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, 4).setValues([['Clave', 'Valor', 'Descripcion', 'Editable']]);
  }

  const data = sheet.getDataRange().getValues();
  const existing = {};
  data.slice(1).forEach(function (row) {
    const key = portalSafeTrim_(row[0]);
    if (key) existing[key] = true;
  });

  const missing = PORTAL_CONFIG_DEFAULTS.filter(function (row) {
    return !existing[row[0]];
  });

  if (missing.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, missing.length, 4).setValues(missing);
  }
}

function portalSeedAdmin_(ss) {
  const config = portalGetConfig_();
  const email = portalNormalizeEmail_(config.PORTAL_SEED_ADMIN_EMAIL || '');
  if (!email) return;

  const sheet = portalGetRequiredSheet_('USERS');
  const rows = portalReadObjectsFromSheet_(sheet);
  const exists = rows.some(function (row) {
    return portalNormalizeEmail_(row.Email) === email;
  });

  if (!exists) {
    sheet.appendRow([
      email,
      'Administración',
      PORTAL_ROLE.ADMIN,
      'SI',
      'Usuario inicial creado por portalCrearEstructura().',
      portalNow_()
    ]);
  }
}

/** Activa explícitamente el código fijo de administración para pruebas. */
function portalActivarCodigoFijoAdminPruebas() {
  return portalGuardarConfigCodigoFijoAdminPruebas_(true, '841244');
}

/** Desactiva el código fijo y restaura el envío normal de OTP a administración. */
function portalDesactivarCodigoFijoAdminPruebas() {
  return portalGuardarConfigCodigoFijoAdminPruebas_(false, null);
}

function portalGuardarConfigCodigoFijoAdminPruebas_(enabled, code) {
  const ss = portalGetSpreadsheet_();
  portalEnsureConfig_(ss);

  const sheetName = typeof DM_SHEETS !== 'undefined' && DM_SHEETS.CONFIG
    ? DM_SHEETS.CONFIG
    : 'Config';
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('No se encontró la hoja Config.');

  const updates = {
    PORTAL_ADMIN_TEST_FIXED_CODE_ENABLED: enabled ? 'SI' : 'NO'
  };

  if (code !== null && code !== undefined) {
    const normalizedCode = portalSafeTrim_(code).replace(/\D/g, '');
    if (!/^\d{6}$/.test(normalizedCode)) {
      throw new Error('El código fijo de pruebas debe tener exactamente seis dígitos.');
    }
    updates.PORTAL_ADMIN_TEST_FIXED_CODE = normalizedCode;
  }

  const lastRow = Math.max(sheet.getLastRow(), 1);
  const values = lastRow > 1
    ? sheet.getRange(2, 1, lastRow - 1, 4).getValues()
    : [];
  const rowsByKey = {};

  values.forEach(function (row, index) {
    const key = portalSafeTrim_(row[0]);
    if (key) rowsByKey[key] = index + 2;
  });

  Object.keys(updates).forEach(function (key) {
    const rowNumber = rowsByKey[key];
    if (rowNumber) {
      sheet.getRange(rowNumber, 2).setValue(updates[key]);
    } else {
      sheet.appendRow([
        key,
        updates[key],
        key === 'PORTAL_ADMIN_TEST_FIXED_CODE_ENABLED'
          ? 'Modo de pruebas: administración usa código fijo y no recibe correo OTP.'
          : 'Código fijo de seis dígitos para administración durante pruebas.',
        'SI'
      ]);
    }
  });

  SpreadsheetApp.flush();

  return {
    ok: true,
    enabled: enabled,
    code: enabled
      ? portalGetAdminFixedOtpTestCode_(portalGetConfig_())
      : '',
    message: enabled
      ? 'Código fijo de administración activado para pruebas. No se enviarán correos OTP al rol ADMIN.'
      : 'Código fijo desactivado. La administración volverá a recibir OTP por correo.'
  };
}

/***************************************
 * WEB APP / PUENTE PARA HUGO
 ***************************************/
function doGet() {
  const allowedOrigins = portalGetAllowedOrigins_();
  const html = portalBuildBridgeHtml_(allowedOrigins);

  return HtmlService.createHtmlOutput(html)
    .setTitle('Puente seguro - Bulevar Verde')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function portalBuildBridgeHtml_(allowedOrigins) {
  const originsJson = JSON.stringify(allowedOrigins);

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Puente seguro</title>
</head>
<body>
  <p id="status">Conectando…</p>
  <script>
    (function () {
      'use strict';
      const allowedOrigins = ${originsJson};
      const status = document.getElementById('status');
      const actionMap = {
        solicitarCodigo: 'portalSolicitarCodigo',
        validarCodigo: 'portalValidarCodigo',
        iniciarAutenticacionDatos: 'portalIniciarAutenticacionDatos',
        validarAutenticacionDatos: 'portalValidarAutenticacionDatos',
        cerrarSesion: 'portalCerrarSesion',
        perfilResidente: 'portalObtenerPerfilResidente',
        enviarSolicitud: 'portalEnviarSolicitudActualizacion',
        dashboardAdmin: 'portalObtenerDashboardAdmin',
        buscarAdmin: 'portalBuscarAdministracion',
        perfilAdmin: 'portalObtenerPerfilAdministracion',
        actualizarApartamentoAdmin: 'portalActualizarApartamentoAdministracion',
        listarSolicitudes: 'portalListarSolicitudes',
        resolverSolicitud: 'portalResolverSolicitud',
        listarVehiculosSinIdentificar: 'portalListarVehiculosSinIdentificar',
        gestionarVehiculoSinIdentificar: 'portalGestionarVehiculoSinIdentificar',
        buscarVigilancia: 'portalBuscarVigilancia',
        registrarResidenteVigilancia: 'portalRegistrarResidenteVigilancia'
      };

      function originAllowed(origin) {
        return (
          allowedOrigins.indexOf('*') !== -1 ||
          allowedOrigins.indexOf(origin) !== -1
        );
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

        // La solicitud debe venir de la página Hugo superior.
        if (event.source !== window.top) return;
        if (!originAllowed(event.origin)) return;
        if (message.type !== 'PORTAL_BV_REQUEST') return;

        const serverFunction = actionMap[message.action];

        if (!serverFunction) {
          reply(
            event.origin,
            message.requestId,
            false,
            null,
            'Acción no permitida.'
          );
          return;
        }

        const payload = message.payload || {};

        const runner = google.script.run
          .withSuccessHandler(function (result) {
            // Evita que el cliente trate una respuesta nula como un perfil válido.
            if (result === null || typeof result === 'undefined') {
              reply(
                event.origin,
                message.requestId,
                false,
                null,
                'El servicio no devolvió datos. Revisa la versión publicada de Apps Script.'
              );
              return;
            }

            reply(event.origin, message.requestId, true, result, '');
          })
          .withFailureHandler(function (failure) {
            const text =
              failure && failure.message
                ? failure.message
                : String(failure || 'Error inesperado');

            reply(event.origin, message.requestId, false, null, text);
          });

        switch (serverFunction) {
          case 'portalSolicitarCodigo':
            runner.portalSolicitarCodigo(payload, event.origin);
            break;
          case 'portalValidarCodigo':
            runner.portalValidarCodigo(payload, event.origin);
            break;
          case 'portalIniciarAutenticacionDatos':
            runner.portalIniciarAutenticacionDatos(payload, event.origin);
            break;
          case 'portalValidarAutenticacionDatos':
            runner.portalValidarAutenticacionDatos(payload, event.origin);
            break;
          case 'portalCerrarSesion':
            runner.portalCerrarSesion(payload, event.origin);
            break;
          case 'portalObtenerPerfilResidente':
            runner.portalObtenerPerfilResidente(payload, event.origin);
            break;
          case 'portalEnviarSolicitudActualizacion':
            runner.portalEnviarSolicitudActualizacion(payload, event.origin);
            break;
          case 'portalObtenerDashboardAdmin':
            runner.portalObtenerDashboardAdmin(payload, event.origin);
            break;
          case 'portalBuscarAdministracion':
            runner.portalBuscarAdministracion(payload, event.origin);
            break;
          case 'portalObtenerPerfilAdministracion':
            runner.portalObtenerPerfilAdministracion(payload, event.origin);
            break;
          case 'portalActualizarApartamentoAdministracion':
            runner.portalActualizarApartamentoAdministracion(payload, event.origin);
            break;
          case 'portalListarSolicitudes':
            runner.portalListarSolicitudes(payload, event.origin);
            break;
          case 'portalResolverSolicitud':
            runner.portalResolverSolicitud(payload, event.origin);
            break;
          case 'portalListarVehiculosSinIdentificar':
            runner.portalListarVehiculosSinIdentificar(payload, event.origin);
            break;
          case 'portalGestionarVehiculoSinIdentificar':
            runner.portalGestionarVehiculoSinIdentificar(payload, event.origin);
            break;
          case 'portalBuscarVigilancia':
            runner.portalBuscarVigilancia(payload, event.origin);
            break;
          case 'portalRegistrarResidenteVigilancia':
            runner.portalRegistrarResidenteVigilancia(payload, event.origin);
            break;
          default:
            reply(
              event.origin,
              message.requestId,
              false,
              null,
              'Acción no permitida.'
            );
        }
      });

      if (allowedOrigins.indexOf('*') !== -1) {
        window.top.postMessage({
          type: 'PORTAL_BV_READY'
        }, '*');
      } else {
        allowedOrigins.forEach(function (origin) {
          window.top.postMessage({
            type: 'PORTAL_BV_READY'
          }, origin);
        });
      }
      status.textContent = 'Puente disponible.';
    }());
  </script>
</body>
</html>`;
}

/***************************************
 * AUTENTICACIÓN OTP
 ***************************************/
function portalSolicitarCodigo(payload, origin) {
  portalAssertOrigin_(origin);
  payload = payload || {};

  const role = portalNormalizeRole_(payload.role);

  if (role === PORTAL_ROLE.RESIDENTE) {
    throw new Error(
      'El módulo de datos personales utiliza preguntas de seguridad y no envía códigos por correo.'
    );
  }

  const email = portalNormalizeEmail_(payload.email);
  let unitId = '';
  let authorized = false;

  if (!email || !role) {
    throw new Error('Datos de autenticación incompletos.');
  }

  if (role === PORTAL_ROLE.RESIDENTE) {
    unitId = portalNormalizeUnitInput_(payload.torre, payload.apartamento, payload.unidadId);
    authorized = !!unitId && portalResidentEmailAuthorized_(unitId, email);
  } else {
    authorized = portalInternalUserAuthorized_(email, role);
  }

  const config = portalGetConfig_();
  const adminTestMode = role === PORTAL_ROLE.ADMIN &&
    portalAdminFixedOtpTestEnabled_(config);
  const identity = [role, unitId, email].join('|');

  // Durante las pruebas de administración no se envían correos y tampoco se
  // consume la cuota de envíos. Residentes y vigilancia mantienen el flujo normal.
  if (!(authorized && adminTestMode)) {
    portalAssertSendRate_(identity);
  }

  // La respuesta sigue siendo genérica para identidades no autorizadas.
  if (authorized) {
    const code = adminTestMode
      ? portalGetAdminFixedOtpTestCode_(config)
      : portalGenerateOtp_();
    const minutes = portalPositiveInt_(config.PORTAL_OTP_MINUTES, 10);
    const maxAttempts = portalPositiveInt_(config.PORTAL_MAX_OTP_ATTEMPTS, 5);
    const record = {
      role: role,
      email: email,
      unitId: unitId,
      codeHash: portalHash_(code + '|' + portalGetSecret_()),
      attempts: 0,
      maxAttempts: maxAttempts,
      expiresAt: Date.now() + minutes * 60000,
      testMode: adminTestMode
    };

    CacheService.getScriptCache().put(
      portalOtpCacheKey_(identity),
      JSON.stringify(record),
      Math.min(minutes * 60, 21600)
    );

    if (adminTestMode) {
      portalAudit_({
        action: 'OTP_SOLICITADO', role: role, email: email, unitId: unitId,
        result: 'CODIGO_FIJO_PRUEBAS',
        detail: 'Modo de pruebas activo: no se envió correo OTP a administración.'
      });
    } else {
      portalSendOtpEmail_(email, code, role, unitId, minutes);
      portalAudit_({
        action: 'OTP_SOLICITADO', role: role, email: email, unitId: unitId,
        result: 'ENVIADO', detail: 'Código enviado a identidad autorizada.'
      });
    }
  } else {
    portalAudit_({
      action: 'OTP_SOLICITADO', role: role, email: email, unitId: unitId,
      result: 'NO_AUTORIZADO', detail: 'No se envió código.'
    });
  }

  return {
    ok: true,
    message: authorized && adminTestMode
      ? 'Modo de pruebas activo para administración. Usa el código fijo configurado.'
      : 'Si los datos coinciden con nuestros registros, recibirás un código de verificación.',
    expiresMinutes: portalPositiveInt_(config.PORTAL_OTP_MINUTES, 10),
    testMode: authorized && adminTestMode
  };
}

function portalValidarCodigo(payload, origin) {
  portalAssertOrigin_(origin);
  payload = payload || {};

  const role = portalNormalizeRole_(payload.role);

  if (role === PORTAL_ROLE.RESIDENTE) {
    throw new Error(
      'El módulo de datos personales utiliza preguntas de seguridad y no valida códigos OTP.'
    );
  }

  const email = portalNormalizeEmail_(payload.email);
  const code = portalSafeTrim_(payload.code).replace(/\D/g, '');
  let unitId = '';

  if (role === PORTAL_ROLE.RESIDENTE) {
    unitId = portalNormalizeUnitInput_(payload.torre, payload.apartamento, payload.unidadId);
  }

  if (!role || !email || !/^\d{6}$/.test(code)) {
    throw new Error('Código o datos de acceso inválidos.');
  }

  const identity = [role, unitId, email].join('|');
  const cache = CacheService.getScriptCache();
  const key = portalOtpCacheKey_(identity);
  const raw = cache.get(key);

  if (!raw) throw new Error('El código venció o no existe. Solicita uno nuevo.');

  const record = JSON.parse(raw);
  if (Date.now() > Number(record.expiresAt || 0)) {
    cache.remove(key);
    throw new Error('El código venció. Solicita uno nuevo.');
  }

  record.attempts = Number(record.attempts || 0) + 1;
  if (record.attempts > Number(record.maxAttempts || 5)) {
    cache.remove(key);
    throw new Error('Se agotaron los intentos permitidos. Solicita un código nuevo.');
  }

  const expected = portalHash_(code + '|' + portalGetSecret_());
  if (expected !== record.codeHash) {
    cache.put(key, JSON.stringify(record), Math.max(60, Math.floor((record.expiresAt - Date.now()) / 1000)));
    portalAudit_({
      action: 'OTP_VALIDACION', role: role, email: email, unitId: unitId,
      result: 'FALLIDO', detail: 'Código incorrecto.'
    });
    throw new Error('El código no es correcto.');
  }

  cache.remove(key);
  const token = portalCreateSession_({
    role: role,
    email: email,
    unitId: unitId,
    origin: origin
  });

  portalAudit_({
    action: 'INICIO_SESION', role: role, email: email, unitId: unitId,
    result: 'OK', detail: 'Sesión OTP iniciada.'
  });

  return {
    ok: true,
    token: token.token,
    role: role,
    unidadId: unitId,
    expiresAt: token.expiresAt
  };
}


/***************************************
 * AUTENTICACIÓN DEL MÓDULO DE DATOS PERSONALES
 *
 * Flujo:
 * 1. Apartamento.
 * 2. Número de documento de una persona activa de la unidad.
 * 3. Selección del correo reconocido entre cinco opciones enmascaradas.
 ***************************************/

/**
 * Diagnóstico manual desde el editor de Apps Script.
 * No crea sesión ni devuelve correos sin enmascarar.
 */
function portalDiagnosticarAutenticacionDatos(
  apartamentoOUnidad,
  numeroDocumento
) {
  const unitId = portalNormalizeUnitInput_(
    '',
    apartamentoOUnidad,
    apartamentoOUnidad
  );
  const documentNumber =
    portalNormalizeDocument_(
      numeroDocumento
    );
  const match =
    portalFindActivePersonByDocument_(
      unitId,
      documentNumber
    );

  if (!unitId || !dmObtenerUnidad(unitId)) {
    return {
      ok: false,
      unidadId: unitId,
      motivo: 'UNIDAD_NO_ENCONTRADA'
    };
  }

  if (!match.ok || !match.person) {
    return {
      ok: false,
      unidadId: unitId,
      motivo: match.reason
    };
  }

  const emails =
    portalGetPersonAuthenticationEmails_(
      unitId,
      match.person
    );

  const result = {
    ok: true,
    unidadId: unitId,
    personaId: match.person.personaId,
    nombre: match.person.nombreCompleto,
    tipoAutenticacion:
      match.person.identityType,
    roles: match.person.roles,
    correosEnmascarados:
      emails.map(portalMaskEmail_),
    permisos:
      portalAllowedSectionsForIdentity_(
        match.person.identityType
      )
  };

  console.log(JSON.stringify(result));
  return result;
}

function portalIniciarAutenticacionDatos(payload, origin) {
  portalAssertOrigin_(origin);
  payload = payload || {};

  const unitId = portalNormalizeUnitInput_(
    '',
    payload.apartamento,
    payload.unidadId
  );
  const documentNumber = portalNormalizeDocument_(payload.numeroDocumento);
  const genericMessage =
    'No fue posible validar los datos ingresados. Revisa el apartamento y el número de documento.';

  portalAssertSecurityChallengeRate_(unitId, documentNumber);

  if (!unitId || !documentNumber || !dmObtenerUnidad(unitId)) {
    portalAudit_({
      action: 'SEGURIDAD_INICIAR',
      role: PORTAL_ROLE.RESIDENTE,
      email: '',
      unitId: unitId,
      result: 'NO_COINCIDE',
      detail: 'Unidad o documento no reconocidos.'
    });
    throw new Error(genericMessage);
  }

  const match = portalFindActivePersonByDocument_(unitId, documentNumber);

  if (!match.ok || !match.person) {
    portalAudit_({
      action: 'SEGURIDAD_INICIAR',
      role: PORTAL_ROLE.RESIDENTE,
      email: '',
      unitId: unitId,
      result: match.reason || 'NO_COINCIDE',
      detail: 'No se creó el reto de seguridad.'
    });
    throw new Error(genericMessage);
  }

  const emails = portalGetPersonAuthenticationEmails_(
    unitId,
    match.person
  );

  if (!emails.length) {
    portalAudit_({
      action: 'SEGURIDAD_INICIAR',
      role: PORTAL_ROLE.RESIDENTE,
      email: '',
      unitId: unitId,
      result: 'SIN_CORREO',
      detail: 'La persona reconocida no tiene un correo válido registrado.'
    });
    throw new Error(
      'La persona fue identificada, pero no tiene un correo válido registrado. Solicita la actualización a la administración.'
    );
  }

  const selectedEmail = emails[0];
  const challengeId =
    Utilities.getUuid().replace(/-/g, '') +
    Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  const challengeOptions = portalBuildEmailChallengeOptions_(selectedEmail);
  const correctOption = challengeOptions.filter(function (option) {
    return option.correct;
  })[0];

  const config = portalGetConfig_();
  const minutes = portalPositiveInt_(
    config.PORTAL_SECURITY_CHALLENGE_MINUTES,
    10
  );
  const maxAttempts = portalPositiveInt_(
    config.PORTAL_MAX_SECURITY_ATTEMPTS,
    5
  );

  const record = {
    challengeId: challengeId,
    unitId: unitId,
    personId: match.person.personaId,
    identityType: match.person.identityType,
    email: selectedEmail,
    origin: origin,
    correctOptionHash: portalHash_(
      correctOption.id +
      '|' +
      challengeId +
      '|' +
      portalGetSecret_()
    ),
    attempts: 0,
    maxAttempts: maxAttempts,
    expiresAt: Date.now() + minutes * 60000
  };

  CacheService.getScriptCache().put(
    portalSecurityChallengeCacheKey_(challengeId),
    JSON.stringify(record),
    Math.min(minutes * 60, 21600)
  );

  portalAudit_({
    action: 'SEGURIDAD_INICIAR',
    role: PORTAL_ROLE.RESIDENTE,
    email: selectedEmail,
    unitId: unitId,
    result: 'RETO_CREADO',
    detail:
      'PersonaID=' +
      match.person.personaId +
      ' | Tipo=' +
      match.person.identityType
  });

  return {
    ok: true,
    challengeId: challengeId,
    unidadId: unitId,
    opciones: challengeOptions.map(function (option) {
      return {
        id: option.id,
        correoEnmascarado: option.correoEnmascarado
      };
    }),
    expiresMinutes: minutes,
    message:
      'Selecciona el correo que reconoces. No se enviará ningún mensaje.'
  };
}

function portalValidarAutenticacionDatos(payload, origin) {
  portalAssertOrigin_(origin);
  payload = payload || {};

  const challengeId = portalSafeTrim_(payload.challengeId);
  const optionId = portalSafeTrim_(payload.opcionId);

  if (!challengeId || !optionId) {
    throw new Error('Selecciona una opción para continuar.');
  }

  const cache = CacheService.getScriptCache();
  const key = portalSecurityChallengeCacheKey_(challengeId);
  const raw = cache.get(key);

  if (!raw) {
    throw new Error(
      'La pregunta de seguridad venció. Inicia nuevamente.'
    );
  }

  const record = JSON.parse(raw);

  if (record.origin !== origin) {
    cache.remove(key);
    throw new Error('Origen de autenticación inválido.');
  }

  if (Date.now() > Number(record.expiresAt || 0)) {
    cache.remove(key);
    throw new Error(
      'La pregunta de seguridad venció. Inicia nuevamente.'
    );
  }

  record.attempts = Number(record.attempts || 0) + 1;

  if (record.attempts > Number(record.maxAttempts || 5)) {
    cache.remove(key);
    throw new Error(
      'Se agotaron los intentos permitidos. Inicia nuevamente.'
    );
  }

  const receivedHash = portalHash_(
    optionId +
    '|' +
    challengeId +
    '|' +
    portalGetSecret_()
  );

  if (receivedHash !== record.correctOptionHash) {
    cache.put(
      key,
      JSON.stringify(record),
      Math.max(
        60,
        Math.floor(
          (Number(record.expiresAt) - Date.now()) / 1000
        )
      )
    );

    portalAudit_({
      action: 'SEGURIDAD_VALIDAR',
      role: PORTAL_ROLE.RESIDENTE,
      email: record.email || '',
      unitId: record.unitId || '',
      result: 'FALLIDO',
      detail:
        'PersonaID=' +
        (record.personId || '') +
        ' | Opción incorrecta.'
    });

    throw new Error(
      'El correo seleccionado no coincide con nuestros registros.'
    );
  }

  const activePerson = portalFindActivePersonById_(
    record.unitId,
    record.personId
  );

  if (!activePerson) {
    cache.remove(key);
    throw new Error(
      'La persona ya no aparece vinculada activamente a la unidad.'
    );
  }

  cache.remove(key);

  const identityType =
    record.identityType ||
    activePerson.identityType ||
    PORTAL_IDENTITY_TYPE.RESIDENTE;
  const allowedSections =
    portalAllowedSectionsForIdentity_(identityType);

  const token = portalCreateSession_({
    role: PORTAL_ROLE.RESIDENTE,
    email: record.email,
    unitId: record.unitId,
    origin: origin,
    personId: record.personId,
    identityType: identityType,
    allowedSections: allowedSections
  });

  portalAudit_({
    action: 'INICIO_SESION',
    role: PORTAL_ROLE.RESIDENTE,
    email: record.email,
    unitId: record.unitId,
    result: 'OK',
    detail:
      'Autenticación por pregunta de seguridad. PersonaID=' +
      record.personId +
      ' | Tipo=' +
      identityType
  });

  return {
    ok: true,
    token: token.token,
    role: PORTAL_ROLE.RESIDENTE,
    unidadId: record.unitId,
    tipoAutenticacion: identityType,
    permisos: allowedSections,
    expiresAt: token.expiresAt
  };
}

function portalCerrarSesion(payload, origin) {
  portalAssertOrigin_(origin);
  const token = portalSafeTrim_((payload || {}).token);
  if (token) CacheService.getScriptCache().remove(portalSessionCacheKey_(token));
  return { ok: true };
}

function portalCreateSession_(data) {
  const config = portalGetConfig_();
  const minutes = data.role === PORTAL_ROLE.RESIDENTE
    ? portalPositiveInt_(config.PORTAL_SESSION_MINUTES_RESIDENTE, 30)
    : portalPositiveInt_(config.PORTAL_SESSION_MINUTES_INTERNO, 60);

  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const expiresAt = Date.now() + minutes * 60000;
  const session = {
    role: data.role,
    email: data.email,
    unitId: data.unitId || '',
    origin: data.origin,
    personId: data.personId || '',
    identityType: data.identityType || '',
    allowedSections: Array.isArray(data.allowedSections)
      ? data.allowedSections
      : [],
    createdAt: Date.now(),
    expiresAt: expiresAt
  };

  CacheService.getScriptCache().put(
    portalSessionCacheKey_(token),
    JSON.stringify(session),
    Math.min(minutes * 60, 21600)
  );

  return { token: token, expiresAt: expiresAt };
}

function portalRequireSession_(token, origin, allowedRoles) {
  portalAssertOrigin_(origin);
  token = portalSafeTrim_(token);
  if (!token) throw new Error('Sesión requerida.');

  const raw = CacheService.getScriptCache().get(portalSessionCacheKey_(token));
  if (!raw) throw new Error('La sesión venció. Ingresa nuevamente.');

  const session = JSON.parse(raw);
  if (Date.now() > Number(session.expiresAt || 0)) {
    CacheService.getScriptCache().remove(portalSessionCacheKey_(token));
    throw new Error('La sesión venció. Ingresa nuevamente.');
  }

  if (session.origin !== origin) throw new Error('Origen de sesión inválido.');
  if (allowedRoles.indexOf(session.role) === -1) throw new Error('No tienes permisos para esta operación.');

  if (session.role !== PORTAL_ROLE.RESIDENTE && !portalInternalUserAuthorized_(session.email, session.role)) {
    throw new Error('El usuario ya no está autorizado.');
  }

  if (session.role === PORTAL_ROLE.RESIDENTE) {
    const activePerson = portalFindActivePersonById_(
      session.unitId,
      session.personId
    );

    if (!activePerson) {
      CacheService.getScriptCache().remove(
        portalSessionCacheKey_(token)
      );
      throw new Error(
        'La persona ya no está vinculada activamente a la unidad.'
      );
    }

    session.identityType =
      session.identityType ||
      activePerson.identityType ||
      PORTAL_IDENTITY_TYPE.RESIDENTE;
    session.allowedSections =
      portalAllowedSectionsForIdentity_(session.identityType);
  }

  return session;
}

/***************************************
 * PERFIL DEL RESIDENTE
 ***************************************/
function portalObtenerPerfilResidente(payload, origin) {
  const session = portalRequireSession_(
    (payload || {}).token,
    origin,
    [PORTAL_ROLE.RESIDENTE]
  );
  const profile = portalBuildResidentProfile_(
    session.unitId,
    session.email,
    session.personId,
    session.identityType
  );

  portalAudit_({
    action: 'VER_PERFIL_RESIDENTE',
    role: session.role,
    email: session.email,
    unitId: session.unitId,
    result: 'OK',
    detail:
      'Consulta de perfil propio. PersonaID=' +
      session.personId +
      ' | Tipo=' +
      session.identityType
  });

  return portalToClientSafe_(profile);
}

function portalEnviarSolicitudActualizacion(payload, origin) {
  payload = payload || {};
  const session = portalRequireSession_(
    payload.token,
    origin,
    [PORTAL_ROLE.RESIDENTE]
  );
  const proposed = portalSanitizeProposedData_(
    payload.proposed || {}
  );
  const notes = portalLimitText_(payload.observaciones, 1500);
  const allowedSections =
    session.allowedSections &&
    session.allowedSections.length
      ? session.allowedSections
      : portalAllowedSectionsForIdentity_(
          session.identityType
        );

  const unauthorizedSections = Object.keys(proposed).filter(
    function (section) {
      return allowedSections.indexOf(section) === -1;
    }
  );

  if (unauthorizedSections.length) {
    throw new Error(
      'Tu tipo de acceso no permite modificar: ' +
      unauthorizedSections.join(', ') +
      '.'
    );
  }

  const current = portalBuildEditableSnapshot_(
    session.unitId,
    session.email,
    session.personId
  );

  // El residente principal puede administrar convivientes, pero no puede
  // eliminarse ni degradar su propio vínculo desde el autoservicio.
  if (
    session.identityType ===
      PORTAL_IDENTITY_TYPE.RESIDENTE_PRINCIPAL &&
    Array.isArray(proposed.RESIDENTES)
  ) {
    const currentSelf =
      (current.RESIDENTES || [])
        .find(function (row) {
          return (
            portalSafeTrim_(row.personaId) ===
            portalSafeTrim_(session.personId)
          );
        });

    if (currentSelf) {
      let proposedSelf =
        proposed.RESIDENTES.find(function (row) {
          return (
            portalSafeTrim_(row.personaId) ===
            portalSafeTrim_(session.personId)
          );
        });

      if (!proposedSelf) {
        proposedSelf = {};
        proposed.RESIDENTES.unshift(proposedSelf);
      }

      proposedSelf.personaId =
        currentSelf.personaId;
      proposedSelf.numeroDocumento =
        currentSelf.numeroDocumento;
      proposedSelf.nombre =
        currentSelf.nombre;
      proposedSelf.rol =
        currentSelf.rol;
    }
  }

  // Los campos identificadores mostrados como bloqueados nunca se aceptan
  // desde el navegador, aunque alguien altere el HTML o el payload.
  if (proposed.CONTACTO && current.CONTACTO) {
    proposed.CONTACTO.personaId =
      current.CONTACTO.personaId;
    proposed.CONTACTO.nombre =
      current.CONTACTO.nombre;
    proposed.CONTACTO.correoPrincipal =
      current.CONTACTO.correoPrincipal;
  }

  const changed = portalChangedSections_(
    current,
    proposed
  ).filter(function (section) {
    return allowedSections.indexOf(section) !== -1;
  });

  if (changed.length === 0 && !notes) {
    throw new Error(
      'No se detectaron cambios permitidos para enviar.'
    );
  }

  const requestId =
    'SOL-' +
    Utilities.formatDate(
      new Date(),
      PORTAL_TIMEZONE,
      'yyyyMMdd-HHmmss'
    ) +
    '-' +
    portalRandomSuffix_();
  const sheet = portalGetRequiredSheet_('REQUESTS');

  sheet.appendRow([
    requestId,
    portalNow_(),
    session.unitId,
    session.email,
    session.personId || '',
    changed.join(','),
    JSON.stringify(
      portalPickSections_(current, changed)
    ),
    JSON.stringify(
      portalPickSections_(proposed, changed)
    ),
    notes,
    PORTAL_REQUEST_STATUS.PENDING,
    '',
    '',
    '',
    '',
    '',
    PORTAL_VERSION
  ]);

  portalAudit_({
    action: 'CREAR_SOLICITUD',
    role: session.role,
    email: session.email,
    unitId: session.unitId,
    result: 'OK',
    detail:
      requestId +
      ' | PersonaID=' +
      session.personId +
      ' | Tipo=' +
      session.identityType +
      ' | ' +
      changed.join(',')
  });

  return {
    ok: true,
    solicitudId: requestId,
    estado: PORTAL_REQUEST_STATUS.PENDING,
    message:
      'La solicitud fue enviada a la administración para revisión.'
  };
}


function portalBuildResidentProfile_(
  unitId,
  authenticatedEmail,
  authenticatedPersonId,
  identityType
) {
  const unit = dmObtenerUnidad(unitId);

  if (!unit) {
    throw new Error(
      'La unidad no existe en Datos Maestros.'
    );
  }

  const people = dmObtenerPersonasActivas(unitId);
  const authenticatedPerson =
    portalFindActivePersonById_(
      unitId,
      authenticatedPersonId
    );
  const resolvedIdentityType =
    identityType ||
    (authenticatedPerson
      ? authenticatedPerson.identityType
      : PORTAL_IDENTITY_TYPE.RESIDENTE);
  const permissions =
    portalAllowedSectionsForIdentity_(
      resolvedIdentityType
    );
  const isOwner =
    resolvedIdentityType ===
    PORTAL_IDENTITY_TYPE.PROPIETARIO;

  const completeEditable =
    portalBuildEditableSnapshot_(
      unitId,
      authenticatedEmail,
      authenticatedPersonId
    );

  // El servidor filtra el perfil antes de enviarlo al navegador.
  // Un residente no recibe RESIDENTES ni datos del propietario.
  const editable =
    portalPickSections_(
      completeEditable,
      permissions
    );

  const approvedSectionNames =
    Object.keys(
      portalGetApprovedSections_(unitId)
    ).filter(function (section) {
      return permissions.indexOf(section) !== -1;
    });

  const requests =
    portalGetResidentRequests_(
      unitId,
      authenticatedEmail,
      authenticatedPersonId
    );

  const profile = {
    autenticacion: {
      tipo: resolvedIdentityType,
      personaId: authenticatedPersonId || '',
      nombre: authenticatedPerson
        ? authenticatedPerson.nombreCompleto
        : '',
      correoEnmascarado:
        portalMaskEmail_(authenticatedEmail),
      permisos: permissions,
      puedeVerResumen: isOwner
    },
    permisos: permissions,
    puedeVerResumen: isOwner,

    // Para residentes se conserva únicamente el identificador técnico.
    unidad: isOwner
      ? {
          unidadId: unit.UnidadID,
          torre: unit.Torre,
          apartamento: unit.Apartamento,
          areaPrivadaConstruidaM2:
            unit.AreaPrivadaConstruidaM2,
          coeficienteCopropiedad:
            unit.CoeficienteCopropiedad,
          estadoUnidad: unit.EstadoUnidad,
          estadoEntregaApartamento:
            unit.EstadoEntregaApartamento
        }
      : {
          unidadId: unit.UnidadID
        },

    datosNoModificables: {},
    editable: editable,
    seccionesAprobadas: approvedSectionNames,
    solicitudes: requests
  };

  if (isOwner) {
    const latestAccount =
      dmObtenerEstadoCuenta(unitId, '');
    const parkings =
      dmObtenerParqueaderosUnidad(unitId);

    profile.datosNoModificables = {
      propietarios: people.filter(function (person) {
        const role =
          portalSafeTrim_(person.rol).toUpperCase();

        return (
          role.indexOf('PROPIET') !== -1 ||
          role.indexOf('COMPRADOR') !== -1
        );
      }).map(function (person) {
        return {
          nombre: person.nombreCompleto,
          rol: person.rol
        };
      }),

      parqueaderos: parkings.map(function (parking) {
        return {
          codigoOficial: parking.codigoOficial,
          subtipo: parking.subtipo,
          areaPrivadaConstruidaM2:
            parking.areaPrivadaConstruidaM2,
          coeficienteCopropiedad:
            parking.coeficienteCopropiedad,
          tipoTenencia: parking.tipoTenencia
        };
      }),

      estadoCuenta: latestAccount
        ? {
            estado: latestAccount.EstadoCuenta,
            elegibleReservas:
              latestAccount.ElegibleReservas,
            fechaCorte: portalDateText_(
              latestAccount.FechaCorte
            )
          }
        : {
            estado: 'PENDIENTE_VALIDACION',
            elegibleReservas:
              'PENDIENTE_VALIDACION',
            fechaCorte: ''
          }
    };
  }

  return profile;
}

function portalBuildEditableSnapshot_(
  unitId,
  authenticatedEmail,
  authenticatedPersonId
) {
  const approved =
    portalGetApprovedSections_(unitId);
  const people =
    dmObtenerPersonasActivas(unitId);
  const authenticated =
    portalFindActivePersonById_(
      unitId,
      authenticatedPersonId
    ) ||
    portalFindPersonByEmail_(
      unitId,
      authenticatedEmail
    ) ||
    people.find(function (person) {
      return portalYes_(
        person.recibeNotificaciones
      );
    }) ||
    people[0] ||
    null;

  const baseContact = {
    personaId: authenticated
      ? authenticated.personaId
      : '',
    nombre: authenticated
      ? authenticated.nombreCompleto
      : '',
    correoPrincipal: authenticated
      ? authenticated.correoPrincipal
      : authenticatedEmail,
    correoNotificacion: authenticated
      ? authenticated.correoPrincipal
      : authenticatedEmail,
    correosAlternos: authenticated
      ? portalExtractEmails_(
          authenticated.correosAlternos
        ).join(', ')
      : '',
    celularPrincipal: authenticated
      ? authenticated.celularPrincipal
      : '',
    recibeNotificaciones: authenticated
      ? authenticated.recibeNotificaciones
      : 'SI'
  };

  const approvedContact = approved.CONTACTO;
  const approvedContactEmails =
    approvedContact
      ? portalExtractEmails_(
          approvedContact.correoPrincipal
        )
          .concat(
            portalExtractEmails_(
              approvedContact.correoNotificacion
            )
          )
          .concat(
            portalExtractEmails_(
              approvedContact.correosAlternos
            )
          )
      : [];
  const contactBelongsToAuthenticated =
    !!approvedContact &&
    !!authenticated &&
    (
      (
        approvedContact.personaId &&
        approvedContact.personaId ===
          authenticated.personaId
      ) ||
      (
        !approvedContact.personaId &&
        approvedContactEmails.indexOf(
          portalNormalizeEmail_(
            authenticatedEmail
          )
        ) !== -1
      )
    );

  const baseResidents = people
    .filter(function (p) {
      const role =
        portalSafeTrim_(p.rol).toUpperCase();
      return (
        role.indexOf('RESIDENT') !== -1 ||
        role.indexOf('ARREND') !== -1 ||
        role.indexOf('OCUPANTE') !== -1
      );
    })
    .map(function (p) {
      return {
        personaId: p.personaId || '',
        numeroDocumento: p.numeroDocumento || '',
        nombre: p.nombreCompleto,
        rol: p.rol || 'RESIDENTE'
      };
    });

  const baseVehicles =
    dmObtenerVehiculosActuales(unitId).map(
      function (v) {
        return {
          vehiculoId: v.vehiculoId || '',
          placa: v.placa,
          tipo: v.tipoVehiculo || '',
          reconocimiento: portalVehicleRecognitionFromLink_(v),
          tipoVinculo: v.tipoVinculo || '',
          fuente: v.fuenteGanadora || v.fuente || '',
          fuentesRespaldo: v.fuentesRespaldo || '',
          confianza: v.confianza || '',
          estadoRevision: v.estadoRevision || ''
        };
      }
    );

  const basePets =
    portalReadMasterObjectsSafe_(
      typeof DM_SHEETS !== 'undefined'
        ? DM_SHEETS.MASCOTAS
        : 'Mascotas'
    )
      .filter(function (row) {
        return (
          portalSafeTrim_(row.UnidadID)
            .toUpperCase() === unitId &&
          portalYes_(row.EsActual)
        );
      })
      .map(function (row) {
        return {
          tipo: portalSafeTrim_(
            row.TipoMascota
          ),
          raza: portalSafeTrim_(row.Raza),
          cantidad:
            Number(row.Cantidad) || 1
        };
      });

  const emergencyRows =
    portalReadMasterObjectsSafe_(
      typeof DM_SHEETS !== 'undefined'
        ? DM_SHEETS.CONTACTOS_EMERGENCIA
        : 'Contactos_Emergencia'
    ).filter(function (row) {
      return (
        portalSafeTrim_(row.UnidadID)
          .toUpperCase() === unitId &&
        portalYes_(row.EsActual)
      );
    });
  const emergency = emergencyRows.length
    ? {
        nombre: portalSafeTrim_(
          emergencyRows[0].NombreCompleto
        ),
        celular: portalSafeTrim_(
          emergencyRows[0].Celular
        ),
        parentesco: portalSafeTrim_(
          emergencyRows[0].Parentesco
        )
      }
    : {
        nombre: '',
        celular: '',
        parentesco: ''
      };

  const editableResidents = approved.RESIDENTES
    ? portalEnrichResidentsWithIdentity_(approved.RESIDENTES, baseResidents)
    : baseResidents;

  return {
    CONTACTO: contactBelongsToAuthenticated
      ? approvedContact
      : baseContact,
    RESIDENTES: editableResidents,
    VEHICULOS:
      approved.VEHICULOS || baseVehicles,
    MASCOTAS:
      approved.MASCOTAS || basePets,
    EMERGENCIA:
      approved.EMERGENCIA || emergency
  };
}


function portalEnrichResidentsWithIdentity_(
  approvedRows,
  baseRows
) {
  const byId = {};
  const byName = {};
  const result = [];
  const included = {};

  (baseRows || []).forEach(function (row) {
    const personId =
      portalSafeTrim_(row.personaId);
    const nameKey =
      portalNormalizePersonName_(row.nombre);

    if (personId) byId[personId] = row;

    if (nameKey) {
      if (!byName[nameKey]) {
        byName[nameKey] = [];
      }
      byName[nameKey].push(row);
    }
  });

  // Solo conserva registros aprobados que todavía tienen un vínculo activo
  // en el maestro. Así una salida registrada por vigilancia no reaparece.
  (approvedRows || []).forEach(function (row) {
    const direct =
      byId[portalSafeTrim_(row.personaId)];
    const nameMatches =
      byName[
        portalNormalizePersonName_(row.nombre)
      ] || [];
    const matched =
      direct ||
      (
        nameMatches.length === 1
          ? nameMatches[0]
          : null
      );

    if (!matched) return;

    const personId =
      portalSafeTrim_(matched.personaId);

    if (personId && included[personId]) {
      return;
    }

    result.push({
      personaId: personId,
      numeroDocumento:
        portalNormalizeDocument_(
          matched.numeroDocumento ||
          row.numeroDocumento
        ),
      nombre:
        portalLimitText_(
          matched.nombre || row.nombre,
          150
        ),
      rol:
        portalNormalizeResidentRole_(
          matched.rol || row.rol
        )
    });

    if (personId) included[personId] = true;
  });

  // Agrega altas directas de vigilancia que aún no existan en el snapshot
  // aprobado del portal.
  (baseRows || []).forEach(function (row) {
    const personId =
      portalSafeTrim_(row.personaId);

    if (personId && included[personId]) {
      return;
    }

    result.push({
      personaId: personId,
      numeroDocumento:
        portalNormalizeDocument_(
          row.numeroDocumento
        ),
      nombre:
        portalLimitText_(row.nombre, 150),
      rol:
        portalNormalizeResidentRole_(
          row.rol
        )
    });

    if (personId) included[personId] = true;
  });

  return result;
}

/***************************************
 * ADMINISTRACIÓN
 ***************************************/
function portalObtenerDashboardAdmin(payload, origin) {
  const session = portalRequireSession_((payload || {}).token, origin, [PORTAL_ROLE.ADMIN]);
  const ss = portalGetSpreadsheet_();

  const pending = portalReadObjects_(PORTAL_SHEETS.REQUESTS).filter(function (row) {
    return portalSafeTrim_(row.Estado).toUpperCase() === PORTAL_REQUEST_STATUS.PENDING;
  }).length;

  const conflictsSheet = ss.getSheetByName(typeof DM_SHEETS !== 'undefined' ? DM_SHEETS.CONFLICTOS : 'Conflictos_Datos');
  const activeConflicts = conflictsSheet ? portalReadObjectsFromSheet_(conflictsSheet).filter(function (row) {
    return portalSafeTrim_(row.Estado).toUpperCase() !== 'RESUELTO';
  }).length : 0;

  return {
    usuario: { email: session.email, rol: session.role },
    metricas: {
      unidades: portalReadMasterObjectsSafe_(typeof DM_SHEETS !== 'undefined' ? DM_SHEETS.UNIDADES : 'Unidades').filter(function (row) {
        return portalSafeTrim_(row.UnidadID) !== PORTAL_UNIDENTIFIED_UNIT_ID;
      }).length,
      personas: portalDataCount_(typeof DM_SHEETS !== 'undefined' ? DM_SHEETS.PERSONAS : 'Personas'),
      vehiculos: portalDataCount_(typeof DM_SHEETS !== 'undefined' ? DM_SHEETS.VEHICULOS : 'Vehiculos'),
      vehiculosSinIdentificar: portalCountVehiclesInUnit_(PORTAL_UNIDENTIFIED_UNIT_ID),
      parqueaderos: portalDataCount_(typeof DM_SHEETS !== 'undefined' ? DM_SHEETS.PARQUEADEROS : 'Parqueaderos'),
      solicitudesPendientes: pending,
      conflictosAbiertos: activeConflicts
    }
  };
}

function portalBuscarAdministracion(payload, origin) {
  payload = payload || {};
  const session = portalRequireSession_(payload.token, origin, [PORTAL_ROLE.ADMIN]);
  const query = portalLimitText_(payload.query, 100).toUpperCase();
  if (query.length < 2) throw new Error('Ingresa al menos dos caracteres.');

  const results = portalSearchUnits_(query, true).slice(0, 30);
  portalAudit_({
    action: 'BUSCAR_ADMIN', role: session.role, email: session.email,
    unitId: '', result: 'OK', detail: 'Resultados: ' + results.length
  });
  return { resultados: results };
}

function portalObtenerPerfilAdministracion(payload, origin) {
  payload = payload || {};
  const session = portalRequireSession_(
    payload.token,
    origin,
    [PORTAL_ROLE.ADMIN]
  );

  // Acepta tanto 1029-T4 como el formato anterior T4-1029.
  const unitId = portalNormalizeUnitInput_('', '', payload.unidadId);

  if (!unitId) {
    throw new Error(
      'El identificador de la unidad no tiene un formato válido.'
    );
  }

  const profile = portalBuildAdminProfile_(unitId, session.email);

  portalAudit_({
    action: 'VER_PERFIL_ADMIN',
    role: session.role,
    email: session.email,
    unitId: unitId,
    result: 'OK',
    detail: 'Perfil administrativo consultado.'
  });

  return profile;
}

/**
 * Construye una respuesta serializable para google.script.run.
 *
 * Las filas leídas desde SpreadsheetApp pueden contener objetos Date.
 * google.script.run no transporta de forma segura esos valores dentro de
 * objetos complejos. Por eso se convierten recursivamente antes de responder.
 */
function portalBuildAdminProfile_(unitId, adminEmail) {
  const unit = dmObtenerUnidad(unitId);

  if (!unit) {
    throw new Error(
      'La unidad ' + unitId + ' no existe en Datos Maestros.'
    );
  }

  const people = portalGetAdminPeople_(unitId);
  const owners = people.filter(function (person) {
    return portalIsOwnerRole_(person.rol);
  });
  const otherPeople = people.filter(function (person) {
    return !portalIsOwnerRole_(person.rol);
  });

  const profile = {
    unidad: unit,
    camposUnidadEditables: {
      estadoUnidad:
        portalSafeTrim_(unit.EstadoUnidad),
      fechaEntregaApartamento:
        portalDateInputValue_(
          unit.FechaEntregaApartamento
        ),
      estadoEntregaApartamento:
        portalSafeTrim_(
          unit.EstadoEntregaApartamento
        )
    },
    camposUnidadProtegidos: {
      unidadId: unit.UnidadID,
      torre: unit.Torre,
      apartamento: unit.Apartamento,
      codigoOficial: unit.CodigoOficial,
      areaPrivadaConstruidaM2:
        unit.AreaPrivadaConstruidaM2,
      coeficienteCopropiedad:
        unit.CoeficienteCopropiedad,
      valorPresupuesto2026:
        unit.ValorPresupuesto2026
    },
    propietarios: owners,
    otrasPersonas: otherPeople,
    personas: people,
    vehiculos: dmObtenerVehiculosActuales(unitId),
    parqueaderos: dmObtenerParqueaderosUnidad(unitId),
    estadoCuenta: dmObtenerEstadoCuenta(unitId, ''),
    datosPortal:
      portalBuildEditableSnapshot_(
        unitId,
        adminEmail || ''
      ),
    seccionesAprobadas:
      portalGetApprovedSections_(unitId),
    solicitudes:
      portalGetAllRequestsForUnit_(unitId)
  };

  const safeProfile = portalToClientSafe_(profile);

  if (!safeProfile || !safeProfile.unidad) {
    throw new Error(
      'No fue posible construir el perfil administrativo de la unidad.'
    );
  }

  return safeProfile;
}

/**
 * Prueba desde el editor de Apps Script sin requerir una sesión del portal.
 * Ejemplo: portalDiagnosticarPerfilAdministracion('1029-T4')
 */
function portalDiagnosticarPerfilAdministracion(unidadId) {
  const normalized = portalNormalizeUnitInput_('', '', unidadId);

  if (!normalized) {
    throw new Error('Unidad inválida para el diagnóstico.');
  }

  const profile = portalBuildAdminProfile_(
    normalized,
    'diagnostico@bulevarverde.local'
  );

  const result = {
    ok: true,
    version: PORTAL_VERSION,
    unidadId: normalized,
    tieneUnidad: !!profile.unidad,
    personas: (profile.personas || []).length,
    vehiculos: (profile.vehiculos || []).length,
    parqueaderos: (profile.parqueaderos || []).length,
    solicitudes: (profile.solicitudes || []).length,
    tieneEstadoCuenta: !!profile.estadoCuenta
  };

  console.log(JSON.stringify(result));
  return result;
}


/**
 * Actualización directa y auditada de la información operativa de una
 * unidad y de sus propietarios.
 *
 * Los campos estructurales del reglamento y la cartera permanecen
 * protegidos: UnidadID, torre, apartamento, área, coeficiente,
 * presupuesto, parqueaderos y estado de cuenta.
 */
function portalActualizarApartamentoAdministracion(
  payload,
  origin
) {
  payload = payload || {};

  const session = portalRequireSession_(
    payload.token,
    origin,
    [PORTAL_ROLE.ADMIN]
  );
  const unitId =
    portalNormalizeUnitInput_(
      '',
      '',
      payload.unidadId
    );
  const reason =
    portalLimitText_(
      payload.motivo,
      1000
    );

  if (!unitId || !dmObtenerUnidad(unitId)) {
    throw new Error(
      'La unidad indicada no existe.'
    );
  }

  if (reason.length < 5) {
    throw new Error(
      'Explica brevemente el motivo de la actualización.'
    );
  }

  if (
    payload.confirmarCambios !== true &&
    !portalYes_(payload.confirmarCambios)
  ) {
    throw new Error(
      'Debes confirmar la actualización administrativa.'
    );
  }

  const ownersPayload =
    Array.isArray(payload.propietarios)
      ? payload.propietarios
      : [];

  if (!ownersPayload.length) {
    throw new Error(
      'Debe existir al menos un propietario en la actualización.'
    );
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    // Primero prepara y valida todo el plan. No se escribe ninguna fila
    // hasta que documentos, personas, vínculos y propietarios activos
    // sean consistentes.
    const ownerPlan =
      portalPrepareAdminOwnerPlan_(
        unitId,
        ownersPayload
      );
    const unitPlan =
      portalPrepareAdminUnitPlan_(
        unitId,
        payload.unidad || {}
      );

    const unitResult =
      portalApplyAdminUnitPlan_(unitPlan);
    const ownerResult =
      portalApplyAdminOwnerPlan_(
        ownerPlan,
        session,
        reason
      );

    SpreadsheetApp.flush();

    portalAudit_({
      action:
        'ACTUALIZAR_APARTAMENTO_ADMIN',
      role: session.role,
      email: session.email,
      unitId: unitId,
      result: 'OK',
      detail:
        'Motivo=' + reason +
        ' | Unidad=' +
          unitResult.camposActualizados.join(',') +
        ' | PropietariosActivos=' +
          ownerResult.propietariosActivos +
        ' | Creados=' +
          ownerResult.personasCreadas +
        ' | Actualizados=' +
          ownerResult.personasActualizadas +
        ' | Retirados=' +
          ownerResult.vinculosRetirados
    });

    return portalToClientSafe_({
      ok: true,
      message:
        'La información del apartamento y sus propietarios fue actualizada.',
      unidadId: unitId,
      resumen: {
        camposUnidadActualizados:
          unitResult.camposActualizados,
        propietariosActivos:
          ownerResult.propietariosActivos,
        personasCreadas:
          ownerResult.personasCreadas,
        personasActualizadas:
          ownerResult.personasActualizadas,
        vinculosRetirados:
          ownerResult.vinculosRetirados,
        contactosAprobadosInvalidados:
          ownerResult.contactosInvalidados
      },
      perfil:
        portalBuildAdminProfile_(
          unitId,
          session.email
        )
    });
  } catch (error) {
    portalAudit_({
      action:
        'ACTUALIZAR_APARTAMENTO_ADMIN',
      role: session.role,
      email: session.email,
      unitId: unitId,
      result: 'ERROR',
      detail:
        'Motivo=' + reason +
        ' | Error=' +
        (
          error && error.message
            ? error.message
            : String(error)
        )
    });

    throw error;
  } finally {
    if (lock.hasLock()) {
      lock.releaseLock();
    }
  }
}

function portalPrepareAdminUnitPlan_(
  unitId,
  proposed
) {
  const ss = portalGetSpreadsheet_();
  const sheetName =
    typeof DM_SHEETS !== 'undefined'
      ? DM_SHEETS.UNIDADES
      : 'Unidades';
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error(
      'No existe la hoja Unidades.'
    );
  }

  const data = sheet.getDataRange().getValues();
  const headers =
    data[0].map(portalSafeTrim_);
  const map = portalHeaderMap_(headers);

  portalRequireHeaders_(
    map,
    [
      'UnidadID',
      'EstadoUnidad',
      'FechaEntregaApartamento',
      'EstadoEntregaApartamento',
      'FuentePrincipal',
      'FechaActualizacion'
    ],
    sheetName
  );

  let rowNumber = 0;
  let current = null;

  for (let index = 1; index < data.length; index++) {
    if (
      portalSafeTrim_(
        data[index][map.UnidadID]
      ).toUpperCase() === unitId
    ) {
      rowNumber = index + 1;
      current = data[index];
      break;
    }
  }

  if (!rowNumber) {
    throw new Error(
      'La unidad no existe en la hoja Unidades.'
    );
  }

  const state =
    portalNormalizeAdminUnitState_(
      proposed.estadoUnidad ||
      current[map.EstadoUnidad]
    );
  const deliveryState =
    portalNormalizeAdminDeliveryState_(
      proposed.estadoEntregaApartamento ||
      current[
        map.EstadoEntregaApartamento
      ]
    );
  const deliveryDate =
    portalNormalizeAdminDate_(
      proposed.fechaEntregaApartamento
    );

  return {
    sheet: sheet,
    map: map,
    rowNumber: rowNumber,
    current: current,
    values: {
      EstadoUnidad: state,
      FechaEntregaApartamento:
        deliveryDate,
      EstadoEntregaApartamento:
        deliveryState,
      FuentePrincipal:
        portalAppendDelimitedValue_(
          current[map.FuentePrincipal],
          'ADMIN_PORTAL'
        ),
      FechaActualizacion:
        portalNow_()
    }
  };
}

function portalApplyAdminUnitPlan_(plan) {
  const changed = [];

  Object.keys(plan.values).forEach(
    function (header) {
      const columnIndex = plan.map[header];
      const currentValue =
        plan.current[columnIndex];
      const newValue =
        plan.values[header];

      const comparableCurrent =
        portalComparableValue_(currentValue);
      const comparableNew =
        portalComparableValue_(newValue);

      if (
        comparableCurrent !== comparableNew
      ) {
        plan.sheet.getRange(
          plan.rowNumber,
          columnIndex + 1
        ).setValue(newValue);

        if (
          [
            'EstadoUnidad',
            'FechaEntregaApartamento',
            'EstadoEntregaApartamento'
          ].indexOf(header) !== -1
        ) {
          changed.push(header);
        }
      }
    }
  );

  return {
    camposActualizados: changed
  };
}

function portalPrepareAdminOwnerPlan_(
  unitId,
  proposedOwners
) {
  const ss = portalGetSpreadsheet_();
  const peopleSheetName =
    typeof DM_SHEETS !== 'undefined'
      ? DM_SHEETS.PERSONAS
      : 'Personas';
  const linksSheetName =
    typeof DM_SHEETS !== 'undefined'
      ? DM_SHEETS.VINCULOS_UNIDAD
      : 'Vinculos_Unidad';
  const peopleSheet =
    ss.getSheetByName(peopleSheetName);
  const linksSheet =
    ss.getSheetByName(linksSheetName);

  if (!peopleSheet || !linksSheet) {
    throw new Error(
      'No existen las hojas Personas y Vinculos_Unidad.'
    );
  }

  const peopleData =
    peopleSheet.getDataRange().getValues();
  const linksData =
    linksSheet.getDataRange().getValues();
  const peopleHeaders =
    peopleData[0].map(portalSafeTrim_);
  const linksHeaders =
    linksData[0].map(portalSafeTrim_);
  const pm =
    portalHeaderMap_(peopleHeaders);
  const lm =
    portalHeaderMap_(linksHeaders);

  portalRequireHeaders_(
    pm,
    [
      'PersonaID',
      'TipoPersona',
      'TipoDocumento',
      'NumeroDocumento',
      'NombreCompleto',
      'CorreoPrincipal',
      'CorreosAlternos',
      'CelularPrincipal',
      'TelefonosAlternos',
      'EstadoPersona',
      'Fuentes',
      'FechaFuente',
      'FechaActualizacion'
    ],
    peopleSheetName
  );

  portalRequireHeaders_(
    lm,
    [
      'VinculoID',
      'UnidadID',
      'PersonaID',
      'Rol',
      'EsContactoPrincipal',
      'RecibeNotificaciones',
      'EstadoVinculo',
      'FechaInicio',
      'FechaFin',
      'Fuente',
      'RegistroFuenteID',
      'FilaFuente',
      'FechaActualizacion'
    ],
    linksSheetName
  );

  const peopleById = {};
  const peopleByDocument = {};

  for (
    let index = 1;
    index < peopleData.length;
    index++
  ) {
    const row = peopleData[index];
    const personId =
      portalSafeTrim_(
        row[pm.PersonaID]
      );
    const documentNumber =
      portalNormalizeDocument_(
        row[pm.NumeroDocumento]
      );

    if (personId) {
      peopleById[personId] = {
        rowNumber: index + 1,
        values: row
      };
    }

    if (documentNumber) {
      if (!peopleByDocument[documentNumber]) {
        peopleByDocument[documentNumber] = [];
      }

      peopleByDocument[documentNumber]
        .push({
          personId: personId,
          rowNumber: index + 1,
          values: row
        });
    }
  }

  const links = [];

  for (
    let index = 1;
    index < linksData.length;
    index++
  ) {
    const row = linksData[index];

    links.push({
      rowNumber: index + 1,
      values: row,
      linkId:
        portalSafeTrim_(
          row[lm.VinculoID]
        ),
      unitId:
        portalSafeTrim_(
          row[lm.UnidadID]
        ).toUpperCase(),
      personId:
        portalSafeTrim_(
          row[lm.PersonaID]
        ),
      role:
        portalSafeTrim_(
          row[lm.Rol]
        ).toUpperCase(),
      active:
        portalSafeTrim_(
          row[lm.EstadoVinculo]
        ).toUpperCase() === 'ACTIVO'
    });
  }

  const currentOwners =
    links.filter(function (link) {
      return (
        link.unitId === unitId &&
        link.active &&
        portalIsOwnerRole_(link.role)
      );
    });

  const normalized = [];
  const seenPersonIds = {};
  const seenDocuments = {};

  proposedOwners.forEach(
    function (rawOwner, index) {
      rawOwner = rawOwner || {};

      const active =
        rawOwner.activo !== false &&
        !(
          portalSafeTrim_(
            rawOwner.activo
          ).toUpperCase() === 'NO'
        );
      let personId =
        portalSafeTrim_(
          rawOwner.personaId
        );
      const documentNumber =
        portalNormalizeDocument_(
          rawOwner.numeroDocumento
        );
      const name =
        portalLimitText_(
          rawOwner.nombreCompleto,
          180
        );
      const email =
        rawOwner.correoPrincipal
          ? portalNormalizeEmail_(
              rawOwner.correoPrincipal
            )
          : '';
      const alternateEmails =
        portalExtractEmails_(
          rawOwner.correosAlternos
        ).join(', ');
      const phone =
        portalNormalizePhone_(
          rawOwner.celularPrincipal
        );
      const alternatePhones =
        portalNormalizePhoneList_(
          rawOwner.telefonosAlternos
        );
      const personType =
        portalNormalizeAdminPersonType_(
          rawOwner.tipoPersona
        );
      const documentType =
        portalNormalizeAdminDocumentType_(
          rawOwner.tipoDocumento,
          personType
        );
      const role =
        portalNormalizeAdminOwnerRole_(
          rawOwner.rol
        );
      const primary =
        rawOwner.esContactoPrincipal === true ||
        portalYes_(
          rawOwner.esContactoPrincipal
        );
      const notifications =
        rawOwner.recibeNotificaciones !== false &&
        !(
          portalSafeTrim_(
            rawOwner.recibeNotificaciones
          ).toUpperCase() === 'NO'
        );

      if (!name || name.length < 3) {
        throw new Error(
          'El propietario ' +
          (index + 1) +
          ' no tiene un nombre válido.'
        );
      }

      if (
        !documentNumber ||
        documentNumber.length < 5
      ) {
        throw new Error(
          'El propietario ' +
          (index + 1) +
          ' no tiene un documento válido.'
        );
      }

      if (
        rawOwner.correoPrincipal &&
        !email
      ) {
        throw new Error(
          'El correo principal del propietario ' +
          name +
          ' no es válido.'
        );
      }

      if (
        rawOwner.celularPrincipal &&
        phone.length < 7
      ) {
        throw new Error(
          'El celular del propietario ' +
          name +
          ' no es válido.'
        );
      }

      if (personId) {
        if (!peopleById[personId]) {
          throw new Error(
            'La PersonaID ' +
            personId +
            ' no existe.'
          );
        }

        const duplicateDocument =
          (
            peopleByDocument[
              documentNumber
            ] || []
          ).filter(function (person) {
            return (
              person.personId !== personId
            );
          });

        if (duplicateDocument.length) {
          throw new Error(
            'El documento ' +
            documentNumber +
            ' ya pertenece a otra persona.'
          );
        }
      } else {
        const matches =
          peopleByDocument[
            documentNumber
          ] || [];

        const uniqueIds =
          portalUnique_(
            matches.map(function (person) {
              return person.personId;
            }).filter(Boolean)
          );

        if (uniqueIds.length > 1) {
          throw new Error(
            'El documento ' +
            documentNumber +
            ' aparece en más de una persona. ' +
            'Resuelve el conflicto antes de continuar.'
          );
        }

        if (uniqueIds.length === 1) {
          personId = uniqueIds[0];
        }
      }

      if (
        personId &&
        seenPersonIds[personId]
      ) {
        throw new Error(
          'La misma persona fue incluida dos veces.'
        );
      }

      if (
        seenDocuments[documentNumber]
      ) {
        throw new Error(
          'El documento ' +
          documentNumber +
          ' fue incluido dos veces.'
        );
      }

      if (personId) {
        seenPersonIds[personId] = true;
      }
      seenDocuments[documentNumber] = true;

      normalized.push({
        sourceIndex: index,
        personId: personId,
        active: active,
        personType: personType,
        documentType: documentType,
        documentNumber:
          documentNumber,
        name: name,
        email: email,
        alternateEmails:
          alternateEmails,
        phone: phone,
        alternatePhones:
          alternatePhones,
        role: role,
        primary: primary,
        notifications: notifications
      });
    }
  );

  const activeProposals =
    normalized.filter(function (owner) {
      return owner.active;
    });

  if (!activeProposals.length) {
    throw new Error(
      'El apartamento debe conservar al menos un propietario activo.'
    );
  }

  const primaryOwners =
    activeProposals.filter(function (owner) {
      return owner.primary;
    });

  if (primaryOwners.length > 1) {
    throw new Error(
      'Solo un propietario puede quedar como contacto principal.'
    );
  }

  if (!primaryOwners.length) {
    activeProposals[0].primary = true;
  }

  return {
    unitId: unitId,
    peopleSheet: peopleSheet,
    linksSheet: linksSheet,
    peopleHeaders: peopleHeaders,
    linksHeaders: linksHeaders,
    peopleData: peopleData,
    linksData: linksData,
    peopleMap: pm,
    linksMap: lm,
    peopleById: peopleById,
    links: links,
    currentOwners: currentOwners,
    owners: normalized
  };
}

function portalApplyAdminOwnerPlan_(
  plan,
  session,
  reason
) {
  const now = portalNow_();
  const registrationId =
    'ADM-OWN-' +
    Utilities.formatDate(
      new Date(),
      PORTAL_TIMEZONE,
      'yyyyMMdd-HHmmss'
    ) +
    '-' +
    portalRandomSuffix_();
  let peopleCreated = 0;
  let peopleUpdated = 0;
  let linksRetired = 0;
  const affectedPersonIds = [];
  const activePersonIds = [];

  plan.owners.forEach(function (owner) {
    let personId = owner.personId;
    let personRow =
      personId
        ? plan.peopleById[personId]
        : null;

    if (!personRow) {
      personId =
        portalGenerateAdminPersonId_(
          owner.documentNumber,
          plan.peopleById
        );

      const personObject = {
        PersonaID: personId,
        TipoPersona: owner.personType,
        TipoDocumento:
          owner.documentType,
        NumeroDocumento:
          owner.documentNumber,
        NombreCompleto: owner.name,
        CorreoPrincipal: owner.email,
        CorreosAlternos:
          owner.alternateEmails,
        CelularPrincipal:
          owner.phone,
        TelefonosAlternos:
          owner.alternatePhones,
        EstadoPersona: 'ACTIVA',
        Fuentes: 'ADMIN_PORTAL',
        FechaFuente: now,
        FechaActualizacion: now
      };

      const rowValues =
        plan.peopleHeaders.map(
          function (header) {
            return (
              personObject[header] !==
                undefined
                ? personObject[header]
                : ''
            );
          }
        );

      plan.peopleSheet.appendRow(
        rowValues
      );

      personRow = {
        rowNumber:
          plan.peopleSheet.getLastRow(),
        values: rowValues
      };
      plan.peopleById[personId] =
        personRow;
      peopleCreated += 1;
    } else {
      const updates = {
        TipoPersona: owner.personType,
        TipoDocumento:
          owner.documentType,
        NumeroDocumento:
          owner.documentNumber,
        NombreCompleto: owner.name,
        CorreoPrincipal: owner.email,
        CorreosAlternos:
          owner.alternateEmails,
        CelularPrincipal: owner.phone,
        TelefonosAlternos:
          owner.alternatePhones,
        EstadoPersona: 'ACTIVA',
        Fuentes:
          portalAppendDelimitedValue_(
            personRow.values[
              plan.peopleMap.Fuentes
            ],
            'ADMIN_PORTAL'
          ),
        FechaFuente: now,
        FechaActualizacion: now
      };

      Object.keys(updates).forEach(
        function (header) {
          plan.peopleSheet.getRange(
            personRow.rowNumber,
            plan.peopleMap[header] + 1
          ).setValue(updates[header]);

          personRow.values[
            plan.peopleMap[header]
          ] = updates[header];
        }
      );

      peopleUpdated += 1;
    }

    owner.personId = personId;
    affectedPersonIds.push(personId);

    const sameOwnerLinks =
      plan.links.filter(function (link) {
        return (
          link.unitId === plan.unitId &&
          link.personId === personId &&
          link.active &&
          portalIsOwnerRole_(link.role)
        );
      });

    if (!owner.active) {
      sameOwnerLinks.forEach(
        function (link) {
          portalCloseAdminOwnerLink_(
            plan.linksSheet,
            plan.linksMap,
            link.rowNumber,
            now
          );
          link.active = false;
          linksRetired += 1;
        }
      );
      return;
    }

    activePersonIds.push(personId);

    let canonicalLink =
      sameOwnerLinks.length
        ? sameOwnerLinks[0]
        : null;

    if (!canonicalLink) {
      const linkId =
        'VIN-' +
        portalHash_(
          plan.unitId +
          '|' +
          personId +
          '|' +
          registrationId
        ).slice(0, 16).toUpperCase();

      const linkObject = {
        VinculoID: linkId,
        UnidadID: plan.unitId,
        PersonaID: personId,
        Rol: owner.role,
        EsContactoPrincipal:
          owner.primary ? 'SI' : 'NO',
        RecibeNotificaciones:
          owner.notifications ? 'SI' : 'NO',
        EstadoVinculo: 'ACTIVO',
        FechaInicio: now,
        FechaFin: '',
        Fuente: 'ADMIN_PORTAL',
        RegistroFuenteID:
          registrationId,
        FilaFuente: '',
        FechaActualizacion: now
      };

      plan.linksSheet.appendRow(
        plan.linksHeaders.map(
          function (header) {
            return (
              linkObject[header] !==
                undefined
                ? linkObject[header]
                : ''
            );
          }
        )
      );
    } else {
      const updates = {
        Rol: owner.role,
        EsContactoPrincipal:
          owner.primary ? 'SI' : 'NO',
        RecibeNotificaciones:
          owner.notifications ? 'SI' : 'NO',
        EstadoVinculo: 'ACTIVO',
        FechaFin: '',
        Fuente:
          portalAppendDelimitedValue_(
            canonicalLink.values[
              plan.linksMap.Fuente
            ],
            'ADMIN_PORTAL'
          ),
        RegistroFuenteID:
          registrationId,
        FechaActualizacion: now
      };

      Object.keys(updates).forEach(
        function (header) {
          plan.linksSheet.getRange(
            canonicalLink.rowNumber,
            plan.linksMap[header] + 1
          ).setValue(updates[header]);
        }
      );

      sameOwnerLinks.slice(1).forEach(
        function (duplicate) {
          portalCloseAdminOwnerLink_(
            plan.linksSheet,
            plan.linksMap,
            duplicate.rowNumber,
            now
          );
          duplicate.active = false;
          linksRetired += 1;
        }
      );
    }
  });

  // Los propietarios activos que el formulario envía explícitamente como
  // retirados ya fueron cerrados. Los propietarios existentes no incluidos
  // por una interfaz antigua se conservan para evitar retiros accidentales.
  const activeOwnersAfter =
    portalGetAdminPeople_(
      plan.unitId
    ).filter(function (person) {
      return portalIsOwnerRole_(
        person.rol
      );
    });

  if (!activeOwnersAfter.length) {
    throw new Error(
      'La actualización no puede dejar la unidad sin propietario activo.'
    );
  }

  const invalidated =
    portalInvalidateApprovedOwnerContacts_(
      plan.unitId,
      affectedPersonIds,
      session.email,
      reason
    );

  return {
    propietariosActivos:
      activeOwnersAfter.length,
    personasCreadas: peopleCreated,
    personasActualizadas:
      peopleUpdated,
    vinculosRetirados:
      linksRetired,
    contactosInvalidados:
      invalidated
  };
}

function portalCloseAdminOwnerLink_(
  sheet,
  map,
  rowNumber,
  now
) {
  sheet.getRange(
    rowNumber,
    map.EstadoVinculo + 1
  ).setValue('HISTORICO');
  sheet.getRange(
    rowNumber,
    map.FechaFin + 1
  ).setValue(now);
  sheet.getRange(
    rowNumber,
    map.FechaActualizacion + 1
  ).setValue(now);
}

function portalInvalidateApprovedOwnerContacts_(
  unitId,
  personIds,
  adminEmail,
  reason
) {
  const sheet =
    portalGetRequiredSheet_('APPROVED');
  const data =
    sheet.getDataRange().getValues();
  const headers =
    data[0].map(portalSafeTrim_);
  const map = portalHeaderMap_(headers);
  const ids = {};

  personIds.forEach(function (personId) {
    if (personId) ids[personId] = true;
  });

  let count = 0;

  for (
    let index = 1;
    index < data.length;
    index++
  ) {
    if (
      portalSafeTrim_(
        data[index][map.UnidadID]
      ).toUpperCase() !== unitId ||
      portalSafeTrim_(
        data[index][map.Seccion]
      ).toUpperCase() !== 'CONTACTO' ||
      portalSafeTrim_(
        data[index][map.Estado]
      ).toUpperCase() !== 'VIGENTE'
    ) {
      continue;
    }

    let contact = {};

    try {
      contact = JSON.parse(
        data[index][map.DatosJSON] ||
        '{}'
      );
    } catch (error) {
      contact = {};
    }

    if (
      contact.personaId &&
      ids[
        portalSafeTrim_(
          contact.personaId
        )
      ]
    ) {
      sheet.getRange(
        index + 1,
        map.Estado + 1
      ).setValue('HISTORICO');
      sheet.getRange(
        index + 1,
        map.FechaActualizacion + 1
      ).setValue(portalNow_());
      count += 1;
    }
  }

  if (count) {
    portalAudit_({
      action:
        'INVALIDAR_CONTACTO_APROBADO_ADMIN',
      role: PORTAL_ROLE.ADMIN,
      email: adminEmail,
      unitId: unitId,
      result: 'OK',
      detail:
        'Registros invalidados=' +
        count +
        ' | Motivo=' + reason
    });
  }

  return count;
}

function portalGenerateAdminPersonId_(
  documentNumber,
  existingById
) {
  let attempt = 0;
  let personId = '';

  do {
    personId =
      'PER-' +
      portalHash_(
        'ADMIN|' +
        documentNumber +
        '|' +
        attempt
      ).slice(0, 16).toUpperCase();
    attempt += 1;
  } while (existingById[personId]);

  return personId;
}

function portalNormalizeAdminPersonType_(value) {
  const type =
    portalSafeTrim_(value).toUpperCase();

  return (
    type.indexOf('JURID') !== -1 ||
    type === 'EMPRESA'
  )
    ? 'PERSONA_JURIDICA'
    : 'PERSONA_NATURAL';
}

function portalNormalizeAdminDocumentType_(
  value,
  personType
) {
  const type =
    portalSafeTrim_(value)
      .toUpperCase()
      .replace(/\s+/g, '_');

  if (
    personType === 'PERSONA_JURIDICA'
  ) {
    return 'NIT';
  }

  if (
    [
      'CC',
      'CEDULA',
      'CEDULA_CIUDADANIA'
    ].indexOf(type) !== -1
  ) {
    return 'CEDULA';
  }

  if (
    [
      'CE',
      'CEDULA_EXTRANJERIA'
    ].indexOf(type) !== -1
  ) {
    return 'CEDULA_EXTRANJERIA';
  }

  if (type === 'PASAPORTE') {
    return 'PASAPORTE';
  }

  if (type === 'NIT') {
    return 'NIT';
  }

  return 'OTRO';
}

function portalNormalizeAdminOwnerRole_(value) {
  const role =
    portalSafeTrim_(value).toUpperCase();

  return role.indexOf('COPROPIET') !== -1
    ? 'COPROPIETARIO'
    : 'PROPIETARIO';
}

function portalNormalizeAdminUnitState_(value) {
  const state =
    portalSafeTrim_(value).toUpperCase();

  if (
    [
      'ACTIVA',
      'PENDIENTE_ENTREGA',
      'INACTIVA'
    ].indexOf(state) !== -1
  ) {
    return state;
  }

  return state || 'ACTIVA';
}

function portalNormalizeAdminDeliveryState_(
  value
) {
  const state =
    portalSafeTrim_(value).toUpperCase();

  if (
    [
      'ENTREGADO',
      'PENDIENTE',
      'NO_REGISTRADO'
    ].indexOf(state) !== -1
  ) {
    return state;
  }

  return state || 'NO_REGISTRADO';
}

function portalNormalizeAdminDate_(value) {
  const text =
    portalSafeTrim_(value);

  if (!text) return '';

  const match =
    text.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (!match) {
    throw new Error(
      'La fecha de entrega debe usar el formato AAAA-MM-DD.'
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date =
    new Date(year, month - 1, day, 12, 0, 0);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new Error(
      'La fecha de entrega no es válida.'
    );
  }

  return date;
}

function portalDateInputValue_(value) {
  if (!value) return '';

  if (
    value instanceof Date &&
    !isNaN(value.getTime())
  ) {
    return Utilities.formatDate(
      value,
      PORTAL_TIMEZONE,
      'yyyy-MM-dd'
    );
  }

  const text =
    portalSafeTrim_(value);
  const match =
    text.match(/^(\d{4}-\d{2}-\d{2})/);

  return match ? match[1] : '';
}

function portalComparableValue_(value) {
  if (
    value instanceof Date &&
    !isNaN(value.getTime())
  ) {
    return Utilities.formatDate(
      value,
      PORTAL_TIMEZONE,
      'yyyy-MM-dd'
    );
  }

  return portalSafeTrim_(value);
}

function portalNormalizePhoneList_(value) {
  const raw =
    portalSafeTrim_(value);

  if (!raw) return '';

  return portalUnique_(
    raw.split(/[;,|\n]+/)
      .map(function (phone) {
        return portalNormalizePhone_(
          phone
        );
      })
      .filter(function (phone) {
        return phone.length >= 7;
      })
  ).join(', ');
}

/**
 * Diagnóstico sin escritura para confirmar la información editable.
 */
function portalDiagnosticarEdicionApartamentoAdmin(
  unidadId
) {
  const id =
    portalNormalizeUnitInput_(
      '',
      '',
      unidadId
    );

  if (!id || !dmObtenerUnidad(id)) {
    return {
      ok: false,
      unidadId: id,
      motivo:
        'UNIDAD_NO_ENCONTRADA'
    };
  }

  const profile =
    portalBuildAdminProfile_(
      id,
      'diagnostico-admin@bulevarverde.local'
    );

  return {
    ok: true,
    version: PORTAL_VERSION,
    unidadId: id,
    propietariosActivos:
      (profile.propietarios || []).length,
    otrasPersonas:
      (profile.otrasPersonas || []).length,
    camposUnidadEditables:
      Object.keys(
        profile.camposUnidadEditables || {}
      ),
    camposProtegidos:
      Object.keys(
        profile.camposUnidadProtegidos || {}
      ),
    accionPublicada:
      'actualizarApartamentoAdmin'
  };
}


function portalListarSolicitudes(payload, origin) {
  payload = payload || {};
  portalRequireSession_(payload.token, origin, [PORTAL_ROLE.ADMIN]);
  const status = portalSafeTrim_(payload.estado || PORTAL_REQUEST_STATUS.PENDING).toUpperCase();
  const rows = portalReadObjects_(PORTAL_SHEETS.REQUESTS)
    .filter(function (row) {
      return !status || portalSafeTrim_(row.Estado).toUpperCase() === status;
    })
    .sort(function (a, b) {
      return String(b.FechaSolicitud).localeCompare(String(a.FechaSolicitud));
    })
    .slice(0, 100)
    .map(portalRequestPublicView_);

  return { solicitudes: rows };
}

function portalResolverSolicitud(payload, origin) {
  payload = payload || {};
  const session = portalRequireSession_(payload.token, origin, [PORTAL_ROLE.ADMIN]);
  const requestId = portalSafeTrim_(payload.solicitudId);
  const decision = portalSafeTrim_(payload.decision).toUpperCase();
  const observations = portalLimitText_(payload.observaciones, 1500);

  if ([PORTAL_REQUEST_STATUS.APPROVED, PORTAL_REQUEST_STATUS.REJECTED].indexOf(decision) === -1) {
    throw new Error('Decisión inválida.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const sheet = portalGetRequiredSheet_('REQUESTS');
    const data = sheet.getDataRange().getValues();
    const headers = data[0].map(portalSafeTrim_);
    const map = portalHeaderMap_(headers);
    let targetRow = -1;
    let row = null;

    for (let i = 1; i < data.length; i++) {
      if (portalSafeTrim_(data[i][map.SolicitudID]) === requestId) {
        targetRow = i + 1;
        row = data[i];
        break;
      }
    }

    if (targetRow === -1) throw new Error('Solicitud no encontrada.');
    if (portalSafeTrim_(row[map.Estado]).toUpperCase() !== PORTAL_REQUEST_STATUS.PENDING) {
      throw new Error('La solicitud ya fue resuelta.');
    }

    const unitId = portalSafeTrim_(row[map.UnidadID]).toUpperCase();
    const previous = portalParseJson_(row[map.DatosAnterioresJSON], {});
    const proposed = portalParseJson_(row[map.DatosPropuestosJSON], {});
    let result = 'Solicitud rechazada.';
    let appliedAt = '';

    if (decision === PORTAL_REQUEST_STATUS.APPROVED) {
      const appliedProposed = {};
      Object.keys(proposed).forEach(function (section) {
        appliedProposed[section] = proposed[section];
      });

      let residentsSync = null;
      if (Array.isArray(proposed.RESIDENTES)) {
        residentsSync = portalApplyResidentsToMaster_(
          unitId,
          requestId,
          Array.isArray(previous.RESIDENTES) ? previous.RESIDENTES : [],
          proposed.RESIDENTES,
          session.email
        );
        appliedProposed.RESIDENTES = residentsSync.residentes;
      }

      let vehiclesSync = null;
      if (Array.isArray(proposed.VEHICULOS)) {
        vehiclesSync = portalApplyVehiclesToMaster_(
          unitId,
          requestId,
          Array.isArray(previous.VEHICULOS) ? previous.VEHICULOS : [],
          proposed.VEHICULOS,
          session.email
        );
        // Solo las placas reconocidas permanecen como vehículos vigentes del
        // apartamento. Las no reconocidas pasan al bien técnico 9999.
        appliedProposed.VEHICULOS = vehiclesSync.vehiculos;
      }

      portalApplyApprovedSections_(
        unitId,
        requestId,
        appliedProposed,
        session.email
      );
      appliedAt = portalNow_();
      result = 'Secciones aprobadas y registradas como datos vigentes del portal.';

      if (residentsSync) {
        result += ' Residentes sincronizados con Personas y Vinculos_Unidad: ' +
          residentsSync.actualizados + ' actualizados, ' +
          residentsSync.creados + ' creados, ' +
          residentsSync.vinculosCerrados + ' vínculos cerrados.';
      }

      if (vehiclesSync) {
        result += ' Vehículos sincronizados: ' +
          vehiclesSync.reconocidos + ' reconocidos, ' +
          vehiclesSync.visitantes + ' visitantes autorizados y ' +
          vehiclesSync.noReconocidos + ' enviados al bien 9999.';
      }
    }

    sheet.getRange(targetRow, map.Estado + 1).setValue(decision);
    sheet.getRange(targetRow, map.FechaDecision + 1).setValue(portalNow_());
    sheet.getRange(targetRow, map.UsuarioDecision + 1).setValue(session.email);
    sheet.getRange(targetRow, map.ObservacionesDecision + 1).setValue(observations);
    sheet.getRange(targetRow, map.FechaAplicacion + 1).setValue(appliedAt);
    sheet.getRange(targetRow, map.ResultadoAplicacion + 1).setValue(result);

    portalAudit_({
      action: 'RESOLVER_SOLICITUD', role: session.role, email: session.email,
      unitId: unitId, result: decision, detail: requestId
    });

    return { ok: true, solicitudId: requestId, estado: decision, resultado: result };
  } finally {
    lock.releaseLock();
  }
}

function portalApplyApprovedSections_(unitId, requestId, proposed, approvedBy) {
  const sheet = portalGetRequiredSheet_('APPROVED');
  const currentRows = portalReadObjectsFromSheet_(sheet);

  Object.keys(proposed).forEach(function (section) {
    if (PORTAL_ALLOWED_SECTIONS.indexOf(section) === -1) return;

    currentRows.forEach(function (row, index) {
      if (portalSafeTrim_(row.UnidadID).toUpperCase() === unitId &&
          portalSafeTrim_(row.Seccion).toUpperCase() === section &&
          portalSafeTrim_(row.Estado).toUpperCase() === 'VIGENTE') {
        sheet.getRange(index + 2, 5).setValue('REEMPLAZADO');
        sheet.getRange(index + 2, 9).setValue(portalNow_());
      }
    });

    sheet.appendRow([
      'APR-' + Utilities.getUuid(),
      unitId,
      section,
      JSON.stringify(proposed[section]),
      'VIGENTE',
      requestId,
      portalNow_(),
      approvedBy,
      portalNow_()
    ]);
  });
}


/**
 * Sincroniza una sección RESIDENTES aprobada con las tablas maestras.
 *
 * Reglas:
 * - Correlaciona primero por PersonaID, luego por documento y finalmente por
 *   el nombre anterior de la misma posición de la solicitud.
 * - Actualiza el nombre en Personas.
 * - Conserva un solo vínculo ACTIVO por persona y unidad.
 * - Nunca degrada un vínculo de PROPIETARIO/COPROPIETARIO a RESIDENTE.
 * - Los residentes retirados pasan a HISTORICO; los propietarios se conservan.
 * - Los residentes nuevos sin documento se crean como personas pendientes de
 *   completar, pero no podrán autenticarse hasta registrar su documento.
 */
function portalApplyResidentsToMaster_(
  unitId,
  requestId,
  previousRows,
  proposedRows,
  approvedBy
) {
  unitId = portalSafeTrim_(unitId).toUpperCase();
  previousRows = Array.isArray(previousRows) ? previousRows : [];
  proposedRows = Array.isArray(proposedRows) ? proposedRows : [];

  const ss = portalGetSpreadsheet_();
  const peopleSheetName = typeof DM_SHEETS !== 'undefined'
    ? DM_SHEETS.PERSONAS
    : 'Personas';
  const linksSheetName = typeof DM_SHEETS !== 'undefined'
    ? DM_SHEETS.VINCULOS_UNIDAD
    : 'Vinculos_Unidad';
  const peopleSheet = ss.getSheetByName(peopleSheetName);
  const linksSheet = ss.getSheetByName(linksSheetName);

  if (!peopleSheet || !linksSheet) {
    throw new Error(
      'No existen las hojas Personas y Vinculos_Unidad requeridas para aplicar la aprobación.'
    );
  }

  const peopleData = peopleSheet.getDataRange().getValues();
  const linksData = linksSheet.getDataRange().getValues();
  const peopleHeaders = peopleData[0].map(portalSafeTrim_);
  const linksHeaders = linksData[0].map(portalSafeTrim_);
  const pm = portalHeaderMap_(peopleHeaders);
  const lm = portalHeaderMap_(linksHeaders);

  portalRequireHeaders_(pm, [
    'PersonaID', 'TipoPersona', 'TipoDocumento', 'NumeroDocumento',
    'NombreCompleto', 'EstadoPersona', 'Fuentes', 'FechaFuente',
    'FechaActualizacion'
  ], peopleSheetName);
  portalRequireHeaders_(lm, [
    'VinculoID', 'UnidadID', 'PersonaID', 'Rol', 'EsContactoPrincipal',
    'RecibeNotificaciones', 'EstadoVinculo', 'FechaInicio', 'FechaFin',
    'Fuente', 'RegistroFuenteID', 'FilaFuente', 'FechaActualizacion'
  ], linksSheetName);

  const peopleById = {};
  const peopleByDocument = {};
  const peopleByName = {};

  for (let i = 1; i < peopleData.length; i++) {
    const personId = portalSafeTrim_(peopleData[i][pm.PersonaID]);
    if (!personId) continue;

    const entry = {
      rowNumber: i + 1,
      values: peopleData[i],
      personaId: personId,
      nombre: portalSafeTrim_(peopleData[i][pm.NombreCompleto]),
      documento: portalNormalizeDocument_(peopleData[i][pm.NumeroDocumento])
    };
    peopleById[personId] = entry;

    if (entry.documento) {
      if (!peopleByDocument[entry.documento]) peopleByDocument[entry.documento] = [];
      peopleByDocument[entry.documento].push(entry);
    }

    const nameKey = portalNormalizePersonName_(entry.nombre);
    if (nameKey) {
      if (!peopleByName[nameKey]) peopleByName[nameKey] = [];
      peopleByName[nameKey].push(entry);
    }
  }

  const links = [];
  for (let j = 1; j < linksData.length; j++) {
    const linkUnitId = portalSafeTrim_(linksData[j][lm.UnidadID]).toUpperCase();
    if (linkUnitId !== unitId) continue;

    links.push({
      rowNumber: j + 1,
      values: linksData[j],
      vinculoId: portalSafeTrim_(linksData[j][lm.VinculoID]),
      personaId: portalSafeTrim_(linksData[j][lm.PersonaID]),
      rol: portalSafeTrim_(linksData[j][lm.Rol]).toUpperCase(),
      estado: portalSafeTrim_(linksData[j][lm.EstadoVinculo]).toUpperCase(),
      fuente: portalSafeTrim_(linksData[j][lm.Fuente]),
      active: portalSafeTrim_(linksData[j][lm.EstadoVinculo]).toUpperCase() === 'ACTIVO'
    });
  }

  function activeLinksForPerson(personId) {
    return links.filter(function (link) {
      return link.personaId === personId && link.active;
    });
  }

  function activePersonEntries() {
    const result = [];
    const seen = {};
    links.forEach(function (link) {
      if (!link.active || seen[link.personaId] || !peopleById[link.personaId]) return;
      seen[link.personaId] = true;
      result.push(peopleById[link.personaId]);
    });
    return result;
  }

  function uniqueCandidate(candidates) {
    const activeIds = {};
    activePersonEntries().forEach(function (entry) {
      activeIds[entry.personaId] = true;
    });
    const filtered = (candidates || []).filter(function (entry) {
      return activeIds[entry.personaId];
    });
    return filtered.length === 1 ? filtered[0] : null;
  }

  function findExistingPerson(row, index, allowNewName) {
    row = row || {};
    const previous = previousRows[index] || {};
    const directIds = [
      portalSafeTrim_(row.personaId || row.PersonaID),
      portalSafeTrim_(previous.personaId || previous.PersonaID)
    ].filter(Boolean);

    for (let d = 0; d < directIds.length; d++) {
      if (peopleById[directIds[d]] && activeLinksForPerson(directIds[d]).length) {
        return peopleById[directIds[d]];
      }
    }

    const documents = [
      portalNormalizeDocument_(row.numeroDocumento || row.NumeroDocumento),
      portalNormalizeDocument_(previous.numeroDocumento || previous.NumeroDocumento)
    ].filter(Boolean);

    for (let x = 0; x < documents.length; x++) {
      const byDocument = uniqueCandidate(peopleByDocument[documents[x]] || []);
      if (byDocument) return byDocument;
    }

    const oldNameKey = portalNormalizePersonName_(previous.nombre || previous.NombreCompleto);
    if (oldNameKey) {
      const byOldName = uniqueCandidate(peopleByName[oldNameKey] || []);
      if (byOldName) return byOldName;
    }

    if (allowNewName) {
      const newNameKey = portalNormalizePersonName_(row.nombre || row.NombreCompleto);
      if (newNameKey) {
        const byNewName = uniqueCandidate(peopleByName[newNameKey] || []);
        if (byNewName) return byNewName;
      }
    }

    return null;
  }

  const now = portalNow_();
  const result = {
    residentes: [],
    actualizados: 0,
    creados: 0,
    vinculosCerrados: 0,
    vinculosActualizados: 0,
    eliminados: 0
  };
  const proposedPersonIds = {};

  function closeLink(link) {
    if (!link || !link.active) return;
    linksSheet.getRange(link.rowNumber, lm.EstadoVinculo + 1).setValue('HISTORICO');
    linksSheet.getRange(link.rowNumber, lm.FechaFin + 1).setValue(now);
    linksSheet.getRange(link.rowNumber, lm.FechaActualizacion + 1).setValue(now);
    link.active = false;
    link.estado = 'HISTORICO';
    result.vinculosCerrados += 1;
  }

  function updatePersonName(entry, newName) {
    newName = portalLimitText_(newName, 150);
    if (!newName) return;

    if (portalSafeTrim_(entry.nombre) !== newName) {
      peopleSheet.getRange(entry.rowNumber, pm.NombreCompleto + 1).setValue(newName);
      entry.nombre = newName;
      result.actualizados += 1;
    }

    const sources = portalAppendDelimitedValue_(
      entry.values[pm.Fuentes],
      'PORTAL_APROBADO'
    );
    peopleSheet.getRange(entry.rowNumber, pm.Fuentes + 1).setValue(sources);
    peopleSheet.getRange(entry.rowNumber, pm.EstadoPersona + 1).setValue('ACTIVA');
    peopleSheet.getRange(entry.rowNumber, pm.FechaActualizacion + 1).setValue(now);
  }

  function createPerson(row, index) {
    const name = portalLimitText_(row.nombre || row.NombreCompleto, 150);
    let personId = 'PER-' + portalHash_(
      unitId + '|' + requestId + '|' + index + '|' + name
    ).slice(0, 16).toUpperCase();
    let suffix = 0;
    while (peopleById[personId]) {
      suffix += 1;
      personId = 'PER-' + portalHash_(
        unitId + '|' + requestId + '|' + index + '|' + name + '|' + suffix
      ).slice(0, 16).toUpperCase();
    }

    const document = portalNormalizeDocument_(row.numeroDocumento || row.NumeroDocumento);
    const values = [
      personId,
      'PERSONA_NATURAL',
      document ? 'CEDULA' : '',
      document,
      name,
      '',
      '',
      '',
      '',
      'ACTIVA',
      'PORTAL_APROBADO',
      now,
      now
    ];
    peopleSheet.appendRow(values);

    const entry = {
      rowNumber: peopleSheet.getLastRow(),
      values: values,
      personaId: personId,
      nombre: name,
      documento: document
    };
    peopleById[personId] = entry;
    result.creados += 1;
    return entry;
  }

  function linkScore(link) {
    let score = 0;
    const source = portalSafeTrim_(link.fuente).toUpperCase();
    if (portalIsOwnerRole_(link.rol)) score += 1000;
    if (source.indexOf('INFO_APTOS') !== -1) score += 200;
    if (source.indexOf('CENSO') !== -1) score += 100;
    if (source.indexOf('PORTAL') !== -1) score += 50;
    if (portalYes_(link.values[lm.EsContactoPrincipal])) score += 20;
    if (portalYes_(link.values[lm.RecibeNotificaciones])) score += 10;
    return score;
  }

  function ensureSingleActiveLink(entry, requestedRole) {
    let active = activeLinksForPerson(entry.personaId);
    requestedRole = portalNormalizeResidentRole_(requestedRole);

    if (!active.length) {
      const linkId = 'VIN-' + portalHash_(
        unitId + '|' + entry.personaId + '|' + requestId
      ).slice(0, 16).toUpperCase();
      const values = [
        linkId,
        unitId,
        entry.personaId,
        requestedRole,
        'NO',
        'NO',
        'ACTIVO',
        now,
        '',
        'PORTAL_APROBADO',
        requestId,
        '',
        now
      ];
      linksSheet.appendRow(values);
      links.push({
        rowNumber: linksSheet.getLastRow(),
        values: values,
        vinculoId: linkId,
        personaId: entry.personaId,
        rol: requestedRole,
        estado: 'ACTIVO',
        fuente: 'PORTAL_APROBADO',
        active: true
      });
      result.vinculosActualizados += 1;
      return requestedRole;
    }

    active.sort(function (a, b) {
      return linkScore(b) - linkScore(a);
    });
    const canonical = active[0];
    const ownerLink = active.find(function (link) {
      return portalIsOwnerRole_(link.rol);
    });
    const finalRole = ownerLink
      ? portalNormalizeResidentRole_(ownerLink.rol)
      : requestedRole;

    const canonicalLink = ownerLink || canonical;
    linksSheet.getRange(canonicalLink.rowNumber, lm.Rol + 1).setValue(finalRole);
    linksSheet.getRange(canonicalLink.rowNumber, lm.EstadoVinculo + 1).setValue('ACTIVO');
    linksSheet.getRange(canonicalLink.rowNumber, lm.FechaFin + 1).setValue('');
    linksSheet.getRange(canonicalLink.rowNumber, lm.Fuente + 1).setValue(
      portalAppendDelimitedValue_(canonicalLink.fuente, 'PORTAL_APROBADO')
    );
    linksSheet.getRange(canonicalLink.rowNumber, lm.RegistroFuenteID + 1).setValue(requestId);
    linksSheet.getRange(canonicalLink.rowNumber, lm.FechaActualizacion + 1).setValue(now);
    canonicalLink.rol = finalRole;
    canonicalLink.active = true;

    active.forEach(function (link) {
      if (link.rowNumber !== canonicalLink.rowNumber) closeLink(link);
    });
    result.vinculosActualizados += 1;
    return finalRole;
  }

  proposedRows.forEach(function (row, index) {
    const name = portalLimitText_(row.nombre || row.NombreCompleto, 150);
    if (!name) return;

    let person = findExistingPerson(row, index, true);
    if (!person) person = createPerson(row, index);

    updatePersonName(person, name);
    const requestedRole = portalNormalizeResidentRole_(row.rol || row.Rol);
    ensureSingleActiveLink(person, requestedRole);
    proposedPersonIds[person.personaId] = true;

    result.residentes.push({
      personaId: person.personaId,
      numeroDocumento: person.documento || '',
      nombre: name,
      rol: requestedRole
    });
  });

  previousRows.forEach(function (row, index) {
    const person = findExistingPerson(row, index, true);
    if (!person || proposedPersonIds[person.personaId]) return;

    activeLinksForPerson(person.personaId).forEach(function (link) {
      if (portalIsOwnerRole_(link.rol)) return;
      if (portalIsResidentRole_(link.rol)) {
        closeLink(link);
        result.eliminados += 1;
      }
    });
  });

  portalAudit_({
    action: 'APLICAR_RESIDENTES_MAESTRO',
    role: PORTAL_ROLE.ADMIN,
    email: approvedBy || '',
    unitId: unitId,
    result: 'OK',
    detail: requestId +
      ' | Actualizados=' + result.actualizados +
      ' | Creados=' + result.creados +
      ' | VinculosCerrados=' + result.vinculosCerrados +
      ' | Eliminados=' + result.eliminados
  });

  return result;
}

function portalRequireHeaders_(map, required, sheetName) {
  const missing = required.filter(function (header) {
    return map[header] === undefined;
  });
  if (missing.length) {
    throw new Error(
      'La hoja ' + sheetName + ' no contiene las columnas: ' + missing.join(', ')
    );
  }
}

function portalNormalizePersonName_(value) {
  return portalSafeTrim_(value)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function portalNormalizeResidentRole_(value) {
  const role = portalSafeTrim_(value).toUpperCase();
  const principal =
    role.indexOf('PRINCIPAL') !== -1;

  if (role.indexOf('COPROPIET') !== -1) {
    return 'COPROPIETARIO';
  }

  if (role.indexOf('PROPIET') !== -1) {
    return 'PROPIETARIO';
  }

  if (role.indexOf('ARREND') !== -1) {
    return principal
      ? 'ARRENDATARIO PRINCIPAL'
      : 'ARRENDATARIO';
  }

  if (role.indexOf('OCUPANTE') !== -1) {
    return principal
      ? 'RESIDENTE PRINCIPAL'
      : 'OCUPANTE AUTORIZADO';
  }

  return principal
    ? 'RESIDENTE PRINCIPAL'
    : 'RESIDENTE';
}

function portalIsOwnerRole_(value) {
  const role = portalSafeTrim_(value).toUpperCase();
  return role.indexOf('PROPIET') !== -1 || role.indexOf('COPROPIET') !== -1;
}

function portalIsResidentRole_(value) {
  const role = portalSafeTrim_(value).toUpperCase();
  return role.indexOf('RESIDENT') !== -1 ||
    role.indexOf('ARREND') !== -1 ||
    role.indexOf('OCUPANTE') !== -1;
}

function portalAppendDelimitedValue_(current, value) {
  const items = portalSafeTrim_(current)
    .split('|')
    .map(portalSafeTrim_)
    .filter(Boolean);
  const normalized = portalSafeTrim_(value);
  if (normalized && items.indexOf(normalized) === -1) items.push(normalized);
  return items.join('|');
}

function portalFindRequestRow_(requestId) {
  const sheet = portalGetRequiredSheet_('REQUESTS');
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(portalSafeTrim_);
  const map = portalHeaderMap_(headers);

  for (let i = 1; i < data.length; i++) {
    if (portalSafeTrim_(data[i][map.SolicitudID]) === portalSafeTrim_(requestId)) {
      const object = {};
      headers.forEach(function (header, index) {
        object[header] = data[i][index];
      });
      return { sheet: sheet, rowNumber: i + 1, row: object };
    }
  }
  return null;
}

function portalUpdateApprovedResidentsPayload_(unitId, requestId, residents) {
  const sheet = portalGetRequiredSheet_('APPROVED');
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(portalSafeTrim_);
  const map = portalHeaderMap_(headers);

  for (let i = 1; i < data.length; i++) {
    if (
      portalSafeTrim_(data[i][map.UnidadID]).toUpperCase() === unitId &&
      portalSafeTrim_(data[i][map.Seccion]).toUpperCase() === 'RESIDENTES' &&
      portalSafeTrim_(data[i][map.SolicitudID]) === requestId &&
      portalSafeTrim_(data[i][map.Estado]).toUpperCase() === 'VIGENTE'
    ) {
      sheet.getRange(i + 1, map.DatosJSON + 1).setValue(JSON.stringify(residents));
      sheet.getRange(i + 1, map.FechaActualizacion + 1).setValue(portalNow_());
      return true;
    }
  }
  return false;
}


/***************************************
 * SINCRONIZACIÓN DE VEHÍCULOS Y BIEN 9999
 ***************************************/
function portalNormalizeVehicleRecognition_(value) {
  const normalized = portalSafeTrim_(value).toUpperCase();
  if (normalized === PORTAL_VEHICLE_RECOGNITION.PROPIO) {
    return PORTAL_VEHICLE_RECOGNITION.PROPIO;
  }
  if (normalized === PORTAL_VEHICLE_RECOGNITION.VISITANTE) {
    return PORTAL_VEHICLE_RECOGNITION.VISITANTE;
  }
  if (normalized === PORTAL_VEHICLE_RECOGNITION.NO_RECONOCIDO) {
    return PORTAL_VEHICLE_RECOGNITION.NO_RECONOCIDO;
  }
  return PORTAL_VEHICLE_RECOGNITION.PENDIENTE;
}

function portalNormalizeVehicleTypePortal_(value) {
  const type = portalSafeTrim_(value).toUpperCase();
  if (['CARRO', 'MOTO', 'OTRO', 'TRICICLO', 'NO_MOTORIZADO'].indexOf(type) !== -1) {
    return type;
  }
  return 'PENDIENTE_VALIDACION';
}

function portalVehicleRecognitionFromLink_(vehicle) {
  const linkType = portalSafeTrim_(vehicle.tipoVinculo).toUpperCase();
  const source = portalSafeTrim_(vehicle.fuenteGanadora || vehicle.fuente).toUpperCase();
  if (linkType === 'RESIDENTE' || source === 'CENSO') {
    return PORTAL_VEHICLE_RECOGNITION.PROPIO;
  }
  if (linkType === 'VISITANTE_AUTORIZADO') {
    return PORTAL_VEHICLE_RECOGNITION.VISITANTE;
  }
  return PORTAL_VEHICLE_RECOGNITION.PENDIENTE;
}

function portalCountVehiclesInUnit_(unitId) {
  return portalReadMasterObjectsSafe_(
    typeof DM_SHEETS !== 'undefined' ? DM_SHEETS.VINCULOS_VEHICULO : 'Vinculos_Vehiculo'
  ).filter(function (row) {
    return portalSafeTrim_(row.UnidadID).toUpperCase() === unitId &&
      portalYes_(row.EsActual);
  }).length;
}

function portalEnsureUnidentifiedUnit_() {
  const ss = portalGetSpreadsheet_();
  const sheetName = typeof DM_SHEETS !== 'undefined' ? DM_SHEETS.UNIDADES : 'Unidades';
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('No existe la hoja Unidades.');

  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(portalSafeTrim_);
  const map = portalHeaderMap_(headers);
  portalRequireHeaders_(map, ['UnidadID'], sheetName);

  for (let i = 1; i < data.length; i++) {
    if (portalSafeTrim_(data[i][map.UnidadID]) === PORTAL_UNIDENTIFIED_UNIT_ID) {
      return;
    }
  }

  const row = headers.map(function (header) {
    const values = {
      UnidadID: PORTAL_UNIDENTIFIED_UNIT_ID,
      Torre: '',
      Apartamento: PORTAL_UNIDENTIFIED_UNIT_ID,
      CodigoOficial: PORTAL_UNIDENTIFIED_UNIT_ID,
      CodigoOriginal: PORTAL_UNIDENTIFIED_UNIT_ID,
      Proyecto: 'BULEVAR_VERDE',
      EstadoUnidad: 'BIEN_SIN_IDENTIFICAR',
      EstadoEntregaApartamento: 'NO_APLICA',
      FuentePrincipal: 'SISTEMA',
      FechaActualizacion: portalNow_()
    };
    return Object.prototype.hasOwnProperty.call(values, header) ? values[header] : '';
  });
  sheet.appendRow(row);
}

function portalFindMasterVehicleByPlate_(plate) {
  const normalized = portalNormalizePlate_(plate);
  const rows = portalReadMasterObjectsSafe_(
    typeof DM_SHEETS !== 'undefined' ? DM_SHEETS.VEHICULOS : 'Vehiculos'
  );
  return rows.find(function (row) {
    return portalNormalizePlate_(row.Placa) === normalized;
  }) || null;
}

function portalSaveVehicleOverride_(data) {
  const sheet = portalGetRequiredSheet_('VEHICLE_OVERRIDES');
  const rows = sheet.getDataRange().getValues();
  const headers = rows[0].map(portalSafeTrim_);
  const map = portalHeaderMap_(headers);
  portalRequireHeaders_(map, [
    'OverrideID', 'VehiculoID', 'Placa', 'UnidadOrigenID',
    'UnidadDestinoID', 'Accion', 'TipoVehiculo', 'TipoVinculo',
    'Estado', 'SolicitudID', 'Motivo', 'Usuario',
    'FechaCreacion', 'FechaActualizacion'
  ], PORTAL_SHEETS.VEHICLE_OVERRIDES);

  const plate = portalNormalizePlate_(data.placa);
  for (let i = 1; i < rows.length; i++) {
    if (
      portalNormalizePlate_(rows[i][map.Placa]) === plate &&
      portalSafeTrim_(rows[i][map.Estado]).toUpperCase() === 'ACTIVO'
    ) {
      sheet.getRange(i + 1, map.Estado + 1).setValue('REEMPLAZADO');
      sheet.getRange(i + 1, map.FechaActualizacion + 1).setValue(portalNow_());
    }
  }

  const override = {
    OverrideID: 'OVV-' + Utilities.getUuid(),
    VehiculoID: data.vehiculoId || ('VEH-' + plate),
    Placa: plate,
    UnidadOrigenID: portalSafeTrim_(data.unidadOrigenId).toUpperCase(),
    UnidadDestinoID: portalSafeTrim_(data.unidadDestinoId).toUpperCase(),
    Accion: portalSafeTrim_(data.accion).toUpperCase(),
    TipoVehiculo: portalNormalizeVehicleTypePortal_(data.tipoVehiculo),
    TipoVinculo: portalSafeTrim_(data.tipoVinculo).toUpperCase(),
    Estado: 'ACTIVO',
    SolicitudID: data.solicitudId || '',
    Motivo: portalLimitText_(data.motivo, 1000),
    Usuario: portalNormalizeEmail_(data.usuario) || portalSafeTrim_(data.usuario),
    FechaCreacion: portalNow_(),
    FechaActualizacion: portalNow_()
  };

  sheet.appendRow(headers.map(function (header) {
    return Object.prototype.hasOwnProperty.call(override, header) ? override[header] : '';
  }));
  return override;
}

function portalApplyVehicleOverrideToMaster_(override) {
  portalEnsureUnidentifiedUnit_();
  const ss = portalGetSpreadsheet_();
  const vehicleSheetName = typeof DM_SHEETS !== 'undefined' ? DM_SHEETS.VEHICULOS : 'Vehiculos';
  const linkSheetName = typeof DM_SHEETS !== 'undefined' ? DM_SHEETS.VINCULOS_VEHICULO : 'Vinculos_Vehiculo';
  const vehicleSheet = ss.getSheetByName(vehicleSheetName);
  const linkSheet = ss.getSheetByName(linkSheetName);
  if (!vehicleSheet || !linkSheet) {
    throw new Error('No existen las hojas Vehiculos y Vinculos_Vehiculo.');
  }

  const plate = portalNormalizePlate_(override.Placa);
  const vehicleId = portalSafeTrim_(override.VehiculoID) || ('VEH-' + plate);
  const action = portalSafeTrim_(override.Accion).toUpperCase();
  const now = portalNow_();

  const vehicleData = vehicleSheet.getDataRange().getValues();
  const vehicleHeaders = vehicleData[0].map(portalSafeTrim_);
  const vm = portalHeaderMap_(vehicleHeaders);
  portalRequireHeaders_(vm, [
    'VehiculoID', 'Placa', 'TipoVehiculo', 'EstadoVehiculo',
    'Fuentes', 'FechaActualizacion'
  ], vehicleSheetName);

  const linkData = linkSheet.getDataRange().getValues();
  const linkHeaders = linkData[0].map(portalSafeTrim_);
  const lm = portalHeaderMap_(linkHeaders);
  portalRequireHeaders_(lm, [
    'AsignacionVehiculoID', 'VehiculoID', 'UnidadID', 'EstadoAsignacion',
    'EsActual', 'Fuente', 'FechaActualizacion', 'TipoVinculo',
    'FuenteGanadora', 'FuentesRespaldo', 'Confianza', 'EstadoRevision',
    'VigenteDesde', 'VigenteHasta'
  ], linkSheetName);

  let vehicleRow = -1;
  for (let i = 1; i < vehicleData.length; i++) {
    if (
      portalSafeTrim_(vehicleData[i][vm.VehiculoID]) === vehicleId ||
      portalNormalizePlate_(vehicleData[i][vm.Placa]) === plate
    ) {
      vehicleRow = i + 1;
      break;
    }
  }

  if (action === 'ELIMINAR') {
    for (let i = linkData.length - 1; i >= 1; i--) {
      if (portalSafeTrim_(linkData[i][lm.VehiculoID]) === vehicleId) {
        linkSheet.deleteRow(i + 1);
      }
    }
    if (vehicleRow > 0) vehicleSheet.deleteRow(vehicleRow);
    return { accion: action, placa: plate, eliminado: true };
  }

  if (vehicleRow > 0) {
    vehicleSheet.getRange(vehicleRow, vm.Placa + 1).setValue(plate);
    vehicleSheet.getRange(vehicleRow, vm.TipoVehiculo + 1).setValue(
      portalNormalizeVehicleTypePortal_(override.TipoVehiculo)
    );
    vehicleSheet.getRange(vehicleRow, vm.EstadoVehiculo + 1).setValue(
      override.UnidadDestinoID === PORTAL_UNIDENTIFIED_UNIT_ID
        ? 'PENDIENTE_IDENTIFICACION'
        : 'VALIDADO_ADMIN'
    );
    const currentSources = portalSafeTrim_(vehicleSheet.getRange(vehicleRow, vm.Fuentes + 1).getValue());
    vehicleSheet.getRange(vehicleRow, vm.Fuentes + 1).setValue(
      portalUnique_(currentSources.split('|').concat(['PORTAL_APROBADO']).filter(Boolean)).join('|')
    );
    vehicleSheet.getRange(vehicleRow, vm.FechaActualizacion + 1).setValue(now);
  } else {
    const vehicleObject = {
      VehiculoID: vehicleId,
      Placa: plate,
      TipoVehiculo: portalNormalizeVehicleTypePortal_(override.TipoVehiculo),
      EstadoVehiculo: override.UnidadDestinoID === PORTAL_UNIDENTIFIED_UNIT_ID
        ? 'PENDIENTE_IDENTIFICACION'
        : 'VALIDADO_ADMIN',
      Fuentes: 'PORTAL_APROBADO',
      FechaActualizacion: now
    };
    vehicleSheet.appendRow(vehicleHeaders.map(function (header) {
      return Object.prototype.hasOwnProperty.call(vehicleObject, header)
        ? vehicleObject[header]
        : '';
    }));
  }

  let supportSources = [];
  for (let i = 1; i < linkData.length; i++) {
    if (portalSafeTrim_(linkData[i][lm.VehiculoID]) !== vehicleId) continue;
    supportSources = supportSources.concat(
      portalSafeTrim_(linkData[i][lm.FuentesRespaldo] || linkData[i][lm.Fuente]).split('|')
    );
    if (portalYes_(linkData[i][lm.EsActual])) {
      linkSheet.getRange(i + 1, lm.EstadoAsignacion + 1).setValue('REEMPLAZADA_PORTAL');
      linkSheet.getRange(i + 1, lm.EsActual + 1).setValue('NO');
      linkSheet.getRange(i + 1, lm.VigenteHasta + 1).setValue(now);
      linkSheet.getRange(i + 1, lm.FechaActualizacion + 1).setValue(now);
    }
  }

  const targetUnit = portalSafeTrim_(override.UnidadDestinoID).toUpperCase();
  const linkObject = {
    AsignacionVehiculoID: 'AVE-' + Utilities.getUuid(),
    VehiculoID: vehicleId,
    UnidadID: targetUnit,
    PersonaID: '',
    EstadoAsignacion: targetUnit === PORTAL_UNIDENTIFIED_UNIT_ID
      ? 'PENDIENTE_IDENTIFICACION'
      : 'ACTIVA',
    EsActual: 'SI',
    Fuente: 'PORTAL_APROBADO',
    RegistroFuenteID: override.OverrideID,
    FilaFuente: '',
    FechaFuente: now,
    FechaActualizacion: now,
    TipoVinculo: override.TipoVinculo || 'NO_DETERMINADO',
    FuenteGanadora: 'PORTAL_APROBADO',
    FuentesRespaldo: portalUnique_(supportSources.concat(['PORTAL_APROBADO']).filter(Boolean)).join('|'),
    Confianza: 'ALTA_ADMIN',
    EstadoRevision: targetUnit === PORTAL_UNIDENTIFIED_UNIT_ID
      ? 'PENDIENTE_IDENTIFICACION'
      : 'CONFIRMADO_ADMIN',
    VigenteDesde: now,
    VigenteHasta: ''
  };
  linkSheet.appendRow(linkHeaders.map(function (header) {
    return Object.prototype.hasOwnProperty.call(linkObject, header)
      ? linkObject[header]
      : '';
  }));

  return {
    accion: action,
    placa: plate,
    unidadDestinoId: targetUnit,
    eliminado: false
  };
}

function portalApplyVehiclesToMaster_(
  unitId,
  requestId,
  previousRows,
  proposedRows,
  approvedBy
) {
  unitId = portalSafeTrim_(unitId).toUpperCase();
  previousRows = Array.isArray(previousRows) ? previousRows : [];
  proposedRows = Array.isArray(proposedRows) ? proposedRows : [];

  const proposedPlates = {};
  const activeVehicles = [];
  let recognized = 0;
  let visitors = 0;
  let unrecognized = 0;

  proposedRows.forEach(function (row) {
    const plate = portalNormalizePlate_(row.placa);
    if (!plate || proposedPlates[plate]) return;
    proposedPlates[plate] = true;

    const recognition = portalNormalizeVehicleRecognition_(row.reconocimiento);
    if (recognition === PORTAL_VEHICLE_RECOGNITION.PENDIENTE) {
      throw new Error('La placa ' + plate + ' no tiene una clasificación válida.');
    }

    const existing = portalFindMasterVehicleByPlate_(plate);
    const type = portalNormalizeVehicleTypePortal_(row.tipo || (existing ? existing.TipoVehiculo : ''));
    const destination = recognition === PORTAL_VEHICLE_RECOGNITION.NO_RECONOCIDO
      ? PORTAL_UNIDENTIFIED_UNIT_ID
      : unitId;
    const linkType = recognition === PORTAL_VEHICLE_RECOGNITION.PROPIO
      ? 'RESIDENTE'
      : (recognition === PORTAL_VEHICLE_RECOGNITION.VISITANTE
        ? 'VISITANTE_AUTORIZADO'
        : 'NO_RECONOCIDO_POR_UNIDAD');

    const override = portalSaveVehicleOverride_({
      vehiculoId: row.vehiculoId || (existing ? existing.VehiculoID : ''),
      placa: plate,
      unidadOrigenId: unitId,
      unidadDestinoId: destination,
      accion: destination === PORTAL_UNIDENTIFIED_UNIT_ID ? 'MOVER_9999' : 'ASIGNAR_UNIDAD',
      tipoVehiculo: type,
      tipoVinculo: linkType,
      solicitudId: requestId,
      motivo: destination === PORTAL_UNIDENTIFIED_UNIT_ID
        ? 'El apartamento declaró que no reconoce la placa. Pendiente de validación administrativa.'
        : 'Clasificación aprobada por administración desde el portal.',
      usuario: approvedBy
    });
    portalApplyVehicleOverrideToMaster_(override);

    if (recognition === PORTAL_VEHICLE_RECOGNITION.NO_RECONOCIDO) {
      unrecognized += 1;
      return;
    }

    if (recognition === PORTAL_VEHICLE_RECOGNITION.PROPIO) recognized += 1;
    if (recognition === PORTAL_VEHICLE_RECOGNITION.VISITANTE) visitors += 1;
    activeVehicles.push({
      vehiculoId: override.VehiculoID,
      placa: plate,
      tipo: type,
      reconocimiento: recognition,
      tipoVinculo: linkType,
      fuente: 'PORTAL_APROBADO',
      confianza: 'ALTA_ADMIN',
      estadoRevision: 'CONFIRMADO_ADMIN'
    });
  });

  // Eliminar visualmente una fila no elimina ni desasigna una placa existente.
  // Para retirarla del apartamento el usuario debe marcarla expresamente como
  // NO_RECONOCIDO y la administración debe aprobarlo.
  previousRows.forEach(function (row) {
    const plate = portalNormalizePlate_(row.placa);
    if (!plate || proposedPlates[plate]) return;
    if (portalNormalizeVehicleRecognition_(row.reconocimiento) === PORTAL_VEHICLE_RECOGNITION.NO_RECONOCIDO) return;
    activeVehicles.push(row);
  });

  return {
    vehiculos: activeVehicles,
    reconocidos: recognized,
    visitantes: visitors,
    noReconocidos: unrecognized
  };
}

function portalReaplicarVehiculosOverridesEnMaestros_() {
  const overrides = portalReadObjects_(PORTAL_SHEETS.VEHICLE_OVERRIDES)
    .filter(function (row) {
      return portalSafeTrim_(row.Estado).toUpperCase() === 'ACTIVO';
    })
    .sort(function (a, b) {
      return String(a.FechaActualizacion).localeCompare(String(b.FechaActualizacion));
    });

  const results = overrides.map(function (override) {
    return portalApplyVehicleOverrideToMaster_(override);
  });
  return { aplicados: results.length, resultados: results };
}

function portalReaplicarVehiculosOverrides() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const result = portalReaplicarVehiculosOverridesEnMaestros_();
    SpreadsheetApp.flush();
    return { ok: true, aplicados: result.aplicados, resultados: result.resultados };
  } finally {
    lock.releaseLock();
  }
}

function portalDiagnosticarVehiculosSinIdentificar() {
  const vehicles = typeof dmObtenerVehiculosActuales === 'function'
    ? dmObtenerVehiculosActuales(PORTAL_UNIDENTIFIED_UNIT_ID)
    : [];
  const result = {
    ok: true,
    version: PORTAL_VERSION,
    unidadId: PORTAL_UNIDENTIFIED_UNIT_ID,
    total: vehicles.length,
    placas: vehicles.map(function (vehicle) { return vehicle.placa; })
  };
  console.log(JSON.stringify(result));
  return result;
}

function portalListarVehiculosSinIdentificar(payload, origin) {
  const session = portalRequireSession_((payload || {}).token, origin, [PORTAL_ROLE.ADMIN]);
  const vehicles = typeof dmObtenerVehiculosActuales === 'function'
    ? dmObtenerVehiculosActuales(PORTAL_UNIDENTIFIED_UNIT_ID)
    : [];

  portalAudit_({
    action: 'LISTAR_VEHICULOS_9999',
    role: session.role,
    email: session.email,
    unitId: PORTAL_UNIDENTIFIED_UNIT_ID,
    result: 'OK',
    detail: 'Registros: ' + vehicles.length
  });

  return {
    unidadId: PORTAL_UNIDENTIFIED_UNIT_ID,
    vehiculos: portalToClientSafe_(vehicles)
  };
}

function portalGestionarVehiculoSinIdentificar(payload, origin) {
  payload = payload || {};
  const session = portalRequireSession_(payload.token, origin, [PORTAL_ROLE.ADMIN]);
  const plate = portalNormalizePlate_(payload.placa);
  const action = portalSafeTrim_(payload.accion).toUpperCase();
  if (!plate) throw new Error('Placa inválida.');
  if (['REASIGNAR', 'ELIMINAR'].indexOf(action) === -1) {
    throw new Error('Acción administrativa inválida.');
  }

  const unidentified = typeof dmObtenerVehiculosActuales === 'function'
    ? dmObtenerVehiculosActuales(PORTAL_UNIDENTIFIED_UNIT_ID)
    : [];
  const current = unidentified.find(function (vehicle) {
    return portalNormalizePlate_(vehicle.placa) === plate;
  });
  if (!current) throw new Error('La placa no está asignada actualmente al bien 9999.');

  let destination = '';
  let linkType = 'NO_DETERMINADO';
  let overrideAction = 'ELIMINAR';
  if (action === 'REASIGNAR') {
    destination = portalNormalizeUnitInput_('', '', payload.unidadDestinoId);
    if (!destination || destination === PORTAL_UNIDENTIFIED_UNIT_ID) {
      throw new Error('Selecciona un apartamento real como destino.');
    }
    if (!dmObtenerUnidad(destination)) throw new Error('La unidad destino no existe.');
    linkType = portalNormalizeVehicleRecognition_(payload.reconocimiento) === PORTAL_VEHICLE_RECOGNITION.VISITANTE
      ? 'VISITANTE_AUTORIZADO'
      : 'RESIDENTE';
    overrideAction = 'ASIGNAR_UNIDAD';
  }

  const override = portalSaveVehicleOverride_({
    vehiculoId: current.vehiculoId,
    placa: plate,
    unidadOrigenId: PORTAL_UNIDENTIFIED_UNIT_ID,
    unidadDestinoId: destination,
    accion: overrideAction,
    tipoVehiculo: payload.tipo || current.tipoVehiculo,
    tipoVinculo: linkType,
    solicitudId: '',
    motivo: payload.motivo || (
      action === 'ELIMINAR'
        ? 'Registro operativo eliminado por administración desde el bien 9999.'
        : 'Placa reasignada por administración desde el bien 9999.'
    ),
    usuario: session.email
  });
  const result = portalApplyVehicleOverrideToMaster_(override);

  portalAudit_({
    action: action === 'ELIMINAR' ? 'ELIMINAR_VEHICULO_9999' : 'REASIGNAR_VEHICULO_9999',
    role: session.role,
    email: session.email,
    unitId: destination || PORTAL_UNIDENTIFIED_UNIT_ID,
    result: 'OK',
    detail: plate + (destination ? ' -> ' + destination : '')
  });

  return { ok: true, resultado: result };
}

/**
 * Reaplica una solicitud ya aprobada. Se usa para migrar aprobaciones hechas
 * antes de la versión 1.3.1.
 */
function portalReaplicarSolicitudAprobadaEnMaestros(requestId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const found = portalFindRequestRow_(requestId);
    if (!found) throw new Error('Solicitud no encontrada.');
    if (portalSafeTrim_(found.row.Estado).toUpperCase() !== PORTAL_REQUEST_STATUS.APPROVED) {
      throw new Error('La solicitud no está aprobada.');
    }

    const previous = portalParseJson_(found.row.DatosAnterioresJSON, {});
    const proposed = portalParseJson_(found.row.DatosPropuestosJSON, {});
    const unitId = portalSafeTrim_(found.row.UnidadID).toUpperCase();
    const approvedBy = found.row.UsuarioDecision || Session.getEffectiveUser().getEmail();
    const result = {};

    if (Array.isArray(proposed.RESIDENTES)) {
      result.residentes = portalApplyResidentsToMaster_(
        unitId,
        requestId,
        Array.isArray(previous.RESIDENTES) ? previous.RESIDENTES : [],
        proposed.RESIDENTES,
        approvedBy
      );
      portalUpdateApprovedResidentsPayload_(
        unitId,
        requestId,
        result.residentes.residentes
      );
    }

    if (Array.isArray(proposed.VEHICULOS)) {
      result.vehiculos = portalApplyVehiclesToMaster_(
        unitId,
        requestId,
        Array.isArray(previous.VEHICULOS) ? previous.VEHICULOS : [],
        proposed.VEHICULOS,
        approvedBy
      );
    }

    if (!result.residentes && !result.vehiculos) {
      throw new Error('La solicitud no contiene RESIDENTES ni VEHICULOS para reaplicar.');
    }

    SpreadsheetApp.flush();
    return { ok: true, solicitudId: requestId, resultado: result };
  } finally {
    lock.releaseLock();
  }
}

/** Reaplica residentes aprobados y todos los overrides activos de vehículos. */
function portalReaplicarDatosAprobadosEnMaestros() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const result = portalReaplicarDatosAprobadosEnMaestros_();
    SpreadsheetApp.flush();
    return result;
  } finally {
    lock.releaseLock();
  }
}

/** Variante interna sin bloqueo; la reconstrucción maestra ya posee el lock. */
function portalReaplicarDatosAprobadosEnMaestros_() {
  const approvedRows = portalReadObjects_(PORTAL_SHEETS.APPROVED)
    .filter(function (row) {
      return portalSafeTrim_(row.Seccion).toUpperCase() === 'RESIDENTES' &&
        portalSafeTrim_(row.Estado).toUpperCase() === 'VIGENTE';
    });
  const summaries = [];

  approvedRows.forEach(function (approvedRow) {
    const requestId = portalSafeTrim_(approvedRow.SolicitudID);
    const found = portalFindRequestRow_(requestId);
    if (!found) {
      throw new Error(
        'No se encontró la solicitud ' + requestId + ' asociada al dato aprobado.'
      );
    }

    const previous = portalParseJson_(found.row.DatosAnterioresJSON, {});
    const proposed = portalParseJson_(found.row.DatosPropuestosJSON, {});
    const residents = Array.isArray(proposed.RESIDENTES)
      ? proposed.RESIDENTES
      : portalParseJson_(approvedRow.DatosJSON, []);

    const result = portalApplyResidentsToMaster_(
      portalSafeTrim_(approvedRow.UnidadID).toUpperCase(),
      requestId,
      Array.isArray(previous.RESIDENTES) ? previous.RESIDENTES : [],
      residents,
      approvedRow.AprobadoPor || found.row.UsuarioDecision || ''
    );
    portalUpdateApprovedResidentsPayload_(
      portalSafeTrim_(approvedRow.UnidadID).toUpperCase(),
      requestId,
      result.residentes
    );
    summaries.push({
      unidadId: approvedRow.UnidadID,
      solicitudId: requestId,
      actualizados: result.actualizados,
      creados: result.creados,
      vinculosCerrados: result.vinculosCerrados
    });
  });

  const vehicleOverrides = portalReaplicarVehiculosOverridesEnMaestros_();

  return {
    ok: true,
    seccionesAplicadas: summaries.length,
    resultados: summaries,
    vehiculosOverridesAplicados: vehicleOverrides.aplicados,
    resultadosVehiculos: vehicleOverrides.resultados
  };
}

function portalDiagnosticarResidentesMaestros(unidadId) {
  const id = portalNormalizeUnitInput_('', '', unidadId);
  if (!id) throw new Error('Unidad inválida.');

  const people = portalGetAdminPeople_(id);
  const grouped = {};
  people.forEach(function (person) {
    if (!grouped[person.personaId]) grouped[person.personaId] = [];
    grouped[person.personaId].push(person.rol);
  });

  return {
    ok: true,
    unidadId: id,
    personasActivas: Object.keys(grouped).length,
    vinculosActivos: people.length,
    duplicados: Object.keys(grouped)
      .filter(function (personId) { return grouped[personId].length > 1; })
      .map(function (personId) {
        return { personaId: personId, roles: grouped[personId] };
      }),
    residentesAprobados: portalGetApprovedSections_(id).RESIDENTES || []
  };
}

/***************************************
 * VIGILANCIA
 ***************************************/
function portalBuscarVigilancia(payload, origin) {
  payload = payload || {};
  const session = portalRequireSession_(payload.token, origin, [PORTAL_ROLE.VIGILANCIA, PORTAL_ROLE.ADMIN]);
  const query = portalLimitText_(payload.query, 100).toUpperCase();
  if (query.length < 2) throw new Error('Ingresa una unidad, placa o parqueadero.');

  const matches = portalSearchUnits_(query, false).slice(0, 15);
  const profiles = matches.map(function (match) {
    return portalBuildVigilanceProfile_(match.unidadId);
  });

  portalAudit_({
    action: 'BUSCAR_VIGILANCIA', role: session.role, email: session.email,
    unitId: profiles.length === 1 ? profiles[0].unidad.unidadId : '',
    result: 'OK', detail: 'Resultados: ' + profiles.length
  });

  return { resultados: profiles };
}

function portalBuildVigilanceProfile_(unitId) {
  const unit = dmObtenerUnidad(unitId);
  const editable =
    portalBuildEditableSnapshot_(unitId, '');
  const approved =
    portalGetApprovedSections_(unitId);
  const parkings =
    dmObtenerParqueaderosUnidad(unitId);

  const baseResidents =
    dmObtenerPersonasActivas(unitId)
      .filter(function (person) {
        return (
          portalSafeTrim_(person.rol)
            .toUpperCase()
            .indexOf('INMOBILIARIA') === -1
        );
      })
      .map(function (person) {
        return {
          personaId:
            person.personaId || '',
          numeroDocumento:
            person.numeroDocumento || '',
          nombre:
            person.nombreCompleto,
          rol:
            person.rol
        };
      });

  const operationalResidents =
    approved.RESIDENTES
      ? portalEnrichResidentsWithIdentity_(
          approved.RESIDENTES,
          baseResidents
        )
      : baseResidents;

  return {
    unidad: {
      unidadId: unit.UnidadID,
      torre: unit.Torre,
      apartamento: unit.Apartamento,
      estadoUnidad: unit.EstadoUnidad
    },
    residentes:
      operationalResidents.map(function (person) {
        return {
          nombre: person.nombre,
          rol: person.rol
        };
      }),
    vehiculos:
      (editable.VEHICULOS || [])
        .map(function (vehicle) {
          return {
            placa: vehicle.placa,
            tipo: vehicle.tipo
          };
        }),
    parqueaderos:
      parkings.map(function (parking) {
        return {
          codigoOficial:
            parking.codigoOficial,
          subtipo: parking.subtipo
        };
      }),
    emergencia:
      editable.EMERGENCIA || {
        nombre: '',
        celular: '',
        parentesco: ''
      }
  };
}


/**
 * Registra directamente a la persona principal que llega a ocupar una unidad.
 *
 * La operación:
 * - no altera propietarios;
 * - crea o actualiza Personas;
 * - crea un único vínculo principal activo;
 * - permite retirar residentes anteriores solo con confirmación explícita;
 * - habilita el acceso al módulo de datos personales mediante apartamento,
 *   documento y reconocimiento del correo;
 * - deja la actualización posterior de convivientes y vehículos sujeta al
 *   flujo normal de solicitud y aprobación administrativa.
 */
function portalRegistrarResidenteVigilancia(
  payload,
  origin
) {
  payload = payload || {};

  const session = portalRequireSession_(
    payload.token,
    origin,
    [
      PORTAL_ROLE.VIGILANCIA,
      PORTAL_ROLE.ADMIN
    ]
  );

  const unitId =
    portalNormalizeUnitInput_(
      '',
      payload.apartamento,
      payload.unidadId
    );
  const name =
    portalLimitText_(
      payload.nombreCompleto,
      150
    );
  const documentType =
    portalNormalizeDocumentType_(
      payload.tipoDocumento
    );
  const documentNumber =
    portalNormalizeDocument_(
      payload.numeroDocumento
    );
  const email =
    portalNormalizeEmail_(payload.email);
  const phone =
    portalNormalizePhone_(payload.celular);
  const role =
    portalNormalizePrincipalResidentRole_(
      payload.rol
    );
  const retirePrevious =
    payload.retirarResidentesAnteriores === true ||
    portalYes_(
      payload.retirarResidentesAnteriores
    );
  const notes =
    portalLimitText_(
      payload.observaciones,
      800
    );

  if (
    !unitId ||
    unitId === PORTAL_UNIDENTIFIED_UNIT_ID ||
    !dmObtenerUnidad(unitId)
  ) {
    throw new Error(
      'El apartamento no existe en la base oficial.'
    );
  }

  if (!name || name.length < 5) {
    throw new Error(
      'Ingresa el nombre completo del nuevo residente.'
    );
  }

  if (
    !documentNumber ||
    documentNumber.length < 5
  ) {
    throw new Error(
      'Ingresa un número de documento válido.'
    );
  }

  if (!email) {
    throw new Error(
      'Ingresa un correo electrónico válido. ' +
      'Este correo será utilizado en la pregunta de seguridad.'
    );
  }

  if (payload.celular && phone.length < 7) {
    throw new Error(
      'El número de celular no tiene un formato válido.'
    );
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const result =
      portalUpsertPrincipalResident_({
        unitId: unitId,
        name: name,
        documentType: documentType,
        documentNumber: documentNumber,
        email: email,
        phone: phone,
        role: role,
        retirePrevious: retirePrevious,
        notes: notes,
        actorEmail: session.email,
        actorRole: session.role
      });

    portalAudit_({
      action: 'ALTA_RESIDENTE_VIGILANCIA',
      role: session.role,
      email: session.email,
      unitId: unitId,
      result: 'OK',
      detail:
        'PersonaID=' + result.personaId +
        ' | Rol=' + result.rol +
        ' | Creada=' +
          (result.personaCreada ? 'SI' : 'NO') +
        ' | ResidentesRetirados=' +
          result.residentesRetirados +
        ' | OtrasUnidades=' +
          result.otrasUnidadesActivas.join(',') +
        (
          notes
            ? ' | Observaciones=' + notes
            : ''
        )
    });

    return portalToClientSafe_({
      ok: true,
      unidadId: unitId,
      personaId: result.personaId,
      nombre: result.nombre,
      correo: result.correo,
      rol: result.rol,
      personaCreada: result.personaCreada,
      residentesRetirados:
        result.residentesRetirados,
      otrasUnidadesActivas:
        result.otrasUnidadesActivas,
      tipoAcceso:
        PORTAL_IDENTITY_TYPE
          .RESIDENTE_PRINCIPAL,
      permisos:
        portalAllowedSectionsForIdentity_(
          PORTAL_IDENTITY_TYPE
            .RESIDENTE_PRINCIPAL
        ),
      message:
        'El residente principal quedó registrado. ' +
        'Ya puede ingresar al módulo de datos personales con el apartamento y su documento.'
    });
  } finally {
    if (lock.hasLock()) {
      lock.releaseLock();
    }
  }
}

function portalUpsertPrincipalResident_(data) {
  const ss = portalGetSpreadsheet_();
  const peopleSheetName =
    typeof DM_SHEETS !== 'undefined'
      ? DM_SHEETS.PERSONAS
      : 'Personas';
  const linksSheetName =
    typeof DM_SHEETS !== 'undefined'
      ? DM_SHEETS.VINCULOS_UNIDAD
      : 'Vinculos_Unidad';
  const peopleSheet =
    ss.getSheetByName(peopleSheetName);
  const linksSheet =
    ss.getSheetByName(linksSheetName);

  if (!peopleSheet || !linksSheet) {
    throw new Error(
      'No existen las hojas Personas y Vinculos_Unidad.'
    );
  }

  const peopleData =
    peopleSheet.getDataRange().getValues();
  const linksData =
    linksSheet.getDataRange().getValues();
  const peopleHeaders =
    peopleData[0].map(portalSafeTrim_);
  const linksHeaders =
    linksData[0].map(portalSafeTrim_);
  const pm =
    portalHeaderMap_(peopleHeaders);
  const lm =
    portalHeaderMap_(linksHeaders);

  portalRequireHeaders_(pm, [
    'PersonaID',
    'TipoPersona',
    'TipoDocumento',
    'NumeroDocumento',
    'NombreCompleto',
    'CorreoPrincipal',
    'CorreosAlternos',
    'CelularPrincipal',
    'TelefonosAlternos',
    'EstadoPersona',
    'Fuentes',
    'FechaFuente',
    'FechaActualizacion'
  ], peopleSheetName);

  portalRequireHeaders_(lm, [
    'VinculoID',
    'UnidadID',
    'PersonaID',
    'Rol',
    'EsContactoPrincipal',
    'RecibeNotificaciones',
    'EstadoVinculo',
    'FechaInicio',
    'FechaFin',
    'Fuente',
    'RegistroFuenteID',
    'FilaFuente',
    'FechaActualizacion'
  ], linksSheetName);

  const now = portalNow_();
  const registrationId =
    'ALT-VIG-' +
    Utilities.formatDate(
      new Date(),
      PORTAL_TIMEZONE,
      'yyyyMMdd-HHmmss'
    ) +
    '-' +
    portalRandomSuffix_();

  const personMatches = [];

  for (
    let index = 1;
    index < peopleData.length;
    index++
  ) {
    if (
      portalNormalizeDocument_(
        peopleData[index][
          pm.NumeroDocumento
        ]
      ) === data.documentNumber
    ) {
      personMatches.push({
        rowNumber: index + 1,
        values: peopleData[index],
        personaId:
          portalSafeTrim_(
            peopleData[index][pm.PersonaID]
          )
      });
    }
  }

  const uniquePersonIds = portalUnique_(
    personMatches.map(function (person) {
      return person.personaId;
    }).filter(Boolean)
  );

  if (uniquePersonIds.length > 1) {
    throw new Error(
      'El documento aparece asociado a más de una persona. ' +
      'La administración debe resolver el conflicto antes de continuar.'
    );
  }

  let person =
    personMatches.length
      ? personMatches[0]
      : null;

  // Revisa el vínculo de propietario antes de modificar datos.
  if (person) {
    const ownerInUnit =
      linksData.slice(1).some(function (row) {
        return (
          portalSafeTrim_(
            row[lm.UnidadID]
          ).toUpperCase() === data.unitId &&
          portalSafeTrim_(
            row[lm.PersonaID]
          ) === person.personaId &&
          portalSafeTrim_(
            row[lm.EstadoVinculo]
          ).toUpperCase() === 'ACTIVO' &&
          portalIsOwnerRole_(
            row[lm.Rol]
          )
        );
      });

    if (ownerInUnit) {
      throw new Error(
        'El documento ya corresponde a un propietario activo de la unidad. ' +
        'No requiere alta como residente principal.'
      );
    }
  }

  let personCreated = false;

  if (!person) {
    let personId =
      'PER-' +
      portalHash_(
        'VIGILANCIA|' +
        data.documentNumber
      ).slice(0, 16).toUpperCase();
    let suffix = 0;

    while (
      peopleData.slice(1).some(function (row) {
        return (
          portalSafeTrim_(
            row[pm.PersonaID]
          ) === personId
        );
      })
    ) {
      suffix += 1;
      personId =
        'PER-' +
        portalHash_(
          'VIGILANCIA|' +
          data.documentNumber +
          '|' +
          suffix
        ).slice(0, 16).toUpperCase();
    }

    const personObject = {
      PersonaID: personId,
      TipoPersona: 'PERSONA_NATURAL',
      TipoDocumento: data.documentType,
      NumeroDocumento:
        data.documentNumber,
      NombreCompleto: data.name,
      CorreoPrincipal: data.email,
      CorreosAlternos: '',
      CelularPrincipal: data.phone,
      TelefonosAlternos: '',
      EstadoPersona: 'ACTIVA',
      Fuentes: 'VIGILANCIA_ALTA',
      FechaFuente: now,
      FechaActualizacion: now
    };

    const personValues =
      peopleHeaders.map(function (header) {
        return (
          personObject[header] !== undefined
            ? personObject[header]
            : ''
        );
      });

    peopleSheet.appendRow(personValues);

    person = {
      rowNumber: peopleSheet.getLastRow(),
      values: personValues,
      personaId: personId
    };
    personCreated = true;
  } else {
    const updates = {
      TipoPersona: 'PERSONA_NATURAL',
      TipoDocumento: data.documentType,
      NumeroDocumento:
        data.documentNumber,
      NombreCompleto: data.name,
      CorreoPrincipal: data.email,
      CelularPrincipal:
        data.phone ||
        portalSafeTrim_(
          person.values[pm.CelularPrincipal]
        ),
      EstadoPersona: 'ACTIVA',
      Fuentes:
        portalAppendDelimitedValue_(
          person.values[pm.Fuentes],
          'VIGILANCIA_ALTA'
        ),
      FechaFuente: now,
      FechaActualizacion: now
    };

    Object.keys(updates).forEach(
      function (header) {
        peopleSheet.getRange(
          person.rowNumber,
          pm[header] + 1
        ).setValue(updates[header]);

        person.values[pm[header]] =
          updates[header];
      }
    );
  }

  const links = [];

  for (
    let index = 1;
    index < linksData.length;
    index++
  ) {
    links.push({
      rowNumber: index + 1,
      values: linksData[index],
      vinculoId:
        portalSafeTrim_(
          linksData[index][lm.VinculoID]
        ),
      unitId:
        portalSafeTrim_(
          linksData[index][lm.UnidadID]
        ).toUpperCase(),
      personId:
        portalSafeTrim_(
          linksData[index][lm.PersonaID]
        ),
      role:
        portalSafeTrim_(
          linksData[index][lm.Rol]
        ).toUpperCase(),
      active:
        portalSafeTrim_(
          linksData[index][lm.EstadoVinculo]
        ).toUpperCase() === 'ACTIVO'
    });
  }

  function closeLink(link) {
    if (!link.active) return;

    linksSheet.getRange(
      link.rowNumber,
      lm.EstadoVinculo + 1
    ).setValue('HISTORICO');
    linksSheet.getRange(
      link.rowNumber,
      lm.FechaFin + 1
    ).setValue(now);
    linksSheet.getRange(
      link.rowNumber,
      lm.FechaActualizacion + 1
    ).setValue(now);

    link.active = false;
  }

  const samePersonUnitLinks =
    links.filter(function (link) {
      return (
        link.unitId === data.unitId &&
        link.personId === person.personaId &&
        link.active
      );
    });

  let canonicalLink =
    samePersonUnitLinks.length
      ? samePersonUnitLinks[0]
      : null;

  if (!canonicalLink) {
    const linkId =
      'VIN-' +
      portalHash_(
        data.unitId +
        '|' +
        person.personaId +
        '|' +
        registrationId
      ).slice(0, 16).toUpperCase();

    const linkObject = {
      VinculoID: linkId,
      UnidadID: data.unitId,
      PersonaID: person.personaId,
      Rol: data.role,
      EsContactoPrincipal: 'SI',
      RecibeNotificaciones: 'SI',
      EstadoVinculo: 'ACTIVO',
      FechaInicio: now,
      FechaFin: '',
      Fuente: 'VIGILANCIA_ALTA',
      RegistroFuenteID:
        registrationId,
      FilaFuente: '',
      FechaActualizacion: now
    };

    linksSheet.appendRow(
      linksHeaders.map(function (header) {
        return (
          linkObject[header] !== undefined
            ? linkObject[header]
            : ''
        );
      })
    );

    canonicalLink = {
      rowNumber: linksSheet.getLastRow(),
      vinculoId: linkId,
      unitId: data.unitId,
      personId: person.personaId,
      role: data.role,
      active: true
    };
  } else {
    const updates = {
      Rol: data.role,
      EsContactoPrincipal: 'SI',
      RecibeNotificaciones: 'SI',
      EstadoVinculo: 'ACTIVO',
      FechaFin: '',
      Fuente:
        portalAppendDelimitedValue_(
          canonicalLink.values[lm.Fuente],
          'VIGILANCIA_ALTA'
        ),
      RegistroFuenteID:
        registrationId,
      FechaActualizacion: now
    };

    Object.keys(updates).forEach(
      function (header) {
        linksSheet.getRange(
          canonicalLink.rowNumber,
          lm[header] + 1
        ).setValue(updates[header]);
      }
    );

    canonicalLink.role = data.role;
  }

  // Cierra vínculos duplicados de la misma persona en la misma unidad.
  samePersonUnitLinks.forEach(function (link) {
    if (
      link.rowNumber !==
      canonicalLink.rowNumber
    ) {
      closeLink(link);
    }
  });

  let retiredResidents = 0;

  links.forEach(function (link) {
    if (
      !link.active ||
      link.unitId !== data.unitId ||
      link.personId === person.personaId ||
      portalIsOwnerRole_(link.role)
    ) {
      return;
    }

    if (data.retirePrevious) {
      closeLink(link);
      retiredResidents += 1;
      return;
    }

    // Solo puede existir un residente principal. Los residentes anteriores
    // se conservan, pero dejan de administrar la composición de la unidad.
    if (
      link.role.indexOf('PRINCIPAL') !== -1
    ) {
      const demotedRole =
        link.role.indexOf('ARREND') !== -1
          ? 'ARRENDATARIO'
          : 'RESIDENTE';

      linksSheet.getRange(
        link.rowNumber,
        lm.Rol + 1
      ).setValue(demotedRole);
      linksSheet.getRange(
        link.rowNumber,
        lm.EsContactoPrincipal + 1
      ).setValue('NO');
      linksSheet.getRange(
        link.rowNumber,
        lm.FechaActualizacion + 1
      ).setValue(now);
      link.role = demotedRole;
    }
  });

  const otherUnits =
    portalUnique_(
      links.filter(function (link) {
        return (
          link.active &&
          link.personId === person.personaId &&
          link.unitId !== data.unitId
        );
      }).map(function (link) {
        return link.unitId;
      })
    );

  SpreadsheetApp.flush();

  return {
    personaId: person.personaId,
    nombre: data.name,
    correo: data.email,
    rol: data.role,
    personaCreada: personCreated,
    residentesRetirados:
      retiredResidents,
    otrasUnidadesActivas: otherUnits
  };
}

function portalNormalizePrincipalResidentRole_(value) {
  const role =
    portalSafeTrim_(value).toUpperCase();

  return role.indexOf('ARREND') !== -1
    ? 'ARRENDATARIO PRINCIPAL'
    : 'RESIDENTE PRINCIPAL';
}

function portalNormalizeDocumentType_(value) {
  const type =
    portalSafeTrim_(value)
      .toUpperCase()
      .replace(/\s+/g, '_');

  if (
    [
      'CEDULA',
      'CEDULA_CIUDADANIA',
      'CC'
    ].indexOf(type) !== -1
  ) {
    return 'CEDULA';
  }

  if (
    [
      'CEDULA_EXTRANJERIA',
      'CE'
    ].indexOf(type) !== -1
  ) {
    return 'CEDULA_EXTRANJERIA';
  }

  if (type === 'PASAPORTE') {
    return 'PASAPORTE';
  }

  return 'OTRO';
}

/**
 * Diagnóstico seguro. No crea personas ni devuelve información personal.
 */
function portalDiagnosticarAltaResidenteVigilancia(
  unidadId
) {
  const id =
    portalNormalizeUnitInput_(
      '',
      '',
      unidadId
    );

  if (!id || !dmObtenerUnidad(id)) {
    return {
      ok: false,
      unidadId: id,
      motivo: 'UNIDAD_NO_ENCONTRADA'
    };
  }

  const people =
    portalGetAdminPeople_(id);
  const owners =
    people.filter(function (person) {
      return portalIsOwnerRole_(
        person.rol
      );
    }).length;
  const residents =
    people.filter(function (person) {
      return portalIsResidentRole_(
        person.rol
      );
    }).length;
  const principals =
    people.filter(function (person) {
      return (
        portalSafeTrim_(person.rol)
          .toUpperCase()
          .indexOf('PRINCIPAL') !== -1
      );
    }).length;

  return {
    ok: true,
    unidadId: id,
    propietariosActivos: owners,
    residentesActivos: residents,
    residentesPrincipales:
      principals,
    puedeRegistrar: true
  };
}

function portalProbarPermisosResidentePrincipal() {
  const identity =
    portalIdentityTypeFromRoles_([
      'ARRENDATARIO PRINCIPAL'
    ]);
  const permissions =
    portalAllowedSectionsForIdentity_(
      identity
    );

  return {
    ok:
      identity ===
        PORTAL_IDENTITY_TYPE
          .RESIDENTE_PRINCIPAL &&
      permissions.indexOf(
        PORTAL_SECTIONS.RESIDENTES
      ) !== -1 &&
      permissions.indexOf(
        PORTAL_SECTIONS.VEHICULOS
      ) !== -1,
    tipoIdentidad: identity,
    permisos: permissions,
    puedeVerResumenPropietario: false
  };
}


/***************************************
 * BÚSQUEDA Y FUSIÓN DE DATOS
 ***************************************/
function portalSearchUnits_(query, includePersonalSearch) {
  const units = portalReadMasterObjectsSafe_(typeof DM_SHEETS !== 'undefined' ? DM_SHEETS.UNIDADES : 'Unidades');
  const unitMap = {};
  units.forEach(function (u) {
    unitMap[portalSafeTrim_(u.UnidadID).toUpperCase()] = u;
  });

  const resultMap = {};
  function add(unitId, matchedBy, detail) {
    unitId = portalSafeTrim_(unitId).toUpperCase();
    if (!unitMap[unitId]) return;
    if (!resultMap[unitId]) {
      resultMap[unitId] = {
        unidadId: unitId,
        torre: unitMap[unitId].Torre,
        apartamento: unitMap[unitId].Apartamento,
        coincidencias: []
      };
    }
    resultMap[unitId].coincidencias.push({ tipo: matchedBy, detalle: detail });
  }

  units.forEach(function (u) {
    const unitId = portalSafeTrim_(u.UnidadID).toUpperCase();
    const compact = unitId.replace(/[^A-Z0-9]/g, '');
    const queryCompact = query.replace(/[^A-Z0-9]/g, '');
    if (unitId.indexOf(query) !== -1 || compact.indexOf(queryCompact) !== -1 ||
        portalSafeTrim_(u.Apartamento).toUpperCase() === query) {
      add(unitId, 'UNIDAD', unitId);
    }
  });

  portalReadMasterObjectsSafe_(typeof DM_SHEETS !== 'undefined' ? DM_SHEETS.VINCULOS_VEHICULO : 'Vinculos_Vehiculo')
    .filter(function (link) { return portalYes_(link.EsActual); })
    .forEach(function (link) {
      const vehicleId = portalSafeTrim_(link.VehiculoID).toUpperCase();
      if (vehicleId.indexOf(query.replace(/[^A-Z0-9]/g, '')) !== -1) {
        add(link.UnidadID, 'PLACA', vehicleId.replace(/^VEH-/, ''));
      }
    });

  portalReadMasterObjectsSafe_(typeof DM_SHEETS !== 'undefined' ? DM_SHEETS.VINCULOS_PARQUEADERO : 'Vinculos_Parqueadero')
    .filter(function (link) { return portalYes_(link.EsActual); })
    .forEach(function (link) {
      const parkingId = portalSafeTrim_(link.ParqueaderoID).toUpperCase();
      if (parkingId.indexOf(query.replace(/[^A-Z0-9]/g, '')) !== -1) {
        add(link.UnidadID, 'PARQUEADERO', parkingId.replace(/^PARQ-/, '').replace(/-PARQ$/, ''));
      }
    });

  if (includePersonalSearch) {
    const links = portalReadMasterObjectsSafe_(typeof DM_SHEETS !== 'undefined' ? DM_SHEETS.VINCULOS_UNIDAD : 'Vinculos_Unidad');
    const personUnits = {};
    links.forEach(function (link) {
      if (!personUnits[link.PersonaID]) personUnits[link.PersonaID] = [];
      personUnits[link.PersonaID].push(link.UnidadID);
    });

    portalReadMasterObjectsSafe_(typeof DM_SHEETS !== 'undefined' ? DM_SHEETS.PERSONAS : 'Personas')
      .forEach(function (person) {
        const haystack = [person.NombreCompleto, person.NumeroDocumento, person.CorreoPrincipal, person.CorreosAlternos, person.CelularPrincipal]
          .map(function (v) { return portalSafeTrim_(v).toUpperCase(); })
          .join(' ');
        if (haystack.indexOf(query) === -1) return;
        (personUnits[person.PersonaID] || []).forEach(function (unitId) {
          add(unitId, 'PERSONA', person.NombreCompleto || person.CorreoPrincipal);
        });
      });
  }

  return Object.keys(resultMap)
    .sort()
    .map(function (key) { return resultMap[key]; });
}

function portalGetApprovedSections_(unitId) {
  const result = {};
  portalReadObjects_(PORTAL_SHEETS.APPROVED)
    .filter(function (row) {
      return portalSafeTrim_(row.UnidadID).toUpperCase() === unitId &&
        portalSafeTrim_(row.Estado).toUpperCase() === 'VIGENTE';
    })
    .forEach(function (row) {
      const section = portalSafeTrim_(row.Seccion).toUpperCase();
      result[section] = portalParseJson_(row.DatosJSON, null);
    });
  return result;
}


function portalNormalizeDocument_(value) {
  return portalSafeTrim_(value)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

function portalIdentityTypeFromRoles_(roles) {
  const text = (roles || [])
    .map(function (role) {
      return portalSafeTrim_(role).toUpperCase();
    })
    .join('|');

  if (
    text.indexOf('PROPIET') !== -1 ||
    text.indexOf('COPROPIET') !== -1 ||
    text.indexOf('COMPRADOR') !== -1
  ) {
    return PORTAL_IDENTITY_TYPE.PROPIETARIO;
  }

  if (
    text.indexOf('PRINCIPAL') !== -1 &&
    (
      text.indexOf('RESIDENT') !== -1 ||
      text.indexOf('ARREND') !== -1 ||
      text.indexOf('OCUPANTE') !== -1
    )
  ) {
    return PORTAL_IDENTITY_TYPE.RESIDENTE_PRINCIPAL;
  }

  return PORTAL_IDENTITY_TYPE.RESIDENTE;
}

function portalAllowedSectionsForIdentity_(identityType) {
  if (
    identityType ===
      PORTAL_IDENTITY_TYPE.PROPIETARIO ||
    identityType ===
      PORTAL_IDENTITY_TYPE.RESIDENTE_PRINCIPAL
  ) {
    return PORTAL_ALLOWED_SECTIONS.slice();
  }

  return [
    PORTAL_SECTIONS.CONTACTO,
    PORTAL_SECTIONS.VEHICULOS,
    PORTAL_SECTIONS.MASCOTAS,
    PORTAL_SECTIONS.EMERGENCIA
  ];
}

function portalAggregateActivePeople_(unitId) {
  const grouped = {};

  portalGetAdminPeople_(unitId).forEach(
    function (person) {
      const personId =
        portalSafeTrim_(person.personaId);

      if (!personId) return;

      if (!grouped[personId]) {
        grouped[personId] = {
          personaId: personId,
          nombreCompleto:
            portalSafeTrim_(
              person.nombreCompleto
            ),
          numeroDocumento:
            portalNormalizeDocument_(
              person.numeroDocumento
            ),
          correoPrincipal:
            portalNormalizeEmail_(
              person.correoPrincipal
            ),
          correosAlternos:
            portalExtractEmails_(
              person.correosAlternos
            ).join(', '),
          celularPrincipal:
            portalSafeTrim_(
              person.celularPrincipal
            ),
          recibeNotificaciones:
            person.recibeNotificaciones || '',
          roles: [],
          fuentes: []
        };
      }

      const current = grouped[personId];

      if (!current.nombreCompleto) {
        current.nombreCompleto =
          portalSafeTrim_(
            person.nombreCompleto
          );
      }

      if (!current.numeroDocumento) {
        current.numeroDocumento =
          portalNormalizeDocument_(
            person.numeroDocumento
          );
      }

      if (!current.correoPrincipal) {
        current.correoPrincipal =
          portalNormalizeEmail_(
            person.correoPrincipal
          );
      }

      const mergedEmails = portalUnique_(
        portalExtractEmails_(
          current.correosAlternos
        ).concat(
          portalExtractEmails_(
            person.correosAlternos
          )
        )
      );
      current.correosAlternos =
        mergedEmails.join(', ');

      if (!current.celularPrincipal) {
        current.celularPrincipal =
          portalSafeTrim_(
            person.celularPrincipal
          );
      }

      const role =
        portalSafeTrim_(person.rol)
          .toUpperCase();
      const source =
        portalSafeTrim_(person.fuente)
          .toUpperCase();

      if (role) current.roles.push(role);
      if (source) current.fuentes.push(source);
    }
  );

  return Object.keys(grouped).map(
    function (personId) {
      const person = grouped[personId];
      person.roles = portalUnique_(
        person.roles
      );
      person.fuentes = portalUnique_(
        person.fuentes
      );
      person.rol =
        person.roles.join('|');
      person.fuente =
        person.fuentes.join('|');
      person.identityType =
        portalIdentityTypeFromRoles_(
          person.roles
        );
      return person;
    }
  );
}

function portalFindActivePersonByDocument_(
  unitId,
  documentNumber
) {
  const normalized =
    portalNormalizeDocument_(
      documentNumber
    );

  if (!normalized) {
    return {
      ok: false,
      reason: 'DOCUMENTO_INVALIDO',
      person: null
    };
  }

  const matches =
    portalAggregateActivePeople_(unitId)
      .filter(function (person) {
        return (
          person.numeroDocumento === normalized
        );
      });

  if (matches.length === 0) {
    return {
      ok: false,
      reason: 'DOCUMENTO_NO_ENCONTRADO',
      person: null
    };
  }

  if (matches.length > 1) {
    return {
      ok: false,
      reason: 'DOCUMENTO_AMBIGUO',
      person: null
    };
  }

  return {
    ok: true,
    reason: 'OK',
    person: matches[0]
  };
}

function portalFindActivePersonById_(
  unitId,
  personId
) {
  const normalized =
    portalSafeTrim_(personId);

  if (!normalized) return null;

  return (
    portalAggregateActivePeople_(unitId)
      .find(function (person) {
        return person.personaId === normalized;
      }) ||
    null
  );
}

function portalGetPersonAuthenticationEmails_(
  unitId,
  person
) {
  let emails = [];

  if (person) {
    emails = emails.concat(
      portalExtractEmails_(
        person.correoPrincipal
      )
    );
    emails = emails.concat(
      portalExtractEmails_(
        person.correosAlternos
      )
    );
  }

  const approved =
    portalGetApprovedSections_(unitId);

  if (
    approved.CONTACTO &&
    person &&
    portalSafeTrim_(
      approved.CONTACTO.personaId
    ) === person.personaId
  ) {
    emails = emails.concat(
      portalExtractEmails_(
        approved.CONTACTO.correoPrincipal
      )
    );
    emails = emails.concat(
      portalExtractEmails_(
        approved.CONTACTO.correoNotificacion
      )
    );
    emails = emails.concat(
      portalExtractEmails_(
        approved.CONTACTO.correosAlternos
      )
    );
  }

  return portalUnique_(emails);
}

function portalMaskEmail_(email) {
  const normalized =
    portalNormalizeEmail_(email);

  if (!normalized) return '';

  const parts = normalized.split('@');
  const local = parts[0];
  const domain = parts[1];
  let visible = '';

  if (local.indexOf('.') !== -1) {
    const segments = local.split('.');
    visible =
      (segments[0].charAt(0) || '') +
      '.' +
      (segments[1] || '').slice(0, 2);
  } else {
    visible = local.slice(
      0,
      Math.min(3, Math.max(1, local.length - 1))
    );
  }

  return visible + '****@' + domain;
}

function portalBuildEmailChallengeOptions_(
  correctEmail
) {
  const correctMasked =
    portalMaskEmail_(correctEmail);
  const correctDomain =
    correctEmail.split('@')[1];
  const maskedLocal = correctMasked.split('@')[0];
  const prefixes = maskedLocal.indexOf('.') !== -1
    ? [
        'm.ca',
        'j.lo',
        'a.ro',
        'c.me',
        'l.go',
        's.pa',
        'd.ru',
        'n.al',
        'p.to',
        'r.va',
        'e.ma',
        'f.sa'
      ]
    : [
        'mar',
        'jul',
        'and',
        'car',
        'dan',
        'lau',
        'san',
        'jor',
        'ale',
        'cam',
        'nat',
        'seb'
      ];
  const domains = portalUnique_([
    correctDomain,
    'gmail.com',
    'hotmail.com',
    'outlook.com',
    'yahoo.com'
  ]);
  const labels = {};
  const options = [];

  function add(label, correct) {
    if (!label || labels[label]) return false;
    labels[label] = true;
    options.push({
      id:
        Utilities.getUuid()
          .replace(/-/g, '')
          .slice(0, 20),
      correoEnmascarado: label,
      correct: !!correct
    });
    return true;
  }

  add(correctMasked, true);

  let cursor = Math.abs(
    parseInt(
      portalHash_(
        correctEmail +
        '|' +
        portalGetSecret_()
      ).slice(0, 8),
      16
    )
  );

  while (options.length < 5) {
    const prefix =
      prefixes[
        cursor % prefixes.length
      ];
    const domain =
      domains[
        Math.floor(cursor / prefixes.length) %
        domains.length
      ];
    add(
      prefix + '****@' + domain,
      false
    );
    cursor += 7;
  }

  for (
    let index = options.length - 1;
    index > 0;
    index--
  ) {
    const swapIndex =
      parseInt(
        portalHash_(
          correctEmail +
          '|' +
          index +
          '|' +
          portalGetSecret_()
        ).slice(0, 8),
        16
      ) %
      (index + 1);
    const temporary = options[index];
    options[index] = options[swapIndex];
    options[swapIndex] = temporary;
  }

  return options;
}

function portalResidentEmailAuthorized_(unitId, email) {
  const normalized = portalNormalizeEmail_(email);
  let emails = [];

  dmObtenerPersonasActivas(unitId).forEach(function (person) {
    emails = emails.concat(portalExtractEmails_(person.correoPrincipal));
    emails = emails.concat(portalExtractEmails_(person.correosAlternos));
  });

  const approved = portalGetApprovedSections_(unitId);
  if (approved.CONTACTO) {
    emails = emails.concat(portalExtractEmails_(approved.CONTACTO.correoPrincipal));
    emails = emails.concat(portalExtractEmails_(approved.CONTACTO.correoNotificacion));
    emails = emails.concat(portalExtractEmails_(approved.CONTACTO.correosAlternos));
  }

  return portalUnique_(emails).indexOf(normalized) !== -1;
}

function portalFindPersonByEmail_(unitId, email) {
  const normalized = portalNormalizeEmail_(email);
  return dmObtenerPersonasActivas(unitId).find(function (person) {
    const emails = portalExtractEmails_(person.correoPrincipal)
      .concat(portalExtractEmails_(person.correosAlternos));
    return emails.indexOf(normalized) !== -1;
  }) || null;
}

function portalInternalUserAuthorized_(email, role) {
  return portalReadObjects_(PORTAL_SHEETS.USERS).some(function (row) {
    return portalNormalizeEmail_(row.Email) === email &&
      portalSafeTrim_(row.Rol).toUpperCase() === role &&
      portalYes_(row.Activo);
  });
}


function portalGetAdminPeople_(unitId) {
  const id =
    portalSafeTrim_(unitId).toUpperCase();
  const people = {};

  portalReadMasterObjectsSafe_(
    typeof DM_SHEETS !== 'undefined'
      ? DM_SHEETS.PERSONAS
      : 'Personas'
  ).forEach(function (person) {
    people[
      portalSafeTrim_(person.PersonaID)
    ] = person;
  });

  return portalReadMasterObjectsSafe_(
    typeof DM_SHEETS !== 'undefined'
      ? DM_SHEETS.VINCULOS_UNIDAD
      : 'Vinculos_Unidad'
  )
    .filter(function (link) {
      return (
        portalSafeTrim_(link.UnidadID)
          .toUpperCase() === id &&
        portalSafeTrim_(link.EstadoVinculo)
          .toUpperCase() === 'ACTIVO'
      );
    })
    .map(function (link) {
      const person =
        people[
          portalSafeTrim_(link.PersonaID)
        ];

      if (!person) return null;

      return {
        personaId: person.PersonaID,
        vinculoId: link.VinculoID,
        nombreCompleto:
          person.NombreCompleto,
        tipoPersona:
          person.TipoPersona,
        tipoDocumento:
          person.TipoDocumento,
        numeroDocumento:
          person.NumeroDocumento,
        correoPrincipal:
          person.CorreoPrincipal,
        correosAlternos:
          person.CorreosAlternos,
        celularPrincipal:
          person.CelularPrincipal,
        telefonosAlternos:
          person.TelefonosAlternos,
        estadoPersona:
          person.EstadoPersona,
        rol: link.Rol,
        esContactoPrincipal:
          link.EsContactoPrincipal,
        recibeNotificaciones:
          link.RecibeNotificaciones,
        estadoVinculo:
          link.EstadoVinculo,
        fechaInicio:
          link.FechaInicio,
        fechaFin:
          link.FechaFin,
        fuente: link.Fuente
      };
    })
    .filter(Boolean);
}

/***************************************
 * WRAPPERS PARA OTROS MÓDULOS
 * Usar estas funciones cuando reservas, sanciones o vigilancia deban respetar
 * las actualizaciones aprobadas desde el portal.
 ***************************************/
function dmPortalObtenerCorreosNotificacion(unidadId) {
  const approved = portalGetApprovedSections_(portalSafeTrim_(unidadId).toUpperCase());
  if (approved.CONTACTO) {
    return portalUnique_(
      portalExtractEmails_(approved.CONTACTO.correoNotificacion)
        .concat(portalExtractEmails_(approved.CONTACTO.correoPrincipal))
        .concat(portalExtractEmails_(approved.CONTACTO.correosAlternos))
    );
  }
  return typeof dmObtenerCorreosNotificacion === 'function'
    ? dmObtenerCorreosNotificacion(unidadId)
    : [];
}

function dmPortalObtenerVehiculosActuales(unidadId) {
  const id = portalSafeTrim_(unidadId).toUpperCase();
  const approved = portalGetApprovedSections_(id);
  if (approved.VEHICULOS) {
    return approved.VEHICULOS.filter(function (vehicle) {
      return portalNormalizeVehicleRecognition_(vehicle.reconocimiento) !==
        PORTAL_VEHICLE_RECOGNITION.NO_RECONOCIDO;
    });
  }
  return typeof dmObtenerVehiculosActuales === 'function'
    ? dmObtenerVehiculosActuales(id).map(function (vehicle) {
        return { placa: vehicle.placa, tipo: vehicle.tipoVehiculo };
      })
    : [];
}

function dmPortalObtenerResidentesActuales(unidadId) {
  const id = portalSafeTrim_(unidadId).toUpperCase();
  const approved = portalGetApprovedSections_(id);
  if (approved.RESIDENTES) return approved.RESIDENTES;
  return typeof dmObtenerPersonasActivas === 'function'
    ? dmObtenerPersonasActivas(id).map(function (person) {
        return { nombre: person.nombreCompleto, rol: person.rol };
      })
    : [];
}

/***************************************
 * SOLICITUDES Y VISTAS
 ***************************************/
function portalGetResidentRequests_(unitId, email, personId) {
  const normalizedEmail = portalNormalizeEmail_(email);
  const normalizedPersonId = portalSafeTrim_(personId);

  return portalReadObjects_(PORTAL_SHEETS.REQUESTS)
    .filter(function (row) {
      if (
        portalSafeTrim_(row.UnidadID).toUpperCase() !== unitId
      ) {
        return false;
      }

      const rowPersonId = portalSafeTrim_(
        row.PersonaSolicitanteID
      );

      if (normalizedPersonId && rowPersonId) {
        return rowPersonId === normalizedPersonId;
      }

      return (
        portalNormalizeEmail_(
          row.EmailAutenticado
        ) === normalizedEmail
      );
    })
    .sort(function (a, b) {
      return String(b.FechaSolicitud).localeCompare(String(a.FechaSolicitud));
    })
    .slice(0, 10)
    .map(function (row) {
      return {
        solicitudId: row.SolicitudID,
        fechaSolicitud: portalDateText_(row.FechaSolicitud),
        secciones: row.Secciones,
        estado: row.Estado,
        observacionesDecision: row.ObservacionesDecision || ''
      };
    });
}

function portalGetAllRequestsForUnit_(unitId) {
  return portalReadObjects_(PORTAL_SHEETS.REQUESTS)
    .filter(function (row) {
      return portalSafeTrim_(row.UnidadID).toUpperCase() === unitId;
    })
    .sort(function (a, b) {
      return String(b.FechaSolicitud).localeCompare(String(a.FechaSolicitud));
    })
    .map(portalRequestPublicView_);
}

function portalRequestPublicView_(row) {
  return {
    solicitudId: row.SolicitudID,
    fechaSolicitud: portalDateText_(row.FechaSolicitud),
    unidadId: row.UnidadID,
    emailAutenticado: row.EmailAutenticado,
    secciones: row.Secciones,
    datosAnteriores: portalParseJson_(row.DatosAnterioresJSON, {}),
    datosPropuestos: portalParseJson_(row.DatosPropuestosJSON, {}),
    observacionesResidente: row.ObservacionesResidente || '',
    estado: row.Estado,
    fechaDecision: portalDateText_(row.FechaDecision),
    usuarioDecision: row.UsuarioDecision || '',
    observacionesDecision: row.ObservacionesDecision || ''
  };
}

function portalSanitizeProposedData_(proposed) {
  proposed = proposed || {};
  const result = {};

  if (proposed.CONTACTO) {
    const contact = proposed.CONTACTO;
    const notificationEmail = portalNormalizeEmail_(contact.correoNotificacion);
    const alternate = portalUnique_(portalExtractEmails_(contact.correosAlternos)).slice(0, 3);
    result.CONTACTO = {
      personaId: portalLimitText_(contact.personaId, 100),
      nombre: portalLimitText_(contact.nombre, 150),
      correoPrincipal: portalNormalizeEmail_(contact.correoPrincipal),
      correoNotificacion: notificationEmail,
      correosAlternos: alternate.join(', '),
      celularPrincipal: portalNormalizePhone_(contact.celularPrincipal),
      recibeNotificaciones: portalYes_(contact.recibeNotificaciones) ? 'SI' : 'NO'
    };
  }

  if (Array.isArray(proposed.RESIDENTES)) {
    result.RESIDENTES = proposed.RESIDENTES.slice(0, 12).map(function (row) {
      return {
        personaId: portalLimitText_(row.personaId, 100),
        numeroDocumento: portalNormalizeDocument_(row.numeroDocumento),
        nombre: portalLimitText_(row.nombre, 150),
        rol: portalNormalizeResidentRole_(row.rol || 'RESIDENTE')
      };
    }).filter(function (row) { return !!row.nombre; });
  }

  if (Array.isArray(proposed.VEHICULOS)) {
    const seen = {};
    result.VEHICULOS = proposed.VEHICULOS.slice(0, 20).map(function (row) {
      const recognition = portalNormalizeVehicleRecognition_(row.reconocimiento);
      return {
        vehiculoId: portalLimitText_(row.vehiculoId, 100),
        placa: portalNormalizePlate_(row.placa),
        tipo: portalNormalizeVehicleTypePortal_(row.tipo),
        reconocimiento: recognition
      };
    }).filter(function (row) {
      if (!row.placa || seen[row.placa]) return false;
      if (row.reconocimiento === PORTAL_VEHICLE_RECOGNITION.PENDIENTE) {
        throw new Error('Debes indicar si reconoces cada placa, si es propia o de un visitante autorizado.');
      }
      seen[row.placa] = true;
      return true;
    });
  }

  if (Array.isArray(proposed.MASCOTAS)) {
    result.MASCOTAS = proposed.MASCOTAS.slice(0, 10).map(function (row) {
      return {
        tipo: portalLimitText_(row.tipo, 50),
        raza: portalLimitText_(row.raza, 80),
        cantidad: Math.max(1, Math.min(10, Number(row.cantidad) || 1))
      };
    }).filter(function (row) { return !!row.tipo; });
  }

  if (proposed.EMERGENCIA) {
    result.EMERGENCIA = {
      nombre: portalLimitText_(proposed.EMERGENCIA.nombre, 150),
      celular: portalNormalizePhone_(proposed.EMERGENCIA.celular),
      parentesco: portalLimitText_(proposed.EMERGENCIA.parentesco, 80)
    };
  }

  return result;
}

function portalChangedSections_(current, proposed) {
  return PORTAL_ALLOWED_SECTIONS.filter(function (section) {
    if (proposed[section] === undefined) return false;
    return portalStableJson_(current[section]) !== portalStableJson_(proposed[section]);
  });
}

function portalPickSections_(data, sections) {
  const result = {};
  sections.forEach(function (section) { result[section] = data[section]; });
  return result;
}

/**
 * Modo temporal de pruebas para el rol ADMIN.
 * Si las claves todavía no existen en Config, se activa por defecto con 841244.
 * Para volver al flujo normal, establece PORTAL_ADMIN_TEST_FIXED_CODE_ENABLED = NO.
 */
function portalAdminFixedOtpTestEnabled_(config) {
  config = config || {};
  const raw = portalSafeTrim_(config.PORTAL_ADMIN_TEST_FIXED_CODE_ENABLED);
  return raw ? portalYes_(raw) : true;
}

function portalGetAdminFixedOtpTestCode_(config) {
  config = config || {};
  const configured = portalSafeTrim_(config.PORTAL_ADMIN_TEST_FIXED_CODE)
    .replace(/\D/g, '');
  return /^\d{6}$/.test(configured) ? configured : '841244';
}

/***************************************
 * CORREO OTP
 ***************************************/
function portalSendOtpEmail_(email, code, role, unitId, minutes) {
  const config = portalGetConfig_();
  const roleText = role === PORTAL_ROLE.RESIDENTE ? 'residente' :
    role === PORTAL_ROLE.ADMIN ? 'administración' : 'vigilancia';
  const unitText = unitId ? '<p>Unidad: <strong>' + portalEscapeHtml_(unitId) + '</strong></p>' : '';

  MailApp.sendEmail({
    to: email,
    replyTo: config.PORTAL_REPLY_TO || 'bulevarverdeadmon@gmail.com',
    name: config.PORTAL_FROM_NAME || 'Administración Bulevar Verde',
    subject: 'Código de acceso a datos - Bulevar Verde',
    body: 'Tu código de acceso es ' + code + '. Vence en ' + minutes + ' minutos.',
    htmlBody:
      '<div style="font-family:Arial,sans-serif;max-width:620px;color:#222;line-height:1.5">' +
      '<h2 style="color:#2c5f2d">Verificación de acceso</h2>' +
      '<p>Se solicitó acceso al portal de ' + roleText + '.</p>' + unitText +
      '<p>Tu código es:</p>' +
      '<p style="font-size:30px;font-weight:bold;letter-spacing:8px;color:#2c5f2d">' + code + '</p>' +
      '<p>El código vence en <strong>' + minutes + ' minutos</strong> y solo puede usarse una vez.</p>' +
      '<p>Si no solicitaste este acceso, ignora el mensaje e informa a la administración.</p>' +
      '</div>'
  });
}

/***************************************
 * CONFIGURACIÓN, SESIONES Y SEGURIDAD
 ***************************************/
function portalGetSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('PORTAL_MASTER_SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);

  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw new Error('No se configuró PORTAL_MASTER_SPREADSHEET_ID. Ejecuta portalCrearEstructura().');
  props.setProperty('PORTAL_MASTER_SPREADSHEET_ID', active.getId());
  return active;
}

function portalGetConfig_() {
  const ss = portalGetSpreadsheet_();
  const sheetName = typeof DM_SHEETS !== 'undefined' && DM_SHEETS.CONFIG ? DM_SHEETS.CONFIG : 'Config';
  const sheet = ss.getSheetByName(sheetName);
  const result = {};
  if (!sheet || sheet.getLastRow() < 2) return result;

  sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(2, sheet.getLastColumn()))
    .getValues()
    .forEach(function (row) {
      const key = portalSafeTrim_(row[0]);
      if (key) result[key] = row[1];
    });
  return result;
}

function portalGetAllowedOrigins_() {
  const config = portalGetConfig_();
  const raw = portalSafeTrim_(config.PORTAL_ALLOWED_ORIGINS);

  if (!raw) return [];

  return raw
    .split(',')
    .map(function (origin) {
      origin = origin.trim();

      if (origin === '*') return '*';

      return origin.replace(/\/$/, '');
    })
    .filter(function (origin) {
      return (
        origin === '*' ||
        /^https?:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin)
      );
    });
}

function portalAssertOrigin_(origin) {
  const allowedOrigins = portalGetAllowedOrigins_();

  // Modo temporal: se permite cualquier origen.
  if (allowedOrigins.indexOf('*') !== -1) {
    return;
  }

  const normalized = portalSafeTrim_(origin).replace(/\/$/, '');

  if (allowedOrigins.indexOf(normalized) === -1) {
    throw new Error('Origen no autorizado.');
  }
}

function portalEnsureSecret_() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('PORTAL_SECRET')) {
    props.setProperty('PORTAL_SECRET', Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid());
  }
}

function portalGetSecret_() {
  portalEnsureSecret_();
  return PropertiesService.getScriptProperties().getProperty('PORTAL_SECRET');
}

function portalAssertSendRate_(identity) {
  const config = portalGetConfig_();
  const max = portalPositiveInt_(config.PORTAL_MAX_OTP_SENDS_PER_HOUR, 4);
  const cache = CacheService.getScriptCache();
  const key = 'portal_rate_' + portalHash_(identity).slice(0, 32);
  const current = Number(cache.get(key) || 0);
  if (current >= max) throw new Error('Se alcanzó el límite de códigos. Intenta nuevamente más tarde.');
  cache.put(key, String(current + 1), 3600);
}


function portalAssertSecurityChallengeRate_(
  unitId,
  documentNumber
) {
  const config = portalGetConfig_();
  const max = portalPositiveInt_(
    config.PORTAL_MAX_SECURITY_CHALLENGES_PER_HOUR,
    8
  );
  const cache = CacheService.getScriptCache();
  const normalizedUnit =
    portalSafeTrim_(unitId) || 'UNIDAD_INVALIDA';
  const normalizedDocument =
    portalNormalizeDocument_(
      documentNumber
    ) || 'DOCUMENTO_INVALIDO';
  const identityKey =
    'portal_security_rate_identity_' +
    portalHash_(
      normalizedUnit +
      '|' +
      normalizedDocument
    ).slice(0, 32);
  const unitKey =
    'portal_security_rate_unit_' +
    portalHash_(normalizedUnit).slice(0, 32);
  const identityCurrent =
    Number(cache.get(identityKey) || 0);
  const unitCurrent =
    Number(cache.get(unitKey) || 0);

  if (
    identityCurrent >= max ||
    unitCurrent >= max * 5
  ) {
    throw new Error(
      'Se alcanzó el límite de intentos. Intenta nuevamente más tarde.'
    );
  }

  cache.put(
    identityKey,
    String(identityCurrent + 1),
    3600
  );
  cache.put(
    unitKey,
    String(unitCurrent + 1),
    3600
  );
}

function portalSecurityChallengeCacheKey_(
  challengeId
) {
  return (
    'portal_security_challenge_' +
    portalHash_(
      challengeId +
      '|' +
      portalGetSecret_()
    ).slice(0, 48)
  );
}

function portalOtpCacheKey_(identity) {
  return 'portal_otp_' + portalHash_(identity).slice(0, 40);
}

function portalSessionCacheKey_(token) {
  return 'portal_session_' + portalHash_(token + '|' + portalGetSecret_()).slice(0, 48);
}

function portalGenerateOtp_() {
  const source = portalHash_(Utilities.getUuid() + '|' + Date.now() + '|' + portalGetSecret_());
  return String((parseInt(source.slice(0, 10), 16) % 900000) + 100000);
}

function portalHash_(value) {
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value),
    Utilities.Charset.UTF_8
  ).map(function (byte) {
    const n = byte < 0 ? byte + 256 : byte;
    return ('0' + n.toString(16)).slice(-2);
  }).join('');
}

/***************************************
 * AUDITORÍA
 ***************************************/
function portalAudit_(data) {
  try {
    const sheet = portalGetRequiredSheet_('AUDIT');
    sheet.appendRow([
      'EVT-' + Utilities.getUuid(),
      portalNow_(),
      data.action || '',
      data.role || '',
      data.email || '',
      data.unitId || '',
      data.result || '',
      portalLimitText_(data.detail, 1000),
      PORTAL_VERSION
    ]);
  } catch (error) {
    // La auditoría no debe romper la operación principal.
  }
}

/***************************************
 * HELPERS DE LECTURA
 ***************************************/
function portalReadObjects_(sheetName) {
  const sheet = portalGetSpreadsheet_().getSheetByName(sheetName);
  return sheet ? portalReadObjectsFromSheet_(sheet) : [];
}

function portalReadObjectsFromSheet_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];

  const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = data[0].map(portalSafeTrim_);
  return data.slice(1).map(function (row) {
    const obj = {};
    headers.forEach(function (header, index) { obj[header] = row[index]; });
    return obj;
  });
}

function portalReadMasterObjectsSafe_(sheetName) {
  try {
    if (typeof dmReadMasterObjects_ === 'function') return dmReadMasterObjects_(sheetName);
  } catch (error) {}
  return portalReadObjects_(sheetName);
}

function portalDataCount_(sheetName) {
  const sheet = portalGetSpreadsheet_().getSheetByName(sheetName);
  return sheet ? Math.max(0, sheet.getLastRow() - 1) : 0;
}

function portalHeaderMap_(headers) {
  const result = {};
  headers.forEach(function (header, index) { result[header] = index; });
  return result;
}

/***************************************
 * HELPERS GENERALES
 ***************************************/

/**
 * Convierte recursivamente la respuesta a valores compatibles con
 * google.script.run y postMessage.
 */
function portalToClientSafe_(value) {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    if (isNaN(value.getTime())) return '';
    return Utilities.formatDate(
      value,
      PORTAL_TIMEZONE,
      "yyyy-MM-dd'T'HH:mm:ssXXX"
    );
  }

  if (Array.isArray(value)) {
    return value.map(function (item) {
      return portalToClientSafe_(item);
    });
  }

  if (typeof value === 'object') {
    const result = {};

    Object.keys(value).forEach(function (key) {
      const item = value[key];

      if (typeof item === 'function' || item === undefined) {
        return;
      }

      result[key] = portalToClientSafe_(item);
    });

    return result;
  }

  if (typeof value === 'number' && !isFinite(value)) {
    return null;
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  return String(value);
}

function portalNormalizeUnitInput_(tower, apartment, unitId) {
  const direct = portalSafeTrim_(unitId).toUpperCase();
  if (direct === PORTAL_UNIDENTIFIED_UNIT_ID) return PORTAL_UNIDENTIFIED_UNIT_ID;

  // Usa siempre el normalizador del maestro cuando está disponible. Acepta
  // tanto el formato nuevo 0401-T1 como el anterior T1-401.
  if (typeof dmNormalizarUnidad === 'function') {
    if (direct) return dmNormalizarUnidad('', direct);
    return dmNormalizarUnidad(tower, apartment);
  }

  let t = portalSafeTrim_(tower).toUpperCase().replace(/^TORRE\s*/, 'T');
  let a = portalSafeTrim_(apartment).replace(/\D/g, '');

  let match = direct.match(/^(\d{1,4})-T([1-8])$/);
  if (match) return match[1].padStart(4, '0') + '-T' + match[2];

  match = direct.match(/^T([1-8])-(\d{1,4})$/);
  if (match) return match[2].padStart(4, '0') + '-T' + match[1];

  if (!/^T[1-8]$/.test(t) || !/^\d{1,4}$/.test(a)) return '';
  return a.padStart(4, '0') + '-' + t;
}

function portalNormalizeRole_(value) {
  const role = portalSafeTrim_(value).toUpperCase();
  return [PORTAL_ROLE.RESIDENTE, PORTAL_ROLE.ADMIN, PORTAL_ROLE.VIGILANCIA].indexOf(role) !== -1 ? role : '';
}

function portalNormalizeEmail_(value) {
  const email = portalSafeTrim_(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function portalExtractEmails_(value) {
  if (Array.isArray(value)) {
    return value.map(portalNormalizeEmail_).filter(Boolean);
  }
  return portalSafeTrim_(value)
    .split(/[;,\s]+/)
    .map(portalNormalizeEmail_)
    .filter(Boolean);
}

function portalNormalizePhone_(value) {
  const raw = portalSafeTrim_(value);
  if (!raw) return '';
  const plus = raw.charAt(0) === '+' ? '+' : '';
  const digits = raw.replace(/\D/g, '').slice(0, 15);
  return digits.length >= 7 ? plus + digits : '';
}

function portalNormalizePlate_(value) {
  return portalSafeTrim_(value).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
}

function portalUnique_(array) {
  const seen = {};
  return array.filter(function (value) {
    if (!value || seen[value]) return false;
    seen[value] = true;
    return true;
  });
}

function portalYes_(value) {
  return ['SI', 'SÍ', 'TRUE', '1', 'YES', 'ACTIVO'].indexOf(portalSafeTrim_(value).toUpperCase()) !== -1;
}

function portalPositiveInt_(value, fallback) {
  const number = parseInt(value, 10);
  return isFinite(number) && number > 0 ? number : fallback;
}

function portalLimitText_(value, max) {
  return portalSafeTrim_(value).slice(0, max || 500);
}

function portalSafeTrim_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function portalNow_() {
  return Utilities.formatDate(new Date(), PORTAL_TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
}

function portalDateText_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, PORTAL_TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  }
  return portalSafeTrim_(value);
}

function portalRandomSuffix_() {
  return portalHash_(Utilities.getUuid()).slice(0, 6).toUpperCase();
}

function portalParseJson_(value, fallback) {
  try {
    return value ? JSON.parse(String(value)) : fallback;
  } catch (error) {
    return fallback;
  }
}

function portalStableJson_(value) {
  function normalize(item) {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === 'object') {
      const result = {};
      Object.keys(item).sort().forEach(function (key) { result[key] = normalize(item[key]); });
      return result;
    }
    return item === undefined ? null : item;
  }
  return JSON.stringify(normalize(value));
}

function portalEscapeHtml_(value) {
  return portalSafeTrim_(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function portalDiagnosticarImplementacion() {
  const service = ScriptApp.getService();
  const properties = PropertiesService.getScriptProperties();

  let spreadsheetStatus = '';
  let allowedOrigins = [];
  let error = '';

  try {
    const spreadsheet = portalGetSpreadsheet_();
    spreadsheetStatus = spreadsheet.getId();
    allowedOrigins = portalGetAllowedOrigins_();
  } catch (e) {
    error = e.message || String(e);
  }

  const result = {
    webAppEnabled: service.isEnabled(),
    webAppUrl: service.getUrl(),
    masterSpreadsheetId:
      properties.getProperty('PORTAL_MASTER_SPREADSHEET_ID') || '',
    spreadsheetStatus: spreadsheetStatus,
    allowedOrigins: allowedOrigins,
    error: error
  };

  console.log(JSON.stringify(result, null, 2));
  return result;
}