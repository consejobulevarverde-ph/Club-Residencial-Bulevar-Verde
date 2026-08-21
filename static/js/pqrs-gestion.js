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
  var selectedClosureEvidence = null;
  var uploadedClosureEvidenceUrl = '';
  var closureEvidenceObjectUrl = '';

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
      evidenceCameraButton: $('managementOpenEvidenceCameraButton'),
      evidenceGalleryButton: $('managementOpenEvidenceGalleryButton'),
      evidenceRemoveButton: $('managementRemoveEvidenceButton'),
      evidenceGalleryInput: $('managementEvidenceGalleryInput'),
      evidencePreviewContainer: $('managementEvidencePreviewContainer'),
      evidencePreview: $('managementEvidencePreview'),
      evidenceInfo: $('managementEvidenceInfo'),
      evidenceStatus: $('managementEvidenceStatus'),
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
    elements.evidenceCameraButton.addEventListener('click', captureClosureEvidence);
    elements.evidenceGalleryButton.addEventListener('click', function () {
      elements.evidenceGalleryInput.click();
    });
    elements.evidenceGalleryInput.addEventListener('change', handleClosureEvidenceSelection);
    elements.evidenceRemoveButton.addEventListener('click', resetClosureEvidence);

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

    var origin = window.location.origin || (window.location.protocol + '//' + window.location.host);
    return client.callViaForm(action, payload, {
      parentOrigin: origin,
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

    filtered.sort(function (a, b) {
      var dateA = new Date(a.fechaRecepcion || a.fechaReporte || 0).getTime();
      var dateB = new Date(b.fechaRecepcion || b.fechaReporte || 0).getTime();
      return dateA - dateB;
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
      resetClosureEvidence();
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
        ? detailField(
            'Historial de gestión',
            '<div class="preserve-lines">' + renderTextWithLinks(report.observacionesGestion) + '</div>',
            'col-12'
          )
        : '') +
      '</div>';

    loadEvidencePreviews(report);

    elements.closurePanel.hidden = closed;
    if (!closed) {
      elements.responsible.value = session.nombre || report.responsable || '';
      elements.observations.value = '';
      elements.closeConfirm.checked = false;
      elements.closureForm.classList.remove('was-validated');
      resetClosureEvidence();
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
      var evidenceUrl = uploadedClosureEvidenceUrl;

      if (selectedClosureEvidence && !evidenceUrl) {
        elements.evidenceStatus.textContent = 'Comprimiendo y cargando evidencia…';
        var compressedEvidence = await compressClosureEvidence(selectedClosureEvidence);
        var uploadResult = await call('subirEvidenciaGestionMantenimiento', {
          token: session.token,
          reportId: selectedReport.reportId,
          clientEvidenceId: selectedClosureEvidence.clientEvidenceId,
          evidence: compressedEvidence
        }, 120000);

        if (!uploadResult || !uploadResult.ok || !uploadResult.url) {
          throw new Error('El servicio no confirmó la carga de la evidencia.');
        }

        evidenceUrl = uploadResult.url;
        uploadedClosureEvidenceUrl = evidenceUrl;
        elements.evidenceStatus.textContent = 'Evidencia cargada. Se agregará el enlace a las observaciones.';
        log('info', 'Evidencia de cierre cargada.', {
          reportId: selectedReport.reportId,
          bytes: uploadResult.bytes || 0,
          duplicate: Boolean(uploadResult.duplicate)
        });
      }

      var observations = elements.observations.value.trim();
      var observationsWithEvidence = evidenceUrl
        ? observations + ' ' + evidenceUrl
        : observations;

      if (observationsWithEvidence.length > 3000) {
        throw new Error('Las observaciones y la URL de evidencia superan el máximo de 3000 caracteres.');
      }

      var result = await call('finalizarReporteMantenimiento', {
        token: session.token,
        reportId: selectedReport.reportId,
        responsable: elements.responsible.value.trim(),
        observaciones: observationsWithEvidence
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

  async function captureClosureEvidence() {
    if (!window.BVEvidenceCamera) {
      showAlert('danger', 'No fue posible abrir la cámara. Recarga la página e intenta nuevamente.');
      return;
    }

    if (!selectedReport) {
      showAlert('warning', 'Selecciona primero el reporte que estás atendiendo.');
      return;
    }

    elements.evidenceCameraButton.disabled = true;

    try {
      var evidence = await window.BVEvidenceCamera.capture({
        contextLabel: 'Evidencia de atención PQRS',
        detailLines: [
          'Reporte: ' + selectedReport.reportId,
          selectedReport.ubicacion ? 'Ubicación reportada: ' + selectedReport.ubicacion : ''
        ].filter(Boolean),
        filePrefix: 'pqrs-cierre-' + selectedReport.reportId,
        maxDimension: 1600,
        quality: 0.84
      });

      var file = evidence.file || new File([evidence.blob], evidence.name, {
        type: 'image/jpeg',
        lastModified: Date.now()
      });

      setClosureEvidenceFile(file, 'Cámara');
      log('info', 'Evidencia de cierre tomada con el módulo compartido.', {
        reportId: selectedReport.reportId,
        name: file.name,
        sizeBytes: file.size,
        accuracy: evidence.captureMetadata && evidence.captureMetadata.accuracy
      });
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      showAlert('danger', 'No fue posible tomar la fotografía: ' + (error.message || error));
    } finally {
      elements.evidenceCameraButton.disabled = false;
    }
  }

  function handleClosureEvidenceSelection(event) {
    var input = event.target;
    var file = input && input.files && input.files[0];
    input.value = '';
    if (!file) return;
    setClosureEvidenceFile(file, 'Galería');
  }

  function setClosureEvidenceFile(file, source) {
    if (!/^image\//i.test(file.type || '')) {
      showAlert('warning', 'Selecciona un archivo de imagen válido.');
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      showAlert('warning', 'La imagen original no puede superar 20 MB.');
      return;
    }

    resetClosureEvidence();
    selectedClosureEvidence = {
      file: file,
      name: file.name || 'evidencia.jpg',
      type: file.type || 'image/jpeg',
      originalBytes: file.size || 0,
      source: source || 'Dispositivo',
      clientEvidenceId: createClientEvidenceId()
    };

    closureEvidenceObjectUrl = URL.createObjectURL(file);
    elements.evidencePreview.src = closureEvidenceObjectUrl;
    elements.evidencePreviewContainer.hidden = false;
    elements.evidenceRemoveButton.hidden = false;
    elements.evidenceInfo.textContent = selectedClosureEvidence.name +
      ' · ' + formatBytes(selectedClosureEvidence.originalBytes);
    elements.evidenceStatus.textContent = 'Evidencia lista. Se cargará al finalizar la atención.';

    log('info', 'Evidencia de cierre seleccionada.', {
      name: selectedClosureEvidence.name,
      type: selectedClosureEvidence.type,
      originalBytes: selectedClosureEvidence.originalBytes,
      source: selectedClosureEvidence.source,
      clientEvidenceId: selectedClosureEvidence.clientEvidenceId
    });
  }

  function resetClosureEvidence() {
    if (closureEvidenceObjectUrl) {
      URL.revokeObjectURL(closureEvidenceObjectUrl);
      closureEvidenceObjectUrl = '';
    }
    selectedClosureEvidence = null;
    uploadedClosureEvidenceUrl = '';
    if (!elements.evidencePreviewContainer) return;
    elements.evidencePreview.removeAttribute('src');
    elements.evidencePreviewContainer.hidden = true;
    elements.evidenceRemoveButton.hidden = true;
    elements.evidenceInfo.textContent = '';
    elements.evidenceStatus.textContent = 'La imagen se comprimirá antes de almacenarse.';
    elements.evidenceGalleryInput.value = '';
  }

  async function compressClosureEvidence(selected) {
    var file = selected.file;
    var image = await loadImageFile(file);
    var dimensions = fitDimensions(image.width, image.height, 1600);
    var canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    var context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image.source, 0, 0, canvas.width, canvas.height);

    if (typeof image.close === 'function') image.close();

    var quality = 0.86;
    var blob = await canvasToBlob(canvas, quality);
    while (blob.size > 950 * 1024 && quality > 0.48) {
      quality -= 0.08;
      blob = await canvasToBlob(canvas, quality);
    }

    if (blob.size > 2 * 1024 * 1024) {
      throw new Error('No fue posible reducir la evidencia por debajo de 2 MB.');
    }

    var dataUrl = await blobToDataUrl(blob);
    log('info', 'Evidencia de cierre comprimida.', {
      originalBytes: file.size || 0,
      finalBytes: blob.size,
      width: canvas.width,
      height: canvas.height,
      quality: quality
    });

    return {
      name: sanitizeFileName(selected.name),
      mimeType: 'image/jpeg',
      sizeBytes: blob.size,
      dataUrl: dataUrl
    };
  }

  async function loadImageFile(file) {
    if ('createImageBitmap' in window) {
      try {
        var bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          close: function () { bitmap.close(); }
        };
      } catch (error) {
        log('warn', 'createImageBitmap falló; se usará Image.', { message: error.message });
      }
    }

    return new Promise(function (resolve, reject) {
      var image = new Image();
      var objectUrl = URL.createObjectURL(file);
      image.onload = function () {
        URL.revokeObjectURL(objectUrl);
        resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight });
      };
      image.onerror = function () {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('No fue posible leer la imagen seleccionada.'));
      };
      image.src = objectUrl;
    });
  }

  function fitDimensions(width, height, maxDimension) {
    var ratio = Math.min(1, maxDimension / Math.max(width, height));
    return {
      width: Math.max(1, Math.round(width * ratio)),
      height: Math.max(1, Math.round(height * ratio))
    };
  }

  function canvasToBlob(canvas, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error('No fue posible comprimir la evidencia.'));
      }, 'image/jpeg', quality);
    });
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(new Error('No fue posible preparar la evidencia para el envío.')); };
      reader.readAsDataURL(blob);
    });
  }

  function createClientEvidenceId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return 'MEVID-' + window.crypto.randomUUID();
    }
    return 'MEVID-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  function sanitizeFileName(value) {
    return String(value || 'evidencia.jpg')
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 120);
  }

  function formatBytes(bytes) {
    var value = Number(bytes || 0);
    if (value < 1024) return value + ' B';
    if (value < 1024 * 1024) return (value / 1024).toFixed(1) + ' KB';
    return (value / (1024 * 1024)).toFixed(1) + ' MB';
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

  function normalizeMediaUrl_(value) {
    if (!value) return '';
    var normalized = String(value).trim();
    if (normalized.indexOf('http://') === 0 || normalized.indexOf('https://') === 0) return normalized;
    if (normalized.indexOf('drive.google.com') !== -1) return 'https://' + normalized;
    return '';
  }

  function parseGoogleDriveMediaUrl_(url) {
    var value = String(url || '').trim();
    if (!value || value.indexOf('drive.google.com') === -1) return null;

    var fileId = '';
    var resourceKey = '';

    try {
      var parsed = new URL(value, window.location.href);
      fileId = parsed.searchParams.get('id') || '';
      resourceKey = parsed.searchParams.get('resourcekey') || '';

      if (!fileId) {
        var pathMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/i);
        fileId = pathMatch && pathMatch[1] ? pathMatch[1] : '';
      }
    } catch (error) {
      var idMatch = value.match(/[?&]id=([^&#]+)/i);
      var keyMatch = value.match(/[?&]resourcekey=([^&#]+)/i);
      var pathMatchFallback = value.match(/\/file\/d\/([^/?#]+)/i);

      fileId = idMatch && idMatch[1]
        ? decodeURIComponent(idMatch[1])
        : pathMatchFallback && pathMatchFallback[1]
          ? decodeURIComponent(pathMatchFallback[1])
          : '';
      resourceKey = keyMatch && keyMatch[1] ? decodeURIComponent(keyMatch[1]) : '';
    }

    return fileId ? { fileId: fileId, resourceKey: resourceKey } : null;
  }

  function uniqueStrings_(values) {
    var seen = {};
    return values.filter(function (value) {
      var key = String(value || '').trim();
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function buildMediaDisplayUrls_(url) {
    var normalizedUrl = normalizeMediaUrl_(url);
    if (!normalizedUrl) return [];

    var driveInfo = parseGoogleDriveMediaUrl_(normalizedUrl);
    if (!driveInfo) return [normalizedUrl];

    var resourceKeyQuery = driveInfo.resourceKey
      ? '&resourcekey=' + encodeURIComponent(driveInfo.resourceKey)
      : '';

    return uniqueStrings_([
      'https://drive.google.com/thumbnail?id=' + encodeURIComponent(driveInfo.fileId) + resourceKeyQuery + '&sz=w1200',
      'https://lh3.googleusercontent.com/d/' + encodeURIComponent(driveInfo.fileId) + '=w1200',
      normalizedUrl
    ]);
  }

  window.handlePqrsEvidenceError_ = function (img) {
    if (!img) return;

    var fallbackUrls = [];
    try {
      fallbackUrls = JSON.parse(decodeURIComponent(img.getAttribute('data-fallback-urls') || ''));
    } catch (error) {
      fallbackUrls = [];
    }

    if (fallbackUrls.length > 0) {
      var nextUrl = fallbackUrls.shift();
      img.setAttribute('data-fallback-urls', encodeURIComponent(JSON.stringify(fallbackUrls)));
      img.src = nextUrl;
      return;
    }

    img.style.display = 'none';
  };

  function renderTextWithLinks(value) {
    var text = String(value || '');
    var urlPattern = /https?:\/\/[^\s<>"']+/gi;
    var output = '';
    var lastIndex = 0;
    var match;

    while ((match = urlPattern.exec(text)) !== null) {
      output += esc(text.slice(lastIndex, match.index));

      var rawUrl = match[0];
      var normalized = splitTrailingUrlPunctuation(rawUrl);
      var url = normalized.url;
      var trailing = normalized.trailing;
      var isDriveEvidence = /^https:\/\/(?:drive|docs)\.google\.com\//i.test(url);

      if (isDriveEvidence) {
        // Renderizar miniatura con fallback chain para Drive
        var displayUrls = buildMediaDisplayUrls_(url);
        var initialUrl = displayUrls.shift() || url;
        var fallbackUrls = encodeURIComponent(JSON.stringify(displayUrls));

        output += '<a href="' + escAttr(url) + '" target="_blank" rel="noopener noreferrer" ' +
          'class="d-inline-flex flex-column align-items-center text-decoration-none mx-1" ' +
          'title="Abrir evidencia en una pestaña nueva">' +
          '<span class="border border-success-subtle rounded overflow-hidden bg-light d-flex align-items-center justify-content-center shadow-sm pqrs-evidence-thumb">' +
          '<img data-evidence-preview alt="Previsualización de evidencia" ' +
          'width="150" height="150" decoding="async" referrerpolicy="no-referrer" ' +
          'style="width:150px;height:150px;object-fit:cover;display:block;" hidden ' +
          'src="' + escAttr(initialUrl) + '" ' +
          'data-fallback-urls="' + escAttr(fallbackUrls) + '" ' +
          'onerror="window.handlePqrsEvidenceError_(this)">' +
          '<span data-evidence-loading class="text-success text-center px-3">' +
          '<span class="spinner-border spinner-border-sm d-block mx-auto mb-2" role="status" aria-hidden="true"></span>' +
          '<span class="small">Cargando…</span></span>' +
          '<span data-evidence-fallback hidden class="text-success text-center px-3">' +
          '<i class="bi bi-image fs-1 d-block"></i><span class="small">Ver evidencia</span></span>' +
          '</span>' +
          '<span class="small fw-semibold text-success mt-1">' +
          '<i class="bi bi-image me-1" aria-hidden="true"></i>Ver evidencia</span>' +
          '</a>';

        // Script inline para cargar la imagen cuando se carga el DOM
        if (!window.pqrsEvidenceLoaderAttached) {
          window.pqrsEvidenceLoaderAttached = true;
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function loadPqrsEvidences() {
              loadPqrsEvidencePreviews();
              document.removeEventListener('DOMContentLoaded', loadPqrsEvidences);
            });
          } else {
            loadPqrsEvidencePreviews();
          }
        }
      } else {
        // Link simple para URLs no-Drive
        var label = 'Abrir enlace';
        var icon = 'bi-box-arrow-up-right';

        output += '<a class="btn btn-outline-success btn-sm mx-1 align-baseline" ' +
          'href="' + escAttr(url) + '" target="_blank" rel="noopener noreferrer" ' +
          'title="Abrir en una pestaña nueva">' +
          '<i class="bi ' + icon + ' me-1" aria-hidden="true"></i>' +
          esc(label) + '</a>';
      }

      output += esc(trailing);
      lastIndex = urlPattern.lastIndex;
    }

    output += esc(text.slice(lastIndex));
    return output;
  }

  function loadPqrsEvidencePreviews() {
    var images = Array.prototype.slice.call(
      document.querySelectorAll('[data-evidence-preview]')
    );
    images.forEach(function (image) {
      if (image.src && image.src.indexOf('drive.google.com') !== -1) {
        // Mostrar loading
        var loading = image.parentElement.querySelector('[data-evidence-loading]');
        if (loading) loading.style.display = 'block';

        // Mostrar imagen
        image.hidden = false;
        image.onload = function () {
          if (loading) loading.style.display = 'none';
        };
      }
    });
  }

  function splitTrailingUrlPunctuation(value) {
    var url = String(value || '');
    var trailing = '';

    while (/[.,;:!?]$/.test(url)) {
      trailing = url.slice(-1) + trailing;
      url = url.slice(0, -1);
    }

    // Retira un paréntesis final solo cuando no existe uno de apertura dentro
    // de la propia URL; así no se dañan enlaces que contienen paréntesis válidos.
    while (/\)$/.test(url) && (url.match(/\(/g) || []).length < (url.match(/\)/g) || []).length) {
      trailing = ')' + trailing;
      url = url.slice(0, -1);
    }

    return { url: url, trailing: trailing };
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
