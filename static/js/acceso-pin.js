// Modal compartido para fijar o cambiar el PIN de 4 dígitos (vigilancia y portales del Comité, Consejo y
// Revisoría Fiscal). Autocontenido: crea su propio modal Bootstrap la primera vez que se usa.
//
//   BVAccesoPin.abrir({
//     titulo, descripcion,
//     pedirActual: true|false,           // «Mi perfil» pide el PIN actual; el primer ingreso no
//     cancelable: true|false,            // el primer ingreso no se puede cerrar sin elegir un PIN
//     enviar: function (valores) {...}   // Promise; si rechaza, el error se muestra y el modal sigue abierto
//     alCompletar: function (resultado) {...}
//   })
// `valores` = { pinActual, pinNuevo }. La API es la que valida; aquí solo se evita enviar datos mal formados.
(function () {
  'use strict';

  var modalEl = null;
  var modal = null;
  var estado = { opciones: null };

  function $(id) { return document.getElementById(id); }

  function construir() {
    modalEl = document.createElement('div');
    modalEl.className = 'modal fade';
    modalEl.id = 'bvPinModal';
    modalEl.tabIndex = -1;
    modalEl.setAttribute('aria-labelledby', 'bvPinTitulo');
    modalEl.setAttribute('aria-hidden', 'true');
    modalEl.innerHTML =
      '<div class="modal-dialog modal-dialog-centered"><div class="modal-content">' +
      '<form id="bvPinForm" novalidate>' +
      '<div class="modal-header"><h5 class="modal-title" id="bvPinTitulo"></h5>' +
      '<button type="button" class="btn-close" id="bvPinCerrar" data-bs-dismiss="modal" aria-label="Cerrar"></button></div>' +
      '<div class="modal-body">' +
      '<p class="small text-muted" id="bvPinDescripcion"></p>' +
      '<div class="alert alert-danger hidden" id="bvPinError" role="alert" aria-live="polite"></div>' +
      '<div class="mb-3" id="bvPinGrupoActual"><label class="form-label" for="bvPinActual">PIN actual</label>' +
      '<input id="bvPinActual" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" class="form-control" autocomplete="current-password"></div>' +
      '<div class="mb-3"><label class="form-label" for="bvPinNuevo">PIN nuevo (4 dígitos)</label>' +
      '<input id="bvPinNuevo" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" class="form-control" autocomplete="new-password"></div>' +
      '<div class="mb-1"><label class="form-label" for="bvPinConfirmar">Confirma el PIN nuevo</label>' +
      '<input id="bvPinConfirmar" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" class="form-control" autocomplete="new-password"></div>' +
      '</div>' +
      '<div class="modal-footer"><button type="button" class="btn btn-outline-secondary" id="bvPinCancelar" data-bs-dismiss="modal">Cancelar</button>' +
      '<button type="submit" class="btn btn-primary" id="bvPinGuardar">Guardar PIN</button></div>' +
      '</form></div></div>';
    document.body.appendChild(modalEl);

    ['bvPinActual', 'bvPinNuevo', 'bvPinConfirmar'].forEach(function (id) {
      $(id).addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 4); });
    });
    $('bvPinForm').addEventListener('submit', enviar);
  }

  function mostrarError(texto) {
    var caja = $('bvPinError');
    caja.textContent = texto || '';
    caja.classList.toggle('hidden', !texto);
  }

  function enviar(event) {
    event.preventDefault();
    var o = estado.opciones;
    var actual = $('bvPinActual').value;
    var nuevo = $('bvPinNuevo').value;
    if (o.pedirActual && !/^\d{4}$/.test(actual)) return mostrarError('Escribe tu PIN actual de 4 dígitos.');
    if (!/^\d{4}$/.test(nuevo)) return mostrarError('El PIN nuevo debe tener exactamente 4 dígitos.');
    if (nuevo !== $('bvPinConfirmar').value) return mostrarError('La confirmación no coincide con el PIN nuevo.');

    mostrarError('');
    var boton = $('bvPinGuardar');
    boton.disabled = true;
    boton.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Guardando…';
    Promise.resolve(o.enviar({ pinActual: actual, pinNuevo: nuevo })).then(function (resultado) {
      estado.completado = true;
      modal.hide();
      if (o.alCompletar) o.alCompletar(resultado);
    }).catch(function (error) {
      mostrarError(error && error.message ? error.message : 'No fue posible guardar el PIN.');
    }).finally(function () {
      boton.disabled = false;
      boton.textContent = 'Guardar PIN';
    });
  }

  function abrir(opciones) {
    if (!modalEl) construir();
    estado.opciones = opciones;
    estado.completado = false;
    $('bvPinTitulo').textContent = opciones.titulo || 'Cambiar PIN';
    $('bvPinDescripcion').textContent = opciones.descripcion || '';
    $('bvPinGrupoActual').classList.toggle('hidden', !opciones.pedirActual);
    ['bvPinActual', 'bvPinNuevo', 'bvPinConfirmar'].forEach(function (id) { $(id).value = ''; });
    mostrarError('');

    var cancelable = opciones.cancelable !== false;
    $('bvPinCerrar').classList.toggle('hidden', !cancelable);
    $('bvPinCancelar').classList.toggle('hidden', !cancelable);

    if (modal) modal.dispose();
    modal = new window.bootstrap.Modal(modalEl, cancelable ? {} : { backdrop: 'static', keyboard: false });
    modalEl.addEventListener('hidden.bs.modal', function alCerrar() {
      modalEl.removeEventListener('hidden.bs.modal', alCerrar);
      if (!estado.completado && opciones.alCancelar) opciones.alCancelar();
    });
    modal.show();
    setTimeout(function () { $(opciones.pedirActual ? 'bvPinActual' : 'bvPinNuevo').focus(); }, 300);
  }

  // POST JSON sin sesión Firebase (login y cambio inicial). Devuelve `data` o lanza Error con el mensaje de la API.
  function post(url, cuerpo, token) {
    var cabeceras = { 'Content-Type': 'application/json' };
    if (token) cabeceras.Authorization = 'Bearer ' + token;
    return fetch(url, { method: 'POST', headers: cabeceras, body: JSON.stringify(cuerpo) }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (body) {
        if (!response.ok) throw new Error((body.error && body.error.message) || 'Error ' + response.status);
        return body.data;
      });
    });
  }

  window.BVAccesoPin = { abrir: abrir, post: post };
}());
