// convivencia-correccion.js — "Corregir un caso reciente": quien creó un caso de convivencia
// puede corregir sus datos narrativos y adjuntar evidencia olvidada mientras la API lo
// permita (GET /casos/mis-recientes-corregibles). Reutiliza token, preparación de archivos
// y subida a Drive expuestos por convivencia-form.js (window.BVConvivenciaForm).
(function () {
  'use strict';

  var config = window.CONVIVENCIA_FORM_CONFIG || {};
  var API_BASE = config.apiBase || '';
  var EVIDENCIAS_CASO_LIMITE = 20;

  var casos = [];
  var casoActual = null;
  var evidenciasPendientes = [];
  var caseCodeResaltado = null;
  var cargado = false;

  var $ = function (id) { return document.getElementById(id); };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character];
    });
  }

  function formulario() {
    return window.BVConvivenciaForm || {};
  }

  function msg(texto, tipo) {
    var box = $('cvCorreccionAlert');
    if (!box) return;
    box.className = 'alert alert-' + (tipo || 'danger');
    box.textContent = texto;
    box.classList.remove('hidden');
  }

  function ocultarMsg() {
    var box = $('cvCorreccionAlert');
    if (box) box.classList.add('hidden');
  }

  function busy(boton, activo, texto) {
    if (!boton) return;
    if (activo) {
      boton.dataset.old = boton.innerHTML;
      boton.disabled = true;
      boton.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>' + texto;
    } else {
      boton.disabled = false;
      boton.innerHTML = boton.dataset.old || texto;
    }
  }

  function apiFetch(path, options) {
    options = options || {};
    var obtenerToken = formulario().obtenerToken;
    if (typeof obtenerToken !== 'function') {
      return Promise.reject(new Error('No hay sesión activa.'));
    }
    return obtenerToken().then(function (token) {
      var headers = { Authorization: 'Bearer ' + token };
      var fetchOptions = { method: options.method || 'GET', headers: headers };
      if (options.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        fetchOptions.body = JSON.stringify(options.body);
      }
      return fetch(API_BASE + '/api/v1/convivencia' + path, fetchOptions);
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (body) {
        if (!response.ok) {
          var error = new Error((body.error && body.error.message) || 'Error ' + response.status);
          error.status = response.status;
          throw error;
        }
        return body;
      });
    });
  }

  function formatearFecha(iso) {
    var fecha = new Date(iso);
    if (isNaN(fecha.getTime())) return '';
    return fecha.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
  }

  function haceCuanto(iso) {
    var minutos = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
    if (minutos < 60) return 'hace ' + minutos + ' min';
    var horas = Math.round(minutos / 60);
    return 'hace ' + horas + ' h';
  }

  // ===== LISTA =====

  function cargarCasos() {
    cargado = true;
    ocultarMsg();
    $('cvCorreccionLista').innerHTML = '<p class="text-muted mb-0">Cargando…</p>';
    return apiFetch('/casos/mis-recientes-corregibles').then(function (resp) {
      casos = resp.data || [];
      renderLista();
    }).catch(function (error) {
      $('cvCorreccionLista').innerHTML = '';
      msg('No fue posible consultar tus casos recientes: ' + error.message);
    });
  }

  function renderLista() {
    var contenedor = $('cvCorreccionLista');
    if (!casos.length) {
      contenedor.innerHTML = '<p class="text-muted mb-0">No tienes casos que todavía se puedan corregir.</p>';
      return;
    }
    contenedor.innerHTML = casos.map(function (caso) {
      var resaltado = caso.caseCode === caseCodeResaltado ? ' resaltado' : '';
      return '<div class="border rounded p-2 mb-2 d-flex justify-content-between align-items-center gap-2 cv-correccion-item' + resaltado + '">' +
        '<div><strong>' + esc(caso.caseCode) + '</strong> · Apto ' + esc(caso.apartamento) + ' · ' + esc(caso.motivo) +
        ' <span class="badge bg-secondary">' + esc(caso.severidad) + '</span>' +
        '<br><small class="text-muted">Creado ' + esc(haceCuanto(caso.fechaCreacion)) + ' · ' +
        caso.cantidadEvidencias + ' evidencia(s) · Corregible hasta ' + esc(formatearFecha(caso.corregibleHasta)) + '</small></div>' +
        '<button type="button" class="btn btn-sm btn-outline-primary cv-correccion-abrir" data-id="' + esc(caso.id) + '">' +
        '<i class="bi bi-pencil me-1"></i>Corregir</button>' +
        '</div>';
    }).join('');
  }

  function mostrarLista() {
    $('cvCorreccionEditorView').classList.add('hidden');
    $('cvCorreccionListaView').classList.remove('hidden');
    casoActual = null;
    evidenciasPendientes = [];
  }

  // ===== EDITOR =====

  function abrirCaso(id) {
    var caso = casos.filter(function (c) { return c.id === id; })[0];
    if (!caso) return;
    ocultarMsg();
    casoActual = caso;
    evidenciasPendientes = [];
    renderEditor();
    $('cvCorreccionListaView').classList.add('hidden');
    $('cvCorreccionEditorView').classList.remove('hidden');
  }

  function renderEditor() {
    $('cvCorreccionCaseCode').textContent = casoActual.caseCode;
    $('cvCorreccionApto').textContent = casoActual.apartamento;
    $('cvCorreccionNotificador').textContent = casoActual.notificadorAdmin;
    $('cvCorreccionHasta').textContent = formatearFecha(casoActual.corregibleHasta);
    $('cvCorreccionMotivo').value = casoActual.motivo || '';
    $('cvCorreccionDescripcion').value = casoActual.descripcion || '';
    $('cvCorreccionRazon').value = casoActual.razonNotificacion || '';
    $('cvCorreccionCantidadEvidencias').textContent = casoActual.cantidadEvidencias;
    $('cvCorreccionEvidenciaEstado').textContent = '';
    renderPendientes();
  }

  function actualizarCaso(casoActualizado) {
    casoActual = casoActualizado;
    casos = casos.map(function (c) { return c.id === casoActualizado.id ? casoActualizado : c; });
  }

  // La API cierra la ventana (403/409): el caso ya no es corregible, se saca de la lista.
  function manejarErrorCorreccion(error) {
    if (error.status === 403 || error.status === 409) {
      var id = casoActual && casoActual.id;
      casos = casos.filter(function (c) { return c.id !== id; });
      renderLista();
      mostrarLista();
      msg(error.message, 'warning');
      return;
    }
    msg(error.message);
  }

  $('cvCorreccionDatosForm').addEventListener('submit', function (event) {
    event.preventDefault();
    ocultarMsg();
    if (!casoActual) return;

    var motivo = $('cvCorreccionMotivo').value.trim();
    var descripcion = $('cvCorreccionDescripcion').value.trim();
    var razon = $('cvCorreccionRazon').value.trim();
    if (!motivo || !descripcion || !razon) {
      msg('Motivo, descripción y justificación son obligatorios.');
      return;
    }
    if (motivo === casoActual.motivo && descripcion === casoActual.descripcion && razon === casoActual.razonNotificacion) {
      msg('No hay cambios para guardar.', 'info');
      return;
    }

    var boton = $('cvCorreccionGuardarBtn');
    busy(boton, true, 'Guardando…');
    apiFetch('/casos/' + encodeURIComponent(casoActual.id), {
      method: 'PATCH',
      body: { motivo: motivo, descripcion: descripcion, razonNotificacion: razon }
    }).then(function (resp) {
      actualizarCaso(resp.data);
      renderEditor();
      msg('Corrección guardada.', 'success');
    }).catch(manejarErrorCorreccion)
      .finally(function () { busy(boton, false, 'Guardar corrección'); });
  });

  // ===== EVIDENCIA =====

  function renderPendientes() {
    var contenedor = $('cvCorreccionEvidenciasPendientes');
    $('cvCorreccionAdjuntarBtn').classList.toggle('hidden', !evidenciasPendientes.length);
    if (!evidenciasPendientes.length) {
      contenedor.innerHTML = '';
      return;
    }
    contenedor.innerHTML = evidenciasPendientes.map(function (evidencia, idx) {
      var tipo = evidencia.type || '';
      var icono = tipo === 'application/pdf' ? 'bi-file-earmark-pdf' : (/^video\//i.test(tipo) ? 'bi-camera-video' : 'bi-image');
      return '<div class="d-flex justify-content-between align-items-center border rounded p-2 mb-1">' +
        '<span><i class="bi ' + icono + ' me-2"></i>' + esc(evidencia.name) +
        ' <small class="text-muted">(' + ((evidencia.size || 0) / 1024).toFixed(1) + ' KB)</small></span>' +
        '<button type="button" class="btn btn-sm btn-outline-danger cv-correccion-quitar" data-idx="' + idx + '" aria-label="Quitar evidencia">' +
        '<i class="bi bi-trash"></i></button></div>';
    }).join('');
  }

  function agregarPendiente(evidencia) {
    if (casoActual.cantidadEvidencias + evidenciasPendientes.length >= EVIDENCIAS_CASO_LIMITE) {
      msg('Este caso ya alcanzó el máximo de evidencias.');
      return;
    }
    if (!evidencia.type && evidencia.file) evidencia.type = evidencia.file.type;
    evidenciasPendientes.push(evidencia);
    renderPendientes();
  }

  // Inicializar inputs con el accept dinámico
  if (window.BVEvidenceTypes) {
    var input = $('cvCorreccionGaleriaInput');
    if (input) input.setAttribute('accept', window.BVEvidenceTypes.ACCEPT);
  }

  $('cvCorreccionCamaraBtn').addEventListener('click', function () {
    ocultarMsg();
    if (!casoActual) return;
    if (!window.BVEvidenceCamera) {
      msg('No fue posible cargar el módulo de cámara. Recarga la página e intenta nuevamente.');
      return;
    }
    window.BVEvidenceCamera.capture({
      contextLabel: 'Evidencia de convivencia - Corrección',
      detailLines: ['Caso: ' + casoActual.caseCode, 'Apartamento: ' + casoActual.apartamento],
      filePrefix: 'convivencia-caso',
      maxDimension: 1600,
      quality: 0.84,
      allowVideo: true,
      maxVideoSeconds: 30,
      maxVideoBytes: 50 * 1024 * 1024
    }).then(agregarPendiente).catch(function (error) {
      if (error && error.name === 'AbortError') return;
      msg('No fue posible capturar la evidencia: ' + (error.message || error));
    });
  });

  $('cvCorreccionGaleriaBtn').addEventListener('click', function () {
    $('cvCorreccionGaleriaInput').click();
  });

  $('cvCorreccionGaleriaInput').addEventListener('change', function (event) {
    var file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file || !casoActual) return;
    ocultarMsg();
    var preparar = formulario().prepararArchivoEvidencia;
    if (typeof preparar !== 'function') {
      msg('No fue posible procesar el archivo. Recarga la página e intenta nuevamente.');
      return;
    }
    preparar(file).then(function (resultado) {
      if (!resultado.data.type) resultado.data.type = file.type;
      agregarPendiente(resultado.data);
    }).catch(function (error) { msg(error.message); });
  });

  $('cvCorreccionEvidenciasPendientes').addEventListener('click', function (event) {
    var boton = event.target.closest('.cv-correccion-quitar');
    if (!boton) return;
    evidenciasPendientes.splice(Number(boton.dataset.idx), 1);
    renderPendientes();
  });

  $('cvCorreccionAdjuntarBtn').addEventListener('click', function () {
    ocultarMsg();
    if (!casoActual || !evidenciasPendientes.length) return;
    var subir = formulario().subirEvidencia;
    if (typeof subir !== 'function') {
      msg('No fue posible subir la evidencia. Recarga la página e intenta nuevamente.');
      return;
    }

    var boton = $('cvCorreccionAdjuntarBtn');
    var estado = $('cvCorreccionEvidenciaEstado');
    var caso = casoActual;
    var urls = [];
    busy(boton, true, 'Adjuntando…');

    var subirSiguiente = function (i) {
      if (i >= evidenciasPendientes.length) return Promise.resolve();
      estado.textContent = 'Subiendo evidencia ' + (i + 1) + ' de ' + evidenciasPendientes.length + '…';
      return subir(evidenciasPendientes[i], caso.apartamento, caso.caseCode).then(function (resultado) {
        if (!resultado || !resultado.ok) throw new Error((resultado && resultado.error) || 'No fue posible subir la evidencia.');
        urls.push(resultado.url);
        return subirSiguiente(i + 1);
      });
    };

    subirSiguiente(0).then(function () {
      estado.textContent = 'Vinculando al caso…';
      return apiFetch('/casos/' + encodeURIComponent(caso.id) + '/evidencias', {
        method: 'POST',
        body: { evidencias: urls }
      });
    }).then(function (resp) {
      evidenciasPendientes = [];
      actualizarCaso(resp.data);
      renderEditor();
      msg('Evidencia adjuntada al caso ' + caso.caseCode + '.', 'success');
    }).catch(function (error) {
      estado.textContent = '';
      manejarErrorCorreccion(error);
    }).finally(function () { busy(boton, false, 'Adjuntar al caso'); });
  });

  // ===== NAVEGACIÓN =====

  $('cvCorreccionLista').addEventListener('click', function (event) {
    var boton = event.target.closest('.cv-correccion-abrir');
    if (boton) abrirCaso(boton.dataset.id);
  });

  $('cvCorreccionVolverBtn').addEventListener('click', function () {
    ocultarMsg();
    mostrarLista();
    renderLista();
  });

  $('cvCorreccionRecargarBtn').addEventListener('click', function () {
    mostrarLista();
    cargarCasos();
  });

  // Carga perezosa: solo al abrir la sección por primera vez.
  $('cvCorreccionPanel').addEventListener('toggle', function () {
    if (this.open && !cargado) cargarCasos();
  });

  // Tras confirmar un caso nuevo, se abre la sección con ese caso resaltado. La cola
  // offline puede confirmar casos en segundo plano: si el editor está abierto no se
  // interrumpe (solo se refresca la lista, que está oculta).
  document.addEventListener('bv:caso-convivencia-creado', function (event) {
    caseCodeResaltado = event.detail && event.detail.caseCode;
    var panel = $('cvCorreccionPanel');
    if (panel && !panel.open) {
      cargado = true;
      panel.open = true;
    }
    if (casoActual) {
      apiFetch('/casos/mis-recientes-corregibles').then(function (resp) {
        casos = resp.data || [];
        renderLista();
      }).catch(function () { /* se reintenta al volver a la lista con "Actualizar" */ });
      return;
    }
    cargarCasos();
  });
}());
