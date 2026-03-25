function testOnFormSubmit() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();

  Logger.log("=== SPREADSHEET INFO ===");
  Logger.log("Nombre archivo: " + ss.getName());
  Logger.log("ID: " + ss.getId());
  Logger.log("URL: " + ss.getUrl());

  Logger.log("=== SHEET INFO ===");
  Logger.log("Nombre hoja: " + sheet.getName());
  Logger.log("Sheet ID: " + sheet.getSheetId());
  Logger.log("Filas totales: " + sheet.getMaxRows());
  Logger.log("Columnas totales: " + sheet.getMaxColumns());
  Logger.log("Última fila con datos: " + sheet.getLastRow());
  Logger.log("Última columna con datos: " + sheet.getLastColumn());


  const lastRow = sheet.getLastRow();

  const fakeEvent = {
    range: sheet.getRange(lastRow, 1)
  };

  onFormSubmit(fakeEvent);
}

function onFormSubmit(e) {
  const ADMIN_EMAIL = "bulevarverdeadmon@gmail.com";
  //const ADMIN_EMAIL = "h.andresc1127@gmail.com";
  const CC_EMAIL = "consejo.bulevarverde@gmail.com";

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("BulevarVerde PQRS") 
             || SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const row = e.range.getRow();
  const lastColumn = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(h => String(h).trim());
  const values = sheet.getRange(row, 1, 1, lastColumn).getValues()[0];

  // Función para encontrar columna por nombre
  function getColIndex(name) {
    return headers.findIndex(h => h.toLowerCase() === name.toLowerCase()) + 1;
  }

  // Generar ID
  const idCol = getColIndex("ID Caso");
  const estadoCol = getColIndex("Estado");
  const responsableCol = getColIndex("Responsable");


  const data = {};
  headers.forEach((h, i) => data[h] = values[i]);

  const fecha = new Date();
  const consecutivo = Utilities.formatDate(fecha, Session.getScriptTimeZone(), "yyyyMMdd-HHmmss");
  const idCaso = `PQRS-${consecutivo}`;

  const asunto = `[Bulevar Verde] PQRS recibida - ${idCaso}`;

  const cuerpo =
`Se ha recibido una nueva PQRS.

ID del caso: ${idCaso}

Datos del solicitante:
Nombre completo: ${data["Nombre completo"] || ""}
Torre: ${data["Torre"] || ""}
Apartamento: ${data["Apartamento"] || ""}
Correo electrónico: ${data["Dirección de correo electrónico"] || ""}

Detalle de la solicitud:
Tipo de solicitud: ${data["Tipo"] || ""}
Categoría: ${data["Categoría"] || ""}
Descripción detallada de la solicitud: ${data["Descripción detallada de la solicitud"] || data["Escribe tu PQRS"] || ""}

Fecha de recepción: ${Utilities.formatDate(fecha, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm")}

Este correo fue generado automáticamente desde el formulario de PQRS de Bulevar Verde.`;


// Escribir valores
if (idCol > 0) sheet.getRange(row, idCol).setValue(idCaso);
if (estadoCol > 0) sheet.getRange(row, estadoCol).setValue("Abierto");
if (responsableCol > 0) sheet.getRange(row, responsableCol).setValue("Admon");

Logger.log("Headers: " + JSON.stringify(headers));
Logger.log("Values: " + JSON.stringify(values));
Logger.log("Data: " + JSON.stringify(data));
Logger.log("Cuerpo: "+ cuerpo);

  MailApp.sendEmail({
    to: ADMIN_EMAIL,
    cc: CC_EMAIL,
    subject: asunto,
    body: cuerpo
  });
}