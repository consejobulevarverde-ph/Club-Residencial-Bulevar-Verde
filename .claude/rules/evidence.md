---
paths:
  - "static/js/evidence-*.js"
  - "static/js/convivencia*.js"
  - "static/js/lector-placas*.js"
  - "layouts/partials/convivencia*/**/*.html"
  - "layouts/partials/lector-placas/**/*.html"
---

# Evidencias y convivencia
- BVEvidenceTypes centraliza clasificación, MIME y tamaños; BVEvidenceCamera captura imagen/video. Conserva el contrato compartido con validación de la API.
- Convivencia usa la API/Data Connect actual; no reintroduzcas el antiguo transporte de Apps Script.
- El servidor determina acciones, estado y permisos. El comité no propone ni aprueba sanciones; vigilancia no administra casos.
- Fotos del parqueadero usan Cloud Storage privado. Evidencia nueva de casos de convivencia (registro progresivo, convivencia-form.js): bucket privado propio, subida directa reanudable y acceso con URL firmada de la API; la histórica y la de descargos/acta/apelación/corrección siguen en Drive (base64, ≤23 MB). No hagas público ningún bucket ni sustituyas transportes entre módulos.
- Registro progresivo: el caso se guarda como BORRADOR sin notificar y solo se notifica con «Finalizar y notificar» (servidor). No muestres «Notificado» cuando solo se solicitó el envío. El servidor no convierte archivos: el video debe llegar como MP4 H.264 ≤5 min y ≤200 MB (ver doc/HERRAMIENTA_PROCESAMIENTO_VIDEO.md).
- Lector: conserva procesamiento local, confirmación de placa y cola idempotente. Consulta layouts/partials/lector-placas/CLAUDE.md antes de tocar su JS.
