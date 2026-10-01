(function () {
  'use strict';

  // Cola local de registros del parqueadero de visitantes. Cada foto confirmada se guarda primero en
  // IndexedDB (la ronda nocturna puede no tener conexión) y se envía a la API en orden cuando hay
  // red. El clientRequestId hace el envío idempotente: reintentar nunca duplica el registro.
  // Cada registro queda ligado al uid del vigilante que tomó la foto y solo se envía con su sesión,
  // porque la API toma el nombre del vigilante del token.

  var config = window.LECTOR_PLACAS_CONFIG || {};
  var API_BASE = config.apiBase || '';
  var RUTA = '/api/v1/vigilancia/parqueadero-visitantes/registros';
  var BASE_DATOS = 'bv-lector-placas';
  var ALMACEN = 'registros';
  var CONSERVAR_ENVIADOS_MS = 24 * 60 * 60 * 1000;
  var INTERVALO_REINTENTO_MS = 30 * 1000;
  // Errores que se resuelven solos al reintentar; el resto (validación) queda como rechazado.
  var ESTADOS_TRANSITORIOS = [401, 403, 408, 425, 429];

  var basePromise = null;
  var enviando = false;
  var oyentes = [];

  function abrir() {
    if (!basePromise) {
      basePromise = new Promise(function (resolve, reject) {
        var solicitud = indexedDB.open(BASE_DATOS, 1);
        solicitud.onupgradeneeded = function () {
          solicitud.result.createObjectStore(ALMACEN, { keyPath: 'clientRequestId' });
        };
        solicitud.onsuccess = function () { resolve(solicitud.result); };
        solicitud.onerror = function () {
          basePromise = null;
          reject(new Error('Este navegador no permite guardar fotos en el teléfono (¿modo incógnito?).'));
        };
      });
    }
    return basePromise;
  }

  function operar(modo, fn) {
    return abrir().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(ALMACEN, modo);
        var resultado = fn(tx.objectStore(ALMACEN));
        tx.oncomplete = function () { resolve(resultado && resultado.result); };
        tx.onerror = function () { reject(tx.error || new Error('No se pudo guardar en el teléfono.')); };
        tx.onabort = function () { reject(tx.error || new Error('No se pudo guardar en el teléfono (¿sin espacio?).')); };
      });
    });
  }

  function todos() { return operar('readonly', function (s) { return s.getAll(); }).then(function (r) { return r || []; }); }
  function guardar(item) { return operar('readwrite', function (s) { return s.put(item); }); }
  function borrar(id) { return operar('readwrite', function (s) { return s.delete(id); }); }
  function obtener(id) { return operar('readonly', function (s) { return s.get(id); }); }

  function avisar() {
    oyentes.forEach(function (fn) {
      try { fn(); } catch (error) { console.error(error); }
    });
  }

  function usuarioActual() {
    return window.firebase && firebase.auth ? firebase.auth().currentUser : null;
  }

  function nuevoId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }

  function blobADataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var lector = new FileReader();
      lector.onload = function () { resolve(lector.result); };
      lector.onerror = function () { reject(new Error('No se pudo leer la foto guardada.')); };
      lector.readAsDataURL(blob);
    });
  }

  /** Guarda un registro confirmado y dispara el envío. */
  function agregar(datos) {
    var usuario = usuarioActual();
    if (!usuario) return Promise.reject(new Error('La sesión terminó. Vuelve a ingresar para registrar.'));
    var item = {
      clientRequestId: nuevoId(),
      uid: usuario.uid,
      placa: datos.placa,
      placaDetectada: datos.placaDetectada || null,
      tipoVehiculo: datos.tipoVehiculo,
      fechaCaptura: datos.fechaCaptura,
      foto: datos.foto,
      miniatura: datos.miniatura,
      estado: 'pendiente',
      intentos: 0,
      error: null
    };
    return guardar(item).then(function () {
      avisar();
      enviar();
      return item;
    });
  }

  async function enviarUno(item, usuario) {
    var token = await usuario.getIdToken();
    var respuesta = await fetch(API_BASE + RUTA, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientRequestId: item.clientRequestId,
        placa: item.placa,
        placaDetectada: item.placaDetectada || undefined,
        tipoVehiculo: item.tipoVehiculo,
        fechaCaptura: item.fechaCaptura,
        foto: await blobADataUrl(item.foto)
      })
    });
    var cuerpo = await respuesta.json().catch(function () { return {}; });
    return { status: respuesta.status, ok: respuesta.ok, cuerpo: cuerpo };
  }

  /** Envía en orden los registros pendientes del vigilante con sesión. Se detiene al primer fallo de red. */
  async function enviar() {
    var usuario = usuarioActual();
    if (enviando || !usuario || navigator.onLine === false) return;
    enviando = true;
    try {
      var pendientes = (await todos()).filter(function (item) {
        return item.estado === 'pendiente' && item.uid === usuario.uid;
      }).sort(function (a, b) { return a.fechaCaptura < b.fechaCaptura ? -1 : 1; });

      for (var i = 0; i < pendientes.length; i++) {
        var item = pendientes[i];
        var resultado;
        try {
          resultado = await enviarUno(item, usuario);
        } catch (error) {
          item.intentos++;
          item.error = 'Sin conexión; se reintentará.';
          await guardar(item);
          break;
        }

        if (resultado.ok) {
          var data = resultado.cuerpo.data || {};
          item.estado = 'enviado';
          item.error = null;
          item.unidad = data.unidad || null;
          item.registroId = data.id || null;
          item.enviadoEn = Date.now();
          item.foto = null; // la foto ya está en el servidor; se libera espacio en el teléfono
          await guardar(item);
          avisar();
          continue;
        }

        var mensaje = (resultado.cuerpo.error && resultado.cuerpo.error.message) || 'Error ' + resultado.status;
        item.intentos++;
        item.error = mensaje;
        if (resultado.status >= 500 || ESTADOS_TRANSITORIOS.indexOf(resultado.status) !== -1) {
          await guardar(item);
          break;
        }
        item.estado = 'rechazado';
        await guardar(item);
        avisar();
      }
    } catch (error) {
      console.error('Error procesando la cola del lector de placas', error);
    } finally {
      enviando = false;
      avisar();
    }
  }

  function reintentar(id) {
    return obtener(id).then(function (item) {
      if (!item) return;
      item.estado = 'pendiente';
      item.error = null;
      return guardar(item);
    }).then(function () {
      avisar();
      return enviar();
    });
  }

  function descartar(id) {
    return borrar(id).then(avisar);
  }

  /** Lista para la UI (más recientes primero) y conteos. Borra los enviados de más de 24 h. */
  async function resumen() {
    var usuario = usuarioActual();
    var uid = usuario ? usuario.uid : null;
    var ahora = Date.now();
    var items = await todos();
    var vigentes = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (item.estado === 'enviado' && ahora - (item.enviadoEn || 0) > CONSERVAR_ENVIADOS_MS) {
        await borrar(item.clientRequestId);
      } else {
        vigentes.push(item);
      }
    }
    var propios = vigentes.filter(function (item) { return item.uid === uid; });
    return {
      items: propios.sort(function (a, b) { return a.fechaCaptura < b.fechaCaptura ? 1 : -1; }),
      pendientes: propios.filter(function (item) { return item.estado === 'pendiente'; }).length,
      enviados: propios.filter(function (item) { return item.estado === 'enviado'; }).length,
      rechazados: propios.filter(function (item) { return item.estado === 'rechazado'; }).length,
      deOtroVigilante: vigentes.filter(function (item) { return item.uid !== uid && item.estado !== 'enviado'; }).length,
      enviando: enviando
    };
  }

  function suscribir(fn) {
    oyentes.push(fn);
  }

  window.addEventListener('online', function () { avisar(); enviar(); });
  window.addEventListener('offline', avisar);
  setInterval(enviar, INTERVALO_REINTENTO_MS);

  window.BVLectorPlacasCola = {
    agregar: agregar,
    enviar: enviar,
    reintentar: reintentar,
    descartar: descartar,
    resumen: resumen,
    suscribir: suscribir
  };
}());
