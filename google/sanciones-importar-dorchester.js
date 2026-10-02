/***************************************
 * IMPORTADOR DE REPORTES DORCHESTER - PARQUEADERO VISITANTES
 * Club Residencial Bulevar Verde
 *
 * Dorchester cambió su formato de reporte. El nuevo archivo ya no se
 * convierte a mano a la PLANILLA de siempre: trae las columnas reordenadas
 * ("Fecha y hora", "Tipo / estado", "Detalle", etc.) y la foto + la firma de
 * cada registro vienen incrustadas como imágenes dentro del propio .xlsx
 * (celdas K/L con el texto "Evidencia incrustada"), no como archivos sueltos
 * en una carpeta de Drive compartida.
 *
 * Este módulo lee ese .xlsx directamente desde su ZIP interno (sin
 * convertirlo primero a Google Sheets, porque la API de imágenes sobre
 * cuadrícula de Apps Script no permite recuperar el blob original), extrae
 * las 2 imágenes de cada fila, las sube a una carpeta de Drive del Consejo y
 * escribe cada registro en la misma hoja PLANILLA de siempre — en el mismo
 * formato (ID, FECHA, VIGILANTE QUE TOMA EL REGISTRO, APARTAMENTO, TIPO DE
 * VEHICULO, PLACA, RESIDENTE O VISITANTE, OBSERVACIONES, FOTO, FIRMA), con
 * el mismo esquema de FOTO/FIRMA ("Full size" + hipervínculo permanente de
 * Drive) que ya usan generarImagenes()/getCellUrlOrText_ en sanciones.js.
 *
 * El ID de cada registro es determinístico (hash de fecha+placa+apto+tipo+
 * vigilante), así que reimportar el mismo reporte — o un reporte que se
 * traslape en fechas con uno ya importado — nunca duplica sanciones.
 *
 * INSTRUCCIONES DE USO:
 * ═══════════════════════════════════════════════════════════
 * 1. Subir el .xlsx que entrega Dorchester a cualquier carpeta de Drive
 *    accesible por esta cuenta y copiar su fileId (parte de la URL).
 * 2. (Opcional, recomendado) Ejecutar:
 *      previsualizarImportacionDorchester(fileId)
 *    Revisa el log: cuántas filas lee, cuántas ya existen, cuántas son
 *    nuevas, y una muestra de los registros transformados. No escribe nada.
 * 3. Ejecutar: importarReporteDorchester(fileId)
 *    - Procesa por lotes automáticamente (se reanuda sola con triggers).
 *    - Monitorear con: mostrarEstadoImportacionDorchester()
 * 4. Si algo falla a mitad de camino, simplemente reejecutar
 *    importarReporteDorchester(fileId) con el mismo fileId: continúa donde
 *    quedó. Para forzar un reinicio completo: reiniciarImportacionDorchester()
 * 5. Al terminar, PLANILLA ya tiene los registros nuevos con FOTO/FIRMA
 *    resueltas — no hace falta pasar por prepararIndiceImagenesSanciones()
 *    ni generarImagenes() para estas filas.
 * ═══════════════════════════════════════════════════════════
 ***************************************/

const DORCHESTER_HOJA_ORIGEN = 'parqueaderos';
const DORCHESTER_IMPORT_FOLDER_NOMBRE = 'Evidencias Dorchester Importadas';
const DORCHESTER_IMPORT_FOLDER_PROP = 'DORCHESTER_IMPORT_FOLDER_ID';
const DORCHESTER_IMPORT_ESTADO_PROP = 'DORCHESTER_IMPORT_ESTADO';
const DORCHESTER_IMPORT_FILE_ID_PROP = 'DORCHESTER_IMPORT_FILE_ID';
const DORCHESTER_IMPORT_SIGUIENTE_FILA_PROP = 'DORCHESTER_IMPORT_SIGUIENTE_FILA';
const DORCHESTER_IMPORT_RESUMEN_PROP = 'DORCHESTER_IMPORT_RESUMEN';
const DORCHESTER_IMPORT_FILAS_MAXIMAS_POR_EJECUCION = 150;
const DORCHESTER_IMPORT_TIEMPO_MAX_MS = 4.5 * 60 * 1000;
const DORCHESTER_IMPORT_MARGEN_CORTE_MS = 15 * 1000;
const DORCHESTER_IMPORT_TRIGGER_MS = 20 * 1000;
const FUNCION_TRIGGER_IMPORTAR_DORCHESTER = 'continuarImportacionReporteDorchester_';

/***************************************
 * 01. PUNTOS DE ENTRADA
 ***************************************/

function importarReporteDorchester(fileId) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const props = PropertiesService.getScriptProperties();
    const estadoActual = safeTrim_(props.getProperty(DORCHESTER_IMPORT_ESTADO_PROP));
    const fileIdGuardado = safeTrim_(props.getProperty(DORCHESTER_IMPORT_FILE_ID_PROP));
    const esReanudacion = estadoActual === 'EN_PROCESO' && fileIdGuardado === safeTrim_(fileId);

    if (!esReanudacion) {
      eliminarTriggersImportacionDorchester_();
      props.setProperty(DORCHESTER_IMPORT_FILE_ID_PROP, safeTrim_(fileId));
      props.setProperty(DORCHESTER_IMPORT_SIGUIENTE_FILA_PROP, '2');
      props.setProperty(DORCHESTER_IMPORT_ESTADO_PROP, 'EN_PROCESO');
      props.setProperty(
        DORCHESTER_IMPORT_RESUMEN_PROP,
        JSON.stringify(dorchesterResumenInicial_())
      );
    }
  } finally {
    lock.releaseLock();
  }

  return procesarLoteImportacionDorchester_();
}

function continuarImportacionReporteDorchester_() {
  try {
    return procesarLoteImportacionDorchester_();
  } catch (error) {
    const props = PropertiesService.getScriptProperties();
    const resumen = dorchesterLeerResumen_();
    resumen.erroresEjecucion = Number(resumen.erroresEjecucion || 0) + 1;
    resumen.ultimoError = (error && error.stack ? error.stack : String(error)).substring(0, 1500);
    resumen.actualizado = new Date().toISOString();
    props.setProperty(DORCHESTER_IMPORT_RESUMEN_PROP, JSON.stringify(resumen));
    programarSiguienteLoteImportacionDorchester_();
    Logger.log('ERROR continuarImportacionReporteDorchester_: ' + resumen.ultimoError);
    return resumen;
  }
}

function mostrarEstadoImportacionDorchester() {
  const props = PropertiesService.getScriptProperties();
  const estado = {
    estado: safeTrim_(props.getProperty(DORCHESTER_IMPORT_ESTADO_PROP)) || 'NO_INICIADO',
    fileId: safeTrim_(props.getProperty(DORCHESTER_IMPORT_FILE_ID_PROP)),
    siguienteFila: Number(props.getProperty(DORCHESTER_IMPORT_SIGUIENTE_FILA_PROP) || 0),
    resumen: dorchesterLeerResumen_()
  };
  Logger.log(JSON.stringify(estado, null, 2));
  return estado;
}

function reiniciarImportacionDorchester() {
  const props = PropertiesService.getScriptProperties();
  eliminarTriggersImportacionDorchester_();
  props.deleteProperty(DORCHESTER_IMPORT_ESTADO_PROP);
  props.deleteProperty(DORCHESTER_IMPORT_FILE_ID_PROP);
  props.deleteProperty(DORCHESTER_IMPORT_SIGUIENTE_FILA_PROP);
  props.deleteProperty(DORCHESTER_IMPORT_RESUMEN_PROP);
  Logger.log('Importación de Dorchester reiniciada.');
}

function diagnosticarArchivoDorchester(fileId) {
  const file = DriveApp.getFileById(safeTrim_(fileId));
  const blob = file.getBlob();
  const bytes = blob.getBytes();
  const primerosBytes = bytes.slice(0, 4).map(function (b) {
    return (b < 0 ? b + 256 : b).toString(16).padStart(2, '0');
  }).join(' ');

  const info = {
    nombre: file.getName(),
    mimeTypeDrive: file.getMimeType(),
    mimeTypeBlob: blob.getContentType(),
    tamanoBytes: bytes.length,
    primerosBytesHex: primerosBytes,
    // Un .xlsx/.zip real empieza por "50 4b 03 04" (PK\x03\x04).
    pareceZip: primerosBytes === '50 4b 03 04'
  };

  Logger.log(JSON.stringify(info, null, 2));
  return info;
}

/***************************************
 * PREVISUALIZACIÓN (no escribe nada)
 ***************************************/
function previsualizarImportacionDorchester(fileId, maxFilas) {
  const limite = Number(maxFilas) > 0 ? Number(maxFilas) : 10;
  const blob = DriveApp.getFileById(safeTrim_(fileId)).getBlob();
  const parsed = parsearXlsxDorchester_(blob);
  const idsExistentes = dorchesterCargarIdsExistentes_();

  const muestra = [];
  let yaExistentes = 0;
  let sinApartamento = 0;

  parsed.filas.forEach(function (fila) {
    const registro = convertirFilaDorchester_(fila.valoresPorHeader);
    const id = generarIdSancionDorchester_(registro);
    const existe = idsExistentes.has(id);

    if (existe) yaExistentes++;
    if (!registro.apto) sinApartamento++;

    if (muestra.length < limite) {
      muestra.push({
        sheetRow: fila.sheetRow,
        id: id,
        yaExiste: existe,
        tieneFoto: !!parsed.imagenesPorFila[fila.sheetRow] && !!parsed.imagenesPorFila[fila.sheetRow].FOTO,
        tieneFirma: !!parsed.imagenesPorFila[fila.sheetRow] && !!parsed.imagenesPorFila[fila.sheetRow].FIRMA,
        registro: registro
      });
    }
  });

  const resultado = {
    totalFilas: parsed.filas.length,
    yaExistentes: yaExistentes,
    nuevos: parsed.filas.length - yaExistentes,
    sinApartamento: sinApartamento,
    muestra: muestra
  };

  Logger.log(JSON.stringify(resultado, null, 2));
  return resultado;
}

/***************************************
 * 02. PROCESAMIENTO POR LOTES
 ***************************************/
function procesarLoteImportacionDorchester_() {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(30000)) {
    programarSiguienteLoteImportacionDorchester_();
    return mostrarEstadoImportacionDorchester();
  }

  const inicioMs = Date.now();

  try {
    const props = PropertiesService.getScriptProperties();
    const estado = safeTrim_(props.getProperty(DORCHESTER_IMPORT_ESTADO_PROP));

    if (estado !== 'EN_PROCESO') {
      return mostrarEstadoImportacionDorchester();
    }

    const fileId = safeTrim_(props.getProperty(DORCHESTER_IMPORT_FILE_ID_PROP));
    if (!fileId) {
      throw new Error('No hay un fileId de Dorchester en proceso.');
    }

    const blob = DriveApp.getFileById(fileId).getBlob();
    const parsed = parsearXlsxDorchester_(blob);
    const totalFilas = parsed.filas.length;

    let siguienteFila = Number(props.getProperty(DORCHESTER_IMPORT_SIGUIENTE_FILA_PROP) || 2);
    const resumen = dorchesterLeerResumen_();
    resumen.totalFilas = totalFilas;

    const ss = SpreadsheetApp.openById(SHEET_ID_SANCIONES);
    const sheet = ss.getSheetByName(SHEET_PLANILLA);
    if (!sheet) {
      throw new Error('No se encontró la hoja "' + SHEET_PLANILLA + '".');
    }

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const IDX = obtenerIdxPlanilla_(headers);
    dorchesterValidarColumnasPlanilla_(IDX);

    const idsExistentes = dorchesterCargarIdsExistentes_();
    const filasPorSheetRow = {};
    parsed.filas.forEach(function (fila) {
      filasPorSheetRow[fila.sheetRow] = fila;
    });

    let procesadasEnEsteLote = 0;
    let filaActual = siguienteFila;
    const ultimaFila = parsed.ultimaFilaConDatos;

    programarSiguienteLoteImportacionDorchester_();

    while (filaActual <= ultimaFila) {
      const tiempoConsumido = Date.now() - inicioMs;
      const cercaDelLimite = tiempoConsumido >= DORCHESTER_IMPORT_TIEMPO_MAX_MS - DORCHESTER_IMPORT_MARGEN_CORTE_MS;

      if (
        procesadasEnEsteLote >= DORCHESTER_IMPORT_FILAS_MAXIMAS_POR_EJECUCION ||
        cercaDelLimite
      ) {
        break;
      }

      const fila = filasPorSheetRow[filaActual];
      filaActual += 1;
      procesadasEnEsteLote += 1;

      if (!fila) {
        continue;
      }

      resumen.leidos = Number(resumen.leidos || 0) + 1;

      try {
        dorchesterProcesarFila_(fila, parsed, idsExistentes, sheet, IDX, resumen);
      } catch (filaError) {
        resumen.errores = Number(resumen.errores || 0) + 1;
        resumen.ultimoError = 'Fila ' + fila.sheetRow + ': ' +
          (filaError && filaError.message ? filaError.message : String(filaError));
        Logger.log('ERROR importando fila ' + fila.sheetRow + ': ' + resumen.ultimoError);
      }
    }

    props.setProperty(DORCHESTER_IMPORT_SIGUIENTE_FILA_PROP, String(filaActual));
    resumen.actualizado = new Date().toISOString();

    if (filaActual > ultimaFila) {
      props.setProperty(DORCHESTER_IMPORT_ESTADO_PROP, 'COMPLETADO');
      eliminarTriggersImportacionDorchester_();
      resumen.estado = 'COMPLETADO';
    } else {
      resumen.estado = 'EN_PROCESO';
    }

    props.setProperty(DORCHESTER_IMPORT_RESUMEN_PROP, JSON.stringify(resumen));

    Logger.log(JSON.stringify(resumen, null, 2));
    return resumen;
  } finally {
    lock.releaseLock();
  }
}

function dorchesterProcesarFila_(fila, parsed, idsExistentes, sheet, IDX, resumen) {
  const registro = convertirFilaDorchester_(fila.valoresPorHeader);
  const id = generarIdSancionDorchester_(registro);

  if (registroSancionYaExiste_(id, idsExistentes)) {
    resumen.yaExistentes = Number(resumen.yaExistentes || 0) + 1;
    return;
  }

  const imagenesFila = parsed.imagenesPorFila[fila.sheetRow] || {};
  let urlFoto = '';
  let urlFirma = '';

  if (imagenesFila.FOTO) {
    try {
      urlFoto = guardarEvidenciaDorchester_(id, 'FOTO', dorchesterObtenerBlobImagen_(parsed, imagenesFila.FOTO));
      resumen.fotos = Number(resumen.fotos || 0) + 1;
    } catch (fotoError) {
      Logger.log('WARN no se pudo guardar FOTO de la fila ' + fila.sheetRow + ': ' +
        (fotoError.message || String(fotoError)));
    }
  }

  if (imagenesFila.FIRMA) {
    try {
      urlFirma = guardarEvidenciaDorchester_(id, 'FIRMA', dorchesterObtenerBlobImagen_(parsed, imagenesFila.FIRMA));
      resumen.firmas = Number(resumen.firmas || 0) + 1;
    } catch (firmaError) {
      Logger.log('WARN no se pudo guardar FIRMA de la fila ' + fila.sheetRow + ': ' +
        (firmaError.message || String(firmaError)));
    }
  }

  const lastCol = sheet.getLastColumn();
  const fila_ = new Array(lastCol).fill('');
  if (IDX.id !== -1) fila_[IDX.id] = id;
  if (IDX.fecha !== -1) fila_[IDX.fecha] = registro.fecha;
  if (IDX.vigilante !== -1) fila_[IDX.vigilante] = registro.vigilante;
  if (IDX.apto !== -1) fila_[IDX.apto] = registro.apto;
  if (IDX.tipoVehiculo !== -1) fila_[IDX.tipoVehiculo] = registro.tipoVehiculo;
  if (IDX.placa !== -1) fila_[IDX.placa] = registro.placa;
  if (IDX.residenteVisitante !== -1) fila_[IDX.residenteVisitante] = registro.residenteOVisitante;
  if (IDX.observaciones !== -1) fila_[IDX.observaciones] = registro.observaciones;

  sheet.appendRow(fila_);
  const nuevaFila = sheet.getLastRow();

  if (urlFoto && IDX.foto !== -1) {
    sheet.getRange(nuevaFila, IDX.foto + 1).setRichTextValue(crearRichTextEnlaceImagenSancion_(urlFoto));
  }
  if (urlFirma && IDX.firma !== -1) {
    sheet.getRange(nuevaFila, IDX.firma + 1).setRichTextValue(crearRichTextEnlaceImagenSancion_(urlFirma));
  }

  idsExistentes.add(id);
  resumen.nuevos = Number(resumen.nuevos || 0) + 1;
  resumen.importados = Number(resumen.importados || 0) + 1;
}

function dorchesterValidarColumnasPlanilla_(IDX) {
  const faltantes = [];
  if (IDX.id === -1) faltantes.push('ID');
  if (IDX.fecha === -1) faltantes.push('FECHA');
  if (IDX.placa === -1) faltantes.push('PLACA');
  if (IDX.apto === -1) faltantes.push('APARTAMENTO');

  if (faltantes.length) {
    throw new Error('La hoja PLANILLA no tiene las columnas requeridas: ' + faltantes.join(', '));
  }
}

function programarSiguienteLoteImportacionDorchester_() {
  eliminarTriggersImportacionDorchester_();
  ScriptApp
    .newTrigger(FUNCION_TRIGGER_IMPORTAR_DORCHESTER)
    .timeBased()
    .after(DORCHESTER_IMPORT_TRIGGER_MS)
    .create();
}

function eliminarTriggersImportacionDorchester_() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === FUNCION_TRIGGER_IMPORTAR_DORCHESTER) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function dorchesterResumenInicial_() {
  return {
    estado: 'EN_PROCESO',
    iniciado: new Date().toISOString(),
    totalFilas: 0,
    leidos: 0,
    yaExistentes: 0,
    nuevos: 0,
    importados: 0,
    fotos: 0,
    firmas: 0,
    errores: 0
  };
}

function dorchesterLeerResumen_() {
  const raw = PropertiesService.getScriptProperties().getProperty(DORCHESTER_IMPORT_RESUMEN_PROP);
  if (!raw) return dorchesterResumenInicial_();
  try {
    return JSON.parse(raw);
  } catch (error) {
    return dorchesterResumenInicial_();
  }
}

/***************************************
 * 03. IDENTIDAD DE REGISTROS (DEDUPLICACIÓN)
 ***************************************/
function dorchesterCargarIdsExistentes_() {
  const ss = SpreadsheetApp.openById(SHEET_ID_SANCIONES);
  const sheet = ss.getSheetByName(SHEET_PLANILLA);
  const idsExistentes = new Set();

  if (!sheet) return idsExistentes;

  const lastRow = sheet.getLastRow();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const IDX = obtenerIdxPlanilla_(headers);

  if (IDX.id === -1 || lastRow < 2) return idsExistentes;

  const valores = sheet.getRange(2, IDX.id + 1, lastRow - 1, 1).getValues();
  valores.forEach(function (fila) {
    const id = safeTrim_(fila[0]).toLowerCase();
    if (id) idsExistentes.add(id);
  });

  return idsExistentes;
}

function registroSancionYaExiste_(id, idsExistentes) {
  return idsExistentes.has(safeTrim_(id).toLowerCase());
}

function generarIdSancionDorchester_(registro) {
  const base = [
    safeTrim_(registro.fechaOriginal),
    safeTrim_(registro.placa),
    safeTrim_(registro.apto),
    safeTrim_(registro.tipoVehiculo),
    safeTrim_(registro.vigilante)
  ].join('|').toUpperCase();

  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, base);
  return dorchesterBytesAHex_(digest).substring(0, 8);
}

function dorchesterBytesAHex_(bytes) {
  return bytes.map(function (b) {
    const unsigned = b < 0 ? b + 256 : b;
    const hex = unsigned.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

/***************************************
 * 04. TRANSFORMACIÓN DE FILAS DORCHESTER → PLANILLA
 *
 * Correspondencia (ver .github/importacion_final/contexto.md):
 *   Fecha y hora       → FECHA                (directa)
 *   Personal           → VIGILANTE            (directa)
 *   Detalle            → APARTAMENTO          ("Apto. 964 · ..." → 964)
 *   Tipo / estado       → TIPO DE VEHICULO     ("CARRO / RESIDENTE" → CARRO)
 *   Referencia          → PLACA                (directa)
 *   Tipo / estado       → RESIDENTE O VISITANTE ("CARRO / RESIDENTE" → RESIDENTE)
 *   Detalle             → OBSERVACIONES        (se quita "Apto. 964 · ")
 *   Fotografía/Firma    → FOTO/FIRMA           (imágenes incrustadas, aparte)
 ***************************************/
const DORCHESTER_REGEX_DETALLE = /^apto\.?\s*(\d+)\s*[·\-:]?\s*(.*)$/i;

function convertirFilaDorchester_(valoresPorHeader) {
  const fechaOriginal = safeTrim_(valoresPorHeader['fecha y hora']);
  const tipoEstado = safeTrim_(valoresPorHeader['tipo / estado']);
  const detalle = safeTrim_(valoresPorHeader['detalle']);
  const placa = safeTrim_(valoresPorHeader['referencia']).toUpperCase();
  const vigilante = safeTrim_(valoresPorHeader['personal']);

  const partesTipoEstado = tipoEstado.split('/');
  const tipoVehiculoCrudo = safeTrim_(partesTipoEstado[0]);
  const residenteOVisitante = safeTrim_(partesTipoEstado[1]).toUpperCase();

  const matchDetalle = detalle.match(DORCHESTER_REGEX_DETALLE);
  const apto = matchDetalle ? safeTrim_(matchDetalle[1]) : '';
  const observaciones = matchDetalle ? safeTrim_(matchDetalle[2]) : detalle;

  return {
    fecha: dorchesterParsearFecha_(fechaOriginal),
    fechaOriginal: fechaOriginal,
    vigilante: vigilante,
    apto: apto,
    tipoVehiculo: normalizarTipoVehiculo_(tipoVehiculoCrudo),
    placa: placa,
    residenteOVisitante: residenteOVisitante,
    observaciones: observaciones
  };
}

function dorchesterParsearFecha_(valor) {
  const match = safeTrim_(valor).match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/
  );

  if (!match) return safeTrim_(valor);

  const dia = Number(match[1]);
  const mes = Number(match[2]) - 1;
  const anio = Number(match[3]);
  const hora = Number(match[4]);
  const minuto = Number(match[5]);
  const segundo = Number(match[6]);

  return new Date(anio, mes, dia, hora, minuto, segundo);
}

/***************************************
 * 05. EVIDENCIAS: SUBIDA A DRIVE
 *
 * Usa el mismo esquema de URL y el mismo texto visible ("Full size" con
 * hipervínculo) que generarImagenes()/crearRichTextEnlaceImagenSancion_ en
 * sanciones.js, y el mismo patrón de nombre "<id>.<FOTO|FIRMA>.<ext>" que
 * extraerRegistroTipoDesdeNombreImagenSancion_ ya reconoce.
 ***************************************/
function guardarEvidenciaDorchester_(id, tipo, blob) {
  const folder = dorchesterObtenerCarpetaImportacion_();
  const extension = dorchesterExtensionDesdeMime_(blob.getContentType());
  const fileName = safeTrim_(id) + '.' + safeTrim_(tipo).toUpperCase() + '.' + extension;
  const file = folder.createFile(blob.setName(fileName));

  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (sharingError) {
    Logger.log('WARN guardarEvidenciaDorchester_ no pudo habilitar enlace público: ' +
      (sharingError.message || String(sharingError)));
  }

  return construirUrlPublicaPermanenteDrive_(file);
}

function dorchesterExtensionDesdeMime_(mimeType) {
  const tipo = safeTrim_(mimeType).toLowerCase();
  if (tipo === 'image/png') return 'png';
  if (tipo === 'image/webp') return 'webp';
  if (tipo === 'image/gif') return 'gif';
  return 'jpeg';
}

function dorchesterObtenerCarpetaImportacion_() {
  const properties = PropertiesService.getScriptProperties();
  const configuredId = safeTrim_(properties.getProperty(DORCHESTER_IMPORT_FOLDER_PROP));

  if (configuredId) {
    try {
      return DriveApp.getFolderById(configuredId);
    } catch (error) {
      Logger.log('La carpeta de importación Dorchester configurada no está disponible: ' +
        (error.message || String(error)));
    }
  }

  const folders = DriveApp.getFoldersByName(DORCHESTER_IMPORT_FOLDER_NOMBRE);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(DORCHESTER_IMPORT_FOLDER_NOMBRE);

  properties.setProperty(DORCHESTER_IMPORT_FOLDER_PROP, folder.getId());
  return folder;
}

/***************************************
 * 06. LECTURA DEL .XLSX SIN CONVERTIRLO (lector de ZIP propio)
 *
 * Un .xlsx es un ZIP de XML (OOXML). En vez de convertir el archivo a
 * Google Sheets (lo que impediría recuperar las imágenes incrustadas, ya
 * que OverGridImage no expone el blob original), se lee directamente:
 *   - xl/workbook.xml + xl/_rels/workbook.xml.rels → ubicar la hoja
 *     "parqueaderos" dentro de xl/worksheets/sheetN.xml
 *   - xl/sharedStrings.xml                          → tabla de strings
 *     compartidos (si el exportador los usa; Dorchester usa inlineStr)
 *   - xl/worksheets/sheetN.xml                       → filas y celdas
 *   - xl/worksheets/_rels/sheetN.xml.rels            → hoja → drawingN.xml
 *   - xl/drawings/drawingN.xml (+ .rels)             → qué imagen
 *     (xl/media/imageX) está anclada en qué fila/columna
 *
 * El archivo real que entrega Dorchester usa "data descriptors" en todas
 * sus entradas (el tamaño/CRC se graban después de los datos comprimidos,
 * típico de generadores de ZIP en modo streaming). Utilities.unzip() de
 * Apps Script no soporta ese modo y falla con "Could not unzip.", así que
 * en vez de depender de él se lee el directorio central del ZIP a mano
 * (ese directorio siempre trae los tamaños correctos) y se reutiliza el
 * descompresor nativo de Apps Script envolviendo cada stream deflate crudo
 * en un contenedor GZIP mínimo para pasarlo a Utilities.ungzip().
 ***************************************/
function parsearXlsxDorchester_(blob) {
  const bytes = dorchesterBytesSinSigno_(blob.getBytes());
  const entradasZip = dorchesterLeerZip_(bytes);
  const porNombre = {};
  entradasZip.forEach(function (meta) {
    porNombre[meta.name] = meta;
  });

  const workbookXml = dorchesterLeerTexto_(bytes, porNombre, 'xl/workbook.xml');
  const workbookRelsXml = dorchesterLeerTexto_(bytes, porNombre, 'xl/_rels/workbook.xml.rels');

  const rIdHoja = dorchesterObtenerRIdHoja_(workbookXml, DORCHESTER_HOJA_ORIGEN);
  const relaciones = dorchesterParsearRelaciones_(workbookRelsXml);
  const rutaHojaRelativa = relaciones[rIdHoja];

  if (!rutaHojaRelativa) {
    throw new Error('No se encontró la hoja "' + DORCHESTER_HOJA_ORIGEN + '" dentro del archivo.');
  }

  const rutaHoja = 'xl/' + rutaHojaRelativa.replace(/^\/?/, '');
  const sheetXml = dorchesterLeerTexto_(bytes, porNombre, rutaHoja);

  const sharedStringsXml = dorchesterLeerTexto_(bytes, porNombre, 'xl/sharedStrings.xml');
  const sharedStrings = sharedStringsXml ? dorchesterParsearSharedStrings_(sharedStringsXml) : [];

  const rutaRelsHoja = rutaHoja.replace(/([^/]+)$/, '_rels/$1.rels');
  const relsHojaXml = dorchesterLeerTexto_(bytes, porNombre, rutaRelsHoja);
  const relsHoja = relsHojaXml ? dorchesterParsearRelaciones_(relsHojaXml) : {};

  const { headers, filas, ultimaFilaConDatos } = dorchesterParsearFilas_(sheetXml, sharedStrings);
  const headerIndices = dorchesterIndicesPorHeader_(headers);

  const filasConValoresPorHeader = filas.map(function (fila) {
    const valoresPorHeader = {};
    Object.keys(headerIndices).forEach(function (headerNorm) {
      valoresPorHeader[headerNorm] = fila.valores[headerIndices[headerNorm]] || '';
    });
    return { sheetRow: fila.sheetRow, valoresPorHeader: valoresPorHeader };
  });

  const colFoto = headerIndices['fotografia'];
  const colFirma = headerIndices['firma'];

  let imagenesPorFila = {};
  const drawingRidRelativo = dorchesterBuscarRelacionPorTipo_(relsHoja, 'drawing');

  if (drawingRidRelativo) {
    const rutaDrawing = dorchesterResolverRutaRelativa_(rutaHoja, drawingRidRelativo);
    const drawingXml = dorchesterLeerTexto_(bytes, porNombre, rutaDrawing);
    const rutaRelsDrawing = rutaDrawing.replace(/([^/]+)$/, '_rels/$1.rels');
    const relsDrawingXml = dorchesterLeerTexto_(bytes, porNombre, rutaRelsDrawing);
    const relsDrawing = relsDrawingXml ? dorchesterParsearRelaciones_(relsDrawingXml) : {};

    imagenesPorFila = dorchesterParsearAnclasImagenes_(
      drawingXml,
      relsDrawing,
      rutaDrawing,
      colFoto,
      colFirma
    );
  }

  return {
    headers: headers,
    filas: filasConValoresPorHeader,
    ultimaFilaConDatos: ultimaFilaConDatos,
    imagenesPorFila: imagenesPorFila,
    entradasPorNombre: porNombre,
    zipBytes: bytes
  };
}

function dorchesterObtenerBlobImagen_(parsed, rutaImagen) {
  const meta = parsed.entradasPorNombre[rutaImagen];
  if (!meta) {
    throw new Error('No se encontró la imagen "' + rutaImagen + '" dentro del .xlsx.');
  }
  const bytesImagen = dorchesterExtraerEntradaZip_(parsed.zipBytes, meta);
  return Utilities.newBlob(bytesImagen, 'image/jpeg', rutaImagen.substring(rutaImagen.lastIndexOf('/') + 1));
}

function dorchesterLeerTexto_(bytes, porNombre, ruta) {
  const meta = porNombre[ruta];
  if (!meta) return '';
  const contenido = dorchesterExtraerEntradaZip_(bytes, meta);
  return Utilities.newBlob(contenido, 'text/xml', ruta).getDataAsString('UTF-8');
}

/***************************************
 * LECTOR DE ZIP PROPIO (reemplaza Utilities.unzip)
 *
 * Lee el directorio central del ZIP (siempre trae tamaños/CRC correctos,
 * incluso cuando las entradas usan "data descriptor") y descomprime cada
 * entrada deflate envolviéndola en un contenedor GZIP mínimo para
 * reutilizar Utilities.ungzip (descompresor nativo de Apps Script).
 ***************************************/
function dorchesterBytesSinSigno_(bytesConSigno) {
  const resultado = new Array(bytesConSigno.length);
  for (let i = 0; i < bytesConSigno.length; i++) {
    const b = bytesConSigno[i];
    resultado[i] = b < 0 ? b + 256 : b;
  }
  return resultado;
}

function dorchesterLeerUInt16LE_(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function dorchesterLeerUInt32LE_(bytes, offset) {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>> 0
  );
}

function dorchesterBytesATextoAscii_(bytes, offset, longitud) {
  let texto = '';
  for (let i = 0; i < longitud; i++) {
    texto += String.fromCharCode(bytes[offset + i]);
  }
  return texto;
}

function dorchesterLeerZip_(bytes) {
  const FIRMA_EOCD = 0x06054b50;
  const FIRMA_CD = 0x02014b50;
  const limiteInferior = Math.max(0, bytes.length - 22 - 65535);
  let offsetEocd = -1;

  for (let i = bytes.length - 22; i >= limiteInferior; i--) {
    if (dorchesterLeerUInt32LE_(bytes, i) === FIRMA_EOCD) {
      offsetEocd = i;
      break;
    }
  }

  if (offsetEocd === -1) {
    throw new Error('No se encontró el fin del directorio central del ZIP (archivo corrupto o no es un .xlsx válido).');
  }

  const totalEntradas = dorchesterLeerUInt16LE_(bytes, offsetEocd + 10);
  const offsetDirectorioCentral = dorchesterLeerUInt32LE_(bytes, offsetEocd + 16);

  const entradas = [];
  let ptr = offsetDirectorioCentral;

  for (let i = 0; i < totalEntradas; i++) {
    if (dorchesterLeerUInt32LE_(bytes, ptr) !== FIRMA_CD) {
      throw new Error('Directorio central del ZIP corrupto en la entrada ' + i + '.');
    }

    const metodo = dorchesterLeerUInt16LE_(bytes, ptr + 10);
    const crc32 = dorchesterLeerUInt32LE_(bytes, ptr + 16);
    const compressedSize = dorchesterLeerUInt32LE_(bytes, ptr + 20);
    const uncompressedSize = dorchesterLeerUInt32LE_(bytes, ptr + 24);
    const nameLen = dorchesterLeerUInt16LE_(bytes, ptr + 28);
    const extraLen = dorchesterLeerUInt16LE_(bytes, ptr + 30);
    const commentLen = dorchesterLeerUInt16LE_(bytes, ptr + 32);
    const localHeaderOffset = dorchesterLeerUInt32LE_(bytes, ptr + 42);
    const name = dorchesterBytesATextoAscii_(bytes, ptr + 46, nameLen);

    entradas.push({
      name: name,
      metodo: metodo,
      crc32: crc32,
      compressedSize: compressedSize,
      uncompressedSize: uncompressedSize,
      localHeaderOffset: localHeaderOffset
    });

    ptr += 46 + nameLen + extraLen + commentLen;
  }

  return entradas;
}

function dorchesterExtraerEntradaZip_(bytes, meta) {
  const FIRMA_LFH = 0x04034b50;
  const offset = meta.localHeaderOffset;

  if (dorchesterLeerUInt32LE_(bytes, offset) !== FIRMA_LFH) {
    throw new Error('Encabezado local del ZIP inválido para "' + meta.name + '".');
  }

  const nameLen = dorchesterLeerUInt16LE_(bytes, offset + 26);
  const extraLen = dorchesterLeerUInt16LE_(bytes, offset + 28);
  const inicioDatos = offset + 30 + nameLen + extraLen;
  const comprimido = bytes.slice(inicioDatos, inicioDatos + meta.compressedSize);

  if (meta.metodo === 0) {
    return comprimido; // almacenado sin comprimir
  }

  if (meta.metodo !== 8) {
    throw new Error('Método de compresión no soportado (' + meta.metodo + ') para "' + meta.name + '".');
  }

  // Envolver el stream deflate crudo en un contenedor GZIP mínimo para que
  // Utilities.ungzip (que solo entiende GZIP, no deflate crudo) lo acepte.
  const encabezadoGzip = [0x1f, 0x8b, 0x08, 0x00, 0, 0, 0, 0, 0x00, 0xff];
  const tam = meta.uncompressedSize;
  const pieGzip = [
    meta.crc32 & 0xff, (meta.crc32 >>> 8) & 0xff, (meta.crc32 >>> 16) & 0xff, (meta.crc32 >>> 24) & 0xff,
    tam & 0xff, (tam >>> 8) & 0xff, (tam >>> 16) & 0xff, (tam >>> 24) & 0xff
  ];
  const gzipBytes = encabezadoGzip.concat(comprimido, pieGzip);
  const gzipBlob = Utilities.newBlob(gzipBytes, 'application/x-gzip', meta.name + '.gz');

  return Utilities.ungzip(gzipBlob).getBytes();
}

function dorchesterDecodificarEntidadesXml_(texto) {
  return safeTrim_(texto)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, function (match, dec) {
      return String.fromCharCode(Number(dec));
    })
    .replace(/&#x([0-9a-fA-F]+);/g, function (match, hex) {
      return String.fromCharCode(parseInt(hex, 16));
    })
    .replace(/&amp;/g, '&');
}

function dorchesterObtenerRIdHoja_(workbookXml, nombreHoja) {
  const regexSheet = /<sheet\b([^>]*)\/?>/g;
  let match;

  while ((match = regexSheet.exec(workbookXml)) !== null) {
    const atributos = match[1];
    const nameMatch = atributos.match(/name="([^"]*)"/);
    const ridMatch = atributos.match(/r:id="([^"]*)"/);

    if (nameMatch && ridMatch && dorchesterDecodificarEntidadesXml_(nameMatch[1]).toLowerCase() === nombreHoja.toLowerCase()) {
      return ridMatch[1];
    }
  }

  return '';
}

function dorchesterParsearRelaciones_(relsXml) {
  const relaciones = {};
  const regex = /<Relationship\b([^>]*)\/?>/g;
  let match;

  while ((match = regex.exec(relsXml)) !== null) {
    const atributos = match[1];
    const idMatch = atributos.match(/Id="([^"]*)"/);
    const targetMatch = atributos.match(/Target="([^"]*)"/);
    const typeMatch = atributos.match(/Type="([^"]*)"/);

    if (idMatch && targetMatch) {
      relaciones[idMatch[1]] = targetMatch[1];
      if (typeMatch) {
        relaciones['__tipo__' + idMatch[1]] = typeMatch[1];
      }
    }
  }

  return relaciones;
}

function dorchesterBuscarRelacionPorTipo_(relaciones, tipoParcial) {
  const ids = Object.keys(relaciones).filter(function (clave) {
    return clave.indexOf('__tipo__') !== 0;
  });

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const tipo = relaciones['__tipo__' + id] || '';
    if (tipo.toLowerCase().indexOf(tipoParcial.toLowerCase()) !== -1) {
      return relaciones[id];
    }
  }

  return '';
}

function dorchesterResolverRutaRelativa_(rutaBase, rutaRelativa) {
  if (rutaRelativa.indexOf('/') === 0) {
    return rutaRelativa.replace(/^\//, '');
  }

  const segmentosBase = rutaBase.split('/');
  segmentosBase.pop();
  const segmentosRelativos = rutaRelativa.split('/');

  segmentosRelativos.forEach(function (segmento) {
    if (segmento === '..') {
      segmentosBase.pop();
    } else if (segmento !== '.') {
      segmentosBase.push(segmento);
    }
  });

  return segmentosBase.join('/');
}

function dorchesterParsearSharedStrings_(sharedStringsXml) {
  const strings = [];
  const regexSi = /<si>([\s\S]*?)<\/si>/g;
  let match;

  while ((match = regexSi.exec(sharedStringsXml)) !== null) {
    const bloque = match[1];
    const textos = [];
    const regexT = /<t[^>]*>([\s\S]*?)<\/t>/g;
    let matchT;

    while ((matchT = regexT.exec(bloque)) !== null) {
      textos.push(dorchesterDecodificarEntidadesXml_(matchT[1]));
    }

    strings.push(textos.join(''));
  }

  return strings;
}

function dorchesterColumnaLetraAIndice_(letra) {
  let indice = 0;
  for (let i = 0; i < letra.length; i++) {
    indice = indice * 26 + (letra.charCodeAt(i) - 64);
  }
  return indice - 1;
}

function dorchesterParsearFilas_(sheetXml, sharedStrings) {
  const regexRow = /<row\b([^>]*)>([\s\S]*?)<\/row>/g;
  const regexCell = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let matchRow;
  let headers = [];
  const filas = [];
  let ultimaFilaConDatos = 1;

  while ((matchRow = regexRow.exec(sheetXml)) !== null) {
    const atributosFila = matchRow[1];
    const contenidoFila = matchRow[2];
    const rMatch = atributosFila.match(/\br="(\d+)"/);
    const numeroFila = rMatch ? Number(rMatch[1]) : null;

    if (!numeroFila) continue;

    const valoresPorColumna = {};
    let maxColIndice = -1;
    let matchCell;
    regexCell.lastIndex = 0;

    while ((matchCell = regexCell.exec(contenidoFila)) !== null) {
      const atributosCelda = matchCell[1];
      const contenidoCelda = matchCell[2] || '';
      const refMatch = atributosCelda.match(/\br="([A-Z]+)\d+"/);

      if (!refMatch) continue;

      const colIndice = dorchesterColumnaLetraAIndice_(refMatch[1]);
      const tipoMatch = atributosCelda.match(/\bt="([^"]*)"/);
      const tipo = tipoMatch ? tipoMatch[1] : '';

      let valor = '';

      if (tipo === 'inlineStr') {
        const isMatch = contenidoCelda.match(/<is>([\s\S]*?)<\/is>/);
        if (isMatch) {
          const textos = [];
          const regexT = /<t[^>]*>([\s\S]*?)<\/t>/g;
          let matchT;
          while ((matchT = regexT.exec(isMatch[1])) !== null) {
            textos.push(dorchesterDecodificarEntidadesXml_(matchT[1]));
          }
          valor = textos.join('');
        }
      } else if (tipo === 's') {
        const vMatch = contenidoCelda.match(/<v>([\s\S]*?)<\/v>/);
        const indiceShared = vMatch ? Number(vMatch[1]) : -1;
        valor = indiceShared >= 0 && sharedStrings[indiceShared] !== undefined
          ? sharedStrings[indiceShared]
          : '';
      } else {
        const vMatch = contenidoCelda.match(/<v>([\s\S]*?)<\/v>/);
        valor = vMatch ? dorchesterDecodificarEntidadesXml_(vMatch[1]) : '';
      }

      valoresPorColumna[colIndice] = valor;
      if (colIndice > maxColIndice) maxColIndice = colIndice;
    }

    const valoresFila = [];
    for (let c = 0; c <= maxColIndice; c++) {
      valoresFila.push(valoresPorColumna[c] !== undefined ? valoresPorColumna[c] : '');
    }

    if (numeroFila === 1) {
      headers = valoresFila;
    } else {
      filas.push({ sheetRow: numeroFila, valores: valoresFila });
      if (numeroFila > ultimaFilaConDatos) ultimaFilaConDatos = numeroFila;
    }
  }

  return { headers: headers, filas: filas, ultimaFilaConDatos: ultimaFilaConDatos };
}

function dorchesterIndicesPorHeader_(headers) {
  const indices = {};
  headers.forEach(function (header, indice) {
    const normalizado = normalizeHeader_(header);
    if (normalizado && indices[normalizado] === undefined) {
      indices[normalizado] = indice;
    }
  });
  return indices;
}

function dorchesterParsearAnclasImagenes_(drawingXml, relsDrawing, rutaDrawing, colFoto, colFirma) {
  const imagenesPorFila = {};
  const regexAnchor = /<xdr:twoCellAnchor\b[^>]*>([\s\S]*?)<\/xdr:twoCellAnchor>/g;
  let matchAnchor;

  while ((matchAnchor = regexAnchor.exec(drawingXml)) !== null) {
    const bloque = matchAnchor[1];
    const fromMatch = bloque.match(
      /<xdr:from>\s*<xdr:col>(\d+)<\/xdr:col>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/
    );
    const embedMatch = bloque.match(/r:embed="(rId\d+)"/);

    if (!fromMatch || !embedMatch) continue;

    const colAncla = Number(fromMatch[1]);
    const filaAncla0 = Number(fromMatch[2]);
    const sheetRow = filaAncla0 + 1; // xdr:row es 0-indexado; la fila 1 (encabezado) = índice 0.
    const rutaRelativaImagen = relsDrawing[embedMatch[1]];

    if (!rutaRelativaImagen) continue;

    const rutaImagen = dorchesterResolverRutaRelativa_(rutaDrawing, rutaRelativaImagen);

    if (!imagenesPorFila[sheetRow]) {
      imagenesPorFila[sheetRow] = {};
    }

    if (colAncla === colFoto) {
      imagenesPorFila[sheetRow].FOTO = rutaImagen;
    } else if (colAncla === colFirma) {
      imagenesPorFila[sheetRow].FIRMA = rutaImagen;
    }
  }

  return imagenesPorFila;
}
