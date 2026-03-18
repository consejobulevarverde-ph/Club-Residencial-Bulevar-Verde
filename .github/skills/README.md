# Agent Skills Repository

Capacidades de IA portables y reutilizables siguiendo el estándar abierto de Agent Skills.

## 🎯 ¿Qué son las Agent Skills?

Las **Agent Skills** son paquetes de conocimiento especializados que:

- **Encapsulan expertise de dominio** - No repites contexto en cada conversación
- **Se cargan bajo demanda** - Solo cuando son relevantes (eficiencia de contexto)
- **Son portables** - Funcionan en GitHub Copilot, Claude Code, Cursor, etc.
- **Incluyen recursos** - Instrucciones + scripts + templates + referencias

## 📂 Skills Disponibles

| Skill | Descripción | Fase |
|-------|-------------|------|
| [bug-coordinator](bug-coordinator/) | Orquesta workflow completo de bug fixing en 8 fases | Workflow |
| [jira-bug-fetcher](jira-bug-fetcher/) | Fetch tickets de Jira con Atlassian MCP | Fase 1 |
| [codebase-research](codebase-research/) | Investiga codebase modo documentarian | Fase 2 |
| [root-cause-analysis](root-cause-analysis/) | Análisis 5 Whys para identificar causas | Fase 4 |
| [rca-verification](rca-verification/) | Valida RCAs con checklists estructurados | Fase 5 |
| [bug-fix-testing](bug-fix-testing/) | Patterns para tests de regresión | Fase 7 |
| [context-lifecycle-manager](context-lifecycle-manager/) | Automatiza archival y mantenimiento de .context | Fase 8 |

## 🔄 Workflow Completo de Bug Fixing (8 Fases)

```
Usuario: "@bug-coordinator EMS-1234"

┌─────────────────────────────────────────────────────────────────┐
│ Fase 1: Fetch (jira-bug-fetcher)                               │
│ ✅ Crea .context/active/bugs/EMS-1234/bug-context.md          │
└────────────────────────┬────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│ Fase 2: Research (codebase-research)                           │
│ ✅ Investiga codebase, crea research/ directory                │
└────────────────────────┬────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│ Fase 3: Hypothesize (manual con agent)                         │
│ ✅ Valida hypothesis.md                                         │
└────────────────────────┬────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│ Fase 4: Root Cause Analysis (root-cause-analysis)              │
│ ✅ Aplica 5 Whys, crea rca-report.md                           │
└────────────────────────┬────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│ Fase 5: Verify RCA (rca-verification)                          │
│ ✅ Valida con checklist, crea verified-rca.md                  │
└────────────────────────┬────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│ Checkpoint Humano: Revisar RCA verificado                       │
└────────────────────────┬────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│ Fase 6: Plan Fix (bug-planner)                                 │
│ ✅ Crea implementation-plan.md con estrategia                   │
└────────────────────────┬────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│ Checkpoint Humano: Aprobar plan de implementación              │
└────────────────────────┬────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│ Fase 7: Implement (bug-implementer)                            │
│ ✅ Ejecuta fix, crea fix-summary.md                            │
└────────────────────────┬────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────────┐
│ Fase 8: Archive (context-lifecycle-manager) ⭐ NUEVO            │
│ ✅ Archiva .context/active/bugs/EMS-1234/ → archive/implemented/│
│ ✅ Limpia workspace, preserva historia                          │
└─────────────────────────────────────────────────────────────────┘

Resultado: 🎉 Bug completo + workspace limpio + historia preservada
```

**Beneficios del workflow automatizado:**
- ✅ Zero steps manuales (salvo 2 checkpoints humanos)
- ✅ Consistencia garantizada (mismo proceso siempre)
- ✅ Artifacts preservados (full history en archive)
- ✅ Workspace limpio (ready para siguiente bug)
- ✅ Health metrics (freshness ratio, orphan rate)

## 🏗️ Arquitectura: Progressive Disclosure

Cada skill sigue el patrón de **progressive disclosure** - información organizada en capas para proteger la ventana de contexto.

**📚 Documento completo**: [PROGRESSIVE_DISCLOSURE.md](PROGRESSIVE_DISCLOSURE.md)

### Sistema de 3 Niveles

1. **Nivel 1: Descubrimiento** (~100 tokens)
   - Solo `name` + `description` del frontmatter
   - Se carga al startup de Copilot
   - Determina qué skills están disponibles
   - Puedes tener **cientos de skills** sin overhead

2. **Nivel 2: Instrucciones** (~2000-5000 tokens)
   - Cuerpo completo de `SKILL.md`
   - Se carga cuando `description` coincide con contexto
   - Límite recomendado: **< 5000 tokens**
   - Permite cargar múltiples skills simultáneamente

3. **Nivel 3: Recursos** (on-demand, sin límite)
   - `scripts/`, `references/`, `assets/`
   - Solo se carga cuando se menciona explícitamente
   - No consume contexto hasta que se necesita
   - Protección total de la ventana de contexto

**Beneficio**: Ahorro de **81% de contexto** vs. cargar todo siempre

```
skill-name/
├── SKILL.md          # 🎯 Entry point (lo que lee Copilot primero)
│                     #    - Frontmatter con name + description
│                     #    - Instrucciones core esenciales
│                     #    - Links a recursos detallados
│
├── README.md         # 📖 Para humanos (cómo usar la skill)
│
├── scripts/          # ⚙️ Ejecutables (Python, Bash, JS)
│   ├── verify.py
│   └── generate.sh
│
├── references/       # 📚 Material de referencia
│   ├── checklists/
│   ├── guides/
│   └── templates/
│
└── assets/           # 🖼️ Recursos estáticos
    ├── diagrams/
    └── examples/
```

### Capas de Información

1. **SKILL.md** (Core) → Siempre leído por Copilot
   - ¿Qué hace? ¿Cuándo usar?
   - Instrucciones esenciales
   - Referencias a recursos

2. **scripts/** → Código ejecutable (on-demand)
   - Automatización determinista
   - Validación scripts
   - Procesamiento de datos
   - **Cuándo usar**: Mismo código se repite, output de IA variable, tareas críticas

3. **references/** → Material de referencia (on-demand)
   - Templates y checklists
   - Guías detalladas
   - Ejemplos complejos
   - **Cuándo usar**: Información que INFORMA el razonamiento del agente

4. **assets/** → Recursos estáticos (on-copy, no cargado a contexto)
   - Diagramas, imágenes
   - Boilerplate para copiar
   - Configs predefinidas
   - **Cuándo usar**: Archivos que se COPIAN tal cual, no informan decisiones

**Diferencia clave**:
- `references/` → IA **lee y razona** con el contenido
- `assets/` → IA **copia** el contenido sin leerlo

Ver detalles: [PROGRESSIVE_DISCLOSURE.md - Diferencias](PROGRESSIVE_DISCLOSURE.md#-diferencias-scripts-vs-references-vs-assets)

## 📝 Estándar del Frontmatter (SKILL.md)

Cada `SKILL.md` debe tener frontmatter YAML:

```yaml
---
name: skill-name              # REQUERIDO - kebab-case
description: |                # REQUERIDO - Cuándo activar
  Brief description of what the skill does.
  Use when [specific trigger scenarios].
license: MIT                  # OPCIONAL
compatibility: |              # OPCIONAL
  VS Code Insiders with GitHub Copilot
metadata:                     # OPCIONAL
  author: Green-POS
  version: "1.0"
  related-skills: other-skill
---
```

### ⚡ Campo Crítico: `description`

La **description** es el principal disparador de activación:

💡 **Regla M10**: Dedica **3× más tiempo** a la `description` que a cualquier otro campo.

✅ **Buena description**:
```yaml
description: |
  Methods for validating root cause analyses with structured checklists.
  Verifies 5 Whys depth, execution path accuracy, fix strategy soundness.
  Use when: reviewing RCA reports, checking if root cause is fundamental,
  verifying file:line references, assessing fix strategies, or quality-checking
  RCA documents to prevent shallow analyses.
```

❌ **Mala description**:
```yaml
description: Validates things  # Demasiado vaga, no tiene triggers
```

**Por qué importa**: Copilot lee solo `name` y `description` para decidir si cargar la skill.

**Checklist de Description Efectiva**:
- [ ] Explica QUÉ hace (1-2 líneas)
- [ ] Menciona CÓMO lo hace (metodología/approach)
- [ ] Lista CUÁNDO usarla (5+ triggers específicos)
- [ ] Incluye términos que usuarios dirían naturalmente
- [ ] Menciona patterns de entrada (ej: "EMS-1234", "5 Whys", "file:line")
- [ ] ~100-150 tokens (rico en contexto)

Ver ejemplos completos: [PROGRESSIVE_DISCLOSURE.md - Description](PROGRESSIVE_DISCLOSURE.md#nivel-1-descubrimiento-100-tokens)

### Reglas del Campo `name`

- ✅ Usar `kebab-case`
- ✅ Coincidir con nombre del directorio
- ❌ NO usar `snake_case`, `camelCase`, o `PascalCase`
- ❌ NO empezar/terminar con `-`
- ❌ NO usar `--` doble

**Ejemplos válidos**:
- `bug-coordinator`
- `root-cause-analysis`
- `pdf-processing`

**Ejemplos inválidos**:
- `Bug-Coordinator` (PascalCase)
- `bug_coordinator` (snake_case)
- `-bug-coordinator` (empieza con -)
- `bug--coordinator` (doble guión)

## 🎯 Cómo Usar las Skills

### En VS Code Chat

```
# Activar skill explícitamente
@skill-name [instrucción]

# Ejemplo
@root-cause-analysis analiza el bug en auth.py
```

### Activación Automática

Las skills se activan automáticamente cuando mencionas:
- Palabras clave de la description
- Contexto relacionado al dominio
- Referencias a artifacts de la skill

**Ejemplo**:
```
"Verifica este RCA report"
→ Activa rca-verification automáticamente
```

### Cargar Recursos Específicos

```
# Cargar checklist
Use the verification checklist from rca-verification

# Cargar template
Create verified-rca.md using the template from rca-verification
```

## 🔄 Workflow de Bug Fixing

Las skills trabajan juntas en un pipeline:

```
┌────────────────┐
│ bug-coordinator│  Orchestrator
└───────┬────────┘
        │
        ↓
┌────────────────────┐
│ jira-bug-fetcher   │  Phase 1: Fetch Context
└───────┬────────────┘
        │
        ↓
┌────────────────────┐
│ codebase-research  │  Phase 2: Research
└───────┬────────────┘
        │
        ↓ (Verification)
        │
        ↓
┌────────────────────┐
│ root-cause-analysis│  Phase 4: RCA (5 Whys)
└───────┬────────────┘
        │
        ↓
┌────────────────────┐
│ rca-verification   │  Phase 5: Validate RCA
└───────┬────────────┘
        │
        ↓ (Planning & Implementation)
        │
        ↓
┌────────────────────┐
│ bug-fix-testing    │  Phase 8: Regression Tests
└────────────────────┘
```

## 🛠️ Crear una Nueva Skill

### 1. Crear Estructura

```bash
mkdir -p .github/skills/my-skill/{scripts,references,assets}
```

### 2. Crear SKILL.md

```markdown
---
name: my-skill
description: |
  Brief description.
  Use when [trigger scenarios].
license: MIT
compatibility: VS Code Insiders
metadata:
  author: Your-Name
  version: "1.0"
---

# My Skill

Core instructions here.

## When to Use

- Scenario 1
- Scenario 2

## Usage

[Examples]

## Resources

- [Checklist](references/checklist.md)
- [Template](references/template.md)
```

### 3. Agregar Referencias

Crear archivos en `references/`:
- Checklists
- Templates
- Guías detalladas

### 4. Opcional: Scripts

Agregar scripts ejecutables en `scripts/`:
- Python, Bash, JavaScript
- Validadores, generadores

### 5. Documentar para Humanos

Crear `README.md` con:
- Cómo usar la skill
- Qué recursos incluye
- Ejemplos de activación

## 📊 Beneficios del Estándar

### vs. Instrucciones Personalizadas

| Aspecto | Custom Instructions | Agent Skills |
|---------|---------------------|--------------|
| Carga | Siempre | Bajo demanda |
| Contenido | Solo texto | Texto + scripts + assets |
| Portabilidad | Solo VS Code | Multi-plataforma |
| Organización | Flat | Progressive disclosure |
| Reutilización | Por proyecto | Cross-proyecto |

### Eficiencia de Contexto

- **Sin skills**: Repetir 500 tokens cada conversación
- **Con skills**: Cargar 50 tokens + recursos on-demand

**Ahorro**: 90% de tokens en contexto repetitivo

## � Patrones de Producción

Las skills se clasifican en patrones según su propósito. Entender estos patrones ayuda a diseñar skills efectivas.

### 1. Skills Basadas en Workflows

**Propósito**: Orquestar procesos multi-paso complejos

**Características**:
- Coordinan múltiples agentes o fases
- Mantienen estado del workflow
- Checkpoints para validación humana
- Generan artifacts en cada fase

**Ejemplos en Green-POS**:
- **bug-coordinator** - Orquesta: Jira → Research → RCA → Planning → Implementation
- **deployment-manager** (futuro) - CI/CD pipeline automation

**Cuándo usar**:
- Proceso tiene > 3 pasos secuenciales
- Requiere coordinación entre agentes especializados
- Necesita tracking de progreso
- Validación humana en checkpoints críticos

**Template**:
```yaml
name: workflow-manager
description: |
  Orchestrates multi-step process: phase1 → phase2 → phase3.
  Coordinates specialized agents and maintains workflow state.
  Use when: starting complex process, checking progress, resuming workflow.
```

---

### 2. Skills por Tareas

**Propósito**: Realizar una tarea específica bien definida

**Características**:
- Scope acotado y claro
- Input/output bien definido
- Reusable en múltiples workflows
- Independiente (no orquesta otros)

**Ejemplos en Green-POS**:
- **jira-bug-fetcher** - Fetch ticket de Jira → crear bug-context.md
- **bug-fix-testing** - Crear regression tests para bug fix
- **rca-verification** - Validar RCA report con checklists

**Cuándo usar**:
- Tarea repetitiva con variaciones mínimas
- Se necesita en múltiples workflows
- Output determinista (siempre mismo formato)
- No requiere orquestación de otros agentes

**Template**:
```yaml
name: task-executor
description: |
  Performs [specific task] with [input] producing [output].
  Use when: [action verb] [domain object], need [outcome].
```

---

### 3. Skills de Expertise de Dominio

**Propósito**: Encapsular conocimiento especializado

**Características**:
- Metodología/framework específico
- Guías paso a paso
- Best practices del dominio
- Referencias extensas (regulaciones, estándares)

**Ejemplos en Green-POS**:
- **root-cause-analysis** - Metodología 5 Whys para análisis de causas
- **codebase-research** - Documentarian philosophy para research
- **pdf-compliance** (futuro) - Normativa de documentos legales

**Cuándo usar**:
- Expertise requiere años de experiencia
- Metodología establecida (5 Whys, TDD, etc.)
- Compliance/regulaciones complejas
- Dominio técnico especializado

**Template**:
```yaml
name: domain-expert
description: |
  Applies [methodology/framework] for [domain problem].
  Provides [expertise type] using [technique/approach].
  Use when: need expert guidance on [domain], applying [methodology].
```

---

### 4. Code Generation

**Propósito**: Generar código consistente con templates

**Ejemplos**:
- **bug-fix-testing** - Tests de regresión con naming conventions
- **component-generator** (futuro) - React components con patterns

**Cuándo usar**:
- Código boilerplate repetitivo
- Conventions estrictas del equipo
- Múltiples variaciones de mismo pattern

---

## ⚠️ Anti-Patrones Comunes

Errores frecuentes al diseñar skills. Evítalos para mantener skills mantenibles y eficientes.

### 1. ❌ Descripciones Vagas

**Problema**: Description genérica no activa la skill

**Ejemplo malo**:
```yaml
description: Helps with bugs  # Demasiado vago
```

**Por qué falla**: Copilot no sabe CUÁNDO activar la skill

**Solución**:
```yaml
description: |
  Validates root cause analyses using 5 Whys methodology.
  Verifies depth, accuracy, fix strategy, side effects.
  Use when: reviewing RCA reports, checking root causes,
  validating fix strategies, preventing shallow analyses.
```

**Regla**: 5+ triggers específicos en la description

---

### 2. ❌ SKILL.md Gigantes

**Problema**: SKILL.md > 10,000 tokens impide cargar otras skills

**Ejemplo malo**:
```markdown
# SKILL.md (20,000 tokens)

## Core Instructions
[2000 tokens]

## Complete Checklist
[5000 tokens - debería estar en references/]

## Full Template
[8000 tokens - debería estar en references/]

## All Examples
[5000 tokens - debería estar en references/]
```

**Por qué falla**: Consume ventana de contexto, impide composabilidad

**Solución**: Progressive disclosure
```markdown
# SKILL.md (3,000 tokens)

## Core Instructions
[2000 tokens]

## Resources
- [Checklist](references/checklist.md) ← Link, no contenido
- [Template](references/template.md)
- [Examples](references/examples/)
```

**Regla**: SKILL.md < 5000 tokens, detalles en subdirectorios

---

### 3. ❌ Referencias Anidadas

**Problema**: SKILL.md → ref1.md → ref2.md → ref3.md (cadena de carga)

**Ejemplo malo**:
```markdown
# SKILL.md
See [main guide](references/main-guide.md)

# references/main-guide.md
For details, see [detailed-process](sub/detailed-process.md)

# references/sub/detailed-process.md
Check [examples](examples/examples.md)
```

**Por qué falla**: Carga impredecible, difícil de mantener

**Solución**: Un solo nivel desde SKILL.md
```markdown
# SKILL.md
Resources:
- [Main Guide](references/main-guide.md)
- [Detailed Process](references/detailed-process.md)
- [Examples](references/examples.md)

# Todos los archivos en references/ son independientes
```

**Regla**: Máximo 1 nivel de indirección desde SKILL.md

---

### 4. ❌ Archivos Innecesarios

**Problema**: Incluir archivos que nunca se usan

**Ejemplos malos**:
- `OLD_BACKUP_2023.md` en references/
- `test_script_broken.py` en scripts/
- `deprecated/` con código obsoleto
- `random_notes.txt` sin propósito claro

**Por qué falla**: Confunde a Copilot, dificulta mantenimiento

**Solución**: Solo archivos activos y documentados
- README.md menciona cada archivo
- Nombres descriptivos y actualizados
- Sin código legacy o backups

**Regla**: Si no está documentado en README, no debería existir

---

### 5. ❌ Skills Duplicadas

**Problema**: Múltiples skills con funcionalidad sobrelapada

**Ejemplo malo**:
- `bug-analyzer` 
- `root-cause-finder`
- `rca-specialist`

(Todas hacen análisis de causas raíz)

**Solución**: Una skill bien diseñada con subdirectorios
```
root-cause-analysis/
├── SKILL.md (metodología core)
└── references/
    ├── 5-whys-guide.md
    ├── fault-tree-guide.md
    └── fishbone-guide.md
```

**Regla**: 1 skill por dominio, variaciones en subdirectorios

---

## 💼 Skills como Conocimiento Institucional

Las skills transforman el conocimiento efímero en memoria permanente del equipo.

### La Transformación

| De | A |
|----|---|
| Aprendizaje individual | Capacidad de equipo |
| Contexto efímero | Memoria versionada |
| Onboarding lento | Inmediato |
| Experiencia dispersa | Expertise centralizada |
| Repetición constante | Reutilización eficiente |

### El Efecto de Acumulación

**Sin skills**:
```
Día 1: Explicas metodología 5 Whys                    (500 tokens)
Día 2: Vuelves a explicar 5 Whys a otro dev           (500 tokens)
Día 30: Has explicado 5 Whys 15 veces                 (7,500 tokens)
```

**Con skills**:
```
Día 1: Creas skill root-cause-analysis                (2,000 tokens - one time)
Día 2-30: Skill se activa automáticamente             (50 tokens/uso)
Día 30: Ahorro de 6,000+ tokens + knowledge preserved
```

### Claude Día 30 > Claude Día 1

**Por qué**: Las skills conservan **cómo trabaja tu equipo**

- ✅ Metodologías probadas
- ✅ Conventions específicas del proyecto
- ✅ Lecciones aprendidas (de RCAs anteriores)
- ✅ Patterns que funcionan en TU codebase
- ✅ Compliance de TU industria

**Resultado**: IA que mejora con el tiempo, no comienza de cero cada conversación

### Onboarding Acelerado

**Tradicional**:
```
Semana 1-2: Leer docs (incompletas)
Semana 3-4: Shadowing seniors
Mes 2-3: Empezar a ser productivo
```

**Con skills**:
```
Día 1: Copilot ya tiene las skills del equipo
Día 1: Junior usa @bug-coordinator igual que senior
Semana 1: Ya productivo con guidance automática
```

### Versionado de Conocimiento

Las skills son versionadas con git:

```bash
# Ver evolución del conocimiento
git log .github/skills/root-cause-analysis/

# Restaurar versión anterior si es necesario
git checkout abc123 .github/skills/root-cause-analysis/

# Branching para experimentar con mejoras
git checkout -b improve-rca-methodology
```

**Beneficio**: El conocimiento evoluciona de forma controlada y auditable

### Skills como Capital Intelectual

Las skills son **activos** de la empresa:
- Portables entre proyectos
- Compartibles entre equipos
- Reutilizables en nuevos contextos
- Mejorables iterativamente

**ROI**: Cada hora invertida en una skill buena ahorra 10+ horas del equipo

## 🔧 Troubleshooting

### Skill No Se Activa

**Síntomas**: Mencionas la skill pero Copilot no la carga

**Causas comunes**:
1. Description demasiado vaga
2. Name no coincide con directorio
3. Frontmatter YAML inválido
4. Ubicación incorrecta (fuera de `.github/skills/`)

**Solución**:
- Verificar que `name` = nombre del directorio
- Mejorar `description` con triggers claros
- Validar YAML en frontmatter
- Mover a `.github/skills/` si está en otro lugar

### Recursos No Se Cargan

**Síntomas**: SKILL.md carga pero referencias no

**Causas**:
- Rutas relativas incorrectas
- Archivos en ubicación incorrecta
- No mencionaste el recurso específico

**Solución**:
- Usa rutas relativas desde SKILL.md
- Organiza en subdirectorios estándar
- Pide explícitamente: "Use the checklist from..."

## 📚 Referencias

- [Agent Skills Standard](https://github.com/ModelContextProtocol/agent-skills) (Estándar abierto)
- [GitHub Copilot Skills](https://code.visualstudio.com/docs/copilot/copilot-customization) (Implementación VS Code)
- [Module 10: Agent Skills](https://contextforgeai.com) - Curso completo
- [PROGRESSIVE_DISCLOSURE.md](PROGRESSIVE_DISCLOSURE.md) - Guía del sistema de 3 niveles

---

## ⚙️ Estado Actual y Activación

### Disponibilidad

**Skills están disponibles en**:
- ✅ **VS Code Insiders** (GitHub Copilot)
- ✅ **Claude Code** (Anthropic)
- ✅ **Cursor** (AI-first IDE)
- ✅ **Amp** (Amplitude IDE)
- ✅ **Goose** (Block's AI agent)
- ✅ **OpenCode** (Open source)

### Activación en VS Code

**Método 1: Settings UI**
1. Abrir Settings (Ctrl+,)
2. Buscar "chat.useAgentSkills"
3. Activar checkbox

**Método 2: settings.json**
```json
{
  "chat.useAgentSkills": true
}
```

**Ubicación del archivo**:
- Windows: `%APPDATA%\Code - Insiders\User\settings.json`
- Mac/Linux: `~/.config/Code - Insiders/User/settings.json`

### Verificar que Funciona

**Test de activación**:
```
1. Reiniciar VS Code Insiders
2. Abrir Copilot Chat
3. Escribir: "Verify this RCA report"
4. Observar: Copilot debería cargar rca-verification skill
```

**Debugging**:
```
VS Code → Output panel → Select "GitHub Copilot" from dropdown
→ Ver qué skills se cargan
```

### Estado del Estándar

| Aspecto | Estado | Notas |
|---------|--------|-------|
| **Especificación** | ✅ Stable | v1.0 del estándar |
| **Multi-plataforma** | ✅ Supported | 6+ herramientas |
| **Retrocompatibilidad** | ✅ Guaranteed | Formato no cambiará |
| **Comunidad** | 🔄 Growing | Más skills cada mes |

---

## 🤝 Contribuir

### Crear un Nuevo Skill

**Template básico**:
```yaml
---
name: example-skill
description: |
  [150 tokens con 5-7 triggers específicos]
  
  When to use:
  - User says "analyze X"
  - You need to Y
  - Situation Z occurs
  
  What it does:
  - Step 1 with precision
  - Step 2 with clarity
  - Step 3 with examples
  
  Key patterns:
  - Pattern A for scenario 1
  - Pattern B for scenario 2
license: MIT
compatibility:
  - github-copilot
  - claude-code
  - cursor
metadata:
  author: Green-POS
  version: 1.0
  related-skills:
    - other-skill
---

# Instructions (~3000-5000 tokens)
[Paso a paso detallado]

## References
- [Link 1](path/to/reference1.md)
- [Link 2](path/to/reference2.md)
```

**Checklist de calidad**:
- [ ] `name` en kebab-case ✅
- [ ] `description` ≥ 100 tokens, 5+ triggers ✅
- [ ] Metadata completa (author, version) ✅
- [ ] Instructions < 5000 tokens ✅
- [ ] `references/` en lugar de `scripts/` ✅
- [ ] README.md en subdirectorio del skill ✅
- [ ] Related skills documentados ✅

### Proceso de Revisión

**1. Auto-validación**:
```bash
# Verificar estructura
ls .github/skills/new-skill/SKILL.md
ls .github/skills/new-skill/references/

# Contar tokens en description (aproximado)
wc -w .github/skills/new-skill/SKILL.md
# Target: ~100-150 palabras en description block
```

**2. Revisión por pares**:
- ✅ Description clara para humano
- ✅ 5+ triggers específicos
- ✅ Instructions paso a paso
- ✅ Referencias bien organizadas

**3. Testing en Preview**:
```
1. Agregar skill a workspace
2. Reiniciar Copilot
3. Probar trigger: "Analyze this using [skill-name]"
4. Verificar: Output panel muestra skill cargado
```

### Guidelines de Documentación

**README.md del skill**:
```markdown
# Example Skill

Descripción extendida (300-500 tokens) con:
- ¿Qué problema resuelve?
- ¿Cuándo usarlo?
- ¿Qué esperar?
- Casos de uso concretos
- Ejemplo completo de entrada/salida
```

**references/ vs templates/**:
- `references/` ✅ - Contenido cargado al contexto para razonamiento
- `templates/` ❌ - DEPRECATED, usar `references/` o `assets/`
- `assets/` ✅ - Contenido copiado sin cargar (imágenes, esquemas)

---

## 📊 Resumen Final

### Capacidades Disponibles

| Skill | Trigger Examples | Use Case | Status |
|-------|------------------|----------|--------|
| **bug-coordinator** | "Fix bug X", "Workflow para EMS-123" | Orquestación completa | ✅ Stable |
| **jira-bug-fetcher** | "Get ticket EMS-1234", "Fetch PROJ-567" | Retrieval Jira | ✅ Requires MCP |
| **codebase-research** | "Investigate codebase", "Research how X works" | Documentarian | ✅ Stable |
| **root-cause-analysis** | "5 Whys for bug", "Analyze root cause" | RCA con 5 Whys | ✅ Stable |
| **rca-verification** | "Verify RCA report", "Check this 5 Whys analysis" | QA de RCA | ✅ Enhanced |
| **bug-fix-testing** | "Generate regression tests", "Test coverage for fix" | Test patterns | ✅ Stable |
| **context-lifecycle-manager** | "Archive bug EMS-1234", "Health check context", "Clean sessions" | Context maintenance | ✅ Stable |

### Métricas de Optimización

| Métrica | Antes M10 | Después M10 | Mejora |
|---------|-----------|-------------|--------|
| **Description tokens** | ~50 | ~150 | +200% |
| **Triggers per skill** | 2-3 | 5-7 | +150% |
| **Context loading** | 30,000+ tokens | ~5,600 tokens | **81% savings** |
| **Skills con metadata completa** | 4/7 (57%) | 7/7 (100%) | +43% |
| **Progressive disclosure** | 1/7 | 7/7 | +600% |
| **Documentación** | README básico | 3 guías completas | +300% |
| **Integración con scripts** | 0/7 | 1/7 (14%) | **Nuevo** |

### Compliance M10

```
✅ YAML Frontmatter structure
✅ kebab-case naming convention
✅ Progressive disclosure (3 levels)
✅ Description optimization (3× time rule)
✅ Metadata completa (license, compatibility, author, version)
✅ Related skills documented
✅ Multi-platform compatibility
✅ Production patterns documented
✅ Anti-patterns identified
✅ Institutional knowledge captured
✅ Script integration (context-lifecycle-manager)
```

**Validación completa**: Ver [M10_COMPLIANCE_VALIDATION.md](M10_COMPLIANCE_VALIDATION.md)

### Integración con Scripts Existentes ⭐

**Nuevo patrón**: Skills que orquestan scripts automatizados del proyecto

**Ejemplo: context-lifecycle-manager**
```
Skill:     @context-lifecycle-manager archive bug EMS-1234
  ↓ invoca
Script:    .context/scripts/lifecycle_automation.py --archive-research
  ↓ ejecuta
Resultado: Bug archivado en .context/archive/bugs/implemented/
```

**Beneficios:**
- ✅ Reutiliza scripts existentes (573 LOC ya escritas)
- ✅ Skill proporciona interfaz conversacional
- ✅ Script ejecuta lógica compleja (archival, cleanup, metrics)
- ✅ Zero duplicación de código
- ✅ Mantiene separación: AI (orquestación) vs Script (ejecución)

**Scripts integrados:**
- `lifecycle_automation.py` (context-lifecycle-manager) - 573 LOC
- Archival, cleanup, health check, stale detection

### Valor para Green-POS

**Antes** (conocimiento individual):
- Bug fixing requería expertise manual
- Onboarding: ~2 semanas para RCA
- Conocimiento en cabezas individuales
- Inconsistencia en análisis
- Sin trazabilidad de patrones
- Archival manual de artifacts → acumulación
- Sin métricas de salud del contexto

**Después** (conocimiento institucional):
- Workflow automático de 8 fases (incluye archival)
- Onboarding: ~2 días con skills
- Conocimiento versionado en Git
- Análisis estandarizado (5 Whys)
- Patrones documentados y reutilizables
- Archival automático post-deployment
- Health metrics con acciones recomendadas

**ROI estimado**:
- 🕐 **Tiempo de onboarding**: -80% (10 días → 2 días)
- 📊 **Calidad de RCA**: +60% (verificación automática)
- 🔄 **Reutilización de conocimiento**: +500% (skills vs. documentos)
- 🎯 **Consistencia en debugging**: +75% (mismo proceso siempre)
- 🗄️ **Eficiencia de contexto**: +81% (archival automático, health metrics)
- ⏱️ **Tiempo de mantenimiento**: -70% (30 min/mes con context-lifecycle-manager)

### Transformación Lograda

```
Individual Knowledge → Institutional Capital
Ephemeral Memory → Versioned in Git
Slow Onboarding → Immediate Activation
Inconsistent Process → Standardized Workflow
Lost Expertise → Preserved Forever
```

**Claude day 30 > Claude day 1** gracias a skills 🚀

---

**Version**: 1.0  
**Last Updated**: Enero 2026  
**Maintainer**: Green-POS Project  
**License**: MIT  
**Compliance**: Agent Skills Standard v1.0 (M10) ✅
