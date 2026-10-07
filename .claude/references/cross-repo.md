# Contratos entre repositorios

- Frontend: ../Club-Residencial-Bulevar-Verde (Hugo, JavaScript, Hosting; también contiene dataconnect/schema y dataconnect/admin).
- API: ../bulevar-verde-api (Express, TypeScript, Cloud Run; llamadas a operaciones admin y SDK generado).
- Sigue únicamente el recurso afectado: HTML/JS → /api/v1 → ruta/schema/middleware → servicio → operación GraphQL y schema.
- Frontend: hugo.toml contiene configuración; layouts y static/js contienen consumidores. API: src/app.ts registra routers; src/services/data-connect.ts encapsula operaciones.
- Autenticación: personal/admin usa Firebase ID token; residentes usan SESION_RESIDENTE; comité usa SESION_COMITE; consejo usa SESION_CONSEJO (solo casos remitidos a su órgano). El servidor verifica propósito, rol y pertenencia según la ruta. Visibilidad de botones no es autorización.
- Verifica que las operaciones referenciadas existen en el conector. Consulta en API doc/FIREBASE_DATACONNECT_REGENERATE.md y doc/DATABASE_SCHEMA_CHANGES.md solo si cambia GraphQL/schema; no edites SDK generado a mano.
- El workflow frontend .github/workflows/firebase-deploy.yml en rama firebase publica conector admin y Hosting. En API, npm run release modifica infraestructura y hace push; Cloud Build puede desplegar main. Inspecciona siempre configuración vigente antes de publicar.
- Mantén contrato HTTP, Swagger y consumidor compatibles; para cambios incompatibles, documenta orden de publicación y plan de migración antes de ejecutarlos.
- Validación local no equivale a verificación de operaciones desplegadas; informa esa diferencia.
