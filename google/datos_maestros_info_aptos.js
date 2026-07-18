/**
 * DATOS MAESTROS - CLUB RESIDENCIAL BULEVAR VERDE
 * Versión 3.3.5
 *
 * Proyecto de Apps Script vinculado al Google Sheet "Info aptos".
 *
 * OBJETIVO
 * - Conservar la hoja original como fuente histórica.
 * - Construir el inventario oficial de apartamentos y parqueaderos con área y coeficiente.
 * - Construir un modelo maestro normalizado por UnidadID (Torre + Apartamento).
 * - Importar opcionalmente el censo poblacional.
 * - Mantener trazabilidad, conflictos y auditoría.
 * - No exponer información personal mediante doGet/doPost.
 *
 * SEGURIDAD
 * - Este proyecto NO crea una Web App.
 * - No registra datos personales en Logger.
 * - Las operaciones de escritura usan LockService.
 * - La reconstrucción no borra Estado_Cuenta, Config ni Auditoria.
 */

const DM_VERSION = '3.3.5';
const DM_UNIDENTIFIED_UNIT_ID = '9999';
const DM_TIMEZONE = 'America/Bogota';

const DM_SHEETS = Object.freeze({
  CONFIG: 'Config',
  CATALOGO: 'coeficientes',
  UNIDADES: 'Unidades',
  PERSONAS: 'Personas',
  VINCULOS_UNIDAD: 'Vinculos_Unidad',
  VEHICULOS: 'Vehiculos',
  VINCULOS_VEHICULO: 'Vinculos_Vehiculo',
  EVIDENCIAS_VEHICULO: 'Evidencias_Vehiculo',
  PARQUEADEROS: 'Parqueaderos',
  VINCULOS_PARQUEADERO: 'Vinculos_Parqueadero',
  ESTADO_CUENTA: 'Estado_Cuenta',
  MASCOTAS: 'Mascotas',
  CONTACTOS_EMERGENCIA: 'Contactos_Emergencia',
  CENSO_HISTORIAL: 'Censo_Historial',
  CONFLICTOS: 'Conflictos_Datos',
  AUDITORIA: 'Auditoria'
});

const DM_HEADERS = Object.freeze({
  CATALOGO: [
    'InmuebleID', 'NumeroOrden', 'TipoInmueble', 'SubtipoInmueble',
    'CodigoOficial', 'DescripcionOficial', 'Torre', 'Apartamento',
    'AreaPrivadaConstruidaM2', 'CoeficienteCopropiedad', 'CoeficienteFraccion',
    'ValorPresupuesto2026', 'Seccion', 'PaginaFuente', 'FuenteDocumento',
    'EstadoCatalogo'
  ],
  UNIDADES: [
    'UnidadID', 'Torre', 'Apartamento', 'CodigoOficial', 'CodigoOriginal',
    'NumeroOrdenCatalogo', 'AreaPrivadaConstruidaM2',
    'CoeficienteCopropiedad', 'CoeficienteFraccion',
    'ValorPresupuesto2026', 'PaginaFuente', 'Proyecto',
    'EstadoUnidad', 'FechaEntregaApartamento', 'EstadoEntregaApartamento',
    'FuentePrincipal', 'FilaFuente', 'FechaActualizacion'
  ],
  PERSONAS: [
    'PersonaID', 'TipoPersona', 'TipoDocumento', 'NumeroDocumento',
    'NombreCompleto', 'CorreoPrincipal', 'CorreosAlternos',
    'CelularPrincipal', 'TelefonosAlternos', 'EstadoPersona',
    'Fuentes', 'FechaFuente', 'FechaActualizacion'
  ],
  VINCULOS_UNIDAD: [
    'VinculoID', 'UnidadID', 'PersonaID', 'Rol', 'EsContactoPrincipal',
    'RecibeNotificaciones', 'EstadoVinculo', 'FechaInicio', 'FechaFin',
    'Fuente', 'RegistroFuenteID', 'FilaFuente', 'FechaActualizacion'
  ],
  VEHICULOS: [
    'VehiculoID', 'Placa', 'TipoVehiculo', 'EstadoVehiculo',
    'Fuentes', 'FechaActualizacion'
  ],
  VINCULOS_VEHICULO: [
    'AsignacionVehiculoID', 'VehiculoID', 'UnidadID', 'PersonaID',
    'EstadoAsignacion', 'EsActual', 'Fuente', 'RegistroFuenteID',
    'FilaFuente', 'FechaFuente', 'FechaActualizacion',
    'TipoVinculo', 'FuenteGanadora', 'FuentesRespaldo', 'Confianza',
    'EstadoRevision', 'VigenteDesde', 'VigenteHasta'
  ],
  EVIDENCIAS_VEHICULO: [
    'EvidenciaVehiculoID', 'VehiculoID', 'Placa', 'UnidadID',
    'TipoVehiculo', 'TipoVinculo', 'Fuente', 'PrioridadFuente',
    'GrupoEvidencia', 'FuenteOriginal', 'ApartamentoOriginal',
    'CalidadRegistro', 'EsUtilizable', 'EsActualCandidato',
    'FechaFuente', 'VigenteDesde', 'VigenteHasta',
    'RegistroFuenteID', 'FilaFuente', 'Observaciones', 'FechaImportacion'
  ],
  PARQUEADEROS: [
    'ParqueaderoID', 'CodigoOficial', 'CodigoLegacy', 'SubtipoParqueadero',
    'Sector', 'PrefijoCodigo', 'NumeroParqueadero',
    'AreaPrivadaConstruidaM2', 'CoeficienteCopropiedad',
    'CoeficienteFraccion', 'ValorPresupuesto2026',
    'NumeroOrdenCatalogo', 'PaginaFuente', 'EstadoParqueadero',
    'FechaEntrega', 'Fuentes', 'FechaActualizacion'
  ],
  VINCULOS_PARQUEADERO: [
    'AsignacionParqueaderoID', 'ParqueaderoID', 'UnidadID', 'TipoTenencia',
    'EstadoAsignacion', 'EsActual', 'Fuente', 'RegistroFuenteID',
    'FilaFuente', 'FechaFuente', 'FechaActualizacion'
  ],
  ESTADO_CUENTA: [
    'UnidadID', 'Periodo', 'SaldoActual', 'EstadoCuenta', 'FechaCorte',
    'ElegibleReservas', 'MotivoRestriccion', 'Fuente', 'FechaActualizacion',
    'SaldoAnterior', 'CargosPeriodo', 'SaldoVencido', 'CodigoFuente',
    'PropietarioFuente', 'FilaFuente', 'ValorPresupuestoUnidad',
    'PorcentajeMaxMoraReservas', 'MaximoMoraElegible',
    'ExcesoMoraReservas'
  ],
  MASCOTAS: [
    'MascotaID', 'UnidadID', 'TipoMascota', 'Raza', 'Cantidad',
    'EstadoRegistro', 'EsActual', 'Fuente', 'RegistroFuenteID',
    'FilaFuente', 'FechaFuente', 'FechaActualizacion'
  ],
  CONTACTOS_EMERGENCIA: [
    'ContactoEmergenciaID', 'UnidadID', 'NombreCompleto', 'Celular',
    'Parentesco', 'EsActual', 'Fuente', 'RegistroFuenteID',
    'FilaFuente', 'FechaFuente', 'FechaActualizacion'
  ],
  CENSO_HISTORIAL: [
    'CensoID', 'UnidadID', 'FechaRespuesta', 'TipoInformante',
    'PersonaInformanteID', 'InmobiliariaNombre', 'InmobiliariaCorreo',
    'CantidadResidentesDeclarada', 'CantidadResidentesCapturada',
    'TieneMoto', 'TieneCarro', 'PlacasRaw', 'TieneParqueadero',
    'NumeroParqueadero', 'TieneMascotas', 'EstadoRegistro', 'Vigencia',
    'FilaFuente', 'HashFuente', 'FechaImportacion'
  ],
  CONFLICTOS: [
    'ConflictoID', 'FechaDeteccion', 'Tipo', 'Severidad', 'UnidadID',
    'EntidadID', 'Campo', 'ValorFuente1', 'ValorFuente2', 'Fuente1',
    'Fuente2', 'FilaFuente', 'Estado', 'Recomendacion'
  ],
  AUDITORIA: [
    'AuditoriaID', 'FechaHora', 'Version', 'Accion', 'Modo', 'Resultado',
    'Unidades', 'Personas', 'VinculosUnidad', 'Vehiculos',
    'Parqueaderos', 'Conflictos', 'Mensaje', 'Usuario'
  ],
  CONFIG: ['Clave', 'Valor', 'Descripcion', 'Editable']
});

const DM_GENERATED_SHEETS = Object.freeze([
  DM_SHEETS.UNIDADES,
  DM_SHEETS.PERSONAS,
  DM_SHEETS.VINCULOS_UNIDAD,
  DM_SHEETS.VEHICULOS,
  DM_SHEETS.VINCULOS_VEHICULO,
  DM_SHEETS.EVIDENCIAS_VEHICULO,
  DM_SHEETS.PARQUEADEROS,
  DM_SHEETS.VINCULOS_PARQUEADERO,
  DM_SHEETS.MASCOTAS,
  DM_SHEETS.CONTACTOS_EMERGENCIA,
  DM_SHEETS.CENSO_HISTORIAL,
  DM_SHEETS.CONFLICTOS
]);

/***************************************
 * MENÚ
 ***************************************/
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Datos Maestros BV')
    .addItem('1. Crear / verificar estructura', 'dmCrearEstructura')
    .addItem('2. Validar fuente coeficientes', 'dmValidarFuenteCoeficientes')
    .addSeparator()
    .addItem('3. Diagnóstico Info aptos', 'dmDiagnosticarInfoAptos')
    .addItem('4. Previsualizar construcción completa', 'dmPrevisualizarConstruccion')
    .addItem('4.1 Diagnosticar fuentes de vehículos', 'dmDiagnosticarFuentesVehiculos')
    .addItem('5. Reconstruir datos maestros', 'dmReconstruirDatosMaestros')
    .addSeparator()
    .addItem('6. Validar integridad', 'dmValidarIntegridad')
    .addItem('7. Proteger hojas maestras', 'dmProtegerHojasMaestras')
    .addToUi();
}

/***************************************
 * FUNCIONES PÚBLICAS
 ***************************************/
function dmCrearEstructura() {
  // Compatible con ejecución desde el editor, Web App o proyecto independiente.
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const ss = dmGetMasterSpreadsheet_();
    dmCrearEstructuraInterna_(ss);
    dmRegistrarAuditoria_(ss, {
      accion: 'CREAR_ESTRUCTURA',
      modo: 'APLICAR',
      resultado: 'OK',
      mensaje: 'Estructura creada o verificada, incluida la integración multifuente de vehículos.'
    });

    const result = {
      ok: true,
      version: DM_VERSION,
      spreadsheetId: ss.getId(),
      mensaje: 'Estructura creada o verificada.'
    };
    console.log(JSON.stringify(result));
    return result;
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}


function dmValidarFuenteCoeficientes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  dmCrearEstructuraInterna_(ss);

  const config = dmGetConfigMap_(ss);
  const source = dmObtenerFuenteCatalogo_(ss, config);
  const catalog = dmLeerCatalogoCanonico_(source.sheet);
  const summary = dmResumirCatalogo_(catalog.records);

  const expected = {
    total: dmToInteger_(config.CATALOGO_TOTAL_INMUEBLES_ESPERADOS),
    apartamentos: dmToInteger_(config.CATALOGO_APARTAMENTOS_ESPERADOS),
    parqueaderos: dmToInteger_(config.CATALOGO_PARQUEADEROS_ESPERADOS),
    area: dmToDecimal_(config.CATALOGO_AREA_TOTAL_ESPERADA),
    coeficiente: dmToDecimal_(config.CATALOGO_COEFICIENTE_TOTAL_ESPERADO)
  };
  const tolerance = dmToDecimal_(config.CATALOGO_TOLERANCIA) || 0.0001;

  const checks = [
    dmCatalogCheck_('Total de inmuebles', summary.total, expected.total, 0),
    dmCatalogCheck_('Apartamentos', summary.apartamentos, expected.apartamentos, 0),
    dmCatalogCheck_('Parqueaderos', summary.parqueaderos, expected.parqueaderos, 0),
    dmCatalogCheck_('Área total', summary.area, expected.area, tolerance),
    dmCatalogCheck_('Coeficiente total', summary.coeficiente, expected.coeficiente, tolerance)
  ];

  const valid = checks.every(function (check) { return check.ok; }) &&
    summary.invalidos === 0 && summary.duplicados === 0;

  const message = [
    'Archivo fuente: ' + source.spreadsheetName,
    'Hoja: ' + source.sheet.getName(),
    'Esquema detectado: ' + catalog.schema,
    '',
    'Registros interpretados: ' + summary.total,
    'Apartamentos: ' + summary.apartamentos,
    'Parqueaderos: ' + summary.parqueaderos,
    'Otros inmuebles privados: ' + summary.otros,
    'Área total: ' + summary.area.toFixed(2) + ' m²',
    'Coeficiente total: ' + summary.coeficiente.toFixed(4),
    'Filas inválidas: ' + summary.invalidos,
    'Identificadores duplicados: ' + summary.duplicados,
    '',
    checks.map(function (check) {
      return (check.ok ? 'OK' : 'REVISAR') + ' - ' + check.label +
        ': ' + check.actual + ' / esperado ' + check.expected;
    }).join('\n')
  ].join('\n');

  dmRegistrarAuditoria_(ss, {
    accion: 'VALIDAR_FUENTE_COEFICIENTES',
    modo: 'LECTURA',
    resultado: valid ? 'OK' : 'REVISAR',
    mensaje: message.replace(/\n/g, ' | ')
  });

  SpreadsheetApp.getUi().alert(
    valid ? 'Fuente de coeficientes válida' : 'Fuente de coeficientes requiere revisión',
    message,
    SpreadsheetApp.getUi().ButtonSet.OK
  );

  return {
    ok: valid,
    source: source,
    schema: catalog.schema,
    summary: summary,
    checks: checks
  };
}

// Compatibilidad con versiones anteriores. Ya no carga datos hardcodeados.
function dmCargarCatalogoCoeficientes2026() {
  return dmValidarFuenteCoeficientes();
}

function dmDiagnosticarCatalogo() {
  return dmValidarFuenteCoeficientes();
}

function dmDiagnosticarInfoAptos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  dmCrearEstructuraInterna_(ss);
  const config = dmGetConfigMap_(ss);
  const result = dmConstruirModelo_({
    ss: ss,
    config: config,
    incluirCenso: false
  });

  dmRegistrarAuditoria_(ss, {
    accion: 'DIAGNOSTICO_INFO_APTOS',
    modo: 'DRY_RUN',
    resultado: 'OK',
    stats: result.stats,
    mensaje: 'Diagnóstico completado sin modificar tablas maestras.'
  });

  SpreadsheetApp.getUi().alert(
    'Diagnóstico Info aptos',
    dmResumenTexto_(result.stats, false),
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function dmPrevisualizarConstruccion() {
  const ss = dmGetMasterSpreadsheet_();
  dmCrearEstructuraInterna_(ss);
  const config = dmGetConfigMap_(ss);
  const incluirCenso = dmCensoConfigurado_(config);

  const result = dmConstruirModelo_({
    ss: ss,
    config: config,
    incluirCenso: incluirCenso
  });

  const resumen = dmResumenTexto_(result.stats, incluirCenso);
  dmRegistrarAuditoria_(ss, {
    accion: 'PREVISUALIZAR_CONSTRUCCION',
    modo: 'DRY_RUN',
    resultado: 'OK',
    stats: result.stats,
    mensaje: 'Previsualización multifuente completada.'
  });

  console.log('Previsualización completada:\n' + resumen);
  return {
    ok: true,
    incluirCenso: incluirCenso,
    stats: result.stats,
    resumen: resumen
  };
}

function dmReconstruirDatosMaestros() {
  // Esta función está diseñada para ejecutarse desde el editor de Apps Script,
  // una Web App o un proyecto independiente. Por eso no usa SpreadsheetApp.getUi().
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  let ss = null;

  try {
    ss = dmGetMasterSpreadsheet_();
    dmCrearEstructuraInterna_(ss);

    const config = dmGetConfigMap_(ss);
    const incluirCenso = dmCensoConfigurado_(config);

    const result = dmConstruirModelo_({
      ss: ss,
      config: config,
      incluirCenso: incluirCenso
    });

    dmEscribirModelo_(ss, result);

    let portalApprovedSync = null;
    if (typeof portalReaplicarDatosAprobadosEnMaestros_ === 'function') {
      portalApprovedSync = portalReaplicarDatosAprobadosEnMaestros_();
    }

    SpreadsheetApp.flush();

    const resumen = dmResumenTexto_(result.stats, incluirCenso);

    dmRegistrarAuditoria_(ss, {
      accion: 'RECONSTRUIR_DATOS_MAESTROS',
      modo: 'APLICAR',
      resultado: 'OK',
      stats: result.stats,
      mensaje: incluirCenso
        ? 'Reconstrucción completada con Info aptos, censo y fuentes externas de vehículos.'
        : 'Reconstrucción completada con Info aptos y fuentes externas de vehículos; censo no configurado.'
    });

    console.log('Reconstrucción completada:\n' + resumen);

    return {
      ok: true,
      incluirCenso: incluirCenso,
      stats: result.stats,
      resumen: resumen,
      datosAprobadosPortal: portalApprovedSync
    };
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));

    if (ss) {
      try {
        dmRegistrarAuditoria_(ss, {
          accion: 'RECONSTRUIR_DATOS_MAESTROS',
          modo: 'APLICAR',
          resultado: 'ERROR',
          mensaje: error && error.message ? error.message : String(error)
        });
      } catch (auditError) {
        console.error(
          'No fue posible registrar el error en Auditoria: ' +
          (auditError && auditError.message ? auditError.message : String(auditError))
        );
      }
    }

    throw error;
  } finally {
    try {
      lock.releaseLock();
    } catch (releaseError) {
      console.warn(
        'No fue posible liberar el bloqueo de script: ' +
        (releaseError && releaseError.message
          ? releaseError.message
          : String(releaseError))
      );
    }
  }
}

function dmValidarIntegridad() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  dmCrearEstructuraInterna_(ss);

  const result = dmValidarIntegridadInterna_(ss);

  dmRegistrarAuditoria_(ss, {
    accion: 'VALIDAR_INTEGRIDAD',
    modo: 'LECTURA',
    resultado: result.errores.length === 0 ? 'OK' : 'CON_ALERTAS',
    mensaje: 'Errores: ' + result.errores.length + '. Advertencias: ' + result.advertencias.length + '.'
  });

  const detalle = [
    'Errores: ' + result.errores.length,
    'Advertencias: ' + result.advertencias.length,
    '',
    result.errores.slice(0, 8).join('\n'),
    result.errores.length > 8 ? '\n…hay más errores.' : '',
    '',
    result.advertencias.slice(0, 8).join('\n'),
    result.advertencias.length > 8 ? '\n…hay más advertencias.' : ''
  ].join('\n');

  SpreadsheetApp.getUi().alert(
    'Validación de integridad',
    detalle,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

function dmProtegerHojasMaestras() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    'Proteger hojas maestras',
    'Las hojas maestras quedarán protegidas contra ediciones accidentales. El propietario del archivo conservará el acceso. ¿Continuar?',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const email = Session.getEffectiveUser().getEmail();

  DM_GENERATED_SHEETS.concat([DM_SHEETS.ESTADO_CUENTA, DM_SHEETS.CATALOGO]).forEach(function (name) {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return;

    sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach(function (p) {
      if (p.getDescription() === 'DM_BV_PROTECCION') p.remove();
    });

    const protection = sheet.protect().setDescription('DM_BV_PROTECCION');
    if (email) protection.addEditor(email);

    const editors = protection.getEditors();
    editors.forEach(function (editor) {
      if (!email || editor.getEmail() !== email) {
        try {
          protection.removeEditor(editor);
        } catch (ignored) {}
      }
    });

    if (protection.canDomainEdit()) protection.setDomainEdit(false);
  });

  dmRegistrarAuditoria_(ss, {
    accion: 'PROTEGER_HOJAS',
    modo: 'APLICAR',
    resultado: 'OK',
    mensaje: 'Hojas maestras protegidas.'
  });

  ui.alert('Protección aplicada.');
}

/***************************************
 * CONSTRUCCIÓN DEL MODELO
 ***************************************/
function dmConstruirModelo_(options) {
  const ss = options.ss;
  const config = options.config;
  const incluirCenso = options.incluirCenso === true;
  const now = new Date();

  const model = {
    units: {},
    persons: {},
    unitLinks: {},
    vehicles: {},
    vehicleLinks: {},
    vehicleEvidence: {},
    parkings: {},
    parkingLinks: {},
    pets: {},
    emergencyContacts: {},
    censusHistory: [],
    conflicts: {},
    stats: {
      filasCatalogoLeidas: 0,
      catalogoInmuebles: 0,
      apartamentosInventario: 0,
      parqueaderosInventario: 0,
      otrosInmueblesCatalogo: 0,
      areaTotalCatalogo: 0,
      coeficienteTotalCatalogo: 0,
      filasInfoLeidas: 0,
      filasCensoLeidas: 0,
      unidades: 0,
      personas: 0,
      vinculosUnidad: 0,
      vehiculos: 0,
      evidenciasVehiculo: 0,
      vinculosVehiculo: 0,
      filasBiometricoLeidas: 0,
      filasMaestraVehiculosLeidas: 0,
      filasVigilanciaLeidas: 0,
      fuentesVehiculoOmitidas: 0,
      parqueaderos: 0,
      conflictos: 0,
      respuestasCensoValidas: 0,
      respuestasCensoInvalidas: 0,
      respuestasCensoDuplicadas: 0,
      unidadesConCenso: 0,
      unidadesSinCenso: 0,
      unidadesConMultiplesRespuestas: 0
    },
    catalogoCargado: false,
    config: config,
    now: now
  };

  // Unidad técnica usada exclusivamente para placas cuya asociación no ha sido
  // identificada o fue desconocida por el apartamento después de revisión.
  dmEnsureUnidentifiedUnitInModel_(model);

  dmImportarCatalogoAlModelo_(ss, config, model);
  dmImportarInfoAptosAlModelo_(ss, config, model);

  if (incluirCenso) {
    dmImportarCensoAlModelo_(ss, config, model);
  }

  // Integra las fuentes externas en el orden de veracidad definido:
  // biométrico > censo > maestra de sanciones > registro de vigilancia.
  dmImportarFuentesVehiculosExternas_(ss, config, model);
  dmResolverVinculosVehiculo_(model);

  dmDetectarConflictosGlobales_(model);
  dmFinalizarModelo_(model);
  return model;
}




/**
 * Agrega una unidad técnica que no representa un apartamento real.
 * Sirve como bandeja controlada para placas pendientes de identificación.
 */
function dmEnsureUnidentifiedUnitInModel_(model) {
  if (model.units[DM_UNIDENTIFIED_UNIT_ID]) return;

  model.units[DM_UNIDENTIFIED_UNIT_ID] = {
    UnidadID: DM_UNIDENTIFIED_UNIT_ID,
    Torre: '',
    Apartamento: DM_UNIDENTIFIED_UNIT_ID,
    CodigoOficial: DM_UNIDENTIFIED_UNIT_ID,
    CodigoOriginal: DM_UNIDENTIFIED_UNIT_ID,
    NumeroOrdenCatalogo: '',
    AreaPrivadaConstruidaM2: '',
    CoeficienteCopropiedad: '',
    CoeficienteFraccion: '',
    ValorPresupuesto2026: '',
    PaginaFuente: '',
    Proyecto: 'BULEVAR_VERDE',
    EstadoUnidad: 'BIEN_SIN_IDENTIFICAR',
    FechaEntregaApartamento: '',
    EstadoEntregaApartamento: 'NO_APLICA',
    FuentePrincipal: 'SISTEMA',
    FilaFuente: '',
    FechaActualizacion: model.now
  };
}

/***************************************
 * FUENTE OFICIAL: HOJA "coeficientes"
 ***************************************/
function dmObtenerFuenteCatalogo_(activeSs, config) {
  const configuredId = dmSafeTrim_(config.CATALOGO_SPREADSHEET_ID) || 'MISMO_ARCHIVO';
  const sheetName = dmSafeTrim_(config.CATALOGO_SOURCE_SHEET) || 'coeficientes';
  const normalizedId = dmNormalizeText_(configuredId).replace(/\s+/g, '_');
  const sameFile = normalizedId === 'mismo_archivo' || normalizedId === 'mismo_archivo_';

  let sourceSs;
  try {
    sourceSs = sameFile
      ? activeSs
      : SpreadsheetApp.openById(dmExtractSpreadsheetId_(configuredId));
  } catch (error) {
    throw new Error(
      'No fue posible abrir el archivo configurado para coeficientes. ' +
      'Debe ser una hoja de cálculo de Google nativa y la cuenta del script debe tener acceso. ' +
      'Si el archivo es XLSX, conviértelo mediante Archivo > Guardar como Hojas de cálculo de Google. ' +
      'Detalle: ' + (error.message || String(error))
    );
  }

  const sheet = sourceSs.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error(
      'No existe la hoja "' + sheetName + '" en el archivo de coeficientes. ' +
      'Revisa CATALOGO_SOURCE_SHEET en Config.'
    );
  }

  return {
    spreadsheetId: sourceSs.getId(),
    spreadsheetName: sourceSs.getName(),
    sheet: sheet
  };
}

function dmLeerCatalogoCanonico_(sheet) {
  const rows = dmLeerFilas_(sheet);
  if (rows.length === 0) return { schema: 'VACIO', records: [] };

  const headers = rows[0].headers;
  const canonical = headers.indexOf(dmNormalizeHeader_('TipoInmueble')) !== -1 &&
    headers.indexOf(dmNormalizeHeader_('CodigoOficial')) !== -1 &&
    headers.indexOf(dmNormalizeHeader_('AreaPrivadaConstruidaM2')) !== -1;

  if (canonical) {
    return {
      schema: 'NORMALIZADO_16_COLUMNAS',
      records: rows
        .filter(function (record) { return !dmFilaVacia_(record.display); })
        .map(dmCatalogRecordFromCanonicalRow_)
    };
  }

  return {
    schema: 'TABLA_OFICIAL_CRUDA',
    records: dmCatalogRecordsFromRawRows_(rows)
  };
}

function dmCatalogRecordFromCanonicalRow_(record) {
  const coefficient = dmToDecimal_(dmGetRaw_(record, ['CoeficienteCopropiedad', 'Coeficiente (Decimal)']));
  const fraction = dmToDecimal_(dmGetRaw_(record, ['CoeficienteFraccion']));

  return {
    rowNumber: record.rowNumber,
    InmuebleID: dmSafeTrim_(dmGet_(record, ['InmuebleID'])),
    NumeroOrden: dmGetRaw_(record, ['NumeroOrden', 'N°', 'Nº', 'No', 'Numero']),
    TipoInmueble: dmSafeTrim_(dmGet_(record, ['TipoInmueble'])),
    SubtipoInmueble: dmSafeTrim_(dmGet_(record, ['SubtipoInmueble'])),
    CodigoOficial: dmSafeTrim_(dmGet_(record, ['CodigoOficial'])),
    DescripcionOficial: dmSafeTrim_(dmGet_(record, ['DescripcionOficial', 'Inmueble'])),
    Torre: dmSafeTrim_(dmGet_(record, ['Torre'])),
    Apartamento: dmSafeTrim_(dmGet_(record, ['Apartamento', 'Apto'])),
    AreaPrivadaConstruidaM2: dmGetRaw_(record, [
      'AreaPrivadaConstruidaM2', 'Área Privada Construida M²', 'Area Privada Construida M2'
    ]),
    CoeficienteCopropiedad: coefficient === null ? '' : coefficient,
    CoeficienteFraccion: fraction !== null ? fraction : (coefficient !== null ? coefficient / 100 : ''),
    ValorPresupuesto2026: dmGetRaw_(record, ['ValorPresupuesto2026', 'Valor Presupuesto 2026']),
    Seccion: dmSafeTrim_(dmGet_(record, ['Seccion', 'Sección'])),
    PaginaFuente: dmGetRaw_(record, ['PaginaFuente', 'Página Fuente']),
    FuenteDocumento: dmSafeTrim_(dmGet_(record, ['FuenteDocumento'])) || 'SHEET coeficientes',
    EstadoCatalogo: dmSafeTrim_(dmGet_(record, ['EstadoCatalogo'])) || 'VIGENTE'
  };
}

function dmCatalogRecordsFromRawRows_(rows) {
  let section = '';
  let tower = '';
  const records = [];

  rows.forEach(function (record) {
    if (dmFilaVacia_(record.display)) return;

    const rowText = record.display.filter(function (value) {
      return dmHasMeaningful_(value);
    }).join(' ');
    const context = dmCatalogContextFromText_(rowText, section, tower);
    section = context.section;
    tower = context.tower;

    if (context.isSection || /total etapas/i.test(rowText)) return;

    const description = dmSafeTrim_(dmGet_(record, [
      'Inmueble', 'DescripcionOficial', 'Descripción', 'Descripcion'
    ]));
    const order = dmToInteger_(dmGetRaw_(record, [
      'NumeroOrden', 'N°', 'Nº', 'No.', 'No', 'Numero', 'Número'
    ]));

    if (order === null || !description) return;

    const derived = dmDerivarCatalogoDesdeDescripcion_(description, tower);
    const coefficient = dmToDecimal_(dmGetRaw_(record, [
      'CoeficienteCopropiedad', 'Coeficiente (Decimal)', 'Coeficiente Decimal', 'Coeficiente'
    ]));

    records.push({
      rowNumber: record.rowNumber,
      InmuebleID: derived.inmuebleId,
      NumeroOrden: order,
      TipoInmueble: derived.tipo,
      SubtipoInmueble: derived.subtipo,
      CodigoOficial: derived.codigoOficial,
      DescripcionOficial: description,
      Torre: derived.torre,
      Apartamento: derived.apartamento,
      AreaPrivadaConstruidaM2: dmGetRaw_(record, [
        'AreaPrivadaConstruidaM2', 'Área Privada Construida M²',
        'Area Privada Construida M2', 'Área Privada Construida'
      ]),
      CoeficienteCopropiedad: coefficient === null ? '' : coefficient,
      CoeficienteFraccion: coefficient === null ? '' : coefficient / 100,
      ValorPresupuesto2026: dmGetRaw_(record, [
        'ValorPresupuesto2026', 'Valor Presupuesto 2026', 'Valor'
      ]),
      Seccion: section,
      PaginaFuente: dmGetRaw_(record, ['PaginaFuente', 'Página Fuente']),
      FuenteDocumento: 'SHEET coeficientes',
      EstadoCatalogo: 'VIGENTE'
    });
  });

  return records;
}

function dmCatalogContextFromText_(value, currentSection, currentTower) {
  const text = dmNormalizeText_(value);
  let section = currentSection || '';
  let tower = currentTower || '';
  let isSection = false;

  if (/etapa 7a.*parq.*descubiertos/.test(text)) {
    section = 'ETAPA 7A - PARQUEADEROS DESCUBIERTOS A NIVEL';
    tower = '';
    isSection = true;
  } else if (/parqueaderos cubiertos/.test(text)) {
    section = 'EDIFICIO DE PARQUEADEROS - PARQUEADEROS CUBIERTOS';
    tower = '';
    isSection = true;
  } else if (/locales comerciales/.test(text)) {
    section = 'EDIFICIO DE PARQUEADEROS - LOCALES COMERCIALES';
    tower = '';
    isSection = true;
  } else if (/area libre privada/.test(text) && !/^\d+\s+area libre/.test(text)) {
    section = 'AREA LIBRE PRIVADA PARA FUTURO DESARROLLO';
    tower = '';
    isSection = true;
  } else {
    const towerMatch = text.match(/apartamentos torre\s*(\d+)/);
    if (towerMatch) {
      tower = 'T' + Number(towerMatch[1]);
      section = 'APARTAMENTOS TORRE ' + Number(towerMatch[1]);
      isSection = true;
    }
  }

  return { section: section, tower: tower, isSection: isSection };
}

function dmDerivarCatalogoDesdeDescripcion_(description, currentTower) {
  const raw = dmSafeTrim_(description);
  const text = dmNormalizeText_(raw);
  let match;

  match = raw.match(/parqueadero\s+descubierto\s+(\d{1,5})\s*$/i);
  if (match) {
    const code = String(match[1]).padStart(5, '0');
    return {
      inmuebleId: code + '-PARQ',
      tipo: 'PARQUEADERO',
      subtipo: 'DESCUBIERTO',
      codigoOficial: code,
      torre: '',
      apartamento: ''
    };
  }

  match = raw.match(/parqueadero\s+cubierto\s+(\d{1,5})\s*$/i);
  if (match) {
    const code = String(match[1]).padStart(5, '0');
    return {
      inmuebleId: code + '-PARQ',
      tipo: 'PARQUEADERO',
      subtipo: 'CUBIERTO',
      codigoOficial: code,
      torre: '',
      apartamento: ''
    };
  }

  match = raw.match(/apartamento\s+(\d{1,5})\s*$/i);
  if (match) {
    const apartment = dmStripLeadingZeros_(match[1]);
    const tower = dmSafeTrim_(currentTower).toUpperCase();
    const code = tower ? tower + '-' + apartment : apartment;
    return {
      inmuebleId: tower ? dmFormatUnitId_(tower, apartment) : '',
      tipo: 'APARTAMENTO',
      subtipo: '',
      codigoOficial: code,
      torre: tower,
      apartamento: apartment
    };
  }

  match = raw.match(/local\s+comercial\s+(.+)$/i);
  if (match) {
    const code = dmSafeTrim_(match[1]);
    const normalized = code.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');
    return {
      inmuebleId: 'LOCAL-' + normalized,
      tipo: 'LOCAL',
      subtipo: 'COMERCIAL',
      codigoOficial: code,
      torre: '',
      apartamento: ''
    };
  }

  if (/area libre privada/.test(text)) {
    return {
      inmuebleId: 'AREA-LIBRE-FUTURO-DESARROLLO',
      tipo: 'AREA_LIBRE',
      subtipo: 'FUTURO_DESARROLLO',
      codigoOficial: 'AREA-LIBRE-FUTURO-DESARROLLO',
      torre: '',
      apartamento: ''
    };
  }

  return {
    inmuebleId: '',
    tipo: '',
    subtipo: '',
    codigoOficial: '',
    torre: '',
    apartamento: ''
  };
}

function dmResumirCatalogo_(records) {
  const ids = {};
  const summary = {
    total: 0,
    apartamentos: 0,
    parqueaderos: 0,
    otros: 0,
    area: 0,
    coeficiente: 0,
    invalidos: 0,
    duplicados: 0
  };

  records.forEach(function (item) {
    const id = dmSafeTrim_(item.InmuebleID);
    const type = dmSafeTrim_(item.TipoInmueble).toUpperCase();
    const code = dmSafeTrim_(item.CodigoOficial);
    const area = dmToDecimal_(item.AreaPrivadaConstruidaM2);
    const coefficient = dmToDecimal_(item.CoeficienteCopropiedad);

    if (!id || !type || !code) {
      summary.invalidos++;
      return;
    }

    summary.total++;
    if (ids[id]) summary.duplicados++;
    ids[id] = true;

    if (type === 'APARTAMENTO') summary.apartamentos++;
    else if (type === 'PARQUEADERO') summary.parqueaderos++;
    else summary.otros++;

    if (area !== null) summary.area += area;
    if (coefficient !== null) summary.coeficiente += coefficient;
  });

  return summary;
}

function dmCatalogCheck_(label, actual, expected, tolerance) {
  if (expected === null || expected === '') {
    return { label: label, actual: actual, expected: 'NO_CONFIGURADO', ok: true };
  }
  const allowed = tolerance || 0;
  return {
    label: label,
    actual: actual,
    expected: expected,
    ok: Math.abs(Number(actual) - Number(expected)) <= allowed
  };
}

function dmImportarCatalogoAlModelo_(ss, config, model) {
  const required = dmNormalizeYesNo_(config.CATALOGO_REQUIRED || 'SI') === 'SI';
  let source;

  try {
    source = dmObtenerFuenteCatalogo_(ss, config);
  } catch (error) {
    if (required) throw error;
    return;
  }

  const catalog = dmLeerCatalogoCanonico_(source.sheet);
  const rows = catalog.records;

  if (rows.length === 0) {
    if (required) {
      throw new Error(
        'La hoja de coeficientes no contiene inmuebles interpretables. ' +
        'Verifica la configuración CATALOGO_SPREADSHEET_ID y CATALOGO_SOURCE_SHEET.'
      );
    }
    return;
  }

  const seenInmuebles = {};
  const seenUnits = {};
  const seenParkings = {};

  rows.forEach(function (item) {
    model.stats.filasCatalogoLeidas++;

    const inmuebleId = dmSafeTrim_(item.InmuebleID);
    const numeroOrden = dmToInteger_(item.NumeroOrden);
    const tipo = dmSafeTrim_(item.TipoInmueble).toUpperCase();
    const subtipo = dmSafeTrim_(item.SubtipoInmueble).toUpperCase();
    const codigoOficialRaw = dmSafeTrim_(item.CodigoOficial);
    const descripcion = dmSafeTrim_(item.DescripcionOficial);
    const torre = dmSafeTrim_(item.Torre).toUpperCase();
    const apartamento = dmSafeTrim_(item.Apartamento);
    const area = dmToDecimal_(item.AreaPrivadaConstruidaM2);
    const coeficiente = dmToDecimal_(item.CoeficienteCopropiedad);
    const coeficienteFraccionRaw = dmToDecimal_(item.CoeficienteFraccion);
    const coeficienteFraccion = coeficienteFraccionRaw !== null
      ? coeficienteFraccionRaw
      : (coeficiente !== null ? coeficiente / 100 : null);
    const valorPresupuesto = dmToInteger_(item.ValorPresupuesto2026);
    const seccion = dmSafeTrim_(item.Seccion);
    const pagina = dmToInteger_(item.PaginaFuente);
    const estadoCatalogo = dmSafeTrim_(item.EstadoCatalogo) || 'VIGENTE';
    const rowNumber = item.rowNumber || '';

    if (!inmuebleId || !tipo || !codigoOficialRaw) {
      dmAddConflict_(model, {
        tipo: 'CATALOGO_FILA_INCOMPLETA',
        severidad: 'ALTA',
        entidadId: inmuebleId,
        campo: 'InmuebleID/TipoInmueble/CodigoOficial',
        valorFuente1: 'Fila ' + rowNumber + ' - ' + descripcion,
        fuente1: 'SHEET_COEFICIENTES',
        filaFuente: rowNumber,
        recomendacion: 'Completar o corregir la fila en la hoja coeficientes.'
      });
      return;
    }

    if (seenInmuebles[inmuebleId]) {
      dmAddConflict_(model, {
        tipo: 'CATALOGO_INMUEBLE_DUPLICADO',
        severidad: 'ALTA',
        entidadId: inmuebleId,
        campo: 'InmuebleID',
        valorFuente1: String(seenInmuebles[inmuebleId]),
        valorFuente2: String(rowNumber),
        fuente1: 'SHEET_COEFICIENTES',
        fuente2: 'SHEET_COEFICIENTES',
        filaFuente: rowNumber,
        recomendacion: 'Eliminar o corregir el registro duplicado en coeficientes.'
      });
      return;
    }
    seenInmuebles[inmuebleId] = rowNumber;

    model.stats.catalogoInmuebles++;
    if (area !== null) model.stats.areaTotalCatalogo += area;
    if (coeficiente !== null) model.stats.coeficienteTotalCatalogo += coeficiente;

    if (tipo === 'APARTAMENTO') {
      const unitInfo = dmParseUnidad_(torre, apartamento || codigoOficialRaw);
      if (!unitInfo.ok) {
        dmAddConflict_(model, {
          tipo: 'CATALOGO_APARTAMENTO_NO_INTERPRETABLE',
          severidad: 'ALTA',
          entidadId: inmuebleId,
          campo: 'Torre/Apartamento',
          valorFuente1: torre + ' / ' + apartamento,
          fuente1: 'SHEET_COEFICIENTES',
          filaFuente: rowNumber,
          recomendacion: 'Corregir torre y número de apartamento en coeficientes.'
        });
        return;
      }

      if (seenUnits[unitInfo.unidadId]) {
        dmAddConflict_(model, {
          tipo: 'CATALOGO_UNIDAD_DUPLICADA',
          severidad: 'ALTA',
          unidadId: unitInfo.unidadId,
          entidadId: inmuebleId,
          campo: 'UnidadID',
          valorFuente1: String(seenUnits[unitInfo.unidadId]),
          valorFuente2: String(rowNumber),
          fuente1: 'SHEET_COEFICIENTES',
          fuente2: 'SHEET_COEFICIENTES',
          filaFuente: rowNumber,
          recomendacion: 'Dejar una sola fila oficial para la unidad.'
        });
        return;
      }
      seenUnits[unitInfo.unidadId] = rowNumber;
      model.stats.apartamentosInventario++;

      dmUpsertUnit_(model, {
        UnidadID: unitInfo.unidadId,
        Torre: unitInfo.torre,
        Apartamento: unitInfo.apartamento,
        CodigoOficial: unitInfo.unidadId,
        CodigoOriginal: codigoOficialRaw,
        NumeroOrdenCatalogo: numeroOrden === null ? '' : numeroOrden,
        AreaPrivadaConstruidaM2: area === null ? '' : area,
        CoeficienteCopropiedad: coeficiente === null ? '' : coeficiente,
        CoeficienteFraccion: coeficienteFraccion === null ? '' : coeficienteFraccion,
        ValorPresupuesto2026: valorPresupuesto === null ? '' : valorPresupuesto,
        PaginaFuente: pagina === null ? '' : pagina,
        Proyecto: '',
        EstadoUnidad: estadoCatalogo === 'VIGENTE' ? 'REGISTRADA_CATALOGO' : estadoCatalogo,
        FechaEntregaApartamento: '',
        EstadoEntregaApartamento: 'SIN_DATO',
        FuentePrincipal: 'SHEET_COEFICIENTES',
        FilaFuente: rowNumber,
        FechaActualizacion: model.now
      });
      return;
    }

    if (tipo === 'PARQUEADERO') {
      const officialCode = dmNormalizeParkingCode_(codigoOficialRaw);
      if (!officialCode) {
        dmAddConflict_(model, {
          tipo: 'CATALOGO_PARQUEADERO_NO_INTERPRETABLE',
          severidad: 'ALTA',
          entidadId: inmuebleId,
          campo: 'CodigoOficial',
          valorFuente1: codigoOficialRaw,
          fuente1: 'SHEET_COEFICIENTES',
          filaFuente: rowNumber,
          recomendacion: 'El código oficial debe conservar cinco dígitos.'
        });
        return;
      }

      const parkingId = officialCode + '-PARQ';
      if (seenParkings[parkingId]) {
        dmAddConflict_(model, {
          tipo: 'CATALOGO_PARQUEADERO_DUPLICADO',
          severidad: 'ALTA',
          entidadId: parkingId,
          campo: 'CodigoOficial',
          valorFuente1: String(seenParkings[parkingId]),
          valorFuente2: String(rowNumber),
          fuente1: 'SHEET_COEFICIENTES',
          fuente2: 'SHEET_COEFICIENTES',
          filaFuente: rowNumber,
          recomendacion: 'Dejar una sola fila oficial para el parqueadero.'
        });
        return;
      }
      seenParkings[parkingId] = rowNumber;
      model.stats.parqueaderosInventario++;

      dmUpsertParking_(model, {
        ParqueaderoID: parkingId,
        CodigoOficial: officialCode,
        CodigoLegacy: '',
        SubtipoParqueadero: subtipo,
        Sector: seccion,
        PrefijoCodigo: officialCode.substring(0, 2),
        NumeroParqueadero: officialCode.substring(2),
        AreaPrivadaConstruidaM2: area === null ? '' : area,
        CoeficienteCopropiedad: coeficiente === null ? '' : coeficiente,
        CoeficienteFraccion: coeficienteFraccion === null ? '' : coeficienteFraccion,
        ValorPresupuesto2026: valorPresupuesto === null ? '' : valorPresupuesto,
        NumeroOrdenCatalogo: numeroOrden === null ? '' : numeroOrden,
        PaginaFuente: pagina === null ? '' : pagina,
        EstadoParqueadero: estadoCatalogo === 'VIGENTE' ? 'REGISTRADO_CATALOGO' : estadoCatalogo,
        FechaEntrega: '',
        Fuentes: 'SHEET_COEFICIENTES',
        FechaActualizacion: model.now
      });
      return;
    }

    model.stats.otrosInmueblesCatalogo++;
  });

  model.catalogoCargado = model.stats.catalogoInmuebles > 0;
  dmValidarTotalesCatalogoEnModelo_(model, config);
}

function dmValidarTotalesCatalogoEnModelo_(model, config) {
  const checks = [
    {
      field: 'catalogoInmuebles',
      expected: dmToInteger_(config.CATALOGO_TOTAL_INMUEBLES_ESPERADOS),
      label: 'Total de inmuebles'
    },
    {
      field: 'apartamentosInventario',
      expected: dmToInteger_(config.CATALOGO_APARTAMENTOS_ESPERADOS),
      label: 'Apartamentos'
    },
    {
      field: 'parqueaderosInventario',
      expected: dmToInteger_(config.CATALOGO_PARQUEADEROS_ESPERADOS),
      label: 'Parqueaderos'
    }
  ];

  checks.forEach(function (check) {
    if (check.expected === null) return;
    if (model.stats[check.field] === check.expected) return;

    dmAddConflict_(model, {
      tipo: 'CATALOGO_CONTEO_NO_COINCIDE',
      severidad: 'ALTA',
      campo: check.label,
      valorFuente1: String(model.stats[check.field]),
      valorFuente2: String(check.expected),
      fuente1: 'CATALOGO_OFICIAL',
      fuente2: 'CONFIG',
      recomendacion: 'Revisar que el catálogo haya sido cargado completamente.'
    });
  });

  const expectedArea = dmToDecimal_(config.CATALOGO_AREA_TOTAL_ESPERADA);
  const expectedCoefficient = dmToDecimal_(config.CATALOGO_COEFICIENTE_TOTAL_ESPERADO);
  const tolerance = dmToDecimal_(config.CATALOGO_TOLERANCIA) || 0.0001;

  if (expectedArea !== null && Math.abs(model.stats.areaTotalCatalogo - expectedArea) > tolerance) {
    dmAddConflict_(model, {
      tipo: 'CATALOGO_AREA_TOTAL_NO_COINCIDE',
      severidad: 'ALTA',
      campo: 'AreaPrivadaConstruidaM2',
      valorFuente1: String(model.stats.areaTotalCatalogo),
      valorFuente2: String(expectedArea),
      fuente1: 'CATALOGO_OFICIAL',
      fuente2: 'CONFIG',
      recomendacion: 'Revisar áreas faltantes o duplicadas en el catálogo.'
    });
  }

  if (expectedCoefficient !== null &&
      Math.abs(model.stats.coeficienteTotalCatalogo - expectedCoefficient) > tolerance) {
    dmAddConflict_(model, {
      tipo: 'CATALOGO_COEFICIENTE_TOTAL_NO_COINCIDE',
      severidad: 'ALTA',
      campo: 'CoeficienteCopropiedad',
      valorFuente1: String(model.stats.coeficienteTotalCatalogo),
      valorFuente2: String(expectedCoefficient),
      fuente1: 'CATALOGO_OFICIAL',
      fuente2: 'CONFIG',
      recomendacion: 'Revisar coeficientes faltantes o duplicados en el catálogo.'
    });
  }
}

function dmImportarInfoAptosAlModelo_(ss, config, model) {
  const sourceName = config.INFO_SOURCE_SHEET || 'Hoja 1';
  const sheet = ss.getSheetByName(sourceName);

  if (!sheet) {
    throw new Error('No existe la hoja fuente de Info aptos: ' + sourceName);
  }

  const rows = dmLeerFilas_(sheet);
  const now = model.now;

  rows.forEach(function (record) {
    if (dmFilaVacia_(record.display)) return;
    model.stats.filasInfoLeidas++;

    const rowNumber = record.rowNumber;
    const project = dmGet_(record, ['Proyecto']);
    const apartmentRaw = dmGet_(record, ['Apartamento']);
    const parkingRaw = dmGet_(record, ['Parqueadero Asociado']);
    const apartmentLooksLikeParking = /^PARQ/i.test(dmSafeTrim_(apartmentRaw));
    const effectiveParkingRaw = parkingRaw || (apartmentLooksLikeParking ? apartmentRaw : '');
    const unitInfo = dmParseUnidad_(project, apartmentRaw);
    const sourceRecordId = 'INFO-' + rowNumber;

    let unitId = '';

    if (unitInfo.ok) {
      unitId = unitInfo.unidadId;

      if (unitInfo.towerMismatch) {
        dmAddConflict_(model, {
          tipo: 'TORRE_DECLARADA_NO_COINCIDE_CON_APARTAMENTO',
          severidad: 'MEDIA',
          unidadId: unitId,
          entidadId: unitId,
          campo: 'Torre',
          valorFuente1: unitInfo.torreDeclarada,
          valorFuente2: unitInfo.torreInferida,
          fuente1: 'INFO_APTOS',
          fuente2: 'REGLA_TERMINACION_APARTAMENTO',
          filaFuente: rowNumber,
          recomendacion: 'Se usa la torre inferida por la terminación del apartamento.'
        });
      }

      if (model.catalogoCargado && !model.units[unitId]) {
        dmAddConflict_(model, {
          tipo: 'UNIDAD_INFO_NO_EXISTE_EN_CATALOGO',
          severidad: 'ALTA',
          unidadId: unitId,
          entidadId: unitId,
          campo: 'UnidadID',
          valorFuente1: dmSafeTrim_(apartmentRaw),
          fuente1: 'INFO_APTOS',
          fuente2: 'CATALOGO_OFICIAL',
          filaFuente: rowNumber,
          recomendacion: 'Corregir el código en Info aptos; no crear unidades fuera del inventario oficial.'
        });
        unitId = '';
      } else {
        const ownerName = dmCleanContact_(dmGet_(record, ['Nombre']));
        const unitState = dmNormalizeText_(ownerName) === 'sin vender' ? 'SIN_VENDER' : 'ACTIVA';
        const deliveryRaw = dmGetRaw_(record, ['Fecha de Entrega Apartamento']);
        const deliveryDisplay = dmGet_(record, ['Fecha de Entrega Apartamento']);
        const delivery = dmDateOrBlank_(deliveryRaw);
        const deliveryState = delivery
          ? 'ENTREGADO'
          : (dmNormalizeText_(deliveryDisplay).indexOf('sin entregar') !== -1 ? 'SIN_ENTREGAR' : 'SIN_DATO');

        dmUpsertUnit_(model, {
          UnidadID: unitId,
          Torre: unitInfo.torre,
          Apartamento: unitInfo.apartamento,
          CodigoOficial: unitId,
          CodigoOriginal: dmSafeTrim_(apartmentRaw),
          NumeroOrdenCatalogo: '',
          AreaPrivadaConstruidaM2: '',
          CoeficienteCopropiedad: '',
          CoeficienteFraccion: '',
          ValorPresupuesto2026: '',
          PaginaFuente: '',
          Proyecto: dmSafeTrim_(project),
          EstadoUnidad: unitState,
          FechaEntregaApartamento: delivery,
          EstadoEntregaApartamento: deliveryState,
          FuentePrincipal: 'INFO_APTOS',
          FilaFuente: rowNumber,
          FechaActualizacion: now
        });

        dmImportarCompradorInfo_(record, model, {
          unitId: unitId,
          role: 'PROPIETARIO',
          sourceRecordId: sourceRecordId,
          rowNumber: rowNumber,
          nameHeaders: ['Nombre'],
          documentHeaders: ['Cédula'],
          emailHeaders: ['Correo Electrónico'],
          phoneHeaders: ['Celular', 'Tel.', 'Tel2', 'Cel2'],
          principal: true
        });

        dmImportarCompradorInfo_(record, model, {
          unitId: unitId,
          role: 'COPROPIETARIO',
          sourceRecordId: sourceRecordId,
          rowNumber: rowNumber,
          nameHeaders: ['Nombre 2do Comprador'],
          documentHeaders: ['Cédula 2do Comprador'],
          emailHeaders: ['Correo Electrónico 2do Comprador'],
          phoneHeaders: [],
          principal: false
        });

        const notificationEmails = dmEmailsFromRecord_(record, [
          'Correo Electrónico',
          'Correo Electrónico 2do Comprador'
        ]);

        if (notificationEmails.length === 0 && unitState !== 'SIN_VENDER') {
          dmAddConflict_(model, {
            tipo: 'UNIDAD_SIN_CORREO_VALIDO',
            severidad: 'ALTA',
            unidadId: unitId,
            entidadId: unitId,
            campo: 'Correo',
            fuente1: 'INFO_APTOS',
            filaFuente: rowNumber,
            recomendacion: 'Validar y registrar por lo menos un correo autorizado para notificaciones.'
          });
        }
      }
    } else if (apartmentLooksLikeParking) {
      dmAddConflict_(model, {
        tipo: 'PARQUEADERO_EN_COLUMNA_APARTAMENTO',
        severidad: 'ALTA',
        campo: 'Apartamento',
        valorFuente1: dmSafeTrim_(apartmentRaw),
        fuente1: 'INFO_APTOS',
        filaFuente: rowNumber,
        recomendacion: 'Mover el código a Parqueadero Asociado y definir si está disponible, sin vender o asignado.'
      });
    } else if (dmHasMeaningful_(apartmentRaw)) {
      dmAddConflict_(model, {
        tipo: 'APARTAMENTO_NO_INTERPRETABLE',
        severidad: 'ALTA',
        campo: 'Apartamento',
        valorFuente1: dmSafeTrim_(apartmentRaw),
        fuente1: 'INFO_APTOS',
        filaFuente: rowNumber,
        recomendacion: 'Corregir la torre y el apartamento en la hoja fuente.'
      });
    }

    dmImportarParqueaderoInfo_(record, model, {
      unitId: unitId,
      project: project,
      parkingRaw: effectiveParkingRaw,
      sourceRecordId: sourceRecordId,
      rowNumber: rowNumber
    });
  });
}

function dmImportarCompradorInfo_(record, model, options) {
  const rawName = dmCleanContact_(dmGet_(record, options.nameHeaders));
  const names = dmSplitOwnerNames_(rawName);
  const document = dmNormalizeDocument_(dmGet_(record, options.documentHeaders));
  const emails = dmEmailsFromRecord_(record, options.emailHeaders);
  const phones = dmPhonesFromRecord_(record, options.phoneHeaders);

  if (!rawName && !document && emails.length === 0 && phones.length === 0) return;
  if (dmNormalizeText_(rawName) === 'sin vender') return;

  // Un campo con varios propietarios separados por "/" genera una persona por nombre.
  // La información de documento, correo y teléfono pertenece únicamente al primero,
  // porque la fuente no permite atribuirla de forma segura a los demás.
  const peopleNames = names.length ? names : [''];

  peopleNames.forEach(function (name, index) {
    const first = index === 0;
    if (!name && !first) return;

    const role = first
      ? options.role
      : (options.role === 'PROPIETARIO' ? 'COPROPIETARIO' : options.role);

    const person = dmBuildPerson_({
      name: name,
      document: first ? document : '',
      documentType: first ? dmInferDocumentType_(document) : '',
      emails: first ? emails : [],
      phones: first ? phones : [],
      source: 'INFO_APTOS',
      sourceDate: '',
      unitIdForFallback: options.unitId,
      activeCensus: false,
      now: model.now
    });

    dmUpsertPerson_(model, person);

    const linkId = dmId_('VIN', [
      options.unitId,
      person.PersonaID,
      role,
      'INFO_APTOS',
      options.rowNumber,
      index
    ].join('|'));

    dmUpsertUnitLink_(model, {
      VinculoID: linkId,
      UnidadID: options.unitId,
      PersonaID: person.PersonaID,
      Rol: role,
      EsContactoPrincipal: first && options.principal ? 'SI' : 'NO',
      RecibeNotificaciones: first && emails.length > 0 ? 'SI' : 'NO',
      EstadoVinculo: 'ACTIVO',
      FechaInicio: '',
      FechaFin: '',
      Fuente: 'INFO_APTOS',
      RegistroFuenteID: options.sourceRecordId,
      FilaFuente: options.rowNumber,
      FechaActualizacion: model.now
    });
  });

  // Solo se deja conflicto cuando hay otros separadores ambiguos. El carácter "/"
  // ya queda resuelto automáticamente.
  if (rawName && names.length <= 1 && /[,;&]/.test(rawName)) {
    const firstPerson = peopleNames.length ? peopleNames[0] : rawName;
    dmAddConflict_(model, {
      tipo: 'NOMBRE_PRINCIPAL_POSIBLEMENTE_MULTIPLE',
      severidad: 'MEDIA',
      unidadId: options.unitId,
      entidadId: dmId_('PER', 'NOMBRE|' + dmNormalizeText_(firstPerson) + '|' + options.unitId),
      campo: 'NombreCompleto',
      valorFuente1: rawName,
      fuente1: 'INFO_APTOS',
      filaFuente: options.rowNumber,
      recomendacion: 'El carácter "/" se separa automáticamente. Revisar manualmente otros separadores ambiguos.'
    });
  }
}

function dmImportarParqueaderoInfo_(record, model, options) {
  const raw = dmCleanContact_(options.parkingRaw);
  const normalizedText = dmNormalizeText_(raw);

  if (!raw || normalizedText === 'sin parqueadero') return;

  const parkingInfo = dmResolverParqueaderoEnModelo_(raw, model);
  if (!parkingInfo.ok) {
    dmAddConflict_(model, {
      tipo: parkingInfo.ambiguous
        ? 'PARQUEADERO_AMBIGUO'
        : 'PARQUEADERO_NO_INTERPRETABLE',
      severidad: 'ALTA',
      unidadId: options.unitId,
      campo: 'Parqueadero Asociado',
      valorFuente1: raw,
      valorFuente2: parkingInfo.candidates ? parkingInfo.candidates.join(', ') : '',
      fuente1: 'INFO_APTOS',
      fuente2: model.catalogoCargado ? 'CATALOGO_OFICIAL' : '',
      filaFuente: options.rowNumber,
      recomendacion: parkingInfo.ambiguous
        ? 'Registrar el código oficial completo de cinco dígitos.'
        : 'Normalizar el código con base en el catálogo oficial.'
    });
    return;
  }

  if (model.catalogoCargado && !parkingInfo.existsInCatalog) {
    dmAddConflict_(model, {
      tipo: 'PARQUEADERO_INFO_NO_EXISTE_EN_CATALOGO',
      severidad: 'ALTA',
      unidadId: options.unitId,
      entidadId: parkingInfo.parqueaderoId,
      campo: 'CodigoOficial',
      valorFuente1: raw,
      valorFuente2: parkingInfo.codigoOficial,
      fuente1: 'INFO_APTOS',
      fuente2: 'CATALOGO_OFICIAL',
      filaFuente: options.rowNumber,
      recomendacion: 'Confirmar el número informado. El código oficial del catálogo prevalece sobre prefijos o formatos alternos.'
    });
    return;
  }

  const deliveryRaw = dmGetRaw_(record, ['Fecha de Entrega Parqueadero']);
  const deliveryDisplay = dmGet_(record, ['Fecha de Entrega Parqueadero']);
  const delivery = dmDateOrBlank_(deliveryRaw);
  const state = delivery
    ? 'ENTREGADO'
    : (dmNormalizeText_(deliveryDisplay).indexOf('sin entregar') !== -1 ? 'SIN_ENTREGAR' : 'REGISTRADO');

  dmUpsertParking_(model, {
    ParqueaderoID: parkingInfo.parqueaderoId,
    CodigoOficial: parkingInfo.codigoOficial,
    CodigoLegacy: parkingInfo.codigoLegacy,
    SubtipoParqueadero: '',
    Sector: '',
    PrefijoCodigo: parkingInfo.prefijoCodigo,
    NumeroParqueadero: parkingInfo.numero,
    AreaPrivadaConstruidaM2: '',
    CoeficienteCopropiedad: '',
    CoeficienteFraccion: '',
    ValorPresupuesto2026: '',
    NumeroOrdenCatalogo: '',
    PaginaFuente: '',
    EstadoParqueadero: state,
    FechaEntrega: delivery,
    Fuentes: 'INFO_APTOS',
    FechaActualizacion: model.now
  });

  if (options.unitId) {
    const assignmentId = dmId_('APQ', [
      parkingInfo.parqueaderoId,
      options.unitId,
      'INFO_APTOS',
      options.rowNumber
    ].join('|'));

    dmUpsertParkingLink_(model, {
      AsignacionParqueaderoID: assignmentId,
      ParqueaderoID: parkingInfo.parqueaderoId,
      UnidadID: options.unitId,
      TipoTenencia: 'ASOCIADO_INFO_APTOS',
      EstadoAsignacion: 'ACTIVA',
      EsActual: 'SI',
      Fuente: 'INFO_APTOS',
      RegistroFuenteID: options.sourceRecordId,
      FilaFuente: options.rowNumber,
      FechaFuente: '',
      FechaActualizacion: model.now
    });
  } else {
    dmAddConflict_(model, {
      tipo: 'PARQUEADERO_SIN_UNIDAD',
      severidad: 'ALTA',
      entidadId: parkingInfo.parqueaderoId,
      campo: 'UnidadID',
      valorFuente1: parkingInfo.codigoOficial,
      fuente1: 'INFO_APTOS',
      filaFuente: options.rowNumber,
      recomendacion: 'Asignar el parqueadero a una unidad o marcarlo como disponible/no vendido.'
    });
  }
}

function dmImportarCensoAlModelo_(activeSs, config, model) {
  const source = dmObtenerFuenteCenso_(activeSs, config);
  const rows = dmLeerFilas_(source.sheet);
  const parsed = [];
  const byUnit = {};

  rows.forEach(function (record) {
    if (dmFilaVacia_(record.display)) return;
    model.stats.filasCensoLeidas++;

    const tower = dmGet_(record, ['Torre']);
    const apartment = dmGet_(record, ['Apartamento']);
    const unitInfo = dmParseUnidad_(tower, apartment);
    const timestamp = dmDateOrBlank_(dmGetRaw_(record, ['Marca temporal']));
    const censoId = dmId_('CEN', [
      source.spreadsheetId,
      source.sheet.getSheetId(),
      record.rowNumber,
      timestamp ? timestamp.getTime() : ''
    ].join('|'));

    const item = {
      record: record,
      unitInfo: unitInfo,
      timestamp: timestamp,
      censoId: censoId
    };
    parsed.push(item);

    if (unitInfo.ok) {
      if (!byUnit[unitInfo.unidadId]) byUnit[unitInfo.unidadId] = [];
      byUnit[unitInfo.unidadId].push(item);
    }
  });

  const latestByUnit = {};
  Object.keys(byUnit).forEach(function (unitId) {
    byUnit[unitId].sort(function (a, b) {
      const timeA = a.timestamp ? a.timestamp.getTime() : 0;
      const timeB = b.timestamp ? b.timestamp.getTime() : 0;
      if (timeA !== timeB) return timeA - timeB;
      return a.record.rowNumber - b.record.rowNumber;
    });

    latestByUnit[unitId] = byUnit[unitId][byUnit[unitId].length - 1].censoId;

    if (byUnit[unitId].length > 1) {
      model.stats.unidadesConMultiplesRespuestas++;
      model.stats.respuestasCensoDuplicadas += byUnit[unitId].length - 1;
      dmAddConflict_(model, {
        tipo: 'CENSO_MULTIPLES_RESPUESTAS',
        severidad: 'MEDIA',
        unidadId: unitId,
        entidadId: unitId,
        campo: 'Censo',
        valorFuente1: String(byUnit[unitId].length),
        fuente1: 'CENSO',
        filaFuente: byUnit[unitId][byUnit[unitId].length - 1].record.rowNumber,
        recomendacion: 'Se consolidan residentes, vehículos y mascotas de todas las respuestas. Para datos incompatibles se usa la respuesta más reciente.'
      });
    }
  });

  model.stats.unidadesConCenso = Object.keys(latestByUnit).filter(function (unitId) {
    return !!model.units[unitId];
  }).length;
  model.stats.unidadesSinCenso = Math.max(0, Object.keys(model.units).length - model.stats.unidadesConCenso);

  parsed.forEach(function (item) {
    dmProcesarRespuestaCenso_(item, latestByUnit, model);
  });
}

function dmProcesarRespuestaCenso_(item, latestByUnit, model) {
  const record = item.record;
  const unitInfo = item.unitInfo;
  const isLatest = unitInfo.ok && latestByUnit[unitInfo.unidadId] === item.censoId;
  const vigencia = isLatest ? 'ACTIVO' : 'HISTORICO';
  const rowNumber = record.rowNumber;
  const timestamp = item.timestamp;
  const respondentType = dmNormalizeRole_(dmGet_(record, ['Información Personal']));
  const declaredResidents = dmToInteger_(dmGet_(record, ['Cuantas personas Residen en el Inmueble']));
  const respondentName = dmCleanContact_(dmGet_(record, ['Nombre']));
  const respondentDocument = dmNormalizeDocument_(dmGet_(record, ['Cédula']));
  const respondentEmails = dmEmailsFromRecord_(record, ['Correo electrónico', 'Dirección de correo electrónico']);
  const respondentPhones = dmPhonesFromRecord_(record, ['Celular']);
  const unitId = unitInfo.ok ? unitInfo.unidadId : '';

  let status = 'VALIDO';
  if (!unitInfo.ok) {
    status = 'UNIDAD_INVALIDA';
    model.stats.respuestasCensoInvalidas++;
    dmAddConflict_(model, {
      tipo: 'CENSO_UNIDAD_INVALIDA',
      severidad: 'ALTA',
      campo: 'Torre/Apartamento',
      valorFuente1: dmSafeTrim_(dmGet_(record, ['Torre'])),
      valorFuente2: dmSafeTrim_(dmGet_(record, ['Apartamento'])),
      fuente1: 'CENSO',
      filaFuente: rowNumber,
      recomendacion: 'Corregir la torre y el apartamento en la respuesta del censo.'
    });
  } else if (!model.units[unitId]) {
    status = 'UNIDAD_NO_EXISTE_EN_CATALOGO';
    model.stats.respuestasCensoInvalidas++;
    dmAddConflict_(model, {
      tipo: 'CENSO_UNIDAD_NO_ENCONTRADA',
      severidad: 'ALTA',
      unidadId: unitId,
      entidadId: item.censoId,
      campo: 'UnidadID',
      valorFuente1: unitId,
      fuente1: 'CENSO',
      fuente2: 'CATALOGO_OFICIAL',
      filaFuente: rowNumber,
      recomendacion: 'Verificar si la torre fue seleccionada incorrectamente; la unidad no existe en el inventario oficial.'
    });
  } else {
    model.stats.respuestasCensoValidas++;
  }

  let respondentPersonId = '';
  if (unitId && model.units[unitId] && (respondentName || respondentDocument || respondentEmails.length || respondentPhones.length)) {
    const person = dmBuildPerson_({
      name: respondentName,
      document: respondentDocument,
      documentType: dmInferDocumentType_(respondentDocument),
      emails: respondentEmails,
      phones: respondentPhones,
      source: 'CENSO',
      sourceDate: timestamp,
      unitIdForFallback: unitId,
      activeCensus: isLatest,
      now: model.now
    });

    const role = respondentType || 'INFORMANTE';
    const ownerRoles = role === 'PROPIETARIO'
      ? ['PROPIETARIO', 'COPROPIETARIO']
      : [role, 'RESIDENTE'];
    const correlated = dmFindCorrelatedPersonForUnit_(model, unitId, person, ownerRoles);

    if (correlated) {
      person.PersonaID = correlated.person.PersonaID;
    }

    respondentPersonId = person.PersonaID;
    dmUpsertPerson_(model, person);

    // Cuando el censo corresponde a la misma persona de Info aptos, se conserva
    // el vínculo prioritario y el censo solo completa campos faltantes.
    if (correlated && correlated.link && correlated.link.Fuente === 'INFO_APTOS') {
      correlated.link.Fuente = dmMergeList_(correlated.link.Fuente, 'CENSO', '|');
      correlated.link.FechaActualizacion = model.now;
    } else {
      const linkState = isLatest ? 'ACTIVO' : 'HISTORICO';
      const linkId = dmId_('VIN', [unitId, person.PersonaID, role, item.censoId].join('|'));

      dmUpsertUnitLink_(model, {
        VinculoID: linkId,
        UnidadID: unitId,
        PersonaID: person.PersonaID,
        Rol: role,
        EsContactoPrincipal: isLatest ? 'SI' : 'NO',
        RecibeNotificaciones: isLatest && respondentEmails.length ? 'SI' : 'NO',
        EstadoVinculo: linkState,
        FechaInicio: timestamp || '',
        FechaFin: '',
        Fuente: 'CENSO',
        RegistroFuenteID: item.censoId,
        FilaFuente: rowNumber,
        FechaActualizacion: model.now
      });
    }

    if (isLatest && role === 'PROPIETARIO') {
      dmDetectarCambioPropietario_(model, unitId, person, rowNumber);
    }
  }

  let capturedResidents = 0;
  if (unitId && model.units[unitId]) {
    for (let i = 1; i <= 5; i++) {
      const residentName = dmCleanContact_(dmGet_(record, ['Nombre Persona ' + i]));
      const residentDocType = dmCleanContact_(dmGet_(record, [
        i === 1 ? 'Documento de identificación' : 'Documento de identificación ' + i
      ]));
      const residentDocument = dmNormalizeDocument_(dmGet_(record, [
        i === 1 ? 'Número documento Persona 1' : 'Número documento Persona ' + i
      ]));

      if (!residentName && !residentDocument) continue;
      capturedResidents++;

      const resident = dmBuildPerson_({
        name: residentName,
        document: residentDocument,
        documentType: residentDocType || dmInferDocumentType_(residentDocument),
        emails: [],
        phones: [],
        source: 'CENSO',
        sourceDate: timestamp,
        unitIdForFallback: unitId,
        activeCensus: isLatest,
        now: model.now
      });

      const correlatedResident = dmFindCorrelatedPersonForUnit_(
        model,
        unitId,
        resident,
        ['RESIDENTE']
      );
      if (correlatedResident) {
        resident.PersonaID = correlatedResident.person.PersonaID;
      }

      dmUpsertPerson_(model, resident);

      // Los residentes de todos los censos de la unidad se consolidan como una
      // sola relación activa por persona. Las diferencias menores se correlacionan.
      const residentLinkId = dmId_('VIN', [
        unitId,
        resident.PersonaID,
        'RESIDENTE',
        'CENSO_CONSOLIDADO'
      ].join('|'));
      dmUpsertUnitLink_(model, {
        VinculoID: residentLinkId,
        UnidadID: unitId,
        PersonaID: resident.PersonaID,
        Rol: 'RESIDENTE',
        EsContactoPrincipal: 'NO',
        RecibeNotificaciones: 'NO',
        EstadoVinculo: 'ACTIVO',
        FechaInicio: timestamp || '',
        FechaFin: '',
        Fuente: 'CENSO',
        RegistroFuenteID: item.censoId,
        FilaFuente: rowNumber,
        FechaActualizacion: model.now
      });
    }

    if (declaredResidents !== null && declaredResidents !== capturedResidents) {
      dmAddConflict_(model, {
        tipo: 'CENSO_CANTIDAD_RESIDENTES_NO_COINCIDE',
        severidad: 'MEDIA',
        unidadId: unitId,
        entidadId: item.censoId,
        campo: 'CantidadResidentes',
        valorFuente1: String(declaredResidents),
        valorFuente2: String(capturedResidents),
        fuente1: 'CENSO_DECLARADO',
        fuente2: 'CENSO_PERSONAS',
        filaFuente: rowNumber,
        recomendacion: 'Confirmar la cantidad real de residentes y completar personas faltantes.'
      });
    }

    dmImportarVehiculosCenso_(record, model, {
      unitId: unitId,
      respondentPersonId: respondentPersonId,
      censoId: item.censoId,
      rowNumber: rowNumber,
      timestamp: timestamp,
      isLatest: isLatest
    });

    dmImportarParqueaderoCenso_(record, model, {
      unitId: unitId,
      censoId: item.censoId,
      rowNumber: rowNumber,
      timestamp: timestamp,
      isLatest: isLatest
    });

    dmImportarMascotaCenso_(record, model, {
      unitId: unitId,
      censoId: item.censoId,
      rowNumber: rowNumber,
      timestamp: timestamp,
      isLatest: isLatest
    });

    dmImportarContactoEmergenciaCenso_(record, model, {
      unitId: unitId,
      censoId: item.censoId,
      rowNumber: rowNumber,
      timestamp: timestamp,
      isLatest: isLatest
    });
  }

  const rawCensusForHash = record.display.join('|');
  model.censusHistory.push({
    CensoID: item.censoId,
    UnidadID: unitId,
    FechaRespuesta: timestamp || '',
    TipoInformante: respondentType,
    PersonaInformanteID: respondentPersonId,
    InmobiliariaNombre: dmCleanContact_(dmGet_(record, [
      'Nombre de Inmobiliaria ( En caso de ser Arrendatario) En caso de ser propietario indicar NA'
    ])),
    InmobiliariaCorreo: dmFirst_(dmExtractEmails_(dmGet_(record, [
      'Correo electrónico Inmobiliaria (En caso de ser Arrendatario)'
    ]))),
    CantidadResidentesDeclarada: declaredResidents === null ? '' : declaredResidents,
    CantidadResidentesCapturada: capturedResidents,
    TieneMoto: dmNormalizeYesNo_(dmGet_(record, ['Tienes Moto'])),
    TieneCarro: dmNormalizeYesNo_(dmGet_(record, ['Tiene Carro'])),
    PlacasRaw: dmSafeTrim_(dmGet_(record, ['Indique Placas'])),
    TieneParqueadero: dmSafeTrim_(dmGet_(record, ['Tienes parqueadero'])),
    NumeroParqueadero: dmSafeTrim_(dmGet_(record, ['Número de parqueadero'])),
    TieneMascotas: dmNormalizeYesNo_(dmGet_(record, ['Tiene Mascotas'])),
    EstadoRegistro: status,
    Vigencia: vigencia,
    FilaFuente: rowNumber,
    HashFuente: dmHash_(rawCensusForHash),
    FechaImportacion: model.now
  });
}

function dmImportarVehiculosCenso_(record, model, options) {
  const raw = dmSafeTrim_(dmGet_(record, ['Indique Placas']));
  const plates = dmExtractPlates_(raw);
  const saysMoto = dmNormalizeYesNo_(dmGet_(record, ['Tienes Moto'])) === 'SI';
  const saysCar = dmNormalizeYesNo_(dmGet_(record, ['Tiene Carro'])) === 'SI';
  const negativeRaw = dmIsNegativeFreeText_(raw);

  if ((saysMoto || saysCar) && plates.length === 0) {
    dmAddConflict_(model, {
      tipo: 'CENSO_VEHICULO_SIN_PLACA',
      severidad: 'MEDIA',
      unidadId: options.unitId,
      entidadId: options.censoId,
      campo: 'Placas',
      valorFuente1: raw,
      fuente1: 'CENSO',
      filaFuente: options.rowNumber,
      recomendacion: 'Solicitar la placa y validar el tipo de vehículo.'
    });
  }

  plates.forEach(function (plate) {
    const type = dmVehicleTypeByPlate_(plate);
    const vehicleId = 'VEH-' + plate;

    dmUpsertVehicle_(model, {
      VehiculoID: vehicleId,
      Placa: plate,
      TipoVehiculo: type || (saysMoto && !saysCar ? 'MOTO' : (saysCar && !saysMoto ? 'CARRO' : 'PENDIENTE_VALIDACION')),
      EstadoVehiculo: type ? 'VALIDADO_FORMATO' : 'PENDIENTE_VALIDACION',
      Fuentes: 'CENSO',
      FechaActualizacion: model.now
    });

    dmAddVehicleEvidence_(model, {
      VehiculoID: vehicleId,
      Placa: plate,
      UnidadID: options.unitId,
      TipoVehiculo: type || (saysMoto && !saysCar ? 'MOTO' : (saysCar && !saysMoto ? 'CARRO' : 'PENDIENTE_VALIDACION')),
      TipoVinculo: 'RESIDENTE',
      Fuente: 'CENSO',
      PrioridadFuente: dmVehicleSourcePriority_('CENSO'),
      GrupoEvidencia: 'CENSO',
      FuenteOriginal: 'CENSO_FORMULARIO',
      ApartamentoOriginal: options.unitId,
      CalidadRegistro: 'VALIDO',
      EsUtilizable: 'SI',
      EsActualCandidato: 'SI',
      FechaFuente: options.timestamp || '',
      VigenteDesde: options.timestamp || '',
      VigenteHasta: '',
      RegistroFuenteID: options.censoId,
      FilaFuente: options.rowNumber,
      Observaciones: 'Placa reportada por el apartamento en el censo poblacional.'
    });
  });

  if (raw && plates.length === 0 && !negativeRaw && !saysMoto && !saysCar) {
    dmAddConflict_(model, {
      tipo: 'PLACA_NO_RECONOCIDA',
      severidad: 'MEDIA',
      unidadId: options.unitId,
      entidadId: options.censoId,
      campo: 'Placas',
      valorFuente1: raw,
      fuente1: 'CENSO',
      filaFuente: options.rowNumber,
      recomendacion: 'Revisar manualmente el texto y registrar placas con formato colombiano.'
    });
  }
}

function dmImportarParqueaderoCenso_(record, model, options) {
  const rawNumber = dmCleanContact_(dmGet_(record, ['Número de parqueadero']));
  const tenureRaw = dmSafeTrim_(dmGet_(record, ['Tienes parqueadero']));
  const tenure = dmNormalizeParkingTenure_(tenureRaw);

  if (!rawNumber || tenure === 'NO_TIENE' || dmIsNegativeFreeText_(rawNumber)) return;

  const parkingInfo = dmResolverParqueaderoEnModelo_(rawNumber, model);

  // La asignación de Info aptos es prioritaria. El censo solo completa cuando
  // la hoja principal no tiene parqueadero asociado.
  const infoLink = dmFindActiveParkingLinkBySource_(model, options.unitId, 'INFO_APTOS');
  if (infoLink) {
    if (parkingInfo.ok && !dmSameParking_(infoLink.ParqueaderoID, parkingInfo.parqueaderoId)) {
      dmAddConflict_(model, {
        tipo: 'PARQUEADERO_CENSO_DIFIERE_INFO_APTOS',
        severidad: 'ALTA',
        unidadId: options.unitId,
        entidadId: options.censoId,
        campo: 'ParqueaderoID',
        valorFuente1: infoLink.ParqueaderoID,
        valorFuente2: parkingInfo.parqueaderoId,
        fuente1: 'INFO_APTOS',
        fuente2: 'CENSO',
        filaFuente: options.rowNumber,
        recomendacion: 'Se conserva Info aptos. Validar manualmente si hubo cambio real de parqueadero.'
      });
    }
    return;
  }

  // Si Info aptos no tiene parqueadero, prevalece el último censo válido.
  if (!options.isLatest) return;

  if (!parkingInfo.ok) {
    dmAddConflict_(model, {
      tipo: parkingInfo.ambiguous
        ? 'CENSO_PARQUEADERO_AMBIGUO'
        : 'CENSO_PARQUEADERO_NO_INTERPRETABLE',
      severidad: 'MEDIA',
      unidadId: options.unitId,
      entidadId: options.censoId,
      campo: 'Número de parqueadero',
      valorFuente1: rawNumber,
      valorFuente2: parkingInfo.candidates ? parkingInfo.candidates.join(', ') : '',
      fuente1: 'CENSO',
      fuente2: model.catalogoCargado ? 'CATALOGO_OFICIAL' : '',
      filaFuente: options.rowNumber,
      recomendacion: parkingInfo.ambiguous
        ? 'Solicitar el código oficial completo de cinco dígitos.'
        : 'Verificar el código contra el catálogo oficial.'
    });
    return;
  }

  if (model.catalogoCargado && !parkingInfo.existsInCatalog) {
    dmAddConflict_(model, {
      tipo: 'CENSO_PARQUEADERO_NO_EXISTE_EN_CATALOGO',
      severidad: 'ALTA',
      unidadId: options.unitId,
      entidadId: parkingInfo.parqueaderoId,
      campo: 'CodigoOficial',
      valorFuente1: rawNumber,
      valorFuente2: parkingInfo.codigoOficial,
      fuente1: 'CENSO',
      fuente2: 'CATALOGO_OFICIAL',
      filaFuente: options.rowNumber,
      recomendacion: 'Confirmar el número informado. Los prefijos, separadores y ceros a la izquierda se ignoran para correlacionar con el código oficial.'
    });
    return;
  }

  dmUpsertParking_(model, {
    ParqueaderoID: parkingInfo.parqueaderoId,
    CodigoOficial: parkingInfo.codigoOficial,
    CodigoLegacy: parkingInfo.codigoLegacy,
    SubtipoParqueadero: '',
    Sector: '',
    PrefijoCodigo: parkingInfo.prefijoCodigo,
    NumeroParqueadero: parkingInfo.numero,
    AreaPrivadaConstruidaM2: '',
    CoeficienteCopropiedad: '',
    CoeficienteFraccion: '',
    ValorPresupuesto2026: '',
    NumeroOrdenCatalogo: '',
    PaginaFuente: '',
    EstadoParqueadero: 'REPORTADO_CENSO',
    FechaEntrega: '',
    Fuentes: 'CENSO',
    FechaActualizacion: model.now
  });

  const assignmentId = dmId_('APQ', [parkingInfo.parqueaderoId, options.unitId, options.censoId].join('|'));
  dmUpsertParkingLink_(model, {
    AsignacionParqueaderoID: assignmentId,
    ParqueaderoID: parkingInfo.parqueaderoId,
    UnidadID: options.unitId,
    TipoTenencia: tenure,
    EstadoAsignacion: options.isLatest ? 'ACTIVA' : 'HISTORICA',
    EsActual: options.isLatest ? 'SI' : 'NO',
    Fuente: 'CENSO',
    RegistroFuenteID: options.censoId,
    FilaFuente: options.rowNumber,
    FechaFuente: options.timestamp || '',
    FechaActualizacion: model.now
  });
}

function dmImportarMascotaCenso_(record, model, options) {
  const hasPets = dmNormalizeYesNo_(dmGet_(record, ['Tiene Mascotas']));
  if (hasPets !== 'SI') return;

  const type = dmCleanContact_(dmGet_(record, ['Que mascota tienes actualmente']));
  const breed = dmCleanContact_(dmGet_(record, ['Raza']));
  const similarPetId = dmFindSimilarPetId_(model, options.unitId, type, breed);
  const petId = similarPetId || dmId_('MAS', [
    options.unitId,
    dmNormalizeText_(type),
    dmNormalizeText_(breed)
  ].join('|'));

  dmUpsertPet_(model, {
    MascotaID: petId,
    UnidadID: options.unitId,
    TipoMascota: type,
    Raza: breed,
    Cantidad: 1,
    EstadoRegistro: 'ACTIVO',
    EsActual: 'SI',
    Fuente: 'CENSO',
    RegistroFuenteID: options.censoId,
    FilaFuente: options.rowNumber,
    FechaFuente: options.timestamp || '',
    FechaActualizacion: model.now
  });
}

function dmImportarContactoEmergenciaCenso_(record, model, options) {
  if (!options.isLatest) return;

  const name = dmCleanContact_(dmGet_(record, ['Contacto de Emergencia Nombre completo']));
  const phones = dmPhonesFromRecord_(record, ['Numero celular contacto de emergencia']);
  const relationship = dmCleanContact_(dmGet_(record, ['Parentesco']));

  if (!name && phones.length === 0 && !relationship) return;

  const contactId = dmId_('EME', [options.unitId, name, dmFirst_(phones), options.censoId].join('|'));
  model.emergencyContacts[contactId] = {
    ContactoEmergenciaID: contactId,
    UnidadID: options.unitId,
    NombreCompleto: name,
    Celular: dmFirst_(phones),
    Parentesco: relationship,
    EsActual: options.isLatest ? 'SI' : 'NO',
    Fuente: 'CENSO',
    RegistroFuenteID: options.censoId,
    FilaFuente: options.rowNumber,
    FechaFuente: options.timestamp || '',
    FechaActualizacion: model.now
  };
}

/***************************************
 * DETECCIÓN DE CONFLICTOS
 ***************************************/
function dmDetectarCambioPropietario_(model, unitId, censusPerson, rowNumber) {
  const ownerLinks = Object.keys(model.unitLinks)
    .map(function (key) { return model.unitLinks[key]; })
    .filter(function (link) {
      return link.UnidadID === unitId &&
        link.Fuente.indexOf('INFO_APTOS') !== -1 &&
        (link.Rol === 'PROPIETARIO' || link.Rol === 'COPROPIETARIO') &&
        link.EstadoVinculo === 'ACTIVO';
    });

  const owners = ownerLinks
    .map(function (link) {
      return { link: link, person: model.persons[link.PersonaID] };
    })
    .filter(function (item) { return !!item.person; });

  if (owners.length === 0) return;

  const matches = owners.some(function (item) {
    return dmPersonSimilarity_(item.person, censusPerson) >= dmSimilarityThreshold_(model);
  });

  if (matches) return;

  // Cuando el último censo es completamente distinto, se interpreta como un
  // posible cambio real. Se conserva el histórico de Info aptos, pero el último
  // censo queda vigente y principal hasta revisión administrativa.
  ownerLinks.forEach(function (link) {
    link.EstadoVinculo = 'HISTORICO';
    link.EsContactoPrincipal = 'NO';
    link.RecibeNotificaciones = 'NO';
    link.FechaActualizacion = model.now;
  });

  dmAddConflict_(model, {
    tipo: 'PROPIETARIO_CENSO_NO_COINCIDE',
    severidad: 'ALTA',
    unidadId: unitId,
    entidadId: censusPerson.PersonaID,
    campo: 'Propietario',
    valorFuente1: owners.map(function (item) { return item.person.NombreCompleto; }).join(' / '),
    valorFuente2: censusPerson.NombreCompleto,
    fuente1: 'INFO_APTOS',
    fuente2: 'ULTIMO_CENSO',
    filaFuente: rowNumber,
    recomendacion: 'Los datos son claramente distintos. Se toma provisionalmente el último censo y se conserva Info aptos como histórico para revisión.'
  });
}


/***************************************
 * VEHÍCULOS - INTEGRACIÓN MULTIFUENTE
 ***************************************/
function dmVehicleSourcePriority_(source) {
  const text = dmSafeTrim_(source).toUpperCase();
  if (text === 'BIOMETRICO') return 400;
  if (text === 'CENSO') return 300;
  if (text === 'MAESTRA_SANCIONES') return 200;
  if (text === 'REGISTRO_VIGILANCIA') return 100;
  return dmSourcePriority_(text);
}

function dmNormalizePlate_(value) {
  const plate = dmSafeTrim_(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return dmVehicleTypeByPlate_(plate) ? plate : '';
}

function dmNormalizeVehicleType_(value, plate) {
  const byPlate = dmVehicleTypeByPlate_(plate);
  if (byPlate) return byPlate;
  const text = dmNormalizeText_(value).toUpperCase();
  if (text.indexOf('MOTO') !== -1 || text.indexOf('TWO-WHEELER') !== -1) return 'MOTO';
  if (text.indexOf('CARRO') !== -1 || text.indexOf('SEDAN') !== -1 || text.indexOf('SUV') !== -1) return 'CARRO';
  return 'PENDIENTE_VALIDACION';
}

function dmVehicleTypeFromBiometricCode_(value, plate) {
  const byPlate = dmVehicleTypeByPlate_(plate);
  if (byPlate) return byPlate;
  const code = dmToInteger_(value);
  if (code === 7) return 'MOTO';
  if (code === 8) return 'TRICICLO';
  if (code === 6 || code === 12) return 'NO_MOTORIZADO';
  return code ? 'CARRO' : 'PENDIENTE_VALIDACION';
}

function dmAddVehicleEvidence_(model, row) {
  const plate = dmNormalizePlate_(row.Placa || (row.VehiculoID || '').replace(/^VEH-/, ''));
  if (!plate) return;

  const vehicleId = 'VEH-' + plate;
  const source = dmSafeTrim_(row.Fuente).toUpperCase();
  const unitId = dmNormalizeUnitIdValue_(row.UnidadID);
  const evidenceId = dmId_('EVE', [
    source,
    vehicleId,
    unitId || dmSafeTrim_(row.ApartamentoOriginal),
    row.RegistroFuenteID || '',
    row.FilaFuente || '',
    row.FechaFuente || ''
  ].join('|'));

  const evidence = {
    EvidenciaVehiculoID: evidenceId,
    VehiculoID: vehicleId,
    Placa: plate,
    UnidadID: unitId,
    TipoVehiculo: dmNormalizeVehicleType_(row.TipoVehiculo, plate),
    TipoVinculo: row.TipoVinculo || 'NO_DETERMINADO',
    Fuente: source,
    PrioridadFuente: row.PrioridadFuente || dmVehicleSourcePriority_(source),
    GrupoEvidencia: row.GrupoEvidencia || source,
    FuenteOriginal: row.FuenteOriginal || source,
    ApartamentoOriginal: dmSafeTrim_(row.ApartamentoOriginal),
    CalidadRegistro: row.CalidadRegistro || (unitId ? 'VALIDO' : 'SIN_UNIDAD_VALIDA'),
    EsUtilizable: row.EsUtilizable || (unitId ? 'SI' : 'NO'),
    EsActualCandidato: row.EsActualCandidato || 'SI',
    FechaFuente: row.FechaFuente || '',
    VigenteDesde: row.VigenteDesde || '',
    VigenteHasta: row.VigenteHasta || '',
    RegistroFuenteID: row.RegistroFuenteID || '',
    FilaFuente: row.FilaFuente || '',
    Observaciones: row.Observaciones || '',
    FechaImportacion: model.now
  };

  const existing = model.vehicleEvidence[evidenceId];
  if (!existing) {
    model.vehicleEvidence[evidenceId] = evidence;
  } else {
    existing.Observaciones = dmMergeList_(existing.Observaciones, evidence.Observaciones, ' | ');
    if (dmDateMillis_(evidence.FechaFuente) >= dmDateMillis_(existing.FechaFuente)) {
      Object.keys(evidence).forEach(function (field) { existing[field] = evidence[field]; });
    }
  }

  dmUpsertVehicle_(model, {
    VehiculoID: vehicleId,
    Placa: plate,
    TipoVehiculo: evidence.TipoVehiculo,
    EstadoVehiculo: evidence.TipoVehiculo === 'PENDIENTE_VALIDACION'
      ? 'PENDIENTE_VALIDACION'
      : 'VALIDADO_FORMATO',
    Fuentes: source,
    FechaActualizacion: model.now
  });
}

function dmImportarFuentesVehiculosExternas_(ss, config, model) {
  if (dmNormalizeYesNo_(config.VEHICULOS_MULTIFUENTE_ENABLED) === 'NO') return;

  if (dmNormalizeYesNo_(config.VEHICULOS_BIOMETRICO_ENABLED) !== 'NO') {
    dmImportarFuenteVehiculosSegura_(model, 'BIOMETRICO', function () {
      dmImportarVehiculosBiometrico_(ss, config, model);
    });
  }

  if (dmNormalizeYesNo_(config.VEHICULOS_MAESTRA_ENABLED) !== 'NO') {
    dmImportarFuenteVehiculosSegura_(model, 'MAESTRA_SANCIONES', function () {
      dmImportarVehiculosMaestraSanciones_(ss, config, model);
    });
  }

  if (dmNormalizeYesNo_(config.VEHICULOS_VIGILANCIA_ENABLED) !== 'NO') {
    dmImportarFuenteVehiculosSegura_(model, 'REGISTRO_VIGILANCIA', function () {
      dmImportarVehiculosVigilancia_(ss, config, model);
    });
  }
}

function dmImportarFuenteVehiculosSegura_(model, source, callback) {
  try {
    callback();
  } catch (error) {
    model.stats.fuentesVehiculoOmitidas += 1;
    dmAddConflict_(model, {
      tipo: 'FUENTE_VEHICULOS_NO_DISPONIBLE',
      severidad: source === 'BIOMETRICO' ? 'ALTA' : 'MEDIA',
      entidadId: source,
      campo: 'Fuente',
      valorFuente1: source,
      valorFuente2: error && error.message ? error.message : String(error),
      fuente1: source,
      recomendacion: source === 'BIOMETRICO'
        ? 'Convierte el XLSX biométrico a Google Sheets, actualiza VEHICULOS_BIOMETRICO_SPREADSHEET_ID y verifica el nombre de la pestaña.'
        : 'Verifica el ID, el nombre de la pestaña y los permisos de la cuenta que ejecuta Apps Script.'
    });
  }
}

function dmOpenConfiguredSourceSheet_(activeSs, config, idKey, sheetKey, label) {
  const configuredId = dmSafeTrim_(config[idKey]);
  const sheetName = dmSafeTrim_(config[sheetKey]);
  if (!configuredId) throw new Error('No se configuró ' + idKey + '.');
  if (!sheetName) throw new Error('No se configuró ' + sheetKey + '.');

  const normalizedId = dmNormalizeText_(configuredId).replace(/\s+/g, '_');
  const sameFile = normalizedId === 'mismo_archivo' || normalizedId === 'mismo_archivo_';
  let sourceSs;
  try {
    sourceSs = sameFile ? activeSs : SpreadsheetApp.openById(dmExtractSpreadsheetId_(configuredId));
  } catch (error) {
    throw new Error(
      'No fue posible abrir ' + label + ' mediante SpreadsheetApp. ' +
      'La fuente debe ser un Google Sheet nativo y la cuenta del script debe tener acceso. Detalle: ' +
      (error && error.message ? error.message : String(error))
    );
  }

  const sheet = sourceSs.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('No existe la pestaña "' + sheetName + '" en ' + label + '.');
  }
  return { spreadsheet: sourceSs, sheet: sheet };
}

function dmResolveUnitCandidate_(raw, model) {
  const parsed = dmParseUnidad_('', raw);
  if (!parsed.ok) {
    return { ok: false, unitId: '', raw: dmSafeTrim_(raw), reason: 'NO_INTERPRETABLE' };
  }
  if (!model.units[parsed.unidadId]) {
    return { ok: false, unitId: parsed.unidadId, raw: dmSafeTrim_(raw), reason: 'NO_EXISTE_EN_CATALOGO' };
  }
  return { ok: true, unitId: parsed.unidadId, raw: dmSafeTrim_(raw), reason: '' };
}

function dmUnitCandidatesFromFreeText_(value, model, options) {
  const opts = options || {};
  const text = dmSafeTrim_(value).toUpperCase();
  if (!text || dmIsNegativeFreeText_(text) || /PROHIB/.test(text)) {
    return { ok: false, ambiguous: false, candidates: [], raw: text };
  }

  const found = {};
  function addCandidate(rawApt) {
    const parsed = dmParseUnidad_('', rawApt);
    if (parsed.ok && model.units[parsed.unidadId]) found[parsed.unidadId] = true;
  }

  // En biométrico se prioriza el valor posterior a APTO/APT/APARTAMENTO.
  const aptRegex = /\b(?:APTO|APT|APARTAMENTO)\s*[:#._-]?\s*(\d{1,4})\b/gi;
  let match;
  while ((match = aptRegex.exec(text)) !== null) addCandidate(match[1]);

  if (Object.keys(found).length === 0) {
    const cleaned = text.replace(/\b(?:TORRE|T)\s*[1-8]\b/gi, ' ');
    const groups = cleaned.match(/\b\d{1,4}\b/g) || [];
    groups.forEach(function (digits) {
      if (opts.ignoreSingleDigit && digits.length === 1) return;
      addCandidate(digits);
    });
  }

  const candidates = Object.keys(found);
  return {
    ok: candidates.length === 1,
    ambiguous: candidates.length > 1,
    candidates: candidates,
    unitId: candidates.length === 1 ? candidates[0] : '',
    raw: text
  };
}

function dmImportarVehiculosMaestraSanciones_(ss, config, model) {
  const source = dmOpenConfiguredSourceSheet_(
    ss, config,
    'VEHICULOS_MAESTRA_SPREADSHEET_ID',
    'VEHICULOS_MAESTRA_SOURCE_SHEET',
    'la maestra de sanciones'
  );

  const rows = dmLeerFilas_(source.sheet);
  model.stats.filasMaestraVehiculosLeidas += rows.length;

  rows.forEach(function (record) {
    const plate = dmNormalizePlate_(dmGet_(record, ['Placa']));
    if (!plate) return;

    const apartmentRaw = dmGet_(record, ['Apartamento']);
    const unit = dmResolveUnitCandidate_(apartmentRaw, model);
    const sourceOriginal = dmSafeTrim_(dmGet_(record, ['Fuente']));
    const sourceOriginalNorm = dmNormalizeText_(sourceOriginal).toUpperCase();
    const group = sourceOriginalNorm.indexOf('VIGILANCIA') !== -1
      ? 'VIGILANCIA'
      : 'MAESTRA_SANCIONES';
    const state = dmNormalizeText_(dmGet_(record, ['Estado'])).toUpperCase();
    const isCurrent = state.indexOf('INACTIV') === -1 && state.indexOf('HISTOR') === -1;

    dmAddVehicleEvidence_(model, {
      Placa: plate,
      UnidadID: unit.ok ? unit.unitId : '',
      TipoVehiculo: dmGet_(record, ['TipoVehiculo', 'Tipo Vehiculo']),
      TipoVinculo: 'NO_DETERMINADO',
      Fuente: 'MAESTRA_SANCIONES',
      PrioridadFuente: dmVehicleSourcePriority_('MAESTRA_SANCIONES'),
      GrupoEvidencia: group,
      FuenteOriginal: sourceOriginal || 'MAESTRA',
      ApartamentoOriginal: apartmentRaw,
      CalidadRegistro: unit.ok ? 'VALIDO' : unit.reason,
      EsUtilizable: unit.ok ? 'SI' : 'NO',
      EsActualCandidato: isCurrent ? 'SI' : 'NO',
      FechaFuente: dmGetRaw_(record, ['FechaActualizacion', 'Fecha Actualizacion']),
      RegistroFuenteID: 'MAESTRA-' + record.rowNumber,
      FilaFuente: record.rowNumber,
      Observaciones: dmSafeTrim_(dmGet_(record, ['Notas']))
    });
  });
}

function dmImportarVehiculosVigilancia_(ss, config, model) {
  const source = dmOpenConfiguredSourceSheet_(
    ss, config,
    'VEHICULOS_VIGILANCIA_SPREADSHEET_ID',
    'VEHICULOS_VIGILANCIA_SOURCE_SHEET',
    'el registro de vigilancia'
  );

  const values = source.sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return;
  model.stats.filasVigilanciaLeidas += values.length - 1;

  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    for (let c = 0; c < row.length; c += 3) {
      const plateRaw = row[c];
      const apartmentRaw = row[c + 1];
      const plate = dmNormalizePlate_(plateRaw);
      if (!plate) continue;

      const resolved = dmUnitCandidatesFromFreeText_(apartmentRaw, model, { ignoreSingleDigit: true });
      const quality = resolved.ok
        ? 'VALIDO'
        : (resolved.ambiguous ? 'APARTAMENTO_AMBIGUO' : 'SIN_UNIDAD_VALIDA');

      dmAddVehicleEvidence_(model, {
        Placa: plate,
        UnidadID: resolved.ok ? resolved.unitId : '',
        TipoVehiculo: dmVehicleTypeByPlate_(plate),
        TipoVinculo: 'NO_DETERMINADO',
        Fuente: 'REGISTRO_VIGILANCIA',
        PrioridadFuente: dmVehicleSourcePriority_('REGISTRO_VIGILANCIA'),
        GrupoEvidencia: 'VIGILANCIA',
        FuenteOriginal: 'BASE_VIGILANCIA_HORIZONTAL',
        ApartamentoOriginal: apartmentRaw,
        CalidadRegistro: quality,
        EsUtilizable: resolved.ok ? 'SI' : 'NO',
        EsActualCandidato: 'SI',
        RegistroFuenteID: 'VIG-' + (r + 1) + '-' + (c + 1),
        FilaFuente: r + 1,
        Observaciones: resolved.ambiguous
          ? 'La celda contiene varias unidades posibles: ' + resolved.candidates.join(', ')
          : ''
      });

      if (resolved.ambiguous) {
        dmAddConflict_(model, {
          tipo: 'PLACA_VIGILANCIA_APARTAMENTO_AMBIGUO',
          severidad: 'MEDIA',
          entidadId: 'VEH-' + plate,
          campo: 'Apartamento',
          valorFuente1: apartmentRaw,
          valorFuente2: resolved.candidates.join(', '),
          fuente1: 'REGISTRO_VIGILANCIA',
          filaFuente: r + 1,
          recomendacion: 'Confirmar cuál apartamento autorizó la placa.'
        });
      }
    }
  }
}

function dmImportarVehiculosBiometrico_(ss, config, model) {
  const source = dmOpenConfiguredSourceSheet_(
    ss, config,
    'VEHICULOS_BIOMETRICO_SPREADSHEET_ID',
    'VEHICULOS_BIOMETRICO_SOURCE_SHEET',
    'el registro biométrico'
  );

  const raw = source.sheet.getDataRange().getValues();
  const display = source.sheet.getDataRange().getDisplayValues();
  if (!display.length) return;

  let headerRow = -1;
  let headers = [];
  for (let i = 0; i < Math.min(display.length, 60); i++) {
    const normalized = display[i].map(dmNormalizeHeader_);
    if (normalized.indexOf('license plate no') !== -1) {
      headerRow = i;
      headers = normalized;
      break;
    }
  }
  if (headerRow === -1) {
    throw new Error('No se encontró el encabezado "License plate No." en la pestaña biométrica.');
  }

  const idx = function (names) {
    for (let i = 0; i < names.length; i++) {
      const position = headers.indexOf(dmNormalizeHeader_(names[i]));
      if (position !== -1) return position;
    }
    return -1;
  };

  const plateCol = idx(['License plate No.', '*License plate No.']);
  const lastNameCol = idx(["Owner's Last Name"]);
  const firstNameCol = idx(["Owner's First Name"]);
  const startCol = idx(['Start Time of Effective Period']);
  const endCol = idx(['End Time of Effective Period']);
  const typeCol = idx(['Vehicle Type']);
  const ownerIdCol = idx(['Vehicle Owner ID']);
  const listCol = idx(['Vehicle List']);
  const validCol = idx(['Valida']);

  for (let r = headerRow + 1; r < display.length; r++) {
    const plate = plateCol >= 0 ? dmNormalizePlate_(display[r][plateCol]) : '';
    if (!plate) continue;
    model.stats.filasBiometricoLeidas += 1;

    const ownerText = [
      lastNameCol >= 0 ? display[r][lastNameCol] : '',
      firstNameCol >= 0 ? display[r][firstNameCol] : ''
    ].filter(Boolean).join(' ');
    const resolved = dmUnitCandidatesFromFreeText_(ownerText, model, { ignoreSingleDigit: true });
    const startValue = startCol >= 0 ? raw[r][startCol] : '';
    const endValue = endCol >= 0 ? raw[r][endCol] : '';
    const validRaw = validCol >= 0 ? display[r][validCol] : '';
    const validText = dmNormalizeText_(validRaw);
    const explicitInvalid = ['false', 'no', '0', 'invalido', 'inválido'].indexOf(validText) !== -1;
    const endDate = dmDateOrBlank_(endValue);
    const expired = !!(endDate && endDate.getTime() < model.now.getTime());
    const isCurrent = !explicitInvalid && !expired;

    dmAddVehicleEvidence_(model, {
      Placa: plate,
      UnidadID: resolved.ok ? resolved.unitId : '',
      TipoVehiculo: dmVehicleTypeFromBiometricCode_(typeCol >= 0 ? raw[r][typeCol] : '', plate),
      TipoVinculo: 'AUTORIZADO_CONTROL_ACCESO',
      Fuente: 'BIOMETRICO',
      PrioridadFuente: dmVehicleSourcePriority_('BIOMETRICO'),
      GrupoEvidencia: 'BIOMETRICO',
      FuenteOriginal: listCol >= 0 ? display[r][listCol] : 'CONTROL_ACCESO',
      ApartamentoOriginal: ownerText,
      CalidadRegistro: resolved.ok
        ? 'VALIDO'
        : (resolved.ambiguous ? 'APARTAMENTO_AMBIGUO' : 'SIN_UNIDAD_VALIDA'),
      EsUtilizable: resolved.ok ? 'SI' : 'NO',
      EsActualCandidato: isCurrent ? 'SI' : 'NO',
      FechaFuente: startValue,
      VigenteDesde: startValue,
      VigenteHasta: endValue,
      RegistroFuenteID: ownerIdCol >= 0 ? dmSafeTrim_(display[r][ownerIdCol]) : 'BIO-' + (r + 1),
      FilaFuente: r + 1,
      Observaciones: resolved.ambiguous
        ? 'El texto biométrico contiene varias unidades posibles: ' + resolved.candidates.join(', ')
        : (expired ? 'Registro biométrico vencido.' : '')
    });
  }
}

function dmEvidenceSort_(left, right) {
  const priorityDiff = Number(right.PrioridadFuente || 0) - Number(left.PrioridadFuente || 0);
  if (priorityDiff !== 0) return priorityDiff;
  const dateDiff = dmDateMillis_(right.FechaFuente) - dmDateMillis_(left.FechaFuente);
  if (dateDiff !== 0) return dateDiff;
  return dmCompare_(left.EvidenciaVehiculoID, right.EvidenciaVehiculoID);
}

function dmResolveVehicleLinkType_(supporters) {
  if (supporters.some(function (e) { return e.TipoVinculo === 'RESIDENTE'; })) return 'RESIDENTE';
  if (supporters.some(function (e) { return e.Fuente === 'BIOMETRICO'; })) return 'AUTORIZADO_CONTROL_ACCESO';
  return 'NO_DETERMINADO';
}

function dmVehicleConfidence_(winner, supporters) {
  const groups = {};
  supporters.forEach(function (e) { groups[e.GrupoEvidencia || e.Fuente] = true; });
  const independent = Object.keys(groups).length;
  if (winner.Fuente === 'BIOMETRICO' && independent >= 2) return 'MUY_ALTA';
  if (winner.Fuente === 'BIOMETRICO') return 'ALTA';
  if (independent >= 2) return 'ALTA';
  if (winner.Fuente === 'CENSO') return 'MEDIA_ALTA';
  if (winner.Fuente === 'MAESTRA_SANCIONES') return 'MEDIA';
  return 'BAJA';
}

function dmResolverVinculosVehiculo_(model) {
  model.vehicleLinks = {};
  const byVehicle = {};
  Object.keys(model.vehicleEvidence).forEach(function (key) {
    const evidence = model.vehicleEvidence[key];
    if (!byVehicle[evidence.VehiculoID]) byVehicle[evidence.VehiculoID] = [];
    byVehicle[evidence.VehiculoID].push(evidence);
  });

  Object.keys(byVehicle).forEach(function (vehicleId) {
    const all = byVehicle[vehicleId].sort(dmEvidenceSort_);
    const usable = all.filter(function (e) {
      return e.EsUtilizable === 'SI' && e.EsActualCandidato !== 'NO' &&
        e.UnidadID && !!model.units[e.UnidadID];
    });

    if (usable.length === 0) {
      dmAddConflict_(model, {
        tipo: 'PLACA_SIN_APARTAMENTO_VALIDO',
        severidad: 'ALTA',
        entidadId: vehicleId,
        campo: 'UnidadID',
        valorFuente1: all.map(function (e) {
          return e.Fuente + ': ' + (e.ApartamentoOriginal || 'SIN_DATO');
        }).join(' | '),
        fuente1: dmUnique_(all.map(function (e) { return e.Fuente; })).join('|'),
        recomendacion: 'Asignar manualmente la placa a un apartamento válido o corregir la fuente prioritaria.'
      });
      return;
    }

    const winner = usable[0];
    const byUnit = {};
    usable.forEach(function (e) {
      if (!byUnit[e.UnidadID]) byUnit[e.UnidadID] = [];
      byUnit[e.UnidadID].push(e);
    });
    Object.keys(byUnit).forEach(function (unitId) { byUnit[unitId].sort(dmEvidenceSort_); });

    const winnerSupporters = byUnit[winner.UnidadID];
    const differentUnits = Object.keys(byUnit).filter(function (unitId) { return unitId !== winner.UnidadID; });
    const sameTopPriorityDifferent = usable.some(function (e) {
      return e.UnidadID !== winner.UnidadID &&
        Number(e.PrioridadFuente || 0) === Number(winner.PrioridadFuente || 0);
    });

    let statusReview = 'RESUELTO_AUTOMATICO';
    if (differentUnits.length > 0) {
      statusReview = 'PENDIENTE_REVISION';
      dmAddConflict_(model, {
        tipo: sameTopPriorityDifferent
          ? 'PLACA_MISMA_PRIORIDAD_UNIDADES_DIFERENTES'
          : 'PLACA_FUENTES_DIFIEREN',
        severidad: sameTopPriorityDifferent ? 'ALTA' : 'MEDIA',
        unidadId: winner.UnidadID,
        entidadId: vehicleId,
        campo: 'UnidadID',
        valorFuente1: winner.Fuente + ': ' + winner.UnidadID,
        valorFuente2: differentUnits.map(function (unitId) {
          return byUnit[unitId][0].Fuente + ': ' + unitId;
        }).join(' | '),
        fuente1: winner.Fuente,
        fuente2: dmUnique_(differentUnits.map(function (unitId) { return byUnit[unitId][0].Fuente; })).join('|'),
        filaFuente: winner.FilaFuente,
        recomendacion: 'Se conserva provisionalmente la asociación de la fuente con mayor prioridad; revisar las evidencias antes de sancionar o cobrar.'
      });
    }

    const unavailableHigher = all.filter(function (e) {
      return e.EsUtilizable !== 'SI' && Number(e.PrioridadFuente || 0) > Number(winner.PrioridadFuente || 0);
    });
    if (unavailableHigher.length > 0) {
      statusReview = 'PENDIENTE_REVISION';
      dmAddConflict_(model, {
        tipo: 'PLACA_FUENTE_PRIORITARIA_SIN_UNIDAD_VALIDA',
        severidad: 'MEDIA',
        unidadId: winner.UnidadID,
        entidadId: vehicleId,
        campo: 'UnidadID',
        valorFuente1: unavailableHigher.map(function (e) {
          return e.Fuente + ': ' + (e.ApartamentoOriginal || 'SIN_DATO');
        }).join(' | '),
        valorFuente2: winner.Fuente + ': ' + winner.UnidadID,
        fuente1: dmUnique_(unavailableHigher.map(function (e) { return e.Fuente; })).join('|'),
        fuente2: winner.Fuente,
        recomendacion: 'La fuente prioritaria no contiene una unidad válida; se usó la siguiente fuente válida.'
      });
    }

    const sources = dmUnique_(winnerSupporters.map(function (e) { return e.Fuente; }));
    const currentId = dmId_('AVE', [vehicleId, winner.UnidadID, 'RESUELTO'].join('|'));
    model.vehicleLinks[currentId] = {
      AsignacionVehiculoID: currentId,
      VehiculoID: vehicleId,
      UnidadID: winner.UnidadID,
      PersonaID: '',
      EstadoAsignacion: 'ACTIVA',
      EsActual: 'SI',
      Fuente: winner.Fuente,
      RegistroFuenteID: winner.RegistroFuenteID,
      FilaFuente: winner.FilaFuente,
      FechaFuente: winner.FechaFuente,
      FechaActualizacion: model.now,
      TipoVinculo: dmResolveVehicleLinkType_(winnerSupporters),
      FuenteGanadora: winner.Fuente,
      FuentesRespaldo: sources.join('|'),
      Confianza: dmVehicleConfidence_(winner, winnerSupporters),
      EstadoRevision: statusReview,
      VigenteDesde: winner.VigenteDesde || winner.FechaFuente || '',
      VigenteHasta: winner.VigenteHasta || ''
    };

    differentUnits.forEach(function (unitId) {
      const losing = byUnit[unitId][0];
      const linkId = dmId_('AVE', [vehicleId, unitId, 'NO_SELECCIONADO'].join('|'));
      model.vehicleLinks[linkId] = {
        AsignacionVehiculoID: linkId,
        VehiculoID: vehicleId,
        UnidadID: unitId,
        PersonaID: '',
        EstadoAsignacion: 'NO_CONFIRMADA',
        EsActual: 'NO',
        Fuente: losing.Fuente,
        RegistroFuenteID: losing.RegistroFuenteID,
        FilaFuente: losing.FilaFuente,
        FechaFuente: losing.FechaFuente,
        FechaActualizacion: model.now,
        TipoVinculo: dmResolveVehicleLinkType_(byUnit[unitId]),
        FuenteGanadora: winner.Fuente,
        FuentesRespaldo: dmUnique_(byUnit[unitId].map(function (e) { return e.Fuente; })).join('|'),
        Confianza: 'NO_SELECCIONADA',
        EstadoRevision: 'CONFLICTO_FUENTE',
        VigenteDesde: losing.VigenteDesde || losing.FechaFuente || '',
        VigenteHasta: losing.VigenteHasta || ''
      };
    });
  });
}

function dmDiagnosticarFuentesVehiculos() {
  const ss = dmGetMasterSpreadsheet_();
  dmCrearEstructuraInterna_(ss);
  const config = dmGetConfigMap_(ss);
  const result = [];

  [
    ['BIOMETRICO', 'VEHICULOS_BIOMETRICO_SPREADSHEET_ID', 'VEHICULOS_BIOMETRICO_SOURCE_SHEET'],
    ['MAESTRA_SANCIONES', 'VEHICULOS_MAESTRA_SPREADSHEET_ID', 'VEHICULOS_MAESTRA_SOURCE_SHEET'],
    ['REGISTRO_VIGILANCIA', 'VEHICULOS_VIGILANCIA_SPREADSHEET_ID', 'VEHICULOS_VIGILANCIA_SOURCE_SHEET']
  ].forEach(function (item) {
    try {
      const source = dmOpenConfiguredSourceSheet_(ss, config, item[1], item[2], item[0]);
      result.push({
        fuente: item[0],
        ok: true,
        archivo: source.spreadsheet.getName(),
        hoja: source.sheet.getName(),
        filas: source.sheet.getLastRow(),
        columnas: source.sheet.getLastColumn()
      });
    } catch (error) {
      result.push({ fuente: item[0], ok: false, error: error.message || String(error) });
    }
  });

  console.log(JSON.stringify(result, null, 2));
  return result;
}

function dmDetectarConflictosGlobales_(model) {
  const currentVehicleUnits = {};
  Object.keys(model.vehicleLinks).forEach(function (key) {
    const link = model.vehicleLinks[key];
    if (link.EsActual !== 'SI') return;
    if (!currentVehicleUnits[link.VehiculoID]) currentVehicleUnits[link.VehiculoID] = {};
    currentVehicleUnits[link.VehiculoID][link.UnidadID] = true;
  });

  Object.keys(currentVehicleUnits).forEach(function (vehicleId) {
    const units = Object.keys(currentVehicleUnits[vehicleId]);
    if (units.length <= 1) return;

    dmAddConflict_(model, {
      tipo: 'PLACA_ASOCIADA_A_VARIAS_UNIDADES',
      severidad: 'ALTA',
      entidadId: vehicleId,
      campo: 'UnidadID',
      valorFuente1: units.join(', '),
      fuente1: 'CENSO',
      recomendacion: 'Confirmar la unidad actual del vehículo y cerrar asignaciones incorrectas.'
    });
  });

  const currentParkingUnits = {};
  Object.keys(model.parkingLinks).forEach(function (key) {
    const link = model.parkingLinks[key];
    if (link.EsActual !== 'SI') return;
    if (!currentParkingUnits[link.ParqueaderoID]) currentParkingUnits[link.ParqueaderoID] = {};
    currentParkingUnits[link.ParqueaderoID][link.UnidadID] = true;
  });

  Object.keys(currentParkingUnits).forEach(function (parkingId) {
    const units = Object.keys(currentParkingUnits[parkingId]);
    if (units.length <= 1) return;

    dmAddConflict_(model, {
      tipo: 'PARQUEADERO_ASOCIADO_A_VARIAS_UNIDADES',
      severidad: 'ALTA',
      entidadId: parkingId,
      campo: 'UnidadID',
      valorFuente1: units.join(', '),
      fuente1: 'INFO_APTOS/CENSO',
      recomendacion: 'Validar la asignación vigente del parqueadero.'
    });
  });
}

/***************************************
 * UPSERTS EN MEMORIA
 ***************************************/
function dmUpsertUnit_(model, unit) {
  const existing = model.units[unit.UnidadID];
  if (!existing) {
    model.units[unit.UnidadID] = unit;
    return;
  }

  if (existing.CodigoOficial && unit.CodigoOficial &&
      existing.CodigoOficial !== unit.CodigoOficial) {
    dmAddConflict_(model, {
      tipo: 'UNIDAD_CODIGO_OFICIAL_INCONSISTENTE',
      severidad: 'ALTA',
      unidadId: unit.UnidadID,
      entidadId: unit.UnidadID,
      campo: 'CodigoOficial',
      valorFuente1: existing.CodigoOficial,
      valorFuente2: unit.CodigoOficial,
      fuente1: existing.FuentePrincipal,
      fuente2: unit.FuentePrincipal,
      filaFuente: unit.FilaFuente,
      recomendacion: 'Conservar el código del catálogo oficial y corregir la fuente secundaria.'
    });
  }

  [
    'CodigoOficial', 'NumeroOrdenCatalogo', 'AreaPrivadaConstruidaM2',
    'CoeficienteCopropiedad', 'CoeficienteFraccion',
    'ValorPresupuesto2026', 'PaginaFuente'
  ].forEach(function (field) {
    if ((existing[field] === '' || existing[field] === null || existing[field] === undefined) &&
        unit[field] !== '' && unit[field] !== null && unit[field] !== undefined) {
      existing[field] = unit[field];
    }
  });

  if (unit.CodigoOriginal) existing.CodigoOriginal = unit.CodigoOriginal;
  if (unit.Proyecto) existing.Proyecto = unit.Proyecto;
  if (unit.EstadoUnidad && unit.FuentePrincipal === 'INFO_APTOS') {
    existing.EstadoUnidad = unit.EstadoUnidad;
  }
  if (unit.FechaEntregaApartamento) existing.FechaEntregaApartamento = unit.FechaEntregaApartamento;
  if (unit.EstadoEntregaApartamento && unit.EstadoEntregaApartamento !== 'SIN_DATO') {
    existing.EstadoEntregaApartamento = unit.EstadoEntregaApartamento;
  }

  existing.FuentePrincipal = dmMergeList_(
    existing.FuentePrincipal,
    unit.FuentePrincipal,
    '|'
  );
  existing.FechaActualizacion = unit.FechaActualizacion;
}

function dmBuildPerson_(data) {
  const name = dmNormalizeName_(data.name);
  const document = dmNormalizeDocument_(data.document);
  const emails = dmUnique_(data.emails || []);
  const phones = dmUnique_(data.phones || []);
  const identity = document
    ? 'DOC|' + document
    : (emails.length
      ? 'EMAIL|' + emails[0]
      : (phones.length
        ? 'TEL|' + phones[0]
        : 'NOMBRE|' + dmNormalizeText_(name) + '|' + data.unitIdForFallback));

  return {
    PersonaID: dmId_('PER', identity),
    TipoPersona: dmInferPersonNature_(name, document),
    TipoDocumento: dmSafeTrim_(data.documentType),
    NumeroDocumento: document,
    NombreCompleto: name,
    CorreoPrincipal: dmFirst_(emails),
    CorreosAlternos: emails.slice(1).join(', '),
    CelularPrincipal: dmFirst_(phones),
    TelefonosAlternos: phones.slice(1).join(', '),
    EstadoPersona: 'ACTIVA',
    Fuentes: data.source,
    FechaFuente: data.sourceDate || '',
    FechaActualizacion: data.now,
    _activeCensus: data.activeCensus === true,
    _sourcePriority: dmSourcePriority_(data.source),
    _sourceDateMs: dmDateMillis_(data.sourceDate),
    _unitId: data.unitIdForFallback || ''
  };
}

function dmUpsertPerson_(model, incoming) {
  const existing = model.persons[incoming.PersonaID];
  if (!existing) {
    model.persons[incoming.PersonaID] = incoming;
    return;
  }

  const existingPriority = existing._sourcePriority || dmSourcePriority_(existing.Fuentes);
  const incomingPriority = incoming._sourcePriority || dmSourcePriority_(incoming.Fuentes);
  const incomingIsNewer = (incoming._sourceDateMs || 0) >= (existing._sourceDateMs || 0);
  const incomingWins = incomingPriority > existingPriority ||
    (incomingPriority === existingPriority && incomingIsNewer);

  existing.Fuentes = dmMergeList_(existing.Fuentes, incoming.Fuentes, '|');
  existing.FechaActualizacion = incoming.FechaActualizacion;

  ['NombreCompleto', 'TipoDocumento', 'NumeroDocumento', 'TipoPersona'].forEach(function (field) {
    if (!existing[field] && incoming[field]) {
      existing[field] = incoming[field];
    } else if (incomingWins && incoming[field]) {
      existing[field] = incoming[field];
    }
  });

  const emails = dmUnique_(
    [existing.CorreoPrincipal]
      .concat(dmSplitList_(existing.CorreosAlternos))
      .concat([incoming.CorreoPrincipal])
      .concat(dmSplitList_(incoming.CorreosAlternos))
  );

  const phones = dmUnique_(
    [existing.CelularPrincipal]
      .concat(dmSplitList_(existing.TelefonosAlternos))
      .concat([incoming.CelularPrincipal])
      .concat(dmSplitList_(incoming.TelefonosAlternos))
  );

  if (incomingWins && incoming.CorreoPrincipal) {
    existing.CorreoPrincipal = incoming.CorreoPrincipal;
  } else {
    existing.CorreoPrincipal = existing.CorreoPrincipal || dmFirst_(emails);
  }
  existing.CorreosAlternos = emails
    .filter(function (value) { return value !== existing.CorreoPrincipal; })
    .join(', ');

  if (incomingWins && incoming.CelularPrincipal) {
    existing.CelularPrincipal = incoming.CelularPrincipal;
  } else {
    existing.CelularPrincipal = existing.CelularPrincipal || dmFirst_(phones);
  }
  existing.TelefonosAlternos = phones
    .filter(function (value) { return value !== existing.CelularPrincipal; })
    .join(', ');

  if (incoming.FechaFuente && (!existing.FechaFuente || incomingWins)) {
    existing.FechaFuente = incoming.FechaFuente;
  }

  existing._sourcePriority = Math.max(existingPriority, incomingPriority);
  existing._sourceDateMs = Math.max(existing._sourceDateMs || 0, incoming._sourceDateMs || 0);
  existing._unitId = existing._unitId || incoming._unitId || '';
}

function dmUpsertUnitLink_(model, row) {
  const existing = model.unitLinks[row.VinculoID];
  if (!existing) {
    model.unitLinks[row.VinculoID] = row;
    return;
  }

  const existingPriority = dmSourcePriority_(existing.Fuente);
  const incomingPriority = dmSourcePriority_(row.Fuente);
  const incomingIsNewer = dmDateMillis_(row.FechaInicio) >= dmDateMillis_(existing.FechaInicio);

  existing.Fuente = dmMergeList_(existing.Fuente, row.Fuente, '|');
  if (incomingPriority > existingPriority ||
      (incomingPriority === existingPriority && incomingIsNewer)) {
    ['Rol', 'EsContactoPrincipal', 'RecibeNotificaciones', 'EstadoVinculo',
      'FechaInicio', 'FechaFin', 'RegistroFuenteID', 'FilaFuente']
      .forEach(function (field) { existing[field] = row[field]; });
  }
  existing.FechaActualizacion = row.FechaActualizacion;
}

function dmUpsertVehicle_(model, row) {
  const existing = model.vehicles[row.VehiculoID];
  if (!existing) {
    model.vehicles[row.VehiculoID] = row;
    return;
  }

  existing.Fuentes = dmMergeList_(existing.Fuentes, row.Fuentes, '|');
  if (existing.TipoVehiculo === 'PENDIENTE_VALIDACION' && row.TipoVehiculo !== 'PENDIENTE_VALIDACION') {
    existing.TipoVehiculo = row.TipoVehiculo;
    existing.EstadoVehiculo = row.EstadoVehiculo;
  }
  existing.FechaActualizacion = row.FechaActualizacion;
}

function dmUpsertVehicleLink_(model, row) {
  const existing = model.vehicleLinks[row.AsignacionVehiculoID];
  if (!existing) {
    model.vehicleLinks[row.AsignacionVehiculoID] = row;
    return;
  }

  const incomingIsNewer = dmDateMillis_(row.FechaFuente) >= dmDateMillis_(existing.FechaFuente);
  existing.Fuente = dmMergeList_(existing.Fuente, row.Fuente, '|');
  existing.EstadoAsignacion = 'ACTIVA';
  existing.EsActual = 'SI';
  if (incomingIsNewer) {
    existing.PersonaID = row.PersonaID || existing.PersonaID;
    existing.RegistroFuenteID = row.RegistroFuenteID;
    existing.FilaFuente = row.FilaFuente;
    existing.FechaFuente = row.FechaFuente;
  }
  existing.FechaActualizacion = row.FechaActualizacion;
}

function dmUpsertParking_(model, row) {
  const existing = model.parkings[row.ParqueaderoID];
  if (!existing) {
    model.parkings[row.ParqueaderoID] = row;
    return;
  }

  if (existing.CodigoOficial && row.CodigoOficial &&
      existing.CodigoOficial !== row.CodigoOficial) {
    dmAddConflict_(model, {
      tipo: 'PARQUEADERO_CODIGO_OFICIAL_INCONSISTENTE',
      severidad: 'ALTA',
      entidadId: row.ParqueaderoID,
      campo: 'CodigoOficial',
      valorFuente1: existing.CodigoOficial,
      valorFuente2: row.CodigoOficial,
      fuente1: existing.Fuentes,
      fuente2: row.Fuentes,
      recomendacion: 'Conservar el código del catálogo oficial.'
    });
  }

  [
    'CodigoOficial', 'SubtipoParqueadero', 'Sector', 'PrefijoCodigo',
    'NumeroParqueadero', 'AreaPrivadaConstruidaM2',
    'CoeficienteCopropiedad', 'CoeficienteFraccion',
    'ValorPresupuesto2026', 'NumeroOrdenCatalogo', 'PaginaFuente'
  ].forEach(function (field) {
    if ((existing[field] === '' || existing[field] === null || existing[field] === undefined) &&
        row[field] !== '' && row[field] !== null && row[field] !== undefined) {
      existing[field] = row[field];
    }
  });

  if (row.CodigoLegacy) {
    existing.CodigoLegacy = dmMergeList_(existing.CodigoLegacy, row.CodigoLegacy, '|');
  }

  existing.Fuentes = dmMergeList_(existing.Fuentes, row.Fuentes, '|');
  if (!existing.FechaEntrega && row.FechaEntrega) existing.FechaEntrega = row.FechaEntrega;

  const priority = {
    'REGISTRADO_CATALOGO': 1,
    'REPORTADO_CENSO': 2,
    'REGISTRADO': 3,
    'SIN_ENTREGAR': 4,
    'ENTREGADO': 5
  };
  const currentPriority = priority[existing.EstadoParqueadero] || 0;
  const incomingPriority = priority[row.EstadoParqueadero] || 0;
  if (incomingPriority > currentPriority) {
    existing.EstadoParqueadero = row.EstadoParqueadero;
  }

  existing.FechaActualizacion = row.FechaActualizacion;
}

function dmUpsertParkingLink_(model, row) {
  const existing = model.parkingLinks[row.AsignacionParqueaderoID];
  if (!existing) {
    model.parkingLinks[row.AsignacionParqueaderoID] = row;
    return;
  }

  const existingPriority = dmSourcePriority_(existing.Fuente);
  const incomingPriority = dmSourcePriority_(row.Fuente);
  const incomingIsNewer = dmDateMillis_(row.FechaFuente) >= dmDateMillis_(existing.FechaFuente);
  existing.Fuente = dmMergeList_(existing.Fuente, row.Fuente, '|');

  if (incomingPriority > existingPriority ||
      (incomingPriority === existingPriority && incomingIsNewer)) {
    ['TipoTenencia', 'EstadoAsignacion', 'EsActual', 'RegistroFuenteID',
      'FilaFuente', 'FechaFuente'].forEach(function (field) {
      existing[field] = row[field];
    });
  }
  existing.FechaActualizacion = row.FechaActualizacion;
}

function dmUpsertPet_(model, row) {
  const existing = model.pets[row.MascotaID];
  if (!existing) {
    model.pets[row.MascotaID] = row;
    return;
  }

  const incomingIsNewer = dmDateMillis_(row.FechaFuente) >= dmDateMillis_(existing.FechaFuente);
  if (!existing.TipoMascota && row.TipoMascota) existing.TipoMascota = row.TipoMascota;
  if (!existing.Raza && row.Raza) existing.Raza = row.Raza;
  existing.Cantidad = Math.max(dmToInteger_(existing.Cantidad) || 1, dmToInteger_(row.Cantidad) || 1);
  existing.EstadoRegistro = 'ACTIVO';
  existing.EsActual = 'SI';
  existing.Fuente = dmMergeList_(existing.Fuente, row.Fuente, '|');

  if (incomingIsNewer) {
    if (row.TipoMascota) existing.TipoMascota = row.TipoMascota;
    if (row.Raza) existing.Raza = row.Raza;
    existing.RegistroFuenteID = row.RegistroFuenteID;
    existing.FilaFuente = row.FilaFuente;
    existing.FechaFuente = row.FechaFuente;
  }
  existing.FechaActualizacion = row.FechaActualizacion;
}

function dmAddConflict_(model, data) {
  const id = dmId_('CON', [
    data.tipo,
    data.unidadId || '',
    data.entidadId || '',
    data.campo || '',
    data.valorFuente1 || '',
    data.valorFuente2 || '',
    data.filaFuente || ''
  ].join('|'));

  model.conflicts[id] = {
    ConflictoID: id,
    FechaDeteccion: model.now,
    Tipo: data.tipo,
    Severidad: data.severidad || 'MEDIA',
    UnidadID: data.unidadId || '',
    EntidadID: data.entidadId || '',
    Campo: data.campo || '',
    ValorFuente1: data.valorFuente1 || '',
    ValorFuente2: data.valorFuente2 || '',
    Fuente1: data.fuente1 || '',
    Fuente2: data.fuente2 || '',
    FilaFuente: data.filaFuente || '',
    Estado: 'PENDIENTE',
    Recomendacion: data.recomendacion || 'Revisión manual.'
  };
}

function dmFinalizarModelo_(model) {
  model.stats.unidades = Object.keys(model.units).length;
  model.stats.personas = Object.keys(model.persons).length;
  model.stats.vinculosUnidad = Object.keys(model.unitLinks).length;
  model.stats.vehiculos = Object.keys(model.vehicles).length;
  model.stats.evidenciasVehiculo = Object.keys(model.vehicleEvidence).length;
  model.stats.vinculosVehiculo = Object.keys(model.vehicleLinks).length;
  model.stats.parqueaderos = Object.keys(model.parkings).length;
  model.stats.conflictos = Object.keys(model.conflicts).length;
}

/***************************************
 * ESCRITURA EN SHEETS
 ***************************************/
function dmEscribirModelo_(ss, model) {
  dmWriteObjects_(ss, DM_SHEETS.UNIDADES, DM_HEADERS.UNIDADES, dmObjectValues_(model.units, 'UnidadID'));
  dmWriteObjects_(ss, DM_SHEETS.PERSONAS, DM_HEADERS.PERSONAS, dmObjectValues_(model.persons, 'PersonaID', ['_activeCensus']));
  dmWriteObjects_(ss, DM_SHEETS.VINCULOS_UNIDAD, DM_HEADERS.VINCULOS_UNIDAD, dmObjectValues_(model.unitLinks, 'VinculoID'));
  dmWriteObjects_(ss, DM_SHEETS.VEHICULOS, DM_HEADERS.VEHICULOS, dmObjectValues_(model.vehicles, 'VehiculoID'));
  dmWriteObjects_(ss, DM_SHEETS.VINCULOS_VEHICULO, DM_HEADERS.VINCULOS_VEHICULO, dmObjectValues_(model.vehicleLinks, 'AsignacionVehiculoID'));
  dmWriteObjects_(ss, DM_SHEETS.EVIDENCIAS_VEHICULO, DM_HEADERS.EVIDENCIAS_VEHICULO, dmObjectValues_(model.vehicleEvidence, 'EvidenciaVehiculoID'));
  dmWriteObjects_(ss, DM_SHEETS.PARQUEADEROS, DM_HEADERS.PARQUEADEROS, dmObjectValues_(model.parkings, 'ParqueaderoID'));
  dmWriteObjects_(ss, DM_SHEETS.VINCULOS_PARQUEADERO, DM_HEADERS.VINCULOS_PARQUEADERO, dmObjectValues_(model.parkingLinks, 'AsignacionParqueaderoID'));
  dmWriteObjects_(ss, DM_SHEETS.MASCOTAS, DM_HEADERS.MASCOTAS, dmObjectValues_(model.pets, 'MascotaID'));
  dmWriteObjects_(ss, DM_SHEETS.CONTACTOS_EMERGENCIA, DM_HEADERS.CONTACTOS_EMERGENCIA, dmObjectValues_(model.emergencyContacts, 'ContactoEmergenciaID'));
  dmWriteObjects_(ss, DM_SHEETS.CENSO_HISTORIAL, DM_HEADERS.CENSO_HISTORIAL, model.censusHistory.sort(function (a, b) {
    return dmCompare_(a.CensoID, b.CensoID);
  }));
  dmWriteObjects_(ss, DM_SHEETS.CONFLICTOS, DM_HEADERS.CONFLICTOS, dmObjectValues_(model.conflicts, 'ConflictoID'));
}

function dmWriteObjects_(ss, sheetName, headers, objects) {
  const sheet = dmEnsureSheet_(ss, sheetName, headers);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  if (objects.length > 0) {
    const values = objects.map(function (obj) {
      return headers.map(function (header) {
        const value = obj[header];
        return value === undefined || value === null ? '' : value;
      });
    });
    sheet.getRange(2, 1, values.length, headers.length).setValues(values);
  }

  dmFormatSheet_(sheet, headers);
}

function dmObjectValues_(map, sortField, ignoredFields) {
  const ignored = ignoredFields || [];
  return Object.keys(map)
    .map(function (key) {
      const copy = {};
      Object.keys(map[key]).forEach(function (field) {
        if (ignored.indexOf(field) === -1) copy[field] = map[key][field];
      });
      return copy;
    })
    .sort(function (a, b) { return dmCompare_(a[sortField], b[sortField]); });
}

/***************************************
 * ESTRUCTURA Y CONFIGURACIÓN
 ***************************************/
function dmCrearEstructuraInterna_(ss) {
  PropertiesService.getScriptProperties().setProperty('DM_MASTER_SPREADSHEET_ID', ss.getId());
  dmEnsureConfig_(ss);
  dmMigrarConfigFuenteCoeficientes_(ss);
  dmEnsureSheet_(ss, DM_SHEETS.UNIDADES, DM_HEADERS.UNIDADES);
  dmEnsureSheet_(ss, DM_SHEETS.PERSONAS, DM_HEADERS.PERSONAS);
  dmEnsureSheet_(ss, DM_SHEETS.VINCULOS_UNIDAD, DM_HEADERS.VINCULOS_UNIDAD);
  dmEnsureSheet_(ss, DM_SHEETS.VEHICULOS, DM_HEADERS.VEHICULOS);
  dmEnsureSheet_(ss, DM_SHEETS.VINCULOS_VEHICULO, DM_HEADERS.VINCULOS_VEHICULO);
  dmEnsureSheet_(ss, DM_SHEETS.EVIDENCIAS_VEHICULO, DM_HEADERS.EVIDENCIAS_VEHICULO);
  dmEnsureSheet_(ss, DM_SHEETS.PARQUEADEROS, DM_HEADERS.PARQUEADEROS);
  dmEnsureSheet_(ss, DM_SHEETS.VINCULOS_PARQUEADERO, DM_HEADERS.VINCULOS_PARQUEADERO);
  dmEnsureSheet_(ss, DM_SHEETS.ESTADO_CUENTA, DM_HEADERS.ESTADO_CUENTA);
  dmEnsureEstadoCuentaSchema_(ss);
  dmEnsureSheet_(ss, DM_SHEETS.MASCOTAS, DM_HEADERS.MASCOTAS);
  dmEnsureSheet_(ss, DM_SHEETS.CONTACTOS_EMERGENCIA, DM_HEADERS.CONTACTOS_EMERGENCIA);
  dmEnsureSheet_(ss, DM_SHEETS.CENSO_HISTORIAL, DM_HEADERS.CENSO_HISTORIAL);
  dmEnsureSheet_(ss, DM_SHEETS.CONFLICTOS, DM_HEADERS.CONFLICTOS);
  dmEnsureSheet_(ss, DM_SHEETS.AUDITORIA, DM_HEADERS.AUDITORIA);
}

function dmConfigDefaults_() {
  return [
    ['SCHEMA_VERSION', DM_VERSION, 'Versión del modelo de datos.', 'NO'],
    ['CATALOGO_SPREADSHEET_ID', 'MISMO_ARCHIVO', 'ID o URL del Google Sheet que contiene coeficientes. Usa MISMO_ARCHIVO cuando está en Info aptos.', 'SI'],
    ['CATALOGO_SOURCE_SHEET', 'coeficientes', 'Nombre de la hoja fuente oficial. No es una tabla generada.', 'SI'],
    ['CATALOGO_REQUIRED', 'SI', 'Exige el catálogo antes de construir el maestro.', 'SI'],
    ['CATALOGO_TOTAL_INMUEBLES_ESPERADOS', 1485, 'Apartamentos, parqueaderos, locales y área libre.', 'SI'],
    ['CATALOGO_APARTAMENTOS_ESPERADOS', 880, 'Total oficial de apartamentos.', 'SI'],
    ['CATALOGO_PARQUEADEROS_ESPERADOS', 598, 'Total oficial de parqueaderos.', 'SI'],
    ['CATALOGO_AREA_TOTAL_ESPERADA', 56243.35, 'Área total del documento de coeficientes.', 'SI'],
    ['CATALOGO_COEFICIENTE_TOTAL_ESPERADO', 100, 'El coeficiente total oficial debe sumar 100.', 'SI'],
    ['CATALOGO_TOLERANCIA', 0.0001, 'Tolerancia para validaciones de sumas.', 'SI'],
    ['INFO_SOURCE_SHEET', 'Hoja 1', 'Hoja original de Info aptos. No debe ser una hoja maestra.', 'SI'],
    ['CENSO_SPREADSHEET_ID', '1mr0Qv7feB4QgidjMNncuC0ZmXj7k41NwdvgEHNyYju8', 'ID del Google Sheet del censo. Usa MISMO_ARCHIVO si copiaste la hoja al archivo Info aptos.', 'SI'],
    ['CENSO_SOURCE_SHEET', 'Respuestas de formulario 1', 'Nombre de la hoja de respuestas del censo.', 'SI'],
    ['VEHICULOS_MULTIFUENTE_ENABLED', 'SI', 'Integra biométrico, censo, maestra de sanciones y vigilancia.', 'SI'],
    ['VEHICULOS_BIOMETRICO_ENABLED', 'SI', 'Usa el registro biométrico como fuente prioritaria.', 'SI'],
    ['VEHICULOS_BIOMETRICO_SPREADSHEET_ID', '1NC_USOe879Q9CPaS9iE9KC6aIirQ7P2p', 'ID del registro biométrico convertido a Google Sheets. El XLSX original no puede abrirse con SpreadsheetApp.', 'SI'],
    ['VEHICULOS_BIOMETRICO_SOURCE_SHEET', 'Sheet', 'Pestaña que contiene el encabezado License plate No.', 'SI'],
    ['VEHICULOS_MAESTRA_ENABLED', 'SI', 'Usa la pestaña maestra del archivo de sanciones.', 'SI'],
    ['VEHICULOS_MAESTRA_SPREADSHEET_ID', '1GeJZ4Rd4-ddzE6Vi8kpq9iB2_oxuLW87UiAnbZQ6Iow', 'ID del archivo de sanciones.', 'SI'],
    ['VEHICULOS_MAESTRA_SOURCE_SHEET', 'maestra', 'Pestaña maestra de placas.', 'SI'],
    ['VEHICULOS_VIGILANCIA_ENABLED', 'SI', 'Usa la base de placas recopilada por vigilancia.', 'SI'],
    ['VEHICULOS_VIGILANCIA_SPREADSHEET_ID', '1_Lwp2jYRuYjJu_PiXGOibD5TjfPf9jQ_pBO9kio7AZY', 'ID de la base de datos de vehículos de vigilancia.', 'SI'],
    ['VEHICULOS_VIGILANCIA_SOURCE_SHEET', 'REGISTRO DE VEHICULOS', 'Pestaña horizontal de placa/apartamento.', 'SI'],
    ['VEHICULOS_SOURCE_PRIORITY', 'BIOMETRICO>CENSO>MAESTRA_SANCIONES>REGISTRO_VIGILANCIA', 'Orden de veracidad para resolver una placa asociada a unidades diferentes.', 'NO'],
    ['VEHICULOS_UNIDAD_SIN_IDENTIFICAR', '9999', 'Unidad técnica para placas pendientes de identificar. No representa un apartamento real.', 'NO'],
    ['UNIT_ID_FORMAT', '{APARTAMENTO_4_DIGITOS}-T{TORRE}', 'Formato de la llave maestra de unidad. Ejemplo: 0401-T1.', 'NO'],
    ['PARKING_ID_FORMAT', '{CODIGO_OFICIAL_5_DIGITOS}-PARQ', 'Formato de la llave maestra de parqueadero. Ejemplo: 99067-PARQ.', 'NO'],
    ['DATA_SIMILARITY_THRESHOLD', 0.82, 'Umbral para correlacionar nombres y datos similares entre Info aptos y censos.', 'SI'],
    ['ESTADO_CUENTA_DEFAULT', 'PENDIENTE_VALIDACION', 'Estado financiero inicial cuando se sincronice cartera.', 'SI'],
    ['ELEGIBLE_RESERVAS_DEFAULT', 'PENDIENTE_VALIDACION', 'No autorizar ni rechazar reservas hasta definir la regla financiera.', 'SI'],
    ['CARTERA_SPREADSHEET_ID', '1Sm_ncAyEdSX5Td45jejnZ5R2gyAiCaJmi9Zu72POPUo', 'ID o URL del Google Sheet de cartera.', 'SI'],
    ['CARTERA_SOURCE_SHEET', 'cartera', 'Pestaña con Codigo, Blq, Apto, Propietario, Sdo Anterior, Cargos y Saldo actual.', 'SI'],
    ['CARTERA_REGLA_MORA', 'SALDO_ANTERIOR', 'SALDO_ANTERIOR considera vencido solo lo que venía del periodo anterior. SALDO_ACTUAL usa el saldo total.', 'SI'],
    ['CARTERA_PORCENTAJE_MAX_MORA_RESERVAS', 0.5, 'Máximo saldo vencido permitido para reservar, expresado como proporción del ValorPresupuesto2026 de cada unidad.', 'SI'],
    ['CARTERA_TOLERANCIA_MORA', 0, 'Margen monetario adicional para comparaciones de mora y elegibilidad.', 'SI'],
    ['CARTERA_TRIGGER_HORA', 5, 'Hora local aproximada para la sincronización diaria. Apps Script ejecuta dentro de esa franja.', 'SI'],
    ['CARTERA_TRIGGER_ENABLED', 'SI', 'Control informativo del trigger diario de cartera.', 'SI'],
    ['LOG_PII', 'NO', 'Debe permanecer en NO para evitar datos personales en logs.', 'NO'],
    ['TIMEZONE', DM_TIMEZONE, 'Zona horaria operativa.', 'NO'],
    ['ULTIMA_ACTUALIZACION_ESTRUCTURA', new Date(), 'Actualización automática.', 'NO']
  ];
}


function dmMigrarConfigFuenteCoeficientes_(ss) {
  const sheet = ss.getSheetByName(DM_SHEETS.CONFIG);
  if (!sheet || sheet.getLastRow() < 2) return;

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
  const index = {};
  values.forEach(function (row, i) {
    const key = dmSafeTrim_(row[0]);
    if (key) index[key] = i + 2;
  });

  const sourceRow = index.CATALOGO_SOURCE_SHEET;
  if (sourceRow) {
    const current = dmSafeTrim_(sheet.getRange(sourceRow, 2).getValue());
    if (!current || current === 'Catalogo_Inmuebles') {
      sheet.getRange(sourceRow, 2).setValue('coeficientes');
      sheet.getRange(sourceRow, 3).setValue('Nombre de la hoja fuente oficial. No es una tabla generada.');
    }
  }

  const idRow = index.CATALOGO_SPREADSHEET_ID;
  if (idRow && !dmSafeTrim_(sheet.getRange(idRow, 2).getValue())) {
    sheet.getRange(idRow, 2).setValue('MISMO_ARCHIVO');
  }
}

function dmEnsureConfig_(ss) {
  let sheet = ss.getSheetByName(DM_SHEETS.CONFIG);
  if (!sheet) sheet = ss.insertSheet(DM_SHEETS.CONFIG);

  const validHeader = sheet.getLastRow() > 0 &&
    dmSafeTrim_(sheet.getRange(1, 1).getValue()) === 'Clave';

  if (!validHeader) {
    sheet.clear();
    sheet.getRange(1, 1, 1, DM_HEADERS.CONFIG.length).setValues([DM_HEADERS.CONFIG]);
  }

  const existing = {};
  if (sheet.getLastRow() >= 2) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues().forEach(function (row, index) {
      const key = dmSafeTrim_(row[0]);
      if (key) existing[key] = index + 2;
    });
  }

  const missing = [];
  dmConfigDefaults_().forEach(function (row) {
    const key = row[0];
    if (!existing[key]) {
      missing.push(row);
      return;
    }

    if (key === 'SCHEMA_VERSION') {
      sheet.getRange(existing[key], 2).setValue(DM_VERSION);
    }
    if (key === 'UNIT_ID_FORMAT') {
      sheet.getRange(existing[key], 2).setValue('{APARTAMENTO_4_DIGITOS}-T{TORRE}');
      sheet.getRange(existing[key], 3).setValue('Formato de la llave maestra de unidad. Ejemplo: 0401-T1.');
    }
    if (key === 'PARKING_ID_FORMAT') {
      sheet.getRange(existing[key], 2).setValue('{CODIGO_OFICIAL_5_DIGITOS}-PARQ');
      sheet.getRange(existing[key], 3).setValue('Formato de la llave maestra de parqueadero. Ejemplo: 99067-PARQ.');
    }
    if (key === 'ULTIMA_ACTUALIZACION_ESTRUCTURA') {
      sheet.getRange(existing[key], 2).setValue(new Date());
    }
  });

  if (missing.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, missing.length, 4).setValues(missing);
  }

  dmFormatSheet_(sheet, DM_HEADERS.CONFIG);
}

function dmEnsureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);

  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    dmFormatSheet_(sheet, headers);
  }

  return sheet;
}

function dmFormatSheet_(sheet, headers) {
  const lastCol = headers.length;
  const lastRow = Math.max(sheet.getLastRow(), 1);
  const headerRange = sheet.getRange(1, 1, 1, lastCol);

  headerRange
    .setFontWeight('bold')
    .setFontColor('#ffffff')
    .setBackground('#2f6f4e')
    .setWrap(true)
    .setVerticalAlignment('middle');

  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, lastRow, lastCol).setVerticalAlignment('top');

  try {
    const existingFilter = sheet.getFilter();
    if (existingFilter) existingFilter.remove();
    if (lastRow > 1) sheet.getRange(1, 1, lastRow, lastCol).createFilter();
  } catch (ignored) {}

  const dateHeaders = [
    'FechaEntregaApartamento', 'FechaActualizacion', 'FechaFuente',
    'FechaInicio', 'FechaFin', 'FechaEntrega', 'FechaCorte',
    'FechaRespuesta', 'FechaImportacion', 'FechaDeteccion', 'FechaHora'
  ];

  headers.forEach(function (header, index) {
    const col = index + 1;
    const width = dmColumnWidth_(header);
    sheet.setColumnWidth(col, width);

    if (dateHeaders.indexOf(header) !== -1 && lastRow > 1) {
      sheet.getRange(2, col, lastRow - 1, 1).setNumberFormat('yyyy-mm-dd hh:mm');
    }

    if ([
      'NumeroDocumento', 'CelularPrincipal', 'TelefonosAlternos', 'Placa',
      'Apartamento', 'NumeroParqueadero', 'CodigoOficial',
      'CodigoLegacy', 'PrefijoCodigo', 'InmuebleID'
    ].indexOf(header) !== -1 && lastRow > 1) {
      sheet.getRange(2, col, lastRow - 1, 1).setNumberFormat('@');
    }

    if (header === 'AreaPrivadaConstruidaM2' && lastRow > 1) {
      sheet.getRange(2, col, lastRow - 1, 1).setNumberFormat('0.00');
    }
    if (header === 'CoeficienteCopropiedad' && lastRow > 1) {
      sheet.getRange(2, col, lastRow - 1, 1).setNumberFormat('0.0000');
    }
    if (header === 'CoeficienteFraccion' && lastRow > 1) {
      sheet.getRange(2, col, lastRow - 1, 1).setNumberFormat('0.000000');
    }
    if (header === 'ValorPresupuesto2026' && lastRow > 1) {
      sheet.getRange(2, col, lastRow - 1, 1).setNumberFormat('$#,##0');
    }
    if ([
      'SaldoActual', 'SaldoAnterior', 'CargosPeriodo', 'SaldoVencido',
      'ValorPresupuestoUnidad', 'MaximoMoraElegible',
      'ExcesoMoraReservas'
    ].indexOf(header) !== -1 && lastRow > 1) {
      sheet.getRange(2, col, lastRow - 1, 1).setNumberFormat('$#,##0');
    }
    if (
      header === 'PorcentajeMaxMoraReservas' &&
      lastRow > 1
    ) {
      sheet.getRange(2, col, lastRow - 1, 1).setNumberFormat('0.00%');
    }
  });

  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, lastCol).setWrap(true);
  }
}

function dmColumnWidth_(header) {
  if (/ID$|UnidadID|PersonaID|VehiculoID|ParqueaderoID/.test(header)) return 150;
  if (/Nombre|Correo|Recomendacion|Motivo|Fuentes|ValorFuente/.test(header)) return 220;
  if (/Fecha/.test(header)) return 135;
  if (/Estado|Rol|Tipo/.test(header)) return 145;
  return 120;
}

function dmGetConfigMap_(ss) {
  const sheet = ss.getSheetByName(DM_SHEETS.CONFIG);
  if (!sheet || sheet.getLastRow() < 2) return {};

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
  const config = {};
  values.forEach(function (row) {
    const key = dmSafeTrim_(row[0]);
    if (key) config[key] = row[1];
  });
  return config;
}


function dmExtractSpreadsheetId_(value) {
  const raw = dmSafeTrim_(value);
  const match = raw.match(/[-\w]{25,}/);
  if (!match) {
    throw new Error('El valor configurado no parece un ID o URL válida de Google Sheets.');
  }
  return match[0];
}

function dmCensoConfigurado_(config) {
  const value = dmSafeTrim_(config.CENSO_SPREADSHEET_ID);
  return value !== '';
}

function dmObtenerFuenteCenso_(activeSs, config) {
  const id = dmSafeTrim_(config.CENSO_SPREADSHEET_ID);
  const sheetName = dmSafeTrim_(config.CENSO_SOURCE_SHEET) || 'Respuestas de formulario 1';

  if (!id) {
    throw new Error('Configura CENSO_SPREADSHEET_ID en la hoja Config. Usa MISMO_ARCHIVO si la hoja del censo está en este archivo.');
  }

  const sameFile = dmNormalizeText_(id) === 'mismo_archivo' || dmNormalizeText_(id) === 'mismo archivo';
  const spreadsheetId = sameFile ? activeSs.getId() : dmExtractSpreadsheetId_(id);
  const ss = sameFile ? activeSs : SpreadsheetApp.openById(spreadsheetId);

  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('No existe la hoja del censo: ' + sheetName);

  return {
    spreadsheetId: ss.getId(),
    sheet: sheet
  };
}

/***************************************
 * MIGRACIÓN DE IDENTIFICADORES 3.1
 ***************************************/
function dmMigrarIdsFormatoV310() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const ss = dmGetMasterSpreadsheet_();
    const targets = [
      DM_SHEETS.ESTADO_CUENTA,
      'Solicitudes_Actualizacion',
      'Datos_Aprobados_Portal',
      'Portal_Auditoria'
    ];
    const result = {};

    targets.forEach(function (sheetName) {
      const sheet = ss.getSheetByName(sheetName);
      if (!sheet || sheet.getLastRow() < 2) {
        result[sheetName] = 0;
        return;
      }

      const values = sheet.getDataRange().getValues();
      const headers = values[0].map(dmSafeTrim_);
      const unitIndex = headers.indexOf('UnidadID');
      const parkingIndex = headers.indexOf('ParqueaderoID');
      let changed = 0;

      for (let row = 1; row < values.length; row++) {
        if (unitIndex !== -1 && dmHasMeaningful_(values[row][unitIndex])) {
          const normalizedUnit = dmNormalizeUnitIdValue_(values[row][unitIndex]);
          if (normalizedUnit && normalizedUnit !== dmSafeTrim_(values[row][unitIndex]).toUpperCase()) {
            values[row][unitIndex] = normalizedUnit;
            changed++;
          }
        }
        if (parkingIndex !== -1 && dmHasMeaningful_(values[row][parkingIndex])) {
          const normalizedParking = dmNormalizeParkingIdValue_(values[row][parkingIndex]);
          if (normalizedParking && normalizedParking !== dmSafeTrim_(values[row][parkingIndex]).toUpperCase()) {
            values[row][parkingIndex] = normalizedParking;
            changed++;
          }
        }
      }

      if (changed) {
        sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
      }
      result[sheetName] = changed;
    });

    SpreadsheetApp.flush();
    return { ok: true, version: DM_VERSION, cambiosPorHoja: result };
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

/***************************************
 * API INTERNA DE CONSULTA
 *
 * Estas funciones NO son endpoints web. Pueden reutilizarse desde este
 * proyecto o desde una futura biblioteca de Apps Script.
 ***************************************/
function dmNormalizarUnidad(torre, apartamento) {
  const result = dmParseUnidad_(torre, apartamento);
  return result.ok ? result.unidadId : '';
}

function dmObtenerUnidad(unidadId) {
  const id = dmNormalizeUnitIdValue_(unidadId);
  if (!id) return null;

  const rows = dmReadMasterObjects_(DM_SHEETS.UNIDADES);
  return rows.find(function (row) { return dmSafeTrim_(row.UnidadID).toUpperCase() === id; }) || null;
}

function dmObtenerPersonasActivas(unidadId) {
  const id = dmNormalizeUnitIdValue_(unidadId);
  if (!id) return [];

  const people = {};
  dmReadMasterObjects_(DM_SHEETS.PERSONAS).forEach(function (person) {
    people[dmSafeTrim_(person.PersonaID)] = person;
  });

  return dmReadMasterObjects_(DM_SHEETS.VINCULOS_UNIDAD)
    .filter(function (link) {
      return dmSafeTrim_(link.UnidadID).toUpperCase() === id &&
        dmSafeTrim_(link.EstadoVinculo).toUpperCase() === 'ACTIVO';
    })
    .map(function (link) {
      const person = people[dmSafeTrim_(link.PersonaID)];
      if (!person) return null;
      return {
        unidadId: id,
        personaId: person.PersonaID,
        tipoPersona: person.TipoPersona,
        tipoDocumento: person.TipoDocumento,
        numeroDocumento: person.NumeroDocumento,
        nombreCompleto: person.NombreCompleto,
        rol: link.Rol,
        correoPrincipal: person.CorreoPrincipal,
        correosAlternos: person.CorreosAlternos,
        celularPrincipal: person.CelularPrincipal,
        recibeNotificaciones: link.RecibeNotificaciones,
        fuente: link.Fuente
      };
    })
    .filter(Boolean);
}

function dmObtenerCorreosNotificacion(unidadId) {
  let emails = [];

  dmObtenerPersonasActivas(unidadId).forEach(function (person) {
    if (dmSafeTrim_(person.recibeNotificaciones).toUpperCase() !== 'SI') return;
    emails = emails.concat(dmExtractEmails_(person.correoPrincipal));
    emails = emails.concat(dmExtractEmails_(person.correosAlternos));
  });

  return dmUnique_(emails);
}

function dmObtenerVehiculosActuales(unidadId) {
  const id = dmNormalizeUnitIdValue_(unidadId);
  if (!id) return [];

  const vehicles = {};
  dmReadMasterObjects_(DM_SHEETS.VEHICULOS).forEach(function (vehicle) {
    vehicles[dmSafeTrim_(vehicle.VehiculoID)] = vehicle;
  });

  return dmReadMasterObjects_(DM_SHEETS.VINCULOS_VEHICULO)
    .filter(function (link) {
      return dmSafeTrim_(link.UnidadID).toUpperCase() === id &&
        dmSafeTrim_(link.EsActual).toUpperCase() === 'SI';
    })
    .map(function (link) {
      const vehicle = vehicles[dmSafeTrim_(link.VehiculoID)];
      if (!vehicle) return null;
      return {
        unidadId: id,
        vehiculoId: vehicle.VehiculoID,
        placa: vehicle.Placa,
        tipoVehiculo: vehicle.TipoVehiculo,
        estadoVehiculo: vehicle.EstadoVehiculo,
        estadoAsignacion: link.EstadoAsignacion,
        fuente: link.Fuente,
        tipoVinculo: link.TipoVinculo || '',
        fuenteGanadora: link.FuenteGanadora || link.Fuente || '',
        fuentesRespaldo: link.FuentesRespaldo || '',
        confianza: link.Confianza || '',
        estadoRevision: link.EstadoRevision || '',
        vigenteDesde: link.VigenteDesde || '',
        vigenteHasta: link.VigenteHasta || ''
      };
    })
    .filter(Boolean);
}


function dmObtenerParqueadero(codigo) {
  const officialCode = dmNormalizeParkingCode_(codigo);
  const parkingId = officialCode ? officialCode + '-PARQ' : dmNormalizeParkingIdValue_(codigo);
  if (!parkingId) return null;

  return dmReadMasterObjects_(DM_SHEETS.PARQUEADEROS)
    .find(function (row) {
      return dmSafeTrim_(row.ParqueaderoID).toUpperCase() === parkingId ||
        dmSafeTrim_(row.CodigoOficial) === officialCode;
    }) || null;
}

function dmObtenerParqueaderosUnidad(unidadId) {
  const id = dmNormalizeUnitIdValue_(unidadId);
  if (!id) return [];

  const parkings = {};
  dmReadMasterObjects_(DM_SHEETS.PARQUEADEROS).forEach(function (parking) {
    parkings[dmSafeTrim_(parking.ParqueaderoID)] = parking;
  });

  return dmReadMasterObjects_(DM_SHEETS.VINCULOS_PARQUEADERO)
    .filter(function (link) {
      return dmSafeTrim_(link.UnidadID).toUpperCase() === id &&
        dmSafeTrim_(link.EsActual).toUpperCase() === 'SI';
    })
    .map(function (link) {
      const parking = parkings[dmSafeTrim_(link.ParqueaderoID)];
      if (!parking) return null;

      return {
        unidadId: id,
        parqueaderoId: parking.ParqueaderoID,
        codigoOficial: parking.CodigoOficial,
        codigoLegacy: parking.CodigoLegacy,
        subtipo: parking.SubtipoParqueadero,
        areaPrivadaConstruidaM2: parking.AreaPrivadaConstruidaM2,
        coeficienteCopropiedad: parking.CoeficienteCopropiedad,
        estadoParqueadero: parking.EstadoParqueadero,
        tipoTenencia: link.TipoTenencia,
        fuenteAsignacion: link.Fuente
      };
    })
    .filter(Boolean);
}

function dmObtenerEstadoCuenta(unidadId, periodo) {
  const id = dmNormalizeUnitIdValue_(unidadId);
  const requestedPeriod = dmSafeTrim_(periodo);
  if (!id) return null;

  const rows = dmReadMasterObjects_(DM_SHEETS.ESTADO_CUENTA)
    .filter(function (row) {
      if (dmSafeTrim_(row.UnidadID).toUpperCase() !== id) return false;
      return requestedPeriod ? dmSafeTrim_(row.Periodo) === requestedPeriod : true;
    });

  if (rows.length === 0) return null;

  rows.sort(function (a, b) {
    const dateA = dmDateOrBlank_(a.FechaCorte);
    const dateB = dmDateOrBlank_(b.FechaCorte);
    const timeA = dateA ? dateA.getTime() : 0;
    const timeB = dateB ? dateB.getTime() : 0;
    if (timeA !== timeB) return timeB - timeA;
    return dmCompare_(b.Periodo, a.Periodo);
  });

  return rows[0];
}

function dmValidarElegibilidadReserva(unidadId) {
  const unit = dmObtenerUnidad(unidadId);
  if (!unit) {
    return {
      ok: false,
      unidadId: dmSafeTrim_(unidadId),
      elegible: 'NO',
      estadoCuenta: 'UNIDAD_NO_ENCONTRADA',
      motivo: 'La unidad no existe en el maestro.'
    };
  }

  const state = dmObtenerEstadoCuenta(unit.UnidadID);
  if (!state) {
    return {
      ok: true,
      unidadId: unit.UnidadID,
      elegible: 'PENDIENTE_VALIDACION',
      estadoCuenta: 'SIN_REGISTRO',
      motivo: 'Aún no existe una sincronización de cartera para esta unidad.'
    };
  }

  const eligibility = dmSafeTrim_(state.ElegibleReservas).toUpperCase() || 'PENDIENTE_VALIDACION';
  return {
    ok: true,
    unidadId: unit.UnidadID,
    elegible: eligibility,
    estadoCuenta: state.EstadoCuenta,
    periodo: state.Periodo,
    fechaCorte: state.FechaCorte,
    motivo: state.MotivoRestriccion || '',
    saldoVencido: state.SaldoVencido,
    valorPresupuestoUnidad:
      state.ValorPresupuestoUnidad,
    porcentajeMaxMoraReservas:
      state.PorcentajeMaxMoraReservas,
    maximoMoraElegible:
      state.MaximoMoraElegible,
    excesoMoraReservas:
      state.ExcesoMoraReservas
  };
}

function dmGetMasterSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('DM_MASTER_SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);

  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) {
    throw new Error('No se pudo identificar el Google Sheet maestro. Ejecuta dmCrearEstructura() desde Info aptos.');
  }
  return active;
}

function dmReadMasterObjects_(sheetName) {
  const ss = dmGetMasterSpreadsheet_();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headers = values[0].map(function (header) { return dmSafeTrim_(header); });

  return values.slice(1).map(function (row) {
    const obj = {};
    headers.forEach(function (header, index) {
      if (header) obj[header] = row[index];
    });
    return obj;
  });
}

/***************************************
 * VALIDACIÓN DE INTEGRIDAD
 ***************************************/
function dmValidarIntegridadInterna_(ss) {
  const errores = [];
  const advertencias = [];
  const config = dmGetConfigMap_(ss);

  const unitIds = dmReadColumnSet_(ss, DM_SHEETS.UNIDADES, 'UnidadID');
  const personIds = dmReadColumnSet_(ss, DM_SHEETS.PERSONAS, 'PersonaID');
  const vehicleIds = dmReadColumnSet_(ss, DM_SHEETS.VEHICULOS, 'VehiculoID');
  const parkingIds = dmReadColumnSet_(ss, DM_SHEETS.PARQUEADEROS, 'ParqueaderoID');

  dmValidateForeignKeys_(ss, DM_SHEETS.VINCULOS_UNIDAD, [
    { field: 'UnidadID', set: unitIds },
    { field: 'PersonaID', set: personIds }
  ], errores);

  dmValidateForeignKeys_(ss, DM_SHEETS.VINCULOS_VEHICULO, [
    { field: 'UnidadID', set: unitIds },
    { field: 'VehiculoID', set: vehicleIds }
  ], errores);

  dmValidateForeignKeys_(ss, DM_SHEETS.VINCULOS_PARQUEADERO, [
    { field: 'UnidadID', set: unitIds },
    { field: 'ParqueaderoID', set: parkingIds }
  ], errores);

  const expectedUnits = dmToInteger_(config.CATALOGO_APARTAMENTOS_ESPERADOS);
  const expectedParkings = dmToInteger_(config.CATALOGO_PARQUEADEROS_ESPERADOS);

  if (expectedUnits !== null && unitIds.size !== expectedUnits) {
    errores.push(
      'Unidades: se esperaban ' + expectedUnits + ' apartamentos y existen ' + unitIds.size + '.'
    );
  }

  if (expectedParkings !== null && parkingIds.size !== expectedParkings) {
    errores.push(
      'Parqueaderos: se esperaban ' + expectedParkings + ' y existen ' + parkingIds.size + '.'
    );
  }

  const units = dmReadMasterObjects_(DM_SHEETS.UNIDADES);
  const parkings = dmReadMasterObjects_(DM_SHEETS.PARQUEADEROS);

  const unitsMissingArea = units.filter(function (row) {
    return dmToDecimal_(row.AreaPrivadaConstruidaM2) === null ||
      dmToDecimal_(row.CoeficienteCopropiedad) === null;
  }).length;

  const parkingsMissingArea = parkings.filter(function (row) {
    return dmToDecimal_(row.AreaPrivadaConstruidaM2) === null ||
      dmToDecimal_(row.CoeficienteCopropiedad) === null ||
      !dmNormalizeParkingCode_(row.CodigoOficial);
  }).length;

  if (unitsMissingArea > 0) {
    errores.push('Hay ' + unitsMissingArea + ' apartamentos sin área o coeficiente oficial.');
  }

  if (parkingsMissingArea > 0) {
    errores.push('Hay ' + parkingsMissingArea + ' parqueaderos sin código, área o coeficiente oficial.');
  }

  const expectedCatalog = dmToInteger_(config.CATALOGO_TOTAL_INMUEBLES_ESPERADOS);
  const expectedArea = dmToDecimal_(config.CATALOGO_AREA_TOTAL_ESPERADA);
  const expectedCoefficient = dmToDecimal_(config.CATALOGO_COEFICIENTE_TOTAL_ESPERADO);
  const tolerance = dmToDecimal_(config.CATALOGO_TOLERANCIA) || 0.0001;

  try {
    const source = dmObtenerFuenteCatalogo_(ss, config);
    const catalog = dmLeerCatalogoCanonico_(source.sheet);
    const summary = dmResumirCatalogo_(catalog.records);

    if (expectedCatalog !== null && summary.total !== expectedCatalog) {
      errores.push(
        'Coeficientes: se esperaban ' + expectedCatalog +
        ' registros válidos y existen ' + summary.total + '.'
      );
    }

    if (summary.invalidos > 0) {
      errores.push('La hoja coeficientes contiene ' + summary.invalidos + ' filas inválidas.');
    }

    if (summary.duplicados > 0) {
      errores.push('La hoja coeficientes contiene ' + summary.duplicados + ' identificadores duplicados.');
    }

    if (expectedArea !== null && Math.abs(summary.area - expectedArea) > tolerance) {
      errores.push(
        'El área total de coeficientes es ' + summary.area.toFixed(2) +
        ' y debería ser ' + expectedArea.toFixed(2) + '.'
      );
    }

    if (expectedCoefficient !== null &&
        Math.abs(summary.coeficiente - expectedCoefficient) > tolerance) {
      errores.push(
        'El coeficiente total de la fuente es ' + summary.coeficiente.toFixed(4) +
        ' y debería ser ' + expectedCoefficient.toFixed(4) + '.'
      );
    }
  } catch (error) {
    errores.push('No fue posible validar la hoja coeficientes: ' + (error.message || String(error)));
  }

  const conflictsSheet = ss.getSheetByName(DM_SHEETS.CONFLICTOS);
  if (conflictsSheet && conflictsSheet.getLastRow() > 1) {
    const pending = conflictsSheet.getRange(
      2, 1, conflictsSheet.getLastRow() - 1, conflictsSheet.getLastColumn()
    ).getDisplayValues();
    const headers = conflictsSheet.getRange(
      1, 1, 1, conflictsSheet.getLastColumn()
    ).getDisplayValues()[0];
    const idxState = headers.indexOf('Estado');
    const idxSeverity = headers.indexOf('Severidad');
    const highPending = pending.filter(function (row) {
      return row[idxState] === 'PENDIENTE' && row[idxSeverity] === 'ALTA';
    }).length;
    if (highPending > 0) {
      advertencias.push('Hay ' + highPending + ' conflictos de severidad ALTA pendientes.');
    }
  }

  if (unitIds.size === 0) errores.push('La hoja Unidades está vacía.');
  if (personIds.size === 0) advertencias.push('La hoja Personas está vacía.');

  return { errores: errores, advertencias: advertencias };
}

function dmValidateForeignKeys_(ss, sheetName, rules, errors) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return;

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getDisplayValues();

  rules.forEach(function (rule) {
    const idx = headers.indexOf(rule.field);
    if (idx === -1) {
      errors.push(sheetName + ': falta la columna ' + rule.field + '.');
      return;
    }

    data.forEach(function (row, index) {
      const value = dmSafeTrim_(row[idx]);
      if (value && !rule.set.has(value)) {
        errors.push(sheetName + ' fila ' + (index + 2) + ': ' + rule.field + ' no existe (' + value + ').');
      }
    });
  });
}

function dmReadColumnSet_(ss, sheetName, header) {
  const set = new Set();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return set;

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const idx = headers.indexOf(header);
  if (idx === -1) return set;

  sheet.getRange(2, idx + 1, sheet.getLastRow() - 1, 1).getDisplayValues().forEach(function (row) {
    const value = dmSafeTrim_(row[0]);
    if (value) set.add(value);
  });
  return set;
}


/***************************************
 * SINCRONIZACIÓN DIARIA DE CARTERA
 ***************************************/

/**
 * Sincroniza inmediatamente la cartera y devuelve un resumen.
 * Puede ejecutarse manualmente desde el editor de Apps Script.
 */
function dmSincronizarCarteraAhora() {
  return dmSincronizarCarteraActual_('MANUAL');
}

/**
 * Función utilizada por el trigger diario.
 */
function dmSincronizarCarteraDiaria() {
  return dmSincronizarCarteraActual_('TRIGGER_DIARIO');
}

/**
 * Instala un único trigger diario y ejecuta una sincronización inicial.
 *
 * La hora predeterminada es 5:00 a. m. y se configura con
 * CARTERA_TRIGGER_HORA. Los triggers de Apps Script pueden ejecutarse
 * en cualquier momento dentro de la franja horaria seleccionada.
 */
function dmInstalarTriggerCarteraDiario() {
  const ss = dmGetMasterSpreadsheet_();
  dmCrearEstructuraInterna_(ss);

  const config = dmGetConfigMap_(ss);
  const enabled = dmSafeTrim_(config.CARTERA_TRIGGER_ENABLED)
    .toUpperCase() !== 'NO';

  if (!enabled) {
    throw new Error(
      'CARTERA_TRIGGER_ENABLED está configurado en NO.'
    );
  }

  const configuredHour = Number(config.CARTERA_TRIGGER_HORA);
  const hour = isFinite(configuredHour)
    ? Math.max(0, Math.min(23, Math.floor(configuredHour)))
    : 5;

  dmEliminarTriggerCarteraDiario();

  const trigger = ScriptApp
    .newTrigger('dmSincronizarCarteraDiaria')
    .timeBased()
    .everyDays(1)
    .atHour(hour)
    .create();

  const sync = dmSincronizarCarteraActual_(
    'INSTALACION_TRIGGER'
  );

  return {
    ok: true,
    triggerId: trigger.getUniqueId(),
    handler: 'dmSincronizarCarteraDiaria',
    horaConfigurada: hour,
    zonaHoraria: DM_TIMEZONE,
    sincronizacionInicial: sync
  };
}

/**
 * Elimina todos los triggers creados para la sincronización diaria.
 */
function dmEliminarTriggerCarteraDiario() {
  let removed = 0;

  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (
      trigger.getHandlerFunction() ===
      'dmSincronizarCarteraDiaria'
    ) {
      ScriptApp.deleteTrigger(trigger);
      removed += 1;
    }
  });

  return {
    ok: true,
    eliminados: removed
  };
}

/**
 * Informa si el trigger diario está instalado.
 */
function dmEstadoTriggerCartera() {
  const triggers = ScriptApp.getProjectTriggers()
    .filter(function (trigger) {
      return (
        trigger.getHandlerFunction() ===
        'dmSincronizarCarteraDiaria'
      );
    })
    .map(function (trigger) {
      return {
        id: trigger.getUniqueId(),
        handler: trigger.getHandlerFunction(),
        fuenteEvento: String(trigger.getTriggerSource()),
        tipoEvento: String(trigger.getEventType())
      };
    });

  return {
    ok: true,
    instalado: triggers.length > 0,
    cantidad: triggers.length,
    triggers: triggers
  };
}

/**
 * Revisa la fuente sin modificar Estado_Cuenta.
 */
function dmDiagnosticarCarteraActual() {
  const ss = dmGetMasterSpreadsheet_();
  dmCrearEstructuraInterna_(ss);

  const config = dmGetConfigMap_(ss);
  const source = dmLeerFuenteCartera_(config);
  const units = dmCargarIdsUnidades_(ss);
  const resolved = dmResolverFilasCartera_(
    source,
    units,
    config
  );

  return dmResumenCartera_(source, resolved, config);
}

/**
 * Consulta una unidad directamente en la fuente de cartera.
 *
 * Ejemplo:
 * dmConsultarCarteraFuenteUnidad('1029-T4')
 */
function dmConsultarCarteraFuenteUnidad(unidadId) {
  const ss = dmGetMasterSpreadsheet_();
  dmCrearEstructuraInterna_(ss);

  const normalized = dmNormalizeUnitIdValue_(unidadId);
  if (!normalized) {
    throw new Error('Unidad inválida.');
  }

  const config = dmGetConfigMap_(ss);
  const source = dmLeerFuenteCartera_(config);
  const units = dmCargarIdsUnidades_(ss);
  const resolved = dmResolverFilasCartera_(
    source,
    units,
    config
  );

  const row = resolved.byUnit[normalized];

  return {
    ok: true,
    unidadId: normalized,
    encontrada: !!row,
    cartera: row || null,
    reglaMora: resolved.rule,
    toleranciaMora: resolved.tolerance,
    fechaConsulta: new Date()
  };
}

function dmSincronizarCarteraActual_(mode) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const ss = dmGetMasterSpreadsheet_();
    dmCrearEstructuraInterna_(ss);
    dmEnsureEstadoCuentaSchema_(ss);

    const config = dmGetConfigMap_(ss);
    const source = dmLeerFuenteCartera_(config);
    const units = dmCargarIdsUnidades_(ss);
    const resolved = dmResolverFilasCartera_(
      source,
      units,
      config
    );

    const period = dmSafeTrim_(
      config.CARTERA_PERIODO_OVERRIDE
    ) || Utilities.formatDate(
      new Date(),
      DM_TIMEZONE,
      'yyyy-MM'
    );

    const now = new Date();
    // Estado_Cuenta es una fotografía vigente, no una tabla histórica.
    // Cada UnidadID aparece exactamente una vez. La siguiente ejecución
    // reemplaza por completo la fotografía anterior.
    const currentRows = Object.keys(resolved.byUnit)
      .sort()
      .map(function (unitId) {
        const item = resolved.byUnit[unitId];

        return {
          UnidadID: item.unidadId,
          Periodo: period,
          SaldoActual: item.saldoActual,
          EstadoCuenta: item.estadoCuenta,
          FechaCorte: now,
          ElegibleReservas: item.elegibleReservas,
          MotivoRestriccion: item.motivoRestriccion,
          Fuente: 'CARTERA_DIARIA',
          FechaActualizacion: now,
          SaldoAnterior: item.saldoAnterior,
          CargosPeriodo: item.cargosPeriodo,
          SaldoVencido: item.saldoVencido,
          CodigoFuente: item.codigoFuente,
          PropietarioFuente: item.propietarioFuente,
          FilaFuente: item.filaFuente,
          ValorPresupuestoUnidad:
            item.valorPresupuestoUnidad,
          PorcentajeMaxMoraReservas:
            item.porcentajeMaxMoraReservas,
          MaximoMoraElegible:
            item.maximoMoraElegible,
          ExcesoMoraReservas:
            item.excesoMoraReservas
        };
      });

    dmWriteObjects_(
      ss,
      DM_SHEETS.ESTADO_CUENTA,
      DM_HEADERS.ESTADO_CUENTA,
      currentRows
    );

    const summary = dmResumenCartera_(
      source,
      resolved,
      config
    );

    dmRegistrarAuditoria_(ss, {
      accion: 'SINCRONIZAR_CARTERA',
      modo: mode || 'NO_DEFINIDO',
      resultado: 'OK',
      stats: {
        unidades: summary.unidadesSincronizadas,
        conflictos: (
          summary.filasOmitidas +
          summary.duplicados +
          summary.torresFuenteDiferentes
        )
      },
      mensaje: [
        'Periodo=' + period,
        'Sincronizadas=' + summary.unidadesSincronizadas,
        'EnMora=' + summary.unidadesEnMora,
        'EnMoraElegibles=' +
          summary.unidadesEnMoraElegibles,
        'NoElegibles=' +
          summary.unidadesNoElegiblesReservas,
        'Pendientes=' +
          summary.unidadesElegibilidadPendiente,
        'Omitidas=' + summary.filasOmitidas,
        'Regla=' + summary.reglaMora
      ].join(' | ')
    });

    return {
      ok: true,
      modo: mode || '',
      periodo: period,
      fechaCorte: now,
      registrosEstadoCuenta: currentRows.length,
      unRegistroPorApartamento: true,
      resumen: summary
    };
  } catch (error) {
    try {
      const ss = dmGetMasterSpreadsheet_();
      dmRegistrarAuditoria_(ss, {
        accion: 'SINCRONIZAR_CARTERA',
        modo: mode || 'NO_DEFINIDO',
        resultado: 'ERROR',
        mensaje: error && error.message
          ? error.message
          : String(error)
      });
    } catch (ignored) {}

    throw error;
  } finally {
    lock.releaseLock();
  }
}


/**
 * Consolida inmediatamente Estado_Cuenta para dejar una sola fila
 * por apartamento. Conserva el registro más reciente de cada UnidadID.
 *
 * Esta función sirve para limpiar datos creados por versiones anteriores.
 * Después de instalar esta versión, las sincronizaciones diarias ya
 * mantienen la unicidad automáticamente.
 */
function dmConsolidarEstadoCuentaUnRegistroPorApartamento() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const ss = dmGetMasterSpreadsheet_();
    dmCrearEstructuraInterna_(ss);
    dmEnsureEstadoCuentaSchema_(ss);

    const rows = dmReadMasterObjects_(
      DM_SHEETS.ESTADO_CUENTA
    );
    const byUnit = {};
    let invalidRows = 0;
    let replacedRows = 0;

    rows.forEach(function (row) {
      const unitId = dmNormalizeUnitIdValue_(
        row.UnidadID
      );

      if (!unitId || !/^\d{4}-T[1-8]$/.test(unitId)) {
        invalidRows += 1;
        return;
      }

      const candidate = Object.assign(
        {},
        row,
        { UnidadID: unitId }
      );
      const previous = byUnit[unitId];

      if (!previous) {
        byUnit[unitId] = candidate;
        return;
      }

      replacedRows += 1;

      if (
        dmEstadoCuentaRowTime_(candidate) >=
        dmEstadoCuentaRowTime_(previous)
      ) {
        byUnit[unitId] = candidate;
      }
    });

    const output = Object.keys(byUnit)
      .sort()
      .map(function (unitId) {
        return byUnit[unitId];
      });

    dmWriteObjects_(
      ss,
      DM_SHEETS.ESTADO_CUENTA,
      DM_HEADERS.ESTADO_CUENTA,
      output
    );

    const result = {
      ok: true,
      registrosAntes: rows.length,
      registrosDespues: output.length,
      duplicadosEliminados:
        Math.max(rows.length - invalidRows - output.length, 0),
      filasInvalidasOmitidas: invalidRows,
      filasReemplazadasPorMasRecientes: replacedRows,
      unRegistroPorApartamento: true
    };

    dmRegistrarAuditoria_(ss, {
      accion: 'CONSOLIDAR_ESTADO_CUENTA',
      modo: 'MIGRACION_UNICIDAD',
      resultado: 'OK',
      stats: {
        unidades: output.length,
        conflictos:
          result.duplicadosEliminados +
          result.filasInvalidasOmitidas
      },
      mensaje: [
        'Antes=' + result.registrosAntes,
        'Despues=' + result.registrosDespues,
        'Duplicados=' + result.duplicadosEliminados,
        'Invalidos=' + result.filasInvalidasOmitidas
      ].join(' | ')
    });

    return result;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Valida que Estado_Cuenta tenga exactamente una fila por UnidadID.
 */
function dmValidarEstadoCuentaUnico() {
  const rows = dmReadMasterObjects_(
    DM_SHEETS.ESTADO_CUENTA
  );
  const counts = {};
  const invalid = [];

  rows.forEach(function (row, index) {
    const unitId = dmNormalizeUnitIdValue_(
      row.UnidadID
    );

    if (!unitId || !/^\d{4}-T[1-8]$/.test(unitId)) {
      invalid.push({
        fila: index + 2,
        unidadId: dmSafeTrim_(row.UnidadID)
      });
      return;
    }

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
    ok: duplicates.length === 0 && invalid.length === 0,
    totalFilas: rows.length,
    apartamentosUnicos: Object.keys(counts).length,
    duplicados: duplicates,
    filasInvalidas: invalid,
    unRegistroPorApartamento:
      duplicates.length === 0
  };
}

function dmEstadoCuentaRowTime_(row) {
  const updated = dmDateOrBlank_(
    row.FechaActualizacion
  );
  if (updated) return updated.getTime();

  const cut = dmDateOrBlank_(row.FechaCorte);
  if (cut) return cut.getTime();

  const period = dmSafeTrim_(row.Periodo);
  const parsed = new Date(
    period.length === 7
      ? period + '-01T00:00:00'
      : period
  );

  return isNaN(parsed.getTime())
    ? 0
    : parsed.getTime();
}

function dmLeerFuenteCartera_(config) {
  const configuredId = dmSafeTrim_(
    config.CARTERA_SPREADSHEET_ID
  );

  if (!configuredId) {
    throw new Error(
      'Configura CARTERA_SPREADSHEET_ID en Config.'
    );
  }

  const spreadsheetId = dmExtractSpreadsheetId_(
    configuredId
  );
  const sheetName = dmSafeTrim_(
    config.CARTERA_SOURCE_SHEET
  ) || 'cartera';

  const sourceSs = SpreadsheetApp.openById(
    spreadsheetId
  );
  const sourceSheet = sourceSs.getSheetByName(
    sheetName
  );

  if (!sourceSheet) {
    throw new Error(
      'No existe la pestaña de cartera: ' +
      sheetName
    );
  }

  const values = sourceSheet.getDataRange().getValues();

  if (values.length < 2) {
    throw new Error(
      'La hoja de cartera no contiene registros.'
    );
  }

  const headers = values[0].map(dmNormalizeHeader_);
  const required = {
    codigo: ['codigo'],
    bloque: ['blq', 'bloque', 'torre'],
    apartamento: ['apto', 'apartamento'],
    propietario: ['propietario'],
    saldoAnterior: [
      'sdo anterior',
      'saldo anterior'
    ],
    cargos: ['cargos'],
    saldoActual: ['saldo actual']
  };

  const indexes = {};

  Object.keys(required).forEach(function (key) {
    indexes[key] = dmFindHeaderIndex_(
      headers,
      required[key]
    );

    if (indexes[key] === -1) {
      throw new Error(
        'Falta la columna de cartera: ' + key
      );
    }
  });

  return {
    spreadsheetId: spreadsheetId,
    spreadsheetName: sourceSs.getName(),
    sheetName: sheetName,
    rows: values.slice(1),
    indexes: indexes,
    totalRows: Math.max(values.length - 1, 0)
  };
}

function dmResolverFilasCartera_(
  source,
  unitMap,
  config
) {
  const configuredRule = dmSafeTrim_(
    config.CARTERA_REGLA_MORA
  ).toUpperCase();

  const rule = configuredRule === 'SALDO_ACTUAL'
    ? 'SALDO_ACTUAL'
    : 'SALDO_ANTERIOR';

  const configuredPercentage = Number(
    config.CARTERA_PORCENTAJE_MAX_MORA_RESERVAS
  );
  const maxArrearsPercentage = (
    isFinite(configuredPercentage) &&
    configuredPercentage >= 0
  )
    ? configuredPercentage
    : 0.5;

  const configuredTolerance = Number(
    config.CARTERA_TOLERANCIA_MORA
  );
  const tolerance = isFinite(configuredTolerance)
    ? Math.max(0, configuredTolerance)
    : 0;

  const byUnit = {};
  const skipped = [];
  const duplicates = [];
  const towerMismatches = [];

  source.rows.forEach(function (row, index) {
    const sourceRow = index + 2;
    const rawApartment =
      row[source.indexes.apartamento];
    const apartment =
      dmNormalizeCarteraApartment_(rawApartment);

    if (!apartment) {
      skipped.push({
        fila: sourceRow,
        codigo: dmSafeTrim_(
          row[source.indexes.codigo]
        ),
        apartamento: dmSafeTrim_(rawApartment),
        motivo: 'NO_ES_APARTAMENTO_DE_4_DIGITOS'
      });
      return;
    }

    const inferredTower =
      dmInferTowerFromApartment_(apartment);
    const unitId = dmFormatUnitId_(
      inferredTower,
      apartment
    );

    if (!unitId || !unitMap.has(unitId)) {
      skipped.push({
        fila: sourceRow,
        codigo: dmSafeTrim_(
          row[source.indexes.codigo]
        ),
        apartamento: apartment,
        unidadId: unitId,
        motivo: 'UNIDAD_NO_EXISTE_EN_MAESTRO'
      });
      return;
    }

    const unitInfo = unitMap.get(unitId) || {};
    const valorPresupuestoUnidad = Number(
      unitInfo.valorPresupuesto2026
    );

    const sourceTower = dmNormalizeCarteraTower_(
      row[source.indexes.bloque]
    );

    if (
      sourceTower &&
      sourceTower !== inferredTower
    ) {
      towerMismatches.push({
        fila: sourceRow,
        apartamento: apartment,
        torreFuente: sourceTower,
        torreInferida: inferredTower
      });
    }

    const saldoAnterior = dmCarteraNumber_(
      row[source.indexes.saldoAnterior]
    );
    const cargosPeriodo = dmCarteraNumber_(
      row[source.indexes.cargos]
    );
    const saldoActual = dmCarteraNumber_(
      row[source.indexes.saldoActual]
    );

    const baseMora = rule === 'SALDO_ACTUAL'
      ? saldoActual
      : saldoAnterior;

    const eligibility = dmEvaluarElegibilidadCartera_(
      baseMora,
      valorPresupuestoUnidad,
      maxArrearsPercentage,
      tolerance
    );

    let estadoCuenta = 'AL_DIA';

    if (eligibility.tieneMora) {
      estadoCuenta = 'EN_MORA';
    } else if (saldoActual < -tolerance) {
      estadoCuenta = 'SALDO_A_FAVOR';
    }

    const item = {
      unidadId: unitId,
      apartamento: apartment,
      torre: inferredTower,
      codigoFuente: dmSafeTrim_(
        row[source.indexes.codigo]
      ),
      propietarioFuente: dmSafeTrim_(
        row[source.indexes.propietario]
      ),
      saldoAnterior: saldoAnterior,
      cargosPeriodo: cargosPeriodo,
      saldoActual: saldoActual,
      saldoVencido: eligibility.saldoVencido,
      estadoCuenta: estadoCuenta,
      elegibleReservas: eligibility.elegibleReservas,
      motivoRestriccion:
        eligibility.motivoRestriccion,
      valorPresupuestoUnidad:
        eligibility.valorPresupuestoUnidad,
      porcentajeMaxMoraReservas:
        eligibility.porcentajeMaxMoraReservas,
      maximoMoraElegible:
        eligibility.maximoMoraElegible,
      excesoMoraReservas:
        eligibility.excesoMoraReservas,
      filaFuente: sourceRow
    };

    if (byUnit[unitId]) {
      duplicates.push({
        unidadId: unitId,
        filaConservada: item.filaFuente,
        filaAnterior: byUnit[unitId].filaFuente
      });
    }

    // Si existiera una duplicación, se conserva la última fila
    // para reflejar la fotografía más reciente de la hoja.
    byUnit[unitId] = item;
  });

  return {
    byUnit: byUnit,
    skipped: skipped,
    duplicates: duplicates,
    towerMismatches: towerMismatches,
    rule: rule,
    tolerance: tolerance,
    maxArrearsPercentage: maxArrearsPercentage
  };
}

/**
 * Determina por separado:
 * 1. Si existe mora.
 * 2. Si esa mora todavía permite realizar reservas.
 *
 * Una unidad puede estar EN_MORA y continuar elegible cuando su saldo
 * vencido no supera el porcentaje permitido de su presupuesto.
 */
function dmEvaluarElegibilidadCartera_(
  baseMora,
  valorPresupuestoUnidad,
  maxArrearsPercentage,
  tolerance
) {
  const safeMora = isFinite(Number(baseMora))
    ? Number(baseMora)
    : 0;
  const safeBudget = isFinite(
    Number(valorPresupuestoUnidad)
  )
    ? Math.max(0, Number(valorPresupuestoUnidad))
    : 0;
  const safePercentage = (
    isFinite(Number(maxArrearsPercentage)) &&
    Number(maxArrearsPercentage) >= 0
  )
    ? Number(maxArrearsPercentage)
    : 0.5;
  const safeTolerance = isFinite(Number(tolerance))
    ? Math.max(0, Number(tolerance))
    : 0;

  const tieneMora = safeMora > safeTolerance;
  const saldoVencido = tieneMora
    ? Math.max(safeMora, 0)
    : 0;

  if (!tieneMora) {
    return {
      tieneMora: false,
      saldoVencido: 0,
      valorPresupuestoUnidad: safeBudget || '',
      porcentajeMaxMoraReservas: safePercentage,
      maximoMoraElegible:
        safeBudget > 0
          ? safeBudget * safePercentage
          : '',
      excesoMoraReservas: 0,
      elegibleReservas: 'SI',
      motivoRestriccion: ''
    };
  }

  if (safeBudget <= 0) {
    return {
      tieneMora: true,
      saldoVencido: saldoVencido,
      valorPresupuestoUnidad: '',
      porcentajeMaxMoraReservas: safePercentage,
      maximoMoraElegible: '',
      excesoMoraReservas: '',
      elegibleReservas: 'PENDIENTE_VALIDACION',
      motivoRestriccion:
        'La unidad tiene saldo vencido, pero no tiene ' +
        'ValorPresupuesto2026 para calcular el máximo permitido.'
    };
  }

  const maximoMoraElegible =
    safeBudget * safePercentage;
  const elegible = (
    saldoVencido <=
    maximoMoraElegible + safeTolerance
  );
  const excesoMoraReservas = Math.max(
    saldoVencido - maximoMoraElegible,
    0
  );

  return {
    tieneMora: true,
    saldoVencido: saldoVencido,
    valorPresupuestoUnidad: safeBudget,
    porcentajeMaxMoraReservas: safePercentage,
    maximoMoraElegible: maximoMoraElegible,
    excesoMoraReservas: excesoMoraReservas,
    elegibleReservas: elegible ? 'SI' : 'NO',
    motivoRestriccion: elegible
      ? ''
      : (
          'Saldo vencido de ' +
          dmFormatCurrencyText_(saldoVencido) +
          ' supera el máximo permitido de ' +
          dmFormatCurrencyText_(maximoMoraElegible) +
          ' (' +
          dmFormatPercentText_(safePercentage) +
          ' del presupuesto de ' +
          dmFormatCurrencyText_(safeBudget) +
          ').'
        )
  };
}

/**
 * Prueba puntual de la regla solicitada:
 * presupuesto 241.248 -> máximo permitido 120.624.
 */
function dmProbarReglaElegibilidadCartera() {
  const presupuesto = 241248;
  const porcentaje = 0.5;

  const limite = dmEvaluarElegibilidadCartera_(
    120624,
    presupuesto,
    porcentaje,
    0
  );
  const superado = dmEvaluarElegibilidadCartera_(
    120625,
    presupuesto,
    porcentaje,
    0
  );

  return {
    ok: (
      limite.maximoMoraElegible === 120624 &&
      limite.elegibleReservas === 'SI' &&
      superado.elegibleReservas === 'NO'
    ),
    presupuesto: presupuesto,
    porcentaje: porcentaje,
    maximoPermitido:
      limite.maximoMoraElegible,
    casoEnElLimite: {
      mora: 120624,
      elegibleReservas:
        limite.elegibleReservas
    },
    casoUnPesoPorEncima: {
      mora: 120625,
      elegibleReservas:
        superado.elegibleReservas
    }
  };
}

function dmFormatCurrencyText_(value) {
  const number = isFinite(Number(value))
    ? Math.round(Number(value))
    : 0;

  return '$' + number.toLocaleString('es-CO');
}

function dmFormatPercentText_(value) {
  const number = isFinite(Number(value))
    ? Number(value) * 100
    : 0;

  return number.toLocaleString(
    'es-CO',
    { maximumFractionDigits: 2 }
  ) + '%';
}

function dmResumenCartera_(source, resolved, config) {
  const rows = Object.keys(resolved.byUnit)
    .map(function (unitId) {
      return resolved.byUnit[unitId];
    });

  const overdue = rows.filter(function (row) {
    return row.estadoCuenta === 'EN_MORA';
  });
  const upToDate = rows.filter(function (row) {
    return row.estadoCuenta !== 'EN_MORA';
  });
  const credits = rows.filter(function (row) {
    return row.saldoAnterior < 0;
  });
  const eligible = rows.filter(function (row) {
    return row.elegibleReservas === 'SI';
  });
  const notEligible = rows.filter(function (row) {
    return row.elegibleReservas === 'NO';
  });
  const pending = rows.filter(function (row) {
    return (
      row.elegibleReservas ===
      'PENDIENTE_VALIDACION'
    );
  });
  const overdueEligible = overdue.filter(function (row) {
    return row.elegibleReservas === 'SI';
  });

  return {
    fuente: source.spreadsheetName +
      ' / ' + source.sheetName,
    filasFuente: source.totalRows,
    unidadesSincronizadas: rows.length,
    unidadesEnMora: overdue.length,
    unidadesEnMoraElegibles:
      overdueEligible.length,
    unidadesAlDia: upToDate.length,
    unidadesElegiblesReservas: eligible.length,
    unidadesNoElegiblesReservas:
      notEligible.length,
    unidadesElegibilidadPendiente:
      pending.length,
    unidadesConSaldoAnteriorAFavor: credits.length,
    saldoVencidoTotal: overdue.reduce(
      function (sum, row) {
        return sum + row.saldoVencido;
      },
      0
    ),
    excesoMoraReservasTotal:
      notEligible.reduce(
        function (sum, row) {
          return sum + (
            Number(row.excesoMoraReservas) || 0
          );
        },
        0
      ),
    saldoAnteriorNeto: rows.reduce(
      function (sum, row) {
        return sum + row.saldoAnterior;
      },
      0
    ),
    cargosPeriodoTotal: rows.reduce(
      function (sum, row) {
        return sum + row.cargosPeriodo;
      },
      0
    ),
    saldoActualNeto: rows.reduce(
      function (sum, row) {
        return sum + row.saldoActual;
      },
      0
    ),
    filasOmitidas: resolved.skipped.length,
    duplicados: resolved.duplicates.length,
    torresFuenteDiferentes:
      resolved.towerMismatches.length,
    reglaMora: resolved.rule,
    porcentajeMaxMoraReservas:
      resolved.maxArrearsPercentage,
    toleranciaMora: resolved.tolerance,
    detalleOmitidos: resolved.skipped.slice(0, 20),
    detalleDuplicados:
      resolved.duplicates.slice(0, 20),
    detalleTorresDiferentes:
      resolved.towerMismatches.slice(0, 20)
  };
}

function dmCargarIdsUnidades_(ss) {
  const map = new Map();

  dmReadMasterObjects_(DM_SHEETS.UNIDADES)
    .forEach(function (unit) {
      const unitId = dmNormalizeUnitIdValue_(
        unit.UnidadID
      );

      if (
        unitId &&
        unitId !== DM_UNIDENTIFIED_UNIT_ID
      ) {
        map.set(unitId, {
          unidadId: unitId,
          valorPresupuesto2026:
            dmCarteraNumber_(
              unit.ValorPresupuesto2026
            )
        });
      }
    });

  return map;
}

function dmEnsureEstadoCuentaSchema_(ss) {
  const sheet = dmEnsureSheet_(
    ss,
    DM_SHEETS.ESTADO_CUENTA,
    DM_HEADERS.ESTADO_CUENTA
  );

  if (sheet.getMaxColumns() <
      DM_HEADERS.ESTADO_CUENTA.length) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      DM_HEADERS.ESTADO_CUENTA.length -
        sheet.getMaxColumns()
    );
  }

  const currentHeaders = sheet.getRange(
    1,
    1,
    1,
    Math.max(
      sheet.getLastColumn(),
      DM_HEADERS.ESTADO_CUENTA.length
    )
  ).getDisplayValues()[0];

  const normalizedExisting = {};
  currentHeaders.forEach(function (header, index) {
    const key = dmSafeTrim_(header);
    if (key) normalizedExisting[key] = index + 1;
  });

  const missing = DM_HEADERS.ESTADO_CUENTA
    .filter(function (header) {
      return !normalizedExisting[header];
    });

  if (missing.length > 0) {
    let nextColumn = Math.max(
      sheet.getLastColumn(),
      currentHeaders.filter(Boolean).length
    ) + 1;

    missing.forEach(function (header) {
      sheet.getRange(1, nextColumn).setValue(header);
      nextColumn += 1;
    });
  }

  // A partir de esta versión el orden oficial se normaliza.
  // dmWriteObjects_ conservará los datos existentes al sincronizar.
  dmFormatSheet_(
    sheet,
    DM_HEADERS.ESTADO_CUENTA
  );

  return sheet;
}

function dmFindHeaderIndex_(normalizedHeaders, aliases) {
  const normalizedAliases = aliases.map(function (alias) {
    return dmNormalizeHeader_(alias);
  });

  for (let i = 0; i < normalizedHeaders.length; i += 1) {
    if (
      normalizedAliases.indexOf(
        normalizedHeaders[i]
      ) !== -1
    ) {
      return i;
    }
  }

  return -1;
}

function dmNormalizeCarteraApartment_(value) {
  const text = dmSafeTrim_(value);

  // En esta fuente solo los códigos compuestos exactamente por cuatro
  // dígitos representan apartamentos. Esto evita interpretar P1738,
  // L1191, CONS1 o códigos de parqueadero como unidades residenciales.
  if (!/^\d{4}$/.test(text)) return '';

  const ending = Number(text.slice(-2));
  if (ending < 1 || ending > 64) return '';

  return text;
}

function dmNormalizeCarteraTower_(value) {
  const digits = dmSafeTrim_(value)
    .replace(/\D/g, '');

  if (!digits) return '';

  const number = Number(digits);
  if (number < 1 || number > 8) return '';

  return 'T' + number;
}

function dmCarteraNumber_(value) {
  if (
    typeof value === 'number' &&
    isFinite(value)
  ) {
    return value;
  }

  const text = dmSafeTrim_(value);
  if (!text) return 0;

  const negativeByParentheses =
    /^\(.*\)$/.test(text);

  const normalized = text
    .replace(/[()$]/g, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.')
    .replace(/[^0-9.-]/g, '');

  const parsed = Number(normalized);

  if (!isFinite(parsed)) return 0;

  return negativeByParentheses
    ? -Math.abs(parsed)
    : parsed;
}


/***************************************
 * AUDITORÍA
 ***************************************/
function dmRegistrarAuditoria_(ss, data) {
  const sheet = dmEnsureSheet_(ss, DM_SHEETS.AUDITORIA, DM_HEADERS.AUDITORIA);
  const stats = data.stats || {};
  const now = new Date();
  const id = dmId_('AUD', [now.getTime(), data.accion, data.modo, Utilities.getUuid()].join('|'));
  const user = Session.getEffectiveUser().getEmail() || 'USUARIO_NO_DISPONIBLE';

  sheet.appendRow([
    id,
    now,
    DM_VERSION,
    data.accion || '',
    data.modo || '',
    data.resultado || '',
    stats.unidades || 0,
    stats.personas || 0,
    stats.vinculosUnidad || 0,
    stats.vehiculos || 0,
    stats.parqueaderos || 0,
    stats.conflictos || 0,
    data.mensaje || '',
    user
  ]);

  dmFormatSheet_(sheet, DM_HEADERS.AUDITORIA);
}

function dmResumenTexto_(stats, includedCensus) {
  return [
    'Catálogo leído: ' + stats.filasCatalogoLeidas,
    'Inmuebles oficiales: ' + stats.catalogoInmuebles,
    'Apartamentos del inventario: ' + stats.apartamentosInventario,
    'Parqueaderos del inventario: ' + stats.parqueaderosInventario,
    'Otros inmuebles privados: ' + stats.otrosInmueblesCatalogo,
    'Área total catálogo: ' + Number(stats.areaTotalCatalogo || 0).toFixed(2) + ' m²',
    'Coeficiente total catálogo: ' + Number(stats.coeficienteTotalCatalogo || 0).toFixed(4),
    '',
    'Info aptos leídos: ' + stats.filasInfoLeidas,
    includedCensus ? 'Censo leído: ' + stats.filasCensoLeidas : 'Censo: no incluido',
    'Unidades maestras: ' + stats.unidades,
    'Personas: ' + stats.personas,
    'Vínculos de unidad: ' + stats.vinculosUnidad,
    'Vehículos: ' + stats.vehiculos,
    'Evidencias de vehículos: ' + (stats.evidenciasVehiculo || 0),
    'Vínculos de vehículos: ' + (stats.vinculosVehiculo || 0),
    'Filas biométrico: ' + (stats.filasBiometricoLeidas || 0),
    'Filas maestra sanciones: ' + (stats.filasMaestraVehiculosLeidas || 0),
    'Filas vigilancia: ' + (stats.filasVigilanciaLeidas || 0),
    'Fuentes de vehículos omitidas: ' + (stats.fuentesVehiculoOmitidas || 0),
    'Parqueaderos maestros: ' + stats.parqueaderos,
    'Conflictos para revisión: ' + stats.conflictos,
    includedCensus ? 'Respuestas válidas: ' + stats.respuestasCensoValidas : '',
    includedCensus ? 'Respuestas inválidas: ' + stats.respuestasCensoInvalidas : '',
    includedCensus ? 'Unidades con censo válido: ' + stats.unidadesConCenso : '',
    includedCensus ? 'Unidades sin censo: ' + stats.unidadesSinCenso : '',
    includedCensus ? 'Unidades con múltiples respuestas: ' + stats.unidadesConMultiplesRespuestas : '',
    includedCensus ? 'Respuestas históricas adicionales: ' + stats.respuestasCensoDuplicadas : ''
  ].filter(function (value) { return value !== ''; }).join('\n');
}

/***************************************
 * LECTURA FLEXIBLE DE HOJAS
 ***************************************/
function dmLeerFilas_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) return [];

  const raw = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  const display = sheet.getRange(1, 1, lastRow, lastColumn).getDisplayValues();
  const headers = display[0].map(dmNormalizeHeader_);

  return raw.slice(1).map(function (row, index) {
    return {
      rowNumber: index + 2,
      headers: headers,
      raw: row,
      display: display[index + 1]
    };
  });
}

function dmGet_(record, possibleHeaders) {
  for (let i = 0; i < possibleHeaders.length; i++) {
    const target = dmNormalizeHeader_(possibleHeaders[i]);
    const idx = record.headers.indexOf(target);
    if (idx !== -1 && dmHasMeaningful_(record.display[idx])) return record.display[idx];
  }
  return '';
}

function dmGetRaw_(record, possibleHeaders) {
  for (let i = 0; i < possibleHeaders.length; i++) {
    const target = dmNormalizeHeader_(possibleHeaders[i]);
    const idx = record.headers.indexOf(target);
    if (idx !== -1 && record.raw[idx] !== '' && record.raw[idx] !== null && record.raw[idx] !== undefined) {
      return record.raw[idx];
    }
  }
  return '';
}

function dmFilaVacia_(row) {
  return !row.some(function (value) { return dmHasMeaningful_(value); });
}

/***************************************
 * NORMALIZACIÓN DE UNIDADES Y ENTIDADES
 ***************************************/
function dmParseUnidad_(towerOrProject, apartmentRaw) {
  const projectText = dmSafeTrim_(towerOrProject).toUpperCase();
  const aptText = dmSafeTrim_(apartmentRaw).toUpperCase();

  if (/^(?:PARQ(?:-|_|\s)|\d{5}-PARQ)/i.test(aptText)) {
    return { ok: false, torre: '', apartamento: '', unidadId: '' };
  }

  let explicitTower = '';
  let apartment = '';

  // Formato nuevo: 0401-T1.
  let match = aptText.match(/(?:^|\b)(\d{1,4})\s*[-_ ]\s*T\s*(\d+)(?:\b|$)/i);
  if (match) {
    apartment = dmNormalizeApartmentCode_(match[1]);
    explicitTower = 'T' + Number(match[2]);
  }

  // Compatibilidad con formato anterior: T1-401.
  if (!apartment) {
    match = aptText.match(/(?:^|\b)T\s*(\d+)\s*[-_ ]\s*(\d{1,4})(?:\b|$)/i);
    if (match) {
      explicitTower = 'T' + Number(match[1]);
      apartment = dmNormalizeApartmentCode_(match[2]);
    }
  }

  // Compatibilidad con códigos tipo APT-1-401.
  if (!apartment) {
    match = aptText.match(/APT\s*[-_ ]?\s*(\d+)\s*[-_ ]\s*(\d{1,4})/i);
    if (match) {
      explicitTower = 'T' + Number(match[1]);
      apartment = dmNormalizeApartmentCode_(match[2]);
    }
  }

  if (!explicitTower) {
    const towerMatch = projectText.match(/(?:TORRE|T)\s*[-_ ]?\s*(\d+)/i);
    if (towerMatch) explicitTower = 'T' + Number(towerMatch[1]);
  }

  if (!apartment) {
    const apartmentMatch = aptText.match(/\d{1,4}/);
    if (apartmentMatch) apartment = dmNormalizeApartmentCode_(apartmentMatch[0]);
  }

  if (!apartment) {
    return { ok: false, torre: explicitTower, apartamento: '', unidadId: '' };
  }

  const inferredTower = dmInferTowerFromApartment_(apartment);
  const tower = inferredTower || explicitTower;

  if (!tower || !/^T[1-8]$/.test(tower)) {
    return { ok: false, torre: tower, apartamento: apartment, unidadId: '' };
  }

  return {
    ok: true,
    torre: tower,
    apartamento: apartment,
    unidadId: dmFormatUnitId_(tower, apartment),
    torreDeclarada: explicitTower,
    torreInferida: inferredTower,
    towerMismatch: !!(explicitTower && inferredTower && explicitTower !== inferredTower)
  };
}

function dmNormalizeApartmentCode_(value) {
  const digits = dmSafeTrim_(value).replace(/\D/g, '');
  if (!digits || digits.length > 4) return '';
  return digits.padStart(4, '0');
}

function dmInferTowerFromApartment_(apartment) {
  const code = dmNormalizeApartmentCode_(apartment);
  if (!code) return '';
  const ending = Number(code.slice(-2));
  if (ending < 1 || ending > 64) return '';
  return 'T' + Math.ceil(ending / 8);
}

function dmFormatUnitId_(tower, apartment) {
  const t = dmSafeTrim_(tower).toUpperCase().replace(/^TORRE\s*/, 'T');
  const apt = dmNormalizeApartmentCode_(apartment);
  return /^T[1-8]$/.test(t) && apt ? apt + '-' + t : '';
}

function dmNormalizeUnitIdValue_(value) {
  const text = dmSafeTrim_(value).toUpperCase();
  if (!text) return '';
  if (text === DM_UNIDENTIFIED_UNIT_ID) return DM_UNIDENTIFIED_UNIT_ID;
  const parsed = dmParseUnidad_('', text);
  return parsed.ok ? parsed.unidadId : '';
}

function dmNormalizeParkingIdValue_(value) {
  const code = dmNormalizeParkingCode_(value);
  return code ? code + '-PARQ' : '';
}

/**
 * Devuelve la identidad numérica de un parqueadero ignorando prefijos,
 * separadores y ceros a la izquierda.
 *
 * Ejemplos equivalentes:
 * 1557, 01557, P1557, PQ01557, A-01557, PARQ-A-01557, 01557-PARQ
 * -> clave numérica "1557".
 */
function dmParkingNumericKey_(value) {
  const raw = dmSafeTrim_(value).toUpperCase();
  if (!raw) return '';

  // Se prioriza una secuencia explícita de hasta cinco dígitos. Esto evita
  // mezclar números de otros segmentos cuando existe un código bien formado.
  const groups = raw.match(/\d{1,5}/g) || [];
  let digits = '';

  if (groups.length === 1) {
    digits = groups[0];
  } else if (groups.length > 1) {
    // Para formatos legacy como PARQ-99-01557 se toma el último segmento,
    // que corresponde al código individual del parqueadero.
    digits = groups[groups.length - 1];
  } else {
    digits = raw.replace(/\D/g, '');
  }

  if (!digits || digits.length > 5) return '';

  const numeric = Number(digits);
  if (!Number.isFinite(numeric) || numeric <= 0) return '';

  return String(numeric);
}

function dmNormalizeParkingCode_(value) {
  const numericKey = dmParkingNumericKey_(value);
  return numericKey ? numericKey.padStart(5, '0') : '';
}

function dmSameParking_(left, right) {
  const leftKey = dmParkingNumericKey_(left);
  const rightKey = dmParkingNumericKey_(right);
  return !!leftKey && leftKey === rightKey;
}

function dmParseParqueadero_(parkingRaw, projectOrTower) {
  const raw = dmSafeTrim_(parkingRaw).toUpperCase();
  if (!raw || dmNormalizeText_(raw) === 'sin parqueadero') return { ok: false };

  const numericKey = dmParkingNumericKey_(raw);
  const officialCode = numericKey ? numericKey.padStart(5, '0') : '';

  if (!officialCode) {
    return {
      ok: false,
      raw: raw,
      numericKey: ''
    };
  }

  return {
    ok: true,
    parqueaderoId: officialCode + '-PARQ',
    codigoOficial: officialCode,
    codigoLegacy: raw,
    prefijoCodigo: officialCode.substring(0, 2),
    numero: officialCode.substring(2),
    numericKey: numericKey
  };
}

function dmFindParkingCandidatesByNumericKey_(model, numericKey) {
  if (!model || !model.parkings || !numericKey) return [];

  return Object.keys(model.parkings)
    .map(function (id) { return model.parkings[id]; })
    .filter(function (parking) {
      return dmParkingNumericKey_(parking.CodigoOficial || parking.ParqueaderoID) === numericKey;
    });
}

function dmResolverParqueaderoEnModelo_(parkingRaw, model) {
  const parsed = dmParseParqueadero_(parkingRaw, '');
  if (!parsed.ok) return parsed;

  if (!model.catalogoCargado) {
    parsed.existsInCatalog = false;
    return parsed;
  }

  // La correlación se hace por identidad numérica, no por igualdad textual.
  // El código oficial del catálogo siempre prevalece sobre lo digitado en el censo.
  const candidates = dmFindParkingCandidatesByNumericKey_(model, parsed.numericKey);

  if (candidates.length === 1) {
    const parking = candidates[0];
    const officialCode = dmNormalizeParkingCode_(parking.CodigoOficial || parking.ParqueaderoID);

    return {
      ok: true,
      parqueaderoId: dmSafeTrim_(parking.ParqueaderoID) || officialCode + '-PARQ',
      codigoOficial: officialCode,
      codigoLegacy: dmSafeTrim_(parkingRaw).toUpperCase(),
      prefijoCodigo: dmSafeTrim_(parking.PrefijoCodigo) || officialCode.substring(0, 2),
      numero: dmSafeTrim_(parking.NumeroParqueadero) || officialCode.substring(2),
      numericKey: parsed.numericKey,
      existsInCatalog: true,
      resolvedByNumericIdentity: true
    };
  }

  if (candidates.length > 1) {
    return {
      ok: false,
      raw: dmSafeTrim_(parkingRaw),
      numericKey: parsed.numericKey,
      ambiguous: true,
      candidates: candidates.map(function (parking) {
        return dmSafeTrim_(parking.CodigoOficial) || dmSafeTrim_(parking.ParqueaderoID);
      })
    };
  }

  parsed.existsInCatalog = false;
  return parsed;
}

function dmNormalizeRole_(value) {
  const text = dmNormalizeText_(value).toUpperCase();
  if (text.indexOf('PROPIETARIO') !== -1) return 'PROPIETARIO';
  if (text.indexOf('ARRENDATARIO') !== -1) return 'ARRENDATARIO';
  return text ? text.replace(/\s+/g, '_') : '';
}

function dmNormalizeParkingTenure_(value) {
  const text = dmNormalizeText_(value);
  if (text.indexOf('propio') !== -1) return 'PROPIO';
  if (text.indexOf('alquil') !== -1) return 'ALQUILADO';
  if (text === 'no') return 'NO_TIENE';
  return text ? text.toUpperCase().replace(/\s+/g, '_') : 'NO_INFORMADO';
}

function dmVehicleTypeByPlate_(plate) {
  if (/^[A-Z]{3}[0-9]{3}$/.test(plate)) return 'CARRO';
  if (/^[A-Z]{3}[0-9]{2}[A-Z]$/.test(plate)) return 'MOTO';
  return '';
}

function dmExtractPlates_(value) {
  const text = dmSafeTrim_(value).toUpperCase();

  // Acepta formatos frecuentes del censo: ABC123, ABC-123, ABC 123,
  // ABC12D, ABC-12D y ABC 12 D.
  const matches = text.match(
    /\b[A-Z]{3}[\s.-]*[0-9]{3}\b|\b[A-Z]{3}[\s.-]*[0-9]{2}[\s.-]*[A-Z]\b/g
  ) || [];

  return dmUnique_(matches.map(function (plate) {
    return plate.replace(/[^A-Z0-9]/g, '');
  }));
}

/** Diagnóstico manual para revisar vehículos y vínculos de una unidad. */
function dmDiagnosticarVehiculosUnidad(unidadId) {
  const id = dmNormalizeUnitIdValue_(unidadId);
  if (!id) throw new Error('Debes indicar una UnidadID, por ejemplo 1029-T4.');

  const allVehicles = dmReadMasterObjects_(DM_SHEETS.VEHICULOS);
  const links = dmReadMasterObjects_(DM_SHEETS.VINCULOS_VEHICULO)
    .filter(function (link) {
      return dmSafeTrim_(link.UnidadID).toUpperCase() === id;
    });
  const vehicleIds = {};
  links.forEach(function (link) {
    vehicleIds[dmSafeTrim_(link.VehiculoID)] = true;
  });

  const census = dmReadMasterObjects_(DM_SHEETS.CENSO_HISTORIAL)
    .filter(function (row) {
      return dmSafeTrim_(row.UnidadID).toUpperCase() === id;
    })
    .map(function (row) {
      return {
        censoId: row.CensoID,
        placasRaw: row.PlacasRaw,
        tieneMoto: row.TieneMoto,
        tieneCarro: row.TieneCarro,
        vigencia: row.Vigencia,
        filaFuente: row.FilaFuente
      };
    });

  return {
    unidadId: id,
    vehiculosActuales: dmObtenerVehiculosActuales(id),
    vinculos: links,
    vehiculosReferenciados: allVehicles.filter(function (vehicle) {
      return !!vehicleIds[dmSafeTrim_(vehicle.VehiculoID)];
    }),
    historialCenso: census
  };
}

/***************************************
 * CONSOLIDACIÓN Y PRIORIDAD DE FUENTES
 ***************************************/
function dmSplitOwnerNames_(value) {
  return dmUnique_(dmSafeTrim_(value)
    .split('/')
    .map(function (name) { return dmNormalizeName_(name); })
    .filter(Boolean));
}

function dmSourcePriority_(source) {
  const text = dmSafeTrim_(source).toUpperCase();
  if (text.indexOf('INFO_APTOS') !== -1) return 500;
  if (text.indexOf('SHEET_COEFICIENTES') !== -1 || text.indexOf('CATALOGO') !== -1) return 450;
  if (text.indexOf('BIOMETRICO') !== -1) return 400;
  if (text.indexOf('CENSO') !== -1) return 300;
  if (text.indexOf('MAESTRA_SANCIONES') !== -1) return 200;
  if (text.indexOf('REGISTRO_VIGILANCIA') !== -1 || text.indexOf('VIGILANCIA') !== -1) return 100;
  return 0;
}

function dmDateMillis_(value) {
  const date = dmDateOrBlank_(value);
  return date ? date.getTime() : 0;
}

function dmSimilarityThreshold_(model) {
  const configured = model && model.config
    ? dmToDecimal_(model.config.DATA_SIMILARITY_THRESHOLD)
    : null;
  return configured !== null ? configured : 0.82;
}

function dmNameTokens_(value) {
  return dmNormalizeText_(value)
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort();
}

function dmTextSimilarity_(left, right) {
  const a = dmNameTokens_(left);
  const b = dmNameTokens_(right);
  if (!a.length || !b.length) return 0;
  const setA = {};
  const setB = {};
  a.forEach(function (token) { setA[token] = true; });
  b.forEach(function (token) { setB[token] = true; });
  const intersection = Object.keys(setA).filter(function (token) { return setB[token]; }).length;
  const union = Object.keys(setA).concat(Object.keys(setB)).filter(function (token, index, array) {
    return array.indexOf(token) === index;
  }).length;
  const jaccard = union ? intersection / union : 0;
  const joinedA = a.join('');
  const joinedB = b.join('');
  const exact = joinedA === joinedB ? 1 : 0;
  const dice = dmDiceCoefficient_(joinedA, joinedB);
  return Math.max(jaccard, exact, dice);
}

function dmDiceCoefficient_(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return 0;

  const pairs = {};
  for (let i = 0; i < left.length - 1; i++) {
    const pair = left.substring(i, i + 2);
    pairs[pair] = (pairs[pair] || 0) + 1;
  }

  let intersection = 0;
  for (let j = 0; j < right.length - 1; j++) {
    const pair = right.substring(j, j + 2);
    if (pairs[pair]) {
      pairs[pair]--;
      intersection++;
    }
  }

  return (2 * intersection) / ((left.length - 1) + (right.length - 1));
}

function dmPersonSimilarity_(left, right) {
  if (!left || !right) return 0;
  const leftDoc = dmNormalizeDocument_(left.NumeroDocumento);
  const rightDoc = dmNormalizeDocument_(right.NumeroDocumento);
  if (leftDoc && rightDoc && leftDoc === rightDoc) return 1;

  const leftEmails = dmUnique_([left.CorreoPrincipal].concat(dmSplitList_(left.CorreosAlternos)));
  const rightEmails = dmUnique_([right.CorreoPrincipal].concat(dmSplitList_(right.CorreosAlternos)));
  if (leftEmails.some(function (email) { return rightEmails.indexOf(email) !== -1; })) return 0.99;

  const leftPhones = dmUnique_([left.CelularPrincipal].concat(dmSplitList_(left.TelefonosAlternos)));
  const rightPhones = dmUnique_([right.CelularPrincipal].concat(dmSplitList_(right.TelefonosAlternos)));
  if (leftPhones.some(function (phone) { return rightPhones.indexOf(phone) !== -1; })) return 0.96;

  return dmTextSimilarity_(left.NombreCompleto, right.NombreCompleto);
}

function dmFindCorrelatedPersonForUnit_(model, unitId, incoming, roles) {
  const roleSet = {};
  (roles || []).forEach(function (role) { roleSet[role] = true; });
  let best = null;

  Object.keys(model.unitLinks).forEach(function (key) {
    const link = model.unitLinks[key];
    if (link.UnidadID !== unitId) return;
    if (Object.keys(roleSet).length && !roleSet[link.Rol]) return;
    const person = model.persons[link.PersonaID];
    if (!person) return;
    const score = dmPersonSimilarity_(person, incoming);
    if (!best || score > best.score) {
      best = { person: person, link: link, score: score };
    }
  });

  return best && best.score >= dmSimilarityThreshold_(model) ? best : null;
}

function dmFindActiveParkingLinkBySource_(model, unitId, source) {
  const expected = dmSafeTrim_(source).toUpperCase();
  const keys = Object.keys(model.parkingLinks);
  for (let i = 0; i < keys.length; i++) {
    const link = model.parkingLinks[keys[i]];
    if (link.UnidadID === unitId && link.EsActual === 'SI' &&
        dmSafeTrim_(link.Fuente).toUpperCase().indexOf(expected) !== -1) {
      return link;
    }
  }
  return null;
}

function dmFindSimilarPetId_(model, unitId, type, breed) {
  const threshold = dmSimilarityThreshold_(model);
  const normalizedType = dmNormalizeText_(type);
  const normalizedBreed = dmNormalizeText_(breed);
  const keys = Object.keys(model.pets);

  for (let i = 0; i < keys.length; i++) {
    const pet = model.pets[keys[i]];
    if (pet.UnidadID !== unitId) continue;
    const typeSimilarity = dmTextSimilarity_(pet.TipoMascota, normalizedType);
    const breedSimilarity = (!dmNormalizeText_(pet.Raza) || !normalizedBreed)
      ? 1
      : dmTextSimilarity_(pet.Raza, normalizedBreed);
    if (typeSimilarity >= threshold && breedSimilarity >= threshold) return pet.MascotaID;
  }
  return '';
}

/***************************************
 * NORMALIZACIÓN DE PERSONAS Y CONTACTOS
 ***************************************/
function dmNormalizeName_(value) {
  return dmSafeTrim_(value).replace(/\s+/g, ' ');
}

function dmNormalizeDocument_(value) {
  const clean = dmCleanContact_(value);
  if (!clean) return '';
  return clean.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function dmInferDocumentType_(document) {
  if (!document) return '';
  if (/^9\d{8}$/.test(document)) return 'NIT';
  return 'CEDULA';
}

function dmInferPersonNature_(name, document) {
  const text = dmNormalizeText_(name).toUpperCase();
  if (/\b(SAS|S\.A\.S|LTDA|S\.A\.|INVERSIONES|CONSTRUCTORA|FUNDACION|FUNDACIÓN|CORPORACION|CORPORACIÓN)\b/.test(text)) {
    return 'PERSONA_JURIDICA';
  }
  if (/^9\d{8}$/.test(document)) return 'PERSONA_JURIDICA';
  return 'PERSONA_NATURAL';
}

function dmEmailsFromRecord_(record, headers) {
  let emails = [];
  headers.forEach(function (header) {
    emails = emails.concat(dmExtractEmails_(dmGet_(record, [header])));
  });
  return dmUnique_(emails);
}

function dmExtractEmails_(value) {
  const text = dmSafeTrim_(value).toLowerCase();
  if (!text || dmIsPlaceholder_(text)) return [];
  return dmUnique_(text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []);
}

function dmPhonesFromRecord_(record, headers) {
  let phones = [];
  headers.forEach(function (header) {
    phones = phones.concat(dmExtractPhones_(dmGet_(record, [header])));
  });
  return dmUnique_(phones);
}

function dmExtractPhones_(value) {
  const text = dmCleanContact_(value);
  if (!text) return [];

  const candidates = text.split(/[,;/|]+/).map(function (item) {
    return item.replace(/\D/g, '');
  }).filter(function (digits) {
    return digits.length >= 7 && digits.length <= 13;
  });

  return dmUnique_(candidates);
}

/***************************************
 * HELPERS GENERALES
 ***************************************/
function dmNormalizeHeader_(value) {
  return dmSafeTrim_(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dmNormalizeText_(value) {
  return dmSafeTrim_(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function dmSafeTrim_(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function dmCleanContact_(value) {
  const text = dmSafeTrim_(value);
  return dmIsPlaceholder_(text) ? '' : text;
}

function dmIsPlaceholder_(value) {
  const normalized = dmNormalizeText_(value);
  return [
    '', '24', 'na', 'n a', 'n/a', 'no aplica', 'no aplicable',
    'ninguno', 'ninguna', 'null', 'sin informacion', 'sin dato'
  ].indexOf(normalized) !== -1;
}

function dmHasMeaningful_(value) {
  return value !== null && value !== undefined && dmSafeTrim_(value) !== '';
}

function dmStripLeadingZeros_(value) {
  const stripped = dmSafeTrim_(value).replace(/^0+/, '');
  return stripped || '0';
}


function dmIsNegativeFreeText_(value) {
  const text = dmNormalizeText_(value);
  if (!text) return true;
  return [
    'no', 'na', 'n a', 'n/a', 'no aplica', 'no aplicable',
    'no tengo', 'ninguno', 'ninguna', 'sin placa', 'sin vehiculo',
    'sin vehículo', 'sin parqueadero', '0'
  ].indexOf(text) !== -1;
}

function dmNormalizeYesNo_(value) {
  const text = dmNormalizeText_(value);
  if (['si', 'yes', 'true', '1'].indexOf(text) !== -1) return 'SI';
  if (['no', 'false', '0'].indexOf(text) !== -1) return 'NO';
  return text ? 'PENDIENTE_VALIDACION' : '';
}

function dmToDecimal_(value) {
  if (typeof value === 'number') {
    return isNaN(value) ? null : value;
  }

  let text = dmSafeTrim_(value);
  if (!text) return null;

  text = text.replace(/\s/g, '').replace(/\$/g, '');
  if (text.indexOf(',') !== -1 && text.indexOf('.') !== -1) {
    text = text.replace(/,/g, '');
  } else if (text.indexOf(',') !== -1) {
    text = text.replace(',', '.');
  }

  const number = Number(text.replace(/[^0-9.-]/g, ''));
  return isNaN(number) ? null : number;
}

function dmToInteger_(value) {
  const text = dmSafeTrim_(value);
  if (!text) return null;
  const match = text.match(/-?\d+/);
  if (!match) return null;
  return Number(match[0]);
}

function dmDateOrBlank_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return value;
  }
  if (!value) return '';
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? '' : parsed;
}

function dmFirst_(array) {
  return array && array.length ? array[0] : '';
}

function dmUnique_(array) {
  const seen = {};
  return (array || []).filter(function (value) {
    const clean = dmSafeTrim_(value);
    if (!clean) return false;
    const key = clean.toLowerCase();
    if (seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function dmSplitList_(value) {
  if (!value) return [];
  return dmSafeTrim_(value).split(/\s*[,;|]\s*/).filter(Boolean);
}

function dmMergeList_(left, right, separator) {
  const sep = separator || ',';
  const values = dmSafeTrim_(left).split(sep)
    .concat(dmSafeTrim_(right).split(sep));
  return dmUnique_(values).join(sep);
}

function dmCompare_(a, b) {
  return dmSafeTrim_(a).localeCompare(dmSafeTrim_(b), 'es', { numeric: true, sensitivity: 'base' });
}

function dmHash_(value) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    dmSafeTrim_(value),
    Utilities.Charset.UTF_8
  );

  return bytes.map(function (byte) {
    const value = (byte + 256) % 256;
    return ('0' + value.toString(16)).slice(-2);
  }).join('').toUpperCase();
}

function dmId_(prefix, value) {
  return prefix + '-' + dmHash_(value).slice(0, 16);
}

/**
 * Prueba en memoria de la prioridad multifuente. No escribe en hojas.
 */
function TEST_DM_3_VehiculosMultifuente() {
  const now = new Date();
  const model = {
    units: { '1029-T4': {}, '0930-T4': {}, '0602-T1': {}, '2007-T1': {} },
    vehicles: {},
    vehicleLinks: {},
    vehicleEvidence: {},
    conflicts: {},
    stats: {},
    now: now,
    config: {}
  };

  dmAddVehicleEvidence_(model, {
    Placa: 'ABC-123',
    UnidadID: '1029-T4',
    Fuente: 'BIOMETRICO',
    TipoVinculo: 'AUTORIZADO_CONTROL_ACCESO',
    EsUtilizable: 'SI',
    EsActualCandidato: 'SI',
    FechaFuente: new Date(now.getTime() - 86400000)
  });
  dmAddVehicleEvidence_(model, {
    Placa: 'ABC123',
    UnidadID: '0930-T4',
    Fuente: 'CENSO',
    TipoVinculo: 'RESIDENTE',
    EsUtilizable: 'SI',
    EsActualCandidato: 'SI',
    FechaFuente: now
  });

  dmResolverVinculosVehiculo_(model);
  const current = Object.keys(model.vehicleLinks)
    .map(function (key) { return model.vehicleLinks[key]; })
    .filter(function (link) { return link.EsActual === 'SI'; });

  if (current.length !== 1 || current[0].UnidadID !== '1029-T4' || current[0].FuenteGanadora !== 'BIOMETRICO') {
    throw new Error('Falló la prioridad BIOMETRICO > CENSO: ' + JSON.stringify(current));
  }

  const ambiguous = dmUnitCandidatesFromFreeText_('602 - 2007', model, { ignoreSingleDigit: true });
  if (!ambiguous.ambiguous || ambiguous.candidates.length !== 2) {
    throw new Error('Falló la detección de apartamentos ambiguos: ' + JSON.stringify(ambiguous));
  }

  Logger.log('TEST_DM_3_VehiculosMultifuente OK');
  return { ok: true, current: current[0], conflictos: Object.keys(model.conflicts).length };
}

/***************************************
 * TESTS SEGUROS
 ***************************************/
function TEST_DM_1_Normalizacion() {
  const cases = [
    { project: 'BULEVAR VERDE T4', apt: 'APT-4-0430', expected: '0430-T4' },
    { project: 'T8', apt: '1657', expected: '1657-T8' },
    { project: 'T3', apt: 1418, expected: '1418-T3' }
  ];

  cases.forEach(function (test) {
    const result = dmParseUnidad_(test.project, test.apt);
    if (!result.ok || result.unidadId !== test.expected) {
      throw new Error('Normalización falló para ' + JSON.stringify(test) + ': ' + JSON.stringify(result));
    }
  });

  const plates = dmExtractPlates_('XRO25E, DCG-20F / EPQ 535');
  if (plates.length !== 3) throw new Error('Extracción de placas falló: ' + JSON.stringify(plates));

  Logger.log('TEST_DM_1_Normalizacion OK');
}

function TEST_DM_2_DryRunCompleto() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  dmCrearEstructuraInterna_(ss);
  const config = dmGetConfigMap_(ss);
  const result = dmConstruirModelo_({
    ss: ss,
    config: config,
    incluirCenso: dmCensoConfigurado_(config)
  });

  if (result.stats.unidades < 1) throw new Error('No se construyeron unidades.');
  Logger.log('Dry-run OK. Unidades=' + result.stats.unidades + ', conflictos=' + result.stats.conflictos);
}
