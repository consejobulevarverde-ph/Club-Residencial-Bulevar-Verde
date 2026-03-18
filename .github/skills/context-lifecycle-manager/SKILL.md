---
name: context-lifecycle-manager
description: Automates lifecycle of artifacts in .context repository during bug-fixing workflows. Integrates with lifecycle_automation.py script for archival, cleanup, and health monitoring. Archives completed bugs, cleans old sessions (14+ days), detects stale plans (90+ days), provides health metrics, and executes maintenance tasks. Use when bug fix complete (handoff from bug-coordinator Phase 7), session finished, context health check needed, or monthly repository maintenance.
license: MIT
compatibility:
  - github-copilot
  - claude-code
  - cursor
metadata:
  author: Green-POS
  version: 1.0
  related-skills:
    - bug-coordinator
    - jira-bug-fetcher
    - root-cause-analysis
---

# Context Lifecycle Manager

Automates maintenance and lifecycle operations for the `.context` repository during bug-fixing workflows and general development.

## Core Purpose

This skill integrates with the existing `lifecycle_automation.py` script (573 lines) in `.context/scripts/` to provide automated artifact management. It acts as the **final phase** of bug-fixing workflows, ensuring completed work is properly archived and workspace remains clean.

## When to Use

### 1. Post-Bug-Fix Archival (Automatic Handoff)

After bug coordinator completes Phase 7:
```
@bug-coordinator EMS-1234
  → Phase 1-7 complete
  → Handoff to @context-lifecycle-manager archive EMS-1234
```

**Result**: Bug artifacts moved to archive preserving full history.

### 2. Manual Cleanup

```
@context-lifecycle-manager clean sessions older than 14 days
@context-lifecycle-manager health check
@context-lifecycle-manager archive bug EMS-1234
```

### 3. Monthly Maintenance

First Friday of each month:
```
@context-lifecycle-manager full cleanup
```

## Operations

### Archive Completed Bug

**Command:**
```bash
python .context/scripts/lifecycle_automation.py --archive-research --execute
```

**What happens:**
1. Scans `.context/active/bugs/{TICKET-ID}/` for completion markers:
   - "Estado: Completado"
   - "Conclusión:" section with > 100 chars
   - "Hipótesis validada" or "Hipótesis refutada"

2. Determines archive category:
   - `implemented/` - Bug fixed and deployed
   - `research/` - Investigation completed but not implemented
   - `obsolete/` - Bug no longer relevant

3. Moves entire directory preserving structure:
   ```
   .context/active/bugs/EMS-1234/
     → .context/archive/bugs/implemented/EMS-1234/
   ```

4. Logs action with timestamp and reason

**Dry-run mode:**
```bash
python .context/scripts/lifecycle_automation.py --archive-research --check
```

### Clean Old Sessions

**Command:**
```bash
python .context/scripts/lifecycle_automation.py --clean-sessions --session-age 14 --execute
```

**What happens:**
1. Finds sessions in `.context/sessions/` older than threshold (default: 7 days, configurable: 14 days)

2. **Checks for unextracted learnings** before deletion:
   - Looks for "## Learnings to Extract" section
   - If found with content, **session is preserved** and warning displayed

3. Deletes sessions without learnings

4. Reports deleted sessions count

**Safety:** Sessions with learnings are NEVER auto-deleted.

### Detect Stale Plans

**Command:**
```bash
python .context/scripts/lifecycle_automation.py --detect-stale --plan-age 90
```

**What happens:**
1. Scans `.context/active/{domain}/plans/active/` for plans older than threshold (default: 90 days)

2. Extracts date from filename: `YYYY-MM-DD-*.md`

3. Checks DoD completion:
   - Counts `- [x]` vs `- [ ]` checkboxes
   - Completion rate ≥ 80% = "DoD complete"

4. Reports stale plans with:
   - Age in days
   - DoD status
   - Domain
   - Suggested actions (archive, complete, or abandon)

**Example output:**
```
⚠️  Encontrados 2 plans antiguos sin implementar:

   - [inventory] 2025-11-15-implementar-stock-minimo.md
     Antigüedad: 110 días | ❌ DoD incompleto
     Path: .context/active/inventory/plans/active/...
```

### Health Check

**Command:**
```bash
python .context/scripts/lifecycle_automation.py --health-check
```

**Metrics calculated:**

1. **Freshness Ratio** - % of active docs modified in last 90 days
   - 🟢 > 70% - Excellent
   - 🟡 60-70% - Good
   - 🟠 40-60% - Needs attention
   - 🔴 < 40% - Critical

2. **Orphan Rate** - % of docs not referenced from any README
   - 🟢 < 5% - Excellent
   - 🟡 5-10% - Good
   - 🟠 10-20% - Needs attention
   - 🔴 > 20% - Critical

3. **Statistics:**
   - Total docs (active + archive + sessions)
   - Docs by domain
   - READMEs coverage (X/11 domains)
   - Old sessions count (> 14 days)

**Example output:**
```
📊 MÉTRICAS CORE

2. Freshness Ratio:         68%      🟡 (target: > 60%)
3. Orphan Rate:             8%       🟡 (target: < 10%)

🏆 ESTADO GENERAL: SALUDABLE

📋 ESTADÍSTICAS ADICIONALES

Total Documentos:           145
- Active:                   78
- Archive:                  52
- Sessions:                 15 (⚠️  3 > 14 días)

⚠️  ACCIONES RECOMENDADAS

1. [URGENTE] 🔴 Cerrar 3 session(es) > 14 días
2. [IMPORTANTE] ⚠️ Actualizar 2 README(s) desactualizados (> 30 días)
```

### Full Cleanup

**Command:**
```bash
python .context/scripts/lifecycle_automation.py --full-cleanup --execute
```

**Executes all tasks:**
1. Archive completed research
2. Clean old sessions (7 days threshold)
3. Detect stale plans (90 days threshold)
4. Suggest maintenance tasks

**Use for:** Monthly maintenance routine.

## Integration with Bug Coordinator

### Automatic Handoff (Phase 8)

**Bug Coordinator SKILL.md includes:**

```markdown
## Phase 8: Artifact Archival (Handoff to Context Lifecycle Manager)

After fix is deployed and validated, automatically trigger archival:

**Trigger:**
```
@context-lifecycle-manager archive {TICKET-ID}
```

**What gets archived:**
- bug-context.md
- research/ directory (hypothesis, codebase-research, verified-research)
- rca-report.md
- verified-rca.md
- implementation-plan.md
- fix-summary.md

**Result:** Clean workspace for next bug, preserved history in archive.
```

### Manual Override

If automatic handoff doesn't trigger:
```
User: "Archive the completed bug EMS-1234"
Agent: Executes lifecycle_automation.py --archive-research for EMS-1234
```

## Script Integration Details

### lifecycle_automation.py Interface

**Location:** `.context/scripts/lifecycle_automation.py`

**Main class:**
```python
class LifecycleAutomation:
    def __init__(self, dry_run: bool = True)
    
    def archive_completed_research() -> List[Path]
    def clean_old_sessions(max_age_days: int) -> List[Path]
    def detect_stale_plans(max_age_days: int) -> List[Dict]
    def suggest_maintenance_tasks() -> Dict
    def full_cleanup()
    def health_check() -> Dict
```

**Invocation from skill:**

```python
# Dry-run first
result = subprocess.run([
    'python', '.context/scripts/lifecycle_automation.py',
    '--archive-research',
    '--check'
], capture_output=True)

# Show user what would happen
print(result.stdout.decode())

# If approved, execute
if user_confirms:
    subprocess.run([
        'python', '.context/scripts/lifecycle_automation.py',
        '--archive-research',
        '--execute'
    ])
```

## Completion Markers

### Research Auto-Archive Triggers

Script looks for these markers in markdown files:

```markdown
Estado: Completado
Estado: ✅ Completado

## Conclusiones
[Content > 100 characters]

Hipótesis validada
Hipótesis refutada
```

### Archive Categories

**implemented/**
- Bug fixed and deployed to production
- Feature implemented successfully
- Keywords: "implementado", "deployed", "en producción", "feature completada"

**research/**
- Investigation completed
- No implementation required/planned
- Default category

**obsolete/**
- Bug no longer relevant
- Feature abandoned
- Keywords: "obsoleto", "deprecado", "ya no aplica", "descartado"

## Error Handling

### Script Not Found

```
❌ ERROR: lifecycle_automation.py not found

Expected location: .context/scripts/lifecycle_automation.py

Please verify:
1. Script exists in .context/scripts/
2. Current working directory is project root
3. .context directory structure is intact

Try: cd to project root and retry
```

### Python Environment Issues

```
⚠️ WARNING: Python environment not activated

The script requires Python 3.8+ with no external dependencies.

If you see import errors, verify:
1. Python 3.8+ is installed
2. Virtual environment is activated (if used)

Try: python --version
```

### Permission Denied

```
❌ ERROR: Permission denied

Cannot write to .context/archive/

Please verify:
1. You have write permissions to .context/
2. Directory is not read-only
3. No file locks exist

Try: Check file system permissions
```

## Output Examples

### Successful Archival

```
📦 Archivando Research Completados
============================================================

✅ Archivado: 2025-11-24-causa-raiz-filenotfounderror-migracion-produccion.md → implemented/
✅ Archivado: 2025-12-05-implementacion-notas-credito-propuesta.md → implemented/

📊 Total archivados: 2
```

### Session Cleanup with Warning

```
🧹 Limpiando Sesiones Antiguas (> 14 días)
============================================================

⚠️  2025-12-15-debugging-cash-register (49 días) - TIENE LEARNINGS SIN EXTRAER
   Revisa manualmente antes de eliminar.

✅ Eliminado: 2025-11-10-test-session (85 días)

📊 Total limpiadas: 1
```

### Health Check Summary

```
Context Repository Health Check
Fecha: 2026-02-03 10:30 AM
============================================================

📊 MÉTRICAS CORE

2. Freshness Ratio:         72%      🟢 (target: > 60%)
3. Orphan Rate:             4%       🟢 (target: < 10%)

============================================================
🏆 ESTADO GENERAL: SALUDABLE
============================================================

✅ No hay acciones pendientes. Repositorio en buen estado.

Próximo health check: 2026-03-07 (primer viernes)
```

## Best Practices

### 1. Always Dry-Run First

```bash
# See what would happen
python .context/scripts/lifecycle_automation.py --archive-research --check

# Then execute if looks good
python .context/scripts/lifecycle_automation.py --archive-research --execute
```

### 2. Extract Learnings Before Cleanup

Before running session cleanup:
1. Review sessions > 7 days
2. Extract important learnings to active/ or archive/
3. Mark as extracted in session notes
4. Then run cleanup

### 3. Monthly Health Check Schedule

**First Friday of each month:**
```
@context-lifecycle-manager health check
@context-lifecycle-manager detect stale plans
@context-lifecycle-manager suggest maintenance
```

### 4. Preserve Bug History

Never manually delete from `.context/active/bugs/` - always use archival:
- Preserves full artifact set
- Maintains references
- Enables future learning from past bugs

### 5. Review Stale Plans Quarterly

Every 90 days:
```
@context-lifecycle-manager detect stale plans
```

Then for each stale plan:
- ✅ Implemented but not marked → Move to plans/completed/
- ❌ Abandoned → Move to archive/obsolete/
- 🔄 In progress → Update DoD checkboxes
- ⏸️ On hold → Add "On Hold" marker with reason

## References

- [lifecycle_automation.py Script](../../../.context/scripts/lifecycle_automation.py)
- [Context Repository Guide](../../../.context/README.md)
- [Archival Examples](references/archival-examples.md)
- [Health Check Metrics](references/health-metrics-guide.md)

## Related Skills

- **bug-coordinator** - Orchestrates 7-phase workflow, hands off to this skill for archival
- **jira-bug-fetcher** - Creates initial artifacts in .context/active/bugs/
- **root-cause-analysis** - Produces artifacts that get archived
