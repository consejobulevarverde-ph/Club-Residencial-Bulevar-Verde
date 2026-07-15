/***************************************
 * CONFIGURACIÓN GENERAL
 ***************************************/
const SHEET_RESPUESTAS = 'Respuestas de formulario 1';
const SHEET_BIENES = 'Bienes';
const SHEET_CONFIG = 'Config';

// Estados válidos del sistema
const ESTADO_PENDIENTE = 'Pendiente';        // Estado inicial - requiere verificación de pago
// const ESTADO_APROBADA = 'Aprobada';        // DEPRECADO - Ya no se usa en el flujo
const ESTADO_CONFIRMADA = 'Confirmado';       // Después de verificar pago manualmente
const ESTADO_RECHAZADA_REGLA = 'Rechazada por regla';
const ESTADO_RECHAZADA_CONFLICTO = 'Rechazada por conflicto';
const ESTADO_CANCELADA = 'Cancelada';

// Estado que NO bloquea disponibilidad (solo Cancelada)
const ESTADO_NO_BLOQUEANTE = ESTADO_CANCELADA;

// Origenes de reserva
const ORIGEN_GOOGLE_FORM = 'GOOGLE_FORM';
const ORIGEN_WEB_POST = 'WEB_POST';

// Control de migraciones
const RESERVATION_MIGRATION_DRY_RUN = false; // Cambiar a true para modo diagnóstico

/***************************************
 * WEB APP - CONSULTA DISPONIBILIDAD
 * GET ?bienId=SALON1&fecha=2026-03-30
 ***************************************/
function doGet(e) {
  try {
    const action = getParam_(e, 'action');

    const aptoIngresado = getParam_(e, 'apto') || '';
    const placaIngresada = getParam_(e, 'placa') || '';

    Logger.log('=== CONSULTA doGet ===');
    Logger.log('Action: ' + action);
    Logger.log('Apto ingresado: ' + aptoIngresado);
    Logger.log('Placa ingresada: ' + placaIngresada);
    Logger.log('Parámetros completos: ' + JSON.stringify(e.parameter));

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

    // Verificar si una reserva existe por requestId
    if (action === 'verifyReservation') {
      const requestId = getParam_(e, 'requestId');
      if (!requestId) {
        return jsonOutput_({
          ok: false,
          error: 'requestId es requerido'
        });
      }

      const reservation = findReservationByRequestId_(requestId);
      if (reservation) {
        return jsonOutput_({
          ok: true,
          exists: true,
          idReserva: reservation.idReserva,
          estado: reservation.estado,
          rowIndex: reservation.rowIndex
        });
      } else {
        return jsonOutput_({
          ok: true,
          exists: false,
          message: 'No se encontró reserva con ese requestId'
        });
      }
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
 * WEB APP - CREAR RESERVA (POST)
 * POST con payload JSON
 ***************************************/
function doPost(e) {
  const ADMIN_EMAIL = 'bulevarverdeadmon@gmail.com';
  const CC_EMAIL = 'consejo.bulevarverde@gmail.com';

  try {
    Logger.log('=== doPost INICIO ===');
    Logger.log('postData: ' + (e.postData ? e.postData.contents : 'null'));

    // Parsear payload
    let payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseError) {
      return jsonOutput_({
        ok: false,
        error: 'Payload JSON inválido: ' + parseError.message
      });
    }

    Logger.log('Payload parseado: ' + JSON.stringify(payload));

    // Validar campos obligatorios
    const requiredFields = ['requestId', 'bienId', 'fecha', 'horario', 'torre', 'apto', 'nombre', 'email', 'asunto'];
    const missingFields = requiredFields.filter(field => !payload[field]);
    
    if (missingFields.length > 0) {
      return jsonOutput_({
        ok: false,
        error: 'Campos obligatorios faltantes: ' + missingFields.join(', ')
      });
    }

    // Verificar duplicados por requestId
    const existingReservation = findReservationByRequestId_(payload.requestId);
    if (existingReservation) {
      Logger.log('Reserva duplicada detectada por requestId: ' + payload.requestId);
      return jsonOutput_({
        ok: true,
        idReserva: existingReservation.idReserva,
        mensaje: 'Reserva ya existe (duplicado evitado)',
        rowIndex: existingReservation.rowIndex
      });
    }

    // Asegurar columnas técnicas
    ensureReservationTechnicalColumns_();

    // Crear la reserva
    const result = createReservation_(payload);

    if (!result.ok) {
      return jsonOutput_(result);
    }

    // Enviar notificación por correo
    try {
      const bien = getBienById_(payload.bienId);
      const descripcionBien = bien ? bien.Descripcion : payload.bienId;

      const asuntoEmail = '[Bulevar Verde] Nueva Reserva Web - ' + result.idReserva;
      const cuerpo =
        'Se ha recibido una nueva solicitud de reserva desde el portal web.\n\n' +
        'ID de reserva: ' + result.idReserva + '\n' +
        'Request ID: ' + payload.requestId + '\n\n' +
        'Datos del solicitante:\n' +
        'Nombre: ' + payload.nombre + '\n' +
        'Torre: ' + payload.torre + '\n' +
        'Apartamento: ' + payload.apto + '\n' +
        'Correo electrónico: ' + payload.email + '\n\n' +
        'Detalle de la reserva:\n' +
        'Inmueble: ' + descripcionBien + '\n' +
        'Asunto: ' + payload.asunto + '\n' +
        'Fecha: ' + payload.fecha + '\n' +
        'Horario: ' + payload.horario + '\n\n' +
        'Estado: ' + result.estado + '\n' +
        'Observaciones: ' + result.observaciones + '\n\n' +
        'Acepta Reglamento: ' + (payload.aceptaReglamento ? 'SI' : 'NO') + '\n' +
        'Acepta Tratamiento de Datos: ' + (payload.aceptaTratamientoDatos ? 'SI' : 'NO') + '\n\n' +
        'Fecha de registro: ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') + '\n\n' +
        'Este correo fue generado automáticamente desde el sistema de reservas de Bulevar Verde.';

      MailApp.sendEmail({
        to: ADMIN_EMAIL,
        //cc: CC_EMAIL,
        subject: asuntoEmail,
        body: cuerpo
      });

      Logger.log('Correo de notificación enviado');
    } catch (emailError) {
      Logger.log('Error enviando correo: ' + emailError.message);
      // No fallar la reserva por error de correo
    }

    return jsonOutput_({
      ok: true,
      idReserva: result.idReserva,
      estado: result.estado,
      observaciones: result.observaciones,
      rowIndex: result.rowIndex,
      mensaje: 'Reserva creada exitosamente'
    });

  } catch (error) {
    Logger.log('Error en doPost: ' + error.message);
    Logger.log('Stack: ' + error.stack);
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
    sheet.getRange(rowIndex, observacionesCol).setValue(idReserva + ' - Pendiente de confirmación de pago');

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
      'Estado: Pendiente de confirmación de pago\n\n' +
      'Fecha de recepción: ' + Utilities.formatDate(fecha, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') + '\n\n' +
      'Este correo fue generado automáticamente desde el sistema de reservas de Bulevar Verde.';

    MailApp.sendEmail({
      to: ADMIN_EMAIL,
      //cc: CC_EMAIL,
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
      observaciones: 'Reserva válida. Pendiente de confirmación de pago.'
    };
  }

  // TODAS las reservas web quedan en estado Pendiente
  // La confirmación es manual después de verificar el pago
  return {
    ok: true,
    estado: ESTADO_PENDIENTE,
    observaciones: 'Reserva válida. Pendiente de confirmación de pago.'
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
  logBlockingReservations_(bien.BienID, fecha, reservations);

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

  // CRÍTICO: Los salones se reservan por día completo, NO requieren validación de duración
  // Solo validar duración para canchas (reservas por horas)
  const tipo = safeTrim_(bien.Tipo) || 'CANCHA';
  if (tipo === 'SALON') {
    return { ok: true };
  }

  // Validación de duración solo para CANCHAS
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
      
      // LÓGICA DE BLOQUEO DE DISPONIBILIDAD:
      // - Estado "Cancelada" → NO bloquea (disponible)
      // - Estado "Pendiente" → SÍ bloquea (no disponible)
      // - Estado "Confirmado" → SÍ bloquea (no disponible)
      // - Cualquier otro estado → SÍ bloquea
      if (estado === ESTADO_CANCELADA) return null;
      
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

// DEBUG: Función auxiliar para logging de disponibilidad
function logBlockingReservations_(bienId, fecha, reservations) {
  if (reservations.length > 0) {
    Logger.log('Reservas bloqueantes para ' + bienId + ' en ' + formatDateYMD_(fecha) + ':');
    reservations.forEach(function(r) {
      Logger.log('  - Fila ' + r.rowIndex + ': Estado=' + r.estado + ', Horario=' + r.horario);
    });
  }
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
        logBlockingReservations_(bienId, fecha, reservations);
        const openMin = parseTimeToMinutes_(row['HoraApertura'] || config.hora_apertura);
        const closeMin = parseTimeToMinutes_(row['HoraCierre'] || config.hora_cierre);
        
        // Validar que los horarios sean válidos
        let horarioFinal;
        if (openMin !== null && closeMin !== null && closeMin > openMin) {
          horarioFinal = minutesToHHmm_(openMin) + '-' + minutesToHHmm_(closeMin);
        } else {
          // Fallback seguro: 6 horas (máximo común para salones)
          Logger.log('ADVERTENCIA: ' + bienId + ' no tiene horarios válidos, usando fallback 08:00-14:00');
          horarioFinal = '08:00-14:00';
        }
        
        return {
          BienID: bienId,
          Descripcion: descripcion,
          Tipo: tipo,
          disponible: reservations.length === 0,
          horario: horarioFinal,
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
  const output = ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
  
  // Nota: CORS es manejado automáticamente por Google Apps Script Web Apps
  // pero el método OPTIONS no es soportado, por eso usamos no-cors + verificación posterior
  return output;
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
  // Validar entrada
  if (minutes === null || minutes === undefined || isNaN(minutes)) {
    return null;
  }
  
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





/***************************************
 * CALENDARIO VISUAL DE RESERVAS
 * Crea/actualiza tab: Calendario Reservas
 * Muestra mes actual y siguiente mes
 ***************************************/
function crearCalendarioVisualReservas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const hojaDatos = getSheetByNameOrThrow_(SHEET_RESPUESTAS);
  const headers = getHeaders_(hojaDatos);
  const data = getDataObjects_(hojaDatos, headers);

  const nombreHojaCalendario = 'Calendario Reservas';
  let hojaCalendario = ss.getSheetByName(nombreHojaCalendario);

  if (!hojaCalendario) {
    hojaCalendario = ss.insertSheet(nombreHojaCalendario);
  } else {
    hojaCalendario.clear();
  }

  const hoy = new Date();

  const anioActual = hoy.getFullYear();
  const mesActual = hoy.getMonth();

  const siguienteMesFecha = new Date(anioActual, mesActual + 1, 1);
  const anioSiguiente = siguienteMesFecha.getFullYear();
  const mesSiguiente = siguienteMesFecha.getMonth();

  // Mes actual
  pintarCalendarioReservas_(hojaCalendario, data, anioActual, mesActual, 1);

  // Siguiente mes debajo
  pintarCalendarioReservas_(hojaCalendario, data, anioSiguiente, mesSiguiente, 10);
}

/***************************************
 * CALENDARIO VISUAL - MES ESPECÍFICO
 * Ejemplo: crearCalendarioVisualReservasPorMes(2026, 6)
 ***************************************/
function crearCalendarioVisualReservasPorMes(anio, mesNumero) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const hojaDatos = getSheetByNameOrThrow_(SHEET_RESPUESTAS);
  const headers = getHeaders_(hojaDatos);
  const data = getDataObjects_(hojaDatos, headers);

  const nombreHojaCalendario = 'Calendario Reservas';
  let hojaCalendario = ss.getSheetByName(nombreHojaCalendario);

  if (!hojaCalendario) {
    hojaCalendario = ss.insertSheet(nombreHojaCalendario);
  } else {
    hojaCalendario.clear();
  }

  // mesNumero: Enero = 1, Febrero = 2, Junio = 6
  pintarCalendarioReservas_(hojaCalendario, data, anio, mesNumero - 1, 1);
}


/***************************************
 * PINTAR CALENDARIO
 ***************************************/
function pintarCalendarioReservas_(hoja, data, anio, mes, filaInicio) {
  const meses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const diasSemana = [
    'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'
  ];

  const reservasPorDia = {};

  data.forEach(row => {
    const fechaReserva = normalizeSheetDate_(row['FechaReserva']);
    if (!fechaReserva) return;

    if (
      fechaReserva.getFullYear() !== anio ||
      fechaReserva.getMonth() !== mes
    ) {
      return;
    }

    const estado = safeTrim_(row['Estado']);

    // No mostrar canceladas
    if (estado === ESTADO_CANCELADA) return;

    const dia = fechaReserva.getDate();

    if (!reservasPorDia[dia]) {
      reservasPorDia[dia] = [];
    }

    const horarioMinutos = parseTimeToMinutes_(row['Horario']);
    const horario = horarioMinutos !== null
      ? minutesToHHmm_(horarioMinutos)
      : safeTrim_(row['Horario']);

    const inmueble = safeTrim_(row['Inmueble']);
    const torre = safeTrim_(row['Torre']);
    const apto = safeTrim_(row['Apto']);
    const nombre = safeTrim_(row['Nombre']);
    const observaciones = safeTrim_(row['Observaciones']);

    let textoReserva = `${horario} - ${getInmuebleCorto_(inmueble)}\n${torre}-${apto} | ${nombre}`;

    if (observaciones) {
      textoReserva += `\n📝 ${observaciones}`;
    }

    reservasPorDia[dia].push(textoReserva);
  });

  // Título
  hoja.getRange(filaInicio, 1, 1, 7).merge();
  hoja.getRange(filaInicio, 1)
    .setValue(`${meses[mes]} ${anio}`)
    .setFontSize(18)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setBackground('#b7e1cd');

  // Encabezados días
  hoja.getRange(filaInicio + 1, 1, 1, 7).setValues([diasSemana]);
  hoja.getRange(filaInicio + 1, 1, 1, 7)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setBackground('#d9ead3');

  const primerDiaMes = new Date(anio, mes, 1);
  const ultimoDiaMes = new Date(anio, mes + 1, 0);

  let columna = primerDiaMes.getDay(); 
  columna = columna === 0 ? 7 : columna; // domingo pasa a columna 7

  let fila = filaInicio + 2;

  for (let dia = 1; dia <= ultimoDiaMes.getDate(); dia++) {
    const reservas = reservasPorDia[dia] || [];

    const textoCelda = reservas.length
      ? `${dia}\n\n${reservas.join('\n\n')}`
      : String(dia);

    const celda = hoja.getRange(fila, columna);

    celda
      .setValue(textoCelda)
      .setVerticalAlignment('top')
      .setWrap(true);

    if (reservas.length > 0) {
      celda.setBackground('#fff2cc');
    } else {
      celda.setBackground('#ffffff');
    }

    columna++;

    if (columna > 7) {
      columna = 1;
      fila++;
    }
  }

  hoja.setColumnWidths(1, 7, 190);

  for (let i = filaInicio + 2; i <= filaInicio + 7; i++) {
    hoja.setRowHeight(i, 135);
  }

  hoja.getRange(filaInicio, 1, 8, 7)
  .setBorder(true, true, true, true, true, true);

  hoja.setFrozenRows(2);
}


/***************************************
 * TRIGGER DIARIO - CALENDARIO RESERVAS
 ***************************************/
function crearTriggerDiarioCalendarioReservas() {
  // Evita crear triggers duplicados
  eliminarTriggersCalendarioReservas_();

  ScriptApp.newTrigger('crearCalendarioVisualReservas')
    .timeBased()
    .everyDays(1)
    .atHour(6) // Se ejecuta todos los días entre 6:00 y 7:00 AM
    .create();

  Logger.log('Trigger diario creado para actualizar Calendario Reservas.');
}


/***************************************
 * ELIMINAR TRIGGERS EXISTENTES
 * Solo elimina los triggers de crearCalendarioVisualReservas
 ***************************************/
function eliminarTriggersCalendarioReservas_() {
  const triggers = ScriptApp.getProjectTriggers();

  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'crearCalendarioVisualReservas') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

/***************************************
 * NOMBRE CORTO PARA CALENDARIO
 ***************************************/
function getInmuebleCorto_(inmueble) {
  const value = safeTrim_(inmueble).toLowerCase();

  if (value.includes('salon social 1') || value.includes('salón social 1')) {
    return '🏛️🌇1';
  }

  if (value.includes('salon social 2') || value.includes('salón social 2')) {
    return '🏛️🏢2';
  }

  if (value.includes('salon social 3') || value.includes('salón social 3')) {
    return '🏛️💂‍♂️3';
  }

  if (value.includes('cancha')) {
    return '⚽';
  }

  return inmueble;
}

/***************************************
 * FUNCIONES POST - CREACIÓN DE RESERVAS
 ***************************************/

/**
 * Crea una reserva desde payload POST
 * Mantiene compatibilidad total con estructura histórica A:K
 * Agrega columnas técnicas L:Q
 */
function createReservation_(payload) {
  const sheet = getSheetByNameOrThrow_(SHEET_RESPUESTAS);
  const headers = getHeaders_(sheet);
  const config = getConfigMap_();

  // Resolver bien por BienID
  const bien = getBienById_(payload.bienId);
  if (!bien) {
    return {
      ok: false,
      error: `No existe el bien ${payload.bienId}`
    };
  }

  if (!toBoolean_(bien.Activo)) {
    return {
      ok: false,
      error: `El bien ${payload.bienId} no está activo`
    };
  }

  // Normalizar fecha
  const fechaReserva = parseDateInput_(payload.fecha);
  if (!fechaReserva) {
    return {
      ok: false,
      error: 'Fecha inválida. Usa formato YYYY-MM-DD'
    };
  }

  // Validar anticipación
  const advanceCheck = validateAdvanceDays_(fechaReserva, config);
  if (!advanceCheck.ok) {
    return {
      ok: false,
      error: advanceCheck.message
    };
  }

  // Normalizar torre (T1, T2, T3, T4, T8)
  const torre = normalizeTorre_(payload.torre);

  // IMPORTANTE: Apartamento como texto para preservar ceros iniciales (0229)
  const apto = safeTrim_(payload.apto);

  // Parsear horario
  const slotParsed = parseHorario_(payload.horario);
  if (!slotParsed.ok) {
    return {
      ok: false,
      error: slotParsed.message
    };
  }

  const durationHours = (slotParsed.endMinutes - slotParsed.startMinutes) / 60;

  // Validar reglas del bien
  const ruleCheck = validateReservationAgainstBienRules_(slotParsed, durationHours, bien, config);
  if (!ruleCheck.ok) {
    return {
      ok: false,
      error: ruleCheck.message
    };
  }

  // Validar máximo de reservas activas por apartamento
  const aptoCheck = validateMaxActiveReservationsPerApto_(apto, null, config);
  if (!aptoCheck.ok) {
    return {
      ok: false,
      error: aptoCheck.message
    };
  }

  // Verificar conflictos de horario
  const conflict = hasConflict_(payload.bienId, fechaReserva, slotParsed, null);
  if (conflict.hasConflict) {
    return {
      ok: false,
      error: `Ya existe una reserva en ese horario para ${bien.Descripcion}. Conflicto en fila ${conflict.conflict.rowIndex}.`,
      estado: ESTADO_RECHAZADA_CONFLICTO
    };
  }

  // Generar IDs
  const idReserva = generateReservationId_();
  const ahora = new Date();

  // Determinar estado final
  // TODAS las reservas web quedan en estado Pendiente
  // La confirmación se realiza manualmente después de verificar el pago bancario
  const estadoFinal = ESTADO_PENDIENTE;
  const observacionesFinal = idReserva + ' - Pendiente de confirmación de pago';

  // ESCRITURA DE NUEVA FILA - Compatibilidad con columnas A:K existentes
  const newRowData = [];

  // A: Marca temporal (fecha/hora actual)
  newRowData.push(ahora);

  // B: Dirección de correo electrónico
  newRowData.push(safeTrim_(payload.email));

  // C: Inmueble - IMPORTANTE: Usar Descripcion para compatibilidad histórica
  newRowData.push(bien.Descripcion);

  // D: Asunto
  newRowData.push(safeTrim_(payload.asunto));

  // E: FechaReserva (Date object real)
  newRowData.push(fechaReserva);

  // F: Horario (rango HH:mm-HH:mm)
  newRowData.push(payload.horario);

  // G: Torre (normalizada: T1, T2, T3, T4, T8)
  newRowData.push(torre);

  // H: Apto (texto para preservar ceros iniciales)
  newRowData.push(apto);

  // I: Nombre
  newRowData.push(safeTrim_(payload.nombre));

  // J: Estado
  newRowData.push(estadoFinal);

  // K: Observaciones
  newRowData.push(observacionesFinal);

  // Columnas técnicas L:Q (si existen)
  const colIdReserva = headers.indexOf('IdReserva');
  const colRequestId = headers.indexOf('RequestId');
  const colOrigen = headers.indexOf('OrigenReserva');
  const colFechaRegistro = headers.indexOf('FechaRegistroSistema');
  const colAceptaReglamento = headers.indexOf('AceptaReglamento');
  const colAceptaTratamiento = headers.indexOf('AceptaTratamientoDatos');

  if (colIdReserva >= 0) newRowData[colIdReserva] = idReserva;
  if (colRequestId >= 0) newRowData[colRequestId] = safeTrim_(payload.requestId);
  if (colOrigen >= 0) newRowData[colOrigen] = ORIGEN_WEB_POST;
  if (colFechaRegistro >= 0) newRowData[colFechaRegistro] = ahora;
  if (colAceptaReglamento >= 0) newRowData[colAceptaReglamento] = payload.aceptaReglamento ? 'SI' : 'NO';
  if (colAceptaTratamiento >= 0) newRowData[colAceptaTratamiento] = payload.aceptaTratamientoDatos ? 'SI' : 'NO';

  // Escribir fila nueva
  const lastRow = sheet.getLastRow();
  const newRowIndex = lastRow + 1;
  
  // Escribir solo las columnas necesarias
  const numCols = Math.max(11, headers.length); // Mínimo A:K (11 columnas)
  sheet.getRange(newRowIndex, 1, 1, numCols).setValues([newRowData]);

  Logger.log('Reserva creada: ' + idReserva + ' en fila ' + newRowIndex);

  return {
    ok: true,
    idReserva: idReserva,
    estado: estadoFinal,
    observaciones: observacionesFinal,
    rowIndex: newRowIndex
  };
}

/**
 * Genera ID único de reserva
 * Formato: RES-YYYYMMDD-HHmmss
 */
function generateReservationId_() {
  const ahora = new Date();
  const timestamp = Utilities.formatDate(ahora, Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
  return 'RES-' + timestamp;
}

/**
 * Busca reserva existente por RequestId para evitar duplicados
 * Retorna { idReserva, rowIndex } o null
 */
function findReservationByRequestId_(requestId) {
  if (!requestId) return null;

  const sheet = getSheetByNameOrThrow_(SHEET_RESPUESTAS);
  const headers = getHeaders_(sheet);
  
  const colRequestId = headers.indexOf('RequestId');
  if (colRequestId === -1) return null; // Columna no existe aún

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const requestIdColLetter = String.fromCharCode(65 + colRequestId);
  const requestIdValues = sheet.getRange(requestIdColLetter + '2:' + requestIdColLetter + lastRow).getValues();

  for (let i = 0; i < requestIdValues.length; i++) {
    if (safeTrim_(requestIdValues[i][0]) === requestId) {
      const rowIndex = i + 2;
      
      // Obtener IdReserva y Estado de esa fila
      const colIdReserva = headers.indexOf('IdReserva');
      const colEstado = headers.indexOf('Estado');
      
      let idReserva = 'UNKNOWN';
      let estado = 'UNKNOWN';
      
      if (colIdReserva >= 0) {
        const idReservaValue = sheet.getRange(rowIndex, colIdReserva + 1).getValue();
        idReserva = safeTrim_(idReservaValue);
      }
      
      if (colEstado >= 0) {
        const estadoValue = sheet.getRange(rowIndex, colEstado + 1).getValue();
        estado = safeTrim_(estadoValue);
      }

      return {
        idReserva: idReserva,
        estado: estado,
        rowIndex: rowIndex
      };
    }
  }

  return null;
}

/**
 * Asegura que existan las columnas técnicas L:Q
 * Solo agrega las que faltan, sin modificar datos históricos
 * Respeta el modo dry-run
 */
function ensureReservationTechnicalColumns_() {
  const sheet = getSheetByNameOrThrow_(SHEET_RESPUESTAS);
  const headers = getHeaders_(sheet);

  const requiredTechnicalColumns = [
    'IdReserva',
    'RequestId',
    'OrigenReserva',
    'FechaRegistroSistema',
    'AceptaReglamento',
    'AceptaTratamientoDatos'
  ];

  const missingColumns = requiredTechnicalColumns.filter(col => !headers.includes(col));

  if (missingColumns.length === 0) {
    Logger.log('Todas las columnas técnicas ya existen');
    return;
  }

  if (RESERVATION_MIGRATION_DRY_RUN) {
    Logger.log('[DRY RUN] Se agregarían estas columnas: ' + missingColumns.join(', '));
    return;
  }

  // Agregar columnas faltantes al final
  const lastCol = sheet.getLastColumn();
  let nextCol = lastCol + 1;

  missingColumns.forEach(colName => {
    sheet.getRange(1, nextCol).setValue(colName);
    Logger.log('Columna técnica agregada: ' + colName + ' en columna ' + nextCol);
    nextCol++;
  });
}

/**
 * Resuelve bien desde valor histórico (puede ser BienID o Descripcion)
 * Retorna el objeto bien completo o null
 */
function resolveBienFromReservationValue_(value) {
  if (!value) return null;

  const valueNormalized = safeTrim_(value).toUpperCase();
  
  // Primero intentar por BienID exacto
  let bien = getBienById_(value);
  if (bien) return bien;

  // Luego buscar por descripción
  const sheet = getSheetByNameOrThrow_(SHEET_BIENES);
  const headers = getHeaders_(sheet);
  const data = getDataObjects_(sheet, headers);

  return data.find(row => {
    const descripcion = safeTrim_(row['Descripcion']).toUpperCase();
    return descripcion === valueNormalized || descripcion.includes(valueNormalized);
  }) || null;
}

/**
 * Obtiene la descripción de un bien por su BienID
 * Retorna la descripción o el BienID si no existe
 */
function resolveBienDescriptionById_(bienId) {
  const bien = getBienById_(bienId);
  return bien ? safeTrim_(bien.Descripcion) : bienId;
}

/**
 * Normaliza formato de torre: T1, T2, T3, T4, T8
 */
function normalizeTorre_(torre) {
  if (!torre) return '';
  
  const torreStr = safeTrim_(torre).toUpperCase();
  
  // Si ya tiene formato correcto
  if (/^T\d+$/.test(torreStr)) {
    return torreStr;
  }

  // Extraer número
  const match = torreStr.match(/(\d+)/);
  if (match) {
    return 'T' + match[1];
  }

  // Retornar como está si no se puede normalizar
  return torreStr;
}

/***************************************
 * DIAGNÓSTICO - NO MODIFICA DATOS
 ***************************************/

/**
 * Función de diagnóstico que muestra la estructura actual
 * NO modifica ningún dato
 */
function diagnosticarEstructuraReservas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  Logger.log('=== DIAGNÓSTICO ESTRUCTURA RESERVAS ===');
  Logger.log('Nombre del Spreadsheet: ' + ss.getName());
  Logger.log('ID: ' + ss.getId());
  Logger.log('');

  // Listar hojas
  const sheets = ss.getSheets();
  Logger.log('Hojas encontradas (' + sheets.length + '):');
  sheets.forEach(s => {
    Logger.log('  - ' + s.getName() + ' (Filas: ' + s.getLastRow() + ', Columnas: ' + s.getLastColumn() + ')');
  });
  Logger.log('');

  // Analizar hoja de respuestas
  try {
    const respuestasSheet = getSheetByNameOrThrow_(SHEET_RESPUESTAS);
    const headers = getHeaders_(respuestasSheet);
    
    Logger.log('Hoja: ' + SHEET_RESPUESTAS);
    Logger.log('Última fila: ' + respuestasSheet.getLastRow());
    Logger.log('Última columna: ' + respuestasSheet.getLastColumn());
    Logger.log('Encabezados (' + headers.length + '):');
    headers.forEach((h, idx) => {
      const letra = String.fromCharCode(65 + idx);
      Logger.log('  ' + letra + ': ' + h);
    });
    Logger.log('');

    // Contar reservas
    const totalReservas = respuestasSheet.getLastRow() - 1;
    Logger.log('Total de reservas: ' + totalReservas);

    // Verificar columnas técnicas
    const technicalCols = ['IdReserva', 'RequestId', 'OrigenReserva', 'FechaRegistroSistema', 'AceptaReglamento', 'AceptaTratamientoDatos'];
    Logger.log('Columnas técnicas:');
    technicalCols.forEach(col => {
      const exists = headers.includes(col);
      Logger.log('  - ' + col + ': ' + (exists ? 'EXISTE' : 'NO EXISTE'));
    });
    Logger.log('');

    // Contar filas con IdReserva
    const colIdReserva = headers.indexOf('IdReserva');
    if (colIdReserva >= 0) {
      const idReservaValues = respuestasSheet.getRange(2, colIdReserva + 1, totalReservas, 1).getValues();
      const countWithId = idReservaValues.filter(row => safeTrim_(row[0]) !== '').length;
      Logger.log('Filas con IdReserva: ' + countWithId + ' de ' + totalReservas);
    }

    // Contar filas con RequestId
    const colRequestId = headers.indexOf('RequestId');
    if (colRequestId >= 0) {
      const requestIdValues = respuestasSheet.getRange(2, colRequestId + 1, totalReservas, 1).getValues();
      const countWithReqId = requestIdValues.filter(row => safeTrim_(row[0]) !== '').length;
      Logger.log('Filas con RequestId: ' + countWithReqId + ' de ' + totalReservas);
    }
    Logger.log('');

  } catch (e) {
    Logger.log('Error analizando ' + SHEET_RESPUESTAS + ': ' + e.message);
  }

  // Analizar hoja de bienes
  try {
    const bienesSheet = getSheetByNameOrThrow_(SHEET_BIENES);
    const bienesHeaders = getHeaders_(bienesSheet);
    
    Logger.log('Hoja: ' + SHEET_BIENES);
    Logger.log('Encabezados: ' + bienesHeaders.join(', '));
    
    const bienesData = getDataObjects_(bienesSheet, bienesHeaders);
    Logger.log('Total de bienes: ' + bienesData.length);
    Logger.log('Bienes:');
    bienesData.forEach(bien => {
      Logger.log('  - ' + bien.BienID + ': ' + bien.Descripcion + ' (Tipo: ' + bien.Tipo + ', Activo: ' + bien.Activo + ')');
    });
    Logger.log('');

  } catch (e) {
    Logger.log('Error analizando ' + SHEET_BIENES + ': ' + e.message);
  }

  // Analizar configuración
  try {
    const configSheet = getSheetByNameOrThrow_(SHEET_CONFIG);
    const configValues = configSheet.getDataRange().getValues();
    
    Logger.log('Hoja: ' + SHEET_CONFIG);
    Logger.log('Claves de configuración:');
    for (let i = 1; i < configValues.length; i++) {
      const clave = safeTrim_(configValues[i][0]);
      const valor = configValues[i][1];
      if (clave) {
        Logger.log('  - ' + clave + ': ' + valor);
      }
    }
    Logger.log('');

    // Mostrar config parseada
    const config = getConfigMap_();
    Logger.log('Config parseada:');
    Logger.log(JSON.stringify(config, null, 2));

  } catch (e) {
    Logger.log('Error analizando ' + SHEET_CONFIG + ': ' + e.message);
  }

  Logger.log('=== FIN DIAGNÓSTICO ===');
}