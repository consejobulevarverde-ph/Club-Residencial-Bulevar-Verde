# Club Residencial Bulevar Verde — guía de Claude

Frontend Hugo + JavaScript sin framework + Bootstrap + Firebase Hosting/Auth. Es un sitio con portales de residentes, administración, vigilancia y comité; no un repositorio dedicado de Playwright/Appium.
La API está en ../bulevar-verde-api. El schema y operaciones Data Connect están en este repositorio.

## Mapa mínimo
- layouts: plantillas y partials. Lee layouts/CLAUDE.md al trabajar aquí y la guía anidada del módulo cuando exista.
- static/js: módulos compartidos, AdminDatos, convivencia, vehículos y lector de placas.
- content, data, assets, hugo.toml: contenido y configuración Hugo.
- dataconnect/schema y dataconnect/admin: contratos GraphQL compartidos con la API.
- .claude/references/project-details.md: guía original, para consultar por sección y contrastar con código.
- .claude/references/layouts-details.md: detalle histórico de pantallas y reservas, para consultas puntuales.
- .claude/references/cross-repo.md: cambios que atraviesan frontend/API/GraphQL.
- .claude/references/parqueadero-visitantes-pendiente.md: estado, pendientes y trampas de las sanciones de parqueadero de visitantes; léelo antes de retomar ese módulo.

## Validación local
- hugo server sirve normalmente http://localhost:1313. Comprueba apiBaseUrl antes de acciones desde el navegador: servir localmente no vuelve local a la API.
- Para compilar sin alterar public: hugo --minify --destination <directorio-temporal-fuera-del-repo>.
- Para JS externo: node --check <archivo.js>. Revisa la página afectada para DOM, consola, estados y permisos si cambió comportamiento.
- Los scripts test-pqrs-*.js llaman un servicio remoto; no son una suite local aislada. Inspecciona destino/efectos antes de ejecutarlos.
- Push a firebase puede publicar Hosting y el conector admin. No forma parte de la validación local.

## Forma de trabajar
- Responde en español. Lee las instrucciones del área y el código afectado antes de modificarlo.
- Reutiliza patrones existentes; evita refactors y dependencias ajenos al objetivo.
- Reproduce fallos y distingue código, contrato, datos y entorno antes de reparar. No debilites validaciones ni assertions para ocultarlos.
- Conserva cambios del usuario. Esta configuración no autoriza publicar, migrar datos ni hacer push; respeta la autorización explícita de la sesión.
- No leas ni muestres credenciales o datos personales para explorar el proyecto. Usa datos ficticios y salida redactada al diagnosticar.

## Contexto y costo
- Busca primero rutas y símbolos concretos; lee fragmentos relevantes en vez de todo el repositorio.
- Excluye .git, node_modules, public, resources, dist y SDK generado de exploraciones amplias; inspecciónalos solo si la tarea lo requiere.
- Los archivos de .claude/references se consultan por tema, sin imports automáticos. No cargues todas las referencias ni todas las skills.
- Usa el modelo actual; escala de modelo o delega solo si la complejidad lo justifica y el usuario lo permite. No generes agentes por rutina.
- Al cerrar una tarea larga, resume objetivo, archivos, hallazgos, validación y siguiente paso; no guardes transcripciones en instrucciones permanentes.

## Finalización
- Revisa el diff y ejecuta comprobaciones proporcionales al cambio. Para documentación/configuración, verifica enlaces, rutas y formato; no hace falta ejecutar suites del producto.
- Informa qué cambió, qué se ejecutó, resultado y límites. No declares validaciones que no ejecutaste.
- Workflows disponibles: /diagnose-issue, /change-contract y /review-change.
