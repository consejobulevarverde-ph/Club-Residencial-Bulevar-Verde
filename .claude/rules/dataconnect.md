---
paths:
  - "dataconnect/**/*.gql"
  - "dataconnect/**/*.yaml"
---

# Data Connect
- Este repositorio es la fuente de schema y operaciones admin que consume la API hermana.
- Conserva @auth(level: NO_ACCESS) en operaciones admin y verifica autenticación/autorización real en la API; no abras acceso para resolver un fallo.
- Verifica claves compuestas y formas _updateMany en operaciones existentes; no supongas _update(id).
- Al cambiar operación/schema identifica usos por nombre en src/services y src/modules de la API, y tipos generados afectados.
- Consulta .claude/references/cross-repo.md y las guías de regeneración/migración de la API. No edites SDK generado manualmente ni migres/publices como parte de una comprobación local.
