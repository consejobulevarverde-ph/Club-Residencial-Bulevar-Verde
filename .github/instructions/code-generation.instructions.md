---
applyTo: "**/*.py,**/*.js,**/*.html"
---

# Instrucciones Específicas para Generación de Código - Green-POS

## 🎯 Objetivo
Este archivo proporciona instrucciones detalladas para la generación de código nuevo en el proyecto Green-POS, asegurando consistencia, calidad y adherencia a los estándares del proyecto.

## 📋 Principios Fundamentales de Generación de Código

### 1. Código Limpio y Productivo
- **NUNCA** incluir código de debugging en código generado (prints, console.logs, alerts)
- **SIEMPRE** generar código production-ready desde el inicio
- Si se necesita debugging temporal, marcarlo explícitamente con `# DEBUG:`, `# TODO:`, `# TEMP:`
- Validar tanto en backend como frontend antes de considerar completo

### 2. Documentación Obligatoria
- **Python**: Incluir docstrings para todas las funciones públicas
- **JavaScript**: Comentarios JSDoc para funciones complejas
- **HTML**: Comentarios descriptivos para secciones importantes
- Explicar la lógica compleja, no lo obvio

### 3. Manejo de Errores Robusto
- **SIEMPRE** incluir try-catch/except en operaciones que puedan fallar
- Proporcionar mensajes de error claros y útiles al usuario
- Logear errores críticos con `app.logger.error()`
- Usar flash messages para feedback al usuario en Flask

## 🐍 Generación de Código Python/Flask

### Estructura de Rutas CRUD
Al generar rutas Flask, seguir este patrón estándar:

```python
@app.route('/entity')
@login_required
def entity_list():
    """Lista todas las entidades con paginación."""
    page = request.args.get('page', 1, type=int)
    entities = Entity.query.paginate(page=page, per_page=10)
    return render_template('entity/list.html', entities=entities)

@app.route('/entity/new')
@login_required
def entity_new():
    """Muestra formulario para crear nueva entidad."""
    return render_template('entity/form.html')

@app.route('/entity/create', methods=['POST'])
@login_required
def entity_create():
    """Procesa la creación de nueva entidad."""
    try:
        entity = Entity(
            name=request.form.get('name'),
            created_at=datetime.now(CO_TZ)
        )
        db.session.add(entity)
        db.session.commit()
        flash('Entidad creada exitosamente', 'success')
        return redirect(url_for('entity_list'))
    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Error creando entidad: {str(e)}')
        flash('Error al crear la entidad', 'danger')
        return redirect(url_for('entity_new'))

@app.route('/entity/<int:id>')
@login_required
def entity_view(id):
    """Muestra detalle de una entidad."""
    entity = Entity.query.get_or_404(id)
    return render_template('entity/view.html', entity=entity)

@app.route('/entity/<int:id>/edit')
@login_required
def entity_edit(id):
    """Muestra formulario para editar entidad."""
    entity = Entity.query.get_or_404(id)
    return render_template('entity/form.html', entity=entity)

@app.route('/entity/<int:id>/update', methods=['POST'])
@login_required
def entity_update(id):
    """Procesa la actualización de entidad."""
    try:
        entity = Entity.query.get_or_404(id)
        entity.name = request.form.get('name')
        entity.updated_at = datetime.now(CO_TZ)
        db.session.commit()
        flash('Entidad actualizada exitosamente', 'success')
        return redirect(url_for('entity_view', id=id))
    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Error actualizando entidad: {str(e)}')
        flash('Error al actualizar la entidad', 'danger')
        return redirect(url_for('entity_edit', id=id))

@app.route('/entity/<int:id>/delete', methods=['POST'])
@login_required
@admin_required
def entity_delete(id):
    """Elimina una entidad."""
    try:
        entity = Entity.query.get_or_404(id)
        db.session.delete(entity)
        db.session.commit()
        flash('Entidad eliminada exitosamente', 'success')
    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Error eliminando entidad: {str(e)}')
        flash('Error al eliminar la entidad', 'danger')
    return redirect(url_for('entity_list'))
```

### Modelos SQLAlchemy
Al generar modelos, incluir:

```python
class Entity(db.Model):
    """Modelo para entidades del sistema."""
    __tablename__ = 'entities'
    
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(CO_TZ))
    updated_at = db.Column(db.DateTime, onupdate=lambda: datetime.now(CO_TZ))
    
    # Relaciones
    items = db.relationship('Item', backref='entity', lazy=True)
    
    def __repr__(self):
        return f'<Entity {self.name}>'
    
    def to_dict(self):
        """Serializa el modelo a diccionario."""
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'active': self.active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }
```

### Validación de Datos
**SIEMPRE** validar en backend:

```python
def validate_entity_data(form_data):
    """Valida datos de entidad antes de guardar."""
    errors = []
    
    if not form_data.get('name'):
        errors.append('El nombre es requerido')
    elif len(form_data.get('name')) > 100:
        errors.append('El nombre no puede exceder 100 caracteres')
    
    if form_data.get('email') and '@' not in form_data.get('email'):
        errors.append('Email inválido')
    
    return errors
```

### Zona Horaria
**CRÍTICO**: Usar siempre `datetime.now(CO_TZ)` para timestamps:

```python
from datetime import datetime
from pytz import timezone

CO_TZ = timezone('America/Bogota')

# Correcto ✅
created_at = datetime.now(CO_TZ)

# Incorrecto ❌
created_at = datetime.now()
```

## 🎨 Generación de Código HTML/Templates

### Estructura Base
Usar `layout.html` como plantilla base:

```html
{% extends "layout.html" %}

{% block title %}Título de la Página{% endblock %}

{% block content %}
<div class="container-fluid">
    <!-- Breadcrumb -->
    <nav aria-label="breadcrumb">
        <ol class="breadcrumb">
            <li class="breadcrumb-item"><a href="{{ url_for('index') }}">Inicio</a></li>
            <li class="breadcrumb-item"><a href="{{ url_for('entity_list') }}">Entidades</a></li>
            <li class="breadcrumb-item active">Detalle</li>
        </ol>
    </nav>

    <!-- Título y Acciones -->
    <div class="d-flex justify-content-between align-items-center mb-4">
        <h2><i class="fas fa-icon"></i> Título de Sección</h2>
        <div>
            <a href="{{ url_for('entity_new') }}" class="btn btn-primary">
                <i class="fas fa-plus"></i> Nuevo
            </a>
        </div>
    </div>

    <!-- Mensajes Flash -->
    {% with messages = get_flashed_messages(with_categories=true) %}
        {% if messages %}
            {% for category, message in messages %}
                <div class="alert alert-{{ category }} alert-dismissible fade show" role="alert">
                    {{ message }}
                    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                </div>
            {% endfor %}
        {% endif %}
    {% endwith %}

    <!-- Contenido Principal -->
    <div class="card">
        <div class="card-body">
            <!-- Contenido aquí -->
        </div>
    </div>
</div>
{% endblock %}
```

### Formularios
Incluir validación frontend y backend con **IDs descriptivos siguiendo convenciones kebab-case**:

```html
<form id="entity-form" method="POST" action="{{ url_for('entity_create') }}" class="needs-validation" novalidate>
    <div class="mb-3">
        <label for="name-input" class="form-label">Nombre <span class="text-danger">*</span></label>
        <input type="text" 
               class="form-control" 
               id="name-input" 
               name="name" 
               value="{{ entity.name if entity else '' }}"
               required
               maxlength="100">
        <div class="invalid-feedback">
            Por favor ingrese un nombre válido
        </div>
    </div>

    <div class="mb-3">
        <label for="description-textarea" class="form-label">Descripción</label>
        <textarea class="form-control" 
                  id="description-textarea" 
                  name="description" 
                  rows="3">{{ entity.description if entity else '' }}</textarea>
    </div>

    <div class="mb-3">
        <label for="category-select" class="form-label">Categoría</label>
        <select class="form-select" id="category-select" name="category">
            <option value="">Seleccione...</option>
            {% for cat in categories %}
            <option value="{{ cat }}">{{ cat }}</option>
            {% endfor %}
        </select>
    </div>

    <div class="d-flex justify-content-between">
        <a href="{{ url_for('entity_list') }}" class="btn btn-secondary" id="cancel-btn">
            <i class="fas fa-arrow-left"></i> Cancelar
        </a>
        <button type="submit" class="btn btn-primary" id="save-btn">
            <i class="fas fa-save"></i> Guardar
        </button>
    </div>
</form>
```

**Convenciones de IDs (OBLIGATORIAS):**
- **Formularios**: `{module}-form` (ej: `product-form`, `invoice-form`)
- **Inputs**: `{field}-input` (ej: `name-input`, `email-input`)
- **Selects**: `{field}-select` (ej: `category-select`, `customer-select`)
- **Textareas**: `{field}-textarea` (ej: `notes-textarea`, `description-textarea`)
- **Botones**: `{action}-btn` (ej: `save-btn`, `delete-btn`, `cancel-btn`)
- **Tablas**: `{module}-table` (ej: `products-table`, `invoices-table`)
- **Modales**: `{purpose}-modal` (ej: `delete-modal`, `confirm-modal`)

Ver guía completa en: `.github/instructions/frontend-html-agent.instructions.md` sección "Buenas Prácticas de Naming de IDs"

### Tablas con DataTables
Para listas de datos con **IDs descriptivos**:

```html
<table id="entity-table" class="table table-striped table-hover">
    <thead>
        <tr>
            <th>ID</th>
            <th>Nombre</th>
            <th>Estado</th>
            <th>Fecha</th>
            <th>Acciones</th>
        </tr>
    </thead>
    <tbody>
        {% for entity in entities %}
        <tr>
            <td>{{ entity.id }}</td>
            <td>{{ entity.name }}</td>
            <td>
                <span class="badge bg-{{ 'success' if entity.active else 'secondary' }}">
                    {{ 'Activo' if entity.active else 'Inactivo' }}
                </span>
            </td>
            <td>{{ entity.created_at.strftime('%d/%m/%Y') }}</td>
            <td>
                <a href="{{ url_for('entity_view', id=entity.id) }}" 
                   class="btn btn-sm btn-info" 
                   title="Ver">
                    <i class="fas fa-eye"></i>
                </a>
                <a href="{{ url_for('entity_edit', id=entity.id) }}" 
                   class="btn btn-sm btn-warning" 
                   title="Editar">
                    <i class="fas fa-edit"></i>
                </a>
                <button class="btn btn-sm btn-danger" 
                        onclick="confirmDelete({{ entity.id }})" 
                        title="Eliminar">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
        {% endfor %}
    </tbody>
</table>
```

## 💻 Generación de Código JavaScript

### Estructura y Organización
Código en `static/js/main.js`:

```javascript
// Inicialización al cargar la página
$(document).ready(function() {
    initializeDataTables();
    initializeFormValidation();
    initializeSearchAutocomplete();
});

/**
 * Inicializa DataTables para tablas de datos
 */
function initializeDataTables() {
    if ($('#entityTable').length) {
        $('#entityTable').DataTable({
            language: {
                url: '//cdn.datatables.net/plug-ins/1.13.4/i18n/es-ES.json'
            },
            pageLength: 10,
            order: [[0, 'desc']]
        });
    }
}

/**
 * Inicializa validación de formularios Bootstrap
 */
function initializeFormValidation() {
    const forms = document.querySelectorAll('.needs-validation');
    Array.from(forms).forEach(form => {
        form.addEventListener('submit', event => {
            if (!form.checkValidity()) {
                event.preventDefault();
                event.stopPropagation();
            }
            form.classList.add('was-validated');
        }, false);
    });
}

/**
 * Confirma eliminación de entidad
 * @param {number} id - ID de la entidad a eliminar
 */
function confirmDelete(id) {
    if (confirm('¿Está seguro de eliminar este registro?')) {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = `/entity/${id}/delete`;
        document.body.appendChild(form);
        form.submit();
    }
}
```

### AJAX y Búsquedas
Para autocompletado y búsquedas:

```javascript
/**
 * Inicializa autocompletado de búsqueda
 */
function initializeSearchAutocomplete() {
    $('#searchInput').on('input', debounce(function() {
        const query = $(this).val();
        if (query.length >= 2) {
            searchEntities(query);
        }
    }, 300));
}

/**
 * Busca entidades mediante AJAX
 * @param {string} query - Término de búsqueda
 */
function searchEntities(query) {
    $.ajax({
        url: '/api/entities/search',
        method: 'GET',
        data: { q: query },
        success: function(data) {
            displaySearchResults(data);
        },
        error: function(xhr, status, error) {
            console.error('Error en búsqueda:', error);
            showAlert('Error al realizar la búsqueda', 'danger');
        }
    });
}

/**
 * Debounce para limitar llamadas a funciones
 * @param {Function} func - Función a ejecutar
 * @param {number} wait - Tiempo de espera en ms
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Muestra alerta Bootstrap
 * @param {string} message - Mensaje a mostrar
 * @param {string} type - Tipo de alerta (success, danger, warning, info)
 */
function showAlert(message, type = 'info') {
    const alertHtml = `
        <div class="alert alert-${type} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    $('.container-fluid').prepend(alertHtml);
}
```

## 🔐 Seguridad y Validación

### Siempre Implementar
1. **Decoradores de autenticación**: `@login_required`, `@admin_required`
2. **Validación de entrada**: Backend y frontend
3. **Sanitización**: Especialmente en uploads de archivos
4. **Prevención SQL Injection**: Usar ORM (SQLAlchemy)
5. **CSRF Protection**: En formularios POST
6. **Hasheo de contraseñas**: Werkzeug security

### Ejemplo de Ruta Segura
```python
@app.route('/admin/users/<int:id>/update', methods=['POST'])
@login_required
@admin_required
def admin_user_update(id):
    """Actualiza usuario (solo admin)."""
    try:
        # Validar datos
        errors = validate_user_data(request.form)
        if errors:
            for error in errors:
                flash(error, 'danger')
            return redirect(url_for('admin_user_edit', id=id))
        
        # Actualizar
        user = User.query.get_or_404(id)
        user.username = request.form.get('username')
        user.email = request.form.get('email')
        
        # Hash password solo si se cambió
        new_password = request.form.get('password')
        if new_password:
            user.password = generate_password_hash(new_password)
        
        user.updated_at = datetime.now(CO_TZ)
        db.session.commit()
        
        app.logger.info(f'Usuario {user.username} actualizado por {current_user.username}')
        flash('Usuario actualizado exitosamente', 'success')
        return redirect(url_for('admin_user_list'))
    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Error actualizando usuario: {str(e)}')
        flash('Error al actualizar usuario', 'danger')
        return redirect(url_for('admin_user_edit', id=id))
```

## 📊 APIs REST

### Estructura de API Endpoints
```python
@app.route('/api/entities/search')
@login_required
def api_entities_search():
    """API: Busca entidades por término."""
    try:
        query = request.args.get('q', '')
        if len(query) < 2:
            return jsonify({'error': 'Query demasiado corto'}), 400
        
        entities = Entity.query.filter(
            Entity.name.ilike(f'%{query}%')
        ).limit(10).all()
        
        return jsonify({
            'success': True,
            'data': [entity.to_dict() for entity in entities],
            'count': len(entities)
        })
    except Exception as e:
        app.logger.error(f'Error en búsqueda API: {str(e)}')
        return jsonify({'error': 'Error interno del servidor'}), 500
```

## 🎯 Checklist de Código Generado

Antes de considerar completo el código generado, verificar:

### Backend (Python/Flask)
- [ ] Rutas siguen patrón CRUD estándar
- [ ] Decoradores de autenticación/autorización aplicados
- [ ] Manejo de errores con try/except
- [ ] Validación de datos implementada
- [ ] Zona horaria CO_TZ usada en timestamps
- [ ] Flash messages para feedback al usuario
- [ ] Logging de acciones críticas
- [ ] Transacciones de BD con rollback en errores
- [ ] Docstrings en funciones públicas
- [ ] Type hints donde sea posible

### Frontend (HTML/Templates)
- [ ] Extiende layout.html
- [ ] Breadcrumbs de navegación incluidos
- [ ] Mensajes flash renderizados
- [ ] Formularios con validación HTML5
- [ ] Clases Bootstrap 5 correctas
- [ ] Iconos Font Awesome consistentes
- [ ] Responsive design implementado
- [ ] Accesibilidad considerada (aria-labels)

### JavaScript
- [ ] Código en static/js/main.js
- [ ] Validación de formularios implementada
- [ ] Manejo de errores en AJAX
- [ ] Funciones documentadas con JSDoc
- [ ] Debounce en búsquedas
- [ ] No hay console.log en producción

### General
- [ ] Sin código de debugging temporal
- [ ] Sin comentarios TODO/FIXME sin resolver
- [ ] Nomenclatura consistente
- [ ] Código DRY (Don't Repeat Yourself)
- [ ] Performance considerado (paginación, índices)
- [ ] Probado manualmente antes de commit

## 🚫 Anti-Patrones a Evitar

### NO Hacer:
```python
# ❌ Sin manejo de errores
@app.route('/entity/create', methods=['POST'])
def entity_create():
    entity = Entity(name=request.form.get('name'))
    db.session.add(entity)
    db.session.commit()
    return redirect(url_for('entity_list'))

# ❌ Sin validación
@app.route('/entity/create', methods=['POST'])
def entity_create():
    name = request.form.get('name')  # ¿Qué pasa si name es None?
    entity = Entity(name=name)

# ❌ Datetime sin zona horaria
created_at = datetime.now()  # ❌

# ❌ SQL directo (riesgo de injection)
db.session.execute(f"SELECT * FROM users WHERE name='{name}'")  # ❌

# ❌ Contraseñas en texto plano
user.password = request.form.get('password')  # ❌
```

### SÍ Hacer:
```python
# ✅ Con manejo de errores completo
@app.route('/entity/create', methods=['POST'])
@login_required
def entity_create():
    try:
        # Validar
        name = request.form.get('name')
        if not name:
            flash('El nombre es requerido', 'danger')
            return redirect(url_for('entity_new'))
        
        # Crear
        entity = Entity(
            name=name,
            created_at=datetime.now(CO_TZ)
        )
        db.session.add(entity)
        db.session.commit()
        
        flash('Entidad creada exitosamente', 'success')
        return redirect(url_for('entity_list'))
    except Exception as e:
        db.session.rollback()
        app.logger.error(f'Error: {str(e)}')
        flash('Error al crear la entidad', 'danger')
        return redirect(url_for('entity_new'))

# ✅ Con validación
def validate_and_create():
    errors = validate_entity_data(request.form)
    if errors:
        return errors
    # Continuar con creación

# ✅ Datetime con zona horaria
created_at = datetime.now(CO_TZ)  # ✅

# ✅ ORM (previene SQL injection)
Entity.query.filter_by(name=name).first()  # ✅

# ✅ Contraseñas hasheadas
user.password = generate_password_hash(password)  # ✅
```

## 📝 Notas Finales

- **Prioridad 1**: Código funcional y seguro
- **Prioridad 2**: Código limpio y mantenible
- **Prioridad 3**: Código optimizado

Recuerda: Es mejor generar código completo y correcto desde el inicio que tener que refactorizar después.
