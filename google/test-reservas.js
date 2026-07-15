/***************************************
 * FUNCIONES DE PRUEBA Y VALIDACIÓN
 * Club Residencial Bulevar Verde
 * 
 * Estas funciones permiten probar el sistema
 * sin afectar datos de producción.
 * 
 * IMPORTANTE: Ejecutar en una COPIA del Spreadsheet
 * para pruebas iniciales.
 ***************************************/

/***************************************
 * TEST 1: Diagnóstico Completo
 * Ejecutar PRIMERO antes de cualquier cambio
 ***************************************/
function TEST_1_DiagnosticoCompleto() {
  Logger.log('========================================');
  Logger.log('TEST 1: DIAGNÓSTICO COMPLETO');
  Logger.log('========================================\n');
  
  diagnosticarEstructuraReservas();
  
  Logger.log('\n========================================');
  Logger.log('TEST 1: COMPLETADO');
  Logger.log('Revisa los logs arriba para verificar:');
  Logger.log('1. Nombre del Spreadsheet');
  Logger.log('2. Cantidad de hojas');
  Logger.log('3. Encabezados actuales (A:K)');
  Logger.log('4. Total de reservas existentes');
  Logger.log('5. Estado de columnas técnicas');
  Logger.log('========================================');
}

/***************************************
 * TEST 2: Verificar Funciones Nuevas
 * Verifica que todas las funciones nuevas existan
 ***************************************/
function TEST_2_VerificarFuncionesNuevas() {
  Logger.log('========================================');
  Logger.log('TEST 2: VERIFICAR FUNCIONES NUEVAS');
  Logger.log('========================================\n');
  
  const funcionesRequeridas = [
    'doPost',
    'createReservation_',
    'generateReservationId_',
    'findReservationByRequestId_',
    'ensureReservationTechnicalColumns_',
    'normalizeTorre_',
    'resolveBienFromReservationValue_',
    'resolveBienDescriptionById_',
    'diagnosticarEstructuraReservas'
  ];
  
  let todasExisten = true;
  
  funcionesRequeridas.forEach(function(nombre) {
    try {
      const func = eval(nombre);
      if (typeof func === 'function') {
        Logger.log('✅ ' + nombre + ' - EXISTE');
      } else {
        Logger.log('❌ ' + nombre + ' - NO ES UNA FUNCIÓN');
        todasExisten = false;
      }
    } catch (e) {
      Logger.log('❌ ' + nombre + ' - NO EXISTE');
      todasExisten = false;
    }
  });
  
  Logger.log('\n========================================');
  if (todasExisten) {
    Logger.log('✅ TEST 2: EXITOSO - Todas las funciones existen');
  } else {
    Logger.log('❌ TEST 2: FALLIDO - Faltan funciones');
    Logger.log('ACCIÓN: Verifica que el código se haya copiado completamente');
  }
  Logger.log('========================================');
}

/***************************************
 * TEST 3: Modo Dry-Run - Columnas Técnicas
 * Simula agregar columnas sin modificar nada
 ***************************************/
function TEST_3_DryRunColumnasTecnicas() {
  Logger.log('========================================');
  Logger.log('TEST 3: DRY-RUN COLUMNAS TÉCNICAS');
  Logger.log('========================================\n');
  
  // Verificar que el flag esté en true
  Logger.log('RESERVATION_MIGRATION_DRY_RUN = ' + RESERVATION_MIGRATION_DRY_RUN);
  
  if (!RESERVATION_MIGRATION_DRY_RUN) {
    Logger.log('\n⚠️ ADVERTENCIA: El modo dry-run está DESACTIVADO');
    Logger.log('Para pruebas seguras, establece:');
    Logger.log('const RESERVATION_MIGRATION_DRY_RUN = true;');
    Logger.log('\nEjecutando de todos modos en modo LECTURA...\n');
  }
  
  const sheet = getSheetByNameOrThrow_(SHEET_RESPUESTAS);
  const headers = getHeaders_(sheet);
  
  Logger.log('Encabezados actuales (' + headers.length + '):');
  headers.forEach(function(h, idx) {
    const letra = String.fromCharCode(65 + idx);
    Logger.log('  ' + letra + ': ' + h);
  });
  
  Logger.log('\nColumnas técnicas requeridas:');
  const requiredTechnicalColumns = [
    'IdReserva',
    'RequestId',
    'OrigenReserva',
    'FechaRegistroSistema',
    'AceptaReglamento',
    'AceptaTratamientoDatos'
  ];
  
  requiredTechnicalColumns.forEach(function(col) {
    const existe = headers.includes(col);
    if (existe) {
      const idx = headers.indexOf(col);
      const letra = String.fromCharCode(65 + idx);
      Logger.log('  ✅ ' + col + ' - EXISTE en columna ' + letra);
    } else {
      Logger.log('  ❌ ' + col + ' - NO EXISTE');
    }
  });
  
  Logger.log('\n========================================');
  Logger.log('TEST 3: COMPLETADO');
  Logger.log('Revisa arriba qué columnas se agregarían');
  Logger.log('========================================');
}

/***************************************
 * TEST 4: Agregar Columnas Técnicas (REAL)
 * Solo ejecutar después de TEST 3 y verificar logs
 ***************************************/
function TEST_4_AgregarColumnasTecnicas() {
  Logger.log('========================================');
  Logger.log('TEST 4: AGREGAR COLUMNAS TÉCNICAS (REAL)');
  Logger.log('========================================\n');
  
  if (RESERVATION_MIGRATION_DRY_RUN) {
    Logger.log('❌ ERROR: Modo dry-run está ACTIVADO');
    Logger.log('Para agregar columnas realmente, establece:');
    Logger.log('const RESERVATION_MIGRATION_DRY_RUN = false;');
    Logger.log('\n⚠️ IMPORTANTE: Ejecuta TEST_3 primero para ver qué se agregará');
    Logger.log('========================================');
    return;
  }
  
  Logger.log('⚠️ ADVERTENCIA: Esta operación MODIFICARÁ el Spreadsheet');
  Logger.log('Continuando en 3 segundos...\n');
  Utilities.sleep(3000);
  
  try {
    ensureReservationTechnicalColumns_();
    
    Logger.log('\n✅ Columnas técnicas agregadas exitosamente');
    Logger.log('\nVerifica en el Spreadsheet:');
    Logger.log('1. Abre la hoja "Respuestas de formulario 1"');
    Logger.log('2. Verifica que existan columnas L:Q en la fila 1');
    Logger.log('3. Las filas históricas (2-90) pueden tener estas columnas vacías');
    
  } catch (e) {
    Logger.log('❌ ERROR agregando columnas: ' + e.message);
    Logger.log('Stack: ' + e.stack);
  }
  
  Logger.log('\n========================================');
  Logger.log('TEST 4: COMPLETADO');
  Logger.log('========================================');
}

/***************************************
 * TEST 5: Simular Payload POST
 * Prueba la creación de reserva sin enviar POST real
 ***************************************/
function TEST_5_SimularPayloadPOST() {
  Logger.log('========================================');
  Logger.log('TEST 5: SIMULAR PAYLOAD POST');
  Logger.log('========================================\n');
  
  // Payload de prueba
  const payload = {
    requestId: 'TEST-' + Date.now(),
    bienId: 'SALON1',
    fecha: '2026-08-15',
    horario: '08:00-23:59',
    torre: 'T1',
    apto: '9999',
    nombre: 'Prueba Sistema POST',
    email: 'prueba@ejemplo.com',
    asunto: 'Prueba de validación de sistema',
    aceptaReglamento: true,
    aceptaTratamientoDatos: true
  };
  
  Logger.log('Payload de prueba:');
  Logger.log(JSON.stringify(payload, null, 2));
  Logger.log('');
  
  try {
    // Verificar que no haya duplicados
    const existente = findReservationByRequestId_(payload.requestId);
    if (existente) {
      Logger.log('⚠️ Ya existe una reserva con este requestId:');
      Logger.log('   IdReserva: ' + existente.idReserva);
      Logger.log('   Fila: ' + existente.rowIndex);
      Logger.log('\n❌ TEST 5: FALLIDO - Duplicado detectado');
      Logger.log('ACCIÓN: Usa otro requestId o elimina la reserva de prueba anterior');
      Logger.log('========================================');
      return;
    }
    
    // Crear reserva
    Logger.log('Creando reserva de prueba...\n');
    const result = createReservation_(payload);
    
    if (result.ok) {
      Logger.log('✅ Reserva creada exitosamente:');
      Logger.log('   IdReserva: ' + result.idReserva);
      Logger.log('   Estado: ' + result.estado);
      Logger.log('   Observaciones: ' + result.observaciones);
      Logger.log('   Fila: ' + result.rowIndex);
      
      Logger.log('\n📋 VERIFICACIÓN MANUAL REQUERIDA:');
      Logger.log('1. Abre el Spreadsheet');
      Logger.log('2. Ve a la fila ' + result.rowIndex);
      Logger.log('3. Verifica que los datos sean correctos:');
      Logger.log('   - Columna C (Inmueble): Debe ser "Salon Social 1 Sky Club" (descripción, no SALON1)');
      Logger.log('   - Columna E (FechaReserva): Debe ser un objeto Date (2026-08-15)');
      Logger.log('   - Columna F (Horario): Debe ser "08:00-23:59"');
      Logger.log('   - Columna G (Torre): Debe ser "T1"');
      Logger.log('   - Columna H (Apto): Debe ser "9999" como TEXTO');
      Logger.log('   - Columna L (IdReserva): ' + result.idReserva);
      Logger.log('   - Columna M (RequestId): ' + payload.requestId);
      Logger.log('   - Columna N (OrigenReserva): WEB_POST');
      
      Logger.log('\n⚠️ IMPORTANTE: Elimina esta fila de prueba antes de poner en producción');
      
    } else {
      Logger.log('❌ Error creando reserva:');
      Logger.log('   ' + result.error);
    }
    
  } catch (e) {
    Logger.log('❌ EXCEPCIÓN: ' + e.message);
    Logger.log('Stack: ' + e.stack);
  }
  
  Logger.log('\n========================================');
  Logger.log('TEST 5: COMPLETADO');
  Logger.log('========================================');
}

/***************************************
 * TEST 6: Verificar Compatibilidad con Históricos
 * Lee las primeras 5 reservas históricas
 ***************************************/
function TEST_6_VerificarCompatibilidadHistoricos() {
  Logger.log('========================================');
  Logger.log('TEST 6: COMPATIBILIDAD CON HISTÓRICOS');
  Logger.log('========================================\n');
  
  const sheet = getSheetByNameOrThrow_(SHEET_RESPUESTAS);
  const headers = getHeaders_(sheet);
  
  Logger.log('Leyendo primeras 5 reservas históricas...\n');
  
  for (let i = 2; i <= Math.min(6, sheet.getLastRow()); i++) {
    const rowObj = getRowObject_(sheet, i, headers);
    
    Logger.log('--- Fila ' + i + ' ---');
    Logger.log('Email: ' + safeTrim_(rowObj['Dirección de correo electrónico']));
    Logger.log('Inmueble: ' + safeTrim_(rowObj['Inmueble']));
    Logger.log('FechaReserva: ' + rowObj['FechaReserva'] + ' (tipo: ' + typeof rowObj['FechaReserva'] + ')');
    Logger.log('Horario: ' + safeTrim_(rowObj['Horario']));
    Logger.log('Torre: ' + safeTrim_(rowObj['Torre']));
    Logger.log('Apto: ' + safeTrim_(rowObj['Apto']) + ' (tipo: ' + typeof rowObj['Apto'] + ')');
    Logger.log('Estado: ' + safeTrim_(rowObj['Estado']));
    
    // Verificar si se puede resolver el bien
    const inmuebleValue = safeTrim_(rowObj['Inmueble']);
    const bienResuelto = resolveBienFromReservationValue_(inmuebleValue);
    if (bienResuelto) {
      Logger.log('✅ Bien resuelto: ' + bienResuelto.BienID + ' (' + bienResuelto.Descripcion + ')');
    } else {
      Logger.log('⚠️ No se pudo resolver bien desde: ' + inmuebleValue);
    }
    
    Logger.log('');
  }
  
  Logger.log('========================================');
  Logger.log('TEST 6: COMPLETADO');
  Logger.log('Verifica que todas las reservas históricas se lean correctamente');
  Logger.log('========================================');
}

/***************************************
 * TEST 7: Verificar Calendario
 * Genera calendario y verifica que incluya reservas históricas y nuevas
 ***************************************/
function TEST_7_VerificarCalendario() {
  Logger.log('========================================');
  Logger.log('TEST 7: VERIFICAR CALENDARIO');
  Logger.log('========================================\n');
  
  try {
    Logger.log('Generando calendario de reservas...\n');
    crearCalendarioVisualReservas();
    
    Logger.log('✅ Calendario generado exitosamente');
    Logger.log('\n📋 VERIFICACIÓN MANUAL REQUERIDA:');
    Logger.log('1. Abre la hoja "Calendario Reservas"');
    Logger.log('2. Verifica que aparezcan:');
    Logger.log('   - Reservas históricas (anteriores)');
    Logger.log('   - Reserva de prueba del TEST 5 (si la creaste)');
    Logger.log('3. Verifica el formato de las celdas');
    Logger.log('4. Verifica que las reservas estén en los días correctos');
    
  } catch (e) {
    Logger.log('❌ ERROR generando calendario: ' + e.message);
    Logger.log('Stack: ' + e.stack);
  }
  
  Logger.log('\n========================================');
  Logger.log('TEST 7: COMPLETADO');
  Logger.log('========================================');
}

/***************************************
 * TEST 8: Verificar Generación de IDs
 * Prueba que los IDs sean únicos
 ***************************************/
function TEST_8_VerificarGeneracionIDs() {
  Logger.log('========================================');
  Logger.log('TEST 8: VERIFICAR GENERACIÓN DE IDS');
  Logger.log('========================================\n');
  
  Logger.log('Generando 5 IDs de reserva...\n');
  
  const ids = [];
  for (let i = 0; i < 5; i++) {
    const id = generateReservationId_();
    ids.push(id);
    Logger.log((i + 1) + '. ' + id);
    Utilities.sleep(1000); // Esperar 1 segundo entre cada generación
  }
  
  // Verificar unicidad
  const unique = new Set(ids);
  if (unique.size === ids.length) {
    Logger.log('\n✅ Todos los IDs son únicos');
  } else {
    Logger.log('\n❌ HAY IDs DUPLICADOS');
    Logger.log('ACCIÓN: Revisa la función generateReservationId_()');
  }
  
  Logger.log('\n========================================');
  Logger.log('TEST 8: COMPLETADO');
  Logger.log('========================================');
}

/***************************************
 * TEST 9: Verificar Normalización de Torre
 * Prueba diferentes formatos de torre
 ***************************************/
function TEST_9_VerificarNormalizacionTorre() {
  Logger.log('========================================');
  Logger.log('TEST 9: VERIFICAR NORMALIZACIÓN TORRE');
  Logger.log('========================================\n');
  
  const casos = [
    { entrada: 'T1', esperado: 'T1' },
    { entrada: 't1', esperado: 'T1' },
    { entrada: 'Torre 1', esperado: 'T1' },
    { entrada: '1', esperado: 'T1' },
    { entrada: 'T2', esperado: 'T2' },
    { entrada: 'torre 3', esperado: 'T3' },
    { entrada: 'T4', esperado: 'T4' },
    { entrada: 'T8', esperado: 'T8' },
    { entrada: '8', esperado: 'T8' }
  ];
  
  let todosCorrectos = true;
  
  casos.forEach(function(caso) {
    const resultado = normalizeTorre_(caso.entrada);
    const ok = resultado === caso.esperado;
    
    if (ok) {
      Logger.log('✅ "' + caso.entrada + '" → "' + resultado + '"');
    } else {
      Logger.log('❌ "' + caso.entrada + '" → "' + resultado + '" (esperado: "' + caso.esperado + '")');
      todosCorrectos = false;
    }
  });
  
  Logger.log('\n========================================');
  if (todosCorrectos) {
    Logger.log('✅ TEST 9: EXITOSO - Todas las normalizaciones correctas');
  } else {
    Logger.log('❌ TEST 9: FALLIDO - Hay normalizaciones incorrectas');
    Logger.log('ACCIÓN: Revisa la función normalizeTorre_()');
  }
  Logger.log('========================================');
}

/***************************************
 * TEST 10: Limpieza de Datos de Prueba
 * Elimina la reserva de prueba del TEST 5
 ***************************************/
function TEST_10_LimpiarDatosPrueba() {
  Logger.log('========================================');
  Logger.log('TEST 10: LIMPIEZA DE DATOS DE PRUEBA');
  Logger.log('========================================\n');
  
  const sheet = getSheetByNameOrThrow_(SHEET_RESPUESTAS);
  const headers = getHeaders_(sheet);
  const lastRow = sheet.getLastRow();
  
  Logger.log('Buscando reservas de prueba...\n');
  
  let eliminadas = 0;
  
  // Buscar de abajo hacia arriba para no afectar índices
  for (let i = lastRow; i >= 2; i--) {
    const rowObj = getRowObject_(sheet, i, headers);
    const nombre = safeTrim_(rowObj['Nombre']);
    const apto = safeTrim_(rowObj['Apto']);
    
    // Detectar reservas de prueba
    if (nombre === 'Prueba Sistema POST' || apto === '9999') {
      Logger.log('Eliminando fila ' + i + ':');
      Logger.log('  Nombre: ' + nombre);
      Logger.log('  Apto: ' + apto);
      Logger.log('  Email: ' + safeTrim_(rowObj['Dirección de correo electrónico']));
      
      sheet.deleteRow(i);
      eliminadas++;
    }
  }
  
  if (eliminadas > 0) {
    Logger.log('\n✅ ' + eliminadas + ' reserva(s) de prueba eliminada(s)');
  } else {
    Logger.log('ℹ️ No se encontraron reservas de prueba para eliminar');
  }
  
  Logger.log('\n========================================');
  Logger.log('TEST 10: COMPLETADO');
  Logger.log('========================================');
}

/***************************************
 * TEST SUITE COMPLETO
 * Ejecuta todos los tests en orden
 * ADVERTENCIA: Solo ejecutar en COPIA del Spreadsheet
 ***************************************/
function TEST_SUITE_COMPLETO() {
  Logger.log('╔════════════════════════════════════════╗');
  Logger.log('║   TEST SUITE COMPLETO - RESERVAS POST  ║');
  Logger.log('╚════════════════════════════════════════╝\n');
  
  Logger.log('⚠️ ADVERTENCIA: Este test modificará datos');
  Logger.log('Solo ejecutar en una COPIA del Spreadsheet\n');
  Logger.log('Continuando en 5 segundos...\n');
  Utilities.sleep(5000);
  
  TEST_1_DiagnosticoCompleto();
  Logger.log('\n\n');
  
  TEST_2_VerificarFuncionesNuevas();
  Logger.log('\n\n');
  
  TEST_3_DryRunColumnasTecnicas();
  Logger.log('\n\n');
  
  // No ejecutar TEST 4 automáticamente (requiere confirmación manual)
  Logger.log('⏭️ SALTANDO TEST_4_AgregarColumnasTecnicas');
  Logger.log('   Ejecutar manualmente después de revisar TEST 3\n\n');
  
  TEST_6_VerificarCompatibilidadHistoricos();
  Logger.log('\n\n');
  
  TEST_8_VerificarGeneracionIDs();
  Logger.log('\n\n');
  
  TEST_9_VerificarNormalizacionTorre();
  Logger.log('\n\n');
  
  Logger.log('╔════════════════════════════════════════╗');
  Logger.log('║   TEST SUITE COMPLETO - FINALIZADO     ║');
  Logger.log('╚════════════════════════════════════════╝\n');
  
  Logger.log('📋 PRÓXIMOS PASOS:');
  Logger.log('1. Revisar logs de todos los tests');
  Logger.log('2. Si todo OK, ejecutar TEST_4_AgregarColumnasTecnicas');
  Logger.log('3. Ejecutar TEST_5_SimularPayloadPOST');
  Logger.log('4. Ejecutar TEST_7_VerificarCalendario');
  Logger.log('5. Ejecutar TEST_11_SimularDoPostCompleto');
  Logger.log('6. Ejecutar TEST_12_VerificarEndpointVerificacion');
  Logger.log('7. Ejecutar TEST_10_LimpiarDatosPrueba');
  Logger.log('========================================');
}

/***************************************
 * TEST 11: Simular doPost() Completo
 * Simula una petición HTTP POST real a doPost()
 * con el objeto 'e' completo tal como lo envía Google
 ***************************************/
function TEST_11_SimularDoPostCompleto() {
  Logger.log('========================================');
  Logger.log('TEST 11: SIMULAR doPost() COMPLETO');
  Logger.log('========================================\n');
  
  // Payload exacto como viene del frontend
  const payload = {
    requestId: 'TEST-' + Date.now(),
    bienId: 'SALON3',
    fecha: '2026-07-25',
    horario: '08:00-23:59',  // Salones: reserva por día completo (sin límite de duración)
    torre: 'T4',
    apto: '1029',
    nombre: 'Henry Correa TEST',
    email: 'test@bulevarverde.co',
    asunto: 'TEST: Verificar creación de reserva',
    aceptaReglamento: true,
    aceptaTratamientoDatos: true
  };
  
  Logger.log('📦 Payload que se enviará:');
  Logger.log(JSON.stringify(payload, null, 2));
  Logger.log('');
  
  // Simular objeto 'e' exacto como lo recibe doPost()
  const e = {
    postData: {
      contents: JSON.stringify(payload),
      type: 'application/json'
    },
    parameter: {},
    contextPath: '',
    contentLength: JSON.stringify(payload).length,
    queryString: ''
  };
  
  Logger.log('📨 Simulando petición POST...\n');
  
  try {
    // Llamar a doPost() exactamente como lo haría Google Apps Script
    const response = doPost(e);
    
    // Obtener el contenido de la respuesta
    const responseText = response.getContent();
    const responseData = JSON.parse(responseText);
    
    Logger.log('📬 Respuesta de doPost():');
    Logger.log(JSON.stringify(responseData, null, 2));
    Logger.log('');
    
    if (responseData.ok) {
      Logger.log('✅ POST EXITOSO');
      Logger.log('   IdReserva: ' + responseData.idReserva);
      Logger.log('   Estado: ' + responseData.estado + ' (debe ser "Pendiente")');
      Logger.log('   Mensaje: ' + responseData.mensaje);
      Logger.log('   Fila: ' + responseData.rowIndex);
      
      Logger.log('\n🔍 VERIFICACIÓN EN SHEETS:');
      Logger.log('   1. Abre la hoja "Respuestas de formulario 1"');
      Logger.log('   2. Ve a la fila ' + responseData.rowIndex);
      Logger.log('   3. Verifica:');
      Logger.log('      - Columna C (Inmueble): "Salon Social 3"');
      Logger.log('      - Columna E (FechaReserva): 2026-07-25');
      Logger.log('      - Columna F (Horario): "08:00-23:59" (día completo)');
      Logger.log('      - Columna G (Torre): "T4"');
      Logger.log('      - Columna H (Apto): "1029" (TEXTO)');
      Logger.log('      - Columna I (Nombre): "Henry Correa TEST"');
      Logger.log('      - Columna J (Email): "test@bulevarverde.co"');
      Logger.log('      - Columna K (Asunto): "TEST: Verificar..."');
      Logger.log('      - Columna L (IdReserva): ' + responseData.idReserva);
      Logger.log('      - Columna M (RequestId): ' + payload.requestId);
      Logger.log('      - Columna N (OrigenReserva): "WEB_POST"');
      Logger.log('      - Columna P (AceptaReglamento): "SI"');
      Logger.log('      - Columna Q (AceptaTratamientoDatos): "SI"');
      
      Logger.log('\n📧 VERIFICACIÓN DE CORREO:');
      Logger.log('   Revisa si se envió correo a: bulevarverdeadmon@gmail.com');
      Logger.log('   Asunto: [Bulevar Verde] Nueva Reserva Web - ' + responseData.idReserva);
      
      Logger.log('\n⚠️ LIMPIAR DESPUÉS:');
      Logger.log('   Ejecuta TEST_10_LimpiarDatosPrueba() para eliminar esta reserva de prueba');
      
    } else {
      Logger.log('❌ POST FALLIDO');
      Logger.log('   Error: ' + responseData.error);
    }
    
  } catch (error) {
    Logger.log('❌ EXCEPCIÓN en doPost():');
    Logger.log('   Mensaje: ' + error.message);
    Logger.log('   Stack: ' + error.stack);
  }
  
  Logger.log('\n========================================');
  Logger.log('TEST 11: COMPLETADO');
  Logger.log('========================================');
}

/***************************************
 * TEST 12: Verificar Endpoint de Verificación
 * Prueba el endpoint verifyReservation
 ***************************************/
function TEST_12_VerificarEndpointVerificacion() {
  Logger.log('========================================');
  Logger.log('TEST 12: VERIFICAR ENDPOINT VERIFICACIÓN');
  Logger.log('========================================\n');
  
  // Primero crear una reserva de prueba
  Logger.log('📝 Paso 1: Crear reserva de prueba...\n');
  
  const testRequestId = 'TEST-VERIFY-' + Date.now();
  const payload = {
    requestId: testRequestId,
    bienId: 'SALON1',
    fecha: '2026-08-20',
    horario: '14:00-18:00',
    torre: 'T1',
    apto: '0101',
    nombre: 'Test Verificación',
    email: 'verify@test.com',
    asunto: 'TEST: Verificar endpoint',
    aceptaReglamento: true,
    aceptaTratamientoDatos: true
  };
  
  const result = createReservation_(payload);
  
  if (!result.ok) {
    Logger.log('❌ No se pudo crear reserva de prueba');
    Logger.log('   Error: ' + result.error);
    Logger.log('\n========================================');
    Logger.log('TEST 12: FALLIDO');
    Logger.log('========================================');
    return;
  }
  
  Logger.log('✅ Reserva creada:');
  Logger.log('   IdReserva: ' + result.idReserva);
  Logger.log('   RequestId: ' + testRequestId);
  Logger.log('   Fila: ' + result.rowIndex);
  Logger.log('');
  
  // Ahora simular GET de verificación
  Logger.log('📝 Paso 2: Simular GET ?action=verifyReservation...\n');
  
  const e = {
    parameter: {
      action: 'verifyReservation',
      requestId: testRequestId
    },
    postData: null,
    contentLength: -1,
    queryString: 'action=verifyReservation&requestId=' + encodeURIComponent(testRequestId),
    contextPath: ''
  };
  
  try {
    const response = doGet(e);
    const responseText = response.getContent();
    const responseData = JSON.parse(responseText);
    
    Logger.log('📬 Respuesta de doGet():');
    Logger.log(JSON.stringify(responseData, null, 2));
    Logger.log('');
    
    if (responseData.ok && responseData.exists) {
      Logger.log('✅ VERIFICACIÓN EXITOSA');
      Logger.log('   exists: true');
      Logger.log('   idReserva: ' + responseData.idReserva);
      Logger.log('   - estado: ' + responseData.estado + ' (debe ser "Pendiente")');
      Logger.log('   rowIndex: ' + responseData.rowIndex);
      
      // Verificar que los datos coinciden
      if (responseData.idReserva === result.idReserva) {
        Logger.log('\n✅ IdReserva coincide correctamente');
      } else {
        Logger.log('\n⚠️ IdReserva NO coincide:');
        Logger.log('   Esperado: ' + result.idReserva);
        Logger.log('   Recibido: ' + responseData.idReserva);
      }
      
    } else if (responseData.ok && !responseData.exists) {
      Logger.log('❌ VERIFICACIÓN FALLÓ - Reserva NO encontrada');
      Logger.log('   exists: false');
      Logger.log('   Esto indica que findReservationByRequestId_() no está funcionando');
      
    } else {
      Logger.log('❌ VERIFICACIÓN FALLÓ');
      Logger.log('   Error: ' + (responseData.error || 'Desconocido'));
    }
    
  } catch (error) {
    Logger.log('❌ EXCEPCIÓN en doGet():');
    Logger.log('   Mensaje: ' + error.message);
    Logger.log('   Stack: ' + error.stack);
  }
  
  Logger.log('\n⚠️ LIMPIAR: Ejecuta TEST_10_LimpiarDatosPrueba() al finalizar');
  
  Logger.log('\n⚠️ LIMPIAR: Ejecuta TEST_10_LimpiarDatosPrueba() al finalizar');
  
  Logger.log('\n========================================');
  Logger.log('TEST 12: COMPLETADO');
  Logger.log('========================================');
}

