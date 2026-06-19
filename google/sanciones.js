/***************************************
 * CONFIGURACIÓN
 *
 * Para obtener el ID del Spreadsheet:
 * 1. Abre el archivo "sanciones" en Google Sheets
 * 2. Copia el ID de la URL:
 *    https://docs.google.com/spreadsheets/d/ESTE_ES_EL_ID/edit
 * 3. Pégalo abajo en SHEET_ID_SANCIONES
 *
 * Para desplegar como Web App:
 * 1. En el editor de Apps Script: Implementar → Nueva implementación
 * 2. Tipo: Aplicación web
 * 3. Ejecutar como: Yo
 * 4. Quién tiene acceso: Cualquier persona
 * 5. Copiar la URL y pegarla en layouts/sanciones/list.html (constante WEBAPP_URL)
 ***************************************/
const SHEET_ID_SANCIONES = '1GeJZ4Rd4-ddzE6Vi8kpq9iB2_oxuLW87UiAnbZQ6Iow';
const SHEET_PLANILLA = 'PLANILLA';
const SHEET_ID_VIGILANCIA_PLACAS = '1_Lwp2jYRuYjJu_PiXGOibD5TjfPf9jQ_pBO9kio7AZY';
const SHEET_GID_VIGILANCIA_PLACAS = 1955503575;

const DRY_RUN = false;
const UMBRAL_MAYORIA = 0.75;
const UMBRAL_OUTLIER = 0.15;
const MIN_REGISTROS_PARA_CORREGIR = 5;

/***************************************
 * WEB APP - ENDPOINT PRINCIPAL
 * GET ?action=consultar&apto=101&placa=ABC123
 ***************************************/
function doGet(e) {
  try {
    const action = getParam_(e, 'action');

    const aptoConsultado = getParam_(e, 'apto') || '';
    const placaConsultada = getParam_(e, 'placa') || '';

    Logger.log('=== CONSULTA WEB APP SANCIONES ===');
    Logger.log('Action: ' + action);
    Logger.log('Apto consultado: ' + aptoConsultado);
    Logger.log('Placa consultada: ' + placaConsultada);
    Logger.log('Parámetros completos: ' + JSON.stringify(e.parameter));

    if (action === 'consultar') {
      const apto = aptoConsultado;
      const placa = placaConsultada;
      return consultarSanciones_(apto, placa);
    }

    return jsonOutput_({ ok: false, error: 'Acción no reconocida.' });
  } catch (error) {
    Logger.log('ERROR doGet: ' + (error.message || String(error)));
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
function consultarSanciones_(aptoInput, placaInput) {
  if (!aptoInput || !placaInput) {
    return jsonOutput_({ ok: false, error: 'Parámetros requeridos: apto y placa.' });
  }

  const apto = safeTrim_(aptoInput);
  const placa = normalizePlaca_(placaInput);

  try {
    const ss = SpreadsheetApp.openById(SHEET_ID_SANCIONES);
    const sheet = ss.getSheetByName(SHEET_PLANILLA);

    if (!sheet) {
      return jsonOutput_({ ok: false, error: 'No se encontró la hoja "PLANILLA" en el archivo de sanciones.' });
    }

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();

    if (lastRow < 2 || lastCol < 1) {
      return jsonOutput_({ ok: true, apto: apto, sanciones: [] });
    }

    const allData = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    const richData = sheet.getRange(1, 1, lastRow, lastCol).getRichTextValues();
    const rawHeaders = allData[0];
    const headers = rawHeaders.map(function (h) { 
      return normalizeHeader_(h); 
    });

    // Mapa de nombre de columna → índice
    var colMap = {};
    headers.forEach(function (h, i) { colMap[h] = i; });

    // Índices de columnas clave
   var IDX = {
    id: findColIdx_(colMap, ['id']),
    fecha: findColIdx_(colMap, ['fecha']),
    vigilante: findColIdx_(colMap, ['vigilante que toma el registro', 'vigilante', 'agente']),
    tipoVehiculo: findColIdx_(colMap, ['tipo de vehiculo', 'tipo vehiculo', 'vehiculo']),
    placa: findColIdx_(colMap, ['placa']),
    apto: findColIdx_(colMap, ['apto', 'apartamento', 'apt', 'numero de apto', 'no. apto', 'nro apto']),
    residenteVisitante: findColIdx_(colMap, ['residente o visitante', 'residente', 'tipo residente', 'residente/visitante']),
    observaciones: findColIdx_(colMap, ['observaciones', 'observacion']),
    foto: findColIdx_(colMap, ['foto', 'imagen', 'fotografia']),
    firma: findColIdx_(colMap, ['firma'])
  };

  Logger.log('HEADERS NORMALIZADOS: ' + JSON.stringify(headers));
  Logger.log('IDX: ' + JSON.stringify(IDX));

    if (IDX.placa === -1) {
      return jsonOutput_({ ok: false, error: 'No se encontró la columna "placa" en la hoja PLANILLA.' });
    }

    var rows = allData.slice(1); // excluir encabezado
    var aptoNorm = normalizeText_(apto);
    var registrosNormalizados = construirRegistrosNormalizados_(rows, IDX, richData, allData);


    // Paso 1: buscar filas donde la placa coincide
    var placaRows = registrosNormalizados.filter(function (reg) {
      return reg.placaNorm === placa;
    });

    Logger.log('PLACA BUSCADA: ' + placa);
    Logger.log('TOTAL FILAS LEÍDAS: ' + rows.length);
    Logger.log('EXISTE PLACA: ' + (placaRows.length > 0));

    Logger.log('FILAS CON ESA PLACA: ' + placaRows.length);
    Logger.log('APTOS DE ESA PLACA: ' + JSON.stringify(placaRows.map(function(reg) {
      return reg.apto;
    })));

    Logger.log('APTO BUSCADO: ' + apto);
    Logger.log('APTO NORMALIZADO: ' + aptoNorm);

    if (placaRows.length === 0) {
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
    registrosFinales = registrosFinales.filter(function(reg) {
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
    return jsonOutput_({ ok: true, apto: apto, sanciones: sanciones });

  } catch (error) {
    return jsonOutput_({ ok: false, error: 'Error al acceder a los datos: ' + error.message });
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

function getCellUrlOrText_(richData, allData, rowIndex, colIndex) {
  var rich = richData[rowIndex][colIndex];

  if (rich) {
    var url = rich.getLinkUrl();
    if (url) return url;
  }

  return safeTrim_(allData[rowIndex][colIndex]);
}

/***************************************
 * TEST - Ejecutar manualmente para verificar
 ***************************************/
function testConsultarSanciones() {
  var fakeEvent = {
    parameter: {
      action: 'consultar',
      apto: '724',
      placa: 'KYL26E'
    }
  };

  var result = doGet(fakeEvent);
  Logger.log(result.getContent());
}

function testLeerVigilanciaPlacas() {
  const mapa = leerMapaVigilanciaPlacas_();

  Logger.log('Total registros vigilancia: ' + Object.keys(mapa).length);

  Logger.log(JSON.stringify(
    Object.keys(mapa).slice(0, 20).map(function(placa) {
      return mapa[placa];
    }),
    null,
    2
  ));
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

  registros.forEach(function(reg) {
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

  Object.keys(conteo).forEach(function(valor) {
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
  const match = registros.find(function(reg) {
    return reg.aptoNorm === aptoNorm;
  });

  return match ? match.apto : aptoNorm;
}

/***************************************
 * CONSTRUIR REGISTROS NORMALIZADOS
 ***************************************/
function construirRegistrosNormalizados_(rows, IDX, richData, allData) {
  return rows.map(function(row, index) {
    var realRowIndex = index + 1;
    var sheetRow = index + 2;

    return {
      row: row,
      realRowIndex: realRowIndex,
      sheetRow: sheetRow,

      id: IDX.id !== -1 ? safeTrim_(row[IDX.id]) : '',
      fecha: IDX.fecha !== -1 ? formatFecha_(row[IDX.fecha]) : '',

      apto: IDX.apto !== -1 ? safeTrim_(row[IDX.apto]) : '',
      aptoNorm: IDX.apto !== -1 ? normalizeText_(row[IDX.apto]) : '',

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
  }).filter(function(reg) {
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
  const historicoPlacaConsultada = registrosNormalizados.filter(function(reg) {
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

      historicoPlacaConsultada.forEach(function(reg) {
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

  const sancionesDelAptoConsultado = sanciones.filter(function(s) {
    return s.apartamentoNorm === aptoNormConsultado;
  });

  Logger.log("Sanciones del apto consultado dentro del resultado: " + sancionesDelAptoConsultado.length);

  if (sancionesDelAptoConsultado.length >= MIN_REGISTROS_PARA_CORREGIR) {
    const conteoPlacasResultado = contarPorCampo_(sancionesDelAptoConsultado, "placaNorm");

    Logger.log("Distribución placas en sanciones del apto consultado:");
    Logger.log(JSON.stringify(conteoPlacasResultado, null, 2));

    Object.keys(conteoPlacasResultado).forEach(function(placaNorm) {
      const cantidad = conteoPlacasResultado[placaNorm];
      const porcentaje = cantidad / sancionesDelAptoConsultado.length;

      Logger.log("Evaluando placa en resultado:");
      Logger.log("Placa: " + placaNorm);
      Logger.log("Cantidad: " + cantidad);
      Logger.log("Porcentaje: " + Math.round(porcentaje * 100) + "%");

      if (porcentaje <= UMBRAL_OUTLIER) {
        Logger.log("Placa candidata a error por baja frecuencia: " + placaNorm);

        const historicoPlaca = registrosNormalizados.filter(function(reg) {
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
              .filter(function(s) {
                return s.placaNorm === placaNorm;
              })
              .forEach(function(s) {
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
    const historicoConTipo = historicoPlacaConsultada.filter(function(reg) {
      return reg.tipoVehiculoNorm;
    });

    const conteoTipos = contarPorCampo_(historicoConTipo, "tipoVehiculoNorm");
    const mayoriaTipo = obtenerMayoria_(conteoTipos, historicoConTipo.length);

    Logger.log("Distribución tipo vehículo para placa consultada:");
    Logger.log(JSON.stringify(conteoTipos, null, 2));
    Logger.log("Mayoría tipo vehículo:");
    Logger.log(JSON.stringify(mayoriaTipo, null, 2));

    if (mayoriaTipo && mayoriaTipo.porcentaje >= UMBRAL_MAYORIA) {
      historicoConTipo.forEach(function(reg) {
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

  const ss = SpreadsheetApp.openById(SHEET_ID_SANCIONES);
  const sheet = ss.getSheetByName(SHEET_PLANILLA);

  if (!sheet) {
    throw new Error('No se encontró la hoja "' + SHEET_PLANILLA + '".');
  }

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow < 2 || lastCol < 1) {
    Logger.log("No hay datos para normalizar.");
    return;
  }

  const allData = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const richData = sheet.getRange(1, 1, lastRow, lastCol).getRichTextValues();

  const rawHeaders = allData[0];
  const headers = rawHeaders.map(function(h) {
    return normalizeHeader_(h);
  });

  const colMap = {};
  headers.forEach(function(h, i) {
    colMap[h] = i;
  });

  const IDX = {
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

  const rows = allData.slice(1);

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

  Logger.log("Registros normalizados: " + registrosNormalizados.length);

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
  Logger.log(JSON.stringify(resultadoAnalisis.inconsistenciasNoReparadas.slice(0, 100), null, 2));

  Logger.log("=== FIN NORMALIZACION GENERAL DE SANCIONES ===");
}


/***************************************
 * NORMALIZAR TODAS LAS PLACAS
 * Solo borra espacios y convierte a mayúsculas
 ***************************************/
function normalizarTodasLasPlacas_() {
  const ss = SpreadsheetApp.openById(SHEET_ID_SANCIONES);
  const sheet = ss.getSheetByName(SHEET_PLANILLA);

  if (!sheet) {
    throw new Error('No se encontró la hoja "' + SHEET_PLANILLA + '".');
  }

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  if (lastRow < 2 || lastCol < 1) {
    Logger.log("No hay datos para normalizar.");
    return;
  }

  const allData = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = allData[0].map(function(h) {
    return normalizeHeader_(h);
  });

  const colMap = {};
  headers.forEach(function(h, i) {
    colMap[h] = i;
  });

  const placaColIndex = findColIdx_(colMap, ["placa"]);

  if (placaColIndex === -1) {
    throw new Error('No se encontró la columna "placa".');
  }

  const placaRange = sheet.getRange(2, placaColIndex + 1, lastRow - 1, 1);
  const placaValues = placaRange.getValues();

  let totalRevisadas = 0;
  let totalCorregidas = 0;
  const cambios = [];

  const nuevasPlacas = placaValues.map(function(row, index) {
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

  rows.forEach(function(row, index) {
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

  values.forEach(function(row, index) {
    const placa = normalizePlaca_(row[0]);

    if (!placa) return;

    mapa[placa] = {
      row: index + 2,
      placa: placa,
      apartamento: safeTrim_(row[1]),
      apartamentoNorm: normalizeText_(row[1]),
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

  Object.keys(gruposPorPlaca).forEach(function(placaNorm) {
    const registrosPlaca = gruposPorPlaca[placaNorm];

    if (!placaNorm) return;

    Logger.log("=== ANALIZANDO PLACA: " + placaNorm + " ===");
    Logger.log("Total registros placa: " + registrosPlaca.length);

    const masterInterna = mapaMaestra[placaNorm];
    const masterVigilancia = mapaVigilancia[placaNorm];

    // Prioridad:
    // 1. Maestra interna
    // 2. Vigilancia
    // 3. Mayoría histórica
    const master = masterInterna || masterVigilancia;

    const regexInfo = getTipoVehiculoEsperadoPorRegexPlaca_(placaNorm);

    const conteoAptos = contarPorCampo_(registrosPlaca, "aptoNorm");
    const mayoriaApto = obtenerMayoria_(conteoAptos, registrosPlaca.length);

    const registrosConTipo = registrosPlaca.filter(function(reg) {
      return reg.tipoVehiculoNorm;
    });

    const conteoTipos = contarPorCampo_(registrosConTipo, "tipoVehiculoNorm");
    const mayoriaTipo = obtenerMayoria_(conteoTipos, registrosConTipo.length);

    Logger.log("Regex placa:");
    Logger.log(JSON.stringify(regexInfo, null, 2));

    Logger.log("Distribución aptos:");
    Logger.log(JSON.stringify(conteoAptos, null, 2));

    Logger.log("Mayoría apto:");
    Logger.log(JSON.stringify(mayoriaApto, null, 2));

    Logger.log("Distribución tipos:");
    Logger.log(JSON.stringify(conteoTipos, null, 2));

    Logger.log("Mayoría tipo:");
    Logger.log(JSON.stringify(mayoriaTipo, null, 2));

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

      Logger.log("Placa existe en maestra. Se respeta maestra:");
      Logger.log(JSON.stringify(master, null, 2));
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
      registrosPlaca.forEach(function(reg) {
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
              .setBackground("#d9ead3");

            reg.apto = aptoCorrectoTexto;
            reg.aptoNorm = normalizeText_(aptoCorrectoTexto);
          }
        }
      });
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
    }

    /***************************************
     * 4. Corregir tipo vehículo por regex.
     ***************************************/
    if (regexInfo.ok) {
      registrosPlaca.forEach(function(reg) {
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
              .setBackground("#d9ead3");

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
        registrosPlaca.forEach(function(reg) {
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
                .setBackground("#d9ead3");

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

  registros.forEach(function(reg) {
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

  registros.forEach(function(reg) {
    inconsistenciasNoReparadas.push({
      sheetRow: reg.sheetRow,
      placa: reg.placaNorm,
      apto: reg.apto,
      tipoVehiculo: reg.tipoVehiculo,
      columna: columna,
      motivo: motivo
    });

    if (aplicarCorrecciones) {
      sheet.getRange(reg.sheetRow, colIndex + 1)
        .setBackground("#f4cccc");
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

  data.forEach(function(row, rowIndex) {
    paresColumnas.forEach(function(par) {
      const placaRaw = row[par.placaCol];
      const aptoRaw = row[par.aptoCol];

      const placa = normalizePlaca_(placaRaw);
      const apto = safeTrim_(aptoRaw);
      const aptoNorm = normalizeText_(apto);

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

  Logger.log('Total placas cargadas desde vigilancia: ' + Object.keys(mapa).length);

  if (conflictos.length > 0) {
    Logger.log('Conflictos encontrados en vigilancia:');
    Logger.log(JSON.stringify(conflictos, null, 2));
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

  Logger.log("Pares de columnas vigilancia detectados:");
  Logger.log(JSON.stringify(
    pares.map(function(p) {
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

  Object.keys(mapaVigilancia).forEach(function(placa) {
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

  Logger.log("=== SINCRONIZACION VIGILANCIA → MAESTRA ===");
  Logger.log("Registros vigilancia revisados: " + Object.keys(mapaVigilancia).length);
  Logger.log("Nuevos para maestra: " + nuevos.length);
  Logger.log("Omitidos: " + omitidos.length);

  Logger.log("Nuevos muestra:");
  Logger.log(JSON.stringify(nuevos.slice(0, 50), null, 2));

  if (nuevos.length > 50) {
    Logger.log("Más nuevos no mostrados: " + (nuevos.length - 50));
  }

  if (aplicarCorrecciones && nuevos.length > 0) {
    const now = Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      "yyyy-MM-dd HH:mm"
    );

    const values = nuevos.map(function(item) {
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
  nuevos.forEach(function(item) {
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