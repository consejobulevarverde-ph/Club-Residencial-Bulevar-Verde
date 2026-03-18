# Progressive Disclosure: Arquitectura de 3 Niveles

Sistema de carga inteligente de skills para proteger la ventana de contexto.

---

## 📊 Sistema de Tres Niveles

### Nivel 1: Descubrimiento (~100 tokens)

**Qué se carga**: Solo `name` y `description` del frontmatter

**Cuándo**: En el arranque de Copilot, antes de cualquier conversación

**Propósito**: Identificar qué skills están disponibles sin cargar todo

**Límite**: Puedes tener **cientos de skills** instaladas

**Ejemplo**:
```yaml
name: root-cause-analysis
description: |
  Methodology for performing root cause analysis using 5 Whys.
  Use when: analyzing WHY bugs occur, finding root causes,
  proposing fix strategies.
```

**💡 Regla de Oro**: Dedica **3× más tiempo** a la `description` que a cualquier otro campo.

**Checklist de Description Efectiva**:
- [ ] Explica QUÉ hace la skill (1 línea)
- [ ] Menciona CÓMO lo hace (opcional, 1 línea)
- [ ] Lista CUÁNDO usarla (triggers específicos)
- [ ] Incluye términos que usuarios dirían naturalmente
- [ ] Menciona patterns de entrada (ej: "EMS-1234", "5 Whys", "verify RCA")

---

### Nivel 2: Instrucciones (~2000-5000 tokens)

**Qué se carga**: El cuerpo completo de `SKILL.md` (después del frontmatter)

**Cuándo**: Cuando la description coincide con el contexto de la conversación

**Propósito**: Proveer instrucciones detalladas para ejecutar la skill

**Límite recomendado**: **< 5000 tokens** por SKILL.md

**Contenido típico**:
```markdown
# Skill Name

Core instructions here.

## When to Use

- Scenario 1
- Scenario 2

## How It Works

[Process description]

## Quick Reference

[Essential patterns]

## Resources Available

- [Checklist](references/checklist.md) ← Link, no incluir contenido
- [Template](references/template.md)   ← Link, no incluir contenido
```

**⚠️ Anti-Pattern**: Incluir todo el contenido de references/ en SKILL.md
- ❌ NO: Copiar templates completos en SKILL.md
- ✅ SÍ: Link a templates en subdirectorios

**Beneficio**: SKILL.md ligero = más skills cargables simultáneamente

---

### Nivel 3: Recursos (carga on-demand)

**Qué se carga**: Archivos en `scripts/`, `references/`, `assets/`

**Cuándo**: Solo cuando se mencionan explícitamente o son necesarios

**Propósito**: Material de soporte que no siempre se necesita

**Límite**: Sin límite (se carga selectivamente)

**Patrones de carga**:
```
# Usuario pide recurso específico
"Use the verification checklist from rca-verification"
→ Carga references/verification-checklist.md

# Usuario pide script
"Run the verification script"
→ Carga scripts/verify.py

# Copilot necesita template
(Interno) Genera verified-rca.md usando template
→ Carga references/verified-rca-template.md
```

---

## 📁 Diferencias: scripts/ vs references/ vs assets/

### scripts/ - Código Determinista

**Propósito**: Automatización ejecutable

**Contenido**:
- Scripts Python, Bash, JavaScript
- Validadores
- Generadores de código
- Procesadores de datos
- Deploy automático

**Cuándo usar**:
- ✅ Mismo código se repite frecuentemente
- ✅ Output de IA es variable (necesitas consistency)
- ✅ Tareas críticas que no pueden fallar
- ✅ Procesamiento de datos complejo

**Ejemplo**:
```python
# scripts/verify_rca.py
"""
Verifica que rca-report.md cumple con todos los requisitos.
"""
import sys
from pathlib import Path

def verify_rca(rca_path):
    # Lógica determinista de validación
    ...
```

**Carga**: Cuando se necesita ejecutar
```
Run the RCA verification script on rca-report.md
```

---

### references/ - Documentación para el Contexto

**Propósito**: Material que **informa el razonamiento** del agente

**Contenido**:
- Guías detalladas
- Checklists estructurados
- Templates de output
- Regulaciones/compliance
- Workflows paso a paso
- Patrones de diseño

**Cuándo usar**:
- ✅ Información que guía decisiones
- ✅ Conocimiento de dominio complejo
- ✅ Procesos que requieren juicio humano-asistido
- ✅ Documentación demasiado larga para SKILL.md

**Ejemplo**:
```markdown
# references/verification-checklist.md

## Pre-Verification Checklist

- [ ] RCA report exists
- [ ] Research verified
- [ ] Bug context complete

## 5 Whys Depth Check
...
```

**Carga**: Cuando se menciona o es relevante
```
Use the verification checklist from rca-verification
```

**⚠️ Regla Importante**: Un solo nivel desde SKILL.md
- ✅ SKILL.md → references/checklist.md ✅
- ❌ SKILL.md → references/guide.md → another-doc.md ❌ (no encadenar)

---

### assets/ - Recursos NO Cargados al Contexto

**Propósito**: Material que se **copia al output**, no informa razonamiento

**Contenido**:
- Templates para copiar (sin modificar)
- Boilerplate code
- Archivos de configuración predefinidos
- Imágenes/diagramas
- Datos de prueba (JSON, CSV)

**Cuándo usar**:
- ✅ Output completamente determinista
- ✅ Archivos que se copian tal cual
- ✅ No necesitan interpretación
- ✅ Binarios o archivos grandes

**Ejemplo**:
```
assets/
├── boilerplate.py          # Template de código
├── .eslintrc.json          # Config predefinida
├── diagram-workflow.png    # Imagen de referencia
└── test-data.json          # Datos de prueba
```

**Carga**: Copilot NO lee el contenido, solo lo copia
```
Copy the boilerplate.py from assets to src/
```

---

## 🔄 Flujo de Carga Completo

### Ejemplo: Usuario pide "Verify this RCA report"

```
┌─────────────────────────────────────────────┐
│ Nivel 1: Descubrimiento (Startup)          │
├─────────────────────────────────────────────┤
│ Copilot lee TODOS los frontmatters:        │
│ - bug-coordinator: "Orchestrates..."       │
│ - rca-verification: "Methods for           │
│   validating...Use when: reviewing RCA"    │ ← Match!
│ - root-cause-analysis: "Methodology..."    │
└─────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────┐
│ Nivel 2: Instrucciones (On-Match)          │
├─────────────────────────────────────────────┤
│ Copilot carga SKILL.md completo de:        │
│ rca-verification/SKILL.md                   │
│                                             │
│ - Core verification methodology            │
│ - Categories to verify                     │
│ - Quality guidelines                       │
│ - Links to references/ (no content)        │
└─────────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────────┐
│ Nivel 3: Recursos (On-Demand)              │
├─────────────────────────────────────────────┤
│ Usuario: "Use the checklist"               │
│ Copilot carga:                              │
│ references/verification-checklist.md        │
│                                             │
│ Copilot: "Creating verified-rca.md"        │
│ Copilot carga (automático):                │
│ references/verified-rca-template.md         │
└─────────────────────────────────────────────┘
```

**Total tokens cargados**:
- Nivel 1 (todas las skills): ~600 tokens (6 skills × 100)
- Nivel 2 (rca-verification): ~3000 tokens
- Nivel 3 (checklist + template): ~2000 tokens
- **Total**: ~5600 tokens

**Sin progressive disclosure**: 30,000+ tokens (todo cargado siempre)

**Ahorro**: **81% de contexto**

---

## 🎯 Comparación: references/ vs assets/

| Aspecto | references/ | assets/ |
|---------|-------------|---------|
| **Cargado al contexto** | ✅ Sí | ❌ No |
| **Propósito** | Informar decisiones | Copiar/usar directamente |
| **Cuándo usar** | Guías, checklists, procesos | Templates, configs, binarios |
| **IA lo lee** | ✅ Sí, para razonar | ❌ Solo copia |
| **Ejemplo** | `validation-guide.md` | `boilerplate.py` |
| **Modificable** | Sí (basado en contexto) | No (copia exacta) |

**Ejemplo Práctico**:

```
# references/rca-methodology.md (CARGADO)
## 5 Whys Technique

1. Start with fault
2. Ask "Why?" 5 times
3. Stop at fundamental cause
...
→ Copilot LEE esto y APLICA la metodología con juicio

# assets/rca-report-template.md (NO CARGADO)
# RCA Report: {TICKET-ID}

**Date**: {YYYY-MM-DD}
**Status**: {status}
...
→ Copilot COPIA esto textualmente sin leer el contenido
```

---

## 📏 Límites Recomendados por Nivel

| Nivel | Archivo | Tamaño Recomendado | Razón |
|-------|---------|-------------------|-------|
| 1 | `description` | ~100 tokens | Eficiencia de descubrimiento |
| 2 | `SKILL.md` | < 5000 tokens | Múltiples skills en contexto |
| 3 | `references/*.md` | Sin límite* | Carga selectiva |
| 3 | `scripts/*.py` | Sin límite* | Ejecución, no contexto |
| 3 | `assets/*` | Sin límite* | No se carga al contexto |

*Nota: "Sin límite" significa que no afecta contexto, pero mantener razonable (~10KB por archivo)

---

## 🚀 Optimización de Tokens

### ❌ Anti-Pattern: Todo en SKILL.md

```markdown
# rca-verification/SKILL.md (20,000 tokens)

## RCA Verification Skill

...

## Complete Verification Checklist

[3000 tokens de checklist completo]

## Verified RCA Template

[5000 tokens de template completo]

## Example RCA Reports

[8000 tokens de ejemplos]
```

**Problema**: Skill demasiado pesada → no se puede cargar con otras skills

---

### ✅ Pattern: Progressive Disclosure

```markdown
# rca-verification/SKILL.md (3,000 tokens)

## RCA Verification Skill

Core methodology here.

## Resources

- [Checklist](references/verification-checklist.md)
- [Template](references/verified-rca-template.md)
- [Examples](references/examples/)
```

**Beneficio**: Skill ligera → se carga con otras → Copilot tiene más contexto disponible

---

## 🎓 Best Practices

### 1. Description es el Vendedor

Dedica tiempo a hacer la description **irresistible** para Copilot:

```yaml
# ❌ Malo
description: Helps with bugs

# ⚠️ Regular
description: Validates root cause analyses

# ✅ Bueno
description: |
  Validates root cause analyses using 5 Whys methodology.
  Use when: reviewing RCA reports, checking root causes.

# 🎯 Excelente
description: |
  Methods for validating root cause analyses with structured checklists.
  Verifies 5 Whys depth, execution path accuracy, fix strategy soundness.
  Use when: reviewing RCA reports, validating RCA methodology, checking if
  root cause is fundamental, verifying file:line references, assessing
  fix strategies before implementation, or quality-checking RCA documents.
```

### 2. SKILL.md es el Manual Rápido

- ✅ Incluye lo esencial para usar la skill
- ✅ Links a recursos detallados
- ❌ NO incluye contenido completo de references/
- ❌ NO copies templates enteros

### 3. references/ es la Librería

- ✅ Guías detalladas paso a paso
- ✅ Checklists completos
- ✅ Templates de output
- ✅ Ejemplos complejos
- ❌ NO encadenes referencias (max 1 nivel)

### 4. scripts/ es la Automatización

- ✅ Código ejecutable
- ✅ Validación determinista
- ✅ Procesamiento de datos
- ❌ NO pongas lógica en SKILL.md que debería ser script

### 5. assets/ es el Almacén

- ✅ Archivos para copiar tal cual
- ✅ Boilerplate sin modificar
- ✅ Binarios e imágenes
- ❌ NO pongas docs que deben influir razonamiento

---

## 🔍 Debugging de Carga

### Skill No Se Activa

**Síntomas**: Mencionas el caso de uso pero skill no se carga

**Debug**:
1. **Verifica description**: ¿Menciona los términos que dijiste?
2. **Prueba explícito**: `@skill-name [request]`
3. **Revisa logs**: VS Code → Output → GitHub Copilot

**Fix común**:
```yaml
# Antes
description: Validates RCA reports

# Después (más triggers)
description: |
  Validates RCA reports using checklists.
  Use when: verify RCA, check RCA, validate root cause,
  review analysis, assess fix strategy
```

### Recursos No Se Cargan

**Síntomas**: SKILL.md carga pero references/ no

**Debug**:
1. Pide explícitamente: `"Use the checklist from skill-name"`
2. Verifica ruta en SKILL.md: `[link](references/file.md)`
3. Confirma archivo existe

---

## 📚 Resumen Ejecutivo

| Concepto | Propósito | Tamaño | Carga |
|----------|-----------|--------|-------|
| **description** | Disparador de activación | ~100 tokens | Startup |
| **SKILL.md body** | Manual rápido core | <5000 tokens | On-match |
| **references/** | Guías detalladas | Variable | On-demand |
| **scripts/** | Automatización | Variable | On-execute |
| **assets/** | Archivos copiables | Variable | On-copy |

**Regla de Oro**: 
- Nivel 1 vende → Nivel 2 enseña → Nivel 3 ejecuta

---

**Version**: 1.0  
**Based on**: Module 10 - Agent Skills Standard  
**Last Updated**: February 2026
