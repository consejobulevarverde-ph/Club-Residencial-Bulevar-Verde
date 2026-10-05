---
name: review-change
description: Revisar un diff de Bulevar Verde para encontrar regresiones de contratos, permisos, datos y validación.
---

# Revisión
Obtén estado y diff de trabajo o la revisión solicitada; incluye archivos nuevos relevantes y conserva el alcance pedido. Lee funciones completas cuando el contexto del diff no baste.
- Sigue contratos entre frontend y API; revisa Zod, Swagger y GraphQL afectados.
- Comprueba propósito de token, rol/unidad derivados del servidor, XSS y ausencia de credenciales/datos reales añadidos.
- Según el módulo, revisa transiciones de convivencia, idempotencia de colas, límites de evidencia, fechas de Bogotá y reglas de reservas.
- Revisa cobertura y comandos de validación realmente ejecutados. No corras scripts con efectos externos sin comprobar su destino.
Entrega únicamente hallazgos accionables respaldados por código con prioridad, archivo/línea, escenario y consecuencia; separa dudas y límites. Si no hay hallazgos, dilo sin afirmar que todo está probado. No apliques correcciones salvo que el usuario lo solicite.
