(function () {
  'use strict';

  var config = window.VEHICULOS_CONFIG || {};
  var API_BASE = config.apiBase || '';

  var ORIGENES = {
    WEB_VIGILANCIA: 'Vigilancia',
    AUTOSERVICIO_RESIDENTE: 'Residente'
  };
  var PLACAS_SIN_PLACA = ['ELECTRICO', 'SIN PLACA'];

  var subVista = 'registrar';
  var movimientos = [];
  var rangoActual = null;
  var reporteIniciado = false;
  var reporteDesactualizado = false;
  var registrosSancion = [];
  var sancionesIniciado = false;
  var configuracionIniciado = false;
  var tarifas = [];
  var editandoId = null;
  var fotosUrl = {};
  var observadorMiniaturas = null;

  function $(id) { return document.getElementById(id); }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getAuthToken() {
    return new Promise(function (resolve, reject) {
      if (!window.firebase || !firebase.auth) {
        reject(new Error('No hay sesión activa.'));
        return;
      }
      if (firebase.auth().currentUser) {
        firebase.auth().currentUser.getIdToken().then(resolve, reject);
        return;
      }
      var off = firebase.auth().onAuthStateChanged(function (user) {
        off();
        if (!user) {
          reject(new Error('No hay sesión activa.'));
          return;
        }
        user.getIdToken().then(resolve, reject);
      });
    });
  }

  function apiFetch(path, options) {
    options = options || {};
    return getAuthToken().then(function (token) {
      var headers = { Authorization: 'Bearer ' + token };
      if (options.body) headers['Content-Type'] = 'application/json';
      return fetch(API_BASE + path, {
        method: options.method || 'GET',
        headers: headers,
        body: options.body ? JSON.stringify(options.body) : undefined
      });
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) throw new Error((body.error && body.error.message) || 'No fue posible completar la solicitud.');
        return body;
      });
    });
  }

  function show(id, visible) {
    $(id).classList.toggle('hidden', !visible);
  }

  function busy(button, active, label) {
    if (active) {
      button.dataset.old = button.innerHTML;
      button.disabled = true;
      button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>' + label;
    } else {
      button.disabled = false;
      button.innerHTML = button.dataset.old || label;
    }
  }

  function toIsoDate(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  // ===== Sub-pestañas =====

  function modoVehiculos(name) {
    subVista = name;
    var registrar = name === 'registrar';
    var sanciones = name === 'sanciones';
    var configuracion = name === 'configuracion';
    // El reporte es el valor por defecto sólo para un nombre vacío o desconocido; antes era
    // `!registrar && !sanciones`, que mostraba el reporte junto a cualquier vista nueva.
    var reporte = !registrar && !sanciones && !configuracion;
    show('vehiculosRegistrarView', registrar);
    show('vehiculosReporteView', reporte);
    show('vehiculosSancionesView', sanciones);
    if ($('vehiculosConfiguracionView')) show('vehiculosConfiguracionView', configuracion);
    $('showVehiculosRegistrar').classList.toggle('active', registrar);
    $('showVehiculosReporte').classList.toggle('active', reporte);
    $('showVehiculosSanciones').classList.toggle('active', sanciones);
    if ($('showVehiculosConfiguracion')) $('showVehiculosConfiguracion').classList.toggle('active', configuracion);

    if (registrar) {
      $('vehApartment').focus();
    } else if (sanciones) {
      if (!sancionesIniciado) {
        sancionesIniciado = true;
        setRangoSanciones('mes');
        consultarSanciones();
        // El bloque de controversias solo existe en administración.
        if ($('vkLista')) cargarControversias();
      }
    } else if (configuracion) {
      if (!configuracionIniciado) {
        configuracionIniciado = true;
        cargarTarifas();
      }
    } else if (!reporteIniciado) {
      reporteIniciado = true;
      setRango('mes');
      consultar();
    } else if (reporteDesactualizado) {
      consultar();
    }
  }

  // ===== Registrar =====

  function registroMsg(text, type) {
    var box = $('vehRegistroAlert');
    box.className = 'alert alert-' + (type || 'danger');
    box.textContent = text;
    box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function registroHideMsg() {
    $('vehRegistroAlert').classList.add('hidden');
  }

  function placaValida(placa, tipoVehiculo) {
    if (PLACAS_SIN_PLACA.indexOf(placa) !== -1) return true;
    if (tipoVehiculo === 'CARRO') return /^[A-Z]{3}\d{3}$/.test(placa);
    if (tipoVehiculo === 'MOTO') return /^[A-Z]{3}\d{2}[A-Z]$/.test(placa);
    return false;
  }

  // Mayúsculas, sin espacios, puntos ni guiones (data/REGLAS_OPERATIVAS.md). Los marcadores conservan su
  // forma («SIN PLACA» lleva un espacio).
  function normalizarPlaca(valor) {
    var v = String(valor || '').trim().toUpperCase().replace(/\s+/g, ' ');
    return PLACAS_SIN_PLACA.indexOf(v) !== -1 ? v : v.replace(/[\s.-]+/g, '');
  }

  // El vigilante no escribe quién autoriza: al teclear el apartamento se cargan sus residentes y solo
  // elige. Una llamada resuelve apartamento → personas.
  var autorizaApartamento = '';
  var autorizaPeticion = 0;

  function estadoAutoriza(texto) {
    $('vehAutorizaEstado').textContent = texto || '';
  }

  // No toca autorizaApartamento: ese memo evita reconsultar el mismo apartamento en cada blur, y se
  // limpia solo donde hay que volver a pedir los datos.
  function limpiarAutoriza(mensaje) {
    $('vehAutoriza').innerHTML = '<option value="">' + esc(mensaje) + '</option>';
    $('vehAutoriza').disabled = true;
  }

  function reiniciarAutoriza() {
    autorizaApartamento = '';
    limpiarAutoriza('Escribe primero el apartamento…');
    estadoAutoriza('');
  }

  function cargarAutorizantes() {
    var apartamento = $('vehApartment').value.trim();
    if (apartamento === autorizaApartamento) return;
    if (!/^\d{1,4}$/.test(apartamento)) {
      reiniciarAutoriza();
      return;
    }

    autorizaApartamento = apartamento;
    var miPeticion = ++autorizaPeticion;
    limpiarAutoriza('Cargando residentes…');
    estadoAutoriza('');

    apiFetch('/api/v1/vigilancia/apartamentos/' + encodeURIComponent(apartamento) + '/residentes')
      .then(function (body) {
        if (miPeticion !== autorizaPeticion) return;
        var residentes = (body.data && body.data.residentes) || [];
        if (!residentes.length) {
          limpiarAutoriza('Sin residentes registrados');
          estadoAutoriza('Este apartamento no tiene personas registradas. Avisa a administración.');
          return;
        }
        $('vehAutoriza').innerHTML = '<option value="">Selecciona quién autoriza…</option>' +
          residentes.map(function (residente) {
            return '<option value="' + esc(residente.persona.id) + '">' +
              esc(residente.persona.nombreCompleto) + ' · ' + esc(residente.tipoRelacion) + '</option>';
          }).join('');
        $('vehAutoriza').disabled = false;
        estadoAutoriza(residentes.length + ' persona(s) en el apartamento.');
      })
      .catch(function (error) {
        if (miPeticion !== autorizaPeticion) return;
        autorizaApartamento = '';
        limpiarAutoriza('No fue posible cargar los residentes');
        estadoAutoriza(error.message);
      });
  }

  // Si un residente ya pre-autorizó la placa desde su portal, el vigilante no llena nada más: la
  // autorización ya dice qué apartamento responde y quién la dio.
  var preautorizadaPlaca = '';
  var preautorizadaPeticion = 0;

  function mostrarPreautorizada(datos) {
    var caja = $('vehPreautorizada');
    if (!datos || !datos.autorizada) {
      caja.classList.add('hidden');
      caja.textContent = '';
      return;
    }
    caja.innerHTML = '<i class="bi bi-check-circle me-1"></i>Ya autorizada por ' +
      esc(datos.autorizadaPor || 'un residente') +
      ' del apartamento <strong>' + esc(datos.apartamento || '—') + '</strong>' +
      (datos.vigenteHasta ? ', hasta ' + esc(formatFechaCorta(datos.vigenteHasta)) : '') +
      '. No necesitas registrarla.';
    caja.classList.remove('hidden');
  }

  function consultarPreautorizacion() {
    var placa = normalizarPlaca($('vehPlaca').value);
    if (placa === preautorizadaPlaca) return;
    preautorizadaPlaca = placa;
    if (!placa) {
      mostrarPreautorizada(null);
      return;
    }

    var miPeticion = ++preautorizadaPeticion;
    apiFetch('/api/v1/vigilancia/parqueadero-visitantes/autorizacion-vigente?placa=' + encodeURIComponent(placa))
      .then(function (body) {
        if (miPeticion !== preautorizadaPeticion) return;
        mostrarPreautorizada(body.data);
      })
      .catch(function () {
        // Es una ayuda, no un requisito: si falla, el vigilante registra como siempre.
        if (miPeticion !== preautorizadaPeticion) return;
        preautorizadaPlaca = '';
        mostrarPreautorizada(null);
      });
  }

  // Quien autoriza solo aplica a visitantes.
  function sincronizarAutoriza() {
    var esVisitante = $('vehTipoVinculo').value === 'VISITANTE';
    $('vehAutorizaBloque').classList.toggle('hidden', !esVisitante);
    if (esVisitante) cargarAutorizantes();
  }

  // El tipo se deduce del formato de la placa (ABC123 = carro, ABC12D = moto) y el vigilante puede
  // corregirlo. Una placa como ELECTRICO / SIN PLACA no permite deducir nada: se deja lo elegido.
  function tipoPorPlaca(placa) {
    if (/^[A-Z]{3}\d{3}$/.test(placa)) return 'CARRO';
    if (/^[A-Z]{3}\d{2}[A-Z]$/.test(placa)) return 'MOTO';
    return null;
  }

  var tipoCorregidoPara = null;

  function placaNormalizada() {
    return normalizarPlaca($('vehPlaca').value);
  }

  function detectarTipoVehiculo() {
    var placa = placaNormalizada();
    var tipo = tipoPorPlaca(placa);
    var ayuda = $('vehTipoAyuda');

    if (!tipo) {
      ayuda.textContent = placa
        ? 'No se puede deducir de esta placa; elige el tipo.'
        : 'Se reconoce por el formato de la placa; puedes cambiarlo.';
      return;
    }
    // Si el vigilante lo corrigió para esta misma placa, se respeta; con otra placa se vuelve a deducir.
    if (tipoCorregidoPara === placa) return;
    $('vehTipoVehiculo').value = tipo;
    ayuda.textContent = 'Reconocido por la placa: ' + (tipo === 'MOTO' ? 'moto' : 'carro') + '. Puedes cambiarlo.';
  }

  function registrarVehiculo(event) {
    event.preventDefault();
    registroHideMsg();

    if (!$('confirmVehicleRegistration').checked) {
      registroMsg('Confirma que revisaste la información.', 'warning');
      return;
    }

    var apartment = $('vehApartment').value.trim();
    if (!/^\d{1,4}$/.test(apartment)) {
      registroMsg('El apartamento debe tener entre 1 y 4 dígitos.', 'warning');
      return;
    }

    var tipoVehiculo = $('vehTipoVehiculo').value;
    var placa = normalizarPlaca($('vehPlaca').value);
    if (!placaValida(placa, tipoVehiculo)) {
      registroMsg('La placa no corresponde al formato del tipo de vehículo (o escribe ELECTRICO / SIN PLACA).', 'warning');
      return;
    }

    var tipoVinculo = $('vehTipoVinculo').value;
    var autoriza = $('vehAutoriza').value;
    if (tipoVinculo === 'VISITANTE' && !autoriza) {
      registroMsg('Indica qué residente autoriza el ingreso del visitante.', 'warning');
      return;
    }

    var button = $('registerVehicleBtn');
    busy(button, true, 'Registrando…');

    apiFetch('/api/v1/vigilancia/registrar-vehiculo', {
      method: 'POST',
      body: {
        apartamento: apartment,
        tipoVehiculo: tipoVehiculo,
        tipoVinculo: tipoVinculo,
        placa: placa,
        autorizadoPorPersonaId: autoriza || undefined
      }
    }).then(function (body) {
      renderRegistroResultado(body.data);
      $('vehicleRegistrationForm').reset();
      reiniciarAutoriza();
      sincronizarAutoriza();
      tipoCorregidoPara = null;
      detectarTipoVehiculo();
      preautorizadaPlaca = '';
      mostrarPreautorizada(null);
      registroMsg('El vehículo fue registrado correctamente.', 'success');
      reporteDesactualizado = true;
    }).catch(function (error) {
      registroMsg(error.message);
    }).then(function () {
      busy(button, false, 'Registrar vehículo');
    });
  }

  function renderRegistroResultado(data) {
    $('vehicleRegistrationResult').innerHTML =
      '<article class="surface registration-result p-4">' +
      '<h3 class="h5 text-success fw-bold">' +
      '<i class="bi bi-check-circle-fill me-2"></i>' +
      'Registro completado' +
      '</h3>' +
      '<p class="mb-0">Vehículo <span class="plate">' + esc(data.placa) + '</span> (' + esc(data.tipoVehiculo) + ') quedó registrado en el apartamento ' +
      '<strong>' + esc(data.codigoOficial) + '</strong> como ' + esc(data.tipoVinculo) + '.</p>' +
      '</article>';
  }

  // ===== Reporte =====

  function setRango(tipo) {
    var hoy = new Date();
    var desde;
    var hasta;
    if (tipo === 'mesAnterior') {
      desde = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
      hasta = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
    } else if (tipo === '30') {
      desde = new Date(hoy);
      desde.setDate(desde.getDate() - 29);
      hasta = hoy;
    } else {
      desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      hasta = hoy;
    }
    $('vrDesde').value = toIsoDate(desde);
    $('vrHasta').value = toIsoDate(hasta);
  }

  function formatFecha(value) {
    if (!value) return '';
    var date = new Date(value);
    if (isNaN(date.getTime())) return value;
    return date.toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    });
  }

  function origenLabel(origen) {
    return ORIGENES[origen] || 'Importación';
  }

  function filtrados() {
    var movimiento = $('vrFiltroMovimiento').value;
    var texto = $('vrFiltroTexto').value.trim().toUpperCase();
    return movimientos.filter(function (m) {
      if (movimiento && m.movimiento !== movimiento) return false;
      if (!texto) return true;
      var placa = (m.vehiculo && m.vehiculo.placa) || '';
      var unidad = (m.unidad && m.unidad.codigoOficial) || '';
      return placa.toUpperCase().indexOf(texto) !== -1 || unidad.toUpperCase().indexOf(texto) !== -1;
    });
  }

  function render() {
    var filas = filtrados();
    $('vrFilas').innerHTML = filas.map(function (m) {
      var v = m.vehiculo || {};
      var asignado = m.movimiento === 'ASIGNADO';
      return '<tr>' +
        '<td class="text-nowrap">' + esc(formatFecha(m.fecha)) + '</td>' +
        '<td><span class="badge ' + (asignado ? 'text-bg-success' : 'text-bg-secondary') + '">' + (asignado ? 'Asignado' : 'Desasignado') + '</span></td>' +
        '<td>' + esc((m.unidad && m.unidad.codigoOficial) || '—') + '</td>' +
        '<td class="vr-placa">' + esc(v.placa) + '</td>' +
        '<td>' + esc(v.tipoVehiculo || '—') + '</td>' +
        '<td>' + esc(m.tipoVinculo) + '</td>' +
        '<td>' + esc(m.estadoVinculo) + '</td>' +
        '<td>' + esc(origenLabel(m.origenRegistro)) + '</td>' +
        '<td>' + (v.activo ? '<i class="bi bi-check-circle-fill text-success" title="Sí"></i>' : '<i class="bi bi-x-circle text-muted" title="No"></i>') + '</td>' +
        '</tr>';
    }).join('');

    var hayDatos = movimientos.length > 0;
    show('vrResultado', filas.length > 0);
    show('vrEmpty', !hayDatos);
    $('vrConteoVisible').textContent = hayDatos
      ? (filas.length === movimientos.length ? movimientos.length + ' movimientos' : filas.length + ' de ' + movimientos.length + ' movimientos')
      : '';
    $('vrDescargar').disabled = filas.length === 0;
  }

  function consultar() {
    var desde = $('vrDesde').value;
    var hasta = $('vrHasta').value;
    if (!desde || !hasta) {
      $('vrError').textContent = 'Selecciona la fecha inicial y final.';
      show('vrError', true);
      return;
    }
    if (desde > hasta) {
      $('vrError').textContent = 'La fecha inicial no puede ser posterior a la final.';
      show('vrError', true);
      return;
    }

    show('vrError', false);
    show('vrEmpty', false);
    show('vrTruncado', false);
    show('vrLoading', true);
    $('vrConsultar').disabled = true;
    reporteDesactualizado = false;

    apiFetch('/api/v1/vigilancia/reportes/vehiculos?desde=' + encodeURIComponent(desde) + '&hasta=' + encodeURIComponent(hasta))
      .then(function (body) {
        var data = body.data;
        movimientos = data.movimientos || [];
        rangoActual = { desde: data.desde, hasta: data.hasta };
        $('vrTotalAsignados').textContent = data.totales.asignados;
        $('vrTotalDesasignados').textContent = data.totales.desasignados;
        show('vrTruncado', Boolean(data.truncado));
        render();
      }).catch(function (error) {
        movimientos = [];
        render();
        show('vrEmpty', false);
        $('vrError').textContent = error.message;
        show('vrError', true);
      }).then(function () {
        show('vrLoading', false);
        $('vrConsultar').disabled = false;
      });
  }

  function csvCell(value) {
    var text = String(value == null ? '' : value);
    return /[";\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function descargarCsv() {
    var filas = filtrados();
    if (!filas.length) return;
    var encabezado = ['Fecha', 'Movimiento', 'Apartamento', 'Placa', 'Tipo vehículo', 'Vínculo', 'Estado vínculo', 'Origen', 'Estado vehículo', 'Vehículo activo', 'Fuentes', 'Vigente desde', 'Vigente hasta', 'Creación vehículo'];
    var lineas = filas.map(function (m) {
      var v = m.vehiculo || {};
      return [
        formatFecha(m.fecha),
        m.movimiento === 'ASIGNADO' ? 'Asignado' : 'Desasignado',
        (m.unidad && m.unidad.codigoOficial) || '',
        v.placa,
        v.tipoVehiculo,
        m.tipoVinculo,
        m.estadoVinculo,
        origenLabel(m.origenRegistro),
        v.estadoVehiculo,
        v.activo ? 'Sí' : 'No',
        v.fuentes,
        formatFecha(m.vigenteDesde),
        formatFecha(m.vigenteHasta),
        formatFecha(v.fechaCreacion)
      ].map(csvCell).join(';');
    });
    var csv = '﻿' + [encabezado.join(';')].concat(lineas).join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'reporte-vehiculos-' + (rangoActual ? rangoActual.desde + '_' + rangoActual.hasta : toIsoDate(new Date())) + '.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
  }

  // ===== Sanciones (parqueadero de visitantes) =====

  var RUTA_REGISTROS = '/api/v1/vigilancia/parqueadero-visitantes/registros';

  function setRangoSanciones(tipo) {
    var hoy = new Date();
    var desde;
    if (tipo === 'anoche') {
      // La ronda nocturna cruza la medianoche: hoy y ayer.
      desde = new Date(hoy);
      desde.setDate(desde.getDate() - 1);
    } else if (tipo === '7') {
      desde = new Date(hoy);
      desde.setDate(desde.getDate() - 6);
    } else {
      desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    }
    $('vsDesde').value = toIsoDate(desde);
    $('vsHasta').value = toIsoDate(hoy);
  }

  function sancionesFiltrados() {
    var texto = $('vsFiltroTexto').value.trim().toUpperCase();
    var soloSin = $('vsSoloSinApartamento').checked;
    return registrosSancion.filter(function (r) {
      if (soloSin && r.apartamento) return false;
      if (!texto) return true;
      return r.placa.indexOf(texto) !== -1 || String(r.apartamento || '').toUpperCase().indexOf(texto) !== -1;
    });
  }

  function lineaApartamento(r) {
    if (editandoId === r.id) {
      return '<form class="d-flex flex-wrap gap-2 align-items-center mt-1" data-vs-form="' + esc(r.id) + '">' +
        '<input class="form-control form-control-sm" style="width:9rem" inputmode="numeric" maxlength="4" ' +
        'placeholder="Apartamento" aria-label="Apartamento" required data-vs-input>' +
        '<button type="submit" class="btn btn-primary btn-sm" title="Guardar" aria-label="Guardar"><i class="bi bi-check-lg"></i></button>' +
        '<button type="button" class="btn btn-outline-secondary btn-sm" title="Cancelar" aria-label="Cancelar" data-vs-cancelar><i class="bi bi-x-lg"></i></button>' +
        '<span class="text-danger w-100" data-vs-error></span>' +
        '</form>';
    }
    if (r.apartamento) {
      // Quién lo asignó a mano va en el title: en el celular, menos texto.
      return '<div><i class="bi bi-house-door me-1"></i><strong>' + esc(r.apartamento) + '</strong>' +
        (r.apartamentoAsignadoPor
          ? ' <i class="bi bi-person-check text-muted" title="Asignado por ' + esc(r.apartamentoAsignadoPor) + '" ' +
            'aria-label="Asignado por ' + esc(r.apartamentoAsignadoPor) + '"></i>'
          : '') +
        '</div>';
    }
    return '<div class="text-danger">Sin apartamento' +
      '<button type="button" class="btn btn-link btn-sm p-0 ms-2 align-baseline" data-vs-editar="' + esc(r.id) + '" ' +
      'title="Asignar apartamento" aria-label="Asignar apartamento a ' + esc(r.placa) + '">' +
      '<i class="bi bi-pencil-square"></i></button></div>';
  }

  function formatFechaCorta(value) {
    return new Date(value).toLocaleString('es-CO', {
      timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false
    }).replace(',', '');
  }

  function renderSanciones() {
    var filas = sancionesFiltrados();
    $('vsTotal').textContent = registrosSancion.length;
    $('vsCarros').textContent = registrosSancion.filter(function (r) { return r.tipoVehiculo === 'CARRO'; }).length;
    $('vsMotos').textContent = registrosSancion.filter(function (r) { return r.tipoVehiculo === 'MOTO'; }).length;
    $('vsSinApartamento').textContent = registrosSancion.filter(function (r) { return !r.apartamento; }).length;
    $('vsConteoVisible').textContent = registrosSancion.length && filas.length !== registrosSancion.length
      ? filas.length + ' de ' + registrosSancion.length
      : '';

    $('vsLista').innerHTML = filas.map(function (r) {
      var procesado = Boolean(r.fechaPosprocesamiento);
      var estado = procesado ? 'Procesado' : 'Por procesar';
      var tipo = r.tipoVehiculo === 'MOTO' ? 'Moto' : 'Carro';
      return '<div class="vs-item">' +
        '<button type="button" class="vs-foto" data-vs-foto="' + esc(r.id) + '"' + (r.miniatura ? '' : ' data-vs-sin-miniatura') +
        ' aria-label="Ver foto de ' + esc(r.placa) + '">' +
        (r.miniatura ? '<img src="' + esc(r.miniatura) + '" alt="">' : '<i class="bi bi-image fs-4"></i>') +
        '</button>' +
        '<div class="flex-grow-1 small">' +
        '<div><span class="vs-placa">' + esc(r.placa) + '</span> ' +
        '<span class="text-muted"><i class="bi ' + (tipo === 'Moto' ? 'bi-scooter' : 'bi-car-front') + '" title="' + tipo + '" aria-label="' + tipo + '"></i> ' +
        esc(formatFechaCorta(r.fechaCaptura)) + '</span></div>' +
        lineaApartamento(r) +
        '<div class="text-muted"><i class="bi bi-person-badge me-1" aria-label="Vigilante"></i>' + esc(r.vigilanteNombre) + '</div>' +
        '</div>' +
        '<span class="badge ' + (procesado ? 'text-bg-success' : 'text-bg-secondary') + '" title="' + estado + '" aria-label="' + estado + '">' +
        '<i class="bi ' + (procesado ? 'bi-check2' : 'bi-clock-history') + '"></i></span>' +
        '</div>';
    }).join('');

    var input = $('vsLista').querySelector('[data-vs-input]');
    if (input) input.focus();
    cargarMiniaturasFaltantes();
  }

  function consultarSanciones() {
    var desde = $('vsDesde').value;
    var hasta = $('vsHasta').value;
    if (!desde || !hasta || desde > hasta) {
      $('vsError').textContent = 'Revisa el rango de fechas.';
      show('vsError', true);
      return;
    }
    show('vsError', false);
    show('vsEmpty', false);
    show('vsTruncado', false);
    show('vsLoading', true);
    $('vsConsultar').disabled = true;
    editandoId = null;

    apiFetch(RUTA_REGISTROS + '?desde=' + encodeURIComponent(desde) + '&hasta=' + encodeURIComponent(hasta))
      .then(function (body) {
        registrosSancion = body.data.registros || [];
        show('vsTruncado', Boolean(body.data.truncado));
        show('vsEmpty', registrosSancion.length === 0);
      }).catch(function (error) {
        registrosSancion = [];
        $('vsError').textContent = error.message;
        show('vsError', true);
      }).then(function () {
        renderSanciones();
        show('vsLoading', false);
        $('vsConsultar').disabled = false;
      });
  }

  function guardarApartamento(form) {
    var id = form.dataset.vsForm;
    var apartamento = form.querySelector('[data-vs-input]').value.trim();
    var errorBox = form.querySelector('[data-vs-error]');
    if (!/^\d{1,4}$/.test(apartamento)) {
      errorBox.textContent = 'Solo números.';
      return;
    }
    var boton = form.querySelector('button[type="submit"]');
    busy(boton, true, '');
    apiFetch(RUTA_REGISTROS + '/' + encodeURIComponent(id) + '/apartamento', {
      method: 'PATCH',
      body: { apartamento: apartamento }
    }).then(function (body) {
      registrosSancion.forEach(function (r) {
        if (r.id === id) {
          r.apartamento = body.data.apartamento;
          r.apartamentoAsignadoPor = body.data.apartamentoAsignadoPor;
        }
      });
      editandoId = null;
      renderSanciones();
    }).catch(function (error) {
      errorBox.textContent = error.message;
      busy(boton, false, '');
    });
  }

  // La foto vive en un bucket privado: se pide a la API con el token y se guarda como blob URL, que
  // sirve para el visor y como miniatura de los registros que no tienen una.
  function fotoUrl(id) {
    if (!fotosUrl[id]) {
      fotosUrl[id] = getAuthToken().then(function (token) {
        return fetch(API_BASE + RUTA_REGISTROS + '/' + encodeURIComponent(id) + '/foto', {
          headers: { Authorization: 'Bearer ' + token }
        });
      }).then(function (res) {
        if (!res.ok) throw new Error('No se pudo cargar la foto.');
        return res.blob();
      }).then(function (blob) {
        return URL.createObjectURL(blob);
      }).catch(function (error) {
        delete fotosUrl[id];
        throw error;
      });
    }
    return fotosUrl[id];
  }

  // Registros sin miniatura (tomados antes de que el lector la enviara): se usa la foto completa,
  // cargada solo cuando la fila se acerca a la pantalla.
  function cargarMiniaturasFaltantes() {
    var botones = Array.prototype.slice.call($('vsLista').querySelectorAll('[data-vs-sin-miniatura]'));
    if (observadorMiniaturas) observadorMiniaturas.disconnect();
    function cargar(boton) {
      fotoUrl(boton.dataset.vsFoto).then(function (url) {
        if (boton.isConnected) boton.innerHTML = '<img src="' + esc(url) + '" alt="">';
      }).catch(function () { /* queda el ícono; el visor mostrará el error */ });
    }
    if (!('IntersectionObserver' in window)) {
      botones.forEach(cargar);
      return;
    }
    observadorMiniaturas = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (entrada) {
        if (!entrada.isIntersecting) return;
        observadorMiniaturas.unobserve(entrada.target);
        cargar(entrada.target);
      });
    }, { rootMargin: '200px' });
    botones.forEach(function (boton) { observadorMiniaturas.observe(boton); });
  }

  function verFoto(id) {
    var registro = registrosSancion.filter(function (r) { return r.id === id; })[0];
    var img = $('vsVisorImg');
    show('vsVisor', true);
    show('vsVisorCargando', true);
    show('vsVisorImg', false);
    $('vsVisorTexto').textContent = registro
      ? registro.placa + ' · ' + formatFechaCorta(registro.fechaCaptura) + (registro.apartamento ? ' · ' + registro.apartamento : '')
      : '';
    fotoUrl(id).then(function (url) {
      img.src = url;
      show('vsVisorImg', true);
    }).catch(function (error) {
      $('vsVisorTexto').textContent = error.message;
    }).then(function () {
      show('vsVisorCargando', false);
    });
  }

  function cerrarFoto() {
    show('vsVisor', false);
  }

  function alClicSanciones(event) {
    var foto = event.target.closest('[data-vs-foto]');
    if (foto) {
      verFoto(foto.dataset.vsFoto);
      return;
    }
    var editar = event.target.closest('[data-vs-editar]');
    if (editar) {
      editandoId = editar.dataset.vsEditar;
      renderSanciones();
      return;
    }
    if (event.target.closest('[data-vs-cancelar]')) {
      editandoId = null;
      renderSanciones();
    }
  }

  // ===== Init =====

  // ===== Controversias de residentes — solo administración =====

  var RUTA_CONTROVERSIAS = '/api/v1/vigilancia/parqueadero-visitantes/controversias';
  var controversias = [];

  function avisoControversias(mensaje, tipo) {
    var caja = $('vkAlert');
    caja.className = 'alert alert-' + (tipo || 'danger');
    caja.textContent = mensaje;
    caja.classList.remove('hidden');
  }

  function contextoVinculo(vinculo) {
    if (!vinculo) {
      return '<p class="small-note mb-0"><i class="bi bi-exclamation-triangle me-1"></i>' +
        'Sin vínculo congelado: el apartamento se asignó a mano o el registro es anterior a este dato.</p>';
    }
    // Un vínculo retirado después de la foto es la huella de un intento de evadir la sanción.
    var alerta = vinculo.retiradoTrasLaCaptura
      ? '<div class="alert alert-warning py-2 px-3 small mb-2">' +
        '<i class="bi bi-exclamation-triangle me-1"></i>El vínculo se retiró <strong>después</strong> de la captura' +
        (vinculo.retiradoPor ? ', por ' + esc(vinculo.retiradoPor) : '') + '.</div>'
      : '';
    return alerta +
      '<p class="small-note mb-0">' +
      'Vínculo: <strong>' + esc(vinculo.tipoVinculo) + '</strong>' +
      ' · ' + esc(vinculo.estadoVinculo) +
      (vinculo.apartamento ? ' · Apto ' + esc(vinculo.apartamento) : '') +
      ' · desde ' + esc(formatFechaCorta(vinculo.vigenteDesde)) +
      (vinculo.vigenteHasta ? ' hasta ' + esc(formatFechaCorta(vinculo.vigenteHasta)) : ' (vigente)') +
      (vinculo.autorizadoPor ? ' · autorizó ' + esc(vinculo.autorizadoPor) : '') +
      '</p>';
  }

  function renderControversias() {
    show('vkEmpty', controversias.length === 0);
    $('vkLista').innerHTML = controversias.map(function (item) {
      var pendiente = item.estado === 'PENDIENTE';
      // Botones explícitos, no un form: con submit, Enter en el campo aceptaría la controversia sin
      // querer, y aceptar desasocia el registro del apartamento.
      var acciones = pendiente
        ? '<div class="row g-2 align-items-end mt-2" data-vk-item="' + esc(item.id) + '">' +
          '<div class="col-md-8">' +
          '<label class="form-label small mb-1" for="vkMotivo' + esc(item.id) + '">Motivo de la decisión</label>' +
          '<input id="vkMotivo' + esc(item.id) + '" class="form-control form-control-sm" data-vk-motivo minlength="10" maxlength="2000">' +
          '</div>' +
          '<div class="col-md-4 d-flex gap-2">' +
          '<button type="button" class="btn btn-success btn-sm flex-grow-1" data-vk-decision="ACEPTAR">Aceptar</button>' +
          '<button type="button" class="btn btn-outline-danger btn-sm flex-grow-1" data-vk-decision="RECHAZAR">Rechazar</button>' +
          '</div></div>'
        : '<p class="small-note mb-0 mt-2">' +
          (item.estado === 'ACEPTADA' ? 'Aceptada' : 'Rechazada') +
          (item.resueltaPor ? ' por ' + esc(item.resueltaPor) : '') +
          (item.fechaResolucion ? ' · ' + esc(formatFechaCorta(item.fechaResolucion)) : '') +
          (item.motivoResolucion ? '<br>' + esc(item.motivoResolucion) : '') +
          '</p>';

      return '<div class="vs-item flex-column align-items-stretch">' +
        '<div class="d-flex flex-wrap align-items-center gap-2">' +
        '<span class="vs-placa">' + esc(item.placa) + '</span>' +
        '<i class="bi ' + (item.tipoVehiculo === 'MOTO' ? 'bi-scooter' : 'bi-car-front') + '"></i>' +
        '<span class="small-note">' + esc(formatFechaCorta(item.fechaCaptura)) + '</span>' +
        '<span class="small-note"><i class="bi bi-house me-1"></i>' + esc(item.apartamento || 'Sin apartamento') + '</span>' +
        (item.origenAsignacion ? '<span class="badge text-bg-secondary">' + esc(item.origenAsignacion) + '</span>' : '') +
        (item.procesado ? '<span class="badge text-bg-success">Procesado</span>' : '<span class="badge text-bg-secondary">Por procesar</span>') +
        '</div>' +
        '<p class="mb-1 mt-2"><strong>' + esc(item.presentadaPor || 'Residente') + '</strong> ' +
        '<span class="small-note">' + esc(formatFechaCorta(item.fecha)) + '</span></p>' +
        '<div class="locked rounded p-2 small">' + esc(item.texto || '') + '</div>' +
        '<div class="mt-2">' + contextoVinculo(item.vinculo) + '</div>' +
        acciones +
        '</div>';
    }).join('');
  }

  function cargarControversias() {
    show('vkLoading', true);
    show('vkError', false);
    show('vkEmpty', false);
    $('vkAlert').classList.add('hidden');
    $('vkLista').innerHTML = '';

    return apiFetch(RUTA_CONTROVERSIAS + '?estado=' + encodeURIComponent($('vkEstado').value))
      .then(function (body) {
        controversias = (body.data && body.data.controversias) || [];
        show('vkLoading', false);
        renderControversias();
      })
      .catch(function (error) {
        show('vkLoading', false);
        $('vkError').textContent = error.message;
        show('vkError', true);
      });
  }

  function resolverControversia(fila, decision) {
    var id = fila.dataset.vkItem;
    var motivo = fila.querySelector('[data-vk-motivo]').value.trim();
    if (motivo.length < 10) {
      avisoControversias('Escribe el motivo de la decisión (mínimo 10 caracteres).');
      return;
    }

    var boton = fila.querySelector('[data-vk-decision="' + decision + '"]');
    busy(boton, true, 'Guardando…');

    apiFetch(RUTA_CONTROVERSIAS + '/' + encodeURIComponent(id) + '/resolucion', {
      method: 'POST',
      body: { decision: decision, motivo: motivo }
    })
      .then(function () {
        avisoControversias(
          decision === 'ACEPTAR'
            ? 'Controversia aceptada: el registro quedó sin apartamento y se puede reasignar.'
            : 'Controversia rechazada.',
          'success'
        );
        // Aceptar deja el registro sin apartamento, y el listado de arriba lo muestra.
        if (sancionesIniciado) consultarSanciones();
        return cargarControversias();
      })
      .catch(function (error) {
        avisoControversias(error.message);
        busy(boton, false, decision === 'ACEPTAR' ? 'Aceptar' : 'Rechazar');
      });
  }

  // ===== Configuración (tarifas y días de gracia) — solo administración =====

  var RUTA_TARIFAS = '/api/v1/vigilancia/parqueadero-visitantes/tarifas';

  function etiquetaTipo(tipo) {
    return tipo === 'MOTO' ? 'Motos' : 'Carros';
  }

  function avisoConfiguracion(mensaje, tipo) {
    var caja = $('vcAlert');
    caja.className = 'alert alert-' + (tipo || 'danger');
    caja.textContent = mensaje;
    caja.classList.remove('hidden');
  }

  function renderTarifas() {
    $('vcTarifas').innerHTML = tarifas.map(function (tarifa) {
      var tipo = esc(tarifa.tipoVehiculo);
      var meta = tarifa.actualizadoPorNombre
        ? 'Última modificación: ' + esc(tarifa.actualizadoPorNombre) + ' · ' + esc(formatFechaCorta(tarifa.fechaActualizacion))
        : 'Sin configurar';
      return '<div class="col-md-6">' +
        '<div class="vc-card">' +
        '<h5 class="h6 mb-3"><i class="bi ' + (tarifa.tipoVehiculo === 'MOTO' ? 'bi-scooter' : 'bi-car-front') + ' me-2"></i>' + esc(etiquetaTipo(tarifa.tipoVehiculo)) + '</h5>' +
        '<div class="mb-2">' +
        '<label class="form-label small" for="vcValor' + tipo + '">Valor de la sanción (COP)</label>' +
        '<input id="vcValor' + tipo + '" class="form-control form-control-sm" type="number" min="0" step="100" required ' +
        'data-vc-campo="valorSancion" data-vc-tipo="' + tipo + '" value="' + (tarifa.valorSancion == null ? '' : esc(tarifa.valorSancion)) + '">' +
        '</div>' +
        '<div class="row g-2">' +
        '<div class="col-6">' +
        '<label class="form-label small" for="vcGraciaVis' + tipo + '">Días de gracia · visitante</label>' +
        '<input id="vcGraciaVis' + tipo + '" class="form-control form-control-sm" type="number" min="0" max="60" required ' +
        'data-vc-campo="diasGraciaVisitante" data-vc-tipo="' + tipo + '" value="' + (tarifa.diasGraciaVisitante == null ? '' : esc(tarifa.diasGraciaVisitante)) + '">' +
        '</div>' +
        '<div class="col-6">' +
        '<label class="form-label small" for="vcGraciaRes' + tipo + '">Días de gracia · residente</label>' +
        '<input id="vcGraciaRes' + tipo + '" class="form-control form-control-sm" type="number" min="0" max="60" required ' +
        'data-vc-campo="diasGraciaResidente" data-vc-tipo="' + tipo + '" value="' + (tarifa.diasGraciaResidente == null ? '' : esc(tarifa.diasGraciaResidente)) + '">' +
        '</div>' +
        '</div>' +
        '<p class="vc-meta mt-2 mb-0">' + meta + '</p>' +
        '</div></div>';
    }).join('');
  }

  var RUTA_CONFIGURACION = '/api/v1/vigilancia/parqueadero-visitantes/configuracion';

  function cargarTarifas() {
    show('vcLoading', true);
    show('vcError', false);
    show('vcForm', false);

    Promise.all([apiFetch(RUTA_TARIFAS), apiFetch(RUTA_CONFIGURACION)])
      .then(function (respuestas) {
        tarifas = (respuestas[0].data && respuestas[0].data.tarifas) || [];
        renderTarifas();
        var cfg = respuestas[1].data || {};
        $('vcMaxHoras').value = cfg.maxHorasAutorizacionVisitante == null ? '' : cfg.maxHorasAutorizacionVisitante;
        $('vcMaxHorasMeta').textContent = cfg.actualizadoPorNombre
          ? 'Última modificación: ' + cfg.actualizadoPorNombre
          : '';
        show('vcLoading', false);
        show('vcForm', true);
      })
      .catch(function (error) {
        show('vcLoading', false);
        $('vcError').textContent = error.message;
        show('vcError', true);
      });
  }

  function leerTarifa(tipo) {
    var valor = {};
    document.querySelectorAll('[data-vc-tipo="' + tipo + '"]').forEach(function (campo) {
      valor[campo.dataset.vcCampo] = Number(campo.value);
    });
    return valor;
  }

  function guardarTarifas(event) {
    event.preventDefault();
    $('vcAlert').classList.add('hidden');
    var boton = $('vcGuardarBtn');
    busy(boton, true, 'Guardando…');

    // Un PUT por tipo más el de la configuración global: la API valida y atribuye cada uno con el
    // actor del token.
    var peticiones = tarifas.map(function (tarifa) {
      return apiFetch(RUTA_TARIFAS + '/' + encodeURIComponent(tarifa.tipoVehiculo), {
        method: 'PUT',
        body: leerTarifa(tarifa.tipoVehiculo)
      });
    });
    peticiones.push(apiFetch(RUTA_CONFIGURACION, {
      method: 'PUT',
      body: { maxHorasAutorizacionVisitante: Number($('vcMaxHoras').value) }
    }));

    Promise.all(peticiones)
      .then(function () {
        avisoConfiguracion('Configuración guardada.', 'success');
        return cargarTarifas();
      })
      .catch(function (error) { avisoConfiguracion(error.message); })
      .then(function () { busy(boton, false, 'Guardar configuración'); });
  }

  function init() {
    if (!$('vehiculosRegistrarView')) return;

    $('showVehiculosRegistrar').addEventListener('click', function () { modoVehiculos('registrar'); });
    $('showVehiculosReporte').addEventListener('click', function () { modoVehiculos('reporte'); });

    $('vehApartment').addEventListener('input', function () {
      this.value = this.value.replace(/\D/g, '').slice(0, 4);
    });
    // Al salir del campo (o al cambiar la relación) se precargan los residentes del apartamento.
    $('vehApartment').addEventListener('change', sincronizarAutoriza);
    $('vehApartment').addEventListener('blur', sincronizarAutoriza);
    $('vehTipoVinculo').addEventListener('change', sincronizarAutoriza);
    $('vehPlaca').addEventListener('input', detectarTipoVehiculo);
    $('vehTipoVehiculo').addEventListener('change', function () {
      // Corrección manual: vale para la placa que hay escrita ahora.
      tipoCorregidoPara = placaNormalizada();
      $('vehTipoAyuda').textContent = 'Tipo elegido por ti.';
    });
    $('vehPlaca').addEventListener('change', consultarPreautorizacion);
    $('vehPlaca').addEventListener('blur', consultarPreautorizacion);
    sincronizarAutoriza();
    $('vehPlaca').addEventListener('input', function () {
      this.value = this.value.toUpperCase();
    });
    $('vehicleRegistrationForm').addEventListener('submit', registrarVehiculo);

    $('vrForm').addEventListener('submit', function (event) {
      event.preventDefault();
      consultar();
    });
    document.querySelectorAll('[data-vr-rango]').forEach(function (button) {
      button.addEventListener('click', function () {
        setRango(button.dataset.vrRango);
        consultar();
      });
    });
    $('vrFiltroMovimiento').addEventListener('change', render);
    $('vrFiltroTexto').addEventListener('input', render);
    $('vrDescargar').addEventListener('click', descargarCsv);

    $('showVehiculosSanciones').addEventListener('click', function () { modoVehiculos('sanciones'); });
    $('vsForm').addEventListener('submit', function (event) {
      event.preventDefault();
      consultarSanciones();
    });
    document.querySelectorAll('[data-vs-rango]').forEach(function (button) {
      button.addEventListener('click', function () {
        setRangoSanciones(button.dataset.vsRango);
        consultarSanciones();
      });
    });
    $('vsFiltroTexto').addEventListener('input', renderSanciones);
    $('vsSoloSinApartamento').addEventListener('change', renderSanciones);
    $('vsLista').addEventListener('click', alClicSanciones);
    $('vsLista').addEventListener('submit', function (event) {
      var form = event.target.closest('[data-vs-form]');
      if (!form) return;
      event.preventDefault();
      guardarApartamento(form);
    });
    $('vsLista').addEventListener('input', function (event) {
      if (event.target.matches('[data-vs-input]')) event.target.value = event.target.value.replace(/\D/g, '').slice(0, 4);
    });
    // Fuera de la vista para que position: fixed cubra toda la pantalla.
    document.body.appendChild($('vsVisor'));
    $('vsVisorCerrar').addEventListener('click', cerrarFoto);
    $('vsVisor').addEventListener('click', function (event) {
      if (event.target === this) cerrarFoto();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !$('vsVisor').classList.contains('hidden')) cerrarFoto();
    });

    // La pestaña Configuración solo se renderiza en administración: $() no comprueba null.
    if ($('showVehiculosConfiguracion')) {
      $('showVehiculosConfiguracion').addEventListener('click', function () { modoVehiculos('configuracion'); });
      $('vcForm').addEventListener('submit', guardarTarifas);
    }

    // El bloque de controversias tampoco existe en la página de vigilancia.
    if ($('vkLista')) {
      $('vkEstado').addEventListener('change', cargarControversias);
      $('vkRecargar').addEventListener('click', cargarControversias);
      $('vkLista').addEventListener('click', function (event) {
        var boton = event.target.closest('[data-vk-decision]');
        if (!boton) return;
        var fila = boton.closest('[data-vk-item]');
        if (fila) resolverControversia(fila, boton.dataset.vkDecision);
      });
    }
  }

  function mostrar() {
    if (!$('vehiculosRegistrarView')) return;
    modoVehiculos(subVista);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.BVVehiculos = { mostrar: mostrar };
}());
