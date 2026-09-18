(function (global) {
  'use strict';

  var config = global.PQRS_MAINTENANCE_CONFIG || {};
  var client = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function esc(text) {
    if (text === null || text === undefined) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escAttr(text) {
    return esc(text);
  }

  function formatDate(isoString) {
    if (!isoString) return '—';
    try {
      var d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      return d.toLocaleDateString('es-CO', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return isoString;
    }
  }

  function getClient() {
    if (!client) {
      var url = config.webAppUrl || '';
      client = new global.PortalBVClient(url);
      client.timeoutMs = 45000;
    }
    return client;
  }

  var elements = {};

  function initElements() {
    elements.form = byId('consultationForm');
    elements.typeId = byId('consultTypeReportId');
    elements.typeEmail = byId('consultTypeEmail');
    elements.queryInput = byId('consultQueryInput');
    elements.queryLabel = byId('consultQueryLabel');
    elements.queryHelp = byId('consultQueryHelp');
    elements.submitBtn = byId('consultSubmitButton');
    elements.loading = byId('consultationLoading');
    elements.alert = byId('consultationAlert');
    elements.resultsContainer = byId('consultationResults');
    elements.resultsCount = byId('consultationCount');
  }

  function showAlert(type, message) {
    if (!elements.alert) return;
    if (!message) {
      elements.alert.hidden = true;
      elements.alert.textContent = '';
      return;
    }
    elements.alert.className = 'alert alert-' + type + ' mt-3';
    elements.alert.textContent = message;
    elements.alert.hidden = false;
  }

  function resetForm() {
    if (elements.queryInput) elements.queryInput.value = '';
    showAlert(null);
    if (elements.resultsContainer) {
      elements.resultsContainer.innerHTML = '';
      elements.resultsContainer.hidden = true;
    }
    if (elements.resultsCount) elements.resultsCount.textContent = '';
  }

  function updateSearchTypeUI(clearValue) {
    if (clearValue !== false) {
      resetForm();
    }
    var isEmail = elements.typeEmail && elements.typeEmail.checked;
    if (isEmail) {
      elements.queryLabel.textContent = 'Correo electrónico registrado:';
      elements.queryInput.placeholder = 'ejemplo@correo.com';
      elements.queryInput.type = 'email';
      elements.queryHelp.textContent = 'Ingresa el correo con el que registraste la solicitud para ver todos tus reportes.';
    } else {
      elements.queryLabel.textContent = 'Número de Radicado (ID):';
      elements.queryInput.placeholder = 'Ej: MANT-20260903-151328-LAUGS';
      elements.queryInput.type = 'text';
      elements.queryHelp.textContent = 'Ingresa el código que recibiste en el correo de confirmación.';
    }
    elements.queryInput.focus();
  }

  function getStatusBadge(estado) {
    var st = String(estado || '').trim().toLowerCase();
    if (st === 'cerrado' || st === 'resuelto') {
      return '<span class="badge bg-success fs-6"><i class="bi bi-check-circle-fill me-1"></i> Cerrado / Resuelto</span>';
    }
    if (st === 'en proceso') {
      return '<span class="badge bg-primary fs-6"><i class="bi bi-gear-wide-connected me-1"></i> En proceso</span>';
    }
    return '<span class="badge bg-warning text-dark fs-6"><i class="bi bi-clock-history me-1"></i> Abierto</span>';
  }

  function renderReportCard(report) {
    var fotos = Array.isArray(report.fotos) ? report.fotos : [];
    var fotoCierre = report.fotoCierre || '';

    var initialPhotosHtml = '';
    if (fotos.length > 0) {
      initialPhotosHtml = '<div class="mt-3">' +
        '<h6 class="fw-bold text-success mb-2"><i class="bi bi-camera me-1"></i> Evidencias iniciales:</h6>' +
        '<div class="d-flex flex-wrap gap-2">' +
        fotos.map(function (url, index) {
          return '<a href="' + escAttr(url) + '" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline-success d-inline-flex align-items-center">' +
            '<i class="bi bi-image me-1"></i> Ver fotografía ' + (index + 1) +
            ' <i class="bi bi-box-arrow-up-right ms-1 small"></i></a>';
        }).join('') +
        '</div></div>';
    }

    var closurePhotoHtml = '';
    if (fotoCierre) {
      closurePhotoHtml = '<div class="mt-3 p-3 bg-success-subtle border border-success-subtle rounded">' +
        '<h6 class="fw-bold text-success mb-2"><i class="bi bi-shield-check me-1"></i> Evidencia de finalización (Cierre):</h6>' +
        '<a href="' + escAttr(fotoCierre) + '" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-success d-inline-flex align-items-center">' +
        '<i class="bi bi-image-fill me-1"></i> Abrir fotografía de cierre en alta resolución' +
        ' <i class="bi bi-box-arrow-up-right ms-1 small"></i></a>' +
        '</div>';
    }

    var observationsHtml = '';
    if (report.observacionesGestion) {
      observationsHtml = '<div class="mt-3">' +
        '<h6 class="fw-bold text-secondary mb-1"><i class="bi bi-journal-text me-1"></i> Novedades y seguimiento de administración:</h6>' +
        '<div class="p-3 bg-light border rounded small" style="white-space: pre-line; line-height: 1.5;">' +
        esc(report.observacionesGestion) +
        '</div></div>';
    }

    return '<div class="card border-0 shadow-sm mb-4">' +
      '<div class="card-header bg-white border-bottom py-3 d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-2">' +
      '<div>' +
      '<span class="text-muted small d-block">Número de radicado</span>' +
      '<span class="fw-bold fs-5 text-success">' + esc(report.reportId) + '</span>' +
      '</div>' +
      '<div>' + getStatusBadge(report.estado) + '</div>' +
      '</div>' +
      '<div class="card-body p-4">' +
      '<div class="row g-3">' +
      '<div class="col-sm-6 col-md-4">' +
      '<span class="text-muted small d-block">Fecha de reporte</span>' +
      '<strong>' + formatDate(report.fechaReporte) + '</strong>' +
      '</div>' +
      '<div class="col-sm-6 col-md-4">' +
      '<span class="text-muted small d-block">Ubicación</span>' +
      '<strong>' + esc(report.ubicacion) + '</strong>' +
      '</div>' +
      '<div class="col-sm-6 col-md-4">' +
      '<span class="text-muted small d-block">Reportado por</span>' +
      '<strong>' + esc(report.reportadoPor) + '</strong>' +
      '</div>' +
      (report.responsable ? '<div class="col-sm-6 col-md-4"><span class="text-muted small d-block">Responsable asignado</span><strong>' + esc(report.responsable) + '</strong></div>' : '') +
      (report.fechaAtencion ? '<div class="col-sm-6 col-md-4"><span class="text-muted small d-block">Inicio de atención</span><strong>' + formatDate(report.fechaAtencion) + '</strong></div>' : '') +
      (report.fechaCierre ? '<div class="col-sm-6 col-md-4"><span class="text-muted small d-block">Fecha de finalización</span><strong class="text-success">' + formatDate(report.fechaCierre) + '</strong></div>' : '') +
      '</div>' +
      '<div class="mt-3">' +
      '<span class="text-muted small d-block">Descripción del daño / necesidad</span>' +
      '<p class="mb-0 bg-light p-3 rounded border">' + esc(report.descripcion) + '</p>' +
      '</div>' +
      initialPhotosHtml +
      closurePhotoHtml +
      observationsHtml +
      '</div>' +
      '</div>';
  }

  async function handleSearch(event) {
    if (event) event.preventDefault();

    var query = (elements.queryInput.value || '').trim();
    if (!query) {
      showAlert('warning', 'Por favor ingresa un número de radicado o correo para consultar.');
      return;
    }

    var isEmail = elements.typeEmail && elements.typeEmail.checked;
    var payload = {};

    if (isEmail) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(query)) {
        showAlert('warning', 'Ingresa un correo electrónico con formato válido.');
        return;
      }
      payload.correo = query;
    } else {
      payload.reportId = query;
    }

    showAlert(null);
    elements.resultsContainer.innerHTML = '';
    elements.resultsContainer.hidden = true;
    if (elements.resultsCount) elements.resultsCount.textContent = '';
    elements.loading.hidden = false;
    elements.submitBtn.disabled = true;

    try {
      var apiClient = getClient();
      var response = await apiClient.call('consultarReportesMantenimientoPublico', payload);

      if (!response || !response.ok) {
        throw new Error(response && response.error ? response.error : 'No fue posible consultar el reporte.');
      }

      var reports = Array.isArray(response.reportes) ? response.reportes : [];

      if (reports.length === 0) {
        showAlert('info', 'No se encontraron reportes con los datos ingresados. Verifica el radicado o correo y vuelve a intentar.');
        return;
      }

      var html = reports.map(function (rep) {
        return renderReportCard(rep);
      }).join('');

      elements.resultsContainer.innerHTML = html;
      elements.resultsContainer.hidden = false;

      if (elements.resultsCount) {
        elements.resultsCount.textContent = 'Se ' + (reports.length === 1 ? 'encontró 1 reporte:' : 'encontraron ' + reports.length + ' reportes:');
      }

      elements.resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      showAlert('danger', error && error.message ? error.message : 'Ocurrió un error al realizar la consulta.');
    } finally {
      elements.loading.hidden = true;
      elements.submitBtn.disabled = false;
    }
  }

  function checkUrlParams() {
    try {
      var urlParams = new URLSearchParams(window.location.search);
      var idParam = urlParams.get('id') || urlParams.get('radicado');
      var emailParam = urlParams.get('correo') || urlParams.get('email');

      if (idParam) {
        if (elements.typeId) elements.typeId.checked = true;
        updateSearchTypeUI(false);
        elements.queryInput.value = idParam;
        handleSearch();
      } else if (emailParam) {
        if (elements.typeEmail) elements.typeEmail.checked = true;
        updateSearchTypeUI(false);
        elements.queryInput.value = emailParam;
        handleSearch();
      }
    } catch (e) {}
  }

  global.resetPQRSConsultaForm = resetForm;

  function init() {
    initElements();
    if (!elements.form) return;

    if (elements.typeId) {
      elements.typeId.addEventListener('change', function () { updateSearchTypeUI(true); });
    }
    if (elements.typeEmail) {
      elements.typeEmail.addEventListener('change', function () { updateSearchTypeUI(true); });
    }
    elements.form.addEventListener('submit', handleSearch);

    checkUrlParams();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

}(window));
