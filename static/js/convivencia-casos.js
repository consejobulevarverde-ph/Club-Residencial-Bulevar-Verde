// convivencia-casos.js — vista "Casos Convivencia" compartida por /administracion-datos/ (Firebase),
// /comite-convivencia-datos/ (token del comité) y /consejo-administracion-datos/ (token del consejo, solo consulta). Autocontenido: no depende de core.js.
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
    listaCargada = true;
    var seleccion = $('casosConvivenciaFiltroEstado').value;
    var estados = seleccion === 'EN_TRAMITE'
      ? ['PENDIENTE_DESCARGOS', 'CON_DESCARGOS']
      : (seleccion ? [seleccion] : []);
    var severidad = $('casosConvivenciaFiltroSeveridad').value;
    var apartamento = $('casosConvivenciaFiltroApartamento').value.trim();
    var palabraClave = $('casosConvivenciaFiltroPalabraClave').value.trim();
    var qs = '?limit=' + CASOS_CONVIVENCIA_LIMIT + '&offset=' + casosConvivenciaOffset +
      estados.map(function (e) { return '&estado=' + encodeURIComponent(e); }).join('') +
      (severidad ? '&severidad=' + encodeURIComponent(severidad) : '') +
      (apartamento ? '&apartamento=' + encodeURIComponent(apartamento) : '') +
      (palabraClave.length >= 2 ? '&q=' + encodeURIComponent(palabraClave) : '');

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
        (caso.tieneAdjuntos ? ' <i class="bi bi-image text-muted ms-1" title="Tiene adjuntos" aria-label="Tiene adjuntos"></i>' : '') +
        '<br><small class="text-muted">' + esc(caso.caseCode) + ' · ' + esc(caso.fechaCreacion) + '</small></div>' +
        '<div>' + obtenerBadgeEstadoCaso(caso.estado) +
        (caso.registro === 'BORRADOR' ? ' <span class="badge text-bg-warning">Pendiente de completar</span>' : '') +
        (caso.pendienteNotificar ? ' <span class="badge text-bg-warning">Pendiente de notificar</span>' : '') +
        (caso.severidad ? ' <span class="badge bg-secondary ms-1">' + esc(caso.severidad) + '</span>' : '') +
        (caso.tieneDescargos ? ' <span class="badge bg-info text-dark ms-1">Con descargos</span>' : '') +
        (puede('OCULTAR_EVIDENCIA') && caso.evidenciaOculta ? ' <span class="badge text-bg-dark ms-1" title="Evidencia oculta: solo administración la ve"><i class="bi bi-eye-slash"></i> Evidencia oculta</span>' : '') +
        (puede('REMITIR') && caso.remitidoComite ? ' <span class="badge text-bg-success ms-1" title="Remitido al Comité de Convivencia">Comité</span>' : '') +
        (puede('REMITIR') && caso.remitidoConsejo ? ' <span class="badge text-bg-success ms-1" title="Remitido al Consejo de Administración">Consejo</span>' : '') +
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

  var ESTILO_TILE = 'display:inline-flex;align-items:center;justify-content:center;width:96px;height:96px;border-radius:8px;background:#f1f1f1;text-decoration:none;color:#666';

  function pieEvidencia(evidencia) {
    var partes = [];
    if (evidencia.nombreArchivo) partes.push(esc(evidencia.nombreArchivo));
    if (evidencia.tamanoBytes && window.BVEvidenceTypes && window.BVEvidenceTypes.formatearTamano) {
      partes.push(esc(window.BVEvidenceTypes.formatearTamano(evidencia.tamanoBytes)));
    }
    return partes.length
      ? '<small class="d-block text-muted text-truncate" style="max-width:96px" title="' + partes.join(' · ') + '">' + partes.join(' · ') + '</small>'
      : '';
  }

  // Evidencias en Cloud Storage (bucket privado): se muestran con una URL firmada de corta
  // duración que la API emite tras verificar el acceso al caso. Videos MP4: el navegador los
  // reproduce y permite buscar sin descargarlos completos.
  function buildEvidenciaGcs(evidencia, label) {
    var clasificacion = window.BVEvidenceTypes
      ? window.BVEvidenceTypes.clasificar({ name: evidencia.nombreArchivo || '', type: evidencia.mimeType || '' })
      : null;
    var categoria = clasificacion ? clasificacion.categoria : '';
    var icono = categoria === 'video' ? 'bi-play-circle' : clasificacion ? window.BVEvidenceTypes.icono(categoria) : 'bi-file';
    return '<div class="text-center">' +
      '<a href="#" class="cv-evidencia-gcs" data-evidencia-id="' + esc(evidencia.id) + '" data-categoria="' + esc(categoria) + '" title="' + esc(label) + '" style="' + ESTILO_TILE + '">' +
      '<i class="bi ' + icono + '" style="font-size:2rem;"></i></a>' + pieEvidencia(evidencia) + '</div>';
  }

  function cargarMiniaturasGcs(contenedor) {
    var casoId = casoConvivenciaActual && casoConvivenciaActual.id;
    if (!contenedor || !casoId) return;
    Array.prototype.forEach.call(contenedor.querySelectorAll('.cv-evidencia-gcs[data-categoria="image"]'), function (enlace) {
      apiFetch('/casos/' + casoId + '/evidencias/' + encodeURIComponent(enlace.dataset.evidenciaId) + '/acceso').then(function (resp) {
        enlace.innerHTML = '<img src="' + esc(resp.data.url) + '" alt="' + esc(enlace.title) + '" style="width:96px;height:96px;object-fit:cover;border-radius:8px">';
      }).catch(function () { /* queda el ícono; al hacer clic se reintenta */ });
    });
  }

  function abrirEvidenciaGcs(enlace) {
    var casoId = casoConvivenciaActual && casoConvivenciaActual.id;
    if (!casoId) return;
    // Abrir la pestaña antes de la petición evita el bloqueador de ventanas emergentes.
    var ventana = window.open('', '_blank');
    apiFetch('/casos/' + casoId + '/evidencias/' + encodeURIComponent(enlace.dataset.evidenciaId) + '/acceso').then(function (resp) {
      if (ventana) {
        ventana.opener = null;
        ventana.location.href = resp.data.url;
      } else {
        window.location.href = resp.data.url;
      }
    }).catch(function (error) {
      if (ventana) ventana.close();
      msg('No fue posible abrir la evidencia: ' + error.message);
    });
  }

  function buildCasoEvidenceThumb(evidencia, label) {
    if (evidencia.almacenamiento === 'GCS') return buildEvidenciaGcs(evidencia, label);
    var url = evidencia.url;
    var match = /\/file\/d\/([^/]+)/.exec(url || '');
    var thumbUrl = match ? ('https://drive.google.com/thumbnail?id=' + encodeURIComponent(match[1]) + '&sz=w300') : url;

    // La URL de Drive es .../file/d/<id>/view — sin extensión ni tipo real, así que el
    // tipo hay que tomarlo de los metadatos que guardó la API (nombreArchivo/mimeType).
    var clasificacion = window.BVEvidenceTypes
      ? window.BVEvidenceTypes.clasificar({ name: evidencia.nombreArchivo || '', type: evidencia.mimeType || '' })
      : null;
    var esImagen = clasificacion && clasificacion.categoria === 'image';

    if (!clasificacion && match) {
      // Histórico sin metadatos: se intenta la miniatura de Drive (imagen o video) y, si no
      // carga, queda el ícono con el enlace. No se infiere el tipo desde la URL.
      return '<div class="text-center"><a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" title="' + esc(label) + '" style="' + ESTILO_TILE + ';position:relative">' +
        '<i class="bi bi-file-earmark" style="font-size:2rem;"></i>' +
        '<img src="' + esc(thumbUrl) + '" alt="" style="position:absolute;inset:0;width:96px;height:96px;object-fit:cover;border-radius:8px" onerror="this.remove()">' +
        '</a>' + pieEvidencia(evidencia) + '</div>';
    }

    if (esImagen) {
      return '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" title="' + esc(label) + '">' +
        '<img src="' + esc(thumbUrl) + '" alt="' + esc(label) + '" ' +
        'style="width:96px;height:96px;object-fit:cover;border-radius:8px" ' +
        'onerror="this.style.display=\'none\'">' +
        '</a>';
    } else {
      // No-imagen: mostrar icono + enlace
      var icono = clasificacion ? window.BVEvidenceTypes.icono(clasificacion.categoria) : 'bi-file';
      return '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer" title="' + esc(label) + '" ' +
        'style="display:inline-flex;align-items:center;justify-content:center;width:96px;height:96px;border-radius:8px;background:#f1f1f1;text-decoration:none;color:#666">' +
        '<i class="bi ' + icono + '" style="font-size:2rem;"></i>' +
        '</a>';
    }
  }

  function verDetalleCasoConvivencia(id) {
    hideMsg();
    apiFetch('/casos/' + id).then(function (resp) {
      casoConvivenciaActual = resp.data;
      renderDetalleCasoConvivencia(resp.data);
      $('casosConvivenciaListView').classList.add('hidden');
      $('casosConvivenciaTabs').classList.add('hidden');
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
    ALLANAMIENTO_ACEPTADO: 'Residente aceptó los cargos (descuento del 50%)',
    CASO_REMITIDO_COMITE: 'Caso remitido al Comité de Convivencia',
    CASO_REMITIDO_CONSEJO: 'Caso remitido al Consejo de Administración',
    NOTIFICACION_SOLICITADA: 'Notificación solicitada por administración',
    NOTIFICACION_LEIDA: 'El residente abrió el caso en el portal',
    NOTIFICACION_ENVIADA: 'Notificación enviada',
    NOTIFICACION_FALLIDA: 'Notificación fallida',
    NOTIFICACION_INCIERTA: 'Notificación con resultado incierto',
    NOTIFICACION_REINTENTADA: 'Notificación reintentada',
    NOTIFICACION_MARCADA_ENVIADA: 'Notificación marcada como enviada',
    EVIDENCIA_OCULTADA: 'Evidencia ocultada (solo administración la ve)',
    EVIDENCIA_MOSTRADA: 'Evidencia visible nuevamente'
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

  // ===== NOTIFICAR AL RESIDENTE (solo administración) =====
  // Llamado de atención: se notifica solo al finalizar. Proceso formal: queda «Pendiente de notificar» y
  // administración elige destinatarios en este modal (todos preseleccionados). Se puede volver a notificar.

  var NOTIFICACION_EN_CURSO = ['SOLICITADA', 'ENVIANDO', 'FALLIDA_REINTENTABLE'];

  function notificacionResidentes(caso) {
    return (caso.notificaciones || []).filter(function (n) { return n.tipo === 'RESIDENTES'; })[0] || null;
  }

  function renderBotonNotificar(caso) {
    var registro = notificacionResidentes(caso);
    var enCurso = registro && NOTIFICACION_EN_CURSO.indexOf(registro.estado) !== -1;
    var yaNotificado = !caso.pendienteNotificar && registro && registro.estado !== 'POR_NOTIFICAR';
    var visible = puede('NOTIFICAR') && caso.registro !== 'BORRADOR' && caso.estado !== 'ANULADO' && !enCurso;
    mostrarElemento('casoDetailNotificarBtn', visible);
    $('casoDetailNotificarBtnTexto').textContent = yaNotificado ? 'Volver a notificar' : 'Notificar';
    $('casoDetailNotificarBtn').className = 'btn btn-sm ' + (caso.pendienteNotificar ? 'btn-success' : 'btn-outline-success');
  }

  function actualizarBotonEnviarNotificacion() {
    var marcados = $('notificarCasoLista').querySelectorAll('input.cv-notificar-check:checked').length;
    $('notificarCasoEnviarBtn').disabled = marcados === 0;
  }

  function renderDestinatarios(destinatarios) {
    if (!destinatarios.length) {
      $('notificarCasoLista').innerHTML = '<p class="text-muted mb-0">La unidad no tiene propietarios ni residentes registrados para notificar.</p>';
      return;
    }
    $('notificarCasoLista').innerHTML = '<table class="table table-sm align-middle mb-0">' +
      '<thead><tr><th scope="col" style="width:2.5rem"><span class="visually-hidden">Notificar</span></th>' +
      '<th scope="col">Nombre</th><th scope="col">Correo</th><th scope="col">Tipo</th></tr></thead><tbody>' +
      destinatarios.map(function (d, i) {
        var id = 'notificarCasoDest' + i;
        var tieneCorreo = Boolean(d.correo);
        return '<tr><td><input type="checkbox" class="form-check-input cv-notificar-check" id="' + id + '" value="' + esc(d.personaId) + '"' +
          (d.seleccionado && tieneCorreo ? ' checked' : '') + (tieneCorreo ? '' : ' disabled') + ' autocomplete="off"></td>' +
          '<td><label for="' + id + '" class="mb-0">' + esc(d.nombre) + '</label></td>' +
          '<td>' + (tieneCorreo ? esc(d.correo) : '<span class="text-muted">Sin correo registrado</span>') + '</td>' +
          '<td>' + esc(d.rol) + '</td></tr>';
      }).join('') + '</tbody></table>';
    actualizarBotonEnviarNotificacion();
  }

  $('casoDetailNotificarBtn').addEventListener('click', function () {
    if (!casoConvivenciaActual) return;
    hideMsg();
    $('notificarCasoAlerta').classList.add('hidden');
    $('notificarCasoLista').innerHTML = '<p class="text-muted mb-0">Cargando…</p>';
    $('notificarCasoEnviarBtn').disabled = true;
    $('modalNotificarCasoTitulo').textContent = 'Notificar el caso ' + (casoConvivenciaActual.caseCode || '');
    var m = modal('modalNotificarCaso');
    if (m) m.show();
    apiFetch('/casos/' + casoConvivenciaActual.id + '/destinatarios').then(function (resp) {
      renderDestinatarios((resp.data && resp.data.destinatarios) || []);
    }).catch(function (error) {
      $('notificarCasoLista').innerHTML = '';
      $('notificarCasoAlerta').textContent = error.message;
      $('notificarCasoAlerta').classList.remove('hidden');
    });
  });

  $('notificarCasoLista').addEventListener('change', actualizarBotonEnviarNotificacion);

  $('notificarCasoEnviarBtn').addEventListener('click', function () {
    var btn = this;
    if (!casoConvivenciaActual) return;
    var ids = Array.prototype.map.call($('notificarCasoLista').querySelectorAll('input.cv-notificar-check:checked'), function (el) { return el.value; });
    if (!ids.length) return;
    $('notificarCasoAlerta').classList.add('hidden');
    busy(btn, true, 'Enviando…');
    apiFetch('/casos/' + casoConvivenciaActual.id + '/notificar', { method: 'POST', body: { personaIds: ids } })
      .then(function (resp) {
        var m = modal('modalNotificarCaso');
        if (m) m.hide();
        aplicarCasoActualizado(resp.data, 'Notificación solicitada: el envío se confirma en «Registro y notificación» cuando el servidor de correo lo acepte.');
      })
      .catch(function (error) {
        $('notificarCasoAlerta').textContent = error.message;
        $('notificarCasoAlerta').classList.remove('hidden');
      })
      .finally(function () { busy(btn, false, 'Enviar notificación'); actualizarBotonEnviarNotificacion(); });
  });

  // ===== EVIDENCIA OCULTA =====
  // Administración marca/desmarca; la API ya omite la evidencia para los demás llamadores, aquí solo
  // se explica por qué no hay evidencias (comité y consejo) y se muestra el estado (administración).

  function renderEvidenciaOculta(caso) {
    var oculta = Boolean(caso.evidenciaOculta);
    var admin = puede('OCULTAR_EVIDENCIA');
    mostrarElemento('casoDetailEvidenciaOcultaControl', admin);
    mostrarElemento('casoDetailEvidenciaOcultaAviso', oculta && !admin);
    $('casoDetailEvidenciaOcultaSwitch').checked = oculta;
    $('casoDetailEvidenciaOcultaBadge').innerHTML = admin && oculta
      ? '<span class="badge text-bg-dark mt-1"><i class="bi bi-eye-slash me-1"></i>Evidencia oculta</span>'
      : '';
  }

  $('casoDetailEvidenciaOcultaSwitch').addEventListener('change', function () {
    var interruptor = this;
    var oculta = interruptor.checked;
    if (!casoConvivenciaActual) return;
    interruptor.disabled = true;
    apiFetch('/casos/' + casoConvivenciaActual.id + '/evidencia-oculta', { method: 'PATCH', body: { oculta: oculta } })
      .then(function (resp) {
        aplicarCasoActualizado(resp.data, oculta
          ? 'Evidencia oculta: solo administración puede verla.'
          : 'La evidencia vuelve a ser visible para quienes tienen acceso al caso.');
      })
      .catch(function (error) {
        interruptor.checked = !oculta;
        msg(error.message);
      })
      .finally(function () { interruptor.disabled = false; });
  });

  // ===== REMISIÓN A COMITÉ / CONSEJO (solo administración) =====

  var ORGANOS_REMISION = {
    COMITE: { campo: 'remitidoComite', fecha: 'fechaRemisionComite', etiqueta: 'casoRemisionComiteEtiqueta', boton: 'casoRemisionComiteBtn', nombre: 'Comité de Convivencia' },
    CONSEJO: { campo: 'remitidoConsejo', fecha: 'fechaRemisionConsejo', etiqueta: 'casoRemisionConsejoEtiqueta', boton: 'casoRemisionConsejoBtn', nombre: 'Consejo de Administración' }
  };

  function formatearFechaRemision(valor) {
    var fecha = valor ? new Date(valor) : null;
    return fecha && !isNaN(fecha.getTime()) ? fecha.toLocaleDateString('es-CO') : '';
  }

  function renderRemision(caso) {
    var visible = puede('REMITIR');
    mostrarElemento('casoDetailRemisionSection', visible);
    if (!visible) return;
    var borrador = caso.registro === 'BORRADOR';
    var anulado = caso.estado === 'ANULADO';
    Object.keys(ORGANOS_REMISION).forEach(function (clave) {
      var organo = ORGANOS_REMISION[clave];
      var remitido = Boolean(caso[organo.campo]);
      var etiqueta = $(organo.etiqueta);
      var fecha = formatearFechaRemision(caso[organo.fecha]);
      etiqueta.textContent = remitido ? 'Remitido' + (fecha ? ' el ' + fecha : '') : 'No remitido';
      etiqueta.className = 'badge ' + (remitido ? 'text-bg-success' : 'text-bg-secondary');
      var boton = $(organo.boton);
      boton.classList.toggle('hidden', remitido);
      boton.disabled = borrador || anulado;
    });
    $('casoRemisionNota').textContent = borrador
      ? 'Finaliza y notifica el caso antes de poder remitirlo.'
      : anulado ? 'Un caso anulado no se puede remitir.' : '';
  }

  Object.keys(ORGANOS_REMISION).forEach(function (clave) {
    var organo = ORGANOS_REMISION[clave];
    $(organo.boton).addEventListener('click', function () {
      var btn = this;
      if (!casoConvivenciaActual) return;
      if (!confirm('¿Remitir este caso al ' + organo.nombre + '? Podrán consultarlo sus miembros y la remisión no se puede deshacer.')) return;
      busy(btn, true, 'Remitiendo…');
      apiFetch('/casos/' + casoConvivenciaActual.id + '/remitir', { method: 'POST', body: { organo: clave } })
        .then(function (resp) { aplicarCasoActualizado(resp.data, 'Caso remitido al ' + organo.nombre + '.'); })
        .catch(function (error) { msg(error.message); })
        .finally(function () { busy(btn, false, '<i class="bi bi-play-fill me-1"></i>Remitir al ' + (clave === 'COMITE' ? 'Comité' : 'Consejo')); });
    });
  });

  // Cada bloque se muestra si el llamador tiene la acción Y el estado del caso la admite.
  function actualizarAccionesDisponibles(caso) {
    var borrador = caso.registro === 'BORRADOR';
    var enTramite = !borrador && (caso.estado === 'PENDIENTE_DESCARGOS' || caso.estado === 'CON_DESCARGOS');
    var terminal = ESTADOS_TERMINALES.indexOf(caso.estado) !== -1;

    mostrarElemento('casoDetailEditarBtn', puede('EDITAR'));
    renderBotonNotificar(caso);
    renderRemision(caso);
    mostrarElemento('casoDetailAnularBtn',
      puede('ANULAR') && caso.estado !== 'ANULADO' && !(config().anularSoloSinSancion && caso.sancion));
    mostrarElemento('casoAccionesSeveridad', puede('CAMBIAR_SEVERIDAD') && !caso.sancion && !terminal);
    // El comité sesiona normalmente después de los descargos: se permite en ambos estados, una vez.
    mostrarElemento('casoAccionesComite',
      puede('ACTA_COMITE') && enTramite && caso.requiereProcesoFormal && !caso.actaComiteFecha);
    mostrarElemento('casoAccionesDescargos',
      puede('DESCARGOS_EN_NOMBRE') && !borrador && caso.estado === 'PENDIENTE_DESCARGOS' && !caso.descargosResidente);
    mostrarElemento('casoAccionesCierre', puede('CIERRE') && enTramite);
    mostrarElemento('casoAccionesProponerSancion', puede('PROPONER_SANCION') && enTramite && caso.requiereProcesoFormal);
    mostrarElemento('casoAccionesConsejo', puede('CONSEJO_DECISION') && !borrador && caso.estado === 'PENDIENTE_APROBACION_CONSEJO');
    mostrarElemento('casoAccionesApelacion', puede('RESOLVER_APELACION') && !borrador && caso.estado === 'EN_APELACION');
  }

  var ETIQUETA_ADJUNTO = {
    DECLARADO: 'En espera de subida', SUBIENDO: 'Subiendo', LISTO: 'Cargado', RECHAZADO: 'Rechazado',
    RETIRADO: 'Retirado', ABANDONADO: 'Subida abandonada'
  };
  // "Enviada" significa aceptada por el servidor de correo; nunca se muestra "Notificado" solo
  // porque se solicitó el envío.
  var ETIQUETA_NOTIFICACION = {
    POR_NOTIFICAR: ['Pendiente de notificar', 'text-bg-warning'],
    SOLICITADA: ['Envío solicitado', 'text-bg-info'],
    ENVIANDO: ['Enviando', 'text-bg-info'],
    ENVIADA: ['Enviada (aceptada por el servidor de correo)', 'text-bg-success'],
    FALLIDA_REINTENTABLE: ['Falló; se reintentará', 'text-bg-warning'],
    FALLIDA: ['Falló; requiere acción', 'text-bg-danger'],
    INCIERTA: ['Resultado incierto; revisar', 'text-bg-danger'],
    SIN_DESTINATARIOS: ['Sin destinatarios con correo', 'text-bg-danger']
  };
  var TITULO_NOTIFICACION = {
    RESIDENTES: 'Notificación a residentes',
    ADMINISTRACION: 'Notificación a administración',
    SANCION: 'Comunicación de la sanción al residente',
    RECURSO: 'Comunicación de la decisión del recurso al residente',
    CIERRE_SIN_SANCION: 'Comunicación del cierre sin sanción al residente'
  };

  // «Leída» = el residente abrió el caso en el portal (a los 20 s); no es una confirmación de lectura del correo.
  function lineaLecturaResidente(caso, notificacion) {
    if (notificacion.tipo !== 'RESIDENTES' || notificacion.estado === 'POR_NOTIFICAR') return '';
    if (caso.fechaLecturaResidente) {
      var fecha = new Date(caso.fechaLecturaResidente);
      var texto = isNaN(fecha.getTime()) ? caso.fechaLecturaResidente : fecha.toLocaleString('es-CO');
      return '<small class="d-block text-success"><i class="bi bi-eye me-1"></i>Leída por el residente el ' + esc(texto) +
        ' (abrió el caso en el portal)</small>';
    }
    return '<small class="d-block text-muted"><i class="bi bi-eye-slash me-1"></i>Sin abrir en el portal</small>';
  }

  function renderRegistroYNotificacion(caso) {
    var seccion = $('casoDetailRegistroSection');
    if (!seccion) return;
    var adjuntos = caso.adjuntos || [];
    var notificaciones = caso.notificaciones || [];
    var borrador = caso.registro === 'BORRADOR';
    if (!borrador && !notificaciones.length && !caso.pendienteNotificar) {
      seccion.classList.add('hidden');
      return;
    }
    seccion.classList.remove('hidden');
    var html = '';
    if (borrador) {
      html += '<p class="small mb-2">El residente aún no ha sido notificado. Quien registró el caso debe terminar de cargar las evidencias y pulsar «Finalizar y notificar».</p>';
      if (adjuntos.length) {
        html += '<ul class="list-group mb-2">' + adjuntos.map(function (a) {
          return '<li class="list-group-item d-flex justify-content-between gap-2"><span class="text-break">' + esc(a.nombreOriginal) +
            (window.BVEvidenceTypes && window.BVEvidenceTypes.formatearTamano ? ' <small class="text-muted">' + esc(window.BVEvidenceTypes.formatearTamano(a.tamanoBytes)) + '</small>' : '') +
            (a.motivo ? '<small class="d-block text-danger">' + esc(a.motivo) + '</small>' : '') + '</span>' +
            '<span class="badge text-bg-secondary align-self-start">' + esc(ETIQUETA_ADJUNTO[a.estado] || a.estado) + '</span></li>';
        }).join('') + '</ul>';
      }
    }
    if (caso.pendienteNotificar) {
      html += '<p class="small mb-2">El residente aún no ha sido notificado: no ve el caso y no hay trámite hasta que administración lo notifique' +
        (puede('NOTIFICAR') ? ' con el botón «Notificar».' : '.') + '</p>';
    }
    if (notificaciones.length) {
      html += '<ul class="list-group">' + notificaciones.map(function (n) {
        var etiqueta = ETIQUETA_NOTIFICACION[n.estado] || [n.estado, 'text-bg-secondary'];
        var acciones = '';
        if (puede('NOTIFICACIONES') && ['FALLIDA', 'INCIERTA', 'SIN_DESTINATARIOS'].indexOf(n.estado) !== -1) {
          acciones += '<button type="button" class="btn btn-outline-primary btn-sm cv-notificacion-accion" data-tipo="' + esc(n.tipo) + '" data-accion="reintentar">Reintentar</button>';
        }
        if (puede('NOTIFICACIONES') && n.estado === 'INCIERTA') {
          acciones += ' <button type="button" class="btn btn-outline-secondary btn-sm cv-notificacion-accion" data-tipo="' + esc(n.tipo) + '" data-accion="marcar-enviada">Marcar como enviada</button>';
        }
        return '<li class="list-group-item">' +
          '<div class="d-flex justify-content-between gap-2"><span>' + esc(TITULO_NOTIFICACION[n.tipo] || ('Notificación ' + n.tipo)) + '</span>' +
          '<span class="badge ' + etiqueta[1] + ' align-self-start">' + esc(etiqueta[0]) + '</span></div>' +
          '<small class="text-muted d-block">Intentos: ' + Number(n.intentos || 0) +
          (n.fechaEnvio ? ' · Enviada ' + esc(n.fechaEnvio) : '') +
          (n.aceptados != null ? ' · Destinatarios aceptados: ' + Number(n.aceptados) : '') + '</small>' +
          (n.ultimoError ? '<small class="d-block text-danger">' + esc(n.ultimoError) + '</small>' : '') +
          lineaLecturaResidente(caso, n) +
          (n.tipo === 'SANCION' && n.estado === 'ENVIADA'
            ? '<small class="d-block text-muted">Desde esta comunicación corren 5 días hábiles para el recurso de reposición ante el Consejo y 1 mes para la impugnación judicial (reglamento arts. 46 y 48).</small>'
            : '') +
          (n.estado === 'INCIERTA' ? '<small class="d-block text-muted">El correo pudo haber salido. Revise el registro del proveedor antes de reintentar para evitar un duplicado.</small>' : '') +
          (acciones ? '<div class="mt-1">' + acciones + '</div>' : '') +
          '</li>';
      }).join('') + '</ul>';
    }
    $('casoDetailRegistro').innerHTML = html;
  }

  function renderGaleria(contenedorId, seccionId, evidencias, prefijo) {
    if (evidencias.length) {
      if (seccionId) $(seccionId).classList.remove('hidden');
      $(contenedorId).innerHTML = evidencias.map(function (e, idx) {
        return buildCasoEvidenceThumb(e, prefijo + ' ' + (idx + 1));
      }).join('');
      cargarMiniaturasGcs($(contenedorId));
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
    $('casoDetailRegistroBadge').innerHTML = caso.registro === 'BORRADOR'
      ? '<span class="badge text-bg-warning mt-1">Pendiente de completar</span>'
      : '';
    $('casoDetailPendienteNotificarBadge').innerHTML = caso.pendienteNotificar
      ? '<span class="badge text-bg-warning mt-1">Pendiente de notificar</span>'
      : '';
    renderRegistroYNotificacion(caso);
    renderEvidenciaOculta(caso);
    $('casoDetailTipoProceso').textContent = caso.requiereProcesoFormal
      ? 'Proceso sancionatorio formal'
      : 'Llamado de atención — no requiere proceso formal';
    $('casoDetailSeveridad').textContent = caso.severidad || 'No especificada';
    $('casoDetailCuotas').textContent = Number(caso.sancionEquivalente || 0).toLocaleString('es-CO', { maximumFractionDigits: 2 });
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
    $('casoDescargosForm').reset();
    $('casoDescargosEvidenciaEstado').textContent = '';
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

      // Validar archivo usando BVEvidenceTypes
      var file = files[i];
      var validacion = window.BVEvidenceTypes ? window.BVEvidenceTypes.validar(file) : null;
      if (validacion && !validacion.ok) {
        return Promise.reject(new Error('Archivo "' + file.name + '": ' + validacion.error));
      }

      return leerArchivoComoDataUrl(file).then(function (dataUrl) {
        // Inferir mime si viene vacío
        var mime = file.type;
        if (!mime && window.BVEvidenceTypes) {
          mime = window.BVEvidenceTypes.inferirMimePorExtension(file.name) || 'application/octet-stream';
        }
        return apiFetch('/evidencias', {
          method: 'POST',
          body: { mimeType: mime, dataUrl: dataUrl, contexto: contexto, caseId: caseCode, apartamento: apartamento }
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
  $('casosConvivenciaFiltroSeveridad').addEventListener('change', function () { cargarCasosConvivencia(true); });

  var filtroTextoTimeout = null;
  function filtrarConDebounce() {
    if (filtroTextoTimeout) clearTimeout(filtroTextoTimeout);
    filtroTextoTimeout = setTimeout(function () { cargarCasosConvivencia(true); }, 350);
  }
  $('casosConvivenciaFiltroApartamento').addEventListener('input', filtrarConDebounce);
  $('casosConvivenciaFiltroPalabraClave').addEventListener('input', filtrarConDebounce);

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
    mostrarPestana('casos');
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

  document.addEventListener('click', function (event) {
    var enlace = event.target.closest('.cv-evidencia-gcs');
    if (enlace) {
      event.preventDefault();
      abrirEvidenciaGcs(enlace);
      return;
    }
    var accion = event.target.closest('.cv-notificacion-accion');
    if (!accion || !casoConvivenciaActual) return;
    accion.disabled = true;
    apiFetch('/casos/' + casoConvivenciaActual.id + '/notificaciones/' + accion.dataset.tipo + '/' + accion.dataset.accion, { method: 'POST' })
      .then(function () { return apiFetch('/casos/' + casoConvivenciaActual.id); })
      .then(function (resp) { aplicarCasoActualizado(resp.data, 'Notificación actualizada.'); })
      .catch(function (error) { msg(error.message); accion.disabled = false; });
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

  $('casoDescargosForm').addEventListener('submit', function (event) {
    event.preventDefault();
    hideMsg();
    if (!casoConvivenciaActual) return;

    var descargos = $('casoDescargosTexto').value.trim();
    if (descargos.length < 20) {
      msg('Los descargos deben tener al menos 20 caracteres.');
      return;
    }
    if (descargos.length > 5000) {
      msg('Los descargos no pueden superar 5000 caracteres (tienen ' + descargos.length + ').');
      return;
    }

    var files = Array.prototype.slice.call($('casoDescargosEvidenciaInput').files || []);
    var estadoEl = $('casoDescargosEvidenciaEstado');
    var button = event.target.querySelector('button[type="submit"]');
    busy(button, true, 'Guardando…');

    var subida = Promise.resolve([]);
    if (files.length) {
      estadoEl.textContent = 'Subiendo ' + files.length + ' archivo(s)…';
      subida = subirEvidenciasConvivencia(files, 'descargo_residente', casoConvivenciaActual.caseCode, casoConvivenciaActual.apartamento);
    }
    subida.then(function (urls) {
      estadoEl.textContent = '';
      return apiFetch('/casos/' + casoConvivenciaActual.id + '/descargos', {
        method: 'POST',
        body: { descargos: descargos, evidencias: urls }
      });
    }).then(function (resp) {
      aplicarCasoActualizado(resp.data, 'Descargos registrados en nombre del residente.');
    }).catch(function (error) {
      estadoEl.textContent = '';
      msg(error.message);
    }).finally(function () { busy(button, false, 'Registrar descargos'); });
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

  // Inicializar inputs con accept dinámico
  if (window.BVEvidenceTypes) {
    var acceptStr = window.BVEvidenceTypes.ACCEPT;
    if ($('casoDetailEvidenciaInput')) $('casoDetailEvidenciaInput').setAttribute('accept', acceptStr);
    if ($('casoActaComiteEvidenciaInput')) $('casoActaComiteEvidenciaInput').setAttribute('accept', acceptStr);
    if ($('casoDescargosEvidenciaInput')) $('casoDescargosEvidenciaInput').setAttribute('accept', acceptStr);
  }

  // ===== PESTAÑAS Y RESUMEN =====
  // El resumen solo trae conteos de TODOS los casos (también para comité y consejo); la lista sigue
  // limitada por la API a lo que cada llamador puede ver.

  var ORDEN_ESTADOS_RESUMEN = [
    'PENDIENTE_DESCARGOS', 'CON_DESCARGOS', 'PENDIENTE_APROBACION_CONSEJO', 'SANCION_APROBADA', 'EN_APELACION',
    'CERRADO_SIN_SANCION', 'SANCION_RATIFICADA', 'SANCION_APROBADA_ALLANAMIENTO', 'SANCION_REVOCADA', 'ARCHIVADO', 'ANULADO'
  ];
  var CAMPOS_RESUMEN = {
    resumenTotal: 'total', resumenPendientes: 'pendientes', resumenPorNotificar: 'porNotificar', resumenAbiertos: 'abiertos', resumenCerrados: 'cerrados',
    resumenAnulados: 'anulados', resumenComite: 'remitidosComite', resumenConsejo: 'remitidosConsejo'
  };
  var listaCargada = false;

  function formatearConteo(valor) {
    return Number(valor || 0).toLocaleString('es-CO');
  }

  function cargarResumen() {
    Object.keys(CAMPOS_RESUMEN).forEach(function (id) { $(id).textContent = '—'; });
    apiFetch('/resumen').then(function (resp) {
      var resumen = resp.data || {};
      Object.keys(CAMPOS_RESUMEN).forEach(function (id) {
        $(id).textContent = formatearConteo(resumen[CAMPOS_RESUMEN[id]]);
      });
      var porEstado = resumen.porEstado || {};
      var filas = ORDEN_ESTADOS_RESUMEN.map(function (estado) {
        return '<tr><td>' + obtenerBadgeEstadoCaso(estado) + '</td><td class="text-end fw-semibold">' +
          esc(formatearConteo(porEstado[estado])) + '</td></tr>';
      }).join('');
      $('casosConvivenciaResumenEstados').innerHTML = '<table class="table table-sm align-middle mb-0">' +
        '<thead><tr><th scope="col">Estado</th><th scope="col" class="text-end">Casos</th></tr></thead><tbody>' + filas + '</tbody></table>';
    }).catch(function (error) {
      $('casosConvivenciaResumenEstados').innerHTML = '<p class="text-muted mb-0">No fue posible cargar el resumen.</p>';
      msg(error.message);
    });
  }

  function mostrarPestana(pestana) {
    var resumen = pestana === 'resumen';
    $('casosConvivenciaTabs').classList.remove('hidden');
    $('casosConvivenciaDetailView').classList.add('hidden');
    $('casosConvivenciaResumenView').classList.toggle('hidden', !resumen);
    $('casosConvivenciaListView').classList.toggle('hidden', resumen);
    [['casosConvivenciaTabResumen', resumen], ['casosConvivenciaTabCasos', !resumen]].forEach(function (par) {
      $(par[0]).classList.toggle('active', par[1]);
      $(par[0]).setAttribute('aria-selected', par[1] ? 'true' : 'false');
    });
    // El resumen se recarga cada vez (son solo conteos); la lista, solo la primera vez.
    if (resumen) cargarResumen();
    else if (!listaCargada) cargarCasosConvivencia(true);
  }

  ['casosConvivenciaTabResumen', 'casosConvivenciaTabCasos'].forEach(function (id) {
    $(id).addEventListener('click', function () {
      hideMsg();
      mostrarPestana(this.dataset.pestana);
    });
  });
  $('casosConvivenciaResumenActualizarBtn').addEventListener('click', function () {
    hideMsg();
    cargarResumen();
  });

  window.BVConvivenciaCasos = {
    // Abre la vista desde cero en la pestaña «Resumen» — lo llaman el stub de administración y las
    // páginas del comité y del consejo. La lista se carga al entrar por primera vez a «Casos».
    mostrar: function () {
      hideMsg();
      listaCargada = false;
      mostrarPestana('resumen');
    }
  };
}());
