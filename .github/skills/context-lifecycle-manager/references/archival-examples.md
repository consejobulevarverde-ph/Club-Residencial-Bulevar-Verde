# Archival Examples

Real-world examples of archiving completed bug-fixing artifacts using Context Lifecycle Manager.

## Example 1: Complete Bug Fix with Implementation

### Before Archival

```
.context/active/bugs/EMS-1234/
├── bug-context.md (Jira ticket details)
├── research/
│   ├── hypothesis.md (Initial theories)
│   ├── codebase-research.md (Code investigation)
│   └── verified-research.md (Validated findings)
├── rca-report.md (5 Whys root cause analysis)
├── verified-rca.md (QA validated RCA)
├── implementation-plan.md (Fix strategy)
└── fix-summary.md (Deployment results)
```

### Archival Command

```bash
@context-lifecycle-manager archive bug EMS-1234
```

### After Archival

```
.context/archive/bugs/implemented/EMS-1234/
├── bug-context.md
├── research/
│   ├── hypothesis.md
│   ├── codebase-research.md
│   └── verified-research.md
├── rca-report.md
├── verified-rca.md
├── implementation-plan.md
└── fix-summary.md (contains "Estado: ✅ Completado")
```

**Category:** `implemented/` (detected from "Estado: ✅ Completado" in fix-summary.md)

**Result:**
- ✅ Complete history preserved
- ✅ Workspace cleaned
- ✅ Ready for next bug

---

## Example 2: Research Without Implementation

### Before Archival

```
.context/active/inventory/current/
└── 2025-11-24-implementacion-inventario-periodico.md
    Content includes:
    ## Conclusión
    
    Después de investigar opciones, determinamos que el inventario
    perpetuo actual es suficiente para nuestras necesidades.
    Sistema de inventario periódico NO se implementará.
    
    Razones:
    - Overhead administrativo alto
    - Beneficio marginal bajo
    - Sistema actual funciona bien
```

### Archival Command

```bash
@context-lifecycle-manager full cleanup
```

### After Archival

```
.context/archive/inventory/research/
└── 2025-11-24-implementacion-inventario-periodico.md
```

**Category:** `research/` (no implementation keywords, but has conclusion > 100 chars)

**Result:**
- ✅ Research documented
- ✅ Decision preserved for future reference
- ✅ Active workspace cleaned

---

## Example 3: Obsolete Research

### Before Archival

```
.context/active/sales/current/
└── 2025-10-05-migracion-bootstrap-4-a-5.md
    Content includes:
    ## Estado: Obsoleto
    
    Este research es obsoleto. La migración ya fue completada
    en commit abc123 por otro desarrollador.
    
    Ya no aplica esta propuesta.
```

### Archival Command

```bash
@context-lifecycle-manager archive research
```

### After Archival

```
.context/archive/sales/obsolete/
└── 2025-10-05-migracion-bootstrap-4-a-5.md
```

**Category:** `obsolete/` (detected from "obsoleto", "ya no aplica")

**Result:**
- ✅ Marked as obsolete
- ✅ Not clutter in active/
- ✅ History preserved if needed

---

## Example 4: Multiple Bugs Batch Archival

### Scenario

After sprint completion, 4 bugs need archival:
- EMS-1234: Login failure ✅ Fixed
- EMS-1235: Performance issue ✅ Fixed
- EMS-1236: UI glitch ✅ Fixed
- EMS-1237: Validation error 🔍 Research only, not implemented

### Before Archival

```
.context/active/bugs/
├── EMS-1234/ (fix-summary.md: "deployed to production")
├── EMS-1235/ (fix-summary.md: "implementado")
├── EMS-1236/ (fix-summary.md: "feature completada")
└── EMS-1237/ (rca-report.md only, no implementation-plan.md)
```

### Archival Command

```bash
python .context/scripts/lifecycle_automation.py --archive-research --execute
```

### After Archival

```
.context/archive/bugs/implemented/
├── EMS-1234/ (category: implemented)
├── EMS-1235/ (category: implemented)
└── EMS-1236/ (category: implemented)

.context/archive/bugs/research/
└── EMS-1237/ (category: research, no implementation)
```

**Result:**
- ✅ 4 bugs archived in single operation
- ✅ Correctly categorized
- ✅ Workspace ready for next sprint

---

## Example 5: Archival with Learnings Extraction

### Before Archival

```
.context/sessions/2025-12-20-debugging-cash-register/
├── notes.md
│   Content includes:
│   ## Learnings to Extract
│   
│   - Cash register locking issue caused by race condition
│   - Fix pattern: Use optimistic locking with version field
│   - Testing pattern: Concurrent transaction simulation
└── screenshots/
    └── error-state.png
```

### Attempted Archival

```bash
@context-lifecycle-manager clean sessions older than 14 days
```

### Result

```
⚠️  2025-12-20-debugging-cash-register (45 días) - TIENE LEARNINGS SIN EXTRAER
   Revisa manualmente antes de eliminar.

📊 Total limpiadas: 0
```

**Session preserved until learnings are extracted**

### Manual Extraction

User creates:
```
.context/active/cash-register/current/
└── 2026-02-01-race-condition-pattern.md
    Content:
    # Race Condition Pattern in Cash Register
    
    [Extracted from session 2025-12-20-debugging-cash-register]
    
    ## Problem
    Cash register locking issue
    
    ## Solution Pattern
    Optimistic locking with version field
    
    ## Testing Pattern
    Concurrent transaction simulation
    
    See: .context/sessions/2025-12-20.../notes.md (archived)
```

### After Extraction - Mark Session

Update session notes:
```markdown
## Learnings to Extract

~~[Extracted to .context/active/cash-register/current/2026-02-01-race-condition-pattern.md on 2026-02-01]~~

✅ Learnings extracted. Session can be safely deleted.
```

### Re-run Cleanup

```bash
@context-lifecycle-manager clean sessions older than 14 days
```

Result:
```
✅ Eliminado: 2025-12-20-debugging-cash-register (45 días)

📊 Total limpiadas: 1
```

**Learnings preserved, session cleaned**

---

## Example 6: Automatic Handoff from Bug Coordinator

### Complete Workflow

```
User: @bug-coordinator EMS-1234
      Fix the login failure bug

Agent: [Phase 1] @jira-bug-fetcher EMS-1234
       ✅ Created: .context/active/bugs/EMS-1234/bug-context.md
       
       [Phase 2] @codebase-research
       ✅ Created: .context/active/bugs/EMS-1234/research/
       
       [Phase 3] Hypothesis validation
       ✅ Updated: hypothesis.md
       
       [Phase 4] @root-cause-analysis
       ✅ Created: rca-report.md
       
       [Phase 5] @rca-verification
       ✅ Created: verified-rca.md
       
       [Phase 6] @bug-planner
       ✅ Created: implementation-plan.md
       
       [Phase 7] @bug-implementer
       ✅ Created: fix-summary.md
       ✅ Fix deployed to production
       
       [Phase 8] @context-lifecycle-manager archive EMS-1234
       
       📦 Archivando Bug EMS-1234
       ============================================================
       
       ✅ Archivado: .context/active/bugs/EMS-1234/
       → .context/archive/bugs/implemented/EMS-1234/
       
       📊 Total archivados: 1 bug
       
       🎉 Bug fix workflow complete!
       Workspace cleaned, ready for next bug.
```

**Benefits:**
- ✅ Zero manual steps required
- ✅ Complete automation Phase 1-8
- ✅ Clean workspace automatically
- ✅ History preserved

---

## Example 7: Monthly Maintenance Routine

### First Friday Routine

```
User: @context-lifecycle-manager health check

Agent: Context Repository Health Check
       Fecha: 2026-02-07 09:00 AM
       ============================================================
       
       📊 MÉTRICAS CORE
       
       Freshness Ratio:         68%      🟡 (target: > 60%)
       Orphan Rate:             8%       🟡 (target: < 10%)
       
       🏆 ESTADO GENERAL: SALUDABLE
       
       📋 ESTADÍSTICAS ADICIONALES
       
       Total Documentos:           142
       - Active:                   75
       - Archive:                  54
       - Sessions:                 13 (⚠️  2 > 14 días)
       
       ⚠️  ACCIONES RECOMENDADAS
       
       1. [IMPORTANTE] ⚠️ Cerrar 2 session(es) > 14 días

User: @context-lifecycle-manager detect stale plans

Agent: 🔍 Detectando Plans Sin Implementar (> 90 días)
       
       ⚠️  Encontrados 1 plan antiguo sin implementar:
       
       - [inventory] 2025-10-15-implementar-inventario-periodico.md
         Antigüedad: 115 días | ❌ DoD incompleto
       
       💡 Acciones sugeridas:
       1. Revisar si plan está implementado → mover a plans/completed/
       2. Revisar si plan fue abandonado → mover a archive/obsolete/

User: @context-lifecycle-manager clean sessions older than 30 days

Agent: 🧹 Limpiando Sesiones Antiguas (> 30 días)
       
       ✅ Eliminado: 2025-12-01-test-session (64 días)
       ✅ Eliminado: 2025-12-08-spike-research (57 días)
       
       📊 Total limpiadas: 2 sesiones

User: @context-lifecycle-manager full cleanup

Agent: 🚀 Ejecutando Limpieza Completa del Repositorio
       
       📦 Archivando Research Completados
       ✅ Archivado: 2025-11-24-causa-raiz-filenotfounderror.md
       
       🧹 Limpiando Sesiones Antiguas
       ℹ️  No hay sesiones antiguas para limpiar.
       
       🔍 Detectando Plans Sin Implementar
       [Already shown above]
       
       📊 Resumen de Limpieza
       ============================================================
       Research archivados:       1
       Sesiones eliminadas:       0
       Plans antiguos detectados: 1
       Tareas de mantenimiento:   3
```

**Monthly maintenance complete in 4 commands**

---

## Archival Patterns

### Pattern 1: Immediate Archival After Deployment

```
Trigger: Fix deployed to production
Action: @context-lifecycle-manager archive {TICKET-ID}
When: Immediately after Phase 7 completes
```

### Pattern 2: Batch Archival End of Sprint

```
Trigger: Sprint retrospective
Action: @context-lifecycle-manager full cleanup
When: Last day of sprint
```

### Pattern 3: Scheduled Monthly Maintenance

```
Trigger: Calendar reminder (first Friday)
Actions:
1. Health check
2. Detect stale plans
3. Clean sessions (30-day threshold)
4. Full cleanup
```

### Pattern 4: On-Demand Before New Work

```
Trigger: Starting new major feature
Action: @context-lifecycle-manager full cleanup
When: Before creating new research/plans
```

---

## Completion Marker Examples

### Example: Implemented Research

```markdown
# Fix Login Failure Issue

## Implementation

Fix deployed to production on 2026-01-15.

Commit: abc123def456
PR: #234

Estado: ✅ Completado

## Results

- Login success rate improved from 92% to 99.7%
- Zero failures in 7 days post-deployment
- Performance impact < 2ms

→ Triggers archival to `implemented/` category
```

### Example: Research Only

```markdown
# Investigation: Performance Optimization Options

## Conclusiones

Después de analizar 3 opciones de optimización (caching, indexing, query optimization),
determinamos que implementar índices en las columnas de búsqueda es la mejor solución.

Beneficio estimado: -40% en tiempos de consulta
Costo: 2 días de desarrollo
ROI: Alto

Recomendación: Priorizar para próximo sprint.

→ Triggers archival to `research/` category (default)
```

### Example: Obsolete Research

```markdown
# Proposal: Migrate to Redux State Management

## Estado: Obsoleto

Esta propuesta ya no aplica. El proyecto decidió mantener
el state management actual (Context API) por simplicidad.

Razón: Overhead de Redux no justificado para tamaño del proyecto.

Fecha de decisión: 2026-01-20

→ Triggers archival to `obsolete/` category
```

---

## Tips for Successful Archival

### 1. Always Add Completion Status

```markdown
# At end of any research/bug document

## Estado: ✅ Completado
## Estado: Obsoleto
## Conclusión: [Write detailed conclusion]
```

### 2. Use Rich Conclusions

```markdown
# Good - Triggers auto-archival
## Conclusiones

Después de investigación exhaustiva, determinamos que la causa raíz
del bug EMS-1234 es una race condition en el módulo de cash register.
Implementamos optimistic locking con version field, que resolvió el
problema completamente. Fix validado en producción por 7 días sin
recurrencia del issue. (> 100 characters)

# Bad - Won't trigger auto-archival
## Conclusiones

Fixed. (< 100 characters, lacks detail)
```

### 3. Extract Learnings Before Deletion

```markdown
# In session notes.md

## Learnings to Extract

- Pattern: Race condition solved with optimistic locking
- Testing: Use concurrent transaction simulation
- Deployment: Gradual rollout reduced risk

Action: Copy to .context/active/{domain}/current/ before cleanup
```

### 4. Maintain Archive Organization

```
.context/archive/bugs/
├── implemented/    # Fixes deployed to production
├── research/       # Investigations without implementation
└── obsolete/       # No longer relevant bugs

.context/archive/{domain}/
├── implemented/    # Features deployed
├── research/       # Completed research
└── obsolete/       # Abandoned/deprecated
```

---

*Last Updated: February 2026*  
*Related: context-lifecycle-manager SKILL.md*
