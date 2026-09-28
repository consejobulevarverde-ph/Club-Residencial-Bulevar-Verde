// convivencia-casos.js — vista "Casos Convivencia" compartida por /administracion-datos/ (Firebase)
// y /comite-convivencia-datos/ (token del comité). Autocontenido: no depende de core.js.
// La página anfitriona completa window.CONVIVENCIA_CASOS_CONFIG (obtenerToken, onNoAutorizado);
// el partial convivencia-casos/index.html fija apiBase, rutaCasos, acciones y anularSoloSinSancion.
(function () {
  'use strict';

  var CASOS_CONVIVENCIA_LIMIT = 20;
  var EVIDENCIAS_CASO_LIMITE = 20;
  var ESTADOS_TERMINALES = [
    'CERRADO_SIN_SANCION', 'SANCION_RATIFICADA', 'SANCION_REVOCADA', 'ARCHIVADO', 'ANULADO',
    'SANCION_APROBADA_ALLANAMIENTO'
  ];

  var casosConvivenciaOffset = 0;
  var casosConvivenciaAcumulados = [];
  var casoConvivenciaActual = null;
  var modales = {};

  // Se lee en cada llamada: la página puede completar la config después de cargar este script.
  function config() {
    return window.CONVIVENCIA_CASOS_CONFIG || {};
  }

  function puede(accion) {
    return (config().acciones || []).indexOf(accion) !== -1;
  }

  function $(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character];
    });
  }

  function msg(text, type) {
    var box = $('casosConvivenciaAlert');
    if (!box) return;
    box.className = 'alert alert-' + (type || 'danger');
    box.textContent = text;
    box.classList.remove('hidden');
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function hideMsg() {
    var box = $('casosConvivenciaAlert');
    if (box) box.classList.add('hidden');
  }

  function busy(button, active, text) {
    if (!button) return;
    if (active) {
      button.dataset.old = button.innerHTML;
      button.disabled = true;
      button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>' + text;
    } else {
      button.disabled = false;
      button.innerHTML = button.dataset.old || text;
    }
  }

  function mostrarElemento(id, visible) {
    var el = $(id);
    if (el) el.classList.toggle('hidden', !visible);
  }

  // bootstrap.bundle se carga después de este script en ambas páginas: instanciar al primer uso.
  function modal(id) {
    if (!modales[id]) {
      var el = $(id);
      if (!el || !window.bootstrap) return null;
      modales[id] = new window.bootstrap.Modal(el);
    }
    return modales[id];
  }

  function apiFetch(path, options) {
    options = options || {};
    var cfg = config();
    if (typeof cfg.obtenerToken !== 'function') {
      return Promise.reject(new Error('No hay sesión activa. Por favor, inicia sesión nuevamente.'));
    }

    return Promise.resolve(cfg.obtenerToken()).then(function (token) {
      if (!token) throw new Error('No hay sesión activa. Por favor, inicia sesión nuevamente.');
      var headers = { Authorization: 'Bearer ' + token };
      var fetchOptions = { method: options.method || 'GET', headers: headers };
      if (options.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        fetchOptions.body = JSON.stringify(options.body);
      }
      return fetch(cfg.apiBase + cfg.rutaCasos + path, fetchOptions);
    }).then(function (response) {
      if (response.status === 204) return {};
      return response.json().catch(function () { return {}; }).then(function (body) {
        if (!response.ok) {
          if (response.status === 401 && typeof config().onNoAutorizado === 'function') {
            config().onNoAutorizado();
          }
          throw new Error((body.error && body.error.message) || 'Error ' + response.status);
        }
        return body;
      });
    });
  }

  function obtenerBadgeEstadoCaso(estado) {
    var badges = {
      PENDIENTE_DESCARGOS: '<span class="badge bg-warning text-dark">Pendiente de descargos</span>',
      CON_DESCARGOS: '<span class="badge bg-info text-dark">Descargos recibidos</span>',
      PENDIENTE_APROBACION_CONSEJO: '<span class="badge bg-warning text-dark">Pendiente Consejo</span>',
      SANCION_APROBADA: '<span class="badge bg-dark">Sanción aprobada</span>',
      EN_APELACION: '<span class="badge bg-warning text-dark">En apelación</span>',
      CERRADO_SIN_SANCION: '<span class="badge bg-success">Cerrado sin sanción</span>',
      SANCION_RATIFICADA: '<span class="badge bg-dark">Sanción ratificada</span>',
      SANCION_REVOCADA: '<span class="badge bg-success">Sanción revocada</span>',
      SANCION_APROBADA_ALLANAMIENTO: '<span class="badge bg-dark">Sanción aceptada con descuento</span>',
      ARCHIVADO: '<span class="badge bg-secondary">Archivado</span>',
      ANULADO: '<span class="badge bg-danger">Anulado</span>'
    };
    return badges[estado] || '<span class="badge bg-secondary">' + esc(estado) + '</span>';
  }

  function formatearMoneda(valor) {
    return Number(valor || 0).toLocaleString('es-CO', { maximumFractionDigits: 0 });
  }

  // ===== LISTA =====

  function cargarCasosConvivencia(reset) {
    if (reset !== false) casosConvivenciaOffset = 0;
    var seleccion = $('casosConvivenciaFiltroEstado').value;
    var estados = seleccion === 'EN_TRAMITE'
      ? ['PENDIENTE_DESCARGOS', 'CON_DESCARGOS']
      : (seleccion ? [seleccion] : []);
    var qs = '?limit=' + CASOS_CONVIVENCIA_LIMIT + '&offset=' + casosConvivenciaOffset +
      estados.map(function (e) { return '&estado=' + encodeURIComponent(e); }).join('');

    apiFetch('/casos' + qs).then(function (resp) {
      var items = resp.data || [];
      renderCasosConvivenciaTabla(items, casosConvivenciaOffset === 0);
      $('casosConvivenciaCargarMasBtn').classList.toggle('hidden', items.length < CASOS_CONVIVENCIA_LIMIT);
    }).catch(function (error) { msg(error.message); });
  }

  function renderCasosConvivenciaTabla(items, reset) {
    if (reset) casosConvivenciaAcumulados = [];
    casosConvivenciaAcumulados = casosConvivenciaAcumulados.concat(items);

    if (!casosConvivenciaAcumulados.length) {
      $('casosConvivenciaTabla').innerHTML = '<p class="text-muted">Sin casos registrados.</p>';
      return;
    }

    $('casosConvivenciaTabla').innerHTML = casosConvivenciaAcumulados.map(function (caso) {
      return '<div class="border-bottom py-2 d-flex justify-content-between align-items-center caso-convivencia-item" ' +
        'data-id="' + esc(caso.id) + '" style="cursor:pointer">' +
        '<div><strong>' + esc(caso.apartamento) + '</strong> · ' + esc(caso.motivo) +
        '<br><small class="text-muted">' + esc(caso.caseCode) + ' · ' + esc(caso.fechaCreacion) + '</small></div>' +
        '<div>' + obtenerBadgeEstadoCaso(caso.estado) +
        (caso.severidad ? ' <span class="badge bg-secondary ms-1">' + esc(caso.severidad) + '</span>' : '') +
        (caso.tieneDescargos ? ' <span class="badge bg-info text-dark ms-1">Con descargos</span>' : '') +
        '</div></div>';
    }).join('');
  }

  // ===== DETALLE =====

  function actualizarFormularioEvidenciaCaso(caso, countActual) {
    var form = $('casoDetailEvidenciaForm');
    var input = $('casoDetailEvidenciaInput');
    var boton = $('casoDetailEvidenciaSubmitBtn');
    var estadoEl = $('casoDetailEvidenciaEstado');
    form.reset();
    if (!puede('EVIDENCIA_CASO') || caso.estado === 'ANULADO') {
      form.classList.add('hidden');
      return;
    }
    form.classList.remove('hidden');
    var restantes = EVIDENCIAS_CASO_LIMITE - countActual;
    if (restantes <= 0) {
      input.disabled = true;
      boton.disabled = true;
      estadoEl.textContent = 'Se alcanzó el máximo de ' + EVIDENCIAS_CASO_LIMITE + ' evidencias para este caso.';
    } else {
      input.disabled = false;
      boton.disabled = false;
      estadoEl.textContent = 'Cupo disponible: ' + restantes + ' de ' + EVIDENCIAS_CASO_LIMITE + '.';
    }
  }

  function buildCasoEvidenceThumb(url, label) {
    var match = /\/file\/d\/([^/]+)/.exec(url || '');
    var thumbUrl = match ? ('https://drive.google.com/thumbnail?id=' + encodeURIComponent(match[1]) + '&sz=w300') : url;
    return '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" title="' + esc(label) + '">' +
      '<img src="' + esc(thumbUrl) + '" alt="' + esc(label) + '" ' +
      'style="width:96px;height:96px;object-fit:cover;border-radius:8px" ' +
      'onerror="this.style.display=\'none\'">' +
      '</a>';
  }

  function verDetalleCasoConvivencia(id) {
    hideMsg();
    apiFetch('/casos/' + id).then(function (resp) {
      casoConvivenciaActual = resp.data;
      renderDetalleCasoConvivencia(resp.data);
      $('casosConvivenciaListView').classList.add('hidden');
      $('casosConvivenciaDetailView').classList.remove('hidden');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }).catch(function (error) { msg(error.message); });
  }

  function aplicarCasoActualizado(caso, mensaje) {
    casoConvivenciaActual = caso;
    renderDetalleCasoConvivencia(caso);
    msg(mensaje, 'success');
  }

  var TIPO_EVENTO_LABELS = {
    CASO_CREADO: 'Caso creado',
    CASO_EDITADO: 'Información del caso editada',
    CASO_ANULADO: 'Caso anulado',
    SEVERIDAD_MODIFICADA: 'Severidad modificada',
    DESCARGOS_REGISTRADOS: 'Descargos registrados',
    ACTA_COMITE_REGISTRADA: 'Acta de comité registrada',
    EVIDENCIA_ADICIONAL_REGISTRADA: 'Evidencia adicional cargada',
    CASO_CERRADO_SIN_SANCION: 'Caso cerrado sin sanción',
    CASO_ARCHIVADO: 'Caso archivado',
    SANCION_PROPUESTA: 'Sanción propuesta',
    CONSEJO_APROBO_SANCION: 'Consejo aprobó la sanción',
    CONSEJO_RECHAZO_SANCION: 'Consejo rechazó la sanción',
    CONSEJO_DEVOLVIO_PROPUESTA: 'Consejo devolvió la propuesta',
    APELACION_PRESENTADA: 'Apelación presentada',
    APELACION_RATIFICADA: 'Apelación ratificada',
    APELACION_REVOCADA: 'Apelación revocada',
    ALLANAMIENTO_ACEPTADO: 'Residente aceptó los cargos (descuento del 50%)'
  };

  var ACTOR_LABELS = {
    VIGILANCIA: 'Vigilancia',
    ADMINISTRACION: 'Administración',
    RESIDENTE: 'Residente',
    COMITE: 'Comité de Convivencia',
    SISTEMA: 'Sistema'
  };

  function renderHistorialCaso(eventos) {
    if (!eventos || !eventos.length) {
      $('casoDetailHistorial').innerHTML = '<p class="text-muted small mb-0">Sin eventos registrados.</p>';
      return;
    }
    $('casoDetailHistorial').innerHTML = eventos.map(function (evento) {
      var etiqueta = TIPO_EVENTO_LABELS[evento.tipoEvento] || evento.tipoEvento;
      var actor = ACTOR_LABELS[evento.actorTipo] || evento.actorTipo;
      return '<div class="border-start border-3 border-success ps-3 mb-3">' +
        '<div class="small text-muted">' + esc(evento.fechaCreacion) + ' · ' + esc(actor) + '</div>' +
        '<div><strong>' + esc(etiqueta) + '</strong></div>' +
        (evento.descripcion ? '<div class="small mt-1">' + esc(evento.descripcion) + '</div>' : '') +
        '</div>';
    }).join('');
  }

  // Cada bloque se muestra si el llamador tiene la acción Y el estado del caso la admite.
  function actualizarAccionesDisponibles(caso) {
    var enTramite = caso.estado === 'PENDIENTE_DESCARGOS' || caso.estado === 'CON_DESCARGOS';
    var terminal = ESTADOS_TERMINALES.indexOf(caso.estado) !== -1;

    mostrarElemento('casoDetailEditarBtn', puede('EDITAR'));
    mostrarElemento('casoDetailAnularBtn',
      puede('ANULAR') && caso.estado !== 'ANULADO' && !(config().anularSoloSinSancion && caso.sancion));
    mostrarElemento('casoAccionesSeveridad', puede('CAMBIAR_SEVERIDAD') && !caso.sancion && !terminal);
    // El comité sesiona normalmente después de los descargos: se permite en ambos estados, una vez.
    mostrarElemento('casoAccionesComite',
      puede('ACTA_COMITE') && enTramite && caso.requiereProcesoFormal && !caso.actaComiteFecha);
    mostrarElemento('casoAccionesCierre', puede('CIERRE') && enTramite);
    mostrarElemento('casoAccionesProponerSancion', puede('PROPONER_SANCION') && enTramite && caso.requiereProcesoFormal);
    mostrarElemento('casoAccionesConsejo', puede('CONSEJO_DECISION') && caso.estado === 'PENDIENTE_APROBACION_CONSEJO');
    mostrarElemento('casoAccionesApelacion', puede('RESOLVER_APELACION') && caso.estado === 'EN_APELACION');
  }

  function renderGaleria(contenedorId, seccionId, evidencias, prefijo) {
    if (evidencias.length) {
      if (seccionId) $(seccionId).classList.remove('hidden');
      $(contenedorId).innerHTML = evidencias.map(function (e, idx) {
        return buildCasoEvidenceThumb(e.url, prefijo + ' ' + (idx + 1));
      }).join('');
    } else {
      if (seccionId) $(seccionId).classList.add('hidden');
      $(contenedorId).innerHTML = '';
    }
  }

  function renderDetalleCasoConvivencia(caso) {
    $('casoDetailId').textContent = caso.caseCode;
    $('casoDetailApto').textContent = caso.apartamento;
    $('casoDetailMotivo').textContent = caso.motivo;
    $('casoDetailEstado').innerHTML = obtenerBadgeEstadoCaso(caso.estado);
    $('casoDetailTipoProceso').textContent = caso.requiereProcesoFormal
      ? 'Proceso sancionatorio formal'
      : 'Llamado de atención — no requiere proceso formal';
    $('casoDetailSeveridad').textContent = caso.severidad || 'No especificada';
    $('casoDetailCuotas').textContent = Number(caso.sancionEquivalente || 0);
    $('casoDetailNotificador').textContent = caso.notificadorAdmin || '—';
    $('casoDetailFecha').textContent = caso.fechaCreacion || '';
    $('casoDetailDescripcion').textContent = caso.descripcion || '';
    $('casoDetailRazon').textContent = caso.razonNotificacion || '';

    var evidencias = caso.evidencias || [];
    var porContexto = function (contexto) {
      return evidencias.filter(function (e) { return e.contexto === contexto; });
    };

    var evidenciasCaso = porContexto('CASO');
    renderGaleria('casoDetailEvidencias', null, evidenciasCaso, 'Evidencia');
    actualizarFormularioEvidenciaCaso(caso, evidenciasCaso.length);

    if (caso.descargosResidente) {
      $('casoDetailDescargosSection').classList.remove('hidden');
      $('casoDetailFechaDescargos').textContent = 'Recibidos el ' + (caso.fechaDescargos || '');
      $('casoDetailDescargosTexto').textContent = caso.descargosResidente;
      renderGaleria('casoDetailEvidenciasDescargos', 'casoDetailEvidenciasDescargosSection',
        porContexto('DESCARGO'), 'Evidencia de descargo');
    } else {
      $('casoDetailDescargosSection').classList.add('hidden');
    }

    if (caso.actaComiteResumen) {
      $('casoDetailActaComiteSection').classList.remove('hidden');
      $('casoDetailActaComiteFecha').textContent = 'Sesión del ' + (caso.actaComiteFecha || '');
      $('casoDetailActaComiteResumen').textContent = caso.actaComiteResumen;
      renderGaleria('casoDetailActaComiteEvidencias', 'casoDetailActaComiteEvidenciasSection',
        porContexto('ACTA_COMITE'), 'Anexo');
    } else {
      $('casoDetailActaComiteSection').classList.add('hidden');
    }

    if (caso.sancionPropuestaTipo) {
      $('casoDetailSancionPropuestaSection').classList.remove('hidden');
      $('casoDetailSancionPropuestaTipo').textContent = caso.sancionPropuestaTipo;
      $('casoDetailSancionPropuestaValor').textContent = formatearMoneda(caso.sancionPropuestaValor);
      $('casoDetailSancionPropuestaJustificacion').textContent = caso.sancionPropuestaJustificacion || '';
    } else {
      $('casoDetailSancionPropuestaSection').classList.add('hidden');
    }

    if (caso.sancion) {
      $('casoDetailSancionSection').classList.remove('hidden');
      $('casoDetailSancionTipo').textContent = caso.sancion.tipoSancion || '';
      $('casoDetailSancionValor').textContent = formatearMoneda(caso.sancion.valor);
      $('casoDetailSancionEstado').textContent = caso.sancion.estado || '';
      $('casoDetailSancionFecha').textContent = caso.sancion.fechaImposicion || '';
    } else {
      $('casoDetailSancionSection').classList.add('hidden');
    }

    if (caso.apelacionTexto) {
      $('casoDetailApelacionSection').classList.remove('hidden');
      $('casoDetailApelacionFecha').textContent = 'Presentada el ' + (caso.fechaApelacion || '');
      $('casoDetailApelacionTexto').textContent = caso.apelacionTexto;
      renderGaleria('casoDetailEvidenciasApelacion', 'casoDetailEvidenciasApelacionSection',
        porContexto('APELACION'), 'Evidencia apelación');
    } else {
      $('casoDetailApelacionSection').classList.add('hidden');
    }

    renderHistorialCaso(caso.eventos);
    actualizarAccionesDisponibles(caso);

    $('casoSeveridadSelect').value = caso.severidad || 'Leve';
    $('casoCierreEstado').value = 'CERRADO_SIN_SANCION';
    $('casoCierreResolucion').value = '';
    $('casoCierreNotas').value = '';
    $('casoActaComiteForm').reset();
    $('casoActaComiteEvidenciaEstado').textContent = '';
    $('casoProponerSancionForm').reset();
    $('casoConsejoForm').reset();
    $('casoApelacionResolverForm').reset();
  }

  // ===== EVIDENCIAS =====

  function leerArchivoComoDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('No fue posible leer el archivo "' + file.name + '".')); };
      reader.onload = function () { resolve(reader.result); };
      reader.readAsDataURL(file);
    });
  }

  function subirEvidenciasConvivencia(files, contexto, caseCode, apartamento) {
    var urls = [];
    var subirSiguiente = function (i) {
      if (i >= files.length) return Promise.resolve(urls);
      return leerArchivoComoDataUrl(files[i]).then(function (dataUrl) {
        return apiFetch('/evidencias', {
          method: 'POST',
          body: { mimeType: files[i].type, dataUrl: dataUrl, contexto: contexto, caseId: caseCode, apartamento: apartamento }
        });
      }).then(function (resp) {
        urls.push(resp.data.url);
        return subirSiguiente(i + 1);
      });
    };
    return subirSiguiente(0);
  }

  // ===== EVENTOS =====

  $('casosConvivenciaFiltroEstado').addEventListener('change', function () { cargarCasosConvivencia(true); });

  $('casosConvivenciaCargarMasBtn').addEventListener('click', function () {
    casosConvivenciaOffset += CASOS_CONVIVENCIA_LIMIT;
    cargarCasosConvivencia(false);
  });

  $('casosConvivenciaTabla').addEventListener('click', function (event) {
    var item = event.target.closest('.caso-convivencia-item');
    if (item) verDetalleCasoConvivencia(item.dataset.id);
  });

  $('casosConvivenciaVolverBtn').addEventListener('click', function () {
    hideMsg();
    $('casosConvivenciaDetailView').classList.add('hidden');
    $('casosConvivenciaListView').classList.remove('hidden');
    cargarCasosConvivencia(true);
  });

  $('casoDetailEditarBtn').addEventListener('click', function () {
    if (!casoConvivenciaActual) return;
    $('editCasoId').value = casoConvivenciaActual.caseCode || '';
    $('editCasoApto').value = casoConvivenciaActual.apartamento || '';
    $('editCasoMotivo').value = casoConvivenciaActual.motivo || '';
    $('editCasoDescripcion').value = casoConvivenciaActual.descripcion || '';
    $('editCasoRazon').value = casoConvivenciaActual.razonNotificacion || '';
    $('editCasoNotificador').value = casoConvivenciaActual.notificadorAdmin || '';
    var m = modal('modalEditarCasoConvivencia');
    if (m) m.show();
  });

  var editCasoSubmitBtn = $('editCasoConvivenciaSubmit');
  if (editCasoSubmitBtn) editCasoSubmitBtn.addEventListener('click', function () {
    if (!casoConvivenciaActual) return;
    hideMsg();
    var btn = this;
    var motivo = $('editCasoMotivo').value.trim();
    var descripcion = $('editCasoDescripcion').value.trim();
    var razon = $('editCasoRazon').value.trim();
    var notificador = $('editCasoNotificador').value.trim();

    if (!motivo || !descripcion || !razon || !notificador) {
      msg('Todos los campos son requeridos');
      return;
    }

    busy(btn, true, 'Guardando…');
    apiFetch('/casos/' + casoConvivenciaActual.id, {
      method: 'PATCH',
      body: { motivo: motivo, descripcion: descripcion, razonNotificacion: razon, notificadorAdmin: notificador }
    }).then(function (resp) {
      var m = modal('modalEditarCasoConvivencia');
      if (m) m.hide();
      aplicarCasoActualizado(resp.data, 'Caso actualizado');
    }).catch(function (error) { msg(error.message); })
      .finally(function () { busy(btn, false, 'Guardar cambios'); });
  });

  $('casoDetailAnularBtn').addEventListener('click', function () {
    if (!casoConvivenciaActual) return;
    $('anularCasoMotivo').value = '';
    var m = modal('modalAnularCasoConvivencia');
    if (m) m.show();
  });

  var anularCasoSubmitBtn = $('anularCasoConvivenciaSubmit');
  if (anularCasoSubmitBtn) anularCasoSubmitBtn.addEventListener('click', function () {
    if (!casoConvivenciaActual) return;
    hideMsg();
    var btn = this;
    var motivo = $('anularCasoMotivo').value.trim();

    if (!motivo) {
      msg('Debe indicar el motivo de la anulación');
      return;
    }

    if (!confirm('¿Estás seguro de que deseas anular este caso? El caso dejará de contar en el historial de la unidad pero quedará visible aquí.')) {
      return;
    }

    busy(btn, true, 'Anulando…');
    apiFetch('/casos/' + casoConvivenciaActual.id + '/anular', {
      method: 'PATCH',
      body: { motivo: motivo }
    }).then(function (resp) {
      var m = modal('modalAnularCasoConvivencia');
      if (m) m.hide();
      aplicarCasoActualizado(resp.data, 'Caso anulado');
    }).catch(function (error) { msg(error.message); })
      .finally(function () { busy(btn, false, 'Anular caso'); });
  });

  $('casoSeveridadForm').addEventListener('submit', function (event) {
    event.preventDefault();
    hideMsg();
    if (!casoConvivenciaActual) return;

    var severidad = $('casoSeveridadSelect').value;
    if (severidad === casoConvivenciaActual.severidad) {
      msg('El caso ya tiene esa severidad.', 'info');
      return;
    }

    var button = event.target.querySelector('button[type="submit"]');
    busy(button, true, 'Guardando…');
    apiFetch('/casos/' + casoConvivenciaActual.id + '/severidad', {
      method: 'PATCH',
      body: { severidad: severidad }
    }).then(function (resp) {
      aplicarCasoActualizado(resp.data, 'Severidad actualizada.');
    }).catch(function (error) { msg(error.message); })
      .finally(function () { busy(button, false, 'Guardar severidad'); });
  });

  $('casoDetailEvidenciaForm').addEventListener('submit', function (event) {
    event.preventDefault();
    hideMsg();
    if (!casoConvivenciaActual) return;

    var files = Array.prototype.slice.call($('casoDetailEvidenciaInput').files || []);
    var estadoEl = $('casoDetailEvidenciaEstado');
    var button = $('casoDetailEvidenciaSubmitBtn');
    if (!files.length) {
      msg('Selecciona al menos un archivo.');
      return;
    }

    var existentes = (casoConvivenciaActual.evidencias || []).filter(function (e) { return e.contexto === 'CASO'; }).length;
    if (existentes + files.length > EVIDENCIAS_CASO_LIMITE) {
      msg('Solo puedes cargar ' + (EVIDENCIAS_CASO_LIMITE - existentes) + ' archivo(s) más para este caso.');
      return;
    }

    busy(button, true, 'Cargando…');
    estadoEl.textContent = 'Subiendo ' + files.length + ' archivo(s)…';
    subirEvidenciasConvivencia(files, 'caso', casoConvivenciaActual.caseCode, casoConvivenciaActual.apartamento)
      .then(function (urls) {
        estadoEl.textContent = '';
        return apiFetch('/casos/' + casoConvivenciaActual.id + '/evidencias', {
          method: 'POST',
          body: { evidencias: urls }
        });
      }).then(function (resp) {
        aplicarCasoActualizado(resp.data, 'Evidencia cargada.');
      }).catch(function (error) {
        estadoEl.textContent = '';
        msg(error.message);
      }).finally(function () { busy(button, false, 'Cargar evidencia'); });
  });

  $('casoActaComiteForm').addEventListener('submit', function (event) {
    event.preventDefault();
    hideMsg();
    if (!casoConvivenciaActual) return;

    var fecha = $('casoActaComiteFecha').value;
    var resumen = $('casoActaComiteResumen').value.trim();
    if (!fecha || resumen.length < 20) {
      msg('La fecha y un resumen de al menos 20 caracteres son requeridos.');
      return;
    }

    var files = Array.prototype.slice.call($('casoActaComiteEvidenciaInput').files || []);
    var estadoEl = $('casoActaComiteEvidenciaEstado');
    var button = event.target.querySelector('button[type="submit"]');
    busy(button, true, 'Guardando…');

    var subida = Promise.resolve([]);
    if (files.length) {
      estadoEl.textContent = 'Subiendo ' + files.length + ' archivo(s)…';
      subida = subirEvidenciasConvivencia(files, 'acta_comite', casoConvivenciaActual.caseCode, casoConvivenciaActual.apartamento);
    }
    subida.then(function (urls) {
      estadoEl.textContent = '';
      return apiFetch('/casos/' + casoConvivenciaActual.id + '/acta-comite', {
        method: 'POST',
        body: { fecha: fecha, resumen: resumen, evidencias: urls }
      });
    }).then(function (resp) {
      aplicarCasoActualizado(resp.data, 'Acta de comité registrada.');
    }).catch(function (error) {
      estadoEl.textContent = '';
      msg(error.message);
    }).finally(function () { busy(button, false, 'Registrar acta'); });
  });

  $('casoCierreForm').addEventListener('submit', function (event) {
    event.preventDefault();
    hideMsg();
    if (!casoConvivenciaActual) return;

    var estado = $('casoCierreEstado').value;
    var resolucion = $('casoCierreResolucion').value.trim();
    if (estado === 'CERRADO_SIN_SANCION' && !resolucion) {
      msg('La resolución es requerida para cerrar el caso sin sanción.');
      return;
    }

    var button = event.target.querySelector('button[type="submit"]');
    busy(button, true, 'Guardando…');
    apiFetch('/casos/' + casoConvivenciaActual.id + '/estado', {
      method: 'PATCH',
      body: {
        estado: estado,
        resolucion: resolucion || undefined,
        notasAdmin: $('casoCierreNotas').value.trim() || undefined
      }
    }).then(function (resp) {
      aplicarCasoActualizado(resp.data, 'Caso actualizado.');
    }).catch(function (error) { msg(error.message); })
      .finally(function () { busy(button, false, 'Guardar'); });
  });

  $('casoProponerSancionForm').addEventListener('submit', function (event) {
    event.preventDefault();
    hideMsg();
    if (!casoConvivenciaActual) return;

    var tipo = $('casoProponerSancionTipo').value.trim();
    var valor = Number($('casoProponerSancionValor').value);
    var justificacion = $('casoProponerSancionJustificacion').value.trim();
    if (!tipo || !valor || valor <= 0 || justificacion.length < 20) {
      msg('Completa tipo, valor y una justificación de al menos 20 caracteres.');
      return;
    }

    var button = event.target.querySelector('button[type="submit"]');
    busy(button, true, 'Enviando…');
    apiFetch('/casos/' + casoConvivenciaActual.id + '/proponer-sancion', {
      method: 'PATCH',
      body: { tipoSancion: tipo, valorPropuesto: valor, justificacion: justificacion }
    }).then(function (resp) {
      aplicarCasoActualizado(resp.data, 'Propuesta enviada al Consejo.');
    }).catch(function (error) { msg(error.message); })
      .finally(function () { busy(button, false, 'Enviar al Consejo'); });
  });

  var ENDPOINT_POR_ACCION_CONSEJO = {
    aprobar: 'consejo-aprobar',
    rechazar: 'consejo-rechazar',
    devolver: 'consejo-devolver'
  };

  $('casoConsejoForm').addEventListener('submit', function (event) {
    event.preventDefault();
    hideMsg();
    if (!casoConvivenciaActual) return;

    var accion = (event.submitter && event.submitter.dataset.accion) || 'aprobar';
    var ruta = ENDPOINT_POR_ACCION_CONSEJO[accion];
    var resolucion = $('casoConsejoResolucion').value.trim();
    if (!resolucion) {
      msg('La resolución es requerida.');
      return;
    }

    var button = event.submitter;
    busy(button, true, 'Guardando…');
    apiFetch('/casos/' + casoConvivenciaActual.id + '/' + ruta, {
      method: 'PATCH',
      body: { resolucion: resolucion, notasAdmin: $('casoConsejoNotas').value.trim() || undefined }
    }).then(function (resp) {
      aplicarCasoActualizado(resp.data, 'Decisión del Consejo registrada.');
    }).catch(function (error) { msg(error.message); })
      .finally(function () { busy(button, false, 'Guardar'); });
  });

  var ENDPOINT_POR_ACCION_APELACION = {
    ratificar: 'apelacion-ratificar',
    revocar: 'apelacion-revocar'
  };

  $('casoApelacionResolverForm').addEventListener('submit', function (event) {
    event.preventDefault();
    hideMsg();
    if (!casoConvivenciaActual) return;

    var accion = (event.submitter && event.submitter.dataset.accion) || 'ratificar';
    var ruta = ENDPOINT_POR_ACCION_APELACION[accion];
    var resolucion = $('casoApelacionResolverResolucion').value.trim();
    if (!resolucion) {
      msg('La resolución es requerida.');
      return;
    }

    var button = event.submitter;
    busy(button, true, 'Guardando…');
    apiFetch('/casos/' + casoConvivenciaActual.id + '/' + ruta, {
      method: 'PATCH',
      body: { resolucion: resolucion, notasAdmin: $('casoApelacionResolverNotas').value.trim() || undefined }
    }).then(function (resp) {
      aplicarCasoActualizado(resp.data, 'Apelación resuelta.');
    }).catch(function (error) { msg(error.message); })
      .finally(function () { busy(button, false, 'Guardar'); });
  });

  window.BVConvivenciaCasos = {
    // Muestra el listado (desde cero) — lo llaman el stub de administración y la página del comité.
    mostrar: function () {
      hideMsg();
      $('casosConvivenciaDetailView').classList.add('hidden');
      $('casosConvivenciaListView').classList.remove('hidden');
      cargarCasosConvivencia(true);
    }
  };
}());
