# 📑 Índice Central - Directorio .github/

Mapeo completo de todos los componentes del sistema de GitHub Copilot Agents para Green-POS.

**Última actualización**: 29 de enero de 2026  
**Total de archivos**: 66 archivos organizados

---

## 🎯 Navegación Rápida

| Sección | Archivos | Propósito |
|---------|----------|-----------|
| [Agents](#-agents-especializados) | 17 | Agents ejecutables en Copilot Agent Mode |
| [Plans](#-planes-de-implementaci%C3%B3n) | 6 activos | Planes técnicos de features |
| [Skills](#-skills-reutilizables) | 3 | Conocimiento de dominio específico |
| [Instructions](#-instructions-por-capa) | 5 | Guías detalladas por agente |
| [Subagents](#-subagents-de-soporte) | 6 | Agentes auxiliares para tareas específicas |
| [Prompts](#-prompts-reutilizables) | 2 | Templates de prompts comunes |
| [Referencias](#-referencias-r%C3%A1pidas) | 1 | Guías de uso rápido |

---

## 🤖 Agents Especializados

### Agents de Desarrollo (Green-POS)

| Agent | Archivo | Propósito | Stack |
|-------|---------|-----------|-------|
| **@green-pos-frontend** | [green-pos-frontend.agent.md](agents/green-pos-frontend.agent.md) | UI/UX, Templates, JavaScript | HTML5 + Jinja2 + Bootstrap 5.3+ + Vanilla JS |
| **@green-pos-backend** | [green-pos-backend.agent.md](agents/green-pos-backend.agent.md) | Rutas, Lógica de negocio, APIs | Flask 3.0+ + SQLAlchemy + Flask-Login |
| **@green-pos-database** | [green-pos-database.agent.md](agents/green-pos-database.agent.md) | Schema, Modelos, Migraciones | SQLite + SQLAlchemy ORM |

### Agents de Planning

| Agent | Archivo | Propósito | Uso |
|-------|---------|-----------|-----|
| **@creador-plan** | [create_plan.agent.md](agents/create_plan.agent.md) | Planes para features internas Green-POS | **DEFAULT** - 90% de casos |
| **@create-plan-external** | [create-plan-external.agent.md](agents/create-plan-external.agent.md) | Planes para integraciones externas, POCs | Stripe, AWS, upgrades core |

### Agents de Investigación

| Agent | Archivo | Propósito | Output |
|-------|---------|-----------|--------|
| **@investigador-codebase** | [research_codebase.agent.md](agents/research_codebase.agent.md) | Investiga código existente | `docs/research/YYYY-MM-DD-NNN-*.md` |
| **@research-verifier** | [research-verifier.agent.md](agents/research-verifier.agent.md) | Verifica calidad de investigaciones | Quality checks |

### Agents de Debugging (Bug Workflow)

| Agent | Archivo | Propósito | Fase |
|-------|---------|-----------|------|
| **@bug-coordinator** | [bug-coordinator.agent.md](agents/bug-coordinator.agent.md) | Coordina workflow completo de bugs | Orchestrator |
| **@bug-researcher** | [bug-researcher.agent.md](agents/bug-researcher.agent.md) | Investiga contexto del bug | Research |
| **@rca-analyst** | [rca-analyst.agent.md](agents/rca-analyst.agent.md) | Análisis de causa raíz (5 Whys) | RCA |
| **@rca-verifier** | [rca-verifier.agent.md](agents/rca-verifier.agent.md) | Verifica análisis RCA | Validation |
| **@bug-planner** | [bug-planner.agent.md](agents/bug-planner.agent.md) | Crea plan de corrección | Planning |
| **@bug-implementer** | [bug-implementer.agent.md](agents/bug-implementer.agent.md) | Implementa fix del bug | Implementation |
| **@bug-fix-testing** | [bug-fix-testing.agent.md](agents/bug-fix-testing.agent.md) | Crea tests para prevenir regresiones | Testing |

### Agents de Orchestration

| Agent | Archivo | Propósito | Uso |
|-------|---------|-----------|-----|
| **@meta-coordinator** | [meta-coordinator.agent.md](agents/meta-coordinator.agent.md) | Coordina workflows multi-agent complejos | Orquestación de alto nivel |
| **implementador-plan** (mode) | [implement_plan.md](agents/implement_plan.md) | Ejecuta planes técnicos fase por fase | Implementación guiada |

### Documentación de Agents

| Archivo | Propósito |
|---------|-----------|
| [README.md](agents/README.md) | Guía completa de todos los agents |

---

## 📋 Planes de Implementación

### Planes Activos (6)

| Plan | Archivo | Status | Esfuerzo |
|------|---------|--------|----------|
| Inventario Periódico | [2025-11-24-implementacion-inventario-periodico.md](plans/2025-11-24-implementacion-inventario-periodico.md) | Draft | 3-4 días |
| Historial Consolidado | [2026-01-01-historial-consolidado-inventario.md](plans/2026-01-01-historial-consolidado-inventario.md) | Active | 2-3 días |
| Mejora UX Validación | [2026-01-04-mejora-ux-validacion-ventas.md](plans/2026-01-04-mejora-ux-validacion-ventas.md) | Active | 1-2 días |
| Arqueo de Caja | [2026-01-19-002-modulo-arqueo-caja-diario.md](plans/2026-01-19-002-modulo-arqueo-caja-diario.md) | Completed | 2-3 días |
| Gastos Anticipados | [2026-01-20-001-gastos-anticipados-cash-register.md](plans/2026-01-20-001-gastos-anticipados-cash-register.md) | Completed | 2-3 horas |
| Backup Post-Arqueo | [2026-01-28-backup-automatico-post-arqueo.md](plans/2026-01-28-backup-automatico-post-arqueo.md) | Ready | 1-2 horas |

### Planes Archivados

Ver: [docs/archive/plans/implemented/](../docs/archive/plans/implemented/) (11 planes completados)

---

## 🎓 Skills (Conocimiento de Dominio)

| Skill | Archivo | Propósito |
|-------|---------|-----------|
| **bug-fix-testing** | [skills/bug-fix-testing/SKILL.md](skills/bug-fix-testing/SKILL.md) | Patrones para crear tests de regresión |
| **rca-verification** | [skills/rca-verification/SKILL.md](skills/rca-verification/SKILL.md) | Métodos de validación de análisis RCA |
| **codebase-research** | [skills/codebase-research/SKILL.md](skills/codebase-research/SKILL.md) | Patrones de investigación de código |

---

## 📚 Instructions (Guías por Capa)

### Instructions de Desarrollo

| Archivo | Propósito | Tamaño |
|---------|-----------|--------|
| [frontend-html-agent.instructions.md](instructions/frontend-html-agent.instructions.md) | Bootstrap 5, Jinja2, JavaScript, accesibilidad | 57 KB |
| [backend-python-agent.instructions.md](instructions/backend-python-agent.instructions.md) | Flask routes, CRUD, APIs, validación | 45 KB |
| [database-sqlite-agent.instructions.md](instructions/database-sqlite-agent.instructions.md) | Models, relaciones, migraciones, queries | 52 KB |

### Instructions de Procesos

| Archivo | Propósito |
|---------|-----------|
| [code-clean.instructions.md](instructions/code-clean.instructions.md) | Limpieza de código pre-producción |
| [code-generation.instructions.md](instructions/code-generation.instructions.md) | Patrones de generación de código |

### Documentación de Instructions

| Archivo | Propósito |
|---------|-----------|
| [README.md](instructions/README.md) | Guía de sistema de instructions (18 KB) |

---

## 🔧 Subagents (Agentes Auxiliares)

### Subagents de Investigación

| Subagent | Archivo | Propósito |
|----------|---------|-----------|
| **localizador-codebase** | [subagents/codebase-locator.md](agents/subagents/codebase-locator.md) | Localiza archivos relevantes |
| **analizador-codebase** | [subagents/codebase-analyzer.md](agents/subagents/codebase-analyzer.md) | Analiza implementación actual |
| **buscador-patrones-codebase** | [subagents/codebase-pattern-finder.md](agents/subagents/codebase-pattern-finder.md) | Encuentra patrones en código |
| **localizador-pensamientos** | [subagents/thought-locator.md](agents/subagents/thought-locator.md) | Busca documentación de decisiones |
| **analizador-pensamientos** | [subagents/thought-analyzer.md](agents/subagents/thought-analyzer.md) | Extrae insights de docs |

### Subagents de Frontend

| Subagent | Propósito |
|----------|-----------|
| **subagent_scaffold_page** | Scaffolding de página completa |
| **subagent_table_datatable** | Agregar DataTable a templates |
| **subagent_accessibility_audit** | Auditoría de accesibilidad WCAG |

### Subagents de Backend

| Subagent | Propósito |
|----------|-----------|
| **subagent_generate_crud** | Generar CRUD completo |
| **subagent_add_validation** | Agregar validación server-side |
| **subagent_create_api** | Crear API endpoint JSON |

### Subagents de Database

| Subagent | Propósito |
|----------|-----------|
| **subagent_generate_model** | Generar modelo SQLAlchemy |
| **subagent_create_migration** | Crear script de migración |
| **subagent_optimize_queries** | Optimizar queries N+1 |

---

## 📝 Prompts Reutilizables

| Archivo | Propósito |
|---------|-----------|
| [system-prompt.md](prompts/system-prompt.md) | Prompt de sistema base (si existe) |
| [common-patterns.md](prompts/common-patterns.md) | Patrones comunes de prompts (si existe) |

---

## 🚀 Referencias Rápidas

| Archivo | Propósito | Tamaño |
|---------|-----------|--------|
| [QUICK_REFERENCE.md](QUICK_REFERENCE.md) | **Guía de uso rápido consolidada** | 24.4 KB |

**Incluye**:
- Sistema de agents con diagramas
- Tabla de selección rápida de agent
- Casos de uso comunes por agent
- Workflow multi-agent completo
- Troubleshooting y smoke tests
- Comandos copy-paste favoritos
- Referencias completas

---

## 📊 Estadísticas del Directorio

| Categoría | Cantidad | Propósito |
|-----------|----------|-----------|
| **Agents principales** | 17 | Agents ejecutables en Agent Mode |
| **Planes activos** | 6 | Planes técnicos en desarrollo |
| **Planes archivados** | 11 | Planes completados (en `docs/archive/`) |
| **Skills** | 3 | Conocimiento de dominio específico |
| **Instructions** | 5 | Guías detalladas por capa |
| **Subagents** | 6+ | Agentes auxiliares especializados |
| **Referencias** | 1 | Guía de uso rápido consolidada |
| **Total archivos** | ~66 | Componentes del sistema |

---

## 🔄 Flujo de Trabajo Recomendado

### Para Features Nuevas (Green-POS Interno)

```
1. @creador-plan → Crear plan técnico
2. @green-pos-database → Crear modelos
3. @green-pos-backend → Implementar CRUD
4. @green-pos-frontend → Crear vistas
5. implementador-plan (mode) → Ejecutar plan fase por fase
```

### Para Integraciones Externas

```
1. @create-plan-external → Crear plan genérico
2. @investigador-codebase → Investigar código relacionado
3. implementador-plan (mode) → Ejecutar plan
```

### Para Bugs

```
1. @bug-coordinator → Orquestar workflow completo, O:
2. @bug-researcher → Investigar contexto
3. @rca-analyst → Análisis de causa raíz
4. @bug-planner → Crear plan de corrección
5. @bug-implementer → Implementar fix
6. @bug-fix-testing → Crear tests de regresión
```

---

## 🎯 Agents por Caso de Uso

### "Necesito crear una nueva feature"
→ **@creador-plan** (interno) o **@create-plan-external** (externo)

### "Necesito entender cómo funciona X"
→ **@investigador-codebase**

### "Necesito crear templates HTML"
→ **@green-pos-frontend**

### "Necesito agregar rutas/APIs"
→ **@green-pos-backend**

### "Necesito crear/modificar modelos"
→ **@green-pos-database**

### "Tengo un bug que arreglar"
→ **@bug-coordinator** (workflow completo) o individual:
- Research: **@bug-researcher**
- RCA: **@rca-analyst**
- Planning: **@bug-planner**
- Implementation: **@bug-implementer**
- Testing: **@bug-fix-testing**

### "Necesito coordinar múltiples agents"
→ **@meta-coordinator**

### "Necesito ejecutar un plan técnico"
→ **implementador-plan** (mode)

---

## 📖 Documentación Complementaria

### En `.github/`
- [copilot-instructions.md](copilot-instructions.md) - **Contexto canónico completo** (6,897 líneas)
- [QUICK_REFERENCE.md](QUICK_REFERENCE.md) - Guía de uso rápido consolidada

### En `docs/`
- [technical/CRUD_PATTERNS_REFERENCE.md](../docs/technical/CRUD_PATTERNS_REFERENCE.md) - Patrones CRUD (768 líneas)
- [archive/plans/implemented/](../docs/archive/plans/implemented/) - Planes completados (11 archivos)
- [research/](../docs/research/) - Documentos de investigación

### Archivos Raíz
- [README.md](../README.md) - Descripción general del proyecto
- [docs/CHANGELOG.md](../docs/CHANGELOG.md) - Historial de versiones

---

## 🔍 Búsqueda Rápida

**Por Stack**:
- Frontend (HTML/CSS/JS): `@green-pos-frontend`
- Backend (Python/Flask): `@green-pos-backend`
- Base de Datos (SQLAlchemy): `@green-pos-database`

**Por Fase**:
- Planning: `@creador-plan`, `@create-plan-external`
- Research: `@investigador-codebase`, `@bug-researcher`
- Implementation: `implementador-plan`, `@bug-implementer`
- Testing: `@bug-fix-testing`

**Por Tipo de Trabajo**:
- Features internas: `@creador-plan` + agents de desarrollo
- Integraciones externas: `@create-plan-external`
- Debugging: `@bug-coordinator` (workflow completo)
- Investigación: `@investigador-codebase`

---

## 🛠️ Mantenimiento

### Checklist Mensual

- [ ] Revisar planes en `.github/plans/` y archivar completados
- [ ] Verificar que handoffs entre agents funcionan
- [ ] Actualizar ejemplos si hay cambios en codebase
- [ ] Revisar que `copilot-instructions.md` está sincronizado
- [ ] Verificar enlaces rotos en documentación

### Scripts de Verificación

Ver: [docs/research/2026-01-29-003-agentes-plan-duplicados-unificacion.md](../docs/research/2026-01-29-003-agentes-plan-duplicados-unificacion.md) sección "Scripts de Verificación"

---

**Este índice se actualizó como parte de la consolidación del directorio `.github/`**  
**Research completo**: [docs/research/2026-01-29-003-agentes-plan-duplicados-unificacion.md](../docs/research/2026-01-29-003-agentes-plan-duplicados-unificacion.md)

---

**Green-POS v2.1** - Sistema de GitHub Copilot Agents  
**Última actualización**: 29 de enero de 2026
