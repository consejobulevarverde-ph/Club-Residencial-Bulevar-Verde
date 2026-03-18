# 🚀 Referencia Rápida - Copilot Agents Green-POS

Guía consolidada de uso rápido de los agents especializados de Green-POS.

---

## 📊 Sistema de Agents

```
┌─────────────────────────────────────────────────────────────────┐
│                    🎨 FRONTEND AGENT                            │
│  @green-pos-frontend                                            │
│                                                                 │
│  Responsabilidad: UI/UX, Templates, JavaScript                 │
│  Archivos: templates/, static/css/, static/js/                 │
│  Stack: HTML5 + Jinja2 + Bootstrap 5.3+ + Vanilla JS          │
└─────────────────────────────────────────────────────────────────┘
                              ↓ Consume APIs
┌─────────────────────────────────────────────────────────────────┐
│                    🐍 BACKEND AGENT                             │
│  @green-pos-backend                                             │
│                                                                 │
│  Responsabilidad: Lógica de negocio, Rutas, APIs              │
│  Archivos: routes/, app.py                                     │
│  Stack: Flask 3.0+ + SQLAlchemy + Flask-Login                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓ Usa Modelos
┌─────────────────────────────────────────────────────────────────┐
│                    🗄️ DATABASE AGENT                           │
│  @green-pos-database                                            │
│                                                                 │
│  Responsabilidad: Schema, Modelos, Migraciones                │
│  Archivos: models/models.py, migrations/                       │
│  Stack: SQLite + SQLAlchemy ORM + Flask-SQLAlchemy            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 Selección Rápida de Agent

| Pregunta | Agent | Invocación |
|----------|-------|------------|
| ¿Necesitas HTML/CSS/JS? | Frontend | `@green-pos-frontend` |
| ¿Necesitas rutas/lógica? | Backend | `@green-pos-backend` |
| ¿Necesitas modelo/schema? | Database | `@green-pos-database` |
| ¿Necesitas CRUD completo? | Todos | DB → Backend → Frontend |
| ¿Necesitas plan técnico? | Planning | `@creador-plan` |
| ¿Necesitas investigar código? | Research | `@investigador-codebase` |

---

## 🎨 Frontend Agent

### Casos de Uso Comunes

| Tarea | Comando |
|-------|---------|
| **Lista con DataTable** | `@green-pos-frontend crea templates/suppliers/list.html con DataTable de proveedores (columnas: código, nombre, teléfono, acciones)` |
| **Formulario con validación** | `@green-pos-frontend crea templates/suppliers/form.html con campos: name (requerido), phone (opcional). Validación HTML5 + JavaScript` |
| **Modal de confirmación** | `@green-pos-frontend agrega modal de eliminación Bootstrap 5 en list.html con botón rojo "Eliminar"` |
| **Autocompletado AJAX** | `@green-pos-frontend implementa autocompletado de clientes en #customer-input usando Fetch API y /api/customers/search` |
| **Auditar accesibilidad** | `@green-pos-frontend #runSubagent <subagent_accessibility_audit> pathInOut=templates/products/list.html` |

### Subagents Disponibles

```bash
# Scaffold página completa
#runSubagent <subagent_scaffold_page> 
  pathOut=templates/path/file.html 
  pageTitle="Título" 
  breadcrumbs=["Inicio","Sección"] 
  headerActions=[{"label":"Nuevo","url":"...","class":"btn-primary"}]

# Agregar DataTable
#runSubagent <subagent_table_datatable> 
  pathInOut=templates/path/file.html 
  columns=["Código","Nombre","Teléfono","Acciones"] 
  idTable=suppliers-table

# Auditar accesibilidad WCAG
#runSubagent <subagent_accessibility_audit> 
  pathInOut=templates/path/file.html
```

### Plantilla de Prompt

```
@green-pos-frontend
Crea templates/[entity]/[file].html con:
- Breadcrumbs: Inicio > [Sección] > [Página]
- Header: Título "[Título]" + botón "[Acción]" (class: btn-primary)
- Contenido: [descripción específica del layout]
- Validación: [campos requeridos, patrones, límites]
- Responsive y accesible (WCAG AA)
```

**Documentación**: [.github/instructions/frontend-html-agent.instructions.md](.github/instructions/frontend-html-agent.instructions.md)

---

## 🐍 Backend Agent

### Casos de Uso Comunes

| Tarea | Comando |
|-------|---------|
| **CRUD completo** | `@green-pos-backend implementa CRUD para Supplier: list (/suppliers), new, view, edit, delete. Solo admin. Validación: code único, name requerido` |
| **API JSON** | `@green-pos-backend crea GET /api/suppliers/search que busque por nombre con parámetro q. Retorna max 10 resultados JSON. @login_required` |
| **Validación server** | `@green-pos-backend agrega validación a supplier_new(): code único, phone formato válido, email opcional pero si existe debe ser válido` |
| **Autorización** | `@green-pos-backend agrega @role_required('admin') a supplier_delete() y supplier_edit()` |
| **Generar CRUD** | `@green-pos-backend #runSubagent <subagent_generate_crud> entityName=Supplier routePrefix=suppliers` |

### Subagents Disponibles

```bash
# Generar CRUD completo
#runSubagent <subagent_generate_crud> 
  entityName=Entity 
  routePrefix=entities 
  templatePath=templates/entities

# Agregar validación
#runSubagent <subagent_add_validation> 
  entityName=Entity
  fields=[{"name":"code","type":"string","required":true,"unique":true}]

# Crear API endpoint
#runSubagent <subagent_create_api> 
  entityName=Entity 
  operation=search 
  route=/api/entities/search
```

### Plantilla de Prompt

```
@green-pos-backend
Implementa [operación CRUD] para [Entity]:
- Ruta: [método] [/path]
- Validación: [reglas específicas]
- Autorización: [@login_required, @role_required('admin')]
- Respuesta: [redirect a vista / JSON]
- Incluir try-except con db.session.rollback()
- Flash messages apropiados
```

**Documentación**: [.github/instructions/backend-python-agent.instructions.md](.github/instructions/backend-python-agent.instructions.md)

---

## 🗄️ Database Agent

### Casos de Uso Comunes

| Tarea | Comando |
|-------|---------|
| **Crear modelo** | `@green-pos-database crea modelo Supplier con: code (String 20 unique not null), name (String 100 not null), phone (String 20), email (String 120), is_active (Boolean default True)` |
| **Relación** | `@green-pos-database agrega relación one-to-many entre Supplier y Product (supplier_id FK). Include backref 'products'` |
| **Migración** | `@green-pos-database crea migración para agregar columna email (String 120) a Customer. Incluir script Python + SQL` |
| **Optimizar queries** | `@green-pos-database analiza queries N+1 en Invoice y sugiere joinedload de items, customer, pet` |
| **Generar modelo** | `@green-pos-database #runSubagent <subagent_generate_model> entityName=Supplier fields=[...]` |

### Subagents Disponibles

```bash
# Generar modelo completo
#runSubagent <subagent_generate_model> 
  entityName=Entity 
  tableName=entity 
  fields=[{"name":"code","type":"String(20)","unique":true}] 
  relationships=[{"name":"items","model":"Item","type":"one-to-many"}]

# Crear migración
#runSubagent <subagent_create_migration> 
  migrationType=add_column 
  tableName=customer 
  details={"column_name":"email","column_type":"String(120)"}

# Optimizar queries
#runSubagent <subagent_optimize_queries> 
  modelName=Invoice 
  commonQueries=["list_with_items","list_with_customer"]
```

### Plantilla de Prompt

```
@green-pos-database
Crea modelo [Entity]:
Tabla: [table_name]
Campos:
  - [field1] ([type], [constraints])
  - [field2] ([type], [constraints])
Relaciones:
  - [relationship_name] ([type] con [OtherEntity])
Incluir: BaseModel, __repr__(), to_dict()
Timestamps: created_at, updated_at con CO_TZ
```

**Documentación**: [.github/instructions/database-sqlite-agent.instructions.md](.github/instructions/database-sqlite-agent.instructions.md)

---

## 🔄 Workflow Multi-Agent Completo

### Ejemplo: Módulo "Proveedores"

```
┌──────────────────────────────────────────────────────────────┐
│ PASO 1: PLANEACIÓN                                          │
│ @creador-plan                                                │
│                                                              │
│ Crea plan técnico para módulo Proveedores con:             │
│ - Modelo Supplier (código, nombre, teléfono, email)        │
│ - CRUD completo (solo admin)                               │
│ - Relación one-to-many con Product                         │
│ - Vistas con DataTable y formularios                       │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ PASO 2: BASE DE DATOS                                       │
│ @green-pos-database                                          │
│                                                              │
│ Crea modelo Supplier:                                       │
│ - code (String 20, unique, not null)                        │
│ - name (String 100, not null)                               │
│ - phone (String 20)                                         │
│ - email (String 120)                                        │
│ Relación: products (one-to-many con Product)                │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ PASO 3: BACKEND                                             │
│ @green-pos-backend                                           │
│                                                              │
│ Implementa CRUD para Supplier:                             │
│ - GET /suppliers (list con filtro)                         │
│ - GET+POST /suppliers/new (crear)                          │
│ - GET /suppliers/<id> (ver detalle)                        │
│ - GET+POST /suppliers/<id>/edit (editar)                   │
│ - POST /suppliers/<id>/delete (eliminar)                   │
│ Validación: code único, name requerido                     │
│ Autorización: solo admin                                   │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ PASO 4: FRONTEND                                            │
│ @green-pos-frontend                                          │
│                                                              │
│ Crea vistas HTML:                                           │
│ - templates/suppliers/list.html (DataTable + filtros)      │
│ - templates/suppliers/form.html (crear/editar)             │
│ - templates/suppliers/view.html (detalle con productos)    │
│ Incluir: breadcrumbs, validación HTML5, responsive         │
└──────────────────────────────────────────────────────────────┘
```

---

## 📖 Agents de Investigación y Planning

### @creador-plan (Crear Planes Técnicos)

**Cuándo usar**:
- Features nuevas internas de Green-POS
- Refactorización de código existente
- Cambios a blueprints/modelos/templates

**Ejemplo**:
```
@creador-plan
Crea plan para sistema de descuentos en facturas:
- Agregar campo discount a Invoice
- Validación: descuento <= subtotal
- Soporte porcentaje y valor fijo
- Solo admin puede aplicar
- UI: campo en formulario de factura
```

**No usar para**: Integraciones externas, POCs, upgrades core → Usar `@Create Plan Generic`

---

### @investigador-codebase (Investigar Código)

**Cuándo usar**:
- Entender cómo funciona una característica existente
- Documentar implementación actual
- Encontrar ejemplos de patrones en el código

**Ejemplo**:
```
@investigador-codebase
Investiga cómo funciona el sistema de facturación completo:
- Flujo desde crear cita hasta generar factura
- Cálculo de totales (subtotal, descuentos, impuestos)
- Generación de PDF con ReportLab
- Numeración consecutiva (Setting.next_invoice_number)
```

**Documentación**: Genera archivo en `docs/research/YYYY-MM-DD-NNN-descripcion.md`

---

## 💡 Tips y Mejores Prácticas

### ✅ HACER

| Tip | Explicación |
|-----|-------------|
| **Ser específico** | `@green-pos-frontend crea templates/suppliers/list.html con DataTable` mejor que `crea una lista` |
| **Seguir orden lógico** | Database → Backend → Frontend (siempre de abajo hacia arriba en el stack) |
| **Validar en ambas capas** | Frontend (UX) + Backend (seguridad) - SIEMPRE |
| **Incluir manejo de errores** | Try-except con rollback en Backend, console.log limpio en Frontend |
| **Pedir documentación** | Docstrings en Python, comentarios claros en JavaScript |
| **Verificar manualmente** | No confiar ciegamente, probar edge cases |

### ❌ NO HACER

| Anti-patrón | Por qué es malo |
|-------------|-----------------|
| **Prompts vagos** | `"crea un formulario"` → Sin contexto de campos, validación, diseño |
| **Pedir a agent incorrecto** | `@green-pos-frontend crear modelo Product` → Frontend no toca DB |
| **Omitir validación server** | Solo validar en frontend → Inseguro, bypasseable |
| **No especificar autorización** | Rutas sin `@login_required` → Acceso no controlado |
| **Ignorar try-except** | No manejar excepciones → App crash en errores |
| **No probar código generado** | Aceptar sin verificar → Bugs en producción |

---

## 🧪 Smoke Tests Rápidos

### ✅ Checklist Frontend
```
@green-pos-frontend crea templates/products/list.html con DataTable

Verificar:
- [ ] Archivo en ruta correcta
- [ ] Extiende layout.html
- [ ] Breadcrumbs presentes
- [ ] DataTable con i18n es-ES
- [ ] Bootstrap 5 components (cards, tables, buttons)
- [ ] Responsive (probar en DevTools móvil/tablet/desktop)
- [ ] Sin errores en consola del navegador
- [ ] Iconos Bootstrap Icons (bi-*)
```

### ✅ Checklist Backend
```
@green-pos-backend crea GET /api/customers/search con parámetro q

Verificar:
- [ ] Ruta agregada en blueprint correcto
- [ ] @login_required presente
- [ ] Query con ILIKE funciona (case-insensitive)
- [ ] Retorna JSON válido (jsonify())
- [ ] Limit 10 resultados (performance)
- [ ] Try-except con rollback
- [ ] Sin errores 500 en consola
- [ ] app.log limpio (sin errores)
```

### ✅ Checklist Database
```
@green-pos-database crea modelo Category con parent_id

Verificar:
- [ ] Modelo en models/models.py
- [ ] Hereda de BaseModel (created_at, updated_at)
- [ ] __tablename__ definido
- [ ] __repr__() implementado
- [ ] to_dict() implementado
- [ ] Relación self-referencial correcta (parent_id FK)
- [ ] db.create_all() sin errores
- [ ] Timestamps usan CO_TZ (America/Bogota)
```

---

## 🎯 Comandos Favoritos (Copy-Paste)

### Frontend

```bash
# Lista con DataTable
@green-pos-frontend crea templates/[entity]/list.html con tabla DataTable de [entidad] (columnas: [col1, col2, col3, acciones]). Incluir breadcrumbs "Inicio > [Sección] > Lista" y botón "Nuevo [Entity]" (btn-primary). Responsive y accesible.

# Formulario con validación
@green-pos-frontend crea templates/[entity]/form.html con campos: [campo1] (requerido, type=[tipo]), [campo2] (opcional, type=[tipo]). Validación HTML5 + JavaScript custom. Botones "Guardar" (btn-primary) y "Cancelar" (btn-secondary). Responsive.

# Modal Bootstrap 5
@green-pos-frontend agrega modal de confirmación de eliminación en templates/[entity]/list.html con diseño Bootstrap 5 (modal-dialog-centered). Título "Confirmar Eliminación", mensaje de advertencia, botones "Cancelar" y "Eliminar" (btn-danger).
```

### Backend

```bash
# CRUD completo
@green-pos-backend implementa CRUD completo para [Entity]: 
- GET /entities (list con paginación)
- GET+POST /entities/new (crear)
- GET /entities/<id> (ver)
- GET+POST /entities/<id>/edit (editar)
- POST /entities/<id>/delete (eliminar)
Validación server-side: [campo1] requerido, [campo2] único. Solo admin (@role_required('admin')). Try-except con db.session.rollback(). Flash messages apropiados.

# API búsqueda
@green-pos-backend crea GET /api/[entities]/search que busque por [campo] usando parámetro q. Query con ILIKE (case-insensitive). Retorna JSON con max 10 resultados. Include @login_required. Try-except con logging.

# Validación custom
@green-pos-backend agrega validación server-side a [entity]_new(): [campo1] requerido (len > 0), [campo2] único en DB, [campo3] formato [pattern]. Si falla, retornar flash('mensaje', 'error') y re-render form con datos. Si OK, commit y redirect.
```

### Database

```bash
# Modelo estándar
@green-pos-database crea modelo [Entity]:
Tabla: [table_name]
Campos:
  - id (Integer, primary_key)
  - code (String 20, unique, not null, index)
  - name (String 100, not null)
  - [otros campos con tipos y constraints]
  - is_active (Boolean, default True)
  - created_at, updated_at (DateTime con CO_TZ)
Relaciones:
  - [relacion_name] ([tipo one-to-many/many-to-one] con [OtherEntity])
Incluir: __repr__(), to_dict() con all fields. Cascade 'all, delete-orphan' si aplica.

# Migración
@green-pos-database crea migración para agregar columna [column_name] (tipo [SQLAlchemy type]) a tabla [table_name]. Incluir:
- Script Python con Path(__file__).parent para path resolution
- Archivo SQL con ALTER TABLE
- Backup automático pre-migración
- Rollback instructions
- Logging con prefijos [OK], [ERROR], [INFO]

# Optimización
@green-pos-database analiza modelo [Entity] y sugiere:
- Índices faltantes (campos de búsqueda frecuente)
- Relaciones para joinedload (evitar N+1)
- Constraints adicionales (unique, check, FK cascades)
- Queries lentas detectadas
```

---

## 📞 Troubleshooting

### Agent No Responde Correctamente

1. **Verificar sintaxis exacta**:
   ```
   ✅ @green-pos-frontend (correcto)
   ❌ @frontend (incorrecto)
   ❌ @green-pos (incorrecto)
   ```

2. **Agregar más contexto**:
   ```
   En lugar de:
   "crea un formulario"
   
   Mejor:
   "crea templates/suppliers/form.html con campos: 
   code (String 20, requerido), name (String 100, requerido), 
   phone (String 20, opcional). Validación HTML5. Bootstrap 5."
   ```

3. **Mencionar archivo/modelo específico**:
   ```
   "Modifica templates/products/list.html líneas 45-60 
   para agregar columna 'Stock' en DataTable"
   ```

4. **Referir a documentación canónica**:
   ```
   "Sigue patrones de `.github/copilot-instructions.md` 
   sección 'Patrones CRUD' para implementar"
   ```

### Código Generado con Issues

1. **Pedir corrección al mismo agent**:
   ```
   @green-pos-backend 
   El código generado en supplier_new() no tiene try-except. 
   Agregar manejo de excepciones con db.session.rollback()
   ```

2. **Especificar convención no seguida**:
   ```
   @green-pos-frontend
   El JavaScript usa jQuery. Green-POS NO usa jQuery. 
   Reescribir usando Vanilla JS (addEventListener, fetch)
   ```

3. **Proporcionar ejemplo esperado**:
   ```
   @green-pos-database
   El modelo no incluye timestamps. Agregar:
   created_at = db.Column(db.DateTime, default=lambda: datetime.now(CO_TZ))
   updated_at = db.Column(db.DateTime, default=lambda: datetime.now(CO_TZ), onupdate=lambda: datetime.now(CO_TZ))
   ```

---

## 📚 Referencias Completas

### Documentación por Agent

| Agent | Archivo | Tamaño | Contenido |
|-------|---------|--------|-----------|
| 🎨 Frontend | [frontend-html-agent.instructions.md](.github/instructions/frontend-html-agent.instructions.md) | 57 KB | Bootstrap 5, Jinja2, JavaScript, accesibilidad |
| 🐍 Backend | [backend-python-agent.instructions.md](.github/instructions/backend-python-agent.instructions.md) | 45 KB | Flask routes, CRUD, APIs, validación |
| 🗄️ Database | [database-sqlite-agent.instructions.md](.github/instructions/database-sqlite-agent.instructions.md) | 52 KB | Models, relaciones, migraciones, queries |
| 📖 Guía Agents | [README.md](.github/instructions/README.md) | 18 KB | Workflow, coordinación multi-agent |
| 🎯 Limpieza | [code-clean.instructions.md](.github/instructions/code-clean.instructions.md) | - | Pre-producción cleanup |
| 🛠️ Generación | [code-generation.instructions.md](.github/instructions/code-generation.instructions.md) | - | Code generation patterns |

### Contexto del Proyecto

| Documento | Propósito |
|-----------|-----------|
| [.github/copilot-instructions.md](.github/copilot-instructions.md) | **Contexto canónico** - Stack, arquitectura, patrones, constraints |
| [docs/technical/CRUD_PATTERNS_REFERENCE.md](docs/technical/CRUD_PATTERNS_REFERENCE.md) | Patrones CRUD de Green-POS (768 líneas) |
| [.github/agents/README.md](.github/agents/README.md) | Guía completa de todos los agents |
| [.github/plans/](docs/archive/plans/) | Planes técnicos de implementación |

---

## 🎉 ¡Empieza Ahora!

### Flujo Recomendado

1. **Planea la feature**:
   ```
   @creador-plan
   Crear sistema de categorías jerárquicas para productos
   ```

2. **Implementa de abajo hacia arriba**:
   ```
   @green-pos-database crea modelo Category con parent_id
   @green-pos-backend implementa CRUD de categorías
   @green-pos-frontend crea vistas con árbol jerárquico
   ```

3. **Verifica con smoke tests** (ver sección 🧪)

4. **Documenta** si es feature mayor:
   ```
   @investigador-codebase
   Documenta cómo funciona el sistema de categorías implementado
   ```

---

## 🏆 Best Practices Resumen

| ✅ DO | ❌ DON'T |
|------|----------|
| Especificar agent correcto | Prompts vagos sin contexto |
| Validar frontend + backend | Solo validar en frontend |
| Try-except con rollback | Ignorar manejo de errores |
| Breadcrumbs en todas las vistas | Omitir navegación |
| Bootstrap 5 components | Usar jQuery o CSS custom |
| Timestamps con CO_TZ | Timestamps naive sin timezone |
| @login_required en rutas | Rutas sin protección |
| Código limpio (sin DEBUG) | Console.log en producción |
| Probar código generado | Confiar ciegamente |
| Documentation (docstrings) | Código sin comentarios |

---

**Versión**: 2.0 (Consolidada)  
**Última actualización**: 29 de enero de 2026  
**Proyecto**: Green-POS v2.1  
**Compatibilidad**: VS Code + GitHub Copilot Agent Mode

---

**Happy Coding con Agents!** 🚀🐍🎨
