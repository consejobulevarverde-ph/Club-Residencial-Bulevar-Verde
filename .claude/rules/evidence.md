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
- Administración dirige todos los casos y decide cuáles remite al Comité y/o al Consejo (remitidoComite/remitidoConsejo, definitivo). Comité y consejo (rol solo consulta) solo ven los casos remitidos a su órgano; la restricción la aplica la API, no el frontend.
- evidenciaOculta: administración puede ocultar toda la evidencia de un caso en cualquier momento; solo ella la ve. La API la omite para comité, consejo, residente y vigilancia (sinEvidenciaOculta en todo llamador no admin, incluidas las rutas de acceso/URL firmada); el front solo muestra el aviso. Limitación: enlaces de Drive ya copiados siguen funcionando.
- Lectura: el portal del residente marca el caso como leído a los 20 s de abrir su detalle (POST /sanciones/{caseCode}/lectura) y no muestra nada al residente; solo administración y los órganos con acceso al caso ven «leída». No la presentes como lectura del correo.
- Fotos del parqueadero usan Cloud Storage privado. Evidencia nueva de casos de convivencia (registro progresivo, convivencia-form.js): bucket privado propio, subida directa reanudable y acceso con URL firmada de la API; la histórica y la de descargos/acta/apelación/corrección siguen en Drive (base64, ≤23 MB). No hagas público ningún bucket ni sustituyas transportes entre módulos.
- Registro progresivo: el caso se guarda como BORRADOR sin notificar y se finaliza con «Finalizar» (servidor). Un llamado de atención se notifica solo al finalizar; un caso de proceso formal queda pendienteNotificar hasta que administración lo notifique eligiendo destinatarios (sin trámite ni vista del residente mientras tanto). No muestres «Notificado» cuando solo se solicitó el envío. El servidor no convierte archivos: el video debe llegar como MP4 H.264 ≤5 min y ≤200 MB (ver doc/HERRAMIENTA_PROCESAMIENTO_VIDEO.md).
- Lector: conserva procesamiento local, confirmación de placa y cola idempotente. Consulta layouts/partials/lector-placas/CLAUDE.md antes de tocar su JS.
