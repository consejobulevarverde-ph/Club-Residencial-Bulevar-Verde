# Context Lifecycle Manager

**Agent Skill for automating .context repository maintenance during bug-fixing and development workflows**

## Overview

The Context Lifecycle Manager integrates with Green-POS's existing `lifecycle_automation.py` script (573 LOC) to automate artifact management, session cleanup, and health monitoring of the `.context` repository. It serves as the **final phase (Phase 8)** of bug-fixing workflows, ensuring clean workspace and preserved history.

## Problem Solved

**Before this skill:**
- 🗑️ Manual archival of completed bugs → artifacts accumulate in active/
- ⏰ Forgotten sessions → context bloat
- 📊 No visibility into repository health
- 🔍 Stale plans without tracking
- 🤷 No integration with bug-coordinator workflow

**After this skill:**
- ✅ Automatic archival handoff from bug-coordinator Phase 7
- 🧹 Scheduled session cleanup (configurable age threshold)
- 📈 Health metrics with actionable recommendations
- 🔎 Stale plan detection with DoD status
- 🔗 Seamless integration with bug-fixing workflow

## When to Use

### 1. Automatic Handoff (Recommended)

Bug coordinator automatically triggers after Phase 7:
```
@bug-coordinator EMS-1234
  → Phases 1-7 complete
  → @context-lifecycle-manager archive EMS-1234
```

### 2. Manual Operations

```
# Archive single bug
@context-lifecycle-manager archive bug EMS-1234

# Clean old sessions
@context-lifecycle-manager clean sessions older than 14 days

# Health check
@context-lifecycle-manager health check

# Detect stale plans
@context-lifecycle-manager detect stale plans

# Full cleanup
@context-lifecycle-manager full cleanup
```

### 3. Scheduled Maintenance

**Monthly routine (first Friday):**
```
@context-lifecycle-manager health check
@context-lifecycle-manager detect stale plans
@context-lifecycle-manager clean sessions older than 30 days
```

## Core Operations

### Archive Completed Bug

**Moves artifacts from active/ to archive/ preserving structure:**

```
.context/active/bugs/EMS-1234/
├── bug-context.md
├── research/
│   ├── hypothesis.md
│   ├── codebase-research.md
│   └── verified-research.md
├── rca-report.md
├── verified-rca.md
├── implementation-plan.md
└── fix-summary.md

→ .context/archive/bugs/implemented/EMS-1234/
  (entire directory moved, structure preserved)
```

**Archive categories:**
- `implemented/` - Bug fixed and deployed (default)
- `research/` - Investigation completed, no implementation
- `obsolete/` - Bug no longer relevant

### Clean Old Sessions

**Deletes sessions older than threshold (default: 7 days, configurable: 14-30 days)**

**Safety checks:**
- ✅ Scans for "## Learnings to Extract" section
- ✅ If learnings found → preserves session + shows warning
- ✅ Only deletes sessions without unextracted learnings

**Example:**
```bash
python .context/scripts/lifecycle_automation.py \
  --clean-sessions \
  --session-age 14 \
  --execute
```

### Health Check

**Calculates repository health metrics:**

**Freshness Ratio** - % docs modified in last 90 days
- 🟢 > 70% - Excellent, active repository
- 🟡 60-70% - Good, minor cleanup needed
- 🟠 40-60% - Needs attention, many stale docs
- 🔴 < 40% - Critical, major cleanup required

**Orphan Rate** - % docs not referenced from READMEs
- 🟢 < 5% - Excellent, well-referenced
- 🟡 5-10% - Good, few orphans
- 🟠 10-20% - Needs attention, add references
- 🔴 > 20% - Critical, many orphaned docs

**Statistics:**
- Total docs breakdown (active/archive/sessions)
- Docs per domain
- READMEs coverage (X/11 domains)
- Old sessions count (> 14 days)

**Actionable recommendations:**
1. Close sessions > 14 days (URGENTE)
2. Update READMEs > 30 days (IMPORTANTE)
3. Create missing READMEs (NORMAL)
4. Archive obsolete docs (low freshness)
5. Add references (high orphan rate)

### Detect Stale Plans

**Finds plans in active/ older than threshold (default: 90 days)**

**Reports:**
- Age in days
- DoD completion status (% of checkboxes marked)
- Domain
- Suggested action (complete, archive, or abandon)

**Example output:**
```
⚠️  Encontrados 2 plans antiguos sin implementar:

   - [inventory] 2025-11-15-implementar-stock-minimo.md
     Antigüedad: 110 días | ❌ DoD incompleto
     Path: .context/active/inventory/plans/active/...

   - [sales] 2025-10-05-optimizar-busqueda-productos.md
     Antigüedad: 151 días | ✅ DoD completo
     Path: .context/active/sales/plans/active/...

💡 Acciones sugeridas:
   1. Revisar si plan está implementado → mover a plans/completed/
   2. Revisar si plan fue abandonado → mover a archive/obsolete/
   3. Actualizar DoD si plan está en progreso
```

## Script Integration

### lifecycle_automation.py Interface

**Location:** `.context/scripts/lifecycle_automation.py` (573 lines)

**Main operations:**
```python
class LifecycleAutomation:
    def archive_completed_research() -> List[Path]
    def clean_old_sessions(max_age_days: int) -> List[Path]
    def detect_stale_plans(max_age_days: int) -> List[Dict]
    def suggest_maintenance_tasks() -> Dict
    def full_cleanup()
    def health_check() -> Dict
```

**Command-line flags:**
```bash
# Dry-run (default, no changes)
--check

# Execute changes
--execute

# Operations
--archive-research      # Archive completed research
--clean-sessions        # Clean old sessions
--detect-stale          # Detect stale plans
--suggest               # Suggest maintenance tasks
--full-cleanup          # All operations
--health-check          # Health metrics

# Thresholds
--session-age DAYS      # Session max age (default: 7)
--plan-age DAYS         # Plan max age (default: 90)
```

**Invocation pattern:**

```bash
# 1. Always dry-run first
python .context/scripts/lifecycle_automation.py --archive-research --check

# 2. Review output

# 3. Execute if looks good
python .context/scripts/lifecycle_automation.py --archive-research --execute
```

## Integration with Bug Coordinator

### Phase 8 Handoff

**Bug Coordinator SKILL.md updated with:**

```markdown
## Phase 8: Artifact Archival

After Phase 7 completes (fix deployed and validated):

**Automatic handoff:**
@context-lifecycle-manager archive {TICKET-ID}

**What gets archived:**
- Complete .context/active/bugs/{TICKET-ID}/ directory
  ├── bug-context.md
  ├── research/ (all hypothesis, codebase research)
  ├── rca-report.md
  ├── verified-rca.md
  ├── implementation-plan.md
  └── fix-summary.md

**Result:**
- Clean active/ workspace for next bug
- Full history preserved in archive/bugs/implemented/
- Context freed for new work
```

### Workflow Diagram

```
Bug Fix Workflow with Context Lifecycle Manager

Phase 1: Fetch           @jira-bug-fetcher
  ↓ creates bug-context.md
Phase 2: Research        @codebase-research
  ↓ creates research/
Phase 3: Hypothesize     (manual with agent)
  ↓ validates hypothesis
Phase 4: RCA             @root-cause-analysis
  ↓ creates rca-report.md
Phase 5: Verify RCA      @rca-verification
  ↓ creates verified-rca.md
Phase 6: Plan Fix        @bug-planner
  ↓ creates implementation-plan.md
Phase 7: Implement       @bug-implementer
  ↓ creates fix-summary.md
Phase 8: Archive         @context-lifecycle-manager ⭐ NEW
  ↓ moves to archive/bugs/implemented/

Result: Clean workspace, preserved history
```

## Completion Markers

### Auto-Archive Triggers

Script looks for these markers in markdown:

```markdown
Estado: Completado
Estado: ✅ Completado

## Conclusiones
[Content with > 100 characters indicates complete research]

Hipótesis validada
Hipótesis refutada
```

**Any of these triggers automatic archival when running `--archive-research`**

### Category Detection

**implemented/** (primary category):
```markdown
Keywords in content:
- "implementado"
- "deployed"
- "en producción"
- "feature completada"
```

**obsolete/**:
```markdown
Keywords in content:
- "obsoleto"
- "deprecado"
- "ya no aplica"
- "descartado"
```

**research/** (default):
- No specific keywords
- Completed investigation without implementation

## Best Practices

### 1. Dry-Run Before Execution

**Always run `--check` first to see what would change:**

```bash
# Good workflow
$ python .context/scripts/lifecycle_automation.py --archive-research --check
[DRY-RUN] Archivaría: .context/active/bugs/EMS-1234/...
          Destino: .context/archive/bugs/implemented/EMS-1234/

# Review output, then execute
$ python .context/scripts/lifecycle_automation.py --archive-research --execute
✅ Archivado: EMS-1234/ → implemented/
```

### 2. Extract Learnings Before Cleanup

**Before deleting sessions:**

```markdown
1. Review .context/sessions/ for sessions > 7 days
2. Check "## Learnings to Extract" section
3. Move important learnings to:
   - .context/active/{domain}/ for current features
   - .context/archive/ for historical knowledge
4. Mark in session: "Learnings extracted on YYYY-MM-DD"
5. Then run cleanup
```

### 3. Monthly Maintenance Routine

**First Friday of each month:**

```bash
# 1. Health check
@context-lifecycle-manager health check

# 2. Review stale plans
@context-lifecycle-manager detect stale plans

# 3. Clean sessions (stricter threshold for monthly)
@context-lifecycle-manager clean sessions older than 30 days

# 4. Archive completed research
@context-lifecycle-manager full cleanup
```

### 4. Preserve Bug History

**Never manually delete from .context/active/bugs/**

Instead:
```
✅ Use archival: @context-lifecycle-manager archive bug EMS-1234
❌ Don't: rm -rf .context/active/bugs/EMS-1234/
```

**Why:**
- ✅ Preserves complete artifact set
- ✅ Maintains internal references
- ✅ Enables learning from past bugs
- ✅ Supports future pattern analysis

### 5. Review Stale Plans Quarterly

**Every 90 days:**

```
@context-lifecycle-manager detect stale plans
```

**Then for each stale plan:**
- ✅ Implemented → Move to `plans/completed/`
- ❌ Abandoned → Move to `archive/obsolete/`
- 🔄 In progress → Update DoD checkboxes
- ⏸️ On hold → Add "## Status: On Hold" with reason

## Example Usage Scenarios

### Scenario 1: Complete Bug Fix Workflow

```
User: @bug-coordinator EMS-1234
Agent: [Executes Phases 1-7]
       Phase 7 complete: Fix deployed successfully ✅
       
       Triggering Phase 8: Artifact archival
       @context-lifecycle-manager archive EMS-1234

Agent: [Executes archival]
       ✅ Archived: .context/active/bugs/EMS-1234/
       → .context/archive/bugs/implemented/EMS-1234/
       
       Bug fix workflow complete. Workspace cleaned.
```

### Scenario 2: Monthly Maintenance

```
User: @context-lifecycle-manager health check

Agent: Context Repository Health Check
       Fecha: 2026-02-07 09:00 AM
       ============================================================
       
       📊 MÉTRICAS CORE
       
       Freshness Ratio:         68%      🟡 (target: > 60%)
       Orphan Rate:             12%      🟠 (target: < 10%)
       
       ⚠️  ESTADO GENERAL: REQUIERE ATENCIÓN
       
       ⚠️  ACCIONES RECOMENDADAS
       
       1. [IMPORTANTE] ⚠️ Agregar referencias a docs huérfanos (orphan rate: 12%)
       2. [IMPORTANTE] ⚠️ Actualizar 3 README(s) desactualizados (> 30 días)

User: @context-lifecycle-manager detect stale plans

Agent: 🔍 Detectando Plans Sin Implementar (> 90 días)
       
       ⚠️  Encontrados 1 plan antiguo:
       
       - [inventory] 2025-10-15-implementar-inventario-periodico.md
         Antigüedad: 115 días | ❌ DoD incompleto
       
       💡 Revisar si plan fue abandonado → mover a archive/obsolete/
```

### Scenario 3: Session Cleanup

```
User: @context-lifecycle-manager clean sessions older than 14 days

Agent: 🧹 Limpiando Sesiones Antiguas (> 14 días)
       
       ⚠️  2025-12-20-debugging-notes (45 días) - TIENE LEARNINGS SIN EXTRAER
          Revisa manualmente antes de eliminar.
       
       ✅ Eliminado: 2025-11-15-test-session (80 días)
       ✅ Eliminado: 2025-11-22-spike-research (73 días)
       
       📊 Total limpiadas: 2 sesiones
       
       ⚠️  1 sesión preservada por learnings pendientes

User: I'll review the learnings first

Agent: Good practice! Extract important learnings to:
       - .context/active/{domain}/ for ongoing work
       - .context/archive/ for historical knowledge
       
       Then re-run cleanup after extraction.
```

## Troubleshooting

### Script Not Found

```
❌ ERROR: lifecycle_automation.py not found

Solution:
1. Verify location: .context/scripts/lifecycle_automation.py
2. Check CWD is project root: pwd or cd
3. Verify .context structure exists
```

### Permission Denied

```
❌ ERROR: Permission denied on .context/archive/

Solution:
1. Check write permissions: ls -la .context/
2. Verify directory not read-only
3. No file locks: lsof | grep .context (Linux/Mac)
```

### Python Import Error

```
⚠️ ImportError: No module named 'pathlib'

Solution:
Script uses only Python stdlib (no external deps)
Requires Python 3.8+

Check: python --version
Should be: Python 3.8.0 or higher
```

## Output Examples

### Successful Archival

```
📦 Archivando Research Completados
============================================================

✅ Archivado: EMS-1234-causa-raiz-login-failure.md → implemented/
✅ Archivado: EMS-1235-investigacion-performance.md → research/

📊 Total archivados: 2
```

### Health Check - Healthy State

```
Context Repository Health Check
Fecha: 2026-02-03 10:30 AM
============================================================

📊 MÉTRICAS CORE

Freshness Ratio:         72%      🟢 (target: > 60%)
Orphan Rate:             4%       🟢 (target: < 10%)

============================================================
🏆 ESTADO GENERAL: SALUDABLE
============================================================

✅ No hay acciones pendientes. Repositorio en buen estado.

Próximo health check: 2026-03-07 (primer viernes)
```

### Health Check - Needs Attention

```
Context Repository Health Check
============================================================

📊 MÉTRICAS CORE

Freshness Ratio:         55%      🟠 (target: > 60%)
Orphan Rate:             15%      🟠 (target: < 10%)

⚠️  ESTADO GENERAL: REQUIERE ATENCIÓN

⚠️  ACCIONES RECOMENDADAS

1. [URGENTE] 🔴 Cerrar 5 session(es) > 14 días
2. [IMPORTANTE] ⚠️ Archivar docs obsoletos (freshness ratio: 55%)
3. [IMPORTANTE] ⚠️ Agregar referencias a docs huérfanos (orphan rate: 15%)
```

## Metrics Reference

### Freshness Ratio Formula

```
freshness_ratio = (docs_modified_in_90_days / total_active_docs) × 100

Example:
Active docs: 100
Modified in 90 days: 68
Freshness ratio: 68%  🟡 (Good, minor cleanup needed)
```

### Orphan Rate Formula

```
orphan_rate = (docs_not_referenced_in_readmes / total_docs) × 100

Example:
Total docs: 100
Referenced in READMEs: 88
Orphan rate: 12%  🟠 (Needs attention, add references)
```

### DoD Completion Rate

```
dod_completion = (checked_boxes / total_boxes) × 100

Threshold: ≥ 80% = "DoD complete"

Example:
- [x] Task 1
- [x] Task 2
- [x] Task 3
- [ ] Task 4
- [ ] Task 5

Completion: 60% (3/5)  ❌ DoD incomplete
```

## References

- [lifecycle_automation.py Script](.context/scripts/lifecycle_automation.py) - 573 LOC main automation
- [Context Repository Guide](.context/README.md) - Overall structure
- [GOVERNANCE.md](.context/GOVERNANCE.md) - Lifecycle policies
- [Archival Examples](references/archival-examples.md) - Real-world examples
- [Health Metrics Guide](references/health-metrics-guide.md) - Metric details

## Related Skills

- **bug-coordinator** - Orchestrates bug fix workflow, Phase 8 hands off here
- **jira-bug-fetcher** - Creates initial artifacts in .context/active/bugs/
- **root-cause-analysis** - Produces rca-report.md that gets archived
- **rca-verification** - Produces verified-rca.md that gets archived

---

*Skill Version: 1.0*  
*Last Updated: February 2026*  
*Maintainer: Green-POS Project*  
*Compliance: Agent Skills Standard v1.0 (M10) ✅*
