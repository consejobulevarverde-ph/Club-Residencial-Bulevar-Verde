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
const FOLDER_ID_SANCIONES_HISTORICAS = '1dHYZmOK0Oji3JhfDph8HB5pEQ68bX6IA';
const REGEX_NOMBRE_SANCIONES_HISTORICAS = /^(\d{4})(0[1-9]|1[0-2])\s+sanciones$/i;

// Carpeta original de Dorchester que contiene las evidencias de AppSheet.
// generarImagenes() no copia, no mueve y no cambia permisos de estos archivos.
// Para que las URLs funcionen sin iniciar sesion, Dorchester debe compartir
// esta carpeta como "Cualquier persona con el enlace - Lector".
const FOLDER_ID_IMAGENES_SANCIONES_ORIGEN =
  '1b_zgJSBztapVhY38ZdyoGwzkMsNjriQO';
const GENERAR_IMAGENES_FILAS_MAXIMAS_POR_EJECUCION = 500;
const GENERAR_IMAGENES_CHECKPOINT_FILAS = 50;
const GENERAR_IMAGENES_TIEMPO_MAX_MS = 4.5 * 60 * 1000;
const GENERAR_IMAGENES_MARGEN_CORTE_MS = 15 * 1000;
const GENERAR_IMAGENES_TRIGGER_MS = 30 * 1000;
const GENERAR_IMAGENES_MAX_ERRORES_CONSECUTIVOS = 5;
const GENERAR_IMAGENES_GUARDAR_NOTAS = false;
const GENERAR_IMAGENES_INDICE_VERSION = '4_REFERENCIAS_PLANILLA';
const SHEET_INDICE_IMAGENES_SANCIONES = '_indice_imagenes_sanciones';
const TEXTO_ENLACE_IMAGEN_SANCION = 'Full size';
const PROP_GENERAR_IMAGENES_ESTADO = 'SANCIONES_IMAGENES_ESTADO';
const PROP_GENERAR_IMAGENES_SIGUIENTE_FILA =
  'SANCIONES_IMAGENES_SIGUIENTE_FILA';
const PROP_GENERAR_IMAGENES_RESUMEN = 'SANCIONES_IMAGENES_RESUMEN';
const PROP_GENERAR_IMAGENES_TEXTO_REPARADO =
  'SANCIONES_IMAGENES_TEXTO_REPARADO';
const PROP_GENERAR_IMAGENES_ERRORES_CONSECUTIVOS =
  'SANCIONES_IMAGENES_ERRORES_CONSECUTIVOS';
const PROP_GENERAR_IMAGENES_INDICE_VERSION =
  'SANCIONES_IMAGENES_INDICE_VERSION';
const PROP_GENERAR_IMAGENES_INDICE_ACTUALIZADO =
  'SANCIONES_IMAGENES_INDICE_ACTUALIZADO';
const PROP_PREPARAR_INDICE_ESTADO =
  'SANCIONES_IMAGENES_PREPARAR_INDICE_ESTADO';
const PROP_PREPARAR_INDICE_TOKEN =
  'SANCIONES_IMAGENES_PREPARAR_INDICE_TOKEN';
const PROP_PREPARAR_INDICE_ARCHIVOS_REVISADOS =
  'SANCIONES_IMAGENES_PREPARAR_INDICE_ARCHIVOS_REVISADOS';
const PROP_PREPARAR_INDICE_ARCHIVOS_VALIDOS =
  'SANCIONES_IMAGENES_PREPARAR_INDICE_ARCHIVOS_VALIDOS';
const PROP_PREPARAR_INDICE_ARCHIVOS_NECESARIOS =
  'SANCIONES_IMAGENES_PREPARAR_INDICE_ARCHIVOS_NECESARIOS';
const PROP_PREPARAR_INDICE_ARCHIVOS_PENDIENTES =
  'SANCIONES_IMAGENES_PREPARAR_INDICE_ARCHIVOS_PENDIENTES';
const PROP_PREPARAR_INDICE_ARCHIVOS_OMITIDOS =
  'SANCIONES_IMAGENES_PREPARAR_INDICE_ARCHIVOS_OMITIDOS';
const PROP_PREPARAR_INDICE_REFERENCIAS_INVALIDAS =
  'SANCIONES_IMAGENES_PREPARAR_INDICE_REFERENCIAS_INVALIDAS';
const PROP_PREPARAR_INDICE_CELDAS_YA_PUBLICAS =
  'SANCIONES_IMAGENES_PREPARAR_INDICE_CELDAS_YA_PUBLICAS';
const PROP_PREPARAR_INDICE_INICIADO =
  'SANCIONES_IMAGENES_PREPARAR_INDICE_INICIADO';
const PROP_PREPARAR_INDICE_ACTUALIZADO =
  'SANCIONES_IMAGENES_PREPARAR_INDICE_ACTUALIZADO';
const PREPARAR_INDICE_ARCHIVOS_MAXIMOS_POR_EJECUCION = 3000;
const PREPARAR_INDICE_TIEMPO_MAX_MS = 4 * 60 * 1000;
const PREPARAR_INDICE_MARGEN_CORTE_MS = 20 * 1000;
const PREPARAR_INDICE_LOG_CADA_ARCHIVOS = 500;
const PREPARAR_INDICE_TRIGGER_MS = 30 * 1000;
const FUNCION_TRIGGER_GENERAR_IMAGENES = 'continuarGeneracionImagenes_';
const FUNCION_TRIGGER_PREPARAR_INDICE =
  'continuarPreparacionIndiceImagenesSanciones_';

// Cache por ejecucion para recuperar URLs cuando una celda conserva el texto
// "Full size" pero perdio el hipervinculo enriquecido.
let CACHE_URLS_IMAGENES_SANCIONES_POR_REGISTRO_TIPO_ = null;

// Catálogo de respaldo para que la consulta histórica funcione incluso
// cuando el proyecto todavía no tenga autorizado DriveApp.
// La detección automática desde la carpeta se conserva y complementa
// este catálogo cuando el alcance drive.readonly ya está autorizado.
const CATALOGO_SANCIONES_HISTORICAS = [
  {
    periodo: '202606',
    spreadsheetId: '1R-GRVKOGq-GHln_emWM7EjSg421Z3hiF5qo0-Q_MfN8',
    fileName: '202606 sanciones'
  },
  {
    periodo: '202604',
    spreadsheetId: '1OB5W2eD7lIMNXD0Vjh2qrUBFJYJPwBMwFoxivAjGXjI',
    fileName: '202604 sanciones'
  }
];
const SHEET_ID_VIGILANCIA_PLACAS = '1_Lwp2jYRuYjJu_PiXGOibD5TjfPf9jQ_pBO9kio7AZY';
const SHEET_NOMBRE_VIGILANCIA_PLACAS = "REGISTRO VEHICULAR";
const SHEET_GID_VIGILANCIA_PLACAS = 931924058;
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
  const periodoConsultado = getParam_(e, 'periodo') || '';

  try {
    Logger.log('=== CONSULTA WEB APP SANCIONES ===');
    Logger.log('Action: ' + action);
    Logger.log('Apto consultado: ' + aptoConsultado);
    Logger.log('Placa consultada: ' + placaConsultada);
    Logger.log('Periodo consultado: ' + periodoConsultado);
    Logger.log('Parámetros completos: ' + JSON.stringify(e && e.parameter ? e.parameter : {}));

    if (action === 'listarPeriodosHistoricos') {
      return jsonOutput_({
        ok: true,
        periodos: listarPeriodosHistoricos_()
      });
    }

    if (action === 'consultar') {
      return consultarSanciones_(
        aptoConsultado,
        placaConsultada,
        e,
        {
          action: 'consultar',
          historico: false,
          soloLectura: false,
          spreadsheetId: SHEET_ID_SANCIONES,
          periodo: '',
          periodoLabel: ''
        }
      );
    }

    if (action === 'consultarHistorico') {
      const fuenteHistorica = resolverFuenteHistoricaSanciones_(periodoConsultado);

      return consultarSanciones_(
        aptoConsultado,
        placaConsultada,
        e,
        {
          action: 'consultarHistorico',
          historico: true,
          soloLectura: true,
          spreadsheetId: fuenteHistorica.spreadsheetId,
          periodo: fuenteHistorica.periodo,
          periodoLabel: fuenteHistorica.label
        }
      );
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
 * ARCHIVO HISTÓRICO DE SANCIONES
 *
 * Los archivos deben estar dentro de:
 * FOLDER_ID_SANCIONES_HISTORICAS
 *
 * Convención de nombre:
 * YYYYMM sanciones
 * Ejemplo: 202606 sanciones
 ***************************************/
function listarPeriodosHistoricos_() {
  return listarFuentesHistoricasSanciones_().map(function (fuente) {
    return {
      periodo: fuente.periodo,
      label: fuente.label
    };
  });
}

function resolverFuenteHistoricaSanciones_(periodoInput) {
  const periodo = safeTrim_(periodoInput);

  if (!/^\d{6}$/.test(periodo)) {
    throw new Error('El periodo histórico no tiene un formato válido.');
  }

  const mes = Number(periodo.substring(4, 6));

  if (mes < 1 || mes > 12) {
    throw new Error('El periodo histórico contiene un mes inválido.');
  }

  const fuentes = listarFuentesHistoricasSanciones_();
  const encontrada = fuentes.find(function (fuente) {
    return fuente.periodo === periodo;
  });

  if (!encontrada) {
    throw new Error(
      'No se encontró un archivo histórico de sanciones para ' +
      formatearPeriodoSanciones_(periodo) +
      '.'
    );
  }

  return encontrada;
}

function listarFuentesHistoricasSanciones_() {
  const periodoActual = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    'yyyyMM'
  );

  const mapaPorPeriodo = {};

  // 1. Cargar primero el catálogo de respaldo.
  CATALOGO_SANCIONES_HISTORICAS.forEach(function (item) {
    const periodo = safeTrim_(item.periodo);
    const spreadsheetId = safeTrim_(item.spreadsheetId);

    if (!/^\d{6}$/.test(periodo) || !spreadsheetId) {
      Logger.log(
        'Registro histórico de respaldo inválido: ' +
        JSON.stringify(item)
      );
      return;
    }

    // Solo exponer meses cerrados.
    if (periodo >= periodoActual) {
      return;
    }

    mapaPorPeriodo[periodo] = {
      periodo: periodo,
      label: formatearPeriodoSanciones_(periodo),
      spreadsheetId: spreadsheetId,
      fileName: safeTrim_(item.fileName) || periodo + ' sanciones',
      lastUpdated: 0,
      fuente: 'CATALOGO_RESPALDO'
    };
  });

  // 2. Intentar complementar el catálogo leyendo automáticamente la carpeta.
  // DriveApp siempre requiere autorización OAuth, aunque la carpeta tenga
  // acceso público por vínculo. Si todavía no está autorizado, se conserva
  // el catálogo de respaldo sin interrumpir la consulta del portal.
  try {
    const folder = DriveApp.getFolderById(FOLDER_ID_SANCIONES_HISTORICAS);
    const files = folder.getFilesByType(MimeType.GOOGLE_SHEETS);

    while (files.hasNext()) {
      const file = files.next();
      const nombre = safeTrim_(file.getName());
      const match = nombre.match(REGEX_NOMBRE_SANCIONES_HISTORICAS);

      if (!match) {
        continue;
      }

      const periodo = match[1] + match[2];

      if (periodo >= periodoActual) {
        continue;
      }

      const fuente = {
        periodo: periodo,
        label: formatearPeriodoSanciones_(periodo),
        spreadsheetId: file.getId(),
        fileName: nombre,
        lastUpdated: file.getLastUpdated().getTime(),
        fuente: 'CARPETA_DRIVE'
      };

      // La fuente encontrada directamente en Drive reemplaza el respaldo.
      if (
        !mapaPorPeriodo[periodo] ||
        mapaPorPeriodo[periodo].fuente === 'CATALOGO_RESPALDO' ||
        fuente.lastUpdated > mapaPorPeriodo[periodo].lastUpdated
      ) {
        mapaPorPeriodo[periodo] = fuente;
      }
    }
  } catch (error) {
    Logger.log(
      'ADVERTENCIA: no fue posible leer automáticamente la carpeta de ' +
      'sanciones históricas con DriveApp. Se usará el catálogo de respaldo. ' +
      'Detalle: ' + (error.message || String(error))
    );
  }

  return Object.keys(mapaPorPeriodo)
    .map(function (periodo) {
      return mapaPorPeriodo[periodo];
    })
    .sort(function (a, b) {
      return b.periodo.localeCompare(a.periodo);
    });
}

/**
 * Ejecutar manualmente una vez desde el editor de Apps Script.
 * Fuerza la solicitud del permiso de solo lectura de Google Drive y
 * valida que la carpeta histórica sea visible para la cuenta ejecutora.
 */
function autorizarLecturaSancionesHistoricas() {
  const folder = DriveApp.getFolderById(FOLDER_ID_SANCIONES_HISTORICAS);
  const periodos = listarPeriodosHistoricos_();

  Logger.log('Carpeta histórica autorizada: ' + folder.getName());
  Logger.log('Periodos detectados: ' + JSON.stringify(periodos));

  return periodos;
}

function formatearPeriodoSanciones_(periodoInput) {
  const periodo = safeTrim_(periodoInput);

  if (!/^\d{6}$/.test(periodo)) {
    return periodo;
  }

  const meses = [
    'Enero', 'Febrero', 'Marzo', 'Abril',
    'Mayo', 'Junio', 'Julio', 'Agosto',
    'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  const anio = periodo.substring(0, 4);
  const mesIndex = Number(periodo.substring(4, 6)) - 1;

  if (mesIndex < 0 || mesIndex >= meses.length) {
    return periodo;
  }

  return meses[mesIndex] + ' ' + anio;
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
function consultarSanciones_(aptoInput, placaInput, e, options) {
  const opts = options || {};
  const actionConsulta = opts.action || "consultar";
  const esHistorico = opts.historico === true;
  if (!aptoInput || !placaInput) {
    registrarConsultaSanciones_({
      action: actionConsulta,
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
      allowMissingSheet: true,
      spreadsheetId: opts.spreadsheetId || SHEET_ID_SANCIONES
    });

    const sheet = contextoPlanilla.sheet;

    if (!sheet) {
      registrarConsultaSanciones_({
        action: actionConsulta,
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
        action: actionConsulta,
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

      return jsonOutput_({
        ok: true,
        apto: apto,
        sanciones: [],
        historico: esHistorico,
        periodo: opts.periodo || "",
        periodoLabel: opts.periodoLabel || ""
      });
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
        action: actionConsulta,
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
        action: actionConsulta,
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
        action: actionConsulta,
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


    let correccionesInteligentes = [];

    if (!opts.soloLectura) {
      correccionesInteligentes = analizarInconsistenciasSancionesDesdeResultado_(
        sheet,
        registrosNormalizados,
        sanciones,
        IDX,
        aptoNorm,
        placa
      );

      Logger.log("Correcciones inteligentes detectadas después de obtener sanciones:");
      Logger.log(JSON.stringify(correccionesInteligentes, null, 2));
    } else {
      Logger.log(
        "Consulta histórica en modo solo lectura. " +
        "No se ejecutan correcciones inteligentes sobre el archivo archivado."
      );
    }


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
      action: actionConsulta,
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

    return jsonOutput_({
      ok: true,
      apto: apto,
      sanciones: sanciones,
      historico: esHistorico,
      periodo: opts.periodo || "",
      periodoLabel: opts.periodoLabel || ""
    });

  } catch (error) {
    registrarConsultaSanciones_({
      action: actionConsulta,
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

function getCellUrlOrText_(
  richData,
  allData,
  rowIndex,
  colIndex,
  expectedRecordId,
  expectedMediaType
) {
  const rawValue = getCellValueSafe_(allData, rowIndex, colIndex);
  const rich = getRichTextValueSafe_(richData, rowIndex, colIndex);
  const linkedUrl = rich ? safeTrim_(rich.getLinkUrl()) : "";

  if (!linkedUrl) {
    // Compatibilidad: algunas escrituras externas o posteriores pueden
    // conservar el texto "Full size" y eliminar el RichText. En ese caso
    // recuperamos la URL permanente desde el indice usando ID + FOTO/FIRMA.
    if (rawValue === TEXTO_ENLACE_IMAGEN_SANCION) {
      const recoveredUrl = obtenerUrlImagenSancionDesdeIndice_(
        expectedRecordId,
        expectedMediaType
      );

      if (recoveredUrl) {
        return recoveredUrl;
      }
    }

    return rawValue;
  }

  // Las URLs permanentes generadas por este script no incluyen el nombre del
  // archivo en la ruta. Se reconocen por el proveedor, el parametro id y el
  // texto controlado "Full size" almacenado en la celda.
  if (
    esUrlPublicaPermanenteImagenSancion_(linkedUrl) &&
    (rawValue === TEXTO_ENLACE_IMAGEN_SANCION ||
      esUrlPublicaPermanenteImagenSancion_(rawValue))
  ) {
    return linkedUrl;
  }

  const validation = validarEnlaceMediaRegistro_({
    url: linkedUrl,
    rawValue: rawValue,
    expectedRecordId: expectedRecordId,
    expectedMediaType: expectedMediaType
  });

  if (validation.ok) {
    return linkedUrl;
  }

  Logger.log(
    [
      "ENLACE DE EVIDENCIA DESCARTADO",
      "Fila: " + (rowIndex + 1),
      "Columna: " + (colIndex + 1),
      "ID esperado: " + safeTrim_(expectedRecordId),
      "Tipo esperado: " + safeTrim_(expectedMediaType),
      "Ruta de la celda: " + rawValue,
      "Archivo del enlace: " + validation.linkedFileName,
      "Motivo: " + validation.reason
    ].join(" | ")
  );

  // La ruta escrita en la celda pertenece al registro de esa fila.
  // Es preferible devolverla y no mostrar una imagen antes que entregar
  // un hipervínculo firmado correspondiente a otro registro.
  return rawValue;
}

function getCellValueSafe_(allData, rowIndex, colIndex) {
  if (
    !allData ||
    !allData[rowIndex] ||
    colIndex < 0 ||
    colIndex >= allData[rowIndex].length
  ) {
    return "";
  }

  return safeTrim_(allData[rowIndex][colIndex]);
}

function getRichTextValueSafe_(richData, rowIndex, colIndex) {
  if (
    !richData ||
    !richData[rowIndex] ||
    colIndex < 0 ||
    colIndex >= richData[rowIndex].length
  ) {
    return null;
  }

  return richData[rowIndex][colIndex] || null;
}

function validarEnlaceMediaRegistro_(params) {
  const url = safeTrim_(params && params.url);
  const rawValue = normalizarRutaMedia_(params && params.rawValue);
  const expectedRecordId = safeTrim_(
    params && params.expectedRecordId
  ).toLowerCase();
  const expectedMediaType = safeTrim_(
    params && params.expectedMediaType
  ).toUpperCase();

  const linkedFileName = extraerNombreArchivoMediaDesdeUrl_(url);
  const linkedPath = normalizarRutaMedia_(linkedFileName);
  const linkedBaseName = obtenerBaseNameMedia_(linkedPath).toLowerCase();
  const rawBaseName = obtenerBaseNameMedia_(rawValue).toLowerCase();

  if (!url) {
    return {
      ok: false,
      linkedFileName: "",
      reason: "El hipervínculo está vacío."
    };
  }

  if (!linkedBaseName) {
    return {
      ok: false,
      linkedFileName: linkedFileName,
      reason: "No se pudo identificar el archivo del hipervínculo."
    };
  }

  if (
    expectedRecordId &&
    linkedBaseName.indexOf(expectedRecordId + ".") !== 0
  ) {
    return {
      ok: false,
      linkedFileName: linkedFileName,
      reason:
        'El archivo enlazado no pertenece al ID "' +
        expectedRecordId +
        '".'
    };
  }

  if (
    expectedMediaType &&
    linkedBaseName.indexOf(
      "." + expectedMediaType.toLowerCase() + "."
    ) === -1
  ) {
    return {
      ok: false,
      linkedFileName: linkedFileName,
      reason:
        'El archivo enlazado no corresponde al tipo "' +
        expectedMediaType +
        '".'
    };
  }

  // Cuando la celda conserva la ruta real de AppSheet, el nombre del
  // archivo debe coincidir exactamente con el fileName del hipervínculo.
  if (
    rawBaseName &&
    esRutaArchivoMedia_(rawValue) &&
    rawBaseName !== linkedBaseName
  ) {
    return {
      ok: false,
      linkedFileName: linkedFileName,
      reason:
        'El archivo del hipervínculo "' +
        linkedBaseName +
        '" no coincide con la ruta de la celda "' +
        rawBaseName +
        '".'
    };
  }

  return {
    ok: true,
    linkedFileName: linkedFileName,
    reason: ""
  };
}

function extraerNombreArchivoMediaDesdeUrl_(url) {
  const value = safeTrim_(url);

  if (!value) return "";

  const match = value.match(/[?&]fileName=([^&#]+)/i);

  if (match && match[1]) {
    try {
      return decodeURIComponent(match[1].replace(/\+/g, "%20"));
    } catch (error) {
      Logger.log(
        "No fue posible decodificar fileName del enlace de evidencia: " +
        (error.message || String(error))
      );
      return match[1];
    }
  }

  // También admite URLs directas de Drive u otros proveedores.
  const withoutQuery = value.split("?")[0].split("#")[0];
  return withoutQuery.substring(withoutQuery.lastIndexOf("/") + 1);
}

function normalizarRutaMedia_(value) {
  return safeTrim_(value)
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/");
}

function obtenerBaseNameMedia_(value) {
  const normalized = normalizarRutaMedia_(value);

  if (!normalized) return "";

  const parts = normalized.split("/");
  return safeTrim_(parts[parts.length - 1]);
}

function esRutaArchivoMedia_(value) {
  const baseName = obtenerBaseNameMedia_(value);

  return /\.(?:jpe?g|png|gif|webp|heic|pdf)$/i.test(baseName);
}

/***************************************
 * ENLAZAR EVIDENCIAS ORIGINALES DE DORCHESTER
 *
 * Ejecutar una vez antes del proceso masivo:
 *   prepararIndiceImagenesSanciones()
 *
 * Luego ejecutar:
 *   generarImagenes()
 *
 * El proceso no crea copias. Construye URLs permanentes usando directamente
 * el ID de cada archivo original de Dorchester y guarda en FOTO/FIRMA el texto
 * visible "Full size" con el hipervinculo correspondiente.
 *
 * Requisito: la carpeta original debe estar compartida por Dorchester como
 * "Cualquier persona con el enlace - Lector". Una firma del Consejo no puede
 * convertir por si sola un archivo privado de Drive en un archivo publico.
 *
 * Optimizaciones:
 * 1. Solo se indexan los nombres FOTO/FIRMA realmente usados por PLANILLA.
 * 2. El recorrido de Drive se detiene apenas encuentra todas las referencias.
 * 3. Durante generarImagenes() no se llama a Drive por cada FOTO/FIRMA.
 * 4. Cada ejecucion procesa hasta 500 filas y guarda checkpoints cada 50.
 * 5. No se escriben notas nuevas, reduciendo operaciones sobre Sheets.
 ***************************************/
function generarImagenes() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  let reparacionTexto = null;
  let estadoSinTrabajo = null;

  try {
    const props = PropertiesService.getScriptProperties();
    const ss = SpreadsheetApp.openById(SHEET_ID_SANCIONES);
    const sheet = ss.getSheetByName(SHEET_PLANILLA);

    if (!sheet) {
      throw new Error('No se encontro la hoja "' + SHEET_PLANILLA + '".');
    }

    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const IDX = obtenerIdxPlanilla_(headers);

    validarColumnasGenerarImagenes_(IDX);
    validarCarpetaOrigenImagenesPublica_();

    const estadoActual = safeTrim_(
      props.getProperty(PROP_GENERAR_IMAGENES_ESTADO)
    );
    const siguienteFilaGuardada = Number(
      props.getProperty(PROP_GENERAR_IMAGENES_SIGUIENTE_FILA) || 2
    );

    if (!estadoActual || estadoActual === "NO_INICIADO") {
      eliminarTriggersGenerarImagenes_();
      props.setProperty(PROP_GENERAR_IMAGENES_ESTADO, "EN_PROCESO");
      props.setProperty(PROP_GENERAR_IMAGENES_SIGUIENTE_FILA, "2");
      props.setProperty(PROP_GENERAR_IMAGENES_ERRORES_CONSECUTIVOS, "0");
      props.setProperty(
        PROP_GENERAR_IMAGENES_RESUMEN,
        JSON.stringify(crearResumenInicialGeneracionImagenes_())
      );
    } else if (estadoActual === "ERROR") {
      // Retoma desde la fila guardada; no reinicia desde el principio.
      props.setProperty(PROP_GENERAR_IMAGENES_ESTADO, "EN_PROCESO");
      props.setProperty(PROP_GENERAR_IMAGENES_ERRORES_CONSECUTIVOS, "0");
    } else if (
      estadoActual === "COMPLETADO" &&
      siguienteFilaGuardada > sheet.getLastRow()
    ) {
      estadoSinTrabajo = obtenerEstadoGeneracionImagenes();
    } else if (estadoActual === "COMPLETADO") {
      // Existen filas nuevas despues de una ejecucion completada.
      props.setProperty(PROP_GENERAR_IMAGENES_ESTADO, "EN_PROCESO");
    }

    // Repara automaticamente las URLs que una version anterior escribio como
    // texto completo. No vuelve a copiar archivos.
    if (
      safeTrim_(props.getProperty(PROP_GENERAR_IMAGENES_TEXTO_REPARADO)) !==
      TEXTO_ENLACE_IMAGEN_SANCION
    ) {
      reparacionTexto = normalizarTextoUrlsPublicasGeneradas_(sheet, IDX);
      props.setProperty(
        PROP_GENERAR_IMAGENES_TEXTO_REPARADO,
        TEXTO_ENLACE_IMAGEN_SANCION
      );
    }
  } finally {
    lock.releaseLock();
  }

  if (estadoSinTrabajo) {
    if (reparacionTexto) {
      estadoSinTrabajo.reparacionTexto = reparacionTexto;
    }
    return estadoSinTrabajo;
  }

  const resultado = procesarLoteGeneracionImagenes_();

  if (reparacionTexto) {
    resultado.reparacionTexto = reparacionTexto;
  }

  return resultado;
}

function continuarGeneracionImagenes_() {
  try {
    return procesarLoteGeneracionImagenes_();
  } catch (error) {
    const props = PropertiesService.getScriptProperties();
    const resumen = leerResumenGeneracionImagenes_();
    const erroresConsecutivos =
      Number(
        props.getProperty(PROP_GENERAR_IMAGENES_ERRORES_CONSECUTIVOS) || 0
      ) + 1;
    const detalleError = error && error.stack
      ? error.stack
      : String(error);

    resumen.erroresEjecucion = Number(resumen.erroresEjecucion || 0) + 1;
    resumen.ultimoErrorEjecucion = detalleError.substring(0, 1500);
    resumen.actualizado = new Date().toISOString();

    props.setProperty(
      PROP_GENERAR_IMAGENES_ERRORES_CONSECUTIVOS,
      String(erroresConsecutivos)
    );
    props.setProperty(
      PROP_GENERAR_IMAGENES_RESUMEN,
      JSON.stringify(resumen)
    );

    if (
      erroresConsecutivos >= GENERAR_IMAGENES_MAX_ERRORES_CONSECUTIVOS
    ) {
      props.setProperty(PROP_GENERAR_IMAGENES_ESTADO, "ERROR");
      eliminarTriggersGenerarImagenes_();
    } else {
      props.setProperty(PROP_GENERAR_IMAGENES_ESTADO, "EN_PROCESO");
      programarSiguienteLoteGenerarImagenes_();
    }

    logGeneracionImagenes_("ERROR de ejecucion", {
      erroresConsecutivos: erroresConsecutivos,
      detalle: detalleError.substring(0, 1500)
    });

    return obtenerEstadoGeneracionImagenes();
  }
}

function procesarLoteGeneracionImagenes_() {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(30000)) {
    programarSiguienteLoteGenerarImagenes_();

    return {
      ok: true,
      estado: "EN_PROCESO",
      mensaje: "Ya existe otro lote de imagenes en ejecucion."
    };
  }

  const inicioMs = Date.now();

  try {
    const props = PropertiesService.getScriptProperties();
    const estado = safeTrim_(props.getProperty(PROP_GENERAR_IMAGENES_ESTADO));

    if (estado !== "EN_PROCESO") {
      return obtenerEstadoGeneracionImagenes();
    }

    programarSiguienteLoteGenerarImagenes_();

    const ss = SpreadsheetApp.openById(SHEET_ID_SANCIONES);
    const sheet = ss.getSheetByName(SHEET_PLANILLA);

    if (!sheet) {
      throw new Error('No se encontro la hoja "' + SHEET_PLANILLA + '".');
    }

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const IDX = obtenerIdxPlanilla_(headers);

    validarColumnasGenerarImagenes_(IDX);

    let nextRow = Number(
      props.getProperty(PROP_GENERAR_IMAGENES_SIGUIENTE_FILA) || 2
    );

    if (!Number.isFinite(nextRow) || nextRow < 2) {
      nextRow = 2;
    }

    if (nextRow > lastRow) {
      return completarGeneracionImagenes_(sheet, lastRow);
    }

    const indicePreparado = asegurarIndiceImagenesSanciones_(ss);
    const indiceArchivos = indicePreparado.mapa;
    const sourceFolder = indicePreparado.folder;

    const maxEndRow = Math.min(
      lastRow,
      nextRow + GENERAR_IMAGENES_FILAS_MAXIMAS_POR_EJECUCION - 1
    );
    const rowCount = maxEndRow - nextRow + 1;

    const ids = sheet
      .getRange(nextRow, IDX.id + 1, rowCount, 1)
      .getDisplayValues();
    const fotoRange = sheet.getRange(nextRow, IDX.foto + 1, rowCount, 1);
    const firmaRange = sheet.getRange(nextRow, IDX.firma + 1, rowCount, 1);
    const fotoValues = fotoRange.getDisplayValues();
    const firmaValues = firmaRange.getDisplayValues();
    const fotoRich = fotoRange.getRichTextValues();
    const firmaRich = firmaRange.getRichTextValues();

    const resumen = leerResumenGeneracionImagenes_();
    let procesadasEnEjecucion = 0;
    let inicioCheckpoint = 0;

    logGeneracionImagenes_("Inicio de ejecucion sin copias", {
      filaInicial: nextRow,
      filaMaximaLeida: maxEndRow,
      ultimaFila: lastRow,
      archivosIndexados: indicePreparado.origenes,
      carpetaOrigen: sourceFolder.getName()
    });

    for (let i = 0; i < rowCount; i++) {
      const tiempoConsumido = Date.now() - inicioMs;

      if (
        procesadasEnEjecucion > 0 &&
        tiempoConsumido >= GENERAR_IMAGENES_TIEMPO_MAX_MS
      ) {
        break;
      }

      const sheetRow = nextRow + i;
      const recordId = safeTrim_(ids[i][0]);

      const fotoResult = convertirCampoImagenSancionOrigenDirecto_(
        {
          recordId: recordId,
          mediaType: "FOTO",
          rawValue: fotoValues[i][0],
          richText: fotoRich[i][0],
          sheetRow: sheetRow
        },
        indiceArchivos
      );

      const firmaResult = convertirCampoImagenSancionOrigenDirecto_(
        {
          recordId: recordId,
          mediaType: "FIRMA",
          rawValue: firmaValues[i][0],
          richText: firmaRich[i][0],
          sheetRow: sheetRow
        },
        indiceArchivos
      );

      fotoRich[i][0] = fotoResult.richText;
      firmaRich[i][0] = firmaResult.richText;

      acumularResultadoGenerarImagenes_(resumen, fotoResult.status);
      acumularResultadoGenerarImagenes_(resumen, firmaResult.status);
      resumen.filasProcesadas += 1;
      procesadasEnEjecucion += 1;

      const esCheckpoint =
        procesadasEnEjecucion % GENERAR_IMAGENES_CHECKPOINT_FILAS === 0;
      const esUltimaLeida = i === rowCount - 1;
      const cercaDelLimite =
        Date.now() - inicioMs >=
        GENERAR_IMAGENES_TIEMPO_MAX_MS - GENERAR_IMAGENES_MARGEN_CORTE_MS;

      if (esCheckpoint || esUltimaLeida || cercaDelLimite) {
        const finCheckpoint = i;
        const siguienteFila = nextRow + finCheckpoint + 1;

        guardarCheckpointGeneracionImagenes_({
          props: props,
          resumen: resumen,
          fotoRange: fotoRange,
          firmaRange: firmaRange,
          fotoRich: fotoRich,
          firmaRich: firmaRich,
          inicioOffset: inicioCheckpoint,
          finOffset: finCheckpoint,
          siguienteFila: siguienteFila
        });

        logGeneracionImagenes_("Checkpoint guardado", {
          filaProcesadaHasta: siguienteFila - 1,
          siguienteFila: siguienteFila,
          filasEnEjecucion: procesadasEnEjecucion,
          segundosConsumidos: Math.round((Date.now() - inicioMs) / 100) / 10,
          urlsGeneradas: resumen.urlsGeneradas,
          urlsYaPublicas: resumen.urlsYaPublicas,
          archivosNoEncontrados: resumen.archivosNoEncontrados
        });

        inicioCheckpoint = i + 1;
      }

      if (cercaDelLimite) {
        break;
      }
    }

    const siguienteFila = nextRow + procesadasEnEjecucion;

    if (siguienteFila > lastRow) {
      return completarGeneracionImagenes_(sheet, lastRow);
    }

    programarSiguienteLoteGenerarImagenes_();

    const result = construirEstadoGeneracionImagenes_(
      "EN_PROCESO",
      siguienteFila,
      lastRow,
      resumen,
      sourceFolder
    );

    result.filasProcesadasEnEjecucion = procesadasEnEjecucion;
    result.duracionSegundos =
      Math.round((Date.now() - inicioMs) / 100) / 10;
    result.indiceTecnico = indicePreparado.nombreHoja;
    return result;
  } finally {
    lock.releaseLock();
  }
}


function guardarCheckpointGeneracionImagenes_(params) {
  const cantidad = params.finOffset - params.inicioOffset + 1;

  if (cantidad <= 0) return;

  params.fotoRange
    .offset(params.inicioOffset, 0, cantidad, 1)
    .setRichTextValues(
      params.fotoRich.slice(
        params.inicioOffset,
        params.finOffset + 1
      )
    );
  params.firmaRange
    .offset(params.inicioOffset, 0, cantidad, 1)
    .setRichTextValues(
      params.firmaRich.slice(
        params.inicioOffset,
        params.finOffset + 1
      )
    );

  params.resumen.actualizado = new Date().toISOString();
  params.props.setProperty(
    PROP_GENERAR_IMAGENES_SIGUIENTE_FILA,
    String(params.siguienteFila)
  );
  params.props.setProperty(
    PROP_GENERAR_IMAGENES_RESUMEN,
    JSON.stringify(params.resumen)
  );
  params.props.setProperty(PROP_GENERAR_IMAGENES_ERRORES_CONSECUTIVOS, "0");
}


function construirClaveRegistroTipoImagenSancion_(recordId, mediaType) {
  const id = safeTrim_(recordId).toLowerCase();
  const tipo = safeTrim_(mediaType).toUpperCase();

  return id && tipo ? id + "|" + tipo : "";
}

function extraerRegistroTipoDesdeNombreImagenSancion_(fileName) {
  const baseName = obtenerBaseNameMedia_(fileName);
  const match = baseName.match(/^([^.]+)\.(FOTO|FIRMA)\./i);

  if (!match) return null;

  return {
    recordId: safeTrim_(match[1]),
    mediaType: safeTrim_(match[2]).toUpperCase()
  };
}

function obtenerMapaUrlsImagenesSancionesPorRegistroTipo_() {
  if (CACHE_URLS_IMAGENES_SANCIONES_POR_REGISTRO_TIPO_) {
    return CACHE_URLS_IMAGENES_SANCIONES_POR_REGISTRO_TIPO_;
  }

  const mapa = {};
  const ss = SpreadsheetApp.openById(SHEET_ID_SANCIONES);
  const sheet = ss.getSheetByName(SHEET_INDICE_IMAGENES_SANCIONES);

  if (!sheet || sheet.getLastRow() < 2) {
    CACHE_URLS_IMAGENES_SANCIONES_POR_REGISTRO_TIPO_ = mapa;
    return mapa;
  }

  const values = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, 4)
    .getDisplayValues();

  values.forEach(function (row) {
    const info = extraerRegistroTipoDesdeNombreImagenSancion_(row[0]);
    const publicUrl = safeTrim_(row[3]);

    if (!info || !esUrlPublicaPermanenteImagenSancion_(publicUrl)) return;

    const key = construirClaveRegistroTipoImagenSancion_(
      info.recordId,
      info.mediaType
    );

    if (key && !mapa[key]) {
      mapa[key] = publicUrl;
    }
  });

  CACHE_URLS_IMAGENES_SANCIONES_POR_REGISTRO_TIPO_ = mapa;
  return mapa;
}

function obtenerUrlImagenSancionDesdeIndice_(recordId, mediaType) {
  const key = construirClaveRegistroTipoImagenSancion_(recordId, mediaType);

  if (!key) return "";

  return safeTrim_(
    obtenerMapaUrlsImagenesSancionesPorRegistroTipo_()[key]
  );
}

function convertirCampoImagenSancionOrigenDirecto_(params, indiceArchivos) {
  const rawValue = safeTrim_(params && params.rawValue);
  const linkedUrl = params && params.richText
    ? safeTrim_(params.richText.getLinkUrl())
    : "";

  if (!rawValue && !linkedUrl) {
    return construirResultadoCampoImagen_("", "", "VACIO");
  }

  const existingPublicUrl = esUrlPublicaPermanenteImagenSancion_(rawValue)
    ? rawValue
    : esUrlPublicaPermanenteImagenSancion_(linkedUrl)
      ? linkedUrl
      : "";

  if (existingPublicUrl) {
    return construirResultadoCampoImagen_(
      existingPublicUrl,
      "",
      "YA_PUBLICA"
    );
  }

  // Si la celda contiene solo "Full size" y perdio el enlace, no existe
  // nombre de archivo para validar. Recuperamos la entrada por ID + tipo.
  if (rawValue === TEXTO_ENLACE_IMAGEN_SANCION && !linkedUrl) {
    const aliasKey =
      "@REGISTRO_TIPO:" +
      construirClaveRegistroTipoImagenSancion_(
        params.recordId,
        params.mediaType
      );
    const recoveredEntry = indiceArchivos[aliasKey];

    if (
      recoveredEntry &&
      recoveredEntry.sourceId &&
      recoveredEntry.publicUrl
    ) {
      return construirResultadoCampoImagen_(
        recoveredEntry.publicUrl,
        "",
        "GENERADA"
      );
    }
  }

  const fileName = resolverNombreArchivoParaPublicar_(rawValue, linkedUrl);
  const validation = validarNombreArchivoParaPublicar_(
    fileName,
    params.recordId,
    params.mediaType
  );

  if (!validation.ok) {
    logGeneracionImagenes_("Imagen omitida por nombre invalido", {
      fila: params.sheetRow,
      id: safeTrim_(params.recordId),
      tipo: safeTrim_(params.mediaType),
      valor: rawValue,
      motivo: validation.reason
    });

    return construirResultadoCampoImagenPlano_(
      rawValue,
      "",
      "NOMBRE_INVALIDO"
    );
  }

  const entry = indiceArchivos[validation.fileName];

  if (!entry || !entry.sourceId || !entry.publicUrl) {
    logGeneracionImagenes_("Archivo original no encontrado en el indice", {
      fila: params.sheetRow,
      archivo: validation.fileName
    });

    return construirResultadoCampoImagenPlano_(
      rawValue,
      "",
      "NO_ENCONTRADO"
    );
  }

  return construirResultadoCampoImagen_(
    entry.publicUrl,
    "",
    "GENERADA"
  );
}


function construirResultadoCampoImagen_(url, note, status) {
  const publicUrl = safeTrim_(url);

  return {
    url: publicUrl,
    richText: crearRichTextEnlaceImagenSancion_(publicUrl),
    note: safeTrim_(note),
    status: status
  };
}

function construirResultadoCampoImagenPlano_(value, note, status) {
  return {
    url: "",
    richText: crearRichTextPlanoImagenSancion_(value),
    note: safeTrim_(note),
    status: status
  };
}

function crearRichTextEnlaceImagenSancion_(url) {
  const publicUrl = safeTrim_(url);

  if (!publicUrl) {
    return crearRichTextPlanoImagenSancion_("");
  }

  return SpreadsheetApp
    .newRichTextValue()
    .setText(TEXTO_ENLACE_IMAGEN_SANCION)
    .setLinkUrl(publicUrl)
    .build();
}

function crearRichTextPlanoImagenSancion_(value) {
  return SpreadsheetApp
    .newRichTextValue()
    .setText(safeTrim_(value))
    .build();
}

function normalizarTextoUrlsPublicasGeneradas_(sheet, IDX) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return {
      ok: true,
      celdasActualizadas: 0,
      textoVisible: TEXTO_ENLACE_IMAGEN_SANCION
    };
  }

  const rowCount = lastRow - 1;
  const ids = sheet
    .getRange(2, IDX.id + 1, rowCount, 1)
    .getDisplayValues();
  const mapaUrls = obtenerMapaUrlsImagenesSancionesPorRegistroTipo_();
  const columnConfigs = [
    { columnIndex: IDX.foto, mediaType: "FOTO" },
    { columnIndex: IDX.firma, mediaType: "FIRMA" }
  ];
  let updatedCells = 0;

  columnConfigs.forEach(function (config) {
    const columnIndex = config.columnIndex;
    const range = sheet.getRange(2, columnIndex + 1, rowCount, 1);
    const displayValues = range.getDisplayValues();
    const richValues = range.getRichTextValues();
    let changed = false;

    for (let i = 0; i < rowCount; i++) {
      const rawValue = safeTrim_(displayValues[i][0]);
      const currentRich = richValues[i][0];
      const linkedUrl = currentRich
        ? safeTrim_(currentRich.getLinkUrl())
        : "";
      let publicUrl = esUrlPublicaPermanenteImagenSancion_(rawValue)
        ? rawValue
        : esUrlPublicaPermanenteImagenSancion_(linkedUrl)
          ? linkedUrl
          : "";

      if (
        !publicUrl &&
        rawValue === TEXTO_ENLACE_IMAGEN_SANCION
      ) {
        const key = construirClaveRegistroTipoImagenSancion_(
          ids[i][0],
          config.mediaType
        );
        publicUrl = safeTrim_(mapaUrls[key]);
      }

      if (!publicUrl) continue;

      if (
        currentRich &&
        safeTrim_(currentRich.getText()) === TEXTO_ENLACE_IMAGEN_SANCION &&
        linkedUrl === publicUrl
      ) {
        continue;
      }

      richValues[i][0] = crearRichTextEnlaceImagenSancion_(publicUrl);
      updatedCells += 1;
      changed = true;
    }

    if (changed) {
      range.setRichTextValues(richValues);
    }
  });

  SpreadsheetApp.flush();

  return {
    ok: true,
    celdasActualizadas: updatedCells,
    textoVisible: TEXTO_ENLACE_IMAGEN_SANCION
  };
}

function repararTextoVisualizacionImagenes() {
  const ss = SpreadsheetApp.openById(SHEET_ID_SANCIONES);
  const sheet = ss.getSheetByName(SHEET_PLANILLA);

  if (!sheet) {
    throw new Error('No se encontro la hoja "' + SHEET_PLANILLA + '".');
  }

  const headers = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0];
  const IDX = obtenerIdxPlanilla_(headers);

  validarColumnasGenerarImagenes_(IDX);

  const result = normalizarTextoUrlsPublicasGeneradas_(sheet, IDX);
  PropertiesService.getScriptProperties().setProperty(
    PROP_GENERAR_IMAGENES_TEXTO_REPARADO,
    TEXTO_ENLACE_IMAGEN_SANCION
  );

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function resolverNombreArchivoParaPublicar_(rawValue, linkedUrl) {
  const candidates = [safeTrim_(rawValue), safeTrim_(linkedUrl)];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (!candidate) continue;

    const extracted = extraerNombreArchivoMediaDesdeUrl_(candidate);
    const baseName = obtenerBaseNameMedia_(extracted || candidate);

    if (esRutaArchivoMedia_(baseName)) {
      return baseName;
    }
  }

  return "";
}

function validarNombreArchivoParaPublicar_(fileName, recordId, mediaType) {
  const normalizedFileName = obtenerBaseNameMedia_(fileName);
  const lowerFileName = normalizedFileName.toLowerCase();
  const expectedId = safeTrim_(recordId).toLowerCase();
  const expectedType = safeTrim_(mediaType).toLowerCase();

  if (!normalizedFileName || !esRutaArchivoMedia_(normalizedFileName)) {
    return {
      ok: false,
      fileName: normalizedFileName,
      reason: "No se identifico un nombre de archivo de imagen valido."
    };
  }

  if (!expectedId) {
    return {
      ok: false,
      fileName: normalizedFileName,
      reason: "La fila no tiene ID de sancion."
    };
  }

  if (lowerFileName.indexOf(expectedId + ".") !== 0) {
    return {
      ok: false,
      fileName: normalizedFileName,
      reason: 'El archivo no pertenece al ID "' + expectedId + '".'
    };
  }

  if (lowerFileName.indexOf("." + expectedType + ".") === -1) {
    return {
      ok: false,
      fileName: normalizedFileName,
      reason: 'El archivo no corresponde al tipo "' + mediaType + '".'
    };
  }

  return {
    ok: true,
    fileName: normalizedFileName,
    reason: ""
  };
}

function getHeadersIndiceImagenesSanciones_() {
  return [
    "Archivo",
    "OrigenFileId",
    "ResourceKey",
    "PublicUrl",
    "Actualizado"
  ];
}

function getOrCreateHojaIndiceImagenesSanciones_(ss) {
  let sheet = ss.getSheetByName(SHEET_INDICE_IMAGENES_SANCIONES);
  const headers = getHeadersIndiceImagenesSanciones_();

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_INDICE_IMAGENES_SANCIONES);
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);

  try {
    sheet.hideSheet();
  } catch (error) {
    // No interrumpe el proceso si la hoja no puede ocultarse.
  }

  return sheet;
}

/**
 * Obtiene exclusivamente los nombres FOTO/FIRMA que la PLANILLA necesita.
 * Las celdas que ya contienen una URL permanente se excluyen del indice.
 */
function obtenerArchivosNecesariosImagenesSanciones_(ss) {
  const sheet = ss.getSheetByName(SHEET_PLANILLA);

  if (!sheet) {
    throw new Error('No se encontro la hoja "' + SHEET_PLANILLA + '".');
  }

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const resultado = {
    mapa: {},
    total: 0,
    referenciasTotales: 0,
    referenciasDuplicadas: 0,
    referenciasInvalidas: 0,
    celdasVacias: 0,
    celdasYaPublicas: 0
  };

  if (lastRow < 2 || lastCol < 1) {
    return resultado;
  }

  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const IDX = obtenerIdxPlanilla_(headers);
  validarColumnasGenerarImagenes_(IDX);

  const rowCount = lastRow - 1;
  const ids = sheet
    .getRange(2, IDX.id + 1, rowCount, 1)
    .getDisplayValues();
  const fotoRange = sheet.getRange(2, IDX.foto + 1, rowCount, 1);
  const firmaRange = sheet.getRange(2, IDX.firma + 1, rowCount, 1);
  const fotoValues = fotoRange.getDisplayValues();
  const firmaValues = firmaRange.getDisplayValues();
  const fotoRich = fotoRange.getRichTextValues();
  const firmaRich = firmaRange.getRichTextValues();

  for (let i = 0; i < rowCount; i++) {
    const recordId = safeTrim_(ids[i][0]);

    registrarArchivoNecesarioImagenSancion_(resultado, {
      recordId: recordId,
      mediaType: 'FOTO',
      rawValue: fotoValues[i][0],
      richText: fotoRich[i][0]
    });

    registrarArchivoNecesarioImagenSancion_(resultado, {
      recordId: recordId,
      mediaType: 'FIRMA',
      rawValue: firmaValues[i][0],
      richText: firmaRich[i][0]
    });
  }

  resultado.total = Object.keys(resultado.mapa).length;
  return resultado;
}

function registrarArchivoNecesarioImagenSancion_(resultado, params) {
  const rawValue = safeTrim_(params && params.rawValue);
  const linkedUrl = params && params.richText
    ? safeTrim_(params.richText.getLinkUrl())
    : '';

  if (!rawValue && !linkedUrl) {
    resultado.celdasVacias += 1;
    return;
  }

  resultado.referenciasTotales += 1;

  if (
    esUrlPublicaPermanenteImagenSancion_(rawValue) ||
    esUrlPublicaPermanenteImagenSancion_(linkedUrl)
  ) {
    resultado.celdasYaPublicas += 1;
    return;
  }

  const fileName = resolverNombreArchivoParaPublicar_(rawValue, linkedUrl);
  const validation = validarNombreArchivoParaPublicar_(
    fileName,
    params.recordId,
    params.mediaType
  );

  if (!validation.ok) {
    resultado.referenciasInvalidas += 1;
    return;
  }

  if (resultado.mapa[validation.fileName]) {
    resultado.referenciasDuplicadas += 1;
    return;
  }

  resultado.mapa[validation.fileName] = true;
}

function cargarNombresIndexadosImagenesSanciones_(indexSheet) {
  const mapa = {};
  const lastRow = indexSheet.getLastRow();

  if (lastRow < 2) {
    return mapa;
  }

  const values = indexSheet
    .getRange(2, 1, lastRow - 1, 1)
    .getDisplayValues();

  values.forEach(function (row) {
    const fileName = safeTrim_(row[0]);
    if (fileName) mapa[fileName] = true;
  });

  return mapa;
}

function construirMapaPendientesIndiceImagenesSanciones_(
  archivosNecesarios,
  archivosIndexados
) {
  const pendientes = {};

  Object.keys(archivosNecesarios).forEach(function (fileName) {
    if (!archivosIndexados[fileName]) {
      pendientes[fileName] = true;
    }
  });

  return pendientes;
}

function prepararIndiceImagenesSanciones() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const props = PropertiesService.getScriptProperties();
    const ss = SpreadsheetApp.openById(SHEET_ID_SANCIONES);
    const indexSheet = getOrCreateHojaIndiceImagenesSanciones_(ss);
    const sourceFolder = validarCarpetaOrigenImagenesPublica_();
    const necesarios = obtenerArchivosNecesariosImagenesSanciones_(ss);
    const headers = getHeadersIndiceImagenesSanciones_();
    const now = new Date().toISOString();

    eliminarTriggersPrepararIndiceImagenesSanciones_();
    eliminarTriggersGenerarImagenes_();

    indexSheet.clearContents();
    indexSheet.getRange(1, 1, 1, headers.length).setValues([headers]);

    props.deleteProperty(PROP_GENERAR_IMAGENES_INDICE_VERSION);
    props.deleteProperty(PROP_GENERAR_IMAGENES_INDICE_ACTUALIZADO);
    props.deleteProperty(PROP_PREPARAR_INDICE_TOKEN);
    props.setProperty(PROP_PREPARAR_INDICE_ESTADO, 'EN_PROCESO');
    props.setProperty(PROP_PREPARAR_INDICE_ARCHIVOS_REVISADOS, '0');
    props.setProperty(PROP_PREPARAR_INDICE_ARCHIVOS_VALIDOS, '0');
    props.setProperty(
      PROP_PREPARAR_INDICE_ARCHIVOS_NECESARIOS,
      String(necesarios.total)
    );
    props.setProperty(
      PROP_PREPARAR_INDICE_ARCHIVOS_PENDIENTES,
      String(necesarios.total)
    );
    props.setProperty(PROP_PREPARAR_INDICE_ARCHIVOS_OMITIDOS, '0');
    props.setProperty(
      PROP_PREPARAR_INDICE_REFERENCIAS_INVALIDAS,
      String(necesarios.referenciasInvalidas)
    );
    props.setProperty(
      PROP_PREPARAR_INDICE_CELDAS_YA_PUBLICAS,
      String(necesarios.celdasYaPublicas)
    );
    props.setProperty(PROP_PREPARAR_INDICE_INICIADO, now);
    props.setProperty(PROP_PREPARAR_INDICE_ACTUALIZADO, now);

    logGeneracionImagenes_('Indice filtrado inicializado por lotes', {
      carpetaOrigen: sourceFolder.getName(),
      carpetaId: sourceFolder.getId(),
      archivosNecesarios: necesarios.total,
      referenciasTotales: necesarios.referenciasTotales,
      referenciasDuplicadas: necesarios.referenciasDuplicadas,
      referenciasInvalidas: necesarios.referenciasInvalidas,
      celdasYaPublicas: necesarios.celdasYaPublicas,
      celdasVacias: necesarios.celdasVacias,
      archivosMaximosPorEjecucion:
        PREPARAR_INDICE_ARCHIVOS_MAXIMOS_POR_EJECUCION,
      tiempoMaximoSegundos: PREPARAR_INDICE_TIEMPO_MAX_MS / 1000
    });

    if (necesarios.total === 0) {
      completarPreparacionIndiceImagenesSanciones_(props, now, 0);
    }
  } finally {
    lock.releaseLock();
  }

  const estado = obtenerEstadoPreparacionIndiceImagenesSanciones();

  if (estado.estado === 'COMPLETADO') {
    return estado;
  }

  return procesarLoteIndiceImagenesSanciones_();
}

function continuarPreparacionIndiceImagenesSanciones_() {
  return procesarLoteIndiceImagenesSanciones_();
}

function reanudarPreparacionIndiceImagenesSanciones() {
  const props = PropertiesService.getScriptProperties();
  const token = safeTrim_(props.getProperty(PROP_PREPARAR_INDICE_TOKEN));

  if (!token) {
    return prepararIndiceImagenesSanciones();
  }

  props.setProperty(PROP_PREPARAR_INDICE_ESTADO, 'EN_PROCESO');
  return procesarLoteIndiceImagenesSanciones_();
}

function refrescarIndiceImagenesSanciones() {
  return prepararIndiceImagenesSanciones();
}

function reconstruirIndiceImagenesSanciones_() {
  return prepararIndiceImagenesSanciones();
}

function procesarLoteIndiceImagenesSanciones_() {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(30000)) {
    programarSiguienteLotePrepararIndiceImagenesSanciones_();
    return obtenerEstadoPreparacionIndiceImagenesSanciones();
  }

  const inicioMs = Date.now();

  try {
    const props = PropertiesService.getScriptProperties();
    const estado = safeTrim_(
      props.getProperty(PROP_PREPARAR_INDICE_ESTADO)
    );

    if (estado !== 'EN_PROCESO') {
      return obtenerEstadoPreparacionIndiceImagenesSanciones();
    }

    // Se programa antes de empezar para conservar la cadena si Drive tarda.
    programarSiguienteLotePrepararIndiceImagenesSanciones_();

    const ss = SpreadsheetApp.openById(SHEET_ID_SANCIONES);
    const indexSheet = getOrCreateHojaIndiceImagenesSanciones_(ss);
    const sourceFolder = validarCarpetaOrigenImagenesPublica_();
    const necesarios = obtenerArchivosNecesariosImagenesSanciones_(ss);
    const indexados = cargarNombresIndexadosImagenesSanciones_(indexSheet);
    const pendientes = construirMapaPendientesIndiceImagenesSanciones_(
      necesarios.mapa,
      indexados
    );
    let pendientesRestantes = Object.keys(pendientes).length;

    props.setProperty(
      PROP_PREPARAR_INDICE_ARCHIVOS_NECESARIOS,
      String(necesarios.total)
    );
    props.setProperty(
      PROP_PREPARAR_INDICE_ARCHIVOS_PENDIENTES,
      String(pendientesRestantes)
    );
    props.setProperty(
      PROP_PREPARAR_INDICE_REFERENCIAS_INVALIDAS,
      String(necesarios.referenciasInvalidas)
    );
    props.setProperty(
      PROP_PREPARAR_INDICE_CELDAS_YA_PUBLICAS,
      String(necesarios.celdasYaPublicas)
    );

    if (pendientesRestantes === 0) {
      const updatedSinPendientes = new Date().toISOString();
      completarPreparacionIndiceImagenesSanciones_(
        props,
        updatedSinPendientes,
        0
      );
      const terminado = obtenerEstadoPreparacionIndiceImagenesSanciones();
      terminado.finalizacionAnticipada = true;
      logGeneracionImagenes_(
        'Indice completado: todas las referencias ya estaban encontradas',
        terminado
      );
      return terminado;
    }

    const continuationToken = safeTrim_(
      props.getProperty(PROP_PREPARAR_INDICE_TOKEN)
    );
    const iterator = continuationToken
      ? DriveApp.continueFileIterator(continuationToken)
      : sourceFolder.getFiles();
    const updated = new Date().toISOString();
    const rows = [];
    const nombresLote = {};
    let revisadosLote = 0;
    let validosLote = 0;
    let omitidosLote = 0;
    let duplicadosLote = 0;

    let revisadosAcumulados = Number(
      props.getProperty(PROP_PREPARAR_INDICE_ARCHIVOS_REVISADOS) || 0
    );
    let omitidosAcumulados = Number(
      props.getProperty(PROP_PREPARAR_INDICE_ARCHIVOS_OMITIDOS) || 0
    );

    logGeneracionImagenes_('Inicio de lote del indice filtrado', {
      reanudadoConToken: !!continuationToken,
      archivosNecesarios: necesarios.total,
      archivosEncontrados: Object.keys(indexados).length,
      archivosPendientes: pendientesRestantes,
      archivosRevisadosAcumulados: revisadosAcumulados,
      filasActualesIndice: Math.max(0, indexSheet.getLastRow() - 1)
    });

    while (iterator.hasNext() && pendientesRestantes > 0) {
      const tiempoConsumido = Date.now() - inicioMs;
      const cercaDelLimite =
        tiempoConsumido >=
        PREPARAR_INDICE_TIEMPO_MAX_MS - PREPARAR_INDICE_MARGEN_CORTE_MS;

      if (
        revisadosLote >= PREPARAR_INDICE_ARCHIVOS_MAXIMOS_POR_EJECUCION ||
        cercaDelLimite
      ) {
        break;
      }

      const file = iterator.next();
      revisadosLote += 1;
      const fileName = safeTrim_(file.getName());

      // Esta es la optimizacion principal: los metadatos adicionales solo se
      // consultan para nombres realmente referenciados por FOTO/FIRMA.
      if (!fileName || !pendientes[fileName]) {
        omitidosLote += 1;
        continue;
      }

      if (nombresLote[fileName]) {
        duplicadosLote += 1;
        continue;
      }

      nombresLote[fileName] = true;
      const resourceKey = safeTrim_(file.getResourceKey());
      const sourceId = file.getId();

      rows.push([
        fileName,
        sourceId,
        resourceKey,
        construirUrlPublicaPermanenteDriveDesdeDatos_(
          sourceId,
          resourceKey
        ),
        updated
      ]);
      validosLote += 1;
      delete pendientes[fileName];
      pendientesRestantes -= 1;

      if (
        revisadosLote % PREPARAR_INDICE_LOG_CADA_ARCHIVOS === 0 ||
        pendientesRestantes === 0
      ) {
        logGeneracionImagenes_('Avance del lote del indice filtrado', {
          revisadosLote: revisadosLote,
          encontradosLote: validosLote,
          omitidosLote: omitidosLote,
          archivosPendientes: pendientesRestantes,
          revisadosAcumulados: revisadosAcumulados + revisadosLote,
          segundosConsumidos:
            Math.round((Date.now() - inicioMs) / 100) / 10
        });
      }
    }

    if (rows.length > 0) {
      indexSheet
        .getRange(
          indexSheet.getLastRow() + 1,
          1,
          rows.length,
          rows[0].length
        )
        .setValues(rows);
    }

    revisadosAcumulados += revisadosLote;
    omitidosAcumulados += omitidosLote;
    const encontradosAcumulados = Math.max(0, indexSheet.getLastRow() - 1);

    props.setProperty(
      PROP_PREPARAR_INDICE_ARCHIVOS_REVISADOS,
      String(revisadosAcumulados)
    );
    props.setProperty(
      PROP_PREPARAR_INDICE_ARCHIVOS_VALIDOS,
      String(encontradosAcumulados)
    );
    props.setProperty(
      PROP_PREPARAR_INDICE_ARCHIVOS_PENDIENTES,
      String(pendientesRestantes)
    );
    props.setProperty(
      PROP_PREPARAR_INDICE_ARCHIVOS_OMITIDOS,
      String(omitidosAcumulados)
    );
    props.setProperty(PROP_PREPARAR_INDICE_ACTUALIZADO, updated);

    if (pendientesRestantes === 0) {
      completarPreparacionIndiceImagenesSanciones_(props, updated, 0);

      const result = obtenerEstadoPreparacionIndiceImagenesSanciones();
      result.archivosRevisadosEnEjecucion = revisadosLote;
      result.archivosEncontradosEnEjecucion = validosLote;
      result.archivosOmitidosEnEjecucion = omitidosLote;
      result.duplicadosEnEjecucion = duplicadosLote;
      result.finalizacionAnticipada = iterator.hasNext();
      result.duracionSegundos =
        Math.round((Date.now() - inicioMs) / 100) / 10;

      logGeneracionImagenes_(
        'Indice filtrado completado al encontrar todas las referencias',
        result
      );
      return result;
    }

    if (iterator.hasNext()) {
      const nextToken = iterator.getContinuationToken();
      props.setProperty(PROP_PREPARAR_INDICE_TOKEN, nextToken);
      props.setProperty(PROP_PREPARAR_INDICE_ESTADO, 'EN_PROCESO');
      programarSiguienteLotePrepararIndiceImagenesSanciones_();

      const result = obtenerEstadoPreparacionIndiceImagenesSanciones();
      result.archivosRevisadosEnEjecucion = revisadosLote;
      result.archivosEncontradosEnEjecucion = validosLote;
      result.archivosOmitidosEnEjecucion = omitidosLote;
      result.duplicadosEnEjecucion = duplicadosLote;
      result.duracionSegundos =
        Math.round((Date.now() - inicioMs) / 100) / 10;

      logGeneracionImagenes_('Lote de indice filtrado guardado', result);
      return result;
    }

    // Se recorrio toda la carpeta. El indice queda utilizable incluso cuando
    // faltan archivos: generarImagenes() los reportara como NO_ENCONTRADO.
    completarPreparacionIndiceImagenesSanciones_(
      props,
      updated,
      pendientesRestantes
    );

    const result = obtenerEstadoPreparacionIndiceImagenesSanciones();
    result.archivosRevisadosEnEjecucion = revisadosLote;
    result.archivosEncontradosEnEjecucion = validosLote;
    result.archivosOmitidosEnEjecucion = omitidosLote;
    result.duplicadosEnEjecucion = duplicadosLote;
    result.duracionSegundos =
      Math.round((Date.now() - inicioMs) / 100) / 10;

    logGeneracionImagenes_('Indice filtrado completado con faltantes', result);
    return result;
  } catch (error) {
    const props = PropertiesService.getScriptProperties();
    props.setProperty(PROP_PREPARAR_INDICE_ESTADO, 'ERROR');
    props.setProperty(
      PROP_PREPARAR_INDICE_ACTUALIZADO,
      new Date().toISOString()
    );
    eliminarTriggersPrepararIndiceImagenesSanciones_();

    logGeneracionImagenes_('ERROR preparando indice filtrado', {
      error: error && error.stack ? error.stack : String(error)
    });
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function completarPreparacionIndiceImagenesSanciones_(
  props,
  updated,
  pendientes
) {
  props.deleteProperty(PROP_PREPARAR_INDICE_TOKEN);
  props.setProperty(PROP_PREPARAR_INDICE_ESTADO, 'COMPLETADO');
  props.setProperty(
    PROP_PREPARAR_INDICE_ARCHIVOS_PENDIENTES,
    String(Math.max(0, Number(pendientes) || 0))
  );
  props.setProperty(
    PROP_GENERAR_IMAGENES_INDICE_VERSION,
    GENERAR_IMAGENES_INDICE_VERSION
  );
  props.setProperty(PROP_GENERAR_IMAGENES_INDICE_ACTUALIZADO, updated);
  props.setProperty(PROP_PREPARAR_INDICE_ACTUALIZADO, updated);
  eliminarTriggersPrepararIndiceImagenesSanciones_();
}

function obtenerEstadoPreparacionIndiceImagenesSanciones() {
  const props = PropertiesService.getScriptProperties();
  let filasIndice = 0;

  try {
    const sheet = SpreadsheetApp
      .openById(SHEET_ID_SANCIONES)
      .getSheetByName(SHEET_INDICE_IMAGENES_SANCIONES);
    filasIndice = sheet ? Math.max(0, sheet.getLastRow() - 1) : 0;
  } catch (error) {
    Logger.log(error.message || String(error));
  }

  const estado =
    safeTrim_(props.getProperty(PROP_PREPARAR_INDICE_ESTADO)) ||
    'NO_INICIADO';
  const necesarios = Number(
    props.getProperty(PROP_PREPARAR_INDICE_ARCHIVOS_NECESARIOS) || 0
  );
  const encontrados = Number(
    props.getProperty(PROP_PREPARAR_INDICE_ARCHIVOS_VALIDOS) || filasIndice
  );
  const pendientes = Number(
    props.getProperty(PROP_PREPARAR_INDICE_ARCHIVOS_PENDIENTES) || 0
  );
  const progreso = necesarios > 0
    ? Math.round((Math.min(necesarios, encontrados) / necesarios) * 10000) / 100
    : estado === 'COMPLETADO'
      ? 100
      : 0;

  let mensaje = 'El indice filtrado continua automaticamente por lotes.';

  if (estado === 'COMPLETADO' && pendientes === 0) {
    mensaje =
      'Se encontraron todas las FOTO/FIRMA requeridas. Ya puede ejecutar generarImagenes().';
  } else if (estado === 'COMPLETADO' && pendientes > 0) {
    mensaje =
      'Se recorrio la carpeta completa, pero faltan ' +
      pendientes +
      ' archivo(s) referenciados en PLANILLA. generarImagenes() los reportara como no encontrados.';
  } else if (estado === 'ERROR') {
    mensaje = 'La preparacion del indice filtrado termino con error.';
  }

  return {
    ok: estado !== 'ERROR',
    estado: estado,
    modo: 'ORIGEN_DIRECTO_FILTRADO_POR_PLANILLA',
    archivosNecesarios: necesarios,
    archivosEncontrados: encontrados,
    archivosPendientes: pendientes,
    progresoPorcentaje: progreso,
    archivosRevisados: Number(
      props.getProperty(PROP_PREPARAR_INDICE_ARCHIVOS_REVISADOS) || 0
    ),
    archivosOmitidosPorNoEstarEnPlanilla: Number(
      props.getProperty(PROP_PREPARAR_INDICE_ARCHIVOS_OMITIDOS) || 0
    ),
    referenciasInvalidas: Number(
      props.getProperty(PROP_PREPARAR_INDICE_REFERENCIAS_INVALIDAS) || 0
    ),
    celdasYaPublicas: Number(
      props.getProperty(PROP_PREPARAR_INDICE_CELDAS_YA_PUBLICAS) || 0
    ),
    filasIndice: filasIndice,
    iniciado: safeTrim_(
      props.getProperty(PROP_PREPARAR_INDICE_INICIADO)
    ),
    actualizado: safeTrim_(
      props.getProperty(PROP_PREPARAR_INDICE_ACTUALIZADO)
    ),
    tieneContinuacion: !!safeTrim_(
      props.getProperty(PROP_PREPARAR_INDICE_TOKEN)
    ),
    mensaje: mensaje
  };
}

function mostrarEstadoPreparacionIndiceImagenesSanciones() {
  const estado = obtenerEstadoPreparacionIndiceImagenesSanciones();
  Logger.log(JSON.stringify(estado, null, 2));
  return estado;
}

function programarSiguienteLotePrepararIndiceImagenesSanciones_() {
  eliminarTriggersPrepararIndiceImagenesSanciones_();
  ScriptApp
    .newTrigger(FUNCION_TRIGGER_PREPARAR_INDICE)
    .timeBased()
    .after(PREPARAR_INDICE_TRIGGER_MS)
    .create();
}

function eliminarTriggersPrepararIndiceImagenesSanciones_() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (
      trigger.getHandlerFunction() === FUNCION_TRIGGER_PREPARAR_INDICE
    ) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function asegurarIndiceImagenesSanciones_(ss) {
  const props = PropertiesService.getScriptProperties();
  const version = safeTrim_(
    props.getProperty(PROP_GENERAR_IMAGENES_INDICE_VERSION)
  );
  const estadoIndice = safeTrim_(
    props.getProperty(PROP_PREPARAR_INDICE_ESTADO)
  );
  const archivosNecesarios = Number(
    props.getProperty(PROP_PREPARAR_INDICE_ARCHIVOS_NECESARIOS) || 0
  );
  const sheet = ss.getSheetByName(SHEET_INDICE_IMAGENES_SANCIONES);

  if (
    version !== GENERAR_IMAGENES_INDICE_VERSION ||
    estadoIndice !== 'COMPLETADO' ||
    !sheet ||
    (archivosNecesarios > 0 && sheet.getLastRow() < 2)
  ) {
    throw new Error(
      'El indice filtrado de imagenes de Dorchester aun no esta completo. ' +
      'Ejecute prepararIndiceImagenesSanciones() una vez y espere a que ' +
      'obtenerEstadoPreparacionIndiceImagenesSanciones() indique COMPLETADO.'
    );
  }

  return cargarIndiceImagenesSanciones_(ss);
}

function cargarIndiceImagenesSanciones_(ss) {
  const sheet = getOrCreateHojaIndiceImagenesSanciones_(ss);
  const lastRow = sheet.getLastRow();
  const mapa = {};
  let origenes = 0;

  if (lastRow >= 2) {
    const values = sheet.getRange(2, 1, lastRow - 1, 5).getDisplayValues();

    values.forEach(function (row) {
      const fileName = safeTrim_(row[0]);

      if (!fileName) return;

      const sourceId = safeTrim_(row[1]);
      const resourceKey = safeTrim_(row[2]);
      const publicUrl = safeTrim_(row[3]);

      const entry = {
        fileName: fileName,
        sourceId: sourceId,
        resourceKey: resourceKey,
        publicUrl: publicUrl,
        updated: safeTrim_(row[4])
      };

      mapa[fileName] = entry;

      const info = extraerRegistroTipoDesdeNombreImagenSancion_(fileName);
      if (info) {
        const aliasKey =
          "@REGISTRO_TIPO:" +
          construirClaveRegistroTipoImagenSancion_(
            info.recordId,
            info.mediaType
          );

        if (!mapa[aliasKey]) {
          mapa[aliasKey] = entry;
        }
      }

      if (sourceId && publicUrl) origenes += 1;
    });
  }

  return {
    sheet: sheet,
    folder: validarCarpetaOrigenImagenesPublica_(),
    mapa: mapa,
    origenes: origenes,
    nombreHoja: SHEET_INDICE_IMAGENES_SANCIONES
  };
}


function validarCarpetaOrigenImagenesPublica_() {
  const folder = DriveApp.getFolderById(
    FOLDER_ID_IMAGENES_SANCIONES_ORIGEN
  );
  const access = folder.getSharingAccess();
  const esPublica =
    access === DriveApp.Access.ANYONE_WITH_LINK ||
    access === DriveApp.Access.ANYONE;

  if (!esPublica) {
    throw new Error(
      'La carpeta original de Dorchester no esta publica. ' +
      'El propietario debe configurarla como "Cualquier persona con el enlace - Lector". ' +
      'El script del Consejo no puede firmar ni publicar archivos privados de otra cuenta.'
    );
  }

  return folder;
}


function validarAccesoDirectoImagenesSanciones() {
  const folder = validarCarpetaOrigenImagenesPublica_();
  const files = folder.getFiles();
  let sample = null;

  while (files.hasNext()) {
    const file = files.next();
    if (!esRutaArchivoMedia_(file.getName())) continue;

    sample = {
      archivo: file.getName(),
      fileId: file.getId(),
      url: construirUrlPublicaPermanenteDrive_(file)
    };
    break;
  }

  const result = {
    ok: true,
    modo: "ORIGEN_DIRECTO_SIN_COPIAS",
    carpeta: folder.getName(),
    carpetaId: folder.getId(),
    muestra: sample
  };

  logGeneracionImagenes_("Acceso directo validado", result);
  return result;
}


function construirUrlPublicaPermanenteDriveDesdeDatos_(fileId, resourceKey) {
  let url =
    "https://drive.google.com/uc?export=view&id=" +
    encodeURIComponent(safeTrim_(fileId));
  const key = safeTrim_(resourceKey);

  if (key) {
    url += "&resourcekey=" + encodeURIComponent(key);
  }

  return url;
}

function construirUrlPublicaPermanenteDrive_(file) {
  return construirUrlPublicaPermanenteDriveDesdeDatos_(
    file.getId(),
    safeTrim_(file.getResourceKey())
  );
}

function esUrlPublicaPermanenteImagenSancion_(value) {
  const url = safeTrim_(value).toLowerCase();

  return (
    url.indexOf("https://drive.google.com/uc?") === 0 &&
    url.indexOf("id=") !== -1
  );
}

function construirNotaUrlPublicaImagen_(currentNote, fileName, rawValue) {
  const marker = "[URL_PUBLICA_SANCIONES]";

  if (safeTrim_(currentNote).indexOf(marker) !== -1) {
    return currentNote;
  }

  const originalValue = safeTrim_(rawValue);
  const noteLines = [
    marker,
    "Generada: " +
      Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone(),
        "yyyy-MM-dd HH:mm:ss"
      ),
    "Archivo original: " + fileName
  ];

  if (originalValue && originalValue.length <= 500) {
    noteLines.push("Valor anterior: " + originalValue);
  }

  return safeTrim_(currentNote)
    ? currentNote + "\n\n" + noteLines.join("\n")
    : noteLines.join("\n");
}

function obtenerOCrearCarpetaCopiasPublicasSanciones_() {
  throw new Error(
    "Funcion obsoleta: el proceso usa directamente la carpeta original de Dorchester y no crea copias."
  );
}


function validarColumnasGenerarImagenes_(IDX) {
  if (!IDX || IDX.id === -1 || IDX.foto === -1 || IDX.firma === -1) {
    throw new Error(
      'La hoja "' +
      SHEET_PLANILLA +
      '" debe contener las columnas ID, FOTO y FIRMA.'
    );
  }
}

function crearResumenInicialGeneracionImagenes_() {
  return {
    iniciado: new Date().toISOString(),
    actualizado: new Date().toISOString(),
    filasProcesadas: 0,
    urlsGeneradas: 0,
    urlsYaPublicas: 0,
    camposVacios: 0,
    archivosNoEncontrados: 0,
    nombresInvalidos: 0,
    errores: 0,
    erroresEjecucion: 0
  };
}

function leerResumenGeneracionImagenes_() {
  const raw = PropertiesService
    .getScriptProperties()
    .getProperty(PROP_GENERAR_IMAGENES_RESUMEN);

  if (!raw) {
    return crearResumenInicialGeneracionImagenes_();
  }

  try {
    const parsed = JSON.parse(raw);
    parsed.erroresEjecucion = Number(parsed.erroresEjecucion || 0);
    return parsed;
  } catch (error) {
    throw new Error("El resumen de generarImagenes esta corrupto.");
  }
}

function acumularResultadoGenerarImagenes_(resumen, status) {
  switch (status) {
    case "GENERADA":
      resumen.urlsGeneradas += 1;
      break;
    case "YA_PUBLICA":
      resumen.urlsYaPublicas += 1;
      break;
    case "VACIO":
      resumen.camposVacios += 1;
      break;
    case "NO_ENCONTRADO":
      resumen.archivosNoEncontrados += 1;
      break;
    case "NOMBRE_INVALIDO":
      resumen.nombresInvalidos += 1;
      break;
    case "ERROR":
      resumen.errores += 1;
      break;
  }
}

function completarGeneracionImagenes_(sheet, lastRow) {
  const props = PropertiesService.getScriptProperties();
  const resumen = leerResumenGeneracionImagenes_();
  const sourceFolder = validarCarpetaOrigenImagenesPublica_();

  resumen.actualizado = new Date().toISOString();
  resumen.finalizado = new Date().toISOString();

  props.setProperty(PROP_GENERAR_IMAGENES_ESTADO, "COMPLETADO");
  props.setProperty(
    PROP_GENERAR_IMAGENES_SIGUIENTE_FILA,
    String(lastRow + 1)
  );
  props.setProperty(
    PROP_GENERAR_IMAGENES_RESUMEN,
    JSON.stringify(resumen)
  );
  props.setProperty(PROP_GENERAR_IMAGENES_ERRORES_CONSECUTIVOS, "0");
  eliminarTriggersGenerarImagenes_();

  const result = construirEstadoGeneracionImagenes_(
    "COMPLETADO",
    lastRow + 1,
    lastRow,
    resumen,
    sourceFolder
  );

  logGeneracionImagenes_("Proceso completado sin crear copias", result);
  return result;
}


function construirEstadoGeneracionImagenes_(
  estado,
  nextRow,
  lastRow,
  resumen,
  sourceFolder
) {
  const totalFilas = Math.max(0, lastRow - 1);
  const filasHasta = Math.max(0, Math.min(totalFilas, nextRow - 2));
  const progreso = totalFilas > 0
    ? Math.round((filasHasta / totalFilas) * 10000) / 100
    : 100;

  return {
    ok: estado !== "ERROR",
    estado: estado,
    modo: "ORIGEN_DIRECTO_SIN_COPIAS",
    siguienteFila: nextRow,
    ultimaFila: lastRow,
    progresoPorcentaje: progreso,
    textoVisible: TEXTO_ENLACE_IMAGEN_SANCION,
    erroresConsecutivos: Number(
      PropertiesService
        .getScriptProperties()
        .getProperty(PROP_GENERAR_IMAGENES_ERRORES_CONSECUTIVOS) || 0
    ),
    resumen: resumen,
    carpetaOrigenDorchester: sourceFolder
      ? "https://drive.google.com/drive/folders/" + sourceFolder.getId()
      : "",
    mensaje:
      estado === "COMPLETADO"
        ? "FOTO y FIRMA apuntan directamente a los archivos originales de Dorchester."
        : "El proceso continua sin crear copias y guarda avances parciales."
  };
}


function obtenerEstadoGeneracionImagenes() {
  const props = PropertiesService.getScriptProperties();
  const estado =
    safeTrim_(props.getProperty(PROP_GENERAR_IMAGENES_ESTADO)) ||
    "NO_INICIADO";
  const nextRow = Number(
    props.getProperty(PROP_GENERAR_IMAGENES_SIGUIENTE_FILA) || 2
  );
  const resumen = leerResumenGeneracionImagenes_();
  let sourceFolder = null;

  try {
    sourceFolder = validarCarpetaOrigenImagenesPublica_();
  } catch (error) {
    Logger.log(error.message || String(error));
  }

  let lastRow = 0;
  try {
    const sheet = SpreadsheetApp
      .openById(SHEET_ID_SANCIONES)
      .getSheetByName(SHEET_PLANILLA);
    lastRow = sheet ? sheet.getLastRow() : 0;
  } catch (error) {
    Logger.log(error.message || String(error));
  }

  return construirEstadoGeneracionImagenes_(
    estado,
    nextRow,
    lastRow,
    resumen,
    sourceFolder
  );
}


function mostrarProgresoGeneracionImagenes() {
  const estado = obtenerEstadoGeneracionImagenes();
  logGeneracionImagenes_("Estado solicitado", estado);
  return estado;
}

function programarSiguienteLoteGenerarImagenes_() {
  eliminarTriggersGenerarImagenes_();
  ScriptApp
    .newTrigger(FUNCION_TRIGGER_GENERAR_IMAGENES)
    .timeBased()
    .after(GENERAR_IMAGENES_TRIGGER_MS)
    .create();
}

function eliminarTriggersGenerarImagenes_() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (
      trigger.getHandlerFunction() === FUNCION_TRIGGER_GENERAR_IMAGENES
    ) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function reiniciarGeneracionImagenes() {
  const props = PropertiesService.getScriptProperties();
  eliminarTriggersGenerarImagenes_();
  eliminarTriggersPrepararIndiceImagenesSanciones_();
  props.deleteProperty(PROP_GENERAR_IMAGENES_ESTADO);
  props.deleteProperty(PROP_GENERAR_IMAGENES_SIGUIENTE_FILA);
  props.deleteProperty(PROP_GENERAR_IMAGENES_RESUMEN);
  props.deleteProperty(PROP_GENERAR_IMAGENES_TEXTO_REPARADO);
  props.deleteProperty(PROP_GENERAR_IMAGENES_ERRORES_CONSECUTIVOS);
  props.deleteProperty(PROP_GENERAR_IMAGENES_INDICE_VERSION);
  props.deleteProperty(PROP_GENERAR_IMAGENES_INDICE_ACTUALIZADO);
  props.deleteProperty(PROP_PREPARAR_INDICE_ESTADO);
  props.deleteProperty(PROP_PREPARAR_INDICE_TOKEN);
  props.deleteProperty(PROP_PREPARAR_INDICE_ARCHIVOS_REVISADOS);
  props.deleteProperty(PROP_PREPARAR_INDICE_ARCHIVOS_VALIDOS);
  props.deleteProperty(PROP_PREPARAR_INDICE_ARCHIVOS_NECESARIOS);
  props.deleteProperty(PROP_PREPARAR_INDICE_ARCHIVOS_PENDIENTES);
  props.deleteProperty(PROP_PREPARAR_INDICE_ARCHIVOS_OMITIDOS);
  props.deleteProperty(PROP_PREPARAR_INDICE_REFERENCIAS_INVALIDAS);
  props.deleteProperty(PROP_PREPARAR_INDICE_CELDAS_YA_PUBLICAS);
  props.deleteProperty(PROP_PREPARAR_INDICE_INICIADO);
  props.deleteProperty(PROP_PREPARAR_INDICE_ACTUALIZADO);

  return {
    ok: true,
    mensaje:
      "Estado reiniciado. No se eliminan archivos ni se crean copias."
  };
}

function logGeneracionImagenes_(mensaje, data) {
  const prefix = "[GENERAR_IMAGENES] ";

  if (data === undefined) {
    Logger.log(prefix + mensaje);
    return;
  }

  let detalle;
  try {
    detalle = JSON.stringify(data);
  } catch (error) {
    detalle = String(data);
  }

  Logger.log(prefix + mensaje + " | " + detalle);
}

function leerPlanillaSanciones_(options) {
  const opts = options || {};
  const includeRichText = opts.includeRichText === true;
  const allowMissingSheet = opts.allowMissingSheet === true;

  const spreadsheetId = safeTrim_(opts.spreadsheetId) || SHEET_ID_SANCIONES;
  const ss = SpreadsheetApp.openById(spreadsheetId);
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
    IDX: IDX,
    spreadsheetId: spreadsheetId
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
    var recordId = IDX.id !== -1 ? safeTrim_(row[IDX.id]) : '';

    return {
      row: row,
      realRowIndex: realRowIndex,
      sheetRow: sheetRow,

      id: recordId,
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

      foto: IDX.foto !== -1
        ? getCellUrlOrText_(
          richData,
          allData,
          realRowIndex,
          IDX.foto,
          recordId,
          "FOTO"
        )
        : '',
      firma: IDX.firma !== -1
        ? getCellUrlOrText_(
          richData,
          allData,
          realRowIndex,
          IDX.firma,
          recordId,
          "FIRMA"
        )
        : ''
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

function getSheetByNormalizedName_(ss, expectedName) {
  const nombreEsperado = normalizeHeader_(expectedName);
  const sheets = ss.getSheets();

  for (var i = 0; i < sheets.length; i++) {
    if (normalizeHeader_(sheets[i].getName()) === nombreEsperado) {
      return sheets[i];
    }
  }

  return null;
}

function resolverHojaVigilanciaPlacas_(ss) {
  // Se busca primero por nombre porque el gid puede cambiar
  // cuando una pestaña es eliminada y creada nuevamente.
  var sheet = getSheetByNormalizedName_(
    ss,
    SHEET_NOMBRE_VIGILANCIA_PLACAS
  );

  if (sheet) {
    logResumen_(
      "Hoja de vigilancia encontrada por nombre: " +
      sheet.getName() +
      " | gid: " +
      sheet.getSheetId()
    );

    return sheet;
  }

  // Respaldo por gid.
  sheet = getSheetByGid_(ss, SHEET_GID_VIGILANCIA_PLACAS);

  if (sheet) {
    logResumen_(
      "Hoja de vigilancia encontrada por gid: " +
      sheet.getName() +
      " | gid: " +
      sheet.getSheetId()
    );

    return sheet;
  }

  const disponibles = ss.getSheets().map(function (s) {
    return s.getName() + " [gid=" + s.getSheetId() + "]";
  });

  throw new Error(
    'No se encontró la hoja de vigilancia "' +
    SHEET_NOMBRE_VIGILANCIA_PLACAS +
    '". Hojas disponibles: ' +
    disponibles.join(", ")
  );
}

function leerMapaVigilanciaPlacas_() {
  const ss = SpreadsheetApp.openById(SHEET_ID_VIGILANCIA_PLACAS);
  const sheet = resolverHojaVigilanciaPlacas_(ss);

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow < 3 || lastCol < 2) {
    Logger.log("La hoja de vigilancia no contiene datos suficientes.");
    return {};
  }

  const data = sheet
    .getRange(1, 1, lastRow, lastCol)
    .getValues();

  const estructura = detectarColumnasVigilancia_(data);
  const paresColumnas = estructura.pares;
  const headerRowIndex = estructura.headerRowIndex;

  const mapa = {};
  const conflictos = [];
  const placasConflictivas = {};

  data
    .slice(headerRowIndex + 1)
    .forEach(function (row, index) {
      const realRowIndex = headerRowIndex + 1 + index;
      const numeroFila = realRowIndex + 1;

      paresColumnas.forEach(function (par) {
        const placaRaw = row[par.placaCol];
        const aptoRaw = row[par.aptoCol];

        const placa = normalizePlaca_(placaRaw);
        const apto = safeTrim_(aptoRaw);
        const aptoNorm = normalizeApto_(apto);

        if (!placa || !apto) return;

        // Evita encabezados, textos y placas inválidas.
        if (!esPlacaColombianaBasica_(placa)) return;

        // Solo acepta un apartamento individual.
        // Valores como "602 - 2007" se dejan para revisión manual.
        if (!/^\d{2,5}$/.test(aptoNorm)) {
          logResumen_(
            "Registro vigilancia omitido por apartamento ambiguo" +
            " | Fila: " + numeroFila +
            " | Placa: " + placa +
            " | Apartamento: " + apto
          );
          return;
        }

        if (placasConflictivas[placa]) {
          return;
        }

        if (
          mapa[placa] &&
          mapa[placa].apartamentoNorm !== aptoNorm
        ) {
          conflictos.push({
            placa: placa,
            aptoExistente: mapa[placa].apartamento,
            aptoNuevo: apto,
            fila: numeroFila
          });

          delete mapa[placa];
          placasConflictivas[placa] = true;
          return;
        }

        mapa[placa] = {
          placa: placa,
          apartamento: apto,
          apartamentoNorm: aptoNorm,
          fuente: "VIGILANCIA_PLACAS",
          row: numeroFila,
          placaCol: par.placaCol + 1,
          aptoCol: par.aptoCol + 1
        };
      });
    });

  logResumen_(
    "Total placas cargadas desde vigilancia: " +
    Object.keys(mapa).length
  );

  logResumen_(
    "Total placas conflictivas omitidas: " +
    Object.keys(placasConflictivas).length
  );

  if (conflictos.length > 0) {
    logMuestra_(
      "Conflictos encontrados en vigilancia",
      conflictos,
      20
    );
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

function detectarColumnasVigilancia_(data) {
  const maxFilasEncabezado = Math.min(data.length, 10);

  for (var rowIndex = 0; rowIndex < maxFilasEncabezado; rowIndex++) {
    const headers = data[rowIndex].map(function (value) {
      return normalizeHeader_(value);
    });

    const pares = [];

    for (var colIndex = 0; colIndex < headers.length; colIndex++) {
      if (headers[colIndex] !== "placa") {
        continue;
      }

      var aptoCol = -1;

      // Normalmente APT está inmediatamente después de PLACA,
      // pero se revisan hasta dos columnas.
      for (var offset = 1; offset <= 2; offset++) {
        const posibleCol = colIndex + offset;

        if (posibleCol >= headers.length) {
          break;
        }

        if (
          headers[posibleCol] === "apt" ||
          headers[posibleCol] === "apto" ||
          headers[posibleCol] === "apartamento"
        ) {
          aptoCol = posibleCol;
          break;
        }
      }

      if (aptoCol !== -1) {
        pares.push({
          placaCol: colIndex,
          aptoCol: aptoCol
        });
      }
    }

    if (pares.length > 0) {
      logResumen_(
        "Fila de encabezados de vigilancia: " +
        (rowIndex + 1)
      );

      logResumen_(
        "Bloques PLACA/APT detectados: " +
        pares.length
      );

      logDetalle_(
        JSON.stringify(
          pares.map(function (par) {
            return {
              placaCol: columnToLetter_(par.placaCol + 1),
              aptoCol: columnToLetter_(par.aptoCol + 1)
            };
          }),
          null,
          2
        )
      );

      return {
        headerRowIndex: rowIndex,
        pares: pares
      };
    }
  }

  throw new Error(
    'No se encontraron encabezados repetidos "PLACA" y "APT" ' +
    "en las primeras 10 filas de la hoja de vigilancia."
  );
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

function reiniciarSoloGeneracionImagenes() {
  const props = PropertiesService.getScriptProperties();

  eliminarTriggersGenerarImagenes_();

  props.setProperty(
    PROP_GENERAR_IMAGENES_ESTADO,
    "EN_PROCESO"
  );

  props.setProperty(
    PROP_GENERAR_IMAGENES_SIGUIENTE_FILA,
    "2"
  );

  props.setProperty(
    PROP_GENERAR_IMAGENES_RESUMEN,
    JSON.stringify(crearResumenInicialGeneracionImagenes_())
  );

  props.setProperty(
    PROP_GENERAR_IMAGENES_ERRORES_CONSECUTIVOS,
    "0"
  );

  // Permite volver a corregir URLs completas a texto "Full size".
  props.deleteProperty(
    PROP_GENERAR_IMAGENES_TEXTO_REPARADO
  );

  const resultado = {
    ok: true,
    estado: "EN_PROCESO",
    siguienteFila: 2,
    mensaje:
      "Se reinició únicamente la generación de enlaces. " +
      "El índice de imágenes se conserva."
  };

  Logger.log(JSON.stringify(resultado, null, 2));
  return resultado;
}

function diagnosticarIndiceImagenesSanciones() {
  const props = PropertiesService.getScriptProperties();
  const ss = SpreadsheetApp.openById(SHEET_ID_SANCIONES);
  const sheet = ss.getSheetByName(SHEET_INDICE_IMAGENES_SANCIONES);

  const resultado = {
    versionEsperada: GENERAR_IMAGENES_INDICE_VERSION,
    versionGuardada: safeTrim_(
      props.getProperty(PROP_GENERAR_IMAGENES_INDICE_VERSION)
    ),
    estadoIndice: safeTrim_(
      props.getProperty(PROP_PREPARAR_INDICE_ESTADO)
    ),
    existeHojaIndice: !!sheet,
    filasIndice: sheet ? Math.max(0, sheet.getLastRow() - 1) : 0,
    valido: false
  };

  resultado.valido =
    resultado.versionGuardada === resultado.versionEsperada &&
    resultado.estadoIndice === "COMPLETADO" &&
    resultado.existeHojaIndice &&
    resultado.filasIndice > 0;

  Logger.log(JSON.stringify(resultado, null, 2));
  return resultado;
}