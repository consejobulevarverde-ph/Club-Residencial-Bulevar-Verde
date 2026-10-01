(function () {
  'use strict';

  // Lector de placas (etapa 1): localiza la placa amarilla en la foto y la lee con Tesseract.js,
  // todo en el dispositivo. No llama a la API ni guarda la foto.

  var config = window.LECTOR_PLACAS_CONFIG || {};
  var VENDOR = new URL(config.vendorBase || '/vendor/tesseract/', window.location.href).href.replace(/\/$/, '');

  var MAX_LADO_FOTO = 1600;
  var ANCHO_LOCALIZAR = 640;
  var MAX_REGIONES = 3;
  var PAD_RECORTE = 16;
  var PUNTAJE_ALTO = 75;
  var PUNTAJE_MEDIO = 50;
  var PUNTAJE_MINIMO = 40;
  var PENALIDAD_CORRECCION = 15;
  var PENALIDAD_CARACTER_SOBRANTE = 8;
  var BONO_TIPO_ESPERADO = 8;
  var BONO_COINCIDENCIA = 4;
  var DISTANCIA_ALTERNATIVA = 12;

  // Deben coincidir con placaValida() en static/js/vehiculos.js.
  var FORMATOS = [
    { tipo: 'CARRO', patron: 'LLLDDD', regex: /^[A-Z]{3}\d{3}$/ },
    { tipo: 'MOTO', patron: 'LLLDDL', regex: /^[A-Z]{3}\d{2}[A-Z]$/ }
  ];
  // Confusiones típicas del OCR según la posición espere letra o dígito.
  var A_LETRA = { '0': 'O', '1': 'I', '2': 'Z', '4': 'A', '5': 'S', '6': 'G', '8': 'B' };
  var A_DIGITO = { O: '0', D: '0', Q: '0', U: '0', I: '1', L: '1', T: '1', Z: '2', S: '5', B: '8', G: '6', A: '4' };

  var scriptPromise = null;
  var workerPromise = null;
  var foto = null;
  var regiones = [];
  var regionLeida = null;
  var seleccion = null;
  var marcando = false;
  var arrastre = null;
  var ejecucion = 0;

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

  function estado(texto) {
    $('lpEstado').classList.toggle('hidden', !texto);
    $('lpEstadoTexto').textContent = texto || '';
  }

  // ---------------------------------------------------------------------------
  // Tesseract (autoalojado en static/vendor/tesseract, carga perezosa)
  // ---------------------------------------------------------------------------

  function cargarScript() {
    if (window.Tesseract) return Promise.resolve();
    if (!scriptPromise) {
      scriptPromise = new Promise(function (resolve, reject) {
        var script = document.createElement('script');
        script.src = VENDOR + '/tesseract.min.js';
        script.onload = function () { resolve(); };
        script.onerror = function () {
          scriptPromise = null;
          script.remove();
          reject(new Error('No se pudo cargar el lector de placas. Revisa la conexión e inténtalo de nuevo.'));
        };
        document.head.appendChild(script);
      });
    }
    return scriptPromise;
  }

  function progresoTesseract(m) {
    if (m && m.status === 'loading language traineddata' && m.progress < 1 && !$('lpEstado').classList.contains('hidden')) {
      estado('Preparando lector… ' + Math.round(m.progress * 100) + '%');
    }
  }

  function obtenerWorker() {
    if (!workerPromise) {
      workerPromise = cargarScript().then(function () {
        return window.Tesseract.createWorker('eng', 1, {
          workerPath: VENDOR + '/worker.min.js',
          corePath: VENDOR + '/core',
          langPath: VENDOR + '/lang',
          logger: progresoTesseract
        });
      }).then(function (worker) {
        return worker.setParameters({
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
          user_defined_dpi: '300'
        }).then(function () { return worker; });
      }).catch(function (error) {
        workerPromise = null;
        throw error;
      });
    }
    return workerPromise;
  }

  // ---------------------------------------------------------------------------
  // Foto
  // ---------------------------------------------------------------------------

  function decodificarImagen(file) {
    function conImg() {
      return new Promise(function (resolve, reject) {
        var url = URL.createObjectURL(file);
        var img = new Image();
        img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('No se pudo abrir la imagen.')); };
        img.src = url;
      });
    }
    if (window.createImageBitmap) {
      return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(conImg);
    }
    return conImg();
  }

  function dibujarFoto(file) {
    return decodificarImagen(file).then(function (imagen) {
      var ancho = imagen.width;
      var alto = imagen.height;
      var escala = Math.min(1, MAX_LADO_FOTO / Math.max(ancho, alto));
      var canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(ancho * escala));
      canvas.height = Math.max(1, Math.round(alto * escala));
      var ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(imagen, 0, 0, canvas.width, canvas.height);
      if (imagen.close) imagen.close();
      return canvas;
    });
  }

  // ---------------------------------------------------------------------------
  // Localización de la placa por color (fondo amarillo)
  // ---------------------------------------------------------------------------

  function esAmarillo(r, g, b) {
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var delta = max - min;
    if (max < 90 || delta < max * 0.35) return false;
    var tono;
    if (max === r) tono = 60 * (((g - b) / delta) % 6);
    else if (max === g) tono = 60 * ((b - r) / delta + 2);
    else return false;
    if (tono < 0) tono += 360;
    return tono >= 30 && tono <= 68;
  }

  // Dilata o erosiona la máscara con una ventana cuadrada (dos pasadas separables).
  function morfologia(mascara, ancho, alto, radio, dilatar) {
    function pasada(origen, horizontal) {
      var destino = new Uint8Array(origen.length);
      var largo = horizontal ? ancho : alto;
      var lineas = horizontal ? alto : ancho;
      var acumulado = new Int32Array(largo + 1);
      for (var l = 0; l < lineas; l++) {
        for (var i = 0; i < largo; i++) {
          acumulado[i + 1] = acumulado[i] + origen[horizontal ? l * ancho + i : i * ancho + l];
        }
        for (var j = 0; j < largo; j++) {
          var desde = Math.max(0, j - radio);
          var hasta = Math.min(largo - 1, j + radio);
          var suma = acumulado[hasta + 1] - acumulado[desde];
          var valor = dilatar ? suma > 0 : suma === hasta - desde + 1;
          destino[horizontal ? l * ancho + j : j * ancho + l] = valor ? 1 : 0;
        }
      }
      return destino;
    }
    return pasada(pasada(mascara, true), false);
  }

  function componentes(mascara, ancho, alto) {
    var visitado = new Uint8Array(mascara.length);
    var pila = new Int32Array(mascara.length);
    var lista = [];
    for (var inicio = 0; inicio < mascara.length; inicio++) {
      if (!mascara[inicio] || visitado[inicio]) continue;
      var tope = 0;
      pila[tope++] = inicio;
      visitado[inicio] = 1;
      var comp = { minX: ancho, minY: alto, maxX: 0, maxY: 0, pixeles: 0 };
      while (tope > 0) {
        var p = pila[--tope];
        var x = p % ancho;
        var y = (p - x) / ancho;
        comp.pixeles++;
        if (x < comp.minX) comp.minX = x;
        if (x > comp.maxX) comp.maxX = x;
        if (y < comp.minY) comp.minY = y;
        if (y > comp.maxY) comp.maxY = y;
        if (x > 0 && mascara[p - 1] && !visitado[p - 1]) { visitado[p - 1] = 1; pila[tope++] = p - 1; }
        if (x < ancho - 1 && mascara[p + 1] && !visitado[p + 1]) { visitado[p + 1] = 1; pila[tope++] = p + 1; }
        if (y > 0 && mascara[p - ancho] && !visitado[p - ancho]) { visitado[p - ancho] = 1; pila[tope++] = p - ancho; }
        if (y < alto - 1 && mascara[p + ancho] && !visitado[p + ancho]) { visitado[p + ancho] = 1; pila[tope++] = p + ancho; }
      }
      lista.push(comp);
    }
    return lista;
  }

  function localizarPlacas(canvas) {
    var escala = Math.min(1, ANCHO_LOCALIZAR / canvas.width);
    var ancho = Math.max(1, Math.round(canvas.width * escala));
    var alto = Math.max(1, Math.round(canvas.height * escala));
    var reducido = document.createElement('canvas');
    reducido.width = ancho;
    reducido.height = alto;
    var ctx = reducido.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0, ancho, alto);
    var datos = ctx.getImageData(0, 0, ancho, alto).data;

    var mascara = new Uint8Array(ancho * alto);
    for (var p = 0, d = 0; p < mascara.length; p++, d += 4) {
      if (esAmarillo(datos[d], datos[d + 1], datos[d + 2])) mascara[p] = 1;
    }
    var radio = Math.max(1, Math.round(ancho / 320));
    mascara = morfologia(morfologia(mascara, ancho, alto, radio, true), ancho, alto, radio, false);

    var areaImagen = ancho * alto;
    var candidatos = componentes(mascara, ancho, alto).map(function (c) {
      var w = c.maxX - c.minX + 1;
      var h = c.maxY - c.minY + 1;
      var relacion = w / h;
      var areaCaja = w * h;
      return {
        x: c.minX, y: c.minY, w: w, h: h,
        relacion: relacion,
        relleno: c.pixeles / areaCaja,
        fraccion: areaCaja / areaImagen
      };
    }).filter(function (c) {
      return c.w >= 24 && c.h >= 10 &&
        c.fraccion >= 0.0015 && c.fraccion <= 0.7 &&
        c.relacion >= 1.0 && c.relacion <= 3.4 &&
        c.relleno >= 0.45;
    });

    candidatos.forEach(function (c) {
      var desvioCarro = Math.abs(c.relacion - 2.05) / 2.05;
      var desvioMoto = Math.abs(c.relacion - 1.35) / 1.35;
      var centroX = (c.x + c.w / 2) / ancho;
      c.tipo = c.relacion < 1.7 ? 'MOTO' : 'CARRO';
      c.puntaje = c.relleno +
        (1 - Math.min(desvioCarro, desvioMoto)) +
        Math.min(0.6, Math.sqrt(c.fraccion) * 3) +
        (1 - Math.abs(centroX - 0.5)) * 0.3;
    });
    candidatos.sort(function (a, b) { return b.puntaje - a.puntaje; });

    return candidatos.slice(0, MAX_REGIONES).map(function (c) {
      return {
        rect: { x: c.x / escala, y: c.y / escala, w: c.w / escala, h: c.h / escala },
        tipo: c.tipo
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Preprocesamiento del recorte para OCR
  // ---------------------------------------------------------------------------

  function umbralOtsu(histograma, total) {
    var sumaTotal = 0;
    for (var i = 0; i < 256; i++) sumaTotal += i * histograma[i];
    var sumaFondo = 0;
    var pesoFondo = 0;
    var mejorVarianza = -1;
    var umbral = 127;
    for (var t = 0; t < 256; t++) {
      pesoFondo += histograma[t];
      if (!pesoFondo) continue;
      var pesoFrente = total - pesoFondo;
      if (!pesoFrente) break;
      sumaFondo += t * histograma[t];
      var mediaFondo = sumaFondo / pesoFondo;
      var mediaFrente = (sumaTotal - sumaFondo) / pesoFrente;
      var varianza = pesoFondo * pesoFrente * (mediaFondo - mediaFrente) * (mediaFondo - mediaFrente);
      if (varianza > mejorVarianza) {
        mejorVarianza = varianza;
        umbral = t;
      }
    }
    return umbral;
  }

  // Deja solo las manchas oscuras con forma de carácter de placa. Los caracteres de una placa tienen
  // todos la misma altura, así que se descarta lo bastante más bajo que el más alto (emblema entre
  // grupos, tornillos, guion, nombre de la ciudad), lo que no tiene forma de carácter y lo que cae
  // fuera de la placa detectada [xMin, xMax] (marco, carrocería alrededor).
  function filtrarCaracteres(oscuro, ancho, alto, anchoMaximo, xMin, xMax) {
    var etiqueta = new Int32Array(oscuro.length);
    var pila = new Int32Array(oscuro.length);
    var manchas = [];
    for (var inicio = 0; inicio < oscuro.length; inicio++) {
      if (!oscuro[inicio] || etiqueta[inicio]) continue;
      var id = manchas.length + 1;
      var tope = 0;
      pila[tope++] = inicio;
      etiqueta[inicio] = id;
      var m = { minX: ancho, minY: alto, maxX: 0, maxY: 0 };
      while (tope > 0) {
        var p = pila[--tope];
        var x = p % ancho;
        var y = (p - x) / ancho;
        if (x < m.minX) m.minX = x;
        if (x > m.maxX) m.maxX = x;
        if (y < m.minY) m.minY = y;
        if (y > m.maxY) m.maxY = y;
        if (x > 0 && oscuro[p - 1] && !etiqueta[p - 1]) { etiqueta[p - 1] = id; pila[tope++] = p - 1; }
        if (x < ancho - 1 && oscuro[p + 1] && !etiqueta[p + 1]) { etiqueta[p + 1] = id; pila[tope++] = p + 1; }
        if (y > 0 && oscuro[p - ancho] && !etiqueta[p - ancho]) { etiqueta[p - ancho] = id; pila[tope++] = p - ancho; }
        if (y < alto - 1 && oscuro[p + ancho] && !etiqueta[p + ancho]) { etiqueta[p + ancho] = id; pila[tope++] = p + ancho; }
      }
      m.w = m.maxX - m.minX + 1;
      m.h = m.maxY - m.minY + 1;
      var centroX = (m.minX + m.maxX) / 2;
      m.formaCaracter = m.h >= alto * 0.15 && m.h <= alto * 0.95 && m.w <= ancho * anchoMaximo &&
        m.h >= m.w * 0.8 && centroX >= xMin && centroX <= xMax;
      manchas.push(m);
    }

    var altoCaracter = manchas.reduce(function (max, m) {
      return m.formaCaracter && m.h > max ? m.h : max;
    }, 0);
    var conservar = manchas.map(function (m) {
      return m.formaCaracter && m.h >= altoCaracter * 0.6;
    });
    for (var i = 0; i < oscuro.length; i++) {
      if (oscuro[i] && !conservar[etiqueta[i] - 1]) oscuro[i] = 0;
    }
  }

  // Zona vertical a leer, relativa al alto de la placa detectada. En carro se omite la franja
  // inferior con el nombre de la ciudad; en moto se leen las dos líneas (ABC / 12D).
  var ZONAS = {
    CARRO: { arriba: -0.08, abajo: 0.78, altoObjetivo: 110, anchoCaracter: 0.25 },
    MOTO: { arriba: -0.06, abajo: 0.9, altoObjetivo: 220, anchoCaracter: 0.4 }
  };

  function prepararRecorte(fuente, placa, tipo) {
    var zona = ZONAS[tipo];
    var margenX = placa.w * 0.05;
    var sx = Math.max(0, placa.x - margenX);
    var sy = Math.max(0, placa.y + placa.h * zona.arriba);
    var ex = Math.min(fuente.width, placa.x + placa.w + margenX);
    var ey = Math.min(fuente.height, placa.y + placa.h * zona.abajo);
    var sw = Math.max(1, ex - sx);
    var sh = Math.max(1, ey - sy);

    var escala = Math.min(zona.altoObjetivo / sh, 1400 / sw, 6);
    var dw = Math.max(1, Math.round(sw * escala));
    var dh = Math.max(1, Math.round(sh * escala));

    var canvas = document.createElement('canvas');
    canvas.width = dw + PAD_RECORTE * 2;
    canvas.height = dh + PAD_RECORTE * 2;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(fuente, sx, sy, sw, sh, PAD_RECORTE, PAD_RECORTE, dw, dh);

    var imagen = ctx.getImageData(PAD_RECORTE, PAD_RECORTE, dw, dh);
    var datos = imagen.data;
    var gris = new Uint8Array(dw * dh);
    var histograma = new Int32Array(256);
    var totalCentro = 0;
    var x0 = Math.floor(dw * 0.1);
    var x1 = Math.ceil(dw * 0.9);
    var y0 = Math.floor(dh * 0.1);
    var y1 = Math.ceil(dh * 0.9);
    for (var y = 0; y < dh; y++) {
      for (var x = 0; x < dw; x++) {
        var p = y * dw + x;
        var d = p * 4;
        var g = Math.round(0.299 * datos[d] + 0.587 * datos[d + 1] + 0.114 * datos[d + 2]);
        gris[p] = g;
        if (x >= x0 && x < x1 && y >= y0 && y < y1) {
          histograma[g]++;
          totalCentro++;
        }
      }
    }

    var umbral = umbralOtsu(histograma, totalCentro);
    var oscurosCentro = 0;
    for (var t = 0; t <= umbral; t++) oscurosCentro += histograma[t];
    var invertir = oscurosCentro > totalCentro * 0.55;

    var oscuro = new Uint8Array(dw * dh);
    for (var i = 0; i < gris.length; i++) {
      var esOscuro = gris[i] <= umbral;
      oscuro[i] = (invertir ? !esOscuro : esOscuro) ? 1 : 0;
    }
    filtrarCaracteres(oscuro, dw, dh, zona.anchoCaracter, (placa.x - sx) * escala, (placa.x + placa.w - sx) * escala);

    for (var k = 0; k < oscuro.length; k++) {
      var v = oscuro[k] ? 0 : 255;
      datos[k * 4] = v;
      datos[k * 4 + 1] = v;
      datos[k * 4 + 2] = v;
      datos[k * 4 + 3] = 255;
    }
    ctx.putImageData(imagen, PAD_RECORTE, PAD_RECORTE);
    return canvas;
  }

  // ---------------------------------------------------------------------------
  // Normalización del texto OCR a formato de placa
  // ---------------------------------------------------------------------------

  function corregir(ventana, patron) {
    var salida = '';
    var cambios = 0;
    for (var i = 0; i < patron.length; i++) {
      var c = ventana.charAt(i);
      var esLetra = c >= 'A' && c <= 'Z';
      if (patron.charAt(i) === 'L') {
        if (esLetra) salida += c;
        else if (A_LETRA[c]) { salida += A_LETRA[c]; cambios++; }
        else return null;
      } else if (!esLetra) {
        salida += c;
      } else if (A_DIGITO[c]) {
        salida += A_DIGITO[c];
        cambios++;
      } else {
        return null;
      }
    }
    return { placa: salida, cambios: cambios };
  }

  // Agrupa los caracteres reconocidos en fragmentos: uno por línea (búsqueda en toda la foto) o uno
  // solo para todo el recorte (las dos líneas de una placa de moto se leen juntas). Se usa la
  // confianza por carácter: con whitelist, Tesseract reporta 0 en la confianza de palabra y línea.
  function fragmentosOcr(data, porLinea) {
    var fragmentos = [];
    var actual = null;
    (data.lines || []).forEach(function (linea) {
      if (porLinea || !actual) {
        actual = { caracteres: [], bbox: linea.bbox };
        fragmentos.push(actual);
      }
      (linea.words || []).forEach(function (palabra) {
        (palabra.symbols || []).forEach(function (simbolo) {
          String(simbolo.text || '').toUpperCase().replace(/[^A-Z0-9]/g, '').split('').forEach(function (c) {
            actual.caracteres.push({ c: c, confianza: simbolo.confidence });
          });
        });
      });
    });
    return fragmentos;
  }

  function lecturasDesdeFragmento(fragmento, tipoEsperado) {
    var caracteres = fragmento.caracteres;
    var texto = caracteres.map(function (x) { return x.c; }).join('');
    var sobrantes = Math.max(0, texto.length - 6);
    var lecturas = [];
    for (var i = 0; i + 6 <= texto.length; i++) {
      var ventana = texto.substr(i, 6);
      var confianza = caracteres.slice(i, i + 6).reduce(function (suma, x) { return suma + x.confianza; }, 0) / 6;
      FORMATOS.forEach(function (formato) {
        var resultado = corregir(ventana, formato.patron);
        if (!resultado || !formato.regex.test(resultado.placa)) return;
        var puntaje = confianza -
          resultado.cambios * PENALIDAD_CORRECCION -
          sobrantes * PENALIDAD_CARACTER_SOBRANTE +
          (formato.tipo === tipoEsperado ? BONO_TIPO_ESPERADO : 0);
        if (puntaje < PUNTAJE_MINIMO) return;
        lecturas.push({ placa: resultado.placa, tipo: formato.tipo, puntaje: puntaje });
      });
    }
    return lecturas;
  }

  function mejorLectura(lecturas) {
    return lecturas.reduce(function (mejor, lectura) {
      return !mejor || lectura.puntaje > mejor.puntaje ? lectura : mejor;
    }, null);
  }

  function nivelConfianza(puntaje) {
    if (puntaje >= PUNTAJE_ALTO) return { texto: 'Confianza alta', clase: 'text-bg-success' };
    if (puntaje >= PUNTAJE_MEDIO) return { texto: 'Confianza media', clase: 'text-bg-warning' };
    return { texto: 'Confianza baja — verifica', clase: 'text-bg-danger' };
  }

  // ---------------------------------------------------------------------------
  // Lectura
  // ---------------------------------------------------------------------------

  async function leerRegion(worker, region) {
    var orden = region.tipo === 'MOTO' ? ['MOTO', 'CARRO'] : ['CARRO', 'MOTO'];
    var lecturas = [];
    for (var i = 0; i < orden.length; i++) {
      var tipo = orden[i];
      var recorte = prepararRecorte(foto, region.rect, tipo);
      // PSM 7 = una línea (carro); PSM 6 = bloque (moto, dos líneas).
      await worker.setParameters({ tessedit_pageseg_mode: tipo === 'MOTO' ? '6' : '7' });
      var resultado = await worker.recognize(recorte);
      var nuevas = [];
      fragmentosOcr(resultado.data, false).forEach(function (fragmento) {
        nuevas = nuevas.concat(lecturasDesdeFragmento(fragmento, region.tipo));
      });
      nuevas.forEach(function (lectura) {
        lectura.recorte = recorte;
        lectura.rect = region.rect;
      });
      lecturas = lecturas.concat(nuevas);
      var mejor = mejorLectura(nuevas);
      if (mejor && mejor.puntaje >= PUNTAJE_ALTO) break;
    }
    return lecturas;
  }

  function recortarFoto(rect) {
    var canvas = document.createElement('canvas');
    var margen = rect.h * 0.3;
    var sx = Math.max(0, rect.x - margen);
    var sy = Math.max(0, rect.y - margen);
    canvas.width = Math.max(1, Math.round(Math.min(foto.width, rect.x + rect.w + margen) - sx));
    canvas.height = Math.max(1, Math.round(Math.min(foto.height, rect.y + rect.h + margen) - sy));
    canvas.getContext('2d').drawImage(foto, sx, sy, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  // Respaldo cuando la placa no es amarilla (servicio público, placas antiguas) o no se leyó por
  // color: busca texto disperso en toda la foto y se queda con las líneas con formato de placa.
  async function leerFotoCompleta(worker) {
    await worker.setParameters({ tessedit_pageseg_mode: '11' });
    var resultado = await worker.recognize(foto);
    var lecturas = [];
    fragmentosOcr(resultado.data, true).forEach(function (fragmento) {
      var b = fragmento.bbox;
      var rect = { x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 };
      lecturasDesdeFragmento(fragmento, null).forEach(function (lectura) {
        lectura.rect = rect;
        lecturas.push(lectura);
      });
    });
    lecturas.forEach(function (lectura) { lectura.recorte = recortarFoto(lectura.rect); });
    return lecturas;
  }

  async function leerRegiones(lista, buscarEnFotoCompleta) {
    var id = ++ejecucion;
    ocultarResultado();
    alerta(null);
    try {
      estado('Preparando lector…');
      var worker = await obtenerWorker();
      if (id !== ejecucion) return;

      estado('Leyendo placa…');
      var lecturas = [];
      for (var i = 0; i < lista.length; i++) {
        lecturas = lecturas.concat(await leerRegion(worker, lista[i]));
        if (id !== ejecucion) return;
        var mejor = mejorLectura(lecturas);
        if (mejor && mejor.puntaje >= PUNTAJE_ALTO) break;
      }

      var mejorPorColor = mejorLectura(lecturas);
      if (buscarEnFotoCompleta && (!mejorPorColor || mejorPorColor.puntaje < PUNTAJE_MEDIO)) {
        estado('Buscando la placa en toda la foto…');
        lecturas = lecturas.concat(await leerFotoCompleta(worker));
        if (id !== ejecucion) return;
      }
      estado(null);

      if (!lecturas.length) {
        regionLeida = null;
        pintarVista();
        alerta('No se pudo leer la placa. Marca la placa con el dedo sobre la imagen o toma otra foto más cerca.', 'warning');
        activarMarcado(true);
        return;
      }
      mostrarResultado(lecturas);
    } catch (error) {
      if (id !== ejecucion) return;
      estado(null);
      alerta(error.message || 'No se pudo leer la placa.');
    }
  }

  async function procesarArchivo(file) {
    if (!file) return;
    if (!/^image\//.test(file.type || 'image/')) {
      alerta('El archivo seleccionado no es una imagen.');
      return;
    }
    var id = ++ejecucion;
    ocultarResultado();
    alerta(null);
    activarMarcado(false);
    seleccion = null;
    regionLeida = null;
    estado('Buscando placa…');
    obtenerWorker().catch(function () {});

    try {
      foto = await dibujarFoto(file);
      if (id !== ejecucion) return;
      regiones = localizarPlacas(foto);
      $('lpFotoBox').classList.remove('hidden');
      pintarVista();
    } catch (error) {
      if (id !== ejecucion) return;
      estado(null);
      alerta(error.message || 'No se pudo abrir la imagen.');
      return;
    }

    leerRegiones(regiones, true);
  }

  // ---------------------------------------------------------------------------
  // Vista
  // ---------------------------------------------------------------------------

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

    function caja(rect, color, ancho, punteada) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = ancho;
      if (punteada) ctx.setLineDash([ancho * 3, ancho * 2]);
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      ctx.restore();
    }

    regiones.forEach(function (region) {
      if (region.rect !== regionLeida) caja(region.rect, 'rgba(255,255,255,.85)', grosor, true);
    });
    if (regionLeida) caja(regionLeida, '#19c37d', grosor * 2, false);
    if (seleccion) caja(seleccion, '#0d6efd', grosor * 2, true);
  }

  function ocultarResultado() {
    $('lpResultado').classList.add('hidden');
  }

  function mostrarRecorte(origen) {
    var destino = $('lpRecorte');
    destino.width = origen.width;
    destino.height = origen.height;
    destino.getContext('2d').drawImage(origen, 0, 0);
  }

  function aplicarPlaca(lectura) {
    $('lpPlaca').textContent = lectura.placa;
    $('lpPlacaInput').value = lectura.placa;
    $('lpTipo').textContent = lectura.tipo === 'MOTO' ? 'Moto' : 'Carro';
    var nivel = nivelConfianza(lectura.puntaje);
    $('lpConfianza').className = 'badge ' + nivel.clase;
    $('lpConfianza').textContent = nivel.texto;
    mostrarRecorte(lectura.recorte);
    regionLeida = lectura.rect;
    pintarVista();
    validarInput();
  }

  function mostrarResultado(lecturas) {
    // Una placa leída igual en varias pasadas (carro/moto, región de color, foto completa) gana puntos.
    var porPlaca = {};
    var veces = {};
    lecturas.forEach(function (lectura) {
      var actual = porPlaca[lectura.placa];
      veces[lectura.placa] = (veces[lectura.placa] || 0) + 1;
      if (!actual || lectura.puntaje > actual.puntaje) porPlaca[lectura.placa] = lectura;
    });
    var ordenadas = Object.keys(porPlaca).map(function (placa) {
      var lectura = porPlaca[placa];
      return Object.assign({}, lectura, {
        puntaje: lectura.puntaje + Math.min(2, veces[placa] - 1) * BONO_COINCIDENCIA
      });
    }).sort(function (a, b) { return b.puntaje - a.puntaje; });

    aplicarPlaca(ordenadas[0]);

    var alternativas = ordenadas.slice(1, 5).filter(function (lectura) {
      return lectura.puntaje >= ordenadas[0].puntaje - DISTANCIA_ALTERNATIVA;
    });
    $('lpAlternativasBox').classList.toggle('hidden', !alternativas.length);
    $('lpAlternativas').innerHTML = alternativas.map(function (lectura, indice) {
      return '<button type="button" class="btn btn-outline-secondary btn-sm lp-input" data-lp-alternativa="' + (indice + 1) + '">' +
        esc(lectura.placa) + '</button>';
    }).join('');
    $('lpAlternativas').querySelectorAll('[data-lp-alternativa]').forEach(function (boton) {
      boton.addEventListener('click', function () {
        aplicarPlaca(ordenadas[Number(boton.dataset.lpAlternativa)]);
      });
    });

    $('lpFotoAyuda').textContent = 'El recuadro verde marca la placa leída. Si no es correcta, usa "Marcar placa".';
    $('lpResultado').classList.remove('hidden');
    $('lpResultado').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function validarInput() {
    var input = $('lpPlacaInput');
    var valor = input.value;
    var formato = FORMATOS.filter(function (f) { return f.regex.test(valor); })[0];
    input.classList.toggle('is-valid', !!formato);
    input.classList.toggle('is-invalid', !!valor && !formato);
    var ayuda = $('lpFormato');
    if (formato) {
      ayuda.className = 'small mb-3 text-success';
      ayuda.innerHTML = '<i class="bi bi-check-circle me-1"></i>Formato de placa de ' + (formato.tipo === 'MOTO' ? 'moto' : 'carro');
    } else if (valor) {
      ayuda.className = 'small mb-3 text-danger';
      ayuda.innerHTML = '<i class="bi bi-x-circle me-1"></i>Formato esperado: ABC123 (carro) o ABC12D (moto)';
    } else {
      ayuda.className = 'small mb-3';
      ayuda.textContent = '';
    }
  }

  function copiarPlaca() {
    var valor = $('lpPlacaInput').value;
    if (!valor) return;
    var boton = $('lpCopiar');
    function listo() {
      boton.innerHTML = '<i class="bi bi-check2 me-1"></i>Copiada';
      setTimeout(function () { boton.innerHTML = '<i class="bi bi-clipboard me-1"></i>Copiar'; }, 1800);
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(valor).then(listo, function () {
        alerta('No se pudo copiar la placa.', 'warning');
      });
      return;
    }
    $('lpPlacaInput').select();
    try {
      document.execCommand('copy');
      listo();
    } catch (error) {
      alerta('No se pudo copiar la placa.', 'warning');
    }
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
      ? '<i class="bi bi-x-lg me-1"></i>Cancelar marcado'
      : '<i class="bi bi-bounding-box me-1"></i>Marcar placa';
    if (activo) {
      $('lpFotoAyuda').textContent = 'Arrastra el dedo sobre la placa para marcarla y pulsa "Leer selección".';
    } else if (seleccion) {
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
    var region = { rect: seleccion, tipo: seleccion.w / seleccion.h < 1.7 ? 'MOTO' : 'CARRO' };
    regiones = [region];
    seleccion = null;
    activarMarcado(false);
    leerRegiones(regiones, false);
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  function init() {
    if (!$('lpVista')) return;
    ['lpCamara', 'lpGaleria'].forEach(function (id) {
      $(id).addEventListener('change', function () {
        var file = this.files && this.files[0];
        this.value = '';
        procesarArchivo(file);
      });
    });
    $('lpMarcar').addEventListener('click', function () { activarMarcado(!marcando); });
    $('lpLeerSeleccion').addEventListener('click', leerSeleccion);
    $('lpCopiar').addEventListener('click', copiarPlaca);
    $('lpPlacaInput').addEventListener('input', function () {
      this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      $('lpPlaca').textContent = this.value || '------';
      validarInput();
    });

    var vista = $('lpVista');
    vista.addEventListener('pointerdown', iniciarArrastre);
    vista.addEventListener('pointermove', moverArrastre);
    vista.addEventListener('pointerup', terminarArrastre);
    vista.addEventListener('pointercancel', terminarArrastre);
  }

  function mostrar() {
    if (!$('lpVista')) return;
    // Precarga el motor OCR mientras el vigilante encuadra la foto.
    obtenerWorker().catch(function () {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.BVLectorPlacas = { mostrar: mostrar };
}());
