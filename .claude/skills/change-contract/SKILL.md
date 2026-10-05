---
name: change-contract
description: Implementar cambios de contratos HTTP o GraphQL entre el frontend y bulevar-verde-api.
---

# Cambio de contrato
1. Define consumidor, endpoint, campos, estado/error esperado, rol y compatibilidad. Localiza ambos repositorios como hermanos; no supongas que tener acceso concede escritura o despliegue.
2. Lee .claude/references/cross-repo.md y las instrucciones del otro repositorio antes de editarlo. Busca todos los consumidores del contrato concreto.
3. Sigue formulario/fetch → router/Zod/middleware → servicio Data Connect → operación GraphQL/schema. Reutiliza wrappers y conserva las diferencias entre Firebase, SESION_RESIDENTE y SESION_COMITE.
4. Actualiza las capas realmente afectadas y Swagger cuando cambie HTTP. Mantén autorizaciones, idempotencia y errores; identifica riesgos de orden de publicación.
5. Verifica casos válidos, inválidos y sin permiso en las pruebas existentes o añade cobertura significativa si cambió comportamiento. Compila frontend/API según el alcance.
6. Revisa diffs de ambos repositorios. Resume cambios compatibles/incompatibles y pasos de regeneración/migración/publicación necesarios sin ejecutarlos salvo autorización explícita.
Si el segundo repositorio no está disponible, documenta el contrato pendiente; no declares integración completada.
