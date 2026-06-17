function onFormSubmit(e) {
  const ADMIN_EMAIL = "bulevarverdeadmon@gmail.com";
  const CC_EMAIL = "consejo.bulevarverde@gmail.com";
  const SHEET_NAME = "BulevarVerde PQRS";

  try {
    if (!e || !e.range) {
      throw new Error("Este script debe ejecutarse desde el trigger de envío de formulario.");
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME) || ss.getActiveSheet();

    const row = e.range.getRow();
    const lastColumn = sheet.getLastColumn();

    const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    const values = sheet.getRange(row, 1, 1, lastColumn).getValues()[0];

    const data = {};
    headers.forEach((h, i) => {
      data[safeTrimPQRS_(h)] = values[i];
    });

    const fecha = new Date();
    const fechaStr = Utilities.formatDate(
      fecha,
      Session.getScriptTimeZone(),
      "yyyy-MM-dd HH:mm"
    );

    const consecutivo = Utilities.formatDate(
      fecha,
      Session.getScriptTimeZone(),
      "yyyyMMdd-HHmmss"
    );

    const idCaso = `PQRS-${consecutivo}`;
    const asunto = `[Bulevar Verde] Nueva PQRS recibida - ${idCaso}`;

    const nombre = getPQRSValue_(data, ["Nombre completo", "Nombre"]);
    const torre = getPQRSValue_(data, ["Torre"]);
    const apto = getPQRSValue_(data, ["Numero de Apartamento", "Número de Apartamento", "Apartamento", "Apto"]);
    const email = getPQRSValue_(data, ["Correo electrónico", "Dirección de correo electrónico", "Email"]);
    const tipoSolicitud = getPQRSValue_(data, ["Tipo de solicitud"]);
    const categoria = getPQRSValue_(data, ["Categoría", "Categoria"]);
    const descripcion = getPQRSValue_(data, [
      "Descripción detallada de la solicitud",
      "Descripcion detallada de la solicitud",
      "Escribe tu PQRS",
      "PQRS"
    ]);

    const cuerpo =
`Se ha recibido una nueva PQRS.

ID del caso: ${idCaso}

Datos del solicitante:
Nombre completo: ${nombre}
Torre: ${torre}
Número de Apartamento: ${apto}
Correo electrónico: ${email}

Detalle de la solicitud:
Tipo de solicitud: ${tipoSolicitud}
Categoría: ${categoria}
Descripción detallada de la solicitud:
${descripcion}

Estado inicial: Pendiente

Fecha de recepción: ${fechaStr}

Este correo fue generado automáticamente desde el formulario de PQRS de Bulevar Verde.`;

    MailApp.sendEmail({
      to: ADMIN_EMAIL,
      cc: CC_EMAIL,
      subject: asunto,
      body: cuerpo
    });

    // Opcional: escribir ID del caso si existe la columna
    setPQRSColumnIfExists_(sheet, headers, row, "ID Caso", idCaso);
    setPQRSColumnIfExists_(sheet, headers, row, "Estado", "Pendiente");
    setPQRSColumnIfExists_(sheet, headers, row, "Fecha Gestión", fechaStr);

    Logger.log("PQRS enviada correctamente: " + idCaso);
    Logger.log("Fila procesada: " + row);

  } catch (error) {
    Logger.log("Error en onFormSubmit PQRS: " + (error.message || String(error)));
    throw error;
  }
}


/***************************************
 * HELPERS PQRS
 ***************************************/
function safeTrimPQRS_(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function getPQRSValue_(data, possibleKeys) {
  for (let i = 0; i < possibleKeys.length; i++) {
    const key = possibleKeys[i];
    if (data[key] !== undefined && data[key] !== null && data[key] !== "") {
      return data[key];
    }
  }
  return "";
}

function setPQRSColumnIfExists_(sheet, headers, row, columnName, value) {
  const idx = headers.map(h => safeTrimPQRS_(h)).indexOf(columnName);

  if (idx !== -1) {
    sheet.getRange(row, idx + 1).setValue(value);
  }
}


/***************************************
 * CREAR TRIGGER PQRS
 * Ejecutar una sola vez manualmente
 ***************************************/
function crearTriggerPQRS() {
  eliminarTriggersPQRS_();

  ScriptApp.newTrigger("onFormSubmit")
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet())
    .onFormSubmit()
    .create();

  Logger.log("Trigger PQRS creado correctamente.");
}


/***************************************
 * ELIMINAR TRIGGERS PQRS DUPLICADOS
 ***************************************/
function eliminarTriggersPQRS_() {
  const triggers = ScriptApp.getProjectTriggers();

  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === "onFormSubmit") {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}