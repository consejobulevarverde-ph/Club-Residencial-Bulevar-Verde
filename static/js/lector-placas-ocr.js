(function () {
  'use strict';

  // Motor de lectura de placas, 100 % en el dispositivo: localiza la placa amarilla por color,
  // endereza el recorte (la foto puede venir inclinada) y lo lee con Tesseract.js autoalojado.
  // Sin UI: lo usa static/js/lector-placas.js.

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
  // Inclinación: la placa amarilla se acepta hasta 25°; la corrección fina por la línea de
  // caracteres se aplica desde 1,5° (por debajo no cambia la lectura).
  var INCLINACION_MAXIMA = 25 * Math.PI / 180;
  var INCLINACION_MINIMA = 1.5 * Math.PI / 180;

  // Deben coincidir con placaValida() en static/js/vehiculos.js y placas.ts en la API.
  var FORMATOS = [
    { tipo: 'CARRO', patron: 'LLLDDD', regex: /^[A-Z]{3}\d{3}$/ },
    { tipo: 'MOTO', patron: 'LLLDDL', regex: /^[A-Z]{3}\d{2}[A-Z]$/ }
  ];
  // Confusiones típicas del OCR según la posición espere letra o dígito.
  var A_LETRA = { '0': 'O', '1': 'I', '2': 'Z', '4': 'A', '5': 'S', '6': 'G', '8': 'B' };
  var A_DIGITO = { O: '0', D: '0', Q: '0', U: '0', I: '1', L: '1', T: '1', Z: '2', S: '5', B: '8', G: '6', A: '4' };

  var scriptPromise = null;
  var workerPromise = null;
  var notificarEstado = function () {};
  var ultimaLectura = Promise.resolve();

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
    if (m && m.status === 'loading language traineddata' && m.progress < 1) {
      notificarEstado('Preparando lector… ' + Math.round(m.progress * 100) + '%');
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

  /** Copia una imagen/video/canvas a un canvas con lado mayor ≤ 1600 px. */
  function prepararFoto(fuente, ancho, alto) {
    var escala = Math.min(1, MAX_LADO_FOTO / Math.max(ancho, alto));
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(ancho * escala));
    canvas.height = Math.max(1, Math.round(alto * escala));
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(fuente, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  function cargarFoto(file) {
    return decodificarImagen(file).then(function (imagen) {
      var canvas = prepararFoto(imagen, imagen.width, imagen.height);
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

  // Componentes conexos con caja y momentos de segundo orden (para orientación y tamaño reales).
  function componentes(mascara, ancho, alto) {
    var visitado = new Uint8Array(mascara.length);
    var pila = new Int32Array(mascara.length);
    var lista = [];
    for (var inicio = 0; inicio < mascara.length; inicio++) {
      if (!mascara[inicio] || visitado[inicio]) continue;
      var tope = 0;
      pila[tope++] = inicio;
      visitado[inicio] = 1;
      var comp = { minX: ancho, minY: alto, maxX: 0, maxY: 0, pixeles: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0 };
      while (tope > 0) {
        var p = pila[--tope];
        var x = p % ancho;
        var y = (p - x) / ancho;
        comp.pixeles++;
        comp.sx += x;
        comp.sy += y;
        comp.sxx += x * x;
        comp.syy += y * y;
        comp.sxy += x * y;
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

  // Rectángulo equivalente a la mancha: centro, ancho/alto a lo largo de sus ejes y ángulo del eje
  // mayor (positivo = girado en sentido horario en la imagen). Para un rectángulo lleno de lado L,
  // la varianza a lo largo del eje es L²/12.
  function geometria(c) {
    var n = c.pixeles;
    var mx = c.sx / n;
    var my = c.sy / n;
    var mu20 = c.sxx / n - mx * mx;
    var mu02 = c.syy / n - my * my;
    var mu11 = c.sxy / n - mx * my;
    var medio = (mu20 + mu02) / 2;
    var raiz = Math.sqrt(((mu20 - mu02) / 2) * ((mu20 - mu02) / 2) + mu11 * mu11);
    var largo = Math.sqrt(12 * (medio + raiz));
    var corto = Math.sqrt(12 * Math.max(medio - raiz, 0.25));
    var angulo = 0.5 * Math.atan2(2 * mu11, mu20 - mu02);
    // Casi cuadrada: el eje mayor no es confiable.
    if (largo / corto < 1.15) angulo = 0;
    return { cx: mx, cy: my, largo: largo, corto: corto, angulo: angulo };
  }

  function localizar(canvas) {
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
      var g = geometria(c);
      var areaRect = g.largo * g.corto;
      return {
        caja: { x: c.minX, y: c.minY, w: c.maxX - c.minX + 1, h: c.maxY - c.minY + 1 },
        geo: g,
        relacion: g.largo / g.corto,
        relleno: c.pixeles / areaRect,
        fraccion: areaRect / areaImagen
      };
    }).filter(function (c) {
      return c.geo.largo >= 24 && c.geo.corto >= 10 &&
        c.fraccion >= 0.0015 && c.fraccion <= 0.7 &&
        c.relacion >= 1.0 && c.relacion <= 3.4 &&
        c.relleno >= 0.45 &&
        Math.abs(c.geo.angulo) <= INCLINACION_MAXIMA;
    });

    candidatos.forEach(function (c) {
      var desvioCarro = Math.abs(c.relacion - 2.05) / 2.05;
      var desvioMoto = Math.abs(c.relacion - 1.35) / 1.35;
      var centroX = c.geo.cx / ancho;
      c.tipo = c.relacion < 1.7 ? 'MOTO' : 'CARRO';
      c.puntaje = Math.min(1, c.relleno) +
        (1 - Math.min(desvioCarro, desvioMoto)) +
        Math.min(0.6, Math.sqrt(c.fraccion) * 3) +
        (1 - Math.abs(centroX - 0.5)) * 0.3;
    });
    candidatos.sort(function (a, b) { return b.puntaje - a.puntaje; });

    return candidatos.slice(0, MAX_REGIONES).map(function (c) {
      return {
        rect: { x: c.caja.x / escala, y: c.caja.y / escala, w: c.caja.w / escala, h: c.caja.h / escala },
        cx: c.geo.cx / escala,
        cy: c.geo.cy / escala,
        ancho: c.geo.largo / escala,
        alto: c.geo.corto / escala,
        angulo: c.geo.angulo,
        tipo: c.tipo
      };
    });
  }

  /** Región a partir de un rectángulo marcado a mano o de una línea de texto. */
  function regionDesdeRect(rect) {
    return {
      rect: rect,
      cx: rect.x + rect.w / 2,
      cy: rect.y + rect.h / 2,
      ancho: rect.w,
      alto: rect.h,
      angulo: 0,
      tipo: rect.w / rect.h < 1.7 ? 'MOTO' : 'CARRO'
    };
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
  // fuera de la placa detectada [xMin, xMax] (marco, carrocería alrededor). Devuelve el centro de
  // cada carácter conservado (para medir la inclinación de la línea).
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
    return manchas.filter(function (m, indice) { return conservar[indice]; }).map(function (m) {
      return { x: (m.minX + m.maxX) / 2, y: (m.minY + m.maxY) / 2 };
    });
  }

  // Inclinación residual de la línea de caracteres (radianes, horario positivo) por mínimos
  // cuadrados de sus centros. En moto las dos líneas cubren el mismo ancho, así que la pendiente
  // común sigue siendo válida.
  function estimarInclinacion(centros) {
    if (centros.length < 4) return 0;
    var mx = 0;
    var my = 0;
    centros.forEach(function (c) { mx += c.x; my += c.y; });
    mx /= centros.length;
    my /= centros.length;
    var sxy = 0;
    var sxx = 0;
    centros.forEach(function (c) {
      sxy += (c.x - mx) * (c.y - my);
      sxx += (c.x - mx) * (c.x - mx);
    });
    return sxx ? Math.atan(sxy / sxx) : 0;
  }

  // Zona vertical a leer, relativa al alto de la placa detectada. En carro se omite la franja
  // inferior con el nombre de la ciudad; en moto se leen las dos líneas (ABC / 12D).
  var ZONAS = {
    CARRO: { arriba: -0.08, abajo: 0.78, altoObjetivo: 110, anchoCaracter: 0.25 },
    MOTO: { arriba: -0.06, abajo: 0.9, altoObjetivo: 220, anchoCaracter: 0.4 }
  };

  // Recorta la placa ya enderezada: dibuja la foto girada -angulo alrededor del centro de la placa.
  function prepararRecorte(fuente, region, tipo) {
    var zona = ZONAS[tipo];
    var margenX = region.ancho * 0.05;
    var anchoZona = region.ancho + margenX * 2;
    var altoZona = region.alto * (zona.abajo - zona.arriba);

    var escala = Math.min(zona.altoObjetivo / altoZona, 1400 / anchoZona, 6);
    var dw = Math.max(1, Math.round(anchoZona * escala));
    var dh = Math.max(1, Math.round(altoZona * escala));

    var canvas = document.createElement('canvas');
    canvas.width = dw + PAD_RECORTE * 2;
    canvas.height = dh + PAD_RECORTE * 2;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(PAD_RECORTE, PAD_RECORTE, dw, dh);
    ctx.clip();
    ctx.translate(PAD_RECORTE, PAD_RECORTE);
    ctx.scale(escala, escala);
    ctx.translate(region.ancho / 2 + margenX, region.alto / 2 - region.alto * zona.arriba);
    ctx.rotate(-region.angulo);
    ctx.translate(-region.cx, -region.cy);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(fuente, 0, 0);
    ctx.restore();

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
        // Lo que cae fuera de la foto al girar queda transparente: se trata como blanco.
        var g = datos[d + 3] < 128 ? 255 : Math.round(0.299 * datos[d] + 0.587 * datos[d + 1] + 0.114 * datos[d + 2]);
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
    var centros = filtrarCaracteres(oscuro, dw, dh, zona.anchoCaracter, margenX * escala, (margenX + region.ancho) * escala);

    for (var k = 0; k < oscuro.length; k++) {
      var v = oscuro[k] ? 0 : 255;
      datos[k * 4] = v;
      datos[k * 4 + 1] = v;
      datos[k * 4 + 2] = v;
      datos[k * 4 + 3] = 255;
    }
    ctx.putImageData(imagen, PAD_RECORTE, PAD_RECORTE);
    return { canvas: canvas, centros: centros };
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

  // Una placa leída igual en varias pasadas (carro/moto, región de color, foto completa) gana
  // puntos. Devuelve la mejor primero y solo las alternativas cercanas a ella.
  function ordenarLecturas(lecturas) {
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
    return ordenadas.filter(function (lectura, indice) {
      return indice === 0 || lectura.puntaje >= ordenadas[0].puntaje - DISTANCIA_ALTERNATIVA;
    });
  }

  // ---------------------------------------------------------------------------
  // Lectura
  // ---------------------------------------------------------------------------

  async function leerRegion(worker, fuente, region) {
    var orden = region.tipo === 'MOTO' ? ['MOTO', 'CARRO'] : ['CARRO', 'MOTO'];
    var lecturas = [];
    for (var i = 0; i < orden.length; i++) {
      var tipo = orden[i];
      var preparado = prepararRecorte(fuente, region, tipo);
      var giro = estimarInclinacion(preparado.centros);
      var regionLeida = region;
      if (Math.abs(giro) >= INCLINACION_MINIMA && Math.abs(giro) <= INCLINACION_MAXIMA) {
        regionLeida = Object.assign({}, region, { angulo: region.angulo + giro });
        preparado = prepararRecorte(fuente, regionLeida, tipo);
      }
      // PSM 7 = una línea (carro); PSM 6 = bloque (moto, dos líneas).
      await worker.setParameters({ tessedit_pageseg_mode: tipo === 'MOTO' ? '6' : '7' });
      var resultado = await worker.recognize(preparado.canvas);
      var nuevas = [];
      fragmentosOcr(resultado.data, false).forEach(function (fragmento) {
        nuevas = nuevas.concat(lecturasDesdeFragmento(fragmento, region.tipo));
      });
      nuevas.forEach(function (lectura) {
        lectura.recorte = preparado.canvas;
        lectura.region = regionLeida;
      });
      lecturas = lecturas.concat(nuevas);
      var mejor = mejorLectura(nuevas);
      if (mejor && mejor.puntaje >= PUNTAJE_ALTO) break;
    }
    return lecturas;
  }

  function recortarFoto(fuente, rect) {
    var canvas = document.createElement('canvas');
    var margen = rect.h * 0.3;
    var sx = Math.max(0, rect.x - margen);
    var sy = Math.max(0, rect.y - margen);
    canvas.width = Math.max(1, Math.round(Math.min(fuente.width, rect.x + rect.w + margen) - sx));
    canvas.height = Math.max(1, Math.round(Math.min(fuente.height, rect.y + rect.h + margen) - sy));
    canvas.getContext('2d').drawImage(fuente, sx, sy, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  // Respaldo cuando la placa no es amarilla (servicio público, placas antiguas) o no se leyó por
  // color: busca texto disperso en toda la foto y se queda con las líneas con formato de placa.
  async function leerFotoCompleta(worker, fuente) {
    await worker.setParameters({ tessedit_pageseg_mode: '11' });
    var resultado = await worker.recognize(fuente);
    var lecturas = [];
    fragmentosOcr(resultado.data, true).forEach(function (fragmento) {
      var b = fragmento.bbox;
      var region = regionDesdeRect({ x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 });
      lecturasDesdeFragmento(fragmento, null).forEach(function (lectura) {
        lectura.region = region;
        lecturas.push(lectura);
      });
    });
    lecturas.forEach(function (lectura) { lectura.recorte = recortarFoto(fuente, lectura.region.rect); });
    return lecturas;
  }

  async function leerInterno(fuente, regiones, opciones) {
    var vigente = opciones.vigente || function () { return true; };
    notificarEstado = opciones.onEstado || function () {};
    notificarEstado('Preparando lector…');
    var worker = await obtenerWorker();
    if (!vigente()) return null;

    notificarEstado('Leyendo placa…');
    var lecturas = [];
    for (var i = 0; i < regiones.length; i++) {
      lecturas = lecturas.concat(await leerRegion(worker, fuente, regiones[i]));
      if (!vigente()) return null;
      var mejor = mejorLectura(lecturas);
      if (mejor && mejor.puntaje >= PUNTAJE_ALTO) break;
    }

    var mejorPorColor = mejorLectura(lecturas);
    if (opciones.buscarEnFotoCompleta && (!mejorPorColor || mejorPorColor.puntaje < PUNTAJE_MEDIO)) {
      notificarEstado('Buscando la placa en toda la foto…');
      lecturas = lecturas.concat(await leerFotoCompleta(worker, fuente));
      if (!vigente()) return null;
    }
    return ordenarLecturas(lecturas);
  }

  /**
   * Lee la placa de `fuente` (canvas) en las regiones dadas. Devuelve las lecturas ordenadas (la
   * mejor primero) o null si `opciones.vigente()` dejó de ser cierto (el vigilante pasó a otra foto).
   * Las lecturas se encolan: el worker de Tesseract no admite dos lecturas intercaladas.
   */
  function leer(fuente, regiones, opciones) {
    var tarea = ultimaLectura.then(function () { return leerInterno(fuente, regiones, opciones || {}); });
    ultimaLectura = tarea.catch(function () {});
    return tarea;
  }

  function tipoDePlaca(placa) {
    var formato = FORMATOS.filter(function (f) { return f.regex.test(placa); })[0];
    return formato ? formato.tipo : null;
  }

  function placaValida(placa, tipo) {
    return FORMATOS.some(function (f) { return f.tipo === tipo && f.regex.test(placa); });
  }

  window.BVPlacasOcr = {
    precargar: function () { return obtenerWorker().then(function () {}); },
    cargarFoto: cargarFoto,
    prepararFoto: prepararFoto,
    localizar: localizar,
    regionDesdeRect: regionDesdeRect,
    leer: leer,
    nivelConfianza: nivelConfianza,
    tipoDePlaca: tipoDePlaca,
    placaValida: placaValida
  };
}());
