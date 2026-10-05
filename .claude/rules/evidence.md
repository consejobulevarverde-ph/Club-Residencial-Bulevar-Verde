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
- Fotos del parqueadero usan Cloud Storage privado; evidencia de convivencia usa Drive. No hagas público el bucket ni sustituyas transportes entre módulos.
- Lector: conserva procesamiento local, confirmación de placa y cola idempotente. Consulta layouts/partials/lector-placas/CLAUDE.md antes de tocar su JS.
