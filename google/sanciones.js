/***************************************
 * SISTEMA DE GESTIÓN DE SANCIONES - PARQUEADERO VISITANTES
 * Club Residencial Bulevar Verde
 *
 * INSTRUCCIONES DE EJECUCIÓN:
 * 1. Ejecutar la función: normalizarTodoElArchivoSanciones()
 *    - Esta función normaliza placas, corrige inconsistencias y crea/actualiza la hoja maestra
 *    - Presta atención al log y realiza las correcciones manuales necesarias
 * 2. Ejecutar las veces necesarias la normalización hasta estar conforme con los resultados
 * 3. Preparar el resumen de notificaciones de debido proceso:
 *    Ejecutar: prepararResumenNotificacionesDebidoProceso()
 * 4. Enviar notificaciones de debido proceso:
 *    Ejecutar: enviarNotificacionesDebidoProcesoDesdeResumen()
 *
 * ═══════════════════════════════════════════════════════════
 *
 ***************************************/
const SHEET_ID_SANCIONES = '1GeJZ4Rd4-ddzE6Vi8kpq9iB2_oxuLW87UiAnbZQ6Iow';
const SHEET_PLANILLA = 'PLANILLA';
const SHEET_ID_VIGILANCIA_PLACAS = '1_Lwp2jYRuYjJu_PiXGOibD5TjfPf9jQ_pBO9kio7AZY';
const SHEET_GID_VIGILANCIA_PLACAS = 1955503575;
const SHEET_ID_CORREOS_APTOS = '1MjNg_qR134dB-8vdK0NEJyeXlLS848dsOpu-bylkVBQ';
const SHEET_GID_CORREOS_APTOS = 0;
const SHEET_LOG_CONSULTAS_SANCIONES = "log_consultas_sanciones";
const SHEET_RESUMEN_ENVIO_SANCIONES = 'resumen_envio_sanciones';
const SHEET_RESUMEN_NOTIFICACIONES_DEBIDO_PROCESO = "resumen_notif";
const SHEET_BITACORA_NOTIFICACIONES_DEBIDO_PROCESO = "bitacora_notif";

const UMBRAL_MAYORIA = 0.75;
const UMBRAL_OUTLIER = 0.15;
const CONFIANZA_MAX_CONFLICTO_CONSULTA = 0.50;
const MIN_REGISTROS_PARA_CORREGIR = 5;
const MIN_CONSULTAS_OK_PARA_ALERTA_MAESTRA = 1;
const MAX_REGISTROS_PLACA_SOSPECHOSA = 2;
const MAX_DISTANCIA_PLACA_SIMILAR = 100;
const LIMITE_PLACAS_SIMILARES_DESCARTADAS = 50;
const MAX_DISTANCIA_DESCARTADA_PARA_ANALISIS = 180;
const VALOR_UNITARIO_SANCION_MOTO = 1000;
const VALOR_UNITARIO_SANCION_CARRO = 7000;

const DRY_RUN = false;
const EMAIL_DRY_RUN = false; // true = prueba, false = envía correos reales
const SANCIONES_CUOTA_RESERVA = 3; // correos que siempre se dejan sin usar de la cuota diaria
const MOSTRAR_PLACAS_SIMILARES_DESCARTADAS = true;
const URL_CONSULTA_SANCIONES = 'https://consejobulevarverde-ph.github.io/Club-Residencial-Bulevar-Verde/sanciones/';
const PLANTILLA_NOTIFICACION_DEBIDO_PROCESO = "NOTIFICACION_DEBIDO_PROCESO_PARQUEADERO_VISITANTES_V1";
const TIPO_NOTIFICACION_DEBIDO_PROCESO = "DEBIDO_PROCESO_PARQUEADERO_VISITANTES";
const ESTADO_MAESTRA_REQUIERE_VERIFICACION = "REQUIERE_VERIFICACION_CONSULTA_WEB";

const LOG_LEVEL = "RESUMEN";
// Opciones:
// "SILENCIO"  = casi nada
// "RESUMEN"   = recomendado
// "DETALLE"   = debug completo

/***************************************
 * WEB APP - ENDPOINT PRINCIPAL
 * GET ?action=consultar&apto=101&placa=ABC123
 ***************************************/
function doGet(e) {
  const action = getParam_(e, 'action');
  const aptoConsultado = getParam_(e, 'apto') || '';
  const placaConsultada = getParam_(e, 'placa') || '';

  try {
    Logger.log('=== CONSULTA WEB APP SANCIONES ===');
    Logger.log('Action: ' + action);
    Logger.log('Apto consultado: ' + aptoConsultado);
    Logger.log('Placa consultada: ' + placaConsultada);
    Logger.log('Parámetros completos: ' + JSON.stringify(e.parameter));

    if (action === 'consultar') {
      return consultarSanciones_(aptoConsultado, placaConsultada, e);
    }

    registrarConsultaSanciones_({
      action: action,
      aptoInput: aptoConsultado,
      placaInput: placaConsultada,
      aptoNorm: normalizeApto_(aptoConsultado),
      placaNorm: normalizePlaca_(placaConsultada),
      resultado: "ERROR",
      mensaje: "Acción no reconocida.",
      cantidadSanciones: 0,
      placasDevueltas: "",
      parametros: e && e.parameter ? e.parameter : {}
    });

    return jsonOutput_({ ok: false, error: 'Acción no reconocida.' });

  } catch (error) {
    Logger.log('ERROR doGet: ' + (error.message || String(error)));

    registrarConsultaSanciones_({
      action: action,
      aptoInput: aptoConsultado,
      placaInput: placaConsultada,
      aptoNorm: normalizeApto_(aptoConsultado),
      placaNorm: normalizePlaca_(placaConsultada),
      resultado: "ERROR",
      mensaje: error.message || String(error),
      cantidadSanciones: 0,
      placasDevueltas: "",
      parametros: e && e.parameter ? e.parameter : {}
    });

    return jsonOutput_({ ok: false, error: error.message || String(error) });
  }
}

/***************************************
 * CONSULTA DE SANCIONES
 *
 * Flujo de validación:
 * 1. Verificar que la placa existe en PLANILLA
 * 2. Verificar que la placa corresponde al apartamento indicado
 * 3. Retornar todos los registros del apartamento
 *
 * La columna de apartamento se detecta automáticamente buscando
 * encabezados como: apto, apartamento, apt, numero de apto.
 * Si no existe dicha columna, se usa "residente o visitante"
 * como campo de respaldo (debe contener el número del apto).
 ***************************************/
function consultarSanciones_(aptoInput, placaInput, e) {
  if (!aptoInput || !placaInput) {
    registrarConsultaSanciones_({
      action: "consultar",
      aptoInput: aptoInput,
      placaInput: placaInput,
      aptoNorm: normalizeApto_(aptoInput),
      placaNorm: normalizePlaca_(placaInput),
      resultado: "ERROR",
      mensaje: "Parámetros requeridos: apto y placa.",
      cantidadSanciones: 0,
      placasDevueltas: "",
      parametros: e && e.parameter ? e.parameter : {}
    });

    return jsonOutput_({ ok: false, error: 'Parámetros requeridos: apto y placa.' });
  }

  const apto = safeTrim_(aptoInput);
  const placa = normalizePlaca_(placaInput);

  try {
    const contextoPlanilla = leerPlanillaSanciones_({
      includeRichText: true,
      allowMissingSheet: true
    });

    const sheet = contextoPlanilla.sheet;

    if (!sheet) {
      registrarConsultaSanciones_({
        action: "consultar",
        aptoInput: aptoInput,
        placaInput: placaInput,
        aptoNorm: normalizeApto_(aptoInput),
        placaNorm: normalizePlaca_(placaInput),
        resultado: "ERROR",
        mensaje: 'No se encontró la hoja "PLANILLA".',
        cantidadSanciones: 0,
        placasDevueltas: "",
        parametros: e && e.parameter ? e.parameter : {}
      });

      return jsonOutput_({
        ok: false,
        error: 'No se encontró la hoja "PLANILLA" en el archivo de sanciones.'
      });
    }

    const lastRow = contextoPlanilla.lastRow;
    const lastCol = contextoPlanilla.lastCol;

    if (lastRow < 2 || lastCol < 1) {
      registrarConsultaSanciones_({
        action: "consultar",
        aptoInput: aptoInput,
        placaInput: placaInput,
        aptoNorm: normalizeApto_(aptoInput),
        placaNorm: normalizePlaca_(placaInput),
        resultado: "OK",
        mensaje: "Consulta sin datos. La hoja PLANILLA está vacía.",
        cantidadSanciones: 0,
        placasDevueltas: "",
        parametros: e && e.parameter ? e.parameter : {}
      });

      return jsonOutput_({ ok: true, apto: apto, sanciones: [] });
    }

    const allData = contextoPlanilla.allData;
    const richData = contextoPlanilla.richData;
    const headers = allData[0].map(function (h) {
      return normalizeHeader_(h);
    });
    var IDX = contextoPlanilla.IDX;

    Logger.log('HEADERS NORMALIZADOS: ' + JSON.stringify(headers));
    Logger.log('IDX: ' + JSON.stringify(IDX));

    if (IDX.placa === -1) {
      registrarConsultaSanciones_({
        action: "consultar",
        aptoInput: aptoInput,
        placaInput: placaInput,
        aptoNorm: normalizeApto_(aptoInput),
        placaNorm: normalizePlaca_(placaInput),
        resultado: "ERROR",
        mensaje: 'No se encontró la columna "placa" en la hoja PLANILLA.',
        cantidadSanciones: 0,
        placasDevueltas: "",
        parametros: e && e.parameter ? e.parameter : {}
      });

      return jsonOutput_({
        ok: false,
        error: 'No se encontró la columna "placa" en la hoja PLANILLA.'
      });
    }

    var rows = contextoPlanilla.rows; // excluir encabezado
    var aptoNorm = normalizeApto_(apto);
    var registrosNormalizados = construirRegistrosNormalizados_(rows, IDX, richData, allData);


    // Paso 1: buscar filas donde la placa coincide
    var placaRows = registrosNormalizados.filter(function (reg) {
      return reg.placaNorm === placa;
    });

    Logger.log('PLACA BUSCADA: ' + placa);
    Logger.log('TOTAL FILAS LEÍDAS: ' + rows.length);
    Logger.log('EXISTE PLACA: ' + (placaRows.length > 0));

    Logger.log('FILAS CON ESA PLACA: ' + placaRows.length);
    Logger.log('APTOS DE ESA PLACA: ' + JSON.stringify(placaRows.map(function (reg) {
      return reg.apto;
    })));

    Logger.log('APTO BUSCADO: ' + apto);
    Logger.log('APTO NORMALIZADO: ' + aptoNorm);

    if (placaRows.length === 0) {

      registrarConsultaSanciones_({
        action: "consultar",
        aptoInput: aptoInput,
        placaInput: placaInput,
        aptoNorm: aptoNorm,
        placaNorm: placa,
        resultado: "ERROR",
        mensaje: 'No se encontró la placa "' + placa + '" en el sistema.',
        cantidadSanciones: 0,
        placasDevueltas: "",
        parametros: e && e.parameter ? e.parameter : {}
      });

      return jsonOutput_({
        ok: false,
        error: 'No se encontró la placa "' + placa + '" en el sistema. Verifique la información ingresada.'
      });
    }

    // Paso 2: verificar que la placa corresponde al apartamento indicado
    var matchesApto = placaRows.some(function (reg) {
      return reg.aptoNorm === aptoNorm;
    });

    Logger.log('MATCHES APTO: ' + matchesApto);

    if (!matchesApto) {

      registrarConsultaSanciones_({
        action: "consultar",
        aptoInput: aptoInput,
        placaInput: placaInput,
        aptoNorm: aptoNorm,
        placaNorm: placa,
        resultado: "ERROR",
        mensaje: 'La placa "' + placa + '" no corresponde al apartamento ' + apto + '.',
        cantidadSanciones: 0,
        placasDevueltas: "",
        parametros: e && e.parameter ? e.parameter : {}
      });

      return jsonOutput_({
        ok: false,
        error: 'La placa "' + placa + '" no corresponde al apartamento ' + apto + '. Verifique la información ingresada.'
      });
    }

    // Paso 3: obtener TODOS los registros del apartamento
    // y también todos los registros de la placa consultada,
    // aunque por error estén asociados a otro apartamento.
    // Guardamos también el índice real de la fila en Google Sheets.
    var registrosFinales = registrosNormalizados.filter(function (reg) {
      return reg.aptoNorm === aptoNorm || reg.placaNorm === placa;
    });

    // Evitar duplicados por ID
    var idsVistos = {};
    registrosFinales = registrosFinales.filter(function (reg) {
      var id = reg.id || '';

      if (!id) return true;
      if (idsVistos[id]) return false;

      idsVistos[id] = true;
      return true;
    });

    var sanciones = registrosFinales.map(function (reg) {
      return {
        id: reg.id,
        fecha: reg.fecha,
        apartamento: reg.apto,
        apartamentoNorm: reg.aptoNorm,
        vigilante: reg.vigilante,
        tipoVehiculo: reg.tipoVehiculo,
        tipoVehiculoNorm: reg.tipoVehiculoNorm,
        placa: reg.placa,
        placaNorm: reg.placaNorm,
        residenteOVisitante: reg.residenteOVisitante,
        observaciones: reg.observaciones,
        foto: reg.foto,
        firma: reg.firma,
        sheetRow: reg.sheetRow
      };
    });

    sanciones.sort(function (a, b) {
      var fechaA = parseFechaParaOrdenDesc_(a.fecha);
      var fechaB = parseFechaParaOrdenDesc_(b.fecha);

      if (fechaA !== fechaB) {
        return fechaB - fechaA;
      }

      return (b.sheetRow || 0) - (a.sheetRow || 0);
    });


    const correccionesInteligentes = analizarInconsistenciasSancionesDesdeResultado_(
      sheet,
      registrosNormalizados,
      sanciones,
      IDX,
      aptoNorm,
      placa
    );

    Logger.log("Correcciones inteligentes detectadas después de obtener sanciones:");
    Logger.log(JSON.stringify(correccionesInteligentes, null, 2));


    Logger.log('TOTAL SANCIONES DEL APTO: ' + sanciones.length);
    Logger.log('SANCIONES DEL APTO:');
    Logger.log(JSON.stringify(sanciones, null, 2));


    const placasDevueltas = Object.keys(
      sanciones.reduce(function (mapa, s) {
        if (s.placaNorm) mapa[s.placaNorm] = true;
        return mapa;
      }, {})
    ).join(", ");

    registrarConsultaSanciones_({
      action: "consultar",
      aptoInput: aptoInput,
      placaInput: placaInput,
      aptoNorm: aptoNorm,
      placaNorm: placa,
      resultado: "OK",
      mensaje: "Consulta exitosa.",
      cantidadSanciones: sanciones.length,
      placasDevueltas: placasDevueltas,
      parametros: e && e.parameter ? e.parameter : {}
    });

    return jsonOutput_({ ok: true, apto: apto, sanciones: sanciones });

  } catch (error) {
    registrarConsultaSanciones_({
      action: "consultar",
      aptoInput: aptoInput,
      placaInput: placaInput,
      aptoNorm: normalizeApto_(aptoInput),
      placaNorm: normalizePlaca_(placaInput),
      resultado: "ERROR",
      mensaje: "Error al acceder a los datos: " + (error.message || String(error)),
      cantidadSanciones: 0,
      placasDevueltas: "",
      parametros: e && e.parameter ? e.parameter : {}
    });

    return jsonOutput_({
      ok: false,
      error: 'Error al acceder a los datos: ' + (error.message || String(error))
    });
  }
}

/***************************************
 * HELPERS DE BÚSQUEDA DE COLUMNAS
 ***************************************/

// Retorna el índice de la primera columna encontrada según una lista de nombres posibles
function findColIdx_(colMap, names) {
  for (var i = 0; i < names.length; i++) {
    if (colMap[names[i]] !== undefined) return colMap[names[i]];
  }
  return -1;
}

/***************************************
 * HELPERS DE FORMATO
 ***************************************/

function formatFecha_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'dd/MM/yyyy');
  }
  return safeTrim_(String(value));
}

function parseFechaParaOrdenDesc_(value) {
  var texto = safeTrim_(value);

  if (!texto) return 0;

  var partes = texto.split('/');
  if (partes.length === 3) {
    var dia = Number(partes[0]);
    var mes = Number(partes[1]) - 1;
    var anio = Number(partes[2]);

    if (!isNaN(dia) && !isNaN(mes) && !isNaN(anio)) {
      return new Date(anio, mes, dia).getTime();
    }
  }

  var timestamp = Date.parse(texto);
  return isNaN(timestamp) ? 0 : timestamp;
}

/***************************************
 * HELPERS GENERALES
 ***************************************/

function getParam_(e, key) {
  if (!e || !e.parameter) return null;
  return e.parameter[key] || null;
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function safeTrim_(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

// Normaliza texto para comparación: minúsculas y sin espacios extras
function normalizeText_(value) {
  return safeTrim_(value).toLowerCase().replace(/\s+/g, ' ');
}

// Normaliza un número de apartamento: aplica normalizeText_ y elimina ceros a la izquierda.
// "0226" → "226", "1127" → "1127", "  0430  " → "430"
function normalizeApto_(value) {
  return normalizeText_(value).replace(/^0+(\d)/, '$1');
}

function getCellUrlOrText_(richData, allData, rowIndex, colIndex) {
  var rich = richData[rowIndex][colIndex];

  if (rich) {
    var url = rich.getLinkUrl();
    if (url) return url;
  }

  return safeTrim_(allData[rowIndex][colIndex]);
}

function leerPlanillaSanciones_(options) {
  const opts = options || {};
  const includeRichText = opts.includeRichText === true;
  const allowMissingSheet = opts.allowMissingSheet === true;

  const ss = SpreadsheetApp.openById(SHEET_ID_SANCIONES);
  const sheet = ss.getSheetByName(SHEET_PLANILLA);

  if (!sheet) {
    if (allowMissingSheet) {
      return {
        ss: ss,
        sheet: null,
        lastRow: 0,
        lastCol: 0,
        allData: [],
        richData: [],
        rows: [],
        IDX: null
      };
    }

    throw new Error('No se encontró la hoja "' + SHEET_PLANILLA + '".');
  }

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const hasGrid = lastRow >= 1 && lastCol >= 1;

  const allData = hasGrid
    ? sheet.getRange(1, 1, lastRow, lastCol).getValues()
    : [];

  const richData = includeRichText && hasGrid
    ? sheet.getRange(1, 1, lastRow, lastCol).getRichTextValues()
    : [];

  const rows = allData.length > 1 ? allData.slice(1) : [];
  const IDX = allData.length > 0 ? obtenerIdxPlanilla_(allData[0]) : null;

  return {
    ss: ss,
    sheet: sheet,
    lastRow: lastRow,
    lastCol: lastCol,
    allData: allData,
    richData: richData,
    rows: rows,
    IDX: IDX
  };
}

function normalizeHeader_(value) {
  return safeTrim_(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita tildes
    .replace(/\s+/g, ' ')            // quita saltos de línea y espacios dobles
    .trim();
}

function normalizePlaca_(value) {
  return safeTrim_(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}


/***************************************
 * HELPERS ANALISIS INTELIGENTE
 ***************************************/
function contarPorCampo_(registros, campo) {
  const conteo = {};

  registros.forEach(function (reg) {
    const valor = reg[campo] || "";
    if (!valor) return;

    if (!conteo[valor]) {
      conteo[valor] = 0;
    }

    conteo[valor]++;
  });

  return conteo;
}

function obtenerMayoria_(conteo, total) {
  if (!conteo || total === 0) return null;

  let valorMayor = "";
  let cantidadMayor = 0;

  Object.keys(conteo).forEach(function (valor) {
    if (conteo[valor] > cantidadMayor) {
      valorMayor = valor;
      cantidadMayor = conteo[valor];
    }
  });

  if (!valorMayor) return null;

  return {
    valor: valorMayor,
    cantidad: cantidadMayor,
    total: total,
    porcentaje: cantidadMayor / total
  };
}

function obtenerTextoAptoPorNorm_(registros, aptoNorm) {
  const match = registros.find(function (reg) {
    return reg.aptoNorm === aptoNorm;
  });

  return match ? match.apto : aptoNorm;
}

/***************************************
 * CONSTRUIR REGISTROS NORMALIZADOS
 ***************************************/
function construirRegistrosNormalizados_(rows, IDX, richData, allData) {
  return rows.map(function (row, index) {
    var realRowIndex = index + 1;
    var sheetRow = index + 2;

    return {
      row: row,
      realRowIndex: realRowIndex,
      sheetRow: sheetRow,

      id: IDX.id !== -1 ? safeTrim_(row[IDX.id]) : '',
      fecha: IDX.fecha !== -1 ? formatFecha_(row[IDX.fecha]) : '',

      apto: IDX.apto !== -1 ? safeTrim_(row[IDX.apto]) : '',
      aptoNorm: IDX.apto !== -1 ? normalizeApto_(row[IDX.apto]) : '',

      placa: IDX.placa !== -1 ? safeTrim_(row[IDX.placa]).toUpperCase() : '',
      placaNorm: IDX.placa !== -1 ? normalizePlaca_(row[IDX.placa]) : '',

      tipoVehiculo: IDX.tipoVehiculo !== -1 ? safeTrim_(row[IDX.tipoVehiculo]) : '',
      tipoVehiculoNorm: IDX.tipoVehiculo !== -1 ? normalizarTipoVehiculo_(row[IDX.tipoVehiculo]) : '',

      vigilante: IDX.vigilante !== -1 ? safeTrim_(row[IDX.vigilante]) : '',
      residenteOVisitante: IDX.residenteVisitante !== -1 ? safeTrim_(row[IDX.residenteVisitante]) : '',
      observaciones: IDX.observaciones !== -1 ? safeTrim_(row[IDX.observaciones]) : '',

      foto: IDX.foto !== -1 ? getCellUrlOrText_(richData, allData, realRowIndex, IDX.foto) : '',
      firma: IDX.firma !== -1 ? getCellUrlOrText_(richData, allData, realRowIndex, IDX.firma) : ''
    };
  }).filter(function (reg) {
    return reg.placaNorm || reg.aptoNorm;
  });
}


/***************************************
 * ANALISIS INTELIGENTE DESDE RESULTADO
 * Se ejecuta después de obtener las sanciones finales
 ***************************************/
function analizarInconsistenciasSancionesDesdeResultado_(
  sheet,
  registrosNormalizados,
  sanciones,
  IDX,
  aptoNormConsultado,
  placaNormConsultada
) {
  Logger.log("=== INICIO ANALISIS INTELIGENTE DESDE RESULTADO ===");
  Logger.log("DRY_RUN: " + DRY_RUN);
  Logger.log("Apto normalizado consultado: " + aptoNormConsultado);
  Logger.log("Placa normalizada consultada: " + placaNormConsultada);
  Logger.log("Total histórico normalizado: " + registrosNormalizados.length);
  Logger.log("Total sanciones resultado: " + sanciones.length);

  const correcciones = [];

  /****************************************
   * CASO 1:
   * Placa consultada asociada mayoritariamente a un apto.
   ****************************************/
  const historicoPlacaConsultada = registrosNormalizados.filter(function (reg) {
    return reg.placaNorm === placaNormConsultada;
  });

  Logger.log("=== CASO 1: MAYORIA DE APTO POR PLACA CONSULTADA ===");
  Logger.log("Placa consultada: " + placaNormConsultada);
  Logger.log("Registros históricos de esa placa: " + historicoPlacaConsultada.length);

  if (historicoPlacaConsultada.length >= MIN_REGISTROS_PARA_CORREGIR) {
    const conteoAptos = contarPorCampo_(historicoPlacaConsultada, "aptoNorm");
    const mayoriaApto = obtenerMayoria_(conteoAptos, historicoPlacaConsultada.length);

    Logger.log("Distribución aptos por placa:");
    Logger.log(JSON.stringify(conteoAptos, null, 2));
    Logger.log("Mayoría detectada:");
    Logger.log(JSON.stringify(mayoriaApto, null, 2));

    if (mayoriaApto && mayoriaApto.porcentaje >= UMBRAL_MAYORIA) {
      const aptoCorrectoNorm = mayoriaApto.valor;
      const aptoCorrectoTexto = obtenerTextoAptoPorNorm_(historicoPlacaConsultada, aptoCorrectoNorm);

      historicoPlacaConsultada.forEach(function (reg) {
        if (reg.aptoNorm !== aptoCorrectoNorm) {
          Logger.log("OUTLIER POR PLACA DETECTADO");
          Logger.log("Fila: " + reg.sheetRow);
          Logger.log("Placa: " + reg.placaNorm);
          Logger.log("Apto actual: " + reg.apto);
          Logger.log("Apto sugerido: " + aptoCorrectoTexto);
          Logger.log("Confianza: " + Math.round(mayoriaApto.porcentaje * 100) + "%");

          correcciones.push({
            tipo: "APTO_POR_MAYORIA_DE_PLACA",
            sheetRow: reg.sheetRow,
            placa: reg.placaNorm,
            aptoActual: reg.apto,
            aptoSugerido: aptoCorrectoTexto,
            confianza: mayoriaApto.porcentaje,
            motivo: "La placa está asociada mayoritariamente a otro apartamento."
          });

          if (!DRY_RUN) {
            sheet.getRange(reg.sheetRow, IDX.apto + 1).setValue(aptoCorrectoTexto);
          }
        }
      });
    }
  }

  /****************************************
   * CASO 2:
   * En las sanciones resultantes aparece una placa minoritaria.
   * Se busca esa placa en todo el histórico.
   ****************************************/
  Logger.log("=== CASO 2: PLACAS MINORITARIAS DENTRO DEL RESULTADO ===");

  const sancionesDelAptoConsultado = sanciones.filter(function (s) {
    return s.apartamentoNorm === aptoNormConsultado;
  });

  Logger.log("Sanciones del apto consultado dentro del resultado: " + sancionesDelAptoConsultado.length);

  if (sancionesDelAptoConsultado.length >= MIN_REGISTROS_PARA_CORREGIR) {
    const conteoPlacasResultado = contarPorCampo_(sancionesDelAptoConsultado, "placaNorm");

    Logger.log("Distribución placas en sanciones del apto consultado:");
    Logger.log(JSON.stringify(conteoPlacasResultado, null, 2));

    Object.keys(conteoPlacasResultado).forEach(function (placaNorm) {
      const cantidad = conteoPlacasResultado[placaNorm];
      const porcentaje = cantidad / sancionesDelAptoConsultado.length;

      Logger.log("Evaluando placa en resultado:");
      Logger.log("Placa: " + placaNorm);
      Logger.log("Cantidad: " + cantidad);
      Logger.log("Porcentaje: " + Math.round(porcentaje * 100) + "%");

      if (porcentaje <= UMBRAL_OUTLIER) {
        Logger.log("Placa candidata a error por baja frecuencia: " + placaNorm);

        const historicoPlaca = registrosNormalizados.filter(function (reg) {
          return reg.placaNorm === placaNorm;
        });

        Logger.log("Histórico total de placa " + placaNorm + ": " + historicoPlaca.length);

        if (historicoPlaca.length >= MIN_REGISTROS_PARA_CORREGIR) {
          const conteoAptosHistorico = contarPorCampo_(historicoPlaca, "aptoNorm");
          const mayoriaHistorica = obtenerMayoria_(conteoAptosHistorico, historicoPlaca.length);

          Logger.log("Distribución histórica de aptos para placa candidata:");
          Logger.log(JSON.stringify(conteoAptosHistorico, null, 2));
          Logger.log("Mayoría histórica:");
          Logger.log(JSON.stringify(mayoriaHistorica, null, 2));

          if (
            mayoriaHistorica &&
            mayoriaHistorica.porcentaje >= UMBRAL_MAYORIA &&
            mayoriaHistorica.valor !== aptoNormConsultado
          ) {
            const aptoCorrectoTexto = obtenerTextoAptoPorNorm_(historicoPlaca, mayoriaHistorica.valor);

            sancionesDelAptoConsultado
              .filter(function (s) {
                return s.placaNorm === placaNorm;
              })
              .forEach(function (s) {
                Logger.log("OUTLIER POR APTO DETECTADO");
                Logger.log("Fila: " + s.sheetRow);
                Logger.log("Placa: " + s.placaNorm);
                Logger.log("Apto actual: " + s.apartamento);
                Logger.log("Apto sugerido: " + aptoCorrectoTexto);
                Logger.log("Confianza: " + Math.round(mayoriaHistorica.porcentaje * 100) + "%");

                correcciones.push({
                  tipo: "APTO_POR_MAYORIA_HISTORICA_DE_PLACA",
                  sheetRow: s.sheetRow,
                  placa: s.placaNorm,
                  aptoActual: s.apartamento,
                  aptoSugerido: aptoCorrectoTexto,
                  confianza: mayoriaHistorica.porcentaje,
                  motivo: "La placa aparece como minoritaria en este apto y mayoritaria en otro."
                });

                if (!DRY_RUN) {
                  sheet.getRange(s.sheetRow, IDX.apto + 1).setValue(aptoCorrectoTexto);
                }
              });
          }
        } else {
          Logger.log("No se corrige porque la placa no tiene suficiente histórico.");
        }
      }
    });
  }

  /****************************************
   * CASO 3:
   * Tipo de vehículo por placa consultada.
   ****************************************/
  Logger.log("=== CASO 3: TIPO VEHICULO POR PLACA ===");

  if (IDX.tipoVehiculo !== -1 && historicoPlacaConsultada.length >= MIN_REGISTROS_PARA_CORREGIR) {
    const historicoConTipo = historicoPlacaConsultada.filter(function (reg) {
      return reg.tipoVehiculoNorm;
    });

    const conteoTipos = contarPorCampo_(historicoConTipo, "tipoVehiculoNorm");
    const mayoriaTipo = obtenerMayoria_(conteoTipos, historicoConTipo.length);

    Logger.log("Distribución tipo vehículo para placa consultada:");
    Logger.log(JSON.stringify(conteoTipos, null, 2));
    Logger.log("Mayoría tipo vehículo:");
    Logger.log(JSON.stringify(mayoriaTipo, null, 2));

    if (mayoriaTipo && mayoriaTipo.porcentaje >= UMBRAL_MAYORIA) {
      historicoConTipo.forEach(function (reg) {
        if (reg.tipoVehiculoNorm !== mayoriaTipo.valor) {
          Logger.log("OUTLIER TIPO VEHICULO DETECTADO");
          Logger.log("Fila: " + reg.sheetRow);
          Logger.log("Tipo actual: " + reg.tipoVehiculo);
          Logger.log("Tipo sugerido: " + mayoriaTipo.valor);

          correcciones.push({
            tipo: "TIPO_VEHICULO_POR_MAYORIA_DE_PLACA",
            sheetRow: reg.sheetRow,
            placa: reg.placaNorm,
            tipoVehiculoActual: reg.tipoVehiculo,
            tipoVehiculoSugerido: mayoriaTipo.valor,
            confianza: mayoriaTipo.porcentaje,
            motivo: "La placa aparece mayoritariamente con otro tipo de vehículo."
          });

          if (!DRY_RUN) {
            sheet.getRange(reg.sheetRow, IDX.tipoVehiculo + 1).setValue(mayoriaTipo.valor);
          }
        }
      });
    }
  }

  Logger.log("=== RESUMEN ANALISIS INTELIGENTE ===");
  Logger.log("Total correcciones propuestas: " + correcciones.length);
  Logger.log(JSON.stringify(correcciones, null, 2));
  Logger.log("=== FIN ANALISIS INTELIGENTE DESDE RESULTADO ===");

  return correcciones;
}


/***************************************
 * NORMALIZAR TODO EL ARCHIVO SANCIONES
 * - Normaliza placas
 * - Corrige aptos por mayoría
 * - Corrige tipo vehículo por regex
 * - Crea/actualiza hoja maestra
 * - Marca inconsistencias no reparables en rojo
 ***************************************/
function normalizarTodoElArchivoSanciones() {
  Logger.log("=== INICIO NORMALIZACION GENERAL DE SANCIONES ===");
  Logger.log("DRY_RUN: " + DRY_RUN);

  const contextoPlanilla = leerPlanillaSanciones_({ includeRichText: true });
  const ss = contextoPlanilla.ss;
  const sheet = contextoPlanilla.sheet;
  const lastRow = contextoPlanilla.lastRow;
  const lastCol = contextoPlanilla.lastCol;

  if (lastRow < 2 || lastCol < 1) {
    Logger.log("No hay datos para normalizar.");
    return;
  }

  const allData = contextoPlanilla.allData;
  const richData = contextoPlanilla.richData;
  const IDX = contextoPlanilla.IDX;

  Logger.log("IDX: " + JSON.stringify(IDX));

  if (IDX.placa === -1) {
    throw new Error('No se encontró la columna "placa".');
  }

  if (IDX.apto === -1) {
    throw new Error('No se encontró la columna "apartamento/apto".');
  }

  if (IDX.tipoVehiculo === -1) {
    throw new Error('No se encontró la columna "tipo de vehiculo".');
  }

  const rows = contextoPlanilla.rows;

  // 1. Normalizar placas físicamente en la hoja.
  const resultadoPlacas = normalizarPlacasEnMemoriaYHoja_(
    sheet,
    rows,
    IDX,
    !DRY_RUN
  );

  Logger.log("Placas revisadas: " + resultadoPlacas.revisadas);
  Logger.log("Placas corregidas: " + resultadoPlacas.corregidas);

  // 2. Reconstruir registros normalizados usando los rows ya normalizados en memoria.
  const registrosNormalizados = construirRegistrosNormalizados_(
    rows,
    IDX,
    richData,
    allData
  );

  const resultadoPlacasSimilares = detectarYCorregirPlacasSimilares_(
    sheet,
    registrosNormalizados,
    IDX,
    !DRY_RUN
  );

  Logger.log("Placas similares candidatas a corrección: " + resultadoPlacasSimilares.length);

  // 3. Cargar o crear hoja maestra.
  const hojaMaestra = getOrCreateHojaMaestra_(ss);
  const mapaMaestra = leerMapaMaestra_(hojaMaestra);
  const mapaVigilancia = leerMapaVigilanciaPlacas_();

  const resultadoSyncVigilancia = sincronizarVigilanciaConMaestra_(
    hojaMaestra,
    mapaMaestra,
    mapaVigilancia,
    !DRY_RUN
  );

  Logger.log("Vigilancia agregadas a maestra: " + resultadoSyncVigilancia.nuevos.length);
  Logger.log("Vigilancia omitidas por existir: " + resultadoSyncVigilancia.omitidos.length);

  // 4. Analizar todas las placas.
  const resultadoAnalisis = analizarYCorregirTodasLasPlacas_({
    sheet: sheet,
    registros: registrosNormalizados,
    IDX: IDX,
    hojaMaestra: hojaMaestra,
    mapaMaestra: mapaMaestra,
    mapaVigilancia: mapaVigilancia,
    aplicarCorrecciones: !DRY_RUN,
    umbralAltaCerteza: UMBRAL_MAYORIA,
    minRegistrosPlaca: MIN_REGISTROS_PARA_CORREGIR
  });

  Logger.log("=== RESUMEN NORMALIZACION GENERAL ===");
  Logger.log("Correcciones apto: " + resultadoAnalisis.correccionesApto.length);
  Logger.log("Correcciones tipo vehículo: " + resultadoAnalisis.correccionesTipo.length);
  Logger.log(
    (!DRY_RUN ? "Registros maestra creados: " : "Registros maestra propuestos: ") +
    resultadoAnalisis.maestraCreados.length
  );
  Logger.log("Inconsistencias no reparadas: " + resultadoAnalisis.inconsistenciasNoReparadas.length);

  Logger.log("Correcciones apto:");
  Logger.log(JSON.stringify(resultadoAnalisis.correccionesApto.slice(0, 100), null, 2));

  Logger.log("Correcciones tipo:");
  Logger.log(JSON.stringify(resultadoAnalisis.correccionesTipo.slice(0, 100), null, 2));

  Logger.log("Inconsistencias no reparadas:");
  logResumenInconsistencias_(resultadoAnalisis.inconsistenciasNoReparadas);

  Logger.log("=== FIN NORMALIZACION GENERAL DE SANCIONES ===");
}


/***************************************
 * NORMALIZAR TODAS LAS PLACAS
 * Solo borra espacios y convierte a mayúsculas
 ***************************************/
function normalizarTodasLasPlacas_() {
  const contextoPlanilla = leerPlanillaSanciones_();
  const sheet = contextoPlanilla.sheet;
  const lastRow = contextoPlanilla.lastRow;
  const lastCol = contextoPlanilla.lastCol;

  if (lastRow < 2 || lastCol < 1) {
    Logger.log("No hay datos para normalizar.");
    return;
  }

  const IDX = contextoPlanilla.IDX;
  const placaColIndex = IDX ? IDX.placa : -1;

  if (placaColIndex === -1) {
    throw new Error('No se encontró la columna "placa".');
  }

  const placaRange = sheet.getRange(2, placaColIndex + 1, lastRow - 1, 1);
  const placaValues = placaRange.getValues();

  let totalRevisadas = 0;
  let totalCorregidas = 0;
  const cambios = [];

  const nuevasPlacas = placaValues.map(function (row, index) {
    const valorOriginal = row[0];
    const placaOriginal = safeTrim_(valorOriginal);
    const placaNormalizada = normalizarPlacaSoloEspaciosYMayusculas_(placaOriginal);

    if (placaOriginal) {
      totalRevisadas++;
    }

    if (placaOriginal !== placaNormalizada) {
      totalCorregidas++;

      cambios.push({
        fila: index + 2,
        anterior: placaOriginal,
        nuevo: placaNormalizada
      });

      return [placaNormalizada];
    }

    return [valorOriginal];
  });

  placaRange.setValues(nuevasPlacas);

  Logger.log("Total placas revisadas: " + totalRevisadas);
  Logger.log("Total placas corregidas: " + totalCorregidas);

  if (cambios.length > 0) {
    Logger.log("Cambios aplicados:");
    Logger.log(JSON.stringify(cambios.slice(0, 100), null, 2));

    if (cambios.length > 100) {
      Logger.log("Hay más cambios no mostrados en logs: " + (cambios.length - 100));
    }
  }
}


/***************************************
 * NORMALIZAR PLACA SIMPLE
 * Quita espacios y pone mayúsculas
 ***************************************/
function normalizarPlacaSoloEspaciosYMayusculas_(value) {
  return safeTrim_(value)
    .replace(/\s+/g, "")
    .toUpperCase();
}

/***************************************
 * NORMALIZA PLACAS EN UN SOLO BARRIDO
 * Solo quita espacios y pone mayúsculas
 ***************************************/
function normalizarPlacasEnMemoriaYHoja_(sheet, rows, IDX, aplicarCorrecciones) {
  let revisadas = 0;
  let corregidas = 0;
  const cambios = [];

  const placaValues = [];

  rows.forEach(function (row, index) {
    const valorOriginal = row[IDX.placa];
    const placaOriginal = safeTrim_(valorOriginal);
    const placaNormalizada = normalizarPlacaSoloEspaciosYMayusculas_(placaOriginal);

    if (placaOriginal) {
      revisadas++;
    }

    if (placaOriginal !== placaNormalizada) {
      corregidas++;

      cambios.push({
        fila: index + 2,
        anterior: placaOriginal,
        nuevo: placaNormalizada
      });

      row[IDX.placa] = placaNormalizada;
    }

    placaValues.push([row[IDX.placa]]);
  });

  if (aplicarCorrecciones) {
    sheet
      .getRange(2, IDX.placa + 1, rows.length, 1)
      .setValues(placaValues);
  }

  Logger.log("Cambios placas aplicados:");
  Logger.log(JSON.stringify(cambios.slice(0, 100), null, 2));

  if (cambios.length > 100) {
    Logger.log("Más cambios de placas no mostrados: " + (cambios.length - 100));
  }

  return {
    revisadas: revisadas,
    corregidas: corregidas,
    cambios: cambios
  };
}

/***************************************
 * TIPO VEHICULO ESPERADO SEGUN PLACA COLOMBIANA
 ***************************************/
function getTipoVehiculoEsperadoPorRegexPlaca_(placaNorm) {
  const placa = safeTrim_(placaNorm).toUpperCase();

  // Carro colombiano estándar: ABC123
  if (/^[A-Z]{3}[0-9]{3}$/.test(placa)) {
    return {
      ok: true,
      tipo: "CARRO",
      regex: "CARRO_ABC123"
    };
  }

  // Moto colombiana estándar: ABC12D
  if (/^[A-Z]{3}[0-9]{2}[A-Z]$/.test(placa)) {
    return {
      ok: true,
      tipo: "MOTO",
      regex: "MOTO_ABC12D"
    };
  }

  return {
    ok: false,
    tipo: "",
    regex: "NO_RECONOCIDO"
  };
}


function normalizarTipoVehiculo_(value) {
  const tipo = normalizeText_(value).toUpperCase();

  if (tipo.includes("MOTO")) return "MOTO";
  if (tipo.includes("CARRO")) return "CARRO";
  if (tipo.includes("VEHICULO")) return "CARRO";
  if (tipo.includes("AUTO")) return "CARRO";

  return tipo;
}

/***************************************
 * HOJA MAESTRA
 ***************************************/
function getOrCreateHojaMaestra_(ss) {
  const nombre = "maestra";
  let sheet = ss.getSheetByName(nombre);

  if (!sheet) {
    sheet = ss.insertSheet(nombre);
    sheet.getRange(1, 1, 1, 9).setValues([[
      "Placa",
      "Apartamento",
      "TipoVehiculo",
      "ConfianzaApto",
      "TotalRegistros",
      "Fuente",
      "FechaActualizacion",
      "Estado",
      "Notas"
    ]]);

    sheet.getRange(1, 1, 1, 9)
      .setFontWeight("bold")
      .setBackground("#d9ead3");

    sheet.setFrozenRows(1);
  }

  return sheet;
}


function leerMapaMaestra_(sheet) {
  const lastRow = sheet.getLastRow();
  const mapa = {};

  if (lastRow < 2) {
    return mapa;
  }

  const values = sheet.getRange(2, 1, lastRow - 1, 9).getValues();

  values.forEach(function (row, index) {
    const placa = normalizePlaca_(row[0]);

    if (!placa) return;

    mapa[placa] = {
      row: index + 2,
      placa: placa,
      apartamento: safeTrim_(row[1]),
      apartamentoNorm: normalizeApto_(row[1]),
      tipoVehiculo: normalizarTipoVehiculo_(row[2]),
      confianzaApto: Number(row[3]) || 0,
      totalRegistros: Number(row[4]) || 0,
      fuente: safeTrim_(row[5]),
      estado: safeTrim_(row[7]),
      notas: safeTrim_(row[8])
    };
  });

  return mapa;
}


function agregarRegistroMaestra_(sheet, data) {
  sheet.appendRow([
    data.placa,
    data.apartamento,
    data.tipoVehiculo,
    data.confianzaApto,
    data.totalRegistros,
    data.fuente,
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm"),
    data.estado,
    data.notas || ""
  ]);
}

/***************************************
 * ANALIZAR Y CORREGIR TODAS LAS PLACAS
 ***************************************/
function analizarYCorregirTodasLasPlacas_(config) {
  const sheet = config.sheet;
  const registros = config.registros;
  const IDX = config.IDX;
  const hojaMaestra = config.hojaMaestra;
  const mapaMaestra = config.mapaMaestra;
  const aplicarCorrecciones = config.aplicarCorrecciones;
  const umbralAltaCerteza = config.umbralAltaCerteza;
  const minRegistrosPlaca = config.minRegistrosPlaca;

  const correccionesApto = [];
  const correccionesTipo = [];
  const maestraCreados = [];
  const inconsistenciasNoReparadas = [];
  const mapaVigilancia = config.mapaVigilancia || {};

  const gruposPorPlaca = agruparPorCampo_(registros, "placaNorm");

  let totalPlacasAnalizadas = 0;
  let totalConMaestraInterna = 0;
  let totalConVigilancia = 0;
  let totalPorMayoriaHistorica = 0;
  let totalSinCerteza = 0;
  let totalRegexInvalida = 0;

  Object.keys(gruposPorPlaca).forEach(function (placaNorm) {
    const registrosPlaca = gruposPorPlaca[placaNorm];

    if (!placaNorm) return;

    logDetalle_("=== ANALIZANDO PLACA: " + placaNorm + " ===");
    logDetalle_("Total registros placa: " + registrosPlaca.length);




    const masterInterna = mapaMaestra[placaNorm];
    const masterVigilancia = mapaVigilancia[placaNorm];

    // Prioridad:
    // 1. Maestra interna
    // 2. Vigilancia
    // 3. Mayoría histórica
    const masterBase = masterInterna || masterVigilancia;

    if (masterBase && !maestraEsConfiableParaCorreccion_(masterBase)) {
      marcarInconsistenciaNoReparable_({
        sheet: sheet,
        IDX: IDX,
        registros: registrosPlaca,
        columna: "apto",
        motivo:
          "La placa existe en maestra/vigilancia, pero está marcada como REQUIERE_VERIFICACION o tiene baja confianza. " +
          "No se usa para corrección automática hasta validación manual.",
        inconsistenciasNoReparadas: inconsistenciasNoReparadas,
        aplicarCorrecciones: aplicarCorrecciones
      });

      totalSinCerteza++;
      return;
    }

    const master = masterBase;








    const regexInfo = getTipoVehiculoEsperadoPorRegexPlaca_(placaNorm);
    const conteoAptos = contarPorCampo_(registrosPlaca, "aptoNorm");
    const mayoriaApto = obtenerMayoria_(conteoAptos, registrosPlaca.length);

    const registrosConTipo = registrosPlaca.filter(function (reg) {
      return reg.tipoVehiculoNorm;
    });

    const conteoTipos = contarPorCampo_(registrosConTipo, "tipoVehiculoNorm");
    const mayoriaTipo = obtenerMayoria_(conteoTipos, registrosConTipo.length);



    totalPlacasAnalizadas++;
    if (masterInterna) {
      totalConMaestraInterna++;
    } else if (masterVigilancia) {
      totalConVigilancia++;
    }
    if (!regexInfo.ok) {
      totalRegexInvalida++;
    }

    logJsonDetalle_("Regex placa:", regexInfo);
    logJsonDetalle_("Distribución aptos:", conteoAptos);
    logJsonDetalle_("Mayoría apto:", mayoriaApto);
    logJsonDetalle_("Distribución tipos:", conteoTipos);
    logJsonDetalle_("Mayoría tipo:", mayoriaTipo);

    let aptoCorrectoNorm = "";
    let aptoCorrectoTexto = "";
    let confianzaApto = 0;
    let fuenteApto = "";

    /***************************************
     * 1. Si existe en maestra, la maestra manda.
     ***************************************/
    if (master) {
      aptoCorrectoNorm = master.apartamentoNorm;
      aptoCorrectoTexto = master.apartamento;
      confianzaApto = master.confianzaApto || 1;
      fuenteApto = masterInterna ? "MAESTRA_INTERNA_EXISTENTE" : "VIGILANCIA_PLACAS";

      logDetalle_("Placa existe en maestra. Se respeta maestra:");
      logDetalle_(JSON.stringify(master, null, 2));
    }

    /***************************************
     * 2. Si no existe en maestra, usar mayoría >= 90%.
     ***************************************/
    if (!master) {
      if (
        mayoriaApto &&
        mayoriaApto.porcentaje >= umbralAltaCerteza &&
        registrosPlaca.length >= minRegistrosPlaca
      ) {
        aptoCorrectoNorm = mayoriaApto.valor;
        aptoCorrectoTexto = obtenerTextoAptoPorNorm_(registrosPlaca, aptoCorrectoNorm);
        confianzaApto = mayoriaApto.porcentaje;
        fuenteApto = "MAYORIA_HISTORICA_PLACA";

        const tipoParaMaestra = resolverTipoParaMaestra_(regexInfo, mayoriaTipo);

        if (aplicarCorrecciones) {
          agregarRegistroMaestra_(hojaMaestra, {
            placa: placaNorm,
            apartamento: aptoCorrectoTexto,
            tipoVehiculo: tipoParaMaestra.tipo,
            confianzaApto: confianzaApto,
            totalRegistros: registrosPlaca.length,
            fuente: fuenteApto,
            estado: "ALTA_CERTEZA",
            notas: "Creado automáticamente por normalización global."
          });
        }

        mapaMaestra[placaNorm] = {
          placa: placaNorm,
          apartamento: aptoCorrectoTexto,
          apartamentoNorm: aptoCorrectoNorm,
          tipoVehiculo: tipoParaMaestra.tipo,
          confianzaApto: confianzaApto,
          totalRegistros: registrosPlaca.length,
          fuente: fuenteApto,
          estado: "ALTA_CERTEZA"
        };

        maestraCreados.push({
          placa: placaNorm,
          apartamento: aptoCorrectoTexto,
          tipoVehiculo: tipoParaMaestra.tipo,
          confianzaApto: confianzaApto,
          totalRegistros: registrosPlaca.length
        });
      }
    }

    /***************************************
     * 3. Corregir apartamento si hay certeza.
     ***************************************/
    if (aptoCorrectoNorm) {
      registrosPlaca.forEach(function (reg) {
        if (reg.aptoNorm && reg.aptoNorm !== aptoCorrectoNorm) {
          correccionesApto.push({
            sheetRow: reg.sheetRow,
            placa: placaNorm,
            aptoActual: reg.apto,
            aptoSugerido: aptoCorrectoTexto,
            fuente: fuenteApto,
            confianza: confianzaApto
          });

          if (aplicarCorrecciones) {
            sheet.getRange(reg.sheetRow, IDX.apto + 1)
              .setValue(aptoCorrectoTexto)
              .setBackground("#d9ead3"); //VERDE

            reg.apto = aptoCorrectoTexto;
            reg.aptoNorm = normalizeApto_(aptoCorrectoTexto);
          }
        }
      });
      totalPorMayoriaHistorica++;
    } else {
      marcarInconsistenciaNoReparable_({
        sheet: sheet,
        IDX: IDX,
        registros: registrosPlaca,
        columna: "apto",
        motivo: "No hay mayoría de apartamento con alta certeza para la placa " + placaNorm,
        inconsistenciasNoReparadas: inconsistenciasNoReparadas,
        aplicarCorrecciones: aplicarCorrecciones
      });
      totalSinCerteza++;
    }

    /***************************************
     * 4. Corregir tipo vehículo por regex.
     ***************************************/
    if (regexInfo.ok) {
      registrosPlaca.forEach(function (reg) {
        const tipoActual = normalizarTipoVehiculo_(reg.tipoVehiculoNorm);

        if (tipoActual && tipoActual !== regexInfo.tipo) {
          correccionesTipo.push({
            sheetRow: reg.sheetRow,
            placa: placaNorm,
            tipoActual: reg.tipoVehiculo,
            tipoSugerido: regexInfo.tipo,
            fuente: regexInfo.regex,
            confianza: 1
          });

          if (aplicarCorrecciones) {
            sheet.getRange(reg.sheetRow, IDX.tipoVehiculo + 1)
              .setValue(regexInfo.tipo)
              .setBackground("#d9ead3"); //VERDE

            reg.tipoVehiculo = regexInfo.tipo;
            reg.tipoVehiculoNorm = regexInfo.tipo;
          }
        }
      });
    }

    /***************************************
     * 5. Si regex NO corresponde, usar mayoría histórica del tipo.
     ***************************************/
    if (!regexInfo.ok) {
      if (
        mayoriaTipo &&
        mayoriaTipo.porcentaje >= umbralAltaCerteza &&
        registrosConTipo.length >= minRegistrosPlaca
      ) {
        registrosPlaca.forEach(function (reg) {
          const tipoActual = normalizarTipoVehiculo_(reg.tipoVehiculoNorm);

          if (tipoActual && tipoActual !== mayoriaTipo.valor) {
            correccionesTipo.push({
              sheetRow: reg.sheetRow,
              placa: placaNorm,
              tipoActual: reg.tipoVehiculo,
              tipoSugerido: mayoriaTipo.valor,
              fuente: "MAYORIA_HISTORICA_TIPO",
              confianza: mayoriaTipo.porcentaje
            });

            if (aplicarCorrecciones) {
              sheet.getRange(reg.sheetRow, IDX.tipoVehiculo + 1)
                .setValue(mayoriaTipo.valor)
                .setBackground("#d9ead3"); //VERDE

              reg.tipoVehiculo = mayoriaTipo.valor;
              reg.tipoVehiculoNorm = mayoriaTipo.valor;
            }
          }
        });
      } else {
        marcarInconsistenciaNoReparable_({
          sheet: sheet,
          IDX: IDX,
          registros: registrosPlaca,
          columna: "placa",
          motivo: "La placa no cumple regex colombiano y no hay mayoría confiable de tipo vehículo: " + placaNorm,
          inconsistenciasNoReparadas: inconsistenciasNoReparadas,
          aplicarCorrecciones: aplicarCorrecciones
        });
      }
    }
  });

  logResumen_("=== RESUMEN ANALISIS PLACAS ===");
  logResumen_("Placas analizadas: " + totalPlacasAnalizadas);
  logResumen_("Con maestra interna: " + totalConMaestraInterna);
  logResumen_("Con vigilancia: " + totalConVigilancia);
  logResumen_("Creadas por mayoría histórica: " + totalPorMayoriaHistorica);
  logResumen_("Sin certeza: " + totalSinCerteza);
  logResumen_("Regex inválida: " + totalRegexInvalida);
  logResumen_("Correcciones apto: " + correccionesApto.length);
  logResumen_("Correcciones tipo: " + correccionesTipo.length);
  logResumen_("Inconsistencias no reparadas: " + inconsistenciasNoReparadas.length);

  return {
    correccionesApto: correccionesApto,
    correccionesTipo: correccionesTipo,
    maestraCreados: maestraCreados,
    inconsistenciasNoReparadas: inconsistenciasNoReparadas
  };
}


/***************************************
 * AGRUPAR POR CAMPO
 ***************************************/
function agruparPorCampo_(registros, campo) {
  const grupos = {};

  registros.forEach(function (reg) {
    const key = reg[campo] || "";

    if (!key) return;

    if (!grupos[key]) {
      grupos[key] = [];
    }

    grupos[key].push(reg);
  });

  return grupos;
}


/***************************************
 * RESOLVER TIPO PARA MAESTRA
 ***************************************/
function resolverTipoParaMaestra_(regexInfo, mayoriaTipo) {
  if (regexInfo && regexInfo.ok) {
    return {
      tipo: regexInfo.tipo,
      fuente: regexInfo.regex,
      confianza: 1
    };
  }

  if (mayoriaTipo && mayoriaTipo.porcentaje >= UMBRAL_MAYORIA) {
    return {
      tipo: mayoriaTipo.valor,
      fuente: "MAYORIA_HISTORICA_TIPO",
      confianza: mayoriaTipo.porcentaje
    };
  }

  return {
    tipo: "",
    fuente: "SIN_CERTEZA",
    confianza: 0
  };
}


/***************************************
 * MARCAR INCONSISTENCIA NO REPARABLE
 ***************************************/
function marcarInconsistenciaNoReparable_(params) {
  const sheet = params.sheet;
  const IDX = params.IDX;
  const registros = params.registros;
  const columna = params.columna;
  const motivo = params.motivo;
  const inconsistenciasNoReparadas = params.inconsistenciasNoReparadas;
  const aplicarCorrecciones = params.aplicarCorrecciones === true;

  let colIndex = -1;

  if (columna === "apto") {
    colIndex = IDX.apto;
  } else if (columna === "placa") {
    colIndex = IDX.placa;
  } else if (columna === "tipoVehiculo") {
    colIndex = IDX.tipoVehiculo;
  }

  if (colIndex === -1) return;



  if (registros.length > 0) {
    const placaNorm = registros[0].placaNorm;

    inconsistenciasNoReparadas.push(
      crearResumenInconsistenciaPlaca_(
        placaNorm,
        registros,
        columna,
        motivo
      )
    );
  }

  registros.forEach(function (reg) {
    if (aplicarCorrecciones) {
      sheet.getRange(reg.sheetRow, colIndex + 1)
        .setBackground("#f4cccc"); //ROJO
    }
  });



}



function getSheetByGid_(ss, gid) {
  const sheets = ss.getSheets();

  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === Number(gid)) {
      return sheets[i];
    }
  }

  return null;
}

function leerMapaVigilanciaPlacas_() {
  const ss = SpreadsheetApp.openById(SHEET_ID_VIGILANCIA_PLACAS);
  const sheet = getSheetByGid_(ss, SHEET_GID_VIGILANCIA_PLACAS);

  if (!sheet) {
    throw new Error('No se encontró la hoja de vigilancia con gid ' + SHEET_GID_VIGILANCIA_PLACAS);
  }

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow < 2 || lastCol < 2) {
    return {};
  }

  const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();

  const mapa = {};
  const conflictos = [];
  const placasConflictivas = {};

  // Formato esperado:
  // Col A-B, D-E, G-H, etc.
  const paresColumnas = generarParesColumnasVigilancia_(lastCol);

  data.forEach(function (row, rowIndex) {
    paresColumnas.forEach(function (par) {
      const placaRaw = row[par.placaCol];
      const aptoRaw = row[par.aptoCol];

      const placa = normalizePlaca_(placaRaw);
      const apto = safeTrim_(aptoRaw);
      const aptoNorm = normalizeApto_(apto);

      if (!placa || !apto) return;

      // Evitar tomar encabezados o basura.
      if (!esPlacaColombianaBasica_(placa)) return;
      if (!/^\d{2,5}$/.test(aptoNorm)) return;
      if (placasConflictivas[placa]) {
        return;
      }


      if (mapa[placa] && mapa[placa].apartamentoNorm !== aptoNorm) {
        conflictos.push({
          placa: placa,
          aptoExistente: mapa[placa].apartamento,
          aptoNuevo: apto,
          fila: rowIndex + 1
        });

        delete mapa[placa];
        placasConflictivas[placa] = true;

        return;
      }

      mapa[placa] = {
        placa: placa,
        apartamento: apto,
        apartamentoNorm: aptoNorm,
        fuente: 'VIGILANCIA_PLACAS',
        row: rowIndex + 1,
        placaCol: par.placaCol + 1,
        aptoCol: par.aptoCol + 1
      };
    });
  });

  logResumen_('Total placas cargadas desde vigilancia: ' + Object.keys(mapa).length);

  if (conflictos.length > 0) {
    logMuestra_('Conflictos encontrados en vigilancia', conflictos, 20);
  }

  return mapa;
}

function esPlacaColombianaBasica_(placa) {
  const p = normalizePlaca_(placa);

  // Carro: ABC123
  if (/^[A-Z]{3}[0-9]{3}$/.test(p)) return true;

  // Moto: ABC12D
  if (/^[A-Z]{3}[0-9]{2}[A-Z]$/.test(p)) return true;

  return false;
}

function generarParesColumnasVigilancia_(lastCol) {
  const pares = [];

  // Patrón:
  // A-B, D-E, G-H, J-K, M-N, P-Q, S-T, V-W, Y-Z, AB-AC
  for (var placaCol = 0; placaCol < lastCol; placaCol += 3) {
    var aptoCol = placaCol + 1;

    if (aptoCol < lastCol) {
      pares.push({
        placaCol: placaCol,
        aptoCol: aptoCol
      });
    }
  }

  logDetalle_("Pares de columnas vigilancia detectados:");
  logDetalle_(JSON.stringify(
    pares.map(function (p) {
      return {
        placaCol: p.placaCol + 1,
        aptoCol: p.aptoCol + 1,
        placaLetra: columnToLetter_(p.placaCol + 1),
        aptoLetra: columnToLetter_(p.aptoCol + 1)
      };
    }),
    null,
    2
  ));

  return pares;
}

function columnToLetter_(column) {
  var temp = "";
  var letter = "";

  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }

  return letter;
}

function sincronizarVigilanciaConMaestra_(hojaMaestra, mapaMaestra, mapaVigilancia, aplicarCorrecciones) {
  const nuevos = [];
  const omitidos = [];

  Object.keys(mapaVigilancia).forEach(function (placa) {
    const registroVigilancia = mapaVigilancia[placa];

    if (!registroVigilancia || !registroVigilancia.apartamentoNorm) {
      omitidos.push({
        placa: placa,
        motivo: "Registro de vigilancia incompleto."
      });
      return;
    }

    if (mapaMaestra[placa]) {
      omitidos.push({
        placa: placa,
        apartamentoMaestra: mapaMaestra[placa].apartamento,
        apartamentoVigilancia: registroVigilancia.apartamento,
        motivo: "Ya existe en maestra. Se respeta maestra."
      });
      return;
    }

    const regexInfo = getTipoVehiculoEsperadoPorRegexPlaca_(placa);
    const tipoVehiculo = regexInfo.ok ? regexInfo.tipo : "";

    nuevos.push({
      placa: placa,
      apartamento: registroVigilancia.apartamento,
      apartamentoNorm: registroVigilancia.apartamentoNorm,
      tipoVehiculo: tipoVehiculo,
      confianzaApto: 1,
      totalRegistros: 0,
      fuente: "VIGILANCIA_PLACAS",
      estado: "ALTA_CERTEZA_VIGILANCIA",
      notas: "Creado automáticamente desde hoja de vigilancia."
    });
  });

  logResumen_("=== SINCRONIZACION VIGILANCIA → MAESTRA ===");
  logResumen_("Registros vigilancia revisados: " + Object.keys(mapaVigilancia).length);
  logResumen_("Nuevos para maestra: " + nuevos.length);
  logResumen_("Omitidos: " + omitidos.length);

  if (nuevos.length > 0) {
    logMuestra_("Nuevos para maestra", nuevos, 20);
  }

  if (aplicarCorrecciones && nuevos.length > 0) {
    const now = Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyy-MM-dd HH:mm"
    );

    const values = nuevos.map(function (item) {
      return [
        item.placa,
        item.apartamento,
        item.tipoVehiculo,
        item.confianzaApto,
        item.totalRegistros,
        item.fuente,
        now,
        item.estado,
        item.notas
      ];
    });

    hojaMaestra
      .getRange(hojaMaestra.getLastRow() + 1, 1, values.length, 9)
      .setValues(values);

    Logger.log("Registros insertados en maestra: " + nuevos.length);
  } else {
    Logger.log("No se insertaron registros en maestra. aplicarCorrecciones: " + aplicarCorrecciones);
  }

  // Actualizar mapaMaestra en memoria para que el análisis posterior ya los respete.
  nuevos.forEach(function (item) {
    mapaMaestra[item.placa] = {
      placa: item.placa,
      apartamento: item.apartamento,
      apartamentoNorm: item.apartamentoNorm,
      tipoVehiculo: item.tipoVehiculo,
      confianzaApto: item.confianzaApto,
      totalRegistros: item.totalRegistros,
      fuente: item.fuente,
      estado: item.estado,
      notas: item.notas
    };
  });

  return {
    nuevos: nuevos,
    omitidos: omitidos
  };
}

function prepararResumenSancionesPorApartamento() {
  const contextoPlanilla = leerPlanillaSanciones_({ includeRichText: true });
  const ss = contextoPlanilla.ss;
  const lastRow = contextoPlanilla.lastRow;

  if (lastRow < 2) {
    Logger.log("No hay sanciones para procesar.");
    return;
  }

  const allData = contextoPlanilla.allData;
  const richData = contextoPlanilla.richData;
  const IDX = contextoPlanilla.IDX;
  const rows = contextoPlanilla.rows;
  const registros = construirRegistrosNormalizados_(rows, IDX, richData, allData);

  const mapaCorreos = leerMapaCorreosApartamentos_();
  const resumenPorApto = agruparSancionesPorApartamento_(registros);

  const hojaResumen = getOrCreateHojaResumenEnvio_(ss);
  hojaResumen.clear();

  hojaResumen.getRange(1, 1, 1, 9).setValues([[
    "Apartamento",
    "Email",
    "CantidadSanciones",
    "ValorUnitario",
    "ValorTotal",
    "Estado",
    "FechaPreparacion",
    "Detalle",
    "Observaciones"
  ]]);

  hojaResumen.getRange(1, 1, 1, 9)
    .setFontWeight("bold")
    .setBackground("#d9ead3"); //VERDE

  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");

  const values = Object.keys(resumenPorApto)
    .map(function (aptoNorm) {
      const item = resumenPorApto[aptoNorm];
      const correoInfo = mapaCorreos[normalizarApartamentoDesdeCorreo_(item.apartamento)];

      const cantidad = item.sanciones.length;

      const resumenPlacas = agruparSancionesPorPlaca_(item.sanciones);

      const valorTotal = resumenPlacas.reduce(function (total, placaItem) {
        return total + placaItem.valorTotal;
      }, 0);

      const detalle = convertirResumenPlacasATexto_(resumenPlacas);

      const cantidadSinTipo = item.sanciones.filter(function (s) {
        const tipoNorm = normalizarTipoVehiculo_(s.tipoVehiculo);
        return tipoNorm !== "MOTO" && tipoNorm !== "CARRO";
      }).length;

      let observaciones = "";

      if (!correoInfo) {
        observaciones = "No se encontró correo para este apartamento.";
      }

      if (cantidadSinTipo > 0) {
        observaciones += " Hay " + cantidadSinTipo + " sanciones sin tipo de vehículo reconocido.";
      }

      return {
        valorTotal: valorTotal,
        fila: [
          item.apartamento,
          correoInfo ? correoInfo.email : "",
          cantidad,
          "Moto: " + formatCOP_(VALOR_UNITARIO_SANCION_MOTO) + " / Carro: " + formatCOP_(VALOR_UNITARIO_SANCION_CARRO),
          valorTotal,
          correoInfo ? "PENDIENTE" : "SIN_CORREO",
          now,
          detalle,
          observaciones
        ]
      };
    })
    .sort(function (a, b) {
      return b.valorTotal - a.valorTotal;
    })
    .map(function (entry) {
      return entry.fila;
    });

  if (values.length > 0) {
    hojaResumen.getRange(2, 1, values.length, 9).setValues(values);
    hojaResumen.autoResizeColumns(1, 9);
  }

  Logger.log("Apartamentos con resumen generado: " + values.length);
}

function leerMapaCorreosApartamentos_() {
  const ss = SpreadsheetApp.openById(SHEET_ID_CORREOS_APTOS);
  const sheet = getSheetByGid_(ss, SHEET_GID_CORREOS_APTOS);

  if (!sheet) {
    throw new Error('No se encontró la hoja de correos con gid ' + SHEET_GID_CORREOS_APTOS);
  }

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow < 2 || lastCol < 1) {
    return {};
  }

  const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = data[0].map(function (h) {
    return normalizeHeader_(h);
  });

  const idxApto = buscarColumnaPorNombres_(headers, [
    "apartamento",
    "apto"
  ]);

  const idxNombre = buscarColumnaPorNombres_(headers, [
    "nombre"
  ]);

  const idxNombre2 = buscarColumnaPorNombres_(headers, [
    "nombre 2do comprador",
    "nombre segundo comprador"
  ]);

  const idxCorreo1 = buscarColumnaPorNombres_(headers, [
    "correo electronico",
    "correo",
    "email"
  ]);

  const idxCorreo2 = buscarColumnaPorNombres_(headers, [
    "correo electronico 2do comprador",
    "correo electronico segundo comprador",
    "correo 2do comprador",
    "email 2do comprador"
  ]);

  if (idxApto === -1) {
    throw new Error('No se encontró la columna "Apartamento" en la hoja de correos.');
  }

  if (idxCorreo1 === -1 && idxCorreo2 === -1) {
    throw new Error('No se encontró ninguna columna de correo electrónico en la hoja de correos.');
  }

  const mapa = {};
  const duplicados = [];

  data.slice(1).forEach(function (row, index) {
    const aptoRaw = safeTrim_(row[idxApto]);
    const aptoKey = normalizarApartamentoDesdeCorreo_(aptoRaw);

    if (!aptoKey) return;

    const nombre1 = idxNombre !== -1 ? safeTrim_(row[idxNombre]) : "";
    const nombre2 = idxNombre2 !== -1 ? safeTrim_(row[idxNombre2]) : "";

    const correo1 = idxCorreo1 !== -1 ? safeTrim_(row[idxCorreo1]).toLowerCase() : "";
    const correo2 = idxCorreo2 !== -1 ? safeTrim_(row[idxCorreo2]).toLowerCase() : "";

    const correos = [];

    if (esEmailValido_(correo1)) {
      correos.push(correo1);
    }

    if (esEmailValido_(correo2) && correos.indexOf(correo2) === -1) {
      correos.push(correo2);
    }

    if (correos.length === 0) return;

    if (mapa[aptoKey]) {
      duplicados.push({
        apto: aptoKey,
        filaExistente: mapa[aptoKey].row,
        filaNueva: index + 2,
        correosExistentes: mapa[aptoKey].email,
        correosNuevos: correos.join(", ")
      });

      // Une correos si el apartamento aparece repetido.
      correos.forEach(function (correo) {
        if (mapa[aptoKey].correos.indexOf(correo) === -1) {
          mapa[aptoKey].correos.push(correo);
        }
      });

      mapa[aptoKey].email = mapa[aptoKey].correos.join(", ");
      return;
    }

    mapa[aptoKey] = {
      apartamento: aptoKey,
      apartamentoOriginal: aptoRaw,
      email: correos.join(", "),
      correos: correos,
      nombre: nombre1,
      nombre2: nombre2,
      row: index + 2,
      fuente: "HOJA_CORREOS_APTOS"
    };
  });

  Logger.log("Correos cargados por apartamento: " + Object.keys(mapa).length);

  if (duplicados.length > 0) {
    Logger.log("Apartamentos duplicados en hoja de correos:");
    Logger.log(JSON.stringify(duplicados.slice(0, 100), null, 2));
  }

  return mapa;
}

function agruparSancionesPorApartamento_(registros) {
  const mapa = {};

  registros.forEach(function (reg) {
    if (!reg.aptoNorm) return;

    if (!mapa[reg.aptoNorm]) {
      mapa[reg.aptoNorm] = {
        apartamento: reg.apto,
        sanciones: []
      };
    }

    mapa[reg.aptoNorm].sanciones.push(reg);
  });

  return mapa;
}

function getOrCreateHojaResumenEnvio_(ss) {
  let sheet = ss.getSheetByName(SHEET_RESUMEN_ENVIO_SANCIONES);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_RESUMEN_ENVIO_SANCIONES);
  }

  return sheet;
}

function obtenerIdxPlanilla_(rawHeaders) {
  const headers = rawHeaders.map(function (h) {
    return normalizeHeader_(h);
  });

  const colMap = {};
  headers.forEach(function (h, i) {
    colMap[h] = i;
  });

  return {
    id: findColIdx_(colMap, ["id"]),
    fecha: findColIdx_(colMap, ["fecha"]),
    vigilante: findColIdx_(colMap, ["vigilante que toma el registro", "vigilante", "agente"]),
    tipoVehiculo: findColIdx_(colMap, ["tipo de vehiculo", "tipo vehiculo", "vehiculo"]),
    placa: findColIdx_(colMap, ["placa"]),
    apto: findColIdx_(colMap, ["apto", "apartamento", "apt", "numero de apto", "no. apto", "nro apto"]),
    residenteVisitante: findColIdx_(colMap, ["residente o visitante", "residente", "tipo residente", "residente/visitante"]),
    observaciones: findColIdx_(colMap, ["observaciones", "observacion"]),
    foto: findColIdx_(colMap, ["foto", "imagen", "fotografia"]),
    firma: findColIdx_(colMap, ["firma"])
  };
}

function enviarCorreosResumenSanciones() {
  const ss = SpreadsheetApp.openById(SHEET_ID_SANCIONES);
  const sheet = ss.getSheetByName(SHEET_RESUMEN_ENVIO_SANCIONES);

  if (!sheet) {
    throw new Error('Primero debes ejecutar prepararResumenSancionesPorApartamento().');
  }

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow < 2) {
    Logger.log("No hay correos pendientes.");
    return;
  }

  const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();

  const headers = data[0].map(function (h) {
    return normalizeHeader_(h);
  });

  const colMap = {};
  headers.forEach(function (h, i) {
    colMap[h] = i;
  });

  const idxApto = colMap["apartamento"];
  const idxEmail = colMap["email"];
  const idxCantidad = colMap["cantidadsanciones"];
  const idxValorUnitario = colMap["valorunitario"];
  const idxValorTotal = colMap["valortotal"];
  const idxEstado = colMap["estado"];
  const idxDetalle = colMap["detalle"];
  const idxObs = colMap["observaciones"];

  let enviados = 0;
  let omitidos = 0;

  data.slice(1).forEach(function (row, index) {
    const sheetRow = index + 2;

    const apto = safeTrim_(row[idxApto]);
    const email = safeTrim_(row[idxEmail]);
    const estado = safeTrim_(row[idxEstado]);

    if (!apto || !email) {
      omitidos++;
      return;
    }

    if (estado !== "PENDIENTE") {
      omitidos++;
      return;
    }

    const cantidad = Number(row[idxCantidad]) || 0;
    const valorUnitario = Number(row[idxValorUnitario]) || 0;
    const valorTotal = Number(row[idxValorTotal]) || 0;
    const detalle = safeTrim_(row[idxDetalle]);

    const subject = "NO RESPONDER - Notificación de sanción por uso indebido del parqueadero de visitantes - Apto " + apto;

    const htmlBody = construirHtmlCorreoSanciones_({
      apartamento: apto,
      cantidad: cantidad,
      valorUnitario: valorUnitario,
      valorTotal: valorTotal,
      detalle: detalle
    });

    Logger.log("Preparando correo para apto " + apto + " -> " + email);

    const ccCorreo = "";
    const replyToCorreo = "bulevarverdeadmon@gmail.com";

    const destinatariosNecesarios = contarDestinatariosCorreo_(email, ccCorreo, "");
    const cuotaRestante = MailApp.getRemainingDailyQuota();
    const cuotaDisponible = cuotaRestante - SANCIONES_CUOTA_RESERVA;

    if (cuotaDisponible < destinatariosNecesarios) {
      Logger.log(
        "CUOTA INSUFICIENTE. Apto: " + apto +
        " | Cuota restante: " + cuotaRestante +
        " | Disponible (con reserva de " + SANCIONES_CUOTA_RESERVA + "): " + cuotaDisponible +
        " | Necesarios: " + destinatariosNecesarios
      );

      sheet.getRange(sheetRow, idxObs + 1).setValue(
        "PENDIENTE POR CUOTA. Restante: " + cuotaRestante + " - " +
        Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm")
      );

      return;
    }

    if (!EMAIL_DRY_RUN) {
      MailApp.sendEmail({
        to: email,
        replyTo: replyToCorreo,
        subject: subject,
        htmlBody: htmlBody,
        name: "Administración Bulevar Verde"
      });

      sheet.getRange(sheetRow, idxEstado + 1).setValue("ENVIADO");
      sheet.getRange(sheetRow, idxObs + 1).setValue(
        "Enviado: " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm")
      );
    } else {
      sheet.getRange(sheetRow, idxEstado + 1).setValue("SIMULADO");
      sheet.getRange(sheetRow, idxObs + 1).setValue(
        "Simulado: " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm")
      );
    }

    enviados++;
  });

  Logger.log("Correos procesados: " + enviados);
  Logger.log("Omitidos: " + omitidos);
}

function construirHtmlCorreoSanciones_(data) {
  const fechaTexto = obtenerFechaComunicacion_();

  // Soporta dos escenarios:
  // 1. data.resumenPlacas ya viene calculado.
  // 2. data.detalle viene desde la hoja resumen_envio_sanciones.
  const resumenPlacas = data.resumenPlacas || obtenerResumenPlacasDesdeDetalle_(data.detalle);

  let resumenPlacasHtml = `
    <table style="border-collapse: collapse; width: 100%; max-width: 650px; font-size: 14px; margin: 16px 0;">
      <tr>
        <th style="border: 1px solid #ccc; padding: 8px; text-align: left;">Placa</th>
        <th style="border: 1px solid #ccc; padding: 8px; text-align: left;">Tipo</th>
        <th style="border: 1px solid #ccc; padding: 8px; text-align: center;">Días / registros</th>
        <th style="border: 1px solid #ccc; padding: 8px; text-align: right;">Valor sanción</th>
      </tr>
  `;

  resumenPlacas.forEach(function (item) {
    resumenPlacasHtml += `
      <tr>
        <td style="border: 1px solid #ccc; padding: 8px;">${escapeHtml_(item.placa)}</td>
        <td style="border: 1px solid #ccc; padding: 8px;">${escapeHtml_(item.tipoVehiculo)}</td>
        <td style="border: 1px solid #ccc; padding: 8px; text-align: center;">${item.cantidad}</td>
        <td style="border: 1px solid #ccc; padding: 8px; text-align: right;"><strong>${formatCOP_(item.valorTotal)}</strong></td>
      </tr>
    `;
  });

  resumenPlacasHtml += "</table>";

  const placasTexto = resumenPlacas.map(function (item) {
    return item.placa;
  }).join(", ");

  return `
    <div style="font-family: Arial, sans-serif; color: #222; line-height: 1.55; font-size: 14px; max-width: 760px;">
      <p><strong>Itagüí, ${fechaTexto}</strong></p>

      <p>
        Señor(a):<br>
        <strong>Copropietario(a) / Residente</strong><br>
        Apartamento: <strong>${escapeHtml_(data.apartamento)}</strong>
      </p>

      <p>
        <strong>Asunto:</strong> Notificación de sanción por uso indebido del parqueadero de visitantes
      </p>

      <p>Cordial saludo,</p>

      <p>
        Para consultar el detalle de sus sanciones, puede ingresar al siguiente enlace:
        <br>
        <a href="${URL_CONSULTA_SANCIONES}" target="_blank">
          ${URL_CONSULTA_SANCIONES}
        </a>
      </p>

      <p>
        La administración de <strong>Club Residencial Bulevar Verde</strong> se permite informar que,
        de acuerdo con la verificación realizada por el personal de seguridad y los registros de control
        de la copropiedad, se evidenció que el/los vehículo(s) identificado(s) con placa(s)
        <strong>${escapeHtml_(placasTexto)}</strong> permaneció/permanecieron estacionado(s) en el
        parqueadero de visitantes durante <strong>${data.cantidad}</strong> días/registros,
        incumpliendo la reglamentación establecida para el uso de dichas zonas comunes.
      </p>

      <p>
        La anterior conducta constituye un incumplimiento de las disposiciones internas de la copropiedad,
        en especial de lo establecido en el <strong>Artículo 40 – Obligaciones de los propietarios o residentes,
        numeral 20</strong>, el cual dispone:
      </p>

      <blockquote style="border-left: 4px solid #ccc; margin: 12px 0; padding: 8px 14px; color: #444;">
        "En general, someterse a las normas del presente reglamento y a las decisiones válidamente adoptadas
        por la Asamblea General de Propietarios, el Consejo de Administración y el Administrador."
      </blockquote>

      <p>
        Teniendo en cuenta que el reglamento de uso de parqueaderos de visitantes fue debidamente aprobado
        y comunicado por los órganos de administración de la copropiedad, su incumplimiento genera la aplicación
        de las medidas correctivas y sancionatorias correspondientes.
      </p>

      <p>
        En consecuencia, se impone una sanción pecuniaria conforme al siguiente resumen:
      </p>

      <table style="border-collapse: collapse; margin: 16px 0; max-width: 650px;">
        <tr>
          <td style="padding: 8px 12px; border: 1px solid #ccc;"><strong>Total sanciones</strong></td>
          <td style="padding: 8px 12px; border: 1px solid #ccc;">${data.cantidad}</td>
        </tr>
      </table>

      ${resumenPlacasHtml}

      <table style="border-collapse: collapse; margin: 16px 0; max-width: 650px;">
        <tr>
          <td style="padding: 8px 12px; border: 1px solid #ccc;"><strong>Valor total a pagar</strong></td>
          <td style="padding: 8px 12px; border: 1px solid #ccc;"><strong>${formatCOP_(data.valorTotal)}</strong></td>
        </tr>
      </table>

      <p>
        Esta sanción será cargada y reflejada en la factura de administración correspondiente al siguiente
        período de facturación.
      </p>

      <p>
        No obstante, en garantía del derecho constitucional al debido proceso, se concede un término de
        <strong>cinco (5) días hábiles</strong> contados a partir de la recepción de la presente comunicación
        para que presente por escrito los respectivos descargos, aporte las pruebas que considere pertinentes
        y ejerza su derecho de defensa y contradicción.
      </p>

      <p>
        Los descargos deberán ser remitidos al correo electrónico de la administración:
        <a href="mailto:bulevarverdeadmon@gmail.com">bulevarverdeadmon@gmail.com</a>
      </p>

      <p>
        En caso de no presentar descargos dentro del término establecido, se entenderá que acepta los hechos
        aquí expuestos y la sanción impuesta quedará en firme, procediéndose a su aplicación en la facturación
        correspondiente.
      </p>

      <p>
        La copropiedad es el hogar de más de 880 familias y el cumplimiento de las normas contribuye al orden,
        la convivencia, la adecuada utilización de las zonas comunes, la seguridad y la valorización de nuestro
        conjunto residencial.
      </p>

      <p>
        Sin otro particular, agradecemos su atención y colaboración.
      </p>

      <p>
        Cordialmente,<br><br>
        <strong>ADMINISTRACIÓN</strong><br>
        <strong>CLUB RESIDENCIAL BULEVAR VERDE</strong>
      </p>
    </div>
  `;
}

function convertirDetalleATablaHtml_(detalle) {
  if (!detalle) {
    return "<p>No se encontró detalle de sanciones.</p>";
  }

  const filas = detalle.split("\n");

  let html = `
    <table style="border-collapse: collapse; width: 100%; font-size: 13px;">
      <tr>
        <th style="border: 1px solid #ccc; padding: 6px;">#</th>
        <th style="border: 1px solid #ccc; padding: 6px;">Fecha</th>
        <th style="border: 1px solid #ccc; padding: 6px;">Placa</th>
        <th style="border: 1px solid #ccc; padding: 6px;">Tipo</th>
        <th style="border: 1px solid #ccc; padding: 6px;">Valor</th>
        <th style="border: 1px solid #ccc; padding: 6px;">Observación</th>
      </tr>
  `;

  filas.forEach(function (linea) {
    const partes = linea.split("|").map(function (p) {
      return safeTrim_(p);
    });

    html += `
      <tr>
        <td style="border: 1px solid #ccc; padding: 6px;">${escapeHtml_(partes[0] || "")}</td>
        <td style="border: 1px solid #ccc; padding: 6px;">${escapeHtml_(partes[1] || "")}</td>
        <td style="border: 1px solid #ccc; padding: 6px;">${escapeHtml_(partes[2] || "")}</td>
        <td style="border: 1px solid #ccc; padding: 6px;">${escapeHtml_(partes[3] || "")}</td>
        <td style="border: 1px solid #ccc; padding: 6px;">${escapeHtml_(partes[4] || "")}</td>
        <td style="border: 1px solid #ccc; padding: 6px;">${escapeHtml_(partes[5] || "")}</td>
      </tr>
    `;
  });

  html += "</table>";

  return html;
}

function formatCOP_(value) {
  const number = Number(value) || 0;
  return "$" + number.toLocaleString("es-CO");
}

function escapeHtml_(value) {
  return safeTrim_(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buscarColumnaPorNombres_(headers, nombres) {
  for (var i = 0; i < headers.length; i++) {
    for (var j = 0; j < nombres.length; j++) {
      if (headers[i] === normalizeHeader_(nombres[j])) {
        return i;
      }
    }
  }

  return -1;
}

function normalizarApartamentoDesdeCorreo_(value) {
  const raw = safeTrim_(value).toUpperCase();

  if (!raw) return "";

  // Ejemplos:
  // APT-4-1127 → 1127
  // APT-4-0430 → 430
  // 1127 → 1127
  const match = raw.match(/(\d{2,5})$/);

  if (!match) return "";

  return quitarCerosIzquierda_(match[1]);
}

function quitarCerosIzquierda_(value) {
  const limpio = safeTrim_(value).replace(/^0+/, "");
  return limpio || "0";
}

function esEmailValido_(email) {
  const e = safeTrim_(email).toLowerCase();

  if (!e) return false;

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function getValorSancionPorTipo_(tipoVehiculo) {
  const tipo = normalizarTipoVehiculo_(tipoVehiculo);

  if (tipo === "MOTO") {
    return VALOR_UNITARIO_SANCION_MOTO;
  }

  if (tipo === "CARRO") {
    return VALOR_UNITARIO_SANCION_CARRO;
  }

  // Si no se reconoce el tipo, no se cobra automático.
  return 0;
}

function agruparSancionesPorPlaca_(sanciones) {
  const mapa = {};

  sanciones.forEach(function (s) {
    const placa = s.placaNorm || normalizePlaca_(s.placa) || "SIN_PLACA";
    const tipo = normalizarTipoVehiculo_(s.tipoVehiculo) || "SIN_TIPO";
    const key = placa + "|" + tipo;

    if (!mapa[key]) {
      mapa[key] = {
        placa: placa,
        tipoVehiculo: tipo,
        cantidad: 0,
        valorTotal: 0
      };
    }

    mapa[key].cantidad++;
    mapa[key].valorTotal += getValorSancionPorTipo_(tipo);
  });

  return Object.keys(mapa).map(function (key) {
    return mapa[key];
  });
}

function logResumen_(msg) {
  if (LOG_LEVEL === "RESUMEN" || LOG_LEVEL === "DETALLE") {
    Logger.log(msg);
  }
}

function logDetalle_(msg) {
  if (LOG_LEVEL === "DETALLE") {
    Logger.log(msg);
  }
}

function logJsonDetalle_(label, obj) {
  if (LOG_LEVEL === "DETALLE") {
    Logger.log(label);
    Logger.log(JSON.stringify(obj, null, 2));
  }
}

function logMuestra_(label, arr, limite) {
  if (LOG_LEVEL === "RESUMEN" || LOG_LEVEL === "DETALLE") {
    const max = limite || 20;
    Logger.log(label + " total: " + arr.length);
    Logger.log(JSON.stringify(arr.slice(0, max), null, 2));

    if (arr.length > max) {
      Logger.log("Más registros no mostrados: " + (arr.length - max));
    }
  }
}

function crearResumenInconsistenciaPlaca_(placaNorm, registrosPlaca, columna, motivo) {
  const conteoAptos = contarPorCampo_(registrosPlaca, "aptoNorm");
  const mayoriaApto = obtenerMayoria_(conteoAptos, registrosPlaca.length);

  const registrosConTipo = registrosPlaca.filter(function (reg) {
    return reg.tipoVehiculoNorm;
  });

  const conteoTipos = contarPorCampo_(registrosConTipo, "tipoVehiculoNorm");
  const mayoriaTipo = obtenerMayoria_(conteoTipos, registrosConTipo.length);

  const aptosDetalle = Object.keys(conteoAptos)
    .sort(function (a, b) {
      return conteoAptos[b] - conteoAptos[a];
    })
    .map(function (apto) {
      return apto + "=" + conteoAptos[apto];
    })
    .join(", ");

  const tiposDetalle = Object.keys(conteoTipos)
    .sort(function (a, b) {
      return conteoTipos[b] - conteoTipos[a];
    })
    .map(function (tipo) {
      return tipo + "=" + conteoTipos[tipo];
    })
    .join(", ");

  const filas = registrosPlaca.map(function (reg) {
    return reg.sheetRow;
  });

  const porcentajeMayoria = mayoriaApto ? mayoriaApto.porcentaje : 0;
  const porcentajeTexto = Math.round(porcentajeMayoria * 10000) / 100 + "%";
  const umbralTexto = Math.round(UMBRAL_MAYORIA * 100) + "%";
  const diferenciaUmbral = Math.max(0, UMBRAL_MAYORIA - porcentajeMayoria);
  const diferenciaTexto = Math.round(diferenciaUmbral * 10000) / 100 + "%";

  let recomendacion = "Revisión manual.";

  if (registrosPlaca.length < MIN_REGISTROS_PARA_CORREGIR) {
    recomendacion = "No corrige porque tiene pocos registros históricos.";
  } else if (mayoriaApto && porcentajeMayoria < UMBRAL_MAYORIA) {
    recomendacion = "No corrige porque la mayoría no alcanza el umbral de certeza.";
  }

  let prioridad = "BAJA";
  let criterioRevision = "";

  if (registrosPlaca.length >= MIN_REGISTROS_PARA_CORREGIR && mayoriaApto && porcentajeMayoria < UMBRAL_MAYORIA) {
    prioridad = "ALTA";
    criterioRevision = "Tiene suficientes registros, pero la mayoría no alcanza el umbral.";
  } else if (registrosPlaca.length < MIN_REGISTROS_PARA_CORREGIR && registrosPlaca.length >= 3) {
    prioridad = "MEDIA";
    criterioRevision = "Tiene pocos registros, pero ya hay alguna repetición histórica.";
  } else {
    prioridad = "BAJA";
    criterioRevision = "Tiene muy pocos registros históricos.";
  }

  return {
    prioridad: prioridad,
    placa: placaNorm,
    columna: columna,
    motivo: motivo,
    totalRegistros: registrosPlaca.length,
    aptosDetectados: aptosDetalle,
    mayoriaApto: mayoriaApto ? mayoriaApto.valor : "",
    cantidadMayoriaApto: mayoriaApto ? mayoriaApto.cantidad : 0,
    certezaApto: porcentajeTexto,
    umbralRequerido: umbralTexto,
    diferenciaContraUmbral: diferenciaTexto,
    tiposDetectados: tiposDetalle,
    mayoriaTipo: mayoriaTipo ? mayoriaTipo.valor : "",
    filasAfectadas: filas.slice(0, 20).join(", "),
    totalFilasAfectadas: filas.length,
    recomendacion: recomendacion,
    criterioRevision: criterioRevision
  };
}

function logResumenInconsistencias_(inconsistencias) {
  Logger.log("=== INCONSISTENCIAS PARA REVISIÓN MANUAL ===");
  Logger.log("Total placas con inconsistencia: " + inconsistencias.length);

  const pesoPrioridad = {
    "ALTA": 3,
    "MEDIA": 2,
    "BAJA": 1
  };

  const ordenadas = inconsistencias.slice().sort(function (a, b) {
    const prioridadDiff = (pesoPrioridad[b.prioridad] || 0) - (pesoPrioridad[a.prioridad] || 0);
    if (prioridadDiff !== 0) return prioridadDiff;

    return b.totalRegistros - a.totalRegistros;
  });

  ordenadas.slice(0, 50).forEach(function (item, index) {
    Logger.log(
      [
        index + 1,
        "Prioridad: " + item.prioridad,
        "Placa: " + item.placa,
        "Registros: " + item.totalRegistros,
        "Aptos: " + item.aptosDetectados,
        "Mayoría: " + item.mayoriaApto + " (" + item.cantidadMayoriaApto + " registros / " + item.certezaApto + ")",
        "Umbral: " + item.umbralRequerido,
        "Faltó: " + item.diferenciaContraUmbral,
        "Tipos: " + item.tiposDetectados,
        "Filas: " + item.filasAfectadas,
        "Criterio: " + item.criterioRevision,
        "Recomendación: " + item.recomendacion
      ].join(" | ")
    );
  });

  if (ordenadas.length > 50) {
    Logger.log("Más inconsistencias no mostradas: " + (ordenadas.length - 50));
  }
}

function obtenerFechaComunicacion_() {
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
  ];

  const fecha = new Date();
  const dia = fecha.getDate();
  const mes = meses[fecha.getMonth()];
  const anio = fecha.getFullYear();

  return dia + " de " + mes + " de " + anio;
}

function obtenerResumenPlacasDesdeDetalle_(detalle) {
  const mapa = {};

  if (!detalle) return [];

  const filas = detalle.split("\n");

  filas.forEach(function (linea) {
    const partes = linea.split("|").map(function (p) {
      return safeTrim_(p);
    });

    let placa = "";
    let tipo = "";
    let cantidad = 1;
    let valorTotal = 0;

    // Nuevo formato resumido:
    // placa | tipo | cantidad | valor
    if (partes.length === 4 && !/^\d+$/.test(partes[0])) {
      placa = normalizePlaca_(partes[0] || "SIN_PLACA");
      tipo = normalizarTipoVehiculo_(partes[1] || "SIN_TIPO");
      cantidad = Number(partes[2]) || 0;
      valorTotal = Number(String(partes[3]).replace(/[^0-9]/g, "")) || 0;
    }

    // Formato anterior:
    // # | fecha | placa | tipo | valor | observacion
    else {
      placa = normalizePlaca_(partes[2] || "SIN_PLACA");
      tipo = normalizarTipoVehiculo_(partes[3] || "SIN_TIPO");
      cantidad = 1;

      if (partes[4]) {
        valorTotal = Number(String(partes[4]).replace(/[^0-9]/g, "")) || 0;
      }

      if (!valorTotal) {
        valorTotal = getValorSancionPorTipo_(tipo);
      }
    }

    const key = placa + "|" + tipo;

    if (!mapa[key]) {
      mapa[key] = {
        placa: placa,
        tipoVehiculo: tipo,
        cantidad: 0,
        valorTotal: 0
      };
    }

    mapa[key].cantidad += cantidad;
    mapa[key].valorTotal += valorTotal;
  });

  return Object.keys(mapa).map(function (key) {
    return mapa[key];
  });
}


function convertirResumenPlacasATexto_(resumenPlacas) {
  return resumenPlacas.map(function (item) {
    return [
      item.placa,
      item.tipoVehiculo,
      item.cantidad,
      formatCOP_(item.valorTotal)
    ].join(" | ");
  }).join("\n");
}

function distanciaPlacas_(a, b) {
  const placaA = normalizePlaca_(a);
  const placaB = normalizePlaca_(b);

  if (!placaA || !placaB) return 999;
  if (placaA.length !== placaB.length) return 999;

  let distanciaTotal = 0;

  for (var i = 0; i < placaA.length; i++) {
    distanciaTotal += distanciaCaracterPlaca_(placaA[i], placaB[i]);
  }

  // Normaliza a escala 0 - 999
  const distanciaNormalizada = Math.round((distanciaTotal / placaA.length) * 999);

  return Math.min(999, distanciaNormalizada);
}

function distanciaCaracterPlaca_(charA, charB) {
  if (charA === charB) return 0;

  const esNumeroA = /^[0-9]$/.test(charA);
  const esNumeroB = /^[0-9]$/.test(charB);

  const esLetraA = /^[A-Z]$/.test(charA);
  const esLetraB = /^[A-Z]$/.test(charB);

  // Número contra número: 5 → 6 pesa menos que 5 → 9
  if (esNumeroA && esNumeroB) {
    return Math.abs(Number(charA) - Number(charB)) / 9;
  }

  // Letra contra letra: X → Z pesa menos que A → Z
  if (esLetraA && esLetraB) {
    const posA = charA.charCodeAt(0) - 65; // A = 0
    const posB = charB.charCodeAt(0) - 65;
    return Math.abs(posA - posB) / 25;
  }

  // Letra contra número es diferencia fuerte
  return 1;
}

function detectarYCorregirPlacasSimilares_(sheet, registros, IDX, aplicarCorrecciones) {
  const grupos = {};

  registros.forEach(function (reg) {
    if (!reg.aptoNorm || !reg.tipoVehiculoNorm || !reg.placaNorm) return;

    const key = reg.aptoNorm + "|" + reg.tipoVehiculoNorm;

    if (!grupos[key]) {
      grupos[key] = [];
    }

    grupos[key].push(reg);
  });

  const candidatos = [];
  const descartados = [];

  Object.keys(grupos).forEach(function (key) {
    const registrosGrupo = grupos[key];
    const conteoPlacas = {};

    registrosGrupo.forEach(function (reg) {
      if (!conteoPlacas[reg.placaNorm]) {
        conteoPlacas[reg.placaNorm] = {
          placa: reg.placaNorm,
          cantidad: 0,
          registros: []
        };
      }

      conteoPlacas[reg.placaNorm].cantidad++;
      conteoPlacas[reg.placaNorm].registros.push(reg);
    });

    const placas = Object.keys(conteoPlacas).map(function (placa) {
      return conteoPlacas[placa];
    });

    const dominantes = placas.filter(function (item) {
      return item.cantidad >= MIN_REGISTROS_PARA_CORREGIR;
    });

    const sospechosas = placas.filter(function (item) {
      return item.cantidad <= MAX_REGISTROS_PLACA_SOSPECHOSA;
    });

    sospechosas.forEach(function (sospechosa) {
      let mejorCandidato = null;

      dominantes.forEach(function (dominante) {
        if (sospechosa.placa === dominante.placa) return;

        const distancia = distanciaPlacas_(sospechosa.placa, dominante.placa);
        const tipoSimilitud = obtenerTipoSimilitudPlaca_(sospechosa.placa, dominante.placa);

        const baseDescartado = {
          apartamento: sospechosa.registros[0].apto,
          tipoVehiculo: sospechosa.registros[0].tipoVehiculoNorm,
          placaActual: sospechosa.placa,
          placaComparada: dominante.placa,
          registrosPlacaActual: sospechosa.cantidad,
          registrosPlacaComparada: dominante.cantidad,
          distancia: distancia,
          tipoSimilitud: tipoSimilitud,
          filas: sospechosa.registros.map(function (reg) {
            return reg.sheetRow;
          }).join(", ")
        };




        if (
          distancia > MAX_DISTANCIA_PLACA_SIMILAR &&
          tipoSimilitud !== "TRANSPOSICION_SIMPLE"
        ) {
          if (
            MOSTRAR_PLACAS_SIMILARES_DESCARTADAS &&
            distancia <= MAX_DISTANCIA_DESCARTADA_PARA_ANALISIS
          ) {
            descartados.push(Object.assign({}, baseDescartado, {
              motivoDescarte: "Distancia supera el máximo permitido: " + distancia + " > " + MAX_DISTANCIA_PLACA_SIMILAR
            }));
          }
          return;
        }



        const regexSospechosa = getTipoVehiculoEsperadoPorRegexPlaca_(sospechosa.placa);
        const regexDominante = getTipoVehiculoEsperadoPorRegexPlaca_(dominante.placa);

        if (!regexSospechosa.ok || !regexDominante.ok) {
          descartados.push(Object.assign({}, baseDescartado, {
            motivoDescarte: "Una de las placas no cumple formato colombiano reconocido."
          }));
          return;
        }

        if (regexSospechosa.tipo !== regexDominante.tipo) {
          descartados.push(Object.assign({}, baseDescartado, {
            motivoDescarte: "El tipo esperado por regex no coincide: " + regexSospechosa.tipo + " vs " + regexDominante.tipo
          }));
          return;
        }

        const confianza = dominante.cantidad / (dominante.cantidad + sospechosa.cantidad);

        const candidato = {
          apartamento: sospechosa.registros[0].apto,
          apartamentoNorm: sospechosa.registros[0].aptoNorm,
          tipoVehiculo: sospechosa.registros[0].tipoVehiculoNorm,
          placaActual: sospechosa.placa,
          placaSugerida: dominante.placa,
          registrosPlacaActual: sospechosa.cantidad,
          registrosPlacaSugerida: dominante.cantidad,
          distancia: distancia,
          tipoSimilitud: tipoSimilitud,
          confianza: confianza,
          filas: sospechosa.registros.map(function (reg) {
            return reg.sheetRow;
          }),
          motivo: "Placa poco frecuente muy similar a placa dominante del mismo apartamento y tipo."
        };

        if (
          !mejorCandidato ||
          candidato.distancia < mejorCandidato.distancia ||
          candidato.registrosPlacaSugerida > mejorCandidato.registrosPlacaSugerida
        ) {
          mejorCandidato = candidato;
        }
      });

      if (mejorCandidato) {
        const motivoNoCorreccion = obtenerMotivoNoCorreccionPlacaSimilar_(mejorCandidato);

        const puedeCorregirAuto =
          !motivoNoCorreccion &&
          mejorCandidato.confianza >= UMBRAL_MAYORIA &&
          mejorCandidato.registrosPlacaSugerida >= MIN_REGISTROS_PARA_CORREGIR &&
          (
            mejorCandidato.tipoSimilitud === "TRANSPOSICION_SIMPLE" ||
            mejorCandidato.tipoSimilitud === "DIFERENCIA_BAJA"
          );

        mejorCandidato.decisionAuto = puedeCorregirAuto ? "CORREGIR_AUTO" : "SOLO_REVISION";
        mejorCandidato.estadoEjecucion = aplicarCorrecciones
          ? (puedeCorregirAuto ? "CORREGIDA" : "NO_CORREGIDA")
          : "DRY_RUN_NO_APLICA";

        mejorCandidato.motivoNoCorreccion = motivoNoCorreccion || (
          aplicarCorrecciones
            ? ""
            : "DRY_RUN activo. No se aplican cambios físicos."
        );

        candidatos.push(mejorCandidato);

        if (aplicarCorrecciones && puedeCorregirAuto) {
          sospechosa.registros.forEach(function (reg) {
            sheet.getRange(reg.sheetRow, IDX.placa + 1)
              .setValue(mejorCandidato.placaSugerida)
              .setBackground("#fff2cc");

            reg.placa = mejorCandidato.placaSugerida;
            reg.placaNorm = mejorCandidato.placaSugerida;
          });
        }
      }
    });
  });

  escribirRevisionPlacasSimilares_(candidatos);

  Logger.log("=== REVISION PLACAS SIMILARES ===");
  Logger.log("Candidatos encontrados: " + candidatos.length);

  candidatos.slice(0, 50).forEach(function (item, index) {
    Logger.log(
      [
        index + 1,
        "Apto: " + item.apartamento,
        "Tipo: " + item.tipoVehiculo,
        "Corregir: " + item.placaActual + " → " + item.placaSugerida,
        "Actual: " + item.registrosPlacaActual,
        "Dominante: " + item.registrosPlacaSugerida,
        "Distancia: " + item.distancia,
        "Similitud: " + item.tipoSimilitud,
        "Confianza: " + Math.round(item.confianza * 10000) / 100 + "%",
        "DecisionAuto: " + item.decisionAuto,
        "Estado: " + item.estadoEjecucion,
        "MotivoNoCorreccion: " + item.motivoNoCorreccion,
        "Filas: " + item.filas.join(", ")
      ].join(" | ")
    );
  });

  const noCorregidas = candidatos.filter(function (item) {
    return item.decisionAuto !== "CORREGIR_AUTO";
  });

  Logger.log("=== CANDIDATOS NO CORREGIDOS AUTOMATICAMENTE ===");
  Logger.log("Total candidatos solo revisión: " + noCorregidas.length);

  noCorregidas.slice(0, 30).forEach(function (item, index) {
    Logger.log(
      [
        index + 1,
        "Apto: " + item.apartamento,
        "Tipo: " + item.tipoVehiculo,
        "Placa: " + item.placaActual + " → " + item.placaSugerida,
        "Distancia: " + item.distancia,
        "Similitud: " + item.tipoSimilitud,
        "Confianza: " + Math.round(item.confianza * 10000) / 100 + "%",
        "Motivo: " + item.motivoNoCorreccion,
        "Filas: " + item.filas.join(", ")
      ].join(" | ")
    );
  });

  if (MOSTRAR_PLACAS_SIMILARES_DESCARTADAS) {
    Logger.log("=== POSIBLES PLACAS SIMILARES DESCARTADAS ===");
    Logger.log("Total descartadas para análisis: " + descartados.length);

    descartados.slice(0, LIMITE_PLACAS_SIMILARES_DESCARTADAS).forEach(function (item, index) {
      Logger.log(
        [
          index + 1,
          "Apto: " + item.apartamento,
          "Tipo: " + item.tipoVehiculo,
          "Comparación: " + item.placaActual + " vs " + item.placaComparada,
          "Actual: " + item.registrosPlacaActual,
          "Comparada: " + item.registrosPlacaComparada,
          "Distancia: " + item.distancia,
          "Similitud: " + item.tipoSimilitud,
          "MotivoDescarte: " + item.motivoDescarte,
          "Filas: " + item.filas
        ].join(" | ")
      );
    });

    if (descartados.length > LIMITE_PLACAS_SIMILARES_DESCARTADAS) {
      Logger.log("Más descartadas no mostradas: " + (descartados.length - LIMITE_PLACAS_SIMILARES_DESCARTADAS));
    }
  }

  return candidatos;
}

function escribirRevisionPlacasSimilares_(candidatos) {
  const ss = SpreadsheetApp.openById(SHEET_ID_SANCIONES);
  const nombreHoja = "revision_placas_similares";

  let sheet = ss.getSheetByName(nombreHoja);

  if (!sheet) {
    sheet = ss.insertSheet(nombreHoja);
  }

  sheet.clear();

  sheet.getRange(1, 1, 1, 14).setValues([[
    "Apartamento",
    "TipoVehiculo",
    "PlacaActual",
    "PlacaSugerida",
    "RegistrosPlacaActual",
    "RegistrosPlacaSugerida",
    "Distancia",
    "Similitud",
    "Confianza",
    "DecisionAuto",
    "EstadoEjecucion",
    "MotivoNoCorreccion",
    "Filas",
    "DecisionManual"
  ]]);

  sheet.getRange(1, 1, 1, 14)
    .setFontWeight("bold")
    .setBackground("#fff2cc");

  if (candidatos.length === 0) {
    return;
  }

  const values = candidatos.map(function (item) {
    return [
      item.apartamento,
      item.tipoVehiculo,
      item.placaActual,
      item.placaSugerida,
      item.registrosPlacaActual,
      item.registrosPlacaSugerida,
      item.distancia,
      item.tipoSimilitud,
      Math.round(item.confianza * 10000) / 100 + "%",
      item.decisionAuto || "",
      item.estadoEjecucion || "",
      item.motivoNoCorreccion || "",
      item.filas.join(", "),
      ""
    ];
  });

  sheet.getRange(2, 1, values.length, 14).setValues(values);
  sheet.autoResizeColumns(1, 14);
}
function obtenerTipoSimilitudPlaca_(placaActual, placaSugerida) {
  if (placaActual === placaSugerida) return "IGUAL";

  if (esTransposicionSimple_(placaActual, placaSugerida)) {
    return "TRANSPOSICION_SIMPLE";
  }

  const distancia = distanciaPlacas_(placaActual, placaSugerida);

  if (distancia <= 50) return "DIFERENCIA_BAJA";
  if (distancia <= 120) return "DIFERENCIA_MEDIA";

  return "DIFERENCIA_ALTA";
}

function esTransposicionSimple_(a, b) {
  const placaA = normalizePlaca_(a);
  const placaB = normalizePlaca_(b);

  if (!placaA || !placaB) return false;
  if (placaA.length !== placaB.length) return false;

  const diferencias = [];

  for (var i = 0; i < placaA.length; i++) {
    if (placaA[i] !== placaB[i]) {
      diferencias.push(i);
    }
  }

  // Solo aplica si hay exactamente 2 diferencias
  if (diferencias.length !== 2) return false;

  const pos1 = diferencias[0];
  const pos2 = diferencias[1];

  // Las diferencias deben estar juntas
  if (pos2 !== pos1 + 1) return false;

  // Valida que sea intercambio directo:
  // CZW11D vs CWZ11D
  // posiciones Z/W invertidas
  return (
    placaA[pos1] === placaB[pos2] &&
    placaA[pos2] === placaB[pos1]
  );
}

function obtenerMotivoNoCorreccionPlacaSimilar_(item) {
  if (item.confianza < UMBRAL_MAYORIA) {
    return "Confianza menor al mínimo requerido: " +
      Math.round(item.confianza * 10000) / 100 + "%";
  }

  if (item.registrosPlacaSugerida < MIN_REGISTROS_PARA_CORREGIR) {
    return "La placa dominante no tiene suficientes registros.";
  }

  if (
    item.tipoSimilitud !== "TRANSPOSICION_SIMPLE" &&
    item.tipoSimilitud !== "DIFERENCIA_BAJA"
  ) {
    return "Similitud no permitida para corrección automática: " + item.tipoSimilitud;
  }

  return "";
}

function contarDestinatariosCorreo_(to, cc, bcc) {
  return [to, cc, bcc]
    .filter(Boolean)
    .join(",")
    .split(/[,;]/)
    .map(function (item) {
      return safeTrim_(item);
    })
    .filter(function (item) {
      return item;
    }).length;
}

function verCuotaEmailActual() {
  const cuota = MailApp.getRemainingDailyQuota();
  Logger.log("Cuota restante de destinatarios hoy: " + cuota);
}

function getOrCreateHojaLogConsultas_(ss) {
  let sheet = ss.getSheetByName(SHEET_LOG_CONSULTAS_SANCIONES);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_LOG_CONSULTAS_SANCIONES);

    sheet.getRange(1, 1, 1, 11).setValues([[
      "FechaHora",
      "Action",
      "ApartamentoInput",
      "PlacaInput",
      "ApartamentoNormalizado",
      "PlacaNormalizada",
      "Resultado",
      "Mensaje",
      "CantidadSanciones",
      "PlacasDevueltas",
      "Parametros"
    ]]);

    sheet.getRange(1, 1, 1, 11)
      .setFontWeight("bold")
      .setBackground("#d9ead3");

    sheet.setFrozenRows(1);
  }

  return sheet;
}

function registrarConsultaSanciones_(data) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID_SANCIONES);
    const sheet = getOrCreateHojaLogConsultas_(ss);

    sheet.appendRow([
      Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss"),
      data.action || "",
      data.aptoInput || "",
      data.placaInput || "",
      data.aptoNorm || "",
      data.placaNorm || "",
      data.resultado || "",
      data.mensaje || "",
      data.cantidadSanciones || 0,
      data.placasDevueltas || "",
      data.parametros ? JSON.stringify(data.parametros) : ""
    ]);
  } catch (error) {
    Logger.log("ERROR registrando consulta sanciones: " + error.message);
  }
}

function getOrCreateHojaResumenNotificacionesDebidoProceso_(ss) {
  let sheet = ss.getSheetByName(SHEET_RESUMEN_NOTIFICACIONES_DEBIDO_PROCESO);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_RESUMEN_NOTIFICACIONES_DEBIDO_PROCESO);
  }

  return sheet;
}

function obtenerPlacasTextoDesdeSanciones_(sanciones) {
  const mapa = {};

  sanciones.forEach(function (s) {
    const placa = s.placaNorm || normalizePlaca_(s.placa);
    if (placa) mapa[placa] = true;
  });

  return Object.keys(mapa).join(", ");
}

function convertirDetalleNotificacionDebidoProcesoATexto_(sanciones) {
  const resumen = agruparSancionesPorPlaca_(sanciones);

  return resumen.map(function (item) {
    return [
      item.placa,
      item.tipoVehiculo,
      item.cantidad + " registro(s)"
    ].join(" | ");
  }).join("\n");
}

function prepararResumenNotificacionesDebidoProceso() {
  const contextoPlanilla = leerPlanillaSanciones_({ includeRichText: true });
  const ss = contextoPlanilla.ss;
  const lastRow = contextoPlanilla.lastRow;

  if (lastRow < 2) {
    Logger.log("No hay registros para procesar.");
    return;
  }

  const allData = contextoPlanilla.allData;
  const richData = contextoPlanilla.richData;
  const IDX = contextoPlanilla.IDX;
  const rows = contextoPlanilla.rows;

  const registros = construirRegistrosNormalizados_(rows, IDX, richData, allData);
  const mapaCorreos = leerMapaCorreosApartamentos_();
  const resumenPorApto = agruparSancionesPorApartamento_(registros);
  const mapaNotificados = leerMapaApartamentosYaNotificadosDebidoProceso_(ss);

  const hojaResumen = getOrCreateHojaResumenNotificacionesDebidoProceso_(ss);
  hojaResumen.clear();

  hojaResumen.getRange(1, 1, 1, 10).setValues([[
    "Apartamento",
    "ApartamentoNorm",
    "Email",
    "CantidadRegistros",
    "PlacasDetectadas",
    "Estado",
    "FechaPreparacion",
    "DetalleRegistros",
    "ClaveNotificacion",
    "Observaciones"
  ]]);

  hojaResumen.getRange(1, 1, 1, 10)
    .setFontWeight("bold")
    .setBackground("#d9ead3");

  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");

  const values = Object.keys(resumenPorApto)
    .sort(function (a, b) {
      return Number(a) - Number(b);
    })
    .map(function (aptoNorm) {
      const item = resumenPorApto[aptoNorm];
      const apto = item.apartamento;
      const clave = construirClaveNotificacionDebidoProceso_(apto);
      const correoInfo = mapaCorreos[normalizarApartamentoDesdeCorreo_(apto)];

      const yaNotificado = !!mapaNotificados[clave];

      if (yaNotificado) {
        return null;
      }

      const placasDetectadas = obtenerPlacasTextoDesdeSanciones_(item.sanciones);
      const detalle = convertirDetalleNotificacionDebidoProcesoATexto_(item.sanciones);

      let estado = "";
      let observaciones = "";

      if (!correoInfo || !correoInfo.email) {
        estado = "SIN_CORREO";
        observaciones = "No se encontró correo para este apartamento.";
      } else {
        estado = "PENDIENTE";
        observaciones = "Pendiente por notificar por única vez.";
      }

      return [
        apto,
        normalizeApto_(apto),
        correoInfo ? correoInfo.email : "",
        item.sanciones.length,
        placasDetectadas,
        estado,
        now,
        detalle,
        clave,
        observaciones
      ];
    })
    .filter(function (row) {
      return !!row;
    });

  if (values.length > 0) {
    hojaResumen.getRange(2, 1, values.length, 10).setValues(values);
    hojaResumen.autoResizeColumns(1, 10);
  }

  Logger.log("Resumen notificaciones debido proceso generado: " + values.length);
}

function construirHtmlNotificacionDebidoProceso_(data) {
  const fechaTexto = obtenerFechaComunicacion_();

  const detalleHtml = escapeHtml_(data.detalleRegistros || "")
    .replace(/\n/g, "<br>");

  return `
    <div style="font-family: Arial, sans-serif; color: #222; line-height: 1.55; font-size: 14px; max-width: 760px;">
      <p><strong>Itagüí, ${fechaTexto}</strong></p>

      <p>
        Señor(a):<br>
        <strong>Copropietario(a) / Residente</strong><br>
        Apartamento: <strong>${escapeHtml_(data.apartamento)}</strong>
      </p>

      <p>
        <strong>Asunto:</strong> Notificación preventiva por uso indebido del parqueadero de visitantes
      </p>

      <p>Cordial saludo,</p>

      <p>
        Para consultar el detalle de los registros asociados a esta notificación, puede ingresar al siguiente enlace:
        <br>
        <a href="${URL_CONSULTA_SANCIONES}" target="_blank">
          ${URL_CONSULTA_SANCIONES}
        </a>
      </p>

      <p>
        La administración del <strong>Club Residencial Bulevar Verde</strong> informa que se ha evidenciado
        el uso de celdas de parqueadero de visitantes por parte de vehículo(s) asociado(s) al apartamento
        <strong>${escapeHtml_(data.apartamento)}</strong>.
      </p>

      <p>
        Se recuerda que las celdas de visitantes están destinadas exclusivamente para visitantes y no para
        el uso permanente, habitual o indebido por parte de residentes, propietarios o vehículos asociados
        al apartamento.
      </p>

      <p>
        Esta comunicación constituye una <strong>notificación preventiva y única en garantía del debido proceso</strong>.
        Con esta notificación se deja constancia de que el apartamento ha sido informado sobre la norma y sobre
        las consecuencias de continuar con esta conducta.
      </p>

      <p>
        Si después de recibida esta notificación continúa el uso indebido del parqueadero de visitantes,
        los registros posteriores podrán ser tenidos en cuenta para la imposición de la sanción correspondiente
        al cierre del mes, conforme al reglamento interno y las decisiones válidamente adoptadas por los órganos
        de administración de la copropiedad.
      </p>

      <table style="border-collapse: collapse; margin: 16px 0; max-width: 650px;">
        <tr>
          <td style="padding: 8px 12px; border: 1px solid #ccc;"><strong>Placas detectadas</strong></td>
          <td style="padding: 8px 12px; border: 1px solid #ccc;">${escapeHtml_(data.placasDetectadas)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; border: 1px solid #ccc;"><strong>Cantidad de registros observados</strong></td>
          <td style="padding: 8px 12px; border: 1px solid #ccc;">${data.cantidadRegistros}</td>
        </tr>
      </table>

      <p><strong>Detalle de registros observados:</strong></p>
      <p style="background:#f7f7f7; padding:12px; border:1px solid #ddd;">
        ${detalleHtml}
      </p>

      <p>
        En caso de requerir aclaración, podrá comunicarse con la administración al correo electrónico:
        <a href="mailto:bulevarverdeadmon@gmail.com">bulevarverdeadmon@gmail.com</a>
      </p>

      <p>
        Cordialmente,<br><br>
        <strong>ADMINISTRACIÓN</strong><br>
        <strong>CLUB RESIDENCIAL BULEVAR VERDE</strong>
      </p>
    </div>
  `;
}

function enviarNotificacionesDebidoProceso() {
  const ss = SpreadsheetApp.openById(SHEET_ID_SANCIONES);
  const sheet = ss.getSheetByName(SHEET_RESUMEN_NOTIFICACIONES_DEBIDO_PROCESO);

  if (!sheet) {
    throw new Error('Primero debes ejecutar prepararResumenNotificacionesDebidoProceso().');
  }

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow < 2) {
    Logger.log("No hay notificaciones pendientes.");
    return;
  }

  const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();

  const headers = data[0].map(function (h) {
    return normalizeHeader_(h);
  });

  const colMap = {};
  headers.forEach(function (h, i) {
    colMap[h] = i;
  });

  const idxApto = colMap["apartamento"];
  const idxAptoNorm = colMap["apartamentonorm"];
  const idxEmail = colMap["email"];
  const idxCantidad = colMap["cantidadregistros"];
  const idxPlacas = colMap["placasdetectadas"];
  const idxEstado = colMap["estado"];
  const idxDetalle = colMap["detalleregistros"];
  const idxClave = colMap["clavenotificacion"];
  const idxObs = colMap["observaciones"];

  const mapaNotificados = leerMapaApartamentosYaNotificadosDebidoProceso_(ss);

  let enviados = 0;
  let omitidos = 0;

  data.slice(1).forEach(function (row, index) {
    const sheetRow = index + 2;

    const apto = safeTrim_(row[idxApto]);
    const email = safeTrim_(row[idxEmail]);
    const estado = safeTrim_(row[idxEstado]);
    const clave = safeTrim_(row[idxClave]) || construirClaveNotificacionDebidoProceso_(apto);

    if (!apto || !email) {
      omitidos++;
      return;
    }

    if (mapaNotificados[clave]) {
      sheet.getRange(sheetRow, idxEstado + 1).setValue("YA_NOTIFICADO");
      sheet.getRange(sheetRow, idxObs + 1).setValue(
        "Omitido. Ya existe notificación enviada el " + mapaNotificados[clave].fechaHora
      );
      omitidos++;
      return;
    }

    if (estado !== "PENDIENTE") {
      omitidos++;
      return;
    }

    const cantidadRegistros = Number(row[idxCantidad]) || 0;
    const placasDetectadas = safeTrim_(row[idxPlacas]);
    const detalleRegistros = safeTrim_(row[idxDetalle]);

    const subject = "NO RESPONDER - Notificación preventiva por uso indebido del parqueadero de visitantes - Apto " + apto;

    const dataCorreo = {
      apartamento: apto,
      apartamentoNorm: normalizeApto_(apto),
      email: email,
      cantidadRegistros: cantidadRegistros,
      placasDetectadas: placasDetectadas,
      detalleRegistros: detalleRegistros
    };

    const htmlBody = construirHtmlNotificacionDebidoProceso_(dataCorreo);

    const replyToCorreo = "bulevarverdeadmon@gmail.com";
    const destinatariosNecesarios = contarDestinatariosCorreo_(email, "", "");
    const cuotaRestante = MailApp.getRemainingDailyQuota();

    if (cuotaRestante < destinatariosNecesarios) {
      sheet.getRange(sheetRow, idxObs + 1).setValue(
        "PENDIENTE POR CUOTA. Restante: " + cuotaRestante + " - " +
        Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm")
      );
      omitidos++;
      return;
    }

    Logger.log("Preparando notificación debido proceso apto " + apto + " -> " + email);

    if (!EMAIL_DRY_RUN) {
      MailApp.sendEmail({
        to: email,
        replyTo: replyToCorreo,
        subject: subject,
        htmlBody: htmlBody,
        name: "Administración Bulevar Verde"
      });

      registrarNotificacionDebidoProceso_({
        apartamento: apto,
        email: email,
        placasDetectadas: placasDetectadas,
        cantidadRegistros: cantidadRegistros,
        detalleRegistros: detalleRegistros,
        estado: "ENVIADO",
        asunto: subject,
        plantillaNotificacion: PLANTILLA_NOTIFICACION_DEBIDO_PROCESO,
        observaciones: "Notificación preventiva única enviada correctamente."
      });

      mapaNotificados[clave] = {
        clave: clave,
        aptoNorm: normalizeApto_(apto),
        fechaHora: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss"),
        email: email,
        estado: "ENVIADO"
      };

      sheet.getRange(sheetRow, idxEstado + 1).setValue("ENVIADO");
      sheet.getRange(sheetRow, idxObs + 1).setValue(
        "Notificación enviada: " + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm")
      );

    } else {
      sheet.getRange(sheetRow, idxEstado + 1).setValue("SIMULADO");
      sheet.getRange(sheetRow, idxObs + 1).setValue("EMAIL_DRY_RUN activo. No se envió correo real.");
    }

    enviados++;
  });

  Logger.log("Notificaciones debido proceso enviadas: " + enviados);
  Logger.log("Omitidas: " + omitidos);
}

function construirClaveNotificacionDebidoProceso_(apto) {
  return TIPO_NOTIFICACION_DEBIDO_PROCESO + "|" + normalizeApto_(apto);
}

function getHeadersBitacoraNotificacionesDebidoProceso_() {
  return [
    "ClaveNotificacion",
    "FechaHoraNotificacion",
    "TipoNotificacion",
    "Apartamento",
    "ApartamentoNorm",
    "EmailDestino",
    "EmailRealApto",
    "PlacasDetectadas",
    "CantidadRegistros",
    "DetalleRegistros",
    "Estado",
    "Asunto",
    "PlantillaNotificacion",
    "Observaciones",
    "UsuarioEjecucion",
    "DryRun",
    "FechaRegistroSistema",
    "Version"
  ];
}

function getOrCreateHojaBitacoraNotificacionesDebidoProceso_(ss) {
  let sheet = ss.getSheetByName(SHEET_BITACORA_NOTIFICACIONES_DEBIDO_PROCESO);
  const headers = getHeadersBitacoraNotificacionesDebidoProceso_();

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_BITACORA_NOTIFICACIONES_DEBIDO_PROCESO);
  }

  // Fuerza siempre la plantilla oficial para evitar columnas corridas.
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight("bold")
    .setBackground("#d9ead3");

  sheet.setFrozenRows(1);

  return sheet;
}

function registrarBitacoraNotificacionDebidoProceso_(data) {
  const ss = SpreadsheetApp.openById(SHEET_ID_SANCIONES);
  const sheet = getOrCreateHojaBitacoraNotificacionesDebidoProceso_(ss);

  const now = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyy-MM-dd HH:mm:ss"
  );

  const clave = construirClaveNotificacionDebidoProceso_(data.apartamento);

  sheet.appendRow([
    clave,
    now,
    TIPO_NOTIFICACION_DEBIDO_PROCESO,
    data.apartamento || "",
    normalizeApto_(data.apartamento),
    data.emailDestino || data.email || "",
    data.emailRealApto || data.email || "",
    data.placasDetectadas || "",
    data.cantidadRegistros || 0,
    data.detalleRegistros || "",
    data.estado || "",
    data.asunto || "",
    data.plantillaNotificacion || PLANTILLA_NOTIFICACION_DEBIDO_PROCESO,
    data.observaciones || "",
    Session.getActiveUser().getEmail() || "",
    data.dryRun || "",
    now,
    data.version || "V1"
  ]);
}

// Wrapper para que el envío formal siga funcionando.
// Usa la misma bitácora oficial.
function registrarNotificacionDebidoProceso_(data) {
  registrarBitacoraNotificacionDebidoProceso_({
    apartamento: data.apartamento,
    emailDestino: data.email || data.emailDestino || "",
    emailRealApto: data.email || data.emailRealApto || "",
    placasDetectadas: data.placasDetectadas,
    cantidadRegistros: data.cantidadRegistros,
    detalleRegistros: data.detalleRegistros,
    estado: data.estado,
    asunto: data.asunto,
    plantillaNotificacion: data.plantillaNotificacion || PLANTILLA_NOTIFICACION_DEBIDO_PROCESO,
    observaciones: data.observaciones,
    dryRun: EMAIL_DRY_RUN ? "SI" : "NO",
    version: "V1"
  });
}

function leerMapaApartamentosYaNotificadosDebidoProceso_(ss) {
  const sheet = getOrCreateHojaBitacoraNotificacionesDebidoProceso_(ss);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  const mapa = {};

  if (lastRow < 2) {
    return mapa;
  }

  const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();

  const headers = data[0].map(function (h) {
    return normalizeHeader_(h);
  });

  const colMap = {};
  headers.forEach(function (h, i) {
    colMap[h] = i;
  });

  const idxClave = colMap["clavenotificacion"];
  const idxAptoNorm = colMap["apartamentonorm"];
  const idxEstado = colMap["estado"];
  const idxFecha = colMap["fechahoranotificacion"];
  const idxEmailDestino = colMap["emaildestino"];

  data.slice(1).forEach(function (row) {
    const clave = safeTrim_(row[idxClave]);
    const aptoNorm = safeTrim_(row[idxAptoNorm]);
    const estado = safeTrim_(row[idxEstado]);

    if (!clave || !aptoNorm) return;

    // Solo ENVIADO bloquea futuras notificaciones.
    // PRUEBA_INTERNA, SIMULADO o ERROR no bloquean.
    if (estado === "ENVIADO") {
      mapa[clave] = {
        clave: clave,
        aptoNorm: aptoNorm,
        fechaHora: row[idxFecha],
        email: row[idxEmailDestino],
        estado: estado
      };
    }
  });

  return mapa;
}

const TRIGGERS_OPERATIVOS_SANCIONES = [
  {
    funcion: "enviarCorreosResumenSanciones",
    descripcion: "1. Enviar notificaciones de sanciones",
    hora: 6,
    minuto: 0
  },
  {
    funcion: "prepararResumenNotificacionesDebidoProceso",
    descripcion: "2. Generar resumen de notificaciones de debido proceso",
    hora: 10,
    minuto: 0
  },
  {
    funcion: "enviarNotificacionesDebidoProceso",
    descripcion: "3. Enviar notificaciones de debido proceso",
    hora: 11,
    minuto: 0
  }
];

function reinstalarTriggersOperativosSanciones() {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(30000)) {
    throw new Error("No se pudo obtener bloqueo. Intenta nuevamente en unos segundos.");
  }

  try {
    Logger.log("=== REINSTALANDO TRIGGERS OPERATIVOS SANCIONES ===");

    const eliminados = borrarTriggersOperativosSanciones_();
    Logger.log("Triggers eliminados: " + eliminados);

    let creados = 0;

    TRIGGERS_OPERATIVOS_SANCIONES.forEach(function (config) {
      crearTriggerDiarioOperativo_(config);
      creados++;

      Logger.log(
        "Trigger creado: " +
        config.descripcion +
        " | Función: " +
        config.funcion +
        " | Hora aprox: " +
        formatoHoraTrigger_(config.hora, config.minuto)
      );
    });

    Logger.log("Triggers creados: " + creados);
    Logger.log("=== FIN REINSTALACIÓN TRIGGERS ===");

  } finally {
    lock.releaseLock();
  }
}

function borrarTriggersOperativosSanciones_() {
  const funcionesOperativas = TRIGGERS_OPERATIVOS_SANCIONES.map(function (config) {
    return config.funcion;
  });

  const triggers = ScriptApp.getProjectTriggers();
  let eliminados = 0;

  triggers.forEach(function (trigger) {
    const funcion = trigger.getHandlerFunction();

    if (funcionesOperativas.indexOf(funcion) !== -1) {
      ScriptApp.deleteTrigger(trigger);
      eliminados++;

      Logger.log("Trigger eliminado para función: " + funcion);
    }
  });

  return eliminados;
}

function crearTriggerDiarioOperativo_(config) {
  ScriptApp.newTrigger(config.funcion)
    .timeBased()
    .everyDays(1)
    .atHour(config.hora)
    .nearMinute(config.minuto)
    .create();
}

function listarTriggersOperativosSanciones() {
  const funcionesOperativas = TRIGGERS_OPERATIVOS_SANCIONES.map(function (config) {
    return config.funcion;
  });

  const triggers = ScriptApp.getProjectTriggers();

  Logger.log("=== TRIGGERS OPERATIVOS ACTUALES ===");

  triggers.forEach(function (trigger) {
    const funcion = trigger.getHandlerFunction();

    if (funcionesOperativas.indexOf(funcion) !== -1) {
      Logger.log(
        "Función: " +
        funcion +
        " | Tipo evento: " +
        trigger.getEventType() +
        " | Fuente: " +
        trigger.getTriggerSource()
      );
    }
  });

  Logger.log("Total triggers del proyecto: " + triggers.length);
}

function formatoHoraTrigger_(hora, minuto) {
  return String(hora).padStart(2, "0") + ":" + String(minuto).padStart(2, "0");
}

function leerMapaConsultasOkSancionesPorPlaca_(ss) {
  const sheet = ss.getSheetByName(SHEET_LOG_CONSULTAS_SANCIONES);
  const mapa = {};

  if (!sheet) {
    Logger.log("No existe hoja de log de consultas: " + SHEET_LOG_CONSULTAS_SANCIONES);
    return mapa;
  }

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow < 2) {
    return mapa;
  }

  const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();

  const headers = data[0].map(function (h) {
    return normalizeHeader_(h);
  });

  const colMap = {};
  headers.forEach(function (h, i) {
    colMap[h] = i;
  });

  const idxFecha = colMap["fechahora"];
  const idxAptoNorm = colMap["apartamentonormalizado"];
  const idxPlacaNorm = colMap["placanormalizada"];
  const idxResultado = colMap["resultado"];

  if (
    idxAptoNorm === undefined ||
    idxPlacaNorm === undefined ||
    idxResultado === undefined
  ) {
    throw new Error("El log de consultas no tiene las columnas requeridas.");
  }

  data.slice(1).forEach(function (row) {
    const resultado = safeTrim_(row[idxResultado]).toUpperCase();

    // Solo usamos consultas exitosas.
    if (resultado !== "OK") return;

    const placa = normalizePlaca_(row[idxPlacaNorm]);
    const aptoNorm = normalizeApto_(row[idxAptoNorm]);

    if (!placa || !aptoNorm) return;

    if (!mapa[placa]) {
      mapa[placa] = {
        placa: placa,
        totalConsultasOk: 0,
        aptos: {},
        aptoMayor: "",
        cantidadMayor: 0,
        porcentajeMayor: 0,
        ultimaFecha: ""
      };
    }

    if (!mapa[placa].aptos[aptoNorm]) {
      mapa[placa].aptos[aptoNorm] = {
        aptoNorm: aptoNorm,
        cantidad: 0,
        ultimaFecha: ""
      };
    }

    mapa[placa].totalConsultasOk++;
    mapa[placa].aptos[aptoNorm].cantidad++;

    const fecha = idxFecha !== undefined ? safeTrim_(row[idxFecha]) : "";

    if (fecha) {
      mapa[placa].aptos[aptoNorm].ultimaFecha = fecha;
      mapa[placa].ultimaFecha = fecha;
    }
  });

  Object.keys(mapa).forEach(function (placa) {
    const item = mapa[placa];

    Object.keys(item.aptos).forEach(function (aptoNorm) {
      const aptoItem = item.aptos[aptoNorm];

      if (aptoItem.cantidad > item.cantidadMayor) {
        item.aptoMayor = aptoNorm;
        item.cantidadMayor = aptoItem.cantidad;
      }
    });

    item.porcentajeMayor = item.totalConsultasOk > 0
      ? item.cantidadMayor / item.totalConsultasOk
      : 0;
  });

  return mapa;
}

function revisarMaestraContraLogConsultasSancionesDryRun() {
  const ss = SpreadsheetApp.openById(SHEET_ID_SANCIONES);
  const hojaMaestra = getOrCreateHojaMaestra_(ss);

  revisarMaestraContraLogConsultasSanciones_(ss, hojaMaestra, false);
}

function revisarMaestraContraLogConsultasSancionesAplicar() {
  const ss = SpreadsheetApp.openById(SHEET_ID_SANCIONES);
  const hojaMaestra = getOrCreateHojaMaestra_(ss);

  revisarMaestraContraLogConsultasSanciones_(ss, hojaMaestra, true);
}

function revisarMaestraContraLogConsultasSanciones_(ss, hojaMaestra, aplicarCambios) {
  const lastRow = hojaMaestra.getLastRow();

  if (lastRow < 2) {
    Logger.log("La hoja maestra no tiene registros.");
    return {
      conflictos: 0,
      revisados: 0
    };
  }

  const mapaConsultas = leerMapaConsultasOkSancionesPorPlaca_(ss);

  const range = hojaMaestra.getRange(2, 1, lastRow - 1, 9);
  const values = range.getValues();

  const now = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    "yyyy-MM-dd HH:mm"
  );

  let revisados = 0;
  let conflictos = 0;
  const filasConflicto = [];

  values.forEach(function (row, index) {
    const sheetRow = index + 2;

    const placa = normalizePlaca_(row[0]);
    const aptoMaestra = safeTrim_(row[1]);
    const aptoNormMaestra = normalizeApto_(aptoMaestra);

    if (!placa || !aptoNormMaestra) return;

    revisados++;

    const infoConsulta = mapaConsultas[placa];

    if (!infoConsulta) return;

    if (infoConsulta.totalConsultasOk < MIN_CONSULTAS_OK_PARA_ALERTA_MAESTRA) {
      return;
    }

    const aptoReportadoConsulta = infoConsulta.aptoMayor;

    if (!aptoReportadoConsulta) return;

    // Si coincide, no se toca la maestra.
    if (aptoReportadoConsulta === aptoNormMaestra) {
      return;
    }

    conflictos++;

    const confianzaAnterior = Number(row[3]) || 1;
    const nuevaConfianza = Math.min(
      confianzaAnterior,
      CONFIANZA_MAX_CONFLICTO_CONSULTA
    );

    const notaConflicto =
      "[" + now + "] Conflicto con consulta web. " +
      "Maestra indica apto " + aptoNormMaestra +
      ", pero consulta(s) OK del residente reportan apto " + aptoReportadoConsulta +
      " para la placa " + placa +
      ". Dato requiere verificación manual antes de corrección automática.";

    Logger.log(
      "CONFLICTO MAESTRA VS CONSULTA | Placa: " + placa +
      " | Maestra apto: " + aptoNormMaestra +
      " | Consulta apto: " + aptoReportadoConsulta +
      " | Confianza anterior: " + confianzaAnterior +
      " | Nueva confianza: " + nuevaConfianza +
      " | Total consultas OK: " + infoConsulta.totalConsultasOk
    );

    if (aplicarCambios) {
      row[3] = nuevaConfianza; // ConfianzaApto
      row[6] = now;            // FechaActualizacion
      row[7] = ESTADO_MAESTRA_REQUIERE_VERIFICACION; // Estado
      row[8] = safeTrim_(row[8])
        ? safeTrim_(row[8]) + " | " + notaConflicto
        : notaConflicto;

      filasConflicto.push(sheetRow);
    }
  });

  if (aplicarCambios) {
    range.setValues(values);

    filasConflicto.forEach(function (rowNumber) {
      hojaMaestra
        .getRange(rowNumber, 1, 1, 9)
        .setBackground("#fff2cc");
    });
  }

  Logger.log("=== REVISIÓN MAESTRA VS CONSULTAS WEB ===");
  Logger.log("Registros maestra revisados: " + revisados);
  Logger.log("Conflictos detectados: " + conflictos);
  Logger.log("Aplicar cambios: " + aplicarCambios);

  return {
    conflictos: conflictos,
    revisados: revisados
  };
}

function maestraEsConfiableParaCorreccion_(master) {
  if (!master) return false;

  const estado = safeTrim_(master.estado).toUpperCase();
  const confianza = Number(master.confianzaApto) || 0;

  if (estado.indexOf("REQUIERE_VERIFICACION") !== -1) {
    return false;
  }

  if (confianza < UMBRAL_MAYORIA) {
    return false;
  }

  return true;
}