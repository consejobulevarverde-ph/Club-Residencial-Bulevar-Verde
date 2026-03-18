# Subagents - Helpers Especializados

Los **subagents** son agentes auxiliares invocados por los agents principales para tareas específicas. No se llaman directamente por el usuario, sino a través de `#runSubagent` desde agents padres.

## 📁 Ubicación

```
.github/agents/subagents/
├── codebase-analyzer.md       # Analiza archivos del codebase
├── codebase-locator.md        # Localiza archivos relevantes
├── pattern-finder.md          # Encuentra patrones de código
├── thoughts-analyzer.md       # Analiza proceso de pensamiento
├── thoughts-locator.md        # Localiza documentos de investigación
└── web-search-researcher.md   # Investigación en internet
```

## 🚀 Cómo se Invocan

**IMPORTANTE**: Los subagents NO se invocan directamente. Se usan desde agents padres con `#runSubagent`.

### Sintaxis de Invocación

Desde un agent padre (ej: `@investigador-codebase`):

```javascript
#runSubagent <subagent_nombre>
prompt: "Descripción de la tarea específica"
additional_context: "Contexto opcional"
```

## 📚 Subagents Disponibles

### 1. codebase-analyzer.md
**Propósito**: Analizar contenido de archivos del codebase

**Usado por**:
- `@investigador-codebase` (research_codebase.agent.md)
- `@creador-plan` (create_plan.agent.md)

**Qué hace**:
- Lee archivos completamente
- Analiza estructuras de código
- Identifica patrones y dependencias
- Extrae información relevante para investigación

**Ejemplo de invocación** (desde agent padre):
```javascript
#runSubagent <codebase_analyzer>
prompt: "Analiza routes/invoices.py para entender el flujo de facturación"
files: ["routes/invoices.py", "models/models.py"]
```

---

### 2. codebase-locator.md
**Propósito**: Localizar archivos relevantes en el codebase

**Usado por**:
- `@investigador-codebase`
- `@creador-plan`

**Qué hace**:
- Busca archivos por patrones
- Identifica directorios relevantes
- Retorna rutas completas
- Filtra resultados por relevancia

**Ejemplo de invocación**:
```javascript
#runSubagent <codebase_locator>
prompt: "Encuentra todos los archivos relacionados con sistema de citas"
keywords: ["appointment", "service", "pet"]
directories: ["routes/", "templates/", "models/"]
```

---

### 3. pattern-finder.md
**Propósito**: Encontrar patrones específicos de código

**Usado por**:
- `@investigador-codebase`
- `@creador-plan`
- `@green-pos-backend` (potencialmente)

**Qué hace**:
- Busca patrones de diseño implementados
- Identifica convenciones de código
- Encuentra usos de decorators, blueprints, etc.
- Analiza consistencia arquitectónica

**Ejemplo de invocación**:
```javascript
#runSubagent <pattern_finder>
prompt: "Encuentra todos los decorators de autorización en rutas Flask"
pattern_type: "decorators"
target: "@login_required, @admin_required"
```

---

### 4. thoughts-analyzer.md
**Propósito**: Analizar documentos de investigación y proceso de pensamiento

**Usado por**:
- `@investigador-codebase`
- Bug Workflow agents (potencialmente)

**Qué hace**:
- Lee documentos de investigación (`.context/`, `docs/research/`)
- Analiza hallazgos previos
- Extrae insights clave
- Identifica gaps de conocimiento

**Ejemplo de invocación**:
```javascript
#runSubagent <thoughts_analyzer>
prompt: "Analiza la investigación previa sobre sistema de notas de crédito"
documents: [".context/active/investigations/2025-12-05-notas-credito.md"]
focus: "Decisiones de diseño y trade-offs"
```

---

### 5. thoughts-locator.md
**Propósito**: Localizar documentos de investigación relacionados

**Usado por**:
- `@investigador-codebase`
- Bug Workflow agents

**Qué hace**:
- Busca en `docs/research/`, `.context/active/`, `docs/archive/`
- Encuentra investigaciones relacionadas
- Identifica documentos relevantes por keywords
- Retorna rutas de documentos para análisis posterior

**Ejemplo de invocación**:
```javascript
#runSubagent <thoughts_locator>
prompt: "Encuentra toda la investigación sobre sistema de inventario"
keywords: ["inventory", "stock", "product", "trazabilidad"]
directories: ["docs/research/", "docs/archive/research/"]
```

---

### 6. web-search-researcher.md
**Propósito**: Investigar información en internet

**Usado por**:
- `@investigador-codebase`
- `@creador-plan`
- Cualquier agent que necesite información externa

**Qué hace**:
- Busca best practices en web
- Investiga documentación oficial (Flask, SQLAlchemy, Bootstrap, etc.)
- Encuentra ejemplos de implementación
- Retorna información relevante con fuentes

**Ejemplo de invocación**:
```javascript
#runSubagent <web_researcher>
prompt: "Investiga best practices para implementar sistema de descuentos en e-commerce"
topics: ["discount system", "promo codes", "Flask implementation"]
sources: ["oficial Flask docs", "StackOverflow", "GitHub examples"]
```

---

## 🔄 Workflow de Uso

### Ejemplo: Investigación Completa con Múltiples Subagents

**Usuario invoca**:
```
@investigador-codebase
Analiza el sistema completo de facturación en Green-POS
```

**Agent padre orquesta subagents en paralelo**:

1. **codebase-locator**: Encuentra archivos relacionados
   ```
   → routes/invoices.py
   → models/models.py (Invoice, InvoiceItem)
   → templates/invoices/
   ```

2. **codebase-analyzer**: Analiza archivos encontrados
   ```
   → Invoice model con campos: number, date, total, payment_method
   → Rutas CRUD: list, new, view, edit, delete
   → PDF generation con ReportLab
   ```

3. **pattern-finder**: Identifica patrones usados
   ```
   → Template Method Pattern en CRUD
   → Strategy Pattern en payment methods
   → Observer Pattern en invoice creation
   ```

4. **thoughts-locator**: Busca investigaciones previas
   ```
   → docs/archive/implemented/IMPLEMENTACION_NOTAS_CREDITO_DIAN.md
   → docs/technical/FLUJO_ACTUAL_CASH_REGISTER.md
   ```

5. **thoughts-analyzer**: Analiza documentos encontrados
   ```
   → Sistema de Notas de Crédito ya implementado
   → Integración con arqueo de caja
   → Restricciones de DIAN documentadas
   ```

**Agent padre sintetiza resultados y presenta al usuario**:
```
Análisis completo del sistema de facturación:

ARQUITECTURA:
- 11 modelos relacionados (Invoice, Customer, Product, etc.)
- 8 rutas en routes/invoices.py
- 5 templates principales
- PDF generation implementado

PATRONES IDENTIFICADOS:
- CRUD estándar con validación backend
- Métodos de pago: cash, transfer, card, mixed
- Integración con Notas de Crédito (DIAN)

HALLAZGOS CLAVE:
[Síntesis de lo encontrado por subagents]
```

---

## ⚠️ Notas Importantes

### NO Invocar Directamente
```bash
# ❌ INCORRECTO
@codebase-analyzer analiza routes/invoices.py

# ✅ CORRECTO
@investigador-codebase analiza routes/invoices.py
# (El agent padre invocará codebase-analyzer internamente)
```

### Subagents Son "Dumb Workers"
Los subagents:
- NO toman decisiones arquitectónicas
- NO sugieren mejoras
- SOLO reportan lo que encuentran
- Son documentadores, no críticos

### Agent Padre Es el Orquestador
El agent padre:
- Decide qué subagents invocar
- Coordina ejecución paralela
- Sintetiza resultados
- Presenta conclusiones al usuario

---

## 🔧 Para Desarrolladores de Agents

### Crear un Nuevo Subagent

Si necesitas crear un nuevo subagent:

1. **Crea archivo** en `.github/agents/subagents/new-subagent.md`
2. **Define propósito específico** (narrow scope)
3. **Documenta invocación** desde agent padre
4. **Especifica output esperado** (formato estándar)
5. **Actualiza este README**

### Template de Subagent

```chatagent
---
name: My Subagent
description: Brief description of what this subagent does
model: Claude Sonnet 4.5
tools: ['read/readFile', 'search/codebase']
---

# My Subagent

You are a specialized worker invoked by parent agents via #runSubagent.

## Purpose
[Single, specific task this subagent performs]

## Expected Input
- prompt: Description of task
- [additional parameters if needed]

## Expected Output
[Standardized format for results]

## Instructions
[Detailed instructions for how to perform the task]

CRITICAL:
- You are a documentor, not a critic
- Report what EXISTS, don't suggest improvements
- Return results in standardized format
- Keep responses focused and concise
```

---

## 📖 Recursos Adicionales

- **Main Agents Documentation**: [.github/agents/README.md](../README.md)
- **Research Agents**: Ver sección "Research Agents" en README principal
- **Planning Agents**: Ver sección "Planning Agents" en README principal
- **Best Practices**: [docs/archive/research/implemented/](../../docs/archive/research/implemented/)

---

**Última actualización**: 29 de enero de 2026  
**Versión**: 1.0  
**Mantenido por**: Green-POS Development Team
