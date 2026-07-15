const CARTERA_SHEET_NAME = "cartera";

// Archivo externo donde tienes los correos por apartamento.
const CARTERA_CORREOS_SPREADSHEET_ID = "1MjNg_qR134dB-8vdK0NEJyeXlLS848dsOpu-bylkVBQ";
const CARTERA_CORREOS_SHEET_GID = 0;

const CARTERA_SHEET_RESUMEN = "resumen_notif_cartera";
const CARTERA_SHEET_BITACORA = "bitacora_notif_cartera";

const CARTERA_SALDO_MINIMO = 400000;

// Límite diario de tu cuenta.
const CARTERA_MAX_ENVIOS_POR_DIA = 100;

const CARTERA_EMAIL_REPLY_TO = "bulevarverdeadmon@gmail.com";
const CARTERA_EMAIL_FROM_NAME = "Administración Bulevar Verde";

const CARTERA_EMAIL_DRY_RUN = false;
const CARTERA_EMAIL_DRY_RUN_TO = "bulevarverdeadmon@gmail.com";

const CARTERA_HORA_ENVIO = 8;
const CARTERA_MINUTO_ENVIO = 0;

function prepararResumenNotificacionesCartera() {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(30000)) {
    throw new Error("No se pudo obtener bloqueo. Intenta nuevamente en unos segundos.");
  }

  try {
    // Usa el spreadsheet donde está instalado el script.
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (!ss) {
      throw new Error("No se pudo identificar el spreadsheet asociado al script.");
    }

    const sourceSheet = carteraGetSheetByNameFlexible_(ss, CARTERA_SHEET_NAME);

    if (!sourceSheet) {
      throw new Error(
        'No se encontró la hoja de cartera "' + CARTERA_SHEET_NAME +
        '" dentro del spreadsheet asociado al script.'
      );
    }

    const lastRow = sourceSheet.getLastRow();
    const lastCol = sourceSheet.getLastColumn();

    if (lastRow < 2) {
      Logger.log("La hoja cartera no tiene registros.");
      return;
    }

    const data = sourceSheet.getRange(1, 1, lastRow, lastCol).getValues();
    const registros = carteraConstruirRegistrosDesdeSheet_(data);

    const mapaCorreos = carteraLeerMapaCorreosAptos_();
    const mapaNotificados = carteraLeerMapaBitacoraCartera_(ss);

    const periodo = carteraPeriodoActual_();
    const hoy = carteraFechaSoloDia_(new Date());

    const filtrados = registros
      .filter(function (item) {
        return item.saldoActual > CARTERA_SALDO_MINIMO && item.aptoNorm;
      })
      .sort(function (a, b) {
        return b.saldoActual - a.saldoActual;
      });

    const totalDiasEstimados = Math.ceil(filtrados.length / CARTERA_MAX_ENVIOS_POR_DIA);

    const rows = filtrados.map(function (item, index) {
      const lote = Math.floor(index / CARTERA_MAX_ENVIOS_POR_DIA) + 1;

      const fechaProgramada = new Date(hoy);
      fechaProgramada.setDate(hoy.getDate() + lote - 1);

      const email = mapaCorreos[item.aptoNorm] || "";
      const clave = carteraConstruirClaveNotificacion_(periodo, item.aptoNorm);

      let estado = "PENDIENTE";
      let observaciones = "";

      if (!email) {
        estado = "SIN_EMAIL";
        observaciones = "No se encontró correo para el apartamento.";
      }

      if (mapaNotificados[clave]) {
        estado = "YA_NOTIFICADO";
        observaciones = "Ya existe notificación ENVIADA para este apartamento en el periodo " + periodo + ".";
      }

      return [
        clave,
        periodo,
        item.codigo,
        item.blq,
        item.apto,
        item.aptoNorm,
        item.propietario,
        item.sdoAnterior,
        item.cargos,
        item.saldoActual,
        email,
        lote,
        carteraFormatFecha_(fechaProgramada),
        estado,
        "",
        "",
        observaciones
      ];
    });

    carteraEscribirResumenNotificaciones_(ss, rows);

    Logger.log("=== RESUMEN CARTERA PREPARADO ===");
    Logger.log("Spreadsheet asociado: " + ss.getName());
    Logger.log("Hoja cartera: " + sourceSheet.getName());
    Logger.log("Registros cartera leídos: " + registros.length);
    Logger.log("Registros con saldo > " + carteraFormatCOP_(CARTERA_SALDO_MINIMO) + ": " + filtrados.length);
    Logger.log("Máximo correos por día: " + CARTERA_MAX_ENVIOS_POR_DIA);
    Logger.log("Días estimados de envío: " + totalDiasEstimados);
    Logger.log("Hoja generada: " + CARTERA_SHEET_RESUMEN);

  } finally {
    lock.releaseLock();
  }
}

function enviarNotificacionesCarteraPendientes() {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(30000)) {
    throw new Error("No se pudo obtener bloqueo. Intenta nuevamente en unos segundos.");
  }

  try {
    const ss = carteraGetTargetSpreadsheet_();
    const sheet = ss.getSheetByName(CARTERA_SHEET_RESUMEN);

    if (!sheet) {
      throw new Error("No existe la hoja " + CARTERA_SHEET_RESUMEN + ". Ejecuta primero prepararResumenNotificacionesCartera().");
    }

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();

    if (lastRow < 2) {
      Logger.log("No hay registros pendientes de cartera.");
      return;
    }

    const range = sheet.getRange(1, 1, lastRow, lastCol);
    const data = range.getValues();

    const headers = data[0].map(function (h) {
      return carteraNormalizeHeader_(h);
    });

    const col = carteraCrearColMap_(headers);

    const idxClave = col["clavenotificacion"];
    const idxPeriodo = col["periodo"];
    const idxCodigo = col["codigo"];
    const idxBlq = col["blq"];
    const idxApto = col["apto"];
    const idxAptoNorm = col["aptonorm"];
    const idxPropietario = col["propietario"];
    const idxSaldoActual = col["saldoactual"];
    const idxEmail = col["email"];
    const idxFechaProgramada = col["fechaprogramada"];
    const idxEstado = col["estado"];
    const idxFechaEnvio = col["fechaenvio"];
    const idxAsunto = col["asunto"];
    const idxObservaciones = col["observaciones"];

    const hoy = carteraFechaSoloDia_(new Date());
    const nowTexto = carteraFormatFechaHora_(new Date());

    let enviados = 0;
    let omitidos = 0;
    let errores = 0;

    const quota = MailApp.getRemainingDailyQuota();

    if (quota <= 0 && !CARTERA_EMAIL_DRY_RUN) {
      throw new Error("No hay cuota disponible de envío de correos.");
    }

    const maxEnvios = Math.min(
      CARTERA_MAX_ENVIOS_POR_DIA,
      CARTERA_EMAIL_DRY_RUN ? CARTERA_MAX_ENVIOS_POR_DIA : quota
    );

    for (let i = 1; i < data.length; i++) {
      if (enviados >= maxEnvios) break;

      const row = data[i];

      const estado = carteraSafeTrim_(row[idxEstado]).toUpperCase();

      if (estado !== "PENDIENTE") {
        omitidos++;
        continue;
      }

      const fechaProgramada = carteraParseFecha_(row[idxFechaProgramada]);

      if (fechaProgramada && carteraFechaSoloDia_(fechaProgramada) > hoy) {
        omitidos++;
        continue;
      }

      const clave = carteraSafeTrim_(row[idxClave]);
      const periodo = carteraSafeTrim_(row[idxPeriodo]);
      const codigo = carteraSafeTrim_(row[idxCodigo]);
      const blq = carteraSafeTrim_(row[idxBlq]);
      const apto = carteraSafeTrim_(row[idxApto]);
      const aptoNorm = carteraSafeTrim_(row[idxAptoNorm]);
      const propietario = carteraSafeTrim_(row[idxPropietario]);
      const saldoActual = Number(row[idxSaldoActual]) || 0;
      const emailReal = carteraSafeTrim_(row[idxEmail]);

      if (!emailReal) {
        row[idxEstado] = "SIN_EMAIL";
        row[idxObservaciones] = "No se encontró correo para el apartamento.";
        errores++;
        continue;
      }

      const subject = "NO RESPONDER - Invitación especial para normalizar su estado de cuenta - Apto " + apto;
      const htmlBody = construirHtmlNotificacionCartera_({
        periodo: periodo,
        codigo: codigo,
        blq: blq,
        apartamento: apto,
        apartamentoNorm: aptoNorm,
        propietario: propietario,
        saldoActual: saldoActual
      });

      const emailDestino = CARTERA_EMAIL_DRY_RUN ? CARTERA_EMAIL_DRY_RUN_TO : emailReal;

      try {
        if (!CARTERA_EMAIL_DRY_RUN) {
          MailApp.sendEmail({
            to: emailDestino,
            replyTo: CARTERA_EMAIL_REPLY_TO,
            subject: subject,
            htmlBody: htmlBody,
            name: CARTERA_EMAIL_FROM_NAME
          });
        }

        const estadoFinal = CARTERA_EMAIL_DRY_RUN ? "SIMULADO" : "ENVIADO";

        row[idxEstado] = estadoFinal;
        row[idxFechaEnvio] = nowTexto;
        row[idxAsunto] = subject;
        row[idxObservaciones] = CARTERA_EMAIL_DRY_RUN
          ? "Simulado. Correo real era: " + emailReal
          : "Correo enviado correctamente.";

        carteraRegistrarBitacoraCartera_(ss, {
          clave: clave,
          periodo: periodo,
          fechaHora: nowTexto,
          codigo: codigo,
          blq: blq,
          apartamento: apto,
          apartamentoNorm: aptoNorm,
          propietario: propietario,
          saldoActual: saldoActual,
          emailDestino: emailDestino,
          emailReal: emailReal,
          estado: estadoFinal,
          asunto: subject,
          observaciones: row[idxObservaciones],
          dryRun: CARTERA_EMAIL_DRY_RUN ? "SI" : "NO"
        });

        enviados++;

      } catch (error) {
        row[idxEstado] = "ERROR";
        row[idxFechaEnvio] = nowTexto;
        row[idxAsunto] = subject;
        row[idxObservaciones] = "Error enviando correo: " + error.message;
        errores++;
      }
    }

    sheet.getRange(1, 1, data.length, lastCol).setValues(data);

    Logger.log("=== ENVÍO CARTERA FINALIZADO ===");
    Logger.log("Enviados/simulados: " + enviados);
    Logger.log("Omitidos: " + omitidos);
    Logger.log("Errores: " + errores);
    Logger.log("Máximo permitido en esta ejecución: " + maxEnvios);

    if (carteraContarPendientes_(sheet) === 0) {
      carteraBorrarTriggersFuncion_("enviarNotificacionesCarteraPendientes");
      Logger.log("No quedan pendientes. Trigger de cartera eliminado.");
    }

  } finally {
    lock.releaseLock();
  }
}

function carteraBorrarTriggersFuncion_(funcion) {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === funcion) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function carteraConstruirRegistrosDesdeSheet_(data) {
  const headers = data[0].map(function (h) {
    return carteraNormalizeHeader_(h);
  });

  const col = carteraCrearColMap_(headers);

  const idxCodigo = carteraBuscarColumna_(col, ["codigo", "código"]);
  const idxBlq = carteraBuscarColumna_(col, ["blq", "bloque", "torre"]);
  const idxApto = carteraBuscarColumna_(col, ["apto", "apartamento"]);
  const idxPropietario = carteraBuscarColumna_(col, ["propietario", "nombre"]);
  const idxSdoAnterior = carteraBuscarColumna_(col, ["sdo anterior", "saldo anterior"]);
  const idxCargos = carteraBuscarColumna_(col, ["cargos"]);
  const idxSaldoActual = carteraBuscarColumna_(col, ["saldo actual", "sdo actual"]);

  if (idxApto === -1) throw new Error('No se encontró columna "Apto".');
  if (idxSaldoActual === -1) throw new Error('No se encontró columna "Saldo actual".');

  return data.slice(1).map(function (row) {
    const apto = idxApto !== -1 ? carteraSafeTrim_(row[idxApto]) : "";
    const aptoNorm = carteraNormalizeApto_(apto);

    return {
      codigo: idxCodigo !== -1 ? carteraSafeTrim_(row[idxCodigo]) : "",
      blq: idxBlq !== -1 ? carteraSafeTrim_(row[idxBlq]) : "",
      apto: apto,
      aptoNorm: aptoNorm,
      propietario: idxPropietario !== -1 ? carteraSafeTrim_(row[idxPropietario]) : "",
      sdoAnterior: idxSdoAnterior !== -1 ? carteraParseMoney_(row[idxSdoAnterior]) : 0,
      cargos: idxCargos !== -1 ? carteraParseMoney_(row[idxCargos]) : 0,
      saldoActual: carteraParseMoney_(row[idxSaldoActual])
    };
  });
}

function carteraLeerMapaCorreosAptos_() {
  const ss = SpreadsheetApp.openById(CARTERA_CORREOS_SPREADSHEET_ID);
  const sheet = carteraGetSheetByGid_(ss, CARTERA_CORREOS_SHEET_GID) || ss.getSheets()[0];

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();

  const mapa = {};

  if (lastRow < 2) {
    return mapa;
  }

  const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = data[0].map(function (h) {
    return carteraNormalizeHeader_(h);
  });

  const col = carteraCrearColMap_(headers);

  const idxApto = carteraBuscarColumna_(col, ["apto", "apartamento", "unidad"]);
  const idxEmail = carteraBuscarColumna_(col, ["email", "correo", "correo electronico", "correo electrónico"]);

  if (idxApto === -1 || idxEmail === -1) {
    throw new Error("No se encontraron columnas de apartamento y correo en el archivo de correos.");
  }

  data.slice(1).forEach(function (row) {
    const aptoNorm = carteraNormalizeApto_(row[idxApto]);
    const email = carteraSafeTrim_(row[idxEmail]);

    if (!aptoNorm || !email) return;

    mapa[aptoNorm] = email;
  });

  return mapa;
}

function carteraEscribirResumenNotificaciones_(ss, rows) {
  let sheet = ss.getSheetByName(CARTERA_SHEET_RESUMEN);

  if (!sheet) {
    sheet = ss.insertSheet(CARTERA_SHEET_RESUMEN);
  }

  sheet.clear();

  const headers = [
    "ClaveNotificacion",
    "Periodo",
    "Codigo",
    "Blq",
    "Apto",
    "AptoNorm",
    "Propietario",
    "SdoAnterior",
    "Cargos",
    "SaldoActual",
    "Email",
    "LoteEnvio",
    "FechaProgramada",
    "Estado",
    "FechaEnvio",
    "Asunto",
    "Observaciones"
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight("bold")
    .setBackground("#fff2cc");

  sheet.setFrozenRows(1);

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }

  sheet.autoResizeColumns(1, headers.length);
}

function construirHtmlNotificacionCartera_(data) {
  const fechaTexto = carteraObtenerFechaComunicacionLarga_();

  return `
    <div style="font-family: Arial, sans-serif; color: #222; line-height: 1.55; font-size: 14px; max-width: 760px;">
      <p>
        <strong>Itagüí, ${fechaTexto}</strong>
      </p>

      <p>
        Señor(a) Propietario(a): 
        <strong>${carteraEscapeHtml_(data.propietario)}</strong><br>
        Apartamento: <strong>${carteraEscapeHtml_(data.apartamento)}</strong>
      </p>

      <p>
        <strong>Asunto:</strong> Invitación especial para normalizar su estado de cuenta
      </p>

      <p>Reciba un cordial saludo.</p>

      <p>
        Desde la Administración del <strong>Club Residencial Bulevar Verde</strong> queremos dirigirnos a usted
        con el mayor respeto y consideración.
      </p>

      <p>
        Hemos identificado que, a la fecha, su inmueble presenta un saldo pendiente por concepto de cuotas
        de administración por valor de <strong>${carteraFormatCOP_(data.saldoActual)}</strong>.
      </p>

      <p>
        Sabemos que en ocasiones pueden presentarse situaciones personales, familiares o económicas que
        dificultan el cumplimiento oportuno de estas obligaciones. Precisamente por ello, antes de acudir
        a otras instancias, queremos invitarlo a acercarse a la Administración para conversar y encontrar
        una alternativa que le permita ponerse al día de una manera viable.
      </p>

      <p>
        Nuestro principal interés no es generar procesos de cobro ni ocasionarle mayores costos. Por el
        contrario, queremos brindarle la oportunidad de revisar su situación y, de ser posible, establecer
        un acuerdo de pago que se ajuste a sus posibilidades y le permita normalizar su cartera.
      </p>

      <p>
        Su aporte es muy importante para la copropiedad. Gracias al pago oportuno de las cuotas de
        administración es posible atender el mantenimiento de las zonas comunes, la seguridad, el aseo,
        los servicios generales y todos aquellos aspectos que contribuyen al bienestar de las familias que
        hacemos parte de esta comunidad.
      </p>

      <p>
        Queremos evitar que su obligación continúe generando intereses de mora y que sea necesario iniciar
        un proceso de cobro prejurídico o jurídico, el cual implica gastos adicionales por concepto de
        honorarios y costas que incrementarán el valor de la deuda.
      </p>

      <p>
        Por ello, lo invitamos cordialmente a visitarnos en la oficina de Administración o a comunicarse
        con nosotros a la mayor brevedad posible. Estamos dispuestos a escuchar su situación y a buscar
        conjuntamente la mejor alternativa para normalizar su estado de cuenta.
      </p>

      <p>
        En caso de requerir información adicional o solicitar revisión de su estado de cuenta, puede
        comunicarse al correo electrónico de la Administración:
        <a href="mailto:${CARTERA_EMAIL_REPLY_TO}">${CARTERA_EMAIL_REPLY_TO}</a>.
      </p>

      <p>
        Confiamos en su compromiso con la copropiedad y esperamos contar con su colaboración para seguir
        construyendo una comunidad organizada, segura y sostenible para todos.
      </p>

      <p>
        Agradecemos de antemano su atención y quedamos atentos a su pronta comunicación.
      </p>

      <p>
        Cordialmente,<br><br>
        <strong>ADMINISTRACIÓN</strong><br>
        <strong>CLUB RESIDENCIAL BULEVAR VERDE</strong>
      </p>
    </div>
  `;
}
function carteraRegistrarBitacoraCartera_(ss, data) {
  let sheet = ss.getSheetByName(CARTERA_SHEET_BITACORA);

  if (!sheet) {
    sheet = ss.insertSheet(CARTERA_SHEET_BITACORA);

    sheet.getRange(1, 1, 1, 15).setValues([[
      "ClaveNotificacion",
      "Periodo",
      "FechaHora",
      "Codigo",
      "Blq",
      "Apartamento",
      "AptoNorm",
      "Propietario",
      "SaldoActual",
      "EmailDestino",
      "EmailReal",
      "Estado",
      "Asunto",
      "Observaciones",
      "DryRun"
    ]]);

    sheet.getRange(1, 1, 1, 15)
      .setFontWeight("bold")
      .setBackground("#d9ead3");

    sheet.setFrozenRows(1);
  }

  sheet.appendRow([
    data.clave,
    data.periodo,
    data.fechaHora,
    data.codigo,
    data.blq,
    data.apartamento,
    data.apartamentoNorm,
    data.propietario,
    data.saldoActual,
    data.emailDestino,
    data.emailReal,
    data.estado,
    data.asunto,
    data.observaciones,
    data.dryRun
  ]);
}

function carteraLeerMapaBitacoraCartera_(ss) {
  const sheet = ss.getSheetByName(CARTERA_SHEET_BITACORA);
  const mapa = {};

  if (!sheet || sheet.getLastRow() < 2) {
    return mapa;
  }

  const data = sheet.getDataRange().getValues();

  const headers = data[0].map(function (h) {
    return carteraNormalizeHeader_(h);
  });

  const col = carteraCrearColMap_(headers);

  const idxClave = col["clavenotificacion"];
  const idxEstado = col["estado"];

  if (idxClave === undefined || idxEstado === undefined) {
    return mapa;
  }

  data.slice(1).forEach(function (row) {
    const clave = carteraSafeTrim_(row[idxClave]);
    const estado = carteraSafeTrim_(row[idxEstado]).toUpperCase();

    if (clave && estado === "ENVIADO") {
      mapa[clave] = true;
    }
  });

  return mapa;
}

function carteraContarPendientes_(sheet) {
  const data = sheet.getDataRange().getValues();

  if (data.length < 2) return 0;

  const headers = data[0].map(function (h) {
    return carteraNormalizeHeader_(h);
  });

  const col = carteraCrearColMap_(headers);
  const idxEstado = col["estado"];

  if (idxEstado === undefined) return 0;

  let pendientes = 0;

  data.slice(1).forEach(function (row) {
    if (carteraSafeTrim_(row[idxEstado]).toUpperCase() === "PENDIENTE") {
      pendientes++;
    }
  });

  return pendientes;
}

function carteraGetTargetSpreadsheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (!ss) {
    throw new Error("No se pudo identificar el spreadsheet destino. Ejecuta este script desde el archivo Vigilancia.");
  }

  return ss;
}

function carteraGetSheetByNameFlexible_(ss, name) {
  const exact = ss.getSheetByName(name);
  if (exact) return exact;

  const target = carteraNormalizeHeader_(name);

  return ss.getSheets().find(function (sheet) {
    return carteraNormalizeHeader_(sheet.getName()) === target;
  }) || null;
}

function carteraGetSheetByGid_(ss, gid) {
  const sheets = ss.getSheets();

  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === gid) {
      return sheets[i];
    }
  }

  return null;
}

function carteraCrearColMap_(headers) {
  const col = {};

  headers.forEach(function (h, i) {
    col[h] = i;
  });

  return col;
}

function carteraBuscarColumna_(colMap, nombres) {
  for (let i = 0; i < nombres.length; i++) {
    const key = carteraNormalizeHeader_(nombres[i]);

    if (colMap[key] !== undefined) {
      return colMap[key];
    }
  }

  return -1;
}

function carteraConstruirClaveNotificacion_(periodo, aptoNorm) {
  return "CARTERA_" + periodo + "_" + aptoNorm;
}

function carteraPeriodoActual_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMM");
}

function carteraObtenerFechaComunicacion_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");
}

function carteraFechaSoloDia_(fecha) {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  return d;
}

function carteraParseFecha_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return value;
  }

  const raw = carteraSafeTrim_(value);
  if (!raw) return null;

  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function carteraParseMoney_(value) {
  if (typeof value === "number") {
    return Math.round(value);
  }

  const raw = carteraSafeTrim_(value);

  if (!raw) return 0;

  const negative = raw.indexOf("-") !== -1;
  const onlyDigits = raw.replace(/[^\d]/g, "");

  if (!onlyDigits) return 0;

  const number = Number(onlyDigits);

  return negative ? -number : number;
}

function carteraNormalizeApto_(value) {
  const raw = carteraSafeTrim_(value).toUpperCase();

  if (!raw) return "";

  // Evita que registros como CONS1 se conviertan erróneamente en apto 1.
  if (/CONS|CONSTRUCTORA|LOCAL|PARQ|DEPOSITO|DEPÓSITO/.test(raw)) {
    return "";
  }

  if (/^\d+$/.test(raw)) {
    return raw.replace(/^0+(\d)/, "$1");
  }

  const matches = raw.match(/\d{3,5}/g);

  if (!matches || matches.length === 0) {
    return "";
  }

  return matches[matches.length - 1].replace(/^0+(\d)/, "$1");
}

function carteraNormalizeHeader_(value) {
  return carteraSafeTrim_(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function carteraSafeTrim_(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function carteraFormatCOP_(value) {
  const number = Number(value) || 0;

  return "$" + number.toLocaleString("es-CO", {
    maximumFractionDigits: 0
  });
}

function carteraFormatFecha_(fecha) {
  return Utilities.formatDate(fecha, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function carteraFormatFechaHora_(fecha) {
  return Utilities.formatDate(fecha, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
}

function carteraEscapeHtml_(value) {
  return carteraSafeTrim_(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function carteraObtenerFechaComunicacionLarga_() {
  const fecha = new Date();

  const meses = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre"
  ];

  const dia = fecha.getDate();
  const mes = meses[fecha.getMonth()];
  const anio = fecha.getFullYear();

  return dia + " de " + mes + " de " + anio;
}

// ============================================================
// Notificación de felicitaciones para apartamentos al día con su cartera.
// Reutiliza los helpers genéricos definidos arriba en este mismo archivo.
// ============================================================

const FELICITACIONES_SHEET_RESUMEN = "resumen_notif_felicitaciones";

const FELICITACIONES_SALDO_MAXIMO = 300000;

// Límite diario de la cuenta.
const FELICITACIONES_MAX_ENVIOS_POR_DIA = 100;

const FELICITACIONES_EMAIL_REPLY_TO = CARTERA_EMAIL_REPLY_TO;
const FELICITACIONES_EMAIL_FROM_NAME = CARTERA_EMAIL_FROM_NAME;

const FELICITACIONES_EMAIL_DRY_RUN = false;
const FELICITACIONES_EMAIL_DRY_RUN_TO = CARTERA_EMAIL_DRY_RUN_TO;

const FELICITACIONES_HORA_ENVIO = 18;
const FELICITACIONES_MINUTO_ENVIO = 0;

function prepararResumenNotificacionesFelicitaciones() {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(30000)) {
    throw new Error("No se pudo obtener bloqueo. Intenta nuevamente en unos segundos.");
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (!ss) {
      throw new Error("No se pudo identificar el spreadsheet asociado al script.");
    }

    const sourceSheet = carteraGetSheetByNameFlexible_(ss, CARTERA_SHEET_NAME);

    if (!sourceSheet) {
      throw new Error(
        'No se encontró la hoja de cartera "' + CARTERA_SHEET_NAME +
        '" dentro del spreadsheet asociado al script.'
      );
    }

    const lastRow = sourceSheet.getLastRow();
    const lastCol = sourceSheet.getLastColumn();

    if (lastRow < 2) {
      Logger.log("La hoja cartera no tiene registros.");
      return;
    }

    const data = sourceSheet.getRange(1, 1, lastRow, lastCol).getValues();
    const registros = carteraConstruirRegistrosDesdeSheet_(data);

    const mapaCorreos = carteraLeerMapaCorreosAptos_();
    const mapaNotificados = felicitLeerMapaResumenFelicitaciones_(ss);

    const periodo = carteraPeriodoActual_();
    const hoy = carteraFechaSoloDia_(new Date());

    const filtrados = registros
      .filter(function(item) {
        return item.saldoActual <= FELICITACIONES_SALDO_MAXIMO && item.sdoAnterior <= 0 && item.aptoNorm;
      })
      .sort(function(a, b) {
        // Orden descendente: se prioriza a quienes están más cerca de deber
        // FELICITACIONES_SALDO_MAXIMO, para animarlos a seguir al día y evitar que se atrasen.
        return b.saldoActual - a.saldoActual;
      });

    const totalDiasEstimados = Math.ceil(filtrados.length / FELICITACIONES_MAX_ENVIOS_POR_DIA);

    const rows = filtrados.map(function(item, index) {
      const lote = Math.floor(index / FELICITACIONES_MAX_ENVIOS_POR_DIA) + 1;

      const fechaProgramada = new Date(hoy);
      fechaProgramada.setDate(hoy.getDate() + lote - 1);

      const email = mapaCorreos[item.aptoNorm] || "";
      const clave = felicitConstruirClaveNotificacion_(periodo, item.aptoNorm);

      let estado = "PENDIENTE";
      let observaciones = "";

      if (!email) {
        estado = "SIN_EMAIL";
        observaciones = "No se encontró correo para el apartamento.";
      }

      if (mapaNotificados[clave]) {
        estado = "YA_NOTIFICADO";
        observaciones = "Ya existe notificación ENVIADA para este apartamento en el periodo " + periodo + ".";
      }

      return [
        clave,
        periodo,
        item.codigo,
        item.blq,
        item.apto,
        item.aptoNorm,
        item.propietario,
        item.sdoAnterior,
        item.cargos,
        item.saldoActual,
        email,
        lote,
        carteraFormatFecha_(fechaProgramada),
        estado,
        "",
        "",
        observaciones
      ];
    });

    felicitEscribirResumenNotificaciones_(ss, rows);

    Logger.log("=== RESUMEN FELICITACIONES PREPARADO ===");
    Logger.log("Spreadsheet asociado: " + ss.getName());
    Logger.log("Hoja cartera: " + sourceSheet.getName());
    Logger.log("Registros cartera leídos: " + registros.length);
    Logger.log(
      "Registros al día (saldo <= " + carteraFormatCOP_(FELICITACIONES_SALDO_MAXIMO) +
      " y saldo anterior <= 0): " + filtrados.length
    );
    Logger.log("Máximo correos por día: " + FELICITACIONES_MAX_ENVIOS_POR_DIA);
    Logger.log("Días estimados de envío: " + totalDiasEstimados);
    Logger.log("Hoja generada: " + FELICITACIONES_SHEET_RESUMEN);

  } finally {
    lock.releaseLock();
  }
}

function enviarNotificacionesFelicitacionesPendientes() {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(30000)) {
    throw new Error("No se pudo obtener bloqueo. Intenta nuevamente en unos segundos.");
  }

  try {
    const ss = carteraGetTargetSpreadsheet_();
    const sheet = ss.getSheetByName(FELICITACIONES_SHEET_RESUMEN);

    if (!sheet) {
      throw new Error(
        "No existe la hoja " + FELICITACIONES_SHEET_RESUMEN +
        ". Ejecuta primero prepararResumenNotificacionesFelicitaciones()."
      );
    }

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();

    if (lastRow < 2) {
      Logger.log("No hay registros pendientes de felicitaciones.");
      return;
    }

    const range = sheet.getRange(1, 1, lastRow, lastCol);
    const data = range.getValues();

    const headers = data[0].map(function(h) {
      return carteraNormalizeHeader_(h);
    });

    const col = carteraCrearColMap_(headers);

    const idxApto = col["apto"];
    const idxSaldoActual = col["saldoactual"];
    const idxEmail = col["email"];
    const idxFechaProgramada = col["fechaprogramada"];
    const idxEstado = col["estado"];
    const idxFechaEnvio = col["fechaenvio"];
    const idxAsunto = col["asunto"];
    const idxObservaciones = col["observaciones"];
    const idxPeriodo = col["periodo"];
    const idxAptoNorm = col["aptonorm"];
    const idxPropietario = col["propietario"];

    const hoy = carteraFechaSoloDia_(new Date());
    const nowTexto = carteraFormatFechaHora_(new Date());

    let enviados = 0;
    let omitidos = 0;
    let errores = 0;

    const quota = MailApp.getRemainingDailyQuota();

    if (quota <= 0 && !FELICITACIONES_EMAIL_DRY_RUN) {
      throw new Error("No hay cuota disponible de envío de correos.");
    }

    const maxEnvios = Math.min(
      FELICITACIONES_MAX_ENVIOS_POR_DIA,
      FELICITACIONES_EMAIL_DRY_RUN ? FELICITACIONES_MAX_ENVIOS_POR_DIA : quota
    );

    for (let i = 1; i < data.length; i++) {
      if (enviados >= maxEnvios) break;

      const row = data[i];

      const estado = carteraSafeTrim_(row[idxEstado]).toUpperCase();

      if (estado !== "PENDIENTE") {
        omitidos++;
        continue;
      }

      const fechaProgramada = carteraParseFecha_(row[idxFechaProgramada]);

      if (fechaProgramada && carteraFechaSoloDia_(fechaProgramada) > hoy) {
        omitidos++;
        continue;
      }

      const periodo = carteraSafeTrim_(row[idxPeriodo]);
      const apto = carteraSafeTrim_(row[idxApto]);
      const aptoNorm = carteraSafeTrim_(row[idxAptoNorm]);
      const propietario = carteraSafeTrim_(row[idxPropietario]);
      const saldoActual = Number(row[idxSaldoActual]) || 0;
      const emailReal = carteraSafeTrim_(row[idxEmail]);

      if (!emailReal) {
        row[idxEstado] = "SIN_EMAIL";
        row[idxObservaciones] = "No se encontró correo para el apartamento.";
        errores++;
        continue;
      }

      const subject = "NO RESPONDER - ¡Gracias por estar al día! - Apto " + apto;
      const htmlBody = construirHtmlNotificacionFelicitaciones_({
        periodo: periodo,
        apartamento: apto,
        apartamentoNorm: aptoNorm,
        propietario: propietario,
        saldoActual: saldoActual
      });

      const emailDestino = FELICITACIONES_EMAIL_DRY_RUN ? FELICITACIONES_EMAIL_DRY_RUN_TO : emailReal;

      try {
        if (!FELICITACIONES_EMAIL_DRY_RUN) {
          MailApp.sendEmail({
            to: emailDestino,
            replyTo: FELICITACIONES_EMAIL_REPLY_TO,
            subject: subject,
            htmlBody: htmlBody,
            name: FELICITACIONES_EMAIL_FROM_NAME
          });
        }

        const estadoFinal = FELICITACIONES_EMAIL_DRY_RUN ? "SIMULADO" : "ENVIADO";

        row[idxEstado] = estadoFinal;
        row[idxFechaEnvio] = nowTexto;
        row[idxAsunto] = subject;
        row[idxObservaciones] = FELICITACIONES_EMAIL_DRY_RUN
          ? "Simulado. Correo real era: " + emailReal
          : "Correo enviado correctamente.";

        enviados++;

      } catch (error) {
        row[idxEstado] = "ERROR";
        row[idxFechaEnvio] = nowTexto;
        row[idxAsunto] = subject;
        row[idxObservaciones] = "Error enviando correo: " + error.message;
        errores++;
      }
    }

    sheet.getRange(1, 1, data.length, lastCol).setValues(data);

    Logger.log("=== ENVÍO FELICITACIONES FINALIZADO ===");
    Logger.log("Enviados/simulados: " + enviados);
    Logger.log("Omitidos: " + omitidos);
    Logger.log("Errores: " + errores);
    Logger.log("Máximo permitido en esta ejecución: " + maxEnvios);

    if (carteraContarPendientes_(sheet) === 0) {
      carteraBorrarTriggersFuncion_("enviarNotificacionesFelicitacionesPendientes");
      Logger.log("No quedan pendientes. Trigger de felicitaciones eliminado.");
    }

  } finally {
    lock.releaseLock();
  }
}

function felicitLeerMapaResumenFelicitaciones_(ss) {
  const sheet = ss.getSheetByName(FELICITACIONES_SHEET_RESUMEN);
  const mapa = {};

  if (!sheet || sheet.getLastRow() < 2) {
    return mapa;
  }

  const data = sheet.getDataRange().getValues();

  const headers = data[0].map(function(h) {
    return carteraNormalizeHeader_(h);
  });

  const col = carteraCrearColMap_(headers);

  const idxClave = col["clavenotificacion"];
  const idxEstado = col["estado"];

  if (idxClave === undefined || idxEstado === undefined) {
    return mapa;
  }

  data.slice(1).forEach(function(row) {
    const clave = carteraSafeTrim_(row[idxClave]);
    const estado = carteraSafeTrim_(row[idxEstado]).toUpperCase();

    if (clave && (estado === "ENVIADO" || estado === "SIMULADO")) {
      mapa[clave] = true;
    }
  });

  return mapa;
}

function felicitEscribirResumenNotificaciones_(ss, rows) {
  let sheet = ss.getSheetByName(FELICITACIONES_SHEET_RESUMEN);

  if (!sheet) {
    sheet = ss.insertSheet(FELICITACIONES_SHEET_RESUMEN);
  }

  sheet.clear();

  const headers = [
    "ClaveNotificacion",
    "Periodo",
    "Codigo",
    "Blq",
    "Apto",
    "AptoNorm",
    "Propietario",
    "SdoAnterior",
    "Cargos",
    "SaldoActual",
    "Email",
    "LoteEnvio",
    "FechaProgramada",
    "Estado",
    "FechaEnvio",
    "Asunto",
    "Observaciones"
  ];

  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight("bold")
    .setBackground("#d9ead3");

  sheet.setFrozenRows(1);

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }

  sheet.autoResizeColumns(1, headers.length);
}

function felicitConstruirClaveNotificacion_(periodo, aptoNorm) {
  return "FELICITACIONES_" + periodo + "_" + aptoNorm;
}

function construirHtmlNotificacionFelicitaciones_(data) {
  const fechaTexto = carteraObtenerFechaComunicacionLarga_();

  return `
    <div style="font-family: Arial, sans-serif; color: #222; line-height: 1.55; font-size: 14px; max-width: 760px;">
      <p>
        <strong>Itagüí, ${fechaTexto}</strong>
      </p>

      <p>
        Señor(a) Propietario(a):
        <strong>${carteraEscapeHtml_(data.propietario)}</strong><br>
        Apartamento: <strong>${carteraEscapeHtml_(data.apartamento)}</strong>
      </p>

      <p>
        <strong>Asunto:</strong> ¡Gracias por estar al día con su cuota de administración!
      </p>

      <p>Reciba un cordial saludo.</p>

      <p>
        Desde la Administración del <strong>Club Residencial Bulevar Verde</strong> queremos expresarle
        nuestro más sincero agradecimiento por mantenerse al día con el pago de su cuota de administración.
      </p>

      <p>
        Gracias a propietarios responsables como usted, es posible cubrir de manera oportuna los servicios
        y gastos de la copropiedad, entre ellos el servicio de <strong>vigilancia</strong>, el
        <strong>aseo</strong> de las zonas comunes, la <strong>energía eléctrica</strong> y el
        <strong>seguro de la copropiedad</strong>, garantizando así el bienestar y la tranquilidad de todas
        las familias que hacemos parte de esta comunidad.
      </p>

      <p>
        Lo invitamos a seguir apoyando la buena marcha de nuestra copropiedad manteniendo sus pagos al día,
        lo cual nos permite seguir planeando y sosteniendo estos servicios sin contratiempos.
      </p>

      <p>
        En caso de requerir información adicional o el estado detallado de su cuenta, puede comunicarse
        al correo electrónico de la Administración:
        <a href="mailto:${FELICITACIONES_EMAIL_REPLY_TO}">${FELICITACIONES_EMAIL_REPLY_TO}</a>.
      </p>

      <p>
        Agradecemos nuevamente su compromiso y confianza en la Administración.
      </p>

      <p>
        Cordialmente,<br><br>
        <strong>ADMINISTRACIÓN</strong><br>
        <strong>CLUB RESIDENCIAL BULEVAR VERDE</strong>
      </p>
    </div>
  `;
}

// ============================================================
// Triggers operativos de cartera (cartera + felicitaciones).
// Todos los triggers diarios se instalan/reinstalan desde una sola función.
// ============================================================

const CARTERA_TRIGGERS_OPERATIVOS = [
  {
    funcion: "enviarNotificacionesCarteraPendientes",
    descripcion: "Enviar notificaciones de cartera",
    hora: CARTERA_HORA_ENVIO,
    minuto: CARTERA_MINUTO_ENVIO
  },
  {
    funcion: "enviarNotificacionesFelicitacionesPendientes",
    descripcion: "Enviar notificaciones de felicitaciones",
    hora: FELICITACIONES_HORA_ENVIO,
    minuto: FELICITACIONES_MINUTO_ENVIO
  }
];

function prepararEInstalarEnviosDiariosHastaFinalizar() {
  prepararResumenNotificacionesCartera();
  prepararResumenNotificacionesFelicitaciones();
  reinstalarTriggersOperativosCartera();
}

function reinstalarTriggersOperativosCartera() {
  const lock = LockService.getScriptLock();

  if (!lock.tryLock(30000)) {
    throw new Error("No se pudo obtener bloqueo. Intenta nuevamente en unos segundos.");
  }

  try {
    Logger.log("=== REINSTALANDO TRIGGERS OPERATIVOS CARTERA ===");

    CARTERA_TRIGGERS_OPERATIVOS.forEach(function(config) {
      carteraBorrarTriggersFuncion_(config.funcion);

      ScriptApp.newTrigger(config.funcion)
        .timeBased()
        .everyDays(1)
        .atHour(config.hora)
        .nearMinute(config.minuto)
        .create();

      Logger.log(
        "Trigger diario instalado para " +
        config.descripcion +
        " | Función: " + config.funcion +
        " | Hora aprox: " + String(config.hora).padStart(2, "0") + ":" + String(config.minuto).padStart(2, "0") +
        ". Se eliminará automáticamente cuando no queden pendientes."
      );
    });

    Logger.log("=== FIN REINSTALACIÓN TRIGGERS CARTERA ===");

  } finally {
    lock.releaseLock();
  }
}