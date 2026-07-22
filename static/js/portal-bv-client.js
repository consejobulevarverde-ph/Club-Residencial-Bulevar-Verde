(function (global) {
  'use strict';

  function normalizeAppsScriptWebAppUrl(webAppUrl) {
    var value = String(webAppUrl || '')
      .trim()
      .replace(/^["']+|["']+$/g, '');

    // A URL copied from a session with several Google accounts can include
    // /macros/u/2/s/. The public deployment URL must use /macros/s/.
    value = value.replace(
      /^https:\/\/script\.google\.com\/macros\/u\/\d+\/s\//i,
      'https://script.google.com/macros/s/'
    );

    return value;
  }

  function PortalBVClient(webAppUrl) {
    this.webAppUrl = normalizeAppsScriptWebAppUrl(webAppUrl);
    this.pending = new Map();
    this.ready = false;
    this.readyPromise = null;
    this.frame = null;
    this.bridgeWindow = null;
    this.bridgeOrigin = '';
    this.timeoutMs = 30000;
  }

  function isAppsScriptBridgeOrigin(origin) {
    return (
      origin === 'https://script.google.com' ||
      /^https:\/\/[a-z0-9-]+-script\.googleusercontent\.com$/i.test(origin)
    );
  }

  PortalBVClient.prototype.init = function () {
    var self = this;

    if (this.readyPromise) {
      console.debug('[PortalBV] Reutilizando inicialización existente.');
      return this.readyPromise;
    }

    console.info('[PortalBV] Inicializando puente de Apps Script.', {
      webAppUrl: this.webAppUrl
        ? this.webAppUrl.replace(/(\/macros\/s\/)[^/]+/i, '$1***')
        : '(sin configurar)',
      timeoutMs: this.timeoutMs
    });

    this.readyPromise = new Promise(function (resolve, reject) {
      if (!/^https:\/\/script\.google\.com\/macros\/s\//i.test(self.webAppUrl)) {
        console.error('[PortalBV] URL de Web App inválida o ausente.');
        reject(
          new Error(
            'La URL de la Web App de Apps Script no está configurada.'
          )
        );
        return;
      }

      var frame = document.createElement('iframe');
      frame.src = self.webAppUrl;
      frame.title = 'Conexión segura con Bulevar Verde';
      frame.setAttribute('aria-hidden', 'true');
      frame.style.position = 'absolute';
      frame.style.width = '1px';
      frame.style.height = '1px';
      frame.style.border = '0';
      frame.style.clip = 'rect(0 0 0 0)';
      frame.style.clipPath = 'inset(50%)';
      frame.style.overflow = 'hidden';

      self.frame = frame;

      var readyTimer = window.setTimeout(function () {
        self.readyPromise = null;
        console.error('[PortalBV] Tiempo agotado esperando PORTAL_BV_READY.', {
          timeoutMs: 30000
        });
        reject(
          new Error('No fue posible conectar con el servicio de datos. Verifica que la Web App esté publicada como /macros/s/.../exec, ejecutándose como el propietario y accesible para cualquier usuario.')
        );
      }, 30000);

      window.addEventListener('message', function (event) {
        var message = event.data || {};

        if (!isAppsScriptBridgeOrigin(event.origin)) {
          if (message.type && /^PORTAL_BV_/.test(String(message.type))) {
            console.warn('[PortalBV] Mensaje descartado por origen no permitido.', {
              origin: event.origin,
              type: message.type
            });
          }
          return;
        }

        if (message.type === 'PORTAL_BV_READY') {
          window.clearTimeout(readyTimer);

          self.bridgeWindow = event.source;
          self.bridgeOrigin = event.origin;
          self.ready = true;

          console.log('[PortalBV] Puente listo:', self.bridgeOrigin);

          resolve(self);
          return;
        }

        if (
          !self.bridgeWindow ||
          event.source !== self.bridgeWindow ||
          event.origin !== self.bridgeOrigin ||
          message.type !== 'PORTAL_BV_RESPONSE' ||
          !message.requestId
        ) {
          return;
        }

        var pending = self.pending.get(message.requestId);

        if (!pending) {
          console.warn('[PortalBV] Respuesta sin solicitud pendiente.', {
            requestId: message.requestId,
            ok: message.ok
          });
          return;
        }

        window.clearTimeout(pending.timer);
        self.pending.delete(message.requestId);

        if (message.ok) {
          console.info('[PortalBV] Operación confirmada.', {
            requestId: message.requestId,
            action: pending.action,
            elapsedMs: Date.now() - pending.startedAt
          });
          pending.resolve(message.data);
        } else {
          console.error('[PortalBV] Operación rechazada por Apps Script.', {
            requestId: message.requestId,
            action: pending.action,
            elapsedMs: Date.now() - pending.startedAt,
            error: message.error
          });
          pending.reject(
            new Error(
              message.error || 'La operación no pudo completarse.'
            )
          );
        }
      });

      frame.addEventListener('error', function () {
        window.clearTimeout(readyTimer);
        self.readyPromise = null;
        console.error('[PortalBV] Falló la carga del iframe de Apps Script.');
        reject(new Error('No fue posible cargar el servicio de datos.'));
      });

      document.body.appendChild(frame);
      console.debug('[PortalBV] Iframe agregado al documento.');
    });

    return this.readyPromise;
  };

  PortalBVClient.prototype.call = function (action, payload) {
    var self = this;

    console.info('[PortalBV] Preparando llamada.', {
      action: action,
      ready: this.ready,
      hasBridgeWindow: Boolean(this.bridgeWindow)
    });

    return this.init().then(function () {
      return new Promise(function (resolve, reject) {
        if (!self.bridgeWindow) {
          reject(
            new Error('El puente de datos todavía no está disponible.')
          );
          return;
        }

        var requestId =
          'req-' +
          Date.now() +
          '-' +
          Math.random().toString(16).slice(2);

        var timer = window.setTimeout(function () {
          self.pending.delete(requestId);

          console.error('[PortalBV] Tiempo agotado esperando respuesta.', {
            requestId: requestId,
            action: action,
            timeoutMs: self.timeoutMs
          });

          reject(
            new Error(
              'La solicitud tardó demasiado tiempo. Intenta nuevamente.'
            )
          );
        }, self.timeoutMs);

        self.pending.set(requestId, {
          resolve: resolve,
          reject: reject,
          timer: timer,
          action: action,
          startedAt: Date.now()
        });

        // Se envía directamente al iframe interno que respondió READY.
        self.bridgeWindow.postMessage(
          {
            type: 'PORTAL_BV_REQUEST',
            requestId: requestId,
            action: action,
            payload: payload || {}
          },
          self.bridgeOrigin
        );

        console.info('[PortalBV] Solicitud enviada al iframe.', {
          requestId: requestId,
          action: action,
          bridgeOrigin: self.bridgeOrigin
        });
      });
    });
  };

  PortalBVClient.prototype.callViaForm = function (action, payload, options) {
    var self = this;
    options = options || {};

    return new Promise(function (resolve, reject) {
      if (!/^https:\/\/script\.google\.com\/macros\/s\//i.test(self.webAppUrl)) {
        reject(new Error('La URL de la Web App de Apps Script no está configurada.'));
        return;
      }

      var requestId =
        'post-' +
        Date.now() +
        '-' +
        Math.random().toString(16).slice(2) +
        '-' +
        Math.random().toString(16).slice(2);
      var frameName = 'portal-bv-post-frame-' + requestId.replace(/[^A-Za-z0-9_-]/g, '');
      var startedAt = Date.now();
      var iframe = document.createElement('iframe');
      var form = document.createElement('form');
      var finished = false;
      var timeoutMs = Number(options.timeoutMs || self.timeoutMs || 90000);
      var parentOrigin = String(options.parentOrigin || window.location.origin || '');

      function addField(name, value) {
        var input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = value;
        form.appendChild(input);
      }

      function cleanup() {
        window.removeEventListener('message', onMessage);
        if (timer) window.clearTimeout(timer);
        self.pending.delete(requestId);
        if (form.parentNode) form.parentNode.removeChild(form);
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }

      function finish(ok, value) {
        if (finished) return;
        finished = true;
        cleanup();
        if (ok) resolve(value);
        else reject(value instanceof Error ? value : new Error(String(value || 'Error de transporte.')));
      }

      function onMessage(event) {
        var message = event.data || {};
        var originAllowed = isAppsScriptBridgeOrigin(event.origin) || event.origin === 'null';

        if (!originAllowed) return;
        if (message.type !== 'PORTAL_BV_RESPONSE') return;
        if (message.requestId !== requestId) return;

        console.info('[PortalBV] Respuesta recibida por POST directo.', {
          requestId: requestId,
          action: action,
          ok: Boolean(message.ok),
          responseOrigin: event.origin,
          elapsedMs: Date.now() - startedAt
        });

        if (message.ok) {
          finish(true, message.data);
        } else {
          var serverError = new Error(message.error || 'La operación no pudo completarse.');
          serverError.code = 'SERVER_REJECTED';
          finish(false, serverError);
        }
      }

      iframe.name = frameName;
      iframe.title = 'Envío seguro a Bulevar Verde';
      iframe.setAttribute('aria-hidden', 'true');
      iframe.style.position = 'absolute';
      iframe.style.width = '1px';
      iframe.style.height = '1px';
      iframe.style.border = '0';
      iframe.style.clip = 'rect(0 0 0 0)';
      iframe.style.clipPath = 'inset(50%)';
      iframe.style.overflow = 'hidden';

      form.method = 'POST';
      form.action = self.webAppUrl;
      form.target = frameName;
      form.enctype = 'application/x-www-form-urlencoded';
      form.style.display = 'none';

      addField('action', String(action || ''));
      addField('requestId', requestId);
      addField('origin', parentOrigin);
      addField('payload', JSON.stringify(payload || {}));

      var timer = window.setTimeout(function () {
        var timeoutError = new Error(
          'La solicitud por POST no recibió confirmación dentro del tiempo permitido.'
        );
        timeoutError.code = 'POST_TIMEOUT';

        console.error('[PortalBV] Tiempo agotado en POST directo.', {
          requestId: requestId,
          action: action,
          timeoutMs: timeoutMs,
          elapsedMs: Date.now() - startedAt
        });

        finish(false, timeoutError);
      }, timeoutMs);

      self.pending.set(requestId, {
        resolve: function (value) { finish(true, value); },
        reject: function (error) { finish(false, error); },
        timer: timer,
        action: action,
        startedAt: startedAt,
        transport: 'form-post'
      });

      window.addEventListener('message', onMessage);
      document.body.appendChild(iframe);
      document.body.appendChild(form);

      console.info('[PortalBV] Enviando solicitud por POST directo.', {
        requestId: requestId,
        action: action,
        webAppUrl: self.webAppUrl.replace(/(\/macros\/s\/)[^/]+/i, '$1***'),
        parentOrigin: parentOrigin,
        estimatedPayloadBytes: new Blob([JSON.stringify(payload || {})]).size,
        timeoutMs: timeoutMs
      });

      try {
        form.submit();
      } catch (error) {
        error.code = error.code || 'POST_SUBMIT_FAILED';
        finish(false, error);
      }
    });
  };

  PortalBVClient.prototype.destroy = function () {
    console.info('[PortalBV] Destruyendo puente actual.', {
      pendingRequests: this.pending.size,
      hasFrame: Boolean(this.frame)
    });

    this.pending.forEach(function (pending) {
      window.clearTimeout(pending.timer);
      pending.reject(new Error('La conexión se reinició antes de completar la operación.'));
    });
    this.pending.clear();

    if (this.frame && this.frame.parentNode) {
      this.frame.parentNode.removeChild(this.frame);
    }

    this.frame = null;
    this.bridgeWindow = null;
    this.bridgeOrigin = '';
    this.ready = false;
    this.readyPromise = null;
  };

  global.PortalBVClient = PortalBVClient;
}(window));