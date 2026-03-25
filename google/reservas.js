/***************************************
 * CONFIGURACIÓN GENERAL
 ***************************************/
const SHEET_RESPUESTAS = 'Respuestas de formulario 1';
const SHEET_BIENES = 'Bienes';
const SHEET_CONFIG = 'Config';

// Estados
const ESTADO_PENDIENTE = 'Pendiente';
const ESTADO_APROBADA = 'Aprobada';
const ESTADO_CONFIRMADA = 'Confirmado';
const ESTADO_RECHAZADA_REGLA = 'Rechazada por regla';
const ESTADO_RECHAZADA_CONFLICTO = 'Rechazada por conflicto';
const ESTADO_CANCELADA = 'Cancelada';

// Estado que NO bloquea disponibilidad (solo Cancelada)
const ESTADO_NO_BLOQUEANTE = ESTADO_CANCELADA;

/***************************************
 * WEB APP - CONSULTA DISPONIBILIDAD
 * GET ?bienId=SALON1&fecha=2026-03-30
 ***************************************/
function doGet(e) {
  try {
    const action = getParam_(e, 'action');

    // Listar bienes activos
    if (action === 'listBienes') {
      return jsonOutput_({
        ok: true,
        bienes: listActiveBienes_()
      });
    }

    // Disponibilidad de todos los bienes para una fecha
    if (action === 'availability') {
      return handleAvailabilityQuery_(e);
    }

    const bienId = getParam_(e, 'bienId');
    const fechaStr = getParam_(e, 'fecha'); // YYYY-MM-DD

    if (!bienId || !fechaStr) {
      return jsonOutput_({
        ok: false,
        error: 'Parámetros requeridos: bienId y fecha'
      });
    }

    const bien = getBienById_(bienId);
    if (!bien) {
      return jsonOutput_({
        ok: false,
        error: `No existe el bien ${bienId}`
      });
    }

    if (!toBoolean_(bien.Activo)) {
      return jsonOutput_({
        ok: false,
        error: `El bien ${bienId} no está activo`
      });
    }

    const config = getConfigMap_();
    const fecha = parseDateInput_(fechaStr);
    if (!fecha) {
      return jsonOutput_({
        ok: false,
        error: 'Fecha inválida. Usa formato YYYY-MM-DD'
      });
    }

    const validacionFecha = validateAdvanceDays_(fecha, config);
    if (!validacionFecha.ok) {
      return jsonOutput_({
        ok: false,
        error: validacionFecha.message
      });
    }

    const slots = buildAvailabilitySlots_(bien, fecha, config);

    return jsonOutput_({
      ok: true,
      bienId: bien.BienID,
      descripcion: bien.Descripcion,
      fecha: formatDateYMD_(fecha),
      requiereAprobacion: normalizeYesNo_(config.requiere_aprobacion) === 'SI',
      slots: slots
    });
  } catch (error) {
    return jsonOutput_({
      ok: false,
      error: error.message || String(error)
    });
  }
}

/***************************************
 * TRIGGER DEL FORM
 * Ejecutar con disparador "Al enviar formulario"
 ***************************************/
function onFormSubmit(e) {
  const ADMIN_EMAIL = 'bulevarverdeadmon@gmail.com';
  const CC_EMAIL = 'consejo.bulevarverde@gmail.com';

  try {
    const sheet = getSheetByNameOrThrow_(SHEET_RESPUESTAS);
    const headers = getHeaders_(sheet);

    let rowIndex = null;
    if (e && e.range) {
      rowIndex = e.range.getRow();
    } else {
      rowIndex = sheet.getLastRow();
    }

    const rowObj = getRowObject_(sheet, rowIndex, headers);

    // Datos de la reserva
    const inmueble = safeTrim_(rowObj['Inmueble']);
    const asunto = safeTrim_(rowObj['Asunto']);
    const fechaRaw = rowObj['FechaReserva'];
    const horario = safeTrim_(rowObj['Horario']);
    const torre = safeTrim_(rowObj['Torre']);
    const apto = safeTrim_(rowObj['Apto']);
    const nombre = safeTrim_(rowObj['Nombre']);
    const email = safeTrim_(rowObj['Dirección de correo electrónico']);

    // Formatear fecha de reserva
    const fechaReserva = normalizeSheetDate_(fechaRaw);
    const fechaStr = fechaReserva ? formatDateYMD_(fechaReserva) : String(fechaRaw);

    // Formatear horario (puede ser Date object de Sheets)
    let horarioStr = horario;
    const horarioMinutes = parseTimeToMinutes_(rowObj['Horario']);
    if (horarioMinutes != null) {
      horarioStr = minutesToHHmm_(horarioMinutes);
    }

    // Escribir estado Pendiente
    const estadoCol = getColumnIndex_(headers, 'Estado');
    sheet.getRange(rowIndex, estadoCol).setValue(ESTADO_PENDIENTE);

    // Generar ID de reserva
    const fecha = new Date();
    const consecutivo = Utilities.formatDate(fecha, Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
    const idReserva = 'RES-' + consecutivo;

    // Escribir observaciones con ID
    const observacionesCol = getColumnIndex_(headers, 'Observaciones');
    sheet.getRange(rowIndex, observacionesCol).setValue(idReserva + ' - Pendiente de aprobación');

    // Enviar correo
    const asuntoEmail = '[Bulevar Verde] Nueva Reserva - ' + idReserva;
    const cuerpo =
      'Se ha recibido una nueva solicitud de reserva.\n\n' +
      'ID de reserva: ' + idReserva + '\n\n' +
      'Datos del solicitante:\n' +
      'Nombre: ' + nombre + '\n' +
      'Torre: ' + torre + '\n' +
      'Apartamento: ' + apto + '\n' +
      'Correo electrónico: ' + email + '\n\n' +
      'Detalle de la reserva:\n' +
      'Inmueble: ' + inmueble + '\n' +
      'Asunto: ' + asunto + '\n' +
      'Fecha: ' + fechaStr + '\n' +
      'Horario: ' + horarioStr + '\n\n' +
      'Estado: Pendiente de aprobación\n\n' +
      'Fecha de recepción: ' + Utilities.formatDate(fecha, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') + '\n\n' +
      'Este correo fue generado automáticamente desde el sistema de reservas de Bulevar Verde.';

    MailApp.sendEmail({
      to: ADMIN_EMAIL,
      cc: CC_EMAIL,
      subject: asuntoEmail,
      body: cuerpo
    });

    Logger.log('Reserva procesada: ' + idReserva + ' fila ' + rowIndex);
  } catch (error) {
    Logger.log('Error en onFormSubmit: ' + error);
    throw error;
  }
}

/***************************************
 * DEBUG / TEST - Simular envío de formulario
 ***************************************/
function testOnFormSubmit() {
  const sheet = getSheetByNameOrThrow_(SHEET_RESPUESTAS);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    throw new Error('No hay datos en la hoja de respuestas');
  }

  Logger.log('=== TEST onFormSubmit ===');
  Logger.log('Procesando fila: ' + lastRow);

  const fakeEvent = {
    range: sheet.getRange(lastRow, 1)
  };

  onFormSubmit(fakeEvent);
}

/***************************************
 * DEBUG / TEST 1
 * Probar disponibilidad manualmente
 * BienID=SALON1, SALON2, SALON3, CANCHA1, CANCHA2
 ***************************************/
function testGetAvailability() {
  const bienId = 'SALON1';
  const fechaStr = '2026-03-30';

  const fakeEvent = {
    parameter: {
      bienId: bienId,
      fecha: fechaStr
    }
  };

  const result = doGet(fakeEvent);
  Logger.log(result.getContent());
}

/***************************************
 * DEBUG / TEST 2
 * Valida nuevamente la última fila
 ***************************************/
function testValidateLastRow() {
  const sheet = getSheetByNameOrThrow_(SHEET_RESPUESTAS);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    throw new Error('No hay datos en la hoja de respuestas');
  }

  const result = processReservationRow_(lastRow);
  Logger.log(JSON.stringify(result, null, 2));
}

/***************************************
 * PROCESAMIENTO CENTRAL DE UNA FILA
 ***************************************/
function processReservationRow_(rowIndex) {
  const respuestasSheet = getSheetByNameOrThrow_(SHEET_RESPUESTAS);
  const headers = getHeaders_(respuestasSheet);
  const rowObj = getRowObject_(respuestasSheet, rowIndex, headers);

  const config = getConfigMap_();

  // Normalizar datos de entrada
  const reservation = {
    rowIndex: rowIndex,
    email: safeTrim_(rowObj['Dirección de correo electrónico']),
    bienId: safeTrim_(rowObj['Inmueble']),
    asunto: safeTrim_(rowObj['Asunto']),
    fechaReservaRaw: rowObj['FechaReserva'],
    horario: safeTrim_(rowObj['Horario']),
    torre: safeTrim_(rowObj['Torre']),
    apto: safeTrim_(rowObj['Apto']),
    nombre: safeTrim_(rowObj['Nombre']),
    estadoActual: safeTrim_(rowObj['Estado']),
    observacionesActual: safeTrim_(rowObj['Observaciones'])
  };

  const validation = validateReservation_(reservation, config, rowIndex);

  updateReservationStatus_(rowIndex, validation.estado, validation.observaciones);

  return {
    ok: validation.ok,
    rowIndex: rowIndex,
    estado: validation.estado,
    observaciones: validation.observaciones
  };
}

/***************************************
 * VALIDACIÓN DE RESERVA
 ***************************************/
function validateReservation_(reservation, config, currentRowIndex) {
  if (!reservation.bienId) {
    return failValidation_(ESTADO_RECHAZADA_REGLA, 'El campo Inmueble es obligatorio.');
  }

  if (!reservation.fechaReservaRaw) {
    return failValidation_(ESTADO_RECHAZADA_REGLA, 'El campo FechaReserva es obligatorio.');
  }

  if (!reservation.horario) {
    return failValidation_(ESTADO_RECHAZADA_REGLA, 'El campo Horario es obligatorio.');
  }

  if (!reservation.apto) {
    return failValidation_(ESTADO_RECHAZADA_REGLA, 'El campo Apto es obligatorio.');
  }

  const bien = getBienById_(reservation.bienId);
  if (!bien) {
    return failValidation_(ESTADO_RECHAZADA_REGLA, `No existe el bien ${reservation.bienId}.`);
  }

  if (!toBoolean_(bien.Activo)) {
    return failValidation_(ESTADO_RECHAZADA_REGLA, `El bien ${reservation.bienId} no está activo.`);
  }

  const fechaReserva = normalizeSheetDate_(reservation.fechaReservaRaw);
  if (!fechaReserva) {
    return failValidation_(ESTADO_RECHAZADA_REGLA, 'FechaReserva inválida.');
  }

  const advanceCheck = validateAdvanceDays_(fechaReserva, config);
  if (!advanceCheck.ok) {
    return failValidation_(ESTADO_RECHAZADA_REGLA, advanceCheck.message);
  }

  const slot = parseHorario_(reservation.horario);
  if (!slot.ok) {
    return failValidation_(ESTADO_RECHAZADA_REGLA, slot.message);
  }

  const durationHours = (slot.endMinutes - slot.startMinutes) / 60;
  const ruleCheck = validateReservationAgainstBienRules_(slot, durationHours, bien, config);
  if (!ruleCheck.ok) {
    return failValidation_(ESTADO_RECHAZADA_REGLA, ruleCheck.message);
  }

  const aptoCheck = validateMaxActiveReservationsPerApto_(
    reservation.apto,
    currentRowIndex,
    config
  );
  if (!aptoCheck.ok) {
    return failValidation_(ESTADO_RECHAZADA_REGLA, aptoCheck.message);
  }

  const conflict = hasConflict_(reservation.bienId, fechaReserva, slot, currentRowIndex);
  if (conflict.hasConflict) {
    return failValidation_(
      ESTADO_RECHAZADA_CONFLICTO,
      `Conflicto: ya existe una reserva activa para ${reservation.bienId} en el horario ${reservation.horario}.`
    );
  }

  const requiereAprobacion = normalizeYesNo_(config.requiere_aprobacion) === 'SI';
  if (requiereAprobacion) {
    return {
      ok: true,
      estado: ESTADO_PENDIENTE,
      observaciones: 'Reserva válida. Pendiente de aprobación administrativa.'
    };
  }

  return {
    ok: true,
    estado: ESTADO_APROBADA,
    observaciones: 'Reserva válida y aprobada automáticamente.'
  };
}

/***************************************
 * DISPONIBILIDAD
 ***************************************/
function buildAvailabilitySlots_(bien, fecha, config) {
  const openMinutes = parseTimeToMinutes_(bien.HoraApertura || config.hora_apertura);
  const closeMinutes = parseTimeToMinutes_(bien.HoraCierre || config.hora_cierre);

  if (openMinutes == null || closeMinutes == null || closeMinutes <= openMinutes) {
    throw new Error(`Configuración de horario inválida para ${bien.BienID}`);
  }

  let minDuration = toNumber_(bien.DuracionMin);
  let maxDuration = toNumber_(bien.DuracionMax);

  if (!minDuration) minDuration = toNumber_(config.duracion_min_horas);
  if (!maxDuration) maxDuration = toNumber_(config.duracion_max_horas);

  if (!minDuration || !maxDuration) {
    throw new Error(`Configuración de duración inválida para ${bien.BienID}`);
  }

  const reservations = getBlockingReservationsForBienAndDate_(bien.BienID, fecha);

  const slots = [];
  for (let duration = minDuration; duration <= maxDuration; duration++) {
    const durationMinutes = duration * 60;

    for (let start = openMinutes; start + durationMinutes <= closeMinutes; start += 60) {
      const end = start + durationMinutes;
      const available = !reservations.some(r => rangesOverlap_(start, end, r.startMinutes, r.endMinutes));

      slots.push({
        inicio: minutesToHHmm_(start),
        fin: minutesToHHmm_(end),
        label: `${minutesToHHmm_(start)} - ${minutesToHHmm_(end)}`,
        duracionHoras: duration,
        disponible: available
      });
    }
  }

  return slots;
}

/***************************************
 * REGLAS
 ***************************************/
function validateAdvanceDays_(fechaReserva, config) {
  const maxDays = toNumber_(config.dias_anticipacion_max);
  if (!maxDays) {
    return { ok: true };
  }

  const today = stripTime_(new Date());
  const target = stripTime_(fechaReserva);

  const diffDays = Math.floor((target.getTime() - today.getTime()) / 86400000);

  if (diffDays < 0) {
    return {
      ok: false,
      message: 'No se permiten reservas en fechas pasadas.'
    };
  }

  if (diffDays > maxDays) {
    return {
      ok: false,
      message: `La fecha supera el máximo de ${maxDays} días de anticipación.`
    };
  }

  return { ok: true };
}

function validateReservationAgainstBienRules_(slot, durationHours, bien, config) {
  const openMinutes = parseTimeToMinutes_(bien.HoraApertura || config.hora_apertura);
  const closeMinutes = parseTimeToMinutes_(bien.HoraCierre || config.hora_cierre);

  if (slot.startMinutes < openMinutes || slot.endMinutes > closeMinutes) {
    return {
      ok: false,
      message: `El horario solicitado está fuera del rango permitido para ${bien.BienID}.`
    };
  }

  let minDuration = toNumber_(bien.DuracionMin);
  let maxDuration = toNumber_(bien.DuracionMax);

  if (!minDuration) minDuration = toNumber_(config.duracion_min_horas);
  if (!maxDuration) maxDuration = toNumber_(config.duracion_max_horas);

  if (durationHours < minDuration) {
    return {
      ok: false,
      message: `La duración mínima para ${bien.BienID} es ${minDuration} hora(s).`
    };
  }

  if (durationHours > maxDuration) {
    return {
      ok: false,
      message: `La duración máxima para ${bien.BienID} es ${maxDuration} hora(s).`
    };
  }

  return { ok: true };
}

function validateMaxActiveReservationsPerApto_(apto, currentRowIndex, config) {
  const maxActivas = toNumber_(config.max_reservas_activas_por_apto);
  if (!maxActivas) {
    return { ok: true };
  }

  const sheet = getSheetByNameOrThrow_(SHEET_RESPUESTAS);
  const headers = getHeaders_(sheet);
  const data = getDataObjects_(sheet, headers);

  const activeCount = data.filter((row, idx) => {
    const rowNumber = idx + 2; // data inicia en fila 2
    if (rowNumber === currentRowIndex) return false;

    const rowApto = safeTrim_(row['Apto']);
    const estado = safeTrim_(row['Estado']);

    return rowApto === apto && estado !== ESTADO_CANCELADA;
  }).length;

  if (activeCount >= maxActivas) {
    return {
      ok: false,
      message: `El apartamento ${apto} ya tiene el máximo de reservas activas permitido (${maxActivas}).`
    };
  }

  return { ok: true };
}

/***************************************
 * CONFLICTOS
 ***************************************/
function hasConflict_(bienId, fechaReserva, slot, currentRowIndex) {
  const existing = getBlockingReservationsForBienAndDate_(bienId, fechaReserva);

  const conflict = existing.find(r => {
    if (r.rowIndex === currentRowIndex) return false;
    return rangesOverlap_(slot.startMinutes, slot.endMinutes, r.startMinutes, r.endMinutes);
  });

  return {
    hasConflict: !!conflict,
    conflict: conflict || null
  };
}

function getBlockingReservationsForBienAndDate_(bienId, fechaReserva) {
  const sheet = getSheetByNameOrThrow_(SHEET_RESPUESTAS);
  const headers = getHeaders_(sheet);
  const data = getDataObjects_(sheet, headers);

  const targetDate = formatDateYMD_(fechaReserva);

  // Build lookup: map Descripcion -> BienID for matching
  const bien = getBienById_(bienId);
  const descripcionBien = bien ? safeTrim_(bien['Descripcion']).toUpperCase() : '';

  return data
    .map((row, idx) => {
      const rowIndex = idx + 2;
      const estado = safeTrim_(row['Estado']);
      const rowInmueble = safeTrim_(row['Inmueble']);
      const rowFecha = normalizeSheetDate_(row['FechaReserva']);
      const horario = safeTrim_(row['Horario']);

      if (!rowFecha) return null;
      // Solo excluir reservas canceladas; todas las demás bloquean
      if (safeTrim_(row['Estado']) === ESTADO_CANCELADA) return null;
      if (formatDateYMD_(rowFecha) !== targetDate) return null;

      // Match by BienID or Descripcion (case-insensitive)
      const inmuebleUpper = rowInmueble.toUpperCase();
      if (inmuebleUpper !== bienId.toUpperCase() && inmuebleUpper !== descripcionBien) return null;

      // Try parsing horario as range (HH:mm-HH:mm) or single time (HH:mm:ss / HH:mm)
      const parsed = parseHorario_(horario);
      if (parsed.ok) {
        return {
          rowIndex: rowIndex,
          bienId: bienId,
          fecha: formatDateYMD_(rowFecha),
          horario: horario,
          startMinutes: parsed.startMinutes,
          endMinutes: parsed.endMinutes,
          estado: estado
        };
      }

      // Single time or Date object: treat as all-day reservation
      const singleTime = parseTimeToMinutes_(horario);
      return {
        rowIndex: rowIndex,
        bienId: bienId,
        fecha: formatDateYMD_(rowFecha),
        horario: horario,
        startMinutes: singleTime != null ? singleTime : 0,
        endMinutes: singleTime != null ? singleTime + 60 : 1440,
        estado: estado
      };
    })
    .filter(Boolean);
}

/***************************************
 * ESCRITURA EN SHEET
 ***************************************/
function updateReservationStatus_(rowIndex, estado, observaciones) {
  const sheet = getSheetByNameOrThrow_(SHEET_RESPUESTAS);
  const headers = getHeaders_(sheet);

  const estadoCol = getColumnIndex_(headers, 'Estado');
  const observacionesCol = getColumnIndex_(headers, 'Observaciones');

  sheet.getRange(rowIndex, estadoCol).setValue(estado);
  sheet.getRange(rowIndex, observacionesCol).setValue(observaciones);
}

/***************************************
 * LECTURA DE HOJAS
 ***************************************/
function getBienById_(bienId) {
  const sheet = getSheetByNameOrThrow_(SHEET_BIENES);
  const headers = getHeaders_(sheet);
  const data = getDataObjects_(sheet, headers);

  return data.find(row => safeTrim_(row['BienID']) === bienId) || null;
}

function listActiveBienes_() {
  const sheet = getSheetByNameOrThrow_(SHEET_BIENES);
  const headers = getHeaders_(sheet);
  const data = getDataObjects_(sheet, headers);

  return data
    .filter(row => toBoolean_(row['Activo']))
    .map(row => ({
      BienID: safeTrim_(row['BienID']),
      Descripcion: safeTrim_(row['Descripcion']),
      Tipo: safeTrim_(row['Tipo']) || 'CANCHA',
      Activo: true
    }));
}

/***************************************
 * DISPONIBILIDAD GLOBAL (TODOS LOS BIENES)
 ***************************************/
function handleAvailabilityQuery_(e) {
  const fechaStr = getParam_(e, 'fecha');
  if (!fechaStr) {
    return jsonOutput_({ ok: false, error: 'Parámetro requerido: fecha' });
  }

  const fecha = parseDateInput_(fechaStr);
  if (!fecha) {
    return jsonOutput_({ ok: false, error: 'Fecha inválida. Usa formato YYYY-MM-DD' });
  }

  const config = getConfigMap_();

  const validacionFecha = validateAdvanceDays_(fecha, config);
  if (!validacionFecha.ok) {
    return jsonOutput_({ ok: false, error: validacionFecha.message });
  }

  const sheet = getSheetByNameOrThrow_(SHEET_BIENES);
  const headers = getHeaders_(sheet);
  const data = getDataObjects_(sheet, headers);

  const bienes = data
    .filter(row => toBoolean_(row['Activo']))
    .map(row => {
      const bienId = safeTrim_(row['BienID']);
      const tipo = safeTrim_(row['Tipo']) || 'CANCHA';
      const descripcion = safeTrim_(row['Descripcion']);

      if (tipo === 'SALON') {
        const reservations = getBlockingReservationsForBienAndDate_(bienId, fecha);
        const openMin = parseTimeToMinutes_(row['HoraApertura'] || config.hora_apertura);
        const closeMin = parseTimeToMinutes_(row['HoraCierre'] || config.hora_cierre);
        return {
          BienID: bienId,
          Descripcion: descripcion,
          Tipo: tipo,
          disponible: reservations.length === 0,
          horario: minutesToHHmm_(openMin) + '-' + minutesToHHmm_(closeMin),
          reservadoPor: reservations.length > 0 ? 'Reservado' : null
        };
      } else {
        const slots = buildAvailabilitySlots_(row, fecha, config);
        return {
          BienID: bienId,
          Descripcion: descripcion,
          Tipo: tipo,
          slots: slots
        };
      }
    });

  return jsonOutput_({
    ok: true,
    fecha: formatDateYMD_(fecha),
    requiereAprobacion: normalizeYesNo_(config.requiere_aprobacion) === 'SI',
    bienes: bienes
  });
}

function getConfigMap_() {
  const sheet = getSheetByNameOrThrow_(SHEET_CONFIG);
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) return {};

  const result = {};
  for (let i = 1; i < values.length; i++) {
    const key = safeTrim_(values[i][0]);
    const value = values[i][1];
    if (key) {
      result[key] = value;
    }
  }

  return result;
}

/***************************************
 * HELPERS DE SHEET
 ***************************************/
function getSheetByNameOrThrow_(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) {
    throw new Error(`No existe la hoja: ${name}`);
  }
  return sheet;
}

function getHeaders_(sheet) {
  const lastColumn = sheet.getLastColumn();
  return sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(h => safeTrim_(h));
}

function getDataObjects_(sheet, headers) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
  return values.map(row => rowToObject_(headers, row));
}

function getRowObject_(sheet, rowIndex, headers) {
  const row = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
  return rowToObject_(headers, row);
}

function rowToObject_(headers, row) {
  const obj = {};
  headers.forEach((header, i) => {
    obj[header] = row[i];
  });
  return obj;
}

function getColumnIndex_(headers, headerName) {
  const idx = headers.indexOf(headerName);
  if (idx === -1) {
    throw new Error(`No existe la columna "${headerName}"`);
  }
  return idx + 1;
}

/***************************************
 * HELPERS DE PARÁMETROS Y JSON
 ***************************************/
function getParam_(e, key) {
  if (!e) return null;
  if (e.parameter && key in e.parameter) return e.parameter[key];
  return null;
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/***************************************
 * HELPERS DE FECHA Y HORA
 ***************************************/
function parseDateInput_(value) {
  if (!value) return null;

  // Esperado: YYYY-MM-DD
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);

  return new Date(year, month, day);
}

function normalizeSheetDate_(value) {
  if (!value) return null;

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const parsed = parseDateInput_(String(value));
  if (parsed) return parsed;

  const tryNative = new Date(value);
  if (!isNaN(tryNative.getTime())) {
    return new Date(tryNative.getFullYear(), tryNative.getMonth(), tryNative.getDate());
  }

  return null;
}

function formatDateYMD_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function stripTime_(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseHorario_(horario) {
  if (!horario) {
    return {
      ok: false,
      message: 'Horario vacío.'
    };
  }

  const normalized = String(horario).trim();
  const match = normalized.match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);

  if (!match) {
    return {
      ok: false,
      message: 'Formato de Horario inválido. Usa HH:mm-HH:mm, por ejemplo 08:00-10:00.'
    };
  }

  const startMinutes = parseTimeToMinutes_(match[1]);
  const endMinutes = parseTimeToMinutes_(match[2]);

  if (startMinutes == null || endMinutes == null || endMinutes <= startMinutes) {
    return {
      ok: false,
      message: 'Horario inválido.'
    };
  }

  return {
    ok: true,
    start: match[1],
    end: match[2],
    startMinutes: startMinutes,
    endMinutes: endMinutes
  };
}

function parseTimeToMinutes_(value) {
  if (value === null || value === undefined || value === '') return null;

  // Google Sheets devuelve celdas de hora como objetos Date
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return value.getHours() * 60 + value.getMinutes();
  }

  let str = String(value).trim().toLowerCase();

  // Soporta:
  // 08:00
  // 8:00
  // 08:00 am
  // 11:59 pm
  const match = str.match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const ampm = match[3] || null;

  if (minutes < 0 || minutes > 59) return null;

  if (ampm) {
    if (hours < 1 || hours > 12) return null;
    if (ampm === 'am') {
      if (hours === 12) hours = 0;
    } else if (ampm === 'pm') {
      if (hours !== 12) hours += 12;
    }
  } else {
    if (hours < 0 || hours > 23) return null;
  }

  return hours * 60 + minutes;
}

function minutesToHHmm_(minutes) {
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  return pad2_(hh) + ':' + pad2_(mm);
}

function rangesOverlap_(start1, end1, start2, end2) {
  return start1 < end2 && end1 > start2;
}

/***************************************
 * HELPERS GENERALES
 ***************************************/
function safeTrim_(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function pad2_(n) {
  return n < 10 ? '0' + n : String(n);
}

function toBoolean_(value) {
  if (typeof value === 'boolean') return value;
  const str = safeTrim_(value).toUpperCase();
  return ['TRUE', 'SI', 'SÍ', 'YES', '1'].includes(str);
}

function normalizeYesNo_(value) {
  const str = safeTrim_(value).toUpperCase();
  if (['SI', 'SÍ', 'YES', 'TRUE', '1'].includes(str)) return 'SI';
  return 'NO';
}

function toNumber_(value) {
  if (typeof value === 'number') return value;
  const str = safeTrim_(value).replace(/[^\d.]/g, '');
  if (!str) return null;
  const n = Number(str);
  return isNaN(n) ? null : n;
}

function failValidation_(estado, message) {
  return {
    ok: false,
    estado: estado,
    observaciones: message
  };
}