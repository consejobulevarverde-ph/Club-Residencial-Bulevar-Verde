---
name: diagnose-issue
description: Diagnosticar fallos del portal o API Bulevar Verde con evidencia y un alcance de reparación concreto.
---

# Diagnóstico
1. Delimita pantalla/endpoint, rol, comportamiento esperado y observado. Si faltan datos esenciales, solicítalos; continúa con la inspección independiente.
2. Lee CLAUDE.md, la regla aplicable y solo la sección de referencia necesaria. Sigue cliente → ruta → middleware → servicio → operación GraphQL según el fallo.
3. Reproduce localmente con datos ficticios cuando sea posible. Conserva error completo, estado HTTP y requestId redactados; no imprimas tokens.
4. Clasifica la causa: frontend, API, contrato, Data Connect, datos, autenticación/autorización o entorno. Distingue hallazgos de hipótesis; no culpes a CORS solo por el mensaje del navegador.
5. Si el usuario pidió reparar, aplica el cambio mínimo respaldado por evidencia y valida el área. Si pidió diagnóstico, entrega causa, evidencia, alcance y comprobaciones pendientes sin cambiar código.
No inicies llamadas que envíen correos, creen sanciones o modifiquen producción para reproducir. Verifica entorno y autorización antes de acciones externas. No sustituyas diagnóstico por sleeps/retries/timeouts.
