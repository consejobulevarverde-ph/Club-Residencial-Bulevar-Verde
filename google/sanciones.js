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

/***************************************
 * WEB APP - ENDPOINT PRINCIPAL
 * GET ?action=consultar&apto=101&placa=ABC123
 ***************************************/
function doGet(e) {
  try {
    const action = getParam_(e, 'action');

    if (action === 'consultar') {
      const apto = getParam_(e, 'apto');
      const placa = getParam_(e, 'placa');
      return consultarSanciones_(apto, placa);
    }

    return jsonOutput_({ ok: false, error: 'Acción no reconocida.' });
  } catch (error) {
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

    // Paso 1: buscar filas donde la placa coincide
    var placaRows = rows.filter(function (row) {
      return normalizePlaca_(row[IDX.placa]) === placa;
    });

    Logger.log('PLACA BUSCADA: ' + placa);
    Logger.log('TOTAL FILAS LEÍDAS: ' + rows.length);
    Logger.log('PLACA BUSCADA: ' + placa);
    Logger.log('EXISTE PLACA: ' + rows.some(function(row) {
        return normalizePlaca_(row[IDX.placa]) === placa;
      }));


    var placaRows = rows.filter(function (row) {
      return normalizePlaca_(row[IDX.placa]) === placa;
    });

    Logger.log('FILAS CON ESA PLACA: ' + placaRows.length);
    Logger.log('APTOS DE ESA PLACA: ' + JSON.stringify(placaRows.map(function(row) {
      return safeTrim_(row[IDX.apto]);
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
    var matchesApto = placaRows.some(function (row) {
      return rowMatchesApto_(row, IDX, aptoNorm);
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
    var registrosFinales = [];

    rows.forEach(function (row, index) {
      var realRowIndex = index + 1; // +1 porque allData[0] son los encabezados
      var perteneceAlApto = rowMatchesApto_(row, IDX, aptoNorm);
      var perteneceALaPlaca = normalizePlaca_(row[IDX.placa]) === placa;

      if (perteneceAlApto || perteneceALaPlaca) {
        registrosFinales.push({
          row: row,
          realRowIndex: realRowIndex
        });
      }
    });

    // Evitar duplicados por ID
    var idsVistos = {};
    registrosFinales = registrosFinales.filter(function(item) {
      var row = item.row;
      var id = IDX.id !== -1 ? safeTrim_(row[IDX.id]) : '';

      if (!id) return true;
      if (idsVistos[id]) return false;

      idsVistos[id] = true;
      return true;
    });

    var sanciones = registrosFinales.map(function (item) {
      var row = item.row;
      var realRowIndex = item.realRowIndex;

      return {
        id: IDX.id !== -1 ? safeTrim_(row[IDX.id]) : '',
        fecha: IDX.fecha !== -1 ? formatFecha_(row[IDX.fecha]) : '',
        apartamento: IDX.apto !== -1 ? safeTrim_(row[IDX.apto]) : '',
        vigilante: IDX.vigilante !== -1 ? safeTrim_(row[IDX.vigilante]) : '',
        tipoVehiculo: IDX.tipoVehiculo !== -1 ? safeTrim_(row[IDX.tipoVehiculo]) : '',
        placa: IDX.placa !== -1 ? safeTrim_(row[IDX.placa]).toUpperCase() : '',
        residenteOVisitante: IDX.residenteVisitante !== -1 ? safeTrim_(row[IDX.residenteVisitante]) : '',
        observaciones: IDX.observaciones !== -1 ? safeTrim_(row[IDX.observaciones]) : '',
        foto: IDX.foto !== -1 ? getCellUrlOrText_(richData, allData, realRowIndex, IDX.foto) : '',
        firma: IDX.firma !== -1 ? getCellUrlOrText_(richData, allData, realRowIndex, IDX.firma) : ''
      };
    });




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

// Verifica si una fila pertenece al apartamento indicado
function rowMatchesApto_(row, IDX, aptoNorm) {
  if (IDX.apto !== -1) {
    var rowApto = normalizeText_(row[IDX.apto]);
    return rowApto === aptoNorm;
  }

  return false;
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
      apto: '1029',       // Reemplaza con un apto real de tu hoja
      placa: 'TSF66G'    // Reemplaza con una placa real de tu hoja
    }
  };
  var result = doGet(fakeEvent);
  Logger.log(result.getContent());
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