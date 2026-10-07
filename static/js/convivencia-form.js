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
  var urlsVistaPrevia = [];
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

  // Las severidades pueden valer fracciones de cuota (0,5 · 1,5 CDAMV).
  function formatearCuotas(cuotas) {
    var valor = Number(cuotas) || 0;
    return valor.toLocaleString('es-CO', { maximumFractionDigits: 2 }) + ' cuota' + (valor !== 1 ? 's' : '');
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
          '<strong>' + count + '</strong> caso(s) pendiente(s) de completar y finalizar. ' +
          'La información permanece guardada en este dispositivo; el caso aún no ha sido finalizado.';
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

    var registros = items.filter(function (item) { return item.version === 2; });
    items = items.filter(function (item) { return item.version !== 2; });
    enlazarAccionesRegistro(container);

    var html = '<div>' + registros.map(htmlRegistro).join('') + items.map(function (item, idx) {
      normalizarItemCola(item);
      var isError = !!item.lastError;
      var uploadedCount = item.evidencias.filter(function (ev) { return !!subidaDe(item, ev); }).length;
      var totalCount = item.evidencias.length;
      var percentComplete = totalCount > 0 ? Math.round((uploadedCount / totalCount) * 100) : 0;

      var attemptText = item.attempts ? ' · ' + item.attempts + ' intento(s)' : '';
      var lastAttemptText = item.lastAttemptAt ? ' · Último intento: ' + new Date(item.lastAttemptAt).toLocaleTimeString('es-CO') : '';

      var evidenciasHtml = '';
      if (totalCount > 0) {
        evidenciasHtml = '<div class="cv-queue-evidences">' +
          '<strong>Evidencias:</strong> ' + uploadedCount + '/' + totalCount + ' subidas (' + percentComplete + '%)<br>' +
          '<div style="font-size: 0.8rem; color: #666;">';

        item.evidencias.forEach(function (ev) {
          var isUploaded = !!subidaDe(item, ev);
          var icon = isUploaded ? '✓' : (ev.error ? '✗' : '⏳');
          var color = isUploaded ? '#28a745' : (ev.error ? '#dc3545' : '#b8860b');
          evidenciasHtml += '<span style="color: ' + color + ';">' + icon + ' ' + esc(ev.name) + '</span>';
          if (ev.error) {
            evidenciasHtml += ' <small class="text-danger">' + esc(ev.error) + '</small>';
          }
          if (!isUploaded) {
            evidenciasHtml += ' <button type="button" class="btn btn-link btn-sm p-0 ms-1 cv-queue-remove-ev-btn"' +
              ' data-client-request-id="' + esc(item.clientRequestId) + '" data-client-file-id="' + esc(ev.clientFileId) + '">' +
              'Retirar</button>';
          }
          evidenciasHtml += '<br>';
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

    // Delegación de eventos (una sola vez: el panel se vuelve a renderizar a menudo)
    if (container.dataset.eventosQueue) return;
    container.dataset.eventosQueue = '1';
    container.addEventListener('click', function (event) {
      var removeBtn = event.target.closest('.cv-queue-remove-ev-btn');
      if (removeBtn) {
        retirarEvidenciaDeCola(
          removeBtn.getAttribute('data-client-request-id'),
          removeBtn.getAttribute('data-client-file-id')
        );
        return;
      }

      var btn = event.target.closest('.cv-queue-retry-btn');
      if (!btn) return;

      var clientRequestId = btn.getAttribute('data-client-request-id');
      if (clientRequestId) {
        log('info', 'Reintentando caso desde panel.', { clientRequestId: clientRequestId });
        flushQueue(true, clientRequestId, 'reintento desde panel de cola');
      }
    });
  }

  // Retiro explícito de una evidencia que no se pudo subir (p. ej. rechazada por tamaño o
  // tipo). Es la única forma de enviar el caso sin ella: nunca se descarta en silencio.
  async function retirarEvidenciaDeCola(clientRequestId, clientFileId) {
    var items = await getQueueItems();
    var item = items.find(function (it) { return it.clientRequestId === clientRequestId; });
    if (!item) return;
    normalizarItemCola(item);
    var evidencia = item.evidencias.find(function (ev) { return ev.clientFileId === clientFileId; });
    if (!evidencia || subidaDe(item, evidencia)) return;

    var confirmado = window.confirm(
      'Se retirará la evidencia "' + evidencia.name + '" de este caso y no se enviará. ¿Continuar?'
    );
    if (!confirmado) return;

    item.evidencias = item.evidencias.filter(function (ev) { return ev.clientFileId !== clientFileId; });
    item.evidenciasRetiradas = (item.evidenciasRetiradas || []).concat([{
      name: evidencia.name,
      clientFileId: clientFileId,
      retiradaAt: new Date().toISOString()
    }]);
    delete item.requiereAccion;
    delete item.lastError;
    await putQueueItem(item);
    log('warn', 'Evidencia retirada explícitamente del caso en cola.', { clientRequestId: clientRequestId, name: evidencia.name });
    await refreshQueueCount();
    await renderQueuePanel();
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
        : formatearCuotas(sev.cuotas) + ' referencial';
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
      // Normalizar apartamento a 4 dígitos con ceros a la izquierda
      var soloDigitos = apto.value.trim().replace(/\D/g, '');
      if (soloDigitos && soloDigitos.length <= 4) {
        apto.value = soloDigitos.padStart(4, '0');
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
        $('convivenciaReviewSeveridad').textContent = severidadSeleccionada + ' (' + formatearCuotas(severidadConfig.cuotas) + ')';
      }
    }

    urlsVistaPrevia.forEach(function (u) { URL.revokeObjectURL(u); });
    urlsVistaPrevia = [];
    if (evidencias.length > 0) {
      var reviewSection = $('convivenciaReviewEvidenciasSection');
      if (reviewSection) reviewSection.classList.remove('hidden');
      var html = evidencias.map(function (evidence, idx) {
        var urlPrevia = evidence.blob ? URL.createObjectURL(evidence.blob) : '';
        if (urlPrevia) urlsVistaPrevia.push(urlPrevia);
        var isVideo = /^video\//i.test(evidence.type);
        var isPdf = evidence.type === 'application/pdf';
        var media = isPdf
          ? '<div style="width: 200px; height: 80px; display:flex; align-items:center; gap:.5rem; border:1px solid #ddd; border-radius:4px; padding:.5rem;">' +
            '<i class="bi bi-file-earmark-pdf text-danger" style="font-size:1.8rem;"></i><span class="small text-truncate">' + esc(evidence.name) + '</span></div>'
          : isVideo
          ? '<video controls playsinline preload="metadata" style="max-width: 200px; max-height: 150px; border-radius: 4px;" src="' + urlPrevia + '"></video>'
          : /^image\//i.test(evidence.type)
          ? '<img src="' + urlPrevia + '" style="max-width: 200px; max-height: 150px; border-radius: 4px;" alt="Evidencia ' + (idx + 1) + '">'
          : '<div class="small"><i class="bi bi-file-earmark me-1"></i>' + esc(evidence.name) + '</div>';
        return '<div class="mb-2">' + media +
          '<p class="small text-muted mt-1">' + esc(evidence.name) + ' (' + esc(window.BVEvidenceTypes.formatearTamano(evidence.size)) + ')</p></div>';
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

      // Registro progresivo: el texto y los archivos quedan en este dispositivo hasta que el
      // servidor confirme cada uno; el caso solo se finaliza con «Finalizar».
      var caso = {
        version: 2,
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
        adjuntos: evidencias.map(function (ev) {
          return { clientFileId: crearUuid(), name: ev.name, type: ev.type, size: ev.size, blob: ev.blob, estado: 'PENDIENTE' };
        }),
        casoId: null,
        caseCode: null,
        registro: null
      };

      await putQueueItem(caso);
      log('info', 'Caso guardado en IndexedDB.', { clientRequestId: caso.clientRequestId });
      resetForm();
      await refreshQueueCount();
      renderRegistros();

      showStatus(
        'info',
        'Caso guardado como «Pendiente de completar». Se están subiendo sus evidencias; ' +
        'cuando todas estén cargadas, pulsa «Finalizar».'
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
        var resultado;
        if (item.version === 2) {
          resultado = await procesarRegistro(item, force, preferredId);
        } else if (item.caseCode) {
          resultado = await procesarItemLegado(item, force, preferredId);
        } else {
          item = await migrarItemLegado(item);
          resultado = await procesarRegistro(item, force, preferredId);
        }
        if (resultado === 'detener') break;
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

  // Item de la cola anterior cuyo caso ya existe en el servidor (contrato con URL de Drive):
  // el reintento de POST /casos con el mismo clientRequestId vincula lo que falte, sin
  // duplicar el caso ni la notificación. Se conserva sin cambios del flujo desplegado.
  async function procesarItemLegado(item, force, preferredId) {
    if (normalizarItemCola(item)) await putQueueItem(item);

    // Una evidencia rechazada por el servidor (tipo, tamaño) no se reenvía sola: volvería a
    // fallar y gastaría datos. Espera a que el usuario reintente o la retire desde la cola.
    var reintentoManual = Boolean(force) && (!preferredId || preferredId === item.clientRequestId);
    if (item.requiereAccion && !reintentoManual) {
      log('info', 'Caso en cola espera acción del usuario; se omite en reintento automático.', {
        clientRequestId: item.clientRequestId
      });
      return 'continuar';
    }

    try {
      item.attempts = Number(item.attempts || 0) + 1;
      item.lastAttemptAt = new Date().toISOString();
      delete item.lastError;
      delete item.requiereAccion;
      item.evidencias.forEach(function (ev) { delete ev.error; });
      await putQueueItem(item);

      log('info', 'Enviando caso al servidor.', { clientRequestId: item.clientRequestId });

      var evidenciasRestantes = item.evidencias.filter(function (ev) { return !subidaDe(item, ev); });
      var falloSubida = null;

      if (evidenciasRestantes.length > 0) {
        log('info', 'Subiendo evidencias.', { count: evidenciasRestantes.length });
        for (var i = 0; i < evidenciasRestantes.length; i++) {
          var evidencia = evidenciasRestantes[i];
          try {
            var uploadResult = await uploadEvidenceToGoogle(evidencia, item.apto);
            if (uploadResult.ok) {
              item.evidenciasSubidas.push({
                clientFileId: evidencia.clientFileId,
                name: evidencia.name,
                url: uploadResult.url,
                fileId: uploadResult.fileId,
                fileName: uploadResult.fileName,
                mimeType: uploadResult.mimeType,
                sizeBytes: uploadResult.sizeBytes
              });
              await putQueueItem(item);
              log('info', 'Evidencia subida.', { name: evidencia.name });
            } else {
              log('error', 'Evidencia rechazada por el servidor.', { name: evidencia.name, error: uploadResult.error });
              evidencia.error = uploadResult.error || 'rechazada por el servidor';
              falloSubida = {
                transporte: false,
                definitivo: Boolean(uploadResult.definitivo),
                mensaje: 'La evidencia "' + evidencia.name + '" no se pudo subir: ' + evidencia.error + '.'
              };
              break;
            }
          } catch (uploadError) {
            log('error', 'Error subiendo evidencia.', uploadError);
            evidencia.error = (uploadError && uploadError.message) || 'error al subir';
            falloSubida = {
              transporte: esFalloTransporte(uploadError),
              definitivo: false,
              mensaje: 'La evidencia "' + evidencia.name + '" no se pudo subir: ' + evidencia.error + '.'
            };
            break;
          }
        }
      }

      // Si falta cualquier evidencia, el caso NO se crea: crearlo con un subconjunto y borrar
      // la cola era la vía de pérdida silenciosa de adjuntos.
      if (falloSubida) {
        item.lastError = falloSubida.mensaje;
        if (falloSubida.definitivo) item.requiereAccion = true;
        await putQueueItem(item);
        showStatus(
          'warning',
          falloSubida.mensaje + ' El caso no se ha enviado y sigue guardado en este dispositivo. ' +
          (falloSubida.definitivo
            ? 'Revisa la cola: puedes reintentar o retirar esa evidencia.'
            : 'Se reintentará cuando haya una conexión estable.')
        );
        if (falloSubida.transporte || !navigator.onLine) {
          log('warn', 'Fallo de transporte subiendo evidencias; se detiene la cola.');
          return 'detener';
        }
        return 'continuar';
      }

      if (!navigator.onLine) {
        log('info', 'Se detectó que el navegador está offline; se detiene la cola.');
        return 'detener';
      }

      var caseData = {
        clientRequestId: item.clientRequestId,
        apartamento: item.apto,
        motivo: item.motivo,
        descripcion: item.descripcion,
        razonNotificacion: item.razonNotificacion,
        notificador: item.notificador,
        severidad: item.severidad,
        evidencias: item.evidencias.map(function (ev) {
          return { url: subidaDe(item, ev).url, clientFileId: ev.clientFileId };
        })
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

      var createBody = await leerJson(createResponse);
      if (!createResponse.ok) {
        throw new Error(
          (createBody && createBody.error && createBody.error.message) ||
          mensajePorEstado(createResponse.status, 'El servidor no confirmó el registro.')
        );
      }
      if (!createBody || !createBody.data) {
        throw new Error('Respuesta inválida del servidor al registrar el caso.');
      }

      var createResult = createBody.data;
      var noVinculadas = (createResult.evidencias && createResult.evidencias.fallidas) || [];

      // El caso existe pero le faltan adjuntos: se conserva en la cola y el reintento (mismo
      // clientRequestId) vincula solo lo que falte, sin duplicar el caso ni la notificación.
      if (noVinculadas.length > 0) {
        item.caseCode = createResult.caseCode;
        item.lastError = 'El caso ' + createResult.caseCode + ' quedó registrado, pero ' + noVinculadas.length +
          ' evidencia(s) no se vincularon. Se reintentará sin duplicar el caso.';
        await putQueueItem(item);
        log('error', 'Caso creado con evidencias sin vincular; permanece en la cola.', {
          clientRequestId: item.clientRequestId,
          caseId: createResult.caseCode,
          fallidas: noVinculadas.length
        });
        showStatus('warning', item.lastError);
        return 'continuar';
      }

      await deleteQueueItem(item.clientRequestId);
      log('info', 'Caso confirmado y eliminado de la cola.', { clientRequestId: item.clientRequestId, caseId: createResult.caseCode });

      var totalEvidencias = item.evidencias.length;
      var retiradas = (item.evidenciasRetiradas || []).length;
      showStatus(
        'success',
        'Caso enviado correctamente. ID: ' + createResult.caseCode +
        (totalEvidencias ? '. Evidencias vinculadas: ' + totalEvidencias : '') +
        (retiradas ? ' (' + retiradas + ' retirada(s) por el usuario)' : '') +
        '. Si olvidaste una evidencia o un dato, puedes corregirlo en "Corregir un caso reciente".'
      );
      document.dispatchEvent(new CustomEvent('bv:caso-convivencia-creado', { detail: createResult }));

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
        return 'detener';
      }

      if (esFalloTransporte(error)) {
        log('warn', 'Fallo de transporte; se detiene la cola para no repetir con otros casos.');
        return 'detener';
      }
    }
    return 'continuar';
  }

  async function uploadEvidenceToGoogle(evidence, apto, caseCode) {
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
          apartamento: apto || '',
          caseId: caseCode || undefined
        })
      });

      // Un cuerpo demasiado grande lo rechaza Cloud Run antes de llegar a la API, con una
      // respuesta que no es JSON: debe tratarse como rechazo, no ignorarse.
      var result = await leerJson(response);

      if (!response.ok) {
        return {
          ok: false,
          definitivo: [400, 413, 415, 422].indexOf(response.status) !== -1,
          error: (result && result.error && result.error.message) ||
            mensajePorEstado(response.status, 'error del servidor (' + response.status + ')')
        };
      }

      if (!result || !result.data || !result.data.url) {
        throw new Error('Respuesta inválida del servidor al subir evidencia.');
      }

      return {
        ok: true,
        url: result.data.url,
        fileId: result.data.fileId,
        fileName: result.data.fileName,
        mimeType: result.data.mimeType,
        sizeBytes: result.data.sizeBytes
      };
    } catch (error) {
      log('error', 'Error subiendo evidencia:', error);
      throw error;
    }
  }

  async function leerJson(response) {
    var texto = await response.text();
    if (!texto) return null;
    try {
      return JSON.parse(texto);
    } catch (parseError) {
      return null;
    }
  }

  function mensajePorEstado(status, porDefecto) {
    if (status === 413) return 'el archivo es demasiado grande para enviarlo';
    if (status === 401) return 'la sesión expiró; vuelve a iniciar sesión';
    return porDefecto;
  }

  function esFalloTransporte(error) {
    return Boolean(
      error && (
        error.code === 'POST_TIMEOUT' ||
        error.code === 'POST_SUBMIT_FAILED' ||
        /conectar|cargar el servicio|POST no recibió|tiempo permitido|Failed to fetch|NetworkError|Load failed/i.test(error.message || '')
      )
    );
  }

  // =====================================================================================
  // Registro progresivo (cola v2): el texto se guarda como borrador en el servidor sin
  // notificar; cada archivo se declara, se sube directo a Cloud Storage (sesión reanudable)
  // y se confirma. El caso solo se finaliza (y, si es llamado de atención, se notifica) cuando el usuario pulsa «Finalizar»
  // y el servidor comprueba que no quedan archivos pendientes.
  // =====================================================================================

  var CHUNK_SUBIDA = 8 * 1024 * 1024; // múltiplo de 256 KiB, como exige Cloud Storage
  var TIEMPO_MAX_BLOQUE_MS = 2 * 60 * 1000;
  var REINTENTOS_SUBIDA_AUTOMATICOS = 5;
  var ESTADOS_LISTOS = ['LISTO', 'RETIRADO'];

  var ETIQUETA_ESTADO = {
    PENDIENTE: 'Por registrar',
    DECLARADO: 'En espera de subida',
    SUBIENDO: 'Subiendo',
    LISTO: 'Cargado',
    RECHAZADO: 'Rechazado',
    RETIRADO: 'Retirado',
    ABANDONADO: 'Subida abandonada',
    NO_PERMITIDO: 'No permitido'
  };

  function crearUuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    var b = new Uint8Array(16);
    window.crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return (x + 0x100).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  function normalizarId(id) {
    return String(id || '').replace(/-/g, '').toLowerCase();
  }

  async function api(method, ruta, body) {
    var token = await getAuthToken();
    var headers = { Authorization: 'Bearer ' + token };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    var response = await fetch(API_BASE + '/api/v1/convivencia' + ruta, {
      method: method,
      headers: headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    var json = await leerJson(response);
    if (!response.ok) {
      var error = new Error((json && json.error && json.error.message) || mensajePorEstado(response.status, 'Error del servidor (' + response.status + ')'));
      error.status = response.status;
      error.code = json && json.error && json.error.code;
      error.details = json && json.error && json.error.details;
      throw error;
    }
    return json;
  }

  // CRC32C (Castagnoli) del archivo, en base64 como lo reporta Cloud Storage: el servidor
  // lo compara con el objeto recibido para detectar archivos dañados en la subida.
  var tablaCrc32c = null;
  async function crc32cBase64(blob) {
    if (!tablaCrc32c) {
      tablaCrc32c = new Uint32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0x82f63b78 : c >>> 1;
        tablaCrc32c[n] = c >>> 0;
      }
    }
    var crc = 0xffffffff;
    var paso = 4 * 1024 * 1024;
    for (var inicio = 0; inicio < blob.size; inicio += paso) {
      var datos = new Uint8Array(await blob.slice(inicio, inicio + paso).arrayBuffer());
      for (var i = 0; i < datos.length; i++) crc = tablaCrc32c[(crc ^ datos[i]) & 0xff] ^ (crc >>> 8);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    return btoa(String.fromCharCode((crc >>> 24) & 0xff, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff));
  }

  function errorSesionVencida() {
    var error = new Error('La sesión de subida venció; se abrirá una nueva.');
    error.sesionVencida = true;
    return error;
  }

  function errorTransporteSubida(offset, total) {
    var error = new Error('Se interrumpió la subida (' + Math.floor((offset / total) * 100) + '%); se reanudará desde ese punto.');
    error.code = 'POST_SUBMIT_FAILED';
    return error;
  }

  function siguienteOffset(response) {
    var rango = response.headers.get('Range');
    var m = rango && /bytes=0-(\d+)/.exec(rango);
    return m ? Number(m[1]) + 1 : 0;
  }

  // Cuántos bytes ya tiene la sesión (tras un corte, una recarga o al reabrir el dispositivo).
  async function consultarOffset(uri, total) {
    var response;
    try {
      response = await fetch(uri, { method: 'PUT', headers: { 'Content-Range': 'bytes */' + total } });
    } catch (e) {
      throw errorTransporteSubida(0, total);
    }
    if (response.status === 308) return siguienteOffset(response);
    if (response.ok) return total;
    if (response.status === 404 || response.status === 410) throw errorSesionVencida();
    throw new Error('Cloud Storage no respondió el estado de la subida (' + response.status + ').');
  }

  async function subirReanudable(item, adjunto, uri) {
    var total = adjunto.blob.size;
    var offset = await consultarOffset(uri, total);
    while (offset < total) {
      var fin = Math.min(offset + CHUNK_SUBIDA, total);
      var control = new AbortController();
      var temporizador = setTimeout(function () { control.abort(); }, TIEMPO_MAX_BLOQUE_MS);
      var response;
      try {
        response = await fetch(uri, {
          method: 'PUT',
          headers: { 'Content-Range': 'bytes ' + offset + '-' + (fin - 1) + '/' + total },
          body: adjunto.blob.slice(offset, fin),
          signal: control.signal
        });
      } catch (e) {
        throw errorTransporteSubida(offset, total);
      } finally {
        clearTimeout(temporizador);
      }
      if (response.status === 308) offset = siguienteOffset(response);
      else if (response.ok) offset = total;
      else if (response.status === 404 || response.status === 410) throw errorSesionVencida();
      else throw new Error('Cloud Storage rechazó la subida (' + response.status + ').');
      adjunto.progreso = offset / total;
      renderRegistrosPronto();
    }
  }

  async function subirAdjunto(item, adjunto) {
    var id = normalizarId(adjunto.clientFileId);
    var uri = adjunto.sessionUri || null;
    var completo = false;
    if (uri) {
      try {
        completo = (await consultarOffset(uri, adjunto.blob.size)) === adjunto.blob.size;
      } catch (error) {
        if (!error.sesionVencida) throw error;
        uri = null;
      }
    }
    if (!uri && !completo) {
      var sesion = await api('POST', '/adjuntos/' + id + '/sesion');
      if (sesion.data.yaSubido) {
        completo = true;
      } else {
        uri = sesion.data.sessionUri;
        adjunto.sessionUri = uri;
        adjunto.estado = 'SUBIENDO';
        await putQueueItem(item);
      }
    }
    if (!completo) {
      try {
        await subirReanudable(item, adjunto, uri);
      } catch (error) {
        if (error.sesionVencida) {
          adjunto.sessionUri = null;
          await putQueueItem(item);
        }
        throw error;
      }
    }
    adjunto.progreso = 1;
    renderRegistrosPronto();
    var crc = await crc32cBase64(adjunto.blob);
    var confirmacion = await api('POST', '/adjuntos/' + id + '/confirmar', { crc32c: crc });
    adjunto.estado = confirmacion.data.estado;
    adjunto.motivo = confirmacion.data.motivo || null;
    adjunto.sessionUri = null;
    delete adjunto.error;
    if (adjunto.estado === 'LISTO') adjunto.blob = null; // ya está en el servidor: libera espacio local
    await putQueueItem(item);
    renderRegistros();
  }

  // Estado del servidor → copia local (los archivos cuyo id el servidor conoce quedan "declarados").
  function aplicarVistaRegistro(item, vista) {
    item.casoId = vista.id;
    item.caseCode = vista.caseCode;
    item.registro = vista.registro;
    item.notificaciones = vista.notificaciones || [];
    (vista.adjuntos || []).forEach(function (sa) {
      var local = item.adjuntos.find(function (a) { return normalizarId(a.clientFileId) === sa.id; });
      if (!local) {
        local = { clientFileId: sa.id, name: sa.nombreOriginal, type: sa.mimeType, size: sa.tamanoBytes, blob: null };
        item.adjuntos.push(local);
      }
      local.declarado = true;
      local.estado = sa.estado;
      local.motivo = sa.motivo || null;
      if (sa.estado === 'LISTO' || sa.estado === 'RETIRADO') {
        local.blob = null;
        local.sessionUri = null;
        local.progreso = sa.estado === 'LISTO' ? 1 : local.progreso;
      }
    });
  }

  function puedeFinalizar(item) {
    return item.registro === 'BORRADOR' && item.adjuntos.every(function (a) { return ESTADOS_LISTOS.indexOf(a.estado) !== -1; });
  }

  async function declararPendientes(item) {
    var porDeclarar = item.adjuntos.filter(function (a) { return a.estado === 'PENDIENTE'; });
    if (porDeclarar.length === 0) return;
    try {
      var r = await api('POST', '/casos/' + item.casoId + '/adjuntos', {
        archivos: porDeclarar.map(function (a) {
          return { id: a.clientFileId, nombre: a.name, mimeType: a.type, tamanoBytes: a.size };
        })
      });
      aplicarVistaRegistro(item, r.data);
    } catch (error) {
      if (error.code !== 'adjunto_no_permitido' || !error.details || !error.details.rechazados) throw error;
      error.details.rechazados.forEach(function (rechazo) {
        var a = item.adjuntos.find(function (x) { return normalizarId(x.clientFileId) === normalizarId(rechazo.id); });
        if (a) { a.estado = 'NO_PERMITIDO'; a.motivo = rechazo.motivo; a.blob = null; }
      });
      await putQueueItem(item);
      await declararPendientes(item);
    }
  }

  async function procesarRegistro(item, force, preferredId) {
    var manual = Boolean(force) && (!preferredId || preferredId === item.clientRequestId);
    if (item.requiereAccion && !manual) return 'continuar';
    try {
      item.attempts = Number(item.attempts || 0) + 1;
      item.lastAttemptAt = new Date().toISOString();
      delete item.lastError;
      delete item.requiereAccion;

      if (!item.casoId) {
        var creado = await api('POST', '/casos', {
          clientRequestId: item.clientRequestId,
          modo: 'borrador',
          apartamento: item.apto,
          motivo: item.motivo,
          descripcion: item.descripcion,
          razonNotificacion: item.razonNotificacion,
          notificador: item.notificador,
          severidad: item.severidad
        });
        item.casoId = creado.data.id;
        item.caseCode = creado.data.caseCode;
        item.registro = creado.data.registro;
        await putQueueItem(item);
        renderRegistros();
      }

      if (item.registro === 'FINALIZADO') {
        // Solo ocurre si un envío anterior (versión previa del formulario) ya creó y notificó el caso.
        if (item.adjuntos.every(function (a) { return ESTADOS_LISTOS.indexOf(a.estado) !== -1; })) {
          await deleteQueueItem(item.clientRequestId);
          renderRegistros();
          return 'continuar';
        }
        item.requiereAccion = true;
        item.lastError = 'El caso ' + item.caseCode + ' ya estaba registrado y notificado. Agrega los archivos faltantes desde «Corregir un caso reciente».';
        await putQueueItem(item);
        renderRegistros();
        return 'continuar';
      }

      await declararPendientes(item);
      await putQueueItem(item);
      renderRegistros();

      var porSubir = item.adjuntos.filter(function (a) { return a.estado === 'DECLARADO' || a.estado === 'SUBIENDO'; });
      for (var i = 0; i < porSubir.length; i++) {
        var adjunto = porSubir[i];
        if (!adjunto.blob) {
          adjunto.error = 'Vuelve a seleccionar este archivo en este dispositivo para terminar de subirlo, o retíralo.';
          continue;
        }
        if (Number(adjunto.intentosSubida || 0) >= REINTENTOS_SUBIDA_AUTOMATICOS && !manual) continue;
        try {
          await subirAdjunto(item, adjunto);
        } catch (error) {
          adjunto.intentosSubida = Number(adjunto.intentosSubida || 0) + 1;
          adjunto.error = error.message || String(error);
          await putQueueItem(item);
          renderRegistros();
          if (!navigator.onLine || esFalloTransporte(error)) return 'detener';
        }
      }

      aplicarVistaRegistro(item, (await api('GET', '/casos/' + item.casoId + '/registro')).data);
      await putQueueItem(item);
      renderRegistros();
      return 'continuar';
    } catch (error) {
      item.lastError = error.message || String(error);
      if (error.status && error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 409) {
        item.requiereAccion = true;
      }
      await putQueueItem(item);
      renderRegistros();
      log('error', 'Falló el registro del caso; permanece guardado en este dispositivo.', { clientRequestId: item.clientRequestId, error: item.lastError });
      if (!navigator.onLine || esFalloTransporte(error)) return 'detener';
      return 'continuar';
    }
  }

  // Items de la versión anterior del formulario que nunca llegaron a crear el caso: se
  // convierten en un registro progresivo. Las copias que hubieran llegado a Drive quedan
  // huérfanas (las reporta el inventario de la migración) y el caso no se notifica hasta
  // «Finalizar».
  async function migrarItemLegado(item) {
    normalizarItemCola(item);
    var adjuntos = [];
    for (var i = 0; i < item.evidencias.length; i++) {
      var ev = item.evidencias[i];
      var blob = ev.blob instanceof Blob ? ev.blob : null;
      if (!blob && ev.dataUrl) {
        try { blob = await (await fetch(ev.dataUrl)).blob(); } catch (e) { blob = null; }
      }
      adjuntos.push({
        clientFileId: crearUuid(),
        name: ev.name,
        type: ev.type || (blob && blob.type) || '',
        size: blob ? blob.size : ev.size,
        blob: blob,
        estado: blob ? 'PENDIENTE' : 'NO_PERMITIDO',
        motivo: blob ? null : 'El archivo no se conservó en este dispositivo; vuelve a agregarlo.'
      });
    }
    var nuevo = {
      version: 2,
      clientRequestId: item.clientRequestId,
      reportedAt: item.reportedAt,
      queuedAt: item.queuedAt,
      attempts: 0,
      apto: item.apto,
      motivo: item.motivo,
      descripcion: item.descripcion,
      razonNotificacion: item.razonNotificacion,
      notificador: item.notificador,
      severidad: item.severidad,
      adjuntos: adjuntos,
      casoId: null,
      caseCode: null,
      registro: null,
      migradoDeVersionAnterior: true
    };
    await putQueueItem(nuevo);
    log('info', 'Caso de la cola anterior convertido a registro progresivo.', { clientRequestId: nuevo.clientRequestId });
    return nuevo;
  }

  async function obtenerItem(clientRequestId) {
    var items = await getQueueItems();
    return items.find(function (it) { return it.clientRequestId === clientRequestId; }) || null;
  }

  async function finalizarRegistro(clientRequestId) {
    var item = await obtenerItem(clientRequestId);
    if (!item || !item.casoId) return;
    var boton = document.querySelector('[data-accion="finalizar"][data-registro="' + CSS.escape(clientRequestId) + '"]');
    if (boton) boton.disabled = true;
    try {
      var r = await api('POST', '/casos/' + item.casoId + '/finalizar');
      await deleteQueueItem(clientRequestId);
      showStatus(
        'success',
        'Caso ' + r.data.caseCode + (r.data.yaFinalizado ? ' ya estaba finalizado' : ' finalizado') +
        (r.data.notificacion === 'PENDIENTE_ADMINISTRACION'
          ? '. La administración notificará al residente.'
          : '. Llamado de atención: la notificación al residente se envió de inmediato; su confirmación aparece en el detalle del caso.')
      );
      document.dispatchEvent(new CustomEvent('bv:caso-convivencia-creado', { detail: r.data }));
    } catch (error) {
      if (error.code === 'adjuntos_pendientes' || error.code === 'concurrencia_reintentar') {
        try {
          aplicarVistaRegistro(item, (await api('GET', '/casos/' + item.casoId + '/registro')).data);
          await putQueueItem(item);
        } catch (e) { /* se reintenta en la siguiente sincronización */ }
      }
      showStatus('warning', 'No se pudo finalizar: ' + (error.message || error));
    } finally {
      await refreshQueueCount();
      renderRegistros();
    }
  }

  async function retirarDeRegistro(clientRequestId, clientFileId) {
    var item = await obtenerItem(clientRequestId);
    if (!item) return;
    var adjunto = item.adjuntos.find(function (a) { return a.clientFileId === clientFileId; });
    if (!adjunto) return;
    if (!window.confirm('Se retirará "' + adjunto.name + '" de este caso y no se adjuntará. ¿Continuar?')) return;
    try {
      if (adjunto.declarado) {
        var r = await api('POST', '/adjuntos/' + normalizarId(clientFileId) + '/retirar');
        adjunto.estado = r.data.estado;
      } else {
        adjunto.estado = 'RETIRADO';
      }
      adjunto.blob = null;
      adjunto.sessionUri = null;
      adjunto.motivo = 'Retirado por el usuario';
      delete adjunto.error;
      if (!adjunto.declarado) {
        item.adjuntos = item.adjuntos.filter(function (a) { return a !== adjunto; });
      }
      await putQueueItem(item);
    } catch (error) {
      showStatus('warning', 'No se pudo retirar el archivo: ' + (error.message || error));
    }
    renderRegistros();
    await refreshQueueCount();
  }

  async function agregarArchivoARegistro(clientRequestId, file, reemplazaId) {
    var item = await obtenerItem(clientRequestId);
    if (!item) return;
    try {
      var preparado = await prepararArchivoFinal(file);
      if (reemplazaId) {
        // Volver a seleccionar un archivo ya declarado (p. ej. en otro dispositivo): debe ser el mismo.
        var adjunto = item.adjuntos.find(function (a) { return a.clientFileId === reemplazaId; });
        if (!adjunto) return;
        if (preparado.size !== adjunto.size || preparado.type !== adjunto.type) {
          throw new Error('El archivo seleccionado no coincide con "' + adjunto.name + '" (tamaño o tipo distinto). Retíralo y agrégalo como archivo nuevo.');
        }
        adjunto.blob = preparado.blob;
        adjunto.intentosSubida = 0;
        delete adjunto.error;
      } else {
        item.adjuntos.push({
          clientFileId: crearUuid(),
          name: preparado.name,
          type: preparado.type,
          size: preparado.size,
          blob: preparado.blob,
          estado: 'PENDIENTE'
        });
      }
      delete item.requiereAccion;
      await putQueueItem(item);
      renderRegistros();
      await flushQueue(true, clientRequestId, 'archivo agregado al registro');
    } catch (error) {
      showStatus('warning', error.message || String(error));
    }
  }

  // Abre en este dispositivo un borrador creado en otro (desde «Corregir un caso reciente»).
  async function abrirRegistro(casoId) {
    var items = await getQueueItems();
    var existente = items.find(function (it) { return it.version === 2 && normalizarId(it.casoId) === normalizarId(casoId); });
    if (!existente) {
      var vista = (await api('GET', '/casos/' + casoId + '/registro')).data;
      existente = {
        version: 2,
        clientRequestId: 'REG-' + normalizarId(casoId),
        queuedAt: new Date().toISOString(),
        attempts: 0,
        apto: vista.apartamento,
        motivo: vista.motivo,
        adjuntos: [],
        casoId: vista.id
      };
      aplicarVistaRegistro(existente, vista);
      await putQueueItem(existente);
    }
    renderRegistros();
    await refreshQueueCount();
    var seccion = $('convivenciaRegistros');
    if (seccion) seccion.scrollIntoView({ behavior: 'smooth' });
  }

  function htmlAdjunto(item, a) {
    var clasif = window.BVEvidenceTypes.clasificar({ name: a.name || '', type: a.type || '' });
    var icono = clasif ? window.BVEvidenceTypes.icono(clasif.categoria) : 'bi-file';
    var estado = a.estado || 'PENDIENTE';
    var etiqueta = ETIQUETA_ESTADO[estado] || estado;
    var clase = estado === 'LISTO' ? 'text-bg-success'
      : (estado === 'RECHAZADO' || estado === 'NO_PERMITIDO' || estado === 'ABANDONADO') ? 'text-bg-danger'
        : estado === 'RETIRADO' ? 'text-bg-secondary' : 'text-bg-warning';
    var progreso = '';
    if (estado === 'SUBIENDO' || (estado === 'DECLARADO' && a.progreso)) {
      var pct = Math.floor((a.progreso || 0) * 100);
      etiqueta = 'Subiendo ' + pct + '%';
      progreso = '<div class="progress mt-1" style="height:6px" role="progressbar" aria-label="Progreso de ' + esc(a.name) + '" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100">' +
        '<div class="progress-bar" style="width:' + pct + '%"></div></div>';
    }
    var detalle = a.motivo || a.error;
    var acciones = '';
    if (ESTADOS_LISTOS.indexOf(estado) === -1) {
      if (a.declarado && !a.blob && (estado === 'DECLARADO' || estado === 'SUBIENDO')) {
        acciones += '<label class="btn btn-link btn-sm p-0 me-2 mb-0">Seleccionar de nuevo' +
          '<input type="file" class="d-none" data-accion="reseleccionar" data-registro="' + esc(item.clientRequestId) + '" data-archivo="' + esc(a.clientFileId) + '" accept="' + esc(window.BVEvidenceTypes.ACCEPT_FINAL) + '"></label>';
      }
      acciones += '<button type="button" class="btn btn-link btn-sm p-0 text-danger" data-accion="retirar" data-registro="' + esc(item.clientRequestId) + '" data-archivo="' + esc(a.clientFileId) + '">Retirar</button>';
    }
    return '<li class="list-group-item">' +
      '<div class="d-flex justify-content-between align-items-start gap-2">' +
      '<div class="text-break"><i class="bi ' + icono + ' me-1"></i>' + esc(a.name) +
      ' <small class="text-muted">' + esc(window.BVEvidenceTypes.formatearTamano(a.size)) + '</small></div>' +
      '<span class="badge ' + clase + '">' + esc(etiqueta) + '</span></div>' +
      progreso +
      (detalle ? '<small class="d-block text-danger mt-1">' + esc(detalle) + '</small>' : '') +
      (acciones ? '<div class="mt-1">' + acciones + '</div>' : '') +
      '</li>';
  }

  function htmlRegistro(item) {
    var listos = item.adjuntos.filter(function (a) { return a.estado === 'LISTO'; }).length;
    var activos = item.adjuntos.filter(function (a) { return a.estado !== 'RETIRADO'; }).length;
    var listo = puedeFinalizar(item);
    var titulo = (item.caseCode ? item.caseCode + ' · ' : '') + 'Apto. ' + item.apto + ' · ' + item.motivo;
    return '<div class="card mb-3" data-registro-card="' + esc(item.clientRequestId) + '">' +
      '<div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">' +
      '<strong class="text-break">' + esc(titulo) + '</strong>' +
      '<span class="badge text-bg-warning">Pendiente de completar</span></div>' +
      '<div class="card-body">' +
      '<p class="small mb-2">' + (item.casoId ? 'Texto del caso guardado. ' : 'Guardando el texto del caso… ') +
      'Evidencias: ' + listos + ' de ' + activos + ' cargadas. El caso aún no está finalizado.</p>' +
      (item.adjuntos.length ? '<ul class="list-group mb-2">' + item.adjuntos.map(function (a) { return htmlAdjunto(item, a); }).join('') + '</ul>' : '') +
      (item.lastError ? '<div class="alert alert-warning py-2 small mb-2">' + esc(item.lastError) + '</div>' : '') +
      '<div class="d-flex flex-wrap gap-2">' +
      (item.casoId ? '<label class="btn btn-outline-secondary btn-sm mb-0"><i class="bi bi-paperclip me-1"></i>Agregar archivo' +
        '<input type="file" class="d-none" data-accion="agregar" data-registro="' + esc(item.clientRequestId) + '" accept="' + esc(window.BVEvidenceTypes.ACCEPT_FINAL) + '"></label>' : '') +
      '<button type="button" class="btn btn-outline-primary btn-sm" data-accion="reintentar" data-registro="' + esc(item.clientRequestId) + '"><i class="bi bi-arrow-repeat me-1"></i>Reintentar</button>' +
      '<button type="button" class="btn btn-success btn-sm" data-accion="finalizar" data-registro="' + esc(item.clientRequestId) + '"' + (listo ? '' : ' disabled') + '>' +
      '<i class="bi bi-send-check me-1"></i>Finalizar</button>' +
      '</div>' +
      (listo ? '' : '<small class="d-block text-muted mt-2">Se habilita cuando todos los archivos estén cargados o retirados.</small>') +
      '</div></div>';
  }

  var renderPendiente = null;
  function renderRegistrosPronto() {
    if (renderPendiente) return;
    renderPendiente = setTimeout(function () { renderPendiente = null; renderRegistros(); }, 400);
  }

  async function renderRegistros() {
    var seccion = $('convivenciaRegistros');
    var lista = $('convivenciaRegistrosLista');
    if (!seccion || !lista) return;
    var items = (await getQueueItems()).filter(function (it) { return it.version === 2; });
    seccion.classList.toggle('hidden', items.length === 0);
    lista.innerHTML = items.map(htmlRegistro).join('');
  }

  function enlazarAccionesRegistro(contenedor) {
    if (!contenedor || contenedor.dataset.accionesRegistro) return;
    contenedor.dataset.accionesRegistro = '1';
    contenedor.addEventListener('click', function (event) {
      var boton = event.target.closest('button[data-accion]');
      if (!boton) return;
      var id = boton.getAttribute('data-registro');
      var accion = boton.getAttribute('data-accion');
      if (accion === 'finalizar') finalizarRegistro(id);
      if (accion === 'retirar') retirarDeRegistro(id, boton.getAttribute('data-archivo'));
      if (accion === 'reintentar') flushQueue(true, id, 'reintento manual del registro');
    });
    contenedor.addEventListener('change', function (event) {
      var input = event.target.closest('input[data-accion]');
      if (!input || !input.files || !input.files[0]) return;
      var file = input.files[0];
      input.value = '';
      var accion = input.getAttribute('data-accion');
      agregarArchivoARegistro(input.getAttribute('data-registro'), file, accion === 'reseleccionar' ? input.getAttribute('data-archivo') : null);
    });
  }

  function duracionVideo(blob) {
    return new Promise(function (resolve) {
      var video = document.createElement('video');
      var url = URL.createObjectURL(blob);
      var listo = function (valor) { clearTimeout(t); URL.revokeObjectURL(url); resolve(valor); };
      var t = setTimeout(function () { listo(null); }, 10000);
      video.preload = 'metadata';
      video.onloadedmetadata = function () { listo(isFinite(video.duration) ? video.duration : null); };
      video.onerror = function () { listo(null); };
      video.src = url;
    });
  }

  // Valida el archivo final para el registro progresivo (sin conversión: el video debe ser MP4
  // de hasta 5 minutos; las imágenes se comprimen a JPEG como antes). El servidor repite la
  // validación (incluido el códec H.264) y rechaza con motivo lo que no cumpla.
  async function prepararArchivoFinal(file) {
    var clasificacion = window.BVEvidenceTypes.clasificarFinal(file);
    if (!clasificacion) throw new Error(window.BVEvidenceTypes.motivoNoPermitidoFinal(file));
    var maximo = window.BVEvidenceTypes.maxBytesFinal(clasificacion.categoria);
    if (clasificacion.categoria === 'image') {
      var imagen = await compressImage(file);
      if (imagen.blob.size > maximo) throw new Error('La imagen supera el máximo de ' + window.BVEvidenceTypes.formatearTamano(maximo) + '.');
      return { tipo: 'imagen', name: file.name, type: 'image/jpeg', size: imagen.blob.size, blob: imagen.blob };
    }
    if (file.size > maximo) {
      throw new Error('El archivo supera el máximo de ' + window.BVEvidenceTypes.formatearTamano(maximo) + '.');
    }
    if (clasificacion.categoria === 'video') {
      var duracion = await duracionVideo(file);
      if (duracion !== null && duracion > window.BVEvidenceTypes.VIDEO_MAX_SEGUNDOS + 0.5) {
        throw new Error('El video dura ' + Math.round(duracion / 60 * 10) / 10 + ' minutos; el máximo es 5. Recórtalo antes de adjuntarlo.');
      }
    }
    var tipos = { video: 'video', audio: 'audio' };
    return { tipo: tipos[clasificacion.categoria] || 'documento', name: file.name, type: clasificacion.mime, size: file.size, blob: file };
  }

  function setupEvidenceHandlers() {
    var cameraBtn = $('convivenciaOpenCameraBtn');
    var galleryBtn = $('convivenciaOpenGalleryBtn');
    var galleryInput = $('convivenciaGalleryInput');

    if (galleryInput && window.BVEvidenceTypes) {
      galleryInput.setAttribute('accept', window.BVEvidenceTypes.ACCEPT_FINAL);
    }

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
        quality: 0.84,
        allowVideo: true,
        maxVideoSeconds: 30,
        maxVideoBytes: window.BVEvidenceTypes.maxBytesFinal('video')
      });

      // La evidencia debe llegar en su formato final: un video que el navegador grabe en WebM
      // no es compatible (el servidor solo acepta MP4 H.264).
      var archivoCamara = evidence.blob || evidence.file;
      var resultadoCamara = await prepararArchivoFinal(
        new File([archivoCamara], evidence.name, { type: evidence.type || archivoCamara.type })
      );
      evidencias.push({ name: resultadoCamara.name, type: resultadoCamara.type, size: resultadoCamara.size, blob: resultadoCamara.blob });
      actualizarListaEvidencias();
      var isVideo = /^video\//i.test(resultadoCamara.type);
      showAlert((isVideo ? 'Video' : 'Fotografía') + ' grabado con fecha y ubicación incorporadas.', 'success');
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      showAlert('No fue posible capturar la evidencia: ' + (error.message || error));
    }
  }

  var MENSAJE_EVIDENCIA_AGREGADA = {
    imagen: 'Imagen comprimida y agregada exitosamente',
    video: 'Video agregado exitosamente',
    documento: 'Documento agregado exitosamente'
  };

  // Valida y prepara un archivo de galería (comprime imágenes). Lanza Error con un
  // mensaje listo para mostrar si el archivo no es válido o no se pudo procesar.
  async function prepararArchivoEvidencia(file) {
    var clasificacion = window.BVEvidenceTypes.clasificar(file);
    if (!clasificacion) {
      throw new Error(
        'Tipo de archivo no permitido. Se aceptan: imágenes (JPEG, PNG, WebP), video (MP4, MOV, WebM), PDF, audio (MP3, M4A, AAC, WAV, OGG) y documentos (DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, CSV, RTF, ODT, ODS).'
      );
    }

    var maxBytes = window.BVEvidenceTypes.maxBytes(clasificacion.categoria);
    if (file.size > maxBytes) {
      throw new Error(
        'El archivo supera el tamaño máximo permitido (' +
        window.BVEvidenceTypes.limiteLegible(clasificacion.categoria) +
        ').'
      );
    }

    try {
      if (clasificacion.categoria === 'image') {
        return { tipo: 'imagen', data: await compressImage(file) };
      }
      // Video, audio, PDF, documentos: leer como data URL sin comprimir, con el MIME
      // inferido ya dentro del data URL (la API toma el tipo de ahí, no del campo mimeType).
      var datos = await readFileAsDataUrl(file, clasificacion.mime);
      var tipoLabel =
        clasificacion.categoria === 'video'
          ? 'video'
          : clasificacion.categoria === 'audio'
            ? 'audio'
            : 'documento';
      return { tipo: tipoLabel, data: datos };
    } catch (error) {
      throw new Error('Error al procesar archivo: ' + error.message);
    }
  }

  async function handleEvidenceSelection(event) {
    var file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;

    try {
      var resultado = await prepararArchivoFinal(file);
      evidencias.push({ name: resultado.name, type: resultado.type, size: resultado.size, blob: resultado.blob });
      actualizarListaEvidencias();
      showAlert(MENSAJE_EVIDENCIA_AGREGADA[resultado.tipo] || 'Archivo agregado', 'success');
    } catch (error) {
      showAlert(esc(error.message));
    }
  }

  async function compressImage(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () {
        reject(new Error('No se pudo leer la imagen'));
      };
      reader.onload = function (e) {
        var img = new Image();
        img.onerror = function () {
          reject(new Error('El navegador no pudo abrir la imagen'));
        };
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
            if (!blob) {
              reject(new Error('No se pudo comprimir la imagen'));
              return;
            }
            var reader2 = new FileReader();
            reader2.onerror = function () {
              reject(new Error('No se pudo preparar la imagen comprimida'));
            };
            reader2.onload = function () {
              resolve({
                name: file.name,
                size: blob.size,
                type: 'image/jpeg',
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

  async function readFileAsDataUrl(file, mimeType) {
    var tipo = mimeType || file.type;
    var fuente = tipo && tipo !== file.type ? new Blob([file], { type: tipo }) : file;
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) {
        resolve({
          name: file.name,
          size: file.size,
          type: tipo,
          dataUrl: e.target.result,
          blob: fuente
        });
      };
      reader.onerror = function () {
        reject(new Error('No se pudo leer el archivo'));
      };
      reader.readAsDataURL(fuente);
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
      var clasificacion = window.BVEvidenceTypes.clasificar({ name: evidence.name, type: evidence.type });
      var icon = clasificacion ? window.BVEvidenceTypes.icono(clasificacion.categoria) : 'bi-file';
      return (
        '<div class="card mb-2">' +
        '<div class="card-body p-2">' +
        '<div class="d-flex justify-content-between align-items-center">' +
        '<div><i class="bi ' +
        icon +
        ' me-2"></i><strong>' +
        esc(evidence.name) +
        '</strong><br>' +
        '<small class="text-muted">' +
        esc(window.BVEvidenceTypes.formatearTamano(evidence.size)) +
        '</small></div>' +
        '<button type="button" class="btn btn-danger btn-sm cv-remove-evidence" data-idx="' +
        idx +
        '">' +
        '<i class="bi bi-trash"></i></button></div></div></div>'
      );
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
      if (cuotasInfo) cuotasInfo.textContent = 'Equivalente a ' + formatearCuotas(cuotas) + ' de administración';
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

  function createFileId() {
    if (window.crypto && window.crypto.randomUUID) {
      return 'EVF-' + window.crypto.randomUUID();
    }
    return 'EVF-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  // Los items guardados por versiones anteriores identificaban evidencias por nombre (dos
  // archivos homónimos se confundían). Se les asigna un clientFileId una sola vez, emparejando
  // cada subida previa con la primera evidencia homónima aún libre.
  function normalizarItemCola(item) {
    var cambiado = false;
    if (!Array.isArray(item.evidencias)) { item.evidencias = []; cambiado = true; }
    if (!Array.isArray(item.evidenciasSubidas)) { item.evidenciasSubidas = []; cambiado = true; }

    item.evidencias.forEach(function (ev) {
      if (!ev.clientFileId) {
        ev.clientFileId = createFileId();
        cambiado = true;
      }
    });

    var asignadas = {};
    item.evidenciasSubidas.forEach(function (sub) {
      if (sub.clientFileId) asignadas[sub.clientFileId] = true;
    });
    item.evidenciasSubidas.forEach(function (sub) {
      if (sub.clientFileId) return;
      var ev = item.evidencias.find(function (e) { return e.name === sub.name && !asignadas[e.clientFileId]; });
      if (ev) {
        sub.clientFileId = ev.clientFileId;
        asignadas[ev.clientFileId] = true;
        cambiado = true;
      }
    });
    return cambiado;
  }

  function subidaDe(item, evidencia) {
    return (item.evidenciasSubidas || []).find(function (sub) {
      return sub.clientFileId === evidencia.clientFileId;
    }) || null;
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
      container.innerHTML = '<div class="alert alert-light mb-0 py-2"><i class="bi bi-exclamation-triangle me-2"></i>No se pudo verificar el historial del apartamento. Continúa cuando estés listo.</div>';
    }
  }

  function renderResumenApartamento(data) {
    var container = $('convivenciaResumenApto');
    if (!container) return;

    if (!data.unidadEncontrada) {
      container.innerHTML = '<div class="alert alert-danger mb-0 py-2"><i class="bi bi-exclamation-circle-fill me-2"></i><strong>No se encontró una unidad</strong> con el apartamento ' + esc(data.apartamento) + '. Verifica el número antes de continuar.</div>';
      return;
    }

    if (data.totalCasos === 0) {
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

  // Reutilizado por convivencia-correccion.js (corrección de casos recién creados).
  window.BVConvivenciaForm = {
    obtenerToken: getAuthToken,
    prepararArchivoEvidencia: prepararArchivoEvidencia,
    subirEvidencia: uploadEvidenceToGoogle,
    abrirRegistro: abrirRegistro
  };

  async function init() {
    log('info', 'Inicializando módulo.', {
      online: navigator.onLine,
      apiBase: API_BASE ? 'configurada' : 'sin configurar'
    });

    renderNetworkStatus();
    initEventListeners();
    llenarNotificadorActual();
    cargarConfiguracion();
    enlazarAccionesRegistro($('convivenciaRegistrosLista'));
    renderRegistros();
    refreshQueueCount();
    flushQueue(false, null, 'inicio del módulo');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
