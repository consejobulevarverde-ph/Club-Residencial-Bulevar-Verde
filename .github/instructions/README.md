# 🤖 Sistema de Agents - Green-POS

## 📋 Descripción General

Este directorio contiene **tres agents especializados** para el desarrollo del sistema Green-POS. Cada agent está diseñado para enfocarse en una capa específica de la aplicación, siguiendo la arquitectura de tres capas del proyecto.

---

## 🎯 Agents Disponibles

### 1. 🎨 Frontend HTML Agent
**Archivo**: [`frontend-html-agent.instructions.md`](./frontend-html-agent.instructions.md)

**Responsabilidades**:
- Templates Jinja2 con Bootstrap 5.3+
- JavaScript Vanilla (sin jQuery)
- Componentes UI reutilizables
- Responsive design mobile-first
- Validación cliente y UX

**Cuándo usar**:
- Crear/modificar templates HTML
- Implementar componentes visuales
- Agregar interactividad JavaScript
- Diseñar formularios y validaciones
- Ajustar estilos CSS

**Expertise**:
- Bootstrap 5.3+ y componentes
- Jinja2 template engine
- JavaScript moderno (ES6+)
- Patrones UI/UX
- Accesibilidad web

---

### 2. 🐍 Backend Python Agent
**Archivo**: [`backend-python-agent.instructions.md`](./backend-python-agent.instructions.md)

**Responsabilidades**:
- Rutas Flask (CRUD completo)
- Lógica de negocio
- Validación de datos
- Autenticación y autorización
- APIs JSON

**Cuándo usar**:
- Crear/modificar rutas Flask
- Implementar lógica de negocio
- Validar datos del servidor
- Gestionar autenticación
- Crear endpoints API

**Expertise**:
- Flask 3.0+ y extensiones
- SQLAlchemy ORM
- Patrones de diseño (SOLID)
- Seguridad web
- Manejo de transacciones

---

### 3. 🗄️ Database SQLite Agent
**Archivo**: [`database-sqlite-agent.instructions.md`](./database-sqlite-agent.instructions.md)

**Responsabilidades**:
- Modelos SQLAlchemy
- Relaciones entre modelos
- Migraciones de schema
- Optimización de queries
- Constraints e índices

**Cuándo usar**:
- Crear/modificar modelos
- Definir relaciones
- Agregar campos a tablas
- Optimizar queries
- Realizar migraciones

**Expertise**:
- SQLAlchemy ORM
- SQLite constraints
- Normalización de datos
- Índices y performance
- Migraciones manuales

---

## 🚀 Cómo Usar los Agents

### Método 1: Especificar Agent en el Prompt
```
@frontend-html-agent
Necesito crear un formulario de búsqueda de clientes con autocompletado.
El formulario debe tener:
- Input de búsqueda con validación HTML5
- Lista de resultados con efecto hover
- Selección de cliente al hacer click
```

```
@backend-python-agent
Implementa la ruta /api/customers/search para el autocompletado.
Debe buscar por nombre, documento o teléfono y devolver JSON con:
- id, name, document, phone, email
- Límite de 10 resultados
- Mínimo 2 caracteres de búsqueda
```

```
@database-sqlite-agent
Necesito agregar un campo 'loyalty_points' (Integer) al modelo Customer.
Debe incluir:
- Migración para agregar el campo
- Valor por defecto: 0
- Método para calcular puntos
```

### Método 2: Contexto por Tipo de Tarea

#### Frontend (HTML/CSS/JS)
```
Estoy trabajando en la interfaz de usuario.

Necesito crear un modal de confirmación para eliminar productos.
Debe usar Bootstrap 5 con:
- Header con icono de advertencia
- Cuerpo con mensaje personalizado
- Footer con botones Cancelar (gris) y Eliminar (rojo)
- Animación fade al abrir/cerrar

Seguir patrones del Frontend Agent.
```

#### Backend (Lógica/Rutas)
```
Estoy trabajando en la lógica de negocio.

Necesito implementar la finalización de citas:
1. Validar que la cita esté en estado 'pending'
2. Crear factura automáticamente con los servicios
3. Actualizar estado de cita a 'done'
4. Marcar servicios como completados
5. Registrar en logs

Usar try-except con rollback según Backend Agent.
```

#### Database (Modelos/Schema)
```
Estoy trabajando en la base de datos.

Necesito crear un modelo 'Promotion' para descuentos:
- Campos: code (unique), name, discount_percentage, start_date, end_date, active
- Relación Many-to-Many con Product
- Método is_valid() para verificar fechas
- Timestamps created_at, updated_at

Seguir patrones del Database Agent.
```

---

## 🔄 Workflow de Desarrollo Multi-Agent

### Ejemplo: Feature Completa "Búsqueda de Clientes con Autocompletado"

#### Paso 1: Database Agent - Modelo
```markdown
@database-sqlite-agent

Verificar que el modelo Customer tenga:
- Índices en: name, document, phone
- Campo email (String 120)
- Método to_dict() para serialización JSON

Si falta algo, agregar con migración.
```

#### Paso 2: Backend Agent - API
```markdown
@backend-python-agent

Implementar endpoint:
GET /api/customers/search?q=<query>&limit=<limit>

Funcionalidad:
- Buscar en name, document, phone con LIKE
- Mínimo 2 caracteres
- Devolver JSON array con: id, name, document, phone, email
- Límite default: 10 resultados
- Validar autenticación (@login_required)
```

#### Paso 3: Frontend Agent - UI
```markdown
@frontend-html-agent

Crear componente de autocompletado en templates/customers/search.html

HTML:
- Input de búsqueda con icono de lupa
- Div de resultados (hidden por defecto)
- Items clickeables con datos del cliente

JavaScript:
- Event listener en input con debounce (300ms)
- Fetch API para llamar /api/customers/search
- Renderizar resultados dinámicamente
- Emit event 'customerSelected' al seleccionar
```

---

## 🎯 Patrones de Colaboración

### Frontend ↔ Backend
**Frontend necesita de Backend**:
- Endpoints API definidos (`/api/*`)
- Estructura de respuestas JSON
- Flash messages para feedback
- Context data en templates

**Backend provee a Frontend**:
```python
# Backend (app.py)
@app.route('/customers/new', methods=['GET'])
def customer_new():
    return render_template('customers/form.html',
        document_types=['CC', 'CE', 'NIT', 'Pasaporte'],
        action_url=url_for('customer_create')
    )

# Frontend espera:
# - document_types: lista para <select>
# - action_url: URL para POST del formulario
```

### Backend ↔ Database
**Backend necesita de Database**:
- Modelos SQLAlchemy actualizados
- Relaciones correctas (ForeignKey, backref)
- Métodos de negocio en modelos

**Database provee a Backend**:
```python
# Database (models.py)
class Invoice(db.Model):
    def calculate_totals(self):
        """Recalcula totales de la factura."""
        self.subtotal = sum(item.subtotal for item in self.items)
        # ...

# Backend usa:
invoice.calculate_totals()
db.session.commit()
```

### Frontend ↔ Database
**Frontend necesita de Database**:
- Nombres de campos para forms
- Enum values para selects
- Longitud máxima (maxlength)
- Validaciones de tipos

**Database provee a Frontend** (vía Backend):
```python
# Database define
class Product(db.Model):
    code = db.Column(db.String(20), unique=True)
    category = db.Column(db.String(50))

# Frontend usa
<input name="code" maxlength="20" required>
<select name="category">
    {% for cat in categories %}
    <option>{{ cat }}</option>
    {% endfor %}
</select>
```

---

## 📚 Recursos Compartidos

### Todos los Agents deben conocer:
- ✅ **copilot-instructions.md**: Contexto general del proyecto
- ✅ **Zona horaria**: America/Bogota (CO_TZ)
- ✅ **Roles de usuario**: admin, vendedor
- ✅ **Patrones de diseño**: SOLID, Repository, State, Strategy
- ✅ **Convenciones de código**: PEP 8, Bootstrap 5, Vanilla JS

### Documentación de Referencia:
- [Flask Docs](https://flask.palletsprojects.com/)
- [SQLAlchemy Docs](https://docs.sqlalchemy.org/)
- [Bootstrap 5.3 Docs](https://getbootstrap.com/docs/5.3/)
- [Jinja2 Docs](https://jinja.palletsprojects.com/)

---

## 🚨 Importante: Limpieza de Código

### Antes de Producción TODOS los agents deben:

**Frontend Agent debe eliminar**:
- `console.log()`, `console.debug()` temporales
- `alert()` de testing
- Comentarios `// TODO`, `// DEBUG`, `// TEMP`
- Funciones de test temporales

**Backend Agent debe eliminar**:
- `print()` de debugging
- `app.logger.debug()` no esenciales
- Comentarios `# TODO`, `# DEBUG`, `# TEMP`
- Imports de debugging (`pdb`, `pprint`)

**Database Agent debe eliminar**:
- Scripts de migración temporales
- Comentarios de debugging en modelos
- Campos de prueba no utilizados

### Logs Permitidos en Producción:
```python
# ✅ MANTENER:
app.logger.error(f"Error crítico: {str(e)}")
app.logger.warning(f"Acceso denegado: {user}")
app.logger.info(f"Factura {invoice.number} creada")

# ❌ ELIMINAR:
print(f"Debug: x = {x}")  # DEBUG
app.logger.debug(f"Entrando a función")  # DEBUG
```

---

## 🎓 Mejores Prácticas por Agent

### Frontend Agent
1. ✅ Siempre extender `layout.html`
2. ✅ Incluir breadcrumbs en vistas internas
3. ✅ Validar formularios cliente + servidor
4. ✅ Usar Bootstrap classes antes que CSS custom
5. ✅ JavaScript modular (IIFE pattern)

### Backend Agent
1. ✅ Type hints en funciones (Python 3.10+)
2. ✅ Try-except con rollback en transacciones
3. ✅ Docstrings Google style
4. ✅ Validación backend SIEMPRE
5. ✅ Flash messages para feedback

### Database Agent
1. ✅ Timestamps en todos los modelos
2. ✅ Índices en campos de búsqueda
3. ✅ Cascade delete cuando aplique
4. ✅ Validación de constraints en Python
5. ✅ Método `__repr__()` en todos los modelos

---

## 📋 Checklist de Coordinación

Cuando trabajes en una feature que involucra múltiples capas:

### Planificación
- [ ] Identificar qué agents se necesitan
- [ ] Definir orden de ejecución (DB → Backend → Frontend)
- [ ] Especificar dependencias entre agents

### Implementación
- [ ] **Database**: Modelo/schema actualizado
- [ ] **Backend**: Rutas y lógica implementadas
- [ ] **Frontend**: UI completada y funcional

### Testing
- [ ] **Database**: Modelo se crea/guarda correctamente
- [ ] **Backend**: Rutas responden con datos correctos
- [ ] **Frontend**: UI interactúa correctamente con backend

### Documentación
- [ ] Cada agent documentó su parte
- [ ] Dependencias claramente especificadas
- [ ] Ejemplos de uso agregados

---

## 🔧 Troubleshooting

### "El frontend no recibe datos del backend"
1. **Database Agent**: Verificar que el modelo tenga método `to_dict()`
2. **Backend Agent**: Verificar que la ruta devuelve `jsonify()`
3. **Frontend Agent**: Verificar que fetch API parsea JSON correctamente

### "Error al guardar en base de datos"
1. **Database Agent**: Verificar constraints del modelo
2. **Backend Agent**: Verificar validación antes de guardar
3. **Backend Agent**: Verificar try-except con rollback

### "La UI no se ve como esperado"
1. **Frontend Agent**: Verificar que extiende `layout.html`
2. **Frontend Agent**: Verificar clases Bootstrap correctas
3. **Frontend Agent**: Verificar responsive design en DevTools

---

## 🎯 Ejemplos de Uso por Escenario

### Escenario 1: "Agregar campo a un modelo existente"
```markdown
Agent principal: @database-sqlite-agent

Tareas:
1. Database: Agregar campo al modelo con migración
2. Backend: Actualizar rutas CRUD para incluir nuevo campo
3. Frontend: Agregar input en formularios

Orden: Database → Backend → Frontend
```

### Escenario 2: "Crear nueva feature completa"
```markdown
Agents involucrados: TODOS

Ejemplo: "Sistema de descuentos en facturas"

1. @database-sqlite-agent
   - Agregar campo 'discount' a Invoice
   - Actualizar método calculate_totals()

2. @backend-python-agent
   - Actualizar invoice_new() para manejar descuentos
   - Validar que discount <= subtotal
   - Actualizar API endpoints

3. @frontend-html-agent
   - Agregar input de descuento en templates/invoices/form.html
   - Validación JavaScript para calcular total dinámicamente
   - Mostrar descuento en vista de factura
```

### Escenario 3: "Fix de bug"
```markdown
Identificar capa afectada:

- Frontend bug (UI): @frontend-html-agent
- Backend bug (lógica): @backend-python-agent
- Database bug (schema): @database-sqlite-agent

Si el bug cruza capas, usar agents en orden:
Database → Backend → Frontend
```

---

## 📞 Contacto y Soporte

Para preguntas específicas sobre cada agent, referirse al archivo correspondiente:

- **Frontend**: `frontend-html-agent.instructions.md`
- **Backend**: `backend-python-agent.instructions.md`
- **Database**: `database-sqlite-agent.instructions.md`

**Contexto general del proyecto**: `.github/copilot-instructions.md`

---

**Última actualización**: 5 de noviembre de 2025  
**Versión del sistema**: 1.0  
**Proyecto**: Green-POS - Sistema de Punto de Venta

---

## 🎉 ¡Listo para Usar!

Los agents están configurados y listos para ayudarte en el desarrollo de Green-POS. Simplemente menciona el agent que necesitas en tu prompt y especifica la tarea a realizar.

**Happy Coding!** 🚀
