/***************************************
 * CONFIGURACIÓN GENERAL
 ***************************************/
const SHEET_RESPUESTAS = 'Respuestas de formulario 1';
const SHEET_BIENES = 'Bienes';
const SHEET_CONFIG = 'Config';

const RESERVAS_VERSION = '15.1.0-flujo-formulario';

// Esta es la única fuente autorizada para datos de unidades, personas,
// vínculos y estado de cuenta utilizados por el módulo de reservas.
const COPROPIEDAD_DATA_SPREADSHEET_URL =
  'https://docs.google.com/spreadsheets/d/' +
  '1MjNg_qR134dB-8vdK0NEJyeXlLS848dsOpu-bylkVBQ/edit';

const COPROPIEDAD_DATA_SPREADSHEET_ID =
  '1MjNg_qR134dB-8vdK0NEJyeXlLS848dsOpu-bylkVBQ';

const COPROPIEDAD_SHEET_UNIDADES = 'Unidades';
const COPROPIEDAD_SHEET_PERSONAS = 'Personas';
const COPROPIEDAD_SHEET_VINCULOS = 'Vinculos_Unidad';
const COPROPIEDAD_SHEET_ESTADO_CUENTA = 'Estado_Cuenta';

const RESERVATION_REQUEST_CACHE_SECONDS = 900;

// Estados válidos del sistema
const ESTADO_PENDIENTE = 'Pendiente';
const ESTADO_CONFIRMADA = 'Confirmado';
const ESTADO_RECHAZADA_REGLA = 'Rechazada por regla';
const ESTADO_RECHAZADA_CONFLICTO = 'Rechazada por conflicto';
const ESTADO_CANCELADA = 'Cancelada';

// Modalidades de uso de las canchas.
const MODALIDAD_USO_RECREATIVO = 'RECREATIVO_RESIDENTES';
const MODALIDAD_USO_ORGANIZADO = 'ORGANIZADO_CON_INVITADOS';

// Toda la configuración funcional se obtiene exclusivamente de las pestañas
// Bienes y Config. No se crean hojas adicionales de configuración y no se
// fuerzan activaciones, horarios, duraciones ni precios desde el código.
// La elegibilidad financiera y las restricciones de la unidad se conservan
// para TODAS las modalidades y se validan en validateReservationAccess_().
const RESERVAS_BIEN_HEADERS_REQUERIDOS = [
  'BienID',
  'Tipo',
  'Descripcion',
  'HoraApertura',
  'HoraCierre',
  'DuracionMin',
  'DuracionMax',
  'Activo',
  'CostoReserva',
  'DepositoGarantia',
  'RequierePago',
  'RequiereAprobacion',
  'AnticipacionMinHabiles',
  'AnticipacionMaxDias'
];

const RESERVAS_CONFIG_KEYS_REQUERIDAS = [
  'dias_anticipacion_max',
  'duracion_min_horas',
  'duracion_max_horas',
  'hora_apertura',
  'hora_cierre',
  'requiere_pago',
  'requiere_aprobacion',
  'max_reservas_activas_por_apto',
  'max_reservas_recreativas_dia_por_apto',
  'max_reservas_recreativas_semana_por_apto',
  'dias_agenda_publica',
  'cancha_recreativa_costo',
  'cancha_recreativa_requiere_pago',
  'cancha_recreativa_requiere_aprobacion',
  'cancha_recreativa_anticipacion_min_habiles',
  'cancha_recreativa_anticipacion_max_dias'
];

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

    // Disponibilidad de todos los bienes para una fecha.
    if (action === 'availability') {
      return handleAvailabilityQuery_(e);
    }

    // Agenda pública resumida de canchas para los próximos días.
    // No expone nombres, apartamentos, correos ni identificadores de reserva.
    if (action === 'agenda') {
      return handlePublicAgendaQuery_(e);
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
          modalidadUso: reservation.modalidadUso,
          requierePago: reservation.requierePago,
          requiereAprobacion: reservation.requiereAprobacion,
          confirmacionAutomatica: reservation.confirmacionAutomatica,
          precioReserva: reservation.precioReserva,
          depositoGarantia: reservation.depositoGarantia,
          rowIndex: reservation.rowIndex
        });
      }

      const requestStatus =
        getReservationRequestStatus_(requestId);

      if (
        requestStatus &&
        requestStatus.status === 'REJECTED'
      ) {
        return jsonOutput_({
          ok: true,
          exists: false,
          rejected: true,
          code: requestStatus.code || 'RESERVA_RECHAZADA',
          error: requestStatus.error ||
            'La solicitud no cumple los requisitos para reservar.'
        });
      }

      return jsonOutput_({
        ok: true,
        exists: false,
        processing: !!requestStatus,
        message: requestStatus
          ? 'La solicitud todavía está siendo procesada.'
          : 'No se encontró reserva con ese requestId.'
      });
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

    if (!isBienEnabled_(bien)) {
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

    const validacionFecha = validateAvailabilityDate_(fecha, config);
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
      politicas: getPublicReservationPolicies_(bien, fecha, config),
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
  let payload = null;

  try {
    Logger.log('=== doPost INICIO ===');

    try {
      payload = JSON.parse(
        e && e.postData
          ? e.postData.contents
          : ''
      );
    } catch (parseError) {
      return jsonOutput_({
        ok: false,
        error: 'Payload JSON inválido: ' +
          parseError.message
      });
    }

    if (payload && payload.requestId) {
      saveReservationRequestStatus_(
        payload.requestId,
        {
          status: 'PROCESSING',
          startedAt: new Date().toISOString()
        }
      );
    }

    const requiredFields = [
      'requestId',
      'bienId',
      'fecha',
      'horario',
      'torre',
      'apto',
      'nombre',
      'email',
      'asunto'
    ];

    const missingFields = requiredFields.filter(
      function (field) {
        return !payload[field];
      }
    );

    if (missingFields.length > 0) {
      const message =
        'Campos obligatorios faltantes: ' +
        missingFields.join(', ');

      saveReservationRequestStatus_(
        payload.requestId,
        {
          status: 'REJECTED',
          code: 'CAMPOS_FALTANTES',
          error: message
        }
      );

      return jsonOutput_({
        ok: false,
        error: message
      });
    }

    const lock = LockService.getScriptLock();
    if (!lock.tryLock(30000)) {
      saveReservationRequestStatus_(
        payload.requestId,
        {
          status: 'REJECTED',
          code: 'SISTEMA_OCUPADO',
          error:
            'El sistema está procesando otra reserva. Intenta nuevamente en unos segundos.'
        }
      );

      return jsonOutput_({
        ok: false,
        code: 'SISTEMA_OCUPADO',
        error:
          'El sistema está procesando otra reserva. Intenta nuevamente en unos segundos.'
      });
    }

    let result;
    try {
      const existingReservation =
        findReservationByRequestId_(
          payload.requestId
        );

      if (existingReservation) {
        saveReservationRequestStatus_(
          payload.requestId,
          {
            status: 'CREATED',
            idReserva:
              existingReservation.idReserva
          }
        );

        return jsonOutput_({
          ok: true,
          idReserva:
            existingReservation.idReserva,
          mensaje:
            'Reserva ya existe (duplicado evitado)',
          rowIndex:
            existingReservation.rowIndex
        });
      }

      ensureReservationTechnicalColumns_();
      result = createReservation_(payload);

      if (!result.ok) {
        saveReservationRequestStatus_(
          payload.requestId,
          {
            status: 'REJECTED',
            code: result.code ||
              'RESERVA_RECHAZADA',
            error: result.error ||
              'La solicitud no cumple los requisitos.'
          }
        );

        return jsonOutput_(result);
      }
    } finally {
      lock.releaseLock();
    }

    const notification =
      notifyAdminReservation_(
        ADMIN_EMAIL,
        payload,
        result
      );

    saveReservationRequestStatus_(
      payload.requestId,
      {
        status: 'CREATED',
        idReserva: result.idReserva
      }
    );

    return jsonOutput_({
      ok: true,
      idReserva: result.idReserva,
      estado: result.estado,
      observaciones: result.observaciones,
      modalidadUso: result.modalidadUso,
      requierePago: result.requierePago,
      confirmacionAutomatica: result.confirmacionAutomatica,
      rowIndex: result.rowIndex,
      unidadId: result.unidadId,
      notificacionAdmin:
        notification.status,
      mensaje: 'Reserva creada exitosamente'
    });
  } catch (error) {
    Logger.log(
      'Error en doPost: ' +
      (error && error.message
        ? error.message
        : String(error))
    );

    if (payload && payload.requestId) {
      saveReservationRequestStatus_(
        payload.requestId,
        {
          status: 'REJECTED',
          code: 'ERROR_INTERNO',
          error:
            'No fue posible procesar la reserva. ' +
            'Intenta nuevamente o contacta a la administración.'
        }
      );
    }

    return jsonOutput_({
      ok: false,
      error:
        'No fue posible procesar la reserva. ' +
        'Intenta nuevamente o contacta a la administración.'
    });
  }
}


/***************************************
 * NOTIFICACIÓN ADMINISTRATIVA
 ***************************************/

/**
 * La notificación nunca define el resultado de la reserva.
 *
 * La reserva ya está registrada cuando esta función se ejecuta.
 * Si la cuota está agotada o Gmail presenta un error, se registra
 * el estado y se retorna sin lanzar excepciones.
 */
function notifyAdminReservation_(
  adminEmail,
  payload,
  result
) {
  const status = {
    status: 'NO_ENVIADO',
    detail: '',
    attemptedAt: new Date()
  };

  try {
    const remainingQuota =
      MailApp.getRemainingDailyQuota();

    if (remainingQuota < 1) {
      status.status =
        'OMITIDO_CUOTA_AGOTADA';
      status.detail =
        'La reserva fue registrada, pero no se envió el correo porque la cuota diaria estaba agotada.';

      Logger.log(
        'Notificación omitida por cuota agotada. ' +
        'Reserva=' + result.idReserva
      );

      updateAdminNotificationAudit_(
        result.rowIndex,
        status
      );

      return status;
    }

    const bien = getBienById_(payload.bienId);
    const descripcionBien = bien
      ? bien.Descripcion
      : payload.bienId;

    const asuntoEmail =
      '[Bulevar Verde] Nueva Reserva Web - ' +
      result.idReserva;

    const cuerpo =
      'Se ha recibido una nueva solicitud de reserva desde el portal web.\n\n' +
      'ID de reserva: ' + result.idReserva + '\n' +
      'Request ID: ' + payload.requestId + '\n' +
      'Unidad: ' + result.unidadId + '\n\n' +
      'Datos declarados por el solicitante:\n' +
      'Nombre del adulto responsable: ' + result.nombreSolicitante + '\n' +
      'Identidad registrada validada: NO\n' +
      'Correo electrónico: ' +
        result.emailSolicitante + '\n\n' +
      'Detalle de la reserva:\n' +
      'Inmueble: ' + descripcionBien + '\n' +
      'Asunto: ' + payload.asunto + '\n' +
      'Fecha: ' + payload.fecha + '\n' +
      'Horario: ' + payload.horario + '\n' +
      'Modalidad: ' + getReservationModeLabel_(result.modalidadUso) + '\n' +
      'Costo de reserva: ' + result.precioReserva + '\n' +
      'Depósito de garantía: ' + result.depositoGarantia + '\n' +
      'Requiere pago: ' + (result.requierePago ? 'SI' : 'NO') + '\n' +
      'Requiere aprobación: ' + (result.requiereAprobacion ? 'SI' : 'NO') + '\n' +
      'Adulto responsable: ' +
        (payload.adultoResponsable || payload.nombre || '') + '\n\n' +
      'Elegibilidad financiera de la unidad verificada: SI\n' +
      'Estado: ' + result.estado + '\n' +
      'Observaciones: ' +
        result.observaciones + '\n\n' +
      'Acepta Reglamento: ' +
        (payload.aceptaReglamento
          ? 'SI'
          : 'NO') + '\n' +
      'Acepta Tratamiento de Datos: ' +
        (payload.aceptaTratamientoDatos
          ? 'SI'
          : 'NO') + '\n\n' +
      'Fecha de registro: ' +
        Utilities.formatDate(
          new Date(),
          Session.getScriptTimeZone(),
          'yyyy-MM-dd HH:mm'
        ) + '\n\n' +
      'Fuente de datos de copropiedad: ' +
        COPROPIEDAD_DATA_SPREADSHEET_ID;

    MailApp.sendEmail({
      to: adminEmail,
      subject: asuntoEmail,
      body: cuerpo
    });

    status.status = 'ENVIADO';
    status.detail =
      'Correo enviado. Cuota disponible antes del envío: ' +
      remainingQuota + '.';
  } catch (emailError) {
    status.status =
      'ERROR_NO_BLOQUEANTE';
    status.detail =
      emailError && emailError.message
        ? emailError.message
        : String(emailError);

    Logger.log(
      'La reserva quedó registrada, pero el correo administrativo falló. ' +
      'Reserva=' + result.idReserva +
      ' | Error=' + status.detail
    );
  }

  updateAdminNotificationAudit_(
    result.rowIndex,
    status
  );

  return status;
}

/**
 * Guarda el resultado del intento sin afectar la reserva.
 */
function updateAdminNotificationAudit_(
  rowIndex,
  notification
) {
  try {
    ensureReservationTechnicalColumns_();

    const sheet =
      getSheetByNameOrThrow_(
        SHEET_RESPUESTAS
      );
    const headers = getHeaders_(sheet);

    const values = {
      NotificacionAdmin:
        notification.status || '',
      FechaIntentoNotificacion:
        notification.attemptedAt || new Date(),
      DetalleNotificacionAdmin:
        notification.detail || ''
    };

    Object.keys(values).forEach(
      function (header) {
        const index = headers.indexOf(header);

        if (index >= 0) {
          sheet.getRange(
            rowIndex,
            index + 1
          ).setValue(values[header]);
        }
      }
    );
  } catch (auditError) {
    Logger.log(
      'No fue posible registrar el estado de la notificación. ' +
      'La reserva permanece creada. Error=' +
      (
        auditError && auditError.message
          ? auditError.message
          : String(auditError)
      )
    );
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
    sheet.getRange(rowIndex, observacionesCol).setValue(idReserva + ' - Pendiente de validación administrativa');

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
      'Estado: Pendiente de validación administrativa\n\n' +
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
  const respuestasSheet =
    getSheetByNameOrThrow_(SHEET_RESPUESTAS);
  const headers = getHeaders_(respuestasSheet);
  const rowObj = getRowObject_(
    respuestasSheet,
    rowIndex,
    headers
  );

  const config = getConfigMap_();

  const reservation = {
    rowIndex: rowIndex,
    email: safeTrim_(
      rowObj['Dirección de correo electrónico']
    ),
    bienId: safeTrim_(rowObj['Inmueble']),
    asunto: safeTrim_(rowObj['Asunto']),
    fechaReservaRaw: rowObj['FechaReserva'],
    horario: safeTrim_(rowObj['Horario']),
    torre: safeTrim_(rowObj['Torre']),
    apto: safeTrim_(rowObj['Apto']),
    nombre: safeTrim_(rowObj['Nombre']),
    modalidadUso: safeTrim_(rowObj['ModalidadUso']),
    numeroParticipantes: rowObj['NumeroParticipantes'],
    numeroInvitados: rowObj['NumeroInvitados'],
    confirmaSoloResidentes:
      normalizeYesNo_(rowObj['ConfirmaSoloResidentes']) === 'SI',
    participanMenores14:
      normalizeYesNo_(rowObj['ParticipanMenores14']) === 'SI',
    adultoResponsable: safeTrim_(rowObj['AdultoResponsable']),
    estadoActual: safeTrim_(rowObj['Estado']),
    observacionesActual:
      safeTrim_(rowObj['Observaciones'])
  };

  const validation = validateReservation_(
    reservation,
    config,
    rowIndex
  );

  updateReservationStatus_(
    rowIndex,
    validation.estado,
    validation.observaciones
  );

  if (validation.access) {
    updateReservationEligibilityAudit_(
      rowIndex,
      validation.access
    );
  }

  return {
    ok: validation.ok,
    rowIndex: rowIndex,
    estado: validation.estado,
    observaciones: validation.observaciones,
    unidadId: validation.access
      ? validation.access.unitId
      : ''
  };
}

/***************************************
 * VALIDACIÓN DE RESERVA
 ***************************************/
function validateReservation_(
  reservation,
  config,
  currentRowIndex
) {
  if (!reservation.bienId) {
    return failValidation_(
      ESTADO_RECHAZADA_REGLA,
      'El campo Inmueble es obligatorio.'
    );
  }

  if (!reservation.fechaReservaRaw) {
    return failValidation_(
      ESTADO_RECHAZADA_REGLA,
      'El campo FechaReserva es obligatorio.'
    );
  }

  if (!reservation.horario) {
    return failValidation_(
      ESTADO_RECHAZADA_REGLA,
      'El campo Horario es obligatorio.'
    );
  }

  if (!reservation.apto) {
    return failValidation_(
      ESTADO_RECHAZADA_REGLA,
      'El campo Apto es obligatorio.'
    );
  }

  if (!reservation.email) {
    return failValidation_(
      ESTADO_RECHAZADA_REGLA,
      'El correo electrónico es obligatorio.'
    );
  }

  // Se conserva la validación obligatoria de acceso, cartera,
  // sanciones y elegibilidad para cualquier modalidad.
  const access = validateReservationAccess_(
    reservation.torre,
    reservation.apto,
    reservation.email,
    reservation.nombre
  );

  if (!access.ok) {
    return {
      ok: false,
      estado: ESTADO_RECHAZADA_REGLA,
      observaciones: access.publicMessage,
      access: access
    };
  }

  const bien = getBienById_(reservation.bienId);
  if (!bien) {
    return failValidation_(
      ESTADO_RECHAZADA_REGLA,
      `No existe el bien ${reservation.bienId}.`
    );
  }

  if (!isBienEnabled_(bien)) {
    return failValidation_(
      ESTADO_RECHAZADA_REGLA,
      `El bien ${reservation.bienId} no está activo.`
    );
  }

  const modalidad = resolveReservationMode_(
    bien,
    reservation.modalidadUso
  );
  const policy = getReservationPolicy_(
    bien,
    modalidad,
    config
  );

  const fechaReserva = normalizeSheetDate_(
    reservation.fechaReservaRaw
  );
  if (!fechaReserva) {
    return failValidation_(
      ESTADO_RECHAZADA_REGLA,
      'FechaReserva inválida.'
    );
  }

  const advanceCheck = validateAdvanceDays_(
    fechaReserva,
    config,
    policy
  );
  if (!advanceCheck.ok) {
    return failValidation_(
      ESTADO_RECHAZADA_REGLA,
      advanceCheck.message
    );
  }

  const slot = parseHorario_(reservation.horario);
  if (!slot.ok) {
    return failValidation_(
      ESTADO_RECHAZADA_REGLA,
      slot.message
    );
  }

  const pastSlotCheck = validateSlotNotPast_(
    fechaReserva,
    slot
  );
  if (!pastSlotCheck.ok) {
    return failValidation_(
      ESTADO_RECHAZADA_REGLA,
      pastSlotCheck.message
    );
  }

  const durationHours =
    (slot.endMinutes - slot.startMinutes) / 60;

  const ruleCheck =
    validateReservationAgainstBienRules_(
      slot,
      durationHours,
      bien,
      config,
      policy
    );

  if (!ruleCheck.ok) {
    return failValidation_(
      ESTADO_RECHAZADA_REGLA,
      ruleCheck.message
    );
  }

  const participantCheck = validateCourtParticipants_(
    bien,
    modalidad,
    reservation
  );
  if (!participantCheck.ok) {
    return failValidation_(
      ESTADO_RECHAZADA_REGLA,
      participantCheck.message
    );
  }

  const aptoCheck =
    validateMaxActiveReservationsPerApto_(
      access.apartment,
      currentRowIndex,
      config
    );

  if (!aptoCheck.ok) {
    return failValidation_(
      ESTADO_RECHAZADA_REGLA,
      aptoCheck.message
    );
  }

  if (modalidad === MODALIDAD_USO_RECREATIVO) {
    const frequencyCheck = validateRecreationalFrequency_(
      access.apartment,
      fechaReserva,
      currentRowIndex
    );

    if (!frequencyCheck.ok) {
      return failValidation_(
        ESTADO_RECHAZADA_REGLA,
        frequencyCheck.message
      );
    }
  }

  const conflict = hasConflict_(
    reservation.bienId,
    fechaReserva,
    slot,
    currentRowIndex
  );

  if (conflict.hasConflict) {
    return failValidation_(
      ESTADO_RECHAZADA_CONFLICTO,
      'Conflicto: ya existe una reserva activa ' +
      'para ' + reservation.bienId +
      ' en el horario ' +
      reservation.horario + '.'
    );
  }

  const estado = policy.autoConfirm
    ? ESTADO_CONFIRMADA
    : ESTADO_PENDIENTE;

  return {
    ok: true,
    estado: estado,
    observaciones: policy.autoConfirm
      ? 'Reserva confirmada automáticamente. ' +
        'Elegibilidad de la unidad verificada.'
      : 'Reserva válida. Elegibilidad financiera verificada. ' +
        getPendingReservationMessage_(policy),
    modalidadUso: modalidad,
    requierePago: policy.requiresPayment,
    requiereAprobacion: policy.requiresApproval,
    confirmacionAutomatica: policy.autoConfirm,
    precioReserva: policy.price,
    depositoGarantia: policy.deposit,
    access: access
  };
}

/***************************************
 * DISPONIBILIDAD
 ***************************************/
function buildAvailabilitySlots_(bien, fecha, config) {
  const openMinutes = parseTimeToMinutes_(
    bien.HoraApertura || config.hora_apertura
  );
  const closeMinutes = parseTimeToMinutes_(
    bien.HoraCierre || config.hora_cierre
  );

  if (
    openMinutes == null ||
    closeMinutes == null ||
    closeMinutes <= openMinutes
  ) {
    throw new Error(
      `Configuración de horario inválida para ${bien.BienID}`
    );
  }

  const durationRange = getBienDurationRange_(bien, config);
  const minDuration = durationRange.minHours;
  const maxDuration = durationRange.maxHours;

  const reservations =
    getBlockingReservationsForBienAndDate_(
      bien.BienID,
      fecha
    );
  logBlockingReservations_(
    bien.BienID,
    fecha,
    reservations
  );

  const slots = [];
  for (
    let duration = minDuration;
    duration <= maxDuration;
    duration++
  ) {
    const durationMinutes = duration * 60;

    for (
      let start = openMinutes;
      start + durationMinutes <= closeMinutes;
      start += 60
    ) {
      const end = start + durationMinutes;
      const occupied = reservations.some(function (r) {
        return rangesOverlap_(
          start,
          end,
          r.startMinutes,
          r.endMinutes
        );
      });
      const past = isSlotPast_(fecha, start);

      slots.push({
        inicio: minutesToHHmm_(start),
        fin: minutesToHHmm_(end),
        label:
          minutesToHHmm_(start) +
          ' - ' +
          minutesToHHmm_(end),
        duracionHoras: duration,
        disponible: !occupied && !past,
        motivoNoDisponible: past
          ? 'Horario finalizado'
          : (occupied ? 'Horario reservado' : '')
      });
    }
  }

  return slots;
}

/***************************************
 * POLÍTICAS Y REGLAS DE RESERVA
 ***************************************/
function normalizeBienType_(value) {
  return safeTrim_(value).toUpperCase() || 'CANCHA';
}

function normalizeReservationMode_(value) {
  const mode = safeTrim_(value).toUpperCase();

  if (mode === MODALIDAD_USO_RECREATIVO) {
    return MODALIDAD_USO_RECREATIVO;
  }

  if (mode === MODALIDAD_USO_ORGANIZADO) {
    return MODALIDAD_USO_ORGANIZADO;
  }

  return '';
}

function resolveReservationMode_(bien, requestedMode) {
  if (normalizeBienType_(bien.Tipo) !== 'CANCHA') {
    return MODALIDAD_USO_ORGANIZADO;
  }

  // Las integraciones antiguas que no envían modalidad conservan
  // el flujo pagado y sujeto a aprobación.
  return normalizeReservationMode_(requestedMode) ||
    MODALIDAD_USO_ORGANIZADO;
}

function getReservationModeLabel_(mode) {
  return normalizeReservationMode_(mode) ===
    MODALIDAD_USO_RECREATIVO
    ? 'Uso recreativo de Bulevar Verde'
    : 'Uso organizado y/o con visitantes';
}

function getPendingReservationMessage_(policy) {
  if (policy.requiresPayment && policy.requiresApproval) {
    return 'Pendiente de pago y aprobación de la administración.';
  }
  if (policy.requiresPayment) {
    return 'Pendiente de confirmación de pago.';
  }
  if (policy.requiresApproval) {
    return 'Pendiente de aprobación de la administración.';
  }
  return 'Pendiente de confirmación.';
}

function getNumericBienValue_(bien, header, fallback) {
  const value = toNumber_(bien && bien[header]);
  return value == null || isNaN(value)
    ? fallback
    : value;
}

function getBooleanBienValue_(bien, header, fallback) {
  const raw = safeTrim_(bien && bien[header]);
  if (!raw) return !!fallback;
  return normalizeYesNo_(raw) === 'SI';
}

function getRequiredConfigNumber_(config, key) {
  const value = toNumber_(config && config[key]);
  if (value == null || isNaN(value)) {
    throw new Error(
      'Falta configurar la clave "' + key + '" en la pestaña Config.'
    );
  }
  return value;
}

function getRequiredConfigBoolean_(config, key) {
  const raw = safeTrim_(config && config[key]);
  if (!raw) {
    throw new Error(
      'Falta configurar la clave "' + key + '" en la pestaña Config.'
    );
  }
  return normalizeYesNo_(raw) === 'SI';
}

function getBienDurationRange_(bien, config) {
  const minHours = getNumericBienValue_(
    bien,
    'DuracionMin',
    toNumber_(config && config.duracion_min_horas)
  );
  const maxHours = getNumericBienValue_(
    bien,
    'DuracionMax',
    toNumber_(config && config.duracion_max_horas)
  );

  if (
    minHours == null ||
    maxHours == null ||
    minHours <= 0 ||
    maxHours < minHours
  ) {
    throw new Error(
      'Configuración de duración inválida para ' +
      safeTrim_(bien && bien.BienID) +
      '. Revisa DuracionMin y DuracionMax en Bienes.'
    );
  }

  return {
    minHours: minHours,
    maxHours: maxHours,
    fixed: minHours === maxHours
  };
}

function getBaseBienPolicy_(bien, config) {
  const price = getNumericBienValue_(bien, 'CostoReserva', null);
  const deposit = getNumericBienValue_(bien, 'DepositoGarantia', null);

  if (price == null || price < 0) {
    throw new Error(
      'Configura CostoReserva para ' + safeTrim_(bien.BienID) +
      ' en la pestaña Bienes.'
    );
  }

  if (deposit == null || deposit < 0) {
    throw new Error(
      'Configura DepositoGarantia para ' + safeTrim_(bien.BienID) +
      ' en la pestaña Bienes.'
    );
  }

  const requiresPayment = getBooleanBienValue_(
    bien,
    'RequierePago',
    normalizeYesNo_(config.requiere_pago) === 'SI'
  );
  const requiresApproval = getBooleanBienValue_(
    bien,
    'RequiereAprobacion',
    normalizeYesNo_(config.requiere_aprobacion) === 'SI'
  );
  const minBusinessDays = getNumericBienValue_(
    bien,
    'AnticipacionMinHabiles',
    0
  );
  const maxCalendarDays = getNumericBienValue_(
    bien,
    'AnticipacionMaxDias',
    toNumber_(config.dias_anticipacion_max)
  );
  const durationRange = getBienDurationRange_(bien, config);

  if (
    minBusinessDays == null ||
    minBusinessDays < 0 ||
    maxCalendarDays == null ||
    maxCalendarDays < minBusinessDays
  ) {
    throw new Error(
      'Configuración de anticipación inválida para ' +
      safeTrim_(bien.BienID) +
      '. Revisa AnticipacionMinHabiles y AnticipacionMaxDias en Bienes.'
    );
  }

  return {
    requiresPayment: requiresPayment,
    requiresApproval: requiresApproval,
    autoConfirm: !requiresPayment && !requiresApproval,
    price: price,
    deposit: deposit,
    minBusinessDays: minBusinessDays,
    maxCalendarDays: maxCalendarDays,
    durationMinHours: durationRange.minHours,
    durationMaxHours: durationRange.maxHours,
    durationHours: durationRange.fixed
      ? durationRange.minHours
      : null
  };
}

function getReservationPolicy_(bien, mode, config) {
  const tipo = normalizeBienType_(bien.Tipo);
  const basePolicy = getBaseBienPolicy_(bien, config);

  if (
    tipo === 'CANCHA' &&
    mode === MODALIDAD_USO_RECREATIVO
  ) {
    const requiresPayment = getRequiredConfigBoolean_(
      config,
      'cancha_recreativa_requiere_pago'
    );
    const requiresApproval = getRequiredConfigBoolean_(
      config,
      'cancha_recreativa_requiere_aprobacion'
    );

    return {
      mode: MODALIDAD_USO_RECREATIVO,
      requiresPayment: requiresPayment,
      requiresApproval: requiresApproval,
      autoConfirm: !requiresPayment && !requiresApproval,
      price: getRequiredConfigNumber_(
        config,
        'cancha_recreativa_costo'
      ),
      deposit: 0,
      minBusinessDays: getRequiredConfigNumber_(
        config,
        'cancha_recreativa_anticipacion_min_habiles'
      ),
      maxCalendarDays: getRequiredConfigNumber_(
        config,
        'cancha_recreativa_anticipacion_max_dias'
      ),
      durationMinHours: basePolicy.durationMinHours,
      durationMaxHours: basePolicy.durationMaxHours,
      durationHours: basePolicy.durationHours
    };
  }

  return Object.assign({}, basePolicy, {
    mode: MODALIDAD_USO_ORGANIZADO
  });
}

function getPublicReservationPolicies_(bien, fecha, config) {
  const tipo = normalizeBienType_(bien.Tipo);

  if (tipo !== 'CANCHA') {
    const policy = getReservationPolicy_(
      bien,
      MODALIDAD_USO_ORGANIZADO,
      config
    );
    const check = validateAdvanceDays_(
      fecha,
      config,
      policy
    );

    return {
      organizado: publicPolicyDto_(policy, check)
    };
  }

  const recreationalPolicy = getReservationPolicy_(
    bien,
    MODALIDAD_USO_RECREATIVO,
    config
  );
  const organizedPolicy = getReservationPolicy_(
    bien,
    MODALIDAD_USO_ORGANIZADO,
    config
  );

  return {
    recreativo: publicPolicyDto_(
      recreationalPolicy,
      validateAdvanceDays_(
        fecha,
        config,
        recreationalPolicy
      )
    ),
    organizado: publicPolicyDto_(
      organizedPolicy,
      validateAdvanceDays_(
        fecha,
        config,
        organizedPolicy
      )
    )
  };
}

function publicPolicyDto_(policy, dateCheck) {
  return {
    modalidadUso: policy.mode,
    etiqueta: getReservationModeLabel_(policy.mode),
    requierePago: policy.requiresPayment,
    requiereAprobacion: policy.requiresApproval,
    confirmacionAutomatica: policy.autoConfirm,
    precio: policy.price,
    depositoGarantia: policy.deposit,
    duracionHoras: policy.durationHours,
    duracionMinHoras: policy.durationMinHours,
    duracionMaxHoras: policy.durationMaxHours,
    anticipacionMinHabiles: policy.minBusinessDays,
    anticipacionMaxDias: policy.maxCalendarDays,
    disponibleFecha: !!dateCheck.ok,
    mensajeFecha: dateCheck.ok ? '' : dateCheck.message
  };
}

function getMaximumConfiguredAdvanceDays_(config) {
  let maxDays = toNumber_(config && config.dias_anticipacion_max) || 0;

  const recreationalMax = toNumber_(
    config && config.cancha_recreativa_anticipacion_max_dias
  );
  if (recreationalMax != null) {
    maxDays = Math.max(maxDays, recreationalMax);
  }

  const sheet = getSheetByNameOrThrow_(SHEET_BIENES);
  const headers = getHeaders_(sheet);
  const data = getDataObjects_(sheet, headers);

  data.filter(isBienEnabled_).forEach(function (bien) {
    const bienMax = toNumber_(bien.AnticipacionMaxDias);
    if (bienMax != null) {
      maxDays = Math.max(maxDays, bienMax);
    }
  });

  return maxDays;
}

function validateAvailabilityDate_(fechaReserva, config) {
  const today = stripTime_(new Date());
  const target = stripTime_(fechaReserva);
  const diffDays = Math.floor(
    (target.getTime() - today.getTime()) / 86400000
  );

  if (diffDays < 0) {
    return {
      ok: false,
      message: 'No se permiten reservas en fechas pasadas.'
    };
  }

  const maxDays = getMaximumConfiguredAdvanceDays_(config);
  if (maxDays > 0 && diffDays > maxDays) {
    return {
      ok: false,
      message:
        `La fecha supera el máximo configurado de ${maxDays} días de anticipación.`
    };
  }

  return { ok: true, diffDays: diffDays };
}

function validateAdvanceDays_(
  fechaReserva,
  config,
  policy
) {
  const baseCheck = validateAvailabilityDate_(
    fechaReserva,
    config
  );
  if (!baseCheck.ok) return baseCheck;

  const effectivePolicy = policy || {
    minBusinessDays: 0,
    maxCalendarDays:
      toNumber_(config.dias_anticipacion_max) || 0
  };

  if (
    effectivePolicy.maxCalendarDays != null &&
    baseCheck.diffDays > effectivePolicy.maxCalendarDays
  ) {
    return {
      ok: false,
      message:
        'Esta modalidad permite reservar máximo con ' +
        effectivePolicy.maxCalendarDays +
        ' día(s) calendario de anticipación.'
    };
  }

  const minBusinessDays =
    Number(effectivePolicy.minBusinessDays) || 0;
  if (minBusinessDays > 0) {
    const availableBusinessDays = countBusinessDaysUntil_(
      stripTime_(new Date()),
      stripTime_(fechaReserva)
    );

    if (availableBusinessDays < minBusinessDays) {
      return {
        ok: false,
        message:
          'Esta modalidad requiere mínimo ' +
          minBusinessDays +
          ' día(s) hábil(es) de anticipación.'
      };
    }
  }

  return { ok: true, diffDays: baseCheck.diffDays };
}

function countBusinessDaysUntil_(startDate, targetDate) {
  let count = 0;
  const cursor = new Date(startDate.getTime());

  while (cursor < targetDate) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count++;
  }

  return count;
}

function validateSlotNotPast_(fechaReserva, slot) {
  if (!isSlotPast_(fechaReserva, slot.startMinutes)) {
    return { ok: true };
  }

  return {
    ok: false,
    message: 'El horario seleccionado ya inició o finalizó.'
  };
}

function isSlotPast_(fechaReserva, startMinutes) {
  const today = stripTime_(new Date());
  const target = stripTime_(fechaReserva);

  if (target.getTime() !== today.getTime()) {
    return target < today;
  }

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return startMinutes <= currentMinutes;
}

function validateReservationAgainstBienRules_(
  slot,
  durationHours,
  bien,
  config,
  policy
) {
  const openMinutes = parseTimeToMinutes_(
    bien.HoraApertura || config.hora_apertura
  );
  const closeMinutes = parseTimeToMinutes_(
    bien.HoraCierre || config.hora_cierre
  );

  if (
    slot.startMinutes < openMinutes ||
    slot.endMinutes > closeMinutes
  ) {
    return {
      ok: false,
      message:
        `El horario solicitado está fuera del rango permitido para ${bien.BienID}.`
    };
  }

  const durationRange = getBienDurationRange_(bien, config);
  const tolerance = 1 / 60;

  if (
    durationHours + tolerance < durationRange.minHours ||
    durationHours - tolerance > durationRange.maxHours
  ) {
    return {
      ok: false,
      message:
        'La duración permitida para ' + safeTrim_(bien.BienID) +
        ' es entre ' + durationRange.minHours + ' y ' +
        durationRange.maxHours + ' hora(s), según la pestaña Bienes.'
    };
  }

  return { ok: true };
}

function validateCourtParticipants_(bien, mode, reservation) {
  if (normalizeBienType_(bien.Tipo) !== 'CANCHA') {
    return { ok: true };
  }

  const hasStructuredUseData =
    !!normalizeReservationMode_(reservation.modalidadUso) ||
    reservation.confirmaSoloResidentes !== undefined ||
    reservation.participanMenores14 !== undefined ||
    reservation.adultoResponsable !== undefined;

  // Compatibilidad con registros históricos que no capturaban
  // modalidad ni condiciones específicas de uso de la cancha.
  if (!hasStructuredUseData) {
    return { ok: true };
  }

  if (
    mode === MODALIDAD_USO_RECREATIVO &&
    !reservation.confirmaSoloResidentes
  ) {
    return {
      ok: false,
      message:
        'Para el uso recreativo debes confirmar que será exclusivo para residentes de Bulevar Verde.'
    };
  }

  const adultName = safeTrim_(
    reservation.adultoResponsable || reservation.nombre
  );

  if (reservation.participanMenores14 && !adultName) {
    return {
      ok: false,
      message:
        'Debes registrar el nombre completo del adulto responsable.'
    };
  }

  return { ok: true };
}

function validateMaxActiveReservationsPerApto_(
  apto,
  currentRowIndex,
  config
) {
  const maxActivas =
    toNumber_(config.max_reservas_activas_por_apto);
  if (!maxActivas) {
    return { ok: true };
  }

  const sheet = getSheetByNameOrThrow_(SHEET_RESPUESTAS);
  const headers = getHeaders_(sheet);
  const data = getDataObjects_(sheet, headers);
  const today = stripTime_(new Date());

  const activeCount = data.filter(function (row, idx) {
    const rowNumber = idx + 2;
    if (rowNumber === currentRowIndex) return false;

    const rowApto = safeTrim_(row['Apto']);
    const estado = safeTrim_(row['Estado']);
    const rowDate = normalizeSheetDate_(row['FechaReserva']);

    if (!rowDate || stripTime_(rowDate) < today) {
      return false;
    }

    return rowApto === apto &&
      isBlockingReservationState_(estado);
  }).length;

  if (activeCount >= maxActivas) {
    return {
      ok: false,
      message:
        `El apartamento ${apto} ya tiene el máximo de reservas futuras activas permitido (${maxActivas}).`
    };
  }

  return { ok: true };
}

function validateRecreationalFrequency_(
  apto,
  targetDate,
  currentRowIndex,
  config
) {
  const sheet = getSheetByNameOrThrow_(SHEET_RESPUESTAS);
  const headers = getHeaders_(sheet);
  const data = getDataObjects_(sheet, headers);
  const targetYmd = formatDateYMD_(targetDate);
  const weekStart = startOfWeekMonday_(targetDate);
  const weekEnd = new Date(weekStart.getTime());
  weekEnd.setDate(weekEnd.getDate() + 6);

  let sameDay = 0;
  let sameWeek = 0;

  data.forEach(function (row, idx) {
    const rowNumber = idx + 2;
    if (rowNumber === currentRowIndex) return;
    if (safeTrim_(row['Apto']) !== apto) return;
    if (!isBlockingReservationState_(row['Estado'])) return;

    const mode = normalizeReservationMode_(
      row['ModalidadUso']
    );
    if (mode !== MODALIDAD_USO_RECREATIVO) return;

    const rowDate = normalizeSheetDate_(row['FechaReserva']);
    if (!rowDate) return;

    const rowDay = stripTime_(rowDate);
    if (formatDateYMD_(rowDay) === targetYmd) sameDay++;
    if (rowDay >= weekStart && rowDay <= weekEnd) sameWeek++;
  });

  const maxPerDay = toNumber_(
    config && config.max_reservas_recreativas_dia_por_apto
  ) || 0;
  const maxPerWeek = toNumber_(
    config && config.max_reservas_recreativas_semana_por_apto
  ) || 0;

  if (maxPerDay > 0 && sameDay >= maxPerDay) {
    return {
      ok: false,
      message:
        'El apartamento ya tiene una reserva recreativa para ese día.'
    };
  }

  if (maxPerWeek > 0 && sameWeek >= maxPerWeek) {
    return {
      ok: false,
      message:
        'El apartamento alcanzó el máximo de ' +
        maxPerWeek +
        ' reservas recreativas durante esa semana.'
    };
  }

  return { ok: true };
}

function startOfWeekMonday_(date) {
  const result = stripTime_(date);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  return result;
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
      
      // Solo los estados activos bloquean disponibilidad.
      if (!isBlockingReservationState_(estado)) return null;
      
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

function isBlockingReservationState_(estado) {
  const normalized = safeTrim_(estado)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ');

  return [
    'PENDIENTE',
    'PAGO EN REVISION',
    'EN REVISION',
    'RESERVADA',
    'RESERVADO',
    'APROBADA',
    'APROBADO',
    'CONFIRMADA',
    'CONFIRMADO',
    'CONFIRMADA AUTOMATICA',
    'CONFIRMADO AUTOMATICAMENTE'
  ].indexOf(normalized) !== -1;
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

function isBienEnabled_(bien) {
  // La columna Activo de la pestaña Bienes es la única autoridad.
  // El código no fuerza la activación de canchas ni salones.
  return toBoolean_(bien && bien.Activo);
}

function listActiveBienes_() {
  const sheet = getSheetByNameOrThrow_(SHEET_BIENES);
  const headers = getHeaders_(sheet);
  const data = getDataObjects_(sheet, headers);
  const config = getConfigMap_();
  const today = stripTime_(new Date());

  return data
    .filter(isBienEnabled_)
    .map(function (row) {
      return {
        BienID: safeTrim_(row['BienID']),
        Descripcion: safeTrim_(row['Descripcion']),
        Tipo: normalizeBienType_(row['Tipo']),
        Activo: true,
        politicas: getPublicReservationPolicies_(
          row,
          today,
          config
        )
      };
    });
}

/***************************************
 * DISPONIBILIDAD GLOBAL (TODOS LOS BIENES)
 ***************************************/
function handleAvailabilityQuery_(e) {
  const fechaStr = getParam_(e, 'fecha');
  if (!fechaStr) {
    return jsonOutput_({
      ok: false,
      error: 'Parámetro requerido: fecha'
    });
  }

  const fecha = parseDateInput_(fechaStr);
  if (!fecha) {
    return jsonOutput_({
      ok: false,
      error: 'Fecha inválida. Usa formato YYYY-MM-DD'
    });
  }

  const config = getConfigMap_();
  const validacionFecha = validateAvailabilityDate_(
    fecha,
    config
  );
  if (!validacionFecha.ok) {
    return jsonOutput_({
      ok: false,
      error: validacionFecha.message
    });
  }

  const sheet = getSheetByNameOrThrow_(SHEET_BIENES);
  const headers = getHeaders_(sheet);
  const data = getDataObjects_(sheet, headers);

  const bienes = data
    .filter(isBienEnabled_)
    .map(function (row) {
      const bienId = safeTrim_(row['BienID']);
      const tipo = normalizeBienType_(row['Tipo']);
      const descripcion = safeTrim_(row['Descripcion']);
      const politicas = getPublicReservationPolicies_(
        row,
        fecha,
        config
      );

      if (tipo === 'SALON') {
        const reservations =
          getBlockingReservationsForBienAndDate_(
            bienId,
            fecha
          );
        logBlockingReservations_(
          bienId,
          fecha,
          reservations
        );
        const openMin = parseTimeToMinutes_(
          row['HoraApertura'] || config.hora_apertura
        );
        const closeMin = parseTimeToMinutes_(
          row['HoraCierre'] || config.hora_cierre
        );

        let horarioFinal;
        if (
          openMin !== null &&
          closeMin !== null &&
          closeMin > openMin
        ) {
          horarioFinal =
            minutesToHHmm_(openMin) +
            '-' +
            minutesToHHmm_(closeMin);
        } else {
          Logger.log(
            'ADVERTENCIA: ' + bienId +
            ' no tiene horarios válidos, usando fallback 08:00-14:00'
          );
          horarioFinal = '08:00-14:00';
        }

        return {
          BienID: bienId,
          Descripcion: descripcion,
          Tipo: tipo,
          disponible:
            reservations.length === 0 &&
            politicas.organizado.disponibleFecha,
          horario: horarioFinal,
          reservadoPor:
            reservations.length > 0 ? 'Reservado' : null,
          politicas: politicas
        };
      }

      return {
        BienID: bienId,
        Descripcion: descripcion,
        Tipo: tipo,
        slots: buildAvailabilitySlots_(row, fecha, config),
        politicas: politicas
      };
    });

  return jsonOutput_({
    ok: true,
    fecha: formatDateYMD_(fecha),
    requiereAprobacion:
      normalizeYesNo_(config.requiere_aprobacion) === 'SI',
    bienes: bienes
  });
}

function handlePublicAgendaQuery_(e) {
  const desdeStr = getParam_(e, 'desde');
  const config = getConfigMap_();
  const configuredDays = Math.max(
    1,
    Math.min(
      toNumber_(config.dias_agenda_publica) || 1,
      31
    )
  );
  const requestedDays = Number(
    getParam_(e, 'dias') || configuredDays
  );
  const days = Math.max(
    1,
    Math.min(requestedDays, configuredDays, 31)
  );
  const startDate = desdeStr
    ? parseDateInput_(desdeStr)
    : stripTime_(new Date());

  if (!startDate) {
    return jsonOutput_({
      ok: false,
      error: 'Fecha inicial inválida.'
    });
  }

  const dateCheck = validateAvailabilityDate_(
    startDate,
    config
  );
  if (!dateCheck.ok) {
    return jsonOutput_({
      ok: false,
      error: dateCheck.message
    });
  }

  const cache = CacheService.getScriptCache();
  const cacheKey =
    'agenda-canchas-' +
    formatDateYMD_(startDate) +
    '-' + days;
  const cached = cache.get(cacheKey);
  if (cached) {
    return jsonOutput_(JSON.parse(cached));
  }

  const bienesSheet = getSheetByNameOrThrow_(SHEET_BIENES);
  const headers = getHeaders_(bienesSheet);
  const canchas = getDataObjects_(bienesSheet, headers)
    .filter(function (row) {
      return isBienEnabled_(row) &&
        normalizeBienType_(row.Tipo) === 'CANCHA';
    });

  const resultDays = [];
  for (let offset = 0; offset < days; offset++) {
    const date = new Date(startDate.getTime());
    date.setDate(date.getDate() + offset);

    const courtSummary = canchas.map(function (court) {
      const slots = buildAvailabilitySlots_(
        court,
        date,
        config
      );
      const available = slots.filter(function (slot) {
        return slot.disponible;
      }).length;

      return {
        BienID: safeTrim_(court.BienID),
        Descripcion: safeTrim_(court.Descripcion),
        disponibles: available,
        ocupados: slots.length - available,
        total: slots.length
      };
    });

    resultDays.push({
      fecha: formatDateYMD_(date),
      canchas: courtSummary
    });
  }

  const response = {
    ok: true,
    desde: formatDateYMD_(startDate),
    cantidadDias: days,
    dias: resultDays
  };
  cache.put(cacheKey, JSON.stringify(response), 120);

  return jsonOutput_(response);
}

function getConfigMap_() {
  const sheet = getSheetByNameOrThrow_(SHEET_CONFIG);
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) return getDefaultReservationConfig_();

  const result = {};
  for (let i = 1; i < values.length; i++) {
    const key = normalizeReservationConfigKey_(values[i][0]);
    const value = values[i][1];
    if (key) result[key] = value;
  }

  const defaults = getDefaultReservationConfig_();
  Object.keys(defaults).forEach(function (key) {
    if (
      result[key] === undefined ||
      result[key] === null ||
      result[key] === ''
    ) {
      result[key] = defaults[key];
    }
  });

  return result;
}

function normalizeReservationConfigKey_(value) {
  const raw = safeTrim_(value).toLowerCase();
  if (!raw) return '';

  // Corrige filas existentes como "dias_anticipacion_max 30".
  // Las claves oficiales usan guiones bajos y no contienen espacios.
  return raw.split(/\s+/)[0];
}

function getDefaultReservationConfig_() {
  // Valores generales de compatibilidad. Las reglas de costos y la modalidad
  // recreativa se exigen expresamente en la pestaña Config y no se completan
  // silenciosamente desde el código.
  return {
    dias_anticipacion_max: 30,
    duracion_min_horas: 1,
    duracion_max_horas: 8,
    hora_apertura: '08:00',
    hora_cierre: '22:00',
    requiere_pago: 'SI',
    requiere_aprobacion: 'SI',
    max_reservas_activas_por_apto: 1,
    max_reservas_recreativas_dia_por_apto: 1,
    max_reservas_recreativas_semana_por_apto: 3,
    dias_agenda_publica: 7
  };
}

/***************************************
 * DATOS OFICIALES DE COPROPIEDAD
 ***************************************/

/**
 * Guarda la URL autorizada como propiedad del proyecto.
 * La validación también exige que corresponda al ID oficial.
 */
function reservasConfigurarConexionDatosCopropiedad() {
  PropertiesService
    .getScriptProperties()
    .setProperty(
      'RESERVAS_COPROPIEDAD_DATA_URL',
      COPROPIEDAD_DATA_SPREADSHEET_URL
    );

  return reservasDiagnosticarConexionDatosCopropiedad();
}

/**
 * Prepara columnas, configura la conexión y ejecuta un diagnóstico.
 */
function reservasPrepararIntegracionCopropiedad() {
  ensureReservationTechnicalColumns_();
  return reservasConfigurarConexionDatosCopropiedad();
}

/**
 * Diagnóstico seguro: no retorna nombres, correos, documentos ni saldos.
 */
function reservasDiagnosticarConexionDatosCopropiedad() {
  const ss = getCopropiedadDataSpreadsheet_();

  const requiredSheets = [
    COPROPIEDAD_SHEET_UNIDADES,
    COPROPIEDAD_SHEET_ESTADO_CUENTA
  ];

  const sheetStatus = requiredSheets.map(
    function (name) {
      const sheet = ss.getSheetByName(name);
      return {
        hoja: name,
        existe: !!sheet,
        filas: sheet
          ? Math.max(sheet.getLastRow() - 1, 0)
          : 0
      };
    }
  );

  const missing = sheetStatus.filter(
    function (item) {
      return !item.existe;
    }
  );

  if (missing.length > 0) {
    throw new Error(
      'Faltan hojas en la fuente oficial: ' +
      missing.map(function (item) {
        return item.hoja;
      }).join(', ')
    );
  }

  const accountRows = readCopropiedadObjects_(
    ss,
    COPROPIEDAD_SHEET_ESTADO_CUENTA
  );

  const counts = {};
  accountRows.forEach(function (row) {
    const unitId = safeTrim_(row.UnidadID);
    if (!unitId) return;
    counts[unitId] = (counts[unitId] || 0) + 1;
  });

  const duplicates = Object.keys(counts)
    .filter(function (unitId) {
      return counts[unitId] > 1;
    })
    .map(function (unitId) {
      return {
        unidadId: unitId,
        registros: counts[unitId]
      };
    });

  return {
    ok: missing.length === 0 &&
      duplicates.length === 0,
    versionReservas: RESERVAS_VERSION,
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    urlAutorizada:
      COPROPIEDAD_DATA_SPREADSHEET_URL,
    hojas: sheetStatus,
    registrosEstadoCuenta:
      accountRows.length,
    duplicadosEstadoCuenta: duplicates,
    unRegistroPorApartamento:
      duplicates.length === 0
  };
}

/**
 * Consulta administrativa desde el editor.
 * No se publica como endpoint GET.
 */
function reservasConsultarElegibilidadUnidad(
  torre,
  apartamento
) {
  const unitId = normalizeReservationUnitId_(
    torre,
    apartamento
  );

  if (!unitId) {
    throw new Error(
      'Torre o apartamento inválidos.'
    );
  }

  const ss = getCopropiedadDataSpreadsheet_();
  const rows = readCopropiedadObjects_(
    ss,
    COPROPIEDAD_SHEET_ESTADO_CUENTA
  ).filter(function (row) {
    return safeTrim_(row.UnidadID) === unitId;
  });

  if (rows.length !== 1) {
    return {
      ok: false,
      unidadId: unitId,
      registrosEncontrados: rows.length,
      elegibleReservas:
        'PENDIENTE_VALIDACION',
      mensaje: rows.length === 0
        ? 'No existe Estado_Cuenta para la unidad.'
        : 'Hay registros duplicados en Estado_Cuenta.'
    };
  }

  return {
    ok: true,
    unidadId: unitId,
    elegibleReservas:
      normalizeYesNo_(rows[0].ElegibleReservas),
    estadoCuenta:
      safeTrim_(rows[0].EstadoCuenta),
    fechaCorte:
      rows[0].FechaCorte || '',
    motivoRestriccion:
      safeTrim_(rows[0].MotivoRestriccion)
  };
}

/**
 * Validación obligatoria para cualquier reserva:
 * - Unidad existente.
 * - Correo con formato válido como canal de contacto.
 * - Exactamente un registro de Estado_Cuenta.
 * - ElegibleReservas = SI.
 *
 * Temporalmente no se valida que el correo esté registrado.
 */
function validateReservationAccess_(
  torre,
  apartamento,
  email,
  nombre
) {
  const tower = normalizeTorre_(torre);
  const apartment =
    normalizeReservationApartment_(apartamento);
  const unitId = normalizeReservationUnitId_(
    tower,
    apartment
  );
  const normalizedEmail = normalizeEmail_(email);
  const declaredName = safeTrim_(nombre);

  if (!unitId) {
    return reservationAccessFailure_(
      'UNIDAD_INVALIDA',
      'La torre o el apartamento no son válidos.',
      'No fue posible construir UnidadID.'
    );
  }

  // El correo continúa siendo obligatorio como canal de contacto,
  // pero temporalmente no se compara con Personas ni Vinculos_Unidad.
  if (!normalizedEmail) {
    return reservationAccessFailure_(
      'EMAIL_INVALIDO',
      'Ingresa un correo electrónico válido.',
      'Correo vacío o con formato inválido.',
      unitId
    );
  }

  if (!declaredName) {
    return reservationAccessFailure_(
      'NOMBRE_INVALIDO',
      'Ingresa el nombre completo del adulto responsable.',
      'Nombre vacío.',
      unitId
    );
  }

  let ss;
  try {
    ss = getCopropiedadDataSpreadsheet_();
  } catch (error) {
    return reservationAccessFailure_(
      'FUENTE_DATOS_NO_DISPONIBLE',
      'No fue posible validar los requisitos de la reserva. ' +
      'Intenta nuevamente más tarde.',
      error.message || String(error),
      unitId
    );
  }

  const unitRows = readCopropiedadObjects_(
    ss,
    COPROPIEDAD_SHEET_UNIDADES
  ).filter(function (row) {
    return (
      safeTrim_(row.UnidadID) === unitId &&
      safeTrim_(row.EstadoUnidad)
        .toUpperCase() !== 'BIEN_SIN_IDENTIFICAR'
    );
  });

  if (unitRows.length !== 1) {
    return reservationAccessFailure_(
      unitRows.length === 0
        ? 'UNIDAD_NO_REGISTRADA'
        : 'UNIDAD_DUPLICADA',
      'La unidad no pudo ser validada. ' +
      'Consulta con la administración.',
      'Registros de unidad encontrados: ' +
        unitRows.length,
      unitId
    );
  }

  const accountRows = readCopropiedadObjects_(
    ss,
    COPROPIEDAD_SHEET_ESTADO_CUENTA
  ).filter(function (row) {
    return safeTrim_(row.UnidadID) === unitId;
  });

  if (accountRows.length !== 1) {
    return reservationAccessFailure_(
      accountRows.length === 0
        ? 'ESTADO_CUENTA_NO_DISPONIBLE'
        : 'ESTADO_CUENTA_DUPLICADO',
      'No fue posible verificar la elegibilidad de la unidad. ' +
      'Consulta con la administración.',
      'Registros de Estado_Cuenta encontrados: ' +
        accountRows.length,
      unitId
    );
  }

  const account = accountRows[0];
  const eligibility = normalizeYesNo_(
    account.ElegibleReservas
  );

  if (eligibility !== 'SI') {
    const cutoffText =
      formatReservationCutoffDate_(
        account.FechaCorte
      );

    const publicMessage = eligibility === 'NO'
      ? [
          'El apartamento no está habilitado para realizar reservas.',
          '',
          'En el último corte de cartera' +
            (cutoffText
              ? ' del ' + cutoffText
              : '') +
            ', presentó un saldo vencido superior al límite permitido para reservar.',
          '',
          'Para recuperar la habilitación, debes ponerte al día y esperar a que el pago se refleje en un nuevo corte de cartera.',
          '',
          'Para más información, comunícate con la administración.'
        ].join('\n')
      : [
          'La elegibilidad del apartamento está pendiente de validación.',
          '',
          'No fue posible confirmar el estado de cartera necesario para realizar la reserva.',
          '',
          'Para más información, comunícate con la administración.'
        ].join('\n');

    return reservationAccessFailure_(
      eligibility === 'NO'
        ? 'UNIDAD_NO_ELEGIBLE'
        : 'ELEGIBILIDAD_PENDIENTE',
      publicMessage,
      [
        'ElegibleReservas=' + eligibility,
        'EstadoCuenta=' +
          safeTrim_(account.EstadoCuenta),
        'FechaCorte=' +
          safeTrim_(account.FechaCorte),
        'Motivo=' +
          safeTrim_(account.MotivoRestriccion)
      ].join(' | '),
      unitId
    );
  }

  return {
    ok: true,
    code: 'ELIGIBLE',
    unitId: unitId,
    tower: tower,
    apartment: apartment,

    // Datos declarados. No representan una validación de identidad.
    person: {
      personId: '',
      name: declaredName,
      email: normalizedEmail,
      primaryEmail: '',
      role: 'NO_VALIDADO',
      registeredEmailValidated: false
    },

    account: {
      eligible: 'SI',
      state: safeTrim_(account.EstadoCuenta),
      checkedAt: new Date(),
      sourceDate: account.FechaCorte || '',
      sourceSpreadsheetId:
        COPROPIEDAD_DATA_SPREADSHEET_ID
    }
  };
}

function formatReservationCutoffDate_(value) {
  if (!value) return '';

  let date = null;

  if (
    Object.prototype.toString.call(value) ===
    '[object Date]' &&
    !isNaN(value.getTime())
  ) {
    date = value;
  } else {
    const text = safeTrim_(value);

    if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
      const parts = text.slice(0, 10).split('-');
      date = new Date(
        Number(parts[0]),
        Number(parts[1]) - 1,
        Number(parts[2])
      );
    } else {
      const parsed = new Date(text);

      if (!isNaN(parsed.getTime())) {
        date = parsed;
      }
    }
  }

  if (!date || isNaN(date.getTime())) {
    return safeTrim_(value);
  }

  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    'dd/MM/yyyy'
  );
}

function reservationAccessFailure_(
  code,
  publicMessage,
  internalMessage,
  unitId
) {
  return {
    ok: false,
    code: code,
    publicMessage: publicMessage,
    internalMessage: internalMessage,
    unitId: unitId || ''
  };
}

function getCopropiedadDataSpreadsheet_() {
  const configuredUrl =
    PropertiesService
      .getScriptProperties()
      .getProperty(
        'RESERVAS_COPROPIEDAD_DATA_URL'
      ) ||
    COPROPIEDAD_DATA_SPREADSHEET_URL;

  const spreadsheetId =
    extractSpreadsheetId_(configuredUrl);

  if (
    spreadsheetId !==
    COPROPIEDAD_DATA_SPREADSHEET_ID
  ) {
    throw new Error(
      'La conexión de datos no apunta a la hoja ' +
      'oficial de la copropiedad.'
    );
  }

  return SpreadsheetApp.openById(spreadsheetId);
}

function extractSpreadsheetId_(value) {
  const text = safeTrim_(value);
  const match = text.match(
    /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/
  );

  if (match) return match[1];

  return /^[a-zA-Z0-9-_]{20,}$/.test(text)
    ? text
    : '';
}

function readCopropiedadObjects_(
  spreadsheet,
  sheetName
) {
  const sheet = spreadsheet.getSheetByName(
    sheetName
  );

  if (!sheet) {
    throw new Error(
      'No existe la hoja oficial: ' + sheetName
    );
  }

  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (lastRow < 1 || lastColumn < 1) {
    return [];
  }

  const values = sheet.getRange(
    1,
    1,
    lastRow,
    lastColumn
  ).getValues();

  const headers = values[0].map(function (header) {
    return safeTrim_(header);
  });

  return values.slice(1).map(function (row) {
    return rowToObject_(headers, row);
  });
}

function normalizeReservationApartment_(value) {
  const text = safeTrim_(value);

  if (!/^\d{3,4}$/.test(text)) {
    return '';
  }

  return text.padStart(4, '0');
}

function normalizeReservationUnitId_(
  torre,
  apartamento
) {
  const tower = normalizeTorre_(torre);
  const apartment =
    normalizeReservationApartment_(apartamento);

  if (!tower || !apartment) return '';

  return apartment + '-' + tower;
}

function normalizeEmail_(value) {
  const email = safeTrim_(value).toLowerCase();

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? email
    : '';
}

function reservationPersonEmails_(person) {
  const values = [
    person.CorreoPrincipal,
    person.CorreosAlternos
  ];

  const result = [];

  values.forEach(function (value) {
    safeTrim_(value)
      .split(/[;,|\n]+/)
      .map(normalizeEmail_)
      .filter(Boolean)
      .forEach(function (email) {
        if (result.indexOf(email) === -1) {
          result.push(email);
        }
      });
  });

  return result;
}

function reservationRolePriority_(role) {
  const normalized = safeTrim_(role).toUpperCase();

  if (
    normalized.indexOf('PROPIET') !== -1 ||
    normalized.indexOf('COMPRADOR') !== -1
  ) {
    return 3;
  }

  if (
    normalized.indexOf('ARREND') !== -1 ||
    normalized.indexOf('RESIDENT') !== -1
  ) {
    return 2;
  }

  return 1;
}

/**
 * Registra en la fila de la reserva la fuente y el resultado de la
 * validación. No duplica saldos ni información financiera.
 */
function updateReservationEligibilityAudit_(
  rowIndex,
  access
) {
  if (!access || !access.ok) return;

  ensureReservationTechnicalColumns_();

  const sheet =
    getSheetByNameOrThrow_(SHEET_RESPUESTAS);
  const headers = getHeaders_(sheet);

  const values = {
    UnidadID: access.unitId,
    PersonaID: access.person.personId,
    RolSolicitante: access.person.role,
    ElegibleReservasAlCrear: 'SI',
    FechaValidacionElegibilidad:
      access.account.checkedAt || new Date(),
    FuenteDatosCopropiedad:
      COPROPIEDAD_DATA_SPREADSHEET_ID,
    CorreoRegistradoValidado: 'NO',
    VersionReservas: RESERVAS_VERSION
  };

  Object.keys(values).forEach(function (header) {
    const index = headers.indexOf(header);

    if (index >= 0) {
      sheet.getRange(
        rowIndex,
        index + 1
      ).setValue(values[header]);
    }
  });
}

/***************************************
 * ESTADO TEMPORAL DE SOLICITUD WEB
 ***************************************/

function saveReservationRequestStatus_(
  requestId,
  status
) {
  if (!requestId) return;

  try {
    CacheService
      .getScriptCache()
      .put(
        reservationRequestCacheKey_(requestId),
        JSON.stringify(status || {}),
        RESERVATION_REQUEST_CACHE_SECONDS
      );
  } catch (error) {
    Logger.log(
      'No fue posible guardar estado temporal: ' +
      error.message
    );
  }
}

function getReservationRequestStatus_(requestId) {
  if (!requestId) return null;

  try {
    const text = CacheService
      .getScriptCache()
      .get(
        reservationRequestCacheKey_(requestId)
      );

    return text ? JSON.parse(text) : null;
  } catch (error) {
    return null;
  }
}

function reservationRequestCacheKey_(requestId) {
  return (
    'RESERVA_REQ_' +
    safeTrim_(requestId)
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 180)
  );
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

    // El calendario operativo solo muestra reservas activas.
    if (!isBlockingReservationState_(estado)) return;

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
 * Agrega columnas técnicas al final de la hoja
 */
function createReservation_(payload) {
  const sheet =
    getSheetByNameOrThrow_(SHEET_RESPUESTAS);
  const headers = getHeaders_(sheet);
  const config = getConfigMap_();

  const bien = getBienById_(payload.bienId);
  if (!bien) {
    return {
      ok: false,
      code: 'BIEN_NO_EXISTE',
      error: `No existe el bien ${payload.bienId}`
    };
  }

  if (!isBienEnabled_(bien)) {
    return {
      ok: false,
      code: 'BIEN_INACTIVO',
      error: `El bien ${payload.bienId} no está activo`
    };
  }

  const modalidad = resolveReservationMode_(
    bien,
    payload.modalidadUso
  );
  const policy = getReservationPolicy_(
    bien,
    modalidad,
    config
  );

  const fechaReserva = parseDateInput_(payload.fecha);
  if (!fechaReserva) {
    return {
      ok: false,
      code: 'FECHA_INVALIDA',
      error: 'Fecha inválida. Usa formato YYYY-MM-DD'
    };
  }

  const advanceCheck = validateAdvanceDays_(
    fechaReserva,
    config,
    policy
  );
  if (!advanceCheck.ok) {
    return {
      ok: false,
      code: 'ANTICIPACION_INVALIDA',
      error: advanceCheck.message
    };
  }

  const torre = normalizeTorre_(payload.torre);
  const apto = normalizeReservationApartment_(payload.apto);

  if (!torre || !apto) {
    return {
      ok: false,
      code: 'UNIDAD_INVALIDA',
      error: 'La torre o el apartamento no son válidos.'
    };
  }

  // Obligatoria para salones, canchas gratuitas y canchas pagadas.
  // No se elimina ni flexibiliza ninguna restricción de la unidad.
  const access = validateReservationAccess_(
    torre,
    apto,
    payload.email,
    payload.nombre
  );

  if (!access.ok) {
    Logger.log(
      'Reserva rechazada por acceso/elegibilidad. ' +
      'Código=' + access.code +
      ' Unidad=' + (access.unitId || '') +
      ' Detalle=' + (access.internalMessage || '')
    );

    return {
      ok: false,
      code: access.code,
      error: access.publicMessage
    };
  }

  const slotParsed = parseHorario_(payload.horario);
  if (!slotParsed.ok) {
    return {
      ok: false,
      code: 'HORARIO_INVALIDO',
      error: slotParsed.message
    };
  }

  const pastSlotCheck = validateSlotNotPast_(
    fechaReserva,
    slotParsed
  );
  if (!pastSlotCheck.ok) {
    return {
      ok: false,
      code: 'HORARIO_FINALIZADO',
      error: pastSlotCheck.message
    };
  }

  const durationHours =
    (slotParsed.endMinutes - slotParsed.startMinutes) / 60;

  const ruleCheck =
    validateReservationAgainstBienRules_(
      slotParsed,
      durationHours,
      bien,
      config,
      policy
    );

  if (!ruleCheck.ok) {
    return {
      ok: false,
      code: 'REGLA_BIEN',
      error: ruleCheck.message
    };
  }

  const participantCheck = validateCourtParticipants_(
    bien,
    modalidad,
    payload
  );
  if (!participantCheck.ok) {
    return {
      ok: false,
      code: 'PARTICIPANTES_INVALIDOS',
      error: participantCheck.message
    };
  }

  const aptoCheck = validateMaxActiveReservationsPerApto_(
    access.apartment,
    null,
    config
  );

  if (!aptoCheck.ok) {
    return {
      ok: false,
      code: 'MAXIMO_RESERVAS_ACTIVAS',
      error: aptoCheck.message
    };
  }

  if (modalidad === MODALIDAD_USO_RECREATIVO) {
    const frequencyCheck = validateRecreationalFrequency_(
      access.apartment,
      fechaReserva,
      null,
      config
    );
    if (!frequencyCheck.ok) {
      return {
        ok: false,
        code: 'FRECUENCIA_RECREATIVA',
        error: frequencyCheck.message
      };
    }
  }

  const conflict = hasConflict_(
    payload.bienId,
    fechaReserva,
    slotParsed,
    null
  );

  if (conflict.hasConflict) {
    return {
      ok: false,
      code: 'CONFLICTO_HORARIO',
      error:
        `Ya existe una reserva en ese horario para ${bien.Descripcion}.`,
      estado: ESTADO_RECHAZADA_CONFLICTO
    };
  }

  const idReserva = generateReservationId_();
  const ahora = new Date();
  const estadoFinal = policy.autoConfirm
    ? ESTADO_CONFIRMADA
    : ESTADO_PENDIENTE;
  const observacionesFinal = policy.autoConfirm
    ? idReserva +
      ' - Reserva confirmada automáticamente. ' +
      'Elegibilidad verificada.'
    : idReserva +
      ' - Elegibilidad verificada. ' +
      getPendingReservationMessage_(policy);

  const newRowData = [];
  newRowData.push(ahora);
  newRowData.push(access.person.email);
  newRowData.push(bien.Descripcion);
  newRowData.push(safeTrim_(payload.asunto));
  newRowData.push(fechaReserva);
  newRowData.push(payload.horario);
  newRowData.push(access.tower);
  newRowData.push(access.apartment);
  newRowData.push(access.person.name);
  newRowData.push(estadoFinal);
  newRowData.push(observacionesFinal);

  const technicalValues = {
    IdReserva: idReserva,
    RequestId: safeTrim_(payload.requestId),
    OrigenReserva: ORIGEN_WEB_POST,
    FechaRegistroSistema: ahora,
    AceptaReglamento:
      payload.aceptaReglamento ? 'SI' : 'NO',
    AceptaTratamientoDatos:
      payload.aceptaTratamientoDatos ? 'SI' : 'NO',
    UnidadID: access.unitId,
    PersonaID: access.person.personId,
    RolSolicitante: access.person.role,
    ElegibleReservasAlCrear: 'SI',
    FechaValidacionElegibilidad: access.account.checkedAt,
    FuenteDatosCopropiedad: COPROPIEDAD_DATA_SPREADSHEET_ID,
    CorreoRegistradoValidado: 'NO',
    VersionReservas: RESERVAS_VERSION,
    ModalidadUso: modalidad,
    RequierePago: policy.requiresPayment ? 'SI' : 'NO',
    RequiereAprobacion: policy.requiresApproval ? 'SI' : 'NO',
    ConfirmacionAutomatica: policy.autoConfirm ? 'SI' : 'NO',
    PrecioReserva: policy.price,
    DepositoGarantia: policy.deposit,
    NumeroParticipantes: payload.numeroParticipantes == null
      ? ''
      : (Number(payload.numeroParticipantes) || ''),
    NumeroInvitados: payload.numeroInvitados == null
      ? ''
      : (Number(payload.numeroInvitados) || 0),
    ConfirmaSoloResidentes:
      payload.confirmaSoloResidentes ? 'SI' : 'NO',
    ParticipanMenores14:
      payload.participanMenores14 ? 'SI' : 'NO',
    AdultoResponsable:
      safeTrim_(payload.adultoResponsable || payload.nombre)
  };

  Object.keys(technicalValues).forEach(function (header) {
    const index = headers.indexOf(header);
    if (index >= 0) newRowData[index] = technicalValues[header];
  });

  const newRowIndex = sheet.getLastRow() + 1;
  const numCols = Math.max(11, headers.length);

  while (newRowData.length < numCols) newRowData.push('');

  sheet.getRange(
    newRowIndex,
    1,
    1,
    numCols
  ).setValues([newRowData.slice(0, numCols)]);

  Logger.log(
    'Reserva creada: ' + idReserva +
    ' | Unidad=' + access.unitId +
    ' | Modalidad=' + modalidad +
    ' | Estado=' + estadoFinal +
    ' | Elegible=SI'
  );

  return {
    ok: true,
    idReserva: idReserva,
    estado: estadoFinal,
    observaciones: observacionesFinal,
    modalidadUso: modalidad,
    requierePago: policy.requiresPayment,
    requiereAprobacion: policy.requiresApproval,
    confirmacionAutomatica: policy.autoConfirm,
    precioReserva: policy.price,
    depositoGarantia: policy.deposit,
    rowIndex: newRowIndex,
    unidadId: access.unitId,
    nombreSolicitante: access.person.name,
    emailSolicitante: access.person.email,
    rolSolicitante: access.person.role,
    correoRegistradoValidado: false
  };
}

/***************************************
 * VALIDACIÓN DE CONFIGURACIÓN
 * Fuentes exclusivas: Bienes y Config.
 * No crea hojas, columnas ni valores automáticamente.
 ***************************************/
function reservasValidarConfiguracion() {
  const errores = [];
  const advertencias = [];

  const bienesSheet = getSheetByNameOrThrow_(SHEET_BIENES);
  const bienesHeaders = getHeaders_(bienesSheet);
  const missingBienHeaders = RESERVAS_BIEN_HEADERS_REQUERIDOS.filter(
    function (header) {
      return bienesHeaders.indexOf(header) === -1;
    }
  );

  if (missingBienHeaders.length > 0) {
    errores.push(
      'Bienes: faltan columnas: ' + missingBienHeaders.join(', ')
    );
  }

  const bienes = getDataObjects_(bienesSheet, bienesHeaders);
  const ids = {};
  let activeCourts = 0;

  bienes.forEach(function (bien, index) {
    const rowNumber = index + 2;
    const id = safeTrim_(bien.BienID);
    const type = normalizeBienType_(bien.Tipo);
    const prefix = 'Bienes fila ' + rowNumber +
      (id ? ' [' + id + ']' : '');

    if (!id) {
      errores.push(prefix + ': BienID es obligatorio.');
    } else if (ids[id]) {
      errores.push(prefix + ': BienID duplicado.');
    } else {
      ids[id] = true;
    }

    if (['SALON', 'CANCHA'].indexOf(type) === -1) {
      errores.push(prefix + ': Tipo debe ser SALON o CANCHA.');
    }

    const openMinutes = parseTimeToMinutes_(bien.HoraApertura);
    const closeMinutes = parseTimeToMinutes_(bien.HoraCierre);
    if (
      openMinutes == null ||
      closeMinutes == null ||
      closeMinutes <= openMinutes
    ) {
      errores.push(
        prefix + ': HoraApertura/HoraCierre no forman un rango válido.'
      );
    }

    const minDuration = toNumber_(bien.DuracionMin);
    const maxDuration = toNumber_(bien.DuracionMax);
    if (
      minDuration == null ||
      maxDuration == null ||
      minDuration <= 0 ||
      maxDuration < minDuration
    ) {
      errores.push(
        prefix + ': DuracionMin/DuracionMax son inválidas.'
      );
    }

    if (!isExplicitBooleanValue_(bien.Activo)) {
      errores.push(prefix + ': Activo debe ser TRUE/FALSE o SI/NO.');
    }

    const cost = toNumber_(bien.CostoReserva);
    const deposit = toNumber_(bien.DepositoGarantia);
    if (cost == null || cost < 0) {
      errores.push(prefix + ': CostoReserva debe ser 0 o un valor positivo.');
    }
    if (deposit == null || deposit < 0) {
      errores.push(prefix + ': DepositoGarantia debe ser 0 o un valor positivo.');
    }

    if (!isExplicitBooleanValue_(bien.RequierePago)) {
      errores.push(prefix + ': RequierePago debe ser TRUE/FALSE o SI/NO.');
    }
    if (!isExplicitBooleanValue_(bien.RequiereAprobacion)) {
      errores.push(
        prefix + ': RequiereAprobacion debe ser TRUE/FALSE o SI/NO.'
      );
    }

    const minAdvance = toNumber_(bien.AnticipacionMinHabiles);
    const maxAdvance = toNumber_(bien.AnticipacionMaxDias);
    if (
      minAdvance == null ||
      maxAdvance == null ||
      minAdvance < 0 ||
      maxAdvance < minAdvance
    ) {
      errores.push(
        prefix + ': AnticipacionMinHabiles/AnticipacionMaxDias son inválidas.'
      );
    }

    if (type === 'CANCHA' && isBienEnabled_(bien)) {
      activeCourts++;
    }
  });

  if (activeCourts === 0) {
    advertencias.push(
      'No hay canchas activas. Activa las necesarias desde la columna Activo de Bienes.'
    );
  }

  const configSheet = getSheetByNameOrThrow_(SHEET_CONFIG);
  const configValues = configSheet.getDataRange().getValues();
  const config = {};
  const configRows = {};

  for (let i = 1; i < configValues.length; i++) {
    const key = normalizeReservationConfigKey_(configValues[i][0]);
    if (!key) continue;

    if (configRows[key]) {
      errores.push(
        'Config: clave duplicada "' + key + '" en filas ' +
        configRows[key] + ' y ' + (i + 1) + '.'
      );
      continue;
    }

    configRows[key] = i + 1;
    config[key] = configValues[i][1];
  }

  RESERVAS_CONFIG_KEYS_REQUERIDAS.forEach(function (key) {
    if (
      config[key] === undefined ||
      config[key] === null ||
      safeTrim_(config[key]) === ''
    ) {
      errores.push('Config: falta la clave "' + key + '".');
    }
  });

  [
    'requiere_pago',
    'requiere_aprobacion',
    'cancha_recreativa_requiere_pago',
    'cancha_recreativa_requiere_aprobacion'
  ].forEach(function (key) {
    if (
      config[key] !== undefined &&
      !isExplicitBooleanValue_(config[key])
    ) {
      errores.push(
        'Config: "' + key + '" debe usar SI/NO o TRUE/FALSE.'
      );
    }
  });

  [
    'dias_anticipacion_max',
    'duracion_min_horas',
    'duracion_max_horas',
    'max_reservas_activas_por_apto',
    'max_reservas_recreativas_dia_por_apto',
    'max_reservas_recreativas_semana_por_apto',
    'dias_agenda_publica',
    'cancha_recreativa_costo',
    'cancha_recreativa_anticipacion_min_habiles',
    'cancha_recreativa_anticipacion_max_dias'
  ].forEach(function (key) {
    if (config[key] === undefined) return;
    const value = toNumber_(config[key]);
    if (value == null || value < 0) {
      errores.push(
        'Config: "' + key + '" debe ser un número igual o mayor que 0.'
      );
    }
  });

  const defaultMinDuration = toNumber_(config.duracion_min_horas);
  const defaultMaxDuration = toNumber_(config.duracion_max_horas);
  if (
    defaultMinDuration != null &&
    defaultMaxDuration != null &&
    (
      defaultMinDuration <= 0 ||
      defaultMaxDuration < defaultMinDuration
    )
  ) {
    errores.push(
      'Config: duracion_min_horas/duracion_max_horas no forman un rango válido.'
    );
  }

  const configOpen = parseTimeToMinutes_(config.hora_apertura);
  const configClose = parseTimeToMinutes_(config.hora_cierre);
  if (
    configOpen == null ||
    configClose == null ||
    configClose <= configOpen
  ) {
    errores.push(
      'Config: hora_apertura/hora_cierre no forman un rango válido.'
    );
  }

  const result = {
    ok: errores.length === 0,
    hojasConfiguracion: [SHEET_BIENES, SHEET_CONFIG],
    bienesRevisados: bienes.length,
    canchasActivas: activeCourts,
    errores: errores,
    advertencias: advertencias,
    elegibilidadUnidadSeConserva: true
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function isExplicitBooleanValue_(value) {
  if (typeof value === 'boolean') return true;
  const normalized = safeTrim_(value).toUpperCase();
  return [
    'TRUE', 'FALSE',
    'SI', 'SÍ', 'NO',
    'YES', '1', '0'
  ].indexOf(normalized) !== -1;
}

// Compatibilidad con la función indicada en despliegues anteriores.
// Ya no modifica Bienes ni crea columnas: solamente valida las dos hojas.
function reservasAplicarPoliticaCanchas() {
  return reservasValidarConfiguracion();
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
      const colModalidad = headers.indexOf('ModalidadUso');
      const colRequierePago = headers.indexOf('RequierePago');
      const colRequiereAprobacion =
        headers.indexOf('RequiereAprobacion');
      const colConfirmacionAutomatica =
        headers.indexOf('ConfirmacionAutomatica');
      const colPrecioReserva = headers.indexOf('PrecioReserva');
      const colDepositoGarantia =
        headers.indexOf('DepositoGarantia');

      let idReserva = 'UNKNOWN';
      let estado = 'UNKNOWN';
      let modalidadUso = '';
      let requierePago = false;
      let requiereAprobacion = false;
      let confirmacionAutomatica = false;
      let precioReserva = 0;
      let depositoGarantia = 0;
      
      if (colIdReserva >= 0) {
        const idReservaValue = sheet.getRange(rowIndex, colIdReserva + 1).getValue();
        idReserva = safeTrim_(idReservaValue);
      }
      
      if (colEstado >= 0) {
        const estadoValue = sheet.getRange(rowIndex, colEstado + 1).getValue();
        estado = safeTrim_(estadoValue);
      }

      if (colModalidad >= 0) {
        modalidadUso = safeTrim_(
          sheet.getRange(rowIndex, colModalidad + 1).getValue()
        );
      }

      if (colRequierePago >= 0) {
        requierePago = normalizeYesNo_(
          sheet.getRange(rowIndex, colRequierePago + 1).getValue()
        ) === 'SI';
      }

      if (colRequiereAprobacion >= 0) {
        requiereAprobacion = normalizeYesNo_(
          sheet.getRange(
            rowIndex,
            colRequiereAprobacion + 1
          ).getValue()
        ) === 'SI';
      }

      if (colConfirmacionAutomatica >= 0) {
        confirmacionAutomatica = normalizeYesNo_(
          sheet.getRange(
            rowIndex,
            colConfirmacionAutomatica + 1
          ).getValue()
        ) === 'SI';
      }

      if (colPrecioReserva >= 0) {
        precioReserva = toNumber_(
          sheet.getRange(rowIndex, colPrecioReserva + 1).getValue()
        ) || 0;
      }

      if (colDepositoGarantia >= 0) {
        depositoGarantia = toNumber_(
          sheet.getRange(rowIndex, colDepositoGarantia + 1).getValue()
        ) || 0;
      }

      return {
        idReserva: idReserva,
        estado: estado,
        modalidadUso: modalidadUso,
        requierePago: requierePago,
        requiereAprobacion: requiereAprobacion,
        confirmacionAutomatica: confirmacionAutomatica,
        precioReserva: precioReserva,
        depositoGarantia: depositoGarantia,
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
    'AceptaTratamientoDatos',
    'UnidadID',
    'PersonaID',
    'RolSolicitante',
    'ElegibleReservasAlCrear',
    'FechaValidacionElegibilidad',
    'FuenteDatosCopropiedad',
    'CorreoRegistradoValidado',
    'NotificacionAdmin',
    'FechaIntentoNotificacion',
    'DetalleNotificacionAdmin',
    'VersionReservas',
    'ModalidadUso',
    'RequierePago',
    'RequiereAprobacion',
    'ConfirmacionAutomatica',
    'PrecioReserva',
    'DepositoGarantia',
    'NumeroParticipantes',
    'NumeroInvitados',
    'ConfirmaSoloResidentes',
    'ParticipanMenores14',
    'AdultoResponsable'
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