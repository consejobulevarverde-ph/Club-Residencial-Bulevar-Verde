/***************************************
 * SISTEMA DE GESTIÓN DE SANCIONES - CONVIVENCIA
 * Club Residencial Bulevar Verde
 *
 * DESCRIPCIÓN:
 * Módulo para administración de llamados de atención y sanciones de convivencia.
 * Garantiza debido proceso permitiendo descargos de residentes.
 *
 * FLUJO:
 * 1. Administración carga caso (apto, motivo, descripción, evidencias)
 * 2. Residente consulta y aporta descargos + evidencias
 * 3. Administración resuelve y comunica
 *
 * ═══════════════════════════════════════════════════════════
 ***************************************/

/***************************************
 * ORGANIZACIÓN DEL ARCHIVO
 *
 * 01. Web App y consultas públicas
 * 02. Lectura y modelo de datos
 * 03. Gestión de casos (admin)
 * 04. Gestión de descargos (residente)
 * 05. Notificaciones y estado
 * 06. Helpers generales
 *
 ***************************************/

const SHEET_ID_CONVIVENCIA = '1GeJZ4Rd4-ddzE6Vi8kpq9iB2_oxuLW87UiAnbZQ6Iow';
const SHEET_PLANILLA_CONVIVENCIA = 'PLANILLA_CONVIVENCIA';
const SHEET_CONFIG_SANCIONES = 'config_sanciones';
const SHEET_BITACORA_DESCARGOS_CONVIVENCIA = 'bitacora_descargos_convivencia';
const SOPORTE_SANCIONES_CONVIVENCIA_FOLDER_NAME = 'soporte-sanciones-convivencia';

const URL_CONSULTA_CONVIVENCIA = 'https://consejobulevarverde-ph.github.io/Club-Residencial-Bulevar-Verde/sanciones-convivencia/';
const ESTADO_CASO_PENDIENTE_DESCARGOS = 'PENDIENTE_DESCARGOS';
const ESTADO_CASO_CON_DESCARGOS = 'CON_DESCARGOS';
const ESTADO_CASO_RESUELTO = 'RESUELTO';
const ESTADO_CASO_ARCHIVADO = 'ARCHIVADO';

const SEVERIDADES_CONVIVENCIA = [
  { nombre: 'Llamado de atención', cuotas: 0 },
  { nombre: 'Leve', cuotas: 0.5 },
  { nombre: 'Grave', cuotas: 1 },
  { nombre: 'Muy grave', cuotas: 1.5 },
  { nombre: 'Máxima gravedad', cuotas: 2 }
];

const EMAIL_DRY_RUN_CONVIVENCIA = false;
const CONVIVENCIA_CUOTA_RESERVA = 3;
const LOG_LEVEL_CONVIVENCIA = 'RESUMEN';

/***************************************
 * 01. WEB APP Y CONSULTAS PÚBLICAS
 ***************************************/

function doGetConvivencia(e) {
  const action = getParam_(e, 'action');
  const aptoConsultado = getParam_(e, 'apto') || '';
  const caseIdConsultado = getParam_(e, 'caseId') || '';

  try {
    Logger.log('=== CONSULTA WEB APP CONVIVENCIA ===');
    Logger.log('Action: ' + action);
    Logger.log('Apto consultado: ' + aptoConsultado);
    Logger.log('CaseId consultado: ' + caseIdConsultado);

    if (action === 'listarConfig') {
      return jsonOutput_({
        ok: true,
        categorias: obtenerCategoriasConvivencia_(),
        severidades: obtenerSeveridadesConvivencia_()
      });
    }

    if (action === 'listarCategorias') {
      return jsonOutput_({
        ok: true,
        categorias: obtenerCategoriasConvivencia_()
      });
    }

    if (action === 'consultarCasosApto') {
      return consultarCasosConvivenciaPorApto_(aptoConsultado, e);
    }

    if (action === 'consultarCasosDetalle') {
      return consultarCasoConvivenciaDetalle_(caseIdConsultado, aptoConsultado, e);
    }
    registrarConsultaConvivencia_({
      action: action,
      aptoInput: aptoConsultado,
      caseIdInput: caseIdConsultado,
      resultado: 'ERROR',
      mensaje: 'Acción no reconocida.',
      parametros: e && e.parameter ? e.parameter : {}
    });

    return jsonOutput_({ ok: false, error: 'Acción no reconocida.' });

  } catch (error) {
    Logger.log('ERROR doGetConvivencia: ' + (error.message || String(error)));

    registrarConsultaConvivencia_({
      action: action,
      aptoInput: aptoConsultado,
      caseIdInput: caseIdConsultado,
      resultado: 'ERROR',
      mensaje: error.message || String(error),
      parametros: e && e.parameter ? e.parameter : {}
    });

    return jsonOutput_({
      ok: false,
      error: error.message || String(error)
    });
  }
}

/***************************************
 * SUBIR EVIDENCIA A GOOGLE DRIVE
 ***************************************/
function doPostConvivencia(e) {
  const parameters = e && e.parameter ? e.parameter : {};
  const action = safeTrim_(parameters.action);

  try {
    Logger.log('=== POST WEB APP CONVIVENCIA ===');
    Logger.log('Action: ' + action);

    if (action === 'crearCasoConvivencia') {
      let params = {};
      if (e.postData && e.postData.contents) {
        try {
          params = JSON.parse(e.postData.contents);
        } catch (error) {
          throw new Error('El body del POST no es JSON válido.');
        }
      }
      const resultado = crearCasoConvivencia(params);
      return jsonOutput_(resultado);
    }

    if (action === 'subirEvidenciaConvivencia') {
      let payload = {};
      const rawPayload = safeTrim_(parameters.payload) ||
        (e && e.postData && e.postData.contents ? safeTrim_(e.postData.contents) : '');

      if (!rawPayload) {
        throw new Error('No se recibió el contenido de la evidencia.');
      }

      try {
        payload = JSON.parse(rawPayload);
      } catch (error) {
        throw new Error('El contenido de la evidencia no es JSON válido.');
      }

      return subirEvidenciaConvivencia_(payload);
    }

    if (action === 'guardarDescargos') {
      return guardarDescargosConvivencia_(e);
    }

    return jsonOutput_({ ok: false, error: 'Acción no reconocida.' });

  } catch (error) {
    Logger.log('ERROR doPostConvivencia: ' + (error.message || String(error)));
    return jsonOutput_({
      ok: false,
      error: error.message || String(error)
    });
  }
}

function subirEvidenciaConvivencia_(payload) {
  payload = payload || {};

  const dataUrl = String(payload.dataUrl || '');
  const match = dataUrl.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([A-Za-z0-9+/=]+)$/i);

  if (!match) {
    throw new Error('La evidencia tiene un formato inválido.');
  }

  const mimeType = match[1].toLowerCase().replace('image/jpg', 'image/jpeg');
  const bytes = Utilities.base64Decode(match[2]);

  if (!bytes.length) {
    throw new Error('La evidencia está vacía.');
  }

  if (bytes.length > 5 * 1024 * 1024) {
    throw new Error('La evidencia supera el tamaño permitido (5 MB).');
  }

  const extension = mimeType === 'image/png' ? 'png' :
                    mimeType === 'image/webp' ? 'webp' : 'jpg';
  const contexto = safeTrim_(payload.contexto).toLowerCase();
  const caseId = safeTrim_(payload.caseId).replace(/[^A-Za-z0-9_-]/g, '');
  const apto = normalizeApto_(payload.apto || '');
  const prefijo = contexto === 'descargo_residente' ? 'convivencia-descargo' : 'convivencia-caso';
  const identificador = [caseId, apto].filter(Boolean).join('-');
  const fileName = prefijo + (identificador ? '-' + identificador : '') + '-' +
                   Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss') + '-' +
                   Math.floor(Math.random() * 100000) + '.' + extension;

  try {
    const folder = obtenerCarpetaSoporteConvivencia_();
    const blob = Utilities.newBlob(bytes, mimeType, fileName);
    const file = folder.createFile(blob);

    const descripcion = contexto === 'descargo_residente'
      ? 'Evidencia aportada por residente en descargos de convivencia.' +
        (caseId ? ' Caso: ' + caseId + '.' : '') +
        (apto ? ' Apartamento: ' + apto + '.' : '')
      : 'Evidencia de caso de convivencia cargada por administración.' +
        (caseId ? ' Caso: ' + caseId + '.' : '') +
        (apto ? ' Apartamento: ' + apto + '.' : '');
    file.setDescription(descripcion);

    return jsonOutput_({
      ok: true,
      url: file.getUrl(),
      fileId: file.getId(),
      fileName: fileName,
      sizeBytes: bytes.length
    });
  } catch (error) {
    Logger.log('ERROR subirEvidenciaConvivencia_: ' + (error.message || String(error)));
    throw new Error('No fue posible guardar la evidencia en Drive: ' + (error.message || 'error desconocido'));
  }
}

function obtenerCarpetaSoporteConvivencia_() {
  try {
    if (typeof FOLDER_ID_IMAGENES_SANCIONES_ORIGEN === 'undefined' ||
        !safeTrim_(FOLDER_ID_IMAGENES_SANCIONES_ORIGEN)) {
      throw new Error('No está configurado FOLDER_ID_IMAGENES_SANCIONES_ORIGEN.');
    }

    // Reutiliza exactamente la carpeta configurada para las evidencias de
    // sanciones. No crea carpetas paralelas para convivencia o descargos.
    return DriveApp.getFolderById(FOLDER_ID_IMAGENES_SANCIONES_ORIGEN);
  } catch (error) {
    Logger.log('ERROR obtenerCarpetaSoporteConvivencia_: ' + (error.message || String(error)));
    throw new Error('No fue posible acceder a la carpeta de evidencias de sanciones en Drive: ' +
      (error.message || 'error desconocido'));
  }
}

/***************************************
 * CONSULTAR CASOS DE UN APARTAMENTO
 ***************************************/
function consultarCasosConvivenciaPorApto_(aptoInput, e) {
  const apto = safeTrim_(aptoInput);
  const aptoNorm = normalizeApto_(apto);

  if (!apto) {
    registrarConsultaConvivencia_({
      action: 'consultarCasosApto',
      aptoInput: aptoInput,
      resultado: 'ERROR',
      mensaje: 'Apartamento requerido.',
      parametros: e && e.parameter ? e.parameter : {}
    });

    return jsonOutput_({
      ok: false,
      error: 'El apartamento es obligatorio.'
    });
  }

  try {
    const contexto = leerPlanillaConvivencia_();

    if (!contexto.sheet) {
      registrarConsultaConvivencia_({
        action: 'consultarCasosApto',
        aptoInput: aptoInput,
        aptoNorm: aptoNorm,
        resultado: 'ERROR',
        mensaje: 'Hoja PLANILLA_CONVIVENCIA no encontrada.',
        parametros: e && e.parameter ? e.parameter : {}
      });

      return jsonOutput_({
        ok: false,
        error: 'No se encontró la hoja de convivencia.'
      });
    }

    const registros = construirRegistrosConvivencia_(contexto);
    const casosDelApto = registros.filter(function (reg) {
      return reg.aptoNorm === aptoNorm;
    });

    const casos = casosDelApto.map(function (reg) {
      return {
        id: reg.id,
        apto: reg.apto,
        motivo: reg.motivo,
        estado: reg.estado,
        fechaRegistro: reg.fechaRegistro,
        tieneDescargos: reg.tieneDescargos,
        sinResolver: reg.estado !== ESTADO_CASO_RESUELTO && reg.estado !== ESTADO_CASO_ARCHIVADO
      };
    });

    registrarConsultaConvivencia_({
      action: 'consultarCasosApto',
      aptoInput: aptoInput,
      aptoNorm: aptoNorm,
      resultado: 'OK',
      mensaje: 'Consulta exitosa.',
      cantidadCasos: casos.length,
      parametros: e && e.parameter ? e.parameter : {}
    });

    return jsonOutput_({
      ok: true,
      apto: apto,
      casos: casos
    });

  } catch (error) {
    registrarConsultaConvivencia_({
      action: 'consultarCasosApto',
      aptoInput: aptoInput,
      aptoNorm: aptoNorm,
      resultado: 'ERROR',
      mensaje: error.message || String(error),
      parametros: e && e.parameter ? e.parameter : {}
    });

    return jsonOutput_({
      ok: false,
      error: 'Error al consultar casos: ' + (error.message || String(error))
    });
  }
}

/***************************************
 * CONSULTAR DETALLE DE UN CASO
 ***************************************/
function consultarCasoConvivenciaDetalle_(caseId, aptoVerificacion, e) {
  const id = safeTrim_(caseId);
  const apto = safeTrim_(aptoVerificacion);
  const aptoNorm = normalizeApto_(apto);

  if (!id || !apto) {
    registrarConsultaConvivencia_({
      action: 'consultarCasosDetalle',
      caseIdInput: caseId,
      aptoInput: aptoVerificacion,
      aptoNorm: aptoNorm,
      resultado: 'ERROR',
      mensaje: 'CaseId y apartamento son obligatorios.',
      parametros: e && e.parameter ? e.parameter : {}
    });

    return jsonOutput_({
      ok: false,
      error: 'CaseId y apartamento son obligatorios.'
    });
  }

  try {
    const contexto = leerPlanillaConvivencia_();

    if (!contexto.sheet) {
      registrarConsultaConvivencia_({
        action: 'consultarCasosDetalle',
        caseIdInput: caseId,
        aptoInput: apto,
        aptoNorm: aptoNorm,
        resultado: 'ERROR',
        mensaje: 'Hoja PLANILLA_CONVIVENCIA no encontrada.',
        parametros: e && e.parameter ? e.parameter : {}
      });

      return jsonOutput_({
        ok: false,
        error: 'No se encontró la hoja de convivencia.'
      });
    }

    const registros = construirRegistrosConvivencia_(contexto);
    const caso = registros.find(function (reg) {
      return reg.id === id && reg.aptoNorm === aptoNorm;
    });

    if (!caso) {
      registrarConsultaConvivencia_({
        action: 'consultarCasosDetalle',
        caseIdInput: caseId,
        aptoInput: apto,
        aptoNorm: aptoNorm,
        resultado: 'ERROR',
        mensaje: 'Caso no encontrado o no pertenece al apartamento indicado.',
        parametros: e && e.parameter ? e.parameter : {}
      });

      return jsonOutput_({
        ok: false,
        error: 'Caso no encontrado o no pertenece al apartamento indicado.'
      });
    }

    const casoDetalle = {
      id: caso.id,
      apto: caso.apto,
      aptoNorm: caso.aptoNorm,
      motivo: caso.motivo,
      descripcion: caso.descripcion,
      razonNotificacion: caso.razonNotificacion,
      severidad: caso.severidad,
      cuotasEquivalentes: caso.cuotasEquivalentes,
      evidencias: caso.evidencias ? caso.evidencias.split(';').map(function (x) { return x.trim(); }).filter(Boolean) : [],
      estado: caso.estado,
      fechaRegistro: caso.fechaRegistro,
      notificadorAdmin: caso.notificadorAdmin,
      tieneDescargos: caso.tieneDescargos,
      sinResolver: caso.estado !== ESTADO_CASO_RESUELTO && caso.estado !== ESTADO_CASO_ARCHIVADO,
      descargosResidente: caso.descargosResidente || '',
      evidenciasDescargos: caso.evidenciasDescargos ? caso.evidenciasDescargos.split(';').map(function (x) { return x.trim(); }).filter(Boolean) : [],
      fechaDescargos: caso.fechaDescargos || '',
      resolucion: caso.resolucion || '',
      notasAdmin: caso.notasAdmin || '',
      sheetRow: caso.sheetRow
    };

    registrarConsultaConvivencia_({
      action: 'consultarCasosDetalle',
      caseIdInput: caseId,
      aptoInput: apto,
      aptoNorm: aptoNorm,
      resultado: 'OK',
      mensaje: 'Consulta detalle exitosa.',
      parametros: e && e.parameter ? e.parameter : {}
    });

    return jsonOutput_({
      ok: true,
      caso: casoDetalle
    });

  } catch (error) {
    registrarConsultaConvivencia_({
      action: 'consultarCasosDetalle',
      caseIdInput: caseId,
      aptoInput: apto,
      resultado: 'ERROR',
      mensaje: error.message || String(error),
      parametros: e && e.parameter ? e.parameter : {}
    });

    return jsonOutput_({
      ok: false,
      error: 'Error al consultar caso: ' + (error.message || String(error))
    });
  }
}

/***************************************
 * GUARDAR DESCARGOS DEL RESIDENTE
 ***************************************/
function guardarDescargosConvivencia_(e) {
  const caseId = getParam_(e, 'caseId');
  const apto = getParam_(e, 'apto');
  const descargos = getParam_(e, 'descargos');
  const evidenciasJson = getParam_(e, 'evidencias');

  const id = safeTrim_(caseId);
  const aptoNorm = normalizeApto_(apto);
  const descargosTexto = safeTrim_(descargos);
  let evidenciasArray = [];

  if (!id || !apto || !descargosTexto) {
    return jsonOutput_({
      ok: false,
      error: 'CaseId, apartamento y descargos son obligatorios.'
    });
  }

  try {
    if (evidenciasJson) {
      evidenciasArray = JSON.parse(evidenciasJson);
    }
  } catch (error) {
    return jsonOutput_({
      ok: false,
      error: 'Formato de evidencias inválido.'
    });
  }

  try {
    const ss = SpreadsheetApp.openById(SHEET_ID_CONVIVENCIA);
    const sheet = ss.getSheetByName(SHEET_PLANILLA_CONVIVENCIA);

    if (!sheet) {
      return jsonOutput_({
        ok: false,
        error: 'Hoja PLANILLA_CONVIVENCIA no encontrada.'
      });
    }

    const contexto = leerPlanillaConvivencia_();
    const registros = construirRegistrosConvivencia_(contexto);
    const caso = registros.find(function (reg) {
      return reg.id === id && reg.aptoNorm === aptoNorm;
    });

    if (!caso) {
      return jsonOutput_({
        ok: false,
        error: 'Caso no encontrado.'
      });
    }

    const IDX = contexto.IDX;
    const sheetRow = caso.sheetRow;
    const ahora = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    const evidenciasStr = evidenciasArray.join(';');

    sheet.getRange(sheetRow, IDX.descargosResidente + 1).setValue(descargosTexto);
    sheet.getRange(sheetRow, IDX.evidenciasDescargos + 1).setValue(evidenciasStr);
    sheet.getRange(sheetRow, IDX.fechaDescargos + 1).setValue(ahora);
    sheet.getRange(sheetRow, IDX.estado + 1).setValue(ESTADO_CASO_CON_DESCARGOS);

    registrarDescargoConvivencia_({
      caseId: id,
      apto: apto,
      aptoNorm: aptoNorm,
      descargos: descargosTexto,
      cantidadEvidencias: evidenciasArray.length,
      fechaDescargos: ahora
    });

    return jsonOutput_({
      ok: true,
      mensaje: 'Descargos guardados exitosamente.',
      caseId: id,
      fechaDescargos: ahora
    });

  } catch (error) {
    return jsonOutput_({
      ok: false,
      error: 'Error al guardar descargos: ' + (error.message || String(error))
    });
  }
}

/***************************************
 * 02. LECTURA Y MODELO DE DATOS
 ***************************************/

function leerPlanillaConvivencia_() {
  const ss = SpreadsheetApp.openById(SHEET_ID_CONVIVENCIA);
  const sheet = ss.getSheetByName(SHEET_PLANILLA_CONVIVENCIA);

  if (!sheet) {
    return {
      ss: ss,
      sheet: null,
      lastRow: 0,
      lastCol: 0,
      allData: [],
      rows: [],
      IDX: null
    };
  }

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const hasGrid = lastRow >= 1 && lastCol >= 1;

  const allData = hasGrid
    ? sheet.getRange(1, 1, lastRow, lastCol).getValues()
    : [];

  const rows = allData.length > 1 ? allData.slice(1) : [];
  const IDX = allData.length > 0 ? obtenerIdxPlanillaConvivencia_(allData[0]) : null;

  return {
    ss: ss,
    sheet: sheet,
    lastRow: lastRow,
    lastCol: lastCol,
    allData: allData,
    rows: rows,
    IDX: IDX
  };
}

function obtenerIdxPlanillaConvivencia_(rawHeaders) {
  const headers = rawHeaders.map(function (h) {
    return normalizeHeader_(h);
  });

  const colMap = {};
  headers.forEach(function (h, i) {
    colMap[h] = i;
  });

  return {
    id: findColIdx_(colMap, ['id', 'caseid']),
    fecha: findColIdx_(colMap, ['fecha', 'fecharegistro']),
    apto: findColIdx_(colMap, ['apto', 'apartamento', 'apt']),
    motivo: findColIdx_(colMap, ['motivo']),
    descripcion: findColIdx_(colMap, ['descripcion']),
    razonNotificacion: findColIdx_(colMap, ['razonnotificacion', 'razon']),
    severidad: findColIdx_(colMap, ['severidad']),
    cuotasEquivalentes: findColIdx_(colMap, ['cuotasequivalentes', 'cuotas']),
    evidencias: findColIdx_(colMap, ['evidencias', 'fotos']),
    notificadorAdmin: findColIdx_(colMap, ['notificadoradmin', 'notificador']),
    estado: findColIdx_(colMap, ['estado']),
    descargosResidente: findColIdx_(colMap, ['descargosresidente', 'descargos']),
    evidenciasDescargos: findColIdx_(colMap, ['evidenciasdescargos', 'evidenciadescargos']),
    fechaDescargos: findColIdx_(colMap, ['fechadescargos']),
    resolucion: findColIdx_(colMap, ['resolucion']),
    notasAdmin: findColIdx_(colMap, ['notasadmin', 'notas'])
  };
}

function construirRegistrosConvivencia_(contexto) {
  const rows = contexto.rows || [];
  const IDX = contexto.IDX;

  if (!IDX) return [];

  return rows.map(function (row, index) {
    var sheetRow = index + 2;

    return {
      sheetRow: sheetRow,
      id: IDX.id !== -1 ? safeTrim_(row[IDX.id]) : '',
      fechaRegistro: IDX.fecha !== -1 ? formatFecha_(row[IDX.fecha]) : '',
      apto: IDX.apto !== -1 ? safeTrim_(row[IDX.apto]) : '',
      aptoNorm: IDX.apto !== -1 ? normalizeApto_(row[IDX.apto]) : '',
      motivo: IDX.motivo !== -1 ? safeTrim_(row[IDX.motivo]) : '',
      descripcion: IDX.descripcion !== -1 ? safeTrim_(row[IDX.descripcion]) : '',
      razonNotificacion: IDX.razonNotificacion !== -1 ? safeTrim_(row[IDX.razonNotificacion]) : '',
      severidad: IDX.severidad !== -1 ? safeTrim_(row[IDX.severidad]) : '',
      cuotasEquivalentes: IDX.cuotasEquivalentes !== -1 ? Number(row[IDX.cuotasEquivalentes]) || 0 : 0,
      evidencias: IDX.evidencias !== -1 ? safeTrim_(row[IDX.evidencias]) : '',
      notificadorAdmin: IDX.notificadorAdmin !== -1 ? safeTrim_(row[IDX.notificadorAdmin]) : '',
      estado: IDX.estado !== -1 ? (safeTrim_(row[IDX.estado]) || ESTADO_CASO_PENDIENTE_DESCARGOS) : ESTADO_CASO_PENDIENTE_DESCARGOS,
      descargosResidente: IDX.descargosResidente !== -1 ? safeTrim_(row[IDX.descargosResidente]) : '',
      tieneDescargos: IDX.descargosResidente !== -1 ? (safeTrim_(row[IDX.descargosResidente]) ? true : false) : false,
      evidenciasDescargos: IDX.evidenciasDescargos !== -1 ? safeTrim_(row[IDX.evidenciasDescargos]) : '',
      fechaDescargos: IDX.fechaDescargos !== -1 ? safeTrim_(row[IDX.fechaDescargos]) : '',
      resolucion: IDX.resolucion !== -1 ? safeTrim_(row[IDX.resolucion]) : '',
      notasAdmin: IDX.notasAdmin !== -1 ? safeTrim_(row[IDX.notasAdmin]) : ''
    };
  }).filter(function (reg) {
    return reg.id || reg.apto;
  });
}

/***************************************
 * 03. GESTIÓN DE CASOS (ADMIN)
 ***************************************/

function crearCasoConvivencia(params) {
  const apto = safeTrim_(params.apto);
  const motivo = safeTrim_(params.motivo);
  const descripcion = safeTrim_(params.descripcion);
  const razonNotificacion = safeTrim_(params.razonNotificacion);
  const severidad = safeTrim_(params.severidad);
  const evidenciasArray = params.evidencias || [];
  const notificador = safeTrim_(params.notificador);

  if (!apto || !motivo || !descripcion || !severidad) {
    throw new Error('Apto, motivo, descripción y severidad son obligatorios.');
  }

  const severidadConfig = obtenerConfigSeveridad_(severidad);
  if (!severidadConfig) {
    throw new Error('Severidad inválida: ' + severidad);
  }

  try {
    const ss = SpreadsheetApp.openById(SHEET_ID_CONVIVENCIA);
    const sheet = getOrCreatePlanillaConvivencia_(ss);

    const caseId = generarIdCasoConvivencia_();
    const ahora = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    const evidenciasStr = evidenciasArray.join(';');

    const contexto = leerPlanillaConvivencia_();
    const IDX = contexto.IDX;

    const filaData = new Array(Math.max(IDX.notasAdmin + 1, 17)).fill('');

    if (IDX.id !== -1) filaData[IDX.id] = caseId;
    if (IDX.fecha !== -1) filaData[IDX.fecha] = ahora;
    if (IDX.apto !== -1) filaData[IDX.apto] = apto;
    if (IDX.motivo !== -1) filaData[IDX.motivo] = motivo;
    if (IDX.descripcion !== -1) filaData[IDX.descripcion] = descripcion;
    if (IDX.razonNotificacion !== -1) filaData[IDX.razonNotificacion] = razonNotificacion;
    if (IDX.severidad !== -1) filaData[IDX.severidad] = severidad;
    if (IDX.cuotasEquivalentes !== -1) filaData[IDX.cuotasEquivalentes] = severidadConfig.cuotas;
    if (IDX.evidencias !== -1) filaData[IDX.evidencias] = evidenciasStr;
    if (IDX.notificadorAdmin !== -1) filaData[IDX.notificadorAdmin] = notificador;
    if (IDX.estado !== -1) filaData[IDX.estado] = ESTADO_CASO_PENDIENTE_DESCARGOS;

    sheet.appendRow(filaData);

    Logger.log('Caso creado: ' + caseId);

    return {
      ok: true,
      caseId: caseId,
      mensaje: 'Caso creado exitosamente.',
      apto: apto,
      motivo: motivo,
      severidad: severidad,
      cuotasEquivalentes: severidadConfig.cuotas
    };

  } catch (error) {
    Logger.log('ERROR crearCasoConvivencia: ' + (error.message || String(error)));
    throw error;
  }
}

function actualizarEstadoCasoConvivencia(caseId, nuevoEstado) {
  if (!caseId || !nuevoEstado) {
    throw new Error('CaseId y estado son obligatorios.');
  }

  try {
    const contexto = leerPlanillaConvivencia_();

    if (!contexto.sheet) {
      throw new Error('Hoja PLANILLA_CONVIVENCIA no encontrada.');
    }

    const registros = construirRegistrosConvivencia_(contexto);
    const caso = registros.find(function (reg) {
      return reg.id === caseId;
    });

    if (!caso) {
      throw new Error('Caso no encontrado: ' + caseId);
    }

    const IDX = contexto.IDX;
    contexto.sheet.getRange(caso.sheetRow, IDX.estado + 1).setValue(nuevoEstado);

    return {
      ok: true,
      caseId: caseId,
      estado: nuevoEstado
    };

  } catch (error) {
    Logger.log('ERROR actualizarEstadoCasoConvivencia: ' + (error.message || String(error)));
    throw error;
  }
}

function generarIdCasoConvivencia_() {
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
  const random = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
  return 'CV' + timestamp + '_' + random;
}

function getOrCreatePlanillaConvivencia_(ss) {
  let sheet = ss.getSheetByName(SHEET_PLANILLA_CONVIVENCIA);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_PLANILLA_CONVIVENCIA);

    const headers = [
      'ID',
      'Fecha',
      'Apartamento',
      'Motivo',
      'Descripción',
      'Razón de Notificación',
      'Severidad',
      'Cuotas Equivalentes',
      'Evidencias',
      'Notificador Admin',
      'Estado',
      'Descargos Residente',
      'Evidencias Descargos',
      'Fecha Descargos',
      'Resolución',
      'Notas Admin'
    ];

    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#2c5f2d')
      .setFontColor('#ffffff');

    sheet.setFrozenRows(1);
  }

  return sheet;
}

/***************************************
 * 04. GESTIÓN DE DESCARGOS (RESIDENTE)
 ***************************************/

// Ya implementada en guardarDescargosConvivencia_()

/***************************************
 * 05. NOTIFICACIONES Y ESTADO
 ***************************************/

function registrarConsultaConvivencia_(data) {
  try {
    const parametros = Object.assign({}, data.parametros || {});

    // Reutiliza el log de consultas de sanciones. Los datos específicos
    // de convivencia que no tienen columna propia se guardan en Parametros.
    parametros.modulo = 'convivencia';

    if (data.caseIdInput && !parametros.caseId) {
      parametros.caseId = data.caseIdInput;
    }

    registrarConsultaSanciones_({
      action: data.action || '',
      aptoInput: data.aptoInput || '',
      placaInput: '',
      aptoNorm: data.aptoNorm || normalizeApto_(data.aptoInput || ''),
      placaNorm: '',
      resultado: data.resultado || '',
      mensaje: data.mensaje || '',
      cantidadSanciones: data.cantidadCasos || 0,
      placasDevueltas: '',
      parametros: parametros
    });
  } catch (error) {
    Logger.log('ERROR registrando consulta convivencia en log de sanciones: ' + error.message);
  }
}

function registrarDescargoConvivencia_(data) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID_CONVIVENCIA);
    const sheet = getOrCreateHojaBitacoraDescargosConvivencia_(ss);

    sheet.appendRow([
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'),
      data.caseId || '',
      data.apto || '',
      data.aptoNorm || '',
      data.cantidadEvidencias || 0,
      data.descargos ? data.descargos.substring(0, 200) : '',
      data.fechaDescargos || ''
    ]);
  } catch (error) {
    Logger.log('ERROR registrando descargo convivencia: ' + error.message);
  }
}

function getOrCreateHojaBitacoraDescargosConvivencia_(ss) {
  let sheet = ss.getSheetByName(SHEET_BITACORA_DESCARGOS_CONVIVENCIA);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_BITACORA_DESCARGOS_CONVIVENCIA);

    sheet.getRange(1, 1, 1, 7).setValues([[
      'FechaRegistro',
      'CaseId',
      'Apartamento',
      'ApartamentoNormalizado',
      'CantidadEvidencias',
      'Descargos',
      'FechaDescargos'
    ]]);

    sheet.getRange(1, 1, 1, 7)
      .setFontWeight('bold')
      .setBackground('#fff2cc');

    sheet.setFrozenRows(1);
  }

  return sheet;
}

/***************************************
 * 06. HELPERS GENERALES
 ***************************************/

function jsonOutput_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getParam_(e, paramName) {
  if (!e || !e.parameter) return '';
  return e.parameter[paramName] ? String(e.parameter[paramName]).trim() : '';
}

function safeTrim_(value) {
  if (!value) return '';
  return String(value).trim();
}

function normalizeApto_(value) {
  return safeTrim_(value)
    .replace(/[^\d]/g, '')
    .toUpperCase();
}

function normalizeHeader_(value) {
  return safeTrim_(value)
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^\w]/g, '');
}

function findColIdx_(colMap, searchTerms) {
  if (!colMap || !searchTerms || searchTerms.length === 0) return -1;

  for (let i = 0; i < searchTerms.length; i++) {
    const term = normalizeHeader_(searchTerms[i]);
    if (colMap[term] !== undefined) {
      return colMap[term];
    }
  }

  return -1;
}

function formatFecha_(value) {
  if (!value) return '';

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  if (typeof value === 'number') {
    try {
      return Utilities.formatDate(new Date((value - 25569) * 86400 * 1000), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    } catch (e) {
      return String(value);
    }
  }

  var texto = String(value).trim();
  var isoMatch = texto.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  var parsed = new Date(texto);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

  return texto.substring(0, 10);
}

function normalizeText_(value) {
  return safeTrim_(value)
    .toUpperCase()
    .replace(/[^\w\s]/g, '')
    .trim();
}

/***************************************
 * FUNCIONES DE CONFIGURACIÓN
 ***************************************/

function obtenerCategoriasConvivencia_() {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID_CONVIVENCIA);
    const sheet = ss.getSheetByName(SHEET_CONFIG_SANCIONES);

    if (!sheet) {
      Logger.log('Hoja config_sanciones no encontrada, usando categorías por defecto');
      return getCategoriasDefecto_();
    }

    const datos = sheet.getRange('A:B').getValues();
    const categorias = [];

    for (let i = 1; i < datos.length; i++) {
      const fila = datos[i];
      const tipo = safeTrim_(fila[0]).toLowerCase();
      const valor = safeTrim_(fila[1]);

      if (tipo === 'categoria' && valor) {
        categorias.push(valor);
      }
    }

    return categorias.length > 0 ? categorias : getCategoriasDefecto_();

  } catch (error) {
    Logger.log('ERROR obtenerCategoriasConvivencia_: ' + (error.message || String(error)));
    return getCategoriasDefecto_();
  }
}

function obtenerSeveridadesConvivencia_() {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID_CONVIVENCIA);
    const sheet = ss.getSheetByName(SHEET_CONFIG_SANCIONES);

    if (!sheet) {
      Logger.log('Hoja config_sanciones no encontrada, usando severidades por defecto');
      return SEVERIDADES_CONVIVENCIA;
    }

    const datos = sheet.getRange('A:C').getValues();
    const severidades = [];

    for (let i = 1; i < datos.length; i++) {
      const fila = datos[i];
      const tipo = safeTrim_(fila[0]).toLowerCase();
      const nombre = safeTrim_(fila[1]);
      const cuotas = Number(fila[2]) || 0;

      if (tipo === 'severidad' && nombre) {
        severidades.push({
          nombre: nombre,
          cuotas: cuotas
        });
      }
    }

    return severidades.length > 0 ? severidades : SEVERIDADES_CONVIVENCIA;

  } catch (error) {
    Logger.log('ERROR obtenerSeveridadesConvivencia_: ' + (error.message || String(error)));
    return SEVERIDADES_CONVIVENCIA;
  }
}

function obtenerConfigSeveridad_(severidadNombre) {
  const severidades = obtenerSeveridadesConvivencia_();
  const config = severidades.find(function (s) {
    return s.nombre.toLowerCase() === safeTrim_(severidadNombre).toLowerCase();
  });
  return config || null;
}

function getCategoriasDefecto_() {
  return [
    'Ruido en horario no permitido',
    'Elementos en balcón',
    'Moto estacionada en lugar no demarcado',
    'Estacionar en parqueadero privado',
    'Ropa en balcón',
    'Estacionar en movilidad reducida',
    'Ingresar a zona no permitida - terraza',
    'Trabajos en horario no permitido',
    'No limpiar o recoger desechos de mascotas',
    'Estacionar fuera de la linea',
    'Ingreso elementos sin autorización',
    'Cobro por daños en terraza',
    'Mecanica en parqueadero',
    'Mal uso de zonas comunes'
  ];
}

function getOrCreateConfigSanciones_(ss) {
  let sheet = ss.getSheetByName(SHEET_CONFIG_SANCIONES);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_CONFIG_SANCIONES, ss.getSheets().length - 1);

    const headers = ['Tipo', 'Valor/Nombre', 'Cuotas Equivalentes'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#f0f0f0');

    // Insertar categorías por defecto
    const categorias = getCategoriasDefecto_();
    for (let i = 0; i < categorias.length; i++) {
      sheet.appendRow(['categoria', categorias[i], '']);
    }

    // Insertar severidades por defecto
    const severidades = SEVERIDADES_CONVIVENCIA;
    for (let i = 0; i < severidades.length; i++) {
      sheet.appendRow(['severidad', severidades[i].nombre, severidades[i].cuotas]);
    }

    sheet.setFrozenRows(1);
  }

  return sheet;
}
