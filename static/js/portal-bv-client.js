(function (global) {
  'use strict';

  function PortalBVClient(webAppUrl) {
    this.webAppUrl = String(webAppUrl || '').trim();
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
      return this.readyPromise;
    }

    this.readyPromise = new Promise(function (resolve, reject) {
      if (!/^https:\/\/script\.google\.com\/macros\/s\//i.test(self.webAppUrl)) {
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
        reject(
          new Error('No fue posible conectar con el servicio de datos.')
        );
      }, 30000);

      window.addEventListener('message', function (event) {
        var message = event.data || {};

        if (!isAppsScriptBridgeOrigin(event.origin)) {
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

        if (!pending) return;

        window.clearTimeout(pending.timer);
        self.pending.delete(message.requestId);

        if (message.ok) {
          pending.resolve(message.data);
        } else {
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
        reject(new Error('No fue posible cargar el servicio de datos.'));
      });

      document.body.appendChild(frame);
    });

    return this.readyPromise;
  };

  PortalBVClient.prototype.call = function (action, payload) {
    var self = this;

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

          reject(
            new Error(
              'La solicitud tardó demasiado tiempo. Intenta nuevamente.'
            )
          );
        }, self.timeoutMs);

        self.pending.set(requestId, {
          resolve: resolve,
          reject: reject,
          timer: timer
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
      });
    });
  };

  global.PortalBVClient = PortalBVClient;
}(window));