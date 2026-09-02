(function () {
  'use strict';

  var config = window.CONVIVENCIA_FORM_CONFIG || {};
  var API_BASE = config.apiBase || '';

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

  var categorias = [];
  var severidades = [];
  var evidencias = [];
  var motivoSeleccionado = '';
  var severidadSeleccionada = '';

  var DB_NAME = 'bulevar-verde-convivencia';
  var DB_VERSION = 1;
  var STORE_NAME = 'casosQueue';
  var CONFIG_CACHE_KEY = 'bv-convivencia-config-cache';
  var LOG_PREFIX = '[BV:Convivencia]';

  var flushInProgress = false;
  var queuedFlushRequest = null;
  var lastPassiveFlushAttempt = 0;
  var PASSIVE_FLUSH_THROTTLE_MS = 5000;

  var elements = {};

  var $ = function (id) { return document.getElementById(id); };

  function log(level, message, details) {
    var method = console[level] ? level : 'log';
    var timestamp = new Date().toISOString();
    if (typeof details === 'undefined') {
      console[method](LOG_PREFIX, timestamp, message);
      return;
    }
    console[method](LOG_PREFIX, timestamp, message, details);
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character];
    });
  }

  function showAlert(message, type) {
    var alertEl = $('convivenciaAlert');
    if (!alertEl) return;
    alertEl.className = 'alert alert-' + (type || 'danger');
    alertEl.innerHTML = '<i class="bi bi-exclamation-circle me-2"></i>' + message;
    alertEl.classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  function hideAlert() {
    var alertEl = $('convivenciaAlert');
    if (alertEl) alertEl.classList.add('hidden');
  }

  function showStatus(type, message) {
    var statusEl = $('convivenciaQueueStatus');
    if (!statusEl) return;
    statusEl.hidden = false;
    statusEl.className = 'alert alert-' + type;
    statusEl.textContent = message;

    setTimeout(function () {
      refreshQueueCount();
    }, 12000);
  }

  function renderNetworkStatus() {
    var network = $('convivenciaNetworkStatus');
    if (!network) return;

    var text = navigator.onLine ? 'Con conexión' : 'Sin conexión';
    var className = navigator.onLine ? 'text-success' : 'text-warning';
    var connection = navigator.connection ||
      navigator.mozConnection ||
      navigator.webkitConnection;

    if (navigator.onLine && connection && connection.effectiveType) {
      text += ' · ' + connection.effectiveType.toUpperCase();
    }

    network.textContent = text;
    network.className = className + ' fw-semibold';
  }

  async function refreshQueueCount() {
    var items = await getQueueItems();
    var count = items.length;
    var errorCount = items.filter(function (it) { return !!it.lastError; }).length;

    var queueEl = $('convivenciaQueueCount');
    if (queueEl) {
      if (errorCount > 0) {
        queueEl.className = 'badge text-bg-danger';
        queueEl.textContent = errorCount + ' error(es)';
      } else if (count > 0) {
        queueEl.className = 'badge text-bg-warning';
        queueEl.textContent = String(count) + ' pendiente(s)';
      } else {
        queueEl.className = 'badge text-bg-secondary';
        queueEl.textContent = '0';
      }
    }

    var floatBtn = $('convivenciaQueueFloatBtn');
    if (floatBtn) floatBtn.classList.toggle('hidden', count === 0);

    var floatBadge = $('convivenciaQueueFloatBadge');
    if (floatBadge) {
      if (count > 0) {
        floatBadge.textContent = String(count);
        floatBadge.style.display = '';
      } else {
        floatBadge.style.display = 'none';
      }
    }

    var retryBtn = $('convivenciaRetryBtn');
    if (retryBtn) retryBtn.hidden = count === 0;

    var statusEl = $('convivenciaQueueStatus');
    if (statusEl && count > 0) {
      statusEl.hidden = false;
      if (errorCount > 0) {
        statusEl.className = 'alert alert-danger';
        statusEl.innerHTML = '<i class="bi bi-exclamation-triangle me-2"></i>' +
          '<strong>' + errorCount + '</strong> caso(s) con errores. ' +
          'Revisar la cola de detalles para más información.';
      } else {
        statusEl.className = 'alert alert-warning';
        statusEl.innerHTML = '<i class="bi bi-cloud-arrow-up me-2"></i>' +
          '<strong>' + count + '</strong> caso(s) pendiente(s) de envío. ' +
          'La información permanece guardada en este dispositivo.';
      }
    } else if (statusEl && (!statusEl.dataset.persistent)) {
      statusEl.hidden = true;
    }

    var modal = document.getElementById('convivenciaQueueModal');
    if (modal && modal.classList.contains('show')) {
      await renderQueuePanel();
    }
  }

  async function renderQueuePanel() {
    var container = $('convivenciaQueueModalBody');
    if (!container) return;

    var items = await getQueueItems();

    if (items.length === 0) {
      container.innerHTML = '<p class="text-muted text-center"><i class="bi bi-check-circle me-2"></i>No hay casos en la cola.</p>';
      return;
    }

    var html = '<div>' + items.map(function (item, idx) {
      var isError = !!item.lastError;
      var uploadedCount = (item.evidenciasSubidas || []).length;
      var totalCount = (item.evidencias || []).length;
      var percentComplete = totalCount > 0 ? Math.round((uploadedCount / totalCount) * 100) : 0;

      var attemptText = item.attempts ? ' · ' + item.attempts + ' intento(s)' : '';
      var lastAttemptText = item.lastAttemptAt ? ' · Último intento: ' + new Date(item.lastAttemptAt).toLocaleTimeString('es-CO') : '';

      var evidenciasHtml = '';
      if (totalCount > 0) {
        evidenciasHtml = '<div class="cv-queue-evidences">' +
          '<strong>Evidencias:</strong> ' + uploadedCount + '/' + totalCount + ' subidas (' + percentComplete + '%)<br>' +
          '<div style="font-size: 0.8rem; color: #666;">';

        (item.evidencias || []).forEach(function (ev) {
          var isUploaded = item.evidenciasSubidas.some(function (sub) { return sub.name === ev.name; });
          var icon = isUploaded ? '✓' : '⏳';
          var color = isUploaded ? '#28a745' : '#ffc107';
          evidenciasHtml += '<span style="color: ' + color + ';">' + icon + ' ' + esc(ev.name) + '</span><br>';
        });

        evidenciasHtml += '</div></div>';
      }

      var errorHtml = isError ? '<div class="cv-queue-error-text"><strong>Error:</strong> ' + esc(item.lastError) + '</div>' : '';

      return '<div class="cv-queue-item ' + (isError ? 'error' : '') + '">' +
        '<div class="cv-queue-item-header">' +
        '<div class="cv-queue-item-title">Apto. ' + esc(item.apto) + ' - ' + esc(item.motivo) + '</div>' +
        '<span class="cv-queue-item-status ' + (isError ? 'error' : 'pending') + '">' + (isError ? '❌ Error' : '⏳ Pendiente') + '</span>' +
        '</div>' +
        '<div class="cv-queue-item-meta">' +
        '<strong>Severidad:</strong> ' + esc(item.severidad) + ' · ' +
        '<strong>Notificador:</strong> ' + esc(item.notificador) +
        attemptText + lastAttemptText +
        '</div>' +
        '<div class="cv-queue-item-meta">' +
        '<small>' + new Date(item.queuedAt).toLocaleString('es-CO') + '</small>' +
        '</div>' +
        evidenciasHtml +
        errorHtml +
        '<button type="button" class="btn btn-sm btn-outline-primary mt-2 cv-queue-retry-btn" data-client-request-id="' + esc(item.clientRequestId) + '">' +
        '<i class="bi bi-arrow-repeat me-1"></i>Reintentar este caso' +
        '</button>' +
        '</div>';
    }).join('') + '</div>';

    container.innerHTML = html;

    // Delegación de eventos para botones de reintento
    container.addEventListener('click', function (event) {
      var btn = event.target.closest('.cv-queue-retry-btn');
      if (!btn) return;

      var clientRequestId = btn.getAttribute('data-client-request-id');
      if (clientRequestId) {
        log('info', 'Reintentando caso desde panel.', { clientRequestId: clientRequestId });
        flushQueue(true, clientRequestId, 'reintento desde panel de cola');
      }
    });
  }

  var form = $('convivenciaCasoForm');
  if (!form) {
    log('warn', 'Formulario no encontrado; módulo no se inició.');
    return;
  }

  form.addEventListener('submit', guardarCaso);

  var descInput = $('convivenciaDescripcion');
  if (descInput) {
    descInput.addEventListener('input', function () {
      var countEl = $('convivenciaDescCount');
      if (countEl) countEl.textContent = this.value.length;
    });
  }

  setupEvidenceHandlers();

  async function cargarConfiguracion() {
    try {
      var token = await getAuthToken();
      var response = await fetch(API_BASE + '/api/v1/convivencia/config', {
        headers: { Authorization: 'Bearer ' + token }
      });
      var body = await response.json();
      if (response.ok) {
        categorias = (body.data && body.data.categorias) || [];
        severidades = (body.data && body.data.severidades) || [];
        var cacheData = {
          categorias: categorias,
          severidades: severidades,
          cachedAt: new Date().toISOString()
        };
        try {
          localStorage.setItem(CONFIG_CACHE_KEY, JSON.stringify(cacheData));
        } catch (e) {
          log('warn', 'No fue posible cachear configuración en localStorage', e);
        }
        cargarCategorias();
        cargarSeveridades();
      }
    } catch (error) {
      log('error', 'Error cargando configuración:', error);
      var cached = null;
      try {
        cached = JSON.parse(localStorage.getItem(CONFIG_CACHE_KEY) || 'null');
      } catch (e) {
        log('warn', 'No fue posible leer caché de configuración', e);
      }

      if (cached) {
        log('info', 'Usando configuración cacheada');
        categorias = cached.categorias || [];
        severidades = cached.severidades || [];
        cargarCategorias();
        cargarSeveridades();
        showAlert('Se está usando una copia guardada de la configuración (puede no estar actualizada)', 'warning');
      } else {
        showAlert('No se pudo cargar la configuración');
      }
    }
  }

  function cargarCategorias() {
    var container = $('convivenciaCategoriasContainer');
    if (!container) return;
    if (categorias.length === 0) {
      container.innerHTML = '<p class="text-muted">Cargando categorías...</p>';
      return;
    }
    var html = categorias.map(function (cat, idx) {
      var categId = 'cv-categ-' + idx;
      var subcategHtml = cat.subcategorias.map(function (sub) {
        return '<button type="button" class="cv-category-badge cv-subcategory" style="display:none; margin-left:1rem;" data-category="' + esc(sub) + '">' + esc(sub) + '</button>';
      }).join('');
      return '<div>' +
        '<button type="button" class="cv-category-badge cv-main-category" data-idx="' + idx + '" style="font-size:1.1rem;">' + esc(cat.emoji) + ' ' + esc(cat.nombre) + '</button>' +
        '<div id="' + categId + '" class="cv-subcategories" style="display:none;">' + subcategHtml + '</div>' +
        '</div>';
    }).join('');
    container.innerHTML = html;
  }

  function cargarSeveridades() {
    var container = $('convivenciaSeveridadContainer');
    if (!container || severidades.length === 0) return;
    var html = severidades.map(function (sev) {
      var esLlamadoAtencion = sev.requiereProcesoFormal === false;
      var claseExtra = esLlamadoAtencion ? ' cv-severity-badge-informal' : '';
      var detalle = esLlamadoAtencion
        ? 'no requiere proceso formal'
        : sev.cuotas + ' cuota' + (sev.cuotas !== 1 ? 's' : '') + ' referencial';
      return '<button type="button" class="cv-severity-badge' + claseExtra + '" data-nombre="' + esc(sev.nombre) + '" data-cuotas="' + sev.cuotas + '">' +
        '<strong>' + esc(sev.nombre) + '</strong> (' + detalle + ')</button>';
    }).join('');
    container.innerHTML = html;
  }

  function siguiente(desde, hasta) {
    if (!validarPaso(desde)) return;
    ocultarPasos();
    var paso = $('convivenciaPaso' + hasta);
    if (paso) paso.classList.remove('hidden');
    marcarPasoCompleto(desde);
    if (hasta === 2) cargarResumenApartamento();
    if (hasta === 4) actualizarResumen();
    window.scrollTo(0, 0);
  }

  function anterior(desde, hasta) {
    ocultarPasos();
    var paso = $('convivenciaPaso' + hasta);
    if (paso) paso.classList.remove('hidden');
    window.scrollTo(0, 0);
  }

  function ocultarPasos() {
    for (var i = 1; i <= 4; i++) {
      var paso = $('convivenciaPaso' + i);
      if (paso) paso.classList.add('hidden');
    }
  }

  function marcarPasoCompleto(paso) {
    var step = $('convivenciaStep' + paso);
    if (step) step.classList.add('completed');
  }

  function validarPaso(paso) {
    var apto = $('convivenciaApto');
    var motivo = $('convivenciaMotivoCustom');
    var descripcion = $('convivenciaDescripcion');
    var razon = $('convivenciaRazonNotificacion');
    var notificador = $('convivenciaNotificador');

    if (paso === 1) {
      if (!apto || !apto.value.trim() || !notificador || !notificador.value.trim()) {
        showAlert('Apartamento y notificador son obligatorios');
        return false;
      }
    }
    if (paso === 2) {
      var motivoVal = motivoSeleccionado || (motivo ? motivo.value.trim() : '');
      if (!motivoVal || !severidadSeleccionada) {
        showAlert('Selecciona o especifica un motivo y una severidad');
        return false;
      }
    }
    if (paso === 3) {
      if (!descripcion || !descripcion.value.trim() || !razon || !razon.value.trim()) {
        showAlert('La descripción de los hechos y la razón de la notificación son obligatorias');
        return false;
      }
    }
    return true;
  }

  function actualizarResumen() {
    var apto = $('convivenciaApto');
    var motivo = $('convivenciaMotivoCustom');
    var descripcion = $('convivenciaDescripcion');
    var razon = $('convivenciaRazonNotificacion');
    var notificador = $('convivenciaNotificador');

    if (apto) $('convivenciaReviewApto').textContent = apto.value.trim();
    if (notificador) $('convivenciaReviewNotificador').textContent = notificador.value.trim();
    $('convivenciaReviewMotivo').textContent = motivoSeleccionado || (motivo ? motivo.value.trim() : '');
    if (descripcion) {
      $('convivenciaReviewDescripcion').textContent = descripcion.value.trim();
      $('convivenciaCharCountReview').textContent = descripcion.value.length;
    }
    if (razon) $('convivenciaReviewRazon').textContent = razon.value.trim();
    $('convivenciaReviewFecha').textContent = new Date().toLocaleDateString('es-CO');

    if (severidadSeleccionada) {
      var severidadConfig = severidades.find(function (s) { return s.nombre === severidadSeleccionada; });
      if (severidadConfig) {
        $('convivenciaReviewSeveridad').textContent = severidadSeleccionada + ' (' + severidadConfig.cuotas + ' cuota' + (severidadConfig.cuotas !== 1 ? 's' : '') + ')';
      }
    }

    if (evidencias.length > 0) {
      var reviewSection = $('convivenciaReviewEvidenciasSection');
      if (reviewSection) reviewSection.classList.remove('hidden');
      var html = evidencias.map(function (evidence, idx) {
        var isVideo = /^video\//i.test(evidence.type);
        var isPdf = evidence.type === 'application/pdf';
        var media = isPdf
          ? '<div style="width: 200px; height: 80px; display:flex; align-items:center; gap:.5rem; border:1px solid #ddd; border-radius:4px; padding:.5rem;">' +
            '<i class="bi bi-file-earmark-pdf text-danger" style="font-size:1.8rem;"></i><span class="small text-truncate">' + esc(evidence.name) + '</span></div>'
          : isVideo
          ? '<video controls style="max-width: 200px; max-height: 150px; border-radius: 4px;" src="' + evidence.dataUrl + '" />'
          : '<img src="' + evidence.dataUrl + '" style="max-width: 200px; max-height: 150px; border-radius: 4px;" alt="Evidencia ' + (idx + 1) + '">';
        return '<div class="mb-2">' + media +
          '<p class="small text-muted mt-1">' + esc(evidence.name) + ' (' + (evidence.size / 1024).toFixed(1) + ' KB)</p></div>';
      }).join('');
      $('convivenciaReviewEvidencias').innerHTML = html;
    }
  }

  async function guardarCaso(e) {
    e.preventDefault();
    hideAlert();

    var apto = $('convivenciaApto');
    var motivo = $('convivenciaMotivoCustom');
    var descripcion = $('convivenciaDescripcion');
    var razon = $('convivenciaRazonNotificacion');
    var notificador = $('convivenciaNotificador');

    try {
      var btn = $('convivenciaSubmitBtn');
      if (btn) btn.disabled = true;

      var caso = {
        clientRequestId: createRequestId(),
        reportedAt: new Date().toISOString(),
        queuedAt: new Date().toISOString(),
        attempts: 0,
        apto: apto ? apto.value.trim() : '',
        motivo: motivoSeleccionado || (motivo ? motivo.value.trim() : ''),
        descripcion: descripcion ? descripcion.value.trim() : '',
        razonNotificacion: razon ? razon.value.trim() : '',
        notificador: notificador ? notificador.value.trim() : '',
        severidad: severidadSeleccionada,
        evidencias: evidencias,
        evidenciasSubidas: []
      };

      await putQueueItem(caso);
      log('info', 'Caso guardado en IndexedDB.', { clientRequestId: caso.clientRequestId });
      resetForm();
      await refreshQueueCount();

      showStatus(
        'success',
        'El caso quedó guardado de forma segura en este dispositivo. Se intentará enviar ahora.'
      );

      await flushQueue(true, caso.clientRequestId, 'envío inmediato después de guardar');
    } catch (error) {
      log('error', 'Error al guardar el caso.', error);
      showAlert('Error al crear caso: ' + (error.message || error));
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function flushQueue(force, preferredId, trigger) {
    trigger = trigger || 'no especificado';

    log('info', 'Solicitud de procesamiento de cola.', {
      trigger: trigger,
      force: Boolean(force),
      preferredId: preferredId || null,
      online: navigator.onLine
    });

    if (!force) {
      var now = Date.now();
      if (now - lastPassiveFlushAttempt < PASSIVE_FLUSH_THROTTLE_MS) {
        log('debug', 'Se omitió reintento pasivo por throttle (demasiado pronto).');
        return;
      }
      lastPassiveFlushAttempt = now;
    }

    if (flushInProgress) {
      queuedFlushRequest = {
        force: Boolean(force) || Boolean(queuedFlushRequest && queuedFlushRequest.force),
        preferredId: preferredId || (queuedFlushRequest && queuedFlushRequest.preferredId) || null,
        trigger: trigger
      };
      return;
    }

    if (!navigator.onLine) {
      log('info', 'Se omite el intento de envío (offline).');
      await refreshQueueCount();
      return;
    }

    if (!API_BASE) {
      log('error', 'No se puede enviar: falta configurar API_BASE.');
      showStatus('warning', 'El caso está en cola, pero falta configurar la URL del servidor.');
      await refreshQueueCount();
      return;
    }

    flushInProgress = true;
    var retryBtn = $('convivenciaRetryBtn');
    if (retryBtn) retryBtn.disabled = true;

    log('info', 'Procesamiento de cola iniciado.', { trigger: trigger });

    try {
      var items = await getQueueItems();
      log('info', 'Casos recuperados de IndexedDB.', { count: items.length });

      if (items.length === 0) {
        log('info', 'No hay casos pendientes de envío.');
        return;
      }

      if (preferredId) {
        items.sort(function (a, b) {
          if (a.clientRequestId === preferredId) return -1;
          if (b.clientRequestId === preferredId) return 1;
          return String(a.queuedAt).localeCompare(String(b.queuedAt));
        });
      }

      for (var index = 0; index < items.length; index += 1) {
        var item = items[index];

        try {
          item.attempts = Number(item.attempts || 0) + 1;
          item.lastAttemptAt = new Date().toISOString();
          delete item.lastError;
          await putQueueItem(item);

          log('info', 'Enviando caso al servidor.', { clientRequestId: item.clientRequestId });

          var evidenciasRestantes = (item.evidencias || []).filter(function (ev) {
            return !item.evidenciasSubidas.some(function (sub) { return sub.name === ev.name; });
          });

          if (evidenciasRestantes.length > 0) {
            log('info', 'Subiendo evidencias.', { count: evidenciasRestantes.length });
            for (var i = 0; i < evidenciasRestantes.length; i++) {
              try {
                var uploadResult = await uploadEvidenceToGoogle(evidenciasRestantes[i], item.apto);
                if (uploadResult.ok) {
                  item.evidenciasSubidas.push({ name: evidenciasRestantes[i].name, url: uploadResult.url });
                  await putQueueItem(item);
                  log('info', 'Evidencia subida.', { name: evidenciasRestantes[i].name });
                } else {
                  log('error', 'Error al subir evidencia (rechazada por servidor).', { name: evidenciasRestantes[i].name, error: uploadResult.error });
                  item.lastError = uploadResult.error || 'La evidencia fue rechazada por el servidor';
                  await putQueueItem(item);
                  showStatus('warning', 'La evidencia "' + evidenciasRestantes[i].name + '" fue rechazada: ' + (uploadResult.error || 'error desconocido') + '. El caso permanece en la cola.');
                  break;
                }
              } catch (uploadError) {
                var transportFailure = Boolean(
                  uploadError && (
                    uploadError.code === 'POST_TIMEOUT' ||
                    uploadError.code === 'POST_SUBMIT_FAILED' ||
                    /conectar|cargar el servicio|POST no recibió|tiempo permitido|Failed to fetch/i.test((uploadError.message || ''))
                  )
                );

                if (transportFailure) {
                  log('error', 'Error de transporte subiendo evidencia; se detiene la cola.', uploadError);
                  item.lastError = uploadError.message || 'Error de transporte al subir evidencia';
                  await putQueueItem(item);
                  showStatus('warning', 'El caso continúa guardado en la cola. Se reintentará cuando haya una conexión estable.');

                  if (!navigator.onLine) {
                    break;
                  }
                  break;
                } else {
                  log('warn', 'Error al subir evidencia (no es de transporte); se continúa.', uploadError);
                }
              }
            }
          }

          if (!navigator.onLine) {
            log('info', 'Se detectó que el navegador está offline; se detiene la cola.');
            break;
          }

          var caseData = {
            clientRequestId: item.clientRequestId,
            apartamento: item.apto,
            motivo: item.motivo,
            descripcion: item.descripcion,
            razonNotificacion: item.razonNotificacion,
            notificador: item.notificador,
            severidad: item.severidad,
            evidencias: item.evidenciasSubidas.map(function (sub) { return sub.url; })
          };

          var token = await getAuthToken();
          var createResponse = await fetch(API_BASE + '/api/v1/convivencia/casos', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ' + token
            },
            body: JSON.stringify(caseData)
          });

          var createBody = await createResponse.json();
          if (!createResponse.ok) {
            throw new Error((createBody.error && createBody.error.message) || 'El servidor no confirmó el registro.');
          }

          var createResult = createBody.data;

          await deleteQueueItem(item.clientRequestId);
          log('info', 'Caso confirmado y eliminado de la cola.', { clientRequestId: item.clientRequestId, caseId: createResult.caseCode });

          showStatus(
            'success',
            'Caso enviado correctamente. ID: ' + createResult.caseCode
          );

          setTimeout(function () {
            ocultarPasos();
            var paso1 = $('convivenciaPaso1');
            if (paso1) paso1.classList.remove('hidden');
            var steps = document.querySelectorAll('[id^="convivenciaStep"]');
            for (var j = 0; j < steps.length; j++) {
              steps[j].classList.remove('completed');
            }
          }, 3000);

        } catch (error) {
          item.lastError = error.message || String(error);
          await putQueueItem(item);

          log('error', 'Falló el envío del caso; permanece en la cola.', {
            clientRequestId: item.clientRequestId,
            error: item.lastError,
            online: navigator.onLine
          });

          showStatus(
            'warning',
            'El caso continúa guardado en la cola. Se reintentará cuando haya una conexión estable.'
          );

          if (!navigator.onLine) {
            log('warn', 'Navegador offline; se detiene la cola.');
            break;
          }

          var transportFailure = Boolean(
            error && (
              error.code === 'POST_TIMEOUT' ||
              error.code === 'POST_SUBMIT_FAILED' ||
              /conectar|cargar el servicio|POST no recibió|tiempo permitido|Failed to fetch/i.test(item.lastError)
            )
          );

          if (transportFailure) {
            log('warn', 'Fallo de transporte; se detiene la cola para no repetir con otros casos.');
            break;
          }
        }
      }
    } catch (error) {
      log('error', 'Error general procesando la cola.', error);
      showStatus('danger', 'No fue posible procesar la cola. Revisa la consola para más detalles.');
    } finally {
      flushInProgress = false;
      if (retryBtn) retryBtn.disabled = false;
      try {
        await refreshQueueCount();
      } catch (error) {
        log('error', 'Error al actualizar contador.', error);
      }

      if (queuedFlushRequest) {
        var nextFlush = queuedFlushRequest;
        queuedFlushRequest = null;
        log('info', 'Ejecutando intento programado.', nextFlush);
        window.setTimeout(function () {
          flushQueue(nextFlush.force, nextFlush.preferredId, 'reintento programado');
        }, 0);
      }
    }
  }

  async function uploadEvidenceToGoogle(evidence, apto) {
    try {
      var token = await getAuthToken();
      var response = await fetch(API_BASE + '/api/v1/convivencia/evidencias', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token
        },
        body: JSON.stringify({
          mimeType: evidence.type || 'image/jpeg',
          dataUrl: evidence.dataUrl,
          contexto: 'caso',
          apartamento: apto || ''
        })
      });

      var result = null;
      try {
        result = await response.json();
      } catch (parseError) {
        throw new Error('Respuesta inválida del servidor al subir evidencia (no es JSON válido)');
      }

      if (!response.ok) {
        return { ok: false, error: (result.error && result.error.message) || ('Error del servidor: ' + response.status) };
      }

      return { ok: true, url: result.data.url };
    } catch (error) {
      log('error', 'Error subiendo evidencia:', error);
      throw error;
    }
  }

  function setupEvidenceHandlers() {
    var cameraBtn = $('convivenciaOpenCameraBtn');
    var galleryBtn = $('convivenciaOpenGalleryBtn');
    var galleryInput = $('convivenciaGalleryInput');

    if (cameraBtn) cameraBtn.addEventListener('click', captureEvidence);
    if (galleryBtn) galleryBtn.addEventListener('click', function () {
      if (galleryInput) galleryInput.click();
    });
    if (galleryInput) galleryInput.addEventListener('change', handleEvidenceSelection);
  }

  async function captureEvidence() {
    if (!window.BVEvidenceCamera) {
      showAlert('No fue posible cargar el módulo seguro de cámara. Recarga la página e intenta nuevamente.');
      return;
    }

    var apto = $('convivenciaApto');

    try {
      var evidence = await window.BVEvidenceCamera.capture({
        contextLabel: 'Evidencia de convivencia - Reporte',
        detailLines: apto && apto.value ? ['Apartamento: ' + apto.value] : [],
        filePrefix: 'convivencia-caso',
        maxDimension: 1600,
        quality: 0.84
      });

      evidencias.push(evidence);
      actualizarListaEvidencias();
      showAlert('Fotografía tomada con fecha y ubicación incorporadas.', 'success');
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      showAlert('No fue posible tomar la fotografía: ' + (error.message || error));
    }
  }

  async function handleEvidenceSelection(event) {
    var file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;

    var isImage = /^image\//i.test(file.type);
    var isVideo = /^video\//i.test(file.type) &&
                  /(mp4|quicktime|webm)/.test(file.type);
    var isPdf = file.type === 'application/pdf';

    if (!isImage && !isVideo && !isPdf) {
      showAlert('Solo se permiten archivos de imagen, video (MP4, MOV, WebM) o PDF');
      return;
    }

    if (isVideo && file.size > 50 * 1024 * 1024) {
      showAlert('El video es demasiado grande (máximo 50 MB). Por favor selecciona un video más pequeño o más corto.');
      return;
    }

    if (isPdf && file.size > 50 * 1024 * 1024) {
      showAlert('El documento es demasiado grande (máximo 50 MB).');
      return;
    }

    try {
      var data = null;
      if (isImage) {
        data = await compressImage(file);
        showAlert('Imagen comprimida y agregada exitosamente', 'success');
      } else if (isVideo) {
        data = await readFileAsDataUrl(file);
        showAlert('Video agregado exitosamente', 'success');
      } else {
        data = await readFileAsDataUrl(file);
        showAlert('Documento agregado exitosamente', 'success');
      }
      evidencias.push(data);
      actualizarListaEvidencias();
    } catch (error) {
      showAlert('Error al procesar archivo: ' + error.message);
    }
  }

  async function compressImage(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) {
        var img = new Image();
        img.onload = function () {
          var canvas = document.createElement('canvas');
          var width = img.width;
          var height = img.height;
          var maxDim = 1600;
          if (Math.max(width, height) > maxDim) {
            var ratio = maxDim / Math.max(width, height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          canvas.width = width;
          canvas.height = height;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          var quality = 0.82;
          canvas.toBlob(function (blob) {
            var reader2 = new FileReader();
            reader2.onload = function () {
              resolve({
                name: file.name,
                size: blob.size,
                dataUrl: reader2.result,
                blob: blob
              });
            };
            reader2.readAsDataURL(blob);
          }, 'image/jpeg', quality);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) {
        resolve({
          name: file.name,
          size: file.size,
          type: file.type,
          dataUrl: e.target.result,
          blob: file
        });
      };
      reader.onerror = function () {
        reject(new Error('No se pudo leer el archivo'));
      };
      reader.readAsDataURL(file);
    });
  }

  function actualizarListaEvidencias() {
    var container = $('convivenciaEvidenciasList');
    if (!container) return;
    if (evidencias.length === 0) {
      container.innerHTML = '<small class="text-muted d-block">Ninguna evidencia seleccionada</small>';
      return;
    }
    var html = evidencias.map(function (evidence, idx) {
      var isVideo = /^video\//i.test(evidence.type);
      var isPdf = evidence.type === 'application/pdf';
      var icon = isPdf ? 'bi-file-earmark-pdf' : (isVideo ? 'bi-camera-video' : 'bi-image');
      return '<div class="card mb-2">' +
        '<div class="card-body p-2">' +
        '<div class="d-flex justify-content-between align-items-center">' +
        '<div><i class="bi ' + icon + ' me-2"></i><strong>' + esc(evidence.name) + '</strong><br>' +
        '<small class="text-muted">' + (evidence.size / 1024).toFixed(1) + ' KB</small></div>' +
        '<button type="button" class="btn btn-danger btn-sm cv-remove-evidence" data-idx="' + idx + '">' +
        '<i class="bi bi-trash"></i></button></div></div></div>';
    }).join('');
    container.innerHTML = html;
  }

  var categoriesContainer = $('convivenciaCategoriasContainer');
  if (categoriesContainer) {
    categoriesContainer.addEventListener('click', function (event) {
      var mainCat = event.target.closest('.cv-main-category');
      if (mainCat) {
        var idx = mainCat.getAttribute('data-idx');
        var categId = 'cv-categ-' + idx;
        var subcatDiv = $(categId);
        if (subcatDiv) {
          var isOpen = subcatDiv.style.display !== 'none';
          document.querySelectorAll('.cv-subcategories').forEach(function (el) {
            el.style.display = 'none';
          });
          document.querySelectorAll('.cv-main-category').forEach(function (btn) {
            btn.classList.remove('expanded');
            btn.classList.remove('selected');
          });
          if (!isOpen) {
            subcatDiv.style.display = '';
            mainCat.classList.add('expanded');
          }
        }
        // Set motivoSeleccionado to the main category name
        motivoSeleccionado = (categorias[idx] && categorias[idx].nombre) || '';
        // Clear any free-text motivo
        var motivo = $('convivenciaMotivoCustom');
        if (motivo) motivo.value = '';
        // Clear .selected from all subcategories and mark this main category as selected
        var badges = categoriesContainer.querySelectorAll('.cv-subcategory');
        for (var i = 0; i < badges.length; i++) {
          badges[i].classList.remove('selected');
        }
        mainCat.classList.add('selected');
        return;
      }

      var subCat = event.target.closest('.cv-subcategory');
      if (subCat) {
        motivoSeleccionado = subCat.getAttribute('data-category') || '';
        var motivo = $('convivenciaMotivoCustom');
        if (motivo) motivo.value = '';
        var badges = categoriesContainer.querySelectorAll('.cv-subcategory');
        for (var i = 0; i < badges.length; i++) {
          badges[i].classList.remove('selected');
        }
        subCat.classList.add('selected');
        var mainCats = categoriesContainer.querySelectorAll('.cv-main-category');
        for (var i = 0; i < mainCats.length; i++) {
          mainCats[i].classList.remove('selected');
          mainCats[i].classList.remove('expanded');
        }
        var parentIdx = event.target.closest('.cv-main-category');
        if (!parentIdx) {
          var subcatParent = subCat.closest('.cv-subcategories');
          if (subcatParent && subcatParent.id) {
            var idMatch = subcatParent.id.match(/cv-categ-(\d+)/);
            if (idMatch) {
              var parentIdx = parseInt(idMatch[1], 10);
              var parentBtn = categoriesContainer.querySelector('.cv-main-category[data-idx="' + parentIdx + '"]');
              if (parentBtn) {
                parentBtn.classList.add('selected');
              }
            }
          }
        }
      }
    });
  }

  var severidadContainer = $('convivenciaSeveridadContainer');
  if (severidadContainer) {
    severidadContainer.addEventListener('click', function (event) {
      var badge = event.target.closest('.cv-severity-badge');
      if (!badge) return;
      severidadSeleccionada = badge.getAttribute('data-nombre') || '';
      var cuotas = badge.getAttribute('data-cuotas');
      var cuotasInfo = $('convivenciaCuotasInfo');
      if (cuotasInfo) cuotasInfo.textContent = 'Equivalente a ' + cuotas + ' cuota' + (cuotas != 1 ? 's' : '') + ' de administración';
      var badges = severidadContainer.querySelectorAll('.cv-severity-badge');
      for (var i = 0; i < badges.length; i++) {
        badges[i].classList.remove('selected');
      }
      badge.classList.add('selected');
    });
  }

  var evidenciasList = $('convivenciaEvidenciasList');
  if (evidenciasList) {
    evidenciasList.addEventListener('click', function (event) {
      var btn = event.target.closest('.cv-remove-evidence');
      if (!btn) return;
      var idx = parseInt(btn.getAttribute('data-idx'), 10);
      if (!isNaN(idx)) {
        evidencias.splice(idx, 1);
        actualizarListaEvidencias();
      }
    });
  }

  var buttonMaps = [
    { paso: 1, siguiente: 2, btnId: 'convivenciaSiguiente1' },
    { paso: 2, anterior: 1, btnId: 'convivenciaAnterior2' },
    { paso: 2, siguiente: 3, btnId: 'convivenciaSiguiente2' },
    { paso: 3, anterior: 2, btnId: 'convivenciaAnterior3' },
    { paso: 3, siguiente: 4, btnId: 'convivenciaSiguiente3' },
    { paso: 4, anterior: 3, btnId: 'convivenciaAnterior4' }
  ];

  buttonMaps.forEach(function (map) {
    var btn = $(map.btnId);
    if (btn) {
      btn.addEventListener('click', function () {
        if (map.siguiente !== undefined) {
          siguiente(map.paso, map.siguiente);
        } else if (map.anterior !== undefined) {
          anterior(map.paso, map.anterior);
        }
      });
    }
  });

  function openDb() {
    return new Promise(function (resolve, reject) {
      var request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          var store = db.createObjectStore(STORE_NAME, { keyPath: 'clientRequestId' });
          store.createIndex('queuedAt', 'queuedAt', { unique: false });
        }
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () {
        reject(request.error || new Error('No fue posible abrir IndexedDB.'));
      };
    });
  }

  async function putQueueItem(item) {
    var db = await openDb();
    return transactionPromise(db, 'readwrite', function (store) {
      store.put(item);
    });
  }

  async function deleteQueueItem(clientRequestId) {
    var db = await openDb();
    return transactionPromise(db, 'readwrite', function (store) {
      store.delete(clientRequestId);
    });
  }

  async function getQueueItems() {
    var db = await openDb();
    return new Promise(function (resolve, reject) {
      var transaction = db.transaction(STORE_NAME, 'readonly');
      var store = transaction.objectStore(STORE_NAME);
      var request = store.getAll();

      request.onsuccess = function () {
        resolve((request.result || []).sort(function (a, b) {
          return String(a.queuedAt).localeCompare(String(b.queuedAt));
        }));
      };
      request.onerror = function () {
        reject(request.error || new Error('No fue posible consultar IndexedDB.'));
      };
      transaction.oncomplete = function () { db.close(); };
    });
  }

  function transactionPromise(db, mode, operation) {
    return new Promise(function (resolve, reject) {
      var transaction = db.transaction(STORE_NAME, mode);
      var store = transaction.objectStore(STORE_NAME);

      try {
        operation(store);
      } catch (error) {
        db.close();
        reject(error);
        return;
      }

      transaction.oncomplete = function () { db.close(); resolve(); };
      transaction.onerror = function () {
        db.close();
        reject(transaction.error || new Error('Error en transacción de IndexedDB.'));
      };
      transaction.onabort = transaction.onerror;
    });
  }

  function resetForm() {
    if (form) form.reset();
    if (form) form.classList.remove('was-validated');
    evidencias = [];
    motivoSeleccionado = '';
    severidadSeleccionada = '';
    actualizarListaEvidencias();
  }

  function createRequestId() {
    if (window.crypto && window.crypto.randomUUID) {
      return 'CREQ-' + window.crypto.randomUUID();
    }
    return 'CREQ-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  function initEventListeners() {
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
      log('debug', 'Ventana enfocada; comprobando cola.');
      flushQueue(false, null, 'foco de ventana');
    });

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        log('debug', 'Página visible; comprobando cola.');
        flushQueue(false, null, 'página visible');
      }
    });

    if (navigator.connection && navigator.connection.addEventListener) {
      navigator.connection.addEventListener('change', function () {
        log('info', 'Cambió la conexión.');
        renderNetworkStatus();
        flushQueue(false, null, 'cambio de conexión');
      });
    }

    window.setInterval(function () {
      if (!document.hidden) {
        log('debug', 'Temporizador periódico; comprobando cola.');
        flushQueue(false, null, 'temporizador de 60 segundos');
      }
    }, 60000);

    elements.retryBtn = $('convivenciaRetryBtn');
    if (elements.retryBtn) {
      elements.retryBtn.addEventListener('click', function () {
        log('info', 'Botón "Intentar enviar" presionado.');
        flushQueue(true, null, 'botón manual');
      });
    }

    var queueRetryAllBtn = $('convivenciaQueueRetryAllBtn');
    if (queueRetryAllBtn) {
      queueRetryAllBtn.addEventListener('click', function () {
        log('info', 'Botón "Reintentar todos" en modal presionado.');
        flushQueue(true, null, 'botón reintentar todos en panel');
      });
    }

    var queueModal = document.getElementById('convivenciaQueueModal');
    if (queueModal) {
      queueModal.addEventListener('show.bs.modal', function () {
        log('debug', 'Modal de cola abierto; renderizando panel.');
        renderQueuePanel();
      });
    }
  }

  async function cargarResumenApartamento() {
    var container = $('convivenciaResumenApto');
    var apto = $('convivenciaApto');
    var aptoValue = apto ? apto.value.trim() : '';
    if (!container || !aptoValue) return;

    container.classList.remove('hidden');
    container.innerHTML = '<p class="text-muted mb-0"><i class="bi bi-hourglass-split me-2"></i>Consultando historial del apartamento...</p>';

    try {
      var token = await getAuthToken();
      var response = await fetch(API_BASE + '/api/v1/convivencia/apartamentos/' + encodeURIComponent(aptoValue) + '/resumen', {
        headers: { Authorization: 'Bearer ' + token }
      });
      var body = await response.json();
      if (!response.ok) throw new Error((body.error && body.error.message) || 'Error al consultar historial');
      renderResumenApartamento(body.data);
    } catch (error) {
      log('warn', 'No se pudo cargar el historial del apartamento', error);
      container.classList.add('hidden');
    }
  }

  function renderResumenApartamento(data) {
    var container = $('convivenciaResumenApto');
    if (!container) return;

    if (!data.unidadEncontrada || data.totalCasos === 0) {
      container.innerHTML = '<div class="alert alert-secondary mb-0 py-2"><i class="bi bi-info-circle me-2"></i>Sin casos previos registrados para este apartamento.</div>';
      return;
    }

    var severidadBadges = Object.keys(data.porSeveridad).map(function (nombre) {
      return '<span class="cv-info-badge me-1">' + esc(nombre) + ': ' + data.porSeveridad[nombre] + '</span>';
    }).join('');

    var recientesHtml = (data.casosRecientes || []).map(function (caso) {
      return '<li>' + esc(caso.caseCode) + ' — ' + esc(caso.motivo) + ' <span class="text-muted">(' + esc(caso.severidad) + ', ' + esc(caso.estado) + ')</span></li>';
    }).join('');

    container.innerHTML =
      '<div class="alert alert-warning mb-0 py-2">' +
      '<p class="mb-2"><i class="bi bi-clock-history me-2"></i><strong>Historial del apartamento ' + esc(data.apartamento) + ':</strong> ' +
      data.totalCasos + ' caso(s) · ' + data.sinResolver + ' sin resolver · ' + data.resueltos + ' resuelto(s)</p>' +
      '<div class="mb-2">' + severidadBadges + '</div>' +
      (recientesHtml ? '<ul class="mb-0 small">' + recientesHtml + '</ul>' : '') +
      '</div>';
  }

  function llenarNotificadorActual() {
    var notificadorInput = $('convivenciaNotificador');
    if (!notificadorInput || !window.firebase || !firebase.auth) return;

    firebase.auth().onAuthStateChanged(function (user) {
      if (!user) return;
      user.getIdToken().then(function (token) {
        return fetch(API_BASE + '/api/v1/vigilancia/yo', {
          headers: { Authorization: 'Bearer ' + token }
        });
      }).then(function (response) {
        return response.json().then(function (body) {
          if (!response.ok) throw new Error((body.error && body.error.message) || 'Error');
          return body;
        });
      }).then(function (body) {
        notificadorInput.value = (body.data && body.data.nombreCompleto) || 'Usuario';
      }).catch(function (error) {
        log('warn', 'No se pudo obtener el nombre del colaborador autenticado', error);
        notificadorInput.value = 'Usuario';
      });
    });
  }

  async function init() {
    log('info', 'Inicializando módulo.', {
      online: navigator.onLine,
      apiBase: API_BASE ? 'configurada' : 'sin configurar'
    });

    renderNetworkStatus();
    initEventListeners();
    llenarNotificadorActual();
    cargarConfiguracion();
    refreshQueueCount();
    flushQueue(false, null, 'inicio del módulo');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
