(function () {
  'use strict';

  var config = window.PQRS_GESTION_CONFIG || {};
  var LOG_PREFIX = '[BV:GestiónPQRS]';
  var storageKey = config.storageKey || 'bvMaintenanceManagementSession';
  var client = null;
  var session = { token: '', nombre: '', expiresAt: 0 };
  var reports = [];
  var selectedReport = null;
  var detailModal = null;

  var elements = {};

  function log(level, message, data) {
    var method = console[level] || console.log;
    if (typeof data === 'undefined') {
      method.call(console, LOG_PREFIX, new Date().toISOString(), message);
    } else {
      method.call(console, LOG_PREFIX, new Date().toISOString(), message, data);
    }
  }

  function $(id) {
    return document.getElementById(id);
  }

  function init() {
    elements = {
      alert: $('managementAlert'),
      loginPanel: $('managementLoginPanel'),
      appPanel: $('managementAppPanel'),
      loginForm: $('managementLoginForm'),
      technicianName: $('managementTechnicianName'),
      accessCode: $('managementAccessCode'),
      loginButton: $('managementLoginButton'),
      userName: $('managementUserName'),
      logoutButton: $('managementLogoutButton'),
      refreshButton: $('managementRefreshButton'),
      search: $('managementSearch'),
      statusFilter: $('managementStatusFilter'),
      reportList: $('managementReportList'),
      empty: $('managementEmpty'),
      loading: $('managementLoading'),
      metricOpen: $('metricOpen'),
      metricInProgress: $('metricInProgress'),
      metricClosed: $('metricClosed'),
      metricTotal: $('metricTotal'),
      detailTitle: $('managementDetailTitle'),
      detailBody: $('managementDetailBody'),
      closurePanel: $('managementClosurePanel'),
      closureForm: $('managementClosureForm'),
      responsible: $('managementResponsible'),
      observations: $('managementObservations'),
      closeConfirm: $('managementCloseConfirm'),
      closeButton: $('managementCloseButton')
    };

    client = new window.PortalBVClient(config.webAppUrl || '');
    detailModal = new bootstrap.Modal($('managementDetailModal'));

    elements.loginForm.addEventListener('submit', handleLogin);
    elements.logoutButton.addEventListener('click', handleLogout);
    elements.refreshButton.addEventListener('click', loadReports);
    elements.search.addEventListener('input', renderReports);
    elements.statusFilter.addEventListener('change', renderReports);
    elements.reportList.addEventListener('click', handleReportClick);
    elements.closureForm.addEventListener('submit', handleCloseReport);

    restoreSession();
  }

  function call(action, payload, timeoutMs) {
    payload = payload || {};
    log('info', 'Enviando acción a Apps Script.', {
      action: action,
      hasToken: Boolean(payload.token),
      reportId: payload.reportId || '',
      timeoutMs: timeoutMs || 90000
    });

    return client.callViaForm(action, payload, {
      parentOrigin: window.location.origin,
      timeoutMs: timeoutMs || 90000
    }).then(function (result) {
      log('info', 'Acción confirmada por Apps Script.', {
        action: action,
        ok: Boolean(result && result.ok),
        reportId: result && result.reportId ? result.reportId : ''
      });
      return result;
    }).catch(function (error) {
      log('error', 'La acción falló.', {
        action: action,
        message: error && error.message,
        code: error && error.code,
        stack: error && error.stack
      });
      throw error;
    });
  }

  function restoreSession() {
    var raw = sessionStorage.getItem(storageKey);
    if (!raw) {
      showPanel('login');
      return;
    }

    try {
      session = JSON.parse(raw);
    } catch (error) {
      sessionStorage.removeItem(storageKey);
      showPanel('login');
      return;
    }

    if (!session.token || Number(session.expiresAt || 0) <= Date.now()) {
      clearSession();
      showPanel('login');
      return;
    }

    elements.userName.textContent = session.nombre || 'Personal de mantenimiento';
    showPanel('app');
    loadReports().catch(function () {
      // loadReports ya maneja la visualización y el vencimiento.
    });
  }

  async function handleLogin(event) {
    event.preventDefault();
    hideAlert();

    if (!elements.loginForm.checkValidity()) {
      elements.loginForm.classList.add('was-validated');
      return;
    }

    setBusy(elements.loginButton, true, 'Ingresando…');

    try {
      var result = await call('iniciarSesionGestionMantenimiento', {
        nombre: elements.technicianName.value.trim(),
        clave: elements.accessCode.value
      }, 45000);

      if (!result || !result.ok || !result.token) {
        throw new Error('El servicio no confirmó el inicio de sesión.');
      }

      session = {
        token: result.token,
        nombre: result.nombre,
        expiresAt: Number(result.expiresAt || 0)
      };
      sessionStorage.setItem(storageKey, JSON.stringify(session));
      elements.accessCode.value = '';
      elements.userName.textContent = session.nombre;
      showPanel('app');
      await loadReports();
      showAlert('success', 'Ingreso correcto. Ya puedes gestionar los reportes de mantenimiento.');
    } catch (error) {
      showAlert('danger', error.message || 'No fue posible iniciar sesión.');
    } finally {
      setBusy(elements.loginButton, false);
    }
  }

  async function handleLogout() {
    try {
      if (session.token) {
        await call('cerrarSesionGestionMantenimiento', {
          token: session.token
        }, 30000);
      }
    } catch (error) {
      log('warn', 'No se confirmó el cierre remoto; se limpiará la sesión local.', error);
    }

    clearSession();
    reports = [];
    renderReports();
    showPanel('login');
    showAlert('info', 'La sesión fue cerrada.');
  }

  async function loadReports() {
    if (!session.token) return;

    setLoading(true);
    hideAlert();

    try {
      var result = await call('listarReportesMantenimiento', {
        token: session.token
      }, 90000);

      reports = Array.isArray(result && result.reportes)
        ? result.reportes
        : [];

      renderMetrics();
      renderReports();
      elements.userName.textContent = result.usuario || session.nombre;
    } catch (error) {
      if (isSessionError(error)) {
        clearSession();
        showPanel('login');
        showAlert('warning', error.message);
      } else {
        showAlert('danger', error.message || 'No fue posible cargar los reportes.');
      }
      throw error;
    } finally {
      setLoading(false);
    }
  }

  function renderMetrics() {
    var total = reports.length;
    var open = reports.filter(function (report) {
      return report.estado === 'Abierto' || report.estado === 'Asignado';
    }).length;
    var inProgress = reports.filter(function (report) {
      return report.estado === 'En proceso';
    }).length;
    var closed = reports.filter(function (report) {
      return report.estado === 'Cerrado' || report.estado === 'Resuelto';
    }).length;

    elements.metricOpen.textContent = open;
    elements.metricInProgress.textContent = inProgress;
    elements.metricClosed.textContent = closed;
    elements.metricTotal.textContent = total;
  }

  function renderReports() {
    if (!elements.reportList) return;

    var query = normalizeText(elements.search.value);
    var status = elements.statusFilter.value;

    var filtered = reports.filter(function (report) {
      if (status && report.estado !== status) return false;
      if (!query) return true;

      return normalizeText([
        report.reportId,
        report.reportadoPor,
        report.ubicacion,
        report.descripcion,
        report.responsable,
        report.prioridad
      ].join(' ')).indexOf(query) !== -1;
    });

    elements.empty.hidden = filtered.length !== 0;
    elements.reportList.innerHTML = filtered.map(renderReportCard).join('');
  }

  function renderReportCard(report) {
    var closed = report.estado === 'Cerrado' || report.estado === 'Resuelto';
    var badge = statusBadge(report.estado);
    var date = formatDate(report.fechaRecepcion || report.fechaReporte);

    return '<div class="col-12 col-lg-6">' +
      '<button type="button" class="report-card card w-100 h-100 text-start border-0 shadow-sm" data-report-id="' + esc(report.reportId) + '">' +
      '<div class="card-body">' +
      '<div class="d-flex justify-content-between align-items-start gap-3 mb-2">' +
      '<div><div class="small text-muted">' + esc(date) + '</div>' +
      '<h3 class="h6 fw-bold mb-0">' + esc(report.reportId) + '</h3></div>' +
      '<span class="badge ' + badge + '">' + esc(report.estado) + '</span>' +
      '</div>' +
      '<div class="fw-semibold text-success mb-2"><i class="bi bi-geo-alt me-1"></i>' + esc(report.ubicacion) + '</div>' +
      '<p class="mb-3 report-description">' + esc(report.descripcion) + '</p>' +
      '<div class="d-flex flex-wrap gap-2 small text-muted">' +
      '<span><i class="bi bi-person me-1"></i>' + esc(report.reportadoPor) + '</span>' +
      '<span><i class="bi bi-flag me-1"></i>' + esc(report.prioridad) + '</span>' +
      (report.fotos && report.fotos.length
        ? '<span><i class="bi bi-image me-1"></i>' + report.fotos.length + ' foto(s)</span>'
        : '') +
      (closed && report.responsable
        ? '<span><i class="bi bi-person-check me-1"></i>' + esc(report.responsable) + '</span>'
        : '') +
      '</div>' +
      '</div></button></div>';
  }

  function handleReportClick(event) {
    var button = event.target.closest('[data-report-id]');
    if (!button) return;
    openReport(button.dataset.reportId);
  }

  async function openReport(reportId) {
    hideAlert();
    elements.detailTitle.textContent = 'Cargando reporte…';
    elements.detailBody.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-success"></div></div>';
    elements.closurePanel.hidden = true;
    detailModal.show();

    try {
      var result = await call('obtenerReporteMantenimiento', {
        token: session.token,
        reportId: reportId
      }, 60000);

      selectedReport = result.reporte;
      renderDetail(selectedReport);
    } catch (error) {
      elements.detailBody.innerHTML = '<div class="alert alert-danger mb-0">' + esc(error.message) + '</div>';
      if (isSessionError(error)) {
        detailModal.hide();
        clearSession();
        showPanel('login');
      }
    }
  }

  function renderDetail(report) {
    var closed = report.estado === 'Cerrado' || report.estado === 'Resuelto';
    elements.detailTitle.textContent = report.reportId;

    var photoLinks = report.fotos && report.fotos.length
      ? '<div class="d-flex flex-wrap gap-3">' + report.fotos.map(renderEvidencePreview).join('') + '</div>'
      : '<span class="text-muted">Sin fotografías.</span>';

    elements.detailBody.innerHTML =
      '<div class="row g-3">' +
      detailField('Estado', '<span class="badge ' + statusBadge(report.estado) + '">' + esc(report.estado) + '</span>') +
      detailField('Prioridad', esc(report.prioridad)) +
      detailField('Fecha del reporte', esc(formatDate(report.fechaReporte))) +
      detailField('Fecha de recepción', esc(formatDate(report.fechaRecepcion))) +
      detailField('Reportado por', esc(report.reportadoPor), 'col-md-6') +
      detailField('Ubicación', esc(report.ubicacion), 'col-md-6') +
      detailField('Descripción', '<div class="preserve-lines">' + esc(report.descripcion) + '</div>', 'col-12') +
      detailField('Evidencias', photoLinks, 'col-12') +
      (report.responsable ? detailField('Responsable', esc(report.responsable), 'col-md-6') : '') +
      (report.fechaCierre ? detailField('Fecha de cierre', esc(formatDate(report.fechaCierre)), 'col-md-6') : '') +
      (report.observacionesGestion
        ? detailField('Historial de gestión', '<div class="preserve-lines">' + esc(report.observacionesGestion) + '</div>', 'col-12')
        : '') +
      '</div>';

    loadEvidencePreviews(report);

    elements.closurePanel.hidden = closed;
    if (!closed) {
      elements.responsible.value = session.nombre || report.responsable || '';
      elements.observations.value = '';
      elements.closeConfirm.checked = false;
      elements.closureForm.classList.remove('was-validated');
    }
  }

  async function handleCloseReport(event) {
    event.preventDefault();
    if (!selectedReport) return;

    if (!elements.closureForm.checkValidity()) {
      elements.closureForm.classList.add('was-validated');
      return;
    }

    setBusy(elements.closeButton, true, 'Finalizando…');

    try {
      var result = await call('finalizarReporteMantenimiento', {
        token: session.token,
        reportId: selectedReport.reportId,
        responsable: elements.responsible.value.trim(),
        observaciones: elements.observations.value.trim()
      }, 90000);

      if (!result || !result.ok) {
        throw new Error('El servicio no confirmó el cierre del reporte.');
      }

      selectedReport = result.reporte;
      renderDetail(selectedReport);
      try {
        await loadReports();
      } catch (refreshError) {
        log('warn', 'El cierre fue confirmado, pero no se pudo refrescar la lista.', refreshError);
      }
      showAlert('success', result.message || 'La atención quedó finalizada.');
    } catch (error) {
      if (isSessionError(error)) {
        detailModal.hide();
        clearSession();
        showPanel('login');
      }
      showAlert('danger', error.message || 'No fue posible finalizar la atención.');
    } finally {
      setBusy(elements.closeButton, false);
    }
  }

  function renderEvidencePreview(url, index) {
    var number = index + 1;
    var label = 'Foto ' + number;

    return '<a class="d-inline-flex flex-column align-items-center text-decoration-none evidence-preview-link" ' +
      'href="' + escAttr(url) + '" target="_blank" rel="noopener noreferrer" ' +
      'title="Abrir ' + escAttr(label) + ' en una pestaña nueva">' +
      '<span class="border border-success-subtle rounded overflow-hidden bg-light d-flex align-items-center justify-content-center shadow-sm" ' +
      'style="width:200px;height:200px;">' +
      '<img data-evidence-preview data-photo-index="' + number + '" alt="Previsualización de ' + escAttr(label) + '" ' +
      'width="200" height="200" decoding="async" ' +
      'style="width:200px;height:200px;object-fit:cover;display:block;" hidden>' +
      '<span data-evidence-loading class="text-success text-center px-3">' +
      '<span class="spinner-border spinner-border-sm d-block mx-auto mb-2" role="status" aria-hidden="true"></span>' +
      '<span class="small">Cargando imagen…</span></span>' +
      '<span data-evidence-fallback hidden class="text-success text-center px-3">' +
      '<i class="bi bi-image fs-1 d-block"></i><span class="small">Abrir evidencia</span></span>' +
      '</span>' +
      '<span class="small fw-semibold text-success mt-2">' + esc(label) +
      ' <i class="bi bi-box-arrow-up-right ms-1"></i></span>' +
      '</a>';
  }

  function loadEvidencePreviews(report) {
    if (!elements.detailBody || !report || !report.reportId) return;

    var images = Array.prototype.slice.call(
      elements.detailBody.querySelectorAll('[data-evidence-preview]')
    );

    images.forEach(function (image) {
      var photoIndex = Number(image.getAttribute('data-photo-index') || 0);
      var container = image.parentElement;
      var loading = container.querySelector('[data-evidence-loading]');
      var fallback = container.querySelector('[data-evidence-fallback]');

      function showFallback(message) {
        image.hidden = true;
        if (loading) loading.hidden = true;
        if (fallback) fallback.hidden = false;
        log('warn', message || 'No fue posible cargar la previsualización de la evidencia.', {
          reportId: report.reportId,
          photoIndex: photoIndex
        });
      }

      call('obtenerEvidenciaMantenimiento', {
        token: session.token,
        reportId: report.reportId,
        photoIndex: photoIndex
      }, 60000).then(function (result) {
        if (!result || !result.ok || !result.dataUrl) {
          throw new Error('El servicio no devolvió la imagen.');
        }

        image.addEventListener('load', function () {
          if (loading) loading.hidden = true;
          if (fallback) fallback.hidden = true;
          image.hidden = false;
          log('info', 'Previsualización de evidencia cargada.', {
            reportId: report.reportId,
            photoIndex: photoIndex,
            bytes: result.bytes || 0,
            mimeType: result.mimeType || ''
          });
        }, { once: true });

        image.addEventListener('error', function () {
          showFallback('El navegador no pudo representar la evidencia recibida.');
        }, { once: true });

        image.src = result.dataUrl;

        // Los data URL pueden quedar completos inmediatamente en algunos navegadores.
        if (image.complete && image.naturalWidth > 0) {
          if (loading) loading.hidden = true;
          if (fallback) fallback.hidden = true;
          image.hidden = false;
        }
      }).catch(function (error) {
        showFallback(error && error.message
          ? error.message
          : 'No fue posible cargar la previsualización de la evidencia.');
      });
    });
  }

  function detailField(label, value, classes) {
    return '<div class="' + (classes || 'col-md-6') + '">' +
      '<div class="detail-field h-100"><div class="small text-muted fw-semibold mb-1">' + esc(label) + '</div>' +
      '<div>' + value + '</div></div></div>';
  }

  function statusBadge(status) {
    if (status === 'Cerrado' || status === 'Resuelto') return 'text-bg-success';
    if (status === 'En proceso') return 'text-bg-primary';
    if (status === 'Asignado') return 'text-bg-info';
    return 'text-bg-warning';
  }

  function setLoading(active) {
    elements.loading.hidden = !active;
    elements.refreshButton.disabled = active;
    if (active) elements.reportList.innerHTML = '';
  }

  function setBusy(button, active, text) {
    if (active) {
      button.dataset.originalHtml = button.innerHTML;
      button.disabled = true;
      button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>' + text;
    } else {
      button.disabled = false;
      button.innerHTML = button.dataset.originalHtml || button.innerHTML;
    }
  }

  function showPanel(name) {
    elements.loginPanel.hidden = name !== 'login';
    elements.appPanel.hidden = name !== 'app';
  }

  function showAlert(type, message) {
    elements.alert.className = 'alert alert-' + type;
    elements.alert.textContent = message;
    elements.alert.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function hideAlert() {
    elements.alert.hidden = true;
  }

  function clearSession() {
    session = { token: '', nombre: '', expiresAt: 0 };
    sessionStorage.removeItem(storageKey);
  }

  function isSessionError(error) {
    return /sesión|sesion|ingresa nuevamente|origen de la sesión/i.test(
      String(error && error.message || '')
    );
  }

  function normalizeText(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function formatDate(value) {
    if (!value) return 'Sin fecha';
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('es-CO', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'America/Bogota'
    }).format(date);
  }

  function esc(value) {
    return String(value === null || typeof value === 'undefined' ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escAttr(value) {
    return esc(value).replace(/`/g, '&#096;');
  }

  document.addEventListener('DOMContentLoaded', init);
}());
