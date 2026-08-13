(function (global) {
  'use strict';

  const STYLE_ID = 'bv-evidence-camera-styles';
  let activeCapture = false;

  function ensureStyles_() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .bv-camera-overlay {
        position: fixed;
        inset: 0;
        z-index: 10850;
        background: #000;
        color: #fff;
        display: flex;
        flex-direction: column;
        font-family: Arial, sans-serif;
      }
      .bv-camera-stage {
        position: relative;
        flex: 1 1 auto;
        min-height: 0;
        overflow: hidden;
        background: #000;
      }
      .bv-camera-video {
        width: 100%;
        height: 100%;
        object-fit: contain;
        background: #000;
      }
      .bv-camera-watermark-preview {
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        padding: 12px 14px;
        background: rgba(0, 0, 0, 0.64);
        line-height: 1.35;
        font-size: clamp(12px, 2.9vw, 18px);
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
        pointer-events: none;
      }
      .bv-camera-brand {
        font-weight: 700;
        letter-spacing: 0.02em;
      }
      .bv-camera-status {
        position: absolute;
        top: 12px;
        left: 12px;
        right: 12px;
        padding: 10px 12px;
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.68);
        font-size: 14px;
      }
      .bv-camera-controls {
        flex: 0 0 auto;
        display: flex;
        gap: 12px;
        align-items: center;
        justify-content: center;
        padding: 14px max(14px, env(safe-area-inset-right)) calc(14px + env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left));
        background: #111;
      }
      .bv-camera-btn {
        min-height: 46px;
        border: 0;
        border-radius: 999px;
        padding: 10px 20px;
        font-size: 16px;
        font-weight: 700;
      }
      .bv-camera-btn-capture {
        background: #fff;
        color: #111;
      }
      .bv-camera-btn-cancel {
        background: #3a3a3a;
        color: #fff;
      }
      .bv-camera-btn:disabled {
        opacity: 0.55;
      }
    `;
    document.head.appendChild(style);
  }

  function abortError_() {
    const error = new Error('Captura cancelada por el usuario.');
    error.name = 'AbortError';
    return error;
  }

  function formatDateTime_(date) {
    try {
      return new Intl.DateTimeFormat('es-CO', {
        timeZone: 'America/Bogota',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).format(date);
    } catch (error) {
      return date.toLocaleString('es-CO');
    }
  }

  function fileTimestamp_(date) {
    function pad(value) {
      return String(value).padStart(2, '0');
    }

    return date.getFullYear() +
      pad(date.getMonth() + 1) +
      pad(date.getDate()) + '-' +
      pad(date.getHours()) +
      pad(date.getMinutes()) +
      pad(date.getSeconds());
  }

  function getCurrentPosition_() {
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) {
        reject(new Error('Este dispositivo o navegador no permite obtener la ubicación.'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        resolve,
        function (error) {
          if (error && error.code === 1) {
            reject(new Error('Debes autorizar la ubicación para tomar una evidencia con la cámara.'));
            return;
          }
          if (error && error.code === 3) {
            reject(new Error('No fue posible obtener una ubicación precisa dentro del tiempo permitido. Intenta nuevamente en un lugar con mejor señal.'));
            return;
          }
          reject(new Error('No fue posible obtener la ubicación del dispositivo.'));
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0
        }
      );
    });
  }

  async function getCameraStream_() {
    if (!global.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('La cámara segura no está disponible. Abre el portal mediante HTTPS en un navegador compatible.');
    }

    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
    } catch (error) {
      if (error && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) {
        throw new Error('Debes autorizar el acceso a la cámara para tomar la evidencia.');
      }
      throw new Error('No fue posible abrir la cámara del dispositivo.');
    }
  }

  function stopStream_(stream) {
    if (!stream) return;
    stream.getTracks().forEach(function (track) {
      try { track.stop(); } catch (error) { /* no-op */ }
    });
  }

  function waitForVideo_(video) {
    return new Promise(function (resolve, reject) {
      let finished = false;
      let intervalId = null;
      let timeoutId = null;

      function cleanup_() {
        if (intervalId) clearInterval(intervalId);
        if (timeoutId) clearTimeout(timeoutId);
        video.removeEventListener('loadedmetadata', checkReady_);
        video.removeEventListener('loadeddata', checkReady_);
        video.removeEventListener('canplay', checkReady_);
      }

      function checkReady_() {
        if (finished || video.videoWidth <= 0 || video.videoHeight <= 0) return;
        finished = true;
        cleanup_();
        resolve();
      }

      checkReady_();
      if (finished) return;

      video.addEventListener('loadedmetadata', checkReady_);
      video.addEventListener('loadeddata', checkReady_);
      video.addEventListener('canplay', checkReady_);
      intervalId = setInterval(checkReady_, 100);
      timeoutId = setTimeout(function () {
        if (finished) return;
        finished = true;
        cleanup_();
        reject(new Error('La cámara no entregó una imagen válida. Intenta nuevamente.'));
      }, 10000);
    });
  }

  function buildWatermarkLines_(opts, capturedAt, location) {
    const lines = [opts.brand || 'CLUB RESIDENCIAL BULEVAR VERDE P.H.'];

    if (opts.contextLabel) lines.push(String(opts.contextLabel));
    (opts.detailLines || []).forEach(function (line) {
      if (line) lines.push(String(line));
    });

    lines.push('Fecha: ' + formatDateTime_(capturedAt));
    lines.push(
      'GPS: ' + Number(location.latitude).toFixed(6) + ', ' +
      Number(location.longitude).toFixed(6)
    );
    lines.push('Precisión: ±' + Math.round(Number(location.accuracy) || 0) + ' m');

    return lines;
  }

  function drawWatermark_(ctx, width, height, lines) {
    const horizontalPadding = Math.max(18, Math.round(width * 0.02));
    const verticalPadding = Math.max(14, Math.round(width * 0.014));
    const fontSize = Math.max(16, Math.min(34, Math.round(width * 0.024)));
    const lineHeight = Math.round(fontSize * 1.34);
    const panelHeight = verticalPadding * 2 + lineHeight * lines.length;
    const top = Math.max(0, height - panelHeight);

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.66)';
    ctx.fillRect(0, top, width, height - top);
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 ' + fontSize + 'px Arial, sans-serif';

    lines.forEach(function (line, index) {
      if (index === 0) {
        ctx.font = '700 ' + fontSize + 'px Arial, sans-serif';
      } else {
        ctx.font = '600 ' + fontSize + 'px Arial, sans-serif';
      }
      ctx.fillText(line, horizontalPadding, top + verticalPadding + index * lineHeight, width - horizontalPadding * 2);
    });
    ctx.restore();
  }

  function canvasToEvidence_(canvas, opts, capturedAt, metadata) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (!blob) {
          reject(new Error('No fue posible generar la fotografía de evidencia.'));
          return;
        }

        const reader = new FileReader();
        reader.onerror = function () {
          reject(new Error('No fue posible preparar la fotografía para enviarla.'));
        };
        reader.onload = function () {
          const name = (opts.filePrefix || 'evidencia-camara') + '-' + fileTimestamp_(capturedAt) + '.jpg';
          const file = typeof File === 'function'
            ? new File([blob], name, {
                type: 'image/jpeg',
                lastModified: capturedAt.getTime()
              })
            : null;

          resolve({
            name: name,
            size: blob.size,
            dataUrl: reader.result,
            blob: blob,
            file: file,
            captureMetadata: metadata
          });
        };
        reader.readAsDataURL(blob);
      }, 'image/jpeg', typeof opts.quality === 'number' ? opts.quality : 0.84);
    });
  }

  async function renderCapturedEvidence_(video, opts, position) {
    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    const maxDimension = Number(opts.maxDimension) || 1600;
    const ratio = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * ratio));
    const height = Math.max(1, Math.round(sourceHeight * ratio));
    const capturedAt = new Date();
    const location = {
      latitude: Number(position.coords.latitude),
      longitude: Number(position.coords.longitude),
      accuracy: Number(position.coords.accuracy) || 0
    };
    const lines = buildWatermarkLines_(opts, capturedAt, location);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, width, height);
    drawWatermark_(ctx, width, height, lines);

    const metadata = {
      source: 'web_camera',
      capturedAt: capturedAt.toISOString(),
      displayTime: formatDateTime_(capturedAt),
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy
    };

    return canvasToEvidence_(canvas, opts, capturedAt, metadata);
  }

  function buildOverlay_(opts, position) {
    ensureStyles_();

    const overlay = document.createElement('div');
    overlay.className = 'bv-camera-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Captura de evidencia');

    const stage = document.createElement('div');
    stage.className = 'bv-camera-stage';

    const video = document.createElement('video');
    video.className = 'bv-camera-video';
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');

    const preview = document.createElement('div');
    preview.className = 'bv-camera-watermark-preview';

    const status = document.createElement('div');
    status.className = 'bv-camera-status';
    status.textContent = 'Ubicación verificada. Abriendo cámara…';

    const controls = document.createElement('div');
    controls.className = 'bv-camera-controls';

    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'bv-camera-btn bv-camera-btn-cancel';
    cancelButton.textContent = 'Cancelar';

    const captureButton = document.createElement('button');
    captureButton.type = 'button';
    captureButton.className = 'bv-camera-btn bv-camera-btn-capture';
    captureButton.textContent = 'Tomar foto';
    captureButton.disabled = true;

    controls.appendChild(cancelButton);
    controls.appendChild(captureButton);
    stage.appendChild(video);
    stage.appendChild(preview);
    stage.appendChild(status);
    overlay.appendChild(stage);
    overlay.appendChild(controls);
    document.body.appendChild(overlay);

    const location = {
      latitude: Number(position.coords.latitude),
      longitude: Number(position.coords.longitude),
      accuracy: Number(position.coords.accuracy) || 0
    };

    function updatePreview() {
      const lines = buildWatermarkLines_(opts, new Date(), location);
      preview.innerHTML = lines.map(function (line, index) {
        const className = index === 0 ? ' class="bv-camera-brand"' : '';
        return '<div' + className + '></div>';
      }).join('');

      const children = preview.children;
      lines.forEach(function (line, index) {
        if (children[index]) children[index].textContent = line;
      });
    }

    updatePreview();
    const clockId = setInterval(updatePreview, 1000);

    return {
      overlay: overlay,
      video: video,
      status: status,
      cancelButton: cancelButton,
      captureButton: captureButton,
      clockId: clockId
    };
  }

  async function capture(opts) {
    opts = opts || {};

    if (activeCapture) {
      throw new Error('Ya hay una captura de evidencia en curso.');
    }
    activeCapture = true;

    let stream = null;
    let ui = null;

    try {
      const position = await getCurrentPosition_();
      ui = buildOverlay_(opts, position);
      stream = await getCameraStream_();
      ui.video.srcObject = stream;
      await ui.video.play();
      await waitForVideo_(ui.video);
      ui.status.textContent = 'GPS verificado (±' + Math.round(Number(position.coords.accuracy) || 0) + ' m). La marca se incrustará en la fotografía.';
      ui.captureButton.disabled = false;

      return await new Promise(function (resolve, reject) {
        let finished = false;

        function finish_(error, evidence) {
          if (finished) return;
          finished = true;
          clearInterval(ui.clockId);
          stopStream_(stream);
          if (ui.overlay && ui.overlay.parentNode) ui.overlay.parentNode.removeChild(ui.overlay);
          activeCapture = false;
          if (error) reject(error);
          else resolve(evidence);
        }

        ui.cancelButton.addEventListener('click', function () {
          finish_(abortError_());
        });

        ui.captureButton.addEventListener('click', async function () {
          ui.captureButton.disabled = true;
          ui.status.textContent = 'Generando evidencia con fecha y ubicación…';
          try {
            const evidence = await renderCapturedEvidence_(ui.video, opts, position);
            finish_(null, evidence);
          } catch (error) {
            finish_(error);
          }
        });
      });
    } catch (error) {
      if (ui) {
        clearInterval(ui.clockId);
        if (ui.overlay && ui.overlay.parentNode) ui.overlay.parentNode.removeChild(ui.overlay);
      }
      stopStream_(stream);
      activeCapture = false;
      throw error;
    }
  }

  global.BVEvidenceCamera = {
    capture: capture
  };
})(window);
