---
name: greenpos-architecture-analysis
description: Analyze Green-POS Flask application architecture, blueprints, templates, patterns, and relationships. Flask blueprint analysis, Jinja2 template patterns, SQLAlchemy model relationships, design patterns detection, Green-POS architecture documentation, Flask route mapping, template component analysis
---

# Green-POS Architecture Analysis Skill

_Version 1.0 - February 9, 2026_

This skill teaches agents how to analyze the Green-POS Flask application architecture to generate comprehensive context documentation. It covers blueprint structure, template patterns, model relationships, and design pattern detection.

**Purpose**: Generate technical documentation by analyzing Green-POS codebase structure, patterns, and relationships.

---

## When to Use This Skill

Use this skill when:
- Analyzing Green-POS architecture for documentation
- Mapping relationships between blueprints, models, and templates
- Detecting design patterns in the codebase
- Generating context for onboarding or feature development
- Understanding component dependencies and data flow

---

## Core Concepts

### 1. Green-POS Architecture Overview

```
Green-POS (Flask 3.0+)
├── app.py              # Factory Pattern - create_app()
├── config.py           # Configuration by environment
├── extensions.py       # Shared extensions (db, login_manager)
├── routes/            # 11 Blueprints (modular)
│   ├── __init__.py    # Blueprint registration
│   ├── auth.py        # Authentication
│   ├── dashboard.py   # Main dashboard
│   ├── products.py    # Inventory management
│   ├── services.py    # Appointments system
│   ├── invoices.py    # Billing with credit notes
│   └── ...
├── models/            # SQLAlchemy models
│   └── models.py      # User, Customer, Pet, Product, Invoice, etc.
├── templates/         # Jinja2 templates
│   ├── layout.html    # Base template
│   └── {module}/      # Feature-specific templates
├── static/            # CSS, JS, assets
├── utils/             # Helpers, decorators, filters
└── migrations/        # Database migrations
```

### 2. Blueprint Analysis Pattern

**What to Extract from Each Blueprint:**

| Component | Pattern | Example |
|-----------|---------|---------|
| Blueprint Name | `bp = Blueprint('name', ...)` | `products_bp = Blueprint('products', __name__)` |
| URL Prefix | `app.register_blueprint(bp, url_prefix='/prefix')` | `url_prefix='/products'` |
| Routes | `@bp.route('/path', methods=[...])` | `@products_bp.route('/', methods=['GET'])` |
| Decorators | `@login_required`, `@admin_required` | Authorization patterns |
| Template Rendering | `render_template('path/file.html', ...)` | Template relationships |
| Model Usage | `Model.query.filter_by(...).all()` | Data access patterns |

**Blueprint Discovery Workflow:**

```python
# Step 1: Find all blueprint files
Search: routes/**/*.py

# Step 2: For each file, extract:
# - Blueprint instantiation
# - Route definitions
# - Authorization decorators
# - Template references
# - Model dependencies

# Step 3: Map relationships
# - Blueprint → Templates (render_template calls)
# - Blueprint → Models (query operations)
# - Blueprint → Other Blueprints (redirects, url_for)
```

---

## Analysis Workflows

### Workflow 1: Blueprint-to-Template Mapping

**Purpose**: Understand which templates are rendered by which blueprints.

```
1. Read blueprint file (e.g., routes/products.py)
2. Search for render_template() calls
3. Extract template paths
4. Note context variables passed to template
5. Check if template extends layout.html
6. Identify template-specific JS/CSS
```

**Example Output:**
```markdown
## Blueprint: products

**Routes:**
- GET `/products` → `templates/products/list.html`
  - Context: `products`, `filters`, `stats`
  - Authorization: `@login_required`
  
- GET `/products/<id>` → `templates/products/view.html`
  - Context: `product`, `stock_logs`
  - Authorization: `@login_required`
  
- POST `/products/create` → `templates/products/form.html`
  - Context: `categories`, `suppliers`
  - Authorization: `@login_required`, `@admin_required`
```

### Workflow 2: Template Component Analysis

**Purpose**: Understand template structure, inheritance, and components.

```
1. Read template file (e.g., templates/invoices/list.html)
2. Extract {% extends 'layout.html' %}
3. Identify {% block content %} overrides
4. Find Jinja2 filters used (e.g., {{ price|currency_co }})
5. Detect Bootstrap components (modals, cards, tables)
6. Extract JavaScript functionality
7. Note form IDs and naming conventions
```

**Key Patterns to Detect:**

| Pattern | What to Look For | Example |
|---------|------------------|---------|
| Layout Extension | `{% extends 'layout.html' %}` | Base template usage |
| Block Overrides | `{% block title %}`, `{% block content %}` | Template inheritance |
| Loops | `{% for item in items %}` | Data iteration |
| Conditionals | `{% if condition %}` | Logic in templates |
| Custom Filters | `{{ value\|filter_name }}` | Custom Jinja2 filters |
| URL Generation | `{{ url_for('blueprint.route', id=item.id) }}` | Route references |
| Bootstrap Components | `class="modal"`, `class="card"` | UI patterns |
| DataTables | `$('#table-id').DataTable(...)` | Dynamic tables |
| Form IDs | `id="product-form"`, `id="name-input"` | Naming conventions |

### Workflow 3: Model Relationship Mapping

**Purpose**: Understand SQLAlchemy model relationships and dependencies.

```
1. Read models/models.py
2. Extract all model classes
3. For each model:
   - List fields with types
   - List foreign keys
   - List relationships (db.relationship)
   - Note backrefs
   - Identify cascade rules
4. Build relationship graph
```

**Example Output:**
```markdown
## Model: Invoice

**Fields:**
- `id` (Integer, PK)
- `number` (String, unique)
- `customer_id` (FK → Customer.id)
- `document_type` (String: 'invoice', 'credit_note')
- `total` (Float)

**Relationships:**
- `customer` → Customer (many-to-one)
- `items` → InvoiceItem[] (one-to-many, cascade delete)
- `appointment` → Appointment (one-to-one, optional)
- `reference_invoice` → Invoice (self-referential for NCs)

**Patterns:**
- Single Table Inheritance (document_type discriminator)
- Cascade delete for dependent items
- Optional relationship to appointments
```

### Workflow 4: Design Pattern Detection

**Purpose**: Identify and document design patterns used in Green-POS.

**Patterns to Detect:**

| Pattern | Indicators | Where |
|---------|-----------|-------|
| **Factory Pattern** | `create_app()`, `def create_*()` | app.py, utils/ |
| **Repository Pattern** | Static methods for queries | models/models.py |
| **Decorator Pattern** | `@login_required`, `@admin_required` | utils/decorators.py |
| **Observer Pattern** | SQLAlchemy event listeners | models/models.py |
| **Strategy Pattern** | Payment method processing | routes/invoices.py |
| **Template Method** | Base CRUD operations | routes/ blueprints |
| **Builder Pattern** | WhatsApp message construction | templates/ |
| **Adapter Pattern** | Timezone conversion | utils/timezone.py |
| **Composite Pattern** | Appointment → PetService[] | models/models.py |
| **State Pattern** | Appointment status transitions | models/models.py |

**Detection Example (Factory Pattern):**
```python
# Search for: def create_app()
# File: app.py

def create_app(config_name='development'):
    """Factory Pattern - creates Flask app with config."""
    app = Flask(__name__)
    app.config.from_object(config[config_name])
    
    # Initialize extensions
    db.init_app(app)
    login_manager.init_app(app)
    
    # Register blueprints
    register_blueprints(app)
    
    return app
```

---

## Context Generation Patterns

### Pattern 1: Feature Context Document

**Template: `.context/active/{feature}/feature-context.md`**

```markdown
# Feature: {Feature Name}

**Date**: {Date}
**Status**: Active/Complete
**Related Tickets**: {Jira IDs if applicable}

## Architecture Components

### Blueprints
- **Primary**: `routes/{blueprint}.py`
- **Supporting**: `routes/{other}.py`

### Models
- **Primary**: `{Model}` (fields: id, name, ...)
- **Related**: `{RelatedModel}` via foreign key

### Templates
- List: `templates/{module}/list.html`
- Form: `templates/{module}/form.html`
- View: `templates/{module}/view.html`

## Design Patterns Used
- {Pattern Name}: {Description of usage}

## Data Flow
1. User action → Route
2. Route → Model query
3. Model → Database
4. Response → Template rendering
5. Template → User

## Key Files
- `routes/{module}.py` - {Description}
- `models/models.py` - {Model definitions}
- `templates/{module}/` - {UI templates}

## Dependencies
- Bootstrap 5.3+ for UI
- SQLAlchemy for ORM
- Flask-Login for auth
```

### Pattern 2: CONTEXT.md (General)

**Template: `CONTEXT.md` (root or feature folder)**

```markdown
# Green-POS Context: {Feature/Module}

**Generated**: {Date}
**Scope**: {What this context covers}

## Quick Summary
{2-3 sentence overview}

## Architecture
- **Blueprints**: {List}
- **Models**: {List}
- **Templates**: {List}

## Key Patterns
- {Pattern}: {Usage}

## Recent Changes
- {Change description}

## How to Navigate
- Entry point: {File path}
- Key routes: {List}
- Main templates: {List}

## Testing
- Validate: {Steps to test}
```

---

## Analysis Commands for Agent

### Command 1: Analyze Single Blueprint

```
Input: Blueprint name (e.g., "products")

Steps:
1. Read routes/products.py
2. Extract routes with @bp.route decorators
3. Find render_template calls
4. Identify model queries
5. List authorization decorators
6. Generate blueprint documentation

Output: Markdown section for blueprint
```

### Command 2: Map Feature Dependencies

```
Input: Feature name (e.g., "credit notes")

Steps:
1. Search for model definitions (Invoice, CreditNoteApplication)
2. Find blueprints using those models (grep search)
3. Find templates rendering those models (grep search)
4. Identify relationships to other features
5. Generate dependency graph

Output: Feature context document
```

### Command 3: Generate Architecture Overview

```
Input: None (analyzes entire project)

Steps:
1. List all blueprints in routes/
2. List all models in models/models.py
3. Identify template directories
4. Detect design patterns
5. Map high-level relationships
6. Generate CONTEXT.md

Output: Complete architecture document
```

---

## Semantic Search Queries for Context Gathering

### Finding Blueprints
```
Query: "Flask blueprint registration create app"
Files: app.py, routes/__init__.py
```

### Finding Models
```
Query: "class {ModelName}(db.Model)"
Files: models/models.py
```

### Finding Templates
```
Query: "render_template {feature}"
Files: routes/*.py
```

### Finding Patterns
```
Query: "def create_ factory pattern static method"
Files: **/*.py
```

### Finding Authorization
```
Query: "@login_required @admin_required decorator"
Files: routes/*.py, utils/decorators.py
```

---

## Green-POS Specific Knowledge

### Naming Conventions

**Blueprint Routes:**
- Pattern: `{resource}_{action}`
- Example: `product_list()`, `invoice_create()`, `customer_edit()`

**Template IDs:**
- Pattern: `{field}-{type}`, `{action}-btn`
- Examples: `name-input`, `save-btn`, `delete-modal`

**Model Fields:**
- Created timestamps: `created_at` (UTC)
- Updated timestamps: `updated_at` (UTC)
- Soft deletes: Not used (hard delete with cascade)

### Timezone Handling

| Field | Storage | Display |
|-------|---------|---------|
| `Invoice.date` | UTC | CO_TZ (America/Bogota) |
| `Appointment.scheduled_at` | Local | Local (no conversion) |
| `created_at`, `updated_at` | UTC | CO_TZ |

**Filter**: `format_time_co` - Converts UTC to Colombia time

### Important Constraints

**From copilot-instructions.md:**
- NO jQuery (Bootstrap 5 + Vanilla JS only)
- NO emojis in Python print statements (production server encoding issue)
- SQLite limitations: Single writer, no concurrent writes
- Stock changes: Require `ProductStockLog` entry with reason

---

## Example Analysis Session

### Scenario: Analyze Credit Notes Feature

**Input**: "Analyze credit notes system"

**Agent Workflow:**

```python
# Step 1: Find models
semantic_search("credit note single table inheritance")
Read: models/models.py → Invoice model with document_type

# Step 2: Find blueprint
grep_search("credit_note", includePattern="routes/*.py")
Read: routes/invoices.py → create_credit_note route

# Step 3: Find templates
grep_search("credit_note", includePattern="templates/**/*.html")
Read: templates/invoices/view.html → credit note modal

# Step 4: Detect pattern
Identify: Single Table Inheritance (document_type discriminator)

# Step 5: Generate context
Create: .context/active/credit-notes/feature-context.md
```

**Output Document:**

```markdown
# Feature: Credit Notes (DIAN Compliant)

**Date**: February 9, 2026
**Status**: Complete
**Related Tickets**: v2.1

## Architecture Components

### Models
- **Primary**: `Invoice` (document_type='credit_note')
- **Related**: `CreditNoteApplication` (tracking redemptions)
- **Pattern**: Single Table Inheritance

### Blueprints
- **Primary**: `routes/invoices.py`
  - `POST /invoices/<id>/create_credit_note` - Create NC
  - `GET /invoices` - List with NC discrimination

### Templates
- Modal: `templates/invoices/view.html` (NC creation form)
- List: `templates/invoices/list.html` (NC display with icons)

## Design Patterns Used
- **Single Table Inheritance**: Invoice/CreditNote share table with discriminator
- **State Pattern**: NC lifecycle (created → applied → redeemed)
- **Repository Pattern**: `Invoice.search_by_any_code()`

## Data Flow
1. User creates NC from invoice detail page
2. Modal form captures products to return + reason
3. POST to `/invoices/<id>/create_credit_note`
4. Creates NC (document_type='credit_note')
5. Restores stock via ProductStockLog
6. Increments `customer.credit_balance`
7. Redirects to NC detail view

## Key Files
- `routes/invoices.py` (lines 450-520) - NC creation logic
- `models/models.py` (Invoice class) - STI implementation
- `templates/invoices/view.html` - NC modal UI

## Business Rules
- Only paid/validated invoices can have NCs (temporal: bypassed for testing)
- Stock restored automatically on NC creation
- NC balance tracked in `customer.credit_balance`
- FIFO redemption when applying NC to new invoices

## Testing
1. Create invoice → Mark as paid
2. Click "Crear Nota de Crédito"
3. Select products to return + reason
4. Verify: Stock restored, balance increased
5. Create new invoice with NC payment method
6. Verify: Balance reduced correctly
```

---

## Quick Reference

### Files to Always Check
- `app.py` - Factory pattern, blueprint registration
- `routes/__init__.py` - All blueprint imports
- `models/models.py` - All model definitions
- `templates/layout.html` - Base template with navbar
- `.github/copilot-instructions.md` - Project constraints and patterns

### Key Patterns Document Location
- Patterns: `.github/copilot-instructions.md` (lines 395-820)
- Architecture: `.github/copilot-instructions.md` (lines 349-394)
- Constraints: `.github/copilot-instructions.md` (lines 20-148)

### Context Repository Structure
- `.context/project/` - Permanent knowledge (architecture, patterns)
- `.context/active/{feature}/` - Semi-permanent feature docs
- `.context/sessions/` - Ephemeral session notes (delete after)

---

## Success Criteria

A complete architecture analysis includes:
- ✅ All blueprints documented with routes
- ✅ Model relationships mapped
- ✅ Template inheritance understood
- ✅ Design patterns identified
- ✅ Data flow documented
- ✅ Dependencies listed
- ✅ Context document generated
- ✅ Ready for handoff to developers

---

## Related Resources

- [Flask Documentation](https://flask.palletsprojects.com/)
- [SQLAlchemy ORM](https://www.sqlalchemy.org/)
- [Jinja2 Templates](https://jinja.palletsprojects.com/)
- [Bootstrap 5](https://getbootstrap.com/docs/5.3/)
