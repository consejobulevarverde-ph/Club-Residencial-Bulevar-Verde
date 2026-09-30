(function () {
  'use strict';

  var API_BASE = (window.ADMIN_DATOS_CONFIG || {}).apiBase || 'http://localhost:8080';
  var INTERVALO_MS = 5 * 60 * 1000;

  var SERVICIOS = {
    drive: 'Subida de evidencias de convivencia (fotos, videos y PDF)'
  };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function pintar(fallas, revision) {
    var badge = document.getElementById('estadoSistemaBadge');
    var alerta = document.getElementById('estadoSistemaAlerta');
    if (!badge || !alerta) return;

    if (!fallas.length) {
      badge.innerHTML = '<span class="badge rounded-pill text-bg-light border text-success" title="' +
        esc('Revisión ' + revision) + '"><i class="bi bi-circle-fill me-1" style="font-size:.55rem;vertical-align:middle"></i>' +
        'Sistema operando normalmente</span>';
      alerta.classList.add('hidden');
      alerta.innerHTML = '';
      return;
    }

    badge.innerHTML = '<span class="badge rounded-pill text-bg-danger"><i class="bi bi-exclamation-triangle-fill me-1"></i>' +
      'La plataforma presenta fallas</span>';
    alerta.innerHTML = '<i class="bi bi-exclamation-octagon-fill fs-5"></i><div>' +
      '<strong>La plataforma está presentando fallas.</strong> Por favor contacte al desarrollador.' +
      '<ul class="mb-0 mt-1 small">' + fallas.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul></div>';
    alerta.classList.remove('hidden');
  }

  function verificar() {
    fetch(API_BASE + '/api/v1/health', { cache: 'no-store' })
      .then(function (resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      })
      .then(function (body) {
        var data = body.data || {};
        var checks = data.checks || {};
        var fallas = Object.keys(checks).filter(function (nombre) {
          return checks[nombre].status !== 'ok';
        }).map(function (nombre) {
          return (SERVICIOS[nombre] || nombre) + ' (código: ' + checks[nombre].code + ')';
        });
        pintar(fallas, data.revision || '');
      })
      .catch(function () {
        pintar(['No hay conexión con el servidor de la plataforma'], '');
      });
  }

  verificar();
  setInterval(verificar, INTERVALO_MS);
}());
