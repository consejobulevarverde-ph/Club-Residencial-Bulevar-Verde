(function () {
  'use strict';

  var config = window.VEHICULOS_REPORTE_CONFIG || {};
  var API_BASE = config.apiBase || '';

  var ORIGENES = {
    WEB_VIGILANCIA: 'Vigilancia',
    AUTOSERVICIO_RESIDENTE: 'Residente'
  };

  var movimientos = [];
  var rangoActual = null;
  var iniciado = false;

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

  function toIsoDate(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

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

  function show(id, visible) {
    $(id).classList.toggle('hidden', !visible);
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

    getAuthToken().then(function (token) {
      var url = API_BASE + '/api/v1/vigilancia/reportes/vehiculos?desde=' + encodeURIComponent(desde) + '&hasta=' + encodeURIComponent(hasta);
      return fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) throw new Error((body.error && body.error.message) || 'No fue posible consultar el reporte.');
        return body.data;
      });
    }).then(function (data) {
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
    var encabezado = ['Fecha', 'Movimiento', 'Unidad', 'Placa', 'Tipo vehículo', 'Vínculo', 'Estado vínculo', 'Origen', 'Estado vehículo', 'Vehículo activo', 'Fuentes', 'Vigente desde', 'Vigente hasta', 'Creación vehículo'];
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

  function init() {
    if (!$('vrForm')) return;

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
  }

  function mostrar() {
    if (iniciado || !$('vrForm')) return;
    iniciado = true;
    setRango('mes');
    consultar();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.BVVehiculosReporte = { mostrar: mostrar };
}());
