# Plantillas y portales

- Hugo renderiza layouts y partials; conserva IDs, data-target, data-permission y contratos esperados por el JavaScript.
- Antes de editar un módulo compartido, localiza las páginas que lo incluyen y su guía anidada.
- Administración: layouts/administracion-datos/list.html es el shell; partials y static/js/administracion-datos usan window.AdminDatos. Reutiliza registrarModulo, estado compartido y carga al primer acceso.
- Mantén los modales fuera de vistas con ancestros ocultos.
- Residentes y comité usan tokens de sesión propios; personal usa Firebase. Usa el wrapper de la pantalla correspondiente.
- Texto de usuario: textContent o esc existente. No interpolar entrada sin escapar en HTML.
- Los null-checks son apropiados para elementos opcionales; si uno obligatorio falta, investiga IDs/renderizado antes de ocultar el defecto con una guarda.
- La clase text-uppercase solo cambia presentación; confirma transformación en JavaScript/API cuando sea necesaria.
- Consulta las guías de partials/convivencia-casos, partials/vehiculos, partials/lector-placas y partials/administracion-datos/reservas según el módulo.
- Detalles históricos de pantallas/reservas: .claude/references/layouts-details.md en la raíz del repositorio; consulta por sección y confirma contra el código.
