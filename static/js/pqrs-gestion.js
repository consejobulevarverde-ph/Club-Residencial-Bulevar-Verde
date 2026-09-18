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
  var detailModalElement = null;
  var closureEvidences = [];

  // Cola local de cierres. Usa una base propia: subir la versión de
  // 'bulevar-verde-pqrs' rompería la página de creación de reportes.
  var DB_NAME = 'bulevar-verde-pqrs-gestion';
  var DB_VERSION = 1;
  var STORE_NAME = 'closureQueue';
  var MAX_CLOSURE_EVIDENCES = 3;
  var MAX_OBSERVATIONS_CHARS = 3000;
  var EVIDENCE_URL_RESERVE_CHARS = 120;
  var pendingClosures = {};
  var pendingClosuresKey = '';
  var flushInProgress = false;
  var flushPromise = null;

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
      evidenceGalleryInput: $('managementEvidenceGalleryInput'),
      evidenceList: $('managementEvidenceList'),
      evidenceStatus: $('managementEvidenceStatus'),
      closeConfirm: $('managementCloseConfirm'),
      closeButton: $('managementCloseButton'),
      closureAlert: $('managementClosureAlert'),
      closureQueued: $('managementClosureQueued'),
      closureQueuedError: $('managementClosureQueuedError'),
      closureQueuedRetry: $('managementClosureQueuedRetry'),
      queueBanner: $('managementQueueBanner'),
      queueCount: $('managementQueueCount'),
      queueList: $('managementQueueList'),
      queueRetry: $('managementQueueRetryButton'),
      network: $('managementNetworkStatus')
    };

    client = new window.PortalBVClient(config.webAppUrl || '');
    detailModalElement = $('managementDetailModal');
    detailModal = new bootstrap.Modal(detailModalElement);

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
    elements.evidenceList.addEventListener('click', handleEvidenceListClick);
    elements.queueRetry.addEventListener('click', function () {
      log('info', 'Botón "Intentar enviar" presionado.');
      flushQueue(true, null, 'botón manual');
    });
    elements.closureQueuedRetry.addEventListener('click', function () {
      flushQueue(true, null, 'botón del detalle');
    });
    elements.queueList.addEventListener('click', handleQueueListClick);

    window.addEventListener('online', function () {
      log('info', 'Evento online recibido.');
      renderNetworkStatus();
      flushQueue(false, null, 'evento online');
    });
    window.addEventListener('offline', function () {
      log('warn', 'Evento offline recibido.');
      renderNetworkStatus();
    });
    window.addEventListener('focus', function () {
      flushQueue(false, null, 'foco de ventana');
    });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) flushQueue(false, null, 'página visible');
    });
    window.setInterval(function () {
      if (!document.hidden) flushQueue(false, null, 'temporizador de 60 segundos');
    }, 60000);

    renderNetworkStatus();
    renderClosureEvidences();
    refreshQueueCount().catch(function (error) {
      log('error', 'No fue posible consultar la cola de cierres durante el inicio.', error);
    });

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
    }).then(function () {
      flushQueue(false, null, 'inicio del módulo');
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
      flushQueue(false, null, 'inicio de sesión');
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
    var closed = isClosed(report);
    var badge = statusBadge(report.estado);
    var date = formatDate(report.fechaRecepcion || report.fechaReporte);
    var queuedBadge = pendingClosures[report.reportId]
      ? '<span class="badge text-bg-warning"><i class="bi bi-cloud-arrow-up me-1"></i>Cierre en cola</span>'
      : '';

    return '<div class="col-12 col-lg-6">' +
      '<button type="button" class="report-card card w-100 h-100 text-start border-0 shadow-sm" data-report-id="' + esc(report.reportId) + '">' +
      '<div class="card-body">' +
      '<div class="d-flex justify-content-between align-items-start gap-3 mb-2">' +
      '<div><div class="small text-muted">' + esc(date) + '</div>' +
      '<h3 class="h6 fw-bold mb-0">' + esc(report.reportId) + '</h3></div>' +
      '<div class="d-flex flex-column align-items-end gap-1">' +
      '<span class="badge ' + badge + '">' + esc(report.estado) + '</span>' + queuedBadge +
      '</div>' +
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
    hideClosureAlert();
    // Evita que un refresco de la cola muestre el panel de un reporte anterior.
    selectedReport = null;
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

  function isClosed(report) {
    return report.estado === 'Cerrado' || report.estado === 'Resuelto';
  }

  function renderDetail(report) {
    var closed = isClosed(report);
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

    if (!closed) {
      elements.responsible.value = session.nombre || report.responsable || '';
      elements.observations.value = '';
      elements.closeConfirm.checked = false;
      elements.closureForm.classList.remove('was-validated');
      hideClosureAlert();
      resetClosureEvidence();
    }
    syncClosurePanel();
  }

  // Muestra el formulario de cierre, o el aviso de cierre pendiente cuando ese
  // reporte ya está en la cola local (evita encolar el mismo cierre dos veces).
  function syncClosurePanel() {
    if (!selectedReport) return;

    var pending = pendingClosures[selectedReport.reportId];
    elements.closurePanel.hidden = isClosed(selectedReport);
    elements.closureQueued.hidden = !pending;
    elements.closureForm.hidden = Boolean(pending);
    elements.closureQueuedError.textContent = pending && pending.lastError
      ? 'Último intento: ' + pending.lastError
      : '';
  }

  async function handleCloseReport(event) {
    event.preventDefault();
    if (!selectedReport) return;
    hideClosureAlert();

    var reportId = selectedReport.reportId;

    if (pendingClosures[reportId]) {
      showClosureAlert('warning', 'Este reporte ya tiene un cierre pendiente de envío.');
      return;
    }

    if (!elements.closureForm.checkValidity()) {
      elements.closureForm.classList.add('was-validated');
      showClosureAlert('warning', 'Completa los campos obligatorios y confirma el cierre.');
      var firstInvalid = elements.closureForm.querySelector(':invalid');
      if (firstInvalid && typeof firstInvalid.focus === 'function') firstInvalid.focus();
      return;
    }

    var observations = elements.observations.value.trim();
    var responsible = elements.responsible.value.trim();

    if (observations.length + closureEvidences.length * EVIDENCE_URL_RESERVE_CHARS > MAX_OBSERVATIONS_CHARS) {
      showClosureAlert(
        'warning',
        'Las observaciones son demasiado largas para incluir los enlaces de las evidencias. Redúcelas e intenta nuevamente.'
      );
      return;
    }

    setBusy(elements.closeButton, true, 'Guardando…');

    var item = null;

    try {
      // Todo lo que sigue es local: funciona sin conexión.
      var evidences = [];
      for (var index = 0; index < closureEvidences.length; index += 1) {
        var selected = closureEvidences[index];
        elements.evidenceStatus.textContent =
          'Comprimiendo evidencia ' + (index + 1) + ' de ' + closureEvidences.length + '…';

        var compressed;
        try {
          compressed = await compressClosureEvidence(selected);
        } catch (compressError) {
          throw new Error(
            'No fue posible preparar la evidencia "' + selected.name + '": ' +
            (compressError && compressError.message ? compressError.message : compressError)
          );
        }

        evidences.push({
          clientEvidenceId: selected.clientEvidenceId,
          name: compressed.name,
          mimeType: compressed.mimeType,
          sizeBytes: compressed.sizeBytes,
          dataUrl: compressed.dataUrl
        });
      }

      item = {
        clientCloseId: createClientCloseId(),
        reportId: reportId,
        responsable: responsible,
        observaciones: observations,
        evidences: evidences,
        queuedAt: new Date().toISOString(),
        attempts: 0
      };

      // Se persiste ANTES de intentar enviar: nada se pierde si falla la red.
      await putQueueItem(item);
      log('info', 'Cierre guardado en IndexedDB.', summarizeClosure(item));
      await refreshQueueCount();
    } catch (error) {
      log('error', 'No fue posible preparar o guardar el cierre.', {
        message: error && error.message,
        stack: error && error.stack
      });
      renderClosureEvidences();
      showClosureAlert('danger', error && error.message
        ? error.message
        : 'No fue posible guardar el cierre en este dispositivo.');
      setBusy(elements.closeButton, false);
      return;
    }

    var outcome = null;

    try {
      elements.evidenceStatus.textContent = 'Cierre guardado. Enviando…';
      var outcomes = await flushQueue(true, item.clientCloseId, 'envío inmediato después de guardar');
      outcome = outcomes && outcomes[item.clientCloseId];
    } catch (error) {
      log('error', 'Error inesperado al enviar el cierre; permanece en la cola.', {
        message: error && error.message,
        stack: error && error.stack
      });
    } finally {
      setBusy(elements.closeButton, false);
    }

    resetClosureForm();
    detailModal.hide();

    if (outcome && outcome.status === 'auth') return; // handleSessionLost ya avisó.

    if (outcome && outcome.status === 'sent') {
      showAlert('success', outcome.message || 'La atención quedó finalizada.');
      return;
    }

    showAlert(
      'warning',
      'El cierre de ' + reportId + ' quedó guardado en este dispositivo y se enviará automáticamente cuando haya una conexión estable.' +
      (outcome && outcome.message ? ' Motivo: ' + outcome.message : '')
    );
  }

  function resetClosureForm() {
    elements.observations.value = '';
    elements.closeConfirm.checked = false;
    elements.closureForm.classList.remove('was-validated');
    resetClosureEvidence();
  }

  /* ------------------------------------------------------------------ */
  /* Cola local de cierres (IndexedDB)                                   */
  /* ------------------------------------------------------------------ */

  function createClientCloseId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return 'MCLOSE-' + window.crypto.randomUUID();
    }
    return 'MCLOSE-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  function summarizeClosure(item) {
    var evidences = Array.isArray(item && item.evidences) ? item.evidences : [];
    return {
      clientCloseId: item && item.clientCloseId,
      reportId: item && item.reportId,
      attempts: Number(item && item.attempts || 0),
      lastAttemptAt: item && item.lastAttemptAt,
      lastError: item && item.lastError,
      blocked: Boolean(item && item.blocked),
      evidenceCount: evidences.length,
      evidenceUploaded: evidences.filter(function (evidence) { return evidence.url; }).length,
      evidenceBytes: evidences.map(function (evidence) { return Number(evidence.sizeBytes || 0); })
    };
  }

  function serverError(message) {
    var error = new Error(message);
    error.code = 'SERVER_REJECTED';
    return error;
  }

  // 'auth' = sesión vencida; 'transport' = sin red / sin respuesta (se detiene
  // el ciclo); 'server' = el servicio respondió con un rechazo.
  function classifyError(error) {
    if (isSessionError(error)) return 'auth';
    if (!navigator.onLine) return 'transport';
    var code = error && error.code;
    if (code === 'POST_TIMEOUT' || code === 'POST_SUBMIT_FAILED') return 'transport';
    return 'server';
  }

  async function flushQueue(force, preferredId, trigger) {
    trigger = trigger || 'no especificado';

    if (flushInProgress) {
      // Los disparadores automáticos no esperan; el envío inmediato sí, para
      // poder informar el resultado de su propio ítem.
      if (!force && !preferredId) return {};
      try { await flushPromise; } catch (ignored) { /* runFlush ya registró el error. */ }
      return flushQueue(force, preferredId, trigger);
    }

    if (!session.token) {
      log('debug', 'No se procesa la cola: no hay sesión activa.', { trigger: trigger });
      return {};
    }

    flushInProgress = true;
    flushPromise = runFlush(force, preferredId, trigger);
    try {
      return await flushPromise;
    } finally {
      flushInProgress = false;
      flushPromise = null;
    }
  }

  async function runFlush(force, preferredId, trigger) {
    var outcomes = {};
    var sentIds = [];
    var items;

    try {
      items = await getQueueItems();
    } catch (error) {
      log('error', 'No fue posible leer la cola de cierres.', error);
      return outcomes;
    }

    if (!items.length) return outcomes;

    log('info', 'Procesamiento de cola de cierres iniciado.', {
      trigger: trigger,
      force: Boolean(force),
      online: navigator.onLine,
      items: items.map(summarizeClosure)
    });

    try {
      if (!navigator.onLine) {
        items.forEach(function (item) {
          outcomes[item.clientCloseId] = { status: 'queued', message: 'Sin conexión a internet.' };
        });
        return outcomes;
      }

      if (preferredId) {
        items.sort(function (a, b) {
          if (a.clientCloseId === preferredId) return -1;
          if (b.clientCloseId === preferredId) return 1;
          return String(a.queuedAt).localeCompare(String(b.queuedAt));
        });
      }

      for (var index = 0; index < items.length; index += 1) {
        var item = items[index];

        // Un rechazo del servidor solo se reintenta a petición del usuario.
        if (item.blocked && !force) continue;

        try {
          item.attempts = Number(item.attempts || 0) + 1;
          item.lastAttemptAt = new Date().toISOString();
          item.blocked = false;
          delete item.lastError;
          await putQueueItem(item);

          var result = await processClosureItem(item);

          await deleteQueueItem(item.clientCloseId);
          sentIds.push(item.clientCloseId);
          outcomes[item.clientCloseId] = {
            status: 'sent',
            message: result.message || 'La atención quedó finalizada.',
            reporte: result.reporte
          };
          log('info', 'Cierre confirmado y eliminado de la cola local.', {
            clientCloseId: item.clientCloseId,
            reportId: item.reportId,
            alreadyClosed: Boolean(result.alreadyClosed)
          });

          if (
            item.clientCloseId !== preferredId &&
            result.reporte &&
            selectedReport &&
            selectedReport.reportId === item.reportId &&
            detailModalElement.classList.contains('show')
          ) {
            selectedReport = result.reporte;
            renderDetail(selectedReport);
          }
        } catch (error) {
          var kind = classifyError(error);
          item.lastError = error && error.message ? error.message : String(error || 'Error de red');
          if (kind === 'server') item.blocked = true;
          await putQueueItem(item);

          log('error', 'Falló el envío del cierre; permanece en la cola.', {
            closure: summarizeClosure(item),
            kind: kind,
            errorCode: error && error.code,
            online: navigator.onLine
          });

          outcomes[item.clientCloseId] = {
            status: kind === 'auth' ? 'auth' : 'queued',
            message: item.lastError
          };

          if (kind === 'auth') {
            handleSessionLost();
            break;
          }
          if (kind === 'transport') break;
        }
      }
    } catch (error) {
      log('error', 'Error general procesando la cola de cierres.', {
        trigger: trigger,
        message: error && error.message,
        stack: error && error.stack
      });
    } finally {
      try {
        await refreshQueueCount();
      } catch (error) {
        log('error', 'No fue posible actualizar la cola al terminar.', error);
      }

      if (sentIds.length && session.token) {
        try {
          await loadReports();
        } catch (refreshError) {
          log('warn', 'El cierre fue confirmado, pero no se pudo refrescar la lista.', refreshError);
        }

        var background = sentIds.filter(function (id) { return id !== preferredId; });
        if (background.length && session.token) {
          showAlert(
            'success',
            background.length === 1
              ? 'Se envió un cierre que estaba pendiente.'
              : 'Se enviaron ' + background.length + ' cierres que estaban pendientes.'
          );
        }
      }

      log('info', 'Procesamiento de cola de cierres finalizado.', { trigger: trigger });
    }

    return outcomes;
  }

  // Sube las evidencias pendientes y luego finaliza el reporte. Ambos pasos son
  // idempotentes en Apps Script (clientEvidenceId / estado Cerrado), por lo que
  // un reintento tras perder la respuesta no duplica nada.
  async function processClosureItem(item) {
    for (var index = 0; index < item.evidences.length; index += 1) {
      var evidence = item.evidences[index];
      if (evidence.url) continue;

      var upload = await call('subirEvidenciaGestionMantenimiento', {
        token: session.token,
        reportId: item.reportId,
        clientEvidenceId: evidence.clientEvidenceId,
        evidence: {
          name: evidence.name,
          mimeType: evidence.mimeType,
          sizeBytes: evidence.sizeBytes,
          dataUrl: evidence.dataUrl
        }
      }, 120000);

      if (!upload || !upload.ok || !upload.url) {
        throw serverError('El servicio no confirmó la carga de la evidencia.');
      }

      evidence.url = upload.url;
      evidence.dataUrl = '';
      await putQueueItem(item);
      log('info', 'Evidencia de cierre cargada.', {
        reportId: item.reportId,
        bytes: upload.bytes || 0,
        duplicate: Boolean(upload.duplicate)
      });
    }

    var urls = item.evidences.map(function (evidence) { return evidence.url; }).filter(Boolean);
    var observations = urls.length
      ? item.observaciones + ' ' + urls.join(' ')
      : item.observaciones;

    if (observations.length > MAX_OBSERVATIONS_CHARS) {
      throw serverError('Las observaciones y los enlaces de evidencia superan el máximo de ' + MAX_OBSERVATIONS_CHARS + ' caracteres.');
    }

    var result = await call('finalizarReporteMantenimiento', {
      token: session.token,
      reportId: item.reportId,
      responsable: item.responsable,
      observaciones: observations
    }, 90000);

    if (!result || !result.ok) {
      throw serverError('El servicio no confirmó el cierre del reporte.');
    }

    return result;
  }

  function handleSessionLost() {
    detailModal.hide();
    clearSession();
    showPanel('login');
    showAlert(
      'warning',
      'La sesión venció. Ingresa nuevamente; los cierres pendientes se enviarán automáticamente.'
    );
  }

  async function refreshQueueCount() {
    var items = await getQueueItems();

    pendingClosures = {};
    items.forEach(function (item) {
      pendingClosures[item.reportId] = item;
    });

    elements.queueCount.textContent = String(items.length);
    elements.queueBanner.hidden = items.length === 0;
    elements.queueList.innerHTML = items.map(renderQueueItem).join('');
    renderNetworkStatus();
    syncClosurePanel();

    // Reprocesa las tarjetas solo si cambió el conjunto de reportes en cola.
    var key = Object.keys(pendingClosures).sort().join('|');
    if (key !== pendingClosuresKey) {
      pendingClosuresKey = key;
      if (reports.length) renderReports();
    }
  }

  function renderQueueItem(item) {
    var evidenceCount = Array.isArray(item.evidences) ? item.evidences.length : 0;
    return '<li class="d-flex flex-wrap align-items-center gap-2 border-top pt-2 mt-2">' +
      '<span class="fw-semibold">' + esc(item.reportId) + '</span>' +
      '<span class="text-muted">' + evidenceCount + ' evidencia(s)</span>' +
      (item.lastError ? '<span class="text-danger">' + esc(item.lastError) + '</span>' : '') +
      '<button type="button" class="btn btn-sm btn-link text-danger p-0 ms-auto" data-discard-close="' +
      esc(item.clientCloseId) + '">Descartar</button>' +
      '</li>';
  }

  async function handleQueueListClick(event) {
    var button = event.target.closest('[data-discard-close]');
    if (!button) return;

    if (!window.confirm('¿Descartar este cierre pendiente? Se perderán las observaciones y evidencias guardadas en este dispositivo.')) {
      return;
    }

    try {
      await deleteQueueItem(button.dataset.discardClose);
      log('info', 'Cierre pendiente descartado por el usuario.', { clientCloseId: button.dataset.discardClose });
      await refreshQueueCount();
    } catch (error) {
      showAlert('danger', 'No fue posible descartar el cierre: ' + (error && error.message || error));
    }
  }

  function renderNetworkStatus() {
    if (!elements.network) return;
    elements.network.textContent = navigator.onLine ? 'Con conexión' : 'Sin conexión';
    elements.network.className = 'ms-1 fw-semibold ' + (navigator.onLine ? 'text-success' : 'text-danger');
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      var request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          var store = db.createObjectStore(STORE_NAME, { keyPath: 'clientCloseId' });
          store.createIndex('queuedAt', 'queuedAt', { unique: false });
        }
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () {
        reject(request.error || new Error('No fue posible abrir el almacenamiento local.'));
      };
      request.onblocked = function () {
        log('warn', 'La apertura de IndexedDB está bloqueada por otra pestaña o versión.');
      };
    });
  }

  async function putQueueItem(item) {
    var db = await openDb();
    return transactionPromise(db, 'readwrite', function (store) {
      store.put(item);
    });
  }

  async function deleteQueueItem(clientCloseId) {
    var db = await openDb();
    return transactionPromise(db, 'readwrite', function (store) {
      store.delete(clientCloseId);
    });
  }

  async function getQueueItems() {
    var db = await openDb();
    return new Promise(function (resolve, reject) {
      var transaction = db.transaction(STORE_NAME, 'readonly');
      var request = transaction.objectStore(STORE_NAME).getAll();

      request.onsuccess = function () {
        resolve((request.result || []).sort(function (a, b) {
          return String(a.queuedAt).localeCompare(String(b.queuedAt));
        }));
      };
      request.onerror = function () {
        reject(request.error || new Error('No fue posible consultar la cola local.'));
      };
      transaction.oncomplete = function () { db.close(); };
    });
  }

  function transactionPromise(db, mode, operation) {
    return new Promise(function (resolve, reject) {
      var transaction = db.transaction(STORE_NAME, mode);

      try {
        operation(transaction.objectStore(STORE_NAME));
      } catch (error) {
        db.close();
        reject(error);
        return;
      }

      transaction.oncomplete = function () {
        db.close();
        resolve();
      };
      transaction.onerror = function () {
        db.close();
        reject(transaction.error || new Error('Error al guardar la cola local.'));
      };
      transaction.onabort = transaction.onerror;
    });
  }

  /* ------------------------------------------------------------------ */
  /* Evidencias de cierre                                                */
  /* ------------------------------------------------------------------ */

  async function captureClosureEvidence() {
    hideClosureAlert();

    if (!window.BVEvidenceCamera) {
      showClosureAlert('danger', 'No fue posible abrir la cámara. Recarga la página e intenta nuevamente.');
      return;
    }

    if (!selectedReport) {
      showClosureAlert('warning', 'Selecciona primero el reporte que estás atendiendo.');
      return;
    }

    if (closureEvidences.length >= MAX_CLOSURE_EVIDENCES) {
      showClosureAlert('warning', 'Ya adjuntaste el máximo de evidencias permitidas.');
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
        quality: 0.84,
        allowVideo: true,
        maxVideoSeconds: 15,
        maxVideoBytes: 15 * 1024 * 1024
      });

      var file = evidence.file || new File([evidence.blob], evidence.name, {
        type: 'image/jpeg',
        lastModified: Date.now()
      });

      if (setClosureEvidenceFile(file, 'Cámara')) {
        log('info', 'Evidencia de cierre tomada con el módulo compartido.', {
          reportId: selectedReport.reportId,
          name: file.name,
          sizeBytes: file.size,
          accuracy: evidence.captureMetadata && evidence.captureMetadata.accuracy
        });
      }
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      showClosureAlert('danger', 'No fue posible capturar la evidencia: ' + (error.message || error));
    } finally {
      renderClosureEvidences();
    }
  }

  function handleClosureEvidenceSelection(event) {
    var input = event.target;
    var files = Array.prototype.slice.call(input && input.files || []);
    input.value = '';
    if (!files.length) return;

    hideClosureAlert();
    files.forEach(function (file) {
      setClosureEvidenceFile(file, 'Galería');
    });
  }

  function setClosureEvidenceFile(file, source) {
    var isImage = /^image\//i.test(file.type || '');
    var isVideo = /^video\//i.test(file.type || '');

    if (!isImage && !isVideo) {
      showClosureAlert('warning', 'Selecciona un archivo de imagen o video válido.');
      return false;
    }

    if (closureEvidences.length >= MAX_CLOSURE_EVIDENCES) {
      showClosureAlert('warning', 'Ya adjuntaste el máximo de evidencias permitidas.');
      return false;
    }

    var maxSize = isVideo ? 15 * 1024 * 1024 : 20 * 1024 * 1024;
    var typeLabel = isVideo ? 'video' : 'imagen';

    if (file.size > maxSize) {
      showClosureAlert('warning', 'El ' + typeLabel + ' original no puede superar ' + (maxSize / (1024 * 1024)) + ' MB.');
      return false;
    }

    var selected = {
      file: file,
      name: file.name || 'evidencia.jpg',
      type: file.type || 'image/jpeg',
      originalBytes: file.size || 0,
      source: source || 'Dispositivo',
      clientEvidenceId: createClientEvidenceId(),
      objectUrl: URL.createObjectURL(file)
    };
    closureEvidences.push(selected);
    renderClosureEvidences();

    log('info', 'Evidencia de cierre seleccionada.', {
      name: selected.name,
      type: selected.type,
      originalBytes: selected.originalBytes,
      source: selected.source,
      clientEvidenceId: selected.clientEvidenceId
    });
    return true;
  }

  function handleEvidenceListClick(event) {
    var button = event.target.closest('[data-remove-evidence]');
    if (!button) return;

    var removed = closureEvidences.splice(Number(button.dataset.removeEvidence), 1)[0];
    if (removed && removed.objectUrl) URL.revokeObjectURL(removed.objectUrl);
    hideClosureAlert();
    renderClosureEvidences();
  }

  function renderClosureEvidences() {
    if (!elements.evidenceList) return;

    var full = closureEvidences.length >= MAX_CLOSURE_EVIDENCES;

    elements.evidenceList.innerHTML = closureEvidences.map(function (item, index) {
      var isVideo = /^video\//i.test(item.type);
      var media = isVideo
        ? '<video class="management-evidence-video" src="' + esc(item.objectUrl) + '" muted playsinline preload="metadata"></video>'
        : '<img class="management-evidence-preview" src="' + esc(item.objectUrl) + '" alt="Previsualización de ' + esc(item.name) + '">';

      return '<div class="management-evidence-item">' + media +
        '<div class="small fw-semibold management-evidence-name mt-1" title="' + esc(item.name) + '">' + esc(item.name) + '</div>' +
        '<div class="small text-muted">' + esc(item.source) + ' · ' + esc(formatBytes(item.originalBytes)) + '</div>' +
        '<button type="button" class="btn btn-sm btn-outline-danger mt-1" data-remove-evidence="' + index + '">' +
        '<i class="bi bi-trash me-1"></i>Quitar</button></div>';
    }).join('');

    elements.evidenceList.hidden = closureEvidences.length === 0;
    elements.evidenceCameraButton.disabled = full;
    elements.evidenceGalleryButton.disabled = full;
    elements.evidenceStatus.textContent = closureEvidences.length
      ? closureEvidences.length + ' evidencia(s) lista(s). Se comprimirán y se cargarán al finalizar la atención.'
      : 'La imagen se comprimirá antes de almacenarse.';
  }

  function resetClosureEvidence() {
    closureEvidences.forEach(function (item) {
      if (item.objectUrl) URL.revokeObjectURL(item.objectUrl);
    });
    closureEvidences = [];
    if (elements.evidenceGalleryInput) elements.evidenceGalleryInput.value = '';
    renderClosureEvidences();
  }

  function showClosureAlert(type, message) {
    elements.closureAlert.className = 'alert alert-' + type;
    elements.closureAlert.textContent = message;
    elements.closureAlert.hidden = false;
    elements.closureAlert.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function hideClosureAlert() {
    if (elements.closureAlert) elements.closureAlert.hidden = true;
  }

  async function compressClosureEvidence(selected) {
    var file = selected.file;
    var isVideo = /^video\//i.test(file.type || '');
    var maxVideoBytes = 15 * 1024 * 1024;

    if (isVideo) {
      if (file.size > maxVideoBytes) {
        throw new Error('El video no puede superar ' + (maxVideoBytes / (1024 * 1024)) + ' MB.');
      }
      var dataUrl = await blobToDataUrl(file);
      return {
        name: sanitizeFileName(selected.name),
        mimeType: file.type || 'video/mp4',
        sizeBytes: file.size,
        dataUrl: dataUrl
      };
    }

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
          'style="width:150px;height:150px;object-fit:cover;display:block;" ' +
          'src="' + escAttr(initialUrl) + '" ' +
          'data-fallback-urls="' + escAttr(fallbackUrls) + '" ' +
          'onerror="window.handlePqrsEvidenceError_(this)">' +
          '</span>' +
          '<span class="small fw-semibold text-success mt-1">' +
          '<i class="bi bi-image me-1" aria-hidden="true"></i>Ver evidencia</span>' +
          '</a>'
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
