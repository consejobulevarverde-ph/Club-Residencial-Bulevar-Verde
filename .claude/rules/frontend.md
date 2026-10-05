---
paths:
  - "layouts/**/*.html"
  - "static/js/**/*.js"
  - "assets/**/*"
---

# Frontend
- Reutiliza esc, apiFetch, loading, alertMessage y navegación existentes; sus firmas pueden variar entre pantallas.
- Para administración conserva window.AdminDatos y carga diferida. Módulos compartidos (convivencia/vehículos/lector) mantienen sus propias entradas.
- Conserva la cola IndexedDB y clientRequestId: reintento offline debe enviar la misma operación idempotente.
- Usa etiquetas accesibles, feedback de carga/error y UI móvil. Vigilancia usa el término apartamento; no muestres IDs internos ni datos reales como ejemplos.
- text-uppercase es CSS, no normalización persistida. La API define qué campos transforma; no conviertas correos, teléfonos o textos libres indiscriminadamente.
- No copies tokens Firebase a flujos de residentes/comité; usa el wrapper y propósito correspondiente.
- Para JS bajo static/js también consulta la guía del partial relacionado: las guías anidadas en layouts no se cargan por leer un JS hermano.
