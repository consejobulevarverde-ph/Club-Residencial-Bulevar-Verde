(function (global) {
  'use strict';

  var config = global.PQRS_MAINTENANCE_CONFIG || {};
  var rawConfiguredWebAppUrl = config.webAppUrl;

  function normalizeWebAppUrl(url) {
    var value = String(url || '')
      .trim()
      .replace(/^[\s"']+|[\s"']+$/g, '');

    // A URL copied while several Google accounts are open can contain
    // /macros/u/2/s/. Public deployments must use /macros/s/.
    return value.replace(
      /^https:\/\/script\.google\.com\/macros\/u\/\d+\/s\//i,
      'https://script.google.com/macros/s/'
    );
  }

  config.webAppUrl = normalizeWebAppUrl(config.webAppUrl);

  var DB_NAME = 'bulevar-verde-pqrs';
  var DB_VERSION = 1;
  var STORE_NAME = 'maintenanceQueue';
  var MAX_PHOTOS = Number(config.maxPhotos || 3);
  var MAX_IMAGE_BYTES = Number(config.maxImageBytes || 5 * 1024 * 1024);
  var TARGET_IMAGE_BYTES = Number(config.targetImageBytes || 900 * 1024);
  var MAX_DIMENSION = Number(config.maxDimension || 1600);
  var LOG_PREFIX = '[BV:Mantenimiento]';
  var client = null;
  var flushInProgress = false;
  var queuedFlushRequest = null;
  var selectedPhotoFiles = [];

  var elements = {};

  function byId(id) {
    return document.getElementById(id);
  }

  function log(level, message, details) {
    var method = console[level] ? level : 'log';
    var timestamp = new Date().toISOString();

    if (typeof details === 'undefined') {
      console[method](LOG_PREFIX, timestamp, message);
      return;
    }

    console[method](LOG_PREFIX, timestamp, message, details);
  }

  function summarizeReport(report) {
    var photos = Array.isArray(report && report.fotos) ? report.fotos : [];
    return {
      clientRequestId: report && report.clientRequestId,
      queuedAt: report && report.queuedAt,
      attempts: Number(report && report.attempts || 0),
      lastAttemptAt: report && report.lastAttemptAt,
      lastError: report && report.lastError,
      reportadoPor: report && report.reportadoPor,
      ubicacion: report && report.ubicacion,
      descriptionLength: String(report && report.descripcion || '').length,
      photoCount: photos.length,
      photoBytes: photos.map(function (photo) {
        return Number(photo && photo.sizeBytes || 0);
      }),
      estimatedPayloadBytes: estimatePayloadBytes(report)
    };
  }

  function estimatePayloadBytes(value) {
    try {
      return new Blob([JSON.stringify(value || {})]).size;
    } catch (error) {
      return null;
    }
  }

  function createClient(reason) {
    if (client && typeof client.destroy === 'function') {
      client.destroy();
    }
    client = new global.PortalBVClient(config.webAppUrl || '');
    client.timeoutMs = 90000;
    log('info', 'Cliente de Apps Script creado.', {
      reason: reason || 'inicio',
      configured: isConfigured(),
      webAppUrl: maskWebAppUrl(config.webAppUrl)
    });
    return client;
  }

  function maskWebAppUrl(url) {
    var value = normalizeWebAppUrl(url);
    if (!value) return '(sin configurar)';
    return value.replace(/(\/macros\/s\/)[^/]+/i, '$1***');
  }

  function init() {
    elements.form = byId('maintenanceForm');
    if (!elements.form) {
      log('warn', 'No se encontró el formulario de mantenimiento; el módulo no se inició.');
      return;
    }

    log('info', 'Configuración de Web App evaluada.', {
      configured: isConfigured(),
      wrappingQuotesRemoved:
        String(rawConfiguredWebAppUrl || '').trim() !== String(config.webAppUrl || ''),
      webAppUrl: maskWebAppUrl(config.webAppUrl)
    });

    elements.reporter = byId('maintenanceReporter');
    elements.location = byId('maintenanceLocation');
    elements.description = byId('maintenanceDescription');
    elements.cameraButton = byId('maintenanceOpenCameraButton');
    elements.galleryButton = byId('maintenanceOpenGalleryButton');
    elements.cameraInput = byId('maintenanceCameraInput');
    elements.galleryInput = byId('maintenanceGalleryInput');
    elements.previews = byId('maintenancePhotoPreviews');
    elements.photoSelectionStatus = byId('maintenancePhotoSelectionStatus');
    elements.submit = byId('maintenanceSubmit');
    elements.retry = byId('maintenanceRetry');
    elements.status = byId('maintenanceStatus');
    elements.queueCount = byId('maintenanceQueueCount');
    elements.network = byId('maintenanceNetworkStatus');

    log('info', 'Inicializando módulo.', {
      online: navigator.onLine,
      visibilityState: document.visibilityState,
      maxPhotos: MAX_PHOTOS,
      targetImageBytes: TARGET_IMAGE_BYTES,
      maxImageBytes: MAX_IMAGE_BYTES,
      maxDimension: MAX_DIMENSION
    });

    createClient('inicio del módulo');

    bindPanelButtons();
    bindPhotoSelectors();
    elements.form.addEventListener('submit', handleSubmit);
    elements.retry.addEventListener('click', function () {
      log('info', 'Botón "Intentar enviar" presionado.');
      flushQueue(true, null, 'botón manual');
    });

    global.addEventListener('online', function () {
      log('info', 'Evento online recibido.');
      renderNetworkStatus();
      flushQueue(false, null, 'evento online');
    });
    global.addEventListener('offline', function () {
      log('warn', 'Evento offline recibido.');
      renderNetworkStatus();
    });
    global.addEventListener('focus', function () {
      log('debug', 'Ventana enfocada; comprobando cola.');
      flushQueue(false, null, 'foco de ventana');
    });
    document.addEventListener('visibilitychange', function () {
      log('debug', 'Cambió la visibilidad de la página.', {
        hidden: document.hidden,
        visibilityState: document.visibilityState
      });
      if (!document.hidden) flushQueue(false, null, 'página visible');
    });

    if (navigator.connection && navigator.connection.addEventListener) {
      navigator.connection.addEventListener('change', function () {
        log('info', 'Cambió la información de conexión.', getConnectionDetails());
        renderNetworkStatus();
        flushQueue(false, null, 'cambio de conexión');
      });
    }

    global.setInterval(function () {
      if (!document.hidden) {
        log('debug', 'Temporizador periódico; comprobando cola.');
        flushQueue(false, null, 'temporizador de 60 segundos');
      }
    }, 60000);

    renderNetworkStatus();
    refreshQueueCount().catch(function (error) {
      log('error', 'No fue posible consultar la cola durante el inicio.', error);
    });
    flushQueue(false, null, 'inicio del módulo');

    global.BVMantenimientoDebug = {
      retry: function () {
        return flushQueue(true, null, 'consola BVMantenimientoDebug.retry()');
      },
      inspectQueue: async function () {
        var items = await getQueueItems();
        var summary = items.map(summarizeReport);
        log('info', 'Contenido actual de la cola.', summary);
        return summary;
      },
      connection: function () {
        var details = getConnectionDetails();
        log('info', 'Estado actual de conexión.', details);
        return details;
      },
      resetClient: function () {
        createClient('reinicio manual desde consola');
      }
    };

    log('info', 'Herramientas de diagnóstico disponibles en window.BVMantenimientoDebug.');
  }

  function bindPanelButtons() {
    var generalButton = byId('showGeneralPqrs');
    var maintenanceButton = byId('showMaintenanceForm');
    var generalPanel = byId('generalPqrsPanel');
    var maintenancePanel = byId('maintenancePanel');

    function show(panel) {
      var maintenanceVisible = panel === 'maintenance';
      generalPanel.hidden = maintenanceVisible;
      maintenancePanel.hidden = !maintenanceVisible;
      generalButton.classList.toggle('active', !maintenanceVisible);
      maintenanceButton.classList.toggle('active', maintenanceVisible);
      generalButton.setAttribute('aria-pressed', String(!maintenanceVisible));
      maintenanceButton.setAttribute('aria-pressed', String(maintenanceVisible));

      if (maintenanceVisible) {
        maintenancePanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    generalButton.addEventListener('click', function () { show('general'); });
    maintenanceButton.addEventListener('click', function () { show('maintenance'); });
  }

  function bindPhotoSelectors() {
    if (!elements.cameraButton || !elements.galleryButton ||
        !elements.cameraInput || !elements.galleryInput || !elements.previews) {
      log('error', 'No se encontraron todos los controles de cámara y galería.');
      return;
    }

    elements.cameraButton.addEventListener('click', function () {
      log('debug', 'Abriendo cámara del dispositivo.');
      elements.cameraInput.click();
    });

    elements.galleryButton.addEventListener('click', function () {
      log('debug', 'Abriendo galería o selector de archivos.');
      elements.galleryInput.click();
    });

    elements.cameraInput.addEventListener('change', function (event) {
      addSelectedPhotos(event.target.files, 'Cámara');
      event.target.value = '';
    });

    elements.galleryInput.addEventListener('change', function (event) {
      addSelectedPhotos(event.target.files, 'Galería');
      event.target.value = '';
    });

    renderSelectedPhotos();
  }

  function addSelectedPhotos(fileList, source) {
    var incoming = Array.prototype.slice.call(fileList || []);
    var availableSlots = MAX_PHOTOS - selectedPhotoFiles.length;

    if (!incoming.length) return;

    if (availableSlots <= 0) {
      showStatus('warning', 'Ya seleccionaste el máximo de tres fotografías.');
      return;
    }

    var validImages = incoming.filter(function (file) {
      return file && /^image\//i.test(file.type || '');
    });

    if (validImages.length !== incoming.length) {
      showStatus('warning', 'Se omitieron archivos que no son imágenes.');
    }

    var accepted = validImages.slice(0, availableSlots);
    accepted.forEach(function (file) {
      selectedPhotoFiles.push({ file: file, source: source || 'Dispositivo' });
    });

    if (validImages.length > availableSlots) {
      showStatus(
        'warning',
        'Solo se agregaron ' + accepted.length +
        ' fotografía(s) porque el máximo permitido es tres.'
      );
    }

    log('info', 'Fotografías agregadas a la selección.', {
      source: source || 'Dispositivo',
      added: accepted.map(function (item) {
        return { name: item.name, type: item.type, sizeBytes: item.size };
      }),
      selectedCount: selectedPhotoFiles.length
    });

    renderSelectedPhotos();
  }

  async function handleSubmit(event) {
    event.preventDefault();

    var reportadoPor = elements.reporter.value.trim();
    var ubicacion = elements.location.value.trim();
    var descripcion = elements.description.value.trim();
    var files = selectedPhotoFiles.map(function (item) { return item.file; });

    log('info', 'Inicio de creación de reporte.', {
      reporterLength: reportadoPor.length,
      locationLength: ubicacion.length,
      descriptionLength: descripcion.length,
      selectedPhotos: files.map(function (file) {
        return { name: file.name, type: file.type, sizeBytes: file.size };
      })
    });

    if (!elements.form.checkValidity()) {
      elements.form.classList.add('was-validated');
      return;
    }

    if (files.length > MAX_PHOTOS) {
      showStatus('danger', 'Solo puedes adjuntar hasta tres fotografías.');
      return;
    }

    setBusy(true, 'Preparando fotografías…');

    try {
      var photos = [];
      for (var index = 0; index < files.length; index += 1) {
        log('debug', 'Comprimiendo fotografía.', {
          number: index + 1,
          name: files[index].name,
          originalBytes: files[index].size
        });
        photos.push(await compressImage(files[index], index + 1));
        log('debug', 'Fotografía comprimida.', {
          number: index + 1,
          name: photos[index].name,
          finalBytes: photos[index].sizeBytes,
          width: photos[index].width,
          height: photos[index].height
        });
      }

      var report = {
        clientRequestId: createRequestId(),
        reportedAt: new Date().toISOString(),
        queuedAt: new Date().toISOString(),
        attempts: 0,
        reportadoPor: reportadoPor,
        ubicacion: ubicacion,
        descripcion: descripcion,
        fotos: photos
      };

      await putQueueItem(report);
      log('info', 'Reporte guardado en IndexedDB.', summarizeReport(report));
      resetForm();
      await refreshQueueCount();

      showStatus(
        'success',
        'El reporte quedó guardado de forma segura en este dispositivo. Se intentará enviar ahora.'
      );

      await flushQueue(true, report.clientRequestId, 'envío inmediato después de guardar');
    } catch (error) {
      log('error', 'Error al preparar o guardar el reporte.', error);
      showStatus(
        'danger',
        error && error.message
          ? error.message
          : 'No fue posible preparar el reporte.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function flushQueue(force, preferredId, trigger) {
    trigger = trigger || 'no especificado';

    log('info', 'Solicitud de procesamiento de cola.', {
      trigger: trigger,
      force: Boolean(force),
      preferredId: preferredId || null,
      flushInProgress: flushInProgress,
      connection: getConnectionDetails()
    });

    if (flushInProgress) {
      queuedFlushRequest = {
        force: Boolean(force) || Boolean(queuedFlushRequest && queuedFlushRequest.force),
        preferredId: preferredId || (queuedFlushRequest && queuedFlushRequest.preferredId) || null,
        trigger: trigger
      };
      log('info', 'El intento quedó programado para ejecutarse al terminar el envío actual.', {
        trigger: trigger,
        queuedFlushRequest: queuedFlushRequest
      });
      return;
    }

    var uploadDecision = shouldAttemptUpload(force);
    if (!uploadDecision.allowed) {
      log('warn', 'Se omite el intento de envío.', uploadDecision);
      await refreshQueueCount();
      return;
    }
    if (!isConfigured()) {
      log('error', 'No se puede enviar: falta configurar pqrsWebAppUrl.', {
        webAppUrl: maskWebAppUrl(config.webAppUrl)
      });
      showStatus(
        'warning',
        'El reporte está en cola, pero falta configurar la URL de la Web App de PQRS.'
      );
      await refreshQueueCount();
      return;
    }

    flushInProgress = true;
    elements.retry.disabled = true;
    log('info', 'Procesamiento de cola iniciado.', {
      trigger: trigger,
      forced: Boolean(force)
    });

    try {
      var items = await getQueueItems();
      log('info', 'Reportes recuperados de IndexedDB.', {
        count: items.length,
        reports: items.map(summarizeReport)
      });

      if (items.length === 0) {
        log('info', 'No hay reportes pendientes de envío.');
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

          log('info', 'Enviando reporte al Apps Script.', summarizeReport(item));

          var startedAt = Date.now();

          var result = await client.callViaForm(
            'crearReporteMantenimiento',
            item,
            {
              parentOrigin: window.location.origin,
              timeoutMs: 90000
            }
          );
          log('info', 'Respuesta recibida del Apps Script.', {
            clientRequestId: item.clientRequestId,
            elapsedMs: Date.now() - startedAt,
            result: result
          });

          if (!result || !result.ok || !result.reportId) {
            throw new Error(
              result && result.message
                ? result.message
                : 'El servidor no confirmó el registro.'
            );
          }

          await deleteQueueItem(item.clientRequestId);
          log('info', 'Reporte confirmado y eliminado de la cola local.', {
            clientRequestId: item.clientRequestId,
            reportId: result.reportId
          });
          showStatus(
            'success',
            'Reporte enviado correctamente. Número de seguimiento: ' + result.reportId
          );
        } catch (error) {
          item.lastError = error && error.message
            ? error.message
            : String(error || 'Error de red');
          await putQueueItem(item);

          log('error', 'Falló el envío; el reporte permanece en la cola.', {
            report: summarizeReport(item),
            errorName: error && error.name,
            errorMessage: item.lastError,
            stack: error && error.stack,
            online: navigator.onLine
          });

          // El iframe de Apps Script puede haber quedado apuntando a una sesión
          // vencida o a una navegación fallida. El próximo intento debe crear
          // un puente nuevo, no reutilizar el anterior.
          createClient('recuperación después de error de envío');

          var transportFailure = Boolean(
            error && (
              error.code === 'POST_TIMEOUT' ||
              error.code === 'POST_SUBMIT_FAILED' ||
              /conectar|cargar el servicio|POST no recibió|tiempo permitido/i.test(item.lastError)
            )
          );

          showStatus(
            'warning',
            'El reporte continúa guardado en la cola. Se reintentará cuando haya una conexión estable.'
          );

          if (!navigator.onLine) {
            log('warn', 'Se detiene el ciclo porque el navegador reporta estado offline.');
            break;
          }

          if (transportFailure) {
            log('warn', 'Se detiene el ciclo para no repetir el mismo fallo de transporte con todos los reportes.', {
              clientRequestId: item.clientRequestId,
              errorCode: error && error.code
            });
            break;
          }
        }
      }
    } catch (error) {
      log('error', 'Error general procesando la cola.', {
        trigger: trigger,
        errorName: error && error.name,
        errorMessage: error && error.message,
        stack: error && error.stack
      });
      showStatus(
        'danger',
        'No fue posible procesar la cola local. Revisa la consola para más detalles.'
      );
    } finally {
      flushInProgress = false;
      elements.retry.disabled = false;
      try {
        await refreshQueueCount();
      } catch (error) {
        log('error', 'No fue posible actualizar el contador al terminar.', error);
      }
      log('info', 'Procesamiento de cola finalizado.', { trigger: trigger });

      if (queuedFlushRequest) {
        var nextFlush = queuedFlushRequest;
        queuedFlushRequest = null;
        log('info', 'Ejecutando el intento que quedó programado.', nextFlush);
        window.setTimeout(function () {
          flushQueue(
            nextFlush.force,
            nextFlush.preferredId,
            'reintento programado después de: ' + nextFlush.trigger
          );
        }, 0);
      }
    }
  }

  function shouldAttemptUpload(force) {
    if (!navigator.onLine) {
      return {
        allowed: false,
        reason: 'navigator.onLine es false',
        force: Boolean(force),
        connection: getConnectionDetails()
      };
    }
    if (force) {
      return {
        allowed: true,
        reason: 'intento forzado por el usuario o por el envío inicial',
        force: true,
        connection: getConnectionDetails()
      };
    }

    var connection = navigator.connection ||
      navigator.mozConnection ||
      navigator.webkitConnection;

    if (!connection) {
      return {
        allowed: true,
        reason: 'Connection API no disponible; se permite el intento',
        force: false,
        connection: getConnectionDetails()
      };
    }
    if (connection.saveData) {
      return {
        allowed: false,
        reason: 'modo ahorro de datos activo',
        force: false,
        connection: getConnectionDetails()
      };
    }

    var effectiveType = String(connection.effectiveType || '').toLowerCase();
    var allowed = effectiveType !== 'slow-2g' && effectiveType !== '2g';
    return {
      allowed: allowed,
      reason: allowed
        ? 'tipo de conexión permitido'
        : 'tipo de conexión demasiado lento para reintento automático',
      force: false,
      connection: getConnectionDetails()
    };
  }

  function getConnectionDetails() {
    var connection = navigator.connection ||
      navigator.mozConnection ||
      navigator.webkitConnection;

    return {
      online: navigator.onLine,
      effectiveType: connection && connection.effectiveType || null,
      downlink: connection && connection.downlink || null,
      rtt: connection && connection.rtt || null,
      saveData: Boolean(connection && connection.saveData),
      documentHidden: document.hidden,
      visibilityState: document.visibilityState
    };
  }

  function isConfigured() {
    config.webAppUrl = normalizeWebAppUrl(config.webAppUrl);
    return /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec(?:[?#].*)?$/i.test(
      config.webAppUrl
    );
  }

  function renderNetworkStatus() {
    var text = navigator.onLine ? 'Con conexión' : 'Sin conexión';
    var className = navigator.onLine ? 'text-success' : 'text-warning';
    var connection = navigator.connection ||
      navigator.mozConnection ||
      navigator.webkitConnection;

    if (navigator.onLine && connection && connection.effectiveType) {
      text += ' · ' + connection.effectiveType.toUpperCase();
    }

    elements.network.textContent = text;
    elements.network.className = className + ' fw-semibold';
    log('debug', 'Indicador de red actualizado.', getConnectionDetails());
  }

  async function refreshQueueCount() {
    var items = await getQueueItems();
    var count = items.length;

    log('debug', 'Contador de cola actualizado.', {
      count: count,
      reports: items.map(summarizeReport)
    });

    elements.queueCount.textContent = String(count);
    elements.retry.hidden = count === 0;

    if (count > 0) {
      elements.status.hidden = false;
      elements.status.className = 'alert alert-warning';
      elements.status.innerHTML =
        '<i class="bi bi-cloud-arrow-up"></i> ' +
        '<strong>' + count + '</strong> reporte(s) pendiente(s) de envío. ' +
        'La información permanece guardada en este dispositivo.';
    } else if (!elements.status.dataset.persistent) {
      elements.status.hidden = true;
    }
  }

  function showStatus(type, message) {
    elements.status.hidden = false;
    elements.status.dataset.persistent = 'true';
    elements.status.className = 'alert alert-' + type;
    elements.status.textContent = message;

    global.setTimeout(function () {
      delete elements.status.dataset.persistent;
      refreshQueueCount();
    }, 12000);
  }

  function setBusy(isBusy, label) {
    var photoLimitReached = selectedPhotoFiles.length >= MAX_PHOTOS;

    elements.submit.disabled = isBusy;
    if (elements.cameraButton) {
      elements.cameraButton.disabled = isBusy || photoLimitReached;
    }
    if (elements.galleryButton) {
      elements.galleryButton.disabled = isBusy || photoLimitReached;
    }
    if (elements.cameraInput) elements.cameraInput.disabled = isBusy;
    if (elements.galleryInput) elements.galleryInput.disabled = isBusy;

    elements.submit.innerHTML = isBusy
      ? '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>' +
        escapeHtml(label || 'Procesando…')
      : '<i class="bi bi-send-check"></i> Guardar y enviar reporte';
  }

  function resetForm() {
    elements.form.reset();
    elements.form.classList.remove('was-validated');
    selectedPhotoFiles = [];
    if (elements.cameraInput) elements.cameraInput.value = '';
    if (elements.galleryInput) elements.galleryInput.value = '';
    renderSelectedPhotos();
  }

  function removeSelectedPhoto(index) {
    if (index < 0 || index >= selectedPhotoFiles.length) return;

    var removed = selectedPhotoFiles.splice(index, 1)[0];
    log('info', 'Fotografía retirada de la selección.', {
      name: removed && removed.file ? removed.file.name : '',
      selectedCount: selectedPhotoFiles.length
    });
    renderSelectedPhotos();
  }

  function renderSelectedPhotos() {
    if (!elements.previews) return;

    elements.previews.innerHTML = '';

    selectedPhotoFiles.forEach(function (selected, index) {
      var file = selected.file;
      var card = document.createElement('div');
      card.className = 'maintenance-photo-preview';

      var image = document.createElement('img');
      image.alt = 'Vista previa de ' + file.name;
      var objectUrl = URL.createObjectURL(file);
      image.src = objectUrl;
      image.onload = function () { URL.revokeObjectURL(objectUrl); };
      image.onerror = function () { URL.revokeObjectURL(objectUrl); };

      var removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'btn btn-danger btn-sm maintenance-photo-remove';
      removeButton.setAttribute('aria-label', 'Retirar ' + file.name);
      removeButton.title = 'Retirar fotografía';
      removeButton.innerHTML = '<i class="bi bi-x-lg" aria-hidden="true"></i>';
      removeButton.addEventListener('click', function () {
        removeSelectedPhoto(index);
      });

      var caption = document.createElement('small');
      caption.className = 'fw-semibold';
      caption.textContent = file.name;

      var source = document.createElement('div');
      source.className = 'maintenance-photo-source';
      source.textContent = (selected.source || 'Dispositivo') +
        ' · ' + formatFileSize(file.size);

      card.appendChild(image);
      card.appendChild(removeButton);
      card.appendChild(caption);
      card.appendChild(source);
      elements.previews.appendChild(card);
    });

    if (elements.photoSelectionStatus) {
      var count = selectedPhotoFiles.length;
      var remaining = Math.max(0, MAX_PHOTOS - count);
      elements.photoSelectionStatus.textContent = count === 0
        ? 'Ninguna fotografía seleccionada. Puedes adjuntar hasta tres.'
        : count + ' fotografía(s) seleccionada(s). Puedes agregar ' +
          remaining + ' más.';
    }

    if (elements.cameraButton) {
      elements.cameraButton.disabled = selectedPhotoFiles.length >= MAX_PHOTOS;
    }
    if (elements.galleryButton) {
      elements.galleryButton.disabled = selectedPhotoFiles.length >= MAX_PHOTOS;
    }
  }

  function formatFileSize(bytes) {
    var value = Number(bytes || 0);
    if (value < 1024) return value + ' B';
    if (value < 1024 * 1024) return Math.round(value / 1024) + ' KB';
    return (value / (1024 * 1024)).toFixed(1) + ' MB';
  }

  async function compressImage(file, photoNumber) {
    if (!file || !/^image\//i.test(file.type || '')) {
      throw new Error('El archivo ' + photoNumber + ' no es una imagen válida.');
    }

    var source = await loadImageSource(file);
    var originalWidth = source.width;
    var originalHeight = source.height;
    var scale = Math.min(1, MAX_DIMENSION / Math.max(originalWidth, originalHeight));
    var width = Math.max(1, Math.round(originalWidth * scale));
    var height = Math.max(1, Math.round(originalHeight * scale));
    var quality = 0.82;
    var blob = null;

    for (var resizeAttempt = 0; resizeAttempt < 6; resizeAttempt += 1) {
      var canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      var context = canvas.getContext('2d', { alpha: false });
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(source, 0, 0, width, height);

      quality = 0.82;
      for (var qualityAttempt = 0; qualityAttempt < 8; qualityAttempt += 1) {
        blob = await canvasToBlob(canvas, 'image/jpeg', quality);
        if (blob.size <= TARGET_IMAGE_BYTES || quality <= 0.38) break;
        quality -= 0.07;
      }

      if (blob.size <= TARGET_IMAGE_BYTES || Math.max(width, height) <= 720) break;
      width = Math.max(1, Math.round(width * 0.82));
      height = Math.max(1, Math.round(height * 0.82));
    }

    if (source.close) source.close();

    if (!blob || blob.size > MAX_IMAGE_BYTES) {
      throw new Error(
        'No fue posible reducir la fotografía ' + photoNumber +
        ' por debajo de 5 MB. Intenta con otra imagen.'
      );
    }

    return {
      name: normalizeFileName(file.name || 'foto-' + photoNumber + '.jpg'),
      mimeType: 'image/jpeg',
      sizeBytes: blob.size,
      width: width,
      height: height,
      dataUrl: await blobToDataUrl(blob)
    };
  }

  function loadImageSource(file) {
    if ('createImageBitmap' in global) {
      return createImageBitmap(file, { imageOrientation: 'from-image' })
        .catch(function () {
          return loadImageElement(file);
        });
    }

    return loadImageElement(file);
  }

  function loadImageElement(file) {
    return new Promise(function (resolve, reject) {
      var image = new Image();
      var url = URL.createObjectURL(file);
      image.onload = function () {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('El formato de una fotografía no es compatible. Usa JPG o PNG.'));
      };
      image.src = url;
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error('No fue posible comprimir una fotografía.'));
      }, type, quality);
    });
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () {
        reject(new Error('No fue posible leer una fotografía comprimida.'));
      };
      reader.readAsDataURL(blob);
    });
  }

  function createRequestId() {
    if (global.crypto && global.crypto.randomUUID) {
      return 'MREQ-' + global.crypto.randomUUID();
    }
    return 'MREQ-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  function normalizeFileName(name) {
    return String(name)
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9._-]/g, '-')
      .slice(0, 100);
  }

  function escapeHtml(value) {
    var div = document.createElement('div');
    div.textContent = String(value || '');
    return div.innerHTML;
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      log('debug', 'Abriendo IndexedDB.', {
        dbName: DB_NAME,
        version: DB_VERSION,
        storeName: STORE_NAME
      });
      var request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = function () {
        log('info', 'Actualizando estructura de IndexedDB.', {
          oldVersion: request.oldVersion,
          newVersion: request.newVersion
        });
        var db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          var store = db.createObjectStore(STORE_NAME, {
            keyPath: 'clientRequestId'
          });
          store.createIndex('queuedAt', 'queuedAt', { unique: false });
        }
      };
      request.onsuccess = function () {
        log('debug', 'IndexedDB abierto correctamente.');
        resolve(request.result);
      };
      request.onerror = function () {
        log('error', 'Falló la apertura de IndexedDB.', request.error);
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
    }).then(function () {
      log('debug', 'Elemento escrito en la cola local.', summarizeReport(item));
    });
  }

  async function deleteQueueItem(clientRequestId) {
    var db = await openDb();
    return transactionPromise(db, 'readwrite', function (store) {
      store.delete(clientRequestId);
    }).then(function () {
      log('debug', 'Elemento eliminado de la cola local.', {
        clientRequestId: clientRequestId
      });
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
        reject(request.error || new Error('No fue posible consultar la cola local.'));
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

  document.addEventListener('DOMContentLoaded', init);
}(window));
