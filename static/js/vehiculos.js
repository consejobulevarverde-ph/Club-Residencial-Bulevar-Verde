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
  var editandoId = null;

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
    var reporte = !registrar && !sanciones;
    show('vehiculosRegistrarView', registrar);
    show('vehiculosReporteView', reporte);
    show('vehiculosSancionesView', sanciones);
    $('showVehiculosRegistrar').classList.toggle('active', registrar);
    $('showVehiculosReporte').classList.toggle('active', reporte);
    $('showVehiculosSanciones').classList.toggle('active', sanciones);

    if (registrar) {
      $('vehApartment').focus();
    } else if (sanciones) {
      if (!sancionesIniciado) {
        sancionesIniciado = true;
        setRangoSanciones('mes');
        consultarSanciones();
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
    var placa = $('vehPlaca').value.trim().toUpperCase().replace(/\s+/g, ' ');
    if (!placaValida(placa, tipoVehiculo)) {
      registroMsg('La placa no corresponde al formato del tipo de vehículo (o escribe ELECTRICO / SIN PLACA).', 'warning');
      return;
    }

    var button = $('registerVehicleBtn');
    busy(button, true, 'Registrando…');

    apiFetch('/api/v1/vigilancia/registrar-vehiculo', {
      method: 'POST',
      body: {
        apartamento: apartment,
        tipoVehiculo: tipoVehiculo,
        tipoVinculo: $('vehTipoVinculo').value,
        placa: placa
      }
    }).then(function (body) {
      renderRegistroResultado(body.data);
      $('vehicleRegistrationForm').reset();
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
        '<button type="button" class="vs-foto" data-vs-foto="' + esc(r.id) + '" aria-label="Ver foto de ' + esc(r.placa) + '">' +
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

  // La foto vive en un bucket privado: se pide a la API con el token y se muestra como blob.
  function verFoto(id) {
    var registro = registrosSancion.filter(function (r) { return r.id === id; })[0];
    var img = $('vsVisorImg');
    show('vsVisor', true);
    show('vsVisorCargando', true);
    show('vsVisorImg', false);
    $('vsVisorTexto').textContent = registro
      ? registro.placa + ' · ' + formatFechaCorta(registro.fechaCaptura) + (registro.apartamento ? ' · ' + registro.apartamento : '')
      : '';
    getAuthToken().then(function (token) {
      return fetch(API_BASE + RUTA_REGISTROS + '/' + encodeURIComponent(id) + '/foto', {
        headers: { Authorization: 'Bearer ' + token }
      });
    }).then(function (res) {
      if (!res.ok) throw new Error('No se pudo cargar la foto.');
      return res.blob();
    }).then(function (blob) {
      if (img.src) URL.revokeObjectURL(img.src);
      img.src = URL.createObjectURL(blob);
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

  function init() {
    if (!$('vehiculosRegistrarView')) return;

    $('showVehiculosRegistrar').addEventListener('click', function () { modoVehiculos('registrar'); });
    $('showVehiculosReporte').addEventListener('click', function () { modoVehiculos('reporte'); });

    $('vehApartment').addEventListener('input', function () {
      this.value = this.value.replace(/\D/g, '').slice(0, 4);
    });
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
