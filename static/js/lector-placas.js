(function () {
  'use strict';

  // Lector de placas — parqueadero de visitantes (vigilancia). Ronda continua: cámara en vivo con
  // guías (horizonte y marco de placa) → foto → lectura en el dispositivo (lector-placas-ocr.js) →
  // el vigilante confirma placa y tipo → el registro va a la cola local (lector-placas-cola.js), que
  // lo envía cuando hay conexión → la cámara queda lista para el siguiente vehículo.

  var Ocr = window.BVPlacasOcr;
  var Cola = window.BVLectorPlacasCola;

  var NIVEL_TOLERANCIA_GRADOS = 2;
  var CALIDAD_JPEG = 0.82;
  var ANCHO_MINIATURA = 240;
  var FORMATO_FECHA = new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  var FORMATO_HORA = new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  var stream = null;
  var modoNativo = false;
  var foto = null;
  var fechaCaptura = null;
  var regiones = [];
  var lecturaActual = null;
  var seleccion = null;
  var marcando = false;
  var arrastre = null;
  var ejecucion = 0;
  var enRonda = 0;
  var temporizadorToast = null;

  function $(id) { return document.getElementById(id); }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function alerta(texto, tipo) {
    var box = $('lpAlert');
    if (!texto) {
      box.classList.add('hidden');
      return;
    }
    box.className = 'alert mt-3 mb-0 alert-' + (tipo || 'danger');
    box.textContent = texto;
  }

  function aviso(texto) {
    $('lpAviso').classList.toggle('hidden', !texto);
    $('lpAviso').textContent = texto || '';
  }

  function estado(texto) {
    $('lpEstado').classList.toggle('hidden', !texto);
    $('lpEstadoTexto').textContent = texto || '';
  }

  function toast(texto) {
    var box = $('lpToast');
    box.textContent = texto;
    box.classList.remove('hidden');
    clearTimeout(temporizadorToast);
    temporizadorToast = setTimeout(function () { box.classList.add('hidden'); }, 2200);
  }

  // ---------------------------------------------------------------------------
  // Cámara en vivo
  // ---------------------------------------------------------------------------

  function abrirOverlay() {
    $('lpOverlay').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function cerrarOverlay() {
    $('lpOverlay').classList.add('hidden');
    document.body.style.overflow = '';
  }

  function pantallaCompleta() {
    var overlay = $('lpOverlay');
    var pedir = overlay.requestFullscreen || overlay.webkitRequestFullscreen;
    if (!pedir || document.fullscreenElement) return;
    Promise.resolve(pedir.call(overlay)).then(function () {
      // Solo Android permite fijar la orientación, y solo en pantalla completa.
      if (screen.orientation && screen.orientation.lock) {
        return screen.orientation.lock('landscape');
      }
    }).catch(function () {});
  }

  function salirPantallaCompleta() {
    if (screen.orientation && screen.orientation.unlock) {
      try { screen.orientation.unlock(); } catch (error) { /* no soportado */ }
    }
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
  }

  function detenerCamara() {
    if (stream) stream.getTracks().forEach(function (track) { track.stop(); });
    stream = null;
    $('lpVideo').srcObject = null;
  }

  async function iniciarCamara() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.isSecureContext) {
      throw new Error('Este navegador no permite usar la cámara aquí.');
    }
    detenerCamara();
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    });
    var track = stream.getVideoTracks()[0];
    if (track && track.applyConstraints) {
      track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(function () {});
    }
    var video = $('lpVideo');
    video.srcObject = stream;
    await video.play().catch(function () {});
  }

  function camaraActiva() {
    var track = stream && stream.getVideoTracks()[0];
    return !!track && track.readyState === 'live';
  }

  function actualizarOrientacion() {
    var vertical = window.innerHeight > window.innerWidth;
    $('lpGirar').classList.toggle('hidden', !vertical);
  }

  // Nivel: inclinación del teléfono alrededor del eje de la cámara, a partir de la gravedad.
  // Solo se muestra la magnitud, así que no importa el signo distinto entre Android e iOS.
  function alMovimiento(evento) {
    var g = evento.accelerationIncludingGravity;
    if (!g || g.x == null || g.y == null) return;
    var anguloPantalla = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    var a = anguloPantalla * Math.PI / 180;
    var sx = g.x * Math.cos(a) - g.y * Math.sin(a);
    var sy = g.x * Math.sin(a) + g.y * Math.cos(a);
    if (Math.abs(sy) < 2) return; // teléfono casi acostado: el nivel no aplica
    var grados = Math.abs(Math.atan(sx / sy) * 180 / Math.PI);
    var nivelado = grados <= NIVEL_TOLERANCIA_GRADOS;
    var badge = $('lpNivel');
    badge.classList.remove('hidden');
    badge.className = 'badge ' + (nivelado ? 'text-bg-success' : 'text-bg-warning');
    badge.textContent = nivelado ? 'Nivelado' : 'Inclinado ' + Math.round(grados) + '°';
    $('lpHorizonte').classList.toggle('lp-nivelado', nivelado);
  }

  function activarNivel() {
    var permiso = window.DeviceMotionEvent && DeviceMotionEvent.requestPermission;
    // iOS pide permiso explícito, y solo dentro de un toque del usuario.
    var listo = permiso ? DeviceMotionEvent.requestPermission() : Promise.resolve('granted');
    Promise.resolve(listo).then(function (respuesta) {
      if (respuesta === 'granted') {
        window.removeEventListener('devicemotion', alMovimiento);
        window.addEventListener('devicemotion', alMovimiento);
      }
    }).catch(function () {});
  }

  async function iniciarRonda() {
    alerta(null);
    modoNativo = false;
    enRonda = 0;
    activarNivel();
    abrirOverlay();
    mostrarVivo();
    pantallaCompleta();
    try {
      await iniciarCamara();
    } catch (error) {
      cerrarRonda();
      $('lpCamaraNativa').classList.remove('hidden');
      alerta('No se pudo abrir la cámara (' + (error.message || error.name) + '). Usa "Tomar foto con la cámara del teléfono".', 'warning');
      return;
    }
    actualizarOrientacion();
    Ocr.precargar().catch(function () {});
  }

  function cerrarRonda() {
    ejecucion++;
    detenerCamara();
    window.removeEventListener('devicemotion', alMovimiento);
    salirPantallaCompleta();
    cerrarOverlay();
    activarMarcado(false);
    renderCola();
  }

  function mostrarVivo() {
    ejecucion++;
    activarMarcado(false);
    $('lpRevision').classList.add('hidden');
    $('lpVivo').classList.remove('hidden');
    $('lpContador').textContent = enRonda + ' en esta ronda';
  }

  function mostrarRevision() {
    $('lpVivo').classList.add('hidden');
    $('lpRevision').classList.remove('hidden');
  }

  function destello() {
    var flash = $('lpFlash');
    flash.classList.add('lp-activo');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { flash.classList.remove('lp-activo'); });
    });
  }

  function disparar() {
    var video = $('lpVideo');
    if (!video.videoWidth) return;
    destello();
    var canvas = Ocr.prepararFoto(video, video.videoWidth, video.videoHeight);
    revisarFoto(canvas, new Date());
  }

  // ---------------------------------------------------------------------------
  // Revisión de la foto
  // ---------------------------------------------------------------------------

  function tipoSeleccionado() {
    return $('lpTipoMoto').checked ? 'MOTO' : 'CARRO';
  }

  function seleccionarTipo(tipo) {
    $(tipo === 'MOTO' ? 'lpTipoMoto' : 'lpTipoCarro').checked = true;
  }

  function limpiarRevision() {
    lecturaActual = null;
    seleccion = null;
    $('lpPlacaInput').value = '';
    seleccionarTipo('CARRO');
    $('lpConfianza').classList.add('hidden');
    $('lpRecorte').classList.add('hidden');
    $('lpAlternativasBox').classList.add('hidden');
    $('lpAlternativas').innerHTML = '';
    aviso(null);
    validarInput();
  }

  function revisarFoto(canvas, fecha) {
    foto = canvas;
    fechaCaptura = fecha;
    limpiarRevision();
    regiones = Ocr.localizar(foto);
    mostrarRevision();
    pintarVista();
    leerRegiones(regiones, true);
  }

  async function leerRegiones(lista, buscarEnFotoCompleta) {
    var id = ++ejecucion;
    aviso(null);
    try {
      var lecturas = await Ocr.leer(foto, lista, {
        buscarEnFotoCompleta: buscarEnFotoCompleta,
        vigente: function () { return id === ejecucion; },
        onEstado: function (texto) { if (id === ejecucion) estado(texto); }
      });
      if (id !== ejecucion || !lecturas) return;
      estado(null);
      if (!lecturas.length) {
        lecturaActual = null;
        pintarVista();
        aviso('No se leyó la placa. Escríbela o márcala en la foto.');
        return;
      }
      mostrarLecturas(lecturas);
    } catch (error) {
      if (id !== ejecucion) return;
      estado(null);
      aviso((error.message || 'No se pudo leer la placa.') + ' Puedes escribir la placa.');
    }
  }

  function mostrarRecorte(origen) {
    var destino = $('lpRecorte');
    destino.width = origen.width;
    destino.height = origen.height;
    destino.getContext('2d').drawImage(origen, 0, 0);
    destino.classList.remove('hidden');
  }

  function aplicarLectura(lectura) {
    lecturaActual = lectura;
    $('lpPlacaInput').value = lectura.placa;
    seleccionarTipo(lectura.tipo);
    var nivel = Ocr.nivelConfianza(lectura.puntaje);
    $('lpConfianza').className = 'badge ' + nivel.clase;
    $('lpConfianza').textContent = nivel.texto;
    mostrarRecorte(lectura.recorte);
    pintarVista();
    validarInput();
  }

  function mostrarLecturas(lecturas) {
    aplicarLectura(lecturas[0]);
    var alternativas = lecturas.slice(1, 5);
    $('lpAlternativasBox').classList.toggle('hidden', !alternativas.length);
    $('lpAlternativas').innerHTML = alternativas.map(function (lectura, indice) {
      return '<button type="button" class="btn btn-outline-light btn-sm" data-lp-alternativa="' + (indice + 1) + '">' +
        '<span class="lp-placa-chip">' + esc(lectura.placa) + '</span></button>';
    }).join('');
    $('lpAlternativas').querySelectorAll('[data-lp-alternativa]').forEach(function (boton) {
      boton.addEventListener('click', function () {
        aplicarLectura(lecturas[Number(boton.dataset.lpAlternativa)]);
      });
    });
  }

  function validarInput() {
    var input = $('lpPlacaInput');
    var valor = input.value;
    var tipo = tipoSeleccionado();
    var valida = Ocr.placaValida(valor, tipo);
    var ayuda = $('lpFormato');
    if (valida) {
      ayuda.className = 'small mt-1 text-success';
      ayuda.innerHTML = '<i class="bi bi-check-circle" aria-label="Placa válida"></i>';
    } else if (valor) {
      ayuda.className = 'small mt-1 text-warning';
      ayuda.innerHTML = '<i class="bi bi-x-circle me-1"></i>' + (tipo === 'MOTO' ? 'ABC12D' : 'ABC123');
    } else {
      ayuda.className = 'small mt-1';
      ayuda.textContent = '';
    }
    $('lpRegistrar').disabled = !valida;
  }

  function pintarVista() {
    var canvas = $('lpVista');
    if (!foto) return;
    if (canvas.width !== foto.width || canvas.height !== foto.height) {
      canvas.width = foto.width;
      canvas.height = foto.height;
    }
    var ctx = canvas.getContext('2d');
    ctx.drawImage(foto, 0, 0);
    var grosor = Math.max(2, Math.round(foto.width / 300));

    function contorno(region, color, ancho, punteada) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = ancho;
      if (punteada) ctx.setLineDash([ancho * 3, ancho * 2]);
      ctx.translate(region.cx, region.cy);
      ctx.rotate(region.angulo || 0);
      ctx.strokeRect(-region.ancho / 2, -region.alto / 2, region.ancho, region.alto);
      ctx.restore();
    }

    var leida = lecturaActual && lecturaActual.region;
    regiones.forEach(function (region) {
      if (!leida || region.rect !== leida.rect) contorno(region, 'rgba(255,255,255,.85)', grosor, true);
    });
    if (leida) contorno(leida, '#19c37d', grosor * 2, false);
    if (seleccion) contorno(Ocr.regionDesdeRect(seleccion), '#0d6efd', grosor * 2, true);
  }

  // ---------------------------------------------------------------------------
  // Marcado manual de la placa sobre la foto
  // ---------------------------------------------------------------------------

  function activarMarcado(activo) {
    marcando = activo;
    arrastre = null;
    $('lpVista').classList.toggle('lp-marcando', activo);
    $('lpMarcar').classList.toggle('active', activo);
    $('lpMarcar').innerHTML = activo
      ? '<i class="bi bi-x-lg me-1"></i>Cancelar'
      : '<i class="bi bi-bounding-box me-1"></i>Marcar placa';
    if (!activo && seleccion) {
      seleccion = null;
      pintarVista();
    }
    $('lpLeerSeleccion').disabled = !activo || !seleccion;
  }

  function puntoEnFoto(event) {
    var canvas = $('lpVista');
    var caja = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(canvas.width, (event.clientX - caja.left) * canvas.width / caja.width)),
      y: Math.max(0, Math.min(canvas.height, (event.clientY - caja.top) * canvas.height / caja.height))
    };
  }

  function iniciarArrastre(event) {
    if (!marcando || !foto) return;
    event.preventDefault();
    try {
      $('lpVista').setPointerCapture(event.pointerId);
    } catch (error) {
      // Sin captura el arrastre sigue funcionando mientras el dedo esté sobre la foto.
    }
    arrastre = puntoEnFoto(event);
    seleccion = null;
    $('lpLeerSeleccion').disabled = true;
  }

  function moverArrastre(event) {
    if (!arrastre) return;
    event.preventDefault();
    var punto = puntoEnFoto(event);
    seleccion = {
      x: Math.min(arrastre.x, punto.x),
      y: Math.min(arrastre.y, punto.y),
      w: Math.abs(punto.x - arrastre.x),
      h: Math.abs(punto.y - arrastre.y)
    };
    pintarVista();
  }

  function terminarArrastre() {
    if (!arrastre) return;
    arrastre = null;
    var minimo = Math.max(12, foto.width / 60);
    if (seleccion && (seleccion.w < minimo || seleccion.h < minimo / 2)) {
      seleccion = null;
      pintarVista();
    }
    $('lpLeerSeleccion').disabled = !seleccion;
  }

  function leerSeleccion() {
    if (!seleccion) return;
    regiones = [Ocr.regionDesdeRect(seleccion)];
    seleccion = null;
    activarMarcado(false);
    leerRegiones(regiones, false);
  }

  // ---------------------------------------------------------------------------
  // Registro: foto con fecha/hora + cola local
  // ---------------------------------------------------------------------------

  function canvasABlob(canvas, calidad) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error('No se pudo preparar la foto.'));
      }, 'image/jpeg', calidad);
    });
  }

  // Marca pequeña y discreta con fecha y hora en la esquina inferior derecha.
  function fotoConFecha(fuente, fecha) {
    var canvas = document.createElement('canvas');
    canvas.width = fuente.width;
    canvas.height = fuente.height;
    var ctx = canvas.getContext('2d');
    ctx.drawImage(fuente, 0, 0);
    var texto = FORMATO_FECHA.format(fecha).replace(',', '');
    var tam = Math.max(11, Math.round(canvas.width * 0.014));
    var pad = Math.round(tam * 0.4);
    ctx.font = '600 ' + tam + 'px Montserrat, Arial, sans-serif';
    ctx.textBaseline = 'top';
    var ancho = ctx.measureText(texto).width;
    var x = canvas.width - ancho - pad * 3;
    var y = canvas.height - tam - pad * 3;
    ctx.fillStyle = 'rgba(0, 0, 0, .45)';
    ctx.fillRect(x - pad, y - pad, ancho + pad * 2, tam + pad * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, .92)';
    ctx.fillText(texto, x, y);
    return canvasABlob(canvas, CALIDAD_JPEG);
  }

  function miniatura(fuente) {
    var escala = ANCHO_MINIATURA / fuente.width;
    var canvas = document.createElement('canvas');
    canvas.width = ANCHO_MINIATURA;
    canvas.height = Math.max(1, Math.round(fuente.height * escala));
    canvas.getContext('2d').drawImage(fuente, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.7);
  }

  async function registrar() {
    var placa = $('lpPlacaInput').value;
    var tipo = tipoSeleccionado();
    if (!foto || !Ocr.placaValida(placa, tipo)) return;
    var boton = $('lpRegistrar');
    boton.disabled = true;
    try {
      await Cola.agregar({
        placa: placa,
        placaDetectada: lecturaActual ? lecturaActual.placa : null,
        tipoVehiculo: tipo,
        fechaCaptura: fechaCaptura.toISOString(),
        foto: await fotoConFecha(foto, fechaCaptura),
        miniatura: miniatura(foto)
      });
    } catch (error) {
      aviso(error.message || 'No se pudo guardar el registro.');
      boton.disabled = false;
      return;
    }
    enRonda++;
    foto = null;
    if (modoNativo) {
      cerrarRonda();
      alerta(placa + ' registrada. Toma la foto del siguiente vehículo.', 'success');
      return;
    }
    if (!camaraActiva()) {
      await iniciarCamara().catch(function () {});
    }
    mostrarVivo();
    toast(placa + ' guardada' + (navigator.onLine === false ? ' · sin conexión' : ''));
  }

  function repetir() {
    foto = null;
    if (modoNativo) {
      cerrarRonda();
      return;
    }
    mostrarVivo();
  }

  // Respaldo sin cámara en vivo (permiso denegado, navegador antiguo): cámara nativa del teléfono.
  async function procesarArchivoNativo(file) {
    if (!file) return;
    if (!/^image\//.test(file.type || 'image/')) {
      alerta('El archivo seleccionado no es una imagen.');
      return;
    }
    alerta(null);
    modoNativo = true;
    var fecha = new Date();
    try {
      var canvas = await Ocr.cargarFoto(file);
      abrirOverlay();
      revisarFoto(canvas, fecha);
    } catch (error) {
      alerta(error.message || 'No se pudo abrir la imagen.');
    }
  }

  // ---------------------------------------------------------------------------
  // Lista de registros de la ronda
  // ---------------------------------------------------------------------------

  // Lista pensada para el celular: íconos en vez de etiquetas; el texto completo va en title/aria-label.
  var ESTADOS = {
    pendiente: { texto: 'Pendiente de envío', clase: 'text-bg-secondary', icono: 'bi-clock-history' },
    enviado: { texto: 'Enviado', clase: 'text-bg-success', icono: 'bi-check2' },
    rechazado: { texto: 'Rechazado', clase: 'text-bg-danger', icono: 'bi-exclamation-triangle' }
  };

  function iconoTipo(tipo) {
    var moto = tipo === 'MOTO';
    return '<i class="bi ' + (moto ? 'bi-scooter' : 'bi-car-front') + '" title="' + (moto ? 'Moto' : 'Carro') + '" ' +
      'aria-label="' + (moto ? 'Moto' : 'Carro') + '"></i>';
  }

  async function renderCola() {
    if (!$('lpCola')) return;
    var enLinea = navigator.onLine !== false;
    var red = enLinea ? 'En línea' : 'Sin conexión';
    $('lpRed').className = 'badge ' + (enLinea ? 'text-bg-success' : 'text-bg-secondary');
    $('lpRed').title = red;
    $('lpRed').setAttribute('aria-label', red);
    $('lpRed').innerHTML = '<i class="bi ' + (enLinea ? 'bi-wifi' : 'bi-wifi-off') + '"></i>';

    var datos;
    try {
      datos = await Cola.resumen();
    } catch (error) {
      $('lpResumen').textContent = error.message;
      return;
    }

    var partes = [datos.pendientes + ' pendientes', datos.enviados + ' enviados'];
    if (datos.rechazados) partes.push(datos.rechazados + ' rechazados');
    if (datos.deOtroVigilante) partes.push(datos.deOtroVigilante + ' de otro vigilante');
    if (datos.enviando) partes.push('enviando…');
    $('lpResumen').textContent = partes.join(' · ');
    $('lpEnviar').disabled = !datos.pendientes || !enLinea;

    if (!datos.items.length) {
      $('lpCola').innerHTML = '<p class="small-note mb-0">Sin registros.</p>';
      return;
    }
    $('lpCola').innerHTML = datos.items.map(function (item) {
      var e = ESTADOS[item.estado] || ESTADOS.pendiente;
      var detalle = item.estado === 'enviado'
        ? (item.apartamento
          ? '<i class="bi bi-house-door me-1"></i>' + esc(item.apartamento)
          : '<span class="text-danger">Sin apartamento</span>')
        : esc(item.error || '');
      var acciones = item.estado === 'rechazado'
        ? '<span class="d-inline-flex gap-1 ms-1">' +
          '<button type="button" class="btn btn-outline-secondary btn-sm py-0" title="Reintentar" aria-label="Reintentar" data-lp-reintentar="' + esc(item.clientRequestId) + '"><i class="bi bi-arrow-repeat"></i></button>' +
          '<button type="button" class="btn btn-outline-danger btn-sm py-0" title="Descartar" aria-label="Descartar" data-lp-descartar="' + esc(item.clientRequestId) + '"><i class="bi bi-trash"></i></button>' +
          '</span>'
        : '';
      return '<div class="lp-cola-item">' +
        '<img src="' + esc(item.miniatura || '') + '" alt="">' +
        '<div class="flex-grow-1 small">' +
        '<div><span class="lp-placa-chip">' + esc(item.placa) + '</span> ' +
        '<span class="text-muted">' + iconoTipo(item.tipoVehiculo) + ' ' +
        esc(FORMATO_HORA.format(new Date(item.fechaCaptura))) + '</span></div>' +
        (detalle || acciones ? '<div class="text-muted">' + detalle + acciones + '</div>' : '') +
        '</div>' +
        '<span class="badge ' + e.clase + '" title="' + e.texto + '" aria-label="' + e.texto + '"><i class="bi ' + e.icono + '"></i></span>' +
        '</div>';
    }).join('');
  }

  function alClicCola(event) {
    var reintentar = event.target.closest('[data-lp-reintentar]');
    if (reintentar) {
      Cola.reintentar(reintentar.dataset.lpReintentar);
      return;
    }
    var descartar = event.target.closest('[data-lp-descartar]');
    if (descartar && window.confirm('¿Descartar este registro? La foto se borrará del teléfono.')) {
      Cola.descartar(descartar.dataset.lpDescartar);
    }
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  function init() {
    if (!$('lpOverlay') || !Ocr || !Cola) return;
    // Fuera de la sección para que position: fixed cubra toda la pantalla.
    document.body.appendChild($('lpOverlay'));

    $('lpIniciar').addEventListener('click', iniciarRonda);
    $('lpCamara').addEventListener('change', function () {
      var file = this.files && this.files[0];
      this.value = '';
      procesarArchivoNativo(file);
    });
    $('lpCerrar').addEventListener('click', cerrarRonda);
    $('lpDisparar').addEventListener('click', disparar);
    $('lpRepetir').addEventListener('click', repetir);
    $('lpRegistrar').addEventListener('click', registrar);
    $('lpMarcar').addEventListener('click', function () { activarMarcado(!marcando); });
    $('lpLeerSeleccion').addEventListener('click', leerSeleccion);
    $('lpEnviar').addEventListener('click', function () { Cola.enviar(); });
    $('lpCola').addEventListener('click', alClicCola);

    $('lpPlacaInput').addEventListener('input', function () {
      this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      var tipo = Ocr.tipoDePlaca(this.value);
      if (tipo) seleccionarTipo(tipo);
      validarInput();
    });
    $('lpPlacaInput').addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && !$('lpRegistrar').disabled) registrar();
    });
    $('lpTipoCarro').addEventListener('change', validarInput);
    $('lpTipoMoto').addEventListener('change', validarInput);

    var vista = $('lpVista');
    vista.addEventListener('pointerdown', iniciarArrastre);
    vista.addEventListener('pointermove', moverArrastre);
    vista.addEventListener('pointerup', terminarArrastre);
    vista.addEventListener('pointercancel', terminarArrastre);

    window.addEventListener('resize', actualizarOrientacion);
    document.addEventListener('visibilitychange', function () {
      // iOS/Android apagan la cámara al bloquear el teléfono: se reanuda al volver.
      if (document.visibilityState === 'visible' && !modoNativo &&
          !$('lpOverlay').classList.contains('hidden') && !camaraActiva()) {
        iniciarCamara().catch(function () {});
      }
    });

    Cola.suscribir(renderCola);
    window.addEventListener('online', renderCola);
    window.addEventListener('offline', renderCola);
  }

  function mostrar() {
    if (!$('lpCola')) return;
    renderCola();
    Cola.enviar();
    // Precarga el motor OCR para que funcione aunque luego se pierda la conexión.
    Ocr.precargar().catch(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.BVLectorPlacas = { mostrar: mostrar };
}());
