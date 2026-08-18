(function () {
  'use strict';

  var config = window.CONVIVENCIA_FORM_CONFIG || {};
  var API_URL = config.apiUrl || '';

  var categorias = [];
  var severidades = [];
  var evidencias = [];
  var motivoSeleccionado = '';
  var severidadSeleccionada = '';

  var $ = function (id) { return document.getElementById(id); };

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

  var form = $('convivenciaCasoForm');
  if (!form) return;

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
      var response = await fetch(API_URL + '?action=listarConfig');
      var data = await response.json();
      if (data.ok) {
        categorias = data.categorias || [];
        severidades = data.severidades || [];
        cargarCategorias();
        cargarSeveridades();
      }
    } catch (error) {
      console.error('Error cargando configuración:', error);
      showAlert('No se pudo cargar la configuración');
    }
  }

  function cargarCategorias() {
    var container = $('convivenciaCategoriasContainer');
    if (!container) return;
    if (categorias.length === 0) {
      container.innerHTML = '<p class="text-muted">Cargando categorías...</p>';
      return;
    }
    var html = categorias.map(function (cat) {
      return '<button type="button" class="cv-category-badge" data-category="' + esc(cat) + '">' + esc(cat) + '</button>';
    }).join('');
    container.innerHTML = html;
  }

  function cargarSeveridades() {
    var container = $('convivenciaSeveridadContainer');
    if (!container || severidades.length === 0) return;
    var html = severidades.map(function (sev) {
      return '<button type="button" class="cv-severity-badge" data-nombre="' + esc(sev.nombre) + '" data-cuotas="' + sev.cuotas + '">' +
        '<strong>' + esc(sev.nombre) + '</strong> (' + sev.cuotas + ' cuota' + (sev.cuotas !== 1 ? 's' : '') + ')</button>';
    }).join('');
    container.innerHTML = html;
  }

  function siguiente(desde, hasta) {
    if (!validarPaso(desde)) return;
    ocultarPasos();
    var paso = $('convivenciaPaso' + hasta);
    if (paso) paso.classList.remove('hidden');
    marcarPasoCompleto(desde);
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
        return '<div class="mb-2"><img src="' + evidence.dataUrl + '" style="max-width: 200px; max-height: 150px; border-radius: 4px;" alt="Evidencia ' + (idx + 1) + '">' +
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
      var status = $('convivenciaSubmitStatus');
      if (btn) btn.disabled = true;
      if (status) status.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Subiendo evidencias...';

      var evidenceUrls = [];
      for (var i = 0; i < evidencias.length; i++) {
        var evidence = evidencias[i];
        if (status) status.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Subiendo evidencia ' + (i + 1) + '/' + evidencias.length + '...';

        try {
          var uploadResult = await uploadEvidenceToGoogle(evidence);
          if (uploadResult.ok) {
            evidenceUrls.push(uploadResult.url);
          }
        } catch (uploadError) {
          console.warn('Error subiendo evidencia:', uploadError);
        }
      }

      if (status) status.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Creando caso...';

      var caseData = {
        apto: apto ? apto.value.trim() : '',
        motivo: motivoSeleccionado || (motivo ? motivo.value.trim() : ''),
        descripcion: descripcion ? descripcion.value.trim() : '',
        razonNotificacion: razon ? razon.value.trim() : '',
        notificador: notificador ? notificador.value.trim() : '',
        severidad: severidadSeleccionada,
        evidencias: evidenceUrls
      };

      var createResponse = await fetch(API_URL + '?action=crearCasoConvivencia', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify(caseData)
      });

      var createResult = await createResponse.json();
      if (!createResult.ok) {
        throw new Error(createResult.error || 'Error al crear el caso');
      }

      var caseIdEl = $('convivenciaSuccessCaseId');
      if (caseIdEl) caseIdEl.textContent = createResult.caseId;
      var successMsg = $('convivenciaSuccessMessage');
      if (successMsg) successMsg.classList.remove('hidden');
      if (form) form.reset();
      evidencias = [];
      motivoSeleccionado = '';
      severidadSeleccionada = '';
      actualizarListaEvidencias();

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
      showAlert('Error al crear caso: ' + error.message);
      console.error(error);
    } finally {
      if (btn) btn.disabled = false;
      if (status) status.innerHTML = '';
    }
  }

  async function uploadEvidenceToGoogle(evidence) {
    try {
      var response = await fetch(API_URL + '?action=subirEvidenciaConvivencia', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({
          name: evidence.name,
          mimeType: 'image/jpeg',
          dataUrl: evidence.dataUrl,
          contexto: 'caso_admin',
          apto: $('convivenciaApto') ? $('convivenciaApto').value.trim() : '',
          captureMetadata: evidence.captureMetadata || null
        })
      });

      var result = await response.json();
      return result;
    } catch (error) {
      console.error('Error uploading to Google Drive:', error);
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
        contextLabel: 'Evidencia de convivencia - Administración',
        detailLines: apto && apto.value ? ['Apartamento: ' + apto.value] : [],
        filePrefix: 'convivencia-admin',
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

    if (!/^image\//i.test(file.type)) {
      showAlert('Solo se permiten archivos de imagen');
      return;
    }

    try {
      var compressedData = await compressImage(file);
      evidencias.push(compressedData);
      actualizarListaEvidencias();
      showAlert('Imagen comprimida y agregada exitosamente', 'success');
    } catch (error) {
      showAlert('Error al procesar imagen: ' + error.message);
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

  function actualizarListaEvidencias() {
    var container = $('convivenciaEvidenciasList');
    if (!container) return;
    if (evidencias.length === 0) {
      container.innerHTML = '<small class="text-muted d-block">Ninguna evidencia seleccionada</small>';
      return;
    }
    var html = evidencias.map(function (evidence, idx) {
      return '<div class="card mb-2">' +
        '<div class="card-body p-2">' +
        '<div class="d-flex justify-content-between align-items-center">' +
        '<div><i class="bi bi-image me-2"></i><strong>' + esc(evidence.name) + '</strong><br>' +
        '<small class="text-muted">' + (evidence.size / 1024).toFixed(1) + ' KB</small></div>' +
        '<button type="button" class="btn btn-danger btn-sm cv-remove-evidence" data-idx="' + idx + '">' +
        '<i class="bi bi-trash"></i></button></div></div></div>';
    }).join('');
    container.innerHTML = html;
  }

  var categoriesContainer = $('convivenciaCategoriasContainer');
  if (categoriesContainer) {
    categoriesContainer.addEventListener('click', function (event) {
      var badge = event.target.closest('.cv-category-badge');
      if (!badge) return;
      motivoSeleccionado = badge.getAttribute('data-category') || '';
      var motivo = $('convivenciaMotivoCustom');
      if (motivo) motivo.value = '';
      var badges = categoriesContainer.querySelectorAll('.cv-category-badge');
      for (var i = 0; i < badges.length; i++) {
        badges[i].classList.remove('selected');
      }
      badge.classList.add('selected');
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

  cargarConfiguracion();
})();
